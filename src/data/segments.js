/**
 * ORIGINAL Snail Mail segment + level importer.
 *
 * The original game builds each track by chaining hand-authored SEGMENT files
 * (a 10-wide ASCII grid where one row = a thin transverse slice of forward
 * road and the 8 interior columns = 8 lateral lanes). Levels list a POOL of
 * those segments plus a First/Last cap and a Random/Length build rule.
 *
 * This module decodes the baked grids (segmentData.json / levelSegments.json,
 * produced by tools/bakeSegments.mjs from extracted/SEGMENTS + extracted/LEVELS)
 * into the runtime contract used by the Track + EntityManager:
 *
 *   parseSegment(text) -> { name, rows, grid, length, gaps:[{at,len}], objects:[{type,s,x}] }
 *   getSegment(key)    -> parsed segment from the registry (cached)
 *   buildLevelLayout(meta) -> { length, gaps:[{at,len,construction}], entities:[{type,s,x,...}] }
 *
 * Coordinate decode (per the decoded SPEC):
 *   - rows read top->bottom = increasing forward distance; ROW_UNITS world
 *     units per row (calibrated ~2.5-3.0; we use 2.7).
 *   - the 10-char row is '@' + 8 lanes + '@'; interior column c (0..7) maps to
 *     lateral x = (c - 3.5)/3.5 * (halfWidth-1), so col 0 = far left, col 7 =
 *     far right, centred on x=0.
 */
import SEGMENT_DATA from './segmentData.json';
import LEVEL_SEGMENTS from './levelSegments.json';
import { rng } from '../utils.js';

export const ROW_UNITS = 2.7;        // world units per grid row (SPEC: tune 2.5-3.0)
export const GRID_COLS = 8;          // interior lanes
const LANE_HALF = (GRID_COLS - 1) / 2; // 3.5
export const X_EDGE = 5;             // lateral half-range we map columns into (halfWidth-1)

// Symbol -> meaning. entity types match EntityManager's valid set; geometry
// symbols (road/gap/path) drive gaps + length rather than spawning an entity.
//   kind: 'road' (drivable), 'gap' (no road), 'wall' (border), 'path' (spline,
//   still drivable footprint), 'entity' (spawns), 'flag' (row annotation)
// '_' is the road's lane-stripe surface (you drive on it, like the stripes in
// the original) — NOT a hole. Only true blank space is the abyss/gap.
const ROAD = new Set(['.', '#', '-', '_']);  // drivable surface chars
const GAP = new Set([' ']);                  // non-drivable void only
const PATH = new Set(['P', 'p']);           // curved-path control (drivable footprint)
const BOOST = new Set(['J', '(']);          // jump-pad / trampoline (drivable launch)

// The original encoded a 3D track shape per path segment as `Path=<Type>` (50+
// named curves: LoopTheLoop, HalfPipe, SCREW, Twister, Invert, Hill, Valley...).
// The exact curves lived in the engine; we reconstruct each by FAMILY: spline
// pitch/yaw shaping for loop/hill/valley/slalom, and tangent-roll for
// corkscrew/invert/halfpipe (reusing Track's existing roll system).
function pathTypeOf(seg) {
  for (const row of (seg.rows || [])) { const m = row.match(/Path=(\S+)/i); if (m) return m[1]; }
  return null;
}
function pathFamily(type) {
  if (!type) return 'flat';
  const t = type.toLowerCase();
  if (/loop/.test(t)) return 'loop';
  if (/halfpipe/.test(t)) return 'halfpipe';
  if (/screw|twister/.test(t)) return 'corkscrew';
  if (/invert|turnover|turnunder|cage/.test(t)) return 'invert';
  if (/hill|hump/.test(t)) return 'hill';
  if (/valley|dip|dump/.test(t)) return 'valley';
  if (/slalom|snake|sweep|wibble/.test(t)) return 'slalom';
  return 'flat';   // toad/supertramp/worm/warp/start/P0-2 → keep continuous road
}
/** Record a path segment as a spline feature or a roll feature. Deterministic
 *  (sign derived from `at`) so every client rebuilds the identical track. */
function addPathFeature(paths, rolls, fam, at, len) {
  const sign = (Math.floor(at / 7) % 2) ? 1 : -1;
  if (fam === 'corkscrew') rolls.push({ at, len, deg: sign * 360, cork: true });
  else if (fam === 'invert') rolls.push({ at, len, deg: 180, cork: false });
  else if (fam === 'halfpipe') rolls.push({ at, len, deg: sign * 52, cork: false });
  else if (fam === 'loop' || fam === 'hill' || fam === 'valley' || fam === 'slalom') paths.push({ at, len, family: fam });
}

// grid char -> entity type (null = not a spawnable entity)
function entityForChar(ch) {
  switch (ch) {
    case '0': case '1': case '2': case '3': return 'package';
    case 'M': return 'slug';                 // enemy snail -> shootable/knock-off slug
    case '[': return 'slug';                 // LOW confidence elite enemy -> slug
    case 's': return 'asteroid';             // shootable rock / garbage ball
    case '$': return 'heart';
    case '&': return 'salt';
    case '=': return 'turret';               // indestructible firing pillar
    case '|': return 'pillar';               // fence post / non-shootable barrier
    case '>': case '<': case 'R': return 'ring'; // resolved to white/yellow/red by Ring=
    case 'J': return 'jumppod';
    case '(': return 'jumppod';              // trampoline -> jump pod (passable boost)
    default: return null;
  }
}

/** Map interior column index 0..7 to lateral x in [-X_EDGE, X_EDGE]. */
export function colToX(col) {
  return ((col - LANE_HALF) / LANE_HALF) * X_EDGE;
}

/**
 * Resolve a ring glyph to a concrete entity type using the row's trailing
 * Ring= annotation (Powerup/Explode/Normal/Slow/None).
 */
function ringType(annotation) {
  const m = /Ring\s*=\s*([A-Za-z]+)/i.exec(annotation || '');
  const k = (m ? m[1] : 'Normal').toLowerCase();
  if (k.startsWith('explo')) return 'ringYellow';   // Explode/Explosive -> smart bomb
  if (k.startsWith('slow')) return 'ringRed';        // Slow -> slowdown trap
  if (k === 'none') return null;                     // decorative, no pickup
  return 'ringWhite';                                // Powerup / Normal -> weapon up
}

/**
 * Parse one segment's raw grid into { name, rows, grid, length, gaps, objects }.
 * `rows` is the array of raw text lines; `grid` is the 8-char interior of each.
 */
export function parseSegment(textOrParsed) {
  // accept either raw .TXT text or a baked { name, rows } record
  let name, rawRows;
  if (typeof textOrParsed === 'string') {
    const lines = textOrParsed.split(/\r?\n/);
    const nm = /Name:\s*'?([^'\r\n]*)'?/i.exec(textOrParsed);
    name = nm ? nm[1].trim() : 'Segment';
    const di = lines.findIndex((l) => /^Data:/i.test(l.trim()));
    rawRows = (di >= 0 ? lines.slice(di + 1) : lines).filter((l) => l.startsWith('@'));
  } else {
    name = textOrParsed.name || 'Segment';
    rawRows = textOrParsed.rows || [];
  }

  // drop the top + bottom '@@@@@@@@@@' caps from the BODY but keep their height
  const rows = rawRows;
  const grid = [];
  const annotations = [];
  for (const raw of rows) {
    // interior = columns 1..8 of the 10-char frame (chars after the left '@')
    const body = raw.length >= 10 ? raw.slice(1, 9) : raw.slice(1).padEnd(GRID_COLS, ' ').slice(0, GRID_COLS);
    grid.push(body);
    // trailing annotation = everything after the closing '@' (2nd wall)
    const close = raw.indexOf('@', 9);
    annotations.push(close >= 0 ? raw.slice(close + 1).trim() : raw.slice(10).trim());
  }

  const length = rows.length * ROW_UNITS;

  // --- classify each row as drivable or gap, and collect entities ---
  const objects = [];
  const rowIsGap = new Array(rows.length).fill(false);

  for (let r = 0; r < rows.length; r++) {
    const body = grid[r];
    const ann = annotations[r];
    const s = (r + 0.5) * ROW_UNITS;        // distance at the row's centre

    // is this a border cap row (all '@')? treat as solid road, no entities
    const isCap = /^@+$/.test(rows[r]) && rows[r].replace(/[^@]/g, '').length >= 10;

    let hasRoad = isCap;
    let hasGapCell = false;
    let hasBoost = false;
    let hasPath = false;
    let ringCells = 0;                       // a '>'/'<'/'R' row spans the road

    for (let c = 0; c < body.length; c++) {
      const ch = body[c];
      if (ROAD.has(ch)) { hasRoad = true; continue; }
      if (PATH.has(ch)) { hasPath = true; continue; }
      if (GAP.has(ch)) { hasGapCell = true; continue; }
      if (BOOST.has(ch)) hasBoost = true;
      if (ch === '@') { hasRoad = true; continue; }

      const type = entityForChar(ch);
      if (!type) continue;                  // {, }, *, P/p handled above, etc.
      const x = colToX(c);
      if (type === 'ring') {
        ringCells++;                        // collapse a full ring row into ONE ring below
      } else if (type === 'jumppod') {
        objects.push({ type: 'jumppod', s, x: 0 });
        hasBoost = true;
      } else if (type === 'pillar') {
        // grid pillars come only from '|' fence posts — tag them so a fence row
        // reads as a line of matching posts (not a random pillar field).
        objects.push({ type, s, x, fence: true });
      } else {
        objects.push({ type, s, x });
      }
    }

    // A ring row is one gate spanning the road: emit a single centred ring,
    // typed by the Ring= annotation on THIS row or the adjacent endcap row.
    if (ringCells > 0) {
      const rt = ringType(ann || annotations[r + 1] || annotations[r - 1] || '');
      if (rt) objects.push({ type: rt, s, x: 0 });
      hasRoad = true;                       // you ride through the ring on solid road
    }

    // A row counts as DRIVABLE if it has any road/path/boost surface. Pure
    // gap/void rows (only '_'/space, possibly with floating enemies) are holes.
    const drivable = hasRoad || hasPath || hasBoost;
    rowIsGap[r] = !drivable && hasGapCell;
  }

  // --- coalesce consecutive gap rows into gap ranges {at,len} ---
  const gaps = [];
  let run = -1;
  for (let r = 0; r <= rows.length; r++) {
    if (r < rows.length && rowIsGap[r]) { if (run < 0) run = r; continue; }
    if (run >= 0) {
      const at = run * ROW_UNITS;
      const len = (r - run) * ROW_UNITS;
      gaps.push({ at, len });
      run = -1;
    }
  }

  return { name, rows, grid, length, gaps, objects };
}

// ---------------------------------------------------------------------------
// Registry — parse + cache every baked segment, looked up by upper-case key.
// ---------------------------------------------------------------------------
const _cache = new Map();

export function getSegment(key) {
  const k = String(key).replace(/\.txt\s*$/i, '').trim().toUpperCase();
  if (_cache.has(k)) return _cache.get(k);
  const raw = SEGMENT_DATA[k];
  if (!raw) { _cache.set(k, null); return null; }
  const parsed = parseSegment(raw);
  _cache.set(k, parsed);
  return parsed;
}

export function hasSegment(key) {
  return !!SEGMENT_DATA[String(key).replace(/\.txt\s*$/i, '').trim().toUpperCase()];
}

/** Raw level-chain metadata baked from extracted/LEVELS/ARCADE*.TXT. */
export function levelSegmentMeta(idx) {
  return LEVEL_SEGMENTS[idx] ?? LEVEL_SEGMENTS[String(idx)] ?? null;
}

// ---------------------------------------------------------------------------
// Level layout — chain a level's segments into one ribbon worth of gaps +
// entities, honouring Random (sequential vs seeded shuffle) and Length.
// ---------------------------------------------------------------------------

/**
 * @param {object} meta runtime level descriptor; must carry `idx` (arcade
 *   index) plus `seed`. Falls back gracefully if the level has no baked chain.
 * @returns {{ length:number, gaps:Array, entities:Array }|null}
 */
export function buildLevelLayout(meta) {
  const chain = levelSegmentMeta(meta.idx);
  if (!chain) return null;

  const first = chain.first ? getSegment(chain.first) : null;
  const last = chain.last ? getSegment(chain.last) : null;
  const pool = chain.segments.map(getSegment).filter(Boolean);
  if (pool.length === 0 && !first && !last) return null;

  // Length budget: the engine chains body segments until cumulative forward
  // length reaches ~Length world units (First/Last live outside the budget).
  // Length:auto -> use the whole pool once. Length:<n> -> n world units.
  const lenField = chain.length;
  // Original "Length" is in the same forward-distance space as a row count
  // scaled by units-per-row. Pool heights sum to far more than 500 for big
  // levels, so a literal 500 would use only ~2 segments. We honour the SPEC's
  // calibration (Length ~= sum of segment row-heights * units-per-row) but also
  // guarantee enough chain to roughly hit the level's parcel target.
  let budget;
  if (lenField === 'auto' || lenField == null) budget = Infinity;
  else budget = Math.max(0, Number(lenField)) * ROW_UNITS;

  // Body segments.
  //  - Random:no  → the level IS its listed segments, in order, ONE pass. This
  //    is the authored track; do NOT length-cap it (that's what made every
  //    level the same length).
  //  - Random:yes → draw from the pool (seeded) until ~Length world units.
  let body;
  if (!chain.random) {
    body = pool.slice(); // listed order, once = the real authored level
  } else {
    body = [];
    const order = orderedPool(pool, true, meta.seed);
    let cursor = first ? first.length : 0;
    let i = 0;
    const cap = budget === Infinity ? Infinity : budget;
    while (body.length < 400) {
      if (cursor >= cap && body.length >= pool.length) break;
      if (budget === Infinity && i >= order.length) break;
      const seg = order[i % order.length];
      body.push(seg);
      cursor += seg.length;
      i++;
    }
  }

  // assemble: first + body + last, accumulating an offset per segment
  const segs = [];
  if (first) segs.push(first);
  segs.push(...body);
  if (last) segs.push(last);

  const gaps = [];
  const entities = [];
  const cells = [];          // per-row 8-char drivability map for grid-accurate geometry
  const paths = [];          // 3D spline features (loop/hill/valley/slalom)
  const rolls = [];          // tangent-roll features (corkscrew/invert/halfpipe)
  let offset = 0;
  for (const seg of segs) {
    const construction = /construction/i.test(seg.name);
    const grid = seg.grid || (seg.rows || []).map((r) => r.slice(1, 9).padEnd(GRID_COLS, ' '));
    // A segment with 'P' control rows is a 3D PATH/curve section (loop, half-
    // pipe, twister...). The blank rows in it are the air over that curve, NOT a
    // fall-gap. We reconstruct the 3D shape by FAMILY and keep the road footprint
    // continuous (suppress its "gaps"). Non-path segments keep their real gaps.
    const isPath = grid.some((row) => /[Pp]/.test(row));
    if (isPath) addPathFeature(paths, rolls, pathFamily(pathTypeOf(seg)), offset, seg.length);
    else for (const g of seg.gaps) gaps.push({ at: g.at + offset, len: g.len, construction });
    for (const o of seg.objects) entities.push({ type: o.type, s: o.s + offset, x: o.x, ...(o.fence ? { fence: true } : {}) });
    for (const row of grid) {
      let cell = row.padEnd(GRID_COLS, ' ').slice(0, GRID_COLS);
      // a '@@@@@@@@' border-cap row is a segment frame marker, not a wall in the
      // road — the road runs continuously through it.
      if (/^@+$/.test(cell)) cell = '.'.repeat(GRID_COLS);
      if (isPath) cell = cell.replace(/ /g, '.');     // path-curve air → continuous road
      cells.push(cell);
    }
    offset += seg.length;
  }
  return { length: offset, gaps, entities, cells, rowUnits: ROW_UNITS, paths, rolls };
}

/** True if a grid cell char is drivable road (anything but the void / wall). */
export function isDrivableCell(ch) { return ch !== ' ' && ch !== '@' && ch !== undefined; }

/** Assemble a list of named segments into a level layout (shared by tutorial). */
export function assembleSegments(names) {
  const segs = names.map(getSegment).filter(Boolean);
  const gaps = [], entities = [], cells = [];
  let offset = 0;
  for (const seg of segs) {
    const grid = seg.grid || (seg.rows || []).map((r) => r.slice(1, 9).padEnd(GRID_COLS, ' '));
    const isPath = grid.some((row) => /[Pp]/.test(row));
    if (!isPath) for (const g of seg.gaps) gaps.push({ at: g.at + offset, len: g.len });
    for (const o of seg.objects) entities.push({ type: o.type, s: o.s + offset, x: o.x, ...(o.fence ? { fence: true } : {}) });
    for (const row of grid) {
      let cell = row.padEnd(GRID_COLS, ' ').slice(0, GRID_COLS);
      if (/^@+$/.test(cell)) cell = '.'.repeat(GRID_COLS);
      if (isPath) cell = cell.replace(/ /g, '.');
      cells.push(cell);
    }
    offset += seg.length;
  }
  return { length: offset, gaps, entities, cells, rowUnits: ROW_UNITS };
}

/** The original guided Tutorial (TUTORIAL.TXT) chained from its segment list. */
export function buildTutorialLayout(tutorialSegments) {
  return assembleSegments(tutorialSegments);
}

function countPackages(seg) {
  if (!seg) return 0;
  let n = 0;
  for (const o of seg.objects) if (o.type === 'package') n++;
  return n;
}

/** Sequential (Random:no) keeps listed order; Random:yes seeded-shuffles. */
function orderedPool(pool, random, seed) {
  if (!random) return pool.slice();
  const arr = pool.slice();
  const rand = rng((seed ?? 1) * 131 + 7);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Level + galaxy structure, driven by the ORIGINAL game's per-level tuning
 * (parsed from the extracted LEVELS/*.TXT into arcadeLevels.json): forward
 * Speed, Parcels target, slug (Garbage) and Salt probabilities, the space
 * Background and Track visual theme.
 *
 * The 51 arcade levels are grouped into galaxies wherever the backdrop
 * changes, mirroring the original "Intergalactic Delivery Route" progression.
 *
 * Track GEOMETRY + obstacle/pickup PLACEMENT for Story/Arcade come from the
 * REAL hand-authored segment chains (src/data/segments.js, decoded from the
 * original SEGMENTS/*.TXT). The procedural generator is kept available for a
 * future "Endless" mode via proceduralTrackDef/proceduralEntities/proceduralLevel.
 */

import RAW from './arcadeLevels.json';
import { rng } from '../utils.js';
import { THEMES, themeForBackground } from './themes.js';
import { buildLevelLayout, buildTutorialLayout, X_EDGE } from './segments.js';
import TUTORIAL from './tutorial.json';

export const TUTORIAL_STEPS = TUTORIAL.steps;

/** The guided Tutorial level descriptor (its own mode). */
export function getTutorialLevel() {
  return {
    id: 'tutorial', idx: -1, name: 'Tutorial', galaxyIndex: 0, levelIndex: 0,
    difficulty: 0, speed: 22, parcels: 3, quota: 0, garbage: 0, salt: 0,
    background: 'SPACEGREENWARP', track: 0, length: TUTORIAL.totalLen,
    curviness: 0.18, hilliness: 0.12, gaps: 0, seed: 999, theme: 'meadow',
    isTutorial: true,
  };
}

// background name → galaxy display name (original-flavored but our own wording)
const GALAXY_NAMES = [
  'Rookie Run', 'The Violet Verge', 'Crimson Reach', 'Blueswhorl Belt',
  'Greenwarp Gardens', 'The Salt Wastes', 'Corkscrew Cluster', 'Director\'s Gauntlet',
  'The First Line',
];

/** Convert a raw arcade level into a runtime descriptor. */
function makeLevel(raw, galaxyIndex, levelIndex, globalIndex) {
  const difficulty = Math.min(1, raw.idx / 50);
  const lenNum = parseInt(raw.length, 10);
  const lengthUnits = (Number.isFinite(lenNum) ? 700 + lenNum * 1.4 : 1100) + raw.idx * 14;
  return {
    id: `g${galaxyIndex}-l${levelIndex}`,
    idx: raw.idx,
    name: `Route ${raw.idx + 1}`,
    galaxyIndex, levelIndex, globalIndex,
    difficulty,
    // original tuning
    speed: raw.speed,            // 20..100
    parcels: raw.parcels,        // collectible target
    quota: raw.quota,
    garbage: raw.garbage,        // slug probability 0..100
    salt: raw.salt,              // salt probability 0..100
    background: raw.background,
    track: raw.track,
    length: lengthUnits,
    curviness: 0.25 + difficulty * 0.7,
    hilliness: 0.2 + difficulty * 0.6,
    gaps: 1 + Math.floor(difficulty * 5),   // every track gets at least one jump
    seed: 1000 + raw.idx * 37,
    theme: themeKeyFor(raw.background),
  };
}

function themeKeyFor(background) {
  return themeForBackground(background);
}

/** Group consecutive same-background levels into galaxies. */
function buildGalaxies() {
  // skip ARCADE000 — it's a developer "Test" level, not a real route
  const sorted = [...RAW].filter((r) => r.idx !== 0).sort((a, b) => a.idx - b.idx);
  const groups = [];
  let cur = null;
  for (const r of sorted) {
    if (!cur || cur.bg !== r.background || cur.levels.length >= 8) {
      cur = { bg: r.background, levels: [] };
      groups.push(cur);
    }
    cur.levels.push(r);
  }
  // merge any tiny trailing group into the previous
  for (let i = groups.length - 1; i > 0; i--) {
    if (groups[i].levels.length < 3) {
      groups[i - 1].levels.push(...groups[i].levels);
      groups.splice(i, 1);
    }
  }

  let global = 0;
  return groups.map((g, gi) => {
    const levels = g.levels.map((r, li) => makeLevel(r, gi, li, global++));
    return {
      id: `galaxy-${gi}`,
      name: GALAXY_NAMES[gi] || `Galaxy ${gi + 1}`,
      index: gi,
      theme: themeKeyFor(g.bg),
      background: g.bg,
      levels,
    };
  });
}

export const GALAXIES = buildGalaxies();

export function allLevels() {
  const out = [];
  for (const g of GALAXIES) out.push(...g.levels);
  return out;
}

export function getLevel(galaxyIndex, levelIndex) {
  return GALAXIES[galaxyIndex]?.levels[levelIndex] ?? null;
}

export function levelByGlobal(i) { return allLevels()[i] ?? null; }

export function themeFor(level) { return THEMES[level.theme] || THEMES.cosmic; }

// ----------------------------------------------------------------------
// REAL segment-driven layout (Story / Arcade). The original level's chained
// segments decide WHERE the gaps are and WHERE every pickup/obstacle sits.
// We keep the smooth procedural 3D spline (the Rainbow-Road ribbon) but feed
// it the real gap positions + length, and place entities from the real grid.
// ----------------------------------------------------------------------

// Cache the decoded layout per level so trackDefForLevel + entitiesForLevel
// agree on the same length/gap positions (they're called separately).
const _layoutCache = new Map();
function layoutFor(level) {
  if (level.procedural) return null;   // procedural levels synthesise geometry, not from segments
  if (_layoutCache.has(level.id)) return _layoutCache.get(level.id);
  let layout = null;
  try { layout = level.isTutorial ? buildTutorialLayout(TUTORIAL.segments) : buildLevelLayout(level); } catch (e) { layout = null; }
  _layoutCache.set(level.id, layout);
  return layout;
}

function clamp01(lo, v, hi) { return Math.max(lo, Math.min(hi, v)); }

export function trackDefForLevel(level) {
  const layout = layoutFor(level);
  if (!layout || layout.length < 60) return proceduralTrackDef(level);

  const length = layout.length;
  const def = {
    seed: level.seed,
    length,
    // keep the curvy/hilly Rainbow-Road look; intensity still scales w/ difficulty
    curviness: level.curviness,
    hilliness: level.hilliness,
    halfWidth: 6,
    gaps: [],
    rolls: [],
    // grid-accurate road: per-row drivable cells from the real segment grids
    cells: layout.cells,
    rowUnits: layout.rowUnits,
  };

  // Carry the REAL gaps through, lightly merging touching ranges and clamping
  // any that overrun the (slightly recomputed) spline length.
  // keep the opening ~60 units gap-free so you never start on a jump-pad, and
  // ignore tiny single-cell holes (they were lane stripes, not real chasms).
  const raw = layout.gaps
    .filter((g) => g.at >= 60 && g.at + g.len <= length - 10 && g.len >= ROW_UNITS * 1.5)
    .sort((a, b) => a.at - b.at);
  for (const g of raw) {
    const prev = def.gaps[def.gaps.length - 1];
    if (prev && g.at <= prev.at + prev.len + 1.5) {
      prev.len = Math.max(prev.len, g.at + g.len - prev.at);
      prev.construction = prev.construction || g.construction;
    } else {
      def.gaps.push({ at: g.at, len: g.len, construction: !!g.construction });
    }
  }

  // Banked turns / corkscrews: still procedural dressing keyed off difficulty,
  // placed so they don't sit on top of a gap launch.
  const rand = rng(level.seed * 3 + 11);
  const nRolls = Math.floor(level.difficulty * 3);
  for (let i = 0; i < nRolls; i++) {
    const cork = level.difficulty > 0.75 && rand() < 0.28;
    const len = cork ? 200 + rand() * 140 : 70 + rand() * 70;
    const at = length * (0.2 + rand() * 0.5);
    const deg = cork
      ? (rand() < 0.5 ? 1 : -1) * (180 + rand() * 180)
      : (rand() < 0.5 ? 1 : -1) * (16 + rand() * 22);
    def.rolls.push({ at, len, deg, cork });
  }
  return def;
}

export function entitiesForLevel(level, track, mode = 'story') {
  const layout = layoutFor(level);
  if (!layout || layout.length < 60) return proceduralEntities(level, track, mode);

  const L = track.length;
  const HW = track.halfWidth - 1;
  const onSurface = (s) => track.hasSurface(s);
  const clampX = (x) => Math.max(-HW, Math.min(HW, x * (HW / X_EDGE)));

  const ents = [];
  // Grid enemy/hazard CELLS are potential spawns gated by the level's spawn
  // probabilities (Garbage = slugs, Salt = salt), so an easy level with
  // Garbage:10 doesn't spawn all ~60 grid M-cells at once. Deterministic.
  const erand = rng(level.seed * 11 + 3);
  const KEEP = {
    slug: clamp01(0.12, (level.garbage ?? 10) / 100 * 1.5, 0.9),
    salt: clamp01(0.12, (level.salt ?? 10) / 100 * 1.5, 0.9),
    turret: clamp01(0.2, 0.2 + level.difficulty * 0.45, 0.7),
    asteroid: clamp01(0.3, 0.3 + level.difficulty * 0.35, 0.85),
  };

  // --- real grid placements ---------------------------------------------
  // Pickups that land in a hole are nudged to the nearest surface so they're
  // collectable; floating enemies over a gap (Huge Gap etc.) stay put.
  const NUDGE_TO_SURFACE = new Set(['package', 'heart', 'ringWhite', 'ringYellow']);
  for (const o of layout.entities) {
    if (o.s < 6 || o.s > L - 12) continue;       // keep the entry/finish clear
    // density-gate enemies (but the tutorial shows everything it demos)
    if (!level.isTutorial && KEEP[o.type] !== undefined && erand() > KEEP[o.type]) continue;
    let s = o.s;
    if (NUDGE_TO_SURFACE.has(o.type) && !onSurface(s)) {
      let fixed = null;
      for (let d = 2; d <= 16; d += 2) {
        if (onSurface(s - d)) { fixed = s - d; break; }
        if (onSurface(s + d)) { fixed = s + d; break; }
      }
      if (fixed == null) continue;               // no nearby road: drop it
      s = fixed;
    }
    const def = { type: o.type, s, x: clampX(o.x) };
    if (o.type === 'slug') def.patrol = 0;
    if (o.type === 'turret') def.hp = 3 + Math.floor(level.difficulty * 2);
    if (o.type === 'asteroid') def.hp = 2;
    ents.push(def);
  }

  // --- guarantee every gap is passable: jump pod (or jetpack) before it ----
  for (const g of track.gaps) {
    const padS = Math.max(8, g.start - 5);
    if (g.construction) {
      ents.push({ type: 'jetpack', s: Math.max(8, g.start - 40), x: 0 });
    }
    // avoid stacking a second pod where the grid already placed a jump/tramp
    const near = ents.some((e) => e.type === 'jumppod' && Math.abs(e.s - padS) < 8);
    if (!near) ents.push({ type: 'jumppod', s: padS, x: 0 });
  }

  // --- ensure the level meets its parcel target (real grids occasionally
  // place fewer once the chain is length-capped); top up on clear road --------
  const target = level.parcels ?? 0;
  let pkgCount = ents.reduce((n, e) => n + (e.type === 'package' ? 1 : 0), 0);
  if (pkgCount < target) {
    const rand = rng(level.seed * 5 + 7);
    let s = 30;
    const endZone = L - 30;
    let guard = 0;
    while (pkgCount < target && s < endZone && guard++ < 2000) {
      if (onSurface(s) && onSurface(s - 4) && onSurface(s + 4)) {
        ents.push({ type: 'package', s, x: (rand() * 2 - 1) * HW * 0.7 });
        pkgCount++;
        s += 9 + rand() * 6;
      } else s += 5;
    }
  }

  // --- always end with the mail stop (finish gate) ------------------------
  ents.push({ type: 'mailstop', s: L - 8, x: 0 });
  return ents;
}

/** Build a one-off procedurally-generated level descriptor for a future
 * "Endless" mode. Pairs with proceduralTrackDef + proceduralEntities. */
export function proceduralLevel(opts = {}) {
  const idx = opts.idx ?? 0;
  const difficulty = Math.min(1, idx / 50);
  const seed = opts.seed ?? (1000 + idx * 37);
  return {
    id: opts.id ?? `endless-${idx}`,
    idx,
    name: opts.name ?? `Endless ${idx + 1}`,
    galaxyIndex: 0, levelIndex: idx, globalIndex: idx,
    difficulty,
    speed: opts.speed ?? (30 + difficulty * 60),
    parcels: opts.parcels ?? (10 + Math.floor(difficulty * 20)),
    quota: opts.quota ?? 0,
    garbage: opts.garbage ?? Math.floor(20 + difficulty * 50),
    salt: opts.salt ?? Math.floor(10 + difficulty * 40),
    background: opts.background ?? 'SpacePurple',
    track: opts.track ?? 0,
    length: opts.length ?? (1100 + idx * 80),
    curviness: 0.25 + difficulty * 0.7,
    hilliness: 0.2 + difficulty * 0.6,
    gaps: 1 + Math.floor(difficulty * 5),
    seed,
    theme: themeKeyFor(opts.background ?? 'SpacePurple'),
    procedural: true,
  };
}

// ----------------------------------------------------------------------
// Procedural generation (kept for a future "Endless" mode). These were the
// original trackDefForLevel/entitiesForLevel; they synthesise geometry +
// placement from difficulty rather than the authored segments.
// ----------------------------------------------------------------------

const ROW_UNITS = 2.7; // matches segments.js calibration for gap-merge gating

export function proceduralTrackDef(level) {
  const def = {
    seed: level.seed,
    length: level.length,
    curviness: level.curviness,
    hilliness: level.hilliness,
    halfWidth: 6,
    gaps: [],
    rolls: [],
  };
  const rand = rng(level.seed * 3 + 11);

  const nGaps = level.gaps ?? 0;
  if (nGaps > 0) {
    const startZone = level.length * 0.35;
    const span = level.length * 0.55;
    for (let i = 0; i < nGaps; i++) {
      const at = startZone + (span / nGaps) * (i + 0.3 + rand() * 0.4);
      const len = 7 + rand() * 6;
      def.gaps.push({ at, len, construction: rand() < 0.3 });
    }
  }

  // Banked turns are short; corkscrews twist much more gradually — spread a
  // ≤360° roll over a long stretch so they read as a sweeping spiral, not a
  // tight wring.
  const nRolls = Math.floor(level.difficulty * 3);
  for (let i = 0; i < nRolls; i++) {
    const cork = level.difficulty > 0.75 && rand() < 0.28;
    const len = cork ? 200 + rand() * 140 : 70 + rand() * 70;   // corkscrews 200–340u
    const at = level.length * (0.2 + rand() * 0.5);
    const deg = cork
      ? (rand() < 0.5 ? 1 : -1) * (180 + rand() * 180)           // ½–1 full turn over a long span
      : (rand() < 0.5 ? 1 : -1) * (16 + rand() * 22);            // gentle banks
    def.rolls.push({ at, len, deg, cork });
  }
  return def;
}

export function proceduralEntities(level, track, mode = 'story') {
  const rand = rng(level.seed * 5 + 7);
  const ents = [];
  const L = track.length;
  const HW = track.halfWidth - 1;
  const margin = (s) => !track.hasSurface(s) || !track.hasSurface(s + 5) || !track.hasSurface(s - 5);

  // Passability guard: dodge obstacles (pillars, salt, turrets, slugs) must
  // never wall off the road. Track placed solids and refuse any that would
  // close the last threadable corridor at its distance band.
  const solids = [];
  const BLOCK_R = 1.3;     // half-width a solid occupies, incl. player margin
  const CORRIDOR = 2.4;    // minimum clear lane the player can thread through
  const S_BAND = 6;        // solids within this s-distance share a band
  const fitsCorridor = (s, x) => {
    const near = solids.filter((o) => Math.abs(o.s - s) < S_BAND);
    if (!near.length) return true;
    const iv = near.concat([{ x }]).map((o) => [o.x - BLOCK_R, o.x + BLOCK_R]).sort((a, b) => a[0] - b[0]);
    let cursor = -HW, best = 0;
    for (const [lo, hi] of iv) { if (lo > cursor) best = Math.max(best, lo - cursor); cursor = Math.max(cursor, hi); }
    best = Math.max(best, HW - cursor);
    return best >= CORRIDOR;
  };
  const placeSolid = (def) => { solids.push({ s: def.s, x: def.x }); ents.push(def); };

  // ----- packages: exactly the level's parcel count, in readable runs -----
  const target = level.parcels;
  let placed = 0;
  let s = 40;
  const endZone = L - 34;
  // spacing chosen so the run roughly fits `target` parcels along the track
  const spacing = Math.max(7, (endZone - 40) / (target + 4));
  let patternState = 0;
  while (s < endZone && placed < target) {
    if (margin(s)) { s += 8; continue; }
    const pattern = Math.floor(rand() * 4);
    const runLen = Math.min(target - placed, 3 + Math.floor(rand() * 4));
    for (let i = 0; i < runLen && s < endZone; i++) {
      if (margin(s)) { s += 5; continue; }
      let x = 0;
      switch (pattern) {
        case 0: x = Math.sin((i / runLen) * Math.PI) * HW * 0.8 * (rand() > 0.5 ? 1 : -1); break;
        case 1: x = (i % 2 === 0 ? 1 : -1) * HW * 0.55; break;
        case 2: x = 0; break;
        case 3: x = (rand() > 0.5 ? 1 : -1) * HW * (0.7 + level.difficulty * 0.2); break;
      }
      ents.push({ type: 'package', s, x });
      placed++;
      s += spacing * 0.55;
    }
    s += spacing * (0.8 + rand() * 0.7);
  }

  // ----- jump pods + jetpacks at gaps -----
  for (const g of track.gaps) {
    if (g.construction) ents.push({ type: 'jetpack', s: Math.max(20, g.start - 40), x: 0 });
    else ents.push({ type: 'jumppod', s: g.start - 5, x: 0 });
  }

  // ----- enemies: density from real Garbage (slug) + Salt probabilities -----
  const slugP = level.garbage / 100;
  const saltP = level.salt / 100;
  const enemyCount = Math.floor((L / 90) * (0.5 + (slugP + saltP) * 1.4 + level.difficulty * 0.4));
  for (let i = 0; i < enemyCount; i++) {
    const hs = 70 + rand() * (L - 140);
    if (margin(hs)) continue;
    const r = rand();
    let type;
    const slugW = slugP, saltW = saltP, astW = 0.25, turW = 0.12 + level.difficulty * 0.15;
    const totalW = slugW + saltW + astW + turW;
    const pick = r * totalW;
    if (pick < slugW) type = 'slug';
    else if (pick < slugW + saltW) type = 'salt';
    else if (pick < slugW + saltW + astW) type = 'asteroid';
    else type = 'turret';
    const x = (rand() * 2 - 1) * HW;
    const def = { type, s: hs, x };
    if (type === 'slug') def.patrol = rand() < 0.5 ? 1 + rand() * (HW - 1) : 0;
    if (type === 'turret') def.hp = 3 + Math.floor(level.difficulty * 2);
    if (type === 'asteroid') def.hp = 2;
    if (!fitsCorridor(def.s, def.x)) continue;   // keep a threadable lane
    placeSolid(def);
  }

  // ----- pillars: non-shootable dodge obstacles in the path -----
  // The original PILLAR meshes stand in the road; you steer AROUND them (they
  // can't be shot). Density scales gently with difficulty.
  const pillarCount = Math.max(2, Math.floor((L / 130) * (0.6 + level.difficulty * 0.8)));
  for (let i = 0; i < pillarCount; i++) {
    const ps = 80 + rand() * (L - 160);
    if (margin(ps)) continue;
    // bias toward the sides so there's always a gap to thread
    const side = rand() < 0.5 ? -1 : 1;
    const x = side * HW * (0.35 + rand() * 0.6);
    if (!fitsCorridor(ps, x)) continue;
    placeSolid({ type: 'pillar', s: ps, x });
  }

  // ----- road signs: occasional dodge dressing on tougher routes -----
  const signCount = Math.floor(level.difficulty * 2);
  for (let i = 0; i < signCount; i++) {
    const ss = 100 + rand() * (L - 200);
    if (margin(ss)) continue;
    const sx = (rand() * 2 - 1) * HW * 0.7;
    if (!fitsCorridor(ss, sx)) continue;
    placeSolid({ type: 'sign', s: ss, x: sx });
  }

  // ----- weapon rings -----
  const ringCount = Math.max(2, Math.floor(L / 480));
  for (let i = 0; i < ringCount; i++) {
    const rs = 90 + (L - 180) * ((i + 0.5) / ringCount) + (rand() - 0.5) * 60;
    if (margin(rs)) continue;
    ents.push({ type: rand() < 0.18 ? 'ringYellow' : 'ringWhite', s: rs, x: (rand() * 2 - 1) * HW * 0.6 });
  }

  // ----- red slowdown ring traps -----
  const redCount = Math.floor(level.difficulty * 3);
  for (let i = 0; i < redCount; i++) {
    const rs = 120 + rand() * (L - 240);
    if (margin(rs)) continue;
    ents.push({ type: 'ringRed', s: rs, x: (rand() * 2 - 1) * HW });
  }

  // ----- hearts -----
  const heartCount = Math.max(1, Math.floor(L / 700) + (level.difficulty > 0.6 ? 1 : 0));
  for (let i = 0; i < heartCount; i++) {
    const hs = 150 + rand() * (L - 300);
    if (margin(hs)) continue;
    ents.push({ type: 'heart', s: hs, x: (rand() * 2 - 1) * HW * 0.5 });
  }

  ents.push({ type: 'mailstop', s: L - 8, x: 0 });
  return ents;
}

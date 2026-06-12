/**
 * Track: a flat striped ribbon road swept along a 3D spline, floating in
 * space — the "Rainbow Road" feel of the original Snail Mail highway.
 *
 * Geometry model
 * --------------
 * The path is a Catmull-Rom spline. At every arc-length position `s` we keep
 * a parallel-transport frame { pos, tangent, up, side } (twist-free), then
 * apply an optional per-`s` ROLL about the tangent so the ribbon can bank,
 * corkscrew and (in late worlds) loop.
 *
 * Gameplay rides in (s, x) coordinates where `x` is the signed lateral
 * offset across the ribbon, |x| <= halfWidth. A point on the road is
 *
 *     P(s, x) = pos(s) + side(s) * x
 *
 * The surface normal is `up(s)`. There are no guard rails: steering past the
 * edge (|x| > halfWidth) drops you off into space.
 *
 * Gaps: ranges of `s` with no road. The mesh skips them; physics asks
 * `hasSurface(s)`.
 */

import * as THREE from 'three';
import { rng, clamp, lerp } from '../utils.js';
import { assets } from '../assets.js';

const SAMPLE_STEP = 1.0;     // frame sample spacing along s
const RING_STEP = 2.0;       // mesh ring spacing along s
const LANE_LINES = 4;        // painted lane divisions

// Recovered loop geometry (tools/re/curve_formulas.json, emulated LOOPTHELOOP):
// the vertical circle has radius ~5.88 so its apex sits ~11.76 above grade
// (apex == 2*radius). The circle is a FIXED size centred in the loop segment;
// the rest of the segment is straight lead-in/out — exactly as the original
// (7 lead-in points + circle + 7 lead-out). Apex height is therefore independent
// of how long the authored loop segment grid is.
const LOOP_RADIUS = 5.88;          // recovered vertical-loop radius (apex ~11.76)
const LOOP_BOW = 2.5;              // recovered lateral X drift across the loop (±2.5)

// grid lane geometry (matches segments.js colToX: 8 lanes across ±5)
const GRID_COLS = 8;
const GRID_X_EDGE = 5;
const GRID_LANE_HALF = (GRID_COLS - 1) / 2;          // 3.5
const GRID_CELL_HALF = GRID_X_EDGE / GRID_LANE_HALF / 2; // half a lane's x-width
function gridColToX(c) { return ((c - GRID_LANE_HALF) / GRID_LANE_HALF) * GRID_X_EDGE; }
function gridXToCol(x) { return Math.round((x / GRID_X_EDGE) * GRID_LANE_HALF + GRID_LANE_HALF); }

// ------------------------------------------------------------------
// Smooth parametric shaping kernels (u in 0..1 through a feature).
//
// The original encoded each curve with sin-table parametric evaluators; these
// are their kink-free analogues. The key property for every authored feature is
// C1 continuity at the feature boundaries: BOTH the offset value AND its rate of
// change must vanish at u=0 and u=1 so the shaped spline meets the procedural
// baseline with no corner (a "kink") at entry/exit.
const PI = Math.PI;
const TWO_PI = 2 * Math.PI;
// 5th-order smoothstep: 0->1 monotone with zero 1st & 2nd derivative at both
// ends. Used to ramp a value in cleanly (loop revolution, continuous roll).
function smootherStep(u) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return u * u * u * (u * (u * 6 - 15) + 10);
}
// Single-lobe bump: 0 at the ends, +1 at the centre, flat (zero rate) at both
// ends. Used for half-pipe / invert there-and-back banking and the loop's
// lateral bow. sin^2(pi*u) == (1 - cos(2*pi*u))/2.
function smoothBump(u) {
  const s = Math.sin(PI * u);
  return s * s;
}
// Raised-cosine bump in canonical form: 0 at the ends, +1 at the centre, with
// zero VALUE and zero RATE at both ends. This is the original's recovered hill /
// valley vertical profile, (0.5 - 0.5*cos(2*pi*u)) == sin^2(pi*u) == smoothBump.
const raisedCos = smoothBump;
// Triangular taper window (the recovered slalom window): 1 at the centre, ramps
// linearly to 0 at both ends. Multiplying a whole-cycle sine by this gives the
// original's windowed weave whose offset vanishes at the boundaries. (The sine
// already provides a zero crossing with bounded slope at the ends, so the
// product meets the baseline without a position kink.)
function triWindow(u) {
  return 1 - Math.abs(2 * u - 1);
}
// Windowed sine weave with the recovered TRIANGULAR window (slalom / corkscrew
// lateral helix). `cycles` whole sine cycles across the feature; the triangular
// taper drives the offset to zero at u=0,1 so the shaped centerline rejoins the
// baseline. Net integral over whole cycles is ~zero (no lateral drift).
function windowedSine(u, cycles = 1) {
  return Math.sin(cycles * TWO_PI * u) * triWindow(u);
}

export class Track {
  /**
   * @param {object} def
   *   length      — track length in world units
   *   seed        — RNG seed for path shape
   *   curviness   — 0..1 horizontal turn intensity
   *   hilliness   — 0..1 vertical variation
   *   halfWidth   — half the ribbon width (default 6.5)
   *   gaps        — [{ at, len }]
   *   rolls       — [{ at, len, deg }] banked/corkscrew segments
   *   loops       — [{ at }] full vertical loop centers (advanced worlds)
   */
  constructor(def) {
    this.def = def;
    this.halfWidth = def.halfWidth ?? 6.5;
    this.gaps = (def.gaps ?? []).map(g => ({ start: g.at, end: g.at + g.len }));
    this.rolls = def.rolls ?? [];

    // grid-accurate road: per-row 8-char drivability map from the real segments
    this.cells = def.cells ?? null;
    this.rowUnits = def.rowUnits ?? 2.7;

    this._buildPath(def);
    this._buildFrames(def);
  }

  /** Is the cell at (s, x) drivable road? Grid levels use the real cell map;
   *  procedural levels fall back to the full-width gap ranges. */
  _cellDrivable(s, x) {
    if (!this.cells) return true;
    const row = Math.floor(s / this.rowUnits);
    if (row < 0 || row >= this.cells.length) return true; // entry/exit caps
    const col = gridXToCol(x);
    if (col < 0 || col > GRID_COLS - 1) return false;     // off the 8 lanes
    const ch = this.cells[row][col];
    return ch !== ' ' && ch !== '@' && ch !== undefined;
  }

  // ------------------------------------------------------------------
  // Path + frames
  // ------------------------------------------------------------------

  _buildPath(def) {
    const rand = rng(def.seed ?? 1);
    const length = def.length ?? 1200;
    const curv = def.curviness ?? 0.5;
    const hill = def.hilliness ?? 0.4;
    const paths = def.paths ?? [];

    // 1) Coarse baseline route — the gentle procedural curve (unchanged feel).
    const stepLen = 34;
    const nC = Math.ceil(length / stepLen) + 3;
    let pos = new THREE.Vector3(0, 0, 0);
    let yaw = 0, pitch = 0;
    const basePts = [pos.clone()];
    for (let i = 0; i < nC; i++) {
      yaw += (rand() - 0.5) * curv * 1.2; yaw *= 0.9;
      pitch += (rand() - 0.5) * hill * 0.7; pitch = clamp(pitch * 0.88, -0.5, 0.5);
      const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      pos = pos.clone().addScaledVector(dir, stepLen);
      basePts.push(pos.clone());
    }
    const baseCurve = new THREE.CatmullRomCurve3(basePts, false, 'centripetal', 0.5);
    baseCurve.arcLengthDivisions = basePts.length * 24;
    const baseLen = baseCurve.getLength();

    // No authored 3D features → use the baseline directly (flat + procedural).
    if (!paths.length) { this.curve = baseCurve; this.length = baseLen; return; }

    // 2) Fine walk that bends the spline into the REVERSE-ENGINEERED exact 3D
    // shapes within each path range (tools/re/curve_formulas.json). The original
    // factories write control-point POSITION directly, so here every non-loop
    // family is applied as a DIRECT centerline offset measured in the baseline's
    // own frame (lateral along `side`, vertical along `up`) — not as a yaw/pitch
    // integration. The walk still advances the baseline tangent by a fixed `step`
    // each iteration, so the TOTAL arc length is preserved (the grid road /
    // entities placed at s = row*rowUnits stay aligned). A LOOP is the one shape
    // that genuinely inverts and doubles back, so it alone rotates the heading
    // through a full vertical circle, consuming arc as a circle instead of a
    // forward run — exactly as the recovered LOOPTHELOOP does.
    const step = 3.0;
    const nF = Math.max(2, Math.ceil(baseLen / step));
    const pts = [];
    const cur = baseCurve.getPointAt(0).clone();   // integrated baseline position
    pts.push(cur.clone());
    const tmp = new THREE.Vector3();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3();
    const upv = new THREE.Vector3();
    let loopPitch = 0;                              // accumulated loop revolution (radians)
    for (let i = 1; i <= nF; i++) {
      const s = i * step;
      const u0 = Math.min(s / baseLen, 1);
      const tan = baseCurve.getTangentAt(u0, tmp).normalize();
      const by = Math.atan2(tan.x, -tan.z);         // baseline yaw
      const bp = Math.asin(clamp(tan.y, -1, 1));    // baseline pitch
      // baseline frame: side = horizontal perpendicular, up = frame up
      side.set(Math.cos(by), 0, Math.sin(by));      // right of travel (horizontal)
      upv.crossVectors(side, tan).normalize();      // up perpendicular to tangent
      if (upv.lengthSq() < 1e-6) upv.copy(worldUp);

      const pf = paths.find((p) => s >= p.at && s < p.at + p.len);
      let offX = 0, offY = 0;                        // direct lateral / vertical offset
      let pitchAdd = 0;                              // extra heading pitch (loop only)
      if (pf) {
        const u = (s - pf.at) / pf.len;             // 0..1 through the feature
        const amp = pf.amp ?? 0, cycles = pf.cycles ?? 1, dir = pf.dir ?? 1;
        if (pf.family === 'loop') {
          // Recovered vertical loop: a FIXED-radius circle (apex ~2*radius ~11.76)
          // centred in the segment, straight lead-in/out around it. We rotate the
          // heading by 2*pi across just the circle's arc (length 2*pi*R) so the
          // road rises, inverts and returns to grade; the rest of the feature is
          // straight. LOOPOUT (dir=-1) rotates the other way to dip BELOW grade.
          // Radius is shrunk only if the segment is too short to hold a full loop.
          let R = LOOP_RADIUS;
          const circLen = TWO_PI * R;
          if (circLen > pf.len * 0.92) { R = (pf.len * 0.92) / TWO_PI; }
          const cl = TWO_PI * R;                     // actual circle arc length
          const c0 = pf.at + (pf.len - cl) / 2;      // circle window (centred)
          const c1 = c0 + cl;
          if (s > c0 && s <= c1) loopPitch += dir * (TWO_PI / cl) * step;
          else if (s > c1) loopPitch = Math.round(loopPitch / TWO_PI) * TWO_PI; // snap to clean revolution (no residual tilt)
          pitchAdd = loopPitch;
          // Lateral bow ±LOOP_BOW: the recovered X drift (-2.5..+2.5) that keeps
          // the loop from self-intersecting. Linear across the circle, tapered at
          // the feature ends so the centerline meets the baseline (C1).
          const bow = (clamp((s - c0) / cl, 0, 1) * 2 - 1) * LOOP_BOW;
          offX = bow * smoothBump(u);
        } else if (pf.family === 'hill') {
          // Raised-cosine vertical bump: Y += (0.5-0.5cos2piu)*amp, returns to grade.
          offY = raisedCos(u) * amp;
        } else if (pf.family === 'valley') {
          // Negated bump: a dip.
          offY = -raisedCos(u) * amp;
        } else if (pf.family === 'slalom') {
          // Direct lateral weave: amp*sin(cycles*2piu) windowed (triangular taper).
          offX = amp * windowedSine(u, cycles);
        } else if (pf.family === 'corkscrew') {
          // Lateral helix offset (the spin itself is a runtime roll). Small windowed
          // oscillation so the centerline returns to grade at the ends (C1).
          offX = amp * windowedSine(u, cycles);
        } else if (pf.family === 'invert') {
          // Vertical arc (TURNOVER ~4.7 up, TURNUNDER under); the inversion is the
          // runtime roll. A single raised-cosine arc so it returns to grade.
          offY = dir * raisedCos(u) * amp;
        }
      }
      // advance the integrated baseline position by one step of heading
      const hy = by;
      const hp = bp + pitchAdd;
      const dir3 = new THREE.Vector3(
        Math.sin(hy) * Math.cos(hp), Math.sin(hp), -Math.cos(hy) * Math.cos(hp));
      cur.addScaledVector(dir3, step);
      // store the baseline position plus the direct perpendicular offset
      const p = cur.clone().addScaledVector(side, offX).addScaledVector(upv, offY);
      pts.push(p);
    }
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    this.curve.arcLengthDivisions = pts.length * 12;
    this.length = this.curve.getLength();
  }

  /** Roll angle (radians) applied at arc length s — sum of banked segments.
   *  Both roll modes are C1-continuous at the segment boundaries (the roll rate
   *  eases from/to zero at the ends) so the banking never snaps on or off:
   *   - cork=true  → a CONTINUOUS twist that ramps a full `deg` of roll across
   *     the feature via a 5th-order smoothstep (corkscrews / inverts that spin
   *     the road over and back upright when deg is a multiple of 360).
   *   - cork=false → a there-and-back BANK: rolls in to `deg` at the midpoint and
   *     settles smoothly back to flat (half-pipes, banked turns, 180° turnovers
   *     that return upright). */
  _rollAt(s) {
    let roll = 0;
    for (const r of this.rolls) {
      const end = r.at + r.len;
      if (s <= r.at || s >= end) continue;
      const u = (s - r.at) / r.len;          // 0..1 across the segment
      const deg = THREE.MathUtils.degToRad(r.deg);
      if (r.cork) roll += deg * smootherStep(u); // continuous twist, eased ends
      else roll += deg * smoothBump(u);          // bank in to deg, settle to flat
    }
    return roll;
  }

  _buildFrames(def) {
    const count = Math.ceil(this.length / SAMPLE_STEP) + 1;
    this.frames = new Array(count);
    this._frameStep = this.length / (count - 1);

    let up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const u = i / (count - 1);
      const s = u * this.length;
      const pos = this.curve.getPointAt(u);
      const tangent = this.curve.getTangentAt(u).normalize();
      // parallel transport keeps the frame twist-free along the curve
      up = up.clone().addScaledVector(tangent, -up.dot(tangent)).normalize();
      if (up.lengthSq() < 1e-6) up = new THREE.Vector3(0, 1, 0);
      let side = new THREE.Vector3().crossVectors(tangent, up).normalize();

      // apply authored roll about the tangent
      const roll = this._rollAt(s);
      if (roll !== 0) {
        const q = new THREE.Quaternion().setFromAxisAngle(tangent, roll);
        up = up.clone().applyQuaternion(q).normalize();
        side = side.clone().applyQuaternion(q).normalize();
      }
      this.frames[i] = { pos, tangent, up, side };
    }
  }

  /** Interpolated frame at arc length s (clamped). */
  frameAt(s) {
    s = clamp(s, 0, this.length);
    const f = s / this._frameStep;
    const i = Math.min(Math.floor(f), this.frames.length - 2);
    const t = f - i;
    const a = this.frames[i], b = this.frames[i + 1];
    const pos = a.pos.clone().lerp(b.pos, t);
    const tangent = a.tangent.clone().lerp(b.tangent, t).normalize();
    const up = a.up.clone().lerp(b.up, t).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const trueUp = new THREE.Vector3().crossVectors(side, tangent).normalize();
    return { pos, tangent, up: trueUp, side };
  }

  /** World position on the ribbon at (s, x). */
  surfacePoint(s, x, out = new THREE.Vector3()) {
    const fr = this.frameAt(s);
    return out.copy(fr.pos).addScaledVector(fr.side, x);
  }

  /** Surface normal (up) at s. */
  surfaceNormal(s, out = new THREE.Vector3()) {
    return out.copy(this.frameAt(s).up);
  }

  hasSurface(s, x = 0) {
    if (this.cells) return this._cellDrivable(s, x);
    for (const g of this.gaps) if (s >= g.start && s <= g.end) return false;
    return true;
  }

  /** Lateral drivable extent {min,max} at distance s — the line the side
   *  barriers (slipstream walls) sit on. Returns null when the road is fully
   *  absent across the row (a gap you must jump). The original keeps you ON the
   *  track via these walls; you only fall at gaps. */
  drivableExtent(s) {
    if (this.cells) {
      const row = Math.floor(s / this.rowUnits);
      if (row < 0 || row >= this.cells.length) return { min: -GRID_X_EDGE, max: GRID_X_EDGE };
      let lo = null, hi = null;
      for (let c = 0; c < GRID_COLS; c++) {
        const ch = this.cells[row][c];
        if (ch !== ' ' && ch !== '@' && ch !== undefined) { const x = gridColToX(c); if (lo === null) lo = x; hi = x; }
      }
      return lo === null ? null : { min: lo, max: hi };
    }
    for (const g of this.gaps) if (s >= g.start && s <= g.end) return null;
    return { min: -this.halfWidth + 0.6, max: this.halfWidth - 0.6 };
  }

  /** Where the SIDE BARRIERS (slipstream walls) sit and which sides are OPEN.
   *  A barrier exists on a side only where the road reaches its true edge (the
   *  grid '@' wall); where the road instead falls away into the void (a ledge or
   *  hole), that side is OPEN — no wall — so you can ride off and fall there.
   *  Returns { min, max, minOpen, maxOpen } (min/max = drivable edge x), or null
   *  when the whole row is void (a full gap you must jump). */
  barrierExtent(s) {
    if (this.cells) {
      const row = Math.floor(s / this.rowUnits);
      if (row < 0 || row >= this.cells.length) return { min: -GRID_X_EDGE, max: GRID_X_EDGE, minOpen: false, maxOpen: false };
      let lo = -1, hi = -1;
      for (let c = 0; c < GRID_COLS; c++) {
        const ch = this.cells[row][c];
        if (ch !== ' ' && ch !== '@' && ch !== undefined) { if (lo < 0) lo = c; hi = c; }
      }
      if (lo < 0) return null;                          // full gap
      return {
        min: gridColToX(lo), max: gridColToX(hi),
        minOpen: lo > 0,                 // road doesn't reach the left edge → drop on the left
        maxOpen: hi < GRID_COLS - 1,     // road doesn't reach the right edge → drop on the right
      };
    }
    for (const g of this.gaps) if (s >= g.start && s <= g.end) return null;
    return { min: -this.halfWidth + 0.6, max: this.halfWidth - 0.6, minOpen: false, maxOpen: false };
  }

  nextGap(s) {
    let best = Infinity;
    for (const g of this.gaps) if (g.start > s) best = Math.min(best, g.start - s);
    return best;
  }

  /** Gap covering s (or null) — used to size jump arcs. */
  gapAt(s) {
    for (const g of this.gaps) if (s >= g.start && s <= g.end) return g;
    return null;
  }

  // ------------------------------------------------------------------
  // Mesh
  // ------------------------------------------------------------------

  /**
   * Build the visible ribbon. `theme` supplies colors:
   *   { surface, surfaceEdge, stripe, rail, glow }
   */
  buildMesh(theme) {
    const group = new THREE.Group();
    // grid levels: build the road from the real per-cell grid (chicanes,
    // narrowing, holes and gaps come straight from the source). Procedural
    // levels use the continuous ribbon.
    const road = this.cells ? this._buildGridRoad(theme) : this._buildRibbon(theme);
    this._roadMat = road.material;          // kept for the endless-mode colour drift
    group.add(road);
    const apron = this._buildStartApron();   // lead-in behind start + run-out past finish
    if (apron) group.add(apron);
    const slide = this._buildSlideEdges(theme);   // original yellow/red chevron road edge
    if (slide) group.add(slide);
    group.add(this._buildEdges(theme));
    const warnings = this._buildGapWarnings(theme);
    if (warnings) group.add(warnings);
    return group;
  }

  /** Endless mode: wash the road colour through a hue cycle so a long run keeps
   *  changing. `phase` in [0,1) is one rotation; subtle so the track still reads. */
  setEndlessDrift(phase) {
    if (!this._roadMat || !this._roadMat.color) return;
    const p = ((phase % 1) + 1) % 1;
    this._roadMat.color.setHSL(p, 0.30, 0.78);
  }

  /**
   * Red/yellow striped WARNING decals painted flat on the drivable road in the
   * last stretch leading up to each gap, so a hole reads from a distance. One
   * thin quad strip per gap, swept along the track frames (so it follows
   * curves/banks) and clamped to the drivable lateral extent at each ring. The
   * TRACKWARN texture tiles along the length (its stripes run across the road).
   */
  _buildGapWarnings(theme) {
    if (!this.gaps.length) return null;
    const LEAD = 7;     // length of the warning patch before the gap (world units)
    const STEP = 1.0;   // ring spacing along s
    const LIFT = 0.04;  // tiny hover above the road to avoid z-fighting
    const positions = [], normals = [], uvs = [], indices = [];
    let v = 0;
    for (const g of this.gaps) {
      const s0 = Math.max(0, g.start - LEAD);
      const s1 = g.start;
      if (s1 - s0 < 0.5) continue;
      const nRings = Math.max(2, Math.ceil((s1 - s0) / STEP) + 1);
      let prevHad = false, prevBase = 0;
      for (let i = 0; i < nRings; i++) {
        const s = lerp(s0, s1, i / (nRings - 1));
        const ext = this.drivableExtent(s);
        if (!ext) { prevHad = false; continue; } // no road this ring (shouldn't happen pre-gap)
        const fr = this.frameAt(s);
        // a touch inside the drivable edges so the stripe sits ON the road
        const xL = ext.min + 0.3, xR = ext.max - 0.3;
        if (xR - xL < 0.5) { prevHad = false; continue; }
        const pL = fr.pos.clone().addScaledVector(fr.side, xL).addScaledVector(fr.up, LIFT);
        const pR = fr.pos.clone().addScaledVector(fr.side, xR).addScaledVector(fr.up, LIFT);
        const base = v;
        positions.push(pL.x, pL.y, pL.z, pR.x, pR.y, pR.z);
        normals.push(fr.up.x, fr.up.y, fr.up.z, fr.up.x, fr.up.y, fr.up.z);
        // u spans road width once; v tiles the stripes along s (stripes run across)
        const vCoord = (s - s0) * 0.5;
        uvs.push(0, vCoord, 1, vCoord);
        if (prevHad) {
          indices.push(prevBase, base, prevBase + 1, prevBase + 1, base, base + 1);
        }
        prevHad = true; prevBase = base;
        v += 2;
      }
    }
    if (!positions.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    const tex = assets.texture('OBJECTS/WORLD00/TRACKWARN', { wrap: true });
    const mat = new THREE.MeshLambertMaterial({
      map: tex, side: THREE.DoubleSide,
      emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.35,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    return new THREE.Mesh(geo, mat);
  }

  /** Road built quad-per-drivable-cell from the real segment grid. */
  _buildGridRoad(theme) {
    const cells = this.cells, rowUnits = this.rowUnits, hw = this.halfWidth;
    const positions = [], normals = [], uvs = [], indices = [];
    let v = 0;
    for (let r = 0; r < cells.length; r++) {
      const s0 = r * rowUnits, s1 = Math.min((r + 1) * rowUnits, this.length);
      const fr0 = this.frameAt(s0), fr1 = this.frameAt(s1);
      for (let c = 0; c < GRID_COLS; c++) {
        const ch = cells[r][c];
        if (ch === ' ' || ch === '@' || ch === undefined) continue; // void/wall → no road
        const xL = gridColToX(c) - GRID_CELL_HALF, xR = gridColToX(c) + GRID_CELL_HALF;
        const p00 = fr0.pos.clone().addScaledVector(fr0.side, xL);
        const p01 = fr0.pos.clone().addScaledVector(fr0.side, xR);
        const p10 = fr1.pos.clone().addScaledVector(fr1.side, xL);
        const p11 = fr1.pos.clone().addScaledVector(fr1.side, xR);
        positions.push(p00.x, p00.y, p00.z, p01.x, p01.y, p01.z, p10.x, p10.y, p10.z, p11.x, p11.y, p11.z);
        normals.push(fr0.up.x, fr0.up.y, fr0.up.z, fr0.up.x, fr0.up.y, fr0.up.z,
          fr1.up.x, fr1.up.y, fr1.up.z, fr1.up.x, fr1.up.y, fr1.up.z);
        const uL = (xL + hw) / (2 * hw), uR = (xR + hw) / (2 * hw);
        uvs.push(uL, s0 * 0.05, uR, s0 * 0.05, uL, s1 * 0.05, uR, s1 * 0.05);
        indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
        v += 4;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    let mat;
    if (theme.trackTex) {
      const tex = assets.texture(theme.trackTex, { wrap: true });
      tex.repeat.set(1, 1);
      // Self-illuminate the road with its OWN texture (emissiveMap) so the main
      // pathway stays bright and EVENLY lit as it banks/curves — tilted normals
      // were leaving it dark versus the flat start apron (which shares this mat).
      mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, emissiveMap: tex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.55 });
    } else {
      mat = new THREE.MeshLambertMaterial({ color: theme.surface, side: THREE.DoubleSide, emissive: new THREE.Color(theme.surface), emissiveIntensity: 0.4 });
    }
    return new THREE.Mesh(geo, mat);
  }

  _buildRibbon(theme) {
    const CROSS = 12; // across-ribbon subdivisions
    const rings = [];
    for (let s = 0; s <= this.length; s += RING_STEP) rings.push(s);
    if (rings[rings.length - 1] < this.length) rings.push(this.length);

    const positions = [], normals = [], colors = [], uvs = [], indices = [];
    const surfCol = new THREE.Color(theme.surface);
    const edgeCol = new THREE.Color(theme.surfaceEdge);
    const stripeCol = new THREE.Color(theme.stripe ?? theme.surfaceEdge);
    const laneCol = new THREE.Color(theme.lane ?? theme.stripe ?? theme.surfaceEdge);

    const ringVertexStart = [];
    let vcount = 0;

    for (let r = 0; r < rings.length; r++) {
      const s = rings[r];
      ringVertexStart[r] = vcount;
      const fr = this.frameAt(s);
      for (let c = 0; c <= CROSS; c++) {
        const t = c / CROSS;            // 0..1 across
        const x = lerp(-this.halfWidth, this.halfWidth, t);
        const p = fr.pos.clone().addScaledVector(fr.side, x);
        positions.push(p.x, p.y, p.z);
        normals.push(fr.up.x, fr.up.y, fr.up.z);
        // v is world-scaled (one 256px tile per 20 units) and u spans the road
        // width 0..1 once — identical density to the grid road's UVs.
        uvs.push(t, s * 0.05);

        // base color, darker toward edges
        const edgeness = Math.pow(Math.abs(x) / this.halfWidth, 3);
        const col = surfCol.clone().lerp(edgeCol, edgeness);

        // dashed center line
        if (Math.abs(x) < 0.5 && Math.floor(s / 6) % 2 === 0) col.copy(stripeCol);
        // painted lane dividers
        for (let L = 1; L < LANE_LINES; L++) {
          const lanePos = -this.halfWidth + (this.halfWidth * 2 / LANE_LINES) * L;
          if (Math.abs(x - lanePos) < 0.28 && Math.floor(s / 5) % 2 === 0) col.lerp(laneCol, 0.7);
        }
        // bright edge trim
        if (Math.abs(x) / this.halfWidth > 0.9) col.copy(edgeCol).lerp(new THREE.Color(theme.rail), 0.5);

        colors.push(col.r, col.g, col.b);
        vcount++;
      }
    }

    for (let r = 0; r < rings.length - 1; r++) {
      const sMid = (rings[r] + rings[r + 1]) / 2;
      if (!this.hasSurface(sMid)) continue;
      const a0 = ringVertexStart[r], b0 = ringVertexStart[r + 1];
      for (let c = 0; c < CROSS; c++) {
        indices.push(a0 + c, b0 + c, a0 + c + 1);
        indices.push(a0 + c + 1, b0 + c, b0 + c + 1);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);

    // With an original road texture, render the procedural ribbon exactly like
    // the grid road (Track._buildGridRoad): the tiling is baked into the UV
    // (v = s*0.05), so repeat stays (1,1). NOTE: assets.texture() returns one
    // shared cached THREE.Texture per path — both road types MUST keep repeat
    // (1,1) or they clobber each other. Otherwise fall back to vertex colours.
    let mat;
    if (theme.trackTex) {
      const tex = assets.texture(theme.trackTex, { wrap: true });
      tex.repeat.set(1, 1);
      mat = new THREE.MeshLambertMaterial({
        map: tex, side: THREE.DoubleSide,
        emissiveMap: tex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.55,
      });
    } else {
      mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    }
    return new THREE.Mesh(geo, mat);
  }

  /** Glowing trim tubes running along both edges of the ribbon. */
  /** Flat road apron extending BEHIND the start and PAST the finish so Turbo
   *  doesn't appear to hang off the track edge at level start (and a run-out
   *  reads at the end). Purely visual: straight extrapolation from the end frames
   *  along their tangent, textured like the road. */
  _buildStartApron() {
    if (!this._roadMat) return null;
    const group = new THREE.Group();
    const APRON = 36, STEP = 4;
    const hw = this.cells ? GRID_X_EDGE : (this.halfWidth - 0.4);
    const strip = (s0, sign) => {
      const fr = this.frameAt(s0);
      const positions = [], uvs = [], indices = [];
      for (let i = 0; i <= APRON; i += STEP) {
        const c = fr.pos.clone().addScaledVector(fr.tangent, sign * i).addScaledVector(fr.up, -0.02);
        const L = c.clone().addScaledVector(fr.side, -hw);
        const R = c.clone().addScaledVector(fr.side, hw);
        const bi = positions.length / 3;
        positions.push(L.x, L.y, L.z, R.x, R.y, R.z);
        const v = (s0 + sign * i) * 0.05;
        uvs.push(0, v, 1, v);
        if (i > 0) indices.push(bi - 2, bi - 1, bi, bi - 1, bi + 1, bi);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, this._roadMat);
    };
    group.add(strip(0, -1));            // lead-in behind the start
    group.add(strip(this.length, 1));   // run-out past the finish
    return group;
  }

  /** The original yellow/red chevron road-EDGE texture (Slide0..3): a band along
   *  each drivable edge, textured with the level's slide skin, so the road reads
   *  with the original's hazard-chevron edges. Follows the per-row drivable extent
   *  and breaks at gaps. Self-illuminated like the road so it stays bright. */
  _buildSlideEdges(theme) {
    if (!theme.slideTex) return null;
    const tex = assets.texture(theme.slideTex, { wrap: true });
    const mat = new THREE.MeshLambertMaterial({
      map: tex, side: THREE.DoubleSide,
      emissiveMap: tex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.5,
    });
    const group = new THREE.Group();
    const EW = 1.1;            // width of the chevron edge band
    for (const which of ['min', 'max']) {
      const positions = [], uvs = [], indices = [];
      let prev = false;
      for (let s = 0; s <= this.length; s += RING_STEP) {
        const ext = this.drivableExtent(s);
        if (!ext) { prev = false; continue; }
        const fr = this.frameAt(s);
        const edge = which === 'min' ? ext.min : ext.max;
        const inner = which === 'min' ? edge + EW : edge - EW;
        const pe = fr.pos.clone().addScaledVector(fr.side, edge).addScaledVector(fr.up, 0.02);
        const pi = fr.pos.clone().addScaledVector(fr.side, inner).addScaledVector(fr.up, 0.02);
        const bi = positions.length / 3;
        positions.push(pi.x, pi.y, pi.z, pe.x, pe.y, pe.z);
        const v = s * 0.2;     // chevrons repeat along the edge
        uvs.push(v, 0, v, 1);
        if (prev) indices.push(bi - 2, bi - 1, bi, bi - 1, bi + 1, bi);
        prev = true;
      }
      if (positions.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        group.add(new THREE.Mesh(geo, mat));
      }
    }
    return group;
  }

  _buildEdges(theme) {
    const group = new THREE.Group();
    const railMat = new THREE.MeshBasicMaterial({ color: theme.rail });
    // Original BARRIER side-rail texture on the slipstream walls. The walls hug
    // the road's TRUE edge and BREAK at every drop — full gaps AND the open side
    // of a ledge (where the road falls away) — so you can ride off the edge and
    // fall there instead of being channelled cleanly around the hole.
    const barrierTex = assets.texture('OBJECTS/BARRIER/BARRIER', { wrap: true });
    // ADDITIVE so the barrier reads as a glowing blue slipstream wall: the
    // texture's black areas add nothing (clear), the lit areas glow blue. (Normal
    // blending showed the texture's black background as solid black bars.)
    const wallMat = new THREE.MeshBasicMaterial({
      map: barrierTex, color: 0x6ab4ff, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const WALL_H = 1.15;
    for (const which of ['min', 'max']) {
      let pts = [];
      const positions = [], uvs = [], indices = [];
      const flushTube = () => {
        if (pts.length > 1) {
          const curve = new THREE.CatmullRomCurve3(pts);
          const geo = new THREE.TubeGeometry(curve, Math.max(8, pts.length * 2), 0.14, 5, false);
          group.add(new THREE.Mesh(geo, railMat));
        }
        pts = [];
      };
      let prev = false;
      for (let s = 0; s <= this.length; s += RING_STEP * 2) {
        const ext = this.barrierExtent(s);
        // break the barrier at a full gap OR on the open (drop) side of a ledge
        const open = !ext || (which === 'min' ? ext.minOpen : ext.maxOpen);
        if (open) { flushTube(); prev = false; continue; }
        const fr = this.frameAt(s);
        const ex = which === 'min' ? ext.min : ext.max;
        const base = fr.pos.clone().addScaledVector(fr.side, ex);
        const top = base.clone().addScaledVector(fr.up, WALL_H);
        pts.push(top.clone());
        const bi = positions.length / 3;
        const u = s * 0.12;
        positions.push(base.x, base.y, base.z, top.x, top.y, top.z);
        uvs.push(u, 0, u, 1);
        if (prev) indices.push(bi - 2, bi - 1, bi, bi - 1, bi + 1, bi);
        prev = true;
      }
      flushTube();
      if (positions.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        group.add(new THREE.Mesh(geo, wallMat));
      }
    }
    return group;
  }
}

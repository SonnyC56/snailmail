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

// grid lane geometry (matches segments.js colToX: 8 lanes across ±5)
const GRID_COLS = 8;
const GRID_X_EDGE = 5;
const GRID_LANE_HALF = (GRID_COLS - 1) / 2;          // 3.5
const GRID_CELL_HALF = GRID_X_EDGE / GRID_LANE_HALF / 2; // half a lane's x-width
function gridColToX(c) { return ((c - GRID_LANE_HALF) / GRID_LANE_HALF) * GRID_X_EDGE; }
function gridXToCol(x) { return Math.round((x / GRID_X_EDGE) * GRID_LANE_HALF + GRID_LANE_HALF); }

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
    const pts = [];
    const stepLen = 34;
    const n = Math.ceil((def.length ?? 1200) / stepLen) + 3;

    let pos = new THREE.Vector3(0, 0, 0);
    let yaw = 0;
    let pitch = 0;
    const curv = def.curviness ?? 0.5;
    const hill = def.hilliness ?? 0.4;

    pts.push(pos.clone());
    for (let i = 0; i < n; i++) {
      yaw += (rand() - 0.5) * curv * 1.2;
      yaw *= 0.9;  // relax back toward forward so the road keeps progressing
      pitch += (rand() - 0.5) * hill * 0.7;
      pitch = clamp(pitch * 0.88, -0.5, 0.5);

      const dir = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch),
      );
      pos = pos.clone().addScaledVector(dir, stepLen);
      pts.push(pos.clone());
    }

    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    this.curve.arcLengthDivisions = pts.length * 24;
    this.length = this.curve.getLength();
  }

  /** Roll angle (radians) applied at arc length s — sum of banked segments. */
  _rollAt(s) {
    let roll = 0;
    for (const r of this.rolls) {
      const end = r.at + r.len;
      if (s <= r.at || s >= end) continue;
      const u = (s - r.at) / r.len;          // 0..1 across the segment
      const env = Math.sin(u * Math.PI);     // ease in/out, 0 at the ends
      if (r.cork) roll += THREE.MathUtils.degToRad(r.deg) * u; // continuous twist
      else roll += THREE.MathUtils.degToRad(r.deg) * env;       // bank and return
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
    group.add(this.cells ? this._buildGridRoad(theme) : this._buildRibbon(theme));
    group.add(this._buildEdges(theme));
    return group;
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
      mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, emissive: new THREE.Color(theme.surface), emissiveIntensity: 0.16 });
    } else {
      mat = new THREE.MeshLambertMaterial({ color: theme.surface, side: THREE.DoubleSide });
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
        emissive: new THREE.Color(theme.surface), emissiveIntensity: 0.16,
      });
    } else {
      mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    }
    return new THREE.Mesh(geo, mat);
  }

  /** Glowing trim tubes running along both edges of the ribbon. */
  _buildEdges(theme) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: theme.rail });
    for (const sign of [-1, 1]) {
      let pts = [];
      const flush = () => {
        if (pts.length > 1) {
          const curve = new THREE.CatmullRomCurve3(pts);
          const geo = new THREE.TubeGeometry(curve, Math.max(8, pts.length * 2), 0.18, 5, false);
          group.add(new THREE.Mesh(geo, mat));
        }
        pts = [];
      };
      for (let s = 0; s <= this.length; s += RING_STEP * 2) {
        if (!this.hasSurface(s)) { flush(); continue; }
        pts.push(this.surfacePoint(s, sign * this.halfWidth));
      }
      flush();
    }
    return group;
  }
}

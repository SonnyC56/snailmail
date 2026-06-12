/**
 * Track entities for the ribbon racer, in (s, x) coordinates.
 *
 * Collectibles : package, heart, ringWhite (weapon up), ringYellow (smart
 *                bomb), jetpack
 * Hazard rings : ringRed (slows you down — avoid)
 * Enemies      : slug (one-hit knock-off; shootable), turret (fires lasers;
 *                shootable), asteroid (damages+slows; shootable)
 * Hazards      : salt (damages meter; cannot be shot — dodge)
 * Specials     : jumppod (trampoline over gaps), mailstop (finish gate)
 *
 * All models are original procedural primitive builds.
 */

import * as THREE from 'three';
import { clamp } from '../utils.js';
import { assets } from '../assets.js';
import { xloader } from '../track/xloader.js';

// Original .X2 meshes that replace procedural builds (async-loaded + swapped).
//   scale: world-unit scale ; lift: extra height ; spin: keep rotating
//   The original PILLARs are ~8 tall (Y -1..7.3) and widen PILLAR1→PILLAR8;
//   scaled down here so they read as track-height dodge obstacles. We rotate
//   pillar/sign variants in per-entity (see PILLAR_VARIANTS / SIGN meshes)
//   so the same 'pillar' type can show different original art.
const ORIGINAL_MESH = {
  salt:     { dir: 'X', name: 'SALT', scale: 1.7, lift: 0 },
  jumppod:  { dir: 'X', name: 'TRAMP', scale: 1.3, lift: 0.05 },
  mailstop: { dir: 'X', name: 'POSTOFFICESTOP', scale: 1.5, lift: 5.5 },
  // 'pillar' is a non-shootable obstacle; the mesh is chosen per-entity from
  // PILLAR_VARIANTS (PILLAR1..8) so the path has variety.
  pillar:   { dir: 'X', name: 'PILLAR3', scale: 0.8, lift: 0 },
  // turrets/walls that fire lasers — non-breakable, must be dodged (bigger)
  turret:   { dir: 'X', name: 'PILLAR6', scale: 0.85, lift: 0 },
  // NB: the shootable blue obstacle is a floating spiky ball (buildAsteroid),
  // NOT the salt crystal mesh — see buildAsteroid.
  // original road signs as set dressing / hazard variants
  sign:     { dir: 'X', name: 'SIGNSTOP', scale: 0.9, lift: 0.7 },
  // The original CONSTRUCTION sign (X/SIGNCONSTRUCTION.X2 + .TGA) is a flat
  // billboard ~12 units tall — way too big for the road — so scale it way down
  // to road size. Placed by levels.js just before each construction gap as a
  // "road closed ahead, deploy jetpack" warning. Non-shootable set dressing
  // (no hitbox / collision) so it never blocks the run; it's a visual cue.
  signConstruction: { dir: 'X', name: 'SIGNCONSTRUCTION', scale: 0.2, lift: 0 },
};

// the original pillar meshes, narrow → wide; cycled for variety
const PILLAR_VARIANTS = ['PILLAR1', 'PILLAR2', 'PILLAR3', 'PILLAR4', 'PILLAR5', 'PILLAR6', 'PILLAR7', 'PILLAR8'];
// the original sign meshes (texture per-mesh); cycled for the 'sign' type.
// SIGNCONSTRUCTION is ~13 units tall in the original — too big for a road
// obstacle — so the dodge-able signs use the smaller plates only.
const SIGN_VARIANTS = ['SIGNSTOP', 'SIGNBANG', 'SIGNSTRIPE'];

// Entities that render as original-art billboards instead of procedural meshes.
//   tex: logical texture path(s) (multiple = animation frames)
//   size: [width, height] in world units; anchored so the base sits on track
const SPRITE_DEFS = {
  package:  { tex: ['SPRITES/PARCEL000'], size: [2.2, 2.2] },
  slug:     { tex: ['SPRITES/SLUG000', 'SPRITES/SLUG001'], size: [3.6, 3.6], fps: 4 },
  jetpack:  { tex: ['SPRITES/JETPACK000'], size: [1.8, 1.8] },
  // shootable blue spiky ball = the original "Garbage" sprite (4 frames),
  // floating above the track
  asteroid: { tex: ['SPRITES/GARBAGEA', 'SPRITES/GARBAGEB', 'SPRITES/GARBAGEC', 'SPRITES/GARBAGED'], size: [2.6, 2.6], fps: 6, floatH: 1.4 },
  // heart pickup = the original HEALTH sprite
  heart:    { tex: ['SPRITES/HEALTH'], size: [1.8, 1.8] },
};

function buildSprite(def) {
  const tex = def.tex.map((t) => assets.texture(t));
  const mat = new THREE.SpriteMaterial({ map: tex[0], transparent: true, alphaTest: 0.25, depthWrite: true });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(def.size[0], def.size[1], 1);
  spr.userData.frames = tex;
  return spr;
}

function mat(color, opts = {}) { return new THREE.MeshLambertMaterial({ color, ...opts }); }
function basic(color, opts = {}) { return new THREE.MeshBasicMaterial({ color, ...opts }); }

// ----------------------------------------------------------------------
// Model factories
// ----------------------------------------------------------------------

function buildPackage() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), mat(0xd98c4a));
  g.add(box);
  for (const axis of ['x', 'z']) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? 0.84 : 0.18, 0.74, axis === 'z' ? 0.84 : 0.18), mat(0xe04040));
    g.add(band);
  }
  // bow on top
  for (const sx of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12), mat(0xffd24d));
    loop.position.set(sx * 0.15, 0.42, 0);
    loop.rotation.y = Math.PI / 2;
    g.add(loop);
  }
  g.userData.spin = true;
  return g;
}

function buildHeart() {
  const g = new THREE.Group();
  const m = mat(0xff5577, { emissive: 0x661122, emissiveIntensity: 0.4 });
  for (const sx of [-1, 1]) {
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), m);
    lobe.position.set(sx * 0.18, 0.18, 0);
    g.add(lobe);
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.5, 12), m);
  tip.rotation.x = Math.PI;
  tip.position.y = -0.22;
  g.add(tip);
  g.userData.bob = true;
  return g;
}

function buildRing(color) {
  // A RING OF STARS (the original upgrade ring is a circle of stars, not a
  // solid hoop). Original STARSILVER sprite, tinted per ring type, arranged in
  // a circle in the plane perpendicular to travel so you fly THROUGH the centre.
  const g = new THREE.Group();
  const ring = new THREE.Group();   // children[0] — the spinning star circle
  const N = 14, R = 0.95;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const star = new THREE.Sprite(new THREE.SpriteMaterial({
      map: assets.texture('SPRITES/STARSILVER'), color,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    star.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    star.scale.set(0.5, 0.5, 1);
    ring.add(star);
  }
  ring.position.y = 0.7;            // straddle the road
  g.add(ring);
  g.userData.spinRing = true;       // ring (star circle) is children[0]
  return g;
}

function buildJetpack() {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8), mat(0x55cc66));
    tank.position.set(sx * 0.2, 0.3, 0);
    g.add(tank);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 8), basic(0x66ccff));
  flame.rotation.x = Math.PI;
  flame.position.y = -0.1;
  g.add(flame);
  g.userData.bob = true;
  return g;
}

function buildSlug() {
  const g = new THREE.Group();
  const bodyM = mat(0x9a4ecf);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.0, 6, 10), bodyM);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1, 1, 0.72);
  body.position.y = 0.32;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), bodyM);
  head.position.set(0, 0.46, -0.55);
  g.add(head);
  // spiked collar
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 6, 14), mat(0x333344));
  collar.position.set(0, 0.42, -0.2);
  collar.rotation.x = Math.PI / 2;
  g.add(collar);
  for (let i = 0; i < 8; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), mat(0xcccccc));
    const a = (i / 8) * Math.PI * 2;
    spike.position.set(Math.cos(a) * 0.34, 0.42, -0.2 + Math.sin(a) * 0.34);
    spike.lookAt(spike.position.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a))));
    spike.rotateX(Math.PI / 2);
    g.add(spike);
  }
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0xffe9f2));
    eye.position.set(sx * 0.15, 0.62, -0.7);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), mat(0x251530));
    pupil.position.set(sx * 0.15, 0.62, -0.78);
    g.add(pupil);
  }
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.06), mat(0x4a2070));
  brow.position.set(0, 0.74, -0.72);
  g.add(brow);
  g.userData.wobble = true;
  return g;
}

function buildTurret() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.5, 10), mat(0x556070));
  base.position.y = 0.25;
  g.add(base);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6a7686));
  dome.position.y = 0.5;
  g.add(dome);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 8), mat(0x333a44));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.6, -0.5);
  g.add(barrel);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), basic(0xff4444));
  eye.position.set(0, 0.62, -0.2);
  g.add(eye);
  g.userData.turret = true;     // eye is children[3]; refs don't survive clone()
  return g;
}

function buildAsteroid() {
  // The original's blue shootable obstacle is a FLOATING SPIKY BALL (a blue
  // sea-urchin / star-burst), distinct from the angular green salt crystals.
  const g = new THREE.Group();
  const blue = mat(0x3aa6ff, { emissive: 0x1a5ad8, emissiveIntensity: 0.55 });
  const tip = mat(0x9fe0ff, { emissive: 0x4a8fff, emissiveIntensity: 0.5 });

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), blue);
  g.add(core);

  // spikes radiating out along the 12 icosahedron vertex directions
  const t = (1 + Math.sqrt(5)) / 2;
  const dirs = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
    [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  const up = new THREE.Vector3(0, 1, 0);
  for (const d of dirs) {
    const dir = new THREE.Vector3(d[0], d[1], d[2]).normalize();
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.6, 5), Math.random() < 0.5 ? blue : tip);
    spike.position.copy(dir).multiplyScalar(0.62);
    spike.quaternion.setFromUnitVectors(up, dir);
    g.add(spike);
  }
  g.position.y = 0.55;       // hovers above the track
  g.userData.spin = true;    // slow tumble
  g.userData.bobBall = true; // gentle float (handled in update)
  return g;
}

function buildSalt() {
  const g = new THREE.Group();
  const m = mat(0xf4f6ff, { emissive: 0x223344, emissiveIntensity: 0.15 });
  const spikes = [[0,0.42,1.0,0],[0.32,0.3,0.65,0.3],[-0.3,0.28,0.7,-0.25],[0.05,0.25,0.5,0.15],[-0.15,0.27,0.55,-0.1]];
  for (const [x, r, h, rot] of spikes) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), m);
    cone.position.set(x, h / 2, rot * 1.5);
    cone.rotation.z = rot;
    g.add(cone);
  }
  return g;
}

function buildPillar() {
  // procedural fallback for the original PILLAR mesh: a chunky striped post
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 3.0, 10), mat(0xc8b89a));
  post.position.y = 1.4;
  g.add(post);
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.32, 10), mat(0xe04040));
    band.position.y = 0.6 + i * 1.0;
    g.add(band);
  }
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xb09878));
  cap.position.y = 2.9;
  g.add(cap);
  return g;
}

function buildSign() {
  // procedural fallback for original SIGN meshes: a plate on a post
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8), mat(0x888888));
  pole.position.y = 0.9;
  g.add(pole);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.1), mat(0xe04040, { emissive: 0x441111, emissiveIntensity: 0.3 }));
  plate.position.y = 1.9;
  g.add(plate);
  return g;
}

function buildSignConstruction() {
  // procedural fallback (shown until the original X/SIGNCONSTRUCTION.X2 streams
  // in): a yellow diamond CONSTRUCTION warning plate on a post.
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 8), mat(0x777777));
  pole.position.y = 0.8;
  g.add(pole);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.08), mat(0xffb000, { emissive: 0x553300, emissiveIntensity: 0.35 }));
  plate.position.y = 1.8;
  plate.rotation.z = Math.PI / 4;   // diamond orientation
  g.add(plate);
  return g;
}

function buildJumpPod() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.3, 18), mat(0x39e639, { emissive: 0x186618, emissiveIntensity: 0.5 }));
  ring.position.y = 0.15;
  g.add(ring);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.18, 18), basic(0x9dffb0, { transparent: true, opacity: 0.7 }));
  pad.position.y = 0.3;
  g.add(pad);
  // up-arrows
  for (let i = 0; i < 3; i++) {
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.4, 4), basic(0xffffff, { transparent: true, opacity: 0.8 }));
    arrow.position.set(0, 0.4 + i * 0.0, -0.6 + i * 0.6);
    g.add(arrow);
  }
  g.userData.pulse = true;
  return g;
}

// A low ramp wedge (rises toward the gap; forward = local -Z) — the gentle
// segment-end launcher, visually distinct from the green TRAMP trampoline so a
// "roll up and over" ramp doesn't read as a jump pad.
function buildRamp() {
  const g = new THREE.Group();
  const W = 1.6;            // half width (road-like)
  const LEN = 1.8;          // SHORTER than before (was 2.4)
  const HI = 0.62;
  const N = 6;              // subdivisions for the curved profile
  const back = LEN / 2, front = -LEN / 2;   // forward = local -Z
  // Height rises with u^2 so the ramp is gentle at its base and STEEPER toward
  // the launch end. Surface uses the original ROAD texture so it reads as the
  // road kicking up, not a grey wedge.
  const heightAt = (u) => 0.03 + HI * (u * u);
  const tex = assets.texture('OBJECTS/WORLD00/TRACK0', { wrap: true });
  const surfMat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, z = back - u * LEN, y = heightAt(u);
    const bi = pos.length / 3;
    pos.push(-W, y, z, W, y, z);
    uv.push(0, u, 1, u);
    if (i > 0) idx.push(bi - 2, bi - 1, bi, bi - 1, bi + 1, bi);
  }
  const surf = new THREE.BufferGeometry();
  surf.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  surf.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  surf.setIndex(idx); surf.computeVertexNormals();
  g.add(new THREE.Mesh(surf, surfMat));
  // dark side fills following the curved profile so it reads solid from the side
  const sideMat = mat(0x44505e, { side: THREE.DoubleSide });
  for (const sx of [-W, W]) {
    const sp = [], si = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, z = back - u * LEN;
      const bi = sp.length / 3;
      sp.push(sx, 0.0, z, sx, heightAt(u), z);
      if (i > 0) si.push(bi - 2, bi - 1, bi, bi - 1, bi + 1, bi);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setIndex(si); sg.computeVertexNormals();
    g.add(new THREE.Mesh(sg, sideMat));
  }
  // yellow leading lip at the steep front edge ("launch here")
  const lip = new THREE.Mesh(new THREE.BoxGeometry(2 * W + 0.08, 0.12, 0.14), basic(0xffd24d));
  lip.position.set(0, heightAt(1), front);
  g.add(lip);
  return g;
}

function buildMailStop() {
  const g = new THREE.Group();
  const post = mat(0xd9534f);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.5, 8, 26, Math.PI), post);
  arc.position.y = 0.4;
  g.add(arc);
  // checkered banner squares
  const size = 0.7;
  for (let i = 0; i < 18; i++) {
    if (i % 2 === 0) continue;
    const ang = (i / 17) * Math.PI;
    const sq = new THREE.Mesh(new THREE.PlaneGeometry(size, size), basic(0x111111, { side: THREE.DoubleSide }));
    sq.position.set(-Math.cos(ang) * 7.2, 0.4 + Math.sin(ang) * 7.2, 0);
    g.add(sq);
  }
  // little mailbox on top
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.6), mat(0x3d92e0));
  box.position.set(0, 7.6, 0);
  g.add(box);
  const lidTop = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.6, 12, 1, false, 0, Math.PI), mat(0x3d92e0));
  lidTop.rotation.z = Math.PI / 2;
  lidTop.position.set(0, 8.0, 0);
  g.add(lidTop);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.4), mat(0xe04040));
  flag.position.set(0.65, 7.9, 0.3);
  g.add(flag);
  return g;
}

const FACTORIES = {
  package: buildPackage,
  heart: buildHeart,
  ringWhite: () => buildRing(0xffffff),
  ringYellow: () => buildRing(0xffd24d),
  ringRed: () => buildRing(0xe04040),
  jetpack: buildJetpack,
  slug: buildSlug,
  turret: buildTurret,
  asteroid: buildAsteroid,
  salt: buildSalt,
  pillar: buildPillar,
  sign: buildSign,
  signConstruction: buildSignConstruction,
  jumppod: buildJumpPod,
  ramp: buildRamp,
  mailstop: buildMailStop,
};

// hitbox half-extents: [alongS, lateralX, clearHeight] (player.h above which it's cleared)
const HITBOX = {
  package:    [1.1, 1.2, 99],
  heart:      [1.1, 1.2, 99],
  ringWhite:  [1.1, 1.3, 99],
  ringYellow: [1.1, 1.3, 99],
  ringRed:    [1.0, 1.1, 1.6],
  jetpack:    [1.1, 1.3, 99],
  slug:       [1.1, 1.0, 1.4],
  turret:     [1.2, 1.1, 2.2],
  asteroid:   [1.1, 1.1, 1.6],
  salt:       [1.0, 1.0, 1.2],
  pillar:     [1.0, 0.9, 2.4],   // tall post: only cleared by jetpack/launch height
  sign:       [0.8, 1.0, 1.8],
  // CONSTRUCTION warning sign: decorative roadside cue (no collision case in
  // _collide, so touching it does nothing). Hitbox present only so the collide
  // guard has dimensions to read.
  signConstruction: [0.8, 1.0, 1.8],
  jumppod:    [1.6, 1.4, 0.6],
  ramp:       [1.8, 1.7, 0.5],
  mailstop:   [1.5, 99, 99],
};

// turrets/pillars are NOT shootable — they're obstacles you must dodge
const SHOOTABLE = new Set(['slug', 'asteroid']);
const FLOATERS = new Set(['package', 'heart', 'ringWhite', 'ringYellow', 'ringRed', 'jetpack']);

// ----------------------------------------------------------------------
// Manager
// ----------------------------------------------------------------------

export class EntityManager {
  /**
   * @param defs [{ type, s, x?, h?, patrol?, hp? }]
   */
  constructor(track, scene, defs) {
    this.track = track;
    this.scene = scene;
    this.entities = [];
    this._protos = {};

    for (const d of defs) {
      const spriteDef = SPRITE_DEFS[d.type];
      const mesh = spriteDef ? buildSprite(spriteDef) : this._proto(d.type).clone(true);
      const h = d.h ?? (FLOATERS.has(d.type) ? 1.1 : 0);
      const e = {
        type: d.type,
        s: d.s, x: d.x ?? 0, h,
        baseX: d.x ?? 0,
        patrol: d.patrol ?? 0,
        mesh,
        isSprite: !!spriteDef,
        // floatH lifts the sprite center (floating garbage); otherwise anchor
        // the sprite base to the track
        spriteLift: spriteDef ? (spriteDef.floatH ?? spriteDef.size[1] / 2) : 0,
        spriteFps: spriteDef?.fps ?? 0,
        frames: spriteDef ? mesh.userData.frames : null,
        alive: true,
        cooldown: 0,
        shootable: SHOOTABLE.has(d.type),
        hp: d.hp ?? (d.type === 'turret' ? 3 : d.type === 'asteroid' ? 2 : 1),
        fireTimer: d.type === 'turret' ? 1 + (d.s % 2) : 0,
        phase: (d.s * 7.3) % (Math.PI * 2),
        // direct child refs (userData object refs don't survive clone())
        ring: d.type.startsWith('ring') ? mesh.children[0] : null,
        eye: d.type === 'turret' ? mesh.children[3] : null,
      };
      this._place(e);
      scene.add(mesh);
      this.entities.push(e);
      const orig = ORIGINAL_MESH[d.type];
      if (orig) {
        // pillars/signs vary their mesh per-entity for path variety; fence
        // posts use one consistent narrow post so a fence reads as a fence.
        let spec = orig;
        if (d.type === 'pillar') spec = d.fence
          ? { ...orig, name: 'PILLAR1', scale: 0.7 }
          : { ...orig, name: PILLAR_VARIANTS[Math.floor(Math.abs(d.s * 0.37)) % PILLAR_VARIANTS.length] };
        else if (d.type === 'sign') spec = { ...orig, name: SIGN_VARIANTS[Math.floor(Math.abs(d.s * 0.29)) % SIGN_VARIANTS.length] };
        this._swapOriginalMesh(e, spec);
      }
    }
    this.entities.sort((a, b) => a.s - b.s);

    // callbacks
    this.onCollect = null;
    this.onHazard = null;
    this.onTurretFire = null;
    this.onJumpPod = null;
    this.onRamp = null;
    this.onMailStop = null;
  }

  _proto(type) { if (!this._protos[type]) this._protos[type] = FACTORIES[type](); return this._protos[type]; }

  /** Async-load an original .X2 mesh and swap it in for the placeholder. */
  async _swapOriginalMesh(e, spec) {
    try {
      let m;
      if (spec.tint) {
        // reuse the original mesh GEOMETRY but with a tinted crystal material
        // (e.g. the salt crystal cluster recoloured blue for the shootable rock)
        const geo = await xloader.geometry(spec.dir, spec.name);
        m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
          color: spec.tint, emissive: spec.emissive ?? spec.tint, emissiveIntensity: 0.45,
          transparent: true, opacity: 0.92, side: THREE.DoubleSide,
        }));
      } else {
        m = await xloader.mesh(spec.dir, spec.name);
      }
      if (!e.alive && e.type !== 'mailstop') return; // collected before it loaded
      m.scale.setScalar(spec.scale);
      const wrap = new THREE.Group();
      wrap.add(m);
      if (e.mesh && e.mesh.parent) this.scene.remove(e.mesh);
      e.mesh = wrap;
      e.isSprite = false;
      e.spriteLift = (e.spriteLift || 0) + (spec.lift || 0);
      e.eye = null; e.ring = null;
      this.scene.add(wrap);
      if (!e.alive) wrap.visible = false;
      this._place(e);
    } catch (err) {
      // keep the procedural placeholder if the mesh fails to load
    }
  }

  _place(e) {
    const fr = this.track.frameAt(e.s);
    const pos = this.track.surfacePoint(e.s, e.x).addScaledVector(fr.up, e.h + (e.spriteLift || 0));
    e.mesh.position.copy(pos);
    if (e.isSprite) return; // billboards always face the camera; no orientation
    const right = new THREE.Vector3().crossVectors(fr.tangent, fr.up).normalize();
    const fwd = new THREE.Vector3().crossVectors(fr.up, right).normalize();
    const m = new THREE.Matrix4().makeBasis(right, fr.up, fwd.negate());
    e.mesh.quaternion.setFromRotationMatrix(m);
  }

  update(dt, t, player) {
    const ps = player.s;
    for (const e of this.entities) {
      // dying slug: hold the red flash for a beat, then actually despawn
      if (!e.alive) {
        if (e.dying > 0) {
          e.dying -= dt;
          if (e.dying <= 0) { e.dying = 0; e.mesh.visible = false; }
        }
        // blasted garbage: keep flying off along its launch velocity + tumble,
        // shrinking and fading until it's gone
        if (e.fly) {
          const f = e.fly;
          f.vel.y -= 9 * dt;                          // a little gravity droop
          e.mesh.position.addScaledVector(f.vel, dt);
          // it's a billboard sprite: spin the texture (material rotation) so it
          // visibly tumbles as it flies
          if (e.mesh.material) e.mesh.material.rotation += f.spin * dt;
          f.life -= dt;
          const k = Math.max(0, f.life / f.maxLife);
          e.mesh.scale.setScalar(f.scale0 * (0.4 + k * 0.6));
          if (e.mesh.material) e.mesh.material.opacity = k;
          if (f.life <= 0) { e.fly = null; e.mesh.visible = false; }
        }
        continue;
      }
      if (e.s < ps - 30 || e.s > ps + 180) continue;
      e.cooldown = Math.max(0, e.cooldown - dt);

      // hit flash (slug turns red for a beat when shot but not killed)
      if (e.hitFlash > 0) { e.hitFlash -= dt; if (e.hitFlash <= 0 && e.mesh.material) e.mesh.material.color.setHex(0xffffff); }

      // animation + behavior
      const ud = e.mesh.userData;
      if (ud.spin) e.mesh.rotateZ(dt * 2);
      // floating garbage sprite: gentle hover bob
      if (e.type === 'asteroid' && e.isSprite) { e.h = 0.2 + Math.sin(t * 2.2 + e.phase) * 0.18; this._place(e); }
      if (ud.bob || FLOATERS.has(e.type)) { e.h = 1.1 + Math.sin(t * 2.5 + e.phase) * 0.18; this._place(e); }
      if (ud.spinRing && e.ring) e.ring.rotation.z += dt * 2.4;  // spin around the hole axis (gate twirl)
      if (ud.wobble) e.mesh.scale.z = 1 + Math.sin(t * 6 + e.phase) * 0.1;
      if (ud.pulse) { const p = 1 + Math.sin(t * 5 + e.phase) * 0.12; e.mesh.scale.set(p, 1, p); }

      // billboard sprite frame animation (e.g. slug crawl)
      if (e.isSprite && e.spriteFps && e.frames.length > 1) {
        const f = e.frames[Math.floor(t * e.spriteFps) % e.frames.length];
        if (e.mesh.material.map !== f) { e.mesh.material.map = f; e.mesh.material.needsUpdate = true; }
      }

      if (e.type === 'slug' && e.patrol > 0) {
        e.x = clamp(e.baseX + Math.sin(t * 1.3 + e.phase) * e.patrol, -this.track.halfWidth + 1, this.track.halfWidth - 1);
        this._place(e);
      }

      if (e.type === 'turret') {
        e.fireTimer -= dt;
        const ahead = e.s - ps;
        if (e.fireTimer <= 0 && ahead > 4 && ahead < 90) {
          e.fireTimer = 1.6;
          this.onTurretFire?.(e, player);
          if (e.eye) e.eye.scale.setScalar(1.6);
        } else if (e.eye) {
          e.eye.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
        }
      }

      // magnet not in this game; packages are collected by contact only
      this._collide(e, player, dt);
    }
  }

  _collide(e, player, dt) {
    if (!e.alive || e.cooldown > 0) return;
    const box = HITBOX[e.type];
    const sweep = Math.max(box[0], player.speed * dt * 1.5);
    const ds = e.s - player.s;
    if (ds < -sweep || ds > box[0]) return;
    if (Math.abs(e.x - player.x) > box[1]) return;
    const playerH = player.h;
    if (playerH > box[2]) return;

    switch (e.type) {
      case 'package': case 'heart': case 'ringWhite': case 'ringYellow': case 'jetpack':
        e.alive = false; e.mesh.visible = false; this.onCollect?.(e); break;
      case 'ringRed':
        e.cooldown = 1.5; this.onHazard?.(e); break;
      case 'slug':
        // touching a slug knocks you off (handled by host); invincible plows through
        this.onHazard?.(e); break;
      case 'asteroid': case 'salt': case 'turret':
        e.cooldown = 0.8; this.onHazard?.(e); break;
      case 'pillar': case 'sign':
        // non-shootable dodge obstacles: reuse the existing 'salt' hazard path
        // (damages the postal meter + slows). level.js (read-only) has no
        // 'pillar'/'sign' case, so present a salt-typed proxy carrying this
        // entity's world position for the impact FX.
        e.cooldown = 0.8; this.onHazard?.({ type: 'salt', mesh: e.mesh }); break;
      case 'jumppod':
        e.cooldown = 1.0; this.onJumpPod?.(e); break;
      case 'ramp':
        e.cooldown = 1.0; this.onRamp?.(e); break;
      case 'mailstop':
        e.alive = false; this.onMailStop?.(e); break;
    }
  }

  /** Damage a shootable enemy; returns true if it died. */
  /** Briefly tint an entity's sprite (e.g. a slug flashing red when shot). */
  flashHit(e, color = 0xff3030, dur = 0.3) {
    if (e.mesh && e.mesh.material && e.mesh.material.color) {
      e.mesh.material.color.setHex(color);
      e.hitFlash = dur;
    }
  }

  damageEntity(e, amount) {
    if (!e.alive || !e.shootable) return false;
    e.hp -= amount;
    if (e.hp <= 0) {
      e.alive = false;
      // Slugs don't pop instantly: flash the sprite bright red for a beat, then
      // despawn (handled in update()). Other enemies vanish as before.
      if (e.type === 'slug' && e.isSprite && e.mesh.material && e.mesh.material.color) {
        e.dying = 0.18;            // seconds of red-flash before it disappears
        e.hitFlash = 0;            // cancel any in-progress non-death tint
        e.mesh.material.color.setHex(0xff2a2a);
      } else if (e.type === 'asteroid') {
        // Blasted garbage doesn't just vanish: launch it tumbling off in a
        // random direction (biased up & sideways so it arcs away from the
        // track), then it shrinks/fades in update(). level.js reads the
        // launch dir to trail SMOKE along it.
        this._launchGarbage(e);
      } else {
        e.mesh.visible = false;
      }
      return true;
    }
    return false;
  }

  /** Give a killed garbage entity a random launch velocity + tumble. */
  _launchGarbage(e) {
    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      0.5 + Math.random() * 0.9,   // bias upward so it flies up and away
      (Math.random() - 0.5) * 2,
    ).normalize();
    const speed = 9 + Math.random() * 6;
    e.fly = {
      vel: dir.clone().multiplyScalar(speed),
      dir,                                   // launch direction for the smoke trail
      spin: (Math.random() - 0.5) * 8,       // texture tumble (rad/s) for the billboard
      life: 0.7, maxLife: 0.7,
      scale0: e.mesh.scale.x || 1,
    };
    // sprites use alphaTest which clips the fade; relax it so it can dissolve
    if (e.mesh.material) {
      e.mesh.material.transparent = true;
      e.mesh.material.alphaTest = 0;
      e.mesh.material.depthWrite = false;
    }
  }

  /** Smart bomb: kill all shootable enemies ahead within range. */
  smartBomb(fromS, range = 120) {
    const killed = [];
    for (const e of this.entities) {
      if (e.alive && e.shootable && e.s > fromS && e.s < fromS + range) {
        e.alive = false;
        // blue garbage still gets launched + tumbles (smoke is trailed by the
        // caller); everything else just vanishes in the blast
        if (e.type === 'asteroid') this._launchGarbage(e);
        else e.mesh.visible = false;
        killed.push(e);
      }
    }
    return killed;
  }

  countAlive(type) { let n = 0; for (const e of this.entities) if (e.alive && e.type === type) n++; return n; }
  countTotal(type) { let n = 0; for (const e of this.entities) if (e.type === type) n++; return n; }

  dispose() { for (const e of this.entities) this.scene.remove(e.mesh); this.entities.length = 0; }
}

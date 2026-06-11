/**
 * Turbo the snail — built from the ORIGINAL game's animation-frame meshes
 * (X/TURBO-*.X2, texture X/SNAIL-TURBO.TGA) with a procedural fallback so the
 * player is never invisible while the .X2 frames stream in.
 *
 * The original art ships each animation as a folder of single-frame meshes
 * (see X/_ANIMATION.TXT): TURBO-BASE (idle), TURBO-MOVE (scoot, pingpong),
 * TURBO-BOBALONG, TURBO-DAMAGED, TURBO-FALL, TURBO-SKIDSTOP, TURBO-INTOSHELL,
 * TURBO-LOOKBACK*, TURBO-TALK. We frame-SWAP between the loaded geometries
 * (sharing one textured material) to animate, since the frames are separate
 * poses rather than skinned deformation.
 *
 * The shell-mounted weapon is the original BLASTER/LASER/ROCKETLAUNCHER/
 * INVINCIBLE mesh, picked from the player's weapon level and mounted on the
 * shell. A procedural cannon is kept as a fallback and as the muzzle-flash /
 * recoil anchor that player.js drives.
 *
 * `buildSnail()` is synchronous and returns the familiar
 * `{ group, parts, animate }` shape immediately; the original meshes are
 * loaded async and swapped in without changing that interface. Extra control
 * methods (setPose, setWeaponLevel) are added to the returned object.
 *
 * Returns a Group facing -Z (forward), resting on y≈0, ~1.8 units long.
 * Call `animate(t, speedNorm, grounded)` each frame.
 */

import * as THREE from 'three';
import { xloader } from '../track/xloader.js';
import { assets } from '../assets.js';

export const SNAIL_COLORS = {
  body: 0x3fbfb0,        // teal foot/body
  bodyBelly: 0x8fe8dc,
  shell: 0xff8c1a,       // orange shell
  shellSwirl: 0xfff1c9,  // cream swirl stripe
  eye: 0xffffff,
  pupil: 0x1c1c2e,
  bag: 0x4a7fd6,         // blue mail satchel
  bagFlap: 0xfff1c9,
  cannon: 0x6a7a8a,      // metal shell-cannon
  cannonTrim: 0xffd24d,
};

// --- original Turbo frame sets (X/TURBO-<NAME>-NNN.X2) --------------------
// name -> { frames:[basenames], mode:'pingpong'|'once', fps }
const TURBO_ANIMS = {
  base:    { frames: ['TURBO-BASE-000'], mode: 'once', fps: 1 },
  move:    { frames: ['TURBO-MOVE-000', 'TURBO-MOVE-001'], mode: 'pingpong', fps: 8 },
  bob:     { frames: ['TURBO-BOBALONG-000', 'TURBO-BOBALONG-001', 'TURBO-BOBALONG-002', 'TURBO-BOBALONG-003', 'TURBO-BOBALONG-004'], mode: 'pingpong', fps: 10 },
  damaged: { frames: ['TURBO-DAMAGED-000', 'TURBO-DAMAGED-001'], mode: 'pingpong', fps: 8 },
  fall:    { frames: ['TURBO-FALL-000', 'TURBO-FALL-001'], mode: 'once', fps: 2 },
  shell:   { frames: ['TURBO-INTOSHELL-000', 'TURBO-INTOSHELL-001', 'TURBO-INTOSHELL-002', 'TURBO-INTOSHELL-003', 'TURBO-INTOSHELL-004', 'TURBO-INTOSHELL-005'], mode: 'once', fps: 6 },
  // the original "Intro Chatty Snail" animation (_ANIMATION.TXT: Duration 3.0,
  // Mode Once) — used in the level-start intro. 13 frames / 3.0s = 4.33 fps.
  talk:    { frames: ['TURBO-TALK-000', 'TURBO-TALK-001', 'TURBO-TALK-002', 'TURBO-TALK-003', 'TURBO-TALK-004', 'TURBO-TALK-005', 'TURBO-TALK-006', 'TURBO-TALK-007', 'TURBO-TALK-008', 'TURBO-TALK-009', 'TURBO-TALK-010', 'TURBO-TALK-011', 'TURBO-TALK-012'], mode: 'once', fps: 13 / 3 },
  // finish-line screeching stop (_ANIMATION.TXT: Duration 2.0, Mode Once). 14 frames.
  skid:    { frames: ['TURBO-SKIDSTOP-000', 'TURBO-SKIDSTOP-001', 'TURBO-SKIDSTOP-002', 'TURBO-SKIDSTOP-003', 'TURBO-SKIDSTOP-004', 'TURBO-SKIDSTOP-005', 'TURBO-SKIDSTOP-006', 'TURBO-SKIDSTOP-007', 'TURBO-SKIDSTOP-008', 'TURBO-SKIDSTOP-009', 'TURBO-SKIDSTOP-010', 'TURBO-SKIDSTOP-011', 'TURBO-SKIDSTOP-012', 'TURBO-SKIDSTOP-013'], mode: 'once', fps: 7 },
  // glancing back over the shell (_ANIMATION.TXT: Duration 1.0, Mode Pingpong).
  lookbackLeft:  { frames: ['TURBO-LOOKBACKLEFT-000', 'TURBO-LOOKBACKLEFT-001', 'TURBO-LOOKBACKLEFT-002', 'TURBO-LOOKBACKLEFT-003', 'TURBO-LOOKBACKLEFT-004'], mode: 'pingpong', fps: 8 },
  lookbackRight: { frames: ['TURBO-LOOKBACKRIGHT-000', 'TURBO-LOOKBACKRIGHT-001', 'TURBO-LOOKBACKRIGHT-002', 'TURBO-LOOKBACKRIGHT-003', 'TURBO-LOOKBACKRIGHT-004'], mode: 'pingpong', fps: 8 },
};

// Which weapon mesh to mount per WEAPONS index (player.js WEAPONS array).
// Each entry lists the original .X2 frame meshes to mount on the shell; they
// share the matching texture. left/right pairs mount on each side.
const TURBO_WEAPONS = [
  { meshes: ['BLASTERTOP-BASE-000'] },                          // 0 single
  { meshes: ['BLASTERLEFT-BASE-000', 'BLASTERRIGHT-BASE-000'] }, // 1 double
  { meshes: ['BLASTERLEFT-BASE-000', 'BLASTERRIGHT-BASE-000', 'BLASTERTOP-BASE-000'] }, // 2 triple
  { meshes: ['LASERLEFT-BASE-000'] },                           // 3 laser
  { meshes: ['LASERLEFT-BASE-000', 'LASERRIGHT-BASE-000'] },    // 4 twin laser
  { meshes: ['ROCKETLAUNCHER-BASE-000'] },                      // 5 rocket
  { meshes: ['ROCKETLAUNCHER-BASE-000'] },                      // 6 rapid rocket
  { meshes: ['INVINCIBLE-BASE-000'] },                          // 7 invincible
];

// Original Turbo mesh spans Z -0.66..1.09 (~1.75 long). Scale so the body
// length reads ~1.9 world units, matching the old procedural snail. The model
// faces +Z forward AFTER the parser's LH→RH flip, but the game's forward is
// -Z; we rotate the mesh 180° about Y so Turbo faces forward.
const TURBO_SCALE = 1.08;

export function buildSnail(colors = SNAIL_COLORS) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshLambertMaterial({ color: colors.body });
  const bellyMat = new THREE.MeshLambertMaterial({ color: colors.bodyBelly });
  const shellMat = new THREE.MeshLambertMaterial({ color: colors.shell });
  const swirlMat = new THREE.MeshLambertMaterial({ color: colors.shellSwirl });
  const eyeMat = new THREE.MeshLambertMaterial({ color: colors.eye });
  const pupilMat = new THREE.MeshLambertMaterial({ color: colors.pupil });

  // --- procedural placeholder body (shown until the original mesh loads) ---
  const proc = new THREE.Group();

  // foot / body: stretched capsule low to the ground
  const body = new THREE.Group();
  const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.5, 6, 12), bodyMat);
  foot.rotation.x = Math.PI / 2;
  foot.scale.set(1.05, 1, 0.62);
  foot.position.set(0, 0.22, 0);
  body.add(foot);

  const skirt = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 1.55, 5, 10), bellyMat);
  skirt.rotation.x = Math.PI / 2;
  skirt.scale.set(1.02, 1, 0.32);
  skirt.position.set(0, 0.12, 0);
  body.add(skirt);

  const head = new THREE.Group();
  const headBall = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), bodyMat);
  headBall.scale.set(0.95, 1, 1.05);
  head.add(headBall);
  head.position.set(0, 0.62, -0.95);
  head.rotation.x = 0.35;
  body.add(head);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.7, 10), bodyMat);
  neck.position.set(0, 0.38, -0.82);
  neck.rotation.x = 0.5;
  body.add(neck);

  const stalks = [];
  for (const sx of [-1, 1]) {
    const stalkGroup = new THREE.Group();
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.55, 8), bodyMat);
    stalk.position.y = 0.27;
    stalkGroup.add(stalk);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), eyeMat);
    eye.position.y = 0.58;
    stalkGroup.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), pupilMat);
    pupil.position.set(0, 0.6, -0.11);
    stalkGroup.add(pupil);
    stalkGroup.position.set(sx * 0.14, 0.22, -0.05);
    stalkGroup.rotation.z = -sx * 0.22;
    stalkGroup.rotation.x = -0.15;
    head.add(stalkGroup);
    stalks.push(stalkGroup);
  }

  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.022, 6, 12, Math.PI * 0.8), pupilMat);
  smile.position.set(0, -0.05, -0.32);
  smile.rotation.set(0.2, 0, Math.PI + Math.PI * 0.1);
  head.add(smile);

  const shellGroup = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 16), shellMat);
  shell.scale.set(0.82, 1, 1);
  shellGroup.add(shell);
  const spiralPts = [];
  const turns = 2.4;
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const ang = t * turns * Math.PI * 2;
    const r = 0.58 * (1 - t * 0.85);
    spiralPts.push(new THREE.Vector3(0, Math.sin(ang) * r, Math.cos(ang) * r));
  }
  const spiralCurve = new THREE.CatmullRomCurve3(spiralPts);
  for (const sx of [-1, 1]) {
    const swirl = new THREE.Mesh(new THREE.TubeGeometry(spiralCurve, 80, 0.055, 6, false), swirlMat);
    swirl.position.x = sx * 0.48;
    swirl.scale.x = sx;
    shellGroup.add(swirl);
  }
  shellGroup.position.set(0, 0.78, 0.42);
  shellGroup.rotation.x = -0.12;
  body.add(shellGroup);

  // mail satchel slung on the shell (kept for the procedural placeholder)
  const bagGroup = new THREE.Group();
  const bagMat = new THREE.MeshLambertMaterial({ color: colors.bag });
  const flapMat = new THREE.MeshLambertMaterial({ color: colors.bagFlap });
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.5), bagMat);
  bagGroup.add(bag);
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.52), flapMat);
  flap.position.y = 0.16;
  bagGroup.add(flap);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.04, 6, 20, Math.PI), bagMat);
  strap.rotation.z = Math.PI / 2;
  strap.rotation.y = Math.PI / 2;
  strap.position.set(-0.3, 0.1, 0);
  bagGroup.add(strap);
  bagGroup.position.set(0.72, 0.72, 0.42);
  bagGroup.rotation.z = -0.25;
  body.add(bagGroup);

  proc.add(body);
  group.add(proc);

  // --- shell-mounted cannon: anchor for recoil + muzzle flash --------------
  // This stays for both the procedural and original Turbo; the original weapon
  // mesh mounts under `cannon` so recoil/flash hooks keep working.
  const cannon = new THREE.Group();
  const cannonMat = new THREE.MeshLambertMaterial({ color: colors.cannon ?? 0x6a7a8a });
  // the procedural barrel (hidden once an original weapon mesh is mounted)
  const procWeapon = new THREE.Group();
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.22, 10), cannonMat);
  procWeapon.add(mount);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.72, 10), cannonMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.12, -0.42);
  procWeapon.add(barrel);
  const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 6, 12), new THREE.MeshLambertMaterial({ color: colors.cannonTrim ?? 0xffd24d }));
  muzzle.position.set(0, 0.12, -0.78);
  muzzle.rotation.y = Math.PI / 2;
  procWeapon.add(muzzle);
  cannon.add(procWeapon);

  // muzzle flash (toggled when firing) — driven by player.js
  const flash = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0.9 }));
  flash.rotation.x = -Math.PI / 2;
  flash.position.set(0, 0.12, -1.05);
  flash.visible = false;
  cannon.add(flash);

  // a slot the loaded weapon meshes get mounted into (on the shell)
  const weaponMount = new THREE.Group();
  cannon.add(weaponMount);

  cannon.position.set(0, 1.1, 0.3);
  group.add(cannon);

  // -----------------------------------------------------------------------
  // Original Turbo mesh: streamed in and frame-swapped.
  // -----------------------------------------------------------------------
  const turbo = new THREE.Group();
  // The parser already flips Z (LH→RH), so the model faces forward (-Z) with no
  // extra Y rotation. The vertical offset is computed from the mesh bounds in
  // loadTurbo() so the foot rests exactly on the track.
  turbo.rotation.y = 0;
  turbo.scale.setScalar(TURBO_SCALE);
  turbo.visible = false;
  group.add(turbo);

  const state = {
    loaded: false,
    geometries: new Map(),   // basename -> BufferGeometry
    material: null,          // shared textured material
    mesh: null,              // the single rendered THREE.Mesh (geometry swapped)
    pose: 'base',
    weaponLevel: -1,
    weaponMeshes: [],        // currently mounted weapon meshes
    weaponMats: new Map(),   // texName -> material (so frames share)
    jetpackOn: false,        // FLYING state mounts the original jetpack
    jetpackReq: false,       // load requested (guards double-load)
    jetpackMesh: null,       // JETPACK-BASE on Turbo's back
    thrustMesh: null,        // JETPACKTHRUST flame (3-frame loop)
    thrustGeos: [],
  };

  // collect every frame basename we need so we can preload geometries
  const allFrames = new Set();
  for (const a of Object.values(TURBO_ANIMS)) for (const f of a.frames) allFrames.add(f);

  async function loadTurbo() {
    let firstGeo = null;
    for (const name of allFrames) {
      try {
        const geo = await xloader.geometry('X', name);
        state.geometries.set(name, geo);
        if (!firstGeo) { firstGeo = geo; }
      } catch (err) { /* skip a frame that fails */ }
    }
    if (!firstGeo) return; // total failure → keep procedural Turbo

    // ground Turbo on the canonical idle pose (consistent foot height across
    // the animation frames) so the foot rests on the track.
    const baseGeo = state.geometries.get('TURBO-BASE-000') || firstGeo;
    baseGeo.computeBoundingBox();
    turbo.position.y = -baseGeo.boundingBox.min.y * TURBO_SCALE + 0.02;

    // one shared textured material for the body
    const texName = (firstGeo.userData.texture || 'SNAIL-TURBO.TGA').replace(/\.[^.]+$/, '').toUpperCase();
    // Opaque body material — alphaTest was clipping the eye highlights and the
    // body never needs transparency.
    state.material = new THREE.MeshLambertMaterial({
      map: assets.texture(`X/${texName}`),
      side: THREE.DoubleSide,
    });

    state.mesh = new THREE.Mesh(firstGeo, state.material);
    turbo.add(state.mesh);

    state.loaded = true;
    turbo.visible = true;
    proc.visible = false;       // hide the placeholder body
    procWeapon.visible = false; // hide the placeholder barrel (weapon mesh takes over)
    applyPoseFrame(0);
    if (state.weaponLevel >= 0) mountWeapon(state.weaponLevel);
  }

  /** Mount the original weapon mesh(es) for a weapon level onto the shell. */
  async function mountWeapon(level) {
    if (!state.loaded) { state.weaponLevel = level; return; }
    if (state.weaponLevel === level && state.weaponMeshes.length) return;
    state.weaponLevel = level;
    const spec = TURBO_WEAPONS[Math.min(level, TURBO_WEAPONS.length - 1)];
    // clear previous
    for (const m of state.weaponMeshes) weaponMount.remove(m);
    state.weaponMeshes.length = 0;
    if (!spec) { procWeapon.visible = true; return; }
    let mounted = false;
    for (const name of spec.meshes) {
      try {
        const geo = await xloader.geometry('X', name);
        const texName = (geo.userData.texture || 'BLASTERS.TGA').replace(/\.[^.]+$/, '').toUpperCase();
        let m = state.weaponMats.get(texName);
        if (!m) {
          m = new THREE.MeshLambertMaterial({ map: assets.texture(`X/${texName}`), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
          state.weaponMats.set(texName, m);
        }
        const mesh = new THREE.Mesh(geo, m);
        // the weapon meshes are authored in Turbo's local space; the mount is
        // already inside `cannon`, which sits on the shell, but the weapon art
        // is modelled relative to Turbo's origin — counter the cannon offset
        // and 180° so it sits on the shell facing forward.
        mesh.rotation.y = 0;               // weapon faces forward like Turbo now
        mesh.scale.setScalar(TURBO_SCALE);
        mesh.position.set(0, -0.65, -0.3); // sit on the shell (origins ~aligned)
        weaponMount.add(mesh);
        state.weaponMeshes.push(mesh);
        mounted = true;
      } catch (err) { /* skip a weapon mesh that fails */ }
    }
    // if nothing mounted, fall back to the procedural barrel
    procWeapon.visible = !mounted;
  }

  /** Stream + mount the original jetpack (pack on the back + a 3-frame looping
   *  thrust flame). Authored in Turbo's local space, so it sits in `turbo`. */
  async function loadJetpack() {
    if (state.jetpackReq || !state.loaded) return;
    state.jetpackReq = true;
    try {
      const baseGeo = await xloader.geometry('X', 'JETPACK-BASE-000');
      const bTex = (baseGeo.userData.texture || 'JETPACK.TGA').replace(/\.[^.]+$/, '').toUpperCase();
      state.jetpackMesh = new THREE.Mesh(baseGeo, new THREE.MeshLambertMaterial({ map: assets.texture(`X/${bTex}`), side: THREE.DoubleSide }));
      state.jetpackMesh.visible = state.jetpackOn;
      turbo.add(state.jetpackMesh);
      for (const n of ['JETPACKTHRUST-BASE-000', 'JETPACKTHRUST-BASE-001', 'JETPACKTHRUST-BASE-002']) {
        try { state.thrustGeos.push(await xloader.geometry('X', n)); } catch { /* skip */ }
      }
      if (state.thrustGeos.length) {
        const tTex = (state.thrustGeos[0].userData.texture || 'JETPACKTHRUST.TGA').replace(/\.[^.]+$/, '').toUpperCase();
        state.thrustMesh = new THREE.Mesh(state.thrustGeos[0], new THREE.MeshBasicMaterial({
          map: assets.texture(`X/${tTex}`), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }));
        state.thrustMesh.visible = state.jetpackOn;
        turbo.add(state.thrustMesh);
      }
    } catch (err) { /* keep the procedural cone flame */ }
  }

  function applyPoseFrame(frameIdx) {
    if (!state.loaded) return;
    const anim = TURBO_ANIMS[state.pose] || TURBO_ANIMS.base;
    const frames = anim.frames;
    let idx;
    if (anim.mode === 'pingpong' && frames.length > 1) {
      const period = (frames.length - 1) * 2;
      const p = frameIdx % period;
      idx = p < frames.length ? p : period - p;
    } else {
      idx = Math.min(frameIdx, frames.length - 1);
    }
    const geo = state.geometries.get(frames[idx]);
    if (geo && state.mesh && state.mesh.geometry !== geo) state.mesh.geometry = geo;
  }

  loadTurbo();

  return {
    group,
    parts: { body: proc, head, stalks, shellGroup, bagGroup, cannon, flash },
    /** Set the active animation pose: base|move|bob|damaged|fall|shell. */
    setPose(pose) {
      if (state.pose !== pose) { state.pose = pose; state._poseT = 0; state._poseStartT = null; }
    },
    /** Mount the original weapon mesh for the given WEAPONS index. */
    setWeaponLevel(level) { mountWeapon(level); },
    /** Swap Turbo's body skin: 'base' | 'damage' | 'invincible' (original TGAs). */
    setSkin(which) {
      if (!state.material) return;
      const name = which === 'damage' ? 'SNAIL-TURBO-DAMAGE'
        : which === 'invincible' ? 'SNAIL-TURBO-INVINCIBLE' : 'SNAIL-TURBO';
      if (state._skin === name) return;
      state._skin = name;
      state.material.map = assets.texture(`X/${name}`);
      state.material.needsUpdate = true;
    },
    /** Show/hide the original jetpack (back pack + thrust flame) while flying. */
    setJetpack(on) {
      state.jetpackOn = on;
      if (on) loadJetpack();
      if (state.jetpackMesh) state.jetpackMesh.visible = on && state.loaded;
      if (state.thrustMesh) state.thrustMesh.visible = on && state.loaded;
    },
    get usingOriginal() { return state.loaded; },
    /**
     * Bouncy idle/ride animation. Drives both the procedural placeholder and
     * the original frame-swap Turbo.
     */
    animate(t, speedNorm, grounded) {
      // --- original frame-swap animation ---
      if (state.loaded) {
        const anim = TURBO_ANIMS[state.pose] || TURBO_ANIMS.base;
        if (state._poseStartT == null) state._poseStartT = t;
        // move/bob play faster with speed; others run at their authored fps
        const fps = (state.pose === 'move' || state.pose === 'bob')
          ? anim.fps * (0.5 + speedNorm) : anim.fps;
        // 'once' anims play from frame 0 off pose-local time and hold on the last
        // frame; loops (pingpong) run off the global clock so they never reset.
        const frameIdx = anim.mode === 'once'
          ? Math.floor((t - state._poseStartT) * fps)
          : Math.floor(t * fps);
        applyPoseFrame(frameIdx);
        // animate the jetpack thrust flame (3-frame loop) while flying
        if (state.thrustMesh && state.thrustMesh.visible && state.thrustGeos.length) {
          const ti = Math.floor(t * 12) % state.thrustGeos.length;
          if (state.thrustMesh.geometry !== state.thrustGeos[ti]) state.thrustMesh.geometry = state.thrustGeos[ti];
        }
        // subtle whole-body bob so motion reads even on a 2-frame swap
        const wiggle = Math.sin(t * 10) * 0.03 * (0.4 + speedNorm);
        turbo.position.y = grounded ? Math.max(0, wiggle) : 0;
      }

      // --- procedural placeholder (only visible until Turbo loads) ---
      if (proc.visible) {
        const wiggle = Math.sin(t * 10) * 0.04 * (0.4 + speedNorm);
        body.scale.y = 1 + wiggle * (grounded ? 1 : 0.3);
        body.scale.z = 1 - wiggle * 0.5;
        head.rotation.x = 0.35 + Math.sin(t * 6) * 0.05;
        for (let i = 0; i < stalks.length; i++) {
          const sx = i === 0 ? -1 : 1;
          stalks[i].rotation.x = -0.15 + speedNorm * 0.5 + Math.sin(t * 7 + i) * 0.06;
          stalks[i].rotation.z = -sx * (0.22 + speedNorm * 0.08);
        }
        shellGroup.rotation.x = -0.12 + Math.sin(t * 5) * 0.03;
        if (!grounded) { body.scale.y = 0.92; body.scale.z = 1.05; }
      }
    },
  };
}

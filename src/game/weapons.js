/**
 * Projectiles fired from Turbo's shell-cannon. Each shot advances forward
 * along the track (increasing `s`) at a fixed lateral `x`, and the manager
 * tests it against the EntityManager's shootable enemies each frame.
 */

import * as THREE from 'three';
import { assets } from '../assets.js';
import { xloader } from '../track/xloader.js';

// Original rocket projectile mesh (ROCKET-BASE-000), streamed once + reused.
let _rocketGeo = null, _rocketMat = null, _rocketReq = false;
function ensureRocketMesh() {
  if (_rocketReq) return; _rocketReq = true;
  xloader.geometry('X', 'ROCKET-BASE-000').then((geo) => {
    _rocketGeo = geo;
    const tex = (geo.userData.texture || 'ROCKET.TGA').replace(/\.[^.]+$/, '').toUpperCase();
    _rocketMat = new THREE.MeshLambertMaterial({ map: assets.texture(`X/${tex}`), side: THREE.DoubleSide });
  }).catch(() => { /* keep the procedural bolt */ });
}

const SHOT_SPEED = 70;      // units/s along the track, on top of player speed
const SHOT_RANGE = 70;      // how far ahead a shot travels before despawning

// Projectiles. The base BLASTER fires a clean bright energy bolt (a glowing
// bead + soft additive halo) — NOT the PARTICLEBLASTERS star-burst, which is
// the muzzle flash spawned at the gun barrel by the player fire handler
// (Level._wire's P.onFire → fx.flash(origin, 'PARTICLEBLASTERS', …)). Lasers
// use the original green LAZER bolt sprite. Rockets are a bright orange bolt.
function glowSprite(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: assets.texture('SPRITES/SPARK'), color,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.scale.set(size, size, 1);
  return s;
}

function makeShotMesh(kind) {
  if (kind === 'laser') {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: assets.texture('OBJECTS/LAZER/LAZER'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.scale.set(0.15, 0.475, 1);   // 25% of the original beam size
    return s;
  }
  const grp = new THREE.Group();
  const isRocket = kind === 'rocket';
  const beadCol = isRocket ? 0xffd2a0 : 0xfff6c0;
  const glowCol = isRocket ? 0xff8a30 : 0xffd23a;
  const r = isRocket ? 0.24 : 0.17;
  if (isRocket) {
    ensureRocketMesh();
    if (_rocketGeo) {
      const m = new THREE.Mesh(_rocketGeo, _rocketMat);
      m.scale.setScalar(0.5);
      grp.add(m);
      grp.add(glowSprite(glowCol, 1.2));   // thruster glow trailing the rocket
      return grp;
    }
  }
  const bead = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), new THREE.MeshBasicMaterial({ color: beadCol }));
  grp.add(bead);
  grp.add(glowSprite(glowCol, isRocket ? 1.2 : 0.8));
  return grp;
}

export class WeaponSystem {
  constructor(track, scene) {
    this.track = track;
    this.scene = scene;
    this.shots = [];
    this.onHit = null;      // (entity, shot) => true if entity died
    this.onImpactFx = null; // (worldPos, kind)
  }

  /** Fire a weapon from the player. */
  fire(weapon, s, x) {
    const n = weapon.shots;
    for (let i = 0; i < n; i++) {
      const offset = n === 1 ? 0 : (i - (n - 1) / 2) * weapon.spread;
      const mesh = makeShotMesh(weapon.kind);
      this.scene.add(mesh);
      this.shots.push({
        s, x: x + offset, h: 1.1,
        mesh, kind: weapon.kind, damage: weapon.damage,
        splash: weapon.splash ?? 0,
        weakVsSlug: !!weapon.weakVsSlug,
        traveled: 0, dead: false,
      });
    }
  }

  update(dt, entityManager, player) {
    for (const shot of this.shots) {
      if (shot.dead) continue;
      const adv = (SHOT_SPEED + player.speed) * dt;
      shot.s += adv;
      shot.traveled += adv;
      if (shot.traveled > SHOT_RANGE || shot.s > this.track.length) { shot.dead = true; continue; }

      // place mesh
      const fr = this.track.frameAt(shot.s);
      const pos = this.track.surfacePoint(shot.s, shot.x).addScaledVector(fr.up, shot.h);
      shot.mesh.position.copy(pos);
      shot.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fr.tangent);

      // collide with shootable enemies just ahead
      const hit = this._checkHit(shot, entityManager);
      if (hit) {
        if (shot.splash > 0) this._splash(shot, entityManager);
        this.onImpactFx?.(shot.mesh.position.clone(), shot.kind);
        shot.dead = true;
      }
    }
    // cull
    for (let i = this.shots.length - 1; i >= 0; i--) {
      if (this.shots[i].dead) {
        this.scene.remove(this.shots[i].mesh);
        this.shots.splice(i, 1);
      }
    }
  }

  _checkHit(shot, em) {
    for (const e of em.entities) {
      if (!e.alive || !e.shootable) continue;
      if (Math.abs(e.s - shot.s) > 2.2) continue;
      if (Math.abs((e.x ?? 0) - shot.x) > 1.6) continue;
      const died = this.onHit?.(e, shot);
      if (died) return true;
    }
    return false;
  }

  _splash(shot, em) {
    for (const e of em.entities) {
      if (!e.alive || !e.shootable) continue;
      if (Math.abs(e.s - shot.s) > shot.splash * 1.5) continue;
      if (Math.abs((e.x ?? 0) - shot.x) > shot.splash) continue;
      this.onHit?.(e, { ...shot, damage: shot.damage });
    }
  }

  clear() {
    for (const s of this.shots) this.scene.remove(s.mesh);
    this.shots.length = 0;
  }
}

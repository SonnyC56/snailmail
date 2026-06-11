/**
 * Particle FX. Two layers, both using the original SPRITES/ art:
 *  - a pooled THREE.Points cloud textured with the original SPARK glow (soft
 *    additive sparks for pickups/hits/crashes), and
 *  - expanding billboard "flashes" using the original PARTICLEEXPLODE /
 *    PARTICLERING / PARTICLESLOW sheets for big signature bursts.
 */

import * as THREE from 'three';
import { assets } from '../assets.js';

const MAX_PARTICLES = 600;
const MAX_DIRT = 300;
const MAX_FLASHES = 32;

export class ParticleFX {
  constructor(scene) {
    this.scene = scene;
    this.geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    // textured with the original SPARK sprite + additive blending so bursts
    // read as soft glowing particles instead of flat squares.
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      size: 0.55,
      map: assets.texture('SPRITES/SPARK'),
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.parts = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.parts.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, maxLife: 1, col: new THREE.Color() });
    }
    this._cursor = 0;

    // Separate NON-additive ("dirt") cloud: opaque-ish brown clods that arc and
    // fall under gravity. Additive blending washes dark colours toward white, so
    // a dirt/debris burst needs its own normal-blended layer to read as soil.
    this.dirtGeo = new THREE.BufferGeometry();
    this.dirtPos = new Float32Array(MAX_DIRT * 3);
    this.dirtCol = new Float32Array(MAX_DIRT * 3);
    this.dirtGeo.setAttribute('position', new THREE.BufferAttribute(this.dirtPos, 3));
    this.dirtGeo.setAttribute('color', new THREE.BufferAttribute(this.dirtCol, 3));
    this.dirtPoints = new THREE.Points(this.dirtGeo, new THREE.PointsMaterial({
      size: 0.7,
      map: assets.texture('SPRITES/SPARK'),
      vertexColors: true,
      transparent: true,
      opacity: 1,
      alphaTest: 0.18,
      depthWrite: false,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
    }));
    this.dirtPoints.frustumCulled = false;
    scene.add(this.dirtPoints);
    this.dirt = [];
    for (let i = 0; i < MAX_DIRT; i++) {
      this.dirt.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, maxLife: 1, col: new THREE.Color(), gravity: 18 });
    }
    this._dcursor = 0;

    // expanding billboard flashes (original burst sheets)
    this.flashGroup = new THREE.Group();
    this.flashGroup.frustumCulled = false;
    scene.add(this.flashGroup);
    this.flashes = [];
    for (let i = 0; i < MAX_FLASHES; i++) {
      const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      this.flashGroup.add(sp);
      this.flashes.push({ sp, alive: false, life: 0, maxLife: 1, size0: 1, size1: 2, spin: 0 });
    }
    this._fcursor = 0;
  }

  /**
   * @param pos      world position
   * @param color    hex or THREE.Color
   * @param n        count
   * @param opts     { speed, spread, gravity, life, up }
   */
  burst(pos, color, n = 12, opts = {}) {
    const speed = opts.speed ?? 6;
    const gravity = opts.gravity ?? 10;
    const life = opts.life ?? 0.6;
    const col = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const p = this.parts[this._cursor];
      this._cursor = (this._cursor + 1) % MAX_PARTICLES;
      p.alive = true;
      p.pos.copy(pos);
      p.vel.set(Math.random() - 0.5, Math.random() * 0.7 + 0.15, Math.random() - 0.5)
        .normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.8));
      if (opts.up) p.vel.addScaledVector(opts.up, speed * 0.5);
      p.gravity = gravity;
      p.life = life * (0.6 + Math.random() * 0.6);
      p.maxLife = p.life;
      p.col.copy(col);
      if (Math.random() < 0.3) p.col.lerp(new THREE.Color(0xffffff), 0.6);
    }
  }

  /**
   * Dirt/debris burst: brown clods that pop outward and fall under gravity.
   * Uses the non-additive layer so the soil colours stay dark and earthy.
   * @param pos    world position
   * @param n      count
   * @param opts   { speed, gravity, life, spread }
   */
  dirtBurst(pos, n = 22, opts = {}) {
    const speed = opts.speed ?? 7;
    const gravity = opts.gravity ?? 20;
    const life = opts.life ?? 0.7;
    // a small palette of earthy browns so the clods don't read as one flat blob
    const tones = [0x6b4a2a, 0x7a5836, 0x5a3a1f, 0x8a6a3a, 0x4a3018];
    for (let i = 0; i < n; i++) {
      const p = this.dirt[this._dcursor];
      this._dcursor = (this._dcursor + 1) % MAX_DIRT;
      p.alive = true;
      p.pos.copy(pos);
      // bias upward so the dirt sprays up and out, then rains down
      p.vel.set(Math.random() - 0.5, Math.random() * 0.9 + 0.4, Math.random() - 0.5)
        .normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.9));
      p.gravity = gravity;
      p.life = life * (0.6 + Math.random() * 0.7);
      p.maxLife = p.life;
      p.col.setHex(tones[(Math.random() * tones.length) | 0]);
    }
  }

  /**
   * Spawn an expanding additive billboard from an original sprite sheet.
   * @param pos      world position
   * @param sprite   logical path under SPRITES/ (e.g. 'PARTICLEEXPLODE-BIG')
   * @param opts     { size, size1, life, color, spin }
   */
  flash(pos, sprite, opts = {}) {
    const f = this.flashes[this._fcursor];
    this._fcursor = (this._fcursor + 1) % MAX_FLASHES;
    f.alive = true;
    f.life = f.maxLife = opts.life ?? 0.45;
    f.size0 = opts.size ?? 2.2;
    f.size1 = opts.size1 ?? f.size0 * 2.4;
    f.spin = opts.spin ?? 0;
    f.sp.position.copy(pos);
    f.sp.material.map = assets.texture(`SPRITES/${sprite}`);
    f.sp.material.color.set(opts.color ?? 0xffffff);
    f.sp.material.opacity = 1;
    f.sp.material.rotation = 0;
    f.sp.scale.setScalar(f.size0);
    f.sp.visible = true;
  }

  update(dt) {
    let i3 = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.parts[i];
      if (p.alive) {
        p.life -= dt;
        if (p.life <= 0) p.alive = false;
        else {
          p.vel.y -= p.gravity * dt;
          p.pos.addScaledVector(p.vel, dt);
        }
      }
      if (p.alive) {
        this.positions[i3] = p.pos.x;
        this.positions[i3 + 1] = p.pos.y;
        this.positions[i3 + 2] = p.pos.z;
        const f = p.life / p.maxLife;
        this.colors[i3] = p.col.r * f;
        this.colors[i3 + 1] = p.col.g * f;
        this.colors[i3 + 2] = p.col.b * f;
      } else {
        this.positions[i3 + 1] = -9999;
      }
      i3 += 3;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;

    // dirt clods: same integrate-and-fade, but heavier gravity and held colour
    let d3 = 0;
    for (let i = 0; i < MAX_DIRT; i++) {
      const p = this.dirt[i];
      if (p.alive) {
        p.life -= dt;
        if (p.life <= 0) p.alive = false;
        else {
          p.vel.y -= p.gravity * dt;
          p.pos.addScaledVector(p.vel, dt);
        }
      }
      if (p.alive) {
        this.dirtPos[d3] = p.pos.x;
        this.dirtPos[d3 + 1] = p.pos.y;
        this.dirtPos[d3 + 2] = p.pos.z;
        // hold full colour, only darken/fade over the last third of life
        const f = Math.min(1, (p.life / p.maxLife) * 2.2);
        this.dirtCol[d3] = p.col.r * f;
        this.dirtCol[d3 + 1] = p.col.g * f;
        this.dirtCol[d3 + 2] = p.col.b * f;
      } else {
        this.dirtPos[d3 + 1] = -9999;
      }
      d3 += 3;
    }
    this.dirtGeo.attributes.position.needsUpdate = true;
    this.dirtGeo.attributes.color.needsUpdate = true;

    // expanding flashes: grow + fade then park
    for (const f of this.flashes) {
      if (!f.alive) continue;
      f.life -= dt;
      if (f.life <= 0) { f.alive = false; f.sp.visible = false; continue; }
      const e = 1 - f.life / f.maxLife;            // 0→1
      f.sp.scale.setScalar(f.size0 + (f.size1 - f.size0) * e);
      f.sp.material.opacity = 1 - e * e;           // ease-out fade
      if (f.spin) f.sp.material.rotation += f.spin * dt;
    }
  }

  dispose(scene) {
    scene.remove(this.points);
    scene.remove(this.dirtPoints);
    scene.remove(this.flashGroup);
    this.geo.dispose();
    this.dirtGeo.dispose();
    this.points.material.dispose();
    this.dirtPoints.material.dispose();
    for (const f of this.flashes) f.sp.material.dispose();
  }
}

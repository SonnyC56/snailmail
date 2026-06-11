/**
 * Lightweight particle bursts (Points-based) for pickups, crashes, boosts.
 */

import * as THREE from 'three';

const MAX_PARTICLES = 600;

export class ParticleFX {
  constructor(scene) {
    this.geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);

    // particle pool
    this.parts = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.parts.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, maxLife: 1, col: new THREE.Color() });
    }
    this._cursor = 0;
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
        // park dead particles far away
        this.positions[i3 + 1] = -9999;
      }
      i3 += 3;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  dispose(scene) {
    scene.remove(this.points);
    this.geo.dispose();
    this.points.material.dispose();
  }
}

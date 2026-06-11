/**
 * The space the track floats in: gradient sky dome, star field, distant
 * planets, and themed decoration props scattered alongside the track.
 * All original procedural builds.
 */

import * as THREE from 'three';
import { rng } from '../utils.js';
import { assets } from '../assets.js';

export class Environment {
  constructor(scene, theme, track, seed = 7) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this._spinners = [];

    this._buildSky(theme);
    this._buildStars(theme, seed);
    this._buildPlanets(theme, seed);
    // Note: decorative track-side props are intentionally disabled — they read
    // as unreachable pickups/obstacles and the original used only the flat
    // nebula backdrop. Distant planets + stars provide depth instead.
    this._buildLights(theme);
    scene.fog = new THREE.Fog(theme.fogColor ?? theme.skyBottom, 60, 420);
  }

  _buildSky(theme) {
    // Original animated nebula: a big inward-facing dome that slowly rotates
    // and "distorts" (UV wobble), matching the source's per-background Distort.
    if (theme.background) {
      const tex = assets.texture(`BACKGROUNDS/${theme.background}`, { wrap: true });
      const geo = new THREE.SphereGeometry(620, 32, 20);
      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
      this.sky = new THREE.Mesh(geo, mat);
      this.sky.renderOrder = -1;
      this.group.add(this.sky);
      this._distort = (theme.distort ?? 14) / 100;  // wobble amount
      this._skyTex = tex;
      return; // stars + planets render in front for depth
    }
    // fallback: inverted dome with vertical vertex-color gradient
    const geo = new THREE.SphereGeometry(700, 24, 16);
    const top = new THREE.Color(theme.skyTop);
    const bottom = new THREE.Color(theme.skyBottom);
    const colors = [];
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 700; // -1..1
      const c = bottom.clone().lerp(top, (y + 1) / 2);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
    this.sky = new THREE.Mesh(geo, mat);
    this.group.add(this.sky);
  }

  _buildStars(theme, seed) {
    const rand = rng(seed * 31 + 5);
    const n = 900;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // random direction, pushed to dome radius
      const v = new THREE.Vector3(rand() * 2 - 1, rand() * 1.6 - 0.4, rand() * 2 - 1).normalize().multiplyScalar(640);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: theme.starOpacity ?? 0.9 });
    this.stars = new THREE.Points(geo, mat);
    this.group.add(this.stars);
  }

  _buildPlanets(theme, seed) {
    const rand = rng(seed * 17 + 99);
    const planets = theme.planets ?? [];
    for (const p of planets) {
      const g = new THREE.Group();
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(p.size, 20, 16),
        new THREE.MeshLambertMaterial({ color: p.color, fog: false, emissive: p.color, emissiveIntensity: 0.25 }),
      );
      g.add(ball);
      if (p.ring) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(p.size * 1.6, p.size * 0.16, 8, 30),
          new THREE.MeshLambertMaterial({ color: p.ring, fog: false, emissive: p.ring, emissiveIntensity: 0.2 }),
        );
        ring.rotation.x = Math.PI / 2.4;
        ring.scale.z = 0.4;
        g.add(ring);
      }
      if (p.swirl) {
        // banded stripes: thin tori around the ball
        for (let i = -1; i <= 1; i++) {
          const band = new THREE.Mesh(
            new THREE.TorusGeometry(p.size * Math.sqrt(1 - (i * 0.35) ** 2), p.size * 0.05, 6, 28),
            new THREE.MeshLambertMaterial({ color: p.swirl, fog: false }),
          );
          band.rotation.x = Math.PI / 2;
          band.position.y = i * p.size * 0.35;
          g.add(band);
        }
      }
      g.position.fromArray(p.pos);
      this.group.add(g);
      this._spinners.push({ obj: g, speed: 0.04 + rand() * 0.05 });
    }
  }

  /** Themed props floating near the track so speed reads visually. */
  _buildProps(theme, track, seed) {
    const rand = rng(seed * 7 + 3);
    const propDefs = theme.props ?? [];
    if (!propDefs.length) return;

    const props = new THREE.Group();
    const protos = propDefs.map(p => this._propProto(p));

    const spacing = 26;
    for (let s = 30; s < track.length - 30; s += spacing * (0.7 + rand() * 0.8)) {
      const fr = track.frameAt(s);
      const proto = protos[Math.floor(rand() * protos.length)];
      const inst = proto.clone(true);
      const side = rand() > 0.5 ? 1 : -1;
      const dist = 16 + rand() * 30;
      const drop = -6 - rand() * 18;
      inst.position.copy(fr.pos)
        .addScaledVector(fr.side, side * dist)
        .addScaledVector(fr.up, drop + rand() * 26);
      const scale = 0.8 + rand() * 1.6;
      inst.scale.setScalar(scale);
      inst.rotation.y = rand() * Math.PI * 2;
      props.add(inst);
      if (rand() < 0.35) this._spinners.push({ obj: inst, speed: (rand() - 0.5) * 0.6 });
    }
    this.group.add(props);
  }

  _propProto(def) {
    const g = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: def.color });
    switch (def.kind) {
      case 'asteroid': {
        const a = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), m);
        a.scale.set(1.2, 0.9, 1);
        g.add(a);
        break;
      }
      case 'mushroom': {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 2.2, 8), new THREE.MeshLambertMaterial({ color: 0xfff1c9 }));
        g.add(stem);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m);
        cap.position.y = 1.0;
        cap.scale.y = 0.75;
        g.add(cap);
        for (let i = 0; i < 4; i++) {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), new THREE.MeshLambertMaterial({ color: 0xffffff }));
          const a = i * 1.7 + 0.4;
          dot.position.set(Math.cos(a) * 0.9, 1.45, Math.sin(a) * 0.9);
          g.add(dot);
        }
        break;
      }
      case 'cactus': {
        const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 2.4, 4, 8), m);
        trunk.position.y = 1.2;
        g.add(trunk);
        for (const sx of [-1, 1]) {
          const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.0, 4, 8), m);
          arm.position.set(sx * 0.85, 1.5, 0);
          arm.rotation.z = -sx * 0.7;
          g.add(arm);
        }
        break;
      }
      case 'crystal': {
        for (let i = 0; i < 3; i++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.5 - i * 0.1, 2.4 - i * 0.5, 6),
            new THREE.MeshLambertMaterial({ color: def.color, transparent: true, opacity: 0.85 }));
          c.position.set((i - 1) * 0.7, (2.4 - i * 0.5) / 2, (i % 2) * 0.5);
          c.rotation.z = (i - 1) * 0.25;
          g.add(c);
        }
        break;
      }
      case 'lavarock': {
        const a = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 0), m);
        g.add(a);
        const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0),
          new THREE.MeshBasicMaterial({ color: 0xff5a1a }));
        glow.position.y = 0.3;
        glow.scale.set(1.2, 0.5, 1.2);
        g.add(glow);
        break;
      }
      case 'ringlet': {
        const r = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.18, 8, 22), m);
        g.add(r);
        break;
      }
      default: {
        const b = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), m);
        g.add(b);
      }
    }
    return g;
  }

  _buildLights(theme) {
    const hemi = new THREE.HemisphereLight(theme.lightSky ?? 0xffffff, theme.lightGround ?? 0x445566, 0.95);
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight(theme.sunColor ?? 0xfff2d9, 1.25);
    sun.position.set(40, 80, 30);
    this.group.add(sun);
    const fill = new THREE.DirectionalLight(0x8899ff, 0.35);
    fill.position.set(-50, 20, -40);
    this.group.add(fill);
  }

  /** Keep the dome/stars centered on the camera; animate the nebula. */
  update(dt, cameraPos) {
    this._t = (this._t || 0) + dt;
    if (this.sky) {
      this.sky.position.copy(cameraPos);
      this.sky.rotation.y += dt * 0.012;        // slow drift
      if (this._skyTex && this._distort) {        // shimmering distortion
        const d = this._distort * 0.04;
        this._skyTex.offset.set(Math.sin(this._t * 0.13) * d, Math.cos(this._t * 0.09) * d * 0.6);
        this._skyTex.needsUpdate = true;
      }
    }
    if (this.stars) this.stars.position.copy(cameraPos);
    for (const s of this._spinners) s.obj.rotation.y += s.speed * dt;
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.fog = null;
    if (this._ownsBackground) this.scene.background = null;
  }
}

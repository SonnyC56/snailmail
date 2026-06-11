/**
 * Renders remote racers as translucent "ghost" snails on the local track,
 * driven by networked (s, x) positions with smooth interpolation.
 */

import * as THREE from 'three';
import { buildSnail, SNAIL_COLORS } from '../game/snailModel.js';

const GHOST_TINTS = [
  { body: 0xff6b6b, shell: 0xffd24d }, // red
  { body: 0x66ccff, shell: 0xffffff }, // blue
  { body: 0x9be870, shell: 0xff8c1a }, // green
  { body: 0xff9be0, shell: 0x66ccff }, // pink
  { body: 0xffd24d, shell: 0xff5a1a }, // gold
  { body: 0xb39ddb, shell: 0xffffff }, // violet
];

export class GhostManager {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.ghosts = new Map(); // id -> ghost
    this._tintIdx = 0;
  }

  tintFor(id) {
    const t = GHOST_TINTS[id % GHOST_TINTS.length];
    return { ...SNAIL_COLORS, body: t.body, bodyBelly: t.body, shell: t.shell };
  }

  add(id, name) {
    if (this.ghosts.has(id)) return;
    const snail = buildSnail(this.tintFor(id));
    snail.group.traverse((o) => {
      if (o.material) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.72;
        o.material.depthWrite = true;
      }
    });
    const group = new THREE.Group();
    group.add(snail.group);

    // floating name tag
    const tag = makeNameSprite(name);
    tag.position.y = 2.4;
    group.add(tag);

    this.scene.add(group);
    this.ghosts.set(id, { id, snail, group, name, s: 0, x: 0, targetS: 0, targetX: 0, st: 'riding', t: 0 });
  }

  remove(id) {
    const g = this.ghosts.get(id);
    if (g) { this.scene.remove(g.group); this.ghosts.delete(id); }
  }

  setPos(id, s, x, st) {
    const g = this.ghosts.get(id);
    if (!g) return;
    g.targetS = s; g.targetX = x; g.st = st;
  }

  update(dt, elapsed) {
    for (const g of this.ghosts.values()) {
      // smooth toward latest network position
      const k = 1 - Math.pow(0.0001, dt);
      g.s += (g.targetS - g.s) * k;
      g.x += (g.targetX - g.x) * k;
      g.t += dt;

      const s = Math.max(0, Math.min(g.s, this.track.length));
      const fr = this.track.frameAt(s);
      const up = fr.up;
      const pos = this.track.surfacePoint(s, g.x).addScaledVector(up, 0.05);
      g.group.position.copy(pos);
      const right = new THREE.Vector3().crossVectors(fr.tangent, up).normalize();
      const fwd = new THREE.Vector3().crossVectors(up, right).normalize();
      g.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd.clone().negate()));
      g.snail.animate(elapsed + g.id, 0.6, g.st === 'riding');
    }
  }

  clear() {
    for (const g of this.ghosts.values()) this.scene.remove(g.group);
    this.ghosts.clear();
  }
}

function makeNameSprite(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 34px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(20,10,40,0.85)';
  ctx.strokeText(name, 128, 34);
  ctx.fillStyle = '#fff';
  ctx.fillText(name, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(3, 0.75, 1);
  return spr;
}

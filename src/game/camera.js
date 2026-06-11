/**
 * Chase camera that follows the snail down the trough. Sits behind and
 * above, banks with the player's lateral position so the half-pipe walls
 * read correctly, and smooths to avoid jitter on the spline.
 */

import * as THREE from 'three';
import { lerp } from '../utils.js';
import { PlayerState } from './player.js';

export class ChaseCamera {
  constructor(camera, track) {
    this.camera = camera;
    this.track = track;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._initialized = false;
    this.shake = 0;
    this.fovBase = 70;
    this._introT = 0;
    this._introDur = 0;
    this._introHold = 0;
  }

  addShake(amount) { this.shake = Math.min(1.2, this.shake + amount); }

  /** Begin the level-start fly-around: camera lingers in front of Turbo (his
   *  face) for `hold` seconds while he talks, then orbits back to the chase
   *  position over `orbit` seconds. */
  startIntro(hold = 1.1, orbit = 1.9) { this._introHold = hold; this._introDur = hold + orbit; this._introT = 0; }
  get introActive() { return this._introT < this._introDur; }

  update(dt, player) {
    const track = this.track;
    const behind = 6.2;
    const height = 3.0;

    // sample a point behind the player along the track for a stable anchor
    const camS = Math.max(0, player.s - behind);
    const fr = track.frameAt(camS);
    const playerNormal = (player.grounded || player.state === 'flying')
      ? track.surfaceNormal(player.s)
      : (player._airUp ?? fr.up);

    // desired camera position: behind player, lifted along the surface normal,
    // tracking a fraction of the player's lateral offset so turns read well
    const anchor = (player.state === 'airborne' || player.state === 'falling')
      ? player.group.position.clone()
      : track.surfacePoint(player.s, player.x * 0.6);

    const desired = anchor.clone()
      .addScaledVector(fr.tangent, -behind)
      .addScaledVector(playerNormal, height);

    // look at a point ahead of the player
    const aheadFr = track.frameAt(Math.min(player.s + 10, track.length));
    const lookTarget = player.group.position.clone()
      .addScaledVector(aheadFr.tangent, 6)
      .addScaledVector(playerNormal, 0.5);

    if (!this._initialized) {
      this._pos.copy(desired);
      this._look.copy(lookTarget);
      this._up.copy(playerNormal);
      this._initialized = true;
    }

    // smoothing — snappier when falling/crashed so the camera keeps up
    const posLerp = player.doomed ? 0.06 : 1 - Math.pow(0.0006, dt);
    const lookLerp = 1 - Math.pow(0.0001, dt);
    this._pos.lerp(desired, posLerp);
    this._look.lerp(lookTarget, lookLerp);
    this._up.lerp(playerNormal, 1 - Math.pow(0.002, dt)).normalize();

    // speed FOV kick
    const speedNorm = Math.min(player.speed / player.maxSpeed, 1.2);
    const fast = player.invincTime > 0 || player.jetTime > 0;
    const targetFov = this.fovBase + speedNorm * 12 + (fast ? 6 : 0);
    this.camera.fov = lerp(this.camera.fov, targetFov, 1 - Math.pow(0.02, dt));

    // camera shake (crash/boost)
    let shakeOff = new THREE.Vector3();
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const m = this.shake * this.shake;
      shakeOff.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(m * 1.2);
    }

    // Level-start fly-around: override the chase pose with an orbit that
    // starts IN FRONT of Turbo (so we see his face) and swings around behind
    // him, easing into the normal chase as it finishes.
    if (this.introActive) {
      this._introT += dt;
      // hold on the face first, then ease the orbit from front to behind
      const orbitDur = Math.max(this._introDur - this._introHold, 0.001);
      const p = Math.min(Math.max(this._introT - this._introHold, 0) / orbitDur, 1);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOut
      const a = e * Math.PI;                       // 0 = front (face) → π = behind
      const frP = track.frameAt(player.s);
      const pp = player.group.position;
      const orbit = pp.clone()
        .addScaledVector(frP.tangent, Math.cos(a) * behind)
        .addScaledVector(frP.side, Math.sin(a) * behind * 0.55)
        .addScaledVector(playerNormal, lerp(1.7, height, e));
      const orbitLook = pp.clone()
        .addScaledVector(playerNormal, lerp(1.1, 0.5, e))
        .addScaledVector(frP.tangent, lerp(-0.5, 6, e));
      this._pos.copy(orbit);
      this._look.copy(orbitLook);
      this._up.copy(playerNormal);
    }

    this.camera.position.copy(this._pos).add(shakeOff);
    this.camera.up.copy(this._up);
    this.camera.lookAt(this._look);
    this.camera.updateProjectionMatrix();
  }

  reset() { this._initialized = false; this.shake = 0; }
}

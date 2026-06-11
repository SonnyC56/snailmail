/**
 * Player: Turbo the snail riding the ribbon highway.
 *
 * Coordinates: `s` distance along track (auto-advances), `x` signed lateral
 * offset across the ribbon (steered), `h` height above the road (jump pods
 * / jetpack). There is no jump button — the only inputs are steer + fire.
 *
 * Health: a "postal meter" damage gauge (salt, lasers, asteroids fill it;
 * hearts drain it). A full meter costs a life. Slugs and falling off the
 * edge / into a gap cost a life immediately.
 */

import * as THREE from 'three';
import { clamp, moveToward } from '../utils.js';
import { buildSnail } from './snailModel.js';

const GRAVITY = 30;
const STEER_ACCEL = 95;        // lateral responsiveness (keyboard/touch)
const STEER_MAX = 20;          // max lateral speed (units/s)
const STEER_DAMP = 9;
const AIR_STEER = 60;          // lateral air-control accel (full mid-flight steering)
const MOUSE_TRACK = 0.0008;    // mouse position-follow rate (lower = snappier)
const METER_MAX = 100;

// weapon chain: index → { name, cooldown, shots, damage, invincible }
export const WEAPONS = [
  // base shooter can't destroy slugs (only dodge them) — needs an upgrade
  { name: 'Single Shooter', cooldown: 0.30, shots: 1, spread: 0,    damage: 1, kind: 'pellet', weakVsSlug: true },
  { name: 'Double Shooter', cooldown: 0.26, shots: 2, spread: 0.9,  damage: 1, kind: 'pellet' },
  { name: 'Triple Shooter', cooldown: 0.24, shots: 3, spread: 1.2,  damage: 1, kind: 'pellet' },
  { name: 'Laser',          cooldown: 0.20, shots: 1, spread: 0,    damage: 2, kind: 'laser' },
  { name: 'Twin Laser',     cooldown: 0.18, shots: 2, spread: 0.8,  damage: 2, kind: 'laser' },
  { name: 'Rocket',         cooldown: 0.34, shots: 1, spread: 0,    damage: 4, kind: 'rocket', splash: 2.4 },
  { name: 'Rapid Rocket',   cooldown: 0.18, shots: 1, spread: 0,    damage: 4, kind: 'rocket', splash: 2.6 },
  { name: 'Invincible!',    cooldown: 0.12, shots: 2, spread: 1.0,  damage: 6, kind: 'laser', invincible: true },
];

export const PlayerState = {
  RIDING: 'riding',
  AIRBORNE: 'airborne',   // launched over a gap (jump pod / ramp)
  FLYING: 'flying',       // jetpack
  FALLING: 'falling',     // doomed, off the road
  FINISHED: 'finished',
};

export class Player {
  constructor(track, opts = {}) {
    this.track = track;
    this.baseSpeed = opts.baseSpeed ?? 30;
    this.maxSpeed = opts.maxSpeed ?? this.baseSpeed * 1.6;

    this.s = 0;
    this.x = 0;
    this.xVel = 0;
    this.speed = this.baseSpeed;
    this.h = 0;
    this.hVel = 0;

    this.state = PlayerState.RIDING;
    this.stateTime = 0;

    // health / status
    this.meter = 0;             // postal meter 0..METER_MAX
    this.weaponLevel = 0;
    this.invincTime = 0;        // from weapon level 7
    this.shieldInvuln = 0;      // brief grace after taking a hit
    this.slowTime = 0;          // salt / asteroid / red ring slowdown
    this.jetTime = 0;           // jetpack remaining
    this.postalTime = 0;        // "going postal" rage frenzy remaining
    this.fireCooldown = 0;

    // events (Level subscribes)
    this.onFire = null;         // (weapon, originWorldPos, s, x)
    this.onLand = null;
    this.onFallStart = null;
    this.onMeterFull = null;
    this.onJumpPod = null;

    this._airPos = new THREE.Vector3();
    this._airVel = new THREE.Vector3();
    this._airUp = new THREE.Vector3(0, 1, 0);

    this.snail = buildSnail();
    this.snail.setWeaponLevel?.(this.weaponLevel);  // mount original weapon mesh
    this.group = new THREE.Group();
    this.group.add(this.snail.group);

    this._damagedTimer = 0;     // brief "ouch" pose after a hit

    // jetpack flame
    this.jetFlame = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 1.2, 8),
      new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.85 }),
    );
    this.jetFlame.rotation.x = Math.PI;
    this.jetFlame.position.set(0, 0.4, 1.1);
    this.jetFlame.visible = false;
    this.group.add(this.jetFlame);

    this._cannonRecoil = 0;
    this._flashTimer = 0;
    this._syncTransform();
  }

  get grounded() { return this.state === PlayerState.RIDING; }
  get doomed() { return this.state === PlayerState.FALLING; }
  get invincible() { return this.invincTime > 0; }
  get weapon() { return WEAPONS[Math.min(this.weaponLevel, WEAPONS.length - 1)]; }
  get meterRatio() { return this.meter / METER_MAX; }

  // ---- status mutators ---------------------------------------------
  upgradeWeapon() {
    if (this.weaponLevel < WEAPONS.length - 1) this.weaponLevel++;
    if (this.weapon.invincible) this.invincTime = 10;
    this.snail.setWeaponLevel?.(this.weaponLevel);  // swap the mounted weapon mesh
    return this.weapon;
  }

  addDamage(amount) {
    if (this.invincible || this.shieldInvuln > 0) return false;
    this.meter = clamp(this.meter + amount, 0, METER_MAX);
    this.shieldInvuln = 0.5;
    this._damagedTimer = 0.4;   // flinch into the original DAMAGED pose
    if (this.meter >= METER_MAX) { this.goPostal(); this.onMeterFull?.(); return 'postal'; }
    return true;
  }

  heal(amount) { this.meter = clamp(this.meter - amount, 0, METER_MAX); }

  /** "Going postal": too much damage triggers a fast, invincible rage frenzy
   * (he plows through everything) for a few seconds, then the meter resets. */
  goPostal() {
    this.postalTime = 4.5;
    this.invincTime = Math.max(this.invincTime, 4.5);
    this.meter = 0;
  }
  get postal() { return this.postalTime > 0; }

  slow(t = 1.2) { this.slowTime = Math.max(this.slowTime, t); }

  startJetpack(dur = 5) { this.jetTime = dur; if (this.state === PlayerState.RIDING) { this.state = PlayerState.FLYING; this.stateTime = 0; } }

  /** Hit by a slug or fell — instant life loss handled by Level. */
  knockOff() {
    if (this.invincible || this.shieldInvuln > 0) return false;
    this._startFall();
    return true;
  }

  // ---- main update -------------------------------------------------
  update(dt, input) {
    this.stateTime += dt;
    for (const k of ['invincTime', 'shieldInvuln', 'slowTime', 'postalTime']) this[k] = Math.max(0, this[k] - dt);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this._damagedTimer = Math.max(0, this._damagedTimer - dt);
    this._cannonRecoil = Math.max(0, this._cannonRecoil - dt * 6);
    if (this._flashTimer > 0) { this._flashTimer -= dt; if (this._flashTimer <= 0) this.snail.parts.flash.visible = false; }

    switch (this.state) {
      case PlayerState.RIDING:   this._updateRiding(dt, input); break;
      case PlayerState.AIRBORNE: this._updateAirborne(dt, input); break;
      case PlayerState.FLYING:   this._updateFlying(dt, input); break;
      case PlayerState.FALLING:  this._updateFalling(dt); break;
      case PlayerState.FINISHED: this._updateFinished(dt); break;
    }
    this._syncTransform();
  }

  _targetSpeed() {
    let t = this.baseSpeed;
    if (this.slowTime > 0) t *= 0.5;
    if (this.invincible) t = this.maxSpeed; // invincibility runs hot
    if (this.postalTime > 0) t = this.maxSpeed * 1.35; // going postal = flat out
    return t;
  }

  _steer(dt, input) {
    if (input.mouseActive) {
      // position tracking: the snail follows the cursor across the track with
      // a little drag. The target reaches PAST the rail at full cursor
      // deflection so you can still ride off the edge.
      const reach = this.track.halfWidth + 1.8;
      const targetX = clamp(input.mouseLateral * reach, -reach, reach);
      const k = 1 - Math.pow(MOUSE_TRACK, dt);
      const newX = this.x + (targetX - this.x) * k;
      this.xVel = (newX - this.x) / Math.max(dt, 1e-4); // drives the subtle lean
      this.x = newX;
      return;
    }
    const power = STEER_ACCEL * (this.state === PlayerState.FLYING ? 0.8 : 1);
    this.xVel += input.steer * power * dt;
    this.xVel -= this.xVel * STEER_DAMP * dt;
    this.xVel = clamp(this.xVel, -STEER_MAX, STEER_MAX);
    this.x += this.xVel * dt;
  }

  _tryFire(input) {
    if (!input.fireHeld || this.fireCooldown > 0) return;
    const w = this.weapon;
    this.fireCooldown = w.cooldown;
    // muzzle world position
    const origin = this.track.surfacePoint(this.s, this.x).addScaledVector(this.track.surfaceNormal(this.s), 1.1 + this.h);
    this.onFire?.(w, origin, this.s, this.x);
    this._cannonRecoil = 1;
    this._flashTimer = 0.06;
    this.snail.parts.flash.visible = true;
    this.snail.fireWeapon?.();   // brief original FIRE recoil pose on the gun
  }

  _updateRiding(dt, input) {
    this.speed = moveToward(this.speed, this._targetSpeed(), 20 * dt);
    this.s += this.speed * dt;
    this._steer(dt, input);
    this._tryFire(input);

    // off the edge → fall (no rails)
    if (Math.abs(this.x) > this.track.halfWidth + 0.4) { this._startFall(); return; }
    // ran onto a gap → fall (unless jetpack covers it, handled in FLYING)
    if (!this.track.hasSurface(this.s, this.x)) { this._startFall(); return; }
  }

  /** Ballistic hop launched by a jump pod / ramp. */
  launch(power = 1) {
    const fr = this.track.frameAt(this.s);
    this._airPos.copy(this.track.surfacePoint(this.s, this.x)).addScaledVector(fr.up, 0.1);
    this._airVel.copy(fr.tangent).multiplyScalar(this.speed * 1.05)
      .addScaledVector(fr.up, 13 * power)
      .addScaledVector(fr.side, this.xVel);
    this._airUp.copy(fr.up);
    this.state = PlayerState.AIRBORNE;
    this.stateTime = 0;
    this.onJumpPod?.();
  }

  _updateAirborne(dt, input) {
    const fr = this.track.frameAt(this.s);

    // Full lateral air control: steer the side-velocity toward the input so you
    // can keep moving left/right mid-flight to line up a landing. Works for the
    // mouse too (ground mouse steering is position-based, which yields steer=0).
    let steer = input.steer;
    if (input.mouseActive) {
      const reach = this.track.halfWidth + 1.8;
      const targetX = clamp(input.mouseLateral * reach, -reach, reach);
      steer = clamp((targetX - this.x) * 0.6, -1, 1);
    }
    const sideV = this._airVel.dot(fr.side);
    const newSideV = moveToward(sideV, steer * STEER_MAX, AIR_STEER * dt);
    this._airVel.addScaledVector(fr.side, newSideV - sideV);

    this._airVel.y -= GRAVITY * dt;
    this._airPos.addScaledVector(this._airVel, dt);
    this.s += Math.max(0, this._airVel.dot(fr.tangent)) * dt;
    this._tryFire(input);

    // resolve against the ribbon plane ahead
    const frNow = this.track.frameAt(this.s);
    const rel = this._airPos.clone().sub(frNow.pos);
    this.x = rel.dot(frNow.side);
    this.h = rel.dot(frNow.up);

    if (this.h <= 0 && this._airVel.dot(frNow.up) < 0) {
      if (Math.abs(this.x) <= this.track.halfWidth + 0.4 && this.track.hasSurface(this.s, this.x)) {
        this.h = 0;
        this.state = PlayerState.RIDING;
        this.speed = clamp(this._airVel.dot(frNow.tangent), this.baseSpeed * 0.6, this.maxSpeed);
        this.xVel = this._airVel.dot(frNow.side);
        this.onLand?.();
      } else {
        this._startFall();
      }
    }
  }

  _updateFlying(dt, input) {
    this.jetTime -= dt;
    this.speed = moveToward(this.speed, this._targetSpeed() * 1.1, 20 * dt);
    this.s += this.speed * dt;
    this._steer(dt, input);
    this._tryFire(input);
    // hover a bit above the road
    this.h = moveToward(this.h, 2.6, 6 * dt);
    // mount the original jetpack mesh; the procedural cone is only a fallback
    this.snail.setJetpack?.(true);
    this.jetFlame.visible = !this.snail.usingOriginal;

    if (Math.abs(this.x) > this.track.halfWidth + 0.4) { this._endJet(); this._startFall(); return; }
    if (this.jetTime <= 0) {
      // settle back down; if over a gap when it ends, fall
      if (!this.track.hasSurface(this.s, this.x)) { this._endJet(); this._startFall(); return; }
      this.h = moveToward(this.h, 0, 8 * dt);
      if (this.h <= 0.05) { this.h = 0; this.state = PlayerState.RIDING; this._endJet(); this.onLand?.(); }
    }
  }

  _endJet() { this.jetFlame.visible = false; this.snail.setJetpack?.(false); }

  _startFall() {
    if (this.state === PlayerState.FALLING) return;
    const fr = this.track.frameAt(this.s);
    this._airPos.copy(this.track.surfacePoint(this.s, this.x)).addScaledVector(fr.up, Math.max(this.h, 0));
    this._airVel.copy(fr.tangent).multiplyScalar(this.speed * 0.6).addScaledVector(fr.up, 2);
    this._airUp.copy(fr.up);
    this.state = PlayerState.FALLING;
    this.stateTime = 0;
    this.jetFlame.visible = false;
    this.onFallStart?.();
  }

  _updateFalling(dt) {
    this._airVel.y -= GRAVITY * dt;
    this._airPos.addScaledVector(this._airVel, dt);
    this.snail.group.rotation.z += dt * 5;
    this.snail.group.rotation.x += dt * 3;
  }

  _updateFinished(dt) {
    this.speed = moveToward(this.speed, 0, 16 * dt);
    this.s += this.speed * dt;
    this.x = moveToward(this.x, 0, dt * 4);
    this.jetFlame.visible = false;
  }

  respawn(atS = 0) {
    this.s = atS;
    this.x = 0;
    this.xVel = 0;
    this.h = 0;
    this.hVel = 0;
    this.speed = this.baseSpeed * 0.7;
    this.meter = 0;
    this.slowTime = 0;
    this.state = PlayerState.RIDING;
    this.stateTime = 0;
    this.shieldInvuln = 2.0;
    this.snail.group.rotation.set(0, 0, 0);
    this.jetFlame.visible = false;
    this.snail.setJetpack?.(false);
    this._damagedTimer = 0;
    this._deathPose = false;
    this._lookbackPose = null;
    this.snail.setWeaponLevel?.(this.weaponLevel);  // back to single shooter
  }

  finish() {
    this.state = PlayerState.FINISHED;
    this.stateTime = 0;
  }

  // ---- transform ----------------------------------------------------
  _syncTransform() {
    let pos, up;
    if (this.state === PlayerState.AIRBORNE || this.state === PlayerState.FALLING) {
      pos = this._airPos;
      up = this._airUp;
    } else {
      const fr = this.track.frameAt(this.s);
      up = fr.up;
      pos = this.track.surfacePoint(this.s, this.x).addScaledVector(up, this.h);
    }
    this.group.position.copy(pos);

    const fr = this.track.frameAt(this.s);
    const right = new THREE.Vector3().crossVectors(fr.tangent, up).normalize();
    const trueFwd = new THREE.Vector3().crossVectors(up, right).normalize();
    const m = new THREE.Matrix4().makeBasis(right, up, trueFwd.clone().negate());
    this.group.quaternion.setFromRotationMatrix(m);

    // Subtle, smoothed, clamped lean so the foot stays flat on the track and
    // the snail doesn't pivot wildly when the cursor jumps.
    const targetLean = clamp(-this.xVel * 0.012, -0.12, 0.12);
    this._lean = (this._lean ?? 0) + (targetLean - (this._lean ?? 0)) * 0.12;
    this.snail.group.rotation.z = this._lean;
    this.snail.parts.cannon.position.z = 0.3 + this._cannonRecoil * 0.18;

    // blink during grace/invincibility
    const blinking = this.shieldInvuln > 0 || this.invincible;
    this.snail.group.visible = blinking ? Math.floor(this.stateTime * 12) % 2 === 0 : true;
    if (this.invincible) {
      // golden glow tint via scale pulse
      const p = 1 + Math.sin(this.stateTime * 14) * 0.06;
      this.snail.parts.shellGroup.scale.setScalar(p);
    } else {
      this.snail.parts.shellGroup.scale.setScalar(1);
    }
  }

  animate(t) {
    const speedNorm = clamp(this.speed / this.maxSpeed, 0, 1.2);

    // keep the mounted weapon mesh in sync (level.js resets weaponLevel
    // directly on restart, bypassing upgradeWeapon)
    if (this.snail.setWeaponLevel && this._mountedWeapon !== this.weaponLevel) {
      this._mountedWeapon = this.weaponLevel;
      this.snail.setWeaponLevel(this.weaponLevel);
    }

    // drive the original Turbo animation pose from the player's state
    if (this.snail.setPose) {
      let pose = 'move';
      if (this._introPose) pose = 'talk';          // level-start "need for speed" intro
      else if (this.state === PlayerState.FINISHED) pose = 'skid';  // screech to a stop at the mail stop
      else if (this._deathPose) pose = 'shell';    // duck into shell on death
      else if (this.state === PlayerState.FALLING) pose = 'fall';
      else if (this._damagedTimer > 0) pose = 'damaged';
      else if (this._lookbackPose) pose = this._lookbackPose;  // glance back (a racer is on your tail)
      else if (speedNorm < 0.08 && this.grounded) pose = 'base';
      else if (speedNorm > 0.85) pose = 'bob';   // faster scoot with head bob
      this.snail.setPose(pose);
    }

    // original damage / invincible body skins (SNAIL-TURBO-DAMAGE/INVINCIBLE)
    if (this.snail.setSkin) {
      this.snail.setSkin(this.invincible ? 'invincible' : (this._damagedTimer > 0 ? 'damage' : 'base'));
    }

    this.snail.animate(t, speedNorm, this.grounded);
    this.jetFlame.scale.y = 1 + Math.sin(t * 30) * 0.3;
    this.jetFlame.material.opacity = 0.7 + Math.sin(t * 25) * 0.2;
  }
}

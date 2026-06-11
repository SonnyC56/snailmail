/**
 * A single playable run: owns the track, environment, player, entities,
 * weapons and camera, runs the simulation, and tracks score / packages /
 * postal-meter / lives / time. The host Game polls `status` and reacts to
 * lifecycle (won/lost) each frame.
 *
 * Death model (faithful to the original): falling off the road, touching a
 * slug, or maxing the postal meter costs a life and RESTARTS the stage.
 * Out of lives → run lost.
 */

import * as THREE from 'three';
import { Track } from '../track/track.js';
import { Environment } from '../track/environment.js';
import { Player, PlayerState } from './player.js';
import { EntityManager } from './entities.js';
import { WeaponSystem } from './weapons.js';
import { ChaseCamera } from './camera.js';
import { ParticleFX } from './fx.js';
import { clamp } from '../utils.js';
import { trackDefForLevel, entitiesForLevel, themeFor, themeForLevel } from '../data/levels.js';

export const RunStatus = {
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  RESTARTING: 'restarting',
  WON: 'won',
  LOST: 'lost',
};

const PKG_PTS = 100;
const KILL_PTS = { slug: 150, asteroid: 120, turret: 300 };
const SALT_DMG = 18;
const ASTEROID_DMG = 14;
const TURRET_TOUCH_DMG = 22;
const LASER_DMG = 16;

export class Level {
  constructor(ctx, level, mode, opts = {}) {
    this.ctx = ctx;
    this.level = level;
    this.mode = mode;
    this.theme = themeFor(level);
    // The road skin is the level's real Track index (0..3), decoupled from the
    // environment theme/backdrop — the same level can ride any of the four road
    // textures regardless of which world's palette its backdrop belongs to.
    this.roadTheme = themeForLevel(level);

    this.root = new THREE.Group();
    ctx.scene.add(this.root);

    this.track = new Track(trackDefForLevel(level));
    this.trackMesh = this.track.buildMesh(this.roadTheme);
    this.root.add(this.trackMesh);

    this.env = new Environment(ctx.scene, this.theme, this.track, level.seed);

    // map the original level's Speed (20..100) into world units
    const base = 18 + (level.speed ?? 40) * 0.34;
    this.player = new Player(this.track, { baseSpeed: base, maxSpeed: base * 1.7 });
    this.root.add(this.player.group);

    this.fx = new ParticleFX(ctx.scene);
    this.weapons = new WeaponSystem(this.track, this.root);

    this._entDefs = entitiesForLevel(level, this.track, mode);
    this.entities = new EntityManager(this.track, this.root, this._entDefs);
    this.totalPackages = this.entities.countTotal('package');

    this.cam = new ChaseCamera(ctx.camera, this.track);

    // Cinematic level-start: swing the camera around to Turbo's face while he
    // does his talk animation and delivers the "need for speed" line, then
    // settle into the chase as the countdown runs out.
    this.cam.startIntro(1.1, 1.9);
    this.player._introPose = true;
    this._introVoiceDone = false;

    this.enemyShots = [];

    this.status = RunStatus.COUNTDOWN;
    this.countdown = 3.999;
    this._lastCountdownInt = 4;
    this.time = 0;
    this.score = 0;
    this.packages = 0;
    this.kills = 0;
    this.lives = opts.lives ?? (mode === 'timetrial' ? 1 : 3);
    this.finished = false;

    this.onEvent = null;

    this._wire();
  }

  _emit(type, payload) { if (this.onEvent) this.onEvent(type, payload); }

  _wire() {
    const a = this.ctx.audio;
    const P = this.player;

    P.onFire = (w, origin, s, x) => {
      this.weapons.fire(w, s, x); a.fire?.(w.kind);
      // brief additive muzzle flash star-burst at the gun muzzle (PARTICLEBLASTERS)
      if (origin) {
        const col = w.kind === 'rocket' ? 0xffb060 : w.kind === 'laser' ? 0x8affa0 : 0xfff0a0;
        this.fx.flash(origin, 'PARTICLEBLASTERS', { color: col, size: 0.5, size1: 1.1, life: 0.12, spin: (Math.random() - 0.5) * 8 });
      }
    };
    P.onLand = () => a.land();
    P.onJumpPod = () => { a.jump(); a.voiceSet('supertramp', { gap: 5 }); };
    P.onRamp = () => { a.jump(); };   // ramp: just the hop cue, no "Supertramp!" call
    P.onFallStart = () => { a.fall(); this._loseLife('fall'); };
    // going postal: a fast invincible frenzy (player.goPostal already fired) —
    // NOT a life loss. Flash + rage voice + the postal loop sting.
    P.onMeterFull = () => { a.crash(); a.voiceSet?.('postal', { force: true }); this.cam.addShake(0.7); this._emit('postal', {}); };

    this.entities.onCollect = (e) => {
      const pos = e.mesh.position.clone();
      switch (e.type) {
        case 'package':
          this.packages++;
          this.score += PKG_PTS;
          a.collect(Math.min(this.packages, 8));
          this.fx.burst(pos, 0xffe9a0, 12, { speed: 5 });
          this._emit('package', { got: this.packages, total: this.totalPackages, pos });
          break;
        case 'heart':
          P.heal(35); a.powerup();
          this.fx.burst(pos, 0xff5577, 14, { speed: 5 });
          this._emit('heal', { pos });
          break;
        case 'ringWhite': {
          const w = P.upgradeWeapon(); a.powerup();
          this.fx.burst(pos, 0xffffff, 18, { speed: 6 });
          this._emit('weapon', { name: w.name, level: P.weaponLevel, pos });
          break;
        }
        case 'ringYellow': {
          const killed = this.entities.smartBomb(P.s);
          for (const k of killed) {
            this.score += KILL_PTS[k.type] ?? 100;
            this.fx.burst(k.mesh.position, 0xffd24d, 14, { speed: 7 });
            // blue garbage was launched tumbling — trail smoke off its arc too
            if (k.type === 'asteroid') this._garbageBlast(k);
          }
          this.kills += killed.length;
          a.boost(); this.cam.addShake(0.5);
          this.fx.flash(pos, 'PARTICLERING-BIG', { color: 0xffe27a, size: 3, size1: 11, life: 0.55, spin: 3 });
          // tight inner ring (small variant) snaps out fast inside the big one
          this.fx.flash(pos, 'PARTICLERING-SMALL', { color: 0xfff3c0, size: 1, size1: 4.5, life: 0.3, spin: -5 });
          this._emit('smartbomb', { count: killed.length, pos });
          break;
        }
        case 'jetpack':
          P.startJetpack(5); a.boost(); this.cam.addShake(0.2);
          this._emit('jetpack', { pos });
          break;
      }
    };

    this.entities.onHazard = (e) => {
      const pos = e.mesh.position.clone();
      switch (e.type) {
        case 'slug':
          if (P.invincible) {
            if (this.entities.damageEntity(e, 99)) { this.score += KILL_PTS.slug; this.kills++; this.fx.dirtBurst(pos, 22, { speed: 7 }); a.hit(); }
          } else if (P.knockOff()) {
            a.fall(); this.fx.burst(P.group.position, 0x9a4ecf, 18, { speed: 7 }); this._loseLife('slug');
          }
          break;
        case 'salt':
          this._damage(SALT_DMG, pos, 0xffffff); P.slow(1.0); break;
        case 'asteroid':
          if (!P.invincible) { this._damage(ASTEROID_DMG, pos, 0x8a7a6a); P.slow(0.8); }
          break;
        case 'turret':
          this._damage(TURRET_TOUCH_DMG, pos, 0xff8866); break;
        case 'ringRed':
          P.slow(2.2); a.hit();
          this.fx.burst(pos, 0xe04040, 10, { speed: 3 });
          this.fx.flash(pos, 'PARTICLESLOW-BIG', { color: 0xff6a6a, size: 2.4, size1: 6.5, life: 0.5, spin: -2 });
          // small secondary slow ring spins the other way for a denser stall burst
          this.fx.flash(pos, 'PARTICLESLOW-SMALL', { color: 0xffb0b0, size: 1.1, size1: 3.4, life: 0.35, spin: 3 });
          this._emit('slowed', { pos });
          break;
      }
    };

    this.entities.onTurretFire = (e, player) => this._spawnEnemyLaser(e);
    this.entities.onJumpPod = () => { P.launch(1); };
    this.entities.onRamp = () => { P.launch(0.6, { flat: true }); };
    this.entities.onMailStop = () => this._win();

    this.weapons.onHit = (e, shot) => {
      // slugs can ONLY be destroyed by lasers or rockets — the yellow blaster
      // (pellet) just pings off, so you must dodge slugs until you upgrade.
      if (e.type === 'slug' && shot.kind === 'pellet') {
        this.fx.burst(shot.mesh.position, 0xffe23d, 4, { speed: 3, life: 0.25 });
        return false;
      }
      const died = this.entities.damageEntity(e, shot.damage);
      if (died) {
        this.score += KILL_PTS[e.type] ?? 100;
        this.kills++;
        if (e.type === 'slug') {
          // slug destroyed: sprite flashes red (entities.damageEntity) then a
          // dirt-like clod explosion kicks up from the ground + squish + taunt
          this.fx.dirtBurst(e.mesh.position, 26, { speed: 8 });
          this.fx.flash(e.mesh.position, 'PARTICLEEXPLODE-SMALL', { color: 0x7a5836, size: 1.8, size1: 4.5, life: 0.4 });
          // greenish goo splat (SLUGGOO) on top of the dirt — the slug bursts
          this.fx.flash(e.mesh.position, 'SLUGGOO', { color: 0x9adf4a, size: 1.2, size1: 3.2, life: 0.35, spin: (Math.random() - 0.5) * 4 });
          a.hit(); a.voiceSet('enemies', { gap: 7 });
          a.slugVoice(['SLUG-DEATH1', 'SLUG-DEATH2', 'SLUG-DESTROY', 'SLUG-GOTHIM']);   // the slug's last words
        } else if (e.type === 'asteroid') {
          // blue garbage blasted away: entities.damageEntity launched it
          // tumbling in a random direction — trail SMOKE off the back of it +
          // a small spark pop, no big fireball.
          this._garbageBlast(e);
          a.hit();
        } else {
          const col = e.type === 'turret' ? 0xff8866 : 0x8a7a6a;
          this.fx.burst(e.mesh.position, col, e.type === 'turret' ? 22 : 14, { speed: 7 });
          this.fx.flash(e.mesh.position, e.type === 'turret' ? 'PARTICLEEXPLODE-BIG' : 'PARTICLEEXPLODE-SMALL', { color: e.type === 'turret' ? 0xffaa55 : 0xc8b89a, size: 2.2, size1: e.type === 'turret' ? 7 : 5, life: 0.45 });
          if (e.type === 'turret') this.cam.addShake(0.25);
        }
      } else {
        // damaged but alive: slugs flash red for a beat + a hit thunk + a yelp
        if (e.type === 'slug') { this.entities.flashHit(e, 0xff3030, 0.3); a.hit(); a.slugVoice(['SLUG-HIT1', 'SLUG-HIT2', 'SLUG-HIT3']); }
        this.fx.burst(shot.mesh.position, e.type === 'slug' ? 0x9a4ecf : 0xffe23d, 6, { speed: 4, life: 0.3 });
      }
      return died;
    };
    this.weapons.onImpactFx = (pos, kind) => {
      this.fx.burst(pos, kind === 'rocket' ? 0xffaa33 : 0xfff1a0, 6, { speed: 4, life: 0.3 });
      this.fx.flash(pos, 'COLLISION', { color: kind === 'rocket' ? 0xffbb55 : 0xffe9a0, size: 1.2, size1: 2.6, life: 0.22 });
    };
  }

  /**
   * Garbage-killed FX: the entity was already launched (entities.damageEntity
   * set e.fly with a random launch dir). Trail SMOKE puffs along that direction
   * so the blue garbage streams smoke as it tumbles off, plus a tiny spark pop.
   */
  _garbageBlast(e) {
    const pos = e.mesh.position.clone();
    const dir = e.fly?.dir ?? new THREE.Vector3(0, 1, 0);
    this.fx.smokeTrail(pos, dir, { puffs: 6, size: 0.9, size1: 2.4, life: 0.6, color: 0xbfc4cc, back: 1.6 });
    this.fx.burst(pos, 0x9fe0ff, 8, { speed: 5, life: 0.3 });
  }

  _damage(amount, pos, color) {
    const r = this.player.addDamage(amount);
    if (r) {
      this.ctx.audio.hit();
      this.fx.burst(pos, color, 10, { speed: 4 });
      this.cam.addShake(0.2);
      this._emit('damage', { meter: this.player.meterRatio });
    }
  }

  _spawnEnemyLaser(turret) {
    // turrets fire bright GREEN bolts at you (original ENEMYFIRE sound)
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x4dff3a }),
    );
    this.root.add(mesh);
    this.enemyShots.push({ s: turret.s, x: turret.x, mesh, speed: 46, dead: false });
    this.ctx.audio.enemyFire?.();
    this.ctx.audio.servo?.();   // the turret's mechanical whirr as it tracks/fires
  }

  _updateEnemyShots(dt) {
    const P = this.player;
    for (const sh of this.enemyShots) {
      if (sh.dead) continue;
      sh.s -= sh.speed * dt; // travel back toward the player
      const fr = this.track.frameAt(Math.max(0, sh.s));
      const pos = this.track.surfacePoint(Math.max(0, sh.s), sh.x).addScaledVector(fr.up, 1.0);
      sh.mesh.position.copy(pos);
      // reached the player?
      if (sh.s <= P.s + 0.5) {
        if (Math.abs(sh.x - P.x) < 1.2 && P.grounded) this._damage(LASER_DMG, P.group.position, 0x55ff55);
        sh.dead = true;
      }
      if (sh.s < P.s - 8) sh.dead = true;
    }
    for (let i = this.enemyShots.length - 1; i >= 0; i--) {
      if (this.enemyShots[i].dead) { this.root.remove(this.enemyShots[i].mesh); this.enemyShots.splice(i, 1); }
    }
  }

  _loseLife(cause) {
    if (this.finished || this.status === RunStatus.RESTARTING || this.status === RunStatus.LOST) return;

    // online race: respawn a little behind and keep racing (no game over)
    if (this.mode === 'multiplayer') {
      this._emit('life', { lives: this.lives, cause });
      const backS = Math.max(0, this.player.s - 25);
      this.status = RunStatus.RESTARTING;
      this._restartTimer = 0.8;
      this._raceRespawnS = backS;
      return;
    }

    this.lives--;
    // duck-into-shell death pose for non-fall deaths (falling has its own pose)
    if (cause !== 'fall') this.player._deathPose = true;
    this._emit('life', { lives: this.lives, cause });
    if (this.lives <= 0) {
      this.status = RunStatus.LOST;
      this.ctx.audio.gameOver();
      this._emit('lost', { cause });
    } else {
      this.status = RunStatus.RESTARTING;
      this._restartTimer = 1.5;
    }
  }

  _restartStage() {
    // rebuild entities so packages/enemies return, reset player + counters
    this.entities.dispose();
    this.weapons.clear();
    for (const sh of this.enemyShots) this.root.remove(sh.mesh);
    this.enemyShots.length = 0;
    this.entities = new EntityManager(this.track, this.root, this._entDefs);
    this._wireEntitiesOnly();
    this.player.respawn(0);
    this.player.weaponLevel = 0;
    this.score = 0;
    this.packages = 0;
    this.kills = 0;
    this.time = 0;
    this.cam.reset();
    this.status = RunStatus.COUNTDOWN;
    this.countdown = 2.999;
    this._lastCountdownInt = 3;
    this._emit('restarted', { lives: this.lives });
  }

  /** Re-attach entity callbacks after a rebuild (player hooks persist). */
  _wireEntitiesOnly() {
    const saved = { onFire: this.player.onFire }; // unchanged
    this._wire();
    this.player.onFire = saved.onFire;
  }

  _win() {
    if (this.finished) return;
    // Quota: the original requires delivering at least `Quota` parcels to pass.
    // Time-trial (time is the goal) and multiplayer races are exempt. Clamp to
    // the parcels actually spawned so a level can never be unwinnable.
    const quota = Math.min(this.level.quota ?? 0, this.totalPackages);
    if (quota > 0 && this.packages < quota && this.mode !== 'timetrial' && this.mode !== 'multiplayer') {
      this.finished = true;
      this.status = RunStatus.LOST;
      this.player.finish();
      this.ctx.audio.gameOver();
      this._emit('lost', { cause: 'quota', quota, delivered: this.packages });
      return;
    }
    this.finished = true;
    this.status = RunStatus.WON;
    this.player.finish();
    this.ctx.audio.fanfare();
    this._emit('won', this.buildSummary());
  }

  buildSummary() {
    const allPackages = this.totalPackages > 0 && this.packages >= this.totalPackages;
    const pkgRatio = this.totalPackages ? this.packages / this.totalPackages : 1;
    const lifeBonus = this.lives * 300;
    const perfectBonus = allPackages ? 1500 : 0;
    let timeBonus = 0;
    if (this.mode !== 'timetrial') {
      const par = this.level.length / (this.player.baseSpeed * 0.8);
      timeBonus = Math.max(0, Math.round((par - this.time) * 25));
    }
    const total = this.score + lifeBonus + perfectBonus + timeBonus;

    let medal;
    if (this.mode === 'timetrial') {
      const t = this.time;
      const gold = this.level.length / (this.player.maxSpeed * 0.72);
      const silver = this.level.length / (this.player.maxSpeed * 0.58);
      const bronze = this.level.length / (this.player.maxSpeed * 0.45);
      medal = t <= gold ? 'gold' : t <= silver ? 'silver' : t <= bronze ? 'bronze' : 'none';
    } else {
      medal = (pkgRatio >= 0.95) ? 'gold' : pkgRatio >= 0.75 ? 'silver' : pkgRatio >= 0.5 ? 'bronze' : 'none';
    }

    return {
      mode: this.mode, level: this.level,
      score: this.score, lifeBonus, perfectBonus, timeBonus, total,
      time: this.time, packages: this.packages, totalPackages: this.totalPackages,
      allPackages, kills: this.kills, lives: this.lives, medal,
    };
  }

  // ------------------------------------------------------------------
  update(dt, input) {
    switch (this.status) {
      case RunStatus.COUNTDOWN: this._updateCountdown(dt); break;
      case RunStatus.PLAYING: this._updatePlaying(dt, input); break;
      case RunStatus.RESTARTING: this._updateRestart(dt); break;
      case RunStatus.WON:
      case RunStatus.LOST: this._updateEnd(dt); break;
    }
    this.fx.update(dt);
    // Endless mode bonus: slowly drift the road + sky colour over the run so a
    // long procedural session visibly evolves.
    if (this.mode === 'procedural') {
      this._driftT = (this._driftT || 0) + dt;
      const phase = this._driftT / 100;        // one full hue cycle ~100s
      this.env?.setEndlessDrift?.(phase);
      this.track?.setEndlessDrift?.(phase);
    }
  }

  _updateCountdown(dt) {
    // Turbo's "I have a need for speed" line, once, as the camera finds his face
    if (!this._introVoiceDone) {
      this._introVoiceDone = true;
      this.ctx.audio.voiceFile?.('IFEELTHENEEDFORSPEED');
    }
    this.countdown -= dt;
    const i = Math.ceil(this.countdown);
    if (i < this._lastCountdownInt) {
      this._lastCountdownInt = i;
      if (i >= 1) { this.ctx.audio.countdownBeep(false); this._emit('countdown', { n: i }); }
      else { this.ctx.audio.countdownBeep(true); this._emit('countdown', { n: 0 }); }
    }
    // drop the talk pose once the camera has swung back behind him
    if (this.player._introPose && !this.cam.introActive) this.player._introPose = false;
    if (this.countdown <= 0) { this.status = RunStatus.PLAYING; this.player._introPose = false; this._emit('go', {}); }
    this.player.update(0, NO_INPUT);
    this.cam.update(dt, this.player);
  }

  _updatePlaying(dt, input) {
    this.time += dt;
    this.player.update(dt, input);
    this.entities.update(dt, this.time, this.player);
    this.weapons.update(dt, this.entities, this.player);
    this._updateEnemyShots(dt);
    this.cam.update(dt, this.player);

    // ambient Turbo chatter — the original _VOICE.TXT "Frequency:20"
    this._ambientT = (this._ambientT ?? 14) - dt;
    if (this._ambientT <= 0) { this._ambientT = 16 + Math.random() * 10; this.ctx.audio.voiceSet('misc', { gap: 5 }); }

    // "Snail alert!" — a slug barks when it first comes into range ahead
    for (const e of this.entities.entities) {
      if (e.type === 'slug' && e.alive && !e._alerted && e.s > this.player.s && e.s - this.player.s < 35) {
        e._alerted = true; this.ctx.audio.slugVoice(['SLUG-SNAILALERT'], { gap: 4 }); break;
      }
    }

    // rival-slug taunts: when a live slug is right alongside / passing the
    // player, it occasionally jeers ("he's too fast!" / victory crows). Fires
    // through the slug (SFX) bus with its own throttle so it never blocks Turbo.
    for (const e of this.entities.entities) {
      if (e.type === 'slug' && e.alive && !e._taunted && Math.abs(e.s - this.player.s) < 4) {
        e._taunted = true;
        if (Math.random() < 0.5) {
          const set = this.ctx.audio.voiceLines?.('slugTaunt') ?? ['SLUG-HESTOOFAST', 'SLUG-VICTORY', 'SLUG-VICTORY2'];
          this.ctx.audio.slugVoice(set, { gap: 8 });
        }
        break;
      }
    }

    // STARTAIL boost trail while going postal / invincible / jetpacking
    const P = this.player;
    if (P.invincible || P.postal || P.jetTime > 0) {
      this._trailT = (this._trailT ?? 0) - dt;
      if (this._trailT <= 0) {
        this._trailT = 0.05;
        const pos = this.track.surfacePoint(Math.max(0, P.s - 1.2), P.x).addScaledVector(this.track.surfaceNormal(P.s), 0.8 + P.h);
        this.fx.flash(pos, 'STARTAIL', { color: P.postal ? 0xff6a6a : 0xffe27a, size: 0.7, size1: 1.6, life: 0.35, spin: 6 });
      }
    }

    if (this.mode === 'arcade') {
      this.player.baseSpeed = Math.min(this.player.maxSpeed, this.player.baseSpeed + dt * 0.35);
    }
  }

  _updateRestart(dt) {
    this._restartTimer -= dt;
    this.player.update(dt, NO_INPUT);
    this.cam.update(dt, this.player);
    if (this._restartTimer <= 0) {
      if (this.mode === 'multiplayer') {
        this.player.respawn(this._raceRespawnS ?? 0);
        this.status = RunStatus.PLAYING;
        this.cam.reset();
      } else {
        this._restartStage();
      }
    }
  }

  _updateEnd(dt) {
    this.player.update(dt, NO_INPUT);
    this.cam.update(dt, this.player);
  }

  get progress() { return clamp(this.player.s / this.track.length, 0, 1); }

  frame(t) {
    this.player.animate(t);
    this.env.update(1 / 60, this.ctx.camera.position);
  }

  dispose() {
    this.ctx.scene.remove(this.root);
    this.entities.dispose();
    this.weapons.clear();
    this.env.dispose();
    this.fx.dispose(this.ctx.scene);
    this.trackMesh.traverse(o => o.geometry?.dispose?.());
  }
}

const NO_INPUT = { steer: 0, left: false, right: false, fireHeld: false };

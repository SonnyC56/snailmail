/**
 * Audio engine. Prefers the original extracted OGG sound set (SFX2 / MUSIC /
 * VOICE) and falls back to a built-in WebAudio synth for any sound that
 * hasn't loaded yet, so the game always has audio.
 */

import { assets } from '../assets.js';

const NOTE_BASE = 440;
function st(n) { return NOTE_BASE * Math.pow(2, n / 12); }
const NAMES = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2 };
function note(name) {
  if (!name || name === '-') return null;
  const m = name.match(/^([A-G]#?)(-?\d)$/);
  return m ? st(NAMES[m[1]] + (parseInt(m[2], 10) - 4) * 12) : null;
}

// core SFX to preload from SFX2/
const PRELOAD_SFX = [
  'TURBOFIRE1', 'TURBOFIRE2', 'LASER1', 'LASER2', 'LASER3', 'ROCKET1', 'ROCKET2', 'ROCKET3',
  'PLACEPACKAGE', 'PACKAGECOUNT', 'EXPLODERING', 'HEART', 'EXTRALIFE', 'INVINCIBLE', 'JETPACK',
  'BOING', 'WALLHIT', 'ASTEROIDIMPACT1', 'ASTEROIDIMPACT2', 'SLOWRING', 'ENEMYFIRE',
  'SELECT', 'HIGHLIGHT', 'CHEERS', 'PERFECT', 'SKIDSTOP', 'POSTALLOOP',
  'PW1', 'PW2', 'PW3', 'PW4', 'PW5', 'PW6', 'PW7',
];

// world index → original music track
const WORLD_MUSIC = ['1', '2', '3', '4'];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = this.sfxGain = this.musicGain = this.voiceGain = null;
    this.muted = localStorage.getItem('snailx.muted') === '1';
    this.musicOn = localStorage.getItem('snailx.music') !== '0';
    // per-bus volume levels (0..1), persisted; defaults near the original
    // _VOICE.TXT Normalize values (music ~50, sfx ~70, voice 90).
    const v = (k, d) => { const n = parseFloat(localStorage.getItem(k)); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d; };
    this.masterVol = v('snailx.vol.master', 1);
    this.musicVol = v('snailx.vol.music', 0.45);
    this.sfxVol = v('snailx.vol.sfx', 0.7);
    this._sfx = new Map();      // name -> AudioBuffer
    this._voiceList = null;     // [names]
    this._music = null;         // current music source
    this._seq = null;           // synth fallback sequencer
    this._noiseBuf = null;
    this._lastVoice = 0;
    this._fireToggle = 0;
    this.ready = false;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    assets.setAudioContext(this.ctx);

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.masterVol;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = this.sfxVol; this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.musicOn ? this.musicVol : 0; this.musicGain.connect(this.master);
    this.voiceGain = this.ctx.createGain(); this.voiceGain.gain.value = 0.9; this.voiceGain.connect(this.master);

    const len = this.ctx.sampleRate;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this._preload();
  }

  async _preload() {
    const jobs = PRELOAD_SFX.map(async (n) => {
      try { this._sfx.set(n, await assets.audioBuffer('SFX2', n)); } catch {}
    });
    // voice list (best-effort; names discovered lazily)
    jobs.push((async () => {
      try {
        const txt = await assets.text('VOICE/_VOICE.TXT');
        const names = [...txt.matchAll(/([A-Z0-9_]+)\.OGG/gi)].map(m => m[1].toUpperCase());
        this._voiceList = [...new Set(names)];
      } catch { this._voiceList = []; }
    })());
    await Promise.allSettled(jobs);
    this.ready = true;
  }

  toggleMute() { this.muted = !this.muted; localStorage.setItem('snailx.muted', this.muted ? '1' : '0'); if (this.master) this.master.gain.value = this.muted ? 0 : 1; return this.muted; }
  toggleMusic() { this.musicOn = !this.musicOn; localStorage.setItem('snailx.music', this.musicOn ? '1' : '0'); if (this.musicGain) this.musicGain.gain.value = this.musicOn ? this.musicVol : 0; return this.musicOn; }

  // ---- volume sliders (0..1) ---------------------------------------
  setMasterVolume(x) { this.masterVol = Math.max(0, Math.min(1, x)); localStorage.setItem('snailx.vol.master', this.masterVol); if (this.master && !this.muted) this.master.gain.value = this.masterVol; return this.masterVol; }
  setMusicVolume(x) { this.musicVol = Math.max(0, Math.min(1, x)); localStorage.setItem('snailx.vol.music', this.musicVol); this.musicOn = this.musicVol > 0; if (this.musicGain) this.musicGain.gain.value = this.musicVol; return this.musicVol; }
  setSfxVolume(x) { this.sfxVol = Math.max(0, Math.min(1, x)); localStorage.setItem('snailx.vol.sfx', this.sfxVol); if (this.sfxGain) this.sfxGain.gain.value = this.sfxVol; return this.sfxVol; }

  // ---- playback primitives ----------------------------------------
  _playBuf(buf, gainNode, { vol = 1, rate = 1 } = {}) {
    if (!buf || !this.ctx) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(gainNode);
    src.start();
    return src;
  }

  /** Play a named SFX buffer if present, else run a synth fallback fn. */
  _sound(name, fallback, opts) {
    const buf = this._sfx.get(name);
    if (buf) { this._playBuf(buf, this.sfxGain, opts); return; }
    if (fallback) fallback.call(this);
  }

  // ---- game SFX (real OGG, synth fallback) -------------------------
  fire(kind = 'pellet') {
    if (kind === 'laser') this._sound(['LASER1', 'LASER2', 'LASER3'][this._fireToggle++ % 3], this._synFire);
    else if (kind === 'rocket') this._sound(['ROCKET1', 'ROCKET2', 'ROCKET3'][this._fireToggle++ % 3], this._synFire);
    else this._sound(this._fireToggle++ % 2 ? 'TURBOFIRE2' : 'TURBOFIRE1', this._synFire, { vol: 0.7 });
  }
  collect() { this._sound('PLACEPACKAGE', this._synCollect, { vol: 0.8 }); }
  packageCount() { this._sound('PACKAGECOUNT', null); }
  powerup() { this._sound('EXPLODERING', this._synPowerup); }
  weaponUp(level = 1) { this._sound('PW' + Math.min(Math.max(level, 1), 7), this._synPowerup); }
  heart() { this._sound('HEART', this._synPowerup); }
  extraLife() { this._sound('EXTRALIFE', this._synPowerup); }
  invincible() { this._sound('INVINCIBLE', this._synPowerup); }
  jetpack() { this._sound('JETPACK', this._synBoost); }
  jump() { this._sound('BOING', this._synJump); }
  land() { this._sound('SKIDSTOP', this._synLand, { vol: 0.6 }); }
  boost() { this._sound('JETPACK', this._synBoost); }
  hit() { this._sound(Math.random() < 0.5 ? 'WALLHIT' : 'ASTEROIDIMPACT1', this._synHit); }
  crash() { this._sound('ASTEROIDIMPACT2', this._synCrash); }
  fall() { this._sound('SKIDSTOP', this._synFall); }
  slowRing() { this._sound('SLOWRING', this._synHit); }
  enemyFire() { this._sound('ENEMYFIRE', this._synFire, { vol: 0.5 }); }
  checkpoint() { this._sound('HIGHLIGHT', this._synCheckpoint); }
  click() { this._sound('SELECT', this._synClick); }
  highlight() { this._sound('HIGHLIGHT', null, { vol: 0.5 }); }
  countdownBeep(final = false) { this._sound(final ? 'PERFECT' : 'SELECT', () => this._synBeep(final)); }
  fanfare() { this._sound('CHEERS', this._synFanfare); }
  perfect() { this._sound('PERFECT', this._synFanfare); }
  gameOver() { this._synGameOver(); }

  /** Occasionally play a Turbo voice quip (throttled). */
  voice(filter) {
    if (!this._voiceList || !this._voiceList.length || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this._lastVoice < 2.5) return;
    let pool = this._voiceList;
    if (filter) pool = pool.filter(n => n.includes(filter)) ; if (!pool.length) pool = this._voiceList;
    const name = pool[Math.floor(Math.random() * pool.length)];
    assets.audioBuffer('VOICE', name).then(buf => { this._lastVoice = now; this._playBuf(buf, this.voiceGain, { vol: 0.9 }); }).catch(() => {});
  }

  /** Enemy slug barks — play through the SFX bus with their own throttle so
   *  they never block Turbo's own voice lines. */
  slugVoice(names, { gap = 1.6, vol = 0.7 } = {}) {
    if (!this.ctx || !names || !names.length) return;
    const now = this.ctx.currentTime;
    if (now - (this._lastSlug || 0) < gap) return;
    this._lastSlug = now;
    const name = names[Math.floor(Math.random() * names.length)];
    assets.audioBuffer('VOICE', name).then((buf) => this._playBuf(buf, this.sfxGain, { vol })).catch(() => {});
  }

  /** Turret servo whirr (the original SERVO1/2 mech sounds). */
  servo() {
    if (!this.ctx) return;
    const name = (this._fireToggle % 2) ? 'SERVO2' : 'SERVO1';
    assets.audioBuffer('SFX2', name).then((buf) => this._playBuf(buf, this.sfxGain, { vol: 0.4 })).catch(() => {});
  }

  /** Play one specific voice line by name (e.g. the tutorial's TUT1..TUT18). */
  voiceFile(name) {
    if (!this.ctx || !name) return;
    assets.audioBuffer('VOICE', name)
      .then(buf => { this._lastVoice = this.ctx.currentTime; this._playBuf(buf, this.voiceGain, { vol: 1 }); })
      .catch(() => {});
  }

  /** Play a random Turbo quip from a named set (from the original _VOICE.TXT). */
  voiceSet(setName, { force = false, gap = 2.0 } = {}) {
    if (!this.ctx) return;
    const set = VOICE_SETS[setName];
    if (!set || !set.length) return;
    const now = this.ctx.currentTime;
    if (!force && now - this._lastVoice < gap) return;
    const name = set[Math.floor(Math.random() * set.length)];
    assets.audioBuffer('VOICE', name)
      .then(buf => { this._lastVoice = this.ctx.currentTime; this._playBuf(buf, this.voiceGain, { vol: 0.95 }); })
      .catch(() => {});
  }

  // ---- music -------------------------------------------------------
  /** worldIndex selects the original gameplay track; 'menu' uses MAINMENU. */
  async playMusic(which) {
    if (!this.ctx) return;
    const name = which === 'menu' ? 'MAINMENU' : WORLD_MUSIC[(which | 0) % WORLD_MUSIC.length];
    if (this._musicName === name && this._music) return; // already playing this track
    this.stopMusic();
    this._musicName = name;
    const token = (this._musicToken = (this._musicToken || 0) + 1);
    try {
      const buf = await assets.audioBuffer('MUSIC', name);
      if (token !== this._musicToken) return;            // superseded by a newer request
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      src.connect(this.musicGain);
      src.start();
      this._music = src;
    } catch {
      if (token !== this._musicToken) return;
      this._playSynthSong(which === 'menu' ? 'menu' : 'meadow');
    }
  }

  stopMusic() {
    if (this._music) { try { this._music.stop(); } catch {} this._music = null; }
    if (this._seq) { clearTimeout(this._seq.timer); this._seq = null; }
    this._musicName = null;
  }

  // ==================================================================
  // Synth fallback (used only when an OGG hasn't loaded)
  // ==================================================================
  _env(g, t0, a, peak, d, sus = 0.0001) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(sus, t0 + a + d); }
  _tone({ type = 'square', freq = 440, freqEnd = null, dur = 0.15, vol = 0.5, attack = 0.005, when = 0 }) {
    if (!this.ctx) return; const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    this._env(g, t0, attack, vol, dur - attack); o.connect(g).connect(this.sfxGain); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  _noise({ dur = 0.2, vol = 0.4, freq = 1200, q = 1, freqEnd = null, when = 0, type = 'bandpass' }) {
    if (!this.ctx) return; const t0 = this.ctx.currentTime + when;
    const s = this.ctx.createBufferSource(); s.buffer = this._noiseBuf; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) f.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), t0 + dur);
    f.Q.value = q; const g = this.ctx.createGain(); this._env(g, t0, 0.005, vol, dur);
    s.connect(f).connect(g).connect(this.sfxGain); s.start(t0); s.stop(t0 + dur + 0.05);
  }
  _synFire() { this._tone({ type: 'square', freq: 700, freqEnd: 300, dur: 0.08, vol: 0.3 }); }
  _synCollect() { this._tone({ type: 'triangle', freq: 880, dur: 0.07, vol: 0.4 }); this._tone({ type: 'triangle', freq: 1320, dur: 0.1, vol: 0.35, when: 0.06 }); }
  _synPowerup() { this._tone({ type: 'square', freq: 523, freqEnd: 1046, dur: 0.18, vol: 0.3 }); }
  _synJump() { this._tone({ type: 'sine', freq: 300, freqEnd: 760, dur: 0.2, vol: 0.45 }); }
  _synLand() { this._noise({ dur: 0.08, vol: 0.22, freq: 500, freqEnd: 180 }); }
  _synBoost() { this._noise({ dur: 0.5, vol: 0.35, freq: 600, freqEnd: 4200, q: 2 }); }
  _synHit() { this._tone({ type: 'sawtooth', freq: 220, freqEnd: 60, dur: 0.22, vol: 0.5 }); this._noise({ dur: 0.18, vol: 0.3, freq: 350, freqEnd: 90 }); }
  _synCrash() { this._noise({ dur: 0.5, vol: 0.55, freq: 2500, freqEnd: 150, q: 0.7 }); this._tone({ type: 'square', freq: 320, freqEnd: 50, dur: 0.6, vol: 0.4 }); }
  _synFall() { this._tone({ type: 'sine', freq: 1100, freqEnd: 120, dur: 0.9, vol: 0.45 }); }
  _synCheckpoint() { this._tone({ type: 'triangle', freq: 659, dur: 0.1, vol: 0.35 }); this._tone({ type: 'triangle', freq: 880, dur: 0.16, vol: 0.35, when: 0.09 }); }
  _synClick() { this._tone({ type: 'square', freq: 700, dur: 0.05, vol: 0.22 }); }
  _synBeep(f) { this._tone({ type: 'square', freq: f ? 1040 : 520, dur: f ? 0.35 : 0.12, vol: 0.35 }); }
  _synFanfare() { ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => this._tone({ type: 'square', freq: note(n), dur: i === 3 ? 0.5 : 0.14, vol: 0.32, when: i * 0.13 })); }
  _synGameOver() { ['E4', 'D4', 'C4', 'B3'].forEach((n, i) => this._tone({ type: 'triangle', freq: note(n), dur: 0.3, vol: 0.38, when: i * 0.28 })); }

  _playSynthSong(name) {
    if (!this.ctx) return; this.stopMusic();
    const song = SYNTH_SONGS[name] || SYNTH_SONGS.menu;
    const stepDur = 60 / song.bpm / 4;
    const state = { song, step: 0, stepDur, timer: null, nextTime: this.ctx.currentTime + 0.05 };
    this._seq = state;
    const tick = () => {
      if (this._seq !== state) return;
      while (state.nextTime < this.ctx.currentTime + 0.12) { this._synthStep(state); state.nextTime += stepDur; state.step++; }
      state.timer = setTimeout(tick, 30);
    };
    tick();
  }
  _synthStep(state) {
    const { song, step, nextTime, stepDur } = state; const when = nextTime - this.ctx.currentTime;
    const get = (tr) => tr ? note(tr[step % tr.length]) : null;
    const mt = (type, freq, dur, vol) => { if (!freq) return; const t0 = this.ctx.currentTime + Math.max(0, when); const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g).connect(this.musicGain); o.start(t0); o.stop(t0 + dur + 0.05); };
    mt('triangle', get(song.bass), stepDur * 1.8, 0.5);
    mt('square', get(song.lead), stepDur * 0.9, 0.3);
  }
}

// Turbo voice quip sets — faithfully mirroring all 16 groupings in the
// original VOICE/_VOICE.TXT (uppercased OGG basenames).
const VOICE_SETS = {
  damage:    ['HEYIJUSTWAXED', 'IMGONNANEEDANEWSHELL', 'ITBURNS', 'MYEYES', 'THATSGONNALEAVEAMARK', 'UHOH'],
  dying:     ['ABANDONSHELL', 'IMFALLINGANDICANTGETUP', 'INEEDANEWJOB', 'NOTCOOL', 'THISISNOTMYDAY'],
  slugged:   ['INEEDANEWJOB', 'NOTCOOL', 'THISISNOTMYDAY'],
  wormtunnel:['WHOAHDUDE', 'ZIPPIDYDOODAH', 'WHOHOHOHOAH'],
  supertramp:['WHOAHDUDE', 'WOOHOO', 'WHOHOHOHOAH'],
  postal:    ['IMGOINGPOSTAL', 'IMGOINGPOSTAL2', 'IMGOINGPOSTAL3'],
  ouch:      ['OW1', 'OW2', 'OW3', 'OW4'],
  enemies:   ['ALWAYSTIPYOURMAILCARRIER', 'ALWAYSTIPYOURPOSTALWORKER', 'BACKOFF', 'BACKOFFSLUGS', 'COMINGTHROUGH', 'MAKEWAY'],
  fall:      ['FALL1', 'FALL2', 'FALL3'],
  package:   ['POSTAGEDUE', 'SOMEBODYCALLFORADELIVERY', 'SPECIALDELIVERY', 'SPEEDYDELIVERY'],
  misc:      ['CHECKMEOUT', 'DONTHATEME', 'FOOTACHE', 'GOTMAIL', 'ISURECOULDUSE', 'ITSNOTJUSTASHELL', 'MYNAMEISTURBO', 'PARTFOOTPARTTUMMY', 'SNAILSINSPACE', 'THATWASCOOL', 'HELLINASHELL', 'TRAILBLAZER', 'ESCARGOT'],
  powerup:   ['FULLYLOADED', 'HELLINASHELL', 'IMONFIRE', 'IMONFIREBABY', 'IMPACKIN', 'MYNEWMAILINGTECHNIQUE', 'MYSHELLISTRICKEDOUT', 'SMOKIN', 'SOMEBODYSTOPME', 'TRAILBLAZER', 'THATWASAWESOME'],
  slow:      ['AMIEVENMOVING', 'ANYSLOWER', 'COMEON', 'FASTERISBETTER', 'ICANDOBETTER', 'FASTERWOULDBEBETTER', 'ISLEEPFASTERTHANTHIS'],
  start:     ['ALLOWSIXTOEIGHTMINUTES', 'BRINGITON', 'IFEELTHENEEDFORSPEED', 'JUSTRYANDSTOPME', 'THISISAJOB', 'TURBOSTHENAME', 'WATCHOUT', 'ZOOMZOOM', 'SNAILMAILALWAYSONTIME', 'SNAILMAILINTHIRTYMINUTES'],
  victory:   ['HOWSTHATFOREXPRESSSERVICE', 'IDESERVEAPROMOTION', 'IDESERVEARAISE', 'IGOTAHOTFOOT', 'IMTHESNAIL', 'ONTIMEANDFEELINGFINE', 'SOMEBODYPINCHME'],
};

const SYNTH_SONGS = {
  menu: { bpm: 112, bass: ['C3', '-', 'G2', '-', 'A2', '-', 'E2', '-', 'F2', '-', 'C3', '-', 'G2', '-', 'G2', '-'], lead: ['E5', '-', 'G5', '-', 'A5', '-', 'G5', 'E5', '-', 'D5', 'C5', '-', 'D5', 'E5', '-', '-'] },
  meadow: { bpm: 124, bass: ['C3', 'C3', '-', 'C3', 'F2', '-', 'F2', '-', 'G2', 'G2', '-', 'G2', 'C3', '-', 'G2', '-'], lead: ['G5', '-', 'E5', 'G5', 'A5', 'G5', '-', 'E5', 'F5', '-', 'D5', 'F5', 'G5', '-', 'E5', '-'] },
};

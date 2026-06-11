/**
 * Three.js renderer/scene/camera setup with a fixed-timestep game loop.
 *
 * The game registers an `update(dt)` callback (fixed 120 Hz steps for stable
 * physics) and a `frame(alpha, elapsed)` callback for per-render work.
 */

import * as THREE from 'three';

const FIXED_DT = 1 / 120;
const MAX_STEPS = 8;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        stencil: false,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      this._showGlError();
      throw err;
    }
    this.renderer.setPixelRatio(this._targetPixelRatio());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Brighter overall exposure. ACES rolls off the top end, so we have headroom
    // to push this without blowing highlights out to flat white.
    this.renderer.toneMappingExposure = 1.45;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 900);
    this.camera.position.set(0, 4, 8);

    this.updateFns = [];
    this.frameFns = [];

    this._accum = 0;
    this._last = performance.now();
    this._elapsed = 0;
    this._running = false;

    window.addEventListener('resize', () => this._resize());
    // orientationchange fires before the new innerWidth/Height settle on some
    // mobile browsers — re-measure on the event and once more after it lands.
    window.addEventListener('orientationchange', () => {
      this._resize();
      setTimeout(() => this._resize(), 250);
    });
    this._resize();
  }

  /**
   * Sensible device-pixel-ratio cap. Desktop keeps min(dpr, 2); coarse-pointer
   * (touch) devices are capped lower on very high-DPI screens to protect fps,
   * since the fill cost grows with dpr^2.
   */
  _targetPixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    const coarse = typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    if (coarse) {
      // Phones/tablets: 1.5 is plenty crisp; allow up to ~1.75 on modest DPI.
      return Math.min(dpr, dpr >= 3 ? 1.5 : 1.75);
    }
    return Math.min(dpr, 2);
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // re-evaluate pixel ratio (DPI can change when moving between displays /
    // when the browser zoom or orientation changes the effective dpr).
    this.renderer.setPixelRatio(this._targetPixelRatio());
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _showGlError() {
    const el = document.getElementById('ui-root') || document.body;
    el.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
      color:#fff;font-family:sans-serif;text-align:center;padding:8vw;background:#0a0a1e">
      <div><h2>WebGL unavailable</h2><p>Snail Mail Remastered needs WebGL. Enable hardware acceleration
      in your browser settings and reload.</p></div></div>`;
  }

  onUpdate(fn) { this.updateFns.push(fn); }
  onFrame(fn) { this.frameFns.push(fn); }

  start() {
    if (this._running) return;
    this._running = true;
    this._last = performance.now();
    const loop = (now) => {
      if (!this._running) return;
      requestAnimationFrame(loop);
      let dt = (now - this._last) / 1000;
      this._last = now;
      // clamp huge gaps (tab switch) so we don't spiral
      dt = Math.min(dt, 0.25);
      this._elapsed += dt;
      this._accum += dt;
      let steps = 0;
      while (this._accum >= FIXED_DT && steps < MAX_STEPS) {
        for (const fn of this.updateFns) fn(FIXED_DT, this._elapsed);
        this._accum -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_STEPS) this._accum = 0;
      const alpha = this._accum / FIXED_DT;
      for (const fn of this.frameFns) fn(alpha, this._elapsed, dt);
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(loop);
  }

  stop() { this._running = false; }
}

/**
 * Keyboard + mouse + touch input for the ribbon racer.
 *
 * Controls (matching the original's steer + fire):
 *   Steer  : ←/→ or A/D, move the mouse left/right, or DRAG anywhere on the
 *            lower part of a touch screen (finger X tracks across the track),
 *            or tilt the device when window.SNAIL_CONFIG.tiltSteer is set.
 *   Fire   : hold Space / left mouse button / J, or the on-screen FIRE button.
 *   Pause  : Esc / P    Mute : M
 *
 * On touch devices the drag reuses the SAME signal path as the mouse
 * (`_mouseSteer` + `_useMouseSteer`) so the snail does absolute position
 * tracking of the finger via the game's `mouseActive`/`mouseLateral` getters.
 */

import { MobileControls } from './mobile.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.left = false;
    this.right = false;
    this.fireHeld = false;
    this.pausePressed = false;
    this.mutePressed = false;
    this.anyKeyPressed = false;

    this._down = new Set();
    this._mouseSteer = 0;       // -1..1 from mouse X
    this._mouseFire = false;
    this._touchSteer = 0;       // legacy left/right tap zones (unused now)
    this._touchFire = false;    // on-screen FIRE button held
    this._touchSteerActive = false; // a finger is dragging to steer
    this._useMouseSteer = false;

    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));
    window.addEventListener('blur', () => this._releaseAll());

    window.addEventListener('mousemove', (e) => {
      // ignore synthetic mouse events some touch browsers emit
      if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
      this._mouseSteer = this._steerFromX(e.clientX);
      this._useMouseSteer = true;
      this._touchSteerActive = false;
    });
    window.addEventListener('mousedown', (e) => {
      if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
      if (e.button === 0) { this._mouseFire = true; this.anyKeyPressed = true; this._refresh(); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
      if (e.button === 0) { this._mouseFire = false; this._refresh(); }
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    this._setupTouch();

    // Touch drag + on-screen fire button + optional tilt steering.
    this.mobile = new MobileControls(this);
  }

  /**
   * Normalized horizontal position across the screen, -1 (left) .. 1 (right).
   * 1.25 gain means the full track width is reached a bit before the very
   * screen edge, so the snail tracks the pointer closely.
   */
  _steerFromX(clientX) {
    const w = window.innerWidth || 1;
    return Math.max(-1, Math.min(1, ((clientX / w) - 0.5) * 2 * 1.25));
  }

  /** Drive absolute lateral steering from a touch/tilt source (mouse path). */
  setSteerLateral(value, active = true) {
    this._mouseSteer = Math.max(-1, Math.min(1, value));
    this._useMouseSteer = true;
    this._touchSteerActive = active;
  }

  /** Drive absolute lateral steering from a touch's clientX (mouse path). */
  setSteerFromClientX(clientX) {
    this.setSteerLateral(this._steerFromX(clientX), true);
  }

  /** Release a touch-drag steer (leaves last lateral target so it doesn't snap). */
  clearTouchSteer() {
    this._touchSteerActive = false;
  }

  /** Held state of the on-screen FIRE button (or auto-fire). */
  setTouchFire(held) {
    this._touchFire = !!held;
    if (held) this.anyKeyPressed = true;
    this._refresh();
  }

  _isLeft(c)  { return c === 'ArrowLeft' || c === 'KeyA'; }
  _isRight(c) { return c === 'ArrowRight' || c === 'KeyD'; }
  _isFire(c)  { return c === 'Space' || c === 'KeyJ' || c === 'ControlLeft' || c === 'ControlRight'; }

  _onKeyDown(e) {
    const c = e.code;
    if (c === 'Space' || c.startsWith('Arrow')) e.preventDefault();
    if (!this._down.has(c)) {
      if (c === 'Escape' || c === 'KeyP') this.pausePressed = true;
      if (c === 'KeyM') this.mutePressed = true;
      this.anyKeyPressed = true;
      if (this._isLeft(c) || this._isRight(c)) this._useMouseSteer = false; // keyboard overrides mouse
    }
    this._down.add(c);
    this._refresh();
  }

  _onKeyUp(e) { this._down.delete(e.code); this._refresh(); }

  _refresh() {
    let left = false, right = false, fire = false;
    for (const c of this._down) {
      if (this._isLeft(c)) left = true;
      if (this._isRight(c)) right = true;
      if (this._isFire(c)) fire = true;
    }
    this.left = left;
    this.right = right;
    this.fireHeld = fire || this._mouseFire || this._touchFire;
  }

  _releaseAll() {
    this._down.clear();
    this._mouseFire = this._touchFire = false;
    this._touchSteer = 0;
    this._touchSteerActive = false;
    this._refresh();
  }

  _setupTouch() {
    // The #touch-controls element holds the visible on-screen FIRE button.
    // Drag-to-steer is handled globally by MobileControls (it covers the lower
    // play area), so the old invisible left/right tap zones are no longer used
    // for steering — they remain as styling hooks but receive no handlers.
    const root = document.createElement('div');
    root.id = 'touch-controls';
    const app = document.getElementById('app');
    if (app) app.appendChild(root);
    this._touchRoot = root;
  }

  /** Steering axis in [-1, 1]: keyboard, else absolute (mouse/touch) target. */
  get steer() {
    const kb = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    if (kb !== 0) return kb;
    if (this._touchSteer !== 0) return this._touchSteer;
    if (this._useMouseSteer) return this._mouseSteer;
    return 0;
  }

  /** True when an absolute lateral target (mouse OR touch-drag) should drive position. */
  get mouseActive() {
    return this._useMouseSteer && !this.left && !this.right && this._touchSteer === 0;
  }
  /** Normalized lateral target in [-1, 1] (cursor or finger X). */
  get mouseLateral() { return this._mouseSteer; }

  /** Whether a touch drag is currently steering (for UI cues). */
  get touchSteerActive() { return this._touchSteerActive; }

  endFrame() {
    this.pausePressed = false;
    this.mutePressed = false;
    this.anyKeyPressed = false;
  }
}

/**
 * Mobile / touch controls for the ribbon racer.
 *
 * Steering: DRAG anywhere on the lower ~75% of the screen. The finger's X is
 *   fed into the SAME signal the mouse uses (Input.setSteerFromClientX → the
 *   game's `mouseActive` / `mouseLateral` getters), so the snail does absolute
 *   position tracking of the finger exactly like the desktop cursor.
 * Fire: a dedicated on-screen FIRE button (bottom-right) sets `fireHeld` while
 *   pressed. Multi-touch friendly — steer with one finger while another holds
 *   FIRE. An optional auto-fire toggle keeps `fireHeld` latched.
 * Tilt (opt-in): window.SNAIL_CONFIG.tiltSteer === true uses DeviceOrientation
 *   gamma for steering instead of drag (drag still works as a fallback).
 *
 * Everything here is inert on desktop (no touch / fine pointer): no listeners
 * mutate steering, the FIRE button is hidden by CSS (@media pointer: coarse).
 */

const cfg = () => (typeof window !== 'undefined' && window.SNAIL_CONFIG) || {};

// Coarse pointer => phone/tablet style touch device.
export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return (
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints || 0) > 0 ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
  );
}

export class MobileControls {
  constructor(input) {
    this.input = input;
    this.enabled = isTouchDevice();

    // The vertical band (from this fraction of the screen down) that acts as
    // the steering surface. Top quarter is left free for the HUD / pause.
    this.steerTopFrac = 0.25;

    this._steerTouchId = null;   // pointerId currently steering
    this._fireTouchIds = new Set();
    this._autoFire = false;
    this._tilt = cfg().tiltSteer === true;

    this._fireBtn = null;
    this._autoBtn = null;

    if (!this.enabled) return;

    this._buildUI();
    this._bindSteer();
    if (this._tilt) this._bindTilt();
    this._bindFullscreen();
  }

  // ---- on-screen buttons -------------------------------------------------
  _buildUI() {
    // Inject the FIRE button (and an auto-fire toggle) into the touch-controls
    // overlay created by Input._setupTouch(). Fall back to #app if needed.
    const host =
      document.getElementById('touch-controls') ||
      document.getElementById('app') ||
      document.body;

    const fire = document.createElement('button');
    fire.id = 'touch-fire';
    fire.className = 'touch-fire';
    fire.setAttribute('aria-label', 'Fire');
    fire.textContent = 'FIRE';
    fire.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._fireTouchIds.add(e.pointerId);
      try { fire.setPointerCapture(e.pointerId); } catch {}
      fire.classList.add('active');
      this.input.setTouchFire(true);
    });
    const release = (e) => {
      this._fireTouchIds.delete(e.pointerId);
      if (this._fireTouchIds.size === 0 && !this._autoFire) {
        fire.classList.remove('active');
        this.input.setTouchFire(false);
      }
    };
    fire.addEventListener('pointerup', (e) => { e.preventDefault(); release(e); });
    fire.addEventListener('pointercancel', release);
    fire.addEventListener('contextmenu', (e) => e.preventDefault());

    const auto = document.createElement('button');
    auto.id = 'touch-autofire';
    auto.className = 'touch-autofire';
    auto.setAttribute('aria-label', 'Toggle auto-fire');
    auto.textContent = 'AUTO';
    auto.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._autoFire = !this._autoFire;
      auto.classList.toggle('on', this._autoFire);
      this.input.setTouchFire(this._autoFire || this._fireTouchIds.size > 0);
      if (this._autoFire) fire.classList.add('active');
      else if (this._fireTouchIds.size === 0) fire.classList.remove('active');
    });

    host.appendChild(fire);
    host.appendChild(auto);
    this._fireBtn = fire;
    this._autoBtn = auto;
  }

  // ---- drag-to-steer (reuses the mouse path) -----------------------------
  _bindSteer() {
    // Listen on the document so a drag works over the canvas and the
    // (invisible) steer zones alike. We only claim a touch that starts in the
    // lower steering band and not on a UI button.
    const isUI = (target) => {
      if (!target || !target.closest) return false;
      // Ignore touches that begin on menus / buttons / the fire controls.
      return !!target.closest(
        '#ui-root, .screen, .btn, .sprite-btn, .galaxy-node, .level-star, ' +
        '.touch-fire, .touch-autofire, #orient-hint, input, button'
      );
    };
    const inSteerBand = (y) => y >= window.innerHeight * this.steerTopFrac;

    const onDown = (e) => {
      if (this._tilt) return;                 // tilt mode: drag disabled
      if (this._steerTouchId !== null) return; // already steering
      if (e.pointerType === 'mouse') return;  // real mice use the mouse path
      if (isUI(e.target)) return;
      if (!inSteerBand(e.clientY)) return;
      this._steerTouchId = e.pointerId;
      this.input.setSteerFromClientX(e.clientX);
    };
    const onMove = (e) => {
      if (e.pointerId !== this._steerTouchId) return;
      this.input.setSteerFromClientX(e.clientX);
      e.preventDefault();
    };
    const onUp = (e) => {
      if (e.pointerId !== this._steerTouchId) return;
      this._steerTouchId = null;
      this.input.clearTouchSteer();
    };

    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('pointercancel', onUp, { passive: true });

    // Block double-tap / pinch zoom on the game surface (belt & suspenders;
    // CSS touch-action also covers most of this).
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  // ---- tilt steering (DeviceOrientation gamma) ---------------------------
  _bindTilt() {
    const apply = (gamma) => {
      if (gamma == null || Number.isNaN(gamma)) return;
      // gamma: left/right tilt, -90..90. Map a comfortable ±35° to full lock.
      const norm = Math.max(-1, Math.min(1, gamma / 35));
      this.input.setSteerLateral(norm, true);
    };
    const handler = (e) => apply(e.gamma);

    // iOS 13+ needs an explicit permission request from a user gesture.
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      const ask = () => {
        DOE.requestPermission()
          .then((state) => { if (state === 'granted') window.addEventListener('deviceorientation', handler); })
          .catch(() => {});
        window.removeEventListener('pointerdown', ask);
      };
      window.addEventListener('pointerdown', ask, { once: true });
    } else {
      window.addEventListener('deviceorientation', handler);
    }
  }

  // ---- best-effort fullscreen on first touch -----------------------------
  _bindFullscreen() {
    if (cfg().fullscreen === false) return;
    const go = () => {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req && !document.fullscreenElement && !document.webkitFullscreenElement) {
        try { req.call(el).catch?.(() => {}); } catch {}
      }
      window.removeEventListener('pointerdown', go);
    };
    window.addEventListener('pointerdown', go, { once: true });
  }
}

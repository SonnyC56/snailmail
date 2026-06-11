/**
 * In-race HUD, laid out to match the ORIGINAL Snail Mail gameplay screen:
 *
 *   - SCORE centred at the top (weapon name underneath)
 *   - PARCEL count top-LEFT (original PARCELICON + "0/25")
 *   - a tall vertical DAMAGE / postal gauge on the RIGHT (DAMAGEGUAGE tube +
 *     DAMAGEGUAGEFULL fill revealed bottom->top by the meter ratio; flashes
 *     when in the danger band)
 *   - a tall vertical PROGRESS indicator on the LEFT (PROGRESS-BAR track,
 *     PROGRESS-BAR-LIT lit fill, PROGRESS-CURSOR marker that climbs the bar)
 *   - LIVES as snail-shell LIFE icons in the BOTTOM-LEFT corner
 *
 * A single `update(state)` call refreshes everything so the game loop stays
 * simple. Visuals use the original sprite art (decoded from TGA via
 * src/ui/sprites.js). Every sprite degrades gracefully: if it fails to load the
 * CSS-only fallbacks remain visible (never blank).
 */

import { getSpriteURL } from './sprites.js';

export class HUD {
  constructor(root) {
    this.root = root;
    root.classList.remove('hidden');
    root.innerHTML = `
      <div class="hud-top">
        <div class="hud-block">
          <div class="hud-label">Packages</div>
          <div class="hud-pkg-row">
            <span class="hud-parcel-icon" id="hud-parcel-icon"></span>
            <div class="hud-letters"><span id="hud-pkg">0</span><span style="opacity:.7">/</span><span id="hud-pkg-total">0</span></div>
          </div>
        </div>
        <div class="hud-block center">
          <div class="hud-label" id="hud-mid-label">Score</div>
          <div class="hud-value big" id="hud-score">0</div>
          <div id="hud-weapon" class="hud-weapon">Single Shooter</div>
        </div>
        <div class="hud-block right">
          <div class="hud-label" id="hud-timer-label">Time</div>
          <div class="hud-value" id="hud-timer">0:00.0</div>
        </div>
      </div>

      <!-- PROGRESS indicator: LEFT side, vertical. Track + lit fill + climbing cursor -->
      <div class="hud-progress-v" id="hud-progress-v" title="Level progress">
        <div class="hud-progress-track" id="hud-progress-track"></div>
        <div class="hud-progress-lit-clip" id="hud-progress-clip">
          <div class="hud-progress-lit" id="hud-progress-lit"></div>
        </div>
        <div class="hud-progress-cursor" id="hud-progress-cursor"></div>
        <div class="hud-progress-fallback"><div class="hud-progress-fallback-fill" id="hud-progress"></div></div>
      </div>

      <!-- DAMAGE / postal gauge: RIGHT side, vertical. Tube frame + fill bottom->top -->
      <div class="hud-gauge" id="hud-gauge" title="Postal meter">
        <div class="hud-gauge-frame" id="hud-gauge-frame"></div>
        <div class="hud-warning" id="hud-warning"></div>
        <div class="hud-gauge-fill-clip" id="hud-gauge-clip">
          <div class="hud-gauge-fill" id="hud-gauge-fill"></div>
        </div>
        <div class="hud-meter fallback"><div id="hud-meter-fill" class="hud-meter-fill"></div></div>
      </div>

      <!-- LIVES: bottom-left snail-shell icons -->
      <div class="hud-lives" id="hud-lives"></div>

      <!-- Pause / menu button: discoverable on-screen control to open the
           pause+quit menu without needing to know the Esc shortcut. -->
      <button class="hud-pause-btn" id="hud-pause-btn" type="button" title="Pause / Menu" aria-label="Pause / Menu">
        <span class="hud-pause-glyph"></span>
      </button>

      <div class="hud-mp" id="hud-mp"></div>
      <div class="hud-message" id="hud-message"></div>
      <div class="hud-countdown hidden" id="hud-countdown"></div>
    `;
    this.el = {
      pkg: root.querySelector('#hud-pkg'),
      pkgTotal: root.querySelector('#hud-pkg-total'),
      letters: root.querySelector('.hud-letters'),
      parcelIcon: root.querySelector('#hud-parcel-icon'),
      meter: root.querySelector('#hud-meter-fill'),
      gauge: root.querySelector('#hud-gauge'),
      gaugeFrame: root.querySelector('#hud-gauge-frame'),
      gaugeClip: root.querySelector('#hud-gauge-clip'),
      gaugeFill: root.querySelector('#hud-gauge-fill'),
      warning: root.querySelector('#hud-warning'),
      score: root.querySelector('#hud-score'),
      weapon: root.querySelector('#hud-weapon'),
      timer: root.querySelector('#hud-timer'),
      timerLabel: root.querySelector('#hud-timer-label'),
      midLabel: root.querySelector('#hud-mid-label'),
      lives: root.querySelector('#hud-lives'),
      // vertical progress indicator (left)
      progressV: root.querySelector('#hud-progress-v'),
      progressTrack: root.querySelector('#hud-progress-track'),
      progressClip: root.querySelector('#hud-progress-clip'),
      progressLit: root.querySelector('#hud-progress-lit'),
      progressCursor: root.querySelector('#hud-progress-cursor'),
      progress: root.querySelector('#hud-progress'), // fallback fill bar
      message: root.querySelector('#hud-message'),
      countdown: root.querySelector('#hud-countdown'),
      mp: root.querySelector('#hud-mp'),
      pauseBtn: root.querySelector('#hud-pause-btn'),
    };
    this._lastLives = -1;
    this._lastWeapon = '';
    this._lifeUrl = null;   // resolved snail-shell life icon (PNG data URL)
    this._parcelUrl = null; // resolved parcel sprite, reused by the fly-in
    this._flyEls = [];      // in-flight package elements (for cleanup)
    this._pkgLocked = false; // when set, the victory fly-in owns the parcel count
    this.onPause = null;    // host (Game) sets this to open the pause menu
    if (this.el.pauseBtn) {
      this.el.pauseBtn.addEventListener('click', (e) => { e.preventDefault(); this.onPause?.(); });
      // don't let a tap on the button also steer/fire the snail underneath
      this.el.pauseBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.el.pauseBtn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    }
    this._loadSprites();
  }

  /** Resolve the original HUD sprite art and swap it in over the CSS look. */
  _loadSprites() {
    // RIGHT: vertical postal/damage meter — empty tube as frame, bright tube as fill.
    getSpriteURL('SPRITES/DAMAGEGUAGE').then((url) => {
      if (!url) return; // keep CSS fallback bar
      this.el.gaugeFrame.style.backgroundImage = `url(${url})`;
      this.el.gauge.classList.add('has-sprite');
    });
    getSpriteURL('SPRITES/DAMAGEGUAGEFULL').then((url) => {
      if (url) { this._fillNormal = `url(${url})`; this.el.gaugeFill.style.backgroundImage = this._fillNormal; }
    });
    // brighter fill + warning icon for the danger band (postal meter near full)
    getSpriteURL('SPRITES/DAMAGEGUAGEBRIGHT').then((url) => { if (url) this._fillBright = `url(${url})`; });
    getSpriteURL('SPRITES/WARNING').then((url) => {
      if (url) this.el.warning.style.backgroundImage = `url(${url})`;
    });

    // LEFT: vertical progress indicator — track, lit fill, climbing cursor.
    getSpriteURL('SPRITES/PROGRESS-BAR').then((url) => {
      if (!url) return; // keep CSS fallback bar
      this.el.progressTrack.style.backgroundImage = `url(${url})`;
      this.el.progressV.classList.add('has-sprite');
    });
    getSpriteURL('SPRITES/PROGRESS-BAR-LIT').then((url) => {
      if (url) this.el.progressLit.style.backgroundImage = `url(${url})`;
    });
    getSpriteURL('SPRITES/PROGRESS-CURSOR').then((url) => {
      if (url) {
        this.el.progressCursor.style.backgroundImage = `url(${url})`;
        this.el.progressCursor.classList.add('has-sprite');
      }
    });

    // Parcel counter icon (top-left).
    getSpriteURL('SPRITES/PARCELICON').then((url) => {
      this._parcelUrl = url || null;
      if (url) {
        this.el.parcelIcon.style.backgroundImage = `url(${url})`;
        this.el.parcelIcon.classList.add('has-sprite');
      }
    });
    // Life icon (snail shell) — cached for the per-life redraw.
    getSpriteURL('SPRITES/LIFE').then((url) => {
      this._lifeUrl = url || null;
      this._lastLives = -1; // force a redraw with the real icon
    });
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  update(s) {
    // During the victory fly-in the count is driven by the animation, so don't
    // let the live sim value clobber it here.
    if (!this._pkgLocked) {
      this.el.pkg.textContent = s.packages;
      this.el.pkgTotal.textContent = s.totalPackages;
      // Quota: tint the parcel count red until the minimum delivery is met.
      if (s.quota > 0) this.el.pkg.style.color = s.packages >= s.quota ? '#9fe09f' : '#ff7777';
      else this.el.pkg.style.color = '';
    }
    this.el.score.textContent = s.score.toLocaleString('en-US');
    this.el.timer.textContent = s.timeText;

    // LEFT progress indicator: fills bottom->top as the player advances the
    // level (0 at the bottom, 1 at the top). The lit portion is revealed by a
    // clip and the cursor rides the top of that fill.
    const prog = Math.max(0, Math.min(1, s.progress));
    const progPct = (prog * 100).toFixed(1);
    this.el.progressClip.style.height = `${progPct}%`;
    // Cursor travels from the bottom (0%) to the top (100%) of the bar.
    this.el.progressCursor.style.bottom = `calc(${progPct}% - 16px)`;
    // CSS fallback fill (visible only until the bar sprite loads).
    this.el.progress.style.height = `${progPct}%`;

    // RIGHT postal/damage meter fill + danger flash. The original vertical
    // DAMAGEGUAGE fills bottom->top via a clip whose height = meter ratio:
    // a higher meter = more bright pink fill = more danger.
    const ratio = Math.max(0, Math.min(1, s.meter));
    const m = Math.round(ratio * 100);
    this.el.gaugeClip.style.height = `${(ratio * 100).toFixed(1)}%`;
    const danger = ratio > 0.75;
    if (danger !== this._danger) {
      this._danger = danger;
      this.el.gauge.classList.toggle('danger', danger);
      if (this._fillBright) this.el.gaugeFill.style.backgroundImage = danger ? this._fillBright : (this._fillNormal || '');
    }
    // CSS fallback bar (visible only if the gauge sprite never loaded).
    this.el.meter.style.height = `${m}%`;
    this.el.meter.style.background = m > 75
      ? 'linear-gradient(0deg,#ff7a2a,#e02020)'
      : m > 45 ? 'linear-gradient(0deg,#ffd24d,#ff8c1a)'
      : 'linear-gradient(0deg,#9fe09f,#46b646)';

    if (s.weapon !== this._lastWeapon) {
      this._lastWeapon = s.weapon;
      this.el.weapon.textContent = s.weapon;
      this.el.weapon.classList.remove('flash'); void this.el.weapon.offsetWidth;
      this.el.weapon.classList.add('flash');
    }

    if (s.lives !== this._lastLives) {
      this._lastLives = s.lives;
      this.el.lives.innerHTML = '';
      for (let i = 0; i < Math.max(0, s.lives); i++) {
        const sh = document.createElement('span');
        if (this._lifeUrl) {
          // original snail-shell LIFE sprite
          sh.className = 'life-icon';
          sh.style.backgroundImage = `url(${this._lifeUrl})`;
        } else {
          sh.className = 'life-icon fallback';
          sh.textContent = '🐌'; // fallback if the sprite failed to load
        }
        this.el.lives.appendChild(sh);
      }
    }

    if (s.timerLabel) this.el.timerLabel.textContent = s.timerLabel;
    if (s.midLabel) this.el.midLabel.textContent = s.midLabel;
  }

  /** Screen-space center (CSS pixels, viewport coords) of the parcel counter,
   *  the target the victory fly-in packages home in on. */
  packageCounterScreenPos() {
    const el = this.el.letters || this.el.parcelIcon;
    if (!el) return { x: 60, y: 60 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** Set the package count instantly and hand control of the visible number to
   *  the caller (the victory fly-in) so the live sim won't overwrite it. */
  setPackageCount(got, total) {
    this._pkgLocked = true;
    if (got != null) this.el.pkg.textContent = got;
    if (total != null) this.el.pkgTotal.textContent = total;
    this.el.pkg.style.color = '';
  }

  /** Animate one collected package flying from a screen point (CSS px) into the
   *  parcel counter. On arrival, optionally bump the visible count with a pop.
   *  `delay` (ms) staggers a burst of them. Degrades to a CSS parcel if the
   *  sprite is missing. Returns the element so callers can track it. */
  flyInPackage(from, { delay = 0, dur = 620, onArrive = null } = {}) {
    const elFly = document.createElement('div');
    elFly.className = 'hud-fly-pkg' + (this._parcelUrl ? '' : ' fallback');
    if (this._parcelUrl) elFly.style.backgroundImage = `url(${this._parcelUrl})`;
    this.root.appendChild(elFly);
    this._flyEls.push(elFly);

    const sx = from.x, sy = from.y;
    const start = performance.now() + delay;
    // a little lateral curve so the packages arc rather than slide straight
    const bend = (Math.random() - 0.5) * 160;

    const step = (now) => {
      if (!elFly.isConnected) return; // destroyed mid-flight
      const t = (now - start) / dur;
      if (t < 0) { requestAnimationFrame(step); return; }
      const to = this.packageCounterScreenPos(); // re-read so it tracks on resize
      if (t >= 1) {
        elFly.style.transform = `translate(${to.x}px, ${to.y}px) scale(0.5)`;
        elFly.style.opacity = '0';
        const i = this._flyEls.indexOf(elFly); if (i >= 0) this._flyEls.splice(i, 1);
        setTimeout(() => elFly.remove(), 60);
        if (onArrive) onArrive();
        // pop the counter as the parcel lands
        const L = this.el.letters;
        if (L) { L.classList.remove('bump'); void L.offsetWidth; L.classList.add('bump'); }
        return;
      }
      const e = 1 - Math.pow(1 - t, 3);           // easeOutCubic
      const x = sx + (to.x - sx) * e + bend * Math.sin(Math.PI * t);
      const y = sy + (to.y - sy) * e - 60 * Math.sin(Math.PI * t); // hop up then down
      const sc = 1 - 0.4 * e;
      elFly.style.transform = `translate(${x}px, ${y}px) scale(${sc})`;
      elFly.style.opacity = String(0.35 + 0.65 * Math.min(1, t * 4));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return elFly;
  }

  /** Live multiplayer standings (array of {name, progress, place, you}). */
  setMultiplayer(rows) {
    if (!rows || !rows.length) { this.el.mp.innerHTML = ''; return; }
    this.el.mp.innerHTML = rows.map((r, i) =>
      `<div class="hud-mp-row ${r.you ? 'you' : ''}"><span class="place">${i + 1}</span><span class="nm">${escapeHtml(r.name)}</span><span class="pct">${Math.round(r.progress * 100)}%</span></div>`
    ).join('');
  }

  flash(text, color) {
    const el = this.el.message;
    el.textContent = text;
    if (color) el.style.color = color;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  countdown(n) {
    const el = this.el.countdown;
    el.classList.remove('hidden');
    el.textContent = n > 0 ? String(n) : 'GO!';
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = 'cd-pop 0.9s ease';
    if (n === 0) setTimeout(() => el.classList.add('hidden'), 700);
  }

  destroy() {
    for (const el of this._flyEls) el.remove();
    this._flyEls.length = 0;
    this.root.innerHTML = '';
    this.root.classList.add('hidden');
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

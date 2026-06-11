/**
 * All menu/overlay screens, rendered into #ui-root. Each `show*` method
 * builds its DOM and wires buttons to callbacks supplied by the Game.
 * A single screen is visible at a time.
 *
 * FAITHFUL REMASTER: the original 2004 Snail Mail menus were authored as a
 * 640x512 (effectively 4:3) framed screen, stored as two power-of-two TGA
 * plates — a 512-wide "_A" plate plus a 128-wide "_B" right strip. We stitch
 * those back together (sprites.getCompositeURL) and present the whole framed
 * artwork LETTERBOXED/centered (object-fit: contain) inside a fixed-aspect
 * "stage", so it never cover-stretches into random cropped fragments. UI
 * controls are overlaid in the panel area of the frame. Everything degrades to
 * a clean CSS panel if a plate fails to decode.
 */

import { GALAXIES } from '../data/levels.js';
import { formatTime } from '../utils.js';
import {
  applyBackground, applyImage, preloadSprites,
  getCompositeURL, getSpriteURL,
} from './sprites.js';

// Medal tier -> CSS color class (no emoji; the original used a coloured star).
const MEDAL_CLASS = { gold: 'gold', silver: 'silver', bronze: 'bronze', none: '' };

// Original UI plates (TGA, decoded on demand by sprites.js). The split plates
// are reunited at render time: 512-wide "_A" + 128-wide "_B" = 640x512 screen.
const ART = {
  splashA: 'BACKGROUNDS/SPLASH_A', splashB: 'BACKGROUNDS/SPLASH_B',
  menuA: 'BACKGROUNDS/MENUBG_A', menuB: 'BACKGROUNDS/MENUBG_B',
  helpA: 'BACKGROUNDS/HELP_A', helpB: 'BACKGROUNDS/HELP_B',
  starmap: 'BACKGROUNDS/STARMAPBG',
  spaceMapLogo: 'GALAXY/SPACEMAPLOGO',
};
// Original button + cursor + marker sprites.
const BTN = {
  play: 'SPRITES/PLAY',
  more: 'SPRITES/MORE', moreHover: 'SPRITES/MOREHOVER',
  less: 'SPRITES/LESS', lessHover: 'SPRITES/LESSHOVER',
};
// Galaxy plates for the route map (GALAXY000..GALAXY009) — original 256x256
// spiral-galaxy art used as the star-map nodes.
const GALAXY_PLATES = Array.from({ length: 10 }, (_, i) => `GALAXY/GALAXY${String(i).padStart(3, '0')}`);
const GALAXY_SELECT = 'GALAXY/GALAXYSELECT'; // blue selection ring (128x128)
const LEVEL_SELECT = 'GALAXY/LEVELSELECT';   // blue ring for an individual level/star (64x64)

// Original star-map node placements. The 2004 "Intergalactic Delivery Route"
// scattered the galaxies as a constellation across the STARMAPBG nebula, joined
// by dotted routes. We lay the (up to 10) galaxies out as a winding course of
// percentage positions over the map so the route reads as a path through space.
const GALAXY_NODES = [
  { x: 12, y: 70 }, { x: 26, y: 42 }, { x: 38, y: 72 }, { x: 50, y: 38 },
  { x: 60, y: 68 }, { x: 70, y: 34 }, { x: 78, y: 66 }, { x: 86, y: 40 },
  { x: 50, y: 58 }, { x: 30, y: 60 },
];

// Warm the most-used plates so the title/menu paint without a flash.
preloadSprites([ART.splashA, ART.splashB, ART.menuA, ART.menuB, ART.starmap]);

export class Screens {
  constructor(root, audio, save) {
    this.root = root;
    this.audio = audio;
    this.save = save;
    this.cb = {};
  }

  on(events) { Object.assign(this.cb, events); return this; }

  clear() { this.root.innerHTML = ''; }
  _screen(cls = '') {
    this.clear();
    const s = document.createElement('div');
    s.className = `screen ${cls}`;
    this.root.appendChild(s);
    return s;
  }

  /**
   * Build a letterboxed 4:3 "stage" with the original framed art behind it.
   * `pathA`/`pathB` are the split plates (B may be null). The composited image
   * is shown with object-fit:contain so the whole frame stays visible and
   * centered on any screen. Returns { stage, inner } — put content in `inner`,
   * which is positioned inside the frame's panel window.
   */
  _stage(parent, pathA, pathB, { cls = '', framed = true } = {}) {
    const stage = document.createElement('div');
    stage.className = `stage ${cls}`;
    const art = document.createElement('img');
    art.className = 'stage-art';
    if (pathB) {
      getCompositeURL(pathA, pathB).then((url) => {
        if (url && art.isConnected) { art.src = url; stage.classList.add('has-sprite'); }
      });
    } else {
      applyImage(art, pathA);
      art.addEventListener('load', () => stage.classList.add('has-sprite'));
    }
    stage.appendChild(art);
    const inner = document.createElement('div');
    inner.className = `stage-inner ${framed ? 'framed' : ''}`;
    stage.appendChild(inner);
    parent.appendChild(stage);
    return { stage, inner };
  }

  _btn(label, onClick, cls = '') {
    const b = document.createElement('button');
    b.className = `btn ${cls}`;
    b.textContent = label;
    b.addEventListener('click', () => { this.audio.click(); onClick(); });
    b.addEventListener('mouseenter', () => this.audio.highlight());
    return b;
  }

  /** Original green PLAY sprite as a real button, with a text fallback. */
  _spriteBtn(spritePath, label, onClick, { cls = '', hoverPath = null } = {}) {
    const b = document.createElement('button');
    b.className = `sprite-btn ${cls}`;
    b.setAttribute('aria-label', label);
    const img = document.createElement('img');
    img.className = 'sprite-btn-img';
    img.alt = label;
    applyImage(img, spritePath);
    img.addEventListener('load', () => b.classList.add('has-sprite'));
    const fallback = document.createElement('span');
    fallback.className = 'sprite-btn-label';
    fallback.textContent = label;
    b.append(img, fallback);
    if (hoverPath) {
      let hoverUrl = null;
      getSpriteURL(hoverPath).then((u) => { hoverUrl = u; });
      let baseUrl = null;
      getSpriteURL(spritePath).then((u) => { baseUrl = u; });
      b.addEventListener('mouseenter', () => { if (hoverUrl) img.src = hoverUrl; });
      b.addEventListener('mouseleave', () => { if (baseUrl) img.src = baseUrl; });
    }
    b.addEventListener('click', () => { this.audio.click(); onClick(); });
    b.addEventListener('mouseenter', () => this.audio.highlight());
    return b;
  }

  _row(...els) { const r = document.createElement('div'); r.className = 'btn-row'; r.append(...els); return r; }

  // ---- title ----
  showTitle() {
    // The original SPLASH plate carries the full title art (Snail Mail logo +
    // Turbo on his rocket). We reunite SPLASH_A + SPLASH_B into the full 640x512
    // splash and letterbox it; the menu sits below on a dim base.
    const s = this._screen('splash-screen');
    const { inner } = this._stage(s, ART.splashA, ART.splashB, { cls: 'splash-stage', framed: false });

    const menu = document.createElement('div');
    menu.className = 'menu-list title-menu';
    menu.append(
      this._btn('Play', () => this.cb.play?.()),
      this._btn('How to Play', () => this.showHelp(), 'secondary'),
      this._btn('Options', () => this.showOptions(), 'secondary'),
    );
    inner.appendChild(menu);

    // CSS title fallback only shown if the splash art fails to decode.
    const fb = document.createElement('div');
    fb.className = 'title-fallback';
    fb.innerHTML = `
      <div class="game-title">Snail&nbsp;Mail</div>
      <div class="game-subtitle">Intergalactic Postal Service</div>`;
    inner.insertBefore(fb, menu);

    this._versionTag(s);
  }

  _versionTag(s) {
    const v = document.createElement('div');
    v.className = 'version-tag';
    v.textContent = 'a fan remaster · original assets © Sandlot Games';
    s.appendChild(v);
  }

  // ---- mode select ----
  showModeSelect() {
    const s = this._screen('menu-screen');
    const { inner } = this._stage(s, ART.menuA, ART.menuB, { cls: 'menu-stage' });
    const panel = document.createElement('div');
    panel.className = 'frame-panel';
    panel.innerHTML = `<h2>Choose a Mode</h2>`;
    const list = document.createElement('div');
    list.className = 'menu-list';
    list.append(
      this._btn('Tutorial', () => this.cb.mode?.('tutorial')),
      this._btn('Story — Postal Route', () => this.cb.mode?.('story')),
      this._btn('Arcade — Score Attack', () => this.cb.mode?.('arcade'), 'secondary'),
      this._btn('Time Trial', () => this.cb.mode?.('timetrial'), 'secondary'),
      this._btn('Endless — Procedural', () => this.cb.mode?.('procedural'), 'secondary'),
      this._btn('Online Race', () => this.cb.mode?.('multiplayer'), 'secondary'),
    );
    panel.appendChild(list);
    panel.appendChild(this._row(this._btn('Back', () => this.showTitle(), 'small secondary')));
    inner.appendChild(panel);
  }

  // ---- galaxy / level select (Intergalactic Delivery Route star-map) ----
  showLevelSelect(mode) {
    // Faithful evocation of the original star-map: STARMAPBG nebula plate as the
    // deep-space backdrop, the SPACEMAPLOGO banner up top, the spiral GALAXY
    // plates scattered as route nodes joined by dotted slipstream routes, and
    // the GALAXYSELECT ring highlighting the current galaxy. Clicking a galaxy
    // reveals its stars (levels) in the route panel — clicking a star starts it.
    const s = this._screen('starmap-screen');
    applyBackground(s, ART.starmap, { 'background-size': 'cover', 'background-position': 'center' });

    const logo = document.createElement('img');
    logo.className = 'starmap-logo';
    applyImage(logo, ART.spaceMapLogo);
    s.appendChild(logo);
    const title = document.createElement('div');
    title.className = 'starmap-title';
    title.textContent = mode === 'timetrial' ? 'Time Trial Route' : 'Intergalactic Delivery Route';
    s.appendChild(title);

    // The star-map: an aspect-fixed field over which galaxy nodes are absolutely
    // positioned by percentage, with an SVG route layer connecting them.
    const map = document.createElement('div');
    map.className = 'starmap-field';

    const n = GALAXIES.length;
    const pos = (gi) => GALAXY_NODES[gi % GALAXY_NODES.length];

    // dotted route lines between consecutive galaxies (the "slipstream")
    const svgNS = 'http://www.w3.org/2000/svg';
    const routes = document.createElementNS(svgNS, 'svg');
    routes.setAttribute('class', 'starmap-routes');
    routes.setAttribute('viewBox', '0 0 100 100');
    routes.setAttribute('preserveAspectRatio', 'none');
    for (let gi = 0; gi < n - 1; gi++) {
      const a = pos(gi), b = pos(gi + 1);
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      const lit = mode === 'story' ? this.save.isWorldUnlocked(gi + 1) : true;
      line.setAttribute('class', `route-line ${lit ? 'lit' : ''}`);
      routes.appendChild(line);
    }
    map.appendChild(routes);

    // The level/star panel shown for the selected galaxy.
    const starPanel = document.createElement('div');
    starPanel.className = 'starmap-stars';
    s.appendChild(starPanel); // appended after map below; ordering set later

    const nodes = [];
    const selectGalaxy = (gi) => {
      nodes.forEach((nd, i) => nd.classList.toggle('selected', i === gi));
      this._renderGalaxyStars(starPanel, mode, gi);
    };

    GALAXIES.forEach((g, gi) => {
      const unlocked = mode === 'story' ? this.save.isWorldUnlocked(gi) : true;
      const p = pos(gi);
      const node = document.createElement('button');
      node.className = `galaxy-node ${unlocked ? '' : 'locked'}`;
      node.style.left = `${p.x}%`;
      node.style.top = `${p.y}%`;
      node.setAttribute('aria-label', g.name);

      const plateWrap = document.createElement('div');
      plateWrap.className = 'galaxy-plate';
      const plateImg = document.createElement('img');
      applyImage(plateImg, GALAXY_PLATES[gi % GALAXY_PLATES.length]);
      const ring = document.createElement('img');
      ring.className = 'galaxy-ring';
      applyImage(ring, GALAXY_SELECT);
      plateWrap.append(plateImg, ring);
      node.appendChild(plateWrap);

      const name = document.createElement('div');
      name.className = 'galaxy-name';
      name.textContent = g.name;
      node.appendChild(name);

      if (unlocked) {
        node.addEventListener('click', () => { this.audio.click(); selectGalaxy(gi); });
        node.addEventListener('mouseenter', () => this.audio.highlight());
      } else {
        const lock = document.createElement('div');
        lock.className = 'galaxy-lock';
        node.appendChild(lock);
      }
      nodes.push(node);
      map.appendChild(node);
    });

    s.appendChild(map);
    s.appendChild(starPanel); // keep the star panel above the map base
    s.appendChild(this._row(this._btn('Back', () => this.cb.back?.(), 'small secondary')));

    // open the first unlocked galaxy by default
    let first = 0;
    if (mode === 'story') { while (first < GALAXIES.length - 1 && !this.save.isWorldUnlocked(first)) first++; }
    selectGalaxy(first);
  }

  /** Render the star (level) selectors for a galaxy into the route panel. */
  _renderGalaxyStars(panel, mode, gi) {
    const g = GALAXIES[gi];
    panel.innerHTML = '';
    if (!g) return;
    const head = document.createElement('div');
    head.className = 'starmap-stars-head';
    head.textContent = g.name;
    panel.appendChild(head);

    const stars = document.createElement('div');
    stars.className = 'star-list';
    g.levels.forEach((lv, li) => {
      const lvUnlocked = mode === 'story' ? this.save.isLevelUnlocked(gi, li) : true;
      const done = this.save.isCompleted(lv.id);
      const medal = this.save.medal(lv.id);
      const star = document.createElement('button');
      star.className = `level-star ${lvUnlocked ? '' : 'locked'} ${done ? 'done' : ''} ${medal !== 'none' ? `medal-${medal}` : ''}`;
      star.setAttribute('aria-label', `Level ${li + 1}`);

      const ring = document.createElement('img');
      ring.className = 'level-star-ring';
      applyImage(ring, LEVEL_SELECT);
      const num = document.createElement('span');
      num.className = 'level-star-num';
      num.textContent = li + 1;
      star.append(ring, num);

      if (lvUnlocked) {
        star.addEventListener('click', () => { this.audio.click(); this.cb.startLevel?.(gi, li); });
        star.addEventListener('mouseenter', () => this.audio.highlight());
      }
      stars.appendChild(star);
    });
    panel.appendChild(stars);
  }

  // ---- Star Wars–style intro crawl ----
  showIntroCrawl(onDone) {
    const s = this._screen('crawl-screen');
    s.innerHTML = `
      <div class="crawl-sky"></div>
      <div class="crawl-viewport">
        <div class="crawl-text">
          <div class="crawl-logo">SNAIL MAIL</div>
          <p>A long delivery ago, in a galaxy spiralling far, far away...</p>
          <p>The worlds of the Spiral Galaxy are bound together by the <b>SLIPSTREAM</b> — glowing ribbons of mail-highway that arc between the stars.</p>
          <p>But the <b>SLUG SYNDICATE</b> has blockaded the routes, peddling instant nothing-grams to replace heartfelt letters, and threatening to shut snail mail down forever.</p>
          <p>Only one rookie courier still rides the old tubes. Scoop up every parcel, blast through the blockade, and prove the slow way still delivers...</p>
          <p>His name is <b>TURBO</b>.</p>
        </div>
      </div>
      <div class="crawl-skip-hint">click or press any key to skip</div>`;
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      clearTimeout(this._crawlTimer);
      window.removeEventListener('keydown', finish);
      onDone();
    };
    this._crawlTimer = setTimeout(finish, 30000);
    s.addEventListener('click', finish);
    window.addEventListener('keydown', finish);
  }

  // ---- story interlude ----
  showStory(cards, onDone) {
    let i = 0;
    const render = () => {
      const s = this._screen('dim');
      const card = document.createElement('div');
      card.className = 'frame-panel story-card';
      const c = cards[i];
      card.innerHTML = `
        <div class="story-art" style="background:${STORY_ART[c.art] || '#1a1440'}">${storyArtSvg(c.art)}</div>
        <div class="story-speaker">${c.speaker}</div>
        <div class="story-text">${escapeHtml(c.text)}</div>
      `;
      const next = this._btn(i < cards.length - 1 ? 'Next' : 'Begin', () => {
        i++;
        if (i < cards.length) render();
        else onDone();
      });
      const skip = this._btn('Skip', () => onDone(), 'small secondary');
      card.appendChild(this._row(next, skip));
      s.appendChild(card);
    };
    render();
  }

  // ---- results ----
  showResults(summary, ctx) {
    const s = this._screen('menu-screen');
    const { inner } = this._stage(s, ART.menuA, ART.menuB, { cls: 'menu-stage' });
    const panel = document.createElement('div');
    panel.className = 'frame-panel';
    const win = summary.outcome !== 'lost';
    panel.innerHTML = `<h2>${win ? 'Route Complete!' : 'Out of Lives'}</h2>`;

    const rows = document.createElement('div');
    rows.className = 'results-rows';
    const add = (label, val) => { const r = document.createElement('div'); r.className = 'results-row'; r.innerHTML = `<span>${label}</span><span class="val">${val}</span>`; rows.appendChild(r); };
    add('Packages', `${summary.packages} / ${summary.totalPackages}`);
    add('Score', summary.score.toLocaleString('en-US'));
    if (summary.mode === 'timetrial') add('Time', formatTime(summary.time));
    if (win) {
      if (summary.timeBonus) add('Time Bonus', `+${summary.timeBonus.toLocaleString('en-US')}`);
      if (summary.perfectBonus) add('Perfect Delivery!', `+${summary.perfectBonus.toLocaleString('en-US')}`);
      if (summary.lifeBonus) add('Lives Bonus', `+${summary.lifeBonus.toLocaleString('en-US')}`);
    }
    const total = document.createElement('div');
    total.className = 'results-row total';
    total.innerHTML = `<span>Total</span><span class="val">${(win ? summary.total : summary.score).toLocaleString('en-US')}</span>`;
    rows.appendChild(total);
    panel.appendChild(rows);

    if (win && summary.medal && summary.medal !== 'none') {
      const m = document.createElement('div');
      m.className = `medal-banner medal-${MEDAL_CLASS[summary.medal]}`;
      m.innerHTML = `<span class="medal-star"></span> ${summary.medal.toUpperCase()} MEDAL <span class="medal-star"></span>`;
      panel.appendChild(m);
    }
    if (ctx.newBest) { const b = document.createElement('div'); b.className = 'medal-banner'; b.style.color = '#46b646'; b.textContent = 'New Best!'; panel.appendChild(b); }

    const buttons = [];
    if (win && ctx.hasNext) buttons.push(this._btn('Next', () => this.cb.next?.()));
    buttons.push(this._btn('Retry', () => this.cb.retry?.(), 'secondary'));
    buttons.push(this._btn('Menu', () => this.cb.menu?.(), 'secondary'));
    panel.appendChild(this._row(...buttons));
    inner.appendChild(panel);
  }

  // ---- pause ----
  showPause() {
    const s = this._screen('menu-screen');
    const { inner } = this._stage(s, ART.menuA, ART.menuB, { cls: 'menu-stage' });
    const panel = document.createElement('div');
    panel.className = 'frame-panel';
    panel.innerHTML = `<h2>Paused</h2>`;
    const list = document.createElement('div');
    list.className = 'menu-list';
    list.append(
      this._btn('Resume', () => this.cb.resume?.()),
      this._btn('Restart', () => this.cb.retry?.(), 'secondary'),
      this._btn('Quit to Menu', () => this.cb.menu?.(), 'secondary'),
    );
    panel.appendChild(list);
    inner.appendChild(panel);
  }

  // ---- options ----
  showOptions() {
    const s = this._screen('menu-screen');
    const { inner } = this._stage(s, ART.menuA, ART.menuB, { cls: 'menu-stage' });
    const panel = document.createElement('div');
    panel.className = 'frame-panel';
    panel.innerHTML = `<h2>Options</h2>`;
    const list = document.createElement('div');
    list.className = 'menu-list';
    const muteBtn = this._btn(`Sound: ${this.audio.muted ? 'OFF' : 'ON'}`, () => { const m = this.audio.toggleMute(); muteBtn.textContent = `Sound: ${m ? 'OFF' : 'ON'}`; });
    const musicBtn = this._btn(`Music: ${this.audio.musicOn ? 'ON' : 'OFF'}`, () => { const m = this.audio.toggleMusic(); musicBtn.textContent = `Music: ${m ? 'ON' : 'OFF'}`; }, 'secondary');
    const resetBtn = this._btn('Reset Progress', () => { if (confirm('Erase all progress and records?')) { this.save.reset(); alert('Progress reset.'); } }, 'secondary');
    list.append(muteBtn, musicBtn, resetBtn);
    panel.appendChild(list);
    panel.appendChild(this._row(this._btn('Back', () => this.showTitle(), 'small secondary')));
    inner.appendChild(panel);
  }

  // ---- help ----
  showHelp() {
    // The original HELP plate is a complete pre-rendered legend (Turbo, item
    // icons, descriptions, controls bar). HELP_A + HELP_B reunite into the full
    // 640x512 screen; we letterbox it whole and overlay only a Back button.
    const s = this._screen('help-screen');
    const { inner } = this._stage(s, ART.helpA, ART.helpB, { cls: 'help-stage', framed: false });

    // Text fallback panel, shown only if the legend art fails to decode.
    const panel = document.createElement('div');
    panel.className = 'frame-panel help-panel';
    panel.innerHTML = `
      <h2>How to Play</h2>
      <div class="help-text">
        You are <b>Turbo</b>, the fastest snail in the galaxy. Race the mail
        highway, scoop up every <b>parcel</b>, and reach the <b>mail stop</b>.<br><br>
        <b>Steer</b> &nbsp;<span class="key">◀</span><span class="key">▶</span> / <span class="key">A</span><span class="key">D</span> / mouse<br>
        <b>Fire cannon</b> &nbsp;hold <span class="key">Space</span> / left-click<br>
        <b>Pause</b> <span class="key">Esc</span> &nbsp; <b>Mute</b> <span class="key">M</span><br><br>
        ▸ Shoot <b>slugs</b>, <b>asteroids</b> and <b>turrets</b> — or dodge them.<br>
        ▸ <b>Salt</b> can't be shot: steer around it or your postal meter fills up.<br>
        ▸ Grab <b>white rings</b> to upgrade your cannon, <b>hearts</b> to heal,
        <b>yellow rings</b> to bomb everything ahead.<br>
        ▸ <b>Jump pods</b> fling you over gaps; <b>jetpacks</b> fly you across.<br>
        ▸ Touch a slug or fall off the road and you lose a life!
      </div>
    `;
    inner.appendChild(panel);
    s.appendChild(this._row(this._btn('Got it!', () => this.showTitle())));
  }

  hide() { this.clear(); }
}

const STORY_ART = {
  'post-office': 'radial-gradient(circle at 50% 30%, #ffb340, #7a4a1f)',
  meadow: 'linear-gradient(#bfe8ff,#76c34a)', desert: 'linear-gradient(#ffd9a0,#e8b05c)',
  ice: 'linear-gradient(#9fd4e8,#b8e4f0)', volcano: 'linear-gradient(#b83a1a,#2a0a14)',
  cosmic: 'linear-gradient(#4a1a6e,#12041e)', syndicate: 'radial-gradient(circle at 50% 40%, #9a4ecf, #2a0a3e)',
};

function storyArtSvg(art) {
  // simple decorative silhouettes so the card isn't empty (no emoji)
  const wrap = (svg) => `<div style="display:flex;align-items:center;justify-content:center;height:100%">${svg}</div>`;
  const col = art === 'syndicate' ? '#d6a6ff' : art === 'post-office' ? '#ffd24d' : '#bfe8ff';
  if (art === 'post-office') {
    // mailbox
    return wrap(`<svg width="120" height="120" viewBox="0 0 24 24" fill="${col}" opacity="0.9"><path d="M4 8a4 4 0 0 1 8 0v8H4z"/><rect x="12" y="10" width="8" height="6" rx="1"/><rect x="6.5" y="16" width="2" height="4"/><rect x="3" y="9.5" width="6" height="1.6" fill="#1a1440"/></svg>`);
  }
  if (art === 'syndicate') {
    // slug villain silhouette
    return wrap(`<svg width="130" height="120" viewBox="0 0 32 24" fill="${col}" opacity="0.9"><path d="M3 18c0-5 4-9 9-9 5 0 8 3 9 6l4-3v3l-3 2c0 2-2 4-5 4H6a3 3 0 0 1-3-3z"/><circle cx="22" cy="6" r="1.4"/><circle cx="26" cy="6" r="1.4"/></svg>`);
  }
  // snail (Turbo)
  return wrap(`<svg width="130" height="120" viewBox="0 0 32 24" fill="${col}" opacity="0.9"><path d="M4 19c0-2 2-3 4-3h3a8 8 0 1 0-1-16 9 9 0 0 1 4 17H6l-2 2z"/><circle cx="18" cy="10" r="5" fill="none" stroke="#1a1440" stroke-width="1.4"/><circle cx="18" cy="10" r="2.2" fill="none" stroke="#1a1440" stroke-width="1.2"/></svg>`);
}

function escapeHtml(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

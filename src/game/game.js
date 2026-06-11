/**
 * Top-level game controller: owns the flow between menus and live runs,
 * drives the HUD, and persists progress. The render loop calls update(dt)
 * (fixed step) and frame(alpha) (per render).
 */

import { Level, RunStatus } from './level.js';
import { HUD } from '../ui/hud.js';
import { Screens } from '../ui/screens.js';
import { GALAXIES, getLevel, themeFor, allLevels, getTutorialLevel, TUTORIAL_STEPS, proceduralLevel } from '../data/levels.js';
import { TutorialGuide } from './tutorialGuide.js';
import { storyFor } from '../data/story.js';
import { PlayerState } from './player.js';
import { formatTime } from '../utils.js';

const State = { TITLE: 'title', MENU: 'menu', STORY: 'story', PLAYING: 'playing', PAUSED: 'paused', RESULTS: 'results' };

export class Game {
  constructor(ctx) {
    this.ctx = ctx; // { renderer, scene, camera, input, audio, save }
    this.hudRoot = document.getElementById('hud');
    this.uiRoot = document.getElementById('ui-root');
    this.hud = null;
    this.screens = new Screens(this.uiRoot, ctx.audio, ctx.save);

    this.state = State.TITLE;
    this.mode = 'story';
    this.level = null;
    this.current = { gi: 0, li: 0 };
    this._wonHandled = false;
    this._lostHandled = false;

    this._wireScreens();
    this.online = null; // set by multiplayer module
  }

  _wireScreens() {
    this.screens.on({
      play: () => this.goModeSelect(),
      mode: (m) => this.pickMode(m),
      back: () => this.goModeSelect(),
      startLevel: (gi, li) => this.beginLevelFlow(gi, li),
      next: () => this.nextLevel(),
      retry: () => this.mode === 'procedural' ? this.startProcedural(this._procIdx ?? 0) : this.startLevel(this.current.gi, this.current.li),
      menu: () => this.quitToMenu(),
      resume: () => this.resume(),
    });
  }

  start() {
    // brief original LOADING screen on boot, then the title
    this.screens.showLoading(() => {
      this.ctx.audio.playMusic('menu');
      this.screens.showTitle();
    });
  }

  // ---- navigation --------------------------------------------------
  goModeSelect() {
    this._teardownLevel();
    this.state = State.MENU;
    this.ctx.audio.playMusic('menu');
    this.screens.showModeSelect();
  }

  pickMode(mode) {
    if (mode === 'multiplayer') { this.startOnline(); return; }
    if (mode === 'tutorial') { this.startTutorial(); return; }
    if (mode === 'procedural') { this.startProcedural(0); return; }
    this.mode = mode;
    this.state = State.MENU;
    this.screens.showLevelSelect(mode);
  }

  /** Endless mode: an infinite run of freshly procedurally-generated routes.
   *  Each route obeys the passability rules in proceduralEntities, and the
   *  difficulty ramps as `idx` climbs. Finishing one rolls into the next. */
  startProcedural(idx = 0) {
    this._teardownLevel();
    this.mode = 'procedural';
    this._procIdx = idx;
    const level = proceduralLevel({ idx, seed: 9000 + idx * 131 });
    this.current = { gi: 0, li: idx };
    this._wonHandled = this._lostHandled = false;
    this.hud = new HUD(this.hudRoot);
    this.level = new Level(this.ctx, level, 'procedural', { lives: 3 });
    this.level.onEvent = (t, p) => this.onLevelEvent(t, p);
    this.ctx.audio.playMusic(themeFor(level).musicWorld ?? 0);
    this.state = State.PLAYING;
    this.screens.hide();
  }

  /** The guided original Tutorial: replay TUTORIAL.TXT with its timed voice. */
  startTutorial() {
    this._teardownLevel();
    this.mode = 'tutorial';
    const level = getTutorialLevel();
    this.current = { gi: 0, li: 0 };
    this._wonHandled = this._lostHandled = false;
    this.hud = new HUD(this.hudRoot);
    this.level = new Level(this.ctx, level, 'tutorial', { lives: 5 });
    this.level.onEvent = (t, p) => this.onLevelEvent(t, p);
    this.tutorialGuide = new TutorialGuide(TUTORIAL_STEPS, this.ctx.audio);
    this.ctx.audio.playMusic(themeFor(level).musicWorld ?? 0);
    this.state = State.PLAYING;
    this.screens.hide();
  }

  beginLevelFlow(gi, li) {
    if (this.mode === 'story' && li === 0) {
      const cards = storyFor(gi, GALAXIES.length, 'intro');
      const showCards = () => {
        if (cards && cards.length) {
          this.state = State.STORY;
          this.screens.showStory(cards, () => this.startLevel(gi, li));
        } else this.startLevel(gi, li);
      };
      // Star Wars–style crawl once, before the very first route
      if (gi === 0 && !this.ctx.save.data.seenIntro) {
        this.ctx.save.markSeenIntro();
        this.state = State.STORY;
        this.screens.showIntroCrawl(showCards);
        return;
      }
      showCards();
      return;
    }
    this.startLevel(gi, li);
  }

  // ---- run lifecycle ----------------------------------------------
  startLevel(gi, li) {
    this._teardownLevel();
    const level = getLevel(gi, li);
    if (!level) { this.goModeSelect(); return; }
    this.current = { gi, li };
    this._wonHandled = this._lostHandled = false;

    this.hud = new HUD(this.hudRoot);
    this.level = new Level(this.ctx, level, this.mode);
    this.level.onEvent = (t, p) => this.onLevelEvent(t, p);

    this.ctx.audio.playMusic(themeFor(level).musicWorld ?? 0);
    this.state = State.PLAYING;
    this.screens.hide();
  }

  /** Build a race level for online play (shared level id + seed). */
  startRaceLevel(levelId, seed) {
    this._teardownLevel();
    const base = allLevels().find(l => l.id === levelId) || allLevels()[0];
    const level = { ...base, seed };       // override seed so every client builds the same track
    this.mode = 'multiplayer';
    this.current = { gi: level.galaxyIndex, li: level.levelIndex };
    this._wonHandled = this._lostHandled = false;
    this.hud = new HUD(this.hudRoot);
    this.level = new Level(this.ctx, level, 'multiplayer', { lives: 99 });
    this.level.onEvent = (t, p) => this.onLevelEvent(t, p);
    this.ctx.audio.playMusic(themeFor(level).musicWorld ?? 0);
    this.state = State.PLAYING;
    this.screens.hide();
    this.online?.attachLevel(this.level);
  }

  _teardownLevel() {
    if (this.level) { this.level.dispose(); this.level = null; }
    if (this.hud) { this.hud.destroy(); this.hud = null; }
    if (this.tutorialGuide) { this.tutorialGuide.destroy(); this.tutorialGuide = null; }
  }

  onLevelEvent(type, p) {
    const a = this.ctx.audio;
    switch (type) {
      case 'countdown': this.hud?.countdown(p.n); break;
      case 'go': this.hud?.flash('GO!', '#ffd24d'); break; // start quip already played during the level-start intro
      case 'package':
        if (p.got === p.total) { this.hud?.flash('All Parcels!', '#9fe09f'); a.perfect(); }
        else a.voiceSet('package', { gap: 7 });   // occasional "special delivery!" quip
        break;
      case 'weapon': this.hud?.flash(p.name + '!', '#ffffff'); a.weaponUp(p.level); a.voiceSet('powerup'); if (p.level >= 7) a.invincible(); break;
      case 'heal': a.heart(); break;
      case 'jetpack': this.hud?.flash('Jetpack!', '#66ccff'); a.jetpack(); break;
      case 'smartbomb': this.hud?.flash('BOOM!', '#ffd24d'); break;
      case 'slowed': this.hud?.flash('Slowed!', '#e04040'); a.slowRing(); a.voiceSet('slow', { gap: 6 }); break;
      case 'damage': a.voiceSet(Math.random() < 0.5 ? 'ouch' : 'damage'); break;
      case 'postal': this.hud?.flash('GOING POSTAL!', '#ff3a3a'); break;
      case 'life':
        if (p.cause === 'slug') a.voiceSet('slugged', { force: true });
        else if (p.cause === 'fall') a.voiceSet('fall', { force: true });
        else if (p.cause === 'postal') a.voiceSet('postal', { force: true });
        this.hud?.flash(p.lives > 0 ? 'Ouch!' : '', '#ff7777');
        break;
      case 'restarted': this.hud?.flash('Try Again!', '#ffd24d'); break;
      case 'won': this.handleWon(p); break;
      case 'lost': this.handleLost(p); break;
    }
  }

  // ---- update / frame ---------------------------------------------
  update(dt) {
    const input = this.ctx.input;

    // global keys
    if (input.mutePressed) this.ctx.audio.toggleMute();

    if (this.state === State.PLAYING) {
      if (input.pausePressed) { this.pause(); return; }
      this.level.update(dt, input);
      if (this.online) this.online.update(dt, this.level);
      if (this.tutorialGuide) this.tutorialGuide.update(this.level.player.s, dt);
    } else if (this.state === State.PAUSED) {
      if (input.pausePressed) this.resume();
    }
  }

  frame(alpha, elapsed) {
    if (this.level) {
      this.level.frame(elapsed);
      if (this.hud && (this.state === State.PLAYING || this.state === State.PAUSED)) {
        this.hud.update(this._hudState());
        if (this.online) this.hud.setMultiplayer(this.online.standings());
      }
    }
  }

  _hudState() {
    const lv = this.level;
    const timerText = lv.mode === 'timetrial' || lv.mode === 'arcade' ? formatTime(lv.time)
      : formatTime(lv.time);
    return {
      packages: lv.packages,
      totalPackages: lv.totalPackages,
      quota: (lv.mode === 'timetrial' || lv.mode === 'multiplayer') ? 0 : (lv.level.quota ?? 0),
      score: lv.score,
      meter: lv.player.meterRatio,
      weapon: lv.player.weapon.name,
      timeText: timerText,
      timerLabel: lv.mode === 'timetrial' ? 'Time' : 'Time',
      midLabel: 'Score',
      lives: lv.lives,
      progress: lv.progress,
    };
  }

  // ---- pause -------------------------------------------------------
  pause() {
    if (this.state !== State.PLAYING) return;
    this.state = State.PAUSED;
    this.screens.showPause();
  }
  resume() {
    if (this.state !== State.PAUSED) return;
    this.state = State.PLAYING;
    this.screens.hide();
  }

  // ---- results -----------------------------------------------------
  handleWon(summary) {
    if (this._wonHandled) return;
    this._wonHandled = true;
    summary.outcome = 'won';
    this.ctx.audio.voiceSet('victory', { force: true });   // "How's that for express service!"

    // online race: report our time; the server drives the results screen
    if (this.mode === 'multiplayer') {
      this.online?.onLocalFinish(summary);
      this.hud?.flash('FINISHED!', '#ffd24d');
      this.state = State.RESULTS;
      return;
    }

    const ctx = { newBest: false, hasNext: this._hasNext() };

    const lv = this.level.level;
    if (this.mode === 'story') {
      this.ctx.save.completeStoryLevel(this.current.gi, this.current.li, lv.id, GALAXIES);
      this.ctx.save.recordMedal(lv.id, summary.medal);
      ctx.newBest = this.ctx.save.recordScore(lv.id, summary.total);
    } else if (this.mode === 'timetrial') {
      ctx.newBest = this.ctx.save.recordTime(lv.id, summary.time);
      this.ctx.save.recordMedal(lv.id, summary.medal);
    } else if (this.mode === 'arcade') {
      ctx.newBest = this.ctx.save.recordArcade(summary.total);
    }

    // delay so the win fanfare + finish animation read before the panel
    setTimeout(() => {
      this.state = State.RESULTS;
      // story outro after the last level of a galaxy
      const isGalaxyEnd = this.current.li >= GALAXIES[this.current.gi].levels.length - 1;
      if (this.mode === 'story' && isGalaxyEnd) {
        const cards = storyFor(this.current.gi, GALAXIES.length, 'outro');
        this.screens.showStory(cards, () => this.screens.showResults(summary, ctx));
      } else {
        this.screens.showResults(summary, ctx);
      }
    }, 1800);
  }

  handleLost(info) {
    if (this._lostHandled) return;
    this._lostHandled = true;
    const summary = this.level.buildSummary();
    summary.outcome = 'lost';
    if (info?.cause === 'quota') {
      summary.failReason = `Quota not met — delivered ${info.delivered} of ${info.quota}`;
      this.hud?.flash('Not enough mail delivered!', '#ff7777');
    }
    this.ctx.audio.voiceSet('dying', { force: true });   // "I need a new job..."
    setTimeout(() => {
      this.state = State.RESULTS;
      this.screens.showResults(summary, { newBest: false, hasNext: false });
    }, 1600);
  }

  _hasNext() {
    if (this.mode === 'procedural') return true;   // endless: there's always another route
    const g = GALAXIES[this.current.gi];
    if (this.current.li < g.levels.length - 1) return true;
    return this.current.gi < GALAXIES.length - 1;
  }

  nextLevel() {
    if (this.mode === 'procedural') { this.startProcedural((this._procIdx ?? 0) + 1); return; }
    let { gi, li } = this.current;
    const g = GALAXIES[gi];
    if (li < g.levels.length - 1) li++;
    else if (gi < GALAXIES.length - 1) { gi++; li = 0; }
    else { this.quitToMenu(); return; }
    this.beginLevelFlow(gi, li);
  }

  quitToMenu() {
    this._teardownLevel();
    if (this.online) { this.online.leave(); this.online = null; }
    this.goModeSelect();
  }

  // ---- multiplayer (implemented in net module; lazy import) --------
  async startOnline() {
    this.mode = 'multiplayer';
    const { startOnlineRace } = await import('../net/online.js');
    startOnlineRace(this);
  }
}

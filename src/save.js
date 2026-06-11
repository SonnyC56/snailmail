/**
 * localStorage-backed persistence: story progress, per-level medals/best
 * scores, time-trial best times, arcade high scores, and settings.
 */

const KEY = 'snailx.save.v1';

const DEFAULT = {
  story: { unlockedWorld: 0, unlockedLevel: 0, completed: {} }, // completed['meadow-0']=true
  medals: {},     // 'meadow-0' -> 'bronze'|'silver'|'gold'
  bestScore: {},  // 'meadow-0' -> number
  bestTime: {},   // 'meadow-0' -> seconds (time trial)
  arcadeHigh: 0,
  seenIntro: false,
  settings: { muted: false, music: true },
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    const data = JSON.parse(raw);
    return { ...structuredClone(DEFAULT), ...data,
      story: { ...DEFAULT.story, ...(data.story || {}) },
      medals: data.medals || {},
      bestScore: data.bestScore || {},
      bestTime: data.bestTime || {},
      settings: { ...DEFAULT.settings, ...(data.settings || {}) },
    };
  } catch {
    return structuredClone(DEFAULT);
  }
}

class Save {
  constructor() { this.data = load(); }

  _flush() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch {}
  }

  // ---- story progression ----
  isWorldUnlocked(worldIndex) { return worldIndex <= this.data.story.unlockedWorld; }

  isLevelUnlocked(worldIndex, levelIndex) {
    if (worldIndex < this.data.story.unlockedWorld) return true;
    if (worldIndex > this.data.story.unlockedWorld) return false;
    return levelIndex <= this.data.story.unlockedLevel;
  }

  isCompleted(levelId) { return !!this.data.story.completed[levelId]; }

  /** Mark a story level done and unlock the next. worldCount/levelCount per world from caller. */
  completeStoryLevel(worldIndex, levelIndex, levelId, worldsMeta) {
    this.data.story.completed[levelId] = true;
    const world = worldsMeta[worldIndex];
    const lastLevel = levelIndex >= world.levels.length - 1;
    if (lastLevel) {
      if (worldIndex < worldsMeta.length - 1) {
        if (this.data.story.unlockedWorld < worldIndex + 1) {
          this.data.story.unlockedWorld = worldIndex + 1;
          this.data.story.unlockedLevel = 0;
        }
      }
    } else if (worldIndex === this.data.story.unlockedWorld && levelIndex >= this.data.story.unlockedLevel) {
      this.data.story.unlockedLevel = levelIndex + 1;
    }
    this._flush();
  }

  // ---- records ----
  recordScore(levelId, score) {
    if (!(levelId in this.data.bestScore) || score > this.data.bestScore[levelId]) {
      this.data.bestScore[levelId] = Math.round(score);
      this._flush();
      return true;
    }
    return false;
  }

  recordMedal(levelId, medal) {
    const order = { none: 0, bronze: 1, silver: 2, gold: 3 };
    const cur = this.data.medals[levelId] || 'none';
    if (order[medal] > order[cur]) {
      this.data.medals[levelId] = medal;
      this._flush();
      return true;
    }
    return false;
  }

  recordTime(levelId, seconds) {
    if (!(levelId in this.data.bestTime) || seconds < this.data.bestTime[levelId]) {
      this.data.bestTime[levelId] = seconds;
      this._flush();
      return true;
    }
    return false;
  }

  recordArcade(score) {
    if (score > this.data.arcadeHigh) { this.data.arcadeHigh = Math.round(score); this._flush(); return true; }
    return false;
  }

  medal(levelId) { return this.data.medals[levelId] || 'none'; }
  best(levelId) { return this.data.bestScore[levelId] ?? 0; }
  time(levelId) { return this.data.bestTime[levelId] ?? null; }

  markSeenIntro() { this.data.seenIntro = true; this._flush(); }

  setSetting(k, v) { this.data.settings[k] = v; this._flush(); }

  reset() { this.data = structuredClone(DEFAULT); this._flush(); }
}

export const save = new Save();

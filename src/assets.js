/**
 * Asset loader for the original Snail Mail media (extracted from the user's
 * own copy of the game) plus a resolver seam so textures can later be served
 * from an upscaled / AI-generated set without touching call sites.
 *
 * Layout under /public/assets (served at /assets):
 *   MUSIC/*.OGG  VOICE/*.OGG  SFX2/*.OGG
 *   GALAXY/*.TGA BACKGROUNDS/*.TGA SPRITES/*.TGA OBJECTS/<world>/*.TGA
 *
 * Up-res: set window.SNAIL_CONFIG.texturePack = 'hd' (and drop PNGs under
 * /assets-hd mirroring the same paths) to transparently swap in higher-res
 * textures. `resolveTextureUrl` is the single switch point.
 */

import * as THREE from 'three';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';

export const ASSET_BASE = '/assets';

const CONFIG = (typeof window !== 'undefined' && window.SNAIL_CONFIG) || {};
// 'original' = extracted TGA/OGG ; 'hd' = mirrored upscaled PNG set ; or a
// function (name)->url for a remote up-res API.
const TEXTURE_PACK = CONFIG.texturePack || 'original';

/**
 * Resolve a logical texture path (e.g. "OBJECTS/WORLD00/TRACK0") to a URL.
 * Swap point for higher-resolution texture packs.
 */
export function resolveTextureUrl(logicalPath) {
  if (typeof TEXTURE_PACK === 'function') return TEXTURE_PACK(logicalPath);
  if (TEXTURE_PACK === 'hd') return `/assets-hd/${logicalPath}.png`;
  return `${ASSET_BASE}/${logicalPath}.TGA`;
}

class AssetManager {
  constructor() {
    this.tga = new TGALoader();
    this._texCache = new Map();
    this._bufCache = new Map();
    this.ctx = null; // set by AudioEngine so we share one AudioContext
  }

  setAudioContext(ctx) { this.ctx = ctx; }

  /**
   * Load a texture by logical path. Returns a THREE.Texture immediately
   * (filled in asynchronously by the loader). Cached.
   */
  texture(logicalPath, opts = {}) {
    if (this._texCache.has(logicalPath)) return this._texCache.get(logicalPath);
    const url = resolveTextureUrl(logicalPath);
    const tex = this.tga.load(url, undefined, undefined, () => {
      // on error, fall back to original pack if we were on HD
      if (TEXTURE_PACK !== 'original') {
        this.tga.load(`${ASSET_BASE}/${logicalPath}.TGA`, (t) => this._applyTexOpts(t, opts));
      }
    });
    this._applyTexOpts(tex, opts);
    this._texCache.set(logicalPath, tex);
    return tex;
  }

  _applyTexOpts(tex, opts) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    if (opts.repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(opts.repeat[0], opts.repeat[1]); }
    if (opts.wrap) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
    if (opts.flipY === false) tex.flipY = false;
    tex.needsUpdate = true;
    return tex;
  }

  /** Fetch + decode an OGG into an AudioBuffer. Cached. Returns Promise. */
  async audioBuffer(category, name) {
    const key = `${category}/${name}`;
    if (this._bufCache.has(key)) return this._bufCache.get(key);
    const p = (async () => {
      const res = await fetch(`${ASSET_BASE}/${category}/${name}.OGG`);
      if (!res.ok) throw new Error(`audio ${key} ${res.status}`);
      const arr = await res.arrayBuffer();
      return await this.ctx.decodeAudioData(arr);
    })();
    this._bufCache.set(key, p);
    return p;
  }

  /** Fetch a text data file (level/segment/background config). */
  async text(path) {
    const res = await fetch(`${ASSET_BASE}/${path}`);
    if (!res.ok) throw new Error(`text ${path} ${res.status}`);
    return res.text();
  }
}

export const assets = new AssetManager();

/**
 * UI sprite helper. The original Snail Mail menu/HUD art ships as 24/32-bit
 * TGA files, which browsers can't render directly in CSS or <img>. This module
 * fetches a TGA, decodes it with three's TGALoader (parse -> raw RGBA), draws
 * it into a 2D canvas (flipping the bottom-up TGA rows), and hands back a PNG
 * data URL that DOM/CSS can use. Results are cached and de-duplicated.
 *
 * Logical paths match assets.js conventions: UPPERCASE, no extension, e.g.
 * 'BACKGROUNDS/SPLASH_A' or 'SPRITES/DAMAGEGUAGE'. '.TGA' is appended and the
 * file is served from /assets/<path>.TGA.
 *
 * Everything degrades gracefully: if a sprite fails to load, getSpriteURL
 * resolves to null and callers keep their CSS-only fallback look.
 */

import { TGALoader } from 'three/addons/loaders/TGALoader.js';

const ASSET_BASE = '/assets';
const _loader = new TGALoader();
const _cache = new Map(); // logicalPath -> Promise<string|null>

/**
 * Decode a TGA logical path into a PNG data URL (Promise). Cached; safe to
 * call repeatedly. Resolves to null on any failure so callers can fall back.
 */
export function getSpriteURL(logicalPath) {
  if (_cache.has(logicalPath)) return _cache.get(logicalPath);
  const p = _decode(logicalPath).catch((err) => {
    console.warn(`[sprites] could not load ${logicalPath}:`, err?.message || err);
    return null;
  });
  _cache.set(logicalPath, p);
  return p;
}

async function _decode(logicalPath) {
  const tex = await _decodeRaw(logicalPath);
  return _rgbaToDataURL(tex.data, tex.width, tex.height);
}

// Decode a TGA to raw RGBA + dimensions (no PNG encode). Cached separately so
// composite helpers can reuse the pixels. Resolves null on failure.
const _rawCache = new Map();
function _decodeRawCached(logicalPath) {
  if (_rawCache.has(logicalPath)) return _rawCache.get(logicalPath);
  const p = _decodeRaw(logicalPath).catch((err) => {
    console.warn(`[sprites] could not load ${logicalPath}:`, err?.message || err);
    return null;
  });
  _rawCache.set(logicalPath, p);
  return p;
}
async function _decodeRaw(logicalPath) {
  const url = `${ASSET_BASE}/${logicalPath}.TGA`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const buf = await res.arrayBuffer();
  // parse() returns { data: Uint8Array RGBA, width, height, flipY:true }. The
  // loader already writes pixels top-down regardless of the file's TGA origin
  // (it walks BL-origin rows in reverse into a sequential buffer); `flipY` is
  // only a GPU UV hint. So we draw the data straight into the canvas.
  const tex = _loader.parse(buf);
  return { data: tex.data, width: tex.width, height: tex.height };
}

/**
 * Get a sprite's natural pixel size (Promise<{w,h}|null>). Cached.
 */
export async function getSpriteSize(logicalPath) {
  const raw = await _decodeRawCached(logicalPath);
  return raw ? { w: raw.width, h: raw.height } : null;
}

function _rgbaToDataURL(data, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  img.data.set(data);
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Stitch the original game's split UI plates back into one image. The 2004 menu
 * art was authored at 640x512 but stored as two power-of-two TGAs: the 512-wide
 * "_A" plate (left) and the 128-wide "_B" plate (right strip). This composites
 * them side by side and returns a single PNG data URL (Promise<string|null>),
 * so we can letterbox the whole 640x512 screen instead of cover-stretching one
 * cropped tile. Cached by the pair key. Falls back to just _A if _B is missing.
 */
const _composite = new Map();
export function getCompositeURL(pathA, pathB) {
  const key = `${pathA}|${pathB}`;
  if (_composite.has(key)) return _composite.get(key);
  const p = Promise.all([_decodeRawCached(pathA), _decodeRawCached(pathB)])
    .then(([a, b]) => {
      if (!a) return null;
      const w = a.width + (b ? b.width : 0);
      const h = a.height;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      const put = (raw, x) => {
        if (!raw) return;
        const img = ctx.createImageData(raw.width, raw.height);
        img.data.set(raw.data);
        ctx.putImageData(img, x, 0);
      };
      put(a, 0);
      put(b, a.width);
      return canvas.toDataURL('image/png');
    })
    .catch(() => null);
  _composite.set(key, p);
  return p;
}

/**
 * Resolve a sprite and apply it as a CSS background-image on an element (once
 * available). No-op if the sprite fails to load. Extra background props can be
 * passed through `style`.
 */
export function applyBackground(el, logicalPath, style = {}) {
  getSpriteURL(logicalPath).then((url) => {
    if (!url || !el.isConnected) return;
    el.style.backgroundImage = `url(${url})`;
    for (const [k, v] of Object.entries(style)) el.style.setProperty(k, v);
    el.classList.add('has-sprite');
  });
}

/**
 * Resolve a sprite and set it as the src of an <img> (once available). The img
 * is left empty (and can stay hidden via CSS) until/unless the sprite loads.
 */
export function applyImage(img, logicalPath) {
  getSpriteURL(logicalPath).then((url) => {
    if (!url || !img.isConnected) return;
    img.src = url;
    img.classList.add('has-sprite');
  });
}

/**
 * Warm the cache for a set of logical paths so first paint of a screen doesn't
 * stutter. Fire-and-forget.
 */
export function preloadSprites(paths) {
  for (const p of paths) getSpriteURL(p);
}

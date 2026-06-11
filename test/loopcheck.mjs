/**
 * Verify the 3D track reconstruction: load "Loopy" (ARCADE003) and confirm the
 * spline actually loops (inverted up-vectors + big vertical extent), no NaN,
 * road follows, then screenshot near a loop.
 *   node test/loopcheck.mjs
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const SHOT_DIR = '/home/sonny/snailmail/test/shots';
mkdirSync(SHOT_DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
try {
  await p.goto('http://localhost:5185/', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1200); await p.mouse.click(640, 400); await sleep(300);
  // force-start Loopy (galaxy 0, level 2 = ARCADE003)
  await p.evaluate(() => window.__snail.game.startLevel(0, 2));
  await sleep(1500);
  const info = await p.evaluate(() => {
    const lv = window.__snail.game.level; if (!lv) return { noLevel: true };
    const t = lv.track;
    // scan frames for loop signature: any up.y < -0.3 (inverted) + vertical span
    let minUpY = 1, maxY = -1e9, minY = 1e9, nan = 0;
    const N = 400;
    for (let i = 0; i <= N; i++) {
      const s = (i / N) * t.length;
      const fr = t.frameAt(s);
      if ([fr.pos.x, fr.pos.y, fr.pos.z, fr.up.y].some((v) => !Number.isFinite(v))) nan++;
      minUpY = Math.min(minUpY, fr.up.y);
      maxY = Math.max(maxY, fr.pos.y); minY = Math.min(minY, fr.pos.y);
    }
    return {
      name: lv.level.name, length: +t.length.toFixed(0),
      paths: (t.def.paths || []).map((x) => x.family),
      rolls: (t.def.rolls || []).length,
      minUpY: +minUpY.toFixed(2),        // < 0 ⇒ road goes inverted (a loop)
      vSpan: +(maxY - minY).toFixed(1),   // vertical extent of the track
      nanFrames: nan,
    };
  });
  console.log('LOOPY:', JSON.stringify(info));
  // position the player just before the first loop and let it run a touch
  await p.evaluate(() => {
    const lv = window.__snail.game.level;
    const loop = (lv.track.def.paths || []).find((x) => x.family === 'loop');
    if (loop) { lv.status = 'playing'; lv.countdown = 0; lv.player.s = Math.max(2, loop.at - 16); }
  });
  await sleep(900);
  await p.screenshot({ path: `${SHOT_DIR}/loop-3d.png` });
  console.log('shot: loop-3d');
} catch (e) { errors.push('HARNESS: ' + e.message); }
finally { console.log('ERRORS (' + errors.length + '):'); for (const e of errors.slice(0, 12)) console.log(e); await b.close(); }

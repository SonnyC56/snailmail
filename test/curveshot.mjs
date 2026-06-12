// Verify the recovered curve geometry on a loop-heavy level + capture a shot.
import pp from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';
const CHROME = ['/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome'].find(existsSync);
const PORT = process.env.SMOKE_PORT || '5194';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('test/shots', { recursive: true });

const b = await pp.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 30000 });
await p.evaluate(() => localStorage.setItem('snailx.save.v1', '{"seenIntro":true,"story":{"unlockedWorld":8,"unlockedLevel":8,"completed":{}}}'));
await p.mouse.click(640, 400); await sleep(400);

// arcade idx 3 (galaxy 0, level 2) — LOOP THE LOOP/T3/4/BOW + HALFPIPE
await p.evaluate(() => { const g = window.__snail.game; g._teardownLevel(); g.mode = 'arcade'; g.startLevel(0, 2); });
await sleep(3500);

// scan the track frames for the most-inverted point (a loop) + the most-banked (screw/halfpipe)
const found = await p.evaluate(() => {
  const t = window.__snail.game.level.track;
  let loop = { s: 0, up: 1 }, hasNaN = false, minSurfY = Infinity, maxSurfY = -Infinity;
  for (let s = 20; s < t.length - 20; s += 1.5) {
    const fr = t.frameAt(s);
    if (!isFinite(fr.up.y) || !isFinite(fr.pos.x)) hasNaN = true;
    if (fr.up.y < loop.up) loop = { s, up: +fr.up.y.toFixed(3) };
    minSurfY = Math.min(minSurfY, fr.pos.y); maxSurfY = Math.max(maxSurfY, fr.pos.y);
  }
  return { len: Math.round(t.length), loopS: Math.round(loop.s), loopUp: loop.up, hasNaN, yRange: [Math.round(minSurfY), Math.round(maxSurfY)] };
});
// park Turbo just before the loop so it's in frame
await p.evaluate((s) => { const P = window.__snail.game.level.player; P.s = Math.max(2, s - 18); P.x = 0; }, found.loopS);
await sleep(700);
await p.screenshot({ path: 'test/shots/curve-loop.png' });

// also a banked section
await p.evaluate(() => { const P = window.__snail.game.level.player; P.s = Math.max(2, P.s + 60); });
await sleep(700);
await p.screenshot({ path: 'test/shots/curve-2.png' });

console.log('TRACK', JSON.stringify(found));
console.log('ERRORS', errs.length, JSON.stringify(errs.slice(0, 4)));
console.log(found.hasNaN ? 'GEOMETRY: NaN! ❌' : `GEOMETRY: clean ✅ (loop up.y=${found.loopUp}, yRange=${found.yRange})`);
await b.close();

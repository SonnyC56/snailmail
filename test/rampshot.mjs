import pp from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';
const CHROME = ['/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome'].find(existsSync);
const PORT = process.env.SMOKE_PORT || '5185';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('test/shots', { recursive: true });
const errors = [];
const b = await pp.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 30000 });
await p.evaluate(() => localStorage.setItem('snailx.save.v1', '{"seenIntro":true}'));
await sleep(800); await p.mouse.click(640, 400); await sleep(300);
// scan a few levels for one that has ramp entities
let found = null;
for (const [w, l] of [[2,1],[1,2],[3,0],[2,0],[0,2]]) {
  await p.evaluate((ww, ll) => window.__snail.game.startLevel(ww, ll), w, l);
  for (let t = 0; t <= 8000; t += 150) { if (await p.evaluate(() => window.__snail.game.state === 'playing')) break; await sleep(150); }
  await sleep(300);
  const r = await p.evaluate(() => {
    const ents = window.__snail.game.level.entities.entities;
    const ramps = ents.filter(e => e.type === 'ramp' || e.type === 'jumppod');
    return ramps.map(e => ({ type: e.type, s: +e.s.toFixed(1), x: +e.x.toFixed(2) })).slice(0, 6);
  });
  if (r.length) { found = { w, l, ramps: r }; break; }
}
console.log('FOUND', JSON.stringify(found));
if (found) {
  const first = found.ramps[0];
  await p.evaluate((ss) => { const pl = window.__snail.game.level.player; pl.s = ss; pl.x = 0; pl.speed = 0; }, Math.max(2, first.s - 9));
  await sleep(500);
  await p.screenshot({ path: 'test/shots/ramp-view.png' });
}
console.log('ERR(' + errors.length + '):', errors.slice(0, 6).join(' | '));
await b.close();

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
p.on('pageerror', e => errors.push('PE: ' + e.message));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 30000 });
await p.evaluate(() => localStorage.setItem('snailx.save.v1', '{"seenIntro":true}'));
await sleep(800); await p.mouse.click(640, 400); await sleep(300);
// a mid-world grid level (has narrow stretches + gaps)
await p.evaluate(() => window.__snail.game.startLevel(2, 1));
for (let t = 0; t <= 8000; t += 150) { if (await p.evaluate(() => window.__snail.game.state === 'playing')) break; await sleep(150); }
await sleep(400);

// scrub the player along the track, capturing where the road is narrow / has holes
const info = await p.evaluate(() => {
  const g = window.__snail.game, tr = g.level.track;
  const out = { wallX: tr.wallX, len: +tr.length.toFixed(1), rows: tr.cells ? tr.cells.length : 0, samples: [] };
  if (tr.cells) {
    for (let r = 0; r < tr.cells.length; r++) {
      const s = r * tr.rowUnits;
      const ext = tr.drivableExtent(s);
      const w = ext ? +(ext.max - ext.min).toFixed(1) : null;
      out.samples.push({ r, s: +s.toFixed(1), row: tr.cells[r], w });
    }
  }
  return out;
});
console.log('wallX', info.wallX, 'len', info.len, 'rows', info.rows);
// pick interesting rows: narrowest non-null, and a gap (null)
const narrow = info.samples.filter(x => x.w != null).sort((a, b) => a.w - b.w)[0];
const gap = info.samples.find(x => x.w == null);
console.log('narrowest', JSON.stringify(narrow));
console.log('gap', JSON.stringify(gap));

async function shotAt(s, name) {
  await p.evaluate((ss) => {
    const pl = window.__snail.game.level.player;
    pl.s = ss; pl.x = 0; pl.speed = 0;
  }, s);
  await sleep(400);
  await p.screenshot({ path: `test/shots/${name}.png` });
}
await shotAt(8, 'road-start');
if (narrow) await shotAt(Math.max(4, narrow.s - 10), 'road-narrow');
if (gap) await shotAt(Math.max(4, gap.s - 12), 'road-gap');
console.log('ERR(' + errors.length + '):', errors.slice(0, 6).join(' | '));
await b.close();

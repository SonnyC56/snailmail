// Diagnose: tutorial Esc-pause + when the real Turbo mesh becomes visible.
import pp from 'puppeteer-core';
import { existsSync } from 'node:fs';
const CHROME = ['/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome'].find(existsSync);
const PORT = process.env.SMOKE_PORT || '5195';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await pp.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 30000 });
await p.evaluate(() => localStorage.setItem('snailx.save.v1', '{"seenIntro":true}'));
await p.mouse.click(640, 400); await sleep(300);

// TUTORIAL
await p.evaluate(() => window.__snail.game.startTutorial());
// poll: when does the real mesh appear?
let meshAt = null;
for (let t = 0; t <= 6000; t += 250) {
  const real = await p.evaluate(() => !!(window.__snail.game.level?.player?.snail?.usingOriginal));
  if (real) { meshAt = t; break; }
  await sleep(250);
}
// wait for the loading veil to lift (state -> playing)
let stateBefore = null;
for (let t = 0; t <= 6000; t += 200) { stateBefore = await p.evaluate(() => window.__snail.game.state); if (stateBefore === 'playing') break; await sleep(200); }
const introHeld = await p.evaluate(() => window.__snail.game.level?.cam?.introActive ?? null);
// real mesh visible BEFORE the intro/reveal? (the whole point)
const realAtReveal = await p.evaluate(() => !!(window.__snail.game.level?.player?.snail?.usingOriginal));
// press Escape
await p.keyboard.press('Escape'); await sleep(300);
const stateAfterEsc = await p.evaluate(() => window.__snail.game.state);
await sleep(300);
const stateLater = await p.evaluate(() => window.__snail.game.state);

console.log('TUTORIAL real-mesh-visible-at(ms):', meshAt, ' realMeshOnReveal:', realAtReveal, ' introActive@reveal:', introHeld);
console.log('PAUSE state before:', stateBefore, ' after Esc:', stateAfterEsc, ' +300ms:', stateLater,
  ' => pause works:', stateAfterEsc === 'paused' && stateLater === 'paused');
console.log('ERRORS', errs.length, JSON.stringify(errs.slice(0, 3)));
await b.close();

import pp from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';
const CHROME = ['/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome'].find(existsSync);
const PORT = process.env.SMOKE_PORT || '5197';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('test/shots', { recursive: true });
const b = await pp.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 30000 });
await p.evaluate(() => localStorage.setItem('snailx.save.v1', '{"seenIntro":true}'));
await p.mouse.click(640, 400); await sleep(300);
await p.evaluate(() => window.__snail.game.startTutorial());
// wait for reveal (loading veil lifts -> playing)
for (let t = 0; t <= 6000; t += 150) { if (await p.evaluate(() => window.__snail.game.state === 'playing')) break; await sleep(150); }
await sleep(500);  // mid face-cut hold
const real1 = await p.evaluate(() => !!window.__snail.game.level?.player?.snail?.usingOriginal);
await p.screenshot({ path: 'test/shots/intro-face.png' });
await sleep(3200); // settle into the (now closer) chase
await p.screenshot({ path: 'test/shots/chase-closer.png' });
console.log('face-cut realMesh:', real1, ' (shots saved)');
await b.close();

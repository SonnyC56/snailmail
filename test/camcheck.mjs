import pp from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';
const CHROME = ['/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome'].find(existsSync);
const PORT = process.env.SMOKE_PORT || '5198';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('test/shots', { recursive: true });
const b = await pp.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 30000 });
await p.evaluate(() => localStorage.setItem('snailx.save.v1', '{"seenIntro":true}'));
await p.mouse.click(640, 400); await sleep(300);
await p.evaluate(() => window.__snail.game.startTutorial());
for (let t = 0; t <= 6000; t += 150) { if (await p.evaluate(() => window.__snail.game.state === 'playing')) break; await sleep(150); }
// intro hold = camera in front of Turbo's face → the apron should be behind him
await sleep(250);
await p.screenshot({ path: 'test/shots/start-apron.png' });
const camDist = async () => p.evaluate(() => {
  const g = window.__snail.game, cam = g.ctx.camera.position, pl = g.level.player;
  return { d: +cam.distanceTo(pl.group.position).toFixed(2), s: +pl.s.toFixed(1), speed: +pl.speed.toFixed(1) };
});
const rest = await camDist();
// let the countdown finish + Turbo accelerate to speed, then measure the chase gap
await sleep(5000);
const moving = await camDist();
await p.screenshot({ path: 'test/shots/chase-moving.png' });
console.log('REST  ', JSON.stringify(rest));
console.log('MOVING', JSON.stringify(moving), '(camera-to-Turbo distance at speed)');
await b.close();

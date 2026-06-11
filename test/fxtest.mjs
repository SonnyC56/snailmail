import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] || 'http://localhost:5185/';
const CHROME = '/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const SHOT_DIR = '/home/sonny/snailmail/test/shots';
mkdirSync(SHOT_DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const clickBtn = async (re) => page.evaluate((src) => { const rx = new RegExp(src, 'i'); const b = [...document.querySelectorAll('.btn')].find((x) => rx.test(x.textContent)); if (b) { b.click(); return true; } return false; }, re);
try {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1200); await page.mouse.click(640, 400); await sleep(300);
  await clickBtn('play'); await sleep(400); await clickBtn('endless'); await sleep(900);
  await sleep(4500);
  // spawn flashes right in front of the camera, long-lived so the screenshot catches them
  const probe = await page.evaluate(() => {
    const lv = window.__snail.game.level; const p = lv.player.group.position.clone();
    const cam = window.__snail.game.ctx.camera;
    // a point ~6 units ahead of the player
    const ahead = lv.track.surfacePoint(lv.player.s + 6, 0);
    lv.fx.flash(ahead, 'PARTICLEEXPLODE-BIG', { color: 0xffaa55, size: 4, size1: 8, life: 3 });
    lv.fx.flash(lv.track.surfacePoint(lv.player.s + 9, -3), 'PARTICLERING-BIG', { color: 0xffe27a, size: 3, size1: 7, life: 3 });
    lv.fx.flash(lv.track.surfacePoint(lv.player.s + 9, 3), 'PARTICLESLOW-BIG', { color: 0x88bbff, size: 3, size1: 7, life: 3 });
    lv.fx.burst(ahead, 0xffffff, 30, { speed: 6, life: 3 });
    let activeFlash = 0; for (const f of lv.fx.flashes) if (f.alive) activeFlash++;
    return { activeFlash, sprites: lv.fx.flashes.length };
  });
  await sleep(500);
  await page.screenshot({ path: `${SHOT_DIR}/fx-flashes.png` });
  console.log('FX:', JSON.stringify(probe));
} catch (e) { errors.push('HARNESS: ' + e.message); }
finally { console.log('ERRORS (' + errors.length + '):'); for (const e of errors.slice(0, 12)) console.log(e); await browser.close(); }

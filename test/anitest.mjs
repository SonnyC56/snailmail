/**
 * Smoke-test the newly wired Turbo poses + original jetpack mesh: trigger a
 * jetpack and a finish in a live level, confirm no errors and capture frames.
 *   node test/anitest.mjs [baseUrl]
 */
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
const shot = async (n) => { await page.screenshot({ path: `${SHOT_DIR}/${n}.png` }); console.log('shot:', n); };
const clickBtn = async (re) => page.evaluate((src) => { const rx = new RegExp(src, 'i'); const b = [...document.querySelectorAll('.btn')].find((x) => rx.test(x.textContent)); if (b) { b.click(); return true; } return false; }, re);
try {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1200); await page.mouse.click(640, 400); await sleep(300);
  await clickBtn('play'); await sleep(400);
  await clickBtn('endless'); await sleep(900);    // procedural: quick into a level, no story crawl
  // wait out the start intro + countdown
  await sleep(4500);
  // trigger jetpack
  const jp = await page.evaluate(() => { const p = window.__snail.game.level.player; p.startJetpack(4); return { state: p.state, usingOriginal: p.snail.usingOriginal }; });
  await sleep(900); await shot('ani-jetpack');
  const jpProbe = await page.evaluate(() => {
    const p = window.__snail.game.level.player;
    // walk the snail group for a visible jetpack-ish mesh
    let jetMeshes = 0; p.snail.group.traverse((o) => { if (o.isMesh && o.visible && o.material && o.material.blending) jetMeshes++; });
    return { state: p.state, jetFlameVisible: p.jetFlame.visible, usingOriginal: p.snail.usingOriginal };
  });
  console.log('JETPACK:', JSON.stringify(jp), '->', JSON.stringify(jpProbe));
  // trigger finish -> skid pose
  await page.evaluate(() => window.__snail.game.level.player.finish());
  await sleep(700); await shot('ani-skid');
  const fin = await page.evaluate(() => ({ state: window.__snail.game.level.player.state }));
  console.log('FINISH:', JSON.stringify(fin));
} catch (e) { errors.push('HARNESS: ' + e.message); }
finally { console.log('\nERRORS (' + errors.length + '):'); for (const e of errors.slice(0, 15)) console.log(e); await browser.close(); }

/**
 * Headless playtest harness. Launches the cached Chrome, drives the game,
 * captures console/page errors and screenshots at key states.
 *
 *   node test/playtest.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5185/';
const CHROME = '/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const SHOT_DIR = '/home/sonny/snailmail/test/shots';
mkdirSync(SHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const errors = [];
const logs = [];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--window-size=1280,800',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

page.on('console', (m) => {
  const t = m.type();
  logs.push(`[${t}] ${m.text()}`);
  if (t === 'error') errors.push(m.text());
});
const seenStacks = new Set();
page.on('pageerror', (e) => {
  const key = e.message;
  if (!seenStacks.has(key)) { seenStacks.add(key); errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')); }
});
page.on('requestfailed', (r) => {
  const u = r.url();
  if (!u.includes('favicon')) errors.push('REQFAIL: ' + u + ' ' + (r.failure()?.errorText || ''));
});

const shot = async (name) => { await page.screenshot({ path: `${SHOT_DIR}/${name}.png` }); console.log('shot:', name); };

try {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1500);
  await shot('01-title');

  // dismiss audio unlock + click Play
  await page.mouse.click(640, 400);
  await sleep(300);
  const clickBtn = async (label) => {
    const ok = await page.evaluate((lbl) => {
      const b = [...document.querySelectorAll('.btn')].find((x) => x.textContent.trim().toLowerCase().includes(lbl.toLowerCase()));
      if (b) { b.click(); return true; }
      return false;
    }, label);
    return ok;
  };

  await clickBtn('play'); await sleep(500); await shot('02-modeselect');
  await clickBtn('story'); await sleep(600); await shot('03-levelselect');

  // click first available level pip
  await page.evaluate(() => {
    const pip = [...document.querySelectorAll('.level-pip')].find((p) => !p.classList.contains('locked'));
    if (pip) pip.click();
  });
  await sleep(700);
  // story interlude? click Begin/Next a few times
  for (let i = 0; i < 4; i++) {
    const advanced = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.btn')].find((x) => /begin|next/i.test(x.textContent));
      if (b) { b.click(); return true; }
      return false;
    });
    if (!advanced) break;
    await sleep(300);
  }
  await sleep(800);
  await shot('04-countdown');

  // wait for countdown, then drive: hold fire + weave
  await sleep(3500);
  await shot('05-gameplay');

  // simulate input: steer + fire
  await page.keyboard.down('Space');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.down('ArrowLeft'); await sleep(450); await page.keyboard.up('ArrowLeft');
    await page.keyboard.down('ArrowRight'); await sleep(450); await page.keyboard.up('ArrowRight');
  }
  await page.keyboard.up('Space');
  await shot('06-gameplay-mid');

  // probe live state
  const state = await page.evaluate(() => {
    const g = window.__snail?.game;
    const lv = g?.level;
    if (!lv) return { noLevel: true };
    return {
      status: lv.status,
      s: +lv.player.s.toFixed(1),
      x: +lv.player.x.toFixed(2),
      speed: +lv.player.speed.toFixed(1),
      packages: lv.packages,
      totalPackages: lv.totalPackages,
      lives: lv.lives,
      meter: +lv.player.meterRatio.toFixed(2),
      weaponLevel: lv.player.weaponLevel,
      progress: +lv.progress.toFixed(2),
      entities: lv.entities.entities.length,
      shots: lv.weapons.shots.length,
      playerState: lv.player.state,
    };
  });
  console.log('STATE:', JSON.stringify(state, null, 2));

  await sleep(3000);
  await shot('07-gameplay-later');
} catch (e) {
  errors.push('HARNESS: ' + e.message);
} finally {
  console.log('\n=== CONSOLE ERRORS (' + errors.length + ') ===');
  for (const e of errors.slice(0, 40)) console.log(e);
  console.log('\n=== LAST LOGS ===');
  for (const l of logs.slice(-15)) console.log(l);
  await browser.close();
}

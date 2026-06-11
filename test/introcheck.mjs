/**
 * Verify the level-start camera intro: camera holds on Turbo's face, he plays
 * the talk pose, the "need for speed" voice fires once, then the camera orbits
 * back behind him before GO.
 *
 *   node test/introcheck.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5185/';
const CHROME = '/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const SHOT_DIR = '/home/sonny/snailmail/test/shots';
mkdirSync(SHOT_DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const errors = [];
const voiceCalls = [];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); const t = m.text(); if (t.includes('VOICE:')) voiceCalls.push(t); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const shot = async (name) => { await page.screenshot({ path: `${SHOT_DIR}/${name}.png` }); console.log('shot:', name); };

try {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1200);
  await page.mouse.click(640, 400);
  await sleep(300);

  // hook voiceFile to log which line plays
  await page.evaluate(() => {
    const a = window.__snail?.ctx?.audio || window.__snail?.game?.ctx?.audio;
    if (a && a.voiceFile) { const orig = a.voiceFile.bind(a); a.voiceFile = (n) => { console.log('VOICE:' + n); return orig(n); }; }
  });

  const clickBtn = async (label) => page.evaluate((lbl) => {
    const b = [...document.querySelectorAll('.btn')].find((x) => x.textContent.trim().toLowerCase().includes(lbl.toLowerCase()));
    if (b) { b.click(); return true; } return false;
  }, label);

  await clickBtn('play'); await sleep(400);
  await clickBtn('story'); await sleep(500);
  await page.evaluate(() => { const pip = [...document.querySelectorAll('.level-star')].find((p) => !p.classList.contains('locked')); if (pip) pip.click(); });
  await sleep(600);
  // skip crawl + story cards until the live level exists
  for (let i = 0; i < 16; i++) {
    const hasLevel = await page.evaluate(() => !!window.__snail?.game?.level);
    if (hasLevel) break;
    await page.evaluate(() => { const b = [...document.querySelectorAll('.btn')].find((x) => /begin|next|start|deliver|go/i.test(x.textContent)); if (b) b.click(); });
    await page.mouse.click(640, 400);
    await page.keyboard.press('Enter');
    await sleep(250);
  }

  // re-hook voiceFile now that a fresh audio may be used (same instance, safe)
  await page.evaluate(() => {
    const a = window.__snail?.game?.ctx?.audio;
    if (a && a.voiceFile && !a.__hooked) { a.__hooked = true; const orig = a.voiceFile.bind(a); a.voiceFile = (n) => { console.log('VOICE:' + n); return orig(n); }; }
  });

  // sample the intro across the countdown
  const samples = [];
  for (let i = 0; i < 14; i++) {
    const s = await page.evaluate(() => {
      const g = window.__snail?.game; const lv = g?.level; if (!lv) return null;
      const cam = lv.cam; const pl = lv.player; const camPos = g.ctx.camera.position;
      const pp = pl.group.position;
      const fr = lv.track.frameAt(pl.s);
      // dot of (camera - player) with forward tangent: >0 = camera ahead (facing him), <0 = behind
      const dx = camPos.x - pp.x, dy = camPos.y - pp.y, dz = camPos.z - pp.z;
      const fwdDot = dx * fr.tangent.x + dy * fr.tangent.y + dz * fr.tangent.z;
      return {
        status: lv.status,
        countdown: +lv.countdown.toFixed(2),
        introT: +cam._introT.toFixed(2),
        introActive: cam.introActive,
        introPose: !!pl._introPose,
        snailPose: lv.player.snail?.usingOriginal ? 'orig' : 'proc',
        fwdDot: +fwdDot.toFixed(2),
      };
    });
    if (s) samples.push(s);
    if (i === 1) await shot('intro-a-face');
    if (i === 5) await shot('intro-b-orbit');
    if (i === 9) await shot('intro-c-settle');
    await sleep(300);
  }
  await shot('intro-d-playing');

  console.log('\n=== INTRO SAMPLES (countdown / introT / introActive / introPose / fwdDot) ===');
  for (const s of samples) console.log(`status=${s.status} cd=${s.countdown} introT=${s.introT} active=${s.introActive} pose=${s.introPose} fwdDot=${s.fwdDot}`);
  console.log('\n=== VOICE CALLS ===');
  console.log(voiceCalls.length ? voiceCalls.join('\n') : '(none captured)');
} catch (e) {
  errors.push('HARNESS: ' + e.message);
} finally {
  console.log('\n=== ERRORS (' + errors.length + ') ===');
  for (const e of errors.slice(0, 20)) console.log(e);
  await browser.close();
}

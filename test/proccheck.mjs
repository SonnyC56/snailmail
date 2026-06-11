/**
 * Verify the Endless (procedural) mode: routes generate, and the passability
 * guard guarantees a threadable corridor through every band of solid obstacles
 * at a range of difficulties.
 *
 *   node test/proccheck.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5185/';
const CHROME = '/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const SHOT_DIR = '/home/sonny/snailmail/test/shots';
mkdirSync(SHOT_DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const errors = [];
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const shot = async (n) => { await page.screenshot({ path: `${SHOT_DIR}/${n}.png` }); console.log('shot:', n); };

try {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1200);
  await page.mouse.click(640, 400);
  await sleep(300);

  // Reach the procedural mode through the menu (proves the button is wired).
  const clickBtn = async (re) => page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const b = [...document.querySelectorAll('.btn')].find((x) => rx.test(x.textContent));
    if (b) { b.click(); return b.textContent.trim(); } return null;
  }, re);
  await clickBtn('play'); await sleep(400);
  const picked = await clickBtn('endless'); await sleep(800);
  console.log('mode button picked:', picked);

  // Drive the corridor check directly on freshly generated routes at 3 difficulties.
  const results = [];
  for (const idx of [0, 20, 49]) {
    await page.evaluate((i) => window.__snail.game.startProcedural(i), idx);
    await sleep(700);
    const r = await page.evaluate(() => {
      const lv = window.__snail?.game?.level; if (!lv) return null;
      const ents = lv.entities.entities;
      const track = lv.track;
      const HW = track.halfWidth - 1;
      const SOLID = new Set(['pillar', 'sign', 'slug', 'salt', 'turret', 'asteroid']);
      const BLOCK_R = 1.3, CORRIDOR = 2.4, S_BAND = 6;
      const solids = ents.filter((e) => SOLID.has(e.type)).map((e) => ({ s: e.s, x: e.x }));
      // for each solid, recompute the widest free corridor in its band
      let worst = Infinity, blocked = 0;
      for (const o of solids) {
        const near = solids.filter((q) => Math.abs(q.s - o.s) < S_BAND);
        const iv = near.map((q) => [q.x - BLOCK_R, q.x + BLOCK_R]).sort((a, b) => a[0] - b[0]);
        let cursor = -HW, best = 0;
        for (const [lo, hi] of iv) { if (lo > cursor) best = Math.max(best, lo - cursor); cursor = Math.max(cursor, hi); }
        best = Math.max(best, HW - cursor);
        worst = Math.min(worst, best);
        if (best < CORRIDOR - 1e-6) blocked++;
      }
      // also make sure the spline actually has a road surface along its length
      let surfaceHoles = 0;
      for (let s = 5; s < track.length - 5; s += 4) if (!track.hasSurface(s, 0) && !track.hasSurface(s, HW * 0.6) && !track.hasSurface(s, -HW * 0.6)) surfaceHoles++;
      return {
        idx: lv.level.idx, length: +track.length.toFixed(0), HW: +HW.toFixed(1),
        entities: ents.length,
        packages: ents.filter((e) => e.type === 'package').length,
        solids: solids.length,
        worstCorridor: +worst.toFixed(2),
        blockedBands: blocked,
        gaps: track.gaps.length,
        surfaceHoles,
      };
    }, idx);
    if (r) { results.push(r); console.log('idx', idx, JSON.stringify(r)); }
    if (idx === 20) await shot('proc-mid');
  }

  console.log('\n=== PASSABILITY VERDICT ===');
  const allClear = results.every((r) => r.blockedBands === 0);
  console.log(allClear ? 'PASS: every solid band keeps a >=2.4u corridor' : 'FAIL: some bands wall off the road');
} catch (e) {
  errors.push('HARNESS: ' + e.message);
} finally {
  console.log('\n=== ERRORS (' + errors.length + ') ===');
  for (const e of errors.slice(0, 20)) console.log(e);
  await browser.close();
}

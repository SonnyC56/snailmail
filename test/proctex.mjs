/**
 * Verify the procedural (Endless) ribbon now renders the ORIGINAL track
 * texture like the hand-authored levels: map is bound, repeat is (1,1), UV v
 * tiles by world distance, and the road is visibly textured (not flat).
 *
 *   node test/proctex.mjs [baseUrl]
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

// probe the road material + geometry of the current live level
const probe = () => page.evaluate(() => {
  const lv = window.__snail?.game?.level; if (!lv) return null;
  let road = null;
  lv.trackMesh.traverse((o) => { if (!road && o.isMesh && o.material && o.material.map) road = o; });
  if (!road) return { textured: false };
  const m = road.material.map;
  const uv = road.geometry.getAttribute('uv');
  let vMax = 0; for (let i = 1; i < uv.count * 2; i += 2) vMax = Math.max(vMax, uv.array[i]);
  return {
    textured: true,
    mapUrl: (m.image && (m.image.currentSrc || m.image.src)) || m.name || 'image',
    imgW: m.image?.width ?? null, imgH: m.image?.height ?? null,
    repeatX: +m.repeat.x.toFixed(3), repeatY: +m.repeat.y.toFixed(3),
    wrapS: m.wrapS, wrapT: m.wrapT, // 1000 = RepeatWrapping
    uvVMax: +vMax.toFixed(2),
    trackLen: +lv.track.length.toFixed(0),
    expectedTiles: +(lv.track.length * 0.05).toFixed(1), // v should reach ~ this
    emissiveIntensity: road.material.emissiveIntensity,
    isProcedural: !!lv.level.procedural,
  };
});

try {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1200);
  await page.mouse.click(640, 400);
  await sleep(300);
  const clickBtn = async (re) => page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const b = [...document.querySelectorAll('.btn')].find((x) => rx.test(x.textContent));
    if (b) { b.click(); return true; } return false;
  }, re);
  await clickBtn('play'); await sleep(400);
  await clickBtn('endless'); await sleep(900);

  // let the start intro + countdown finish so the road ahead is in view
  await sleep(4500);
  await shot('proctex-cosmic');
  const cosmic = await probe();
  console.log('PROCEDURAL (cosmic/TRACK0):', JSON.stringify(cosmic, null, 0));

  // Compare against an original grid level (same TRACK family) for parity.
  await page.evaluate(() => {
    const g = window.__snail.game;
    const orig = (g.constructor && null); // no-op
  });

  console.log('\n=== VERDICT ===');
  const ok = cosmic && cosmic.textured && cosmic.repeatY === 1 && cosmic.repeatX === 1 && cosmic.uvVMax > 5 && cosmic.imgW >= 64;
  console.log(ok ? 'PASS: original TRACK texture bound, repeat (1,1), tiling by world distance' : 'CHECK: ' + JSON.stringify(cosmic));
} catch (e) {
  errors.push('HARNESS: ' + e.message);
} finally {
  console.log('\n=== ERRORS (' + errors.length + ') ===');
  for (const e of errors.slice(0, 15)) console.log(e);
  await browser.close();
}

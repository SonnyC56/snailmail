// Ship-readiness smoke test: boot the built game headless and exercise the
// recent work (HD textures, ramp entities, endless colour drift, barrier/fall),
// catching runtime errors and asset 404s the build can't see.
// Usage: SMOKE_PORT=5190 node test/shipsmoke.mjs   (a dev/preview server must be up)
import pp from 'puppeteer-core';
import { existsSync } from 'node:fs';

const CHROME = ['/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome']
  .find(existsSync);
const PORT = process.env.SMOKE_PORT || '5190';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await pp.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800'],
});
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 800 });

const errs = [], failed = [], hdOk = new Set(), hd404 = new Set();
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
p.on('requestfailed', (r) => { if (!/favicon/.test(r.url())) failed.push(r.url().split('/').slice(-2).join('/')); });
p.on('response', (r) => {
  const u = r.url();
  if (u.includes('/assets-hd/')) { (r.status() < 400 ? hdOk : hd404).add(u.split('/assets-hd/')[1]); }
});

await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 30000 });
await p.evaluate(() => localStorage.setItem('snailx.save.v1', '{"seenIntro":true,"story":{"unlockedWorld":8,"unlockedLevel":8,"completed":{}}}'));
await p.mouse.click(640, 400); await sleep(400);

const out = {};
// 0) Menus + star-map — exercises LINESTAR/BORDERSPACEMAP/hover-font/dropcap wiring
await p.evaluate(() => { const g = window.__snail.game; g.goModeSelect?.(); });
await sleep(400);
await p.evaluate(() => { const g = window.__snail.game; g.screens?.showLevelSelect?.('story'); });
await sleep(800);
out.menus = await p.evaluate(() => ({ routeStars: document.querySelectorAll('.route-star').length, frame: !!document.querySelector('.starmap-frame') }));

// 1) Tutorial — exercises SpaceRed bg + ramps + barriers
await p.evaluate(() => window.__snail.game.startTutorial()); await sleep(4500);
out.tutorial = await p.evaluate(() => {
  const lv = window.__snail.game.level;
  return {
    status: lv?.status,
    notFalling: lv?.player?.state !== 'falling',
    ramps: lv?.entities?.countTotal?.('ramp') ?? 0,
    jumppods: lv?.entities?.countTotal?.('jumppod') ?? 0,
    sAdvanced: Math.round(lv?.player?.s ?? 0) > 0,
  };
});

// 2) Endless / procedural — exercises colour drift (must not crash)
await p.evaluate(() => { const g = window.__snail.game; g._teardownLevel(); g.mode = 'procedural'; g.startProcedural?.(0) ?? g.startLevel(1, 0); });
await sleep(4500);
out.endless = await p.evaluate(() => {
  const lv = window.__snail.game.level;
  return { status: lv?.status, mode: window.__snail.game.mode, len: Math.round(lv?.track?.length ?? 0), notFalling: lv?.player?.state !== 'falling' };
});

// 3) Arcade — a real authored level (ramps/loops/holes)
await p.evaluate(() => { const g = window.__snail.game; g._teardownLevel(); g.mode = 'arcade'; g.startLevel(1, 0); });
await sleep(4500);
out.arcade = await p.evaluate(() => {
  const lv = window.__snail.game.level;
  return { status: lv?.status, len: Math.round(lv?.track?.length ?? 0), pkgs: lv?.entities?.countTotal?.('package') ?? 0, notFalling: lv?.player?.state !== 'falling' };
});

console.log('MENUS    ', JSON.stringify(out.menus));
console.log('TUTORIAL ', JSON.stringify(out.tutorial));
console.log('ENDLESS  ', JSON.stringify(out.endless));
console.log('ARCADE   ', JSON.stringify(out.arcade));
console.log('HD-LOADED', hdOk.size, 'HD-404', hd404.size, hd404.size ? [...hd404].slice(0, 5) : '');
console.log('FAILED-REQ', failed.length, failed.slice(0, 6));
console.log('ERRORS', errs.length, JSON.stringify(errs.slice(0, 6)));
const ok = (s) => s === 'playing' || s === 'countdown';   // both = loaded + running, no crash
const pass = !errs.length && !hd404.size && !failed.length &&
  ok(out.tutorial.status) && ok(out.arcade.status) && ok(out.endless.status) &&
  out.tutorial.notFalling && out.arcade.notFalling && out.endless.notFalling;
console.log(pass ? '\nSMOKE: PASS ✅' : '\nSMOKE: FAIL ❌');
await b.close();
process.exit(pass ? 0 : 1);

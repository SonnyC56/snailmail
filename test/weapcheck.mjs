import puppeteer from 'puppeteer-core';
const CHROME = '/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', (e) => errors.push('PE: ' + e.message));
try {
  await p.goto('http://localhost:5185/', { waitUntil: 'networkidle2', timeout: 30000 }); await sleep(1600); await p.mouse.click(640, 400); await sleep(300);
  await p.evaluate(() => window.__snail.game.startLevel(0, 0)); await sleep(1800);
  // upgrade weapon -> should trigger deploy; fire -> recoil
  const r = await p.evaluate(async () => {
    const pl = window.__snail.game.level.player;
    pl.upgradeWeapon(); pl.upgradeWeapon(); pl.upgradeWeapon();  // to laser
    pl.snail.setWeaponLevel(3);
    await new Promise((res) => setTimeout(res, 50));
    const s = pl.snail;
    // access internal state via the closure is not possible; just confirm no throw + meshes exist
    let wm = 0; s.parts; pl.group.traverse((o) => { if (o.isMesh) wm++; });
    pl._tryFire?.({ fireHeld: true });   // request a fire
    return { weaponLevel: pl.weaponLevel, meshes: wm };
  });
  await sleep(600);
  console.log('WEAPON:', JSON.stringify(r));
} catch (e) { errors.push('H: ' + e.message); }
finally { console.log('ERR(' + errors.length + '):', errors.slice(0, 8).join(' | ')); await b.close(); }

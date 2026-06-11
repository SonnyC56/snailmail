/** Two-client multiplayer race test against the server on :8080. */
import pp from 'puppeteer-core';
const CHROME = '/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const URL = 'http://localhost:8080/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function makeClient(tag) {
  const b = await pp.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1100,720'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1100, height: 720 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(`${tag} console: ${m.text()}`); });
  await p.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await p.mouse.click(550, 360);
  await sleep(300);
  return { b, p, errs, tag };
}

const clk = (p, re) => p.evaluate((rs) => {
  const x = [...document.querySelectorAll('.btn')].find((b) => new RegExp(rs, 'i').test(b.textContent));
  if (x) { x.click(); return true; } return false;
}, re);

const c1 = await makeClient('P1');
const c2 = await makeClient('P2');

for (const c of [c1, c2]) {
  await clk(c.p, 'play'); await sleep(250);
  await clk(c.p, 'online'); await sleep(600);
}
// both should be in lobby now; set distinct names then ready up
await c1.p.evaluate(() => { const i = document.getElementById('mp-name'); if (i) { i.value = 'AlphaSnail'; i.onchange(); } });
await c2.p.evaluate(() => { const i = document.getElementById('mp-name'); if (i) { i.value = 'BetaSnail'; i.onchange(); } });
await sleep(300);
await clk(c1.p, 'ready'); await sleep(400);
await clk(c2.p, 'ready'); await sleep(400);

// race should start + 3..2..1 countdown
await sleep(5500);
await c1.p.screenshot({ path: '/home/sonny/snailmail/test/shots/mp-p1.png' });
await c2.p.screenshot({ path: '/home/sonny/snailmail/test/shots/mp-p2.png' });

const probe = async (c) => c.p.evaluate(() => {
  const s = window.__snail.game.online;
  const lv = window.__snail.game.level;
  return {
    racing: s?._racing, ghosts: s?.ghosts ? s.ghosts.ghosts.size : -1,
    players: s?.players?.length ?? -1,
    standings: s?.standings ? s.standings().map(r => ({ n: r.name, p: +(r.progress||0).toFixed(2) })) : null,
    levelStatus: lv?.status, progress: lv ? +lv.progress.toFixed(2) : null,
  };
});
console.log('P1', JSON.stringify(await probe(c1)));
console.log('P2', JSON.stringify(await probe(c2)));
console.log('ERRORS', JSON.stringify([...c1.errs, ...c2.errs].slice(0, 10)));

await c1.b.close(); await c2.b.close();

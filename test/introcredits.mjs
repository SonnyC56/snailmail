import puppeteer from 'puppeteer-core';
const CHROME = '/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', (e) => errors.push('PE: ' + e.message));
try {
  await p.goto('http://localhost:5185/', { waitUntil: 'networkidle2', timeout: 30000 }); await sleep(1600); await p.mouse.click(640, 400); await sleep(400);
  await p.evaluate(() => window.__snail.game.screens.showIntroCrawl(() => {}));
  await sleep(900);
  const crawl = await p.evaluate(() => ({ paras: document.querySelectorAll('.crawl-text p').length, hasLogo: !!document.querySelector('.crawl-logo') }));
  await p.evaluate(() => window.__snail.game.screens.showCredits());
  await sleep(900);
  const credits = await p.evaluate(() => ({ lines: document.querySelectorAll('.credits-scroll p').length }));
  console.log('crawl paragraphs:', crawl.paras, 'logo:', crawl.hasLogo);
  console.log('credits lines:', credits.lines, '(>2 ⇒ loaded from original CREDITS.TXT)');
} catch (e) { errors.push('H: ' + e.message); }
finally { console.log('ERR(' + errors.length + '):', errors.slice(0, 6).join(' | ')); await b.close(); }

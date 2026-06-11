import puppeteer from 'puppeteer-core';
const CHROME = '/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';

const FLAG_SETS = {
  'angle+swiftshader':        ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  'swiftshader-direct':       ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  'angle-gl':                 ['--use-gl=angle', '--use-angle=gl'],
  'egl':                      ['--use-gl=egl'],
  'default':                  [],
};

for (const [name, extra] of Object.entries(FLAG_SETS)) {
  let b;
  try {
    b = await puppeteer.launch({
      executablePath: CHROME, headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-gpu-blocklist', ...extra],
    });
    const p = await b.newPage();
    const r = await p.evaluate(() => {
      const c = document.createElement('canvas');
      const out = {};
      for (const t of ['webgl2', 'webgl']) {
        const gl = c.getContext(t, { stencil: false, antialias: false });
        out[t] = !!gl;
        if (gl && !out.renderer) {
          const dbg = gl.getExtension('WEBGL_debug_renderer_info');
          out.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a';
        }
      }
      return out;
    });
    console.log(name.padEnd(22), JSON.stringify(r));
  } catch (e) {
    console.log(name.padEnd(22), 'ERR', e.message.split('\n')[0]);
  } finally { if (b) await b.close(); }
}

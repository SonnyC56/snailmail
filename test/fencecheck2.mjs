import puppeteer from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-setuid-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();
try{
  await p.goto('http://localhost:5185/',{waitUntil:'networkidle2',timeout:30000}); await sleep(1500); await p.mouse.click(640,400); await sleep(300);
  await p.evaluate(()=>window.__snail.game.startLevel(0,0)); await sleep(1000);
  const r=await p.evaluate(()=>{const lv=window.__snail.game.level; const defs=lv._entDefs||[]; const pillars=defs.filter(d=>d.type==='pillar'); const fence=pillars.filter(d=>d.fence); return {defPillars:pillars.length, defFencePosts:fence.length};});
  console.log('DEF CHECK:', JSON.stringify(r), r.defFencePosts>0 && r.defFencePosts===r.defPillars ? 'PASS (all grid pillars tagged fence)' : (r.defFencePosts>0?'PARTIAL':'FAIL'));
}catch(e){console.log('ERR',e.message)} finally{await b.close();}

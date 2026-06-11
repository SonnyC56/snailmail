import puppeteer from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[];
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-setuid-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1280,800']});
const p=await b.newPage(); await p.setViewport({width:1280,height:800});
p.on('console',m=>{if(m.type()==='error')errors.push(m.text())}); p.on('pageerror',e=>errors.push('PE: '+e.message));
try{
  await p.goto('http://localhost:5185/',{waitUntil:'networkidle2',timeout:30000}); await sleep(1500); await p.mouse.click(640,400); await sleep(300);
  // level idx 1 (galaxy0 level0) uses FENCES
  await p.evaluate(()=>window.__snail.game.startLevel(0,0)); await sleep(1000);
  const r=await p.evaluate(()=>{const lv=window.__snail.game.level; const ents=lv.entities.entities; const pillars=ents.filter(e=>e.type==='pillar'); const fence=pillars.filter(e=>e.fence); return {name:lv.level.name.length+'chars', pillars:pillars.length, fencePosts:fence.length};});
  console.log('FENCE LEVEL:', JSON.stringify(r));
}catch(e){errors.push('H: '+e.message)} finally{console.log('ERR('+errors.length+'):',errors.slice(0,5).join(' | ')); await b.close();}

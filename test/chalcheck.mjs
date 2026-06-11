import puppeteer from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[];
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-setuid-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1280,800']});
const p=await b.newPage(); await p.setViewport({width:1280,height:800});
p.on('console',m=>{if(m.type()==='error')errors.push(m.text())}); p.on('pageerror',e=>errors.push('PE: '+e.message));
try{
  await p.goto('http://localhost:5185/',{waitUntil:'networkidle2',timeout:30000}); await sleep(1500); await p.mouse.click(640,400); await sleep(300);
  await p.evaluate(()=>window.__snail.game.startChallenge()); await sleep(1200);
  const r=await p.evaluate(()=>{const lv=window.__snail.game.level; if(!lv)return{no:1}; const t=lv.track; let nan=0; for(let i=0;i<=100;i++){const f=t.frameAt(i/100*t.length); if([f.pos.x,f.pos.y,f.up.y].some(v=>!Number.isFinite(v)))nan++;} return {mode:lv.mode, name:lv.level.name, len:+t.length.toFixed(0), ents:lv.entities.entities.length, paths:(t.def.paths||[]).length, rolls:(t.def.rolls||[]).length, nan};});
  console.log('CHALLENGE:', JSON.stringify(r));
  // verify real level names show too (story level)
  await p.evaluate(()=>window.__snail.game.startLevel(0,2)); await sleep(800);
  const nm=await p.evaluate(()=>window.__snail.game.level.level.name);
  console.log('story level (0,2) name is real (not Route):', nm !== 'Route 4', '->', nm.length, 'chars');
}catch(e){errors.push('H: '+e.message)} finally{console.log('ERR('+errors.length+'):',errors.slice(0,6).join(' | ')); await b.close();}

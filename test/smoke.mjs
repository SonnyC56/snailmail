import puppeteer from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[];
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-setuid-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1280,800']});
const p=await b.newPage(); await p.setViewport({width:1280,height:800});
p.on('console',m=>{if(m.type()==='error')errors.push(m.text())}); p.on('pageerror',e=>errors.push('PE: '+e.message));
const probe=()=>p.evaluate(()=>{const lv=window.__snail.game.level; if(!lv)return{noLevel:true}; const t=lv.track; let nan=0; for(let i=0;i<=120;i++){const f=t.frameAt(i/120*t.length); if([f.pos.x,f.pos.y,f.pos.z,f.up.y].some(v=>!Number.isFinite(v)))nan++;} return {name:lv.level.name, len:+t.length.toFixed(0), total:lv.totalPackages, ents:lv.entities.entities.length, nan, status:lv.status};});
try{
  await p.goto('http://localhost:5185/',{waitUntil:'networkidle2',timeout:30000});
  await sleep(1200); await p.mouse.click(640,400); await sleep(300);
  // story/arcade levels (galaxy,level)
  for(const [g,l] of [[0,0],[0,2],[1,1],[3,0]]){
    await p.evaluate((a,b)=>window.__snail.game.startLevel(a,b),g,l); await sleep(800);
    console.log(`story(${g},${l}):`, JSON.stringify(await probe()));
  }
  // procedural endless
  await p.evaluate(()=>window.__snail.game.startProcedural(8)); await sleep(800);
  console.log('procedural(8):', JSON.stringify(await probe()));
  // tutorial
  await p.evaluate(()=>window.__snail.game.startTutorial()); await sleep(800);
  console.log('tutorial:', JSON.stringify(await probe()));
  // play one through a bit
  await p.evaluate(()=>window.__snail.game.startLevel(0,0)); await sleep(1200);
  await p.evaluate(()=>{const lv=window.__snail.game.level; lv.countdown=0; lv.status='playing';});
  await sleep(6000);
  console.log('after 6s play:', JSON.stringify(await probe()));
}catch(e){errors.push('H: '+e.message)} finally{console.log('\nERRORS('+errors.length+'):'); for(const e of errors.slice(0,15))console.log(' ',e); await b.close();}

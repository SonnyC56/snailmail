import pp from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await pp.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1280,800']});
const p=await b.newPage(); await p.setViewport({width:1280,height:800});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.text()))errs.push(m.text())});
await p.goto('http://localhost:5185/',{waitUntil:'networkidle2'});
await p.evaluate(()=>localStorage.setItem('snailx.save.v1','{"seenIntro":true,"story":{"unlockedWorld":8,"unlockedLevel":8,"completed":{}}}'));
await p.mouse.click(640,400); await sleep(400);
const out={};
// tutorial
await p.evaluate(()=>window.__snail.game.startTutorial()); await sleep(4000);
out.tutorial=await p.evaluate(()=>{const lv=window.__snail.game.level;return{ok:lv?.status==='playing',rideable:lv?.player?.state!=='falling'}});
// story / arcade / timetrial via startLevel
for(const m of ['story','arcade','timetrial']){
  await p.evaluate((mm)=>{const g=window.__snail.game;g._teardownLevel();g.mode=mm;g.startLevel(1,0);},m); await sleep(4000);
  out[m]=await p.evaluate(()=>{const lv=window.__snail.game.level;return{ok:lv?.status==='playing'||lv?.status==='countdown',len:Math.round(lv?.track?.length||0),pkgs:lv?.entities?.countTotal('package'),fell:lv?.player?.state==='falling'}});
}
console.log('TUTORIAL',JSON.stringify(out.tutorial));
console.log('STORY   ',JSON.stringify(out.story));
console.log('ARCADE  ',JSON.stringify(out.arcade));
console.log('TIMETRIAL',JSON.stringify(out.timetrial));
console.log('ERRORS',JSON.stringify(errs.slice(0,5)));
await b.close();

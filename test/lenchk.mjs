import pp from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await pp.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:5185/',{waitUntil:'networkidle2'});
await p.evaluate(()=>localStorage.setItem('snailx.save.v1','{"seenIntro":true}'));
await p.mouse.click(400,300); await sleep(500);
const res=await p.evaluate(async()=>{const g=window.__snail.game;const out=[];
  for(const [gi,li] of [[0,0],[0,1],[1,0],[2,0],[4,2]]){
    g.mode='arcade'; try{g.startLevel(gi,li);}catch(e){out.push({gi,li,err:e.message});continue;}
    await new Promise(r=>setTimeout(r,300)); const lv=g.level; if(!lv){out.push({gi,li,fail:1});continue;}
    out.push({name:lv.level.name, len:Math.round(lv.track.length), gaps:lv.track.gaps.length, pkgs:lv.entities.countTotal('package'), parcels:lv.level.parcels, slugs:lv.entities.countTotal('slug')});
  }
  return out;});
for(const r of res) console.log(JSON.stringify(r));
console.log('ERR',errs.slice(0,2));
await b.close();

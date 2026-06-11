import pp from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await pp.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.text()))errs.push(m.text())});
await p.goto('http://localhost:5185/',{waitUntil:'networkidle2'});
await p.evaluate(()=>localStorage.setItem('snailx.save.v1','{"seenIntro":true}'));
await p.mouse.click(400,300); await sleep(500);
// directly start a few levels via the game controller, bypassing the star-map UI
const res=await p.evaluate(async()=>{
  const g=window.__snail.game; const out=[];
  for(const [gi,li] of [[0,0],[0,1],[1,0]]){
    g.mode='arcade'; g.startLevel(gi,li);
    await new Promise(r=>setTimeout(r,400));
    const lv=g.level; if(!lv){out.push({gi,li,fail:true});continue;}
    const tr=lv.track; const gapLen=tr.gaps.reduce((a,x)=>a+(x.end-x.start),0);
    out.push({lvl:lv.level.name, len:Math.round(tr.length), nGaps:tr.gaps.length, gapPct:Math.round(100*gapLen/tr.length),
      firstGap:tr.gaps[0]?Math.round(tr.gaps[0].start):null, pkgs:lv.entities.countTotal('package'), parcels:lv.level.parcels,
      slugs:lv.entities.countTotal('slug'), turrets:lv.entities.countTotal('turret'), rings:lv.entities.countTotal('ringWhite')+lv.entities.countTotal('ringYellow'),
      jump:lv.entities.countTotal('jumppod'), mail:lv.entities.countTotal('mailstop')});
  }
  return out;
});
console.log(JSON.stringify(res,null,1));
console.log('ERR',errs.slice(0,3));
await b.close();

import pp from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clk=(p,re)=>p.evaluate(rs=>{const x=[...document.querySelectorAll('.btn,.sprite-btn,.galaxy-star,.star,button')].find(b=>new RegExp(rs,'i').test(b.textContent));if(x){x.click();return true}return false},re);
const b=await pp.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1280,800']});
const p=await b.newPage(); await p.setViewport({width:1280,height:800});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.text()))errs.push(m.text())});
await p.goto('http://localhost:5185/',{waitUntil:'networkidle2'});
await p.evaluate(()=>localStorage.setItem('snailx.save.v1','{"seenIntro":true}'));
await p.mouse.click(640,400); await sleep(400);
await clk(p,'play'); await sleep(400); await clk(p,'arcade'); await sleep(800);
// click first level node/star/pip in whatever the level select renders
await p.evaluate(()=>{const x=[...document.querySelectorAll('.level-pip,.galaxy-star,.star,.galaxy-node,[data-level]')].find(b=>!b.classList?.contains('locked'));x&&x.click();});
await sleep(800); for(let i=0;i<3;i++){if(!await clk(p,'begin|next|deliver'))break;await sleep(250);}
for(let i=0;i<40;i++){await sleep(200);if(await p.evaluate(()=>!!window.__snail.game.level))break;}
const d=await p.evaluate(()=>{const lv=window.__snail?.game?.level; if(!lv)return{noLevel:true};
  const tr=lv.track; const gapLen=tr.gaps.reduce((a,g)=>a+(g.end-g.start),0);
  const firstGapAt=tr.gaps.length?Math.round(tr.gaps[0].start):null;
  return {length:Math.round(tr.length), nGaps:tr.gaps.length, totalGapLen:Math.round(gapLen), gapPct:Math.round(100*gapLen/tr.length), firstGapAt,
    packages:lv.entities.countTotal('package'), levelParcels:lv.level.parcels, slugs:lv.entities.countTotal('slug'), salt:lv.entities.countTotal('salt'),
    jumppods:lv.entities.countTotal('jumppod'), mailstop:lv.entities.countTotal('mailstop')};});
console.log(JSON.stringify(d),'ERR',errs.slice(0,3));
await b.close();

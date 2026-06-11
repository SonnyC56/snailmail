import pp from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clk=(p,re)=>p.evaluate(rs=>{const x=[...document.querySelectorAll('.btn')].find(b=>new RegExp(rs,'i').test(b.textContent));if(x){x.click();return true}return false},re);
const b=await pp.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1280,800']});
const p=await b.newPage(); await p.setViewport({width:1280,height:800});
await p.goto('http://localhost:5185/',{waitUntil:'networkidle2'});
await p.evaluate(()=>localStorage.setItem('snailx.save.v1','{"seenIntro":true,"story":{"unlockedWorld":8,"unlockedLevel":8}}'));
await p.mouse.click(640,400); await sleep(250);
await clk(p,'play'); await sleep(250); await clk(p,'story'); await sleep(400);
// pick a later level pip (more entities) - click last unlocked
await p.evaluate(()=>{const pips=[...document.querySelectorAll('.level-pip')].filter(b=>!b.classList.contains('locked'));pips[Math.min(8,pips.length-1)]?.click();});
await sleep(800); for(let i=0;i<3;i++){if(!await clk(p,'begin|next'))break;await sleep(250);}
await sleep(4500);
const data=await p.evaluate(()=>{
  const lv=window.__snail.game.level; const tr=lv.track;
  const byType={};
  let gaps=tr.gaps.length, jumppods=0;
  for(const e of lv.entities.entities){
    if(e.type==='jumppod')jumppods++;
    const fr=tr.frameAt(e.s);
    const mp=e.mesh.position;
    const dx=mp.x-fr.pos.x, dy=mp.y-fr.pos.y, dz=mp.z-fr.pos.z;
    const lateral=dx*fr.side.x+dy*fr.side.y+dz*fr.side.z;
    const height=dx*fr.up.x+dy*fr.up.y+dz*fr.up.z;
    const off=Math.abs(lateral)>tr.halfWidth+0.5;
    byType[e.type]=byType[e.type]||{n:0,off:0,maxLat:0,maxH:0};
    byType[e.type].n++; if(off)byType[e.type].off++;
    byType[e.type].maxLat=Math.max(byType[e.type].maxLat,+Math.abs(lateral).toFixed(1));
    byType[e.type].maxH=Math.max(byType[e.type].maxH,+height.toFixed(1));
  }
  return {halfWidth:tr.halfWidth, gaps, jumppods, byType};
});
console.log('halfWidth',data.halfWidth,'gaps',data.gaps,'jumppods',data.jumppods);
for(const [t,v] of Object.entries(data.byType)) console.log(t.padEnd(10),'n='+v.n,'off='+v.off,'maxLat='+v.maxLat,'maxH='+v.maxH);
await p.screenshot({path:'/home/sonny/snailmail/test/shots/entcheck.png'});
await b.close();

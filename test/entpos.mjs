import pp from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clk=(p,re)=>p.evaluate(rs=>{const x=[...document.querySelectorAll('.btn')].find(b=>new RegExp(rs,'i').test(b.textContent));if(x){x.click();return true}return false},re);
const b=await pp.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1280,800']});
const p=await b.newPage(); await p.setViewport({width:1280,height:800});
await p.goto('http://localhost:5185/',{waitUntil:'networkidle2'});
await p.evaluate(()=>localStorage.setItem('snailx.save.v1','{"seenIntro":true}'));
await p.mouse.click(640,400); await sleep(250);
await clk(p,'play'); await sleep(250); await clk(p,'arcade'); await sleep(400);
await p.evaluate(()=>{const x=[...document.querySelectorAll('.level-pip')].find(b=>!b.classList.contains('locked'));x&&x.click()});
await sleep(4500);
const data=await p.evaluate(()=>{
  const lv=window.__snail.game.level; const tr=lv.track;
  const THREE=window.__snail.renderer.scene.children[0].constructor; // not reliable
  const rows=[];
  for(const e of lv.entities.entities){
    if(!e.alive) continue;
    if(Math.abs(e.s-lv.player.s)>120) continue;
    // recompute expected surface point and compare to mesh position
    const fr=tr.frameAt(e.s);
    const surf=tr.surfacePoint(e.s,e.x);
    const mp=e.mesh.position;
    const dx=mp.x-fr.pos.x, dy=mp.y-fr.pos.y, dz=mp.z-fr.pos.z;
    const lateral = dx*fr.side.x+dy*fr.side.y+dz*fr.side.z;
    const height = dx*fr.up.x+dy*fr.up.y+dz*fr.up.z;
    rows.push({type:e.type, x:+e.x.toFixed(2), lat:+lateral.toFixed(2), h:+height.toFixed(2)});
  }
  return {halfWidth:tr.halfWidth, rows:rows.slice(0,24)};
});
console.log('halfWidth',data.halfWidth);
for(const r of data.rows) console.log(r.type.padEnd(10), 'x='+r.x, 'lateral='+r.lat, 'height='+r.h, Math.abs(r.lat)>data.halfWidth?'  <<< OFF TRACK':'');
await b.close();

import pp from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clk=(p,re)=>p.evaluate(rs=>{const x=[...document.querySelectorAll('.btn,.sprite-btn,button')].find(b=>new RegExp(rs,'i').test(b.textContent));if(x){x.click();return true}return false},re);
const b=await pp.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:5185/',{waitUntil:'networkidle2'});
await p.evaluate(()=>localStorage.setItem('snailx.save.v1','{"seenIntro":true}'));
await p.mouse.click(400,300); await sleep(400);
await clk(p,'play'); await sleep(400); await clk(p,'arcade'); await sleep(600);
await p.evaluate(()=>{const x=[...document.querySelectorAll('.level-pip')].find(b=>!b.classList.contains('locked'));x&&x.click()});
for(let i=0;i<30;i++){await sleep(200);if(await p.evaluate(()=>!!window.__snail.game.level))break;}
await sleep(7000);
const d=await p.evaluate(()=>{
  const THREE=window.__snail.THREE||null;
  const lv=window.__snail.game.level; const pl=lv.player;
  // intended foot point on the track surface
  const surf=lv.track.surfacePoint(pl.s, pl.x);
  // world bounding box of the snail group's textured Turbo mesh
  const sn=pl.snail;
  let minY=1e9, found=false;
  sn.group.updateWorldMatrix(true,true);
  sn.group.traverse(o=>{
    if(o.geometry && o.geometry.userData && o.geometry.userData.texture){
      o.geometry.computeBoundingBox();
      const bb=o.geometry.boundingBox.clone(); bb.applyMatrix4(o.matrixWorld);
      minY=Math.min(minY,bb.min.y); found=true;
    }
  });
  // find the turbo subgroup pos.y
  let turboY=null;
  sn.group.children.forEach(c=>{ if(c.children?.some(m=>m.geometry?.userData?.texture)) turboY=+c.position.y.toFixed(3); });
  return {usingOriginal: found, playerY:+pl.group.position.y.toFixed(3), surfaceY:+surf.y.toFixed(3), turboMeshMinWorldY: found?+minY.toFixed(3):null, gap: found?+(minY-surf.y).toFixed(3):null, turboSubgroupY:turboY};
});
console.log(JSON.stringify(d),'ERR',errs.slice(0,2));
await b.close();

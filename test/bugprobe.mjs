import puppeteer from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-setuid-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();
try{
  await p.goto('http://localhost:5185/',{waitUntil:'networkidle2',timeout:30000}); await sleep(1500); await p.mouse.click(640,400); await sleep(300);
  await p.evaluate(()=>window.__snail.game.startLevel(0,0)); await sleep(2800);
  const clip=await p.evaluate(()=>{
    const lv=window.__snail.game.level, P=lv.player; const V3=P.group.position.constructor;
    const surf=lv.track.surfacePoint(P.s,P.x), up=lv.track.surfaceNormal(P.s);
    P.snail.group.updateWorldMatrix(true,true);
    let lowest={d:Infinity};
    P.snail.group.traverse(o=>{
      if(o.isMesh && o.visible && o.geometry){ o.geometry.computeBoundingBox(); const bb=o.geometry.boundingBox; if(!bb) return;
        for(const x of [bb.min.x,bb.max.x]) for(const y of [bb.min.y,bb.max.y]) for(const z of [bb.min.z,bb.max.z]){
          const w=new V3(x,y,z).applyMatrix4(o.matrixWorld);
          const d=(w.x-surf.x)*up.x+(w.y-surf.y)*up.y+(w.z-surf.z)*up.z;
          if(d<lowest.d) lowest={d:+d.toFixed(3), name:o.name||'(unnamed)', geo:o.geometry.attributes?.position?.count, parent:o.parent?.name||'?'};
        }
      }
    });
    return { lowestAboveRoad:lowest.d, lowestMesh:lowest };
  });
  console.log('HEIGHT:', JSON.stringify(clip));
  // tutorial: drop player just before first pod, run physics, see if it crosses the gap
  await p.evaluate(()=>window.__snail.game.startTutorial()); await sleep(2000);
  const tut=await p.evaluate(async()=>{
    const lv=window.__snail.game.level, P=lv.player, t=lv.track;
    const firstGap=t.gaps.slice().sort((a,b)=>a.start-b.start)[0];
    lv.status='playing'; lv.countdown=0;
    P.s=firstGap.start-12; P.x=0; P.h=0; P.state='riding';
    const startLives=lv.lives;
    let crossed=false, fell=false, maxH=0;
    for(let i=0;i<200;i++){ lv.update(0.03,{steer:0,fireHeld:false}); maxH=Math.max(maxH,P.h); if(P.state==='falling'){fell=true;break;} if(P.s>firstGap.end+5){crossed=true;break;} }
    return { gapStart:+firstGap.start.toFixed(1), gapLen:+(firstGap.end-firstGap.start).toFixed(1), crossed, fell, endS:+P.s.toFixed(1), maxAir:+maxH.toFixed(1), livesLost:startLives-lv.lives };
  });
  console.log('TUTORIAL JUMP:', JSON.stringify(tut));
}catch(e){console.log('ERR',e.message)} finally{await b.close();}

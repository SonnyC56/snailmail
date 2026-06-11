import pp from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const b=await pp.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1280,800']});
const p=await b.newPage(); await p.setViewport({width:1280,height:800});
await p.goto('http://localhost:5185/',{waitUntil:'networkidle2'});
await p.mouse.click(640,400); await new Promise(r=>setTimeout(r,300));
const clk=(re)=>p.evaluate((rs)=>{const x=[...document.querySelectorAll('.btn')].find(b=>new RegExp(rs,'i').test(b.textContent));if(x){x.click();return true}return false},re);
await clk('play'); await new Promise(r=>setTimeout(r,300));
await clk('story'); await new Promise(r=>setTimeout(r,400));
await p.evaluate(()=>{const x=[...document.querySelectorAll('.level-pip')].find(b=>!b.classList.contains('locked'));x&&x.click()});
await new Promise(r=>setTimeout(r,400));
for(let i=0;i<4;i++){if(!await clk('begin|next'))break;await new Promise(r=>setTimeout(r,250));}
await new Promise(r=>setTimeout(r,4500));
const diag=await p.evaluate(()=>{
  const {game,renderer}=window.__snail; const cam=renderer.camera; const sc=renderer.scene;
  const info=renderer.renderer.info; const lv=game.level;
  return {
    status: lv?.status,
    camPos: cam.position.toArray().map(v=>+v.toFixed(1)),
    camHasNaN: [cam.position.x,cam.position.y,cam.position.z,cam.quaternion.x,cam.quaternion.y,cam.quaternion.z,cam.quaternion.w].some(Number.isNaN),
    camNear: cam.near, camFar: cam.far, camFov:+cam.fov.toFixed(1),
    camUp: cam.up.toArray().map(v=>+v.toFixed(2)),
    sceneChildren: sc.children.length,
    drawCalls: info.render.calls, triangles: info.render.triangles,
    skyPos: lv?.env?.sky?.position?.toArray().map(v=>+v.toFixed(0)) ?? null,
    playerPos: lv?.player?.group?.position?.toArray().map(v=>+v.toFixed(1)) ?? null,
    trackLen:+(lv?.track?.length?.toFixed(0)),
    fog: sc.fog? [sc.fog.near, sc.fog.far]: null,
  };
});
console.log(JSON.stringify(diag,null,2));
await b.close();

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
await new Promise(r=>setTimeout(r,5000));
const d=await p.evaluate(()=>{
  const {game,renderer}=window.__snail; const sc=renderer.scene; const lv=game.level;
  const bg=sc.background;
  const trackMesh=lv?.trackMesh?.children?.[0];
  const map=trackMesh?.material?.map;
  return {
    bgIsTexture: !!(bg && bg.isTexture),
    bgImage: bg?.image? [bg.image.width, bg.image.height] : null,
    trackHasMap: !!map,
    trackMapImage: map?.image? [map.image.width, map.image.height] : null,
  };
});
console.log(JSON.stringify(d,null,2));
await b.close();

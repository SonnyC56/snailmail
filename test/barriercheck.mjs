import puppeteer from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[];
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-setuid-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();
p.on('console',m=>{if(m.type()==='error')errors.push(m.text())}); p.on('pageerror',e=>errors.push('PE: '+e.message));
try{
  await p.goto('http://localhost:5185/',{waitUntil:'networkidle2',timeout:30000}); await sleep(1500); await p.mouse.click(640,400); await sleep(300);
  await p.evaluate(()=>window.__snail.game.startLevel(0,0)); await sleep(1200);
  const r=await p.evaluate(()=>{
    const lv=window.__snail.game.level, P=lv.player; lv.countdown=0; lv.status='playing';
    // hard steer right for a while; should clamp, not fall
    let fell=false;
    for(let i=0;i<60;i++){ lv.update(0.03,{steer:1,left:false,right:true,fireHeld:false}); if(P.state==='falling'){fell=true;break;} }
    const ext=lv.track.drivableExtent(P.s);
    return { fellOffSide:fell, x:+P.x.toFixed(2), extMax:ext?+ext.max.toFixed(2):null, clampedToEdge: ext? Math.abs(P.x-ext.max)<0.3:null, state:P.state };
  });
  console.log('BARRIER:', JSON.stringify(r));
}catch(e){errors.push('H: '+e.message)} finally{console.log('ERR('+errors.length+'):',errors.slice(0,5).join(' | ')); await b.close();}

import pp from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clk=(p,re)=>p.evaluate(rs=>{const x=[...document.querySelectorAll('.btn')].find(b=>new RegExp(rs,'i').test(b.textContent));if(x){x.click();return true}return false},re);
const b=await pp.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1280,800']});
const p=await b.newPage(); await p.setViewport({width:1280,height:800});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:5185/',{waitUntil:'networkidle2'});
await p.evaluate(()=>localStorage.setItem('snailx.save.v1','{"seenIntro":true}'));
await p.mouse.click(640,400); await sleep(250);
await clk(p,'play'); await sleep(250); await clk(p,'arcade'); await sleep(400);
await p.evaluate(()=>{const x=[...document.querySelectorAll('.level-pip')].find(b=>!b.classList.contains('locked'));x&&x.click()});
for(let i=0;i<30;i++){await sleep(200);if(await p.evaluate(()=>!!window.__snail.game.level))break;}
await sleep(6500); // let turbo mesh load + ride
const d=await p.evaluate(()=>{const lv=window.__snail.game.level;const sn=lv.player.snail;
  const turbo=sn.group.children.find(c=>c.children?.some?.(m=>m.geometry?.userData?.texture));
  return {usingOriginal: !!sn.usingOriginal, turboRotY: turbo?+turbo.rotation.y.toFixed(2):null, turboPosY: turbo?+turbo.position.y.toFixed(2):null,
    musicName: window.__snail.audio._musicName};});
console.log(JSON.stringify(d),'errors',errs.slice(0,3));
await p.screenshot({path:'/home/sonny/snailmail/test/shots/turbofix.png'});
await b.close();

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
// wait for level
for(let i=0;i<30;i++){await sleep(200);const ok=await p.evaluate(()=>!!window.__snail.game.level);if(ok)break;}
await sleep(500);
const d=await p.evaluate(()=>{const lv=window.__snail.game.level;return {gaps:lv.track.gaps.length, jumppods:lv.entities.countTotal('jumppod'), jetpacks:lv.entities.countTotal('jetpack'), sceneKids:window.__snail.renderer.scene.children.length}});
console.log('GAPS',d.gaps,'JUMPPODS',d.jumppods,'JETPACKS',d.jetpacks);
await b.close();

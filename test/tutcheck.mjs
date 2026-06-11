import pp from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await pp.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1280,800']});
const p=await b.newPage(); await p.setViewport({width:1280,height:800});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.text()))errs.push(m.text())});
await p.goto('http://localhost:5185/',{waitUntil:'networkidle2'});
await p.mouse.click(640,400); await sleep(400);
await p.evaluate(()=>window.__snail.game.startTutorial());
for(let i=0;i<35;i++){await sleep(200);if(await p.evaluate(()=>!!window.__snail.game.level))break;}
await sleep(5000);
const d=await p.evaluate(()=>{const g=window.__snail.game;const lv=g.level;
  const cap=document.querySelector('.tutorial-caption');
  return {mode:g.mode, isTutorial:lv?.level?.isTutorial, status:lv?.status, len:Math.round(lv?.track?.length||0),
    captionPresent: !!cap, captionText: cap?cap.textContent.slice(0,40):null, captionVisible: cap?cap.style.opacity:'?',
    guideIdx: g.tutorialGuide?.idx, steps: g.tutorialGuide?.steps?.length, playerS:+(lv?.player?.s||0).toFixed(0)};});
console.log(JSON.stringify(d),'ERR',errs.slice(0,3));
await p.screenshot({path:'/home/sonny/snailmail/test/shots/tutorial.png'});
await b.close();

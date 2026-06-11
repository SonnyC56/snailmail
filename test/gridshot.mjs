import pp from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await pp.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1280,800']});
const p=await b.newPage(); await p.setViewport({width:1280,height:800});
await p.goto('http://localhost:5185/',{waitUntil:'networkidle2'});
await p.evaluate(()=>localStorage.setItem('snailx.save.v1','{"seenIntro":true}'));
await p.mouse.click(640,400); await sleep(500);
await p.evaluate(async()=>{const g=window.__snail.game;g.mode='arcade';g.startLevel(1,0);await new Promise(r=>setTimeout(r,5500));});
await sleep(3500); // ride into the level
await p.screenshot({path:'/home/sonny/snailmail/test/shots/gridroad.png'});
await b.close();

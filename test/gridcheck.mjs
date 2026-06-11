import pp from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await pp.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1280,800']});
const p=await b.newPage(); await p.setViewport({width:1280,height:800});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.text()))errs.push(m.text())});
await p.goto('http://localhost:5185/',{waitUntil:'networkidle2'});
await p.evaluate(()=>localStorage.setItem('snailx.save.v1','{"seenIntro":true}'));
await p.mouse.click(640,400); await sleep(500);
const d=await p.evaluate(async()=>{const g=window.__snail.game;g.mode='arcade';g.startLevel(1,0);await new Promise(r=>setTimeout(r,5500));
  const lv=g.level;const tr=lv.track;
  // ride forward a couple seconds, track fall state
  let fellEarly=false;
  for(let i=0;i<40;i++){ if(lv.player.state==='falling'){fellEarly=true;break;} await new Promise(r=>setTimeout(r,80)); }
  return {hasCells: !!tr.cells, cellRows: tr.cells?tr.cells.length:0, rowUnits:tr.rowUnits,
    centerDrivableAt0: tr.hasSurface(20,0), edgeDrivableAt0: tr.hasSurface(20,6.5),
    playerState: lv.player.state, fellEarly, progress:+lv.progress.toFixed(2)};});
console.log(JSON.stringify(d),'ERR',errs.slice(0,3));
await p.screenshot({path:'/home/sonny/snailmail/test/shots/gridroad.png'});
await b.close();

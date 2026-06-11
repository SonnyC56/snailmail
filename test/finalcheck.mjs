import pp from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clk=(p,re)=>p.evaluate(rs=>{const x=[...document.querySelectorAll('.btn,.sprite-btn,button')].find(b=>new RegExp(rs,'i').test(b.textContent));if(x){x.click();return true}return false},re);
const b=await pp.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1280,800']});
const p=await b.newPage(); await p.setViewport({width:1280,height:800});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.text()))errs.push(m.text())});
await p.goto('http://localhost:5185/',{waitUntil:'networkidle2'});
await p.evaluate(()=>localStorage.setItem('snailx.save.v1','{"seenIntro":true}'));
await p.mouse.click(640,400); await sleep(500);
await p.screenshot({path:'/home/sonny/snailmail/test/shots/final-title.png'});
await clk(p,'play'); await sleep(600);
await p.screenshot({path:'/home/sonny/snailmail/test/shots/final-mode.png'});
await clk(p,'arcade'); await sleep(700);
await p.evaluate(()=>{const x=[...document.querySelectorAll('.level-pip')].find(b=>!b.classList.contains('locked'));x&&x.click()});
for(let i=0;i<30;i++){await sleep(200);if(await p.evaluate(()=>!!window.__snail.game.level))break;}
await sleep(6500);
await p.keyboard.down('Space'); await sleep(1200);
const d=await p.evaluate(()=>{const lv=window.__snail.game.level;const sn=lv.player.snail;
  const turbo=sn.group.children.find(c=>c.position && c.scale && c.children?.length && c.children.some(m=>m.geometry));
  let turretShoot=0,turretN=0,pillarN=0;for(const e of lv.entities.entities){if(e.type==='turret'){turretN++;if(e.shootable)turretShoot++;}if(e.type==='pillar')pillarN++;}
  return {turboPosY: turbo?+turbo.position.y.toFixed(2):null, shots: lv.weapons.shots.length, shotType: lv.weapons.shots[0]?.mesh?.type, turretN, turretShoot, pillarN, music: window.__snail.audio._musicName};});
await p.keyboard.up('Space');
console.log(JSON.stringify(d),'ERR',errs.slice(0,3));
await p.screenshot({path:'/home/sonny/snailmail/test/shots/final-game.png'});
await b.close();

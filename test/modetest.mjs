import pp from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clk=(p,re)=>p.evaluate(rs=>{const x=[...document.querySelectorAll('.btn')].find(b=>new RegExp(rs,'i').test(b.textContent));if(x){x.click();return true}return false},re);
async function testMode(mode){
  const b=await pp.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1100,720']});
  const p=await b.newPage(); await p.setViewport({width:1100,height:720});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.text()))errs.push('c:'+m.text())});
  await p.goto('http://localhost:5185/',{waitUntil:'networkidle2'});
  await p.mouse.click(550,360); await sleep(250);
  await clk(p,'play'); await sleep(300);
  await clk(p, mode); await sleep(500);
  // pick first unlocked pip
  await p.evaluate(()=>{const x=[...document.querySelectorAll('.level-pip')].find(b=>!b.classList.contains('locked'));x&&x.click()});
  await sleep(500);
  for(let i=0;i<3;i++){if(!await clk(p,'begin|next'))break;await sleep(250);}
  await sleep(5000);
  // drive a bit
  await p.keyboard.down('Space'); await p.keyboard.down('ArrowRight'); await sleep(1500); await p.keyboard.up('ArrowRight'); await p.keyboard.up('Space');
  const st=await p.evaluate(()=>{const lv=window.__snail.game.level;return lv?{status:lv.status,mode:lv.mode,speed:+lv.player.speed.toFixed(1),lives:lv.lives,packages:lv.packages+'/'+lv.totalPackages,score:lv.score}:{noLevel:true}});
  console.log(mode.toUpperCase(), JSON.stringify(st), 'errors:', errs.slice(0,5));
  await b.close();
}
await testMode('arcade');
await testMode('time trial');

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
await sleep(4500); // through countdown
// TEST 1: keyboard hold right -> should fall off edge
await p.keyboard.down('ArrowRight');
let fellKb=false, leanMax=0;
for(let i=0;i<40;i++){
  await sleep(80);
  const st=await p.evaluate(()=>{const lv=window.__snail.game.level;return {state:lv.player.state,x:+lv.player.x.toFixed(2),lean:+(lv.player._lean||0).toFixed(3),hw:lv.track.halfWidth}});
  leanMax=Math.max(leanMax,Math.abs(st.lean));
  if(st.state==='falling'){fellKb=true;break;}
}
await p.keyboard.up('ArrowRight');
// TEST 2: mouse to far right -> x should exceed halfWidth (can leave track)
await sleep(2500);
await p.mouse.move(1270,400);
let mouseX=0;
for(let i=0;i<25;i++){await sleep(80);const st=await p.evaluate(()=>{const lv=window.__snail.game.level;return {x:+lv.player.x.toFixed(2),state:lv.player.state}});mouseX=st.x;if(st.state==='falling'||Math.abs(st.x)>6)break;}
console.log(JSON.stringify({fellKb,leanMax,mouseReachedX:mouseX}));
await b.close();

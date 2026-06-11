import pp from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const URL='http://localhost:8080/';
async function mk(){const b=await pp.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1100,720']});const p=await b.newPage();await p.setViewport({width:1100,height:720});const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(URL,{waitUntil:'networkidle2'});await p.mouse.click(550,360);await sleep(300);return{b,p,errs};}
const clk=(p,re)=>p.evaluate(rs=>{const x=[...document.querySelectorAll('.btn,.sprite-btn,.mp-room,button')].find(b=>new RegExp(rs,'i').test(b.textContent));if(x){x.click();return true}return false},re);
const c1=await mk(); const c2=await mk();
// both: Play -> Online Race
for(const c of [c1,c2]){await clk(c.p,'^play$|play'); await sleep(250); await clk(c.p,'online'); await sleep(600);}
// c1 quick play (creates/joins a room), c2 quick play (joins same room)
await clk(c1.p,'quick play'); await sleep(600);
await clk(c2.p,'quick play'); await sleep(800);
const lob=async(c)=>c.p.evaluate(()=>{const s=window.__snail.game.online;return{screen:s?._screen,room:s?.roomName,players:s?.players?.length,host:s?.host,isHost:s?.host===s?.id};});
console.log('C1',JSON.stringify(await lob(c1)));
console.log('C2',JSON.stringify(await lob(c2)));
// both ready up -> should auto start
await clk(c1.p,'ready'); await sleep(300); await clk(c2.p,'ready'); await sleep(5500);
const race=async(c)=>c.p.evaluate(()=>{const s=window.__snail.game.online;const lv=window.__snail.game.level;return{racing:s?._racing,ghosts:s?.ghosts?s.ghosts.ghosts.size:-1,levelStatus:lv?.status};});
console.log('C1 race',JSON.stringify(await race(c1)));
console.log('C2 race',JSON.stringify(await race(c2)));
await c1.p.screenshot({path:'/home/sonny/snailmail/test/shots/mp-lobby.png'});
console.log('ERR',JSON.stringify([...c1.errs,...c2.errs].slice(0,4)));
await c1.b.close(); await c2.b.close();

import puppeteer from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[];
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-setuid-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1280,800']});
const p=await b.newPage(); await p.setViewport({width:1280,height:800});
p.on('console',m=>{if(m.type()==='error')errors.push(m.text())}); p.on('pageerror',e=>errors.push('PE: '+e.message));
try{
  await p.goto('http://localhost:5185/',{waitUntil:'networkidle2',timeout:30000});
  await sleep(1200); await p.mouse.click(640,400); await sleep(300);
  const rows=[];
  for(const [gi,li] of [[0,0],[0,1],[0,2],[1,0],[2,1]]){
    await p.evaluate((g,l)=>window.__snail.game.startLevel(g,l),gi,li);
    await sleep(900);
    const r=await p.evaluate(()=>{const lv=window.__snail.game.level; if(!lv)return null; return {name:lv.level.name, parcels:lv.level.parcels, total:lv.totalPackages, quota:lv.level.quota};});
    if(r) rows.push(r);
  }
  for(const r of rows) console.log(`${r.name}: total=${r.total} parcels=${r.parcels} quota=${r.quota} ${r.total===r.parcels?'OK':(r.total<r.parcels?'(fewer-topup)':'MISMATCH')}`);
}catch(e){errors.push('H: '+e.message)} finally{console.log('ERR('+errors.length+'):',errors.slice(0,6).join(' | ')); await b.close();}

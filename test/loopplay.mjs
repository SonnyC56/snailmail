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
  await p.evaluate(()=>window.__snail.game.startLevel(0,2)); // Loopy
  await sleep(1500);
  const samples=[];
  for(let i=0;i<10;i++){
    const st=await p.evaluate(()=>{const lv=window.__snail.game.level; return {s:+lv.player.s.toFixed(0), len:+lv.track.length.toFixed(0), lives:lv.lives, status:lv.status, prog:+lv.progress.toFixed(2), state:lv.player.state};});
    samples.push(st); await sleep(1000);
  }
  const first=samples[0], last=samples[samples.length-1];
  console.log('start:',JSON.stringify(first));
  console.log('end:  ',JSON.stringify(last));
  console.log('advanced:', last.s-first.s, 'units over ~9s; lives', first.lives,'->',last.lives);
  // did s keep increasing (not stuck)?
  let stuck=0; for(let i=1;i<samples.length;i++) if(samples[i].s<=samples[i-1].s+1) stuck++;
  console.log('near-stalled samples:', stuck, '/', samples.length-1);
}catch(e){errors.push('H: '+e.message)} finally{console.log('ERR('+errors.length+'):',errors.slice(0,8).join(' | ')); await b.close();}

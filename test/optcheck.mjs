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
  await p.evaluate(()=>{const x=[...document.querySelectorAll('.btn')].find(b=>/options/i.test(b.textContent)); if(x)x.click();});
  await sleep(900);
  await p.screenshot({path:'/home/sonny/snailmail/test/shots/options-sliders.png'});
  const probe=await p.evaluate(()=>({rows:document.querySelectorAll('.opt-slider-row').length, tracks:document.querySelectorAll('.opt-slider-track').length, steppers:document.querySelectorAll('.opt-stepper').length}));
  console.log('OPTIONS:',JSON.stringify(probe));
}catch(e){errors.push('H: '+e.message)} finally{console.log('ERR('+errors.length+'):',errors.slice(0,8).join(' | ')); await b.close();}

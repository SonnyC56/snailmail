import puppeteer from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[];
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-setuid-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--window-size=1280,800']});
const p=await b.newPage(); await p.setViewport({width:1280,height:800});
p.on('console',m=>{if(m.type()==='error')errors.push(m.text())}); p.on('pageerror',e=>errors.push('PE: '+e.message));
try{
  await p.goto('http://localhost:5185/',{waitUntil:'domcontentloaded',timeout:30000});
  await sleep(450);
  const onLoad=await p.evaluate(()=>({loading:!!document.querySelector('.loading-screen'), bar:!!document.querySelector('.loading-bar-fill')}));
  await p.screenshot({path:'/home/sonny/snailmail/test/shots/loading.png'});
  await sleep(1400);
  const after=await p.evaluate(()=>({loadingGone:!document.querySelector('.loading-screen'), title:!!document.querySelector('.splash-screen, .title-menu, .menu-list')}));
  console.log('at 450ms:',JSON.stringify(onLoad),' after:',JSON.stringify(after));
}catch(e){errors.push('H: '+e.message)} finally{console.log('ERR('+errors.length+'):',errors.slice(0,6).join(' | ')); await b.close();}

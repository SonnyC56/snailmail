import puppeteer from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-setuid-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();
try{
  await p.goto('http://localhost:5185/',{waitUntil:'networkidle2',timeout:30000}); await sleep(1500); await p.mouse.click(640,400); await sleep(300);
  await p.evaluate(()=>window.__snail.game.startTutorial()); await sleep(1500);
  const r=await p.evaluate(()=>{
    const t=window.__snail.game.level.track;
    const firstGap=t.gaps.slice().sort((a,b)=>a.start-b.start)[0];
    const out=[];
    for(let s=firstGap.start-4; s<=firstGap.end+4; s+=t.rowUnits){
      const row=Math.floor(s/t.rowUnits);
      const cells=t.cells? t.cells[row] : '(procedural)';
      const ext=t.drivableExtent(s);
      out.push({s:+s.toFixed(1), cells, ext:ext?`[${ext.min},${ext.max}]`:'NULL', surfCenter:t.hasSurface(s,0)});
    }
    return { gap:{start:+firstGap.start.toFixed(1),end:+firstGap.end.toFixed(1)}, rows:out };
  });
  console.log('GAP:',JSON.stringify(r.gap));
  for(const x of r.rows) console.log(`  s=${x.s} cells='${x.cells}' ext=${x.ext} surf@0=${x.surfCenter}`);
}catch(e){console.log('ERR',e.message)} finally{await b.close();}

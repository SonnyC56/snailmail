import pp from 'puppeteer-core';
const CHROME='/home/sonny/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await pp.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.text()))errs.push(m.text())});
await p.goto('http://localhost:5185/',{waitUntil:'networkidle2'});
await p.evaluate(()=>localStorage.setItem('snailx.save.v1','{"seenIntro":true}'));
await p.mouse.click(400,300); await sleep(500);
const d=await p.evaluate(async()=>{const g=window.__snail.game;g.mode='arcade';g.startLevel(1,0);await new Promise(r=>setTimeout(r,5500));
  const lv=g.level;const P=lv.player;
  // go postal: ram the meter to full
  P.shieldInvuln=0; const r=P.addDamage(100); const wasPostal=P.postal; const spd=+P._targetSpeed().toFixed(0);
  // fire to spawn a bolt
  P.fireCooldown=0; lv.weapons.fire(P.weapon, P.s, P.x);
  const shot=lv.weapons.shots[0];
  // ring structure
  const ring=lv.entities.entities.find(e=>e.type&&e.type.startsWith('ring'));
  const ringChild=ring?ring.mesh.children[0]:null;
  return {addDamageResult:r, postal:wasPostal, postalSpeed:spd, maxSpeed:+P.maxSpeed.toFixed(0),
    shotKind:shot?.mesh?.type, ring:ring?.type, ringIsStarGroup: !!(ringChild&&ringChild.type==='Group'&&ringChild.children?.length>5),
    weaponInvincAt7: lv.player.weapon? 'ok':'?'};});
console.log(JSON.stringify(d),'ERR',errs.slice(0,3));
await b.close();

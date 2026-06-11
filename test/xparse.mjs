import { readFileSync } from 'node:fs';
// import the pure parser (strip the three.js parts by reading just the function)
const mod = await import('../src/track/xloader.js').catch(async()=>{
  // xloader imports three; load via a shim isn't trivial — instead eval the parseX source
  return null;
});

/**
 * Bake the original CHALLENGE000 level: add its segment chain to
 * levelSegments.json (under idx 100) and emit challenge.json with its numeric
 * config, so the remaster can run the original Challenge level like any other.
 * Functional level data only (segment names + numbers) — no creative content.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'extracted', 'LEVELS', 'CHALLENGE000.TXT');
const OUT = join(ROOT, 'src', 'data');
const CHALLENGE_IDX = 100;

const segKey = (n) => n.replace(/\.txt.*$/i, '').trim().toUpperCase();
const parseAngle = (l) => { const m = l.match(/Angle\s*=\s*(-?\d+(?:\.\d+)?)/i); return m ? parseFloat(m[1]) : null; };
const text = readFileSync(SRC, 'utf8');
const lines = text.split(/\r?\n/);
const clean = (s) => s.replace(/\/\*[^]*?\*\//g, '').trim();
const grab = (re) => { const m = text.match(re); return m ? m[1].trim() : null; };
const num = (re, d) => { const v = grab(re); const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

const chain = { name: grab(/Name:\s*'?([^'\r\n]*)'?/i) || 'Challenge',
  random: /Random:\s*yes/i.test(text), length: grab(/Length:\s*(\w+)/i) || 'auto',
  segments: [], segAngles: [], first: null, firstAngle: null, last: null, lastAngle: null };

const begin = lines.findIndex((l) => /Segments Begin:/i.test(l));
const end = lines.findIndex((l) => /Segments End:/i.test(l));
if (begin >= 0 && end > begin) {
  for (let i = begin; i < end; i++) {
    const l = clean(lines[i]).replace(/Segments Begin:/i, '').trim();
    // unanchored .txt test so "Worm.txt Angle=360" is kept (not dropped); also
    // preserve the per-instance roll angle alongside the segment key.
    if (/\.txt/i.test(l)) { chain.segments.push(segKey(l)); chain.segAngles.push(parseAngle(l)); }
  }
}
const grabAfter = (label) => {
  const idx = lines.findIndex((l) => new RegExp(label + ':', 'i').test(l));
  if (idx < 0) return { key: null, angle: null };
  for (let i = idx; i < Math.min(idx + 4, lines.length); i++) {
    const l = clean(lines[i]).replace(new RegExp(label + ':', 'i'), '').trim();
    if (/\.txt/i.test(l)) return { key: segKey(l), angle: parseAngle(l) };
  }
  return { key: null, angle: null };
};
{ const f = grabAfter('First'); chain.first = f.key; chain.firstAngle = f.angle; }
{ const la = grabAfter('Last'); chain.last = la.key; chain.lastAngle = la.angle; }

// numeric gameplay config
const cfg = {
  idx: CHALLENGE_IDX,
  name: chain.name,
  speed: num(/Speed:\s*(\d+)/i, 60),
  parcels: num(/Parcels:\s*(\d+)/i, 20),
  quota: num(/Quota:\s*(\d+)/i, 0),
  garbage: num(/garbage:\s*(\d+)/i, 40),
  salt: num(/Salt:\s*(\d+)/i, 30),
  background: grab(/Background:\s*(\w+)/i) || 'SpacePurple',
  track: num(/Track:\s*(\d+)/i, 0),
  length: grab(/Length:\s*(\w+)/i) || '600',
};

// merge into levelSegments.json under the challenge idx
const lsPath = join(OUT, 'levelSegments.json');
const ls = JSON.parse(readFileSync(lsPath, 'utf8'));
ls[CHALLENGE_IDX] = chain;
writeFileSync(lsPath, JSON.stringify(ls, null, 0));
writeFileSync(join(OUT, 'challenge.json'), JSON.stringify(cfg, null, 0));
console.log(`baked Challenge: ${chain.segments.length} segments, first=${chain.first}, last=${chain.last}`);
console.log('config:', JSON.stringify(cfg));

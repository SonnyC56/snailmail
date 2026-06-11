/**
 * Build-time baker: read the ORIGINAL Snail Mail segment + level text files and
 * emit derived JSON the web remaster imports directly (no runtime fetch).
 *
 *   extracted/SEGMENTS/*.TXT   -> src/data/segmentData.json   (raw grids)
 *   extracted/LEVELS/ARCADE*.TXT -> src/data/levelSegments.json (segment chains)
 *
 * The parsing here is intentionally minimal — it only captures the data the
 * runtime parser (src/data/segments.js) needs (name + the raw grid rows for
 * segments; the Random/Length/Segments list for levels). All gameplay meaning
 * (symbol -> entity, row -> distance) is decoded at runtime from the grid.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SEG_DIR = join(ROOT, 'extracted', 'SEGMENTS');
const LVL_DIR = join(ROOT, 'extracted', 'LEVELS');
const OUT_DIR = join(ROOT, 'src', 'data');

/** Normalise a segment file name to a lookup key: upper-case, no .txt, trimmed.
 *  Strips any trailing per-instance annotation too (e.g. "Worm.txt Angle=-360"
 *  -> "WORM"), so annotated segment lines resolve to the same key as the file. */
function segKey(name) {
  return name.replace(/\.txt.*$/i, '').trim().toUpperCase();
}

/** Pull the per-instance roll magnitude from a segment line, e.g.
 *  "Invert.txt Angle=-180" -> -180. Returns null when unannotated. */
function parseAngle(line) {
  const m = line.match(/Angle\s*=\s*(-?\d+(?:\.\d+)?)/i);
  return m ? parseFloat(m[1]) : null;
}

// ---- segments -------------------------------------------------------------

function parseSegmentFile(text) {
  const lines = text.split(/\r?\n/);
  let name = null;
  let dataIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const nm = l.match(/^Name:\s*'?([^'\r\n]*)'?/i);
    if (nm && name === null) name = nm[1].trim();
    if (/^Data:/i.test(l.trim())) { dataIdx = i; break; }
  }
  const rows = [];
  if (dataIdx >= 0) {
    for (let i = dataIdx + 1; i < lines.length; i++) {
      const raw = lines[i];
      // a grid row begins with '@' (the left wall). Stop at the first non-grid
      // trailing line. We keep the FULL raw line (incl. trailing annotations).
      if (raw.startsWith('@')) rows.push(raw.replace(/\s+$/, ''));
    }
  }
  return { name: name || 'Segment', rows };
}

const segmentData = {};
for (const file of readdirSync(SEG_DIR)) {
  if (!/\.txt$/i.test(file)) continue;
  const text = readFileSync(join(SEG_DIR, file), 'utf8');
  const parsed = parseSegmentFile(text);
  if (parsed.rows.length < 2) continue;
  segmentData[segKey(file)] = parsed;
}

// ---- levels ---------------------------------------------------------------

function parseLevelFile(text) {
  const out = { name: '', random: false, length: 'auto', segments: [], segAngles: [], first: null, firstAngle: null, last: null, lastAngle: null };
  const lines = text.split(/\r?\n/);

  const nameM = text.match(/Name:\s*'?([^'\r\n]*)'?/i);
  if (nameM) out.name = nameM[1].trim();
  const randM = text.match(/Random:\s*(\w+)/i);
  if (randM) out.random = /^yes$/i.test(randM[1]);
  const lenM = text.match(/Length:\s*(\w+)/i);
  if (lenM) out.length = /^\d+$/.test(lenM[1]) ? parseInt(lenM[1], 10) : lenM[1].toLowerCase();

  // strip /* ... */ block comments so they don't pollute the segment list
  const clean = (s) => s.replace(/\/\*[^]*?\*\//g, '').trim();

  // segments between "Segments Begin:" and "Segments End:"
  const begin = lines.findIndex((l) => /Segments Begin:/i.test(l));
  const end = lines.findIndex((l) => /Segments End:/i.test(l));
  if (begin >= 0 && end > begin) {
    // the Begin line may itself carry the first segment after its comment
    for (let i = begin; i < end; i++) {
      let l = clean(lines[i]).replace(/Segments Begin:/i, '');
      l = l.trim();
      // match ANY line carrying a .txt segment reference — including those with
      // a trailing "Angle=" annotation (previously dropped by a $-anchored test,
      // which silently lost every WORM/INVERT/SCREW/angled-WIBBLE section).
      if (/\.txt/i.test(l)) { out.segments.push(segKey(l)); out.segAngles.push(parseAngle(l)); }
    }
  }

  // First: / Last: single segments (each followed by a segment filename line)
  const grabAfter = (label) => {
    const idx = lines.findIndex((l) => new RegExp(label + ':', 'i').test(l));
    if (idx < 0) return { key: null, angle: null };
    for (let i = idx; i < Math.min(idx + 4, lines.length); i++) {
      let l = clean(lines[i]).replace(new RegExp(label + ':', 'i'), '').trim();
      if (/\.txt/i.test(l)) return { key: segKey(l), angle: parseAngle(l) };
    }
    return { key: null, angle: null };
  };
  const f = grabAfter('First'); out.first = f.key; out.firstAngle = f.angle;
  const la = grabAfter('Last'); out.last = la.key; out.lastAngle = la.angle;
  return out;
}

const levelSegments = {};
for (const file of readdirSync(LVL_DIR)) {
  if (!/^ARCADE\d+\.txt$/i.test(file)) continue;
  const text = readFileSync(join(LVL_DIR, file), 'utf8');
  const idx = parseInt(file.match(/ARCADE(\d+)/i)[1], 10);
  levelSegments[idx] = parseLevelFile(text);
}

writeFileSync(join(OUT_DIR, 'segmentData.json'), JSON.stringify(segmentData));
writeFileSync(join(OUT_DIR, 'levelSegments.json'), JSON.stringify(levelSegments, null, 0));

console.log(`baked ${Object.keys(segmentData).length} segments, ${Object.keys(levelSegments).length} levels`);
// quick sanity: report any referenced segment missing from the segment data
const missing = new Set();
for (const lvl of Object.values(levelSegments)) {
  for (const s of [lvl.first, lvl.last, ...lvl.segments]) {
    if (s && !segmentData[s]) missing.add(s);
  }
}
if (missing.size) console.log('MISSING segments:', [...missing].join(', '));

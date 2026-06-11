// Audit: which extracted media assets (TGA/OGG/X2) are referenced by the code/data.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(d, acc = []) {
  for (const f of readdirSync(d)) {
    const p = join(d, f); const s = statSync(p);
    if (s.isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
}

let hay = '';
for (const f of [...walk('src'), 'index.html', 'server/server.js']) {
  if (/\.(js|mjs|json|html|css)$/.test(f)) hay += '\n' + readFileSync(f, 'utf8');
}
hay = hay.toUpperCase();

// Weapon meshes whose -DRAW-/-FIRE- frames are streamed dynamically by
// snailModel.loadWeaponFrames (TURBO_WEAPONS) — the literal frame names never
// appear in source. Treat any such frame as used.
const WEAPON_PREFIXES = ['BLASTERTOP', 'BLASTERLEFT', 'BLASTERRIGHT', 'LASERLEFT', 'LASERRIGHT', 'ROCKETLAUNCHER', 'INVINCIBLE'];

const media = walk('public/assets').filter((f) => /\.(tga|ogg|x2)$/i.test(f));
const used = [], unused = [];
for (const f of media) {
  const rel = f.replace('public/assets/', '');
  const logical = rel.replace(/\.[^.]+$/, '').toUpperCase();
  const base = logical.split('/').pop();
  const stem = base.replace(/[0-9]+$/, '');
  // dynamic weapon DRAW/FIRE frames (e.g. BLASTERLEFT-DRAW-003): used iff the
  // weapon prefix mounts via TURBO_WEAPONS (its BASE mesh is referenced).
  const wm = base.match(/^([A-Z]+)-(DRAW|FIRE)-\d+$/);
  const weaponFrame = wm && WEAPON_PREFIXES.includes(wm[1]) && hay.includes(`${wm[1]}-BASE`);
  const hit = weaponFrame ||
    hay.includes(logical) ||
    hay.includes('/' + base) ||
    hay.includes('"' + base) ||
    hay.includes("'" + base) ||
    hay.includes('`' + base) ||
    (stem.length >= 4 && /[0-9]$/.test(base) && hay.includes(stem));
  (hit ? used : unused).push(rel);
}

// Assets that are intentionally NOT rendered standalone (with the reason). These
// are not "unused" in a meaningful sense — they're inputs/metadata, not art that
// belongs on screen.
const EXCLUDE = {
  'SPRITES/DEBUG.TGA': 'developer debug texture, not game content',
  'SPRITES/LESSMASK.TGA': 'alpha-composite mask for the LESS button (input, not a standalone sprite)',
  'SPRITES/MOREMASK.TGA': 'alpha-composite mask for the MORE button (input, not a standalone sprite)',
  'SPRITES/SLUGMASK.TGA': 'alpha-composite mask for the slug sprite (input, not a standalone sprite)',
  'X/TURBOHOTSPOTS.X2': 'weapon-mount anchor-point metadata, not a renderable mesh',
};

const unexpected = unused.filter((u) => !(u in EXCLUDE));
console.log('TOTAL media:', media.length, ' used:', used.length, ' unused:', unused.length,
  ' (intentional exclusions:', Object.keys(EXCLUDE).length, ', UNEXPECTED:', unexpected.length, ')');
console.log('=== intentionally excluded (documented) ===');
for (const k of Object.keys(EXCLUDE).sort()) console.log('  ', k, '—', EXCLUDE[k]);
if (unexpected.length) {
  console.log('=== UNEXPECTED unused (wire these in!) ===');
  for (const u of unexpected.sort()) console.log('  ', u);
} else {
  console.log('=== ✅ no unexpected unused assets — every renderable asset is wired in ===');
}

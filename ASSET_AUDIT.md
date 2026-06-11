# Snail Mail — Unused Original Asset Audit

A **read-only** audit of the original game assets under `extracted/` versus what the
web remaster in `src/` actually references. Goal: find what we paid for (in
extraction) but aren't using yet, so we can plan how to wire it in.

- **Method:** enumerated every file under `extracted/`, then grepped the whole `src/`
  + `server/` + `tools/` tree (code only — not the baked level/segment JSON, which
  would false-positive) for each asset basename / logical path. Animation/voice/SFX
  *families* are marked USED if any member is referenced. Dims for TGAs are read from
  the 18-byte TGA header (width/height at bytes 12–15, LE).
- **Scope note:** every file is *copied* into `public/assets` by `tools/stage_assets.sh`
  (it stages everything). "Used" below means **referenced by game code at runtime**, not
  merely staged on disk.
- Date: 2026-06-10.

---

## Summary table

| Category    | Total | Used | Unused | Notes |
|-------------|------:|-----:|-------:|-------|
| **X/** (.X2 meshes) | 124 | 33 | 91 | All weapon DRAW/FIRE frames, TURBO talk/lookback/skidstop/hotspots, jetpack & rocket meshes unused |
| **X/** (.TGA textures) | 19 | 4 | 15 | Only SNAIL-TURBO, BLASTERS, LASER, (SALT via mesh tex) actually bound |
| **SPRITES/** (.TGA) | 53 | 23 | 30 | Particle/border/loading/slider/mask/fx sprites unused |
| **SFX2/** (.OGG) | 36 | 34 | 2 | Only SERVO1/SERVO2 unused |
| **VOICE/** (.OGG) | 111 | 29 | 82 | All 18 TUT*, all 11 SLUG-*, ~53 Turbo quips not wired |
| **MUSIC/** (.OGG) | 6 | 5 | 1 | INTROTEXT unused |
| **GALAXY/** (.TGA) | 17 | 13 | 4 | BORDERSPACEMAP, LEVELSTAR, LINE, LINESTAR unused |
| **BACKGROUNDS/** (.TGA) | 11 | 9 | 2 | (split A/B plates) — all referenced; only the `STARMAP`/help variants… see note |
| **OBJECTS/** (.TGA) | 21 | 6 | 15 | WORLD00 TRACK3/SLIDE3/BACK/WARN/WORM, UNIVERSE, FONT, VAPOURLAZER, BARRIER unused |
| **SEGMENTS/** (.TXT) | 133 | 110 | 23 | Baked; 23 segments never referenced by any level chain |
| **LEVELS/** (.TXT) | 53 | 51 | 2 | CHALLENGE000 + TUTORIAL not loaded |
| **INTRO/** (.TXT) | 2 | 0 | 2 | INTRO.TXT + CREDITS.TXT unused (crawl text is hardcoded) |

Totals (excluding pure config/manifest `.TXT` and `BASS.DLL`): **~604 files staged,
roughly 290 referenced by code.**

---

## Quick wins — top 10 highest-value unused assets

Ordered by gameplay/polish payoff vs. effort. Each says exactly where it plugs in.

1. **`SFX2/SERVO1.OGG` + `SFX2/SERVO2.OGG`** — robotic servo whirr. Wire into
   `engine/audio.js` and play on **weapon mount/upgrade** (`game.js` `'weapon'` event,
   alongside `weaponUp()`), and/or as the turret aim/track sound in
   `entities.js onTurretFire`. The only two SFX we extracted and never used.

2. **`VOICE/` Turbo "win/brag" quips (`WOOHOO`, `THATWASAWESOME`, `THATWASCOOL`,
   `SPECIALDELIVERY`, `ZOOMZOOM`, …)** — add a `victory` set in the `VOICE_SETS` table
   (`audio.js`) and call `audio.voiceSet('victory')` from `level.js _win()` /
   `game.js 'won'`. Currently the finish is silent of Turbo VO.

3. **`VOICE/TUT1..TUT18.OGG`** — 18 tutorial voice lines, perfectly suited to the new
   `showHelp()` screen or a first-run tutorial. Map TUT lines to the HELP legend bullets
   in `ui/screens.js`. Zero of them are wired.

4. **`VOICE/SLUG-*.OGG` (11 lines: SNAILALERT, HIT1-3, GOTHIM, DEATH1/2, VICTORY1/2,
   HESTOOFAST, DESTROY)** — enemy "slug" voice barks. Play `SLUG-SNAILALERT` when a slug
   first comes on-screen and `SLUG-HIT*`/`SLUG-DEATH*` from `entities.js`/`level.js`
   `onHit` when a slug is shot. Gives the Slug Syndicate a voice.

5. **`X/TURBO-SKIDSTOP-*` (14 frames) + `SFX2/SKIDSTOP.OGG`** — finish-line skid
   animation. `SKIDSTOP.OGG` is *already* used (mapped to land/fall), but the matching
   **mesh frames are not**: add a `skid` pose to `TURBO_ANIMS` in `snailModel.js` and
   trigger it from `player.finish()` for a proper screeching stop at the mail stop.

6. **`X/TURBO-TALK-000..012` (13 frames)** — Turbo talking animation. Use in the
   `showStory()` interludes (`ui/screens.js`) — render a small 3D Turbo that lip-flaps
   while the Pip story cards play, instead of the static SVG silhouette.

7. **`SPRITES/PARTICLEEXPLODE-BIG/-SMALL`, `PARTICLERING-*`, `PARTICLESLOW-*`,
   `SPRITES/SPARK`, `SPRITES/SMOKE`** — the original textured particle sheets. Our
   `fx.js` uses flat-colored `THREE.Points`. Swap in these textures (additive sprites)
   for explosions (PARTICLEEXPLODE), the smart-bomb/EXPLODERING burst (PARTICLERING),
   and the red-ring/salt slowdown (PARTICLESLOW) to match the original's look.

8. **`X/TURBO-LOOKBACKLEFT-*` / `LOOKBACKRIGHT-*` (10 frames)** — Turbo glancing back
   over his shell. Great for **multiplayer**: trigger the look-back pose
   (`snailModel.setPose`) when a ghost racer (`net/ghosts.js`) is right behind you.

9. **`OBJECTS/WORLD00/TRACK3` + `SLIDE3`** — the 4th road/halfpipe texture set. We only
   theme 3 of 4 (`themes.js` uses TRACK0/1/2). Point a theme (e.g. a dedicated
   `cosmic`/late-galaxy variant) at TRACK3/SLIDE3 so all four original road skins appear.

10. **`MUSIC/INTROTEXT.OGG`** — the intro-narration music bed. Play it under the new
    Star-Wars-style `showIntroCrawl()` in `ui/screens.js` (currently the crawl runs to
    menu music / silence).

---

## Unused assets by category

### X/ — DirectX `.X2` meshes (91 unused of 124)

The remaster (`game/snailModel.js`, `game/entities.js`) only frame-swaps the BASE poses
of each animation and mounts the BASE weapon meshes. Everything else is unused:

**Weapon draw/fire animation frames (unused — these animate the gun deploying/firing):**
- `BLASTERTOP-DRAW-000..005`, `BLASTERLEFT-DRAW-000..005`, `BLASTERRIGHT-DRAW-000..005`
  — 18 frames of the blaster *extending* from the shell. → Play on weapon-upgrade in
  `snailModel.mountWeapon()` so the gun visibly unfolds.
- `BLASTERTOP-FIRE-000`, `BLASTERLEFT-FIRE-000`, `BLASTERRIGHT-FIRE-000` — recoil/fire
  pose. → Swap to the FIRE frame for one tick when `player._tryFire()` fires.
- `LASERLEFT-DRAW-000..003`, `LASERRIGHT-DRAW-000..003` — laser deploy frames.
- `ROCKETLAUNCHER-DRAW-000..002` — rocket launcher deploy frames.
- `ROCKET-BASE-000` — the rocket **projectile** mesh. → Use as the actual rocket bolt in
  `weapons.js` (currently rockets reuse the `PARTICLEBLASTERS` sprite).

**Turbo animation frames not wired (`snailModel.TURBO_ANIMS` only has base/move/bob/
damaged/fall/shell):**
- `TURBO-SKIDSTOP-000..017` (14 frames) — finish skid (quick win #5).
- `TURBO-LOOKBACKLEFT-000..004`, `TURBO-LOOKBACKRIGHT-000..004` (quick win #8).
- `TURBO-TALK-000..012` (quick win #6).
- `TURBO-INTOSHELL-006`, `TURBO-INTOSHELL-007` — the last 2 "duck into shell" frames
  (we only load 000..005). → Extend the `shell` anim to the full 8 frames.
- `TURBOHOTSPOTS.X2` — mount-point/hotspot helper mesh (defines where the gun/bag
  attach). → Use it to position weapon meshes correctly instead of the hardcoded offset
  in `snailModel.js`.

**Jetpack meshes (unused — we render a procedural cone flame in `player.js`):**
- `JETPACK-BASE-000`, `JETPACK-DRAW-000/001`, `JETPACKTHRUST-BASE-000..002`. → Mount the
  real jetpack mesh on Turbo while `PlayerState.FLYING`.

**Misc unused mesh:** `SIGNCONSTRUCTION.X2` (the tall road-works sign; entities.js
deliberately skips it as "too big" — could be used as set-dressing beside the road, not
as a dodge obstacle).

### X/ — textures (15 unused of 19)

Only `SNAIL-TURBO.TGA`, `BLASTERS.TGA`, `LASER.TGA` are bound (plus `SALT.TGA` arrives
via the SALT mesh's own texture ref). Unused:
- `SNAIL-TURBO-DAMAGE.TGA` (512×512) — **damaged/scorched** Turbo skin. → Swap the body
  material map to this while `player._damagedTimer > 0` for a visible "ouch" reskin.
- `SNAIL-TURBO-INVINCIBLE.TGA` (512×512) — golden **invincible** Turbo skin. → Swap in
  during `player.invincible` (we currently only pulse the shell scale).
- `INVINCIBLE.TGA`, `ROCKETLAUNCHER.TGA`, `ROCKET.TGA`, `JETPACK.TGA`,
  `JETPACKTHRUST.TGA` — textures for the weapon/jetpack meshes above; wire alongside them.
- `SIGNSTOP/SIGNBANG/SIGNSTRIPE/SIGNCONSTRUCTION.TGA` (256² / 512×128) — sign-plate
  textures; the sign *meshes* load but with the fallback material. → Bind these so the
  signs read as STOP / "!" / striped / road-works.
- `PILLAR.TGA` (256²), `TRAMP.TGA`, `POSTOFFICESTOP.TGA` (256²) — textures for the
  pillar/trampoline/mail-stop meshes (those meshes load but untextured).
- `SIDE-BLASTER.TGA` (64²) — side-mounted blaster skin variant.

### SPRITES/ — UI + 2D sprites (30 unused of 53)

Used: DAMAGEGUAGE, DAMAGEGUAGEFULL, PROGRESS-BAR, PROGRESS-BAR-LIT, PROGRESS-CURSOR,
PARCELICON, LIFE, PLAY, MORE/MOREHOVER, LESS/LESSHOVER, PARCEL000, SLUG000/001,
JETPACK000, GARBAGEA–D, HEALTH, PARTICLEBLASTERS. Unused:

- `LOADING.TGA` (640×480) + `LOADINGBARON.TGA` (256×32) — full-screen **loading screen**
  + progress bar fill. → Show during `assets`/level streaming (there is no load screen
  now).
- `SLIDERBAR.TGA` + `SLIDERBARFULL.TGA` (256×32) — **options slider** track + fill. →
  Use for real volume sliders in `showOptions()` (currently just ON/OFF buttons).
- `BORDER.TGA` (128²) + `BORDERGLOW.TGA` (128²) — framed border / glow overlay. → HUD or
  menu-panel framing.
- `MOUSE.TGA` (64²) — custom **cursor**. → Set as the in-menu CSS cursor.
- `WARNING.TGA` (64²) — warning icon. → Flash when the postal/damage meter enters the
  danger band (>75%) in `hud.js`, next to the gauge.
- `COLLISION.TGA` (64²) — impact/hit marker. → Spawn at hit point in `weapons.onImpactFx`.
- `SMOKE.TGA` (32²) + `SPARK.TGA` (64²) — smoke puffs + sparks for damage/exhaust trails.
- `STARTAIL.TGA` (16²) + `STARSILVER.TGA` (32²) — star/trail sprites for the boost/
  jetpack trail or pickup sparkles.
- `JET.TGA` (32²) — jet/flame sprite (jetpack exhaust billboard).
- `PARTICLEEXPLODE-BIG/-SMALL`, `PARTICLERING-BIG/-SMALL`, `PARTICLESLOW-BIG/-SMALL` —
  textured particle sheets (quick win #7).
- `GHOST.TGA` (128²) — translucent ghost sprite. → Multiplayer ghost marker / name tag
  (we render full tinted snail models instead).
- `DAMAGEGUAGEBRIGHT.TGA` (64×512) — a brighter gauge fill variant. → Use as the
  danger-state fill (swap from DAMAGEGUAGEFULL when `ratio > 0.75`).
- `JETPACK001.TGA` (256²) + `JETPACKTHRUST.TGA` (128²) — jetpack pickup anim frame 2 +
  thrust; pair with the used JETPACK000 to animate the pickup.
- `SLUGGOO.TGA` (32²) — slug slime-trail decal. → Lay behind moving slugs.
- `DEBUG.TGA` (32²), `BLACK.TGA` (8×8), `OVERLAY.TGA` (2×2) — dev/fill swatches; safe to
  ignore (engine-internal). `*MASK.TGA` (LESSMASK/MOREMASK/SLUGMASK) are alpha masks for
  their base sprites; only needed if you composite masks manually.

### SFX2/ — sound effects (2 unused of 36)

- `SERVO1.OGG`, `SERVO2.OGG` — servo/mechanical whirr (quick win #1).

### VOICE/ — Turbo + slug voice lines (82 unused of 111)

Only 29 lines are wired, across 8 `VOICE_SETS` in `audio.js`, and **only 6 of those sets
are ever triggered** (`game.js` fires start/powerup/damage/slugged/fall/postal). The
`dying` and `package` sets are defined but never called; the lazy `voice()` method exists
but is never invoked. Unused groups:

- **`TUT1..TUT18`** (18) — tutorial narration (quick win #3).
- **`SLUG-*`** (11) — slug enemy barks (quick win #4).
- **`package` set already-listed lines** + ~53 unwired Turbo quips, e.g. `WOOHOO`,
  `THATWASAWESOME`/`THATWASCOOL`, `ZOOMZOOM`, `ZIPPIDYDOODAH`, `SMOKIN`, `MAKEWAY`,
  `COMINGTHROUGH`, `BACKOFF`/`BACKOFFSLUGS`, `BRINGITON`, `GOTMAIL`, `MYNAMEISTURBO`/
  `TURBOSTHENAME`, `IMTHESNAIL`, `ESCARGOT`, `OW1..OW4`, `IDESERVEARAISE`/`…PROMOTION`,
  `SNAILSINSPACE`, `SNAILMAILALWAYSONTIME`, `ALWAYSTIPYOUR…`, `ANYSLOWER`,
  `ISLEEPFASTERTHANTHIS`, etc. → Build new sets: a **race-win/brag** set (quick win #2),
  a **passing/overtake** set (`MAKEWAY`, `COMINGTHROUGH`, `BACKOFFSLUGS`) for online
  racing, an **idle/intro** set (`MYNAMEISTURBO`, `IMTHESNAIL`), and an **ouch** set
  (`OW1..4`) tied to `addDamage`.

### MUSIC/ (1 unused of 6)

- `INTROTEXT.OGG` — intro narration music bed (quick win #10). (`1–4.OGG` =
  per-world tracks, `MAINMENU.OGG` = menu — all used.)

### GALAXY/ (4 unused of 17)

The star-map (`ui/screens.js`) uses GALAXY000–009 (all 10 plates — there are 10
galaxies), GALAXYSELECT, LEVELSELECT, SPACEMAPLOGO. Unused:
- `BORDERSPACEMAP.TGA` (128²) — decorative frame border for the star-map. → Frame the
  `.starmap-field`.
- `LEVELSTAR.TGA` (32²) — the level **star** icon. → Use as the per-level node graphic in
  `_renderGalaxyStars()` (we draw a CSS ring + number; this is the real star art).
- `LINE.TGA` + `LINESTAR.TGA` (8×8) — the dotted **route line** tiles between nodes. →
  Texture the SVG `route-line` slipstream connectors with the original dotted line.

### BACKGROUNDS/ (all referenced)

SPLASH_A/B, MENUBG_A/B, HELP_A/B, STARMAPBG, and the 4 space nebulae
(SPACEPURPLE/RED/BLUESWHORL/GREENWARP) are all used. The `.TXT` files (e.g.
`SPACEPURPLE.TXT` carrying the original per-background **Distort** value) are *not* parsed
— `themes.js` hardcodes `distort`. → Parse the BACKGROUNDS `.TXT` configs to drive the
nebula wobble per the original authored values.

### OBJECTS/ (15 unused of 21)

Used: `LAZER/LAZER` (laser bolt), `WORLD00/TRACK0-2` + `SLIDE0-2` (3 of 4 road skins).
Unused:
- `WORLD00/TRACK3` + `SLIDE3` (256²) — the 4th road/halfpipe skin (quick win #9).
- `WORLD00/BACK.TGA` (256²) — track **backing/underside** texture. → Texture the bottom
  face of the ribbon (currently DoubleSide same material).
- `WORLD00/TRACKWARN.TGA` (256²) — hazard-striped **warning** road segment. → Skin the
  road approaching gaps / construction zones.
- `WORLD00/WORM.TGA` (32²) — worm-hole/decal. → Pair with the `WORM` segment / gap
  portals.
- `UNIVERSE/FRINGE` (4×4), `HOLE` (32²), `RAMP` (64²) — universe-shader edge/hole/ramp
  textures for off-track void + jump ramps. → Use `RAMP` on jump-pod launch ramps,
  `HOLE` on gap edges.
- `VAPOURLAZER/LAZER.TGA` (32²) — a **vapour-trail** laser variant. → Alt bolt for the
  twin-laser / invincible weapon.
- `FONT/FONT-MENU-HOVER*.TGA` (2048×64) — bitmap **menu font** atlas (hover state). →
  Original menu typography if we ever want pixel-faithful menu text.
- `FONT3D/LETTER.TGA` (128²) — 3D letter texture for the floating-letter intro logo.
- `BARRIER/BARRIER.TGA` (8×8) — barrier tile. (Has no `.X2`, so not mesh-loadable as-is.)

### SEGMENTS/ — track segments (23 unused of 133)

All 133 are baked into `src/data/segmentData.json` by `tools/bakeSegments.mjs`, but only
the 110 referenced by the 51 arcade level chains (`levelSegments.json`) are ever built.
Unreferenced (available for new levels / an Endless mode):

`BASIC, CRADLE, INVERT, LOOP THE LOOPW, OUTER LOOP3, RICHTEST, TUTORIAL 0, TUTORIAL 2..13
(12 tutorial segments), TWISTER4, UNDER OVER2, WARP, WORM`

→ The unused **TUTORIAL 0/2–13** segments are a ready-made tutorial track — chain them
into a real `TUTORIAL.TXT`-style first level. `WARP`/`WORM`/`INVERT`/`CRADLE`/`SCREW`-
adjacent ones add variety to an Endless mode (`proceduralLevel` is already stubbed in
`levels.js`).

### LEVELS/ (2 unused of 53)

`tools/bakeSegments.mjs` only bakes `ARCADE*.TXT` (51 files, all used). Not baked/loaded:
- `LEVELS/CHALLENGE000.TXT` — a bonus/challenge level definition. → Bake + expose as a
  "Challenge" mode entry.
- `LEVELS/TUTORIAL.TXT` — the original tutorial level chain (pairs with the unused
  TUTORIAL segments + TUT voice lines for a complete tutorial). → Bake and wire a tutorial
  flow.

### INTRO/ (2 unused of 2)

- `INTRO/INTRO.TXT` — the original intro/story script. The current `showIntroCrawl()`
  uses **hardcoded** crawl text. → Parse INTRO.TXT to drive the crawl (or at least mine it
  for faithful wording).
- `INTRO/CREDITS.TXT` — the credits roll. → Add a credits screen (none exists) sourced
  from this file.

---

## Cross-cutting opportunities

- **Damage/invincible Turbo reskins** (`SNAIL-TURBO-DAMAGE/INVINCIBLE.TGA`) are the
  single cheapest visual upgrade — just material-map swaps keyed off existing player
  state flags.
- **Weapon DRAW/FIRE frames + FIRE textures** would make the shell-cannon feel alive
  (deploy on upgrade, recoil on fire) using state we already track
  (`mountWeapon`, `_tryFire`, `_cannonRecoil`).
- **Voice is the biggest untapped library**: 82/111 lines unused. Most need only new
  entries in `VOICE_SETS` + a `voiceSet(...)` call at the matching event — almost no new
  systems required.
- **Textured particles + the loading screen + option sliders** are pure presentation
  wins that don't touch gameplay.

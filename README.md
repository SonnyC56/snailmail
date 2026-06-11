# Snail Mail Remastered

> *"Special delivery!"* — Turbo, fastest snail in the galaxy

A faithful, from-scratch **browser remaster** of the 2004 Sandlot Games / Alpha72
racer **_Snail Mail_**, rebuilt on [Three.js](https://threejs.org/) (v0.184) and
[Vite](https://vitejs.dev/). You play **Turbo**, an intergalactic mail snail,
riding a floating ribbon highway through space at full throttle: **steer and fire
your shell-cannon** — there is *no jump button* — scoop up every parcel, blast
slugs, dodge salt and pillars, snag weapon-upgrade rings, survive the loops and
corkscrews, and slide into the mail stop before the timer runs out. The track
geometry, level layouts, art, audio and Turbo's animations are all decoded from
the **original game's own data files**; the curve engine, sine pipeline and
level-data formats were recovered by **static reverse-engineering** of a clean,
non-DRM build (no DRM was ever cracked — see [How the original game
works](#how-the-original-game-works-reverse-engineered)).

Single-player **Story / Arcade / Time-Trial / Challenge / Tutorial / Endless**
modes, plus **online multiplayer racing** with ghost opponents — all served from
one tiny Node process.

---

## Table of contents

- [Assets & copyright](#assets--copyright)
- [Overview & features](#overview--features)
- [Quick start](#quick-start)
- [Controls](#controls)
- [Game modes](#game-modes)
- [Architecture](#architecture)
- [The track & curve system](#the-track--curve-system)
- [The data pipeline](#the-data-pipeline)
- [How the original game works (reverse-engineered)](#how-the-original-game-works-reverse-engineered)
- [Fidelity & engineering decisions](#fidelity--engineering-decisions)
- [Multiplayer](#multiplayer)
- [Build & deploy](#build--deploy)
- [Project layout](#project-layout)
- [Scripts](#scripts)
- [Status / known gaps](#status--known-gaps)
- [Credits](#credits)

---

## Assets & copyright

> [!IMPORTANT]
> **This is a personal fan remaster.** All original art, audio, 3D models, level
> data and the game binary are the intellectual property of **Sandlot Games /
> Alpha72 Games (© 2004)**. Every original asset used here was **extracted from
> the project owner's own legally-acquired copy** of the game. None of it is
> committed to this repository, and none of it is redistributed.

The `.gitignore` enforces this boundary explicitly. Excluded, with the comment
*"Original game files + extracted assets are the user's own copy of the game.
They are NOT redistributed in the repo — regenerate locally with `bash
tools/stage_assets.sh "path/to/SnailMail.dat"`"*:

| Path | Contents |
| --- | --- |
| `exe_src/` | Original executable sources / reverse-engineering working files |
| `extracted/` | Raw extracted originals (`LEVELS/`, `SEGMENTS/`, OGG, TGA, `.X2`) |
| `public/assets/` | Staged runtime copies of the originals, served at `/assets` |
| `assets-hd/` | Optional HD up-res texture pack |

In-app attribution reinforces this: the title screen's `.version-tag` reads
*"a fan remaster · original assets © Sandlot Games"*, and the credits / online
screens credit *"Alpha72 Games / Sandlot Games (2004)"*. To run the game you must
supply your own `SnailMail.dat`.

---

## Overview & features

- **Faithful-as-possible remaster.** Track shapes, level metadata, entity
  placement, Turbo's frame-swapped animations, the menus, the postal/damage
  gauge and the parcel HUD are all reconstructed from the original data — not
  re-invented.
- **Grid-accurate geometry.** Every level is decoded from the original
  hand-authored `SEGMENTS/*.TXT` 10-character lane grids and `LEVELS/*.TXT`
  segment chains, then swept along a 3D Catmull-Rom spline.
- **A real curve engine.** Loops, corkscrews, inverts, half-pipes, hills,
  valleys and slaloms are reproduced with **C1-continuous shaping kernels** plus
  a tangent-roll banking system driven by the original per-instance `Angle=`
  values.
- **Original audio with a synth fallback.** Plays the extracted OGG music,
  voice and SFX sets; if a buffer is missing, a built-in WebAudio synth engine
  covers every sound so the game is never silent.
- **Fixed 120 Hz physics** with render interpolation, mouse / keyboard / touch /
  tilt steering, and responsive mobile DPR scaling.
- **Online multiplayer** racing (up to 6 snails) with server-synced seeds, ghost
  snails, name tags and a live leaderboard — all from one Node process that also
  serves the build.
- **Optional HD texture pack** via a single `resolveTextureUrl()` seam.

---

## Quick start

```bash
npm install
# Extract your own copy of the game and stage the web-usable assets:
bash tools/stage_assets.sh "path/to/SnailMail.dat"
npm run dev        # → http://localhost:5173
```

`stage_assets.sh` deobfuscates `SnailMail.dat` (a fixed 256-byte XOR archive),
extracts ~603 files to `./extracted`, and copies the web-usable ones into
`./public/assets` (served at `/assets`). Vite serves the app; OGG plays
natively, TGA decodes via three's `TGALoader`, and `.X2` (DirectX `.x`) meshes
load through `src/track/xloader.js`.

---

## Controls

| Action | Keys / input |
| --- | --- |
| **Steer** | `←` / `→` · `A` / `D` · or **move the mouse** (position-tracking) |
| **Fire cannon** | hold `Space` · `J` · `Ctrl` · or left-click / left-drag |
| **Pause** | `Esc` / `P` (or the top-right HUD pause button) |
| **Mute** | `M` |

Notes from `src/engine/input.js`:

- **There is no jump.** The only inputs are steer + fire. Hops over gaps are
  automatic, launched by jump-pods and ramps.
- **Mouse steering is position-based** with a `1.25` gain so you reach full lock
  before the screen edge; the target deliberately reaches *past* the rail so you
  can ride off the edge. Pressing a steer key overrides the mouse.
- **Touch** (`src/engine/mobile.js`): drag the lower ~75% of the screen to steer
  (`steerTopFrac = 0.25` keeps the top quarter for HUD/pause), with on-screen
  **FIRE** and **AUTO** buttons. Optional **tilt steering** (`gamma/35` → full
  lock) via `window.SNAIL_CONFIG.tiltSteer = true`. A landscape-rotation hint
  card appears in portrait on touch devices.

---

## Game modes

Selected from **Mode Select** (`Screens.showModeSelect`). Each starts a `Level`
through a dedicated `Game` method:

| Mode | Source | Notes |
| --- | --- | --- |
| **Story — Postal Route** | `getLevel(gi, li)` | Galaxies of levels with an intro crawl + story interludes; progress and medals persist. First story level shows the Star-Wars-style intro crawl. |
| **Arcade — Score Attack** | `getLevel(gi, li)` | Same level chains scored for points; records arcade high score. |
| **Time Trial** | `getLevel(gi, li)` | Race the clock for bronze/silver/gold medals (`bestTime`). |
| **Challenge** | `getChallengeLevel()` | `CHALLENGE000.TXT` (idx 100): a fast, long, randomized gauntlet, 3 lives. |
| **Tutorial** | `getTutorialLevel()` | Original `TUTORIAL.TXT` track with timed `TutorialGuide` captions + Turbo VO (TUT1–18), 5 lives. |
| **Endless — Procedural** | `proceduralLevel({idx, seed})` | Seeded infinite run (`procedural:true`), 3 lives. |
| **Online Race** | `startOnlineRace(game)` | Up to 6 snails on the same seed; 99 "lives" (no death-out). |

Win/lose flow lives in `game.js`. A win plays the **victory outro** (see
[Fidelity](#fidelity--engineering-decisions)) then shows results after ~3.2 s;
a loss (including *quota not met*) shows results after ~1.6 s. Medals, best
scores and best times persist via the `save` singleton.

---

## Architecture

A fixed-timestep core (`Renderer`) drives a `Game` state machine. `Game` owns the
active `Level`, the `HUD`, the menu `Screens`, and an optional `OnlineSession`.
Everything is plain ES modules under `src/`.

```
src/
├── main.js                  # bootstrap: wires Renderer + Input + AudioEngine + save → Game
├── assets.js                # AssetManager singleton: TGA textures, OGG buffers, text; texture-pack seam
├── save.js                  # localStorage save singleton (snailx.save.v1)
├── utils.js                 # formatTime, helpers
├── styles.css
├── engine/
│   ├── renderer.js          # fixed 120 Hz loop, WebGLRenderer, scene/camera, DPR scaling
│   ├── input.js             # keyboard / mouse-steer / touch flags
│   ├── mobile.js            # touch drag-steer, FIRE/AUTO buttons, tilt, fullscreen
│   └── audio.js             # AudioEngine: original OGG sets + full WebAudio synth fallback
├── game/
│   ├── game.js              # state machine (TITLE→MENU→STORY→PLAYING→PAUSED→RESULTS), win/lose
│   ├── level.js             # per-level world: track mesh, entities, weapons, fx, camera, scoring
│   ├── player.js            # (s,x,h) riding physics, steering, falls, launches, weapons, poses
│   ├── entities.js          # EntityManager: pickups, enemies, hazards, jump-pods, mail-stop
│   ├── weapons.js           # WeaponSystem: pellet/laser/rocket projectiles, splash, hit tests
│   ├── fx.js                # ParticleFX: spark cloud, dirt clods, billboard flashes
│   ├── camera.js            # ChaseCamera: follow, FOV kick, banking, shake, intro/outro orbits
│   ├── snailModel.js        # buildSnail: procedural placeholder + original .X2 Turbo frame-swap anims
│   └── tutorialGuide.js     # timed on-screen tutorial captions + voice
├── track/
│   ├── track.js             # the floating ribbon road: spline, frames, families, rolls, barriers, gaps
│   ├── environment.js       # sky/nebula warp shader, stars, planets, lights, fog
│   └── xloader.js           # .X2 (DirectX .x) text-mesh parser + loader
├── ui/
│   ├── hud.js               # in-race HUD: parcels, score, gauge, progress, lives, victory fly-in
│   ├── screens.js           # all menus: title, mode/level select, story, results, options, help
│   └── sprites.js           # TGA → PNG data-URL decoder + A/B plate compositor
├── net/
│   ├── online.js            # OnlineSession: lobby/room UI, position relay, results
│   └── ghosts.js            # GhostManager: translucent tinted remote snails + name tags
└── data/
    ├── segments.js          # runtime grid decode: parseSegment, buildLevelLayout, path families
    ├── levels.js            # GALAXIES, makeLevel, trackDefForLevel, entitiesForLevel, procedural
    ├── themes.js            # 5 environment themes + 4 road skins (decoupled)
    ├── story.js             # original narrative cards (storyFor)
    ├── segmentData.json     # baked SEGMENTS/*.TXT grids (133 keys)
    ├── levelSegments.json   # baked LEVELS/*.TXT chains + segAngles (52 keys)
    ├── arcadeLevels.json    # 51 per-level tuning tuples
    ├── challenge.json       # baked CHALLENGE000 config (idx 100)
    └── tutorial.json        # tutorial chain + step captions
server/server.js             # one Node process: serves dist/ over HTTP + race WebSocket at /ws
tools/                       # stage_assets.sh, bakeSegments.mjs, bakeChallenge.mjs
```

### Engine & game loop

- **`main.js`** constructs `Renderer`, `Input`, `AudioEngine`, imports the `save`
  singleton, builds a `ctx = { scene, camera, renderer, input, audio, save }`,
  and hands it to `new Game(ctx)`. It registers `renderer.onUpdate(dt → game.update(dt))`
  and `renderer.onFrame((alpha, elapsed) → { game.frame(...); input.endFrame(); })`,
  starts both, and unlocks audio on the first `pointerdown`/`keydown`. A debug
  handle is exposed as `window.__snail`.
- **`engine/renderer.js`** runs a **fixed 120 Hz** simulation:
  `FIXED_DT = 1/120`, accumulator clamped at `0.25 s`, `MAX_STEPS = 8` to avoid
  the spiral of death, with render-side interpolation `alpha = accum / FIXED_DT`.
  The `WebGLRenderer` uses ACES Filmic tone mapping (`exposure 1.1`), sRGB output,
  a 70° camera (`near 0.1`, `far 900`), and lowers DPR on coarse pointers
  (`_targetPixelRatio`). A WebGL-init failure shows a graceful "WebGL unavailable"
  message.
- **`game/game.js`** is the state machine: `State = { TITLE, MENU, STORY,
  PLAYING, PAUSED, RESULTS }`. It wires `Screens` callbacks, owns the per-mode
  level-start recipe (`_teardownLevel` → build `Level` → `playMusic` → `state =
  PLAYING`), routes `onLevelEvent` to HUD flashes + audio, and handles
  win/lose persistence.
- **`engine/input.js`** exposes boolean flags (`left`, `right`, `fireHeld`,
  `pausePressed`, `mutePressed`, …). Keyboard overrides mouse; one-shot flags
  clear in `endFrame()`.
- **`engine/audio.js`** — `AudioEngine` prefers extracted OGG sets (`MUSIC/`,
  `VOICE/`, `SFX2/`) loaded through `assets`, with a gain graph
  `master → {sfx, music, voice}`. `VOICE_SETS` mirrors all 16 original voice
  groupings (`damage, dying, slugged, … victory`). Music: `WORLD_MUSIC =
  ['1','2','3','4']`, plus `MAINMENU` and `INTROTEXT`. When a buffer is missing it
  falls back to a `setTimeout`-scheduled synth sequencer (`SYNTH_SONGS`) and
  per-effect synths. Volumes/mute persist under separate `snailx.*` localStorage
  keys.
- **`save.js`** — one localStorage key `snailx.save.v1`, deep-merged over a
  `DEFAULT` shape (`story.unlocked*`, `medals`, `bestScore`, `bestTime`,
  `arcadeHigh`, `seenIntro`, `settings`). Medals keep the best tier
  (`none<bronze<silver<gold`); times keep the min; scores keep the max.

### UI layer

- **`ui/hud.js`** — one `HUD` class refreshed by a single `update(state)` call:
  parcel counter (green/red vs. quota), centered score + weapon name, vertical
  **postal/damage gauge** (danger band > 0.75 swaps to `DAMAGEGUAGEBRIGHT`),
  vertical progress indicator, snail-shell **lives**, a top-right pause button,
  multiplayer standings, flash messages and a countdown. The **victory package
  fly-in** (`setPackageCount` / `flyInPackage` / `packageCounterScreenPos`)
  homes parcel sprites into the counter at the level end.
- **`ui/screens.js`** — every menu, rendered into `#ui-root` one at a time. The
  2004 menus were authored at **640×512** but stored as a 512-wide `_A` plate +
  a 128-wide `_B` strip; `_stage()` re-stitches them via `getCompositeURL`. Real
  sprite buttons (`PLAY`, `MORE`/`LESS`), the star-map level select
  (`GALAXY000–009` plates on hardcoded `GALAXY_NODES`), the intro crawl, story
  cards, results, options (real volume sliders from `SLIDERBAR`), help and
  credits all live here. The in-menu cursor is the original `SPRITES/MOUSE`.
- **`ui/sprites.js`** — decodes original 24/32-bit TGA UI art into PNG data URLs
  (browsers can't use TGA in CSS), with raw-pixel and composite caches. Handles
  the TGALoader's top-down decode (no extra `1-v` flip).

---

## The track & curve system

`src/track/track.js` — the `Track` class — builds the striped, floating ribbon
road ("Rainbow Road in space") and is the heart of the remaster. Gameplay rides
in **`(s, x)`** coordinates: `s` is arc length along the road and `x` is signed
lateral offset (`|x| ≤ halfWidth`). A road point is
`P(s, x) = pos(s) + side(s)·x`, and the surface normal is `up(s)`.

### Spline construction — `_buildPath`

Two stages, both producing `THREE.CatmullRomCurve3(pts, false, 'centripetal',
0.5)`:

1. **Coarse baseline route** — a seeded random walk of `yaw`/`pitch` (damped) at
   `stepLen = 34`, giving the overall sweep of the road.
2. **Fine 3D-shaping walk** — re-samples the baseline at `step = 3.0`, preserving
   total arc length (so grid placement at `s = row·rowUnits` stays aligned), and
   applies **path-family** modifications wherever an authored feature is active.

### Parallel-transport frames — `_buildFrames`

Frames `{pos, tangent, up, side}` are sampled every `SAMPLE_STEP = 1.0`. The `up`
vector is **parallel-transported** (the tangential component is removed each step)
to stay twist-free, then `side = cross(tangent, up)`. The authored roll for that
`s` is applied last by rotating `up` and `side` about the tangent. `frameAt(s)`
lerps and re-orthogonalizes for queries.

### Path families & C1 shaping kernels

Authored `Path=` names collapse into families that drive the spline:

| Family | Spline effect (`_buildPath`) | Kernel |
| --- | --- | --- |
| `loop` | `bp += 2π · smootherStep(u)` + alternating lateral bow | rise → invert → return to grade |
| `hill` | `bp += 0.75 · smoothSWave(u)` | net-zero pitch (returns to grade) |
| `valley` | `bp -= 0.75 · smoothSWave(u)` | net-zero pitch |
| `slalom` | `by += 0.6 · smoothSWave(u, cycles)` (~1 S per 90 u) | net-zero heading |

The kernels are chosen for **C1 continuity** — value *and* rate vanish at feature
boundaries, so features never kink into each other:

- `smootherStep(u) = u³(u(6u − 15) + 10)` — 5th-order smoothstep (ramp a value in).
- `smoothBump(u) = sin²(πu)` — single lobe, 0 at ends, flat at ends (there-and-back).
- `smoothSWave(u, cycles) = sin(cycles·2π·u) · smoothBump(u)` — windowed S-wave,
  zero net integral.

### Roll / banking — `_rollAt`

Roll is summed over `this.rolls` (each `{at, len, deg, cork}`):

- **`cork: true`** → `deg · smootherStep(u)` — a *continuous twist* ramping a full
  `deg` (corkscrew, or a 360°-multiple invert that ends upright).
- **`cork: false`** → `deg · smoothBump(u)` — a *there-and-back bank* (half-pipe,
  banked turn, 180° turnover returning upright).

Both are C1-continuous at boundaries (roll rate eases from/to zero).

### Grid road, barriers, gaps & TRACKWARN

The track distinguishes two build paths in `buildMesh(theme)`:

- **`_buildGridRoad`** (real levels) — one textured quad per drivable cell from
  the 8-lane segment grid (`ROW_UNITS ≈ 2.7`, columns mapped via `gridColToX`).
- **`_buildRibbon`** (procedural) — a continuous swept ribbon with vertex-colored
  lane stripes and edge trim.

Around the road:

- **`_buildEdges`** — glowing rail tubes plus **blue translucent slipstream
  barrier walls** (`color 0x5aa6ff`, additive, `WALL_H = 1.15`) that keep you on
  the road. Walls **break at gaps** so you can fall there. Their line is
  `drivableExtent(s)`, which scans the grid row (or insets the procedural
  half-width).
- **`_buildGapWarnings`** — red/yellow **TRACKWARN** striped decals painted on the
  `LEAD = 7` units of road just before each gap, lifted `0.04` above the surface
  to avoid z-fighting.

Drivability/fall queries: `hasSurface(s, x)` (false inside gaps / on void cells),
`drivableExtent(s)` (barrier line, or `null` for a full-row jump gap), `nextGap`,
and `gapAt` (used to size jump arcs). Interior holes (`hasSurface` false but a
barrier still present) drop the player straight through.

### Environment — `src/track/environment.js`

The space the track floats in: an animated **nebula warp** sky shader (two
crossing sine waves displacing the UVs, busted out of Three's program cache via
`customProgramCacheKey`), a 900-point star dome, emissive planets with optional
rings/swirls, hemisphere + directional lights, and `THREE.Fog(60, 420)`. The
`update(dt, cameraPos)` keeps the sky/stars centered on the camera and slowly
pans the nebula. (Decorative track-side props exist but are intentionally
disabled.)

---

## The data pipeline

Track geometry and entity placement are **decoded from the original game's
hand-authored text files** — nothing is hand-coded. A build-time **baker**
flattens the originals into JSON; `src/data/segments.js` decodes those grids into
the runtime contract at load time.

```
extracted/LEVELS/*.TXT   ─┐
extracted/SEGMENTS/*.TXT ─┴─►  tools/bakeSegments.mjs  ─►  src/data/segmentData.json   (133 segment grids)
                                                       ─►  src/data/levelSegments.json (52 chains + segAngles)
extracted/LEVELS/CHALLENGE000.TXT ─► tools/bakeChallenge.mjs ─► src/data/challenge.json + idx 100 chain
                                                                          │
                                          src/data/segments.js  ◄─────────┘  (runtime grid decode)
                                          buildLevelLayout(meta) → { length, gaps, entities, cells, rowUnits, paths, rolls }
```

### Original `LEVELS/*.TXT`

Plain text with `/* */` and `//` comments. Header fields (`Field:value`):
`Name`, `Mode` (`arcade`/`challenge`/`tutorial`), `Track` (road skin 0–3,
**decoupled from background**), `Background`, `Parcels`, `Quota`, `Speed`,
`Garbage` (slug %), `Salt` (salt %), `Random` (`yes` = seeded shuffle / `no` =
authored order), `Length` (`auto` or a number). The segment **chain** sits between
`Segments Begin:` / `Segments End:`, one segment filename per line. A line may
carry a **per-instance roll annotation**: `Worm.txt Angle=360`,
`Invert.txt Angle=-180` (signed degrees). `First:` / `Last:` name the cap
segments (`Start.txt` / `Finish.txt`).

### Original `SEGMENTS/*.TXT`

Header (`ID:`, `Name:`), then `Data:` followed by **10-character grid rows**:
left wall `@`, **8 interior lane columns**, right wall `@`. Top → bottom is
increasing forward distance; columns map left → right. Interior legend (as used):

| Symbol | Meaning | | Symbol | Meaning |
| --- | --- | --- | --- | --- |
| `.` `_` `#` `-` | drivable road variants | | `=` | turret |
| ` ` (space) | void / fall-gap | | `\|` | fence post / pillar |
| `0`–`3` | parcel pickups | | `> < R` | ring gate (typed by `Ring=`) |
| `$` | heart | | `J (` | jump-pad / trampoline |
| `&` | salt (un-shootable) | | `P p` | path / curve-feature control row |
| `s` | asteroid (garbage rock) | | `@@@@@@@@@@` | border-cap row |
| `M [` | slug enemy | | | |

Row-trailing annotations: `Path=LoopTheLoop`, `Ring=Explode|Slow|None|Powerup|
Normal`, `Parcel=1,(0,0,5)`, `NoFall`.

### The bakers (`tools/`)

- **`bakeSegments.mjs`** — parses every `SEGMENTS/*.TXT` → `segmentData.json`
  (`{ KEY: { name, rows:[...] } }`), and every `ARCADE*.TXT` →
  `levelSegments.json` (`{ name, random, length, segments[], segAngles[], first,
  firstAngle, last, lastAngle }`). `segKey()` strips trailing annotations so
  `"Worm.txt Angle=-360"` resolves to key `"WORM"`, while `parseAngle()` captures
  the float into the **parallel `segAngles[]`** array.
- **`bakeChallenge.mjs`** — merges `CHALLENGE000.TXT` into `levelSegments.json` at
  `CHALLENGE_IDX = 100` and writes `challenge.json` (numeric config).
- `arcadeLevels.json` and `tutorial.json` are hand-staged (no baker writes them);
  `stage_assets.sh` only copies raw extracted media into `public/assets`.

### Runtime decode — `src/data/segments.js`

Constants: `ROW_UNITS = 2.7`, `GRID_COLS = 8`, `X_EDGE = 5`,
`RAMP_GAP_ROWS = 2` (gaps ≤ 2 rows are rollover seams, not chasms), with
`colToX(col)` mapping the 8 lanes onto `±5`.

- **`parseSegment`** → `{ name, rows, grid, length, gaps, objects }` — classifies
  each row as road/path/boost/gap and emits `objects:[{type, s, x}]`. A full ring
  row collapses to one centered ring; consecutive gap rows coalesce into
  `gaps:[{at, len}]`.
- **Path-family classifier** — `pathTypeOf(seg)` reads the `Path=` name and
  `pathFamily(type)` maps the **49 distinct authored names** to families:
  `loop`, `halfpipe`, `corkscrew` (screw/twister), `invert` (invert/turnover/
  turnunder/cage), `hill` (hill/hump), `valley` (valley/dip/dump), `slalom`
  (slalom/snake/sweep/wibble), else `flat`.
- **`Angle=` recovery** — `addPathFeature(paths, rolls, fam, at, len, angle)`
  threads the authored signed-degree roll into the runtime systems:

  | Family | Becomes |
  | --- | --- |
  | corkscrew / invert | `rolls` entry `cork:true`, `deg = angle ?? sign·360` |
  | halfpipe | `rolls` entry `cork:false`, `deg = angle ?? sign·52` |
  | loop / hill / valley / slalom | `paths` spline feature (authored Wibble also adds a banked roll) |
  | flat + authored angle (e.g. Worm) | continuous corkscrew `{deg: angle, cork:true}` |

  When unannotated, the sign is position-derived (`sign = (floor(at/7) % 2) ? 1 :
  -1`) so it is deterministic across multiplayer clients.
- **`classifyGaps`** splits coalesced gaps: `≤ 2 rows` → filled-back rollover
  seams; longer → real chasms.
- **`buildLevelLayout(meta)`** assembles `first + body + last`, pairing each
  pooled segment with its `segAngles[i]` *before* the null-filter (so the index↔
  angle mapping survives). `Random:no` plays the authored order once; `Random:yes`
  Fisher–Yates-shuffles a seeded pool to a length budget. Path segments call
  `addPathFeature` and have their blank "air" rows turned to road; non-path
  segments emit chasms + per-row `cells` strings.

### Levels & themes — `src/data/levels.js`, `themes.js`

`buildGalaxies()` groups consecutive same-`Background` levels (skipping the dev
`idx:0` `Test` level) into `GALAXIES`. `makeLevel()` derives runtime tuning
(`difficulty = min(1, idx/50)`, curviness, hilliness, seed) and pulls the **real
original level name** from `LEVEL_SEGMENTS[idx].name`. `trackDefForLevel()` and
`entitiesForLevel()` turn a layout into a `Track` def and placed entities (gated
by per-type `KEEP` probabilities, packages thinned to exactly `level.parcels`, a
guaranteed `jumppod` before every gap, a `mailstop` at the end). `themes.js`
holds 5 environment `THEMES` (`meadow, desert, ice, volcano, cosmic`) keyed by
background, **decoupled** from the 4 road skins (`TRACK0..3` / `SLIDE0..3`).

---

## How the original game works (reverse-engineered)

This section is the honest story of how the original engine was understood. It is
*not* in the repo — it comes from static analysis sessions — and it is what made a
faithful remaster possible.

### Acquisition & method (the DRM line we did not cross)

The retail `SnailMail.exe` ships wrapped in **ActiveMARK (Trymedia) DRM**: packed
sections (`TMSAMVOF`/`TMSAMVOH`), a single import, ~8.0 entropy — not statically
analyzable. **We did not spoof, forge or crack activation.** We deliberately held
that line.

Instead, the **analyzable binary** is a clean, non-DRM build (from the Internet
Archive; the IA zip's password `2004` is publicly documented): ~741 KB, unpacked
x86 PE, 5 sections, 115 imports. That binary is itself copyrighted — it is
gitignored and must never be redistributed.

All analysis was **static only**: `pefile` + `capstone` disassembly, plus
**Unicorn** CPU emulation of *isolated* functions in a sandbox. The program was
never executed as a process (for safety and by preference).

### The asset archive — `SnailMail.dat`

The original archive is obfuscated with a **fixed 256-byte XOR table** (the format
documented by Luigi Auriemma's `snail_mail.bms` QuickBMS script). It holds ~603
files: OGG audio, TGA textures, `.X2` (DirectX `.x`) meshes, and the level/segment
`.TXT` config — exactly what `stage_assets.sh` deobfuscates and extracts.

### The 51-curve registry

The curve-name registry at **`0x4a3d6c`** holds **exactly 51 curve types** (indices
0–50). The full list:

```
 0 LOOPTHELOOP     13 VALLEY4        26 LOOPOUT3       39 TURNUNDER
 1 LOOPTHELOOP2    14 SBEND          27 LOOPOUTBIG     40 WIBBLE
 2 LOOPTHELOOP4    15 CAGE2          28 SWEEP          41 INVERT
 3 LOOPTHELOOPT2   16 HUMP           29 SNAKE          42 HALFPIPE
 4 LOOPTHELOOPT3   17 DUMP           30 WARP           43 TWISTERA
 5 LOOPTHELOOPT4   18 HUMPSMALL      31 SUPERTRAMP     44 TWISTERB
 6 LOOPTHELOOPW    19 DUMPSMALL      32 SLALOMDOUBLE   45 TWISTER2A
 7 LOOPBOW         20 DIP            33 P0             46 TWISTER2B
 8 HILL            21 SCREW          34 P1             47 TOAD0
 9 HILL4C          22 SLALOM         35 P2             48 TOAD1
10 HILL4           23 SLALOMBIG      36 START          49 TOADPAIR0
11 VALLEY          24 WORM           37 TURNOVER       50 TOADPAIR1
12 VALLEY4C        25 LOOPOUT        38 TURNOVERDOUBLE
```

The name→index lookup at **`0x429ac0`** is a linear `strcmp` scan over the
registry. It returns `0..50` (or `-1`), stores the resolved index at
`[segment+0x8bc]`, sets a "path present" flag bit at `[segment+0x88c]`, and stores
the per-instance `Angle=` float at `[segment+0x8b8]`. The `Path=` parser lives in
the per-line segment loop around `0x448194` (resolver at `0x4485ae`).

### The sine pipeline (fully recovered, exact constants)

The original's trig is a classic table lookup, and we reproduced it exactly. The
`sin(x)` wrapper at **`0x44cba0`** computes:

```
idx = int(x · 0.159155 · 8192) & 0x1FFF
return sintab[idx]          // table @ 0x77ffcc, 8192 entries of sin(i·2π/8192)
```

The scale `0.159155 (= 1/2π) · 8192 = 1303.7972 = 8192/2π` exactly. The constants
live at `0x497468` (`0.159155`) and `0x4976d8` (`8192.0`). `cos()` uses the same
table via quarter-period offset wrappers (`0x77ffc8` / `0x44cf77` / `0x44cf88`).
Our web reconstruction matches this value exactly.

### Myth busted: the "57-table" is not the curve generator

A **57-entry function-pointer table** at `0x4acf38` (copied to an active table at
`0x4ace50` by a dispatcher at `0x453907` using `rep movsd`, count `0x39 = 57`,
guarded by an init flag at `0x4ad024`) looked tantalizingly like a per-curve
generator (57 ≈ 51). It is **not**. It is a **CPUID-swapped vector/matrix/
quaternion math-primitive library** (scalar/MMX/SSE variants chosen via call
`0x453853`, installed by `0x45f003`/`0x45ee20`/`0x45ed10`).

Proof: every entry was disassembled — `tbl[0]@0x4512bf` is a row-major 4×4·vec4
transform, `tbl[2]@0x44f480` a column-major one; all 57 are FPU-only and **none
read the sine table**. Across all of `.text`, `0x4acf38`/`0x4ace50` are referenced
**only** by the dispatcher copy loop and a single thunk `jmp [0x4ace50]` at
`0x44ed64` — no indexed call/jump, no `mov` from `idx*4 + table`. The 57-vs-51
match was coincidence.

### The genuine open problem: an aliased struct

Here is the honest unsolved piece. The curve index at `[seg+0x8bc]` is **written
once** (at `0x4485b6`) and **read zero times through that offset**. The ~0x900-byte
segment record is block-copied into the track-build struct, and the index is read
back through a *different base register + displacement* (an **aliased struct**). So
the per-type geometry generator — the real consumer of the curve index — is **not
yet recovered as closed-form formulas**. The shapes are **procedural in code** (the
`.TXT` only marks the `P`/`p` path footprint and the optional `Angle=` roll), not
stored as data blobs. The next step is to Unicorn-trace the block-copy to map the
destination struct and find the read of the copied index.

(Also corrected along the way: `0x429b00` is the track-**mesh** renderer — its args
are texture paths like `Objects/Path/VeryDark.tga`, `Slide0.tga` — *not* curve
generation, an earlier mis-identification.)

### Level-data verification & the baker bug we found and fixed

We verified the baked data against the original `.TXT`: `arcadeLevels.json`
metadata (background/track/speed/parcels/quota/garbage/salt) matches the original
`ARCADE*.TXT` **exactly across all 51 levels (0 mismatches)**.

But the segment baker had a **bug**: a `$`-anchored `/\.txt$/i` test silently
**dropped every segment line carrying an `Angle=` annotation** (e.g.
`"Worm.txt Angle=-360"`, `"Invert.txt Angle=30"`), corrupting **47 of 51 arcade
levels** — losing the signature WORM corkscrews, INVERTs, SCREWs and angled WIBBLEs
(1–8 segments per level). We fixed both bakers (unanchored the test, stripped the
annotation in the key) **and** captured each per-instance `Angle=` into the
parallel `segAngles[]` arrays. Re-baking recovered **30 annotated instances across
16 levels** (ARCADE024 went 24→31 segments; Challenge 49→50), with **0 dangling
segment keys**. Those authored angles are now threaded into the runtime roll system
(`Worm = ±360` corkscrew, `Invert = ±180` flip, …), replacing a hardcoded
heuristic.

### How we mapped all this into Three.js

Catmull-Rom spline in `(s, x)`; parallel-transport frames; path-family spline
shaping with C1-continuous kernels (`smootherStep` loops, `smoothBump` banks,
`smoothSWave` hills/valleys/slalom; continuous 360° inverts); a tangent-roll
system for corkscrew/invert/half-pipe driven by the authored `Angle`;
grid-accurate road, drivable-extent barriers, gap/chasm classification, and
TRACKWARN warning stripes.

---

## Fidelity & engineering decisions

A short tour of the choices that matter:

- **Faithful-as-possible, not a re-imagining.** The goal throughout was to
  reproduce the *original* — its level chains, its curve families, its menus
  (re-stitched from the split 640×512 plates), its postal-meter "go postal" rage
  mechanic, its frame-swapped Turbo, its voice sets. Where the original data
  exists, we decode it rather than invent.
- **Grid-accurate geometry.** Levels are built quad-per-cell from the original
  8-lane segment grids at the original `ROW_UNITS ≈ 2.7` spacing, with arc length
  preserved through the spline so a row at `s = row·rowUnits` lands where the
  author put it.
- **C1 curve continuity.** Every shaping kernel was chosen so that value *and*
  rate vanish at feature boundaries — loops, hills and banks blend seamlessly
  into the surrounding road with no visible kink. A 360°-multiple corkscrew or
  invert is guaranteed to end exactly upright.
- **Recovered `Angle=` over heuristics.** After finding the baker bug, the
  signature WORM/INVERT/SCREW rolls are driven by the *authored* signed-degree
  values, not a guess — and the unannotated fallback sign is position-derived so
  it is identical on every multiplayer client.
- **Full-assembly Turbo grounding.** `groundTurbo` measures the lowest vertex
  across *every* loaded body-frame geometry **and** the full assembled
  world-space bounding box, fixing an earlier bug where measuring only the BASE
  pose's bbox let a lower submesh float-then-snap. Per-frame body wiggle is then
  an *offset* on top of that grounding base, never an absolute Y.
- **No jump button.** The original is steer + fire only; hops are automatic and
  **gap-aware** — `Player.launch()` queries `track.nextGap`/`gapAt` and sizes the
  arc to clear wide (~27 u) chasms instead of using a fixed parabola that fell
  short.
- **The level-end victory outro.** On a win, `ChaseCamera.startOutro()` swings the
  camera from behind to Turbo's face, the HUD parcel counter freezes, and
  collected-parcel sprites **fly into the counter** (`HUD.flyInPackage`) so the
  tally ticks up as letters land — a small cinematic beat for the finish.
- **Original audio first, synth as a net.** Every sound tries its extracted OGG
  buffer; only if that's missing does the WebAudio synth engine cover it, so the
  game is playable even with a partial asset set.
- **An HD seam, not a rewrite.** A single `resolveTextureUrl()` switch supports an
  optional `assets-hd/` PNG pack or a function-form up-res hook without touching
  any call site.

---

## Multiplayer

Everyone races the **same level id + seed**, so each client builds an *identical*
track locally and only positions are relayed — cheap and desync-proof.

**Server — `server/server.js`** — one Node process serving `dist/` over HTTP and
the race WebSocket at `/ws`. `MAX_PLAYERS = 6`; `RACE_LEVELS = ['g0-l0', 'g0-l1',
'g1-l0']`. It manages lobby rooms (`getRoom`, `findOpenRoom`, `roomsList`),
ready-up + a server-side 3→0 countdown, a position relay (`pos` →
`pos{id,s,x,st,pr}` to everyone else), finish ordering (`finishOrder` → places),
and host migration on disconnect. The static handler MIME-maps original asset
types (`.tga`, `.ogg`, `.x2 = text/plain`) and **SPA-falls back to
`dist/index.html`**.

Protocol (header-documented): **client→server** `hello listRooms quickPlay
createRoom joinRoom ready unready startRace rename pos finish leave chat`;
**server→client** `hi rooms welcome players countdown start pos finished ended
error left`.

**Client — `src/net/online.js`** — `startOnlineRace(game)` creates an
`OnlineSession` (lobby / home / race UI) and resolves the server via
`serverUrl()`: `window.SNAIL_CONFIG.serverUrl` if set, else same-origin
`wss://…/ws` in production, except a Vite dev port (`/^51\d\d$/`) targets
`ws://<host>:8080/ws`. Outbound `pos` is throttled to **12 Hz**; the session also
triggers a Turbo **look-back** pose when a ghost is 0.5–14 u behind.

**Ghosts — `src/net/ghosts.js`** — `GhostManager` renders remote racers as
translucent tinted snails (`GHOST_TINTS`, opacity `0.72`) built from the same
`buildSnail()`, each with a floating canvas name-tag sprite, smoothly positioned
on the shared track via `track.frameAt` / `track.surfacePoint`.

---

## Build & deploy

The repo ships a **single Node process** (`server/server.js`) that serves the
built client *and* hosts the multiplayer WebSocket — ideal for a DigitalOcean
droplet.

```bash
# on the droplet (Node 18+):
npm ci
bash tools/stage_assets.sh "path/to/SnailMail.dat"   # populate public/assets
npm run build                                         # → dist/
PORT=8080 node server/server.js                       # serves dist/ + /ws
```

Put it behind nginx with TLS (so the client uses `wss://`) and keep it alive with
pm2 or a systemd unit:

```ini
# /etc/systemd/system/snailmail.service
[Service]
WorkingDirectory=/home/snail/snailmail
ExecStart=/usr/bin/node server/server.js
Environment=PORT=8080
Restart=always
```

The client auto-detects the server: same-origin `/ws` in production (and `wss:`
under HTTPS), or `ws://<host>:8080/ws` when run from a Vite dev port. Override
with `window.SNAIL_CONFIG.serverUrl`.

### Optional HD texture pack

Texture lookups go through `resolveTextureUrl()` in `src/assets.js`
(`TEXTURE_PACK = window.SNAIL_CONFIG.texturePack || 'original'`). Set
`window.SNAIL_CONFIG.texturePack = 'hd'` and mirror the PNGs under
`/assets-hd/<path>.png`, or pass a `(name) => url` function for a remote up-res
API.

---

## Project layout

| Path | What |
| --- | --- |
| `src/` | ES-module source (engine, game, track, ui, net, data) |
| `server/server.js` | HTTP static server + race WebSocket (one process) |
| `tools/` | `stage_assets.sh` (extract/stage), `bakeSegments.mjs`, `bakeChallenge.mjs` |
| `public/assets/` | Staged original media served at `/assets` (**gitignored**) |
| `dist/` | Vite build output served by the server (**gitignored**) |
| `extracted/`, `exe_src/`, `assets-hd/` | Your own game files + RE work + HD pack (**gitignored**) |
| `ASSET_AUDIT.md` | Read-only audit of which extracted assets the code actually uses |
| `package.json`, `.gitignore` | Project metadata + the copyright boundary |

Stack: **Three.js ^0.184.0**, **ws ^8.21.0** (runtime); **vite ^8.0.16**,
**puppeteer-core ^25.1.0** (dev). `"type": "module"`, license ISC, repo
`github.com/SonnyC56/snailmail`.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (http://localhost:5173) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview the production build |
| `node server/server.js` | Serve `dist/` over HTTP + multiplayer WebSocket at `/ws` |
| `bash tools/stage_assets.sh "SnailMail.dat"` | Extract + stage assets into `public/assets` |
| `node tools/bakeSegments.mjs` | Re-bake `SEGMENTS`/`LEVELS` `.TXT` → JSON |
| `node tools/bakeChallenge.mjs` | Bake `CHALLENGE000.TXT` → `challenge.json` + idx 100 |

(`npm test` is currently a stub.)

---

## Status / known gaps

- **The per-type curve generator's closed forms are not yet recovered.** The
  original stores curve shapes *procedurally in code* and reads the curve index
  back through an aliased struct (see [the open
  problem](#the-genuine-open-problem-an-aliased-struct)). Our families + C1
  kernels are a faithful *reconstruction* of the recognizable shapes (loop, hill,
  valley, slalom, corkscrew, invert, half-pipe), not a byte-exact port of the
  original generator. The next RE step is to Unicorn-trace the segment-record
  block-copy and map the destination struct.
- **Asset coverage.** A large slice of the extracted library is staged but not yet
  wired in (see `ASSET_AUDIT.md`): all weapon DRAW/FIRE frames, most of the
  111-line voice library, the damage/invincible Turbo skins, textured particle
  sheets, and the 4th road skin (`TRACK3`/`SLIDE3`). These are presentation
  upgrades, not blockers.
- **HD texture pack is optional** and not shipped — the `'hd'` path is a seam, not
  a bundled asset set.
- **Procedural / Endless mode** is wired (`proceduralLevel`) but light on content
  versus the authored levels.

---

## Credits

- **Original game:** *Snail Mail* © **Alpha72 Games / Sandlot Games (2004)** — all
  original art, audio, models, level data and the game binary belong to them.
- **Web remaster:** a personal fan project — engine, curve reconstruction, data
  pipeline, multiplayer and UI re-implementation, built on
  [Three.js](https://threejs.org/) + [Vite](https://vitejs.dev/).
- **Asset archive format:** documented by Luigi Auriemma's `snail_mail.bms`
  QuickBMS script.

*A fan remaster, made with respect for the original. Now go deliver some mail. 🐌📬*

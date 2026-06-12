# Curve-generator reverse-engineering artifacts

Static RE that cracked how the original *Snail Mail* (2004) builds its per-type
track curves. The game binary was **never executed** — only isolated functions
were run under a **Unicorn** emulator against a *synthesized* object graph
(faked memory). Tooling here references the clean non-DRM binary at
`exe_src/.../SnailMail.exe` (gitignored, copyrighted — not redistributed); these
scripts and the recovered constants are our own analysis output.

## The model (recovered) — TWO complementary layers

**Layer 1 — per-curve geometry FACTORIES (build time).** Each named curve type
*does* have a dedicated generator: a per-curve **factory function** that writes
the curve's control-point array (centerline + cross-section profile) into its
0xA8-byte descriptor. 29 distinct factories build the 51 curve types; the master
catalog builder `0x40acc0` calls them with per-segment args (a float SIZE, a
segment count, texture paths). Each factory writes `[this+0x38]=curve_index`,
`[this+0x44]=point_count`, `[this+0x4c]=length`, allocates `count*0xA8` control
points (`[this+0x58]`), and fills each point's POSITION at `+0x30/+0x34/+0x38`
and PROFILE at `+0xa0` using sin/cos-table parametric loops. We dumped these by
**emulating each factory in isolation** (`factory_emulator.py`) — actual
game-accurate control points for 25 curves are in **`curve_points.json`**, their
closed-form formulas in **`curve_formulas.json`**, and the full struct/descriptor
map in **`descriptor_table.json`**. (This corrects the earlier note that "there
is no per-curve generator" — there is; it just lives in the catalog builder, not
a data table.)

**Layer 2 — generic shaping primitive (run time).** During play, one generic
state machine walks the per-curve descriptor and adds the shared vertical-bump /
banking / heading-slerp behavior, driven by per-curve **descriptor data**:

- **State machine `0x4466b0`** slerps the road's heading frame from its current
  orientation toward a stored **target direction** (`parent+0x1888`, anchor
  `+0x1840`), eased by ≈`sin(t·π/2)` (exact 60-sample curve in
  `curve_geometry.json → heading_ease_n60`), with a `2·sin(t·π)` lateral bow.
  Target horizontal ⇒ a turn; target vertical ⇒ a loop/pitch (verified: a
  straight-up target pitches the frame 0°→−90°). **The difference between
  LOOPTHELOOP / SCREW / HALFPIPE / … is the target waypoint + banking params**,
  which live in the per-curve descriptor table (`idx·0x150 + 0xff2914`).
- **Integrator `0x4461b0`** adds the vertical hill bump + banking and commits
  world position at `0x446414` (constants byte-verified):
  - substep `1/120`; `posX += dir.x·0.3333`; `posZ += dir.z + 0.4`;
    `posY += dir.y·hd4` where `hd4 += (h − hd4)·0.1` (low-pass vertical ease).
- **Vertical hill bump** `h(t) = (0.5 − 0.5·cos(2π·t))·0.35` ≡ `smoothBump(t)·0.35`,
  gated to exactly indices **{8,9,10,14,16,36,43,45}** =
  {HILL, HILL4C, HILL4, SBEND, HUMP, START, TWISTERA, TWISTER2A}.
- **Banking / roll** from descriptor `+0x354` amp / `+0x358` phase:
  `roll ≈ amp·(0.5 − 0.5·cos(phase·π))·360°` (amp 0.5→90°, 1.0→180°, 2.0→360°
  corkscrew), plus a small grade auto-bank `clamp((−2.0−(dir.y−0.49)·5.0)·π/180, ±70°)`.

All measured constants are in **`curve_geometry.json`**.

## Files
- `curve_geometry.json` — Layer-2 runtime constants (ease curve, hill bump + gate,
  position-commit scalars, bank amp→deg map, auto-bank formula).
- `descriptor_table.json` — **per-curve descriptor STRUCT layout** + the
  array/selector/installer chain (base `0xff2914`, stride `0x150`/`0xA8`,
  selector `0x436cda`, fields `+0x24` model / `+0x38` index / `+0x44` count /
  `+0x4c` length / `+0x58` point buffer), the descrA→descrB→descrC runtime chain,
  the registry, and the float-constant pool.
- `curve_formulas.json` — **closed-form parametric formula per curve** (Layer 1),
  factory addresses, families, and the recovered magnitudes for `track.js`.
- `curve_points.json` — **emulated game-accurate control points** for 25 curves:
  `[posX,posY,posZ, rawX,rawY,rawZ, scale, profile_a0]` per point.
- `factory_emulator.py` — Unicorn harness that runs ONE factory in isolation
  (hooks malloc/CRT, prefills sin/cos tables, dumps the point buffer). Usage:
  `python factory_emulator.py 0x429b00 <arg0> <arg1> ...`. `curve_specs.txt` has
  the verified arg vector per curve.
- `walker.py`, `drive.py`, `sweep.py`, `integ.py`, `bank.py`, `deliver.py` —
  Layer-2 Unicorn harnesses (single-step `0x4466b0`/`0x4461b0`). Run with the
  `/tmp/reve` venv (unicorn/capstone/pefile).

## Status — COMPLETE for a 1:1 port
Both layers recovered: per-curve geometry (Layer 1, `curve_points.json` +
`curve_formulas.json`) and the generic shaper (Layer 2, `curve_geometry.json`).
`src/track/track.js` can now reproduce each curve from its real control points /
formula instead of the family approximations in `segments.js`.

### Per-curve summary (emulated, size args per `curve_specs.txt`)
| curve | idx | n | shape (emulated centerline / profile) |
|---|---|---|---|
| LOOPTHELOOP / LOOPBOW | 0 | 51 | vertical loop, X[-2.5,2.5] Y[0,11.8] |
| LOOPTHELOOPW | 6 | 64 | tall loop with overhang, Y[0,15.9] Z dips to -0.94 |
| LOOPOUT | 25 | 32 | loop dipping below grade, Y[-5.7,0] |
| HUMP | 16 | 18 | raised-cosine bump (+ runtime hill-bump) |
| DUMP | 17 | 18 | bump negated (dip) |
| DIP | 20 | 22 | shallow dip, Y[-1.9,0] |
| SCREW | 21 | 24 | tight screw, X=0.5·cos, runtime roll |
| SLALOM | 22 | 32 | windowed sine, X=5·sin(2πu)·window |
| SLALOMBIG | 23 | 32 | wider, amp 40/9 |
| SLALOMDOUBLE | 32 | 70 | 2 cycles, amp 40/9 |
| SWEEP / SNAKE / WIBBLE | 28/29/40 | 30/27/32 | single-sweep weaves |
| WORM | 24 | 24 | straight tube, Z=4·i (len 96) |
| START | 36 | 27 | start ramp, Y[0,7.6] |
| SUPERTRAMP | 31 | 13 | bounce, Y[0,2.0] |
| TURNOVER / TURNOVERDOUBLE | 37/38 | 45/64 | vertical arc + lateral S, runtime roll 180° |
| TURNUNDER | 39 | 45 | arc under grade, Y[-2.35,0] |
| CAGE2 | 15 | 22 | barrel, cross-section + roll |
| INVERT | 41 | 34 | full inversion, ang=i·π/16, runtime roll 360° |
| HALFPIPE | 42 | 66 | straight; U cross-section radius 40→4→40; bank 52° |
| TWISTERA | 43 | 34 | corkscrew, X=2.5·cos, ~1 twist |
| TWISTER2A | 45 | 52 | double corkscrew, X=2.5·cos(i·2π/25), ~2 twists |

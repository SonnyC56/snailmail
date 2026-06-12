# Curve-generator reverse-engineering artifacts

Static RE that cracked how the original *Snail Mail* (2004) builds its per-type
track curves. The game binary was **never executed** — only isolated functions
were run under a **Unicorn** emulator against a *synthesized* object graph
(faked memory). Tooling here references the clean non-DRM binary at
`exe_src/.../SnailMail.exe` (gitignored, copyrighted — not redistributed); these
scripts and the recovered constants are our own analysis output.

## The model (recovered)

There is **no per-curve closed-form generator** and **no 51-way formula table**.
There is **one generic shaping primitive** driven by per-curve **descriptor data**:

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
- `curve_geometry.json` — the recovered constants (ease curve, hill bump + gate,
  position-commit scalars, bank amp→deg map, auto-bank formula).
- `walker.py`, `drive.py`, `sweep.py`, `integ.py`, `bank.py`, `deliver.py` —
  the Unicorn harnesses (map PE sections, prefill the sin/cos tables, synthesize
  the rider/descriptor structs, single-step `0x4466b0`/`0x4461b0`, capture the
  per-substep frame/position). Run with the `/tmp/reve` venv (unicorn/capstone/pefile).

## Status
The **shaping primitive is fully recovered** (above). The remaining piece for a
byte-exact port is the **per-curve descriptor table** (target waypoint + banking
amp/phase + length per curve index) at base `0xff2914` — dumped separately. With
both, `src/track/track.js` can reproduce each curve 1:1 instead of approximating.

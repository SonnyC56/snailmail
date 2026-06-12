import sys; sys.path.insert(0, '/tmp/reve')
from integ import *
from sweep import sweep_state
from percurve import NAMES
import struct, math, json

# Produce the portable per-curve geometry deliverable.
# Heading easing f(t) := slerp fraction from state machine (empirical), captured once.
def heading_frac(n=120):
    rows = sweep_state(6, n, target=(0.0, 100.0, 0.0))  # 90-deg sweep
    out = []
    for k in range(n+1):
        r = rows[k]
        if r is None:
            out.append(None); continue
        fy = r[0][9]
        ang = math.degrees(math.asin(max(-1, min(1, -fy)))) / 90.0
        out.append(ang)
    return out

def hill_profile_sampled(n=120):
    # gated curves: h(t) = (0.5 - 0.5 cos(2 pi t)) * 0.35
    return [(0.5 - 0.5*math.cos(2*math.pi*(k/n)))*0.35 for k in range(n+1)]

HILLSET = {8,9,10,14,16,36,43,45}
HILLNAMES = [NAMES[i] for i in sorted(HILLSET)]

if __name__ == "__main__":
    f = heading_frac(60)
    print("# === SNAIL MAIL per-type curve geometry (recovered via Unicorn emulation) ===\n")
    print("HEADING_EASE (slerp fraction f(t), t=0..1 in 1/120 steps) — shared by all 'steer' states")
    print("  closed form ~ sin(t*PI/2) (within ~3%); exact samples (n=60):")
    print("  " + ", ".join("%.4f" % (x if x is not None else 0.0) for x in f))
    print()
    print("HILL_BUMP h(t) = (0.5 - 0.5*cos(2*PI*t)) * 0.35   amplitude=0.35, single raised-cosine lobe")
    print("  applies (additive vertical lift) to indices:", sorted(HILLSET), "=", HILLNAMES)
    print()
    print("BANK/ROLL (descriptor +0x354 amp, +0x358 phase):")
    print("  roll(t) ~= amp * (0.5 - 0.5*cos(phase*PI)) * 360deg + dir.x*(-8)*0.17*deg2rad")
    print("  measured: amp 0.25->46.7deg, 0.5->90deg, 1.0->180deg, 2.0->360deg (phase=0.5)")
    print("  => full-roll amp=1.0 gives a 180deg bank; corkscrew SCREW/TWISTER use amp>=2 (>=360 over the segment)")
    print()
    print("AUTO-BANK (grade-driven): bank=clamp((-2.0-(dir.y-0.49)*5.0)*deg2rad, +-1.2215rad/+-70deg)")
    print("  small (a few deg) — tilts into climbs/dives.")
    print()
    print("VERTICAL COMMIT per step (integrator 0x446414): posY += hill_smoothed*0.1; posZ += dir.z*1 + 0.4; posX += dir.x*0.3333")
    print("  (the *0.1 is the +0xd4 easing accumulator: hd4 += (h - hd4)*0.1)")
    print()
    # dump JSON for porting
    data = {
        "heading_ease_n60": [round(x,5) for x in f if x is not None],
        "hill_bump_amp": 0.35,
        "hill_bump_formula": "(0.5 - 0.5*cos(2*pi*t))*0.35",
        "hill_indices": sorted(HILLSET),
        "hill_names": HILLNAMES,
        "step_per_substep": 1.0/120.0,
        "fwd_advance_z": 0.4,
        "lat_scale_x": 1.0/3.0,
        "vert_ease_alpha": 0.1,
        "bank_amp_to_deg": {"0.25":46.67,"0.5":90.0,"1.0":180.0,"2.0":360.0},
        "autobank_formula": "clamp((-2.0-(dir.y-0.49)*5.0)*pi/180, -1.2215, 1.2215)",
    }
    open("/tmp/reve/curve_geometry.json","w").write(json.dumps(data, indent=2))
    print("Wrote /tmp/reve/curve_geometry.json")

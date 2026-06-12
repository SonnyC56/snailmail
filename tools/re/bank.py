import sys; sys.path.insert(0, '/tmp/reve')
from integ import *
import struct, math

# Probe the auto-bank: roll the integrator applies to the frame as a function of dir.y.
# After 0x4461b0 runs, the frame at RIDER+0x40 (4x4) has been rotated by 0x44d000 (auto-bank
# about forward) and 0x44d120 (descriptor roll). We measure the roll by the up-vector tilt.

def run_bank(dir_y, roll_amp=0.0, roll_phase=0.0, dir_x=0.0):
    setup_rider(11, (dir_x, dir_y, 1.0), 1.0, 0.5, 0.0)   # idx 11 = VALLEY (no hill gate)
    # descriptor roll params
    wf(DESCRA + 0x354, roll_amp)
    wf(DESCRA + 0x358, roll_phase)
    reset()
    sp = SP0 - 0x400
    mu.mem_write(sp, struct.pack('<I', TRAP))
    mu.reg_write(UC_X86_REG_ESP, sp)
    mu.reg_write(UC_X86_REG_ECX, RIDER)
    try:
        mu.emu_start(0x4461b0, TRAP, count=4000000)
    except UcError as e:
        return None
    M = [rf(RIDER + 0x40 + i*4) for i in range(16)]
    return M

def roll_of(M):
    # up vector = row1 (M[4],M[5],M[6]); roll = angle of up from vertical in the side plane
    # measure tilt: atan2(up.x, up.y)
    return math.degrees(math.atan2(M[4], M[5]))

if __name__ == "__main__":
    print("=== AUTO-BANK: frame roll vs dir.y (grade), roll_amp=0 ===")
    print("    static formula: bank=clamp((-2.0-(dir.y-0.49)*5.0)*deg2rad, +-1.2215rad=+-70deg)")
    for dy in [-1.0,-0.5,-0.2,0.0,0.2,0.49,0.6,1.0]:
        M = run_bank(dy)
        if M is None: print("  dir.y=%+.2f ERR"%dy); continue
        # predicted bank angle (radians)
        pred = (-2.0 - (dy-0.49)*5.0)*(math.pi/180)
        pred = max(-1.2215, min(1.2215, pred))
        print("  dir.y=%+.2f  frame roll=%+7.2f deg   pred bank=%+7.2f deg" % (dy, roll_of(M), math.degrees(pred)))
    print()
    print("=== DESCRIPTOR ROLL: frame roll vs roll_amp (+0x354), phase=0.5, dir.y=0 ===")
    for amp in [0.0, 0.25, 0.5, 1.0, 2.0]:
        M = run_bank(0.0, roll_amp=amp, roll_phase=0.5)
        if M is None: print("  amp=%.2f ERR"%amp); continue
        print("  roll_amp=%.2f  frame roll=%+7.2f deg" % (amp, roll_of(M)))

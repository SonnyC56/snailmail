import sys; sys.path.insert(0, '/tmp/reve')
from walker import *
import struct, math

# Emulate the integrator 0x4461b0 one step at a time, capturing position deltas.
# Synthesize: rider 'this' (ebp), descrA [ebp+0xc0], descrB [descrA+0x388], descrC [descrA+0x38c].
# descrA also = [ebp+0xc4] for [edx+0x50] read at 0x44622a.

RIDER  = alloc(0x800)
DESCRA = alloc(0x4000)
DESCRB = alloc(0x200)
DESCRC = alloc(0x200)
DESCRD = alloc(0x200)   # [ebp+0xc4] secondary

def clr(a, n): mu.mem_write(a, b'\x00'*n)

def setup_rider(curve_idx, dir_xyz, seg_len, prog, bank_amp=0.0, seg_start=0.0,
                hill_gate_state=1):
    clr(RIDER, 0x800); clr(DESCRA, 0x4000); clr(DESCRB, 0x200); clr(DESCRC, 0x200); clr(DESCRD, 0x200)
    # rider links
    wd(RIDER + 0xc0, DESCRA)
    wd(RIDER + 0xc4, DESCRD)
    # direction vector at descrA+0x2964
    wf(DESCRA + 0x2964, dir_xyz[0]); wf(DESCRA + 0x2968, dir_xyz[1]); wf(DESCRA + 0x296c, dir_xyz[2])
    # gate and chain
    wd(DESCRA + 0x384, hill_gate_state)        # byte gate == 1 enables hill block
    wd(DESCRA + 0x388, DESCRB)
    wd(DESCRA + 0x38c, DESCRC)
    wd(DESCRB + 0x38, curve_idx)               # curve index
    wf(DESCRB + 0x4c, seg_len)                 # segment length divisor
    wf(DESCRC + 0x18, seg_start)               # segment start
    wf(DESCRA + 0x70, prog)                    # current progress position (absolute)
    wf(DESCRA + 0x2dc, bank_amp)               # banking amplitude
    # descrA quats/params used later (+0x354,0x358,0x370,0x39c,0x3a0,0x41d,0x42c) leave 0
    # DESCRD +0x50 (an int, fild'd) and +0x38 (float) and +0x296c read at top:
    wd(DESCRD + 0x50, 0)
    wf(DESCRD + 0x38, 0.0)
    # rider accumulators
    wf(RIDER + 0x70, 0.0); wf(RIDER + 0x74, 0.0); wf(RIDER + 0x78, 0.0)
    wf(RIDER + 0xc8, 110.0)
    wf(RIDER + 0xb8, 0.0)
    wd(RIDER + 0xd0, 0); wd(RIDER + 0xd4, 0)
    # frame matrices at +0x40 and +0x80 identity
    identity4(RIDER + 0x40)
    identity4(RIDER + 0x80)

def step_integ(curve_idx, dir_xyz, seg_len, prog, bank_amp=0.0, seg_start=0.0):
    setup_rider(curve_idx, dir_xyz, seg_len, prog, bank_amp, seg_start)
    reset()
    sp = SP0 - 0x400
    mu.mem_write(sp, struct.pack('<I', TRAP))
    mu.reg_write(UC_X86_REG_ESP, sp)
    mu.reg_write(UC_X86_REG_ECX, RIDER)
    read_log.clear()
    try:
        mu.emu_start(0x4461b0, TRAP, count=4000000)
    except UcError as e:
        return ('ERR', str(e), hex(mu.reg_read(UC_X86_REG_EIP)))
    px = rf(RIDER + 0x70); py = rf(RIDER + 0x74); pz = rf(RIDER + 0x78)
    hill = rf(RIDER + 0xd0); hill_acc = rf(RIDER + 0xd4)
    return ('OK', (px, py, pz), hill, hill_acc)

if __name__ == "__main__":
    # Sweep progress for HILL (idx 8) with a fixed forward direction (0,0,1),
    # seg_len=1.0; capture posY accumulation = the vertical hill profile.
    print("=== integrator one-step posY for fwd=(0,1,0)-ish, idx 8 (HILL) ===")
    print("    (posY delta == vertical motion this step; dir.y drives it)")
    for prog in [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0]:
        r = step_integ(8, (0.0, 1.0, 1.0), 1.0, prog)
        print("  prog=%.2f -> %s" % (prog, r))

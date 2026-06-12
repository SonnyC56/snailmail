import sys; sys.path.insert(0, '/tmp/reve')
from drive import *
import struct, math

# Sweep t in [0,1] by 1/120, capture working frame [ebp+0x10] forward direction.
# The frame is a 4x4 row-major matrix. Rows: 0->side(X), 1->up(Y), 2->fwd(Z) typically.
# The integrator reads forward = the direction vector the state writes; we report all rows.

def sweep_state(entry_state, steps=120, target=(0.0, 0.0, 100.0)):
    rows = []
    for k in range(steps + 1):
        t = k / steps
        setup_graph()
        # set target
        wf(PARENT + 0x1888, target[0]); wf(PARENT + 0x188c, target[1]); wf(PARENT + 0x1890, target[2])
        wd(SM + 0x0c, entry_state)
        wf(SM + 0x50, t)
        reset()
        sp = SP0 - 0x400
        mu.mem_write(sp, struct.pack('<I', TRAP))
        mu.reg_write(UC_X86_REG_ESP, sp)
        mu.reg_write(UC_X86_REG_ECX, SM)
        try:
            mu.emu_start(0x4466b0, TRAP, count=2000000)
        except UcError:
            rows.append(None); continue
        M = [rf(SM + 0x10 + i*4) for i in range(16)]
        D = [rf(SM + 0x40 + i*4) for i in range(3)]
        rows.append((M, D))
    return rows

def show_sweep(name, st, steps=12):
    rows = sweep_state(st, steps)
    print("=== state %d (%s) frame forward (row2) over t ===" % (st, name))
    for k, r in enumerate(rows):
        t = k/steps
        if r is None:
            print("  t=%.3f ERR" % t); continue
        M, D = r
        # row0 = M[0..2], row1 = M[4..6], row2 = M[8..10]
        print("  t=%.3f  r0=(%+.3f %+.3f %+.3f) r1=(%+.3f %+.3f %+.3f) r2=(%+.3f %+.3f %+.3f) dir=(%+.3f %+.3f %+.3f)" % (
            t, M[0], M[1], M[2], M[4], M[5], M[6], M[8], M[9], M[10], D[0], D[1], D[2]))

if __name__ == "__main__":
    for st, nm in [(6, 'curve6'), (8, 'curve8'), (11, 'curve11'), (7, 'steer7')]:
        show_sweep(nm, st, 12)
        print()

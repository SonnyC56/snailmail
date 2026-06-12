import sys; sys.path.insert(0, '/tmp/reve')
from walker import *
import struct, math

# ---- Build synthesized object graph ----
# state-machine 'this' (ebp) : 0x200 bytes
SM   = alloc(0x600)
PARENT = alloc(0x4000)     # [ebp] -> parent; needs +0x68 pos, +0x100 sub, +0x1888 target, +0x1840 vec, +0x140, +0x1930..
SUB  = alloc(0x400)        # [parent+0x100] -> sub; +0x200 matrix, +0x38 ...
PARENT4 = alloc(0x100)     # [ebp+4] -> another object (state4 reads +0x4338, +0x84, +0x44c, +0x44d)

def clearmem(a, n):
    mu.mem_write(a, b'\x00'*n)

def setup_graph():
    clearmem(SM, 0x600)
    clearmem(PARENT, 0x4000)
    clearmem(SUB, 0x400)
    clearmem(PARENT4, 0x100)
    # SM links
    wd(SM + 0x00, PARENT)      # [ebp] = parent
    wd(SM + 0x04, PARENT4)     # [ebp+4] = secondary obj
    # frame matrix [ebp+0x10] identity
    identity4(SM + 0x10)
    # dir vec [ebp+0x40..0x48]
    wf(SM + 0x40, 0.0); wf(SM + 0x44, 0.0); wf(SM + 0x48, 1.0)
    # progress
    wf(SM + 0x50, 0.0)
    wd(SM + 0x54, 0x3c088889)   # 1/120
    # parent: pos [parent+0x68] vec3
    wf(PARENT + 0x68, 0.0); wf(PARENT + 0x6c, 0.0); wf(PARENT + 0x70, 0.0)
    # parent sub-object pointer
    wd(PARENT + 0x100, SUB)
    # parent target [parent+0x1888] vec3 (steer-to point)
    wf(PARENT + 0x1888, 0.0); wf(PARENT + 0x188c, 0.0); wf(PARENT + 0x1890, 100.0)
    # parent +0x1840 vec3 (state5 origin)
    wf(PARENT + 0x1840, 0.0); wf(PARENT + 0x1844, 0.0); wf(PARENT + 0x1848, 0.0)
    # parent +0x140 (state6 gate) nonzero so it skips the side-effect call
    wd(PARENT + 0x140, 1)
    # parent +0x1930/+0x192c step values
    wd(PARENT + 0x1930, 0x3c888889)
    wd(PARENT + 0x192c, 0x3c888889)
    # SUB matrix at +0x200 identity (this is the 'parent frame' read into local)
    identity4(SUB + 0x200)
    # SUB +0x38 a matrix too (used by 0x442d89 copy)
    identity4(SUB + 0x38)
    # PARENT4 fields
    wd(PARENT4 + 0x4338, 0)
    wd(PARENT4 + 0x84, 0)

def run_state_once(entry_state, t):
    """Run one substep of 0x4466b0 with [ebp+0xc]=entry_state and [ebp+0x50]=t. Return frame matrix rows."""
    setup_graph()
    wd(SM + 0x0c, entry_state)
    wf(SM + 0x50, t)
    reset()
    sp = SP0 - 0x400
    mu.mem_write(sp, struct.pack('<I', TRAP))
    mu.reg_write(UC_X86_REG_ESP, sp)
    mu.reg_write(UC_X86_REG_ECX, SM)   # thiscall
    read_log.clear()
    try:
        mu.emu_start(0x4466b0, TRAP, count=2000000)
    except UcError as e:
        return ('ERR', str(e), hex(mu.reg_read(UC_X86_REG_EIP)))
    # capture frame matrix [ebp+0x10] (4x4) and dir [ebp+0x40], next state, progress
    M = [rf(SM + 0x10 + i*4) for i in range(16)]
    D = [rf(SM + 0x40 + i*4) for i in range(3)]
    nxt = rd(SM + 0x0c)
    prog = rf(SM + 0x50)
    return ('OK', M, D, nxt, prog)

if __name__ == "__main__":
    for st in range(1, 13):
        r = run_state_once(st, 0.25)
        if r[0] == 'ERR':
            print("state %2d -> ERR %s at %s" % (st, r[1], r[2]))
        else:
            _, M, D, nxt, prog = r
            print("state %2d -> next=%d prog=%.4f dir=(%.3f,%.3f,%.3f)" % (st, nxt, prog, D[0], D[1], D[2]))
            print("           frame rows: [%.3f %.3f %.3f] [%.3f %.3f %.3f] [%.3f %.3f %.3f]" % (
                M[0], M[1], M[2], M[4], M[5], M[6], M[8], M[9], M[10]))

"""
walker.py - Emulate the per-family spline state machine 0x4466b0 with a
synthesized object graph, capturing the orientation frame (direction vector)
produced at each 1/120 step. Reconstruct the 3D path per family.

NEVER runs the game; isolated-function emulation only.
"""
import math, struct, sys
import pefile
from unicorn import *
from unicorn.x86_const import *

PATH = "/home/sonny/snailmail/exe_src/new_nondrm_internetArchive/extracted/Snail Mail/SnailMail.exe"
pe = pefile.PE(PATH, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
def align_up(x, a=0x1000): return (x + a - 1) & ~(a - 1)

mu = Uc(UC_ARCH_X86, UC_MODE_32)
max_end = 0
secs = []
for s in pe.sections:
    va = IB + s.VirtualAddress
    sz = max(s.Misc_VirtualSize, s.SizeOfRawData)
    secs.append((va, sz, s.PointerToRawData, s.SizeOfRawData))
    max_end = max(max_end, va + sz)
IMG_SIZE = align_up(max_end - IB + 0x1000)
mu.mem_map(IB, IMG_SIZE)
mu.mem_write(IB, pe.__data__[0:0x1000])
for va, sz, praw, rawsz in secs:
    mu.mem_write(va, pe.__data__[praw:praw+rawsz])

# trig tables
mu.mem_write(0x77ffcc, b''.join(struct.pack('<f', math.sin(i*2*math.pi/8192)) for i in range(8192)))
mu.mem_write(0x777f7c, b''.join(struct.pack('<f', math.cos(i*2*math.pi/8192)) for i in range(8192)))

STACK = 0x100000
mu.mem_map(STACK, 0x80000)
SP0 = STACK + 0x80000 - 0x8000

HEAP = align_up(max_end + 0x100000)
mu.mem_map(HEAP, 0x800000)
hp = HEAP
def alloc(n):
    global hp
    a = hp
    hp = align_up(hp + n, 0x40)
    return a

# return trap
TRAP = 0x10000
mu.mem_map(TRAP & ~0xfff, 0x1000)
mu.mem_write(TRAP, b'\xf4')  # hlt

# ---- lazy mapping of stray reads (synthesize zeros) ----
LAZY_BASE = 0x60000000
mu.mem_map(LAZY_BASE, 0x10000000)   # big zeroed region for any wild pointer
read_log = {}
def hook_mem_unmapped(uc, access, address, size, value, user):
    page = address & ~0xfff
    try:
        uc.mem_map(page, 0x1000)
        uc.mem_write(page, b'\x00'*0x1000)
    except Exception:
        pass
    read_log[address] = read_log.get(address, 0) + 1
    return True
mu.hook_add(UC_HOOK_MEM_READ_UNMAPPED | UC_HOOK_MEM_WRITE_UNMAPPED | UC_HOOK_MEM_FETCH_UNMAPPED,
            hook_mem_unmapped)

# ---- stub out side-effect functions (sound/anim/parser): make them immediate ret/ret n ----
# We patch a 'ret' or 'ret 4' at their entry in emulated memory. cdecl callee-pop unknown,
# so prefer matching original stack discipline. We patch with C3 (ret) for thiscall/cdecl
# where caller cleans, but several are __stdcall pushing args. We instead intercept via a
# code hook that, on entry, fakes a return honoring the arg pop.
STUBS = {
    0x4445e0: 12,   # (idx, flag, val) stdcall-ish 3 dwords? caller uses push;push;push then call -> callee pops? It's __thiscall(ecx) +3 stack args. ret n unknown; treat as 12.
    0x4492b0: 12,
    0x442e20: 0,
    0x404920: 8,
    0x44dfb0: 4,
    0x431ca0: 0,    # cdecl caller cleans
    0x449be0: 0,    # cdecl caller cleans (printf-like)
    0x43a670: 0,
    0x445cb0: 0,    # matrix transform on +0x17b0 table; safe to skip for frame capture
    0x446e10: 0,
}
def hook_code(uc, address, size, user):
    if address in STUBS:
        # pop return address, set eip to it, adjust esp for callee-pop args
        sp = uc.reg_read(UC_X86_REG_ESP)
        ret = struct.unpack('<I', uc.mem_read(sp, 4))[0]
        popn = STUBS[address]
        uc.reg_write(UC_X86_REG_ESP, sp + 4 + popn)
        uc.reg_write(UC_X86_REG_EIP, ret)
        uc.reg_write(UC_X86_REG_EAX, 0)
mu.hook_add(UC_HOOK_CODE, hook_code)

def wf(a, v): mu.mem_write(a, struct.pack('<f', v))
def wd(a, v): mu.mem_write(a, struct.pack('<I', v & 0xffffffff))
def rf(a): return struct.unpack('<f', mu.mem_read(a, 4))[0]
def rd(a): return struct.unpack('<I', mu.mem_read(a, 4))[0]

def reset():
    for r in [UC_X86_REG_EAX, UC_X86_REG_EBX, UC_X86_REG_ECX, UC_X86_REG_EDX,
              UC_X86_REG_ESI, UC_X86_REG_EDI, UC_X86_REG_EBP]:
        mu.reg_write(r, 0)
    mu.reg_write(UC_X86_REG_ESP, SP0)

def identity4(a):
    for i in range(16):
        wf(a + i*4, 1.0 if i in (0, 5, 10, 15) else 0.0)

if __name__ == "__main__":
    print("image 0x%x size 0x%x  HEAP 0x%x" % (IB, IMG_SIZE, HEAP))
    print("sin[2048]=%.4f cos[0]=%.4f" % (rf(0x77ffcc+2048*4), rf(0x777f7c)))

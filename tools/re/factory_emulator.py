# Snail Mail (2004) per-curve geometry: emulate ONE factory function in isolation.
#
# STATIC + emulated only — the game is NEVER run as a process. We map the PE,
# prefill the sin/cos lookup tables, hook malloc/CRT as a bump allocator, then
# emulate a single per-curve factory (thiscall) and dump its generated control
# points (the descriptor's [this+0x58] buffer, stride 0xA8, position @+0x30,
# profile @+0xa0). Output: one JSON line.
#
# Usage:  python factory_emulator.py <factory_addr_hex> <arg0> <arg1> ...
#   e.g.  python factory_emulator.py 0x429b00 0x40c00000 8 1 0x4a2dc4 0x4a2dc4 0x4a2dc4
# Args are cdecl (arg0 first). Float args must be passed as their 0x hex bit
# pattern. See curve_specs.txt for the verified per-curve arg vectors.
# Requires a unicorn/capstone/pefile venv.
import sys, math, json, struct
import pefile
from unicorn import *
from unicorn.x86_const import *
PATH="/home/sonny/snailmail/exe_src/new_nondrm_internetArchive/extracted/Snail Mail/SnailMail.exe"
pe=pefile.PE(PATH, fast_load=True); IB=pe.OPTIONAL_HEADER.ImageBase
def align_up(x,a=0x1000): return (x+a-1)&~(a-1)
mu=Uc(UC_ARCH_X86, UC_MODE_32)
secs=[]; max_end=0
for s in pe.sections:
    va=IB+s.VirtualAddress; sz=max(s.Misc_VirtualSize,s.SizeOfRawData)
    secs.append((va,sz,s.PointerToRawData,s.SizeOfRawData)); max_end=max(max_end,va+sz)
mu.mem_map(IB, align_up(max_end-IB+0x1000)); mu.mem_write(IB, pe.__data__[0:0x1000])
for s2 in secs: mu.mem_write(s2[0], pe.__data__[s2[2]:s2[2]+s2[3]])
STACK=0x80000; mu.mem_map(STACK,0x100000); SP=STACK+0x100000-0x10000
HEAP=align_up(max_end+0x10000); HEAPSZ=0x800000; mu.mem_map(HEAP,HEAPSZ)
mu.mem_write(0x77ffcc, b''.join(struct.pack('<f', math.sin(i*2*math.pi/8192)) for i in range(8192)))
mu.mem_write(0x777f7c, b''.join(struct.pack('<f', math.cos(i*2*math.pi/8192)) for i in range(8192)))
mu.mem_write(0x777f78, b'\x01')
ALLOC0=HEAP+0x80000; alloc_ptr=[ALLOC0]
def bump(n):
    if not (0<=n<=0x80000): n=0x100
    p=(alloc_ptr[0]+0xf)&~0xf
    if p+n+0x80>HEAP+HEAPSZ-0x1000: p=ALLOC0
    alloc_ptr[0]=p+max(n,16)+0x80; mu.mem_write(p,b'\x00'*(max(n,16)+0x80)); return p
MALLOC={0x431b40,0x48b8ed,0x48c0f0}; NOOP={0x48c97a,0x431ca0}
def hook_code(uc,address,size,user):
    if address in MALLOC:
        esp=uc.reg_read(UC_X86_REG_ESP)
        if address==0x48c0f0:
            n=uc.reg_read(UC_X86_REG_EAX); uc.reg_write(UC_X86_REG_EAX,bump(n))
            ret=struct.unpack('<I',uc.mem_read(esp,4))[0]; uc.reg_write(UC_X86_REG_EIP,ret); uc.reg_write(UC_X86_REG_ESP,esp+4); return
        ret=struct.unpack('<I',uc.mem_read(esp,4))[0]; n=struct.unpack('<I',uc.mem_read(esp+4,4))[0]
        uc.reg_write(UC_X86_REG_EAX,bump(n)); uc.reg_write(UC_X86_REG_EIP,ret); uc.reg_write(UC_X86_REG_ESP,esp+4); return
    if address in NOOP:
        esp=uc.reg_read(UC_X86_REG_ESP); ret=struct.unpack('<I',uc.mem_read(esp,4))[0]
        uc.reg_write(UC_X86_REG_EAX,0); uc.reg_write(UC_X86_REG_EIP,ret); uc.reg_write(UC_X86_REG_ESP,esp+4); return
mu.hook_add(UC_HOOK_CODE,hook_code)
mapped=set()
def hook_inv(uc,access,address,size,value,user):
    pg=address&~0xfff
    if pg in mapped or len(mapped)>300: return False
    try: uc.mem_map(pg,0x1000); mapped.add(pg); return True
    except UcError: return False
mu.hook_add(UC_HOOK_MEM_READ_UNMAPPED|UC_HOOK_MEM_WRITE_UNMAPPED|UC_HOOK_MEM_FETCH_UNMAPPED,hook_inv)
RET=0x10000; mu.mem_map(RET&~0xfff,0x1000); mu.mem_write(RET,b'\xf4')
def rdf(a):
    try: return struct.unpack('<f',mu.mem_read(a,4))[0]
    except: return float('nan')
def rdi(a):
    try: return struct.unpack('<I',mu.mem_read(a,4))[0]
    except: return 0
addr=int(sys.argv[1],16); args=[int(x,0) for x in sys.argv[2:]]
for r in [UC_X86_REG_EAX,UC_X86_REG_EBX,UC_X86_REG_ECX,UC_X86_REG_EDX,UC_X86_REG_ESI,UC_X86_REG_EDI,UC_X86_REG_EBP]: mu.reg_write(r,0)
t=HEAP+0x100; mu.mem_write(t,b'\x00'*0x300)
sp=SP
for a in reversed(args): sp-=4; mu.mem_write(sp,struct.pack('<I',a&0xffffffff))
sp-=4; mu.mem_write(sp,struct.pack('<I',RET)); mu.reg_write(UC_X86_REG_ESP,sp); mu.reg_write(UC_X86_REG_ECX,t)
try: mu.emu_start(addr,RET,count=40_000_000); st='OK'
except UcError as e: st='ERR:'+str(e)[:24]
cnt=rdi(t+0x44); buf=rdi(t+0x58); ln=rdf(t+0x4c); idx=rdi(t+0x38)
pts=[]
if buf and 0<cnt<2000:
    for i in range(cnt):
        b=buf+i*0xa8
        pts.append([round(rdf(b+0x30),4),round(rdf(b+0x34),4),round(rdf(b+0x38),4),round(rdf(b+0x90),4),round(rdf(b+0x94),4),round(rdf(b+0x98),4),round(rdf(b+0x9c),4),round(rdf(b+0xa0),4)])
print(json.dumps({'st':st,'idx':idx,'count':cnt,'length':round(ln,3),'pts':pts}))

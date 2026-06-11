#!/usr/bin/env python3
"""
Snail Mail (.dat) archive extractor — a faithful port of the METHOD-0 branch of
Luigi Auriemma's `snail_mail.bms` (QuickBMS). The archive is obfuscated with a
fixed 256-byte XOR table; each entry is (name_offset, offset, size).

This is a TOOL (pure Python stdlib, no dependencies). It does not contain any of
the game's content — point it at YOUR OWN copy of the game's SnailMail.dat:

    python3 tools/extract_dat.py "path/to/SnailMail.dat" extracted

Then stage the web-usable files with tools/stage_assets.sh (or run ./install.sh
which does the whole pipeline). The extracted assets are the user's own copy and
are gitignored — never redistributed.
"""
import os, sys, struct

XOR_KEY = bytes.fromhex(
    "000202001c163624584a7a58b48eeecc30127250ac86a654083aea88441ede9c"
    "6022e2a07c36d68438ea9ab8146ece2c90f252b00c66c674e81a8a28a43ebe3c"
    "c042c240dc56f664980aba1874ce2e8cf052b2106cc6e69448faaa4804de9e5c"
    "20e2a2603cf69644782adaf8d42e0e6c50b292f0cc260634285a4a68647e7e7c"
    "808282809c96b6a4d8cafad8340e6e4cb092f2d02c0626d488ba6a08c49e5e1c"
    "e0a26220fcb65604b86a1a3894ee4eac1072d2308ce646f4689a0aa824be3ebc"
    "40c242c05cd676e4188a3a98f44eae0c70d23290ec466614c87a2ac8845e1edc"
    "a06222e0bc7616c4f8aa5a7854ae8eecd03212704ca686b4a8dacae8e4fefefc"
)
assert len(XOR_KEY) == 256


def dexor(data):
    k = XOR_KEY
    return bytes(b ^ k[i & 255] for i, b in enumerate(data))


def safe_name(name):
    name = name.replace("\\", "/").lstrip("/")
    parts = [p for p in name.split("/") if p not in ("", ".", "..") and ":" not in p]
    return "/".join(parts)


def extract(dat_path, out_dir):
    raw = open(dat_path, "rb").read()
    dec = dexor(raw)
    asize = len(dec)

    files = struct.unpack_from("<I", dec, 0)[0]

    # detect METHOD2 (6-long entries) vs simple (3-long): read entry0 as 6
    # longs and test whether the 6th is the literal zero field.
    e = struct.unpack_from("<6I", dec, 4)
    method2 = 1 if e[5] == 0 else 0
    stride = 6 if method2 else 3

    def name_at(p):
        if 0 <= p < asize:
            z = dec.find(b"\x00", p)
            return dec[p:z if z >= 0 else asize].decode("latin1", "replace")
        return ""

    off = 4
    written = skipped = 0
    by_ext = {}
    manifest = []
    for _ in range(files):
        name_off, offset, size = struct.unpack_from("<3I", dec, off)
        if method2:
            zsize, _dummy, _zero = struct.unpack_from("<3I", dec, off + 12)
            size = zsize
        off += stride * 4

        name = safe_name(name_at(name_off))
        if not name or size == 0 or offset == 0 or offset + size > asize:
            skipped += 1
            continue

        blob = dec[offset:offset + size]
        # defensive: a few Sandlot builds zip individual entries
        if blob[:4] == b"PK\x03\x04":
            try:
                import io, zipfile
                zf = zipfile.ZipFile(io.BytesIO(blob))
                blob = zf.read(zf.namelist()[0])
            except Exception:
                pass

        dst = os.path.join(out_dir, name)
        os.makedirs(os.path.dirname(dst) or out_dir, exist_ok=True)
        with open(dst, "wb") as f:
            f.write(blob)
        written += 1
        ext = (os.path.splitext(name)[1] or "(none)").lower()
        by_ext[ext] = by_ext.get(ext, 0) + 1
        manifest.append((name, len(blob)))

    print(f"  method2={method2} stride={stride}  FILES={files}")
    print(f"  written={written}  skipped={skipped}")
    print("  by extension:", dict(sorted(by_ext.items(), key=lambda kv: -kv[1])))
    with open(os.path.join(out_dir, "_manifest.txt"), "w") as f:
        for n, s in manifest:
            f.write(f"{s:9d}  {n}\n")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    extract(sys.argv[1], sys.argv[2])

#!/usr/bin/env python3
"""
Up-res the original TGA textures into a mirrored HD PNG pack the web build can
swap in via `window.SNAIL_CONFIG.texturePack = 'hd'` (see src/assets.js
resolveTextureUrl). For every public/assets/**/*.TGA it writes
public/assets-hd/<same path>.png at SCALE x, with a high-quality Lanczos
resample plus a light unsharp mask so the 2004 art reads crisper without the
blocky look. Alpha is preserved.

This is a BASELINE up-res (smoothing + sharpening, no new detail). For true
detail-adding super-resolution, point an AI upscaler (e.g. Real-ESRGAN) at the
same public/assets tree and write its PNGs to public/assets-hd/ instead — the
engine seam is identical.

Run with the venv Pillow:  /tmp/reve/bin/python tools/upres_textures.py
Both public/assets and public/assets-hd are the user's own extracted art and
are gitignored (never redistributed).
"""
import os
import sys
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "assets")
DST = os.path.join(ROOT, "public", "assets-hd")
SCALE = 2          # upscale factor
MAX_DIM = 1024     # don't blow tiny art up past this on the long edge

def upres_one(src_path, dst_path):
    img = Image.open(src_path)
    img = img.convert("RGBA" if ("A" in img.getbands() or img.mode in ("P", "LA")) else "RGB")
    w, h = img.size
    tw, th = w * SCALE, h * SCALE
    longest = max(tw, th)
    if longest > MAX_DIM:
        k = MAX_DIM / longest
        tw, th = max(1, round(tw * k)), max(1, round(th * k))
    big = img.resize((tw, th), Image.LANCZOS)
    # light unsharp so edges/text stay legible after the smooth resample
    big = big.filter(ImageFilter.UnsharpMask(radius=1.2, percent=80, threshold=2))
    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    big.save(dst_path, "PNG", optimize=True)
    return (w, h), (tw, th)

def main():
    if not os.path.isdir(SRC):
        print("no public/assets — run tools/stage_assets.sh first", file=sys.stderr)
        return 1
    n = 0
    skipped = 0
    for dirpath, _dirs, files in os.walk(SRC):
        for f in files:
            if not f.lower().endswith(".tga"):
                continue
            src_path = os.path.join(dirpath, f)
            rel = os.path.relpath(src_path, SRC)
            rel_png = os.path.splitext(rel)[0] + ".png"   # preserve path case, .png ext
            dst_path = os.path.join(DST, rel_png)
            try:
                (sw, sh), (dw, dh) = upres_one(src_path, dst_path)
                n += 1
                if n <= 6 or n % 25 == 0:
                    print(f"  {rel}  {sw}x{sh} -> {dw}x{dh}")
            except Exception as e:  # noqa
                skipped += 1
                print(f"  SKIP {rel}: {e}", file=sys.stderr)
    print(f"upres: wrote {n} PNG textures to public/assets-hd/ ({skipped} skipped)")
    return 0

if __name__ == "__main__":
    sys.exit(main())

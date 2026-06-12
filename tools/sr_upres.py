#!/usr/bin/env python3
"""
True detail-adding super-resolution of the original TGA textures into the
mirrored HD PNG pack the web build swaps in (window.SNAIL_CONFIG.texturePack =
'hd', see src/assets.js resolveTextureUrl). For every public/assets/**/*.TGA it
writes public/assets-hd/<same path>.png (path case preserved, .png ext)
upscaled 4x with Real-ESRGAN x4plus running on the GPU (CUDA).

Method: the RRDBNet x4 architecture is defined inline and loaded from the
official RealESRGAN_x4plus.pth weights (params_ema). This avoids the
basicsr/realesrgan package's import friction (functional_tensor / numpy 2 /
torchvision) while being the exact same model. Tiled inference keeps VRAM
bounded for the larger plates.

ALPHA: Real-ESRGAN x4plus is RGB-only. For textures with an alpha channel we
upscale the RGB through the model AND upscale the alpha as a 3-channel grey
image through the same model, then take its luma back as the alpha plane and
recombine. This keeps soft particle/sprite edges (SPARK, PARTICLEEXPLODE-*,
etc.) instead of nearest/box-resizing the mask.

4x upscale, capped so the long edge never exceeds MAX_DIM (downscaled with
Lanczos after SR if the 4x result is larger). Tiny sprites get the full 4x.

Run:  .venv-sr/bin/python tools/sr_upres.py
Both public/assets and public/assets-hd are the user's own extracted art and
are gitignored (never redistributed).
"""
import os
import sys
import math
import time
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "assets")
DST = os.path.join(ROOT, "public", "assets-hd")
WEIGHTS = os.path.join(ROOT, ".venv-sr", "weights", "RealESRGAN_x4plus.pth")

SCALE = 4          # native model scale
MAX_DIM = 2048     # cap the long edge of the output
TILE = 256         # input tile size (px) for tiled inference
TILE_PAD = 16      # overlap padding per tile to avoid seams


# --------------------------------------------------------------------------
# RRDBNet architecture (Real-ESRGAN x4plus). Matches basicsr's RRDBNet so the
# official params_ema state_dict loads cleanly.
# --------------------------------------------------------------------------
def make_layer(block, n_layers, **kw):
    return nn.Sequential(*[block(**kw) for _ in range(n_layers)])


class ResidualDenseBlock(nn.Module):
    def __init__(self, num_feat=64, num_grow_ch=32):
        super().__init__()
        self.conv1 = nn.Conv2d(num_feat, num_grow_ch, 3, 1, 1)
        self.conv2 = nn.Conv2d(num_feat + num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv3 = nn.Conv2d(num_feat + 2 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv4 = nn.Conv2d(num_feat + 3 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv5 = nn.Conv2d(num_feat + 4 * num_grow_ch, num_feat, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, num_feat, num_grow_ch=32):
        super().__init__()
        self.rdb1 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb2 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb3 = ResidualDenseBlock(num_feat, num_grow_ch)

    def forward(self, x):
        out = self.rdb1(x)
        out = self.rdb2(out)
        out = self.rdb3(out)
        return out * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, num_in_ch=3, num_out_ch=3, scale=4, num_feat=64,
                 num_block=23, num_grow_ch=32):
        super().__init__()
        self.scale = scale
        self.conv_first = nn.Conv2d(num_in_ch, num_feat, 3, 1, 1)
        self.body = make_layer(RRDB, num_block, num_feat=num_feat,
                               num_grow_ch=num_grow_ch)
        self.conv_body = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_hr = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_last = nn.Conv2d(num_feat, num_out_ch, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        feat = self.conv_first(x)
        body_feat = self.conv_body(self.body(feat))
        feat = feat + body_feat
        feat = self.lrelu(self.conv_up1(
            F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(
            F.interpolate(feat, scale_factor=2, mode='nearest')))
        out = self.conv_last(self.lrelu(self.conv_hr(feat)))
        return out


# --------------------------------------------------------------------------
# Tiled inference: split the input into TILE-sized tiles with TILE_PAD overlap,
# run each through the model, stitch back. Keeps VRAM bounded and avoids OOM on
# the bigger plates.
# --------------------------------------------------------------------------
@torch.no_grad()
def sr_tensor(model, img, device, scale=SCALE, tile=TILE, pad=TILE_PAD):
    # img: float tensor [1,3,H,W] in [0,1] on device
    b, c, h, w = img.shape
    if h <= tile and w <= tile:
        return model(img).clamp_(0, 1)

    out = torch.empty((b, c, h * scale, w * scale), device=device)
    n_y = math.ceil(h / tile)
    n_x = math.ceil(w / tile)
    for iy in range(n_y):
        for ix in range(n_x):
            y0 = iy * tile
            x0 = ix * tile
            y1 = min(y0 + tile, h)
            x1 = min(x0 + tile, w)
            # padded input region
            py0 = max(y0 - pad, 0)
            px0 = max(x0 - pad, 0)
            py1 = min(y1 + pad, h)
            px1 = min(x1 + pad, w)
            in_tile = img[:, :, py0:py1, px0:px1]
            out_tile = model(in_tile).clamp_(0, 1)
            # crop off the padding from the (scaled) output
            cy0 = (y0 - py0) * scale
            cx0 = (x0 - px0) * scale
            cy1 = cy0 + (y1 - y0) * scale
            cx1 = cx0 + (x1 - x0) * scale
            out[:, :, y0 * scale:y1 * scale, x0 * scale:x1 * scale] = \
                out_tile[:, :, cy0:cy1, cx0:cx1]
    return out


def to_tensor(arr, device):
    # arr: HxWx3 uint8 -> [1,3,H,W] float on device
    t = torch.from_numpy(np.ascontiguousarray(arr)).to(device).permute(2, 0, 1).unsqueeze(0).float() / 255.0
    return t


def to_uint8(t):
    # t: [1,3,H,W] float -> HxWx3 uint8
    a = t.squeeze(0).permute(1, 2, 0).clamp(0, 1).mul(255).round().byte().cpu().numpy()
    return a


def cap_long_edge(pil_img):
    w, h = pil_img.size
    longest = max(w, h)
    if longest > MAX_DIM:
        k = MAX_DIM / longest
        nw, nh = max(1, round(w * k)), max(1, round(h * k))
        return pil_img.resize((nw, nh), Image.LANCZOS)
    return pil_img


def upres_one(model, device, src_path, dst_path):
    img = Image.open(src_path)
    has_alpha = ("A" in img.getbands()) or img.mode in ("P", "LA", "RGBA")
    img = img.convert("RGBA" if has_alpha else "RGB")
    arr = np.asarray(img)

    rgb = arr[:, :, :3]
    rgb_sr = to_uint8(sr_tensor(model, to_tensor(rgb, device), device))

    if has_alpha:
        a = arr[:, :, 3]
        a3 = np.repeat(a[:, :, None], 3, axis=2)  # feed grey through model
        a_sr3 = to_uint8(sr_tensor(model, to_tensor(a3, device), device))
        a_sr = a_sr3[:, :, 0]
        out = np.dstack([rgb_sr, a_sr])
        out_img = Image.fromarray(out, "RGBA")
    else:
        out_img = Image.fromarray(rgb_sr, "RGB")

    out_img = cap_long_edge(out_img)
    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    out_img.save(dst_path, "PNG", optimize=True)
    return img.size, out_img.size, has_alpha


def main():
    if not os.path.isdir(SRC):
        print("no public/assets — run tools/stage_assets.sh first", file=sys.stderr)
        return 1
    if not torch.cuda.is_available():
        print("CUDA not available — refusing to run on CPU", file=sys.stderr)
        return 2

    device = torch.device("cuda")
    print("device:", torch.cuda.get_device_name(0))
    model = RRDBNet(3, 3, scale=4, num_feat=64, num_block=23, num_grow_ch=32)
    sd = torch.load(WEIGHTS, map_location="cpu", weights_only=True)
    sd = sd.get("params_ema", sd.get("params", sd))
    model.load_state_dict(sd, strict=True)
    model.eval().to(device)

    # collect work
    work = []
    for dirpath, _dirs, files in os.walk(SRC):
        for f in files:
            if f.lower().endswith(".tga"):
                sp = os.path.join(dirpath, f)
                rel = os.path.relpath(sp, SRC)
                rel_png = os.path.splitext(rel)[0] + ".png"
                work.append((sp, os.path.join(DST, rel_png), rel))
    work.sort(key=lambda x: x[2])

    n = 0
    skipped = 0
    n_alpha = 0
    t0 = time.time()
    for sp, dp, rel in work:
        try:
            (sw, sh), (dw, dh), ha = upres_one(model, device, sp, dp)
            n += 1
            if ha:
                n_alpha += 1
            tag = " [A]" if ha else ""
            print(f"  {rel}  {sw}x{sh} -> {dw}x{dh}{tag}", flush=True)
        except Exception as e:  # noqa
            skipped += 1
            print(f"  SKIP {rel}: {e}", file=sys.stderr, flush=True)
    dt = time.time() - t0
    print(f"\nsr-upres: wrote {n} PNG textures ({n_alpha} with alpha) to "
          f"public/assets-hd/ in {dt:.1f}s ({skipped} skipped)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

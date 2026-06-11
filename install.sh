#!/usr/bin/env bash
#
# Snail Mail Remastered — one-command setup.
#
# This remaster ships only CODE. To play it you need the ORIGINAL game's assets
# (art / audio / 3D models / level data), which are extracted from a copy of the
# 2004 game. This script wires up the whole pipeline: install deps → obtain the
# game → extract + stage assets → (optional) build the HD texture pack → build.
#
# Usage:
#   ./install.sh                 # interactive: finds or offers to download the game
#   ./install.sh --dat PATH      # use an existing SnailMail.dat you already have
#   ./install.sh --download      # non-interactively download the game from archive.org
#   ./install.sh --dev           # after setup, start the dev server (npm run dev)
#   ./install.sh --no-hd         # skip generating the upscaled HD texture pack
#   ./install.sh --help
#
# The game is the property of Sandlot Games / Alpha72 (© 2004). Use your own
# copy. Extracted assets are gitignored and must not be redistributed.
set -euo pipefail
cd "$(dirname "$0")"

# ---- pretty output --------------------------------------------------------
if [ -t 1 ]; then B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; C=$'\033[36m'; R=$'\033[31m'; Z=$'\033[0m'; else B=; G=; Y=; C=; R=; Z=; fi
step() { echo; echo "${B}${C}▸ $*${Z}"; }
ok()   { echo "  ${G}✓${Z} $*"; }
warn() { echo "  ${Y}!${Z} $*"; }
die()  { echo "${R}✗ $*${Z}" >&2; exit 1; }

IA_ITEM="snail-mail_202412"
IA_ZIP_URL="https://archive.org/download/${IA_ITEM}/Snail%20Mail.zip"
IA_PAGE="https://archive.org/details/${IA_ITEM}"
ZIP_PW="2004"   # publicly documented password for the archived zip

DAT=""; DO_DOWNLOAD=0; START_DEV=0; MAKE_HD=1; ZIP_IN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dat) DAT="${2:-}"; shift 2;;
    --zip) ZIP_IN="${2:-}"; shift 2;;
    --download|--yes|-y) DO_DOWNLOAD=1; shift;;
    --dev) START_DEV=1; shift;;
    --no-hd) MAKE_HD=0; shift;;
    --help|-h) sed -n '2,22p' "$0"; exit 0;;
    *) die "unknown option: $1 (try --help)";;
  esac
done

echo "${B}🐌  Snail Mail Remastered — setup${Z}"

# ---- 1. prerequisites -----------------------------------------------------
step "Checking prerequisites"
command -v node >/dev/null || die "Node.js is required (v18+). Install from https://nodejs.org"
command -v npm  >/dev/null || die "npm is required (ships with Node.js)."
command -v python3 >/dev/null || die "python3 is required (for the asset extractor)."
ok "node $(node -v), npm $(npm -v), $(python3 --version)"

# ---- 2. npm deps ----------------------------------------------------------
step "Installing npm dependencies"
if [ -f package-lock.json ]; then npm ci || npm install; else npm install; fi
ok "dependencies installed"

# ---- 3. obtain SnailMail.dat ---------------------------------------------
find_dat() {  # echo a path to a SnailMail.dat if we can find one
  for p in "$DAT" "exe_src/Snail Mail/SnailMail.dat" "game/SnailMail.dat" "SnailMail.dat"; do
    [ -n "$p" ] && [ -f "$p" ] && { echo "$p"; return; }
  done
  find . -maxdepth 5 -iname 'SnailMail.dat' 2>/dev/null | head -1
}

unzip_to() {  # unzip_to <zip> <dest>  — tries 7z (handles AES), then unzip, then python
  local zip="$1" dest="$2"; mkdir -p "$dest"
  if command -v 7z >/dev/null 2>&1;  then 7z x -p"$ZIP_PW" -o"$dest" "$zip" -y >/dev/null 2>&1 && return 0; fi
  if command -v 7za >/dev/null 2>&1; then 7za x -p"$ZIP_PW" -o"$dest" "$zip" -y >/dev/null 2>&1 && return 0; fi
  if command -v unzip >/dev/null 2>&1; then unzip -P "$ZIP_PW" -o "$zip" -d "$dest" >/dev/null 2>&1 && return 0; fi
  python3 - "$zip" "$dest" "$ZIP_PW" <<'PY' && return 0
import sys, zipfile
z, dest, pw = sys.argv[1], sys.argv[2], sys.argv[3]
with zipfile.ZipFile(z) as zf:
    zf.extractall(dest, pwd=pw.encode())
PY
  return 1
}

step "Locating the original game"
DAT="$(find_dat || true)"
if [ -z "$DAT" ]; then
  warn "No SnailMail.dat found locally."
  echo "  The original game is archived at: ${C}${IA_PAGE}${Z}"
  if [ "$DO_DOWNLOAD" -ne 1 ] && [ -t 0 ]; then
    read -r -p "  Download it from archive.org now (~11 MB)? [y/N] " ans
    case "$ans" in y|Y|yes) DO_DOWNLOAD=1;; esac
  fi
  if [ -n "$ZIP_IN" ] || [ "$DO_DOWNLOAD" -eq 1 ]; then
    mkdir -p .game
    ZIP="${ZIP_IN:-.game/SnailMail.zip}"
    if [ -z "$ZIP_IN" ]; then
      echo "  Downloading ${IA_ZIP_URL} ..."
      if command -v curl >/dev/null 2>&1; then curl -fL --retry 3 -o "$ZIP" "$IA_ZIP_URL";
      elif command -v wget >/dev/null 2>&1; then wget -q -O "$ZIP" "$IA_ZIP_URL";
      else die "need curl or wget to download (or pass --zip PATH / --dat PATH)."; fi
      ok "downloaded $(du -h "$ZIP" | cut -f1)"
    fi
    echo "  Unzipping (password: ${ZIP_PW}) ..."
    unzip_to "$ZIP" .game/extracted || die "could not unzip. Install p7zip (7z) for AES zips, or unzip it manually and pass --dat."
    DAT="$(find .game/extracted -iname 'SnailMail.dat' 2>/dev/null | head -1 || true)"
    [ -n "$DAT" ] || die "unzipped, but no SnailMail.dat inside. Pass --dat PATH to the .dat."
  else
    die "No game assets. Re-run with --download, or --dat \"path/to/SnailMail.dat\"."
  fi
fi
ok "using $DAT"

# ---- 4. extract + stage assets -------------------------------------------
step "Extracting + staging game assets → public/assets"
bash tools/stage_assets.sh "$DAT"

# bake the level/segment JSON from the freshly-extracted text (already committed,
# but regenerate so a fresh extract stays authoritative).
if [ -d extracted/SEGMENTS ] && [ -d extracted/LEVELS ]; then
  node tools/bakeSegments.mjs >/dev/null 2>&1 && node tools/bakeChallenge.mjs >/dev/null 2>&1 \
    && ok "re-baked level/segment data" || warn "baker skipped (using committed JSON)"
fi

# ---- 5. HD texture pack (optional) ---------------------------------------
if [ "$MAKE_HD" -eq 1 ]; then
  step "Building the HD texture pack (upscaled PNGs)"
  if [ ! -x .venv/bin/python ]; then python3 -m venv .venv >/dev/null 2>&1 || warn "python venv unavailable"; fi
  if [ -x .venv/bin/python ]; then
    .venv/bin/pip install --quiet --disable-pip-version-check Pillow >/dev/null 2>&1 || warn "could not install Pillow"
    if .venv/bin/python -c "import PIL" 2>/dev/null; then
      .venv/bin/python tools/upres_textures.py && ok "HD pack ready (public/assets-hd)"
    else
      warn "Pillow unavailable — skipping HD pack (the game runs fine on originals)."
    fi
  else
    warn "skipping HD pack (no venv). Run later: python3 tools/upres_textures.py"
  fi
else
  warn "HD pack skipped (--no-hd). The build will use the original textures."
fi

# ---- 6. build / run -------------------------------------------------------
step "Building the web client"
npm run build && ok "built → dist/"

echo
echo "${B}${G}✓ Setup complete!${Z}"
echo "  ${B}Play (dev):${Z}     npm run dev        → http://localhost:5173"
echo "  ${B}Serve build:${Z}    node server/server.js   (serves dist/ + multiplayer at /ws)"
echo
if [ "$START_DEV" -eq 1 ]; then step "Starting dev server (Ctrl-C to stop)"; exec npm run dev; fi

#!/usr/bin/env bash
# Extract the original Snail Mail assets from your own copy of the game and
# stage the web-usable ones (textures, audio, level data) into public/assets.
#
# Usage:  bash tools/stage_assets.sh ["path/to/SnailMail.dat"]
#
# These are the user's own game files; they are NOT committed to the repo
# (see .gitignore). Run this once after cloning to populate public/assets.
set -euo pipefail
cd "$(dirname "$0")/.."

DAT="${1:-exe_src/Snail Mail/SnailMail.dat}"
if [ ! -f "$DAT" ]; then
  echo "SnailMail.dat not found at: $DAT"
  echo "Pass the path to your installed game's SnailMail.dat as an argument."
  exit 1
fi

echo "→ Extracting $DAT ..."
# committed extractor (tools/) on a fresh clone; fall back to the dev copy.
if [ -f tools/extract_dat.py ]; then
  python3 tools/extract_dat.py "$DAT" extracted
else
  python3 exe_src/extract_full.py "$DAT" extracted
fi

echo "→ Staging web assets into public/assets ..."
rm -rf public/assets
mkdir -p public/assets
cd extracted
# preserve directory structure (TRACK textures live under OBJECTS/WORLD00/ etc.)
find MUSIC VOICE SFX2 GALAXY BACKGROUNDS SPRITES OBJECTS LEVELS SEGMENTS INTRO X \
  -type f \( -iname '*.ogg' -o -iname '*.tga' -o -iname '*.txt' -o -iname '*.x2' \) \
  -exec cp --parents {} ../public/assets/ \; 2>/dev/null || true
cd ..

echo "✓ Staged $(find public/assets -type f | wc -l) files ($(du -sh public/assets | cut -f1))."

# Snail Mail Remastered

A browser remaster of the 2004 Sandlot Games racer *Snail Mail* — built with
[Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/). You play
Turbo, the fastest snail in the galaxy, racing the mail-highway through space:
**steer + fire your shell-cannon**, scoop up every parcel, dodge slugs, salt
and pillars, grab weapon-upgrade rings, and reach the mail stop.

Single-player **Story / Arcade / Time-Trial** modes plus **online multiplayer
racing** with ghost opponents.

> **Assets note.** The art, audio and 3D models are the original game's assets,
> extracted from the owner's own copy of *Snail Mail* for this personal
> remaster. They are **not** committed to this repo and should not be
> redistributed. Regenerate them locally from your own `SnailMail.dat`
> (see *Assets* below).

---

## Quick start

```bash
npm install
bash tools/stage_assets.sh "exe_src/Snail Mail/SnailMail.dat"   # extract + stage assets
npm run dev                                                     # http://localhost:5173
```

## Controls

| Action | Keys |
| --- | --- |
| Steer | ← / → · A / D · or **move the mouse** |
| Fire cannon | hold **Space** · left-click · J |
| Pause | Esc / P |
| Mute | M |

Touch controls (left/right/fire zones) are enabled automatically on touch
devices.

## Modes

- **Story** — the postal route across the galaxies, with an intro crawl and
  interludes (original narrative).
- **Arcade** — endless escalating run.
- **Time Trial** — race the clock for bronze/silver/gold medals.
- **Online Race** — up to 6 snails on the same track; first to the mail stop
  wins (see *Multiplayer* below).

---

## Assets pipeline

`SnailMail.dat` is the original game's archive (a fixed 256-byte XOR table —
the format documented by Luigi Auriemma's `snail_mail.bms`). The extractor and
staging script live in `exe_src/` and `tools/`:

```bash
# extract all 603 files to ./extracted and stage the web-usable ones to ./public/assets
bash tools/stage_assets.sh "path/to/SnailMail.dat"
```

Staged: OGG audio (music/voice/SFX), TGA textures, `.X2` meshes, and the
level/segment config. Browsers play OGG natively; TGA loads via three's
`TGALoader`; `.X2` (DirectX-`.x`) meshes load via `src/track/xloader.js`.

### Higher-resolution textures (optional)
Texture lookups go through `resolveTextureUrl()` in `src/assets.js`. To swap in
an upscaled set, set `window.SNAIL_CONFIG.texturePack = 'hd'` and mirror the
PNGs under `/assets-hd/...`, or pass a function for a remote up-res API.

---

## Build & deploy (DigitalOcean)

The repo ships a single Node process (`server/server.js`) that serves the built
client **and** hosts the multiplayer WebSocket — ideal for a droplet.

```bash
# on the droplet (Node 18+):
npm ci
bash tools/stage_assets.sh "path/to/SnailMail.dat"   # populate public/assets
npm run build                                         # -> dist/
PORT=8080 node server/server.js                       # serves dist + /ws
```

Put it behind nginx with TLS (so the client uses `wss://`) and keep it alive
with pm2 or a systemd unit, e.g.:

```ini
# /etc/systemd/system/snailmail.service
[Service]
WorkingDirectory=/home/snail/snailmail
ExecStart=/usr/bin/node server/server.js
Environment=PORT=8080
Restart=always
```

The client auto-detects the server: same-origin `/ws` in production, or
`ws://<host>:8080/ws` when run from a Vite dev port. Override with
`window.SNAIL_CONFIG.serverUrl`.

---

## Multiplayer

- `server/server.js` — rooms, ready-up, synced countdown, position relay,
  finish ordering. Everyone races the same level id + seed, so each client
  builds an identical track locally and only positions are relayed.
- Open **Online Race** from the menu, set a name, ready up; the race starts when
  2+ players are ready. You see opponents as ghost snails with name tags and a
  live leaderboard.

---

## Project layout

```
src/
  engine/      renderer, input, audio (original OGG + synth fallback)
  track/       ribbon track generator, environment, .X2 mesh loader
  game/        player, entities, weapons, level, camera, fx, game controller
  ui/          HUD + menu screens
  net/         online race client + ghost snails
  data/        themes, worlds/levels (from original tuning), story
server/        Node HTTP + WebSocket race server
tools/         asset staging
exe_src/       .dat extractor (your own game files live here, gitignored)
```

## Scripts

| Command | What |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | production build → `dist/` |
| `npm run preview` | preview the build |
| `node server/server.js` | serve `dist/` + multiplayer WebSocket |

---

*A fan remaster. Original *Snail Mail* © Sandlot Games / Alpha72 Games.*

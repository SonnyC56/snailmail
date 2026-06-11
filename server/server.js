/**
 * Snail Mail Remastered — online race server.
 *
 * One Node process: serves the built client (dist/) over HTTP and runs race
 * rooms over WebSocket at /ws. Drop straight onto a DigitalOcean droplet:
 *   npm run build && node server/server.js
 *
 * Lobby model: players can Quick Play (auto-join an open room), Create a named
 * room (becoming host), or Join a room from the list. The host starts the race
 * (or it auto-starts when everyone's ready). Everyone races the same level id +
 * seed, so each client builds an identical track locally and we relay only
 * positions.
 *
 * Protocol (JSON):
 *   client → server: hello{name} listRooms quickPlay createRoom{room} joinRoom{room}
 *                    ready unready startRace rename{name} pos{s,x,st,pr} finish{time} leave chat{msg}
 *   server → client: hi{id} rooms{rooms} welcome{id,room,host,players,raceLevel}
 *                    players{players,host} countdown{n} start{seed,raceLevel}
 *                    pos{id,...} finished{id,place,time} ended{results} error{msg} left{id}
 */

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const PORT = process.env.PORT || 8080;
const MAX_PLAYERS = 6;
const RACE_LEVELS = ['g0-l0', 'g0-l1', 'g1-l0'];

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.tga': 'image/x-tga', '.ogg': 'audio/ogg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.x2': 'text/plain',
};

async function serveStatic(req, res) {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/') path = '/index.html';
    let file = normalize(join(DIST, path));
    if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
    try { await stat(file); } catch { file = join(DIST, 'index.html'); }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('Not found'); }
}

const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server, path: '/ws' });

let nextId = 1;
let seedCounter = 1234;
const rooms = new Map(); // name -> { name, players:Map, state, seed, raceLevel, finishOrder, host }

function getRoom(name) {
  if (!rooms.has(name)) rooms.set(name, { name, players: new Map(), state: 'lobby', seed: 0, raceLevel: RACE_LEVELS[0], finishOrder: [], host: null });
  return rooms.get(name);
}
function findOpenRoom() {
  for (const r of rooms.values()) if (r.state === 'lobby' && r.players.size > 0 && r.players.size < MAX_PLAYERS) return r;
  return getRoom('Race ' + (++seedCounter % 1000));
}
function roomsList() {
  return [...rooms.values()]
    .filter(r => r.players.size > 0)
    .map(r => ({ name: r.name, count: r.players.size, max: MAX_PLAYERS, state: r.state }));
}
function send(ws, obj) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); }
function broadcast(room, obj, exceptId) { for (const p of room.players.values()) if (p.id !== exceptId) send(p.ws, obj); }
function playerList(room) { return [...room.players.values()].map(p => ({ id: p.id, name: p.name, ready: p.ready, progress: p.progress, finished: p.finished, place: p.place, host: p.id === room.host })); }
function broadcastRooms() { const list = roomsList(); for (const ws of wss.clients) send(ws, { t: 'rooms', rooms: list }); }

function maybeAutoStart(room) {
  if (room.state !== 'lobby') return;
  const ps = [...room.players.values()];
  if (ps.length >= 2 && ps.every(p => p.ready)) startCountdown(room);
}
function startCountdown(room) {
  if (room.state !== 'lobby') return;
  const ps = [...room.players.values()];
  if (ps.length < 2) return;
  room.state = 'countdown';
  room.seed = ++seedCounter;
  room.raceLevel = RACE_LEVELS[seedCounter % RACE_LEVELS.length];
  room.finishOrder = [];
  for (const p of room.players.values()) { p.finished = false; p.place = 0; p.progress = 0; }
  broadcast(room, { t: 'start', seed: room.seed, raceLevel: room.raceLevel });
  broadcastRooms();
  let n = 3;
  broadcast(room, { t: 'countdown', n });
  const iv = setInterval(() => {
    n--; broadcast(room, { t: 'countdown', n });
    if (n <= 0) { clearInterval(iv); room.state = 'racing'; }
  }, 1000);
}
function checkRaceOver(room) {
  const ps = [...room.players.values()];
  if (ps.length && ps.every(p => p.finished)) endRace(room);
}
function endRace(room) {
  room.state = 'lobby';
  const results = room.finishOrder.map((id, i) => { const p = room.players.get(id); return { id, name: p?.name ?? '—', place: i + 1, time: p?.time ?? null }; });
  broadcast(room, { t: 'ended', results });
  for (const p of room.players.values()) p.ready = false;
  broadcast(room, { t: 'players', players: playerList(room), host: room.host });
  broadcastRooms();
}

wss.on('connection', (ws) => {
  let player = { id: nextId++, name: 'Snail', ws, ready: false, progress: 0, finished: false, place: 0, s: 0, x: 0, st: 'riding', time: null };
  let room = null;
  send(ws, { t: 'hi', id: player.id });
  send(ws, { t: 'rooms', rooms: roomsList() });

  const enterRoom = (r) => {
    if (r.players.size >= MAX_PLAYERS) { send(ws, { t: 'error', msg: 'Room is full' }); return; }
    if (r.state !== 'lobby') { send(ws, { t: 'error', msg: 'Race already in progress' }); return; }
    room = r;
    player.ready = false;
    room.players.set(player.id, player);
    if (!room.host) room.host = player.id;
    send(ws, { t: 'welcome', id: player.id, room: room.name, host: room.host, players: playerList(room), raceLevel: room.raceLevel });
    broadcast(room, { t: 'players', players: playerList(room), host: room.host }, player.id);
    broadcastRooms();
  };

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.t === 'hello') { player.name = (msg.name || 'Snail').slice(0, 16); return; }
    if (msg.t === 'listRooms') { send(ws, { t: 'rooms', rooms: roomsList() }); return; }
    if (msg.t === 'rename') { player.name = (msg.name || player.name).slice(0, 16); if (room) broadcast(room, { t: 'players', players: playerList(room), host: room.host }); return; }
    if (msg.t === 'quickPlay') { if (msg.name) player.name = msg.name.slice(0, 16); if (!room) enterRoom(findOpenRoom()); return; }
    if (msg.t === 'createRoom') { if (msg.name) player.name = msg.name.slice(0, 16); const rn = (msg.room || 'Room').slice(0, 20); if (rooms.has(rn) && rooms.get(rn).players.size) { send(ws, { t: 'error', msg: 'That room name is taken' }); return; } if (!room) enterRoom(getRoom(rn)); return; }
    if (msg.t === 'joinRoom') { if (msg.name) player.name = msg.name.slice(0, 16); const r = rooms.get(msg.room); if (!r || r.players.size === 0) { send(ws, { t: 'error', msg: 'Room no longer exists' }); return; } if (!room) enterRoom(r); return; }

    if (!room) return;
    switch (msg.t) {
      case 'ready': player.ready = true; broadcast(room, { t: 'players', players: playerList(room), host: room.host }); maybeAutoStart(room); break;
      case 'unready': player.ready = false; broadcast(room, { t: 'players', players: playerList(room), host: room.host }); break;
      case 'startRace': if (player.id === room.host) startCountdown(room); break;
      case 'pos': player.s = msg.s; player.x = msg.x; player.st = msg.st; player.progress = msg.pr ?? player.progress; broadcast(room, { t: 'pos', id: player.id, s: msg.s, x: msg.x, st: msg.st, pr: player.progress }, player.id); break;
      case 'finish': if (!player.finished) { player.finished = true; player.time = msg.time; player.progress = 1; room.finishOrder.push(player.id); player.place = room.finishOrder.length; broadcast(room, { t: 'finished', id: player.id, place: player.place, time: msg.time }); checkRaceOver(room); } break;
      case 'chat': broadcast(room, { t: 'chat', id: player.id, name: player.name, msg: String(msg.msg).slice(0, 120) }); break;
      case 'leave': leaveRoom(); break;
    }
  });

  const leaveRoom = () => {
    if (room) {
      room.players.delete(player.id);
      if (room.host === player.id) room.host = room.players.size ? [...room.players.keys()][0] : null;
      broadcast(room, { t: 'players', players: playerList(room), host: room.host });
      broadcast(room, { t: 'left', id: player.id });
      if (room.players.size === 0) rooms.delete(room.name);
      else if (room.state !== 'lobby') checkRaceOver(room);
      broadcastRooms();
    }
    room = null;
  };
  ws.on('close', leaveRoom);
  ws.on('error', leaveRoom);
});

server.listen(PORT, () => console.log(`Snail Mail Remastered server on :${PORT}  (HTTP + /ws)`));

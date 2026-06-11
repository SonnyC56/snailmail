/**
 * Online race client: a full lobby flow (Quick Play / Create Room / Join from
 * a live room list), an in-room lobby with player list + host start, synced
 * countdown, position relay, and ghost-snail rendering.
 *
 * Server URL: window.SNAIL_CONFIG.serverUrl, else same-origin /ws in
 * production or ws://<host>:8080/ws when run from a Vite dev port.
 */

import { GhostManager } from './ghosts.js';
import { formatTime } from '../utils.js';

function serverUrl() {
  const cfg = (typeof window !== 'undefined' && window.SNAIL_CONFIG) || {};
  if (cfg.serverUrl) return cfg.serverUrl;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (/^51\d\d$/.test(location.port)) return `ws://${location.hostname}:8080/ws`;
  return `${proto}//${location.host}/ws`;
}

export function startOnlineRace(game) {
  const session = new OnlineSession(game);
  game.online = session;
  session.connect();
}

class OnlineSession {
  constructor(game) {
    this.game = game;
    this.ws = null;
    this.id = null;
    this.roomName = null;
    this.host = null;
    this.players = [];
    this.rooms = [];
    this.ghosts = null;
    this.level = null;
    this.name = localStorage.getItem('snailx.name') || randomName();
    this._sendTimer = 0;
    this._finished = false;
    this._racing = false;
    this._screen = 'connecting';
    this._progress = {};
  }

  connect() {
    this.render();
    try { this.ws = new WebSocket(serverUrl()); }
    catch { this._screen = 'error'; this._error = 'Could not connect.'; this.render(); return; }
    this.ws.onopen = () => { this.send({ t: 'hello', name: this.name }); this._screen = 'home'; this.render(); this._roomPoll = setInterval(() => { if (this._screen === 'home') this.send({ t: 'listRooms' }); }, 2500); };
    this.ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data));
    this.ws.onclose = () => { if (this._racing) { this._screen = 'error'; this._error = 'Disconnected from race.'; this.render(); } };
    this.ws.onerror = () => { this._screen = 'error'; this._error = 'Connection failed — is the race server running?'; this.render(); };
  }

  send(o) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o)); }

  onMessage(m) {
    switch (m.t) {
      case 'hi': this.id = m.id; break;
      case 'rooms': this.rooms = m.rooms; if (this._screen === 'home') this.render(); break;
      case 'welcome': this.id = m.id; this.roomName = m.room; this.host = m.host; this.players = m.players; this._screen = 'lobby'; this.render(); break;
      case 'players': this.players = m.players; this.host = m.host ?? this.host; if (this._screen === 'lobby') this.render(); break;
      case 'start': this.beginRace(m.seed, m.raceLevel); break;
      case 'countdown': break; // local level runs its own countdown
      case 'pos': if (this.ghosts) { this.ghosts.add(m.id, nameOf(this.players, m.id)); this.ghosts.setPos(m.id, m.s, m.x, m.st); this._progress[m.id] = m.pr; } break;
      case 'finished': this._progress[m.id] = 1; break;
      case 'left': if (this.ghosts) this.ghosts.remove(m.id); this.players = this.players.filter(p => p.id !== m.id); break;
      case 'ended': this.showResults(m.results); break;
      case 'error': this._toast = m.msg; this.render(); setTimeout(() => { this._toast = null; }, 3000); break;
    }
  }

  // ---------- screens ----------
  render() {
    const root = this.game.uiRoot;
    root.innerHTML = '';
    const s = document.createElement('div');
    s.className = 'screen dim';
    const panel = document.createElement('div');
    panel.className = 'panel mp-panel';
    s.appendChild(panel);
    root.appendChild(s);
    this._panel = panel;
    if (this._toast) { const t = document.createElement('div'); t.className = 'mp-toast'; t.textContent = this._toast; panel.appendChild(t); }

    if (this._screen === 'connecting') this._home(panel, true);
    else if (this._screen === 'home') this._home(panel, false);
    else if (this._screen === 'lobby') this._lobby(panel);
    else if (this._screen === 'error') this._errorScreen(panel);
  }

  _h2(panel, text) { const h = document.createElement('h2'); h.textContent = text; panel.appendChild(h); }
  _btn(label, fn, cls = '') { const b = document.createElement('button'); b.className = `btn ${cls}`; b.textContent = label; b.onclick = () => { this.game.ctx.audio.click(); fn(); }; return b; }
  _row(...els) { const r = document.createElement('div'); r.className = 'btn-row'; r.append(...els); return r; }

  _nameField(panel) {
    const wrap = document.createElement('div');
    wrap.className = 'mp-namefield';
    wrap.innerHTML = `<label>Your name</label>`;
    const input = document.createElement('input');
    input.value = this.name; input.maxLength = 16; input.className = 'mp-input';
    input.onchange = () => { this.name = input.value.slice(0, 16) || 'Snail'; localStorage.setItem('snailx.name', this.name); this.send({ t: 'rename', name: this.name }); };
    wrap.appendChild(input);
    panel.appendChild(wrap);
  }

  _home(panel, connecting) {
    this._h2(panel, 'Online Race');
    if (connecting) { const p = document.createElement('div'); p.className = 'help-text'; p.style.textAlign = 'center'; p.textContent = 'Connecting to the race server…'; panel.appendChild(p); return; }
    this._nameField(panel);
    panel.appendChild(this._row(
      this._btn('Quick Play', () => this.send({ t: 'quickPlay', name: this.name })),
      this._btn('Create Room', () => this.promptCreate(), 'secondary'),
    ));

    const rl = document.createElement('div');
    rl.className = 'mp-rooms';
    const head = document.createElement('div'); head.className = 'mp-rooms-head'; head.textContent = 'Open Rooms'; rl.appendChild(head);
    if (!this.rooms.length) { const e = document.createElement('div'); e.className = 'mp-room-empty'; e.textContent = 'No rooms yet — Quick Play or Create one.'; rl.appendChild(e); }
    for (const r of this.rooms) {
      const row = document.createElement('button');
      row.className = 'mp-room';
      row.disabled = r.count >= r.max || r.state !== 'lobby';
      row.innerHTML = `<span class="mp-room-name">${esc(r.name)}</span><span class="mp-room-meta">${r.count}/${r.max}${r.state !== 'lobby' ? ' · racing' : ''}</span>`;
      row.onclick = () => { this.game.ctx.audio.click(); this.send({ t: 'joinRoom', name: this.name, room: r.name }); };
      rl.appendChild(row);
    }
    panel.appendChild(rl);
    panel.appendChild(this._row(this._btn('Back', () => this.leaveToMenu(), 'small secondary')));
  }

  promptCreate() {
    const name = (prompt('Room name:', `${this.name}'s Race`) || '').trim();
    if (name) this.send({ t: 'createRoom', name: this.name, room: name.slice(0, 20) });
  }

  _lobby(panel) {
    this._h2(panel, this.roomName || 'Race Lobby');
    const isHost = this.host === this.id;
    const me = this.players.find(p => p.id === this.id);

    const list = document.createElement('div');
    list.className = 'mp-players';
    for (const p of this.players) {
      const row = document.createElement('div');
      row.className = `mp-player ${p.id === this.id ? 'me' : ''}`;
      row.innerHTML = `<span class="mp-dot" style="background:${p.id === this.id ? '#ff8c1a' : '#3d92e0'}"></span>
        <span class="mp-pname">${esc(p.name)}${p.host ? ' 👑' : ''}${p.id === this.id ? ' (you)' : ''}</span>
        <span class="mp-pstate">${p.ready ? 'Ready' : '…'}</span>`;
      list.appendChild(row);
    }
    panel.appendChild(list);

    const hint = document.createElement('div');
    hint.className = 'help-text'; hint.style.textAlign = 'center';
    hint.textContent = isHost ? 'You are host. Start when ready (needs 2+ snails).' : 'Waiting for the host to start (race auto-starts when all ready).';
    panel.appendChild(hint);

    const btns = [this._btn(me?.ready ? 'Not Ready' : 'Ready!', () => this.send({ t: me?.ready ? 'unready' : 'ready' }))];
    if (isHost) btns.push(this._btn('Start Race', () => this.send({ t: 'startRace' }), 'secondary'));
    btns.push(this._btn('Leave', () => this.leaveToMenu(), 'small secondary'));
    panel.appendChild(this._row(...btns));
  }

  _errorScreen(panel) {
    this._h2(panel, 'Online Race');
    const p = document.createElement('div'); p.className = 'help-text'; p.style.textAlign = 'center';
    p.innerHTML = `${esc(this._error || 'Something went wrong.')}<br><br>Host your own server with <span class="key">node server/server.js</span>.`;
    panel.appendChild(p);
    panel.appendChild(this._row(this._btn('Back', () => this.leaveToMenu())));
  }

  // ---------- race ----------
  beginRace(seed, raceLevelId) {
    this._finished = false; this._racing = true; this._progress = {};
    clearInterval(this._roomPoll);
    this.game.startRaceLevel(raceLevelId, seed);
  }

  attachLevel(level) {
    this.level = level;
    this.ghosts = new GhostManager(this.game.ctx.scene, level.track);
    for (const p of this.players) if (p.id !== this.id) this.ghosts.add(p.id, p.name);
  }

  update(dt, level) {
    if (!this._racing || !level) return;
    this._sendTimer -= dt;
    if (this._sendTimer <= 0) {
      this._sendTimer = 1 / 12;
      this.send({ t: 'pos', s: +level.player.s.toFixed(2), x: +level.player.x.toFixed(2), st: level.player.state, pr: +level.progress.toFixed(3) });
      this._progress[this.id] = level.progress;
    }
    if (this.ghosts) this.ghosts.update(dt, level.time);
  }

  onLocalFinish(summary) {
    if (this._finished) return;
    this._finished = true;
    this.send({ t: 'finish', time: summary.time });
  }

  standings() {
    const rows = [{ id: this.id, name: this.name + ' (you)', progress: this.level ? this.level.progress : 0, you: true }];
    for (const p of this.players) { if (p.id === this.id) continue; rows.push({ id: p.id, name: p.name, progress: this._progress[p.id] ?? 0, you: false }); }
    rows.sort((a, b) => b.progress - a.progress);
    return rows;
  }

  showResults(results) {
    this._racing = false;
    if (this.ghosts) this.ghosts.clear();
    this.game.hud?.hide?.();
    this._screen = 'lobby';
    this.render();
    // overlay the results above the lobby
    const panel = this._panel;
    const res = document.createElement('div');
    res.className = 'mp-results';
    res.innerHTML = `<div class="mp-results-title">Race Results</div>` +
      results.map(r => `<div class="results-row"><span>${medal(r.place)} ${esc(r.name)}</span><span class="val">${r.time != null ? formatTime(r.time) : 'DNF'}</span></div>`).join('');
    panel.insertBefore(res, panel.children[1] || null);
  }

  leave() { this.send({ t: 'leave' }); if (this.ws) { try { this.ws.close(); } catch {} } if (this.ghosts) this.ghosts.clear(); clearInterval(this._roomPoll); this._racing = false; }
  leaveToMenu() { this.leave(); this.game.online = null; this.game.quitToMenu(); }
}

function nameOf(players, id) { return players.find(p => p.id === id)?.name || 'Snail'; }
function medal(place) { return place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : `${place}.`; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function randomName() {
  const a = ['Speedy', 'Turbo', 'Zippy', 'Dash', 'Comet', 'Rocket', 'Slick', 'Nitro'];
  const b = ['Shell', 'Snail', 'Slider', 'Racer', 'Streak'];
  return a[Math.floor(Math.random() * a.length)] + b[Math.floor(Math.random() * b.length)] + Math.floor(Math.random() * 90 + 10);
}

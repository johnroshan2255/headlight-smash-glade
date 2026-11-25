// Multiplayer client on Colyseus. Offline (no server reachable) = solo mode, where this browser
// is simply the host of its own private glade.
import { Client } from '@colyseus/sdk';

export class Net {
  constructor() {
    this.online = false;
    this.id = 'local';
    this.hostId = 'local';
    this.players = []; // roster from the server: { id, name, color, vehicle, hat, score }
    this.handlers = new Map();
    this.room = null;
    this.code = '';
    this.settings = { private: false, bots: 0, time: 8, map: 'endless' }; // the room's: hidden? how many bots (-1 = fill)? minutes per match
    this.match = null; // { n, endsAt, over, nextAt } in server time; serverNow() reads that clock
    this.clockOff = 0;
  }

  get isHost() { return this.hostId === this.id; }
  /** the server's clock (ms), from the offset measured on every match update */
  serverNow() { return Date.now() + this.clockOff; }
  setMatch(m) {
    if (!m) return;
    const off = m.now - Date.now();
    this.clockOff = this.match ? this.clockOff + (off - this.clockOff) * 0.3 : off;
    const fresh = !this.match || m.n !== this.match.n || m.over !== this.match.over || m.phase !== this.match.phase;
    this.match = m;
    if (fresh) this.emit('match', m);
  }

  on(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(fn); }
  emit(type, msg) { for (const fn of this.handlers.get(type) || []) fn(msg); }

  /** the server's http(s) address for wss://… (room list, health, accounts) */
  static httpBase(url) { return String(url).replace(/^ws/, 'http').replace(/\/$/, ''); }

  /** Where is the server? ?server=wss://... > build-time VITE_SERVER_URL > same origin (when our server hosts the page). */
  static async findServer() {
    const q = new URLSearchParams(location.search).get('server');
    if (q) return q;
    const env = import.meta.env.VITE_SERVER_URL;
    if (env) { // the game is hosted apart from its server (Vercel + Railway): make sure the server's up
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(`${Net.httpBase(env)}/health`, { signal: ctl.signal, cache: 'no-store' });
        clearTimeout(t);
        if (r.ok) return env;
      } catch { /* unreachable: solo */ }
      return null;
    }
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1500);
      const r = await fetch('/health', { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (r.ok && (await r.text()).trim() === 'ok') return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
    } catch { /* no server here */ }
    return null;
  }

  /** how: 'create' (a new room with these settings), 'join' (an existing room, by code) or
   *  'auto' (join, or create if there's none: the playtests' ?autostart, which also skips the lobby) */
  async connect(url, { how = 'auto', code = '', name, vehicle, hat, private: priv = false, bots = 0, time = 8, map = 'glade' }) {
    const client = new Client(url);
    const opts = { code, name, vehicle, hat, private: priv, bots, time, map, autostart: how === 'auto' };
    const join = how === 'create' ? client.create('glade', opts) : how === 'join' ? client.join('glade', opts) : client.joinOrCreate('glade', opts);
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000));
    this.room = await Promise.race([join, timeout]);
    this.code = code;
    this.id = this.room.sessionId;
    this.online = true;
    const welcome = new Promise((resolve) => {
      this.room.onMessage('welcome', (msg) => { this.hostId = msg.hostId; this.players = msg.players; this.color = msg.color; if (msg.settings) this.settings = msg.settings; this.setMatch(msg.match); resolve(msg); });
    });
    this.room.onMessage('roster', (msg) => {
      const wasHost = this.isHost;
      this.hostId = msg.hostId;
      this.players = msg.players;
      if (msg.settings) this.settings = msg.settings;
      this.setMatch(msg.match);
      this.emit('roster', msg);
      if (!wasHost && this.isHost) this.emit('becameHost', msg);
    });
    this.room.onMessage('*', (type, msg) => {
      if (type === 'welcome' || type === 'roster' || type === 'roomClosed') return;
      if (type === 'match') { this.setMatch(msg); return; }
      this.emit(type, msg);
    });
    this.room.onMessage('roomClosed', (msg) => { this.closed = msg.reason || 'The room closed.'; });
    this.room.onLeave((code) => { this.online = false; if (!this.leaving) this.emit('disconnected', { code, reason: this.closed }); });
    await Promise.race([welcome, new Promise((r) => setTimeout(r, 3000))]);
    return this;
  }

  get phase() { return this.match ? this.match.phase || (this.match.over ? 'results' : 'playing') : 'lobby'; }
  /** my colour in the room (the same colour as someone else = the same team) */
  get myColor() { const p = this.players.find((q) => q.id === this.id); return p ? p.color : this.color ?? 0; }

  send(type, msg) {
    if (!this.online || !this.room) return;
    try { this.room.send(type, msg); } catch { /* socket closing */ }
  }

  leave() { this.leaving = true; try { this.room?.leave(); } catch { /* */ } this.online = false; }
}

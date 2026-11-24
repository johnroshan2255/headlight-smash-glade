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
    this.settings = { private: false, bots: -1 }; // the room's: hidden? how many bots (-1 = fill)
  }

  get isHost() { return this.hostId === this.id; }

  on(type, fn) { this.handlers.set(type, fn); }
  emit(type, msg) { const fn = this.handlers.get(type); if (fn) fn(msg); }

  /** Where is the server? ?server=wss://... > build-time VITE_SERVER_URL > same origin (when our server hosts the page). */
  static async findServer() {
    const q = new URLSearchParams(location.search).get('server');
    if (q) return q;
    const env = import.meta.env.VITE_SERVER_URL;
    if (env) return env;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1500);
      const r = await fetch('/health', { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (r.ok && (await r.text()).trim() === 'ok') return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
    } catch { /* no server here */ }
    return null;
  }

  async connect(url, { code = '', name, vehicle, hat, private: priv = false, bots = -1 }) {
    const client = new Client(url);
    // the room is created with these settings if it doesn't exist yet; joiners get the room's own
    const join = client.joinOrCreate('glade', { code, name, vehicle, hat, private: priv, bots });
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000));
    this.room = await Promise.race([join, timeout]);
    this.code = code;
    this.id = this.room.sessionId;
    this.online = true;
    const welcome = new Promise((resolve) => {
      this.room.onMessage('welcome', (msg) => { this.hostId = msg.hostId; this.players = msg.players; this.color = msg.color; if (msg.settings) this.settings = msg.settings; resolve(msg); });
    });
    this.room.onMessage('roster', (msg) => {
      const wasHost = this.isHost;
      this.hostId = msg.hostId;
      this.players = msg.players;
      if (msg.settings) this.settings = msg.settings;
      this.emit('roster', msg);
      if (!wasHost && this.isHost) this.emit('becameHost', msg);
    });
    this.room.onMessage('*', (type, msg) => {
      if (type === 'welcome' || type === 'roster' || type === 'roomClosed') return;
      this.emit(type, msg);
    });
    this.room.onMessage('roomClosed', (msg) => { this.closed = msg.reason || 'The room closed.'; });
    this.room.onLeave((code) => { this.online = false; if (!this.leaving) this.emit('disconnected', { code, reason: this.closed }); });
    await Promise.race([welcome, new Promise((r) => setTimeout(r, 3000))]);
    return this;
  }

  send(type, msg) {
    if (!this.online || !this.room) return;
    try { this.room.send(type, msg); } catch { /* socket closing */ }
  }

  leave() { this.leaving = true; try { this.room?.leave(); } catch { /* */ } this.online = false; }
}

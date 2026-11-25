// FOGBASH: Colyseus room server + static file host.
//
//   npm run play     -> builds the game, then serves it and the multiplayer rooms on :2567
//   npm run server   -> serves an existing dist/ build + rooms
//
// Model: each player is authoritative for their own buggy (sent ~20x/s and relayed). The room
// elects a "host" client that simulates the shared props (barrels, logs, rocks, cage-ball, crates)
// and broadcasts them; if the host leaves, the oldest remaining player takes over seamlessly.
import http from 'http';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server, Room, matchMaker } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { api, flush } from './accounts.js';
import { MAP_IDS } from '../src/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT || 2567);
const MAX_PLAYERS = 8; // a room's seats (CrazyGames lobby size: 2 to 8)
const MIN_DRIVERS = 2; // a match needs two drivers: two players, or one and a bot
const HOST_ONLY = new Set(['world', 'grant', 'spawnProp']); // only the elected host may send these

class GladeRoom extends Room {
  // A room is made by its host (CREATE) and found by its code. Everyone waits in the room's lobby,
  // picks a colour (the same colour as someone else = the same team) and the host presses START:
  // everyone drops into the glade together. When the clock runs out the results show, then it's
  // back to the lobby for the next round. Public rooms are listed under JOIN; private ones need the code.
  onCreate(options) {
    this.maxClients = MAX_PLAYERS;
    this.roster = new Map(); // sessionId -> { name, color, vehicle, hat, score, joined }
    this.hostId = null;
    //   private: hidden from the JOIN list (join by code)
    //   bots: how many bots the host adds (0..6); -1 = fill the empty seats (only the playtests use it)
    //   time: minutes per match (6, 8, 10 or 12): most smashes when the clock runs out wins
    //   map: the arena (glade, crater, bog, quarry; 'endless' only for the playtests)
    this.settings = { private: !!options.private, bots: GladeRoom.botCount(options.bots ?? 0), time: GladeRoom.matchMinutes(options.time), map: MAP_IDS.includes(options.map) ? options.map : options.autostart ? 'endless' : 'glade' };
    this.match = { n: 0, phase: 'lobby', over: true, endsAt: 0, nextAt: 0 };
    this.setMetadata({ code: options.code || '', private: this.settings.private, bots: this.settings.bots, host: '', phase: 'lobby', time: this.settings.time, endsAt: 0, map: this.settings.map });
    this.onMessage('*', (client, type, msg) => this.relay(client, String(type), msg && typeof msg === 'object' ? msg : {})); // (a stray primitive can't take .from)
    this.autoStart = !!options.autostart; // the playtests' ?autostart: skip the lobby
  }

  static botCount(b) { const n = Math.round(Number(b)); return Number.isFinite(n) && n >= -1 && n <= 6 ? n : 0; }
  static matchMinutes(t) { const n = Math.round(Number(t)); return [6, 8, 10, 12].includes(n) ? n : 8; }

  // ---------------------------------------------------------------- phases: lobby -> playing -> results -> lobby
  startMatch() {
    const now = Date.now();
    const ms = Number(process.env.MATCH_MS) || this.settings.time * 60000; // MATCH_MS: short matches for the playtests
    this.match = { n: this.match.n + 1, phase: 'playing', over: false, startedAt: now, endsAt: now + ms, nextAt: 0 };
    for (const p of this.roster.values()) p.score = 0;
    this.matchTimer?.clear();
    this.matchTimer = this.clock.setTimeout(() => this.endMatch(), ms);
    this.publish();
  }
  endMatch() {
    const now = Date.now();
    Object.assign(this.match, { phase: 'results', over: true, endsAt: now, nextAt: now + GladeRoom.BREAK_MS });
    this.matchTimer?.clear();
    this.matchTimer = this.clock.setTimeout(() => { Object.assign(this.match, { phase: 'lobby', nextAt: 0 }); this.publish(); }, GladeRoom.BREAK_MS);
    this.publish();
  }
  publish() {
    this.setMetadata({ ...this.metadata, phase: this.match.phase, endsAt: this.match.endsAt });
    this.broadcast('match', this.matchMsg());
  }
  matchMsg() { return { ...this.match, now: Date.now() }; }
  static BREAK_MS = Number(process.env.MATCH_BREAK_MS || 12000);

  freeColor() {
    const used = new Set([...this.roster.values()].map((p) => p.color));
    for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
    return 0;
  }

  rosterList() {
    return [...this.roster.entries()].map(([id, p]) => ({ id, ...p }));
  }

  sendRoster() {
    this.broadcast('roster', { hostId: this.hostId, players: this.rosterList(), settings: this.settings, match: this.matchMsg() });
  }

  onJoin(client, options = {}) {
    const name = String(options.name || 'Driver').replace(/[^\w \-.]/g, '').slice(0, 16) || 'Driver';
    const p = { name, color: this.freeColor(), vehicle: String(options.vehicle || 'mudrunner').slice(0, 16), hat: String(options.hat || 'straw').slice(0, 12), score: 0, joined: Date.now() };
    this.roster.set(client.sessionId, p);
    if (this.closing) { client.leave(4000); return; } // too late: the host just left
    if (!this.hostId) { this.hostId = client.sessionId; this.hostName = name; this.setMetadata({ ...this.metadata, host: name }); }
    client.send('welcome', { id: client.sessionId, hostId: this.hostId, color: p.color, players: this.rosterList(), settings: this.settings, match: this.matchMsg() });
    this.sendRoster();
    if (this.autoStart && this.match.phase === 'lobby') this.startMatch();
  }

  onDispose() { this.matchTimer?.clear(); }

  onLeave(client) {
    const wasHost = this.hostId === client.sessionId;
    this.roster.delete(client.sessionId);
    if (wasHost) {
      // the host owns the room: when they go, the room goes, and everyone is sent back to the menu
      const name = this.hostName || 'The host';
      this.broadcast('roomClosed', { reason: `${name} left, so the room closed.` });
      this.closing = true;
      setTimeout(() => this.disconnect(), 150); // let the message land first
      return;
    }
    // a guest leaving: just their car goes, the room carries on
    this.broadcast('left', { id: client.sessionId });
    this.sendRoster();
  }

  relay(client, type, msg) {
    const p = this.roster.get(client.sessionId);
    if (!p) return;
    if (type === 'roomSettings') { // only the host may change the room
      if (client.sessionId !== this.hostId) return;
      if (msg.bots !== undefined) this.settings.bots = GladeRoom.botCount(msg.bots);
      if (msg.private !== undefined && this.metadata.code) this.settings.private = !!msg.private;
      if (msg.time !== undefined) { this.settings.time = GladeRoom.matchMinutes(msg.time); this.setMetadata({ ...this.metadata, time: this.settings.time }); } // from the next match
      if (msg.restart && !this.match.over) this.endMatch(); // the host can call time early
      if (msg.map !== undefined && MAP_IDS.includes(msg.map) && this.match.phase !== 'playing') { this.settings.map = msg.map; this.setMetadata({ ...this.metadata, map: msg.map }); } // only between matches
      this.setMetadata({ ...this.metadata, private: this.settings.private, bots: this.settings.bots });
      this.sendRoster();
      return;
    }
    if (type === 'start') { // the host starts the match from the lobby: at least two drivers (players + bots)
      const bots = this.settings.bots < 0 ? MAX_PLAYERS - this.roster.size : Math.min(this.settings.bots, MAX_PLAYERS - this.roster.size);
      if (client.sessionId === this.hostId && this.match.phase === 'lobby' && this.roster.size + Math.max(0, bots) >= MIN_DRIVERS) this.startMatch();
      return;
    }
    if (type === 'pickColor') { // your colour; share one with friends to be a team
      const c = Math.round(Number(msg.color));
      if (Number.isFinite(c) && c >= 0 && c < MAX_PLAYERS) { p.color = c; this.sendRoster(); }
      return;
    }
    if (type === 'profile') {
      if (msg.vehicle) p.vehicle = String(msg.vehicle).slice(0, 16);
      if (msg.hat) p.hat = String(msg.hat).slice(0, 12);
      if (msg.name) p.name = String(msg.name).replace(/[^\w \-.]/g, '').slice(0, 16) || p.name;
      this.sendRoster();
      return;
    }
    if (type === 'score') {
      // a smash: credit the attacker named by the victim (not during the break between matches)
      if (this.match.over) return;
      const k = this.roster.get(msg.killer);
      if (k) k.score += 1;
      this.sendRoster();
    }
    if (HOST_ONLY.has(type) && client.sessionId !== this.hostId) return;
    // everything else is relayed to the other players, stamped with the sender
    msg.from = client.sessionId;
    if (msg.to) {
      const target = this.clients.find((c) => c.sessionId === msg.to);
      if (target) target.send(type, msg);
      return;
    }
    this.broadcast(type, msg, { except: client });
  }
}

// ------------------------------------------------------------------ static files (the built game)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };
const PACKED = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.txt', '.svg', '.wav']); // worth compressing
const zipped = new Map(); // `${file}|${enc}|${mtime}` -> Buffer (the build never changes while serving)
function compressed(file, enc, mtime) {
  const key = `${file}|${enc}|${mtime}`;
  if (!zipped.has(key)) {
    const raw = fs.readFileSync(file);
    zipped.set(key, enc === 'br' ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } }) : zlib.gzipSync(raw, { level: 9 }));
  }
  return zipped.get(key);
}
function serveStatic(req, res) {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (url === '/rooms') { listRooms(res); return; }
  // HSG_BACKEND_ONLY: this server hosts rooms and accounts only (the game itself is on Vercel)
  if (process.env.HSG_BACKEND_ONLY) { res.writeHead(url === '/' ? 200 : 404, { 'content-type': 'text/plain' }); res.end(url === '/' ? 'FOGBASH game server (rooms + accounts). Play the game at its own address.' : 'not found'); return; }
  let file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(url === '/' ? 200 : 404, { 'content-type': 'text/plain' }); res.end(url === '/' ? 'FOGBASH game server (rooms + accounts). The game itself is hosted separately.' : 'not found'); return; } // backend only (no dist/)
  const ext = path.extname(file), st = fs.statSync(file);
  const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable', vary: 'accept-encoding' };
  // text: brotli or gzip, compressed once and kept in memory
  const accept = String(req.headers['accept-encoding'] || '');
  const enc = PACKED.has(ext) && st.size > 1024 ? (/\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null) : null;
  if (enc) {
    const body = compressed(file, enc, st.mtimeMs);
    res.writeHead(200, { ...headers, 'content-encoding': enc, 'content-length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }
  // everything else streams, with byte ranges (Safari needs them to play <audio>)
  headers['accept-ranges'] = 'bytes';
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  if (m) {
    let a = m[1] === '' ? st.size - Number(m[2]) : Number(m[1]);
    let b = m[1] !== '' && m[2] !== '' ? Number(m[2]) : st.size - 1;
    a = Math.max(0, a); b = Math.min(st.size - 1, b);
    if (a > b) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); res.end(); return; }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${a}-${b}/${st.size}`, 'content-length': b - a + 1 });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file, { start: a, end: b }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'content-length': st.size });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(file).pipe(res);
}

// the lobby's list of open glades: [{ code, players, max }] ('' = the public glade)
async function listRooms(res) {
  let rooms = [];
  try { rooms = await matchMaker.query({ name: 'glade' }); } catch { /* none yet */ }
  // private rooms are never listed: you need the code
  const list = rooms.filter((r) => r.metadata?.code && !r.metadata?.private && r.metadata?.host && (!r.locked || r.clients < r.maxClients)).map((r) => ({ code: r.metadata.code, host: r.metadata.host, players: r.clients, max: r.maxClients, bots: r.metadata.bots ?? 0, phase: r.metadata.phase || 'lobby', time: r.metadata.time || 8, map: r.metadata.map || 'glade', left: r.metadata.phase === 'playing' ? Math.max(0, (r.metadata.endsAt || 0) - Date.now()) : 0 }));
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(list));
}

const httpServer = http.createServer();
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define('glade', GladeRoom).filterBy(['code']);
await gameServer.listen(PORT, '0.0.0.0');
// Colyseus answers its own HTTP routes (matchmaking); everything else is the game's files.
const colyseusHandlers = httpServer.listeners('request');
httpServer.removeAllListeners('request');
const isColyseus = (url = '') => url.startsWith('/matchmake') || url.startsWith('/__') || url.startsWith('/auth');
// The game can be hosted elsewhere (Vercel): let it call /rooms, /health and /api from its own
// origin. CORS_ORIGINS (comma-separated) limits who may; unset = any (no cookies are used, accounts
// travel as a bearer token).
const CORS = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
function cors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (CORS.length && !CORS.includes(origin)) return;
  res.setHeader('access-control-allow-origin', CORS.length ? origin : '*');
  res.setHeader('access-control-allow-headers', 'content-type, authorization');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-max-age', '86400');
  if (CORS.length) res.setHeader('vary', 'origin');
}
httpServer.on('request', (req, res) => {
  if (!isColyseus(req.url)) { cors(req, res); if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; } }
  if (isColyseus(req.url)) for (const h of colyseusHandlers) h.call(httpServer, req, res);
  else if ((req.url || '').startsWith('/api/')) api(req, res, (req.url || '').split('?')[0]);
  else serveStatic(req, res);
});
console.log(`\n  FOGBASH  ->  http://localhost:${PORT}  (rooms on the same port)\n`);

// hosts like Railway stop the old copy with SIGTERM on every deploy: save the accounts first
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { flush(); } catch (e) { console.error('save failed', e); } process.exit(0); });

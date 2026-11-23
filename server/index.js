// HEADLIGHT: SMASH GLADE: Colyseus room server + static file host.
//
//   npm run play     -> builds the game, then serves it and the multiplayer rooms on :2567
//   npm run server   -> serves an existing dist/ build + rooms
//
// Model: each player is authoritative for their own buggy (sent ~20x/s and relayed). The room
// elects a "host" client that simulates the shared props (barrels, logs, rocks, cage-ball, crates)
// and broadcasts them; if the host leaves, the oldest remaining player takes over seamlessly.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server, Room } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT || 2567);
const MAX_PLAYERS = 8;
const HOST_ONLY = new Set(['world', 'grant', 'spawnProp']); // only the elected host may send these

class GladeRoom extends Room {
  onCreate(options) {
    this.maxClients = MAX_PLAYERS;
    this.roster = new Map(); // sessionId -> { name, color, vehicle, hat, score, joined }
    this.hostId = null;
    this.setMetadata({ code: options.code || '' });
    this.onMessage('*', (client, type, msg) => this.relay(client, String(type), msg || {}));
  }

  freeColor() {
    const used = new Set([...this.roster.values()].map((p) => p.color));
    for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
    return 0;
  }

  rosterList() {
    return [...this.roster.entries()].map(([id, p]) => ({ id, ...p }));
  }

  sendRoster() {
    this.broadcast('roster', { hostId: this.hostId, players: this.rosterList() });
  }

  onJoin(client, options = {}) {
    const name = String(options.name || 'Driver').replace(/[^\w \-.]/g, '').slice(0, 16) || 'Driver';
    const p = { name, color: this.freeColor(), vehicle: String(options.vehicle || 'mudrunner').slice(0, 16), hat: String(options.hat || 'straw').slice(0, 12), score: 0, joined: Date.now() };
    this.roster.set(client.sessionId, p);
    if (!this.hostId) this.hostId = client.sessionId;
    client.send('welcome', { id: client.sessionId, hostId: this.hostId, color: p.color, players: this.rosterList() });
    this.sendRoster();
  }

  onLeave(client) {
    this.roster.delete(client.sessionId);
    if (this.hostId === client.sessionId) {
      // hand the props over to whoever has been here longest
      let oldest = null;
      for (const [id, p] of this.roster) if (!oldest || p.joined < this.roster.get(oldest).joined) oldest = id;
      this.hostId = oldest;
    }
    this.broadcast('left', { id: client.sessionId });
    this.sendRoster();
  }

  relay(client, type, msg) {
    const p = this.roster.get(client.sessionId);
    if (!p) return;
    if (type === 'profile') {
      if (msg.vehicle) p.vehicle = String(msg.vehicle).slice(0, 16);
      if (msg.hat) p.hat = String(msg.hat).slice(0, 12);
      if (msg.name) p.name = String(msg.name).replace(/[^\w \-.]/g, '').slice(0, 16) || p.name;
      this.sendRoster();
      return;
    }
    if (type === 'score') {
      // a smash: credit the attacker named by the victim
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
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
function serveStatic(req, res) {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  let file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('Build the game first: npm run build'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
  fs.createReadStream(file).pipe(res);
}

const httpServer = http.createServer();
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define('glade', GladeRoom).filterBy(['code']);
await gameServer.listen(PORT, '0.0.0.0');
// Colyseus answers its own HTTP routes (matchmaking); everything else is the game's files.
const colyseusHandlers = httpServer.listeners('request');
httpServer.removeAllListeners('request');
const isColyseus = (url = '') => url.startsWith('/matchmake') || url.startsWith('/__') || url.startsWith('/auth');
httpServer.on('request', (req, res) => {
  if (isColyseus(req.url)) for (const h of colyseusHandlers) h.call(httpServer, req, res);
  else serveStatic(req, res);
});
console.log(`\n  HEADLIGHT: SMASH GLADE  ->  http://localhost:${PORT}  (rooms on the same port)\n`);

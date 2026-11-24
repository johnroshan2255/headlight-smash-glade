// Player accounts, coins, purchases and car setups, kept in one JSON file (server/data/accounts.json).
//
//   POST /api/guest                      -> a new guest account          { token, profile }
//   POST /api/register {name, password}  -> register (upgrades the guest whose token is sent)
//   POST /api/login    {name, password}  -> a new token for that account
//   POST /api/logout                     -> forget this token
//   GET  /api/me                         -> profile
//   POST /api/buy      {cat, id}         -> spend coins on a ride / wheels / gadget / upgrade / hat
//   POST /api/setup    {setup}           -> equip things you own
//   POST /api/earn     {coins:{why:n}, stats:{...}, hat?}  -> credit play (rate-capped)
//
// Auth is "Authorization: Bearer <token>". Passwords are scrypt-hashed; tokens are stored hashed.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { START_COINS, CATEGORIES, HAT_IDS, EARN, EARN_PER_MINUTE, EARN_BURST, DEFAULT_SETUP, newOwned, owns, cleanSetup } from '../src/catalog.js';

const DIR = process.env.HSG_DATA || path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data');
const FILE = path.join(DIR, 'accounts.json');

let db = { accounts: {} };
const byToken = new Map(); // sha256(token) -> account id
const byName = new Map(); // lower-case name -> account id

function load() {
  try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { db = { accounts: {} }; }
  db.accounts ||= {};
  for (const A of Object.values(db.accounts)) {
    for (const t of A.tokens || []) byToken.set(t, A.id);
    if (A.name) byName.set(A.name.toLowerCase(), A.id);
  }
  console.log(`  accounts: ${Object.keys(db.accounts).length} loaded from ${FILE}`);
}

// writes are batched and atomic (write a temp file, then rename over the real one)
let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, FILE);
  }, 400);
}
export function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); } }

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hashPass = (pw, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(pw, salt, 32).toString('hex') });
const checkPass = (pw, P) => !!P && crypto.timingSafeEqual(Buffer.from(hashPass(pw, P.salt).hash, 'hex'), Buffer.from(P.hash, 'hex'));

function newToken(A) {
  const token = crypto.randomBytes(24).toString('base64url'), h = sha(token);
  A.tokens = [...(A.tokens || []), h].slice(-6);
  byToken.clear();
  for (const B of Object.values(db.accounts)) for (const t of B.tokens || []) byToken.set(t, B.id);
  return token;
}

function newAccount() {
  const id = crypto.randomBytes(8).toString('hex');
  const A = {
    id, name: null, pass: null, coins: START_COINS, owned: newOwned(), setup: { ...DEFAULT_SETUP },
    stats: { smashes: 0, wrecks: 0, distance: 0, best: 0, flips: 0, earned: 0 },
    created: Date.now(), seen: Date.now(), earnAt: Date.now(), tokens: [],
  };
  db.accounts[id] = A;
  return A;
}

/** what the client is allowed to see */
const profile = (A) => ({ id: A.id, name: A.name, guest: !A.name, coins: A.coins, owned: A.owned, setup: A.setup, stats: A.stats });

const NAME_OK = /^[A-Za-z0-9_\-. ]{3,16}$/;

// a little brute-force protection for logins
const tries = new Map();
function throttled(ip) {
  const now = Date.now(), t = tries.get(ip) || { n: 0, at: now };
  if (now - t.at > 60000) { t.n = 0; t.at = now; }
  t.n++;
  tries.set(ip, t);
  return t.n > 12;
}

async function body(req) {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (d) => { s += d; if (s.length > 8192) req.destroy(); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function send(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function authed(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const id = byToken.get(sha(m[1].trim()));
  const A = id && db.accounts[id];
  if (A) A.seen = Date.now();
  return A || null;
}

/** handle /api/*; returns true when it answered */
export async function api(req, res, url) {
  if (!url.startsWith('/api/')) return false;
  const route = url.slice(5), ip = req.socket.remoteAddress || '?';
  const fail = (code, error) => send(res, code, { error });
  try {
    if (req.method === 'GET' && route === 'me') {
      const A = authed(req);
      return A ? send(res, 200, { profile: profile(A) }) : fail(401, 'not signed in');
    }
    if (req.method !== 'POST') return fail(405, 'POST only');
    const b = await body(req);

    if (route === 'guest') {
      if (throttled(ip)) return fail(429, 'slow down');
      const A = newAccount();
      const token = newToken(A);
      save();
      return send(res, 200, { token, profile: profile(A) });
    }

    if (route === 'register') {
      const name = String(b.name || '').trim(), pw = String(b.password || '');
      if (!NAME_OK.test(name)) return fail(400, 'Names are 3-16 letters, numbers, spaces, - _ or .');
      if (pw.length < 4) return fail(400, 'Use a password of at least 4 characters.');
      if (byName.has(name.toLowerCase())) return fail(409, 'That name is taken.');
      let A = authed(req);
      if (A && A.name) A = null; // already registered: make a new account instead
      if (!A) A = newAccount();
      A.name = name;
      A.pass = hashPass(pw);
      byName.set(name.toLowerCase(), A.id);
      const token = newToken(A);
      save();
      return send(res, 200, { token, profile: profile(A) });
    }

    if (route === 'login') {
      if (throttled(ip)) return fail(429, 'Too many tries. Wait a minute.');
      const id = byName.get(String(b.name || '').trim().toLowerCase());
      const A = id && db.accounts[id];
      if (!A || !checkPass(String(b.password || ''), A.pass)) return fail(401, 'Wrong name or password.');
      const token = newToken(A);
      save();
      return send(res, 200, { token, profile: profile(A) });
    }

    const A = authed(req);
    if (!A) return fail(401, 'not signed in');

    if (route === 'logout') {
      const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
      A.tokens = (A.tokens || []).filter((t) => t !== sha(m[1].trim()));
      byToken.delete(sha(m[1].trim()));
      save();
      return send(res, 200, { ok: true });
    }

    if (route === 'buy') {
      const cat = String(b.cat || ''), id = String(b.id || '');
      const C = CATEGORIES[cat];
      const price = C?.price(id);
      if (!C || price === undefined) return fail(400, 'No such thing.');
      if (owns(A.owned, cat, id)) return send(res, 200, { profile: profile(A) });
      if (A.coins < price) return fail(402, 'Not enough coins.');
      A.coins -= price;
      (A.owned[cat] ||= []).push(id);
      save();
      return send(res, 200, { profile: profile(A) });
    }

    if (route === 'setup') {
      A.setup = cleanSetup(A.owned, b.setup || {});
      save();
      return send(res, 200, { profile: profile(A) });
    }

    if (route === 'earn') {
      // credit what the client says it earned, but never faster than EARN_PER_MINUTE of play
      const now = Date.now();
      const allowance = Math.min(EARN_PER_MINUTE * 10, EARN_BURST + ((now - (A.earnAt || now)) / 60000) * EARN_PER_MINUTE);
      let want = 0;
      for (const [why, n] of Object.entries(b.coins || {})) if (EARN[why] !== undefined && Number.isFinite(n) && n > 0) want += Math.floor(n);
      const got = Math.max(0, Math.min(want, Math.floor(allowance)));
      A.coins += got;
      A.earnAt = now - Math.max(0, (allowance - got) / EARN_PER_MINUTE) * 60000; // unused allowance carries over
      const st = b.stats || {}, S = A.stats;
      for (const k of ['smashes', 'wrecks', 'flips']) if (Number.isFinite(st[k]) && st[k] > 0 && st[k] < 200) S[k] += Math.floor(st[k]);
      if (Number.isFinite(st.distance) && st.distance > 0 && st.distance < 20000) S.distance += Math.floor(st.distance);
      if (Number.isFinite(st.best) && st.best > S.best && st.best < 1e6) S.best = Math.floor(st.best);
      S.earned += got;
      if (b.hat && HAT_IDS.includes(b.hat) && !A.owned.hats.includes(b.hat)) A.owned.hats.push(b.hat); // found in the glade
      save();
      return send(res, 200, { profile: profile(A), credited: got });
    }

    return fail(404, 'no such route');
  } catch (err) {
    console.error('api', route, err);
    return fail(500, 'server error');
  }
}

load();
process.on('SIGINT', () => { flush(); process.exit(0); });
process.on('SIGTERM', () => { flush(); process.exit(0); });

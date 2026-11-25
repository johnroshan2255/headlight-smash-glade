// The player's account on the client: who you are, your coins, what you own, your car setup.
// With a game server it talks to /api (server/accounts.js). Without one (the static itch build)
// it keeps the same profile in this browser's storage, so the garage works offline too.
import { START_COINS, CATEGORIES, EARN, DEFAULT_SETUP, HAT_IDS, newOwned, owns, cleanSetup } from './catalog.js';

const ls = {
  get(k, d = null) { try { return localStorage.getItem(`hsg.${k}`) ?? d; } catch { return d; } },
  set(k, v) { try { if (v === null) localStorage.removeItem(`hsg.${k}`); else localStorage.setItem(`hsg.${k}`, v); } catch { /* private mode */ } },
};

export class Account {
  constructor() {
    this.profile = null;
    this.online = false; // talking to a server
    this.base = '';
    this.listeners = new Set();
    this.pending = { coins: {}, stats: {} }; // earnings not yet sent
    this.flushT = null;
  }

  onChange(fn) { this.listeners.add(fn); if (this.profile) fn(this.profile); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this.profile); }
  get coins() { return this.profile ? this.profile.coins + this.pendingCoins() : 0; }
  pendingCoins() { return Object.values(this.pending.coins).reduce((a, b) => a + b, 0); }
  owns(cat, id) { return owns(this.profile?.owned, cat, id); }
  get setup() { return this.profile?.setup || { ...DEFAULT_SETUP }; }
  get name() { return this.profile?.name || null; }

  /** sign in: resume the saved token, or make a guest account. serverUrl: a ws(s):// url or null */
  async init(serverUrl) {
    if (serverUrl) {
      this.base = serverUrl.replace(/^ws/, 'http').replace(/\/$/, '') + '/api';
      try {
        const token = ls.get('token');
        if (token) { const r = await this.call('GET', 'me'); if (r.profile) { this.online = true; return this.set(r.profile); } }
        const r = await this.call('POST', 'guest');
        if (r.token) { ls.set('token', r.token); this.online = true; return this.set(r.profile); }
      } catch (err) { console.warn('account server unreachable, playing offline', err); }
    }
    this.online = false;
    return this.set(this.localLoad());
  }

  set(profile) {
    this.profile = profile;
    if (!this.online) this.localSave();
    this.emit();
    return profile;
  }

  async call(method, route, data) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
    try {
      const token = ls.get('token');
      const r = await fetch(`${this.base}/${route}`, { method, signal: ctl.signal, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: method === 'POST' ? JSON.stringify(data || {}) : undefined });
      const j = await r.json().catch(() => ({}));
      if (!r.ok && !j.error) j.error = `server said ${r.status}`;
      return j;
    } finally { clearTimeout(t); }
  }

  // ---------------------------------------------------------------- sign in / out
  async register(name, password) {
    if (!this.online) return { error: 'Accounts need the game server. Your progress is saved on this device.' };
    await this.flush();
    const r = await this.call('POST', 'register', { name, password });
    if (r.token) { ls.set('token', r.token); this.set(r.profile); }
    return r;
  }
  async login(name, password) {
    if (!this.online) return { error: 'Accounts need the game server.' };
    await this.flush();
    const r = await this.call('POST', 'login', { name, password });
    if (r.token) { ls.set('token', r.token); this.set(r.profile); }
    return r;
  }
  async logout() {
    if (!this.online) return;
    await this.flush();
    await this.call('POST', 'logout').catch(() => {});
    ls.set('token', null);
    const r = await this.call('POST', 'guest');
    if (r.token) { ls.set('token', r.token); this.set(r.profile); }
  }

  // ---------------------------------------------------------------- shop
  async buy(cat, id) {
    const price = CATEGORIES[cat]?.price(id);
    if (price === undefined) return { error: 'No such thing.' };
    if (this.owns(cat, id)) return { profile: this.profile };
    await this.flush();
    if (this.online) { const r = await this.call('POST', 'buy', { cat, id }); if (r.profile) this.set(r.profile); return r; }
    const P = this.profile;
    if (P.coins < price) return { error: 'Not enough coins.' };
    P.coins -= price;
    (P.owned[cat] ||= []).push(id);
    return { profile: this.set(P) };
  }

  async equip(patch) {
    const next = cleanSetup(this.profile.owned, { ...this.setup, ...patch });
    this.profile.setup = next; // show it straight away
    this.emit();
    if (this.online) { const r = await this.call('POST', 'setup', { setup: next }); if (r.profile) this.set(r.profile); return r; }
    return { profile: this.set(this.profile) };
  }

  // ---------------------------------------------------------------- earning (batched)
  /** add coins for something done in the glade; sent to the server every few seconds */
  earn(why, n = 1, stats = null) {
    if (!this.profile || !EARN[why]) return 0;
    const coins = EARN[why] * n;
    this.pending.coins[why] = (this.pending.coins[why] || 0) + coins;
    if (stats) this.stat(stats);
    this.emit();
    this.schedule();
    return coins;
  }
  stat(stats) {
    for (const [k, v] of Object.entries(stats)) {
      if (k === 'best') this.pending.stats.best = Math.max(this.pending.stats.best || 0, v);
      else this.pending.stats[k] = (this.pending.stats[k] || 0) + v;
    }
    this.schedule();
  }
  foundHat(id) {
    if (!HAT_IDS.includes(id) || this.profile.owned.hats.includes(id)) return;
    this.pending.hat = id;
    this.profile.owned.hats.push(id); // optimistic
    this.earn('hat');
  }
  schedule() { if (!this.flushT) this.flushT = setTimeout(() => this.flush(), 5000); }

  async flush() {
    clearTimeout(this.flushT); this.flushT = null;
    const p = this.pending;
    if (!Object.keys(p.coins).length && !Object.keys(p.stats).length && !p.hat) return;
    this.pending = { coins: {}, stats: {} };
    if (this.online) {
      try {
        const r = await this.call('POST', 'earn', p);
        if (r.profile) this.set(r.profile);
        else this.requeue(p);
      } catch { this.requeue(p); }
      return;
    }
    const P = this.profile;
    P.coins += Object.values(p.coins).reduce((a, b) => a + b, 0);
    for (const [k, v] of Object.entries(p.stats)) { if (k === 'best') P.stats.best = Math.max(P.stats.best || 0, v); else P.stats[k] = (P.stats[k] || 0) + v; }
    if (p.hat && !P.owned.hats.includes(p.hat)) P.owned.hats.push(p.hat);
    this.set(P);
  }
  requeue(p) {
    for (const [k, v] of Object.entries(p.coins)) this.pending.coins[k] = (this.pending.coins[k] || 0) + v;
    for (const [k, v] of Object.entries(p.stats)) this.pending.stats[k] = (this.pending.stats[k] || 0) + v;
    if (p.hat) this.pending.hat = p.hat;
    this.schedule();
  }

  // ---------------------------------------------------------------- offline profile
  localLoad() {
    let P = null;
    try { P = JSON.parse(ls.get('profile') || 'null'); } catch { /* */ }
    if (!P) {
      P = { id: 'local', name: null, guest: true, coins: START_COINS, owned: newOwned(), setup: { ...DEFAULT_SETUP }, stats: { smashes: 0, wrecks: 0, distance: 0, best: 0, flips: 0, earned: 0 } };
      // carry over hats found before accounts existed
      try { for (const h of JSON.parse(ls.get('hats') || '[]')) if (HAT_IDS.includes(h) && !P.owned.hats.includes(h)) P.owned.hats.push(h); } catch { /* */ }
    }
    // only what you own can be fitted (things worn while the shop was free go back to the starter kit)
    P.owned ||= newOwned();
    P.setup = cleanSetup(P.owned, P.setup);
    return P;
  }
  localSave() { ls.set('profile', JSON.stringify(this.profile)); }
}

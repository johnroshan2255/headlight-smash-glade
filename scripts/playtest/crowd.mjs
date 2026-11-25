// A crowded room: 5 players + 2 bots in one room, everyone driving, boosting and honking for a while.
// Then every screen checks every other car (people and bots): it exists, it's drawn every frame,
// it isn't being rebuilt, and it's where its owner has it. Also the frame rate on each page.
// Needs a server:  PORT=2568 MATCH_MS=120000 MATCH_BREAK_MS=4000 node server/index.js
import { launch, sleep } from './lib.mjs';
const BASE = process.env.HSG_MATCH_URL || 'http://localhost:2568';
const N = Number(process.argv[2] || 5);
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
let made = 0;
const page = async (name) => { const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } }); const p = await ctx.newPage();
  // LAG=1: every other player is on a slow, laggy link (like a phone on busy Wi-Fi or 4G)
  if (process.env.LAG && made++ % 2 === 1) { const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.5e6 / 8, uploadThroughput: 0.75e6 / 8 }); } p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message)); await p.goto(`${BASE}/?name=${name}&q=0`); await p.waitForSelector('#menu:not([hidden])', { timeout: 60000 }); await sleep(300); return p; };
const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Fox', 'Golf', 'Hotel'].slice(0, N);
const P = [];
P.push(await page(names[0]));
await P[0].click('#btnCoop'); await sleep(300); await P[0].click('#lTabCreate'); await P[0].click('#botChips button[data-b="2"]'); await P[0].click('#btnCreate');
await P[0].waitForSelector('#roomLobby:not([hidden])');
const code = await P[0].evaluate(() => window.__hsg.net.code);
for (const n of names.slice(1)) { const p = await page(n); await p.click('#btnCoop'); await sleep(200); await p.fill('#optRoom', code); await p.click('#btnJoin'); await p.waitForSelector('#roomLobby:not([hidden])', { timeout: 20000 }); P.push(p); }
await sleep(800);
const inLobby = await P[0].evaluate(() => window.__hsg.net.players.length);
ok(inLobby === N, `${N} players wait in the lobby (${inLobby})`);
await P[0].click('#rlGo');
await Promise.all(P.map((p) => p.waitForFunction(() => window.__hsg && window.__hsg.me, null, { timeout: 30000 })));
await sleep(3000);
// everyone drops in near the middle, then drives about at random for 20 s
await Promise.all(P.map((p, i) => p.evaluate((x) => { const m = window.__hsg.me; m.respawnAt(x, 0); m.shield = 99; }, -30 + i * 12)));
const keys = ['KeyA', 'KeyD'];
const t0 = Date.now();
while (Date.now() - t0 < 20000) {
  await Promise.all(P.map(async (p, i) => { const k = keys[(i + Math.floor((Date.now() - t0) / 3000)) % 2]; await p.keyboard.down(k); if (Math.random() < 0.3) await p.keyboard.down('ShiftLeft'); if (Math.random() < 0.1) await p.keyboard.press('Space'); if (Math.random() < 0.05) await p.keyboard.press('KeyH'); }));
  await sleep(700);
  await Promise.all(P.map(async (p) => { for (const k of ['KeyA', 'KeyD', 'ShiftLeft']) await p.keyboard.up(k); }));
}
await sleep(500);
// every screen, every car
const owners = await Promise.all(P.map((p) => p.evaluate(() => { const g = window.__hsg; return [...g.cars.values()].filter((c) => c.local && !String(c.id).startsWith('warm') && c.id !== 'preview').map((c) => ({ id: c.id, name: c.name, x: c.body.p[0], y: c.body.p[1], wrecked: !!c.wrecked, ghost: !!c.ghost })); })));
const truth = new Map(owners.flat().map((o) => [o.id, o]));
ok(truth.size === N + 2, `${truth.size} cars in the room (${N} people + 2 bots)`);
const views = await Promise.all(P.map((p) => p.evaluate(async (ids) => {
  const g = window.__hsg, out = {}, objs = {}; let frames = 0;
  const t0 = performance.now();
  await new Promise((res) => { const tick = () => { frames++; for (const id of ids) { const c = g.cars.get(id), o = (out[id] ||= { seen: 0, shown: 0, rebuilt: 0 }); if (!c) continue; o.seen++; if (objs[id] && objs[id] !== c) o.rebuilt++; objs[id] = c; if ((c.holder.enabled && c.root.enabled) || c.wrecked || c.ghost || c.inSmoke) o.shown++; o.x = c.body.p[0]; o.y = c.body.p[1]; } if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  return { frames, out, fps: Math.round(frames / 1.5), me: g.me.id };
}, [...truth.keys()])));
const truth2 = new Map((await Promise.all(P.map((p) => p.evaluate(() => [...window.__hsg.cars.values()].filter((c) => c.local && !String(c.id).startsWith('warm') && c.id !== 'preview').map((c) => [c.id, c.body.p[0], c.body.p[1], Math.hypot(c.body.v[0], c.body.v[1])]))))).flat().map(([id, x, y, sp]) => [id, { x, y, sp }]));
let worst = 0, problems = [];
views.forEach((v, i) => {
  for (const [id, o] of Object.entries(v.out)) {
    if (id === v.me) continue;
    const t = truth2.get(id), err = t ? Math.hypot(o.x - t.x, o.y - t.y) : 99;
    worst = Math.max(worst, err);
    // remote cars are drawn ~0.1 s in the past (smooth interpolation), and the two samples are a moment apart
    if (o.seen < v.frames || o.shown < v.frames || o.rebuilt > 0 || err > 1.5 + (t ? t.sp : 0) * 0.25) problems.push(`${names[i]} sees ${truth.get(id)?.name || id}: seen ${o.seen}/${v.frames} drawn ${o.shown} rebuilt ${o.rebuilt} ${err.toFixed(1)} m off`);
  }
});
ok(problems.length === 0, `every screen sees every other car, drawn, never rebuilt (worst position error ${worst.toFixed(2)} m)${problems.length ? '\n   ' + problems.join('\n   ') : ''}`);
console.log(`  frame rates: ${views.map((v, i) => `${names[i]} ${v.fps}`).join(', ')}`);
// scores agree on every screen
const scores = await Promise.all(P.map((p) => p.evaluate(() => Object.fromEntries([...window.__hsg.cars.values()].filter((c) => !String(c.id).startsWith('warm') && c.id !== 'preview').map((c) => [c.name, c.score | 0])))));
const same = scores.every((s) => JSON.stringify(Object.entries(s).sort()) === JSON.stringify(Object.entries(scores[0]).sort()));
ok(same, `every screen agrees on the scores (${JSON.stringify(scores[0])})`);
const errs = P.flatMap((p) => p.errors);
ok(errs.length === 0, `no page errors ${errs.slice(0, 3).join(' | ')}`);
await browser.close();

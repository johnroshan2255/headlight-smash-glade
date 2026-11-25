// Sync audit, 2 players: after every thing that rebuilds, hides or moves a car, each screen must
// show the other car (it exists, it's drawn, not stuck hidden), where it really is (within a metre
// or two of its owner's position), and not be rebuilt every frame. Walks through: the lobby and START,
// driving, a ride change, a colour change, smoke, the ejector seat, a wreck + respawn, the map
// changing between matches, the next match, and a late joiner.
// Needs a server with 60 s matches (its steps take ~45 s; with shorter matches the eject and wreck
// checks land in the lobby, where nobody sends car updates, and fail for no real reason):
//   PORT=2569 MATCH_MS=60000 MATCH_BREAK_MS=4000 node server/index.js
//   HSG_MATCH_URL=http://localhost:2569 node scripts/playtest/syncaudit.mjs
import { launch, sleep, SHOTS } from './lib.mjs';
const BASE = process.env.HSG_MATCH_URL || 'http://localhost:2568';
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const page = async (name, vp = { width: 1100, height: 640 }) => { const ctx = await browser.newContext({ viewport: vp }); const p = await ctx.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message)); await p.goto(`${BASE}/?name=${name}`); await p.waitForSelector('#menu:not([hidden])', { timeout: 30000 }); await sleep(400); return p; };
const myId = (p) => p.evaluate(() => window.__hsg.net.id);
const truth = (p) => p.evaluate(() => { const m = window.__hsg.me; return m ? { x: m.body.p[0], y: m.body.p[1], sp: Math.hypot(m.body.v[0], m.body.v[1]), wrecked: !!m.wrecked, ghost: !!m.ghost, vehicle: m.vehicle, color: m.colorIdx } : null; });
// how this page sees car `id`: watched for `ms` (rebuilds counted by object identity)
const watch = (p, id, ms = 1500) => p.evaluate(async ([id, ms]) => {
  const g = window.__hsg, out = { frames: 0, shown: 0, rebuilt: 0, seen: 0 }; let obj = null, last = null;
  const t0 = performance.now();
  await new Promise((res) => { const tick = () => { const c = g.cars.get(id); out.frames++; if (c) { out.seen++; if (obj && obj !== c) out.rebuilt++; obj = c; if (c.holder.enabled && c.root.enabled) out.shown++; last = { x: c.body.p[0], y: c.body.p[1], vehicle: c.vehicle, color: c.colorIdx, wrecked: !!c.wrecked, smoke: !!c.inSmoke, ghost: !!c.ghost }; } if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  return { ...out, last };
}, [id, ms]);
const check = async (tag, viewer, owner, { hiddenOk = false } = {}) => {
  const id = await myId(owner);
  const [w, t] = await Promise.all([watch(viewer, id), truth(owner)]);
  const t2 = await truth(owner);
  const err = w.last && t2 ? Math.hypot(w.last.x - t2.x, w.last.y - t2.y) : 99;
  const good = w.seen === w.frames && w.rebuilt === 0 && (hiddenOk || w.shown === w.frames) && err < 1.5 + (t2 ? t2.sp : 0) * 0.25 && (!t2 || (w.last.vehicle === t2.vehicle && w.last.color === t2.color));
  ok(good, `${tag}: seen ${w.seen}/${w.frames} frames, drawn ${w.shown}, rebuilt ${w.rebuilt}, ${err.toFixed(2)} m off${w.last ? `, ${w.last.vehicle}/colour ${w.last.color}` : ''}`);
  return w;
};
const both = async (tag, A, B, o) => { await check(`${tag} (A on B's screen)`, B, A, o); await check(`${tag} (B on A's screen)`, A, B, o); };
const near = (p, x) => p.evaluate((x) => { const m = window.__hsg.me; m.respawnAt(x, 0); m.shield = 99; }, x);

// the room, its lobby, START
const A = await page('Alpha');
await A.click('#btnCoop'); await sleep(300); await A.click('#lTabCreate'); await A.click('#timeChips button[data-t="6"]'); await A.click('#btnCreate');
await A.waitForSelector('#roomLobby:not([hidden])'); await sleep(500);
const code = await A.evaluate(() => window.__hsg.net.code);
const B = await page('Bravo', { width: 390, height: 780 });
await B.click('#btnCoop'); await sleep(300); await B.fill('#optRoom', code); await B.click('#btnJoin');
await B.waitForSelector('#roomLobby:not([hidden])'); await sleep(600);
await A.click('#rlGo');
await Promise.all([A.waitForFunction(() => window.__hsg.me, null, { timeout: 15000 }), B.waitForFunction(() => window.__hsg.me, null, { timeout: 15000 })]);
await sleep(2500);
await near(A, 0); await near(B, 6); await sleep(1500);
await both('after START', A, B);
// both drive about
await Promise.all([A.keyboard.down('KeyD'), B.keyboard.down('KeyA')]);
await sleep(600);
const dA = check('A driving (on B)', B, A), dB = check('B driving (on A)', A, B);
await Promise.all([dA, dB]);
await Promise.all([A.keyboard.up('KeyD'), B.keyboard.up('KeyA')]);
// a ride change from the garage, then a colour change in the next lobby comes later
await A.evaluate(() => { const g = window.__hsg; g.applySetup({ ...g.account.setup, ride: 'bus', wheels: 'balloon' }); });
await sleep(1500);
await both('after Alpha changes ride', A, B);
// smoke hides Alpha only while Alpha is in it, then Alpha is back
await A.evaluate(() => { const g = window.__hsg; g.applySetup({ ...g.account.setup, bumper: 'smoke' }); }); await sleep(1200);
await near(A, 0); await near(B, 14); await sleep(1500);
await A.keyboard.press('KeyQ'); await sleep(300); await A.evaluate(() => { const m = window.__hsg.me, C = m.bumperG.clouds[0]; m.body.v[0] = Math.sign(C.x - m.body.p[0]) * 4; }); await sleep(900);
const inSmoke = await B.evaluate((id) => !!window.__hsg.cars.get(id).inSmoke, await myId(A));
await sleep(8000);
ok(inSmoke, 'Alpha vanishes into the smoke on Bravo\'s screen');
await both('after the smoke clears', A, B);
// the ejector seat: the empty car blows up, Alpha floats down and drops in fresh
await A.evaluate(() => { const g = window.__hsg; g.applySetup({ ...g.account.setup, bumper: 'eject' }); }); await sleep(1200);
await A.keyboard.press('KeyQ'); await sleep(7000);
await both('after Alpha ejected and came back', A, B);
// a wreck and the respawn
await B.evaluate(() => { const m = window.__hsg.me; m.shield = 0; m.damage(500, null); });
await sleep(4500);
await both('after Bravo is wrecked and respawns', A, B);
// the match ends; in the lobby Bravo takes another colour and the host picks another map; START
await A.waitForFunction(() => window.__hsg.net.phase === 'lobby', null, { timeout: 40000 }); await sleep(800);
await B.click('#rlColors button[data-c="5"]'); await sleep(500);
await A.click('#rlMap button[data-m="graveyard"]'); await sleep(1200);
await A.click('#rlGo'); await sleep(3000);
const maps = [await A.evaluate(() => window.__hsg.map().id), await B.evaluate(() => window.__hsg.map().id)];
ok(maps.every((m) => m === 'graveyard'), `the next match is on the new map on both (${maps})`);
await near(A, 0); await near(B, 6); await sleep(1800);
await both('match 2 on the new map, Bravo in a new colour', A, B);
// a late joiner drives in and everyone sees everyone
const C = await page('Charlie');
await C.click('#btnCoop'); await sleep(300); await C.fill('#optRoom', code); await C.click('#btnJoin');
await C.waitForSelector('#roomLobby:not([hidden])'); await sleep(600); await C.click('#rlGo');
await C.waitForFunction(() => window.__hsg.me, null, { timeout: 15000 }); await sleep(2000);
await near(C, 3); await sleep(1500);
await check('late joiner Charlie on A', A, C); await check('late joiner Charlie on B', B, C); await check('A on Charlie', C, A); await check('B on Charlie', C, B);
ok((await C.evaluate(() => window.__hsg.map().id)) === 'graveyard', 'the late joiner is on the room\'s map');
// Bravo's phone switches apps for 6 s (no updates): the others keep Bravo on screen, marked away
await B.evaluate(() => { const n = window.__hsg.net; n._send = n.send; n.send = (t, m) => { if (t !== 'car') n._send(t, m); }; });
await sleep(6000);
const idB = await myId(B);
const away = await A.evaluate((id) => { const c = window.__hsg.cars.get(id); return c ? { drawn: c.holder.enabled, away: !!c.away } : null; }, idB);
ok(away && away.drawn && away.away, `a player gone quiet for 6 s stays on screen, marked away (${JSON.stringify(away)})`);
await B.evaluate(() => { const n = window.__hsg.net; n.send = n._send; });
await sleep(1500);
const back = await A.evaluate((id) => { const c = window.__hsg.cars.get(id); return c ? { drawn: c.holder.enabled, away: !!c.away } : null; }, idB);
ok(back && back.drawn && !back.away, 'and is back to normal when updates resume');
await A.screenshot({ path: `${SHOTS}syncaudit-A.png` }); await B.screenshot({ path: `${SHOTS}syncaudit-B.png` });
const errs = [A, B, C].flatMap((p) => p.errors);
ok(errs.length === 0, `no page errors ${errs.slice(0, 3).join(' | ')}`);
await browser.close();

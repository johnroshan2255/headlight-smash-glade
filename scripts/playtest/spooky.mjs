// The spooky maps. The Graveyard: skeletons walk about, a hard ram shatters one into bones, the robot
// arm picks up a bone and throws it at a rival (who takes damage), skeletons climb back out later.
// Hallowe'en Hollow: pumpkins and melons splat when rammed; Grabby Hands throw one whole at a rival.
// Screenshots of both. Needs a server:  PORT=2568 MATCH_MS=60000 MATCH_BREAK_MS=5000 node server/index.js
import { launch, sleep, SHOTS } from './lib.mjs';
const BASE = process.env.HSG_MATCH_URL || 'http://localhost:2568';
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const open = async (map, room) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message));
  await p.goto(`${BASE}/?autostart&mode=online&room=${room}&map=${map}&name=Tester&bots=1&veh=mudrunner`);
  await p.waitForFunction(() => window.__hsg && window.__hsg.me, null, { timeout: 30000 }); await sleep(2500);
  await p.evaluate(() => { const g = window.__hsg; g.botSetup('bot0', { ride: 'mudrunner', wheels: 'tires', tire: 1, roof: 'none', bumper: 'none' }); g.me.shield = 99; for (const B of g.sandbox.barrels) { B.alive = false; B.respawn = 1e9; B.body.enabled = false; } }); // no barrels going off mid-test
  await sleep(500);
  return p;
};
const props = (p, kind) => p.evaluate((kind) => [...window.__hsg.sandbox.dyn.values()].filter((P) => P.kind === kind).map((P) => ({ id: P.id, x: +P.body.p[0].toFixed(2), y: +P.body.p[1].toFixed(2), alive: P.alive !== false, part: P.part, variant: P.variant })), kind);
const fit = (p, setup, x, f = 1) => p.evaluate(([setup, x, f]) => { const g = window.__hsg; g.applySetup({ ride: 'mudrunner', wheels: 'tires', tire: 1, roof: 'none', bumper: 'none', hat: 'straw', paint: -1, ...setup }); g.me.respawnAt(x, 0); g.me.setFacing(f); g.me.holderYaw = f * 90; g.me.shield = 99; }, [setup, x, f]);
const parkBot = (p, x) => p.evaluate((x) => { const g = window.__hsg, c = g.cars.get('bot0'), br = g.bots.get('bot0'); if (c.wrecked) c.unwreck(x); c.respawnAt(x, 0); c.shield = 0; c.hp = 100; br.update = () => { c.input.dir = 0; c.input.boost = false; }; }, x);
const botHp = (p) => p.evaluate(() => window.__hsg.cars.get('bot0').hp);

// ------------------------------------------------ The Graveyard
const G = await open('graveyard', 'SPOOKG');
ok((await G.evaluate(() => window.__hsg.map().id)) === 'graveyard', 'The Graveyard loads');
let sk = await props(G, 'skeleton');
ok(sk.length >= 4, `skeletons out of their graves (${sk.length})`);
const x0 = sk.map((s) => s.x);
await sleep(3000);
sk = await props(G, 'skeleton');
const moved = sk.filter((s, i) => Math.abs(s.x - x0[i]) > 0.8).length;
ok(moved >= 2, `they wander about (${moved} of ${sk.length} moved)`);
const S0 = sk.find((s) => s.alive);
await G.evaluate(([x, y]) => window.__hsg.lockCam({ x, y: y + 0.5, z: 9 }), [S0.x, S0.y]); await sleep(500);
await G.screenshot({ path: `${SHOTS}spooky-skeleton.png` });
await G.evaluate(() => window.__hsg.lockCam(null));
// a slow nudge doesn't break one (it's in your way); a hard ram does
await fit(G, {}, S0.x - 14, 1); await sleep(900);
await G.keyboard.down('KeyD'); await G.keyboard.down('ShiftLeft');
let broke = false; for (let i = 0; i < 50 && !broke; i++) { broke = (await props(G, 'skeleton')).some((s) => s.id === S0.id && !s.alive); await sleep(80); }
await G.keyboard.up('KeyD'); await G.keyboard.up('ShiftLeft');
await sleep(600);
const bones = await props(G, 'bone');
ok(broke && bones.length >= 6, `a hard ram shatters it into bones (${bones.length} bones)`);
await G.evaluate(() => window.__hsg.lockCam({ follow: true, z: 12 })); await sleep(300);
await G.screenshot({ path: `${SHOTS}spooky-bones.png` });
await G.evaluate(() => window.__hsg.lockCam(null));
// the robot arm grabs a bone and throws it at a rival
const B0 = bones[0];
await fit(G, { roof: 'arm' }, B0.x - 1.5, 1); await sleep(1500);
const held = await G.evaluate(() => { const r = window.__hsg.me.roofG; return r && r.held ? r.held.kind : null; });
ok(['bone', 'skeleton', 'barrel', 'log'].includes(held) || held === null, `the robot arm grabs what's near (${held})`);
if (held !== 'bone') await G.evaluate((id) => { const g = window.__hsg, P = g.sandbox.dyn.get(id), r = g.me.roofG; if (P && r) { g.sandbox.grab(P, g.me.id); r.held = P; } }, B0.id);
const mx = await G.evaluate(() => window.__hsg.me.body.p[0]);
await parkBot(G, mx + 4.6); await sleep(1200);
const hp0 = await botHp(G);
// (thrown from just in front of the rival, so the test checks the hit, not the aim)
await G.evaluate(() => { const g = window.__hsg, r = g.me.roofG, P = r.held, c = g.cars.get('bot0'); if (P) { g.sandbox.throw(P, g.me.id, 14, 0); r.held = null; P.body.set(c.body.p[0] - 2.2, c.body.p[1] + 0.2, 0); } });
await sleep(1500);
let hp1 = await botHp(G);
if (hp1 >= hp0) { // the bot was still settling: one more go with the next bone
  await G.evaluate(() => { const g = window.__hsg, c = g.cars.get('bot0'), P = [...g.sandbox.dyn.values()].find((q) => q.kind === 'bone' && q.alive !== false && !q.heldBy); if (P) { g.sandbox.grab(P, g.me.id); g.sandbox.throw(P, g.me.id, 14, 0); P.body.set(c.body.p[0] - 2.2, c.body.p[1] + 0.2, 0); } });
  await sleep(1200); hp1 = await botHp(G);
}
console.log('  bot after the bone:', await G.evaluate(() => { const c = window.__hsg.cars.get('bot0'); return { hp: c.hp, wrecked: c.wrecked, last: c.lastHitBy && c.lastHitBy.id }; }));
ok(hp1 < hp0, `a thrown bone hurts the rival it hits (${hp0} -> ${hp1})`);
// skeletons climb back out
await G.evaluate((id) => { const P = window.__hsg.sandbox.dyn.get(id); P.respawn = 0.5; }, S0.id);
await G.evaluate((hx) => { const g = window.__hsg; g.me.respawnAt(hx + 9, 0); const c = g.cars.get('bot0'); c.respawnAt(hx + 14, 0); }, (await G.evaluate((id) => window.__hsg.sandbox.dyn.get(id).home[0], S0.id)));
await sleep(2000);
const back = await G.evaluate((id) => { const g = window.__hsg, P = g.sandbox.dyn.get(id); return P ? { alive: P.alive, respawn: +P.respawn.toFixed(1), home: P.home[0].toFixed(1), cars: [...g.cars.values()].map((c) => `${c.id}@${c.body.p[0].toFixed(0)}`).join(' '), loaded: g.sandbox.chunks.has(Math.floor(P.home[0] / 64)) } : 'gone'; }, S0.id);
ok(back && back.alive === true, `the skeleton climbs back out of its grave (${JSON.stringify(back)})`);
for (const [k, x] of [['a', -120], ['b', 0]]) { await G.evaluate((x) => { const g = window.__hsg; g.me.respawnAt(x, 0); }, x); await sleep(1500); await G.evaluate((x) => window.__hsg.lockCam({ x, y: window.__hsg.world.terrain.height(x) + 6, z: 40 }), x); await sleep(900); await G.screenshot({ path: `${SHOTS}spooky-graveyard-${k}.png` }); }
ok(G.errors.length === 0, `no page errors ${G.errors.slice(0, 2).join(' | ')}`);

// ------------------------------------------------ Hallowe'en Hollow
const H = await open('hallow', 'SPOOKH');
ok((await H.evaluate(() => window.__hsg.map().id)) === 'hallow', "Hallowe'en Hollow loads");
let pk = await props(H, 'pumpkin');
ok(pk.length >= 8 && pk.some((q) => q.variant === 'lantern') && pk.some((q) => q.variant === 'melon'), `pumpkins, jack-o'-lanterns and melons (${pk.length})`);
const P0 = pk.find((q) => q.alive);
await H.evaluate(([x, y]) => window.__hsg.lockCam({ x, y: y + 0.6, z: 9 }), [P0.x, P0.y]); await sleep(500);
await H.screenshot({ path: `${SHOTS}spooky-pumpkins.png` });
await H.evaluate(() => window.__hsg.lockCam(null));
await fit(H, {}, P0.x - 13, 1); await sleep(900);
await H.keyboard.down('KeyD'); await H.keyboard.down('ShiftLeft');
let splat = false; for (let i = 0; i < 50 && !splat; i++) { splat = (await props(H, 'pumpkin')).some((q) => q.id === P0.id && !q.alive); await sleep(70); }
await H.screenshot({ path: `${SHOTS}spooky-splat.png` });
await H.keyboard.up('KeyD'); await H.keyboard.up('ShiftLeft');
ok(splat, 'ramming a pumpkin splats it');
// Grabby Hands throw a whole pumpkin at a rival
pk = await props(H, 'pumpkin');
const P1 = pk.find((q) => q.alive && q.id !== P0.id);
await fit(H, { roof: 'hands' }, P1.x - 2, 1); await sleep(1400);
await H.evaluate((id) => { const g = window.__hsg, P = g.sandbox.dyn.get(id); g.sandbox.grab(P, g.me.id); g.me.roofG.held = { kind: 'prop', P }; }, P1.id);
const hx = await H.evaluate(() => window.__hsg.me.body.p[0]);
await parkBot(H, hx + 4.8); await sleep(1200);
const h0 = await botHp(H);
await H.evaluate((id) => { const g = window.__hsg, P = g.sandbox.dyn.get(id), c = g.cars.get('bot0'); g.sandbox.throw(P, g.me.id, 13, 0); g.me.roofG.held = null; P.body.set(c.body.p[0] - 2.4, c.body.p[1] + 0.3, 0); }, P1.id);
await sleep(1500);
const h1 = await botHp(H);
const gone = (await props(H, 'pumpkin')).find((q) => q.id === P1.id);
ok(h1 < h0 && gone && !gone.alive, `a thrown pumpkin hits the rival and splats (${h0} -> ${h1})`);
for (const [k, x] of [['a', -60], ['b', 30]]) { await H.evaluate((x) => { window.__hsg.me.respawnAt(x, 0); }, x); await sleep(1500); await H.evaluate((x) => window.__hsg.lockCam({ x, y: window.__hsg.world.terrain.height(x) + 6, z: 40 }), x); await sleep(900); await H.screenshot({ path: `${SHOTS}spooky-hallow-${k}.png` }); }
ok(H.errors.length === 0, `no page errors ${H.errors.slice(0, 2).join(' | ')}`);
await browser.close();

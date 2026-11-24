// Two headless players in room TEST1. Checks: both see each other, one host, bots only on the host,
// props stay in sync, a barrel blast reaches the guest, host hand-over when the host leaves.
import { launch, open, sleep, SHOTS } from './lib.mjs';
const browser = await launch();
const room = 'T' + Math.floor(Math.random() * 9000 + 1000);
const q = (veh, name, extra = '') => `autostart&mode=online&veh=${veh}&gpu=webgl2&room=${room}&name=${name}${extra}`;
const A = await open(browser, { query: q('kart', 'Alpha', process.env.NOBOTS ? '&bots=0' : '') });
await sleep(1500);
const B = await open(browser, { query: q('dozer', 'Bravo') });
await sleep(4000);
const info = (p) => p.evaluate(() => { const g = window.__hsg; return { id: g.net.id, host: g.net.isHost, online: g.net.online, players: g.net.players.length, cars: [...g.cars.values()].map((c) => `${c.name}${c.local ? '*' : ''}`).sort().join(','), bots: g.bots.size, bodies: g.physics.bodies.length }; });
let a = await info(A.page), b = await info(B.page);
console.log('A', JSON.stringify(a)); console.log('B', JSON.stringify(b));
const ok = (cond, msg) => console.log(cond ? 'PASS' : 'FAIL', msg);
ok(a.online && b.online, 'both online');
ok(a.host !== b.host, 'exactly one host');
ok(a.players === 2 && b.players === 2, 'roster has 2 players');
ok(a.bots === (process.env.NOBOTS ? 0 : 4) && b.bots === 0, 'host runs the bots, guest none');
ok(b.cars.includes('Alpha') && a.cars.includes('Bravo'), 'each sees the other');
// remote car tracks: drive B right for 2 s, compare B's own x with A's view of B
await B.page.evaluate(() => { const m = window.__hsg.me; m.respawnAt(1.5, 0); });
await B.page.keyboard.down('KeyD'); await sleep(2000); await B.page.keyboard.up('KeyD'); await sleep(600);
const bx = await B.page.evaluate(() => window.__hsg.me.body.p[0]);
const bxOnA = await A.page.evaluate((id) => window.__hsg.cars.get(id)?.body.p[0], b.id);
ok(Math.abs(bx - bxOnA) < 1.5, `remote car tracks (B own x ${bx.toFixed(1)}, A sees ${bxOnA?.toFixed(1)})`);
// props in sync: every barrel within 0.5 m on both
const props = (p) => p.evaluate(() => window.__hsg.sandbox.barrels.map((B) => [B.alive ? 1 : 0, +B.body.p[0].toFixed(1), +B.body.p[1].toFixed(1), Math.hypot(B.body.v[0], B.body.v[1]) + Math.abs(B.body.w) + (B.fuse > 0 ? 9 : 0)]));
await sleep(2500);
const pa = await props(A.page), pb = await props(B.page);
const settled = pa.filter((r) => r[3] < 0.1); // host-side resting barrels (moving ones are mid-snapshot)
const off = pa.filter((r, i) => r[3] < 0.1 && (r[0] !== pb[i][0] || (r[0] && Math.hypot(r[1] - pb[i][1], r[2] - pb[i][2]) > 0.6)));
ok(off.length === 0, `resting barrels in sync (${settled.length}/${pa.length} resting, ${off.length} off)`);
// guest rams a barrel: host must light it, guest sees the boom and gets pushed
const flat = [-36, 33, 46, 80];
const target = await A.page.evaluate((flat) => window.__hsg.sandbox.barrels.find((q) => q.alive && q.fuse <= 0 && flat.some((x) => Math.abs(q.home[0] - x) < 1.5) && Math.abs(q.body.p[0] - q.home[0]) < 0.5).id, flat);
await B.page.evaluate((id) => { const P = window.__hsg.sandbox.dyn[id]; const m = window.__hsg.me; m.respawnAt(P.body.p[0] - 10, 0); m.setFacing(1); m.holderYaw = 90; m.shield = 0; m.hp = 100; }, target);
await sleep(700);
let booms = 0; await B.page.exposeFunction('__boom', () => booms++);
await B.page.evaluate(() => { const g = window.__hsg; const old = g.fx.explosion.bind(g.fx); g.fx.explosion = (...a) => { window.__boom(); return old(...a); }; });
await B.page.evaluate(() => { const n = window.__hsg.net; window.__sent = []; const o = n.send.bind(n); n.send = (t, m) => { if (t === 'hitProp') window.__sent.push(m); return o(t, m); }; });
const bInfo = await B.page.evaluate((id) => { const P = window.__hsg.sandbox.dyn[id]; return { x: P.body.p[0].toFixed(1), me: window.__hsg.me.body.p[0].toFixed(1) }; }, target);
console.log('target barrel', target, JSON.stringify(bInfo));
await B.page.keyboard.down('KeyD'); await B.page.keyboard.down('ShiftLeft'); await sleep(1500); await B.page.keyboard.up('KeyD'); await B.page.keyboard.up('ShiftLeft');
await sleep(1500);
console.log('hitProp sent by guest', JSON.stringify(await B.page.evaluate(() => window.__sent)));
const aliveOnA = await A.page.evaluate((id) => window.__hsg.sandbox.dyn[id].alive, target);
const bHp = await B.page.evaluate(() => Math.round(window.__hsg.me.hp));
ok(!aliveOnA && booms > 0, `guest's ram blew the barrel on the host (alive on A: ${aliveOnA}, booms seen by B: ${booms}, B hp ${bHp})`);
await B.page.screenshot({ path: `${SHOTS}mp-guest.png` });
// host leaves: B takes over the props and the bots
await A.page.context().close();
await sleep(5000);
b = await info(B.page);
console.log('B after A left', JSON.stringify(b));
ok(b.host && b.bots === 5 && !b.cars.includes('Alpha'), 'B became host, runs 5 bots, Alpha gone');
const kin = await B.page.evaluate(() => window.__hsg.sandbox.dyn.filter((P) => P && P.body.kinematic && !P.held).length);
ok(kin === 0, `B simulates the props now (${kin} still kinematic)`);
console.log('errors A', A.errors.length ? A.errors.slice(0, 4) : 'none');
console.log('errors B', B.errors.length ? B.errors.slice(0, 4) : 'none');
await browser.close();

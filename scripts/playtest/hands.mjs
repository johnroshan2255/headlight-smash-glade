// Grabby Hands: grab a rival and throw it, grab a barrel, and two players' hands on the same car
// tear it in two (the owner decides; the other browser sees the split too).
import { launch, open, sleep, SHOTS } from './lib.mjs';
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const room = 'H' + Math.floor(Math.random() * 9000 + 1000);
const q = (name, bots) => `autostart&mode=online&veh=mudrunner&gpu=webgl2&room=${room}&name=${name}&bots=${bots}`;
const A = await open(browser, { query: q('Alpha', 2) });
await sleep(1200);
const B = await open(browser, { query: q('Bravo', 0) });
await sleep(3000);
const fit = (P, s) => P.page.evaluate((s) => window.__hsg.applySetup({ ride: 'mudrunner', wheels: 'tires', tire: 1, roof: 'hands', bumper: 'none', hat: 'straw', ...s }), s);
const place = (P, x, f) => P.page.evaluate(([x, f]) => { const m = window.__hsg.me; m.respawnAt(x, 0); m.setFacing(f); m.holderYaw = f * 90; m.shield = 0; m.hp = 100; }, [x, f]);
const bot = () => A.page.evaluate(() => { const c = window.__hsg.cars.get('bot0'); return c && { x: +c.body.p[0].toFixed(1), y: +c.body.p[1].toFixed(1), g: +(c.body.p[1] - window.__hsg.world.terrain.height(c.body.p[0])).toFixed(1), wrecked: !!c.wrecked, torn: !!c.torn, halves: !!c.halves, vx: +c.body.v[0].toFixed(1) }; });
const pinBot = (x) => A.page.evaluate((x) => { const c = window.__hsg.cars.get('bot0'), br = window.__hsg.bots.get('bot0'); if (!c) return; if (c.wrecked) c.unwreck(x); c.respawnAt(x, 0); c.shield = 0; c.hp = 100; c.input.dir = 0; br.update = () => { c.input.dir = 0; c.input.boost = false; }; }, x);
await A.page.evaluate(() => window.__hsg.botSetup('bot0', { ride: 'mudrunner', wheels: 'tires', tire: 1, roof: 'none', bumper: 'none' }));
await fit(A, {}); await fit(B, {});
await sleep(1500);
// 1. A grabs the bot and holds it overhead, then throws it
await place(A, 0.5, 1); await pinBot(4.2); await place(B, -30, 1);
await sleep(1500);
await A.page.keyboard.press('KeyE'); await sleep(900);
let s = await bot();
ok(s && s.g > 2.2, `A's hands lift the bot overhead (${s && s.g} m up)`);
await A.page.screenshot({ path: `${SHOTS}hands-hold.png` });
await A.page.keyboard.press('KeyE'); await sleep(250);
s = await bot();
ok(s && Math.abs(s.vx) > 6, `A throws it (vx ${s && s.vx})`);
await sleep(1500);
// 2. a barrel
const bx = await A.page.evaluate(() => { const T = window.__hsg.world.terrain; const B = window.__hsg.sandbox.barrels.find((b) => b.alive && b.fuse <= 0 && Math.abs(T.slope(b.body.p[0])) < 0.06 && Math.abs(T.slope(b.body.p[0] - 3)) < 0.06); return B && B.body.p[0]; });
if (bx !== undefined) {
  await place(A, bx - 2.8, 1); await sleep(1200);
  await sleep(400); // let the car settle after being placed
  await A.page.keyboard.press('KeyE'); await sleep(500);
  const held = await A.page.evaluate(() => { const h = window.__hsg.me.roofG.held; return h && h.kind; });
  ok(held === 'prop' || held === 'car', `A's hands grab the nearest thing (${held})`);
  await A.page.keyboard.press('KeyE'); await sleep(800);
}
// 3. the tear: A and B both grab the bot
await pinBot(20); await place(A, 10, 1); await place(B, 30, -1);
await sleep(1800);
const bx2 = (await bot()).x;
await place(A, bx2 - 3.3, 1); await place(B, bx2 + 3.3, -1);
await sleep(700);
await Promise.all([A.page.keyboard.press('KeyE'), B.page.keyboard.press('KeyE')]);
await sleep(120);
console.log('  held A:', await A.page.evaluate(() => { const h = window.__hsg.me.roofG.held; return h ? h.kind + ':' + (h.car ? h.car.id : h.P.kind) : null; }), ' held B:', await B.page.evaluate(() => { const h = window.__hsg.me.roofG.held; return h ? h.kind + ':' + (h.car ? h.car.id : h.P.kind) : null; }), ' grabbers:', await A.page.evaluate(() => JSON.stringify([...(window.__hsg.cars.get('bot0').grabbers || [])].map(([id, t]) => [id, Math.round(t - performance.now())]))), ' A cd', await A.page.evaluate(() => window.__hsg.me.roofG.cd));
await sleep(230);
await A.page.screenshot({ path: `${SHOTS}hands-tear-a.png` });
await B.page.screenshot({ path: `${SHOTS}hands-tear-b.png` });
await sleep(400);
const onA = await bot();
const onB = await B.page.evaluate(() => { const c = window.__hsg.cars.get('bot0'); return c && { torn: !!c.torn, halves: !!c.halves, wrecked: !!c.wrecked }; });
const feedA = await A.page.textContent('#feed');
ok(onA && onA.torn && onA.halves, `the bot (owned by A) tore in two (${JSON.stringify(onA)})`);
ok(onB && onB.torn && onB.halves, `B saw it tear in two too (${JSON.stringify(onB)})`);
ok(/tore/.test(feedA), `the feed says so: "${feedA.slice(0, 60)}"`);
await sleep(3500);
const after = await bot();
ok(after && !after.halves, 'the halves are cleaned up afterwards');
ok(A.errors.length + B.errors.length === 0, `no errors ${[...A.errors, ...B.errors].slice(0, 3).join(' | ')}`);
await browser.close();

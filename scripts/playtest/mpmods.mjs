// Garage mods across the network: B sees A's loadout, and A's boxing glove / wrecking ball hit B
// (the hit is applied by B's own browser, which owns B's car).
import { launch, open, sleep } from './lib.mjs';
const browser = await launch();
const room = 'M' + Math.floor(Math.random() * 9000 + 1000);
const q = (name) => `autostart&mode=online&veh=mudrunner&gpu=webgl2&room=${room}&name=${name}&bots=0`;
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const A = await open(browser, { query: q('Alpha') });
await sleep(1200);
const B = await open(browser, { query: q('Bravo') });
await sleep(3000);
const idB = await B.page.evaluate(() => window.__hsg.me.id), idA = await A.page.evaluate(() => window.__hsg.me.id);
// A fits a wrecking ball and a boxing glove, on spider legs
await A.page.evaluate(() => window.__hsg.applySetup({ ride: 'hearse', wheels: 'spider', tire: 1, roof: 'ball', bumper: 'glove', hat: 'crown' }));
await sleep(1500);
const seen = await B.page.evaluate((id) => { const c = window.__hsg.cars.get(id); return c && { ride: c.vehicle, wheels: c.setup.wheels, roof: c.setup.roof, bumper: c.setup.bumper, glove: !!c.bumperG, ball: !!c.roofG }; }, idA);
ok(seen && seen.ride === 'hearse' && seen.wheels === 'spider' && seen.glove && seen.ball, `B sees A's loadout (${JSON.stringify(seen)})`);
// line them up: A at x, B 3 m ahead of A's nose
const place = async (P, x, f) => P.page.evaluate(([x, f]) => { const m = window.__hsg.me; m.respawnAt(x, 0); m.setFacing(f); m.holderYaw = f * 90; m.shield = 0; m.hp = 100; }, [x, f]);
await place(A, 0.5, 1); await place(B, 4.3, -1);
await sleep(1600);
const before = await B.page.evaluate(() => ({ hp: window.__hsg.me.hp, x: window.__hsg.me.body.p[0] }));
await A.page.keyboard.press('KeyQ');
await sleep(150);
const punchSeen = await B.page.evaluate((id) => { const c = window.__hsg.cars.get(id); return c && c.bumperG && c.bumperG.netT; }, idA);
await sleep(900);
const after = await B.page.evaluate(() => ({ hp: window.__hsg.me.hp, x: window.__hsg.me.body.p[0] }));
ok(after.hp < before.hp && after.x - before.x > 1, `A's glove punched B on B's screen (hp ${Math.round(before.hp)} -> ${Math.round(after.hp)}, pushed ${(after.x - before.x).toFixed(1)} m)`);
ok(punchSeen > 0, `B saw the punch animate (${punchSeen})`);
// the wrecking ball, swung into B
await place(A, 0.5, 1); await place(B, -2.2, 1);
await sleep(1500);
const b2 = await B.page.evaluate(() => window.__hsg.me.hp);
await A.page.keyboard.down('KeyA'); await sleep(250); await A.page.keyboard.up('KeyA');
await A.page.keyboard.press('KeyE'); await sleep(1500);
const ballSeen = await B.page.evaluate((id) => { const c = window.__hsg.cars.get(id); return c && c.roofG && c.roofG.netP; }, idA);
const a2 = await B.page.evaluate(() => window.__hsg.me.hp);
ok(Array.isArray(ballSeen), `B sees A's wrecking ball position (${JSON.stringify(ballSeen)})`);
console.log(`  (ball swing on B: hp ${Math.round(b2)} -> ${Math.round(a2)})`);
ok(A.errors.length + B.errors.length === 0, `no errors ${[...A.errors, ...B.errors].slice(0, 3).join(' | ')}`);
await browser.close();

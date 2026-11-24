// Does every tool actually do its job? Each one against a parked bot (and props) in solo.
import { launch, open, sleep, emptyGlade } from './lib.mjs';
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const { page, errors } = await open(browser, { query: 'autostart&mode=solo&veh=mudrunner&gpu=webgl2&bots=1' });
await sleep(1500);
await page.evaluate(() => window.__hsg.botSetup('bot0', { ride: 'mudrunner', wheels: 'tires', tire: 1, roof: 'none', bumper: 'none' }));
await emptyGlade(page);
// a flat stretch near camp
const X = await page.evaluate(() => { const T = window.__hsg.world.terrain; for (let x = -4; x > -60; x -= 0.5) { let flat = true; for (let k = -10; k <= 10; k++) if (Math.abs(T.slope(x + k)) > 0.08) { flat = false; break; } if (flat) return x; } return 0; });
const fit = (slot, id, x = X, f = 1) => page.evaluate(([slot, id, x, f]) => { const g = window.__hsg; g.applySetup({ ride: 'mudrunner', wheels: 'tires', tire: 1, roof: 'none', bumper: 'none', hat: 'straw', paint: -1, [slot]: id }); g.me.respawnAt(x, 0); g.me.setFacing(f); g.me.holderYaw = f * 90; g.me.shield = 99; }, [slot, id, x, f]);
const target = (x) => page.evaluate((x) => { const g = window.__hsg, c = g.cars.get('bot0'), br = g.bots.get('bot0'); if (c.wrecked) c.unwreck(x); c.respawnAt(x, 0); c.shield = 0; c.hp = 100; br.update = () => { c.input.dir = 0; c.input.boost = false; c.input.hop = false; }; c.gadget = null; }, x);
const T = () => page.evaluate(() => { const c = window.__hsg.cars.get('bot0'), b = c.body; return { x: b.p[0], y: b.p[1], vy: b.v[1], hp: c.hp, wrecked: !!c.wrecked }; });
const me = () => page.evaluate(() => { const b = window.__hsg.me.body; return { x: b.p[0], y: b.p[1], vx: b.v[0], vy: b.v[1] }; });
let booms = 0;
await page.exposeFunction('__boomed', () => booms++);
await page.evaluate(() => { const fx = window.__hsg.fx, o = fx.explosion.bind(fx); fx.explosion = (...a) => { window.__boomed(); return o(...a); }; });

// glove
await fit('bumper', 'glove'); await target(X + 3.8); await sleep(1300);
let t0 = await T(); await page.keyboard.press('KeyQ'); await sleep(700); let t1 = await T();
ok(t1.hp < t0.hp && t1.x - t0.x > 2, `boxing glove: punch lands (hp ${t0.hp | 0} -> ${t1.hp | 0}, pushed ${(t1.x - t0.x).toFixed(1)} m)`);
// wrecking ball: whip it forward into a car ahead
await fit('roof', 'ball'); await target(X + 3.2); await sleep(1600);
t0 = await T(); await page.keyboard.press('KeyE');
const trail = []; for (let i = 0; i < 16; i++) { trail.push(await page.evaluate(() => { const g = window.__hsg, B = g.me.roofG, c = g.cars.get('bot0'); return [+(B.p[0] - g.me.body.p[0]).toFixed(1), +(B.p[1] - g.me.body.p[1]).toFixed(1), +(c.body.p[0] - g.me.body.p[0]).toFixed(1)]; })); await sleep(70); }
console.log('  ball (rel x, rel y, target rel x):', JSON.stringify(trail));
t1 = await T();
ok(t1.hp < t0.hp, `wrecking ball: swing hits (hp ${t0.hp | 0} -> ${t1.hp | 0})`);
// magnet: pull in, then blast out
await fit('roof', 'magnet'); await target(X + 7.5); await sleep(1300);
t0 = await T(); await page.keyboard.press('KeyE');
const rel = async () => { const t = await T(), m = await me(); return { x: t.x - m.x, y: t.y - m.y }; };
const mtrail = []; for (let i = 0; i < 12; i++) { const r = await rel(); mtrail.push(`${r.x.toFixed(1)},${r.y.toFixed(1)}`); await sleep(150); }
console.log('  magnet target (rel x,y):', mtrail.join(' '));
const held = await rel(); t1 = await T();
ok(Math.abs(held.x) < 2 && held.y > 0.8 && Math.abs(t0.x - X) > 6, `magnet: pulls the target in and holds it over the roof (rel ${held.x.toFixed(1)}, ${held.y.toFixed(1)})`);
await page.keyboard.press('KeyE'); await sleep(700); const blown = await rel();
ok(Math.hypot(blown.x, blown.y) > 4, `magnet: second press blasts it away (${Math.hypot(blown.x, blown.y).toFixed(1)} m off)`);
// mortar: four rockets that go bang
await fit('roof', 'mortar'); await target(X + 40); await sleep(1200);
booms = 0; await page.keyboard.press('KeyE'); await sleep(3500);
ok(booms >= 3, `mortar: rockets explode (${booms} explosions)`);
// balloon: launch up, open at the top: a slow fall
await fit('roof', 'balloon'); await target(X + 40); await sleep(1200);
await page.evaluate(() => { const b = window.__hsg.me.body; b.v[1] = 13; });
await sleep(700); await page.keyboard.press('KeyE'); await sleep(900);
const fall = await me();
ok(fall.vy > -3.2 && fall.vy < 0.5, `balloon: opens and floats down (vy ${fall.vy.toFixed(1)})`);
// harpoon: hook a car 9 m ahead and reel in
await fit('bumper', 'harpoon'); await target(X + 9); await sleep(1300);
const m0 = await me(); await page.keyboard.press('KeyQ'); await sleep(1600); const m1 = await me();
const hooked = await page.evaluate(() => { const h = window.__hsg.me.bumperG.hook; return h && h.stuck && h.stuck.kind; });
ok(!!hooked && m1.x - m0.x > 2, `harpoon: hooks (${hooked}) and reels in (${(m1.x - m0.x).toFixed(1)} m)`);
await page.keyboard.press('KeyQ');
// cow-catcher: ram a car and scoop it up
await fit('bumper', 'catcher'); await target(X + 9); await sleep(1200);
await page.keyboard.down('KeyD'); await page.keyboard.down('ShiftLeft');
let maxVy = -99; for (let i = 0; i < 22; i++) { maxVy = Math.max(maxVy, (await T()).vy); await sleep(60); }
await page.keyboard.up('KeyD'); await page.keyboard.up('ShiftLeft');
ok(maxVy > 5, `cow-catcher: scoops the car up (its vy peaked at ${maxVy.toFixed(1)})`);
// ember jets: burn a car alongside and light a barrel
await fit('bumper', 'flame'); await target(X + 2.6); await sleep(1300);
const bar = await page.evaluate((x) => { const S = window.__hsg.sandbox, B = S.barrels[0]; if (!B) return null; B.alive = true; B.fuse = 0; B.respawn = 0; B.body.enabled = true; B.body.set(x, window.__hsg.world.terrain.height(x) + 0.5, 0); B.body.v[0] = B.body.v[1] = 0; return B.id; }, X - 2.4);
t0 = await T(); booms = 0; await page.keyboard.press('KeyQ'); await sleep(1600); t1 = await T();
ok(t1.hp < t0.hp, `ember jets: scorch the car alongside (hp ${t0.hp | 0} -> ${t1.hp | 0})`);
ok(bar === null || booms > 0, `ember jets: light the barrel behind (${booms} explosions)`);
// robot arm: grab and throw a barrel
await fit('roof', 'arm'); await target(X + 40); await sleep(900);
await page.evaluate((x) => { const S = window.__hsg.sandbox, B = S.barrels[0]; if (!B) return; B.alive = true; B.fuse = 0; B.body.enabled = true; B.body.kinematic = false; B.heldBy = null; B.body.noBodyCollide = false; B.body.set(x, window.__hsg.world.terrain.height(x) + 0.5, 0); B.body.v[0] = B.body.v[1] = 0; }, X + 2.2);
await sleep(900);
const grabbed = await page.evaluate(() => !!window.__hsg.me.roofG.held);
await page.keyboard.press('KeyE'); await sleep(600);
const thrown = await page.evaluate(() => !window.__hsg.me.roofG.held);
ok(grabbed && thrown, `robot arm: grabs a barrel by itself and throws it (${grabbed}, ${thrown})`);
// grabby hands: lift the car
await fit('roof', 'hands'); await target(X + 3.2); await sleep(1300);
await page.keyboard.press('KeyE'); await sleep(900);
const lifted = await T();
ok(lifted.y - (await page.evaluate(() => window.__hsg.me.body.p[1])) > 1.2, `grabby hands: lift the car overhead (${(lifted.y).toFixed(1)})`);
await page.keyboard.press('KeyE'); await sleep(500);
ok(errors.length === 0, `no errors ${errors.slice(0, 3).join(' | ')}`);
await browser.close();

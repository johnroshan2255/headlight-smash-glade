// The new parts: balloon tires (bouncy, float, pop), magnet wheels (climb onto a car), square wheels
// (thump-thump), the oil slick (a car that drives through spins out) and the smoke bomb (a car in it
// vanishes, bots lose it). Solo, against one parked or scripted bot, plus close-up screenshots.
import { launch, open, sleep, emptyGlade, SHOTS } from './lib.mjs';
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const { page, errors } = await open(browser, { query: 'autostart&mode=solo&veh=mudrunner&gpu=webgl2&bots=1' });
await sleep(1500);
await page.evaluate(() => window.__hsg.botSetup('bot0', { ride: 'mudrunner', wheels: 'tires', tire: 1, roof: 'none', bumper: 'none' }));
await emptyGlade(page);
const X = await page.evaluate(() => { const T = window.__hsg.world.terrain; for (let x = -4; x > -80; x -= 0.5) { let flat = true; for (let k = -12; k <= 12; k++) if (Math.abs(T.slope(x + k)) > 0.06) { flat = false; break; } if (flat) return x; } return 0; });
const fit = (setup, x = X, f = 1) => page.evaluate(([setup, x, f]) => { const g = window.__hsg; g.applySetup({ ride: 'mudrunner', wheels: 'tires', tire: 1, roof: 'none', bumper: 'none', hat: 'straw', paint: -1, ...setup }); g.me.respawnAt(x, 0); g.me.setFacing(f); g.me.holderYaw = f * 90; g.me.shield = 99; }, [setup, x, f]);
const bot = (x, drive = 0, f = 1) => page.evaluate(([x, drive, f]) => { const g = window.__hsg, c = g.cars.get('bot0'), br = g.bots.get('bot0'); if (c.wrecked) c.unwreck(x); c.respawnAt(x, 0); c.setFacing(f); c.shield = 99; c.hp = 100; br.update = () => { c.input.dir = drive; c.input.boost = false; c.input.hop = false; }; c.gadget = null; }, [x, drive, f]);
const me = () => page.evaluate(() => { const m = window.__hsg.me, b = m.body; return { x: b.p[0], y: b.p[1], a: b.a, w: b.w, popped: m.popped, ground: window.__hsg.world.terrain.height(b.p[0]) }; });
const B = () => page.evaluate(() => { const c = window.__hsg.cars.get('bot0'), b = c.body; return { x: b.p[0], y: b.p[1], w: b.w, a: b.a, oil: c.oilT || 0, inSmoke: !!c.inSmoke, shown: c.holder.enabled }; });
const shot = async (name, x, y, z = 9) => { await page.evaluate(([x, y, z]) => window.__hsg.lockCam({ x, y, z }), [x, y, z]); await sleep(250); await page.screenshot({ path: `${SHOTS}nm-${name}.png` }); await page.evaluate(() => window.__hsg.lockCam(null)); };
const drive = async (ms, key = 'KeyD') => { await page.keyboard.down(key); const ys = []; for (let t = 0; t < ms; t += 50) { const m = await me(); ys.push(m.y - m.ground); await sleep(50); } await page.keyboard.up(key); return ys; };
const spread = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };

await bot(X + 300);
// ---- square wheels: they thump (the body bobs far more than on round tires) and still get going
await fit({ wheels: 'tires' }); await sleep(1200);
const roundYs = (await drive(1500)).slice(10);
await fit({ wheels: 'square' }); await sleep(1200);
await shot('square', X, (await me()).y, 7);
const m0 = await me(); const sqYs = (await drive(2500)).slice(10); const m1 = await me();
ok(spread(sqYs) > spread(roundYs) * 2 && spread(sqYs) > 0.03, `square wheels thump (body bob ${spread(sqYs).toFixed(3)} m vs ${spread(roundYs).toFixed(3)} on tires)`);
ok(m1.x - m0.x > 8, `square wheels still drive (${(m1.x - m0.x).toFixed(1)} m in 2.5 s)`);

// ---- balloon tires: drive, float on a pond, pop on a big hit (sit lower), fresh on respawn
await fit({ wheels: 'balloon' }); await sleep(1400);
await shot('balloon', X, (await me()).y, 7);
const bh = await me();
const b0 = await me(); await drive(2000); const b1 = await me();
ok(b1.x - b0.x > 8, `balloon tires drive (${(b1.x - b0.x).toFixed(1)} m)`);
await fit({ wheels: 'balloon' }); await sleep(1400);
const flat0 = await me();
await page.evaluate(() => { const m = window.__hsg.me; m.shield = 0; m.damage(20, null); m.shield = 99; });
await sleep(1500);
const flat1 = await me();
ok(flat1.popped && (flat1.y - flat1.ground) < (flat0.y - flat0.ground) - 0.12, `a 20-damage hit pops them: down on the rims (ride ${(flat0.y - flat0.ground).toFixed(2)} -> ${(flat1.y - flat1.ground).toFixed(2)} m)`);
await shot('balloon-popped', flat1.x, flat1.y, 7);
// a deep spot in a pond, away from its geysers
const pond = await page.evaluate((X) => { const T = window.__hsg.world.terrain; for (let d = 0; d < 3000; d += 1) for (const x of [X + d, X - d]) { const w = T.water(x); if (w !== null && T.water(x - 3) !== null && T.water(x + 3) !== null && w - T.height(x) > 0.8 && T.spec(x).geysers.every((gx) => Math.abs(gx - x) > 2.2)) return { x, w }; } return null; }, X);
if (pond) {
  await page.evaluate(() => { for (const g of window.__hsg.sandbox.geysers.values()) { g.phase = 0; g.t = 1e9; } }); // geysers off for this check
  await fit({ wheels: 'balloon' }, pond.x); await sleep(150);
  await page.evaluate(() => { for (const g of window.__hsg.sandbox.geysers.values()) { g.phase = 0; g.t = 1e9; } }); // (and the pond's own, now streamed in)
  await sleep(850);
  const hs = []; for (let i = 0; i < 20; i++) { hs.push((await me()).y - pond.w); await sleep(50); } // (before it skims off onto a geyser)
  hs.sort((a, b) => a - b);
  const f = { ...(await me()) }; f.y = pond.w + hs[10];
  console.log("  pond", JSON.stringify(pond), hs.map((v) => v.toFixed(1)).join(" "));
  ok(!f.popped && hs[10] > 0.3 && hs[10] < 3, `fresh balloon tires after respawn, and they float on the pond (body ${(f.y - pond.w).toFixed(2)} m above the water)`);
  await shot('balloon-pond', f.x, f.y, 9);
} else ok(false, 'found a pond to float on');

// ---- magnet wheels: drive into a parked car and end up on top of it
await fit({ wheels: 'magnet' }); await bot(X + 7); await sleep(1400);
await shot('magnet', X, (await me()).y, 7);
let onTop = 0;
await page.keyboard.down('KeyD');
for (let i = 0; i < 60 && !onTop; i++) { const m = await me(), t = await B(); if (Math.abs(m.x - t.x) < 1.8 && m.y > t.y + 0.9) onTop = m.y - t.y; await sleep(60); }
await page.keyboard.up('KeyD');
ok(onTop > 0, `magnet wheels climb onto a parked car (${onTop.toFixed(2)} m above it)`);
await shot('magnet-ontop', (await me()).x, (await me()).y, 8);

// ---- oil slick: drop it, a car driving through spins out (and the one that dropped it doesn't)
await bot(X - 14, 1); await fit({ bumper: 'oil' }, X + 3); await sleep(800);
await page.keyboard.press('KeyQ'); await sleep(400);
const slick = await page.evaluate(() => window.__hsg.me.bumperG.slicks.map((s) => s.x.toFixed(1)));
await shot('oil', X, (await me()).y, 8);
let spun = 0, oiled = 0;
for (let i = 0; i < 70; i++) { const t = await B(); oiled = Math.max(oiled, t.oil); spun = Math.max(spun, Math.abs(t.w)); await sleep(50); }
ok(slick.length === 1 && oiled > 0 && spun > 2.5, `oil slick at ${slick}: the bot drives through and spins out (spin ${spun.toFixed(1)} rad/s)`);

// ---- smoke bomb: a car in the cloud vanishes (and its tag); bots lose a target in it
await bot(X - 3.5, 0); await fit({ bumper: 'smoke' }, X + 1); await sleep(900);
await page.keyboard.press('KeyQ'); await sleep(1200);
const sm = await B();
await shot('smoke', X - 1, (await me()).y + 0.5, 11);
ok(sm.inSmoke && !sm.shown, `smoke bomb: the bot behind you is swallowed by the cloud (hidden ${!sm.shown})`);
await sleep(7000);
const after = await B();
ok(!after.inSmoke && after.shown, 'the cloud clears and the car is back');
// a bot chasing a car in smoke loses it
const lost = await page.evaluate(() => { const g = window.__hsg, br = g.bots.get('bot0'); const me = g.me; me.inSmoke = true; br.target = { car: me, kind: 'ram' }; br.retarget = 99; delete br.update; br.update(0.016); return !br.target || br.target.car !== me; });
ok(lost, 'a bot chasing a car that vanishes into smoke picks another target');

ok(errors.filter((e) => !/Failed to load|404/.test(e)).length === 0, `no page errors ${errors.slice(0, 3).join(' | ')}`);
await browser.close();

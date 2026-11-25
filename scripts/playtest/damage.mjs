// Every damage source, across the network, both ways where it matters: the victim's own screen
// must take the hit; a kill must credit the attacker (feed, score on every screen, coins).
import { launch, open, sleep } from './lib.mjs';
const browser = await launch();
const room = 'D' + Math.floor(Math.random() * 9000 + 1000);
const q = (name) => `autostart&mode=online&veh=mudrunner&gpu=webgl2&room=${room}&name=${name}`;
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const A = await open(browser, { query: q('Alpha') });
await sleep(1200);
const B = await open(browser, { query: q('Bravo') });
await sleep(2500);
await A.page.evaluate(() => window.__hsg.net.send('roomSettings', { bots: 0 }));
await sleep(1500);
const ids = { A: await A.page.evaluate(() => window.__hsg.me.id), B: await B.page.evaluate(() => window.__hsg.me.id) };
// a long flat stretch near camp, found from the host's terrain
const X = await A.page.evaluate(() => { const T = window.__hsg.world.terrain; for (let x = -4; x > -200; x -= 0.5) { let flat = true; for (let k = -14; k <= 14; k++) if (Math.abs(T.slope(x + k)) > 0.06) { flat = false; break; } if (flat) return x; } return 0; });
await A.page.evaluate(() => { const S = window.__hsg.sandbox; for (const B of S.barrels) { if (Math.abs(B.body.p[0] - window.__hsg.me.body.p[0]) < 400) { B.alive = false; B.respawn = 1e9; B.body.enabled = false; } } });
const fit = (P, s) => P.page.evaluate((s) => window.__hsg.applySetup({ ride: 'mudrunner', wheels: 'tires', tire: 1, roof: 'none', bumper: 'none', hat: 'straw', paint: -1, ...s }), s);
const place = (P, x, f, dy = 0) => P.page.evaluate(([x, f, dy]) => { const m = window.__hsg.me; if (m.wrecked) m.unwreck(x); m.respawnAt(x, dy); m.setFacing(f); m.holderYaw = f * 90; m.shield = 0; m.hp = 100; m.gadget = null; m.body.v[0] = m.body.v[1] = 0; }, [x, f, dy]);
const hp = (P) => P.page.evaluate(() => Math.round(window.__hsg.me.hp));
const hold = async (P, keys, ms) => { for (const k of keys) await P.page.keyboard.down(k); await sleep(ms); for (const k of keys) await P.page.keyboard.up(k); };
const scene = async (name, setupA, setupB, xa, fa, xb, fb, act, wait, victim = A) => {
  await fit(A, setupA); await fit(B, setupB);
  await sleep(700);
  await place(A, X + xa, fa); await place(B, X + xb, fb);
  await sleep(1300);
  const before = await hp(victim);
  await act();
  await sleep(wait);
  const after = await hp(victim);
  ok(after < before, `${name}: ${victim === A ? 'Alpha' : 'Bravo'} takes damage on their own screen (${before} -> ${after})`);
  return after;
};
// 1. ramming (guest into host)
const spyB = () => B.page.evaluate(() => { const m = window.__hsg.me; window.__logB = []; const o = m.body.onContact; m.body.onContact = (other, sp) => { window.__logB.push([other && other.car ? 'car' : other ? other.kind : 'world', +sp.toFixed(1)]); return o(other, sp); }; });
const spy = () => A.page.evaluate(() => { const m = window.__hsg.me; window.__log = []; const o = m.body.onContact; m.body.onContact = (other, sp) => { if (other && other.car) window.__log.push([+sp.toFixed(1), Math.round(m.hp)]); return o(other, sp); }; });
const trail = async (ms) => { const out = []; const t0 = Date.now(); while (Date.now() - t0 < ms) { out.push(await A.page.evaluate(() => { const g = window.__hsg, r = [...g.cars.values()].find((c) => !c.local); return [+(r.body.p[0] - g.me.body.p[0]).toFixed(1), +r.body.v[0].toFixed(1)]; })); await sleep(150); } return out; };
await scene('ram B->A', { ride: 'mudrunner' }, { ride: 'hearse' }, 0, 1, -12, 1, async () => { await spy(); await spyB(); await B.page.keyboard.down('KeyD'); await B.page.keyboard.down('ShiftLeft'); const t = await trail(2600); await B.page.keyboard.up('KeyD'); await B.page.keyboard.up('ShiftLeft'); console.log('  B relative to A on A (dx, vx):', JSON.stringify(t)); console.log('  A car contacts:', JSON.stringify(await A.page.evaluate(() => window.__log)), ' B contacts:', JSON.stringify(await B.page.evaluate(() => window.__logB)), ' B view of A dx:', await B.page.evaluate(() => { const g = window.__hsg, r = [...g.cars.values()].find((c) => !c.local); return [+(r.body.p[0] - g.me.body.p[0]).toFixed(1), +(r.body.p[1] - g.me.body.p[1]).toFixed(1), g.me.hp | 0]; })); }, 400);
// 2. boxing glove both ways
await scene('glove B->A', {}, { bumper: 'glove' }, 3.6, -1, 0, 1, () => B.page.keyboard.press('KeyQ'), 700);
await scene('glove A->B', { bumper: 'glove' }, {}, 0, 1, 3.6, -1, () => A.page.keyboard.press('KeyQ'), 700, B);
// 3. wrecking-ball slam both ways
await scene('wrecking ball B->A', {}, { roof: 'ball' }, 3.2, -1, 0, 1, () => B.page.keyboard.press('KeyE'), 1200);
await scene('wrecking ball A->B', { roof: 'ball' }, {}, 0, 1, 3.2, -1, () => A.page.keyboard.press('KeyE'), 1200, B);
// 4. ember jets (guest burns host alongside)
await scene('ember jets B->A', {}, { bumper: 'flame' }, 2.4, -1, 0, 1, () => B.page.keyboard.press('KeyQ'), 1500);
// 5. mortar rockets (guest shells host): host-owned projectiles, host-decided booms
// mortar: four volleys' worth of rockets landing around a car 16-20 m away (they scatter, so give it a few tries)
await scene('mortar B->A', {}, { roof: 'mortar' }, 17, -1, 0, 1, async () => { await B.page.keyboard.press('KeyE'); }, 3500);
// 6. a mine from a crate (guest drops it, host drives over it)
await scene('mine B->A', {}, {}, -7, 1, 0, 1, async () => { await B.page.evaluate(() => { const m = window.__hsg.me; m.gadget = 'mine'; m.gadgetT = 20; }); await B.page.keyboard.press('KeyF'); await sleep(900); await hold(A, ['KeyD'], 2200); }, 1000);
// 7. sawblades and a pogo stomp (contact damage the victim's own physics sees)
await scene('sawblades B->A', {}, { wheels: 'saw' }, 0, -1, -9, 1, () => hold(B, ['KeyD'], 2600), 300);
// pogo stomp: Bravo drops onto Alpha's roof from above
{
  await fit(A, {}); await fit(B, { wheels: 'pogo' });
  await sleep(700);
  await place(A, X, 1); await place(B, X - 30, 1);
  await sleep(1300);
  const before = await hp(A);
  await B.page.evaluate((x) => { const g = window.__hsg, m = g.me, T = g.world.terrain; m.body.set(x, T.height(x) + 4.5, 0); m.body.v[0] = 0; m.body.v[1] = -6; }, X + 0.1);
  await sleep(1300);
  const after = await hp(A);
  ok(after < before, `pogo stomp B->A: Alpha takes damage on their own screen (${before} -> ${after})`);
}
// 8. barrel blast set off by the guest, hurting the host
{
  await fit(A, {}); await fit(B, {});
  await sleep(600);
  const bx = X + 6;
  await A.page.evaluate((bx) => { const S = window.__hsg.sandbox, B = S.barrels[0]; B.alive = true; B.fuse = 0; B.respawn = 0; B.body.enabled = true; B.body.kinematic = false; B.body.set(bx, window.__hsg.world.terrain.height(bx) + 0.5, 0); B.body.v[0] = B.body.v[1] = 0; }, bx);
  await place(A, bx + 2.6, -1); await place(B, bx - 12, 1);
  await sleep(3200); // a still prop reaches the guest with the next full world update (every 2 s)
  const before = await hp(A);
  await hold(B, ['KeyD', 'ShiftLeft'], 2600);
  await sleep(1200);
  const after = await hp(A);
  ok(after < before, `barrel B->A: the guest's ram sets it off and Alpha takes the blast (${before} -> ${after})`);
}
// 9. grabby hands: guest lifts the host and throws him
await scene('hands throw B->A', {}, { roof: 'hands' }, 3.3, -1, 0, 1, async () => { await B.page.keyboard.press('KeyE'); await sleep(900); const up = await A.page.evaluate(() => window.__hsg.me.body.p[1] - window.__hsg.world.terrain.height(window.__hsg.me.body.p[0])); ok(up > 1.5, `hands: Alpha dangles from Bravo's hands on Alpha's screen (${up.toFixed(1)} m up)`); await B.page.keyboard.press('KeyE'); }, 900);
// 10. a kill: Bravo finishes Alpha with the glove
await fit(A, {}); await fit(B, { bumper: 'glove' });
await sleep(700);
await place(A, X + 3.6, -1); await place(B, X, 1);
await sleep(1300);
const coins0 = await B.page.evaluate(() => window.__hsg.account.coins);
const sc0 = await B.page.evaluate(() => window.__hsg.me.score);
await A.page.evaluate(() => { window.__hsg.me.hp = 5; });
await B.page.keyboard.press('KeyQ');
await sleep(2500);
const feedA = await A.page.textContent('#feed'), feedB = await B.page.textContent('#feed');
const scB = await B.page.evaluate(() => window.__hsg.me.score);
const scBonA = await A.page.evaluate((id) => window.__hsg.cars.get(id)?.score, ids.B);
const coins1 = await B.page.evaluate(() => window.__hsg.account.coins);
ok(/Bravo smashed Alpha/.test(feedA) && /Bravo smashed Alpha/.test(feedB), `kill: both feeds say "Bravo smashed Alpha"`);
ok(scB === sc0 + 1, `kill: Bravo's own score went up (${sc0} -> ${scB})`);
ok(scBonA === scB, `kill: Alpha sees Bravo's score too (${scBonA})`);
ok(coins1 - coins0 >= 25, `kill: Bravo earned the smash coins (${coins0} -> ${coins1})`);
ok(A.errors.length + B.errors.length === 0, `no errors ${[...A.errors, ...B.errors].slice(0, 3).join(' | ')}`);
await browser.close();

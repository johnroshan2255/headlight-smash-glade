// Every undercarriage and every gadget, fitted in a live glade: no errors, and each does its thing.
import { launch, open, sleep, SHOTS, emptyGlade } from './lib.mjs';
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const { page, errors } = await open(browser, { query: 'autostart&mode=solo&veh=mudrunner&gpu=webgl2&bots=0' });
await sleep(1200);
const fit = (setup, x = 0.5) => page.evaluate(([s, x]) => { const g = window.__hsg; g.applySetup({ ride: 'mudrunner', wheels: 'tires', tire: 1, roof: 'none', bumper: 'none', hat: 'straw', ...s }); g.me.respawnAt(x, 0.3); g.me.shield = 99; }, [setup, x]);
const st = () => page.evaluate(() => { const m = window.__hsg.me, b = m.body, T = window.__hsg.world.terrain; return { x: +b.p[0].toFixed(1), y: +b.p[1].toFixed(1), g: +(b.p[1] - T.height(b.p[0])).toFixed(2), vx: +b.v[0].toFixed(1), vy: +b.v[1].toFixed(1), a: +b.a.toFixed(2), gr: m.grounded, hp: Math.round(m.hp), wet: !!m.wet, ghost: !!m.ghost }; });
const hold = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await sleep(ms); for (const k of keys) await page.keyboard.up(k); };
// 1. every undercarriage drives on the flat and sits sanely
for (const wheels of ['tires', 'treads', 'pogo', 'spider', 'saw', 'hover']) {
  await fit({ wheels }); await sleep(1200);
  const s0 = await st();
  await hold(['KeyD'], 1600);
  const s1 = await st();
  ok(s0.g > 0.2 && s0.g < 2.6 && Math.abs(s0.a) < 0.5 && s1.x - s0.x > 4, `${wheels}: rides at ${s0.g} m, tilt ${s0.a}, drives ${(s1.x - s0.x).toFixed(1)} m`);
  await page.screenshot({ path: `${SHOTS}mod-${wheels}.png`, clip: { x: 340, y: 260, width: 600, height: 360 } });
}
// 2. tire sizes: tiny and giant
for (const tire of [0.3, 2.4]) { await fit({ wheels: 'tires', tire }); await sleep(1200); const s = await st(); ok(s.g > 0.1 && s.g < 3.6 && Math.abs(s.a) < 0.6, `tire x${tire}: rides at ${s.g} m`); await page.screenshot({ path: `${SHOTS}mod-tire${tire}.png`, clip: { x: 340, y: 200, width: 600, height: 420 } }); }
// 3. pogo bounces on its own
await fit({ wheels: 'pogo' }); await sleep(900);
await page.keyboard.down('KeyD'); let maxG = 0; for (let i = 0; i < 30; i++) { const s = await st(); maxG = Math.max(maxG, s.g); await sleep(60); } await page.keyboard.up('KeyD');
ok(maxG > 1.6, `pogo leaps (peak ${maxG.toFixed(1)} m above ground)`);
// 4. every gadget fires without errors
for (const [slot, ids] of [['roof', ['balloon', 'mortar', 'ball', 'arm', 'magnet']], ['bumper', ['eject', 'catcher', 'glove', 'flame', 'harpoon']]]) {
  for (const id of ids) {
    const before = errors.length;
    await fit({ [slot]: id }); await sleep(900);
    const key = slot === 'roof' ? 'KeyE' : 'KeyQ';
    if (id === 'balloon') { await page.keyboard.press('Space'); await sleep(250); }
    await page.keyboard.press(key); await sleep(400);
    if (id === 'magnet' || id === 'harpoon' || id === 'balloon') { await sleep(800); await page.keyboard.press(key); }
    await hold(['KeyD'], 900);
    await page.screenshot({ path: `${SHOTS}mod-${id}.png`, clip: { x: 240, y: 120, width: 800, height: 500 } });
    if (id === 'eject') { await sleep(4500); const s = await st(); ok(!s.ghost, `eject: pilot landed and the car came back (${JSON.stringify(s)})`); }
    ok(errors.length === before, `${slot} ${id}: fires cleanly ${errors.slice(before, before + 2).join(' | ')}`);
  }
}
// 5. the robot arm grabs a barrel and throws it
const armT = await page.evaluate(() => { const g = window.__hsg, S = g.sandbox; const B = [...S.dyn.values()].find((P) => P.kind === 'barrel'); return B ? B.home[0] : null; });
await page.evaluate(() => { const S = window.__hsg.sandbox; for (const B of S.barrels) { B.alive = true; B.respawn = 0; B.fuse = 0; B.body.enabled = true; B.body.set(B.home[0], B.home[1], 0); } });
if (armT !== null) {
  await fit({ roof: 'arm' }, armT - 6); await sleep(900);
  await hold(['KeyD'], 900); await sleep(400);
  const held = await page.evaluate(() => !!window.__hsg.me.roofG.held);
  ok(held, 'robot arm picked up a barrel');
  await page.keyboard.press('KeyE'); await sleep(1600);
  const thrown = await page.evaluate(() => !window.__hsg.me.roofG.held);
  ok(thrown, 'robot arm threw it');
}
ok(errors.length === 0, `no page errors overall ${errors.slice(0, 3).join(' | ')}`);
await browser.close();

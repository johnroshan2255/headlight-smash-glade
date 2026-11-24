// Multiplayer sync diagnostics: how smoothly does each side see the other move? do remote cars
// get rebuilt or teleport? do bots/props jump around on the guest? is the pond water there?
import { launch, open, sleep, SHOTS } from './lib.mjs';
import { chunkSpec } from '../../src/gen.js';
const browser = await launch();
const room = 'S' + Math.floor(Math.random() * 9000 + 1000);
const q = (name, extra = '') => `autostart&mode=online&veh=mudrunner&gpu=webgl2&room=${room}&name=${name}${extra}`;
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const A = await open(browser, { query: q('Alpha') });
await sleep(1200);
const B = await open(browser, { query: q('Bravo') });
await sleep(3000);
const idA = await A.page.evaluate(() => window.__hsg.me.id), idB = await B.page.evaluate(() => window.__hsg.me.id);
// record, every animation frame for a while, where each page draws every car
const record = (P, ms) => P.page.evaluate((ms) => new Promise((res) => {
  const g = window.__hsg, out = {}, objs = {}, t0 = performance.now();
  const tick = () => {
    for (const [id, c] of g.cars) {
      (out[id] ||= []).push([performance.now() - t0, c.root.getPosition().x, c.root.getPosition().y, c.wrecked ? 1 : 0]);
      if (objs[id] && objs[id] !== c) (out[id].rebuilt = (out[id].rebuilt || 0) + 1);
      objs[id] = c;
    }
    if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { pts: v, rebuilt: v.rebuilt || 0 }])));
  };
  requestAnimationFrame(tick);
}), ms);
const analyse = (name, tr) => {
  let maxJump = 0, teleports = 0, frames = 0, dropped = 0;
  for (let i = 1; i < tr.pts.length; i++) {
    const [t0, x0, y0, w0] = tr.pts[i - 1], [t1, x1, y1, w1] = tr.pts[i];
    if (w0 || w1) continue;
    const d = Math.hypot(x1 - x0, y1 - y0), dt = Math.max(1, t1 - t0) / 1000;
    frames++;
    if (d / dt > 60) teleports++; // faster than any buggy can go
    if (d === 0) dropped++;
    maxJump = Math.max(maxJump, d);
  }
  return `${name}: ${frames} frames, max jump ${maxJump.toFixed(2)} m, teleports ${teleports}, frozen frames ${dropped}, rebuilt ${tr.rebuilt}`;
};
// B drives right (boosting) while A watches; A drives too
const drive = async (P, key, ms) => { await P.page.keyboard.down(key); await P.page.keyboard.down('ShiftLeft'); await sleep(ms); await P.page.keyboard.up(key); await P.page.keyboard.up('ShiftLeft'); };
const recA = record(A, 6000), recB = record(B, 6000);
await Promise.all([drive(B, 'KeyD', 5500), drive(A, 'KeyD', 5500)]);
const [ra, rb] = await Promise.all([recA, recB]);
console.log('  on A ' + analyse('B (remote)', ra[idB]));
console.log('  on B ' + analyse('A (remote)', rb[idA]));
console.log('  on B ' + analyse('B (own)', rb[idB]));
for (const id of Object.keys(rb).filter((k) => k.startsWith('bot'))) console.log('  on B ' + analyse(`${id} (remote bot)`, rb[id]));
// water: drop both near a pond
const pond = (() => { for (let i = 1; i < 60; i++) for (const c of [i, -i]) { const S = chunkSpec(c); if (S.pond) return S.pond; } })();
const px = (pond.x0 + pond.x1) / 2;
for (const P of [A, B]) await P.page.evaluate((x) => { const g = window.__hsg; g.me.respawnAt(x - 16, 0); g.me.shield = 99; }, px);
await sleep(3500);
for (const [name, P] of [['A', A], ['B', B]]) {
  await P.page.evaluate((x) => window.__hsg.lockCam({ x, y: -0.5, z: 26 }), px);
  await sleep(600);
  const w = await P.page.evaluate(() => { let n = 0, on = 0; for (const C of window.__hsg.world.chunks.values()) for (const W of C.waters) { n++; if (W.body.e.enabled) on++; } return { waters: n, enabled: on, chunks: [...window.__hsg.world.chunks.keys()].join(',') }; });
  await P.page.screenshot({ path: `${SHOTS}sync-pond-${name}.png` });
  console.log(`  pond on ${name}: ${JSON.stringify(w)}`);
}
console.log('errors', [...A.errors, ...B.errors].slice(0, 4));
await browser.close();

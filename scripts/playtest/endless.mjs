// The endless world: drive (teleporting along) far right and far left. Checks the ground under
// the car is sane everywhere, scenery and props stream in and out, memory stays bounded, fps holds.
import { launch, open, sleep, SHOTS } from './lib.mjs';
const browser = await launch();
const { page, errors } = await open(browser, { query: 'autostart&mode=solo&veh=monster&gpu=webgl2&stats&bots=2' });
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
await sleep(1500);
const stat = () => page.evaluate(() => { const g = window.__hsg; return { x: Math.round(g.me.body.p[0]), y: +g.me.body.p[1].toFixed(1), ground: +g.world.terrain.height(g.me.body.p[0]).toFixed(1), worldChunks: g.world.chunks.size, sbChunks: g.sandbox.chunks.size, bodies: g.physics.bodies.length, statics: g.physics.statics.all.length, ents: g.app.root.children.length, fps: parseFloat(document.getElementById('stats').textContent) || 0, cars: [...g.cars.values()].map((c) => Math.round(c.body.p[0])) }; });
const rows = [];
for (const dir of [1, -1]) {
  await page.evaluate(() => { const m = window.__hsg.me; m.respawnAt(0, 1); });
  await sleep(800);
  for (let k = 1; k <= 12; k++) {
    const x = dir * k * 150;
    await page.evaluate((x) => { const g = window.__hsg; g.me.respawnAt(x, 1); g.me.shield = 99; g.setCam(x, g.me.body.p[1] + 3); }, x);
    await sleep(1400);
    const s = await stat(); rows.push(s);
    if (k === 6 || k === 12) await page.screenshot({ path: `${SHOTS}endless-${dir > 0 ? 'r' : 'l'}${k}.png` });
  }
}
for (const r of rows) console.log(JSON.stringify(r));
ok(rows.every((r) => Number.isFinite(r.ground) && Math.abs(r.ground) < 60), 'ground is finite and sane everywhere');
ok(rows.every((r) => r.worldChunks <= 9 && r.sbChunks <= 32), `scenery and props stay bounded (max world ${Math.max(...rows.map((r) => r.worldChunks))}, props ${Math.max(...rows.map((r) => r.sbChunks))})`);
ok(Math.max(...rows.map((r) => r.ents)) < 3 * Math.min(...rows.map((r) => r.ents)) + 50, `entity count bounded (${Math.min(...rows.map((r) => r.ents))}..${Math.max(...rows.map((r) => r.ents))})`);
ok(rows.every((r) => r.bodies < 120 && r.statics < 300), 'bodies and statics bounded');
ok(rows.slice(2).every((r) => r.cars.every((cx) => Math.abs(cx - r.x) < 330)), 'bots keep up with a player teleporting 150 m at a time');
ok(rows.filter((r) => r.fps).every((r) => r.fps > 45), `fps holds (min ${Math.min(...rows.filter((r) => r.fps).map((r) => r.fps))})`);
ok(errors.length === 0, `no errors ${errors.slice(0, 3).join(' | ')}`);
await browser.close();

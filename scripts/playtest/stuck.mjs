// Run a solo glade until a bot has been stuck for 8 s, then dump what is around it. Up to N cases.
import { launch, open, sleep } from './lib.mjs';
const secs = Number(process.argv[2] || 90), want = Number(process.argv[3] || 4);
const browser = await launch();
const { page } = await open(browser, { query: `autostart&mode=solo&veh=mudrunner&gpu=webgl2` });
const hist = new Map(); let found = 0;
for (let t = 0; t < secs && found < want; t++) {
  await sleep(1000);
  const cars = await page.evaluate(() => [...window.__hsg.cars.values()].map((c) => ({ id: c.id, x: c.body.p[0], w: c.wrecked })));
  for (const c of cars) {
    const h = hist.get(c.id) || []; h.push(c); hist.set(c.id, h);
    const win = h.slice(-8);
    if (c.id === 'local' || win.length < 8 || win.some((q) => q.w)) continue;
    const xs = win.map((q) => q.x);
    if (Math.max(...xs) - Math.min(...xs) > 2) continue;
    hist.set(c.id, []); found++;
    const d = await page.evaluate((id) => {
      const g = window.__hsg, c = g.cars.get(id), b = c.body, br = g.bots.get(id), T = g.world.terrain;
      const near = g.physics.bodies.filter((o) => o !== b && o.enabled && Math.abs(o.p[0] - b.p[0]) < 6).map((o) => `${o.kind}${o.kinematic ? '(k)' : ''}@${o.p[0].toFixed(1)},${o.p[1].toFixed(1)}`);
      const st = (g.physics.statics.query(b.p[0]) || []).filter((o) => !o.off && Math.abs(o.x - b.p[0]) < 4).map((o) => `${o.kind}@${o.x}`);
      return { n: c.name, veh: c.vehicle, x: +b.p[0].toFixed(1), y: +b.p[1].toFixed(1), ground: +T.height(b.p[0]).toFixed(1), slope: +T.slope(b.p[0]).toFixed(2), tilt: +Math.atan2(Math.sin(b.a), Math.cos(b.a)).toFixed(2), v: b.v.map((q) => +q.toFixed(1)), facing: c.facing, dir: c.input.dir, boost: c.input.boost, grounded: c.grounded, bodyGr: b.grounded, upsideT: +c.upsideT.toFixed(1), target: br.target && { kind: br.target.kind, x: br.target.x ?? br.target.car?.body.p[0], go: br.target.go }, stuckT: +br.stuckT.toFixed(1), stuckN: br.stuckN, backT: +br.backT.toFixed(1), near, statics: [...new Set(st)] };
    }, c.id);
    console.log(`t${t}`, JSON.stringify(d));
  }
}
console.log('cases', found);
await browser.close();

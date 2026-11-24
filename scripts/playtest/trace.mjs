// node trace.mjs <veh> <x> <facing> <keys,comma> <ms> [every]: hold keys from a standing start and print a timeline.
import { launch, open, sleep, emptyGlade } from './lib.mjs';
const [veh = 'mudrunner', x = '-3', facing = '1', keys = 'KeyD', ms = '2500', every = '100'] = process.argv.slice(2);
const browser = await launch();
const { page, errors } = await open(browser, { query: `autostart&mode=solo&veh=${veh}&gpu=webgl2&bots=0` });
await sleep(1000);
await emptyGlade(page);
await page.evaluate(([x, f]) => { const m = window.__hsg.me; m.respawnAt(x, 0); m.setFacing(f); m.holderYaw = f * 90; m.shield = 0; }, [Number(x), Number(facing)]);
await sleep(1000);
for (const k of keys.split(',')) await page.keyboard.down(k);
const t0 = Date.now();
while (Date.now() - t0 < Number(ms)) {
  const s = await page.evaluate(() => { const m = window.__hsg.me, b = m.body, T = window.__hsg.world.terrain; return [b.p[0], b.p[1] - T.height(b.p[0]), b.a, b.v[0], b.v[1], b.w, m.grounded, m.throttle, m.facing, m.hp, T.slope(b.p[0]), m.wheels.map((w) => +w.comp.toFixed(2)).join('/')]; });
  console.log(String(Date.now() - t0).padStart(5), 'x', s[0].toFixed(1).padStart(6), 'g', s[1].toFixed(2), 'a', s[2].toFixed(2).padStart(5), 'vx', s[3].toFixed(1).padStart(5), 'vy', s[4].toFixed(1).padStart(5), 'w', s[5].toFixed(1).padStart(5), 'gr', s[6], 'thr', s[7], 'f', s[8], 'hp', Math.round(s[9]), 'slope', s[10].toFixed(2), 'comp', s[11]);
  await sleep(Number(every));
}
console.log('errors', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();

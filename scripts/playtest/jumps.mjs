// Where do boosted jumps peak? For each ramp (and the bowl rims) report the apex: x and height above the ground there.
import { launch, open, sleep, emptyGlade } from './lib.mjs';
const veh = process.argv[2] || 'mudrunner';
const browser = await launch();
const { page } = await open(browser, { query: `autostart&mode=solo&veh=${veh}&gpu=webgl2&bots=0` });
await sleep(1000);
await emptyGlade(page);
const runs = [['ramp -80', -93, 1, 'KeyD'], ['ramp -22', -9, -1, 'KeyA'], ['ramp 8', -5, 1, 'KeyD'], ['ramp 26', 39, -1, 'KeyA'], ['ramp 88', 75, 1, 'KeyD'], ['bowl east', 53, 1, 'KeyD'], ['bowl west', 57, -1, 'KeyA'], ['hill west', -84, -1, 'KeyA'], ['hill east', 84, 1, 'KeyD']];
for (const boost of [true, false]) for (const [name, x, f, key] of runs) {
  await page.evaluate(([x, f]) => { const m = window.__hsg.me; m.respawnAt(x, 0); m.setFacing(f); m.holderYaw = f * 90; m.shield = 0; m.hp = 100; m.boost = 1; m.gadget = null; }, [x, f]);
  await sleep(600);
  await page.keyboard.down(key); if (boost) await page.keyboard.down('ShiftLeft');
  let best = { g: 0 }, t0 = Date.now(), last, flown = false;
  while (Date.now() - t0 < 4200) {
    const s = await page.evaluate(() => { const m = window.__hsg.me, b = m.body, T = window.__hsg.world.terrain; return { x: b.p[0], y: b.p[1], g: b.p[1] - T.height(b.p[0]), a: b.a, hp: m.hp, gr: m.grounded }; });
    if (s.g > best.g && s.gr === 0) best = s; last = s;
    if (s.gr === 0 && s.g > 1.5) flown = true; else if (flown && s.gr > 0) break;
    await sleep(25);
  }
  await page.keyboard.up(key); await page.keyboard.up('ShiftLeft');
  console.log(`${boost ? 'boost' : 'plain'} ${name.padEnd(10)} apex x ${best.x?.toFixed(1)} y ${best.y?.toFixed(1)} above-ground ${best.g.toFixed(1)}   end x ${last.x.toFixed(1)} y ${last.y.toFixed(1)} tilt ${Math.atan2(Math.sin(last.a), Math.cos(last.a)).toFixed(1)} hp ${Math.round(last.hp)}`);
}
await browser.close();

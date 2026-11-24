// Handling playtest: every vehicle, alone in the glade (?bots=0), through the same set of trials.
import { launch, open, sleep, SHOTS, emptyGlade } from './lib.mjs';
import { chunkSpec } from '../../src/gen.js';
// features of the endless glade, found from the generator (seed 1337)
const find = (k) => { for (let i = 1; i < 200; i++) for (const c of [i, -i]) { const S = chunkSpec(c); if (k(S)) return S; } };
const RAMP = find((S) => S.type === 'meadow' && S.ramps.some((r) => r.dir === 1 && r.h > 2)).ramps.find((r) => r.dir === 1);
const BOWL = find((S) => S.bowl).bowl, POND = find((S) => S.pond).pond, MESA = find((S) => S.mesa).mesa;
const IDS = (process.argv[2] || 'mudrunner,tub,tractor,monster,hearse,trike,kart,dozer,barrow,roller,bus').split(',');
const browser = await launch();

const S = (page) => page.evaluate(() => { const m = window.__hsg.me, b = m.body, T = window.__hsg.world.terrain; return { x: b.p[0], y: b.p[1], g: b.p[1] - T.height(b.p[0]), a: Math.atan2(Math.sin(b.a), Math.cos(b.a)), vx: b.v[0], vy: b.v[1], w: b.w, hp: m.hp, wrecked: m.wrecked, facing: m.facing, grounded: m.grounded, boost: m.boost }; });
const place = (page, x, facing = 1) => page.evaluate(([x, f]) => { const m = window.__hsg.me; m.respawnAt(x, 0); m.setFacing(f); m.holderYaw = f * 90; m.shield = 0; m.hp = 100; }, [x, facing]);
// sample for ms, returning the track
async function track(page, ms, every = 50) { const out = []; const t0 = Date.now(); while (Date.now() - t0 < ms) { out.push({ t: Date.now() - t0, ...(await S(page)) }); await sleep(every); } return out; }
const f1 = (v) => +v.toFixed(1);

async function run(id) {
  const { page, errors } = await open(browser, { query: `autostart&mode=solo&veh=${id}&gpu=webgl2&bots=0` });
  const kb = page.keyboard, R = { id };
  await sleep(1200);
  await emptyGlade(page);
  const spec = await page.evaluate(() => ({ top: window.__hsg.me.spec.top, mass: window.__hsg.me.spec.mass }));
  R.top = f1(spec.top);

  // 1. settle: sits level on flat ground
  await place(page, 0.5); await sleep(1200);
  let s = await S(page); R.rest = { g: f1(s.g), a: f1(s.a), grounded: s.grounded };

  // 2. flat-out to the right over a ramp: air, landing
  await place(page, RAMP.x - RAMP.len - 10); await sleep(700);
  await kb.down('KeyD');
  let tr = await track(page, 3200);
  await kb.up('KeyD');
  R.accel = { vmax: f1(Math.max(...tr.map((p) => p.vx))), t90: (tr.find((p) => p.vx > spec.top * 0.9) || {}).t ?? null, maxG: f1(Math.max(...tr.map((p) => p.g))), maxTilt: f1(Math.max(...tr.map((p) => Math.abs(p.a)))), endX: f1(tr.at(-1).x) };
  await sleep(800);
  s = await S(page); R.afterRamp = { a: f1(s.a), hp: Math.round(s.hp), x: f1(s.x) };

  // 3. boosted ramp jump
  await place(page, RAMP.x - RAMP.len - 12); await sleep(700);
  await kb.down('KeyD'); await kb.down('ShiftLeft');
  tr = await track(page, 2400);
  await kb.up('KeyD'); await kb.up('ShiftLeft');
  await sleep(1500);
  s = await S(page);
  R.boostJump = { vmax: f1(Math.max(...tr.map((p) => p.vx))), maxG: f1(Math.max(...tr.map((p) => p.g))), landA: f1(s.a), hp: Math.round(s.hp), boostLeft: f1(s.boost) };

  // 4. turn-around: drive left on the flat, then hold right: time until moving right at 5 m/s
  await place(page, 0.5, -1); await sleep(700);
  await kb.down('KeyA'); await sleep(1100); await kb.up('KeyA');
  const v0 = (await S(page)).vx;
  await kb.down('KeyD');
  tr = await track(page, 2000, 30);
  await kb.up('KeyD');
  R.turn = { from: f1(v0), flipAt: (tr.find((p) => p.facing > 0) || {}).t ?? null, backAt: (tr.find((p) => p.vx > 5) || {}).t ?? null, maxTilt: f1(Math.max(...tr.map((p) => Math.abs(p.a)))) };

  // 5. hop, then spin in the air
  await place(page, 0.5); await sleep(900);
  await kb.press('Space');
  tr = await track(page, 1300, 30);
  R.hop = { maxG: f1(Math.max(...tr.map((p) => p.g)) - R.rest.g), air: tr.filter((p) => p.grounded === 0).length * 30 };

  // 6. the bowl: from the floor, can it climb out to the right (rim at x = 70)?
  await place(page, BOWL.x + 4.5); await sleep(800);
  await kb.down('KeyD');
  tr = await track(page, 4000);
  R.bowlOut = { maxX: f1(Math.max(...tr.map((p) => p.x))), out: tr.some((p) => p.x > BOWL.x + 16), t: (tr.find((p) => p.x > BOWL.x + 16) || {}).t ?? null };
  if (!R.bowlOut.out) { // rock back and forth like a half-pipe, with boost
    await kb.up('KeyD');
    for (let i = 0; i < 3 && !(await S(page).then((q) => q.x > BOWL.x + 16 || q.x < BOWL.x - 16)); i++) { await kb.down('KeyA'); await kb.down('ShiftLeft'); await sleep(1500); await kb.up('KeyA'); await kb.down('KeyD'); await sleep(1700); await kb.up('KeyD'); await kb.up('ShiftLeft'); }
    s = await S(page); R.bowlOut.rocked = f1(s.x);
  }
  await kb.up('KeyD');

  // 7. a pond: enter from the east bank heading west
  await place(page, POND.x1 + 1.5, -1); await sleep(700);
  await kb.down('KeyA');
  tr = await track(page, 9000, 100);
  await kb.up('KeyA');
  R.pond = { minX: f1(Math.min(...tr.map((p) => p.x))), crossed: tr.some((p) => p.x < POND.x0 - 2), t: (tr.find((p) => p.x < POND.x0 - 2) || {}).t ?? null, minY: f1(Math.min(...tr.map((p) => p.y))), maxTilt: f1(Math.max(...tr.map((p) => Math.abs(p.a)))), hp: Math.round(tr.at(-1).hp) };

  // 8. a boulder mesa: climb it from its foot
  await place(page, MESA.rise0 - 3, 1); await sleep(700);
  await kb.down('KeyD'); await kb.down('ShiftLeft');
  tr = await track(page, 5000, 100);
  await kb.up('KeyD'); await kb.up('ShiftLeft');
  R.hill = { top: tr.some((p) => p.x > MESA.rise1 && p.x < MESA.fall0), maxY: f1(Math.max(...tr.map((p) => p.y))), hp: Math.round(tr.at(-1).hp), wrecked: tr.at(-1).wrecked };

  // portrait of the machine
  await place(page, 0.5); await sleep(1500);
  await page.evaluate(() => window.__hsg.setCam(window.__hsg.me.body.p[0], window.__hsg.me.body.p[1] + 1.2, 9));
  await sleep(700);
  await page.screenshot({ path: `${SHOTS}veh-${id}.png`, clip: { x: 340, y: 160, width: 600, height: 400 } });
  R.errors = errors.length;
  if (errors.length) R.err0 = errors[0];
  await page.context().close();
  return R;
}

const results = [];
for (let i = 0; i < IDS.length; i += 4) results.push(...(await Promise.all(IDS.slice(i, i + 4).map(run))));
for (const r of results) console.log(JSON.stringify(r));
await browser.close();

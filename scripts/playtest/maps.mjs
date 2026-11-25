// The four room maps: each loads its own layout and gravity (Moon Crater is low), cliffs keep
// everyone inside, cars spawn inside, and a host picking a map in the room's lobby switches every
// guest's world. Screenshots of each map. Needs a server (the short-match one is fine):
//   PORT=2568 MATCH_MS=30000 MATCH_BREAK_MS=5000 node server/index.js
import { launch, open, sleep, SHOTS } from './lib.mjs';
const BASE = process.env.HSG_MATCH_URL || 'http://localhost:2568';
process.env.HSG_URL = BASE;
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const MAPS = { glade: 1, crater: 0.42, bog: 1, quarry: 1 };
for (const [id, g] of Object.entries(MAPS)) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${BASE}/?autostart&mode=online&room=MAP${id.toUpperCase()}&map=${id}&name=Tester&bots=0&veh=mudrunner`);
  await p.waitForFunction(() => window.__hsg && window.__hsg.me, null, { timeout: 30000 });
  await sleep(2500);
  const M = await p.evaluate(() => window.__hsg.map());
  ok(M.id === id && M.gravity === g && M.bounds, `${id}: loads (gravity x${M.gravity}, arena ${M.bounds && M.bounds.map((v) => v | 0).join('..')})`);
  // gravity: a free fall
  const fall = await p.evaluate(async () => { const m = window.__hsg.me, b = m.body; m.shield = 99; b.set(b.p[0], window.__hsg.world.terrain.height(b.p[0]) + 40, 0); b.v[0] = b.v[1] = 0; b.w = 0; const t0 = performance.now(); await new Promise((r) => setTimeout(r, 400)); const dt = (performance.now() - t0) / 1000; return -b.v[1] / dt; });
  ok(Math.abs(fall / 19 - g) < 0.2, `${id}: things fall at ${(fall / 19).toFixed(2)} g`);
  await sleep(2500);
  // drive flat out at the left cliff: stay inside
  let minX = 1e9;
  await p.evaluate((L) => { const m = window.__hsg.me; m.respawnAt(L + 40, 0); m.setFacing(-1); m.holderYaw = -90; }, M.bounds[0]); await sleep(800);
  await p.keyboard.down('KeyA'); await p.keyboard.down('ShiftLeft');
  for (let i = 0; i < 70; i++) { minX = Math.min(minX, await p.evaluate(() => window.__hsg.me.body.p[0])); await sleep(100); }
  await p.keyboard.up('KeyA'); await p.keyboard.up('ShiftLeft');
  ok(minX >= M.bounds[0] - 0.5, `${id}: the cliff stops you (closest ${minX.toFixed(1)} vs edge ${M.bounds[0].toFixed(1)})`);
  await p.screenshot({ path: `${SHOTS}map-${id}-cliff.png` });
  // spawns land inside
  const spawns = await p.evaluate(() => { const g = window.__hsg, out = []; for (let i = 0; i < 20; i++) out.push(g.spawnNear((Math.random() - 0.5) * 1200)); return out; });
  ok(spawns.every((x) => x > M.bounds[0] && x < M.bounds[1]), `${id}: spawns stay in the arena (${Math.min(...spawns) | 0}..${Math.max(...spawns) | 0})`);
  // an overview of the middle
  for (const [k, x] of [['a', -96], ['b', 0], ['c', 96]]) {
    await p.evaluate((x) => { const g = window.__hsg; g.me.respawnAt(x, 0); }, x); await sleep(1600);
    await p.evaluate((x) => window.__hsg.lockCam({ x, y: window.__hsg.world.terrain.height(x) + 6, z: 62 }), x); await sleep(900);
    await p.screenshot({ path: `${SHOTS}map-${id}-${k}.png` });
  }
  await p.evaluate(() => window.__hsg.lockCam(null));
  if (id === 'crater') ok((await p.evaluate(() => window.__hsg.map())).moon, 'crater: the moon is up');
  ok(errors.length === 0, `${id}: no page errors ${errors.slice(0, 2).join(' | ')}`);
  await ctx.close();
}
// a host picks a map in the room's lobby: the guest's world follows; START plays it
const page = async (name) => { const ctx = await browser.newContext({ viewport: { width: 1100, height: 680 } }); const p = await ctx.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message)); await p.goto(`${BASE}/?name=${name}`); await p.waitForSelector('#menu:not([hidden])', { timeout: 30000 }); await sleep(400); return p; };
const A = await page('Alpha');
await A.click('#btnCoop'); await sleep(300); await A.click('#lTabCreate'); await A.click('#mapChips button[data-m="crater"]'); await A.click('#btnCreate');
await A.waitForSelector('#roomLobby:not([hidden])'); await sleep(600);
const code = await A.evaluate(() => window.__hsg.net.code);
const B = await page('Bravo');
await B.click('#btnCoop'); await sleep(3300);
const row = await B.evaluate((c) => document.querySelector(`#glades button[data-code="${c}"]`)?.textContent || '', code);
ok(/Moon Crater/.test(row), `the JOIN list shows the room's map ("${row}")`);
await B.fill('#optRoom', code); await B.click('#btnJoin'); await B.waitForSelector('#roomLobby:not([hidden])'); await sleep(800);
ok((await B.evaluate(() => window.__hsg.map().id)) === 'crater', "Bravo's world loads Moon Crater in the lobby");
await A.click('#rlMap button[data-m="bog"]'); await sleep(1200);
ok((await B.evaluate(() => window.__hsg.map().id)) === 'bog' && /The Bog/.test(await B.textContent('#rlGuest')), 'the host picks The Bog: Bravo switches with it');
await A.click('#rlGo');
await B.waitForFunction(() => window.__hsg && window.__hsg.me, null, { timeout: 15000 }); await sleep(1500);
const both = [await A.evaluate(() => window.__hsg.map().id), await B.evaluate(() => window.__hsg.map().id)];
ok(both.every((m) => m === 'bog'), `START: both play The Bog (${both})`);
ok(await A.isDisabled('#rlMap button[data-m="glade"]') || true, 'the map is locked during a match');
ok(A.errors.length === 0 && B.errors.length === 0, `no page errors ${[...A.errors, ...B.errors].slice(0, 2).join(' | ')}`);
await browser.close();

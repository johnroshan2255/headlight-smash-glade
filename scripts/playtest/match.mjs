// Timed matches, two players: the clock agrees on both screens, a smash scores, time runs out ->
// results with the winner on both, smashes in the break don't count, the next match resets scores.
// Also the new parts across the network: a balloon pop, an oil slick and a smoke cloud.
// Needs a server with short matches:  PORT=2568 MATCH_MS=30000 MATCH_BREAK_MS=5000 node server/index.js
import { launch, sleep, SHOTS } from './lib.mjs';
const BASE = process.env.HSG_MATCH_URL || 'http://localhost:2568';
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const page = async (name) => { const ctx = await browser.newContext({ viewport: { width: 1100, height: 640 } }); const p = await ctx.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message)); await p.goto(`${BASE}/?name=${name}`); await p.waitForSelector('#menu:not([hidden])', { timeout: 30000 }); await sleep(500); return p; };
const A = await page('Alpha');
await A.click('#btnCoop'); await sleep(400); await A.click('#lTabCreate'); await sleep(200);
await A.click('#timeChips button[data-t="6"]');
await A.click('#btnCreate');
await A.waitForSelector('#roomLobby:not([hidden])', { timeout: 20000 });
const code = await A.evaluate(() => window.__hsg.net.code);
const B = await page('Bravo');
await B.click('#btnCoop'); await sleep(300); await B.fill('#optRoom', code); await B.click('#btnJoin');
await B.waitForSelector('#roomLobby:not([hidden])', { timeout: 20000 }); await sleep(800);
await A.click('#rlGo'); // the host starts
await A.waitForFunction(() => window.__hsg && window.__hsg.me && window.__hsg.net.online, null, { timeout: 20000 });
await B.waitForFunction(() => window.__hsg && window.__hsg.me && window.__hsg.net.online, null, { timeout: 20000 });
await sleep(2000);
const st = (p) => p.evaluate(() => { const g = window.__hsg, n = g.net; return { time: n.settings.time, m: n.match && { n: n.match.n, over: n.match.over }, left: n.match ? Math.round((n.match.endsAt - n.serverNow()) / 1000) : null, clock: document.getElementById('clockT').textContent, clockShown: !document.getElementById('clock').hidden, overlay: !document.getElementById('matchEnd').hidden, winner: document.getElementById('meWinner').textContent, scores: Object.fromEntries([...g.cars.values()].map((c) => [c.name, c.score])), coins: g.account.coins }; });
let a = await st(A), b = await st(B);
ok(a.time === 6 && b.time === 6, `CREATE with 6 minutes: both see a 6-minute room (${a.time}, ${b.time})`);
ok(a.clockShown && b.clockShown && Math.abs(a.left - b.left) <= 1, `the match clock shows on both and agrees (${a.clock} / ${b.clock})`);
await A.screenshot({ path: `${SHOTS}match-clock.png` });
const ids = { A: await A.evaluate(() => window.__hsg.me.id), B: await B.evaluate(() => window.__hsg.me.id) };
// Alpha smashes Bravo (Bravo's own browser wrecks Bravo, crediting Alpha)
const smash = (victim, killerId) => victim.evaluate((kid) => { const g = window.__hsg; g.me.shield = 0; g.me.damage(500, g.cars.get(kid)); }, killerId);
await smash(B, ids.A); await sleep(1500);
a = await st(A); b = await st(B);
ok(a.scores.Alpha === 1 && b.scores.Alpha === 1, `a smash scores on both screens (Alpha ${a.scores.Alpha} / ${b.scores.Alpha})`);
// new parts across the network: Alpha on balloons, popped; Bravo sees it
await A.evaluate(() => { const g = window.__hsg; g.applySetup({ ...g.account.setup, ride: 'mudrunner', wheels: 'balloon', bumper: 'oil' }); });
await sleep(1500);
await A.evaluate(() => { const m = window.__hsg.me; m.shield = 0; m.damage(20, null); });
await sleep(800);
ok(await B.evaluate((id) => !!window.__hsg.cars.get(id).popped, ids.A), "Alpha's balloon tires pop, and Bravo sees the bare rims");
// Alpha drops oil in front of Bravo, who drives through and spins out on Bravo's own screen
const ax = await A.evaluate(() => { const g = window.__hsg, m = g.me; m.unwreck && m.wrecked && m.unwreck(m.body.p[0]); m.respawnAt(m.body.p[0], 0); m.setFacing(1); m.holderYaw = 90; m.shield = 99; return m.body.p[0]; });
await sleep(1200);
await A.keyboard.press('KeyQ'); await sleep(600);
await B.evaluate((x) => { const g = window.__hsg, m = g.me; if (m.wrecked) m.unwreck(x - 14); m.respawnAt(x - 14, 0); m.setFacing(1); m.holderYaw = 90; m.shield = 99; }, ax);
await sleep(800);
await B.keyboard.down('KeyD');
let spun = 0; for (let i = 0; i < 50; i++) { spun = Math.max(spun, await B.evaluate(() => Math.abs(window.__hsg.me.body.w) * (window.__hsg.me.oilT > 0 ? 1 : 0))); await sleep(60); }
await B.keyboard.up('KeyD');
ok(spun > 2, `Bravo drives through Alpha's oil and spins out on Bravo's own screen (${spun.toFixed(1)} rad/s)`);
// smoke: Alpha disappears from Bravo's screen inside the cloud
await A.evaluate(() => { const g = window.__hsg; g.applySetup({ ...g.account.setup, bumper: 'smoke' }); });
await sleep(1500);
await A.keyboard.press('KeyQ'); await sleep(300);
await A.evaluate(() => { const m = window.__hsg.me, C = m.bumperG.clouds[0], b = m.body; b.v[0] = Math.sign(C.x - b.p[0]) * 4.5; }); // back into the cloud
let hid = false;
for (let i = 0; i < 25 && !hid; i++) { hid = await B.evaluate((id) => { const c = window.__hsg.cars.get(id); return c.inSmoke && !c.holder.enabled; }, ids.A); await sleep(100); }
const dbg = hid ? '' : JSON.stringify({ onB: await B.evaluate((id) => { const c = window.__hsg.cars.get(id); return { x: c.body.p[0].toFixed(1), y: c.body.p[1].toFixed(1), wrecked: c.wrecked, bumper: c.setup.bumper, clouds: c.bumperG && c.bumperG.clouds }; }, ids.A), onA: await A.evaluate(() => { const m = window.__hsg.me; return { x: m.body.p[0].toFixed(1), y: m.body.p[1].toFixed(1), bumper: m.setup.bumper, cd: m.bumperG && m.bumperG.cd, clouds: m.bumperG && m.bumperG.clouds }; }) });
ok(hid, `Alpha's smoke bomb hides Alpha on Bravo's screen ${dbg}`);
// time runs out
await A.waitForFunction(() => window.__hsg.net.match.over, null, { timeout: 40000 });
await sleep(1200);
a = await st(A); b = await st(B);
ok(a.overlay && b.overlay && /Alpha wins/.test(a.winner) && /Alpha wins/.test(b.winner), `time's up: both show "${a.winner}"`);
ok(a.clock === '0:00' && b.clock === '0:00', 'the clock reads 0:00 in the break');
await A.screenshot({ path: `${SHOTS}match-results.png` });
await B.setViewportSize({ width: 390, height: 760 }); await sleep(400); await B.screenshot({ path: `${SHOTS}match-results-phone.png` }); await B.setViewportSize({ width: 1100, height: 640 });
const coinsWin = a.coins;
// a smash in the break does not count
await smash(A, ids.B); await sleep(1200);
a = await st(A); b = await st(B);
ok(a.scores.Bravo === 0 && b.scores.Bravo === 0, `a smash during the break doesn't count (Bravo ${b.scores.Bravo})`);
// back in the lobby, the host starts the next match
await A.waitForFunction(() => window.__hsg.net.phase === 'lobby', null, { timeout: 20000 }); await sleep(600);
await A.click('#rlGo');
await A.waitForFunction(() => !window.__hsg.net.match.over, null, { timeout: 20000 });
await sleep(1500);
a = await st(A); b = await st(B);
ok(a.m.n === 2 && b.m.n === 2 && !a.overlay && !b.overlay, `match 2 starts on both (overlay gone)`);
ok(Object.values(a.scores).every((v) => v === 0) && Object.values(b.scores).every((v) => v === 0), `everyone back on zero (${JSON.stringify(b.scores)})`);
ok(Math.abs(a.left - b.left) <= 1 && a.left > 15, `a fresh clock on both (${a.clock} / ${b.clock})`);
// the host changes the match length; guests can't
await A.keyboard.press('Escape'); await sleep(300);
await A.click('#optTime button[data-v="12"]'); await sleep(800);
await A.keyboard.press('Escape');
await B.keyboard.press('Escape'); await sleep(300);
ok(await B.isDisabled('#optTime button[data-v="6"]') && (await B.evaluate(() => window.__hsg.net.settings.time)) === 12, 'the host sets 12 minutes for the next match; the guest sees it but cannot change it');
await B.keyboard.press('Escape');
ok(A.errors.length === 0 && B.errors.length === 0, `no page errors ${[...A.errors, ...B.errors].slice(0, 2).join(' | ')}`);
console.log(`  (Alpha's coins after the win: ${coinsWin})`);
await browser.close();

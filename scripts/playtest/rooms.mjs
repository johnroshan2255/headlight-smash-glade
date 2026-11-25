// Rooms and their lobby: CREATE a public room (listed under JOIN) or a private one (code only);
// everyone waits in the room's lobby, picks a colour (same colour = a team, no friendly fire),
// the host presses START and everyone drops in together; no bots unless the host adds them;
// a late joiner drives in; after the match it's back to the lobby and the host starts the next one.
// Needs a server with short matches:  PORT=2568 MATCH_MS=30000 MATCH_BREAK_MS=5000 node server/index.js
import { launch, sleep, SHOTS } from './lib.mjs';
const BASE = process.env.HSG_MATCH_URL || 'http://localhost:2568';
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const page = async (name, vp = { width: 1100, height: 680 }) => { const ctx = await browser.newContext({ viewport: vp }); const p = await ctx.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message)); await p.goto(`${BASE}/?name=${name}`); await p.waitForSelector('#menu:not([hidden])', { timeout: 30000 }); await sleep(400); return p; };
const rooms = async () => (await fetch(`${BASE}/rooms`)).json();
const inLobby = (p) => p.evaluate(() => !document.getElementById('roomLobby').hidden);
const inGame = (p) => p.evaluate(() => !!(window.__hsg && window.__hsg.me));
const info = (p) => p.evaluate(() => { const g = window.__hsg, n = g.net; return { phase: n.phase, players: n.players.map((q) => q.name), color: n.myColor, cars: g.cars ? [...g.cars.values()].map((c) => c.name) : [], bots: g.cars ? [...g.cars.keys()].filter((k) => String(k).startsWith('bot')).length : 0, go: document.getElementById('rlGo').textContent, goOff: document.getElementById('rlGo').disabled, teams: document.getElementById('rlTeams').textContent }; });

// Alpha creates a public room, no bots, 6 minutes
const A = await page('Alpha');
await A.click('#btnCoop'); await sleep(300); await A.click('#lTabCreate'); await sleep(200);
await A.click('#timeChips button[data-t="6"]');
await A.screenshot({ path: `${SHOTS}rooms-create.png` });
await A.click('#btnCreate');
await A.waitForSelector('#roomLobby:not([hidden])', { timeout: 15000 }); await sleep(800);
let a = await info(A);
const code = await A.evaluate(() => window.__hsg.net.code);
ok(!(await inGame(A)) && a.phase === 'lobby' && a.go === 'START' && !a.goOff, `CREATE puts the host in the room's lobby (not the game), with START (room ${code})`);
await A.screenshot({ path: `${SHOTS}rooms-lobby-host.png` });
let list = await rooms();
ok(list.some((r) => r.code === code && r.host === 'Alpha' && r.phase === 'lobby'), `the public room is listed under JOIN as Alpha's (${JSON.stringify(list.map((r) => [r.host, r.code, r.phase]))})`);

// Bravo taps it in the JOIN list
const B = await page('Bravo', { width: 390, height: 780 });
await B.click('#btnCoop'); await sleep(3300);
const listed = await B.evaluate(() => [...document.querySelectorAll('#glades button b')].map((b) => b.textContent));
ok(listed.includes('Alpha'), `Bravo's JOIN list shows Alpha's room (${listed.join(', ')})`);
await B.click(`#glades button[data-code="${code}"]`);
await B.waitForSelector('#roomLobby:not([hidden])', { timeout: 15000 }); await sleep(800);
let b = await info(B);
ok(!(await inGame(B)) && b.players.length === 2 && b.go === 'WAITING FOR HOST' && b.goOff, `Bravo waits in the lobby with Alpha (${b.players.join(', ')}; "${b.go}")`);
await B.screenshot({ path: `${SHOTS}rooms-lobby-guest-phone.png` });

// a private room: not listed, joined by typing its code
const C = await page('Charlie');
await C.click('#btnCoop'); await sleep(300); await C.click('#lTabCreate'); await C.click('#visChips button[data-v="1"]'); await C.click('#btnCreate');
await C.waitForSelector('#roomLobby:not([hidden])', { timeout: 15000 }); await sleep(600);
const pcode = await C.evaluate(() => window.__hsg.net.code);
list = await rooms();
ok(!list.some((r) => r.code === pcode), `Charlie's private room ${pcode} is not listed`);
const D = await page('Delta');
await D.click('#btnCoop'); await sleep(300); await D.fill('#optRoom', pcode.toLowerCase()); await D.click('#btnJoin');
await D.waitForSelector('#roomLobby:not([hidden])', { timeout: 15000 }); await sleep(600);
ok((await info(D)).players.includes('Charlie'), 'Delta joins the private room by typing its code');
await D.goto(`${BASE}/`); await D.waitForSelector('#menu:not([hidden])'); await D.click('#btnCoop'); await sleep(300);
await D.fill('#optRoom', 'ZZZZ'); await D.click('#btnJoin'); await sleep(1500);
ok(await D.evaluate(() => !document.getElementById('lobbyMsg').hidden && /No room/.test(document.getElementById('lobbyMsg').textContent)), 'a wrong code says there is no such room (and makes none)');

// colours: Bravo takes Alpha's colour -> a team
const ac = (await info(A)).color;
await B.click(`#rlColors button[data-c="${ac}"]`); await sleep(800);
a = await info(A); b = await info(B);
ok(b.color === ac && /Teams: .*Alpha.*Bravo|Teams: .*Bravo.*Alpha/.test(a.teams), `Bravo picks Alpha's colour: a team on both screens ("${a.teams}")`);
// the host starts: everyone drops in together, no bots
await A.click('#rlGo');
await Promise.all([A.waitForFunction(() => window.__hsg && window.__hsg.me, null, { timeout: 15000 }), B.waitForFunction(() => window.__hsg && window.__hsg.me, null, { timeout: 15000 })]);
await sleep(2000);
a = await info(A); b = await info(B);
ok(a.phase === 'playing' && !(await inLobby(A)) && !(await inLobby(B)), 'START drops Alpha and Bravo into the glade together');
ok(a.bots === 0 && b.bots === 0 && a.cars.length === 2, `no bots unless the host adds them (${a.cars.join(', ')})`);
ok(await A.evaluate(() => { const g = window.__hsg; return [...g.cars.values()].every((c) => c.colorIdx === g.me.colorIdx); }), 'teammates wear the same colour');
// no friendly fire, no team-kill credit
const idB = await B.evaluate(() => window.__hsg.me.id);
const hp = await A.evaluate((id) => { const g = window.__hsg, m = g.me; m.shield = 0; const h = m.hp; m.damage(40, g.cars.get(id)); return [h, m.hp]; }, idB);
ok(hp[0] === hp[1], `a teammate's hit does no damage (${hp[0]} -> ${hp[1]})`);
// a late joiner: Echo arrives mid-match and drives in
const E = await page('Echo');
await E.click('#btnCoop'); await sleep(300); await E.fill('#optRoom', code); await E.click('#btnJoin');
await E.waitForSelector('#roomLobby:not([hidden])', { timeout: 15000 }); await sleep(800);
const eg = await info(E);
ok(eg.go === 'DRIVE IN' && !eg.goOff, `a late joiner sees the match is on and gets DRIVE IN ("${eg.go}")`);
await E.click('#rlGo');
await E.waitForFunction(() => window.__hsg && window.__hsg.me, null, { timeout: 15000 }); await sleep(1500);
ok((await info(A)).cars.includes('Echo'), 'Echo drives in and Alpha sees Echo');
// the match ends: results, then everyone back in the lobby; the host starts the next one
await A.waitForFunction(() => window.__hsg.net.phase === 'results', null, { timeout: 40000 });
await sleep(800);
ok(await A.evaluate(() => !document.getElementById('matchEnd').hidden), 'time up: the results show');
await A.waitForFunction(() => window.__hsg.net.phase === 'lobby', null, { timeout: 20000 });
await sleep(1200);
a = await info(A); b = await info(B);
ok((await inLobby(A)) && (await inLobby(B)) && (await inLobby(E)) && a.go === 'START NEXT MATCH' && b.go === 'WAITING FOR HOST', `after the results everyone is back in the lobby ("${a.go}" / "${b.go}")`);
await A.screenshot({ path: `${SHOTS}rooms-lobby-after.png` });
await A.click('#rlGo'); await sleep(2000);
ok(!(await inLobby(A)) && !(await inLobby(B)) && (await info(B)).phase === 'playing', 'the host starts the next match and everyone is back in the glade');
// the host adds bots for the next round from the in-game settings
await A.keyboard.press('Escape'); await sleep(300); await A.selectOption('#optBots', '2'); await sleep(2500); await A.keyboard.press('Escape');
ok((await info(B)).bots === 2, 'the host adds 2 bots; the guests see them');
const errs = [A, B, C, D, E].flatMap((p) => p.errors);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await browser.close();

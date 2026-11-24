// Private rooms: create one from the lobby with no bots, stay off the public list, a friend joins
// by code, the host turns bots on mid-game (guests can't), and the public glade still fills with bots.
import { launch, sleep, SHOTS, BASE } from './lib.mjs';
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const page = async (vp = { width: 1280, height: 720 }) => { const ctx = await browser.newContext({ viewport: vp }); const p = await ctx.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message)); await p.goto(`${BASE}/`); await p.waitForSelector('#menu:not([hidden])', { timeout: 30000 }); await sleep(600); return p; };
const info = (p) => p.evaluate(() => { const g = window.__hsg; return { online: g.net.online, code: g.net.code, host: g.net.isHost, settings: g.net.settings, cars: [...g.cars.values()].map((c) => c.name), bots: [...g.cars.keys()].filter((id) => String(id).startsWith('bot')).length }; });
// A creates a private room, no bots
const A = await page();
await A.click('#btnCoop'); await sleep(500);
await A.click('#lTabCreate'); await sleep(300);
await A.screenshot({ path: `${SHOTS}rooms-create.png` });
const code = (await A.textContent('#newCode')).trim();
ok(/^[A-Z0-9]{4}$/.test(code) && /CREATE .* & DRIVE/.test(await A.textContent('#btnJoin')), `CREATE tab shows a code (${code}) and "${await A.textContent('#btnJoin')}"`);
await A.click('#btnJoin');
await A.waitForFunction(() => window.__hsg && window.__hsg.me && window.__hsg.net.online, null, { timeout: 15000 });
await sleep(2500);
let a = await info(A);
ok(a.code === code && a.settings.private && a.settings.bots === 0 && a.bots === 0, `A is in private room ${a.code} with no bots (${JSON.stringify(a)})`);
const listed = await (await fetch(`${BASE}/rooms`)).json();
ok(!listed.some((r) => r.code === code), `the private room is not on the open list (${JSON.stringify(listed)})`);
// B joins by code
const B = await page({ width: 390, height: 844 });
await B.click('#btnCoop'); await sleep(400);
await B.fill('#optRoom', code.toLowerCase()); await sleep(200);
await B.screenshot({ path: `${SHOTS}rooms-join-phone.png` });
await B.click('#btnJoin');
await B.waitForFunction(() => window.__hsg && window.__hsg.me && window.__hsg.net.online, null, { timeout: 15000 });
await sleep(2500);
let b = await info(B); a = await info(A);
ok(b.code === code && b.cars.length === 2 && a.cars.length === 2 && b.bots === 0, `B joined by code: just the two of them (${b.cars.join(', ')})`);
// guests can't change the room; the host can
await B.keyboard.press('Escape'); await sleep(300);
ok(await B.isDisabled('#optBots'), 'the guest sees the bots setting but cannot change it');
await B.keyboard.press('Escape');
await A.keyboard.press('Escape'); await sleep(300);
await A.screenshot({ path: `${SHOTS}rooms-settings.png` });
ok((await A.textContent('#roomCodeIn')).trim() === code, 'the host settings show the invite code');
await A.selectOption('#optBots', '2'); await sleep(2500);
await A.keyboard.press('Escape');
a = await info(A); b = await info(B);
ok(a.bots === 2 && b.bots === 2 && a.settings.bots === 2 && b.settings.bots === 2, `host turned on 2 bots; both see them (A ${a.bots}, B ${b.bots})`);
// the public glade still fills with bots
const C = await page();
await C.click('#btnCoop'); await sleep(400);
await C.click('#btnJoin');
await C.waitForFunction(() => window.__hsg && window.__hsg.me && window.__hsg.net.online, null, { timeout: 15000 });
await sleep(2500);
const c = await info(C);
ok(c.code === '' && c.bots >= 4, `the public glade fills with bots as before (${c.bots} bots)`);
ok(A.errors.length + B.errors.length + C.errors.length === 0, `no errors ${[...A.errors, ...B.errors, ...C.errors].slice(0, 3).join(' | ')}`);
await browser.close();

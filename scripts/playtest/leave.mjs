// Leaving: a guest leaving only removes their car (the room carries on); the host leaving closes
// the room for everyone, who land back on the menu with the reason.
import { launch, open, sleep, BASE } from './lib.mjs';
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const room = 'L' + Math.floor(Math.random() * 9000 + 1000);
const q = (name) => `autostart&mode=online&veh=mudrunner&gpu=webgl2&room=${room}&name=${name}`;
const A = await open(browser, { query: q('Host') });
await sleep(1200);
const B = await open(browser, { query: q('Guest1') });
const C = await open(browser, { query: q('Guest2') });
await sleep(3000);
// a reload should land on the menu, like a real player's (the test URL would otherwise auto-join again)
for (const P of [B, C]) await P.page.evaluate(() => history.replaceState(null, '', location.pathname));
const names = (P) => P.page.evaluate(() => [...window.__hsg.cars.values()].filter((c) => !String(c.id).startsWith('bot')).map((c) => c.name).sort().join(','));
ok((await names(A)) === 'Guest1,Guest2,Host', `three drivers in ${room} (${await names(A)})`);
// a guest leaves: only they go
await C.page.evaluate(() => { const b = document.getElementById('btnLeave'); b.click(); b.click(); }); // LEAVE asks once (SURE?), the second tap leaves
await sleep(2000);
ok((await names(A)) === 'Guest1,Host' && (await names(B)) === 'Guest1,Host', `Guest2 left: the others carry on (${await names(A)} / ${await names(B)})`);
ok(await A.page.evaluate(() => window.__hsg.net.online) && await B.page.evaluate(() => window.__hsg.net.online), 'the room is still open');
// the host leaves: everyone goes back to the menu with the reason
await A.page.context().close();
await sleep(1200);
const toast = await B.page.textContent('#toast').catch(() => '');
ok(/left, so the room closed/.test(toast), `Guest1 is told why: "${toast.trim()}"`);
await B.page.waitForSelector('#menu:not([hidden])', { timeout: 15000 });
const notice = await B.page.textContent('#tip');
ok(/left, so the room closed/.test(notice), `Guest1 is back on the menu with the notice: "${notice.trim()}"`);
const rooms = await (await fetch(`${BASE}/rooms`)).json();
ok(!rooms.some((r) => r.code === room), `the room is gone from the server (${JSON.stringify(rooms)})`);
await browser.close();

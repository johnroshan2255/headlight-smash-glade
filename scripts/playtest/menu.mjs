// The menu and the co-op lobby: screenshots (desktop + phone) and the flows. One player waits in
// room FROG so the lobby's open-glade list has something in it.
import { launch, open, sleep, SHOTS, BASE } from './lib.mjs';
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const host = await open(browser, { query: 'autostart&mode=online&room=FROG&name=Frog&veh=kart' });
const phone = { isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
for (const [tag, viewport, extra] of [['desk', { width: 1280, height: 720 }, { deviceScaleFactor: 2 }], ['phone', { width: 390, height: 844 }, phone], ['phone-land', { width: 844, height: 390 }, phone]]) {
  const ctx = await browser.newContext({ viewport, ...extra });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${BASE}/`);
  await p.waitForSelector('#menu:not([hidden])', { timeout: 30000 });
  await sleep(900);
  await p.screenshot({ path: `${SHOTS}menu-${tag}.png` });
  const visible = await p.evaluate(() => [...document.querySelectorAll('#boot button, #boot input, #boot select')].filter((e) => e.offsetParent).map((e) => e.id));
  ok(visible.join() === 'btnPlay,btnCoop,btnGarage', `${tag}: just PLAY, CO-OP and GARAGE on the menu (${visible.join()})`);
  await p.click('#btnCoop');
  await sleep(3800);
  await p.screenshot({ path: `${SHOTS}lobby-${tag}.png` });
  const glades = await p.evaluate(() => [...document.querySelectorAll('#glades button')].map((b) => b.textContent));
  ok(glades.some((g) => g.startsWith('Frog')), `${tag}: JOIN lists Frog's room (${glades.join(' | ')})`);
  const fits = await p.evaluate(() => { const L = document.getElementById('lobby'); const r = L.getBoundingClientRect(); return r.bottom <= innerHeight && r.right <= innerWidth && r.left >= 0 && L.scrollHeight <= L.clientHeight + 1; });
  ok(fits, `${tag}: the whole lobby fits on screen without scrolling`);
  const lobbyBtns = await p.evaluate(() => [...document.querySelectorAll('#lobby button, #lobby input')].filter((e) => e.offsetParent).map((e) => e.id || e.textContent));
  ok(!lobbyBtns.some((b) => /NEW|optHide|lobbyRide/.test(b)), `${tag}: no extra buttons (${lobbyBtns.join(',')})`);
  await p.click('#lTabCreate'); await sleep(200);
  await p.screenshot({ path: `${SHOTS}lobby-create-${tag}.png` });
  const fitsC = await p.evaluate(() => { const r = document.getElementById('btnCreate').getBoundingClientRect(); return r.bottom <= innerHeight && r.right <= innerWidth; });
  ok(fitsC, `${tag}: CREATE & DRIVE is on screen`);
  await p.click('#lTabJoin'); await sleep(200);
  if (tag === 'desk') {
    await p.fill('#optRoom', 'frog');
    ok((await p.inputValue('#optRoom')) === 'FROG' && (await p.textContent('#btnJoin')) === 'JOIN' && !(await p.isDisabled('#btnJoin')), 'typing a code upper-cases it and enables JOIN');
    await p.click('#lTabCreate'); await sleep(200);
    ok(await p.isVisible('#btnCreate') && await p.isVisible('#visChips'), 'CREATE offers public/private, bots, minutes and CREATE ROOM');
    await p.click('#lTabJoin'); await sleep(200);
    await p.click('#btnBack');
    ok(await p.isVisible('#btnPlay'), 'BACK returns to the menu');
    await p.click('#btnCoop');
    await sleep(1500);
    await p.click('#glades button[data-code="FROG"]'); // tapping a room joins its lobby; the match is on, so DRIVE IN
    await p.waitForSelector('#roomLobby:not([hidden])', { timeout: 15000 }); await sleep(600);
    ok((await p.textContent('#rlGo')) === 'DRIVE IN', 'tapping a listed room opens its lobby (match on: DRIVE IN)');
    await p.click('#rlGo');
    await p.waitForFunction(() => window.__hsg && window.__hsg.me, null, { timeout: 15000 });
    await sleep(2500);
    const s = await p.evaluate(() => ({ online: window.__hsg.net.online, code: window.__hsg.net.code, cars: [...window.__hsg.cars.values()].map((c) => c.name) }));
    ok(s.online && s.code === 'FROG' && s.cars.includes('Frog'), `JOIN puts you in FROG with Frog (${JSON.stringify(s)})`);
    // the garage from in-game settings: swap the ride mid-drive
    await p.keyboard.press('Escape');
    await p.click('#btnGarageIn'); await sleep(600);
    await p.click('#gItems .g-card[data-id="monster"]'); await sleep(900);
    await p.click('#gBack'); await sleep(1500);
    const v = await p.evaluate(() => window.__hsg.me.vehicle);
    const vOnHost = await host.page.evaluate((id) => window.__hsg.cars.get(id)?.vehicle, await p.evaluate(() => window.__hsg.me.id));
    ok(v === 'monster' && vOnHost === 'monster', `in-game garage swaps the ride and the host sees it (${v}, host sees ${vOnHost})`);
  }
  if (tag === 'phone') {
    await p.click('#btnBack');
    await p.click('#btnPlay');
    await p.waitForFunction(() => window.__hsg && window.__hsg.me, null, { timeout: 15000 });
    ok(await p.evaluate(() => !window.__hsg.net.online), 'PLAY starts a solo glade');
  }
  ok(errors.length === 0, `${tag}: no page errors ${errors.slice(0, 2).join(' ')}`);
  await ctx.close();
}
await browser.close();

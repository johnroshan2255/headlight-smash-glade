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
  ok(visible.join() === 'btnPlay,btnCoop', `${tag}: only PLAY and CO-OP on the menu (${visible.join()})`);
  await p.click('#btnCoop');
  await sleep(3800);
  await p.screenshot({ path: `${SHOTS}lobby-${tag}.png` });
  const glades = await p.evaluate(() => [...document.querySelectorAll('#glades button')].map((b) => b.textContent));
  ok(glades.some((g) => g.startsWith('FROG')), `${tag}: lobby lists FROG (${glades.join(' | ')})`);
  const fits = await p.evaluate(() => { const r = document.getElementById('btnJoin').getBoundingClientRect(); return r.bottom <= innerHeight && r.right <= innerWidth; });
  ok(fits, `${tag}: JOIN is on screen without scrolling`);
  if (tag === 'desk') {
    await p.click('#glades button[data-code="FROG"]');
    ok((await p.inputValue('#optRoom')) === 'FROG' && (await p.textContent('#btnJoin')) === 'JOIN FROG', 'clicking a glade fills the code');
    await p.click('#btnNewCode');
    const code = await p.inputValue('#optRoom');
    ok(/^[A-Z0-9]{4}$/.test(code), `NEW makes a private code (${code})`);
    await p.click('#btnBack');
    ok(await p.isVisible('#btnPlay'), 'BACK returns to the menu');
    await p.click('#btnCoop');
    await p.click('#glades button[data-code="FROG"]');
    await p.click('#btnJoin');
    await p.waitForFunction(() => window.__hsg && window.__hsg.me, null, { timeout: 15000 });
    await sleep(2500);
    const s = await p.evaluate(() => ({ online: window.__hsg.net.online, code: window.__hsg.net.code, cars: [...window.__hsg.cars.values()].map((c) => c.name) }));
    ok(s.online && s.code === 'FROG' && s.cars.includes('Frog'), `JOIN puts you in FROG with Frog (${JSON.stringify(s)})`);
    // in-game ride swap
    await p.keyboard.press('Escape');
    await p.selectOption('#optRide', 'monster');
    await sleep(1500);
    const v = await p.evaluate(() => window.__hsg.me.vehicle);
    const vOnHost = await host.page.evaluate((id) => window.__hsg.cars.get(id)?.vehicle, await p.evaluate(() => window.__hsg.me.id));
    ok(v === 'monster' && vOnHost === 'monster', `settings ride swap works and the host sees it (${v}, host sees ${vOnHost})`);
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

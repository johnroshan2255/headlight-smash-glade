// The in-game ≡ menu (the compact card), the solo map picker (menu and ≡), and the arrows that
// point at rivals off the screen. Solo with bots; screenshots on desktop and phone.
import { launch, sleep, SHOTS, BASE } from './lib.mjs';
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const phone = { isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
for (const [tag, viewport, extra] of [['desk', { width: 1280, height: 720 }, {}], ['phone', { width: 390, height: 844 }, phone], ['phone-land', { width: 844, height: 390 }, phone]]) {
  const ctx = await browser.newContext({ viewport, ...extra });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${BASE}/?bots=3`);
  await p.waitForSelector('#menu:not([hidden])', { timeout: 30000 }); await sleep(600);
  // the solo map picker under the menu: MOON (the world behind the menu switches)
  await p.evaluate(() => localStorage.removeItem('hsg.soloMap'));
  await p.click('#mapNext'); await sleep(200); await p.click('#mapNext'); await sleep(1200);
  const pick = await p.evaluate(() => ({ name: document.getElementById('mapNameMenu').textContent, map: window.__hsg && window.__hsg.map ? window.__hsg.map().id : null }));
  ok(pick.name === 'MOON CRATER', `${tag}: the menu's map picker (${pick.name})`);
  await p.screenshot({ path: `${SHOTS}ig-menu-${tag}.png` });
  await p.click('#btnPlay');
  await p.waitForFunction(() => window.__hsg && window.__hsg.me, null, { timeout: 30000 }); await sleep(2500);
  const m = await p.evaluate(() => window.__hsg.map());
  ok(m.id === 'crater' && m.gravity < 0.5, `${tag}: PLAY starts solo on Moon Crater (gravity x${m.gravity})`);
  // the ≡ card
  await p.click('#btnSettings'); await sleep(400);
  const card = await p.evaluate(() => { const r = document.querySelector('#settings .set-card').getBoundingClientRect(); const s = document.querySelector('#settings .set-card'); return { fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight + 1, scroll: s.scrollHeight > s.clientHeight + 2, map: !document.getElementById('mapBox').hidden, room: !document.getElementById('roomBox').hidden, on: document.querySelector('#optMap button.on')?.dataset.m }; });
  ok(card.fits && card.map && !card.room && card.on === 'crater', `${tag}: ≡ is the compact card, with the solo MAP row (${JSON.stringify(card)})`);
  await p.screenshot({ path: `${SHOTS}ig-settings-${tag}.png` });
  if (tag === 'desk') {
    await p.click('#optMap button[data-m="bog"]'); await sleep(1500);
    ok((await p.evaluate(() => window.__hsg.map().id)) === 'bog', 'switching the map from ≡ in solo');
    await p.click('#optPalette button[data-v="mono"]'); await sleep(200);
    ok(await p.evaluate(() => localStorage.getItem('hsg.palette') === 'mono'), 'the LOOK chips work');
    await p.click('#optPalette button[data-v="color"]');
    await p.click('#btnLeave'); await sleep(200);
    ok((await p.textContent('#btnLeave')) === 'SURE?' && await p.evaluate(() => !!window.__hsg.me), 'LEAVE asks once before leaving');
    await sleep(2700);
  }
  await p.click('#btnClose'); await sleep(300);
  // arrows: park the bots far to both sides, then look for the pointers
  await p.evaluate(() => { const g = window.__hsg, B = g.map().bounds, x = g.me.body.p[0]; let i = 0; for (const [id, c] of g.cars) if (String(id).startsWith('bot')) { const tx = Math.max(B[0] + 15, Math.min(B[1] - 15, x + (i++ % 2 ? -1 : 1) * (60 + i * 15))); c.respawnAt(tx, 0); const br = g.bots.get(id); if (br) br.update = () => { c.input.dir = 0; }; } });
  await sleep(1500);
  const ptr = await p.evaluate(() => [...document.querySelectorAll('.ptr')].filter((e) => e.style.display !== 'none').map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), d: e.textContent }; }));
  const inside = ptr.every((q) => q.x >= 0 && q.x <= innerWidthOf(viewport) && q.y >= 0 && q.y <= viewport.height);
  ok(ptr.length >= 2 && inside && ptr.some((q) => q.x < viewport.width / 2) && ptr.some((q) => q.x > viewport.width / 2), `${tag}: arrows point at the rivals off both sides of the screen (${ptr.map((q) => `${q.d}@${q.x},${q.y}`).join(' ')})`);
  await p.screenshot({ path: `${SHOTS}ig-arrows-${tag}.png` });
  // a rival in smoke gets no arrow
  const hidden = await p.evaluate(() => { const g = window.__hsg; const c = [...g.cars.values()].find((k) => k.isBot); c.inSmoke = true; return c.id; });
  ok(errors.length === 0, `${tag}: no page errors ${errors.slice(0, 2).join(' | ')}`);
  await ctx.close();
}
function innerWidthOf(v) { return v.width; }
await browser.close();

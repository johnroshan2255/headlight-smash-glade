// The garage and accounts: menu chips, live preview, buying and equipping (server-checked),
// register / sign out / sign in, and that a drive starts in the equipped setup.
import { launch, sleep, SHOTS, BASE } from './lib.mjs';
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const phone = { isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
for (const [tag, viewport, extra] of [['desk', { width: 1280, height: 720 }, { deviceScaleFactor: 2 }], ['phone', { width: 390, height: 844 }, phone], ['phone-land', { width: 844, height: 390 }, phone]]) {
  const ctx = await browser.newContext({ viewport, ...extra });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('crash', () => errors.push('CRASH'));
  await p.goto(`${BASE}/`);
  await p.waitForSelector('#menu:not([hidden])', { timeout: 30000 });
  await sleep(900);
  await p.screenshot({ path: `${SHOTS}g-menu-${tag}.png` });
  const chip = await p.textContent('#acctChip');
  ok(/GUEST/.test(chip) && /1,000/.test(chip), `${tag}: guest account with 1,000 coins (${chip.trim()})`);
  await p.click('#btnGarage');
  await sleep(1500);
  await p.screenshot({ path: `${SHOTS}g-rides-${tag}.png` });
  const cards = await p.$$eval('#gItems .g-card', (els) => els.length);
  ok(cards === 11, `${tag}: 11 rides in the garage (${cards})`);
  // free for now: nothing is locked, there's no BUY button, one card is equipped
  const look = await p.evaluate(() => ({ locked: document.querySelectorAll('#gItems .g-card.locked').length, eq: document.querySelectorAll('#gItems .g-card.eq').length, buy: !!document.getElementById('gAction').offsetParent, tabs: [...document.querySelectorAll('#gTabs button')].map((b) => b.textContent).join(',') }));
  ok(look.locked === 0 && look.eq === 1 && !look.buy, `${tag}: every ride is free, no BUY button (${JSON.stringify(look)})`);
  ok(look.tabs === 'RIDE,WHEELS,ROOF,BUMPER,PAINT,HAT', `${tag}: tabs ${look.tabs}`);
  const fits = await p.evaluate(() => { const r = document.querySelector('.g-panel').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth; });
  ok(fits, `${tag}: the garage panel fits the screen`);
  // tap a card: it's equipped and the preview wears it at once
  await p.click('#gItems .g-card[data-id="kart"]'); await sleep(900);
  ok((await p.evaluate(() => window.__hsg.cars.get('preview')?.vehicle)) === 'kart', `${tag}: preview shows the selection`);
  const after = await p.evaluate(() => ({ coins: window.__hsg.account.coins, ride: window.__hsg.account.setup.ride }));
  ok(after.ride === 'kart' && after.coins === 1000, `${tag}: equipped the Coffin Kart for free (coins still ${after.coins})`);
  await p.click('#gTabs button[data-tab="wheels"]'); await sleep(300);
  await p.click('#gItems .g-card[data-id="spider"]'); await sleep(800);
  await p.screenshot({ path: `${SHOTS}g-spider-${tag}.png` });
  ok((await p.evaluate(() => window.__hsg.cars.get('preview')?.setup.wheels)) === 'spider', `${tag}: preview tries on the spider rig`);
  const wheelCards = await p.$$eval('#gItems .g-card', (els) => els.map((e) => e.dataset.id));
  ok(wheelCards.join() === 'tires,treads,pogo,spider,saw,hover,balloon,magnet,square', `${tag}: wheels list has no locked upgrade card (${wheelCards.join()})`);
  await p.click('#gItems .g-card[data-id="tires"]'); await sleep(500);
  const max = await p.$eval('#gTire', (r) => r.max);
  ok(max === '250' && !(await p.isVisible('#gBigTires')), `${tag}: monster tire range unlocked (max ${max}%)`);
  await p.$eval('#gTire', (r) => { r.value = '140'; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); }); await sleep(800);
  await p.screenshot({ path: `${SHOTS}g-tires-${tag}.png` });
  ok((await p.evaluate(() => window.__hsg.account.setup.tire)) === 1.4, `${tag}: tire size saved at 140%`);
  await p.click('#gTabs button[data-tab="roof"]'); await sleep(300);
  await p.click('#gItems .g-card[data-id="arm"]'); await sleep(800);
  await p.click('#gTabs button[data-tab="bumper"]'); await sleep(300);
  await p.click('#gItems .g-card[data-id="glove"]'); await sleep(800);
  ok(await p.evaluate(() => window.__hsg.account.setup.roof === 'arm' && window.__hsg.account.setup.bumper === 'glove'), `${tag}: fitted the robot arm and boxing glove`);
  await p.screenshot({ path: `${SHOTS}g-bumper-${tag}.png` });
  await p.click('#gTabs button[data-tab="paint"]'); await sleep(300);
  await p.click('#gItems .g-card[data-id="3"]'); await sleep(800);
  await p.screenshot({ path: `${SHOTS}g-paint-${tag}.png` });
  ok((await p.evaluate(() => window.__hsg.account.setup.paint)) === 3, `${tag}: tapping a paint dot paints the car`);
  // register (keeps the guest's stuff), sign out, sign back in
  const name = `T${tag}${Math.floor(Math.random() * 1e5)}`;
  await p.click('#acctChip'); await sleep(300);
  await p.fill('#aName', name); await p.fill('#aPass', 'secret1');
  await p.click('#aGo'); await sleep(1200);
  await p.screenshot({ path: `${SHOTS}g-account-${tag}.png` });
  const reg = await p.evaluate(() => ({ name: window.__hsg.account.name, coins: window.__hsg.account.coins, ride: window.__hsg.account.setup.ride }));
  ok(reg.name === name && reg.coins === 1000 && reg.ride === 'kart', `${tag}: registered and kept the guest's coins and kart (${JSON.stringify(reg)})`);
  await p.click('#aOut'); await sleep(1200);
  const out = await p.evaluate(() => ({ name: window.__hsg.account.name, coins: window.__hsg.account.coins }));
  ok(out.name === null && out.coins === 1000, `${tag}: signed out to a fresh guest (${JSON.stringify(out)})`);
  await p.click('#aTabLog'); await p.fill('#aName', name); await p.fill('#aPass', 'secret1'); await p.click('#aGo'); await sleep(1200);
  const back = await p.evaluate(() => ({ name: window.__hsg.account.name, coins: window.__hsg.account.coins, ride: window.__hsg.account.setup.ride, tire: window.__hsg.account.setup.tire }));
  ok(back.name === name && back.ride === 'kart' && back.tire === 1.4, `${tag}: signed back in to the same garage (${JSON.stringify(back)})`);
  await p.click('#aBack'); await p.click('#gBack'); await sleep(500);
  ok(await p.isVisible('#btnPlay'), `${tag}: back to the menu`);
  // the drive uses the equipped setup
  await p.click('#btnPlay');
  await p.waitForFunction(() => window.__hsg && window.__hsg.me, null, { timeout: 15000 });
  await sleep(1500);
  const me = await p.evaluate(() => ({ ride: window.__hsg.me.vehicle, tire: window.__hsg.me.setup.tire, roof: window.__hsg.me.setup.roof, bumper: window.__hsg.me.setup.bumper }));
  ok(me.ride === 'kart' && me.tire === 1.4 && me.roof === 'arm' && me.bumper === 'glove', `${tag}: PLAY drives the equipped kart, 140% tires, arm + glove`);
  await p.screenshot({ path: `${SHOTS}g-drive-${tag}.png` });
  ok(errors.length === 0, `${tag}: no page errors ${errors.slice(0, 2).join(' | ')}`);
  await ctx.close();
}
await browser.close();

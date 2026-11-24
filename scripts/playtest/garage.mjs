// The garage and accounts: menu chips, live preview, buying and equipping (server-checked),
// register / sign out / sign in, and that a drive starts in the equipped setup.
import { launch, sleep, SHOTS, BASE } from './lib.mjs';
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const phone = { isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
for (const [tag, viewport, extra] of [['desk', { width: 1280, height: 720 }, { deviceScaleFactor: 2 }], ['phone', { width: 390, height: 844 }, phone]]) {
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
  // free for now: every card is FREE, equipping costs nothing
  const tags = await p.$$eval('#gItems .g-card span', (els) => els.map((e) => e.textContent));
  ok(tags.filter((t) => t === 'FREE').length === 10 && tags.includes('EQUIPPED'), `${tag}: every ride is free (${tags.join(',')})`);
  await p.click('#gItems .g-card[data-id="kart"]'); await sleep(600);
  ok((await p.evaluate(() => window.__hsg.cars.get('preview')?.vehicle)) === 'kart', `${tag}: preview shows the selection`);
  await p.click('#gAction'); await sleep(900);
  const after = await p.evaluate(() => ({ coins: window.__hsg.account.coins, ride: window.__hsg.account.setup.ride }));
  ok(after.ride === 'kart' && after.coins === 1000, `${tag}: equipped the Coffin Kart for free (coins still ${after.coins})`);
  await p.click('#gTabs button[data-tab="wheels"]'); await sleep(300);
  await p.click('#gItems .g-card[data-id="spider"]'); await sleep(800);
  await p.screenshot({ path: `${SHOTS}g-spider-${tag}.png` });
  ok((await p.evaluate(() => window.__hsg.cars.get('preview')?.setup.wheels)) === 'spider', `${tag}: preview tries on the spider rig`);
  await p.click('#gItems .g-card[data-id="tires"]'); await sleep(300);
  const max = await p.$eval('#gTire', (r) => r.max);
  ok(max === '250', `${tag}: monster tire range unlocked (max ${max}%)`);
  await p.$eval('#gTire', (r) => { r.value = '140'; r.dispatchEvent(new Event('input')); }); await sleep(500);
  await p.click('#gAction'); await sleep(700);
  ok((await p.evaluate(() => window.__hsg.account.setup.tire)) === 1.4, `${tag}: tire size saved at 140%`);
  await p.click('#gTabs button[data-tab="roof"]'); await sleep(300);
  await p.click('#gItems .g-card[data-id="arm"]'); await sleep(300); await p.click('#gAction'); await sleep(700);
  await p.click('#gTabs button[data-tab="bumper"]'); await sleep(300);
  await p.click('#gItems .g-card[data-id="glove"]'); await sleep(300); await p.click('#gAction'); await sleep(700);
  ok(await p.evaluate(() => window.__hsg.account.setup.roof === 'arm' && window.__hsg.account.setup.bumper === 'glove'), `${tag}: fitted the robot arm and boxing glove`);
  await p.screenshot({ path: `${SHOTS}g-bumper-${tag}.png` });
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

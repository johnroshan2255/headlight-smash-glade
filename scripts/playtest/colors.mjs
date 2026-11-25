// Paint check: garage close-ups of rides and kit, and an in-game scene with every bot's colour,
// on WebGL2 and WebGPU (the paint shader must compile on both).
import { launch, open, sleep, SHOTS, BASE } from './lib.mjs';
const browser = await launch({ webgpu: true });
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/powerPreference/.test(m.text())) errs.push(m.text()); });
await p.goto(`${BASE}/?gpu=webgl2`); await p.waitForSelector('#menu:not([hidden])'); await sleep(800);
await p.click('#btnGarage'); await sleep(600);
const shots = [['rides', 'mudrunner'], ['rides', 'bus'], ['rides', 'roller'], ['rides', 'tub'], ['wheels', 'spider'], ['wheels', 'pogo'], ['wheels', 'treads'], ['wheels', 'hover'], ['roof', 'hands'], ['roof', 'balloon'], ['roof', 'ball'], ['bumper', 'glove']];
for (const [tab, id] of shots) { await p.click(`#gTabs button[data-tab="${tab}"]`); await p.click(`#gItems .g-card[data-id="${id}"]`); await sleep(1100); await p.screenshot({ path: `${SHOTS}col-${id}.png`, clip: { x: 300, y: 120, width: 680, height: 380 } }); }
// the PAINT tab: pick Teal, the preview and the drive wear it, and another player sees it
await p.click('#gTabs button[data-tab="paint"]'); await sleep(300);
const swatches = await p.$$eval('#gItems .g-card.sw', (e) => e.length); // (tap to equip: the card is the swatch)
ok(swatches === 9, `PAINT tab shows 9 swatches (${swatches})`);
await p.click('#gItems .g-card[data-id="4"]'); await sleep(1200);
ok(await p.evaluate(() => window.__hsg.account.setup.paint === 4 && window.__hsg.cars.get('preview').setup.paint === 4), 'Teal is equipped and on the preview');
await p.screenshot({ path: `${SHOTS}col-paint.png` });
await p.click('#gBack');
ok(errs.length === 0, `garage (WebGL2): no errors ${errs.slice(0, 2).join(' | ')}`);
for (const gpu of ['webgl2', 'webgpu']) {
  const { page, errors } = await open(browser, { query: `autostart&mode=solo&veh=mudrunner&gpu=${gpu}&stats&bots=7` });
  await sleep(4000);
  await page.evaluate(() => { const g = window.__hsg; const xs = [...g.cars.values()].map((c) => c.body.p[0]); g.setCam(xs.reduce((a, b) => a + b, 0) / xs.length, g.me.body.p[1] + 2, 22); });
  await sleep(300);
  await page.screenshot({ path: `${SHOTS}col-scene-${gpu}.png` });
  const st = await page.evaluate(() => document.getElementById('stats').textContent.split('\n')[1]);
  ok(errors.length === 0 && st.includes(gpu === 'webgpu' ? 'WebGPU' : 'WebGL2'), `${gpu} scene renders the paint (${st}) ${errors.slice(0, 2).join(' | ')}`);
  await page.context().close();
}
await browser.close();

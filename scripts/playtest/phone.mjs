// Phone checks: portrait + landscape with touch, plus the ASCII view on both renderers.
import { launch, open, sleep, SHOTS } from './lib.mjs';
const browser = await launch({ webgpu: true });
const phone = { isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const jobs = [
  ['phone-portrait', { width: 390, height: 844 }, phone, 'webgl2', false],
  ['phone-landscape', { width: 844, height: 390 }, phone, 'webgl2', false],
];
for (const [name, viewport, context, gpu, ascii] of jobs) {
  const { page, errors, ctx } = await open(browser, { query: `autostart&mode=solo&veh=monster&gpu=${gpu}`, viewport, context });
  await page.evaluate(() => window.__hsg.me.respawnAt(-3, 0.2));
  if (ascii) { await page.keyboard.press('KeyV'); }
  // touch: hold the right pedal for a moment, tap HOP
  if (!ascii) {
    const r = await page.locator('#btnRight').boundingBox();
    const vis = await page.evaluate(() => [getComputedStyle(document.getElementById('pedals')).display, document.getElementById('actions').hidden]);
    const boxes = await page.evaluate(() => ['btnLeft', 'btnRight', 'btnHop', 'btnBoost', 'btnGadget', 'btnHorn', 'btnFlip'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, r.left, r.top, r.right, r.bottom]; }));
    const hit = []; for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const [a, b] = [boxes[i], boxes[j]]; if (a[1] < b[3] && b[1] < a[3] && a[2] < b[4] && b[2] < a[4]) hit.push(a[0] + '/' + b[0]); }
    console.log(name, 'overlapping buttons:', hit.length ? hit.join(' ') : 'none');
    console.log(name, 'pedals', vis[0], 'actions hidden', vis[1], 'right pedal box', r && [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]);
    const x0 = await page.evaluate(() => window.__hsg.me.body.p[0]);
    await page.dispatchEvent('#btnRight', 'pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true });
    await sleep(1200);
    await page.dispatchEvent('#btnRight', 'pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true });
    const x1 = await page.evaluate(() => window.__hsg.me.body.p[0]);
    console.log(name, `touch drive moved ${(x1 - x0).toFixed(1)} m`);
  }
  await sleep(1800);
  await page.screenshot({ path: `${SHOTS}${name}.png` });
  console.log(name, 'errors', errors.length ? errors.slice(0, 3) : 'none');
  await ctx.close();
}
await browser.close();

// Close-ups of every gadget fitted to a car: at rest facing right, in action, and facing left.
import { launch, open, sleep, SHOTS, emptyGlade } from './lib.mjs';
const ride = process.argv[2] || 'mudrunner';
const only = process.argv[3] ? process.argv[3].split(',') : null;
const browser = await launch();
const { page, errors } = await open(browser, { query: `autostart&mode=solo&veh=${ride}&gpu=webgl2&bots=0`, viewport: { width: 900, height: 600 } });
await sleep(1000);
await emptyGlade(page);
const L = [['roof', 'arm'], ['roof', 'hands'], ['roof', 'ball'], ['roof', 'magnet'], ['roof', 'mortar'], ['roof', 'balloon'], ['bumper', 'glove'], ['bumper', 'harpoon'], ['bumper', 'catcher'], ['bumper', 'flame'], ['bumper', 'eject']];
for (const [slot, id] of L) {
  if (only && !only.includes(id)) continue;
  await page.evaluate(([slot, id, ride]) => { const g = window.__hsg; g.applySetup({ ride, wheels: 'tires', tire: 1, roof: 'none', bumper: 'none', hat: 'straw', paint: -1, [slot]: id }); g.me.respawnAt(0.5, 0); g.me.shield = 99; g.lockCam({ follow: true, z: 8, dy: 0.9 }); }, [slot, id, ride]);
  await sleep(1300);
  await page.screenshot({ path: `${SHOTS}gl-${ride}-${id}-1.png` });
  const key = slot === 'roof' ? 'KeyE' : 'KeyQ';
  if (id === 'balloon') { await page.keyboard.press('Space'); await sleep(200); }
  await page.keyboard.press(key); await sleep(id === 'glove' ? 120 : 350);
  await page.screenshot({ path: `${SHOTS}gl-${ride}-${id}-2.png` });
  await sleep(600);
  await page.evaluate(() => { const m = window.__hsg.me; m.setFacing(-m.facing); });
  await sleep(700);
  await page.screenshot({ path: `${SHOTS}gl-${ride}-${id}-3.png` });
  if (id === 'eject') await sleep(4000);
}
console.log('errors', errors.length ? errors.slice(0, 3) : 'none');
await browser.close();

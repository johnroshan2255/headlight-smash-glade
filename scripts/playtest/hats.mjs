// Can every hat actually be collected? One scripted stunt per hat, in the real glade (props on, no bots).
import { launch, open, sleep } from './lib.mjs';
const veh = process.argv[2] || 'mudrunner';
const browser = await launch();
const { page, errors } = await open(browser, { query: `autostart&mode=solo&veh=${veh}&gpu=webgl2&bots=0` });
await sleep(1000);
// barrels off: a blast mid-stunt says nothing about where the hat hangs
await page.evaluate(() => { const S = window.__hsg.sandbox; for (const B of S.barrels) { B.alive = false; B.respawn = 1e9; B.body.enabled = false; } });
const kb = page.keyboard;
const place = (x, f, gadget = null) => page.evaluate(([x, f, g]) => { const m = window.__hsg.me; m.respawnAt(x, 0); m.setFacing(f); m.holderYaw = f * 90; m.hp = 100; m.boost = 1; m.shield = 60; m.gadget = g; m.gadgetT = 25; }, [x, f, gadget]);
const got = () => page.evaluate(() => window.__hsg.sandbox.hats.filter((h) => h.got).map((h) => h.id));
const hold = async (keys, ms) => { for (const k of keys) await kb.down(k); await sleep(ms); for (const k of keys) await kb.up(k); };
const L = ['KeyA', 'ShiftLeft'], R = ['KeyD', 'ShiftLeft'];
const stunts = {
  viking: async () => { await place(-5, 1); await sleep(500); await hold(R, 2200); },
  antlers: async () => { await place(-89.5, 1); await sleep(500); await hold(R, 2600); },
  propeller: async () => { await place(40, -1); await sleep(500); await hold(L, 2400); },
  party: async () => { await place(72, 1); await sleep(500); await hold(R, 2600); },
  crown: async () => { await place(59.5, 1); await sleep(500); await hold(R, 2600); },
  pirate: async () => { await place(50.5, -1); await sleep(500); await hold(L, 2600); },
  cone: async () => { await place(-89.5, -1); await sleep(500); await hold(L, 4500); },
  witch: async () => { await place(89.5, 1); await sleep(500); await hold(R, 4500); },
  tophat: async () => { await place(59.5, -1); await sleep(500); await hold(['KeyA'], 700); await sleep(1500); },
  chef: async () => { await place(-38.5, -1); await sleep(500); await hold(['KeyA'], 5000); },
  bucket: async () => { await place(-6, 1, 'hop'); await sleep(900); await kb.press('Space'); await sleep(1800); },
  halo: async () => { // park over the middle geyser and wait for it to blow
    await place(-53, 1); await sleep(600);
    for (let i = 0; i < 40; i++) { await sleep(500); const x = await page.evaluate(() => window.__hsg.me.body.p[0]); if (Math.abs(x + 53) > 1) await hold([x > -53 ? 'KeyA' : 'KeyD'], 120); if ((await got()).includes('halo')) break; }
  },
};
const only = process.argv[3] ? process.argv[3].split(',') : Object.keys(stunts);
for (const id of only) {
  let ok = false, tries = 0;
  for (; tries < 3 && !ok; tries++) { await stunts[id](); await sleep(600); ok = (await got()).includes(id); }
  console.log(`${veh.padEnd(10)} ${id.padEnd(10)} ${ok ? `collected (try ${tries})` : 'MISSED'}`);
}
console.log('errors', errors.length ? errors.slice(0, 4) : 'none');
await browser.close();

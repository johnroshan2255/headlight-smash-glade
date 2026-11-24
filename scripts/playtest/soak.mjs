// node soak.mjs [seconds] [veh] [idle|drive]: a solo glade with 5 bots. Reports wrecks, smashes, stuck bots, fps, errors.
import { launch, open, sleep, SHOTS } from './lib.mjs';
const secs = Number(process.argv[2] || 75), veh = process.argv[3] || 'mudrunner', mode = process.argv[4] || 'idle';
const browser = await launch();
const { page, errors } = await open(browser, { query: `autostart&mode=solo&veh=${veh}&gpu=webgl2&stats` });
const hist = new Map(); const wrecks = new Map(); let fpsMin = 99, fpsSum = 0, n = 0;
const stuck = [];
for (let t = 0; t < secs; t++) {
  if (mode === 'drive') { const k = Math.floor(t / 6) % 2 ? 'KeyA' : 'KeyD'; await page.keyboard.up('KeyA'); await page.keyboard.up('KeyD'); await page.keyboard.down(k); if (t % 3 === 0) await page.keyboard.press('Space'); }
  await sleep(1000);
  const s = await page.evaluate(() => { const g = window.__hsg; return { cars: [...g.cars.values()].map((c) => ({ id: c.id, n: c.name, x: c.body.p[0], y: c.body.p[1], a: Math.atan2(Math.sin(c.body.a), Math.cos(c.body.a)), w: c.wrecked, hp: c.hp, sc: c.score, tgt: g.bots.get(c.id)?.target?.kind || '-' })), fps: parseFloat(document.getElementById('stats').textContent) || 0, bodies: g.physics.bodies.length }; });
  if (s.fps) { fpsMin = Math.min(fpsMin, s.fps); fpsSum += s.fps; n++; }
  for (const c of s.cars) {
    const h = hist.get(c.id) || []; h.push(c); hist.set(c.id, h);
    if (h.length > 1 && c.w && !h.at(-2).w) wrecks.set(c.id, (wrecks.get(c.id) || 0) + 1);
    const win = h.slice(-10);
    if (win.length === 10 && win.every((q) => !q.w)) { const xs = win.map((q) => q.x); if (Math.max(...xs) - Math.min(...xs) < 2.5 && c.id !== 'local') { stuck.push(`t${t} ${c.n} x ${c.x.toFixed(0)} y ${c.y.toFixed(1)} tilt ${c.a.toFixed(1)} target ${c.tgt}`); hist.set(c.id, []); } }
  }
  if (t === Math.floor(secs / 2)) await page.screenshot({ path: `${SHOTS}soak-${veh}.png` });
}
const last = [...hist.values()].map((h) => h.at(-1)).filter(Boolean);
console.log(`fps avg ${(fpsSum / n).toFixed(0)} min ${fpsMin}`);
console.log('wrecks', [...wrecks.entries()].map(([id, k]) => `${id}:${k}`).join(' ') || 'none');
console.log('scores', last.map((c) => `${c.n}:${c.sc}`).join('  '));
console.log(`stuck windows (10 s within 2.5 m): ${stuck.length}`); for (const l of stuck.slice(0, 14)) console.log('  ', l);
console.log('errors', errors.length ? errors.slice(0, 6) : 'none');
await browser.close();

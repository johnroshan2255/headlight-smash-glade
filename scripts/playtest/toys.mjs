// The world toys: a teeter-totter tips and flings its barrel, a tornado lifts you, a magnet arch
// yanks you up when it pulses. Positions come from the generator (seed 1337).
import { launch, open, sleep, SHOTS } from './lib.mjs';
import { chunkSpec } from '../../src/gen.js';
import { archPhase, tornadoX } from '../../src/sandbox2d.js';
const find = (k) => { for (let i = 1; i < 200; i++) for (const c of [i, -i]) { const S = chunkSpec(c); if (k(S)) return S; } };
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const { page, errors } = await open(browser, { query: 'autostart&mode=solo&veh=monster&gpu=webgl2&bots=0' });
await sleep(1000);
const go = (x, f = 1) => page.evaluate(([x, f]) => { const g = window.__hsg; g.me.respawnAt(x, 0.5); g.me.setFacing(f); g.me.holderYaw = f * 90; g.me.shield = 99; g.setCam(x, g.me.body.p[1] + 2); }, [x, f]);
const st = () => page.evaluate(() => { const b = window.__hsg.me.body; return { x: b.p[0], y: b.p[1], g: b.p[1] - window.__hsg.world.terrain.height(b.p[0]) }; });
// teeter-totter: drive onto its low end and over the pivot: it tips
const T = find((S) => S.teeter !== null);
const side = (T.c & 1) ? 1 : -1; // the low end
await go(T.teeter + side * 13, -side); await sleep(2500);
const ang = () => page.evaluate((x) => { const P = [...window.__hsg.sandbox.dyn.values()].find((p) => p.kind === 'plank' && Math.abs(p.home[0] - x) < 1); return P && P.body.a; }, T.teeter);
const a0 = await ang();
await page.keyboard.down(side > 0 ? 'KeyA' : 'KeyD');
let aMin = a0, aMax = a0;
for (let i = 0; i < 26; i++) { const a = await ang(); aMin = Math.min(aMin, a); aMax = Math.max(aMax, a); if (i === 14) await page.screenshot({ path: `${SHOTS}toy-teeter.png` }); await sleep(80); }
await page.keyboard.up(side > 0 ? 'KeyA' : 'KeyD');
ok(a0 !== undefined && aMax - aMin > 0.4, `teeter-totter tips under the car (rest ${a0?.toFixed(2)}, swung ${aMin.toFixed(2)}..${aMax.toFixed(2)})`);
// tornado: park in its path
const N = find((S) => S.tornado);
await go(tornadoX(N.tornado)); await sleep(300);
let maxG = 0;
for (let i = 0; i < 30; i++) { const s = await st(); maxG = Math.max(maxG, s.g); if (i === 8) await page.screenshot({ path: `${SHOTS}toy-tornado.png` }); await sleep(100); }
ok(maxG > 4 && maxG < 20, `the tornado lifted the car (peak ${maxG.toFixed(1)} m off the ground)`);
// magnet arch: wait for a pull phase while parked beside it
const R = find((S) => S.arch !== null);
await go(R.arch - 7); await sleep(1500);
const wait = ((10 - (Date.now() / 1000) % 14) + 14) % 14;
await sleep(wait * 1000 + 1500);
const s = await st();
await page.screenshot({ path: `${SHOTS}toy-arch.png` });
ok(s.g > 2, `magnet arch pulled the car up (${s.g.toFixed(1)} m off the ground, phase ${archPhase()})`);
ok(errors.length === 0, `no errors ${errors.slice(0, 2).join(' | ')}`);
await browser.close();

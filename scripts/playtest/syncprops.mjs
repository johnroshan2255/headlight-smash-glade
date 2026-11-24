// Props across the network: the host rams barrels, a cage-ball and trees; how does the guest see them?
// (jumps per frame, and how far the guest's copy is from the host's truth)
import { launch, open, sleep } from './lib.mjs';
const browser = await launch();
const room = 'P' + Math.floor(Math.random() * 9000 + 1000);
const q = (name) => `autostart&mode=online&veh=hearse&gpu=webgl2&room=${room}&name=${name}&bots=0`;
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const A = await open(browser, { query: q('Host') });
await sleep(1200);
const B = await open(browser, { query: q('Guest') });
await sleep(3000);
await B.page.evaluate(() => window.__hsg.net.send('roomSettings', { bots: 0 }));
// both side by side; the host drives through the props ahead
for (const [P, x] of [[A, 24], [B, 14]]) await P.page.evaluate((x) => { const m = window.__hsg.me; m.respawnAt(x, 0); m.setFacing(1); m.holderYaw = 90; m.shield = 99; }, x);
await sleep(1500);
const watch = (P, ms) => P.page.evaluate((ms) => new Promise((res) => {
  const S = window.__hsg.sandbox, out = new Map(), t0 = performance.now();
  const tick = () => { for (const [id, Pp] of S.dyn) { if (Pp.alive === false || !Pp.ent) continue; const p = Pp.ent.getPosition(); const a = out.get(id) || []; a.push([performance.now() - t0, p.x, p.y]); out.set(id, a); } if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res([...out.entries()]); };
  requestAnimationFrame(tick);
}), ms);
const wB = watch(B, 7000), wA = watch(A, 7000);
await A.page.keyboard.down('KeyD'); await sleep(2200); await A.page.keyboard.up('KeyD'); await sleep(3500);
const [onB, onA] = await Promise.all([wB, wA]);
const truth = new Map(onA);
const movedA = onA.filter(([, pts]) => Math.hypot(pts.at(-1)[1] - pts[0][1], pts.at(-1)[2] - pts[0][2]) > 1).length;
console.log(`  host saw ${movedA} props move; guest has ${onB.length} props, host ${onA.length}`);
console.log('  guest world msgs:', await B.page.evaluate(() => { const S = window.__hsg.sandbox; return { targets: [...S.dyn.values()].filter((P) => P.target).length, host: window.__hsg.net.isHost, chunks: [...S.chunks.keys()].join(',') }; }));
console.log('  host x', await A.page.evaluate(() => window.__hsg.me.body.p[0].toFixed(1)), 'host chunks', await A.page.evaluate(() => [...window.__hsg.sandbox.chunks.keys()].join(',')));
let moving = 0, maxJump = 0, jumps = 0, maxErr = 0;
for (const [id, pts] of onB) {
  const T = truth.get(id); if (!T) continue;
  const span = Math.hypot(pts.at(-1)[1] - pts[0][1], pts.at(-1)[2] - pts[0][2]); if (span < 1) continue;
  moving++;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); maxJump = Math.max(maxJump, d); if (d > 1.2) jumps++; }
  const eB = pts.at(-1), eA = T.at(-1); maxErr = Math.max(maxErr, Math.hypot(eB[1] - eA[1], eB[2] - eA[2]));
}
console.log(`  guest saw ${moving} props move: max frame jump ${maxJump.toFixed(2)} m, big jumps ${jumps}, final error vs host ${maxErr.toFixed(2)} m`);
ok(moving > 0 && jumps === 0 && maxErr < 1.5, 'props move smoothly on the guest and end where the host has them');
ok(A.errors.length + B.errors.length === 0, `no errors ${[...A.errors, ...B.errors].slice(0, 3).join(' | ')}`);
await browser.close();

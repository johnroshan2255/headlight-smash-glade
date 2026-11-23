// AI drivers for the side view (run by the host). They chase crates, ram rivals, hit the ramps,
// hop over trouble, use their gadgets and get themselves unstuck.
import { LAYOUT } from './layout.js';

const NAMES = ['Grease Gremlin', 'Rusty Nail', 'Mud Muffin', 'Sir Skids', 'Lamp Lad', 'Boulder Bob', 'Wheelie Wendy', 'Torque Toad'];
export function botName(i) { return NAMES[i % NAMES.length]; }

export class BotBrain {
  constructor(car, sandbox, game) {
    this.car = car;
    this.sandbox = sandbox;
    this.game = game;
    this.target = null;
    this.retarget = 0;
    this.stuckT = 0;
    this.backT = 0;
    this.gadgetT = 2 + Math.random() * 3;
    this.mood = Math.random(); // some love ramming, others love ramps
  }

  pickTarget() {
    const c = this.car, x = c.body.p[0], S = this.sandbox;
    const o = [];
    const w = (tx, base) => base / (6 + Math.abs(tx - x));
    if (!c.gadget) for (const C of S.crates) if (C.alive) o.push({ x: C.x, w: w(C.x, 30), kind: 'crate' });
    for (const k of this.game.cars()) if (k !== c && !k.wrecked) o.push({ car: k, w: w(k.body.p[0], 16 + this.mood * 22), kind: 'ram' });
    for (const B of S.barrels) if (B.alive && Math.random() < 0.3) o.push({ x: B.body.p[0], w: w(B.body.p[0], 6), kind: 'barrel' });
    for (const r of LAYOUT.ramps) o.push({ x: r.x + r.dir * 10, ramp: r, w: w(r.x, 5 + (1 - this.mood) * 10), kind: 'ramp' });
    if (S.ball.alive) o.push({ x: S.ball.body.p[0], w: w(S.ball.body.p[0], 9), kind: 'ball' });
    o.push({ x: LAYOUT.bowl.x + (Math.random() - 0.5) * 20, w: 2, kind: 'bowl' });
    let sum = 0;
    for (const t of o) sum += t.w;
    let r = Math.random() * sum;
    for (const t of o) { r -= t.w; if (r <= 0) return t; }
    return o[0];
  }

  update(dt) {
    const c = this.car, inp = c.input, b = c.body;
    if (c.wrecked) { inp.dir = 0; inp.boost = false; return; }
    this.retarget -= dt;
    if (!this.target || this.retarget <= 0 || (this.target.car && this.target.car.wrecked)) { this.target = this.pickTarget(); this.retarget = 3 + Math.random() * 5; }
    const T = this.target;
    let tx = T.car ? T.car.body.p[0] + T.car.body.v[0] * 0.3 : T.x;
    if (T.ramp) tx = T.ramp.x + T.ramp.dir * 12; // run through the ramp, not to it
    const dx = tx - b.p[0];
    let dir = Math.abs(dx) < 1.2 ? 0 : Math.sign(dx);
    if (T.ramp && Math.abs(dx) < 2) this.retarget = 0;
    // unstick: back off and hop
    if (Math.abs(b.v[0]) < 1.2 && dir !== 0 && c.grounded) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 1.0) { this.stuckT = 0; this.backT = 0.7; inp.hop = true; }
    if (this.backT > 0) { this.backT -= dt; dir = -c.facing; }
    // in the air: keep the nose level
    if (!c.grounded) { const a = Math.atan2(Math.sin(b.a), Math.cos(b.a)); dir = Math.abs(a) > 0.25 ? Math.sign(a) : 0; }
    inp.dir = dir;
    inp.boost = (T.kind === 'ram' || !!T.ramp) && Math.abs(dx) < 25 && Math.abs(dx) > 3 && c.grounded > 0;
    // hop at rivals
    if (T.kind === 'ram' && Math.abs(dx) < 3 && Math.random() < dt * 1.5) inp.hop = true;
    this.gadgetT -= dt;
    if (c.gadget && this.gadgetT <= 0) {
      const near = this.game.cars().some((o) => o !== c && !o.wrecked && Math.abs(o.body.p[0] - b.p[0]) < 9);
      if (near || c.gadget === 'hop') { this.game.useGadget(c); this.gadgetT = 1.5 + Math.random() * 3; }
    }
    if (Math.random() < dt * 0.12) this.game.honk(c);
  }
}

// AI drivers for the side view (run by the host). They chase crates, ram rivals, take the ramps
// with a proper run-up, boost up the bowl and the hills, use their gadgets and get themselves
// unstuck. There is only one lane, so a bot never parks: reaching a spot means picking the next.
import { LAYOUT } from './layout.js';

const NAMES = ['Grease Gremlin', 'Rusty Nail', 'Mud Muffin', 'Sir Skids', 'Lamp Lad', 'Boulder Bob', 'Wheelie Wendy', 'Torque Toad'];
export function botName(i) { return NAMES[i % NAMES.length]; }
const EDGE = LAYOUT.halfW - 32; // bots stay off the rock-slide hills unless something lures them

export class BotBrain {
  constructor(car, sandbox, game) {
    this.car = car;
    this.sandbox = sandbox;
    this.game = game;
    this.target = null;
    this.retarget = 0;
    this.stuckT = 0;
    this.stuckN = 0;
    this.backT = 0;
    this.gadgetT = 2 + Math.random() * 3;
    this.mood = Math.random(); // some love ramming, others love ramps
  }

  pickTarget() {
    const c = this.car, x = c.body.p[0], S = this.sandbox;
    const o = [];
    const w = (tx, base) => base / (6 + Math.abs(tx - x));
    if (!c.gadget) for (const C of S.crates) if (C.alive && Math.abs(C.x) < EDGE + 8) o.push({ x: C.x, w: w(C.x, 30), kind: 'crate' });
    for (const k of this.game.cars()) if (k !== c && !k.wrecked) o.push({ car: k, w: w(k.body.p[0], 16 + this.mood * 22), kind: 'ram' });
    // barrels and the cage-ball are things to charge through, not to visit
    for (const B of S.barrels) if (B.alive && Math.random() < 0.25) o.push({ x: B.body.p[0], through: 7, w: w(B.body.p[0], 5), kind: 'barrel' });
    if (S.ball.alive) o.push({ x: S.ball.body.p[0], through: 6, w: w(S.ball.body.p[0], 9), kind: 'ball' });
    for (const r of LAYOUT.ramps) o.push({ ramp: r, x: r.x, w: w(r.x, 5 + (1 - this.mood) * 10), kind: 'ramp' });
    o.push({ x: LAYOUT.bowl.x + (Math.random() - 0.5) * 16, w: 2, kind: 'bowl' });
    o.push({ x: (Math.random() - 0.5) * 2 * EDGE, w: 1.5, kind: 'roam' });
    let sum = 0;
    for (const t of o) sum += t.w;
    let r = Math.random() * sum;
    for (const t of o) { r -= t.w; if (r <= 0) return t; }
    return o[0];
  }

  update(dt) {
    const c = this.car, inp = c.input, b = c.body, x = b.p[0];
    if (c.wrecked) { inp.dir = 0; inp.boost = false; this.target = null; this.stuckT = 0; return; }
    this.retarget -= dt;
    if (!this.target || this.retarget <= 0 || (this.target.car && this.target.car.wrecked)) { this.target = this.pickTarget(); this.retarget = 4 + Math.random() * 5; }
    const T = this.target;
    // where to drive
    let tx, charge = false;
    if (T.car) { tx = T.car.body.p[0] + T.car.body.v[0] * 0.3; charge = Math.abs(tx - x) < 25; }
    else if (T.ramp) {
      const r = T.ramp, s = (x - r.x) * r.dir; // < 0 on the run-up side
      if (!T.go && s > -r.len - 3) tx = r.x - r.dir * (r.len + 7); // wrong side or too close: back to the start of the run-up
      else { T.go = true; tx = r.x + r.dir * 14; charge = true; } // then flat out over the lip
    } else if (T.through) { if (!T.side) T.side = Math.sign(T.x - x) || 1; tx = T.x + T.side * T.through; charge = Math.abs(T.x - x) < 12; }
    else tx = T.x;
    tx = Math.max(-LAYOUT.halfW + 4, Math.min(LAYOUT.halfW - 4, tx));
    const dx = tx - x;
    let dir = Math.sign(dx);
    if (Math.abs(dx) < 1.5) { // arrived: never park
      if (T.car) dir = c.facing; // drive on through the rival
      else if (T.ramp && !T.go) T.go = true;
      else this.retarget = 0;
    }
    // stuck against something: lean on it (trees give way), then hop, then back off for a run-up
    if (Math.abs(b.v[0]) < 1.2 && dir !== 0 && (c.grounded || b.grounded > 0)) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 1.3) {
      this.stuckT = 0;
      this.stuckN++;
      if (this.stuckN % 2) inp.hop = true; else { this.backT = 0.9; this.backDir = -dir; }
      if (this.stuckN > 3) { this.retarget = 0; this.stuckN = 0; }
    }
    if (Math.abs(b.v[0]) > 6) this.stuckN = 0;
    if (this.backT > 0) { this.backT -= dt; dir = this.backDir; }
    // in the air the buggy steadies itself; only spin when it is already upside down
    if (!c.grounded && !c.wet && !(b.grounded > 0)) { const a = Math.atan2(Math.sin(b.a), Math.cos(b.a)); if (Math.abs(a) > 1.5) dir = -c.facing; else if (dir === -c.facing) dir = 0; }
    inp.dir = dir;
    // boost: to ram, to fly, and to get up anything steep
    const climbing = c.terrain.slope(x) * dir > 0.4;
    inp.boost = (c.grounded > 0 || c.wet) && dir === c.facing && c.boost > 0.15 && (climbing || (charge && Math.abs(dx) > 3));
    // hop at rivals
    if (T.car && Math.abs(dx) < 3 && Math.random() < dt * 1.5) inp.hop = true;
    this.gadgetT -= dt;
    if (c.gadget && this.gadgetT <= 0) {
      const near = this.game.cars().some((o) => o !== c && !o.wrecked && Math.abs(o.body.p[0] - x) < 9);
      if (near || c.gadget === 'hop') { this.game.useGadget(c); this.gadgetT = 1.5 + Math.random() * 3; }
    }
    if (Math.random() < dt * 0.12) this.game.honk(c);
  }
}

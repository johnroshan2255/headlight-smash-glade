// AI drivers that fill the empty seats (run by the host). They chase crates, ram rivals,
// launch off ramps, use their gadgets and get themselves unstuck.
import { LAYOUT } from './layout.js';
import { V } from './physics.js';

const _fw = [0, 0, 0];
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
    this.reverseT = 0;
    this.gadgetT = 2 + Math.random() * 3;
    this.mood = Math.random(); // some bots love ramming, others love ramps
  }

  pickTarget() {
    const c = this.car, p = c.body.p, S = this.sandbox;
    const dist = (x, z) => Math.hypot(p[0] - x, p[2] - z);
    const options = [];
    if (!c.gadget) for (const C of S.crates) if (C.alive) options.push({ x: C.x, z: C.z, w: 30 / (5 + dist(C.x, C.z)), kind: 'crate' });
    for (const o of this.game.cars()) if (o !== c && !o.wrecked) options.push({ car: o, w: (14 + this.mood * 20) / (8 + dist(o.body.p[0], o.body.p[2])), kind: 'ram' });
    for (const B of S.barrels) if (B.alive && Math.random() < 0.2) options.push({ x: B.body.p[0], z: B.body.p[2], w: 6 / (10 + dist(B.body.p[0], B.body.p[2])), kind: 'barrel' });
    for (const r of LAYOUT.ramps) options.push({ x: r.x - Math.cos(r.dir) * 10, z: r.z - Math.sin(r.dir) * 10, ramp: r, w: (4 + (1 - this.mood) * 10) / (10 + dist(r.x, r.z)), kind: 'ramp' });
    if (S.ball.alive) options.push({ x: S.ball.body.p[0], z: S.ball.body.p[2], w: 10 / (8 + dist(S.ball.body.p[0], S.ball.body.p[2])), kind: 'ball' });
    let sum = 0;
    for (const o of options) sum += o.w;
    let r = Math.random() * sum;
    for (const o of options) { r -= o.w; if (r <= 0) return o; }
    return options[0];
  }

  update(dt) {
    const c = this.car, inp = c.input, b = c.body;
    if (c.wrecked) { inp.throttle = 0; inp.steer = 0; inp.boost = false; return; }
    this.retarget -= dt;
    if (!this.target || this.retarget <= 0 || (this.target.car && this.target.car.wrecked)) { this.target = this.pickTarget(); this.retarget = 4 + Math.random() * 5; }
    const T = this.target;
    let tx = T.car ? T.car.body.p[0] + T.car.body.v[0] * 0.4 : T.x, tz = T.car ? T.car.body.p[2] + T.car.body.v[2] * 0.4 : T.z;
    // ramp runs: line up behind the ramp, then go through it
    if (T.ramp && Math.hypot(b.p[0] - tx, b.p[2] - tz) < 4) { T.x = T.ramp.x + Math.cos(T.ramp.dir) * (T.ramp.len + 8); T.z = T.ramp.z + Math.sin(T.ramp.dir) * (T.ramp.len + 8); T.ramp = null; T.go = true; }
    b.axis(2, _fw);
    const want = Math.atan2(tx - b.p[0], tz - b.p[2]);
    const have = Math.atan2(_fw[0], _fw[2]);
    let d = want - have;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    // whiskers: steer around trees and rocks a few metres ahead
    const ahead = 5 + c.speed * 0.35;
    const ax = b.p[0] + _fw[0] * ahead, az = b.p[2] + _fw[2] * ahead;
    const list = this.game.world.statics.query(ax, az);
    if (list) for (const o of list) if (!o.off && Math.hypot(ax - o.x, az - o.z) < o.r + 1.6) { const side = (o.x - b.p[0]) * _fw[2] - (o.z - b.p[2]) * _fw[0]; d += side > 0 ? 0.9 : -0.9; }
    // stay inside the glade
    if (Math.hypot(b.p[0], b.p[2]) > LAYOUT.playRadius - 12) d = Math.atan2(Math.sin(Math.atan2(-b.p[0], -b.p[2]) - have), Math.cos(Math.atan2(-b.p[0], -b.p[2]) - have));
    inp.steer = Math.max(-1, Math.min(1, d * 1.8));
    inp.throttle = Math.abs(d) > 1.6 ? 0.4 : 1;
    inp.brake = Math.abs(d) > 1.1 && c.speed > 10;
    inp.boost = (T.go || T.kind === 'ram') && Math.abs(d) < 0.25 && c.speed > 6;
    // unstick: reverse out for a moment
    if (c.speed < 2.5 && inp.throttle > 0 && this.reverseT <= 0) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 0.5);
    if (this.stuckT > 1.1) { this.reverseT = 1.3; this.stuckT = 0; this.stuckCount = (this.stuckCount || 0) + 1; if (this.stuckCount > 3) { inp.reset = true; this.stuckCount = 0; } this.target = null; }
    if (c.speed > 8) this.stuckCount = 0;
    if (this.reverseT > 0) { this.reverseT -= dt; inp.throttle = -1; inp.steer = -inp.steer; inp.boost = false; }
    // gadgets
    this.gadgetT -= dt;
    if (c.gadget && this.gadgetT <= 0) {
      const near = this.game.cars().some((o) => o !== c && !o.wrecked && Math.hypot(o.body.p[0] - b.p[0], o.body.p[2] - b.p[2]) < 10);
      if (near || c.gadget === 'hop') { this.game.useGadget(c); this.gadgetT = 1.5 + Math.random() * 3; }
    }
    if (Math.random() < dt * 0.15) this.game.honk(c);
  }
}

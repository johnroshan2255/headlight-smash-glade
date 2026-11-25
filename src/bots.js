// AI drivers for the side view (run by the host). They chase crates, ram rivals, take the ramps
// with a proper run-up, boost up the bowl and the hills, use their gadgets and get themselves
// unstuck. There is only one lane, so a bot never parks: reaching a spot means picking the next.

const NAMES = ['Grease Gremlin', 'Rusty Nail', 'Mud Muffin', 'Sir Skids', 'Lamp Lad', 'Boulder Bob', 'Wheelie Wendy', 'Torque Toad'];
export function botName(i) { return NAMES[i % NAMES.length]; }
const LEASH = 70; // bots roam within this of the nearest human, so the action stays together

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

  /** the human this bot hangs around (nearest one), or null in an empty glade */
  anchor() {
    let best = null, bd = Infinity;
    for (const k of this.game.cars()) {
      if (k.isBot || String(k.id).startsWith('bot') || k.wrecked) continue;
      const dd = Math.abs(k.body.p[0] - this.car.body.p[0]);
      if (dd < bd) { bd = dd; best = k; }
    }
    return best;
  }

  pickTarget() {
    const c = this.car, x = c.body.p[0], S = this.sandbox;
    const H = this.anchor(), hx = H ? H.body.p[0] : x;
    const near = (tx) => Math.abs(tx - hx) < LEASH;
    const o = [];
    const w = (tx, base) => base / (6 + Math.abs(tx - x));
    if (!c.gadget) for (const C of S.crates.values()) if (C.alive && near(C.x)) o.push({ x: C.x, w: w(C.x, 30), kind: 'crate' });
    for (const k of this.game.cars()) if (k !== c && !k.wrecked && !k.inSmoke && near(k.body.p[0])) o.push({ car: k, w: w(k.body.p[0], 16 + this.mood * 22) * (k === H ? 1.6 : 1), kind: 'ram' });
    // barrels and cage-balls are things to charge through, not to visit
    for (const B of S.barrels) if (B.alive && near(B.body.p[0]) && Math.random() < 0.25) o.push({ x: B.body.p[0], through: 7, w: w(B.body.p[0], 5), kind: 'barrel' });
    for (const P of S.balls) if (P.alive && near(P.body.p[0])) o.push({ x: P.body.p[0], through: 6, w: w(P.body.p[0], 9), kind: 'ball' });
    for (const r of S.ramps) if (near(r.x)) o.push({ ramp: r, x: r.x, w: w(r.x, 5 + (1 - this.mood) * 10), kind: 'ramp' });
    for (const B of S.bowls) if (near(B.x)) o.push({ x: B.x + (Math.random() - 0.5) * 16, w: 2, kind: 'bowl' });
    o.push({ x: hx + (Math.random() - 0.5) * 2 * LEASH * 0.7, w: 1.5, kind: 'roam' });
    let sum = 0;
    for (const t of o) sum += t.w;
    let r = Math.random() * sum;
    for (const t of o) { r -= t.w; if (r <= 0) return t; }
    return o[0];
  }

  update(dt) {
    const c = this.car, inp = c.input, b = c.body, x = b.p[0];
    if (c.wrecked) { inp.dir = 0; inp.boost = false; this.target = null; this.stuckT = 0; return; }
    // fallen far behind the humans: drop back in near them
    this.leashT = (this.leashT || 0) - dt;
    if (this.leashT <= 0) {
      this.leashT = 1;
      const H = this.anchor();
      if (H && Math.abs(H.body.p[0] - x) > 160 && this.game.respawnNear) { this.game.respawnNear(c, H.body.p[0]); this.target = null; return; }
    }
    this.retarget -= dt;
    if (!this.target || this.retarget <= 0 || (this.target.car && (this.target.car.wrecked || this.target.car.inSmoke))) { this.target = this.pickTarget(); this.retarget = 4 + Math.random() * 5; }
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
    // garage gadgets: punch, swing, throw and burn at rivals close by; balloons and seats for fun
    this.modT = (this.modT || 1) - dt;
    if (this.modT <= 0) {
      this.modT = 0.4 + Math.random() * 0.8;
      const rival = this.game.cars().find((o) => o !== c && !o.wrecked && Math.abs(o.body.p[0] - x) < 7 && Math.abs(o.body.p[1] - b.p[1]) < 3);
      const roof = c.setup.roof, bumper = c.setup.bumper;
      if (rival && ['ball', 'magnet', 'mortar'].includes(roof) && Math.random() < 0.5) this.game.fireRoof(c);
      if (roof === 'hands' && c.roofG) { if (c.roofG.held) { if ((this.holdT = (this.holdT || 0) + this.modT) > 1.2) { this.game.fireRoof(c); this.holdT = 0; } } else if (rival || Math.random() < 0.1) this.game.fireRoof(c); }
      if (roof === 'arm' && c.roofG && c.roofG.held && (rival || Math.random() < 0.15)) this.game.fireRoof(c);
      if (roof === 'balloon' && !c.grounded && b.v[1] < -4 && Math.random() < 0.5) this.game.fireRoof(c);
      if (rival && ['glove', 'flame'].includes(bumper) && Math.sign(rival.body.p[0] - x) === c.facing) this.game.fireBumper(c);
      if (bumper === 'harpoon' && Math.random() < 0.12) this.game.fireBumper(c);
      // smoke and oil go out the back: drop them on whoever is chasing
      if (rival && ['smoke', 'oil'].includes(bumper) && Math.sign(rival.body.p[0] - x) !== c.facing && Math.random() < 0.4) this.game.fireBumper(c);
      if (bumper === 'eject' && c.hp < 30 && Math.random() < 0.3) this.game.fireBumper(c);
    }
    this.gadgetT -= dt;
    if (c.gadget && this.gadgetT <= 0) {
      const near = this.game.cars().some((o) => o !== c && !o.wrecked && Math.abs(o.body.p[0] - x) < 9);
      if (near || c.gadget === 'hop') { this.game.useGadget(c); this.gadgetT = 1.5 + Math.random() * 3; }
    }
    if (Math.random() < dt * 0.12) this.game.honk(c);
  }
}

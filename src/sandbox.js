// The toys of the glade and who owns them.
// The host simulates every prop (dynamic bodies) and broadcasts what moved; everyone else sees
// kinematic copies they can collide with, and sends "I hit this" impulses back to the host.
import * as pc from 'playcanvas';
import { CLS, worldMaterial } from './shaders.js';
import { MeshBuilder, rgba, addTube, addLathe, addSphere, addBox, deadTreeMesh, rockMesh } from './meshes.js';
import { Body, qrot, qFromAxisAngle } from './physics.js';
import { LAYOUT, RESPAWN_SECONDS, GADGET_KEYS } from './layout.js';
import { hatMesh } from './hats.js';
import { mulberry32 } from './noise.js';

const r2 = (v) => Math.round(v * 100) / 100;

function barrelMesh(device) {
  const mb = new MeshBuilder();
  addLathe(mb, [[0.0, -0.45], [0.36, -0.45], [0.42, -0.2], [0.43, 0.0], [0.42, 0.2], [0.36, 0.45], [0.0, 0.45]], { seg: 12, colFn: (t) => (Math.abs(t - 0.5) < 0.08 ? rgba(1.0, 0.6, 0.2, CLS.GLOW) : rgba(0.22, 0.13, 0.08, CLS.STONE)) });
  for (const y of [-0.3, 0.3]) addLathe(mb, [[0.43, y - 0.03], [0.445, y], [0.43, y + 0.03]], { seg: 12, colFn: () => rgba(0.12, 0.1, 0.09, CLS.STONE) });
  return mb.build(device);
}
function logMesh(device) {
  const mb = new MeshBuilder();
  addTube(mb, [[-2.5, 0, 0, 0.34], [-1, 0.02, 0.03, 0.36], [1, -0.02, -0.02, 0.35], [2.5, 0, 0, 0.3]], { seg: 8, capStart: true, colFn: () => rgba(0.07, 0.06, 0.05, CLS.FOLIAGE) });
  return mb.build(device);
}
function stumpMesh(device) {
  const mb = new MeshBuilder();
  addLathe(mb, [[0.55, -0.2], [0.42, 0.2], [0.34, 0.7], [0.28, 0.95], [0.0, 1.0]], { seg: 8, colFn: () => rgba(0.07, 0.06, 0.05, CLS.FOLIAGE) });
  return mb.build(device);
}
function cageMesh(device) {
  const mb = new MeshBuilder();
  const R = 1.7;
  for (let k = 0; k < 4; k++) { // meridians
    const pts = [];
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2, b = (k / 4) * Math.PI; pts.push([Math.cos(a) * R * Math.cos(b), Math.sin(a) * R, Math.cos(a) * R * Math.sin(b), 0.07]); }
    addTube(mb, pts, { seg: 4, subdiv: 1, capEnd: false, colFn: () => rgba(0.2, 0.2, 0.21, CLS.STONE) });
  }
  for (const y of [-0.9, 0, 0.9]) {
    const rr = Math.sqrt(R * R - y * y), pts = [];
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; pts.push([Math.cos(a) * rr, y, Math.sin(a) * rr, 0.07]); }
    addTube(mb, pts, { seg: 4, subdiv: 1, capEnd: false, colFn: () => rgba(0.2, 0.2, 0.21, CLS.STONE) });
  }
  return mb.build(device);
}
function emberSwarmMesh(device) {
  const mb = new MeshBuilder();
  const rng = mulberry32(3);
  for (let i = 0; i < 14; i++) addSphere(mb, { x: (rng() - 0.5) * 2, y: (rng() - 0.5) * 2, z: (rng() - 0.5) * 2, r: 0.08 + rng() * 0.06, segW: 4, segH: 2, colFn: () => rgba(1.0, 0.65, 0.25, CLS.GLOW) });
  return mb.build(device);
}
function crateMesh(device) {
  const mb = new MeshBuilder();
  addBox(mb, { sx: 1.1, sy: 1.1, sz: 1.1, col: rgba(0.3, 0.2, 0.1, CLS.GROUND) });
  for (const [x, y, z, sx, sy, sz] of [[0, 0.56, 0, 1.16, 0.06, 1.16], [0, -0.56, 0, 1.16, 0.06, 1.16], [0.56, 0, 0.56, 0.06, 1.16, 0.06], [-0.56, 0, 0.56, 0.06, 1.16, 0.06], [0.56, 0, -0.56, 0.06, 1.16, 0.06], [-0.56, 0, -0.56, 0.06, 1.16, 0.06]]) addBox(mb, { x, y, z, sx, sy, sz, col: rgba(1.0, 0.62, 0.22, CLS.GLOW) });
  return mb.build(device);
}
function mineMesh(device) {
  const mb = new MeshBuilder();
  addLathe(mb, [[0.0, -0.25], [0.24, -0.22], [0.28, 0.0], [0.24, 0.22], [0.0, 0.25]], { seg: 10, colFn: () => rgba(0.25, 0.16, 0.08, CLS.GROUND) });
  addSphere(mb, { y: 0.3, r: 0.08, segW: 5, segH: 3, colFn: () => rgba(1.0, 0.5, 0.2, CLS.GLOW) });
  return mb.build(device);
}

export class Sandbox {
  constructor({ app, layers, world, physics, fx, net, hooks }) {
    this.app = app;
    this.world = world;
    this.physics = physics;
    this.fx = fx;
    this.net = net;
    this.hooks = hooks; // { boom(msg), grant(msg), carById(id), cars() }
    this.layers = layers;
    const device = app.graphicsDevice;
    this.mats = { prop: worldMaterial({}), barrel: worldMaterial({ emissive: 0.35 }), glow: worldMaterial({ emissive: 1.6 }), tree: worldMaterial({ sway: 0.2 }) };
    this.meshes = { barrel: barrelMesh(device), log: logMesh(device), stump: stumpMesh(device), tree: deadTreeMesh(device, 13), rock: rockMesh(device, 9), cage: cageMesh(device), swarm: emberSwarmMesh(device), crate: crateMesh(device), mine: mineMesh(device) };
    this.time = 0;
    this.snapT = 0;
    this.fullT = 0;
    this.sentHit = new Map();
    this.buildBarrels();
    this.buildTrees();
    this.buildRocks();
    this.buildBall();
    this.buildCrates();
    this.geysers = LAYOUT.geysers.map(([x, z], i) => ({ i, x, z, phase: 0, t: 2 + i * 1.3 })); // 0 idle, 1 bubbling, 2 blast
    this.mines = [];
    this.mineId = 1;
    this.logs = [];
    this.buildHats();
  }

  get isHost() { return this.net.isHost; }

  ent(mesh, mat, name) {
    const e = new pc.Entity(name);
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], layers: [this.layers.world.id, this.layers.reflect.id], castShadows: false, receiveShadows: false });
    this.app.root.addChild(e);
    return e;
  }

  propBody(opts) {
    const b = new Body(opts);
    this.physics.add(b);
    b.kinematic = !this.isHost;
    return b;
  }

  // ------------------------------------------------------------------ builders
  buildBarrels() {
    this.barrels = [];
    let id = 0;
    for (const [cx, cz, n] of LAYOUT.barrels) {
      for (let k = 0; k < n; k++) {
        // a little pyramid: bottom row, then one on top
        const row = k < Math.ceil(n / 2) ? 0 : 1;
        const a = k * 2.1;
        const x = cx + Math.cos(a) * (row ? 0.3 : 0.55), z = cz + Math.sin(a) * (row ? 0.3 : 0.55);
        const y = this.world.groundAt(x, z) + 0.46 + row * 0.92;
        const body = this.propBody({ mass: 30, spheres: [[0, 0, 0, 0.44]], restitution: 0.3, friction: 0.6, kind: 'barrel', angDamp: 0.4 });
        body.set(x, y, z);
        const B = { id: id++, home: [x, y, z], body, ent: this.ent(this.meshes.barrel, this.mats.barrel, 'barrel'), alive: true, respawn: 0, fuse: -1, by: null, tp: [x, y, z], tq: [0, 0, 0, 1] };
        body.prop = B;
        body.onContact = (other, sp) => this.onPropContact(B, 'barrel', other, sp);
        this.barrels.push(B);
      }
    }
  }

  buildTrees() {
    const f = LAYOUT.snapForest;
    const rng = mulberry32(2024);
    this.trees = [];
    for (let i = 0; i < f.count; i++) {
      const x = f.x0 + rng() * (f.x1 - f.x0), z = f.z0 + rng() * (f.z1 - f.z0);
      if (this.trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3.2)) continue;
      const s = 0.9 + rng() * 0.5, y = this.world.groundAt(x, z) - 0.1, rot = rng() * 360;
      const ent = this.ent(this.meshes.tree, this.mats.tree, 'snapTree');
      ent.setPosition(x, y, z); ent.setEulerAngles(0, rot, 0); ent.setLocalScale(s, s, s);
      const stump = this.ent(this.meshes.stump, this.mats.prop, 'stump');
      stump.setPosition(x, y, z); stump.setLocalScale(s, s, s); stump.enabled = false;
      const T = { i: this.trees.length, x, z, s, ent, stump, snapped: false, respawn: 0 };
      T.obstacle = this.world.statics.add({ x, z, r: 0.32 * s, top: 99, kind: 'snaptree', breakable: (body) => this.tryBreakTree(T, body) });
      this.trees.push(T);
    }
  }

  buildRocks() {
    this.piles = LAYOUT.rockPiles.map((P, pi) => {
      const rocks = [];
      const rng = mulberry32(77 + pi);
      for (let k = 0; k < 6; k++) {
        const s = 0.8 + rng() * 0.6;
        const x = P.x + (rng() - 0.5) * 2.4, z = P.z + (rng() - 0.5) * 2.4;
        const y = this.world.groundAt(x, z) + 0.5 * s + (k > 3 ? 0.9 : 0);
        const body = this.propBody({ mass: 140 * s, spheres: [[0, 0, 0, 0.62 * s]], restitution: 0.15, friction: 0.9, kind: 'rock', angDamp: 0.3 });
        body.set(x, y, z);
        body.asleep = true;
        body.kinematic = true; // piles sit still until something hits them hard
        const R = { home: [x, y, z], s, body, ent: this.ent(this.meshes.rock, this.mats.prop, 'boulder'), tp: [x, y, z], tq: [0, 0, 0, 1] };
        R.ent.setLocalScale(s, s * 0.9, s);
        body.prop = R;
        body.onContact = (other, sp) => this.onPropContact(R, 'rock', other, sp);
        rocks.push(R);
      }
      return { ...P, rocks, released: false, respawn: 0 };
    });
  }

  buildBall() {
    const { x, z } = LAYOUT.cageBall;
    const body = this.propBody({ mass: 70, spheres: [[0, 0, 0, 1.7]], restitution: 0.75, friction: 0.4, kind: 'ball', angDamp: 0.15, buoyant: 2 });
    body.set(x, this.world.groundAt(x, z) + 1.8, z);
    this.ball = { body, ent: this.ent(this.meshes.cage, this.mats.prop, 'cageBall'), swarm: this.ent(this.meshes.swarm, this.mats.glow, 'swarm'), hits: 0, alive: true, respawn: 0, lastHit: 0, tp: [x, 0, z], tq: [0, 0, 0, 1], by: null };
    body.prop = this.ball;
    body.onContact = (other, sp) => this.onPropContact(this.ball, 'ball', other, sp);
  }

  buildCrates() {
    this.crates = LAYOUT.crates.map(([x, z], i) => {
      const e = this.ent(this.meshes.crate, this.mats.glow, 'crate');
      return { i, x, z, y: this.world.groundAt(x, z) + 0.9, ent: e, alive: true, respawn: 0, asked: 0 };
    });
  }

  buildHats() {
    let owned = [];
    try { owned = JSON.parse(localStorage.getItem('hsg.hats') || '[]'); } catch { /* */ }
    this.ownedHats = new Set(owned);
    this.hats = LAYOUT.hats.map((h) => {
      let { x, y, z } = h;
      if (h.id === 'crown') { // on top of the tallest unbroken shrine pillar
        const p = this.world.pillars.filter((q) => !q.broken).sort((a, b) => b.top - a.top)[0];
        if (p) { x = p.x; z = p.z; y = p.top + 0.9; }
      } else y = this.world.groundAt(x, z) + h.y;
      const e = this.ent(hatMesh(this.app.graphicsDevice, h.id), this.mats.glow, 'hatPickup');
      e.setLocalScale(1.6, 1.6, 1.6);
      e.enabled = !this.ownedHats.has(h.id);
      return { id: h.id, x, y, z, ent: e };
    });
  }

  // ------------------------------------------------------------------ interactions
  onPropContact(P, kind, other, sp) {
    const car = other.car;
    if (!car) {
      if (kind === 'barrel' && sp > 9 && this.isHost && P.alive) this.light(P, null);
      return;
    }
    if (this.isHost) {
      if (kind === 'barrel' && sp > 5.5) this.light(P, car.id);
      if (kind === 'ball' && sp > 5 && this.time - P.lastHit > 0.25) {
        P.lastHit = this.time; P.hits++; P.by = car.id;
        // pinball kick
        const b = P.body;
        b.v[0] += car.body.v[0] * 0.6; b.v[2] += car.body.v[2] * 0.6; b.v[1] += 5;
        this.fx.sparkBurst(b.p[0], b.p[1], b.p[2], 14, 8);
        if (P.hits >= 5) this.blowBall();
      }
      if (kind === 'rock') this.releasePileOf(P, sp);
    } else if (car.local) {
      // tell the host what we hit (throttled per prop)
      const key = `${kind}${P.id ?? 0}${P.home ? P.home[0] : ''}`;
      if (this.time - (this.sentHit.get(key) || 0) < 0.2) return;
      this.sentHit.set(key, this.time);
      const idx = kind === 'barrel' ? P.id : kind === 'rock' ? this.rockIndex(P) : 0;
      this.net.send('hitProp', { kind, id: idx, sp: r2(sp), v: car.body.v.map(r2) });
    }
  }

  rockIndex(R) { let n = 0; for (const p of this.piles) for (const r of p.rocks) { if (r === R) return n; n++; } return -1; }
  rockAt(n) { for (const p of this.piles) for (const r of p.rocks) { if (n-- === 0) return [p, r]; } return [null, null]; }

  /** host: a remote player bumped something */
  onRemoteHit(msg) {
    if (!this.isHost) return;
    const by = msg.from;
    if (msg.kind === 'barrel') { const B = this.barrels[msg.id]; if (B && B.alive && msg.sp > 5.5) this.light(B, by); }
    if (msg.kind === 'ball' && this.ball.alive && this.time - this.ball.lastHit > 0.25) {
      const b = this.ball.body;
      b.v[0] += msg.v[0] * 0.7; b.v[2] += msg.v[2] * 0.7; b.v[1] += 5;
      if (msg.sp > 5) { this.ball.hits++; this.ball.lastHit = this.time; this.ball.by = by; if (this.ball.hits >= 5) this.blowBall(); }
    }
    if (msg.kind === 'rock') { const [, R] = this.rockAt(msg.id); if (R) { this.releasePileOf(R, msg.sp); R.body.v[0] += msg.v[0] * 0.5; R.body.v[2] += msg.v[2] * 0.5; } }
    if (msg.kind === 'log') { const L = this.logs.find((l) => l.id === msg.id); if (L) { L.body.v[0] += msg.v[0] * 0.5; L.body.v[2] += msg.v[2] * 0.5; L.body.v[1] += 2; } }
  }

  /** light a barrel's fuse (host) */
  light(B, by) {
    if (!B.alive || B.fuse >= 0) return;
    B.fuse = 0.06 + Math.random() * 0.12;
    B.by = by;
  }

  explodeBarrel(B) {
    B.alive = false;
    B.respawn = RESPAWN_SECONDS;
    B.body.enabled = false;
    const p = B.body.p;
    this.boom(p[0], p[1], p[2], 1, B.by);
  }

  blowBall() {
    const b = this.ball.body;
    this.ball.alive = false;
    this.ball.respawn = 5;
    b.enabled = false;
    this.boom(b.p[0], b.p[1], b.p[2], 1.8, this.ball.by);
  }

  /** host: an explosion. Everyone sees it; props react here; cars react on their owner's client. */
  boom(x, y, z, size, by) {
    const msg = { x: r2(x), y: r2(y), z: r2(z), s: size, by };
    this.net.send('boom', msg);
    this.hooks.boom(msg); // local FX + our own cars
    const R = 7.5 * size;
    this.physics.blast(x, y, z, R, 13 * size, (b) => !!b.prop && !b.car);
    for (const B of this.barrels) {
      if (!B.alive || B.fuse >= 0) continue;
      const d = Math.hypot(B.body.p[0] - x, B.body.p[1] - y, B.body.p[2] - z);
      if (d < 4.6 * size) this.light(B, by); // chain reaction
    }
    for (const M of this.mines) if (Math.hypot(M.body.p[0] - x, M.body.p[2] - z) < 4) M.t = Math.max(M.t, 99);
    for (const T of this.trees) if (!T.snapped && Math.hypot(T.x - x, T.z - z) < 3.5 * size) this.snapTree(T, [T.x - x, T.z - z], by);
    if (this.ball.alive && Math.hypot(this.ball.body.p[0] - x, this.ball.body.p[2] - z) < R) { this.ball.hits += 2; this.ball.by = by; if (this.ball.hits >= 5) setTimeout(() => this.ball.alive && this.blowBall(), 150); }
    for (const P of this.piles) if (!P.released && Math.hypot(P.x - x, P.z - z) < R + 2) this.releasePile(P);
  }

  tryBreakTree(T, body) {
    if (T.snapped) return true;
    const sp = Math.hypot(body.v[0], body.v[2]);
    const car = body.car;
    if (!car || sp < (car.boosting ? 6 : 9.5)) return false;
    const dir = [body.v[0], body.v[2]];
    if (this.isHost) this.snapTree(T, dir, car.id);
    else { this.net.send('snap', { i: T.i, dir: dir.map(r2) }); this.hideTree(T); }
    // the car keeps most of its speed: it smashes straight through
    body.v[0] *= 0.82; body.v[2] *= 0.82;
    return true;
  }

  hideTree(T) {
    T.snapped = true;
    T.respawn = RESPAWN_SECONDS;
    T.obstacle.off = true;
    T.ent.enabled = false;
    T.stump.enabled = true;
    this.fx.sparkBurst(T.x, this.world.groundAt(T.x, T.z) + 1.2, T.z, 6, 4);
    this.fx.dust(T.x, this.world.groundAt(T.x, T.z), T.z, 6);
    this.hooks.sound('crack', T);
  }

  /** host: snap a tree into a rolling log */
  snapTree(T, dir, by) {
    if (T.snapped && this.logs.some((l) => l.tree === T)) return;
    if (!T.snapped) this.hideTree(T);
    if (this.isHost) this.net.send('snapped', { i: T.i });
    const dl = Math.hypot(dir[0], dir[1]) || 1;
    const dx = dir[0] / dl, dz = dir[1] / dl;
    // the log falls across the direction of travel: perpendicular, so it rolls like a bowling pin
    const yaw = Math.atan2(dz, -dx);
    const body = this.propBody({ mass: 110, spheres: [[-2, 0, 0, 0.36], [0, 0, 0, 0.38], [2, 0, 0, 0.34]], inertia: [30, 160, 160], restitution: 0.2, friction: 0.5, kind: 'log', angDamp: 0.25 });
    body.set(T.x + dx * 1.5, this.world.groundAt(T.x, T.z) + 2.2, T.z + dz * 1.5);
    qFromAxisAngle(0, 1, 0, yaw, body.q);
    body.v[0] = dx * 6; body.v[2] = dz * 6; body.v[1] = 1;
    body.w[0] = dz * 3; body.w[2] = -dx * 3;
    const L = { id: this.mineId++, tree: T, body, ent: this.ent(this.meshes.log, this.mats.prop, 'log'), tp: [...body.p], tq: [...body.q] };
    L.ent.setLocalScale(T.s, T.s, T.s);
    body.prop = L;
    body.onContact = (other, sp) => { if (!this.isHost && other.car && other.car.local) this.net.send('hitProp', { kind: 'log', id: L.id, sp: r2(sp), v: other.car.body.v.map(r2) }); };
    this.logs.push(L);
  }

  releasePileOf(R, sp) {
    const P = this.piles.find((p) => p.rocks.includes(R));
    if (P && !P.released && sp > 6) this.releasePile(P);
  }

  releasePile(P) {
    P.released = true;
    P.respawn = RESPAWN_SECONDS;
    this.hooks.sound('rumble', P);
    for (const R of P.rocks) {
      R.body.kinematic = !this.isHost;
      if (this.isHost) {
        R.body.v[0] = Math.cos(P.dir) * (3 + Math.random() * 3);
        R.body.v[2] = Math.sin(P.dir) * (3 + Math.random() * 3);
        R.body.v[1] = 2 + Math.random() * 2;
      }
    }
  }

  /** a local car drives over the crates / hats / geysers */
  checkLocal(car, isBot) {
    if (car.wrecked) return;
    const p = car.body.p;
    for (const C of this.crates) {
      if (!C.alive || Math.hypot(p[0] - C.x, p[2] - C.z) > 2 || Math.abs(p[1] - C.y) > 3) continue;
      if (this.isHost) this.grant(C, car.id);
      else if (this.time - C.asked > 0.5) { C.asked = this.time; this.net.send('pickup', { i: C.i }); }
    }
    if (!isBot) {
      for (const H of this.hats) {
        if (!H.ent.enabled || Math.hypot(p[0] - H.x, p[1] - H.y, p[2] - H.z) > 2.4) continue;
        H.ent.enabled = false;
        this.ownedHats.add(H.id);
        try { localStorage.setItem('hsg.hats', JSON.stringify([...this.ownedHats])); } catch { /* */ }
        this.hooks.hat(H.id);
      }
    }
    for (const g of this.geysers) {
      if (g.phase === 0 || Math.hypot(p[0] - g.x, p[2] - g.z) > 2.4) continue;
      if (car.geyserT > this.time) continue;
      car.geyserT = this.time + 2;
      // a pressurised mud-and-steam blast: straight up, spinning
      const b = car.body;
      b.v[1] = 17; b.v[0] *= 0.5; b.v[2] *= 0.5;
      b.w[0] += (Math.random() - 0.5) * 5; b.w[2] += (Math.random() - 0.5) * 5;
      if (this.isHost) { g.phase = 2; g.t = 0.6; } else this.net.send('geyser', { i: g.i });
      this.fx.steam(g.x, 0, g.z, 26, 14);
      this.hooks.sound('geyser', g);
    }
  }

  /** host: hand out a gadget */
  grant(C, to) {
    if (!C.alive) return;
    C.alive = false;
    C.respawn = 15;
    const g = GADGET_KEYS[Math.floor(Math.random() * GADGET_KEYS.length)];
    const msg = { i: C.i, to, g };
    this.net.send('grant', msg);
    this.hooks.grant(msg);
  }

  onRemotePickup(msg) { if (this.isHost) { const C = this.crates[msg.i]; if (C) this.grant(C, msg.from); } }
  onGrant(msg) { const C = this.crates[msg.i]; if (C) { C.alive = false; C.respawn = 15; } }

  /** a mine dropped behind a car */
  dropMine(p, v, owner) {
    if (!this.isHost) { this.net.send('mine', { p: p.map(r2), v: v.map(r2) }); return; }
    const body = this.propBody({ mass: 15, spheres: [[0, 0, 0, 0.3]], restitution: 0.2, friction: 0.9, kind: 'mine', angDamp: 1 });
    body.set(p[0], p[1], p[2]);
    body.v[0] = v[0] * 0.3; body.v[1] = 2; body.v[2] = v[2] * 0.3;
    const M = { id: this.mineId++, body, owner, t: 0, ent: this.ent(this.meshes.mine, this.mats.glow, 'mine'), tp: [...p], tq: [0, 0, 0, 1] };
    body.prop = M;
    this.mines.push(M);
  }

  // ------------------------------------------------------------------ per frame
  update(dt, cars) {
    this.time += dt;
    const host = this.isHost;
    for (const b of this.allBodies()) {
      // kinematic on clients (and sleeping rock piles); dynamic on the host
      if (b.prop && b.prop.home && this.piles.some((p) => !p.released && p.rocks.includes(b.prop))) b.kinematic = true;
      else b.kinematic = !host;
    }
    if (host) {
      for (const B of this.barrels) {
        if (B.fuse >= 0 && B.alive) { B.fuse -= dt; if (B.fuse < 0) this.explodeBarrel(B); }
        if (!B.alive) { B.respawn -= dt; if (B.respawn <= 0) this.respawnBarrel(B); }
      }
      for (const T of this.trees) if (T.snapped) { T.respawn -= dt; if (T.respawn <= 0) this.respawnTree(T); }
      for (const P of this.piles) if (P.released) { P.respawn -= dt; if (P.respawn <= 0) this.respawnPile(P); }
      if (!this.ball.alive) { this.ball.respawn -= dt; if (this.ball.respawn <= 0) this.respawnBall(); }
      for (const C of this.crates) if (!C.alive) { C.respawn -= dt; if (C.respawn <= 0) C.alive = true; }
      // geyser cycles: idle -> bubbling -> blast
      for (const g of this.geysers) {
        g.t -= dt;
        if (g.t > 0) continue;
        if (g.phase === 0) { g.phase = 1; g.t = 2.6; }
        else if (g.phase === 1) { g.phase = 2; g.t = 0.7; this.fx.steam(g.x, 0, g.z, 30, 15); this.physics.blast(g.x, 0, g.z, 3, 14, (b) => !!b.prop); }
        else { g.phase = 0; g.t = 3 + Math.random() * 5; }
      }
      // rock piles slide if a fast car plows into them
      for (const P of this.piles) {
        if (P.released) continue;
        for (const c of cars) if (!c.wrecked && Math.hypot(c.body.p[0] - P.x, c.body.p[2] - P.z) < 3.6 && c.speed > 8) this.releasePile(P);
      }
      // mines: arm, then wait for a victim
      for (let i = this.mines.length - 1; i >= 0; i--) {
        const M = this.mines[i];
        M.t += dt;
        const armed = M.t > 1;
        let trip = M.t > 25 || M.t > 90;
        if (armed && !trip) for (const c of cars) if (!c.wrecked && (c.id !== M.owner || M.t > 2.5) && Math.hypot(c.body.p[0] - M.body.p[0], c.body.p[1] - M.body.p[1], c.body.p[2] - M.body.p[2]) < 1.9) trip = true;
        if (trip) { this.mines.splice(i, 1); this.physics.remove(M.body); M.ent.destroy(); this.boom(M.body.p[0], M.body.p[1], M.body.p[2], 1.1, M.owner); }
      }
      // logs belong to their tree: gone when it grows back
    } else {
      // smooth the host's snapshots
      const k = Math.min(1, dt * 14);
      for (const P of this.allProps()) {
        const b = P.body;
        if (!b || !P.tp) continue;
        for (let i = 0; i < 3; i++) b.p[i] += (P.tp[i] - b.p[i]) * k;
        let dot = 0; for (let i = 0; i < 4; i++) dot += b.q[i] * P.tq[i];
        const s = dot < 0 ? -1 : 1;
        for (let i = 0; i < 4; i++) b.q[i] += (P.tq[i] * s - b.q[i]) * k;
        const l = Math.hypot(b.q[0], b.q[1], b.q[2], b.q[3]) || 1;
        for (let i = 0; i < 4; i++) b.q[i] /= l;
      }
    }
    this.render(dt);
    // broadcast what moved
    if (host && this.net.online) {
      this.snapT -= dt; this.fullT -= dt;
      if (this.snapT <= 0) { this.snapT = 0.1; this.sendWorld(this.fullT <= 0); if (this.fullT <= 0) this.fullT = 2; }
    }
  }

  allProps() { return [...this.barrels, ...this.logs, ...this.piles.flatMap((p) => p.rocks), this.ball, ...this.mines]; }
  allBodies() { return this.allProps().map((p) => p.body).filter(Boolean); }

  render(dt) {
    const place = (P) => { const b = P.body; P.ent.setPosition(b.p[0], b.p[1], b.p[2]); P.ent.setRotation(b.q[0], b.q[1], b.q[2], b.q[3]); };
    for (const B of this.barrels) { B.ent.enabled = B.alive; if (B.alive) place(B); }
    for (const L of this.logs) place(L);
    for (const P of this.piles) for (const R of P.rocks) place(R);
    const ball = this.ball;
    ball.ent.enabled = ball.swarm.enabled = ball.alive;
    if (ball.alive) {
      place(ball);
      ball.swarm.setPosition(ball.body.p[0], ball.body.p[1], ball.body.p[2]);
      ball.swarm.setEulerAngles(this.time * 40, this.time * 70, 0);
      const s = 0.7 + ball.hits * 0.08 + Math.sin(this.time * (3 + ball.hits * 3)) * 0.06;
      ball.swarm.setLocalScale(s, s, s);
    }
    for (const C of this.crates) {
      C.ent.enabled = C.alive;
      if (C.alive) { C.ent.setPosition(C.x, C.y + Math.sin(this.time * 2 + C.i) * 0.18, C.z); C.ent.setEulerAngles(15, this.time * 70 + C.i * 30, 10); }
    }
    for (const M of this.mines) { place(M); M.ent.setLocalScale(1, 1, 1); }
    for (const H of this.hats) if (H.ent.enabled) { H.ent.setPosition(H.x, H.y + Math.sin(this.time * 2) * 0.2, H.z); H.ent.setEulerAngles(0, this.time * 90, 0); }
    for (const g of this.geysers) if (g.phase === 1 && Math.random() < dt * 8) this.fx.steam(g.x, 0, g.z, 1, 2);
  }

  respawnBarrel(B) {
    B.alive = true; B.fuse = -1; B.by = null;
    const b = B.body;
    b.set(B.home[0], B.home[1], B.home[2]); b.q = [0, 0, 0, 1]; b.v = [0, 0, 0]; b.w = [0, 0, 0]; b.enabled = true;
    B.tp = [...B.home]; B.tq = [0, 0, 0, 1];
  }
  respawnTree(T) {
    if (this.world.statics.query(T.x, T.z) && this.hooks.cars().some((c) => Math.hypot(c.body.p[0] - T.x, c.body.p[2] - T.z) < 2.5)) { T.respawn = 1; return; }
    T.snapped = false; T.obstacle.off = false; T.ent.enabled = true; T.stump.enabled = false;
    const L = this.logs.findIndex((l) => l.tree === T);
    if (L >= 0) { this.physics.remove(this.logs[L].body); this.logs[L].ent.destroy(); this.logs.splice(L, 1); }
  }
  respawnPile(P) {
    P.released = false;
    for (const R of P.rocks) { const b = R.body; b.set(...R.home); b.v = [0, 0, 0]; b.w = [0, 0, 0]; b.kinematic = true; R.tp = [...R.home]; }
  }
  respawnBall() {
    const { x, z } = LAYOUT.cageBall;
    const b = this.ball.body;
    b.set(x, this.world.groundAt(x, z) + 12, z); b.v = [0, 0, 0]; b.w = [0, 0, 0]; b.enabled = true;
    this.ball.alive = true; this.ball.hits = 0;
  }

  // ------------------------------------------------------------------ network snapshot
  sendWorld(full) {
    const moved = (b) => full || Math.hypot(b.v[0], b.v[1], b.v[2]) > 0.05 || Math.hypot(b.w[0], b.w[1], b.w[2]) > 0.05;
    const pack = (b) => [r2(b.p[0]), r2(b.p[1]), r2(b.p[2]), r2(b.q[0]), r2(b.q[1]), r2(b.q[2]), r2(b.q[3])];
    const msg = {
      b: this.barrels.filter((B) => full || moved(B.body) || !B.alive).map((B) => [B.id, B.alive ? 1 : 0, ...pack(B.body)]),
      r: this.piles.flatMap((P) => P.rocks).map((R, n) => (full || moved(R.body) ? [n, ...pack(R.body)] : null)).filter(Boolean),
      l: this.logs.map((L) => [L.id, L.tree.i, ...pack(L.body)]),
      m: this.mines.map((M) => [M.id, ...pack(M.body)]),
      c: [this.ball.alive ? 1 : 0, this.ball.hits, ...pack(this.ball.body)],
      cr: this.crates.map((C) => (C.alive ? 1 : 0)).join(''),
      t: this.trees.map((T) => (T.snapped ? 1 : 0)).join(''),
      g: this.geysers.map((g) => g.phase).join(''),
      pl: this.piles.map((P) => (P.released ? 1 : 0)).join(''),
    };
    this.net.send('world', msg);
  }

  applyWorld(msg) {
    if (this.isHost) return;
    const set = (P, a, o) => { P.tp = [a[o], a[o + 1], a[o + 2]]; P.tq = [a[o + 3], a[o + 4], a[o + 5], a[o + 6]]; };
    for (const a of msg.b || []) { const B = this.barrels[a[0]]; if (!B) continue; const was = B.alive; B.alive = !!a[1]; B.body.enabled = B.alive; set(B, a, 2); if (!was && B.alive) { B.body.set(...B.tp); B.body.q = [...B.tq]; } }
    const rocks = this.piles.flatMap((P) => P.rocks);
    for (const a of msg.r || []) { const R = rocks[a[0]]; if (R) set(R, a, 1); }
    // logs: create / destroy to match the host
    const seen = new Set();
    for (const a of msg.l || []) {
      seen.add(a[0]);
      let L = this.logs.find((l) => l.id === a[0]);
      if (!L) {
        const T = this.trees[a[1]];
        if (!T) continue;
        if (!T.snapped) this.hideTree(T);
        const body = this.propBody({ mass: 110, spheres: [[-2, 0, 0, 0.36], [0, 0, 0, 0.38], [2, 0, 0, 0.34]], inertia: [30, 160, 160], kind: 'log' });
        body.kinematic = true;
        body.set(a[2], a[3], a[4]);
        L = { id: a[0], tree: T, body, ent: this.ent(this.meshes.log, this.mats.prop, 'log'), tp: [a[2], a[3], a[4]], tq: [a[5], a[6], a[7], a[8]] };
        L.ent.setLocalScale(T.s, T.s, T.s);
        body.prop = L;
        body.onContact = (other, sp) => { if (other.car && other.car.local) this.net.send('hitProp', { kind: 'log', id: L.id, sp: r2(sp), v: other.car.body.v.map(r2) }); };
        this.logs.push(L);
      }
      set(L, a, 2);
    }
    for (let i = this.logs.length - 1; i >= 0; i--) if (!seen.has(this.logs[i].id)) { this.physics.remove(this.logs[i].body); this.logs[i].ent.destroy(); this.logs.splice(i, 1); }
    // mines
    const ms = new Set();
    for (const a of msg.m || []) {
      ms.add(a[0]);
      let M = this.mines.find((m) => m.id === a[0]);
      if (!M) {
        const body = this.propBody({ mass: 15, spheres: [[0, 0, 0, 0.3]], kind: 'mine' });
        body.kinematic = true;
        M = { id: a[0], body, ent: this.ent(this.meshes.mine, this.mats.glow, 'mine'), tp: [a[1], a[2], a[3]], tq: [0, 0, 0, 1], t: 0 };
        body.set(a[1], a[2], a[3]);
        body.prop = M;
        this.mines.push(M);
      }
      set(M, a, 1);
    }
    for (let i = this.mines.length - 1; i >= 0; i--) if (!ms.has(this.mines[i].id)) { this.physics.remove(this.mines[i].body); this.mines[i].ent.destroy(); this.mines.splice(i, 1); }
    if (msg.c) { this.ball.alive = !!msg.c[0]; this.ball.hits = msg.c[1]; this.ball.body.enabled = this.ball.alive; set(this.ball, msg.c, 2); }
    if (msg.cr) [...msg.cr].forEach((v, i) => { if (this.crates[i]) this.crates[i].alive = v === '1'; });
    if (msg.t) [...msg.t].forEach((v, i) => { const T = this.trees[i]; if (!T) return; if (v === '1' && !T.snapped) this.hideTree(T); if (v === '0' && T.snapped) { T.snapped = false; T.obstacle.off = false; T.ent.enabled = true; T.stump.enabled = false; } });
    if (msg.g) [...msg.g].forEach((v, i) => { const g = this.geysers[i]; if (g) { if (g.phase !== 2 && v === '2') this.fx.steam(g.x, 0, g.z, 30, 15); g.phase = Number(v); } });
    if (msg.pl) [...msg.pl].forEach((v, i) => { const P = this.piles[i]; if (P) P.released = v === '1'; });
  }

  /** geyser uniforms for the water shader */
  geyserUniform(i, out) {
    const g = this.geysers[i];
    out[0] = g.x; out[1] = g.z; out[2] = g.phase === 1 ? 1 : 0; out[3] = g.phase === 2 ? 1 : 0;
    return out;
  }
}

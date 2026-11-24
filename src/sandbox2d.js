// The toys of the glade (side view) and who owns them.
// The host simulates every prop and broadcasts what moved; everyone else holds kinematic copies
// they can bump into, and sends "I hit this" impulses back to the host.
import * as pc from 'playcanvas';
import { CLS } from './shaders.js';
import { MeshBuilder, rgba, addTube, addLathe, addSphere, addBox, deadTreeMesh, rockMesh } from './meshes.js';
import { Body } from './physics2d.js';
import { LAYOUT, RESPAWN_SECONDS, GADGET_KEYS } from './layout.js';
import { hatMesh } from './hats.js';
import { silMaterial, glowMaterial } from './sil.js';
import { pillarMesh } from './world2d.js';

const r2 = (v) => Math.round(v * 100) / 100;
const K = (c) => rgba(0, 0, 0, c);

function barrelMesh(device) {
  const mb = new MeshBuilder();
  addLathe(mb, [[0.0, -0.45], [0.36, -0.45], [0.42, -0.2], [0.43, 0.0], [0.42, 0.2], [0.36, 0.45], [0.0, 0.45]], { seg: 12, colFn: (t) => (Math.abs(t - 0.5) < 0.07 ? rgba(1, 0.6, 0.2, CLS.GLOW) : K(CLS.STONE)) });
  for (const y of [-0.3, 0.3]) addLathe(mb, [[0.43, y - 0.03], [0.46, y], [0.43, y + 0.03]], { seg: 12, colFn: () => K(CLS.STONE) });
  return mb.build(device);
}
function logMesh(device) {
  const mb = new MeshBuilder();
  addTube(mb, [[-2.4, 0, 0, 0.32], [-1, 0.02, 0, 0.36], [1, -0.02, 0, 0.35], [2.4, 0, 0, 0.28]], { seg: 8, capStart: true, colFn: () => K(CLS.FOLIAGE) });
  for (const [x, a] of [[-1.2, 0.9], [0.6, 2.2], [1.6, -0.8]]) addTube(mb, [[x, 0.2, 0, 0.09], [x + 0.3, 0.2 + Math.sin(a) * 0.7, Math.cos(a) * 0.5, 0.02]], { seg: 4, colFn: () => K(CLS.FOLIAGE) });
  return mb.build(device);
}
function stumpMesh(device) {
  const mb = new MeshBuilder();
  addLathe(mb, [[0.62, -0.2], [0.45, 0.2], [0.36, 0.7], [0.3, 1.0], [0.0, 1.05]], { seg: 8, colFn: () => K(CLS.FOLIAGE) });
  return mb.build(device);
}
function cageMesh(device) {
  const mb = new MeshBuilder();
  const R = 1.7;
  for (let k = 0; k < 4; k++) {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2, b = (k / 4) * Math.PI; pts.push([Math.cos(a) * R * Math.cos(b), Math.sin(a) * R, Math.cos(a) * R * Math.sin(b), 0.08]); }
    addTube(mb, pts, { seg: 4, subdiv: 1, capEnd: false, colFn: () => K(CLS.STONE) });
  }
  for (const y of [-0.9, 0, 0.9]) {
    const rr = Math.sqrt(R * R - y * y), pts = [];
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; pts.push([Math.cos(a) * rr, y, Math.sin(a) * rr, 0.08]); }
    addTube(mb, pts, { seg: 4, subdiv: 1, capEnd: false, colFn: () => K(CLS.STONE) });
  }
  // the bomb inside, with a fuse that glows brighter as it takes hits
  addSphere(mb, { r: 0.7, segW: 10, segH: 7, colFn: () => K(CLS.CHAR) });
  addTube(mb, [[0, 0.65, 0, 0.06], [0.2, 0.95, 0, 0.05], [0.1, 1.1, 0, 0.04]], { seg: 4, colFn: () => K(CLS.CHAR) });
  addSphere(mb, { x: 0.1, y: 1.12, r: 0.09, segW: 5, segH: 3, colFn: () => rgba(1, 0.6, 0.2, CLS.GLOW) });
  return mb.build(device);
}
function crateMesh(device) {
  const mb = new MeshBuilder();
  addBox(mb, { sx: 1.0, sy: 1.0, sz: 1.0, col: K(CLS.GROUND) });
  for (const [x, y, sx, sy] of [[0, 0.5, 1.06, 0.06], [0, -0.5, 1.06, 0.06], [0.5, 0, 0.06, 1.06], [-0.5, 0, 0.06, 1.06]]) addBox(mb, { x, y, z: 0.52, sx, sy, sz: 0.04, col: rgba(1, 0.62, 0.22, CLS.GLOW) });
  addBox(mb, { z: 0.52, sx: 1.3, sy: 0.06, sz: 0.04, tilt: 0.785, col: rgba(1, 0.62, 0.22, CLS.GLOW) });
  return mb.build(device);
}
function mineMesh(device) {
  const mb = new MeshBuilder();
  addLathe(mb, [[0.0, -0.25], [0.24, -0.22], [0.28, 0.0], [0.24, 0.22], [0.0, 0.25]], { seg: 10, colFn: () => K(CLS.CHAR) });
  addSphere(mb, { y: 0.3, r: 0.09, segW: 5, segH: 3, colFn: () => rgba(1, 0.5, 0.2, CLS.GLOW) });
  return mb.build(device);
}
function altarMesh(device) {
  const mb = new MeshBuilder();
  addBox(mb, { y: 0.4, sx: 3.2, sy: 0.8, sz: 2, col: K(CLS.STONE) });
  addBox(mb, { y: 0.9, sx: 3.8, sy: 0.25, sz: 2.2, col: K(CLS.STONE) });
  return mb.build(device);
}
function haloSprite(device) {
  const mesh = new pc.Mesh(device);
  const pos = [0, 0, 0], col = [255, 226, 180, 46], idx = [];
  for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; pos.push(Math.cos(a), Math.sin(a), 0); col.push(255, 220, 170, 0); if (i > 0) idx.push(0, i, i + 1); }
  mesh.setPositions(pos); mesh.setColors32(col); mesh.setIndices(idx); mesh.update(pc.PRIMITIVE_TRIANGLES);
  mesh.incRefCount();
  return mesh;
}

export class Sandbox {
  constructor({ app, layer, physics, terrain, fx, net, hooks }) {
    this.app = app;
    this.layer = layer;
    this.physics = physics;
    this.terrain = terrain;
    this.fx = fx;
    this.net = net;
    this.hooks = hooks; // { boom(msg), grant(msg), cars(), sound(name, {x}), hat(id) }
    const d = app.graphicsDevice;
    this.mat = silMaterial({ sway: 0.3 });
    this.glow = glowMaterial(1);
    this.meshes = { barrel: barrelMesh(d), log: logMesh(d), stump: stumpMesh(d), tree: deadTreeMesh(d, 13), rock: rockMesh(d, 9), cage: cageMesh(d), crate: crateMesh(d), mine: mineMesh(d), halo: haloSprite(d), altar: altarMesh(d) };
    this.time = 0;
    this.dyn = []; // every networked prop body, index = id
    this.sentHit = new Map();
    this.sendT = 0;
    this.fullT = 0;
    this.logs = [];
    this.mines = [];
    this.nextId = 1;
    this.buildBarrels();
    this.buildTrees();
    this.buildSlides();
    this.buildBall();
    this.buildShrine();
    this.buildCrates();
    this.buildHats();
    this.geysers = LAYOUT.geysers.map((x, i) => ({ i, x, phase: 0, t: 3 + i * 1.7 })); // 0 idle, 1 bubbling, 2 blast
  }

  get isHost() { return this.net.isHost; }

  /** call when this browser gains/loses host status: only the host simulates props */
  setAuthority() {
    for (const P of this.dyn) if (P) P.body.kinematic = !this.isHost || !!P.held;
  }

  ent(mesh, mat = this.mat, name = 'prop', z = 0) {
    const e = new pc.Entity(name);
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], layers: [this.layer.id], castShadows: false, receiveShadows: false });
    this.app.root.addChild(e);
    e.setPosition(0, 0, z);
    return e;
  }

  addProp(P) {
    P.id = this.dyn.length;
    this.dyn.push(P);
    P.body.prop = P;
    P.body.kinematic = !this.isHost || P.held;
    P.body.onContact = (other, sp) => this.propContact(P, other, sp);
    this.physics.add(P.body);
    return P;
  }

  // ---------------------------------------------------------------- builders
  buildBarrels() {
    this.barrels = [];
    for (const [x, n] of LAYOUT.barrels) {
      const g = this.terrain.height(x);
      const spots = n === 3 ? [[-0.5, 0], [0.5, 0], [0, 0.92]] : n === 2 ? [[-0.48, 0], [0.48, 0]] : [[0, 0]];
      for (const [dx, dy] of spots) {
        const body = new Body({ mass: 30, shapes: [[0, -0.22, 0.42], [0, 0.22, 0.42]], inertia: 30 * 0.3, restitution: 0.2, friction: 0.7, kind: 'barrel', linDamp: 0.1, angDamp: 0.4 });
        const home = [x + dx, Math.max(g, this.terrain.height(x + dx)) + 0.47 + dy];
        body.set(home[0], home[1], 0);
        const B = this.addProp({ kind: 'barrel', body, home, alive: true, fuse: 0, respawn: 0, ent: this.ent(this.meshes.barrel, this.mat, 'barrel') });
        this.barrels.push(B);
      }
    }
  }

  buildTrees() {
    this.trees = LAYOUT.trees.map((x, i) => {
      const g = this.terrain.height(x);
      const ent = this.ent(this.meshes.tree, this.mat, 'snapTree');
      ent.setPosition(x, g - 0.2, -0.2);
      ent.setLocalScale(0.85, 0.85, 0.85);
      ent.setEulerAngles(0, i * 47, 0);
      const stump = this.ent(this.meshes.stump, this.mat, 'stump');
      stump.setPosition(x, g - 0.15, -0.2);
      stump.enabled = false;
      const T = { i, x, g, ent, stump, snapped: false, respawn: 0, statics: [] };
      for (let y = 0.6; y < 6.5; y += 0.8) {
        const o = this.physics.statics.add({ x, y: g + y, r: 0.32, kind: 'tree', tree: T });
        o.breakable = (b) => this.treeHit(T, b);
        T.statics.push(o);
      }
      return T;
    });
  }

  buildSlides() {
    this.slides = LAYOUT.slides.map((S, i) => {
      const e = -S.dir; // uphill
      const rocks = [];
      for (let k = 0; k < S.count; k++) {
        const x = S.x + e * (2.5 + k * 2.2);
        const r = 0.8 + ((k * 37) % 5) * 0.08;
        const body = new Body({ mass: 220, shapes: [[0, 0, r]], restitution: 0.15, friction: 0.9, kind: 'boulder', linDamp: 0.02, angDamp: 0.05 });
        const home = [x, this.terrain.height(x) + r];
        body.set(home[0], home[1], 0);
        const ent = this.ent(this.meshes.rock, this.mat, 'boulder');
        ent.setLocalScale(r * 1.45, r * 1.45, r * 1.45);
        rocks.push(this.addProp({ kind: 'boulder', body, home, alive: true, held: true, slide: i, ent }));
      }
      return { i, S, rocks, released: false, respawn: 0, triggerX: S.x + S.dir * 9 };
    });
    for (const sl of this.slides) for (const R of sl.rocks) R.body.kinematic = true;
  }

  buildBall() {
    const x = LAYOUT.cageBall;
    const body = new Body({ mass: 140, shapes: [[0, 0, 1.7]], restitution: 0.45, friction: 0.4, kind: 'ball', linDamp: 0.05, angDamp: 0.05 });
    const home = [x, this.terrain.height(x) + 1.75];
    body.set(home[0], home[1], 0);
    this.ball = this.addProp({ kind: 'ball', body, home, alive: true, hits: 0, lastHit: 0, respawn: 0, ent: this.ent(this.meshes.cage, this.mat, 'cageBall') });
  }

  buildShrine() {
    this.pillars = LAYOUT.pillars.map((x) => {
      // the pillars stand just behind the lane: a hat waits on top of each for whoever flies off the rim
      const g = this.terrain.height(x), h = 3.6 - g; // both tops level, whatever the ground does
      const e = this.ent(pillarMesh(this.app.graphicsDevice, h), this.mat, 'pillar');
      e.setPosition(x, g - 0.8, -2.6);
      return { x, top: g - 0.8 + h + 0.6 };
    });
    const ax = LAYOUT.bowl.x, ag = this.terrain.height(ax);
    this.ent(this.meshes.altar, this.mat, 'altar').setPosition(ax, ag - 0.1, -1.6);
  }

  buildCrates() {
    this.crates = LAYOUT.crates.map((x, i) => {
      const y = this.terrain.height(x) + 1.3;
      const ent = this.ent(this.meshes.crate, this.mat, 'crate');
      const halo = this.ent(this.meshes.halo, this.glow, 'crateHalo', 0.6);
      return { i, x, y, ent, halo, alive: true, respawn: 0, asked: 0 };
    });
  }

  buildHats() {
    let owned = [];
    try { owned = JSON.parse(localStorage.getItem('hsg.hats') || '[]'); } catch { /* */ }
    this.ownedHats = new Set(owned);
    this.hats = LAYOUT.hats.map((h) => {
      let y = this.terrain.height(h.x) + h.y;
      if (h.onPillar) { const p = this.pillars.find((q) => Math.abs(q.x - h.x) < 1); if (p) y = p.top + 0.7; }
      const e = this.ent(hatMesh(this.app.graphicsDevice, h.id), this.mat, 'hatPickup');
      e.setLocalScale(1.5, 1.5, 1.5);
      const halo = this.ent(this.meshes.halo, this.glow, 'hatHalo', 0.5);
      halo.setLocalScale(0.8, 0.8, 1);
      const got = this.ownedHats.has(h.id);
      e.enabled = halo.enabled = !got;
      return { id: h.id, x: h.x, y, ent: e, halo, got };
    });
  }

  // ---------------------------------------------------------------- contacts
  propContact(P, other, sp) {
    const car = other && other.car;
    if (!car) {
      if (P.kind === 'barrel' && sp > 11 && this.isHost && P.alive) this.light(P, null);
      return;
    }
    // props are round: a buggy ramming one rides up over it, so the head-on part of the impact
    // understates the hit. Count a solid ram by the buggy's own speed too.
    if (sp > 2.5) sp = Math.max(sp, car.speed * 0.8);
    if (this.isHost) {
      if (P.kind === 'barrel' && sp > 7 && P.alive) this.light(P, car.id);
      if (P.kind === 'ball' && sp > 4.5 && this.time - P.lastHit > 0.3) this.ballHit(car.id);
      if (P.kind === 'boulder' && P.held) this.releaseSlide(this.slides[P.slide]);
    } else if (car.local) {
      const key = P.id;
      if (this.time - (this.sentHit.get(key) || 0) < 0.2) return;
      this.sentHit.set(key, this.time);
      this.net.send('hitProp', { id: P.id, sp: r2(sp), v: car.body.v.map(r2), m: car.spec.mass });
      // predicted shove so it feels instant
      P.body.p[0] += Math.sign(car.body.v[0]) * 0.05;
    }
  }

  onRemoteHit(msg) {
    if (!this.isHost) return;
    const P = this.dyn[msg.id];
    if (!P || P.alive === false) return;
    const by = msg.from;
    if (!P.body.kinematic) {
      const k = Math.min(1.2, (msg.m || 180) / P.body.m) * 0.6;
      P.body.v[0] += msg.v[0] * k; P.body.v[1] += Math.abs(msg.v[0]) * k * 0.25 + Math.max(0, msg.v[1]) * k;
      P.body.w += (Math.random() - 0.5) * 3;
    }
    if (P.kind === 'barrel' && msg.sp > 7) this.light(P, by);
    if (P.kind === 'ball' && msg.sp > 4.5 && this.time - P.lastHit > 0.3) this.ballHit(by);
    if (P.kind === 'boulder' && P.held) this.releaseSlide(this.slides[P.slide]);
  }

  treeHit(T, b) {
    if (T.snapped) return true;
    const car = b.car;
    if (!car) return false;
    if (Math.abs(b.v[0]) < 5.5) {
      // a slow bump: the tree holds, but keep leaning on it and it creaks over (there is only
      // one lane, so a tree must never be a dead end)
      if (this.time - (T.leanAt || 0) > 0.25) T.lean = 0;
      T.lean = (T.lean || 0) + Math.min(0.05, this.time - (T.leanAt || this.time));
      T.leanAt = this.time;
      if (T.lean < 0.7 || Math.abs(car.throttle) < 0.3) return false;
    }
    T.lean = 0;
    const dir = Math.sign(b.v[0]) || car.facing;
    if (this.isHost) this.snapTree(T, dir, car.id);
    else if (car.local) { this.net.send('snap', { i: T.i, dir }); this.hideTree(T); }
    b.v[0] *= 0.7;
    return true;
  }

  hideTree(T) {
    T.snapped = true;
    T.ent.enabled = false;
    T.stump.enabled = true;
    for (const o of T.statics) o.off = true;
    T.respawn = RESPAWN_SECONDS;
    this.fx.sparkBurst(T.x, T.g + 1, 6, 4);
    for (let i = 0; i < 8; i++) this.fx.add({ kind: 'debris', x: T.x, y: T.g + 1 + Math.random(), z: 0.4, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 5, t: 0, life: 1.2, size: 0.15, g: -19, rot: 0, spin: 10 });
    this.hooks.sound('crack', { x: T.x });
  }

  snapTree(T, dir, by) {
    if (T.snapped && T.log) return;
    if (!T.snapped) this.hideTree(T);
    if (this.isHost) this.net.send('snapped', { i: T.i });
    // the trunk becomes a log that topples the way it was hit
    const shapes = [];
    for (let x = -2.1; x <= 2.11; x += 0.7) shapes.push([x, 0, 0.34]);
    const body = new Body({ mass: 80, shapes, inertia: 80 * 1.6, restitution: 0.1, friction: 0.5, kind: 'log', linDamp: 0.05, angDamp: 0.15 });
    body.set(T.x + dir * 0.3, T.g + 2.6, Math.PI / 2);
    body.w = -dir * 1.6;
    body.v[0] = dir * 2;
    const L = this.addProp({ kind: 'log', body, alive: true, tree: T, by, life: 12, ent: this.ent(this.meshes.log, this.mat, 'log') });
    T.log = L;
    this.logs.push(L);
  }

  light(P, by) {
    if (!P.alive || P.fuse > 0) return;
    P.fuse = 0.25 + Math.random() * 0.45;
    P.by = by;
  }

  ballHit(by) {
    const P = this.ball;
    if (!P.alive) return;
    P.hits++;
    P.lastHit = this.time;
    P.by = by;
    this.hooks.sound('clang', { x: P.body.p[0] });
    if (P.hits >= 5) {
      P.alive = false;
      P.respawn = RESPAWN_SECONDS;
      this.boom(P.body.p[0], P.body.p[1], 2.4, by);
    }
  }

  releaseSlide(sl) {
    if (sl.released) return;
    if (!this.isHost) { this.net.send('slide', { i: sl.i }); return; }
    sl.released = true;
    sl.respawn = RESPAWN_SECONDS;
    for (const R of sl.rocks) { R.held = false; R.body.kinematic = false; R.body.v[0] = sl.S.dir * (1 + Math.random()); R.body.w = -sl.S.dir * 2; }
    this.hooks.sound('rumble', { x: sl.S.x });
    this.net.send('rumble', { x: sl.S.x });
  }

  /** host: an explosion. Blasts props, lights barrels, tells every client (who push their own cars). */
  boom(x, y, size, by) {
    const msg = { x: r2(x), y: r2(y), s: size, by: by || null };
    this.net.send('boom', msg);
    this.hooks.boom(msg);
    this.physics.blast(x, y, 7 * size, 13 * size, (b) => !!b.prop && !b.kinematic);
    for (const B of this.barrels) if (B.alive && B.fuse <= 0 && Math.hypot(B.body.p[0] - x, B.body.p[1] - y) < 4.2 * size) this.light(B, by);
    for (const T of this.trees) if (!T.snapped && Math.abs(T.x - x) < 3.4 * size && y < T.g + 6) this.snapTree(T, Math.sign(T.x - x) || 1, by);
    for (const sl of this.slides) if (!sl.released && sl.rocks.some((R) => Math.hypot(R.body.p[0] - x, R.body.p[1] - y) < 6 * size)) this.releaseSlide(sl);
    if (this.ball.alive && Math.hypot(this.ball.body.p[0] - x, this.ball.body.p[1] - y) < 5 * size && this.time - this.ball.lastHit > 0.3) this.ballHit(by);
  }

  // ---------------------------------------------------------------- pickups (each client checks its own cars)
  checkLocal(car, isBot) {
    if (car.wrecked) return;
    const p = car.body.p;
    for (const C of this.crates) {
      if (!C.alive || Math.abs(p[0] - C.x) > 1.4 || Math.abs(p[1] - C.y) > 1.8) continue;
      if (this.isHost) this.grant(C, car.id);
      else if (this.time - C.asked > 0.5) { C.asked = this.time; this.net.send('pickup', { i: C.i }); }
    }
    if (!isBot) {
      for (const H of this.hats) {
        if (H.got || Math.hypot(p[0] - H.x, p[1] - H.y) > 1.9) continue;
        H.got = true;
        H.ent.enabled = H.halo.enabled = false;
        this.ownedHats.add(H.id);
        try { localStorage.setItem('hsg.hats', JSON.stringify([...this.ownedHats])); } catch { /* */ }
        this.hooks.hat(H.id);
      }
    }
    // geysers launch whoever is parked over them
    for (const g of this.geysers) {
      if (g.phase !== 2 || Math.abs(p[0] - g.x) > 1.5 || p[1] > LAYOUT.waterY + 7) continue;
      if ((car.geyserT || 0) > this.time) continue;
      car.geyserT = this.time + 0.8;
      car.body.v[1] = Math.max(car.body.v[1], 19);
      car.body.w += (Math.random() - 0.5) * 4;
    }
    // rock slides: drive into the valley below the ledge and the boulders let go
    for (const sl of this.slides) if (!sl.released && Math.abs(p[0] - sl.triggerX) < 5 && !isBot) this.releaseSlide(sl);
  }

  onRemotePickup(msg) { if (this.isHost) { const C = this.crates[msg.i]; if (C && C.alive) this.grant(C, msg.from); } }

  grant(C, to) {
    const g = GADGET_KEYS[Math.floor(Math.random() * GADGET_KEYS.length)];
    const msg = { i: C.i, to, g };
    this.net.send('grant', msg);
    this.hooks.grant(msg);
  }
  onGrant(msg) {
    const C = this.crates[msg.i];
    if (!C) return;
    C.alive = false;
    C.respawn = RESPAWN_SECONDS;
    this.fx.sparkBurst(C.x, C.y, 10, 5);
  }

  dropMine(p, v, owner) {
    if (!this.isHost) { this.net.send('mine', { p: p.map(r2), v: v.map(r2) }); return; }
    const body = new Body({ mass: 8, shapes: [[0, 0, 0.28]], restitution: 0.1, friction: 0.9, kind: 'mine' });
    body.set(p[0], p[1], 0);
    body.v[0] = v[0] * 0.3; body.v[1] = v[1] * 0.3;
    const M = this.addProp({ kind: 'mine', body, alive: true, owner, armT: 0.7, life: 40, ent: this.ent(this.meshes.mine, this.mat, 'mine') });
    this.mines.push(M);
  }

  // ---------------------------------------------------------------- per frame
  update(dt, cars) {
    this.time += dt;
    const host = this.isHost;
    // barrels: fuses, respawn
    for (const B of this.barrels) {
      if (B.alive && B.fuse > 0) {
        B.fuse -= dt;
        if (Math.random() < dt * 30) this.fx.sparkBurst(B.body.p[0], B.body.p[1] + 0.5, 1, 3);
        if (B.fuse <= 0 && host) { B.alive = false; B.respawn = RESPAWN_SECONDS; B.body.enabled = false; this.boom(B.body.p[0], B.body.p[1], 1.1, B.by); }
      }
      if (!B.alive && host) {
        B.respawn -= dt;
        if (B.respawn <= 0 && !cars.some((c) => Math.abs(c.body.p[0] - B.home[0]) < 3)) {
          B.alive = true; B.fuse = 0; B.body.enabled = true; B.body.set(B.home[0], B.home[1] + 2, 0); B.body.v[0] = B.body.v[1] = 0; B.body.w = 0;
        }
      }
    }
    // trees regrow, logs vanish
    for (const T of this.trees) {
      if (!T.snapped) continue;
      T.respawn -= dt;
      if (T.respawn <= 0 && (host || !this.net.online)) {
        if (cars.some((c) => Math.abs(c.body.p[0] - T.x) < 3)) { T.respawn = 2; continue; }
        this.regrow(T);
        if (host) this.net.send('regrow', { i: T.i });
      }
    }
    // a fallen log only blocks the lane for a while, then it rots away (the tree regrows later)
    if (host) for (let i = this.logs.length - 1; i >= 0; i--) {
      const L = this.logs[i];
      L.life -= dt;
      if (L.life <= 0) { if (L.tree && L.tree.log === L) L.tree.log = null; this.removeProp(L); this.logs.splice(i, 1); }
    }
    // rock slides reset
    for (const sl of this.slides) {
      if (!sl.released || !host) continue;
      sl.respawn -= dt;
      if (sl.respawn <= 0) this.resetSlide(sl);
    }
    // the cage ball
    if (!this.ball.alive && host) { this.ball.respawn -= dt; if (this.ball.respawn <= 0) { this.ball.alive = true; this.ball.hits = 0; this.ball.body.set(this.ball.home[0], this.ball.home[1] + 3, 0); this.ball.body.v[0] = this.ball.body.v[1] = 0; } }
    // crates
    for (const C of this.crates) { if (!C.alive && host) { C.respawn -= dt; if (C.respawn <= 0) C.alive = true; } }
    // mines
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const M = this.mines[i];
      M.armT -= dt; M.life -= dt;
      if (!host) continue;
      const trip = M.life <= 0 || (M.armT <= 0 && cars.some((c) => !c.wrecked && Math.hypot(c.body.p[0] - M.body.p[0], c.body.p[1] - M.body.p[1]) < 1.5));
      if (trip) { this.removeProp(M); this.mines.splice(i, 1); this.boom(M.body.p[0], M.body.p[1], 1.0, M.owner); }
    }
    // geysers (host clock)
    for (const g of this.geysers) {
      if (!host) { g.t -= dt; continue; }
      g.t -= dt;
      if (g.t <= 0) {
        g.phase = (g.phase + 1) % 3;
        g.t = g.phase === 0 ? 4 + Math.random() * 4 : g.phase === 1 ? 1.6 : 0.8;
        if (g.phase === 2) this.hooks.sound('geyser', { x: g.x });
      }
      if (g.phase === 2) this.physics.blast(g.x, LAYOUT.waterY - 1, 2.2, 6, (b) => !!b.prop && !b.kinematic && Math.abs(b.p[0] - g.x) < 1.6);
    }
    for (const g of this.geysers) {
      if (g.phase === 1 && Math.random() < dt * 12) this.fx.steam(g.x, LAYOUT.waterY, 1, 1.5);
      if (g.phase === 2 && Math.random() < dt * 40) this.fx.steam(g.x, LAYOUT.waterY, 2, 14);
    }
    // visuals
    for (const P of this.dyn) if (P) this.syncProp(P);
    const t = this.time;
    for (const C of this.crates) { C.ent.enabled = C.halo.enabled = C.alive; if (C.alive) { const y = C.y + Math.sin(t * 2 + C.i) * 0.15; C.ent.setPosition(C.x, y, 0); C.ent.setEulerAngles(0, t * 40 + C.i * 30, 0); C.halo.setPosition(C.x, y, 0.6); const s = 1.0 + Math.sin(t * 3 + C.i) * 0.1; C.halo.setLocalScale(s, s, 1); } }
    for (const H of this.hats) if (!H.got) { const y = H.y + Math.sin(t * 1.7 + H.x) * 0.2; H.ent.setPosition(H.x, y, 0); H.ent.setEulerAngles(0, t * 70, 0); H.halo.setPosition(H.x, y + 0.2, 0.5); }
    // network: host broadcasts what moved
    if (host && this.net.online) {
      this.sendT -= dt; this.fullT -= dt;
      if (this.sendT <= 0) { this.sendT = 0.1; this.sendWorld(this.fullT <= 0); if (this.fullT <= 0) this.fullT = 2; }
    }
    // client: glide kinematic copies toward the host's latest positions
    if (!host) for (const P of this.dyn) if (P && P.target) { const b = P.body, k = Math.min(1, dt * 12); b.p[0] += (P.target[0] - b.p[0]) * k; b.p[1] += (P.target[1] - b.p[1]) * k; let da = P.target[2] - b.a; da = Math.atan2(Math.sin(da), Math.cos(da)); b.a += da * k; b.updateShapes(); }
  }

  syncProp(P) {
    const e = P.ent;
    if (!e) return;
    const on = P.alive !== false && P.body.enabled;
    e.enabled = on;
    if (!on) return;
    const b = P.body;
    e.setPosition(b.p[0], b.p[1], P.kind === 'boulder' ? 0 : 0);
    e.setEulerAngles(0, P.kind === 'barrel' || P.kind === 'mine' ? 20 : 0, (b.a * 180) / Math.PI);
  }

  removeProp(P) {
    P.alive = false;
    this.physics.remove(P.body);
    if (P.ent) P.ent.destroy();
    P.ent = null;
  }

  regrow(T) {
    T.snapped = false;
    T.ent.enabled = true;
    T.stump.enabled = false;
    for (const o of T.statics) o.off = false;
    if (T.log) { this.removeProp(T.log); this.logs = this.logs.filter((L) => L !== T.log); T.log = null; }
  }

  resetSlide(sl) {
    sl.released = false;
    for (const R of sl.rocks) { R.held = true; R.body.kinematic = true; R.body.set(R.home[0], R.home[1], 0); R.body.v[0] = R.body.v[1] = 0; R.body.w = 0; }
  }

  // ---------------------------------------------------------------- host -> clients
  sendWorld(full) {
    const b = [];
    for (const P of this.dyn) {
      if (P.alive === false && !full) continue;
      const B = P.body;
      const moved = !B.kinematic && (Math.abs(B.v[0]) + Math.abs(B.v[1]) + Math.abs(B.w) > 0.05);
      if (!full && !moved) continue;
      b.push([P.id, r2(B.p[0]), r2(B.p[1]), r2(B.a), P.alive === false ? 0 : 1, P.kind === 'log' ? P.tree.i : P.kind === 'mine' ? -2 : -1]);
    }
    this.net.send('world', {
      b,
      full: full ? 1 : 0,
      n: this.dyn.length,
      tr: this.trees.map((T) => (T.snapped ? 1 : 0)).join(''),
      cr: this.crates.map((C) => (C.alive ? 1 : 0)).join(''),
      sl: this.slides.map((s) => (s.released ? 1 : 0)).join(''),
      bh: this.ball.hits,
      g: this.geysers.map((g) => [g.phase, r2(g.t)]),
    });
  }

  applyWorld(msg) {
    if (this.isHost) return;
    for (const [id, x, y, a, alive, extra] of msg.b) {
      let P = this.dyn[id];
      if (!P && extra !== -1) {
        // a prop born on the host: a log (extra = tree index) or a mine (-2)
        while (this.dyn.length < id) this.dyn.push(null);
        if (extra >= 0) {
          const T = this.trees[extra];
          if (T && !T.snapped) this.hideTree(T);
          const shapes = [];
          for (let s = -2.1; s <= 2.11; s += 0.7) shapes.push([s, 0, 0.34]);
          const body = new Body({ mass: 90, shapes, kind: 'log' });
          body.set(x, y, a);
          P = { kind: 'log', body, alive: true, tree: T, ent: this.ent(this.meshes.log, this.mat, 'log') };
          if (T) T.log = P;
        } else {
          const body = new Body({ mass: 8, shapes: [[0, 0, 0.28]], kind: 'mine' });
          body.set(x, y, 0);
          P = { kind: 'mine', body, alive: true, ent: this.ent(this.meshes.mine, this.mat, 'mine') };
        }
        P.id = id;
        this.dyn[id] = P;
        P.body.prop = P;
        P.body.kinematic = true;
        P.body.onContact = (other, sp) => this.propContact(P, other, sp);
        this.physics.add(P.body);
      }
      if (!P) continue;
      P.target = [x, y, a];
      if (msg.full && P.ent === null) continue;
      const was = P.alive !== false;
      P.alive = !!alive;
      if ((P.kind === 'mine' || P.kind === 'log') && was && !alive) { if (P.tree && P.tree.log === P) P.tree.log = null; this.removeProp(P); }
      if (P.kind === 'barrel' || P.kind === 'ball') P.body.enabled = !!alive;
      if (!was && alive) { P.body.set(x, y, a); }
    }
    if (msg.tr) this.trees.forEach((T, i) => { const s = msg.tr[i] === '1'; if (s && !T.snapped) this.hideTree(T); else if (!s && T.snapped) this.regrow(T); });
    if (msg.cr) this.crates.forEach((C, i) => { C.alive = msg.cr[i] === '1'; });
    if (msg.sl) this.slides.forEach((sl, i) => { sl.released = msg.sl[i] === '1'; });
    if (msg.bh !== undefined) this.ball.hits = msg.bh;
    if (msg.g) msg.g.forEach(([ph, t], i) => { const g = this.geysers[i]; if (g) { g.phase = ph; g.t = t; } });
  }

  /** water bulges for the pond surface */
  gushes() {
    return this.geysers.map((g) => ({ x: g.x, k: g.phase === 1 ? 0.15 + Math.sin(this.time * 20) * 0.05 : g.phase === 2 ? 1.6 : 0 }));
  }
}

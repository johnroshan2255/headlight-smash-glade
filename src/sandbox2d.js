// The toys of the endless glade (side view) and who owns them.
// Props are streamed per 64 m chunk, with ids derived from the chunk, so every browser agrees on
// what is where. The host simulates every chunk near any player and broadcasts what moved;
// everyone else holds kinematic copies of the chunks they can see, bumps into them, and sends
// "I hit this" impulses back to the host. Tornadoes and magnet arches run on the wall clock, so
// every browser agrees on them without any messages at all.
import * as pc from 'playcanvas';
import { CLS } from './shaders.js';
import { MeshBuilder, rgba, addTube, addLathe, addSphere, addBox, deadTreeMesh, rockMesh } from './meshes.js';
import { Body } from './physics2d.js';
import { RESPAWN_SECONDS, GADGET_KEYS } from './layout.js';
import { CHUNK, chunkSpec, chunkOf, chunkId, pillarTop, HAT_SPOTS } from './gen.js';
import { hatMesh } from './hats.js';
import { skeletonMeshes, boneMeshes, pumpkinMesh, BONE_PARTS, boneShapes, boneMass } from './spooky.js';
import { silMaterial, glowMaterial } from './sil.js';

const r2 = (v) => Math.round(v * 100) / 100;
const K = (c) => rgba(0, 0, 0, c);
const NEAR = 2; // chunks either side of a car that are kept live
const DYN_ID0 = 900000000; // ids for props born during play (logs, mines, rockets)

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
function haloSprite(device) {
  const mesh = new pc.Mesh(device);
  const pos = [0, 0, 0], col = [255, 226, 180, 46], idx = [];
  for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; pos.push(Math.cos(a), Math.sin(a), 0); col.push(255, 220, 170, 0); if (i > 0) idx.push(0, i, i + 1); }
  mesh.setPositions(pos); mesh.setColors32(col); mesh.setIndices(idx); mesh.update(pc.PRIMITIVE_TRIANGLES);
  mesh.incRefCount();
  return mesh;
}

function plankMesh(device) {
  const mb = new MeshBuilder();
  addBox(mb, { sx: 7.2, sy: 0.28, sz: 1.3, col: K(CLS.FOLIAGE) });
  for (const x of [-3.2, -1.6, 0, 1.6, 3.2]) addBox(mb, { x, y: 0.16, sx: 0.12, sy: 0.06, sz: 1.32, col: K(CLS.FOLIAGE) });
  return mb.build(device);
}
function pivotMesh(device) {
  const mb = new MeshBuilder();
  addLathe(mb, [[0.0, -0.05], [0.9, -0.05], [0.25, 1.05], [0.0, 1.1]], { seg: 3, colFn: () => K(CLS.STONE) });
  return mb.build(device);
}
function funnelMesh(device) {
  // a translucent spinning dust-devil: stacked rings, widening upwards
  const mesh = new pc.Mesh(device), pos = [], col = [], idx = [];
  const rings = 14, seg = 14;
  for (let j = 0; j <= rings; j++) {
    const y = j * 0.9, r = 0.5 + (j / rings) ** 1.6 * 4.2;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2 + j * 0.45;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r * 0.35);
      const k = Math.sin((j / rings) * Math.PI);
      col.push(140, 150, 148, Math.round(110 * k * (0.5 + 0.5 * Math.sin(i * 1.7 + j))));
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, b, b + 1, a, b + 1, a + 1); }
  mesh.setPositions(pos); mesh.setColors32(col); mesh.setIndices(idx); mesh.update(pc.PRIMITIVE_TRIANGLES);
  mesh.incRefCount();
  return mesh;
}

/** wall-clock seconds: tornadoes and magnet arches are timed by it on every browser */
const wallT = () => Date.now() / 1000;
/** where chunk spec S's tornado is right now */
export function tornadoX(T, t = wallT()) { return T.home + Math.sin(t * 0.045 + T.seed) * T.range + Math.sin(t * 0.11 + T.seed * 0.3) * 4; }
/** the magnet arch cycle: 0 idle, 1 pulling, 2 dropping */
export function archPhase(t = wallT()) { const p = t % 14; return p < 10 ? 0 : p < 12.6 ? 1 : 2; }

export class Sandbox {
  constructor({ app, layer, physics, terrain, fx, net, hooks }) {
    this.app = app;
    this.layer = layer;
    this.physics = physics;
    this.terrain = terrain;
    this.fx = fx;
    this.net = net;
    this.hooks = hooks; // { boom(msg), grant(msg), cars(), sound(name, {x}), hat(id), ownedHats() }
    const d = app.graphicsDevice;
    this.mat = silMaterial({ sway: 0.3 });
    this.glow = glowMaterial(1);
    this.dust = glowMaterial(0.35);
    this.paint = silMaterial({ cls: CLS.CHAR, paint: 1 }); // bones and pumpkins: painted, worn
    this.spook = { ...skeletonMeshes(d), ...boneMeshes(d), pumpkin: pumpkinMesh(d, 'pumpkin'), lantern: pumpkinMesh(d, 'lantern'), melon: pumpkinMesh(d, 'melon') };
    this.meshes = { barrel: barrelMesh(d), log: logMesh(d), stump: stumpMesh(d), tree: deadTreeMesh(d, 13), rock: rockMesh(d, 9), cage: cageMesh(d), crate: crateMesh(d), mine: mineMesh(d), halo: haloSprite(d), plank: plankMesh(d), pivot: pivotMesh(d), funnel: funnelMesh(d) };
    this.time = 0;
    this.chunks = new Map(); // c -> Z (a loaded chunk)
    this.dyn = new Map(); // id -> networked prop
    this.trees = new Map(); this.crates = new Map(); this.slides = new Map(); this.geysers = new Map();
    this.loose = []; // props born during play: logs, mines, rockets
    this.gone = []; // host: ids of props removed since the last world message (clients must drop them too)
    this.sentHit = new Map();
    this.sendT = 0;
    this.fullT = 0;
    this.chunkT = 0;
    this.nextDyn = DYN_ID0;
    this.ownedHats = new Set();
    try { for (const h of JSON.parse(localStorage.getItem('hsg.hats') || '[]')) this.ownedHats.add(h); } catch { /* */ }
  }

  get isHost() { return this.net.isHost; }

  /** call when this browser gains/loses host status: only the host simulates props */
  setAuthority() {
    for (const P of this.dyn.values()) P.body.kinematic = !this.isHost || !!P.held || !!P.heldBy;
  }

  ent(mesh, mat = this.mat, name = 'prop', z = 0, owner = null) {
    const e = new pc.Entity(name);
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], layers: [this.layer.id], castShadows: false, receiveShadows: false });
    this.app.root.addChild(e);
    e.setPosition(0, 0, z);
    if (owner) owner.ents.push(e);
    return e;
  }

  addProp(P, Z = null) {
    this.dyn.set(P.id, P);
    P.body.prop = P;
    P.body.kinematic = !this.isHost || !!P.held;
    P.body.onContact = (other, sp) => this.propContact(P, other, sp);
    this.physics.add(P.body);
    if (Z) Z.props.push(P);
    return P;
  }

  removeProp(P) {
    P.alive = false;
    if (this.isHost && this.net.online && P.id >= DYN_ID0) this.gone.push(P.id);
    this.physics.remove(P.body);
    this.dyn.delete(P.id);
    if (P.ent) P.ent.destroy();
    P.ent = null;
  }

  // ---------------------------------------------------------------- chunk streaming
  /** Keep the chunks near these x positions live; free the rest after a grace period. */
  stream(xs, dt) {
    this.chunkT -= dt;
    if (this.chunkT > 0) return;
    this.chunkT = 0.25;
    const want = new Set();
    for (const x of xs) { const c = chunkOf(x); for (let k = -NEAR; k <= NEAR; k++) want.add(c + k); }
    for (const c of want) if (!this.chunks.has(c)) this.loadChunk(c);
    for (const [c, Z] of this.chunks) {
      if (want.has(c)) Z.idle = 0;
      else if ((Z.idle += 0.25) > 4) this.unloadChunk(c, Z);
    }
    // loose props that wandered off into an unloaded chunk go with it
    for (let i = this.loose.length - 1; i >= 0; i--) {
      const P = this.loose[i];
      if (P.alive === false || !this.chunks.has(chunkOf(P.body.p[0]))) { if (P.alive !== false) this.removeProp(P); this.loose.splice(i, 1); }
    }
  }

  get activeChunks() { return [...this.chunks.keys()]; }

  /** a new map: drop every loaded chunk and loose prop (they stream back in from the new layout) */
  resetChunks() {
    for (const [c, Z] of [...this.chunks]) this.unloadChunk(c, Z);
    for (const P of this.loose) if (P.alive !== false) this.removeProp(P);
    this.loose = [];
    this.gone = [];
    this.chunkT = 0;
  }

  loadChunk(c) {
    const S = chunkSpec(c), T = this.terrain;
    const Z = { c, S, idle: 0, ents: [], props: [], trees: [], crates: [], geysers: [], slide: null, ball: null, hats: [], teeter: null, funnel: null, statics: [] };
    this.chunks.set(c, Z);
    let k = 0;
    // barrel stacks
    const stack = (x, n) => {
      const g = T.height(x);
      const spots = n === 3 ? [[-0.5, 0], [0.5, 0], [0, 0.92]] : n === 2 ? [[-0.48, 0], [0.48, 0]] : [[0, 0]];
      for (const [dx, dy] of spots) {
        const body = new Body({ mass: 30, shapes: [[0, -0.22, 0.42], [0, 0.22, 0.42]], inertia: 30 * 0.3, restitution: 0.2, friction: 0.7, kind: 'barrel', linDamp: 0.1, angDamp: 0.4 });
        const home = [x + dx, Math.max(g, T.height(x + dx)) + 0.47 + dy];
        body.set(home[0], home[1], 0);
        this.addProp({ id: chunkId(c, k++), kind: 'barrel', body, home, alive: true, fuse: 0, respawn: 0, ent: this.ent(this.meshes.barrel, this.mat, 'barrel') }, Z);
      }
    };
    for (const [x, n] of S.barrels) stack(x, n);
    // skeletons, out of their graves (The Graveyard)
    S.skeletons.forEach((x, i) => {
      const home = [x, T.height(x) + 0.98];
      const body = new Body({ mass: 90, shapes: [[0, -0.72, 0.26], [0, -0.1, 0.3], [0, 0.55, 0.24]], inertia: 90 * 0.5, restitution: 0.05, friction: 0.15, kind: 'skeleton', linDamp: 0.3, angDamp: 1.5 }); // slippery bones: they shuffle
      body.set(home[0], home[1], 0);
      this.addProp({ id: chunkId(c, 20 + i), kind: 'skeleton', body, home, alive: true, respawn: 0, dir: i % 2 ? 1 : -1, turnT: 3 + i * 2.3, phase: i, ent: this.skeletonEnt() }, Z);
    });
    // pumpkins, jack-o'-lanterns and melons (Hallowe'en Hollow)
    S.pumpkins.forEach(([x, variant, size], i) => {
      const r = 0.5 * size, home = [x, T.height(x) + r * 0.82];
      const body = new Body({ mass: 28 * size * size, shapes: [[0, 0, r * 0.88]], restitution: 0.15, friction: 0.8, kind: 'pumpkin', linDamp: 0.1, angDamp: 0.6 });
      body.set(home[0], home[1], 0);
      const ent = this.ent(this.spook[variant], this.paint, variant);
      ent.setLocalScale(size, size, size);
      this.addProp({ id: chunkId(c, 25 + Math.min(i, 13)), kind: 'pumpkin', variant, size, body, home, alive: true, respawn: 0, ent }, Z);
    });
    // dead trees that snap into logs
    S.trees.forEach((x, i) => {
      const g = T.height(x), id = chunkId(c, 40 + i);
      const ent = this.ent(this.meshes.tree, this.mat, 'snapTree', 0, Z);
      ent.setPosition(x, g - 0.2, -0.2);
      ent.setLocalScale(0.85, 0.85, 0.85);
      ent.setEulerAngles(0, (id % 360), 0);
      const stump = this.ent(this.meshes.stump, this.mat, 'stump', 0, Z);
      stump.setPosition(x, g - 0.15, -0.2);
      stump.enabled = false;
      const Tr = { id, x, g, ent, stump, snapped: false, respawn: 0, statics: [] };
      for (let y = 0.6; y < 6.5; y += 0.8) {
        const o = this.physics.statics.add({ x, y: g + y, r: 0.32, kind: 'tree', tree: Tr });
        o.breakable = (b) => this.treeHit(Tr, b);
        Tr.statics.push(o); Z.statics.push(o);
      }
      Z.trees.push(Tr); this.trees.set(id, Tr);
    });
    // the boulder mesa
    if (S.mesa) {
      const M = S.mesa, up = -M.dir, sl = { id: chunkId(c, 59), M, rocks: [], released: false, respawn: 0, triggerX: M.trigger };
      for (let i = 0; i < M.count; i++) {
        const x = M.edge + up * (1.2 + i * 2.1), r = 0.8 + ((i * 37) % 5) * 0.08;
        const body = new Body({ mass: 220, shapes: [[0, 0, r]], restitution: 0.15, friction: 0.9, kind: 'boulder', linDamp: 0.02, angDamp: 0.05 });
        const home = [x, T.height(x) + r];
        body.set(home[0], home[1], 0);
        const ent = this.ent(this.meshes.rock, this.mat, 'boulder');
        ent.setLocalScale(r * 1.45, r * 1.45, r * 1.45);
        sl.rocks.push(this.addProp({ id: chunkId(c, 60 + i), kind: 'boulder', body, home, alive: true, held: true, slide: sl, ent }, Z));
      }
      for (const R of sl.rocks) R.body.kinematic = true;
      Z.slide = sl; this.slides.set(sl.id, sl);
    }
    // the cage-ball
    if (S.ball !== null) {
      const x = S.ball, body = new Body({ mass: 140, shapes: [[0, 0, 1.7]], restitution: 0.45, friction: 0.4, kind: 'ball', linDamp: 0.05, angDamp: 0.05 });
      const home = [x, T.height(x) + 1.75];
      body.set(home[0], home[1], 0);
      Z.ball = this.addProp({ id: chunkId(c, 70), kind: 'ball', body, home, alive: true, hits: 0, lastHit: 0, respawn: 0, ent: this.ent(this.meshes.cage, this.mat, 'cageBall') }, Z);
    }
    // the teeter-totter: a plank pinned on a stone wedge, a barrel waiting on its high end
    if (S.teeter !== null) {
      const x = S.teeter, g = T.height(x), py = g + 1.15;
      const shapes = [];
      for (let s = -3.4; s <= 3.41; s += 0.5) shapes.push([s, 0, 0.2]);
      const side = (c & 1) ? 1 : -1; // which end rests on the ground
      const body = new Body({ mass: 70, shapes, inertia: 70 * 4.5, restitution: 0.05, friction: 0.9, kind: 'plank', linDamp: 0.05, angDamp: 0.6 });
      body.set(x, py, 0.36 * side);
      body.pin = { x, y: py, limit: 0.42, rest: 0.36 * side, k: 0.02 }; // a counterweight settles it back
      body.oneWay = true; // you can drive onto it from above, or under its raised end
      const piv = this.ent(this.meshes.pivot, this.mat, 'pivot', 0, Z);
      piv.setPosition(x, g - 0.05, -0.2);
      Z.teeter = this.addProp({ id: chunkId(c, 90), kind: 'plank', body, home: [x, py], alive: true, ent: this.ent(this.meshes.plank, this.mat, 'plank') }, Z);
    }
    // crates (not physics: a glowing pickup)
    S.crates.forEach((x, i) => {
      const id = chunkId(c, 80 + i);
      const C = { id, x, y: T.height(x) + 1.3, ent: this.ent(this.meshes.crate, this.mat, 'crate', 0, Z), halo: this.ent(this.meshes.halo, this.glow, 'crateHalo', 0.6, Z), alive: true, respawn: 0, asked: 0 };
      Z.crates.push(C); this.crates.set(id, C);
    });
    // pond geysers: 0 idle, 1 bubbling, 2 blast
    S.geysers.forEach((x, i) => {
      const id = chunkId(c, 85 + i), G = { id, x, y: S.pond.waterY, phase: 0, t: 3 + i * 1.7 + ((c * 13) % 5) };
      Z.geysers.push(G); this.geysers.set(id, G);
    });
    // a tornado wandering the meadow
    if (S.tornado) { Z.funnel = this.ent(this.meshes.funnel, this.dust, 'tornado', 0, Z); Z.funnel.render.meshInstances[0].cull = false; }
    // hats waiting to be found
    for (const h of S.hats) {
      if (this.ownedHats.has(h.id)) continue;
      let y;
      if (h.pillar) y = pillarTop(S) + 0.7;
      else if (h.abs) y = h.y;
      else if (h.foot !== undefined) y = T.height(h.foot) + h.y;
      else y = T.height(h.x) + h.y;
      const e = this.ent(hatMesh(this.app.graphicsDevice, h.id), this.mat, 'hatPickup', 0, Z);
      e.setLocalScale(1.5, 1.5, 1.5);
      const halo = this.ent(this.meshes.halo, this.glow, 'hatHalo', 0.5, Z);
      halo.setLocalScale(0.8, 0.8, 1);
      Z.hats.push({ id: h.id, x: h.x, y, ent: e, halo, got: false });
    }
  }

  unloadChunk(c, Z) {
    for (const P of Z.props) if (P.alive !== false || this.dyn.has(P.id)) { this.physics.remove(P.body); this.dyn.delete(P.id); if (P.ent) P.ent.destroy(); P.ent = null; }
    for (const Tr of Z.trees) { this.trees.delete(Tr.id); if (Tr.log) { this.removeProp(Tr.log); this.loose = this.loose.filter((L) => L !== Tr.log); } }
    for (const C of Z.crates) this.crates.delete(C.id);
    for (const G of Z.geysers) this.geysers.delete(G.id);
    if (Z.slide) this.slides.delete(Z.slide.id);
    for (const o of Z.statics) this.physics.statics.remove(o);
    for (const e of Z.ents) e.destroy();
    this.chunks.delete(c);
  }

  // lists across the loaded chunks (bots, spawns and the game read these)
  *each(key) { for (const Z of this.chunks.values()) yield* Z[key]; }
  get barrels() { const out = []; for (const Z of this.chunks.values()) for (const P of Z.props) if (P.kind === 'barrel') out.push(P); return out; }
  get balls() { const out = []; for (const Z of this.chunks.values()) if (Z.ball) out.push(Z.ball); return out; }
  get ramps() { const out = []; for (const Z of this.chunks.values()) out.push(...Z.S.ramps); return out; }
  get bowls() { const out = []; for (const Z of this.chunks.values()) if (Z.S.bowl) out.push(Z.S.bowl); return out; }

  // ---------------------------------------------------------------- skeletons, bones, pumpkins
  skeletonEnt() {
    const root = new pc.Entity('skeleton');
    const part = (mesh, name, x, y, z) => { const e = new pc.Entity(name); e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, this.paint)], layers: [this.layer.id], castShadows: false, receiveShadows: false }); e.setLocalPosition(x, y, z); root.addChild(e); return e; };
    part(this.spook.torso, 'torso', 0, 0.05, 0);
    root.legs = [part(this.spook.leg, 'legL', 0, -0.4, -0.12), part(this.spook.leg, 'legR', 0, -0.4, 0.12)];
    root.arms = [part(this.spook.arm, 'armL', 0, 0.42, -0.26), part(this.spook.arm, 'armR', 0, 0.42, 0.26)];
    this.app.root.addChild(root);
    return root;
  }
  /** a skeleton breaks into its bones (host): a skull, the ribs and four long bones, all flying */
  shatter(P, by, vx = 0, vy = 0) {
    if (!this.isHost || P.alive === false || P.kind !== 'skeleton') return;
    const b = P.body;
    P.alive = false; P.heldBy = null; P.thrown = false; P.body.enabled = false; P.respawn = 14 + Math.random() * 8;
    this.hooks.sound('bones', { x: b.p[0] });
    for (let i = 0; i < 8; i++) this.fx.add({ kind: 'dust', x: b.p[0] + (Math.random() - 0.5), y: b.p[1] - 0.5 + Math.random() * 1.4, z: 0.6, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, t: 0, life: 0.8, size: 0.5 });
    const parts = ['skull', 'ribs', 'bone', 'bone', 'bone', 'bone'], ys = [0.6, 0.15, -0.3, -0.5, -0.7, 0.3];
    parts.forEach((part, i) => this.spawnBone(part, b.p[0] + (Math.random() - 0.5) * 0.4, b.p[1] + ys[i], vx * (0.6 + Math.random() * 0.6) + (Math.random() - 0.5) * 5, Math.abs(vy) * 0.4 + 3 + Math.random() * 5, by));
    if (by) this.hooks.smashed && this.hooks.smashed('bones', by);
  }
  spawnBone(part, x, y, vx, vy, by, id = null) {
    const body = new Body({ mass: boneMass(part), shapes: boneShapes(part), inertia: boneMass(part) * 0.12, restitution: 0.3, friction: 0.6, kind: 'bone', linDamp: 0.05, angDamp: 0.3 });
    body.set(x, y, Math.random() * 6.28);
    body.v[0] = vx; body.v[1] = vy; body.w = (Math.random() - 0.5) * 14;
    const P = this.addProp({ id: id ?? this.nextDyn++, kind: 'bone', part, body, alive: true, by, life: 22, ent: this.ent(this.spook[part], this.paint, part) });
    this.loose.push(P);
    return P;
  }
  /** a pumpkin or melon bursts (host): pulp everywhere, it grows back later */
  splat(P, by) {
    if (!this.isHost || P.alive === false || P.kind !== 'pumpkin') return;
    P.alive = false; P.heldBy = null; P.thrown = false; P.body.enabled = false; P.respawn = 18 + Math.random() * 10;
    this.splatFx(P);
    this.net.send('splat', { id: P.id });
    if (by) this.hooks.smashed && this.hooks.smashed('splat', by);
  }
  /** a guest's copy: the host splatted it */
  onSplat(msg) { const P = this.dyn.get(msg.id); if (P && !this.isHost) { this.splatFx(P); P.alive = false; P.body.enabled = false; } }
  splatFx(P) {
    const b = P.body, melon = P.variant === 'melon', s = P.size || 1;
    this.hooks.sound('splat', { x: b.p[0] });
    const cols = melon ? [[120, 40, 35], [70, 90, 40], [30, 25, 20]] : [[150, 80, 25], [120, 60, 20], [190, 150, 80]];
    for (let i = 0; i < 26 * s; i++) { const a = Math.random() * Math.PI; const sp = 3 + Math.random() * 8; this.fx.add({ kind: 'pulp', col: cols[i % 3], x: b.p[0], y: b.p[1], z: 0.8, vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1), vy: Math.sin(a) * sp, t: 0, life: 0.7 + Math.random() * 0.6, size: 0.1 + Math.random() * 0.16, g: -19 }); }
    if (P.variant === 'lantern') this.fx.sparkBurst(b.p[0], b.p[1], 10, 5);
  }
  /** skeletons shuffle about (host): upright, back and forth near their graves, rising again later */
  spookyUpdate(dt, cars, host) {
    for (const Z of this.chunks.values()) for (const P of Z.props) {
      if (P.kind !== 'skeleton' && P.kind !== 'pumpkin') continue;
      const b = P.body;
      if (P.alive === false) {
        if (!host) continue;
        P.respawn -= dt;
        if (P.respawn <= 0 && !cars.some((c) => Math.abs(c.body.p[0] - P.home[0]) < 3)) {
          P.alive = true; P.thrown = false; b.enabled = true; b.kinematic = false; b.noBodyCollide = false;
          b.set(P.home[0], P.home[1] + (P.kind === 'skeleton' ? 0.2 : 1.5), 0); b.v[0] = b.v[1] = 0; b.w = 0;
          if (P.kind === 'skeleton') { P.riseT = 1.5; P.stunT = 0; this.hooks.sound('rumble', { x: P.home[0] }); for (let i = 0; i < 10; i++) this.fx.add({ kind: 'dust', x: P.home[0] + (Math.random() - 0.5) * 1.4, y: P.home[1] - 0.9, z: 0.6, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, t: 0, life: 1, size: 0.6 }); }
        }
        continue;
      }
      if (!host || P.kind !== 'skeleton' || P.heldBy || b.kinematic) continue;
      P.riseT = Math.max(0, (P.riseT || 0) - dt);
      // knocked flat: it falls apart (not while it's still climbing out of its grave)
      if (P.riseT <= 0 && Math.abs(Math.atan2(Math.sin(b.a), Math.cos(b.a))) > 1.15) { this.shatter(P, P.lastBy || null, b.v[0], b.v[1]); continue; }
      // stiff-legged: they stand straight, except for a moment after a hit (when they can topple over)
      P.stunT = Math.max(0, (P.stunT || 0) - dt);
      if (P.stunT <= 0) { b.a = Math.atan2(Math.sin(b.a), Math.cos(b.a)) * Math.max(0, 1 - dt * 10); b.w *= Math.max(0, 1 - dt * 12); }
      P.turnT -= dt;
      // blocked (a car in the way, a slope too steep): after a moment it turns round
      P.walkT = (P.walkT || 0) + dt;
      if (P.walkT > 1.5) { const blocked = Math.abs(b.p[0] - (P.walkX ?? b.p[0] + 9)) < 0.4; P.walkT = 0; P.walkX = b.p[0]; if (blocked) P.turnT = 0; }
      const far = (b.p[0] - P.home[0]) * P.dir > 12;
      if (P.turnT <= 0 || far) { P.dir = -P.dir; P.turnT = 4 + Math.random() * 6; }
      // a shuffling step: moved directly (friction at the feet would just tip it), still a body for cars to hit
      if (b.grounded > 0 && Math.abs(b.v[0]) < 2.5) { const step = P.dir * 0.95 * dt; const ahead = this.terrain.height(b.p[0] + step * 20) - this.terrain.height(b.p[0]); if (ahead < 0.9) { b.p[0] += step; b.updateShapes(); } else P.turnT = 0; }
    }
  }

  // ---------------------------------------------------------------- contacts
  propContact(P, other, sp) {
    const car = other && other.car;
    // a thrown prop goes off when it lands on something
    if (P.thrown && car && car.id !== P.thrownBy && sp > 3 && this.isHost && P.alive && this.hooks.thrownHit) this.hooks.thrownHit(P, car, sp);
    if (P.thrown && sp > 3 && this.isHost && P.alive && (!car || car.id !== P.thrownBy)) {
      if (P.kind === 'barrel') this.light(P, P.thrownBy, 0.05);
      if (P.kind === 'skeleton') this.shatter(P, P.thrownBy, P.body.v[0], P.body.v[1]);
      if (P.kind === 'pumpkin') this.splat(P, P.thrownBy);
      P.thrown = false;
    }
    // a thrown thing (a bone, a pumpkin) hitting a skeleton or a pumpkin breaks it too
    const op = other && other.prop;
    if (this.isHost && op && op.thrown && sp > 4) { if (P.kind === 'skeleton') this.shatter(P, op.thrownBy, other.v[0], other.v[1]); if (P.kind === 'pumpkin') this.splat(P, op.thrownBy); }
    if (!car) {
      if (P.kind === 'barrel' && sp > 11 && this.isHost && P.alive) this.light(P, null);
      return;
    }
    // props are round: a buggy ramming one rides up over it, so the head-on part of the impact
    // understates the hit. Count a solid ram by the buggy's own speed too.
    if (sp > 2.5) sp = Math.max(sp, car.speed * 0.8);
    if (car.saw && sp > 1.5) sp = Math.max(sp, 9); // sawblades bite whatever they touch
    if (this.isHost) {
      if (P.kind === 'barrel' && sp > 7 && P.alive) this.light(P, car.id);
      if (P.kind === 'ball' && sp > 4.5 && this.time - P.lastHit > 0.3) this.ballHit(P, car.id);
      if (P.kind === 'boulder' && P.held) this.releaseSlide(P.slide);
      if (P.kind === 'skeleton') { P.lastBy = car.id; P.stunT = 1.2; if (sp > 6.5) this.shatter(P, car.id, car.body.v[0], car.body.v[1]); }
      if (P.kind === 'pumpkin' && sp > 5) this.splat(P, car.id);
    } else if (car.local) {
      if (this.time - (this.sentHit.get(P.id) || 0) < 0.2) return;
      this.sentHit.set(P.id, this.time);
      this.net.send('hitProp', { id: P.id, sp: r2(sp), v: car.body.v.map(r2), m: car.spec.mass });
      P.body.p[0] += Math.sign(car.body.v[0]) * 0.05; // predicted shove so it feels instant
    }
  }

  onRemoteHit(msg) {
    if (!this.isHost) return;
    const P = this.dyn.get(msg.id);
    if (!P || P.alive === false) return;
    const by = msg.from;
    if (!P.body.kinematic) {
      const k = Math.min(1.2, (msg.m || 180) / P.body.m) * 0.6;
      P.body.v[0] += msg.v[0] * k; P.body.v[1] += Math.abs(msg.v[0]) * k * 0.25 + Math.max(0, msg.v[1]) * k;
      P.body.w += (Math.random() - 0.5) * 3;
    }
    if (P.kind === 'barrel' && msg.sp > 7) this.light(P, by);
    if (P.kind === 'ball' && msg.sp > 4.5 && this.time - P.lastHit > 0.3) this.ballHit(P, by);
    if (P.kind === 'boulder' && P.held) this.releaseSlide(P.slide);
    if (P.kind === 'skeleton') { P.lastBy = by; P.stunT = 1.2; if (msg.sp > 6.5) this.shatter(P, by, msg.v[0], msg.v[1]); }
    if (P.kind === 'pumpkin' && msg.sp > 5) this.splat(P, by);
  }

  /** a punch, a plow, a wrecking ball or a shockwave on a prop: host applies it */
  shove(id, vx, vy, by, sp = 12) {
    const P = this.dyn.get(id);
    if (!P || P.alive === false) return;
    if (!this.isHost) { this.net.send('shoveProp', { id, v: [r2(vx), r2(vy)], sp }); return; }
    if (!P.body.kinematic) { P.body.v[0] += vx; P.body.v[1] += vy; P.body.w += (Math.random() - 0.5) * 6; }
    if (P.kind === 'barrel' && sp > 7) this.light(P, by);
    if (P.kind === 'ball' && this.time - P.lastHit > 0.3) this.ballHit(P, by);
    if (P.kind === 'boulder' && P.held) this.releaseSlide(P.slide);
    if (P.kind === 'skeleton' && sp > 6) this.shatter(P, by, vx, vy);
    if (P.kind === 'pumpkin' && sp > 5) this.splat(P, by);
  }

  treeHit(Tr, b) {
    if (Tr.snapped) return true;
    const car = b.car;
    if (!car) return false;
    if (Math.abs(b.v[0]) < 5.5 && !car.saw) {
      // a slow bump: the tree holds, but keep leaning on it and it creaks over (there is only
      // one lane, so a tree must never be a dead end)
      if (this.time - (Tr.leanAt || 0) > 0.25) Tr.lean = 0;
      Tr.lean = (Tr.lean || 0) + Math.min(0.05, this.time - (Tr.leanAt || this.time));
      Tr.leanAt = this.time;
      if (Tr.lean < 0.7 || Math.abs(car.throttle) < 0.3) return false;
    }
    Tr.lean = 0;
    const dir = Math.sign(b.v[0]) || car.facing;
    if (this.isHost) this.snapTree(Tr, dir, car.id);
    else if (car.local) { this.net.send('snap', { i: Tr.id, dir }); this.hideTree(Tr); }
    if (!car.saw) b.v[0] *= 0.7;
    return true;
  }

  hideTree(Tr) {
    Tr.snapped = true;
    Tr.ent.enabled = false;
    Tr.stump.enabled = true;
    for (const o of Tr.statics) o.off = true;
    Tr.respawn = RESPAWN_SECONDS;
    this.fx.sparkBurst(Tr.x, Tr.g + 1, 6, 4);
    for (let i = 0; i < 8; i++) this.fx.add({ kind: 'debris', x: Tr.x, y: Tr.g + 1 + Math.random(), z: 0.4, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 5, t: 0, life: 1.2, size: 0.15, g: -19, rot: 0, spin: 10 });
    this.hooks.sound('crack', { x: Tr.x });
  }

  snapTree(Tr, dir, by) {
    if (Tr.snapped && Tr.log) return;
    if (!Tr.snapped) this.hideTree(Tr);
    if (this.isHost) this.net.send('snapped', { i: Tr.id });
    // the trunk becomes a log that topples the way it was hit
    const body = new Body({ mass: 80, shapes: logShapes(), inertia: 80 * 1.6, restitution: 0.1, friction: 0.5, kind: 'log', linDamp: 0.05, angDamp: 0.15 });
    body.set(Tr.x + dir * 0.3, Tr.g + 2.6, Math.PI / 2);
    body.w = -dir * 1.6;
    body.v[0] = dir * 2;
    const L = this.addProp({ id: this.nextDyn++, kind: 'log', body, alive: true, tree: Tr, by, life: 12, ent: this.ent(this.meshes.log, this.mat, 'log') });
    Tr.log = L;
    this.loose.push(L);
  }

  light(P, by, fuse = null) {
    if (!P.alive || P.fuse > 0) return;
    P.fuse = fuse ?? 0.25 + Math.random() * 0.45;
    P.by = by;
  }

  ballHit(P, by) {
    if (!P.alive) return;
    P.hits++;
    P.lastHit = this.time;
    P.by = by;
    this.hooks.sound('clang', { x: P.body.p[0] });
    if (P.hits >= 5) {
      P.alive = false;
      P.respawn = RESPAWN_SECONDS;
      P.body.enabled = false;
      this.boom(P.body.p[0], P.body.p[1], 2.4, by);
    }
  }

  releaseSlide(sl) {
    if (!sl || sl.released) return;
    if (!this.isHost) { this.net.send('slide', { i: sl.id }); return; }
    sl.released = true;
    sl.respawn = RESPAWN_SECONDS;
    for (const R of sl.rocks) { if (R.heldBy) continue; R.held = false; R.body.kinematic = false; R.body.v[0] = sl.M.dir * (1 + Math.random()); R.body.w = -sl.M.dir * 2; }
    this.hooks.sound('rumble', { x: sl.M.edge });
    this.net.send('rumble', { x: sl.M.edge });
  }

  /** host: an explosion. Blasts props, lights barrels, tells every client (who push their own cars). */
  boom(x, y, size, by) {
    const msg = { x: r2(x), y: r2(y), s: size, by: by || null };
    this.net.send('boom', msg);
    this.hooks.boom(msg);
    this.physics.blast(x, y, 7 * size, 13 * size, (b) => !!b.prop && !b.kinematic);
    for (const B of this.barrels) if (B.alive && B.fuse <= 0 && Math.hypot(B.body.p[0] - x, B.body.p[1] - y) < 4.2 * size) this.light(B, by);
    for (const Tr of this.trees.values()) if (!Tr.snapped && Math.abs(Tr.x - x) < 3.4 * size && y < Tr.g + 6) this.snapTree(Tr, Math.sign(Tr.x - x) || 1, by);
    for (const sl of this.slides.values()) if (!sl.released && sl.rocks.some((R) => Math.hypot(R.body.p[0] - x, R.body.p[1] - y) < 6 * size)) this.releaseSlide(sl);
    for (const P of this.balls) if (P.alive && Math.hypot(P.body.p[0] - x, P.body.p[1] - y) < 5 * size && this.time - P.lastHit > 0.3) this.ballHit(P, by);
    for (const P of this.dyn.values()) if (P.alive !== false && (P.kind === 'skeleton' || P.kind === 'pumpkin') && Math.hypot(P.body.p[0] - x, P.body.p[1] - y) < 4.5 * size) { if (P.kind === 'skeleton') this.shatter(P, by, (P.body.p[0] - x) * 2, 6); else this.splat(P, by); }
  }

  // ---------------------------------------------------------------- the robot arm: grab, carry, throw
  /** the nearest loose thing a roof arm could pick up: barrels, boulders, logs, mines */
  grabbable(car, reach = 3.4) {
    let best = null, bd = reach;
    const p = car.body.p;
    for (const P of this.dyn.values()) {
      if (P.alive === false || P.heldBy || !P.body.enabled || !['barrel', 'boulder', 'log', 'mine', 'bone', 'skeleton', 'pumpkin'].includes(P.kind)) continue;
      if (P.kind === 'barrel' && P.fuse > 0) continue;
      const dd = Math.hypot(P.body.p[0] - p[0], P.body.p[1] - p[1]);
      if (dd < bd) { bd = dd; best = P; }
    }
    return best;
  }
  grab(P, carId) {
    if (!P || P.heldBy) return;
    if (!this.isHost) { this.net.send('grab', { id: P.id }); P.heldBy = carId; P.body.noBodyCollide = true; return; }
    P.heldBy = carId;
    if (P.kind === 'boulder' && P.held) { P.held = false; }
    P.body.kinematic = true;
    P.body.noBodyCollide = true;
  }
  throw(P, carId, vx, vy) {
    if (!P) return;
    if (!this.isHost) { this.net.send('throw', { id: P.id, v: [r2(vx), r2(vy)] }); P.heldBy = null; P.body.noBodyCollide = false; return; }
    if (P.heldBy !== carId) return;
    P.heldBy = null;
    P.body.kinematic = false;
    P.body.noBodyCollide = false;
    P.body.v[0] = vx; P.body.v[1] = vy; P.body.w = (Math.random() - 0.5) * 8;
    P.thrown = true; P.thrownBy = carId;
  }
  /** host: carry held props over their holders' roofs */
  carry(cars) {
    for (const P of this.dyn.values()) {
      if (!P.heldBy) continue;
      const car = cars.find((c) => c.id === P.heldBy);
      if (!car || car.wrecked) { if (this.isHost) { P.heldBy = null; P.body.kinematic = false; P.body.noBodyCollide = false; } else P.heldBy = null; continue; }
      const a = car.body.a, up = car.carryY || 1.6;
      P.body.set(car.body.p[0] - Math.sin(a) * up, car.body.p[1] + Math.cos(a) * up, a);
      P.body.v[0] = car.body.v[0]; P.body.v[1] = car.body.v[1]; P.body.w = 0;
    }
  }

  // ---------------------------------------------------------------- pickups (each client checks its own cars)
  checkLocal(car, isBot, dt = 1 / 60) {
    if (car.wrecked) return;
    const p = car.body.p;
    for (const C of this.crates.values()) {
      if (!C.alive || Math.abs(p[0] - C.x) > 1.4 || Math.abs(p[1] - C.y) > 1.8) continue;
      if (this.isHost) this.grant(C, car.id);
      else if (this.time - C.asked > 0.5) { C.asked = this.time; this.net.send('pickup', { i: C.id }); }
    }
    if (!isBot) {
      for (const Z of this.chunks.values()) for (const H of Z.hats) {
        if (H.got || Math.hypot(p[0] - H.x, p[1] - H.y) > 1.9) continue;
        H.got = true;
        H.ent.enabled = H.halo.enabled = false;
        this.ownedHats.add(H.id);
        try { localStorage.setItem('hsg.hats', JSON.stringify([...this.ownedHats])); } catch { /* */ }
        this.hooks.hat(H.id);
      }
    }
    // geysers launch whoever is parked over them
    for (const g of this.geysers.values()) {
      if (g.phase !== 2 || Math.abs(p[0] - g.x) > 1.5 || p[1] > g.y + 7) continue;
      if ((car.geyserT || 0) > this.time) continue;
      car.geyserT = this.time + 0.8;
      car.body.v[1] = Math.max(car.body.v[1], 19);
      car.body.w += (Math.random() - 0.5) * 4;
    }
    // boulder mesas: drive in below the ledge and the boulders let go
    if (!isBot) for (const sl of this.slides.values()) if (!sl.released && Math.abs(p[0] - sl.triggerX) < 5) this.releaseSlide(sl);
    // tornadoes and magnet arches act on every local car
    const t = wallT();
    for (const Z of this.chunks.values()) {
      if (Z.S.tornado) {
        const tx = tornadoX(Z.S.tornado, t), g = this.terrain.height(tx);
        if (Math.abs(p[0] - tx) < 2.6 && p[1] < g + 13) {
          const b = car.body, dir = Math.sin(t * 3 + Z.S.tornado.seed) > 0 ? 1 : -1;
          b.v[1] += (p[1] < g + 8 ? 33 : 0) * dt;
          b.v[0] += (tx - p[0]) * 0.08 + (p[1] > g + 9 ? dir * 0.9 : 0);
          b.w += 0.5 * dir;
          car.lastHitT = performance.now(); car.lastHitBy = null;
        }
      }
      if (Z.S.arch !== null && Z.S.arch !== undefined && archPhase(t) === 1) {
        const ax = Z.S.arch, ay = this.terrain.height(ax) + 8, dx = ax - p[0], dy = ay - p[1], dd = Math.hypot(dx, dy);
        if (dd < 20 && dd > 0.5) { const k = 156 * (1 - dd / 20) * dt; car.body.v[0] = car.body.v[0] * (1 - 1.8 * dt) + dx / dd * k; car.body.v[1] = car.body.v[1] * (1 - 1.8 * dt) + dy / dd * k + 19 * dt; }
      }
    }
  }

  onRemotePickup(msg) { if (this.isHost) { const C = this.crates.get(msg.i); if (C && C.alive) this.grant(C, msg.from); } }

  grant(C, to) {
    const g = GADGET_KEYS[Math.floor(Math.random() * GADGET_KEYS.length)];
    const msg = { i: C.id, to, g };
    this.net.send('grant', msg);
    this.hooks.grant(msg);
  }
  onGrant(msg) {
    const C = this.crates.get(msg.i);
    if (!C) return;
    C.alive = false;
    C.respawn = RESPAWN_SECONDS;
    this.fx.sparkBurst(C.x, C.y, 10, 5);
  }

  /** mines (Bomb-Dropper, balloon bombs) and mortar rockets: host-owned loose props */
  spawnProjectile(kind, p, v, owner) {
    if (!this.isHost) { this.net.send('projectile', { k: kind, p: p.map(r2), v: v.map(r2) }); return; }
    if (kind === 'bomb') { this.boom(p[0], p[1], 1.2, owner); return; } // goes off right away (the ejector seat's car)
    if (kind !== 'mine' && kind !== 'rocket') return;
    const rocket = kind === 'rocket';
    const body = new Body({ mass: rocket ? 5 : 8, shapes: [[0, 0, rocket ? 0.18 : 0.28]], restitution: 0.1, friction: 0.9, kind });
    body.set(p[0], p[1], Math.atan2(v[1], v[0]));
    body.v[0] = v[0]; body.v[1] = v[1];
    if (rocket) body.noBodyCollide = true; // a volley's rockets fly through each other; they burst on the ground or beside a car
    const M = this.addProp({ id: this.nextDyn++, kind, body, alive: true, owner, armT: rocket ? 0.25 : 0.7, life: rocket ? 6 : 40, ent: this.ent(this.meshes.mine, this.mat, kind) });
    this.loose.push(M);
    return M;
  }
  dropMine(p, v, owner) { return this.spawnProjectile('mine', p, [v[0] * 0.3, v[1] * 0.3], owner); }

  // ---------------------------------------------------------------- per frame
  update(dt, cars) {
    this.time += dt;
    const host = this.isHost, t = wallT();
    this.stream(cars.filter((c) => host || c.local).map((c) => c.body.p[0]).concat(this.camX ?? []), dt);
    this.carry(cars);
    this.spookyUpdate(dt, cars, host);
    // barrels: fuses, respawn
    for (const B of this.barrels) {
      if (B.alive && B.fuse > 0) {
        B.fuse -= dt;
        if (Math.random() < dt * 30) this.fx.sparkBurst(B.body.p[0], B.body.p[1] + 0.5, 1, 3);
        if (B.fuse <= 0 && host) { B.alive = false; B.heldBy = null; B.respawn = RESPAWN_SECONDS; B.body.enabled = false; this.boom(B.body.p[0], B.body.p[1], 1.1, B.by); }
      }
      if (!B.alive && host) {
        B.respawn -= dt;
        if (B.respawn <= 0 && !cars.some((c) => Math.abs(c.body.p[0] - B.home[0]) < 3)) {
          B.alive = true; B.fuse = 0; B.thrown = false; B.body.enabled = true; B.body.kinematic = false; B.body.noBodyCollide = false; B.body.set(B.home[0], B.home[1] + 2, 0); B.body.v[0] = B.body.v[1] = 0; B.body.w = 0;
        }
      }
    }
    // trees regrow, logs rot away
    for (const Tr of this.trees.values()) {
      if (!Tr.snapped) continue;
      Tr.respawn -= dt;
      if (Tr.respawn <= 0 && (host || !this.net.online)) {
        if (cars.some((c) => Math.abs(c.body.p[0] - Tr.x) < 3)) { Tr.respawn = 2; continue; }
        this.regrow(Tr);
        if (host) this.net.send('regrow', { i: Tr.id });
      }
    }
    if (host) for (let i = this.loose.length - 1; i >= 0; i--) {
      const L = this.loose[i];
      if ((L.kind !== 'log' && L.kind !== 'bone') || L.heldBy) continue;
      L.life -= dt;
      if (L.life <= 0) { if (L.tree && L.tree.log === L) L.tree.log = null; this.removeProp(L); this.loose.splice(i, 1); }
    }
    // mesas reset
    for (const sl of this.slides.values()) {
      if (!sl.released || !host) continue;
      sl.respawn -= dt;
      if (sl.respawn <= 0) this.resetSlide(sl);
    }
    // cage-balls
    if (host) for (const P of this.balls) if (!P.alive) { P.respawn -= dt; if (P.respawn <= 0) { P.alive = true; P.hits = 0; P.body.enabled = true; P.body.set(P.home[0], P.home[1] + 3, 0); P.body.v[0] = P.body.v[1] = 0; } }
    // crates
    for (const C of this.crates.values()) { if (!C.alive && host) { C.respawn -= dt; if (C.respawn <= 0) C.alive = true; } }
    // mines and rockets
    for (let i = this.loose.length - 1; i >= 0; i--) {
      const M = this.loose[i];
      if (M.kind !== 'mine' && M.kind !== 'rocket') continue;
      M.armT -= dt; M.life -= dt;
      if (M.kind === 'rocket' && M.alive !== false) { const b = M.body; if (!b.kinematic) b.a = Math.atan2(b.v[1], b.v[0]); if (Math.random() < dt * 40) this.fx.sparkBurst(b.p[0], b.p[1], 1, 2); }
      if (!host || M.heldBy) continue;
      const b = M.body;
      const near = cars.some((c) => !c.wrecked && (M.kind !== 'rocket' || c.id !== M.owner) && Math.hypot(c.body.p[0] - b.p[0], c.body.p[1] - b.p[1]) < (M.kind === 'rocket' ? 1.9 : 1.5));
      const landed = M.kind === 'rocket' && M.armT <= 0 && (b.grounded > 0 || b.lastImpact > 2);
      if (M.life <= 0 || (M.armT <= 0 && near) || landed) { this.removeProp(M); this.loose.splice(i, 1); this.boom(b.p[0], b.p[1], M.kind === 'rocket' ? 0.6 : 1.0, M.owner); }
    }
    // geysers (host clock)
    for (const g of this.geysers.values()) {
      g.t -= dt;
      if (!host) continue;
      if (g.t <= 0) {
        g.phase = (g.phase + 1) % 3;
        g.t = g.phase === 0 ? 4 + Math.random() * 4 : g.phase === 1 ? 1.6 : 0.8;
        if (g.phase === 2) this.hooks.sound('geyser', { x: g.x });
      }
      if (g.phase === 2) this.physics.blast(g.x, g.y - 1, 2.2, 6, (b) => !!b.prop && !b.kinematic && Math.abs(b.p[0] - g.x) < 1.6);
    }
    for (const g of this.geysers.values()) {
      if (g.phase === 1 && Math.random() < dt * 12) this.fx.steam(g.x, g.y, 1, 1.5);
      if (g.phase === 2 && Math.random() < dt * 40) this.fx.steam(g.x, g.y, 2, 14);
    }
    // tornadoes and magnet arches (host moves the props; every client moves its own cars)
    const arch = archPhase(t);
    for (const Z of this.chunks.values()) {
      const S = Z.S;
      if (S.tornado && Z.funnel) {
        const tx = tornadoX(S.tornado, t), g = this.terrain.height(tx);
        Z.funnel.setPosition(tx, g - 0.3, 0.4);
        Z.funnel.setEulerAngles(0, (t * 220) % 360, Math.sin(t * 1.3) * 4);
        if (Math.random() < dt * 25) this.fx.dust(tx + (Math.random() - 0.5) * 3, g, 1, Math.random() < 0.5 ? 1 : -1);
        if (host) for (const P of Z.props) { const b = P.body; if (!b.kinematic && b.enabled && Math.abs(b.p[0] - tx) < 2.4 && b.p[1] < g + 12) { b.v[1] += 30 * dt; b.v[0] += (tx - b.p[0]) * 0.1; b.w += 0.4; } }
      }
      if (S.arch !== null && S.arch !== undefined) {
        const ax = S.arch, ay = this.terrain.height(ax) + 8;
        if (arch === 1) {
          if (Math.random() < dt * 20) this.fx.sparkBurst(ax + (Math.random() - 0.5) * 2, ay - 1.6 + (Math.random() - 0.5), 1, 2);
          if (host) for (const P of this.dyn.values()) {
            const b = P.body; if (b.kinematic || !b.enabled) continue;
            const dx = ax - b.p[0], dy = ay - b.p[1], dd = Math.hypot(dx, dy);
            if (dd < 20 && dd > 0.4) { b.v[0] = b.v[0] * 0.96 + dx / dd * 26 * dt; b.v[1] = b.v[1] * 0.96 + dy / dd * 26 * dt + 19 * dt; }
          }
          if (!Z.archOn) { Z.archOn = true; this.fx.ring(ax, ay, 20, 0.7, 30); this.hooks.sound('glitch', { x: ax }); }
        } else Z.archOn = false;
      }
    }
    // visuals
    for (const P of this.dyn.values()) this.syncProp(P);
    for (const C of this.crates.values()) { C.ent.enabled = C.halo.enabled = C.alive; if (C.alive) { const y = C.y + Math.sin(this.time * 2 + C.x) * 0.15; C.ent.setPosition(C.x, y, 0); C.ent.setEulerAngles(0, this.time * 40 + C.x * 30, 0); C.halo.setPosition(C.x, y, 0.6); const s = 1.0 + Math.sin(this.time * 3 + C.x) * 0.1; C.halo.setLocalScale(s, s, 1); } }
    for (const Z of this.chunks.values()) for (const H of Z.hats) if (!H.got) { const y = H.y + Math.sin(this.time * 1.7 + H.x) * 0.2; H.ent.setPosition(H.x, y, 0); H.ent.setEulerAngles(0, this.time * 70, 0); H.halo.setPosition(H.x, y + 0.2, 0.5); }
    // network: host broadcasts what moved
    if (host && this.net.online) {
      this.sendT -= dt; this.fullT -= dt;
      if (this.sendT <= 0) { this.sendT = 0.1; this.sendWorld(this.fullT <= 0); if (this.fullT <= 0) this.fullT = 2; }
    }
    // client: glide kinematic copies toward the host's latest positions
    if (!host) for (const P of this.dyn.values()) if (P.target && !P.heldBy) { const b = P.body, k = Math.min(1, dt * 12); b.p[0] += (P.target[0] - b.p[0]) * k; b.p[1] += (P.target[1] - b.p[1]) * k; let da = P.target[2] - b.a; da = Math.atan2(Math.sin(da), Math.cos(da)); b.a += da * k; b.updateShapes(); }
  }

  syncProp(P) {
    const e = P.ent;
    if (!e) return;
    const on = P.alive !== false && P.body.enabled;
    e.enabled = on;
    if (!on) return;
    const b = P.body;
    e.setPosition(b.p[0], b.p[1], P.kind === 'plank' ? -0.32 : 0);
    e.setEulerAngles(0, P.kind === 'barrel' || P.kind === 'mine' ? 20 : 0, (b.a * 180) / Math.PI);
    if (P.kind === 'skeleton') { // a stiff shuffle: legs swing, arms reach forward and sway
      const dtA = Math.min(0.1, Math.max(0, this.time - (P.animT ?? this.time))), vx = P.lastX === undefined || dtA <= 0 ? 0 : (b.p[0] - P.lastX) / dtA;
      P.animT = this.time; P.lastX = b.p[0];
      if (Math.abs(vx) > 0.15) P.face = Math.sign(vx);
      P.phase = (P.phase || 0) + Math.min(2.5, Math.abs(vx)) * dtA * 3.2;
      const sw = Math.sin(P.phase) * 0.55 * Math.min(1, Math.abs(vx) + (P.heldBy ? 1 : 0));
      e.setLocalScale(P.face || 1, 1, 1);
      e.legs[0].setLocalEulerAngles(0, 0, sw * 57); e.legs[1].setLocalEulerAngles(0, 0, -sw * 57);
      e.arms[0].setLocalEulerAngles(0, 0, 70 - sw * 25); e.arms[1].setLocalEulerAngles(0, 0, 80 + sw * 25);
    }
    if (P.kind === 'rocket') e.setLocalScale(0.6, 1.4, 0.6);
  }

  regrow(Tr) {
    Tr.snapped = false;
    Tr.ent.enabled = true;
    Tr.stump.enabled = false;
    for (const o of Tr.statics) o.off = false;
    if (Tr.log) { this.removeProp(Tr.log); this.loose = this.loose.filter((L) => L !== Tr.log); Tr.log = null; }
  }

  resetSlide(sl) {
    sl.released = false;
    for (const R of sl.rocks) { R.held = true; R.heldBy = null; R.body.kinematic = true; R.body.noBodyCollide = false; R.body.enabled = true; R.alive = true; R.body.set(R.home[0], R.home[1], 0); R.body.v[0] = R.body.v[1] = 0; R.body.w = 0; }
  }

  // ---------------------------------------------------------------- host -> clients
  sendWorld(full) {
    const b = [];
    for (const P of this.dyn.values()) {
      if (P.alive === false && !full) continue;
      const B = P.body;
      const moved = P.heldBy || (!B.kinematic && (Math.abs(B.v[0]) + Math.abs(B.v[1]) + Math.abs(B.w) > 0.05));
      if (!full && !moved) continue;
      b.push([P.id, r2(B.p[0]), r2(B.p[1]), r2(B.a), P.alive === false ? 0 : 1, P.kind === 'log' ? (P.tree ? P.tree.id : 0) : P.kind === 'mine' ? -2 : P.kind === 'rocket' ? -3 : P.kind === 'bone' ? -10 - BONE_PARTS.indexOf(P.part) : -1, P.heldBy || 0, P.thrown ? P.thrownBy : 0]);
    }
    const trees = [], crates = [], slides = [], balls = [], geysers = [];
    for (const Tr of this.trees.values()) if (Tr.snapped) trees.push(Tr.id);
    for (const C of this.crates.values()) if (!C.alive) crates.push(C.id);
    for (const sl of this.slides.values()) if (sl.released) slides.push(sl.id);
    for (const P of this.balls) balls.push([P.id, P.hits]);
    for (const g of this.geysers.values()) geysers.push([g.id, g.phase, r2(g.t)]);
    this.net.send('world', { b, full: full ? 1 : 0, act: this.activeChunks, tr: trees, cr: crates, sl: slides, bh: balls, g: geysers, gone: this.gone.splice(0) });
  }

  applyWorld(msg) {
    if (this.isHost) return;
    const act = new Set(msg.act || []);
    // props the host has removed (exploded mines and rockets, rotted logs): drop our copies too
    const drop = (P) => { if (P.tree && P.tree.log === P) P.tree.log = null; this.removeProp(P); this.loose = this.loose.filter((L) => L !== P); };
    for (const id of msg.gone || []) { const P = this.dyn.get(id); if (P) drop(P); }
    if (msg.full) { // and anything born during play that the host no longer has at all
      const listed = new Set(msg.b.map((r) => r[0]));
      for (const P of [...this.loose]) if (!listed.has(P.id) && act.has(chunkOf(P.body.p[0]))) drop(P);
    }
    for (const [id, x, y, a, alive, extra, holder, thrownBy] of msg.b) {
      let P = this.dyn.get(id);
      if (!P && extra <= -10 && alive) { // a bone from a skeleton the host shattered
        if (!this.chunks.has(chunkOf(x))) continue;
        P = this.spawnBone(BONE_PARTS[-10 - extra] || 'bone', x, y, 0, 0, null, id);
        P.body.kinematic = true;
      }
      if (!P && extra !== -1 && alive) {
        if (!this.chunks.has(chunkOf(x))) continue;
        // a prop born on the host: a log (extra = tree id), a mine (-2) or a rocket (-3)
        if (extra >= 0) {
          const Tr = this.trees.get(extra);
          if (Tr && !Tr.snapped) this.hideTree(Tr);
          const body = new Body({ mass: 80, shapes: logShapes(), kind: 'log' });
          body.set(x, y, a);
          P = { id, kind: 'log', body, alive: true, tree: Tr, ent: this.ent(this.meshes.log, this.mat, 'log') };
          if (Tr) Tr.log = P;
        } else {
          const kind = extra === -3 ? 'rocket' : 'mine';
          const body = new Body({ mass: 8, shapes: [[0, 0, kind === 'rocket' ? 0.18 : 0.28]], kind });
          body.set(x, y, a);
          P = { id, kind, body, alive: true, ent: this.ent(this.meshes.mine, this.mat, kind) };
        }
        this.addProp(P);
        this.loose.push(P);
      }
      if (!P) continue;
      P.target = [x, y, a];
      P.heldBy = holder || null;
      P.thrown = !!thrownBy; P.thrownBy = thrownBy || null;
      P.body.noBodyCollide = !!holder;
      if (msg.full && P.ent === null) continue;
      const was = P.alive !== false;
      P.alive = !!alive;
      if (P.kind === 'skeleton' && was && !alive) { const b = P.body; for (let i = 0; i < 8; i++) this.fx.add({ kind: 'dust', x: b.p[0], y: b.p[1] - 0.4 + Math.random(), z: 0.6, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, t: 0, life: 0.8, size: 0.5 }); this.hooks.sound('bones', { x: b.p[0] }); }
      if ((P.kind === 'mine' || P.kind === 'rocket' || P.kind === 'log' || P.kind === 'bone') && was && !alive) { if (P.tree && P.tree.log === P) P.tree.log = null; this.removeProp(P); }
      if (P.kind === 'barrel' || P.kind === 'ball' || P.kind === 'skeleton' || P.kind === 'pumpkin') P.body.enabled = !!alive;
      if (!was && alive) P.body.set(x, y, a);
    }
    const inAct = (id) => act.has(Math.floor(id / 100) - 50000);
    if (msg.tr) { const s = new Set(msg.tr); for (const Tr of this.trees.values()) { if (!inAct(Tr.id)) continue; const snapped = s.has(Tr.id); if (snapped && !Tr.snapped) this.hideTree(Tr); else if (!snapped && Tr.snapped) this.regrow(Tr); } }
    if (msg.cr) { const s = new Set(msg.cr); for (const C of this.crates.values()) if (inAct(C.id)) C.alive = !s.has(C.id); }
    if (msg.sl) { const s = new Set(msg.sl); for (const sl of this.slides.values()) if (inAct(sl.id)) sl.released = s.has(sl.id); }
    if (msg.bh) for (const [id, hits] of msg.bh) { const P = this.dyn.get(id); if (P) P.hits = hits; }
    if (msg.g) for (const [id, ph, t] of msg.g) { const g = this.geysers.get(id); if (g) { g.phase = ph; g.t = t; } }
  }

  /** water bulges for the pond surfaces */
  gushes() {
    const out = [];
    for (const g of this.geysers.values()) out.push({ x: g.x, k: g.phase === 1 ? 0.15 + Math.sin(this.time * 20) * 0.05 : g.phase === 2 ? 1.6 : 0 });
    return out;
  }
}

function logShapes() { const s = []; for (let x = -2.1; x <= 2.11; x += 0.7) s.push([x, 0, 0.34]); return s; }

export { HAT_SPOTS, CHUNK };

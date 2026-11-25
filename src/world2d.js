// The glade from the side: a terrain profile for physics, plus layered silhouette scenery
// (foreground trunks, the play plane, four fog-washed forest layers behind), drifting fog banks,
// the pond and the sky. Static scenery is baked into a few big meshes per 60 m chunk.
import * as pc from 'playcanvas';
import { CHUNK, WORLD_SEED, chunkSpec, chunkOf, base, featureHeight, waterAt, mulberry, pillarTop, mapInfo } from './gen.js';
import { CLS } from './shaders.js';
import { MeshBuilder, rgba, deadTreeMesh, pineMesh, rockMesh, grassTuftMesh, quadMesh, addBox, addLathe, addTube } from './meshes.js';
import { silMaterial, skyMaterial, fogMaterial, tintMaterial, glowMaterial } from './sil.js';
import { tombstoneMesh, crossMesh, cryptMesh, fenceMesh, chapelMesh, houseMesh, scarecrowMesh, lanternPostMesh, smallLanternMesh, batMesh } from './spooky.js';


/** The ground profile, sampled lazily per chunk from the generator (physics asks a lot). */
export class Terrain {
  constructor(seed = WORLD_SEED) {
    this.seed = seed;
    this.step = 0.25;
    this.n = CHUNK / this.step;
    this.chunks = new Map(); // c -> Float32Array(n + 1)
    this.lastC = null; this.lastA = null;
  }

  samples(c) {
    if (c === this.lastC) return this.lastA;
    let a = this.chunks.get(c);
    if (!a) {
      a = new Float32Array(this.n + 1);
      const S = chunkSpec(c, this.seed), x0 = c * CHUNK;
      for (let i = 0; i <= this.n; i++) { const x = x0 + i * this.step; a[i] = featureHeight(S, x, base(x)); }
      this.chunks.set(c, a);
      if (this.chunks.size > 64) { for (const k of this.chunks.keys()) { if (Math.abs(k - c) > 16) this.chunks.delete(k); } }
    }
    this.lastC = c; this.lastA = a;
    return a;
  }

  height(x) {
    const c = Math.floor(x / CHUNK), a = this.samples(c);
    const f = (x - c * CHUNK) / this.step;
    const i = Math.min(this.n - 1, Math.max(0, Math.floor(f)));
    return a[i] + (a[i + 1] - a[i]) * (f - i);
  }
  slope(x) { return (this.height(x + 0.2) - this.height(x - 0.2)) / 0.4; }
  normal(x, out) { const s = this.slope(x), l = Math.hypot(s, 1); out[0] = -s / l; out[1] = 1 / l; return out; }
  water(x) { return waterAt(x, this.seed); }
  spec(x) { return chunkSpec(chunkOf(x), this.seed); }
}

// background forest layers: z, tree spacing, scale, ground lift, how closely the hill follows the
// play terrain. The camera looks slightly down at the cars, so far ground appears higher on screen:
// the near hills sit below the play plane's ground line, which leaves the buggies standing against
// the bright far fog (as on the title screen) instead of against a dark hill.
const LAYERS = [
  { z: -6, gap: 9, s: [1.0, 1.5], lift: -1.7, follow: 0.85, seed: 11, pine: 0.1 },
  { z: -15, gap: 6.5, s: [1.1, 1.7], lift: -3.0, follow: 0.7, seed: 23, pine: 0.25 },
  { z: -30, gap: 5, s: [1.3, 2.0], lift: -3.2, follow: 0.45, seed: 37, pine: 0.35 },
  { z: -55, gap: 4, s: [1.6, 2.4], lift: -3.5, follow: 0.25, seed: 51, pine: 0.45 },
];

const chash = (c, k) => { let h = Math.imul((c | 0) ^ 0x5bd1e995, 0x27d4eb2d) ^ Math.imul(k | 0, 0x165667b1); h ^= h >>> 15; return h >>> 0; };
const KEEP = 3; // chunks kept either side of the camera (far forest layers reach about 2 chunks)
const theme = () => mapInfo().theme || 'glade';

export class World2D {
  constructor(app, layer, tier) {
    this.app = app;
    this.device = app.graphicsDevice;
    this.layer = layer;
    this.tier = tier;
    this.terrain = new Terrain();
    this.mats = {
      ground: silMaterial({ cls: CLS.GROUND }),
      scenery: silMaterial({ sway: 0.35 }),
      stone: silMaterial({ cls: CLS.STONE }),
      sky: skyMaterial(),
      water: tintMaterial(),
      waterLine: glowMaterial(0.8),
    };
    this.fogMats = [];
    this.fogEnts = [];
    this.time = 0;
    this.chunks = new Map(); // c -> { ents: [], waters: [], stage }
    this.queue = []; // [c, stage] build jobs, nearest first
    this.camC = 0;
    this.fogY = 0;
    const T = this.terrain;
    this.layers = LAYERS.map((L) => {
      const rng = mulberry(L.seed);
      const ph = rng() * 10, f1 = 0.02 + rng() * 0.02, f2 = 0.07 + rng() * 0.04, amp = 0.5 + -L.z * 0.03;
      const raw = (x) => T.height(x) * L.follow + L.lift + Math.sin(x * f1 + ph) * amp + Math.sin(x * f2 + ph * 2) * 0.4;
      // each map's horizon has its own shape (the colours never change): moon crags, a flat marsh,
      // terraced quarry walls, or the glade's rolling hills
      const fn = (x) => {
        const th = theme();
        if (th === 'moon') return raw(x) - 1.2 + (1 - Math.abs(Math.sin(x * 0.03 + ph))) ** 5 * (4 + -L.z * 0.16) + (1 - Math.abs(Math.sin(x * 0.09 + ph * 3))) ** 6 * 1.6;
        if (th === 'bog') return T.height(x) * L.follow * 0.35 + L.lift - 0.5 + Math.sin(x * f1 + ph) * amp * 0.22;
        if (th === 'graveyard') return raw(x) * 0.8 - 0.3 + Math.max(0, Math.sin(x * 0.21 + ph)) ** 8 * 0.6; // low hills, the odd burial mound
        if (th === 'hallow') return raw(x) * 0.9 + Math.sin(x * 0.015 + ph) * (1 + -L.z * 0.05);
        if (th === 'quarry') { const h = raw(x) + 1.5 + Math.sin(x * 0.012 + ph) * (2 + -L.z * 0.06); const step = 2.4 + -L.z * 0.02; return Math.round(h / step) * step - 1.5; }
        return raw(x);
      };
      return { ...L, fn };
    });
    this.meshes = {
      dead: [deadTreeMesh(null, 31), deadTreeMesh(null, 77), deadTreeMesh(null, 13), deadTreeMesh(null, 5)],
      pine: pineMesh(null), rock: rockMesh(null, 9), rock2: rockMesh(null, 23), grass: grassTuftMesh(null),
      headframe: headframeMesh(), crane: craneMesh(), post: postMesh(),
      tomb: tombstoneMesh(), cross: crossMesh(), crypt: cryptMesh(), fence: fenceMesh(), chapel: chapelMesh(),
      house: [houseMesh(1), houseMesh(2), houseMesh(3)], scarecrow: scarecrowMesh(), lampPost: lanternPostMesh(), jack: smallLanternMesh(), bat: batMesh(),
    };
  }

  steps() {
    return [
      ['painting the sky', () => this.buildSky()],
      ['rolling in the fog', () => this.buildFog()],
      ['shaping the hills', () => { for (const c of [-1, 0]) this.buildChunk(c); }],
      ['growing dead trees', () => { for (const c of [-2, 1]) this.buildChunk(c); }],
    ];
  }

  addEntity(name, mesh, mat, { cull = true, aabb, owner } = {}) {
    const mi = new pc.MeshInstance(mesh, mat);
    if (!cull) mi.cull = false;
    if (aabb) mi.setCustomAabb(aabb);
    const e = new pc.Entity(name);
    e.addComponent('render', { meshInstances: [mi], layers: [this.layer.id], castShadows: false, receiveShadows: false });
    if (aabb) e.render.meshInstances[0].setCustomAabb(aabb); // dynamic meshes (the ponds): their bounds, or they get culled
    this.app.root.addChild(e);
    if (owner) owner.ents.push(e);
    return e;
  }

  buildSky() {
    this.addEntity('sky', quadMesh(this.device), this.mats.sky, { cull: false });
  }

  /** a filled ground profile at depth z, from fn(x) down to y = -60 */
  groundStrip(mb, fn, z, x0, x1, step = 0.5, cls = CLS.GROUND) {
    const col = rgba(0, 0, 0, cls);
    for (let x = x0; x < x1 - 1e-6; x += step) {
      const xa = x, xb = Math.min(x1, x + step);
      const a = mb.vert(xa, fn(xa), z, 0, 0, 1, col), b = mb.vert(xb, fn(xb), z, 0, 0, 1, col);
      const c = mb.vert(xb, -60, z, 0, 0, 1, col), d = mb.vert(xa, -60, z, 0, 0, 1, col);
      mb.tri(a, d, c); mb.tri(a, c, b);
    }
  }

  // ---------------------------------------------------------------- chunk streaming
  /** Call every frame with the camera x: queues chunks coming into view, frees ones far behind. */
  stream(camX, budgetMs = 4) {
    const cc = chunkOf(camX);
    if (cc !== this.camC || !this.chunks.size) {
      this.camC = cc;
      for (const [c, C] of this.chunks) if (Math.abs(c - cc) > KEEP + 1) this.freeChunk(c, C);
      const want = [];
      for (let k = 0; k <= KEEP; k++) for (const c of k ? [cc + k, cc - k] : [cc]) if (!this.chunks.has(c)) want.push(c);
      for (const c of want) { this.chunks.set(c, { ents: [], waters: [], stage: 0 }); for (let st = 0; st < 7; st++) this.queue.push([c, st]); }
      // nearest chunk first, ground before trees
      this.queue.sort((a, b) => Math.abs(a[0] - cc) - Math.abs(b[0] - cc) || a[1] - b[1]);
    }
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const [c, st] = this.queue.shift();
      const C = this.chunks.get(c);
      if (C) this.buildStage(c, C, st);
    }
  }

  /** a new map: forget every built chunk and the terrain samples; the new layout streams in */
  resetChunks() {
    if (this.marshFog) this.marshFog.enabled = theme() === 'bog';
    for (const [c, C] of [...this.chunks]) this.freeChunk(c, C);
    this.queue = [];
    this.camC = null;
    this.terrain.chunks.clear();
    this.terrain.lastC = null; this.terrain.lastA = null;
  }

  buildChunk(c) {
    const C = { ents: [], waters: [], stage: 0 };
    this.chunks.set(c, C);
    for (let st = 0; st < 7; st++) this.buildStage(c, C, st);
  }

  freeChunk(c, C) {
    for (const e of C.ents) { for (const mi of e.render.meshInstances) mi.mesh.destroy(); e.destroy(); }
    this.chunks.delete(c);
    this.queue = this.queue.filter((j) => j[0] !== c);
  }

  buildStage(c, C, st) {
    const T = this.terrain, x0 = c * CHUNK, x1 = x0 + CHUNK, S = chunkSpec(c), M = this.meshes;
    const rngFor = (k) => mulberry(chash(c, k));
    const done = (mb, name, mat) => { if (mb.count) this.addEntity(name, mb.build(this.device), mat, { owner: C }); };
    if (st === 0) {
      // the play plane's ground: a front face plus a shallow top so it reads as a slab
      const mb = new MeshBuilder();
      this.groundStrip(mb, (x) => T.height(x), 0.9, x0, x1, 0.25);
      this.groundStrip(mb, (x) => T.height(x) - 0.02, -1.6, x0, x1, 0.5);
      const col = rgba(0, 0, 0, CLS.GROUND);
      for (let x = x0; x < x1 - 1e-6; x += 0.5) {
        const a = mb.vert(x, T.height(x), 0.9, 0, 1, 0, col), b = mb.vert(x + 0.5, T.height(x + 0.5), 0.9, 0, 1, 0, col);
        const cc = mb.vert(x + 0.5, T.height(x + 0.5), -1.6, 0, 1, 0, col), d = mb.vert(x, T.height(x), -1.6, 0, 1, 0, col);
        mb.tri(a, b, cc); mb.tri(a, cc, d);
      }
      done(mb, 'ground', this.mats.ground);
      if (S.pond) this.buildWater(S, C);
    } else if (st <= 4) {
      // one fog-washed forest layer: its hill and its trees
      const L = this.layers[st - 1], rng = rngFor(L.seed);
      const hill = new MeshBuilder();
      this.groundStrip(hill, L.fn, L.z, x0, x1, 1.0);
      done(hill, 'hill', this.mats.ground);
      const mb = new MeshBuilder(), th = theme();
      const dead = () => M.dead[Math.floor(rng() * M.dead.length)];
      for (let x = x0 + rng() * L.gap; x < x1; x += L.gap * (0.6 + rng() * 0.8) * (th === 'glade' ? 1 : 1.5)) {
        const s = L.s[0] + rng() * (L.s[1] - L.s[0]), z = L.z + (rng() - 0.5) * 3, y = L.fn(x) - 0.3, ry = rng() * 6.28;
        if (th === 'moon') { // bare rock spires and boulders, nothing grows
          if (rng() < 0.55) mb.append(rng() < 0.5 ? M.rock : M.rock2, { x, y: y - 0.4, z, sx: s * (0.6 + rng() * 0.5), sy: s * (2.5 + rng() * 3.5), sz: s * 0.7, ry, rz: (rng() - 0.5) * 0.3 });
          else mb.append(M.rock2, { x, y: y - 0.3, z, s: s * (1 + rng()), ry });
        } else if (th === 'bog') { // drowned trees leaning out of the marsh, stumps, reed beds
          const r = rng();
          if (r < 0.45) mb.append(dead(), { x, y: y - 0.9, z, s: s * 0.85, ry, rz: (rng() - 0.5) * 0.5 });
          else if (r < 0.65) mb.append(dead(), { x, y: y - 0.2, z, sx: s * 1.3, sy: s * 0.22, sz: s * 1.3, ry });
          for (let k = 0; k < 4; k++) mb.append(M.grass, { x: x + (rng() - 0.5) * 4, y: y + 0.1, z: z + 0.5, sx: s * 1.2, sy: s * (2.2 + rng() * 1.6), sz: s * 1.2, ry: rng() * 6.28 });
        } else if (th === 'quarry') { // mine headframes and cranes on the terraces, rock stacks, a few dead trees
          const r = rng();
          const far = L.z <= -30; // the machinery stands back on the far terraces, a few per chunk
          if (far && r < 0.07) mb.append(M.headframe, { x, y: y - 0.2, z, s: s * 1.4, ry: (rng() - 0.5) * 0.6 });
          else if (far && r < 0.12) mb.append(M.crane, { x, y: y - 0.2, z, s: s * 1.3, ry: rng() < 0.5 ? 0 : 3.14 });
          else if (r < 0.7) mb.append(rng() < 0.5 ? M.rock : M.rock2, { x, y: y - 0.2, z, sx: s * (1.2 + rng()), sy: s * (0.8 + rng() * 1.2), sz: s, ry });
          else mb.append(dead(), { x, y, z, s: s * 0.8, ry });
        } else if (th === 'graveyard') { // headstones, crosses, railings, crypts, a chapel far back, gnarled trees
          const r = rng();
          if (L.z <= -30 && r < 0.05) mb.append(M.chapel, { x, y: y - 0.2, z, s: s * 1.1, ry: (rng() - 0.5) * 0.4 });
          else if (r < 0.14) mb.append(M.crypt, { x, y: y - 0.2, z, s: s * 0.8, ry: (rng() - 0.5) * 0.5 });
          else if (r < 0.32) mb.append(M.fence, { x, y: y - 0.1, z, s: s * 0.9, ry: (rng() - 0.5) * 0.3 });
          else if (r < 0.55) mb.append(dead(), { x, y, z, sx: s * 1.1, sy: s * 0.75, sz: s * 1.1, ry, rz: (rng() - 0.5) * 0.3 });
          for (let k = 0; k < 3; k++) mb.append(rng() < 0.6 ? M.tomb : M.cross, { x: x + (rng() - 0.5) * L.gap, y: y - 0.15, z: z + 0.6, s: s * (0.5 + rng() * 0.3), ry: (rng() - 0.5) * 0.6, rz: (rng() - 0.5) * 0.35 });
        } else if (th === 'hallow') { // crooked houses with lit windows, scarecrows, lantern posts, bare trees, bats
          const r = rng();
          if (L.z <= -15 && r < 0.2) mb.append(M.house[Math.floor(rng() * 3)], { x, y: y - 0.3, z, s: s * 0.9, ry: (rng() - 0.5) * 0.5 });
          else if (r < 0.32) mb.append(M.scarecrow, { x, y: y - 0.2, z, s: s * 0.9, ry: rng() * 6.28 });
          else if (r < 0.45) mb.append(M.lampPost, { x, y: y - 0.1, z, s: s * 0.9, ry: rng() < 0.5 ? 0 : 3.14 });
          else mb.append(dead(), { x, y, z, s: s * 0.95, ry, rz: (rng() - 0.5) * 0.25 });
          if (rng() < 0.5) mb.append(M.jack, { x: x + (rng() - 0.5) * 2, y: y + 0.15, z: z + 0.8, s: s * 0.5, ry: (rng() - 0.5) * 0.5 });
          if (L.z <= -15 && rng() < 0.25) mb.append(M.bat, { x: x + rng() * 6, y: y + 8 + rng() * 6, z, s: s * 0.8, rz: (rng() - 0.5) * 0.6 });
        } else if (rng() < L.pine) mb.append(M.pine, { x, y, z, s: s * 1.6, ry });
        else mb.append(dead(), { x, y, z, s, ry });
      }
      done(mb, 'forest', this.mats.scenery);
    } else if (st === 5) {
      // play-plane decor: grass and rocks at the ground's edge (no collision)
      const rng = rngFor(99), mb = new MeshBuilder(), th = theme();
      const wet = (x) => S.pond && x > S.pond.x0 + 1 && x < S.pond.x1 - 1;
      if (th === 'moon') { // pebbles and broken rock, no grass
        for (let x = x0 + rng() * 4; x < x1; x += 2.5 + rng() * 5) mb.append(rng() < 0.5 ? M.rock : M.rock2, { x, y: T.height(x) - 0.15, z: 0.3 + rng() * 1.2, s: 0.18 + rng() * 0.35, ry: rng() * 6.28 });
      } else if (th === 'bog') { // thick tall reeds, right into the shallows
        for (let x = x0 + rng(); x < x1; x += 0.5 + rng() * 1.1) {
          const inPond = wet(x), y = inPond ? S.pond.waterY - 0.6 : T.height(x) - 0.08;
          if (inPond && Math.abs(x - (S.pond.x0 + S.pond.x1) / 2) < (S.pond.x1 - S.pond.x0) * 0.3) continue;
          mb.append(M.grass, { x, y, z: 0.2 + rng() * 1.3, sx: 0.8 + rng() * 0.5, sy: 1.6 + rng() * 1.8, sz: 0.8, ry: rng() * 6.28 });
        }
      } else if (th === 'graveyard') { // thin grass, little headstones and crosses along the edge
        for (let x = x0 + rng(); x < x1; x += 1.4 + rng() * 2.4) mb.append(M.grass, { x, y: T.height(x) - 0.08, z: 0.3 + rng() * 1.1, s: 0.5 + rng() * 0.6, ry: rng() * 6.28 });
        for (let x = x0 + rng() * 6; x < x1; x += 5 + rng() * 7) mb.append(rng() < 0.6 ? M.tomb : M.cross, { x, y: T.height(x) - 0.12, z: -1.6 - rng() * 1.2, s: 0.55 + rng() * 0.35, ry: (rng() - 0.5) * 0.5, rz: (rng() - 0.5) * 0.3 });
      } else if (th === 'hallow') { // grass, and little jack-o'-lanterns grinning along the road
        for (let x = x0 + rng(); x < x1; x += 0.9 + rng() * 1.8) mb.append(M.grass, { x, y: T.height(x) - 0.08, z: 0.3 + rng() * 1.1, s: 0.6 + rng() * 0.7, ry: rng() * 6.28 });
        for (let x = x0 + rng() * 6; x < x1; x += 6 + rng() * 9) mb.append(M.jack, { x, y: T.height(x) + 0.12, z: -1.3 - rng() * 1.3, s: 0.6 + rng() * 0.5, ry: (rng() - 0.5) * 0.4 });
      } else if (th === 'quarry') { // rubble and old timber posts
        for (let x = x0 + rng() * 3; x < x1; x += 1.6 + rng() * 3.5) mb.append(rng() < 0.5 ? M.rock : M.rock2, { x, y: T.height(x) - 0.12, z: 0.3 + rng() * 1.2, s: 0.15 + rng() * 0.4, ry: rng() * 6.28 });
        for (let x = x0 + rng() * 14; x < x1; x += 14 + rng() * 18) mb.append(M.post, { x, y: T.height(x) - 0.3, z: -1.4 - rng(), s: 0.9 + rng() * 0.5, rz: (rng() - 0.5) * 0.25 });
      } else {
        for (let x = x0 + rng(); x < x1; x += 0.7 + rng() * 1.6) {
          if (wet(x)) continue;
          mb.append(M.grass, { x, y: T.height(x) - 0.08, z: 0.3 + rng() * 1.1, s: 0.7 + rng() * 0.9, ry: rng() * 6.28 });
        }
      }
      if (th !== 'bog') for (let x = x0 + rng() * 10; x < x1; x += 9 + rng() * 14) mb.append(M.rock, { x, y: T.height(x) - 0.2, z: -1.2 - rng() * 1.5, s: 0.6 + rng() * 1.0, ry: rng() * 6.28 });
      done(mb, 'decor', this.mats.scenery);
    } else {
      // foreground trunks drifting past in front of the action, plus the shrine stonework
      const rng = rngFor(5), th = theme();
      const n = rng() < 0.55 ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const mb = new MeshBuilder(), x = x0 + rng() * CHUNK, z = 6 + rng() * 4;
        if (th === 'moon') mb.append(M.rock2, { x, y: T.height(x) - 3, z, sx: 2 + rng(), sy: 6 + rng() * 5, sz: 2, ry: rng() * 6.28, rz: (rng() - 0.5) * 0.25 }); // a tall crag drifting past
        else if (th === 'bog') { mb.append(M.dead[Math.floor(rng() * M.dead.length)], { x, y: T.height(x) - 3.4, z, s: 2 + rng() * 0.6, ry: rng() * 6.28, rz: (rng() < 0.5 ? -1 : 1) * (0.25 + rng() * 0.2) }); for (let k = 0; k < 5; k++) mb.append(M.grass, { x: x + (rng() - 0.5) * 6, y: T.height(x) - 1.5, z: z - 1, sx: 2.2, sy: 4 + rng() * 2, sz: 2.2, ry: rng() * 6.28 }); }
        else if (th === 'graveyard') mb.append(rng() < 0.5 ? M.cross : M.fence, { x, y: T.height(x) - 1.8, z, s: 2.4 + rng() * 0.6, ry: (rng() - 0.5) * 0.4, rz: (rng() - 0.5) * 0.3 });
        else if (th === 'hallow') mb.append(rng() < 0.5 ? M.scarecrow : M.lampPost, { x, y: T.height(x) - 2.2, z, s: 2.2 + rng() * 0.5, ry: rng() < 0.5 ? 0 : 3.14 });
        else if (th === 'quarry') mb.append(rng() < 0.7 ? M.rock2 : M.post, { x, y: T.height(x) - 3, z, s: 2.4 + rng(), ry: rng() * 6.28 }); // rock piles and the odd timber post drifting past
        else mb.append(M.dead[Math.floor(rng() * M.dead.length)], { x, y: T.height(x) - 3, z, s: 2.2 + rng() * 0.8, ry: rng() * 6.28 });
        done(mb, 'foreground', this.mats.scenery);
      }
      for (const x of S.pillars) {
        const g = T.height(x), top = pillarTop(S);
        const e = this.addEntity('pillar', pillarMesh(this.device, top - g + 0.8 - 0.6), this.mats.stone, { owner: C });
        e.setPosition(x, g - 0.8, -2.6);
      }
      if (S.bowl) this.addEntity('altar', altarMesh(this.device), this.mats.stone, { owner: C }).setPosition(S.bowl.x, T.height(S.bowl.x) - 0.1, -1.6);
      if (S.arch !== null) this.addEntity('arch', archMesh(this.device), this.mats.stone, { owner: C }).setPosition(S.arch, T.height(S.arch) - 0.4, -2.4);
      // the spooky maps' set pieces: a headstone behind every grave, the crypt, the houses, the mansion
      const set = new MeshBuilder(), rs = rngFor(61);
      for (const x of S.graves || []) set.append(rs() < 0.7 ? M.tomb : M.cross, { x, y: T.height(x) - 0.1, z: -0.9 - rs() * 0.4, s: 0.8 + rs() * 0.3, ry: (rs() - 0.5) * 0.3, rz: (rs() - 0.5) * 0.25 });
      if (S.crypt) set.append(M.crypt, { x: S.crypt, y: T.height(S.crypt) - 0.2, z: -2.6, s: 1 });
      for (const x of S.houses || []) set.append(M.house[Math.floor(rs() * 3)], { x, y: T.height(x) - 0.3, z: -3.2, s: 1.1, ry: (rs() - 0.5) * 0.3 });
      if (S.mansion) { set.append(M.house[1], { x: S.mansion, y: T.height(S.mansion) - 0.3, z: -3.6, sx: 2.1, sy: 1.8, sz: 1.6 }); set.append(M.jack, { x: S.mansion - 2, y: T.height(S.mansion - 2) + 0.2, z: -1.4, s: 0.9 }); }
      if (set.count) this.addEntity('setpiece', set.build(this.device), this.mats.scenery, { owner: C });
    }
  }

  buildFog() {
    // banks of fog between the layers; their colour is the sky behind them, so they read as mist.
    // They ride along with the camera (the noise is in world space, so they still drift past).
    const sheets = [{ z: -3, d: 0.5, y0: -8, y1: 5 }, { z: -10, d: 0.5, y0: -6, y1: 7 }, { z: -22, d: 0.6, y0: -4, y1: 10 }, { z: -42, d: 0.7, y0: -2, y1: 14 }, { z: 3.5, d: 0.25, y0: -6, y1: 1.5 }, { z: 1.6, d: 0.42, y0: -3, y1: 1.6, marsh: true }]; // the last: low marsh mist, on the bog only
    for (const S of sheets) {
      const mb = new MeshBuilder();
      const A = [255, 255, 255, 0], B = [255, 255, 255, 255], C = [255, 255, 255, 140];
      for (let x = -160; x < 160; x += 40) {
        const a = mb.vert(x, S.y0, S.z, 0, 0, 1, C), b = mb.vert(x + 40, S.y0, S.z, 0, 0, 1, C);
        const c = mb.vert(x + 40, (S.y0 + S.y1) * 0.45, S.z, 0, 0, 1, B), d = mb.vert(x, (S.y0 + S.y1) * 0.45, S.z, 0, 0, 1, B);
        const e = mb.vert(x + 40, S.y1, S.z, 0, 0, 1, A), f = mb.vert(x, S.y1, S.z, 0, 0, 1, A);
        mb.tri(a, b, c); mb.tri(a, c, d); mb.tri(d, c, e); mb.tri(d, e, f);
      }
      const mat = fogMaterial(S.d);
      this.fogMats.push(mat);
      const e = this.addEntity('fog', mb.build(this.device), mat, { cull: false });
      this.fogEnts.push(e);
      if (S.marsh) { this.marshFog = e; e.enabled = false; }
    }
  }

  buildWater(S, C) {
    // the pond: a dark teal body (lighter just under the surface, near-black at the bottom) and a
    // bright rippling surface line, so it reads as water against the misty background
    const P = S.pond, N = 64;
    const W = { x0: P.x0 - 2, x1: P.x1 + 2, y: P.waterY, N, pos: new Float32Array((N + 1) * 3 * 3), line: new Float32Array((N + 1) * 2 * 3) };
    const aabb = new pc.BoundingBox(new pc.Vec3((P.x0 + P.x1) / 2, P.waterY - 2, 1), new pc.Vec3((P.x1 - P.x0) / 2 + 3, 6, 1));
    const strip = (rows, colours, mat) => {
      const mesh = new pc.Mesh(this.device), cols = [], idx = [];
      for (let i = 0; i <= N; i++) for (const c of colours) cols.push(...c);
      for (let i = 0; i < N; i++) for (let r = 0; r < rows - 1; r++) { const a = i * rows + r, b = a + rows; idx.push(a, a + 1, b + 1, a, b + 1, b); }
      mesh.setPositions(new Float32Array((N + 1) * rows * 3));
      mesh.setColors32(cols);
      mesh.setIndices(idx);
      mesh.update(pc.PRIMITIVE_TRIANGLES);
      return { mesh, e: this.addEntity('water', mesh, mat, { aabb, owner: C }) };
    };
    W.body = strip(3, [[86, 128, 130, 175], [44, 76, 82, 205], [14, 26, 30, 235]], this.mats.water);
    W.glint = strip(2, [[205, 228, 222, 230], [150, 190, 190, 0]], this.mats.waterLine);
    C.waters.push(W);
    this.paintWater(W, []);
  }

  /** gushes: [{x, k}] geyser bulges on the pond surfaces */
  updateWater(gushes) {
    for (const C of this.chunks.values()) for (const W of C.waters) if (Math.abs((W.x0 + W.x1) / 2 - this.camX) < 90) this.paintWater(W, gushes);
  }
  paintWater(W, gushes) {
    const t = this.time;
    for (let i = 0; i <= W.N; i++) {
      const x = W.x0 + (W.x1 - W.x0) * (i / W.N);
      let y = W.y + Math.sin(x * 1.3 + t * 2.1) * 0.05 + Math.sin(x * 0.7 - t * 1.3) * 0.04;
      for (const g of gushes) if (Math.abs(g.x - x) < 4) y += g.k * Math.exp(-((x - g.x) ** 2) / 1.5);
      const bot = Math.min(y, this.terrain.height(x)) - 0.02, mid = Math.max(bot, y - 0.7);
      W.pos.set([x, y, 1.0, x, mid, 1.0, x, Math.min(bot, mid), 1.0], i * 9);
      W.line.set([x, y + 0.05, 1.02, x, y - 0.09, 1.02], i * 6);
    }
    W.body.mesh.setPositions(W.pos); W.body.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
    W.glint.mesh.setPositions(W.line); W.glint.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
  }

  update(dt, camX = 0) {
    this.time += dt;
    this.camX = camX;
    // the fog banks hover around the local ground level
    let g = 0;
    for (let k = -2; k <= 2; k++) g += this.terrain.height(camX + k * 12);
    g /= 5;
    this.fogY += (g - this.fogY) * Math.min(1, dt * 1.5);
    for (const e of this.fogEnts) e.setPosition(camX, this.fogY, 0);
  }
}

/** Solid silhouette meshes for the gameplay statics (shrine pillars + altar). */
export function pillarMesh(device, h) {
  const mb = new MeshBuilder();
  const c = rgba(0, 0, 0, CLS.STONE);
  addBox(mb, { y: h / 2, sx: 1.6, sy: h, sz: 1.6, col: c });
  addBox(mb, { y: h + 0.2, sx: 2.2, sy: 0.4, sz: 2.2, col: c });
  addBox(mb, { y: 0.2, sx: 2.2, sy: 0.4, sz: 2.2, col: c });
  addLathe(mb, [[0.0, 0], [0.5, 0.05], [0.35, 0.4], [0.0, 0.5]], { seg: 8, y: h + 0.4, colFn: () => c });
  return mb.build(device);
}

/** the shrine altar at the bottom of a bowl */
export function altarMesh(device) {
  const mb = new MeshBuilder(), c = rgba(0, 0, 0, CLS.STONE);
  addBox(mb, { y: 0.4, sx: 3.2, sy: 0.8, sz: 2, col: c });
  addBox(mb, { y: 0.9, sx: 3.8, sy: 0.25, sz: 2.2, col: c });
  return mb.build(device);
}

/** the magnet ruin: a broken stone arch, with a glowing keystone */
export function archMesh(device) {
  const mb = new MeshBuilder(), c = rgba(0, 0, 0, CLS.STONE);
  for (const x of [-3.4, 3.4]) { addBox(mb, { x, y: 3, sx: 1.3, sy: 6, sz: 1.4, col: c }); addBox(mb, { x, y: 0.25, sx: 1.8, sy: 0.5, sz: 1.8, col: c }); }
  addBox(mb, { y: 6.4, sx: 8.6, sy: 1.0, sz: 1.5, col: c });
  addBox(mb, { x: 2.2, y: 7.1, sx: 3.2, sy: 0.5, sz: 1.3, tilt: 0.12, col: c });
  addBox(mb, { y: 6.4, z: 0.78, sx: 0.8, sy: 0.7, sz: 0.06, col: rgba(1, 0.62, 0.25, CLS.GLOW) });
  return mb.build(device);
}

// ---------------------------------------------------------------- quarry machinery (silhouettes)
const IRON = () => rgba(0.03, 0.03, 0.03, CLS.STONE, 0);
/** a mine headframe: an A-frame tower of girders with the big winding wheel on top */
function headframeMesh() {
  const mb = new MeshBuilder(), c = IRON();
  for (const s of [-1, 1]) addTube(mb, [[s * 1.6, 0, 0, 0.14], [s * 0.45, 7.2, 0, 0.12]], { seg: 4, colFn: IRON });
  for (let i = 1; i < 6; i++) { const y = i * 1.25, w = 1.6 - (1.15 * y) / 7.2; addBox(mb, { y, sx: w * 2, sy: 0.12, sz: 0.2, col: c }); addBox(mb, { y: y - 0.62, sx: w * 2.1, sy: 0.08, sz: 0.16, tilt: (i % 2 ? 1 : -1) * 0.5, col: c }); }
  addTube(mb, [[2.6, 0, 0, 0.12], [0.5, 6.5, 0, 0.1]], { seg: 4, colFn: IRON }); // the back stay
  { const ring = []; for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; ring.push([Math.cos(a) * 1.05, 7.4 + Math.sin(a) * 1.05, 0, 0.09]); } addTube(mb, ring, { seg: 4, subdiv: 1, colFn: IRON }); } // the wheel's rim
  for (let i = 0; i < 4; i++) addBox(mb, { y: 7.4, sx: 2.1, sy: 0.07, sz: 0.1, tilt: (i / 4) * Math.PI, col: c });
  addBox(mb, { y: 7.4, sx: 0.3, sy: 0.3, sz: 0.4, col: c });
  addTube(mb, [[0.9, 7.4, 0, 0.03], [0.9, 2.5, 0, 0.03]], { seg: 3, colFn: IRON }); // the cable
  return mb.build(null);
}
/** a quarry crane: a lattice mast, a long jib and a hook on its cable */
function craneMesh() {
  const mb = new MeshBuilder(), c = IRON();
  for (const s of [-1, 1]) addBox(mb, { x: s * 0.35, y: 4, sx: 0.12, sy: 8, sz: 0.2, col: c });
  for (let i = 0; i < 8; i++) addBox(mb, { y: 0.5 + i, sx: 0.85, sy: 0.07, sz: 0.14, tilt: (i % 2 ? 1 : -1) * 0.85, col: c });
  addBox(mb, { x: 2.2, y: 8.1, sx: 7.6, sy: 0.32, sz: 0.24, col: c });
  addBox(mb, { x: -1.8, y: 7.7, sx: 1.4, sy: 0.9, sz: 0.5, col: c }); // the counterweight
  addTube(mb, [[0, 8.2, 0, 0.06], [0.2, 9.6, 0, 0.06], [5.6, 8.3, 0, 0.03]], { seg: 3, colFn: IRON });
  addTube(mb, [[5.2, 8.0, 0, 0.025], [5.2, 4.8, 0, 0.025]], { seg: 3, colFn: IRON });
  addBox(mb, { x: 5.2, y: 4.6, sx: 0.35, sy: 0.4, sz: 0.2, col: c });
  return mb.build(null);
}
/** an old timber post with a cross-piece (scaffold, fences) */
function postMesh() {
  const mb = new MeshBuilder(), c = rgba(0.035, 0.03, 0.025, CLS.STONE, 0);
  addBox(mb, { y: 1.6, sx: 0.22, sy: 3.2, sz: 0.22, col: c });
  addBox(mb, { y: 2.7, sx: 1.6, sy: 0.16, sz: 0.18, col: c });
  addBox(mb, { x: 0.45, y: 2.2, sx: 0.12, sy: 1.1, sz: 0.14, tilt: 0.7, col: c });
  return mb.build(null);
}

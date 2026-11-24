// The glade from the side: a terrain profile for physics, plus layered silhouette scenery
// (foreground trunks, the play plane, four fog-washed forest layers behind), drifting fog banks,
// the pond and the sky. Static scenery is baked into a few big meshes per 60 m chunk.
import * as pc from 'playcanvas';
import { LAYOUT, rampBack } from './layout.js';
import { CLS } from './shaders.js';
import { MeshBuilder, rgba, deadTreeMesh, pineMesh, rockMesh, grassTuftMesh, quadMesh, addBox, addLathe } from './meshes.js';
import { silMaterial, skyMaterial, fogMaterial, tintMaterial, glowMaterial } from './sil.js';
import { mulberry32 } from './noise.js';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const SPAN = 185; // scenery reaches past the fog walls so parallax never shows an edge

export class Terrain {
  constructor() {
    this.step = 0.25;
    this.x0 = -SPAN;
    const n = Math.ceil((SPAN * 2) / this.step) + 1;
    this.h = new Float32Array(n);
    for (let i = 0; i < n; i++) this.h[i] = this.raw(this.x0 + i * this.step);
  }

  raw(x) {
    const L = LAYOUT;
    let y = 0.5 * Math.sin(x * 0.045 + 0.3) + 0.35 * Math.sin(x * 0.11 + 2.0) + 0.22 * Math.sin(x * 0.23 + 1.1);
    // the pond
    const pc0 = (L.pond.x0 + L.pond.x1) / 2, ph = (L.pond.x1 - L.pond.x0) / 2;
    const pt = Math.abs(x - pc0) / ph;
    y = y + (-L.pond.depth - y) * (1 - smooth(0.62, 1.05, pt));
    // the shrine stunt bowl (a steep half-pipe)
    const u = (x - L.bowl.x) / L.bowl.half;
    if (Math.abs(u) < 1) { const k = Math.abs(u) ** 2.4; y = -L.bowl.depth * (1 - k) + y * k; }
    // ramps: a concave run-up to a lip, then a rounded back slope. There is only one lane, so the
    // back has to be drivable too: fast buggies fly off the lip, slow ones roll over the crest,
    // and anyone coming the other way can climb it.
    for (const r of L.ramps) {
      const s = (x - r.x) * r.dir; // < 0 on the run-up side
      const back = rampBack(r);
      if (s > -r.len && s <= 0) y += r.h * ((s + r.len) / r.len) ** 1.6;
      else if (s > 0 && s < back) y += r.h * 0.5 * (1 + Math.cos((Math.PI * s) / back));
    }
    // rock-slide hills climbing into the fog walls, with a shelf for the boulders
    for (const sl of L.slides) {
      const e = -sl.dir; // which way is "up the hill"
      const d = (x - sl.x) * e; // distance past the slide anchor, uphill positive
      if (d > -14) {
        const climb = smooth(-14, -2, d) * sl.top; // the slope
        const cliff = smooth(9, 20, d) * 7; // beyond the shelf: a cliff into the fog
        y = Math.max(y, y * 0.3 + climb + cliff);
      }
    }
    return y;
  }

  height(x) {
    const f = (x - this.x0) / this.step;
    const i = Math.max(0, Math.min(this.h.length - 2, Math.floor(f)));
    const t = Math.max(0, Math.min(1, f - i));
    return this.h[i] + (this.h[i + 1] - this.h[i]) * t;
  }
  slope(x) { return (this.height(x + 0.2) - this.height(x - 0.2)) / 0.4; }
  normal(x, out) { const s = this.slope(x), l = Math.hypot(s, 1); out[0] = -s / l; out[1] = 1 / l; return out; }
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
      grass: silMaterial({ sway: 0.25, cls: CLS.GRASS }),
      sky: skyMaterial(),
      water: tintMaterial(),
      waterLine: glowMaterial(0.5),
    };
    this.fogMats = [];
    this.entities = [];
    this.time = 0;
  }

  steps() {
    return [
      ['painting the sky', () => this.buildSky()],
      ['shaping the hills', () => this.buildGround()],
      ['growing dead trees', () => this.buildForest()],
      ['rolling in the fog', () => this.buildFog()],
      ['filling the pond', () => this.buildWater()],
    ];
  }

  addEntity(name, mesh, mat, { cull = true, aabb } = {}) {
    const mi = new pc.MeshInstance(mesh, mat);
    if (!cull) mi.cull = false;
    if (aabb) mi.setCustomAabb(aabb);
    const e = new pc.Entity(name);
    e.addComponent('render', { meshInstances: [mi], layers: [this.layer.id], castShadows: false, receiveShadows: false });
    this.app.root.addChild(e);
    if (aabb) e.render.meshInstances[0].setCustomAabb(aabb);
    this.entities.push(e);
    return e;
  }

  buildSky() {
    this.addEntity('sky', quadMesh(this.device), this.mats.sky, { cull: false });
  }

  /** a filled ground profile at depth z, from fn(x) down to y = -40 */
  groundStrip(mb, fn, z, x0, x1, step = 0.5, cls = CLS.GROUND) {
    const col = rgba(0, 0, 0, cls);
    for (let x = x0; x < x1; x += step) {
      const xa = x, xb = Math.min(x1, x + step);
      const a = mb.vert(xa, fn(xa), z, 0, 0, 1, col), b = mb.vert(xb, fn(xb), z, 0, 0, 1, col);
      const c = mb.vert(xb, -40, z, 0, 0, 1, col), d = mb.vert(xa, -40, z, 0, 0, 1, col);
      mb.tri(a, d, c); mb.tri(a, c, b);
    }
  }

  buildGround() {
    const T = this.terrain;
    // the play plane's ground: a front face plus a shallow top so it reads as a slab
    for (let cx = -SPAN; cx < SPAN; cx += 60) {
      const mb = new MeshBuilder();
      this.groundStrip(mb, (x) => T.height(x), 0.9, cx, cx + 60, 0.25);
      this.groundStrip(mb, (x) => T.height(x) - 0.02, -1.6, cx, cx + 60, 0.5);
      // top surface between the two faces
      const col = rgba(0, 0, 0, CLS.GROUND);
      for (let x = cx; x < cx + 60; x += 0.5) {
        const a = mb.vert(x, T.height(x), 0.9, 0, 1, 0, col), b = mb.vert(x + 0.5, T.height(x + 0.5), 0.9, 0, 1, 0, col);
        const c = mb.vert(x + 0.5, T.height(x + 0.5), -1.6, 0, 1, 0, col), d = mb.vert(x, T.height(x), -1.6, 0, 1, 0, col);
        mb.tri(a, b, c); mb.tri(a, c, d);
      }
      this.addEntity('ground', mb.build(this.device), this.mats.ground);
    }
    // background hills, one per forest layer
    for (const L of LAYERS) {
      const rng = mulberry32(L.seed);
      const ph = rng() * 10, f1 = 0.02 + rng() * 0.02, f2 = 0.07 + rng() * 0.04;
      const amp = 0.5 + -L.z * 0.03;
      L.fn = (x) => T.height(x) * L.follow + L.lift + Math.sin(x * f1 + ph) * amp + Math.sin(x * f2 + ph * 2) * 0.4;
      for (let cx = -SPAN; cx < SPAN; cx += 60) {
        const mb = new MeshBuilder();
        this.groundStrip(mb, L.fn, L.z, cx, cx + 60, 1.0);
        this.addEntity('hill', mb.build(this.device), this.mats.ground);
      }
    }
  }

  buildForest() {
    const T = this.terrain;
    const dead = [deadTreeMesh(null, 31), deadTreeMesh(null, 77), deadTreeMesh(null, 13), deadTreeMesh(null, 5)];
    const pine = pineMesh(null);
    const rock = rockMesh(null, 9);
    const grass = grassTuftMesh(null);
    const chunk = (fill) => {
      for (let cx = -SPAN; cx < SPAN; cx += 60) {
        const mb = new MeshBuilder();
        fill(mb, cx, cx + 60);
        if (mb.count) this.addEntity('forest', mb.build(this.device), this.mats.scenery);
      }
    };
    for (const L of LAYERS) {
      const rng = mulberry32(L.seed * 7);
      chunk((mb, x0, x1) => {
        for (let x = x0 + rng() * L.gap; x < x1; x += L.gap * (0.6 + rng() * 0.8)) {
          const s = L.s[0] + rng() * (L.s[1] - L.s[0]);
          const z = L.z + (rng() - 0.5) * 3;
          if (rng() < L.pine) mb.append(pine, { x, y: L.fn(x) - 0.3, z, s: s * 1.6, ry: rng() * 6.28 });
          else mb.append(dead[Math.floor(rng() * dead.length)], { x, y: L.fn(x) - 0.3, z, s, ry: rng() * 6.28 });
        }
      });
    }
    // play-plane decor: rocks and grass at the ground's edge (no collision)
    const rng = mulberry32(99);
    chunk((mb, x0, x1) => {
      for (let x = x0; x < x1; x += 0.7 + rng() * 1.6) {
        const z = 0.3 + rng() * 1.1;
        mb.append(grass, { x, y: T.height(x) - 0.08, z, s: 0.7 + rng() * 0.9, ry: rng() * 6.28 });
      }
      for (let x = x0 + rng() * 10; x < x1; x += 9 + rng() * 14) mb.append(rock, { x, y: T.height(x) - 0.2, z: -1.2 - rng() * 1.5, s: 0.6 + rng() * 1.0, ry: rng() * 6.28 });
    });
    // foreground: huge black trunks drifting past in front of the action
    const fr = mulberry32(5);
    for (let x = -SPAN + 10; x < SPAN; x += 26 + fr() * 30) {
      const mb = new MeshBuilder();
      const z = 6 + fr() * 4;
      mb.append(dead[Math.floor(fr() * dead.length)], { x, y: T.height(x) - 3, z, s: 2.2 + fr() * 0.8, ry: fr() * 6.28 });
      this.addEntity('foreground', mb.build(this.device), this.mats.scenery);
    }
  }

  buildFog() {
    // banks of fog between the layers; their colour is the sky behind them, so they read as mist
    const sheets = [{ z: -3, d: 0.5, y0: -8, y1: 5 }, { z: -10, d: 0.5, y0: -6, y1: 7 }, { z: -22, d: 0.6, y0: -4, y1: 10 }, { z: -42, d: 0.7, y0: -2, y1: 14 }, { z: 3.5, d: 0.25, y0: -6, y1: 1.5 }];
    for (const S of sheets) {
      const mb = new MeshBuilder();
      const lo = rgba(1, 1, 1, 0), mid = rgba(1, 1, 1, 0);
      const A = [255, 255, 255, 0], B = [255, 255, 255, 255], C = [255, 255, 255, 140];
      for (let x = -SPAN; x < SPAN; x += 30) {
        const a = mb.vert(x, S.y0, S.z, 0, 0, 1, C), b = mb.vert(x + 30, S.y0, S.z, 0, 0, 1, C);
        const c = mb.vert(x + 30, (S.y0 + S.y1) * 0.45, S.z, 0, 0, 1, B), d = mb.vert(x, (S.y0 + S.y1) * 0.45, S.z, 0, 0, 1, B);
        const e = mb.vert(x + 30, S.y1, S.z, 0, 0, 1, A), f = mb.vert(x, S.y1, S.z, 0, 0, 1, A);
        mb.tri(a, b, c); mb.tri(a, c, d); mb.tri(d, c, e); mb.tri(d, e, f);
      }
      void lo; void mid;
      const mat = fogMaterial(S.d);
      this.fogMats.push(mat);
      this.addEntity('fog', mb.build(this.device), mat, { cull: false });
    }
  }

  buildWater() {
    const P = LAYOUT.pond, N = 64;
    this.water = { x0: P.x0 - 2, x1: P.x1 + 2, N, pos: new Float32Array((N + 1) * 2 * 3), line: new Float32Array((N + 1) * 2 * 3) };
    const mk = (alpha, mat, h) => {
      const mesh = new pc.Mesh(this.device);
      const cols = [], idx = [];
      for (let i = 0; i <= N; i++) { cols.push(150, 168, 168, alpha, 120, 135, 135, h ? 0 : alpha * 0.6); }
      for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      mesh.setPositions(new Float32Array((N + 1) * 2 * 3));
      mesh.setColors32(cols);
      mesh.setIndices(idx);
      mesh.update(pc.PRIMITIVE_TRIANGLES);
      const aabb = new pc.BoundingBox(new pc.Vec3((P.x0 + P.x1) / 2, -2, 1), new pc.Vec3(20, 6, 1));
      return { mesh, e: this.addEntity('water', mesh, mat, { aabb }) };
    };
    this.water.body = mk(120, this.mats.water, false);
    this.water.glint = mk(200, this.mats.waterLine, true);
    this.updateWater([]);
  }

  /** gushes: [{x, k}] geyser bulges on the surface */
  updateWater(gushes) {
    const W = this.water, wy = LAYOUT.waterY, t = this.time;
    for (let i = 0; i <= W.N; i++) {
      const x = W.x0 + (W.x1 - W.x0) * (i / W.N);
      let y = wy + Math.sin(x * 1.3 + t * 2.1) * 0.05 + Math.sin(x * 0.7 - t * 1.3) * 0.04;
      for (const g of gushes) y += g.k * Math.exp(-((x - g.x) ** 2) / 1.5);
      const bot = Math.min(y, this.terrain.height(x)) - 0.02;
      W.pos.set([x, y, 1.0, x, Math.min(bot, y), 1.0], i * 6);
      W.line.set([x, y + 0.04, 1.02, x, y - 0.05, 1.02], i * 6);
    }
    W.body.mesh.setPositions(W.pos); W.body.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
    W.glint.mesh.setPositions(W.line); W.glint.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
  }

  update(dt) { this.time += dt; }
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

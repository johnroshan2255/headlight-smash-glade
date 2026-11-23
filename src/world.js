// The glade: terrain (ramps, shallow pond, meadow arena, shrine stunt bowl), forest, grass, ruins.
// Same culling strategy as before: spatial clusters with tight AABBs + distance culling + grass LOD.
import * as pc from 'playcanvas';
import { CLS, worldMaterial, waterMaterial, instanceFormat } from './shaders.js';
import { MeshBuilder, rgba, addBox, pineMesh, deadTreeMesh, rockMesh, grassTuftMesh, fireflyMesh } from './meshes.js';
import { fbm, mulberry32, smoothstep, lerp, clamp, distToSegment, hash2 } from './noise.js';
import { LAYOUT } from './layout.js';

export const WORLD = { half: 80, waterY: LAYOUT.waterY, pond: LAYOUT.pond, shrine: LAYOUT.shrine, playRadius: LAYOUT.playRadius };

function pathDist(x, z) {
  const p = LAYOUT.path;
  let d = 1e9;
  for (let i = 0; i < p.length - 1; i++) d = Math.min(d, distToSegment(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]));
  return d;
}

function rawHeight(x, z) {
  let h = fbm(x * 0.017 + 3.3, z * 0.017 - 1.7, 4) * 5.0 - 0.5;
  h += (fbm(x * 0.07 + 31, z * 0.07 - 17, 2) - 0.5) * 0.8;
  h = Math.max(h, 0.6);
  const r = Math.hypot(x, z);
  h += smoothstep(58, 80, r) * 18 * (0.7 + 0.6 * fbm(x * 0.05, z * 0.05, 2));
  return h;
}

const SHRINE_H = rawHeight(WORLD.shrine.x, WORLD.shrine.z);
const MEADOW_H = rawHeight(LAYOUT.meadow.x, LAYOUT.meadow.z);
export const SHRINE_Y = SHRINE_H;

/** Ramp contribution (natural rock wedges). Returns [extraHeight, isRamp]. */
function rampAt(x, z) {
  let best = 0;
  for (const r of LAYOUT.ramps) {
    const fx = Math.cos(r.dir), fz = Math.sin(r.dir);
    const dx = x - r.x, dz = z - r.z;
    const u = dx * fx + dz * fz, v = -dx * fz + dz * fx;
    if (u < -1 || u > r.len + 1.5 || Math.abs(v) > r.width / 2 + 1.2) continue;
    const edge = 1 - smoothstep(r.width / 2 - 0.6, r.width / 2 + 1.2, Math.abs(v));
    let k;
    if (u <= r.len) k = Math.pow(Math.max(0, u) / r.len, 1.6);
    else k = 1 - smoothstep(r.len, r.len + 1.5, u); // a short lip, then a drop: you fly
    best = Math.max(best, r.h * k * edge);
  }
  return best;
}

function heightAt(x, z) {
  let h = rawHeight(x, z);
  // dirt road: a little flatter
  const pd = pathDist(x, z);
  h = lerp(h, h * 0.75 + 0.3, 1 - smoothstep(2, 5, pd));
  // the meadow arena is flat
  const dm = Math.hypot(x - LAYOUT.meadow.x, z - LAYOUT.meadow.z);
  h = lerp(h, MEADOW_H, 1 - smoothstep(LAYOUT.meadow.r - 2, LAYOUT.meadow.r + 4, dm));
  // shrine stunt bowl: flat floor, walls curving up, a raised altar platform with ramps
  const ds = Math.hypot(x - WORLD.shrine.x, z - WORLD.shrine.z);
  if (ds < 20) {
    const wall = smoothstep(6, 13.5, ds) * 3.4 - smoothstep(14, 18, ds) * 3.4;
    const altar = (1 - smoothstep(2.4, 4.2, ds)) * 0.9;
    h = lerp(h, SHRINE_H + wall + altar, 1 - smoothstep(15, 20, ds));
  }
  // shallow pond: drivable mud under the water
  const dp = Math.hypot(x - WORLD.pond.x, z - WORLD.pond.z);
  const wob = (fbm(x * 0.2, z * 0.2, 2) - 0.5) * 3;
  const bowl = 1 - smoothstep(WORLD.pond.r * 0.4, WORLD.pond.r + 4 + wob, dp);
  h = lerp(h, WORLD.waterY - 0.75, bowl);
  // natural rock launch ramps
  h += rampAt(x, z);
  return h;
}

class Heightfield {
  constructor() {
    this.n = WORLD.half * 2 + 1;
    this.h = new Float32Array(this.n * this.n);
    for (let iz = 0; iz < this.n; iz++) for (let ix = 0; ix < this.n; ix++) this.h[iz * this.n + ix] = heightAt(ix - WORLD.half, iz - WORLD.half);
  }
  at(x, z) {
    const fx = clamp(x + WORLD.half, 0, this.n - 1.001), fz = clamp(z + WORLD.half, 0, this.n - 1.001);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const n = this.n, h = this.h;
    const a = h[iz * n + ix], b = h[iz * n + ix + 1], c = h[(iz + 1) * n + ix], d = h[(iz + 1) * n + ix + 1];
    if (tx + tz < 1) return a + (b - a) * tx + (c - a) * tz;
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }
  /** Surface normal (writes into out[0..2]). */
  normal(x, z, out) {
    const e = 0.5;
    const dx = this.at(x + e, z) - this.at(x - e, z);
    const dz = this.at(x, z + e) - this.at(x, z - e);
    const l = Math.hypot(dx, 2 * e, dz);
    out[0] = -dx / l; out[1] = (2 * e) / l; out[2] = -dz / l;
    return out;
  }
  normalY(x, z) {
    const dx = this.at(x + 1, z) - this.at(x - 1, z), dz = this.at(x, z + 1) - this.at(x, z - 1);
    return 2 / Math.hypot(dx, 2, dz);
  }
}

/** Static obstacles as vertical cylinders (trees, rocks, pillars) in a uniform grid. */
export class StaticGrid {
  constructor(cell = 8) { this.cell = cell; this.map = new Map(); }
  key(ix, iz) { return ix * 4096 + iz; }
  add(o) {
    const c = this.cell;
    for (let ix = Math.floor((o.x - o.r) / c); ix <= Math.floor((o.x + o.r) / c); ix++) {
      for (let iz = Math.floor((o.z - o.r) / c); iz <= Math.floor((o.z + o.r) / c); iz++) {
        const k = this.key(ix, iz);
        let l = this.map.get(k);
        if (!l) this.map.set(k, (l = []));
        l.push(o);
      }
    }
    return o;
  }
  query(x, z) { return this.map.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))); }
}

export class World {
  constructor(app, layers, tier) {
    this.app = app;
    this.device = app.graphicsDevice;
    this.layers = layers;
    this.hf = null;
    this.statics = new StaticGrid();
    this.clusters = [];
    this.grassDensity = 1;
    this.fireflyCount = 0;
    this.drawDistance = 80;
    this.visibleClusters = 0;
    this.pillars = [];
    this.root = new pc.Entity('world');
    app.root.addChild(this.root);
    this.maxGrassPerM2 = [0.12, 0.25, 0.45, 0.7, 0.9][tier];
    this.mats = {
      terrain: worldMaterial({}),
      props: worldMaterial({ inst: true, sway: 0.22 }),
      rocks: worldMaterial({ inst: true }),
      grass: worldMaterial({ inst: true, push: true, sway: 0.35, doubleSided: true }),
      ruins: worldMaterial({}),
      fireflies: worldMaterial({ inst: true, fly: true, emissive: 1.4 }),
      water: waterMaterial(),
    };
  }

  steps() {
    return [
      ['shaping the glade', () => { this.hf = new Heightfield(); }],
      ['raising the ramps', () => this.buildTerrain()],
      ['flooding the mud pond', () => this.buildWater()],
      ['growing the dead forest', () => this.buildProps()],
      ['growing tall grass', () => this.buildGrass()],
      ['building the stunt bowl', () => this.buildRuins()],
      ['lighting the fog', () => this.buildFireflies()],
    ];
  }

  showEverything() {
    for (const c of this.clusters) { c.mi.visible = true; if (c.kind === 'grass') c.mi.instancingCount = c.base; }
    this.fireflies.mi.visible = true;
    this.fireflies.mi.instancingCount = this.fireflies.max;
  }

  height(x, z) { return this.hf.at(x, z); }
  groundAt(x, z) { return this.hf.at(x, z); }

  addEntity(name, mis, inReflection) {
    const e = new pc.Entity(name);
    e.addComponent('render', { meshInstances: mis, castShadows: false, receiveShadows: false, layers: inReflection ? [this.layers.world.id, this.layers.reflect.id] : [this.layers.world.id] });
    for (const mi of mis) if (mi.cullAabb) mi.setCustomAabb(mi.cullAabb);
    this.root.addChild(e);
    return e;
  }

  nearPond(x, z, margin) { return Math.hypot(x - WORLD.pond.x, z - WORLD.pond.z) < WORLD.pond.r + margin; }

  /** Keep the drivable spaces open. */
  clearZone(x, z) {
    const L = LAYOUT;
    const near = (p, r) => Math.hypot(x - p.x, z - p.z) < r;
    if (near(L.shrine, 21) || near(L.meadow, L.meadow.r + 3) || this.nearPond(x, z, 5)) return true;
    if (pathDist(x, z) < 5) return true;
    if (rampAt(x, z) > 0.01) return true;
    for (const r of L.ramps) { // run-up lane before each ramp
      const fx = Math.cos(r.dir), fz = Math.sin(r.dir);
      if (distToSegment(x, z, r.x - fx * 14, r.z - fz * 14, r.x + fx * (r.len + 12), r.z + fz * (r.len + 12)) < r.width / 2 + 2.5) return true;
    }
    if (L.spawns.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 7)) return true;
    if (L.crates.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 4)) return true;
    if (L.barrels.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 4)) return true;
    const f = L.snapForest;
    if (x > f.x0 - 2 && x < f.x1 + 2 && z > f.z0 - 2 && z < f.z1 + 2) return true; // the snappable band is placed separately
    return false;
  }

  makeInstanced(mesh, mat, data, count, aabb) {
    const vb = new pc.VertexBuffer(this.device, instanceFormat(this.device), count, { data });
    const mi = new pc.MeshInstance(mesh, mat);
    mi.setInstancing(vb, true);
    mi.cullAabb = aabb;
    return mi;
  }

  meadowMask(x, z) {
    let m = fbm(x * 0.07 + 40, z * 0.07 - 12, 2);
    const d = Math.hypot(x - LAYOUT.meadow.x, z - LAYOUT.meadow.z) / LAYOUT.meadow.r;
    m = Math.max(m, 0.7 * (1 - smoothstep(0.8, 1.1, d)));
    return m;
  }

  terrainColour(x, z, h, ny) {
    const v = fbm(x * 0.15, z * 0.15, 2);
    if (rampAt(x, z) > 0.15) { const g = 0.2 + v * 0.06; return rgba(g, g * 1.02, g * 0.98, CLS.STONE); }
    if (h < WORLD.waterY + 0.35) { const t = clamp((h - WORLD.waterY + 0.8) / 1.2, 0, 1); return rgba(0.1 + t * 0.06, 0.085 + t * 0.05, 0.06 + t * 0.03, CLS.GROUND); }
    const ds = Math.hypot(x - WORLD.shrine.x, z - WORLD.shrine.z);
    if (ds < 15) { const tile = hash2(Math.floor(x * 0.7), Math.floor(z * 0.7)); const g = 0.19 + tile * 0.08; return rgba(g * 0.95, g, g * 0.93, CLS.STONE); }
    if (pathDist(x, z) < 2.6 + v) return rgba(0.2 + v * 0.06, 0.15 + v * 0.05, 0.1, CLS.GROUND);
    if (ny < 0.72) return rgba(0.17 + v * 0.06, 0.18 + v * 0.06, 0.18 + v * 0.06, CLS.STONE);
    if (this.meadowMask(x, z) > 0.44) return rgba(0.09 + v * 0.05, 0.13 + v * 0.07, 0.055 + v * 0.03, CLS.GRASS);
    return rgba(0.11 + v * 0.05, 0.12 + v * 0.06, 0.075 + v * 0.03, CLS.GROUND);
  }

  buildTerrain() {
    const size = 32, chunks = (WORLD.half * 2) / size, mis = [];
    for (let cz = 0; cz < chunks; cz++) {
      for (let cx = 0; cx < chunks; cx++) {
        const mb = new MeshBuilder();
        const x0 = -WORLD.half + cx * size, z0 = -WORLD.half + cz * size, n = size + 1;
        for (let iz = 0; iz < n; iz++) {
          for (let ix = 0; ix < n; ix++) {
            const x = x0 + ix, z = z0 + iz, h = this.hf.at(x, z);
            const dx = this.hf.at(x + 1, z) - this.hf.at(x - 1, z), dz = this.hf.at(x, z + 1) - this.hf.at(x, z - 1);
            const l = Math.hypot(dx, 2, dz);
            mb.vert(x, h, z, -dx / l, 2 / l, -dz / l, this.terrainColour(x, z, h, 2 / l));
          }
        }
        for (let iz = 0; iz < n - 1; iz++) for (let ix = 0; ix < n - 1; ix++) { const a = iz * n + ix, b = a + 1, c = a + n, d = c + 1; mb.tri(a, c, b); mb.tri(b, c, d); }
        const mi = new pc.MeshInstance(mb.build(this.device), this.mats.terrain);
        mis.push(mi);
        this.clusters.push({ mi, x: x0 + size / 2, z: z0 + size / 2, radius: size * 0.71, base: 0, kind: 'terrain' });
      }
    }
    this.addEntity('terrain', mis, false);
  }

  buildWater() {
    const { x, z, r } = WORLD.pond;
    const mb = new MeshBuilder(), seg = 24, R = r + 6, col = rgba(0, 0, 0, CLS.WATER);
    const c = mb.vert(0, 0, 0, 0, 1, 0, col);
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; mb.vert(Math.cos(a) * R, 0, Math.sin(a) * R, 0, 1, 0, col); }
    for (let i = 0; i < seg; i++) mb.tri(c, c + i + 2, c + i + 1);
    const mesh = new pc.Mesh(this.device);
    mesh.setPositions(mb.p); mesh.setIndices(mb.i); mesh.update(pc.PRIMITIVE_TRIANGLES);
    const mi = new pc.MeshInstance(mesh, this.mats.water);
    const e = this.addEntity('water', [mi], false);
    e.setPosition(x, WORLD.waterY, z);
    this.water = { mi, sphere: new pc.BoundingSphere(new pc.Vec3(x, WORLD.waterY, z), R) };
  }

  buildProps() {
    const rng = mulberry32(1234), size = 32, chunks = (WORLD.half * 2) / size;
    this.propMeshes = { pine: pineMesh(this.device), dead: deadTreeMesh(this.device, 31), dead2: deadTreeMesh(this.device, 77), rock: rockMesh(this.device) };
    const buckets = new Map();
    const add = (kind, x, y, z, s, rot, tint, seed) => {
      const k = clamp(Math.floor((z + WORLD.half) / size), 0, chunks - 1) * chunks + clamp(Math.floor((x + WORLD.half) / size), 0, chunks - 1);
      let b = buckets.get(k);
      if (!b) buckets.set(k, (b = { pine: [], dead: [], dead2: [], rock: [] }));
      b[kind].push(x, y, z, s, rot, tint, seed, 0);
    };
    let placed = 0;
    for (let i = 0; i < 9000 && placed < 300; i++) {
      const x = (rng() * 2 - 1) * WORLD.half, z = (rng() * 2 - 1) * WORLD.half;
      const r = Math.hypot(x, z);
      if (r > 77 || this.clearZone(x, z)) continue;
      const density = 0.07 + smoothstep(46, 66, r) * 0.9 + (fbm(x * 0.04, z * 0.04, 2) - 0.5) * 0.4; // open arena, thick rim
      if (rng() > density) continue;
      const roll = rng();
      const kind = roll < 0.38 ? 'dead' : roll < 0.76 || r < 42 ? 'dead2' : 'pine'; // low, wide pines only out on the rim
      const s = (1.2 + rng() * 0.8 + smoothstep(50, 75, r) * 0.6) * (kind === 'pine' ? 1.1 : 1.0);
      add(kind, x, this.hf.at(x, z) - 0.1, z, s, rng() * Math.PI * 2, 0.8 + rng() * 0.4, rng());
      this.statics.add({ x, z, r: 0.32 * s, top: 99, kind: 'tree' });
      placed++;
    }
    // scattered boulders + the pond-shore stones
    for (let i = 0; i < 120; i++) {
      let x, z;
      if (i < 18) { const a = rng() * Math.PI * 2, d = WORLD.pond.r + 4 + rng() * 4; x = WORLD.pond.x + Math.cos(a) * d; z = WORLD.pond.z + Math.sin(a) * d; }
      else { x = (rng() * 2 - 1) * WORLD.half; z = (rng() * 2 - 1) * WORLD.half; }
      if (Math.hypot(x, z) > 76 || (i >= 18 && this.clearZone(x, z)) || pathDist(x, z) < 4 || rampAt(x, z) > 0) continue;
      const s = 0.6 + rng() * 1.2;
      add('rock', x, this.hf.at(x, z) - 0.15 * s, z, s, rng() * Math.PI * 2, 0.8 + rng() * 0.4, rng());
      this.statics.add({ x, z, r: 0.6 * s, top: this.hf.at(x, z) + 0.75 * s, kind: 'rock' });
    }
    // boulders flanking each ramp so they read as natural rock
    for (const r of LAYOUT.ramps) {
      const fx = Math.cos(r.dir), fz = Math.sin(r.dir), px = -fz, pz = fx;
      for (const side of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const u = r.len * (0.35 + k * 0.3), x = r.x + fx * u + px * side * (r.width / 2 + 1.0), z = r.z + fz * u + pz * side * (r.width / 2 + 1.0);
          const s = 1.0 + k * 0.45 + rng() * 0.3;
          add('rock', x, this.hf.at(x, z) - 0.2 * s, z, s, rng() * 6.28, 0.9, rng());
          this.statics.add({ x, z, r: 0.6 * s, top: this.hf.at(x, z) + 0.75 * s, kind: 'rock' });
        }
      }
    }
    const worldMis = [], reflMis = [];
    const heights = { pine: 4.6, dead: 10, dead2: 10, rock: 1.0 };
    for (const b of buckets.values()) {
      for (const kind of ['pine', 'dead', 'dead2', 'rock']) {
        const arr = b[kind];
        if (!arr.length) continue;
        const count = arr.length / 8;
        let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
        for (let i = 0; i < arr.length; i += 8) {
          const s = arr[i + 3], m = (kind === 'rock' ? 1.0 : kind === 'pine' ? 1.8 : 4.2) * s;
          minX = Math.min(minX, arr[i] - m); maxX = Math.max(maxX, arr[i] + m);
          minZ = Math.min(minZ, arr[i + 2] - m); maxZ = Math.max(maxZ, arr[i + 2] + m);
          minY = Math.min(minY, arr[i + 1]); maxY = Math.max(maxY, arr[i + 1] + heights[kind] * s);
        }
        const aabb = new pc.BoundingBox();
        aabb.setMinMax(new pc.Vec3(minX, minY, minZ), new pc.Vec3(maxX, maxY, maxZ));
        const mi = this.makeInstanced(this.propMeshes[kind], kind === 'rock' ? this.mats.rocks : this.mats.props, new Float32Array(arr), count, aabb);
        const cxw = (minX + maxX) / 2, czw = (minZ + maxZ) / 2, radius = Math.hypot(maxX - minX, maxZ - minZ) / 2;
        this.clusters.push({ mi, x: cxw, z: czw, radius, base: count, kind });
        (Math.hypot(cxw - WORLD.pond.x, czw - WORLD.pond.z) < radius + WORLD.pond.r + 6 ? reflMis : worldMis).push(mi);
      }
    }
    this.addEntity('props', worldMis, false);
    this.addEntity('props-reflected', reflMis, true);
  }

  buildGrass() {
    const rng = mulberry32(99), size = 16, chunks = (WORLD.half * 2) / size, mesh = grassTuftMesh(this.device), mis = [];
    for (let cz = 0; cz < chunks; cz++) {
      for (let cx = 0; cx < chunks; cx++) {
        const x0 = -WORLD.half + cx * size, z0 = -WORLD.half + cz * size;
        if (Math.hypot(x0 + size / 2, z0 + size / 2) > 74) continue;
        const pts = [];
        for (let i = 0, tries = Math.round(size * size * this.maxGrassPerM2); i < tries; i++) {
          const x = x0 + rng() * size, z = z0 + rng() * size;
          const patch = this.meadowMask(x, z);
          if (patch < 0.48 || pathDist(x, z) < 2.6 || this.nearPond(x, z, 0.5) || rampAt(x, z) > 0) continue;
          if (Math.hypot(x - WORLD.shrine.x, z - WORLD.shrine.z) < 16) continue;
          const h = this.hf.at(x, z);
          if (h < WORLD.waterY + 0.4 || this.hf.normalY(x, z) < 0.75) continue;
          pts.push([x, h - 0.05, z, (0.8 + rng() * 0.7 * (patch - 0.3) * 2) * 0.55, // toy-scale tufts: knee-high to a buggy
             rng() * Math.PI * 2, 0.75 + rng() * 0.5, rng(), 0]);
        }
        if (!pts.length) continue;
        for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
        const data = new Float32Array(pts.length * 8);
        pts.forEach((p, i) => data.set(p, i * 8));
        let minY = 1e9, maxY = -1e9;
        for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1] + 1.4); }
        const aabb = new pc.BoundingBox();
        aabb.setMinMax(new pc.Vec3(x0 - 1, minY, z0 - 1), new pc.Vec3(x0 + size + 1, maxY, z0 + size + 1));
        const mi = this.makeInstanced(mesh, this.mats.grass, data, pts.length, aabb);
        mis.push(mi);
        this.clusters.push({ mi, x: x0 + size / 2, z: z0 + size / 2, radius: size * 0.71, base: pts.length, kind: 'grass' });
      }
    }
    if (mis.length) this.addEntity('grass', mis, false);
  }

  /** The shrine stunt bowl: ring of pillars around the bowl rim, an altar on the raised platform. */
  buildRuins() {
    const rng = mulberry32(7);
    const { x: sx, z: sz } = WORLD.shrine;
    const mb = new MeshBuilder();
    const stone = (v) => rgba(0.27 + v, 0.29 + v, 0.26 + v, CLS.STONE);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2;
      const x = sx + Math.cos(a) * 9.5, z = sz + Math.sin(a) * 9.5;
      const y0 = this.hf.at(x, z);
      const broken = i === 4 || i === 8 || (i !== 6 && rng() < 0.25);
      const h = broken ? 1.4 + rng() * 1.0 : 3.2 + rng() * 0.6;
      addBox(mb, { x, y: y0 + h / 2 - 0.2, z, sx: 1.0, sy: h, sz: 1.0, rot: -a, col: (t) => stone(t * 0.08 - 0.04) });
      if (!broken) addBox(mb, { x, y: y0 + h + 0.1, z, sx: 1.4, sy: 0.3, sz: 1.4, rot: -a, col: stone(0.04) });
      this.statics.add({ x, z, r: 0.75, top: y0 + h + 0.25, kind: 'pillar' });
      this.pillars.push({ x, z, top: y0 + h + 0.25, broken });
    }
    // altar block on the raised platform (barrels stack on it)
    const ay = this.hf.at(sx, sz);
    addBox(mb, { x: sx, y: ay + 0.35, z: sz, sx: 1.6, sy: 0.7, sz: 1.2, col: stone(0.02) });
    // the crooked archway out of the bowl, facing east toward the road
    const ax = sx + 15, az = sz + 1;
    const ay2 = this.hf.at(ax, az);
    addBox(mb, { x: ax, y: ay2 + 2.0, z: az - 2.6, sx: 0.7, sy: 4.0, sz: 0.7, rot: 0.1, col: stone(0) });
    addBox(mb, { x: ax + 0.3, y: ay2 + 1.9, z: az + 2.6, sx: 0.7, sy: 3.8, sz: 0.7, rot: 0.1, col: stone(0) });
    addBox(mb, { x: ax + 0.15, y: ay2 + 4.1, z: az, sx: 0.9, sy: 0.6, sz: 6.4, rot: 0.1, tilt: 0.05, col: stone(0.05) });
    this.statics.add({ x: ax, z: az - 2.6, r: 0.5, top: 99, kind: 'pillar' });
    this.statics.add({ x: ax + 0.3, z: az + 2.6, r: 0.5, top: 99, kind: 'pillar' });
    this.addEntity('ruins', [new pc.MeshInstance(mb.build(this.device), this.mats.ruins)], false);
  }

  buildFireflies() {
    const rng = mulberry32(55), max = 320, data = new Float32Array(max * 8);
    for (let n = 0; n < max; n++) {
      const a = rng() * Math.PI * 2, d = 4 + rng() * 60;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const y = Math.max(this.hf.at(x, z), WORLD.waterY) + 0.8 + rng() * 1.8;
      data.set([x, y, z, 0.8 + rng() * 0.6, 0, 1, rng(), 0], n * 8);
    }
    const aabb = new pc.BoundingBox(new pc.Vec3(0, 6, 0), new pc.Vec3(WORLD.half, 12, WORLD.half));
    const mi = this.makeInstanced(fireflyMesh(this.device), this.mats.fireflies, data, max, aabb);
    this.fireflies = { mi, max };
    this.addEntity('embers', [mi], true);
  }

  setQuality(q) { this.grassDensity = q.grass; this.fireflyCount = q.fireflies; this.drawDistance = q.drawDistance; }

  update(fx, fz, camX, camZ) {
    const dd = this.drawDistance;
    let vis = 0;
    for (const c of this.clusters) {
      const d = Math.min(Math.hypot(c.x - fx, c.z - fz), Math.hypot(c.x - camX, c.z - camZ)) - c.radius;
      if (c.kind === 'grass') {
        const lod = d < 10 ? 1 : d < 22 ? 0.5 : d < 34 ? 0.2 : 0;
        const n = Math.floor(c.base * lod * this.grassDensity);
        c.mi.visible = n > 0;
        if (n > 0) c.mi.instancingCount = n;
      } else c.mi.visible = d < dd;
      if (c.mi.visible) vis++;
    }
    const ff = this.fireflies;
    ff.mi.visible = this.fireflyCount > 0;
    if (ff.mi.visible) ff.mi.instancingCount = Math.min(ff.max, this.fireflyCount);
    this.visibleClusters = vis;
  }
}

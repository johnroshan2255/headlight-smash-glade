// Particles for the side view, batched into three dynamic meshes:
//  glow  (additive amber): fireballs, sparks, shockwave rings, embers
//  sil   (black silhouettes): debris chunks
//  tint  (alpha blended): smoke, steam, dust, splashes
import * as pc from 'playcanvas';
import { silMaterial, glowMaterial, tintMaterial } from './sil.js';
import { CLS } from './shaders.js';

const SEG = 8; // fan segments per glow particle

class Batch {
  constructor(app, layer, mat, cap, vertsPer, trisPer) {
    this.cap = cap;
    this.vp = vertsPer;
    this.pos = new Float32Array(cap * vertsPer * 3);
    this.col = new Uint8Array(cap * vertsPer * 4);
    this.mesh = new pc.Mesh(app.graphicsDevice);
    const idx = [];
    for (let q = 0; q < cap; q++) for (const t of trisPer) idx.push(q * vertsPer + t[0], q * vertsPer + t[1], q * vertsPer + t[2]);
    this.mesh.setPositions(this.pos);
    this.mesh.setColors32(this.col);
    this.mesh.setIndices(idx);
    this.mesh.update(pc.PRIMITIVE_TRIANGLES);
    this.mesh.incRefCount();
    const mi = new pc.MeshInstance(this.mesh, mat);
    mi.cull = false;
    const e = new pc.Entity('fx');
    e.addComponent('render', { meshInstances: [mi], layers: [layer.id], castShadows: false, receiveShadows: false });
    app.root.addChild(e);
    this.n = 0;
  }
  begin() { this.n = 0; }
  end() {
    // collapse unused slots
    this.pos.fill(0, this.n * this.vp * 3);
    this.mesh.setPositions(this.pos);
    this.mesh.setColors32(this.col);
    this.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
  }
}

const fanTris = Array.from({ length: SEG }, (_, i) => [0, 1 + i, 1 + ((i + 1) % SEG)]);
const ringTris = [];
for (let i = 0; i < 16; i++) { const a = i * 2, b = ((i + 1) % 16) * 2; ringTris.push([a, b, a + 1], [a + 1, b, b + 1]); }

export class FX2D {
  constructor(app, layer) {
    this.app = app;
    this.glow = new Batch(app, layer, glowMaterial(1.0), 260, SEG + 1, fanTris);
    this.ringB = new Batch(app, layer, glowMaterial(1.0), 6, 32, ringTris);
    this.silB = new Batch(app, layer, silMaterial({ cls: CLS.CHAR }), 220, 3, [[0, 1, 2]]);
    this.tint = new Batch(app, layer, tintMaterial(), 420, SEG + 1, fanTris);
    this.parts = [];
    this.rings = [];
    this.flashes = []; // {x, y, r, k, t, life}: lights for the shaders
    this.shake = 0;
  }

  add(p) { if (this.parts.length < 900) this.parts.push(p); }

  explosion(x, y, size = 1, camX = x) {
    this.flashes.push({ x, y, r: 9 * size, k: 2.2, t: 0, life: 0.55 });
    this.add({ kind: 'fire', x, y, z: 0.8, vx: 0, vy: 0.6, t: 0, life: 0.55, size: 3.2 * size });
    for (let i = 0; i < 4; i++) this.add({ kind: 'fire', x: x + (Math.random() - 0.5) * 1.5 * size, y: y + Math.random() * size, z: 0.8, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 3, t: 0, life: 0.4 + Math.random() * 0.3, size: (1.2 + Math.random()) * size });
    for (let i = 0; i < 26 * size; i++) { const a = Math.random() * Math.PI, s = 6 + Math.random() * 14; this.add({ kind: 'spark', x, y, z: 0.9, vx: Math.cos(a) * s * (Math.random() < 0.5 ? -1 : 1), vy: Math.sin(a) * s, t: 0, life: 0.5 + Math.random() * 0.7, size: 0.12, g: -14 }); }
    for (let i = 0; i < 16 * size; i++) { const a = Math.random() * Math.PI, s = 4 + Math.random() * 10; this.add({ kind: 'debris', x, y, z: 0.5 + Math.random(), vx: Math.cos(a) * s * (Math.random() < 0.5 ? -1 : 1), vy: Math.sin(a) * s, t: 0, life: 1.4 + Math.random(), size: 0.12 + Math.random() * 0.25, g: -19, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 20 }); }
    for (let i = 0; i < 9 * size; i++) this.add({ kind: 'smoke', x: x + (Math.random() - 0.5) * 2 * size, y: y + Math.random() * size, z: 0.3, vx: (Math.random() - 0.5) * 1.5, vy: 1 + Math.random() * 2, t: -Math.random() * 0.25, life: 2.2 + Math.random() * 1.5, size: (1.2 + Math.random() * 1.2) * size });
    this.shake = Math.min(1.4, this.shake + size * (1 - Math.min(1, Math.abs(x - camX) / 40)));
  }
  sparkBurst(x, y, n = 8, speed = 6) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random()); this.add({ kind: 'spark', x, y, z: 0.9, vx: Math.cos(a) * s, vy: Math.abs(Math.sin(a)) * s, t: 0, life: 0.25 + Math.random() * 0.35, size: 0.09, g: -14 }); } }
  steam(x, y, n = 6, up = 6) { for (let i = 0; i < n; i++) this.add({ kind: 'steam', x: x + (Math.random() - 0.5) * 1.2, y, z: 0.95, vx: (Math.random() - 0.5) * 1.2, vy: up * (0.6 + Math.random() * 0.6), t: 0, life: 0.9 + Math.random() * 0.8, size: 0.6 + Math.random() * 0.8 }); }
  dust(x, y, n = 1, dir = 0) { for (let i = 0; i < n; i++) this.add({ kind: 'dust', x: x + (Math.random() - 0.5) * 0.4, y: y + 0.1, z: 0.7, vx: -dir * (1 + Math.random() * 2), vy: 0.5 + Math.random(), t: 0, life: 0.7 + Math.random() * 0.6, size: 0.35 + Math.random() * 0.4 }); }
  splash(x, y, n = 10) { for (let i = 0; i < n; i++) { const a = Math.PI * (0.15 + Math.random() * 0.7); this.add({ kind: 'steam', x, y, z: 1.0, vx: Math.cos(a) * 5, vy: Math.sin(a) * 6, t: 0, life: 0.6 + Math.random() * 0.4, size: 0.25 + Math.random() * 0.3, g: -16 }); } }
  ring(x, y, max = 8, a = 1, speed = 20) { this.rings.push({ x, y, r: 0.5, max, a, speed }); if (this.rings.length > 6) this.rings.shift(); }

  update(dt) {
    this.shake = Math.max(0, this.shake - dt * 2.2);
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < f.life);
    const G = this.glow, S = this.silB, T = this.tint;
    G.begin(); S.begin(); T.begin();
    const keep = [];
    for (const p of this.parts) {
      p.t += dt;
      if (p.t > p.life) continue;
      keep.push(p);
      if (p.t < 0) continue;
      p.vy += (p.g || 0) * dt;
      if (p.kind === 'smoke' || p.kind === 'steam' || p.kind === 'dust' || p.kind === 'fog') { p.vx *= 1 - dt * 0.8; p.vy *= 1 - dt * 0.9; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = p.t / p.life;
      if (p.kind === 'fire' || p.kind === 'spark') {
        if (G.n >= G.cap) continue;
        const r = p.kind === 'fire' ? p.size * (0.6 + k * 0.7) : p.size * (1 + Math.hypot(p.vx, p.vy) * 0.03);
        const a = p.kind === 'fire' ? (1 - k) ** 1.5 : 1 - k;
        this.fan(G, p.x, p.y, p.z, r, [255, p.kind === 'fire' ? 170 - k * 80 : 190, p.kind === 'fire' ? 70 : 110], a * (p.kind === 'fire' ? 1 : 0.9));
      } else if (p.kind === 'debris') {
        if (S.n >= S.cap) continue;
        p.rot += p.spin * dt;
        const o = S.n * 9, r = p.size;
        for (let v = 0; v < 3; v++) { const ang = p.rot + v * 2.1 + (v === 2 ? 0.6 : 0); S.pos[o + v * 3] = p.x + Math.cos(ang) * r; S.pos[o + v * 3 + 1] = p.y + Math.sin(ang) * r; S.pos[o + v * 3 + 2] = p.z; }
        for (let v = 0; v < 3; v++) S.col.set([5, 5, 5, CLS.CHAR * 32], (S.n * 3 + v) * 4);
        S.n++;
        if (p.y < -30) p.t = p.life;
      } else {
        if (T.n >= T.cap) continue;
        const r = p.size * (1 + k * (p.kind === 'smoke' ? 1.8 : 1.0));
        // fog (the smoke bomb) is the colour of the mist itself, thick enough to swallow a buggy
        const a = p.kind === 'fog' ? 0.9 * Math.min(1, (1 - k) * 2.5) * Math.min(1, p.t * 3) : (p.kind === 'smoke' ? 0.55 : p.kind === 'steam' ? 0.5 : 0.35) * (1 - k) * Math.min(1, p.t * 6);
        const c = p.kind === 'smoke' ? [22, 22, 22] : p.kind === 'steam' ? [190, 200, 200] : p.kind === 'fog' ? [92, 104, 100] : [40, 40, 38];
        this.fan(T, p.x, p.y, p.z, r, c, a, true);
      }
    }
    this.parts = keep;
    // rings
    const R = this.ringB;
    R.begin();
    for (const g of this.rings) g.r += g.speed * dt;
    this.rings = this.rings.filter((g) => g.r < g.max);
    for (const g of this.rings) {
      const o = R.n * 32, k = g.r / g.max, a = Math.round(255 * g.a * (1 - k) * 0.6);
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
        R.pos.set([g.x + c * g.r, g.y + s * g.r, 1.1, g.x + c * (g.r + 0.6), g.y + s * (g.r + 0.6), 1.1], (o + i * 2) * 3);
        R.col.set([255, 200, 140, a, 255, 200, 140, 0], (o + i * 2) * 4);
      }
      R.n++;
    }
    G.end(); S.end(); T.end(); R.end();
  }

  fan(B, x, y, z, r, rgb, a, soft) {
    const o = B.n * (SEG + 1);
    B.pos.set([x, y, z], o * 3);
    B.col.set([rgb[0], rgb[1], rgb[2], Math.round(255 * Math.min(1, a))], o * 4);
    for (let i = 0; i < SEG; i++) {
      const ang = (i / SEG) * Math.PI * 2;
      B.pos.set([x + Math.cos(ang) * r, y + Math.sin(ang) * r, z], (o + 1 + i) * 3);
      B.col.set([rgb[0], rgb[1], rgb[2], soft ? Math.round(255 * Math.min(1, a) * 0.0) : 0], (o + 1 + i) * 4);
    }
    B.n++;
  }
}

// Explosions and spectacle: amber fireballs, sparks, debris, smoke/steam puffs, shockwave rings,
// light flashes and camera shake. Particles are instanced (one draw call per kind) and pooled.
import * as pc from 'playcanvas';
import { CLS, worldMaterial, instanceFormat } from './shaders.js';
import { MeshBuilder, rgba, addSphere, addBox } from './meshes.js';

class Particles {
  constructor(app, layers, mesh, mat, max) {
    this.max = max;
    this.data = new Float32Array(max * 8);
    this.p = []; // { x,y,z, vx,vy,vz, life, max, size, rot, spin, tint, grav, drag }
    const device = app.graphicsDevice;
    this.vb = new pc.VertexBuffer(device, instanceFormat(device), max, { usage: pc.BUFFER_DYNAMIC, data: this.data });
    this.mi = new pc.MeshInstance(mesh, mat);
    this.mi.setInstancing(this.vb, false);
    this.mi.cull = false;
    const e = new pc.Entity('particles');
    e.addComponent('render', { meshInstances: [this.mi], layers: [layers.world.id], castShadows: false, receiveShadows: false });
    app.root.addChild(e);
  }

  emit(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({ rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 12, tint: 1, grav: -19, drag: 0.4, grow: 0, ...o, life: o.life, max: o.life });
  }

  update(dt, ground) {
    const P = this.p;
    let n = 0;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.life -= dt;
      if (q.life <= 0) { P.splice(i, 1); continue; }
      const k = Math.exp(-q.drag * dt);
      q.vx *= k; q.vz *= k; q.vy = q.vy * k + q.grav * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const g = ground(q.x, q.z);
      if (q.y < g + q.size * 0.3) { q.y = g + q.size * 0.3; q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; }
      q.rot += q.spin * dt;
    }
    for (const q of P) {
      const t = q.life / q.max;
      const s = q.size * (q.grow ? 1 + (1 - t) * q.grow : Math.min(1, t * 3));
      const o = n * 8;
      this.data[o] = q.x; this.data[o + 1] = q.y; this.data[o + 2] = q.z; this.data[o + 3] = s;
      this.data[o + 4] = q.rot; this.data[o + 5] = q.tint * (q.fade ? t : 1); this.data[o + 6] = 0; this.data[o + 7] = 0;
      n++;
    }
    this.mi.visible = n > 0;
    if (n) { this.mi.instancingCount = n; this.vb.unlock(0, n * 32); }
  }
}

export class FX {
  constructor(app, layers, world) {
    this.app = app;
    this.world = world;
    const device = app.graphicsDevice;
    const cube = new MeshBuilder();
    addBox(cube, { sx: 1, sy: 1, sz: 1, col: rgba(1.0, 0.6, 0.22, CLS.GLOW) });
    const chunk = new MeshBuilder();
    addBox(chunk, { sx: 1, sy: 0.6, sz: 0.8, col: rgba(0.09, 0.09, 0.1, CLS.CHAR) });
    const puff = new MeshBuilder();
    addSphere(puff, { r: 1, segW: 7, segH: 5, colFn: () => rgba(0.42, 0.43, 0.42, CLS.GROUND) });
    this.sparks = new Particles(app, layers, cube.build(device), worldMaterial({ inst: true, emissive: 3.0 }), 260);
    this.debris = new Particles(app, layers, chunk.build(device), worldMaterial({ inst: true }), 120);
    this.smoke = new Particles(app, layers, puff.build(device), worldMaterial({ inst: true }), 140);
    // fireballs: additive amber spheres, each with its own material for the fade
    const ball = new MeshBuilder();
    addSphere(ball, { r: 1, segW: 12, segH: 8, colFn: (ny) => rgba(1.0, 0.55 + ny * 0.15, 0.18, CLS.GLOW) });
    const ballMesh = ball.build(device);
    this.fireballs = Array.from({ length: 8 }, () => {
      const mat = worldMaterial({ emissive: 3.5 });
      mat.blendState = new pc.BlendState(true, pc.BLENDEQUATION_ADD, pc.BLENDMODE_ONE, pc.BLENDMODE_ONE, pc.BLENDEQUATION_ADD, pc.BLENDMODE_ZERO, pc.BLENDMODE_ONE);
      mat.depthWrite = false;
      mat.update();
      const e = new pc.Entity('fireball');
      e.addComponent('render', { meshInstances: [new pc.MeshInstance(ballMesh, mat)], layers: [layers.world.id], castShadows: false, receiveShadows: false });
      e.enabled = false;
      app.root.addChild(e);
      return { e, mat, t: 0, life: 0, r: 1, x: 0, y: 0, z: 0 };
    });
    this.flashes = []; // { x,y,z, r, t, life } -> fed to the light slots
    this.rings = []; // { x, z, r, max, a, speed }
    this.shake = 0;
  }

  /** A big amber explosion: fireball, sparks, debris, smoke, flash, ring, shake. */
  explosion(x, y, z, size = 1, camPos) {
    const fb = this.fireballs.find((f) => f.life <= 0) || this.fireballs[0];
    Object.assign(fb, { x, y: y + 0.6, z, t: 0, life: 0.7 + size * 0.25, r: 2.6 * size });
    fb.e.enabled = true;
    for (let i = 0; i < 38 * size; i++) {
      const a = Math.random() * 6.28, up = 4 + Math.random() * 14 * size, s = 2 + Math.random() * 10 * size;
      this.sparks.emit({ x, y: y + 0.5, z, vx: Math.cos(a) * s, vy: up, vz: Math.sin(a) * s, life: 0.6 + Math.random() * 0.9, size: 0.08 + Math.random() * 0.1, drag: 0.6 });
    }
    for (let i = 0; i < 6 * size; i++) {
      const a = Math.random() * 6.28, s = 3 + Math.random() * 7;
      this.debris.emit({ x, y: y + 0.4, z, vx: Math.cos(a) * s, vy: 6 + Math.random() * 9, vz: Math.sin(a) * s, life: 2 + Math.random() * 1.5, size: 0.12 + Math.random() * 0.25, drag: 0.1 });
    }
    for (let i = 0; i < 10 * size; i++) {
      const a = Math.random() * 6.28, s = 0.5 + Math.random() * 2.5;
      this.smoke.emit({ x: x + Math.cos(a), y: y + 0.6, z: z + Math.sin(a), vx: Math.cos(a) * s, vy: 1.5 + Math.random() * 2, vz: Math.sin(a) * s, life: 1.8 + Math.random() * 1.6, size: 0.6 + Math.random() * 0.8 * size, grav: 0.4, drag: 1.2, grow: 1.8, fade: true });
    }
    this.flashes.push({ x, y: y + 1.5, z, r: 16 * size, t: 0, life: 0.55 });
    this.ring(x, z, 9 * size, 1, 16);
    const d = camPos ? Math.hypot(camPos.x - x, camPos.z - z) : 10;
    this.shake = Math.min(1.2, this.shake + size * Math.max(0, 1 - d / 45));
  }

  sparkBurst(x, y, z, n = 10, speed = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28;
      this.sparks.emit({ x, y, z, vx: Math.cos(a) * speed * Math.random(), vy: 2 + Math.random() * speed, vz: Math.sin(a) * speed * Math.random(), life: 0.3 + Math.random() * 0.5, size: 0.05 + Math.random() * 0.06, drag: 1 });
    }
  }

  steam(x, y, z, n = 14, up = 9) {
    for (let i = 0; i < n; i++) this.smoke.emit({ x: x + (Math.random() - 0.5), y, z: z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 2, vy: up * (0.6 + Math.random() * 0.6), vz: (Math.random() - 0.5) * 2, life: 1.2 + Math.random(), size: 0.5 + Math.random() * 0.5, grav: -2, drag: 0.8, grow: 2.2, fade: true, tint: 1.25 });
  }

  dust(x, y, z, n = 3) {
    for (let i = 0; i < n; i++) this.smoke.emit({ x: x + (Math.random() - 0.5) * 0.6, y: y + 0.2, z: z + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5), vy: 0.6 + Math.random(), vz: (Math.random() - 0.5), life: 0.8 + Math.random() * 0.6, size: 0.25 + Math.random() * 0.25, grav: 0.2, drag: 2, grow: 1.6, fade: true, tint: 0.8 });
  }

  ring(x, z, max, a = 1, speed = 14) { this.rings.push({ x, z, r: 0.3, max, a, speed }); }

  update(dt) {
    const g = (x, z) => this.world.groundAt(x, z);
    this.sparks.update(dt, g);
    this.debris.update(dt, g);
    this.smoke.update(dt, () => -99);
    for (const f of this.fireballs) {
      if (f.life <= 0) { f.e.enabled = false; continue; }
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { f.life = 0; f.e.enabled = false; continue; }
      const s = f.r * (0.4 + Math.sqrt(k) * 0.9);
      f.e.setPosition(f.x, f.y + k * 1.5, f.z);
      f.e.setLocalScale(s, s * 0.85, s);
      f.mat.setParameter('uEmissive', 3.5 * (1 - k) * (1 - k));
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.t += dt; if (f.t > f.life) this.flashes.splice(i, 1); }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const R = this.rings[i];
      R.r += R.speed * dt;
      R.a *= Math.exp(-dt * 2.2);
      if (R.r > R.max || R.a < 0.03) this.rings.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 2.4);
  }
}

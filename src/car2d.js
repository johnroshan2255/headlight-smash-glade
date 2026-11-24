// A buggy seen from the side: black silhouette, one warm headlight beam cutting the fog.
// Physics: a 2D compound-circle chassis on two raycast springs (front + rear), driven along the
// ground tangent, so wheelies, stoppies, flips and nose-dives all fall out naturally.
import * as pc from 'playcanvas';
import { CLS } from './shaders.js';
import { MeshBuilder, rgba, addTube, addLathe, addSphere, addBox } from './meshes.js';
import { Body, G } from './physics2d.js';
import { hatMesh } from './hats.js';
import { vehicleSpec, chassisFor, SCALE } from './vehicles.js';
import { silMaterial, glowMaterial } from './sil.js';

export const CAR_COLOR_NAMES = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];
const BLACK = [0.02, 0.02, 0.02];
const BOOST_TOP_K = 1.45, ROCKET_TOP_K = 1.9;

function wheelMesh(device, R) {
  const mb = new MeshBuilder();
  const rub = () => rgba(0.05, 0.05, 0.05, CLS.CHAR);
  addTube(mb, [[-0.2, 0, 0, R - 0.05], [-0.24, 0, 0, R], [0.24, 0, 0, R], [0.2, 0, 0, R - 0.05]], { seg: 14, subdiv: 1, capEnd: true, capStart: true, colFn: rub });
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; addBox(mb, { y: Math.cos(a) * R, z: Math.sin(a) * R, sx: 0.46, sy: 0.08, sz: 0.12, tilt: -a, col: rub() }); }
  // spokes, so you can see the wheel turn against the fog
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI; addBox(mb, { x: 0.26, sx: 0.04, sy: R * 1.5, sz: 0.07, tilt: a, col: rgba(0.2, 0.2, 0.2, CLS.STONE) }); }
  return mb.build(device);
}

function gadgetMeshes(device) {
  const metal = () => rgba(0.1, 0.1, 0.1, CLS.STONE);
  const plow = new MeshBuilder();
  addBox(plow, { y: -0.1, z: 1.7, sx: 2.1, sy: 0.9, sz: 0.14, tilt: -0.5, col: metal() });
  for (let i = 0; i < 4; i++) addTube(plow, [[0, -0.5 + i * 0.3, 1.78, 0.07], [0, -0.55 + i * 0.3, 2.3, 0.0]], { seg: 4, colFn: metal });
  const flame = new MeshBuilder();
  addLathe(flame, [[0.0, 0.0], [0.25, 0.2], [0.18, 0.9], [0.0, 1.9]], { seg: 8, colFn: () => rgba(1.0, 0.6, 0.2, CLS.GLOW), warp: (x, y, z) => [x, z, -y] });
  const horn = new MeshBuilder();
  addLathe(horn, [[0.05, 0], [0.06, 0.45], [0.16, 0.7], [0.34, 0.84]], { seg: 10, colFn: metal, warp: (x, y, z) => [x, z + 0.6, y + 0.45] });
  const keg = new MeshBuilder();
  addLathe(keg, [[0.0, -0.22], [0.22, -0.2], [0.25, 0.0], [0.22, 0.2], [0.0, 0.22]], { seg: 10, colFn: metal, warp: (x, y, z) => [x, z + 0.3, y - 1.15] });
  const spring = new MeshBuilder();
  const coil = [];
  for (let i = 0; i <= 24; i++) { const a = i * 0.8; coil.push([Math.cos(a) * 0.18, -0.5 + i * 0.02, Math.sin(a) * 0.18, 0.035]); }
  for (const z of [1.0, -0.95]) addTube(spring, coil.map(([cx, cy, cz, rr]) => [cx, cy, cz + z, rr]), { seg: 3, subdiv: 1, colFn: metal });
  const dish = new MeshBuilder();
  addTube(dish, [[0, 0.3, -0.9, 0.03], [0, 1.6, -0.95, 0.02]], { seg: 3, colFn: metal });
  addSphere(dish, { y: 1.65, z: -0.95, r: 0.12, segW: 5, segH: 3, colFn: () => rgba(0.6, 1.0, 0.8, CLS.GLOW) });
  return { plow: plow.build(device), flame: flame.build(device), horn: horn.build(device), mine: keg.build(device), hop: spring.build(device), glitch: dish.build(device) };
}

/** The headlight beam: a thin, soft additive wedge like the one on the title screen. It fades
 *  along its length and towards both edges. Points along +x. */
function beamMesh(device) {
  const mesh = new pc.Mesh(device);
  const L = 14, spread = 0.15, segs = 10, rings = 6, tilt = -0.06;
  const pos = [], col = [], idx = [];
  for (let j = 0; j <= rings; j++) {
    const r = (j / rings) ** 1.3 * L, along = 1 - j / rings;
    for (let i = 0; i <= segs; i++) {
      const t = (i / segs) * 2 - 1, ang = t * spread + tilt; // -1..1 across the beam
      pos.push(Math.cos(ang) * r, Math.sin(ang) * r, 0);
      col.push(255, 214, 160, Math.round(255 * 0.42 * along ** 1.4 * (1 - Math.abs(t)) ** 1.5));
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) {
    const a = j * (segs + 1) + i, b = a + segs + 1;
    idx.push(a, b, b + 1, a, b + 1, a + 1);
  }
  mesh.setPositions(pos);
  mesh.setColors32(col);
  mesh.setIndices(idx);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  mesh.incRefCount();
  return mesh;
}
function haloMesh(device) {
  const mesh = new pc.Mesh(device);
  const pos = [0, 0, 0], col = [255, 224, 180, 150], idx = [];
  for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; pos.push(Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0); col.push(255, 200, 140, 0); if (i > 0) idx.push(0, i, i + 1); }
  mesh.setPositions(pos); mesh.setColors32(col); mesh.setIndices(idx); mesh.update(pc.PRIMITIVE_TRIANGLES);
  mesh.incRefCount();
  return mesh;
}

let shared = null;
function sharedAssets(device) {
  if (shared) return shared;
  const lamp = new MeshBuilder();
  addSphere(lamp, { r: 0.13, sy: 0.7, segW: 8, segH: 5, colFn: () => rgba(1.0, 0.75, 0.4, CLS.GLOW) });
  shared = { wheels: new Map(), lamp: lamp.build(device), gadgets: gadgetMeshes(device), beam: beamMesh(device), halo: haloMesh(device), mat: silMaterial({ cls: 0 }), glow: glowMaterial(1.0), flameGlow: silMaterial({ glow: 1.2 }) };
  return shared;
}

const _f = [0, 0], _u = [0, 0], _n = [0, 0], _v = [0, 0], _r = [0, 0];

export class Car {
  constructor({ app, layer, physics, terrain, id, local = false, vehicle = 'mudrunner', colorIdx = 0, name = 'Buggy', hat = 'straw' }) {
    const S = (this.spec = vehicleSpec(vehicle));
    this.vehicle = S.id;
    this.app = app;
    this.physics = physics;
    this.terrain = terrain;
    this.id = id;
    this.local = local;
    this.colorIdx = colorIdx;
    this.name = name;
    const A = (this.A = sharedAssets(app.graphicsDevice));
    const ent = (mesh, mat, parent, nm = 'part') => {
      const e = new pc.Entity(nm);
      e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], layers: [layer.id], castShadows: false, receiveShadows: false });
      parent.addChild(e);
      return e;
    };
    // 2D shapes: model z (forward) -> x, model y -> y
    this.shapes0 = S.spheres.map(([x, y, z, r]) => [z, y, r]);
    const byZ = new Map();
    for (const [, z, , r] of S.wheels) byZ.set(Math.round(z * 100) / 100, Math.max(byZ.get(Math.round(z * 100) / 100) || 0, r));
    const zs = [...byZ.keys()].sort((a, b) => b - a);
    this.wheels0 = [zs[0], zs[zs.length - 1]].map((z) => ({ lx: z, r: byZ.get(z) }));
    this.facing = 1;
    // Side-view suspension, derived per vehicle so every machine rides clear of the ground:
    // springs sag 35% of their travel at rest, and both axles reach the ground with the body level
    // even when the wheels differ in size (the tractor).
    const rMax = Math.max(...this.wheels0.map((w) => w.r));
    this.rest = Math.max(S.rest, 0.3);
    this.reach = this.rest + rMax; // body centre line to the ground, springs fully extended
    this.kS = -G / 2 / (0.35 * this.rest);
    this.dS = Math.min(0.7, (S.damp / (1.414 * Math.sqrt(S.k))) * 1.35) * 1.414 * Math.sqrt(this.kS);
    const ride = this.reach - 0.35 * this.rest; // ride height of the centre line
    const belly = Math.max(...this.shapes0.map(([, y, r]) => r - y));

    this.root = new pc.Entity(`car-${id}`);
    app.root.addChild(this.root);
    this.holder = new pc.Entity('holder');
    this.root.addChild(this.holder);
    this.holder.setLocalScale(SCALE, SCALE, SCALE);
    this.holderYaw = 90;
    this.holder.setLocalEulerAngles(0, 90, 0);
    this.chassis = ent(chassisFor(app.graphicsDevice, S.id, BLACK, 0), A.mat, this.holder, 'chassis');
    this.lamps = S.lamps.map(([x, y, z]) => { const e = ent(A.lamp, A.mat, this.holder, 'lamp'); e.setLocalPosition(x, y, z); return e; });
    this.gadgetEnts = {};
    for (const [k, mesh] of Object.entries(A.gadgets)) { const e = ent(mesh, k === 'flame' ? A.flameGlow : A.mat, this.holder, k); e.enabled = false; this.gadgetEnts[k] = e; }
    this.gadgetEnts.flame.setLocalPosition(0, S.flame[1], -S.front + 0.1);
    this.gadgetEnts.plow.setLocalPosition(0, 0, S.front - 1.5);
    this.gadgetEnts.mine.setLocalPosition(0, S.seat[1] - 0.95, 0);
    this.gadgetEnts.horn.setLocalPosition(0, S.seat[1] - 0.95, S.front - 1.5);
    this.hatEnt = new pc.Entity('hat');
    this.hatEnt.addComponent('render', { meshInstances: [new pc.MeshInstance(hatMesh(app.graphicsDevice, hat), A.mat)], layers: [layer.id], castShadows: false, receiveShadows: false });
    this.holder.addChild(this.hatEnt);
    this.hatEnt.setLocalPosition(S.seat[0], S.seat[1], S.seat[2]);
    this.hat = hat;
    // wheels on the near side, outside the mirrored holder
    this.wheels = this.wheels0.map((w) => {
      const pivot = new pc.Entity('wheelPivot');
      this.root.addChild(pivot);
      const r0 = Math.round((w.r / SCALE) * 100) / 100;
      if (!A.wheels.has(r0)) A.wheels.set(r0, wheelMesh(app.graphicsDevice, r0));
      const spin = ent(A.wheels.get(r0), A.mat, pivot, 'wheel');
      spin.setLocalScale(SCALE, SCALE, SCALE);
      spin.setLocalEulerAngles(0, 90, 0);
      return { lx: w.lx, r: w.r, pivot, spin, comp: 0, prevComp: 0, dist: this.reach, contact: false, angle: 0 };
    });
    // the beam + a soft halo around the lamp
    this.beam = ent(A.beam, A.glow, this.root, 'beam');
    this.halo = ent(A.halo, A.glow, this.root, 'halo');
    this.beam.render.meshInstances[0].cull = false;

    this.body = new Body({ mass: S.mass, shapes: this.shapes0.map((s) => s.slice()), inertia: S.inertia[0] * S.mass * 1.6, restitution: 0.3, friction: 0.4, kind: 'car', linDamp: 0.05, angDamp: 0.4, buoyant: 0.95 });
    this.body.car = this;
    this.body.tuck = Math.max(0, belly + 0.12 - ride); // fat colliders ride this much shallower against the ground
    physics.add(this.body);
    if (!local) this.body.kinematic = true;

    this.input = { dir: 0, boost: false, hop: false, reset: false };
    this.throttle = 0;
    this.boost = 1;
    this.boosting = false;
    this.hp = 100;
    this.wrecked = 0;
    this.gadget = null;
    this.gadgetT = 0;
    this.flash = 0;
    this.upsideT = 0;
    this.shield = 0;
    this.hopCd = 0;
    this.speed = 0;
    this.grounded = 0;
    this.score = 0;
    this.lastHitBy = null;
    this.lastHitT = -99;
    this.cork = null;
    this.remote = { buf: [] };
    this.hook = (h) => this.forces(h);
    if (local) physics.hooks.push(this.hook);
  }

  setHat(id) { if (id === this.hat) return; this.hat = id; this.hatEnt.render.meshInstances[0].mesh = hatMesh(this.app.graphicsDevice, id); }

  setFacing(f) {
    if (f === this.facing) return;
    this.facing = f;
    this.body.setShapes(this.shapes0.map(([x, y, r]) => [x * f, y, r]));
    for (let i = 0; i < this.wheels.length; i++) this.wheels[i].lx = this.wheels0[i].lx * f;
  }

  respawnAt(x, drop = 4) {
    const b = this.body;
    b.set(x, this.terrain.height(x) + 1.4 + drop, 0);
    b.v[0] = b.v[1] = 0; b.w = 0;
    b.enabled = true;
    this.hp = 100;
    this.wrecked = 0;
    this.root.enabled = true;
    this.holder.enabled = true;
    this.boost = 1;
    this.shield = 2.5; // a fresh buggy can't be hurt while it drops in and gets its bearings
    this.setFacing(x > 0 ? -1 : 1); // face the middle of the glade
    this.holderYaw = this.facing * 90;
  }

  // ----------------------------------------------------------------- driving (per physics substep, local only)
  forces(h) {
    const b = this.body;
    if (!b.enabled || this.wrecked) return;
    const S = this.spec, M = S.mass, K = M * this.kS, D = M * this.dS, REST = this.rest, REACH = this.reach, f = this.facing;
    const c = Math.cos(b.a), s = Math.sin(b.a);
    _u[0] = -s; _u[1] = c; // body up
    const fwdX = c * f, fwdY = s * f; // where the nose points
    const vFwd = b.v[0] * fwdX + b.v[1] * fwdY;
    this.speed = Math.hypot(b.v[0], b.v[1]);
    const rocket = this.gadget === 'rocket';
    const top = S.top * (rocket && this.boosting ? ROCKET_TOP_K : this.boosting ? BOOST_TOP_K : 1);
    const per = M / (this.grounded === 1 ? 1 : 2); // on one wheel (a steep climb, a wheelie) it takes all the drive
    let contacts = 0;
    for (const w of this.wheels) {
      const mx = b.p[0] + c * w.lx, my = b.p[1] + s * w.lx;
      let g = this.terrain.height(mx);
      // wheels also grip whatever lies under them: logs, boulders, barrels, the cage-ball, a rival's roof
      for (const o of this.physics.bodies) {
        if (o === b || !o.enabled || Math.abs(o.p[0] - mx) > o.bound) continue;
        for (let i = 0; i < o.shapes.length; i++) {
          const cx = o.ws[i][0], cy = o.ws[i][1], r = o.shapes[i][2];
          if (Math.abs(mx - cx) < r * 0.9 && cy + r < my + 0.3) g = Math.max(g, cy + Math.sqrt(r * r - (mx - cx) ** 2));
        }
      }
      // the spring ray leaves the axle along body-down and meets the sloped ground under it
      this.terrain.normal(mx, _n);
      const un = _u[0] * _n[0] + _u[1] * _n[1]; // how squarely the wheels face the ground
      const dist = ((my - g) * _n[1]) / Math.max(un, 0.25);
      w.prevComp = w.comp;
      w.contact = un > 0.2 && dist < REACH;
      w.dist = Math.min(dist, REACH);
      if (!w.contact) { w.comp = 0; continue; }
      contacts++;
      w.comp = Math.min(REACH - dist, REST + 0.2);
      const fs = Math.max(0, K * w.comp + D * ((w.comp - w.prevComp) / h));
      const rx = mx - b.p[0] - _u[0] * dist, ry = my - b.p[1] - _u[1] * dist; // contact point
      b.addForceAt(_n[0] * fs, _n[1] * fs, rx, ry);
      // drive along the ground
      const tx = _n[1] * f, ty = -_n[0] * f; // ground tangent, pointing the way the nose faces
      b.pointVel(rx, ry, _v);
      const vlong = _v[0] * tx + _v[1] * ty;
      let fl = -vlong * per * 0.12;
      if (this.throttle > 0.05) fl += this.throttle * per * S.accel * Math.max(0, Math.min(1, 1.7 * (1 - vlong / top)));
      else if (this.throttle < -0.05) fl -= Math.sign(vlong) * per * 16;
      const cap = fs * 1.3;
      fl = Math.max(-cap, Math.min(cap, fl));
      // tyre force acts at axle height: wheelies come from torque, not from tripping
      b.addForceAt(tx * fl, ty * fl, rx + _u[0] * dist * 0.7, ry + _u[1] * dist * 0.7);
    }
    this.grounded = contacts;
    if (this.boosting) {
      const k = M * (rocket ? 26 : S.boostF) * (contacts ? 1 : 0.7) * Math.max(0, Math.min(1, 1.5 * (1 - vFwd / top)));
      b.addForce(fwdX * k, fwdY * k);
    }
    // air control. Pressing against the way you face spins the buggy that way: a backflip, and
    // always a choice. Otherwise it steadies itself for the landing (nose a touch up while you
    // keep driving), so holding your thumb down through a jump never nose-dives you.
    const wet = this.physics.inWater(b.p[0], b.p[1] - 0.2);
    if (contacts === 0 && !wet && !(b.grounded > 0)) {
      const d = this.input.dir, a = Math.atan2(s, c);
      if (Math.abs(d) > 0.1 && Math.sign(d) !== f) b.t += -d * b.I * 7;
      else {
        const want = Math.abs(d) > 0.1 ? 0.12 * f : 0;
        if (Math.abs(a - want) < 1.4) b.t += ((want - a) * 9 - b.w * 3.2) * b.I;
      }
    } else if (contacts === 1) b.t += -this.input.dir * b.I * 2.5; // lean into wheelies
    // the pond: wheels paddle, so a floating buggy still gets across, and it floats keel-down
    if (wet) {
      if (this.throttle > 0.05) b.addForce(f * M * 9 * this.throttle, 0);
      b.t += (-s * 9 - b.w * 1.5) * b.I;
    }
    if (Math.abs(b.w) > 9) b.w = Math.sign(b.w) * 9;
  }

  /** Per frame, local cars: steering logic, boost meter, gadget timer, flips, damage. */
  update(dt) {
    const b = this.body, inp = this.input;
    if (this.wrecked) return;
    if (this.shield > 0) this.shield -= dt;
    // left/right means "go that way": turn around when slow, brake when fast
    const d = inp.dir;
    if (Math.abs(d) < 0.1) this.throttle = 0;
    else if (Math.sign(d) === this.facing) this.throttle = Math.abs(d);
    else if (this.grounded || this.wet) { // afloat in the pond you can still turn round
      const vx = b.v[0] * this.facing;
      if (vx > 2.5 && this.grounded) this.throttle = -1;
      else this.turnAround();
    } else this.throttle = 0;
    this.boosting = inp.boost && (this.gadget === 'rocket' || this.boost > 0.02);
    if (this.boosting && this.gadget !== 'rocket') this.boost = Math.max(0, this.boost - dt * 0.36);
    else if (!inp.boost) this.boost = Math.min(1, this.boost + dt * 0.17);
    if (this.gadget) { this.gadgetT -= dt; if (this.gadgetT <= 0) this.gadget = null; }
    // hop
    this.hopCd -= dt;
    if (inp.hop) {
      inp.hop = false;
      const spring = this.gadget === 'hop';
      if (this.hopCd <= 0 && (this.grounded || b.grounded > 0 || spring)) {
        const k = spring ? 12 : 7;
        b.v[0] += -Math.sin(b.a) * k * 0.4; b.v[1] = Math.max(b.v[1], 0) + Math.cos(b.a) * k;
        this.hopCd = spring ? 0.45 : 0.9;
        this.hopped = true;
      }
    }
    // stuck on the roof or side: flip back after a moment
    const upY = Math.cos(b.a);
    if (upY < 0.3 && this.speed < 3) this.upsideT += dt; else this.upsideT = 0;
    if (this.upsideT > 1.4 || inp.reset) { this.flipUpright(); inp.reset = false; }
    if (b.lastImpact > 12) this.damage((b.lastImpact - 12) * 3, b.lastHitBy && b.lastHitBy.car ? b.lastHitBy.car : null);
  }

  turnAround() {
    this.setFacing(-this.facing);
    this.throttle = 0;
    this.turned = true;
  }

  flipUpright() {
    const b = this.body;
    b.a = 0; b.w = 0;
    b.p[1] = this.terrain.height(b.p[0]) + 1.6;
    b.v[0] *= 0.3; b.v[1] = 2;
    b.updateShapes();
    this.upsideT = 0;
  }

  damage(amount, by) {
    if (this.wrecked || amount <= 0 || this.shield > 0) return;
    this.hp -= amount;
    if (by && by !== this) { this.lastHitBy = by; this.lastHitT = performance.now(); }
    if (this.hp <= 0 && this.onWreck) this.onWreck(this);
  }

  // ----------------------------------------------------------------- remote cars: snapshot interpolation
  pushRemote(s, now) {
    const buf = this.remote.buf;
    buf.push({ t: now, p: s.p, a: s.a, v: s.v });
    if (buf.length > 12) buf.shift();
  }
  applyRemote(now) {
    const buf = this.remote.buf;
    if (!buf.length) return;
    const rt = now - 110;
    let A = buf[0], C = buf[buf.length - 1];
    for (let i = 0; i < buf.length - 1; i++) if (buf[i].t <= rt && buf[i + 1].t >= rt) { A = buf[i]; C = buf[i + 1]; break; }
    const span = C.t - A.t;
    const k = span > 0 ? Math.max(0, Math.min(1.5, (rt - A.t) / span)) : 1;
    const b = this.body;
    b.p[0] = A.p[0] + (C.p[0] - A.p[0]) * k;
    b.p[1] = A.p[1] + (C.p[1] - A.p[1]) * k;
    let da = C.a - A.a;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    b.a = A.a + da * Math.min(1, k);
    b.v[0] = C.v[0]; b.v[1] = C.v[1];
    this.speed = Math.hypot(b.v[0], b.v[1]);
    b.updateShapes();
  }

  // ----------------------------------------------------------------- visuals
  sync(dt, time) {
    const b = this.body, S = this.spec;
    this.root.setPosition(b.p[0], b.p[1], 0);
    this.root.setEulerAngles(0, 0, (b.a * 180) / Math.PI);
    // turning around: a quick 180 spin of the body silhouette
    const want = this.facing * 90;
    const dy = want - this.holderYaw;
    this.holderYaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * 900);
    this.holder.setLocalEulerAngles(0, this.holderYaw, 0);
    const f = this.facing;
    const c = Math.cos(b.a), s = Math.sin(b.a);
    const vlong = (b.v[0] * c + b.v[1] * s) * f;
    for (const w of this.wheels) {
      if (!this.local) { // estimate suspension from the ground under the wheel
        const mx = b.p[0] + c * w.lx, my = b.p[1] + s * w.lx;
        w.dist = Math.min(this.reach, Math.max(this.reach - this.rest, (my - this.terrain.height(mx)) / Math.max(0.3, c)));
      }
      w.angle += (vlong / w.r) * dt;
      w.pivot.setLocalPosition(w.lx, -(w.dist - w.r), 0.45);
      w.pivot.setLocalEulerAngles(0, 0, (-w.angle * 180 / Math.PI * f) % 360);
    }
    // beam + halo from the front lamp
    const lx = S.front * SCALE * 0.95 * f, ly = (S.lamps[0][1] + 0.05) * SCALE;
    const on = this.wrecked ? 0 : 1;
    this.beam.enabled = this.halo.enabled = !!on && Math.abs(this.holderYaw) > 60;
    this.beam.setLocalPosition(lx, ly, 0.6);
    this.beam.setLocalScale(f * (1 + this.flash * 0.35), 1 + this.flash * 0.6, 1);
    this.halo.setLocalPosition(lx, ly, 0.7);
    const hs = 0.5 + this.flash * 1.2 + Math.sin(time * 23) * 0.03;
    this.halo.setLocalScale(hs, hs, 1);
    // gadget props
    for (const [k, e] of Object.entries(this.gadgetEnts)) e.enabled = !this.wrecked && (k === 'flame' ? this.boosting : this.gadget === k);
    if (this.boosting) { const fl = 0.8 + Math.random() * 0.5; this.gadgetEnts.flame.setLocalScale(1, 1, fl * (this.gadget === 'rocket' ? 1.6 : 1)); }
    // the hat flies off like a cork when wrecked
    if (this.cork) {
      const k = this.cork;
      k.v[1] += -19 * dt;
      k.p[0] += k.v[0] * dt; k.p[1] += k.v[1] * dt;
      k.spin += dt * 9;
      const g = this.terrain.height(k.p[0]);
      if (k.p[1] < g + 0.15) { k.p[1] = g + 0.15; k.v[0] *= 0.5; k.v[1] = Math.abs(k.v[1]) * 0.35; }
      this.hatEnt.setPosition(k.p[0], k.p[1], 0.3);
      this.hatEnt.setEulerAngles(0, 0, k.spin * 57);
    }
  }

  wreck() {
    this.wrecked = 1;
    this.hp = 0;
    this.body.enabled = false;
    this.holder.enabled = false;
    for (const w of this.wheels) w.pivot.enabled = false;
    const p = this.body.p;
    this.hatEnt.reparent(this.app.root);
    this.hatEnt.setLocalScale(SCALE, SCALE, SCALE);
    this.hatEnt.enabled = true;
    this.cork = { p: [p[0], p[1] + 1], v: [(Math.random() - 0.5) * 6, 14], spin: 0 };
  }

  unwreck(x) {
    this.cork = null;
    this.hatEnt.reparent(this.holder);
    this.hatEnt.setLocalScale(1, 1, 1);
    this.hatEnt.setLocalPosition(this.spec.seat[0], this.spec.seat[1], this.spec.seat[2]);
    this.hatEnt.setLocalEulerAngles(0, 0, 0);
    for (const w of this.wheels) w.pivot.enabled = true;
    this.respawnAt(x);
  }

  /** for the shaders: (x, y, angle, intensity) of the beam */
  headlight(out) {
    const b = this.body, S = this.spec, f = this.facing;
    const c = Math.cos(b.a), s = Math.sin(b.a);
    const lx = S.front * SCALE * 0.95 * f, ly = (S.lamps[0][1] + 0.05) * SCALE;
    out[0] = b.p[0] + c * lx - s * ly;
    out[1] = b.p[1] + s * lx + c * ly;
    out[2] = b.a + (f > 0 ? -0.06 : Math.PI + 0.06);
    out[3] = this.wrecked || Math.abs(this.holderYaw) < 60 ? 0 : 1 + this.flash * 1.2;
    return out;
  }

  destroy() {
    this.physics.remove(this.body);
    this.physics.hooks = this.physics.hooks.filter((fn) => fn !== this.hook);
    this.hatEnt.destroy();
    this.root.destroy();
  }
}

// Tiny heavy-duty demolition buggies: mesh, arcade raycast-suspension handling, remote interpolation.
import * as pc from 'playcanvas';
import { CLS, worldMaterial } from './shaders.js';
import { MeshBuilder, rgba, addTube, addLathe, addSphere, addBox } from './meshes.js';
import { Body, qrot, qFromAxisAngle, V } from './physics.js';
import { hatMesh } from './hats.js';
import { vehicleSpec, chassisFor, SCALE } from './vehicles.js';
import { LAYOUT } from './layout.js';

// bright toy paint, so the little buggies pop out of the grey fog (monochrome mode greys them)
export const CAR_COLORS = [[0.86, 0.16, 0.1], [0.12, 0.42, 0.86], [0.95, 0.72, 0.1], [0.2, 0.68, 0.26], [0.6, 0.26, 0.8], [0.98, 0.45, 0.08], [0.92, 0.9, 0.84], [0.1, 0.72, 0.7]];
export const CAR_COLOR_NAMES = ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange', 'White', 'Teal'];

const BOOST_TOP_K = 1.45, ROCKET_TOP_K = 1.9;

function wheelMesh(device, RADIUS) {
  const mb = new MeshBuilder();
  const rub = () => rgba(0.05, 0.05, 0.05, CLS.CHAR);
  addTube(mb, [[-0.2, 0, 0, RADIUS - 0.05], [-0.24, 0, 0, RADIUS], [0.24, 0, 0, RADIUS], [0.2, 0, 0, RADIUS - 0.05]], { seg: 14, subdiv: 1, capEnd: true, capStart: true, colFn: rub });
  addTube(mb, [[-0.26, 0, 0, 0.2], [0.26, 0, 0, 0.2]], { seg: 8, subdiv: 1, capEnd: true, capStart: true, colFn: () => rgba(0.24, 0.24, 0.25, CLS.STONE) });
  // chunky treads
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    addBox(mb, { y: Math.cos(a) * RADIUS, z: Math.sin(a) * RADIUS, sx: 0.46, sy: 0.08, sz: 0.12, tilt: -a, col: rub() });
  }
  return mb.build(device);
}

function lightMesh(device) {
  const mb = new MeshBuilder();
  addSphere(mb, { r: 0.13, sy: 0.6, segW: 8, segH: 5, colFn: () => rgba(1.0, 0.72, 0.35, CLS.GLOW) });
  return mb.build(device);
}

function gadgetMeshes(device) {
  const plow = new MeshBuilder();
  const iron = (v = 0) => rgba(0.18 + v, 0.18 + v, 0.19 + v, CLS.STONE);
  addBox(plow, { y: -0.1, z: 1.7, sx: 2.1, sy: 0.55, sz: 0.12, tilt: -0.5, col: iron(0) });
  for (let i = 0; i < 5; i++) addTube(plow, [[-0.8 + i * 0.4, -0.05, 1.78, 0.06], [-0.8 + i * 0.4, -0.05, 2.15, 0.0]], { seg: 4, colFn: () => iron(0.1) });
  const flame = new MeshBuilder();
  addLathe(flame, [[0.0, 0.0], [0.22, 0.15], [0.16, 0.8], [0.0, 1.6]], { seg: 8, colFn: (t) => rgba(1.0, 0.6 - t * 0.3, 0.2, CLS.GLOW), warp: (x, y, z) => [x, z, -y] });
  const horn = new MeshBuilder();
  addLathe(horn, [[0.04, 0], [0.05, 0.4], [0.12, 0.6], [0.26, 0.72]], { seg: 10, colFn: () => rgba(0.6, 0.45, 0.18, CLS.STONE), warp: (x, y, z) => [x, z + 0.55, y + 0.45] });
  const keg = new MeshBuilder();
  addLathe(keg, [[0.0, -0.22], [0.22, -0.2], [0.25, 0.0], [0.22, 0.2], [0.0, 0.22]], { seg: 10, colFn: () => rgba(0.3, 0.2, 0.12, CLS.GROUND), warp: (x, y, z) => [x, z + 0.25, y - 1.15] });
  const spring = new MeshBuilder();
  const coil = [];
  for (let i = 0; i <= 24; i++) { const a = i * 0.8; coil.push([Math.cos(a) * 0.16, -0.25 + i * 0.012, Math.sin(a) * 0.16, 0.025]); }
  for (const [x, z] of [[-0.86, 1.0], [0.86, 1.0], [-0.86, -0.95], [0.86, -0.95]]) addTube(spring, coil.map(([cx, cy, cz, rr]) => [cx + x * 0.8, cy + 0.25, cz + z, rr]), { seg: 3, subdiv: 1, colFn: () => rgba(0.75, 0.55, 0.2, CLS.STONE) });
  const dish = new MeshBuilder();
  addTube(dish, [[0, 0.3, -0.9, 0.02], [0, 1.4, -0.95, 0.015]], { seg: 3, colFn: () => rgba(0.3, 0.3, 0.3, CLS.STONE) });
  addSphere(dish, { y: 1.45, z: -0.95, r: 0.08, segW: 5, segH: 3, colFn: () => rgba(0.5, 0.9, 0.7, CLS.GLOW) });
  return { plow: plow.build(device), flame: flame.build(device), horn: horn.build(device), mine: keg.build(device), hop: spring.build(device), glitch: dish.build(device) };
}

let shared = null;
function sharedAssets(device) {
  if (shared) return shared;
  shared = { wheels: new Map(), light: lightMesh(device), gadgets: gadgetMeshes(device), mat: worldMaterial({ doubleSided: true, sway: 0.25 }), wheelMat: worldMaterial({}), glowMat: worldMaterial({ emissive: 2.2 }), chassis: new Map() };
  return shared;
}

const _v = [0, 0, 0], _up = [0, 0, 0], _fw = [0, 0, 0], _rt = [0, 0, 0], _m = [0, 0, 0], _r = [0, 0, 0], _vc = [0, 0, 0], _n = [0, 0, 0], _F = [0, 0, 0], _lat = [0, 0, 0], _wf = [0, 0, 0], _tq = [0, 0, 0];

export class Car {
  constructor({ app, layers, physics, world, colorIdx = 0, local = false, id, name = 'Buggy', hat = 'straw', vehicle = 'mudrunner' }) {
    const S = (this.spec = vehicleSpec(vehicle));
    this.vehicle = S.id;
    this.app = app;
    this.world = world;
    this.physics = physics;
    this.id = id;
    this.name = name;
    this.local = local;
    this.colorIdx = colorIdx;
    const A = sharedAssets(app.graphicsDevice);
    const ent = (mesh, mat, parent, name2 = 'part') => {
      const e = new pc.Entity(name2);
      e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], layers: [layers.world.id, layers.reflect.id], castShadows: false, receiveShadows: false });
      parent.addChild(e);
      return e;
    };
    this.root = new pc.Entity(`car-${id}`);
    app.root.addChild(this.root);
    this.chassis = ent(chassisFor(app.graphicsDevice, S.id, CAR_COLORS[colorIdx % CAR_COLORS.length], colorIdx), A.mat, this.root, 'chassis');
    this.chassis.setLocalScale(SCALE, SCALE, SCALE);
    this.lightMat = worldMaterial({ emissive: 2.2 });
    this.lamps = S.lamps.map(([x, y, z]) => { const e = ent(A.light, this.lightMat, this.chassis, 'lamp'); e.setLocalPosition(x, y, z); return e; });
    this.wheels = S.wheels.map(([x, z, front, r]) => {
      const pivot = new pc.Entity('wheelPivot');
      this.root.addChild(pivot);
      const r0 = Math.round((r / SCALE) * 100) / 100; // modelled at full size, shown at toy scale
      if (!A.wheels.has(r0)) A.wheels.set(r0, wheelMesh(app.graphicsDevice, r0));
      const spin = ent(A.wheels.get(r0), A.wheelMat, pivot, 'wheel');
      spin.setLocalScale(SCALE, SCALE, SCALE);
      return { x, z, front: !!front, r, pivot, spin, comp: 0, prevComp: 0, contact: false, angle: 0, dist: S.rest + r };
    });
    this.gadgetEnts = {};
    for (const [k, mesh] of Object.entries(A.gadgets)) {
      const e = ent(mesh, k === 'flame' || k === 'glitch' ? A.glowMat : A.wheelMat, this.chassis, k);
      e.enabled = false;
      this.gadgetEnts[k] = e;
    }
    this.gadgetEnts.flame.setLocalPosition(S.flame[0], S.flame[1], S.flame[2]);
    this.gadgetEnts.plow.setLocalPosition(0, 0, S.front - 1.5);
    this.gadgetEnts.mine.setLocalPosition(0, S.seat[1] - 0.95, 0);
    this.gadgetEnts.horn.setLocalPosition(0, S.seat[1] - 0.95, S.front - 1.5);
    this.hatEnt = new pc.Entity('hat');
    this.hatEnt.addComponent('render', { meshInstances: [new pc.MeshInstance(hatMesh(app.graphicsDevice, hat), A.mat)], layers: [layers.world.id, layers.reflect.id], castShadows: false, receiveShadows: false });
    this.chassis.addChild(this.hatEnt);
    this.hatEnt.setLocalPosition(S.seat[0], S.seat[1], S.seat[2]);
    this.hat = hat;

    this.body = new Body({ mass: S.mass, spheres: S.spheres, inertia: S.inertia.map((k) => k * S.mass), restitution: 0.32, friction: 0.55, kind: 'car', linDamp: 0.04, angDamp: 0.9, buoyant: 0.9 });
    this.body.car = this;
    physics.add(this.body);
    if (!local) this.body.kinematic = true;

    // input / state
    this.input = { throttle: 0, steer: 0, boost: false, brake: false, airPitch: 0, airRoll: 0 };
    this.steer = 0;
    this.boost = 1;
    this.boosting = false;
    this.hp = 100;
    this.wrecked = 0;
    this.gadget = null;
    this.gadgetT = 0;
    this.flash = 0;
    this.horn = 0;
    this.upsideT = 0;
    this.speed = 0;
    this.grounded = 0;
    this.score = 0;
    this.lastHitBy = null;
    this.lastHitT = -99;
    this.cork = null;
    this.remote = { buf: [], t: 0 };
    this.hook = (h) => this.forces(h);
    this.hook.car = this;
    if (local) physics.hooks.push(this.hook);
    this.respawnAt(LAYOUT.spawns[(colorIdx * 3) % LAYOUT.spawns.length]);
  }

  setHat(id) {
    if (id === this.hat) return;
    this.hat = id;
    this.hatEnt.render.meshInstances[0].mesh = hatMesh(this.app.graphicsDevice, id);
  }

  respawnAt([x, z], drop = 6) {
    const b = this.body;
    b.set(x, this.world.groundAt(x, z) + 1.2 + drop, z);
    b.v[0] = b.v[1] = b.v[2] = 0; b.w[0] = b.w[1] = b.w[2] = 0;
    // face the glade centre
    qFromAxisAngle(0, 1, 0, Math.atan2(-x, -z), b.q);
    b.enabled = true;
    b.updateSpheres();
    this.hp = 100;
    this.wrecked = 0;
    this.root.enabled = true;
    this.chassis.enabled = true;
    this.hatEnt.enabled = true;
  }

  // ----------------------------------------------------------------- local driving (per physics substep)
  forces(h) {
    const b = this.body;
    if (!b.enabled || this.wrecked) return;
    const inp = this.input;
    b.axis(1, _up); b.axis(2, _fw); b.axis(0, _rt);
    const fwdSpeed = V.dot(b.v, _fw);
    this.speed = Math.hypot(b.v[0], b.v[2]);
    // speed-sensitive steering
    const S = this.spec, MASS = S.mass, K = MASS * S.k, DAMP = MASS * S.damp, REST = S.rest;
    // speed-sensitive steering: keep cornering force inside what the tyres can hold, so full
    // lock at speed carves instead of tripping. The handbrake (drift) is for the tight stuff.
    const L = this.wheelbase || (this.wheelbase = Math.max(...S.wheels.map((w) => w[1])) - Math.min(...S.wheels.map((w) => w[1])));
    const v2 = fwdSpeed * fwdSpeed;
    const steerMax = Math.min(S.steer, Math.max(0.13, Math.atan((S.grip + 4) * L / Math.max(1, v2)) * (inp.brake ? 1.8 : 1)));
    this.steer += (inp.steer * steerMax - this.steer) * Math.min(1, h * 9);
    const rocket = this.gadget === 'rocket';
    const top = S.top * (rocket && this.boosting ? ROCKET_TOP_K : this.boosting ? BOOST_TOP_K : 1);
    const perWheel = MASS / this.wheels.length;
    let contacts = 0;
    for (const w of this.wheels) {
      _m[0] = w.x; _m[1] = 0; _m[2] = w.z;
      qrot(b.q, _m, _r);
      const mx = b.p[0] + _r[0], my = b.p[1] + _r[1], mz = b.p[2] + _r[2];
      let g = this.world.hf.at(mx, mz);
      const list = this.world.statics.query(mx, mz);
      if (list) for (const o of list) if (!o.off && o.top < 50 && o.top < my && Math.hypot(mx - o.x, mz - o.z) < o.r) g = Math.max(g, o.top);
      const upY = Math.max(_up[1], 0.25);
      const dist = (my - g) / upY;
      w.prevComp = w.comp;
      const RADIUS = w.r;
      w.contact = _up[1] > 0.2 && dist < REST + RADIUS;
      w.dist = Math.min(dist, REST + RADIUS);
      if (!w.contact) { w.comp = 0; continue; }
      contacts++;
      w.comp = Math.min(REST + RADIUS - dist, REST + 0.2);
      const fs = Math.max(0, K * w.comp + DAMP * ((w.comp - w.prevComp) / h));
      this.world.hf.normal(mx, mz, _n);
      // contact point (relative to COM)
      _r[0] -= _up[0] * dist; _r[1] -= _up[1] * dist; _r[2] -= _up[2] * dist;
      _F[0] = _n[0] * fs; _F[1] = _n[1] * fs; _F[2] = _n[2] * fs;
      // wheel heading (front wheels steer)
      const st = w.front ? this.steer : 0;
      const cs = Math.cos(st), sn = Math.sin(st);
      _wf[0] = _fw[0] * cs + _rt[0] * sn; _wf[1] = _fw[1] * cs + _rt[1] * sn; _wf[2] = _fw[2] * cs + _rt[2] * sn;
      const d = V.dot(_wf, _n);
      _wf[0] -= _n[0] * d; _wf[1] -= _n[1] * d; _wf[2] -= _n[2] * d;
      const wl = V.len(_wf) || 1;
      _wf[0] /= wl; _wf[1] /= wl; _wf[2] /= wl;
      V.cross(_n, _wf, _lat);
      b.pointVel(_r, _vc);
      // grip: kill sideways slide (the handbrake lets the rear go)
      const grip = !w.front && inp.brake ? 0.22 : 1.0;
      const vlat = V.dot(_vc, _lat);
      let flat = -vlat * perWheel * S.grip * grip;
      const fmax = fs * 1.1;
      flat = Math.max(-fmax, Math.min(fmax, flat));
      // drive / brake / reverse
      const vlong = V.dot(_vc, _wf);
      let flong = -vlong * perWheel * 0.1; // rolling resistance
      if (inp.throttle > 0.05) flong += inp.throttle * perWheel * S.accel * Math.max(0, 1 - fwdSpeed / top);
      else if (inp.throttle < -0.05) flong += fwdSpeed > 1.5 ? -perWheel * 26 : inp.throttle * perWheel * 11 * Math.max(0, 1 + fwdSpeed / 9);
      if (inp.brake && !w.front) flong -= Math.sign(vlong) * perWheel * 6;
      // suspension pushes at the contact patch...
      b.addForce(_F[0], _F[1], _F[2]);
      V.cross(_r, _F, _tq);
      b.addTorque(_tq[0], _tq[1], _tq[2]);
      // ...but tyre forces act near the centre of mass (arcade anti-roll: cornering hard
      // leans the buggy instead of tripping it over its own wheels)
      _F[0] = _lat[0] * flat + _wf[0] * flong; _F[1] = _lat[1] * flat + _wf[1] * flong; _F[2] = _lat[2] * flat + _wf[2] * flong;
      b.addForce(_F[0], _F[1], _F[2]);
      const lift = dist; // = the wheel mount, level with the centre of mass
      _r[0] += _up[0] * lift; _r[1] += _up[1] * lift; _r[2] += _up[2] * lift;
      V.cross(_r, _F, _tq);
      b.addTorque(_tq[0], _tq[1], _tq[2]);
    }
    this.grounded = contacts;
    // boost: rocket thrust from the tail
    if (this.boosting) {
      // thrust fades out near the boosted top speed (no runaway rockets)
      const k = MASS * (rocket ? 26 : S.boostF) * (contacts ? 1 : 0.6) * Math.max(0, Math.min(1, 1.5 * (1 - fwdSpeed / top)));
      b.addForce(_fw[0] * k, _fw[1] * k, _fw[2] * k);
    }
    if (contacts === 0) {
      // air control: pitch with throttle, roll with steer -> flips and barrel rolls
      const I = S.mass * 2.2 * SCALE * SCALE;
      b.addTorque(_rt[0] * inp.throttle * I + _fw[0] * -inp.steer * I * 1.3, _rt[1] * inp.throttle * I + _fw[1] * -inp.steer * I * 1.3, _rt[2] * inp.throttle * I + _fw[2] * -inp.steer * I * 1.3);
    } else if (_up[1] < 0.97) {
      // gentle self-righting on the ground
      // torque along up x worldUp pulls the roof back toward the sky; damp the roll/pitch rate
      const k = MASS * 9 * (S.inertia[0] + S.inertia[2]);
      b.addTorque(-_up[2] * k - b.w[0] * MASS * 0.9 * SCALE * SCALE, 0, _up[0] * k - b.w[2] * MASS * 0.9 * SCALE * SCALE);
    }
    // keep spin sane
    const wl = V.len(b.w);
    if (wl > 14) { b.w[0] *= 14 / wl; b.w[1] *= 14 / wl; b.w[2] *= 14 / wl; }
  }

  /** Per frame (local car): boost meter, gadget timer, auto-flip, impact damage. */
  update(dt) {
    const b = this.body;
    if (this.wrecked) return;
    this.boosting = this.input.boost && (this.gadget === 'rocket' || this.boost > 0.02);
    if (this.boosting && this.gadget !== 'rocket') this.boost = Math.max(0, this.boost - dt * 0.38);
    else if (!this.input.boost) this.boost = Math.min(1, this.boost + dt * 0.16);
    if (this.gadget) { this.gadgetT -= dt; if (this.gadgetT <= 0) this.gadget = null; }
    b.axis(1, _up);
    // stuck on its roof: flip back after a moment
    // stuck on its roof or side (or wedged on a rock): flip back after a moment
    if ((_up[1] < 0.15 && this.speed < 3) || (_up[1] < 0.6 && this.speed < 1.5)) this.upsideT += dt; else this.upsideT = 0;
    if (this.upsideT > 1.6 || this.input.reset) { this.flipUpright(); this.input.reset = false; }
    // hard hits hurt
    if (b.lastImpact > 11) this.damage((b.lastImpact - 11) * 3.2, b.lastHitBy && b.lastHitBy.car ? b.lastHitBy.car : null);
  }

  flipUpright() {
    const b = this.body;
    b.axis(2, _fw);
    qFromAxisAngle(0, 1, 0, Math.atan2(_fw[0], _fw[2]), b.q);
    b.p[1] = this.world.groundAt(b.p[0], b.p[2]) + 1.6;
    b.v[0] *= 0.3; b.v[1] = 2; b.v[2] *= 0.3;
    b.w[0] = b.w[1] = b.w[2] = 0;
    this.upsideT = 0;
  }

  damage(amount, by) {
    if (this.wrecked || amount <= 0) return;
    this.hp -= amount;
    if (by && by !== this) { this.lastHitBy = by; this.lastHitT = performance.now(); }
    if (this.hp <= 0 && this.onWreck) this.onWreck(this);
  }

  // ----------------------------------------------------------------- remote cars: snapshot interpolation
  pushRemote(s, now) {
    const buf = this.remote.buf;
    buf.push({ t: now, p: s.p, q: s.q, v: s.v });
    if (buf.length > 12) buf.shift();
  }

  applyRemote(now) {
    const buf = this.remote.buf;
    if (!buf.length) return;
    const rt = now - 110; // render 110 ms in the past: smooth even with jittery packets
    let a = buf[0], c = buf[buf.length - 1];
    for (let i = 0; i < buf.length - 1; i++) if (buf[i].t <= rt && buf[i + 1].t >= rt) { a = buf[i]; c = buf[i + 1]; break; }
    const span = c.t - a.t;
    const k = span > 0 ? Math.max(0, Math.min(1.5, (rt - a.t) / span)) : 1;
    const b = this.body;
    for (let i = 0; i < 3; i++) b.p[i] = a.p[i] + (c.p[i] - a.p[i]) * k;
    // nlerp quaternions (shortest path)
    let dot = 0;
    for (let i = 0; i < 4; i++) dot += a.q[i] * c.q[i];
    const sgn = dot < 0 ? -1 : 1;
    for (let i = 0; i < 4; i++) b.q[i] = a.q[i] + (c.q[i] * sgn - a.q[i]) * Math.min(1, k);
    const l = Math.hypot(b.q[0], b.q[1], b.q[2], b.q[3]) || 1;
    for (let i = 0; i < 4; i++) b.q[i] /= l;
    for (let i = 0; i < 3; i++) b.v[i] = c.v[i];
    this.speed = Math.hypot(b.v[0], b.v[2]);
    b.updateSpheres();
  }

  // ----------------------------------------------------------------- visuals
  sync(dt, time) {
    const b = this.body;
    this.root.setPosition(b.p[0], b.p[1], b.p[2]);
    this.root.setRotation(b.q[0], b.q[1], b.q[2], b.q[3]);
    b.axis(2, _fw);
    const fwdSpeed = V.dot(b.v, _fw);
    for (const w of this.wheels) {
      if (!this.local) {
        // remote: estimate the suspension from the ground under the wheel
        _m[0] = w.x; _m[1] = 0; _m[2] = w.z;
        qrot(b.q, _m, _r);
        w.dist = Math.min(this.spec.rest + w.r, b.p[1] + _r[1] - this.world.hf.at(b.p[0] + _r[0], b.p[2] + _r[2]));
        w.contact = w.dist < this.spec.rest + w.r;
      }
      w.angle += (fwdSpeed / w.r) * dt;
      w.pivot.setLocalPosition(w.x, -(w.dist - w.r), w.z);
      w.pivot.setLocalEulerAngles(0, (w.front ? this.steer : 0) * 57.3, 0);
      w.spin.setLocalEulerAngles((w.angle * 57.3) % 360, 0, 0);
    }
    // gadget visuals
    for (const [k, e] of Object.entries(this.gadgetEnts)) e.enabled = k === 'flame' ? this.boosting : this.gadget === k;
    if (this.boosting) {
      const s = (this.gadget === 'rocket' ? 1.6 : 0.8) * (0.85 + Math.sin(time * 40) * 0.15);
      this.gadgetEnts.flame.setLocalScale(s, s, s);
    }
    const lamp = 2.2 + this.flash * 3;
    this.lightMat.setParameter('uEmissive', lamp);
    // the hat flies off like a cork when wrecked
    if (this.cork) {
      const c = this.cork;
      c.v[1] -= 19 * dt;
      c.p[0] += c.v[0] * dt; c.p[1] += c.v[1] * dt; c.p[2] += c.v[2] * dt;
      c.spin += dt * 9;
      this.hatEnt.setPosition(c.p[0], c.p[1], c.p[2]);
      this.hatEnt.setEulerAngles(c.spin * 60, c.spin * 25, 0);
    }
  }

  wreck() {
    this.wrecked = 1;
    this.hp = 0;
    this.body.enabled = false;
    this.chassis.enabled = false;
    for (const w of this.wheels) w.pivot.enabled = false;
    // pop the hat
    const p = this.body.p;
    this.hatEnt.reparent(this.app.root);
    this.hatEnt.setLocalScale(SCALE, SCALE, SCALE);
    this.hatEnt.enabled = true;
    this.cork = { p: [p[0], p[1] + 1, p[2]], v: [(Math.random() - 0.5) * 3, 13, (Math.random() - 0.5) * 3], spin: 0 };
  }

  unwreck(spawn) {
    this.cork = null;
    this.hatEnt.reparent(this.chassis);
    this.hatEnt.setLocalScale(1, 1, 1);
    this.hatEnt.setLocalPosition(this.spec.seat[0], this.spec.seat[1], this.spec.seat[2]);
    this.hatEnt.setLocalEulerAngles(0, 0, 0);
    this.chassis.enabled = true;
    for (const w of this.wheels) w.pivot.enabled = true;
    this.respawnAt(spawn);
  }

  /** headlight for the renderer: [pos, dir, range, cos, intensity] */
  headlight(out) {
    const b = this.body;
    b.axis(2, _fw); b.axis(1, _up);
    const f = this.spec.front * SCALE, u = (this.spec.lamps[0][1] + 0.2) * SCALE;
    out.p[0] = b.p[0] + _fw[0] * f + _up[0] * u; out.p[1] = b.p[1] + _fw[1] * f + _up[1] * u; out.p[2] = b.p[2] + _fw[2] * f + _up[2] * u;
    out.d[0] = _fw[0] * 0.95 - _up[0] * 0.3; out.d[1] = _fw[1] * 0.95 - _up[1] * 0.3; out.d[2] = _fw[2] * 0.95 - _up[2] * 0.3;
    const dl = Math.hypot(out.d[0], out.d[1], out.d[2]) || 1;
    out.d[0] /= dl; out.d[1] /= dl; out.d[2] /= dl;
    out.range = 22 + this.flash * 14;
    out.cos = 0.78 - this.flash * 0.08;
    out.i = this.wrecked ? 0 : 1 + this.flash * 0.8;
    return out;
  }

  destroy() {
    this.physics.remove(this.body);
    this.physics.hooks = this.physics.hooks.filter((f) => f !== this.hook);
    this.hatEnt.destroy();
    this.root.destroy();
  }
}

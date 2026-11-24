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
import { rigPhysics, RigVisual, makeGadget } from './mods.js';
import { DEFAULT_SETUP, packSetup, PAINTS } from './catalog.js';
import { MeshBuilder as _MB } from './meshes.js';

export const CAR_COLOR_NAMES = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];
export const PAINT_RGB = PAINTS.map((p) => p.rgb);
const BOOST_TOP_K = 1.45, ROCKET_TOP_K = 1.9;

function wheelMesh(device, R) {
  const mb = new MeshBuilder();
  const rub = () => rgba(0.1, 0.095, 0.09, CLS.CHAR); // worn rubber
  addTube(mb, [[-0.2, 0, 0, R - 0.05], [-0.24, 0, 0, R], [0.24, 0, 0, R], [0.2, 0, 0, R - 0.05]], { seg: 14, subdiv: 1, capEnd: true, capStart: true, colFn: rub });
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; addBox(mb, { y: Math.cos(a) * R, z: Math.sin(a) * R, sx: 0.46, sy: 0.08, sz: 0.12, tilt: -a, col: rub() }); }
  // spokes, so you can see the wheel turn against the fog
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI; addBox(mb, { x: 0.26, sx: 0.04, sy: R * 1.5, sz: 0.07, tilt: a, col: rgba(0.55, 0.42, 0.16, CLS.STONE) }); } // dull mustard hub spokes
  addLathe(mb, [[0.0, 0.24], [R * 0.32, 0.25], [R * 0.36, 0.27], [0.0, 0.28]], { seg: 10, warp: (x, y, z) => [y, x, z], colFn: () => rgba(0.5, 0.38, 0.15, CLS.STONE) }); // hub cap
  return mb.build(device);
}

function gadgetMeshes(device) {
  const metal = () => rgba(0.17, 0.17, 0.18, CLS.STONE), rust = () => rgba(0.44, 0.23, 0.12, CLS.STONE), brass = () => rgba(0.52, 0.4, 0.18, CLS.STONE), steel = () => rgba(0.32, 0.33, 0.35, CLS.STONE);
  const plow = new MeshBuilder();
  addBox(plow, { y: -0.1, z: 1.7, sx: 2.1, sy: 0.9, sz: 0.14, tilt: -0.5, col: rust() });
  for (let i = 0; i < 4; i++) addTube(plow, [[0, -0.5 + i * 0.3, 1.78, 0.07], [0, -0.55 + i * 0.3, 2.3, 0.0]], { seg: 4, colFn: metal });
  const flame = new MeshBuilder();
  addLathe(flame, [[0.0, 0.0], [0.25, 0.2], [0.18, 0.9], [0.0, 1.9]], { seg: 8, colFn: () => rgba(1.0, 0.6, 0.2, CLS.GLOW), warp: (x, y, z) => [x, z, -y] });
  const horn = new MeshBuilder();
  addLathe(horn, [[0.05, 0], [0.06, 0.45], [0.16, 0.7], [0.34, 0.84]], { seg: 10, colFn: brass, warp: (x, y, z) => [x, z + 0.6, y + 0.45] });
  const keg = new MeshBuilder();
  addLathe(keg, [[0.0, -0.22], [0.22, -0.2], [0.25, 0.0], [0.22, 0.2], [0.0, 0.22]], { seg: 10, colFn: metal, warp: (x, y, z) => [x, z + 0.3, y - 1.15] });
  const spring = new MeshBuilder();
  const coil = [];
  for (let i = 0; i <= 24; i++) { const a = i * 0.8; coil.push([Math.cos(a) * 0.18, -0.5 + i * 0.02, Math.sin(a) * 0.18, 0.035]); }
  for (const z of [1.0, -0.95]) addTube(spring, coil.map(([cx, cy, cz, rr]) => [cx, cy, cz + z, rr]), { seg: 3, subdiv: 1, colFn: steel });
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
  shared = { wheels: new Map(), lamp: lamp.build(device), gadgets: gadgetMeshes(device), beam: beamMesh(device), halo: haloMesh(device), mat: silMaterial({ cls: 0, paint: 1 }), glow: glowMaterial(1.0), flameGlow: silMaterial({ glow: 1.2 }) };
  return shared;
}

const _f = [0, 0], _u = [0, 0], _n = [0, 0], _v = [0, 0], _r = [0, 0];

export class Car {
  constructor({ app, layer, physics, terrain, id, local = false, vehicle = 'mudrunner', colorIdx = 0, name = 'Buggy', hat = 'straw', setup = null }) {
    const S = (this.spec = vehicleSpec(vehicle));
    this.vehicle = S.id;
    this.app = app;
    this.physics = physics;
    this.terrain = terrain;
    this.id = id;
    this.local = local;
    this.colorIdx = colorIdx;
    this.name = name;
    this.layer = layer;
    this.setup = { ...DEFAULT_SETUP, hat, ...(setup || {}), ride: S.id };
    hat = this.setup.hat;
    this.setupKey = packSetup(this.setup);
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
    // Side-view suspension, derived per vehicle and undercarriage so every machine rides clear of
    // the ground: springs sag 35% of their travel at rest, and every ray reaches the ground with
    // the body level even when the wheels differ in size (the tractor). The undercarriage (tires,
    // treads, pogo coils, spider legs, sawblades, hover jets) decides the rays and the feel.
    const R = (this.rigP = rigPhysics(this.setup.wheels, this.wheels0, this.setup.tire, S));
    this.saw = R.saw;
    const rMax = Math.max(...R.rays.map((w) => w.r));
    this.rest = R.rest;
    this.reach = this.rest + rMax; // body centre line to the ground, springs fully extended
    this.kS = (-G / R.rays.length) / (0.35 * this.rest) * R.kMul;
    this.dS = Math.min(0.7, (S.damp / (1.414 * Math.sqrt(S.k))) * 1.35) * 1.414 * Math.sqrt(this.kS) * R.dMul;
    const ride = this.reach - (0.35 * this.rest) / R.kMul; // ride height of the centre line
    const belly = Math.max(...this.shapes0.map(([, y, r]) => r - y));
    // big tires are solid: they bump rivals and props (but leave the ground to the springs)
    if ((R.kind === 'tires' || R.kind === 'saw') && this.setup.tire >= 1.3) for (const w of R.rays) this.shapes0.push([w.lx, -(ride - w.r), w.r * 0.92, 1]);
    this.roofY = S.seat[1] * SCALE + (S.tall ? 0.7 : 0.95);

    this.root = new pc.Entity(`car-${id}`);
    app.root.addChild(this.root);
    this.holder = new pc.Entity('holder');
    this.root.addChild(this.holder);
    this.holder.setLocalScale(SCALE, SCALE, SCALE);
    this.holderYaw = 90;
    this.holder.setLocalEulerAngles(0, 90, 0);
    const paint = this.setup.paint >= 0 ? this.setup.paint : colorIdx % PAINT_RGB.length; // your pick, or your seat's colour
    this.chassis = ent(chassisFor(app.graphicsDevice, S.id, PAINT_RGB[paint], paint), A.mat, this.holder, 'chassis');
    // measure the real body: where tools bolt on (roof top, nose, tail), in car-local metres
    const ab = this.chassis.render.meshInstances[0].mesh.aabb;
    this.roofTop = (ab.center.y + ab.halfExtents.y) * SCALE;
    this.noseX = (ab.center.z + ab.halfExtents.z) * SCALE;
    this.tailX = (ab.halfExtents.z - ab.center.z) * SCALE;
    this.roofY = this.roofTop + 0.08; // the roof rack
    this.carryY = this.roofTop + 0.75; // where a held prop rides
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
    // the rays under the car; tires and sawblades get a spinning wheel on the near side
    const round = R.kind === 'tires' || R.kind === 'saw';
    this.wheels = R.rays.map((w) => {
      const W = { lx: w.lx, lx0: w.lx, r: w.r, pivot: null, spin: null, comp: 0, prevComp: 0, dist: this.reach, contact: false, angle: 0 };
      if (round) {
        W.pivot = new pc.Entity('wheelPivot');
        this.root.addChild(W.pivot);
        if (R.saw) {
          W.spin = ent(sawMesh(app.graphicsDevice), A.mat, W.pivot, 'saw');
          W.spin.setLocalScale(w.r, w.r, w.r);
        } else {
          const r0 = Math.round((w.r / this.setup.tire / SCALE) * 100) / 100;
          if (!A.wheels.has(r0)) A.wheels.set(r0, wheelMesh(app.graphicsDevice, r0));
          W.spin = ent(A.wheels.get(r0), A.mat, W.pivot, 'wheel');
          const k = SCALE * this.setup.tire;
          W.spin.setLocalScale(k, k, k);
          W.spin.setLocalEulerAngles(0, 90, 0);
        }
      }
      return W;
    });
    this.rigVis = new RigVisual(this);
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
    this.grabbers = new Map(); // grabber id -> grip expiry (ms): rivals' hands holding this car
    this.grabTo = null; this.grabV = [0, 0];
    this.halves = null; // the two halves of a car torn in two, flying apart
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
    // the two gadget slots from the garage
    this.roofG = makeGadget('roof', this.setup.roof, this, Car.ctx);
    this.bumperG = makeGadget('bumper', this.setup.bumper, this, Car.ctx);
  }

  gadgets() { return [this.roofG, this.bumperG].filter(Boolean); }

  setHat(id) { if (id === this.hat) return; this.hat = id; this.hatEnt.render.meshInstances[0].mesh = hatMesh(this.app.graphicsDevice, id); }

  setFacing(f) {
    if (f === this.facing) return;
    this.facing = f;
    this.body.setShapes(this.shapes0.map(([x, y, r, fl]) => [x * f, y, r, fl]));
    for (const w of this.wheels) w.lx = w.lx0 * f;
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
    if (!b.enabled || this.wrecked || this.ghost) return;
    const S = this.spec, M = S.mass, K = M * this.kS, D = M * this.dS, REST = this.rest, REACH = this.reach, f = this.facing, R = this.rigP;
    // held up by a rival's grabby hands: dangle from them (gravity cancelled, sprung to the grip)
    if (this.grabTo) {
      const [gx, gy] = this.grabTo;
      b.addForce(((gx - b.p[0]) * 60 - (b.v[0] - this.grabV[0]) * 11) * M, ((gy - b.p[1]) * 60 - (b.v[1] - this.grabV[1]) * 11) * M - G * M);
      b.t += (Math.sin(performance.now() * 0.006) * 2 - b.w * 2) * b.I; // kicking about
      this.grounded = 0;
      return;
    }
    const c = Math.cos(b.a), s = Math.sin(b.a);
    _u[0] = -s; _u[1] = c; // body up
    const fwdX = c * f, fwdY = s * f; // where the nose points
    const vFwd = b.v[0] * fwdX + b.v[1] * fwdY;
    this.speed = Math.hypot(b.v[0], b.v[1]);
    const rocket = this.gadget === 'rocket';
    const top = S.top * (rocket && this.boosting ? ROCKET_TOP_K : this.boosting ? BOOST_TOP_K : 1);
    const per = M / Math.max(1, this.grounded || this.wheels.length); // the drive is shared by the rays touching the ground
    let contacts = 0;
    for (const w of this.wheels) {
      const mx = b.p[0] + c * w.lx, my = b.p[1] + s * w.lx;
      let g = this.terrain.height(mx), under = null;
      // wheels also grip whatever lies under them: logs, boulders, barrels, the cage-ball, a see-saw, a rival's roof
      for (const o of this.physics.bodies) {
        if (o === b || !o.enabled || Math.abs(o.p[0] - mx) > o.bound) continue;
        for (let i = 0; i < o.shapes.length; i++) {
          const cx = o.ws[i][0], cy = o.ws[i][1], r = o.shapes[i][2];
          if (Math.abs(mx - cx) < r * 0.9 && cy + r < my + 0.3) { const top = cy + Math.sqrt(r * r - (mx - cx) ** 2); if (top > g) { g = top; under = o; } }
        }
      }
      if (R.hover) { const wy = this.terrain.water(mx); if (wy !== null) g = Math.max(g, wy + 0.05); } // jets skim the pond
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
      if (under && !under.kinematic) under.addForceAt(-_n[0] * fs, -_n[1] * fs, mx - under.p[0], g - under.p[1]); // and push back on it
      // spider feet cling to the ground, so it can walk up slopes nothing else can
      if (R.adhesion) b.addForceAt(-_n[0] * M * 11 / this.wheels.length, -_n[1] * M * 11 / this.wheels.length, rx, ry);
      // drive along the ground
      const tx = _n[1] * f, ty = -_n[0] * f; // ground tangent, pointing the way the nose faces
      b.pointVel(rx, ry, _v);
      const vlong = _v[0] * tx + _v[1] * ty;
      let fl;
      if (R.hover) { // jets push whatever is under them, and barely brake
        fl = -vlong * per * 0.015;
        if (this.throttle > 0.05) fl += this.throttle * per * S.accel * 0.95 * Math.max(0, Math.min(1, 1.6 * (1 - vlong / top)));
        else if (this.throttle < -0.05) fl -= Math.sign(vlong) * per * 4;
      } else {
        fl = -vlong * per * 0.12;
        if (this.throttle > 0.05) fl += this.throttle * per * S.accel * R.accelMul * Math.max(0, Math.min(1, 1.7 * (1 - vlong / top)));
        else if (this.throttle < -0.05) fl -= Math.sign(vlong) * per * 16;
        const cap = fs * R.grip;
        fl = Math.max(-cap, Math.min(cap, fl));
      }
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
    // pogo coils: a gyro keeps the body level between bounces (it would kick itself over otherwise)
    if (R.pogo) { const a = Math.atan2(s, c); b.t += (-a * 14 - b.w * 4) * b.I; }
    for (const g of this.gadgets()) if (g.forces) g.forces(h);
    if (Math.abs(b.w) > 9) b.w = Math.sign(b.w) * 9;
  }

  /** Per frame, local cars: steering logic, boost meter, gadget timer, flips, damage. */
  update(dt) {
    const b = this.body, inp = this.input;
    if (this.wrecked) return;
    for (const g of this.gadgets()) g.update(dt);
    if (this.ghost) return; // ejected: the pilot is floating down
    if (this.autopilot) { inp.dir = this.facing; inp.boost = true; } // the empty car rams on
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
    // pogo coils bounce on their own while you drive
    if (this.rigP.pogo && this.grounded >= this.wheels.length && this.hopCd <= 0 && Math.abs(this.throttle) > 0.05) {
      const fwd = this.facing * Math.max(0, Math.min(4.5, this.spec.top * 0.9 - b.v[0] * this.facing)) * this.throttle;
      b.v[0] += fwd; b.v[1] = Math.max(b.v[1], 0) + Math.cos(b.a) * 6.5;
      this.hopCd = 0.5; this.hopped = true;
    }
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
  /** A snapshot from the car's owner. s.t is the owner's clock: we keep our own estimate of the
   *  offset between the clocks, so arrival jitter (bunched packets) never shows up as stutter. */
  pushRemote(s, now) {
    const R = this.remote, buf = R.buf, st = s.t ?? now;
    const off = now - st; // their clock -> ours, plus network delay
    if (R.off === undefined || off < R.off) R.off = off; // the quickest packet is the truest
    else R.off += (off - R.off) * 0.01; // and let it drift up slowly if the link gets slower
    if (buf.length && st <= buf[buf.length - 1].t) return; // a duplicate or out of order
    buf.push({ t: st, p: s.p, a: s.a, v: s.v });
    if (buf.length > 24) buf.shift();
  }
  /** Replay the owner's car 100 ms in the past, between the two snapshots around that moment. */
  applyRemote(now) {
    const R = this.remote, buf = R.buf;
    if (!buf.length) return;
    const rt = now - R.off - 100, b = this.body, last = buf[buf.length - 1];
    let px, py, a;
    if (rt >= last.t) { // nothing newer yet: carry on along its velocity, briefly
      const ex = Math.min(rt - last.t, 120) / 1000;
      px = last.p[0] + last.v[0] * ex; py = last.p[1] + last.v[1] * ex; a = last.a;
    } else if (rt <= buf[0].t) { px = buf[0].p[0]; py = buf[0].p[1]; a = buf[0].a; }
    else {
      let i = buf.length - 2;
      while (i > 0 && buf[i].t > rt) i--;
      const A = buf[i], C = buf[i + 1], k = (rt - A.t) / Math.max(1, C.t - A.t);
      if (Math.hypot(C.p[0] - A.p[0], C.p[1] - A.p[1]) > 8) { const S = k < 0.5 ? A : C; px = S.p[0]; py = S.p[1]; a = S.a; } // a respawn: snap, don't slide
      else {
        px = A.p[0] + (C.p[0] - A.p[0]) * k; py = A.p[1] + (C.p[1] - A.p[1]) * k;
        const da = Math.atan2(Math.sin(C.a - A.a), Math.cos(C.a - A.a));
        a = A.a + da * k;
      }
    }
    b.p[0] = px; b.p[1] = py; b.a = a;
    b.v[0] = last.v[0]; b.v[1] = last.v[1];
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
    if (!this.local) this.grounded = 0;
    for (const w of this.wheels) {
      if (!this.local) { // estimate suspension from the ground under the wheel
        const mx = b.p[0] + c * w.lx, my = b.p[1] + s * w.lx;
        w.dist = Math.min(this.reach, Math.max(this.reach - this.rest, (my - this.terrain.height(mx)) / Math.max(0.3, c)));
        if (w.dist < this.reach - 0.02) this.grounded++;
      }
      w.angle += (vlong / Math.max(0.1, w.r)) * dt * (this.saw ? 3 : 1);
      if (!w.pivot) continue;
      w.pivot.setLocalPosition(w.lx, -(w.dist - w.r), 0.45);
      w.pivot.setLocalEulerAngles(0, 0, (-w.angle * 180 / Math.PI * f) % 360);
    }
    this.rigVis.sync(dt);
    for (const g of this.gadgets()) g.sync(dt);
    // beam + halo from the front lamp
    const lx = S.front * SCALE * 0.95 * f, ly = (S.lamps[0][1] + 0.05) * SCALE;
    const on = this.wrecked || this.ghost ? 0 : 1;
    this.beam.enabled = this.halo.enabled = !!on && Math.abs(this.holderYaw) > 60;
    this.beam.setLocalPosition(lx, ly, 0.6);
    this.beam.setLocalScale(f * (1 + this.flash * 0.35), 1 + this.flash * 0.6, 1);
    this.halo.setLocalPosition(lx, ly, 0.7);
    const hs = 0.5 + this.flash * 1.2 + Math.sin(time * 23) * 0.03;
    this.halo.setLocalScale(hs, hs, 1);
    // gadget props
    for (const [k, e] of Object.entries(this.gadgetEnts)) e.enabled = !this.wrecked && (k === 'flame' ? this.boosting : this.gadget === k);
    if (this.boosting) { const fl = 0.8 + Math.random() * 0.5; this.gadgetEnts.flame.setLocalScale(1, 1, fl * (this.gadget === 'rocket' ? 1.6 : 1)); }
    // the halves of a torn car tumble apart, bounce, and fade into the fog
    if (this.halves) {
      for (const H of this.halves) {
        H.t += dt;
        H.v[1] += G * dt;
        H.p[0] += H.v[0] * dt; H.p[1] += H.v[1] * dt; H.a += H.w * dt;
        const g = this.terrain.height(H.p[0]);
        if (H.p[1] < g + 0.35) { H.p[1] = g + 0.35; H.v[1] = Math.abs(H.v[1]) * 0.3; H.v[0] *= 0.6; H.w *= 0.5; if (Math.random() < 0.5 && Car.ctx) Car.ctx.fx.sparkBurst(H.p[0], g + 0.2, 3, 3); }
        H.e.setPosition(H.p[0], H.p[1], 0);
        H.e.setEulerAngles(0, 0, H.a * 57.3);
        if (H.t > 2.6) { const k = Math.max(0, 1 - (H.t - 2.6) / 0.6); H.e.setLocalScale(k, k, k); }
      }
      if (this.halves[0].t > 3.2) this.clearHalves();
    }
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

  /** Torn in two by two pairs of hands: the chassis splits at the middle (cut in the shader, with
   *  a ragged edge) and each half flies off towards one of the grabbers. xs: the grabbers' x. */
  tear(xs = []) {
    if (this.wrecked) return;
    const b = this.body, ctx = Car.ctx, halves = [];
    for (const front of [true, false]) {
      const half = new pc.Entity('half');
      this.app.root.addChild(half);
      half.setPosition(this.root.getPosition());
      half.setRotation(this.root.getRotation());
      const hc = this.holder.clone();
      half.addChild(hc);
      hc.setLocalPosition(this.holder.getLocalPosition()); hc.setLocalRotation(this.holder.getLocalRotation()); hc.setLocalScale(this.holder.getLocalScale());
      const ch = hc.findByName('chassis');
      if (ch) ch.render.meshInstances[0].material = clipMaterial(front);
      for (const k of [...hc.children]) if (k !== ch && (k.name === 'hat' || !k.enabled || (k.getLocalPosition().z >= 0) !== front)) k.destroy();
      for (const w of this.wheels) if (w.pivot && (w.lx0 > 0) === front) { const wc = w.pivot.clone(); half.addChild(wc); wc.setLocalPosition(w.pivot.getLocalPosition()); wc.setLocalRotation(w.pivot.getLocalRotation()); }
      const dir = front ? this.facing : -this.facing; // which way this half points in the world
      const gx = xs.find((x) => Math.sign(x - b.p[0]) === dir);
      const pull = gx !== undefined ? Math.min(6, Math.abs(gx - b.p[0])) : 2;
      halves.push({ e: half, p: [b.p[0] + dir * 0.35, b.p[1]], v: [b.v[0] * 0.3 + dir * (4 + pull + Math.random() * 2), 6 + Math.random() * 4], a: b.a, w: -dir * (3 + Math.random() * 4), t: 0 });
    }
    this.halves = halves;
    if (ctx) {
      for (let i = 0; i < 4; i++) ctx.fx.sparkBurst(b.p[0] + (Math.random() - 0.5) * 0.3, b.p[1] - 0.4 + i * 0.35, 8, 7);
      for (let i = 0; i < 14; i++) ctx.fx.add({ kind: 'debris', x: b.p[0], y: b.p[1] + Math.random(), z: 0.6, vx: (Math.random() - 0.5) * 9, vy: 3 + Math.random() * 7, t: 0, life: 1.6, size: 0.1 + Math.random() * 0.2, g: -19, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 20 });
      ctx.fx.flashes.push({ x: b.p[0], y: b.p[1], r: 5, k: 1.6, t: 0, life: 0.35 });
      ctx.sfx.play('crack', { x: b.p[0], z: 0 }, { vol: 1.4 });
      ctx.sfx.play('crunch', { x: b.p[0], z: 0 }, { vol: 1.4 });
    }
    this.torn = true;
    this.wreck();
  }

  wreck() {
    this.wrecked = 1;
    this.grabbers.clear(); this.grabTo = null;
    this.hp = 0;
    this.body.enabled = false;
    this.holder.enabled = false;
    for (const w of this.wheels) if (w.pivot) w.pivot.enabled = false;
    if (this.roofG && this.roofG.held && Car.ctx) { Car.ctx.sandbox.throw(this.roofG.held, this.id, this.body.v[0], this.body.v[1] + 4); this.roofG.held = null; }
    this.ghost = false; this.autopilot = false;
    const p = this.body.p;
    this.hatEnt.reparent(this.app.root);
    this.hatEnt.setLocalScale(SCALE, SCALE, SCALE);
    this.hatEnt.enabled = true;
    this.cork = { p: [p[0], p[1] + 1], v: [(Math.random() - 0.5) * 6, 14], spin: 0 };
  }

  clearHalves() { if (this.halves) for (const H of this.halves) H.e.destroy(); this.halves = null; }

  unwreck(x) {
    this.cork = null;
    this.torn = false;
    this.hatEnt.reparent(this.holder);
    this.hatEnt.setLocalScale(1, 1, 1);
    this.hatEnt.setLocalPosition(this.spec.seat[0], this.spec.seat[1], this.spec.seat[2]);
    this.hatEnt.setLocalEulerAngles(0, 0, 0);
    for (const w of this.wheels) if (w.pivot) w.pivot.enabled = true;
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
    out[3] = this.wrecked || this.ghost || Math.abs(this.holderYaw) < 60 ? 0 : 1 + this.flash * 1.2;
    return out;
  }

  destroy() {
    this.physics.remove(this.body);
    this.physics.hooks = this.physics.hooks.filter((fn) => fn !== this.hook);
    if (this.roofG && this.roofG.held && Car.ctx) Car.ctx.sandbox.throw(this.roofG.held, this.id, 0, 0);
    for (const g of this.gadgets()) g.destroy();
    this.clearHalves();
    this.rigVis.destroy();
    this.hatEnt.destroy();
    this.root.destroy();
  }
}

/** services the gadgets need (sandbox, other cars, shoves): set by the game */
Car.ctx = null;

const clipMats = {};
/** the chassis material, cut at the middle: the front half keeps z > 0, the rear z < 0 */
function clipMaterial(front) {
  const k = front ? 'f' : 'r';
  if (!clipMats[k]) clipMats[k] = silMaterial({ cls: 0, paint: 1, clip: front ? [0, 0, -1, 0] : [0, 0, 1, 0] });
  return clipMats[k];
}

let sawCache = null;
function sawMesh(device) {
  if (sawCache) return sawCache;
  const mb = new _MB();
  addLathe(mb, [[0.0, -0.08], [1.0, -0.05], [1.0, 0.05], [0.0, 0.08]], { seg: 18, warp: (x, y, z) => [x, z, y], colFn: (t) => (t > 0.35 && t < 0.65 ? rgba(1.0, 0.62, 0.25, CLS.GLOW) : rgba(0.06, 0.06, 0.06, CLS.CHAR)) });
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; addBox(mb, { x: Math.cos(a) * 1.04, y: Math.sin(a) * 1.04, sx: 0.24, sy: 0.12, sz: 0.1, tilt: a + 0.6, col: rgba(0.1, 0.1, 0.1, CLS.CHAR) }); }
  addSphere(mb, { r: 0.2, segW: 6, segH: 4, colFn: () => rgba(0.14, 0.14, 0.14, CLS.CHAR) });
  sawCache = mb.build(device);
  return sawCache;
}

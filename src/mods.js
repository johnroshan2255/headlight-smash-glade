// Car mods from the garage: what's under the car (tires, treads, pogo coils, spider legs, sawblades,
// hover thrusters) and the two active gadget slots (roof: E, bumper: Q).
//
// Every gadget is a small class with the same shape:
//   fire()        the player pressed its button (local cars only)
//   update(dt)    gameplay, local cars only (hit tests, timers)
//   sync(dt)      visuals, every car (local and remote)
//   state()       a tiny array sent in the car's network snapshot; setState() on remote copies
//   destroy()
// Effects on other cars always go through ctx.shove(target, vx, vy, dmg, by): the target's owner
// applies them, so every browser stays authoritative for its own buggy.
import * as pc from 'playcanvas';
import { CLS } from './shaders.js';
import { MeshBuilder, rgba, addTube, addLathe, addSphere, addBox } from './meshes.js';
import { silMaterial, glowMaterial } from './sil.js';
import { G } from './physics2d.js';

const BLK = (v = 0) => rgba(0.03 + v, 0.03 + v, 0.03 + v, CLS.CHAR);
const AMBER = () => rgba(1.0, 0.62, 0.25, CLS.GLOW);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------------------------------ meshes
// the kit's paint box: muted, dusty, worn (the shader adds scratches and grime on top)
const K3 = (r, g, b) => () => rgba(r, g, b, CLS.CHAR);
const P = {
  gun: K3(0.17, 0.17, 0.18), steel: K3(0.32, 0.33, 0.35), rust: K3(0.44, 0.23, 0.12), iron: K3(0.25, 0.22, 0.2),
  brown: K3(0.29, 0.18, 0.1), brownDk: K3(0.17, 0.1, 0.06), brass: K3(0.52, 0.4, 0.18), copper: K3(0.52, 0.29, 0.15),
  olive: K3(0.3, 0.33, 0.17), red: K3(0.46, 0.14, 0.11), leather: K3(0.42, 0.13, 0.09), yellow: K3(0.6, 0.45, 0.14),
  orange: K3(0.58, 0.32, 0.12), tan: K3(0.5, 0.41, 0.27), rubber: K3(0.1, 0.095, 0.09), cream: K3(0.55, 0.5, 0.4),
};

let M = null;
function meshes(device) {
  if (M) return M;
  const build = (fn) => { const mb = new MeshBuilder(); fn(mb); return mb.build(device); };
  /** a unit segment along +x (scale x = length, y/z = thickness), with gunmetal collars at the ends */
  const segOf = (col, collars = true) => build((mb) => {
    addBox(mb, { x: 0.5, sx: 1, sy: 1, sz: 1, col: col() });
    if (collars) for (const x of [0.05, 0.95]) addBox(mb, { x, sx: 0.1, sy: 1.14, sz: 1.14, col: P.gun() });
  });
  M = {
    mat: silMaterial({ cls: CLS.CHAR, paint: 1 }),
    glow: glowMaterial(1.0),
    seg: segOf(P.gun),
    segSteel: segOf(P.steel), segYellow: segOf(P.yellow), segOrange: segOf(P.orange), segRope: segOf(P.tan, false),
    // a spider leg: dark brown armour with darker stripe bands, gunmetal collars and brass rivets
    legSeg: build((mb) => {
      addBox(mb, { x: 0.5, sx: 1, sy: 1, sz: 1, col: P.brown() });
      for (const x of [0.32, 0.68]) addBox(mb, { x, sx: 0.07, sy: 1.05, sz: 1.05, col: P.brownDk() });
      for (const x of [0.05, 0.95]) addBox(mb, { x, sx: 0.1, sy: 1.18, sz: 1.18, col: P.gun() });
      for (const x of [0.18, 0.5, 0.82]) addBox(mb, { x, z: 0.52, sx: 0.035, sy: 0.3, sz: 0.06, col: P.brass() });
    }),
    // a roof rack: a gunmetal plate with rails and two legs down onto the roof
    mount: build((mb) => {
      addBox(mb, { y: 0.06, sx: 0.9, sy: 0.06, sz: 0.62, col: P.gun() });
      for (const z of [-0.28, 0.28]) addBox(mb, { y: 0.11, z, sx: 0.94, sy: 0.05, sz: 0.05, col: P.steel() });
      for (const x of [-0.32, 0.32]) addBox(mb, { x, y: -0.06, sx: 0.07, sy: 0.24, sz: 0.5, col: P.gun() });
      for (const x of [-0.38, 0.38]) addBox(mb, { x, y: 0.1, z: 0.32, sx: 0.04, sy: 0.04, sz: 0.04, col: P.brass() });
    }),
    // the wrecking-ball crane: a post, a boom reaching back, a pulley at the tip
    crane: build((mb) => {
      addBox(mb, { x: 0.0, y: 0.45, sx: 0.12, sy: 0.9, sz: 0.12, col: P.yellow() });
      addTube(mb, [[0.0, 0.85, 0, 0.06], [-0.18, 0.98, 0, 0.05]], { seg: 5, colFn: P.yellow });
      addTube(mb, [[0.0, 0.35, 0, 0.035], [-0.14, 0.92, 0, 0.03]], { seg: 4, colFn: P.gun }); // brace
      addSphere(mb, { x: -0.18, y: 0.98, r: 0.1, sy: 1, segW: 8, segH: 5, colFn: P.gun });
    }),
    foot: build((mb) => { addSphere(mb, { r: 0.13, sy: 0.6, segW: 6, segH: 4, colFn: P.rubber }); addTube(mb, [[0, -0.02, 0, 0.05], [0.1, -0.12, 0, 0.0]], { seg: 4, colFn: P.gun }); }),
    hip: build((mb) => { addSphere(mb, { r: 0.11, segW: 6, segH: 4, colFn: P.gun }); addSphere(mb, { z: 0.09, r: 0.04, segW: 4, segH: 3, colFn: AMBER }); }),
    coil: build((mb) => { const pts = []; for (let i = 0; i <= 30; i++) { const a = i * 0.9; pts.push([Math.cos(a) * 0.13, -i * 0.018, Math.sin(a) * 0.13, 0.025]); } addTube(mb, pts, { seg: 3, subdiv: 1, colFn: P.rust }); }),
    saw: build((mb) => {
      addLathe(mb, [[0.0, -0.06], [1.0, -0.04], [1.0, 0.04], [0.0, 0.06]], { seg: 18, warp: (x, y, z) => [x, z, y], colFn: (t) => (t > 0.3 && t < 0.7 ? AMBER() : P.steel()) });
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; addBox(mb, { x: Math.cos(a) * 1.02, y: Math.sin(a) * 1.02, sx: 0.22, sy: 0.12, sz: 0.06, tilt: a + 0.6, col: P.steel() }); }
      addSphere(mb, { r: 0.18, segW: 6, segH: 4, colFn: P.rust });
    }),
    pod: build((mb) => { addLathe(mb, [[0.0, 0.0], [0.22, 0.05], [0.26, 0.3], [0.18, 0.45], [0.0, 0.48]], { seg: 10, colFn: (t) => (t > 0.45 && t < 0.6 ? P.gun() : P.copper()) }); addLathe(mb, [[0.0, -0.05], [0.15, -0.02], [0.0, 0.02]], { seg: 10, colFn: AMBER }); }),
    jet: build((mb) => addLathe(mb, [[0.0, 0.0], [0.16, -0.1], [0.1, -0.6], [0.0, -1.0]], { seg: 8, colFn: () => rgba(1.0, 0.65, 0.3, CLS.GLOW) })),
    belt: null, // per car (depends on its wheelbase)
    roadWheel: build((mb) => { addLathe(mb, [[0.0, -0.06], [1.0, -0.05], [1.0, 0.05], [0.0, 0.06]], { seg: 12, warp: (x, y, z) => [x, z, y], colFn: P.olive }); for (let i = 0; i < 3; i++) addBox(mb, { sx: 0.12, sy: 1.6, sz: 0.14, tilt: (i / 3) * Math.PI, col: P.gun() }); }),
    // roof gadgets
    armBase: build((mb) => { addLathe(mb, [[0.0, 0.0], [0.28, 0.0], [0.22, 0.18], [0.0, 0.2]], { seg: 10, colFn: P.gun }); addSphere(mb, { y: 0.22, r: 0.1, segW: 6, segH: 4, colFn: AMBER }); }),
    hand: build((mb) => {
      // a big mechanical hand: orange palm, gunmetal fingers and thumb, all curled a little
      addSphere(mb, { r: 0.22, sy: 0.75, segW: 8, segH: 5, colFn: P.orange });
      for (let i = 0; i < 4; i++) { const y = -0.12 + i * 0.08; addTube(mb, [[0.15, y, 0, 0.05], [0.35, y + 0.02, 0, 0.045], [0.48, y - 0.06, 0, 0.04]], { seg: 4, colFn: P.gun }); }
      addTube(mb, [[0.0, 0.14, 0, 0.05], [0.12, 0.3, 0, 0.045], [0.26, 0.32, 0, 0.04]], { seg: 4, colFn: P.gun });
      addSphere(mb, { x: -0.05, r: 0.07, segW: 5, segH: 3, colFn: AMBER });
    }),
    claw: build((mb) => { for (const s of [-1, 1]) addTube(mb, [[0, 0, 0, 0.05], [0.18 * s, 0.12, 0, 0.04], [0.26 * s, 0.32, 0, 0.035], [0.16 * s, 0.42, 0, 0.03]], { seg: 4, colFn: P.steel }); addSphere(mb, { r: 0.08, segW: 6, segH: 4, colFn: AMBER }); }),
    spikeBall: build((mb) => {
      addSphere(mb, { r: 0.45, segW: 10, segH: 7, colFn: P.iron });
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, b = (i % 3) * 0.9; addTube(mb, [[Math.cos(a) * 0.4 * Math.cos(b), Math.sin(a) * 0.4, Math.cos(a) * 0.4 * Math.sin(b), 0.07], [Math.cos(a) * 0.68 * Math.cos(b), Math.sin(a) * 0.68, Math.cos(a) * 0.68 * Math.sin(b), 0.0]], { seg: 4, colFn: P.rust }); }
      addSphere(mb, { z: 0.36, r: 0.14, segW: 6, segH: 4, colFn: AMBER });
    }),
    link: build((mb) => addLathe(mb, [[0.06, -0.12], [0.09, 0.0], [0.06, 0.12]], { seg: 6, colFn: P.gun })),
    coilRoof: build((mb) => { const pts = []; for (let i = 0; i <= 40; i++) { const a = i * 0.75; pts.push([Math.cos(a) * 0.32, i * 0.016, Math.sin(a) * 0.32, 0.045]); } addTube(mb, pts, { seg: 3, subdiv: 1, colFn: (t) => (t > 0.45 && t < 0.55 ? AMBER() : P.copper()) }); addBox(mb, { y: 0.34, sx: 0.12, sy: 0.12, sz: 0.12, col: AMBER() }); addLathe(mb, [[0.0, 0.0], [0.2, 0.0], [0.08, 0.7], [0.0, 0.72]], { seg: 8, colFn: P.red }); }),
    rack: build((mb) => { for (let i = 0; i < 4; i++) addTube(mb, [[-0.2 + i * 0.13, 0.0, 0, 0.07], [-0.32 + i * 0.13 + 0.25, 0.7, 0, 0.07]], { seg: 6, colFn: (t) => (t > 0.9 ? AMBER() : P.olive()) }); addBox(mb, { sx: 0.7, sy: 0.12, sz: 0.4, col: P.gun() }); }),
    balloon: build((mb) => { addSphere(mb, { y: 2.6, r: 1.2, sy: 1.1, segW: 14, segH: 10, colFn: (ny) => (Math.floor((ny + 1) * 3.5) % 2 ? P.tan() : P.red()) }); addLathe(mb, [[0.0, 1.25], [0.25, 1.3], [0.1, 1.45], [0.0, 1.5]], { seg: 8, colFn: AMBER }); for (const s of [-1, 1]) addTube(mb, [[0.3 * s, 0, 0, 0.015], [0.2 * s, 1.3, 0, 0.015]], { seg: 3, colFn: P.tan }); }),
    pack: build((mb) => { addBox(mb, { y: 0.12, sx: 0.5, sy: 0.24, sz: 0.4, col: P.brown() }); addBox(mb, { y: 0.12, sx: 0.52, sy: 0.05, sz: 0.42, col: P.tan() }); }),
    // bumper gadgets
    glove: build((mb) => { addSphere(mb, { x: 0.15, r: 0.3, sy: 0.85, segW: 10, segH: 7, colFn: P.leather }); addSphere(mb, { x: 0.05, y: 0.2, r: 0.12, segW: 6, segH: 4, colFn: P.leather }); addBox(mb, { x: -0.18, sx: 0.12, sy: 0.38, sz: 0.38, col: P.cream() }); }),
    hook: build((mb) => { addTube(mb, [[-0.25, 0, 0, 0.05], [0.25, 0, 0, 0.05]], { seg: 4, colFn: P.steel }); for (const s of [-1, 1]) addTube(mb, [[0.25, 0, 0, 0.045], [0.1, 0.2 * s, 0, 0.03]], { seg: 4, colFn: P.steel }); }),
    gun: build((mb) => { addTube(mb, [[0, 0, 0, 0.1], [0.55, 0.06, 0, 0.08]], { seg: 6, colFn: P.olive }); addSphere(mb, { x: 0.55, y: 0.06, r: 0.06, segW: 5, segH: 3, colFn: AMBER }); }),
    catcher: build((mb) => { for (let i = 0; i < 6; i++) { const y = -0.25 + i * 0.13; addTube(mb, [[0, y, -0.45, 0.04], [0.32 + i * 0.05, y + 0.06, 0, 0.045], [0, y, 0.45, 0.04]], { seg: 4, colFn: i % 2 ? P.rust : P.iron }); } addTube(mb, [[0.0, -0.3, 0, 0.05], [0.6, 0.45, 0, 0.05]], { seg: 4, colFn: P.gun }); }),
    nozzle: build((mb) => { addLathe(mb, [[0.0, 0], [0.12, 0], [0.16, 0.25], [0.0, 0.26]], { seg: 8, colFn: P.brass }); addLathe(mb, [[0.0, 0.25], [0.1, 0.26], [0.0, 0.28]], { seg: 8, colFn: AMBER }); }),
    seat: build((mb) => { addBox(mb, { y: 0.1, sx: 0.45, sy: 0.2, sz: 0.45, col: P.red() }); addBox(mb, { y: 0.24, sx: 0.3, sy: 0.06, sz: 0.3, col: AMBER() }); }),
    chute: build((mb) => { addLathe(mb, [[0.0, 0.9], [0.6, 0.85], [1.05, 0.55], [1.15, 0.35]], { seg: 12, sz: 0.5, colFn: (t) => (t > 0.8 ? AMBER() : Math.floor(t * 6) % 2 ? P.tan() : P.red()) }); for (const s of [-1, 0, 1]) addTube(mb, [[1.1 * s, 0.38, 0, 0.012], [0.08 * s, -0.1, 0, 0.012]], { seg: 3, colFn: P.tan }); }),
    pilot: build((mb) => { addLathe(mb, [[0.16, -0.35], [0.18, -0.1], [0.14, 0.12], [0.0, 0.14]], { seg: 8, colFn: P.olive }); addSphere(mb, { y: 0.28, r: 0.12, segW: 6, segH: 5, colFn: P.cream }); for (const s of [-1, 1]) addTube(mb, [[0.07 * s, -0.33, 0, 0.04], [0.1 * s, -0.6, 0.05, 0.035]], { seg: 4, colFn: P.rubber }); }),
  };
  return M;
}

function treadBelt(device, L, R) {
  // a rounded loop from -L/2 to L/2 with end radius R, made of short tube runs
  const mb = new MeshBuilder(), pts = [];
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI; pts.push([L / 2 + Math.cos(a) * R, Math.sin(a) * R, 0, 0.07]); }
  for (let i = 0; i <= 10; i++) { const a = Math.PI / 2 + (i / 10) * Math.PI; pts.push([-L / 2 + Math.cos(a) * R, Math.sin(a) * R, 0, 0.07]); }
  pts.push(pts[0]);
  addTube(mb, pts, { seg: 4, subdiv: 1, colFn: P.rubber });
  // grousers: little cleats on the belt
  for (let x = -L / 2; x <= L / 2; x += 0.22) { addBox(mb, { x, y: -R - 0.05, sx: 0.06, sy: 0.08, sz: 0.2, col: P.gun() }); addBox(mb, { x, y: R + 0.05, sx: 0.06, sy: 0.08, sz: 0.2, col: P.gun() }); }
  return mb.build(device);
}

/** a world-space entity under the app root */
function mk(car, mesh, mat, name = 'mod', parent = null) {
  const e = new pc.Entity(name);
  e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], layers: [car.layer.id], castShadows: false, receiveShadows: false });
  (parent || car.app.root).addChild(e);
  return e;
}
/** place a unit segment between two world points */
function segBetween(e, x0, y0, x1, y1, th = 0.09, z = 0.5) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 0.001;
  e.setPosition(x0, y0, z);
  e.setEulerAngles(0, 0, (Math.atan2(dy, dx) * 180) / Math.PI);
  e.setLocalScale(L, th, th);
}
/** car-local (x forward along the body, y body-up) -> world */
function toWorld(car, lx, ly, out = [0, 0]) {
  const b = car.body, c = Math.cos(b.a), s = Math.sin(b.a);
  out[0] = b.p[0] + c * lx - s * ly;
  out[1] = b.p[1] + s * lx + c * ly;
  return out;
}
const _a = [0, 0], _b = [0, 0];

// ------------------------------------------------------------------------------------------ the rig
/** physics settings for each undercarriage (read by Car); rays are { lx, r } in facing-1 coordinates */
export function rigPhysics(kind, wheels0, tire, spec) {
  const front = wheels0[0], rear = wheels0[wheels0.length - 1];
  const R = { kind, rest: Math.max(spec.rest, 0.3), kMul: 1, dMul: 1, grip: 1.3, accelMul: 1, adhesion: 0, hover: false, pogo: false, saw: false, rays: [] };
  if (kind === 'tires' || kind === 'saw') {
    R.rays = wheels0.map((w) => ({ lx: w.lx, r: w.r * tire }));
    R.saw = kind === 'saw';
    R.grip = 1.3 + (tire - 1) * 0.3;
  } else if (kind === 'treads') {
    const r = (front.r + rear.r) * 0.4;
    for (let i = 0; i < 4; i++) R.rays.push({ lx: rear.lx + ((front.lx - rear.lx) * i) / 3, r });
    R.grip = 2.6; R.accelMul = 1.15; R.rest = Math.max(R.rest, 0.35);
  } else if (kind === 'pogo') {
    R.rays = [{ lx: front.lx, r: 0.12 }, { lx: rear.lx, r: 0.12 }];
    R.rest = 0.75; R.kMul = 1.5; R.dMul = 0.55; R.grip = 1.0; R.pogo = true;
  } else if (kind === 'spider') {
    R.rays = [{ lx: front.lx * 1.15, r: 0.12 }, { lx: (front.lx + rear.lx) / 2, r: 0.12 }, { lx: rear.lx * 1.15, r: 0.12 }];
    R.rest = 1.25; R.kMul = 1.2; R.grip = 2.8; R.adhesion = 1; R.accelMul = 1.1;
  } else if (kind === 'hover') {
    R.rays = [{ lx: front.lx, r: 0.0 }, { lx: rear.lx, r: 0.0 }];
    R.rest = 1.1; R.kMul = 0.55; R.dMul = 1.7; R.grip = 0; R.hover = true;
  }
  return R;
}

/** the visible undercarriage: draws whatever the rig's rays are doing */
export class RigVisual {
  constructor(car) {
    this.car = car;
    const A = meshes(car.app.graphicsDevice), kind = car.rigP.kind;
    this.kind = kind;
    this.ents = [];
    if (kind === 'treads') {
      const rays = car.wheels, L = Math.abs(rays[0].lx - rays[rays.length - 1].lx), R = rays[0].r + 0.06;
      this.belt = mk(car, treadBelt(car.app.graphicsDevice, L, R), A.mat, 'belt', car.root);
      this.road = rays.map(() => mk(car, A.roadWheel, A.mat, 'road', car.root));
      this.R = R;
    } else if (kind === 'pogo') {
      this.sticks = car.wheels.map(() => ({ rod: mk(car, A.segSteel, A.mat, 'rod'), coil: mk(car, A.coil, A.mat, 'coil'), foot: mk(car, A.foot, A.mat, 'foot') }));
    } else if (kind === 'spider') {
      this.legs = [];
      for (let i = 0; i < 8; i++) {
        const t = i / 7; // along the body, rear to front
        this.legs.push({ t, z: i % 2 ? -0.7 : 0.95, thigh: mk(car, A.legSeg, A.mat, 'thigh'), shin: mk(car, A.legSeg, A.mat, 'shin'), hip: mk(car, A.hip, A.mat, 'hip'), foot: null, step: 0, from: null, phase: (i % 2) * 0.5 });
      }
    } else if (kind === 'hover') {
      this.pods = car.wheels.map(() => ({ pod: mk(car, A.pod, A.mat, 'pod'), jet: mk(car, A.jet, A.mat, 'jet') }));
    }
    for (const w of car.wheels) if (w.spin) w.pivot.enabled = kind === 'tires' || kind === 'saw';
  }

  sync(dt) {
    const car = this.car, f = car.facing, b = car.body, on = !car.wrecked && !car.ghost;
    if (this.belt) {
      this.belt.enabled = on;
      for (const r of this.road) r.enabled = on;
      if (!on) return;
      const ws = car.wheels, avg = ws.reduce((a, w) => a + w.dist, 0) / ws.length;
      const mid = (ws[0].lx + ws[ws.length - 1].lx) / 2;
      this.belt.setLocalPosition(mid, -(avg - this.R), 0.5);
      this.belt.setLocalScale(f, 1, 1);
      ws.forEach((w, i) => { this.road[i].setLocalPosition(w.lx, -(w.dist - w.r), 0.55); this.road[i].setLocalScale(w.r, w.r, w.r); this.road[i].setLocalEulerAngles(0, 0, (-w.angle * 57.3 * f) % 360); });
    } else if (this.sticks) {
      car.wheels.forEach((w, i) => {
        const S = this.sticks[i];
        S.rod.enabled = S.coil.enabled = S.foot.enabled = on;
        if (!on) return;
        toWorld(car, w.lx, 0.05, _a); toWorld(car, w.lx, -w.dist, _b);
        segBetween(S.rod, _a[0], _a[1], _b[0], _b[1], 0.07, 0.5);
        S.coil.setPosition(_a[0], _a[1], 0.5); S.coil.setEulerAngles(0, 0, b.a * 57.3); S.coil.setLocalScale(1, clamp((car.rest + 0.2 - w.comp) / car.rest, 0.4, 1.6), 1);
        S.foot.setPosition(_b[0], _b[1], 0.5); S.foot.setEulerAngles(0, 0, b.a * 57.3);
      });
    } else if (this.legs) {
      const T = car.terrain;
      const rear = car.wheels[car.wheels.length - 1].lx, front = car.wheels[0].lx;
      for (const L of this.legs) {
        L.thigh.enabled = L.shin.enabled = L.hip.enabled = on;
        if (!on) { L.foot = null; continue; }
        const hx = rear + (front - rear) * L.t;
        toWorld(car, hx, -0.05, _a);
        const hipX = _a[0], hipY = _a[1];
        // where this foot wants to stand: out from the hip, a little ahead in the direction of travel
        const reachOut = (L.t - 0.5) * 2.6 + (L.t - 0.5 >= 0 ? 0.35 : -0.35) + clamp(b.v[0] * 0.08, -0.6, 0.6);
        const wantX = hipX + reachOut, wantY = T.height(wantX);
        if (!L.foot) L.foot = [wantX, wantY];
        const far = Math.hypot(L.foot[0] - wantX, L.foot[1] - wantY);
        if (L.step <= 0 && (far > 0.75 || L.foot[1] > hipY + 0.2 || Math.hypot(L.foot[0] - hipX, L.foot[1] - hipY) > 2.0)) { L.step = 0.14; L.from = L.foot.slice(); }
        if (L.step > 0) {
          L.step -= dt;
          const k = 1 - Math.max(0, L.step) / 0.14;
          L.foot[0] = L.from[0] + (wantX - L.from[0]) * k;
          L.foot[1] = L.from[1] + (wantY - L.from[1]) * k + Math.sin(k * Math.PI) * 0.35;
        }
        if (car.grounded === 0 && !car.wet) { L.foot[0] = hipX + reachOut * 0.6; L.foot[1] = hipY - 0.9; }
        // two-bone leg: the knee bends up and outward
        const l1 = 1.0, l2 = 1.25, dx = L.foot[0] - hipX, dy = L.foot[1] - hipY;
        const d = clamp(Math.hypot(dx, dy), 0.2, l1 + l2 - 0.01);
        const a0 = Math.atan2(dy, dx), cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
        const bend = Math.acos(clamp(cosA, -1, 1)) * (dx * f >= 0 ? -1 : 1) * (L.t > 0.5 ? 1 : -1) * -f;
        const kx = hipX + Math.cos(a0 + bend) * l1, ky = hipY + Math.sin(a0 + bend) * l1;
        segBetween(L.thigh, hipX, hipY, kx, ky, 0.09, L.z);
        segBetween(L.shin, kx, ky, L.foot[0], L.foot[1], 0.07, L.z);
        L.hip.setPosition(hipX, hipY, L.z + 0.05);
      }
    } else if (this.pods) {
      car.wheels.forEach((w, i) => {
        const P = this.pods[i];
        P.pod.enabled = P.jet.enabled = on;
        if (!on) return;
        toWorld(car, w.lx * 0.92, -0.3, _a);
        P.pod.setPosition(_a[0], _a[1], 0.5); P.pod.setEulerAngles(0, 0, b.a * 57.3 + 180);
        const flick = 0.75 + Math.random() * 0.5, len = clamp(w.dist - 0.3, 0.3, 1.4) * flick;
        P.jet.setPosition(_a[0], _a[1] - 0.02, 0.52); P.jet.setEulerAngles(0, 0, b.a * 57.3); P.jet.setLocalScale(1, len, 1);
      });
    }
  }

  destroy() {
    for (const k of ['belt']) if (this[k]) this[k].destroy();
    for (const e of this.road || []) e.destroy();
    for (const S of this.sticks || []) { S.rod.destroy(); S.coil.destroy(); S.foot.destroy(); }
    for (const L of this.legs || []) { L.thigh.destroy(); L.shin.destroy(); L.hip.destroy(); }
    for (const P of this.pods || []) { P.pod.destroy(); P.jet.destroy(); }
  }
}

// ------------------------------------------------------------------------------------------ gadgets
class Gadget {
  constructor(car, ctx) { this.car = car; this.ctx = ctx; this.cd = 0; this.A = meshes(car.app.graphicsDevice); this.ents = []; }
  e(mesh, name, parent = null, mat = this.A.mat) { const x = mk(this.car, mesh, mat, name, parent); this.ents.push(x); return x; }
  fire() {}
  update(dt) { this.cd = Math.max(0, this.cd - dt); }
  sync() {}
  state() { return 0; }
  setState() {}
  get ready() { return this.cd <= 0; }
  destroy() { for (const x of this.ents) x.destroy(); this.ents = []; }
  /** world point on the car: lx forward (facing-aware), ly up */
  at(lx, ly, out = [0, 0]) { return toWorld(this.car, lx * this.car.facing, ly, out); }
  get roofY() { return this.car.roofY; }
  get noseX() { return this.car.noseX - 0.05; }
  /** a part bolted to the car: a child of the car's root, so it moves and tilts with the body */
  attach(mesh, name) { const x = mk(this.car, mesh, this.A.mat, name, this.car.root); this.ents.push(x); return x; }
  /** place an attached part: lx forward along the body, ly up, rot in degrees (all mirrored by facing) */
  place(e, lx, ly, z = 0, rot = 0, mirror = true) {
    const f = this.car.facing;
    e.setLocalPosition(lx * f, ly, z);
    e.setLocalEulerAngles(0, 0, rot * f);
    if (mirror) e.setLocalScale(f, 1, 1);
  }
  /** the roof rack every roof tool sits on */
  rack(lx = 0) { this.rackE = this.attach(this.A.mount, 'roofRack'); this.rackX = lx; }
  syncRack() { if (this.rackE) { this.rackE.enabled = !this.car.wrecked && !this.car.ghost; this.place(this.rackE, this.rackX, this.car.roofTop, 0, 0); } }
  /** other cars (not this one, not wrecked) */
  others() { return this.ctx.cars().filter((c) => c !== this.car && !c.wrecked && !c.ghost); }
}

// ---------------------------------------------------------------- roof: the robot arm
class Arm extends Gadget {
  constructor(car, ctx) {
    super(car, ctx);
    this.rack(-0.1);
    this.base = this.attach(this.A.armBase, 'armBase');
    this.up = this.e(this.A.segYellow, 'armUp'); this.fore = this.e(this.A.segYellow, 'armFore');
    this.claw = this.e(this.A.claw, 'claw');
    this.held = null; this.swing = 0; this.grabCd = 0;
  }
  update(dt) {
    super.update(dt);
    const sb = this.ctx.sandbox;
    this.grabCd -= dt;
    if (this.held && (this.held.alive === false || !sb.dyn.has(this.held.id) || (this.held.heldBy && this.held.heldBy !== this.car.id))) this.held = null;
    if (!this.held && this.grabCd <= 0 && !this.car.wrecked) {
      this.grabCd = 0.25;
      const P = sb.grabbable(this.car);
      if (P) { sb.grab(P, this.car.id); this.held = P; this.ctx.sfx.play('clang', { x: P.body.p[0], z: 0 }, { vol: 0.4 }); }
    }
  }
  fire() {
    if (!this.held || this.cd > 0) return;
    const b = this.car.body, f = this.car.facing, a = b.a;
    const vx = b.v[0] + Math.cos(a) * f * 15 - Math.sin(a) * 7, vy = b.v[1] + Math.sin(a) * f * 15 + Math.cos(a) * 7 + 2;
    this.ctx.sandbox.throw(this.held, this.car.id, vx, vy);
    this.held = null; this.cd = 0.6; this.grabCd = 1.0; this.swing = 1;
    this.ctx.sfx.play('whoosh', { x: b.p[0], z: 0 }, { vol: 0.7 });
  }
  sync(dt) {
    const on = !this.car.wrecked && !this.car.ghost;
    for (const x of this.ents) x.enabled = on;
    if (!on) return;
    this.swing = Math.max(0, this.swing - dt * 3);
    const car = this.car, top = car.roofTop, holding = car.local ? !!this.held : this.netHolding, sw = this.swing;
    this.syncRack();
    this.place(this.base, -0.1, top + 0.12, 0, 0, false);
    this.at(-0.1, top + 0.32, _a); // the shoulder, on the rack
    let ex, ey, cx, cy;
    if (holding) { // claw over the held prop, elbow cocked back
      this.at(-0.55, top + 0.95, _b); ex = _b[0]; ey = _b[1];
      this.at(0, car.carryY + 0.4, _b); cx = _b[0]; cy = _b[1];
    } else { // resting forward over the hood; a throw sweeps it up and out
      this.at(-0.3 + sw * 0.6, top + 0.85 + sw * 0.4, _b); ex = _b[0]; ey = _b[1];
      this.at(car.noseX * 0.55 + sw * 0.9, top + 0.3 + sw * 1.1, _b); cx = _b[0]; cy = _b[1];
    }
    segBetween(this.up, _a[0], _a[1], ex, ey, 0.1, 0.1);
    segBetween(this.fore, ex, ey, cx, cy, 0.08, 0.1);
    this.claw.setPosition(cx, cy, 0.1);
    this.claw.setEulerAngles(0, 0, car.body.a * 57.3 + (holding ? 180 : -90 * car.facing));
  }
  state() { return this.held ? 1 : 0; }
  setState(s) { this.netHolding = !!s; }
}

// ---------------------------------------------------------------- roof: the wrecking ball
class WreckBall extends Gadget {
  constructor(car, ctx) {
    super(car, ctx);
    this.rack(-0.15);
    this.crane = this.attach(this.A.crane, 'crane');
    this.ball = this.e(this.A.spikeBall, 'wreckBall');
    this.links = Array.from({ length: 12 }, () => this.e(this.A.seg, 'chain'));
    this.hitch(_a);
    this.p = [_a[0], _a[1] - 2.0]; this.v = [0, 0];
    this.L = 3.9; this.hitT = new Map(); this.slam = null;
  }
  /** the pulley at the tip of the crane's boom */
  hitch(out) { return this.at(-0.33, this.car.roofTop + 1.1, out); }
  fire() {
    if (this.cd > 0) return;
    // heave it: up from behind, over the roof, and crashing down in front of the nose
    this.slam = { t: 0 };
    this.cd = 1.1;
    this.ctx.sfx.play('whoosh', { x: this.p[0], z: 0 }, { vol: 0.6 });
  }
  update(dt) {
    super.update(dt);
    const car = this.car;
    if (car.wrecked || car.ghost) return;
    this.swingSim(dt);
    this.smash();
  }
  /** pendulum on a rope: gravity, the chain's reach, the ground */
  swingSim(dt) {
    const car = this.car;
    if (this.slam) {
      // a scripted arc around the pulley: from behind-low (200 deg), over the top, to front-low (-40 deg)
      const S = this.slam, D = 0.45;
      S.t += dt;
      const k = Math.min(1, S.t / D), e = k * k * (3 - 2 * k), f = car.facing;
      const phi = (200 - 235 * e) * Math.PI / 180;
      this.hitch(_a);
      const nx = _a[0] + f * Math.cos(phi) * this.L, ny = _a[1] + Math.sin(phi) * this.L;
      this.v[0] = (nx - this.p[0]) / Math.max(dt, 1e-4); this.v[1] = (ny - this.p[1]) / Math.max(dt, 1e-4);
      this.p[0] = nx; this.p[1] = ny;
      if (k >= 1) { this.slam = null; if (car.local) this.impact(); } // back to physics, at full slamming speed
      return;
    }
    this.v[1] += G * dt;
    this.v[0] *= 1 - dt * 0.4; this.v[1] *= 1 - dt * 0.2;
    this.p[0] += this.v[0] * dt; this.p[1] += this.v[1] * dt;
    this.hitch(_a);
    let dx = this.p[0] - _a[0], dy = this.p[1] - _a[1], d = Math.hypot(dx, dy);
    if (d > this.L) {
      const nx = dx / d, ny = dy / d;
      this.p[0] = _a[0] + nx * this.L; this.p[1] = _a[1] + ny * this.L;
      const hv = car.body.v, rv = (this.v[0] - hv[0]) * nx + (this.v[1] - hv[1]) * ny;
      if (rv > 0) { this.v[0] -= rv * nx; this.v[1] -= rv * ny; }
    }
    const g = car.terrain.height(this.p[0]);
    if (this.p[1] - 0.5 < g) { this.p[1] = g + 0.5; if (this.v[1] < 0) this.v[1] *= -0.3; this.v[0] *= 0.8; }
  }
  /** the slam lands: everything close to the ball gets crushed and thrown */
  impact() {
    const car = this.car, now = performance.now(), R = 2.6;
    this.ctx.fx.sparkBurst(this.p[0], this.p[1], 18, 7);
    for (let i = 0; i < 6; i++) this.ctx.fx.dust(this.p[0] + (Math.random() - 0.5) * 2, car.terrain.height(this.p[0]), 1, Math.random() < 0.5 ? 1 : -1);
    this.ctx.fx.shake = Math.min(1.4, this.ctx.fx.shake + 0.5);
    this.ctx.sfx.play('crunch', { x: this.p[0], z: 0 }, { vol: 1.4 });
    for (const o of this.others()) {
      const dx = o.body.p[0] - this.p[0], dy = o.body.p[1] - this.p[1], d = Math.hypot(dx, dy);
      if (d > R + o.body.bound * 0.4) continue;
      this.hitT.set(o.id, now + 500);
      this.ctx.shove(o, (Math.sign(dx) || car.facing) * 9, 9 * (1 - d / (R + 1)) + 4, 28, car);
    }
    for (const P of this.ctx.sandbox.dyn.values()) {
      if (P.alive === false || !P.body.enabled || P.heldBy) continue;
      const dx = P.body.p[0] - this.p[0], d = Math.hypot(dx, P.body.p[1] - this.p[1]);
      if (d < R) this.ctx.sandbox.shove(P.id, (Math.sign(dx) || car.facing) * 7, 9, car.id, 12);
    }
  }
  /** smash whatever it swings into (owner only) */
  smash() {
    const car = this.car, now = performance.now();
    for (const o of this.others()) {
      const ob = o.body, rr = ob.bound * 0.75 + 0.5;
      if (Math.hypot(ob.p[0] - this.p[0], ob.p[1] - this.p[1]) > rr) continue;
      const rel = Math.hypot(this.v[0] - ob.v[0], this.v[1] - ob.v[1]);
      if (rel < 5 || (this.hitT.get(o.id) || 0) > now) continue;
      this.hitT.set(o.id, now + 500);
      const k = Math.min(1.6, rel / 12);
      this.ctx.shove(o, this.v[0] * 0.8 * k, Math.abs(this.v[1]) * 0.4 + 6 * k, 14 + rel * 1.4, car);
      this.ctx.fx.sparkBurst(this.p[0], this.p[1], 14, 6);
      this.ctx.sfx.play('crunch', { x: this.p[0], z: 0 }, { vol: 1 });
      this.v[0] *= -0.3; this.v[1] *= 0.3;
    }
    for (const P of this.ctx.sandbox.dyn.values()) {
      if (P.alive === false || !P.body.enabled || P.heldBy) continue;
      const pb = P.body;
      if (Math.abs(pb.p[0] - this.p[0]) > pb.bound + 0.6 || Math.hypot(pb.p[0] - this.p[0], pb.p[1] - this.p[1]) > pb.bound + 0.5) continue;
      const rel = Math.hypot(this.v[0] - pb.v[0], this.v[1] - pb.v[1]);
      if (rel < 5 || (this.hitT.get(P.id) || 0) > now) continue;
      this.hitT.set(P.id, now + 400);
      this.ctx.sandbox.shove(P.id, this.v[0] * 0.7, Math.abs(this.v[1]) * 0.5 + 4, car.id, rel);
      this.v[0] *= -0.3;
    }
  }
  sync(dt) {
    const on = !this.car.wrecked && !this.car.ghost;
    for (const x of this.ents) x.enabled = on;
    if (!on) return;
    if (!this.car.local && !this.netP) this.swingSim(Math.min(dt, 1 / 30)); // showroom copies swing for show
    if (!this.car.local && this.netP) { this.p[0] += (this.netP[0] - this.p[0]) * 0.35; this.p[1] += (this.netP[1] - this.p[1]) * 0.35; }
    this.syncRack();
    this.place(this.crane, -0.15, this.car.roofTop + 0.12, 0, 0);
    this.hitch(_a);
    // the chain: a continuous run of links from the pulley to the top of the ball, sagging when slack
    const dx = this.p[0] - _a[0], dy = this.p[1] - _a[1], d = Math.hypot(dx, dy) || 1;
    const ex = this.p[0] - (dx / d) * 0.42, ey = this.p[1] - (dy / d) * 0.42; // ball's surface
    const slack = Math.max(0, this.L - d) * 0.5, n = this.links.length;
    let px = _a[0], py = _a[1];
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n, x = _a[0] + (ex - _a[0]) * t, y = _a[1] + (ey - _a[1]) * t - Math.sin(t * Math.PI) * slack;
      segBetween(this.links[i], px, py, x, y, 0.065, 0.5);
      px = x; py = y;
    }
    this.ball.setPosition(this.p[0], this.p[1], 0.5);
    this.ball.setEulerAngles(0, 0, (this.p[0] * 60) % 360);
  }
  state() { return [Math.round(this.p[0] * 10) / 10, Math.round(this.p[1] * 10) / 10]; }
  setState(s) { if (Array.isArray(s)) this.netP = s; }
}

// ---------------------------------------------------------------- roof: the magnet coil
class Magnet extends Gadget {
  constructor(car, ctx) { super(car, ctx); this.rack(0); this.coil = this.attach(this.A.coilRoof, 'magnet'); this.on = 0; }
  fire() {
    if (this.cd > 0) return;
    if (!this.on) { this.on = 5; this.ctx.sfx.play('glitch', { x: this.car.body.p[0], z: 0 }, { vol: 0.7 }); return; }
    // reverse polarity: blast everything out
    this.on = 0; this.cd = 2.5;
    this.at(0, this.roofY, _a);
    this.ctx.shock({ x: _a[0], y: _a[1], by: this.car.id });
  }
  update(dt) {
    super.update(dt);
    if (this.on > 0) { this.on = Math.max(0, this.on - dt); if (!this.on) this.cd = 1.5; if (Math.random() < dt * 30) { this.at(0, this.car.roofTop + 0.9, _a); this.ctx.fx.sparkBurst(_a[0], _a[1], 1, 3); } }
  }
  get active() { return this.car.local ? this.on > 0 : !!this.netOn; }
  sync(dt) {
    const on = !this.car.wrecked && !this.car.ghost;
    this.coil.enabled = on;
    this.syncRack();
    if (!on) return;
    this.place(this.coil, 0, this.car.roofTop + 0.12, 0, 0, false);
    this.coil.setLocalEulerAngles(0, this.active ? (performance.now() * 0.5) % 360 : 0, 0);
  }
  state() { return this.on > 0 ? 1 : 0; }
  setState(s) { this.netOn = !!s; }
}

// ---------------------------------------------------------------- roof: the firework mortar
class Mortar extends Gadget {
  constructor(car, ctx) { super(car, ctx); this.rack(-0.1); this.tubes = this.attach(this.A.rack, 'mortar'); this.queue = []; this.kick = 0; }
  fire() {
    if (this.cd > 0) return;
    this.cd = 5;
    for (let i = 0; i < 4; i++) this.queue.push(i * 0.13);
  }
  update(dt) {
    super.update(dt);
    for (let i = this.queue.length - 1; i >= 0; i--) {
      this.queue[i] -= dt;
      if (this.queue[i] > 0) continue;
      this.queue.splice(i, 1);
      const b = this.car.body, f = this.car.facing;
      this.at(0.15, this.car.roofTop + 0.9, _a); // the tube mouths
      const v = [b.v[0] * 0.5 + f * (6 + Math.random() * 7), 16 + Math.random() * 4];
      this.ctx.sandbox.spawnProjectile('rocket', [_a[0], _a[1]], v, this.car.id);
      this.ctx.fx.sparkBurst(_a[0], _a[1], 8, 5);
      this.ctx.sfx.play('whoosh', { x: _a[0], z: 0 }, { vol: 0.5 });
      this.kick = 1;
    }
  }
  sync(dt) {
    const on = !this.car.wrecked && !this.car.ghost;
    this.tubes.enabled = on;
    this.syncRack();
    if (!on) return;
    this.kick = Math.max(0, this.kick - dt * 6);
    this.place(this.tubes, -0.1, this.car.roofTop + 0.2 - this.kick * 0.06, 0, -12);
  }
}

// ---------------------------------------------------------------- roof: the party balloon
class Balloon extends Gadget {
  constructor(car, ctx) { super(car, ctx); this.pack = this.attach(this.A.pack, 'pack'); this.bal = this.attach(this.A.balloon, 'balloon'); this.open = false; this.grow = 0; this.dropCd = 0; }
  fire() {
    const car = this.car;
    if (!this.open) { if (car.grounded) return; this.open = true; this.ctx.sfx.play('boing', { x: car.body.p[0], z: 0 }); return; }
    if (this.dropCd > 0) return;
    this.dropCd = 1.0;
    this.at(0, -0.8, _a);
    this.ctx.sandbox.dropMine([_a[0], _a[1]], car.body.v, car.id);
    this.ctx.sfx.play('beep', { x: _a[0], z: 0 });
  }
  update(dt) {
    super.update(dt);
    this.dropCd -= dt;
    if (this.open && (this.car.grounded > 0 || this.car.wet)) this.open = false;
  }
  /** physics: a floaty descent while it's open (called per substep) */
  forces(h) {
    if (!this.open) return;
    const b = this.car.body;
    if (b.v[1] < -2.2) b.v[1] += (-2.2 - b.v[1]) * Math.min(1, h * 25); // the canopy's drag
    b.v[1] += 12 * h; // and its lift
    b.t += (-Math.atan2(Math.sin(b.a), Math.cos(b.a)) * 6 - b.w * 2) * b.I; // hang level
    b.v[0] += this.car.input.dir * 6 * h;
  }
  get isOpen() { return this.car.local ? this.open : !!this.netOpen; }
  sync(dt) {
    const on = !this.car.wrecked && !this.car.ghost;
    const open = on && this.isOpen;
    this.grow += ((open ? 1 : 0) - this.grow) * Math.min(1, dt * 8);
    this.pack.enabled = on && this.grow < 0.5;
    this.bal.enabled = on && this.grow > 0.05;
    this.place(this.pack, 0, this.car.roofTop, 0, 0, false);
    this.bal.setLocalPosition(0, this.car.roofTop + 0.1, -0.1);
    this.bal.setLocalScale(this.grow, this.grow, this.grow);
    this.bal.setLocalEulerAngles(0, 0, Math.sin(performance.now() * 0.002) * 6);
  }
  state() { return this.open ? 1 : 0; }
  setState(s) { this.netOpen = !!s; }
}

// ---------------------------------------------------------------- bumper: the boxing glove
class Glove extends Gadget {
  constructor(car, ctx) { super(car, ctx); this.rod = this.e(this.A.segSteel, 'piston'); this.glove = this.e(this.A.glove, 'glove'); this.t = 0; this.hit = false; }
  fire() { if (this.cd > 0) return; this.cd = 0.9; this.t = 0.32; this.hit = false; this.ctx.sfx.play('boing', { x: this.car.body.p[0], z: 0 }, { vol: 0.8 }); }
  update(dt) {
    super.update(dt);
    if (this.t <= 0) return;
    this.t -= dt;
    if (this.hit || this.t > 0.24) return;
    this.hit = true;
    const car = this.car, f = car.facing;
    this.at(this.noseX + 2.0, 0.1, _a);
    for (const o of this.others()) {
      if (Math.hypot(o.body.p[0] - _a[0], o.body.p[1] - _a[1]) > o.body.bound * 0.6 + 1.7) continue;
      this.ctx.shove(o, f * 17 + car.body.v[0] * 0.3, 7, 22, car);
      this.ctx.fx.sparkBurst(_a[0], _a[1], 12, 6);
      this.ctx.sfx.play('crunch', { x: _a[0], z: 0 }, { vol: 1.1 });
    }
    for (const P of this.ctx.sandbox.dyn.values()) {
      if (P.alive === false || !P.body.enabled || P.heldBy) continue;
      if (Math.hypot(P.body.p[0] - _a[0], P.body.p[1] - _a[1]) > P.body.bound + 1.2) continue;
      this.ctx.sandbox.shove(P.id, f * 14, 6, car.id, 12);
    }
  }
  sync() {
    const on = !this.car.wrecked && !this.car.ghost;
    this.rod.enabled = this.glove.enabled = on;
    if (!on) return;
    const t = this.car.local ? this.t : this.netT || 0;
    const e = t <= 0 ? 0 : t > 0.24 ? (0.32 - t) / 0.08 : t / 0.24;
    const out = this.noseX + 0.15 + clamp(e, 0, 1) * 2.0;
    this.at(this.noseX - 0.1, 0.0, _a); this.at(out, 0.0, _b);
    segBetween(this.rod, _a[0], _a[1], _b[0], _b[1], 0.1, 0.5);
    this.glove.setPosition(_b[0], _b[1], 0.5);
    this.glove.setEulerAngles(0, 0, this.car.body.a * 57.3 + (this.car.facing > 0 ? 0 : 180));
  }
  state() { return this.t > 0 ? Math.round(this.t * 100) / 100 : 0; }
  setState(s) { this.netT = s || 0; }
}

// ---------------------------------------------------------------- bumper: the grapple harpoon
class Harpoon extends Gadget {
  constructor(car, ctx) { super(car, ctx); this.gun = this.e(this.A.gun, 'harpoonGun'); this.hookE = this.e(this.A.hook, 'hook'); this.rope = this.e(this.A.segRope, 'rope'); this.hook = null; }
  fire() {
    if (this.hook) { this.hook = null; this.cd = 0.4; return; } // let go
    if (this.cd > 0) return;
    const car = this.car, f = car.facing, b = car.body;
    this.at(this.noseX, 0.25, _a);
    // aim: the nearest car, dead tree or loose prop in a cone ahead; else a little up, to bite the ground
    let a = b.a + (f > 0 ? 0.25 : Math.PI - 0.25), best = 24;
    const consider = (x, y) => {
      const dx = x - _a[0], dy = y - _a[1], d = Math.hypot(dx, dy);
      if (d < 1.5 || d > best || dx * f < 0 || Math.abs(dy) > Math.abs(dx) * 0.7 + 1.5) return;
      best = d; a = Math.atan2(dy, dx);
    };
    for (const o of this.others()) consider(o.body.p[0], o.body.p[1]);
    for (const T of this.ctx.sandbox.trees.values()) if (!T.snapped) consider(T.x, T.g + 2.4);
    for (const P of this.ctx.sandbox.dyn.values()) if (P.alive !== false && P.body.enabled && !P.heldBy) consider(P.body.p[0], P.body.p[1]);
    this.hook = { p: [_a[0], _a[1]], v: [Math.cos(a) * 44 + b.v[0], Math.sin(a) * 44 + b.v[1]], t: 0, stuck: null };
    this.cd = 0.5;
    this.ctx.sfx.play('whoosh', { x: _a[0], z: 0 }, { vol: 0.6 });
  }
  update(dt) {
    super.update(dt);
    const H = this.hook, car = this.car;
    if (!H || car.wrecked) { this.hook = null; return; }
    H.t += dt;
    if (!H.stuck) {
      if (H.t > 0.7) { this.hook = null; return; }
      // fly in small steps so the fast hook can't pass through anything between frames
      for (let k = 0; k < 4 && !H.stuck; k++) {
        const h = dt / 4;
        H.v[1] += G * 0.4 * h;
        H.p[0] += H.v[0] * h; H.p[1] += H.v[1] * h;
        if (H.p[1] < car.terrain.height(H.p[0])) { H.p[1] = car.terrain.height(H.p[0]); H.stuck = { kind: 'ground' }; break; }
        const list = car.physics.statics.query(H.p[0]);
        if (list) for (const o of list) if (!o.off && Math.hypot(o.x - H.p[0], o.y - H.p[1]) < o.r + 0.3) { H.stuck = { kind: 'tree' }; break; }
        if (H.stuck) break;
        for (const o of this.others()) if (Math.hypot(o.body.p[0] - H.p[0], o.body.p[1] - H.p[1]) < o.body.bound * 0.8) { H.stuck = { kind: 'car', car: o, off: [H.p[0] - o.body.p[0], H.p[1] - o.body.p[1]] }; break; }
        if (H.stuck) break;
        for (const P of this.ctx.sandbox.dyn.values()) {
          if (P.alive === false || !P.body.enabled || P.heldBy) continue;
          if (Math.hypot(P.body.p[0] - H.p[0], P.body.p[1] - H.p[1]) < P.body.bound + 0.15) { H.stuck = { kind: 'prop', P, off: [H.p[0] - P.body.p[0], H.p[1] - P.body.p[1]] }; break; }
        }
      }
      if (H.stuck) this.ctx.sfx.play('clang', { x: H.p[0], z: 0 }, { vol: 0.6 });
      return;
    }
    if (H.stuck.kind === 'car') { const o = H.stuck.car; if (o.wrecked || !this.ctx.cars().includes(o)) { this.hook = null; return; } H.p[0] = o.body.p[0] + H.stuck.off[0]; H.p[1] = o.body.p[1] + H.stuck.off[1]; }
    if (H.stuck.kind === 'prop') {
      const P = H.stuck.P;
      if (P.alive === false || !P.body.enabled || P.heldBy) { this.hook = null; return; }
      H.p[0] = P.body.p[0] + H.stuck.off[0]; H.p[1] = P.body.p[1] + H.stuck.off[1];
      // light props get yanked in towards you; heavy ones (boulders, logs) pull you to them
      if (P.body.m < 100 && (this.yankT = (this.yankT || 0) - dt) <= 0) {
        this.yankT = 0.15;
        const dx = car.body.p[0] - P.body.p[0], dy = car.body.p[1] + 1 - P.body.p[1], d = Math.hypot(dx, dy) || 1;
        if (d > 2) this.ctx.sandbox.shove(P.id, (dx / d) * 4, (dy / d) * 4 + 1.5, car.id, 2);
      }
    }
    if (H.t > 4.5) { this.hook = null; return; }
  }
  /** physics: reel in (per substep) */
  forces(h) {
    const H = this.hook;
    if (!H || !H.stuck) return;
    const car = this.car, b = car.body;
    this.at(this.noseX, 0.25, _a);
    const dx = H.p[0] - _a[0], dy = H.p[1] - _a[1], d = Math.hypot(dx, dy);
    if (d < 1.6) return;
    const k = car.spec.mass * Math.min(34, 6 + (d - 1.6) * 6);
    b.addForce((dx / d) * k, (dy / d) * k - G * car.spec.mass * 0.3);
    if (H.stuck.kind === 'car' && Math.random() < h * 8) this.ctx.shove(H.stuck.car, -(dx / d) * 2.4, -(dy / d) * 2.4 + 0.8, 0, car);
  }
  sync() {
    const on = !this.car.wrecked && !this.car.ghost;
    this.gun.enabled = on;
    this.at(this.noseX - 0.3, 0.25, _a);
    this.gun.setPosition(_a[0], _a[1], 0.55); this.gun.setEulerAngles(0, 0, this.car.body.a * 57.3 + (this.car.facing > 0 ? 25 : 155));
    const hp = this.car.local ? (this.hook && this.hook.p) : this.netHook;
    this.hookE.enabled = this.rope.enabled = on && !!hp;
    if (!hp) return;
    this.at(this.noseX, 0.25, _a);
    segBetween(this.rope, _a[0], _a[1], hp[0], hp[1], 0.035, 0.55);
    this.hookE.setPosition(hp[0], hp[1], 0.55);
    this.hookE.setEulerAngles(0, 0, Math.atan2(hp[1] - _a[1], hp[0] - _a[0]) * 57.3);
  }
  state() { return this.hook ? [Math.round(this.hook.p[0] * 10) / 10, Math.round(this.hook.p[1] * 10) / 10] : 0; }
  setState(s) { this.netHook = Array.isArray(s) ? s : null; }
}

// ---------------------------------------------------------------- bumper: the cow-catcher (passive)
class Catcher extends Gadget {
  constructor(car, ctx) { super(car, ctx); this.scoop = this.e(this.A.catcher, 'catcher'); car.catcher = true; }
  sync() {
    const on = !this.car.wrecked && !this.car.ghost;
    this.scoop.enabled = on;
    if (!on) return;
    this.at(this.noseX + 0.1, -0.15, _a);
    this.scoop.setPosition(_a[0], _a[1], 0.45);
    this.scoop.setEulerAngles(0, 0, this.car.body.a * 57.3);
    this.scoop.setLocalScale(this.car.facing, 1, 1);
  }
}

// ---------------------------------------------------------------- bumper: ember jets
class Flame extends Gadget {
  constructor(car, ctx) { super(car, ctx); this.noz = [this.e(this.A.nozzle, 'nozzle'), this.e(this.A.nozzle, 'nozzle')]; this.t = 0; this.tick = 0; }
  fire() { if (this.cd > 0) return; this.cd = 6; this.t = 2.5; this.ctx.sfx.play('whoosh', { x: this.car.body.p[0], z: 0 }); }
  get burning() { return this.car.local ? this.t > 0 : !!this.netOn; }
  update(dt) {
    super.update(dt);
    if (this.t <= 0) return;
    this.t -= dt; this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 0.25;
    const car = this.car, p = car.body.p;
    for (const o of this.others()) {
      const dx = o.body.p[0] - p[0];
      if (Math.abs(dx) > 3.4 || Math.abs(o.body.p[1] - p[1]) > 2.2) continue;
      this.ctx.shove(o, Math.sign(dx) * 3.5, 2, 7, car);
    }
    for (const P of this.ctx.sandbox.dyn.values()) if (P.kind === 'barrel' && P.alive && Math.abs(P.body.p[0] - p[0]) < 3.2 && Math.abs(P.body.p[1] - p[1]) < 2.5) this.ctx.sandbox.shove(P.id, 0, 0.5, car.id, 9);
  }
  sync(dt) {
    const on = !this.car.wrecked && !this.car.ghost;
    for (const n of this.noz) n.enabled = on;
    if (!on) return;
    const xs = [-0.6, 0.6];
    this.noz.forEach((n, i) => { this.at(xs[i], 0.15, _a); n.setPosition(_a[0], _a[1], 0.6); n.setEulerAngles(0, 0, this.car.body.a * 57.3 + (i ? -50 : 50)); });
    // two short jets of ember fire, out and slightly up from the nozzles
    if (this.burning && Math.random() < 0.8) for (const i of [0, 1]) {
      this.at(xs[i], 0.25, _a);
      const dir = i ? 1 : -1;
      this.ctx.fx.add({ kind: 'fire', x: _a[0], y: _a[1], z: 0.9, vx: dir * (4 + Math.random() * 3) * this.car.facing + this.car.body.v[0], vy: 1 + Math.random() * 1.5, t: 0, life: 0.18 + Math.random() * 0.1, size: 0.18 + Math.random() * 0.14 });
      if (Math.random() < 0.3) this.ctx.fx.sparkBurst(_a[0], _a[1], 1, 4);
    }
  }
  state() { return this.t > 0 ? 1 : 0; }
  setState(s) { this.netOn = !!s; }
}

// ---------------------------------------------------------------- bumper: the ejector seat
class Eject extends Gadget {
  constructor(car, ctx) {
    super(car, ctx);
    this.seat = this.attach(this.A.seat, 'ejectSeat');
    this.pilot = this.e(this.A.pilot, 'pilot'); this.chute = this.e(this.A.chute, 'chute');
    this.P = null; this.autoT = 0;
  }
  fire() {
    const car = this.car;
    if (this.cd > 0 || this.P || car.ghost) return;
    this.cd = 20;
    const b = car.body;
    this.at(0, this.roofY, _a);
    this.P = { p: [_a[0], _a[1]], v: [b.v[0] * 0.4, 16], chute: false };
    this.autoT = 2.2; // the empty car keeps ramming forward, then blows
    car.autopilot = true;
    car.hatEnt.enabled = false;
    this.ctx.fx.explosion(_a[0], _a[1], 0.35, _a[0]);
    this.ctx.sfx.play('cork', { x: _a[0], z: 0 }, { vol: 1 });
  }
  update(dt) {
    super.update(dt);
    const car = this.car, P = this.P;
    if (!P) return;
    if (this.autoT > 0) {
      this.autoT -= dt;
      if (this.autoT <= 0 && !car.ghost) {
        const b = car.body;
        this.ctx.sandbox.spawnProjectile('bomb', [b.p[0], b.p[1]], [0, 0], car.id);
        car.ghost = true; car.autopilot = false;
        b.enabled = false;
        car.holder.enabled = false;
        for (const w of car.wheels) if (w.pivot) w.pivot.enabled = false;
      }
    }
    // the pilot: up, then a slow parachute down that you can steer
    P.v[1] += G * dt;
    if (P.v[1] < 0) { P.chute = true; P.v[1] = Math.max(P.v[1], -2.6); P.v[0] += (car.input.dir * 5 - P.v[0]) * Math.min(1, dt * 2); }
    P.p[0] += P.v[0] * dt; P.p[1] += P.v[1] * dt;
    const g = car.terrain.height(P.p[0]);
    if (car.ghost) { car.body.p[0] = P.p[0]; car.body.p[1] = P.p[1]; } // the camera follows the pilot
    if (P.p[1] < g + 0.5 && P.v[1] < 0) {
      // landed: a fresh car around the pilot
      this.P = null;
      if (car.ghost || car.autopilot) {
        if (!car.ghost) { const b = car.body; this.ctx.sandbox.spawnProjectile('bomb', [b.p[0], b.p[1]], [0, 0], car.id); }
        car.ghost = false; car.autopilot = false;
        car.respawnAt(P.p[0], 0.6);
        car.hatEnt.enabled = true;
        car.holder.enabled = true;
        for (const w of car.wheels) if (w.pivot) w.pivot.enabled = true;
      }
    }
  }
  sync() {
    const car = this.car, on = !car.wrecked;
    const P = car.local ? this.P && { p: this.P.p, chute: this.P.chute } : this.netP;
    this.seat.enabled = on && !P && !car.ghost;
    this.pilot.enabled = on && !!P;
    this.chute.enabled = on && !!P && P.chute;
    if (this.seat.enabled) this.place(this.seat, 0.05, car.roofTop - 0.02, 0, 0, false);
    if (P) { this.pilot.setPosition(P.p[0], P.p[1], 0.5); this.chute.setPosition(P.p[0], P.p[1] + 0.55, 0.45); this.chute.setLocalScale(1.1, 1.1, 1.1); }
  }
  state() { return this.P ? [Math.round(this.P.p[0] * 10) / 10, Math.round(this.P.p[1] * 10) / 10, this.P.chute ? 1 : 0] : 0; }
  setState(s) { this.netP = Array.isArray(s) ? { p: [s[0], s[1]], chute: !!s[2] } : null; }
}

// ---------------------------------------------------------------- roof: grabby hands
// Grab a rival car (or a bomb, barrel, boulder or log), hold it overhead, throw it. Two pairs of
// hands on the same car tear it in two (the car's owner decides: see game.js grabCar).
class Hands extends Gadget {
  constructor(car, ctx) {
    super(car, ctx);
    this.rack(0);
    this.arms = [0, 1].map(() => ({ up: this.e(this.A.segOrange, 'handArm'), fore: this.e(this.A.segOrange, 'handFore'), hand: this.e(this.A.hand, 'hand') }));
    this.held = null; // { kind: 'car', car } | { kind: 'prop', P }
    this.holdT = 0; this.refresh = 0; this.reach = 0;
  }
  /** where a held car dangles: above the roof */
  grabPoint(out = [0, 0]) { return this.at(0.2, this.car.roofTop + 1.55, out); }
  fire() {
    const car = this.car, b = car.body, f = car.facing, a = b.a;
    if (this.held) {
      const vx = b.v[0] + Math.cos(a) * f * 16 - Math.sin(a) * 8, vy = b.v[1] + Math.sin(a) * f * 16 + Math.cos(a) * 8 + 2;
      if (this.held.kind === 'car') this.ctx.throwCar(this.held.car, vx * 0.85, vy * 0.85, car);
      else this.ctx.sandbox.throw(this.held.P, car.id, vx, vy);
      this.held = null; this.cd = 0.8; this.reach = 1;
      this.ctx.sfx.play('whoosh', { x: b.p[0], z: 0 }, { vol: 0.8 });
      return;
    }
    if (this.cd > 0) return;
    this.cd = 0.4; this.reach = 1;
    // the nearest rival car in reach, else the nearest loose prop
    let best = null, bd = 4.6;
    for (const o of this.others()) {
      const d = Math.hypot(o.body.p[0] - b.p[0], o.body.p[1] - b.p[1]) - o.body.bound * 0.4;
      if (d < bd) { bd = d; best = o; }
    }
    if (best) {
      this.held = { kind: 'car', car: best }; this.holdT = 0; this.refresh = 0;
      this.ctx.grabCar(best, car);
      this.ctx.sfx.play('clang', { x: b.p[0], z: 0 }, { vol: 0.9 });
      return;
    }
    const P = this.ctx.sandbox.grabbable(car, 4.6);
    if (P) { this.ctx.sandbox.grab(P, car.id); this.held = { kind: 'prop', P }; this.ctx.sfx.play('clang', { x: b.p[0], z: 0 }, { vol: 0.6 }); }
  }
  update(dt) {
    super.update(dt);
    const H = this.held;
    if (!H) return;
    if (H.kind === 'prop') {
      const P = H.P, sb = this.ctx.sandbox;
      if (P.alive === false || !sb.dyn.has(P.id) || (P.heldBy && P.heldBy !== this.car.id)) this.held = null;
      return;
    }
    // holding a car: keep the grab alive (its owner lets go if we stop saying so)
    const o = H.car;
    this.holdT += dt; this.refresh -= dt;
    if (o.wrecked || !this.ctx.cars().includes(o) || this.holdT > 6) { if (!o.wrecked && this.ctx.cars().includes(o)) this.ctx.throwCar(o, 0, 2, this.car); this.held = null; return; }
    if (this.refresh <= 0) { this.refresh = 0.2; this.ctx.grabCar(o, this.car); }
  }
  /** where the hands are reaching: the held thing, or up and open */
  target(out) {
    const H = this.car.local ? this.held : this.netHeld;
    if (H && H.kind === 'car' && H.car) { out[0] = H.car.body.p[0]; out[1] = H.car.body.p[1]; return true; }
    if (H && H.kind === 'prop' && H.P) { out[0] = H.P.body.p[0]; out[1] = H.P.body.p[1]; return true; }
    if (H && H.xy) { out[0] = H.xy[0]; out[1] = H.xy[1]; return true; }
    // idle: the hands rest folded on the roof; a grab sweeps them forward
    this.at(0.25 + this.reach * 1.9, this.car.roofTop + 0.42 + this.reach * 0.35, out);
    return false;
  }
  sync(dt) {
    const on = !this.car.wrecked && !this.car.ghost;
    for (const x of this.ents) x.enabled = on;
    if (!on) return;
    this.reach = Math.max(0, this.reach - dt * 2.5);
    this.syncRack();
    const t = [0, 0], holding = this.target(t), f = this.car.facing;
    this.arms.forEach((A, i) => {
      const side = i ? 1 : -1;
      this.at(side * 0.3, this.car.roofTop + 0.22, _a); // shoulder, on the rack
      const tx = t[0] + side * (holding ? 0.38 : 0.22) * f, ty = t[1] + (holding ? 0.1 : 0);
      // elbow: halfway, lifted a little (higher while reaching for something)
      const ex = (_a[0] + tx) / 2 - f * 0.1, ey = Math.max(_a[1], ty) + (holding ? 0.35 : 0.22);
      segBetween(A.up, _a[0], _a[1], ex, ey, 0.11, i ? 0.25 : 0.75);
      segBetween(A.fore, ex, ey, tx, ty, 0.09, i ? 0.25 : 0.75);
      A.hand.setPosition(tx, ty, i ? 0.25 : 0.75);
      A.hand.setEulerAngles(0, 0, Math.atan2(ty - ey, tx - ex) * 57.3 + (holding ? 30 * side : 0));
    });
  }
  state() {
    const H = this.held;
    if (!H) return 0;
    return H.kind === 'car' ? [1, H.car.id] : [2, Math.round(H.P.body.p[0] * 10) / 10, Math.round(H.P.body.p[1] * 10) / 10];
  }
  setState(s) {
    if (!Array.isArray(s)) { this.netHeld = null; return; }
    if (s[0] === 1) { const car = this.ctx.cars().find((c) => c.id === s[1]); this.netHeld = car ? { kind: 'car', car } : null; }
    else this.netHeld = { kind: 'xy', xy: [s[1], s[2]] };
  }
}

const ROOF_G = { arm: Arm, ball: WreckBall, magnet: Magnet, mortar: Mortar, balloon: Balloon, hands: Hands };
const BUMPER_G = { glove: Glove, harpoon: Harpoon, catcher: Catcher, flame: Flame, eject: Eject };

export function makeGadget(slot, id, car, ctx) {
  const C = (slot === 'roof' ? ROOF_G : BUMPER_G)[id];
  return C ? new C(car, ctx) : null;
}

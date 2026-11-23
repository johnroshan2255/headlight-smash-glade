// Eight different machines: each has its own body, wheels, collision shape and handling.
import { CLS } from './shaders.js';
import { MeshBuilder, rgba, addTube, addLathe, addSphere, addBox } from './meshes.js';

const metal = (v = 0) => rgba(0.1 + v, 0.1 + v, 0.11 + v, CLS.CHAR);
const iron = (v = 0) => rgba(0.18 + v, 0.18 + v, 0.19 + v, CLS.STONE);
const wood = (v = 0) => rgba(0.2 + v, 0.15 + v, 0.1 + v, CLS.GROUND);
const bone = (v = 0) => rgba(0.62 + v, 0.58 + v, 0.5 + v, CLS.CHAR);
const paintOf = ([r, g, b]) => (v = 0) => rgba(r * 0.6 + v, g * 0.6 + v, b * 0.6 + v, CLS.CHAR);

function driver(mb, x, y, z, color) {
  addLathe(mb, [[0.24, 0], [0.26, 0.2], [0.2, 0.42], [0, 0.46]], { seg: 10, x, y, z, colFn: () => rgba(0.14, 0.13, 0.13, CLS.CHAR) });
  addSphere(mb, { x, y: y + 0.6, z: z + 0.03, r: 0.16, segW: 8, segH: 6, colFn: () => rgba(0.24, 0.21, 0.19, CLS.CHAR) });
  addTube(mb, [[x, y + 0.46, z + 0.13, 0.05], [x + 0.1, y + 0.42, z - 0.15, 0.045], [x + 0.14, y + 0.32, z - 0.4, 0.03]], { seg: 5, colFn: () => rgba(color[0], color[1], color[2], CLS.CHAR, 0.6) });
}
const cage = (mb, w, z0, z1, y0, y1) => {
  for (const s of [-1, 1]) addTube(mb, [[w * s, y0, z0, 0.045], [w * 0.88 * s, y1, z0 - 0.25, 0.045], [w * 0.88 * s, y1 + 0.02, z1 + 0.25, 0.045], [w * s, y0, z1, 0.045]], { seg: 5, colFn: () => metal(0.06) });
  addTube(mb, [[-w * 0.88, y1, z0 - 0.25, 0.045], [w * 0.88, y1, z0 - 0.25, 0.045]], { seg: 5, colFn: () => metal(0.06) });
};

// -------------------------------------------------------------------- the eight builders
const BUILD = {
  mudrunner(mb, c) {
    const paint = paintOf(c);
    addLathe(mb, [[0.0, -0.28], [0.85, -0.26], [1.0, -0.05], [0.95, 0.18], [0.7, 0.3], [0.0, 0.32]], { seg: 16, sx: 0.88, sz: 1.42, colFn: (t) => (t > 0.55 ? paint(0.02) : metal(0)) });
    addTube(mb, [[-0.8, -0.05, 1.38, 0.07], [0, 0.02, 1.48, 0.08], [0.8, -0.05, 1.38, 0.07]], { seg: 6, colFn: () => metal(0.04) });
    addTube(mb, [[-0.8, -0.02, -1.38, 0.07], [0, 0.02, -1.45, 0.08], [0.8, -0.02, -1.38, 0.07]], { seg: 6, colFn: () => metal(0.04) });
    cage(mb, 0.62, 0.45, -0.7, 0.25, 0.95);
    addTube(mb, [[0.5, 0.1, -1.2, 0.06], [0.55, 0.35, -1.45, 0.06], [0.55, 0.55, -1.55, 0.07]], { seg: 6, colFn: () => metal(0.12) });
    driver(mb, 0, 0.2, -0.15, c);
  },
  tub(mb, c) {
    // a clawfoot bathtub on wheels, enamel outside, painted inside
    addLathe(mb, [[0.0, -0.2], [0.85, -0.18], [0.98, 0.1], [1.0, 0.36], [0.92, 0.38], [0.82, 0.12], [0.0, 0.1]], { seg: 18, sx: 0.72, sz: 1.25, colFn: (t) => (t > 0.7 ? paintOf(c)(0.05) : bone(0)) });
    for (const [x, z] of [[-0.55, 0.85], [0.55, 0.85], [-0.55, -0.85], [0.55, -0.85]]) addTube(mb, [[x, -0.15, z, 0.07], [x * 1.15, -0.3, z * 1.05, 0.05], [x * 1.2, -0.36, z * 1.1, 0.06]], { seg: 5, colFn: () => rgba(0.6, 0.45, 0.2, CLS.STONE) });
    // a shower pipe arching over: the lamp mast
    addTube(mb, [[0, 0.3, -1.1, 0.04], [0, 1.2, -1.0, 0.04], [0, 1.4, -0.4, 0.04], [0, 1.25, 0.2, 0.04]], { seg: 5, colFn: () => rgba(0.6, 0.45, 0.2, CLS.STONE) });
    addLathe(mb, [[0.0, 0], [0.16, 0.02], [0.1, 0.1], [0.0, 0.12]], { seg: 10, y: 1.12, z: 0.22, colFn: () => rgba(0.6, 0.45, 0.2, CLS.STONE) });
    driver(mb, 0, 0.0, -0.25, c);
  },
  tractor(mb, c) {
    const paint = paintOf(c);
    addBox(mb, { y: 0.15, z: 0.75, sx: 0.8, sy: 0.65, sz: 1.5, col: (t) => paint(t * 0.05) }); // long engine hood
    addBox(mb, { y: -0.05, z: -0.45, sx: 1.1, sy: 0.45, sz: 1.0, col: metal(0.02) });
    for (const s of [-1, 1]) addLathe(mb, [[0.0, 0], [0.9, 0.0], [0.95, 0.2], [0.9, 0.5], [0.0, 0.5]], { seg: 12, x: 0.92 * s, y: 0.05, z: -0.75, sx: 0.4, sz: 0.95, colFn: () => paint(-0.02), warp: (x, y, z) => [x, z * 0.85 + 0.25, -y * 0.2 + z * 0.05] }); // rear fenders
    addTube(mb, [[0.25, 0.45, 1.25, 0.08], [0.25, 1.4, 1.25, 0.08], [0.27, 1.5, 1.24, 0.1]], { seg: 6, colFn: () => metal(0.1) }); // smokestack
    addBox(mb, { y: 0.45, z: 1.55, sx: 0.6, sy: 0.4, sz: 0.1, col: iron(0.05) }); // grille
    driver(mb, 0, 0.2, -0.55, c);
  },
  monster(mb, c) {
    const paint = paintOf(c);
    addBox(mb, { y: 0.55, z: 0.1, sx: 1.2, sy: 0.6, sz: 1.6, col: (t) => paint(0.02 + t * 0.03) });
    addBox(mb, { y: 1.05, z: -0.2, sx: 1.0, sy: 0.5, sz: 0.9, col: metal(0.03) }); // cab
    addBox(mb, { y: 0.15, z: 0, sx: 0.5, sy: 0.25, sz: 2.4, col: iron(0) }); // spine frame
    for (const z of [1.15, -1.15]) addTube(mb, [[-1.2, 0.1, z, 0.08], [1.2, 0.1, z, 0.08]], { seg: 6, colFn: () => iron(0.03) }); // axles
    addTube(mb, [[-0.6, 1.3, 0.35, 0.05], [-0.6, 1.5, 0.0, 0.05], [0.6, 1.5, 0.0, 0.05], [0.6, 1.3, 0.35, 0.05]], { seg: 5, colFn: () => metal(0.08) });
    driver(mb, 0, 0.85, -0.25, c);
  },
  hearse(mb, c) {
    const paint = paintOf(c);
    addBox(mb, { y: 0.1, z: 0, sx: 1.4, sy: 0.5, sz: 3.4, col: metal(0.0) });
    addBox(mb, { y: 0.7, z: -0.4, sx: 1.3, sy: 0.75, sz: 2.4, col: (t) => paint(t * 0.04 - 0.02) });
    addBox(mb, { y: 1.12, z: -0.4, sx: 1.4, sy: 0.08, sz: 2.6, col: metal(0.06) });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) addBox(mb, { x: 0.66 * s, y: 0.72, z: -1.2 + i * 0.75, sx: 0.02, sy: 0.4, sz: 0.5, col: rgba(0.55, 0.42, 0.22, CLS.GLOW) }); // lit windows
    addTube(mb, [[-0.75, 0.2, 1.7, 0.08], [0.75, 0.2, 1.7, 0.08]], { seg: 6, colFn: () => metal(0.1) });
    driver(mb, 0, 0.35, 0.75, c);
  },
  trike(mb, c) {
    // a bone frame: spine, ribs and a fork
    addTube(mb, [[0, 0.2, 1.45, 0.06], [0, 0.3, 0.8, 0.07], [0, 0.25, 0.0, 0.08], [0, 0.2, -0.8, 0.07]], { seg: 6, colFn: () => bone(0) });
    for (let i = 0; i < 5; i++) {
      const z = 0.5 - i * 0.25;
      for (const s of [-1, 1]) addTube(mb, [[0, 0.28, z, 0.03], [0.35 * s, 0.15, z, 0.025], [0.42 * s, -0.08, z - 0.05, 0.02]], { seg: 4, colFn: () => bone(0.02) });
    }
    for (const s of [-1, 1]) addTube(mb, [[0.06 * s, 0.6, 1.4, 0.03], [0.08 * s, 0.1, 1.55, 0.03]], { seg: 4, colFn: () => metal(0.1) }); // fork
    addTube(mb, [[-0.4, 0.65, 1.35, 0.025], [0, 0.6, 1.4, 0.03], [0.4, 0.65, 1.35, 0.025]], { seg: 4, colFn: () => metal(0.12) }); // bars
    addTube(mb, [[-0.95, -0.05, -0.85, 0.06], [0.95, -0.05, -0.85, 0.06]], { seg: 6, colFn: () => iron(0.02) });
    addSphere(mb, { y: 0.35, z: -0.9, r: 0.22, sy: 0.7, segW: 8, segH: 5, colFn: () => paintOf(c)(0.05) }); // a skull-ish fuel tank
    driver(mb, 0, 0.3, -0.25, c);
  },
  kart(mb, c) {
    // a coffin on castors: tapered hexagonal box
    const w = (z) => (z > 0.3 ? 0.75 - (z - 0.3) * 0.55 : 0.75 - (0.3 - z) * 0.2);
    const pts = [1.35, 0.3, -1.3];
    for (const [y, sh] of [[-0.1, 0], [0.3, 0.04]]) {
      for (let i = 0; i < pts.length - 1; i++) {
        const z0 = pts[i], z1 = pts[i + 1], zm = (z0 + z1) / 2, len = Math.abs(z0 - z1);
        addBox(mb, { y, z: zm, sx: (w(z0) + w(z1)), sy: 0.36, sz: len, col: wood(sh) });
      }
    }
    for (let i = 0; i < 3; i++) addBox(mb, { y: 0.5, z: 0.6 - i * 0.6, sx: 1.2, sy: 0.04, sz: 0.06, col: rgba(0.6, 0.45, 0.2, CLS.STONE) }); // brass bands
    addBox(mb, { y: 0.52, z: 0.95, sx: 0.12, sy: 0.04, sz: 0.5, col: paintOf(c)(0.08) }); // a painted cross-stripe
    addBox(mb, { y: 0.52, z: 0.95, sx: 0.4, sy: 0.04, sz: 0.12, col: paintOf(c)(0.08) });
    driver(mb, 0, 0.3, -0.45, c);
  },
  dozer(mb, c) {
    const paint = paintOf(c);
    addBox(mb, { y: 0.25, z: -0.2, sx: 1.5, sy: 0.7, sz: 2.2, col: (t) => paint(t * 0.04) });
    addBox(mb, { y: 0.95, z: -0.45, sx: 1.1, sy: 0.75, sz: 1.0, col: metal(0.04) }); // cab
    // the blade: a curved stone-iron wall
    addLathe(mb, [[1.25, -0.35], [1.2, 0.1], [1.25, 0.65]], { seg: 10, z: 1.25, sx: 1.1, sz: 0.3, colFn: () => iron(0.04), warp: (x, y, z) => (z > 0 ? [x, y, z + 0.2] : [x, y, 0.2 + z * 0.05]) });
    for (const s of [-1, 1]) addTube(mb, [[0.55 * s, 0.4, 0.4, 0.07], [0.6 * s, 0.25, 1.25, 0.06]], { seg: 5, colFn: () => iron(0.08) }); // blade arms
    for (const s of [-1, 1]) addBox(mb, { x: 0.9 * s, y: -0.1, z: -0.2, sx: 0.4, sy: 0.6, sz: 2.4, col: metal(-0.02) }); // track skirts
    addTube(mb, [[-0.45, 1.3, -0.9, 0.06], [-0.45, 1.9, -0.95, 0.07]], { seg: 6, colFn: () => metal(0.12) });
    driver(mb, 0, 0.6, -0.45, c);
  },
};

// -------------------------------------------------------------------- specs
// wheels: [x, z, steering?, radius]; lamps: [x, y, z]; spheres: collision; seat: hat position
export const VEHICLES = [
  { id: 'mudrunner', name: 'Mudrunner', blurb: 'A balanced buggy. Good at everything.', mass: 180, top: 21, accel: 17, grip: 13, steer: 0.6, k: 26, damp: 2.8, rest: 0.45, boostF: 13, inertia: [0.72, 0.92, 0.34],
    wheels: [[-0.86, 1.0, 1, 0.46], [0.86, 1.0, 1, 0.46], [-0.86, -0.95, 0, 0.46], [0.86, -0.95, 0, 0.46]], spheres: [[0, 0, 0.8, 0.55], [0, 0, -0.8, 0.55], [0, 0.4, -0.05, 0.5]], lamps: [[-0.48, 0.38, 1.34], [0.48, 0.38, 1.34]], seat: [0, 0.95, -0.12], flame: [0.55, 0.55, -1.6], front: 1.5 },
  { id: 'tub', name: 'Bathtub Racer', blurb: 'Tiny, light and very fast. Gets flung far.', mass: 120, top: 25, accel: 22, grip: 12, steer: 0.62, k: 24, damp: 2.4, rest: 0.34, boostF: 15, inertia: [0.55, 0.7, 0.3],
    wheels: [[-0.72, 0.9, 1, 0.34], [0.72, 0.9, 1, 0.34], [-0.72, -0.85, 0, 0.34], [0.72, -0.85, 0, 0.34]], spheres: [[0, 0.05, 0.6, 0.5], [0, 0.05, -0.6, 0.5]], lamps: [[0, 1.12, 0.3], [0, 1.12, 0.3]], seat: [0, 0.75, -0.22], flame: [0, 0.2, -1.4], front: 1.3 },
  { id: 'tractor', name: 'Old Tractor', blurb: 'Heavy and torquey. Giant rear wheels climb anything.', mass: 260, top: 17, accel: 20, grip: 15, steer: 0.55, k: 28, damp: 3.2, rest: 0.4, boostF: 12, inertia: [0.85, 1.0, 0.45],
    wheels: [[-0.62, 1.3, 1, 0.38], [0.62, 1.3, 1, 0.38], [-0.95, -0.75, 0, 0.72], [0.95, -0.75, 0, 0.72]], spheres: [[0, 0.1, 0.9, 0.5], [0, 0.1, -0.5, 0.65]], lamps: [[-0.3, 0.45, 1.6], [0.3, 0.45, 1.6]], seat: [0, 0.95, -0.52], flame: [0.27, 1.6, 1.24], front: 1.7 },
  { id: 'monster', name: 'Monster Hopper', blurb: 'Huge wheels, soft springs. Bounces off ramps.', mass: 220, top: 20, accel: 17, grip: 12, steer: 0.55, k: 17, damp: 2.0, rest: 0.75, boostF: 13, inertia: [0.8, 1.0, 0.5],
    wheels: [[-1.15, 1.15, 1, 0.72], [1.15, 1.15, 1, 0.72], [-1.15, -1.15, 0, 0.72], [1.15, -1.15, 0, 0.72]], spheres: [[0, 0.6, 0.6, 0.6], [0, 0.6, -0.6, 0.6]], lamps: [[-0.45, 0.65, 0.95], [0.45, 0.65, 0.95]], seat: [0, 1.6, -0.22], flame: [0, 0.6, -0.95], front: 1.6 },
  { id: 'hearse', name: 'Lantern Hearse', blurb: 'Long, low and heavy. A battering ram.', mass: 290, top: 22, accel: 16, grip: 14, steer: 0.5, k: 30, damp: 3.4, rest: 0.4, boostF: 14, inertia: [1.2, 1.3, 0.4],
    wheels: [[-0.75, 1.2, 1, 0.45], [0.75, 1.2, 1, 0.45], [-0.75, -1.25, 0, 0.45], [0.75, -1.25, 0, 0.45]], spheres: [[0, 0.2, 1.1, 0.6], [0, 0.3, -0.2, 0.65], [0, 0.3, -1.3, 0.6]], lamps: [[-0.6, 0.3, 1.75], [0.6, 0.3, 1.75]], seat: [0, 1.1, 0.78], flame: [0.5, 0.2, -1.8], front: 1.9 },
  { id: 'trike', name: 'Bone Trike', blurb: 'Three wheels, twitchy, flips like a coin.', mass: 140, top: 24, accel: 19, grip: 11, steer: 0.7, k: 23, damp: 2.3, rest: 0.4, boostF: 14, inertia: [0.5, 0.6, 0.22],
    wheels: [[0, 1.55, 1, 0.42], [-0.95, -0.85, 0, 0.45], [0.95, -0.85, 0, 0.45]], spheres: [[0, 0.15, 0.8, 0.45], [0, 0.15, -0.6, 0.5]], lamps: [[0, 0.62, 1.48], [0, 0.62, 1.48]], seat: [0, 1.05, -0.22], flame: [0, 0.35, -1.25], front: 1.7 },
  { id: 'kart', name: 'Coffin Kart', blurb: 'Low and grippy. The drift king.', mass: 150, top: 23, accel: 19, grip: 16, steer: 0.66, k: 32, damp: 3.0, rest: 0.25, boostF: 14, inertia: [0.6, 0.75, 0.3],
    wheels: [[-0.72, 1.05, 1, 0.3], [0.72, 1.05, 1, 0.3], [-0.78, -0.95, 0, 0.32], [0.78, -0.95, 0, 0.32]], spheres: [[0, 0.0, 0.75, 0.45], [0, 0.0, -0.75, 0.45]], lamps: [[-0.25, 0.5, 1.35], [0.25, 0.5, 1.35]], seat: [0, 1.05, -0.42], flame: [0, 0.1, -1.4], front: 1.4 },
  { id: 'dozer', name: 'Shrine Dozer', blurb: 'Slow. Wide stone blade. Unstoppable.', mass: 340, top: 16, accel: 17, grip: 17, steer: 0.48, k: 32, damp: 3.6, rest: 0.35, boostF: 13, inertia: [1.1, 1.2, 0.6],
    wheels: [[-0.9, 0.9, 1, 0.42], [0.9, 0.9, 1, 0.42], [-0.9, -1.1, 0, 0.42], [0.9, -1.1, 0, 0.42]], spheres: [[0, 0.2, 1.3, 0.65], [0, 0.3, -0.3, 0.75]], lamps: [[-0.45, 1.25, 0.08], [0.45, 1.25, 0.08]], seat: [0, 1.35, -0.42], flame: [-0.45, 1.95, -0.95], front: 1.9, plowish: true },
];
export const VEHICLE_IDS = VEHICLES.map((v) => v.id);
export const vehicleSpec = (id) => VEHICLES.find((v) => v.id === id) || VEHICLES[0];

const cache = new Map();
export function chassisFor(device, id, color, colorIdx) {
  const key = `${id}:${colorIdx}`;
  if (!cache.has(key)) {
    const mb = new MeshBuilder();
    (BUILD[id] || BUILD.mudrunner)(mb, color);
    cache.set(key, mb.build(device));
  }
  return cache.get(key);
}

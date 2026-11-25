// The spooky maps' things: wandering skeletons that shatter into throwable bones (The Graveyard),
// pumpkins and melons that splat or get thrown (Hallowe'en Hollow), and the black silhouette
// scenery for both: tombstones, crosses, crypts, fences, a chapel; crooked houses with glowing
// windows, scarecrows, lantern posts, bats. Props are painted in muted, worn colours (like the cars);
// scenery is pure silhouette with the odd amber glow, the same as the headlights.
import { MeshBuilder, rgba, addTube, addLathe, addSphere, addBox } from './meshes.js';
import { CLS } from './shaders.js';

const BONE = () => rgba(0.6, 0.56, 0.46, CLS.CHAR);
const BONE_DK = () => rgba(0.42, 0.38, 0.3, CLS.CHAR);
const EMBER = () => rgba(1.0, 0.62, 0.25, CLS.GLOW);
const SIL = (cls = CLS.STONE) => () => rgba(0.03, 0.03, 0.03, cls, 0);

// ---------------------------------------------------------------- the skeleton: parts that animate
/** a skeleton's pieces. torso includes the skull (with ember eyes), ribs, spine and pelvis; legs and
 *  arms hang from their pivot (0,0) downwards */
export function skeletonMeshes(device) {
  const torso = new MeshBuilder();
  addTube(torso, [[0, -0.42, 0, 0.05], [0.02, 0.0, 0, 0.05], [0, 0.38, 0, 0.045]], { seg: 5, colFn: BONE }); // spine
  for (let i = 0; i < 4; i++) { const y = 0.3 - i * 0.12, w = 0.24 - i * 0.025; addTube(torso, [[0.02, y, -w, 0.025], [0.12, y - 0.04, 0, 0.028], [0.02, y, w, 0.025]], { seg: 4, colFn: BONE }); } // ribs
  addBox(torso, { y: -0.45, sx: 0.2, sy: 0.12, sz: 0.36, col: BONE_DK() }); // pelvis
  addBox(torso, { y: 0.4, sx: 0.12, sy: 0.06, sz: 0.46, col: BONE() }); // shoulders
  addSphere(torso, { x: 0.04, y: 0.62, r: 0.17, sy: 1.1, segW: 9, segH: 6, colFn: BONE }); // skull
  addBox(torso, { x: 0.1, y: 0.49, sx: 0.14, sy: 0.07, sz: 0.16, col: BONE_DK() }); // jaw
  for (const z of [-0.065, 0.065]) addSphere(torso, { x: 0.17, y: 0.65, z, r: 0.035, segW: 4, segH: 3, colFn: EMBER }); // ember eyes
  const leg = new MeshBuilder();
  addTube(leg, [[0, 0, 0, 0.045], [0.02, -0.4, 0, 0.04], [0, -0.78, 0, 0.035]], { seg: 4, colFn: BONE });
  addSphere(leg, { y: -0.4, r: 0.055, segW: 4, segH: 3, colFn: BONE_DK }); // knee
  addBox(leg, { x: 0.07, y: -0.8, sx: 0.2, sy: 0.05, sz: 0.09, col: BONE() }); // foot
  const arm = new MeshBuilder();
  addTube(arm, [[0, 0, 0, 0.035], [0.02, -0.3, 0, 0.032], [0.04, -0.58, 0, 0.028]], { seg: 4, colFn: BONE });
  for (let i = 0; i < 3; i++) addTube(arm, [[0.04, -0.58, (i - 1) * 0.03, 0.012], [0.08, -0.7, (i - 1) * 0.045, 0.008]], { seg: 3, colFn: BONE });
  return { torso: torso.build(device), leg: leg.build(device), arm: arm.build(device) };
}

/** the bones a skeleton breaks into (each is a small prop you can grab and throw) */
export const BONE_PARTS = ['skull', 'ribs', 'bone'];
export const boneShapes = (part) => (part === 'skull' ? [[0, 0, 0.19]] : part === 'ribs' ? [[-0.14, 0, 0.2], [0.14, 0, 0.2]] : [[-0.3, 0, 0.08], [0, 0, 0.09], [0.3, 0, 0.08]]);
export const boneMass = (part) => (part === 'skull' ? 6 : part === 'ribs' ? 10 : 4);
export function boneMeshes(device) {
  const skull = new MeshBuilder();
  addSphere(skull, { r: 0.18, sy: 1.1, segW: 9, segH: 6, colFn: BONE });
  addBox(skull, { x: 0.06, y: -0.13, sx: 0.15, sy: 0.07, sz: 0.16, col: BONE_DK() });
  for (const z of [-0.065, 0.065]) addSphere(skull, { x: 0.14, y: 0.03, z, r: 0.04, segW: 4, segH: 3, colFn: EMBER });
  const ribs = new MeshBuilder();
  addTube(ribs, [[-0.25, 0, 0, 0.045], [0.25, 0, 0, 0.045]], { seg: 5, colFn: BONE });
  for (let i = 0; i < 4; i++) { const x = -0.18 + i * 0.12; addTube(ribs, [[x, 0, -0.2, 0.024], [x, 0.12, 0, 0.026], [x, 0, 0.2, 0.024]], { seg: 4, colFn: BONE }); }
  const bone = new MeshBuilder();
  addTube(bone, [[-0.32, 0, 0, 0.05], [-0.26, 0, 0, 0.035], [0.26, 0, 0, 0.035], [0.32, 0, 0, 0.05]], { seg: 5, capStart: true, colFn: BONE });
  for (const x of [-0.33, 0.33]) for (const z of [-0.035, 0.035]) addSphere(bone, { x, z, r: 0.045, segW: 4, segH: 3, colFn: BONE });
  return { skull: skull.build(device), ribs: ribs.build(device), bone: bone.build(device) };
}

// ---------------------------------------------------------------- pumpkins and melons
/** variant: 'pumpkin' (ribbed, a stem), 'lantern' (a carved, glowing jack-o'-lantern), 'melon' (striped) */
export function pumpkinMesh(device, variant) {
  const mb = new MeshBuilder();
  const melon = variant === 'melon';
  const orange = (t) => rgba(0.58 - t * 0.08, 0.3 - t * 0.05, 0.09, CLS.CHAR), green = (t, a) => (Math.floor(a * 2.6) % 2 ? rgba(0.2, 0.3, 0.13, CLS.CHAR) : rgba(0.3, 0.38, 0.18, CLS.CHAR));
  // a lathe with ribs: the radius dips between the segments
  const seg = 16, rings = 9, R = 0.5, H = melon ? 0.42 : 0.4;
  const pts = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings, ang = -Math.PI / 2 + v * Math.PI, y = Math.sin(ang) * H * (melon ? 1 : 0.92), r0 = Math.cos(ang) * R * (melon ? 1.15 : 1);
    const row = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, rib = melon ? 1 : 1 - 0.07 * (0.5 + 0.5 * Math.cos(a * 8));
      row.push(mb.vert(Math.cos(a) * r0 * rib, y, Math.sin(a) * r0 * rib, Math.cos(a) * Math.cos(ang), Math.sin(ang), Math.sin(a) * Math.cos(ang), melon ? green(v, a) : orange(v)));
    }
    pts.push(row);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { mb.tri(pts[j][i], pts[j + 1][i], pts[j + 1][i + 1]); mb.tri(pts[j][i], pts[j + 1][i + 1], pts[j][i + 1]); }
  if (!melon) addTube(mb, [[0, H * 0.85, 0, 0.06], [0.05, H * 1.2, 0, 0.04], [0.14, H * 1.32, 0, 0.03]], { seg: 4, colFn: () => rgba(0.22, 0.2, 0.1, CLS.CHAR) });
  if (variant === 'lantern') { // a carved face, glowing from inside (on both sides, so it shows whichever way it rolls)
    for (const s of [1, -1]) {
      const z = s * R * 0.94;
      for (const x of [-0.17, 0.17]) addBox(mb, { x, y: 0.1, z, sx: 0.13, sy: 0.12, sz: 0.04, tilt: x > 0 ? 0.5 : -0.5, col: EMBER() });
      addBox(mb, { y: -0.03, z, sx: 0.08, sy: 0.08, sz: 0.04, tilt: 0.78, col: EMBER() });
      addBox(mb, { y: -0.17, z, sx: 0.4, sy: 0.08, sz: 0.04, col: EMBER() });
      for (const x of [-0.1, 0.1]) addBox(mb, { x, y: -0.13, z, sx: 0.06, sy: 0.06, sz: 0.04, col: rgba(0.4, 0.2, 0.06, CLS.CHAR) }); // teeth
    }
  }
  return mb.build(device);
}

// ---------------------------------------------------------------- scenery silhouettes (baked into the world)
const S = SIL(CLS.STONE), W = SIL(CLS.FOLIAGE);
export function tombstoneMesh() { const mb = new MeshBuilder(); addBox(mb, { y: 0.45, sx: 0.65, sy: 0.9, sz: 0.18, col: S() }); addLathe(mb, [[0.0, 0.9], [0.33, 0.9], [0.0, 1.22]], { seg: 10, sz: 0.28, colFn: S }); addBox(mb, { y: 0.06, sx: 0.85, sy: 0.12, sz: 0.3, col: S() }); return mb.build(null); }
export function crossMesh() { const mb = new MeshBuilder(); addBox(mb, { y: 0.8, sx: 0.14, sy: 1.6, sz: 0.14, col: S() }); addBox(mb, { y: 1.15, sx: 0.75, sy: 0.13, sz: 0.13, col: S() }); return mb.build(null); }
export function cryptMesh() {
  const mb = new MeshBuilder();
  addBox(mb, { y: 1.3, sx: 3.2, sy: 2.6, sz: 2.2, col: S() });
  addBox(mb, { y: 2.75, sx: 3.6, sy: 0.3, sz: 2.5, col: S() });
  addBox(mb, { y: 3.25, sx: 2.6, sy: 0.7, sz: 2.0, tilt: 0, col: S() });
  for (const x of [-1.3, 1.3]) addBox(mb, { x, y: 1.3, z: 1.15, sx: 0.3, sy: 2.6, sz: 0.3, col: S() });
  addBox(mb, { y: 4.0, sx: 0.14, sy: 0.9, sz: 0.14, col: S() }); addBox(mb, { y: 4.2, sx: 0.55, sy: 0.12, sz: 0.12, col: S() });
  return mb.build(null);
}
export function fenceMesh() { // a run of iron railings with spear tips, 6 m long
  const mb = new MeshBuilder();
  for (let i = 0; i <= 15; i++) { const x = -3 + i * 0.4; addBox(mb, { x, y: 0.7, sx: 0.05, sy: 1.4, sz: 0.05, col: S() }); addLathe(mb, [[0.0, 1.38], [0.07, 1.42], [0.0, 1.6]], { seg: 4, x, colFn: S }); }
  for (const y of [0.25, 1.15]) addBox(mb, { y, sx: 6.1, sy: 0.06, sz: 0.06, col: S() });
  for (const x of [-3, 3]) addBox(mb, { x, y: 0.85, sx: 0.18, sy: 1.7, sz: 0.18, col: S() });
  return mb.build(null);
}
export function chapelMesh() {
  const mb = new MeshBuilder();
  addBox(mb, { y: 2.2, sx: 6, sy: 4.4, sz: 4, col: S() });
  addTube(mb, [[-3.2, 4.4, 0, 0.1], [0, 6.6, 0, 0.1], [3.2, 4.4, 0, 0.1]], { seg: 3, colFn: S }); // roof line
  addBox(mb, { y: 5.2, sx: 6.2, sy: 1.8, sz: 4.2, tilt: 0, col: S() });
  addBox(mb, { x: 2.2, y: 5.6, sx: 1.6, sy: 6, sz: 1.6, col: S() }); // the tower
  addLathe(mb, [[0.0, 8.6], [1.0, 8.6], [0.0, 11.6]], { seg: 4, x: 2.2, colFn: S }); // the spire
  addBox(mb, { x: 2.2, y: 12, sx: 0.12, sy: 0.9, sz: 0.12, col: S() }); addBox(mb, { x: 2.2, y: 12.15, sx: 0.5, sy: 0.1, sz: 0.1, col: S() });
  addBox(mb, { x: -1, y: 2.4, z: 2.02, sx: 0.7, sy: 1.3, sz: 0.04, col: rgba(0.55, 0.35, 0.12, CLS.GLOW) }); // one lit window
  return mb.build(null);
}
export function houseMesh(seed = 1) { // a crooked haunted house with glowing windows
  const mb = new MeshBuilder(), lean = (seed % 3 - 1) * 0.06, lit = rgba(0.7, 0.42, 0.14, CLS.GLOW);
  addBox(mb, { y: 1.8, sx: 4.4, sy: 3.6, sz: 3.6, tilt: lean, col: S() });
  addTube(mb, [[-2.6, 3.4, 0, 0.08], [0.2 + lean * 6, 6.2, 0, 0.08], [2.6, 3.4, 0, 0.08]], { seg: 3, colFn: S });
  addLathe(mb, [[0.0, 3.4], [2.6, 3.4], [0.0, 6.2]], { seg: 4, sz: 0.75, colFn: S }); // the roof
  addBox(mb, { x: 1.3, y: 5.3, sx: 0.5, sy: 1.6, sz: 0.5, col: S() }); // chimney
  addBox(mb, { x: -2.6, y: 3.7, sx: 1.2, sy: 2.4, sz: 1.2, tilt: -0.08, col: S() }); addLathe(mb, [[0.0, 4.9], [0.85, 4.9], [0.0, 6.4]], { seg: 4, x: -2.6, colFn: S }); // a turret
  for (const [x, y] of [[-1.1, 2.4], [0.9, 2.4], [-0.1, 0.9]]) if ((seed + x * 7) % 2 > -1) addBox(mb, { x, y, z: 1.82, sx: 0.55, sy: 0.7, sz: 0.04, col: x === -0.1 ? S() : lit });
  addBox(mb, { x: -2.6, y: 4.0, z: 0.62, sx: 0.3, sy: 0.4, sz: 0.04, col: lit });
  return mb.build(null);
}
export function scarecrowMesh() {
  const mb = new MeshBuilder();
  addBox(mb, { y: 1.1, sx: 0.12, sy: 2.2, sz: 0.12, col: W() });
  addBox(mb, { y: 1.65, sx: 1.6, sy: 0.1, sz: 0.1, col: W() });
  addLathe(mb, [[0.0, 0.9], [0.45, 0.95], [0.3, 1.6], [0.0, 1.7]], { seg: 6, colFn: W }); // the coat
  for (const x of [-0.8, 0.8]) addTube(mb, [[x, 1.65, 0, 0.05], [x * 1.08, 1.45, 0, 0.0]], { seg: 3, colFn: W }); // straw cuffs
  addSphere(mb, { y: 2.0, r: 0.24, segW: 6, segH: 4, colFn: W });
  addLathe(mb, [[0.0, 2.15], [0.42, 2.15], [0.18, 2.25], [0.04, 2.75], [0.0, 2.8]], { seg: 8, colFn: W }); // pointy hat
  return mb.build(null);
}
export function lanternPostMesh() {
  const mb = new MeshBuilder();
  addBox(mb, { y: 1.4, sx: 0.1, sy: 2.8, sz: 0.1, col: S() });
  addTube(mb, [[0, 2.7, 0, 0.04], [0.35, 2.9, 0, 0.04], [0.45, 2.7, 0, 0.03]], { seg: 3, colFn: S });
  addBox(mb, { x: 0.45, y: 2.45, sx: 0.22, sy: 0.3, sz: 0.22, col: EMBER() });
  return mb.build(null);
}
export function smallLanternMesh() { // a jack-o'-lantern for porches, fences and piles (scenery)
  const mb = new MeshBuilder();
  addSphere(mb, { r: 0.32, sy: 0.8, segW: 8, segH: 5, colFn: () => rgba(0.05, 0.03, 0.02, CLS.STONE, 0) });
  for (const x of [-0.11, 0.11]) addBox(mb, { x, y: 0.06, z: 0.3, sx: 0.08, sy: 0.08, sz: 0.03, tilt: x > 0 ? 0.5 : -0.5, col: EMBER() });
  addBox(mb, { y: -0.08, z: 0.3, sx: 0.22, sy: 0.05, sz: 0.03, col: EMBER() });
  return mb.build(null);
}
export function batMesh() {
  const mb = new MeshBuilder();
  addSphere(mb, { r: 0.12, sy: 0.8, segW: 5, segH: 3, colFn: S });
  for (const s of [-1, 1]) addTube(mb, [[s * 0.08, 0, 0, 0.05], [s * 0.35, 0.12, 0, 0.03], [s * 0.6, -0.02, 0, 0.0]], { seg: 3, colFn: S });
  return mb.build(null);
}

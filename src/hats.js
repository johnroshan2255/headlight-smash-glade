// The 13 driver hats (straw + 12 secret ones). Built around (0,0,0) = top of the driver's head.
import { CLS } from './shaders.js';
import { MeshBuilder, rgba, addLathe, addTube, addSphere, addBox } from './meshes.js';

const C = (r, g, b, cls = CLS.CHAR) => () => rgba(r, g, b, cls);

const BUILD = {
  straw(mb) {
    addLathe(mb, [[0.5, 0.0], [0.48, 0.03], [0.32, 0.1], [0.15, 0.22], [0.05, 0.3], [0.0, 0.32]], { seg: 14, colFn: (t) => rgba(0.42 + t * 0.06, 0.34 + t * 0.05, 0.2, CLS.GROUND) });
    addLathe(mb, [[0.0, 0.0], [0.48, 0.0]], { seg: 14, colFn: C(0.16, 0.13, 0.08, CLS.GROUND) });
  },
  bucket(mb) { addLathe(mb, [[0.2, -0.02], [0.24, 0.0], [0.2, 0.26], [0.0, 0.27]], { seg: 10, colFn: C(0.35, 0.36, 0.38, CLS.STONE) }); addTube(mb, [[-0.22, 0.05, 0, 0.012], [0, 0.3, 0, 0.012], [0.22, 0.05, 0, 0.012]], { seg: 3, colFn: C(0.2, 0.2, 0.2, CLS.STONE) }); },
  crown(mb) {
    addLathe(mb, [[0.14, 0.0], [0.15, 0.08], [0.0, 0.081]], { seg: 10, colFn: C(0.9, 0.65, 0.2, CLS.GLOW) });
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; addTube(mb, [[Math.cos(a) * 0.14, 0.07, Math.sin(a) * 0.14, 0.025], [Math.cos(a) * 0.15, 0.17, Math.sin(a) * 0.15, 0.0]], { seg: 4, colFn: C(0.9, 0.65, 0.2, CLS.GLOW) }); }
  },
  antlers(mb) {
    for (const s of [-1, 1]) {
      addTube(mb, [[0.08 * s, 0, 0, 0.03], [0.2 * s, 0.18, -0.02, 0.025], [0.3 * s, 0.4, 0.02, 0.018], [0.34 * s, 0.55, 0.08, 0.008]], { seg: 4, colFn: C(0.4, 0.32, 0.22) });
      addTube(mb, [[0.2 * s, 0.18, -0.02, 0.018], [0.32 * s, 0.24, 0.12, 0.012], [0.38 * s, 0.32, 0.16, 0.004]], { seg: 4, colFn: C(0.4, 0.32, 0.22) });
    }
  },
  cone(mb) {
    addBox(mb, { y: 0.02, sx: 0.4, sy: 0.04, sz: 0.4, col: rgba(0.7, 0.3, 0.1, CLS.CHAR) });
    addLathe(mb, [[0.16, 0.03], [0.1, 0.25], [0.04, 0.45], [0.0, 0.46]], { seg: 10, colFn: (t) => (Math.abs(t - 0.45) < 0.12 ? rgba(0.85, 0.85, 0.82, CLS.CHAR) : rgba(0.8, 0.35, 0.1, CLS.CHAR)) });
  },
  witch(mb) {
    addLathe(mb, [[0.42, 0.0], [0.4, 0.02], [0.17, 0.05], [0.1, 0.3], [0.05, 0.5], [0.0, 0.58]], { seg: 12, colFn: C(0.08, 0.06, 0.1) });
    addLathe(mb, [[0.0, 0.0], [0.42, 0.0]], { seg: 12, colFn: C(0.06, 0.05, 0.08) });
  },
  tophat(mb) {
    addLathe(mb, [[0.3, 0.0], [0.15, 0.01], [0.15, 0.32], [0.0, 0.33]], { seg: 12, colFn: C(0.06, 0.06, 0.07) });
    addLathe(mb, [[0.155, 0.05], [0.155, 0.1], [0.0, 0.1]], { seg: 12, colFn: C(0.45, 0.12, 0.1) });
  },
  propeller(mb) {
    addSphere(mb, { y: 0.02, r: 0.16, sy: 0.6, segW: 8, segH: 5, colFn: C(0.2, 0.35, 0.55) });
    addTube(mb, [[0, 0.1, 0, 0.012], [0, 0.18, 0, 0.012]], { seg: 3, colFn: C(0.8, 0.8, 0.8) });
    addBox(mb, { y: 0.19, sx: 0.5, sy: 0.015, sz: 0.06, col: rgba(0.75, 0.25, 0.2, CLS.CHAR) });
  },
  chef(mb) { addLathe(mb, [[0.14, 0.0], [0.15, 0.12], [0.2, 0.2], [0.19, 0.3], [0.1, 0.36], [0.0, 0.37]], { seg: 10, colFn: C(0.85, 0.85, 0.82) }); },
  pirate(mb) {
    addLathe(mb, [[0.0, 0.0], [0.17, 0.02], [0.18, 0.16], [0.0, 0.18]], { seg: 10, sx: 1.6, colFn: C(0.06, 0.06, 0.06) });
    addTube(mb, [[-0.32, 0.12, 0, 0.04], [0, 0.22, 0.03, 0.05], [0.32, 0.12, 0, 0.04]], { seg: 5, colFn: C(0.06, 0.06, 0.06) });
    addSphere(mb, { y: 0.16, z: 0.16, r: 0.035, segW: 4, segH: 3, colFn: C(0.85, 0.85, 0.82) });
  },
  viking(mb) {
    addSphere(mb, { y: 0.0, r: 0.17, sy: 0.85, segW: 9, segH: 6, colFn: C(0.4, 0.4, 0.42, CLS.STONE) });
    for (const s of [-1, 1]) addTube(mb, [[0.14 * s, 0.05, 0, 0.045], [0.26 * s, 0.14, 0, 0.032], [0.3 * s, 0.3, 0.02, 0.004]], { seg: 5, colFn: C(0.8, 0.75, 0.6) });
  },
  party(mb) { addLathe(mb, [[0.12, 0.0], [0.06, 0.2], [0.0, 0.34]], { seg: 10, colFn: (t) => (Math.floor(t * 6) % 2 ? rgba(0.75, 0.3, 0.6, CLS.CHAR) : rgba(0.3, 0.55, 0.75, CLS.CHAR)) }); addSphere(mb, { y: 0.35, r: 0.04, segW: 4, segH: 3, colFn: C(0.9, 0.8, 0.3) }); },
  halo(mb) {
    const ring = [];
    for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; ring.push([Math.cos(a) * 0.2, 0.3, Math.sin(a) * 0.2, 0.025]); }
    addTube(mb, ring, { seg: 4, subdiv: 1, capEnd: false, colFn: C(1.0, 0.85, 0.45, CLS.GLOW) });
  },
};

export const HAT_IDS = Object.keys(BUILD);

const cache = new Map();
/** Cached mesh per hat id (shared by every car wearing it). */
export function hatMesh(device, id) {
  const key = BUILD[id] ? id : 'straw';
  if (!cache.has(key)) {
    const mb = new MeshBuilder();
    BUILD[key](mb);
    cache.set(key, mb.build(device));
  }
  return cache.get(key);
}

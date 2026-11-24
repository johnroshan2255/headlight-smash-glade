// The endless glade: a deterministic, seeded generator. The world is cut into 64 m chunks along x;
// every chunk's terrain features and props come from (seed, chunk index), so every browser builds
// the same chunk without asking anyone. Nothing here touches the renderer or physics.
//
// Height = base(x) (smooth hills everywhere, taller the further you drive from camp) + the
// chunk's own features (ramps, a pond, the shrine bowl, a big climb, a boulder mesa). Features
// stay inside their chunk and fade to zero at its edges, so the ground is continuous.

export const CHUNK = 64;
export const WORLD_SEED = 1337;

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (...n) => { let h = 2166136261; for (const v of n) { h ^= (v | 0) + 0x9e3779b9; h = Math.imul(h, 16777619); h ^= h >>> 13; } return h >>> 0; };

export const chunkOf = (x) => Math.floor(x / CHUNK);
/** stable numeric ids for things that live in a chunk (k < 100) */
export const chunkId = (c, k) => (c + 50000) * 100 + k;
export const chunkOfId = (id) => Math.floor(id / 100) - 50000;

/** length of a ramp's back slope (behind the lip) */
export const rampBack = (r) => r.h * 1.9 + 0.5;

/** 0 at camp .. 1 far out: hills grow, gaps widen */
export const difficulty = (x) => smooth(60, 1600, Math.abs(x));

/** the smooth rolling ground under everything */
export function base(x) {
  const A = 1.2 + 6.5 * difficulty(x);
  return 0.5 * Math.sin(x * 0.045 + 0.3) + 0.35 * Math.sin(x * 0.11 + 2.0) + 0.22 * Math.sin(x * 0.23 + 1.1)
    + A * (0.6 * Math.sin(x * 0.017 + 1.3) + 0.4 * Math.sin(x * 0.041 + 0.4)) - A * 0.25;
}

// The twelve hats: each lives in a fixed chunk, as a small stunt.
//   easy  = over a ramp, a plain jump reaches it      boost = needs a boosted ramp jump
//   geyser = high over a pond: ride the geyser        floor = on a pond floor
//   pillar = on a shrine pillar beside the bowl        bowl  = in the bottom of the bowl
//   mesa  = on top of a boulder mesa
export const HAT_SPOTS = [
  { id: 'bucket', c: 2, kind: 'easy' }, { id: 'party', c: -3, kind: 'easy' },
  { id: 'viking', c: 5, kind: 'boost' }, { id: 'antlers', c: -6, kind: 'boost' },
  { id: 'halo', c: 8, kind: 'geyser' }, { id: 'chef', c: -9, kind: 'floor' },
  { id: 'crown', c: 12, kind: 'pillar' }, { id: 'pirate', c: -13, kind: 'pillar' },
  { id: 'tophat', c: 17, kind: 'bowl' }, { id: 'cone', c: -18, kind: 'mesa' },
  { id: 'witch', c: 24, kind: 'mesa' }, { id: 'propeller', c: -26, kind: 'boost' },
];
const HAT_TYPE = { easy: 'meadow', boost: 'meadow', geyser: 'pond', floor: 'pond', pillar: 'bowl', bowl: 'bowl', mesa: 'mesa' };

const cache = new Map();

/** Everything about chunk c. Cached; cheap to call. */
export function chunkSpec(c, seed = WORLD_SEED) {
  const key = c * 7919 + seed;
  let S = cache.get(key);
  if (S) return S;
  S = makeChunk(c, seed);
  cache.set(key, S);
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return S;
}

function makeChunk(c, seed) {
  const rng = mulberry(hash(seed, c, 77));
  const x0 = c * CHUNK, x1 = x0 + CHUNK, xm = x0 + CHUNK / 2;
  const d = difficulty(xm);
  const S = { c, x0, x1, type: 'meadow', ramps: [], barrels: [], trees: [], crates: [], geysers: [], ball: null, pond: null, bowl: null, hill: null, mesa: null, pillars: [], hats: [], arch: null, teeter: null, tornado: null };
  const hatSpot = HAT_SPOTS.find((h) => h.c === c);

  // ---------------------------------------------------------------- choose the chunk type
  if (c === 0 || c === -1) S.type = 'camp';
  else if (hatSpot) S.type = HAT_TYPE[hatSpot.kind];
  else {
    const r = rng();
    const near = Math.abs(c) < 3;
    if (near) S.type = r < 0.75 ? 'meadow' : 'pond';
    else S.type = r < 0.36 ? 'meadow' : r < 0.52 ? 'hill' : r < 0.66 ? 'pond' : r < 0.78 ? 'bowl' : r < 0.9 ? 'mesa' : 'ruins';
  }

  // occupied stretches, so props don't pile into each other or onto ramps
  const taken = [];
  const free = (a, b) => !taken.some(([p, q]) => a < q && b > p);
  const take = (a, b) => taken.push([a, b]);
  const place = (w, lo = x0 + 6, hi = x1 - 6) => {
    for (let i = 0; i < 24; i++) { const x = lo + rng() * (hi - lo); if (free(x - w, x + w)) { take(x - w, x + w); return x; } }
    return null;
  };
  const addRamp = (x, dir, h = 2 + rng() * 0.8, len = 6 + rng() * 1.5) => {
    const r = { x, dir, h: Math.min(h, 2.8), len };
    S.ramps.push(r);
    const a = dir > 0 ? x - len : x - rampBack(r), b = dir > 0 ? x + rampBack(r) : x + len;
    take(a - 1, b + 1);
    return r;
  };
  const addRampRandom = () => {
    const dir = rng() < 0.5 ? 1 : -1, len = 7, back = 5;
    const x = place(9, x0 + 12, x1 - 12);
    if (x === null) return null;
    taken.pop();
    return addRamp(x - dir * (back - len) / 2, dir);
  };

  // ---------------------------------------------------------------- features per type
  if (S.type === 'camp') {
    // the start: flat around x = 0, a ramp each way, a couple of crates
    const out = c === 0 ? 1 : -1, at = (v) => (c === 0 ? v : -v);
    take(at(-6), at(8)); take(at(8), at(-6));
    addRamp(at(18), out, 2.2, 6);
    S.crates.push(at(9));
    S.barrels.push([at(34), 2]);
    S.trees.push(at(44));
    addRamp(at(56), -out, 2.0, 6);
  } else if (S.type === 'pond') {
    const w = 22 + rng() * 6;
    S.pond = { x0: xm - w / 2, x1: xm + w / 2, depth: 3.2, ref: base(xm) };
    S.pond.waterY = S.pond.ref - 0.6;
    take(S.pond.x0 - 3, S.pond.x1 + 3);
    const n = 3;
    for (let i = 0; i < n; i++) S.geysers.push(xm + (i - 1) * (w / 4));
    if (rng() < 0.6) { const x = place(3); if (x !== null) S.barrels.push([x, 1 + (rng() < 0.4)]); }
    { const x = place(3); if (x !== null) S.crates.push(x); }
  } else if (S.type === 'bowl') {
    S.bowl = { x: xm, half: 15, depth: 6, ref: base(xm) };
    take(xm - 17, xm + 17);
    S.pillars.push(xm - 20, xm + 20);
    S.barrels.push([xm, 2]);
    { const x = place(2.5); if (x !== null) S.crates.push(x); }
  } else if (S.type === 'hill') {
    // a Hill-Climb style climb: one big rounded hill
    const H = 4 + 8 * d * (0.6 + rng() * 0.4);
    S.hill = { x: xm, half: 24, h: H };
    if (rng() < 0.6) { const x = place(2.5, x0 + 4, x0 + 12) ?? place(2.5, x1 - 12, x1 - 4); if (x !== null) S.crates.push(x); }
    if (rng() < 0.5) { const x = place(3, xm - 4, xm + 4); if (x !== null) S.barrels.push([x, 1]); }
  } else if (S.type === 'mesa') {
    // a flat-topped hill with boulders waiting on one edge: drive in below and they let go
    const dir = rng() < 0.5 ? 1 : -1, top = 7 + 3 * d;
    S.mesa = { x: xm, top, dir, rise0: x0 + 8, rise1: x0 + 23, fall0: x1 - 23, fall1: x1 - 8, count: 4 };
    take(x0 + 6, x1 - 6);
    S.mesa.edge = dir > 0 ? S.mesa.fall0 : S.mesa.rise1; // the top of the slope the boulders roll down
    S.mesa.trigger = dir > 0 ? x1 - 4 : x0 + 4;
  } else if (S.type === 'ruins') {
    // a stone arch that pulses with static and yanks loose metal into the air
    S.arch = xm;
    take(xm - 4, xm + 4);
    addRampRandom();
    for (let i = 0; i < 2; i++) { const x = place(3); if (x !== null) S.barrels.push([x, 1 + Math.floor(rng() * 2)]); }
  } else { // meadow
    const ramps = 1 + (rng() < 0.55 ? 1 : 0);
    for (let i = 0; i < ramps; i++) addRampRandom();
    const stacks = 1 + Math.floor(rng() * 2.6);
    for (let i = 0; i < stacks; i++) { const x = place(3); if (x !== null) S.barrels.push([x, 1 + Math.floor(rng() * 3)]); }
    const trees = Math.floor(rng() * 3);
    for (let i = 0; i < trees; i++) { const x = place(2); if (x !== null) S.trees.push(x); }
    if (rng() < 0.85) { const x = place(2.5); if (x !== null) S.crates.push(x); }
    if (rng() < 0.3) { const x = place(4.5); if (x !== null) S.ball = x; }
    if (rng() < 0.28) { const x = place(6); if (x !== null) S.teeter = x; }
    if (rng() < 0.18 && Math.abs(c) > 2) S.tornado = { home: xm, range: 22, seed: hash(seed, c, 5) % 1000 };
  }

  // ---------------------------------------------------------------- this chunk's hat
  if (hatSpot) {
    const h = { id: hatSpot.id, x: xm, y: 0, abs: false };
    if (hatSpot.kind === 'easy' || hatSpot.kind === 'boost') {
      let r = S.ramps[0];
      if (!r) { S.ramps.length = 0; r = addRamp(xm - 8, 1, 2.2, 6); }
      r.h = 2.2; r.len = 6;
      if (hatSpot.kind === 'easy') { h.x = r.x + r.dir * 4.4; h.y = 3.7; } else { h.x = r.x + r.dir * 8.5; h.y = 5.8; }
      h.foot = r.x - r.dir * r.len; // y is measured from the ground at the foot of the ramp
    } else if (hatSpot.kind === 'geyser') { h.x = S.geysers[1]; h.y = S.pond.waterY + 7.6; h.abs = true; }
    else if (hatSpot.kind === 'floor') { h.x = S.geysers[0] - 2; h.y = 1.0; }
    else if (hatSpot.kind === 'pillar') { h.x = S.pillars[1]; h.pillar = true; }
    else if (hatSpot.kind === 'bowl') { h.x = S.bowl.x + 3; h.y = 1.0; }
    else if (hatSpot.kind === 'mesa') { h.x = (S.mesa.rise1 + S.mesa.fall0) / 2; h.y = 1.6; }
    S.hats.push(h);
  }

  // ---------------------------------------------------------------- hazards (for safe spawns)
  S.hazards = [];
  for (const r of S.ramps) S.hazards.push(r.dir > 0 ? [r.x - 2.5, r.x + rampBack(r) + 1] : [r.x - rampBack(r) - 1, r.x + 2.5]);
  for (const [x] of S.barrels) S.hazards.push([x - 3.5, x + 3.5]);
  for (const x of S.trees) S.hazards.push([x - 2, x + 2]);
  for (const h of S.hats) if (!h.pillar) S.hazards.push([h.x - 3.5, h.x + 3.5]);
  if (S.ball !== null) S.hazards.push([S.ball - 4, S.ball + 4]);
  if (S.teeter !== null) S.hazards.push([S.teeter - 5, S.teeter + 5]);
  if (S.pond) S.hazards.push([S.pond.x0 - 3, S.pond.x1 + 3]);
  if (S.bowl) S.hazards.push([S.bowl.x - S.bowl.half - 3, S.bowl.x - 6.5], [S.bowl.x + 6.5, S.bowl.x + S.bowl.half + 3]);
  if (S.mesa) S.hazards.push([x0 + 4, x1 - 4]);
  if (S.arch !== null) S.hazards.push([S.arch - 8, S.arch + 8]);
  return S;
}

/** the chunk's own shaping, added on top of base() (zero at the chunk's edges) */
export function featureHeight(S, x, y) {
  if (S.pond) {
    const P = S.pond, pc = (P.x0 + P.x1) / 2, ph = (P.x1 - P.x0) / 2;
    const k = 1 - smooth(0.62, 1.05, Math.abs(x - pc) / ph);
    if (k > 0) y += (P.ref - P.depth - y) * k;
  }
  if (S.bowl) {
    const B = S.bowl, u = (x - B.x) / B.half;
    if (Math.abs(u) < 1) { const k = Math.abs(u) ** 2.4; y = (B.ref - B.depth) * (1 - k) + y * k; }
  }
  if (S.hill) {
    const H = S.hill, u = (x - H.x) / H.half;
    if (Math.abs(u) < 1) y += H.h * 0.5 * (1 + Math.cos(Math.PI * u));
  }
  if (S.mesa) {
    const M = S.mesa;
    y += M.top * smooth(M.rise0, M.rise1, x) * (1 - smooth(M.fall0, M.fall1, x));
  }
  for (const r of S.ramps) {
    const s = (x - r.x) * r.dir, back = rampBack(r);
    if (s > -r.len && s <= 0) y += r.h * ((s + r.len) / r.len) ** 1.6;
    else if (s > 0 && s < back) y += r.h * 0.5 * (1 + Math.cos((Math.PI * s) / back));
  }
  return y;
}

export function rawHeight(x, seed = WORLD_SEED) { return featureHeight(chunkSpec(chunkOf(x), seed), x, base(x)); }

/** the water surface at x, or null when x is not over a pond */
export function waterAt(x, seed = WORLD_SEED) {
  const P = chunkSpec(chunkOf(x), seed).pond;
  return P && x > P.x0 && x < P.x1 ? P.waterY : null;
}

/** is x a good place to drop a fresh buggy? (not on a ramp, prop, slope or in water) */
export function safeAt(x, seed = WORLD_SEED) {
  const S = chunkSpec(chunkOf(x), seed);
  if (S.hazards.some(([a, b]) => x > a && x < b)) return false;
  const s = (rawHeight(x + 0.5, seed) - rawHeight(x - 0.5, seed));
  return Math.abs(s) < 0.3;
}

/** absolute height of the shrine pillars' tops in a bowl chunk */
export const pillarTop = (S) => S.bowl.ref + 3.4;

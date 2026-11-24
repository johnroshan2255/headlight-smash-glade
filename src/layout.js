// HEADLIGHT: SMASH GLADE, side view. One long glade, seen from the side, walled by fog at both
// ends. Everything here is placed along x (metres); y is up. The play plane is z = 0.
export const TITLE = 'HEADLIGHT: SMASH GLADE';

/** length of a ramp's back slope (behind the lip) */
export const rampBack = (r) => r.h * 1.9 + 0.5;

export const LAYOUT = {
  halfW: 120, // fog walls at x = +-120
  waterY: -0.6,
  pond: { x0: -66, x1: -40, depth: 3.2 },
  bowl: { x: 55, half: 15, depth: 6 }, // the shrine stunt bowl
  // ramps: x = lip position, dir = +1 launches you rightwards, -1 leftwards
  ramps: [
    { x: -80, dir: 1, len: 7, h: 2.4 },
    { x: -22, dir: -1, len: 6, h: 2.0 },
    { x: 8, dir: 1, len: 6, h: 2.2 },
    { x: 26, dir: -1, len: 7, h: 2.6 },
    { x: 88, dir: 1, len: 6, h: 2.2 },
  ],
  // rock-slide hills at both ends: boulders wait on a ledge; drive under them at your peril
  slides: [
    { x: -104, dir: 1, top: 9, count: 4 }, // ledge high on the left, rolls rightwards
    { x: 104, dir: -1, top: 9, count: 4 },
  ],
  barrels: [[-90, 2], [-70, 1], [-36, 3], [-28, 1], [-12, 2], [12.5, 2], [33, 3], [46, 1], [55, 2], [64, 1], [80, 3], [95, 1]],
  trees: [-86, -33, -18, -8, 18, 38, 74, 79], // dead trees you can snap into logs (none on the end hills: a tree on a climb is a wall)
  crates: [-98, -74, -46, -26, -4, 16, 30, 50, 62, 84, 100],
  geysers: [-60, -53, -46],
  cageBall: 20,
  pillars: [35, 75], // shrine pillars standing behind the lane, just outside the bowl rims (scenery)
  // Twelve hats, each a small stunt. y is metres above the ground at x; a buggy picks one up when
  // its middle passes within about 2 m. (Heights were set from measured jumps: see next.md.)
  hats: [
    { id: 'bucket', x: -6, y: 4.6 }, // above the start: only the Spring-Hop reaches it
    { id: 'crown', x: 75, y: 0, onPillar: true }, // on the east shrine pillar: boost out of the bowl
    { id: 'pirate', x: 35, y: 0, onPillar: true }, // on the west shrine pillar
    { id: 'antlers', x: -73, y: 6.0 }, // boosted jump off the west ramp
    { id: 'viking', x: 16.5, y: 6.0 }, // boosted jump off the middle ramp
    { id: 'propeller', x: 18, y: 6.3 }, // boosted jump off the east-facing ramp, over the cage-ball
    { id: 'party', x: 91, y: 4.0 }, // off the far east ramp, into the hill (the easy one)
    { id: 'cone', x: -112, y: 2.0 }, // on the left rock-slide ledge: climb past the boulders
    { id: 'witch', x: 112, y: 2.0 }, // on the right one
    { id: 'tophat', x: 55, y: 1.0 }, // bottom of the bowl, between the barrels at the altar
    { id: 'chef', x: -60, y: 1.0 }, // on the pond floor
    { id: 'halo', x: -53, y: 10.5 }, // high over the pond: ride the middle geyser
  ],
};

// Spawn spots: every clear stretch of the glade. Nothing here is next to a barrel stack, a tree,
// the cage-ball, a ramp lip, the pond, the bowl's walls or a rock-slide trigger, so a fresh buggy never lands
// on trouble. (Derived from the layout: move a barrel and the spawns follow.)
LAYOUT.spawns = (() => {
  const L = LAYOUT, out = [];
  for (let x = -88; x <= 88; x += 1) {
    if (x > L.pond.x0 - 3 && x < L.pond.x1 + 3) continue;
    const bowl = Math.abs(x - L.bowl.x);
    if (bowl > 6.5 && bowl < L.bowl.half + 3) continue; // the bowl's floor is fine, its walls are not
    if (L.barrels.some(([bx]) => Math.abs(bx - x) < 3.5)) continue;
    if (L.trees.some((tx) => Math.abs(tx - x) < 2)) continue;
    if (Math.abs(x - L.cageBall) < 4) continue;
    if (L.hats.some((h) => !h.onPillar && Math.abs(h.x - x) < 3.5)) continue; // no free hats for dropping in
    if (L.ramps.some((r) => { const s = (x - r.x) * r.dir; return s > -2.5 && s < rampBack(r) + 1; })) continue; // the lip and its back slope
    if (L.slides.some((s) => Math.abs(x - (s.x + s.dir * 9)) < 7)) continue;
    out.push(x);
  }
  // one spot per clear stretch (two for a long one), so no part of the map is favoured
  const spots = [];
  for (let i = 0; i < out.length;) {
    let j = i;
    while (j + 1 < out.length && out[j + 1] - out[j] <= 1) j++;
    const a = out[i], b = out[j];
    if (b - a >= 8) spots.push(a + (b - a) * 0.25, a + (b - a) * 0.75); else spots.push((a + b) / 2);
    i = j + 1;
  }
  return spots;
})();

export const RESPAWN_SECONDS = 20;
export const GADGET_SECONDS = 25;
export const MAX_PLAYERS = 8;

export const GADGETS = {
  mine: { name: 'Bomb-Dropper', hint: 'E drops a bomb behind you' },
  rocket: { name: 'Rocket-Boost', hint: 'unlimited, uncontrollable boost' },
  plow: { name: 'Mega-Plow', hint: 'ram cars to launch them' },
  horn: { name: 'Shockwave Horn', hint: 'E blasts everything away' },
  hop: { name: 'Spring-Hop', hint: 'E (or jump) for huge hops, even mid-air' },
  // ASCII view off: the Glitch-Bomb only existed to force rivals into the ASCII view
  // glitch: { name: 'ASCII Glitch-Bomb', hint: 'E scrambles nearby drivers into ASCII' },
};
export const GADGET_KEYS = Object.keys(GADGETS);

export const HATS = {
  straw: 'Straw hat', bucket: 'Bucket', crown: 'Tiny crown', antlers: 'Antlers', cone: 'Traffic cone',
  witch: 'Witch hat', tophat: 'Top hat', propeller: 'Propeller cap', chef: 'Chef hat', pirate: 'Pirate hat',
  viking: 'Viking helm', party: 'Party hat', halo: 'Halo',
};

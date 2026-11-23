// HEADLIGHT: SMASH GLADE, side view. One long glade, seen from the side, walled by fog at both
// ends. Everything here is placed along x (metres); y is up. The play plane is z = 0.
export const TITLE = 'HEADLIGHT: SMASH GLADE';

export const LAYOUT = {
  halfW: 120, // fog walls at x = +-120
  waterY: -0.6,
  pond: { x0: -66, x1: -40, depth: 3.2 },
  bowl: { x: 55, half: 15, depth: 6.5 }, // the shrine stunt bowl
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
  barrels: [[-90, 2], [-70, 1], [-36, 3], [-28, 1], [-12, 2], [14, 2], [33, 3], [46, 1], [55, 2], [64, 1], [80, 3], [95, 1]],
  trees: [-96, -86, -33, -18, -8, 18, 38, 74, 79, 92], // dead trees you can snap into logs
  crates: [-98, -74, -46, -26, -4, 12, 30, 50, 62, 84, 100],
  geysers: [-60, -53, -46],
  cageBall: 20,
  pillars: [41, 69], // shrine pillars on the bowl rims
  hats: [
    { id: 'bucket', x: -6, y: 6 }, // above the start
    { id: 'crown', x: 69, y: 0, onPillar: true }, // top of the east shrine pillar
    { id: 'antlers', x: -80, y: 9 }, // high over the west ramp: you have to fly
    { id: 'cone', x: -112, y: 13 }, // above the left rock-slide ledge
    { id: 'witch', x: 113, y: 13 }, // above the right one
    { id: 'tophat', x: 55, y: -4 }, // bottom of the bowl, under the altar
    { id: 'propeller', x: 26, y: 10 }, // above the east-facing ramp
    { id: 'chef', x: -53, y: -2.4 }, // on the pond floor
    { id: 'pirate', x: 41, y: 0, onPillar: true },
    { id: 'viking', x: 8, y: 9 },
    { id: 'party', x: 88, y: 8 },
    { id: 'halo', x: 55, y: 9 }, // high over the bowl: launch from the rim
  ],
  spawns: [-92, -76, -30, -14, 0, 16, 34, 76, 96, -2],
};

export const RESPAWN_SECONDS = 20;
export const GADGET_SECONDS = 25;
export const MAX_PLAYERS = 8;

export const GADGETS = {
  mine: { name: 'Bomb-Dropper', hint: 'E drops a bomb behind you' },
  rocket: { name: 'Rocket-Boost', hint: 'unlimited, uncontrollable boost' },
  plow: { name: 'Mega-Plow', hint: 'ram cars to launch them' },
  horn: { name: 'Shockwave Horn', hint: 'E blasts everything away' },
  hop: { name: 'Spring-Hop', hint: 'E (or jump) for huge hops, even mid-air' },
  glitch: { name: 'ASCII Glitch-Bomb', hint: 'E scrambles nearby drivers into ASCII' },
};
export const GADGET_KEYS = Object.keys(GADGETS);

export const HATS = {
  straw: 'Straw hat', bucket: 'Bucket', crown: 'Tiny crown', antlers: 'Antlers', cone: 'Traffic cone',
  witch: 'Witch hat', tophat: 'Top hat', propeller: 'Propeller cap', chef: 'Chef hat', pirate: 'Pirate hat',
  viking: 'Viking helm', party: 'Party hat', halo: 'Halo',
};

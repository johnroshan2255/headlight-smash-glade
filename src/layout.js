// HEADLIGHT: SMASH GLADE: map layout (single source of truth). x = east, z = south.
export const TITLE = 'HEADLIGHT: SMASH GLADE';

const deg = (d) => (d * Math.PI) / 180;

export const LAYOUT = {
  waterY: 0,
  pond: { x: 14, z: 4, r: 12 },
  shrine: { x: -26, z: -40 }, // stunt bowl
  playRadius: 66,
  meadow: { x: -8, z: 20, r: 15 }, // central meadow: the cage-ball arena
  cageBall: { x: -8, z: 20 },

  // natural rock launch ramps: dir = heading the ramp launches you toward
  ramps: [
    { x: 2, z: 12, dir: deg(70), len: 9, width: 6, h: 2.6 }, // launches over the pond's west half
    { x: 26, z: -6, dir: deg(-120), len: 9, width: 6, h: 2.6 }, // and back from the east shore
    { x: -24, z: 18, dir: deg(90), len: 8, width: 5, h: 2.0 }, // meadow kicker
    { x: 18, z: 34, dir: deg(-90), len: 10, width: 6, h: 3.2 }, // big south jump
    { x: -2, z: -24, dir: deg(-30), len: 8, width: 5, h: 2.4 }, // forest gap
    { x: 34, z: -30, dir: deg(150), len: 9, width: 6, h: 2.8 }, // north-east ridge
  ],

  // dirt road loop through the glade (terrain colour + tree clearance)
  path: [[-30, 44], [-8, 40], [8, 30], [30, 22], [40, 2], [32, -20], [12, -32], [-10, -30], [-26, -40], [-40, -22], [-44, 4], [-38, 30], [-30, 44]],

  // explosive oil-lantern barrel clusters (each entry = a stack)
  barrels: [
    [-20, 41, 3], [5, 33, 2], [28, 24, 3], [41, 0, 2], [33, -19, 3], [10, -31, 2], [-12, -29, 3],
    [-41, -20, 2], [-44, 6, 3], [-37, 30, 2], [0, 4, 2], [-26, -40, 4], // the last stack sits on the shrine altar
  ],

  // drive-through gadget crates
  crates: [
    [-8, 30], [6, 18], [-22, 6], [30, 12], [22, -16], [0, -14], [-18, -22], [-34, -10],
    [-40, 18], [12, 42], [44, -12], [-26, -52],
  ],

  // gas vents in the pond (geysers)
  geysers: [[10, 1], [16, 7], [18, -1], [12, 9], [21, 5]],

  // unstable rock piles that slide when you hit them hard (dir = which way they tumble)
  rockPiles: [
    { x: 46, z: 20, dir: deg(180) },
    { x: -48, z: -8, dir: deg(10) },
    { x: 24, z: -40, dir: deg(110) },
  ],

  // the dead forest band that snaps when you boost into it
  snapForest: { x0: -18, x1: 24, z0: -26, z1: -12, count: 26 },

  // 12 hats: on ramp lips, behind snappable trees, over pond jumps, atop shrine pillars...
  hats: [
    { id: 'bucket', x: 8, z: 4.5, y: 4.5 }, // mid-air over the pond: only reachable from the west ramp
    { id: 'crown', x: -26, z: -48.5, y: 4.2 }, // on top of a shrine pillar (spring-hop)
    { id: 'antlers', x: 4, z: -19, y: 1.2 }, // behind snappable trees
    { id: 'cone', x: 18, z: 39, y: 4.8 }, // above the big south jump's lip
    { id: 'witch', x: -48, z: -10, y: 3.2 }, // on the west rock pile
    { id: 'tophat', x: 47, z: 21, y: 3.2 }, // on the east rock pile
    { id: 'propeller', x: 26, z: -4, y: 3.6 }, // east ramp lip
    { id: 'chef', x: -24, z: 21, y: 3.0 }, // meadow kicker
    { id: 'pirate', x: -2, z: -27, y: 3.4 }, // forest gap jump
    { id: 'viking', x: 34, z: -33, y: 3.8 }, // north-east ridge jump
    { id: 'party', x: 14, z: -24, y: 1.2 }, // deep in the snappable forest
    { id: 'halo', x: -8, z: 20, y: 6.0 }, // floating over the cage-ball
  ],

  // drop-in points around the glade (cars fall out of the fog)
  spawns: [[-30, 40], [0, 36], [32, 18], [38, -12], [8, -36], [-20, -30], [-44, -6], [-40, 24], [20, 26], [-14, 6]],
};

export const RESPAWN_SECONDS = 20; // barrels, trees, rocks, crates
export const GADGET_SECONDS = 25;
export const MAX_PLAYERS = 8;

export const GADGETS = {
  mine: { name: 'BOMB-DROPPER', hint: 'drop a mine behind you' },
  rocket: { name: 'ROCKET-BOOST', hint: 'unlimited, uncontrollable boost' },
  plow: { name: 'MEGA-PLOW', hint: 'ram anyone to launch them' },
  horn: { name: 'SHOCKWAVE HORN', hint: 'honk to blast everyone away' },
  hop: { name: 'SPRING-HOP', hint: 'tap to bunny-hop' },
  glitch: { name: 'ASCII GLITCH-BOMB', hint: 'flip everyone near you into ASCII' },
};
export const GADGET_KEYS = Object.keys(GADGETS);

export const HATS = {
  straw: 'Straw hat', bucket: 'Bucket', crown: 'Tiny crown', antlers: 'Antlers', cone: 'Traffic cone',
  witch: 'Witch hat', tophat: 'Top hat', propeller: 'Propeller cap', chef: 'Chef hat', pirate: 'Pirate hat',
  viking: 'Viking helm', party: 'Party hat', halo: 'Halo',
};

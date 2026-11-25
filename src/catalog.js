// What can be bought and earned. Shared by the game and the server (no engine imports here), so
// prices and rules are the same on both sides. The server is the judge of coins and ownership.

export const START_COINS = 200; // enough for a first ride or gadget; the rest is earned by playing

/** Everything in the garage is free while this is on. Read by both the game and the server.
 *  Off: the shop sells at the prices below (kept low, 50-300 coins, so everyone can afford things). */
export const FREE_FOR_NOW = false;

/** rides: chassis prices (the Mudrunner is the free starter) */
export const RIDES = {
  mudrunner: 0, kart: 50, tub: 100, trike: 100, barrow: 150, tractor: 150,
  monster: 200, hearse: 200, dozer: 250, roller: 300, bus: 300,
};

/** what's under the car: how it moves */
export const WHEELS = {
  tires: { name: 'Rubber Tires', price: 0, blurb: 'Good old rubber. Use the slider to resize them.' },
  treads: { name: 'Centipede Treads', price: 100, blurb: 'Long flexible tracks. Insane grip on steep climbs.' },
  pogo: { name: 'Pogo Coils', price: 150, blurb: 'Bounces in huge rhythmic leaps. Land on rivals to crush them.' },
  spider: { name: 'Spider Rig', price: 200, blurb: 'Eight mechanical legs. Crawls up cliffs, steps over logs.' },
  saw: { name: 'Sawblade Wheels', price: 200, blurb: 'Spinning buzzsaws. Slice trees and rival bumpers on contact.' },
  hover: { name: 'Hover Thrusters', price: 250, blurb: 'Floats a metre up on amber jets. Glides over ponds; brakes badly.' },
  balloon: { name: 'Balloon Tires', price: 100, blurb: 'Huge, soft and bouncy. They float on ponds, and pop on a big hit: limp home on the rims.' },
  magnet: { name: 'Magnet Wheels', price: 150, blurb: 'Cling to cars, barrels and rocks. Drive right over rivals and ride on their roofs.' },
  square: { name: 'Square Wheels', price: 50, blurb: 'Wooden blocks. Thump-thump on the flat, but the corners bite into rocks and ruins.' },
};

/** roof slot: an active gadget fired with E (or the ROOF button) */
export const ROOF = {
  none: { name: 'Nothing', price: 0, blurb: 'A clean roof.' },
  balloon: { name: 'Party Balloon', price: 100, blurb: 'Mid-air: pop it open and glide. Tap again to drop a bomb.' },
  mortar: { name: 'Firework Mortar', price: 150, blurb: 'Four crooked rockets up into the fog. They rain down ahead.' },
  ball: { name: 'Wrecking Ball', price: 150, blurb: 'A spiked iron lantern on a chain. Swing it into anyone near.' },
  arm: { name: 'Robot Arm', price: 150, blurb: 'Grabs barrels, boulders and logs as you pass. Tap to throw.' },
  magnet: { name: 'Magnet Coil', price: 200, blurb: 'Hold to pull barrels and light cars in. Release to blast them out.' },
  hands: { name: 'Grabby Hands', price: 250, blurb: 'Grab rivals, bombs and barrels and throw them. Two pairs on one car tear it in two!' },
};

/** bumper slot: an active gadget fired with Q (or the BUMPER button) */
export const BUMPER = {
  none: { name: 'Nothing', price: 0, blurb: 'Just a bumper.' },
  eject: { name: 'Ejector Seat', price: 50, blurb: 'Fly out on a parachute; your empty car rams on and blows up.' },
  catcher: { name: 'Cow-Catcher', price: 50, blurb: 'Always on. Scoops cars and barrels up and over your roof.' },
  glove: { name: 'Boxing Glove', price: 100, blurb: 'A spring-loaded fist. Punch rivals into barrels and off hills.' },
  flame: { name: 'Ember Jets', price: 150, blurb: 'Short amber fire from both sides. Lights barrels, scorches rivals.' },
  harpoon: { name: 'Grapple Harpoon', price: 150, blurb: 'Hook trees, ground or cars. Hold to reel in, tap to let go.' },
  smoke: { name: 'Smoke Bomb', price: 100, blurb: 'A thick bank of fog behind you. Anyone inside it vanishes, and bots lose your trail.' },
  oil: { name: 'Oil Slick', price: 100, blurb: 'Dumps a black puddle behind you. Whoever drives through it spins out.' },
};

export const UPGRADES = {
  monster: { name: 'Monster-Scale Tires', price: 100, blurb: 'Unlocks the tire slider from 25% all the way to 250%.' },
};

/** muted paints: dusty, low-saturation colours that sit in the fog (index = paint id) */
export const PAINTS = [
  { name: 'Rust Red', rgb: [0.52, 0.2, 0.13] }, { name: 'Mustard', rgb: [0.6, 0.45, 0.16] },
  { name: 'Olive', rgb: [0.34, 0.4, 0.19] }, { name: 'Slate Blue', rgb: [0.25, 0.33, 0.44] },
  { name: 'Teal', rgb: [0.18, 0.39, 0.37] }, { name: 'Plum', rgb: [0.41, 0.22, 0.36] },
  { name: 'Burnt Orange', rgb: [0.6, 0.31, 0.12] }, { name: 'Sand', rgb: [0.58, 0.5, 0.36] },
];

/** maps for rooms (solo PLAY is always the endless glade). The layouts live in gen.js. */
export const MAP_LIST = [
  { id: 'glade', name: 'The Glade', short: 'GLADE', blurb: 'Meadows, a pond and the shrine bowl. The classic.' },
  { id: 'crater', name: 'Moon Crater', short: 'MOON', blurb: 'Low gravity under a huge moon. Craters and ramps: fly far.' },
  { id: 'bog', name: 'The Bog', short: 'BOG', blurb: 'Wide ponds, geysers and fallen logs. Bring balloons or jets.' },
  { id: 'quarry', name: 'The Quarry', short: 'QUARRY', blurb: 'Boulder mesas, ruins and yards stacked with oil barrels.' },
  { id: 'graveyard', name: 'The Graveyard', short: 'GRAVES', blurb: 'Skeletons wander the graves. Smash them to bones, then throw the bones.' },
  { id: 'hallow', name: "Hallowe'en Hollow", short: 'HALLOW', blurb: 'A haunted village of jack-o\'-lanterns. Splat pumpkins and melons, or throw them.' },
];
export const MAP_IDS = ['endless', ...MAP_LIST.map((m) => m.id)];
export const mapName = (id) => (MAP_LIST.find((m) => m.id === id) || { name: 'Endless Glade' }).name;

export const HAT_PRICE = 50;
export const HAT_IDS = ['straw', 'bucket', 'crown', 'antlers', 'cone', 'witch', 'tophat', 'propeller', 'chef', 'pirate', 'viking', 'party', 'halo'];

/** tire size range, as a scale on the vehicle's own wheels */
export const TIRE_RANGE = { base: [0.7, 1.4], monster: [0.25, 2.5] };

/** coins for things you do in the glade */
export const EARN = {
  smash: 25, // wrecked a human
  botSmash: 12, // wrecked a bot
  distance: 3, // per 100 m driven
  flip: 10, // each full flip, landed upright
  air: 3, // each second of air over 1.5 s
  crate: 4,
  hat: 60,
  boom: 2, // a barrel you set off
  win: 100, // won a timed match (most smashes)
  podium: 40, // second or third
  match: 15, // played a match to the end
};
/** the server never credits more than this per minute of play (plus a small burst allowance) */
export const EARN_PER_MINUTE = 600;
export const EARN_BURST = 150;

export const DEFAULT_SETUP = { ride: 'mudrunner', wheels: 'tires', tire: 1, roof: 'none', bumper: 'none', hat: 'straw', paint: -1 }; // paint -1: your team colour

const free = (p) => (p === undefined ? undefined : FREE_FOR_NOW ? 0 : p);
export const CATEGORIES = {
  rides: { label: 'RIDES', price: (id) => free(RIDES[id]) },
  wheels: { label: 'WHEELS', price: (id) => free(WHEELS[id]?.price) },
  roof: { label: 'ROOF', price: (id) => free(ROOF[id]?.price) },
  bumper: { label: 'BUMPER', price: (id) => free(BUMPER[id]?.price) },
  upgrades: { label: 'UPGRADES', price: (id) => free(UPGRADES[id]?.price) },
  hats: { label: 'HATS', price: (id) => free(HAT_IDS.includes(id) ? (id === 'straw' ? 0 : HAT_PRICE) : undefined) },
  paint: { label: 'PAINT', price: (id) => (Number(id) >= -1 && Number(id) < PAINTS.length ? 0 : undefined) }, // paint is always free
};

/** a fresh account's belongings */
export function newOwned() {
  return { rides: ['mudrunner'], wheels: ['tires'], roof: ['none'], bumper: ['none'], upgrades: [], hats: ['straw'] };
}

export function owns(owned, cat, id) {
  if (CATEGORIES[cat]?.price(id) === 0) return true; // free things are always yours
  return !!owned?.[cat]?.includes(id);
}

/** make a requested setup legal for these belongings */
export function cleanSetup(owned, s = {}) {
  const out = { ...DEFAULT_SETUP };
  if (owns(owned, 'rides', s.ride)) out.ride = s.ride;
  if (owns(owned, 'wheels', s.wheels)) out.wheels = s.wheels;
  if (owns(owned, 'roof', s.roof)) out.roof = s.roof;
  if (owns(owned, 'bumper', s.bumper)) out.bumper = s.bumper;
  if (owns(owned, 'hats', s.hat)) out.hat = s.hat;
  const [lo, hi] = owns(owned, 'upgrades', 'monster') ? TIRE_RANGE.monster : TIRE_RANGE.base;
  const p = Math.round(Number(s.paint));
  out.paint = Number.isFinite(p) && p >= -1 && p < PAINTS.length ? p : -1;
  const t = Number(s.tire);
  out.tire = Number.isFinite(t) ? Math.round(Math.max(lo, Math.min(hi, t)) * 100) / 100 : 1;
  return out;
}

/** the setup as a short string for the network: ride|wheels|tire|roof|bumper|hat */
export const packSetup = (s) => [s.ride, s.wheels, s.tire, s.roof, s.bumper, s.hat, s.paint ?? -1].join('|');
export function unpackSetup(str) {
  const [ride, wheels, tire, roof, bumper, hat, paint] = String(str || '').split('|');
  const p = Math.round(Number(paint));
  return { ride: ride || 'mudrunner', wheels: WHEELS[wheels] ? wheels : 'tires', tire: Math.max(0.25, Math.min(2.5, Number(tire) || 1)), roof: ROOF[roof] ? roof : 'none', bumper: BUMPER[bumper] ? bumper : 'none', hat: hat || 'straw', paint: Number.isFinite(p) && p >= -1 && p < PAINTS.length ? p : -1 };
}

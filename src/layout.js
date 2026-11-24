// HEADLIGHT: SMASH GLADE, side view: shared constants. The world itself is generated in gen.js.
export const TITLE = 'HEADLIGHT: SMASH GLADE';

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

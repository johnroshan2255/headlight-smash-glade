# next.md: where Smash Glade is and what's next

_Last session: 2026-11-24 (second half). Built the endless world, accounts, the garage and car mods. Not committed yet._

## Where we are
- **The glade is endless in both directions** (`src/gen.js`):
  - Deterministic from a seed, in 64 m chunks.
  - Chunk types: camp, meadow, pond, bowl, hill, mesa and ruins.
  - Only chunks near players exist. `World2D.stream()` handles scenery, a few build stages per frame. `Sandbox.stream()` handles props, with ids derived from the chunk.
  - The host simulates every chunk near any player.
  - Spawns land next to a human. Bots stay within 70 m of the humans and teleport back when they fall 160 m behind.
- **Accounts:** `server/accounts.js` keeps them in `server/data/accounts.json` (git-ignored).
  - Guest first; register or sign in from the account chip.
  - Passwords are scrypt-hashed; tokens are stored hashed.
  - Coin earning is rate-capped per minute.
  - The client side is `src/account.js`. With no server (the itch build) it falls back to localStorage.
- **Catalog:** `src/catalog.js` is shared by the game and the server: prices, coin rewards, setups.
  - **`FREE_FOR_NOW = true`:** everything is free, at your request. The real prices are kept in the file for later.
- **The garage:** `src/garage.js` plus the `#garageUI` / `#acctUI` panels in index.html.
  - The live preview is a real car in the scene (`game.preview(setup)`).
  - It opens from the menu (GARAGE) or from ≡ in-game (applies straight away).
  - The lobby is now just name + room; it shows your ride.
- **Mods** (`src/mods.js`):
  - **Undercarriages:** tires with a size slider, treads, pogo, spider, sawblades, hover.
  - **Roof gadgets (E):** arm, **Grabby Hands**, wrecking ball, magnet, mortar, balloon.
  - **Bumper gadgets (Q):** glove, harpoon, cow-catcher, ember jets, ejector seat.
  - Each gadget sends a tiny network state so other players see it.
  - Hits on other cars go to the car's owner (`shove`, `grabCar`, `throwCar`).
- **Grabby Hands:**
  - Grab a rival car (it dangles from your hands on its owner's screen), a bomb or a barrel. Press E again to throw.
  - Two different grabbers on one car tear it in two. The chassis is cut in the shader with a ragged edge (`uClip` in `sil.js`), and each half flies to a grabber. Both get the smash.
- **New rides:** Wheelbarrow Kart, Iron Steam-Roller (crusher) and Cage Bus, for 11 in all.
- **New world toys:**
  - **Teeter-totter:** a pinned one-way plank with a counterweight; wheels now push back on what they stand on.
  - **Tornado:** wall-clock driven, lifts about 11 m.
  - **Magnet arch:** every 14 s.
- **Paint:**
  - `uPaint` in `sil.js` paints a part with its vertex colour, muted toward grey.
  - Lighting comes only from the fog/sky colour, plus a soft top-light from each face (screen-space derivatives).
  - Wear is procedural: grime blotches, chipped-paint scratches and darker lower edges, in model space so the marks stick to the part.
  - Painted: cars (`car2d` materials), rigs and gadgets (`mods.js` paint box `P`, e.g. brown riveted spider legs), crate power-ups.
  - Props and the world stay silhouettes.
  - The garage has a PAINT tab: 8 muted paints (`PAINTS` in `catalog.js`) or team colour. It's part of the setup, so other players see it.
- **Tool fitting:** each car's real roof top, nose and tail are measured from its chassis mesh (`car.roofTop`, `noseX`, `tailX`). Every roof tool sits on a gunmetal roof rack, with fixed parts parented to the car's root so they move rigidly with it.
- **Tools that didn't work, now fixed** (checked by `scripts/playtest/tools.mjs`):
  - **Magnet:** a damped pull to 11 m that holds things over the roof.
  - **Wrecking ball:** a scripted over-the-roof slam with an impact zone.
  - **Balloon:** real drag and lift.
  - **Harpoon:** auto-aims, flies in sub-steps, and hooks props.
  - **Ember jets:** calmer flames.
- **Test hooks:** `__hsg.lockCam()` for close-ups and `__hsg.botSetup()` to give a test bot a fixed loadout.
- **Private rooms:**
  - The lobby has JOIN and CREATE ROOM tabs.
  - A room is created with `{ private, bots }`. `bots`: -1 fills the seats (the public glade), 0..6 means exactly that many.
  - Settings are kept on the server (`GladeRoom.settings`) and sent in welcome/roster.
  - Private rooms are left out of `/rooms`.
  - The host changes them with the `roomSettings` message (from ≡).
  - `syncBots()` follows `net.settings.bots`.
- **Leaving:**
  - The host leaving closes the room: the server broadcasts `roomClosed` and then `disconnect()`.
  - Clients reload to the menu with a notice; `sessionStorage` `hsg.notice` carries it across the reload.
  - A guest leaving only removes their car.
  - There's no host migration any more. This applies to the public glade too.
- **Sync fix:** remote cars use the sender's clock (`t` in the car snapshot) with a per-sender offset, proper bracketing and capped extrapolation (`Car.pushRemote/applyRemote`). Max jump went from 3–65 m to under 0.9 m.
- **Water fix:** pond meshes need their custom AABB set after the render component is created (`World2D.addEntity`), or they get culled.
- **Respawns:** people respawn near where they crashed; bots drop in near a human.
- **Removed:** the ASCII view (commented out earlier) and the old fixed map (`LAYOUT`).

## Test results (headless Chrome)
All of these pass:
- **endless:** ±1.8 km, 60 fps, bounded memory.
- **vehicles:** all 11 rides.
- **mods:** every rig and gadget.
- **hands:** grab, throw, a barrel, and the two-player tear seen on both screens.
- **toys:** teeter, tornado, arch. The arch check can flake when barrels pulled by the arch blow up the test car.
- **garage:** desktop and phone.
- **menu.**
- **mp:** with `NOBOTS=1`.
- **mpmods:** loadout sync, glove and ball hits across the network.

## Still to do
- **Commit and push** this work.
- **Hands-on feel pass on real devices:**
  - spider adhesion, pogo rhythm, hover braking
  - the Hands' grab reach (4.6 m) and the 6 s hold limit
  - tornado strength
- **Hats moved:** the 12 hats now sit on generated stunt spots (`HAT_SPOTS` in `gen.js`). Check each is reachable.
- **Turning prices back on:**
  - Set `FREE_FOR_NOW = false`.
  - Rebalance the prices and `EARN` values.
  - Think about a daily bonus.
- **Ideas from the list not built yet:**
  - fuel tankers
  - the steam-roller grinding boulders to gravel
  - harpoon towing a friend properly
  - the bus carrying three barrels on its roof
- **Bots** get random loadouts and use their gadgets in simple ways. They could be smarter about the Hands: grab, then throw at a barrel.
- **Itch:** the static build has no server, so accounts are local only there. Update the itch page text, then run `npm run itch`.

## How to run
```bash
cd ~/Downloads/Projects/headlight-smash-glade
npm run play          # build + server on http://localhost:2567 (and http://<wifi-ip>:2567)
# test URLs: ?gpu=webgl2|webgpu  ?stats  ?autostart&mode=solo&veh=kart  ?bots=0
node scripts/playtest/<script>.mjs   # see the README table
```

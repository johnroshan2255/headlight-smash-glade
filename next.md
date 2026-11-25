# next.md: where Fogbash is and what's next

_Last session: 2026-11-25 (launch prep for CrazyGames). Everything up to the maps is committed._

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
  - **The shop is on** (2026-11-25, `FREE_FOR_NOW = false`): cheap prices (50–300), 200 starting coins. Items worn while it was free go back to the starter kit unless bought.
- **The garage:** `src/garage.js` plus the `#garageUI` / `#acctUI` panels in index.html.
  - The live preview is a real car in the scene (`game.preview(setup)`).
  - It opens from the menu (GARAGE) or from ≡ in-game (applies straight away).
  - Tap to equip, with no EQUIP button; BUY shows only for locked items. Tabs: RIDE, WHEELS, ROOF, BUMPER, PAINT (colour dots), HAT. The Monster-Scale Tires card is gone from WHEELS; the tire slider covers it (and a BIGGER button when prices are on).
- **The lobby** is one narrow column:
  - JOIN | CREATE.
  - JOIN: a code with a JOIN button, plus open glades you tap to drive straight in.
  - CREATE: the code with COPY, bots 0/2/4/FILL, then CREATE & DRIVE. Created rooms are always private.
  - Name at the bottom.
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
  - The lobby has JOIN and CREATE tabs.
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
- **Damage across the network (2026-11-25):**
  - Car-on-car contact is decided by the attacker: the faster car (by pre-impact speed) reports the ram, and the saw, stomp and plow cars report their own hits. Each report goes to the victim's owner as a `shove`, with a 400 ms cooldown per target. Crushes are capped at 60.
  - Kills are credited on the killer's own browser (`onWrecked`), so the score sticks and smash coins are earned.
  - The wrecking ball resets when it ends up far from its hitch. Removed loose props (mines, rockets) are sent to guests in a `gone` list.
  - `scripts/playtest/damage.mjs` checks all of it.
- **Sync fix:** remote cars use the sender's clock (`t` in the car snapshot) with a per-sender offset, proper bracketing and capped extrapolation (`Car.pushRemote/applyRemote`). Max jump went from 3–65 m to under 0.9 m.
- **Water fix:** pond meshes need their custom AABB set after the render component is created (`World2D.addEntity`), or they get culled.
- **Respawns:** people respawn near where they crashed; bots drop in near a human.
- **Removed:** the ASCII view (commented out earlier) and the old fixed map (`LAYOUT`).

- **Audio (2026-11-25):**
  - The synth sounds were replaced by CC0 recordings in `public/audio` (Kenney packs + OpenGameArt; credits in `CREDITS.txt`), plus music: menu "Sirens in Darkness" and glade "I swear I saw it" / "Dark Forest Theme".
  - `src/audio.js` has the bank of variants; music runs through an `<audio>` element with a crossfade (`setMusic('menu'|'glade')`, applied 350 ms later).
  - MUSIC and SOUND sliders are in settings. Sound effects prefetch while the menu is up.
  - The old synth is only a fallback if a file fails.
- **Loading:** the server now does brotli/gzip and byte ranges. First visit: 388 KB to the menu (slow 4G: 3.3 s). The itch zip is 6.3 MB / 56 files.

- **New parts (2026-11-25):**
  - **Wheels** (`rigPhysics` in mods.js, meshes in car2d.js):
    - **Balloon tires:** the water counts as ground; they pop at ≥ 14 damage (`car.pop()`, bit 32 in the snapshot flags).
    - **Magnet wheels:** cars count as ground, and pushing into a car climbs it.
    - **Square wheels:** `w.bump` is taken from the wheel angle.
  - **Bumper gadgets** `Smoke` and `Oil` in mods.js: clouds and slicks travel in the gadget state. `Car.ctx.slickAt` and `Car.ctx.smokeAt`; `car.inSmoke` hides a car on other screens; bots skip cars in smoke.
- **Timed matches:**
  - `GladeRoom.settings.time` (6/8/10/12 minutes); the server's match clock is sent in welcome/roster/`match`, and the client uses `net.serverNow()`.
  - Client: `onMatch` / `showResults` / `updateClock` in game.js; `#clock` and `#matchEnd` in index.html.
  - Coins: `EARN.win` 100, `podium` 40, `match` 15.
  - `MATCH_MS` / `MATCH_BREAK_MS` env for short test matches.
  - Changing your ride mid-match keeps your score.

- **Room lobby (2026-11-25):**
  - Server: `GladeRoom` has phases (`match.phase`: lobby → playing → results → lobby) and a host-only `start` message.
  - `pickColor` sets a player's colour; the same colour is a team.
  - Bots: 0 unless the host adds them; -1 (fill) is only for `?autostart` tests, which also skip the lobby.
  - `/rooms` lists public rooms with host, phase and time left.
  - Client: `net.connect({ how: 'create' | 'join' | 'auto' })`; `game.joinRoom()` from the menu; `src/roomlobby.js` is the lobby UI (`#roomLobby`).
  - Teams: `sameTeam()` in game.js stops shoves, damage (`Car.damage`) and team-kill credit. Results add up each colour.
  - Online, cars wear the room colour (`paint: -1`) and name tags use it.
  - `net.on` now supports several listeners per message.

- **Maps:**
  - `MAPS` in gen.js: `endless` (solo and playtests), `glade`, `crater` (gravity 0.42, moon), `bog` (big ponds), `quarry`. Each arena is six chunks from c=-3, with `wall` chunks (cliffs) beyond.
  - New chunk types: crater, ramps, woods, yard.
  - `setMap()` clears the spec cache. `setGravity()` in physics2d (G is now a live binding). `physics.bounds` is a backstop 5 m up the cliffs.
  - `world.resetChunks()` and `sandbox.resetChunks()` rebuild the world.
  - `applyMap()` in game.js runs on join, on roster changes outside a match, and at match start. It rebuilds local cars, because their springs are tuned to gravity.
  - Room setting `map`: the server only allows changes outside a match, and lists the map in `/rooms`. Names are in `MAP_LIST` (catalog.js).

- **In-game polish:**
  - ≡ is now a `.rl-card` with chips: `#optMap` (solo), `#optBots` / `#optTime` / `#optPrivate` (rooms), `#optPalette`, `#optStats`.
  - Solo map: picked under the menu (`#soloMap`, saved as `hsg.soloMap`, previewed with `game.previewMap`) or from ≡.
  - Off-screen arrows: `updatePointers()` in game.js, `#pointers`.

- **Spooky maps:**
  - `src/spooky.js` has the meshes.
  - Sandbox: `skeleton` props walk by direct steps (feet friction would just tip them), are held upright unless stunned by a hit, and shatter (`shatter()`) into `bone` props. Synced as world extra `-10-part`.
  - `pumpkin` props `splat()`, sent as a `splat` message.
  - Thrown hits go through `hooks.thrownHit` (host) and `shoveCar` to the owner.
  - Maps `graveyard` and `hallow`; chunk types graves, crypt, patch, village, mansion.
- **Per-map audio:** `SCENES` in audio.js (track list, ambience bed loaded lazily, far-off calls); `setScene()` is called from `applyMap`.
- **Sync:** the audit and crowd tests pass with 8 cars and with lag. Quiet cars stay on screen as *away* for 30 s instead of being removed after 4 s; that was the likely cause of "the other player goes invisible".
- **HUD:** trimmed to the essentials.

## Test results (headless Chrome)
All of these pass:
- **endless:** ±1.8 km, 60 fps, bounded memory.
- **vehicles:** all 11 rides.
- **mods:** every rig and gadget.
- **hands:** grab, throw, a barrel, and the two-player tear seen on both screens.
- **toys:** teeter, tornado, arch. The arch check can flake when barrels pulled by the arch blow up the test car.
- **garage:** desktop, phone and landscape.
- **menu:** the lobby fits every screen.
- **damage:** every damage source between two players, plus the kill credit.
- **rooms**, **leave**.
- **audio:** also passes on the static itch build served from a subfolder.
- **loadtime.**
- **newmods:** 10 checks. **match:** 14 checks, passing on three runs in a row.
- **rooms (lobby):** 19 checks with 5 players. **menu:** 25 checks. **maps:** 27 checks. **ingame:** 18 checks. **spooky:** 13. **syncaudit:** 24. **crowd:** 8 cars, with and without lag.
- **mp:** with `NOBOTS=1`.
- **mpmods:** loadout sync, glove and ball hits across the network.

## Still to do
- **CrazyGames launch (2026-11-25):**
  - Done: `src/portal.js` plus `npm run crazygames` (see the README). Checked against the SDK in `local` mode: gameplay start/stop, muteAudio, invite link into a room, no fullscreen button, no sign-in.
  - Build with `VITE_SERVER_URL=wss://<railway app> npm run crazygames` and upload `release/fogbash-crazygames.zip`.
  - Railway: keep `CORS_ORIGINS` unset, or allow the CrazyGames origins. Give `HSG_DATA` a volume, or accounts reset on every deploy.
  - Progress uses CrazyGames' Data Module, so pick "Yes, using the Data Module" on the submission form.
  - Also built: midgame ads at breaks, happytime on a match win, the INVITE FRIENDS button with CrazyGames' invite button, joining an invite while busy, and the 2–8 lobby size (min checked by the server).
  - Untested on the real portal: instant multiplayer, the join-invite listener, real ads.
- **Launch-prep fixes (2026-11-25):**
  - F toggled fullscreen as well as firing the crate power-up. F is now only the power-up.
  - Esc on the title menu or in a room's lobby opened the in-game ≡ card. It now opens only while driving; P opens it too.
  - A join that finished after the 6 s timeout stayed in the room as a ghost (for CREATE, a ghost-hosted room in the JOIN list). Now it leaves, and the timeout is 8 s.
  - Music on iPhone: two reused `<audio>` elements are started on the first tap, so later tracks no longer need a second tap.
  - The "No game server" message now reads like a player message, not a dev command.
  - The server ignores non-object messages, which would throw on `.from`.
  - A WebGPU start that hangs (seen with several WebGPU tabs in Chrome) left the loading screen stuck forever. After 8 s it now falls back to WebGL 2 on a fresh canvas.
  - Physics steps with the frame's dt (3 substeps), so feel can differ a little between 60 Hz and 144 Hz screens (square-wheel thump is weaker at 144 Hz). A fixed timestep with interpolation would make it identical; it wasn't changed on launch day.
  - Playtests on Windows used software GL at ~3 fps (`--use-angle=metal` is Mac-only), and the timing checks failed. `lib.mjs` now picks d3d11/metal/vulkan. syncaudit needs 60 s matches (see its header).
- **Listen on real devices:** check the engine loop's pitch range, the crash variety and the music levels against the effects. Confirm iPhone music now starts on the first tap.
- **Host leaving closes the room,** and a host with the tab in the background freezes props and bots for everyone, since the host simulates them. Host hand-over or a server-side world would fix both.
- **Brief disconnects** (phones switching network) drop you to the menu. Colyseus reconnection (`allowReconnection`) would keep the seat.
- **Feel check on devices:** balloon bounce, square-wheel thump, smoke size, oil spin strength, magnet climb strength.
- **Golden Hat mode** (from the idea list) wasn't built; timed matches took its place.
- **Commit and push** this work.
- **Hands-on feel pass on real devices:**
  - spider adhesion, pogo rhythm, hover braking
  - the Hands' grab reach (4.6 m) and the 6 s hold limit
  - tornado strength
- **Hats moved:** the 12 hats now sit on generated stunt spots (`HAT_SPOTS` in `gen.js`). Check each is reachable.
- **Shop balance:** watch whether 50–300 prices against `EARN` feel right after launch. Think about a daily bonus.
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

# FOGBASH

Drop-in/drop-out multiplayer demolition for up to **8 tiny headlight buggies**, seen from the side
in an endless, foggy glade. Everything is a black silhouette against layered grey-teal mist. The only
colour comes from headlight beams and amber explosions. There are no timers, no rounds and no
monsters. You smash things, get smashed, and respawn two seconds later after your hat pops off
like a cork.

Built on **PlayCanvas** (WebGL 2 + WebGPU). Multiplayer runs on **Colyseus** (MIT, self-hosted).
All sounds and music are recorded **CC0 (public domain)** assets from Kenney and OpenGameArt, so there
are no copyright strings attached. Sources are listed in `public/audio/CREDITS.txt`.

```bash
npm install
npm run play       # build + start the game server on http://localhost:2567 (online + solo)
npm run dev        # Vite dev server (solo with bots, or add ?server=ws://localhost:2567)
npm run server     # just the Colyseus server (serves dist/ too)
npm run itch       # static build zip for itch.io: release/fogbash-web.zip
VITE_SERVER_URL=wss://<railway-app> npm run crazygames   # CrazyGames zip: release/fogbash-crazygames.zip
```

## CrazyGames
`npm run crazygames` builds into `dist-crazygames/` with `VITE_PORTAL=crazygames` and zips it. Only `src/portal.js` differs; it's a no-op in every other build.
- **SDK v3** is in `<head>` (added by `vite.config.js`). `init()` runs during loading (5 s cap). `loadingStart` / `loadingStop` wrap the loading screen.
- **gameplayStart / gameplayStop** follow actual driving. They stop for the ≡ menu, the garage, the room's lobby and the results.
- **muteAudio** is respected (`sfx.setMuted`).
- **No custom fullscreen** (button, touch re-entry): CrazyGames provides it.
- **No name/password sign-in.** A signed-in CrazyGames player's name is used instead.
- **Progress (coins, purchases, garage)** is saved with CrazyGames' **Data Module** (`portalStorage()` in `portal.js`, used by `account.js`). It stays in the browser for guests and follows signed-in players to every device. A profile already saved in the browser moves over the first time.
- **On the submission form:** pick "Yes, using the Data Module" for progress save. Otherwise the module is off and the game falls back to `localStorage`.
- **Multiplayer:**
  - The room code button copies an invite link (`?room=` in `czy_invite_params`).
  - Opening an invite joins that room, and instant multiplayer creates a private room.
  - `updateRoom` / `leftRoom` keep CrazyGames informed.
- **The game server** must be reachable from crazygames.com: leave `CORS_ORIGINS` unset on Railway, or add the CrazyGames origins to it.
- **Local check:** serve `dist-crazygames` on localhost, where the SDK runs in `local` mode (`?muteAudio=true` works there).

The menu has three buttons. **PLAY** drops you into a solo glade with bots, on the map shown under the buttons (‹ › picks Endless Glade, The Glade, Moon Crater, The Bog or The Quarry; the world behind the menu switches to show it). **CO-OP** is for rooms:
- **JOIN:** lists the public rooms (host name, players, waiting or playing). Tap one to join it. For a private room, type its code.
- **CREATE:** choose the **MAP**, **PUBLIC** (listed under JOIN) or **PRIVATE** (code only), the **bots** (0, 2, 4 or 6) and the **minutes**, then CREATE ROOM.
- **The room's lobby:** everyone waits here first, not in the glade.
  - It shows who's in the room (the host is marked) and the code (tap it to copy). There's a GARAGE button to pick your ride.
  - **Colours:** each player picks one. Two or more players on the same colour are a **team**: teammates can't hurt each other, and the team's smashes add up.
  - The host can change public/private, bots and minutes, then presses **START**. Everyone drops into the glade together.
  - Someone who joins while a match is on gets **DRIVE IN**.
  - When a match ends, the results show and everyone goes back to the lobby. The host presses **START NEXT MATCH**.
- **Bots:** there are none unless the host adds them.
- **In a room**, cars wear the room colour; your garage paint is used in solo.
- **Hosting:** the host owns the room. If the host leaves, everyone returns to the menu.

**Maps (rooms):** four arenas, each about 380 m wide with cliffs at both ends, so a match never spreads out. Solo PLAY stays the endless glade.
- **The Glade:** meadows, a pond, the camp and the shrine bowl. The classic.
- **Moon Crater:** **low gravity (0.42 g)** under a huge misty moon. Three wide craters and ramp fields: cars and props fly a long way.
- **The Bog:** four wide, deep ponds with geysers, and woods full of dead trees that snap into floating logs.
- **The Quarry:** boulder mesas, ruins with a magnet arch, and yards stacked with oil barrels.

- **The Graveyard:** skeletons with ember eyes shuffle between the graves. They don't attack, but they get in your way. Ram one hard (about 6.5 m/s or more, or a blast) and it **shatters into bones**: a skull, the ribs and four long bones. The robot arm and Grabby Hands can pick those up and **throw them at rivals**. Grab a whole skeleton and it shatters where it lands. Skeletons climb back out of their graves later. The scenery has tombstones, crosses, iron railings, crypts and a chapel.
- **Hallowe'en Hollow:** a haunted village with crooked houses and lit windows, scarecrows, lantern posts, bats and a mansion on the hill, under a huge moon. Pumpkins, glowing jack-o'-lanterns and melons sit everywhere. Ram them and they **splat**, or grab one and **throw it**. They grow back.
- **Throwing:** anything thrown that hits a car hurts it, and the hit is credited to the thrower (skeleton 34, pumpkin 20, bone 12). The host judges the hit and the victim's owner applies it.

The host picks the map in CREATE or in the room's lobby (between matches only), and everyone's world switches with it. Solo picks one under PLAY or from ≡. The JOIN list shows each room's map. Every map has its own silhouettes: forest, moon crags, drowned trees and reeds, cranes and terraces, graves, or a haunted village. The fog, palette and amber glows stay the same.

**Music and sound per map:** each map plays its own track (all CC0) over its own ambience.
- Graveyard: Moonlit Lullaby, crickets and crows.
- Hallowe'en: A Wonderful Nightmare, crickets and crows.
- Moon: Observing the Star, space winds.
- Bog: Creepy Forest, swamp.
- Quarry: Factory ambiance, machinery hum and distant clangs.
- Glade: its two tracks over the wind.

**Timed matches (CO-OP):**
- Every room plays matches of **6, 8, 10 or 12 minutes**. You choose the length in CREATE; the host can change it in the room's lobby or from ≡ (it applies from the next match).
- The clock sits at the top of the screen. **Most smashes when it hits 0:00 wins.** Bots count as players.
- The results show for 12 seconds (smashes then don't count), then everyone is back in the room's lobby, and scores start from zero next match.
- **Teams:** the results add up each colour's smashes, and the best team (or player) wins.
- **Coins:** the winner earns 100, second or third earns 40, and everyone who played to the end earns 15.
- The server runs the phases and the clock (lobby → playing → results → lobby; `GladeRoom.startMatch` / `endMatch`), so every screen agrees.
- Solo PLAY stays endless.

**GARAGE** is where you kit out your ride: tabs RIDE, WHEELS, ROOF, BUMPER, PAINT and HAT. Tap something and the car wears it at once. Rubber tires and sawblades get a SIZE slider. Anyone on your Wi-Fi can join `http://<your-ip>:2567`. Bots run on the room host's browser. The garage is also in the ≡ settings mid-game.

## The glade (endless)
The glade goes on forever in both directions. It is generated from a seed in 64 m chunks
(`src/gen.js`), so every browser builds the same hills without being sent them. Only the chunks
near a player exist: scenery streams in ahead of the camera, and props live only near drivers.
The hills grow taller the further you drive from camp. Fresh buggies drop in near other drivers,
and bots stay with the humans, so the fights never spread out.

Chunk types:
- **Camp:** the start.
- **Meadows:** ramps, oil barrels, dead trees that snap into logs, gadget crates, cage-balls, teeter-totters and wandering **tornadoes**.
- **Ponds:** buggies float and paddle; three **geysers** launch anything above them.
- **Shrine bowls:** a half-pipe between two pillars.
- **Big Hill-Climb hills.**
- **Boulder mesas:** drive in below the ledge and the boulders roll.
- **Ruins:** a **magnet arch** that yanks every loose barrel and car into the air every 14 s.

**12 hats** sit on stunt spots spread through the glade.

## Accounts, coins and the garage
- **Accounts:** you play straight away as a guest. Register a name and password any time from the account chip (top right) to keep your garage on every device; the guest's progress moves into the new account.
- **Coins:** you earn them for smashes, distance, flips, air time, crates, barrels and hats. The server caps how fast coins can be credited.
- **GARAGE:** on the menu, or from ≡ in-game. It shows a live preview of the car. Tap an item you own to equip it; a locked one shows its price and a BUY button.
- **Prices:** cheap on purpose, so everyone can buy things. You start with 200 coins.
  - Rides cost 50–300 (the Mudrunner is free), wheels 50–250, roof gadgets 100–250, bumper gadgets 50–150.
  - Hats cost 50 (or find them), and the Monster-Scale tire upgrade costs 100. Paint is always free.
  - Prices and coin rewards live in `src/catalog.js`. Set `FREE_FOR_NOW = true` there to make everything free again.
- **Storage:** accounts, coins, purchases and setups live in `server/data/accounts.json` (git-ignored). Passwords are scrypt-hashed and tokens are stored hashed. Without a server (the itch build) the profile is kept in the browser.

**Paint:**
- Cars, rigs and gadgets are painted in muted, dusty colours, lit only by the foggy sky and headlights.
- The shader adds wear: grime, scratches and dirtier lower edges.
- Pick one of 8 paints in the garage's PAINT tab, or keep your seat's team colour.
- The world itself stays pure silhouette.

**11 rides:** Mudrunner, Bathtub Racer, Old Tractor, Monster Hopper, Lantern Hearse, Bone Trike, Coffin Kart, Shrine Dozer, Wheelbarrow Kart, Iron Steam-Roller (crushes cars it lands on) and Cage Bus.

**Wheels** (how you move):
- **Rubber tires**, with a size slider from 25% to 250%. Giant tires crush rivals.
- **Centipede Treads:** grip.
- **Pogo Coils:** bounce, and stomp anyone you land on.
- **Spider Rig:** eight legs that cling to slopes.
- **Sawblades:** cut trees and bumpers.
- **Hover Thrusters:** glide over ponds.
- **Balloon Tires:** huge, soft and bouncy, and they float across ponds. A big hit pops them and you limp on the rims until you respawn; everyone sees the pop.
- **Magnet Wheels:** cling to cars, barrels and rocks. Drive into a rival and you climb up and ride on their roof.
- **Square Wheels:** wooden blocks. Thump-thump on the flat (each corner lifts the car), but the edges bite into rough ground.

**Roof gadget (E):**
- **Robot Arm:** auto-grabs barrels, boulders and logs; E throws.
- **Grabby Hands:** grab rival cars, bombs and barrels and throw them. Two players' hands on the same car **tear it in two**.
- **Wrecking Ball:** hangs from a roof crane; E heaves it over the roof to slam down in front.
- **Magnet Coil:** E pulls cars and barrels in and holds them over your roof; E again blasts them out.
- **Firework Mortar:** four rockets.
- **Party Balloon:** glide, and drop bombs.

**Bumper gadget (Q):**
- **Boxing Glove:** punch.
- **Grapple Harpoon:** auto-aims at the nearest car, tree or prop ahead; it reels you in, Q lets go.
- **Cow-Catcher:** passive; scoops things up and over.
- **Ember Jets:** fire from both sides.
- **Ejector Seat:** parachute out while your empty car rams on and blows up.
- **Smoke Bomb:** a thick bank of fog behind you. Cars inside it vanish from everyone else's screen, name tag and all, and bots lose your trail.
- **Oil Slick:** dumps a black puddle behind you. Anyone who drives through it loses grip and spins out (it doesn't catch you for the first moment).

Gadget crates still give a temporary power-up for 25 s:
- **Bomb-Dropper**, **Shockwave Horn** and **Spring-Hop** fire with F.
- **Rocket-Boost** and **Mega-Plow** work by themselves.

## Sound and music
- **Music:** a calm menu track, and two moody glade tracks that alternate in-game. They are streamed rather than decoded into memory, and crossfade when they change.
- **Effects:** crashes are layered metal, thump and rattle recordings with random pitch so no two sound the same. Also explosions with a rolling tail, splashes, springs, clangs, a horn for each ride and a recorded engine loop that revs with the throttle. A wind bed plays under everything.
- **Horns:** every ride has its own (`HORNS` in `src/audio.js`). Mudrunner: car horn. Coffin Kart: small high beep. Old Tractor: meep-meep. Cage Bus: two-tone. Monster Hopper: air-horn chord. Bathtub Racer: rubber-duck squeak. Wheelbarrow Kart: clown honk-honk. Bone Trike: bicycle bell. Lantern Hearse: funeral bell. Shrine Dozer: gong. Iron Steam-Roller: steam whistle.
- **Positional:** every sound pans and fades with distance from the camera, through one shared foggy reverb.
- **Volume:** MUSIC and SOUND sliders in ≡ settings, saved per browser.
- **Unlocking:** the first tap or key press starts the audio (browsers require a gesture). The sound effects (about 400 KB) download in the background while the menu is up.
- **Code:** `src/audio.js`. If a file ever fails to load, a small synthesised stand-in plays instead.

## Loading and size
- **First visit:** the menu is ready after **388 KB**. Measured times: 0.9 s on Wi-Fi, 1.5 s on 4G, 3.3 s on slow 4G (`scripts/playtest/loadtime.mjs`). PLAY → driving is instant, because the world is built during loading.
- **Our server:** compresses text with brotli or gzip (cached in memory) and supports byte ranges for audio (Safari needs them).
- **itch.io zip:** about 6.3 MB and 56 files.
- **Platform limits:** CrazyGames allows ≤ 20 MB initial download for the mobile homepage, ≤ 250 MB total and ≤ 1500 files. itch.io allows ≤ 1000 files.

## In the glade
- **≡ menu:** the same compact card as the other menus.
  - GARAGE, and LEAVE (tap twice; in a room you host, it closes the room).
  - Solo: a MAP row that switches the map on the spot.
  - In a room: the code, and for the host BOTS / MINUTES / PUBLIC-PRIVATE.
  - MUSIC and SOUND, quality, colour or mono, stats, and a fold-out CONTROLS list.
  - The renderer isn't a setting. The game picks it: WebGPU on desktops that have it, WebGL 2 on phones and everywhere else. WebGPU falls back to WebGL 2 if it fails or hangs. `?gpu=webgl2|webgpu` forces one for testing.
- **The corner** shows only your smashes and place. The endless glade also shows hats. Controls hints appear only on your first two drives, and coin pops only for big things.
- **A player gone quiet** (their phone switched apps) stays on screen marked *away* for up to 30 s, instead of vanishing. A real leave is announced at once.
- **Arrows to rivals:** a chevron at the screen's edge points at each car you can't see (nearest 7), with its distance in metres.
  - It's in the car's room colour; solo uses amber.
  - Teammates' arrows are faint. Close rivals' arrows pulse.
  - Cars hidden in smoke get no arrow.

## Controls
- **Keyboard:**
  - A/D or the arrow keys drive. Pressing the other way brakes, then turns the buggy around.
  - W or Shift boosts. Space hops.
  - In the air the buggy steadies itself for the landing. Press against the way you face to backflip.
  - **E** fires the roof gadget, **Q** the bumper gadget, F a crate power-up.
  - H honks and L flashes your headlights. R flips the car upright.
  - Hold Tab for the scores. The mouse wheel zooms. Esc or P opens settings (and the garage) once you're driving.
- **Touch:** ◀ ▶ pedals, plus BOOST, HOP, ROOF, BUMPER, POWER, HONK and FLIP. Gadget buttons appear when something is fitted.
- **Gamepad:** left stick or d-pad to drive, RT/RB to boost, A to hop, X for the roof gadget, B for the bumper gadget, Y to honk, LB to flash your headlights, Start to flip.

## Netcode
- Each client simulates its own car and sends 20 Hz snapshots, stamped with its own clock. Each receiver
  estimates the clock offset per sender and replays other cars 100 ms in the past between the two
  snapshots around that moment, extrapolating at most 120 ms when one is late. Respawns snap
  instead of sliding.
- The room's **host** (the oldest player) simulates every prop and broadcasts world snapshots
  (only moved bodies, plus a full sync every 2 s).
- Clients report hits on props as impulses. Explosions are decided by the host and broadcast to
  everyone.
- Gadget hits on another car (punches, wrecking balls, grabs, throws) are sent to that car's owner,
  who applies them; bots belong to the host. A tear needs two different grabbers.
- **The room belongs to its host** (the player who opened it). If the host leaves, the room closes and
  everyone returns to the menu with the reason. If a guest leaves, only their car goes.

URL flags: `?gpu=webgl2|webgpu`, `?stats`, `?server=wss://…`, `?room=CODE`,
`?autostart&mode=solo&veh=kart`, `?bots=0..7`. API: `/api/*` (accounts), `/rooms` (open glades).

## Playtests
Headless checks driven through the system Chrome (`playwright-core`). Start `npm run play` first.
Screenshots go to `$HSG_SHOTS` (default: a `hsg-shots` folder in the system temp directory).

| Script | Checks |
|---|---|
| `endless.mjs` | ±1.8 km of endless world: ground, streaming stays bounded, fps, bots keep up |
| `vehicles.mjs` | all 11 rides: ride height, ramp and boosted jumps, turn-around, hop, bowl, pond, mesa |
| `mods.mjs` | every undercarriage drives, tire sizes, pogo leaps, every gadget fires, the arm grabs and throws |
| `tools.mjs` | every tool does its job against a parked bot: punch, slam, magnet pull + blast, mortar, balloon float, harpoon reel, cow-catcher, ember jets, arm, hands |
| `gadgetlook.mjs [ride] [ids]` | close-up screenshots of each tool at rest, firing and facing the other way |
| `hands.mjs` | Grabby Hands: lift and throw a rival, grab a barrel, two players tear a car in two (both see it) |
| `toys.mjs` | teeter-totter tips, tornado lifts, magnet arch pulls |
| `garage.mjs` | garage and accounts on desktop, phone and landscape: panel fits, tap-to-equip, no locked cards, tire slider, paint, register / sign out / sign in, drive in the setup |
| `sync.mjs` | 2 players: per-frame smoothness of remote cars and bots (max jump, teleports, rebuilds), pond water on both |
| `syncprops.mjs` | the host rams props; the guest's copies move smoothly and end where the host has them |
| `leave.mjs` | a guest leaving keeps the room; the host leaving closes it and sends everyone to the menu |
| `rooms.mjs` | rooms and their lobby with 5 players: CREATE public/private, JOIN list, join by code, a wrong code, colour teams (no friendly fire), the host's START, no bots by default, DRIVE IN mid-match, back to the lobby after the results, START NEXT MATCH, the host adds bots. Needs the short-match server (below) |
| `menu.mjs` | menu chips; the lobby fits every screen with no extra buttons; tap an open glade to join; CREATE; the in-game garage |
| `mp.mjs` | 2 players: roster, host, bots, sync, guest barrel hit, host hand-over (`NOBOTS=1` for a calm run) |
| `ingame.mjs` | the solo map picker (menu and ≡), the compact ≡ card on desktop / phone / landscape, LEAVE asks first, arrows point at rivals off both sides |
| `spooky.mjs` | Graveyard: skeletons walk, a ram shatters one into bones, a thrown bone hurts a rival, skeletons rise again. Hallowe'en: pumpkins splat, a thrown pumpkin hurts. Screenshots |
| `syncaudit.mjs` | 2 to 3 players, after START, driving, a ride change, smoke, eject, wreck, a map change, a colour change, the next match, a late joiner and a player going quiet: every car seen, drawn, never rebuilt, in the right place |
| `crowd.mjs [n]` | n players + 2 bots in one room driving about (`LAG=1`: half on a laggy link): every screen sees every car, scores agree, fps |
| `maps.mjs` | each map loads its layout and gravity (Moon Crater falls at 0.42 g), the cliffs stop you, spawns stay inside; the host switches the map in the lobby and the guest follows; START plays it. Needs the short-match server |
| `newmods.mjs` | balloon tires (drive, pop to the rims, float on a pond), magnet wheels climb onto a car, square wheels thump, oil spins a car out, smoke hides a car and bots lose it |
| `match.mjs` | timed matches with 2 players: the clock agrees, a smash scores, results show the same winner on both, no scoring in the break, the next match resets. Also the balloon pop, oil and smoke across the network. Needs `PORT=2568 MATCH_MS=30000 MATCH_BREAK_MS=5000 node server/index.js` |
| `mpmods.mjs` | loadouts sync, boxing glove and wrecking ball hit across the network |
| `damage.mjs` | every damage source between two players (ram, glove, ball, jets, mortar, mine, saw, stomp, barrel, hands throw) lands on the victim's own screen; kill feed, score and coins |
| `soak.mjs 60 <ride> drive` | bots for a minute: fps, wrecks, scores, stuck bots, errors |
| `colors.mjs` | paint: garage close-ups, the PAINT tab, painted scenes on WebGL2 and WebGPU |
| `audio.mjs` | every sound decodes; menu music on the first tap, glade music on PLAY; the engine revs; game events use recordings (no fallbacks); volume sliders |
| `loadtime.mjs` | first-visit load on Wi-Fi / 4G / slow 4G: time and bytes to the menu, PLAY → driving |
| `phone.mjs` | portrait + landscape phone layout, touch driving, overlapping buttons |
| `shot.mjs`, `trace.mjs`, `stuck.mjs` | a screenshot; a suspension timeline; stuck-bot dumps |

Run them as `node scripts/playtest/<script>`.

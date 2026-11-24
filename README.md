# HEADLIGHT: SMASH GLADE

Drop-in/drop-out multiplayer demolition for up to **8 tiny headlight buggies**, seen from the side
in an endless, foggy glade. Everything is a black silhouette against layered grey-teal mist. The only
colour comes from headlight beams and amber explosions. There are no timers, no rounds and no
monsters. You smash things, get smashed, and respawn two seconds later after your hat pops off
like a cork.

Built on **PlayCanvas** (WebGL 2 + WebGPU). Multiplayer runs on **Colyseus** (MIT, self-hosted).
Every sound is synthesised at runtime, so there are no audio files.

```bash
npm install
npm run play       # build + start the game server on http://localhost:2567 (online + solo)
npm run dev        # Vite dev server (solo with bots, or add ?server=ws://localhost:2567)
npm run server     # just the Colyseus server (serves dist/ too)
npm run itch       # static build zip for itch.io: release/headlight-smash-glade-web.zip
```

The menu has three buttons. **PLAY** drops you into a solo glade with bots. **CO-OP** opens the lobby,
which has two tabs:
- **JOIN:** type a friend's code, tap an open public glade, or leave it empty for the public glade (which fills empty seats with bots).
- **CREATE ROOM:** makes a private room with a code to share (**COPY**, **NEW**). Choose **bots**: none, 2, 4 or fill seats. Choose whether it's **hidden from the open list**.
  - The settings live on the server, so they survive a host hand-over.
  - The host can change bots and privacy mid-game from ≡; the room code is shown there to invite people.
**GARAGE** is where you pick and kit out your ride. Anyone on your Wi-Fi can join `http://<your-ip>:2567`. Empty seats are
filled by bots, which run on the room's host browser. The garage is also in the ≡ settings mid-game.

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
- **GARAGE:** on the menu, or from ≡ in-game. It shows a live preview of the car: try anything on, then buy and equip it.
- **Free for now:** everything is free while `FREE_FOR_NOW` is on in `src/catalog.js`. Flip it to `false` to turn prices back on.
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

Gadget crates still give a temporary power-up for 25 s:
- **Bomb-Dropper**, **Shockwave Horn** and **Spring-Hop** fire with F.
- **Rocket-Boost** and **Mega-Plow** work by themselves.

## Controls
- **Keyboard:**
  - A/D or the arrow keys drive. Pressing the other way brakes, then turns the buggy around.
  - W or Shift boosts. Space hops.
  - In the air the buggy steadies itself for the landing. Press against the way you face to backflip.
  - **E** fires the roof gadget, **Q** the bumper gadget, F a crate power-up.
  - H honks and L flashes your headlights. R flips the car upright.
  - Hold Tab for the scores. The mouse wheel zooms. Esc opens settings (and the garage).
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
| `garage.mjs` | garage and accounts: previews, equipping, tire slider, register / sign out / sign in, drive in the setup |
| `sync.mjs` | 2 players: per-frame smoothness of remote cars and bots (max jump, teleports, rebuilds), pond water on both |
| `syncprops.mjs` | the host rams props; the guest's copies move smoothly and end where the host has them |
| `leave.mjs` | a guest leaving keeps the room; the host leaving closes it and sends everyone to the menu |
| `rooms.mjs` | private rooms: create with no bots, not listed, join by code, host turns bots on (guests can't), public glade still fills |
| `menu.mjs` | menu chips, lobby + open glades, JOIN, the in-game garage |
| `mp.mjs` | 2 players: roster, host, bots, sync, guest barrel hit, host hand-over (`NOBOTS=1` for a calm run) |
| `mpmods.mjs` | loadouts sync, boxing glove and wrecking ball hit across the network |
| `soak.mjs 60 <ride> drive` | bots for a minute: fps, wrecks, scores, stuck bots, errors |
| `colors.mjs` | paint: garage close-ups, the PAINT tab, painted scenes on WebGL2 and WebGPU |
| `phone.mjs` | portrait + landscape phone layout, touch driving, overlapping buttons |
| `shot.mjs`, `trace.mjs`, `stuck.mjs` | a screenshot; a suspension timeline; stuck-bot dumps |

Run them as `node scripts/playtest/<script>`.

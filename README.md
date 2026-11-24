# HEADLIGHT: SMASH GLADE

Drop-in/drop-out multiplayer demolition for up to **8 tiny headlight buggies**, seen from the side
in one long, foggy glade. Everything is a black silhouette against layered grey-teal mist. The only
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

Anyone on your Wi-Fi can join `http://<your-ip>:2567`. Players who type the same **ROOM** code
share a glade. Empty seats are filled by bots, which run on the room's host browser.

## The glade
One lane, 240 m long, walled by fog at both ends. From west to east:
- **A rock-slide hill.** Boulders wait on a ledge and roll down when you drive in below them.
- **Ramps.** Five of them, each with a drivable back slope.
- **The pond.** Buggies float and paddle across. Three **geysers** launch anything sitting over them.
- **Oil barrels.** They blow up when rammed hard, and set off chain reactions. Props respawn every 20 s.
- **Dead trees.** They snap when rammed (or creak over if you keep pushing) and become rolling logs.
- **The cage-ball.** It explodes after 5 hits.
- **The shrine bowl.** A steep half-pipe between two shrine pillars.
- **Gadget crates.** Each gives one of five gadgets for 25 s:
  - **Bomb-Dropper**: lays mines behind you.
  - **Rocket-Boost**: unlimited boost.
  - **Mega-Plow**: launches anyone it hits.
  - **Shockwave Horn**: blasts nearby cars and props away.
  - **Spring-Hop**: huge hops, even mid-air.
- **12 secret hats.** Each one is a small stunt: a boosted ramp jump, a pillar top, the pond floor,
  a geyser ride. Found hats are saved and can be picked in the garage.

## 8 vehicles
| Vehicle | Character |
|---|---|
| Mudrunner | All-rounder |
| Bathtub Racer | Light and fast, gets flung far |
| Old Tractor | Torque, giant rear wheels |
| Monster Hopper | Soft springs, big air |
| Lantern Hearse | Long, heavy battering ram |
| Bone Trike | Three wheels, twitchy |
| Coffin Kart | Low and grippy |
| Shrine Dozer | Slow, and its stone blade launches cars |

## Controls
- **Keyboard:**
  - A/D or the arrow keys drive. Pressing the other way brakes, then turns the buggy around.
  - W or Shift boosts. Space hops.
  - In the air the buggy steadies itself for the landing. Press against the way you face to backflip.
  - E uses your gadget, H honks and L flashes your headlights. R flips the car upright.
  - Hold Tab for the scores. The mouse wheel zooms.
- **Touch:** ◀ ▶ pedals, plus BOOST, HOP, GADGET, HONK and FLIP buttons.
- **Gamepad:** left stick or d-pad to drive, RT/RB to boost, A to hop, X for the gadget, Y to honk,
  LB to flash your headlights, B/Start to flip.

## Netcode
- Each client simulates its own car and sends 20 Hz snapshots. Other cars are shown with 110 ms
  interpolation.
- The room's **host** (the oldest player) simulates every prop and broadcasts world snapshots
  (only moved bodies, plus a full sync every 2 s).
- Clients report hits on props as impulses. Explosions are decided by the host and broadcast to
  everyone.
- If the host leaves, the next-oldest player takes over and the bots move with them.

URL flags: `?gpu=webgl2|webgpu`, `?stats`, `?server=wss://…`, `?room=CODE`,
`?autostart&mode=solo&veh=kart`, `?bots=0..7`.

## Playtests
Headless checks driven through the system Chrome (`playwright-core`). Start `npm run play` first.
Screenshots go to `$HSG_SHOTS` (default: a `hsg-shots` folder in the system temp directory).

| Script | Checks |
|---|---|
| `node scripts/playtest/vehicles.mjs` | all 8 vehicles: ride height, ramp jump, boosted jump, turn-around, hop, bowl exit, pond crossing, hill climb |
| `node scripts/playtest/hats.mjs <vehicle>` | every hat can be collected with its stunt |
| `node scripts/playtest/mp.mjs` | 2 players: roster, host, bots, car and prop sync, guest barrel hit, host hand-over (`NOBOTS=1` for a deterministic run) |
| `node scripts/playtest/soak.mjs 60 <vehicle> drive` | bots for a minute: fps, wrecks, scores, stuck bots, errors |
| `node scripts/playtest/phone.mjs` | portrait + landscape phone layout, touch driving, overlapping buttons |
| `node scripts/playtest/shot.mjs <name> [query]` | a screenshot plus state |
| `trace.mjs`, `jumps.mjs`, `stuck.mjs` | debugging timelines: suspension, jump apexes, stuck bots |

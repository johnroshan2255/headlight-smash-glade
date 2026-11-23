# HEADLIGHT: SMASH GLADE

Drop-in/drop-out multiplayer demolition for up to **8 tiny headlight buggies** in a foggy,
monochrome forest where only the explosions are amber. There are no timers, no rounds and no
monsters. You smash things, get smashed, and respawn two seconds later after your hat pops off
like a cork.

Built on **PlayCanvas** (WebGL 2 + WebGPU) with an optional ASCII view. Multiplayer runs on
**Colyseus** (MIT, self-hosted). Every sound is synthesised at runtime, so there are no audio files.

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
- **Oil barrels** blow up when hit hard and set off chain reactions. Props respawn every 20 s.
- **Dead trees** snap when rammed and become rolling logs.
- **Boulder ramps** and **rock-slide traps**.
- **Pond geysers** launch anything parked on top of them.
- **The cage-ball** explodes after 5 hits.
- **The shrine** is a stunt bowl.
- **Gadget crates** give one of six gadgets for 25 s:
  - **Bomb-Dropper**: lays mines behind you.
  - **Rocket-Boost**: unlimited boost.
  - **Mega-Plow**: launches anyone it hits.
  - **Shockwave Horn**: blasts nearby cars and props away.
  - **Spring-Hop**: jumps.
  - **ASCII Glitch-Bomb**: forces nearby rivals into ASCII view for 10 s.
- **12 secret hats** are hidden around the map. Each one is saved once found and can be picked in the garage.

## 8 vehicles
| Vehicle | Character |
|---|---|
| Mudrunner | All-rounder |
| Bathtub Racer | Light and fast, gets flung far |
| Old Tractor | Torque, giant rear wheels |
| Monster Hopper | Soft springs, big air |
| Lantern Hearse | Long, heavy battering ram |
| Bone Trike | 3 wheels, twitchy |
| Coffin Kart | Low, grippy, drift king |
| Shrine Dozer | Slow, and its stone blade launches cars |

## Controls
- **Keyboard:**
  - Drive with WASD or the arrow keys. Shift boosts and Space drifts.
  - E uses your gadget and H honks. Hold L to flash your headlights.
  - R flips the car upright. Hold Tab for the scores. V toggles the ASCII view.
- **Touch:** left stick to drive, plus BOOST, DRIFT, GADGET, HONK and FLIP buttons.
- **Gamepad:**
  - RT/LT to drive and the left stick to steer.
  - A boosts and B drifts. X uses your gadget and Y honks.
  - RB flashes your headlights and Start flips the car.

## Netcode
- Each client simulates its own car and sends 20 Hz snapshots. Other cars are shown with 110 ms
  interpolation.
- The room's **host** (the oldest player) simulates every prop and broadcasts world snapshots
  (only moved bodies, plus a full sync every 2 s).
- Clients report hits on props as impulses. Explosions are decided by the host and broadcast to
  everyone.
- If the host leaves, the next-oldest player takes over and the bots move with them.

URL flags: `?gpu=webgl2|webgpu`, `?stats`, `?server=wss://…`, `?room=CODE`, `?autostart&mode=solo&veh=kart`.

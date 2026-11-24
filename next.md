# next.md: where Smash Glade is and what's next

_Last session: 2026-11-24. The side-view rebuild is playable and tested. Next: hands-on feel tuning and the itch page._

## Where we are
The game is now a **2D side-scroller**. It copies the loading screen's look:
- black silhouettes
- layered grey-teal fog
- the radial misty sky
- colour only from **headlight beams** and **amber explosions**

The layout is one lane about 240 m long (x = -120 to 120), with fog walls at both ends. The camera follows your buggy and keeps it low in the frame.

The **ASCII view is switched off** (at the user's request), as code comments rather than deleted. To bring it back, search for `ASCII view off` in `src/game.js`, `src/input.js`, `src/layout.js` (the Glitch-Bomb gadget) and `index.html`. The `ascii.js` + `shaders.js` screen passes are still the render path for the normal view.

The old 3D modules are deleted. `shaders.js` keeps only the screen passes (cell, composite, blit).

## Done on 2026-11-24
- **The look.**
  - Thin, soft headlight beams.
  - Smaller hat and crate halos.
  - No foreground floor.
  - Background hills sit low, so buggies stand against bright fog.
  - The sky gradient is centred lower.
- **Suspension rework (`car2d.js`).** Every buggy used to drag its belly, which is why they crawled, snagged on ramps and couldn't leave the bowl. Now:
  - Springs are derived per vehicle (35% sag, both axles reach the ground).
  - Fat colliders "tuck" against the terrain.
  - The spring ray is solved against the sloped ground. Before, wheels lost contact on any steep slope.
  - Wheels grip logs, boulders, barrels and rivals' roofs.
- **Air control.** The buggy steadies itself in the air (nose slightly up while you hold the throttle). Pressing against your facing does a backflip. Holding the throttle through a jump no longer nose-dives.
- **Pond.** Buggies float keel-down, paddle across, and can turn around while afloat.
- **Terrain.**
  - Ramps have drivable rounded back slopes. There's one lane, so a ramp's back must not be a wall.
  - The bowl walls are a little gentler.
  - The shrine pillars are scenery behind the lane (x = 35 and 75), with hats on top.
  - No trees on the end hills.
- **Spawns.**
  - `LAYOUT.spawns` is derived from the layout: clear stretches only, away from hazards and hats.
  - `pickSpawn()` avoids other cars and lit barrels.
  - There's a 2.5 s spawn shield.
  - Barrel blast damage is lower (72 instead of 115 at the centre).
- **Hats.** All 12 were placed from measured jump arcs. `hats.mjs` (3 tries per hat, scripted inputs) collects 12/12 with the Mudrunner and Trike, and 10/12 with the Dozer, Tub and Tractor. Their misses: witch (×3), party, propeller, cone and bucket. A human with better timing may do better.
- **Props.**
  - A barrel lights when rammed at 7 m/s, counting the buggy's own speed. A buggy rides up over a round barrel, so the head-on impact understated the hit.
  - Resting props settle, so the host stops re-broadcasting trembling barrels.
  - Logs rot after 12 s.
  - Leaning on a tree topples it.
- **Bots** (`bots.js` rewritten). They take ramps with a run-up, charge *through* barrels and the cage-ball, boost up slopes, never park, and unstick by hopping and then backing off.
- **Multiplayer.** Late bot packets from a departed host are ignored, so there are no frozen ghost bots after a hand-over.
- **Phone layout.** On narrow portrait screens the actions sit in one column, so the pedals and buttons no longer overlap. Toasts sit below the meters.
- `?bots=N` URL flag (0–7).
- **Playtests are in the repo:** `scripts/playtest/` (see README). They need `npm run play` running.

## Test results (2026-11-24, headless Chrome, M-series Mac)
- **All 8 vehicles:** they ride clear, clear the x = 8 ramp, turn around in about 1.2 s, climb out of the bowl in about 2 s, and cross the pond in about 5.5 s. Most of them climb the end hills.
- **Multiplayer (`mp.mjs`):** everything passes with `NOBOTS=1`. With bots, the guest-ram check can fail when a bot crashes into the scene, so that's test noise.
- **WebGL2 and WebGPU:** both render correctly (sky orientation, beams, flashes). 60 fps with 6 cars.
- **Soak:** 60–80 s with 5 bots, no errors, and at most 1–3 brief stuck windows (a bot bumping a tree or log).

## Still to do
- **Hands-on feel pass on a real keyboard and phone.** Headless tests can't judge feel:
  - turn-around snappiness
  - air steadying strength (`car2d.js` → `forces()`: the `want`, `9`, `3.2` constants)
  - boost strength
  - the camera lead and zoom-out at speed
- **Hard hats for some vehicles.**
  - The witch hat (east ledge) was missed by the Dozer, Tub and Tractor.
  - Party and propeller are marginal for the slow cars.
  - The Tub's hop can't reach the bucket.
  Lower these slightly if that feels unfair.
- **The Glitch-Bomb slot is empty** (5 gadgets now). A side-view gadget could replace it, for example a grappling hook or a decoy headlight.
- **Barrels on the bowl walls** (x = 46, 64) creep slowly downhill. Either move them to flatter spots or accept it.
- **Itch page text.** It isn't in the repo. Update it on itch.io to match the README, then upload `release/headlight-smash-glade-web.zip`.

## How to run
```bash
cd ~/Downloads/Projects/headlight-smash-glade
npm run play          # build + server on http://localhost:2567 (and http://<wifi-ip>:2567)
# test URLs: ?gpu=webgl2|webgpu  ?stats  ?autostart&mode=solo&veh=kart  ?bots=0
node scripts/playtest/vehicles.mjs     # and the other playtests, see README
```

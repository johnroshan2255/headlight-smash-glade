# next.md: where Smash Glade is and what's next

_Last session: 2026-11-23. Next: pick up the side-view rebuild._

## Where we are
The game is being rebuilt from 3D into a **2D side-scroller**. The look copies the loading screen:
- black silhouettes
- layered grey-teal fog
- the radial misty sky
- colour only from **headlight beams** and **amber explosions**

You chose two things:
- **Movement:** pure 2D. Cars drive left and right on one line, and can jump, flip and ram.
- **World:** one wide glade about 240 m long (x = -120 to 120), with fog walls at both ends. The camera follows your buggy.

The first headless run works (solo, WebGL2): no errors, 6 cars, 60 fps, bots fighting, and the kill feed working.
Screenshot of that run: `/private/tmp/claude-501/-Users-johnroshan/f0b1c77f-4bc9-41f5-98c1-0a706f96f8ec/scratchpad/hsg/side-2.png`. The scratchpad folder may be cleared, so take a fresh one.

### New side-view files
| File | What it does |
|---|---|
| `src/sil.js` | Silhouette shaders (GLSL + WGSL): the sky gradient, fog by depth, fog walls, 8 headlight cones and 4 explosion flashes as lights, drifting fog banks, additive glow, tint, and the normal-view blit (vignette + grain). ASCII alpha encoding kept. |
| `src/world2d.js` | Terrain profile (`Terrain.height/normal`): hills, the pond, the shrine bowl half-pipe, 5 ramps and 2 rock-slide hills. Also the scenery: ground slab, 4 fog-layered forest layers, foreground black trunks and floor, grass, fog banks, and animated pond water. |
| `src/physics2d.js` | 2D compound-circle rigid bodies: terrain, static circles (trees/pillars, `breakable`, `drive` tops), fog walls, water buoyancy, impulses + friction, and `blast()`. |
| `src/car2d.js` | Side-view car: the 8 vehicle models as silhouettes, 2-spring suspension, drive along the ground, boost, hop, air spin, a 180° turn-around, the headlight beam + halo, hat cork on wreck, and remote interpolation. |
| `src/sandbox2d.js` | Props, host-authoritative:<ul><li>barrels (fuse + chain reactions)</li><li>dead trees that snap into falling, rolling logs</li><li>rock slides (boulders on a ledge, triggered by driving below)</li><li>pond geysers</li><li>the 5-hit cage-ball</li><li>gadget crates</li><li>mines</li><li>shrine pillars + altar</li><li>12 hats</li></ul>Also handles network sync (`world` snapshots, `hitProp`, `snap`, `slide`, `mine`, `pickup`, `regrow`). |
| `src/fx2d.js` | Batched particles: fireballs, sparks, debris, smoke, steam, dust, splashes and shockwave rings. Also explosion flashes for the lights. |
| `src/game.js` | Rewritten for 2D: side camera, lights, cars, bots, gadgets, networking, HUD and name tags. |
| `src/bots.js`, `src/input.js`, `src/layout.js` | Rewritten for side view. |

Controls now:
- **Keyboard:**
  - A/D or arrows drive. Pressing the other way brakes, then turns the car around.
  - W or Shift boosts. Space hops.
  - E uses your gadget, H honks, L flashes the headlights, R flips the car upright.
  - In the air, left/right spins the car.
- **Touch:** ◀ ▶ buttons, plus BOOST, HOP, GADGET, HONK and FLIP.

## Fix next (seen in the first screenshot)
1. **Headlight beams are too bright and wide.** They wash over everything. Lower the alpha in `beamMesh()` in `car2d.js` and narrow the spread. The loading-page beam is thin and soft.
2. **The foreground floor (z = 7) covers too much of the screen bottom.** Lower it in `world2d.js` → `buildForest()` → `foreFloor` (try `- 4`), or drop it.
3. **Hat pickup halos are too big and bright.** Shrink them or reduce `haloSprite` alpha in `sandbox2d.js`.
4. **The player got wrecked within about 5 s of spawning.** Check the spawns aren't next to barrel stacks, and tune barrel blast damage (`applyBoom` in `game.js`).
5. **Car silhouettes partly merge into the ground's front face** (z = 0.9). Try moving the car root to z = 1.2, or the ground face back.

## Still to do
- Full playtest: all 8 vehicles in side view. Check the handling (wheelies, flips, turn-around feel), the ramps, the bowl, the pond and geysers, and the rock slides.
- Multiplayer test with 2 clients (`npm run play`, then 2 headless browsers in room `TEST1`). The scripts from the 3D version are in the scratchpad (`pw/hsgmp.mjs`) and need updating for 2D.
- WebGPU check: `sil.js` uses `input.position` for the sky uv, so the WGSL y-flip may need fixing.
- Phone check in landscape and portrait: the touch pedals and the camera zoom in portrait.
- Bots in 2D: tune targeting so they use ramps and the bowl, and keep hopping when stuck.
- Delete the old 3D files once 2D is solid: `src/world.js`, `src/physics.js`, `src/vehicle.js`, `src/sandbox.js`, `src/fx.js`, `src/shaders.js` world/water parts. `ascii.js` still uses `shaders.js` for the cell/composite passes, so keep those parts.
- Update `README.md` (it still describes the 3D version) and the itch page text, then `npm run itch`.
- Push: `git push` (remote `origin` = github.com/johnroshan2255/headlight-smash-glade).

## How to run
```bash
cd ~/Downloads/Projects/headlight-smash-glade
npm run play          # build + server on http://localhost:2567 (and http://<wifi-ip>:2567)
# test URLs: ?gpu=webgl2|webgpu  ?stats  ?autostart&mode=solo&veh=kart
```

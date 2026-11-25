// FOGBASH, side view. Wires the 2D world, physics, cars, props, bots, network,
// camera, lights and HUD together. (Side-view rewrite: see next.md for status.)
import * as pc from 'playcanvas';
import { AsciiRenderer } from './ascii.js';
import { World2D } from './world2d.js';
import { Input } from './input.js';
import { QualityManager, LEVELS, detectTier, isMobile } from './quality.js';
import { setupFullscreen, enterFullscreen } from './fullscreen.js';
import { GADGETS, GADGET_KEYS, GADGET_SECONDS, HATS } from './layout.js';
import { safeAt, setMap, mapInfo, mapBounds, mapId } from './gen.js';
import { Account } from './account.js';
import { packSetup, unpackSetup, WHEELS, ROOF, BUMPER, DEFAULT_SETUP, HAT_IDS, MAP_LIST, mapName } from './catalog.js';
import { NHL, NFL, blit2dMaterial, glowMaterial } from './sil.js';
import { MeshBuilder, rgba } from './meshes.js';
import { CLS } from './shaders.js';
import { Physics, setGravity } from './physics2d.js';
import { Car } from './car2d.js';
import { VEHICLES, vehicleSpec } from './vehicles.js';
import { FX2D } from './fx2d.js';
import { Sandbox } from './sandbox2d.js';
import { Net } from './net.js';
import { BotBrain, botName } from './bots.js';
import * as sfx from './audio.js';
import { OIL_HALF } from './mods.js';
import { setupRoomLobby, teamCSS, teamName } from './roomlobby.js';
import * as portal from './portal.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { return localStorage.getItem(`hsg.${k}`) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`hsg.${k}`, v); } catch { /* private mode */ } },
};
const nextFrame = () => new Promise((resolve) => { let done = false; const go = () => { if (!done) { done = true; resolve(); } }; requestAnimationFrame(go); setTimeout(go, 60); });
const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const QUERY = new URLSearchParams(location.search);
const TARGET_CARS = QUERY.has('bots') ? 1 + clamp(Number(QUERY.get('bots')) || 0, 0, 7) : 6; // humans + bots (?bots=0 for an empty glade)

/** { device, canvas }: WebGPU where it's good, else WebGL 2. A WebGPU start that hangs (a flaky
 *  driver; Chrome with several WebGPU tabs) falls back to WebGL 2 after a few seconds instead of
 *  leaving the loading screen stuck, on a fresh canvas (a canvas can't switch context types). */
async function createDevice(canvas) {
  const pref = new URLSearchParams(location.search).get('gpu') || store.get('renderer', 'auto');
  const order = pref === 'webgpu' ? [pc.DEVICETYPE_WEBGPU, pc.DEVICETYPE_WEBGL2] : pref === 'webgl2' ? [pc.DEVICETYPE_WEBGL2]
    : navigator.gpu && !isMobile() ? [pc.DEVICETYPE_WEBGPU, pc.DEVICETYPE_WEBGL2] : [pc.DEVICETYPE_WEBGL2];
  const opts = { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: isMobile() ? 'default' : 'high-performance' };
  if (order[0] !== pc.DEVICETYPE_WEBGPU) return { device: await pc.createGraphicsDevice(canvas, { ...opts, deviceTypes: order }), canvas };
  const device = await Promise.race([pc.createGraphicsDevice(canvas, { ...opts, deviceTypes: order }), new Promise((r) => setTimeout(() => r(null), 8000))]);
  if (device) return { device, canvas };
  console.warn('WebGPU did not start in 8 s: using WebGL 2');
  const fresh = canvas.cloneNode(false);
  canvas.replaceWith(fresh);
  return { device: await pc.createGraphicsDevice(fresh, { ...opts, deviceTypes: [pc.DEVICETYPE_WEBGL2] }), canvas: fresh };
}

export async function startGame(loader) {
  loader.stage('starting the engines', 0);
  let device, canvas;
  try { ({ device, canvas } = await createDevice($('app'))); } catch (err) { console.error(err); throw new Error('This browser could not start WebGL 2 or WebGPU.'); }
  const info = detectTier(device);
  const tier = info.tier;
  const opts = new pc.AppOptions();
  opts.graphicsDevice = device;
  opts.componentSystems = [pc.RenderComponentSystem, pc.CameraComponentSystem];
  opts.resourceHandlers = [];
  const app = new pc.AppBase(canvas);
  app.init(opts);
  app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);

  const quality = new QualityManager({ startLevel: tier, maxLevel: tier, targetFps: info.mobile ? 50 : 55, onChange: (q) => applyQuality(q) });
  const savedQ = store.get('quality', 'auto');
  const glyph = store.get('glyphSize', 's');
  // ASCII view off: the side view always renders normally. To bring it back, restore the saved
  // setting here and un-comment the lines marked "ASCII view off" (plus index.html, input.js and
  // the Glitch-Bomb gadget in layout.js).
  // let asciiOn = store.get('ascii', '0') === '1';
  const asciiOn = false;
  let palette = store.get('palette', 'color');
  let forcedAsciiT = 0; // the ASCII Glitch-Bomb

  const ascii = new AsciiRenderer(app);
  ascii.blitMat = blit2dMaterial(); // silhouettes are already final colour: only vignette + grain
  const layer = ascii.layerWorld;
  const world = new World2D(app, layer, tier);
  const steps = world.steps();
  for (let i = 0; i < steps.length; i++) { loader.stage(steps[i][0], 0.08 + (i / steps.length) * 0.5); await nextFrame(); steps[i][1](); }
  const terrain = world.terrain;

  loader.stage('checking for other drivers', 0.6);
  const serverUrl = await Net.findServer();
  loader.stage('signing in', 0.64);
  const account = new Account();
  const net = new Net();
  const physics = new Physics(terrain);
  const fx = new FX2D(app, layer);
  const input = new Input(canvas);
  const touchUI = info.mobile || navigator.maxTouchPoints > 0;
  document.body.classList.toggle('touch', touchUI);

  // ---------------------------------------------------------------- subtitles + kill feed
  let toastTimer = 0, shownFor = 0;
  const toastQueue = [];
  const showLine = (msg, secs) => { const el = $('toast'); el.textContent = msg; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; toastTimer = secs; shownFor = 0; };
  const toast = (msg, secs = 3) => { if (toastTimer > 0 && shownFor < 1.8) { if (!toastQueue.some((q) => q[0] === msg)) toastQueue.push([msg, secs]); return; } showLine(msg, secs); };
  const feed = (text) => {
    const el = document.createElement('div');
    el.textContent = text;
    $('feed').prepend(el);
    while ($('feed').children.length > 3) $('feed').lastChild.remove();
    setTimeout(() => el.classList.add('old'), 4500);
    setTimeout(() => el.remove(), 6000);
  };

  // ---------------------------------------------------------------- cars
  const cars = new Map();
  const bots = new Map();
  const tags = new Map(); // id -> name tag element
  let me = null;
  let started = false;
  const allCars = () => [...cars.values()];
  const nameOf = (id) => { const c = cars.get(id); return c ? c.name : 'someone'; };

  function makeCar({ id, local, vehicle, colorIdx, name, hat, setup = null }) {
    if (net.online && setup && id !== 'preview') setup = { ...setup, paint: -1 }; // in a room you wear your room colour (your team)
    const car = new Car({ app, layer, physics, terrain, id, local, vehicle, colorIdx, name, hat, setup });
    car.onWreck = (c) => wreck(c);
    car.body.onContact = (other, sp) => onCarContact(car, other, sp);
    cars.set(id, car);
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.textContent = name;
    if (net.online) tag.style.color = teamCSS(colorIdx);
    $('tags').appendChild(tag);
    tags.set(id, tag);
    return car;
  }
  function removeCar(id) {
    const c = cars.get(id);
    if (c) { c.destroy(); cars.delete(id); bots.delete(id); }
    const t = tags.get(id);
    if (t) { t.remove(); tags.delete(id); }
  }

  /** Two cars touch. With two local cars (my bots, my car) each side hurts itself. With a remote
   *  car the other screen may never see the touch (there my car is an immovable copy), so the
   *  attacker reports it: the faster car rams, the saw cuts, the car coming down stomps, the
   *  plow scoops. Its browser sends the victim the push and damage; the victim takes nothing
   *  from the contact itself. */
  const propHitT = new Map();
  function onCarContact(car, other, sp) {
    if (!car.local || car.wrecked) return;
    const o = other && other.car;
    if (!o) { if (sp > 9) sfx.play('crunch', { x: car.body.p[0], z: 0 }, { vol: Math.min(1, sp / 16) }); return; }
    if (sp > 4) {
      fx.sparkBurst((car.body.p[0] + o.body.p[0]) / 2, (car.body.p[1] + o.body.p[1]) / 2 + 0.3, Math.min(16, sp * 1.4), sp * 0.6);
      sfx.play('crunch', { x: car.body.p[0], z: 0 }, { vol: Math.min(1.2, sp / 10) });
    }
    const now = performance.now();
    car.lastHitBy = o; car.lastHitT = now;
    const remote = !o.local;
    const ratio = (from, to) => Math.min(1.6, Math.max(0.6, from.spec.mass / to.spec.mass));
    // who is driving into whom: velocities along the line between the two cars
    const dx = o.body.p[0] - car.body.p[0], dy = o.body.p[1] - car.body.p[1], d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
    // (car.speed is measured before this step's collisions; body velocities here are already after the bounce)
    const iPush = car.speed, theyPush = o.speed;
    const send = (key, vx, vy, dmg) => { // report a hit on a remote car (once per target per moment)
      const T = (car.sentT ||= new Map()), k = `${key}:${o.id}`;
      if ((T.get(k) || 0) > now) return false;
      T.set(k, now + 400);
      shoveCar(o, vx, vy, dmg, car);
      return true;
    };
    // a ram: the harder the hit and the heavier the rammer, the more it hurts
    if (sp > 6 && Math.abs(ny) < 0.7) { // rams are side-on; coming down from above is a stomp, below
      const k = (sp - 6) * 2.6;
      if (!remote) { if ((car.ramT || 0) < now && car.shield <= 0) { car.ramT = now + 350; car.damage(k * ratio(o, car), o); } }
      else if (iPush >= theyPush && send('ram', nx * Math.min(12, sp * 0.55) * ratio(car, o), 2 + Math.min(4, sp * 0.2), k * ratio(car, o))) {
        if (car.shield <= 0) car.damage(k * 0.35 * ratio(o, car), o); // the rammer feels it too, less
      }
    }
    // landed on from above by pogo coils, giant tires or a steam-roller: crushed
    const crushes = (top, bottom) => (top.rigP.pogo || top.setup.tire >= 1.6 || top.spec.crusher) && top.body.p[1] > bottom.body.p[1] + 0.5;
    if (!remote && crushes(o, car) && (o.body.v[1] < -3 || sp > 5) && (car.crushT || 0) < now) {
      car.crushT = now + 600;
      car.damage(Math.min(60, 30 + sp * 2), o);
      car.body.v[1] -= 4; car.body.w += (Math.random() - 0.5) * 4;
      fx.sparkBurst(car.body.p[0], car.body.p[1] + 0.6, 16, 6);
      sfx.play('crunch', { x: car.body.p[0], z: 0 }, { vol: 1.3 });
    }
    if (remote && crushes(car, o) && (car.body.v[1] < -3 || sp > 5) && send('crush', 0, -4, Math.min(60, 30 + sp * 2))) { fx.sparkBurst(o.body.p[0], o.body.p[1] + 0.6, 16, 6); sfx.play('crunch', { x: o.body.p[0], z: 0 }, { vol: 1.3 }); }
    // sawblades bite
    if (!remote && o.saw && sp > 1.5 && (car.sawT || 0) < now) { car.sawT = now + 300; car.damage(7 + sp * 1.2, o); fx.sparkBurst(car.body.p[0], car.body.p[1], 10, 7); }
    if (remote && car.saw && sp > 1.5 && send('saw', nx * 2, 1, 7 + sp * 1.2)) fx.sparkBurst(o.body.p[0], o.body.p[1], 10, 7);
    // the Mega-Plow, the Shrine Dozer's blade and the cow-catcher scoop you up and over
    const plows = (c) => c.gadget === 'plow' || (c.spec.plowish && c.speed > 7) || (c.catcher && c.speed > 4);
    if (!remote && plows(o) && sp > 3) {
      const b = car.body, dd = Math.sign(b.p[0] - o.body.p[0]) || 1;
      const k = o.gadget === 'plow' ? 1 : 0.55;
      b.v[0] += dd * 9 * k; b.v[1] += 12 * k; b.w += dd * -5 * k;
      car.damage(25 * k, o);
      sfx.play('boing', { x: b.p[0], z: 0 });
    }
    if (remote && plows(car) && sp > 3) {
      const k = car.gadget === 'plow' ? 1 : 0.55;
      if (send('plow', (Math.sign(dx) || car.facing) * 9 * k, 12 * k, 25 * k)) sfx.play('boing', { x: o.body.p[0], z: 0 });
    }
  }


  /** a hit from a gadget: applied by whoever owns the target car (bots belong to the host) */
  /** teammates: the same colour in a room (they can't hurt each other) */
  function sameTeam(a, b) { return !!(net.online && a && b && a !== b && a.colorIdx === b.colorIdx); }
  function shoveCar(target, vx, vy, dmg, by) {
    if (!target || target.wrecked || sameTeam(target, by)) return;
    if (target.local) return applyShove(target, vx, vy, dmg, by);
    const owner = String(target.id).startsWith('bot') ? net.hostId : target.id;
    net.send('shove', { to: owner, car: target.id, v: [r2(vx), r2(vy)], dmg: Math.round(dmg), by: by ? by.id : null });
  }
  function applyShove(c, vx, vy, dmg, by) {
    if (c.wrecked || c.ghost || sameTeam(c, by)) return;
    const b = c.body;
    b.v[0] += vx; b.v[1] += vy; b.w += (Math.random() - 0.5) * Math.min(8, Math.hypot(vx, vy) * 0.4);
    if (by && by !== c) { c.lastHitBy = by; c.lastHitT = performance.now(); }
    if (dmg > 0) c.damage(dmg, by && by !== c ? by : null);
  }

  /** run fn here if we own the target car, else send it to whoever does (bots belong to the host) */
  function routeTo(target, type, msg, fn) {
    if (!target || target.wrecked) return;
    if (target.local) return fn();
    net.send(type, { ...msg, to: String(target.id).startsWith('bot') ? net.hostId : target.id, car: target.id });
  }
  /** a rival's hands close on my car. Two different pairs at once tear it in two. */
  function applyGrab(c, byId) {
    if (c.wrecked || c.ghost || c.shield > 0 || byId === c.id) return;
    const now = performance.now();
    c.grabbers.set(byId, now + 700);
    const fresh = [...c.grabbers].filter(([, t]) => t > now).map(([id]) => id);
    if (fresh.length >= 2) tearCar(c, fresh);
  }
  function applyThrow(c, vx, vy, byId) {
    c.grabbers.delete(byId);
    if (c.wrecked) return;
    const by = cars.get(byId);
    if (![...c.grabbers.values()].some((t) => t > performance.now())) c.grabTo = null;
    c.body.v[0] = vx; c.body.v[1] = vy; c.body.w = (Math.random() - 0.5) * 8;
    if (by) { c.lastHitBy = by; c.lastHitT = performance.now(); }
    c.damage(8, by || null);
  }
  /** where each of my grabbed cars dangles this frame (the average of the hands holding it) */
  function updateGrabs() {
    const now = performance.now(), pt = [0, 0];
    for (const c of allCars()) {
      if (!c.local || c.wrecked) continue;
      let n = 0, x = 0, y = 0, vx = 0, vy = 0;
      for (const [id, t] of c.grabbers) {
        const g = cars.get(id);
        if (t < now || !g || g.wrecked) { c.grabbers.delete(id); continue; }
        if (g.roofG && g.roofG.grabPoint) g.roofG.grabPoint(pt); else { pt[0] = g.body.p[0]; pt[1] = g.body.p[1] + 2.6; }
        x += pt[0]; y += pt[1]; vx += g.body.v[0]; vy += g.body.v[1]; n++;
        c.lastHitBy = g; c.lastHitT = now;
      }
      c.grabTo = n ? [x / n, y / n] : null;
      c.grabV = n ? [vx / n, vy / n] : [0, 0];
    }
  }
  /** two pairs of hands: rip it in two (the owner decides, everyone sees it) */
  function tearCar(c, ids) {
    if (c.wrecked) return;
    const xs = ids.map((id) => (cars.get(id) ? cars.get(id).body.p[0] : c.body.p[0]));
    c.tornBy = ids;
    net.send('torn', { id: c.id, xs: xs.map(r2), by: ids });
    c.tear(xs);
    wreck(c, true);
  }

  // explosions reach my car (and my bots) wherever they come from
  function applyBoom(msg) {
    fx.explosion(msg.x, msg.y, msg.s, camX);
    if (me && msg.by === me.id && msg.s >= 1 && msg.s < 1.15) earn('boom');
    sfx.play('boom', { x: msg.x, z: 0 }, { vol: 1.3 * msg.s, maxDist: 70 });
    const R = 6.5 * msg.s;
    for (const c of allCars()) {
      if (!c.local || c.wrecked) continue;
      const b = c.body, dx = b.p[0] - msg.x, dy = b.p[1] - msg.y, d = Math.hypot(dx, dy);
      if (d > R) continue;
      const k = 1 - d / R, n = d > 0.01 ? 1 / d : 0;
      b.v[0] += dx * n * k * 13 * msg.s;
      b.v[1] += (8 + 7 * k) * msg.s * (0.5 + k * 0.5);
      b.w += (Math.random() - 0.5) * 10 * k;
      const attacker = msg.by ? cars.get(msg.by) : null;
      c.damage(Math.min(100, 72 * k * msg.s), attacker && attacker !== c ? attacker : c.lastHitBy);
    }
  }

  function wreck(c, torn = false) {
    if (c.wrecked && !torn) return;
    const p = c.body.p;
    if (!torn) c.wreck();
    fx.explosion(p[0], p[1], 0.8, camX);
    sfx.play('boom', { x: p[0], z: 0 }, { vol: 1 });
    sfx.play('cork', { x: p[0], z: 0 });
    const killers = torn && c.tornBy ? c.tornBy.map((id) => cars.get(id)).filter(Boolean) : [];
    const killer = killers.length ? killers[killers.length - 1] : c.lastHitBy && performance.now() - c.lastHitT < 4500 ? c.lastHitBy : null;
    const msg = { id: c.id, killer: killer ? killer.id : null, torn: killers.length > 1 ? killers.map((k) => k.id) : null };
    net.send('wrecked', msg);
    onWrecked(msg);
    c.tornBy = null;
    if (c === me) account.stat({ wrecks: 1 });
    setTimeout(() => {
      if (!cars.has(c.id)) return; // left while wrecked
      c.unwreck(pickSpawn(c, c.body.p[0]));
      c.gadget = null;
    }, 2000);
  }
  /** A clear spawn spot near the action: beside a human driver (so fights happen in an endless
   *  world), or where you were when you're alone. Never on a ramp, prop, slope or pond, never on
   *  top of another buggy or a lit barrel. */
  function pickSpawn(self, around = null) {
    const others = allCars().filter((c) => c !== self && !c.wrecked);
    const humans = others.filter((c) => !c.isBot && !String(c.id).startsWith('bot') && !String(c.id).startsWith('warm'));
    const lit = sandbox.barrels.filter((B) => B.alive && B.fuse > 0);
    const gap = (x) => Math.min(60, ...others.map((c) => Math.abs(c.body.p[0] - x)), ...lit.map((B) => Math.abs(B.body.p[0] - x) * 2));
    let ax = around ?? 0;
    // people respawn near where they crashed (no surprise trips across the map); bots drop in near a human
    if (humans.length && (self.isBot || around === null)) ax = humans[Math.floor(Math.random() * humans.length)].body.p[0];
    let best = null, bestGap = -1;
    const B = mapBounds();
    if (B) ax = Math.max(B[0] + 12, Math.min(B[1] - 12, ax));
    for (let i = 0; i < 80; i++) {
      const x = Math.round(ax + (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * (10 + i)));
      if (B && (x < B[0] + 10 || x > B[1] - 10)) continue; // inside the arena's cliffs
      if (!safeAt(x)) continue;
      const g = gap(x);
      if (g > 9) return x;
      if (g > bestGap) { best = x; bestGap = g; }
    }
    return best ?? ax;
  }
  // ---------------------------------------------------------------- timed matches (online rooms)
  // The server runs the clock (6, 8, 10 or 12 minutes). Most smashes when it hits zero wins, then a
  // short break shows the results and the next match starts with everyone back on zero.
  let matchN = 0, resultsFor = 0, lastTick = 0, seenPhase = null, enterHook = null, garageHook = null;
  const esc = (t) => String(t).replace(/[<>&]/g, '');
  function standings() {
    return allCars().map((c) => ({ c, name: c.name, score: c.score | 0, bot: c.isBot || String(c.id).startsWith('bot'), me: c === me })).sort((a, b) => b.score - a.score || (a.bot - b.bot) || a.name.localeCompare(b.name));
  }
  function onMatch(m) {
    if (!m) return;
    const phase = net.phase;
    // in the room's lobby before the first drive: when the host starts, everyone drops in together
    if (!started) {
      if (phase === 'playing' && seenPhase && seenPhase !== 'playing' && roomLobby.open && enterHook) enterHook();
      seenPhase = phase;
      return;
    }
    seenPhase = phase;
    if (!me) return;
    if (phase === 'lobby') { $('matchEnd').hidden = true; roomLobby.show(); return; } // back to the lobby after the results
    if (m.over) { showResults(m); return; }
    $('matchEnd').hidden = true;
    roomLobby.hide();
    if (m.n === matchN) return;
    const first = !matchN;
    matchN = m.n;
    // a fresh match: on the room's map, everyone back on zero, in their (maybe new) colours, dropping in fresh
    applyMap(roomMap());
    for (const c of allCars()) c.score = 0;
    if (me.colorIdx !== net.myColor) applySetup({ ...DEFAULT_SETUP, ...account.setup }, true);
    syncBots();
    for (const c of allCars()) if (c.local) { if (c.wrecked) c.unwreck(pickSpawn(c, c.body.p[0])); else c.respawnAt(pickSpawn(c, c.body.p[0])); c.hp = 100; }
    if (!first) sfx.play('jingle');
    toast('GO! Most smashes wins.', 2);
  }
  function showResults(m) {
    if (resultsFor === m.n) return;
    resultsFor = m.n;
    const rows = standings();
    // teams: any colour two or more cars share; everyone else is a team of one
    const groups = new Map();
    for (const r of rows) { const k = r.c.colorIdx; if (!groups.has(k)) groups.set(k, { k, rows: [], score: 0 }); const G = groups.get(k); G.rows.push(r); G.score += r.score; }
    const teamMode = net.online && [...groups.values()].some((G) => G.rows.length > 1);
    const sides = teamMode ? [...groups.values()].sort((a, b) => b.score - a.score) : rows.map((r) => ({ k: r.c.colorIdx, rows: [r], score: r.score }));
    const top = sides[0], winners = top && top.score > 0 ? sides.filter((G) => G.score === top.score) : [];
    const label = (G) => (G.rows.length > 1 ? `Team ${teamName(G.k)}` : esc(G.rows[0].name));
    const pl = (n) => `${n} smash${n === 1 ? '' : 'es'}`;
    $('meWinner').innerHTML = !winners.length ? 'Nobody smashed anybody!' : winners.length > 1 ? `A draw: ${winners.map(label).join(' & ')}<br><small>${pl(top.score)} each</small>` : `${label(top)} wins!<br><small>${pl(top.score)}</small>`;
    let rank = 0, prev = null;
    $('meRows').innerHTML = sides.slice(0, 8).map((G, i) => {
      if (G.score !== prev) { rank = i + 1; prev = G.score; }
      const mine = G.rows.some((r) => r.me), who = G.rows.length > 1 ? `${label(G)} <small>${G.rows.map((r) => esc(r.name)).join(', ')}</small>` : `${esc(G.rows[0].name)}${G.rows[0].bot ? ' <small>bot</small>' : ''}`;
      return `<tr class="${mine ? 'me' : ''}${winners.includes(G) ? ' first' : ''}"><td>${rank}</td><td><i class="dot" style="--c:${net.online ? teamCSS(G.k) : 'transparent'}"></i>${who}</td><td>${G.score}</td></tr>`;
    }).join('');
    $('matchEnd').hidden = false;
    if (!matchN) return; // joined during the break: no coins for a match we didn't play
    const mySide = sides.find((G) => G.rows.some((r) => r.me)), myRank = mySide ? 1 + sides.filter((G) => G.score > mySide.score).length : 99;
    if (mySide && winners.includes(mySide)) { earn('win'); toast(teamMode && mySide.rows.length > 1 ? 'Your team won the match!' : 'You won the match!', 3); sfx.play('jingle'); }
    else if (mySide && mySide.score > 0 && myRank <= 3) earn('podium');
    else earn('match');
  }
  function updateClock() {
    const m = net.online && net.match && net.phase !== 'lobby' && net.match.n > 0 ? net.match : null, el = $('clock');
    el.hidden = !m;
    if (!m) return;
    if (m.over) {
      el.classList.remove('hot'); el.classList.add('over');
      $('clockT').textContent = '0:00'; $('clockSub').textContent = 'MATCH OVER';
      const left = Math.max(0, Math.ceil((m.nextAt - net.serverNow()) / 1000));
      $('meNext').textContent = left > 0 ? `NEXT MATCH IN ${left}` : 'GET READY';
      return;
    }
    const left = Math.max(0, Math.ceil((m.endsAt - net.serverNow()) / 1000));
    $('clockT').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    $('clockSub').textContent = 'MOST SMASHES WINS';
    el.classList.toggle('hot', left <= 30); el.classList.remove('over');
    if (left <= 10 && left > 0 && left !== lastTick) { lastTick = left; sfx.play('tick', undefined, { vol: 0.9, wet: 0 }); }
  }
  // ---------------------------------------------------------------- maps
  // The room's map (solo: the endless glade). Switching rebuilds the world from the new layout,
  // sets its gravity, and drops our cars (rebuilt: their springs are tuned to gravity) back in.
  let moonE = null;
  function makeMoon() {
    // a huge pale moon behind the fog: a soft disc that fades out at its rim, with a faint halo
    const mb = new MeshBuilder();
    const ringAt = (r, col) => { const out = []; for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; out.push(mb.vert(Math.cos(a) * r, Math.sin(a) * r, 0, 0, 0, 1, rgba(...col, CLS.GLOW))); } return out; };
    const c = mb.vert(0, 0, 0, 0, 0, 1, rgba(0.4, 0.42, 0.39, CLS.GLOW));
    const r1 = ringAt(0.84, [0.36, 0.38, 0.35]), r2 = ringAt(1.0, [0.2, 0.21, 0.2]), r3 = ringAt(1.7, [0, 0, 0]);
    for (let i = 0; i < 48; i++) {
      const j = (i + 1) % 48;
      mb.tri(c, r1[i], r1[j]);
      mb.tri(r1[i], r2[i], r2[j]); mb.tri(r1[i], r2[j], r1[j]);
      mb.tri(r2[i], r3[i], r3[j]); mb.tri(r2[i], r3[j], r2[j]); // the halo, fading to nothing
    }
    const e = new pc.Entity('moon');
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mb.build(device), glowMaterial(0.8))], layers: [layer.id], castShadows: false, receiveShadows: false });
    e.render.meshInstances[0].cull = false;
    app.root.addChild(e);
    e.enabled = false;
    return e;
  }
  function applyMap(id) {
    sfx.setScene(id);
    if (!setMap(id)) return false;
    setGravity(mapInfo().gravity);
    physics.bounds = mapBounds();
    world.resetChunks();
    sandbox.resetChunks();
    if (mapInfo().moon && !moonE) moonE = makeMoon();
    if (moonE) moonE.enabled = !!mapInfo().moon;
    if (me) { applySetup({ ...DEFAULT_SETUP, ...account.setup }, true); me.respawnAt(pickSpawn(me, 0)); camX = me.body.p[0]; }
    else camX = 0;
    for (const id of [...bots.keys()]) removeCar(id);
    if (started) syncBots();
    return true;
  }
  const roomMap = () => (net.online ? net.settings.map || 'endless' : 'endless');

  // the room's lobby (before the first match and between matches)
  const roomLobby = setupRoomLobby({
    net,
    enter: () => enterHook && enterHook(),
    inGame: () => started,
    garage: () => { if (!started && garageHook) garageHook(); else window.dispatchEvent(new CustomEvent('hsg:garage', { detail: { inGame: started } })); },
    leave: () => { portal.leftRoom(); net.leave(); location.reload(); },
  });
  net.on('match', onMatch);

  function onWrecked(msg) {
    // the killers' own browsers credit them (each owns its car's score and coins); runs on every client
    const victimCar = cars.get(msg.id), botVictim = String(msg.id).startsWith('bot');
    const inBreak = net.online && net.match && net.match.over; // smashes in the break between matches don't count
    for (const kid of msg.torn || (msg.killer ? [msg.killer] : [])) {
      const k = cars.get(kid);
      if (!k || !k.local || kid === msg.id || inBreak || sameTeam(k, victimCar)) continue;
      k.score++;
      net.send('score', { killer: kid });
      if (k === me) earn(botVictim || (victimCar && victimCar.isBot) ? 'botSmash' : 'smash', 1, { smashes: 1 });
    }
    const victim = nameOf(msg.id), killer = msg.killer ? nameOf(msg.killer) : null;
    if (msg.torn) { feed(`${msg.torn.map(nameOf).join(' and ')} tore ${victim} in two!`); if (me && msg.torn.includes(me.id)) toast(`You tore ${victim} in two!`, 2); if (me && msg.id === me.id) toast('Torn in two!', 2); return; }
    feed(killer && msg.killer !== msg.id ? `${killer} smashed ${victim}` : `${victim} wrecked`);
    if (me && msg.killer === me.id && msg.id !== me.id) toast(`SMASHED ${victim.toUpperCase()}`, 1.5);
  }

  // gadgets
  function useGadget(c) {
    if (c.wrecked || !c.gadget) return;
    const b = c.body, p = b.p;
    if (c.gadget === 'mine') {
      if ((c.mineCd || 0) > performance.now()) return;
      c.mineCd = performance.now() + 1400;
      sandbox.dropMine([p[0] - c.facing * 1.6, p[1] + 0.3], b.v, c.id);
      sfx.play('beep', { x: p[0], z: 0 });
    } else if (c.gadget === 'horn') {
      if ((c.hornCd || 0) > performance.now()) return;
      c.hornCd = performance.now() + 1200;
      shockwave({ x: p[0], y: p[1], by: c.id });
      net.send('shock', { x: r2(p[0]), y: r2(p[1]), by: c.id });
    } else if (c.gadget === 'hop') {
      c.input.hop = true;
    }
    // ASCII view off: the Glitch-Bomb gadget
    // else if (c.gadget === 'glitch') {
    //   net.send('glitch', { x: r2(p[0]), y: r2(p[1]), by: c.id });
    //   glitch({ x: p[0], y: p[1], by: c.id });
    //   c.gadget = null;
    // }
  }
  function shockwave(msg) {
    fx.ring(msg.x, msg.y, 10, 1, 24);
    sfx.play('foghorn', { x: msg.x, z: 0 }, { vol: 1.2, maxDist: 60 });
    for (const c of allCars()) {
      if (!c.local || c.wrecked || c.id === msg.by) continue;
      const b = c.body, dx = b.p[0] - msg.x, d = Math.hypot(dx, b.p[1] - msg.y);
      if (d > 10) continue;
      const k = 1 - d / 10;
      b.v[0] += (Math.sign(dx) || 1) * 16 * k; b.v[1] += 7 * k; b.w += (Math.random() - 0.5) * 6 * k;
      c.lastHitBy = cars.get(msg.by) || c.lastHitBy; c.lastHitT = performance.now();
    }
    if (net.isHost) physics.blast(msg.x, msg.y, 10, 11, (bb) => !!bb.prop && !bb.kinematic);
  }
  function glitch(msg) {
    fx.ring(msg.x, msg.y, 18, 1, 30);
    sfx.play('glitch', { x: msg.x, z: 0 }, { vol: 1, maxDist: 60 });
    if (me && msg.by !== me.id && Math.abs(me.body.p[0] - msg.x) < 18) { forcedAsciiT = 10; toast(`${nameOf(msg.by)} glitched your eyes into ASCII!`, 3); }
  }
  function honk(c) {
    if (c.gadget === 'horn') return useGadget(c);
    sfx.play('honk', { x: c.body.p[0], z: 0 }, { vol: c === me ? 0.8 : 1, ride: c.vehicle });
    c.flash = 1;
    if (c.local) net.send('honk', { id: c.id });
  }

  // on CrazyGames there's no sign-in of our own (their rules): progress stays in this browser
  await account.init(portal.ON_CRAZY ? null : serverUrl);
  const sandbox = new Sandbox({ app, layer, physics, terrain, fx, net, hooks: {
    boom: applyBoom,
    grant: (msg) => onGrant(msg),
    cars: allCars,
    hat: (id) => { account.foundHat(id); popCoins(60); toast(`You found the ${HATS[id] || id}! It's in your garage.`, 3); sfx.play('jingle'); updateHud(true); },
    sound: (name, at) => sfx.play(name, at && { x: at.x, z: 0 }, { vol: 1, maxDist: 60 }),
    smashed: (what, by) => { if (me && by === me.id) earn('boom'); }, // a skeleton or a pumpkin you broke
    // something thrown (a bone, a skeleton, a pumpkin, a log) hits a car: it hurts, credited to the thrower (host decides, the car's owner applies)
    thrownHit: (P, car, sp) => {
      if (performance.now() - (propHitT.get(P.id) || 0) < 600) return;
      propHitT.set(P.id, performance.now());
      const thrower = cars.get(P.thrownBy), dmg = { skeleton: 34, pumpkin: 20, bone: 12, boulder: 30, log: 22 }[P.kind] || 10;
      if (!thrower || sameTeam(car, thrower)) return;
      shoveCar(car, Math.sign(P.body.v[0] || 1) * 4, 3, dmg, thrower);
      sfx.play('crunch', { x: car.body.p[0], z: 0 }, { vol: 1 });
    },
  } });
  function onGrant(msg) {
    sandbox.onGrant(msg);
    const c = cars.get(msg.to);
    if (c && c.local) {
      c.gadget = msg.g; c.gadgetT = GADGET_SECONDS;
      if (c === me) { const seen = store.get('seenGadgets', ''); if (!seen.split(',').includes(msg.g)) { toast(`${GADGETS[msg.g].name}: ${GADGETS[msg.g].hint}`, 3); store.set('seenGadgets', `${seen},${msg.g}`); } sfx.play('pickup'); earn('crate'); }
    }
  }

  account.onChange((p) => { for (const h of p.owned.hats) sandbox.ownedHats.add(h); if (started) updateHud(true); });

  // ---------------------------------------------------------------- garage gadgets need these
  Car.ctx = {
    sandbox, fx, sfx, net,
    cars: allCars,
    /** is there oil under this wheel? (a fresh slick doesn't catch the car that dropped it) */
    slickAt: (car, x, y) => {
      for (const c of cars.values()) {
        const S = c.bumperG && c.bumperG.slicks;
        if (S) for (const k of S) if (Math.abs(x - k.x) < OIL_HALF && Math.abs(y - k.y) < 1.0 && !(c === car && k.age < 1.5)) return true;
      }
      return false;
    },
    /** hidden in a smoke bomb's cloud? */
    sameTeam,
    smokeAt: (x, y) => { for (const c of cars.values()) if (c.bumperG && c.bumperG.hides && c.bumperG.hides(x, y)) return true; return false; },
    shove: shoveCar,
    /** a stomper's wheels slammed onto another car's roof */
    stomp: (by, victim, sp) => {
      const now = performance.now(), T = (by.sentT ||= new Map()), k = `crush:${victim.id}`; // shared with the contact stomp: one landing, one stomp
      if (victim.wrecked || (T.get(k) || 0) > now) return;
      T.set(k, now + 600);
      shoveCar(victim, 0, -4, Math.min(60, 30 + sp * 2), by);
      fx.sparkBurst(victim.body.p[0], victim.body.p[1] + 0.6, 16, 6);
      sfx.play('crunch', { x: victim.body.p[0], z: 0 }, { vol: 1.3 });
    },
    grabCar: (target, by) => routeTo(target, 'grabCar', { by: by.id }, () => applyGrab(target, by.id)),
    throwCar: (target, vx, vy, by) => routeTo(target, 'throwCar', { by: by.id, v: [r2(vx), r2(vy)] }, () => applyThrow(target, vx, vy, by.id)),
    shock: (msg) => { shockwave(msg); net.send('shock', { x: r2(msg.x), y: r2(msg.y), by: msg.by }); },
  };
  /** magnet coils pull cars (each browser moves its own) and props (the host moves those) */
  function magnets(dt) {
    const on = allCars().filter((c) => c.roofG && c.roofG.active && !c.wrecked && !c.ghost);
    if (!on.length) return;
    const R = 11; // reach of the coil
    for (const m of on) {
      // the point things are dragged to: just above the coil
      const a = m.body.a, up = m.roofTop + 1.5, mx = m.body.p[0] - Math.sin(a) * up, my = m.body.p[1] + Math.cos(a) * up;
      // a damped pull: everything heads for the coil at a capped speed and settles there (no overshoot),
      // then rides along stuck to it until the polarity flips
      const pull = (b, mass, stickR) => {
        const dx = mx - b.p[0], dy = my - b.p[1], d = Math.hypot(dx, dy);
        if (d > R) return false;
        const speed = Math.min(9, d * 2.2) * Math.min(1.3, 300 / mass), stuck = d < stickR;
        const tx = m.body.v[0] + (dx / (d || 1)) * speed, ty = m.body.v[1] + (dy / (d || 1)) * speed;
        const k = Math.min(1, dt * (stuck ? 12 : 4 + 6 * (1 - d / R)));
        b.v[0] += (tx - b.v[0]) * k; b.v[1] += (ty - b.v[1]) * k + 19 * dt * (stuck ? 1 : 0.7);
        return true;
      };
      for (const c of allCars()) {
        if (c === m || !c.local || c.wrecked || c.ghost) continue;
        if (pull(c.body, c.spec.mass, 3.2)) { c.lastHitBy = m; c.lastHitT = performance.now(); }
      }
      if (sandbox.isHost) for (const P of sandbox.dyn.values()) {
        const b = P.body;
        if (b.kinematic || !b.enabled || P.heldBy) continue;
        pull(b, b.m, 1.4);
      }
    }
  }

  // ---------------------------------------------------------------- coins for playing
  let distAcc = 0, airT = 0, spin = 0, lastX = null;
  function popCoins(n, c = me) {
    if (!n || !c) return;
    const el = document.createElement('div');
    el.className = 'coinpop';
    el.textContent = `+${n} ¢`;
    $('tags').appendChild(el);
    const w = new pc.Vec3(c.body.p[0], c.body.p[1] + 2.4, 0), s = new pc.Vec3();
    ascii.sceneCam.camera.worldToScreen(w, s);
    el.style.left = `${Math.round(s.x)}px`; el.style.top = `${Math.round(s.y)}px`;
    setTimeout(() => el.remove(), 1300);
    if (c === me) sfx.play('coins', undefined, { vol: Math.min(1, 0.5 + n / 60), wet: 0 });
    updateHud(true);
  }
  const QUIET = new Set(['distance', 'air', 'flip', 'boom', 'match']); // earned quietly (no +¢ pop)
  function earn(why, n = 1, stats = null) { const got = account.earn(why, n, stats); if (!QUIET.has(why)) popCoins(got); }
  function earnings(dt) {
    if (!me || me.wrecked || me.ghost) { lastX = null; airT = 0; spin = 0; return; }
    const b = me.body;
    // distance driven (not flown off a geyser or teleported)
    if (lastX !== null) { const dx = Math.abs(b.p[0] - lastX); if (dx < 3) distAcc += dx; }
    lastX = b.p[0];
    if (distAcc >= 100) { distAcc -= 100; earn('distance', 1, { distance: 100, best: Math.abs(b.p[0]) }); }
    // air time and flips: count the spin while airborne, pay out on an upright landing
    if (!me.grounded && !me.wet && !(b.grounded > 0)) { airT += dt; spin += b.w * dt; }
    else if (airT > 0) {
      const upright = Math.cos(b.a) > 0.5, flips = Math.floor((Math.abs(spin) + 0.6) / (Math.PI * 2));
      if (upright && flips > 0) { earn('flip', flips, { flips }); toast(flips > 1 ? `${flips}x FLIP!` : 'FLIP!', 1.2); }
      if (upright && airT > 1.5) earn('air', Math.floor(airT - 1.5) + 1);
      airT = 0; spin = 0;
    }
  }

  // ---------------------------------------------------------------- network handlers
  const carSeen = new Map();
  net.on('car', (s) => {
    if (departed.has(s.id) && performance.now() - departed.get(s.id) < 60000) return;
    let c = cars.get(s.id);
    if (c && c.local) return;
    if (net.isHost && String(s.id).startsWith('bot')) return; // a late packet from the old host's bots
    if (!c || c.vehicle !== s.veh || (s.s && c.setupKey !== s.s) || (net.online && c.colorIdx !== (s.col || 0))) { if (c) removeCar(s.id); c = makeCar({ id: s.id, local: false, vehicle: s.veh, colorIdx: s.col || 0, name: s.n, hat: s.hat, setup: s.s ? unpackSetup(s.s) : null }); }
    if (s.gs) { if (c.roofG) c.roofG.setState(s.gs[0]); if (c.bumperG) c.bumperG.setState(s.gs[1]); }
    c.ghost = !!(s.f & 16);
    c.pop(!!(s.f & 32));
    if (s.n && s.n !== c.name) { c.name = s.n; const t = tags.get(s.id); if (t) t.textContent = s.n; }
    if (s.hat && s.hat !== c.hat) c.setHat(s.hat);
    c.pushRemote(s, performance.now());
    c.boosting = !!(s.f & 1);
    c.flash = s.f & 4 ? 1 : 0;
    c.setFacing(s.f & 8 ? -1 : 1);
    c.gadget = s.g ? GADGET_KEYS[s.g - 1] : null;
    c.score = s.sc || 0;
    const wrecked = !!(s.f & 2);
    if (wrecked && !c.wrecked) c.wreck();
    if (!wrecked && c.wrecked) c.unwreck(s.p[0]);
    carSeen.set(s.id, performance.now());
  });
  const departed = new Map(); // id -> when: a late snapshot from someone who left must not bring their car back
  net.on('left', (m) => { removeCar(m.id); carSeen.delete(m.id); departed.set(m.id, performance.now()); });
  net.on('boom', applyBoom);
  net.on('grant', (m) => onGrant(m));
  net.on('shock', shockwave);
  net.on('grabCar', (m) => { const c = cars.get(m.car); if (c && c.local) applyGrab(c, m.by); });
  net.on('throwCar', (m) => { const c = cars.get(m.car); if (c && c.local) applyThrow(c, m.v[0], m.v[1], m.by); });
  net.on('torn', (m) => { const c = cars.get(m.id); if (c && !c.local && !c.wrecked) c.tear(m.xs || []); });
  net.on('shove', (m) => { const c = cars.get(m.car); if (c && c.local) applyShove(c, m.v[0], m.v[1], m.dmg || 0, cars.get(m.by) || null); });
  // net.on('glitch', glitch); // ASCII view off
  net.on('honk', (m) => { const c = cars.get(m.from); if (c) { c.flash = 1; sfx.play('honk', { x: c.body.p[0], z: 0 }, { ride: c.vehicle }); } });
  net.on('wrecked', onWrecked);
  net.on('world', (m) => sandbox.applyWorld(m));
  net.on('hitProp', (m) => sandbox.onRemoteHit(m));
  net.on('pickup', (m) => sandbox.onRemotePickup(m));
  net.on('mine', (m) => sandbox.isHost && sandbox.dropMine(m.p, m.v, m.from));
  net.on('projectile', (m) => sandbox.isHost && sandbox.spawnProjectile(m.k, m.p, m.v, m.from));
  net.on('shoveProp', (m) => sandbox.isHost && sandbox.shove(m.id, m.v[0], m.v[1], m.from, m.sp));
  net.on('grab', (m) => { if (sandbox.isHost) sandbox.grab(sandbox.dyn.get(m.id), m.from); });
  net.on('throw', (m) => { if (sandbox.isHost) { const P = sandbox.dyn.get(m.id); if (P && P.heldBy === m.from) sandbox.throw(P, m.from, m.v[0], m.v[1]); } });
  net.on('splat', (m) => sandbox.onSplat(m));
  net.on('snap', (m) => { if (sandbox.isHost) { const T = sandbox.trees.get(m.i); if (T) sandbox.snapTree(T, m.dir, m.from); } });
  net.on('snapped', (m) => { const T = sandbox.trees.get(m.i); if (T && !T.snapped) sandbox.hideTree(T); });
  net.on('regrow', (m) => { const T = sandbox.trees.get(m.i); if (T && T.snapped) sandbox.regrow(T); });
  net.on('slide', (m) => { if (sandbox.isHost) { const sl = sandbox.slides.get(m.i); if (sl) sandbox.releaseSlide(sl); } });
  net.on('rumble', (m) => sfx.play('rumble', { x: m.x, z: 0 }, { maxDist: 70 }));
  net.on('roster', () => { if (!started || net.phase !== 'playing') applyMap(roomMap()); syncBots(); updateBoard(); if (!$('settings').hidden) paintRoom(); portal.inRoom(net.code, net.players.length < 8); });
  net.on('becameHost', () => { toast('You are now hosting the glade.', 2.5); for (const id of [...cars.keys()]) if (String(id).startsWith('bot') && !bots.has(id)) removeCar(id); sandbox.setAuthority(); syncBots(); });
  // the room is gone (the host left, or the server went away): back to the menu, with the reason
  net.on('disconnected', (m) => {
    const why = m.reason || 'Lost the connection to the server.';
    showLine(why, 4);
    paused = true;
    portal.leftRoom();
    try { sessionStorage.setItem('hsg.notice', why); } catch { /* */ }
    setTimeout(() => location.reload(), 2200);
  });

  function syncBots() {
    if (!net.isHost) { for (const id of [...bots.keys()]) removeCar(id); return; }
    const humans = net.online ? net.players.length : 1;
    // online, the room decides: -1 fills the empty seats, otherwise exactly that many (private rooms can have none)
    const setting = net.online ? net.settings.bots : -1;
    const want = setting < 0 ? Math.max(0, TARGET_CARS - humans) : Math.max(0, Math.min(setting, 8 - humans));
    let i = 0;
    while (bots.size < want && i < 12) {
      const id = `bot${i}`;
      if (!cars.has(id)) {
        const pick = (o) => { const k = Object.keys(o); return k[Math.floor(Math.random() * k.length)]; };
        const wheels = Math.random() < 0.45 ? 'tires' : pick(WHEELS);
        const setup = { wheels, tire: ['tires', 'saw', 'magnet', 'square'].includes(wheels) ? Math.round((0.8 + Math.random() * 0.9) * 10) / 10 : 1, roof: Math.random() < 0.75 ? pick(ROOF) : 'none', bumper: Math.random() < 0.75 ? pick(BUMPER) : 'none', hat: HAT_IDS[(i * 5) % HAT_IDS.length] };
        let col = i + 1;
        if (net.online) { const used = new Set([...net.players.map((p) => p.color), ...[...bots.keys()].map((b) => cars.get(b) && cars.get(b).colorIdx)]); col = [0, 1, 2, 3, 4, 5, 6, 7].find((k) => !used.has(k)) ?? (i % 8); }
        const car = makeCar({ id, local: true, vehicle: VEHICLES[(i * 3 + 1) % VEHICLES.length].id, colorIdx: col, name: botName(i), hat: setup.hat, setup });
        car.isBot = true;
        car.respawnAt(pickSpawn(car, me ? me.body.p[0] : 0));
        bots.set(id, new BotBrain(car, sandbox, game));
      }
      i++;
    }
    while (bots.size > want) { const id = [...bots.keys()].pop(); removeCar(id); }
  }

  const game = { cars: allCars, useGadget, honk, respawnNear: (c, x) => c.respawnAt(pickSpawn(c, x)), fireRoof: (c) => c.roofG && c.roofG.fire(), fireBumper: (c) => c.bumperG && c.bumperG.fire() };

  // ---------------------------------------------------------------- render plumbing + uniforms
  const scope = device.scope;
  const U = (n) => scope.resolve(n);
  const u = { time: U('uTime'), mono: U('uMono'), res: U('uRes') };
  U('uWorldW').setValue(1e6); // endless: no fog walls
  u.mono.setValue(palette === 'mono' ? 1 : 0);
  const HL = [], HLv = [], FL = [], FLv = [];
  for (let i = 0; i < NHL; i++) { HL.push(U(`uHL${i}`)); HLv.push(new Float32Array(4)); }
  for (let i = 0; i < NFL; i++) { FL.push(U(`uFL${i}`)); FLv.push(new Float32Array(4)); }
  const resV = new Float32Array(2);
  const hl = [0, 0, 0, 0];

  function applyQuality(next) {
    device.maxPixelRatio = Math.min(window.devicePixelRatio || 1, next.dpr);
    app.resizeCanvas();
    ascii.setOptions({ ss: next.ss, reflScale: 0, glyphSize: glyph, normalScale: next.nd, ascii: asciiOn || forcedAsciiT > 0 });
    resized();
  }
  function resized() {
    if (!ascii.resize()) return;
    ascii.updateFov();
    resV[0] = ascii.sceneSize[0]; resV[1] = ascii.sceneSize[1];
    u.res.setValue(resV);
  }
  if (savedQ !== 'auto') quality.setManual(savedQ);
  applyQuality(quality.settings);
  ascii.sceneCam.camera.nearClip = 1;
  ascii.sceneCam.camera.farClip = 160;
  window.addEventListener('resize', () => app.resizeCanvas());
  setupFullscreen({ button: $('btnFull'), canvas, touchDevice: touchUI, onChange: () => app.resizeCanvas() });

  // ---------------------------------------------------------------- side camera
  let camX = 0, camY = 2, camZ = info.mobile ? 26 : 30, lead = 0, zoomK = 1;
  const camPos = new pc.Vec3();
  let camLock = null; // debug: { x, y, z } or { follow: true, z } for close-up checks
  function updateCamera(dt) {
    if (camLock) { const L = camLock.follow && me ? { x: me.body.p[0] + (camLock.dx || 0), y: me.body.p[1] + (camLock.dy || 0.6), z: camLock.z } : camLock; camX = L.x; camY = L.y; camPos.set(L.x, L.y + 0.4, L.z); ascii.sceneCam.setPosition(camPos); ascii.sceneCam.lookAt(L.x, L.y, 0); return; }
    if (framePreview(dt)) { camPos.set(camX, camY + 0.5, camZ); ascii.sceneCam.setPosition(camPos); ascii.sceneCam.lookAt(camX, camY, 0); return; }
    camZ = clamp(camZ * (1 + input.consumeZoom()), 18, 50);
    input.consumeLook();
    const portrait = device.height > device.width;
    if (me) {
      const b = me.body;
      lead += ((me.wrecked ? 0 : me.facing * 3.5 + b.v[0] * 0.3) - lead) * (1 - Math.exp(-dt * 1.8));
      const tx = b.p[0] + lead;
      const ty = b.p[1] + camZ * zoomK * (portrait ? 0.19 : 0.14); // keeps the buggy low in the frame at any zoom
      zoomK += ((me.wrecked ? 1 : 1 + Math.min(1, me.speed / 22) * 0.2) - zoomK) * (1 - Math.exp(-dt * 1.2));
      camX += (tx - camX) * (1 - Math.exp(-dt * 4));
      camY += (ty - camY) * (1 - Math.exp(-dt * (Math.abs(ty - camY) > 6 ? 5 : 2.6)));
    }
    let sx = 0, sy = 0;
    const s = fx.shake * fx.shake * 0.5;
    if (s > 0.001) { sx = (Math.random() - 0.5) * s; sy = (Math.random() - 0.5) * s; }
    const z = camZ * zoomK * (portrait ? 1.9 : 1); // portrait is narrow: pull back to see what's coming
    camPos.set(camX + sx, camY + sy + 0.6, z);
    ascii.sceneCam.setPosition(camPos);
    ascii.sceneCam.lookAt(camX + sx, camY + sy, 0);
  }

  // ---------------------------------------------------------------- HUD / settings
  const statsEl = $('stats');
  let showStats = store.get('stats', '0') === '1' || new URLSearchParams(location.search).has('stats');
  statsEl.hidden = !showStats;
  $('optQuality').value = savedQ;
  // $('optGlyph').value = glyph; // ASCII view off
  $('optRenderer').value = store.get('renderer', 'auto');
  let paused = false;
  // ≡ in the glade: chips light up the current choice
  const lightChips = (id, v) => { for (const b of $(id).querySelectorAll('button')) b.classList.toggle('on', (b.dataset.v ?? b.dataset.m) === String(v)); };
  const onChip = (id, fn) => { for (const b of $(id).querySelectorAll('button')) b.addEventListener('click', () => { if (!b.disabled) fn(b.dataset.v ?? b.dataset.m); }); };
  // the room box (online): the invite code and, for the host, bots, match length and privacy; solo: the map
  const paintRoom = () => {
    $('roomBox').hidden = !net.online;
    $('mapBox').hidden = net.online; // rooms change maps in their lobby
    $('roomCodeIn').hidden = !net.online;
    lightChips('optPalette', palette); lightChips('optStats', showStats ? 1 : 0);
    if (!net.online) { lightChips('optMap', mapId()); const M = MAP_LIST.find((m) => m.id === mapId()); $('mapBlurbIn').textContent = M ? M.blurb : 'Endless: drive as far as you like either way.'; return; }
    $('roomCodeIn').textContent = net.code || 'ROOM';
    const host = net.isHost;
    lightChips('optBots', Math.max(0, net.settings.bots)); lightChips('optTime', net.settings.time || 8); lightChips('optPrivate', net.settings.private ? 1 : 0);
    for (const id of ['optBots', 'optTime', 'optPrivate']) for (const b of $(id).querySelectorAll('button')) b.disabled = !host;
    $('roomHintIn').textContent = host ? `${mapName(net.settings.map)}. Friends join with code ${net.code}. Bots apply now; the rest from the next match.` : `${mapName(net.settings.map)}. Friends join with code ${net.code}. The host sets bots, minutes and privacy.`;
  };
  onChip('optBots', (v) => net.send('roomSettings', { bots: Number(v) }));
  onChip('optPrivate', (v) => net.send('roomSettings', { private: v === '1' }));
  onChip('optTime', (v) => { net.send('roomSettings', { time: Number(v) }); toast(`The next match will be ${v} minutes.`, 2); });
  onChip('optMap', (v) => { if (net.online) return; store.set('soloMap', v); applyMap(v); paintRoom(); });
  onChip('optPalette', (v) => { palette = v; store.set('palette', palette); u.mono.setValue(palette === 'mono' ? 1 : 0); paintRoom(); });
  onChip('optStats', (v) => { showStats = v === '1'; statsEl.hidden = !showStats; store.set('stats', showStats ? '1' : '0'); paintRoom(); });
  const openSettings = (open) => {
    $('settings').hidden = !open;
    paused = open && !net.online;
    if (open) paintRoom();
  };
  $('btnGarageIn').addEventListener('click', () => { openSettings(false); paused = !net.online; window.dispatchEvent(new CustomEvent('hsg:garage', { detail: { inGame: true } })); });
  window.addEventListener('hsg:garageClosed', () => { paused = false; });
  // ---------------------------------------------------------------- the garage showroom
  // A live copy of the buggy being configured, framed close by the camera.
  let showcase = null, showT = 0;
  function preview(setup) {
    if (!setup) {
      if (showcase) removeCar('preview');
      showcase = null;
      if (me) me.root.enabled = !me.wrecked;
      return;
    }
    const key = packSetup({ ...setup, ride: vehicleSpec(setup.ride).id });
    if (!showcase || showcase.setupKey !== key) {
      if (showcase) removeCar('preview');
      showcase = makeCar({ id: 'preview', local: false, vehicle: setup.ride, colorIdx: 0, name: '', hat: setup.hat, setup });
      showcase.isPreview = true;
    }
    const x0 = me ? Math.round(me.body.p[0]) : 0.5;
    showcase.body.set(x0, terrain.height(x0) + showcase.reach - 0.35 * showcase.rest, 0);
    showcase.setFacing(1); showcase.holderYaw = 90;
    if (me) me.root.enabled = false;
  }
  function framePreview(dt) {
    if (!showcase) return false;
    showT += dt;
    const b = showcase.body, big = 7 + showcase.body.bound * 2.2 + (showcase.setup.roof !== 'none' ? 1.5 : 0);
    camX += (b.p[0] + 0.4 - camX) * Math.min(1, dt * 5);
    camY += (b.p[1] - big * 0.07 - camY) * Math.min(1, dt * 5); // the car sits above the garage panel
    camZ += (big - camZ) * Math.min(1, dt * 4);
    showcase.flash = 0.4 + Math.sin(showT * 2) * 0.2;
    return true;
  }

  /** rebuild my buggy with a new setup (from the garage), dropped back in where I was */
  function applySetup(setup, force = false) {
    if (!me) return;
    const key = packSetup({ ...setup, ride: vehicleSpec(setup.ride).id, paint: net.online ? -1 : setup.paint });
    const colorIdx = net.online ? net.myColor : me.colorIdx;
    if (key === me.setupKey && colorIdx === me.colorIdx && !force) return;
    const x = me.body.p[0], { id: myId, name, score } = me;
    removeCar(myId);
    me = makeCar({ id: myId, local: true, vehicle: setup.ride, colorIdx, name, hat: setup.hat, setup });
    me.score = score; // a new ride mid-match keeps your smashes
    me.respawnAt(x, 2);
    net.send('profile', { vehicle: setup.ride, hat: setup.hat });
    updateHud(true);
  }
  $('btnSettings').addEventListener('click', () => openSettings(true));
  $('btnClose').addEventListener('click', () => openSettings(false));
  let leaveT = 0;
  $('btnLeave').addEventListener('click', () => { // tap twice: leaving a room you host closes it for everyone
    if (performance.now() - leaveT < 2500) { portal.leftRoom(); net.leave(); location.reload(); return; }
    leaveT = performance.now();
    $('btnLeave').textContent = net.online && net.isHost ? 'CLOSE ROOM?' : 'SURE?';
    setTimeout(() => { $('btnLeave').textContent = 'LEAVE'; }, 2500);
  });
  // Esc (or P: Esc also leaves fullscreen) opens the ≡ menu, only once you're driving: not over the
  // title menu or the room's lobby, which have their own BACK / LEAVE
  window.addEventListener('keydown', (e) => {
    if ((e.code !== 'Escape' && e.code !== 'KeyP') || !started) return;
    if (e.code === 'KeyP' && e.target instanceof HTMLInputElement && e.target.type !== 'range') return; // typing
    if (roomLobby.open && $('settings').hidden) return;
    openSettings($('settings').hidden);
  });
  $('optQuality').addEventListener('change', (e) => { store.set('quality', e.target.value); quality.setManual(e.target.value); if (e.target.value === 'auto') quality.maxLevel = tier; });
  // ASCII view off
  // $('optGlyph').addEventListener('change', (e) => { glyph = e.target.value; store.set('glyphSize', glyph); ascii.setOptions({ glyphSize: glyph }); resized(); });
  $('optRenderer').addEventListener('change', (e) => { store.set('renderer', e.target.value); location.reload(); });
  // sound: two sliders, saved by audio.js
  const vols = sfx.getVolumes();
  $('optMusic').value = Math.round(vols.music * 100); $('optSfx').value = Math.round(vols.sfx * 100);
  $('optMusic').addEventListener('input', (e) => sfx.setVolumes({ music: e.target.value / 100 }));
  $('optSfx').addEventListener('input', (e) => sfx.setVolumes({ sfx: e.target.value / 100 }));
  $('optSfx').addEventListener('change', () => sfx.play('crunch', undefined, { vol: 0.8 }));
  // ASCII view off: the HUD toggle
  // const btnAscii = $('btnAscii');
  // const syncAsciiBtn = () => { btnAscii.classList.toggle('on', asciiOn); btnAscii.textContent = asciiOn ? '[@] ASCII' : '[ ] ASCII'; };
  // const setAscii = (on, save = true) => { asciiOn = on; if (save) store.set('ascii', on ? '1' : '0'); ascii.setOptions({ ascii: on || forcedAsciiT > 0 }); resized(); syncAsciiBtn(); };
  // btnAscii.addEventListener('click', (e) => { e.stopPropagation(); setAscii(!asciiOn); });
  // syncAsciiBtn();
  document.addEventListener('visibilitychange', () => { app.timeScale = document.hidden && !net.online ? 0 : 1; });

  function updateBoard() {
    const rows = allCars().map((c) => ({ name: c.name, score: c.score, bot: c.isBot || String(c.id).startsWith('bot'), me: c === me, veh: c.spec.name }));
    rows.sort((a, b) => b.score - a.score);
    $('boardRows').innerHTML = rows.map((r) => `<tr class="${r.me ? 'me' : ''}"><td>${r.name.replace(/[<>&]/g, '')}${r.bot ? ' <small>bot</small>' : ''}</td><td>${r.veh}</td><td>${r.score}</td></tr>`).join('');
  }
  let hudT = 0;
  function updateHud(force) {
    hudT -= 1 / 60;
    if (!force && hudT > 0) return;
    hudT = 0.1;
    if (!me) return;
    const bar = (v, n = 10) => `${'#'.repeat(Math.round(clamp(v, 0, 1) * n))}${'.'.repeat(n - Math.round(clamp(v, 0, 1) * n))}`;
    $('hpBar').textContent = `HP    [${bar(me.hp / 100)}]`;
    $('boostBar').textContent = me.gadget === 'rocket' ? 'BOOST [ROCKET!!!!]' : `BOOST [${bar(me.boost)}]`;
    $('hpBar').classList.toggle('low', me.hp < 35);
    const g = me.gadget;
    $('gadget').hidden = !g;
    const active = ['mine', 'horn', 'hop'].includes(g);
    if (g) $('gadget').textContent = `${GADGETS[g].name}  ${Math.ceil(me.gadgetT)}s${active ? (touchUI ? '  · POWER' : '  · F') : ''}`;
    // the touch buttons follow what's fitted
    const short = (n) => n.split(' ').pop().toUpperCase().slice(0, 8);
    $('btnRoof').hidden = !me.roofG; if (me.roofG) $('btnRoof').textContent = short(ROOF[me.setup.roof].name);
    $('btnBumper').hidden = !me.bumperG || me.setup.bumper === 'catcher'; if (me.bumperG) $('btnBumper').textContent = short(BUMPER[me.setup.bumper].name);
    $('btnGadget').hidden = !active;
    // the corner shows only what matters: your smashes (and place), or the hats in the endless glade
    const others = allCars().filter((c) => c !== me && !String(c.id).startsWith('warm') && c.id !== 'preview');
    const place = 1 + others.filter((c) => (c.score | 0) > (me.score | 0)).length;
    const ord = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
    $('mode').textContent = `SMASHES ${me.score | 0}${others.length && (me.score | 0) > 0 ? ` · ${ord(place)}` : ''}`;
    $('hats').hidden = mapId() !== 'endless';
    $('hats').textContent = `HATS ${Math.max(0, account.profile ? account.profile.owned.hats.length - 1 : sandbox.ownedHats.size)}/12`;
    $('coins').hidden = true; // coins pop up when you earn them; the total is in the menu and garage
  }

  // name tags over the cars
  const _w = new pc.Vec3(), _s = new pc.Vec3();
  /** cars inside a smoke cloud vanish from everyone else's screen (you always see yourself) */
  function updateSmoke() {
    for (const c of cars.values()) c.inSmoke = c !== me && !c.wrecked && Car.ctx.smokeAt(c.body.p[0], c.body.p[1]);
  }
  // arrows at the screen's edge pointing at cars you can't see (rivals; teammates fainter), with the distance
  const ptrs = [];
  const _pw = new pc.Vec3(), _ps = new pc.Vec3();
  function updatePointers() {
    const cam = ascii.sceneCam.camera, W = canvas.clientWidth, H = canvas.clientHeight;
    const list = [];
    if (me && !me.wrecked && started) {
      for (const c of allCars()) {
        if (c === me || c.wrecked || c.ghost || c.inSmoke || String(c.id).startsWith('warm') || c.id === 'preview') continue;
        _pw.set(c.body.p[0], c.body.p[1] + 0.6, 0);
        cam.worldToScreen(_pw, _ps);
        if (_ps.x > -10 && _ps.x < W + 10 && _ps.y > -10 && _ps.y < H + 10 && _ps.z > 0) continue; // on screen
        list.push({ c, sx: _ps.x, sy: _ps.y, d: Math.hypot(c.body.p[0] - me.body.p[0], c.body.p[1] - me.body.p[1]) });
      }
      list.sort((a, b) => a.d - b.d);
    }
    const n = Math.min(list.length, 7);
    while (ptrs.length < n) { const el = document.createElement('div'); el.className = 'ptr'; el.innerHTML = '<i></i><b></b>'; $('pointers').appendChild(el); ptrs.push(el); }
    const cx = W / 2, cy = H / 2, mx = 26, top = 70, bottom = touchUI ? 150 : 60;
    for (let i = 0; i < ptrs.length; i++) {
      const el = ptrs[i];
      if (i >= n) { el.style.display = 'none'; continue; }
      const { c, sx, sy, d } = list[i];
      // from the screen's centre towards the car, clamped to a box just inside the edges
      let dx = sx - cx, dy = sy - cy;
      if (!(Math.abs(dx) + Math.abs(dy) > 0.1)) { dx = c.body.p[0] > me.body.p[0] ? 1 : -1; dy = 0; }
      const hw = cx - mx, ht = cy - top, hb = H - bottom - cy;
      const k = Math.min(dx > 0 ? hw / dx : dx < 0 ? -hw / dx : Infinity, dy > 0 ? hb / dy : dy < 0 ? -ht / dy : Infinity);
      const px = cx + dx * k, py = cy + dy * k;
      const mate = sameTeam(c, me);
      el.style.display = '';
      el.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px)`;
      el.style.setProperty('--a', `${Math.atan2(dy, dx).toFixed(3)}rad`);
      el.style.setProperty('--c', net.online ? teamCSS(c.colorIdx) : '#ffb08a');
      el.classList.toggle('mate', mate);
      el.classList.toggle('near', !mate && d < 30);
      el.lastChild.textContent = `${Math.round(d)}m`;
    }
  }
  function updateTags() {
    const cam = ascii.sceneCam.camera;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    for (const [id, el] of tags) {
      const c = cars.get(id);
      if (!c || c.wrecked || c.inSmoke || !started) { el.style.display = 'none'; continue; }
      _w.set(c.body.p[0], c.body.p[1] + 1.9, 0);
      cam.worldToScreen(_w, _s);
      if (_s.x < -50 || _s.x > W + 50 || _s.y < -20 || _s.y > H + 20) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.transform = `translate(${Math.round(_s.x)}px, ${Math.round(_s.y)}px) translate(-50%, -100%)`;
      el.classList.toggle('me', c === me);
    }
  }

  // ---------------------------------------------------------------- network send (20 Hz)
  let sendT = 0;
  function sendCars(dt) {
    if (!net.online) return;
    sendT -= dt;
    if (sendT > 0) return;
    sendT = 0.05;
    for (const c of allCars()) {
      if (!c.local) continue;
      const b = c.body;
      net.send('car', {
        id: c.id, n: c.name, veh: c.vehicle, col: c.colorIdx, hat: c.hat,
        t: Math.round(performance.now()), p: b.p.map(r2), a: Math.round(b.a * 1000) / 1000, v: b.v.map(r2),
        f: (c.boosting ? 1 : 0) | (c.wrecked ? 2 : 0) | (c.flash > 0.1 ? 4 : 0) | (c.facing < 0 ? 8 : 0) | (c.ghost ? 16 : 0) | (c.popped ? 32 : 0), g: c.gadget ? GADGET_KEYS.indexOf(c.gadget) + 1 : 0, sc: c.score,
        s: c.setupKey, gs: [c.roofG ? c.roofG.state() : 0, c.bumperG ? c.bumperG.state() : 0],
      });
    }
  }

  // ---------------------------------------------------------------- lights for the shaders
  function updateLights() {
    const list = allCars().filter((c) => !c.wrecked).sort((a, b) => Math.abs(a.body.p[0] - camX) - Math.abs(b.body.p[0] - camX));
    for (let i = 0; i < NHL; i++) {
      const c = list[i];
      if (c) { c.headlight(hl); HLv[i].set(hl); } else HLv[i].fill(0);
      HL[i].setValue(HLv[i]);
    }
    for (let i = 0; i < NFL; i++) {
      const f = fx.flashes[fx.flashes.length - 1 - i];
      if (f) { const k = 1 - f.t / f.life; FLv[i].set([f.x, f.y, f.r, f.k * k]); } else FLv[i].fill(0);
      FL[i].setValue(FLv[i]);
    }
  }

  // ---------------------------------------------------------------- frame loop
  let time = 0, statsTimer = 0, warmFrames = 0, onWarm = null;
  const WARM = 3;
  let wasBoosting = false;
  app.on('update', (rawDt) => {
    if (started) quality.sample(rawDt);
    const dt = Math.min(rawDt, 1 / 20);
    if (device.width && device.height) resized();
    time += dt;
    input.poll(dt);
    // ASCII view off: the V key and the Glitch-Bomb's forced ASCII
    // if (input.sightPressed) setAscii(!asciiOn);
    if (forcedAsciiT > 0) { forcedAsciiT -= dt; if (!ascii.ascii) { ascii.setOptions({ ascii: true }); resized(); } if (forcedAsciiT <= 0 && !asciiOn) { ascii.setOptions({ ascii: false }); resized(); } }
    if (started && !paused && me && dt > 1e-5 && roomLobby.open) { me.input.dir = 0; me.input.boost = false; } // in the room's lobby: hands off
    else if (started && !paused && me && dt > 1e-5) {
      const inp = me.input;
      inp.dir = input.dir; inp.boost = input.boost;
      if (input.hopPressed) inp.hop = true;
      if (input.resetPressed) inp.reset = true;
      if (input.roofPressed) { if (me.roofG) me.roofG.fire(); else useGadget(me); }
      if (input.bumperPressed && me.bumperG) me.bumperG.fire();
      if (input.gadgetPressed) useGadget(me);
      if (input.hornPressed) honk(me);
      me.flash = input.flash ? 1 : Math.max(0, me.flash - dt * 3);
      for (const br of bots.values()) br.update(dt);
      physics.step(dt);
      for (const c of allCars()) {
        if (!c.local) continue;
        const wasWet = c.wet;
        c.update(dt);
        sandbox.checkLocal(c, c.isBot, dt);
        c.wet = physics.inWater(c.body.p[0], c.body.p[1]);
        if (c.wet && !wasWet && Math.abs(c.body.v[1]) > 3) { fx.splash(c.body.p[0], terrain.water(c.body.p[0]) ?? c.body.p[1], 12); sfx.play('splash', { x: c.body.p[0], z: 0 }); }
        if (c.hopped) { c.hopped = false; sfx.play('boing', { x: c.body.p[0], z: 0 }, { vol: 0.5 }); }
        if (c.isBot) c.flash = Math.max(0, c.flash - dt * 3);
      }
      const now = performance.now();
      for (const c of allCars()) if (!c.local) c.applyRemote(now);
      // a car that's gone quiet (its phone switched apps, its tab is in the background) stays where it
      // was, marked away; it only goes if it stays silent for 30 s (a real leave is announced at once)
      for (const [id, t] of carSeen) {
        const c = cars.get(id);
        if (!c || c.local) continue;
        const away = now - t > 2500;
        if (away !== !!c.away) { c.away = away; const tg = tags.get(id); if (tg) tg.classList.toggle('away', away); }
        if (now - t > 30000) { removeCar(id); carSeen.delete(id); }
      }
      sandbox.update(dt, allCars());
      magnets(dt);
      updateGrabs();
      earnings(dt);
      // dust behind spinning wheels
      for (const c of allCars()) if (!c.wrecked && c.grounded && c.speed > 6 && !physics.inWater(c.body.p[0], c.body.p[1]) && Math.random() < dt * c.speed * 0.7) fx.dust(c.body.p[0] - c.facing * 0.9, terrain.height(c.body.p[0]), c.facing);
      sendCars(dt);
      sfx.setEngine(me.speed / me.spec.top, Math.abs(input.dir), me.boosting, me.wrecked);
      if (me.boosting && !wasBoosting) sfx.play('whoosh', undefined, { vol: 0.5 });
      wasBoosting = me.boosting;
    }
    for (const c of allCars()) c.sync(dt, time);
    fx.update(dt);
    updateCamera(dt);
    sfx.tickScene(dt);
    if (moonE && moonE.enabled) { moonE.setPosition(camX * 0.9 + 34, camY * 0.6 + 22, -80); moonE.setLocalScale(13, 13, 1); } // far behind the fog: it barely drifts
    world.update(dt, camX);
    world.stream(camX, started ? 4 : 30);
    sandbox.camX = camX;
    world.updateWater(sandbox.gushes());
    if (warmFrames > 0) {
      ascii.sceneCam.camera.frustumCulling = false;
      --warmFrames;
      if (warmFrames === WARM) { ascii.setOptions({ ascii: asciiOn }); resized(); }
      if (warmFrames === 0) { ascii.sceneCam.camera.frustumCulling = true; onWarm(); }
    }
    updateLights();
    u.time.setValue(time);
    ascii.cellMat.setParameter('uTime', time);
    sfx.setListener(camX, 0, 0);
    if (toastTimer > 0) { toastTimer -= dt; shownFor += dt; if (toastQueue.length && shownFor > 1.8) { const [m, t] = toastQueue.shift(); showLine(m, t); } else if (toastTimer <= 0) $('toast').hidden = true; } else if (toastQueue.length) { const [m, t] = toastQueue.shift(); showLine(m, t); }
    $('board').hidden = !input.board;
    if (input.board) updateBoard();
    if (started) { updateSmoke(); updateHud(); updateTags(); updatePointers(); updateClock(); }
    // CrazyGames: "gameplay" is only actual driving, not the ≡ menu, the garage, the room's lobby or the results
    portal.setPlaying(started && !paused && $('settings').hidden && $('garageUI').hidden && !roomLobby.open && $('matchEnd').hidden);
    statsTimer -= rawDt;
    if (showStats && statsTimer <= 0) {
      statsTimer = 0.5;
      statsEl.textContent = `${quality.fps.toFixed(0)} fps  ${quality.ms.toFixed(1)} ms\n${device.isWebGPU ? 'WebGPU' : 'WebGL2'}  q ${LEVELS[quality.level].name}\ncars ${cars.size}  bodies ${physics.bodies.length}  host ${net.isHost}\n${me ? `x ${me.body.p[0].toFixed(0)}  speed ${me.speed.toFixed(1)}  hp ${me.hp.toFixed(0)}  grounded ${me.grounded}` : ''}`;
    }
  });

  window.__hsg = { app, world, physics, sandbox, cars, net, fx, input, account, applySetup, preview, map: () => ({ id: mapId(), bounds: mapBounds(), gravity: mapInfo().gravity, moon: !!(moonE && moonE.enabled) }), applyMap, spawnNear: (x) => pickSpawn(me, x), get me() { return me; }, bots, get cam() { return { x: camX, y: camY, z: camZ }; }, lockCam(L) { camLock = L; },
    /** tests: give a bot a fixed loadout (rebuilds its car in place) */
    botSetup(id, setup) {
      const old = cars.get(id), brain = bots.get(id);
      if (!old || !brain) return false;
      const x = old.body.p[0], { colorIdx, name } = old;
      removeCar(id);
      const car = makeCar({ id, local: true, vehicle: setup.ride || old.vehicle, colorIdx, name, hat: setup.hat || 'straw', setup: { ...DEFAULT_SETUP, ...setup } });
      car.isBot = true; car.respawnAt(x, 0);
      brain.car = car; bots.set(id, brain);
      return true;
    }, setCam(x, y, z) { camX = x; camY = y; if (z) camZ = z; } };

  // ---------------------------------------------------------------- warm-up behind the loading screen
  loader.stage('warming the headlights', 0.72);
  await nextFrame();
  const showroom = VEHICLES.map((v, i) => { const c = makeCar({ id: `warm${i}`, local: false, vehicle: v.id, colorIdx: i, name: '' }); c.body.set(-12 + i * 3, terrain.height(-12 + i * 3) + 1, 0); return c; });
  camX = 0; camY = terrain.height(0) + 2;
  const warmed = new Promise((resolve) => { onWarm = resolve; });
  // ascii.setOptions({ ascii: !asciiOn }); // ASCII view off: no need to warm the glyph pipeline too
  resized();
  warmFrames = WARM * 2;
  app.start();
  await warmed;
  for (const c of showroom) removeCar(c.id);
  loader.stage('ready', 0.95);
  await nextFrame();

  return {
    summary: serverUrl ? 'Server found: online play available' : 'No server: solo with bots',
    online: !!serverUrl,
    serverHttp: serverUrl ? Net.httpBase(serverUrl) : '', // the room list lives on the game server
    vehicles: VEHICLES.map((v) => ({ id: v.id, name: v.name, blurb: v.blurb, speed: v.top / 21, weight: v.mass / 340, grip: v.accel / 22 })),
    hats: () => ['straw', ...[...sandbox.ownedHats].filter((h) => h !== 'straw')].map((id) => ({ id, name: HATS[id] || id })),
    account,
    applySetup,
    preview: (setup) => preview(setup),
    /** CREATE or JOIN a room from the menu: connect, then wait in the room's lobby. onEnter() is
     *  called when it's time to drive (the host pressed START, or DRIVE IN during a match). */
    async joinRoom({ how, code, name, private: priv = false, bots = 0, time = 8, map = 'glade' }, onEnter, onGarage) {
      if (!serverUrl) return { error: 'No game server.' };
      enterHook = onEnter; garageHook = onGarage;
      const setup = { ...DEFAULT_SETUP, ...account.setup };
      try {
        await net.connect(serverUrl, { how, code, name: (name || account.name || 'Driver').slice(0, 16), vehicle: vehicleSpec(setup.ride).id, hat: setup.hat || 'straw', private: priv, bots, time, map });
      } catch (err) {
        console.warn('join failed', err);
        return { error: how === 'join' ? `No room ${code} (or it's full).` : 'Could not reach the server.' };
      }
      seenPhase = net.phase;
      applyMap(roomMap());
      roomLobby.show();
      portal.inRoom(net.code, net.players.length < 8); // friends can join from CrazyGames' side too
      return { ok: true };
    },
    /** the menu's solo map choice: the world behind the menu switches to it */
    previewMap(id) { if (!started && !net.online) applyMap(id); },
    async begin(e, choice) {
      if (started) return;
      if (e) enterFullscreen();
      sfx.initAudio();
      sfx.setMusic('glade');
      const name = (choice.name || account.name || 'Driver').slice(0, 16);
      const setup = { ...DEFAULT_SETUP, ...account.setup };
      if (QUERY.get('veh') && account.owns('rides', QUERY.get('veh'))) setup.ride = QUERY.get('veh'); // ?veh= (tests, links)
      const vehicle = vehicleSpec(setup.ride).id;
      const hat = setup.hat || 'straw';
      let color = 0;
      if (net.online) color = net.myColor; // already in a room (from its lobby)
      else if (serverUrl && choice.mode !== 'solo') { // ?autostart: join or make the room and drive straight in
        try {
          await net.connect(serverUrl, { how: 'auto', code: choice.code || '', name, vehicle, hat, bots: choice.bots ?? -1, time: choice.time ?? 8, map: QUERY.get('map') || 'endless' });
          color = net.myColor;
          applyMap(roomMap());
        } catch (err) {
          console.warn('online failed', err);
          toast('Could not reach the server. Driving solo.', 3);
        }
      }
      if (!net.online) { net.id = 'local'; net.hostId = 'local'; applyMap(choice.map || 'endless'); }
      sandbox.setAuthority();
      me = makeCar({ id: net.id, local: true, vehicle, colorIdx: color, name, hat, setup });
      me.respawnAt(pickSpawn(me));
      camX = me.body.p[0]; camY = me.body.p[1] + 2;
      started = true;
      quality.cooldown = 3;
      syncBots();
      $('hud').hidden = false;
      $('meters').hidden = false;
      $('actions').hidden = !touchUI;
      canvas.focus();
      window.dispatchEvent(new Event('hsg:closeGarage'));
      roomLobby.hide();
      seenPhase = net.phase;
      if (net.online && net.match) { if (net.phase === 'playing') matchN = net.match.n; else onMatch(net.match); }
      // the controls, for your first couple of drives only
      const drives = Number(store.get('drives', '0')) + 1;
      store.set('drives', String(drives));
      if (drives <= 2) setTimeout(() => toast(touchUI ? '◀ ▶ drive · BOOST · HOP · ≡ menu' : 'A/D drive · W boost · Space hop · E / Q gadgets · Esc menu', 4), 800);
      updateHud(true);
    },
  };
}

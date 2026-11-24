// HEADLIGHT: SMASH GLADE, side view. Wires the 2D world, physics, cars, props, bots, network,
// camera, lights and HUD together. (Side-view rewrite: see next.md for status.)
import * as pc from 'playcanvas';
import { AsciiRenderer } from './ascii.js';
import { World2D } from './world2d.js';
import { Input } from './input.js';
import { QualityManager, LEVELS, detectTier, isMobile } from './quality.js';
import { setupFullscreen, enterFullscreen } from './fullscreen.js';
import { GADGETS, GADGET_KEYS, GADGET_SECONDS, HATS } from './layout.js';
import { safeAt } from './gen.js';
import { Account } from './account.js';
import { packSetup, unpackSetup, WHEELS, ROOF, BUMPER, DEFAULT_SETUP, HAT_IDS } from './catalog.js';
import { NHL, NFL, blit2dMaterial } from './sil.js';
import { Physics } from './physics2d.js';
import { Car } from './car2d.js';
import { VEHICLES, vehicleSpec } from './vehicles.js';
import { FX2D } from './fx2d.js';
import { Sandbox } from './sandbox2d.js';
import { Net } from './net.js';
import { BotBrain, botName } from './bots.js';
import * as sfx from './audio.js';

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

async function createDevice(canvas) {
  const pref = new URLSearchParams(location.search).get('gpu') || store.get('renderer', 'auto');
  const order = pref === 'webgpu' ? [pc.DEVICETYPE_WEBGPU, pc.DEVICETYPE_WEBGL2] : pref === 'webgl2' ? [pc.DEVICETYPE_WEBGL2]
    : navigator.gpu && !isMobile() ? [pc.DEVICETYPE_WEBGPU, pc.DEVICETYPE_WEBGL2] : [pc.DEVICETYPE_WEBGL2];
  return pc.createGraphicsDevice(canvas, { deviceTypes: order, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: isMobile() ? 'default' : 'high-performance' });
}

export async function startGame(loader) {
  const canvas = $('app');
  loader.stage('starting the engines', 0);
  let device;
  try { device = await createDevice(canvas); } catch (err) { console.error(err); throw new Error('This browser could not start WebGL 2 or WebGPU.'); }
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
    while ($('feed').children.length > 4) $('feed').lastChild.remove();
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
    const car = new Car({ app, layer, physics, terrain, id, local, vehicle, colorIdx, name, hat, setup });
    car.onWreck = (c) => wreck(c);
    car.body.onContact = (other, sp) => onCarContact(car, other, sp);
    cars.set(id, car);
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.textContent = name;
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

  function onCarContact(car, other, sp) {
    if (!car.local || car.wrecked) return;
    const o = other && other.car;
    if (!o) { if (sp > 9) sfx.play('crunch', { x: car.body.p[0], z: 0 }, { vol: Math.min(1, sp / 16) }); return; }
    if (sp > 4) {
      fx.sparkBurst((car.body.p[0] + o.body.p[0]) / 2, (car.body.p[1] + o.body.p[1]) / 2 + 0.3, Math.min(16, sp * 1.4), sp * 0.6);
      sfx.play('crunch', { x: car.body.p[0], z: 0 }, { vol: Math.min(1.2, sp / 10) });
    }
    car.lastHitBy = o; car.lastHitT = performance.now();
    const now = performance.now();
    // landed on from above by pogo coils, giant tires or a steam-roller: crushed
    const crusher = o.rigP.pogo || o.setup.tire >= 1.6 || o.spec.crusher;
    if (crusher && o.body.p[1] > car.body.p[1] + 0.5 && (o.body.v[1] < -3 || sp > 5) && (car.crushT || 0) < now) {
      car.crushT = now + 600;
      car.damage(30 + sp * 2, o);
      car.body.v[1] -= 4; car.body.w += (Math.random() - 0.5) * 4;
      fx.sparkBurst(car.body.p[0], car.body.p[1] + 0.6, 16, 6);
      sfx.play('crunch', { x: car.body.p[0], z: 0 }, { vol: 1.3 });
    }
    // sawblades bite
    if (o.saw && sp > 1.5 && (car.sawT || 0) < now) { car.sawT = now + 300; car.damage(7 + sp * 1.2, o); fx.sparkBurst(car.body.p[0], car.body.p[1], 10, 7); }
    // the Mega-Plow, the Shrine Dozer's blade and the cow-catcher scoop you up and over
    const plow = o.gadget === 'plow' || (o.spec.plowish && o.speed > 7) || (o.catcher && o.speed > 4);
    if (plow && sp > 3) {
      const b = car.body, d = Math.sign(b.p[0] - o.body.p[0]) || 1;
      const k = o.gadget === 'plow' ? 1 : 0.55;
      b.v[0] += d * 9 * k; b.v[1] += 12 * k; b.w += d * -5 * k;
      car.damage(25 * k, o);
      sfx.play('boing', { x: b.p[0], z: 0 });
    }
  }

  /** a hit from a gadget: applied by whoever owns the target car (bots belong to the host) */
  function shoveCar(target, vx, vy, dmg, by) {
    if (!target || target.wrecked) return;
    if (target.local) return applyShove(target, vx, vy, dmg, by);
    const owner = String(target.id).startsWith('bot') ? net.hostId : target.id;
    net.send('shove', { to: owner, car: target.id, v: [r2(vx), r2(vy)], dmg: Math.round(dmg), by: by ? by.id : null });
  }
  function applyShove(c, vx, vy, dmg, by) {
    if (c.wrecked || c.ghost) return;
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
    for (const k of killers.length ? killers : [killer]) {
      if (!k || k === c) continue;
      k.score++; net.send('score', { killer: k.id });
      if (k === me) earn(c.isBot || String(c.id).startsWith('bot') ? 'botSmash' : 'smash', 1, { smashes: 1 });
    }
    c.tornBy = null;
    if (c === me) account.stat({ wrecks: 1 });
    setTimeout(() => {
      if (!cars.has(c.id)) return; // left while wrecked
      c.unwreck(pickSpawn(c, c.body.p[0]));
      c.gadget = null;
      if (c === me) toast('A fresh buggy drops out of the fog.', 2);
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
    for (let i = 0; i < 80; i++) {
      const x = Math.round(ax + (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * (10 + i)));
      if (!safeAt(x)) continue;
      const g = gap(x);
      if (g > 9) return x;
      if (g > bestGap) { best = x; bestGap = g; }
    }
    return best ?? ax;
  }
  function onWrecked(msg) {
    const victim = nameOf(msg.id), killer = msg.killer ? nameOf(msg.killer) : null;
    if (msg.torn) { feed(`${msg.torn.map(nameOf).join(' and ')} tore ${victim} in two!`); if (me && msg.torn.includes(me.id)) toast(`You tore ${victim} in two!`, 2); if (me && msg.id === me.id) toast('Torn in two!', 2); return; }
    feed(killer && msg.killer !== msg.id ? `${killer} smashed ${victim}` : `${victim} wrecked`);
    if (me && msg.killer === me.id && msg.id !== me.id) toast(`You smashed ${victim}!`, 2);
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
    sfx.play('honk', { x: c.body.p[0], z: 0 }, { vol: c === me ? 0.8 : 1, freq: 220 + (c.colorIdx % 4) * 40 });
    c.flash = 1;
    if (c.local) net.send('honk', { id: c.id });
  }

  await account.init(serverUrl);
  const sandbox = new Sandbox({ app, layer, physics, terrain, fx, net, hooks: {
    boom: applyBoom,
    grant: (msg) => onGrant(msg),
    cars: allCars,
    hat: (id) => { account.foundHat(id); popCoins(60); toast(`You found the ${HATS[id] || id}! It's in your garage.`, 3); sfx.play('pickup'); updateHud(true); },
    sound: (name, at) => sfx.play(name, at && { x: at.x, z: 0 }, { vol: 1, maxDist: 60 }),
  } });
  function onGrant(msg) {
    sandbox.onGrant(msg);
    const c = cars.get(msg.to);
    if (c && c.local) {
      c.gadget = msg.g; c.gadgetT = GADGET_SECONDS;
      if (c === me) { toast(`${GADGETS[msg.g].name}: ${GADGETS[msg.g].hint}`, 3); sfx.play('pickup'); earn('crate'); }
    }
  }

  account.onChange((p) => { for (const h of p.owned.hats) sandbox.ownedHats.add(h); if (started) updateHud(true); });

  // ---------------------------------------------------------------- garage gadgets need these
  Car.ctx = {
    sandbox, fx, sfx, net,
    cars: allCars,
    shove: shoveCar,
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
    updateHud(true);
  }
  function earn(why, n = 1, stats = null) { popCoins(account.earn(why, n, stats)); }
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
    let c = cars.get(s.id);
    if (c && c.local) return;
    if (net.isHost && String(s.id).startsWith('bot')) return; // a late packet from the old host's bots
    if (!c || c.vehicle !== s.veh || (s.s && c.setupKey !== s.s)) { if (c) removeCar(s.id); c = makeCar({ id: s.id, local: false, vehicle: s.veh, colorIdx: s.col || 0, name: s.n, hat: s.hat, setup: s.s ? unpackSetup(s.s) : null }); }
    if (s.gs) { if (c.roofG) c.roofG.setState(s.gs[0]); if (c.bumperG) c.bumperG.setState(s.gs[1]); }
    c.ghost = !!(s.f & 16);
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
  net.on('left', (m) => removeCar(m.id));
  net.on('boom', applyBoom);
  net.on('grant', (m) => onGrant(m));
  net.on('shock', shockwave);
  net.on('grabCar', (m) => { const c = cars.get(m.car); if (c && c.local) applyGrab(c, m.by); });
  net.on('throwCar', (m) => { const c = cars.get(m.car); if (c && c.local) applyThrow(c, m.v[0], m.v[1], m.by); });
  net.on('torn', (m) => { const c = cars.get(m.id); if (c && !c.local && !c.wrecked) c.tear(m.xs || []); });
  net.on('shove', (m) => { const c = cars.get(m.car); if (c && c.local) applyShove(c, m.v[0], m.v[1], m.dmg || 0, cars.get(m.by) || null); });
  // net.on('glitch', glitch); // ASCII view off
  net.on('honk', (m) => { const c = cars.get(m.from); if (c) { c.flash = 1; sfx.play('honk', { x: c.body.p[0], z: 0 }, { freq: 220 + (c.colorIdx % 4) * 40 }); } });
  net.on('wrecked', onWrecked);
  net.on('world', (m) => sandbox.applyWorld(m));
  net.on('hitProp', (m) => sandbox.onRemoteHit(m));
  net.on('pickup', (m) => sandbox.onRemotePickup(m));
  net.on('mine', (m) => sandbox.isHost && sandbox.dropMine(m.p, m.v, m.from));
  net.on('projectile', (m) => sandbox.isHost && sandbox.spawnProjectile(m.k, m.p, m.v, m.from));
  net.on('shoveProp', (m) => sandbox.isHost && sandbox.shove(m.id, m.v[0], m.v[1], m.from, m.sp));
  net.on('grab', (m) => { if (sandbox.isHost) sandbox.grab(sandbox.dyn.get(m.id), m.from); });
  net.on('throw', (m) => { if (sandbox.isHost) { const P = sandbox.dyn.get(m.id); if (P && P.heldBy === m.from) sandbox.throw(P, m.from, m.v[0], m.v[1]); } });
  net.on('snap', (m) => { if (sandbox.isHost) { const T = sandbox.trees.get(m.i); if (T) sandbox.snapTree(T, m.dir, m.from); } });
  net.on('snapped', (m) => { const T = sandbox.trees.get(m.i); if (T && !T.snapped) sandbox.hideTree(T); });
  net.on('regrow', (m) => { const T = sandbox.trees.get(m.i); if (T && T.snapped) sandbox.regrow(T); });
  net.on('slide', (m) => { if (sandbox.isHost) { const sl = sandbox.slides.get(m.i); if (sl) sandbox.releaseSlide(sl); } });
  net.on('rumble', (m) => sfx.play('rumble', { x: m.x, z: 0 }, { maxDist: 70 }));
  net.on('roster', () => { syncBots(); updateBoard(); if (!$('settings').hidden) paintRoom(); });
  net.on('becameHost', () => { toast('You are now hosting the glade.', 2.5); for (const id of [...cars.keys()]) if (String(id).startsWith('bot') && !bots.has(id)) removeCar(id); sandbox.setAuthority(); syncBots(); });
  // the room is gone (the host left, or the server went away): back to the menu, with the reason
  net.on('disconnected', (m) => {
    const why = m.reason || 'Lost the connection to the server.';
    showLine(why, 4);
    paused = true;
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
        const setup = { wheels, tire: wheels === 'tires' || wheels === 'saw' ? Math.round((0.8 + Math.random() * 0.9) * 10) / 10 : 1, roof: Math.random() < 0.75 ? pick(ROOF) : 'none', bumper: Math.random() < 0.75 ? pick(BUMPER) : 'none', hat: HAT_IDS[(i * 5) % HAT_IDS.length] };
        const car = makeCar({ id, local: true, vehicle: VEHICLES[(i * 3 + 1) % VEHICLES.length].id, colorIdx: i + 1, name: botName(i), hat: setup.hat, setup });
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
  $('optStats').checked = showStats;
  $('optQuality').value = savedQ; $('optPalette').value = palette;
  // $('optGlyph').value = glyph; // ASCII view off
  $('optRenderer').value = store.get('renderer', 'auto');
  let paused = false;
  // the room box in settings: the invite code, and (for the host) bots and privacy
  const paintRoom = () => {
    $('roomBox').hidden = !net.online;
    if (!net.online) return;
    $('roomCodeIn').textContent = net.code || 'PUBLIC';
    $('optBots').value = String(net.settings.bots);
    $('optPrivate').checked = !!net.settings.private;
    const host = net.isHost;
    $('optBots').disabled = !host; $('optPrivate').disabled = !host || !net.code;
    $('roomHintIn').textContent = !net.code ? 'The public glade. Make a private room from the menu: CO-OP, then CREATE.' : host ? `Friends join with code ${net.code}.` : `Friends join with code ${net.code}. The host sets bots and privacy.`;
  };
  $('optBots').addEventListener('change', (e) => net.send('roomSettings', { bots: Number(e.target.value) }));
  $('optPrivate').addEventListener('change', (e) => net.send('roomSettings', { private: e.target.checked }));
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
  function applySetup(setup) {
    if (!me) return;
    const key = packSetup({ ...setup, ride: vehicleSpec(setup.ride).id });
    if (key === me.setupKey) return;
    const x = me.body.p[0], { id: myId, colorIdx, name } = me;
    removeCar(myId);
    me = makeCar({ id: myId, local: true, vehicle: setup.ride, colorIdx, name, hat: setup.hat, setup });
    me.respawnAt(x, 2);
    net.send('profile', { vehicle: setup.ride, hat: setup.hat });
    toast(`${me.spec.name} is ready.`, 2);
    updateHud(true);
  }
  $('btnSettings').addEventListener('click', () => openSettings(true));
  $('btnClose').addEventListener('click', () => openSettings(false));
  $('btnLeave').addEventListener('click', () => { net.leave(); location.reload(); });
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape') openSettings($('settings').hidden); });
  $('optQuality').addEventListener('change', (e) => { store.set('quality', e.target.value); quality.setManual(e.target.value); if (e.target.value === 'auto') quality.maxLevel = tier; });
  // ASCII view off
  // $('optGlyph').addEventListener('change', (e) => { glyph = e.target.value; store.set('glyphSize', glyph); ascii.setOptions({ glyphSize: glyph }); resized(); });
  $('optPalette').addEventListener('change', (e) => { palette = e.target.value; store.set('palette', palette); u.mono.setValue(palette === 'mono' ? 1 : 0); });
  $('optRenderer').addEventListener('change', (e) => { store.set('renderer', e.target.value); location.reload(); });
  $('optStats').addEventListener('change', (e) => { showStats = e.target.checked; statsEl.hidden = !showStats; store.set('stats', showStats ? '1' : '0'); });
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
    const humans = net.online ? net.players.length : 1;
    $('mode').textContent = net.online ? `ONLINE${net.code ? ` · ${net.code}` : ''} · ${humans} driver${humans > 1 ? 's' : ''} + ${Math.max(0, allCars().length - humans)} bots` : `SOLO · ${bots.size} bots`;
    $('hats').textContent = `HATS ${Math.max(0, account.profile ? account.profile.owned.hats.length - 1 : sandbox.ownedHats.size)}/12`;
    $('coins').textContent = `${account.coins.toLocaleString()} ¢`;
  }

  // name tags over the cars
  const _w = new pc.Vec3(), _s = new pc.Vec3();
  function updateTags() {
    const cam = ascii.sceneCam.camera;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    for (const [id, el] of tags) {
      const c = cars.get(id);
      if (!c || c.wrecked || !started) { el.style.display = 'none'; continue; }
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
        f: (c.boosting ? 1 : 0) | (c.wrecked ? 2 : 0) | (c.flash > 0.1 ? 4 : 0) | (c.facing < 0 ? 8 : 0) | (c.ghost ? 16 : 0), g: c.gadget ? GADGET_KEYS.indexOf(c.gadget) + 1 : 0, sc: c.score,
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
    if (started && !paused && me && dt > 1e-5) {
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
      for (const [id, t] of carSeen) if (now - t > 4000 && cars.get(id) && !cars.get(id).local) { removeCar(id); carSeen.delete(id); }
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
    if (started) { updateHud(); updateTags(); }
    statsTimer -= rawDt;
    if (showStats && statsTimer <= 0) {
      statsTimer = 0.5;
      statsEl.textContent = `${quality.fps.toFixed(0)} fps  ${quality.ms.toFixed(1)} ms\n${device.isWebGPU ? 'WebGPU' : 'WebGL2'}  q ${LEVELS[quality.level].name}\ncars ${cars.size}  bodies ${physics.bodies.length}  host ${net.isHost}\n${me ? `x ${me.body.p[0].toFixed(0)}  speed ${me.speed.toFixed(1)}  hp ${me.hp.toFixed(0)}  grounded ${me.grounded}` : ''}`;
    }
  });

  window.__hsg = { app, world, physics, sandbox, cars, net, fx, input, account, applySetup, preview, get me() { return me; }, bots, get cam() { return { x: camX, y: camY, z: camZ }; }, lockCam(L) { camLock = L; },
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
    vehicles: VEHICLES.map((v) => ({ id: v.id, name: v.name, blurb: v.blurb, speed: v.top / 21, weight: v.mass / 340, grip: v.accel / 22 })),
    hats: () => ['straw', ...[...sandbox.ownedHats].filter((h) => h !== 'straw')].map((id) => ({ id, name: HATS[id] || id })),
    account,
    applySetup,
    preview: (setup) => preview(setup),
    async begin(e, choice) {
      if (started) return;
      if (e) enterFullscreen();
      sfx.initAudio();
      const name = (choice.name || account.name || 'Driver').slice(0, 16);
      const setup = { ...DEFAULT_SETUP, ...account.setup };
      if (QUERY.get('veh') && account.owns('rides', QUERY.get('veh'))) setup.ride = QUERY.get('veh'); // ?veh= (tests, links)
      const vehicle = vehicleSpec(setup.ride).id;
      const hat = setup.hat || 'straw';
      let color = 0;
      if (serverUrl && choice.mode !== 'solo') {
        try {
          await net.connect(serverUrl, { code: choice.code || '', name, vehicle, hat, private: !!choice.private, bots: choice.bots ?? -1 });
          color = net.color ?? 0;
        } catch (err) {
          console.warn('online failed', err);
          toast('Could not reach the server. Driving solo.', 3);
        }
      }
      if (!net.online) { net.id = 'local'; net.hostId = 'local'; }
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
      toast(net.online ? `Dropped into the glade${net.code ? ` (room ${net.code})` : ''}. Smash something!` : 'Solo glade. The bots are already revving.', 3);
      setTimeout(() => toast(touchUI ? '◀ ▶ drive · BOOST · HOP · ≡ to change your ride' : 'A/D drive · W or Shift boost · Space hop · E gadget · Esc to change your ride', 5), 3200);
      updateHud(true);
    },
  };
}

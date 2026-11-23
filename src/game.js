import * as pc from 'playcanvas';
import { AsciiRenderer } from './ascii.js';
import { World, WORLD } from './world.js';
import { Input } from './input.js';
import { QualityManager, LEVELS, detectTier, isMobile } from './quality.js';
import { clamp } from './noise.js';
import { setupFullscreen, enterFullscreen } from './fullscreen.js';
import { LAYOUT, GADGETS, GADGET_KEYS, GADGET_SECONDS, HATS } from './layout.js';
import { NL, NS } from './shaders.js';
import { Physics, V } from './physics.js';
import { Car, CAR_COLOR_NAMES } from './vehicle.js';
import { VEHICLES, vehicleSpec } from './vehicles.js';
import { FX } from './fx.js';
import { Sandbox } from './sandbox.js';
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
const TARGET_CARS = 6; // humans + bots

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
  let glyph = store.get('glyphSize', 's');
  let asciiOn = store.get('ascii', '0') === '1';
  let palette = store.get('palette', 'color');
  let forcedAsciiT = 0; // ASCII Glitch-Bomb

  const ascii = new AsciiRenderer(app);
  const layers = { world: ascii.layerWorld, reflect: ascii.layerReflect };
  const world = new World(app, layers, tier);
  const steps = world.steps();
  for (let i = 0; i < steps.length; i++) { loader.stage(steps[i][0], 0.08 + (i / steps.length) * 0.5); await nextFrame(); steps[i][1](); }

  loader.stage('checking for other drivers', 0.6);
  const serverUrl = await Net.findServer();
  const net = new Net();
  const physics = new Physics(world);
  const fx = new FX(app, layers, world);
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
  const cars = new Map(); // id -> Car (local, bots, remotes)
  const bots = new Map(); // id -> BotBrain (host only)
  let me = null;
  const allCars = () => [...cars.values()];
  const nameOf = (id) => { const c = cars.get(id); return c ? c.name : 'someone'; };

  function makeCar({ id, local, vehicle, colorIdx, name, hat }) {
    const car = new Car({ app, layers, physics, world, id, local, vehicle, colorIdx, name, hat });
    car.onWreck = (c) => wreck(c);
    car.body.onContact = (other, sp) => onCarContact(car, other, sp);
    cars.set(id, car);
    return car;
  }
  function removeCar(id) { const c = cars.get(id); if (c) { c.destroy(); cars.delete(id); bots.delete(id); } }

  function onCarContact(car, other, sp) {
    if (!car.local || car.wrecked) return;
    const o = other.car;
    if (!o) return;
    if (sp > 4) { fx.sparkBurst((car.body.p[0] + o.body.p[0]) / 2, (car.body.p[1] + o.body.p[1]) / 2 + 0.5, (car.body.p[2] + o.body.p[2]) / 2, Math.min(20, sp * 1.5), sp * 0.6); sfx.play('crunch', { x: car.body.p[0], z: car.body.p[2] }, { vol: Math.min(1.2, sp / 10) }); }
    car.lastHitBy = o; car.lastHitT = performance.now();
    // the Mega-Plow (and the Shrine Dozer's blade) scoop you up and fling you skyward
    const plow = o.gadget === 'plow' || (o.spec.plowish && o.speed > 7);
    if (plow && sp > 3) {
      const b = car.body, dx = b.p[0] - o.body.p[0], dz = b.p[2] - o.body.p[2], d = Math.hypot(dx, dz) || 1;
      const k = o.gadget === 'plow' ? 1 : 0.55;
      b.v[0] += (dx / d) * 9 * k; b.v[2] += (dz / d) * 9 * k; b.v[1] += 13 * k;
      b.w[0] += (Math.random() - 0.5) * 6; b.w[2] += (Math.random() - 0.5) * 6;
      car.damage(25 * k, o);
      sfx.play('boing', { x: b.p[0], z: b.p[2] });
    }
  }

  // explosions reach my car (and my bots) wherever they come from
  function applyBoom(msg) {
    fx.explosion(msg.x, msg.y, msg.z, msg.s, camPos);
    sfx.play('boom', { x: msg.x, z: msg.z }, { vol: 1.3 * msg.s, maxDist: 90 });
    const R = 7.5 * msg.s;
    for (const c of allCars()) {
      if (!c.local || c.wrecked) continue;
      const b = c.body, dx = b.p[0] - msg.x, dy = b.p[1] - msg.y, dz = b.p[2] - msg.z, d = Math.hypot(dx, dy, dz);
      if (d > R) continue;
      const k = 1 - d / R, n = d > 0.01 ? 1 / d : 0;
      b.v[0] += dx * n * k * 12 * msg.s; b.v[2] += dz * n * k * 12 * msg.s; b.v[1] += (9 + 8 * k) * msg.s * (0.5 + k * 0.5);
      b.w[0] += (Math.random() - 0.5) * 9 * k; b.w[2] += (Math.random() - 0.5) * 9 * k; b.w[1] += (Math.random() - 0.5) * 4 * k;
      const attacker = msg.by ? cars.get(msg.by) : null;
      c.damage(Math.min(100, 120 * k * msg.s), attacker && attacker !== c ? attacker : c.lastHitBy);
    }
  }

  function wreck(c) {
    if (c.wrecked) return;
    const p = c.body.p;
    c.wreck();
    fx.explosion(p[0], p[1], p[2], 0.8, camPos);
    sfx.play('boom', { x: p[0], z: p[2] }, { vol: 1 });
    const killer = c.lastHitBy && performance.now() - c.lastHitT < 4500 ? c.lastHitBy : null;
    net.send('wrecked', { id: c.id, killer: killer ? killer.id : null });
    onWrecked({ id: c.id, killer: killer ? killer.id : null });
    if (killer && killer !== c) { killer.score++; net.send('score', { killer: killer.id }); }
    setTimeout(() => {
      const sp = LAYOUT.spawns[Math.floor(Math.random() * LAYOUT.spawns.length)];
      c.unwreck(sp);
      c.gadget = null;
      if (c === me) toast('A fresh buggy drops out of the fog.', 2);
    }, 2000);
  }
  function onWrecked(msg) {
    const victim = nameOf(msg.id), killer = msg.killer ? nameOf(msg.killer) : null;
    feed(killer && msg.killer !== msg.id ? `${killer} smashed ${victim}` : `${victim} wrecked`);
    if (me && msg.killer === me.id && msg.id !== me.id) toast(`You smashed ${victim}!`, 2);
  }

  // gadgets
  function useGadget(c) {
    if (!c.gadget || c.wrecked) return;
    const b = c.body, p = b.p;
    if (c.gadget === 'mine') {
      if ((c.mineCd || 0) > performance.now()) return;
      c.mineCd = performance.now() + 1500;
      b.axis(2, _fw);
      sandbox.dropMine([p[0] - _fw[0] * 2.2, p[1] + 0.2, p[2] - _fw[2] * 2.2], b.v, c.id);
      sfx.play('beep', { x: p[0], z: p[2] });
    } else if (c.gadget === 'horn') {
      shockwave({ x: p[0], y: p[1], z: p[2], by: c.id });
      net.send('shock', { x: r2(p[0]), y: r2(p[1]), z: r2(p[2]), by: c.id });
    } else if (c.gadget === 'hop') {
      if (c.grounded) { b.v[1] += 9.5; sfx.play('boing', { x: p[0], z: p[2] }); }
    } else if (c.gadget === 'glitch') {
      net.send('glitch', { x: r2(p[0]), z: r2(p[2]), by: c.id });
      glitch({ x: p[0], z: p[2], by: c.id });
      c.gadget = null;
    }
  }
  function shockwave(msg) {
    fx.ring(msg.x, msg.z, 10, 1, 22);
    sfx.play('foghorn', { x: msg.x, z: msg.z }, { vol: 1.2, maxDist: 70 });
    for (const c of allCars()) {
      if (!c.local || c.wrecked || c.id === msg.by) continue;
      const b = c.body, dx = b.p[0] - msg.x, dz = b.p[2] - msg.z, d = Math.hypot(dx, dz);
      if (d > 10) continue;
      const k = 1 - d / 10;
      b.v[0] += (dx / (d || 1)) * 16 * k; b.v[2] += (dz / (d || 1)) * 16 * k; b.v[1] += 5 * k;
      c.lastHitBy = cars.get(msg.by) || c.lastHitBy; c.lastHitT = performance.now();
    }
    if (net.isHost) physics.blast(msg.x, msg.y, msg.z, 10, 10, (bb) => !!bb.prop);
  }
  function glitch(msg) {
    fx.ring(msg.x, msg.z, 18, 1, 30);
    sfx.play('glitch', { x: msg.x, z: msg.z }, { vol: 1, maxDist: 60 });
    if (me && msg.by !== me.id && Math.hypot(me.body.p[0] - msg.x, me.body.p[2] - msg.z) < 18) { forcedAsciiT = 10; toast(`${nameOf(msg.by)} glitched your eyes into ASCII!`, 3); }
  }
  function honk(c) {
    if (c.gadget === 'horn') return useGadget(c);
    sfx.play('honk', { x: c.body.p[0], z: c.body.p[2] }, { vol: c === me ? 0.8 : 1, freq: 220 + (c.colorIdx % 4) * 40 });
    if (c.local) net.send('honk', { id: c.id });
  }

  const sandbox = new Sandbox({ app, layers, world, physics, fx, net, hooks: {
    boom: applyBoom,
    grant: (msg) => onGrant(msg),
    cars: allCars,
    hat: (id) => { if (me) { me.setHat(id); store.set('hat', id); net.send('profile', { hat: id }); } toast(`You found the ${HATS[id] || id}!`, 3); sfx.play('pickup'); updateHud(true); },
    sound: (name, at) => sfx.play(name, at, { vol: 1 }),
  } });
  function onGrant(msg) {
    sandbox.onGrant(msg);
    const c = cars.get(msg.to);
    if (c && c.local) {
      c.gadget = msg.g; c.gadgetT = GADGET_SECONDS;
      if (c === me) { toast(`${GADGETS[msg.g].name}: ${GADGETS[msg.g].hint}`, 3); sfx.play('pickup'); }
    }
  }

  // ---------------------------------------------------------------- network handlers
  const carStates = new Map();
  net.on('car', (s) => {
    let c = cars.get(s.id);
    if (c && c.local) return;
    if (!c || c.vehicle !== s.veh || c.colorIdx !== s.col) { if (c) removeCar(s.id); c = makeCar({ id: s.id, local: false, vehicle: s.veh, colorIdx: s.col, name: s.n, hat: s.hat }); }
    c.name = s.n || c.name;
    if (s.hat && s.hat !== c.hat) c.setHat(s.hat);
    c.pushRemote(s, performance.now());
    c.steer = s.st;
    c.boosting = !!(s.f & 1);
    c.flash = s.f & 4 ? 1 : 0;
    c.gadget = s.g ? GADGET_KEYS[s.g - 1] : null;
    c.score = s.sc || 0;
    const wrecked = !!(s.f & 2);
    if (wrecked && !c.wrecked) c.wreck();
    if (!wrecked && c.wrecked) c.unwreck([s.p[0], s.p[2]]);
    carStates.set(s.id, performance.now());
  });
  net.on('left', (m) => { removeCar(m.id); });
  net.on('boom', applyBoom);
  net.on('grant', (m) => onGrant(m));
  net.on('shock', shockwave);
  net.on('glitch', glitch);
  net.on('honk', (m) => { const c = cars.get(m.from); if (c) sfx.play('honk', { x: c.body.p[0], z: c.body.p[2] }, { freq: 220 + (c.colorIdx % 4) * 40 }); });
  net.on('wrecked', onWrecked);
  net.on('world', (m) => sandbox.applyWorld(m));
  net.on('hitProp', (m) => sandbox.onRemoteHit(m));
  net.on('pickup', (m) => sandbox.onRemotePickup(m));
  net.on('mine', (m) => sandbox.isHost && sandbox.dropMine(m.p, m.v, m.from));
  net.on('snap', (m) => { if (sandbox.isHost) { const T = sandbox.trees[m.i]; if (T) sandbox.snapTree(T, m.dir, m.from); } });
  net.on('snapped', (m) => { const T = sandbox.trees[m.i]; if (T && !T.snapped) sandbox.hideTree(T); });
  net.on('geyser', (m) => { if (sandbox.isHost) { const g = sandbox.geysers[m.i]; if (g) { g.phase = 2; g.t = 0.6; } } });
  net.on('roster', () => { syncBots(); updateBoard(); });
  net.on('becameHost', () => { toast('You are now hosting the glade.', 2.5); for (const id of [...cars.keys()]) if (String(id).startsWith('bot')) removeCar(id); syncBots(); });
  net.on('disconnected', () => { toast('Lost the server. Driving solo now.', 3); net.hostId = net.id; syncBots(); });

  function syncBots() {
    if (!net.isHost) { for (const id of [...bots.keys()]) removeCar(id); return; }
    const humans = net.online ? net.players.length : 1;
    const want = Math.max(0, TARGET_CARS - humans);
    const used = new Set(net.online ? net.players.map((p) => p.color) : [me ? me.colorIdx : 0]);
    let i = 0;
    while (bots.size < want && i < 12) {
      const id = `bot${i}`;
      if (!cars.has(id)) {
        let color = 0;
        while (used.has(color) && color < 7) color++;
        used.add(color);
        const car = makeCar({ id, local: true, vehicle: VEHICLES[(i * 3 + 1) % VEHICLES.length].id, colorIdx: color, name: botName(i), hat: Object.keys(HATS)[(i * 5) % 13] });
        car.isBot = true;
        car.unwreck(LAYOUT.spawns[(i * 3 + 2) % LAYOUT.spawns.length]);
        bots.set(id, new BotBrain(car, sandbox, game));
      }
      i++;
    }
    while (bots.size > want) { const id = [...bots.keys()].pop(); removeCar(id); }
  }

  const game = { cars: allCars, world, useGadget, honk };

  // ---------------------------------------------------------------- render plumbing
  const dummy = new pc.Texture(device, { width: 1, height: 1, format: pc.PIXELFORMAT_RGBA8, mipmaps: false });
  const waterMat = world.mats.water;
  const scope = device.scope;
  const U = (n) => scope.resolve(n);
  const u = { time: U('uTime'), player: U('uPlayer'), fog: U('uFog'), moonSky: U('uMoonSky'), wet: U('uWet'), haze: U('uHaze'), mono: U('uMono') };
  const moonDir = new Float32Array([-0.45, 0.72, -0.53]);
  { const l = Math.hypot(...moonDir); for (let i = 0; i < 3; i++) moonDir[i] /= l; }
  U('uMoonDir').setValue(moonDir);
  U('uMoonCol').setValue(new Float32Array([0.42, 0.48, 0.56]));
  U('uSkyAmb').setValue(new Float32Array([0.19, 0.22, 0.23]));
  U('uGroundAmb').setValue(new Float32Array([0.03, 0.03, 0.035]));
  const HAZE = new Float32Array([0.3, 0.35, 0.355]);
  u.haze.setValue(HAZE);
  u.mono.setValue(palette === 'mono' ? 1 : 0);
  U('uPond').setValue(new Float32Array([WORLD.pond.x, WORLD.pond.z, WORLD.pond.r]));
  U('uMire').setValue(new Float32Array([0, 0, 6, 0]));
  U('uSway').setValue(0); U('uEmissive').setValue(0); U('uNearFade').setValue(4.5);
  ascii.sceneCam.camera.clearColor = new pc.Color(HAZE[0], HAZE[1], HAZE[2], 0);
  const LP = [], LD = [], LC = [], SH = [], LPv = [], LDv = [], LCv = [], SHv = [];
  for (let i = 0; i < NL; i++) { LP.push(U(`uLP${i}`)); LD.push(U(`uLD${i}`)); LC.push(U(`uLC${i}`)); LPv.push(new Float32Array(4)); LDv.push(new Float32Array([0, -1, 0, -2])); LCv.push(new Float32Array(3)); }
  for (let i = 0; i < NS; i++) { SH.push(U(`uSH${i}`)); SHv.push(new Float32Array(4)); }
  const ringU = [0, 1, 2].map((i) => U(`uRing${i}`)), ringV = [0, 1, 2].map(() => new Float32Array(4));
  const pushU = [U('uPush0'), U('uPush1')], pushV = [new Float32Array(3), new Float32Array(3)];
  const geyU = [0, 1, 2, 3, 4].map((i) => U(`uG${i}`)), geyV = [0, 1, 2, 3, 4].map(() => new Float32Array(4));
  const ringGainU = U('uRingGain');
  const v3 = { player: new Float32Array(3), fog: new Float32Array(4), moonSky: new Float32Array(3) };
  const hl = { p: [0, 0, 0], d: [0, 0, 0] };
  const _fw = [0, 0, 0], _up = [0, 0, 0];

  let q = LEVELS[tier];
  function applyQuality(next) {
    q = next;
    device.maxPixelRatio = Math.min(window.devicePixelRatio || 1, q.dpr);
    app.resizeCanvas();
    ascii.setOptions({ ss: q.ss, reflScale: q.refl, glyphSize: glyph, normalScale: q.nd, ascii: asciiOn });
    world.setQuality(q);
    v3.fog[0] = q.fog[0] * 1.5; v3.fog[1] = q.fog[1] * 1.6; v3.fog[2] = 0.45; v3.fog[3] = 0.75;
    ascii.sceneCam.camera.farClip = v3.fog[1] + 4;
    ascii.blitMat.setParameter('uBlur', q.blur * 0.5);
    resized();
  }
  function resized() {
    if (!ascii.resize()) return;
    ascii.updateFov();
    waterMat.setParameter('uRtSize', new Float32Array(ascii.sceneSize));
    waterMat.setParameter('uRefl', ascii.reflectRT ? ascii.reflectRT.colorBuffer : dummy);
    waterMat.setParameter('uReflOn', ascii.reflectRT ? 1 : 0);
  }
  if (savedQ !== 'auto') quality.setManual(savedQ);
  applyQuality(quality.settings);
  window.addEventListener('resize', () => app.resizeCanvas());
  setupFullscreen({ button: $('btnFull'), canvas, touchDevice: touchUI, onChange: () => app.resizeCanvas() });

  // ---------------------------------------------------------------- chase camera
  // toy camera (default): high, fixed-angle, follows the buggy like a tabletop toy; the world
  // doesn't swing around when you steer. Chase camera: classic behind-the-car view.
  let camMode = store.get('camera', 'toy');
  const cam = { yaw: 0.62, pitch: 0.4, dist: 11.5, orbit: 0, toyYaw: 0.62, toyPitch: 0.8, toyDist: info.mobile ? 17 : 19, lead: [0, 0] };
  const camPos = new pc.Vec3(0, 10, 30), camTarget = new pc.Vec3(), _look = new pc.Vec3();
  U('uOcc').setValue(0); // only trees, rocks and ruins dissolve (never the ground)
  const setOcc = () => { for (const m of [world.mats.props, world.mats.rocks, world.mats.ruins, sandbox.mats.tree]) m.setParameter('uOcc', camMode === 'toy' ? 1 : 0); };
  setOcc();
  function updateCamera(dt) {
    const c = me;
    const look = input.consumeLook(), zoom = input.consumeZoom();
    const toy = camMode === 'toy';
    if (toy) {
      cam.toyYaw += look;
      cam.toyDist = clamp(cam.toyDist * (1 + zoom), 9, 36);
    } else {
      cam.orbit += look;
      cam.orbit *= Math.exp(-dt * (input.dragging ? 0 : 1.2));
      cam.dist = clamp(cam.dist * (1 + zoom), 7, 24);
    }
    if (c) {
      const b = c.body;
      b.axis(2, _fw);
      if (!toy) {
        const heading = Math.atan2(_fw[0], _fw[2]);
        const vel = Math.atan2(b.v[0], b.v[2]);
        const target = c.speed > 4 && V.dot(b.v, _fw) > 0 ? vel : heading;
        let d = target - cam.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        cam.yaw += d * Math.min(1, dt * 3.2);
      }
      // look a little ahead of where the buggy is going
      const lk = 1 - Math.exp(-dt * 2.5);
      cam.lead[0] += ((toy ? b.v[0] * 0.28 : 0) - cam.lead[0]) * lk;
      cam.lead[1] += ((toy ? b.v[2] * 0.28 : 0) - cam.lead[1]) * lk;
      const k = 1 - Math.exp(-dt * (toy ? 5 : 7));
      camTarget.x += (b.p[0] + cam.lead[0] - camTarget.x) * k; camTarget.y += (b.p[1] + (toy ? 0.3 : 1.1) - camTarget.y) * k; camTarget.z += (b.p[2] + cam.lead[1] - camTarget.z) * k;
    }
    const yaw = toy ? cam.toyYaw : cam.yaw + cam.orbit + Math.PI;
    const pitch = toy ? cam.toyPitch : cam.pitch;
    const dist = toy ? cam.toyDist + (me ? me.speed * 0.12 : 0) : cam.dist + (me ? me.speed * 0.08 : 0);
    camPos.set(camTarget.x + Math.sin(yaw) * Math.cos(pitch) * dist, camTarget.y + Math.sin(pitch) * dist + (toy ? 0 : 1.2), camTarget.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    const minY = world.height(camPos.x, camPos.z) + 1.4;
    if (camPos.y < minY) camPos.y = minY;
    const s = fx.shake * fx.shake * 0.6;
    if (s > 0.001) { camPos.x += (Math.random() - 0.5) * s; camPos.y += (Math.random() - 0.5) * s; camPos.z += (Math.random() - 0.5) * s; }
    ascii.sceneCam.setPosition(camPos);
    if (toy) _look.copy(camTarget);
    else _look.set(camTarget.x + Math.sin(cam.yaw) * 3, camTarget.y, camTarget.z + Math.cos(cam.yaw) * 3);
    ascii.sceneCam.lookAt(_look);
    const camYaw = toy ? yaw + Math.PI : cam.yaw;
    const az = camYaw + Math.PI + 0.3, el = 0.35;
    v3.moonSky[0] = -Math.sin(az) * Math.cos(el); v3.moonSky[1] = Math.sin(el); v3.moonSky[2] = -Math.cos(az) * Math.cos(el);
    cam.listenYaw = camYaw + Math.PI;
    const pondVisible = ascii.sceneCam.camera.frustum.containsSphere(world.water.sphere) > 0;
    ascii.updateReflection(camPos, _look, WORLD.waterY, pondVisible && q.refl > 0);
  }

  // ---------------------------------------------------------------- HUD / settings
  const statsEl = $('stats');
  let showStats = store.get('stats', '0') === '1' || new URLSearchParams(location.search).has('stats');
  statsEl.hidden = !showStats;
  $('optStats').checked = showStats;
  $('optQuality').value = savedQ; $('optGlyph').value = glyph; $('optPalette').value = palette;
  $('optRenderer').value = store.get('renderer', 'auto');
  $('optCamera').value = camMode;
  $('optCamera').addEventListener('change', (e) => { camMode = e.target.value; store.set('camera', camMode); setOcc(); });
  let paused = false;
  const openSettings = (open) => { $('settings').hidden = !open; paused = open && !net.online; };
  $('btnSettings').addEventListener('click', () => openSettings(true));
  $('btnClose').addEventListener('click', () => openSettings(false));
  $('btnLeave').addEventListener('click', () => { net.leave(); location.reload(); });
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape') openSettings($('settings').hidden); });
  $('optQuality').addEventListener('change', (e) => { store.set('quality', e.target.value); quality.setManual(e.target.value); if (e.target.value === 'auto') quality.maxLevel = tier; });
  $('optGlyph').addEventListener('change', (e) => { glyph = e.target.value; store.set('glyphSize', glyph); ascii.setOptions({ glyphSize: glyph }); resized(); });
  $('optPalette').addEventListener('change', (e) => { palette = e.target.value; store.set('palette', palette); u.mono.setValue(palette === 'mono' ? 1 : 0); });
  $('optRenderer').addEventListener('change', (e) => { store.set('renderer', e.target.value); location.reload(); });
  $('optStats').addEventListener('change', (e) => { showStats = e.target.checked; statsEl.hidden = !showStats; store.set('stats', showStats ? '1' : '0'); });
  const btnAscii = $('btnAscii');
  const syncAsciiBtn = () => { btnAscii.classList.toggle('on', asciiOn); btnAscii.textContent = asciiOn ? '[@] ASCII' : '[ ] ASCII'; };
  const setAscii = (on, save = true) => { asciiOn = on; if (save) store.set('ascii', on ? '1' : '0'); ascii.setOptions({ ascii: on }); resized(); syncAsciiBtn(); };
  btnAscii.addEventListener('click', (e) => { e.stopPropagation(); setAscii(!asciiOn); });
  syncAsciiBtn();
  document.addEventListener('visibilitychange', () => { app.timeScale = document.hidden && !net.online ? 0 : 1; });

  function updateBoard() {
    const rows = allCars().map((c) => ({ name: c.name, score: c.score, bot: c.isBot || String(c.id).startsWith('bot'), me: c === me, veh: c.spec.name, col: CAR_COLOR_NAMES[c.colorIdx] }));
    rows.sort((a, b) => b.score - a.score);
    $('boardRows').innerHTML = rows.map((r) => `<tr class="${r.me ? 'me' : ''}"><td>${r.name.replace(/[<>&]/g, '')}${r.bot ? ' <small>bot</small>' : ''}</td><td>${r.veh}</td><td>${r.score}</td></tr>`).join('');
  }
  let hudT = 0;
  function updateHud(force) {
    hudT -= 1 / 60;
    if (!force && hudT > 0) return;
    hudT = 0.1;
    if (!me) return;
    const bar = (v, n = 10) => `${'#'.repeat(Math.round(Math.max(0, v) * n))}${'.'.repeat(n - Math.round(Math.max(0, v) * n))}`;
    $('hpBar').textContent = `HP    [${bar(me.hp / 100)}]`;
    $('boostBar').textContent = me.gadget === 'rocket' ? 'BOOST [ROCKET!!!!]' : `BOOST [${bar(me.boost)}]`;
    $('hpBar').classList.toggle('low', me.hp < 35);
    const g = me.gadget;
    $('gadget').hidden = !g;
    if (g) $('gadget').textContent = `${GADGETS[g].name}  ${Math.ceil(me.gadgetT)}s${['mine', 'horn', 'hop', 'glitch'].includes(g) ? (touchUI ? '  · tap GADGET' : '  · press E') : ''}`;
    const humans = net.online ? net.players.length : 1;
    $('mode').textContent = net.online ? `ONLINE${net.code ? ` · ${net.code}` : ''} · ${humans} driver${humans > 1 ? 's' : ''} + ${bots.size || Math.max(0, allCars().length - humans)} bots` : `SOLO · ${bots.size} bots`;
    $('hats').textContent = `HATS ${sandbox.ownedHats.size}/12`;
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
        p: b.p.map(r2), q: b.q.map((x) => Math.round(x * 1000) / 1000), v: b.v.map(r2), st: r2(c.steer),
        f: (c.boosting ? 1 : 0) | (c.wrecked ? 2 : 0) | (c.flash > 0.1 ? 4 : 0), g: c.gadget ? GADGET_KEYS.indexOf(c.gadget) + 1 : 0, sc: c.score,
      });
    }
  }

  // ---------------------------------------------------------------- lights for the shaders
  function updateLights() {
    // headlights of the nearest cars, then explosion flashes
    const list = allCars().filter((c) => !c.wrecked).sort((a, b) => Math.hypot(a.body.p[0] - camPos.x, a.body.p[2] - camPos.z) - Math.hypot(b.body.p[0] - camPos.x, b.body.p[2] - camPos.z));
    let li = 0;
    for (const c of list) {
      if (li >= NL - 3) break;
      c.headlight(hl);
      LPv[li].set([hl.p[0], hl.p[1], hl.p[2], hl.range]); LDv[li].set([hl.d[0], hl.d[1], hl.d[2], hl.cos]);
      const fl = 0.95 + Math.sin(sandbox.time * 31 + li) * 0.03;
      LCv[li].set([1.35 * hl.i * fl, 0.85 * hl.i * fl, 0.4 * hl.i * fl]);
      li++;
    }
    for (const f of fx.flashes) {
      if (li >= NL) break;
      const k = 1 - f.t / f.life;
      LPv[li].set([f.x, f.y, f.z, f.r]); LDv[li].set([0, -1, 0, -2]); LCv[li].set([3.2 * k, 1.7 * k, 0.6 * k]);
      li++;
    }
    for (; li < NL; li++) LCv[li].fill(0);
    for (let i = 0; i < NL; i++) { LP[i].setValue(LPv[i]); LD[i].setValue(LDv[i]); LC[i].setValue(LCv[i]); }
    // blob shadows under the nearest cars
    for (let i = 0; i < NS; i++) {
      const c = list[i];
      if (c) { const g = world.groundAt(c.body.p[0], c.body.p[2]); const h = c.body.p[1] - g; SHv[i].set([c.body.p[0], c.body.p[2], 1.3, clamp(0.65 - h * 0.1, 0, 0.65)]); } else SHv[i].fill(0);
      SH[i].setValue(SHv[i]);
    }
    for (let i = 0; i < 3; i++) { const R = fx.rings[fx.rings.length - 1 - i]; if (R) ringV[i].set([R.x, R.z, R.r, R.a]); else ringV[i].fill(0); ringU[i].setValue(ringV[i]); }
    ringGainU.setValue(asciiOn ? 1.2 : 0.6);
    for (let i = 0; i < 2; i++) { const c = list[i + 1]; pushV[i].set(c ? [c.body.p[0], c.body.p[1], c.body.p[2]] : [0, -99, 0]); pushU[i].setValue(pushV[i]); }
    for (let i = 0; i < 5; i++) geyU[i].setValue(sandbox.geyserUniform(i, geyV[i]));
  }

  // ---------------------------------------------------------------- frame loop
  let time = 0, statsTimer = 0, started = false, warmFrames = 0, onWarm = null;
  const WARM = 3;
  const engineState = { last: 0 };
  app.on('update', (rawDt) => {
    if (started) quality.sample(rawDt);
    const dt = Math.min(rawDt, 1 / 20);
    if (device.width && device.height) resized();
    time += dt;
    input.poll(dt);
    if (input.sightPressed) setAscii(!asciiOn);
    // the ASCII Glitch-Bomb: forced ASCII for a few seconds
    if (forcedAsciiT > 0) { forcedAsciiT -= dt; if (!ascii.ascii) { ascii.setOptions({ ascii: true }); resized(); } if (forcedAsciiT <= 0 && !asciiOn) { ascii.setOptions({ ascii: false }); resized(); } }
    if (started && !paused && me && dt > 1e-5) {
      const inp = me.input;
      inp.throttle = input.throttle; inp.steer = input.steer; inp.boost = input.boost; inp.brake = input.brake;
      if (input.resetPressed) inp.reset = true;
      if (input.gadgetPressed) useGadget(me);
      if (input.hornPressed) honk(me);
      me.flash = input.flash ? 1 : Math.max(0, me.flash - dt * 4);
      for (const br of bots.values()) br.update(dt);
      physics.step(dt);
      for (const c of allCars()) if (c.local) { c.update(dt); sandbox.checkLocal(c, c.isBot); }
      const now = performance.now();
      for (const c of allCars()) if (!c.local) c.applyRemote(now);
      // drop cars whose owner went quiet
      for (const [id, t] of carStates) if (now - t > 4000 && cars.get(id) && !cars.get(id).local) { removeCar(id); carStates.delete(id); }
      sandbox.update(dt, allCars());
      // dust / splashes behind fast wheels
      for (const c of allCars()) if (!c.wrecked && c.speed > 9 && c.grounded !== 0 && Math.random() < dt * c.speed * 0.6) { const b = c.body; if (b.p[1] < 0.4 && Math.hypot(b.p[0] - WORLD.pond.x, b.p[2] - WORLD.pond.z) < WORLD.pond.r + 3) fx.steam(b.p[0], 0.1, b.p[2], 1, 3); else fx.dust(b.p[0], world.groundAt(b.p[0], b.p[2]), b.p[2], 1); }
      sendCars(dt);
      sfx.setEngine(me.speed / me.spec.top, Math.abs(input.throttle), me.boosting, me.wrecked);
      if (me.boosting && !engineState.last) sfx.play('whoosh', undefined, { vol: 0.5 });
      engineState.last = me.boosting;
    }
    for (const c of allCars()) c.sync(dt, time);
    fx.update(dt);
    updateCamera(dt);
    world.update(camTarget.x, camTarget.z, camPos.x, camPos.z);
    if (warmFrames > 0) {
      world.showEverything();
      ascii.sceneCam.camera.frustumCulling = false;
      ascii.updateReflection(camPos, camTarget, WORLD.waterY, true);
      --warmFrames;
      if (warmFrames === WARM) { ascii.setOptions({ ascii: asciiOn }); resized(); }
      if (warmFrames === 0) { ascii.sceneCam.camera.frustumCulling = true; onWarm(); }
    }
    updateLights();
    if (me) { v3.player.set([me.body.p[0], me.body.p[1], me.body.p[2]]); }
    u.time.setValue(time); u.player.setValue(v3.player); u.fog.setValue(v3.fog); u.moonSky.setValue(v3.moonSky);
    u.wet.setValue(me && me.body.p[1] < 0.6 ? Math.min(1, me.speed / 8) : 0);
    ascii.cellMat.setParameter('uTime', time);
    ascii.blitMat.setParameter('uGlow', new Float32Array([0.5, 0.5, 0.1, 0]));
    sfx.setListener(camTarget.x, camTarget.z, cam.listenYaw ?? cam.yaw + Math.PI);
    if (toastTimer > 0) { toastTimer -= dt; shownFor += dt; if (toastQueue.length && shownFor > 1.8) { const [m, t] = toastQueue.shift(); showLine(m, t); } else if (toastTimer <= 0) $('toast').hidden = true; } else if (toastQueue.length) { const [m, t] = toastQueue.shift(); showLine(m, t); }
    $('board').hidden = !input.board;
    if (input.board) updateBoard();
    if (started) updateHud();
    statsTimer -= rawDt;
    if (showStats && statsTimer <= 0) {
      statsTimer = 0.5;
      statsEl.textContent = `${quality.fps.toFixed(0)} fps  ${quality.ms.toFixed(1)} ms\n${device.isWebGPU ? 'WebGPU' : 'WebGL2'}  q ${LEVELS[quality.level].name}\ncars ${cars.size}  bodies ${physics.bodies.length}  host ${net.isHost}\n${me ? `speed ${me.speed.toFixed(1)}  hp ${me.hp.toFixed(0)}  grounded ${me.grounded}` : ''}`;
    }
  });

  window.__hsg = { app, world, physics, sandbox, cars, net, fx, cam, input, get me() { return me; }, bots };

  // ---------------------------------------------------------------- warm-up behind the loading screen
  loader.stage('warming the headlights', 0.72);
  await nextFrame();
  // a car of every kind, so every mesh and pipeline exists before play
  const showroom = VEHICLES.map((v, i) => makeCar({ id: `warm${i}`, local: false, vehicle: v.id, colorIdx: i, name: v.name }));
  showroom.forEach((c, i) => { c.body.set(-8 + (i % 4) * 4, world.groundAt(-8, 30) + 1, 26 + Math.floor(i / 4) * 5); c.remote.buf.length = 0; });
  camTarget.set(-2, world.groundAt(-2, 30) + 1, 30);
  const warmed = new Promise((resolve) => { onWarm = resolve; });
  ascii.setOptions({ ascii: !asciiOn });
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
    vehicles: VEHICLES.map((v) => ({ id: v.id, name: v.name, blurb: v.blurb, speed: v.top / 25, weight: v.mass / 340, grip: v.grip / 17 })),
    hats: () => ['straw', ...[...sandbox.ownedHats].filter((h) => h !== 'straw')].map((id) => ({ id, name: HATS[id] || id })),
    async begin(e, choice) {
      if (started) return;
      if (e) enterFullscreen();
      sfx.initAudio();
      const name = (choice.name || 'Driver').slice(0, 16);
      const vehicle = vehicleSpec(choice.vehicle).id;
      const hat = choice.hat || 'straw';
      let color = 0;
      if (serverUrl && choice.mode !== 'solo') {
        try {
          await net.connect(serverUrl, { code: choice.code || '', name, vehicle, hat });
          color = net.color ?? 0;
        } catch (err) {
          console.warn('online failed', err);
          toast('Could not reach the server. Driving solo.', 3);
        }
      }
      if (!net.online) { net.id = 'local'; net.hostId = 'local'; }
      me = makeCar({ id: net.id, local: true, vehicle, colorIdx: color, name, hat });
      me.unwreck(LAYOUT.spawns[Math.floor(Math.random() * LAYOUT.spawns.length)]);
      camTarget.set(me.body.p[0], me.body.p[1], me.body.p[2]);
      { me.body.axis(2, _fw); cam.yaw = Math.atan2(_fw[0], _fw[2]); }
      camTarget.set(me.body.p[0], me.body.p[1], me.body.p[2]);
      started = true;
      quality.cooldown = 3;
      syncBots();
      $('hud').hidden = false;
      $('meters').hidden = false;
      $('actions').hidden = !touchUI;
      canvas.focus();
      toast(net.online ? `Dropped into the glade${net.code ? ` (room ${net.code})` : ''}. Smash something!` : 'Solo glade. The bots are already revving.', 3);
      setTimeout(() => toast(touchUI ? 'Left stick drives · DRIFT for tight turns · grab crates for gadgets' : 'WASD drive · Shift boost · Space drift · E gadget · H horn · R flip', 5), 3200);
      updateHud(true);
    },
  };
}

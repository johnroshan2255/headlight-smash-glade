// HEADLIGHT: SMASH GLADE, side view. Wires the 2D world, physics, cars, props, bots, network,
// camera, lights and HUD together. (Side-view rewrite: see next.md for status.)
import * as pc from 'playcanvas';
import { AsciiRenderer } from './ascii.js';
import { World2D } from './world2d.js';
import { Input } from './input.js';
import { QualityManager, LEVELS, detectTier, isMobile } from './quality.js';
import { setupFullscreen, enterFullscreen } from './fullscreen.js';
import { LAYOUT, GADGETS, GADGET_KEYS, GADGET_SECONDS, HATS } from './layout.js';
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
  const net = new Net();
  const physics = new Physics(terrain, { halfW: LAYOUT.halfW, waterY: LAYOUT.waterY, pond: LAYOUT.pond });
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

  function makeCar({ id, local, vehicle, colorIdx, name, hat }) {
    const car = new Car({ app, layer, physics, terrain, id, local, vehicle, colorIdx, name, hat });
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
    // the Mega-Plow (and the Shrine Dozer's blade) scoop you up and fling you skyward
    const plow = o.gadget === 'plow' || (o.spec.plowish && o.speed > 7);
    if (plow && sp > 3) {
      const b = car.body, d = Math.sign(b.p[0] - o.body.p[0]) || 1;
      const k = o.gadget === 'plow' ? 1 : 0.55;
      b.v[0] += d * 9 * k; b.v[1] += 12 * k; b.w += d * -5 * k;
      car.damage(25 * k, o);
      sfx.play('boing', { x: b.p[0], z: 0 });
    }
  }

  // explosions reach my car (and my bots) wherever they come from
  function applyBoom(msg) {
    fx.explosion(msg.x, msg.y, msg.s, camX);
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
      c.damage(Math.min(100, 115 * k * msg.s), attacker && attacker !== c ? attacker : c.lastHitBy);
    }
  }

  function wreck(c) {
    if (c.wrecked) return;
    const p = c.body.p;
    c.wreck();
    fx.explosion(p[0], p[1], 0.8, camX);
    sfx.play('boom', { x: p[0], z: 0 }, { vol: 1 });
    sfx.play('cork', { x: p[0], z: 0 });
    const killer = c.lastHitBy && performance.now() - c.lastHitT < 4500 ? c.lastHitBy : null;
    net.send('wrecked', { id: c.id, killer: killer ? killer.id : null });
    onWrecked({ id: c.id, killer: killer ? killer.id : null });
    if (killer && killer !== c) { killer.score++; net.send('score', { killer: killer.id }); }
    setTimeout(() => {
      c.unwreck(LAYOUT.spawns[Math.floor(Math.random() * LAYOUT.spawns.length)]);
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
    } else if (c.gadget === 'glitch') {
      net.send('glitch', { x: r2(p[0]), y: r2(p[1]), by: c.id });
      glitch({ x: p[0], y: p[1], by: c.id });
      c.gadget = null;
    }
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

  const sandbox = new Sandbox({ app, layer, physics, terrain, fx, net, hooks: {
    boom: applyBoom,
    grant: (msg) => onGrant(msg),
    cars: allCars,
    hat: (id) => { if (me) { me.setHat(id); store.set('hat', id); net.send('profile', { hat: id }); } toast(`You found the ${HATS[id] || id}!`, 3); sfx.play('pickup'); updateHud(true); },
    sound: (name, at) => sfx.play(name, at && { x: at.x, z: 0 }, { vol: 1, maxDist: 60 }),
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
  const carSeen = new Map();
  net.on('car', (s) => {
    let c = cars.get(s.id);
    if (c && c.local) return;
    if (!c || c.vehicle !== s.veh) { if (c) removeCar(s.id); c = makeCar({ id: s.id, local: false, vehicle: s.veh, colorIdx: s.col || 0, name: s.n, hat: s.hat }); }
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
  net.on('glitch', glitch);
  net.on('honk', (m) => { const c = cars.get(m.from); if (c) { c.flash = 1; sfx.play('honk', { x: c.body.p[0], z: 0 }, { freq: 220 + (c.colorIdx % 4) * 40 }); } });
  net.on('wrecked', onWrecked);
  net.on('world', (m) => sandbox.applyWorld(m));
  net.on('hitProp', (m) => sandbox.onRemoteHit(m));
  net.on('pickup', (m) => sandbox.onRemotePickup(m));
  net.on('mine', (m) => sandbox.isHost && sandbox.dropMine(m.p, m.v, m.from));
  net.on('snap', (m) => { if (sandbox.isHost) { const T = sandbox.trees[m.i]; if (T) sandbox.snapTree(T, m.dir, m.from); } });
  net.on('snapped', (m) => { const T = sandbox.trees[m.i]; if (T && !T.snapped) sandbox.hideTree(T); });
  net.on('regrow', (m) => { const T = sandbox.trees[m.i]; if (T && T.snapped) sandbox.regrow(T); });
  net.on('slide', (m) => { if (sandbox.isHost) { const sl = sandbox.slides[m.i]; if (sl) sandbox.releaseSlide(sl); } });
  net.on('rumble', (m) => sfx.play('rumble', { x: m.x, z: 0 }, { maxDist: 70 }));
  net.on('roster', () => { syncBots(); updateBoard(); });
  net.on('becameHost', () => { toast('You are now hosting the glade.', 2.5); for (const id of [...cars.keys()]) if (String(id).startsWith('bot') && !bots.has(id)) removeCar(id); sandbox.setAuthority(); syncBots(); });
  net.on('disconnected', () => { toast('Lost the server. Driving solo now.', 3); net.hostId = net.id; sandbox.setAuthority(); syncBots(); });

  function syncBots() {
    if (!net.isHost) { for (const id of [...bots.keys()]) removeCar(id); return; }
    const humans = net.online ? net.players.length : 1;
    const want = Math.max(0, TARGET_CARS - humans);
    let i = 0;
    while (bots.size < want && i < 12) {
      const id = `bot${i}`;
      if (!cars.has(id)) {
        const car = makeCar({ id, local: true, vehicle: VEHICLES[(i * 3 + 1) % VEHICLES.length].id, colorIdx: i + 1, name: botName(i), hat: Object.keys(HATS)[(i * 5) % 13] });
        car.isBot = true;
        car.respawnAt(LAYOUT.spawns[(i * 3 + 2) % LAYOUT.spawns.length]);
        bots.set(id, new BotBrain(car, sandbox, game));
      }
      i++;
    }
    while (bots.size > want) { const id = [...bots.keys()].pop(); removeCar(id); }
  }

  const game = { cars: allCars, useGadget, honk };

  // ---------------------------------------------------------------- render plumbing + uniforms
  const scope = device.scope;
  const U = (n) => scope.resolve(n);
  const u = { time: U('uTime'), mono: U('uMono'), res: U('uRes') };
  U('uWorldW').setValue(LAYOUT.halfW);
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
  let camX = 0, camY = 2, camZ = info.mobile ? 26 : 30, lead = 0;
  const camPos = new pc.Vec3();
  function updateCamera(dt) {
    camZ = clamp(camZ * (1 + input.consumeZoom()), 18, 50);
    input.consumeLook();
    const portrait = device.height > device.width;
    if (me) {
      const b = me.body;
      lead += ((me.wrecked ? 0 : me.facing * 3.5 + b.v[0] * 0.3) - lead) * (1 - Math.exp(-dt * 1.8));
      const tx = clamp(b.p[0] + lead, -LAYOUT.halfW + 14, LAYOUT.halfW - 14);
      const ty = b.p[1] + (portrait ? 1.5 : 2.6);
      camX += (tx - camX) * (1 - Math.exp(-dt * 4));
      camY += (ty - camY) * (1 - Math.exp(-dt * (Math.abs(ty - camY) > 6 ? 5 : 2.6)));
    }
    let sx = 0, sy = 0;
    const s = fx.shake * fx.shake * 0.5;
    if (s > 0.001) { sx = (Math.random() - 0.5) * s; sy = (Math.random() - 0.5) * s; }
    const z = camZ * (portrait ? 1.25 : 1);
    camPos.set(camX + sx, camY + sy + 1.2, z);
    ascii.sceneCam.setPosition(camPos);
    ascii.sceneCam.lookAt(camX + sx, camY + sy, 0);
  }

  // ---------------------------------------------------------------- HUD / settings
  const statsEl = $('stats');
  let showStats = store.get('stats', '0') === '1' || new URLSearchParams(location.search).has('stats');
  statsEl.hidden = !showStats;
  $('optStats').checked = showStats;
  $('optQuality').value = savedQ; $('optGlyph').value = glyph; $('optPalette').value = palette;
  $('optRenderer').value = store.get('renderer', 'auto');
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
  const setAscii = (on, save = true) => { asciiOn = on; if (save) store.set('ascii', on ? '1' : '0'); ascii.setOptions({ ascii: on || forcedAsciiT > 0 }); resized(); syncAsciiBtn(); };
  btnAscii.addEventListener('click', (e) => { e.stopPropagation(); setAscii(!asciiOn); });
  syncAsciiBtn();
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
    if (g) $('gadget').textContent = `${GADGETS[g].name}  ${Math.ceil(me.gadgetT)}s${['mine', 'horn', 'hop', 'glitch'].includes(g) ? (touchUI ? '  · GADGET' : '  · E') : ''}`;
    const humans = net.online ? net.players.length : 1;
    $('mode').textContent = net.online ? `ONLINE${net.code ? ` · ${net.code}` : ''} · ${humans} driver${humans > 1 ? 's' : ''} + ${Math.max(0, allCars().length - humans)} bots` : `SOLO · ${bots.size} bots`;
    $('hats').textContent = `HATS ${sandbox.ownedHats.size}/12`;
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
        p: b.p.map(r2), a: Math.round(b.a * 1000) / 1000, v: b.v.map(r2),
        f: (c.boosting ? 1 : 0) | (c.wrecked ? 2 : 0) | (c.flash > 0.1 ? 4 : 0) | (c.facing < 0 ? 8 : 0), g: c.gadget ? GADGET_KEYS.indexOf(c.gadget) + 1 : 0, sc: c.score,
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
    if (input.sightPressed) setAscii(!asciiOn);
    if (forcedAsciiT > 0) { forcedAsciiT -= dt; if (!ascii.ascii) { ascii.setOptions({ ascii: true }); resized(); } if (forcedAsciiT <= 0 && !asciiOn) { ascii.setOptions({ ascii: false }); resized(); } }
    if (started && !paused && me && dt > 1e-5) {
      const inp = me.input;
      inp.dir = input.dir; inp.boost = input.boost;
      if (input.hopPressed) inp.hop = true;
      if (input.resetPressed) inp.reset = true;
      if (input.gadgetPressed) useGadget(me);
      if (input.hornPressed) honk(me);
      me.flash = input.flash ? 1 : Math.max(0, me.flash - dt * 3);
      for (const br of bots.values()) br.update(dt);
      physics.step(dt);
      for (const c of allCars()) {
        if (!c.local) continue;
        const wasWet = c.wet;
        c.update(dt);
        sandbox.checkLocal(c, c.isBot);
        c.wet = physics.inWater(c.body.p[0], c.body.p[1]);
        if (c.wet && !wasWet && Math.abs(c.body.v[1]) > 3) { fx.splash(c.body.p[0], LAYOUT.waterY, 12); sfx.play('splash', { x: c.body.p[0], z: 0 }); }
        if (c.hopped) { c.hopped = false; sfx.play('boing', { x: c.body.p[0], z: 0 }, { vol: 0.5 }); }
        if (c.isBot) c.flash = Math.max(0, c.flash - dt * 3);
      }
      const now = performance.now();
      for (const c of allCars()) if (!c.local) c.applyRemote(now);
      for (const [id, t] of carSeen) if (now - t > 4000 && cars.get(id) && !cars.get(id).local) { removeCar(id); carSeen.delete(id); }
      sandbox.update(dt, allCars());
      // dust behind spinning wheels
      for (const c of allCars()) if (!c.wrecked && c.grounded && c.speed > 6 && !physics.inWater(c.body.p[0], c.body.p[1]) && Math.random() < dt * c.speed * 0.7) fx.dust(c.body.p[0] - c.facing * 0.9, terrain.height(c.body.p[0]), c.facing);
      sendCars(dt);
      sfx.setEngine(me.speed / me.spec.top, Math.abs(input.dir), me.boosting, me.wrecked);
      if (me.boosting && !wasBoosting) sfx.play('whoosh', undefined, { vol: 0.5 });
      wasBoosting = me.boosting;
    }
    for (const c of allCars()) c.sync(dt, time);
    fx.update(dt);
    world.update(dt);
    world.updateWater(sandbox.gushes());
    updateCamera(dt);
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

  window.__hsg = { app, world, physics, sandbox, cars, net, fx, input, get me() { return me; }, bots, get cam() { return { x: camX, y: camY, z: camZ }; }, setCam(x, y, z) { camX = x; camY = y; if (z) camZ = z; } };

  // ---------------------------------------------------------------- warm-up behind the loading screen
  loader.stage('warming the headlights', 0.72);
  await nextFrame();
  const showroom = VEHICLES.map((v, i) => { const c = makeCar({ id: `warm${i}`, local: false, vehicle: v.id, colorIdx: i, name: '' }); c.body.set(-12 + i * 3, terrain.height(-12 + i * 3) + 1, 0); return c; });
  camX = 0; camY = terrain.height(0) + 2;
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
    vehicles: VEHICLES.map((v) => ({ id: v.id, name: v.name, blurb: v.blurb, speed: v.top / 21, weight: v.mass / 340, grip: v.accel / 22 })),
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
      sandbox.setAuthority();
      me = makeCar({ id: net.id, local: true, vehicle, colorIdx: color, name, hat });
      me.respawnAt(LAYOUT.spawns[Math.floor(Math.random() * LAYOUT.spawns.length)]);
      camX = me.body.p[0]; camY = me.body.p[1] + 2;
      started = true;
      quality.cooldown = 3;
      syncBots();
      $('hud').hidden = false;
      $('meters').hidden = false;
      $('actions').hidden = !touchUI;
      canvas.focus();
      toast(net.online ? `Dropped into the glade${net.code ? ` (room ${net.code})` : ''}. Smash something!` : 'Solo glade. The bots are already revving.', 3);
      setTimeout(() => toast(touchUI ? '◀ ▶ drive · BOOST · HOP · grab glowing crates for gadgets' : 'A/D drive · W or Shift boost · Space hop · E gadget · H horn · R flip', 5), 3200);
      updateHud(true);
    },
  };
}

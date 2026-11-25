// Audio: recorded CC0 sounds and music (public/audio, see CREDITS.txt there), played with WebAudio.
// Sounds are spatialised with distance attenuation + stereo pan relative to the camera and share
// one convolution reverb for the foggy glade. If a file can't load, a small synthesised stand-in
// plays instead so the game is never silent.

let ctx = null;
let master, sfxBus, reverbSend, ambBus, musicBus;
let noiseBuf = null;
const listener = { x: 0, z: 0, yaw: 0 };
const store = { get(k, d) { try { const v = localStorage.getItem(`hsg.${k}`); return v === null ? d : Number(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(`hsg.${k}`, String(v)); } catch { /* private mode */ } } };
const vol = { music: store.get('vol.music', 0.55), sfx: store.get('vol.sfx', 1) };
const url = (f) => new URL(`audio/${f}`, document.baseURI).href;

// ------------------------------------------------------------------ the sound list
// name -> variants (one is picked at random), base volume, and random pitch spread
const BANK = {
  boom: { files: ['boom1', 'boom2', 'boom3'], vol: 1, spread: 0.08 },
  boomtail: { files: ['boomtail'], vol: 0.8, spread: 0.1 },
  crunch: { files: ['crunch1', 'crunch2', 'crunch3', 'crunch4'], vol: 0.9, spread: 0.1 },
  bump: { files: ['bump1', 'bump2'], vol: 0.8, spread: 0.12 },
  shatter: { files: ['shatter1', 'shatter2'], vol: 0.55, spread: 0.08 },
  crack: { files: ['crack1', 'crack2'], vol: 1, spread: 0.08 },
  boing: { files: ['boing1', 'boing2', 'boing3'], vol: 0.7, spread: 0.1 },
  beep: { files: ['beep'], vol: 0.45, spread: 0 },
  tick: { files: ['tick'], vol: 0.5, spread: 0 },
  glitch: { files: ['glitch'], vol: 0.8, spread: 0.05 },
  horncar: { files: ['horn-car'], vol: 0.75, spread: 0 },
  hornbulb: { files: ['horn-bulb'], vol: 0.8, spread: 0.02 },
  hornbell: { files: ['horn-bell'], vol: 0.7, spread: 0.02 },
  horntoll: { files: ['horn-toll'], vol: 0.9, spread: 0 },
  horngong: { files: ['horn-gong'], vol: 0.85, spread: 0.02 },
  hornwhistle: { files: ['horn-whistle'], vol: 0.7, spread: 0 },
  pickup: { files: ['pickup'], vol: 0.6, spread: 0 },
  jingle: { files: ['jingle'], vol: 0.6, spread: 0 },
  coins: { files: ['coins'], vol: 0.45, spread: 0.06 },
  whoosh: { files: ['whoosh1', 'whoosh2'], vol: 0.6, spread: 0.12 },
  rock: { files: ['rock1', 'rock2', 'rock3'], vol: 0.8, spread: 0.15 },
  geyser: { files: ['geyser'], vol: 0.9, spread: 0.06 },
  splash: { files: ['splash1', 'splash2', 'splash3'], vol: 0.8, spread: 0.1 },
  cork: { files: ['cork1', 'cork2'], vol: 0.8, spread: 0.1 },
  clang: { files: ['clang1', 'clang2', 'clang3'], vol: 0.6, spread: 0.08 },
  click: { files: ['click'], vol: 0.5, spread: 0.05 },
  select: { files: ['select'], vol: 0.5, spread: 0.03 },
};
const buffers = new Map(); // file -> { buf, start, dur }
let loading = null, loadedAll = false;

/** decoded sounds keep their own start/length, so MP3 padding never causes gaps */
function trimmed(buf) {
  const d = buf.getChannelData(0), n = d.length, eps = 1e-3;
  let a = 0, b = n - 1;
  while (a < n && Math.abs(d[a]) < eps) a++;
  while (b > a && Math.abs(d[b]) < eps) b--;
  return { buf, start: a / buf.sampleRate, dur: Math.max(0.005, (b - a + 1) / buf.sampleRate) };
}
const fetched = new Map(); // file -> Promise<ArrayBuffer>, so the bytes can arrive before audio is unlocked
const fetchFile = (file) => {
  if (!fetched.has(file)) fetched.set(file, fetch(url(file)).then((r) => { if (!r.ok) throw new Error(`${file}: ${r.status}`); return r.arrayBuffer(); }));
  return fetched.get(file);
};
const ALL_FILES = () => ['engine.wav', 'wind.mp3', ...new Set(Object.values(BANK).flatMap((s) => s.files.map((f) => `${f}.mp3`)))];
/** download the sound effects in the background (the menu calls this once it's showing) */
export function prefetch() { for (const f of ALL_FILES()) fetchFile(f).catch(() => {}); }
async function load(file) {
  const data = (await fetchFile(file)).slice(0); // decodeAudioData detaches the buffer
  const buf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(data, res, rej); if (p && p.catch) p.catch(rej); });
  buffers.set(file, trimmed(buf));
}
function loadAll() {
  if (loading) return loading;
  const files = ALL_FILES().slice(2);
  loading = Promise.all([load('engine.wav').then(startEngine), load('wind.mp3').then(startWind), ...files.map((f) => load(f).catch((e) => console.warn('[audio]', e.message)))]).catch((e) => console.warn('[audio]', e.message)).finally(() => { loadedAll = true; });
  return loading;
}

function makeNoise(seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
function makeImpulse(seconds = 2.8, decay = 2.2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

/** Call from a user gesture (any tap or key press). Safe to call more than once. */
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); if (music.el && music.el.paused && music.kind && !document.hidden) music.el.play().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC({ latencyHint: 'interactive' });
  master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = vol.sfx;
  sfxBus.connect(master);
  ambBus = ctx.createGain();
  ambBus.gain.value = 0;
  ambBus.connect(sfxBus);
  musicBus = ctx.createGain(); // music skips the compressor so explosions don't pump it
  musicBus.gain.value = vol.music;
  musicBus.connect(ctx.destination);
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse();
  reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.3;
  reverbSend.connect(reverb).connect(master);
  noiseBuf = makeNoise(2);
  loadAll();
  if (wantMusic) setMusic(wantMusic);
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { ctx.suspend(); if (music.el) music.el.pause(); } else { ctx.resume(); if (music.el && music.kind) music.el.play().catch(() => {}); }
  });
}

export function setListener(x, z, yaw) {
  listener.x = x;
  listener.z = z;
  listener.yaw = yaw;
}
export function setMasterVolume(v) {
  if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.4);
}
/** { music, sfx } in 0..1, saved for next time */
export function setVolumes(v) {
  for (const k of ['music', 'sfx']) if (v[k] !== undefined) { vol[k] = Math.max(0, Math.min(1, v[k])); store.set(`vol.${k}`, vol[k]); }
  if (!ctx) return;
  sfxBus.gain.setTargetAtTime(vol.sfx, ctx.currentTime, 0.05);
  musicBus.gain.setTargetAtTime(vol.music, ctx.currentTime, 0.05);
}
export const getVolumes = () => ({ ...vol });

// ------------------------------------------------------------------ building blocks
/** Output node for a sound at world (x,z) (or non-positional when x is undefined). */
function out(pos, gainV = 1, maxDist = 40, wet = 0.6) {
  const g = ctx.createGain();
  let gain = gainV;
  let pan = 0;
  if (pos && pos.x !== undefined) {
    const dx = pos.x - listener.x, dz = pos.z - listener.z;
    const d = Math.hypot(dx, dz);
    gain *= Math.max(0, 1 - d / maxDist) ** 1.6;
    const right = (dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw)) / Math.max(d, 1);
    pan = Math.max(-1, Math.min(1, right)) * 0.8;
  }
  g.gain.value = gain;
  let node = g;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    node = p;
  }
  node.connect(sfxBus);
  if (wet > 0) {
    const s = ctx.createGain();
    s.gain.value = wet;
    node.connect(s).connect(reverbSend);
  }
  return { g, gain };
}

/** one recorded sample into dest; returns false when it isn't loaded */
function sample(dest, name, t, { gain = 1, rate = 1 } = {}) {
  const S = BANK[name];
  if (!S) return false;
  const b = buffers.get(`${S.files[Math.floor(Math.random() * S.files.length)]}.mp3`);
  if (!b) return false;
  const src = ctx.createBufferSource();
  src.buffer = b.buf;
  src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * S.spread);
  const g = ctx.createGain();
  g.gain.value = S.vol * gain;
  src.connect(g).connect(dest);
  src.start(t, b.start, b.dur);
  return true;
}

// each ride's horn: [sound, playback rate, delay s, gain]. Layers at different rates make chords.
const HORNS = {
  mudrunner: [['horncar', 1, 0, 1]], // a plain car horn
  kart: [['horncar', 1.4, 0, 0.9]], // a small, high beep
  tractor: [['horncar', 0.78, 0, 1], ['horncar', 0.78, 0.24, 0.9]], // meep-meep
  bus: [['horncar', 0.6, 0, 0.9], ['horncar', 0.72, 0, 0.8]], // deep two-tone bus horn
  monster: [['horncar', 0.5, 0, 0.9], ['horncar', 0.63, 0, 0.8], ['horncar', 0.75, 0, 0.7]], // truck air horn chord
  tub: [['hornbulb', 1.3, 0, 1]], // rubber duck squeak
  barrow: [['hornbulb', 1, 0, 1], ['hornbulb', 1, 0.3, 0.9]], // clown honk-honk
  trike: [['hornbell', 1, 0, 1]], // bicycle bell
  hearse: [['horntoll', 0.72, 0, 1.1]], // a slow funeral bell
  dozer: [['horngong', 0.9, 0, 1]], // the shrine's gong
  roller: [['hornwhistle', 1, 0, 1]], // steam whistle
};
const hornOf = (ride) => HORNS[ride] || HORNS.mudrunner;

// ------------------------------------------------------------------ what each game sound is made of
// (the second function is the synthesised stand-in, used only if the recording failed to load)
const SFX = {
  boom: (d, t) => sample(d, 'boom', t) && (sample(d, 'boomtail', t + 0.05, { gain: 0.9 }), true),
  crunch: (d, t, o, loud) => sample(d, loud > 0.55 ? 'crunch' : 'bump', t),
  wreck: (d, t) => sample(d, 'crunch', t, { gain: 1.1, rate: 0.85 }) && (sample(d, 'shatter', t + 0.03), true),
  boing: (d, t) => sample(d, 'boing', t),
  beep: (d, t) => sample(d, 'beep', t) && (sample(d, 'beep', t + 0.16), true),
  tick: (d, t) => sample(d, 'tick', t),
  foghorn: (d, t) => sample(d, 'horncar', t, { rate: 0.42, gain: 1.4 }) && (sample(d, 'horncar', t + 0.02, { rate: 0.43, gain: 1.2 }), sample(d, 'horncar', t + 0.33, { rate: 0.42, gain: 1.2 }), sample(d, 'boomtail', t, { gain: 0.5, rate: 0.7 }), true),
  glitch: (d, t) => sample(d, 'glitch', t),
  honk: (d, t, o) => hornOf(o.ride).map(([n, rate, dt, gain]) => sample(d, n, t + dt, { rate, gain })).every(Boolean),
  pickup: (d, t) => sample(d, 'pickup', t),
  jingle: (d, t) => sample(d, 'jingle', t),
  coins: (d, t) => sample(d, 'coins', t),
  whoosh: (d, t) => sample(d, 'whoosh', t),
  crack: (d, t) => sample(d, 'crack', t) && (sample(d, 'rock', t + 0.06, { gain: 0.5, rate: 0.8 }), true),
  rumble: (d, t) => sample(d, 'boomtail', t, { gain: 0.8, rate: 0.6 }) && ([0.1, 0.45, 0.8, 1.2].forEach((dt) => sample(d, 'rock', t + dt + Math.random() * 0.15, { gain: 0.7 })), true),
  geyser: (d, t) => sample(d, 'geyser', t) && (sample(d, 'splash', t, { gain: 0.6 }), true),
  splash: (d, t) => sample(d, 'splash', t),
  cork: (d, t) => sample(d, 'cork', t),
  bones: (d, t) => sample(d, 'crack', t, { rate: 1.5, gain: 0.9 }) && (sample(d, 'rock', t + 0.04, { rate: 1.9, gain: 0.6 }), sample(d, 'rock', t + 0.12, { rate: 2.2, gain: 0.4 }), true),
  splat: (d, t) => sample(d, 'splash', t, { rate: 0.7, gain: 1.1 }) && (sample(d, 'bump', t, { rate: 0.8, gain: 0.7 }), true),
  pop: (d, t) => sample(d, 'cork', t, { rate: 0.5, gain: 1.5 }) && (sample(d, 'bump', t, { gain: 0.7, rate: 1.3 }), true),
  slick: (d, t) => sample(d, 'splash', t, { rate: 0.55, gain: 0.8 }),
  smoke: (d, t) => sample(d, 'whoosh', t, { rate: 0.6, gain: 1.1 }) && (sample(d, 'cork', t, { rate: 0.8 }), true),
  clang: (d, t) => sample(d, 'clang', t),
  click: (d, t) => sample(d, 'click', t),
  select: (d, t) => sample(d, 'select', t),
};

// tiny synthesised stand-ins (only heard if the recordings could not be fetched)
function noise(dest, t0, dur, { type = 'bandpass', freq = 1000, q = 1, peak = 1 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t0, Math.random());
  src.stop(t0 + dur + 0.1);
}
const FALLBACK = {
  boom: (d, t) => noise(d, t, 1.4, { type: 'lowpass', freq: 500, peak: 1.4 }),
  rumble: (d, t) => noise(d, t, 2, { type: 'lowpass', freq: 250, peak: 0.9 }),
  default: (d, t) => noise(d, t, 0.2, { freq: 900, q: 0.8, peak: 0.6 }),
};

/**
 * Plays a sound. pos = {x, z} for positional sounds (omit for UI / player-attached).
 * opt: { vol, maxDist, wet, freq }
 */
export function play(name, pos, opt = {}) {
  if (!ctx || ctx.state !== 'running') return;
  const fn = SFX[name];
  if (!fn) return;
  const v = opt.vol ?? 1;
  const { g: d, gain } = out(pos, v, opt.maxDist ?? 50, opt.wet ?? 0.3);
  if (gain < 0.003) { d.disconnect(); return; } // too far away to hear
  const t = ctx.currentTime + 0.005;
  stats.played[name] = (stats.played[name] || 0) + 1;
  // still loading: stay quiet; loaded but this file failed: the synthesised stand-in
  if (!fn(d, t, opt, v) && loadedAll && !['click', 'select', 'coins', 'tick'].includes(name)) { (FALLBACK[name] || FALLBACK.default)(d, t); stats.fallback[name] = (stats.fallback[name] || 0) + 1; }
  setTimeout(() => { try { d.disconnect(); } catch { /* gone */ } }, 9000);
}

// ------------------------------------------------------------------ wind + engine
function startWind() {
  const b = buffers.get('wind.mp3');
  if (!b) return;
  const src = ctx.createBufferSource();
  src.buffer = b.buf;
  src.loop = true;
  src.loopStart = b.start;
  src.loopEnd = b.start + b.dur;
  const g = ctx.createGain();
  g.gain.value = scene.wind;
  windGain = g;
  src.connect(g).connect(ambBus);
  src.start(0, b.start + Math.random() * b.dur * 0.8);
  ambBus.gain.setTargetAtTime(1, ctx.currentTime, 2.5);
}

let windGain = null, bed = null, callT = 0;
/** the map changed: its music (when the glade music is on), its ambience bed, its far-off calls */
export function setScene(id) {
  const next = SCENES[id] ? id : 'glade';
  if (next === sceneId && bed !== undefined) { /* same scene */ }
  sceneId = next; scene = SCENES[next];
  if (!ctx) return;
  if (windGain) windGain.gain.setTargetAtTime(scene.wind, ctx.currentTime, 1.5);
  // swap the bed: fade the old one out, load and fade the new one in
  if (bed && bed.file !== scene.bed) { const old = bed; old.g.gain.setTargetAtTime(0, ctx.currentTime, 0.8); setTimeout(() => { try { old.src.stop(); old.g.disconnect(); } catch { /* */ } }, 4000); bed = null; }
  if (scene.bed && !bed) {
    const file = scene.bed;
    bed = { file, pending: true };
    fetchFile(file).then((data) => new Promise((res, rej) => { const p = ctx.decodeAudioData(data.slice(0), res, rej); if (p && p.catch) p.catch(rej); })).then((buf) => {
      if (!bed || bed.file !== file) return;
      const b = trimmed(buf), src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = b.buf; src.loop = true; src.loopStart = b.start; src.loopEnd = b.start + b.dur;
      g.gain.value = 0; src.connect(g).connect(ambBus); src.start(0, b.start + Math.random() * b.dur * 0.5);
      g.gain.setTargetAtTime(scene.bedVol || 0.6, ctx.currentTime, 1.2);
      Object.assign(bed, { src, g, pending: false });
    }).catch((e) => console.warn('[audio]', e.message));
  }
  if (scene.calls && scene.calls.name === 'crow' && !buffers.has('crow.mp3')) { load('crow.mp3').catch(() => {}); load('crows.mp3').catch(() => {}); }
  callT = 4 + Math.random() * 6;
  if (music.kind === 'glade' && music.scene !== sceneId) setMusic('glade');
}
/** call every frame: the odd crow in the graveyard, a distant clang in the quarry */
export function tickScene(dt) {
  if (!ctx || ctx.state !== 'running' || !scene.calls) return;
  callT -= dt;
  if (callT > 0) return;
  const C = scene.calls;
  callT = C.every[0] + Math.random() * (C.every[1] - C.every[0]);
  const { g: d } = out({ x: listener.x + (Math.random() - 0.5) * 60, z: 0 }, C.vol, 80, 0.6);
  const t = ctx.currentTime + 0.01;
  if (C.name === 'crow') { const f = Math.random() < 0.6 ? 'crow.mp3' : 'crows.mp3', b = buffers.get(f); if (b) { const src = ctx.createBufferSource(); src.buffer = b.buf; src.playbackRate.value = 0.9 + Math.random() * 0.2; src.connect(d); src.start(t, b.start, b.dur); } }
  else sample(d, C.name, t, { rate: C.rate || 1 });
  setTimeout(() => { try { d.disconnect(); } catch { /* */ } }, 12000);
}

let engine = null;
function startEngine() {
  const b = buffers.get('engine.wav');
  if (!b) return;
  // two copies of one recorded engine loop: the body, and a lower, darker copy for weight
  const eg = ctx.createGain();
  eg.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  lp.Q.value = 0.7;
  const layers = [[1, 0.8], [0.5, 0.55]].map(([mul, gain]) => {
    const src = ctx.createBufferSource();
    src.buffer = b.buf;
    src.loop = true;
    src.loopStart = b.start;
    src.loopEnd = b.start + b.dur;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(lp);
    src.start(0, b.start);
    return { src, mul };
  });
  lp.connect(eg).connect(sfxBus);
  engine = { eg, lp, layers };
}

/** speed01 = speed/top, throttle 0..1. */
export function setEngine(speed01, throttle, boosting, off) {
  if (!engine) return;
  const t = ctx.currentTime;
  const rev = Math.min(1.4, Math.abs(speed01) * 0.85 + throttle * 0.25 + (boosting ? 0.35 : 0));
  const rate = 0.62 + rev * 0.75;
  for (const { src, mul } of engine.layers) src.playbackRate.setTargetAtTime(rate * mul, t, 0.09);
  engine.lp.frequency.setTargetAtTime(700 + rev * 2600 + throttle * 600, t, 0.1);
  engine.eg.gain.setTargetAtTime(off ? 0 : 0.16 + throttle * 0.1 + rev * 0.08, t, 0.12);
}

// ------------------------------------------------------------------ music
// 'menu' loops one calm track; 'glade' alternates the in-game tracks. Streamed through an <audio>
// element (not decoded into memory) and crossfaded when it changes.
const TRACKS = { menu: ['music-menu.mp3'], glade: ['music-glade1.mp3', 'music-glade2.mp3'] };
// each map's own music, and what you hear around you: a bed under the wind and the odd sound far off
const SCENES = {
  glade: { tracks: ['music-glade1.mp3', 'music-glade2.mp3'], wind: 0.55 },
  crater: { tracks: ['music-moon.mp3'], wind: 0.1, bed: 'amb-space.mp3', bedVol: 0.7 },
  bog: { tracks: ['music-bog.mp3'], wind: 0.25, bed: 'amb-swamp.mp3', bedVol: 0.8 },
  quarry: { tracks: ['music-quarry.mp3'], wind: 0.4, bed: 'amb-machine.mp3', bedVol: 0.5, calls: { name: 'clang', rate: 0.55, vol: 0.35, every: [9, 20] } },
  graveyard: { tracks: ['music-graveyard.mp3'], wind: 0.45, bed: 'amb-crickets.mp3', bedVol: 0.5, calls: { name: 'crow', vol: 0.5, every: [7, 18] } },
  hallow: { tracks: ['music-hallow.mp3'], wind: 0.4, bed: 'amb-crickets.mp3', bedVol: 0.45, calls: { name: 'crow', vol: 0.4, every: [10, 24] } },
};
let scene = SCENES.glade, sceneId = 'glade';
const music = { el: null, gain: null, kind: null, idx: 0 };
let wantMusic = null;

function fadeOut(m, secs = 1.5) {
  if (!m.el) return;
  const { el, gain } = m;
  gain.gain.setTargetAtTime(0, ctx.currentTime, secs / 4);
  setTimeout(() => { el.pause(); el.removeAttribute('src'); el.load(); try { gain.disconnect(); } catch { /* */ } }, secs * 1000 + 200);
}
function startTrack(kind) {
  const list = kind === 'glade' ? scene.tracks : TRACKS[kind];
  const file = list[music.idx % list.length];
  const el = new Audio();
  el.preload = 'auto';
  el.loop = list.length === 1;
  el.src = url(file);
  const node = ctx.createMediaElementSource(el);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  node.connect(gain).connect(musicBus);
  gain.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
  el.addEventListener('ended', () => { if (music.el === el) { music.idx++; fadeOut({ el, gain }, 0.1); Object.assign(music, startTrack(kind)); } });
  el.play().catch(() => {}); // retried on the next gesture by initAudio()
  return { el, gain, kind };
}
/** 'menu', 'glade' or null for silence. Applied a moment later, so the tap on PLAY that unlocks
 *  audio doesn't start (and download) the menu track just before the glade music replaces it. */
let musicT = 0;
export function setMusic(kind) {
  wantMusic = kind;
  clearTimeout(musicT);
  musicT = setTimeout(applyMusic, 350);
}
function applyMusic() {
  const kind = wantMusic;
  if (!ctx || (kind === music.kind && (kind !== 'glade' || music.scene === sceneId))) return;
  fadeOut(music);
  Object.assign(music, { el: null, gain: null, kind: null });
  if (kind) { if (kind === 'glade') music.idx = Math.floor(Math.random() * scene.tracks.length); Object.assign(music, startTrack(kind), { scene: sceneId }); }
}

// ------------------------------------------------------------------ for the playtests
const stats = { played: {}, fallback: {} };
window.__hsgAudio = () => ({
  state: ctx && ctx.state, loaded: buffers.size, loadedAll, engine: !!engine, wind: buffers.has('wind.mp3'),
  missing: Object.values(BANK).flatMap((S) => S.files).filter((f) => !buffers.has(`${f}.mp3`)),
  music: music.kind, track: music.el && music.el.src.split('/').pop(), playing: !!(music.el && !music.el.paused), t: music.el ? music.el.currentTime : 0,
  engineRate: engine ? engine.layers[0].src.playbackRate.value : 0, engineGain: engine ? engine.eg.gain.value : 0,
  scene: sceneId, bed: bed ? bed.file + (bed.pending ? ' (loading)' : '') : null,
  vol: { ...vol }, musicGain: musicBus ? musicBus.gain.value : null, played: { ...stats.played }, fallback: { ...stats.fallback },
});

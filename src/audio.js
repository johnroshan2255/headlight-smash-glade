// Procedural audio: every sound is synthesised with WebAudio at runtime (zero downloads,
// tiny CPU cost). Sounds are spatialised with distance attenuation + stereo pan relative to
// the camera, and share one convolution reverb for the foggy glade.

let ctx = null;
let master, sfxBus, reverbSend, ambBus;
let noiseBuf = null;
const listener = { x: 0, z: 0, yaw: 0 };

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

/** Must be called from a user gesture (Play button). */
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
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
  sfxBus.connect(master);
  ambBus = ctx.createGain();
  ambBus.gain.value = 0.0;
  ambBus.connect(master);
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse();
  reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.35;
  reverbSend.connect(reverb).connect(master);
  noiseBuf = makeNoise(2);
  startAmbience();
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
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

// ------------------------------------------------------------------ building blocks
/** Output node for a sound at world (x,z) (or non-positional when x is undefined). */
function out(pos, vol = 1, maxDist = 40, wet = 0.6) {
  const g = ctx.createGain();
  let gain = vol;
  let pan = 0;
  if (pos && pos.x !== undefined) {
    const dx = pos.x - listener.x, dz = pos.z - listener.z;
    const d = Math.hypot(dx, dz);
    gain *= Math.max(0, 1 - d / maxDist) ** 1.6;
    // camera right vector = (cos yaw, -sin yaw) in x/z
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
  return g;
}

function noise(dest, t0, dur, { type = 'bandpass', freq = 1000, q = 1, attack = 0.005, peak = 1, release, freqEnd } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + (release ?? dur));
  src.connect(f).connect(g).connect(dest);
  src.start(t0, Math.random());
  src.stop(t0 + dur + 0.1);
}

function tone(dest, t0, dur, { freq = 440, type = 'sine', attack = 0.004, peak = 0.5, freqEnd, detune = 0 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  o.detune.value = detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// ------------------------------------------------------------------ the sound list
const SFX = {
  boom(d, t) {
    noise(d, t, 1.6, { type: 'lowpass', freq: 900, freqEnd: 60, peak: 1.4, attack: 0.004 });
    noise(d, t, 0.35, { type: 'bandpass', freq: 2400, q: 0.6, peak: 0.5 });
    tone(d, t, 0.9, { freq: 70, freqEnd: 28, type: 'sine', peak: 1.1 });
    noise(d, t + 0.12, 1.2, { type: 'bandpass', freq: 300, q: 0.5, peak: 0.35, attack: 0.05 }); // debris rumble
  },
  crunch(d, t) {
    noise(d, t, 0.22, { type: 'bandpass', freq: 900, q: 0.8, peak: 0.9 });
    noise(d, t, 0.08, { type: 'highpass', freq: 3000, peak: 0.4 });
    tone(d, t, 0.18, { freq: 120, freqEnd: 60, type: 'square', peak: 0.18 });
  },
  boing(d, t) {
    tone(d, t, 0.45, { freq: 160, freqEnd: 520, type: 'triangle', peak: 0.5 });
    tone(d, t + 0.05, 0.35, { freq: 330, freqEnd: 700, type: 'sine', peak: 0.2 });
  },
  beep(d, t) {
    tone(d, t, 0.09, { freq: 1200, type: 'square', peak: 0.15 });
    tone(d, t + 0.14, 0.09, { freq: 1200, type: 'square', peak: 0.15 });
  },
  tick(d, t) { tone(d, t, 0.05, { freq: 1600, type: 'square', peak: 0.1 }); },
  foghorn(d, t) {
    tone(d, t, 1.3, { freq: 92, type: 'sawtooth', peak: 0.45, attack: 0.08 });
    tone(d, t, 1.3, { freq: 92.7, type: 'sawtooth', peak: 0.35, attack: 0.08 });
    noise(d, t, 0.8, { type: 'lowpass', freq: 400, peak: 0.4, attack: 0.02 });
  },
  glitch(d, t) {
    for (let i = 0; i < 9; i++) tone(d, t + i * 0.045, 0.04, { freq: 200 + Math.random() * 2400, type: 'square', peak: 0.16 });
    noise(d, t, 0.5, { type: 'bandpass', freq: 5000, freqEnd: 300, q: 3, peak: 0.35 });
  },
  honk(d, t, opt) {
    const f = opt.freq || 260;
    tone(d, t, 0.32, { freq: f, type: 'square', peak: 0.22, attack: 0.01 });
    tone(d, t, 0.32, { freq: f * 1.26, type: 'square', peak: 0.16, attack: 0.01 });
  },
  pickup(d, t) {
    [523, 659, 784, 1046].forEach((f, i) => tone(d, t + i * 0.06, 0.18, { freq: f, type: 'triangle', peak: 0.25 }));
  },
  whoosh(d, t) { noise(d, t, 0.7, { type: 'bandpass', freq: 400, freqEnd: 2600, q: 0.8, peak: 0.5, attack: 0.08 }); },
  crack(d, t) {
    noise(d, t, 0.12, { type: 'highpass', freq: 1800, peak: 0.9 });
    noise(d, t + 0.05, 0.9, { type: 'bandpass', freq: 500, q: 0.7, peak: 0.5, attack: 0.02 });
    tone(d, t, 0.25, { freq: 90, freqEnd: 45, type: 'triangle', peak: 0.4 });
  },
  rumble(d, t) {
    noise(d, t, 2.4, { type: 'lowpass', freq: 260, peak: 0.9, attack: 0.2 });
    for (let i = 0; i < 6; i++) noise(d, t + 0.2 + Math.random() * 1.6, 0.15, { type: 'bandpass', freq: 700 + Math.random() * 500, peak: 0.4 });
  },
  geyser(d, t) {
    noise(d, t, 1.6, { type: 'bandpass', freq: 900, freqEnd: 2600, q: 0.5, peak: 0.8, attack: 0.04 });
    noise(d, t, 0.5, { type: 'lowpass', freq: 300, peak: 0.6 });
  },
  splash(d, t) { noise(d, t, 0.5, { type: 'bandpass', freq: 1400, freqEnd: 500, q: 0.7, peak: 0.6 }); },
  cork(d, t) {
    tone(d, t, 0.06, { freq: 900, freqEnd: 300, type: 'sine', peak: 0.6 });
    noise(d, t, 0.05, { type: 'highpass', freq: 2000, peak: 0.4 });
  },
  clang(d, t) {
    for (const f of [410, 1140, 1710]) tone(d, t, 0.6, { freq: f, type: 'sine', peak: 0.18 });
    noise(d, t, 0.05, { type: 'highpass', freq: 2500, peak: 0.4 });
  },
};

/**
 * Plays a sound. pos = {x, z} for positional sounds (omit for UI / player-attached).
 * opt: { vol, maxDist, wet, freq }
 */
export function play(name, pos, opt = {}) {
  if (!ctx || ctx.state !== 'running') return;
  const fn = SFX[name];
  if (!fn) return;
  const d = out(pos, opt.vol ?? 1, opt.maxDist ?? 50, opt.wet ?? 0.35);
  fn(d, ctx.currentTime + 0.005, opt);
  setTimeout(() => { try { d.disconnect(); } catch { /* gone */ } }, 9000);
}

// ------------------------------------------------------------------ ambience + engine
let engine = null;
function startAmbience() {
  // wind in the dead trees
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 420;
  f.Q.value = 0.7;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lg = ctx.createGain();
  lg.gain.value = 260;
  lfo.connect(lg).connect(f.frequency);
  const g = ctx.createGain();
  g.gain.value = 0.12;
  src.connect(f).connect(g).connect(ambBus);
  src.start();
  lfo.start();
  ambBus.gain.setTargetAtTime(1, ctx.currentTime, 2.5);
  // the player's engine: two detuned saws + a sub, through a lowpass that opens with revs
  const eg = ctx.createGain();
  eg.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400;
  lp.Q.value = 2;
  const oscs = [['sawtooth', 1, 0.5], ['sawtooth', 1.01, 0.4], ['square', 0.5, 0.35]].map(([type, mul, gain]) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = 40;
    const og = ctx.createGain();
    og.gain.value = gain;
    o.connect(og).connect(lp);
    o.start();
    return { o, mul };
  });
  // a putter: amplitude wobble at firing rate
  const am = ctx.createGain();
  am.gain.value = 0.7;
  const put = ctx.createOscillator();
  put.type = 'square';
  put.frequency.value = 12;
  const pg = ctx.createGain();
  pg.gain.value = 0.3;
  put.connect(pg).connect(am.gain);
  put.start();
  lp.connect(am).connect(eg).connect(sfxBus);
  engine = { eg, lp, oscs, put };
}

/** speed01 = speed/top, throttle 0..1. */
export function setEngine(speed01, throttle, boosting, off) {
  if (!engine) return;
  const t = ctx.currentTime;
  const rev = Math.min(1.4, Math.abs(speed01) * 0.85 + throttle * 0.25 + (boosting ? 0.35 : 0));
  const base = 34 + rev * 75;
  for (const { o, mul } of engine.oscs) o.frequency.setTargetAtTime(base * mul, t, 0.08);
  engine.put.frequency.setTargetAtTime(9 + rev * 30, t, 0.08);
  engine.lp.frequency.setTargetAtTime(260 + rev * 1300 + throttle * 300, t, 0.1);
  engine.eg.gain.setTargetAtTime(off ? 0 : 0.07 + throttle * 0.05 + rev * 0.05, t, 0.12);
}

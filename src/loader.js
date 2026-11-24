// Tiny entry module: paints the loading screen immediately, then pulls in the engine + game
// (a separate chunk) and drives the real loading steps with a progress bar.
// Nothing here imports PlayCanvas, so this file is a few KB and runs before the engine arrives.

const $ = (id) => document.getElementById(id);
// colour or monochrome title card, matching the player's saved choice
const ls = { get(k, d) { try { return localStorage.getItem(`hsg.${k}`) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(`hsg.${k}`, v); } catch { /* */ } } };
if (ls.get('palette', 'color') === 'mono') document.body.classList.add('mono');
const els = {
  boot: $('boot'), bar: $('loadFill'), pct: $('loadPct'), stage: $('stageText'), spin: $('spin'), grain: document.querySelector('#boot .grain'),
  play: $('btnPlay'), retry: $('btnRetry'), menu: $('menu'), lobby: $('lobby'), tip: $('tip'), progress: $('loadProgress'),
};

const TIPS = [
  'Up to 8 drivers. No timers. Just smash.',
  'Oil barrels chain-react. Line them up.',
  'Five hits and the cage-ball blows.',
  'Twelve hats are hidden in the glade.',
  'Pond geysers launch anything parked on them.',
  'Crates hold gadgets. Gadgets last 25 seconds.',
  'Ram a dead tree hard enough and it becomes a log.',
];

// ------------------------------------------------------------------ progress animation
let shown = 0;
let target = 0;
let downloading = true;
let dlStart = performance.now();
let finished = false;

// film grain: a few noise tiles made once, cycled cheaply
const grainTiles = (() => {
  const tiles = [];
  try {
    for (let n = 0; n < 4; n++) {
      const c = document.createElement('canvas');
      c.width = c.height = 120;
      const x = c.getContext('2d');
      const img = x.createImageData(120, 120);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      tiles.push(`url(${c.toDataURL()})`);
    }
  } catch { /* no canvas: no grain */ }
  return tiles;
})();
let grainI = 0, grainT = 0;

function render(now) {
  if (downloading) {
    // engine download: we can't see bytes of a dynamic import, so ease towards 30%
    const t = (now - dlStart) / 1000;
    target = Math.max(target, 0.3 * (1 - Math.exp(-t / 1.6)));
  }
  shown += (target - shown) * (finished ? 0.3 : 0.12);
  if (target - shown < 0.002) shown = target;
  els.bar.style.width = `${(shown * 100).toFixed(1)}%`;
  const p = Math.round(shown * 100);
  els.pct.textContent = finished ? '' : `${p}%`;
  els.progress.setAttribute('aria-valuenow', String(p));
  if (grainTiles.length && now - grainT > 85) {
    grainT = now;
    grainI = (grainI + 1) % grainTiles.length;
    els.grain.style.backgroundImage = grainTiles[grainI];
    // one noise pixel per device pixel: fine and crisp, never smeared
    if (!els.grain.style.backgroundSize) els.grain.style.backgroundSize = `${120 / (window.devicePixelRatio || 1)}px`;
  }
  if (els.boot.isConnected) requestAnimationFrame(render);
}
requestAnimationFrame(render);

let tipI = 0;
const tipTimer = setInterval(() => {
  tipI = (tipI + 1) % TIPS.length;
  els.tip.textContent = TIPS[tipI];
}, 3800);

const loader = {
  /** label shown to the player; f = 0..1 progress inside the game-setup phase */
  stage(label, f) {
    els.stage.textContent = label;
    target = Math.max(target, 0.3 + Math.min(1, f) * 0.7);
  },
};


// ------------------------------------------------------------------ errors
function fail(message, { offerWebGL = false } = {}) {
  finished = true;
  clearInterval(tipTimer);
  els.boot.classList.add('error');
  els.stage.textContent = message;
  els.retry.hidden = false;
  els.retry.textContent = offerWebGL ? 'RETRY WITH WEBGL 2' : 'RETRY';
  els.retry.onclick = () => {
    const url = new URL(location.href);
    if (offerWebGL) url.searchParams.set('gpu', 'webgl2');
    location.replace(url.toString());
  };
}

function gpuSupported() {
  if (navigator.gpu) return true;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (gl) {
      gl.getExtension('WEBGL_lose_context')?.loseContext(); // free the probe context right away
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

// ------------------------------------------------------------------ boot sequence
async function boot() {
  if (!gpuSupported()) {
    fail('This browser/device has no WebGL 2 or WebGPU. Try an updated Chrome, Safari or Firefox.');
    return;
  }
  els.stage.textContent = 'fuelling up';

  let mod;
  try {
    // starts the engine + game chunk download; the HTML is already on screen
    [mod] = await Promise.all([import('./game.js'), document.fonts?.ready]);
  } catch (err) {
    console.error(err);
    fail('Could not download the game. Check your connection and retry.');
    return;
  }
  downloading = false;
  target = Math.max(target, 0.3);

  let game;
  try {
    game = await mod.startGame(loader);
  } catch (err) {
    console.error(err);
    const usedWebGPU = new URLSearchParams(location.search).get('gpu') !== 'webgl2';
    fail(err?.message || 'Something went wrong while starting the game.', { offerWebGL: usedWebGPU });
    return;
  }

  // ready: PLAY or CO-OP
  target = 1;
  finished = true;
  clearInterval(tipTimer);
  els.stage.textContent = '';
  els.boot.classList.add('ready');
  els.menu.hidden = false;
  els.play.focus({ preventScroll: true });

  // ---------------------------------------------------------------- the lobby's ride / hat / name
  const vehicles = game.vehicles;
  let vi = Math.max(0, vehicles.findIndex((v) => v.id === ls.get('vehicle', 'mudrunner')));
  const bar = (label, v) => `<span>${label}</span><i style="--v:${Math.round(Math.min(1, v) * 100)}%"></i>`;
  const showVeh = () => {
    const v = vehicles[vi];
    $('vehName').textContent = v.name.toUpperCase();
    $('vehBlurb').textContent = v.blurb;
    $('vehStats').innerHTML = bar('SPEED', v.speed) + bar('WEIGHT', v.weight) + bar('GRIP', v.grip);
    ls.set('vehicle', v.id);
  };
  $('vehPrev').onclick = () => { vi = (vi + vehicles.length - 1) % vehicles.length; showVeh(); };
  $('vehNext').onclick = () => { vi = (vi + 1) % vehicles.length; showVeh(); };
  const nameEl = $('optName'), hatEl = $('optHat'), roomEl = $('optRoom');
  nameEl.value = ls.get('name', `Driver${Math.floor(100 + Math.random() * 900)}`);
  const hats = game.hats();
  hatEl.innerHTML = hats.map((h) => `<option value="${h.id}">${h.name}</option>`).join('');
  hatEl.value = hats.some((h) => h.id === ls.get('hat', 'straw')) ? ls.get('hat', 'straw') : 'straw';
  const q = new URLSearchParams(location.search);
  roomEl.value = (q.get('room') || ls.get('room', '')).toUpperCase();
  if (q.get('veh')) vi = Math.max(0, vehicles.findIndex((v) => v.id === q.get('veh')));
  if (q.get('name')) nameEl.value = q.get('name');
  showVeh();

  // ---------------------------------------------------------------- open glades on this server
  const gladesEl = $('glades');
  let pollTimer = 0;
  const pickRoom = (code) => { roomEl.value = code; syncRoom(); };
  const syncRoom = () => {
    roomEl.value = roomEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (const b of gladesEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.code === roomEl.value);
    $('btnJoin').textContent = roomEl.value ? `JOIN ${roomEl.value}` : 'JOIN THE GLADE';
  };
  async function pollRooms() {
    let list = null;
    try { const r = await fetch('/rooms', { cache: 'no-store' }); if (r.ok) list = await r.json(); } catch { /* offline */ }
    if (!Array.isArray(list)) { gladesEl.innerHTML = ''; return; }
    if (!list.some((r) => r.code === '')) list.unshift({ code: '', players: 0, max: 8 });
    list.sort((a, b) => (a.code === '' ? -1 : b.code === '' ? 1 : b.players - a.players));
    gladesEl.innerHTML = `<div class="lbl">OPEN GLADES</div>` + list.slice(0, 5).map((r) => {
      const full = r.players >= r.max;
      return `<button data-code="${r.code}" ${full ? 'disabled' : ''}><b>${r.code || 'PUBLIC'}</b><span>${full ? 'full' : r.players ? `${r.players} driver${r.players > 1 ? 's' : ''}` : 'empty'}</span></button>`;
    }).join('');
    for (const b of gladesEl.querySelectorAll('button')) b.onclick = () => pickRoom(b.dataset.code);
    syncRoom();
  }
  roomEl.addEventListener('input', syncRoom);
  $('btnNewCode').onclick = () => {
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    pickRoom(Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''));
    $('roomHint').textContent = 'A private room. Tell your friends this code.';
  };

  const showLobby = (open) => {
    els.menu.hidden = open;
    els.lobby.hidden = !open;
    els.boot.classList.toggle('lobbying', open);
    clearInterval(pollTimer);
    if (open) {
      if (!game.online) {
        $('lobbyNet').textContent = 'NO SERVER';
        $('lobbyNet').classList.add('off');
        $('roomHint').textContent = 'Co-op needs the game server: run "npm run play" on a computer and open its address on every device.';
        $('btnJoin').disabled = true;
      } else {
        $('lobbyNet').textContent = 'ONLINE';
        pollRooms();
        pollTimer = setInterval(pollRooms, 3000);
      }
      syncRoom();
      ($('btnJoin').disabled ? $('btnBack') : $('btnJoin')).focus({ preventScroll: true });
    } else els.play.focus({ preventScroll: true });
  };
  $('btnCoop').addEventListener('click', () => showLobby(true));
  $('btnBack').addEventListener('click', () => showLobby(false));

  // ---------------------------------------------------------------- go
  let begun = false;
  const begin = (e, mode) => {
    if (begun) return;
    begun = true;
    if (e) e.preventDefault();
    clearInterval(pollTimer);
    const name = nameEl.value.trim().replace(/[<>&]/g, '') || 'Driver';
    ls.set('name', name);
    ls.set('hat', hatEl.value);
    ls.set('room', roomEl.value);
    game.begin(e, { vehicle: vehicles[vi].id, name, hat: hatEl.value, mode, code: roomEl.value }); // the gesture lets us go fullscreen
    els.boot.classList.add('fade');
    setTimeout(() => els.boot.remove(), 650);
    window.removeEventListener('keydown', keys);
  };
  const keys = (e) => {
    const inLobby = !els.lobby.hidden;
    if (e.code === 'Escape' && inLobby) { showLobby(false); return; }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) { if (e.code === 'Enter' && inLobby && !$('btnJoin').disabled) begin(e, 'online'); return; }
    if (inLobby && (e.code === 'ArrowLeft' || e.code === 'ArrowRight') && !(document.activeElement instanceof HTMLButtonElement && document.activeElement.closest('.glades'))) $(e.code === 'ArrowLeft' ? 'vehPrev' : 'vehNext').click();
  };
  // click (not pointerdown): on touch screens only the release counts as a user activation
  els.play.addEventListener('click', (e) => begin(e, 'solo'));
  $('btnJoin').addEventListener('click', (e) => begin(e, 'online'));
  window.addEventListener('keydown', keys);
  if (q.has('autostart')) begin(null, q.get('mode') || 'online');
}

boot();

// No service worker: an online game should always run the build the server is serving.

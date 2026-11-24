// Tiny entry module: paints the loading screen immediately, then pulls in the engine + game
// (a separate chunk) and drives the real loading steps with a progress bar.
// Nothing here imports PlayCanvas, so this file is a few KB and runs before the engine arrives.
import { setupGarage } from './garage.js';

const $ = (id) => document.getElementById(id);
// colour or monochrome title card, matching the player's saved choice
const ls = { get(k, d) { try { return localStorage.getItem(`hsg.${k}`) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(`hsg.${k}`, v); } catch { /* */ } } };
if (ls.get('palette', 'color') === 'mono') document.body.classList.add('mono');
const resetScroll = (e) => { if (e.scrollLeft || e.scrollTop) { e.scrollLeft = 0; e.scrollTop = 0; } };
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
els.boot.addEventListener('scroll', () => resetScroll(els.boot)); // older browsers without overflow: clip

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
  // why we're back here (the host left the room, the connection dropped)
  try { const n = sessionStorage.getItem('hsg.notice'); if (n) { sessionStorage.removeItem('hsg.notice'); els.tip.textContent = n; els.tip.classList.add('notice'); } } catch { /* */ }

  // ---------------------------------------------------------------- account chip, garage, lobby name
  const G = setupGarage(game, {
    onClose: (inGame) => { if (!inGame) { els.boot.classList.remove('away'); $('lobbyRide').textContent = G.rideName().toUpperCase(); (els.lobby.hidden ? els.play : $('btnJoin')).focus({ preventScroll: true }); } },
  });
  $('acctChip').hidden = false;
  const openGarage = () => { els.boot.classList.add('away'); G.openGarage(false); };
  $('btnGarage').addEventListener('click', openGarage);
  $('lobbyRide').addEventListener('click', openGarage);
  $('lobbyRide').textContent = G.rideName().toUpperCase();
  const nameEl = $('optName'), roomEl = $('optRoom');
  const q = new URLSearchParams(location.search);
  nameEl.value = game.account.name || ls.get('name', `Driver${Math.floor(100 + Math.random() * 900)}`);
  window.addEventListener('hsg:account', () => { if (game.account.name) nameEl.value = game.account.name; $('lobbyRide').textContent = G.rideName().toUpperCase(); });
  roomEl.value = (q.get('room') || ls.get('room', '')).toUpperCase();
  if (q.get('name')) nameEl.value = q.get('name');

  // ---------------------------------------------------------------- open glades on this server
  const gladesEl = $('glades');
  let pollTimer = 0;
  const pickRoom = (code) => { roomEl.value = code; syncRoom(); };
  // two ways in: JOIN (a code or an open glade) or CREATE a private room of your own
  let lobbyMode = 'join', newBots = 0;
  const syncRoom = () => {
    roomEl.value = roomEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (const b of gladesEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.code === roomEl.value);
    $('btnJoin').textContent = lobbyMode === 'create' ? `CREATE ${$('newCode').textContent} & DRIVE` : roomEl.value ? `JOIN ${roomEl.value}` : 'JOIN THE GLADE';
  };
  const freshCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; $('newCode').textContent = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); syncRoom(); };
  const setLobbyMode = (m) => {
    lobbyMode = m;
    $('lTabJoin').classList.toggle('on', m === 'join'); $('lTabCreate').classList.toggle('on', m === 'create');
    $('lJoin').hidden = m !== 'join'; $('lCreate').hidden = m !== 'create';
    if (m === 'create' && $('newCode').textContent.includes('-')) freshCode();
    syncRoom();
  };
  $('lTabJoin').onclick = () => setLobbyMode('join');
  $('lTabCreate').onclick = () => setLobbyMode('create');
  for (const b of $('botChips').querySelectorAll('button')) b.onclick = () => { newBots = Number(b.dataset.b); for (const o of $('botChips').querySelectorAll('button')) o.classList.toggle('on', o === b); };
  $('btnCopyCode').onclick = async () => { try { await navigator.clipboard.writeText($('newCode').textContent); $('btnCopyCode').textContent = 'COPIED'; setTimeout(() => ($('btnCopyCode').textContent = 'COPY'), 1500); } catch { /* no clipboard */ } };
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
  $('btnNewCode').onclick = freshCode;

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
    const name = nameEl.value.trim().replace(/[<>&]/g, '') || game.account.name || 'Driver';
    ls.set('name', name);
    const create = mode === 'online' && lobbyMode === 'create';
    const code = create ? $('newCode').textContent : roomEl.value;
    ls.set('room', code);
    $('acctChip').hidden = true;
    // a new room is made with the creator's settings; joining an existing one keeps its own
    game.begin(e, { name, mode, code, private: create && $('optHide').checked, bots: create ? newBots : -1 }); // the gesture lets us go fullscreen
    els.boot.classList.add('fade');
    setTimeout(() => els.boot.remove(), 650);
    window.removeEventListener('keydown', keys);
  };
  const keys = (e) => {
    if (!$('garageUI').hidden || !$('acctUI').hidden) return;
    const inLobby = !els.lobby.hidden;
    if (e.code === 'Escape' && inLobby) { showLobby(false); return; }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) { if (e.code === 'Enter' && inLobby && !$('btnJoin').disabled) begin(e, 'online'); return; }
  };
  // click (not pointerdown): on touch screens only the release counts as a user activation
  els.play.addEventListener('click', (e) => begin(e, 'solo'));
  $('btnJoin').addEventListener('click', (e) => begin(e, 'online'));
  window.addEventListener('keydown', keys);
  if (q.has('autostart')) begin(null, q.get('mode') || 'online');
}

boot();

// No service worker: an online game should always run the build the server is serving.

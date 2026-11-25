// Tiny entry module: paints the loading screen immediately, then pulls in the engine + game
// (a separate chunk) and drives the real loading steps with a progress bar.
// Nothing here imports PlayCanvas, so this file is a few KB and runs before the engine arrives.
import { setupGarage } from './garage.js';
import * as sfx from './audio.js';
import { MAP_LIST, mapName } from './catalog.js';
import * as portal from './portal.js';

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
  const portalUp = portal.initPortal(); // CrazyGames build only; never waits more than ~5 s

  let mod;
  try {
    // starts the engine + game chunk download; the HTML is already on screen
    [mod] = await Promise.all([import('./game.js'), document.fonts?.ready, portalUp]);
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
  portal.loadingDone();
  portal.onMute((m) => sfx.setMuted(m)); // CrazyGames' muteAudio setting
  setTimeout(sfx.prefetch, 400); // sound effects download while the menu is up (music streams later)
  // the solo map: endless, or one of the room arenas (the world behind the menu switches with it)
  const SOLO_MAPS = ['endless', ...MAP_LIST.map((m) => m.id)];
  let soloMap = SOLO_MAPS.includes(ls.get('soloMap', 'endless')) ? ls.get('soloMap', 'endless') : 'endless';
  const showSoloMap = () => { $('mapNameMenu').textContent = mapName(soloMap).toUpperCase(); ls.set('soloMap', soloMap); game.previewMap(soloMap); };
  const stepMap = (d) => { soloMap = SOLO_MAPS[(SOLO_MAPS.indexOf(soloMap) + d + SOLO_MAPS.length) % SOLO_MAPS.length]; showSoloMap(); };
  $('mapPrev').onclick = () => stepMap(-1); $('mapNext').onclick = () => stepMap(1);
  $('soloMap').hidden = false;
  showSoloMap();
  // why we're back here (the host left the room, the connection dropped)
  try { const n = sessionStorage.getItem('hsg.notice'); if (n) { sessionStorage.removeItem('hsg.notice'); els.tip.textContent = n; els.tip.classList.add('notice'); } } catch { /* */ }

  // ---------------------------------------------------------------- account chip, garage, lobby name
  const G = setupGarage(game, {
    onClose: (inGame) => { if (!inGame) { els.boot.classList.remove('away'); (els.lobby.hidden ? els.play : $('btnJoin')).focus({ preventScroll: true }); } },
  });
  $('acctChip').hidden = false;
  // sound: the first tap or key press unlocks audio and starts the menu music; buttons click
  const unlock = () => { sfx.initAudio(); sfx.setMusic(document.body.contains(els.boot) ? 'menu' : 'glade'); };
  for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('button');
    if (!b || b.disabled) return;
    sfx.play(b.classList.contains('g-card') ? 'select' : 'click', undefined, { wet: 0 });
  }, { capture: true });
  $('btnGarage').addEventListener('click', () => { els.boot.classList.add('away'); G.openGarage(false); });
  const nameEl = $('optName'), roomEl = $('optRoom');
  const q = new URLSearchParams(location.search);
  nameEl.value = game.account.name || ls.get('name', `Driver${Math.floor(100 + Math.random() * 900)}`);
  window.addEventListener('hsg:account', () => { if (game.account.name) nameEl.value = game.account.name; });
  roomEl.value = (q.get('room') || ls.get('room', '')).toUpperCase();
  if (q.get('name')) nameEl.value = q.get('name');
  // on CrazyGames a signed-in player drives under their CrazyGames name
  let typedName = false;
  nameEl.addEventListener('input', () => { typedName = true; });
  const usePortalName = (n) => { game.account.portalName = n; if (n && !typedName && !q.get('name')) nameEl.value = n; game.account.emit(); };
  const portalName = portal.portalUser().then(usePortalName);
  portal.onPortalUser(usePortalName);

  // ---------------------------------------------------------------- the lobby: JOIN or CREATE
  // JOIN: tap a public room in the list, or type a private room's code.
  // CREATE: a room of your own (public = listed, private = code only), its bots and match length.
  // Either way you wait in the room's lobby until the host presses START.
  const gladesEl = $('glades');
  let pollTimer = 0, lobbyMode = 'join', newBots = 0, newTime = 8, newPrivate = false, newMap = 'glade', joining = false;
  const syncRoom = () => { roomEl.value = roomEl.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); $('btnJoin').disabled = !game.online || roomEl.value.length < 3 || joining; };
  const freshCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; return Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); };
  const setLobbyMode = (m) => {
    lobbyMode = m;
    $('lTabJoin').classList.toggle('on', m === 'join'); $('lTabCreate').classList.toggle('on', m === 'create');
    $('lJoin').hidden = m !== 'join'; $('lCreate').hidden = m !== 'create';
    syncRoom();
  };
  $('lTabJoin').onclick = () => setLobbyMode('join');
  $('lTabCreate').onclick = () => setLobbyMode('create');
  const chipGroup = (id, key, set) => { for (const b of $(id).querySelectorAll('button')) b.onclick = () => { set(Number(b.dataset[key])); for (const o of $(id).querySelectorAll('button')) o.classList.toggle('on', o === b); }; };
  chipGroup('botChips', 'b', (v) => (newBots = v));
  chipGroup('timeChips', 't', (v) => (newTime = v));
  chipGroup('visChips', 'v', (v) => (newPrivate = !!v));
  for (const b of $('mapChips').querySelectorAll('button')) b.onclick = () => { newMap = b.dataset.m; for (const o of $('mapChips').querySelectorAll('button')) o.classList.toggle('on', o === b); $('mapBlurb').textContent = MAP_LIST.find((m) => m.id === newMap).blurb; };
  const esc = (t) => String(t).replace(/[<>&"]/g, '');
  async function pollRooms() {
    let list = null;
    try { const r = await fetch(`${game.serverHttp}/rooms`, { cache: 'no-store' }); if (r.ok) list = await r.json(); } catch { /* offline */ }
    if (!Array.isArray(list)) { gladesEl.innerHTML = ''; return; }
    list.sort((a, b) => (a.phase === 'lobby') - (b.phase === 'lobby') || b.players - a.players).reverse();
    gladesEl.innerHTML = !list.length ? '<p class="l-empty">No public rooms right now. CREATE one, or type a code.</p>' : list.slice(0, 6).map((r) => {
      const full = r.players >= r.max, left = Math.ceil((r.left || 0) / 60000);
      const status = full ? 'full' : r.phase === 'playing' ? `playing · ${left} min left` : r.phase === 'results' ? 'results' : 'waiting';
      return `<button data-code="${esc(r.code)}" ${full ? 'disabled' : ''}><b>${esc(r.host || r.code)}<small>${esc(mapName(r.map))}</small></b><span>${r.players}/${r.max} · ${status}</span></button>`;
    }).join('');
    for (const b of gladesEl.querySelectorAll('button')) b.onclick = () => joinRoom('join', b.dataset.code);
  }
  roomEl.addEventListener('input', syncRoom);

  // into a room's lobby
  const enterGame = () => begin(null, 'online');
  async function joinRoom(how, code) {
    if (joining || !game.online) return;
    joining = true; syncRoom();
    const name = nameEl.value.trim().replace(/[<>&]/g, '') || game.account.name || 'Driver';
    ls.set('name', name);
    $('lobbyMsg').hidden = true;
    const r = await game.joinRoom({ how, code, name, private: newPrivate, bots: newBots, time: newTime, map: newMap }, enterGame, () => { els.boot.classList.add('away'); G.openGarage(false); });
    joining = false; syncRoom();
    if (r.error) { $('lobbyMsg').textContent = r.error; $('lobbyMsg').hidden = false; return; }
    if (how === 'join') ls.set('room', code);
    inRoom = true; roomCode = code;
    clearInterval(pollTimer);
    els.lobby.hidden = true; // the room's lobby takes over
  }
  let inRoom = false, roomCode = '';
  $('btnJoin').addEventListener('click', () => joinRoom('join', roomEl.value));
  $('btnCreate').addEventListener('click', () => joinRoom('create', freshCode()));

  const showLobby = (open) => {
    els.menu.hidden = open;
    $('soloMap').hidden = open;
    els.lobby.hidden = !open;
    els.boot.classList.toggle('lobbying', open);
    clearInterval(pollTimer);
    if (open) {
      const off = !game.online;
      $('lobbyMsg').hidden = !off;
      $('lobbyMsg').textContent = off ? 'Co-op is offline right now (the game server didn\'t answer). PLAY solo with bots, or reload in a moment.' : '';
      for (const id of ['btnCreate', 'optRoom']) $(id).disabled = off;
      if (!off) { pollRooms(); pollTimer = setInterval(pollRooms, 3000); }
      syncRoom();
      (off ? $('btnBack') : lobbyMode === 'create' ? $('btnCreate') : $('btnJoin')).focus({ preventScroll: true });
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
    $('acctChip').hidden = true;
    // solo, or (online) the room we're already in; ?autostart joins/makes q.room and drives straight in
    game.begin(e, { name, mode, code: roomEl.value, bots: -1, map: mode === 'solo' ? soloMap : undefined }); // the gesture lets us go fullscreen
    els.boot.classList.add('fade');
    setTimeout(() => els.boot.remove(), 650);
    window.removeEventListener('keydown', keys);
  };
  const keys = (e) => {
    if (!$('garageUI').hidden || !$('acctUI').hidden || !$('roomLobby').hidden) return;
    const inLobby = !els.lobby.hidden;
    if (e.code === 'Escape' && inLobby) { showLobby(false); return; }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) { if (e.code === 'Enter' && inLobby && game.online) { if (lobbyMode === 'create') joinRoom('create', freshCode()); else if (roomEl.value) joinRoom('join', roomEl.value); } return; }
  };
  // click (not pointerdown): on touch screens only the release counts as a user activation
  els.play.addEventListener('click', (e) => begin(e, 'solo'));
  window.addEventListener('keydown', keys);
  if (q.has('autostart')) { begin(null, q.get('mode') || 'online'); return; }

  // ---------------------------------------------------------------- CrazyGames: invites and instant multiplayer
  // Opened from a friend's invite link: straight into their room (once: if that room has closed and
  // the page reloads, don't try it again). "Play with friends" (instant multiplayer): a new private room.
  // A friend's invite accepted while we were busy comes first (we reloaded to take it); then an
  // invite link (CrazyGames' own, or this page's ?room=CODE elsewhere).
  const next = portal.takeJoinNext();
  const invited = next || portal.inviteRoom() || (!portal.ON_CRAZY && q.get('room') ? q.get('room').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : null);
  // join under the CrazyGames name, not a stand-in (at most 3 s wait for it)
  if (invited || portal.instantMultiplayer()) await Promise.race([portalName, new Promise((r) => setTimeout(r, 3000))]);
  const tried = next ? null : (() => { try { return sessionStorage.getItem('hsg.invited'); } catch { return null; } })();
  const joinFromInvite = (code) => {
    if (!code || begun || inRoom || joining || !game.online) return;
    try { sessionStorage.setItem('hsg.invited', code); } catch { /* */ }
    roomEl.value = code;
    showLobby(true);
    joinRoom('join', code);
  };
  if (invited && invited !== tried) joinFromInvite(invited);
  else if (portal.instantMultiplayer() && game.online && !tried) {
    try { sessionStorage.setItem('hsg.invited', 'instant'); } catch { /* */ }
    showLobby(true); setLobbyMode('create'); newPrivate = true;
    joinRoom('create', freshCode());
  }
  // a friend invites us while the game is open: on the menu, straight in; while driving or in another
  // room, reload into theirs (the reload leaves the old room cleanly)
  portal.onJoinInvite((code) => {
    if (!code || code === roomCode) return;
    if (!begun && !inRoom && !joining) { joinFromInvite(code); return; }
    portal.joinAfterReload(code);
    portal.leftRoom();
    location.reload();
  });
}

boot();

// No service worker: an online game should always run the build the server is serving.

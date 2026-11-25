// Game-portal hooks (CrazyGames SDK v3). Only the CrazyGames build turns this on
// (`npm run crazygames`, which builds with VITE_PORTAL=crazygames and puts the SDK <script> in the
// page's <head>). Everywhere else every call here is a harmless no-op, so the game code can call
// these freely. Plain DOM, no engine imports: the loader uses it before the engine arrives.
//
// What CrazyGames needs from us:
//  - gameplayStart / gameplayStop around actual driving (not menus, lobbies, results or the garage)
//  - loadingStart / loadingStop around the loading screen
//  - respect game.settings.muteAudio
//  - no custom fullscreen button and no external sign-in (they provide fullscreen; we keep guest progress)
//  - multiplayer: invite links into a room, instant multiplayer, room info for "join friend"

export const ON_CRAZY = import.meta.env.VITE_PORTAL === 'crazygames';

let sdk = null; // the SDK once init() resolved in a real (or local test) CrazyGames environment
let playing = false;
const muteFns = new Set();
let muted = false;

const call = (fn) => { if (!sdk) return undefined; try { return fn(sdk); } catch (e) { console.warn('[portal]', e?.message || e); return undefined; } };

/** Start the SDK (at most ~5 s; the game never waits longer on it). */
export async function initPortal() {
  if (!ON_CRAZY) return false;
  const S = window.CrazyGames && window.CrazyGames.SDK;
  if (!S) { console.warn('[portal] CrazyGames SDK script missing'); return false; }
  try {
    await Promise.race([S.init(), new Promise((_, rej) => setTimeout(() => rej(new Error('SDK init timeout')), 5000))]);
  } catch (e) { console.warn('[portal]', e?.message || e); return false; }
  if (S.environment === 'disabled') return false;
  sdk = S;
  call((s) => s.game.loadingStart());
  const apply = (st) => { const m = !!(st && st.muteAudio); if (m !== muted) { muted = m; for (const fn of muteFns) fn(muted); } };
  call((s) => { apply(s.game.settings); s.game.addSettingsChangeListener(apply); });
  return true;
}
export const portalReady = () => !!sdk;

export function loadingDone() { call((s) => s.game.loadingStop()); }

/** true while the player is actually driving; deduplicated, so it can be called every frame */
export function setPlaying(on) {
  on = !!on;
  if (on === playing || !sdk) return;
  playing = on;
  calls[on ? 'start' : 'stop']++;
  call((s) => (on ? s.game.gameplayStart() : s.game.gameplayStop()));
}
const calls = { start: 0, stop: 0 };
if (ON_CRAZY) window.__portal = () => ({ ...calls, playing, muted, ready: !!sdk }); // for the playtests

/** the portal wants the game silent (fn gets true/false now and on every change) */
export function onMute(fn) { muteFns.add(fn); fn(muted); }

/** CrazyGames' Data Module as a small key/value store for progress ({ get, set, remove }), or null
 *  outside CrazyGames / when the module is off. It keeps guest progress in the browser and follows a
 *  signed-in player to every device. (It must be switched on in the submission: "Yes, using the Data
 *  Module"; otherwise every call throws dataModuleDisabled and we stay on localStorage.) */
export function portalStorage() {
  if (!sdk || !sdk.data) return null;
  try { sdk.data.getItem('hsg.probe'); } catch (e) { console.warn('[portal] data module off:', e?.message || e); return null; }
  return {
    get: (k) => { try { return sdk.data.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sdk.data.setItem(k, String(v)); } catch (e) { console.warn('[portal] save failed', e?.message || e); } },
    remove: (k) => { try { sdk.data.removeItem(k); } catch { /* */ } },
  };
}

/** the CrazyGames player's name, or null for a guest / outside CrazyGames */
export async function portalUser() {
  if (!sdk) return null;
  try { const u = await sdk.user.getUser(); return u && u.username ? String(u.username) : null; } catch { return null; }
}
export function onPortalUser(fn) { call((s) => s.user.addAuthListener((u) => fn(u && u.username ? String(u.username) : null))); }

// ---------------------------------------------------------------- multiplayer
/** the room code this game was opened with (an invite link), or null */
export function inviteRoom() {
  const v = call((s) => s.game.getInviteParam('room'));
  return v ? String(v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : null;
}
/** "Play with friends" / instant multiplayer: drop the player straight into a fresh room */
export const instantMultiplayer = () => !!call((s) => s.game.isInstantMultiplayer);
/** a friend invited us while the game is already open */
export function onJoinInvite(fn) { call((s) => s.game.addJoinRoomListener((p) => { const c = p && p.room; if (c) fn(String(c).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); })); }
/** a link that opens the game straight into this room (CrazyGames), or null elsewhere */
export const inviteLink = (code) => call((s) => s.game.inviteLink({ room: code })) || null;
/** tell CrazyGames which room we're in, so friends can join it from their side */
let roomKey = ''; // the roster comes on every smash: only tell CrazyGames when something changed
export function inRoom(code, joinable = true) {
  const key = `${code}|${!!joinable}`;
  if (!code || key === roomKey) return;
  roomKey = key;
  call((s) => s.game.updateRoom({ roomId: code, isJoinable: !!joinable, inviteParams: { room: code } }));
}
export function leftRoom() { roomKey = ''; call((s) => s.game.leftRoom()); }

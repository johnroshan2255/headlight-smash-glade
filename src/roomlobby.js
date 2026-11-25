// The room's lobby: who's in the room, everyone's colour (the same colour as someone else = the same
// team), the host's settings and START. Shown after CREATE / JOIN, before the first match, and
// again after every match's results. Plain DOM; no engine imports.
import { PAINTS } from './catalog.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[<>&"]/g, '');
export const teamRGB = (i) => PAINTS[((i % PAINTS.length) + PAINTS.length) % PAINTS.length].rgb.map((v) => Math.round(Math.min(255, v * 330)));
export const teamCSS = (i) => `rgb(${teamRGB(i).join(',')})`;
export const teamName = (i) => PAINTS[((i % PAINTS.length) + PAINTS.length) % PAINTS.length].name;

/**
 * net: the Net; enter(): drop into the glade (pre-game); inGame(): are we already driving?
 * garage(): open the garage; leave(): back to the menu
 */
export function setupRoomLobby({ net, enter, inGame, garage, leave }) {
  const el = $('roomLobby');
  let open = false;
  // colour swatches: tap one to take it (several players on one colour make a team)
  $('rlColors').innerHTML = PAINTS.map((p, i) => `<button data-c="${i}" title="${p.name}" aria-label="${p.name}" style="--c:${teamCSS(i)}"></button>`).join('');
  for (const b of $('rlColors').querySelectorAll('button')) b.onclick = () => { net.send('pickColor', { color: Number(b.dataset.c) }); };
  const chips = (id, key, send) => { for (const b of $(id).querySelectorAll('button')) b.onclick = () => net.isHost && send(Number(b.dataset[key])); };
  chips('rlBots', 'b', (v) => net.send('roomSettings', { bots: v }));
  chips('rlTime', 't', (v) => net.send('roomSettings', { time: v }));
  chips('rlVis', 'v', (v) => net.send('roomSettings', { private: !!v }));
  $('rlGo').onclick = () => {
    if (net.phase === 'lobby' && net.isHost) net.send('start', {});
    else if (net.phase === 'playing' && !inGame()) enter(); // a match is on: drive straight in
  };
  $('rlGarage').onclick = () => garage();
  $('rlLeave').onclick = () => leave();
  $('rlCode').onclick = async () => { try { await navigator.clipboard.writeText(net.code); } catch { /* the code is on screen */ } $('rlCode').classList.add('copied'); setTimeout(() => $('rlCode').classList.remove('copied'), 1200); };

  function paint() {
    if (!open) return;
    const host = net.isHost, phase = net.phase, S = net.settings, players = net.players;
    $('rlTitle').textContent = host ? 'YOUR ROOM' : `${esc((players.find((p) => p.id === net.hostId) || {}).name || 'THE')}'S ROOM`.toUpperCase();
    $('rlCode').textContent = net.code;
    // players, host first, with their colours
    const list = [...players].sort((a, b) => (a.id === net.hostId ? -1 : b.id === net.hostId ? 1 : a.joined - b.joined));
    $('rlPlayers').innerHTML = list.map((p) => `<li class="${p.id === net.id ? 'me' : ''}"><i style="--c:${teamCSS(p.color)}"></i><b>${esc(p.name)}</b>${p.id === net.hostId ? '<small>HOST</small>' : ''}${p.id === net.id ? '<small>YOU</small>' : ''}</li>`).join('')
      + (S.bots > 0 ? `<li class="bots"><i></i><b>+ ${S.bots} bot${S.bots > 1 ? 's' : ''}</b></li>` : '');
    // my colour
    const mine = net.myColor;
    for (const b of $('rlColors').querySelectorAll('button')) {
      const c = Number(b.dataset.c), n = players.filter((p) => p.color === c).length;
      b.classList.toggle('on', c === mine);
      b.dataset.n = n > 0 ? String(n) : '';
    }
    // teams: any colour two or more players share
    const groups = new Map();
    for (const p of players) groups.set(p.color, [...(groups.get(p.color) || []), p.name]);
    const teams = [...groups.entries()].filter(([, v]) => v.length > 1);
    $('rlTeams').textContent = teams.length ? `Teams: ${teams.map(([c, v]) => `${teamName(c)} (${v.map(esc).join(', ')})`).join(' vs ')}. Teammates can't hurt each other.` : 'Free-for-all. Pick the same colour as a friend to team up.';
    // host settings (guests just see them)
    $('rlHost').classList.toggle('ro', !host);
    for (const b of $('rlBots').querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset.b) === Math.max(0, S.bots));
    for (const b of $('rlTime').querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset.t) === S.time);
    for (const b of $('rlVis').querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset.v) === (S.private ? 1 : 0));
    // what happens next
    const left = net.match && phase === 'playing' ? Math.max(0, Math.ceil((net.match.endsAt - net.serverNow()) / 1000)) : 0;
    const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    $('rlStatus').textContent = phase === 'playing' ? `A match is on: ${clock} left` : phase === 'results' ? 'The match just ended. Back to the lobby in a moment.' : host ? `${players.length} in the room. Start when everyone's ready.` : 'Waiting for the host to start the match.';
    $('rlGuest').textContent = !host ? `${S.private ? 'Private' : 'Public'} room · ${S.bots > 0 ? `${S.bots} bots` : 'no bots'} · ${S.time} minutes` : '';
    const go = $('rlGo');
    if (phase === 'playing' && !inGame()) { go.hidden = false; go.disabled = false; go.textContent = 'DRIVE IN'; }
    else if (host && phase === 'lobby') { go.hidden = false; go.disabled = false; go.textContent = net.match && net.match.n ? 'START NEXT MATCH' : 'START'; }
    else { go.hidden = false; go.disabled = true; go.textContent = phase === 'lobby' ? 'WAITING FOR HOST' : 'GET READY'; }
  }

  let tick = 0;
  function show() { open = true; el.hidden = false; document.body.classList.add('in-room-lobby'); paint(); clearInterval(tick); tick = setInterval(paint, 500); }
  function hide() { open = false; el.hidden = true; document.body.classList.remove('in-room-lobby'); clearInterval(tick); }
  net.on('roster', paint);
  net.on('match', paint);
  return { show, hide, paint, get open() { return open; } };
}

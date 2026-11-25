// The garage (shop + loadout) and the account panel. Plain DOM; the car you're looking at is a
// live preview in the game scene behind the panel. Opened from the menu or from in-game settings.
import { RIDES, WHEELS, ROOF, BUMPER, UPGRADES, HAT_IDS, HAT_PRICE, TIRE_RANGE, PAINTS } from './catalog.js';
import { ON_CRAZY } from './portal.js';

const $ = (id) => document.getElementById(id);
const HAT_NAMES = {
  straw: 'Straw hat', bucket: 'Bucket', crown: 'Tiny crown', antlers: 'Antlers', cone: 'Traffic cone', witch: 'Witch hat', tophat: 'Top hat',
  propeller: 'Propeller cap', chef: 'Chef hat', pirate: 'Pirate hat', viking: 'Viking helm', party: 'Party hat', halo: 'Halo',
};
const coins = (n) => `${Math.round(n).toLocaleString()} ¢`;

export function setupGarage(game, { onClose } = {}) {
  const A = game.account;
  const rides = Object.fromEntries(game.vehicles.map((v) => [v.id, v]));
  const TABS = {
    rides: { label: 'RIDE', slot: 'ride', items: () => game.vehicles.map((v) => ({ id: v.id, name: v.name, blurb: v.blurb, price: RIDES[v.id] ?? 0, stats: v })) },
    wheels: { label: 'WHEELS', slot: 'wheels', items: () => Object.entries(WHEELS).map(([id, w]) => ({ id, ...w })) },
    roof: { label: 'ROOF', slot: 'roof', items: () => Object.entries(ROOF).map(([id, w]) => ({ id, ...w, blurb: id === 'none' ? w.blurb : `${w.blurb} (E)` })) },
    bumper: { label: 'BUMPER', slot: 'bumper', items: () => Object.entries(BUMPER).map(([id, w]) => ({ id, ...w, blurb: id === 'none' || id === 'catcher' ? w.blurb : `${w.blurb} (Q)` })) },
    paint: { label: 'PAINT', slot: 'paint', items: () => [{ id: -1, name: 'Team Colour', blurb: 'Your seat\'s colour in the room.', price: 0, swatch: null }, ...PAINTS.map((p, i) => ({ id: i, name: p.name, blurb: 'Dusty paint that weathers in the glade.', price: 0, swatch: p.rgb }))] },
    hats: { label: 'HAT', slot: 'hat', items: () => HAT_IDS.map((id) => ({ id, name: HAT_NAMES[id] || id, blurb: id === 'straw' ? 'The classic.' : 'Found in the glade, or bought here.', price: id === 'straw' ? 0 : HAT_PRICE })) },
  };
  let tab = 'rides', sel = null, open = false, inGame = false, msgT = 0;

  // ---------------------------------------------------------------- the account chip (menu + garage)
  const chip = $('acctChip');
  const paintChip = () => {
    const P = A.profile;
    if (!P) return;
    $('acctName').textContent = (P.name || A.portalName || 'GUEST').toUpperCase();
    $('acctCoins').textContent = coins(A.coins);
  };
  A.onChange(() => { paintChip(); if (open) render(); });
  // CrazyGames doesn't allow a game's own sign-in: there the chip only shows your name and coins
  // (progress is kept on the device), and the register / sign-in panel never opens
  if (ON_CRAZY) { chip.classList.add('static'); chip.tabIndex = -1; chip.setAttribute('aria-disabled', 'true'); }
  else chip.onclick = () => openAccount();

  // ---------------------------------------------------------------- garage: tap to equip, the car wears it at once
  const tabsEl = $('gTabs'), itemsEl = $('gItems');
  tabsEl.innerHTML = Object.entries(TABS).map(([k, t]) => `<button data-tab="${k}">${t.label}</button>`).join('');
  for (const b of tabsEl.querySelectorAll('button')) b.onclick = () => { tab = b.dataset.tab; sel = null; render(); };
  const owned = (it) => A.owns(tab, it.id);
  const equippedId = () => A.setup[TABS[tab].slot];
  const say = (text) => { $('gMsg').textContent = text; clearTimeout(msgT); msgT = setTimeout(() => ($('gMsg').textContent = ''), 2600); };

  async function pick(it) {
    sel = it;
    if (owned(it) && it.id !== equippedId()) await A.equip({ [TABS[tab].slot]: it.id }); // owned (or free): wear it now
    render();
  }

  function render() {
    for (const b of tabsEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === tab);
    const items = TABS[tab].items(), eqId = equippedId();
    if (!sel || !items.some((it) => it.id === sel.id)) sel = items.find((it) => it.id === eqId) || items[0];
    itemsEl.classList.toggle('swatches', tab === 'paint');
    itemsEl.innerHTML = items.map((it) => {
      const own = owned(it), eq = it.id === eqId, cls = `g-card${eq ? ' eq' : ''}${it.id === sel.id ? ' sel' : ''}${own ? '' : ' locked'}`;
      if (tab === 'paint') {
        const bg = it.swatch ? `rgb(${it.swatch.map((v) => Math.round(v * 200)).join(',')})` : '';
        return `<button class="${cls} sw" data-id="${it.id}" title="${it.name}" aria-label="${it.name}"><i class="${it.swatch ? '' : 'team'}" style="${bg ? `background:${bg}` : ''}"></i></button>`;
      }
      return `<button class="${cls}" data-id="${it.id}">${it.name}${own ? '' : `<small>${coins(it.price)}</small>`}</button>`;
    }).join('');
    for (const b of itemsEl.querySelectorAll('.g-card')) b.onclick = () => pick(items.find((it) => String(it.id) === b.dataset.id));
    const selCard = itemsEl.querySelector('.g-card.sel');
    if (selCard && selCard.scrollIntoView) selCard.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    $('gName').textContent = sel.name;
    $('gBlurb').textContent = sel.blurb || '';
    // ride stats
    const st = $('gStats');
    if (tab === 'rides' && sel.stats) { const v = sel.stats, bar = (l, x) => `<span>${l}</span><i style="--v:${Math.round(Math.min(1, x) * 100)}%"></i>`; st.innerHTML = bar('SPEED', v.speed) + bar('WEIGHT', v.weight) + bar('GRIP', v.grip); st.hidden = false; }
    else { st.innerHTML = ''; st.hidden = true; }
    // the tire size, for rubber tires and sawblades
    const tireish = tab === 'wheels' && ['tires', 'saw', 'magnet', 'square'].includes(sel.id) && owned(sel);
    const big = A.owns('upgrades', 'monster');
    $('gTireRow').hidden = !tireish;
    $('gBigTires').hidden = !tireish || big;
    if (tireish) {
      const [lo, hi] = big ? TIRE_RANGE.monster : TIRE_RANGE.base, r = $('gTire');
      r.min = Math.round(lo * 100); r.max = Math.round(hi * 100);
      if (document.activeElement !== r) r.value = Math.round(A.setup.tire * 100);
      $('gTireVal').textContent = `${r.value}%`;
      if (!big) $('gBigTires').textContent = `BIGGER ${coins(UPGRADES.monster.price)}`;
    }
    // BUY only for something you don't own yet
    const btn = $('gAction'), own = owned(sel);
    btn.hidden = own;
    if (!own) { btn.textContent = `BUY ${coins(sel.price)}`; btn.disabled = A.coins < sel.price; }
    // the preview wears what's equipped, or what you're looking at before you buy it
    game.preview(own ? A.setup : { ...A.setup, [TABS[tab].slot]: sel.id });
    paintChip();
  }

  const tireNow = () => Number($('gTire').value) / 100;
  $('gTire').oninput = () => { $('gTireVal').textContent = `${$('gTire').value}%`; game.preview({ ...A.setup, tire: tireNow() }); };
  $('gTire').onchange = () => A.equip({ tire: tireNow() });
  $('gBigTires').onclick = async () => { const r = await A.buy('upgrades', 'monster'); if (r.error) say(r.error); render(); };
  $('gAction').onclick = async () => {
    $('gAction').disabled = true;
    const r = await A.buy(tab, sel.id);
    if (r.error) { say(r.error); render(); return; }
    await A.equip({ [TABS[tab].slot]: sel.id });
    say(`${sel.name} is yours!`);
    render();
  };

  function openGarage(fromGame = false) {
    open = true; inGame = fromGame;
    tab = 'rides'; sel = null;
    $('garageUI').hidden = false;
    chip.hidden = false;
    document.body.classList.add('garage-open');
    render();
  }
  function closeGarage() {
    open = false;
    $('garageUI').hidden = true;
    document.body.classList.remove('garage-open');
    game.preview(null);
    if (inGame) { game.applySetup(A.setup); chip.hidden = true; window.dispatchEvent(new Event('hsg:garageClosed')); }
    if (onClose) onClose(inGame);
  }
  $('gBack').onclick = closeGarage;
  window.addEventListener('hsg:garage', (e) => openGarage(!!(e.detail && e.detail.inGame)));
  window.addEventListener('hsg:closeGarage', () => { if (open) closeGarage(); }); // the host started the match
  window.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.code === 'Escape') { e.stopImmediatePropagation(); if (!$('acctUI').hidden) closeAccount(); else closeGarage(); }
    if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && document.activeElement !== $('gTire')) {
      const items = TABS[tab].items(), i = items.findIndex((it) => it.id === sel.id);
      pick(items[(i + (e.code === 'ArrowLeft' ? items.length - 1 : 1)) % items.length]);
    }
  }, true);

  // ---------------------------------------------------------------- account panel
  let mode = 'register';
  const paintAccount = () => {
    const P = A.profile, signedIn = P && P.name;
    $('aSignedOut').hidden = !!signedIn;
    $('aSignedIn').hidden = !signedIn;
    $('aTitle').textContent = signedIn ? 'ACCOUNT' : mode === 'register' ? 'REGISTER' : 'SIGN IN';
    $('aTabReg').classList.toggle('on', mode === 'register');
    $('aTabLog').classList.toggle('on', mode === 'login');
    $('aGo').textContent = mode === 'register' ? 'REGISTER' : 'SIGN IN';
    $('aHint').textContent = !A.online ? 'Accounts need the game server. Your progress is saved on this device.' : mode === 'register' ? 'Keep your coins and garage on every device. Your guest progress moves into the new account.' : 'Signing in switches to that account. Unsaved guest progress stays on the guest.';
    $('aPass').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    if (signedIn) {
      $('aWho').textContent = P.name;
      const S = P.stats || {};
      $('aStats').innerHTML = [['COINS', coins(A.coins)], ['SMASHES', S.smashes || 0], ['FLIPS', S.flips || 0], ['DRIVEN', `${((S.distance || 0) / 1000).toFixed(1)} km`], ['FURTHEST', `${S.best || 0} m`], ['EARNED', coins(S.earned || 0)]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    }
  };
  function openAccount() { $('acctUI').hidden = false; $('aMsg').textContent = ''; paintAccount(); setTimeout(() => (A.profile?.name ? $('aOut') : $('aName')).focus(), 50); }
  function closeAccount() { $('acctUI').hidden = true; }
  $('aBack').onclick = closeAccount;
  $('aTabReg').onclick = () => { mode = 'register'; paintAccount(); };
  $('aTabLog').onclick = () => { mode = 'login'; paintAccount(); };
  const go = async () => {
    const name = $('aName').value.trim(), pw = $('aPass').value;
    $('aGo').disabled = true; $('aMsg').textContent = '…';
    const r = mode === 'register' ? await A.register(name, pw) : await A.login(name, pw);
    $('aGo').disabled = false;
    if (r.error) { $('aMsg').textContent = r.error; return; }
    $('aPass').value = '';
    $('aMsg').textContent = mode === 'register' ? `Welcome, ${r.profile.name}!` : `Welcome back, ${r.profile.name}.`;
    paintAccount();
    window.dispatchEvent(new Event('hsg:account'));
  };
  $('aGo').onclick = go;
  for (const id of ['aName', 'aPass']) $(id).addEventListener('keydown', (e) => { if (e.code === 'Enter') { e.preventDefault(); go(); } e.stopPropagation(); });
  $('aOut').onclick = async () => { await A.logout(); $('aMsg').textContent = 'Signed out. You are a guest again.'; paintAccount(); window.dispatchEvent(new Event('hsg:account')); };

  paintChip();
  return { openGarage, closeGarage, openAccount, rideName: () => (rides[A.setup.ride] || {}).name || 'Mudrunner' };
}

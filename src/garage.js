// The garage (shop + loadout) and the account panel. Plain DOM; the car you're looking at is a
// live preview in the game scene behind the panel. Opened from the menu or from in-game settings.
import { RIDES, WHEELS, ROOF, BUMPER, UPGRADES, HAT_IDS, HAT_PRICE, TIRE_RANGE, FREE_FOR_NOW, PAINTS } from './catalog.js';

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
    rides: { label: 'RIDES', slot: 'ride', items: () => game.vehicles.map((v) => ({ id: v.id, name: v.name, blurb: v.blurb, price: RIDES[v.id] ?? 0, stats: v })) },
    wheels: { label: 'WHEELS', slot: 'wheels', items: () => [...Object.entries(WHEELS).map(([id, w]) => ({ id, ...w })), { id: 'monster', cat: 'upgrades', ...UPGRADES.monster, upgrade: true }] },
    roof: { label: 'ROOF · E', slot: 'roof', items: () => Object.entries(ROOF).map(([id, w]) => ({ id, ...w })) },
    bumper: { label: 'BUMPER · Q', slot: 'bumper', items: () => Object.entries(BUMPER).map(([id, w]) => ({ id, ...w })) },
    paint: { label: 'PAINT', slot: 'paint', items: () => [{ id: -1, name: 'Team Colour', blurb: 'The colour of your seat in the room, so everyone looks different.', price: 0, swatch: null }, ...PAINTS.map((p, i) => ({ id: i, name: p.name, blurb: 'Dusty paint. It weathers in the glade.', price: 0, swatch: p.rgb }))] },
    hats: { label: 'HATS', slot: 'hat', items: () => HAT_IDS.map((id) => ({ id, name: HAT_NAMES[id] || id, blurb: id === 'straw' ? 'The classic.' : 'Find it in the glade for free, or buy it here.', price: id === 'straw' ? 0 : HAT_PRICE })) },
  };
  let tab = 'rides', sel = null, trial = null, open = false, inGame = false;

  // ---------------------------------------------------------------- the account chip (menu + garage)
  const chip = $('acctChip');
  const paintChip = () => {
    const P = A.profile;
    if (!P) return;
    $('acctName').textContent = P.name ? P.name.toUpperCase() : 'GUEST';
    $('acctCoins').textContent = coins(A.coins);
  };
  A.onChange(() => { paintChip(); if (open) render(); });
  chip.onclick = () => openAccount();

  // ---------------------------------------------------------------- garage
  const tabsEl = $('gTabs'), itemsEl = $('gItems');
  tabsEl.innerHTML = Object.entries(TABS).map(([k, t]) => `<button data-tab="${k}">${t.label}</button>`).join('');
  for (const b of tabsEl.querySelectorAll('button')) b.onclick = () => { tab = b.dataset.tab; sel = null; render(); };
  const catOf = (it) => it.cat || tab;
  const owned = (it) => A.owns(catOf(it), it.id);
  const equippedId = () => (A.setup[TABS[tab].slot]);

  function render() {
    for (const b of tabsEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === tab);
    const items = TABS[tab].items();
    if (!sel) sel = items.find((it) => it.id === equippedId()) || items[0];
    itemsEl.innerHTML = items.map((it) => {
      const own = owned(it), eq = !it.upgrade && it.id === equippedId();
      const tag = eq ? 'EQUIPPED' : FREE_FOR_NOW ? (it.upgrade ? 'UNLOCKED' : 'FREE') : own ? 'OWNED' : coins(it.price);
      const sw = it.swatch ? `<i class="sw" style="background:rgb(${it.swatch.map((v) => Math.round(v * 200)).join(',')})"></i>` : tab === 'paint' ? '<i class="sw team"></i>' : '';
      return `<button class="g-card${it.id === sel.id ? ' sel' : ''}${eq ? ' eq' : ''}${own ? '' : ' locked'}" data-id="${it.id}"><b>${sw}${it.name}</b><span>${tab === 'paint' && !eq ? 'FREE' : tag}</span></button>`;
    }).join('');
    for (const b of itemsEl.querySelectorAll('.g-card')) b.onclick = () => { sel = items.find((it) => String(it.id) === b.dataset.id); render(); };
    const selCard = itemsEl.querySelector('.g-card.sel');
    if (selCard && selCard.scrollIntoView) selCard.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    // the selected item
    $('gName').textContent = sel.name;
    $('gBlurb').textContent = sel.blurb || '';
    const st = $('gStats');
    if (tab === 'rides' && sel.stats) {
      const v = sel.stats, bar = (l, x) => `<span>${l}</span><i style="--v:${Math.round(Math.min(1, x) * 100)}%"></i>`;
      st.innerHTML = bar('SPEED', v.speed) + bar('WEIGHT', v.weight) + bar('GRIP', v.grip);
    } else st.innerHTML = '';
    // the tire slider (rubber tires and sawblades)
    const tireish = tab === 'wheels' && ['tires', 'saw'].includes(sel.id);
    $('gTireRow').hidden = !tireish;
    if (tireish) {
      const [lo, hi] = A.owns('upgrades', 'monster') ? TIRE_RANGE.monster : TIRE_RANGE.base;
      const r = $('gTire');
      r.min = Math.round(lo * 100); r.max = Math.round(hi * 100);
      if (document.activeElement !== r) r.value = Math.round((trial?.tire ?? A.setup.tire) * 100);
      $('gTireVal').textContent = `${r.value}%`;
    }
    // the action button
    const own = owned(sel), eq = !sel.upgrade && sel.id === equippedId();
    const btn = $('gAction');
    btn.disabled = false;
    if (sel.upgrade) { btn.textContent = own ? (FREE_FOR_NOW ? 'UNLOCKED' : 'OWNED') : `BUY ${coins(sel.price)}`; btn.disabled = own || A.coins < sel.price; }
    else if (!own) { btn.textContent = `BUY ${coins(sel.price)}`; btn.disabled = A.coins < sel.price; }
    else if (eq && !(tireish && trial && trial.tire !== A.setup.tire)) { btn.textContent = 'EQUIPPED'; btn.disabled = true; }
    else btn.textContent = 'EQUIP';
    if (!own && A.coins < sel.price) $('gMsg').textContent = `You need ${coins(sel.price - A.coins)} more. Smash, flip and explore to earn coins.`;
    else if ($('gMsg').dataset.sticky !== '1') $('gMsg').textContent = '';
    // try it on: the preview wears the selection even before you buy it
    trial = { ...A.setup, ...(trial && trial.tire !== undefined ? { tire: trial.tire } : {}) };
    if (!sel.upgrade) trial[TABS[tab].slot] = sel.id;
    if (tireish) trial.tire = Number($('gTire').value) / 100;
    game.preview(trial);
    paintChip();
  }

  $('gTire').oninput = () => { $('gTireVal').textContent = `${$('gTire').value}%`; trial = { ...trial, tire: Number($('gTire').value) / 100 }; game.preview({ ...trial }); render(); };

  $('gAction').onclick = async () => {
    const btn = $('gAction');
    btn.disabled = true;
    const msg = $('gMsg');
    msg.dataset.sticky = '';
    if (!owned(sel)) {
      const r = await A.buy(catOf(sel), sel.id);
      if (r.error) { msg.textContent = r.error; msg.dataset.sticky = '1'; render(); return; }
      msg.textContent = `${sel.name} is yours!`; msg.dataset.sticky = '1';
      if (sel.upgrade) { render(); return; }
    }
    const patch = { [TABS[tab].slot]: sel.id };
    if (tab === 'wheels' && ['tires', 'saw'].includes(sel.id)) patch.tire = Number($('gTire').value) / 100;
    await A.equip(patch);
    render();
  };

  function openGarage(fromGame = false) {
    open = true; inGame = fromGame;
    tab = 'rides'; sel = null; trial = null;
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
  window.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.code === 'Escape') { e.stopImmediatePropagation(); if (!$('acctUI').hidden) closeAccount(); else closeGarage(); }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      const items = TABS[tab].items(), i = items.findIndex((it) => it.id === sel.id);
      sel = items[(i + (e.code === 'ArrowLeft' ? items.length - 1 : 1)) % items.length]; render();
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

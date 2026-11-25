// Audio: every recorded sound decodes, the menu music starts on the first tap, PLAY switches to
// the glade music, the engine loop follows the throttle, game events play recordings (never the
// synthesised fallback), and the volume sliders work.
import { launch, sleep, BASE } from './lib.mjs';
const browser = await launch();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const p = await ctx.newPage();
const errors = [], bad = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('response', (r) => { if (r.url().includes('/audio/') && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
await p.goto(`${BASE}/`);
await p.waitForSelector('#menu:not([hidden])', { timeout: 30000 });
const A = () => p.evaluate(() => window.__hsgAudio());
ok((await A()).state == null, 'no audio before the first tap (browsers need a gesture)');
await p.mouse.click(40, 600); // a tap on the background
await sleep(2500);
let a = await A();
ok(a.state === 'running' && a.loadedAll && a.missing.length === 0, `first tap unlocks audio; all sounds decoded (${a.loaded} files, missing: ${a.missing.join(',') || 'none'})`);
ok(a.music === 'menu' && a.playing && a.t > 0.5 && a.track === 'music-menu.mp3', `menu music is playing (${a.track} at ${a.t.toFixed(1)} s)`);
ok(a.wind && a.engine, 'wind ambience and engine loop are loaded');
await p.click('#btnPlay');
await p.waitForFunction(() => window.__hsg && window.__hsg.me, null, { timeout: 30000 });
await sleep(3000);
a = await A();
ok(a.music === 'glade' && a.playing && /music-glade\d\.mp3/.test(a.track), `PLAY switches to glade music (${a.track})`);
// drive: the engine follows the throttle (sampled through a stop and a full-throttle run)
const rates = [];
const sampleFor = async (ms) => { for (let t = 0; t < ms; t += 100) { const r = await A(); rates.push(r.engineRate); await sleep(100); } };
await p.keyboard.down('KeyA'); await sampleFor(1500); await p.keyboard.up('KeyA'); await sampleFor(800);
await p.keyboard.down('KeyD'); await p.keyboard.down('KeyW'); await sampleFor(2500);
await p.keyboard.up('KeyW'); await p.keyboard.up('KeyD');
const lo = Math.min(...rates), hi = Math.max(...rates);
ok(hi - lo > 0.3, `the engine revs with the throttle (rate ${lo.toFixed(2)} to ${hi.toFixed(2)})`);
await p.keyboard.down('KeyD');
for (let i = 0; i < 6; i++) { await p.keyboard.press('Space'); await sleep(700); await p.keyboard.press('KeyH'); await sleep(500); }
await p.keyboard.up('KeyD');
// set off a barrel next to us and wreck ourselves
await p.evaluate(() => { const g = window.__hsg, m = g.me; m.damage && m.damage(200, null); });
await sleep(2500);
await p.evaluate(() => { const g = window.__hsg; const B = g.sandbox.barrels.find((b) => b.alive); if (B) g.sandbox.explode ? g.sandbox.explode(B) : null; });
await sleep(1500);
a = await A();
const played = Object.entries(a.played).map(([k, v]) => `${k}×${v}`).join(' ');
ok(['honk', 'boing', 'whoosh'].every((k) => a.played[k]), `driving plays recorded sounds: ${played}`);
ok(Object.keys(a.fallback).length === 0, `no synthesised fallbacks (${JSON.stringify(a.fallback)})`);
// every ride's own horn
const rides = ['mudrunner', 'tub', 'tractor', 'monster', 'hearse', 'trike', 'kart', 'dozer', 'barrow', 'roller', 'bus'];
const before = (await A()).played.honk || 0;
for (const ride of rides) { await p.evaluate((r) => window.__hsg.applySetup({ ...window.__hsg.account.setup, ride: r }), ride); await sleep(500); ok((await p.evaluate(() => window.__hsg.me.vehicle)) === ride, `${ride}: switched`); await p.keyboard.press('KeyH'); await sleep(700); }
a = await A();
ok((a.played.honk || 0) - before >= rides.length && Object.keys(a.fallback).length === 0, `each of the ${rides.length} rides honks with its own recorded horn (${(a.played.honk || 0) - before} honks, fallbacks ${JSON.stringify(a.fallback)})`);
// each map has its own music and ambience
const MAPMUSIC = { graveyard: ['music-graveyard.mp3', 'amb-crickets.mp3'], hallow: ['music-hallow.mp3', 'amb-crickets.mp3'], crater: ['music-moon.mp3', 'amb-space.mp3'], bog: ['music-bog.mp3', 'amb-swamp.mp3'], quarry: ['music-quarry.mp3', 'amb-machine.mp3'], glade: [/music-glade\d\.mp3/, null] };
for (const [m, [track, bedFile]] of Object.entries(MAPMUSIC)) {
  await p.evaluate((m) => window.__hsg.applyMap(m), m); await sleep(2500);
  a = await A();
  const tOk = track instanceof RegExp ? track.test(a.track) : a.track === track;
  ok(tOk && a.playing && a.scene === m && (a.bed || null) === bedFile, `${m}: its own music (${a.track}) and ambience (${a.bed || 'just wind'})`);
}
// volume sliders
await p.keyboard.press('Escape'); await sleep(300);
await p.$eval('#optMusic', (r) => { r.value = '20'; r.dispatchEvent(new Event('input')); });
await sleep(400);
a = await A();
ok(Math.abs(a.vol.music - 0.2) < 0.01 && Math.abs(a.musicGain - 0.2) < 0.05, `music slider sets the music volume (${a.musicGain.toFixed(2)})`);
ok(await p.evaluate(() => localStorage.getItem('hsg.vol.music') === '0.2'), 'music volume is saved');
await p.$eval('#optMusic', (r) => { r.value = '55'; r.dispatchEvent(new Event('input')); });
ok(bad.length === 0, `no failed audio downloads ${bad.join(' ')}`);
ok(errors.length === 0, `no page errors ${errors.slice(0, 2).join(' | ')}`);
await browser.close();

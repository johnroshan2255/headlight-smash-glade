// Load time on slow networks: how long until the menu is ready, how many bytes that took, and how
// long from PLAY to driving. Uses Chrome's network throttling (cache off, like a first visit).
// node scripts/playtest/loadtime.mjs
import { launch, sleep, BASE } from './lib.mjs';
const browser = await launch();
const NETS = [
  ['wifi', { latency: 20, downloadThroughput: (30e6 / 8), uploadThroughput: (10e6 / 8) }],
  ['4g', { latency: 85, downloadThroughput: (9e6 / 8), uploadThroughput: (2e6 / 8) }],
  ['slow-4g', { latency: 150, downloadThroughput: (1.6e6 / 8), uploadThroughput: (0.75e6 / 8) }],
];
for (const [tag, net] of NETS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...net });
  let bytes = 0; const files = new Map();
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
  cdp.on('Network.responseReceived', (e) => files.set(e.requestId, e.response.url.split('/').pop() || 'index'));
  const t0 = Date.now();
  await p.goto(`${BASE}/`);
  const tPaint = await p.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0);
  await p.waitForSelector('#menu:not([hidden])', { timeout: 120000 });
  const tMenu = Date.now() - t0, menuBytes = bytes;
  await sleep(300);
  await p.click('#btnPlay');
  const t1 = Date.now();
  await p.waitForFunction(() => window.__hsg && window.__hsg.me, null, { timeout: 120000 });
  const tDrive = Date.now() - t1;
  await sleep(4000);
  console.log(`${tag.padEnd(8)} first paint ${(tPaint / 1000).toFixed(2)} s | menu ready ${(tMenu / 1000).toFixed(2)} s (${(menuBytes / 1024).toFixed(0)} KB) | PLAY -> driving ${(tDrive / 1000).toFixed(2)} s | after 4 s of play ${(bytes / 1024).toFixed(0)} KB in ${files.size} requests`);
  await ctx.close();
}
await browser.close();

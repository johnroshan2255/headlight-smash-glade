// Shared helpers for the headless playtests: the system Chrome, driven by playwright-core.
// Start the game first (npm run play), then e.g.  node scripts/playtest/vehicles.mjs
import os from 'os';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright-core';
export { chromium };

export const BASE = process.env.HSG_URL || 'http://localhost:2567';
export const SHOTS = (process.env.HSG_SHOTS || path.join(os.tmpdir(), 'hsg-shots')) + path.sep;
fs.mkdirSync(SHOTS, { recursive: true });

export async function launch({ webgpu = false } = {}) {
  return chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      // the real GPU through ANGLE (Metal on a Mac, Direct3D 11 on Windows). Without it headless
      // Chrome renders in software at ~3 fps, the game's clamped dt slows time down, and the
      // timing-based checks (rams, slams, rockets) fail for no real reason
      '--enable-gpu', `--use-angle=${process.platform === 'darwin' ? 'metal' : process.platform === 'win32' ? 'd3d11' : 'vulkan'}`, '--ignore-gpu-blocklist', '--enable-webgl',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio',
      ...(webgpu ? ['--enable-unsafe-webgpu', '--enable-features=WebGPU'] : []),
    ],
  });
}

/** Open the game and drop straight into the glade. Returns { page, errors, ctx }. */
export async function open(browser, { query = 'autostart&mode=solo&veh=mudrunner&gpu=webgl2&stats', viewport = { width: 1280, height: 720 }, context = {} } = {}) {
  const ctx = await browser.newContext({ viewport, ...context });
  const page = await ctx.newPage();
  const errors = [];
  page.on('crash', () => errors.push('PAGE CRASHED'));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  await page.goto(`${BASE}/?${query}`);
  await page.waitForFunction(() => window.__hsg && window.__hsg.me, null, { timeout: 30000 });
  return { page, errors, ctx };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const state = (page) => page.evaluate(() => {
  const g = window.__hsg, m = g.me;
  return {
    x: +m.body.p[0].toFixed(2), y: +m.body.p[1].toFixed(2), a: +m.body.a.toFixed(2), vx: +m.body.v[0].toFixed(2), vy: +m.body.v[1].toFixed(2),
    hp: Math.round(m.hp), wrecked: m.wrecked, facing: m.facing, grounded: m.grounded, score: m.score,
    cars: g.cars.size, bodies: g.physics.bodies.length, host: g.net.isHost, online: g.net.online,
    stats: document.getElementById('stats').textContent,
  };
});

/** Clear the glade of props (barrels, trees, cage-ball, boulders, crates) for clean handling trials. */
export const emptyGlade = (page) => page.evaluate(() => { const S = window.__hsg.sandbox; S.chunkT = 1e9; for (const B of S.barrels) { B.alive = false; B.respawn = 1e9; B.body.enabled = false; } for (const T of S.trees.values()) { S.hideTree(T); T.respawn = 1e9; } for (const P of S.balls) { P.alive = false; P.respawn = 1e9; P.body.enabled = false; } for (const sl of S.slides.values()) { sl.released = true; sl.respawn = 1e9; for (const R of sl.rocks) R.body.enabled = false; } for (const C of S.crates.values()) { C.alive = false; C.respawn = 1e9; } });

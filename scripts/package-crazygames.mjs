// Builds and zips the game for CrazyGames: release/fogbash-crazygames.zip (upload it as an HTML5 game).
//
//   VITE_SERVER_URL=wss://<your-railway-app>.up.railway.app npm run crazygames
//
// The CrazyGames build differs from the web build only in src/portal.js being switched on
// (VITE_PORTAL=crazygames): the SDK script in <head>, gameplayStart/Stop, muteAudio, invite links
// into rooms, no fullscreen button and no name/password sign-in (guest progress stays on the device).
// CrazyGames hosts the files themselves, so co-op needs the absolute address of the game server.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-crazygames'); // its own folder: dist/ stays the normal web build
const out = path.join(root, 'release');

const server = process.env.VITE_SERVER_URL || '';
if (!/^wss:\/\/[^/]+/.test(server)) {
  console.error('\n  Set VITE_SERVER_URL to the game server (wss://…, the Railway app), e.g.\n    VITE_SERVER_URL=wss://fogbash.up.railway.app npm run crazygames\n');
  process.exit(1);
}
// the server must answer, or the build would ship solo-only
try {
  const r = await fetch(`${server.replace(/^ws/, 'http').replace(/\/$/, '')}/health`);
  if (!r.ok) throw new Error(`status ${r.status}`);
  console.log(`  server ${server}: ok`);
} catch (e) { console.warn(`  WARNING: ${server}/health did not answer (${e.message}). Co-op will be off until it does.`); }

execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', 'dist-crazygames', '--emptyOutDir'], { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_PORTAL: 'crazygames', VITE_SERVER_URL: server } });

const pcLicense = fs.readFileSync(path.join(root, 'node_modules/playcanvas/LICENSE'), 'utf8');
fs.writeFileSync(path.join(dist, 'THIRD-PARTY-LICENSES.txt'), `Fogbash uses the PlayCanvas engine (https://github.com/playcanvas/engine)\n\n${pcLicense}\n`);

// sanity: relative paths only, the SDK is in, and CrazyGames' limits (1500 files, 250 MB; 20 MB initial for the mobile homepage)
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const absolute = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
if (absolute.length) throw new Error(`absolute paths in index.html: ${absolute.join(', ')}`);
if (!html.includes('crazygames-sdk-v3.js')) throw new Error('the CrazyGames SDK script is missing from index.html');
let total = 0, files = 0;
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p); if (s.isDirectory()) walk(p); else { total += s.size; files++; } } };
walk(dist);
if (files > 1500) throw new Error(`${files} files: CrazyGames allows 1500`);

fs.mkdirSync(out, { recursive: true });
const zip = path.join(out, 'fogbash-crazygames.zip');
if (fs.existsSync(zip)) fs.unlinkSync(zip);
const entries = fs.readdirSync(dist).filter((f) => f !== '.DS_Store');
try {
  execFileSync('zip', ['-r', '-X', '-9', zip, ...entries], { cwd: dist, stdio: 'ignore' });
} catch {
  // Windows: its own bsdtar writes zips (index.html stays at the zip's root)
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'bsdtar';
  execFileSync(tar, ['-a', '-c', '-f', zip, ...entries], { cwd: dist, stdio: 'inherit' });
}
console.log(`\n  ${zip}\n  zip: ${(fs.statSync(zip).size / 1048576).toFixed(1)} MB   unpacked: ${(total / 1048576).toFixed(1)} MB in ${files} files\n`);

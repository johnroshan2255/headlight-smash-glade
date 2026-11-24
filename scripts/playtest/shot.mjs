// node shot.mjs <name> [query] [waitMs] [WxH]: drop in, wait, screenshot, print state + errors.
import { launch, open, sleep, state, SHOTS } from './lib.mjs';
const [name = 'shot', query = 'autostart&mode=solo&veh=mudrunner&gpu=webgl2&stats', wait = '4000', size = '1280x720', pre = ''] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const browser = await launch({ webgpu: query.includes('webgpu') });
try {
  const { page, errors } = await open(browser, { query, viewport: { width, height } });
  if (pre) await page.evaluate(pre);
  await sleep(Number(wait));
  await page.screenshot({ path: `${SHOTS}${name}.png` });
  console.log(JSON.stringify(await state(page), null, 1));
  console.log('errors:', errors.length ? errors.slice(0, 12) : 'none');
} finally { await browser.close(); }

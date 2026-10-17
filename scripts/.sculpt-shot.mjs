import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const shapes = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 520, height: 420 } });
await p.goto('http://localhost:5173/?fresh&lowfx', { waitUntil: 'load' });
await p.waitForFunction(() => window.__naga, null, { timeout: 30000 });
await p.waitForTimeout(1500);
for (const [name, boxes] of shapes) {
  await p.evaluate((boxes) => { document.getElementById('landing')?.classList.add('hidden'); window.__naga.apply({ v: 1, type: 'clear' }); window.__naga.apply({ v: 1, type: 'sculpt', label: 'x', boxes }); }, boxes);
  await p.waitForTimeout(2200);
  await p.screenshot({ path: `${process.argv[3]}/${name}.png` });
}
await b.close();

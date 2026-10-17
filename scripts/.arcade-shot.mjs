import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:5173/?fresh&lowfx', { waitUntil: 'load' });
await p.waitForFunction(() => window.__naga, null, { timeout: 30000 });
await p.waitForTimeout(1500);
const modes = process.argv.slice(2);
for (const m of modes) {
  await p.evaluate((m) => window.__naga.setMode(m), m);
  await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelector('#howto')?.classList.remove('show'));
  // nudge each game into action
  if (m === 'flapbro' || m === 'penguin') for (let i = 0; i < 6; i++) { await p.keyboard.press('Space'); await p.waitForTimeout(350); }
  if (m === 'swarm' || m === 'breakout') { await p.keyboard.down('Space'); await p.waitForTimeout(1200); await p.keyboard.up('Space'); }
  if (m === 'maze') { await p.keyboard.down('ArrowRight'); await p.waitForTimeout(900); await p.keyboard.up('ArrowRight'); }
  if (m === 'tower') { await p.keyboard.press('Space'); await p.waitForTimeout(500); await p.keyboard.press('Space'); }
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `/tmp/claude-0/shots/g-${m}.png` });
  const st = await p.evaluate(() => { const a = window.__naga.arcade(); return a && a.debugState ? a.debugState() : null; });
  console.log(m, JSON.stringify(st)?.slice(0, 300));
}
console.log('errors', errs.slice(0, 5));
await b.close();

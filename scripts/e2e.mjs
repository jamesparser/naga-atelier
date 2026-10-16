#!/usr/bin/env node
/**
 * Headless end-to-end check of the judge loop using the IWER WebXR emulator (Quest 3, hands).
 *   enter AR -> onboarding -> pinch-drag starter block -> voice/text "build a small house"
 *   -> pinch the roof and slide it -> tap-place -> paint -> drag to trash -> undo -> fps/draw calls
 * Usage: BASE=http://localhost:5173 node scripts/e2e.mjs [--shots dir]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const shotsIdx = process.argv.indexOf('--shots');
const SHOTS = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const exe = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!cond) failures++;
};
const shot = async (n) => SHOTS && page.screenshot({ path: `${SHOTS}/${n}.png` });
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(`${BASE}/?emulate=1&fresh&tutorial`);
await page.waitForFunction(() => window.__naga && window.__iwer);
await page.waitForFunction(() => !document.getElementById('enter').disabled, null, { timeout: 15000 });
check('enter button offers passthrough', (await page.textContent('#enter')).includes('passthrough'));
await shot('00-landing');
await page.click('#enter');
await page.waitForFunction(() => window.__naga.stats().session, null, { timeout: 10000 });
await wait(1200);
check('session started in immersive-ar', (await page.evaluate(() => window.__naga.stats().mode)) === 'immersive-ar');
check('onboarding spawned starter block', (await page.evaluate(() => window.__naga.model.size)) === 1);

// --- hand helpers --------------------------------------------------------
/** Move the right hand so its pinch point lands on a world target (iterative, joints are offset from hand origin). */
let pinchOffset = [0, 0, 0];
async function stablePinch(side = 'right') {
  let prev = null;
  for (let i = 0; i < 40; i++) {
    const cur = (await page.evaluate((id) => window.__naga.pointers().find((x) => x.id === id), side === 'right' ? 11 : 10)).pinch;
    if (prev && Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]) < 0.0005) return cur;
    prev = cur;
    await wait(80);
  }
  return prev;
}
async function measurePinchOffset(side = 'right') {
  // IWER's pinch pose moves the thumb/index midpoint; measure it once so open-hand aiming lands where the pinch will be.
  await page.evaluate((side) => window.__iwer.hands[side].position.set(0.3, 1.5, -0.2), side);
  const open = await stablePinch(side);
  await pinch(1, side);
  const closed = await stablePinch(side);
  await pinch(0, side);
  await stablePinch(side);
  pinchOffset = closed.map((v, i) => v - open[i]);
}
/** Aim an OPEN hand so that, once pinched, the pinch lands on target. */
async function aim(target, side = 'right') {
  return handTo(target.map((v, i) => v - pinchOffset[i]), side);
}
async function handTo(target, side = 'right') {
  const id = side === 'right' ? 11 : 10;
  for (let i = 0; i < 6; i++) {
    await page.evaluate(({ target, side }) => {
      const h = window.__iwer.hands[side];
      const p = window.__naga.pointers().find((x) => x.kind === 'hand' && x.id === (side === 'right' ? 11 : 10));
      if (!p || !p.active) { h.position.set(target[0], target[1], target[2]); return; }
      h.position.set(h.position.x + (target[0] - p.pinch[0]), h.position.y + (target[1] - p.pinch[1]), h.position.z + (target[2] - p.pinch[2]));
    }, { target, side });
    const cur = await stablePinch(side);
    if (Math.hypot(cur[0] - target[0], cur[1] - target[1], cur[2] - target[2]) < 0.003) break;
  }
}
const pinch = (v, side = 'right') => page.evaluate(({ v, side }) => window.__iwer.hands[side].updatePinchValue(v), { v, side });
const cellWorld = (x, y, z) => page.evaluate(([x, y, z]) => window.__naga.deskToWorld(x, y, z), [x, y, z]);
const has = (x, y, z) => page.evaluate((k) => window.__naga.model.cells.has(k), `${x},${y},${z}`);
const cellOf = (x, y, z) => page.evaluate((k) => window.__naga.model.cells.get(k) ?? null, `${x},${y},${z}`);
const size = () => page.evaluate(() => window.__naga.model.size);

async function drag(from, to, side = 'right') {
  await pinch(0, side); await wait(150);
  await aim(await cellWorld(...from), side);
  await pinch(1, side); await wait(250);
  const a = await cellWorld(...from), b = await cellWorld(...to);
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    await handTo([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + 0.004, a[2] + (b[2] - a[2]) * t], side);
  }
  await pinch(0, side); await stablePinch(side); await wait(200);
}

// --- 1. pinch + drag the starter block ------------------------------------
await page.evaluate(() => { const d = window.__iwer; d.hands.left.position.set(-0.6, 0.5, 0.3); });
await measurePinchOffset();
console.log('      pinch offset', pinchOffset.map((v) => v.toFixed(3)).join(','));
const starter = await page.evaluate(() => [...window.__naga.model.cells.keys()][0].split(',').map(Number));
const dest = [starter[0] + 3, 0, starter[2] + 2];
await drag(starter, dest);
check('pinch-drag snaps starter block to new cell', (await has(...dest)) && !(await has(...starter)), `${starter} -> ${dest}`);
await shot('01-dragged');

// --- 2. agent: build a small house (text path through the real endpoint) ---
await page.evaluate(() => window.__naga.say('Build a small house on the desk'));
await wait(1200);
const n = await size();
check('agent built house_small (moved starter block kept)', n === 186, `blocks=${n}`);
await shot('02-house');

// find the roof
const roofKeys = await page.evaluate(() => [...window.__naga.model.cells].filter(([, c]) => c.cl?.endsWith(':roof')).map(([k]) => k));
check('house has a roof cluster', roofKeys.length > 50, `roof=${roofKeys.length}`);
const top = roofKeys.map((k) => k.split(',').map(Number)).sort((a, b) => b[1] - a[1])[0];

// --- 3. pinch the roof and slide it ---------------------------------------
await drag(top, [top[0] + 0, top[1], top[2] - 3]);
const roofAfter = await page.evaluate(() => [...window.__naga.model.cells].filter(([, c]) => c.cl?.endsWith(':roof')).map(([k]) => k));
const moved = roofAfter.length === roofKeys.length && roofAfter.some((k) => !roofKeys.includes(k));
check('roof moved as one cluster', moved, `roof cells ${roofAfter.length}`);
check('no blocks lost while moving roof', (await size()) === n);
await shot('03-roof-moved');

// --- 4. undo restores the roof --------------------------------------------
await page.evaluate(() => window.__naga.apply({ v: 1, type: 'undo' }));
await wait(200);
const roofUndo = await page.evaluate(() => [...window.__naga.model.cells].filter(([, c]) => c.cl?.endsWith(':roof')).map(([k]) => k).sort());
check('undo puts the roof back', JSON.stringify(roofUndo) === JSON.stringify([...roofKeys].sort()));

// --- 5. "make the roof red" -> color on roof only --------------------------
await page.evaluate(() => window.__naga.say('make the roof gold'));
await wait(800);
const colors = await page.evaluate(() => [...window.__naga.model.cells].filter(([, c]) => c.cl?.endsWith(':roof')).map(([, c]) => c.c));
check('voice recolor roof → gold', colors.every((c) => c === 'gold'));

// --- 6. tap-place a block in empty space ------------------------------------
const before = await size();
await pinch(0); await wait(100);
await aim(await cellWorld(-6, 0, 4));
await pinch(1); await wait(300);
console.log('      tap state', JSON.stringify(await page.evaluate(() => [...window.__naga.interaction.states].map(([i, v]) => [i, v.k, v.hit ?? null]))), JSON.stringify((await page.evaluate(() => window.__naga.pointers().find((x) => x.id === 11))).pinch), JSON.stringify(await cellWorld(-6, 0, 4)));
await pinch(0); await wait(600);
check('pinch-tap on empty desk places a block', (await size()) === before + 1 && (await has(-6, 0, 4)));

// --- 7. hold to detach a single wall block, drag it to the trash ------------
const wallKey = await page.evaluate(() => [...window.__naga.model.cells].find(([, c]) => c.cl?.endsWith(':walls'))?.[0]);
const w = wallKey.split(',').map(Number);
const beforeTrash = await size();
await aim(await cellWorld(...w));
await pinch(1); await wait(2500); // hold → detach (slow headless frames)
// trash sits at desk-local (DESK_HALF_W + 0.075, 0, 0.02): derive from cell coords (grid half width = 8 cells)
const tw = await cellWorld(8 + Math.round(0.075 / 0.04) - 1, 1, 0);
const sw = await cellWorld(...w);
for (let i = 1; i <= 6; i++) await handTo([sw[0] + (tw[0] - sw[0]) * i / 6, sw[1] + (tw[1] - sw[1]) * i / 6, sw[2] + (tw[2] - sw[2]) * i / 6]);
await pinch(0); await wait(300);
check('hold-detach + trash deletes exactly one block', (await size()) === beforeTrash - 1, `${beforeTrash} -> ${await size()}`);
await page.evaluate(() => window.__naga.apply({ v: 1, type: 'undo' }));
check('undo restores trashed block', (await size()) === beforeTrash);

// --- 8. poke a dock button (undo) with the index finger ---------------------
// (dock sits along the front edge; poke by moving the fingertip down onto it)

// --- 9. every blueprint spawns via the command channel ---------------------
await page.evaluate(() => window.__naga.apply({ v: 1, type: 'clear' }));
const counts = await page.evaluate(() => window.__naga.blueprints.map((id) => {
  window.__naga.apply({ v: 1, type: 'clear' });
  const r = window.__naga.apply({ v: 1, type: 'build', blueprintId: id });
  return [id, r.ok, window.__naga.model.size];
}));
check('all 10 blueprints spawn', counts.every(([, ok, n]) => ok && n > 20), counts.map(([id, , n]) => `${id}:${n}`).join(' '));

// heavy scene
await page.evaluate(() => { window.__naga.apply({ v: 1, type: 'clear' }); for (const id of ['house_small', 'tower', 'garden', 'desk_shelf', 'arch', 'fireplace']) window.__naga.apply({ v: 1, type: 'build', blueprintId: id }); });
await wait(2500);
const st = await page.evaluate(() => window.__naga.stats());
check('heavy scene draw calls within budget (≤40)', st.calls <= 40, JSON.stringify(st));
await shot('09-heavy');

// --- 10. Tetris mode: steer with a pinch, twist to flip, flick to drop, clear a line -----
await page.evaluate(() => { window.__naga.apply({ v: 1, type: 'clear' }); window.__naga.setMode('game'); });
await wait(600);
check('tetris mode active with a falling piece', await page.evaluate(() => window.__naga.mode() === 'game' && !!window.__naga.tetris.game.piece));
// freeze gravity for a deterministic test
await page.evaluate(() => { const g = window.__naga.tetris.game; g.board.clear(); g.setPiece('T', [4, 9, 1]); Object.defineProperty(g, 'fallInterval', { get: () => 1e9, configurable: true }); });
const pw = (x, y, z) => page.evaluate(([x, y, z]) => window.__naga.deskToWorld(x - 5, y, z - 2), [x, y, z]);
const pieceState = () => page.evaluate(() => { const p = window.__naga.tetris.game.piece; return p ? { pos: p.pos, cells: JSON.stringify(p.cells) } : null; });
const start = await pw(4, 9, 1);
await pinch(0); await aim(start); await pinch(1); await wait(300);
for (let i = 1; i <= 6; i++) await handTo([start[0] + 0.12 * i / 6, start[1], start[2]]);
let ps = await pieceState();
check('pinch-drag steers the piece right by ~3 cells', ps.pos[0] >= 6, JSON.stringify(ps.pos));
const cellsBefore = ps.cells;
// twist the wrist ~75° around the axis pointing at the user (roll)
await page.evaluate(() => { const h = window.__iwer.hands.right; const a = 1.3 / 2; h.quaternion.x = 0; h.quaternion.y = 0; h.quaternion.z = Math.sin(a); h.quaternion.w = Math.cos(a); });
await wait(600);
ps = await pieceState();
check('wrist twist flips the piece', ps.cells !== cellsBefore, ps.cells);
await page.evaluate(() => { const h = window.__iwer.hands.right; h.quaternion.x = 0; h.quaternion.y = 0; h.quaternion.z = 0; h.quaternion.w = 1; });
await pinch(0); await wait(400);
// fill row y=0,z=1 except where an I piece will land, then drop it
await page.evaluate(() => { const g = window.__naga.tetris.game; g.board.clear(); const cells = []; for (let x = 4; x < 10; x++) cells.push([[x, 0, 1], 'stone']); g.setCells(cells); g.setPiece('I', [1, 6, 1]); });
await page.evaluate(() => window.__naga.tetris.action('drop'));
await wait(300);
const t = await page.evaluate(() => ({ lines: window.__naga.tetris.game.lines, score: window.__naga.tetris.game.score, board: window.__naga.tetris.game.board.size }));
check('dropping the I completes a line that clears', t.lines === 1 && t.board === 0, JSON.stringify(t));
await shot('10-tetris-clear');
await wait(200);
await shot('11-tetris-sparkles');
await page.evaluate(() => window.__naga.say('back to building'));
await wait(800);
check('voice returns to build mode', (await page.evaluate(() => window.__naga.mode())) === 'build');

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);

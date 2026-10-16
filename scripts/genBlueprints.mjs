#!/usr/bin/env node
/**
 * Procedurally author the starter blueprints as JSON.
 * Cluster names: "group" or "group/part". A pinch grabs the whole group;
 * voice targets ("make the windows blue") match either the group or the part.
 * Coordinates: integer cells, origin at the min corner, +x right, +y up, +z toward the user (front).
 * Run: npm run blueprints
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'blueprints');
mkdirSync(OUT, { recursive: true });

function make(id, label, defaultColor, build) {
  const vox = new Map();
  const clusters = new Map();
  const put = (x, y, z, c, cl) => {
    vox.set(`${x},${y},${z}`, { x, y, z, c, cl });
  };
  const del = (x, y, z) => vox.delete(`${x},${y},${z}`);
  build({ put, del, box: (x0, y0, z0, x1, y1, z1, c, cl) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) put(x, y, z, c, cl);
  } });
  // normalise so the min corner is the origin (builders may use small negative offsets)
  const all = [...vox.values()];
  const mx = Math.min(...all.map((v) => v.x)), my = Math.min(...all.map((v) => v.y)), mz = Math.min(...all.map((v) => v.z));
  for (const v of all) { v.x -= mx; v.y -= my; v.z -= mz; }
  const voxels = all.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  let fx = 0, fy = 0, fz = 0;
  for (const v of voxels) {
    fx = Math.max(fx, v.x + 1); fy = Math.max(fy, v.y + 1); fz = Math.max(fz, v.z + 1);
    if (v.cl) {
      const a = clusters.get(v.cl) ?? { x0: 1e9, y0: 1e9, z0: 1e9, x1: -1e9, y1: -1e9, z1: -1e9 };
      a.x0 = Math.min(a.x0, v.x); a.y0 = Math.min(a.y0, v.y); a.z0 = Math.min(a.z0, v.z);
      a.x1 = Math.max(a.x1, v.x); a.y1 = Math.max(a.y1, v.y); a.z1 = Math.max(a.z1, v.z);
      clusters.set(v.cl, a);
    }
  }
  const bp = {
    id,
    label,
    defaultColor,
    footprint: { x: fx, y: fy, z: fz },
    voxels: voxels.map(({ x, y, z, c, cl }) => (cl ? { x, y, z, c, cl } : { x, y, z, c })),
    clusters: [...clusters].map(([name, a]) => ({
      name,
      aabb: { x: a.x0, y: a.y0, z: a.z0, sx: a.x1 - a.x0 + 1, sy: a.y1 - a.y0 + 1, sz: a.z1 - a.z0 + 1 },
    })),
    sounds: { spawn: 'cast' },
  };
  if (voxels.length < 20 || voxels.length > 400) throw new Error(`${id}: ${voxels.length} voxels out of 20..400`);
  writeFileSync(join(OUT, `${id}.json`), JSON.stringify(bp) + '\n');
  console.log(`${id.padEnd(12)} ${String(voxels.length).padStart(4)} voxels  ${fx}x${fy}x${fz}  clusters: ${[...clusters.keys()].join(', ')}`);
  return bp;
}

// 1. Small cottage: oak walls, glass windows, gabled red roof, stone chimney.
make('house_small', 'Small cottage', 'oak', ({ put, box }) => {
  const W = 7, D = 7, H = 3;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      for (let z = 0; z < D; z++) {
        const edge = x === 0 || x === W - 1 || z === 0 || z === D - 1;
        if (!edge) continue;
        if (z === D - 1 && x === 3 && y < 2) continue; // door opening
        const window = y === 1 && ((z === D - 1 || z === 0) && (x === 1 || x === 5) || (x === 0 || x === W - 1) && z === 3);
        put(x, y, z, window ? 'glass' : 'oak', window ? 'walls/windows' : 'walls');
      }
  put(3, 0, D - 1, 'ink', 'walls/door'); // door step / threshold
  // gable roof sloping along x, ridge along z
  for (let l = 0; l < 4; l++) box(l, H + l, 0, W - 1 - l, H + l, D - 1, 'roof_red', 'roof');
  box(5, H + 1, 1, 5, H + 3, 1, 'stone', 'roof/chimney');
});

// 2. Stairs: 5 wide, 6 steps rising away from the user.
make('stairs', 'Stairs', 'stone', ({ put }) => {
  const steps = 6, W = 4;
  for (let s = 0; s < steps; s++)
    for (let x = 0; x < W; x++)
      for (let y = 0; y <= s; y++) {
        const z = steps - 1 - s;
        put(x, y, z, y === s ? 'white' : 'stone', y === s ? 'stairs/steps' : 'stairs');
      }
});

// 3. Wall with crenellations.
make('wall', 'Wall', 'stone', ({ put }) => {
  const L = 12, H = 4;
  for (let x = 0; x < L; x++) for (let y = 0; y < H; y++) put(x, y, 0, (x + y) % 5 === 0 ? 'white' : 'stone', 'walls');
  for (let x = 0; x < L; x += 2) put(x, H, 0, 'stone', 'top');
});

// 4. Tower: round-ish 5x5 hollow, 9 tall, battlements and a gold flag.
make('tower', 'Tower', 'stone', ({ put }) => {
  const R = 5, H = 9;
  const ring = [];
  for (let x = 0; x < R; x++) for (let z = 0; z < R; z++) {
    const edge = x === 0 || x === R - 1 || z === 0 || z === R - 1;
    const corner = (x === 0 || x === R - 1) && (z === 0 || z === R - 1);
    if (edge && !corner) ring.push([x, z]);
  }
  ring.push([1, 1], [3, 1], [1, 3], [3, 3]);
  for (let y = 0; y < H; y++)
    for (const [x, z] of ring) {
      const slit = y % 3 === 1 && ((x === 2 && (z === 0 || z === R - 1)) || (z === 2 && (x === 0 || x === R - 1)));
      if (y === 0 && x === 2 && z === R - 1) { put(x, y, z, 'ink', 'tower/door'); continue; }
      put(x, y, z, slit ? 'glass' : 'stone', slit ? 'tower/windows' : 'tower');
    }
  for (const [x, z] of ring) if ((x + z) % 2 === 0) put(x, H, z, 'stone', 'top');
  for (let y = H; y < H + 3; y++) put(2, y, 2, 'ink', 'flag');
  put(3, H + 2, 2, 'gold', 'flag');
  put(3, H + 1, 2, 'gold', 'flag');
});

// 5. Garden: lawn, pond, a tree and flowers.
make('garden', 'Garden', 'grass', ({ put, box, del }) => {
  const S = 9;
  box(0, 0, 0, S - 1, 0, S - 1, 'grass', 'lawn');
  for (const [x, z] of [[5, 5], [6, 5], [5, 6], [6, 6], [7, 6], [6, 7]]) { del(x, 0, z); put(x, 0, z, 'water', 'pond'); }
  for (let y = 1; y <= 3; y++) put(2, y, 2, 'oak', 'tree');
  for (let x = 1; x <= 3; x++) for (let z = 1; z <= 3; z++) for (let y = 4; y <= 5; y++) {
    if (y === 5 && (x !== 2 && z !== 2)) continue;
    put(x, y, z, 'grass', 'tree');
  }
  put(2, 6, 2, 'grass', 'tree');
  const flowers = [[6, 1, 'roof_red'], [7, 2, 'gold'], [5, 2, 'white'], [1, 6, 'gold'], [2, 7, 'roof_red'], [3, 6, 'sky'], [7, 3, 'sky'], [4, 8, 'white']];
  for (const [x, z, c] of flowers) put(x, 1, z, c, 'flowers');
});

// 6. Desk shelf: oak frame with colourful books.
make('desk_shelf', 'Desk shelf', 'oak', ({ put, box }) => {
  const W = 10, H = 7, D = 3;
  box(0, 0, 0, 0, H - 1, D - 1, 'oak', 'shelf');
  box(W - 1, 0, 0, W - 1, H - 1, D - 1, 'oak', 'shelf');
  for (const y of [0, 3, 6]) box(1, y, 0, W - 2, y, D - 1, 'oak', 'shelf');
  box(1, 1, 0, W - 2, 2, 0, 'oak', 'shelf'); // back panel lower
  const books = ['roof_red', 'sky', 'gold', 'grass', 'white', 'ink', 'water', 'roof_red'];
  for (let x = 1; x < W - 1; x++) {
    const h = 1 + ((x * 7) % 3 === 0 ? 1 : 0);
    for (let y = 1; y < 1 + h; y++) put(x, y, 1, books[x % books.length], 'shelf/books');
    if (x % 3 !== 0) put(x, 4, 1, books[(x + 3) % books.length], 'shelf/books');
  }
});

// 7. Arch: two pillars with a rounded top and gold keystone.
make('arch', 'Arch', 'stone', ({ put, box }) => {
  const W = 9, depth = 2;
  box(0, 0, 0, 1, 5, depth - 1, 'stone', 'pillars');
  box(W - 2, 0, 0, W - 1, 5, depth - 1, 'stone', 'pillars');
  const curve = [[1, 6], [2, 6], [2, 7], [3, 7], [3, 8], [4, 8], [5, 8], [5, 7], [6, 7], [6, 6], [7, 6], [0, 6], [8, 6], [1, 7], [7, 7], [2, 8], [6, 8]];
  for (const [x, y] of curve) for (let z = 0; z < depth; z++) put(x, y, z, x === 4 ? 'gold' : 'white', x === 4 ? 'arch/keystone' : 'arch');
});

// 8. Bench.
make('bench', 'Bench', 'oak', ({ put, box }) => {
  const L = 8;
  box(0, 2, 0, L - 1, 2, 1, 'oak', 'seat');
  for (const x of [0, L - 1]) { box(x, 0, 0, x, 1, 0, 'ink', 'legs'); box(x, 0, 1, x, 1, 1, 'ink', 'legs'); }
  box(0, 3, 0, L - 1, 4, 0, 'oak', 'backrest');
  for (let x = 1; x < L - 1; x += 2) put(x, 4, 0, 'gold', 'backrest');
});

// 9. Fireplace with chimney and flames.
make('fireplace', 'Fireplace', 'stone', ({ put, box, del }) => {
  const W = 7, H = 5, D = 3;
  box(0, 0, 0, W - 1, H - 1, D - 1, 'stone', 'hearth');
  for (let x = 2; x <= 4; x++) for (let y = 0; y <= 2; y++) for (let z = 1; z < D; z++) del(x, y, z);
  // hollow the inside of the body to keep the count down
  for (let x = 1; x < W - 1; x++) for (let y = 3; y < H - 1; y++) del(x, y, 1);
  box(0, H, 0, W - 1, H, D - 1, 'white', 'hearth/mantel');
  box(2, H + 1, 0, 4, H + 4, 1, 'stone', 'chimney');
  put(3, 0, 2, 'roof_red', 'hearth/fire'); put(2, 0, 2, 'gold', 'hearth/fire'); put(4, 0, 2, 'gold', 'hearth/fire');
  put(3, 1, 2, 'gold', 'hearth/fire'); put(3, 0, 1, 'oak', 'hearth/fire');
});

// 10. Tiny hedge maze 9x9, 2 high, with a gold goal.
make('maze_tiny', 'Tiny maze', 'grass', ({ put }) => {
  const rows = [
    '#########',
    '#   #   #',
    '# # # # #',
    '# #   # #',
    '# ##### #',
    '#   G   #',
    '### # ###',
    '#   #   #',
    '#### ####',
  ];
  rows.forEach((row, z) => [...row].forEach((ch, x) => {
    if (ch === '#') { put(x, 0, z, 'grass', 'hedges'); if ((x + z) % 2 === 0) put(x, 1, z, 'grass', 'hedges'); }
    if (ch === 'G') put(x, 0, z, 'gold', 'hedges/goal');
  }));
});

// ---------------------------------------------------------------------------
// More things to build (v2): vehicles, landmarks, furniture, nature, characters.
// Kept within 14 x 15 x 9 cells so every one fits the smallest (draft) grid.
// ---------------------------------------------------------------------------
const ball = (put, cx, cy, cz, r, c, cl, keep = () => true) => {
  const R = Math.ceil(r);
  for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) for (let z = -R; z <= R; z++) {
    if (x * x + y * y + z * z <= r * r + 0.01 && keep(x, y, z)) put(cx + x, cy + y, cz + z, c, cl);
  }
};

// 11. Bridge: stone piers, an arched oak deck with railings, over a little river.
make('bridge', 'Bridge', 'oak', ({ put, box }) => {
  const L = 12, W = 4;
  box(2, 0, 0, L - 3, 0, W - 1, 'water', 'river');
  box(0, 0, 0, 1, 2, W - 1, 'stone', 'bridge/piers');
  box(L - 2, 0, 0, L - 1, 2, W - 1, 'stone', 'bridge/piers');
  for (let x = 0; x < L; x++) {
    const rise = x >= 3 && x <= L - 4 ? 1 : 0; // gentle hump in the middle
    box(x, 3 + rise, 0, x, 3 + rise, W - 1, 'oak', 'bridge/deck');
    if (rise) { put(x, 3, 0, 'stone', 'bridge/arch'); put(x, 3, W - 1, 'stone', 'bridge/arch'); }
    if (x % 2 === 0 || x === L - 1) { put(x, 4 + rise, 0, 'white', 'bridge/railings'); put(x, 4 + rise, W - 1, 'white', 'bridge/railings'); }
  }
  for (let x = 0; x < L; x++) { const r = x >= 3 && x <= L - 4 ? 1 : 0; put(x, 5 + r, 0, 'oak', 'bridge/railings'); put(x, 5 + r, W - 1, 'oak', 'bridge/railings'); }
});

// 12. Car: red body, glass cabin, black wheels, gold headlights (front = +x).
make('car', 'Car', 'roof_red', ({ put, box }) => {
  const L = 9, W = 5;
  for (const x of [1, 2, L - 3, L - 2]) { put(x, 0, 0, 'ink', 'car/wheels'); put(x, 0, W - 1, 'ink', 'car/wheels'); }
  box(0, 1, 0, L - 1, 2, W - 1, 'roof_red', 'car');
  box(2, 3, 0, 6, 3, W - 1, 'glass', 'car/windows');
  box(3, 3, 1, 5, 3, W - 2, 'roof_red', 'car'); // pillars between windows
  box(2, 4, 0, 6, 4, W - 1, 'roof_red', 'car/roof');
  put(L - 1, 2, 1, 'gold', 'car/lights'); put(L - 1, 2, W - 2, 'gold', 'car/lights');
  put(0, 2, 1, 'roof_red', 'car/lights'); put(0, 2, W - 2, 'roof_red', 'car/lights');
  box(L - 1, 1, 1, L - 1, 1, W - 2, 'stone', 'car/bumper');
});

// 13. Sailboat: oak hull, white sail, a gold pennant.
make('boat', 'Sailboat', 'oak', ({ put, box }) => {
  const L = 11, W = 5;
  box(2, 0, 1, L - 3, 0, W - 2, 'oak', 'boat/hull');
  for (let x = 0; x < L; x++) for (let z = 0; z < W; z++) {
    const edge = z === 0 || z === W - 1 || x === 1 || x === L - 2;
    if (x === 0 || x === L - 1) { if (z === 2) { put(x, 1, z, 'oak', 'boat/hull'); put(x, 2, z, 'oak', 'boat/hull'); } continue; }
    if (edge) { put(x, 1, z, 'oak', 'boat/hull'); put(x, 2, z, 'white', 'boat/hull'); }
    else put(x, 1, z, 'white', 'boat/deck');
  }
  for (let y = 2; y <= 10; y++) put(5, y, 2, 'ink', 'boat/mast');
  for (let y = 3; y <= 9; y++) for (let x = 6; x <= 6 + Math.floor((9 - y) * 0.6); x++) put(x, y, 2, 'white', 'boat/sail');
  for (let y = 4; y <= 8; y++) for (let x = 4 - Math.floor((8 - y) * 0.5); x <= 4; x++) put(x, y, 2, 'sky', 'boat/sail');
  put(5, 11, 2, 'gold', 'boat/flag'); put(6, 11, 2, 'gold', 'boat/flag');
});

// 14. Rocket on a launch pad.
make('rocket', 'Rocket', 'white', ({ put, box }) => {
  box(0, 0, 0, 4, 0, 4, 'stone', 'pad');
  for (let y = 1; y <= 9; y++) for (let x = 1; x <= 3; x++) for (let z = 1; z <= 3; z++) {
    if (x === 2 && z === 2 && y > 1 && y < 9) continue; // hollow
    const stripe = y === 4;
    put(x, y, z, stripe ? 'roof_red' : 'white', 'rocket');
  }
  put(2, 7, 4, 'glass', 'rocket/window'); put(2, 6, 4, 'glass', 'rocket/window');
  put(2, 10, 2, 'roof_red', 'rocket/nose'); put(2, 11, 2, 'roof_red', 'rocket/nose');
  for (const [x, z] of [[1, 2], [3, 2], [2, 1], [2, 3]]) put(x, 10, z, 'roof_red', 'rocket/nose');
  for (const [x, z] of [[0, 2], [4, 2], [2, 0], [2, 4]]) for (let y = 1; y <= 3; y++) put(x, y, z, 'roof_red', 'rocket/fins');
  put(2, 1, 2, 'gold', 'rocket/flame');
});

// 15. Castle: curtain walls, four corner turrets, a gate and a central keep with a flag.
make('castle', 'Castle', 'stone', ({ put, box }) => {
  const W = 12, D = 9;
  for (let y = 0; y < 3; y++) for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    const edge = x === 0 || x === W - 1 || z === 0 || z === D - 1;
    if (!edge) continue;
    if (z === D - 1 && (x === 5 || x === 6) && y < 2) continue; // gate
    put(x, y, z, 'stone', 'castle/walls');
  }
  for (let x = 0; x < W; x += 2) { put(x, 3, 0, 'stone', 'castle/walls'); put(x, 3, D - 1, 'stone', 'castle/walls'); }
  for (let z = 2; z < D - 1; z += 2) { put(0, 3, z, 'stone', 'castle/walls'); put(W - 1, 3, z, 'stone', 'castle/walls'); }
  put(5, 0, D - 1, 'oak', 'castle/gate'); put(6, 0, D - 1, 'oak', 'castle/gate');
  for (const [cx, cz] of [[0, 0], [W - 2, 0], [0, D - 2], [W - 2, D - 2]]) {
    box(cx, 0, cz, cx + 1, 4, cz + 1, 'white', 'castle/turrets');
    box(cx, 5, cz, cx + 1, 5, cz + 1, 'roof_red', 'castle/turrets/roofs');
  }
  for (let y = 0; y < 6; y++) for (let x = 4; x <= 7; x++) for (let z = 3; z <= 5; z++) {
    const edge = x === 4 || x === 7 || z === 3 || z === 5;
    if (edge) put(x, y, z, y === 3 && (x === 5 || x === 6) && z === 5 ? 'glass' : 'stone', y === 3 && z === 5 && (x === 5 || x === 6) ? 'castle/keep/windows' : 'castle/keep');
  }
  box(4, 6, 3, 7, 6, 5, 'roof_red', 'castle/keep/roof');
  for (let y = 7; y <= 9; y++) put(5, y, 4, 'ink', 'castle/flag');
  put(6, 9, 4, 'gold', 'castle/flag'); put(6, 8, 4, 'gold', 'castle/flag');
});

// 16. Step pyramid with a white cap.
make('pyramid', 'Pyramid', 'gold', ({ box }) => {
  for (let l = 0; l < 5; l++) {
    box(l, l, l, 8 - l, l, 8 - l, l === 4 ? 'white' : 'gold', l === 4 ? 'pyramid/cap' : 'pyramid');
  }
});

// 17. Tree: oak trunk, round green canopy, a few red apples.
make('tree', 'Tree', 'grass', ({ put, box }) => {
  box(3, 0, 3, 3, 4, 3, 'oak', 'tree/trunk');
  put(2, 0, 3, 'oak', 'tree/roots'); put(4, 0, 3, 'oak', 'tree/roots'); put(3, 0, 2, 'oak', 'tree/roots'); put(3, 0, 4, 'oak', 'tree/roots');
  ball(put, 3, 7, 3, 3.1, 'grass', 'tree/leaves', (x, y, z) => !(Math.abs(x) <= 1 && Math.abs(z) <= 1 && y < 0 && Math.abs(y) < 3) || (x === 0 && z === 0));
  for (const [x, y, z] of [[6, 7, 3], [3, 7, 6], [1, 6, 5], [5, 8, 1], [0, 7, 2]]) put(x, y, z, 'roof_red', 'tree/apples');
});

// 18. Train: engine with chimney and two wagons (front = +x).
make('train', 'Train', 'ink', ({ put, box }) => {
  const W = 3;
  // wagons
  for (const [x0, col] of [[0, 'roof_red'], [5, 'sky']]) {
    for (const x of [x0, x0 + 3]) for (const z of [0, W - 1]) put(x, 0, z, 'ink', 'train/wheels');
    box(x0, 1, 0, x0 + 3, 2, W - 1, col, `train/wagons`);
    box(x0 + 1, 3, 1, x0 + 2, 3, 1, 'gold', 'train/cargo');
  }
  // engine
  const e = 10;
  for (const x of [e, e + 3]) for (const z of [0, W - 1]) put(x, 0, z, 'ink', 'train/wheels');
  box(e, 1, 0, e + 3, 2, W - 1, 'ink', 'train/engine');
  box(e, 3, 0, e + 1, 4, W - 1, 'ink', 'train/engine/cab');
  put(e, 3, 0, 'glass', 'train/engine/cab'); put(e, 3, W - 1, 'glass', 'train/engine/cab');
  box(e, 5, 0, e + 1, 5, W - 1, 'roof_red', 'train/engine/cab');
  put(e + 3, 3, 1, 'stone', 'train/engine/chimney'); put(e + 3, 4, 1, 'stone', 'train/engine/chimney');
  put(e + 3, 2, 0, 'gold', 'train/engine/lights'); put(e + 3, 2, W - 1, 'gold', 'train/engine/lights');
  put(4, 1, 1, 'stone', 'train/links'); put(9, 1, 1, 'stone', 'train/links');
});

// 19. Aeroplane: white fuselage, blue wings, red tail (nose = +x).
make('plane', 'Aeroplane', 'white', ({ put, box }) => {
  const L = 12, D = 9, c = 4;
  for (const x of [3, 8]) { put(x, 0, c - 1, 'ink', 'plane/wheels'); put(x, 0, c + 1, 'ink', 'plane/wheels'); }
  put(10, 0, c, 'ink', 'plane/wheels');
  box(0, 1, c - 1, L - 2, 2, c + 1, 'white', 'plane');
  box(L - 1, 1, c, L - 1, 2, c, 'white', 'plane/nose');
  box(8, 3, c - 1, 9, 3, c + 1, 'glass', 'plane/cockpit');
  box(4, 2, 0, 6, 2, D - 1, 'sky', 'plane/wings');
  box(0, 3, c, 1, 5, c, 'roof_red', 'plane/tail');
  box(0, 2, c - 3, 1, 2, c + 3, 'roof_red', 'plane/tail');
  put(L - 1, 2, c, 'gold', 'plane/nose');
});

// 20. Table.
make('table', 'Table', 'oak', ({ put, box }) => {
  box(0, 3, 0, 7, 3, 4, 'oak', 'table/top');
  for (const [x, z] of [[0, 0], [7, 0], [0, 4], [7, 4]]) box(x, 0, z, x, 2, z, 'oak', 'table/legs');
  put(3, 4, 2, 'gold', 'table/vase'); put(3, 5, 2, 'grass', 'table/vase'); put(4, 4, 2, 'white', 'table/plate');
});

// 21. Chair.
make('chair', 'Chair', 'oak', ({ box }) => {
  box(0, 2, 0, 3, 2, 3, 'oak', 'chair/seat');
  for (const [x, z] of [[0, 0], [3, 0], [0, 3], [3, 3]]) box(x, 0, z, x, 1, z, 'oak', 'chair/legs');
  box(0, 3, 0, 0, 6, 0, 'oak', 'chair/backrest'); box(3, 3, 0, 3, 6, 0, 'oak', 'chair/backrest');
  box(1, 4, 0, 2, 6, 0, 'roof_red', 'chair/backrest');
  box(0, 7, 0, 3, 7, 0, 'oak', 'chair/backrest');
});

// 22. Robot: boxy friend with glass eyes and a gold antenna.
make('robot', 'Robot', 'stone', ({ put, box }) => {
  box(1, 0, 1, 2, 3, 2, 'stone', 'robot/legs'); box(4, 0, 1, 5, 3, 2, 'stone', 'robot/legs');
  put(1, 0, 3, 'ink', 'robot/legs'); put(2, 0, 3, 'ink', 'robot/legs'); put(4, 0, 3, 'ink', 'robot/legs'); put(5, 0, 3, 'ink', 'robot/legs');
  box(0, 4, 0, 6, 8, 3, 'stone', 'robot/body');
  put(3, 7, 3, 'roof_red', 'robot/body/heart'); put(2, 6, 3, 'gold', 'robot/body/buttons'); put(4, 6, 3, 'gold', 'robot/body/buttons');
  box(-1, 5, 1, -1, 8, 2, 'white', 'robot/arms'); box(7, 5, 1, 7, 8, 2, 'white', 'robot/arms');
  box(1, 9, 0, 5, 11, 3, 'white', 'robot/head');
  put(2, 10, 3, 'glass', 'robot/head/eyes'); put(4, 10, 3, 'glass', 'robot/head/eyes');
  put(3, 12, 1, 'ink', 'robot/head/antenna'); put(3, 13, 1, 'gold', 'robot/head/antenna');
});

// 23. Dog: oak body, ink nose and ears, wagging tail (head = +x).
make('dog', 'Dog', 'oak', ({ put, box }) => {
  for (const x of [0, 4]) for (const z of [0, 2]) box(x, 0, z, x, 1, z, 'oak', 'dog/legs');
  box(0, 2, 0, 5, 3, 2, 'oak', 'dog');
  box(5, 3, 0, 7, 5, 2, 'oak', 'dog/head');
  put(8, 4, 1, 'ink', 'dog/head/nose');
  put(7, 5, 0, 'glass', 'dog/head/eyes'); put(7, 5, 2, 'glass', 'dog/head/eyes');
  put(6, 6, 0, 'ink', 'dog/head/ears'); put(6, 6, 2, 'ink', 'dog/head/ears');
  put(-1, 4, 1, 'oak', 'dog/tail'); put(-2, 5, 1, 'oak', 'dog/tail');
  put(5, 2, 1, 'roof_red', 'dog/collar');
});

// 24. Snowman.
make('snowman', 'Snowman', 'white', ({ put, box }) => {
  const hollow = (r) => (x, y, z) => x * x + y * y + z * z >= (r - 1.2) ** 2; // shell only, keeps the count down
  ball(put, 4, 3, 4, 3.3, 'white', 'snowman', (x, y, z) => y > -3 && hollow(3.3)(x, y, z));
  ball(put, 4, 7, 4, 2.4, 'white', 'snowman', hollow(2.4));
  ball(put, 4, 10, 4, 1.7, 'white', 'snowman/head');
  put(4, 10, 6, 'gold', 'snowman/head/nose'); put(4, 10, 7, 'gold', 'snowman/head/nose');
  put(3, 11, 5, 'ink', 'snowman/head/eyes'); put(5, 11, 5, 'ink', 'snowman/head/eyes');
  box(2, 12, 2, 6, 12, 6, 'ink', 'snowman/hat'); box(3, 13, 3, 5, 14, 5, 'ink', 'snowman/hat');
  put(4, 8, 7, 'ink', 'snowman/buttons'); put(4, 6, 7, 'ink', 'snowman/buttons'); put(4, 4, 8, 'ink', 'snowman/buttons');
  put(1, 8, 4, 'oak', 'snowman/arms'); put(0, 9, 4, 'oak', 'snowman/arms'); put(7, 8, 4, 'oak', 'snowman/arms'); put(8, 9, 4, 'oak', 'snowman/arms');
  box(2, 9, 6, 6, 9, 6, 'roof_red', 'snowman/scarf');
});

// 25. Windmill: white tower, red cap, oak sails facing the user.
make('windmill', 'Windmill', 'white', ({ put, box }) => {
  for (let y = 0; y < 8; y++) {
    const i = y < 4 ? 0 : 1;
    for (let x = 3 + i; x <= 7 - i; x++) for (let z = 1 + i; z <= 5 - i; z++) {
      const edge = x === 3 + i || x === 7 - i || z === 1 + i || z === 5 - i;
      if (!edge) continue;
      if (y < 2 && x === 5 && z === 5 - i) { if (y === 0) put(x, y, z, 'oak', 'windmill/door'); continue; }
      put(x, y, z, y === 5 && x === 5 ? 'glass' : 'white', y === 5 && x === 5 ? 'windmill/windows' : 'windmill');
    }
  }
  box(4, 8, 2, 6, 8, 4, 'roof_red', 'windmill/roof'); put(5, 9, 3, 'roof_red', 'windmill/roof');
  put(5, 7, 5, 'ink', 'windmill/sails'); put(5, 7, 6, 'ink', 'windmill/sails');
  // four sails in a plus: each a lattice arm with a 2-wide cloth blade on one side (reads as turning)
  for (let d = 1; d <= 4; d++) {
    put(5 + d, 7, 6, 'oak', 'windmill/sails'); put(5 + d, 8, 6, 'white', 'windmill/sails');
    put(5 - d, 7, 6, 'oak', 'windmill/sails'); put(5 - d, 6, 6, 'white', 'windmill/sails');
    if (7 + d < 12) { put(5, 7 + d, 6, 'oak', 'windmill/sails'); put(4, 7 + d, 6, 'white', 'windmill/sails'); }
    put(5, 7 - d, 6, 'oak', 'windmill/sails'); put(6, 7 - d, 6, 'white', 'windmill/sails');
  }
});

// 26. Lighthouse: striped tower, glass lamp room, gold light.
make('lighthouse', 'Lighthouse', 'white', ({ put, box }) => {
  box(0, 0, 0, 4, 0, 4, 'stone', 'rocks');
  for (let y = 1; y <= 9; y++) for (let x = 1; x <= 3; x++) for (let z = 1; z <= 3; z++) {
    if (x === 2 && z === 2) continue;
    put(x, y, z, Math.floor((y - 1) / 2) % 2 === 0 ? 'roof_red' : 'white', 'lighthouse');
  }
  box(0, 10, 0, 4, 10, 4, 'ink', 'lighthouse/balcony');
  for (let x = 1; x <= 3; x++) for (let z = 1; z <= 3; z++) put(x, 11, z, x === 2 && z === 2 ? 'gold' : 'glass', x === 2 && z === 2 ? 'lighthouse/light' : 'lighthouse/lamp');
  box(1, 12, 1, 3, 12, 3, 'roof_red', 'lighthouse/roof'); put(2, 13, 2, 'ink', 'lighthouse/roof');
  put(2, 1, 4, 'oak', 'lighthouse/door');
});

// 27. Tent with a little campfire.
make('tent', 'Tent', 'sky', ({ put }) => {
  const L = 7;
  for (let x = 0; x < L; x++) for (let y = 0; y < 4; y++) {
    for (const z of [y, 6 - y]) {
      if (x === L - 1 && y < 2 && z !== y && z !== 6 - y) continue;
      put(x, y, z, x === L - 1 || x === 0 ? 'white' : 'sky', 'tent');
    }
  }
  put(0, 0, 3, 'white', 'tent'); put(0, 1, 3, 'white', 'tent'); put(0, 2, 3, 'white', 'tent');
  put(9, 0, 3, 'stone', 'campfire'); put(9, 0, 2, 'oak', 'campfire'); put(9, 0, 4, 'oak', 'campfire'); put(9, 1, 3, 'gold', 'campfire/fire'); put(9, 2, 3, 'roof_red', 'campfire/fire');
});

// 28. Heart.
make('heart', 'Heart', 'roof_red', ({ put }) => {
  const rows = [
    ' ##   ## ',
    '#### ####',
    '#########',
    '#########',
    ' ####### ',
    '  #####  ',
    '   ###   ',
    '    #    ',
  ];
  rows.forEach((row, i) => [...row].forEach((ch, x) => {
    if (ch !== '#') return;
    const y = rows.length - i;
    put(x, y, 0, 'roof_red', 'heart'); put(x, y, 1, 'roof_red', 'heart');
  }));
  put(2, 7, 2, 'white', 'heart/shine'); put(1, 6, 2, 'white', 'heart/shine');
  for (let x = 2; x <= 6; x++) put(x, 0, 0, 'gold', 'stand'), put(x, 0, 1, 'gold', 'stand');
});

// 29. Bed.
make('bed', 'Bed', 'oak', ({ put, box }) => {
  box(0, 0, 0, 5, 1, 9, 'oak', 'bed/frame');
  box(0, 2, 0, 5, 2, 9, 'white', 'bed/mattress');
  box(0, 3, 3, 5, 3, 9, 'roof_red', 'bed/blanket');
  box(1, 3, 0, 4, 3, 1, 'sky', 'bed/pillow');
  box(0, 2, -1, 5, 4, -1, 'oak', 'bed/headboard'); put(2, 5, -1, 'oak', 'bed/headboard'); put(3, 5, -1, 'oak', 'bed/headboard');
});

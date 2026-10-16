#!/usr/bin/env node
/**
 * Procedurally author the 10 starter blueprints as JSON.
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
  const voxels = [...vox.values()].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
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

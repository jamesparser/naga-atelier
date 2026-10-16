/**
 * Sling mode levels. Units are physics metres in "arena space" (rendered at 1:10 on the desk,
 * so a 1 m block is a 10 cm block on your table). +x right, +y up, +z toward the player.
 * The launcher sits at z = +1.6; structures stand between z = -0.6 and z = -2.6.
 */

export type BlockMat = 'glass' | 'wood' | 'stone';
export type BirdKind = 'pebble' | 'boulder';

export interface BlockDef {
  mat: BlockMat;
  /** centre x/z and BOTTOM y */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}
export interface TargetDef {
  x: number;
  y: number; // bottom
  z: number;
  r: number;
}
export interface LevelDef {
  id: number;
  name: string;
  birds: BirdKind[];
  blocks: BlockDef[];
  targets: TargetDef[];
  /** score needed for 2 and 3 stars */
  stars: [number, number];
}

// --- tiny authoring helpers --------------------------------------------------
const B = (mat: BlockMat, x: number, y: number, z: number, w: number, h: number, d: number): BlockDef => ({ mat, x, y, z, w, h, d });
const T = (x: number, y: number, z: number, r = 0.2): TargetDef => ({ x, y, z, r });

/** Two pillars with a plank on top: returns blocks and the top height. */
function arch(mat: BlockMat, x: number, y: number, z: number, span: number, h: number, t = 0.25): { blocks: BlockDef[]; top: number } {
  return {
    blocks: [
      B(mat, x - span / 2, y, z, t, h, t),
      B(mat, x + span / 2, y, z, t, h, t),
      B(mat, x, y + h, z, span + t + 0.1, 0.18, t + 0.15),
    ],
    top: y + h + 0.18,
  };
}

/** Four pillars + a slab: a little room you can hide a target in. */
function room(mat: BlockMat, roof: BlockMat, x: number, y: number, z: number, s: number, h: number): { blocks: BlockDef[]; top: number } {
  const t = 0.26, o = s / 2 - t / 2;
  return {
    blocks: [
      B(mat, x - o, y, z - o, t, h, t), B(mat, x + o, y, z - o, t, h, t),
      B(mat, x - o, y, z + o, t, h, t), B(mat, x + o, y, z + o, t, h, t),
      B(roof, x, y + h, z, s + 0.1, 0.16, s + 0.1),
    ],
    top: y + h + 0.16,
  };
}

function level1(): LevelDef {
  const a = arch('wood', 0, 0, -1.6, 1.0, 1.0);
  return {
    id: 1, name: 'First flight', birds: ['pebble', 'pebble', 'pebble'],
    blocks: a.blocks,
    targets: [T(0, 0, -1.6), T(0, a.top, -1.6)],
    stars: [14000, 24000],
  };
}

function level2(): LevelDef {
  const r = room('glass', 'wood', 0, 0, -1.7, 1.1, 0.8);
  const r2 = room('glass', 'glass', 0, r.top, -1.7, 0.8, 0.6);
  return {
    id: 2, name: 'Glasshouse', birds: ['pebble', 'pebble', 'pebble'],
    blocks: [...r.blocks, ...r2.blocks],
    targets: [T(0, 0, -1.7, 0.22), T(0, r.top, -1.7, 0.18), T(0, r2.top, -1.7, 0.16)],
    stars: [20000, 32000],
  };
}

function level3(): LevelDef {
  const blocks: BlockDef[] = [];
  const targets: TargetDef[] = [];
  for (const [x, mat] of [[-1.1, 'wood'], [1.1, 'stone']] as Array<[number, BlockMat]>) {
    let y = 0;
    for (let i = 0; i < 3; i++) {
      const a = arch(mat, x, y, -1.8, 0.62, 0.55, 0.32);
      blocks.push(...a.blocks);
      y = a.top;
    }
    targets.push(T(x, y, -1.8, 0.18), T(x, 0, -1.8, 0.16));
  }
  return { id: 3, name: 'Twin towers', birds: ['pebble', 'pebble', 'pebble', 'pebble'], blocks, targets, stars: [30000, 45000] };
}

function level4(): LevelDef {
  const blocks: BlockDef[] = [];
  const s = 0.42;
  for (let row = 0; row < 4; row++) {
    const n = 4 - row;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (s + 0.02);
      blocks.push(B(row % 2 ? 'glass' : 'wood', x, row * s, -1.9, s, s, s));
    }
  }
  return {
    id: 4, name: 'Pyramid', birds: ['pebble', 'pebble', 'boulder'],
    blocks,
    targets: [T(0, 4 * s, -1.9, 0.18), T(-1.3, 0, -1.9, 0.2), T(1.3, 0, -1.9, 0.2)],
    stars: [30000, 42000],
  };
}

function level5(): LevelDef {
  const blocks: BlockDef[] = [];
  // stone front wall with a gap, wood inner keep, glass roof
  for (const x of [-1.0, -0.55, 0.55, 1.0]) blocks.push(B('stone', x, 0, -1.2, 0.35, 0.9, 0.3));
  blocks.push(B('stone', 0, 0.9, -1.2, 2.5, 0.2, 0.32));
  const keep = room('wood', 'glass', 0, 0, -2.0, 1.2, 1.0);
  blocks.push(...keep.blocks);
  const tower = arch('wood', 0, keep.top, -2.0, 0.6, 0.5, 0.28);
  blocks.push(...tower.blocks);
  return {
    id: 5, name: 'Fortress', birds: ['pebble', 'boulder', 'pebble', 'boulder'],
    blocks,
    targets: [T(0, 0, -2.0, 0.22), T(0, keep.top, -2.0, 0.17), T(0, tower.top, -2.0, 0.16), T(-1.5, 0, -1.6, 0.18)],
    stars: [40000, 60000],
  };
}

function level6(): LevelDef {
  const blocks: BlockDef[] = [];
  const targets: TargetDef[] = [];
  // a tall stepped castle: three stacked rooms, flanked by glass spires
  let y = 0;
  const mats: Array<[BlockMat, BlockMat]> = [['stone', 'wood'], ['wood', 'wood'], ['glass', 'wood']];
  mats.forEach(([m, r], i) => {
    const room1 = room(m, r, 0, y, -2.0, 1.4 - i * 0.25, 0.62);
    blocks.push(...room1.blocks);
    targets.push(T(0, y, -2.0, 0.17 - i * 0.01));
    y = room1.top;
  });
  targets.push(T(0, y, -2.0, 0.15));
  for (const x of [-1.6, 1.6]) {
    let yy = 0;
    for (let i = 0; i < 3; i++) {
      blocks.push(B('glass', x, yy, -1.7, 0.4, 0.42, 0.4));
      yy += 0.42;
    }
    blocks.push(B('wood', x, yy, -1.7, 0.6, 0.12, 0.6));
    yy += 0.12;
    targets.push(T(x, yy, -1.7, 0.15));
  }
  return { id: 6, name: 'Sky castle', birds: ['pebble', 'pebble', 'boulder', 'pebble', 'boulder'], blocks, targets, stars: [60000, 85000] };
}

export const LEVELS: LevelDef[] = [level1(), level2(), level3(), level4(), level5(), level6()];

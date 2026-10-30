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

function level7(): LevelDef {
  // a long bridge on two stone piers; one gloomling on the deck, two sheltering underneath
  const blocks: BlockDef[] = [
    B('stone', -1.3, 0, -1.8, 0.4, 0.9, 0.5),
    B('stone', 1.3, 0, -1.8, 0.4, 0.9, 0.5),
    B('wood', 0, 0.9, -1.8, 3.0, 0.16, 0.55),
    B('glass', -0.5, 1.06, -1.8, 0.24, 0.5, 0.24),
    B('glass', 0.5, 1.06, -1.8, 0.24, 0.5, 0.24),
    B('glass', 0, 1.56, -1.8, 1.3, 0.12, 0.4),
  ];
  return {
    id: 7, name: 'Glass bridge', birds: ['pebble', 'pebble', 'pebble'],
    blocks,
    targets: [T(0, 1.06, -1.8, 0.18), T(-0.5, 0, -1.8, 0.2), T(0.5, 0, -1.8, 0.2), T(0, 1.68, -1.8, 0.15)],
    stars: [30000, 45000],
  };
}

function level8(): LevelDef {
  // a tall stone wall: lob over it to reach the gloomlings hiding behind
  const blocks: BlockDef[] = [];
  for (const x of [-1.2, -0.4, 0.4, 1.2]) blocks.push(B('stone', x, 0, -1.1, 0.75, 1.0, 0.3));
  const back = room('wood', 'glass', -0.7, 0, -2.2, 0.9, 0.6);
  const back2 = room('wood', 'glass', 0.7, 0, -2.2, 0.9, 0.6);
  blocks.push(...back.blocks, ...back2.blocks);
  return {
    id: 8, name: 'Over the wall', birds: ['pebble', 'pebble', 'boulder', 'pebble'],
    blocks,
    targets: [T(-0.7, 0, -2.2, 0.18), T(0.7, 0, -2.2, 0.18), T(-0.7, back.top, -2.2, 0.15), T(0.7, back2.top, -2.2, 0.15)],
    stars: [35000, 52000],
  };
}

function level9(): LevelDef {
  // three towers of different materials
  const blocks: BlockDef[] = [];
  const targets: TargetDef[] = [];
  const spec: Array<[number, BlockMat, number]> = [[-1.4, 'glass', 2], [0, 'wood', 3], [1.4, 'stone', 2]];
  for (const [x, mat, floors] of spec) {
    let y = 0;
    for (let i = 0; i < floors; i++) {
      const a = arch(mat, x, y, -1.9, 0.62, 0.55, 0.32);
      blocks.push(...a.blocks);
      y = a.top;
    }
    targets.push(T(x, y, -1.9, 0.16), T(x, 0, -1.9, 0.15));
  }
  return { id: 9, name: 'Tower trio', birds: ['pebble', 'pebble', 'boulder', 'pebble', 'boulder'], blocks, targets, stars: [45000, 65000] };
}

function level10(): LevelDef {
  // a row of wooden dominoes: knock the first one and watch them fall onto the gloomlings
  const blocks: BlockDef[] = [];
  for (let i = 0; i < 7; i++) blocks.push(B('wood', -1.5 + i * 0.42, 0, -1.4 - i * 0.12, 0.14, 1.0, 0.6));
  blocks.push(B('stone', 1.9, 0, -2.4, 0.5, 0.4, 0.6));
  return {
    id: 10, name: 'Dominoes', birds: ['pebble', 'pebble', 'pebble'],
    blocks,
    targets: [T(-1.29, 0, -1.6, 0.13), T(-0.45, 0, -1.85, 0.13), T(0.39, 0, -2.1, 0.13), T(1.9, 0.4, -2.4, 0.16)],
    stars: [30000, 42000],
  };
}

function level11(): LevelDef {
  // a stone bunker with glass windows; the boulders are your friends
  const blocks: BlockDef[] = [];
  const z = -2.0;
  blocks.push(B('stone', -0.9, 0, z, 0.3, 0.8, 1.4), B('stone', 0.9, 0, z, 0.3, 0.8, 1.4), B('stone', 0, 0, z - 0.6, 1.5, 0.8, 0.3));
  blocks.push(B('glass', -0.4, 0, z + 0.6, 0.6, 0.8, 0.2), B('glass', 0.4, 0, z + 0.6, 0.6, 0.8, 0.2));
  blocks.push(B('stone', 0, 0.8, z, 2.1, 0.22, 1.6));
  blocks.push(B('wood', -0.5, 1.02, z, 0.3, 0.5, 0.3), B('wood', 0.5, 1.02, z, 0.3, 0.5, 0.3), B('wood', 0, 1.52, z, 1.3, 0.14, 0.5));
  return {
    id: 11, name: 'Bunker', birds: ['boulder', 'pebble', 'boulder', 'pebble'],
    blocks,
    targets: [T(-0.35, 0, z, 0.2), T(0.35, 0, z, 0.2), T(0, 1.02, z, 0.16), T(0, 1.66, z, 0.15)],
    stars: [40000, 60000],
  };
}

function level12(): LevelDef {
  // the citadel: everything at once
  const blocks: BlockDef[] = [];
  const targets: TargetDef[] = [];
  for (const x of [-1.6, 1.6]) blocks.push(B('stone', x, 0, -1.3, 0.5, 0.6, 0.5));
  targets.push(T(-1.6, 0.6, -1.3, 0.15), T(1.6, 0.6, -1.3, 0.15));
  let y = 0;
  const floors: Array<[BlockMat, BlockMat, number]> = [['stone', 'wood', 1.6], ['wood', 'wood', 1.3], ['wood', 'glass', 1.0], ['glass', 'wood', 0.8]];
  for (const [m, r, size] of floors) {
    const rm = room(m, r, 0, y, -2.1, size, 0.55);
    blocks.push(...rm.blocks);
    targets.push(T(0, y, -2.1, 0.15));
    y = rm.top;
  }
  targets.push(T(0, y, -2.1, 0.14));
  return { id: 12, name: 'Citadel', birds: ['pebble', 'pebble', 'boulder', 'pebble', 'boulder', 'pebble'], blocks, targets, stars: [70000, 100000] };
}

function level13(): LevelDef {
  // twin glass towers with a wooden bridge
  const blocks: BlockDef[] = [];
  const targets: TargetDef[] = [];
  for (const x of [-1.1, 1.1]) {
    const t = room('glass', 'wood', x, 0, -1.9, 0.7, 1.2);
    blocks.push(...t.blocks);
    targets.push(T(x, 0, -1.9, 0.16), T(x, t.top, -1.9, 0.14));
  }
  blocks.push(B('wood', 0, 1.36, -1.9, 1.6, 0.14, 0.5));
  targets.push(T(0, 1.5, -1.9, 0.14));
  return { id: 13, name: 'Twin glass', birds: ['pebble', 'pebble', 'boulder'], blocks, targets, stars: [38000, 56000] };
}

function level14(): LevelDef {
  // zig-zag wall of wood, targets tucked in the pockets
  const blocks: BlockDef[] = [];
  const targets: TargetDef[] = [];
  for (let i = 0; i < 5; i++) {
    const x = -1.4 + i * 0.7;
    const z = -1.2 - i * 0.25;
    blocks.push(B('wood', x, 0, z, 0.28, 1.1, 0.7));
    if (i % 2 === 0) {
      blocks.push(B('glass', x, 1.1, z, 0.5, 0.12, 0.5));
      targets.push(T(x, 1.22, z, 0.14));
    } else targets.push(T(x, 0, z + 0.5, 0.14));
  }
  return { id: 14, name: 'Zigzag', birds: ['pebble', 'pebble', 'pebble', 'boulder'], blocks, targets, stars: [36000, 54000] };
}

function level15(): LevelDef {
  // stacked rooms, target on the roof of the stack
  const blocks: BlockDef[] = [];
  const r1 = room('stone', 'wood', 0, 0, -1.8, 1.1, 0.55);
  const r2 = room('wood', 'glass', 0, r1.top, -1.8, 0.9, 0.5);
  const r3 = room('glass', 'wood', 0, r2.top, -1.8, 0.7, 0.45);
  blocks.push(...r1.blocks, ...r2.blocks, ...r3.blocks);
  return {
    id: 15, name: 'Stack', birds: ['pebble', 'boulder', 'pebble', 'pebble'],
    blocks,
    targets: [T(0, 0, -1.8, 0.18), T(0, r1.top, -1.8, 0.15), T(0, r2.top, -1.8, 0.14), T(0, r3.top, -1.8, 0.13)],
    stars: [42000, 62000],
  };
}

function level16(): LevelDef {
  // three arches in a row (same stable pattern as level 3)
  const blocks: BlockDef[] = [];
  const targets: TargetDef[] = [];
  for (const x of [-1.3, 0, 1.3]) {
    const a = arch('stone', x, 0, -1.9, 0.85, 0.7, 0.3);
    blocks.push(...a.blocks);
    targets.push(T(x, 0, -1.9, 0.18), T(x, a.top, -1.9, 0.14));
  }
  return { id: 16, name: 'Colonnade', birds: ['pebble', 'boulder', 'pebble', 'boulder'], blocks, targets, stars: [40000, 60000] };
}

function level17(): LevelDef {
  // glass greenhouse with a wooden frame
  const blocks: BlockDef[] = [];
  for (const [x, z] of [[-0.9, -1.4], [0.9, -1.4], [-0.9, -2.3], [0.9, -2.3]]) {
    blocks.push(B('wood', x, 0, z, 0.22, 1.0, 0.22));
  }
  blocks.push(B('glass', 0, 1.0, -1.85, 2.0, 0.12, 1.1));
  blocks.push(B('glass', -0.9, 0, -1.85, 0.12, 1.0, 1.1), B('glass', 0.9, 0, -1.85, 0.12, 1.0, 1.1));
  return {
    id: 17, name: 'Greenhouse',
    birds: ['pebble', 'pebble', 'pebble', 'pebble'],
    blocks,
    targets: [T(0, 0, -1.85, 0.18), T(-0.55, 0, -1.85, 0.15), T(0.55, 0, -1.85, 0.15), T(0, 1.12, -1.85, 0.14)],
    stars: [34000, 50000],
  };
}

function level18(): LevelDef {
  // two stacked rooms + side posts (level 5 / 15 style)
  const blocks: BlockDef[] = [];
  const r1 = room('stone', 'wood', 0, 0, -1.9, 1.2, 0.55);
  const r2 = room('wood', 'glass', 0, r1.top, -1.9, 0.95, 0.5);
  blocks.push(...r1.blocks, ...r2.blocks);
  blocks.push(B('stone', -1.5, 0, -1.9, 0.4, 0.8, 0.4), B('stone', 1.5, 0, -1.9, 0.4, 0.8, 0.4));
  return {
    id: 18, name: 'Ziggurat', birds: ['boulder', 'pebble', 'pebble', 'boulder'],
    blocks,
    targets: [T(0, 0, -1.9, 0.18), T(0, r1.top, -1.9, 0.15), T(0, r2.top, -1.9, 0.13), T(-1.5, 0.8, -1.9, 0.13), T(1.5, 0.8, -1.9, 0.13)],
    stars: [36000, 54000],
  };
}

function level19(): LevelDef {
  // outer posts + one small keep on the ground (no intersecting walls)
  const blocks: BlockDef[] = [];
  const targets: TargetDef[] = [];
  for (const x of [-1.7, 1.7]) {
    blocks.push(B('stone', x, 0, -1.9, 0.5, 1.2, 0.5));
    targets.push(T(x, 1.2, -1.9, 0.14));
    targets.push(T(x, 0, -1.35, 0.13));
  }
  const keep = room('wood', 'glass', 0, 0, -1.9, 1.0, 0.85);
  blocks.push(...keep.blocks);
  targets.push(T(0, 0, -1.9, 0.16), T(0, keep.top, -1.9, 0.13));
  return { id: 19, name: 'Keep', birds: ['boulder', 'pebble', 'boulder', 'pebble', 'pebble'], blocks, targets, stars: [42000, 62000] };
}

function level20(): LevelDef {
  // final gauntlet: three arches + one stacked room (all proven-stable patterns)
  const blocks: BlockDef[] = [];
  const targets: TargetDef[] = [];
  for (const x of [-1.45, 1.45]) {
    const a = arch('stone', x, 0, -1.7, 0.8, 0.65, 0.3);
    blocks.push(...a.blocks);
    targets.push(T(x, 0, -1.7, 0.16), T(x, a.top, -1.7, 0.13));
  }
  const r1 = room('wood', 'glass', 0, 0, -2.2, 1.15, 0.7);
  blocks.push(...r1.blocks);
  const r2 = room('glass', 'wood', 0, r1.top, -2.2, 0.85, 0.5);
  blocks.push(...r2.blocks);
  targets.push(T(0, 0, -2.2, 0.18), T(0, r1.top, -2.2, 0.14), T(0, r2.top, -2.2, 0.12));
  return { id: 20, name: 'Final gauntlet', birds: ['boulder', 'pebble', 'boulder', 'pebble', 'boulder', 'pebble'], blocks, targets, stars: [50000, 75000] };
}

export const LEVELS: LevelDef[] = [
  level1(), level2(), level3(), level4(), level5(), level6(), level7(), level8(), level9(), level10(),
  level11(), level12(), level13(), level14(), level15(), level16(), level17(), level18(), level19(), level20(),
];

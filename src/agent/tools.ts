/**
 * Naga's desk tools (pure, no Three.js): duplicate, delete, mirror, colour swap, block text,
 * bar charts, floor plans, scene descriptions and measurements. Each returns cell changes or a
 * one-off blueprint, so everything shares the same undo stack as hand edits.
 */
import type { PaletteName } from '../../shared/protocol.js';
import { CELL, GRID_Y, X_MAX, X_MIN, Z_MAX, Z_MIN } from '../config.js';
import { groupOf, inBounds, key, parseKey, type Cell, type CellChange, type VoxelModel } from '../blocks/voxelModel.js';
import type { Blueprint, BlueprintVoxel } from '../blueprints/index.js';
import type { BlueprintId } from '../../shared/protocol.js';

// ------------------------------------------------------------------ helpers

function bounds(keys: string[]) {
  const ps = keys.map(parseKey);
  const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]), zs = ps.map((p) => p[2]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z0: Math.min(...zs), z1: Math.max(...zs) };
}

/** "s3:walls/windows" -> "walls/windows" */
const partOf = (cl: string | null): string => (cl ? cl.slice(cl.indexOf(':') + 1) : 'block');

export function makeBlueprint(label: string, voxels: BlueprintVoxel[]): Blueprint {
  const mx = Math.min(...voxels.map((v) => v.x)), my = Math.min(...voxels.map((v) => v.y)), mz = Math.min(...voxels.map((v) => v.z));
  const vs = voxels.map((v) => ({ ...v, x: v.x - mx, y: v.y - my, z: v.z - mz }));
  vs.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  const fp = { x: 0, y: 0, z: 0 };
  for (const v of vs) { fp.x = Math.max(fp.x, v.x + 1); fp.y = Math.max(fp.y, v.y + 1); fp.z = Math.max(fp.z, v.z + 1); }
  return { id: 'custom' as BlueprintId, label, defaultColor: vs[0]?.c ?? 'stone', footprint: fp, voxels: vs, clusters: [] };
}

// ------------------------------------------------------------------ duplicate

/**
 * Copy the target `count` times in a row beside it (right first, then left, behind, in front).
 * Copies get fresh spawn ids, so each is its own grabbable object with the same part names.
 */
export function duplicateChanges(model: VoxelModel, keys: string[], count = 1): { changes: CellChange[]; spawnIds: string[]; placed: number } {
  const src = keys.filter((k) => model.cells.has(k)).map((k) => [parseKey(k), model.cells.get(k)!] as const);
  if (!src.length) return { changes: [], spawnIds: [], placed: 0 };
  const b = bounds(keys);
  const w = b.x1 - b.x0 + 1, d = b.z1 - b.z0 + 1;
  const taken = new Set(model.cells.keys());
  const assign: Array<[string, Cell]> = [];
  const spawnIds: string[] = [];
  // candidate slots: a row to the right first, then left, then rows behind / in front
  const cands: Array<[number, number]> = [];
  for (let j = 0; j <= 3; j++)
    for (const sj of j ? [-1, 1] : [1])
      for (let i = 0; i <= 6; i++)
        for (const si of i ? [1, -1] : [1]) if (i || j) cands.push([si * i * (w + 1), sj * j * (d + 1)]);
  let placed = 0;
  for (const off of cands) {
    if (placed >= count) break;
    const cells = src.map(([p, c]) => [key(p[0] + off[0], p[1], p[2] + off[1]), c, p[0] + off[0], p[1], p[2] + off[1]] as const);
    if (!cells.every(([k, , x, y, z]) => inBounds(x, y, z) && !taken.has(k))) continue;
    const sid = model.nextSpawnId();
    spawnIds.push(sid);
    for (const [k, c] of cells) {
      taken.add(k);
      assign.push([k, { c: c.c, cl: `${sid}:${partOf(c.cl)}` }]);
    }
    placed++;
  }
  return { changes: model.diff(assign), spawnIds, placed };
}

// ------------------------------------------------------------------ delete / mirror / swap

export function deleteChanges(model: VoxelModel, keys: string[]): CellChange[] {
  return model.diff(keys.filter((k) => model.cells.has(k)).map((k) => [k, null] as [string, null]));
}

/** Flip left↔right within the target's own footprint. */
export function mirrorChanges(model: VoxelModel, keys: string[]): CellChange[] {
  const ks = keys.filter((k) => model.cells.has(k));
  if (!ks.length) return [];
  const b = bounds(ks);
  const assign: Array<[string, Cell | null]> = ks.map((k) => [k, null]);
  for (const k of ks) {
    const [x, y, z] = parseKey(k);
    assign.push([key(b.x0 + b.x1 - x, y, z), model.cells.get(k)!]);
  }
  return model.diff(assign);
}

export function replaceColorChanges(model: VoxelModel, keys: string[], from: PaletteName, to: PaletteName): CellChange[] {
  return model.recolorChanges(keys.filter((k) => model.cells.get(k)?.c === from), to);
}

// ------------------------------------------------------------------ block text

/** 3×5 pixel font, rows top→bottom. */
const FONT: Record<string, string[]> = {
  A: ['###', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['###', '#..', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['###', '#..', '#.#', '#.#', '###'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '###'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['###', '#.#', '###', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['###', '#..', '###', '..#', '###'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '.##', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'], '!': ['.#.', '.#.', '.#.', '...', '.#.'], '?': ['###', '..#', '.##', '...', '.#.'],
  '.': ['...', '...', '...', '...', '.#.'], '-': ['...', '...', '###', '...', '...'], ' ': ['...', '...', '...', '...', '...'],
};

/** Split text into lines that fit the grid width (4 cells per character). */
export function layoutText(text: string, maxCols: number): string[] {
  const per = Math.max(1, Math.floor((maxCols + 1) / 4));
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    for (let w = word; w.length; ) {
      const room = cur ? per - cur.length - 1 : per;
      if (w.length <= room) { cur = cur ? `${cur} ${w}` : w; w = ''; }
      else if (!cur) { lines.push(w.slice(0, per)); w = w.slice(per); }
      else { lines.push(cur); cur = ''; }
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Text standing upright facing you, one block deep, on a thin base. Each line is its own part. */
export function textBlueprint(text: string, color: PaletteName = 'gold'): Blueprint {
  const maxCols = X_MAX - X_MIN + 1;
  const lines = layoutText(text.toUpperCase(), maxCols).slice(0, Math.max(1, Math.floor(GRID_Y / 6)));
  const vox: BlueprintVoxel[] = [];
  const widest = Math.max(...lines.map((l) => l.length * 4 - 1));
  lines.forEach((line, li) => {
    const yTop = (lines.length - li) * 6 - 2;
    const xOff = Math.floor((widest - (line.length * 4 - 1)) / 2);
    [...line].forEach((ch, ci) => {
      const g = FONT[ch] ?? FONT['?'];
      g.forEach((row, r) => [...row].forEach((px, c) => {
        if (px === '#') vox.push({ x: xOff + ci * 4 + c, y: yTop - r, z: 1, c: color, cl: `sign/line${li + 1}` });
      }));
    });
  });
  for (let x = 0; x < widest; x++) for (const z of [0, 1, 2]) vox.push({ x, y: 0, z, c: 'ink', cl: 'sign/base' });
  return makeBlueprint(`sign "${text}"`, vox);
}

// ------------------------------------------------------------------ bar chart

const BAR_COLORS: PaletteName[] = ['sky', 'gold', 'roof_red', 'grass', 'water', 'white', 'oak', 'stone'];

/** Bars 2×2 cells, scaled so the tallest fits the grid; a dark base plate; each bar is a part. */
export function chartBlueprint(values: number[], color?: PaletteName): { bp: Blueprint; heights: number[] } {
  const maxH = Math.max(2, Math.min(10, GRID_Y - 3));
  const vmax = Math.max(...values, 1e-9);
  const heights = values.map((v) => (v <= 0 ? 0 : Math.max(1, Math.round((v / vmax) * maxH))));
  const vox: BlueprintVoxel[] = [];
  const W = values.length * 3 + 1;
  for (let x = 0; x < W; x++) for (let z = 0; z < 4; z++) vox.push({ x, y: 0, z, c: 'ink', cl: 'chart/base' });
  heights.forEach((h, i) => {
    const c = color ?? BAR_COLORS[i % BAR_COLORS.length];
    for (let y = 1; y <= h; y++) for (const dx of [0, 1]) for (const dz of [1, 2]) vox.push({ x: 1 + i * 3 + dx, y, z: dz, c, cl: `chart/bar${i + 1}` });
  });
  return { bp: makeBlueprint('bar chart', vox), heights };
}

// ------------------------------------------------------------------ floor plan

/** Rooms in a grid with shared 2-high walls, doorways between neighbours and a front door. */
export function floorplanBlueprint(rooms: number): Blueprint {
  const cols = rooms <= 2 ? 2 : rooms <= 4 ? 2 : 3;
  const rows = Math.ceil(rooms / cols);
  const maxW = X_MAX - X_MIN + 1, maxD = Z_MAX - Z_MIN + 1;
  const rw = Math.max(3, Math.floor((Math.min(maxW, 15) - 1) / cols) - 1);
  const rd = Math.max(3, Math.floor((Math.min(maxD, 11) - 1) / rows) - 1);
  const W = cols * (rw + 1) + 1, D = rows * (rd + 1) + 1;
  const vox = new Map<string, BlueprintVoxel>();
  const put = (x: number, y: number, z: number, c: PaletteName, cl: string) => vox.set(`${x},${y},${z}`, { x, y, z, c, cl });
  const floors: PaletteName[] = ['oak', 'white', 'sky', 'grass', 'gold', 'water'];
  let n = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (n >= rooms) break;
      n++;
      const x0 = c * (rw + 1) + 1, z0 = r * (rd + 1) + 1;
      for (let x = x0; x < x0 + rw; x++) for (let z = z0; z < z0 + rd; z++) put(x, 0, z, floors[(n - 1) % floors.length], `plan/room${n}`);
    }
  // walls: every grid line, 2 high, with a doorway in the middle of each interior wall segment
  const isWall = (x: number, z: number) => x % (rw + 1) === 0 || z % (rd + 1) === 0;
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) {
      if (!isWall(x, z)) continue;
      const onX = x % (rw + 1) === 0, onZ = z % (rd + 1) === 0;
      const midX = (x % (rw + 1)) === Math.ceil(rw / 2), midZ = (z % (rd + 1)) === Math.ceil(rd / 2);
      const outer = x === 0 || z === 0 || x === W - 1 || z === D - 1;
      // doorway in the middle of each interior wall segment, plus a front door into room 1
      const interiorDoor = !outer && ((onX && !onZ && midZ) || (onZ && !onX && midX));
      const frontDoor = z === D - 1 && !onX && midX && x < rw + 1;
      if (interiorDoor || frontDoor) continue;
      for (const y of [0, 1]) put(x, y, z, 'stone', 'plan/walls');
    }
  return makeBlueprint(`floor plan (${rooms} rooms)`, [...vox.values()]);
}

// ------------------------------------------------------------------ describe / measure

export interface ObjectInfo {
  spawn: string;
  name: string;
  blocks: number;
  parts: string[];
  /** cell bounds */
  box: ReturnType<typeof bounds>;
}

/** Group the desk into objects (one per spawn id, plus loose blocks). */
export function objectsOnDesk(model: VoxelModel): ObjectInfo[] {
  const by = new Map<string, string[]>();
  for (const [k, c] of model.cells) {
    const id = c.cl ? c.cl.split(':')[0] : 'loose';
    (by.get(id) ?? by.set(id, []).get(id)!).push(k);
  }
  const out: ObjectInfo[] = [];
  for (const [spawn, keys] of by) {
    const parts = new Set<string>();
    for (const k of keys) {
      const cl = model.cells.get(k)!.cl;
      if (cl) parts.add(partOf(cl));
    }
    const groups = [...new Set([...parts].map((p) => p.split('/')[0]))];
    out.push({ spawn, name: spawn === 'loose' ? 'loose blocks' : model.labels.get(spawn) ?? groups[0] ?? 'object', blocks: keys.length, parts: [...parts], box: bounds(keys) });
  }
  return out.sort((a, b) => Number(a.spawn.slice(1)) - Number(b.spawn.slice(1)));
}

const where = (box: ObjectInfo['box']): string => {
  const cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2;
  const lr = cx < -2 ? 'left' : cx > 2 ? 'right' : 'middle';
  const fb = cz < -2 ? 'back' : cz > 2 ? 'front' : '';
  return fb ? `${fb} ${lr}` : lr;
};
const cm = (cells: number) => Math.round(cells * CELL * 100);

/** Short spoken description ("3 things: a car on the left, ..."). */
export function describeDesk(model: VoxelModel): string {
  const objs = objectsOnDesk(model);
  if (!objs.length) return 'Your desk is empty. Ask me to build something!';
  const named = objs.filter((o) => o.spawn !== 'loose');
  const loose = objs.find((o) => o.spawn === 'loose');
  const items = named.slice(0, 5).map((o) => `${o.name.replace(/_/g, ' ')} (${where(o.box)})`);
  const more = named.length > 5 ? ` and ${named.length - 5} more` : '';
  const looseTxt = loose ? `${named.length ? ', plus ' : ''}${loose.blocks} loose block${loose.blocks === 1 ? '' : 's'}` : '';
  return `${named.length ? `${named.length} thing${named.length === 1 ? '' : 's'}: ${items.join(', ')}${more}` : ''}${looseTxt}. ${model.size} blocks in all.`;
}

export function countBlocks(model: VoxelModel, keys: string[] | null): string {
  if (!keys) {
    const colors = new Map<string, number>();
    for (const c of model.cells.values()) colors.set(c.c, (colors.get(c.c) ?? 0) + 1);
    const top = [...colors].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${n} ${c.replace('roof_red', 'red').replace('grass', 'green').replace('sky', 'blue').replace('ink', 'black')}`);
    return model.size ? `${model.size} blocks on the desk${top.length > 1 ? ` — mostly ${top.join(', ')}` : ''}.` : 'No blocks yet.';
  }
  return `That's ${keys.length} block${keys.length === 1 ? '' : 's'}.`;
}

export function measure(keys: string[]): string {
  if (!keys.length) return 'There is nothing to measure yet.';
  const b = bounds(keys);
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1, d = b.z1 - b.z0 + 1;
  return `${w} by ${d} blocks, ${h} high — about ${cm(w)} by ${cm(d)} centimetres and ${cm(h)} tall.`;
}

/** Compact scene summary for the LLM, so it can refer to what is already built. */
export function sceneSummary(model: VoxelModel): string {
  const objs = objectsOnDesk(model);
  if (!objs.length) return 'empty desk';
  return objs
    .slice(0, 8)
    .map((o) => `${o.name}@${where(o.box)}[${[...new Set(o.parts.map((p) => p.split('/').pop()))].slice(0, 6).join(',')}] ${o.blocks}b`)
    .join('; ')
    .slice(0, 600);
}

export { groupOf };

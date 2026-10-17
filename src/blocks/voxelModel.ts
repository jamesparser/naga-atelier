/**
 * Pure voxel data model + undo/redo. No Three.js here so it is unit-testable.
 *
 * Every mutation is expressed as a list of CellChange {key, before, after}.
 * Undo re-applies `before`, redo re-applies `after`. This one primitive covers
 * place/delete/move/recolor/spawn/clear/scale/rotate uniformly.
 */
import type { PaletteName } from '../../shared/protocol.js';
import { GRID_Y, UNDO_LIMIT, X_MAX, X_MIN, Z_MAX, Z_MIN } from '../config.js';

export interface Cell {
  c: PaletteName;
  /** Cluster id ("<spawnId>:<name>") or null for loose hand-placed blocks. */
  cl: string | null;
}

export interface CellChange {
  key: string;
  before: Cell | null;
  after: Cell | null;
}

export interface HistoryEntry {
  label: string;
  changes: CellChange[];
  /** model.lastSpawn before/after, so "make it red" after undo targets correctly */
  lastBefore: string | null;
  lastAfter: string | null;
}

export type Vec3i = [number, number, number];

/** "s3:walls/windows" -> "s3:walls" (the unit a pinch grabs). */
export const groupOf = (cl: string): string => cl.split('/')[0];

export const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
export const parseKey = (k: string): Vec3i => {
  const [x, y, z] = k.split(',').map(Number);
  return [x, y, z];
};

export function inBounds(x: number, y: number, z: number): boolean {
  return x >= X_MIN && x <= X_MAX && z >= Z_MIN && z <= Z_MAX && y >= 0 && y < GRID_Y;
}

export type ModelEvent =
  | { kind: 'changed'; label: string; changes: CellChange[]; source: 'commit' | 'undo' | 'redo' | 'silent' };

export class VoxelModel {
  readonly cells = new Map<string, Cell>();
  /** Bumped on every change; renderers compare to know when to rebuild. */
  version = 0;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private listeners = new Set<(e: ModelEvent) => void>();
  private spawnCounter = 0;
  /** Spawn id of the most recent agent/blueprint structure ("s3"), or a loose key group. */
  lastSpawn: string | null = null;
  /** what each spawned object is ("s3" -> "house_small"), so voice can target whole objects */
  readonly labels = new Map<string, string>();

  on(fn: (e: ModelEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get size(): number {
    return this.cells.size;
  }

  get(x: number, y: number, z: number): Cell | undefined {
    return this.cells.get(key(x, y, z));
  }

  nextSpawnId(): string {
    this.spawnCounter += 1;
    return `s${this.spawnCounter}`;
  }

  /** Build a change list from desired (key -> cell|null) assignments. No-ops are dropped. */
  diff(assign: Iterable<[string, Cell | null]>): CellChange[] {
    const out: CellChange[] = [];
    const seen = new Map<string, CellChange>();
    for (const [k, after] of assign) {
      const existing = seen.get(k);
      if (existing) {
        existing.after = after ? { ...after } : null;
        continue;
      }
      const cur = this.cells.get(k) ?? null;
      const ch: CellChange = { key: k, before: cur ? { ...cur } : null, after: after ? { ...after } : null };
      seen.set(k, ch);
      out.push(ch);
    }
    return out.filter((c) => !sameCell(c.before, c.after));
  }

  private write(changes: CellChange[], side: 'before' | 'after'): void {
    // Two passes so that moves (delete at old + write at new, possibly overlapping) are order-independent.
    for (const ch of changes) if (!ch[side]) this.cells.delete(ch.key);
    for (const ch of changes) {
      const v = ch[side];
      if (v) this.cells.set(ch.key, { ...v });
    }
    this.version++;
  }

  /** Apply + record in history. Returns false when the change list was empty. */
  commit(label: string, changes: CellChange[], lastSpawn: string | null = this.lastSpawn): boolean {
    if (changes.length === 0 && lastSpawn === this.lastSpawn) return false;
    const entry: HistoryEntry = { label, changes, lastBefore: this.lastSpawn, lastAfter: lastSpawn };
    this.write(changes, 'after');
    this.lastSpawn = lastSpawn;
    this.undoStack.push(entry);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
    this.emit({ kind: 'changed', label, changes, source: 'commit' });
    return true;
  }

  /** Apply without history (used for temporary lift-out while carrying). */
  silent(changes: CellChange[], side: 'before' | 'after' = 'after'): void {
    if (changes.length === 0) return;
    this.write(changes, side);
    this.emit({ kind: 'changed', label: 'silent', changes, source: 'silent' });
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): string | null {
    const e = this.undoStack.pop();
    if (!e) return null;
    this.write(e.changes, 'before');
    this.lastSpawn = e.lastBefore;
    this.redoStack.push(e);
    this.emit({ kind: 'changed', label: e.label, changes: e.changes, source: 'undo' });
    return e.label;
  }

  redo(): string | null {
    const e = this.redoStack.pop();
    if (!e) return null;
    this.write(e.changes, 'after');
    this.lastSpawn = e.lastAfter;
    this.undoStack.push(e);
    this.emit({ kind: 'changed', label: e.label, changes: e.changes, source: 'redo' });
    return e.label;
  }

  private emit(e: ModelEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  // ---------------------------------------------------------------- queries

  /** All keys that move together when a block with cluster `cl` is pinched. */
  keysInGroup(cl: string): string[] {
    const g = groupOf(cl);
    const out: string[] = [];
    for (const [k, c] of this.cells) if (c.cl && groupOf(c.cl) === g) out.push(k);
    return out;
  }

  keysInSpawn(spawnId: string): string[] {
    const prefix = `${spawnId}:`;
    const out: string[] = [];
    for (const [k, c] of this.cells) if (c.cl && c.cl.startsWith(prefix)) out.push(k);
    return out;
  }

  /**
   * Resolve an agent target: "all", "last", or a cluster name ("roof").
   * Cluster names are looked up in the last spawn first, then anywhere.
   */
  resolveTarget(target: string | undefined): string[] {
    const t = (target ?? 'last').toLowerCase();
    if (t === 'all') return [...this.cells.keys()];
    const last = this.lastSpawn;
    if (t === 'last' || t === 'it') {
      if (last) {
        const ks = this.keysInSpawn(last);
        if (ks.length) return ks;
      }
      return this.newestSpawnKeys();
    }
    const names = new Set([t, t.replace(/s$/, ''), `${t}s`]);
    // a whole object by what it is ("the house", "the car"): newest spawn with that label
    const byLabel = [...this.labels].filter(([sid, l]) => (names.has(l) || names.has(l.split('_')[0])) && this.keysInSpawn(sid).length);
    if (byLabel.length) {
      const sid = byLabel.sort((a, b) => Number(b[0].slice(1)) - Number(a[0].slice(1)))[0][0];
      return this.keysInSpawn(sid);
    }
    // Match the leaf name first ("roof" excludes "roof/chimney"); fall back to whole groups.
    const leafOf = (cl: string) => cl.slice(cl.indexOf(':') + 1).split('/').pop()!;
    const groupName = (cl: string) => cl.slice(cl.indexOf(':') + 1).split('/')[0];
    const anyLeaf = [...this.cells.values()].some((c) => c.cl && names.has(leafOf(c.cl)));
    const matchName = (cl: string | null) => !!cl && (anyLeaf ? names.has(leafOf(cl)) : names.has(groupName(cl)));
    if (last) {
      const ks = [...this.cells].filter(([, c]) => matchName(c.cl) && c.cl!.startsWith(`${last}:`)).map(([k]) => k);
      if (ks.length) return ks;
    }
    const any = [...this.cells].filter(([, c]) => matchName(c.cl)).map(([k]) => k);
    if (any.length) {
      // Prefer the most recent spawn that has this cluster.
      const newest = any
        .map((k) => this.cells.get(k)!.cl!.split(':')[0])
        .sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)))[0];
      return any.filter((k) => this.cells.get(k)!.cl!.startsWith(`${newest}:`));
    }
    return this.resolveTarget('last');
  }

  private newestSpawnKeys(): string[] {
    let best = -1;
    for (const c of this.cells.values()) {
      if (!c.cl) continue;
      const n = Number(c.cl.split(':')[0].slice(1));
      if (n > best) best = n;
    }
    if (best < 0) return [...this.cells.keys()];
    return this.keysInSpawn(`s${best}`);
  }

  // ---------------------------------------------------------- transforms

  /** Change list for translating `keys` by a cell delta. Null if blocked/out of bounds. */
  moveChanges(keys: string[], d: Vec3i, allowPartialClip = false): CellChange[] | null {
    const moving = new Set(keys);
    const assign: Array<[string, Cell | null]> = [];
    const targets: Array<[string, Cell]> = [];
    for (const k of keys) {
      const c = this.cells.get(k);
      if (!c) continue;
      const [x, y, z] = parseKey(k);
      const nx = x + d[0], ny = y + d[1], nz = z + d[2];
      if (!inBounds(nx, ny, nz)) {
        if (allowPartialClip) continue;
        return null;
      }
      const nk = key(nx, ny, nz);
      if (this.cells.has(nk) && !moving.has(nk)) return null;
      targets.push([nk, c]);
    }
    for (const k of keys) assign.push([k, null]);
    for (const t of targets) assign.push(t);
    return this.diff(assign);
  }

  recolorChanges(keys: string[], color: PaletteName): CellChange[] {
    return this.diff(keys.filter((k) => this.cells.has(k)).map((k) => [k, { ...this.cells.get(k)!, c: color }]));
  }

  /** Rotate keys about their footprint centre by quarter turns (clockwise from above). */
  rotateChanges(keys: string[], turns: number): CellChange[] | null {
    const pts = keys.filter((k) => this.cells.has(k)).map((k) => [parseKey(k), this.cells.get(k)!] as const);
    if (!pts.length) return [];
    const xs = pts.map(([p]) => p[0]), zs = pts.map(([p]) => p[2]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const n = ((turns % 4) + 4) % 4;
    const out: Array<[Vec3i, Cell]> = pts.map(([p, c]) => {
      let dx = p[0] - cx, dz = p[2] - cz;
      for (let i = 0; i < n; i++) [dx, dz] = [-dz, dx];
      return [[Math.round(cx + dx), p[1], Math.round(cz + dz)], c];
    });
    return this.placeGroup(keys, out);
  }

  /** Nearest-neighbour rescale of a group about its base centre. */
  scaleChanges(keys: string[], factor: number): CellChange[] | null {
    const pts = keys.filter((k) => this.cells.has(k)).map((k) => [parseKey(k), this.cells.get(k)!] as const);
    if (!pts.length) return [];
    const src = new Map(pts.map(([p, c]) => [key(...p), c]));
    const xs = pts.map(([p]) => p[0]), ys = pts.map(([p]) => p[1]), zs = pts.map(([p]) => p[2]);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    const [z0, z1] = [Math.min(...zs), Math.max(...zs)];
    const sx = x1 - x0 + 1, sy = y1 - y0 + 1, sz = z1 - z0 + 1;
    const nx = Math.max(1, Math.round(sx * factor)), ny = Math.max(1, Math.round(sy * factor)), nz = Math.max(1, Math.round(sz * factor));
    if (nx === sx && ny === sy && nz === sz) return [];
    const cx = Math.floor((x0 + x1 + 1) / 2 - nx / 2), cz = Math.floor((z0 + z1 + 1) / 2 - nz / 2);
    const out: Array<[Vec3i, Cell]> = [];
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++)
        for (let k = 0; k < nz; k++) {
          const s = src.get(key(x0 + Math.floor((i * sx) / nx), y0 + Math.floor((j * sy) / ny), z0 + Math.floor((k * sz) / nz)));
          if (s) out.push([[cx + i, y0 + j, cz + k], s]);
        }
    return this.placeGroup(keys, out, true);
  }

  /** Replace `oldKeys` with new placements; refuses if it would overwrite other blocks. */
  private placeGroup(oldKeys: string[], placed: Array<[Vec3i, Cell]>, clip = false): CellChange[] | null {
    const old = new Set(oldKeys);
    const assign: Array<[string, Cell | null]> = oldKeys.map((k) => [k, null]);
    for (const [p, c] of placed) {
      if (!inBounds(...p)) {
        if (clip) continue;
        return null;
      }
      const k = key(...p);
      if (this.cells.has(k) && !old.has(k)) {
        if (clip) continue;
        return null;
      }
      assign.push([k, c]);
    }
    return this.diff(assign);
  }

  // --------------------------------------------------------- persistence

  toJSON(): { v: 1; cells: Array<[string, Cell]>; spawnCounter: number; lastSpawn: string | null; labels?: Array<[string, string]> } {
    return { v: 1, cells: [...this.cells], spawnCounter: this.spawnCounter, lastSpawn: this.lastSpawn, labels: [...this.labels] };
  }

  load(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const d = data as { v?: number; cells?: unknown; spawnCounter?: unknown; lastSpawn?: unknown };
    if (d.v !== 1 || !Array.isArray(d.cells)) return false;
    this.cells.clear();
    for (const entry of d.cells) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue;
      const [x, y, z] = parseKey(entry[0]);
      const c = entry[1] as Cell;
      if (!inBounds(x, y, z) || !c || typeof c.c !== 'string') continue;
      this.cells.set(entry[0], { c: c.c, cl: typeof c.cl === 'string' ? c.cl : null });
    }
    this.spawnCounter = typeof d.spawnCounter === 'number' ? d.spawnCounter : 0;
    this.lastSpawn = typeof d.lastSpawn === 'string' ? d.lastSpawn : null;
    this.labels.clear();
    const labels = (d as { labels?: unknown }).labels;
    if (Array.isArray(labels)) for (const e of labels) if (Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string') this.labels.set(e[0], e[1]);
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.version++;
    this.emit({ kind: 'changed', label: 'load', changes: [], source: 'silent' });
    return true;
  }
}

function sameCell(a: Cell | null, b: Cell | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.c === b.c && a.cl === b.cl;
}

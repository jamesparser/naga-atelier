/**
 * Tetris 3D — pure game logic (no Three.js), so it is unit-testable.
 *
 * The well is W x D x H cells (10 x 4 x 14). Pieces are the 7 classic tetrominoes made of
 * cubes; they can be rotated about all three axes ("flipped"). Any complete straight row
 * running left-to-right (all W cells at one height y and depth z) clears, and the blocks
 * above it in that depth slice fall down one cell — four classic Tetris boards linked by
 * 3D pieces. A completely filled layer is a big bonus.
 */
import type { PaletteName } from '../../shared/protocol.js';

export const WELL_W = 10;
export const WELL_D = 4;
export const WELL_H = 14;

export type V3 = [number, number, number];
export type Axis = 'x' | 'y' | 'z';

export interface PieceDef {
  name: string;
  color: PaletteName;
  cells: V3[];
}

/** Classic tetrominoes, laid flat in the x–y plane (facing the player). */
export const PIECES: PieceDef[] = [
  { name: 'I', color: 'sky', cells: [[-1, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0]] },
  { name: 'O', color: 'gold', cells: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]] },
  { name: 'T', color: 'water', cells: [[-1, 0, 0], [0, 0, 0], [1, 0, 0], [0, 1, 0]] },
  { name: 'S', color: 'grass', cells: [[-1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
  { name: 'Z', color: 'roof_red', cells: [[-1, 1, 0], [0, 1, 0], [0, 0, 0], [1, 0, 0]] },
  { name: 'J', color: 'white', cells: [[-1, 1, 0], [-1, 0, 0], [0, 0, 0], [1, 0, 0]] },
  { name: 'L', color: 'oak', cells: [[-1, 0, 0], [0, 0, 0], [1, 0, 0], [1, 1, 0]] },
];

export interface Piece {
  def: PieceDef;
  cells: V3[];
  pos: V3;
}

export type GameState = 'ready' | 'playing' | 'paused' | 'over';

export type TetrisEvent =
  | { type: 'spawn' }
  | { type: 'move' }
  | { type: 'rotate' }
  | { type: 'blocked' }
  | { type: 'lock'; cells: V3[] }
  | { type: 'clear'; rows: Array<{ y: number; z: number }>; layers: number[]; cells: Array<[V3, PaletteName]>; points: number }
  | { type: 'level'; level: number }
  | { type: 'gameover'; score: number };

export const k3 = (x: number, y: number, z: number) => `${x},${y},${z}`;

export function rotateCells(cells: V3[], axis: Axis, dir: 1 | -1): V3[] {
  return cells.map(([x, y, z]) => {
    switch (axis) {
      case 'x': return [x, -dir * z, dir * y] as V3;
      case 'y': return [dir * z, y, -dir * x] as V3;
      case 'z': return [-dir * y, dir * x, z] as V3;
    }
  });
}

/** Deterministic PRNG so tests (and replays) are reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Tetris3D {
  readonly board = new Map<string, PaletteName>();
  piece: Piece | null = null;
  next: PieceDef;
  state: GameState = 'ready';
  score = 0;
  lines = 0;
  level = 1;
  /** bumps whenever the board changes (for renderers) */
  version = 0;
  private bag: PieceDef[] = [];
  private rand: () => number;
  private fallAcc = 0;
  private lockAcc = 0;
  private lockResets = 0;
  private listeners = new Set<(e: TetrisEvent) => void>();

  constructor(seed = Date.now()) {
    this.rand = mulberry32(seed);
    this.next = this.draw();
  }

  on(fn: (e: TetrisEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(e: TetrisEvent) {
    for (const fn of this.listeners) fn(e);
  }

  /** 7-bag randomiser: every piece once per bag, like modern Tetris. */
  private draw(): PieceDef {
    if (!this.bag.length) {
      this.bag = [...PIECES];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop()!;
  }

  get fallInterval(): number {
    return Math.max(110, 1000 * Math.pow(0.86, this.level - 1));
  }

  start(): void {
    this.board.clear();
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.state = 'playing';
    this.version++;
    this.spawn();
  }

  pause(on = this.state === 'playing'): void {
    if (this.state === 'playing' && on) this.state = 'paused';
    else if (this.state === 'paused' && !on) this.state = 'playing';
  }

  free(x: number, y: number, z: number): boolean {
    if (x < 0 || x >= WELL_W || z < 0 || z >= WELL_D || y < 0) return false;
    if (y >= WELL_H + 4) return false; // allow a little headroom above the rim for rotations
    return !this.board.has(k3(x, y, z));
  }

  fits(cells: V3[], pos: V3): boolean {
    return cells.every(([x, y, z]) => this.free(pos[0] + x, pos[1] + y, pos[2] + z));
  }

  /** World cells of the active piece. */
  pieceCells(p = this.piece): V3[] {
    if (!p) return [];
    return p.cells.map(([x, y, z]) => [p.pos[0] + x, p.pos[1] + y, p.pos[2] + z] as V3);
  }

  /** Where the active piece would land (for the drop shadow). */
  ghostPos(): V3 | null {
    if (!this.piece) return null;
    const pos: V3 = [...this.piece.pos];
    while (this.fits(this.piece.cells, [pos[0], pos[1] - 1, pos[2]])) pos[1]--;
    return pos;
  }

  private spawn(): void {
    const def = this.next;
    this.next = this.draw();
    const cells = def.cells.map((c) => [...c] as V3);
    const pos: V3 = [Math.floor(WELL_W / 2) - 1, WELL_H - 1 - Math.max(...cells.map((c) => c[1])), 1];
    this.piece = { def, cells, pos };
    this.fallAcc = 0;
    this.lockAcc = 0;
    this.lockResets = 0;
    if (!this.fits(cells, pos)) {
      this.state = 'over';
      this.emit({ type: 'gameover', score: this.score });
      return;
    }
    this.emit({ type: 'spawn' });
  }

  private grounded(): boolean {
    const p = this.piece;
    return !!p && !this.fits(p.cells, [p.pos[0], p.pos[1] - 1, p.pos[2]]);
  }

  private touchLock(): void {
    // Moving/rotating while resting resets the lock timer a limited number of times.
    if (this.grounded() && this.lockResets < 12) {
      this.lockAcc = 0;
      this.lockResets++;
    }
  }

  move(dx: number, dy: number, dz: number): boolean {
    const p = this.piece;
    if (!p || this.state !== 'playing') return false;
    const np: V3 = [p.pos[0] + dx, p.pos[1] + dy, p.pos[2] + dz];
    if (!this.fits(p.cells, np)) {
      if (dy === 0) this.emit({ type: 'blocked' });
      return false;
    }
    p.pos = np;
    if (dy < 0) {
      this.score += 1; // soft drop bonus
      this.fallAcc = 0;
    }
    this.touchLock();
    this.emit({ type: 'move' });
    return true;
  }

  /** Rotate ("flip") about an axis with simple wall kicks. */
  rotate(axis: Axis, dir: 1 | -1 = 1): boolean {
    const p = this.piece;
    if (!p || this.state !== 'playing') return false;
    const cells = rotateCells(p.cells, axis, dir);
    const kicks: V3[] = [[0, 0, 0], [-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1], [-2, 0, 0], [2, 0, 0], [0, 1, 0], [0, 0, -2], [0, 0, 2], [0, -1, 0]];
    for (const [kx, ky, kz] of kicks) {
      const np: V3 = [p.pos[0] + kx, p.pos[1] + ky, p.pos[2] + kz];
      if (this.fits(cells, np)) {
        p.cells = cells;
        p.pos = np;
        this.touchLock();
        this.emit({ type: 'rotate' });
        return true;
      }
    }
    this.emit({ type: 'blocked' });
    return false;
  }

  hardDrop(): void {
    const p = this.piece;
    if (!p || this.state !== 'playing') return;
    let n = 0;
    while (this.fits(p.cells, [p.pos[0], p.pos[1] - 1, p.pos[2]])) {
      p.pos[1]--;
      n++;
    }
    this.score += 2 * n;
    this.lock();
  }

  /** Advance time. Call every frame with the frame delta in ms. */
  step(dtMs: number): void {
    if (this.state !== 'playing' || !this.piece) return;
    if (this.grounded()) {
      this.lockAcc += dtMs;
      if (this.lockAcc >= 500) this.lock();
      return;
    }
    this.fallAcc += dtMs;
    while (this.fallAcc >= this.fallInterval && this.piece && !this.grounded()) {
      this.fallAcc -= this.fallInterval;
      this.piece.pos[1]--;
    }
  }

  private lock(): void {
    const p = this.piece;
    if (!p) return;
    const cells = this.pieceCells(p);
    for (const [x, y, z] of cells) this.board.set(k3(x, y, z), p.def.color);
    this.piece = null;
    this.version++;
    this.emit({ type: 'lock', cells });
    if (cells.some(([, y]) => y >= WELL_H)) {
      this.state = 'over';
      this.emit({ type: 'gameover', score: this.score });
      return;
    }
    this.clearLines();
    if (this.state === 'playing') this.spawn();
  }

  /** Find and clear complete rows; returns nothing, emits a 'clear' event. */
  private clearLines(): void {
    const rows: Array<{ y: number; z: number }> = [];
    for (let z = 0; z < WELL_D; z++)
      for (let y = 0; y < WELL_H + 4; y++) {
        let full = true;
        for (let x = 0; x < WELL_W && full; x++) full = this.board.has(k3(x, y, z));
        if (full) rows.push({ y, z });
      }
    if (!rows.length) return;
    // Full layers (every depth slice complete at the same height) score a big bonus.
    const byY = new Map<number, number>();
    for (const r of rows) byY.set(r.y, (byY.get(r.y) ?? 0) + 1);
    const layers = [...byY].filter(([, n]) => n === WELL_D).map(([y]) => y);

    const cleared: Array<[V3, PaletteName]> = [];
    for (const { y, z } of rows) for (let x = 0; x < WELL_W; x++) cleared.push([[x, y, z], this.board.get(k3(x, y, z))!]);

    // Collapse each depth slice independently, top-down so indices stay valid.
    for (let z = 0; z < WELL_D; z++) {
      const ys = rows.filter((r) => r.z === z).map((r) => r.y).sort((a, b) => b - a);
      for (const cy of ys) {
        for (let x = 0; x < WELL_W; x++) this.board.delete(k3(x, cy, z));
        for (let y = cy + 1; y < WELL_H + 4; y++)
          for (let x = 0; x < WELL_W; x++) {
            const c = this.board.get(k3(x, y, z));
            if (c) {
              this.board.delete(k3(x, y, z));
              this.board.set(k3(x, y - 1, z), c);
            }
          }
      }
    }
    const n = rows.length;
    const base = [0, 100, 300, 500, 800][Math.min(4, n)] + Math.max(0, n - 4) * 300;
    const points = (base + layers.length * 1000) * this.level;
    this.score += points;
    this.lines += n;
    const newLevel = 1 + Math.floor(this.lines / 8);
    this.version++;
    this.emit({ type: 'clear', rows, layers, cells: cleared, points });
    if (newLevel !== this.level) {
      this.level = newLevel;
      this.emit({ type: 'level', level: newLevel });
    }
  }

  /** Test helper: drop raw cells onto the board. */
  setCells(cells: Array<[V3, PaletteName]>): void {
    for (const [[x, y, z], c] of cells) this.board.set(k3(x, y, z), c);
    this.version++;
  }

  /** Test helper: force the active piece. */
  setPiece(name: string, pos: V3): void {
    const def = PIECES.find((p) => p.name === name)!;
    this.piece = { def, cells: def.cells.map((c) => [...c] as V3), pos };
  }
}

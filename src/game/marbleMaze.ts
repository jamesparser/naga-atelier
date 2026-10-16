/**
 * Marble Maze — tilt a wooden board on the desk and roll a steel marble through a fresh maze to the
 * glowing goal. Holes appear from level 4. Clearing a maze moves on to the next one automatically.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Object3D,
} from 'three';
import { sfx } from '../audio/sfx.js';
import { Sparkles } from '../fx/sparkles.js';
import { MAZE_LAYOUT } from '../ui/dock.js';
import { MAZE_PAD } from '../ui/screenPad.js';
import { GameBase, type GameHost, type PointerFrame } from './gameBase.js';

const BOARD = 0.32;
const WALL_H = 0.016;
const MAX_TILT = 0.15;
const AUTO_NEXT_S = 2.6;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MazeGrid {
  n: number;
  /** (2n+1)^2 tiles: 1 = wall, 0 = floor, 2 = hole */
  tiles: Uint8Array;
  start: [number, number];
  goal: [number, number];
}

/** Perfect maze by randomised depth-first search; tiles are walls/floor on a (2n+1) grid. */
export function makeMaze(n: number, seed: number, holes = 0): MazeGrid {
  const T = 2 * n + 1;
  const tiles = new Uint8Array(T * T).fill(1);
  const rnd = mulberry32(seed);
  const seen = new Uint8Array(n * n);
  const stack: Array<[number, number]> = [[0, n - 1]];
  seen[(n - 1) * n] = 1;
  tiles[(2 * (n - 1) + 1) * T + 1] = 0;
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1];
    const nb = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      .map(([dx, dz]) => [cx + dx, cz + dz] as [number, number])
      .filter(([x, z]) => x >= 0 && z >= 0 && x < n && z < n && !seen[z * n + x]);
    if (!nb.length) {
      stack.pop();
      continue;
    }
    const [nx, nz] = nb[Math.floor(rnd() * nb.length)];
    seen[nz * n + nx] = 1;
    tiles[(2 * nz + 1) * T + 2 * nx + 1] = 0;
    tiles[(cz + nz + 1) * T + cx + nx + 1] = 0;
    stack.push([nx, nz]);
  }
  const start: [number, number] = [1, 2 * (n - 1) + 1];
  const goal: [number, number] = [2 * (n - 1) + 1, 1];
  if (holes > 0) {
    // holes go on floor tiles that are NOT on the start→goal path, so the maze stays solvable
    const path = solvePath({ n, tiles, start, goal });
    const cands: number[] = [];
    for (let z = 1; z < T - 1; z++)
      for (let x = 1; x < T - 1; x++) {
        const i = z * T + x;
        if (tiles[i] !== 0 || path.has(i)) continue;
        if (Math.abs(x - start[0]) + Math.abs(z - start[1]) < 3) continue;
        cands.push(i);
      }
    for (let k = 0; k < holes && cands.length; k++) tiles[cands.splice(Math.floor(rnd() * cands.length), 1)[0]] = 2;
  }
  return { n, tiles, start, goal };
}

/** Tiles on the shortest floor path from start to goal (BFS). */
export function solvePath(m: MazeGrid): Set<number> {
  const T = 2 * m.n + 1;
  const prev = new Int32Array(T * T).fill(-1);
  const s = m.start[1] * T + m.start[0], g = m.goal[1] * T + m.goal[0];
  const q = [s];
  prev[s] = s;
  while (q.length) {
    const i = q.shift()!;
    if (i === g) break;
    for (const j of [i + 1, i - 1, i + T, i - T]) {
      if (j < 0 || j >= T * T || prev[j] !== -1 || m.tiles[j] === 1) continue;
      prev[j] = i;
      q.push(j);
    }
  }
  const out = new Set<number>();
  if (prev[g] === -1) return out;
  for (let i = g; i !== s; i = prev[i]) out.add(i);
  out.add(s);
  return out;
}

export class MarbleMaze extends GameBase {
  private board = new Group();
  private walls: InstancedMesh;
  private holesMesh: InstancedMesh;
  private marble: Mesh;
  private goalRing: Mesh;
  private goalBeam: Mesh;
  private sparkles: Sparkles;
  private maze!: MazeGrid;
  private s = 0.02;
  private r = 0.007;
  private pos = new Vector3();
  private vel = new Vector3();
  private tilt = { x: 0, z: 0 };
  private want = { x: 0, z: 0 };
  private level = 1;
  private time = 0;
  private falls = 0;
  private state: 'play' | 'won' | 'falling' | 'paused' = 'play';
  private stateT = 0;
  private grab: { id: number; start: Vector3 } | null = null;
  private held = new Set<string>();

  constructor(deskRoot: Object3D, host: GameHost) {
    super(deskRoot, host, MAZE_LAYOUT, MAZE_PAD, 'naga-atelier:maze-best:v1', 'maze');
    this.board.position.set(0, 0.03, -0.06);
    this.root.add(this.board);
    const base = new Mesh(new BoxGeometry(BOARD + 0.02, 0.012, BOARD + 0.02), new MeshStandardMaterial({ color: 0xc89b62, roughness: 0.7 }));
    base.position.y = -0.006;
    this.board.add(base);
    // a stand under the board so it reads as a tilting toy, not a floating slab
    const stand = new Mesh(new CylinderGeometry(0.02, 0.03, 0.03, 16), new MeshStandardMaterial({ color: 0x5b4632, roughness: 0.8 }));
    stand.position.set(0, 0.015, -0.06);
    this.root.add(stand);
    this.walls = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.6 }), 400);
    this.walls.frustumCulled = false;
    this.board.add(this.walls);
    this.holesMesh = new InstancedMesh(new CircleGeometry(0.5, 20).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0x050608 }), 60);
    this.holesMesh.frustumCulled = false;
    this.board.add(this.holesMesh);
    this.marble = new Mesh(new SphereGeometry(1, 24, 16), new MeshStandardMaterial({ color: 0xdfe8f0, metalness: 0.9, roughness: 0.15, emissive: 0x1a2430 }));
    this.board.add(this.marble);
    this.goalRing = new Mesh(new RingGeometry(0.4, 0.5, 32).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0xffd166, transparent: true, blending: AdditiveBlending, depthWrite: false }));
    this.goalBeam = new Mesh(new CylinderGeometry(0.4, 0.4, 1, 20, 1, true), new MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false }));
    this.board.add(this.goalRing, this.goalBeam);
    this.sparkles = new Sparkles(this.root);
    try {
      this.level = Math.max(1, Number(localStorage.getItem('naga-atelier:maze-level:v1') ?? 1) || 1);
    } catch {
      /* ignore */
    }
  }

  protected override musicOn(): boolean {
    return this.state !== 'paused';
  }

  protected start(): void {
    this.load(this.level);
    this.host.say(`Marble Maze, level ${this.level}. Pinch and push the way the marble should roll.`);
  }

  private load(level: number): void {
    this.level = level;
    const n = Math.min(8, 3 + level);
    const holes = level >= 4 ? Math.min(10, (level - 3) * 2) : 0;
    this.maze = makeMaze(n, 7919 * level + 13, holes);
    const T = 2 * n + 1;
    this.s = BOARD / T;
    this.r = this.s * 0.34;
    const m = new Matrix4();
    let w = 0, h = 0;
    for (let z = 0; z < T; z++)
      for (let x = 0; x < T; x++) {
        const t = this.maze.tiles[z * T + x];
        const c = this.tileCentre(x, z);
        if (t === 1) {
          m.makeScale(this.s, WALL_H, this.s).setPosition(c.x, WALL_H / 2, c.z);
          this.walls.setMatrixAt(w++, m);
        } else if (t === 2) {
          m.makeScale(this.s * 0.9, 1, this.s * 0.9).setPosition(c.x, 0.0006, c.z);
          this.holesMesh.setMatrixAt(h++, m);
        }
      }
    this.walls.count = w;
    this.holesMesh.count = h;
    this.walls.instanceMatrix.needsUpdate = true;
    this.holesMesh.instanceMatrix.needsUpdate = true;
    const g = this.tileCentre(...this.maze.goal);
    this.goalRing.position.set(g.x, 0.001, g.z);
    this.goalRing.scale.setScalar(this.s);
    this.goalBeam.position.set(g.x, 0.03, g.z);
    this.goalBeam.scale.set(this.s * 0.8, 0.06, this.s * 0.8);
    this.marble.scale.setScalar(this.r);
    this.respawn();
    this.time = 0;
    this.falls = 0;
    this.state = 'play';
    try {
      localStorage.setItem('naga-atelier:maze-level:v1', String(level));
    } catch {
      /* ignore */
    }
  }

  private tileCentre(x: number, z: number): Vector3 {
    return new Vector3((x + 0.5) * this.s - BOARD / 2, 0, (z + 0.5) * this.s - BOARD / 2);
  }

  private respawn(): void {
    const s = this.tileCentre(...this.maze.start);
    this.pos.set(s.x, this.r, s.z);
    this.vel.set(0, 0, 0);
  }

  action(id: string): void {
    switch (id) {
      case 'retry': this.load(this.level); this.host.say('Again!'); break;
      case 'next': this.load(this.level + 1); this.host.say(`Level ${this.level}.`); break;
      case 'start': this.load(1); this.host.say('Level 1.'); break;
      case 'pause':
        this.state = this.state === 'paused' ? 'play' : this.state === 'play' ? 'paused' : this.state;
        break;
      case 'exit': this.host.exit(); break;
      case 'mic': this.host.mic(); break;
      case 'left': case 'right': case 'up': case 'down':
        // pad buttons repeat while held: each press tilts for a moment
        this.held.add(id);
        break;
      case 'left:up': case 'right:up': case 'up:up': case 'down:up':
        this.held.delete(id.slice(0, -3));
        break;
    }
  }

  key(k: string): boolean {
    const map: Record<string, string> = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', r: 'retry', n: 'next', p: 'pause', Escape: 'exit' };
    const a = map[k];
    if (!a) return false;
    if (['left', 'right', 'up', 'down'].includes(a)) {
      this.held.add(a);
      const up = (e: KeyboardEvent) => {
        const kk = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (map[kk] === a) {
          this.held.delete(a);
          window.removeEventListener('keyup', up);
        }
      };
      window.addEventListener('keyup', up);
    } else this.action(a);
    return true;
  }

  pausedByHost(): void {
    if (this.state === 'play') this.state = 'paused';
  }

  protected tick(frames: PointerFrame[], now: number, dt: number): void {
    // --- desired roll direction (x = right, z = toward you) -------------------------
    let dx = 0, dz = 0;
    if (this.held.has('left')) dx -= 1;
    if (this.held.has('right')) dx += 1;
    if (this.held.has('up')) dz -= 1;
    if (this.held.has('down')) dz += 1;
    for (const f of frames) {
      const p = f.p;
      if (p.gamepad) {
        const ax = p.gamepad.axes[2] ?? 0, ay = p.gamepad.axes[3] ?? 0;
        if (Math.abs(ax) > 0.15) dx += ax;
        if (Math.abs(ay) > 0.15) dz += ay;
      }
      if (f.down && !this.grab) this.grab = { id: p.id, start: f.local.clone() };
      if (this.grab?.id === p.id) {
        if (f.up || !p.pinching) this.grab = null;
        else if (f.settling) this.grab.start.copy(f.local);
        else {
          const d = f.local.clone().sub(this.grab.start);
          dx += d.x / 0.06;
          dz += d.z / 0.06;
        }
      }
    }
    dx = Math.max(-1, Math.min(1, dx));
    dz = Math.max(-1, Math.min(1, dz));
    this.want.x = dz * MAX_TILT; // rotation about x: +z side down -> rolls toward you
    this.want.z = -dx * MAX_TILT; // rotation about z: +x side up -> rolls left
    const k = Math.min(1, dt * 10);
    this.tilt.x += (this.want.x - this.tilt.x) * k;
    this.tilt.z += (this.want.z - this.tilt.z) * k;
    this.board.rotation.set(this.tilt.x, 0, this.tilt.z);

    if (this.state === 'play') {
      this.time += dt;
      this.physics(dt);
      // rolling rumble follows the marble's speed
      const sp = Math.hypot(this.vel.x, this.vel.z);
      sfx.loop('marble', Math.min(1, sp * 4), 300 + sp * 1600);
    } else if (this.state === 'falling') {
      sfx.loop('marble', 0);
      this.stateT += dt;
      this.pos.y -= dt * 0.25;
      if (this.stateT > 0.6) {
        this.respawn();
        this.state = 'play';
      }
    } else if (this.state === 'won') {
      this.stateT += dt;
      if (this.stateT > AUTO_NEXT_S) {
        this.load(this.level + 1);
        this.host.say(`Level ${this.level}${this.level === 4 ? ' — watch out for holes!' : '.'}`);
      }
    }
    this.marble.position.copy(this.pos);
    this.marble.rotation.x += (this.vel.z / this.r) * dt;
    this.marble.rotation.z -= (this.vel.x / this.r) * dt;
    this.goalRing.rotation.y = now / 600;
    this.sparkles.update(dt);
    this.panel('MARBLE MAZE', [['LEVEL', String(this.level)], ['TIME', this.time.toFixed(1)], ['FALLS', String(this.falls)], ['BEST', `level ${Math.max(this.best, this.level - 1)}`]],
      this.state === 'won' ? 'GOAL! NEXT MAZE…' : this.state === 'paused' ? 'PAUSED' : '');
  }

  private physics(dt: number): void {
    const g = 9.8 * (5 / 7);
    const steps = Math.ceil(dt / 0.004);
    const h = dt / steps;
    const T = 2 * this.maze.n + 1;
    for (let i = 0; i < steps; i++) {
      this.vel.x += -g * Math.sin(this.tilt.z) * h;
      this.vel.z += g * Math.sin(this.tilt.x) * h;
      this.vel.multiplyScalar(1 - 0.9 * h);
      const sp = this.vel.length();
      if (sp > 0.6) this.vel.multiplyScalar(0.6 / sp);
      this.pos.x += this.vel.x * h;
      this.pos.z += this.vel.z * h;
      // circle vs wall tiles
      const tx = Math.floor((this.pos.x + BOARD / 2) / this.s), tz = Math.floor((this.pos.z + BOARD / 2) / this.s);
      for (let z = tz - 1; z <= tz + 1; z++)
        for (let x = tx - 1; x <= tx + 1; x++) {
          const solid = x < 0 || z < 0 || x >= T || z >= T || this.maze.tiles[z * T + x] === 1;
          if (!solid) continue;
          const x0 = x * this.s - BOARD / 2, z0 = z * this.s - BOARD / 2;
          const cx = Math.max(x0, Math.min(this.pos.x, x0 + this.s));
          const cz = Math.max(z0, Math.min(this.pos.z, z0 + this.s));
          const ddx = this.pos.x - cx, ddz = this.pos.z - cz;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 >= this.r * this.r || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const nx = ddx / d, nz = ddz / d;
          this.pos.x += nx * (this.r - d);
          this.pos.z += nz * (this.r - d);
          const vn = this.vel.x * nx + this.vel.z * nz;
          if (vn < 0) {
            this.vel.x -= 1.35 * vn * nx;
            this.vel.z -= 1.35 * vn * nz;
            if (vn < -0.08) sfx.play('marble', 0.8 + Math.min(0.6, -vn));
          }
        }
    }
    const ti = Math.floor((this.pos.z + BOARD / 2) / this.s) * T + Math.floor((this.pos.x + BOARD / 2) / this.s);
    if (this.maze.tiles[ti] === 2) {
      const c = this.tileCentre(ti % T, Math.floor(ti / T));
      if (Math.hypot(c.x - this.pos.x, c.z - this.pos.z) < this.s * 0.35) {
        this.state = 'falling';
        this.stateT = 0;
        this.falls++;
        sfx.play('hole');
      }
    }
    const goal = this.tileCentre(...this.maze.goal);
    if (Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z) < this.s * 0.45) {
      this.state = 'won';
      this.stateT = 0;
      this.vel.set(0, 0, 0);
      this.saveBest(this.level);
      sfx.loop('marble', 0);
      sfx.play('coin');
      sfx.play('levelup');
      this.host.celebrate();
      const w = this.board.localToWorld(goal.clone());
      this.sparkles.burst(this.root.worldToLocal(w), 0xffd166, 40, 0.4);
      this.host.say(`Maze ${this.level} done in ${this.time.toFixed(1)} seconds!`);
    }
  }

  /** test hooks */
  debugState() {
    return { level: this.level, state: this.state, n: this.maze?.n, pos: this.pos.toArray(), tilt: [this.tilt.x, this.tilt.z], falls: this.falls };
  }
  debugTeleportToGoal(): void {
    const g = this.tileCentre(...this.maze.goal);
    this.pos.set(g.x, this.r, g.z);
  }
}

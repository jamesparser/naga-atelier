/**
 * Breakout 3D — a glass box on the desk with a brick wall at the back. Your paddle is a pane of
 * glass at the front that follows your hand (or controller, mouse, keys). Bounce the ball into the
 * wall; a glowing marker on the paddle plane shows where the ball will arrive.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  EdgesGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
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
import { BREAKOUT_LAYOUT } from '../ui/dock.js';
import { BREAKOUT_PAD } from '../ui/screenPad.js';
import { GameBase, type GameHost, type PointerFrame } from './gameBase.js';

export const ARENA = { x: 0.16, y0: 0.05, y1: 0.33, z0: -0.24, z1: 0.1 };
const PZ = 0.075;
const PW = 0.075, PH = 0.055;
const BALL_R = 0.008;
const AUTO_NEXT_S = 2.5;
const COLORS = [0xff5f7a, 0xffb347, 0xffe066, 0x5ee6a8, 0x4fd1ff, 0xb28dff];

interface Brick {
  min: Vector3;
  max: Vector3;
  hp: number;
  color: number;
}

/** Level patterns: rows top→bottom, '#' = brick, '2' = 2-hit brick, digits = layers deep. */
const LEVELS: Array<{ rows: string[]; layers: number }> = [
  { rows: ['######', '######', '######'], layers: 1 },
  { rows: ['#2##2#', '######', '#.##.#', '######'], layers: 1 },
  { rows: ['..##..', '.####.', '######', '.####.', '..##..'], layers: 2 },
  { rows: ['2#22#2', '#....#', '#.22.#', '#....#', '2#22#2'], layers: 2 },
  { rows: ['######', '#2##2#', '######', '#2##2#'], layers: 3 },
  { rows: ['2.2.2.', '.2.2.2', '2.2.2.', '.2.2.2', '222222'], layers: 3 },
];

export class Breakout3D extends GameBase {
  private bricks: Brick[] = [];
  private brickMesh: InstancedMesh;
  private ball: Mesh;
  private paddle: Mesh;
  private aim: Mesh;
  private ballShadow: Mesh;
  private sparkles: Sparkles;
  private pos = new Vector3();
  private vel = new Vector3();
  private paddlePos = new Vector3(0, 0.15, PZ);
  private target = new Vector3(0, 0.15, PZ);
  private stuck = true;
  private level = 0;
  private lives = 3;
  private score = 0;
  private state: 'play' | 'won' | 'over' | 'paused' = 'play';
  private stateT = 0;
  private held = new Set<string>();
  private controlId: number | null = null;
  private tmpM = new Matrix4();
  private tmpC = new Color();

  constructor(deskRoot: Object3D, host: GameHost) {
    super(deskRoot, host, BREAKOUT_LAYOUT, BREAKOUT_PAD, 'naga-atelier:breakout-best:v1', 'breakout');
    const A = ARENA;
    const box = new BoxGeometry(A.x * 2, A.y1 - A.y0, A.z1 - A.z0);
    const edges = new LineSegments(new EdgesGeometry(box), new LineBasicMaterial({ color: 0x4fd1ff, transparent: true, opacity: 0.55 }));
    edges.position.set(0, (A.y0 + A.y1) / 2, (A.z0 + A.z1) / 2);
    this.root.add(edges);
    // depth grid on the floor and walls so you can read where the ball is
    const pts: number[] = [];
    for (let z = A.z0; z <= A.z1 + 1e-6; z += 0.034) {
      pts.push(-A.x, A.y0, z, A.x, A.y0, z, -A.x, A.y0, z, -A.x, A.y1, z, A.x, A.y0, z, A.x, A.y1, z);
    }
    const grid = new BufferGeometry();
    grid.setAttribute('position', new Float32BufferAttribute(pts, 3));
    this.root.add(new LineSegments(grid, new LineBasicMaterial({ color: 0x2a6f8f, transparent: true, opacity: 0.35 })));
    const back = new Mesh(new BoxGeometry(A.x * 2, A.y1 - A.y0, 0.004), new MeshStandardMaterial({ color: 0x0d1b2a, roughness: 0.9 }));
    back.position.set(0, (A.y0 + A.y1) / 2, A.z0 - 0.002);
    this.root.add(back);
    this.brickMesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ roughness: 0.35, metalness: 0.1, emissive: 0x111111 }), 200);
    this.brickMesh.frustumCulled = false;
    this.root.add(this.brickMesh);
    this.ball = new Mesh(new SphereGeometry(BALL_R, 20, 14), new MeshStandardMaterial({ color: 0xffffff, emissive: 0x99ddff, emissiveIntensity: 0.8 }));
    this.root.add(this.ball);
    this.ballShadow = new Mesh(new RingGeometry(0, BALL_R * 1.2, 16).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
    this.root.add(this.ballShadow);
    this.paddle = new Mesh(new BoxGeometry(PW, PH, 0.004), new MeshStandardMaterial({ color: 0x9ff7ff, transparent: true, opacity: 0.45, emissive: 0x1d6f7a, roughness: 0.1 }));
    const frame = new LineSegments(new EdgesGeometry(new BoxGeometry(PW, PH, 0.004)), new LineBasicMaterial({ color: 0xeafcff }));
    this.paddle.add(frame);
    this.root.add(this.paddle);
    this.aim = new Mesh(new RingGeometry(BALL_R * 1.3, BALL_R * 1.9, 24), new MeshBasicMaterial({ color: 0xffd166, transparent: true, blending: AdditiveBlending, depthWrite: false }));
    this.root.add(this.aim);
    this.sparkles = new Sparkles(this.root);
  }

  protected override musicOn(): boolean {
    return this.state === 'play' || this.state === 'won';
  }
  protected override musicTempo(): number {
    return this.level + 1;
  }

  protected start(): void {
    this.newGame();
    this.host.say('Breakout! Hold your hand up — the glass paddle follows it. Pinch to launch.');
  }

  private newGame(): void {
    this.score = 0;
    this.lives = 3;
    this.load(0);
  }

  private load(i: number): void {
    this.level = i;
    const L = LEVELS[i % LEVELS.length];
    const A = ARENA;
    this.bricks = [];
    const cols = 6, rows = L.rows.length;
    const bw = (A.x * 2) / cols, bh = 0.034, bd = 0.026;
    const top = A.y1 - 0.02;
    for (let layer = 0; layer < L.layers; layer++)
      L.rows.forEach((row, r) =>
        [...row].forEach((ch, c) => {
          if (ch === '.') return;
          const x0 = -A.x + c * bw + 0.002, y0 = top - (r + 1) * bh + 0.002, z0 = A.z0 + 0.005 + layer * (bd + 0.004);
          this.bricks.push({
            min: new Vector3(x0, y0, z0),
            max: new Vector3(x0 + bw - 0.004, y0 + bh - 0.004, z0 + bd),
            hp: ch === '2' ? 2 : 1,
            color: COLORS[(r + layer) % COLORS.length],
          });
        }),
      );
    void rows;
    this.stuck = true;
    this.state = 'play';
    this.drawBricks();
  }

  private drawBricks(): void {
    let n = 0;
    for (const b of this.bricks) {
      if (b.hp <= 0) continue;
      const c = b.min.clone().add(b.max).multiplyScalar(0.5);
      const s = b.max.clone().sub(b.min);
      this.tmpM.makeScale(s.x, s.y, s.z).setPosition(c);
      this.brickMesh.setMatrixAt(n, this.tmpM);
      this.tmpC.setHex(b.color);
      if (b.hp > 1) this.tmpC.offsetHSL(0, 0, -0.18);
      this.brickMesh.setColorAt(n, this.tmpC);
      n++;
    }
    this.brickMesh.count = n;
    this.brickMesh.instanceMatrix.needsUpdate = true;
    if (this.brickMesh.instanceColor) this.brickMesh.instanceColor.needsUpdate = true;
  }

  private launch(): void {
    if (!this.stuck || this.state !== 'play') return;
    this.stuck = false;
    const speed = 0.32 + Math.min(0.2, this.level * 0.025);
    this.vel.set((Math.random() - 0.5) * 0.12, 0.06, -1).setLength(speed);
    sfx.play('laser', 0.6);
  }

  action(id: string): void {
    switch (id) {
      case 'fire': this.state === 'over' ? this.newGame() : this.launch(); break;
      case 'start': this.newGame(); sfx.play('click'); this.host.say('New game.'); break;
      case 'next': this.load(this.level + 1); this.host.say(`Level ${this.level + 1}.`); break;
      case 'pause':
        if (this.state === 'play' || this.state === 'paused') this.state = this.state === 'paused' ? 'play' : 'paused';
        break;
      case 'exit': this.host.exit(); break;
      case 'mic': this.host.mic(); break;
      case 'left': case 'right': case 'up': case 'down': this.held.add(id); break;
      case 'left:up': case 'right:up': case 'up:up': case 'down:up': this.held.delete(id.slice(0, -3)); break;
    }
  }

  key(k: string): boolean {
    const map: Record<string, string> = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ' ': 'fire', n: 'start', k: 'next', p: 'pause', Escape: 'exit' };
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
    const A = ARENA;
    // --- paddle control ---------------------------------------------------------------
    const kx = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
    const ky = (this.held.has('up') ? 1 : 0) - (this.held.has('down') ? 1 : 0);
    if (kx || ky) {
      this.target.x += kx * dt * 0.35;
      this.target.y += ky * dt * 0.35;
      this.controlId = null;
    }
    for (const f of frames) {
      const p = f.p;
      if (f.down) {
        this.controlId = p.id;
        if (this.state === 'over') this.newGame();
        else this.launch();
      }
      if (p.gamepad) {
        if (p.gamepad.buttons[4]?.pressed) this.launch();
        const ax = p.gamepad.axes[2] ?? 0, ay = p.gamepad.axes[3] ?? 0;
        if (Math.abs(ax) > 0.2 || Math.abs(ay) > 0.2) {
          this.target.x += ax * dt * 0.4;
          this.target.y -= ay * dt * 0.4;
          this.controlId = null;
          continue;
        }
      }
      // the paddle follows the hand you pinched with last; until then, the raised hand (or the mouse)
      if (!kx && !ky && (this.controlId === null || !frames.some((q) => q.p.id === this.controlId))) {
        const raised = frames.filter((q) => q.p.kind !== 'mouse').sort((a, b) => b.local.y - a.local.y)[0];
        this.controlId = (raised ?? f).p.id;
      }
      if (this.controlId !== p.id) continue;
      if (p.kind === 'mouse') {
        // mouse moves on the desk plane: left/right = x, up/down the screen = height
        this.target.x = f.local.x * 1.2;
        this.target.y = 0.19 - f.local.z * 0.9;
      } else {
        const hand = p.indexTip && p.kind === 'hand' && !p.pinching ? this.deskRoot.worldToLocal(p.indexTip.clone()) : f.local;
        this.target.x = hand.x;
        this.target.y = hand.y;
      }
    }
    this.target.x = Math.max(-A.x + PW / 2, Math.min(A.x - PW / 2, this.target.x));
    this.target.y = Math.max(A.y0 + PH / 2, Math.min(A.y1 - PH / 2, this.target.y));
    this.paddlePos.lerp(this.target, Math.min(1, dt * 22));
    this.paddle.position.copy(this.paddlePos);

    // --- ball -----------------------------------------------------------------------------
    if (this.state === 'play') {
      if (this.stuck) this.pos.set(this.paddlePos.x, this.paddlePos.y, PZ - BALL_R - 0.004);
      else this.physics(dt);
      if (this.bricks.every((b) => b.hp <= 0)) {
        this.state = 'won';
        this.stateT = 0;
        sfx.play('levelup');
        this.host.celebrate();
        this.host.say(`Level ${this.level + 1} cleared!`);
        this.saveBest(this.score);
      }
    } else if (this.state === 'won') {
      this.stateT += dt;
      if (this.stateT > AUTO_NEXT_S) {
        this.load(this.level + 1);
        this.host.say(`Level ${this.level + 1}${LEVELS[this.level % LEVELS.length].layers > 1 ? ' — the wall is deeper now.' : '.'}`);
      }
    }
    this.ball.position.copy(this.pos);
    this.ballShadow.position.set(this.pos.x, A.y0 + 0.0008, this.pos.z);
    // where the ball will cross the paddle plane (or where it is, when moving away)
    this.aim.visible = !this.stuck && this.state === 'play';
    if (this.aim.visible) this.aim.position.set(this.pos.x, this.pos.y, PZ + 0.003);
    (this.aim.material as MeshBasicMaterial).opacity = 0.4 + 0.6 * Math.max(0, 1 - Math.abs(this.pos.z - PZ) / (A.z1 - A.z0));
    this.sparkles.update(dt);
    void now;
    this.panel('BREAKOUT 3D', [['SCORE', String(this.score)], ['LEVEL', String(this.level + 1)], ['BALLS', '●'.repeat(Math.max(0, this.lives)) || '0'], ['BEST', String(Math.max(this.best, this.score))]],
      this.state === 'over' ? 'GAME OVER · PINCH' : this.state === 'won' ? 'LEVEL CLEARED!' : this.state === 'paused' ? 'PAUSED' : this.stuck ? 'PINCH TO LAUNCH' : '');
  }

  private physics(dt: number): void {
    const A = ARENA;
    const steps = Math.ceil(dt / 0.004);
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      this.pos.addScaledVector(this.vel, h);
      // walls
      if (this.pos.x < -A.x + BALL_R) { this.pos.x = -A.x + BALL_R; this.vel.x = Math.abs(this.vel.x); sfx.play('bounce', 0.8); }
      if (this.pos.x > A.x - BALL_R) { this.pos.x = A.x - BALL_R; this.vel.x = -Math.abs(this.vel.x); sfx.play('bounce', 0.8); }
      if (this.pos.y < A.y0 + BALL_R) { this.pos.y = A.y0 + BALL_R; this.vel.y = Math.abs(this.vel.y); sfx.play('bounce', 0.7); }
      if (this.pos.y > A.y1 - BALL_R) { this.pos.y = A.y1 - BALL_R; this.vel.y = -Math.abs(this.vel.y); sfx.play('bounce', 0.9); }
      if (this.pos.z < A.z0 + BALL_R) { this.pos.z = A.z0 + BALL_R; this.vel.z = Math.abs(this.vel.z); sfx.play('bounce', 0.6); }
      // bricks
      for (const b of this.bricks) {
        if (b.hp <= 0) continue;
        const cx = Math.max(b.min.x, Math.min(this.pos.x, b.max.x));
        const cy = Math.max(b.min.y, Math.min(this.pos.y, b.max.y));
        const cz = Math.max(b.min.z, Math.min(this.pos.z, b.max.z));
        const d = new Vector3(this.pos.x - cx, this.pos.y - cy, this.pos.z - cz);
        if (d.lengthSq() > BALL_R * BALL_R) continue;
        // reflect along the axis of least penetration
        const pen = [
          Math.min(this.pos.x + BALL_R - b.min.x, b.max.x - (this.pos.x - BALL_R)),
          Math.min(this.pos.y + BALL_R - b.min.y, b.max.y - (this.pos.y - BALL_R)),
          Math.min(this.pos.z + BALL_R - b.min.z, b.max.z - (this.pos.z - BALL_R)),
        ];
        const ax = pen.indexOf(Math.min(...pen));
        const centre = (b.min.getComponent(ax) + b.max.getComponent(ax)) / 2;
        const sign = this.pos.getComponent(ax) < centre ? -1 : 1;
        this.vel.setComponent(ax, sign * Math.abs(this.vel.getComponent(ax)));
        this.pos.setComponent(ax, this.pos.getComponent(ax) + sign * pen[ax]);
        b.hp--;
        const at = b.min.clone().add(b.max).multiplyScalar(0.5);
        if (b.hp <= 0) {
          this.score += 10 * (1 + this.level);
          this.sparkles.burst(at, b.color, 16, 0.3);
          sfx.play('brick', 0.8 + (at.y - ARENA.y0) * 2.5);
        } else {
          this.score += 2;
          sfx.play('thud');
        }
        this.drawBricks();
        break;
      }
      // paddle
      if (this.vel.z > 0 && this.pos.z + BALL_R >= PZ - 0.002 && this.pos.z < PZ + 0.01) {
        const ox = (this.pos.x - this.paddlePos.x) / (PW / 2 + BALL_R), oy = (this.pos.y - this.paddlePos.y) / (PH / 2 + BALL_R);
        if (Math.abs(ox) <= 1 && Math.abs(oy) <= 1) {
          const speed = Math.min(0.62, this.vel.length() * 1.02);
          this.vel.set(this.vel.x + ox * 0.18, this.vel.y + oy * 0.18, -Math.abs(this.vel.z));
          if (Math.abs(this.vel.z) < speed * 0.55) this.vel.z = -speed * 0.55;
          this.vel.setLength(speed);
          this.pos.z = PZ - BALL_R - 0.002;
          sfx.play('bounce', 1.3);
        }
      }
      if (this.pos.z > A.z1 + 0.03) {
        this.lives--;
        sfx.play('hurt');
        if (this.lives <= 0) {
          this.state = 'over';
          const rec = this.saveBest(this.score);
          sfx.play('gameover');
          this.host.say(rec ? `New best: ${this.score}! Pinch for a new game.` : `Game over — ${this.score}. Pinch for a new game.`);
        } else {
          this.host.say(`Missed! ${this.lives} ${this.lives === 1 ? 'ball' : 'balls'} left. Pinch to launch.`);
        }
        this.stuck = true;
        return;
      }
    }
  }

  /** test hooks */
  debugState() {
    return { state: this.state, level: this.level, lives: this.lives, score: this.score, bricks: this.bricks.filter((b) => b.hp > 0).length, stuck: this.stuck, ball: this.pos.toArray(), paddle: this.paddlePos.toArray() };
  }
  debugClear(): void {
    for (const b of this.bricks) b.hp = 0;
    this.drawBricks();
  }
}

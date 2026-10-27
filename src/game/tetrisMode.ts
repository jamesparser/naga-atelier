/**
 * Tetris mode: the 3D well on the same desk grid, hand / controller / keyboard controls,
 * sparkle line clears, score panel. Owns its own scene subtree under the desk root.
 *
 * Hands (no controllers needed):
 *   pinch anywhere + move        steer the falling piece left/right and toward/away (relative, snapped)
 *   pinch + pull down            soft drop · flick down fast = hard drop
 *   pinch + twist your wrist     flip the piece about the axis you twisted around
 *   quick pinch-tap              spin the piece (vertical axis); or pinch the other hand while steering
 *   poke the dock                tilt · flip · spin · drop · pause · back to build
 * Controller (optional): thumbstick steer · A/X spin · B/Y flip · grip tilt · stick-click drop
 */
import {
  AdditiveBlending,
  Color,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Object3D,
} from 'three';
import { CELL } from '../config.js';
import { sfx } from '../audio/sfx.js';
import { PALETTE } from '../blocks/palette.js';
import { VoxelModel, key, type Cell } from '../blocks/voxelModel.js';
import { CarryMesh, GhostMesh, VoxelRenderer, cellCenter } from '../blocks/voxelRenderer.js';
import { Dock, GAME_LAYOUT, type DockAction } from '../ui/dock.js';
import { Sparkles } from '../fx/sparkles.js';
import { NeonStage, neonMaterial } from './neonStage.js';
import { helpCard } from '../ui/helpCard.js';
import { TETRIS_PAD } from '../ui/screenPad.js';
import { SynthMusic } from '../audio/music.js';
import type { Pointer } from '../hands/handInput.js';
import { Tetris3D, WELL_D, WELL_H, WELL_W, type Axis, type Piece, type TetrisEvent, type V3 } from './tetris.js';

/** Well cell -> desk grid cell. The well sits centred on the build grid. */
const OX = -WELL_W / 2, OZ = -WELL_D / 2; // OZ = layout reference for panels (deepest well)
const DEPTH_KEY = 'naga-atelier:tetris-depth:v1';

const TWIST_RAD = (38 * Math.PI) / 180;
/** ignore hand motion for this long after a pinch closes (fingers snapping shut jiggle the pinch point) */
const SETTLE_MS = 120;
/** The game always uses 4 cm cubes, whatever block-size preset the build grid uses. */
const TCELL = 0.04;
const BEST_KEY = 'naga-atelier:tetris-best:v1';

interface Grab {
  startLocal: Vector3;
  startX: number;
  startZ: number;
  dropped: number;
  q0: Quaternion | null;
  t0: number;
  maxMove: number;
  rotated: boolean;
  lastY: number;
  lastT: number;
  vy: number;
  done: boolean;
  /** still inside the settle window after the pinch closed */
  settling: boolean;
}

export interface TetrisHost {
  say(text: string): void;
  /** true when the headset shows passthrough (dims the room less) */
  passthrough?(): boolean;
  /** the row count changed (update on-screen controls) */
  depthChanged?(depth: number): void;
  celebrate(): void;
  exit(): void;
  mic(): void;
}

export class TetrisMode {
  readonly root = new Group();
  /** Scaled so that one grid CELL renders as TCELL. */
  private well = new Group();
  private s = 1;
  readonly game = new Tetris3D();
  readonly dock = new Dock(GAME_LAYOUT);
  private boardModel = new VoxelModel();
  private boardRenderer: VoxelRenderer;
  private pieceMesh: CarryMesh;
  private nextMesh: CarryMesh;
  private ghost: GhostMesh;
  private sparkles: Sparkles;
  private frameMat: LineBasicMaterial;
  private builtVersion = -1;
  private shownPiece: { def: string; cells: string } | null = null;
  private visualY = 0;
  private shownNext = '';
  private grabs = new Map<number, Grab>();
  private wasPinching = new Map<number, boolean>();
  private pads = new Map<number, { buttons: boolean[]; repeatAt: number; dir: string; softAt?: number }>();
  private panel: { canvas: HTMLCanvasElement; tex: CanvasTexture; mesh: Mesh; last: string };
  private best = 0;
  private stage: NeonStage;
  private frame = new Group();
  /** rows front-to-back the player chose (1 = classic, 4 = full 3D) */
  depth = 1;
  private music = new SynthMusic();
  private neon = neonMaterial();
  /** landed blocks: same neon look, dimmed so the falling piece stands out */
  private boardNeon = this.neon.clone();
  active = false;

  constructor(private deskRoot: Object3D, _shadows: boolean, private host: TetrisHost) {
    this.root.name = 'tetris';
    this.root.visible = false;
    deskRoot.add(this.root);
    this.s = TCELL / CELL;
    this.well.scale.setScalar(this.s);
    this.root.add(this.well);
    // Neon look: glowing-rim glass cubes that share one hue-cycling material.
    this.boardRenderer = new VoxelRenderer(this.boardModel, this.well, false, this.boardNeon, 800);
    this.pieceMesh = new CarryMesh(this.well, false, this.neon, 8);
    this.ghost = new GhostMesh(this.well);
    this.sparkles = new Sparkles(this.well);
    this.root.add(this.dock.root);

    this.frameMat = new LineBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false });
    this.well.add(this.frame);

    // Score panel + next-piece preview to the right of the well.
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 640;
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(new PlaneGeometry(0.16, 0.2), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    const X1 = (OX + WELL_W) * TCELL, Z0 = OZ * TCELL;
    mesh.position.set(X1 + 0.11, 0.17, Z0 + 0.01);
    mesh.rotation.y = -0.35;
    mesh.renderOrder = 12;
    this.root.add(mesh);
    this.panel = { canvas, tex, mesh, last: '' };
    this.nextMesh = new CarryMesh(this.root, false, this.neon, 8);
    this.nextMesh.group.position.set(X1 + 0.11, 0.31, Z0 + 0.03);
    this.nextMesh.group.scale.setScalar(0.7 * this.s);

    // In-headset how-to card, left of the well (same text as the on-screen help).
    const card = helpCard('How to play', TETRIS_PAD.help.filter((h) => h.head.startsWith('Quest')).map((h) => ({ head: h.head.replace('Quest — ', ''), lines: h.lines })), 0.17);
    card.position.set(OX * TCELL - 0.12, 0.2, OZ * TCELL + 0.02);
    card.rotation.y = 0.45;
    this.root.add(card);
    this.stage = new NeonStage(OX * TCELL, (OX + WELL_W) * TCELL, WELL_H * TCELL, OZ * TCELL);
    this.root.add(this.stage.root);
    try {
      this.depth = Math.max(1, Math.min(WELL_D, Number(localStorage.getItem(DEPTH_KEY) ?? 1) || 1));
    } catch {
      /* ignore */
    }
    this.game.setDepth(this.depth);
    this.buildFrame();

    try {
      this.best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
    } catch {
      /* ignore */
    }
    this.game.on((ev) => this.onGameEvent(ev));
  }

  private get oz(): number {
    return -this.depth / 2;
  }
  private toDesk([x, y, z]: V3): V3 {
    return [x + OX, y, z + this.oz];
  }

  /** Glowing edges + faint glass back and sides for the chosen depth. */
  private buildFrame(): void {
    for (const c of [...this.frame.children]) {
      this.frame.remove(c);
      (c as Mesh).geometry?.dispose();
    }
    const x0 = OX * CELL, x1 = (OX + WELL_W) * CELL, z0 = this.oz * CELL, z1 = (this.oz + this.depth) * CELL, h = WELL_H * CELL;
    const e: number[] = [];
    const seg = (a: number[], b: number[]) => e.push(...a, ...b);
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) seg([x, 0, z], [x, h, z]);
    for (const y of [0, h]) {
      seg([x0, y, z0], [x1, y, z0]); seg([x0, y, z1], [x1, y, z1]);
      seg([x0, y, z0], [x0, y, z1]); seg([x1, y, z0], [x1, y, z1]);
    }
    for (let x = 1; x < WELL_W; x++) seg([x0 + x * CELL, 0.001, z0], [x0 + x * CELL, 0.001, z1]);
    for (let z = 1; z < this.depth; z++) seg([x0, 0.001, z0 + z * CELL], [x1, 0.001, z0 + z * CELL]);
    const fg = new BufferGeometry();
    fg.setAttribute('position', new Float32BufferAttribute(e, 3));
    this.frame.add(new LineSegments(fg, this.frameMat));
    const glass = new MeshBasicMaterial({ color: 0x3a1a6a, transparent: true, opacity: 0.16, depthWrite: false });
    const back = new Mesh(new PlaneGeometry(x1 - x0, h), glass);
    back.position.set((x0 + x1) / 2, h / 2, z0);
    const left = new Mesh(new PlaneGeometry(z1 - z0, h), glass);
    left.rotation.y = Math.PI / 2;
    left.position.set(x0, h / 2, (z0 + z1) / 2);
    const right = left.clone();
    right.position.x = x1;
    const floor = new Mesh(new PlaneGeometry(x1 - x0, z1 - z0), new MeshBasicMaterial({ color: 0x12002a, transparent: true, opacity: 0.6, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((x0 + x1) / 2, 0.0008, (z0 + z1) / 2);
    this.frame.add(back, left, right, floor);
    this.stage.zBack = this.oz * TCELL;
  }

  /** Choose 1–4 rows deep (restarts the game). 1 row plays like classic Tetris. */
  setDepth(d: number): void {
    const nd = Math.max(1, Math.min(WELL_D, Math.round(d)));
    this.depth = nd;
    try {
      localStorage.setItem(DEPTH_KEY, String(nd));
    } catch {
      /* ignore */
    }
    this.game.setDepth(nd);
    this.buildFrame();
    this.builtVersion = -1;
    this.shownPiece = null;
    if (this.active) {
      this.game.start();
      this.music.start(sfx.ctx, 1);
    }
    sfx.play('chime');
    this.host.say(nd === 1 ? '1 row deep — classic Tetris. New game!' : `${nd} rows deep. New game!`);
    this.host.depthChanged?.(nd);
  }

  enter(): void {
    this.active = true;
    this.root.visible = true;
    this.grabs.clear();
    this.game.start();
    this.stage.setPassthrough(this.host.passthrough?.() ?? false);
    this.music.start(sfx.ctx, 1);
    this.host.say('Tetris! Fill a row left to right to blast it. The card on the left shows the controls.');
  }

  exit(): void {
    this.active = false;
    this.root.visible = false;
    this.music.stop();
    this.game.state = 'ready';
    this.pieceMesh.hide();
    this.ghost.hide();
    this.nextMesh.hide();
    this.shownNext = '';
  }

  /** Dock / voice actions. */
  action(a: DockAction | 'left' | 'right' | 'away' | 'closer' | 'down' | 'depth1' | 'depth2' | 'depth3' | 'depth4'): void {
    const g = this.game;
    if (g.state === 'over' && (a === 'drop' || a === 'spin')) {
      g.start();
      this.music.start(sfx.ctx, 1);
      this.host.say('New game. Good luck!');
      return;
    }
    // One row deep = classic Tetris: up rotates, down falls faster.
    if (this.depth === 1 && a === 'away') a = 'spin';
    else if (this.depth === 1 && a === 'closer') a = 'down';
    switch (a) {
      // With one row there is no depth to turn into, so every turn button is a classic rotate.
      case 'spin': if (this.depth === 1) g.rotate('z', -1); else g.rotate('y', 1); break;
      case 'flip': if (this.depth === 1) g.rotate('z', 1); else g.rotate('x', 1); break;
      case 'tilt': g.rotate('z', 1); break;
      case 'depth1': case 'depth2': case 'depth3': case 'depth4': this.setDepth(Number(a.slice(5))); break;
      case 'depth': this.setDepth((this.depth % WELL_D) + 1); break;
      case 'drop': g.hardDrop(); break;
      case 'left': g.move(-1, 0, 0); break;
      case 'right': g.move(1, 0, 0); break;
      case 'away': g.move(0, 0, -1); break;
      case 'closer': g.move(0, 0, 1); break;
      case 'down': g.move(0, -1, 0); break;
      case 'pause':
        g.pause(g.state === 'playing');
        if (g.state === 'paused') this.music.stop();
        else this.music.start(sfx.ctx, g.level);
        sfx.play('click');
        this.host.say(g.state === 'paused' ? 'Paused.' : 'Go!');
        break;
      case 'exit': this.host.exit(); break;
      case 'mic': this.host.mic(); break;
      default: break;
    }
  }

  /** Desktop keyboard. Returns true when the key was used. */
  key(k: string): boolean {
    const map: Record<string, Parameters<TetrisMode['action']>[0]> = {
      // Arrows move the piece around the well floor: ← → left/right, ↑ ↓ back/front row (4 rows deep).
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'away', ArrowDown: 'closer',
      a: 'left', d: 'right', w: 'away', s: 'closer',
      // Turning: Q/E spin flat, R flip toward you, F tilt sideways.
      q: 'spin', e: 'spin', r: 'flip', f: 'tilt',
      // Falling: hold Shift (or X) = faster, Space (or Enter) = drop now.
      Shift: 'down', x: 'down', ' ': 'drop', Enter: 'drop',
      '1': 'depth1', '2': 'depth2', '3': 'depth3', '4': 'depth4',
      p: 'pause', Escape: 'exit',
    };
    const a = map[k];
    if (!a) return false;
    this.action(a);
    return true;
  }

  pausedByHost(): void {
    this.music.stop();
    if (this.game.state === 'playing') this.game.pause(true);
  }

  update(pointers: Pointer[], now: number, dt: number): void {
    if (!this.active) return;
    this.handlePointers(pointers, now);
    this.game.step(dt * 1000);
    this.sync(now, dt);
  }

  // ----------------------------------------------------------------- input

  private handlePointers(pointers: Pointer[], now: number): void {
    const tips = new Map<number, Vector3>();
    for (const p of pointers) {
      if (!p.active) {
        this.grabs.delete(p.id);
        this.wasPinching.set(p.id, false);
        continue;
      }
      if (p.gamepad) this.handlePad(p.id, p.gamepad, now);
      const local = this.deskRoot.worldToLocal(p.pinchPoint.clone());
      const was = this.wasPinching.get(p.id) ?? false;
      this.wasPinching.set(p.id, p.pinching);
      const down = p.pinching && !was, up = !p.pinching && was;
      if (p.indexTip && !p.pinching && p.kind !== 'mouse' && !this.grabs.has(p.id)) tips.set(p.id, this.deskRoot.worldToLocal(p.indexTip.clone()));

      if (down) {
        const hit = this.dock.hitTest(local, 0.012);
        if (hit) {
          this.dock.flash(hit, now);
          this.action(hit);
          continue;
        }
        // Controllers steer with the thumbstick; their trigger is "slam" (handled in handlePad).
        if (p.kind === 'controller') continue;
        // already steering with the other hand? this pinch spins the piece right away
        if ([...this.grabs.keys()].some((id) => id !== p.id)) {
          this.action('spin');
          this.grabs.set(p.id, { startLocal: local.clone(), startX: 0, startZ: 0, dropped: 0, q0: null, t0: now, maxMove: 0, rotated: true, lastY: local.y, lastT: now, vy: 0, done: true, settling: false });
          continue;
        }
        const piece = this.game.piece;
        this.grabs.set(p.id, {
          startLocal: local.clone(),
          startX: piece?.pos[0] ?? 0,
          startZ: piece?.pos[2] ?? 0,
          dropped: 0,
          q0: p.wristQuat ? this.deskQuat(p.wristQuat) : null,
          t0: now,
          maxMove: 0,
          rotated: false,
          lastY: local.y,
          lastT: now,
          vy: 0,
          done: false,
          settling: true,
        });
        sfx.play('tick');
        continue;
      }
      const g = this.grabs.get(p.id);
      if (!g) continue;
      if (up) {
        this.grabs.delete(p.id);
        // a quick pinch-tap spins (a little more forgiving than before)
        if (!g.done && !g.rotated && now - g.t0 < 420 && g.maxMove < 0.03) this.action('spin');
        continue;
      }
      if (g.done || !p.pinching) continue;
      if (g.settling) {
        // re-anchor once the pinch has settled so the snap of closing fingers never moves the piece
        if (now - g.t0 < SETTLE_MS) continue;
        g.settling = false;
        g.startLocal.copy(local);
        g.lastY = local.y;
        g.lastT = now;
        const pc = this.game.piece;
        if (pc) {
          g.startX = pc.pos[0];
          g.startZ = pc.pos[2];
        }
      }
      // Quest reports pinch strength ~0.5-0.8 while held; only ignore a pinch that is clearly opening
      if (p.kind === 'hand' && p.strength < 0.4) continue;
      this.steer(g, local, now);
      if (p.wristQuat && g.q0) this.twist(g, p.wristQuat);
    }
    for (const a of this.dock.updatePokes(tips, now, pointers.filter((q) => q.active).map((q) => this.deskRoot.worldToLocal(q.pinchPoint.clone())))) this.action(a);
  }

  private steer(g: Grab, local: Vector3, now: number): void {
    const game = this.game;
    const piece = game.piece;
    if (!piece) return;
    const d = local.clone().sub(g.startLocal);
    g.maxMove = Math.max(g.maxMove, d.length());
    // velocity for the flick-down gesture
    const dtS = Math.max(1e-3, (now - g.lastT) / 1000);
    g.vy = 0.6 * g.vy + 0.4 * ((local.y - g.lastY) / dtS);
    g.lastY = local.y;
    g.lastT = now;
    if (g.vy < -0.8 && d.y < -0.04) {
      game.hardDrop();
      g.done = true;
      return;
    }
    const tx = g.startX + Math.round(d.x / TCELL);
    const tz = g.startZ + Math.round(d.z / TCELL);
    for (let i = 0; i < WELL_W && piece === game.piece && piece.pos[0] !== tx; i++) if (!game.move(Math.sign(tx - piece.pos[0]), 0, 0)) break;
    for (let i = 0; i < this.depth && piece === game.piece && piece.pos[2] !== tz; i++) if (!game.move(0, 0, Math.sign(tz - piece.pos[2]))) break;
    const want = Math.floor(-d.y / (TCELL * 0.8)); // pull down: one row per ~3 cm
    while (want > g.dropped && piece === game.piece) {
      if (!game.move(0, -1, 0)) break;
      g.dropped++;
    }
    if (piece !== game.piece) {
      // piece locked mid-gesture: re-anchor on the new piece so steering continues naturally
      const np = game.piece;
      if (np) {
        g.startLocal.copy(local);
        g.startX = np.pos[0];
        g.startZ = np.pos[2];
        g.dropped = 0;
      }
    }
  }

  private deskQuat(world: Quaternion): Quaternion {
    const deskQ = this.deskRoot.getWorldQuaternion(new Quaternion());
    return deskQ.invert().multiply(world);
  }

  /** Twist detection: rotation since grab start (in desk axes) beyond ~50° flips the piece. */
  private twist(g: Grab, worldQ: Quaternion): void {
    const q = this.deskQuat(worldQ);
    const delta = q.clone().multiply(g.q0!.clone().invert()); // desk-space rotation since baseline
    if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
    const angle = 2 * Math.acos(Math.min(1, delta.w));
    if (angle < TWIST_RAD) return;
    const s = Math.sqrt(1 - delta.w * delta.w) || 1;
    const v = new Vector3(delta.x / s, delta.y / s, delta.z / s).multiplyScalar(angle);
    const comps: Array<[Axis, number]> = [['x', v.x], ['y', v.y], ['z', v.z]];
    comps.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const [axis, amount] = comps[0];
    if (Math.abs(amount) < TWIST_RAD * 0.8) return;
    this.game.rotate(axis, amount > 0 ? 1 : -1);
    g.rotated = true;
    g.q0 = q; // re-baseline so another twist flips again
  }

  private handlePad(id: number, pad: Gamepad, now: number): void {
    const st = this.pads.get(id) ?? { buttons: [], repeatAt: 0, dir: '', softAt: 0 };
    this.pads.set(id, st);
    const pressed = (i: number) => !!pad.buttons[i]?.pressed;
    const edge = (i: number) => pressed(i) && !st.buttons[i];
    // Quest Touch: 0 trigger · 1 grip · 3 stick click · 4 A/X · 5 B/Y
    if (edge(0)) this.action('drop'); // trigger = slam it down
    if (edge(4)) this.action('spin');
    if (edge(5)) this.action('flip');
    if (edge(3)) this.action('tilt');
    // Hold grip = fast fall (soft drop), repeating like holding ↓.
    if (pressed(1) && now >= (st.softAt ?? 0)) {
      this.action('down');
      st.softAt = now + 55;
    }
    st.buttons = pad.buttons.map((b) => b.pressed);
    const ax = pad.axes[2] ?? 0, ay = pad.axes[3] ?? 0;
    const dir = Math.abs(ax) > 0.6 ? (ax < 0 ? 'left' : 'right') : Math.abs(ay) > 0.6 ? (ay < 0 ? 'away' : 'closer') : '';
    if (!dir) {
      st.dir = '';
      return;
    }
    if (dir !== st.dir) {
      st.dir = dir;
      st.repeatAt = now + 200;
      this.action(dir as 'left');
    } else if (now >= st.repeatAt) {
      st.repeatAt = now + 85;
      this.action(dir as 'left');
    }
  }

  // ----------------------------------------------------------------- feedback

  private onGameEvent(ev: TetrisEvent): void {
    switch (ev.type) {
      case 'rotate': sfx.play('rotate'); break;
      case 'move': sfx.play('tick'); break;
      case 'blocked': break; // silent: the wall-bump buzz was grating
      case 'lock': sfx.play('lock'); break;
      case 'clear': {
        const big = ev.rows.length >= 4 || ev.layers.length > 0;
        sfx.play(big ? 'bigclear' : 'clear', 1 + 0.06 * Math.min(4, ev.rows.length));
        const c = new Vector3();
        for (const [cell, color] of ev.cells) {
          const [x, y, z] = this.toDesk(cell);
          this.sparkles.burst(cellCenter(x, y, z, c), PALETTE[color], big ? 9 : 6, (big ? 0.5 : 0.35) / this.s);
        }
        // One shock ring per cleared height (several rows at the same height share it).
        for (const y of new Set(ev.rows.map((r) => r.y))) {
          this.sparkles.ring(new Vector3(0, (y + 0.5) * CELL, 0), big ? 0xffe6a8 : 0xbfe8ff, WELL_W * CELL * (big ? 0.7 : 0.55));
        }
        this.stage.pulse(big ? 2 : 0.6 + 0.3 * ev.rows.length);
        this.music.accent();
        const n = ev.rows.length;
        const word = ev.layers.length ? 'Full layer!' : n >= 4 ? 'TETRIS!' : n === 3 ? 'Triple!' : n === 2 ? 'Double!' : '';
        if (word) this.host.say(`${word} +${ev.points}`);
        this.host.celebrate();
        break;
      }
      case 'level':
        sfx.play('levelup');
        this.music.setLevel(ev.level);
        this.stage.pulse(1.2);
        this.host.say(`Level ${ev.level} — faster now.`);
        break;
      case 'gameover': {
        sfx.play('gameover');
        this.music.stop();
        const record = ev.score > this.best;
        if (record) {
          this.best = ev.score;
          try {
            localStorage.setItem(BEST_KEY, String(this.best));
          } catch {
            /* ignore */
          }
        }
        this.host.say(record ? `New best: ${ev.score}! Press DROP to play again.` : `Game over — ${ev.score}. Press DROP to play again.`);
        break;
      }
      default:
        break;
    }
  }

  // ----------------------------------------------------------------- rendering

  private sync(now: number, dt: number): void {
    const g = this.game;
    if (this.builtVersion !== g.version) {
      this.builtVersion = g.version;
      this.boardModel.cells.clear();
      for (const [k, color] of g.board) {
        const [x, y, z] = this.toDesk(k.split(',').map(Number) as V3);
        this.boardModel.cells.set(key(x, y, z), { c: color, cl: null });
      }
      this.boardModel.version++;
    }
    this.boardRenderer.update(now);

    const piece = g.piece;
    if (piece && g.state !== 'over') {
      const sig = { def: piece.def.name, cells: JSON.stringify(piece.cells) };
      const fresh = !this.shownPiece || this.shownPiece.def !== sig.def;
      if (!this.shownPiece || this.shownPiece.cells !== sig.cells || fresh) {
        this.pieceMesh.show(this.rel(piece));
        this.shownPiece = sig;
      }
      const [dx, dy, dz] = this.toDesk(piece.pos);
      if (fresh) this.visualY = dy;
      this.visualY += (dy - this.visualY) * Math.min(1, dt * 18);
      if (Math.abs(this.visualY - dy) > 3) this.visualY = dy;
      this.pieceMesh.group.position.copy(cellCenter(dx, this.visualY, dz));
      const gp = g.ghostPos();
      if (gp) this.ghost.show(piece.cells.map(([x, y, z]) => this.toDesk([gp[0] + x, gp[1] + y, gp[2] + z])), true);
    } else {
      this.pieceMesh.hide();
      this.ghost.hide();
      this.shownPiece = null;
    }
    if (this.shownNext !== g.next.name) {
      this.shownNext = g.next.name;
      this.nextMesh.show(g.next.cells.map((c) => [c, { c: g.next.color, cl: null } as Cell]));
    }

    // Danger tint when the stack nears the rim.
    let top = 0;
    for (const k of g.board.keys()) top = Math.max(top, Number(k.split(',')[1]));
    const danger = top >= WELL_H - 4;
    this.stage.update(now, dt, g.level, danger);
    // hue-cycling neon: frame follows the stage tint, blocks get a softer wash + white flash on clears
    this.frameMat.color.copy(this.stage.tint);
    if (danger) this.frameMat.color.lerp(new Color(1, 0.2, 0.25), 0.5 + 0.5 * Math.sin(now / 110));
    this.neon.color.setRGB(1, 1, 1).lerp(this.stage.tint, 0.28).lerp(new Color(1, 1, 1), Math.min(1, this.stage.flashLevel));
    // placed blocks sit at ~55% brightness (they still flash with line clears)
    this.boardNeon.color.copy(this.neon.color).multiplyScalar(0.55 + 0.45 * Math.min(1, this.stage.flashLevel));

    this.sparkles.update(dt);
    this.drawPanel();
  }

  private rel(p: Piece): Array<[V3, Cell]> {
    return p.cells.map((c) => [c, { c: p.def.color, cl: null }]);
  }

  private drawPanel(): void {
    const g = this.game;
    const state = g.state === 'paused' ? 'PAUSED' : g.state === 'over' ? 'GAME OVER' : '';
    const sig = `${g.score}|${g.lines}|${g.level}|${this.best}|${state}|${this.depth}`;
    if (sig === this.panel.last) return;
    this.panel.last = sig;
    const c = this.panel.canvas.getContext('2d')!;
    c.clearRect(0, 0, 512, 640);
    c.fillStyle = 'rgba(10,18,28,0.78)';
    c.beginPath();
    c.roundRect(8, 8, 496, 624, 40);
    c.fill();
    c.textAlign = 'left';
    const row = (label: string, value: string, y: number, big = false) => {
      c.fillStyle = '#9fb3c8';
      c.font = '600 34px system-ui, sans-serif';
      c.fillText(label, 44, y);
      c.fillStyle = '#eafcff';
      c.font = `700 ${big ? 84 : 62}px system-ui, sans-serif`;
      c.fillText(value, 44, y + (big ? 84 : 66));
    };
    c.fillStyle = '#ffd166';
    c.font = '700 40px system-ui, sans-serif';
    c.fillText('NEXT', 44, 64);
    row('SCORE', String(g.score), 130, true);
    row('LINES', String(g.lines), 290);
    row('LEVEL', String(g.level), 420);
    c.fillStyle = '#9fb3c8';
    c.font = '600 32px system-ui, sans-serif';
    c.fillText(`BEST ${Math.max(this.best, g.score)}`, 44, 580);
    c.fillStyle = '#7fd8ff';
    c.fillText(`ROWS ${this.depth}`, 44, 540);
    if (state) {
      c.fillStyle = g.state === 'over' ? '#ff8a8a' : '#ffd166';
      c.font = '800 54px system-ui, sans-serif';
      c.textAlign = 'right';
      c.fillText(state, 470, 580);
    }
    this.panel.tex.needsUpdate = true;
  }
}

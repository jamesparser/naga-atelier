/**
 * Flap Bro — a first-person flapping game. You are the bird: flap to rise, fall between flaps and fly
 * through the gaps in the walls that rush toward you. For comfort you never move: the world does, and
 * the desk stays put in front of you as a steady "cockpit".
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
  DoubleSide,
  type Object3D,
} from 'three';
import { sfx } from '../audio/sfx.js';
import { Sparkles, dotTexture } from '../fx/sparkles.js';
import { FLAPBRO_LAYOUT } from '../ui/dock.js';
import { FLAPBRO_PAD } from '../ui/screenPad.js';
import { GameBase, type GameHost, type PointerFrame } from './gameBase.js';

export const FLAPBRO_NAME = 'Flap Bro';
const GRAVITY = -5.2;
const FLAP_V = 2.0;
const SPEED0 = 2.2;
const SPACING = 2.8;
const GAP = 0.78;
const WALL_W = 2.4, WALL_D = 0.35, WALL_H = 3;
const FLOOR = -1.25, CEIL = 1.25;
const FAR = -14;

interface Wall {
  z: number;
  gap: number;
  passed: boolean;
  hue: number;
}

export class FlapBro extends GameBase {
  override readonly firstPerson = true;
  private world = new Group();
  private walls: Wall[] = [];
  private wallMesh: InstancedMesh;
  private rimMesh: InstancedMesh;
  private floor: Mesh;
  private wings: Mesh[] = [];
  private sparkles: Sparkles;
  private clouds: Points;
  private cloudPos = new Float32Array(240 * 3);
  private alt = 0;
  private vAlt = 0;
  private shown = 0;
  private speed = SPEED0;
  private score = 0;
  private state: 'ready' | 'play' | 'over' | 'paused' = 'ready';
  private stateT = 0;
  private flapT = 9;
  private eye = new Vector3();
  private lastY = new Map<number, number>();
  private tmpM = new Matrix4();
  private tmpC = new Color();

  constructor(deskRoot: Object3D, host: GameHost) {
    super(deskRoot, host, FLAPBRO_LAYOUT, FLAPBRO_PAD, 'naga-atelier:flapbro-best:v1', 'flapbro');
    this.root.add(this.world);
    this.wallMesh = new InstancedMesh(new BoxGeometry(WALL_W, WALL_H, WALL_D), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, emissive: 0x0a2a1a }), 24);
    this.rimMesh = new InstancedMesh(new BoxGeometry(WALL_W + 0.08, 0.08, WALL_D + 0.08), new MeshBasicMaterial({ color: 0xffffff }), 24);
    for (const m of [this.wallMesh, this.rimMesh]) {
      m.frustumCulled = false;
      this.world.add(m);
    }
    // a soft floor of clouds far below and a sky ceiling so "up" and "down" read clearly
    this.floor = new Mesh(new PlaneGeometry(8, 30), new MeshBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.35, side: DoubleSide, depthWrite: false }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(0, FLOOR - 0.05, -10);
    this.world.add(this.floor);
    for (let i = 0; i < 240; i++) this.resetCloud(i, true);
    const cg = new BufferGeometry();
    cg.setAttribute('position', new BufferAttribute(this.cloudPos, 3));
    this.clouds = new Points(cg, new PointsMaterial({ size: 0.09, map: dotTexture(), color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, blending: AdditiveBlending }));
    this.clouds.frustumCulled = false;
    this.world.add(this.clouds);
    // your wings, at the edge of your view (desk-anchored, they follow the eye position only)
    const wingShape = new Shape();
    wingShape.moveTo(0, 0);
    wingShape.quadraticCurveTo(0.12, 0.08, 0.26, 0.05);
    wingShape.quadraticCurveTo(0.2, 0.0, 0.24, -0.03);
    wingShape.quadraticCurveTo(0.12, -0.05, 0, -0.03);
    const wg = new ShapeGeometry(wingShape);
    for (const side of [-1, 1]) {
      const w = new Mesh(wg, new MeshStandardMaterial({ color: 0xffc94a, emissive: 0x553300, side: DoubleSide, roughness: 0.6 }));
      w.scale.set(side, 1, 1);
      this.wings.push(w);
      this.root.add(w);
    }
    const beak = new Mesh(new ConeGeometry(0.018, 0.05, 12).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: 0xff8a3d, emissive: 0x401800 }));
    beak.name = 'beak';
    this.root.add(beak);
    this.sparkles = new Sparkles(this.root);
    // panel + help float at eye level for a first-person game
    this.panelMesh.position.set(0.3, 0.52, 0.02);
    this.panelMesh.rotation.y = -0.55;
    this.helpMesh.position.set(-0.32, 0.5, 0.02);
    this.helpMesh.rotation.y = 0.55;
  }

  protected override musicOn(): boolean {
    return this.state === 'play' || this.state === 'ready';
  }
  protected override musicTempo(): number {
    return 1 + Math.floor(this.score / 5);
  }

  private resetCloud(i: number, anywhere = false): void {
    const z = anywhere ? FAR + Math.random() * (0.5 - FAR) : FAR - Math.random() * 2;
    const y = Math.random() < 0.6 ? FLOOR - 0.1 - Math.random() * 0.4 : CEIL + 0.2 + Math.random() * 0.6;
    this.cloudPos.set([(Math.random() - 0.5) * 7, y, z], i * 3);
  }

  protected start(): void {
    this.reset();
    this.host.say(`${FLAPBRO_NAME}! You're the bird. Pinch, click or press Space to flap through the gaps.`);
  }

  private reset(): void {
    this.walls = [];
    for (let i = 0; i < 5; i++) this.walls.push(this.newWall(-5 - i * SPACING));
    this.alt = 0;
    this.vAlt = 0;
    this.shown = 0;
    this.speed = SPEED0;
    this.score = 0;
    this.state = 'ready';
  }

  private newWall(z: number): Wall {
    const prev = this.walls[this.walls.length - 1]?.gap ?? 0;
    const span = Math.min(0.55, 0.3 + this.score * 0.02);
    let gap = prev + (Math.random() * 2 - 1) * span;
    gap = Math.max(FLOOR + GAP / 2 + 0.15, Math.min(CEIL - GAP / 2 - 0.15, gap));
    return { z, gap, passed: false, hue: Math.random() };
  }

  private flap(): void {
    if (this.state === 'paused') return;
    if (this.state === 'over') {
      if (this.stateT < 0.8) return;
      this.reset();
    }
    if (this.state === 'ready') this.state = 'play';
    this.vAlt = FLAP_V;
    this.flapT = 0;
    sfx.play('flap', 0.9 + Math.random() * 0.2);
  }

  action(id: string): void {
    switch (id) {
      case 'flap': case 'fire': case 'jump': this.flap(); break;
      case 'start': this.reset(); sfx.play('click'); this.host.say('Flap to start.'); break;
      case 'pause':
        if (this.state === 'play' || this.state === 'paused') this.state = this.state === 'paused' ? 'play' : 'paused';
        break;
      case 'exit': this.host.exit(); break;
      case 'mic': this.host.mic(); break;
    }
  }

  key(k: string): boolean {
    const map: Record<string, string> = { ' ': 'flap', ArrowUp: 'flap', w: 'flap', Enter: 'flap', n: 'start', p: 'pause', Escape: 'exit' };
    const a = map[k];
    if (!a) return false;
    this.action(a);
    return true;
  }

  pausedByHost(): void {
    if (this.state === 'play') this.state = 'paused';
  }

  protected tick(frames: PointerFrame[], now: number, dt: number): void {
    for (const f of frames) {
      const p = f.p;
      if (f.down) this.flap();
      if (p.gamepad && (p.gamepad.buttons[4]?.pressed || p.gamepad.buttons[5]?.pressed)) {
        // A / X: edge-trigger via flapT so holding doesn't machine-gun
        if (this.flapT > 0.25) this.flap();
      }
      // flap your arm: a quick downward hand movement also flaps
      if (p.kind === 'hand' && p.wrist) {
        const y = this.deskRoot.worldToLocal(p.wrist.clone()).y;
        const last = this.lastY.get(p.id);
        this.lastY.set(p.id, y);
        if (last !== undefined && dt > 0 && (last - y) / dt > 1.1 && this.flapT > 0.3) this.flap();
      }
    }
    this.eyeLocal(this.eye);
    this.flapT += dt;
    this.stateT += dt;

    if (this.state === 'play') {
      this.vAlt += GRAVITY * dt;
      this.alt += this.vAlt * dt;
      if (this.alt > CEIL - 0.1) { this.alt = CEIL - 0.1; this.vAlt = Math.min(0, this.vAlt); }
      this.speed = SPEED0 + Math.min(1.6, this.score * 0.06);
      for (const w of this.walls) {
        const before = w.z;
        w.z += this.speed * dt;
        // crossing your eye plane: inside the gap or crash
        if (before < WALL_D / 2 && w.z > -WALL_D / 2 && Math.abs(this.alt - w.gap) > GAP / 2 - 0.07) this.crash();
        if (!w.passed && w.z > WALL_D / 2) {
          w.passed = true;
          this.score++;
          sfx.play('coin');
          this.sparkles.burst(new Vector3(this.eye.x, this.eye.y + 0.05, this.eye.z - 0.5), 0xffd166, 10, 0.25);
          if (this.score % 10 === 0) { this.host.celebrate(); this.host.say(`${this.score}! Keep flapping!`); }
        }
      }
      if (this.walls[0] && this.walls[0].z > 1.5) {
        this.walls.shift();
        this.walls.push(this.newWall(this.walls[this.walls.length - 1].z - SPACING));
      }
      if (this.alt < FLOOR + 0.05) this.crash();
    } else if (this.state === 'ready') {
      this.alt = Math.sin(now / 500) * 0.04; // gentle hover while you get ready
    } else if (this.state === 'over') {
      this.vAlt += GRAVITY * dt;
      this.alt = Math.max(FLOOR + 0.05, this.alt + this.vAlt * dt);
    }
    // smooth what you see so a flap never jerks the world
    this.shown += (this.alt - this.shown) * Math.min(1, dt * 18);
    this.world.position.set(this.eye.x, this.eye.y - this.shown, this.eye.z);
    if (this.state === 'play') {
      for (let i = 0; i < 240; i++) {
        this.cloudPos[i * 3 + 2] += this.speed * dt;
        if (this.cloudPos[i * 3 + 2] > 1) this.resetCloud(i);
      }
      (this.clouds.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    }
    // wind rush rises with your speed and dive
    sfx.loop('wind', this.state === 'play' ? 0.25 + Math.min(0.5, Math.abs(this.vAlt) * 0.15) : 0, 500 + this.speed * 200);
    this.draw(now);
    this.sparkles.update(dt);
    this.panel(FLAPBRO_NAME.toUpperCase(), [['SCORE', String(this.score)], ['BEST', String(Math.max(this.best, this.score))], ['SPEED', `${this.speed.toFixed(1)} m/s`]],
      this.state === 'ready' ? 'FLAP TO START' : this.state === 'over' ? 'BONK! FLAP TO RETRY' : this.state === 'paused' ? 'PAUSED' : '');
  }

  private crash(): void {
    if (this.state !== 'play') return;
    this.state = 'over';
    this.stateT = 0;
    this.vAlt = 0;
    sfx.play('thud');
    sfx.play('gameover');
    this.sparkles.burst(new Vector3(this.eye.x, this.eye.y, this.eye.z - 0.3), 0xffffff, 30, 0.4);
    const rec = this.saveBest(this.score);
    if (rec && this.score > 0) this.host.celebrate();
    this.host.say(rec && this.score > 0 ? `Bonk! New best: ${this.score}. Flap to go again.` : `Bonk! ${this.score}. Flap to go again.`);
  }

  private draw(now: number): void {
    let n = 0;
    for (const w of this.walls) {
      if (w.z < FAR) continue;
      this.tmpC.setHSL((w.hue * 0.25 + 0.3) % 1, 0.65, 0.5);
      for (const top of [true, false]) {
        const y = top ? w.gap + GAP / 2 + WALL_H / 2 : w.gap - GAP / 2 - WALL_H / 2;
        this.tmpM.makeTranslation(0, y, w.z);
        this.wallMesh.setMatrixAt(n, this.tmpM);
        this.wallMesh.setColorAt(n, this.tmpC);
        this.tmpM.makeTranslation(0, top ? w.gap + GAP / 2 + 0.04 : w.gap - GAP / 2 - 0.04, w.z);
        this.rimMesh.setMatrixAt(n, this.tmpM);
        this.rimMesh.setColorAt(n, this.tmpC.clone().offsetHSL(0, 0, 0.25));
        n++;
      }
    }
    for (const m of [this.wallMesh, this.rimMesh]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    // wings flap at the edges of your view; beak points ahead just below your eyes
    const beat = this.flapT < 0.3 ? Math.sin((this.flapT / 0.3) * Math.PI) : 0;
    const idle = Math.sin(now / 260) * 0.08;
    this.wings.forEach((w, i) => {
      const side = i === 0 ? -1 : 1;
      w.position.set(this.eye.x + side * 0.16, this.eye.y - 0.2, this.eye.z - 0.32);
      w.rotation.set(-0.3, side * 0.35, side * (-0.5 + beat * 1.1 + idle));
    });
    const beak = this.root.getObjectByName('beak')!;
    beak.position.set(this.eye.x, this.eye.y - 0.13, this.eye.z - 0.26);
  }

  /** test hooks */
  debugState() {
    return { state: this.state, score: this.score, alt: this.alt, walls: this.walls.map((w) => [Number(w.z.toFixed(2)), Number(w.gap.toFixed(2))]) };
  }
  /** put the next wall's gap exactly where you are (e2e) */
  debugAlign(): void {
    for (const w of this.walls) w.gap = this.alt;
  }
}

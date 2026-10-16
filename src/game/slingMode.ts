/**
 * Sling mode: a slingshot physics puzzle on the desk (original characters: glowing "pebbles"
 * knock over block towers to pop the purple "gloomlings" hiding in them).
 *
 * The arena is simulated at full size with cannon-es (1 m blocks) and rendered at 1:10 on the
 * table, so physics looks weighty while staying within seated reach.
 *
 * Hands: pinch (anywhere, or right on the pebble) and pull back toward you, release to fire.
 * Controller: trigger works the same way. Dock: turn arena left/right, zoom, retry, next level.
 * Desktop: left-drag pulls (mouse wheel while pulling raises the aim), right-drag orbits the camera.
 */
import * as CANNON from 'cannon-es';
import {
  CircleGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  BoxGeometry,
  CanvasTexture,
  SRGBColorSpace,
  Vector3,
  type Object3D,
} from 'three';
import { sfx } from '../audio/sfx.js';
import { bevelTexture } from '../blocks/voxelRenderer.js';
import { Dock, SLING_LAYOUT, type DockAction } from '../ui/dock.js';
import { Sparkles } from '../fx/sparkles.js';
import type { Pointer } from '../hands/handInput.js';
import { LEVELS, type BirdKind, type BlockMat, type LevelDef } from './slingLevels.js';
import { BIRD, GROUND_X, GROUND_Z0, GROUND_Z1, MAT, createLevelBodies, createWorld } from './slingPhysics.js';

const RENDER_SCALE = 0.1; // arena metres -> desk metres
const LAUNCH = new Vector3(0, 0.9, 1.6); // pouch rest position (arena units)
const FORK_HALF = 0.28;
const MAX_PULL = 1.25; // arena units (12.5 cm on the desk)
const MAX_SPEED = 10.5; // m/s at full pull
const PROGRESS_KEY = 'naga-atelier:sling-progress:v1';

interface Block {
  body: CANNON.Body;
  mat: BlockMat;
  size: Vector3;
  hp: number;
  alive: boolean;
}
interface Target {
  body: CANNON.Body;
  r: number;
  hp: number;
  alive: boolean;
}

type State = 'aiming' | 'flying' | 'settling' | 'won' | 'lost';

export interface SlingHost {
  say(text: string): void;
  celebrate(): void;
  exit(): void;
  mic(): void;
}

export class SlingMode {
  readonly root = new Group();
  readonly dock = new Dock(SLING_LAYOUT);
  /** physics space, rendered at 1:10; rotate/zoom this to view from other angles */
  private arena = new Group();
  private world = createWorld();
  private blocks: Block[] = [];
  private targets: Target[] = [];
  private bird: CANNON.Body | null = null;
  private birdKind: BirdKind = 'pebble';
  private birdsLeft: BirdKind[] = [];
  private level: LevelDef = LEVELS[0];
  private levelIndex = 0;
  state: State = 'aiming';
  score = 0;
  private stateT = 0;
  private damageOn = false;
  private elapsed = 0;
  private acc = 0;
  private yaw = 0;
  private zoom = 1.15;
  private pull: { id: number; start: Vector3; pouch: Vector3; aimLift: number } | null = null;
  private wasPinching = new Map<number, boolean>();
  private progress: Record<number, number> = {};
  private trailT = 0;

  // visuals
  private blockMeshes: Record<BlockMat, InstancedMesh>;
  private targetMesh: InstancedMesh;
  private eyeMesh: InstancedMesh;
  private pupilMesh: InstancedMesh;
  private birdMesh: Mesh;
  private pouch: Mesh;
  private bands: Mesh[] = [];
  private forkTips: Vector3[];
  private dots: InstancedMesh;
  private sparkles: Sparkles;
  private panel: { canvas: HTMLCanvasElement; tex: CanvasTexture; last: string };
  private tmpM = new Matrix4();
  private tmpQ = new Quaternion();
  private tmpV = new Vector3();
  private tmpS = new Vector3();

  constructor(private deskRoot: Object3D, shadows: boolean, private host: SlingHost) {
    this.root.name = 'sling';
    this.root.visible = false;
    deskRoot.add(this.root);
    this.root.add(this.arena, this.dock.root);
    this.arena.scale.setScalar(RENDER_SCALE);

    // ground mat (marks the arena on the real table)
    const mat = new Mesh(
      new PlaneGeometry(GROUND_X * 2, GROUND_Z1 - GROUND_Z0),
      new MeshBasicMaterial({ color: 0x2a3d2a, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(0, 0.005, (GROUND_Z0 + GROUND_Z1) / 2);
    this.arena.add(mat);

    // instanced blocks per material
    const unit = new BoxGeometry(1, 1, 1);
    this.blockMeshes = {} as Record<BlockMat, InstancedMesh>;
    for (const m of ['glass', 'wood', 'stone'] as BlockMat[]) {
      const cfg = MAT[m];
      const material = new MeshStandardMaterial({
        color: cfg.color, roughness: cfg.rough, metalness: m === 'glass' ? 0.1 : 0,
        map: m === 'glass' ? null : bevelTexture(), transparent: cfg.opacity < 1, opacity: cfg.opacity,
        depthWrite: cfg.opacity >= 1,
      });
      const im = new InstancedMesh(unit, material, 160);
      im.count = 0;
      im.castShadow = shadows && m !== 'glass';
      im.receiveShadow = shadows;
      im.frustumCulled = false;
      this.arena.add(im);
      this.blockMeshes[m] = im;
    }
    // gloomlings: purple blobs with big eyes
    this.targetMesh = new InstancedMesh(new IcosahedronGeometry(1, 2), new MeshStandardMaterial({ color: 0x8a5cf6, roughness: 0.5, emissive: 0x24104a }), 24);
    this.eyeMesh = new InstancedMesh(new SphereGeometry(1, 12, 10), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), 48);
    this.pupilMesh = new InstancedMesh(new SphereGeometry(1, 10, 8), new MeshBasicMaterial({ color: 0x111122 }), 48);
    for (const im of [this.targetMesh, this.eyeMesh, this.pupilMesh]) {
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = shadows;
      this.arena.add(im);
    }

    // slingshot
    const wood = new MeshStandardMaterial({ color: 0x7a5233, roughness: 0.8 });
    const stem = new Mesh(new CylinderGeometry(0.06, 0.08, 0.6, 10), wood);
    stem.position.set(0, 0.3, LAUNCH.z + 0.05);
    const armL = new Mesh(new CylinderGeometry(0.045, 0.06, 0.45, 10), wood);
    armL.position.set(-FORK_HALF / 2 - 0.02, 0.78, LAUNCH.z + 0.05);
    armL.rotation.z = 0.5;
    const armR = armL.clone();
    armR.position.x *= -1;
    armR.rotation.z = -0.5;
    this.forkTips = [new Vector3(-FORK_HALF, 0.98, LAUNCH.z + 0.05), new Vector3(FORK_HALF, 0.98, LAUNCH.z + 0.05)];
    const base = new Mesh(new CircleGeometry(0.22, 24), new MeshBasicMaterial({ color: 0x3a2a1a, transparent: true, opacity: 0.6 }));
    base.rotation.x = -Math.PI / 2;
    base.position.set(0, 0.01, LAUNCH.z + 0.05);
    this.arena.add(stem, armL, armR, base);
    const bandMat = new MeshStandardMaterial({ color: 0x2b1a12, roughness: 0.6 });
    for (let i = 0; i < 2; i++) {
      const b = new Mesh(new CylinderGeometry(0.025, 0.025, 1, 6), bandMat);
      this.bands.push(b);
      this.arena.add(b);
    }
    this.pouch = new Mesh(new BoxGeometry(0.22, 0.1, 0.14), bandMat);
    this.arena.add(this.pouch);

    this.birdMesh = new Mesh(new SphereGeometry(1, 24, 16), new MeshStandardMaterial({ color: BIRD.pebble.color, emissive: 0x0d3b3a, roughness: 0.35 }));
    this.birdMesh.castShadow = shadows;
    // a little face so it reads as a character
    const eyeW = new MeshStandardMaterial({ color: 0xffffff });
    const eyeB = new MeshBasicMaterial({ color: 0x0b1320 });
    for (const sx of [-1, 1]) {
      const e = new Mesh(new SphereGeometry(0.28, 10, 8), eyeW);
      e.position.set(sx * 0.35, 0.25, -0.8);
      const pu = new Mesh(new SphereGeometry(0.13, 8, 6), eyeB);
      pu.position.set(sx * 0.35, 0.25, -1.04);
      this.birdMesh.add(e, pu);
    }
    this.arena.add(this.birdMesh);

    // trajectory preview dots
    this.dots = new InstancedMesh(new SphereGeometry(0.045, 8, 6), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }), 28);
    this.dots.count = 0;
    this.dots.frustumCulled = false;
    this.arena.add(this.dots);

    this.sparkles = new Sparkles(this.arena);

    // score panel (desk space, to the right)
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 384;
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const panelMesh = new Mesh(new PlaneGeometry(0.2, 0.15), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    panelMesh.position.set(0.36, 0.2, -0.12);
    panelMesh.rotation.y = -0.45;
    panelMesh.renderOrder = 12;
    this.root.add(panelMesh);
    this.panel = { canvas, tex, last: '' };

    try {
      this.progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}') ?? {};
    } catch {
      this.progress = {};
    }
  }

  // ----------------------------------------------------------------- lifecycle

  enter(): void {
    this.root.visible = true;
    // start from the first level without 3 stars
    const i = LEVELS.findIndex((l) => (this.progress[l.id] ?? 0) < 3);
    this.load(i < 0 ? 0 : i);
    this.host.say(`Sling mode! Pinch and pull back to launch. Level ${this.level.id}: ${this.level.name}.`);
  }

  exit(): void {
    this.root.visible = false;
    this.pull = null;
    this.clearWorld();
  }

  private clearWorld(): void {
    for (const b of this.blocks) this.world.removeBody(b.body);
    for (const t of this.targets) this.world.removeBody(t.body);
    if (this.bird) this.world.removeBody(this.bird);
    this.blocks = [];
    this.targets = [];
    this.bird = null;
  }

  load(index: number): void {
    this.clearWorld();
    this.levelIndex = (index + LEVELS.length) % LEVELS.length;
    this.level = LEVELS[this.levelIndex];
    this.score = 0;
    this.birdsLeft = [...this.level.birds];
    const made = createLevelBodies(this.world, this.level);
    for (const m of made.blocks) {
      const blk: Block = { body: m.body, mat: m.mat, size: new Vector3(...m.size), hp: MAT[m.mat].hp, alive: true };
      m.body.addEventListener('collide', (e: { body: CANNON.Body; contact: CANNON.ContactEquation }) => this.onHit(blk, e));
      this.blocks.push(blk);
    }
    for (const m of made.targets) {
      const tg: Target = { body: m.body, r: m.r, hp: 4, alive: true };
      m.body.addEventListener('collide', (e: { body: CANNON.Body; contact: CANNON.ContactEquation }) => this.onHit(tg, e));
      this.targets.push(tg);
    }
    this.damageOn = false;
    this.elapsed = 0;
    this.nextBird();
  }

  private nextBird(): void {
    if (this.bird) {
      this.world.removeBody(this.bird);
      this.bird = null;
    }
    const kind = this.birdsLeft.shift();
    if (!kind) return;
    this.birdKind = kind;
    this.state = 'aiming';
    this.stateT = 0;
    const cfg = BIRD[kind];
    (this.birdMesh.material as MeshStandardMaterial).color.setHex(cfg.color);
    this.birdMesh.scale.setScalar(cfg.r);
    this.birdMesh.visible = true;
  }

  // ----------------------------------------------------------------- actions

  action(a: DockAction): void {
    switch (a) {
      case 'retry': this.load(this.levelIndex); this.host.say(`Level ${this.level.id}: ${this.level.name}.`); sfx.play('click'); break;
      case 'next': this.load(this.levelIndex + 1); this.host.say(`Level ${this.level.id}: ${this.level.name}.`); sfx.play('click'); break;
      case 'turnL': this.yaw += Math.PI / 4; sfx.play('click'); break;
      case 'turnR': this.yaw -= Math.PI / 4; sfx.play('click'); break;
      case 'zoom': this.zoom = this.zoom < 1.5 ? 1.8 : 1.15; sfx.play('click'); break;
      case 'exit': this.host.exit(); break;
      case 'mic': this.host.mic(); break;
      default: break;
    }
  }

  key(k: string): boolean {
    const map: Record<string, DockAction> = { r: 'retry', n: 'next', q: 'turnL', e: 'turnR', z: 'zoom', Escape: 'exit' };
    const a = map[k];
    if (!a) return false;
    this.action(a);
    return true;
  }

  // ----------------------------------------------------------------- physics feedback

  private onHit(obj: Block | Target, e: { body: CANNON.Body; contact: CANNON.ContactEquation }): void {
    if (!this.damageOn || !obj.alive) return;
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v < 0.9) return;
    const other = e.body;
    const m = other.mass > 0 ? Math.min(other.mass, 14) : 6;
    const dmg = (v - 0.9) * m * 0.9;
    obj.hp -= dmg;
    if (v > 2.2) sfx.play('lock');
    if (obj.hp <= 0) this.destroy(obj);
  }

  private destroy(obj: Block | Target): void {
    if (!obj.alive) return;
    obj.alive = false;
    const p = obj.body.position;
    const at = new Vector3(p.x, p.y, p.z);
    // remove after the current step (cannon dislikes removal inside collide callbacks)
    queueMicrotask(() => this.world.removeBody(obj.body));
    for (const b of this.world.bodies) b.wakeUp();
    if ('mat' in obj) {
      this.score += MAT[obj.mat].points;
      this.sparkles.burst(at, MAT[obj.mat].color, obj.mat === 'glass' ? 22 : 14, 2.5);
      sfx.play(obj.mat === 'glass' ? 'clear' : 'delete', obj.mat === 'stone' ? 0.7 : 1);
    } else {
      this.score += 5000;
      this.sparkles.burst(at, 0xb48cff, 40, 3.5);
      this.sparkles.ring(at, 0xd9c2ff, 1.4);
      sfx.play('bigclear');
      this.host.celebrate();
      if (this.targets.every((t) => !t.alive)) this.win();
    }
  }

  private win(): void {
    if (this.state === 'won') return;
    const bonus = this.birdsLeft.length * 10000;
    this.score += bonus;
    const [two, three] = this.level.stars;
    const stars = this.score >= three ? 3 : this.score >= two ? 2 : 1;
    this.progress[this.level.id] = Math.max(this.progress[this.level.id] ?? 0, stars);
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(this.progress));
    } catch {
      /* ignore */
    }
    this.state = 'won';
    this.stateT = 0;
    sfx.play('levelup');
    this.host.say(`Level cleared! ${stars} star${stars > 1 ? 's' : ''}, ${this.score} points. Tap next.`);
  }

  // ----------------------------------------------------------------- per frame

  update(pointers: Pointer[], now: number, dt: number): void {
    if (!this.root.visible) return;
    // arena orientation / zoom (smooth)
    this.arena.rotation.y += (this.yaw - this.arena.rotation.y) * Math.min(1, dt * 8);
    const sc = RENDER_SCALE * this.zoom;
    this.arena.scale.setScalar(this.arena.scale.x + (sc - this.arena.scale.x) * Math.min(1, dt * 8));
    this.handlePointers(pointers, now);

    // fixed-step physics
    this.acc += Math.min(dt, 0.05);
    while (this.acc >= 1 / 60) {
      this.world.step(1 / 60);
      this.acc -= 1 / 60;
      this.elapsed += 1 / 60;
    }

    // fell off the table
    for (const t of this.targets) if (t.alive && t.body.position.y < -0.6) this.destroy(t);
    for (const b of this.blocks) if (b.alive && b.body.position.y < -0.6) this.destroy(b);

    this.stateT += dt;
    if (this.state === 'flying' && this.bird) {
      const v = this.bird.velocity.length();
      this.trailT += dt;
      if (this.trailT > 0.04) {
        this.trailT = 0;
        const bp = this.bird.position;
        this.sparkles.burst(new Vector3(bp.x, bp.y, bp.z), BIRD[this.birdKind].color, 2, 0.3);
      }
      if ((v < 0.25 && this.stateT > 1) || this.stateT > 7 || this.bird.position.y < -0.6) {
        this.state = 'settling';
        this.stateT = 0;
      }
    } else if (this.state === 'settling' && this.stateT > 1.5) {
      if (this.targets.every((t) => !t.alive)) this.win();
      else if (this.birdsLeft.length) this.nextBird();
      else {
        this.state = 'lost';
        this.stateT = 0;
        sfx.play('gameover');
        const left = this.targets.filter((t) => t.alive).length;
        this.host.say(`Out of pebbles — ${left} gloomling${left > 1 ? 's' : ''} left. Tap retry.`);
      }
    }
    this.render(dt);
  }

  private handlePointers(pointers: Pointer[], now: number): void {
    const tips = new Map<number, Vector3>();
    for (const p of pointers) {
      const was = this.wasPinching.get(p.id) ?? false;
      this.wasPinching.set(p.id, p.active && p.pinching);
      if (!p.active) {
        if (this.pull?.id === p.id) this.pull = null;
        continue;
      }
      const deskLocal = this.deskRoot.worldToLocal(p.pinchPoint.clone());
      const local = this.arena.worldToLocal(p.pinchPoint.clone());
      if (p.indexTip && !p.pinching && p.kind !== 'mouse' && this.pull?.id !== p.id) tips.set(p.id, this.deskRoot.worldToLocal(p.indexTip.clone()));
      const down = p.pinching && !was, up = !p.pinching && was;
      if (down) {
        const hit = this.dock.hitTest(deskLocal, 0.012);
        if (hit) {
          this.dock.flash(hit, now);
          this.action(hit);
          continue;
        }
        if (this.state === 'won' || this.state === 'lost') continue;
        if (this.state === 'aiming' && !this.pull) {
          this.pull = { id: p.id, start: local.clone(), pouch: LAUNCH.clone(), aimLift: 0 };
          sfx.play('pickup');
        }
        continue;
      }
      if (this.pull?.id !== p.id) continue;
      if (up) {
        this.release();
        continue;
      }
      if (p.kind === 'hand' && p.strength < 0.75) continue;
      // relative pull, clamped to a cone behind the launcher
      const d = local.clone().sub(this.pull.start);
      if (p.kind === 'mouse') d.y = -0.55 * Math.hypot(d.x, d.z) - this.pull.aimLift;
      d.z = Math.max(-0.1, d.z);
      if (d.length() > MAX_PULL) d.setLength(MAX_PULL);
      const prev = this.pull.pouch.distanceTo(LAUNCH);
      this.pull.pouch.copy(LAUNCH).add(d);
      const cur = this.pull.pouch.distanceTo(LAUNCH);
      if (Math.floor(cur * 6) > Math.floor(prev * 6)) sfx.play('tick');
    }
    for (const a of this.dock.updatePokes(tips, now)) this.action(a);
  }

  /** Desktop: raise/lower the aim while pulling with the mouse. */
  wheel(delta: number): boolean {
    if (!this.pull) return false;
    this.pull.aimLift = Math.max(-0.6, Math.min(0.8, this.pull.aimLift + Math.sign(delta) * 0.08));
    return true;
  }

  private launchVelocity(): Vector3 | null {
    if (!this.pull) return null;
    const d = LAUNCH.clone().sub(this.pull.pouch);
    const len = d.length();
    if (len < 0.15) return null;
    return d.normalize().multiplyScalar((len / MAX_PULL) * MAX_SPEED);
  }

  private release(): void {
    const vel = this.launchVelocity();
    const from = this.pull!.pouch.clone();
    this.pull = null;
    if (!vel || this.state !== 'aiming') {
      sfx.play('click');
      return;
    }
    const cfg = BIRD[this.birdKind];
    const body = new CANNON.Body({
      mass: cfg.mass,
      shape: new CANNON.Sphere(cfg.r),
      position: new CANNON.Vec3(from.x, from.y, from.z),
      velocity: new CANNON.Vec3(vel.x, vel.y, vel.z),
      linearDamping: 0.01,
      angularDamping: 0.2,
    });
    this.world.addBody(body);
    this.bird = body;
    this.state = 'flying';
    this.stateT = 0;
    this.damageOn = true;
    sfx.play('cast');
  }

  // ----------------------------------------------------------------- rendering

  private render(dt: number): void {
    // blocks
    const counts: Record<BlockMat, number> = { glass: 0, wood: 0, stone: 0 };
    for (const b of this.blocks) {
      if (!b.alive) continue;
      const im = this.blockMeshes[b.mat];
      const p = b.body.position, q = b.body.quaternion;
      this.tmpM.compose(this.tmpV.set(p.x, p.y, p.z), this.tmpQ.set(q.x, q.y, q.z, q.w), b.size);
      im.setMatrixAt(counts[b.mat]++, this.tmpM);
    }
    for (const m of ['glass', 'wood', 'stone'] as BlockMat[]) {
      this.blockMeshes[m].count = counts[m];
      this.blockMeshes[m].instanceMatrix.needsUpdate = true;
    }
    // targets (+ eyes that wobble with the body)
    let ti = 0, ei = 0;
    const off = new Matrix4();
    for (const t of this.targets) {
      if (!t.alive) continue;
      const p = t.body.position, q = t.body.quaternion;
      const squish = 1 + 0.04 * Math.sin(performance.now() / 180 + ti);
      this.tmpM.compose(this.tmpV.set(p.x, p.y, p.z), this.tmpQ.set(q.x, q.y, q.z, q.w), this.tmpS.set(t.r, t.r * squish, t.r));
      this.targetMesh.setMatrixAt(ti++, this.tmpM);
      for (const sx of [-1, 1]) {
        // eyes always face the launcher so the gloomlings "watch" you
        const base = new Matrix4().compose(this.tmpV.set(p.x, p.y, p.z), new Quaternion(), new Vector3(1, 1, 1));
        off.compose(new Vector3(sx * t.r * 0.38, t.r * 0.3, t.r * 0.82), new Quaternion(), new Vector3(t.r * 0.3, t.r * 0.3, t.r * 0.3));
        this.eyeMesh.setMatrixAt(ei, base.clone().multiply(off));
        off.compose(new Vector3(sx * t.r * 0.38, t.r * 0.3, t.r * 1.05), new Quaternion(), new Vector3(t.r * 0.14, t.r * 0.14, t.r * 0.14));
        this.pupilMesh.setMatrixAt(ei++, base.multiply(off));
      }
    }
    this.targetMesh.count = ti;
    this.eyeMesh.count = this.pupilMesh.count = ei;
    for (const im of [this.targetMesh, this.eyeMesh, this.pupilMesh]) im.instanceMatrix.needsUpdate = true;

    // bird + pouch + bands
    const pouchPos = this.pull ? this.pull.pouch : LAUNCH;
    if (this.state === 'aiming') {
      this.birdMesh.visible = true;
      this.birdMesh.position.copy(pouchPos).add(new Vector3(0, BIRD[this.birdKind].r * 0.6, 0));
      this.birdMesh.rotation.set(0, 0, 0);
    } else if (this.bird) {
      const p = this.bird.position, q = this.bird.quaternion;
      this.birdMesh.position.set(p.x, p.y, p.z);
      this.birdMesh.quaternion.set(q.x, q.y, q.z, q.w);
    } else this.birdMesh.visible = false;
    this.pouch.position.copy(pouchPos);
    this.bands.forEach((band, i) => {
      const a = this.forkTips[i], b = pouchPos;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const dir = b.clone().sub(a);
      band.position.copy(mid);
      band.scale.set(1, Math.max(0.01, dir.length()), 1);
      band.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
    });

    // trajectory preview
    const v = this.state === 'aiming' ? this.launchVelocity() : null;
    if (v) {
      let n = 0;
      for (let i = 1; i <= 28; i++) {
        const t = i * 0.06;
        const x = pouchPos.x + v.x * t, y = pouchPos.y + v.y * t - 0.5 * 9.82 * t * t, z = pouchPos.z + v.z * t;
        if (y < 0) break;
        this.tmpM.makeTranslation(x, y, z);
        this.dots.setMatrixAt(n++, this.tmpM);
      }
      this.dots.count = n;
      this.dots.instanceMatrix.needsUpdate = true;
    } else this.dots.count = 0;

    this.sparkles.update(dt);
    this.drawPanel();
  }

  private drawPanel(): void {
    const stars = this.progress[this.level.id] ?? 0;
    const sig = `${this.level.id}|${this.score}|${this.birdsLeft.length}|${this.state}|${stars}|${this.targets.filter((t) => t.alive).length}`;
    if (sig === this.panel.last) return;
    this.panel.last = sig;
    const c = this.panel.canvas.getContext('2d')!;
    c.clearRect(0, 0, 512, 384);
    c.fillStyle = 'rgba(10,18,28,0.78)';
    c.beginPath();
    c.roundRect(8, 8, 496, 368, 36);
    c.fill();
    c.fillStyle = '#ffd166';
    c.font = '700 34px system-ui, sans-serif';
    c.fillText(`LEVEL ${this.level.id} · ${this.level.name}`, 36, 62);
    c.fillStyle = '#eafcff';
    c.font = '800 72px system-ui, sans-serif';
    c.fillText(String(this.score), 36, 150);
    // pebbles left (+ the one in the pouch)
    const left = this.birdsLeft.length + (this.state === 'aiming' ? 1 : 0);
    for (let i = 0; i < left; i++) {
      c.fillStyle = '#58d6c8';
      c.beginPath();
      c.arc(52 + i * 46, 210, 16, 0, Math.PI * 2);
      c.fill();
    }
    const gl = this.targets.filter((t) => t.alive).length;
    c.fillStyle = '#b48cff';
    c.font = '600 30px system-ui, sans-serif';
    c.fillText(`gloomlings left: ${gl}`, 36, 278);
    for (let i = 0; i < 3; i++) drawStar(c, 330 + i * 52, 330, 20, i < stars ? '#ffd166' : 'rgba(255,255,255,0.18)');
    if (this.state === 'won' || this.state === 'lost') {
      c.fillStyle = this.state === 'won' ? '#8ff0a4' : '#ff8a8a';
      c.font = '800 40px system-ui, sans-serif';
      c.fillText(this.state === 'won' ? 'CLEARED!' : 'TRY AGAIN', 36, 344);
    }
    this.panel.tex.needsUpdate = true;
  }

  /** test hooks */
  debugState() {
    return {
      level: this.level.id, state: this.state, score: this.score, birdsLeft: this.birdsLeft.length,
      targets: this.targets.filter((t) => t.alive).length, blocks: this.blocks.filter((b) => b.alive).length,
      bird: this.bird ? [this.bird.position.x, this.bird.position.y, this.bird.position.z] : null,
    };
  }
  /** test hook: launch directly with a pull vector (arena units) */
  debugLaunch(pull: [number, number, number]): void {
    if (this.state !== 'aiming') return;
    this.pull = { id: -1, start: new Vector3(), pouch: LAUNCH.clone().add(new Vector3(...pull)), aimLift: 0 };
    this.release();
  }
  /** test hook: arena-space point -> world */
  arenaToWorld(x: number, y: number, z: number): number[] {
    return this.arena.localToWorld(new Vector3(x, y, z)).toArray();
  }
}

function drawStar(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + (i * Math.PI) / 5;
    c.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}


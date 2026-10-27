/**
 * Mike Penguin — a first-person ice run. You are a penguin racing down a three-lane ice road:
 * hop over holes and cracks, dodge seals, scoop up fish, and reach each flag before the clock runs out.
 * You never move: the road rushes toward you and slides sideways when you change lane.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Object3D,
} from 'three';
import { sfx } from '../audio/sfx.js';
import { Sparkles, dotTexture } from '../fx/sparkles.js';
import { PENGUIN_LAYOUT } from '../ui/dock.js';
import { PENGUIN_PAD } from '../ui/screenPad.js';
import { GameBase, type GameHost, type PointerFrame } from './gameBase.js';
import { mulberry32 } from './marbleMaze.js';

const LANE = 0.7;
const ROAD_DROP = 0.62; // road surface below your eyes
const FAR = -40;
const STAGE_M = 420;
/** time to reach each flag: generous for the warm-up first stage, tighter after */
const STAGE_TIME = 65;
/** fewer flakes streaming past = less peripheral motion (comfort) */
const SNOW = 110;
const JUMP_V = 2.6, G = -9;

type ObKind = 'hole' | 'crack' | 'seal' | 'fish';
interface Ob {
  kind: ObKind;
  lane: number; // -1, 0, 1 (crack spans all)
  z: number;
  hit: boolean;
}

export class MikePenguin extends GameBase {
  override readonly firstPerson = true;
  private world = new Group();
  private road: Mesh;
  private stripes: InstancedMesh;
  private banks: InstancedMesh;
  private holeMesh: InstancedMesh;
  private crackMesh: InstancedMesh;
  private sealMesh: InstancedMesh;
  private fishMesh: InstancedMesh;
  private flag = new Group();
  private flippers: Mesh[] = [];
  private beak: Mesh;
  private snow: Points;
  private snowPos = new Float32Array(SNOW * 3);
  private sparkles: Sparkles;
  private obs: Ob[] = [];
  private lane = 0;
  private laneShown = 0;
  private jumpY = 0;
  private jumpV = 0;
  private speed = 0;
  private dist = 0;
  private nextSpawn = 0;
  private stage = 1;
  private timeLeft = STAGE_TIME;
  private fish = 0;
  private score = 0;
  private stumble = 0;
  private slow = false;
  private state: 'ready' | 'play' | 'over' | 'paused' | 'flag' = 'ready';
  private stateT = 0;
  private rnd = mulberry32(5);
  private eye = new Vector3();
  private gest = new Map<number, { x: number; y: number; t: number; moved: boolean }>();
  /** per controller: a stick push must return to centre before it moves another lane */
  private stickArmed = new Map<number, boolean>();
  /** body steering: arms left / centre / right pick the lane, both arms up = jump */
  private pendingZone = 0;
  private appliedZone = 0;
  private zoneSince = 0;
  private calmSince = 0;
  private jumpArmed = true;
  private tmpM = new Matrix4();
  private tmpQ = new Quaternion();
  private scrollZ = 0;
  private landed = true;

  constructor(deskRoot: Object3D, host: GameHost) {
    super(deskRoot, host, PENGUIN_LAYOUT, PENGUIN_PAD, 'naga-atelier:penguin-best:v1', 'penguin');
    this.root.add(this.world);
    this.road = new Mesh(new PlaneGeometry(LANE * 3 + 0.3, -FAR + 2), new MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.15, metalness: 0.1, emissive: 0x16324a }));
    this.road.rotation.x = -Math.PI / 2;
    this.road.position.set(0, 0, FAR / 2 + 1);
    this.world.add(this.road);
    this.stripes = new InstancedMesh(new PlaneGeometry(0.04, 1.2).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }), 80);
    this.banks = new InstancedMesh(new BoxGeometry(0.5, 0.5, 2.8), new MeshStandardMaterial({ color: 0xf4fbff, roughness: 0.9 }), 40);
    this.holeMesh = new InstancedMesh(new CircleGeometry(0.3, 24).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0x0a2740 }), 20);
    this.crackMesh = new InstancedMesh(new BoxGeometry(LANE * 3 + 0.3, 0.01, 0.45), new MeshBasicMaterial({ color: 0x0b2236 }), 8);
    this.sealMesh = new InstancedMesh(new SphereGeometry(0.22, 18, 12).scale(1, 0.9, 1.4), new MeshStandardMaterial({ color: 0x6f7f8f, roughness: 0.6 }), 20);
    this.fishMesh = new InstancedMesh(new ConeGeometry(0.06, 0.2, 10).rotateZ(Math.PI / 2), new MeshStandardMaterial({ color: 0xff9f43, emissive: 0x552200, metalness: 0.3 }), 30);
    for (const m of [this.stripes, this.banks, this.holeMesh, this.crackMesh, this.sealMesh, this.fishMesh]) {
      m.frustumCulled = false;
      m.count = 0;
      this.world.add(m);
    }
    // finish flag for each stage
    const pole = new Mesh(new CylinderGeometry(0.02, 0.02, 1.4, 8), new MeshStandardMaterial({ color: 0xffffff }));
    pole.position.y = 0.7;
    const cloth = new Mesh(new PlaneGeometry(0.5, 0.32), new MeshStandardMaterial({ color: 0xff5f7a, side: DoubleSide, emissive: 0x401020 }));
    cloth.position.set(0.25, 1.22, 0);
    const banner = new Mesh(new BoxGeometry(LANE * 3 + 0.6, 0.08, 0.08), new MeshBasicMaterial({ color: 0xffd166 }));
    banner.position.set(0, 1.45, 0);
    for (const x of [-(LANE * 1.5 + 0.25), LANE * 1.5 + 0.25]) {
      const p = pole.clone();
      p.position.x = x;
      this.flag.add(p);
      const c = cloth.clone();
      c.position.x = x + 0.25;
      this.flag.add(c);
    }
    this.flag.add(banner);
    this.world.add(this.flag);
    // snowfall
    for (let i = 0; i < SNOW; i++) this.resetSnow(i, true);
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(this.snowPos, 3));
    this.snow = new Points(sg, new PointsMaterial({ size: 0.03, map: dotTexture(), color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, blending: AdditiveBlending }));
    this.snow.frustumCulled = false;
    this.world.add(this.snow);
    // you: two flippers and a beak at the bottom of your view
    for (let i = 0; i < 2; i++) {
      const f = new Mesh(new SphereGeometry(0.05, 14, 10).scale(0.45, 1.8, 0.8), new MeshStandardMaterial({ color: 0x1d2633, roughness: 0.5 }));
      this.flippers.push(f);
      this.root.add(f);
    }
    this.beak = new Mesh(new ConeGeometry(0.022, 0.06, 12).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: 0xffc94a, emissive: 0x443000 }));
    this.root.add(this.beak);
    this.sparkles = new Sparkles(this.root);
    this.panelMesh.position.set(0.3, 0.52, 0.02);
    this.panelMesh.rotation.y = -0.55;
    this.helpMesh.position.set(-0.32, 0.5, 0.02);
    this.helpMesh.rotation.y = 0.55;
  }

  protected override musicOn(): boolean {
    return this.state === 'play' || this.state === 'flag' || this.state === 'ready';
  }
  protected override musicTempo(): number {
    return this.stage + (this.timeLeft < 10 ? 3 : 0);
  }

  private resetSnow(i: number, anywhere = false): void {
    this.snowPos.set([(Math.random() - 0.5) * 6, Math.random() * 2.5, anywhere ? FAR + Math.random() * -FAR : FAR], i * 3);
  }

  protected start(): void {
    this.reset();
    this.host.say('Mike Penguin! Lean your arms left or right to change lane, raise both arms to jump. Reach the flag in time!');
  }

  private reset(): void {
    this.obs = [];
    this.lane = 0;
    this.laneShown = 0;
    this.jumpY = 0;
    this.jumpV = 0;
    this.speed = 0;
    this.dist = 0;
    this.nextSpawn = 22; // a short calm stretch to get going
    this.stage = 1;
    this.timeLeft = STAGE_TIME;
    this.fish = 0;
    this.score = 0;
    this.stumble = 0;
    this.rnd = mulberry32(5);
    this.state = 'ready';
  }

  private topSpeed(): number {
    // starts as a gentle jog and builds up over the run (about +1 m/s every 60 m), capped
    const ramp = Math.min(9, this.dist / 60);
    const top = 4 + ramp;
    return this.slow ? Math.min(top, 4.5) : top;
  }

  private go(): boolean {
    if (this.state === 'ready') {
      this.state = 'play';
      this.host.say('Go, Mike!');
      return true;
    }
    if (this.state === 'over' && this.stateT > 0.8) {
      this.reset();
      this.state = 'play';
      return true;
    }
    return false;
  }

  private jump(): void {
    if (this.go() || this.state !== 'play') return;
    if (this.jumpY > 0.01 || this.stumble > 0) return;
    this.jumpV = JUMP_V;
    sfx.play('jump');
  }

  private step(d: number): void {
    if (this.go() || this.state !== 'play') return;
    if (this.jumpY > 0.005) return; // lane changes only on the ground
    const n = Math.max(-1, Math.min(1, this.lane + d));
    if (n !== this.lane) {
      this.lane = n;
      sfx.play('whoosh');
    }
  }

  action(id: string): void {
    switch (id) {
      case 'jump': case 'fire': case 'flap': this.jump(); break;
      case 'left': this.step(-1); break;
      case 'right': this.step(1); break;
      case 'down': this.slow = true; break;
      case 'down:up': this.slow = false; break;
      case 'start': this.reset(); sfx.play('click'); this.host.say('Ready? Jump or step to start.'); break;
      case 'pause':
        if (this.state === 'play' || this.state === 'paused') this.state = this.state === 'paused' ? 'play' : 'paused';
        break;
      case 'exit': this.host.exit(); break;
      case 'mic': this.host.mic(); break;
    }
  }

  key(k: string): boolean {
    const map: Record<string, string> = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ' ': 'jump', ArrowUp: 'jump', w: 'jump', ArrowDown: 'down', s: 'down', n: 'start', p: 'pause', Escape: 'exit' };
    const a = map[k];
    if (!a) return false;
    if (a === 'down') {
      this.slow = true;
      const up = (e: KeyboardEvent) => {
        if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
          this.slow = false;
          window.removeEventListener('keyup', up);
        }
      };
      window.addEventListener('keyup', up);
      return true;
    }
    this.action(a);
    return true;
  }

  pausedByHost(): void {
    if (this.state === 'play') this.state = 'paused';
  }

  protected tick(frames: PointerFrame[], now: number, dt: number): void {
    // --- input --------------------------------------------------------------------------
    for (const f of frames) {
      const p = f.p;
      if (p.gamepad) {
        const ax = p.gamepad.axes[2] ?? 0, ay = p.gamepad.axes[3] ?? 0;
        const armed = this.stickArmed.get(p.id) ?? true;
        if (Math.abs(ax) > 0.6 && armed) { this.step(Math.sign(ax)); this.stickArmed.set(p.id, false); }
        if (Math.abs(ax) < 0.3) this.stickArmed.set(p.id, true);
        this.slow = ay > 0.6;
        if (p.gamepad.buttons[4]?.pressed || p.gamepad.buttons[5]?.pressed) this.jump();
      }
      if (f.down) this.gest.set(p.id, { x: f.local.x, y: f.local.y, t: now, moved: false });
      const g = this.gest.get(p.id);
      if (g && p.pinching && f.settling) {
        g.x = f.local.x;
        g.y = f.local.y;
      } else if (g && p.pinching) {
        const dx = f.local.x - g.x;
        if (Math.abs(dx) > 0.07) {
          this.step(Math.sign(dx));
          g.x = f.local.x;
          g.moved = true;
        }
        // lift your hand quickly to jump
        if (p.kind !== 'mouse' && f.local.y - g.y > 0.06 && !g.moved) {
          this.jump();
          g.y = f.local.y;
          g.moved = true;
        }
      }
      if (g && (f.up || !p.pinching)) {
        this.gest.delete(p.id);
        if (!g.moved && now - g.t < 350) {
          // quick tap: mouse taps left / right thirds change lane, the middle (and any pinch) jumps
          if (p.kind === 'mouse' && Math.abs(f.local.x) > 0.12) this.step(Math.sign(f.local.x));
          else this.jump();
        }
      }
    }
    this.eyeLocal(this.eye);
    this.bodySteer(frames);
    this.stateT += dt;

    // --- simulation -----------------------------------------------------------------------
    if (this.state === 'play') {
      this.timeLeft -= dt;
      if (this.stumble > 0) {
        this.stumble -= dt;
        this.speed = Math.max(0, this.speed - 18 * dt);
      } else {
        const top = this.topSpeed();
        this.speed += (top - this.speed) * Math.min(1, dt * (this.speed < top ? 1.3 : 3));
      }
      const dz = this.speed * dt;
      this.dist += dz;
      this.scrollZ = (this.scrollZ + dz) % 2.4;
      for (const o of this.obs) o.z += dz;
      this.obs = this.obs.filter((o) => o.z < 2);
      // jump
      this.jumpV += G * dt;
      this.jumpY = Math.max(0, this.jumpY + this.jumpV * dt);
      if (this.jumpY === 0) this.jumpV = 0;
      // spawn ahead
      while (this.dist + -FAR + 2 > this.nextSpawn && this.nextSpawn < this.stage * STAGE_M - 12) this.spawnRow(this.nextSpawn);
      // collisions as things reach you
      for (const o of this.obs) {
        if (o.hit || o.z < -0.35 || o.z > 0.35) continue;
        const inLane = o.kind === 'crack' || o.lane === this.lane;
        if (!inLane || Math.abs(this.laneShown - this.lane) > 0.5) continue;
        if (o.kind === 'fish') {
          if (this.jumpY < 0.5) {
            o.hit = true;
            this.fish++;
            this.score += 100;
            sfx.play('coin');
            this.sparkles.burst(new Vector3(this.eye.x, this.eye.y - 0.25, this.eye.z - 0.4), 0xff9f43, 10, 0.25);
          }
        } else if (o.kind === 'seal' || this.jumpY < 0.12) {
          o.hit = true;
          this.stumble = 1.1;
          sfx.play(o.kind === 'seal' ? 'boing' : 'splash');
          sfx.play('hurt');
          this.host.say(o.kind === 'seal' ? 'Oof, a seal!' : 'Splash! Jump the holes.');
        }
      }
      // reached the flag
      if (this.dist >= this.stage * STAGE_M) {
        const bonus = Math.ceil(this.timeLeft) * 50;
        this.score += 1000 + bonus;
        this.state = 'flag';
        this.stateT = 0;
        sfx.play('levelup');
        this.host.celebrate();
        this.host.say(`Flag ${this.stage}! ${Math.ceil(this.timeLeft)} seconds to spare.`);
      } else if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.state = 'over';
        this.stateT = 0;
        const rec = this.saveBest(this.score);
        sfx.play('gameover');
        this.host.say(rec ? `Out of time! New best: ${this.score}. Jump to run again.` : `Out of time! ${this.score} points. Jump to run again.`);
      }
    } else if (this.state === 'flag') {
      this.speed = Math.max(0, this.speed - 6 * dt);
      const dz = this.speed * dt;
      this.dist += dz;
      for (const o of this.obs) o.z += dz;
      if (this.stateT > 2.6) {
        this.stage++;
        this.timeLeft = Math.max(32, 50 - (this.stage - 2) * 4);
        this.state = 'play';
        this.host.say(`Stage ${this.stage}. Faster now!`);
      }
    } else if (this.state === 'ready') {
      this.speed = 0;
    }
    // comfort: quick lane slides, no bobbing or tilting, a gentle half-height jump
    this.laneShown += (this.lane - this.laneShown) * Math.min(1, dt * 20);
    this.world.position.set(this.eye.x - this.laneShown * LANE, this.eye.y - ROAD_DROP - this.jumpY * 0.5, this.eye.z);
    this.world.rotation.z = 0;
    const lateral = Math.min(1, Math.abs(this.lane - this.laneShown) * 3);
    this.host.comfort?.(this.state === 'play' ? Math.min(1, 0.35 + this.speed / 30 + lateral * 0.5 + (this.jumpY > 0 ? 0.25 : 0)) : 0.15);
    // skates on ice: hiss follows your speed
    sfx.loop('ice', this.state === 'play' && this.jumpY === 0 ? Math.min(0.2, this.speed / 50) : 0, 2500 + this.speed * 200); // soft skate hiss
    if (this.jumpY === 0 && this.jumpV === 0 && this.landed === false) { this.landed = true; sfx.play('thud'); }
    if (this.jumpY > 0) this.landed = false;
    this.draw(now, dt);
    this.sparkles.update(dt);
    const toFlag = Math.max(0, this.stage * STAGE_M - this.dist);
    this.panel('MIKE PENGUIN', [['TIME', String(Math.ceil(this.timeLeft))], ['FLAG IN', `${Math.ceil(toFlag)} m`], ['FISH', String(this.fish)], ['SCORE', String(this.score)]],
      this.state === 'ready' ? 'JUMP TO START' : this.state === 'over' ? 'TIME UP! JUMP TO RETRY' : this.state === 'flag' ? `FLAG ${this.stage}!` : this.state === 'paused' ? 'PAUSED' : `STAGE ${this.stage} · BEST ${Math.max(this.best, this.score)}`);
  }

  /**
   * No pinching needed: hold your arms out in front of you and move them together.
   * Their average left/right position picks the lane; raising them to head height jumps.
   * Hands resting low (on the desk / in your lap) don't steer.
   */
  private bodySteer(frames: PointerFrame[]): void {
    const now = performance.now();
    // bare hands only: controllers steer with the thumbstick (their grips would fight it)
    const arms = frames
      .filter((f) => f.p.kind === 'hand' && f.p.wrist)
      .map((f) => this.deskRoot.worldToLocal(f.p.wrist!.clone()))
      .filter((w) => w.y > this.eye.y - 0.42); // raised in front of you, not resting on the desk
    if (!arms.length) return;
    // jump: every tracked arm up at head height (one arm counts if only one is tracked)
    const allUp = arms.every((w) => w.y > this.eye.y - 0.02);
    if (allUp && this.jumpArmed) {
      this.jumpArmed = false;
      this.jump();
    } else if (arms.every((w) => w.y < this.eye.y - 0.12)) this.jumpArmed = true;
    // lanes only on the ground, with arms out of the jump pose, and not right after landing
    const x = arms.reduce((a, w) => a + w.x, 0) / arms.length - this.eye.x;
    const zone = x > 0.16 ? 1 : x < -0.16 ? -1 : Math.abs(x) < 0.09 ? 0 : this.pendingZone;
    const busy = this.jumpY > 0.005 || this.jumpV > 0 || arms.some((w) => w.y > this.eye.y - 0.12);
    if (busy) {
      this.calmSince = now;
      this.appliedZone = zone; // whatever your arms do mid-jump never counts as a lane change
      this.pendingZone = zone;
      return;
    }
    if (now - this.calmSince < 300) {
      this.appliedZone = zone; // settle after landing: re-sync without moving
      this.pendingZone = zone;
      return;
    }
    if (zone !== this.pendingZone) {
      this.pendingZone = zone;
      this.zoneSince = now;
    }
    // a lane change needs the arms to stay in the new zone for a moment (no twitchy flicks)
    if (this.pendingZone !== this.appliedZone && now - this.zoneSince > 180) {
      this.appliedZone = this.pendingZone;
      if (this.state === 'play' && this.appliedZone !== this.lane) {
        this.lane = this.appliedZone;
        sfx.play('whoosh');
      }
    }
  }

  private spawnRow(at: number): void {
    const r = this.rnd;
    const z = -(at - this.dist);
    // obstacles start sparse and get denser the further you run
    const diff = Math.min(1, this.dist / 1300);
    const roll = r();
    if (roll < 0.05 + diff * 0.13) {
      this.obs.push({ kind: 'crack', lane: 0, z, hit: false });
    } else {
      // block one or two lanes, never all three
      const lanes = [-1, 0, 1].sort(() => r() - 0.5);
      const n = r() < 0.12 + diff * 0.55 ? 2 : 1;
      for (let i = 0; i < n; i++) this.obs.push({ kind: r() < 0.5 ? 'seal' : 'hole', lane: lanes[i], z, hit: false });
      if (r() < 0.7) this.obs.push({ kind: 'fish', lane: lanes[2], z: z - 0.01, hit: false });
    }
    if (r() < 0.4) this.obs.push({ kind: 'fish', lane: Math.floor(r() * 3) - 1, z: z - 4, hit: false });
    this.nextSpawn = at + Math.max(6, 14 - diff * 8) * (0.8 + r() * 0.5);
  }

  private draw(now: number, dt: number): void {
    const counts: Record<ObKind, number> = { hole: 0, crack: 0, seal: 0, fish: 0 };
    const meshes: Record<ObKind, InstancedMesh> = { hole: this.holeMesh, crack: this.crackMesh, seal: this.sealMesh, fish: this.fishMesh };
    for (const o of this.obs) {
      if (o.z < FAR || (o.kind === 'fish' && o.hit)) continue;
      const x = o.lane * LANE;
      if (o.kind === 'fish') {
        this.tmpQ.setFromAxisAngle(new Vector3(0, 1, 0), now / 300 + o.z);
        this.tmpM.compose(new Vector3(x, 0.3 + Math.sin(now / 200 + o.z) * 0.05, o.z), this.tmpQ, new Vector3(1, 1, 1));
      } else if (o.kind === 'seal') {
        this.tmpM.makeTranslation(x, 0.18, o.z);
      } else this.tmpM.makeTranslation(o.kind === 'crack' ? 0 : x, 0.004, o.z);
      if (counts[o.kind] < meshes[o.kind].instanceMatrix.count) meshes[o.kind].setMatrixAt(counts[o.kind]++, this.tmpM);
    }
    for (const k of Object.keys(meshes) as ObKind[]) {
      meshes[k].count = counts[k];
      meshes[k].instanceMatrix.needsUpdate = true;
    }
    // lane stripes + snow banks scroll with the road
    let s = 0, b = 0;
    for (let z = 1 - this.scrollZ; z > FAR; z -= 2.4) {
      for (const x of [-LANE / 2, LANE / 2]) {
        this.tmpM.makeTranslation(x, 0.002, z);
        this.stripes.setMatrixAt(s++, this.tmpM);
      }
      // low, steady snowbanks a little further out: less flicker streaming past the corner of your eye
      for (const x of [-(LANE * 1.5 + 0.7), LANE * 1.5 + 0.7]) {
        this.tmpM.makeScale(1, 0.45, 1).setPosition(x, 0.11, z);
        this.banks.setMatrixAt(b++, this.tmpM);
      }
    }
    this.stripes.count = s;
    this.banks.count = b;
    this.stripes.instanceMatrix.needsUpdate = true;
    this.banks.instanceMatrix.needsUpdate = true;
    this.flag.position.z = -(this.stage * STAGE_M - this.dist);
    this.flag.visible = this.flag.position.z > FAR && this.flag.position.z < 3;
    for (let i = 0; i < SNOW; i++) {
      this.snowPos[i * 3 + 1] -= dt * 0.4;
      this.snowPos[i * 3 + 2] += this.speed * dt;
      if (this.snowPos[i * 3 + 1] < 0 || this.snowPos[i * 3 + 2] > 1) this.resetSnow(i);
    }
    (this.snow.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    // flippers swing as you waddle
    const swing = this.state === 'play' ? Math.sin(this.dist * 5) * 0.4 : 0;
    this.flippers.forEach((f, i) => {
      const side = i === 0 ? -1 : 1;
      f.position.set(this.eye.x + side * 0.2, this.eye.y - 0.32, this.eye.z - 0.28);
      f.rotation.set(0.3 + side * swing * 0.5, 0, side * (0.5 + (this.jumpY > 0 ? 0.6 : 0)));
    });
    this.beak.position.set(this.eye.x, this.eye.y - 0.14, this.eye.z - 0.26);
  }

  /** test hooks */
  debugState() {
    return { state: this.state, stage: this.stage, lane: this.lane, dist: this.dist, speed: this.speed, time: this.timeLeft, fish: this.fish, score: this.score, jumpY: this.jumpY, stumble: this.stumble };
  }
  debugAt(m: number): void {
    this.dist = m;
    this.obs = [];
    this.nextSpawn = m + 20;
  }
}

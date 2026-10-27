/**
 * Star Swarm — an original 3D swarm shooter on the desk. Alien formations hover at the back of the
 * desk, peel off and dive at you in 3D curves; you fly a little ship at the front and blast them.
 * Every wave ends with a mothership boss, each wave is tougher than the last, and fallen aliens
 * drop power-ups you fly into to catch (twin guns, rapid fire, shield, smart bomb, extra ship).
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  TetrahedronGeometry,
  Vector3,
  BoxGeometry,
  TorusGeometry,
  SphereGeometry,
  Color,
  type Object3D,
} from 'three';
import { sfx } from '../audio/sfx.js';
import { Sparkles, dotTexture } from '../fx/sparkles.js';
import { SWARM_LAYOUT } from '../ui/dock.js';
import { SWARM_PAD } from '../ui/screenPad.js';
import { GameBase, type GameHost, type PointerFrame } from './gameBase.js';

const X = 0.22, Y0 = 0.08, Y1 = 0.36;
const PLAYER_Z = 0.1, FORMATION_Z = -0.24;
const COLS = 8, ROWS = 4;

type Kind = 0 | 1 | 2; // grunt, wing, boss
interface Alien {
  kind: Kind;
  slot: Vector3;
  pos: Vector3;
  hp: number;
  alive: boolean;
  dive: null | { t: number; dur: number; p0: Vector3; p1: Vector3; p2: Vector3; p3: Vector3; shot: boolean; shot2?: boolean };
  /** boss escorts dive once and are gone */
  escort?: boolean;
}
type PowerKind = 'double' | 'rapid' | 'shield' | 'bomb' | 'life';
interface Power {
  kind: PowerKind;
  pos: Vector3;
  spin: number;
}
const POWER_COLOR: Record<PowerKind, number> = { double: 0x5cff8a, rapid: 0xffa040, shield: 0x4fb4ff, bomb: 0xffe14a, life: 0xff6fd8 };
const POWER_NAME: Record<PowerKind, string> = { double: 'Twin guns', rapid: 'Rapid fire', shield: 'Shield', bomb: 'Smart bomb', life: 'Extra ship' };
const POWER_WEIGHTS: Array<[PowerKind, number]> = [['double', 30], ['rapid', 30], ['shield', 20], ['bomb', 12], ['life', 8]];
interface Boss {
  hp: number;
  max: number;
  pos: Vector3;
  t: number;
  cd: number;
  pattern: number;
  burst: number;
  burstCd: number;
  flash: number;
  entering: boolean;
}
interface Shot {
  pos: Vector3;
  vel: Vector3;
}

const KIND_COLOR = [0x4fd1ff, 0xff5fd2, 0xffd166];
const KIND_POINTS = [100, 160, 400];

export class StarSwarm extends GameBase {
  private aliens: Alien[] = [];
  private shots: Shot[] = [];
  private bombs: Shot[] = [];
  private ship = new Group();
  private shipPos = new Vector3(0, 0.2, PLAYER_Z);
  private target = new Vector3(0, 0.2, PLAYER_Z);
  private meshes: InstancedMesh[];
  private shotMesh: InstancedMesh;
  private bombMesh: InstancedMesh;
  private sparkles: Sparkles;
  private stars: Points;
  private starPos = new Float32Array(300 * 3);
  private wave = 1;
  private lives = 3;
  private score = 0;
  private state: 'play' | 'boss' | 'over' | 'warp' | 'paused' = 'play';
  private resume: 'play' | 'boss' | 'warp' = 'play';
  private boss: Boss | null = null;
  private bossGroup = new Group();
  private bossCore: Mesh;
  private bossBar: Mesh;
  private powers: Power[] = [];
  private powerMesh: InstancedMesh;
  private shieldMesh: Mesh;
  private shield = false;
  private doubleT = 0;
  private rapidT = 0;
  private tmpCol = new Color();
  /** power-ups caught this game (stats / tests) */
  private caught: PowerKind[] = [];
  private stateT = 0;
  private sway = 0;
  private fireCd = 0;
  private diveCd = 2;
  private invuln = 0;
  private firing = false;
  private grab: { id: number; start: Vector3; ship: Vector3 } | null = null;
  private tmpM = new Matrix4();
  private tmpQ = new Quaternion();

  constructor(deskRoot: Object3D, host: GameHost) {
    super(deskRoot, host, SWARM_LAYOUT, SWARM_PAD, 'naga-atelier:swarm-best:v1', 'swarm');
    const geos = [new OctahedronGeometry(0.016, 0), new TetrahedronGeometry(0.02, 0), new DodecahedronGeometry(0.019, 0)];
    this.meshes = geos.map((g, i) => {
      const m = new InstancedMesh(g, new MeshStandardMaterial({ color: KIND_COLOR[i], emissive: KIND_COLOR[i], emissiveIntensity: 0.55, roughness: 0.4, flatShading: true }), 40);
      m.count = 0;
      m.frustumCulled = false;
      this.root.add(m);
      return m;
    });
    const glow = (c: number) => new MeshBasicMaterial({ color: c, transparent: true, blending: AdditiveBlending, depthWrite: false });
    this.shotMesh = new InstancedMesh(new CylinderGeometry(0.0025, 0.0025, 0.022, 6).rotateX(Math.PI / 2), glow(0x9ff7ff), 40);
    this.bombMesh = new InstancedMesh(new OctahedronGeometry(0.006, 0), glow(0xff7a5c), 40);
    for (const m of [this.shotMesh, this.bombMesh]) {
      m.count = 0;
      m.frustumCulled = false;
      this.root.add(m);
    }
    // player ship
    const hull = new Mesh(new ConeGeometry(0.014, 0.05, 8).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: 0xeaf6ff, emissive: 0x3a6a8a, roughness: 0.3 }));
    const wings = new Mesh(new BoxGeometry(0.06, 0.004, 0.018), new MeshStandardMaterial({ color: 0x58d6c8, emissive: 0x0d4a44, roughness: 0.4 }));
    wings.position.z = 0.008;
    const flame = new Mesh(new ConeGeometry(0.008, 0.02, 8).rotateX(Math.PI / 2), glow(0xffb347));
    flame.position.z = 0.032;
    this.ship.add(hull, wings, flame);
    this.root.add(this.ship);
    // shield bubble around the ship
    this.shieldMesh = new Mesh(new SphereGeometry(0.038, 16, 12), new MeshBasicMaterial({ color: 0x4fb4ff, transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false }));
    this.shieldMesh.visible = false;
    this.ship.add(this.shieldMesh);
    // power-up capsules (one instanced mesh, coloured per kind)
    this.powerMesh = new InstancedMesh(new BoxGeometry(0.016, 0.016, 0.016), new MeshStandardMaterial({ color: 0xffffff, emissive: 0x444444, roughness: 0.3 }), 12);
    this.powerMesh.count = 0;
    this.powerMesh.frustumCulled = false;
    this.root.add(this.powerMesh);
    // the mothership boss
    this.bossCore = new Mesh(new DodecahedronGeometry(0.045, 0), new MeshStandardMaterial({ color: 0xffb347, emissive: 0xff7a1a, emissiveIntensity: 0.5, roughness: 0.35, flatShading: true }));
    const ring = new Mesh(new TorusGeometry(0.075, 0.007, 8, 32), new MeshStandardMaterial({ color: 0xff5fd2, emissive: 0xff5fd2, emissiveIntensity: 0.6 }));
    ring.rotation.x = Math.PI / 2.4;
    ring.name = 'ring';
    const eye = new Mesh(new SphereGeometry(0.014, 12, 10), glow(0xff3355));
    eye.position.z = 0.042;
    this.bossGroup.add(this.bossCore, ring, eye);
    for (const side of [-1, 1]) {
      const pod = new Mesh(new OctahedronGeometry(0.022, 0), new MeshStandardMaterial({ color: 0x4fd1ff, emissive: 0x4fd1ff, emissiveIntensity: 0.5, flatShading: true }));
      pod.position.set(side * 0.085, -0.01, 0);
      this.bossGroup.add(pod);
    }
    const barBg = new Mesh(new BoxGeometry(0.16, 0.008, 0.003), new MeshBasicMaterial({ color: 0x222233 }));
    barBg.position.y = 0.085;
    this.bossBar = new Mesh(new BoxGeometry(0.16, 0.009, 0.004), new MeshBasicMaterial({ color: 0xff3b5c }));
    this.bossBar.position.set(0, 0.085, 0.001);
    this.bossGroup.add(barBg, this.bossBar);
    this.bossGroup.visible = false;
    this.root.add(this.bossGroup);
    this.sparkles = new Sparkles(this.root);
    // starfield streaming toward you
    for (let i = 0; i < 300; i++) this.resetStar(i, true);
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(this.starPos, 3));
    this.stars = new Points(sg, new PointsMaterial({ size: 0.006, map: dotTexture(), color: 0xbfe8ff, transparent: true, blending: AdditiveBlending, depthWrite: false }));
    this.stars.frustumCulled = false;
    this.root.add(this.stars);
  }

  protected override musicOn(): boolean {
    return this.state === 'play' || this.state === 'warp' || this.state === 'boss';
  }
  protected override musicTempo(): number {
    return this.state === 'boss' ? this.wave + 2 : this.wave;
  }

  private resetStar(i: number, anywhere = false): void {
    this.starPos.set([(Math.random() - 0.5) * 1.6, Math.random() * 0.9 - 0.1, anywhere ? -2 + Math.random() * 2.3 : -2 - Math.random() * 0.5], i * 3);
  }

  protected start(): void {
    this.wave = 1;
    this.lives = 3;
    this.score = 0;
    this.shield = false;
    this.doubleT = this.rapidT = 0;
    this.powers = [];
    this.caught = [];
    this.boss = null;
    this.spawnWave();
    this.host.say('Star Swarm! Pinch and move to fly — you fire while you pinch. Fly into glowing cubes for power-ups.');
  }

  private spawnWave(): void {
    this.aliens = [];
    this.shots = [];
    this.bombs = [];
    const rows = Math.min(ROWS, 2 + Math.ceil(this.wave / 2));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < COLS; c++) {
        const kind: Kind = r === 0 ? 2 : r === 1 ? 1 : 0;
        if (kind === 2 && (c < 2 || c > 5)) continue; // bosses sit in the middle of the top row
        const slot = new Vector3((c - (COLS - 1) / 2) * 0.05, Y1 - 0.02 - r * 0.045, FORMATION_Z + r * 0.02);
        // fly in from far away
        // tougher each wave: wings take 2 hits from wave 4, commanders gain a hit every 3 waves
        const hp = kind === 2 ? 2 + Math.floor(this.wave / 3) : kind === 1 && this.wave >= 4 ? 2 : 1;
        this.aliens.push({ kind, slot, pos: slot.clone().add(new Vector3(0, 0.3, -1.2 - Math.random() * 0.6)), hp, alive: true, dive: null });
      }
    this.diveCd = 2.5;
    this.state = 'play';
    this.boss = null;
  }

  private spawnBoss(): void {
    const max = 18 + this.wave * 8;
    this.boss = { hp: max, max, pos: new Vector3(0, 0.45, -1.4), t: 0, cd: 2.2, pattern: 0, burst: 0, burstCd: 0, flash: 0, entering: true };
    this.bombs = [];
    this.state = 'boss';
    sfx.play('warp');
    this.host.say(`Mothership incoming! Hit it ${max} times.`);
  }

  private dropPower(at: Vector3, force = false, chance = 0.08): void {
    if (!force && Math.random() > chance) return;
    if (this.powers.length >= 6) return;
    let r = Math.random() * POWER_WEIGHTS.reduce((n, [, w]) => n + w, 0);
    let kind: PowerKind = 'double';
    for (const [k, w] of POWER_WEIGHTS) {
      if ((r -= w) <= 0) {
        kind = k;
        break;
      }
    }
    if (kind === 'life' && this.lives >= 5) kind = 'shield';
    const pos = at.clone();
    pos.x = Math.max(-X, Math.min(X, pos.x));
    pos.y = Math.max(Y0 + 0.02, Math.min(0.28, pos.y));
    this.powers.push({ kind, pos, spin: Math.random() * 6 });
  }

  private catchPower(p: Power): void {
    this.caught.push(p.kind);
    sfx.play('pickup', 1.2);
    sfx.play('chime');
    this.sparkles.burst(p.pos, POWER_COLOR[p.kind], 20, 0.3);
    switch (p.kind) {
      case 'double': this.doubleT = 14; break;
      case 'rapid': this.rapidT = 12; break;
      case 'shield': this.shield = true; break;
      case 'life': this.lives++; break;
      case 'bomb': {
        // smart bomb: every alien and bullet on screen goes, the boss takes a big hit
        for (const a of this.aliens) if (a.alive) this.killAlien(a, false);
        this.bombs = [];
        if (this.boss && !this.boss.entering) this.damageBoss(Math.ceil(this.boss.max * 0.15));
        sfx.play('bigclear');
        break;
      }
    }
    this.host.say(`${POWER_NAME[p.kind]}!`);
  }

  private killAlien(a: Alien, drops = true): void {
    a.alive = false;
    this.score += KIND_POINTS[a.kind] * (a.dive ? 2 : 1);
    this.sparkles.burst(a.pos, KIND_COLOR[a.kind], 18, 0.35);
    sfx.play(a.kind === 2 ? 'bigclear' : 'explode');
    if (drops) this.dropPower(a.pos, false, a.dive ? 0.2 : a.kind === 2 ? 0.25 : 0.07);
  }

  private damageBoss(n: number): void {
    const b = this.boss;
    if (!b) return;
    b.hp -= n;
    b.flash = 0.12;
    sfx.play('brick', 0.8);
    if (b.hp <= 0) {
      this.score += 2000 * this.wave;
      for (let i = 0; i < 4; i++) this.sparkles.burst(b.pos.clone().add(new Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.08, 0)), [0xffb347, 0xff5fd2, 0x4fd1ff, 0xffffff][i], 40, 0.6);
      sfx.play('bigclear');
      sfx.play('explode');
      this.dropPower(b.pos.clone().add(new Vector3(-0.04, 0, 0)), true);
      this.dropPower(b.pos.clone().add(new Vector3(0.04, 0, 0)), true);
      this.boss = null;
      this.aliens = this.aliens.filter((a) => a.alive && !a.escort);
      this.bombs = [];
      this.state = 'warp';
      this.stateT = 0;
      sfx.play('levelup');
      sfx.play('warp');
      this.host.celebrate();
      this.host.say(`Mothership down! +${2000 * this.wave}. Warping to wave ${this.wave + 1}…`);
    }
  }

  /** the boss's attacks; harder each wave and angrier below half health */
  private bossTick(dt: number): void {
    const b = this.boss!;
    b.t += dt;
    b.flash -= dt;
    const home = new Vector3(Math.sin(b.t * 0.7) * 0.13, 0.27 + Math.sin(b.t * 1.3) * 0.035, FORMATION_Z - 0.02 + Math.sin(b.t * 0.5) * 0.04);
    if (b.entering) {
      b.pos.lerp(home, Math.min(1, dt * 1.5));
      if (b.pos.distanceTo(home) < 0.02) b.entering = false;
      return;
    }
    const angry = b.hp < b.max / 2;
    if (angry) b.t += dt * 0.6; // moves faster too
    b.pos.copy(home);
    const speed = 0.3 + this.wave * 0.025 + (angry ? 0.06 : 0);
    // queued aimed burst
    if (b.burst > 0 && (b.burstCd -= dt) <= 0) {
      b.burst--;
      b.burstCd = 0.18;
      this.bombs.push({ pos: b.pos.clone(), vel: this.shipPos.clone().sub(b.pos).setLength(speed * 1.15) });
      sfx.play('laser', 0.5);
    }
    if ((b.cd -= dt) > 0) return;
    b.cd = Math.max(0.9, 2.4 - this.wave * 0.12) * (angry ? 0.65 : 1);
    const pat = b.pattern++ % (this.wave >= 2 ? 3 : 2);
    if (pat === 0) {
      // fan of shots spreading toward you
      const n = 3 + Math.min(4, this.wave) + (angry ? 2 : 0);
      const aim = this.shipPos.clone().sub(b.pos).normalize();
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 0.16;
        const v = aim.clone().applyAxisAngle(new Vector3(0, 1, 0), spread).setLength(speed);
        this.bombs.push({ pos: b.pos.clone(), vel: v });
      }
      sfx.play('swoop');
    } else if (pat === 1) {
      b.burst = 3 + Math.min(3, Math.floor(this.wave / 2));
      b.burstCd = 0;
    } else {
      // launch two escorts that dive straight at you
      for (const side of [-1, 1]) {
        const start = b.pos.clone().add(new Vector3(side * 0.085, 0, 0));
        const aim = this.shipPos.clone();
        this.aliens.push({
          kind: 0, slot: start.clone(), pos: start.clone(), hp: 1, alive: true, escort: true,
          dive: { t: 0, dur: Math.max(1.4, 2.4 - this.wave * 0.1), p0: start, p1: start.clone().add(new Vector3(side * 0.15, 0.05, 0.1)), p2: aim.clone().add(new Vector3(-side * 0.08, 0.02, -0.1)), p3: aim.clone().add(new Vector3(-side * 0.15, -0.05, 0.4)), shot: false },
        });
      }
      sfx.play('swoop');
    }
  }

  action(id: string): void {
    switch (id) {
      case 'start': this.start(); sfx.play('click'); break;
      case 'pause':
        if (this.state === 'over') break;
        if (this.state === 'paused') this.state = this.resume;
        else {
          this.resume = this.state;
          this.state = 'paused';
        }
        this.host.say(this.state === 'paused' ? 'Paused.' : 'Go!');
        break;
      case 'exit': this.host.exit(); break;
      case 'mic': this.host.mic(); break;
      case 'fire': this.fire(); break;
      case 'left': this.nudge(-1, 0); break;
      case 'right': this.nudge(1, 0); break;
      case 'up': this.nudge(0, 1); break;
      case 'down': this.nudge(0, -1); break;
    }
  }

  private nudge(dx: number, dy: number): void {
    this.target.x = Math.max(-X, Math.min(X, this.target.x + dx * 0.025));
    this.target.y = Math.max(Y0, Math.min(0.3, this.target.y + dy * 0.025));
  }

  private held = new Set<string>();
  key(k: string): boolean {
    const map: Record<string, string> = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ' ': 'fire', n: 'start', p: 'pause', Escape: 'exit' };
    const a = map[k];
    if (!a) return false;
    if (a === 'fire' || ['left', 'right', 'up', 'down'].includes(a)) {
      this.held.add(a);
      window.addEventListener('keyup', () => this.held.clear(), { once: true });
    }
    this.action(a);
    return true;
  }

  pausedByHost(): void {
    if (this.state === 'play' || this.state === 'boss' || this.state === 'warp') {
      this.resume = this.state;
      this.state = 'paused';
    }
  }

  private fire(): void {
    const rapid = this.rapidT > 0, twin = this.doubleT > 0;
    if ((this.state !== 'play' && this.state !== 'boss') || this.fireCd > 0 || this.shots.length >= (rapid || twin ? 14 : 5)) return;
    this.fireCd = rapid ? 0.085 : 0.2;
    for (const dx of twin ? [-0.014, 0.014] : [0]) {
      const from = this.shipPos.clone().add(new Vector3(dx, 0, -0.03));
      const vel = new Vector3(0, 0, -0.9);
      // aim assist (height only): lines up with the nearest alien (or the boss) in your column, so
      // steering left/right is enough on a keyboard, and hands don't need perfect height
      let best: Vector3 | null = null;
      for (const a of this.aliens) {
        if (!a.alive || a.pos.z > from.z - 0.02 || Math.abs(a.pos.x - from.x) > 0.03) continue;
        if (!best || a.pos.z > best.z) best = a.pos;
      }
      if (!best && this.boss && Math.abs(this.boss.pos.x - from.x) < 0.07) best = this.boss.pos;
      if (best) vel.y = ((best.y - from.y) / (from.z - best.z)) * 0.9;
      this.shots.push({ pos: from, vel });
    }
    sfx.play('laser', (rapid ? 1.2 : 0.9) + Math.random() * 0.2);
  }

  protected tick(frames: PointerFrame[], now: number, dt: number): void {
    // --- input ----------------------------------------------------------------
    this.firing = this.held.has('fire');
    if (this.held.has('left')) this.nudge(-dt * 6, 0);
    if (this.held.has('right')) this.nudge(dt * 6, 0);
    if (this.held.has('up')) this.nudge(0, dt * 6);
    if (this.held.has('down')) this.nudge(0, -dt * 6);
    for (const f of frames) {
      const p = f.p;
      if (p.gamepad) {
        const ax = p.gamepad.axes[2] ?? 0, ay = p.gamepad.axes[3] ?? 0;
        if (Math.abs(ax) > 0.2 || Math.abs(ay) > 0.2) this.nudge(ax * dt * 8, -ay * dt * 8);
        if (p.gamepad.buttons[4]?.pressed) this.firing = true;
      }
      if (f.down && !this.grab) this.grab = { id: p.id, start: f.local.clone(), ship: this.target.clone() };
      if (this.grab?.id === p.id) {
        if (f.up || !p.pinching) this.grab = null;
        else if (f.settling) {
          this.grab.start.copy(f.local);
          this.firing = true;
        } else {
          if (p.kind !== 'hand' || p.strength > 0.75) {
            const d = f.local.clone().sub(this.grab.start);
            // mouse/touch move on the desk plane: use depth as height
            const dy = p.kind === 'mouse' ? -d.z : d.y;
            this.target.set(Math.max(-X, Math.min(X, this.grab.ship.x + d.x * 1.3)), Math.max(Y0, Math.min(0.3, this.grab.ship.y + dy * 1.3)), PLAYER_Z);
          }
          this.firing = true;
        }
      }
    }
    if (this.state === 'paused') {
      this.draw(now, 0);
      return;
    }
    this.stateT += dt;
    this.fireCd -= dt;
    this.invuln -= dt;
    this.doubleT -= dt;
    this.rapidT -= dt;
    if (this.firing) this.fire();
    this.shipPos.lerp(this.target, Math.min(1, dt * 14));

    // --- simulation ---------------------------------------------------------------
    if (this.state === 'play' || this.state === 'boss') {
      if (this.boss) this.bossTick(dt);
      this.sway += dt;
      const swayX = Math.sin(this.sway * 0.8) * 0.03;
      for (const a of this.aliens) {
        if (!a.alive) continue;
        if (a.dive) {
          const d = a.dive;
          d.t += dt / d.dur;
          const t = Math.min(1, d.t), u = 1 - t;
          a.pos.set(0, 0, 0)
            .addScaledVector(d.p0, u * u * u).addScaledVector(d.p1, 3 * u * u * t)
            .addScaledVector(d.p2, 3 * u * t * t).addScaledVector(d.p3, t * t * t);
          if (!d.shot && t > 0.35) {
            d.shot = true;
            const v = this.shipPos.clone().sub(a.pos).setLength(0.32 + this.wave * 0.02);
            this.bombs.push({ pos: a.pos.clone(), vel: v });
          }
          // from wave 3 divers fire a second time on the way down
          if (this.wave >= 3 && !d.shot2 && t > 0.6) {
            d.shot2 = true;
            this.bombs.push({ pos: a.pos.clone(), vel: this.shipPos.clone().sub(a.pos).setLength(0.34 + this.wave * 0.02) });
          }
          if (t >= 1 && a.escort) {
            a.alive = false;
            continue;
          }
          if (t >= 1) {
            a.dive = null; // looped behind you, re-enter from the top
            a.pos.set(a.slot.x, Y1 + 0.2, FORMATION_Z - 0.3);
          }
        } else {
          const home = a.slot.clone().add(new Vector3(swayX, 0, 0));
          a.pos.lerp(home, Math.min(1, dt * 2.2));
        }
      }
      // start dives
      this.diveCd -= dt;
      if (this.diveCd <= 0 && this.state === 'play') {
        this.diveCd = Math.max(0.45, 2.4 - this.wave * 0.22) * (0.6 + Math.random() * 0.8);
        const idle = this.aliens.filter((a) => a.alive && !a.dive && a.pos.distanceTo(a.slot) < 0.05);
        // later waves send pairs (and then trios) at once
        const n = 1 + (this.wave >= 3 && Math.random() < Math.min(0.6, (this.wave - 2) * 0.15) ? 1 : 0) + (this.wave >= 6 && Math.random() < 0.3 ? 1 : 0);
        for (let k = 0; k < n; k++) {
        const a = idle.splice(Math.floor(Math.random() * idle.length), 1)[0];
        if (a) {
          const side = Math.sign(a.slot.x || 1);
          const aim = this.shipPos.clone();
          a.dive = {
            t: 0,
            dur: Math.max(1.6, 3 - this.wave * 0.15),
            p0: a.pos.clone(),
            p1: a.pos.clone().add(new Vector3(side * 0.12, 0.08, 0.1)),
            p2: aim.clone().add(new Vector3(-side * 0.1, 0.02, -0.08)),
            p3: aim.clone().add(new Vector3(-side * 0.18, -0.05, 0.4)),
            shot: false,
          };
          sfx.play('swoop');
        }
        }
      }
      // shots vs aliens
      for (const s of this.shots) {
        s.pos.addScaledVector(s.vel, dt);
        for (const a of this.aliens) {
          if (!a.alive || s.pos.distanceTo(a.pos) > 0.022) continue;
          s.pos.z = -9;
          a.hp--;
          if (a.hp <= 0) this.killAlien(a);
          else {
            this.sparkles.burst(a.pos, 0xffffff, 6, 0.2);
            sfx.play('brick', 1.4);
          }
          break;
        }
      }
      // shots vs boss
      if (this.boss && !this.boss.entering) {
        for (const s of this.shots) {
          if (s.pos.distanceTo(this.boss.pos) > 0.06) continue;
          s.pos.z = -9;
          this.sparkles.burst(s.pos.clone().setZ(this.boss.pos.z + 0.04), 0xffffff, 4, 0.15);
          this.damageBoss(1);
          if (!this.boss) break;
        }
      }
      this.shots = this.shots.filter((s) => s.pos.z > FORMATION_Z - 0.3);
      // power-ups drift toward you; fly into one to catch it (a gentle magnet helps when close)
      for (const p of this.powers) {
        p.spin += dt * 3;
        p.pos.z += dt * 0.11;
        const d = this.shipPos.distanceTo(p.pos);
        if (d < 0.07) p.pos.lerp(this.shipPos, Math.min(1, dt * 4));
        if (d < 0.032 && (this.state as string) !== 'over') {
          this.catchPower(p);
          p.pos.z = 9;
        }
      }
      this.powers = this.powers.filter((p) => p.pos.z < PLAYER_Z + 0.15);
      // bombs + divers vs player
      for (const b of this.bombs) b.pos.addScaledVector(b.vel, dt);
      this.bombs = this.bombs.filter((b) => b.pos.z < PLAYER_Z + 0.4 && b.pos.y > -0.1);
      if (this.invuln <= 0) {
        const hitBomb = this.bombs.find((b) => b.pos.distanceTo(this.shipPos) < 0.022);
        const hitAlien = this.aliens.find((a) => a.alive && a.dive && a.pos.distanceTo(this.shipPos) < 0.03);
        if (hitBomb || hitAlien) {
          if (hitBomb) hitBomb.pos.z = 9;
          if (hitAlien) hitAlien.alive = false;
          this.hitPlayer();
        }
      }
      if (this.state === 'play' && this.aliens.every((a) => !a.alive)) {
        sfx.play('levelup');
        this.host.celebrate();
        this.spawnBoss();
      }
    } else if (this.state === 'warp' && this.stateT > 2.2) {
      this.wave++;
      this.spawnWave();
      this.host.say(`Wave ${this.wave}.`);
    }
    this.draw(now, dt);
  }

  /** e2e: ignore hits */
  private god = false;
  debugGod(on: boolean): void {
    this.god = on;
  }

  private hitPlayer(): void {
    if (this.god) return;
    if (this.shield) {
      this.shield = false;
      this.invuln = 1.2;
      this.sparkles.burst(this.shipPos, 0x4fb4ff, 30, 0.4);
      sfx.play('bounce', 0.6);
      this.host.say('Shield took it!');
      return;
    }
    this.lives--;
    this.invuln = 2;
    this.sparkles.burst(this.shipPos, 0xffb347, 40, 0.5);
    sfx.play('explode');
    sfx.play('hurt');
    if (this.lives <= 0) {
      this.state = 'over';
      sfx.play('gameover');
      const rec = this.saveBest(this.score);
      this.host.say(rec ? `New best: ${this.score}! Press NEW GAME to play again.` : `Game over — ${this.score}. Press NEW GAME to play again.`);
    } else {
      this.host.say(`Ouch! ${this.lives} ${this.lives === 1 ? 'ship' : 'ships'} left.`);
    }
  }

  private draw(now: number, dt: number): void {
    const counts = [0, 0, 0];
    for (const a of this.aliens) {
      if (!a.alive) continue;
      const flap = 1 + 0.15 * Math.sin(now / 120 + a.slot.x * 40);
      this.tmpQ.setFromAxisAngle(new Vector3(0, 1, 0), now / 600 + a.slot.x * 10);
      this.tmpM.compose(a.pos, this.tmpQ, new Vector3(flap, 1, flap));
      this.meshes[a.kind].setMatrixAt(counts[a.kind]++, this.tmpM);
    }
    this.meshes.forEach((m, i) => {
      m.count = counts[i];
      m.instanceMatrix.needsUpdate = true;
    });
    const put = (mesh: InstancedMesh, list: Shot[]) => {
      let n = 0;
      for (const s of list) {
        if (n >= 40) break;
        this.tmpM.makeTranslation(s.pos.x, s.pos.y, s.pos.z);
        mesh.setMatrixAt(n++, this.tmpM);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    };
    put(this.shotMesh, this.shots);
    put(this.bombMesh, this.bombs);
    // power-ups
    let pn = 0;
    for (const p of this.powers) {
      if (pn >= 12) break;
      this.tmpQ.setFromAxisAngle(new Vector3(1, 1, 0).normalize(), p.spin);
      const pulse = 1 + 0.15 * Math.sin(now / 110 + p.spin);
      this.tmpM.compose(p.pos, this.tmpQ, new Vector3(pulse, pulse, pulse));
      this.powerMesh.setMatrixAt(pn, this.tmpM);
      this.powerMesh.setColorAt(pn, this.tmpCol.set(POWER_COLOR[p.kind]));
      pn++;
    }
    this.powerMesh.count = pn;
    this.powerMesh.instanceMatrix.needsUpdate = true;
    if (this.powerMesh.instanceColor) this.powerMesh.instanceColor.needsUpdate = true;
    // boss
    const b = this.boss;
    this.bossGroup.visible = !!b;
    if (b) {
      this.bossGroup.position.copy(b.pos);
      this.bossCore.rotation.y = now / 700;
      this.bossCore.rotation.x = now / 1300;
      const ring = this.bossGroup.getObjectByName('ring');
      if (ring) ring.rotation.z = now / 400;
      const mat = this.bossCore.material as MeshStandardMaterial;
      mat.emissiveIntensity = b.flash > 0 ? 1.6 : b.hp < b.max / 2 ? 0.6 + 0.4 * Math.sin(now / 90) : 0.5;
      const f = Math.max(0.001, b.hp / b.max);
      this.bossBar.scale.x = f;
      this.bossBar.position.x = -0.08 * (1 - f);
    }
    this.shieldMesh.visible = this.shield;
    if (this.shield) this.shieldMesh.scale.setScalar(1 + 0.06 * Math.sin(now / 130));
    this.ship.visible = this.state !== 'over' && (this.invuln <= 0 || Math.floor(now / 90) % 2 === 0);
    this.ship.position.copy(this.shipPos);
    this.ship.rotation.z = (this.shipPos.x - this.target.x) * 6;
    // stars
    const warp = this.state === 'warp' ? 4 : 1;
    for (let i = 0; i < 300; i++) {
      this.starPos[i * 3 + 2] += dt * 0.5 * warp;
      if (this.starPos[i * 3 + 2] > 0.4) this.resetStar(i);
    }
    (this.stars.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    this.sparkles.update(dt);
    const power = [this.doubleT > 0 ? 'TWIN' : '', this.rapidT > 0 ? 'RAPID' : '', this.shield ? 'SHIELD' : ''].filter(Boolean).join(' ') || '—';
    this.panel('STAR SWARM', [['SCORE', String(this.score)], ['WAVE', String(this.wave)], ['SHIPS', '▲'.repeat(Math.max(0, this.lives)) || '0'], ['POWER', power]],
      this.state === 'over' ? 'GAME OVER' : this.state === 'paused' ? 'PAUSED' : this.state === 'warp' ? 'WAVE CLEARED!' : this.state === 'boss' ? 'BOSS!' : `BEST ${Math.max(this.best, this.score)}`);
  }

  /** test hooks */
  debugState() {
    return {
      state: this.state, wave: this.wave, lives: this.lives, score: this.score, aliens: this.aliens.filter((a) => a.alive).length, ship: this.shipPos.toArray(),
      boss: this.boss ? { hp: this.boss.hp, max: this.boss.max } : null, powers: this.powers.map((p) => p.kind), shield: this.shield, caught: [...this.caught], twin: this.doubleT > 0, rapid: this.rapidT > 0,
    };
  }
  /** e2e: wipe the formation (→ boss) */
  debugClearWave(): void {
    for (const a of this.aliens) a.alive = false;
  }
  /** e2e: drop a power-up right on the ship */
  debugPower(kind: PowerKind): void {
    this.powers.push({ kind, pos: this.shipPos.clone(), spin: 0 });
  }
  /** e2e: finish the boss off */
  debugHitBoss(n: number): void {
    if (this.boss) {
      this.boss.entering = false;
      this.damageBoss(n);
    }
  }
}

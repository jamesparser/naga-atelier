/**
 * Galago — an original 3D swarm shooter on the desk. Alien formations hover at the back of the
 * desk, peel off and dive at you in 3D curves; you fly a little ship at the front and blast them.
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
  type Object3D,
} from 'three';
import { sfx } from '../audio/sfx.js';
import { Sparkles, dotTexture } from '../fx/sparkles.js';
import { GALAGO_LAYOUT } from '../ui/dock.js';
import { GALAGO_PAD } from '../ui/screenPad.js';
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
  dive: null | { t: number; dur: number; p0: Vector3; p1: Vector3; p2: Vector3; p3: Vector3; shot: boolean };
}
interface Shot {
  pos: Vector3;
  vel: Vector3;
}

const KIND_COLOR = [0x4fd1ff, 0xff5fd2, 0xffd166];
const KIND_POINTS = [100, 160, 400];

export class Galago extends GameBase {
  private aliens: Alien[] = [];
  private shots: Shot[] = [];
  private bombs: Shot[] = [];
  private ship = new Group();
  private shipPos = new Vector3(0, 0.16, PLAYER_Z);
  private target = new Vector3(0, 0.16, PLAYER_Z);
  private meshes: InstancedMesh[];
  private shotMesh: InstancedMesh;
  private bombMesh: InstancedMesh;
  private sparkles: Sparkles;
  private stars: Points;
  private starPos = new Float32Array(300 * 3);
  private wave = 1;
  private lives = 3;
  private score = 0;
  private state: 'play' | 'over' | 'warp' | 'paused' = 'play';
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
    super(deskRoot, host, GALAGO_LAYOUT, GALAGO_PAD, 'naga-atelier:galago-best:v1');
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
    this.sparkles = new Sparkles(this.root);
    // starfield streaming toward you
    for (let i = 0; i < 300; i++) this.resetStar(i, true);
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(this.starPos, 3));
    this.stars = new Points(sg, new PointsMaterial({ size: 0.006, map: dotTexture(), color: 0xbfe8ff, transparent: true, blending: AdditiveBlending, depthWrite: false }));
    this.stars.frustumCulled = false;
    this.root.add(this.stars);
  }

  private resetStar(i: number, anywhere = false): void {
    this.starPos.set([(Math.random() - 0.5) * 1.6, Math.random() * 0.9 - 0.1, anywhere ? -2 + Math.random() * 2.3 : -2 - Math.random() * 0.5], i * 3);
  }

  protected start(): void {
    this.wave = 1;
    this.lives = 3;
    this.score = 0;
    this.spawnWave();
    this.host.say('Galago! Pinch and move to fly — you fire while you pinch.');
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
        this.aliens.push({ kind, slot, pos: slot.clone().add(new Vector3(0, 0.3, -1.2 - Math.random() * 0.6)), hp: kind === 2 ? 2 : 1, alive: true, dive: null });
      }
    this.diveCd = 2.5;
    this.state = 'play';
  }

  action(id: string): void {
    switch (id) {
      case 'start': this.start(); sfx.play('click'); break;
      case 'pause':
        if (this.state === 'over') break;
        this.state = this.state === 'paused' ? 'play' : 'paused';
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
    if (this.state === 'play') this.state = 'paused';
  }

  private fire(): void {
    if (this.state !== 'play' || this.fireCd > 0 || this.shots.length >= 5) return;
    this.fireCd = 0.2;
    this.shots.push({ pos: this.shipPos.clone().add(new Vector3(0, 0, -0.03)), vel: new Vector3(0, 0, -0.9) });
    sfx.play('tick');
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
        else {
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
    if (this.firing) this.fire();
    this.shipPos.lerp(this.target, Math.min(1, dt * 14));

    // --- simulation ---------------------------------------------------------------
    if (this.state === 'play') {
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
      if (this.diveCd <= 0) {
        this.diveCd = Math.max(0.6, 2.4 - this.wave * 0.2) * (0.6 + Math.random() * 0.8);
        const idle = this.aliens.filter((a) => a.alive && !a.dive && a.pos.distanceTo(a.slot) < 0.05);
        const a = idle[Math.floor(Math.random() * idle.length)];
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
          sfx.play('listen');
        }
      }
      // shots vs aliens
      for (const s of this.shots) {
        s.pos.addScaledVector(s.vel, dt);
        for (const a of this.aliens) {
          if (!a.alive || s.pos.distanceTo(a.pos) > 0.022) continue;
          s.pos.z = -9;
          a.hp--;
          if (a.hp <= 0) {
            a.alive = false;
            const pts = KIND_POINTS[a.kind] * (a.dive ? 2 : 1);
            this.score += pts;
            this.sparkles.burst(a.pos, KIND_COLOR[a.kind], 18, 0.35);
            sfx.play(a.kind === 2 ? 'bigclear' : 'clear');
          } else {
            this.sparkles.burst(a.pos, 0xffffff, 6, 0.2);
            sfx.play('lock');
          }
          break;
        }
      }
      this.shots = this.shots.filter((s) => s.pos.z > FORMATION_Z - 0.3);
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
      if (this.aliens.every((a) => !a.alive)) {
        this.state = 'warp';
        this.stateT = 0;
        sfx.play('levelup');
        this.host.celebrate();
        this.host.say(`Wave ${this.wave} cleared! Warping…`);
      }
    } else if (this.state === 'warp' && this.stateT > 2.2) {
      this.wave++;
      this.spawnWave();
      this.host.say(`Wave ${this.wave}.`);
    }
    this.draw(now, dt);
  }

  private hitPlayer(): void {
    this.lives--;
    this.invuln = 2;
    this.sparkles.burst(this.shipPos, 0xffb347, 40, 0.5);
    sfx.play('delete');
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
    this.panel('GALAGO', [['SCORE', String(this.score)], ['WAVE', String(this.wave)], ['SHIPS', '▲'.repeat(Math.max(0, this.lives)) || '0'], ['BEST', String(Math.max(this.best, this.score))]],
      this.state === 'over' ? 'GAME OVER' : this.state === 'paused' ? 'PAUSED' : this.state === 'warp' ? 'WAVE CLEARED!' : '');
  }

  /** test hooks */
  debugState() {
    return { state: this.state, wave: this.wave, lives: this.lives, score: this.score, aliens: this.aliens.filter((a) => a.alive).length, ship: this.shipPos.toArray() };
  }
}

/**
 * Whack-a-Gloom — nine holes on the desk; purple gloomlings pop up and you bop them with a finger
 * poke, a pinch, a controller tap, a click or the Q-W-E / A-S-D / Z-X-C keys. Gold ones are worth 3;
 * grey pebbles are decoys that cost a point. 60-second rounds, getting quicker as the clock runs down.
 */
import {
  CylinderGeometry,
  Group,
  Line3,
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
import { WHACK_LAYOUT } from '../ui/dock.js';
import { WHACK_PAD } from '../ui/screenPad.js';
import { GameBase, type GameHost, type PointerFrame } from './gameBase.js';

const ROUND_S = 60;
const SPACING = 0.1;
const HEAD_R = 0.022;
const UP_Y = 0.03;
type Kind = 'gloom' | 'gold' | 'pebble';

interface Hole {
  centre: Vector3;
  mole: Group;
  body: Mesh;
  kind: Kind;
  /** 0 = hidden, 1 = fully up */
  h: number;
  state: 'down' | 'rising' | 'up' | 'sinking' | 'bopped';
  t: number;
  stay: number;
}

const BODY_COLOR: Record<Kind, number> = { gloom: 0x8a5cf6, gold: 0xffc94a, pebble: 0x8f969e };

export class WhackAGloom extends GameBase {
  private holes: Hole[] = [];
  private sparkles: Sparkles;
  private score = 0;
  private combo = 0;
  private timeLeft = ROUND_S;
  private spawnCd = 0.8;
  private state: 'play' | 'over' | 'paused' = 'over';
  private tipWasIn = new Map<string, boolean>();
  private hitsThisRound = 0;

  constructor(deskRoot: Object3D, host: GameHost) {
    super(deskRoot, host, WHACK_LAYOUT, WHACK_PAD, 'naga-atelier:whack-best:v1', 'whack');
    const lawn = new Mesh(new CylinderGeometry(0.2, 0.21, 0.012, 48), new MeshStandardMaterial({ color: 0xd9a35b, roughness: 0.9 }) /* sandy dune, so it stands out on the green board */);
    lawn.position.set(0, 0.006, -0.05);
    this.root.add(lawn);
    const holeMat = new MeshBasicMaterial({ color: 0x0b0d10 });
    const rimMat = new MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8 });
    const eyeW = new MeshBasicMaterial({ color: 0xffffff });
    const eyeB = new MeshBasicMaterial({ color: 0x14121c });
    for (let i = 0; i < 9; i++) {
      const cx = ((i % 3) - 1) * SPACING, cz = -0.05 + (Math.floor(i / 3) - 1) * SPACING;
      const centre = new Vector3(cx, 0.012, cz);
      const hole = new Mesh(new CylinderGeometry(HEAD_R * 1.25, HEAD_R * 1.25, 0.002, 28), holeMat);
      hole.position.copy(centre).setY(0.0125);
      const rim = new Mesh(new RingGeometry(HEAD_R * 1.25, HEAD_R * 1.6, 28).rotateX(-Math.PI / 2), rimMat);
      rim.position.copy(centre).setY(0.0135);
      this.root.add(hole, rim);
      const mole = new Group();
      const mat = new MeshStandardMaterial({ color: BODY_COLOR.gloom, roughness: 0.5, emissive: 0x1a0d33 });
      const body = new Mesh(new SphereGeometry(HEAD_R, 20, 14), mat);
      body.scale.set(1, 1.15, 1);
      mole.add(body);
      for (const s of [-1, 1]) {
        const w = new Mesh(new SphereGeometry(HEAD_R * 0.28, 10, 8), eyeW);
        w.position.set(s * HEAD_R * 0.38, HEAD_R * 0.35, HEAD_R * 0.85);
        const b = new Mesh(new SphereGeometry(HEAD_R * 0.14, 8, 6), eyeB);
        b.position.set(s * HEAD_R * 0.38, HEAD_R * 0.35, HEAD_R * 1.08);
        mole.add(w, b);
      }
      mole.position.copy(centre);
      mole.visible = false;
      this.root.add(mole);
      this.holes.push({ centre, mole, body, kind: 'gloom', h: 0, state: 'down', t: 0, stay: 1 });
    }
    this.sparkles = new Sparkles(this.root);
  }

  protected override musicOn(): boolean {
    return this.state === 'play';
  }
  protected override musicTempo(): number {
    return this.timeLeft < 15 ? 4 : this.timeLeft < 35 ? 2 : 1;
  }

  protected start(): void {
    this.newRound();
    this.host.say('Whack-a-Gloom! Bop them as they pop up. Gold is worth three, skip the pebbles.');
  }

  private newRound(): void {
    this.score = 0;
    this.combo = 0;
    this.hitsThisRound = 0;
    this.timeLeft = ROUND_S;
    this.spawnCd = 0.8;
    this.state = 'play';
    for (const h of this.holes) {
      h.state = 'down';
      h.h = 0;
      h.mole.visible = false;
    }
  }

  action(id: string): void {
    if (id.startsWith('hole')) return void this.bop(Number(id.slice(4)));
    switch (id) {
      case 'start': this.newRound(); sfx.play('click'); this.host.say('Go!'); break;
      case 'pause':
        if (this.state === 'over') break;
        this.state = this.state === 'paused' ? 'play' : 'paused';
        break;
      case 'exit': this.host.exit(); break;
      case 'mic': this.host.mic(); break;
    }
  }

  key(k: string): boolean {
    const keys = 'qweasdzxc';
    const i = keys.indexOf(k);
    if (i >= 0) {
      this.bop(i);
      return true;
    }
    const map: Record<string, string> = { n: 'start', p: 'pause', Escape: 'exit' };
    if (!map[k]) return false;
    this.action(map[k]);
    return true;
  }

  pausedByHost(): void {
    if (this.state === 'play') this.state = 'paused';
  }

  /** Bop hole i (if something is up there). */
  private bop(i: number): boolean {
    const h = this.holes[i];
    if (!h || this.state !== 'play' || h.h < 0.35 || h.state === 'bopped' || h.state === 'down') {
      if (h && this.state === 'play') sfx.play('thud');
      return false;
    }
    h.state = 'bopped';
    h.t = 0;
    const at = h.centre.clone().setY(UP_Y * h.h + HEAD_R);
    if (h.kind === 'pebble') {
      this.score = Math.max(0, this.score - 1);
      this.combo = 0;
      sfx.play('error');
      sfx.play('thud');
      this.sparkles.burst(at, 0x9aa3ad, 10, 0.2);
    } else {
      this.combo++;
      this.hitsThisRound++;
      const pts = (h.kind === 'gold' ? 3 : 1) + (this.combo >= 5 ? 1 : 0);
      this.score += pts;
      sfx.play('bop', h.kind === 'gold' ? 1.3 : 0.9 + Math.random() * 0.25);
      if (h.kind === 'gold') sfx.play('coin');
      else sfx.play('squeak');
      this.sparkles.burst(at, h.kind === 'gold' ? 0xffd166 : 0xc5a8ff, h.kind === 'gold' ? 30 : 16, 0.3);
      if (this.combo === 5) this.host.say('Combo! Bonus points.');
    }
    return true;
  }

  protected tick(frames: PointerFrame[], now: number, dt: number): void {
    // --- input: finger pokes (move into a head), pinches, clicks --------------------
    for (const f of frames) {
      const p = f.p;
      const tip = p.indexTip && p.kind !== 'mouse' ? this.deskRoot.worldToLocal(p.indexTip.clone()) : null;
      this.holes.forEach((h, i) => {
        // hit zone: the whole popped-up body (hole rim → just above the head), nudged toward the
        // face side, so a poke at the face or body counts — not only a dead-centre head tap
        const moleY = h.centre.y - HEAD_R * 1.4 + (UP_Y + HEAD_R * 1.4) * h.h;
        const a = new Vector3(h.centre.x, h.centre.y, h.centre.z + HEAD_R * 0.35);
        const b = new Vector3(h.centre.x, Math.max(h.centre.y, moleY + HEAD_R * 0.6), h.centre.z + HEAD_R * 0.35);
        const seg = new Line3(a, b);
        const dist = (pt: Vector3) => seg.closestPointToPoint(pt, true, new Vector3()).distanceTo(pt);
        if (tip) {
          const k = `${p.id}:${i}`;
          const inside = dist(tip) < HEAD_R * 1.6;
          if (inside && !this.tipWasIn.get(k)) this.bop(i);
          this.tipWasIn.set(k, inside);
        }
        if (f.down) {
          let near = false;
          if (p.kind === 'mouse') {
            const ray = this.mouseRayLocal();
            near = ray ? ray.distanceSqToSegment(a, b) < (HEAD_R * 1.7) ** 2 : Math.hypot(f.local.x - h.centre.x, f.local.z - h.centre.z) < HEAD_R * 1.9;
          } else near = dist(f.local) < HEAD_R * 1.9;
          if (near) this.bop(i);
        }
      });
    }
    if (this.state === 'play') {
      this.timeLeft -= dt;
      const pace = 1 - this.timeLeft / ROUND_S; // 0 → 1 over the round
      this.spawnCd -= dt;
      if (this.spawnCd <= 0) {
        this.spawnCd = (0.85 - pace * 0.45) * (0.6 + Math.random() * 0.8);
        const free = this.holes.filter((h) => h.state === 'down');
        const h = free[Math.floor(Math.random() * free.length)];
        if (h) {
          const r = Math.random();
          h.kind = r < 0.12 ? 'gold' : r < 0.24 + pace * 0.08 ? 'pebble' : 'gloom';
          (h.body.material as MeshStandardMaterial).color.setHex(BODY_COLOR[h.kind]);
          (h.body.material as MeshStandardMaterial).emissive.setHex(h.kind === 'gold' ? 0x4a3300 : h.kind === 'pebble' ? 0x111111 : 0x1a0d33);
          h.state = 'rising';
          h.t = 0;
          h.stay = (h.kind === 'gold' ? 0.75 : 1.25) - pace * 0.45;
          h.mole.visible = true;
          sfx.play('pop');
        }
      }
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.state = 'over';
        const rec = this.saveBest(this.score);
        sfx.play(rec ? 'levelup' : 'gameover');
        if (rec) this.host.celebrate();
        this.host.say(rec ? `Time! New best: ${this.score}. Press NEW GAME for another round.` : `Time! You scored ${this.score}. Press NEW GAME for another round.`);
      }
    }
    // --- animate moles ---------------------------------------------------------------
    for (const h of this.holes) {
      if (this.state === 'paused') break;
      h.t += dt;
      switch (h.state) {
        case 'rising':
          h.h = Math.min(1, h.h + dt * 7);
          if (h.h >= 1) { h.state = 'up'; h.t = 0; }
          break;
        case 'up':
          if (h.t > h.stay || this.state === 'over') { h.state = 'sinking'; if (h.kind !== 'pebble' && this.state === 'play') this.combo = 0; }
          break;
        case 'sinking':
        case 'bopped':
          h.h = Math.max(0, h.h - dt * (h.state === 'bopped' ? 9 : 5));
          if (h.h <= 0) { h.state = 'down'; h.mole.visible = false; }
          break;
      }
      const squash = h.state === 'bopped' ? 0.55 : 1;
      h.mole.position.set(h.centre.x, h.centre.y - HEAD_R * 1.4 + (UP_Y + HEAD_R * 1.4) * h.h, h.centre.z);
      h.mole.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      h.mole.rotation.y = Math.sin(now / 300 + h.centre.x * 30) * 0.3;
    }
    this.sparkles.update(dt);
    this.panel('WHACK-A-GLOOM', [['SCORE', String(this.score)], ['TIME', String(Math.ceil(this.timeLeft))], ['COMBO', this.combo >= 2 ? `×${this.combo}` : '-'], ['BEST', String(Math.max(this.best, this.score))]],
      this.state === 'over' ? 'TIME! PRESS NEW GAME' : this.state === 'paused' ? 'PAUSED' : '');
  }

  /** test hooks */
  debugState() {
    return { state: this.state, score: this.score, time: this.timeLeft, up: this.holes.map((h) => (h.state === 'up' ? h.kind : null)) };
  }
  debugHoleWorld(i: number): number[] {
    const h = this.holes[i];
    return this.deskRoot.localToWorld(h.centre.clone().setY(UP_Y + HEAD_R)).toArray();
  }
  debugForceUp(i: number, kind: Kind = 'gloom'): void {
    const h = this.holes[i];
    h.kind = kind;
    h.state = 'up';
    h.h = 1;
    h.t = -5;
    h.mole.visible = true;
  }
}

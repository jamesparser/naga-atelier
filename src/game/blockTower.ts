/**
 * Block Tower — a stacking-blocks game with real physics. Pinch a block and slowly pull it out of the
 * tower (or click it / select it with the arrows and push), then put it on top. One fall ends the game.
 */
import * as CANNON from 'cannon-es';
import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Ray,
  RingGeometry,
  Vector3,
  type Object3D,
} from 'three';
import { sfx } from '../audio/sfx.js';
import { Sparkles } from '../fx/sparkles.js';
import { TOWER_LAYOUT } from '../ui/dock.js';
import { TOWER_PAD } from '../ui/screenPad.js';
import { GameBase, type GameHost, type PointerFrame } from './gameBase.js';
import { BH, BL, BW, createTower, createTowerWorld, driveHeld, holdBlock, longAxis, THIN, makeBlockBody, slotPose, towerFell, type TowerBlock } from './towerPhysics.js';

const S = 0.12; // render scale: sim metres -> desk metres
const ORIGIN = new Vector3(0, 0.0, -0.06);
const WOOD = [0xd9b07a, 0xc99a63, 0xe3c08f, 0xbf8f5a];

export class BlockTower extends GameBase {
  private world!: CANNON.World;
  private blocks: TowerBlock[] = [];
  private g = new Group();
  private mesh: InstancedMesh;
  private sparkles: Sparkles;
  private grab: { id: number; block: TowerBlock; localPt: CANNON.Vec3; target: CANNON.Vec3; startLocal: Vector3; startWorld: CANNON.Vec3; home: CANNON.Vec3; mouse: boolean } | null = null;
  private selected = 0;
  private tried = new Set<number>();
  private hover: TowerBlock | null = null;
  private score = 0;
  private state: 'play' | 'fell' = 'play';
  private fellT = 0;
  private acc = 0;
  private tmpM = new Matrix4();
  private tmpQ = new Quaternion();
  private tmpC = new Color();
  private ring: Mesh;

  constructor(deskRoot: Object3D, host: GameHost) {
    super(deskRoot, host, TOWER_LAYOUT, TOWER_PAD, 'naga-atelier:tower-best:v1', 'tower');
    this.g.position.copy(ORIGIN);
    this.g.scale.setScalar(S);
    this.root.add(this.g);
    const base = new Mesh(new BoxGeometry(1.4, 0.04, 1.4), new MeshStandardMaterial({ color: 0x3a4a5c, roughness: 0.8 }));
    base.position.y = -0.02;
    this.g.add(base);
    this.mesh = new InstancedMesh(new BoxGeometry(BL - 0.004, BH - 0.004, BW - 0.004), new MeshStandardMaterial({ roughness: 0.65, metalness: 0 }), 80);
    this.mesh.frustumCulled = false;
    this.g.add(this.mesh);
    this.ring = new Mesh(new RingGeometry(0.62, 0.7, 40).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.5, depthWrite: false }));
    this.ring.position.y = 0.002;
    this.g.add(this.ring);
    this.sparkles = new Sparkles(this.root);
  }

  protected override musicOn(): boolean {
    return this.state === 'play';
  }
  protected override musicTempo(): number {
    return 1 + Math.floor(this.score / 4);
  }

  protected start(): void {
    this.reset();
    this.host.say('Block Tower! Pinch a loose block and pull it out slowly, then put it on top.');
  }

  private reset(): void {
    this.world = createTowerWorld();
    this.blocks = createTower(this.world);
    this.grab = null;
    this.auto = null;
    this.score = 0;
    this.state = 'play';
    this.selected = this.blocks.findIndex((b) => b.thin) ;
    this.acc = 0;
  }

  action(id: string): void {
    switch (id) {
      case 'start': this.reset(); sfx.play('click'); this.host.say('New tower.'); break;
      case 'totop': this.toTop(this.grab?.block ?? this.mostOut()); break;
      case 'exit': this.host.exit(); break;
      case 'mic': this.host.mic(); break;
      case 'prev': this.select(-1, 0); break;
      case 'nextBlock': this.select(1, 0); break;
      case 'up': this.select(0, 1); break;
      case 'down': this.select(0, -1); break;
      case 'push': this.push(this.blocks[this.selected]); break;
    }
  }

  key(k: string): boolean {
    const map: Record<string, string> = { ArrowLeft: 'prev', ArrowRight: 'nextBlock', ArrowUp: 'up', ArrowDown: 'down', ' ': 'push', t: 'totop', n: 'start', Escape: 'exit' };
    const a = map[k];
    if (!a) return false;
    this.action(a);
    return true;
  }

  private select(dSlot: number, dLayer: number): void {
    const cur = this.blocks[this.selected];
    const top = Math.max(...this.blocks.map((b) => b.layer));
    let layer = Math.max(0, Math.min(top, cur.layer + dLayer));
    let slot = cur.slot + dSlot;
    if (slot < 0) { slot = 2; layer = Math.max(0, layer - 1); }
    if (slot > 2) { slot = 0; layer = Math.min(top, layer + 1); }
    const i = this.blocks.findIndex((b) => b.layer === layer && b.slot === slot);
    if (i >= 0) this.selected = i;
    sfx.play('tick');
  }

  /** keyboard / pad / click push: slide the block a step along its length, away from you */
  private auto: { block: TowerBlock; home: CANNON.Vec3; goal: CANNON.Vec3; t: number } | null = null;
  private push(b: TowerBlock | undefined): void {
    if (!b || this.state !== 'play' || this.grab) return;
    const ax = longAxis(b.body);
    ax.y = 0;
    ax.normalize();
    // away from the viewer: blocks along z go back (-z); blocks along x go right
    const sign = Math.abs(ax.z) > Math.abs(ax.x) ? -Math.sign(ax.z) : Math.sign(ax.x || 1);
    if (this.auto?.block === b) this.auto.goal = this.auto.goal.vadd(ax.scale(0.16 * sign));
    else {
      if (this.auto) holdBlock(this.auto.block.body, false);
      this.auto = { block: b, home: b.body.position.clone(), goal: b.body.position.vadd(ax.scale(0.16 * sign)), t: 0 };
      holdBlock(b.body, true);
    }
    this.auto.t = 0;
    sfx.play('tick');
  }

  /** The block pulled furthest from its slot (not in the top layer). */
  private mostOut(): TowerBlock | null {
    let best: TowerBlock | null = null, bestD = BL * 0.3;
    const top = Math.max(...this.blocks.map((b) => b.layer));
    for (const b of this.blocks) {
      if (b.layer >= top - 0) continue;
      const p = slotPose(b.layer, b.slot);
      const d = Math.hypot(b.body.position.x - p.x, b.body.position.z - p.z);
      if (d > bestD) { bestD = d; best = b; }
    }
    return best;
  }

  private toTop(b: TowerBlock | null): void {
    if (!b || this.state !== 'play') {
      this.host.say('Pull a block out first — then I can put it on top.');
      return;
    }
    const top = Math.max(...this.blocks.filter((x) => x !== b).map((x) => x.layer));
    const used = this.blocks.filter((x) => x !== b && x.layer === top).map((x) => x.slot);
    const layer = used.length >= 3 ? top + 1 : top;
    const slot = used.length >= 3 ? 1 : [1, 0, 2].find((s) => !used.includes(s))!;
    this.world.removeBody(b.body);
    const body = makeBlockBody(this.world, layer, slot);
    body.position.y += 0.02;
    b.body = body;
    b.layer = layer;
    b.slot = slot;
    b.homeY = slotPose(layer, slot).y;
    b.thin = false;
    if (this.grab?.block === b) this.grab = null;
    if (this.auto?.block === b) this.auto = null;
    this.score++;
    this.saveBest(this.score);
    sfx.play('thud');
    sfx.play('snap');
    const at = this.g.localToWorld(new Vector3(body.position.x, body.position.y, body.position.z));
    this.sparkles.burst(this.root.worldToLocal(at), 0xffd166, 14, 0.25);
    if (this.score % 5 === 0) {
      this.host.celebrate();
      this.host.say(`${this.score} blocks moved — ${layer + 1} layers tall!`);
    }
  }

  private toSim(local: Vector3): CANNON.Vec3 {
    const v = local.clone().sub(ORIGIN).divideScalar(S);
    return new CANNON.Vec3(v.x, v.y, v.z);
  }

  /** Nearest block to a desk-local point, within reach (rendered metres). */
  private pick(local: Vector3, reach = 0.014): { block: TowerBlock; pt: CANNON.Vec3 } | null {
    const p = this.toSim(local);
    let best: { block: TowerBlock; pt: CANNON.Vec3 } | null = null, bestD = reach / S;
    for (const b of this.blocks) {
      const lp = b.body.pointToLocalFrame(p);
      const c = new CANNON.Vec3(Math.max(-BL / 2, Math.min(BL / 2, lp.x)), Math.max(-BH / 2, Math.min(BH / 2, lp.y)), Math.max(-BW / 2, Math.min(BW / 2, lp.z)));
      const d = c.vsub(lp).length();
      if (d < bestD) { bestD = d; best = { block: b, pt: c }; }
    }
    return best;
  }

  /** Ray (desk-local) vs blocks: first hit. */
  private pickRay(ray: Ray): { block: TowerBlock; pt: CANNON.Vec3 } | null {
    const o = this.toSim(ray.origin);
    const d = new CANNON.Vec3(ray.direction.x, ray.direction.y, ray.direction.z);
    let best: { block: TowerBlock; pt: CANNON.Vec3 } | null = null, bestT = Infinity;
    const half = [BL / 2, BH / 2, BW / 2];
    for (const b of this.blocks) {
      const lo = b.body.pointToLocalFrame(o);
      const ld = b.body.vectorToLocalFrame(d);
      let t0 = -Infinity, t1 = Infinity;
      const oo = [lo.x, lo.y, lo.z], dd = [ld.x, ld.y, ld.z];
      let ok = true;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(dd[a]) < 1e-9) { if (Math.abs(oo[a]) > half[a]) { ok = false; break; } continue; }
        let ta = (-half[a] - oo[a]) / dd[a], tb = (half[a] - oo[a]) / dd[a];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 > 0 && t0 < bestT) {
        bestT = t0;
        best = { block: b, pt: new CANNON.Vec3(lo.x + ld.x * t0, lo.y + ld.y * t0, lo.z + ld.z * t0) };
      }
    }
    return best;
  }

  protected tick(frames: PointerFrame[], now: number, dt: number): void {
    this.hover = null;
    for (const f of frames) {
      const p = f.p;
      const mouse = p.kind === 'mouse';
      if (!this.grab && !mouse) {
        const h = this.pick(f.local, 0.02);
        if (h) this.hover = h.block;
      }
      if (mouse && !this.grab) {
        const ray = this.mouseRayLocal();
        const h = ray ? this.pickRay(ray) : null;
        if (h) this.hover = h.block;
      }
      // hands pick once the pinch has settled (while the fingers close, the point sweeps past other blocks)
      if (f.up || !p.pinching) this.tried.delete(p.id);
      const tryPick = mouse ? f.down : p.pinching && !f.settling && !this.tried.has(p.id);
      if (tryPick && !this.grab && this.state === 'play') {
        this.tried.add(p.id);
        if (this.auto) { holdBlock(this.auto.block.body, false); this.auto = null; }
        const h = mouse ? (() => { const r = this.mouseRayLocal(); return r ? this.pickRay(r) : null; })() : this.pick(f.local);
        if (h) {
          const w = h.block.body.pointToWorldFrame(h.pt);
          this.grab = { id: p.id, block: h.block, localPt: h.pt, target: w.clone(), startLocal: f.local.clone(), startWorld: w.clone(), home: h.block.body.position.clone(), mouse };
          holdBlock(h.block.body, true);
          this.selected = this.blocks.indexOf(h.block);
          sfx.play('pickup');
          sfx.play('creak');
        }
      }
      if (this.grab?.id === p.id) {
        if (f.up || !p.pinching) {
          const b = this.grab.block;
          const wasMouse = this.grab.mouse;
          const moved = b.body.position.vsub(this.grab.home).length();
          this.grab = null;
          holdBlock(b.body, false);
          if (wasMouse && moved < 0.02) this.push(b); // a plain click pushes it a step
          // pulled clear of the tower: it goes on top automatically
          if (Math.hypot(b.body.position.x, b.body.position.z) > 0.5) this.toTop(b);
        } else if (this.grab.mouse) {
          // mouse: slide along the block's long axis by the desk-plane drag
          const d = this.toSim(f.local).vsub(this.toSim(this.grab.startLocal));
          const ax = longAxis(this.grab.block.body);
          ax.y = 0;
          ax.normalize();
          this.grab.target = this.grab.startWorld.vadd(ax.scale(d.dot(ax)));
        } else {
          this.grab.target = this.toSim(f.local);
        }
      }
    }
    // --- physics -------------------------------------------------------------------------
    this.acc += Math.min(dt, 0.05);
    while (this.acc >= 1 / 120) {
      if (this.grab) {
        const b = this.grab.block.body;
        // where the block centre must be so the grabbed point lands on the hand
        const offset = b.pointToWorldFrame(this.grab.localPt).vsub(b.position);
        driveHeld(b, this.grab.home, this.grab.target.vsub(offset), 1 / 15);
      } else if (this.auto) {
        driveHeld(this.auto.block.body, this.auto.home, this.auto.goal, 1 / 12);
        this.auto.t += 1 / 120;
        if (this.auto.t > 0.45) {
          const b = this.auto.block;
          holdBlock(b.body, false);
          this.auto = null;
          if (Math.hypot(b.body.position.x, b.body.position.z) > 0.55) this.toTop(b);
        }
      }
      this.world.step(1 / 120);
      this.acc -= 1 / 120;
    }
    if (this.state === 'play' && towerFell(this.blocks, this.grab?.block.body ?? null)) {
      this.fellT += dt;
      if (this.fellT > 0.35) {
        this.state = 'fell';
        this.grab = null;
        const rec = this.saveBest(this.score);
        sfx.play('explode');
        sfx.play('gameover');
        this.host.say(rec ? `Timber! New best: ${this.score} blocks. Press NEW GAME to rebuild.` : `Timber! ${this.score} blocks moved. Press NEW GAME to rebuild.`);
      }
    } else this.fellT = 0;
    // wood scraping while a block slides
    const held = this.grab?.block.body ?? this.auto?.block.body;
    const slide = held ? held.velocity.length() : 0;
    sfx.loop('scrape', Math.min(0.8, slide * 1.5), 180 + slide * 300);
    this.draw(now);
    this.sparkles.update(dt);
    const top = Math.max(...this.blocks.map((b) => b.layer));
    this.panel('BLOCK TOWER', [['MOVED', String(this.score)], ['LAYERS', String(top + 1)], ['BEST', String(Math.max(this.best, this.score))]],
      this.state === 'fell' ? 'TIMBER! NEW GAME' : this.grab ? 'PULL SLOWLY…' : '');
  }

  private draw(now: number): void {
    this.blocks.forEach((b, i) => {
      const p = b.body.position, q = b.body.quaternion;
      this.tmpQ.set(q.x, q.y, q.z, q.w);
      this.tmpM.compose(new Vector3(p.x, p.y, p.z), this.tmpQ, new Vector3(1, b.thin ? (BH - THIN) / BH : 1, 1));
      this.mesh.setMatrixAt(i, this.tmpM);
      this.tmpC.setHex(WOOD[(b.layer * 3 + b.slot * 7) % WOOD.length]);
      if (this.grab?.block === b) this.tmpC.setHex(0xffd166);
      else if (this.hover === b) this.tmpC.lerp(new Color(0xfff2c4), 0.6);
      else if (i === this.selected && this.state === 'play') this.tmpC.lerp(new Color(0x9ff7ff), 0.35 + 0.15 * Math.sin(now / 200));
      this.mesh.setColorAt(i, this.tmpC);
    });
    this.mesh.count = this.blocks.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** test hooks */
  debugState() {
    return { state: this.state, score: this.score, layers: Math.max(...this.blocks.map((b) => b.layer)) + 1, grabbed: !!this.grab, selected: this.selected };
  }
  /** desk→world point at the end of a block (layer, slot), for e2e pinches */
  debugBlockEndWorld(layer: number, slot: number): number[] {
    const b = this.blocks.find((x) => x.layer === layer && x.slot === slot)!;
    const w = b.body.pointToWorldFrame(new CANNON.Vec3(BL / 2 - 0.05, 0, 0));
    return this.g.localToWorld(new Vector3(w.x, w.y, w.z)).toArray();
  }
}

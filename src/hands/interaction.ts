/**
 * Hands-first sculpting state machine (one per pointer, so both hands work independently).
 *
 *   pinch on block + move      -> carry its group (roof, walls, ...) ; release snaps to grid
 *   pinch on block + hold still -> detach that single block and carry it
 *   quick pinch-tap on block   -> paint it with the active swatch
 *   quick pinch-tap in empty   -> place a block of the active swatch
 *   release over the trash     -> delete what you carry
 *   poke / pinch a dock button -> mic, undo, redo, colour, magic, recenter
 *
 * Hands always win: agent commands cancel nothing the user is holding until it is dropped.
 */
import { Vector3, type Object3D } from 'three';
import { CARRY_LIFT, CELL, DRAG_THRESHOLD, GRID_Y, HOLD_DETACH_MS, grabRadius } from '../config.js';
import { sfx } from '../audio/sfx.js';
import { CarryMesh, GhostMesh, cellAt, cellCenter, type VoxelRenderer } from '../blocks/voxelRenderer.js';
import { groupOf, inBounds, key, parseKey, type Cell, type CellChange, type VoxelModel } from '../blocks/voxelModel.js';
import type { Dock, DockAction } from '../ui/dock.js';
import { TRASH_POS, TRASH_RADIUS, type DeskVisuals } from '../scene/desk.js';
import type { Pointer } from './handInput.js';

type V3i = [number, number, number];

/** A pinch that travels less than this is a tap (paint / place). */
const TAP_TOLERANCE = 0.04;

interface Carry {
  keys: string[];
  rel: Array<[V3i, Cell]>;
  lift: CellChange[];
  anchor: V3i;
  grabOffset: Vector3;
  mesh: CarryMesh;
  ghost: GhostMesh;
  detached: boolean;
  group: string | null;
  target: { delta: V3i; valid: boolean; trash: boolean };
  /** set while springing back after an invalid drop */
  returning?: { t0: number; from: Vector3 };
}

type State =
  | { k: 'idle' }
  | { k: 'ignore' }
  | { k: 'dock' }
  | { k: 'press'; t0: number; start: Vector3; hit: string | null; frames: number; settled: number; firm: Vector3 }
  | { k: 'carry'; c: Carry };

export type InteractionEvent =
  | { type: 'carried'; keys: number; group: string | null; detached: boolean; moved: boolean }
  | { type: 'placed' }
  | { type: 'painted' }
  | { type: 'deleted'; count: number }
  | { type: 'detached' }
  | { type: 'trashTap' }
  | { type: 'dock'; action: DockAction };

/** the six face neighbours of a cell */
const NEIGHBOURS: V3i[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export class Interaction {
  private states = new Map<number, State>();
  private wasPinching = new Map<number, boolean>();
  private meshes = new Map<number, { carry: CarryMesh; ghost: GhostMesh }>();
  private local = new Vector3();
  /** Disable placing/painting (e.g. while the onboarding wants a specific action). */
  enabled = true;

  constructor(
    private model: VoxelModel,
    private renderer: VoxelRenderer,
    private desk: DeskVisuals,
    private dock: Dock,
    private deskRoot: Object3D,
    private shadows: boolean,
    private emit: (e: InteractionEvent) => void,
  ) {}

  /** Anything currently held is dropped back where it came from (no history). */
  cancelAll(): void {
    for (const [id, st] of this.states) {
      if (st.k === 'carry') this.restore(st.c);
      this.states.set(id, { k: 'ignore' });
    }
    this.desk.setTrashHot(false);
  }

  get busy(): boolean {
    for (const s of this.states.values()) if (s.k === 'carry') return true;
    return false;
  }

  update(pointers: Pointer[], now: number): void {
    const hover: string[] = [];
    const tips = new Map<number, Vector3>();
    let trashHot = false;

    for (const p of pointers) {
      const st = this.states.get(p.id) ?? { k: 'idle' };
      if (!p.active) {
        // Tracking lost mid-carry: put things back exactly where they were.
        if (st.k === 'carry') this.restore(st.c);
        this.states.set(p.id, { k: 'idle' });
        this.wasPinching.set(p.id, false);
        continue;
      }
      const local = this.deskRoot.worldToLocal(this.local.copy(p.pinchPoint)).clone();
      const was = this.wasPinching.get(p.id) ?? false;
      const down = p.pinching && !was;
      const up = !p.pinching && was;
      this.wasPinching.set(p.id, p.pinching);

      if (p.indexTip && !p.pinching && st.k !== 'carry' && p.kind !== 'mouse') {
        tips.set(p.id, this.deskRoot.worldToLocal(p.indexTip.clone()));
      }

      switch (st.k) {
        case 'idle': {
          if (down) {
            const action = this.dock.hitTest(local, 0.012);
            if (action) {
              this.dock.flash(action, now);
              this.emit({ type: 'dock', action });
              this.states.set(p.id, { k: 'dock' });
              break;
            }
            this.states.set(p.id, { k: 'press', t0: now, start: local.clone(), hit: this.pick(local), frames: 0, settled: now, firm: local.clone() });
            break;
          }
          if (!p.pinching) {
            const h = this.pick(local, 1.3);
            if (h) hover.push(...this.groupKeys(h));
          }
          break;
        }
        case 'ignore':
        case 'dock':
          if (!p.pinching) this.states.set(p.id, { k: 'idle' });
          break;
        case 'press': {
          // Fingers are still closing during the first ~120 ms; let the anchor settle with them.
          if (now - st.t0 < 120 || ++st.frames <= 3) {
            st.start.copy(local);
            st.hit = this.pick(local) ?? st.hit;
            st.settled = now;
          }
          // While the fingers are opening, the midpoint drifts; judge movement by the last firm pinch.
          if (p.strength > 0.75 || p.kind !== 'hand') st.firm.copy(local);
          const moved = st.firm.distanceTo(st.start);
          if (st.hit && !this.model.cells.has(st.hit)) {
            this.states.set(p.id, { k: 'ignore' }); // block vanished (agent/undo)
            break;
          }
          if (!st.hit) {
            // pinch in empty space: a see-through cube shows where the block will go; move to aim,
            // open your fingers to place it there
            const ghost = this.meshesFor(p.id).ghost;
            const plan = this.enabled ? this.planTap(null, st.firm) : null;
            if (plan && 'place' in plan) ghost.show([parseKey(plan.place)], true);
            else ghost.hide();
            if (up) {
              ghost.hide();
              if (this.enabled) this.tap(null, st.firm);
              this.states.set(p.id, { k: 'idle' });
            }
            break;
          }
          if (up) {
            if (moved < TAP_TOLERANCE && this.enabled) this.tap(st.hit, st.start);
            this.states.set(p.id, { k: 'idle' });
            break;
          }
          if (st.hit) {
            const cell = this.model.cells.get(st.hit)!;
            if (moved > DRAG_THRESHOLD) {
              this.startCarry(p.id, st.hit, cell.cl ? this.groupKeys(st.hit) : [st.hit], false, local);
            } else if (now - st.settled > HOLD_DETACH_MS) {
              const detach = !!cell.cl && this.groupKeys(st.hit).length > 1;
              this.startCarry(p.id, st.hit, [st.hit], detach, local);
              if (detach) {
                sfx.play('detach');
                this.emit({ type: 'detached' });
              }
            } else if (cell.cl && now - st.settled > HOLD_DETACH_MS * 0.4) {
              // Holding still: narrow the highlight to the one block that will pop free.
              hover.push(st.hit);
            } else {
              hover.push(...(cell.cl ? this.groupKeys(st.hit) : [st.hit]));
            }
          } else if (moved > TAP_TOLERANCE) {
            this.states.set(p.id, { k: 'ignore' });
          }
          break;
        }
        case 'carry': {
          const c = st.c;
          if (c.returning) break;
          if (up) {
            this.drop(p.id, c, now);
            break;
          }
          if (p.strength > 0.75 || p.kind !== 'hand') this.track(c, local);
          if (c.target.trash) trashHot = true;
          break;
        }
      }
    }

    // Springing-back carries finish on their own.
    for (const [id, st] of this.states) {
      if (st.k === 'carry' && st.c.returning) this.animateReturn(id, st.c, now);
    }

    this.desk.setTrashHot(trashHot);
    this.renderer.setHover(hover);
    for (const action of this.dock.updatePokes(tips, now, pointers.filter((q) => q.active).map((q) => this.deskRoot.worldToLocal(q.pinchPoint.clone())))) this.emit({ type: 'dock', action });
  }

  /** Nearest occupied cell to a desk-local point within the grab radius. */
  private pick(local: Vector3, radiusScale = 1): string | null {
    const [cx, cy, cz] = cellAt(local);
    let best: string | null = null;
    let bestD = grabRadius() * radiusScale;
    const c = new Vector3();
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const k = key(cx + dx, cy + dy, cz + dz);
          if (!this.model.cells.has(k)) continue;
          const d = cellCenter(cx + dx, cy + dy, cz + dz, c).distanceTo(local);
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
    return best;
  }

  private groupKeys(k: string): string[] {
    const cell = this.model.cells.get(k);
    if (!cell?.cl) return [k];
    return this.model.keysInGroup(cell.cl);
  }

  /** What a tap at `at` would do: paint a block, place a new one (and where), or explain the bin. */
  private planTap(hit: string | null, at: Vector3): { paint: string } | { place: string } | { bin: true } | null {
    if (Math.hypot(at.x - TRASH_POS.x, at.z - TRASH_POS.z) < TRASH_RADIUS + 0.02) return { bin: true };
    const [x, cy, z] = cellAt(at);
    // Paint when the pinch is in (or right at the surface of) a block; otherwise place a new
    // block exactly in the empty cell under your fingers, so you can build beside and between blocks.
    const hitCentre = hit ? cellCenter(...parseKey(hit), new Vector3()) : null;
    if (hit && (this.model.cells.has(key(x, cy, z)) || hitCentre!.distanceTo(at) < CELL * 0.6)) return { paint: hit };
    if (at.y < -0.03 || cy >= GRID_Y) return null;
    let y = Math.max(0, cy);
    if (!inBounds(x, y, z)) return null;
    // occupied (pinch inside a column): stack on top of it
    while (y < GRID_Y && this.model.cells.has(key(x, y, z))) y++;
    // empty: it stays where you put it if it touches any block; otherwise it drops onto what's below
    const touches = (yy: number) => yy === 0 || NEIGHBOURS.some(([ox, oy, oz]) => this.model.cells.has(key(x + ox, yy + oy, z + oz)));
    while (y > 0 && !touches(y)) y--;
    if (y >= GRID_Y) return null;
    return { place: key(x, y, z) };
  }

  private tap(hit: string | null, at: Vector3): void {
    const plan = this.planTap(hit, at);
    if (!plan) return;
    if ('bin' in plan) {
      this.emit({ type: 'trashTap' }); // tapping the bin itself: explain how it works
      return;
    }
    const color = this.dock.swatch;
    if ('paint' in plan) {
      const cell = this.model.cells.get(plan.paint);
      if (!cell) return;
      if (cell.c === color) {
        // already this colour: grow a new block out of the face you tapped (build sideways/up)
        const [bx, by, bz] = parseKey(plan.paint);
        const off = at.clone().sub(cellCenter(bx, by, bz, new Vector3()));
        const axis = Math.abs(off.x) >= Math.abs(off.y) && Math.abs(off.x) >= Math.abs(off.z) ? 0 : Math.abs(off.y) >= Math.abs(off.z) ? 1 : 2;
        const n: V3i = [0, 0, 0];
        n[axis] = Math.sign(off.getComponent(axis)) || 1;
        const k = key(bx + n[0], by + n[1], bz + n[2]);
        if (!inBounds(bx + n[0], by + n[1], bz + n[2]) || this.model.cells.has(k) || by + n[1] < 0) return;
        this.model.commit('place', this.model.diff([[k, { c: color, cl: null }]]));
        this.renderer.animateSpawn([k], performance.now(), 0);
        sfx.play('place');
        this.emit({ type: 'placed' });
        return;
      }
      this.model.commit('paint', this.model.diff([[plan.paint, { ...cell, c: color }]]));
      sfx.play('paint');
      this.emit({ type: 'painted' });
      return;
    }
    this.model.commit('place', this.model.diff([[plan.place, { c: color, cl: null }]]));
    this.renderer.animateSpawn([plan.place], performance.now(), 0);
    sfx.play('place');
    this.emit({ type: 'placed' });
  }



  private meshesFor(id: number): { carry: CarryMesh; ghost: GhostMesh } {
    let m = this.meshes.get(id);
    if (!m) {
      m = { carry: new CarryMesh(this.deskRoot, this.shadows), ghost: new GhostMesh(this.deskRoot) };
      this.meshes.set(id, m);
    }
    return m;
  }

  private startCarry(id: number, anchorKey: string, keys: string[], detached: boolean, local: Vector3): void {
    const anchor = parseKey(anchorKey);
    const anchorCell = this.model.cells.get(anchorKey)!;
    const rel: Array<[V3i, Cell]> = keys.map((k) => {
      const p = parseKey(k);
      const c = this.model.cells.get(k)!;
      return [[p[0] - anchor[0], p[1] - anchor[1], p[2] - anchor[2]], detached ? { ...c, cl: null } : { ...c }];
    });
    const lift = this.model.diff(keys.map((k) => [k, null]));
    this.model.silent(lift);
    const { carry, ghost } = this.meshesFor(id);
    carry.show(rel);
    const centre = cellCenter(anchor[0], anchor[1], anchor[2]);
    const c: Carry = {
      keys,
      rel,
      lift,
      anchor,
      grabOffset: centre.sub(local),
      mesh: carry,
      ghost,
      detached,
      group: anchorCell.cl ? groupOf(anchorCell.cl) : null,
      target: { delta: [0, 0, 0], valid: true, trash: false },
    };
    this.states.set(id, { k: 'carry', c });
    sfx.play('pickup', detached ? 1.2 : keys.length > 1 ? 0.8 : 1);
    this.track(c, local);
  }

  private fits(rel: Array<[V3i, Cell]>, anchor: V3i, d: V3i): boolean {
    for (const [[x, y, z]] of rel) {
      const nx = anchor[0] + x + d[0], ny = anchor[1] + y + d[1], nz = anchor[2] + z + d[2];
      if (!inBounds(nx, ny, nz) || this.model.cells.has(key(nx, ny, nz))) return false;
    }
    return true;
  }

  /** A carried piece stays put if any block touches it: below, beside or above (so lintels,
   * arches and overhangs work). Only a piece touching nothing falls to the desk. */
  private supported(rel: Array<[V3i, Cell]>, anchor: V3i, d: V3i): boolean {
    const own = new Set(rel.map(([[x, y, z]]) => key(x, y, z)));
    for (const [[x, y, z]] of rel) {
      const nx = anchor[0] + x + d[0], ny = anchor[1] + y + d[1], nz = anchor[2] + z + d[2];
      if (ny === 0) return true;
      for (const [ox, oy, oz] of NEIGHBOURS) {
        if (own.has(key(x + ox, y + oy, z + oz))) continue;
        if (this.model.cells.has(key(nx + ox, ny + oy, nz + oz))) return true;
      }
    }
    return false;
  }

  private track(c: Carry, local: Vector3): void {
    const pos = local.clone().add(c.grabOffset);
    pos.y += CARRY_LIFT;
    c.mesh.group.position.copy(pos);
    // over the bin = your HAND is over it (big objects are carried far from their corner),
    // or the carried object's centre is
    const inBin = (v: Vector3) => Math.hypot(v.x - TRASH_POS.x, v.z - TRASH_POS.z) < TRASH_RADIUS + 0.025;
    const trash = (inBin(local) && local.y < 0.25) || (inBin(pos) && pos.y < 0.2);
    const [ax, ay, az] = cellAt(pos);
    const d: V3i = [ax - c.anchor[0], ay - c.anchor[1], az - c.anchor[2]];
    // Never sink below the desk: lift until the lowest block sits at y >= 0.
    const minRelY = Math.min(...c.rel.map(([[, y]]) => y));
    if (c.anchor[1] + minRelY + d[1] < 0) d[1] = -(c.anchor[1] + minRelY);
    let valid = this.fits(c.rel, c.anchor, d);
    if (valid) {
      // Gravity settle: drop until resting on the desk or another block.
      while (!this.supported(c.rel, c.anchor, d) && this.fits(c.rel, c.anchor, [d[0], d[1] - 1, d[2]])) d[1]--;
    } else {
      // Try stacking on top of whatever is in the way (common when dragging a roof over walls).
      for (let up = 1; up <= 6 && !valid; up++) {
        if (this.fits(c.rel, c.anchor, [d[0], d[1] + up, d[2]])) {
          d[1] += up;
          valid = true;
        }
      }
    }
    c.target = { delta: d, valid, trash };
    if (trash) c.ghost.hide();
    else c.ghost.show(c.rel.map(([[x, y, z]]) => [c.anchor[0] + x + d[0], c.anchor[1] + y + d[1], c.anchor[2] + z + d[2]] as V3i), valid);
  }

  private restore(c: Carry): void {
    c.mesh.hide();
    c.ghost.hide();
    this.model.silent(c.lift, 'before');
  }

  private drop(id: number, c: Carry, now: number): void {
    c.ghost.hide();
    if (c.target.trash) {
      c.mesh.hide();
      this.model.commit('delete', c.lift);
      sfx.play('delete');
      this.emit({ type: 'deleted', count: c.keys.length });
      this.states.set(id, { k: 'idle' });
      return;
    }
    if (c.target.valid) {
      c.mesh.hide();
      this.model.silent(c.lift, 'before');
      const d = c.target.delta;
      const assign: Array<[string, Cell | null]> = c.keys.map((k) => [k, null]);
      for (const [[x, y, z], cell] of c.rel) assign.push([key(c.anchor[0] + x + d[0], c.anchor[1] + y + d[1], c.anchor[2] + z + d[2]), cell]);
      const changes = this.model.diff(assign);
      const moved = d[0] !== 0 || d[1] !== 0 || d[2] !== 0;
      if (changes.length) this.model.commit(c.detached ? 'detach' : 'move', changes);
      this.renderer.pulse(assign.filter(([, v]) => v).map(([k]) => k), now);
      sfx.play('snap', c.keys.length > 1 ? 0.85 : 1);
      this.emit({ type: 'carried', keys: c.keys.length, group: c.group, detached: c.detached, moved });
      this.states.set(id, { k: 'idle' });
      return;
    }
    // Invalid drop: spring back to where it came from.
    sfx.play('error');
    c.returning = { t0: now, from: c.mesh.group.position.clone() };
    this.states.set(id, { k: 'carry', c });
  }

  private animateReturn(id: number, c: Carry, now: number): void {
    const r = c.returning!;
    const t = Math.min(1, (now - r.t0) / 180);
    const home = cellCenter(c.anchor[0], c.anchor[1], c.anchor[2]);
    c.mesh.group.position.lerpVectors(r.from, home, 1 - Math.pow(1 - t, 3));
    if (t >= 1) {
      c.mesh.hide();
      this.model.silent(c.lift, 'before');
      this.states.set(id, { k: 'ignore' });
    }
  }
}


import { describe, expect, it } from 'vitest';
import * as CANNON from 'cannon-es';
import { createTower, createTowerWorld, driveHeld, holdBlock, towerFell, BH } from '../src/game/towerPhysics';
import { makeMaze, solvePath } from '../src/game/marbleMaze';

describe('block tower physics', () => {
  it('a fresh tower stands perfectly still while asleep', () => {
    const w = createTowerWorld();
    const blocks = createTower(w);
    for (let i = 0; i < 240; i++) w.step(1 / 120);
    expect(towerFell(blocks, null)).toBe(false);
    for (const b of blocks) expect(Math.abs(b.body.position.y - b.homeY)).toBeLessThan(0.01);
  });
  it('stands when woken (no self-collapse)', () => {
    const w = createTowerWorld();
    const blocks = createTower(w, 12, false);
    for (let i = 0; i < 600; i++) w.step(1 / 120);
    expect(towerFell(blocks, null)).toBe(false);
    const drift = Math.max(...blocks.map((b) => Math.hypot(b.body.position.x - b.body.initPosition.x, b.body.position.z - b.body.initPosition.z)));
    expect(drift).toBeLessThan(0.05);
  });
  it('pulling a middle block out slowly keeps the tower up', () => {
    const w = createTowerWorld();
    const blocks = createTower(w, 12, false);
    const b = blocks.find((x) => x.thin && x.layer % 2 === 0 && x.layer > 2)!; // a loose block in an x-running layer
    expect(b).toBeTruthy();
    const home = b.body.position.clone();
    holdBlock(b.body, true);
    for (let i = 0; i < 360; i++) {
      // hand moves slowly sideways and a little off-axis; the block still slides only along its length
      const want = home.vadd(new CANNON.Vec3((i / 360) * 0.9, 0.02, 0.05));
      driveHeld(b.body, home, want, 1 / 30);
      w.step(1 / 120);
    }
    holdBlock(b.body, false);
    expect(b.body.position.x).toBeGreaterThan(0.5);
    expect(towerFell(blocks, b.body)).toBe(false);
  });
  it('sliding a held block out does not drag the tower with it (tight block, top block, keyboard push)', () => {
    for (const pick of [(b: { layer: number; slot: number; thin: boolean }) => !b.thin && b.layer >= 4 && b.layer <= 8, (b: { layer: number; slot: number }) => b.layer === 11 && b.slot === 0]) {
      const w = createTowerWorld();
      const blocks = createTower(w, 12, false);
      for (let i = 0; i < 60; i++) w.step(1 / 120); // let the tower settle first
      const held = blocks.find(pick)!;
      const others = blocks.filter((b) => b !== held);
      const start = others.map((b) => b.body.position.clone());
      const home = held.body.position.clone();
      const ax = held.body.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
      holdBlock(held.body, true);
      for (let i = 0; i < 360; i++) {
        // the hand pulls along the block, a little off-axis and slightly downward, like a real hand
        const want = home.vadd(ax.scale((i / 360) * 1.3)).vadd(new CANNON.Vec3(0.03, -0.02, 0.03));
        driveHeld(held.body, home, want, 1 / 15);
        w.step(1 / 120);
      }
      holdBlock(held.body, false);
      for (let i = 0; i < 120; i++) w.step(1 / 120);
      expect(towerFell(others, null)).toBe(false);
      const moved = Math.max(...others.map((b, i) => b.body.position.vsub(start[i]).length()));
      expect(moved).toBeLessThan(0.25); // blocks may settle a little into the gap, but nothing is shoved
      expect(held.body.position.vsub(home).length()).toBeGreaterThan(0.75);
    }
  });
  it('has some loose blocks, and loaded blocks are hard to move', () => {
    const w = createTowerWorld();
    const blocks = createTower(w, 12, false);
    expect(blocks.filter((b) => b.thin).length).toBeGreaterThan(4);
    const tight = blocks.find((x) => !x.thin && x.layer === 3)!;
    const x0 = tight.body.position.clone();
    for (let i = 0; i < 120; i++) {
      tight.body.wakeUp();
      tight.body.applyForce(tight.body.quaternion.vmult(new CANNON.Vec3(4, 0, 0)));
      w.step(1 / 120);
    }
    expect(tight.body.position.vsub(x0).length()).toBeLessThan(0.05);
  });
  it('knocking the bottom out topples it', () => {
    const w = createTowerWorld();
    const blocks = createTower(w, 12, false);
    for (const x of blocks.filter((q) => q.layer <= 1)) w.removeBody(x.body);
    for (let i = 0; i < 240; i++) w.step(1 / 120);
    expect(towerFell(blocks.filter((q) => q.layer > 1), null)).toBe(true);
    void BH;
  });
});

describe('marble maze generator', () => {
  it('every level is solvable and holes never block the path', () => {
    for (let level = 1; level <= 12; level++) {
      const n = Math.min(8, 3 + level);
      const m = makeMaze(n, 7919 * level + 13, level >= 4 ? Math.min(10, (level - 3) * 2) : 0);
      const path = solvePath(m);
      expect(path.size).toBeGreaterThan(n);
      for (const i of path) expect(m.tiles[i]).toBe(0);
    }
  });
  it('is deterministic per seed', () => {
    expect([...makeMaze(6, 42).tiles]).toEqual([...makeMaze(6, 42).tiles]);
  });
});

import { describe, expect, it } from 'vitest';
import * as CANNON from 'cannon-es';
import { LEVELS } from '../src/game/slingLevels';
import { BIRD, createLevelBodies, createWorld } from '../src/game/slingPhysics';

const step = (w: CANNON.World, s: number) => { for (let i = 0; i < s * 60; i++) w.step(1 / 60); };

describe('sling levels', () => {
  it('has 6 levels with birds and targets', () => {
    expect(LEVELS.length).toBe(6);
    for (const l of LEVELS) {
      expect(l.birds.length).toBeGreaterThanOrEqual(3);
      expect(l.targets.length).toBeGreaterThanOrEqual(2);
    }
  });
  for (const level of LEVELS) {
    it(`level ${level.id} "${level.name}" stands perfectly still before the first shot`, () => {
      const w = createWorld();
      const b = createLevelBodies(w, level);
      const start = [...b.blocks, ...b.targets].map((x) => x.body.position.clone());
      step(w, 3);
      const moved = [...b.blocks, ...b.targets].map((x, i) => x.body.position.distanceTo(start[i]));
      expect(Math.max(...moved)).toBeLessThan(0.01);
    });
    it(`level ${level.id} does not fall apart by itself once woken`, () => {
      const w = createWorld();
      const b = createLevelBodies(w, level, false);
      const start = [...b.blocks, ...b.targets].map((x) => x.body.position.clone());
      step(w, 3);
      const moved = [...b.blocks, ...b.targets].map((x, i) => x.body.position.distanceTo(start[i]));
      expect(Math.max(...moved)).toBeLessThan(0.3);
      for (const t of b.targets) expect(t.body.position.y).toBeGreaterThan(0);
    });
    it(`level ${level.id} can be hit by a straight shot`, () => {
      const w = createWorld();
      const b = createLevelBodies(w, level);
      const bird = new CANNON.Body({ mass: BIRD.pebble.mass, shape: new CANNON.Sphere(BIRD.pebble.r), position: new CANNON.Vec3(0, 0.9, 1.6) });
      // aim at the first target with a flat-ish lob
      const t = b.targets[0].body.position;
      const dz = t.z - 1.6, dy = t.y - 0.9, T = 0.55;
      bird.velocity.set((t.x - 0) / T, dy / T + 0.5 * 9.82 * T, dz / T);
      w.addBody(bird);
      const before = [...b.blocks, ...b.targets].map((x) => x.body.position.clone());
      step(w, 2);
      const moved = [...b.blocks, ...b.targets].some((x, i) => x.body.position.distanceTo(before[i]) > 0.1);
      expect(moved).toBe(true);
    });
  }
});

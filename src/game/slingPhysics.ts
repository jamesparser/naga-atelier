/**
 * Sling mode physics setup (cannon-es only; no rendering, so it runs in unit tests).
 */
import * as CANNON from 'cannon-es';
import type { BirdKind, BlockMat, LevelDef } from './slingLevels.js';

export const GROUND_X = 3.4, GROUND_Z0 = -3.2, GROUND_Z1 = 2.4;

export const MAT: Record<BlockMat, { color: number; density: number; hp: number; points: number; rough: number; opacity: number }> = {
  glass: { color: 0xa8e6ff, density: 2.2, hp: 5, points: 300, rough: 0.15, opacity: 0.55 },
  wood: { color: 0xc8955a, density: 3.2, hp: 14, points: 500, rough: 0.75, opacity: 1 },
  stone: { color: 0x9aa0a8, density: 8, hp: 38, points: 800, rough: 0.9, opacity: 1 },
};
export const BIRD: Record<BirdKind, { r: number; mass: number; color: number }> = {
  pebble: { r: 0.17, mass: 4, color: 0x58d6c8 },
  boulder: { r: 0.22, mass: 11, color: 0xffd166 },
};

export function createWorld(): CANNON.World {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  (world.solver as CANNON.GSSolver).iterations = 20;
  (world.solver as CANNON.GSSolver).tolerance = 1e-4;
  const cm = world.defaultContactMaterial;
  cm.friction = 0.7;
  cm.restitution = 0.05;
  // stiffer contacts = less sinking / wobble in tall stacks
  cm.contactEquationStiffness = 5e8;
  cm.contactEquationRelaxation = 3;
  cm.frictionEquationStiffness = 5e8;
  cm.frictionEquationRelaxation = 3;
  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(GROUND_X, 0.25, (GROUND_Z1 - GROUND_Z0) / 2)) });
  ground.position.set(0, -0.25, (GROUND_Z0 + GROUND_Z1) / 2);
  world.addBody(ground);
  return world;
}

export interface LevelBodies {
  blocks: Array<{ body: CANNON.Body; mat: BlockMat; size: [number, number, number] }>;
  targets: Array<{ body: CANNON.Body; r: number }>;
}

/** Bodies start asleep so towers stand perfectly still until something hits them. */
export function createLevelBodies(world: CANNON.World, level: LevelDef, asleep = true): LevelBodies {
  const out: LevelBodies = { blocks: [], targets: [] };
  for (const d of level.blocks) {
    const body = new CANNON.Body({
      mass: d.w * d.h * d.d * MAT[d.mat].density,
      shape: new CANNON.Box(new CANNON.Vec3(d.w / 2, d.h / 2, d.d / 2)),
      position: new CANNON.Vec3(d.x, d.y + d.h / 2 + 0.002, d.z),
      sleepSpeedLimit: 0.15,
      sleepTimeLimit: 0.5,
      linearDamping: 0.05,
      angularDamping: 0.08,
    });
    world.addBody(body);
    if (asleep) body.sleep();
    out.blocks.push({ body, mat: d.mat, size: [d.w, d.h, d.d] });
  }
  for (const d of level.targets) {
    const body = new CANNON.Body({
      mass: 1.2,
      shape: new CANNON.Sphere(d.r),
      position: new CANNON.Vec3(d.x, d.y + d.r + 0.002, d.z),
      sleepSpeedLimit: 0.15,
      sleepTimeLimit: 0.5,
      linearDamping: 0.2,
      angularDamping: 0.9,
    });
    world.addBody(body);
    if (asleep) body.sleep();
    out.targets.push({ body, r: d.r });
  }
  return out;
}

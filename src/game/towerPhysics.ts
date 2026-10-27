/**
 * Block Tower physics (cannon-es only, no rendering, so it runs in unit tests).
 * Simulated at 1:10 scale (blocks 0.75 × 0.15 × 0.25 sim-metres), rendered smaller on the desk.
 */
import * as CANNON from 'cannon-es';

export const BL = 0.75, BH = 0.15, BW = 0.25;
export const LAYERS = 12;

export interface TowerBlock {
  body: CANNON.Body;
  /** layer the block currently belongs to (changes when it is moved to the top) */
  layer: number;
  slot: number;
  homeY: number;
  /** a slightly thinner block carries no load from above, so it slides out easily (like a real tower) */
  thin: boolean;
}

export const THIN = 0.012;

/** Every tower block uses BLOCK_MAT; the block in your hand switches to HELD_MAT, which barely
 * grips its neighbours, so sliding it out doesn't drag the rest of the tower along. */
export const BLOCK_MAT = new CANNON.Material('block');
export const HELD_MAT = new CANNON.Material('held');

export function createTowerWorld(): CANNON.World {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  (world.solver as CANNON.GSSolver).iterations = 20; // stable for a 12-layer stack at 120 Hz
  (world.solver as CANNON.GSSolver).tolerance = 1e-5;
  const cm = world.defaultContactMaterial;
  // cannon friction is per contact point (load-independent), so loose blocks (fewer contacts) slide out
  cm.friction = 0.2;
  cm.restitution = 0.0;
  cm.contactEquationStiffness = 1e9;
  cm.contactEquationRelaxation = 3;
  cm.frictionEquationStiffness = 1e9;
  cm.frictionEquationRelaxation = 3;
  world.addContactMaterial(new CANNON.ContactMaterial(HELD_MAT, BLOCK_MAT, {
    friction: 0.02,
    restitution: 0,
    contactEquationStiffness: 1e9,
    contactEquationRelaxation: 3,
    frictionEquationStiffness: 1e9,
    frictionEquationRelaxation: 3,
  }));
  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(3, 0.25, 3)), material: BLOCK_MAT });
  ground.position.set(0, -0.25, 0);
  world.addBody(ground);
  return world;
}

/** Where slot s of layer l sits (centre) and whether its long axis runs along x. */
export function slotPose(layer: number, slot: number): { x: number; y: number; z: number; alongX: boolean } {
  const alongX = layer % 2 === 0;
  const off = (slot - 1) * (BW + 0.004);
  return { x: alongX ? 0 : off, y: BH / 2 + layer * BH + 0.001, z: alongX ? off : 0, alongX };
}

export function makeBlockBody(world: CANNON.World, layer: number, slot: number, thin = false): CANNON.Body {
  const p = slotPose(layer, slot);
  const h = thin ? BH - THIN : BH;
  const body = new CANNON.Body({
    mass: 0.6,
    shape: new CANNON.Box(new CANNON.Vec3(BL / 2, h / 2, BW / 2)),
    position: new CANNON.Vec3(p.x, p.y - (BH - h) / 2, p.z),
    material: BLOCK_MAT,
    sleepSpeedLimit: 0.05,
    sleepTimeLimit: 0.6,
    linearDamping: 0.08,
    angularDamping: 0.2,
  });
  if (!p.alongX) body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);
  world.addBody(body);
  return body;
}

export function createTower(world: CANNON.World, layers = LAYERS, asleep = true, seed = 1): TowerBlock[] {
  const out: TowerBlock[] = [];
  let a = seed >>> 0;
  const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let l = 0; l < layers; l++) {
    // which blocks are loose: centre (common), both sides (sometimes) or none; never in the bottom/top two
    const r = rnd();
    const loose = l === 0 || l >= layers - 2 ? [] : r < 0.45 ? [1] : r < 0.7 ? [0, 2] : r < 0.85 ? [rnd() < 0.5 ? 0 : 2] : [];
    for (let s = 0; s < 3; s++) {
      const thin = loose.includes(s);
      const body = makeBlockBody(world, l, s, thin);
      if (asleep) body.sleep();
      out.push({ body, layer: l, slot: s, homeY: body.position.y, thin });
    }
  }
  return out;
}

/** Long axis of a block in world space. */
export function longAxis(b: CANNON.Body): CANNON.Vec3 {
  return b.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
}

/** True once any block (not held) has dropped well below where it belongs: the tower fell. */
export function towerFell(blocks: TowerBlock[], held: CANNON.Body | null): boolean {
  return blocks.some((b) => b.body !== held && b.body.position.y < b.homeY - BH * 1.6);
}

/**
 * Drive a held block kinematically toward where the hand wants its centre. While it is still inside
 * the tower it can only slide along its own length (like pulling a real block); once clear, it moves freely.
 */
export function driveHeld(body: CANNON.Body, homeCentre: CANNON.Vec3, desiredCentre: CANNON.Vec3, dt: number): void {
  const ax = longAxis(body);
  ax.y = 0;
  ax.normalize();
  const along = desiredCentre.vsub(homeCentre).dot(ax);
  const cur = body.position.vsub(homeCentre).dot(ax);
  if (Math.abs(cur) < BL * 1.02) {
    // still inside the tower: it slides along its own length and passes through its neighbours,
    // so pulling can never shove the tower — what's left must hold itself up, like real blocks
    body.type = CANNON.Body.KINEMATIC;
    body.collisionResponse = false;
    const target = Math.max(-BL * 1.2, Math.min(BL * 1.2, along));
    const vAl = Math.max(-0.7, Math.min(0.7, (target - cur) / Math.max(dt, 0.03)));
    const side = new CANNON.Vec3(-ax.z, 0, ax.x);
    const drift = body.position.vsub(homeCentre).dot(side);
    body.velocity.set(ax.x * vAl - side.x * drift * 8, (homeCentre.y - body.position.y) * 8, ax.z * vAl - side.z * drift * 8);
    body.angularVelocity.set(0, 0, 0);
    return;
  }
  // fully out: solid again, carried by your hand (bumping the tower with it can still knock it)
  body.type = CANNON.Body.DYNAMIC;
  body.collisionResponse = true;
  const goal = desiredCentre.clone();
  if (Math.hypot(goal.x, goal.z) < 0.8 && goal.y < homeCentre.y) goal.y = homeCentre.y;
  const v = goal.vsub(body.position).scale(1 / Math.max(dt, 0.03));
  const sp = v.length();
  body.velocity.copy(sp > 1.4 ? v.scale(1.4 / sp) : v);
  body.angularVelocity.scale(0.3, body.angularVelocity);
}

/** Grab / release. Released blocks are ordinary solid dynamic blocks again. */
export function holdBlock(body: CANNON.Body, on: boolean): void {
  body.type = on ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC;
  body.collisionResponse = !on;
  body.material = on ? HELD_MAT : BLOCK_MAT;
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  body.wakeUp();
}

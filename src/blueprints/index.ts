/**
 * Blueprint registry + placement (pure; no Three.js).
 */
import type { Anchor, BlueprintId, PaletteName } from '../../shared/protocol.js';
import { BLUEPRINT_IDS } from '../../shared/protocol.js';
import { X_MAX, X_MIN, Z_MAX, Z_MIN, GRID_Y } from '../config.js';
import { key, type Cell, type CellChange, type VoxelModel } from '../blocks/voxelModel.js';

import house_small from './house_small.json';
import stairs from './stairs.json';
import wall from './wall.json';
import tower from './tower.json';
import garden from './garden.json';
import desk_shelf from './desk_shelf.json';
import arch from './arch.json';
import bench from './bench.json';
import fireplace from './fireplace.json';
import maze_tiny from './maze_tiny.json';

export interface BlueprintVoxel {
  x: number;
  y: number;
  z: number;
  c: string;
  cl?: string;
}
export interface Blueprint {
  id: BlueprintId;
  label: string;
  defaultColor: string;
  footprint: { x: number; y: number; z: number };
  voxels: BlueprintVoxel[];
  clusters: Array<{ name: string; aabb: { x: number; y: number; z: number; sx: number; sy: number; sz: number } }>;
  sounds?: { spawn?: string };
}

export const BLUEPRINTS: Record<BlueprintId, Blueprint> = {
  house_small, stairs, wall, tower, garden, desk_shelf, arch, bench, fireplace, maze_tiny,
} as Record<BlueprintId, Blueprint>;

export function getBlueprint(id: string): Blueprint | null {
  return (BLUEPRINT_IDS as readonly string[]).includes(id) ? BLUEPRINTS[id as BlueprintId] : null;
}

/** Nearest-neighbour resample of a blueprint's voxels by `scale`. */
export function scaledVoxels(bp: Blueprint, scale: number): BlueprintVoxel[] {
  if (Math.abs(scale - 1) < 0.01) return bp.voxels;
  const src = new Map(bp.voxels.map((v) => [key(v.x, v.y, v.z), v]));
  const { x: fx, y: fy, z: fz } = bp.footprint;
  const nx = Math.max(1, Math.round(fx * scale)), ny = Math.max(1, Math.round(fy * scale)), nz = Math.max(1, Math.round(fz * scale));
  const out: BlueprintVoxel[] = [];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++)
      for (let k = 0; k < nz; k++) {
        const s = src.get(key(Math.floor((i * fx) / nx), Math.floor((j * fy) / ny), Math.floor((k * fz) / nz)));
        if (s) out.push({ ...s, x: i, y: j, z: k });
      }
  return out;
}

export interface SpawnPlan {
  spawnId: string;
  changes: CellChange[];
  /** world cells in spawn order (bottom layer first) for staggered animation */
  order: string[];
  clipped: boolean;
}

/**
 * Plan a spawn: choose a free spot near the anchor, recolor, scale.
 * Never fails: if nothing fits it clips overlapping/out-of-bounds cells.
 */
export function planSpawn(
  model: VoxelModel,
  bp: Blueprint,
  opts: { anchor?: Anchor; color?: PaletteName; scale?: number } = {},
): SpawnPlan {
  const scale = Math.min(2, Math.max(0.5, opts.scale ?? 1));
  const vox = scaledVoxels(bp, scale);
  let fx = 0, fy = 0, fz = 0;
  for (const v of vox) {
    fx = Math.max(fx, v.x + 1); fy = Math.max(fy, v.y + 1); fz = Math.max(fz, v.z + 1);
  }
  const anchor = opts.anchor ?? 'desk_center';
  const centreX = anchor === 'desk_left' ? -4 : anchor === 'desk_right' ? 4 : 0;
  const baseY = anchor === 'floating' ? 4 : 0;
  const x0 = Math.round(centreX - fx / 2);
  const z0 = Math.round(-fz / 2);
  const y0 = Math.min(baseY, Math.max(0, GRID_Y - fy));

  const fits = (ox: number, oz: number, oy: number) => {
    for (const v of vox) {
      const x = ox + v.x, y = oy + v.y, z = oz + v.z;
      if (x < X_MIN || x > X_MAX || z < Z_MIN || z > Z_MAX || y < 0 || y >= GRID_Y) return false;
      if (model.cells.has(key(x, y, z))) return false;
    }
    return true;
  };

  // Search offsets nearest-first so new builds sit beside existing ones instead of inside them.
  let best: [number, number, number] | null = null;
  const candidates: Array<[number, number]> = [];
  for (let dx = -12; dx <= 12; dx++) for (let dz = -8; dz <= 8; dz++) candidates.push([dx, dz]);
  candidates.sort((a, b) => a[0] ** 2 + 1.5 * a[1] ** 2 - (b[0] ** 2 + 1.5 * b[1] ** 2));
  for (const [dx, dz] of candidates) {
    if (fits(x0 + dx, z0 + dz, y0)) {
      best = [x0 + dx, y0, z0 + dz];
      break;
    }
  }
  const clipped = !best;
  const [ox, oy, oz] = best ?? [Math.max(X_MIN, Math.min(x0, X_MAX - fx + 1)), y0, Math.max(Z_MIN, Math.min(z0, Z_MAX - fz + 1))];

  const spawnId = model.nextSpawnId();
  const assign: Array<[string, Cell]> = [];
  for (const v of vox) {
    const x = ox + v.x, y = oy + v.y, z = oz + v.z;
    if (x < X_MIN || x > X_MAX || z < Z_MIN || z > Z_MAX || y < 0 || y >= GRID_Y) continue;
    const k = key(x, y, z);
    if (model.cells.has(k)) continue;
    const c = (opts.color && v.c === bp.defaultColor ? opts.color : v.c) as PaletteName;
    assign.push([k, { c, cl: `${spawnId}:${v.cl ?? 'body'}` }]);
  }
  const changes = model.diff(assign);
  return { spawnId, changes, order: assign.map(([k]) => k), clipped };
}

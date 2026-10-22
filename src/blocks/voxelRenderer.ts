/**
 * Renders the VoxelModel with a single InstancedMesh (1 draw call for the whole world),
 * plus helpers for carried groups and the snap "ghost" preview.
 */
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import { CELL, MAX_VOXELS } from '../config.js';
import { PALETTE } from './palette.js';
import { parseKey, type Cell, type VoxelModel } from './voxelModel.js';

/** Centre of cell (x,y,z) in desk-local metres. */
export function cellCenter(x: number, y: number, z: number, out = new Vector3()): Vector3 {
  return out.set((x + 0.5) * CELL, (y + 0.5) * CELL, (z + 0.5) * CELL);
}
/** Cell index containing a desk-local point. */
export function cellAt(p: Vector3): [number, number, number] {
  return [Math.floor(p.x / CELL), Math.floor(p.y / CELL), Math.floor(p.z / CELL)];
}

let bevelTex: CanvasTexture | null = null;
/** Soft bevel texture so neighbouring same-colour blocks stay readable. */
export function bevelTexture(): CanvasTexture {
  if (bevelTex) return bevelTex;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, s, s);
  const edge = 5;
  for (let i = 0; i < edge; i++) {
    const shade = Math.round(255 - (edge - i) * 14);
    g.strokeStyle = `rgb(${shade},${shade},${shade})`;
    g.strokeRect(i + 0.5, i + 0.5, s - 2 * i - 1, s - 2 * i - 1);
  }
  g.fillStyle = 'rgba(255,255,255,0.0)';
  bevelTex = new CanvasTexture(c);
  bevelTex.colorSpace = SRGBColorSpace;
  return bevelTex;
}

export function blockGeometry(): BoxGeometry {
  return new BoxGeometry(CELL * 0.985, CELL * 0.985, CELL * 0.985);
}

export function blockMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ map: bevelTexture(), roughness: 0.72, metalness: 0.0 });
}

const tmpM = new Matrix4();
const tmpP = new Vector3();
const tmpQ = new Quaternion();
const tmpS = new Vector3();
const tmpC = new Color();
const WHITE = new Color(0xffffff);

interface Anim {
  start: number;
  dur: number;
}

export class VoxelRenderer {
  readonly mesh: InstancedMesh;
  private builtVersion = -1;
  private indexKeys: string[] = [];
  private hover = new Set<string>();
  private hoverDirty = false;
  private anims = new Map<string, Anim>();
  private glowUntil = new Map<string, number>();

  constructor(private model: VoxelModel, parent: Object3D, shadows: boolean, material: Material = blockMaterial(), capacity = MAX_VOXELS) {
    this.mesh = new InstancedMesh(blockGeometry(), material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadows;
    this.mesh.receiveShadow = shadows;
    this.mesh.name = 'voxels';
    // Allocate instanceColor up front.
    this.mesh.setColorAt(0, WHITE);
    parent.add(this.mesh);
  }

  /** Staggered pop-in, bottom layer first. `order` is a list of keys. */
  animateSpawn(order: string[], now: number, perLayerMs = 55): void {
    if (!order.length) return;
    const minY = Math.min(...order.map((k) => parseKey(k)[1]));
    for (const k of order) {
      const y = parseKey(k)[1] - minY;
      this.anims.set(k, { start: now + y * perLayerMs, dur: 220 });
      this.glowUntil.set(k, now + y * perLayerMs + 900);
    }
  }

  pulse(keys: string[], now: number): void {
    for (const k of keys) this.glowUntil.set(k, now + 600);
  }

  setHover(keys: Iterable<string>): void {
    const next = new Set(keys);
    if (next.size === this.hover.size && [...next].every((k) => this.hover.has(k))) return;
    this.hover = next;
    this.hoverDirty = true;
  }

  get animating(): boolean {
    return this.anims.size > 0 || this.glowUntil.size > 0;
  }

  update(now: number): void {
    const rebuild = this.builtVersion !== this.model.version;
    if (!rebuild && !this.hoverDirty && !this.animating) return;
    if (rebuild) {
      this.indexKeys = [...this.model.cells.keys()].slice(0, MAX_VOXELS);
      this.builtVersion = this.model.version;
      for (const k of this.anims.keys()) if (!this.model.cells.has(k)) this.anims.delete(k);
      for (const k of this.glowUntil.keys()) if (!this.model.cells.has(k)) this.glowUntil.delete(k);
    }
    const mesh = this.mesh;
    tmpQ.identity();
    for (let i = 0; i < this.indexKeys.length; i++) {
      const k = this.indexKeys[i];
      const cell = this.model.cells.get(k)!;
      const [x, y, z] = parseKey(k);
      cellCenter(x, y, z, tmpP);
      let s = 1;
      const a = this.anims.get(k);
      if (a) {
        const t = (now - a.start) / a.dur;
        if (t >= 1) this.anims.delete(k);
        else if (t <= 0) s = 0.0001;
        else s = easeOutBack(t);
        tmpP.y += (1 - Math.min(1, Math.max(0, t))) * CELL * 0.6;
      }
      tmpS.setScalar(s);
      tmpM.compose(tmpP, tmpQ, tmpS);
      mesh.setMatrixAt(i, tmpM);
      tmpC.setHex(PALETTE[cell.c]);
      const glowEnd = this.glowUntil.get(k);
      if (glowEnd !== undefined) {
        if (now >= glowEnd) this.glowUntil.delete(k);
        else tmpC.lerp(WHITE, 0.35 * Math.min(1, (glowEnd - now) / 500));
      }
      if (this.hover.has(k)) tmpC.lerp(WHITE, 0.4);
      mesh.setColorAt(i, tmpC);
    }
    mesh.count = this.indexKeys.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // bounds are cached for raycasts: drop them so mouse clicks find newly added blocks
    mesh.boundingSphere = null;
    mesh.boundingBox = null;
    this.hoverDirty = false;
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/**
 * A detached group of blocks that follows a hand while carried.
 * Cells are stored relative to an anchor cell so the group can be positioned freely.
 */
export class CarryMesh {
  readonly group = new Group();
  private mesh: InstancedMesh;

  constructor(parent: Object3D, shadows: boolean, material: Material = blockMaterial(), capacity = MAX_VOXELS) {
    this.mesh = new InstancedMesh(blockGeometry(), material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadows;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, WHITE);
    this.group.add(this.mesh);
    this.group.visible = false;
    parent.add(this.group);
  }

  /** rel: offsets in cells from the anchor cell. */
  show(rel: Array<[[number, number, number], Cell]>): void {
    tmpQ.identity();
    tmpS.setScalar(1.04);
    rel.forEach(([[x, y, z], cell], i) => {
      tmpP.set(x * CELL, y * CELL, z * CELL);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(i, tmpM);
      this.mesh.setColorAt(i, tmpC.setHex(PALETTE[cell.c]).lerp(WHITE, 0.15));
    });
    this.mesh.count = rel.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
    this.mesh.count = 0;
  }
}

/** Translucent preview of where a carried group will land. */
export class GhostMesh {
  private mesh: InstancedMesh;
  private mat: MeshBasicMaterial;
  constructor(parent: Object3D) {
    this.mat = new MeshBasicMaterial({ color: 0x9ff0c0, transparent: true, opacity: 0.28, depthWrite: false });
    this.mesh = new InstancedMesh(blockGeometry(), this.mat, MAX_VOXELS);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 2;
    parent.add(this.mesh);
  }
  show(cells: Array<[number, number, number]>, valid: boolean, trash = false): void {
    tmpQ.identity();
    tmpS.setScalar(1);
    cells.forEach(([x, y, z], i) => {
      cellCenter(x, y, z, tmpP);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(i, tmpM);
    });
    this.mesh.count = trash ? 0 : cells.length;
    this.mat.color.setHex(valid ? 0x9ff0c0 : 0xff6b6b);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  hide(): void {
    this.mesh.count = 0;
  }
}

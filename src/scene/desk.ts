/**
 * Desk-space visuals: build mat + grid, trash zone. Everything is parented to `deskRoot`
 * whose origin is the centre of the grid on the desk surface (+x right, +y up, +z toward user).
 */
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  SRGBColorSpace,
  CircleGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  ShadowMaterial,
  Vector3,
} from 'three';
import { CELL, GRID_X, GRID_Z, X_MAX, X_MIN, Z_MAX, Z_MIN } from '../config.js';

export const DESK_HALF_W = (GRID_X * CELL) / 2;
export const DESK_HALF_D = (GRID_Z * CELL) / 2;
export const TRASH_POS = new Vector3(DESK_HALF_W + 0.075, 0, 0.02);
export const TRASH_RADIUS = 0.055;

export interface DeskVisuals {
  root: Group;
  /** Visual-only "real desk" slab used in VR mode (hidden in passthrough). */
  vrDesk: Mesh;
  trash: Group;
  setTrashHot(hot: boolean): void;
  setGridEmphasis(on: boolean): void;
}

export function buildDesk(shadows: boolean): DeskVisuals {
  const root = new Group();
  root.name = 'deskRoot';
  const w = GRID_X * CELL, d = GRID_Z * CELL;

  // Shadow catcher so blocks feel grounded on the real desk in passthrough.
  if (shadows) {
    const catcher = new Mesh(new PlaneGeometry(w + 0.3, d + 0.25), new ShadowMaterial({ opacity: 0.28 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = 0.0005;
    catcher.receiveShadow = true;
    root.add(catcher);
  }
  // Faint mat that marks the build area.
  const mat = new Mesh(
    new PlaneGeometry(w, d),
    new MeshBasicMaterial({ color: 0x1b2a3a, transparent: true, opacity: 0.16, depthWrite: false }),
  );
  mat.rotation.x = -Math.PI / 2;
  mat.position.y = 0.001;
  mat.renderOrder = 1;
  root.add(mat);

  // Grid lines.
  const pts: number[] = [];
  for (let x = X_MIN; x <= X_MAX + 1; x++) pts.push(x * CELL, 0, Z_MIN * CELL, x * CELL, 0, (Z_MAX + 1) * CELL);
  for (let z = Z_MIN; z <= Z_MAX + 1; z++) pts.push(X_MIN * CELL, 0, z * CELL, (X_MAX + 1) * CELL, 0, z * CELL);
  const gridGeo = new BufferGeometry();
  gridGeo.setAttribute('position', new Float32BufferAttribute(pts, 3));
  const gridMat = new LineBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.16, depthWrite: false });
  const grid = new LineSegments(gridGeo, gridMat);
  grid.position.y = 0.0015;
  root.add(grid);

  // Border glow.
  const b: number[] = [];
  const x0 = X_MIN * CELL, x1 = (X_MAX + 1) * CELL, z0 = Z_MIN * CELL, z1 = (Z_MAX + 1) * CELL;
  b.push(x0, 0, z0, x1, 0, z0, x1, 0, z0, x1, 0, z1, x1, 0, z1, x0, 0, z1, x0, 0, z1, x0, 0, z0);
  const borderGeo = new BufferGeometry();
  borderGeo.setAttribute('position', new Float32BufferAttribute(b, 3));
  const border = new LineSegments(borderGeo, new LineBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.55 }));
  border.position.y = 0.002;
  root.add(border);

  // VR-only desk slab (passthrough shows the real desk instead).
  const vrDesk = new Mesh(
    new BoxGeometry(w + 0.5, 0.03, d + 0.35),
    new MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.85 }),
  );
  vrDesk.position.set(0, -0.0155, 0.05);
  vrDesk.receiveShadow = shadows;
  vrDesk.visible = false;
  root.add(vrDesk);

  // Trash zone.
  const trash = new Group();
  trash.position.copy(TRASH_POS);
  const disc = new Mesh(
    new CircleGeometry(TRASH_RADIUS, 40),
    new MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.12, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.002;
  const ring = new Mesh(
    new RingGeometry(TRASH_RADIUS - 0.004, TRASH_RADIUS, 48),
    new MeshBasicMaterial({ color: 0xff7070, transparent: true, opacity: 0.8 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.0025;
  const label = trashGlyph();
  label.position.y = 0.003;
  trash.add(disc, ring, label);
  root.add(trash);

  const discMat = disc.material as MeshBasicMaterial;
  return {
    root,
    vrDesk,
    trash,
    setTrashHot(hot) {
      discMat.opacity = hot ? 0.45 : 0.12;
      trash.scale.setScalar(hot ? 1.12 : 1);
    },
    setGridEmphasis(on) {
      gridMat.opacity = on ? 0.32 : 0.16;
    },
  };
}

function trashGlyph(): Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ff8a8a';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(38, 44); g.lineTo(90, 44); // lid
  g.moveTo(54, 34); g.lineTo(74, 34);
  g.moveTo(44, 54); g.lineTo(50, 100); g.lineTo(78, 100); g.lineTo(84, 54);
  g.stroke();
  return canvasPlane(c, TRASH_RADIUS * 1.1, true);
}

/** A plane textured with a canvas; `flat` lays it on the desk facing up. */
export function canvasPlane(c: HTMLCanvasElement, size: number, flat: boolean, aspect = 1): Mesh {
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new Mesh(
    new PlaneGeometry(size * aspect, size),
    new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  if (flat) m.rotation.x = -Math.PI / 2;
  return m;
}

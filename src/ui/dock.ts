/**
 * The dock: a row of big, flat, pokeable buttons along the front edge of the desk.
 * Poke down with an index fingertip (or pinch on it). Within ~35 cm of the seated user,
 * inside the lower field of view, never covering the build area.
 */
import {
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { PaletteName } from '../../shared/protocol.js';
import { PALETTE, SWATCHES } from '../blocks/palette.js';
import { deskHalfD } from '../scene/desk.js';

export type DockAction =
  | 'mic' | 'undo' | 'redo' | 'magic' | 'export' | 'grid' | 'recenter' | 'game' | `swatch:${PaletteName}`
  // Tetris mode
  | 'spin' | 'flip' | 'tilt' | 'drop' | 'pause' | 'exit';

const BIG = 0.024;
const SMALL = 0.0145;

/** Build-mode dock. */
export const BUILD_LAYOUT: Array<[DockAction, number]> = [
  ['mic', BIG],
  ['undo', BIG],
  ['redo', BIG],
  ...SWATCHES.map((s) => [`swatch:${s}`, SMALL] as [DockAction, number]),
  ['magic', BIG],
  ['export', 0.018],
  ['grid', 0.018],
  ['game', 0.018],
  ['recenter', BIG],
];

/** Tetris-mode dock: big flip buttons on the left hand side, drop on the right. */
export const GAME_LAYOUT: Array<[DockAction, number]> = [
  ['exit', BIG],
  ['tilt', 0.028],
  ['flip', 0.028],
  ['spin', 0.028],
  ['drop', 0.03],
  ['pause', BIG],
  ['mic', BIG],
];

interface Button {
  id: DockAction;
  root: Group;
  cap: Group;
  radius: number;
  base: MeshStandardMaterial;
  ring: Mesh;
  armed: Map<number, boolean>;
  pressedUntil: number;
  attention: boolean;
}

const BUTTON_Y = 0.008;
let ROW_Z = deskHalfD() + 0.055;
/** Re-seat the dock after a grid preset changes desk depth. */
export function reseatDockZ(): void {
  ROW_Z = deskHalfD() + 0.055;
}

export class Dock {
  readonly root = new Group();
  private buttons: Button[] = [];
  private activeSwatch: PaletteName = 'oak';
  private micState: 'idle' | 'listening' | 'thinking' | 'off' = 'idle';

  constructor(layout: Array<[DockAction, number]> = BUILD_LAYOUT) {
    this.root.name = 'dock';
    const gap = 0.012;
    const total = layout.reduce((a, [, r]) => a + 2 * r + gap, -gap);
    let x = -total / 2;
    for (const [id, r] of layout) {
      x += r;
      this.buttons.push(this.makeButton(id, r, new Vector3(x, 0, ROW_Z + (r === SMALL ? -0.006 : 0))));
      x += r + gap;
    }
    this.setActiveSwatch('oak');
  }

  private makeButton(id: DockAction, radius: number, pos: Vector3): Button {
    const root = new Group();
    root.position.copy(pos);
    const isSwatch = id.startsWith('swatch:');
    const color = isSwatch ? PALETTE[id.slice(7) as PaletteName] : 0x253445;
    const base = new MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, emissive: 0x000000 });
    const cap = new Group();
    const cyl = new Mesh(new CylinderGeometry(radius, radius * 1.04, BUTTON_Y, 32), base);
    cyl.position.y = BUTTON_Y / 2;
    cap.add(cyl);
    if (!isSwatch) {
      const icon = new Mesh(
        new PlaneGeometry(radius * 1.5, radius * 1.5),
        new MeshBasicMaterial({ map: iconTexture(id), transparent: true, depthWrite: false }),
      );
      icon.rotation.x = -Math.PI / 2;
      icon.position.y = BUTTON_Y + 0.0006;
      cap.add(icon);
    }
    root.add(cap);
    const ring = new Mesh(
      new RingGeometry(radius + 0.002, radius + 0.0045, 40),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.001;
    root.add(ring);
    this.root.add(root);
    return { id, root, cap, radius, base, ring, armed: new Map(), pressedUntil: 0, attention: false };
  }

  setActiveSwatch(name: PaletteName): void {
    this.activeSwatch = name;
  }
  get swatch(): PaletteName {
    return this.activeSwatch;
  }
  setMicState(s: 'idle' | 'listening' | 'thinking' | 'off'): void {
    this.micState = s;
  }
  setAttention(id: DockAction | null): void {
    for (const b of this.buttons) b.attention = b.id === id;
  }

  /** Nearest button whose top is within `slack` of a desk-local point. */
  hitTest(p: Vector3, slack = 0.01): DockAction | null {
    let best: Button | null = null;
    let bestD = Infinity;
    for (const b of this.buttons) {
      const dx = p.x - b.root.position.x, dz = p.z - b.root.position.z;
      const d = Math.hypot(dx, dz);
      if (d < b.radius + slack && p.y < 0.05 && p.y > -0.03 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best?.id ?? null;
  }

  /**
   * Poke detection. `tips` are index fingertips in desk-local space keyed by hand id.
   * Returns buttons that were pressed this frame (edge-triggered, re-armed on lift).
   */
  updatePokes(tips: Map<number, Vector3>, now: number): DockAction[] {
    const out: DockAction[] = [];
    for (const b of this.buttons) {
      let hovered = false;
      for (const [hid, tip] of tips) {
        const d = Math.hypot(tip.x - b.root.position.x, tip.z - b.root.position.z);
        const inside = d < b.radius + 0.004 && tip.y < BUTTON_Y + 0.008 && tip.y > -0.03;
        const near = d < b.radius + 0.02 && tip.y < 0.06 && tip.y > -0.03;
        const away = d > b.radius + 0.012 || tip.y > BUTTON_Y + 0.03;
        if (near) hovered = true;
        const armed = b.armed.get(hid) ?? true;
        if (inside && armed) {
          b.armed.set(hid, false);
          b.pressedUntil = now + 160;
          out.push(b.id);
        } else if (away) {
          b.armed.set(hid, true);
        }
      }
      for (const hid of [...b.armed.keys()]) if (!tips.has(hid)) b.armed.set(hid, true);
      this.style(b, hovered, now);
    }
    return out;
  }

  /** Visual press for pinch-activated buttons. */
  flash(id: DockAction, now: number): void {
    const b = this.buttons.find((x) => x.id === id);
    if (b) b.pressedUntil = now + 160;
  }

  private style(b: Button, hovered: boolean, now: number): void {
    const pressed = now < b.pressedUntil;
    b.cap.position.y = pressed ? -BUTTON_Y * 0.6 : 0;
    const ringMat = b.ring.material as MeshBasicMaterial;
    const isActiveSwatch = b.id === `swatch:${this.activeSwatch}`;
    let ringOpacity = hovered ? 0.6 : 0;
    if (isActiveSwatch) ringOpacity = 0.95;
    if (b.attention) ringOpacity = 0.5 + 0.5 * Math.sin(now / 160);
    ringMat.opacity = ringOpacity;
    b.ring.visible = ringOpacity > 0.01;
    ringMat.color.setHex(b.attention ? 0x7fd8ff : 0xffffff);
    if (b.id === 'mic') {
      const c = this.micState === 'listening' ? 0xd23c3c : this.micState === 'thinking' ? 0x6a4cd2 : this.micState === 'off' ? 0x3a3a3a : 0x253445;
      b.base.color.setHex(c);
      b.base.emissive.setHex(this.micState === 'listening' ? 0x501010 : 0x000000);
      if (this.micState === 'listening') b.root.scale.setScalar(1 + 0.06 * Math.sin(now / 120));
      else b.root.scale.setScalar(1);
    } else if (!b.id.startsWith('swatch:')) {
      b.base.emissive.setHex(hovered ? 0x1a3346 : 0x000000);
    }
  }
}

const iconCache = new Map<string, CanvasTexture>();
function iconTexture(id: DockAction): CanvasTexture {
  const hit = iconCache.get(id);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#eaf6ff';
  g.fillStyle = '#eaf6ff';
  g.lineWidth = 10;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const arrow = (flip: boolean) => {
    g.save();
    if (flip) { g.translate(128, 0); g.scale(-1, 1); }
    g.beginPath();
    g.arc(68, 70, 30, Math.PI * 1.05, Math.PI * 2.15);
    g.stroke();
    g.beginPath();
    g.moveTo(26, 44); g.lineTo(37, 76); g.lineTo(60, 56); g.closePath();
    g.fill();
    g.restore();
  };
  switch (id) {
    case 'mic':
      g.beginPath(); g.roundRect(48, 22, 32, 54, 16); g.fill();
      g.beginPath(); g.arc(64, 62, 30, 0, Math.PI); g.stroke();
      g.beginPath(); g.moveTo(64, 92); g.lineTo(64, 108); g.moveTo(46, 108); g.lineTo(82, 108); g.stroke();
      break;
    case 'undo': arrow(false); break;
    case 'redo': arrow(true); break;
    case 'magic': {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 18 : 44, a = -Math.PI / 2 + (i * Math.PI) / 5;
        g.lineTo(64 + r * Math.cos(a), 66 + r * Math.sin(a));
      }
      g.closePath(); g.fill();
      break;
    }
    case 'export':
      // Down-arrow into a tray = save/download
      g.beginPath(); g.moveTo(64, 18); g.lineTo(64, 78); g.stroke();
      g.beginPath(); g.moveTo(42, 58); g.lineTo(64, 80); g.lineTo(86, 58); g.stroke();
      g.beginPath(); g.roundRect(28, 92, 72, 22, 6); g.stroke();
      break;
    case 'grid':
      // Nested squares = block / grid size
      g.strokeRect(24, 24, 80, 80);
      g.strokeRect(44, 44, 40, 40);
      g.strokeRect(58, 58, 12, 12);
      break;
    case 'game': {
      // a little T-tetromino
      const u = 22;
      g.fillRect(64 - 1.5 * u, 40, 3 * u - 3, u - 3);
      g.fillRect(64 - 0.5 * u, 40 + u, u - 3, u - 3);
      break;
    }
    case 'spin': // turn around the vertical axis: flat ellipse with arrow
      g.beginPath(); g.ellipse(64, 70, 42, 18, 0, Math.PI * 0.1, Math.PI * 1.9); g.stroke();
      g.beginPath(); g.moveTo(98, 52); g.lineTo(112, 72); g.lineTo(90, 76); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(64, 20); g.lineTo(64, 104); g.stroke();
      break;
    case 'flip': // tumble toward you: tall ellipse with arrow
      g.beginPath(); g.ellipse(64, 64, 18, 42, 0, Math.PI * 0.6, Math.PI * 2.4); g.stroke();
      g.beginPath(); g.moveTo(46, 30); g.lineTo(66, 16); g.lineTo(70, 40); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(20, 64); g.lineTo(108, 64); g.stroke();
      break;
    case 'tilt': // roll left/right: circle with arrow
      g.beginPath(); g.arc(64, 64, 38, Math.PI * 1.2, Math.PI * 2.9); g.stroke();
      g.beginPath(); g.moveTo(26, 30); g.lineTo(40, 52); g.lineTo(18, 56); g.closePath(); g.fill();
      g.fillRect(52, 52, 24, 24);
      break;
    case 'drop':
      g.beginPath(); g.moveTo(64, 18); g.lineTo(64, 78); g.stroke();
      g.beginPath(); g.moveTo(40, 64); g.lineTo(64, 92); g.lineTo(88, 64); g.closePath(); g.fill();
      g.fillRect(30, 102, 68, 9);
      break;
    case 'pause':
      g.fillRect(42, 32, 16, 64); g.fillRect(70, 32, 16, 64);
      break;
    case 'exit': // little house = back to build mode
      g.beginPath(); g.moveTo(24, 64); g.lineTo(64, 26); g.lineTo(104, 64); g.closePath(); g.fill();
      g.fillRect(36, 62, 56, 40);
      g.clearRect(56, 76, 16, 26);
      break;
    case 'recenter':
      g.beginPath(); g.arc(64, 64, 30, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(64, 14); g.lineTo(64, 40); g.moveTo(64, 88); g.lineTo(64, 114);
      g.moveTo(14, 64); g.lineTo(40, 64); g.moveTo(88, 64); g.lineTo(114, 64); g.stroke();
      break;
    default:
      break;
  }
  // Canvas y is down; the plane is rotated to face up with its top edge pointing away from the user.
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  iconCache.set(id, tex);
  return tex;
}

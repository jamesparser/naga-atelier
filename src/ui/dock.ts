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
  | 'spin' | 'flip' | 'tilt' | 'drop' | 'pause' | 'exit' | 'depth'
  // Sling mode
  | 'retry' | 'next' | 'turnL' | 'turnR' | 'zoom'
  | 'clear' | 'board' | 'deskL' | 'deskR' | 'spinBuild'
  // arcade games
  | 'start' | 'fire' | 'totop' | 'flap' | 'jump' | 'view'
  // mode bar + arcade picker
  | 'build' | 'sling' | 'arcade' | 'swarm' | 'maze' | 'whack' | 'breakout' | 'tower' | 'flapbro' | 'penguin';

/** What every button says: short label printed under it, longer text in the hover tooltip. */
export const DOCK_LABELS: Partial<Record<DockAction, [string, string]>> = {
  mic: ['VOICE', 'Talk to Naga (tap, then speak)'],
  undo: ['UNDO', 'Undo last change'],
  redo: ['REDO', 'Redo'],
  magic: ['SURPRISE', 'Build a surprise shape'],
  export: ['SAVE', 'Save your desk as a web page'],
  grid: ['BLOCK SIZE', 'Change block size (your build comes along)'],
  clear: ['CLEAR', 'Clear the desk (UNDO brings it back)'],
  board: ['BOARD', 'Change the board colour'],
  deskL: ['TURN ⟲', 'Turn the whole game counter-clockwise (45°)'],
  deskR: ['TURN ⟳', 'Turn the whole game clockwise (45°)'],
  spinBuild: ['SPIN', 'Spin your build a quarter turn to see its other side'],
  recenter: ['RECENTER', 'Move the desk in front of you'],
  game: ['TETRIS', 'Play 3D Tetris'],
  sling: ['ANGRY SLING', 'Play Angry Sling'],
  build: ['BUILD', 'Back to building'],
  arcade: ['PLAY ARCADE GAMES', 'Play arcade games: Tetris, Angry Sling and 7 more'],
  flapbro: ['FLAP BRO', 'Flap Bro: flap through the gaps'],
  penguin: ['MIKE PENGUIN', 'Mike Penguin: race across the ice'],
  flap: ['FLAP', 'Flap your wings'],
  view: ['VIEW', 'Comfort view or first person'],
  jump: ['JUMP', 'Jump'],
  swarm: ['STAR SWARM', 'Play Star Swarm: space shooter'],
  maze: ['MARBLE MAZE', 'Play Marble Maze: tilt to roll'],
  whack: ['WHACK', 'Play Whack-a-Gloom'],
  breakout: ['BREAKOUT', 'Play 3D Breakout'],
  tower: ['TOWER', 'Play Block Tower: pull blocks out'],
  start: ['NEW GAME', 'Start a new game'],
  fire: ['FIRE', 'Fire (hold)'],
  totop: ['TO TOP', 'Put the pulled-out block on top of the tower'],
  exit: ['BACK', 'Back to building'],
  spin: ['SPIN', 'Spin the piece (turn flat)'],
  flip: ['FLIP', 'Flip the piece toward you'],
  tilt: ['TILT', 'Tilt the piece sideways'],
  drop: ['DROP', 'Drop the piece now (or play again)'],
  pause: ['PAUSE', 'Pause / resume'],
  depth: ['ROWS 1-4', 'How many rows deep: 1 = classic, 4 = full 3D (restarts)'],
  retry: ['RETRY', 'Restart this level'],
  next: ['SKIP LEVEL', 'Skip to the next level (cleared levels advance on their own)'],
  turnL: ['TURN LEFT', 'Turn the arena left'],
  turnR: ['TURN RIGHT', 'Turn the arena right'],
  zoom: ['ZOOM', 'Bigger / smaller arena'],
};

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
  ['clear', 0.018],
  ['board', 0.018],
  ['spinBuild', 0.018],
  ['deskL', 0.018],
  ['deskR', 0.018],
  ['recenter', BIG],
];

/** Sling-mode dock. */
export const SLING_LAYOUT: Array<[DockAction, number]> = [
  ['exit', BIG],
  ['retry', BIG],
  ['next', BIG],
  ['turnL', BIG],
  ['turnR', BIG],
  ['zoom', BIG],
  ['mic', BIG],
];

/** Mode switcher: a short column on the left edge of the desk, visible in every mode. */
export const MODE_LAYOUT: Array<[DockAction, number]> = [
  ['build', 0.022],
  ['arcade', 0.022],
];

/** Arcade picker: big tiles on the desk, one per game. */
export const ARCADE_TILES: Array<[DockAction, number]> = [
  ['game', 0.03], ['sling', 0.03], ['swarm', 0.03],
  ['maze', 0.03], ['whack', 0.03], ['breakout', 0.03],
  ['tower', 0.03], ['flapbro', 0.03], ['penguin', 0.03],
];
export const ARCADE_LAYOUT: Array<[DockAction, number]> = [['exit', 0.024], ['mic', 0.024]];
export const FLAPBRO_LAYOUT: Array<[DockAction, number]> = [['exit', 0.024], ['start', 0.024], ['flap', 0.034], ['view', 0.024], ['pause', 0.024], ['mic', 0.024]];
export const PENGUIN_LAYOUT: Array<[DockAction, number]> = [['exit', 0.024], ['start', 0.024], ['jump', 0.034], ['pause', 0.024], ['mic', 0.024]];

const G = 0.024;
export const SWARM_LAYOUT: Array<[DockAction, number]> = [['exit', G], ['start', G], ['fire', 0.03], ['pause', G], ['mic', G]];
export const MAZE_LAYOUT: Array<[DockAction, number]> = [['exit', G], ['retry', G], ['next', G], ['pause', G], ['mic', G]];
export const WHACK_LAYOUT: Array<[DockAction, number]> = [['exit', G], ['start', G], ['pause', G], ['mic', G]];
export const BREAKOUT_LAYOUT: Array<[DockAction, number]> = [['exit', G], ['start', G], ['fire', G], ['next', G], ['pause', G], ['mic', G]];
export const TOWER_LAYOUT: Array<[DockAction, number]> = [['exit', G], ['start', G], ['totop', G], ['mic', G]];

/** Tetris-mode dock: big flip buttons on the left hand side, drop on the right. */
export const GAME_LAYOUT: Array<[DockAction, number]> = [
  ['exit', BIG],
  ['tilt', 0.028],
  ['flip', 0.028],
  ['spin', 0.028],
  ['drop', 0.03],
  ['pause', BIG],
  ['depth', BIG],
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
  private selected: DockAction | null = null;
  private micState: 'idle' | 'listening' | 'thinking' | 'off' = 'idle';
  private tooltip!: Mesh & { userData: { text?: string; draw?: (t: string) => void } };

  /** `column`: lay the buttons out front-to-back at this desk-local x instead of along the front edge. */
  constructor(
    layout: Array<[DockAction, number]> = BUILD_LAYOUT,
    column?: { x: number; zFront: number; labels?: Partial<Record<DockAction, string>> },
    grid?: { cols: number; dx: number; dz: number; z0: number },
  ) {
    this.root.name = 'dock';
    const gap = 0.012;
    if (grid) {
      // big tiles in a grid on the desk (arcade picker)
      layout.forEach(([id, r], i) => {
        const row = Math.floor(i / grid.cols), col = i % grid.cols;
        const inRow = Math.min(grid.cols, layout.length - row * grid.cols);
        const pos = new Vector3((col - (inRow - 1) / 2) * grid.dx, 0, grid.z0 + row * grid.dz);
        this.buttons.push(this.makeButton(id, r, pos));
        const text = DOCK_LABELS[id]?.[0];
        if (text) {
          const lab = labelMesh(text, 'center', Math.max(2 * r + 0.02, 0.07));
          lab.position.set(pos.x, 0.0015, pos.z + r + 0.012);
          this.root.add(lab);
        }
      });
      this.tooltip = tooltipMesh();
      this.tooltip.visible = false;
      this.root.add(this.tooltip);
      return;
    }
    const total = layout.reduce((a, [, r]) => a + 2 * r + gap, -gap);
    let x = -total / 2;
    let z = column ? column.zFront : 0;
    for (const [id, r] of layout) {
      if (column) {
        z -= r;
        this.buttons.push(this.makeButton(id, r, new Vector3(column.x, 0, z)));
        const text = column.labels?.[id] ?? DOCK_LABELS[id]?.[0];
        if (text) {
          const lw = text.length > 10 ? 0.11 : 0.064;
          const lab = labelMesh(text, 'right', lw);
          lab.position.set(column.x - r - 0.004 - lw / 2, 0.002, z);
          this.root.add(lab);
        }
        z -= r + gap;
        continue;
      }
      x += r;
      const pos = new Vector3(x, 0, ROW_Z + (r === SMALL ? -0.006 : 0));
      this.buttons.push(this.makeButton(id, r, pos));
      const text = DOCK_LABELS[id]?.[0];
      if (text) {
        // printed on the desk just in front of the button, readable from the seat
        const lab = labelMesh(text, 'center', Math.max(2 * r + gap, 0.05));
        lab.position.set(x, 0.0015, pos.z + r + 0.011);
        this.root.add(lab);
      }
      x += r + gap;
    }
    this.tooltip = tooltipMesh();
    this.tooltip.visible = false;
    this.root.add(this.tooltip);
    this.setActiveSwatch('oak');
  }

  /** Centre of a button in the dock's parent space (tests / hints). */
  buttonPos(id: DockAction): Vector3 | null {
    const b = this.buttons.find((x) => x.id === id);
    return b ? b.root.position.clone().add(this.root.position) : null;
  }

  /** Highlight one button permanently (e.g. the current mode). */
  setSelected(id: DockAction | null): void {
    this.selected = id;
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
  updatePokes(tips: Map<number, Vector3>, now: number, hoverPoints: Vector3[] = []): DockAction[] {
    const out: DockAction[] = [];
    let tipFor: Button | null = null;
    let tipD = Infinity;
    for (const b of this.buttons) {
      let hovered = false;
      for (const hp of hoverPoints) {
        const d = Math.hypot(hp.x - b.root.position.x, hp.z - b.root.position.z);
        if (d < b.radius + 0.008 && hp.y < 0.09 && hp.y > -0.03) hovered = true;
      }
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
      if (hovered && !b.id.startsWith('swatch:')) {
        const d = b.root.position.x;
        if (Math.abs(d) < tipD || !tipFor) {
          tipD = Math.abs(d);
          tipFor = b;
        }
      }
    }
    this.showTooltip(tipFor);
    return out;
  }

  private showTooltip(b: Button | null): void {
    const t = this.tooltip;
    const text = b ? DOCK_LABELS[b.id]?.[1] : undefined;
    if (!b || !text) {
      t.visible = false;
      return;
    }
    if (t.userData.text !== text) {
      t.userData.text = text;
      t.userData.draw!(text);
    }
    t.visible = true;
    t.position.set(b.root.position.x, 0.06, b.root.position.z - 0.01);
  }

  /** All button positions (desk-local) — used by on-screen hints. */
  get buttonIds(): DockAction[] {
    return this.buttons.map((b) => b.id);
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
    if (isActiveSwatch || b.id === this.selected) ringOpacity = 0.95;
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

/** Small flat text label lying on the desk. */
function labelMesh(text: string, align: 'right' | 'center' = 'right', width = 0.064): Mesh {
  const c = document.createElement('canvas');
  const aspect = width / 0.016;
  c.height = 64;
  c.width = Math.round(64 * aspect);
  const g = c.getContext('2d')!;
  let size = 40;
  g.font = `800 ${size}px system-ui, sans-serif`;
  while (g.measureText(text).width > c.width - 16 && size > 18) {
    size -= 2;
    g.font = `800 ${size}px system-ui, sans-serif`;
  }
  g.textAlign = align;
  g.textBaseline = 'middle';
  const w = g.measureText(text).width + 20;
  g.fillStyle = 'rgba(10,18,28,0.72)';
  g.beginPath();
  if (align === 'right') g.roundRect(c.width - w, 6, w, 52, 14);
  else g.roundRect((c.width - w) / 2, 6, w, 52, 14);
  g.fill();
  g.fillStyle = '#eaf6ff';
  g.fillText(text, align === 'right' ? c.width - 10 : c.width / 2, 34);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new Mesh(new PlaneGeometry(width, 0.016), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** Upright tooltip that floats above the hovered button, facing the seated user. */
function tooltipMesh(): Mesh & { userData: { text?: string; draw?: (t: string) => void } } {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 96;
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const m = new Mesh(
    new PlaneGeometry(0.2, 0.025),
    new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }),
  ) as Mesh & { userData: { text?: string; draw?: (t: string) => void } };
  m.rotation.x = -0.5;
  m.renderOrder = 30;
  m.userData.draw = (text: string) => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    // shrink long tooltips to fit instead of cutting them off
    let size = 44;
    g.font = `700 ${size}px system-ui, sans-serif`;
    while (g.measureText(text).width > c.width - 56 && size > 24) {
      size -= 2;
      g.font = `700 ${size}px system-ui, sans-serif`;
    }
    const w = Math.min(c.width - 8, g.measureText(text).width + 48);
    g.fillStyle = 'rgba(255,209,102,0.95)';
    g.beginPath();
    g.roundRect((c.width - w) / 2, 8, w, 80, 24);
    g.fill();
    g.fillStyle = '#10161f';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, 50);
    tex.needsUpdate = true;
  };
  return m;
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
    case 'deskL':
    case 'deskR': { // curved arrow, counter-clockwise or clockwise
      const ccw = id === 'deskL';
      g.lineWidth = 10;
      g.beginPath();
      g.arc(64, 66, 34, ccw ? -0.2 : Math.PI + 0.2, ccw ? Math.PI * 1.25 : -Math.PI * 0.25, !ccw);
      g.stroke();
      const ax = ccw ? 64 + 34 * Math.cos(-0.2) : 64 + 34 * Math.cos(Math.PI + 0.2), ay = ccw ? 66 + 34 * Math.sin(-0.2) : 66 + 34 * Math.sin(Math.PI + 0.2);
      g.beginPath(); g.moveTo(ax - 14, ay - 4); g.lineTo(ax + 14, ay - 4); g.lineTo(ax, ay + 14); g.closePath(); g.fill();
      break;
    }
    case 'spinBuild': // turntable: a disc with an arrow around it
      g.beginPath(); g.ellipse(64, 80, 40, 14, 0, 0, Math.PI * 2); g.fill();
      g.fillRect(52, 40, 24, 34);
      g.lineWidth = 7;
      g.beginPath(); g.ellipse(64, 60, 52, 22, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      break;
    case 'board': // a tiled square
      g.lineWidth = 6;
      g.strokeRect(24, 24, 80, 80);
      g.beginPath(); g.moveTo(51, 24); g.lineTo(51, 104); g.moveTo(77, 24); g.lineTo(77, 104); g.moveTo(24, 51); g.lineTo(104, 51); g.moveTo(24, 77); g.lineTo(104, 77); g.stroke();
      break;
    case 'clear': // sweep: a broom over a cross
      g.lineWidth = 10;
      g.beginPath(); g.moveTo(34, 34); g.lineTo(94, 94); g.moveTo(94, 34); g.lineTo(34, 94); g.stroke();
      break;
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
    case 'depth': // rows going back in perspective
      for (let i = 0; i < 4; i++) {
        const w = 84 - i * 14, y = 100 - i * 20;
        g.globalAlpha = 1 - i * 0.18;
        g.fillRect(64 - w / 2, y, w, 10);
      }
      g.globalAlpha = 1;
      break;
    case 'sling': // Y-shaped fork with a band
      g.beginPath(); g.moveTo(64, 112); g.lineTo(64, 66); g.lineTo(34, 24); g.moveTo(64, 66); g.lineTo(94, 24); g.stroke();
      g.lineWidth = 5; g.beginPath(); g.moveTo(34, 26); g.quadraticCurveTo(64, 70, 94, 26); g.stroke();
      g.beginPath(); g.arc(64, 52, 10, 0, Math.PI * 2); g.fill();
      break;
    case 'retry':
      g.beginPath(); g.arc(64, 64, 34, Math.PI * 0.35, Math.PI * 1.95); g.stroke();
      g.beginPath(); g.moveTo(94, 30); g.lineTo(100, 62); g.lineTo(72, 48); g.closePath(); g.fill();
      break;
    case 'next':
      g.beginPath(); g.moveTo(34, 30); g.lineTo(78, 64); g.lineTo(34, 98); g.closePath(); g.fill();
      g.fillRect(84, 30, 12, 68);
      break;
    case 'turnL':
    case 'turnR': {
      g.save();
      if (id === 'turnR') { g.translate(128, 0); g.scale(-1, 1); }
      g.beginPath(); g.ellipse(64, 72, 42, 20, 0, Math.PI * 0.05, Math.PI * 1.3); g.stroke();
      g.beginPath(); g.moveTo(14, 56); g.lineTo(34, 78); g.lineTo(42, 52); g.closePath(); g.fill();
      g.fillRect(52, 30, 24, 30);
      g.restore();
      break;
    }
    case 'zoom':
      g.beginPath(); g.arc(56, 56, 28, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(76, 76); g.lineTo(106, 106); g.stroke();
      g.beginPath(); g.moveTo(44, 56); g.lineTo(68, 56); g.moveTo(56, 44); g.lineTo(56, 68); g.stroke();
      break;
    case 'arcade': // joystick
      g.fillRect(28, 84, 72, 22);
      g.fillRect(58, 40, 12, 46);
      g.beginPath(); g.arc(64, 36, 16, 0, Math.PI * 2); g.fill();
      break;
    case 'flapbro':
    case 'flap': // wing
      g.beginPath(); g.moveTo(20, 70); g.quadraticCurveTo(50, 20, 108, 34); g.quadraticCurveTo(84, 52, 96, 60); g.quadraticCurveTo(70, 66, 80, 80); g.quadraticCurveTo(50, 86, 20, 70); g.fill();
      break;
    case 'view': // an eye
      g.beginPath(); g.ellipse(64, 64, 46, 26, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(64, 64, 13, 0, Math.PI * 2); g.fill();
      break;
    case 'penguin':
      g.beginPath(); g.ellipse(64, 70, 30, 40, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#253445'; g.beginPath(); g.ellipse(64, 78, 18, 28, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffd166'; g.beginPath(); g.moveTo(56, 46); g.lineTo(72, 46); g.lineTo(64, 56); g.closePath(); g.fill();
      break;
    case 'jump':
      g.beginPath(); g.moveTo(64, 16); g.lineTo(100, 56); g.lineTo(76, 56); g.lineTo(76, 84); g.lineTo(52, 84); g.lineTo(52, 56); g.lineTo(28, 56); g.closePath(); g.fill();
      g.fillRect(28, 100, 72, 10);
      break;
    case 'swarm': // little ship
      g.beginPath(); g.moveTo(64, 18); g.lineTo(98, 100); g.lineTo(64, 84); g.lineTo(30, 100); g.closePath(); g.fill();
      break;
    case 'maze':
      g.lineWidth = 8;
      g.strokeRect(22, 22, 84, 84);
      g.beginPath(); g.moveTo(22, 50); g.lineTo(78, 50); g.moveTo(50, 78); g.lineTo(106, 78); g.moveTo(50, 50); g.lineTo(50, 78); g.stroke();
      g.beginPath(); g.arc(36, 92, 8, 0, Math.PI * 2); g.fill();
      break;
    case 'whack':
      g.beginPath(); g.ellipse(64, 96, 40, 12, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(64, 70, 22, Math.PI, 0); g.fill();
      g.fillRect(42, 70, 44, 22);
      break;
    case 'breakout':
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) g.fillRect(18 + c * 24, 18 + r * 16, 20, 12);
      g.beginPath(); g.arc(64, 82, 8, 0, Math.PI * 2); g.fill();
      g.fillRect(40, 104, 48, 8);
      break;
    case 'tower':
      for (let i = 0; i < 5; i++) g.fillRect(i % 2 ? 40 : 30, 100 - i * 18, i % 2 ? 48 : 68, 12);
      break;
    case 'start':
      g.beginPath(); g.moveTo(40, 26); g.lineTo(100, 64); g.lineTo(40, 102); g.closePath(); g.fill();
      break;
    case 'fire':
      g.beginPath(); g.arc(64, 64, 34, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(64, 64, 12, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(64, 14); g.lineTo(64, 34); g.moveTo(64, 94); g.lineTo(64, 114); g.moveTo(14, 64); g.lineTo(34, 64); g.moveTo(94, 64); g.lineTo(114, 64); g.stroke();
      break;
    case 'totop':
      g.fillRect(30, 96, 68, 12); g.fillRect(30, 78, 68, 12);
      g.beginPath(); g.moveTo(64, 16); g.lineTo(92, 46); g.lineTo(74, 46); g.lineTo(74, 66); g.lineTo(54, 66); g.lineTo(54, 46); g.lineTo(36, 46); g.closePath(); g.fill();
      break;
    case 'build':
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

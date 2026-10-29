/**
 * Global tunables. Units are metres unless noted.
 * Grid geometry is mutable so the user can switch block/grid size presets
 * (draft → fine) without a reload. ES module live bindings keep importers in sync.
 */

export type GridPresetId = 'draft' | 'studio' | 'detail' | 'fine' | 'mosaic';

export interface GridPreset {
  id: GridPresetId;
  label: string;
  /** Voxel edge length in metres. */
  cell: number;
  gx: number;
  gz: number;
  gy: number;
  /** Soft cap on placed voxels (InstancedMesh + hand budget). */
  maxVoxels: number;
  blurb: string;
}

/**
 * Hand-friendly presets. Desk footprint stays ~0.5–0.7 m (seated reach).
 * "Mosaic" is the practical pinch-sculpting ceiling on Quest 3.
 * True 1000×1000 is not offered as a build grid: at 60 fps + hand tracking
 * it is not sculptable. Use fine/mosaic for detail, or import for display-only art.
 */
export const GRID_PRESETS: GridPreset[] = [
  {
    id: 'draft',
    label: 'Draft · 12×12',
    cell: 0.08,
    gx: 12,
    gz: 12,
    gy: 16,
    maxVoxels: 2048,
    blurb: 'Big blocks, easy pinches. Fast simple shapes.',
  },
  {
    id: 'studio',
    label: 'Studio · 16×12',
    cell: 0.04,
    gx: 16,
    gz: 12,
    gy: 18,
    maxVoxels: 4096,
    blurb: 'Default balance of detail and reach.',
  },
  {
    id: 'detail',
    label: 'Detail · 24×24',
    cell: 0.028,
    gx: 24,
    gz: 24,
    gy: 24,
    maxVoxels: 8192,
    blurb: 'Finer blocks. Good for roofs and trim.',
  },
  {
    id: 'fine',
    label: 'Fine · 48×48',
    cell: 0.014,
    gx: 48,
    gz: 48,
    gy: 32,
    maxVoxels: 16384,
    blurb: 'Small blocks. Best after you are used to pinches.',
  },
  {
    id: 'mosaic',
    label: 'Mosaic · 64×64',
    cell: 0.01,
    gx: 64,
    gz: 64,
    gy: 32,
    maxVoxels: 24576,
    blurb: 'Smallest hand-friendly grid. Tiny blocks, lots of them.',
  },
];

function findPreset(id: string): GridPreset {
  return GRID_PRESETS.find((p) => p.id === id) ?? GRID_PRESETS[1];
}

function fromQuery(): GridPreset {
  if (typeof location === 'undefined') return GRID_PRESETS[1];
  const q = new URLSearchParams(location.search);
  return findPreset(q.get('grid') || q.get('blocks') || 'studio');
}

// --- mutable grid state -------------------------------------------------
const initial = fromQuery();

export let CELL = initial.cell;
export let GRID_X = initial.gx;
export let GRID_Z = initial.gz;
export let GRID_Y = initial.gy;
export let MAX_VOXELS = initial.maxVoxels;
export let GRID_PRESET_ID: GridPresetId = initial.id;

/** Grid cell index ranges: x in [X_MIN, X_MAX], z in [Z_MIN, Z_MAX], y in [0, GRID_Y-1] */
export let X_MIN = -GRID_X / 2;
export let X_MAX = GRID_X / 2 - 1;
export let Z_MIN = -GRID_Z / 2;
export let Z_MAX = GRID_Z / 2 - 1;

export function grabRadius(): number {
  return CELL * 0.75 + 0.015;
}

/** Apply a preset. Recomputes derived bounds. Does not clear the world. */
export function applyGridPreset(id: GridPresetId | string): GridPreset {
  const p = findPreset(String(id));
  CELL = p.cell;
  GRID_X = p.gx;
  GRID_Z = p.gz;
  GRID_Y = p.gy;
  MAX_VOXELS = p.maxVoxels;
  GRID_PRESET_ID = p.id;
  X_MIN = -GRID_X / 2;
  X_MAX = GRID_X / 2 - 1;
  Z_MIN = -GRID_Z / 2;
  Z_MAX = GRID_Z / 2 - 1;
  return p;
}

/** Next preset in the cycle (draft → studio → detail → fine → mosaic → draft). */
export function nextGridPreset(): GridPreset {
  const i = GRID_PRESETS.findIndex((p) => p.id === GRID_PRESET_ID);
  return applyGridPreset(GRID_PRESETS[(i + 1) % GRID_PRESETS.length].id);
}

/** Pick a preset without mutating live grid constants (safe before a reload). */
export function peekGridPreset(id: GridPresetId | string): GridPreset {
  return GRID_PRESETS.find((p) => p.id === id) ?? GRID_PRESETS[1];
}

/** Cycle target without applying it. */
export function peekNextGridPreset(): GridPreset {
  const i = GRID_PRESETS.findIndex((p) => p.id === GRID_PRESET_ID);
  return GRID_PRESETS[(i + 1) % GRID_PRESETS.length];
}

/** Desk placement relative to the seated head pose at session start. */
export const DESK_FORWARD = 0.5;
export const DESK_BELOW_HEAD = 0.45;

/** Pinch hysteresis (thumb-tip <-> index-tip distance). */
export const PINCH_START = 0.022;
export const PINCH_END = 0.04;
/** How far from a block centre a pinch can still grab it. */
export const GRAB_RADIUS = 0.04 * 0.75 + 0.015; // updated via grabRadius() at use sites that need live value
/** Movement before a press turns into a drag. */
export const DRAG_THRESHOLD = 0.012;
/** Holding still this long on a block detaches it from its cluster. */
export const HOLD_DETACH_MS = 800;
/** Lift applied to carried blocks so they float just above the hand target. */
export const CARRY_LIFT = 0.012;

export const UNDO_LIMIT = 20;

export const QUERY = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
export const DEBUG = QUERY.has('debug');
export const LOW_FX = QUERY.has('lowfx');

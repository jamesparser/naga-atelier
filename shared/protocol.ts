/**
 * Agent <-> Quest protocol, version 1.
 * Shared by the browser client and the serverless agent endpoint.
 * Keep this file dependency-free.
 */

export const PROTOCOL_VERSION = 1 as const;

export const BLUEPRINT_IDS = [
  'house_small',
  'stairs',
  'wall',
  'tower',
  'garden',
  'desk_shelf',
  'arch',
  'bench',
  'fireplace',
  'maze_tiny',
  'bridge',
  'car',
  'boat',
  'rocket',
  'castle',
  'pyramid',
  'tree',
  'train',
  'plane',
  'table',
  'chair',
  'robot',
  'dog',
  'snowman',
  'windmill',
  'lighthouse',
  'tent',
  'heart',
  'bed',
] as const;
export type BlueprintId = (typeof BLUEPRINT_IDS)[number];

export const PALETTE_NAMES = [
  'oak',
  'stone',
  'white',
  'roof_red',
  'grass',
  'sky',
  'water',
  'gold',
  'ink',
  'glass',
] as const;
export type PaletteName = (typeof PALETTE_NAMES)[number];

export const ANCHORS = ['desk_center', 'desk_left', 'desk_right', 'floating'] as const;
export type Anchor = (typeof ANCHORS)[number];

export const COMMAND_TYPES = [
  'build',
  'sculpt',
  'clear',
  'color',
  'move',
  'undo',
  'redo',
  'scale',
  'rotate',
  'export',
  'grid',
  'game',
] as const;
export const GAME_ACTIONS = ['start', 'stop', 'pause', 'drop', 'retry', 'next'] as const;
export const GAME_MODES = ['tetris', 'sling'] as const;
export type GameMode = (typeof GAME_MODES)[number];
export type GameAction = (typeof GAME_ACTIONS)[number];
export type CommandType = (typeof COMMAND_TYPES)[number];

export const GRID_PRESET_IDS = ['draft', 'studio', 'detail', 'fine', 'mosaic'] as const;
export type GridPresetId = (typeof GRID_PRESET_IDS)[number];

export interface BuildCommand {
  v: 1;
  type: CommandType;
  /** build only */
  blueprintId?: BlueprintId;
  anchor?: Anchor;
  /** palette override (build) or new color (color) */
  color?: PaletteName;
  /** build: uniform scale 0.5–2. scale: relative factor applied to target. */
  scale?: number;
  /** color/move/scale/rotate: "last" (default), "all", or a cluster name such as "roof" */
  target?: string;
  /** move: metres in desk space (+x = right, +y = up, +z = toward user) */
  dx?: number;
  dy?: number;
  dz?: number;
  /** sculpt: a freeform shape the agent composed from boxes (anything without a blueprint) */
  shape?: SculptShape;
  /** game: Tetris mode control */
  action?: GameAction;
  /** game start: which game (default tetris) */
  game?: GameMode;
  /** rotate: quarter turns clockwise seen from above (default 1) */
  turns?: number;
  /** grid: which block-size preset to switch to */
  preset?: GridPresetId;
  message?: string;
  ts?: number;
}

/** A freeform voxel shape: solid boxes [x, y, z, w, h, d, colour, part] in cells, origin at the min corner. */
export interface SculptShape {
  label: string;
  boxes: Array<[number, number, number, number, number, number, PaletteName, string]>;
}
export const SCULPT_LIMITS = { maxBoxes: 40, maxX: 14, maxY: 15, maxZ: 10, maxCells: 500 } as const;

/** Validate a sculpt shape; returns null when nothing usable is left. */
export function sanitizeShape(raw: unknown): SculptShape | null {
  if (!isObj(raw)) return null;
  const boxesRaw = Array.isArray(raw.boxes) ? raw.boxes.slice(0, SCULPT_LIMITS.maxBoxes) : [];
  const L = SCULPT_LIMITS;
  const boxes: SculptShape['boxes'] = [];
  const cells = new Set<string>();
  for (const b of boxesRaw) {
    // accept [x,y,z,w,h,d,c,part] or {x,y,z,w,h,d,color,part}
    const a: unknown[] = Array.isArray(b) ? b : isObj(b) ? [b.x, b.y, b.z, b.w ?? b.sx, b.h ?? b.sy, b.d ?? b.sz, b.color ?? b.c, b.part ?? b.name] : [];
    const n = a.slice(0, 6).map((v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : NaN));
    if (n.some((v) => Number.isNaN(v))) continue;
    let [x, y, z, w, h, d] = n;
    x = clamp(x, 0, L.maxX - 1); y = clamp(y, 0, L.maxY - 1); z = clamp(z, 0, L.maxZ - 1);
    w = clamp(w, 1, L.maxX - x); h = clamp(h, 1, L.maxY - y); d = clamp(d, 1, L.maxZ - z);
    const c = typeof a[6] === 'string' && (PALETTE_NAMES as readonly string[]).includes(a[6]) ? (a[6] as PaletteName) : 'stone';
    const part = (typeof a[7] === 'string' ? a[7].toLowerCase().replace(/[^a-z_]/g, '').slice(0, 16) : '') || 'body';
    let added = 0;
    for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) for (let k = z; k < z + d; k++) {
      if (cells.size >= L.maxCells) break;
      const key = `${i},${j},${k}`;
      if (!cells.has(key)) { cells.add(key); added++; }
    }
    boxes.push([x, y, z, w, h, d, c, part]);
    if (cells.size >= L.maxCells) break;
    void added;
  }
  if (cells.size === 0) return null;
  const label = typeof raw.label === 'string' ? raw.label.replace(/[^\w '-]/g, '').trim().slice(0, 32) : '';
  return { label: label || 'sculpture', boxes };
}

/** One round-trip response from the agent endpoint. */
export interface AgentEnvelope {
  speech: string;
  build: BuildCommand | null;
  /** What the server heard (after STT). Shown as the user caption. */
  transcript?: string;
  /** Optional base64 audio of `speech` (mp3/wav) when server TTS is configured. */
  audio?: { mime: string; b64: string } | null;
  /** Where the decision came from: "llm" | "rules" | "fallback". Debug only. */
  source?: string;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

/**
 * Validate & normalise anything that claims to be a BuildCommand.
 * Returns null for anything unusable (unknown type, unknown blueprint, ...).
 * Never throws.
 */
export function sanitizeCommand(raw: unknown): BuildCommand | null {
  if (!isObj(raw)) return null;
  const type = raw.type;
  if (typeof type !== 'string' || !(COMMAND_TYPES as readonly string[]).includes(type)) return null;
  const cmd: BuildCommand = { v: 1, type: type as CommandType };

  if (type === 'build') {
    const id = raw.blueprintId;
    if (typeof id !== 'string' || !(BLUEPRINT_IDS as readonly string[]).includes(id)) return null;
    cmd.blueprintId = id as BlueprintId;
    const anchor = raw.anchor;
    cmd.anchor =
      typeof anchor === 'string' && (ANCHORS as readonly string[]).includes(anchor)
        ? (anchor as Anchor)
        : 'desk_center';
  }
  if (type === 'sculpt') {
    // LLMs sometimes nest the shape; accept {shape:{label,boxes}} or top-level label/boxes.
    const shape = sanitizeShape(isObj(raw.shape) ? raw.shape : raw);
    if (!shape) return null;
    cmd.shape = shape;
    const anchor = raw.anchor;
    cmd.anchor =
      typeof anchor === 'string' && (ANCHORS as readonly string[]).includes(anchor) ? (anchor as Anchor) : 'desk_center';
  }
  if (typeof raw.color === 'string' && (PALETTE_NAMES as readonly string[]).includes(raw.color)) {
    cmd.color = raw.color as PaletteName;
  }
  if (type === 'color' && !cmd.color) return null;

  if (typeof raw.scale === 'number' && Number.isFinite(raw.scale)) {
    cmd.scale = clamp(raw.scale, 0.5, 2);
  }
  if (type === 'scale' && cmd.scale === undefined) return null;

  if (typeof raw.target === 'string' && raw.target.length > 0 && raw.target.length < 32) {
    cmd.target = raw.target.toLowerCase().replace(/[^a-z_]/g, '') || 'last';
  }
  for (const k of ['dx', 'dy', 'dz'] as const) {
    const v = raw[k];
    if (typeof v === 'number' && Number.isFinite(v)) cmd[k] = clamp(v, -0.5, 0.5);
  }
  if (type === 'move' && cmd.dx === undefined && cmd.dy === undefined && cmd.dz === undefined) return null;
  if (typeof raw.turns === 'number' && Number.isFinite(raw.turns)) {
    cmd.turns = ((Math.round(raw.turns) % 4) + 4) % 4 || 1;
  }
  if (type === 'game') {
    if (typeof raw.action !== 'string' || !(GAME_ACTIONS as readonly string[]).includes(raw.action)) return null;
    cmd.action = raw.action as GameAction;
    if (typeof raw.game === 'string' && (GAME_MODES as readonly string[]).includes(raw.game)) cmd.game = raw.game as GameMode;
  }
  if (typeof raw.message === 'string') cmd.message = raw.message.slice(0, 160);
  if (typeof raw.ts === 'number') cmd.ts = raw.ts;
  if (type === 'grid') {
    const p = raw.preset;
    if (typeof p === 'string' && (GRID_PRESET_IDS as readonly string[]).includes(p)) {
      cmd.preset = p as GridPresetId;
    }
    // grid without preset = cycle to next
  }
  return cmd;
}

/** Validate a whole envelope (as returned by the server or an LLM). */
export function sanitizeEnvelope(raw: unknown): AgentEnvelope | null {
  if (!isObj(raw)) return null;
  const speech = typeof raw.speech === 'string' ? raw.speech.slice(0, 240) : '';
  const build = raw.build === null || raw.build === undefined ? null : sanitizeCommand(raw.build);
  if (!speech && !build) return null;
  const env: AgentEnvelope = {
    speech: speech || build?.message || '',
    build,
  };
  if (typeof raw.transcript === 'string') env.transcript = raw.transcript.slice(0, 300);
  if (typeof raw.source === 'string') env.source = raw.source;
  if (isObj(raw.audio) && typeof raw.audio.b64 === 'string' && typeof raw.audio.mime === 'string') {
    env.audio = { mime: raw.audio.mime, b64: raw.audio.b64 };
  }
  return env;
}

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
  'clear',
  'color',
  'move',
  'undo',
  'redo',
  'scale',
  'rotate',
] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

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
  /** rotate: quarter turns clockwise seen from above (default 1) */
  turns?: number;
  message?: string;
  ts?: number;
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
  if (typeof raw.message === 'string') cmd.message = raw.message.slice(0, 160);
  if (typeof raw.ts === 'number') cmd.ts = raw.ts;
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

import { PALETTE_NAMES, type PaletteName } from '../../shared/protocol.js';

/** Linear-ish sRGB hex values tuned to read well over Quest 3 passthrough. */
export const PALETTE: Record<PaletteName, number> = {
  oak: 0xc8955a,
  stone: 0x9aa0a8,
  white: 0xf2efe8,
  roof_red: 0xd2483c,
  grass: 0x5fb04a,
  sky: 0x5aa7e8,
  water: 0x2fb6b0,
  gold: 0xf2b630,
  ink: 0x2d3142,
  glass: 0xbfe8ff,
};

/** Order of swatches on the dock. */
export const SWATCHES: PaletteName[] = ['oak', 'stone', 'white', 'roof_red', 'grass', 'sky', 'gold', 'ink'];

export const PALETTE_INDEX: Record<PaletteName, number> = Object.fromEntries(
  PALETTE_NAMES.map((n, i) => [n, i]),
) as Record<PaletteName, number>;

export function isPaletteName(x: unknown): x is PaletteName {
  return typeof x === 'string' && (PALETTE_NAMES as readonly string[]).includes(x);
}

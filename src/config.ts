/** Global tunables. Units are metres unless noted. */
export const CELL = 0.04; // voxel edge length
export const GRID_X = 16; // cells across (x)
export const GRID_Z = 12; // cells deep (z)
export const GRID_Y = 18; // max stack height (cells)
/** Grid cell index ranges: x in [X_MIN, X_MAX], z in [Z_MIN, Z_MAX], y in [0, GRID_Y-1] */
export const X_MIN = -GRID_X / 2;
export const X_MAX = GRID_X / 2 - 1;
export const Z_MIN = -GRID_Z / 2;
export const Z_MAX = GRID_Z / 2 - 1;

/** Desk placement relative to the seated head pose at session start. */
export const DESK_FORWARD = 0.5;
export const DESK_BELOW_HEAD = 0.45;

/** Pinch hysteresis (thumb-tip <-> index-tip distance). */
export const PINCH_START = 0.022;
export const PINCH_END = 0.04;
/** How far from a block centre a pinch can still grab it. */
export const GRAB_RADIUS = CELL * 0.75 + 0.015;
/** Movement before a press turns into a drag. */
export const DRAG_THRESHOLD = 0.012;
/** Holding still this long on a block detaches it from its cluster. */
export const HOLD_DETACH_MS = 450;
/** Lift applied to carried blocks so they float just above the hand target. */
export const CARRY_LIFT = 0.012;

export const UNDO_LIMIT = 20;
export const MAX_VOXELS = 4096;

export const QUERY = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
export const DEBUG = QUERY.has('debug');
export const LOW_FX = QUERY.has('lowfx');

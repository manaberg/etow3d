// The simulation keeps the 2D game's numbers: positions, sizes and speeds are
// in "pixels" on the ground plane (x to the east, y to the south) and timers
// count 60 Hz frames. The renderer maps one 24px collision tile to one unit.
export const TILE = 24;
export const CELL = 48;
export const UNIT = 1 / TILE;
export const STEP = 1 / 60;

export const WALL_HEIGHT = 3.4;

export function randInt(min, max) {
  if (max <= min) {
    return min;
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

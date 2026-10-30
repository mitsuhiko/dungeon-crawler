// Where a fall (map.falls) pours: over the edge of its cell `c` towards `d`, down from level `top`
// to `bot`. A wide one (a stream two cells across: `side`, 1 or -1, cubegen/grotto.js) pours over
// the edge of the cell beside it too, and its curtain hangs between the two.
import { N, DIRS } from './constants.js';

// across a fall's lip, the way `side` counts: [x, z] per cell
export const acrossOf = f => [DIRS[f.d][1], DIRS[f.d][0]];

// the cells it comes down in front of: its own, and for a wide one the one beside it
export function fallCells(f) {
  if (!f.side) return [f.c];
  const [ax, az] = acrossOf(f);
  return [f.c, f.c + (ax + az * N) * f.side];
}

// the middle of its curtain across, from the middle of its cell: half a cell to its side if wide
export function fallShift(f) {
  const [ax, az] = acrossOf(f), s = (f.side ?? 0) / 2;
  return [ax * s, az * s];
}

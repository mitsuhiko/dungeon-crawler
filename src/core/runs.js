// A run keeps its logical path in `pieces`; every physical lane has the same length and j.
// Older/single-cell structures need not carry lanes.
import { N, DIRS, OPP } from './constants.js';

export const runPieces = r => r.lanes ? r.lanes.flat() : r.pieces;

// The floors meeting each lane, including ordinary unprotected banks. Look them up rather
// than storing extra graph references: town spans construct their lanes outside place.js.
export function laneEnds(cols, r) {
  return (r.lanes || [r.pieces]).map(lane => {
    const end = (p, d, original) => {
      const [dx, dz] = DIRS[d], x = p.c % N + dx, z = Math.floor(p.c / N) + dz;
      if (x < 0 || z < 0 || x >= N || z >= N) return null;
      const c = z * N + x;
      if (c === original.c) return original;
      return cols[c]?.find(f => !f.fluid && f.layer === original.layer && f.top === original.top) || null;
    };
    return [end(lane[0], OPP[r.d], r.from), end(lane.at(-1), r.d, r.to)];
  });
}

// Cube coordinates and the six faces. Y = 0 is the surface, deeper cubes have Y < 0.
// Directions 0-3 match DIRS (+x, -x, +z, -z); 4 = down, 5 = up.
import { N } from '../core/constants.js';

// learn: space.html#cube-address (see learn/README.md)
export const D6 = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, 1, 0]];
export const OPP6 = [1, 0, 3, 2, 5, 4];
export const DIR_NAME = ['east', 'west', 'south', 'north', 'down', 'up'];
export const MIN_Y = -20;   // deepest stratum (depth 20)

// learn: space.html#cube-address (see learn/README.md)
export const key = (X, Y, Z) => `${X},${Y},${Z}`;
// learn: space.html#cube-address (see learn/README.md)
export const parse = k => k.split(',').map(Number);
// learn: space.html#cube-address (see learn/README.md)
export const step = (k, d) => { const [X, Y, Z] = parse(k); return key(X + D6[d][0], Y + D6[d][1], Z + D6[d][2]); };
// a face is stored once, under the cube on its low side (east / south / down face of that cube)
export const faceKey = (k, d) => d % 2 ? `${step(k, d)}/${OPP6[d]}` : `${k}/${d}`;
export const hashKey = k => { let h = 2166136261; for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619); return h >>> 0; };

// Where /goto goes (game/devcommands.js), from its words: a way ('down', 'up': the nearest one,
// taken), a side ('east' ...: the next cube), or a place: a depth, a cube on it (X,Z, as the
// minimap shows it: 'cube 3, 2'), a spot in that cube (x,y,z or x,z, in cells; y: the ground's
// height, none: the highest ground there). A cube without a depth is on depth `here`, a depth
// without a cube its entrance. { way } | { side } | { depth, cell?, spot? } | { error }
const CELL = /^(-?\d+),(-?\d+)$/, NUM = '(-?\\d+(?:\\.\\d+)?)', SPOT = new RegExp(`^${NUM},(?:${NUM},)?${NUM}$`);
export function readPlace([where, ...rest], here, maxDepth, size = N) {
  rest = rest.filter(w => w !== undefined);
  if (where === 'down' || where === 'up' || DIR_NAME.indexOf(where) >= 0) {
    if (rest.length) return { error: `/goto ${where} takes nothing after it` };
    return where === 'down' || where === 'up' ? { way: where } : { side: DIR_NAME.indexOf(where) };
  }
  let depth = here;
  if (/^\d+$/.test(where)) {
    depth = Number(where);
    if (depth > maxDepth) return { error: `Depth goes from 0 to ${maxDepth}` };
  } else rest.unshift(where);
  const [at, spotText, more] = rest, place = { depth };
  if (more !== undefined) return { error: 'Too many words: /goto [depth] [X,Z] [x,y,z]' };
  if (at !== undefined) {
    const m = CELL.exec(at);
    if (!m) return { error: `"${at}" is not a cube: X,Z (as the minimap shows it)` };
    place.cell = [Number(m[1]), Number(m[2])];
  }
  if (spotText !== undefined) {
    const m = SPOT.exec(spotText);
    if (!m) return { error: `"${spotText}" is not a spot in the cube: x,y,z or x,z` };
    const [x, y, z] = [Number(m[1]), m[2] === undefined ? null : Number(m[2]), Number(m[3])];
    if (x < 0 || x > size || z < 0 || z > size) return { error: `A spot's x and z go from 0 to ${size}` };
    place.spot = { x, y, z };
  }
  return place;
}
export const isCellText = t => CELL.test(t);

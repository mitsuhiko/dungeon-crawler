// Layer 0 fluids: rivers that enter through the cube faces (their crossings are shared with the
// neighbours) and meet at a junction, a lake for lake cubes, plus a few pools. Water spreads wider
// than lava or acid (WIDER): a pool, a lake of it is bigger, and so deep in more of its middle
// (cubegen/escape.js shoalWater), to swim in.
import { N, DIRS, FLUID_NAME, WATER } from '../core/constants.js';
import { idx, inb } from '../core/util.js';
import { edgeCell } from './portals.js';
import { bankGround } from './contain.js';

export const RIVER_SURF = 2;   // all rivers in the world flow at this level
// how much wider a body of water is than one of lava or acid (its radius, cells)
export const WIDER = 0.6;
const wider = type => type === WATER ? WIDER : 0;

export function carveRiver(ctx) {
  const { R, ri, pickFluid, lvl0, prot0, stats, spec } = ctx;
  const fluid0 = new Uint8Array(N * N), surf0 = new Int16Array(N * N);
  // a pool's surface level with its lowest bank, bed two below the surface
  const fill = (cells, type, S) => { for (const i of cells) { fluid0[i] = type; surf0[i] = S; lvl0[i] = Math.max(0, S - 2); ctx.void0[i] = 0; } };

  // (a great lake, cubegen/setpieces.js, is its own lake: rivers run into it and end there)
  const ends = spec.faces.map((f, d) => f.river && { d, ...f.river }).filter(Boolean), lake = spec.kind === 'lake' && !spec.lake;
  const sea = new Set(ctx.seaCells || []);
  if (ends.length || lake) {
    const jx = ri(6, 9), jz = ri(6, 9), cells = new Set();
    for (const e of ends) {
      const c0 = edgeCell(e.d, e.pos, 0), lat = e.d < 2 ? [0, 1] : [1, 0];
      let x = c0 % N, z = (c0 / N) | 0;
      const mark = () => { for (let k = 0; k < e.w; k++) if (inb(x + lat[0] * k, z + lat[1] * k)) cells.add(idx(x + lat[0] * k, z + lat[1] * k)); };
      mark();
      for (let s = 0; s < 2; s++) { x -= DIRS[e.d][0]; z -= DIRS[e.d][1]; mark(); }   // straight in from the face
      for (let guard = 0; (x !== jx || z !== jz) && guard < 60 && !(spec.lake && sea.has(idx(x, z))); guard++) {
        const dx = jx - x, dz = jz - z, alongX = R() < (Math.abs(dx) > Math.abs(dz) ? 0.75 : 0.25);
        if ((alongX && dx) || !dz) x += Math.sign(dx); else z += Math.sign(dz);
        mark();
      }
    }
    if (lake || ends.length === 1 && !spec.lake) {   // a lake, or a pool where a lone river ends
      const rad = (lake ? 3.4 + R() * 1.8 : 1.8 + R() * 0.8) + wider(spec.fluid);
      for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) if (Math.hypot(x - jx, z - jz) < rad) cells.add(idx(x, z));
    }
    fill([...cells].filter(i => !prot0[i]), spec.fluid, RIVER_SURF);
    stats.fluids.push(FLUID_NAME[spec.fluid] + (lake ? ' lake' : ' river'));
  }

  // archetype seas and crater lakes (where the cube could not open to the void)
  const seas = (ctx.seaCells || []).filter(i => !prot0[i] && !fluid0[i]);
  if (seas.length) { fill(seas, spec.fluid, RIVER_SURF); stats.fluids.push(FLUID_NAME[spec.fluid] + (spec.lake ? ' lake' : ' sea')); }

  // pools keep a dry rim: never next to other fluid (it would stand at another level) or the void
  const wet = i => fluid0[i] || ctx.void0[i];
  const rim = (x, z) => DIRS.some(([dx, dz]) => wet(idx(x + dx, z + dz)));
  // (none on a hairpin's summit, cubegen/areas.js: it stays level; none round a lone peak: mostly empty)
  // (nor in a trial room, cubegen/trials/: the trial decides its fluids)
  for (let p = spec.area?.role === 'summit' || spec.peak || spec.trial ? 0 : ri(1, 3); p > 0; p--) {
    const type = pickFluid();
    const cx = 3 + R() * (N - 6), cz = 3 + R() * (N - 6), rad = 1.1 + R() * 1.4 + wider(type);
    const cells = [];
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
      const i = idx(x, z);
      if (!prot0[i] && !wet(i) && !rim(x, z) && !ctx.keep?.has(i) && Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < rad) cells.push(i);
    }
    if (!cells.length) continue;
    // on the big height pieces never over the edge of a cliff (it would cut a pit into it)
    if ((spec.height || spec.pinnacle || spec.area || spec.peak) && Math.max(...cells.map(i => lvl0[i])) - Math.min(...cells.map(i => lvl0[i])) > 2) continue;
    const set = new Set(cells);
    let S = Infinity;
    for (const i of cells) {
      S = Math.min(S, lvl0[i]);
      const x = i % N, z = (i / N) | 0;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (inb(nx, nz) && !set.has(idx(nx, nz)) && !fluid0[idx(nx, nz)]) S = Math.min(S, lvl0[idx(nx, nz)]);
      }
    }
    fill(cells, type, Math.max(1, S));   // (its surface level with its lowest bank: walked into and out of)
    stats.fluids.push(FLUID_NAME[type] + ' pool');
  }
  ctx.fluid0 = fluid0; ctx.surf0 = surf0;
  bankGround(ctx);
}

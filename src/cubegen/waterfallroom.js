// A peaceful ordinary forest behind the curtain, not a house interior. Uses the normal
// terrain/forest dressing, clear-water swimming, door transitions and reward-site chest.
import { N, LH, DIRS, EDGE_CORNERS, OPP, WATER } from '../core/constants.js';
import { idx, hash32 } from '../core/util.js';
import { indexBlockers } from '../core/blockers.js';
import { propMetadata } from '../core/propcatalog.js';
import { createContext } from './context.js';

export function generateWaterfallRoom(spec, outside, entry) {
  const ctx = createContext(spec.seed), floors = [];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const source = x >= 2 && x <= 5 && z >= 1 && z <= 3;
    const channel = source && x === 3;
    const pool = x >= 2 && x <= 5 && z >= 4 && z <= 6;
    const top = channel ? 4 : source ? 7 : pool ? 0 : 4;
    const f = ctx.mk(idx(x, z), top, 0, 0);
    Object.assign(f, { cs: Array(4).fill(top * LH), split: 0, id: floors.length,
      fluid: channel || pool ? WATER : 0, surf: channel ? 6 : pool ? 3 : 0 });
    // A gentle two-cell shore out of the pool, for normal swimming and click-to-walk.
    if (pool && z >= 5) {
      const low = z - 5;
      f.cs = [low, low, low + 1, low + 1]; f.top = z === 5 ? 1 : 3;
    }
    ctx.cols[f.c].push(f); floors.push(f);
  }
  for (const f of floors) f.link = DIRS.map(([dx, dz], d) => {
    const x = f.x + dx, z = f.z + dz;
    if (x < 0 || z < 0 || x >= N || z >= N) return null;
    const g = ctx.cols[idx(x, z)][0], [a, b] = EDGE_CORNERS[d], [ga, gb] = EDGE_CORNERS[OPP[d]];
    return f.cs[a] === g.cs[ga] && f.cs[b] === g.cs[gb] ? g : null;
  });
  // The small fall inside doubles as the way back through the water, with no wooden door.
  const door = { id: 'out', building: entry.building, to: outside.key,
    x: 3.5, y: 1, z: 4.1, nx: 0, nz: 1, w: 1.1, swim: true };
  const anchor = { x: 9.5, y: 2, z: 9.5, yaw: 0 }, access = { x: 9.5, y: 2, z: 10.5 };
  const floor = floors[idx(9, 9)], approach = floors[idx(9, 10)];
  const site = { id: `${outside.key}:waterfall:${spec.seed}`, seed: hash32(spec.seed ^ 0x51e7),
    prestige: 'uncommon', biome: 'darkforest', setting: 'alcove', form: 'alcove', encounter: null,
    spawn: 'treasure', layer: 0, cells: [floor.c], anchor, floor: floor.id, accessFloor: approach.id,
    entryFloor: approach.id, exitFloor: approach.id, approach: access };
  const chest = propMetadata.get('treasure_chest'), s = 0.8;
  const blockers = indexBlockers([{ x: anchor.x, z: anchor.z, r: chest.radius * s, bottom: 2, top: 2 + chest.maxY * s }]);
  // Keep a broad path from the pool to the chest clear of ambient trees.
  const reservations = [];
  for (let z = 6; z <= 11; z++) for (let x = 3; x <= 10; x++) reservations.push({ c: idx(x, z), layer: 0 });
  ctx.stats.fluids.push('small forest waterfall and pool');
  Object.assign(ctx.stats, { layers: 1, mode: 'waterfall forest', sites: 1 });
  return { seed: spec.seed, key: spec.key, depth: outside.depth, attempts: 1, K: 1, B: [0],
    cols: ctx.cols, floors, pieces: Array.from({ length: N * N }, () => []), runs: [], moves: [], ladders: [],
    falls: [{ c: idx(3, 4), d: 2, top: 6, bot: 3, type: WATER, layer: 0, width: 0.9 }],
    fences: new Map(), fenceList: [], stats: ctx.stats, portals: [], exit: null,
    gateKeys: [null, null, null, null], trialFaces: [null, null, null, null], trial: null, clues: [],
    safe: new Uint8Array(floors.length).fill(1), kind: 'meadow', archetype: 'plain', biome: 'darkforest',
    cave: false, walled: false, enemyFree: true, populationScale: 0, horde: null,
    staticBlockers: blockers, blockers, occluders: [], rewardSites: [site], siteReservations: reservations,
    sitePlacements: [{ name: 'treasure_chest', ...anchor, s, site: site.id }],
    siteFailures: [], spots: [], routes: [], doors: [door], waterfallRoom: true,
    roomOutside: { outside: outside.key, building: entry.building } };
}

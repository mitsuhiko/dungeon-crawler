// Authored town and roadside market clearings, not lucky terrain retries.
// All dry ground is level. Static colliders exist before asset downloads.
import { N, LH, WATER, DIRS, CHAR_R } from '../core/constants.js';
import { containsXZ, indexBlockers } from '../core/blockers.js';
import { createContext } from './context.js';
import { edgeCell } from './portals.js';
import { TOWN_LEVEL, townPlan, merchantCampPlan } from '../world/town.js';

export function generateClearing(spec) {
  const camp = !!spec.merchantCamp, side = spec.portals.filter(p => p.dir < 4);
  if (side.length !== (camp ? 2 : 1) || spec.portals.length !== side.length)
    throw new Error('Clearing has unexpected portals');
  const plan = (camp ? merchantCampPlan : townPlan)(spec.exit, spec.seed), ctx = createContext(spec.seed);
  const wet = new Set(plan.pond), floors = [];
  for (let c = 0; c < N * N; c++) {
    // (the pond: level with the ground round it, waded)
    const f = ctx.mk(c, wet.has(c) ? TOWN_LEVEL - 1 : TOWN_LEVEL, 0, 0);
    f.id = c; f.cs = Array(4).fill(f.top * LH); f.split = c % 2;
    if (wet.has(c)) { f.fluid = WATER; f.surf = TOWN_LEVEL; }
    ctx.cols[c].push(f); floors.push(f);
  }
  for (const f of floors) f.link = DIRS.map(([dx, dz]) => {
    const x = f.x + dx, z = f.z + dz;
    if (x < 0 || z < 0 || x >= N || z >= N) return null;
    const g = floors[z * N + x]; return g.fluid === f.fluid ? g : null;
  });
  const [sx, sz] = plan.spawn, sc = sz * N + sx;
  // Keep the exit first, as in ordinary generated cubes.
  side.sort((a, b) => (b.dir === spec.exit) - (a.dir === spec.exit));
  const portals = side.map((sp, i) => {
    const cells = [];
    for (let t = sp.pos - 1; t <= sp.pos + 1; t++) for (let j = 0; j < 2; j++) cells.push(edgeCell(sp.dir, t, j));
    const c = edgeCell(sp.dir, sp.pos, 0);
    return { id: i + 1, kind: 'side', dir: sp.dir, layer: 0, x: c % N,
      z: Math.floor(c / N), y: TOWN_LEVEL * LH, cells };
  });
  if (!camp) portals.push({ id: 2, kind: 'spawn', dir: -1, layer: 0, x: sx, z: sz, y: TOWN_LEVEL * LH,
    cells: Array.from({ length: 9 }, (_, i) => (sz + Math.floor(i / 3) - 1) * N + sx + i % 3 - 1) });
  for (const p of portals) {
    p.floor = floors[p.z * N + p.x];
    for (const c of p.cells) floors[c].prot = p.id;
  }
  const staticBlockers = indexBlockers(plan.colliders);
  const clearAt = (x, z) => !plan.colliders.some(b => containsXZ(b, x, z, CHAR_R + .03));
  const clear = f => !f.fluid && clearAt(f.x + .5, f.z + .5);
  // a body walking from f's centre to g's must pass between the props, not just stand on both
  const between = (f, g) => [.25, .5, .75].every(t => clearAt(f.x + .5 + (g.x - f.x) * t, f.z + .5 + (g.z - f.z) * t));
  // Flood-fill after buildings AND trunks; every gate and frontage must be walkable.
  const prev = new Map([[sc, null]]), queue = [sc];
  for (let i = 0; i < queue.length; i++) for (const g of floors[queue[i]].link)
    if (g && clear(g) && !prev.has(g.c) && between(floors[queue[i]], g)) { prev.set(g.c, queue[i]); queue.push(g.c); }
  if (!clear(floors[sc]) || portals.some(p => !prev.has(p.floor.c) || p.cells.some(c => !clear(floors[c]))))
    throw new Error('Clearing layout blocks spawn or a gate');
  const frontageCells = plan.frontages.map(p => Math.floor(p.z) * N + Math.floor(p.x));
  if (frontageCells.some(c => !prev.has(c))) throw new Error('Clearing layout blocks a building frontage');
  // a door's doorstep: the body fits in front of it, right up to its face
  for (const d of plan.doors) for (const t of [.25, .5, .75, 1])
    if (!clearAt(d.x + d.nx * (CHAR_R + .05 + t * .5), d.z + d.nz * (CHAR_R + .05 + t * .5)))
      throw new Error('Clearing layout blocks the door of ' + d.building);
  // the town portal's spot: dry, reachable and clear of every body
  const portal = plan.portal && { x: plan.portal.x, y: TOWN_LEVEL * LH, z: plan.portal.z };
  if (portal && (!prev.has(Math.floor(portal.z) * N + Math.floor(portal.x))
    || plan.colliders.some(b => containsXZ(b, portal.x, portal.z, 1.1)) || plan.pond.some(c => Math.hypot(c % N + .5 - portal.x, Math.floor(c / N) + .5 - portal.z) < 1.5)))
    throw new Error('Clearing layout blocks the town portal spot');
  // where the beginning's things lie (core/intro.js: the glass, the sword): dry, reachable and clear
  // of every body
  const relics = {};
  for (const [k, q] of Object.entries(plan.relics)) {
    const relic = relics[k] = { x: q.x, y: TOWN_LEVEL * LH, z: q.z };
    if (!prev.has(Math.floor(relic.z) * N + Math.floor(relic.x)) || plan.colliders.some(b => containsXZ(b, relic.x, relic.z, CHAR_R + .1)))
      throw new Error('Clearing layout blocks the ' + k);
  }
  const pathTo = goal => {
    const path = [];
    for (let c = goal; c !== null; c = prev.get(c)) path.unshift(floors[c]);
    return path;
  };
  const exitPath = pathTo(portals[0].floor.c);
  const mainPath = camp ? [...pathTo(portals[1].floor.c).reverse(), ...exitPath.slice(1)] : exitPath;
  const paths = [mainPath, ...frontageCells.map(pathTo)];
  const moves = paths.flatMap(path => path.slice(1).map((to, i) => ({ kind: 'walk', from: path[i], to,
    d: DIRS.findIndex(([dx, dz]) => path[i].x + dx === to.x && path[i].z + dz === to.z), cells: [], cost: 1 })));
  ctx.stats.layers = 1; ctx.stats.mode = camp ? 'merchant camp' : 'town'; ctx.stats.fluids = camp ? [] : ['town pond'];
  const clearing = { placements: plan.placements, frontages: plan.frontages, doors: plan.doors, pond: plan.pond, yaw: plan.yaw, paths: plan.paths,
    ...(portal ? { portal } : {}) };
  return { seed: spec.seed, attempts: 1, K: 1, B: [0], cols: ctx.cols, floors,
    pieces: Array.from({ length: N * N }, () => []), runs: [], falls: [], ladders: [],
    fences: new Map(), fenceList: [], stats: ctx.stats, moves, portals, exit: spec.exit,
    routeIndex: spec.routeIndex, route: spec.route, gateKeys: spec.gateKeys, trialFaces: spec.trialFaces || [null, null, null, null],
    safe: Uint8Array.from(floors, f => prev.has(f.c) ? 1 : 0),
    kind: 'meadow', archetype: 'plain', key: spec.key, depth: 0, cave: false, enemyFree: true, biome: 'meadow',
    staticBlockers, blockers: staticBlockers, occluders: plan.occluders, authoredProps: plan.placements, doors: plan.doors,
    villagers: plan.villagers, spots: [], relics,
    ...(camp ? { merchantCamp: clearing } : { town: clearing }),
    routes: paths.map(path => path.map(f => ({ x: f.x + .5, y: TOWN_LEVEL * LH + .12, z: f.z + .5 }))),
  };
}

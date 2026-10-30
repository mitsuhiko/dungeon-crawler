// The town's tiles (world/town.js, docs/town.md): authored, not lucky terrain retries.
// All dry ground is level. Static colliders exist before asset downloads.
import { N, LH, WATER, DIRS, CHAR_R } from '../core/constants.js';
import { containsXZ, indexBlockers } from '../core/blockers.js';
import { createContext } from './context.js';
import { edgeCell } from './portals.js';
import { TOWN_LEVEL, townPlan } from '../world/town.js';

export function generateClearing(spec) {
  const t = spec.town, side = spec.portals.filter(p => p.dir < 4);
  if (side.length !== (t.gate ? 1 : 0) || spec.portals.length !== side.length)
    throw new Error('Town tile has unexpected portals');
  const plan = townPlan(t.exit, spec.seed, t.i, t.j), ctx = createContext(spec.seed);
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
  const portals = side.map((sp, i) => {
    const cells = [];
    for (let t = sp.pos - 1; t <= sp.pos + 1; t++) for (let j = 0; j < 2; j++) cells.push(edgeCell(sp.dir, t, j));
    const c = edgeCell(sp.dir, sp.pos, 0);
    return { id: i + 1, kind: 'side', dir: sp.dir, layer: 0, x: c % N,
      z: Math.floor(c / N), y: TOWN_LEVEL * LH, cells };
  });
  if (plan.spawn) {
    const [sx, sz] = plan.spawn;
    portals.push({ id: portals.length + 1, kind: 'spawn', dir: -1, layer: 0, x: sx, z: sz, y: TOWN_LEVEL * LH,
      cells: Array.from({ length: 9 }, (_, i) => (sz + Math.floor(i / 3) - 1) * N + sx + i % 3 - 1) });
  }
  for (const p of portals) {
    p.floor = floors[p.z * N + p.x];
    for (const c of p.cells) floors[c].prot = p.id;
  }
  const staticBlockers = indexBlockers(plan.colliders);
  const clearAt = (x, z, m = CHAR_R + .08) => !plan.colliders.some(b => containsXZ(b, x, z, m));
  const clear = f => !f.fluid && clearAt(f.x + .5, f.z + .5);
  // a body walking from f's centre to g's must pass between the props, not just stand on both (with
  // a little room to spare: its rim's probes, physics/canmove.js)
  const between = (f, g) => [.2, .35, .5, .65, .8].every(t => clearAt(f.x + .5 + (g.x - f.x) * t, f.z + .5 + (g.z - f.z) * t, CHAR_R + .12));
  // The cells along the seams (the sides with another tile beyond) are where the town goes on: all
  // of them must be walkable and reached from each other, so every tile joins its neighbours
  // wherever one crosses (docs/town.md). The flood fill starts on one of them (or the spawn).
  const seams = t.seams || [false, false, false, false], edge = [];
  for (let d = 0; d < 4; d++) if (seams[d]) for (let i = 0; i < N; i++) edge.push(edgeCell(d, i, 0));
  const start = plan.spawn ? plan.spawn[1] * N + plan.spawn[0] : edge[0] ?? portals[0]?.floor.c;
  if (start === undefined) throw new Error('A town tile with no way in');
  // Flood-fill after buildings AND trunks; every gate, seam and frontage must be walkable.
  const prev = new Map([[start, null]]), queue = [start];
  for (let i = 0; i < queue.length; i++) for (const g of floors[queue[i]].link)
    if (g && clear(g) && !prev.has(g.c) && between(floors[queue[i]], g)) { prev.set(g.c, queue[i]); queue.push(g.c); }
  if (!clear(floors[start]) || portals.some(p => !prev.has(p.floor.c) || p.cells.some(c => !clear(floors[c]))))
    throw new Error('Town tile blocks its spawn or its gate');
  if (edge.some(c => !prev.has(c))) throw new Error('Town tile blocks a seam');
  const frontageCells = plan.frontages.map(p => Math.floor(p.z) * N + Math.floor(p.x));
  if (frontageCells.some(c => !prev.has(c))) throw new Error('Town tile blocks a building frontage');
  // a door's doorstep: the body fits in front of it, right up to its face
  for (const d of plan.doors) for (const t of [.25, .5, .75, 1])
    if (!clearAt(d.x + d.nx * (CHAR_R + .05 + t * .5), d.z + d.nz * (CHAR_R + .05 + t * .5)))
      throw new Error('Town tile blocks the door of ' + d.building);
  // the town portal's spot: dry, reachable and clear of every body
  const portal = plan.portal && { x: plan.portal.x, y: TOWN_LEVEL * LH, z: plan.portal.z };
  if (portal && (!prev.has(Math.floor(portal.z) * N + Math.floor(portal.x))
    || plan.colliders.some(b => containsXZ(b, portal.x, portal.z, 1.1)) || plan.pond.some(c => Math.hypot(c % N + .5 - portal.x, Math.floor(c / N) + .5 - portal.z) < 1.5)))
    throw new Error('Town tile blocks the town portal spot');
  // where the beginning's things lie (core/intro.js: the crash, the robot, the sword): dry,
  // reachable and clear of every body
  const relics = {};
  for (const [k, q] of Object.entries(plan.relics)) {
    const relic = relics[k] = { x: q.x, y: TOWN_LEVEL * LH, z: q.z };
    if (!prev.has(Math.floor(relic.z) * N + Math.floor(relic.x)) || plan.colliders.some(b => containsXZ(b, relic.x, relic.z, CHAR_R + .1)))
      throw new Error('Town tile blocks the ' + k);
  }
  const pathTo = goal => {
    const path = [];
    for (let c = goal; c !== null; c = prev.get(c)) path.unshift(floors[c]);
    return path;
  };
  // the walks the test bots take: from where the fill began to the gate, each frontage and each
  // seam's middle
  const ends = [...portals.filter(p => p.kind === 'side').map(p => p.floor.c), ...frontageCells,
    ...[0, 1, 2, 3].filter(d => seams[d]).map(d => edgeCell(d, N / 2, 0))];
  const paths = ends.map(pathTo);
  const moves = paths.flatMap(path => path.slice(1).map((to, i) => ({ kind: 'walk', from: path[i], to,
    d: DIRS.findIndex(([dx, dz]) => path[i].x + dx === to.x && path[i].z + dz === to.z), cells: [], cost: 1 })));
  ctx.stats.layers = 1; ctx.stats.mode = 'town ' + plan.tile.name; ctx.stats.fluids = plan.pond.length ? ['town pond'] : [];
  const clearing = { placements: plan.placements, frontages: plan.frontages, doors: plan.doors, pond: plan.pond, yaw: plan.yaw, paths: plan.paths,
    tile: plan.tile, ...(portal ? { portal } : {}) };
  return { seed: spec.seed, attempts: 1, K: 1, B: [0], cols: ctx.cols, floors,
    pieces: Array.from({ length: N * N }, () => []), runs: [], falls: [], ladders: [],
    fences: new Map(), fenceList: [], stats: ctx.stats, moves, portals, exit: spec.exit,
    routeIndex: spec.routeIndex, route: spec.route, gateKeys: spec.gateKeys, trialFaces: spec.trialFaces || [null, null, null, null],
    safe: Uint8Array.from(floors, f => prev.has(f.c) ? 1 : 0),
    kind: 'meadow', archetype: 'plain', key: spec.key, depth: 0, cave: false, enemyFree: true, biome: 'meadow',
    staticBlockers, blockers: staticBlockers, occluders: plan.occluders, authoredProps: plan.placements, doors: plan.doors,
    villagers: plan.villagers, spots: [], relics, town: clearing,
    // the sides (DIRS) with another of the town's tiles beyond: walked across without a seam
    // (game/handover.js; the physics reads the ground on as this tile's edge, physics/collide.js)
    seams: [...seams],
    routes: paths.map(path => path.map(f => ({ x: f.x + .5, y: TOWN_LEVEL * LH + .12, z: f.z + .5 }))),
  };
}

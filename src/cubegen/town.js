// The town's tiles (world/town.js, docs/town.md): authored, not lucky terrain retries. The ground
// is the town's land (world/townland.js), each tile built from it as the generator builds a cube's
// (world/town.js tileGround: a level per cell, slopes and cliffs, the river, its stairs, bridges and
// span, its falls). Static colliders exist before asset downloads.
import { N, LH, WATER, DIRS, CHAR_R } from '../core/constants.js';
import { containsXZ, indexBlockers } from '../core/blockers.js';
import { floorY } from '../core/surfaces.js';
import { edgeCell } from './portals.js';
import { runRails } from './fences.js';
import { mudPocket } from './mudpools.js';
import { townPlan, townReach, DRAPES } from '../world/town.js';
import { cutCliffs } from './cuts.js';
import { cutLine } from '../core/cuts.js';
import { propMetadata } from '../core/propcatalog.js';
import { mulberry32, hash32 } from '../core/util.js';

// does (x, z) lie within r of a cut's part (core/cuts.js) in a cell round it?
function nearCut(cols, x, z, r) {
  for (let cz = Math.floor(z - r); cz <= Math.floor(z + r); cz++) for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
    const f = cx >= 0 && cz >= 0 && cx < N && cz < N && cols[cz * N + cx].at(-1);
    if (!f?.cut) continue;
    const lx = Math.min(1, Math.max(0, x - cx)), lz = Math.min(1, Math.max(0, z - cz));
    if (f.cut.c - f.cut.n[0] * lx - f.cut.n[1] * lz < r - Math.hypot(x - cx - lx, z - cz - lz)) return true;
  }
  return false;
}
// the drapes along the cuts' lines, off their higher sides' edges, as often as along a cell's side
// (world/town.js drapes)
function drapesAlong(floors, seed) {
  const R = mulberry32(hash32(seed ^ 0xd4a9e)), out = [];
  for (const f of floors) if (f.cut) for (const s of cutLine(f)) {
    const hiOwn = s.own[0] + s.own[1] > s.part[0] + s.part[1], high = hiOwn ? f : f.cut.part, low = hiOwn ? f.cut.part : f;
    const len = Math.hypot(s.q[0] - s.p[0], s.q[1] - s.p[1]), t = .25 + R() * .5;
    const at = ys => ys[0] + (ys[1] - ys[0]) * t, top = at(hiOwn ? s.own : s.part), below = low.fluid ? low.surf * LH : at(hiOwn ? s.part : s.own);
    if (high.fluid || top - below < .55 || R() > .45 * len) continue;
    const out2 = hiOwn ? f.cut.n : [-f.cut.n[0], -f.cut.n[1]];
    out.push({ name: DRAPES[Math.floor(R() * DRAPES.length)], x: f.x + s.p[0] + (s.q[0] - s.p[0]) * t, y: top, z: f.z + s.p[1] + (s.q[1] - s.p[1]) * t,
      yaw: Math.atan2(-out2[0], -out2[1]), s: .85 + R() * .3, tint: null });
  }
  return out;
}

export function generateClearing(spec) {
  const t = spec.town, side = spec.portals.filter(p => p.dir < 4);
  if (side.length !== (t.gate ? 1 : 0) || spec.portals.length !== side.length)
    throw new Error('Town tile has unexpected portals');
  const plan = townPlan(t.exit, spec.seed, t.i, t.j, t.world), ground = plan.ground, ctx = ground.ctx, floors = ctx.floors;
  const portals = side.map((sp, i) => {
    const cells = [];
    for (let t = sp.pos - 1; t <= sp.pos + 1; t++) for (let j = 0; j < 2; j++) cells.push(edgeCell(sp.dir, t, j));
    const c = edgeCell(sp.dir, sp.pos, 0);
    return { id: i + 1, kind: 'side', dir: sp.dir, layer: 0, x: c % N,
      z: Math.floor(c / N), y: plan.level * LH, cells };
  });
  if (plan.spawn) {
    const [sx, sz] = plan.spawn;
    portals.push({ id: portals.length + 1, kind: 'spawn', dir: -1, layer: 0, x: sx, z: sz, y: plan.level * LH,
      cells: Array.from({ length: 9 }, (_, i) => (sz + Math.floor(i / 3) - 1) * N + sx + i % 3 - 1) });
  }
  for (const p of portals) {
    p.floor = floors[p.z * N + p.x];
    for (const c of p.cells) floors[c].prot = p.id;
  }
  const staticBlockers = indexBlockers(plan.colliders);
  const clearAt = (x, z, m = CHAR_R + .08) => !plan.colliders.some(b => containsXZ(b, x, z, m));
  // (shallow water is waded through, a level deep; deep water is swum, not walked)
  const shallow = f => !f.fluid || f.surf - f.top <= 1;
  const clear = f => shallow(f) && clearAt(f.x + .5, f.z + .5);
  // a body walking from f's centre to g's must pass between the props, not just stand on both (with
  // a little room to spare: its rim's probes, physics/canmove.js)
  const between = (f, g) => [.2, .35, .5, .65, .8].every(t => clearAt(f.x + .5 + (g.x - f.x) * t, f.z + .5 + (g.z - f.z) * t, CHAR_R + .12));
  // The cells along the seams (the sides with another tile beyond) are where the town goes on: all of
  // them must be walkable. The town's land sees to it that all its ground is walked to from the gate
  // (world/townland.js: over the seams, up its slopes and stairs, over its bridges and the span),
  // so here a tile's frontages, gate, spawn and the rest must be reached from where the town goes on
  // into it (or from the spawn).
  // (but where the seam runs on outside the town's wall: nobody walks there, world/townland.js)
  const seams = t.seams || [false, false, false, false], edge = [];
  for (let d = 0; d < 4; d++) if (seams[d]) for (let i = 0; i < N; i++) if (!plan.wallSide[edgeCell(d, i, 0)]) edge.push(edgeCell(d, i, 0));
  // (where it goes on through deep water, it is swum: begun from where it is walked)
  const sources = [...edge, ...plan.spawn ? [plan.spawn[1] * N + plan.spawn[0]] : []], start = sources.find(c => clear(floors[c])) ?? portals[0]?.floor.c;
  if (start === undefined) throw new Error('A town tile with no way in');
  // Flood-fill after buildings AND trunks (world/town.js townReach: over the ground, through the
  // water, in and out of it over a bank a level over it at most); every gate, seam and frontage must
  // be walkable.
  const prev = townReach(ground, staticBlockers, sources.length ? sources : [start]);
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
  const portal = plan.portal && { x: plan.portal.x, y: plan.level * LH, z: plan.portal.z };
  if (portal && (!prev.has(Math.floor(portal.z) * N + Math.floor(portal.x))
    || plan.colliders.some(b => containsXZ(b, portal.x, portal.z, 1.1)) || plan.water.some(c => Math.hypot(c % N + .5 - portal.x, Math.floor(c / N) + .5 - portal.z) < 1.5)))
    throw new Error('Town tile blocks the town portal spot');
  // where the beginning's things lie (core/intro.js: the crash, the robot, the sword): dry,
  // reachable and clear of every body
  const relics = {};
  for (const [k, q] of Object.entries(plan.relics)) {
    const relic = relics[k] = { x: q.x, y: plan.level * LH, z: q.z };
    if (!prev.has(Math.floor(relic.z) * N + Math.floor(relic.x)) || plan.colliders.some(b => containsXZ(b, relic.x, relic.z, CHAR_R + .1)))
      throw new Error('Town tile blocks the ' + k);
  }
  // (the test bots' walks keep out of the water where they can: they do not wade)
  const dry = townReach(ground, staticBlockers, sources.length ? sources : [start], { dry: true });
  const pathTo = goal => {
    const path = [], by = dry.has(goal) ? dry : prev;
    for (let c = goal; c !== null; c = by.get(c)) path.unshift(floors[c]);
    return path;
  };
  // the walks the test bots take: from where the fill began to the gate, each frontage and each
  // seam's middle
  const ends = [...portals.filter(p => p.kind === 'side').map(p => p.floor.c), ...frontageCells,
    ...[0, 1, 2, 3].filter(d => seams[d]).map(d => edgeCell(d, N / 2, 0))];
  const paths = ends.map(pathTo);
  const moves = paths.flatMap(path => path.slice(1).map((to, i) => ({ kind: 'walk', from: path[i], to,
    d: DIRS.findIndex(([dx, dz]) => path[i].x + dx === to.x && path[i].z + dz === to.z), cells: [], cost: 1 })));
  // the stairs', bridges' and the span's invisible side rails (cubegen/fences.js): kept on them
  // as in a cube, off their sides with the jump key only
  const { fences, fenceList } = runRails(ctx.runs);
  // its cliffs and shores cut at an angle (cubegen/cuts.js), as a cube's: what stands keeps its
  // cells square (what blocks, the water's mill and wheel, the mud's pockets), a small thing that
  // would stand across a line, or hang off an edge that is no more, is left out (but what hangs
  // on a line between two things: it stays up there)
  const kept = new Set();
  const cover = (x, z, r) => { for (let cz = Math.floor(z - r); cz <= Math.floor(z + r); cz++) for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) if (cx >= 0 && cz >= 0 && cx < N && cz < N) kept.add(cz * N + cx); };
  const stays = p => p.name.startsWith('town_water') || p.name.startsWith('villager_') || propMetadata.get(p.name)?.attach === 'line';
  for (const p of plan.placements) if (stays(p)) cover(p.x, p.z, (propMetadata.get(p.name)?.radius ?? 0.3) * (p.s ?? 1));
  for (const p of plan.mud) cover(p.x, p.z, p.r + 0.5);
  const at = { ...ctx, cols: ctx.cols, floors, fences, fenceList, falls: plan.falls, moves: [], ladders: [],
    noCut: [...kept, ...staticBlockers.flatMap((list, c) => list.length ? [c] : [])] };
  cutCliffs(at);
  const placements = plan.placements.filter(p => stays(p) || !nearCut(ctx.cols, p.x, p.z, 0.3));
  const lineDrapes = drapesAlong(floors, spec.seed);
  placements.push(...lineDrapes);
  ctx.stats.layers = 1; ctx.stats.mode = 'town ' + plan.tile.name; ctx.stats.fluids = plan.water.length ? ['town water'] : [];
  const clearing = { placements, frontages: plan.frontages, doors: plan.doors, water: plan.water, yaw: plan.yaw, paths: plan.paths,
    tile: plan.tile, level: plan.level, wallSide: plan.wallSide, ...(portal ? { portal } : {}) };
  return { seed: spec.seed, attempts: 1, K: 1, B: [0], cols: ctx.cols, floors,
    pieces: ctx.pieces, runs: ctx.runs, falls: plan.falls.map(f => ({ ...f, type: WATER, layer: 0 })), ladders: [],
    // the pockets of mud on the hollow's floor (world/town.js dell, game/muddy.js)
    // (at the ground's height where it lies: the cell may slope further off)
    mudPockets: plan.mud.map(p => {
      const f = ctx.cols[Math.floor(p.z) * N + Math.floor(p.x)][0];
      return { ...mudPocket(f, p.x, p.z, p.r, p.deep), y: floorY(f, p.x - f.x, p.z - f.z) };
    }),
    fences, fenceList: at.fenceList, lineFences: at.lineFences ?? null, stats: ctx.stats, moves, portals, exit: spec.exit,
    routeIndex: spec.routeIndex, route: spec.route, gateKeys: spec.gateKeys,
    safe: Uint8Array.from(floors, f => prev.has(f.c) ? 1 : 0),
    kind: 'meadow', archetype: 'plain', key: spec.key, depth: 0, cave: false, enemyFree: true, biome: 'meadow',
    staticBlockers, blockers: staticBlockers, occluders: plan.occluders, authoredProps: placements, doors: plan.doors,
    villagers: plan.villagers, spots: [], relics, town: clearing,
    // the sides (DIRS) with another of the town's tiles beyond: walked across without a seam
    // (game/handover.js; the physics reads the ground on as this tile's edge, physics/collide.js)
    seams: [...seams],
    routes: paths.map(path => path.map(f => ({ x: f.x + .5, y: floorY(f, .5, .5) + .12, z: f.z + .5 }))),
  };
}

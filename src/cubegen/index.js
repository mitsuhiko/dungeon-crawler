// Cube generator: turns one cube's spec into its map. Runs the stages in order and retries with a new seed on failure.
import { N, LH, DIRS, CHAR_R } from '../core/constants.js';
import { hash32 } from '../core/util.js';
import { floorY, runY } from '../core/surfaces.js';
import { createContext } from './context.js';
import { chooseLayers, groundHeights } from './ground.js';
import { placePortals } from './portals.js';
import { shapeCube } from './archetypes.js';
import { ladderInfo, ladderStyle } from './climbs.js';
import { carveRiver } from './river.js';
import { buildSlabs } from './slabs.js';
import { addRamps, addSupports } from './supports.js';
import { addPools } from './pools.js';
import { muddyWater } from './mudpools.js';
import { addStreams } from './streams.js';
import { cascadeGround, cascadeFalls } from './cascades.js';
import { spoutGround, spoutWater } from './spouts.js';
import { containFluids } from './contain.js';
import { carveGrotto, finishGrotto } from './grotto.js';
import { makeMoves } from './moves.js';
import { findRoute, finishRoute } from './route.js';
import { addAccess, addEscapes, addWaterEscapes, shoalWater, shoreWater } from './escape.js';
import { reachTo, reachFrom, stuckInWater, isCramped } from './reach.js';
import { placeStructures } from './place.js';
import { smooth } from './smooth.js';
import { shapeStructures } from './shape.js';
import { addFences, openTraps } from './fences.js';
import { generateClearing } from './town.js';
import { generateGuardian } from './guardian.js';
import { reserveSites, prepareSites, routeSites, finishSites } from './sites.js';
import { reserveHorde, routeHorde, finishHorde } from './hordes.js';
import { placeSpots, finishSpots } from './spots.js';
import { placeVignettes, finishVignettes, indexBox } from './vignettes.js';
import { spanBridge } from './span.js';
import { descentRoute, pinnacleRoute } from './heights.js';
import { areaRoute } from './areas.js';
import { setPieceRoute } from './setpieces.js';
import { routeTrial, finishTrial, trialCosts, placeClues } from './trials/index.js';

function indexFloors(ctx) {
  const floors = ctx.floors = [];
  for (const col of ctx.cols) {
    col.sort((a, b) => a.top - b.top);
    for (const f of col) { f.id = floors.length; floors.push(f); }
  }
  for (const p of ctx.portals) p.floor = ctx.cols[p.c].find(f => f.prot === p.id);
  ctx.portalFloors = ctx.portals.map(p => p.floor);
}

// polyline along route moves (debug overlay, test bots)
export function pathPoints(ctx, moves) {
  const center = (c, y) => ({ x: c % N + 0.5, y: y + 0.12, z: ((c / N) | 0) + 0.5 });
  const nodeY = n => n.landing ? n.top * LH : floorY(n, 0.5, 0.5);
  if (!ctx.portalFloors.length) return [];
  const start = moves.length ? moves[0].from : ctx.portalFloors[0];
  const pts = [center(start.c, nodeY(start))];
  for (const m of moves) {
    if (m.cells.length) {
      const run = ctx.runs.find(r => r.from === m.from && r.to === m.to), back = ctx.runs.find(r => r.from === m.to && r.to === m.from);
      const pieces = run ? run.pieces : [...back.pieces].reverse();   // a structure used the other way round
      for (const p of pieces) pts.push(center(p.c, runY(p, 0.5, 0.5)));
    }
    // jumps: a waypoint at the take-off edge (bots jump there)
    if (m.kind === 'jump') { const c = center(m.from.c, nodeY(m.from)); pts.push({ x: c.x + DIRS[m.d][0] * 0.42, y: c.y, z: c.z + DIRS[m.d][1] * 0.42, takeoff: true }); }
    pts.push(center(m.to.c, nodeY(m.to)));
  }
  return pts;
}

// learn: world.html#assembly #generate-code (see learn/README.md)
function tryGenerate(seed, spec) {
  const ctx = createContext(seed);
  ctx.spec = spec;
  chooseLayers(ctx);
  groundHeights(ctx);
  shapeCube(ctx);
  placePortals(ctx);
  carveRiver(ctx);
  cascadeGround(ctx);
  spoutGround(ctx);
  reserveSites(ctx);
  if (!reserveHorde(ctx)) return null;
  buildSlabs(ctx);
  prepareSites(ctx);
  addRamps(ctx);
  addSupports(ctx);
  addPools(ctx);
  addStreams(ctx);
  cascadeFalls(ctx);
  spoutWater(ctx);
  containFluids(ctx);
  if (spec.grotto !== false) carveGrotto(ctx);   // a hidden cave behind a tall waterfall, now and then (cubegen/grotto.js)
  shoreWater(ctx);   // (water is walked into and out of: shores level with it)
  shoalWater(ctx);   // (most water is waded: deep only away from its banks)
  indexFloors(ctx);
  if (ctx.portalFloors.some(f => !f)) return null;
  makeMoves(ctx);
  spanBridge(ctx);
  descentRoute(ctx);
  pinnacleRoute(ctx);
  areaRoute(ctx);
  setPieceRoute(ctx);
  trialCosts(ctx);
  if (!findRoute(ctx)) return null;
  routeSites(ctx);
  if (!routeTrial(ctx)) return null;   // the way to a trial's goal (cubegen/trials/)
  if (!routeHorde(ctx)) return null;
  placeSpots(ctx);
  placeVignettes(ctx);   // a theme's little set pieces (cubegen/vignettes.js), off the ways just found
  addAccess(ctx);
  addEscapes(ctx);
  // ladders out of water with no way out, and the ways on from where they come up
  if (addWaterEscapes(ctx)) addEscapes(ctx);
  finishRoute(ctx);
  if (!placeStructures(ctx)) return null;
  smooth(ctx);
  shapeStructures(ctx);
  addFences(ctx);
  openTraps(ctx);
  // every portal must lead to the exit with the final slopes and fences
  const safe = reachTo(ctx, ctx.hub, true);
  if (safe && ctx.portalFloors.some(f => !safe.has(f.id))) return null;
  // and nobody who can get into a water is stuck in it (they swim: a bank or a ladder out of it)
  const stuck = spec.trial ? new Set() : stuckInWater(ctx, true);
  if (stuck.size && [...reachFrom(ctx, ctx.portalFloors, true)].some(id => stuck.has(id))) return null;
  if (ctx.moves.some(m => isCramped(ctx, m.from) || isCramped(ctx, m.to))) return null;   // a route squeezes under a slab
  const trial = finishTrial(ctx, pathPoints);   // a trial room's goal, parts and checks (cubegen/trials/)
  if (!trial) return null;
  const clues = placeClues(ctx, safe);   // rune rooms' tablets, in a room before them
  const sites = finishSites(ctx), vignettes = finishVignettes(ctx);
  const grotto = finishGrotto(ctx, safe, sites);   // its chest, beside the planned sites
  const firstGlass = spec.firstGlass ? firstGlassOf(ctx, sites) : null;
  if (spec.firstGlass && !firstGlass) return null;   // (his glass must stand on the rock, up its ladder)
  sites.sitePlacements.push(...vignettes.placements);
  for (const b of vignettes.blockers) indexBox(sites.staticBlockers, b);
  sites.occluders.push(...vignettes.occluders);
  sites.siteReservations.push(...vignettes.reservations);
  const horde = finishHorde(ctx, sites.staticBlockers);
  if (horde === null) return null;
  // the spots (cubegen/spots.js): kept like the reward sites (no props on them, the camp's fire
  // among the site placements); one that failed is tried again for like a site
  const spots = finishSpots(ctx);
  sites.sitePlacements.push(...spots.spotPlacements);
  for (const b of spots.spotBlockers) {   // an outpost's cart: in every cell the character could touch it from
    for (let z = Math.max(0, Math.floor(b.z - b.r - CHAR_R)); z <= Math.min(N - 1, Math.floor(b.z + b.r + CHAR_R)); z++)
      for (let x = Math.max(0, Math.floor(b.x - b.r - CHAR_R)); x <= Math.min(N - 1, Math.floor(b.x + b.r + CHAR_R)); x++) sites.staticBlockers[z * N + x].push(b);
  }
  sites.siteReservations.push(...spots.spots.flatMap(s => s.cells.map(c => ({ c, layer: s.layer }))));
  sites.siteFailures.push(...spots.spotFailures);
  sites.siteReservations.push(...trial.reservations || [], ...clues.reservations);   // (no props on a trial's own ground, nor the tablet's)
  // some pools are mud, with pockets of it round them (cubegen/mudpools.js; on their own random stream)
  const mudPockets = muddyWater(ctx, new Set(sites.siteReservations.map(r => r.c)));
  sites.siteReservations.push(...mudPockets.map(p => ({ c: p.c, layer: p.layer })));   // (no props in them)
  const { K, B, cols, floors, pieces, runs, falls, fences, fenceList, stats, moves } = ctx;
  const portals = ctx.portals.map(p => ({ id: p.id, kind: p.kind, dir: p.dir, layer: p.layer, cells: p.cells,
    x: p.c % N, z: (p.c / N) | 0, y: p.level * LH, floor: p.floor }));
  return {
    seed, K, B, cols, floors, pieces, runs, falls, fences, fenceList, stats, moves, portals, ...sites, horde, spots: spots.spots,
    vignettes: vignettes.list,   // the theme's little set pieces (cubegen/vignettes.js): [{ name, x, y, z, yaw }]
    mudPockets,   // pockets of mud on the ground round a mud pool (cubegen/mudpools.js): [{ x, z, y, r, vol }]
    roomRole: spec.roomRole, biome: spec.biome, populationScale: spec.populationScale, annexRoom: !!spec.annexRoom,
    trialRoom: !!spec.trial, trialFaces: spec.trialFaces || [null, null, null, null],   // (world/trials.js)
    trial: trial.trial,   // what the trial is built of (cubegen/trials/)
    clues: clues.clues,   // rune rooms' tablets: [{ key (the trial's room), x, y, z, glyphs (in order) }]
    ladders: ctx.ladders.map(l => ladderInfo(l, ladderStyle(spec, l))), exit: spec.exit,
    routeIndex: spec.routeIndex, route: spec.route, gateKeys: spec.gateKeys,
    safe: Uint8Array.from(floors, f => !safe || safe.has(f.id) ? 1 : 0),   // floors that lead to the exit
    kind: spec.kind, archetype: spec.archetype, key: spec.key, depth: spec.depth, cave: !!spec.cave, walled: !!spec.walled, enemyFree: !!spec.enemyFree,
    // the faces (+x, -x, +z, -z) with a rock wall along them (world/profile.js caveWall): a walled
    // trial room's under the sky and its neighbours' halves of them come down in the cutaway too
    walls: spec.faces.map(f => !!f.wall?.some(h => h > 0)),
    // the big height pieces (cubegen/heights.js, tunnel.js): a great shaft's hole
    tunnel: ctx.tunnel || null, shaft: spec.height?.hole ? { ...spec.height.hole } : null,
    // a large area (world/areas.js): its cubes
    area: spec.area ? { id: spec.area.id, kind: spec.area.kind, role: spec.area.role, keys: spec.area.keys } : null,
    sparse: !!spec.sparse,   // a mostly empty set piece (cubegen/setpieces.js): few props
    grotto,   // the hidden cave behind a waterfall (cubegen/grotto.js): { fall, cells, site, front }, else null
    firstGlass,   // the beginning's third room (core/intro.js): { glass, ladder, foot }, else null
    routes: ctx.segments.map(s => pathPoints(ctx, s)),   // each portal -> the exit, then the way back
  };
}

// The beginning's third room (world/layout.js firstGlass, core/intro.js): its lone peak's site holds
// the glassmaker's first glass, not a chest. Out of the reward sites into { glass: where it floats
// over, approach: where one walks up to it from, ladder: the foot of the ladder up the rock (its
// wall `d`, and the rock's top) }; null
// where the site or its ladder did not come (the cube is made again).
function firstGlassOf(ctx, sites) {
  const i = sites.rewardSites.findIndex(s => s.spawn === 'glass');
  const l = ctx.ladders.find(l => ctx.peakTop.has(l.hi.c));
  if (i < 0 || !l) return null;
  const [site] = sites.rewardSites.splice(i, 1), a = site.anchor;
  return { site: site.id, glass: { x: a.x, y: a.y, z: a.z }, approach: site.approach,
    ladder: { x: l.lo.x + 0.5, y: l.lo.top * LH, z: l.lo.z + 0.5, d: l.d, top: l.hi.top * LH } };
}

// spec: what the world fixes for this cube (faces, portals, layers; see world/world.js)
// learn: architecture.html#cube-journey #cube-map, world.html#generate-code #inspector (see learn/README.md)
export function generate(spec) {
  if (spec.town) return generateClearing(spec);
  if (spec.guardian) return generateGuardian(spec);
  let best = null;
  for (let a = 0; a < 200; a++) {
    const m = tryGenerate(hash32(spec.seed + a * 7919), spec);
    if (m) {
      m.seed = spec.seed; m.attempts = a + 1;
      if (!m.siteFailures.length) return m;
      if (!best || m.rewardSites.length + m.spots.length > best.rewardSites.length + best.spots.length) best = m;
    }
    // Optional destinations cannot make an otherwise valid cube fail indefinitely.
    if (best && a >= 23) { best.siteAttempts = a + 1; return best; }
  }
  if (best) return best;
  throw new Error('generator failed for cube ' + spec.key);
}

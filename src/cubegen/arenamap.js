// What every guardian arena's map is made of, whoever built its floors: the arenas drawn from a
// shape (cubegen/guardian.js) and the arenas of their own a boss brings (cubegen/towerarena.js,
// cubegen/fliparena.js; docs/bosses.md "An arena of its own"). One place, so a new arena cannot
// leave out what the rest of the game reads off a map (its theme's stamp `biome` above all: its
// colours, props, music and footsteps follow from it, themes/depth.js themeOf).
import { N, DIRS } from '../core/constants.js';
import { floorY } from '../core/surfaces.js';
import { indexBlockers } from '../core/blockers.js';

// the floors reached on foot from `start` (but those on the cells `blocked`): floor -> the floor
// it was reached from (start -> null)
export function reachFrom(start, blocked = null) {
  const prev = new Map([[start, null]]), queue = [start];
  for (let i = 0; i < queue.length; i++) for (const g of queue[i].link)
    if (g && !prev.has(g) && !blocked?.has(g.c)) { prev.set(g, queue[i]); queue.push(g); }
  return prev;
}

// The map of a guardian arena. spec: the cube's; ctx: its context (cubegen/context.js); role:
// 'descent' or 'side'; cols, floors; portals: [the entrance, the way on] (the core's last arena:
// the entrance alone, its route ends at the boss); exit; guardian; reached: reachFrom(the
// entrance's floor, what blocks), which must reach the way on; arena: { type,
// requested }; tide: standing water or lava (game/tide.js); fences, fenceList; placements: the
// arena's props (arenaPlacements); blockers: the colliders of those that block; walled; more:
// whatever else the arena has (Flip's `flip`, Foggery's `tower` and `movers`).
export function finishArena({ spec, ctx, role, cols, floors, portals, exit, guardian, reached, arena, tide = null,
  fences = new Map(), fenceList = [], placements = [], blockers = [], walled = !!spec.walled, more = {} }) {
  // the way from the entrance to the way on (or the boss), walked
  const path = [];
  for (let f = portals[1]?.floor ?? guardian.floor; f; f = reached.get(f)) path.unshift(f);
  const moves = path.slice(1).map((to, i) => ({ kind: 'walk', from: path[i], to, cells: [], cost: 1,
    d: DIRS.findIndex(([x, z]) => path[i].x + x === to.x && path[i].z + z === to.z) }));
  const staticBlockers = indexBlockers(blockers);
  return { seed: spec.seed, attempts: 1, K: 1, B: [0], cols, floors,
    pieces: Array.from({ length: N * N }, () => []), runs: [], falls: [], ladders: [],
    fences, fenceList, stats: ctx.stats, moves, portals, exit, guardian, arena, tide, ...more,
    routeIndex: spec.routeIndex, route: spec.route, gateKeys: spec.gateKeys, trialFaces: spec.trialFaces || [null, null, null, null],
    safe: Uint8Array.from(floors, f => reached.has(f) ? 1 : 0),
    kind: spec.kind, archetype: 'arena', roomRole: `${role}-guardian`, biome: spec.biome,
    key: spec.key, depth: spec.depth, cave: !!spec.cave, walled, enemyFree: false,
    rewardSites: [], siteFailures: [], sitePlacements: [], siteReservations: [], spots: [],
    arenaPlacements: placements, staticBlockers, blockers: staticBlockers,
    routes: [path, [...path].reverse()].map(p => p.map(f => ({ x: f.x + .5, y: floorY(f, .5, .5) + .12, z: f.z + .5 }))),
  };
}

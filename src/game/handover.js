// Walking from one of the town's tiles into the next (docs/town.md, world/town.js): no portal, no
// slide, no glass. The town's tiles are ordinary cubes; only the one the hero is in is played and
// drawn in full (the others are its surroundings, render/neighbors.js). Its seams (map.seams: the
// sides with another tile beyond) are walked across: the physics reads the ground past a seam as the
// edge's (physics/collide.js cellAt), and once the hero's middle is PAST a seam the tile beyond takes
// over at once (handOver): it becomes the cube played in, and everything in the world's coordinates
// moves by a cube's width, so nothing on the screen jumps.
import { N, DIRS, STEP } from '../core/constants.js';
import { step } from '../world/coords.js';
import { portalsOnly } from '../core/boundaries.js';
import { disposeWorld } from '../render/world.js';
import { setGlassShut } from '../render/glass.js';
import { shiftParticles } from '../render/particles.js';
import { shiftFloatText } from '../render/floattext.js';
import { shiftHeroFeet } from '../render/animator.js';
import { groundAt } from '../physics/collide.js';
import { player, state } from './state.js';
import { beginVisit, visitedNeighbors, prefetchTown, buildCube } from './flow.js';
import { showNeighbors } from '../render/neighbors.js';
import { enterTrial } from './trials.js';
import { resetEnemies } from './enemies.js';
import { clearOrder } from './orders.js';
import { showStats } from './hud.js';

// how far (cells) the hero's middle goes past a seam before the tile beyond takes over: back the
// other way it is as far again, so walking along a seam does not hand over and back every step
export const PAST = 0.25;

// how far the body's middle is past side d of the cube (negative: inside)
const past = (p, d) => [p.x - N, -p.x, p.z - N, -p.z][d];

// game/portals.js, every step of play: past a seam, the tile beyond takes over. true if it did.
export function checkHandover() {
  const m = state.map;
  if (!m?.seams || state.transitioning || !state.cubes) return false;
  for (let d = 0; d < 4; d++) {
    if (!m.seams[d] || past(player, d) <= PAST) continue;
    // (made and loaded ahead: game/flow.js prefetchTown; until then the hero stands on the seam)
    const c = state.cubes.cubes.get(step(state.cubeKey, d));
    if (!c?.ready) { prefetchTown(); return false; }
    handOver(c, d);
    return true;
  }
  return false;
}

function handOver(c, d) {
  const [dx, dz] = DIRS[d], sx = -dx * N, sz = -dz * N, k = c.key;
  const old = state.world;
  // what is drawn where it is in the world moves along: the hero (and where they stood safely),
  // what is in the air, the planted feet
  player.x += sx; player.z += sz;
  if (player.safe) player.safe = { ...player.safe, x: player.safe.x + sx, z: player.safe.z + sz };
  shiftParticles(sx, 0, sz); shiftFloatText(sx, 0, sz); shiftHeroFeet(sx, 0, sz);
  clearOrder();   // (a walk planned in the tile left: the mouse held down plans it again)
  state.cubeKey = k; state.map = c.map;
  // the people living here, and what the quests put here (game/flow.js buildCube); its bake
  // most likely made ahead (game/bakeahead.js), its shadows there at once
  state.world = buildCube(c);
  setGlassShut(state.world.glass, portalsOnly(c.map, state.run));
  disposeWorld(old);
  enterTrial(c.map);
  const gr = groundAt(player.x, player.z, player.y + 0.05, STEP);
  if (gr.s) player.support = gr.s;
  // a death or the Room Portal Scroll brings the hero back here (the town has no enemies to put back)
  state.arrival = { x: player.x, y: player.y, z: player.z };
  state.portalLock = 0; state.boundaryLock = -1;
  beginVisit();
  resetEnemies();
  showNeighbors(visitedNeighbors(k), true);
  showStats(c.map, k, state.cubes.seed, c.visits);
  prefetchTown();
}

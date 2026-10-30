// Where a cube is drawn now, for what is drawn in it without being built with it: the robot
// (game/robot.js), the people of the surroundings (game/standins.js), the friends (net/session.js),
// the crash on the town's plaza (game/intro.js). The cube played in, the one a slide carries away
// (game/travel.js), or one of the surroundings (render/neighbors.js: its proxy's place moves with
// a slide, and with the town's tiles handed over, game/handover.js, so what follows it does too).
import { parse } from '../world/coords.js';
import { state } from './state.js';
import { leftCube } from './travel.js';
import { neighborOf } from '../render/neighbors.js';

// cubes: what lives in the surroundings is drawn this far round the cube played in, no further
// (the surroundings themselves reach further: core/viewdistance.js)
export const NEAR = 2;

// is cube k within NEAR cubes of the one played in (on its layer, of the same depth)?
export function nearby(k) {
  if (!state.cubeKey) return false;
  const a = parse(k), b = parse(state.cubeKey);
  return a.length === 3 && b.length === 3 && a[1] === b[1] && Math.max(Math.abs(a[0] - b[0]), Math.abs(a[2] - b[2])) <= NEAR;
}

// does proxy g (render/neighbors.js) show now: in view, not fogged or faded out (one built since
// the last frame was culled counts as shown), and NEAR (any: however far)?
export const proxyShown = (g, any = false) => (!g.cull.done || g.cull.visible) && g.group.visible && (any || nearby(g.key));

// Cube k as it is drawn now: { at (where its origin is in the scene), fade (how much of it shows,
// 0..1: its dissolve times its distance fade), dim (0: the cube played in or carried away, else
// its proxy's, render/materials.js NEIGHBOR_DIM), group (its world's group or its proxy's
// stand-in, holding its fades: render/fade.js) }, or null: not drawn, or one of the surroundings
// not shown now (out of view, fogged, faded out) or further than NEAR (any: however far)
export function drawnAt(k, { any = false } = {}) {
  if (!k || !state.cubeKey) return null;
  if (k === state.cubeKey) {
    const g = state.world?.group;
    return g ? { at: g.position, fade: g.userData.fade ?? 1, dim: 0, group: g } : null;
  }
  const left = leftCube();
  if (left?.key === k) return { at: left.group.position, fade: left.group.userData.fade ?? 1, dim: 0, group: left.group };
  const g = neighborOf(k);
  if (!g || !proxyShown(g, any)) return null;
  const u = g.group.userData;
  return { at: g.group.position, fade: (u.fade ?? 1) * u.rangeFadeU.value, dim: g.dim ?? 1, group: g.group };
}

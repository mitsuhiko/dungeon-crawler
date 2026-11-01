// The platforms floating round the top of Foggery's tower (map.movers, cubegen/towerarena.js;
// the puzzle they slide in: core/foggery.js). They are not there at first: once his lava has
// risen to its highest (map.tide.high: just under the top of the tower) they rise up out of it
// (`RISE` s). Once the fight is over and the lava drains away, they stop sliding and float down
// with it, each down to the floor under it and on under it (`SINK` cells/s), and are gone (a
// death or leaving the cube puts them back under too). While up they move on a clock of their own, nobody can steer them, and every frame
// (before the player moves) they go where the puzzle has them at that time, for the physics
// (physics/collide.js setMovers: what stands on one is carried along) and for the eye
// (render/movers.js). Playing together, the game running the cube's enemies sends its clock with
// Foggery's row (net/protocol.js); the others follow it (and his lava, game/tide.js).
import { state, setStatus } from './state.js';
import { setMovers } from '../physics/collide.js';
import { platformsAt, PLATFORMS } from '../core/foggery.js';
import { N, LH } from '../core/constants.js';
import { sfx } from '../audio/sfx.js';
import { tr } from '../i18n/i18n.js';

const RISE = 1.8, DEPTH = 1.6;   // s they take to rise, from how far under their height (units)
const SINK = 1.5, DRAINED = 1;   // how fast they float down (units/s); how far the lava fell from its highest (levels): the fight is over
let clock = 0, cache = {}, list = [], map = null, up = false, rise = 0, sinking = false, sunk = false;
export const moverClock = () => clock;
export const moverList = () => list;
export const moversUp = () => up;
// (a friend's clock: theirs wins when they drift apart)
export function followMovers(t) { if (up && Number.isFinite(t) && Math.abs(t - clock) > 0.3) clock = t; }

export function updateMovers(dt) {
  const m = state.map?.movers;
  if (!m) { if (map) resetMovers(); return; }
  if (map !== state.map) { resetMovers(); map = state.map; }
  const t = state.map.tide;
  if (sunk) return;
  if (!up) {
    // (the lava up to its highest: they rise out of it)
    if (state.tide == null || !t || state.tide < t.high - 0.05) return;
    up = true; rise = 0; clock = 0; cache = {};
    const S = PLATFORMS.size;
    list = platformsAt(m, 0, cache).map(({ p, x, z }) => ({ mover: true, p, x0: x, z0: z, x1: x + S, z1: z + S, y1: m.top - DEPTH, y0: m.top - DEPTH - m.thick,
      dx: 0, dz: 0, cs: Array(4).fill(m.top), split: 0, c: -2, x: -1, z: -1, id: -1, fluid: 0, layer: 0, top: m.top / LH, bottom: (m.top - m.thick) / LH,
      link: [null, null, null, null] }));
    setMovers(list);
    setStatus(tr('Platforms rise out of the lava!'));
    sfx('rumble', { at: { x: 8, y: m.top, z: 8 }, pitch: 0.8 });
  }
  // the lava draining away: the fight is over, they float down and under the floor
  if (!sinking && (state.tide == null || state.tide < t.high - DRAINED)) sinking = true;
  if (sinking) { sink(dt); return; }
  rise = Math.min(1, rise + dt / RISE);
  const lift = (1 - rise * rise * (3 - 2 * rise)) * DEPTH;
  clock += dt;
  for (const { p, x, z } of platformsAt(m, clock, cache)) {
    const o = list[p], dx = x - o.x0, dz = z - o.z0, jump = Math.abs(dx) > 0.5 || Math.abs(dz) > 0.5;   // (a clock that jumped carries nobody)
    o.dx = jump ? 0 : dx; o.dz = jump ? 0 : dz;
    o.x0 = x; o.z0 = z; o.x1 = x + PLATFORMS.size; o.z1 = z + PLATFORMS.size;
    o.y1 = m.top - lift; o.y0 = o.y1 - m.thick; o.cs.fill(o.y1);
  }
}
// Down with the lava: no more sliding (who stands on one rides it down), each sinks until it is
// wholly under the highest floor under it (the caldera's floor, or the ramp), and then it is gone
function sink(dt) {
  const T = PLATFORMS.size, cols = state.map.cols;
  list = list.filter(o => {
    o.dx = o.dz = 0;
    let floor = -Infinity;
    for (let b = 0; b < T; b++) for (let a = 0; a < T; a++) {
      const col = cols[(Math.floor(o.z0) + b) * N + Math.floor(o.x0) + a] ?? [];
      for (const f of col) floor = Math.max(floor, ...f.cs);
    }
    o.y1 -= SINK * dt; o.y0 = o.y1 - state.map.movers.thick; o.cs.fill(o.y1);
    return o.y1 > floor - 0.05;   // (its top under the floor: gone)
  });
  setMovers(list);
  if (!list.length) sunk = true;
}
// gone again, under the lava (a new visit, a death that puts the cube back)
export function resetMovers() { map = null; up = false; rise = 0; clock = 0; cache = {}; list = []; sinking = sunk = false; setMovers(list); }

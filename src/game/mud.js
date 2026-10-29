// Sollmeldon's mud (core/sollmeldon.js has its rules, docs/bosses.md tells it): the standing fluid
// of his mire (map.tide `mud`: cubegen/guardian.js), mud that flows over the ground of the basin (a
// field of depths, core/sollmeldon.js newMudField / stepMud). It fills the basin's low middle at
// first; the world's tilt (his `tilt`, game/tilt.js) pulls it to the low side, where it runs deep;
// level again, it levels out. Every ball of mud he spits lands in it as a dome (his `drops`), a
// puddle that holds still while the world is level and runs downhill when it tips. It goes to the
// physics as a tide with a height of its own in each cell (physics/fluid.js setTide `ys`: waded
// through as water, and swum in where it is deep, on the low side: physics/fluid.js swum; his Mud
// squirtles live in it) and is drawn as glossy marbled goop (render/mud.js).
// Every game runs its own field from what it is shown of him: his tilt and his drops (each once, by
// its number), so it flows alike in every game. In his intro the mire is flooded to the brim (his
// `flood`, game/bossreveals.js: he rises out of the mud) and drains down to its mud after it. Without him (beaten, or none here) it drains back to
// what it was at first and lies level. The developer's /tilt tips it without him (game/tilt.js
// holds it), /mud pours more in.
import { LH, WATER, MUD, N } from '../core/constants.js';
import { floorY } from '../core/surfaces.js';
import { SOLLMELDON_FIGHT as G, MUD_FLOW, newMudField, depositMud, stepMud, drainMud, mudTotal, cellSurfaces, depthAt,
  surfaceAt, slopeOf, tipped, sampleX, sampleZ } from '../core/sollmeldon.js';
import { setTide, standingAt } from '../physics/fluid.js';
import { drawMudField, clearMudField } from '../render/mud.js';
import { state, player } from './state.js';
import { slowPlayer } from './enemycombat.js';
import { afflictEnemy } from './statuses.js';
import { mirroring } from './enemies.js';
import { heldTilt } from './tilt.js';

const DRAIN = 0.25;   // of what is too much a second, without him
let map = null, field = null, base = 0, level = null, applied = 0, extra = 0, tilted = [0, 0];
let flooded = 0, rest = 0, brim = 0;   // how flooded it is (0 .. 1), its first level and its level flooded (world units)
const DRAINS = 2.8;   // s the flood of his intro takes to drain away
// (flooded, a little over the doorways' level and his spot's: the whole mire under mud)
export const FLOOD_OVER = 0.06;

// the ground the mud stands on: the lowest floor of each column of the basin (a structure never)
function groundOf(m) {
  return (x, z) => {
    const cx = Math.floor(x), cz = Math.floor(z), f = m.cols[cz * N + cx]?.filter(g => !g.kind).sort((a, b) => a.top - b.top)[0];
    return f ? floorY(f, x - cx, z - cz) : null;
  };
}
// him (alive), else null
const holder = list => list.find(e => e.boss === 'sollmeldon' && e.mode !== 'dead' && e.hp > 0) ?? null;

export function updateMud(list, dt) {
  const t = state.map?.tide;
  if (state.map !== map) {
    map = state.map; applied = 0; extra = 0;
    field = newMudField(t.box, groundOf(map));
    rest = t.rest * LH; brim = (map.guardian?.y ?? rest) + FLOOD_OVER; flooded = 0;
    level0(rest);
    base = mudTotal(field);
  }
  const by = holder(list);
  // his intro's flood: the mire full to the brim, then drained down to its mud, level
  const want = by?.flood ?? 0;
  if (want > flooded || flooded > 0) {
    flooded = want > flooded ? want : Math.max(want, flooded - dt / DRAINS);
    const u = flooded * flooded * (3 - 2 * flooded);
    level0(rest + (brim - rest) * u);
  }
  // his drops not yet in it (each once, by its number)
  for (const [n, x, z, vol, r] of by?.drops ?? []) if (n > applied) { depositMud(field, x, z, vol, r); applied = n; }
  if (!by) drainMud(field, base + extra, DRAIN, dt);
  const tilt = tilted = heldTilt() ?? by?.tilt ?? [0, 0];
  stepMud(field, slopeOf(tilt), tipped(tilt) > MUD_FLOW.tipped, dt);
  const ys = cellSurfaces(field);
  level = ys;
  setTide({ y: -Infinity, fluid: WATER, look: MUD, box: t.box, ys });
  let high = -Infinity;
  for (const y of ys) if (y > high) high = y;
  state.tide = Number.isFinite(high) ? high / LH : null;
  wade(list);
}
// the mud filled up level to y
function level0(y) {
  for (let k = 0; k < field.depth.length; k++) field.depth[k] = Number.isFinite(field.ground[k]) ? Math.max(0, y - field.ground[k]) : 0;
  field.qx.fill(0); field.qz.fill(0);
}
// Mud slows whoever wades or swims through it, a puddle too: the player; the enemies we run that are
// not his (the mud is his own, and his Mud squirtles live in it)
function wade(list) {
  const p = player, inMud = b => depthAt(field, b.x, b.z) > MUD_FLOW.wet * 2 && surfaceAt(field, b.x, b.z) > b.y - 0.05;
  if (p.hp > 0 && !p.ragdoll && (p.grounded !== false || p.swimming) && inMud(p)) slowPlayer(G.mud.wade);
  if (mirroring()) return;
  for (const e of list) {
    if (e.mode === 'dead' || e.boss === 'sollmeldon' || e.profile?.mudborn || e.profile?.hover || e.profile?.dwells) continue;
    if (inMud(e)) afflictEnemy(e, 'slowed', G.mud.wade);
  }
}
// The mud's surface over (x, z) (world units; -Infinity: dry, outside the basin, no mud here)
export const mudAt = (x, z) => field && state.map?.tide?.mud ? surfaceAt(field, x, z) : -Infinity;
// how deep it is there
export const mudDepthAt = (x, z) => field && state.map?.tide?.mud ? depthAt(field, x, z) : 0;
// how it stands now (the checks, the developer): { volume, base, deepest (over the ground), cells
// (wet cells of the cube), centre ([x, z]: where its weight is) }, null: no mud here
export function mudNow() {
  if (!field || !state.map?.tide?.mud) return null;
  let deepest = 0, cells = 0, sum = 0, cx = 0, cz = 0;
  field.depth.forEach((d, k) => { deepest = Math.max(deepest, d); sum += d; cx += d * sampleX(field, k); cz += d * sampleZ(field, k); });
  for (const y of level ?? []) if (Number.isFinite(y)) cells++;
  return { volume: mudTotal(field), base, deepest, cells, centre: sum > 0 ? [cx / sum, cz / sum] : null };
}
// what it held at first
export const mudBase = () => base;
// /mud: n balls' worth more poured in round the hero (n < 0: taken out; 0: back to what it was), false:
// no mud here
export function devMud(n) {
  if (!field || !state.map?.tide?.mud) return false;
  for (let i = 0; i < n; i++) depositMud(field, player.x + (Math.random() - 0.5) * 3, player.z + (Math.random() - 0.5) * 3, G.mud.ball, G.mud.radius);
  extra = n ? Math.max(0, extra + n * G.mud.ball) : 0;
  if (n <= 0) drainMud(field, base + extra, 1, 1);
  return true;
}
// gone (another cube, out of play)
export function resetMud() { map = null; field = null; level = null; flooded = 0; clearMudField(); }
// how high the mud stands flooded (his intro: game/bossreveals.js), world units
export const mudBrim = () => brim;
export const drawMud = (dt, off) => drawMudField(field, state.map, dt, off, tilted);

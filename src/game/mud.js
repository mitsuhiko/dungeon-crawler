// Sollmeldon's mud (core/sollmeldon.js has its rules, docs/bosses.md tells it): the standing fluid
// of his mire (map.tide `mud`: cubegen/guardian.js), a volume of mud, not a level. Every frame its
// surface is solved over the ground under it for the volume it has now (core/sollmeldon.js
// mudLevel), leaning as the world is tipped: the lean follows the tilt on a spring (stepSlosh), so
// the mud surges to the low side and settles. It goes to the physics as a leaning tide
// (physics/fluid.js setTide `slope`: waded through as water, deep enough to drown in on the low
// side, where magic pulls one out: game/fluidrescue.js) and is drawn as mud (render/trials.js, the
// look MUD, leaning: setTrialWater's slope).
// What it holds and how it is tipped is his (on him, sent to friends with his row: `mud`, the mud
// his fight added, `tilt`, the way the world is tipped, `puddles`), so every game shows the same
// mud: without him (beaten, or none here) it drains back to what it was at first and lies level.
// The developer's /tilt tips it without him (game/tilt.js holds it).
// His puddles (`puddles`, game/sollmeldon.js moves them) are drawn here (render/mud.js) and slow
// whoever wades through them, like the mud itself.
import { LH, WATER, MUD, N } from '../core/constants.js';
import { floorY } from '../core/surfaces.js';
import { SOLLMELDON_FIGHT as G, mudVolume, mudLevel, newSlosh, stepSlosh, slopeOf, planeY } from '../core/sollmeldon.js';
import { setTide, standingAt } from '../physics/fluid.js';
import { setTrialWater } from '../render/trials.js';
import { drawPuddles, clearPuddles } from '../render/mud.js';
import { state, player } from './state.js';
import { slowPlayer } from './enemycombat.js';
import { afflictEnemy } from './statuses.js';
import { mirroring } from './enemies.js';
import { heldTilt } from './tilt.js';

// how fast the mud's volume follows what it should hold (1/s: an ease), up and down (it drains slower)
const FILL = 2, DRAIN = 0.45;
let map = null, samples = [], base = 0, shown = null, level = null, slosh = newSlosh(), puddles = [];
let extra = 0;   // the developer's mud (/mud), on top of his

// the ground the mud stands on in its box: three by three points a cell, on the lowest floor of each
// column (world units: { x, z, h, a })
function groundOf(m) {
  const [x0, z0, x1, z1] = m.tide.box, out = [];
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const f = m.cols[z * N + x].filter(g => !g.kind).sort((a, b) => a.top - b.top)[0];
    if (!f) continue;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const fx = (i + 0.5) / 3, fz = (j + 0.5) / 3;
      out.push({ x: x + fx, z: z + fz, h: floorY(f, fx, fz), a: 1 / 9 });
    }
  }
  return out;
}
// the mud he has here (alive), else null
const holder = list => list.find(e => e.boss === 'sollmeldon' && e.mode !== 'dead' && e.hp > 0) ?? null;

export function updateMud(list, dt) {
  const t = state.map?.tide;
  if (state.map !== map) {
    map = state.map; slosh = newSlosh(); shown = null; level = null; puddles = []; extra = 0;
    samples = t?.mud ? groundOf(map) : []; base = t?.mud ? mudVolume(samples, t.rest * LH) : 0;
  }
  const by = holder(list);
  const want = base + (by?.mud ?? 0) + extra;
  shown = shown === null ? want : shown + (want - shown) * Math.min(1, dt * (want > shown ? FILL : DRAIN));
  const tilt = heldTilt() ?? by?.tilt ?? [0, 0];
  stepSlosh(slosh, slopeOf(tilt), dt);
  level = mudLevel(samples, shown, slosh.g);
  setTide({ y: level, fluid: WATER, look: MUD, box: t.box, slope: [...slosh.g] });
  setTrialWater(state.world, level, 'running', slosh.g);
  state.tide = level / LH;
  // his puddles (gone with him: they dry up as the mud drains)
  puddles = by?.puddles ?? [];
  wade(list);
}
// mud and puddles slow whoever wades through them: the player; the enemies we run that are not his
// (the mud is his own, and his Mud squirtles live in it)
function wade(list) {
  const p = player, s = standingAt(p.x, p.z);
  if (p.hp > 0 && !p.ragdoll && s && s.y > p.y + 0.05) slowPlayer(G.mud.wade);
  const inPuddle = b => puddles.some(q => Math.hypot(b.x - q.x, b.z - q.z) < q.r && Math.abs(b.y - q.y) < 0.45);
  if (p.grounded && p.hp > 0 && inPuddle(p)) slowPlayer(G.mud.slow);
  if (mirroring()) return;
  for (const e of list) {
    if (e.mode === 'dead' || e.boss === 'sollmeldon' || e.profile?.mudborn || e.profile?.hover) continue;
    const w = standingAt(e.x, e.z);
    if ((w && w.y > e.y + 0.05) || inPuddle(e)) afflictEnemy(e, 'slowed', G.mud.wade);
  }
}
// The mud's surface over (x, z) (world units; -Infinity: outside its box, or no mud here)
export function mudAt(x, z) {
  const t = state.map?.tide;
  if (!t?.mud || level === null) return -Infinity;
  const [x0, z0, x1, z1] = t.box;
  if (x < x0 || z < z0 || x >= x1 || z >= z1) return -Infinity;
  return planeY(level, slosh.g, x, z);
}
// Where the mud's surface stands over (x, z) now and with the world tipped all the way each way,
// holding what it holds now: [(x, z) => height], for the rescue (game/fluidrescue.js)
export function mudTips() {
  const t = state.map?.tide;
  if (!t?.mud || level === null) return [];
  const k = slopeOf([1, 0])[0];
  return [[0, 0], [k, 0], [-k, 0], [0, k], [0, -k]].map(g => [g, mudLevel(samples, shown, g)])
    .concat([[slosh.g, level]]).map(([g, y]) => (x, z) => planeY(y, g, x, z));
}
// how it stands now (the checks, the developer): { volume, base, level (at the middle of the
// cube), slope }, null: no mud here
export const mudNow = () => state.map?.tide?.mud && level !== null ? { volume: shown, base, level, slope: [...slosh.g], puddles: puddles.length } : null;
// /mud: n balls' worth more (or, n < 0, less; 0: none of the developer's), false: no mud here
export function devMud(n) {
  if (!state.map?.tide?.mud) return false;
  extra = n ? Math.max(-base, extra + n * G.mud.ball) : 0;
  return true;
}
// what it held at first (his fight adds to it: core/sollmeldon.js)
export const mudBase = () => base;
// gone (another cube, out of play)
export function resetMud() {
  if (map) { map = null; samples = []; shown = null; level = null; puddles = []; slosh = newSlosh(); }
  clearPuddles();
}
export const drawMud = (dt, off) => drawPuddles(puddles, dt, off);

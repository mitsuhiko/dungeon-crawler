// The jumps the hero can make, for click to move (physics/playernav.js, game/orders.js): over a
// gap of up to three cells, up onto a ledge too high to walk up, or down off one (walked off, or
// jumped). They are found by making them: the hero's own physics (physics/move.js) run the very
// moves the order will make (a run-up along the middle of the cell, the jump at `T`, straight on
// in the air), from a little off the middle and a little late too, and a jump only counts if it
// lands on the floor it is for every time, softly (no sitting down, physics/move.js landingSpeed).
// Over what kills (a fluid too deep to wade, or nothing at all) it has to hold with wider margins.
// What the hero can do changes with potions and boots (move.js jumpPowers): the jumps are found
// per map and per what he can do, as the search reaches each floor.
import { DIRS, OPP, STEP, GRAV, JUMP_V, SIT_IMPACT, CHAR_H } from '../core/constants.js';
import { idx, inb, edgeKey } from '../core/util.js';
import { topOf } from '../core/surfaces.js';
import { effectMod } from '../core/potions.js';
import { player, state } from '../game/state.js';
import { groundAt } from './collide.js';
import { movePlayer, landingSpeed, jumpPowers } from './move.js';
import { peril } from './fluid.js';

const DT = 1 / 60, MAX_GAP = 3, SOFT = SIT_IMPACT * 0.95;   // (landing faster sits you down)
const TAKEOFFS = [0.86, 0.76, 0.66, 0.56];   // where along the cell the jump goes off (its far edge at 1)
export const DROP_PACE = 0.4;          // walking off a ledge slowly, to land close under it
export const LATE = 0.15;              // the run-up starts at least this far before the take-off
export const ALIGN = 0.08;             // ... this close to the middle of the cell
export const DROP_START = 0.65;        // (walking off: before this far along the cell)

// (fwd, lat) in cell f along direction d: how far along (0 at the near edge, 1 at the edge
// towards d) and how far off its middle line; and back
export function cellFrame(f, d, x, z) {
  const [dx, dz] = DIRS[d], lx = x - f.x, lz = z - f.z;
  return dx ? [dx > 0 ? lx : 1 - lx, lz - 0.5] : [dz > 0 ? lz : 1 - lz, lx - 0.5];
}
export function cellPoint(f, d, fwd, lat) {
  const [dx, dz] = DIRS[d];
  return dx ? [f.x + (dx > 0 ? fwd : 1 - fwd), f.z + 0.5 + lat] : [f.x + 0.5 + lat, f.z + (dz > 0 ? fwd : 1 - fwd)];
}
// where the run-up starts: the middle of the cell, or before it for an early take-off
export const runStart = e => e.drop ? 0.5 : Math.min(0.5, e.T - 0.2);
// Steering in the air, at (x, z), on the way from f along d to g: on until over g (not walking
// off: no steering), then none, and back past its middle, so as not to fly over it
export function airSteer(g, d, drop, x, z) {
  const [dx, dz] = DIRS[d];
  if (Math.floor(x) !== g.x || Math.floor(z) !== g.z) return drop ? [0, 0] : [dx, dz];
  return cellFrame(g, d, x, z)[0] > 0.5 ? [-dx, -dz] : [0, 0];
}

// the height in the middle of node n's side d
const EDGE = [[1, .5], [0, .5], [.5, 1], [.5, 0]];
const edgeY = (n, d) => topOf(n, ...EDGE[d]);

// What a trial changes on the hero, put back after it.
const KEEP = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'grounded', 'swimming', 'fluid', 'wade', 'support', 'airTime', 'coyote',
  'jumpBuf', 'stun', 'gust', 'pull', 'jumpCount', 'landCount', 'landImpact', 'climb'];
// Make the move from f along d to g once: start at `from` along the cell (`lat` off its middle),
// run (or walk slowly off, `drop`) along d, jump once at T or past it (`late` after), keep going
// in the air. true: landed on g, softly, and stays on it.
function trial(f, d, g, { T, drop }, { from, lat = 0, late = 0, dt = DT }) {
  const p = player, keep = KEEP.map(k => p[k]), jumpMod = effectMod(p, 'jump');
  try {
    const [x, z] = cellPoint(f, d, from, lat);
    Object.assign(p, { x, z, y: topOf(f, x - f.x, z - f.z), vx: 0, vy: 0, vz: 0, grounded: true, swimming: false, fluid: 0, wade: 0,
      support: f, airTime: 0, coyote: 0, jumpBuf: 0, stun: 0, gust: null, pull: null, climb: null });
    const [dx, dz] = DIRS[d], pace = drop ? DROP_PACE : 1;
    let air = false;
    for (let t = 0; t < 3; t += dt) {
      const jump = !air && !drop && p.support === f && cellFrame(f, d, p.x, p.z)[0] >= T + late;
      const gr = air ? movePlayer(dt, ...airSteer(g, d, drop, p.x, p.z), true, false) : movePlayer(dt, dx * pace, dz * pace, true, jump);
      if (!p.grounded) { air = true; continue; }
      if (p.support === g) {
        if (landingSpeed(gr, jumpMod) > SOFT) return false;
        for (let i = 0; i < 10; i++) movePlayer(dt, 0, 0, true, false);   // and stays there
        return p.grounded && p.support === g;
      }
      if (air || p.support !== f) return false;   // fell short, or walked onto something else
    }
    return false;
  } finally { KEEP.forEach((k, i) => { p[k] = keep[i]; }); }
}
// the move works from a little off the middle, a little late, at a lower frame rate too
function holds(f, d, g, e, deadly) {
  const from = runStart(e), ways = [{ from }, { from, lat: ALIGN }, { from, lat: -ALIGN }, { from, dt: 1 / 30 },
    { from: e.drop ? DROP_START : e.T - LATE }];
  if (!e.drop) ways.push({ from, late: 0.06 });
  if (deadly) ways.push({ from, lat: 1.5 * ALIGN }, { from, lat: -1.5 * ALIGN }, { from, late: 0.1 });
  return ways.every(w => trial(f, d, g, e, w));
}

// a gap's cell is deadly to fall into: nothing to land on, or a fluid that takes you (lava, acid:
// water is swum in, physics/fluid.js peril)
function deadly(x, z, y) {
  const gr = groundAt(x + 0.5, z + 0.5, y, 0);
  return !gr.s || !!peril(gr, gr.h + 0.01);
}
// visible fences (cliff fences: held up to their height) on the edges crossed; walking off a
// ledge (`walk`), the invisible rails too
function fenced(map, f, d, k, walk) {
  const [dx, dz] = DIRS[d];
  for (let j = 0; j <= k; j++) {
    const ax = f.x + dx * j, az = f.z + dz * j, e = map.fences?.get(edgeKey(ax, az, ax + dx, az + dz));
    if (e?.some(e => walk || e.show)) return true;
  }
  return false;
}
const floorNode = n => n && !n.kind && n.cs && !n.fluid && !n.landing;

// The leaps from floor f: [{ g, d, k (cells of gap), T (take-off, null walking off), drop, cost }]
// ok(g): may the hero stand on g (game/orders.js: room for him, no prop in the way).
function find(map, f, ok, pw) {
  const out = [];
  if (!floorNode(f) || !ok(f)) return out;
  const V = JUMP_V * pw.boost, peak = V * V / (2 * GRAV);
  for (let d = 0; d < 4; d++) {
    const [dx, dz] = DIRS[d], fy = edgeY(f, d);
    if (fenced(map, f, d, 0, false)) continue;
    for (let k = 0; k <= MAX_GAP; k++) {
      const ex = f.x + dx * (k + 1), ez = f.z + dz * (k + 1);
      if (!inb(ex, ez)) break;
      // the gap: clearly lower than both ends, all the way; past a wall nothing goes on
      let low = Infinity, deadlyGap = false, wall = false;
      for (let j = 1; j <= k; j++) {
        const gx = f.x + dx * j, gz = f.z + dz * j, top = groundAt(gx + 0.5, gz + 0.5, fy + CHAR_H + peak, 0).h;
        if (top > fy + STEP) wall = true;
        low = Math.min(low, fy - top);
        deadlyGap ||= deadly(gx, gz, fy + 1);
      }
      if (wall) break;
      for (const g of map.cols[idx(ex, ez)]) {
        if (!floorNode(g) || !ok(g)) continue;
        const dh = edgeY(g, OPP[d]) - fy;
        if (k === 0) {
          if (Math.abs(dh) <= STEP || f.link?.[d] === g) continue;   // walked
        } else if (low < STEP + Math.max(0, -dh)) continue;         // no gap: a step down, walked
        if (dh > peak - (k ? 0.15 : 0.1)) continue;                  // too high to get onto
        const drop = k === 0 && dh < 0;
        // soft enough (a fall onto a soft landing always is) and far enough, at best
        const hit = drop ? Math.sqrt(-2 * GRAV * dh) : Math.sqrt(V * V - 2 * GRAV * dh) / pw.boost;
        if (!g.soft && hit > SOFT) continue;
        if (k > 0 && k + 0.34 > pw.leap * (V + Math.sqrt(V * V - 2 * GRAV * dh)) / GRAV) continue;
        if (fenced(map, f, d, k, drop)) continue;
        const tries = drop ? [{ T: null, drop: true }, ...TAKEOFFS.map(T => ({ T, drop: false }))] : TAKEOFFS.map(T => ({ T, drop: false }));
        const e = tries.find(e => holds(f, d, g, e, deadlyGap));
        if (e) out.push({ g, d, k, T: e.T, drop: e.drop, cost: k + 1 + (e.drop ? 0.5 : 1.5) + 0.2 * Math.abs(dh) });
      }
    }
  }
  return out;
}

// per map: per what the hero can do (rounded): per floor, its leaps
const cache = new WeakMap();
const powersKey = pw => [pw.run, pw.leap, pw.boost].map(v => Math.round(v * 20)).join(':');
// the leaps from node n for the hero now (none but in the active cube: they are tried out in it)
export function leapsFrom(map, n, ok) {
  if (map !== state.map || !floorNode(n)) return [];
  const pw = jumpPowers(player), key = powersKey(pw);
  let byPowers = cache.get(map);
  if (!byPowers) cache.set(map, byPowers = new Map());
  let byNode = byPowers.get(key);
  if (!byNode) byPowers.set(key, byNode = new Map());
  let list = byNode.get(n);
  if (!list) byNode.set(n, list = find(map, n, ok, pw));
  return list;
}

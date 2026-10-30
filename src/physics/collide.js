// World queries against floors, structure pieces and pillars.
import { LH, N, DIRS } from '../core/constants.js';
import { idx, inb, clamp } from '../core/util.js';
import { floorY, runY, topOf } from '../core/surfaces.js';
import { player, state } from '../game/state.js';
import { containsXZ } from '../core/blockers.js';

// The cell of a map at (x, z) (the active cube's, by default), or -1: outside it. Only ever a cell
// of that map: what lies past an open side is another cube's (spotAt).
export function cellAt(x, z, map = state.map) {
  const cx = Math.floor(x), cz = Math.floor(z);
  return inb(cx, cz) ? idx(cx, cz) : -1;
}

// The sides of the cube played in that a body walks across now (the town's seams, the open faces
// it may take: game/handover.js), each with the map of the cube beyond (null: a side that is a
// wall). Past one the physics reads that cube's cells as they lie there, up to REACH cells, so a
// body crossing, half in the next cube, stands and moves as it would there, until the next cube
// takes over (game/handover.js). Set for one map: the cube played in, another one knows no sides.
const SHUT = [null, null, null, null];
let across = { map: null, beyond: SHUT };
export function setAcross(map, beyond = SHUT) { across = { map, beyond }; }
export const acrossOf = (map = state.map) => across.map === map && map ? across.beyond : SHUT;
const REACH = 1;   // cells past a side read as the cube beyond (further: solid, as anywhere outside)

// Where (x, z) of `map` lies: sets `at` to the map it is in, the cell there, the point in that map's
// coordinates and the side crossed (-1: none), and says whether it lies anywhere (false: solid).
// Past a side of the cube played in, in the cube beyond, if it is walked across; never past two.
const at = { m: null, i: -1, x: 0, z: 0, d: -1 };
function locate(x, z, map = state.map) {
  const cx = Math.floor(x), cz = Math.floor(z);
  if (inb(cx, cz)) { at.m = map; at.i = idx(cx, cz); at.x = x; at.z = z; at.d = -1; return true; }
  if (!map || across.map !== map) return false;
  const ox = cx >= N ? 0 : cx < 0 ? 1 : -1, oz = cz >= N ? 2 : cz < 0 ? 3 : -1;
  if ((ox < 0) === (oz < 0)) return false;   // (inside, or past a corner)
  const d = ox >= 0 ? ox : oz, m = across.beyond[d];
  if (!m || (d < 2 ? (d ? -1 - cx : cx - N) : (d === 3 ? -1 - cz : cz - N)) >= REACH) return false;
  const lx = x - DIRS[d][0] * N, lz = z - DIRS[d][1] * N;
  at.m = m; at.i = idx(Math.floor(lx), Math.floor(lz)); at.x = lx; at.z = lz; at.d = d;
  return true;
}
// The same as an object of its own: { m, i, x, z, d }, or null (solid). For what keeps more than
// one at a time (physics/canmove.js).
export const spotAt = (x, z, map = state.map) => locate(x, z, map) ? { ...at } : null;
const pieceBottom = (p, top) => p.kind === 'bridge' ? top - 0.2 : p.base;

// A trial's crumbling crust (game/trials.js): floors that are gone for now (gone(floor, ahead) ->
// true) are not there for anything here, in the active cube; nor is a hole in Flip's box once it
// opened (`open`, game/flipworld.js). `ahead`: s from now, while a move is tried out ahead of
// time (physics/brink.js: a jump lands where a stone will be up, or not, when it comes down)
let gone = null, ahead = 0;
export const setGoneFloors = fn => { gone = fn; };
const here = (f, map = state.map) => !f.open && !(gone && f.crust && map === state.map && gone(f, ahead));
// is floor f of the active cube's crust gone for now?
export const goneNow = f => !!(gone && f.crust && gone(f, 0));
// the crust as it will be t s from now (0: as it is), until set back
export const lookAhead = (t = 0) => { ahead = t; };
// fn() with every crust floor there, as built (physics/leaps.js: the jumps the hero can make are
// found once, sunk stones or not)
export function asBuilt(fn) {
  const was = gone;
  gone = null;
  try { return fn(); } finally { gone = was; }
}
// ... and its parts that stand in the way (a gate while shut, a crate): per cell, like map.blockers
let parts = null;
export const setPartBlockers = cells => { parts = cells; };
// what stands in the way in cell i of map m (the active cube's with its parts, another's as built)
const blockersAt = (i, m = state.map) => m !== state.map ? m.blockers?.[i] || []
  : parts?.[i]?.length ? [...(m.blockers?.[i] || []), ...parts[i].filter(b => !b.off)] : m.blockers?.[i] || [];
const inPillar = (p, fx, fz) => fx >= p.x0 && fx <= p.x1 && fz >= p.z0 && fz <= p.z1;
// The platforms floating round Foggery's tower (game/movers.js): slabs that move, in the active
// cube. Each is a surface like a floor (flat, its top at y1, its underside at y0, from x0, z0
// to x1, z1), and one that carries what stands on it (`dx`, `dz`: how far it moved this frame,
// physics/move.js).
let movers = [];
export const setMovers = list => { movers = list; };
export const moversNow = () => movers;
const onMover = (m, x, z) => x >= m.x0 && x < m.x1 && z >= m.z0 && z < m.z1;
// (no mover reaches past a side: they float in the active cube)
const moversAt = m => m === state.map ? movers : [];
const local = (x, z) => [x - Math.floor(x), z - Math.floor(z)];

// highest walkable surface at (x,z) that is not above y+step: { h, s (floor or piece), i (cell of
// map; -1: past a side, in the cube beyond: spotAt) }
// map: the active cube's (and past its sides what it walks across: locate), or another one's (a
// neighbour across an open face, in its own coordinates)
export const groundAt = (x, z, y, step, map = state.map) => ground(x, z, y, step, map, true);
// ... but not the platforms: the ground that stays (what loot rests on, physics/rest.js)
export const stillGroundAt = (x, z, y, step, map = state.map) => ground(x, z, y, step, map, false);
function ground(x, z, y, step, map, moving) {
  if (!locate(x, z, map)) return { h: -Infinity, s: null, i: -1 };
  const { m, i } = at, [fx, fz] = local(x, z);
  let h = -Infinity, s = null;
  for (const f of m.cols[i]) { if (!here(f, m)) continue; const t = floorY(f, fx, fz); if (t <= y + step && t > h) { h = t; s = f; } }
  for (const p of m.pieces[i]) {
    if (p.kind === 'pillar') continue;
    const t = runY(p, fx, fz);
    if (t <= y + step && t > h) { h = t; s = p; }
  }
  if (moving) for (const o of moversAt(m)) if (onMover(o, x, z) && o.y1 <= y + step && o.y1 > h) { h = o.y1; s = o; }
  return { h, s, i: m === map ? i : -1 };
}

// does something solid occupy the body (between y+step and the head)?
// piecesOnly: inside our own cell only structures hanging overhead count; h: how tall the body
// is (physics/unstuck.js asks about its middle only)
export function blockedAt(x, z, y, step, piecesOnly = false, h = player.h) {
  if (!locate(x, z)) return true;
  const { m, i } = at, [fx, fz] = local(x, z), head = y + h;
  // Trees use trunk circles; town buildings use their rotated footprint boxes.
  for (const b of blockersAt(i, m)) if (containsXZ(b, at.x, at.z) && b.bottom < head && b.top > y + step) return true;
  if (!piecesOnly) for (const f of m.cols[i]) if (here(f, m) && floorY(f, fx, fz) > y + step && f.bottom * LH < head) return true;
  for (const p of m.pieces[i]) {
    if (p.kind === 'pillar') {
      if (inPillar(p, fx, fz) && p.bottom < head && p.top > y + step) return true;
      continue;
    }
    const t = runY(p, fx, fz), b = pieceBottom(p, t);
    if (piecesOnly ? b > y + 0.05 && b < head : t > y + step && b < head) return true;
  }
  for (const o of moversAt(m)) if (onMover(o, x, z) && (piecesOnly ? o.y0 > y + 0.05 && o.y0 < head : o.y1 > y + step && o.y0 < head)) return true;
  return false;
}

// lowest underside of anything above height y at (x,z) (what a jump bumps into)
export function ceilingAt(x, z, y) {
  if (!locate(x, z)) return Infinity;
  const { m, i } = at, [fx, fz] = local(x, z);
  let c = Infinity;
  for (const b of blockersAt(i, m)) if (b.bottom > y && containsXZ(b, at.x, at.z)) c = Math.min(c, b.bottom);
  for (const f of m.cols[i]) if (here(f, m) && f.bottom * LH > y) c = Math.min(c, f.bottom * LH);
  for (const p of m.pieces[i]) {
    const b = p.kind === 'pillar' ? (inPillar(p, fx, fz) ? p.bottom : Infinity) : pieceBottom(p, runY(p, fx, fz));
    if (b > y) c = Math.min(c, b);
  }
  for (const o of moversAt(m)) if (onMover(o, x, z) && o.y0 > y) c = Math.min(c, o.y0);
  return c;
}

// is the point inside solid matter? (ragdoll particles)
export function insideSolid(x, z, y) {
  if (!locate(x, z)) return true;
  const { m, i } = at;
  for (const b of blockersAt(i, m)) if (y > b.bottom && y < b.top && containsXZ(b, at.x, at.z)) return true;
  const [fx, fz] = local(x, z);
  for (const f of m.cols[i]) if (here(f, m) && floorY(f, fx, fz) > y && f.bottom * LH < y) return true;
  for (const p of m.pieces[i]) {
    if (p.kind === 'pillar') { if (inPillar(p, fx, fz) && p.bottom < y && p.top > y) return true; continue; }
    const t = runY(p, fx, fz);
    if (t > y && pieceBottom(p, t) < y) return true;
  }
  for (const o of moversAt(m)) if (onMover(o, x, z) && y > o.y0 && y < o.y1) return true;
  return false;
}

// the walkable top of the floor or structure whose solid contains (x, y, z): { h, s }, or
// null. Props do not count. Clicks on the ground and on cliff faces resolve to the top.
export function solidTop(x, z, y) {
  if (!locate(x, z)) return null;
  const { m, i } = at, [fx, fz] = local(x, z);
  let top = null;
  for (const f of m.cols[i]) { if (!here(f, m)) continue; const t = floorY(f, fx, fz); if (t > y && f.bottom * LH < y) top = { h: t, s: f }; }
  for (const p of m.pieces[i]) {
    if (p.kind === 'pillar') continue;
    const t = runY(p, fx, fz);
    if (t > y && pieceBottom(p, t) < y) top = { h: t, s: p };
  }
  for (const o of moversAt(m)) if (onMover(o, x, z) && o.y1 > y && o.y0 < y) top = { h: o.y1, s: o };
  return top;
}

// surface gradient of a floor or piece at (x,z)
export function slopeAt(s, x, z) {
  if (!s) return [0, 0];
  const e = 0.04;
  const fx = clamp(x - Math.floor(x), e, 1 - e), fz = clamp(z - Math.floor(z), e, 1 - e);
  const gx = (topOf(s, fx + e, fz) - topOf(s, fx - e, fz)) / (2 * e);
  const gz = (topOf(s, fx, fz + e) - topOf(s, fx, fz - e)) / (2 * e);
  return [gx || 0, gz || 0];
}

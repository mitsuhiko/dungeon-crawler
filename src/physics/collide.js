// World queries against floors, structure pieces and pillars.
import { LH } from '../core/constants.js';
import { idx, inb, clamp } from '../core/util.js';
import { floorY, runY, topOf } from '../core/surfaces.js';
import { player, state } from '../game/state.js';
import { containsXZ } from '../core/blockers.js';

export function cellAt(x, z) {
  const cx = Math.floor(x), cz = Math.floor(z);
  return inb(cx, cz) ? idx(cx, cz) : -1;
}
const pieceBottom = (p, top) => p.kind === 'bridge' ? top - 0.2 : p.base;

// A trial's crumbling crust (game/trials.js): floors that are gone for now (gone(floor) -> true)
// are not there for anything here, in the active cube; nor is a hole in Flip's box once it opened
// (`open`, game/flipworld.js)
let gone = null;
export const setGoneFloors = fn => { gone = fn; };
const here = (f, map = state.map) => !f.open && !(gone && f.crust && map === state.map && gone(f));
// is floor f of the active cube's crust gone for now?
export const goneNow = f => !!(gone && f.crust && gone(f));
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
const blockersAt = i => parts?.[i]?.length ? [...(state.map.blockers?.[i] || []), ...parts[i].filter(b => !b.off)] : state.map.blockers?.[i] || [];
const inPillar = (p, fx, fz) => fx >= p.x0 && fx <= p.x1 && fz >= p.z0 && fz <= p.z1;
// The platforms floating round Foggery's tower (game/movers.js): slabs that move, in the active
// cube. Each is a surface like a floor (flat, its top at y1, its underside at y0, from x0, z0
// to x1, z1), and one that carries what stands on it (`dx`, `dz`: how far it moved this frame,
// physics/move.js).
let movers = [];
export const setMovers = list => { movers = list; };
export const moversNow = () => movers;
const onMover = (m, x, z) => x >= m.x0 && x < m.x1 && z >= m.z0 && z < m.z1;
const local = (x, z) => [x - Math.floor(x), z - Math.floor(z)];

// highest walkable surface at (x,z) that is not above y+step: { h, s (floor or piece), i (cell) }
// map: the active cube's, or another one's (a neighbour across an open face)
export const groundAt = (x, z, y, step, map = state.map) => ground(x, z, y, step, map, true);
// ... but not the platforms: the ground that stays (what loot rests on, physics/rest.js)
export const stillGroundAt = (x, z, y, step, map = state.map) => ground(x, z, y, step, map, false);
function ground(x, z, y, step, map, moving) {
  const i = cellAt(x, z);
  if (i < 0) return { h: -Infinity, s: null, i };
  const [fx, fz] = local(x, z);
  let h = -Infinity, s = null;
  for (const f of map.cols[i]) { if (!here(f, map)) continue; const t = floorY(f, fx, fz); if (t <= y + step && t > h) { h = t; s = f; } }
  for (const p of map.pieces[i]) {
    if (p.kind === 'pillar') continue;
    const t = runY(p, fx, fz);
    if (t <= y + step && t > h) { h = t; s = p; }
  }
  if (moving && map === state.map) for (const m of movers) if (onMover(m, x, z) && m.y1 <= y + step && m.y1 > h) { h = m.y1; s = m; }
  return { h, s, i };
}

// does something solid occupy the body (between y+step and the head)?
// piecesOnly: inside our own cell only structures hanging overhead count; h: how tall the body
// is (physics/unstuck.js asks about its middle only)
export function blockedAt(x, z, y, step, piecesOnly = false, h = player.h) {
  const i = cellAt(x, z);
  if (i < 0) return true;
  const [fx, fz] = local(x, z), head = y + h;
  // Trees use trunk circles; town buildings use their rotated footprint boxes.
  for (const b of blockersAt(i)) if (containsXZ(b, x, z) && b.bottom < head && b.top > y + step) return true;
  if (!piecesOnly) for (const f of state.map.cols[i]) if (here(f) && floorY(f, fx, fz) > y + step && f.bottom * LH < head) return true;
  for (const p of state.map.pieces[i]) {
    if (p.kind === 'pillar') {
      if (inPillar(p, fx, fz) && p.bottom < head && p.top > y + step) return true;
      continue;
    }
    const t = runY(p, fx, fz), b = pieceBottom(p, t);
    if (piecesOnly ? b > y + 0.05 && b < head : t > y + step && b < head) return true;
  }
  for (const m of movers) if (onMover(m, x, z) && (piecesOnly ? m.y0 > y + 0.05 && m.y0 < head : m.y1 > y + step && m.y0 < head)) return true;
  return false;
}

// lowest underside of anything above height y at (x,z) (what a jump bumps into)
export function ceilingAt(x, z, y) {
  const i = cellAt(x, z);
  if (i < 0) return Infinity;
  const [fx, fz] = local(x, z);
  let c = Infinity;
  for (const b of blockersAt(i)) if (b.bottom > y && containsXZ(b, x, z)) c = Math.min(c, b.bottom);
  for (const f of state.map.cols[i]) if (here(f) && f.bottom * LH > y) c = Math.min(c, f.bottom * LH);
  for (const p of state.map.pieces[i]) {
    const b = p.kind === 'pillar' ? (inPillar(p, fx, fz) ? p.bottom : Infinity) : pieceBottom(p, runY(p, fx, fz));
    if (b > y) c = Math.min(c, b);
  }
  for (const m of movers) if (onMover(m, x, z) && m.y0 > y) c = Math.min(c, m.y0);
  return c;
}

// is the point inside solid matter? (ragdoll particles)
export function insideSolid(x, z, y) {
  const i = cellAt(x, z);
  if (i < 0) return true;
  for (const b of blockersAt(i)) if (y > b.bottom && y < b.top && containsXZ(b, x, z)) return true;
  const [fx, fz] = local(x, z);
  for (const f of state.map.cols[i]) if (here(f) && floorY(f, fx, fz) > y && f.bottom * LH < y) return true;
  for (const p of state.map.pieces[i]) {
    if (p.kind === 'pillar') { if (inPillar(p, fx, fz) && p.bottom < y && p.top > y) return true; continue; }
    const t = runY(p, fx, fz);
    if (t > y && pieceBottom(p, t) < y) return true;
  }
  for (const m of movers) if (onMover(m, x, z) && y > m.y0 && y < m.y1) return true;
  return false;
}

// the walkable top of the floor or structure whose solid contains (x, y, z): { h, s }, or
// null. Props do not count. Clicks on the ground and on cliff faces resolve to the top.
export function solidTop(x, z, y) {
  const i = cellAt(x, z);
  if (i < 0) return null;
  const [fx, fz] = local(x, z);
  let top = null;
  for (const f of state.map.cols[i]) { if (!here(f)) continue; const t = floorY(f, fx, fz); if (t > y && f.bottom * LH < y) top = { h: t, s: f }; }
  for (const p of state.map.pieces[i]) {
    if (p.kind === 'pillar') continue;
    const t = runY(p, fx, fz);
    if (t > y && pieceBottom(p, t) < y) top = { h: t, s: p };
  }
  for (const m of movers) if (onMover(m, x, z) && m.y1 > y && m.y0 < y) top = { h: m.y1, s: m };
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

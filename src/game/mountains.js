// Monteur's mountains in the active cube (core/mountains.js has the rules; render/mountains.js shows
// them; game/monteur.js pulls them up and brings them down, docs/bosses.md "Monteur"). Every game
// raises its own after the spec the Monteur here carries (his `mountain`, sent to friends with his
// row, net/protocol.js), or after the developer command's (/mountain, game/devcommands.js: no
// Monteur needed). The game that runs him moves the spec's clock on (core/mountains.js
// stepMountain); a friend's runs it on between his rows.
//
// The mountain's cells stay the cube's own floors: while it stands their corners and heights (and
// the links between them and to the ground beside it) are its, so the physics, the enemies' ways and
// the hero's (click to move) take it as floor like any other; once it is gone they are given back
// as they were. While it moves (rising, falling apart) nothing walks on or off it (the links to the
// ground are cut) and whoever stands on it rides along; up, its slopes join the ground and its
// ladders are there. Every change of its links puts a copy of the cube's map in state.map, so what is
// worked out once a map (the ladders' and the jumps' ways, the cutaway's heights) is worked out anew.
import { state, player } from './state.js';
import { LH, OPP } from '../core/constants.js';
import { floorY } from '../core/surfaces.js';
import { planMountain, freeCells, sunk, cornersAt, stepMountain, bringDown } from '../core/mountains.js';
import { cellAt, groundAt } from '../physics/collide.js';
import { findPath } from '../physics/enemynav.js';
import { findWay } from '../physics/playernav.js';
import { standY, walkerOf } from '../physics/dwell.js';
import { lootHere } from './loot.js';
import { order } from './orders.js';
import { buildMountainView, tickMountainView, disposeMountainView } from '../render/mountains.js';

// the mountain shown: { n, spec, plan (null: it did not fit), cube, world, base (the cube's map),
// saved (floor -> its corners, height and links without it), phase and t (as this game has it),
// applied (the phase its floors are set for), view }
let cur = null;
let dev = null;   // the developer command's spec (no Monteur)

// The developer command: a mountain of spec (`any`: on any open ground, not only a fight's) here
// (no Monteur needed); and that one brought down
export function devMountain(spec) { dev = spec; }
export function downMountain() { if (dev) bringDown(dev); }
export const mountainNow = () => cur?.plan ? { n: cur.n, phase: cur.phase, t: cur.t, shape: cur.spec.shape, cells: cur.plan.cells.size,
  ladders: cur.plan.ladders.length, top: Math.max(...[...cur.plan.cells.values()].map(m => m.top)) * LH } : null;
// the mountain's plan while it stands in this cube (core/mountains.js planMountain), else null
export const mountainPlan = () => cur?.plan && cur.applied ? cur.plan : null;

// One step: list are the enemies here (`own`: run by this game, which lifts them; a friend's are
// where the runner says)
export function updateMountains(list, dt, own = true) {
  if (dev && stepMountain(dev, dt) === 'gone') dev = null;
  const boss = list.find(e => e.boss === 'monteur' && e.mountain);
  const spec = boss?.mountain ?? dev;
  if (cur && (cur.cube !== state.cubeKey || cur.world !== state.world)) end();
  if (!spec || spec.phase === 'gone') { if (cur) end(); return; }
  if (!cur || cur.n !== spec.n) {
    if (cur) end();
    begin(spec);
  }
  if (!cur.plan) return;
  // its clock: the spec's (ours, or the runner's word, ours running on between)
  if (own || spec === dev || spec.phase !== cur.phase || Math.abs(cur.t - spec.t) > 0.35) { cur.phase = spec.phase; cur.t = spec.t; } else cur.t += dt;
  apply(own ? list : [], dt);
}
// gone at once, the floors as they were (a reset of the cube, a death, leaving it)
export function resetMountains() { if (cur) end(); dev = null; }

function begin(spec) {
  const base = state.map;
  const plan = base ? planMountain(base, spec, freeCells(base, !!spec.any)) : null;
  cur = { n: spec.n, spec, plan, cube: state.cubeKey, world: state.world, base, saved: null, phase: spec.phase, t: spec.t, applied: null,
    view: plan && state.world ? buildMountainView(plan, base, state.world) : null };
}
function end() {
  const c = cur;
  cur = null;
  if (c.saved) {
    for (const [f, s] of c.saved) { f.cs = s.cs; f.top = s.top; f.link = s.link; }
    if (state.map && state.cubeKey === c.cube && state.map !== c.base) state.map = c.base;
    if (state.cubeKey === c.cube) replan([]);
  }
  if (player.climb?.l?.mountain) player.climb = null;
  disposeMountainView(c.view);
}

// its floors (and the ground beside it, its links) as they are without it, kept to give back
function save() {
  const saved = new Map(), keep = f => { if (!saved.has(f)) saved.set(f, { cs: f.cs, top: f.top, link: f.link }); };
  for (const m of cur.plan.cells.values()) {
    keep(m.f);
    for (const g of m.f.link) if (g) keep(g);
    for (const l of m.link) if (l && !l.up) keep(l.f);
  }
  for (const f of saved.keys()) { f.cs = [...f.cs]; f.link = [...f.link]; }
  cur.saved = saved;
}
// Its links: `up` its slopes down onto the ground and the ground's onto it; else between its own
// cells only (it moves: nothing walks on or off it)
function setLinks(up) {
  const cells = cur.plan.cells;
  for (const [f, s] of cur.saved) if (!cells.has(f.c)) f.link = s.link.map(g => g && cells.has(g.c) ? null : g);
  for (const m of cells.values()) m.f.link = m.link.map((l, d) => {
    if (!l) return null;
    if (l.up) return l.f;
    if (!up) return null;
    l.f.link[OPP[d]] = m.f;
    return l.f;
  });
}
// state.map: a copy of the cube's map (with the mountain's ladders while it stands)
function remap(ladders) {
  state.map = { ...cur.base, ladders: ladders ? [...(cur.base.ladders ?? []), ...cur.plan.ladders] : cur.base.ladders, cutInfo: undefined };
}
// the ways planned over the links as they were: planned anew (the enemies' and the hero's)
function replan(list) {
  for (const e of list) e.path = null;
  if (order.walk) order.walk.replan = true;
}

function apply(list, dt) {
  const want = cur.phase;
  if (cur.applied !== want) {
    if (want !== 'crack' && !cur.saved) save();
    if (want !== 'crack') {
      setLinks(want === 'up');
      remap(want === 'up');
      replan(list);
      if (want === 'fall' && player.climb?.l?.mountain) player.climb = null;   // (its ladder goes: they drop off)
    }
    cur.applied = want;
  }
  const s = sunk(cur.plan, want, cur.t);
  if (want !== 'crack') heights(s, list);
  tickMountainView(cur.view, want, cur.t, s, dt);
}

// its cells' floors `s` under its height, and who stands on them carried along
function heights(s, list) {
  const cells = cur.plan.cells, under = cells.get(cellAt(player.x, player.z));
  const at = f => floorY(f, player.x - f.x, player.z - f.z), before = under ? at(under.f) : 0;
  for (const m of cells.values()) {
    const cs = cornersAt(m, s);
    for (let k = 0; k < 4; k++) m.f.cs[k] = cs[k];
    m.f.top = Math.max(m.baseTop, Math.round(m.top - s / LH));
  }
  // the hero over it (standing, or in the air): up with it as it rises past their feet; down
  // they come by themselves (physics/move.js)
  if (under && !player.climb && !player.ragdoll && before <= player.y + 0.05) {
    const y = at(under.f);
    if (y > player.y) { player.y = y; if (player.vy < 0) player.vy = 0; }
  }
  // the enemies (those this game runs): on its floors, at its height
  for (const e of list) {
    if (!e.f || !cells.has(e.f.c) || e.drop || e.riding || e.deck) continue;
    e.y = standY(e.profile, e.f, e.x, e.z);
  }
  // the loot lying on it
  for (const p of lootHere()) {
    if (p.fly || p.carried) continue;
    const m = cells.get(cellAt(p.x, p.z));
    if (!m) continue;
    const y = floorY(m.f, p.x - m.f.x, p.z - m.f.z);
    if (y > p.y) { p.y = y; delete p.vy; }
  }
}

// The floor (or stair, bridge, landing) body b stands or lies on (null: none, in the air, on a ladder)
function floorUnder(b) {
  if (b === player && (player.climb || (!player.grounded && !player.ragdoll))) return null;
  const g = b === player && player.grounded && player.support ? { s: player.support, h: player.y } : groundAt(b.x, b.z, b.y + 0.2, 0);
  return g.s && !g.s.mover && g.s.kind !== 'pillar' && Math.abs(g.h - b.y) < 0.4 ? g.s : null;
}
// Are Monteur e and body b on the mountain (one of them, or both) with no way between them for
// whoever has to come to the other (core/mountains.js MOUNTAIN.apart)? Up higher than him, he
// would have to walk up to them (he climbs no ladders, jumps up nothing); else they could come to
// him, climbing and jumping too (a friend's body: walking only).
export function mountainApart(e, b) {
  const plan = mountainPlan();
  if (!plan || cur.applied !== 'up' || !e.f) return false;
  const P = floorUnder(b), B = e.f;
  if (!P) return false;
  const on = f => plan.cells.has(f.c) && plan.cells.get(f.c).h > 0;
  if (!on(P) && !on(B)) return false;
  if (findPath(B, P, 48, walkerOf(e))) return false;
  if (P.top > B.top + 2) return true;
  if (b !== player) return true;
  const way = findWay(P, B, { x: e.x, y: e.y, z: e.z });
  return way.path.at(-1) !== B;
}

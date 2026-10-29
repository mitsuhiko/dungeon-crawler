// The world Flip turns (core/flip.js has the rules, docs/bosses.md tells it): his box, the way it
// is turned now, and what turning it does. Every game turns its own world after the Flip it runs
// or is shown (net/foes.js): his `orient` (the orientation he wants, an index into core/flip.js
// ORIENTS) and `turns` (how many times he turned it) say when and where to; his `holes` are the
// black holes he has open.
//
// A turn: the box (render/flipview.js) turns about its middle a quarter (or half) round, and
// everything in it turns with it: the player (carried, no steering: `player.flipping`), the
// enemies (frozen), the loot. Then the physics takes the box as it stands now (state.map: the
// floors of the box turned, core/flip.js orientedFloors; the unturned box is the cube's own map).
// The enemies drop onto clear spots of the new floor (ones their bodies fit on), and Flip's
// tractor beam carries the player to one, unhurt (upside down: onto the island); in phase 2 a
// black hole takes the player through the turn instead and lets them out there. The
// holes in the side that is down are shut while anyone falls (they are floors then) and crack
// open a moment after the player is down (`open` on their floors: nothing stands on them).
// Falling out through one hurts and puts the player back where they last stood (physics/hazards.js).
// A black hole pulls the player in (player.pull, physics/move.js) and swallows them when they get
// to its middle: gone (`player.vanished`) until the world has turned, then out of another black
// hole somewhere else (on the game that runs him: he turns the world for it, game/flip.js; on a
// friend's, after a moment, without a turn).
import { N, GRAV, LH } from '../core/constants.js';
import { FLIP_FIGHT as G, IDENTITY, ORIENTS, mul, transpose, apply, orientKey, rotation, turnPoint, downFace, orientedFloors, brokenWalls, MID, FACES, GROUP } from '../core/flip.js';
import { takeDamage } from '../core/progression.js';
import { player, state, setStatus } from './state.js';
import { attackOf } from '../core/enemies.js';
import { groundAt, insideSolid } from '../physics/collide.js';
import { groundY } from '../physics/enemynav.js';
import { respawnPoint } from '../physics/respawn.js';
import { clearProjectiles } from './projectiles.js';
import { lootHere } from './loot.js';
import { cameraKick } from './juice.js';
import { flash } from './hud.js';
import { hurt } from './flow.js';
import { sfx } from '../audio/sfx.js';
import { turnBox, showCovers, drawBlackHoles, beamFx, drawTractor, holesOpenFx, landFx, breakWalls, restoreWalls } from '../render/flipview.js';
import { fitting } from './bossfight.js';
import { msg, tr } from '../i18n/i18n.js';

let w = null;
const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const isFlip = e => e.boss === 'flip';

// the floors of the box turned by O, as the cube's map (the unturned box is the cube's own map)
function orientedMap(base, O) {
  const key = orientKey(O);
  if (key === orientKey(IDENTITY)) return base;
  let m = w.maps.get(key);
  if (!m) w.maps.set(key, m = turnedMap(base, O));
  return m;
}
// ... with the cells `removed` gone (the walls broken open; not kept)
function turnedMap(base, O, removed = null) {
  const key = orientKey(O), up = key === orientKey(IDENTITY);
  const { cols, floors, down } = orientedFloors(base.flip, O, removed), empty = Array.from({ length: N * N }, () => []);
  const g = base.guardian, at = g && turnPoint(O, g.x, g.y, g.z);
  const near = at && floors.filter(f => f.encounter && f.hole === undefined)
    .sort((a, b) => Math.hypot(a.x + 0.5 - at.x, a.z + 0.5 - at.z) - Math.hypot(b.x + 0.5 - at.x, b.z + 0.5 - at.z))[0];
  return { ...base, cols, floors, cutInfo: undefined, pieces: Array.from({ length: N * N }, () => []), runs: [], falls: [], ladders: [],
    fences: new Map(), fenceList: [], portals: [], moves: [], routes: [], blockers: empty, staticBlockers: empty,
    safe: Uint8Array.from(floors, f => f.encounter && f.hole === undefined ? 1 : 0),
    guardian: g && near && !up ? { ...g, floor: near, x: near.x + 0.5, z: near.z + 0.5, y: near.top * LH } : g, flipDown: down, flipKey: up ? undefined : key,
    // (unturned, broken open: the cube's own portals, on the floors as they are now)
    ...(up && { portals: base.portals.map(p => ({ ...p, floor: cols[p.z * N + p.x][0] })), moves: base.moves, routes: base.routes,
      staticBlockers: base.staticBlockers, blockers: base.blockers }) };
}

// the box of this cube, as it was built, when the cube (its world) is new
function sync() {
  if (!state.map || !state.world) { w = null; return null; }
  if (w && w.world === state.world) return w;
  if (!state.map.flip) { w = null; return null; }
  w = { world: state.world, base: state.map, O: IDENTITY, maps: new Map(), turn: null, fall: null, holes: null, seen: new Map(),
    exits: [], limbo: null, swallowedBy: null };
  turnBox(state.world, IDENTITY);
  showCovers(state.world, null, 0);
  return w;
}
// the box unturned again (a death, the fight reset): at once
export function resetFlipWorld() {
  if (!w) return;
  for (const l of w.turn?.loot ?? []) delete l.p.carried;   // (where the turn left it: it settles, game/loot.js)
  if (w.world === state.world && state.map !== w.base) state.map = w.base;
  if (w.world === state.world) { restoreWalls(w.world); turnBox(w.world, IDENTITY); showCovers(w.world, null, 0); }
  if (player.flipping) { player.flipping = null; player.vanished = false; }
  drawTractor(null);
  state.void = 0;
  w = null;
}
// the side that is down now (null: no box here)
export const downNow = () => w ? downFace(w.O) : null;
export const turning = () => !!w?.turn;

// one step (game/enemies.js), with the enemies this game runs (`own`: false for those it is shown)
export function updateFlipWorld(list, dt, own = true) {
  if (!sync()) { state.void = 0; return; }
  const boss = list.find(isFlip);
  if (boss) {
    const seen = w.seen.get(boss.id);
    if (seen === undefined) { w.seen.set(boss.id, boss.turns ?? 0); if (boss.orient) snap(ORIENTS[boss.orient]); }
    else if ((boss.turns ?? 0) !== seen) {
      w.seen.set(boss.id, boss.turns ?? 0);
      if (w.turn) endTurn(own ? list : []);
      startTurn(ORIENTS[boss.orient ?? 0], boss, own ? list : []);
    }
  }
  if (w.turn) stepTurn(dt, own ? list : []);
  else {
    if (w.beam) stepBeam(dt);
    if (w.fall) stepFall(dt);
    strays(dt, boss);
  }
  stepHoles(dt, list, own);
  dropBodies(own ? list : [], dt);
  // the fight starts: the walls break open (as after every turn); he winds up a flip: they are
  // put back together before the world turns
  if (!w.started && boss && (boss.mode === 'chase' || boss.mode === 'attack') && !w.turn && !w.fall) { w.started = true; breakOpen(list, own); }
  if (w.removed && boss?.mode === 'attack' && attackOf(boss).cast === 'flip' && !w.turn) rebuild(list, own);
  // he is dead: the walls fly back together and stay (and the box goes on as a cube like any other)
  const alive = !!boss && boss.mode !== 'dead';
  if (!alive && w.removed && !w.turn) rebuild(list, own);
  // while the fight goes on the world round the box goes: the neighbours fade, the sky goes black
  // (render/look.js, render/neighbors.js, main.js)
  state.void = alive && w.started ? 1 : 0;
}

// --- the walls broken open ------------------------------------------------------------------------
// When the holes of the side down burst (and when the fight starts) the walls round the floor
// break open: all of them but a parapet two cells high over the floor, a frame round the edges and
// the wall round the balcony's foot, in big pieces flying off (render/flipview.js, core/flip.js
// brokenWalls), so that little hides the fight. When he winds up his flip (or a black hole has the
// player) they fly back together, before the world turns.
function breakOpen(list, own) {
  const boss = list.find(isFlip);
  if (!boss || boss.mode === 'dead') return;   // (beaten: the box stays whole)
  const O = w.O, flip = w.base.flip, fight = state.map.floors.filter(f => f.encounter);
  const { faces, removed } = brokenWalls(flip, O, fight.length ? Math.min(...fight.map(f => f.top)) * LH : 0);
  if (!removed.size) return;
  // the floors without them (the holes as they are)
  const open = new Set(state.map.floors.filter(f => f.hole !== undefined && f.open).map(f => f.hole));
  state.map = turnedMap(w.base, O, removed);
  for (const f of state.map.floors) if (open.has(f.hole)) f.open = true;
  w.removed = removed;
  if (own) remap(list);
  const out = {};
  for (const f of faces) out[GROUP[f]] = FACES[f];   // (out of the side, in the box's own frame)
  breakWalls(w.world, removed, out, apply(transpose(O), [0, -1, 0]));
}
// the walls whole again (flying back together), the floors with them
function rebuild(list, own) {
  if (!w.removed) return;
  w.removed = null;
  restoreWalls(w.world, true);
  state.map = orientedMap(w.base, w.O);
  if (own) remap(list);
}
// what stood on a floor of the map before stands on the same floor of this one (or falls)
function remap(list) {
  for (const e of list) {
    if (!e.f || e.mode === 'dead') continue;
    const f = state.map.cols[e.f.c]?.find(g => g.top === e.f.top);
    if (f) Object.assign(e, { f, home: f, path: null, seen: null });
    else { const g = groundAt(e.x, e.z, e.y, 0); if (g.s) Object.assign(e, { f: g.s, home: g.s, path: null, drop: { vy: 0 } }); else e.drop = { vy: 0, out: !e.boss }; }
  }
}
// the black holes (after the gusts: they set the player's pull anew every frame, game/gusts.js)
export function updateBlackHoles(list, dt, own = true) {
  if (w) blackHoles(list.find(isFlip), dt, own);
}

// at once, no turn (a friend's world we come into turned)
function snap(O) {
  w.O = O; state.map = orientedMap(w.base, O); turnBox(w.world, O); showCovers(w.world, downFace(O), 0);
}

function startTurn(O, boss, list) {
  const R = mul(O, transpose(w.O));
  let found = null;
  for (const axis of ['x', 'z']) for (const q of [1, -1, 2]) if (!found && orientKey(rotation(axis, q)) === orientKey(R)) found = { axis, q };
  if (!found) { snap(O); return; }
  if (player.flipping?.kind === 'beam') player.flipping = null;   // (a turn while the beam still had them)
  if (player.rescue) { player.rescue = null; player.vanished = false; }   // (... or the robot: the turn has them now, game/rescue.js)
  const gentle = boss.mode === 'dead', carry = !player.flipping && player.hp > 0;
  if (carry) {
    Object.assign(player, { ragdoll: null, getUp: null, held: null, climb: null, gust: null, pull: null, stun: 0, vx: 0, vy: 0, vz: 0 });
    player.flipping = { kind: 'turn' };
    // (a body tumbling as a ragdoll may lie half in a wall: out onto the floor first)
    if (insideSolid(player.x, player.z, player.y + 0.3)) Object.assign(player, respawnPoint(player.safe ?? player));
    // in phase 2 a black hole takes the player through the turn instead of the beam
    if (!gentle && (boss.stage ?? 1) >= 2) {
      w.exits.push({ x: player.x, y: player.y, z: player.z, t: 0 });
      Object.assign(player, { flipping: { kind: 'limbo' }, vanished: true });
      w.limbo = { t: 0, turns: boss.turns ?? 0, waits: false, transport: true, to: null };
      sfx('wellDown', { at: player, pitch: 0.7 });
    }
  }
  clearProjectiles();
  const bodies = list.filter(e => e.mode !== 'gone').map(e => ({ e, x: e.x, y: e.y, z: e.z }));
  w.turn = { from: w.O, to: O, axis: found.axis, q: found.q, t: 0, dur: Math.abs(found.q) === 2 ? G.turnHalf : G.turn,
    carry: player.flipping?.kind === 'turn', p: { x: player.x, y: player.y, z: player.z }, bodies, gentle,
    loot: lootHere().map(p => { p.carried = true; return { p, x: p.x, y: p.y, z: p.z }; }) };   // (carried: it does not settle meanwhile, game/loot.js)
  w.fall = null; w.holes = null; w.beam = null;
  if (w.removed) rebuild(list, list.length > 0);   // (the box whole again for the turn: a black hole's)
  showCovers(w.world, null, 0);
  sfx('flip', { at: player });
  if (!gentle) setStatus(Math.abs(found.q) === 2 ? tr('Flip turns the world upside down!') : tr('Flip flips the world!'));
}

// a point turned about the middle of the box by angle a about the axis
function turned(axis, a, x, y, z) {
  const c = Math.cos(a), s = Math.sin(a), px = x - MID, py = y - MID, pz = z - MID;
  return axis === 'x' ? { x, y: c * py - s * pz + MID, z: s * py + c * pz + MID } : { x: c * px - s * py + MID, y: s * px + c * py + MID, z };
}
function stepTurn(dt, list) {
  const t = w.turn;
  t.t += dt;
  const k = ease(t.t / t.dur), a = t.q * Math.PI / 2 * k;
  turnBox(w.world, t.from, t.axis, a, k);
  if (t.carry && player.flipping?.kind === 'turn') {
    const p = turned(t.axis, a, t.p.x, t.p.y, t.p.z);
    Object.assign(player, { x: p.x, y: p.y, z: p.z, visY: p.y, vx: 0, vy: 0, vz: 0, grounded: false });
  }
  for (const b of t.bodies) {
    const p = turned(t.axis, a, b.x, b.y, b.z);
    Object.assign(b.e, { x: p.x, y: p.y, z: p.z, speed: 0, path: null, stun: Math.max(b.e.stun || 0, 0.3) });
  }
  for (const l of t.loot) Object.assign(l.p, turned(t.axis, a, l.x, l.y, l.z));
  if (Math.random() < dt * 6) cameraKick(Math.random() - 0.5, Math.random() - 0.5, 0.05, 0.02);
  if (t.t >= t.dur) endTurn(list);
}

const PLAYER_BODY = { radius: 0.35, height: 0.9 };
// A clear spot on the fight's floors for a body of kind `kind` near (x, y, z): one it fits on
// (not in the walls or under a ledge, bossfight.js fitting), not a hole or a stair, clear of the
// bodies `others` ({ x, z, r }) and at least `away` cells from `from` (if given)
function clearSpot(kind, x, y, z, others, from = null, away = 0, only = null) {
  const r = kind.radius ?? 0.3;
  return fitting(kind).filter(f => f.hole === undefined && !f.stair && !f.open && (!only || only(f))
    && others.every(o => Math.hypot(o.x - f.x - 0.5, o.z - f.z - 0.5) > o.r + r + 0.3)
    && (!from || Math.hypot(from.x - f.x - 0.5, from.z - f.z - 0.5) >= away))
    .map(f => ({ f, d: Math.hypot(f.x + 0.5 - x, f.z + 0.5 - z) + Math.abs(f.top * LH - y) * 0.3 }))
    .sort((p, q) => p.d - q.d)[0]?.f ?? null;
}

function endTurn(list) {
  const t = w.turn;
  w.turn = null;
  w.O = t.to;
  state.map = orientedMap(w.base, t.to);
  for (const f of state.map.floors) if (f.hole !== undefined) f.open = false;   // (shut again, for the fall)
  turnBox(w.world, t.to);
  const down = downFace(t.to), R = mul(t.to, transpose(t.from));
  // Now and then the fight goes on up on the balcony of the side down (he and the player; the
  // rest wherever they come down)
  const ledge = !t.gentle && Math.random() < G.balcony && state.map.floors.filter(f => f.shelf && !f.stair && f.encounter).length >= 12 ? f => f.shelf : null;
  // The enemies, where the turn took them, onto clear spots of the new floor (he first; upside
  // down that is the island): frozen till they land. A minion with nowhere to go is lost.
  const placed = [];
  for (const b of [...t.bodies].sort((p, q) => (q.e.boss ? 1 : 0) - (p.e.boss ? 1 : 0))) {
    const e = b.e, p = turnPoint(R, b.x, b.y, b.z);
    Object.assign(e, p);
    e.seen = null;   // (where it saw the player is in the old floors)
    if (e.mode === 'dead') {
      const g = groundAt(e.x, e.z, e.y + 0.2, 0);
      if (g.s) Object.assign(e, { f: g.s, drop: { vy: 0 } }); else e.drop = { vy: 0, out: true };
      continue;
    }
    const f = (e.boss && ledge && clearSpot(e.profile, p.x, p.y, p.z, placed, null, 0, ledge)) || clearSpot(e.profile, p.x, p.y, p.z, placed);
    if (!f) { e.drop = { vy: 0, out: true }; continue; }
    Object.assign(e, { f, home: f, x: f.x + 0.5, z: f.z + 0.5, y: Math.max(p.y, f.top * LH), path: null, drop: { vy: 0 } });
    placed.push({ x: e.x, z: e.z, r: e.profile.radius });
  }
  // The player: Flip's tractor beam carries them from where the turn took them to a clear spot
  // on the new floor (upside down: on the island), away from him; nothing hurts them meanwhile.
  // (In phase 2 the black hole took them: they come out of another at that spot.)
  const boss = t.bodies.find(b => b.e.boss)?.e;
  const at = t.carry || w.limbo?.transport ? turnPoint(R, t.p.x, t.p.y, t.p.z) : null;
  const to = at && ((ledge && clearSpot(PLAYER_BODY, at.x, at.y, at.z, placed, boss, 2.2, ledge))
    ?? clearSpot(PLAYER_BODY, at.x, at.y, at.z, placed, boss, 2.5) ?? clearSpot(PLAYER_BODY, at.x, at.y, at.z, []));
  if (ledge && to?.shelf) setStatus(tr('Up on the balcony!'));
  if (t.carry && player.flipping?.kind === 'turn') {
    Object.assign(player, { x: at.x, y: at.y, z: at.z, visY: at.y, vx: 0, vy: 0, vz: 0, grounded: false, support: null });
    if (to) beamTo(to, boss); else player.flipping = null;
  }
  if (w.limbo?.transport && to) w.limbo.to = to;
  // the loot onto the floor under it
  for (const l of t.loot) {
    const p = turnPoint(R, l.x, l.y, l.z), g = groundAt(p.x, p.z, p.y + 0.2, 0);
    const f = Number.isFinite(g.h) ? null : landing(player.x, player.z, 0);
    Object.assign(l.p, f ? { x: f.x + 0.5, y: f.top * LH, z: f.z + 0.5 } : { x: p.x, y: g.h, z: p.z });
    delete l.p.carried;
  }
  w.fall = { t: 0, landed: false };
  w.holes = { phase: 'shut', t: 0 };
  showCovers(w.world, down, 1);
  cameraKick(0, 0, 0, -0.12);
}

// a floor of the fight to land on near (x, z): `inward` cells in from the edge of what there is
function landing(x, z, inward) {
  const list = state.map.floors.filter(f => f.encounter && f.hole === undefined);
  const inner = list.filter(f => f.link.filter(Boolean).length === 4 || inward === 0);
  const pool = inward && inner.length ? inner : list;
  return pool.sort((a, b) => Math.hypot(a.x + 0.5 - x, a.z + 0.5 - z) - Math.hypot(b.x + 0.5 - x, b.z + 0.5 - z))[0] ?? null;
}

// Flip's tractor beam takes the player from where they are to floor `to`, unhurt
function beamTo(to, boss) {
  const end = { x: to.x + 0.5, y: to.top * LH, z: to.z + 0.5 }, d = Math.hypot(end.x - player.x, end.y - player.y, end.z - player.z);
  Object.assign(player, { flipping: { kind: 'beam' }, ragdoll: null, getUp: null, held: null, pull: null, gust: null });
  w.beam = { from: { x: player.x, y: player.y, z: player.z }, to: end, t: 0, dur: Math.min(1.8, 0.6 + d / G.beam), boss };
}
// One who stands off the fight's floors (knocked onto a ledge, a wall's top: out of his reach,
// and maybe with nowhere to go) is pulled back into it by the beam after a moment
function strays(dt, boss) {
  const s = player.support;
  if (!boss || boss.mode === 'dead' || w.turn || w.beam || player.flipping || !player.grounded || player.hp <= 0 || !s || s.kind || s.encounter) { w.stray = 0; return; }
  if ((w.stray = (w.stray ?? 0) + dt) < G.stray) return;
  w.stray = 0;
  const to = clearSpot(PLAYER_BODY, player.x, player.y, player.z, [], boss, 2.5) ?? clearSpot(PLAYER_BODY, player.x, player.y, player.z, []);
  if (!to) return;
  beamTo(to, boss);
  setStatus(tr('Flip pulls you back into the fight!'));
}
// The beam carries the player over to their spot (rising a little on the way) and sets them down
function stepBeam(dt) {
  const b = w.beam;
  if (b && player.flipping?.kind === 'beam') {
    b.t += dt;
    const k = ease(b.t / b.dur), lift = Math.sin(Math.PI * k) * 0.8;
    Object.assign(player, { x: b.from.x + (b.to.x - b.from.x) * k, z: b.from.z + (b.to.z - b.from.z) * k,
      y: b.from.y + (b.to.y - b.from.y) * k + lift, vx: 0, vy: 0, vz: 0, grounded: false });
    player.visY = player.y;
    beamFx(player, dt);
    drawTractor(b.boss && b.boss.mode !== 'dead' ? b.boss : null, player);
    if (b.t >= b.dur) {
      Object.assign(player, { ...b.to, visY: b.to.y, grounded: true, flipping: null, support: null });
      w.beam = null; drawTractor(null);
      state.enemyGrace = Math.max(state.enemyGrace, G.grace);   // (a moment to find one's feet)
    }
  } else if (b) { w.beam = null; drawTractor(null); }
}
// After a turn: once the player is down, the holes open a moment later
function stepFall(dt) {
  const f = w.fall;
  f.t += dt;
  if (!f.landed && !player.flipping && (player.grounded || player.ragdoll || f.t > 5)) {
    f.landed = true;
    landFx(player);
    // where to come back to after a fall out through a hole: the floor landed on (one of the fight's)
    const g = groundAt(player.x, player.z, player.y + 0.2, 0), back = landing(player.x, player.z, 0);
    player.safe = g.s && g.s.hole === undefined && g.s.encounter ? { x: player.x, y: g.h, z: player.z }
      : back ? { x: back.x + 0.5, y: back.top * LH, z: back.z + 0.5 } : respawnPoint({ x: player.x, y: player.y, z: player.z });
  }
  if (f.landed && w.holes.phase === 'shut') w.holes = { phase: 'wait', t: 0 };
  if (f.landed && f.t > 0.5) w.fall = null;
}
function stepHoles(dt, list, own) {
  const h = w.holes;
  if (!h || h.phase === 'shut' || h.phase === 'open') return;
  h.t += dt;
  if (h.phase === 'wait' && h.t >= G.holes.delay) { h.phase = 'crack'; h.t = 0; showCovers(w.world, downNow(), 2); sfx('icecrack', { at: player, pitch: 0.6 }); }
  else if (h.phase === 'crack' && h.t >= G.holes.crack) {
    h.phase = 'open';
    const opened = state.map.floors.filter(f => f.hole !== undefined);
    for (const f of opened) f.open = true;
    showCovers(w.world, downNow(), 3);
    holesOpenFx(opened);
    breakOpen(list, own);
    // who stands on one falls out (he floats: over to the floor beside it)
    if (own) for (const e of list) if (e.mode !== 'dead' && e.f?.open) {
      if (!e.boss) { e.drop = { vy: 0, out: true }; continue; }
      const f = landing(e.x, e.z, 0);
      if (f) Object.assign(e, { f, home: f, x: f.x + 0.5, z: f.z + 0.5, y: f.top * LH, path: null });
    }
  }
}
// the enemies falling after a turn (frozen till they land); one falling out is lost (no reward)
function dropBodies(list, dt) {
  for (const e of list) {
    if (!e.drop) continue;
    e.drop.vy -= GRAV * dt; e.y += e.drop.vy * dt; e.stun = Math.max(e.stun || 0, 0.1); e.speed = 0;
    if (e.drop.out) {
      if (e.y < -3) { e.drop = null; if (e.mode !== 'dead') Object.assign(e, { noReward: true, hp: 0, mode: 'dead', deadT: e.profile.deathTime, path: null }); }
      continue;
    }
    const ground = groundY(e.f, e.x, e.z);
    if (e.y <= ground) { e.y = ground; e.drop = null; if (e.mode !== 'dead') sfx('thud', { at: e, volume: 0.5 }); }
  }
}

// --- black holes ---------------------------------------------------------------------------------
// the boss's holes pull the player in; one that gets to the middle swallows them
function blackHoles(boss, dt, own) {
  const holes = boss?.mode !== 'dead' ? boss?.holes ?? [] : [];
  drawBlackHoles(holes, w.exits, dt);
  w.exits = w.exits.filter(x => (x.t += dt) < G.hole.emerge);
  if (w.limbo) { limbo(boss, dt, own); return; }
  if (!holes.length || player.hp <= 0 || player.flipping || player.ragdoll || player.held) return;
  // the nearest open one pulls
  const H = G.hole, near = holes.filter(h => h.t >= H.open && !h.gone && Math.abs(h.y - player.y) < 1.5)
    .map(h => ({ h, d: Math.hypot(h.x - player.x, h.z - player.z) })).sort((a, b) => a.d - b.d)[0];
  if (!near || near.d > H.range) return;
  const { h, d } = near, dx = h.x - player.x, dz = h.z - player.z;
  if (d < H.swallow) { swallow(boss, h, own); return; }
  const k = 1 - d / H.range, speed = H.pull[0] + (H.pull[1] - H.pull[0]) * k * k;
  player.pull = { ux: dx / d, uz: dz / d, speed, hold: H.hold, room: Math.max(0, d - H.swallow * 0.5) };
}
function swallow(boss, h, own) {
  h.gone = true;
  const damage = Math.round(boss.profile.damage * G.hole.damage);
  sfx('wellDown', { at: h, pitch: 0.7 });
  takeDamage(player, damage, state.time); flash();
  player.lastHurt = { reason: msg('Swallowed by a black hole!'), by: null };
  if (player.hp <= 0) { hurt(0, 'Swallowed by a black hole!'); return; }
  Object.assign(player, { flipping: { kind: 'limbo' }, vanished: true, vx: 0, vy: 0, vz: 0, pull: null });
  setStatus(tr('Swallowed by a black hole!'));
  // the game that runs him turns the world for it (game/flip.js); a friend's lets them out again
  w.limbo = { t: 0, turns: boss.turns ?? 0, waits: own && !!w.base.flip && !!boss.swallowed };
  if (w.limbo.waits) boss.swallowed(h);
}
function limbo(boss, dt) {
  const l = w.limbo;
  l.t += dt;
  // after the turn (and a moment), or a moment without one
  const ready = !w.turn && (l.waits ? (boss?.turns ?? 0) !== l.turns && l.t > G.hole.limbo : l.t > (l.transport ? 0.3 : G.hole.limbo));
  if (!ready && !(boss?.mode === 'dead' && !w.turn) && l.t < 8) return;
  w.limbo = null;
  // out of another black hole: where the turn took them (phase 2's flip), else away from him
  const far = state.map.floors.filter(f => f.encounter && f.hole === undefined && !f.stair && f.link.filter(Boolean).length === 4
    && (!boss || Math.hypot(f.x + 0.5 - boss.x, f.z + 0.5 - boss.z) > 4));
  const f = l.to ?? far[Math.floor(Math.random() * far.length)] ?? landing(MID, MID, 1);
  if (!f) return;
  const y = f.top * LH;
  Object.assign(player, { x: f.x + 0.5, z: f.z + 0.5, y: y + 0.1, visY: y + 0.1, vx: 0, vy: 4.5, vz: 0, grounded: false, flipping: null, vanished: false, support: null });
  state.enemyGrace = Math.max(state.enemyGrace, G.grace);
  player.safe = { x: f.x + 0.5, y, z: f.z + 0.5 };
  w.exits.push({ x: f.x + 0.5, y, z: f.z + 0.5, t: 0 });
  sfx('ringUp', { at: player, pitch: 0.8 });
  setStatus(tr('Spat out of a black hole!'));
}

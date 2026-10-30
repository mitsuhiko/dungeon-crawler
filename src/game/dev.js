// Debug tools, only with ?dev in the URL:
//   click a portal: take it            G: go to the nearest way down on this depth
//   H: try this depth's wild horde
//   PageDown / PageUp: go down / up a depth right away (finding the well / ring first)
//   Alt + WASD / arrows: go to the adjacent cube on that side of the screen (only one there is)
// None of them wait for guardians: locked portals are taken anyway (the gate stays locked).
// The console's developer commands (game/devcommands.js: /find, /goto, /where, /horde, /arena) do
// the same, and more: /goto a depth, a cube on it, a spot in that cube (goPlace).
import { BOSS_ARENAS, BOSSES, bossAt } from '../core/bosses.js';
import { guardianId } from '../core/guardians.js';
import { ENEMY_KINDS, guardianLevel } from '../core/enemies.js';
import { xpForLevel, levelFromXP, fullHealth } from '../core/progression.js';
import { testRoomKey, isTestRoom } from '../world/testrooms.js';
import * as THREE from 'three';
import { camera, renderer } from '../render/scene.js';
import { step, key, parse } from '../world/coords.js';
import { groundAt } from '../physics/collide.js';
import { isInterior } from '../world/town.js';
import { boundaryArrival } from '../core/boundaries.js';
import { state, player, view, setStatus, worldLevel } from './state.js';
import { whenReady } from './hud.js';
import { startTravel } from './travel.js';
import { enterCube, arrivalPoint, spawnAt } from './flow.js';
import { LH, DIRS } from '../core/constants.js';
import { clearMouseInput } from './orders.js';
import { takeTownPortal } from './townportal.js';
import { shaftOf } from '../world/heights.js';
import { TRIALS } from '../core/trials.js';
import { MAX_DEPTH } from '../themes/depth.js';

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
const D = [[1, 0], [-1, 0], [0, 1], [0, -1]], NAMES = ['east', 'west', 'south', 'north'];

export function takePortal(q) {
  if (state.transitioning || state.inventoryOpen || q.kind === 'spawn') return;
  if (q.kind === 'town') { takeTownPortal(); return; }
  clearMouseInput();
  const [x, z] = q.kind === 'side' ? [q.x + 0.5 + D[q.dir][0] * 0.3, q.z + 0.5 + D[q.dir][1] * 0.3] : [q.x + 0.5, q.z + 0.5];
  Object.assign(player, { x, z, y: q.y, visY: q.y, vx: 0, vy: 0, vz: 0, grounded: true, ragdoll: null });
  startTravel(q, { force: true });
}

function portalAt(e) {
  if (state.inventoryOpen || !state.world || e.target !== renderer.domElement) return null;
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(state.world.portalFx.map(f => f.obj), true)[0];
  for (let o = hit?.object; o; o = o.parent) if (o.userData.portal) return o.userData.portal;
  return null;
}

// breadth-first through the portals of this depth until a cube with a `kind` portal turns up
async function findCube(kind) {
  const seen = new Set([state.cubeKey]), queue = [state.cubeKey];
  while (queue.length && seen.size < 120) {
    const k = queue.shift(), c = await state.cubes.map(k);
    if (c.map.portals.some(p => p.kind === kind)) return c;
    c.info.faces.forEach((f, d) => {
      const n = step(k, d);
      if (d < 4 && f?.portal && !seen.has(n)) { seen.add(n); queue.push(n); }
    });
  }
  return null;
}

// to the nearest way `kind` ('up' or 'down') on this depth: take it, or stand next to it
export async function goTo(kind, take) {
  if (state.transitioning || state.inventoryOpen) return;
  clearMouseInput();
  state.transitioning = true;
  const c = await whenReady(findCube(kind)).catch(() => null);
  state.transitioning = false;
  if (!c) { setStatus(`No way ${kind} found on this depth`); return; }
  if (c.key !== state.cubeKey) enterCube(c, c.map.portals.find(p => p.kind !== 'spawn')?.dir ?? null);
  const q = state.map.portals.find(p => p.kind === kind);
  if (take) { takePortal(q); return; }
  const a = arrivalPoint(q);
  spawnAt(a.x, a.y, a.z);
  setStatus(`Next to the way ${kind}`);
}

// Jump to a real worker-generated encounter for playtesting, without changing the run.
export async function goHorde(depth = state.map?.depth ?? 0) {
  if (state.transitioning || state.inventoryOpen) return;
  if (!Number.isInteger(depth) || depth < 0 || depth > 20) throw new RangeError('Invalid horde depth');
  const cubes = state.cubes, key = cubes.layout(depth).hordes.keys().next().value;
  clearMouseInput(); state.transitioning = true;
  try {
    const c = await whenReady(cubes.get(key));
    if (state.cubes !== cubes) return;
    enterCube(c, c.map.portals[0].dir);
    setStatus(`Wild horde · depth ${depth} · ${c.map.horde.count} enemies`);
  } finally { if (state.cubes === cubes) state.transitioning = false; }
}

// Jump to the start of a gorge span's bridge (world/spans.js) for playtesting: the n-th span of
// the world (counted from 1, in depth order), else the next one after the last visited.
let lastSpan = -1;
export async function goSpan(n) {
  if (state.transitioning || state.inventoryOpen) return;
  const cubes = state.cubes, spans = [];
  for (let d = 1; d < 20; d++) spans.push(...(cubes.layout(d).spans || []));
  if (!spans.length) { setStatus('No gorge span in this world'); return; }
  const i = lastSpan = n === undefined ? (lastSpan + 1) % spans.length : (Math.max(1, n) - 1) % spans.length, span = spans[i];
  clearMouseInput(); state.transitioning = true;
  try {
    const c = await whenReady(cubes.get(span.keys[1]));
    if (state.cubes !== cubes) return;
    enterCube(c, span.dir ^ 1);
    setStatus(`Span ${i + 1}/${spans.length} · depth ${c.map.depth} · ${span.island ? 'to an island' : 'on the route'} · deck ${span.levels.join(' → ')}`);
  } finally { if (state.cubes === cubes) state.transitioning = false; }
}

// Stand at the foot of the next bridge or ladder (kind) of a style (or any), from this depth (or
// `from`) on down, for looking at them: the cubes are made in turn until one turns up.
const lastStructure = {};
export async function goStructure(kind, style, from) {
  if (state.transitioning || state.inventoryOpen) return;
  const cubes = state.cubes, here = from ?? state.map?.depth ?? 0, last = lastStructure[kind + ':' + style];
  const list = m => kind === 'bridge' ? m.runs.filter(r => r.kind === 'bridge') : m.ladders;
  const fits = o => !style || o.style === style;
  clearMouseInput(); state.transitioning = true;
  try {
    let pick = null, passed = !last;
    for (let d = here; d < 20 && !pick; d++) for (const k of [...cubes.layout(d).exists].sort()) {
      const c = await whenReady(cubes.map(k));   // (only its map: the one picked is loaded below)
      if (state.cubes !== cubes) return;
      list(c.map).forEach((o, i) => {
        if (pick || !fits(o)) return;
        if (!passed) { if (last.key === k && last.i === i) passed = true; return; }
        pick = { c, o, i };
      });
      if (pick) break;
    }
    if (!pick) { lastStructure[kind + ':' + style] = null; setStatus(`No ${style ?? ''} ${kind} found from here down`); return; }
    lastStructure[kind + ':' + style] = { key: pick.c.key, i: pick.i };
    const { o } = pick, c = await whenReady(cubes.get(pick.c.key));
    if (state.cubes !== cubes) return;
    if (c.key !== state.cubeKey) enterCube(c, c.map.portals.find(p => p.kind === 'side')?.dir ?? c.map.portals[0].dir);
    if (kind === 'bridge') {
      const [dx, dz] = DIRS[o.d];
      spawnAt(o.from.x + 0.5 - dx * 0.2, o.from.top * LH, o.from.z + 0.5 - dz * 0.2);
      setStatus(`${o.style} bridge · ${o.k} cells${o.span ? ' · span' : ''} · depth ${c.map.depth} · ${c.map.biome}`);
    } else {
      const [dx, dz] = DIRS[o.d];
      spawnAt(o.x + 0.5 - dx * 0.2, o.y0, o.z + 0.5 - dz * 0.2);
      setStatus(`${o.style} ladder${o.hang ? ' · hanging' : ''} · ${((o.y1 - o.y0) / LH) | 0} levels · depth ${c.map.depth} · ${c.map.biome}`);
    }
  } finally { if (state.cubes === cubes) state.transitioning = false; }
}

// Jump into the next of the big height pieces (world/heights.js) for playtesting: a tableland's
// ascent, plateau or descent, a great shaft, a pinnacle, a large area (world/areas.js: in at the
// foot of a spiral or a hairpin), a set piece (a lone peak, a great lake), or a cube with a tunnel
// (cubegen/tunnel.js; those are only known once made, so the cubes of this depth and the ones
// below are made in turn).
export const FEATURES = ['ascent', 'plateau', 'descent', 'shaft', 'pinnacle', 'spiral', 'hairpin', 'peak', 'lake', 'tunnel'];
const lastFeature = {};
export async function goFeature(kind) {
  if (state.transitioning || state.inventoryOpen) return;
  const cubes = state.cubes, here = state.map?.depth ?? 0, found = [];
  for (let d = 1; d < 20; d++) {
    const L = cubes.layout(d);
    for (const piece of L.heights) {
      const at = ['ascent', 'plateau', 'descent'].indexOf(kind === 'shaft' ? 'descent' : kind);
      if (at < 0 || (kind === 'shaft' && !shaftOf(cubes, piece))) continue;
      // in at the foot of the ascent, from the plateau into the descent
      found.push({ key: piece.keys[at], dir: at === 0 ? piece.ways[0] : piece.dirs[at - 1] ^ 1 });
    }
    for (const kind2 of ['pinnacle', 'peak', 'lake']) if (kind === kind2 && L[kind2]) found.push({ key: L[kind2] });
    // a large area: in by the face the route comes in by
    for (const piece of L.areas) if (piece.kind === kind) {
      const k = piece.keys[0], before = L.route[L.route.indexOf(k) - 1];
      found.push({ key: k, dir: [0, 1, 2, 3].find(d => step(k, d) === before) });
    }
  }
  clearMouseInput(); state.transitioning = true;
  try {
    let pick = null;
    if (kind === 'tunnel') {
      for (let d = Math.max(1, here); d < 20 && !pick; d++) for (const k of [...cubes.layout(d).exists].sort()) {
        if (k === state.cubeKey || lastFeature.tunnel === k) continue;
        const c = await whenReady(cubes.map(k));
        if (c.map.tunnel) { pick = { key: k }; break; }
      }
    } else if (found.length) {
      const i = (found.findIndex(f => f.key === lastFeature[kind]) + 1) % found.length;
      pick = found[i];
      // a planned shaft over a room a river crosses is a plunge (world/heights.js shaftOf: the
      // rivers are only known to the worker): the next one that came out a shaft
      if (kind === 'shaft') {
        pick = null;
        for (let j = 0; j < found.length && !pick; j++) {
          const f = found[(i + j) % found.length], c = await whenReady(cubes.map(f.key));
          if (state.cubes !== cubes) return;
          if (c.map.shaft) pick = f;
        }
      }
    }
    if (!pick) { setStatus(`No ${kind} found`); return; }
    lastFeature[kind] = pick.key;
    const c = await whenReady(cubes.get(pick.key));
    if (state.cubes !== cubes) return;
    enterCube(c, pick.dir ?? c.map.portals.find(p => p.kind === 'side')?.dir ?? c.map.portals[0].dir);
    setStatus(`${kind} · depth ${c.map.depth} · ${c.map.archetype}${c.map.tunnel ? ' + tunnel' : ''}`);
  } finally { if (state.cubes === cubes) state.transitioning = false; }
}

// Stand in the pool before the next waterfall with a hidden cave behind it (cubegen/grotto.js),
// facing the curtain: the cubes after this one (this depth on down, then round from the first) are
// made in turn until one has a cave with its chest, as only a made cube knows. Again: the next.
export async function goWaterfall() {
  if (state.transitioning || state.inventoryOpen) return;
  const cubes = state.cubes, here = state.map?.depth ?? 0, order = [];
  for (let d = 1; d <= MAX_DEPTH; d++) {
    const L = cubes.layout(d);
    for (const k of [...L.exists].sort()) if (!L.guardians.has(k)) order.push({ d, k });
  }
  // from just after this cube (or the first of this depth on), round the world once
  let at = order.findIndex(o => o.k === state.cubeKey) + 1;
  if (!at) at = Math.max(0, order.findIndex(o => o.d >= here));
  clearMouseInput(); state.transitioning = true;
  setStatus('Looking for a waterfall with a cave behind it ...');
  try {
    let pick = null;
    for (let i = 0; i < order.length && !pick; i++) {
      const { k } = order[(at + i) % order.length], c = await whenReady(cubes.map(k));   // (only its map: the one picked is loaded below)
      if (state.cubes !== cubes) return;
      if (c.map.grotto) pick = k;
    }
    if (!pick) { setStatus('No waterfall with a cave behind it in this world'); return; }
    const c = await whenReady(cubes.get(pick));
    if (state.cubes !== cubes) return;
    const g = c.map.grotto, f = g.front;
    enterCube(c, null, null, f);
    // (enterCube stands them on dry ground near it: back into the water)
    if (f.swim) Object.assign(player, { x: f.x, y: f.y, z: f.z, visY: f.y, swimming: true, grounded: false, vy: 0 });
    else spawnAt(f.x, f.y, f.z);
    player.yaw = f.yaw;
    setStatus(`Waterfall cave · depth ${c.map.depth} · ${pick} · ${g.cells.length} cells · chest ${state.run.chests.has(g.site) ? 'opened' : 'closed'}`);
  } finally { if (state.cubes === cubes) state.transitioning = false; }
}

// Stand at the next spot (world/spots.js: a hiding place, a seat, a camp ...; of a kind, or any; in
// the cube of a glass of his, at its way in) from
// this depth on down (or from `from`), the easy ones of a depth first: where the quests will put
// their people and things.
const lastSpot = {};
export async function goSpot(kind, from) {
  if (state.transitioning || state.inventoryOpen) return;
  const cubes = state.cubes, here = from ?? state.map?.depth ?? 0, all = [];
  for (let d = here; d <= 20; d++) all.push(...cubes.layout(d).spotList.filter(s => !kind || s.kind === kind).sort((a, b) => a.tier - b.tier));
  if (!all.length) { setStatus(`No ${kind ?? ''} spot from here down`); return; }
  const plan = all[(all.findIndex(s => s.id === lastSpot[kind]) + 1) % all.length];
  lastSpot[kind] = plan.id;
  clearMouseInput(); state.transitioning = true;
  try {
    const c = await whenReady(cubes.get(plan.key));
    if (state.cubes !== cubes) return;
    if (c.key !== state.cubeKey) enterCube(c, c.map.portals.find(p => p.kind === 'side')?.dir ?? c.map.portals[0].dir);
    const spot = (c.map.spots ?? []).find(s => s.id === plan.id);
    if (!spot) { setStatus(`${plan.kind} · tier ${plan.tier} · depth ${plan.depth}: not placed in ${plan.key}`); return; }
    // (a glass of his: at the way in, not on it, which would break it)
    if (spot.kind !== 'glass') spawnAt(spot.approach.x, spot.approach.y, spot.approach.z);
    setStatus(`${plan.kind} · tier ${plan.tier} · depth ${plan.depth} · ${plan.key}${spot.places.length ? ` · ${spot.places.length} places` : ''}`);
  } finally { if (state.cubes === cubes) state.transitioning = false; }
}

// Jump into a guardian arena of a kind (world/arenas.js), the nearest depth first; with no
// kind, this depth's way down. The gate stays locked: it is the real arena.
export async function goArena(type, depth = state.map?.depth ?? 0) {
  if (state.transitioning || state.inventoryOpen) return;
  const cubes = state.cubes, order = Array.from({ length: 20 }, (_, i) => i)
    .sort((a, b) => Math.abs(a - depth) - Math.abs(b - depth) || a - b);
  let key = null;
  for (const d of type ? order : [Math.min(depth, 19)]) {
    for (const [k, g] of cubes.layout(d).guardians) if (!type || g.arena === type || BOSS_ARENAS[g.boss]?.type === type) { key = k; break; }
    if (key) break;
  }
  if (!key) { setStatus(`No ${type} arena in this world`); return; }
  clearMouseInput(); state.transitioning = true;
  try {
    const c = await whenReady(cubes.get(key));
    if (state.cubes !== cubes) return;
    enterCube(c, c.map.portals[0].dir);
    setStatus(`Guardian arena · ${c.map.arena.type} · depth ${c.map.depth}`);
  } finally { if (state.cubes === cubes) state.transitioning = false; }
}

// Into the arena of a real boss (core/bosses.js BOSSES: kind -> its depth), through its
// entrance, the boss up again if he was beaten (his gate stays as it is).
export async function goBoss(kind) {
  if (state.transitioning || state.inventoryOpen) return;
  const cubes = state.cubes, depth = Number(Object.keys(BOSSES).find(d => BOSSES[d] === kind));
  const key = [...cubes.layout(depth).guardians].find(([, g]) => g.boss === kind)?.[0];
  if (!key) { setStatus(`No ${ENEMY_KINDS[kind].label} in this world`); return; }
  state.run.defeated.delete(guardianId(key));
  clearMouseInput(); state.transitioning = true;
  try {
    const c = await whenReady(cubes.get(key));
    if (state.cubes !== cubes) return;
    enterCube(c, c.map.portals[0].dir);
    setStatus(`${ENEMY_KINDS[kind].label} · depth ${depth} · ${c.map.arena.type} arena`);
  } finally { if (state.cubes === cubes) state.transitioning = false; }
}

// Into a dev test room (world/testrooms.js, cubegen/testrooms.js) dressed as a depth (default:
// this one's, the first below the town), at its arrival. The boss room is a depth's with a boss
// (core/bosses.js; default: this one's, else the first). Where we came from is kept for
// leaveTestRoom (going from one test room into another keeps it). Returns what went wrong, if.
let testReturn = null;
export async function goTestRoom(name, depth) {
  if (state.transitioning || state.inventoryOpen) return;
  const here = state.map?.depth ?? 0;
  if (name === 'boss') {
    depth ??= bossAt(here) ? here : Number(Object.keys(BOSSES)[0]);
    if (!bossAt(depth)) return `No boss at depth ${depth} yet: ${Object.entries(BOSSES).map(([d, k]) => `${ENEMY_KINDS[k].label} (${d})`).join(', ')}`;
  }
  depth ??= Math.max(1, here);
  const cubes = state.cubes;
  if (!isTestRoom(state.cubeKey)) testReturn = { cubes, key: state.cubeKey, x: player.x, y: player.y, z: player.z, yaw: player.yaw };
  clearMouseInput(); state.transitioning = true;
  try {
    const c = await whenReady(cubes.get(testRoomKey(name, depth)));
    if (state.cubes !== cubes) return;
    const { arrival: a, note } = c.map.testRoom;
    enterCube(c, null, null, a);
    player.yaw = a.yaw;
    setStatus(`Test room ${name} · ${c.map.biome} (depth ${depth}) · ${note}`);
  } finally { if (state.cubes === cubes) state.transitioning = false; }
}
// back to where /testroom was used (in another world: its town)
export async function leaveTestRoom() {
  if (state.transitioning || state.inventoryOpen) return;
  if (!isTestRoom(state.cubeKey)) { setStatus('Not in a test room'); return; }
  const cubes = state.cubes, r = testReturn?.cubes === cubes ? testReturn : null;
  clearMouseInput(); state.transitioning = true;
  try {
    const c = await whenReady(cubes.get(r?.key ?? cubes.start));
    if (state.cubes !== cubes) return;
    enterCube(c, null, null, r);   // (no r: on the town's spawn pad)
    if (r) player.yaw = r.yaw;
    testReturn = null;
    setStatus('Out of the test room');
  } finally { if (state.cubes === cubes) state.transitioning = false; }
}

// Stand in the room before the next trial (of a kind) from this depth (or `from`) on down, beside
// its portal into the trial room, facing it (docs/trials.md "Dev: /trial"). The portal's lock keeps
// you from walking straight in. A world without one: the page comes again with ?trial=<kind>
// (same seed, dev on) and goes there.
const lastTrial = {};
export async function goTrial(kind, from, key = null) {
  if (state.transitioning || state.inventoryOpen) return;
  const cubes = state.cubes, here = from ?? Math.max(1, state.map?.depth ?? 1), all = [];
  for (let d = 1; d < 20; d++) all.push(...cubes.layout(d).trials.filter(t => !kind || t.kind === kind));
  if (!all.length) {
    if (!kind) { setStatus('No trials in this world'); return; }
    const p = new URLSearchParams(location.search);
    p.set('trial', kind); p.set('seed', String(cubes.seed)); p.set('dev', '1'); p.set('at', 'trial');
    location.search = p.toString();
    return;
  }
  const ahead = all.filter(t => t.depth >= here), list = ahead.length ? ahead : all;
  const i = (list.findIndex(t => t.key === lastTrial[kind]) + 1) % list.length, t = key ? all.find(x => x.key === key) ?? list[i] : list[i];
  lastTrial[kind] = t.key;
  clearMouseInput(); state.transitioning = true;
  try {
    const c = await whenReady(cubes.get(t.from));
    if (state.cubes !== cubes) return;
    enterCube(c, t.fromDir);
    const [dx, dz] = DIRS[t.fromDir];
    player.yaw = Math.atan2(dx, dz);
    setStatus(`${TRIALS[t.kind].name} · depth ${t.depth} · ${t.role} · through the ${NAMES[t.fromDir]} portal`);
  } finally { if (state.cubes === cubes) state.transitioning = false; }
}
// ?at=trial: once the world is there, to the forced trial (after goTrial reloaded the page)
if (state.dev && new URLSearchParams(location.search).get('at') === 'trial') {
  const kind = new URLSearchParams(location.search).get('trial')?.split(':')[0];
  const wait = () => state.map && !state.transitioning ? goTrial(kind) : setTimeout(wait, 200);
  setTimeout(wait, 200);
}

// ?at=<boss> (?at=qualmos): once the world is there, into that boss's arena (goBoss) as a hero of
// his level, keeping the developer's OMG staff
const atBoss = state.dev ? new URLSearchParams(location.search).get('at') : null;
if (Object.values(BOSSES).includes(atBoss)) {
  const depth = Number(Object.keys(BOSSES).find(d => BOSSES[d] === atBoss)), level = guardianLevel(depth, 'descent', worldLevel());
  const wait = async () => {
    if (!state.map || state.transitioning) { setTimeout(wait, 200); return; }
    player.xp = xpForLevel(level); player.level = levelFromXP(player.xp);
    player.maxHp = fullHealth(player.level, player.inventory); player.hp = player.maxHp;
    await goBoss(atBoss);
  };
  setTimeout(wait, 200);
}

// The cube faces sit on the screen diagonals, so the screen direction is turned an eighth
// clockwise first: W is the upper-right face, D the lower-right, S the lower-left, A the upper-left.
const SCREEN = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyD: [1, 0], ArrowRight: [1, 0], KeyA: [-1, 0], ArrowLeft: [-1, 0] };
export function screenFace([ix, iy], yaw = view.yawTarget) {
  const rx = (ix + iy) / Math.SQRT2, ry = (iy - ix) / Math.SQRT2;
  const wx = Math.cos(yaw) * rx - Math.sin(yaw) * ry, wz = -Math.sin(yaw) * rx - Math.cos(yaw) * ry;
  let best = 0;
  for (let d = 1; d < 4; d++) if (D[d][0] * wx + D[d][1] * wz > D[best][0] * wx + D[best][1] * wz) best = d;
  return best;
}

// Through the side portal if there is one (the real slide), otherwise straight in, at the
// nearest safe spot to where we stand along the shared face. Only into a cube of this depth's
// plan: nothing next to a house's inside or a test room (they are off the grid).
export async function goAdjacent(d) {
  if (state.transitioning || state.inventoryOpen) return;
  const here = state.cubeKey;
  if (isInterior(here) || isTestRoom(here)) { setStatus('No cubes next to this one'); return; }
  const k = step(here, d);
  if (!state.cubes.layout(state.map.depth).exists.has(k)) { setStatus(`No cube to the ${NAMES[d]}`); return; }
  const q = state.map.portals.find(p => p.kind === 'side' && p.dir === d);
  if (q) { takePortal(q); return; }
  clearMouseInput();
  const cubes = state.cubes, source = state.cubeKey, at = boundaryArrival(player, d);
  state.transitioning = true;
  const c = await whenReady(cubes.get(k)).catch(() => null);
  state.transitioning = false;
  if (state.cubes !== cubes || state.cubeKey !== source) return;
  if (!c) { setStatus(`The cube to the ${NAMES[d]} failed to generate`); return; }
  enterCube(c, null, null, at);
  setStatus(`Jumped ${NAMES[d]}`);
}

// Into a place (world/coords.js readPlace: /goto 7, /goto 3,2, /goto 7 3,2 8.4,3,11.2): a depth's
// cube at X,Z (the minimap's "cube 3, 2"), in by its usual way (a side portal); no cube: the
// depth's entrance, come down its way up (the town's spawn pad at 0); a spot: there, on the
// nearest ground (no height: the highest ground there). Only cubes of the depth's plan.
// Returns where it went (or throws what is wrong).
export async function goPlace({ depth, cell = null, spot = null }) {
  if (state.transitioning || state.inventoryOpen) throw new Error('Busy: travelling, or the inventory is open');
  const cubes = state.cubes, L = cubes.layout(depth);
  const k = cell ? key(cell[0], -depth, cell[1]) : depth ? L.up : cubes.start;
  if (!L.exists.has(k)) throw new Error(cell ? `No cube ${cell.join(',')} on depth ${depth}` : `No entrance on depth ${depth}`);
  clearMouseInput(); state.transitioning = true;
  try {
    const c = await whenReady(cubes.get(k));
    if (state.cubes !== cubes) return;
    const ways = c.map.portals, up = ways.find(p => p.kind === 'up'), pad = ways.find(p => p.kind === 'spawn');
    if (spot) {
      const y = spot.y ?? groundAt(spot.x, spot.z, 1e3, 0, c.map).h;
      enterCube(c, null, null, { x: spot.x, y: Number.isFinite(y) ? y : 0, z: spot.z });
    } else enterCube(c, !cell && up ? up.dir : pad ? null : (ways.find(p => p.kind === 'side') ?? up ?? ways[0]).dir);
    return `${placeOf(k)} · ${c.map.biome}`;
  } finally { if (state.cubes === cubes) state.transitioning = false; }
}
// a cube said as /goto takes it, with what it is for (world/sites.js roles)
function placeOf(k) {
  const [X, Y, Z] = parse(k), role = state.cubes.layout(-Y).roles?.get(k);
  return `depth ${-Y} · cube ${X},${Z}${role ? ` · ${role}` : ''}`;
}
// where we are, as a /goto line to copy (and what the place is)
export function whereAmI() {
  const k = state.cubeKey, f = v => String(Math.round(v * 10) / 10);
  if (!k) return 'Nowhere yet';
  if (isInterior(k)) return `Inside a house (depth ${state.map.depth}): /where outside its door`;
  if (isTestRoom(k)) return `In a test room (/testroom leave: back out) · ${state.map.biome}`;
  const [X, Y, Z] = parse(k);
  return `${placeOf(k)} · ${state.map.biome}\n/goto ${-Y} ${X},${Z} ${f(player.x)},${f(player.y)},${f(player.z)}`;
}

if (state.dev) {
  // Alt+click on a portal takes it at once (a plain click walks up to it and through, game/orders.js)
  addEventListener('click', e => { const q = e.altKey && portalAt(e); if (q) takePortal(q); });
  addEventListener('keydown', e => {
    if (e.repeat || state.inventoryOpen || state.leaveAsk || state.deathAsk || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return;
    if (e.altKey && !e.ctrlKey && !e.metaKey && SCREEN[e.code]) { e.preventDefault(); goAdjacent(screenFace(SCREEN[e.code])); return; }
    if (e.code === 'KeyG') goTo('down', false);
    if (e.code === 'KeyH') goHorde().catch(err => setStatus(err.message));
    if (e.code === 'PageDown') { e.preventDefault(); goTo('down', true); }
    if (e.code === 'PageUp') { e.preventDefault(); goTo('up', true); }
  });
}

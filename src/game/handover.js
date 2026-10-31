// Walking from one cube into the next across a side that is walked across (docs/world.md "Opened
// side connections", docs/town.md): the faces opened between two cubes already visited, and the
// seams between the town's tiles. No portal, no slide: only the cube the hero is in is played and
// drawn in full (the others are its surroundings, render/neighbors.js); past such a side the
// physics reads the cube beyond as it lies there (physics/collide.js, the sides set walked across:
// refreshAcross), and once the hero's middle is PAST it the cube beyond takes over at once
// (handOver): it becomes the cube played in, and everything in the world's coordinates moves by a
// cube's width, so nothing on the screen jumps. Where four cubes meet and the sides between them
// are all walked across, the corner is walked through too, into the cube diagonally beyond
// (crossCorners): past both sides, it takes over at once. The cube left dissolves into its proxy
// and the one taken over out of its own in FADE s, where they stand, while the overview pans over
// to the new cube (game/camera.js panCamera). A cube never visited is still come into through its
// portal, with the slide (game/travel.js): the first view of it.
import * as THREE from 'three';
import { N, DIRS, STEP } from '../core/constants.js';
import { step } from '../world/coords.js';
import { isFaceOpen, portalsOnly } from '../core/boundaries.js';
import { portalLocked, leavingFight } from '../core/guardians.js';
import { disposeWorld } from '../render/world.js';
import { setGlassShut } from '../render/glass.js';
import { setFade } from '../render/fade.js';
import { shiftParticles } from '../render/particles.js';
import { shiftFloatText } from '../render/floattext.js';
import { shiftHeroFeet } from '../render/animator.js';
import { removeEnemyViews, animateEnemies } from '../render/enemies.js';
import { showNeighbors, disposeNeighbors, neighborOf } from '../render/neighbors.js';
import { groundAt, setAcross, acrossOf, cornersOf, cornerAt } from '../physics/collide.js';
import { respawnPoint } from '../physics/respawn.js';
import { player, state } from './state.js';
import { beginVisit, visitedNeighbors, buildCube, discover, settleIn, devShores, readyAhead } from './flow.js';
import { enterTrial, sealedOut } from './trials.js';
import { diveSealed } from './dive.js';
import { resetEnemies, detachEnemies } from './enemies.js';
import { carryOrder } from './orders.js';
import { cancelSword } from './sword.js';
import { panCamera } from './camera.js';

// how far (cells) the hero's middle goes past a side before the cube beyond takes over: back the
// other way it is as far again, so walking along a side does not hand over and back every step
export const PAST = 0.25;
// how long the cube left and the one taken over dissolve into their proxies (s)
export const FADE = 0.3;

// how far the body's middle is past side d of the cube (negative: inside)
const past = (p, d) => [p.x - N, -p.x, p.z - N, -p.z][d];

// The sides of the cube played in that are walked across now, with the map of the cube beyond each
// (null: none, or its map not here yet): the town's seams and the open faces, but not while
// something holds the hero in (Flip's box turned, under Umbra's water, a trial room sealed, a
// guardian's gate locked or a guardian still standing: game/portals.js says so at the face, and
// asks to leave the fight), nor while travel or a fall through cubes goes on.
export function crossable() {
  const m = state.map, k = state.cubeKey, cubes = state.cubes?.cubes;
  if (!m || !cubes || state.transitioning || state.fallFrom || m.flipKey || diveSealed()) return DIRS.map(() => null);
  const sealed = sealedOut();
  return DIRS.map((_, d) => {
    if (!m.seams?.[d] && !isFaceOpen(state.openedFaces, k, d)) return null;
    if (sealed && sealedOut(d) || portalLocked(m, state.run, { dir: d }) || leavingFight(m, state.run, d)) return null;
    return cubes.get(step(k, d))?.map ?? null;
  });
}
// The cubes diagonally beyond the cube's corners (by physics/collide.js cornerAt), with their maps
// (null: not walked into): where both sides of the cube played in meeting there are walked across
// now (beyond: crossable), and so are the two sides between the cubes beyond them and the one at
// the corner (open, and nothing there holds the way: a guardian's gate locked or still standing)
export function crossCorners(beyond = crossable()) {
  const k = state.cubeKey, cubes = state.cubes?.cubes, run = state.run, out = [null, null, null, null];
  const joined = (key, m, d) => (m.seams?.[d] || isFaceOpen(state.openedFaces, key, d)) && !portalLocked(m, run, { dir: d }) && !leavingFight(m, run, d);
  for (const ox of [0, 1]) for (const oz of [2, 3]) {
    if (!beyond[ox] || !beyond[oz]) continue;
    const kx = step(k, ox), kz = step(k, oz);
    if (joined(kx, beyond[ox], oz) && joined(kz, beyond[oz], ox)) out[cornerAt(ox, oz)] = cubes.get(step(kx, oz))?.map ?? null;
  }
  return out;
}
// ... told to the physics (game/portals.js, every step of play; and once handed over)
export function refreshAcross() { const beyond = crossable(); setAcross(state.map, beyond, crossCorners(beyond)); }

// game/portals.js, every step of play: past a side walked across, the cube beyond takes over.
// true if it did. Not while the hero is held in what knows the cube's coordinates (a swim out of
// the water): they stand on past the side until that is over.
export function checkHandover() {
  if (state.transitioning || !state.cubes || player.swimOut) return false;
  const beyond = acrossOf(state.map), corners = cornersOf(state.map);
  // (got ready ahead, game/flow.js prefetchAround; until it is, the hero stands past the side)
  const into = (key, dx, dz) => {
    const c = state.cubes.cubes.get(key);
    if (!c?.ready) { readyAhead([key]); return false; }
    handOver(c, dx, dz);
    return true;
  };
  // past a corner (past both its sides): the cube diagonally beyond it, at once
  const ox = [0, 1].find(d => past(player, d) > PAST), oz = [2, 3].find(d => past(player, d) > PAST);
  if (ox !== undefined && oz !== undefined && corners[cornerAt(ox, oz)])
    return into(step(step(state.cubeKey, ox), oz), DIRS[ox][0], DIRS[oz][1]);
  for (let d = 0; d < 4; d++) {
    if (!beyond[d] || past(player, d) <= PAST) continue;
    return into(step(state.cubeKey, d), ...DIRS[d]);
  }
  return false;
}

// the dissolve going on: { key (the cube taken over), world (the one left, where it is drawn now),
// enemies (its, as they were), proxy (its proxy, in the surroundings now), into (the proxy of the
// one taken over, from the surroundings before), at (where the cube left lies), t }, or null
let blend = null;
export const handingOver = () => !!blend;

// (dx, dz: which way the cube taken over lies, in cubes: a side's DIRS, or a corner's)
function handOver(c, dx, dz) {
  endHandover();
  const sx = -dx * N, sz = -dz * N, k = c.key, from = state.cubeKey;
  // what is drawn where it is in the world moves along: the hero (and where they stood safely),
  // what is in the air, the planted feet
  player.x += sx; player.z += sz;
  if (player.safe) player.safe = { ...player.safe, x: player.safe.x + sx, z: player.safe.z + sz };
  shiftParticles(sx, 0, sz); shiftFloatText(sx, 0, sz); shiftHeroFeet(sx, 0, sz);
  cancelSword();  // (a swing at what was there)
  // the cube left, with its enemies as they were: dissolving where it is now
  const old = state.world, enemies = detachEnemies();
  old.group.position.set(sx, 0, sz);
  state.cubeKey = k; state.map = c.map;
  devShores(c.map);
  discover(c);   // (it may open more faces: built with them)
  // the people living here, and what the quests put here (game/flow.js buildCube); its bake
  // most likely made ahead (game/bakeahead.js), its shadows there at once
  state.world = buildCube(c);
  setGlassShut(state.world.glass, portalsOnly(c.map, state.run));
  enterTrial(c.map);
  const gr = groundAt(player.x, player.z, player.y + 0.05, STEP);
  if (gr.s) player.support = gr.s;
  carryOrder(sx, sz);   // (a walk across goes on there; any other order was for the cube left)
  // a death or the Room Portal Scroll brings the hero back here, on firm, dry ground
  state.arrival = respawnPoint({ x: player.x, y: player.y, z: player.z });
  state.portalLock = 0; state.boundaryLock = -1;
  beginVisit();
  resetEnemies();
  refreshAcross();
  // what it says, the robot, the cubes round it got ready (game/flow.js settleIn); the
  // surroundings at once, with the cube left among them
  settleIn(false);
  const [into] = showNeighbors(visitedNeighbors(k), true, g => g.key === k);
  const proxy = neighborOf(from);
  if (proxy) proxy.held = true;
  if (into) into.group.position.set(0, 0, 0);
  blend = { key: k, world: old, enemies, proxy, into, at: new THREE.Vector3(sx, 0, sz), t: 0 };
  fadeTo(0);
  panCamera(sx, sz);
}

const ease = t => t * t * (3 - 2 * t);
// the dissolve at u (0..1): the cube left out into its proxy, the one taken over in out of its own
function fadeTo(u) {
  const b = blend, fadeNew = ease(u), fadeOld = 1 - fadeNew;
  setFade(state.world.group, fadeNew);
  setFade(b.world.group, fadeOld);
  if (b.proxy && !b.proxy.disposed) setFade(b.proxy.group, fadeOld, true);
  if (b.into && !b.into.disposed) setFade(b.into.group, fadeNew, true);
  animateEnemies(b.enemies, 0, b.at);
  for (const e of b.enemies) if (e.view) e.view.group.visible = fadeOld > 0.5 && e.view.group.visible;
}

// every frame (main.js, after the surroundings' fades): the dissolve goes on, and ends
export function tickHandover(dt) {
  if (!blend) return;
  if (state.cubeKey !== blend.key || state.transitioning) { endHandover(); return; }
  blend.t += dt;
  if (blend.t >= FADE) endHandover();
  else fadeTo(blend.t / FADE);
}

// the dissolve over (or cut short: another cube entered, travel, a new world): the cube left gone
export function endHandover() {
  const b = blend;
  if (!b) return;
  blend = null;
  disposeWorld(b.world);
  removeEnemyViews(b.enemies);
  if (b.into && !b.into.disposed) disposeNeighbors([b.into]);
  if (b.proxy && !b.proxy.disposed) { b.proxy.held = false; setFade(b.proxy.group, 1); }
  if (state.world && state.cubeKey === b.key) setFade(state.world.group, 1);
}

// The cubes next door baked ahead (render/bake.js). A cube's baked shadows (the sun's of its
// houses, its lanterns') came in a second or so after it was entered, and walking from one cube
// into the next across an open face or a seam of the town (game/handover.js) nothing covers that.
// So once the cube played in is baked, the cubes behind its nearest ways out (the sides walked
// across, its portals: AHEAD of them, the nearest to the hero) are built off-screen as they would
// be entered (game/flow.js buildCube), never shown, and baked after everything shown, one at a
// time (`ahead`); their suns follow the time of day like the cube's own. Entered, or no longer
// among the nearest, one is thrown away: its bake is kept (render/bake.js disposeBake), and the
// cube built as the hero comes in (or built ahead again) takes it at once (takeKept). Before the
// bakes every frame, so in the frame a cube is entered its bake is there to be taken.
import { N } from '../core/constants.js';
import { step, faceKey } from '../world/coords.js';
import { openedSides } from '../core/boundaries.js';
import { portalLocked } from '../core/guardians.js';
import { disposeWorld } from '../render/world.js';
import { scene } from '../render/scene.js';
import { AHEAD, baked } from '../render/bake.js';
import { propSetLoaded } from '../render/props.js';
import { propSetsOf } from '../render/propplace.js';
import { themeOf } from '../themes/depth.js';
import { player, state } from './state.js';
import { buildCube } from './flow.js';
import { handingOver } from './handover.js';
import { acrossOf } from '../physics/collide.js';

// key -> the cube built ahead: { cubes, world }
const held = new Map();
// the cubes (their geometry) whose bake failed: not built for it again
const failed = new WeakSet();

// the cubes behind the ways out of the cube played in, the nearest to the hero first:
// [{ key, far, face }], face: the side of the cube played in that going through opens (a side
// portal's: game/travel.js slide; its portal is not built on it then, nor its light baked)
function nextDoor() {
  const m = state.map, k = state.cubeKey, ways = new Map();
  if (!m) return [];
  const near = (key, far, face = -1) => { if (key !== k && !(ways.get(key)?.far <= far)) ways.set(key, { key, far, face }); };
  // (the sides walked across, the town's seams and the open faces: how far the hero is from that side)
  acrossOf(m).forEach((s, d) => { if (s) near(step(k, d), Math.max(0, [N - player.x, player.x, N - player.z, player.z][d])); });
  for (const p of m.portals ?? []) if (p.kind === 'side' || p.kind === 'down' || p.kind === 'up')
    near(step(k, p.dir), Math.hypot(p.x - player.x, p.z - player.z), p.kind === 'side' && !portalLocked(m, state.run, p) ? p.dir : -1);
  return [...ways.values()].sort((a, b) => a.far - b.far);
}
// the sides of the cube behind a way open once it is gone through
function openedBy(way) {
  if (way.face < 0) return openedSides(state.openedFaces, way.key);
  return openedSides(new Set([...state.openedFaces, faceKey(state.cubeKey, way.face)]), way.key);
}

function drop(key) {
  const { world } = held.get(key);
  if (world.bake.failed) failed.add(world.bake.geo);
  disposeWorld(world);   // (baked: its bake kept)
  held.delete(key);
}

// whether cube c can be built ahead now: here, with its props (built without some its bake would
// not be the one it takes; game/flow.js fetches them ahead), and bakeable
const ready = c => c?.geo && !c.map.flip && !failed.has(c.geo) && propSetsOf(c.map, themeOf(c.map)).every(propSetLoaded);

// Every frame of play, before the bakes (main.js).
export function tickAhead() {
  const play = state.mode === 'play' && !!state.cubes;
  // the one entered (its bake to be taken), those of another world, those that failed
  for (const [key, h] of held) if (!play || key === state.cubeKey || h.cubes !== state.cubes || h.world.bake.failed) drop(key);
  // (nor while a cube walked out of dissolves: it is next door, its bake still its own, game/handover.js)
  if (!play || state.transitioning || handingOver()) return;
  // those well behind the nearest (one more than AHEAD stays: no building and dropping by turns
  // where two are as near)
  const near = nextDoor(), wanted = new Set(near.slice(0, AHEAD).map(w => w.key)), stay = new Set(near.slice(0, AHEAD + 1).map(w => w.key));
  for (const key of held.keys()) if (!stay.has(key)) drop(key);
  if (!baked(state.world)) return;
  // one at a time: none built while one is baking
  for (const h of held.values()) if (!h.world.bake.ready) return;
  const next = near.find(w => wanted.has(w.key) && !held.has(w.key) && ready(state.cubes.cubes.get(w.key)));
  if (!next) return;
  // (one no longer among the nearest makes room)
  if (held.size >= AHEAD) { const out = [...held.keys()].find(key => !wanted.has(key)); if (out) drop(out); else return; }
  const world = buildCube(state.cubes.cubes.get(next.key), openedBy(next));
  scene.remove(world.group);
  world.group.visible = false;   // (its lights not shining where it is not: render/lightpool.js)
  world.bake.ahead = true;
  held.set(next.key, { cubes: state.cubes, world });
}

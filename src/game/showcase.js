// The living cubes behind the main menu (game/menu.js): the cube the chosen hero left its world
// in (with what it did there: the enemies it defeated stay gone, the chests it opened stay
// open), or, with no hero or one without a world, every SWAP seconds another random cube of a
// random world, at any depth. Their enemies and villagers go about their business and the camera
// slowly goes round. Nobody is there for the enemies to notice: the hero waits far away (it is
// shown over the menu instead, render/portrait.js), so they idle and wander about their homes.
//
// It is the game's own world machinery (state.cubes, state.map, state.world, the enemies), only
// without a hero: starting a game (game/flow.js newWorld) or a friend's world coming in
// (net/session.js) simply takes its place. The next cube is made in the world worker while the
// current one shows (about 5 to 40 ms; building it here about 2 ms), so a swap never waits.
import { MAX_DEPTH, lampAt } from '../themes/depth.js';
import { createRun } from '../core/progression.js';
import { gateLocked } from '../core/guardians.js';
import { WorldClient } from '../world/client.js';
import { buildWorld, disposeWorld } from '../render/world.js';
import * as THREE from 'three';
import { camera, scene } from '../render/scene.js';
import { N } from '../core/constants.js';
import { cubeAssets, warmCube } from '../render/cubeassets.js';
import { bakeDensity } from '../render/bake.js';
import { villagersReady } from '../render/villagers.js';
import { player, state, view } from './state.js';
import { resetEnemies } from './enemies.js';
import { resetCut } from './cut.js';
import { fadeOut, fadeIn } from './hud.js';
import { setFluidPalettes } from '../render/fluidpal.js';

export const SWAP = 10;      // s each cube shows
const FADE_MS = 380;         // the fade between two (game/hud.js fadeOut)
const TURN = 0.08;           // rad/s the camera goes round
// where the menu leaves room for the cube (style.css #title-overlay): on a wide screen the menu
// is on the left and the picture moves right by SHIFT of the width; on a tall one (a phone held
// upright) the menu is at the bottom and the picture moves up by RISE of the height
const WIDE = 900, SHIFT = 0.17, TALL = 1.2, RISE = 0.2;
const ZOOM = 1;              // the whole cube in view, and the camera does not lean towards the (parked) hero (game/camera.js)

// The hero's light (render/look.js) is what lights the caves in the game; with no hero there, a
// lamp over the middle of the cube does it, as strong as the depth asks
const lamp = new THREE.PointLight(0xffe2b8, 0, 40, 1.2);
lamp.position.set(N / 2, 9, N / 2);
scene.add(lamp);
const LAMP = 22;             // its strength deep down (the depth's lamp, themes/depth.js lampAt)

// show: { key (what it shows: a focus's, or null: random cubes), focus, cubes (its world
// client; null: not made yet), t (s the cube has shown), next (the next cube, coming), last,
// swapping }; null: none (the menu is closed, or a game took its place)
let show = null;

export const showcaseCubes = () => show?.cubes ?? null;

// Show `focus` behind the menu: { key, seed, level, cube (null: the town), run } (a saved world's run:
// defeated, gates, chests), or null: random cubes of a new random world (its seed is never
// seen). The same as already shown: nothing changes; else the old fades out first.
export function startShowcase(focus = null) {
  const key = focus?.key ?? null;
  if (show && show.key === key) return;
  const prev = show, s = { key, focus, cubes: null, t: 0, next: null, last: null, swapping: true };
  show = s;
  park();
  view.zoom = view.zoomTarget = ZOOM;
  const begin = () => {
    if (show !== s) return;
    if (prev?.cubes && state.cubes === prev.cubes) { prev.cubes.dispose(); state.cubes = null; }
    const cubes = new WorldClient(focus ? focus.seed : (Math.random() * 2 ** 32) >>> 0, { load: cubeAssets, warm: warmCube, lightmap: bakeDensity(),
      level: focus?.level ?? 1 });
    s.cubes = cubes;
    setFluidPalettes(cubes.seed, cubes.layout.themes);
    state.cubes = cubes; state.run = createRun(); state.openedFaces.clear();
    if (focus) {
      for (const id of focus.run.defeated) state.run.defeated.add(id);
      for (const k of focus.run.gates) state.run.unlockedGates.add(k);
      for (const id of focus.run.chests) state.run.chests.add(id);
    }
    s.next = focus?.cube ? cubes.get(focus.cube).catch(() => cubes.get(cubes.start)) : focus ? cubes.get(cubes.start) : pick(s);
    swap(s, true);
  };
  if (prev?.cubes) { fadeOut(); setTimeout(begin, FADE_MS); } else begin();
}

// the menu closed: a game takes over (it disposes our world client: newWorld)
export function stopShowcase() { show = null; camera.clearViewOffset(); lamp.intensity = 0; }

// the hero is not in the showcase: far away, where nothing notices it
export function park() {
  Object.assign(player, { x: -1e4, y: -1e4, z: -1e4, vx: 0, vy: 0, vz: 0, visY: -1e4, ragdoll: null, down: null, getUp: null, climb: null });
}

// a random cube at a random depth (not the one just shown)
function pick(s) {
  for (let tries = 0; tries < 8; tries++) {
    const depth = Math.floor(Math.random() * (MAX_DEPTH + 1)), keys = [...s.cubes.layout(depth).exists];
    const k = keys[Math.floor(Math.random() * keys.length)];
    if (k && k !== s.last) return s.cubes.get(k);
  }
  return s.cubes.get(s.cubes.start);
}

async function swap(s, first = false) {
  s.swapping = true;
  let c;
  try {
    c = await s.next;
    await villagersReady.catch(() => null);   // (a town needs them)
  } catch (e) {
    console.warn('showcase cube failed', e);
    // another one in a moment (the hero's cube would not come: random ones)
    if (show === s) { s.focus = null; s.next = pick(s); s.swapping = false; s.t = SWAP - 1; }
    return;
  }
  if (!first) { fadeOut(); await new Promise(r => setTimeout(r, FADE_MS)); }
  if (show !== s || state.cubes !== s.cubes) return;   // the menu closed meanwhile
  enter(s, c);
  fadeIn();
  s.next = pick(s);
  s.t = 0; s.swapping = false;
}

// show cube c: built like any cube the hero walks into, with its enemies, but nobody there
function enter(s, c) {
  const old = state.cubeKey;
  state.cubeKey = c.key; state.map = c.map; state.lookDepth = c.map.depth;
  disposeWorld(state.world);
  state.world = buildWorld(c.map, false, {}, c.geo, [], gateLocked(c.map, state.run), null, state.run.chests);
  resetCut();
  resetEnemies();
  // the cubes shown before are not needed again (a long while in the menu would pile them up)
  if (old && old !== c.key) s.cubes.cubes.delete(old);
  s.last = c.key;
}

// main.js menuFrame: the camera goes round, and after SWAP s the next cube comes
export function updateShowcase(dt) {
  if (!show) return;
  if (show.cubes && state.cubes !== show.cubes) { show = null; return; }   // a game (or a friend's world) took over
  view.yawTarget += TURN * dt;
  const themes = state.cubes?.layout.themes;
  lamp.intensity = themes ? LAMP * lampAt(state.lookDepth, themes) : 0;
  const w = innerWidth, h = innerHeight;
  if (w > WIDE) camera.setViewOffset(w, h, -w * SHIFT, 0, w, h);
  else if (h > w * TALL) camera.setViewOffset(w, h, 0, h * RISE, w, h);
  else camera.clearViewOffset();
  if ((show.t += dt) >= SWAP && !show.swapping && !show.focus) swap(show);   // (the hero's cube stays)
}

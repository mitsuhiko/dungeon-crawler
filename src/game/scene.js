// The story's scenes (core/scenes.js has their timings and shots; docs/story.md "The beginning"):
// the robot waking in the merchant camp, the glassmaker's first glass shown on its rock and breaking,
// a new hero coming out of the inn. Played like a boss's intro (game/bossintro.js), with the same
// free camera (game/camera.js setCine), the same shots kept out of the way (game/cineshots.js) and
// the same black bars: the hero walks on a few steps and stops, with no control, the HUD goes, the
// camera leaves them and comes back. A click, Space or Enter skips to where it comes back. The
// narrator goes on talking through a scene (the robot says hello as it wakes), and enemies hold
// their attacks meanwhile.
//
// What happens in a scene is the caller's: it names a handler for each of the scene's moments
// (`at`), called as each comes, and every one not come yet when the scene is skipped or cut short
// (leaving the cube, back to the menu): what the moments do always happens, the scene or not.
// Someone else here (playing together: their world must not stop for us), there is no scene: the
// moments happen at once. Reducing motion: no camera, the rest as always.
import { player, state } from './state.js';
import { SCENES, SCENE_SKIP_FROM } from '../core/scenes.js';
import { shotAt, shotFrame, blendAt, blinking, within, BLINK } from '../core/bossintro.js';
import { setCine } from './camera.js';
import { clearShots } from './cineshots.js';
import { introPlaying } from './bossintro.js';
import { mirroring } from './enemies.js';
import { clearInput } from './inputstate.js';
import { clearMouseInput } from './orders.js';
import { cancelSword } from './sword.js';
import { reduceMotion } from './settings.js';
import { online } from '../net/online.js';
import { renderer } from '../render/scene.js';
import { groundAt } from '../physics/collide.js';

const $ = id => document.getElementById(id);
const STEP = 0.7;   // cells ahead the walk looks for the ground going on

// { name, def, t, full, on, fired, visit, spot, anchors, frame, shots, walk, free }
let run = null;

export const scenePlaying = (name = null) => !!run && (!name || run.name === name);
// a scene with the free camera or the black bars under way (nothing over the hero's head meanwhile)
export const sceneFull = () => !!run?.full && !!(run.def.blend || run.def.letterbox);
// may a scene play whole here: alone (nobody else in this cube, no other's enemies shown here)
export const sceneAlone = () => !mirroring() && !online.buddies.some(b => b.here);
// the hero is held (game/update.js): no control, walking on (sceneSteer) or standing
export const sceneHolds = () => !!run?.full && run.t < run.def.hold;
// where the hero walks meanwhile: towards the scene's spot for its `walk` s, while the ground goes on
export function sceneSteer() {
  const r = run;
  if (!r?.full || r.t >= r.def.walk) return [0, 0];
  const [dx, dz] = r.walk, g = groundAt(player.x + dx * STEP, player.z + dz * STEP, player.y + 0.5, 0.5);
  return g.h > player.y - 0.45 ? [dx, dz] : [0, 0];
}

// the anchors now: the hero where they are, the spot, and the scene's own (a point, or a function
// giving one)
function anchorsNow(r = run) {
  const out = { hero: { x: player.x, y: player.visY ?? player.y, z: player.z }, spot: r.spot };
  for (const [k, v] of Object.entries(r.anchors)) out[k] = typeof v === 'function' ? v() : v;
  return out;
}

// Scene `name` (core/scenes.js) about `spot` ({ x, y, z }: what the camera looks at, what the hero
// walks towards): anchors more of its points ({ ladder: { x, y, z } }), on its moments' handlers
// ({ wake() {...} }), done once it is over (or cut short). full: false plays no scene (the moments
// happen at once); by default it plays whole for a hero alone. -> true if a scene plays
export function playScene(name, { spot, anchors = {}, on = {}, done = null, full = sceneAlone(), hero = true } = {}) {
  const def = SCENES[name];
  if (!def) throw new TypeError(`Unknown scene: ${name}`);
  if (run) stopScene();
  const r = { name, def, t: 0, full: full && !introPlaying(), on, done, fired: new Set(), visit: state.visit, spot, anchors };
  if (!r.full) { fireAll(r); r.done?.(); return false; }
  run = r;
  const dx = spot.x - player.x, dz = spot.z - player.z, l = Math.hypot(dx, dz) || 1;
  r.walk = hero ? [dx / l, dz / l] : [0, 0];
  // (the hero on the spot already: the frame the way they face)
  const from = l > 0.6 ? player : { x: spot.x - Math.sin(player.yaw), z: spot.z - Math.cos(player.yaw) };
  r.frame = shotFrame(from, spot, 1, 1);
  r.shots = def.shots.length ? clearShots(def.shots, r.frame, () => anchorsNow(r)) : [];
  state.enemyGrace = Math.max(state.enemyGrace, def.length + 0.5);
  cancelSword(); clearInput(); clearMouseInput();
  if (def.letterbox || def.blend) { document.body.classList.add('cinematic'); state.scene = true; }
  fire(r);
  return true;
}

// the moments come by now (in their order); fireAll: all of them, the scene skipped or over
function fire(r) {
  for (const [k, t] of Object.entries(r.def.at ?? {}).sort((a, b) => a[1] - b[1])) {
    if (t > r.t || r.fired.has(k)) continue;
    r.fired.add(k);
    r.on[k]?.();
  }
}
function fireAll(r) {
  for (const [k] of Object.entries(r.def.at ?? {}).sort((a, b) => a[1] - b[1])) {
    if (r.fired.has(k)) continue;
    r.fired.add(k);
    r.on[k]?.();
  }
}

// main.js, every frame (after the boss's intro)
export function updateScene(dt) {
  const r = run;
  if (!r) return;
  if (state.mode !== 'play' || !state.map || r.visit !== state.visit || state.transitioning) { stopScene(); return; }
  if (dt <= 0) return;
  r.t += dt;
  fire(r);
  const d = r.def, t = r.t;
  // the hero turns to what the scene is about, once they stop walking
  if (d.face && t < d.hold && (t > d.walk || Math.hypot(player.vx, player.vz) < 0.3)) {
    const at = anchorsNow(r)[d.face], want = Math.atan2(at.x - player.x, at.z - player.z);
    player.yaw += Math.atan2(Math.sin(want - player.yaw), Math.cos(want - player.yaw)) * Math.min(1, dt * 5);
  }
  const shot = r.shots.length ? shotAt(r.shots, t, r.frame, anchorsNow(r)) : null;
  const w = reduceMotion() || !shot ? 0 : blendAt(d, t);
  if (w > 0) {   // (held in a hand: a slow drift)
    const s = d.shake, n = i => s * (Math.sin(t * (1.3 + i * 0.37) + i * 2.1) + 0.5 * Math.sin(t * (2.9 + i * 0.23) + i));
    setCine({ cam: shot.cam.map((v, i) => v + n(i)), look: shot.look.map((v, i) => v + n(i + 3) * 0.5), fov: shot.fov, roll: shot.roll, w });
  } else setCine(null);
  $('letterbox').classList.toggle('on', within(d.letterbox, t));
  $('letterbox').classList.toggle('shut', !reduceMotion() && blinking(d, t));
  if (t >= d.hold && !r.free) { r.free = true; clearInput(); clearMouseInput(); }
  if (t >= d.length) stopScene();
}

// over, skipped to its end or cut short: what is left of it happens, the camera and the HUD are back
export function stopScene() {
  const r = run;
  if (!r) return;
  run = null;
  fireAll(r);
  setCine(null);
  $('letterbox').classList.remove('on', 'shut');
  document.body.classList.remove('cinematic');
  state.scene = false;
  clearInput(); clearMouseInput();
  r.done?.();
}

// a click, Space or Enter skips to where the camera comes back (and does nothing else)
function skip() {
  const r = run, d = r?.def;
  if (!r?.full || r.t < SCENE_SKIP_FROM) return false;
  const to = d.blend ? d.blend[2] - BLINK : d.hold;
  if (r.t >= to) return false;
  r.t = to;
  fire(r);
  return true;
}
function skipped(ev) {
  if (!run?.full || !skip()) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
}
if (typeof addEventListener === 'function') {
  addEventListener('keydown', ev => { if (['Space', 'Enter', 'NumpadEnter'].includes(ev.code) && !ev.repeat) skipped(ev); }, true);
  renderer.domElement.addEventListener('pointerdown', skipped, true);
}

// dev and tests/browser/: the scene under way ({ name, t, full }), or null
export const sceneNow = () => run && { name: run.name, t: run.t, full: run.full, fired: [...run.fired] };

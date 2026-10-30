// The camera, in one of two views (docs/camera.md), the settings say which (game/settings.js,
// the camera key: game/camerakey.js). The overview: a fixed ~45 degree perspective camera that
// frames the whole cube; zooming in follows the player. The close view: behind the hero on an
// arm that gets shorter where something is in the way, with a wide lens. Going from one to the
// other blends where the camera is, where it looks and its lens (the close view's field of view is
// a setting). A boss's intro (game/bossintro.js) takes the camera over for a few seconds: a free
// camera, blended over whichever view is on (setCine).
import * as THREE from 'three';
import { N, CUBE_H, BASE, LH } from '../core/constants.js';
import { clamp } from '../core/util.js';
import { OVERVIEW_FOV, BLEND_TIME, ANCHOR, AHEAD, closeDistance, snapYaw } from '../core/view.js';
import { camera } from '../render/scene.js';
import { setSkyRoll } from '../render/sky.js';
import { character } from '../render/character.js';
import { insideSolid, ceilingAt, cellAt } from '../physics/collide.js';
import { standingAt } from '../physics/fluid.js';
import { viewBlockedAt } from '../core/blockers.js';
import { player, state, view } from './state.js';
import { cameraMode, closeFov } from './settings.js';
import { kick, tremor } from './juice.js';

// learn: drawing.html#camera (see learn/README.md)
const pitch = THREE.MathUtils.degToRad(44);
const cubeCenter = new THREE.Vector3(N / 2, CUBE_H / 2 - BASE - 1.5, N / 2);
const target = new THREE.Vector3(), focus = new THREE.Vector3();
const overPos = new THREE.Vector3(), overQuat = new THREE.Quaternion();
const closePos = new THREE.Vector3(), closeQuat = new THREE.Quaternion(), look = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const rollQuat = new THREE.Quaternion(), VIEW_AXIS = new THREE.Vector3(0, 0, 1);   // (the camera's own: it looks down -Z)
const tiltQuat = new THREE.Quaternion(), tiltAxis = new THREE.Vector3(), pivot = new THREE.Vector3();

let blend = 0;      // 0: the overview, 1: the close view
let arm = null;     // the close view's arm as it is now (null: not out)

// how far into the close view the camera is (0..1), and whether it counts as there: the cutaway
// is off, the walls stay up, the player's bar sits at the bottom of the screen
export const closeAmount = () => blend;
export const closeView = () => blend >= 0.5;
export const closeArm = () => arm;

const quatLooking = (q, from, to) => q.setFromRotationMatrix(m4.lookAt(from, to, camera.up));

// In the town (docs/town.md) the overview follows the hero all the way: the town is many cubes walked
// across without a seam, and a view framing the one played in would jump a cube's width as the
// next takes over (game/handover.js). Eased in and out as the hero comes and goes.
let townFollow = 0;
function overview(dt = 0) {
  townFollow += ((state.map?.town ? 1 : 0) - townFollow) * Math.min(1, dt * 3);
  const follow = Math.max(clamp((1 - view.zoom) / 0.6, 0, 1) * 0.9, townFollow);
  target.copy(cubeCenter).lerp(focus.set(player.x, player.visY + 0.5, player.z), follow);
  // distance that fits the cube's bounding sphere into the narrower field of view
  const fovV = THREE.MathUtils.degToRad(OVERVIEW_FOV);
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
  const d = 12.5 / Math.sin(Math.min(fovV, fovH) / 2) * view.zoom;
  // hit kicks shove the whole view a little (scaled with the view distance)
  const s = d * 0.03;
  target.x += kick.x * s; target.y += kick.y * s; target.z += kick.z * s;
  overPos.set(
    target.x + Math.sin(view.yaw) * Math.cos(pitch) * d,
    target.y + Math.sin(pitch) * d,
    target.z + Math.cos(view.yaw) * Math.cos(pitch) * d);
  quatLooking(overQuat, overPos, target);
}

// --- the close view -----------------------------------------------------------------------------

const MIN_ARM = 0.3, CLEAR = 0.3, PROBE = 0.05, GROW = 3;   // units, units, units, 1/s
// does the close camera's arm run into something at (x, y, z)? What hides the hero from the
// overview too (tree crowns, roofs: core/blockers.js), even where it reaches out of the cube;
// out of it nothing else (but in a house: everything beyond the room, its walls are only drawn)
function solidAt(x, y, z) {
  const m = state.map, room = m.interior?.room;
  if (room) return x < room.x0 || z < room.z0 || x > room.x1 || z > room.z1 || insideSolid(x, z, y);
  if (viewBlockedAt(m, x, y, z)) return true;
  if (x < 0 || z < 0 || x >= N || z >= N) return false;
  return insideSolid(x, z, y);
}
// how long the arm from (x, y, z) along d can be, at most `len`
function reach(x, y, z, d, len) {
  for (let s = PROBE; s <= len + CLEAR; s += PROBE) {
    if (solidAt(x + d.x * s, y + d.y * s, z + d.z * s)) return Math.max(MIN_ARM, Math.min(len, s - CLEAR));
  }
  return len;
}
// fluids have no underside: the camera stays over their surface
function overFluids(p) {
  const i = cellAt(p.x, p.z);
  if (i < 0 || !state.map) return;
  for (const f of state.map.cols[i]) {
    if (!f.fluid) continue;
    const surf = f.surf * LH + 0.15;
    if (p.y < surf && p.y > f.top * LH - 1) p.y = surf;
  }
  // and standing water (a rising trial's, a boss's tide: physics/fluid.js), over everything there
  const s = standingAt(p.x, p.z);
  if (s && p.y < s.y + 0.15) p.y = s.y + 0.15;
}

const dir = new THREE.Vector3();
function close(dt) {
  const p = player, collide = !!state.map && !state.transitioning;
  // the pivot at the shoulders, under a low ceiling a little below it
  let y = p.visY + ANCHOR;
  if (collide) y = Math.max(p.visY + 0.5, Math.min(y, ceilingAt(p.x, p.z, p.visY + 0.5) - 0.25));
  look.set(p.x, y, p.z);
  dir.set(Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), Math.cos(view.yaw) * Math.cos(view.pitch));
  const want = closeDistance(view.zoom);
  // travelling, the player and the cubes slide together and the map is the new cube's: the arm
  // keeps its length
  const free = collide ? reach(look.x, look.y, look.z, dir, want) : arm ?? want;
  // in at once (nothing may stand between), out again gently
  arm = arm === null || free < arm ? free : arm + (free - arm) * Math.min(1, dt * GROW);
  closePos.copy(look).addScaledVector(dir, arm);
  if (collide) overFluids(closePos);
  closePos.x += kick.x * 0.06; closePos.y += kick.y * 0.06; closePos.z += kick.z * 0.06;
  quatLooking(closeQuat, closePos, look.addScaledVector(dir, -AHEAD));
}

// --- a boss's intro: the free camera ------------------------------------------------------------

// { cam: [x, y, z], look: [x, y, z], fov (degrees), roll (degrees), w, avoid: [x, y, z, r] (a body
// not to go through) } from game/bossintro.js, or
// null: where the camera is and what it looks at, w how far it has taken over from the game's view
// (0 .. 1). It stays in front of what stands between it and what it looks at, and over fluids.
let cine = null;
export function setCine(c) { cine = c; }
// whether the intro's camera counts as there (no cutaway, the walls up, as in the close view)
export const cineView = () => !!cine && cine.w >= 0.5;
// how far the intro's camera keeps from the cube's sides where walls stand round it (cells)
export const WALLED = 2.3;
const cinePos = new THREE.Vector3(), cineLook = new THREE.Vector3(), cineQuat = new THREE.Quaternion(), toCam = new THREE.Vector3();
const focusAt = new THREE.Vector3();
// what the camera looks at: the hero, or (an intro) what its shot looks at; the fog, the lights
// and the fires go by it (main.js)
export function cameraFocus() {
  focusAt.set(player.x, player.visY, player.z);
  if (cine?.w > 0) focusAt.lerp(cineLook.set(...cine.look), cine.w);
  return focusAt;
}
// is the camera at p in something (or just about: its near plane)?
const boxed = p => [[0, 0, 0], [0.2, 0, 0], [-0.2, 0, 0], [0, 0, 0.2], [0, 0, -0.2], [0, -0.2, 0]].some(([x, y, z]) => solidAt(p.x + x, p.y + y, p.z + z));
// the free camera over the game's (t: how far into the close view that is): from where the game's
// camera is to where the intro's is, looking from what the game's looks at to what the intro's does
// (so whatever the camera passes on its way, it keeps something in sight)
const gameLook = new THREE.Vector3(), at = new THREE.Vector3();
function intro(t) {
  cineLook.set(...cine.look); cinePos.set(...cine.cam);
  if (state.map && !state.transitioning) {
    toCam.subVectors(cinePos, cineLook);
    const len = toCam.length();
    if (len > 1e-3) cinePos.copy(cineLook).addScaledVector(toCam.divideScalar(len), reach(cineLook.x, cineLook.y, cineLook.z, toCam, len));
    overFluids(cinePos);
  }
  gameLook.copy(target);
  if (t > 0) gameLook.lerp(look, t);
  // from the game's camera round what it looks at to the intro's, round what that looks at: the
  // point looked at goes from the one to the other, and the camera swings round it, from one's
  // direction and distance to the other's (so it never passes through what it looks at)
  const w = cine.w, o1 = toCam.subVectors(camera.position, gameLook), r1 = Math.max(0.1, o1.length());
  const y1 = Math.atan2(o1.x, o1.z), p1 = Math.asin(clamp(o1.y / r1, -1, 1));
  const o2 = at.subVectors(cinePos, cineLook), r2 = Math.max(0.1, o2.length());
  const y2 = Math.atan2(o2.x, o2.z), p2 = Math.asin(clamp(o2.y / r2, -1, 1));
  const yaw = y1 + Math.atan2(Math.sin(y2 - y1), Math.cos(y2 - y1)) * w, tilt = p1 + (p2 - p1) * w, r = r1 ** (1 - w) * r2 ** w;
  at.lerpVectors(gameLook, cineLook, w);
  camera.position.set(at.x + Math.sin(yaw) * Math.cos(tilt) * r, at.y + Math.sin(tilt) * r, at.z + Math.cos(yaw) * Math.cos(tilt) * r);
  if (state.map && !state.transitioning) {
    // on its way (from the game's camera, between the shots' keys) it never goes into anything:
    // up out of whatever it would pass through, and in front of what stands between it and what
    // it looks at (unless that itself is inside something, on the way from the game's)
    const p = camera.position, b = cine.avoid;
    // (nor through him: kept off the boss's body, [x, y, z, r])
    if (b) {
      toCam.set(p.x - b[0], p.y - b[1], p.z - b[2]);
      const d = toCam.length();
      if (d < b[3]) p.set(b[0], b[1], b[2]).addScaledVector(d > 1e-3 ? toCam.divideScalar(d) : toCam.set(0, 1, 0), b[3]);
    }
    // (mostly the intro's: in the cube, off its walls: a cave's or a canyon's, render/section.js)
    const m = state.map.walled ? WALLED : 0.3, k = clamp((cine.w - 0.2) / 0.3, 0, 1);
    p.x += (clamp(p.x, m, N - m) - p.x) * k; p.z += (clamp(p.z, m, N - m) - p.z) * k;
    for (let i = 0; i < 64 && boxed(p); i++) p.y += 0.25;
    if (cine.w > 0.1 && !solidAt(at.x, at.y, at.z)) {
      toCam.subVectors(p, at);
      const len = toCam.length();
      if (len > 1e-3) p.copy(at).addScaledVector(toCam.divideScalar(len), reach(at.x, at.y, at.z, toCam, len));
    }
    overFluids(p);
  }
  quatLooking(cineQuat, camera.position, at);
  if (cine.roll) cineQuat.multiply(rollQuat.setFromAxisAngle(VIEW_AXIS, THREE.MathUtils.degToRad(cine.roll) * cine.w));
  camera.quaternion.copy(cineQuat);
}

// the hero fades out when the camera comes very close (a narrow room, a wall at the back)
const FADE_FROM = 1, FADE_TO = 0.55;
function fadeHero() {
  if (!character.ready) return;
  const a = arm === null || blend < 0.5 || cineView() ? 1 : clamp((arm - FADE_TO) / (FADE_FROM - FADE_TO), 0, 1);
  const m = character.mesh.material;
  m.opacity = a;
  m.depthWrite = a > 0.99;
}

// The ground shaking (game/juice.js quake: a giant's stomp, his landing): the view trembles
// about where it looks, a jitter of a few sines (not noise: it rolls rather than buzzes), dying away
const jolt = new THREE.Quaternion(), joltAngles = new THREE.Euler();
function shake(dt) {
  tremor.t += dt;
  tremor.a *= Math.exp(-dt * 5);
  if (tremor.a < 1e-4) { tremor.a = 0; return; }
  const t = tremor.t, a = tremor.a;
  joltAngles.set(a * (Math.sin(t * 41) + 0.6 * Math.sin(t * 67 + 1.3)) / 1.6, a * 0.6 * Math.sin(t * 29 + 2.1),
    a * 0.8 * (Math.sin(t * 53 + 0.7) + 0.5 * Math.sin(t * 83)) / 1.5);
  camera.quaternion.multiply(jolt.setFromEuler(joltAngles));
}

const ease = t => t * t * (3 - 2 * t);
// the close view only while playing (the main menu shows the cube from above)
const goal = () => (state.mode === 'play' && cameraMode() === 'close' ? 1 : 0);
// straight into the view the settings ask for, no blend (tests)
export function settleCamera() { blend = goal(); arm = null; updateCamera(0); }

export function updateCamera(dt) {
  view.yaw += (view.yawTarget - view.yaw) * Math.min(1, dt * 8);
  view.zoom += (view.zoomTarget - view.zoom) * Math.min(1, dt * 8);
  const want = goal();
  // back to the overview (the key, the settings): it looks from one of its four sides again
  if (!want && blend > 0) view.yawTarget = snapYaw(view.yawTarget);
  if (state.mode !== 'play') blend = 0;
  else blend = want > blend ? Math.min(want, blend + dt / BLEND_TIME) : Math.max(want, blend - dt / BLEND_TIME);
  // hit kicks spring back
  const decay = Math.exp(-dt * 16);
  kick.x *= decay; kick.y *= decay; kick.z *= decay;
  overview(dt);
  if (blend > 0) close(dt);
  else arm = null;
  const t = ease(blend);
  if (t <= 0) { camera.position.copy(overPos); camera.quaternion.copy(overQuat); }
  else if (t >= 1) { camera.position.copy(closePos); camera.quaternion.copy(closeQuat); }
  else { camera.position.lerpVectors(overPos, closePos, t); camera.quaternion.slerpQuaternions(overQuat, closeQuat, t); }
  if (cine?.w > 0) intro(t);
  // the cube tipped (game/tilt.js): it tips down towards view.tilt about its middle, at the hero's
  // height; the camera goes round that the other way, so the world is drawn tipped where it is
  const tl = Math.hypot(view.tilt[0], view.tilt[1]);
  if (tl > 1e-5) {
    tiltQuat.setFromAxisAngle(tiltAxis.set(view.tilt[1] / tl, 0, -view.tilt[0] / tl), -tl);
    pivot.set(N / 2, player.y, N / 2);
    camera.position.sub(pivot).applyQuaternion(tiltQuat).add(pivot);
    camera.quaternion.premultiply(tiltQuat);
  }
  // the world rolled on the screen (game/roll.js): the camera turns about where it looks
  if (view.roll) camera.quaternion.multiply(rollQuat.setFromAxisAngle(VIEW_AXIS, view.roll));
  setSkyRoll(view.roll);   // (the sky is drawn on the screen: it rolls along)
  shake(dt);
  let fov = OVERVIEW_FOV + (closeFov() - OVERVIEW_FOV) * t;   // (the close view's: the settings)
  if (cine?.w > 0) fov += (cine.fov - fov) * cine.w;
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();
  fadeHero();
}

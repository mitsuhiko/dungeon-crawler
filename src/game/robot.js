// The robot in the world (docs/story.md "The robot"; what it does: core/robot.js, how it looks:
// render/robot.js). The first time the hero is out of the town it comes flying up from further in
// the cube, high over everything, and once it is close says hello (core/narration.js `robot`) with a
// cheer; from then on, and whenever the world is played again, it is with them: it comes in at
// their side as they enter it (game/flow.js settleIn). It does not talk over the story: while one
// is being told or waits its turn (the glassmaker's recording of the sword, still going as the
// hero steps out onto the road: game/narrator.js storyQuiet) it does not come yet, but once it has
// been quiet a moment (QUIET), wherever the hero is then, as long as it is out of the town.
//
// Every frame the hero's way gets its crumbs (where they really are: game/travel.js truePosition,
// through a slide across a side too; not down a well, through a fall or the town portal: those
// are jumps) and the robot flies on along it. It keeps a little to the side of the way, never
// right on the hero, not in a wall, drifts about a little while it waits, and faces where it
// flies, or the hero. Left behind in another cube it is drawn there while that shows (a slide
// carrying it away, a neighbour beside us); else it is out of sight until it comes through.
//
// It is in no fight and nobody's target: it is not an enemy, has no body, and the hover and the
// clicks never see it (game/lootlabels.js, game/pointer.js).
import * as THREE from 'three';
import { robotMet, robotComes, newWay, noteWay, stepWay, wayPoint, wayEnd, shortcut, beside, HELLO_NEAR, JUMP } from '../core/robot.js';
import { N } from '../core/constants.js';
import { cellAt, insideSolid } from '../physics/collide.js';
import { player, state } from './state.js';
import { truePosition, travelling, tripKind, leftCube } from './travel.js';
import { showsNeighbor } from '../render/neighbors.js';
import { narrate, speaking, storyQuiet } from './narrator.js';
import { drawRobot, hideRobot, robotCheer } from '../render/robot.js';
import { camera } from '../render/scene.js';
import { closeView } from './camera.js';

const COME_FROM = 7;     // cells away it comes flying from, the first time
const COME_UP = 2.5;     // ... and that much higher (over the trees)
const SIDE = 0.5;        // cells to the side of the way it keeps
const NEAR = 1.1;        // cells: never closer to the hero than this
const EASE = 5;          // 1/s: how closely it keeps to its place
const TURN = 5;          // 1/s: how quickly it turns
const SHORTCUT = 2.5;    // cells: the hero this close, but further along the way: the short way to them
const FLY = 1.1;         // cells/s: faster than this it flies (its clip), slower it hovers
const DRIFT = 0.25;      // cells it drifts about while it waits
const DRIFT_AFTER = 1.5; // s of waiting before it drifts
const QUIET = 1.5;       // s the story must have been quiet before it comes the first time

// { way (core/robot.js), at: where it is drawn, in cube at.k; yaw, said (its hello), wait (s still), side (+1 / -1) }
let robot = null;
// it is to come the first time (the hero was out of the town), once the story is quiet: for how
// long it has been (s); null: not yet due
let due = null;

export const robotHere = () => robot;
// game/flow.js: no robot (another world, back to the menu)
export function forgetRobot() { robot = null; due = null; hideRobot(); }

// where it comes flying up from the first time: further into the cube from where the hero is,
// up high
function comeFrom(p) {
  let dx = N / 2 - p.x, dz = N / 2 - p.z, d = Math.hypot(dx, dz);
  if (d < 2) { dx = Math.sin(p.yaw); dz = Math.cos(p.yaw); d = 1; }
  const clamp = v => Math.max(1, Math.min(N - 1, v));
  return { x: clamp(p.x + dx / d * COME_FROM), y: p.y + COME_UP, z: clamp(p.z + dz / d * COME_FROM) };
}

// game/flow.js settleIn: the hero is in this map now. The robot comes: met before (this world
// remembers its hello), at the hero's side at once; the first time out of the town, it is due
// (comes flying up once the story is quiet: updateRobot).
export function robotArrived(map) {
  if (robot || !state.run || state.mode !== 'play') return;
  if (robotMet(state.run)) come(true);
  else if (robotComes(map)) due ??= 0;
}
// it comes: at the hero's side, fading in (met), or flying up from afar (the first time)
function come(met) {
  const k = state.cubeKey, p = player;
  let way;
  if (met) {
    way = newWay(k, p.x, p.y, p.z);
    way.fade = 0; way.hop = { to: 0, out: false };   // (fading in)
  } else {
    const from = comeFrom(p);
    way = newWay(k, from.x, from.y, from.z);
    noteWay(way, k, p.x, p.y, p.z, Infinity);
  }
  const at = wayPoint(way);
  robot = { way, at: { k: at.k, x: at.x, y: at.y, z: at.z }, yaw: Math.atan2(p.x - at.x, p.z - at.z), said: met, wait: 0, side: 1, t: 0 };
}

const look = new THREE.Vector3();
const solidAt = (x, z, y) => cellAt(x, z) >= 0 && insideSolid(x, z, y);

// where it would like to be, at point p of its way: beside the way, not on the hero, not in a wall
// (nor, in the close view, in front of the camera)
function place(p, dt) {
  let x = p.x, z = p.z;
  const len = Math.hypot(p.dx, p.dz);
  if (len > 1e-3) { x -= p.dz / len * SIDE * robot.side; z += p.dx / len * SIDE * robot.side; }
  robot.wait = robot.way.speed < 0.2 ? robot.wait + dt : 0;
  const drift = Math.min(1, Math.max(0, robot.wait - DRIFT_AFTER)) * DRIFT;
  x += Math.sin(robot.t * 0.53) * drift; z += Math.sin(robot.t * 0.37 + 1.3) * drift;
  if (p.k === state.cubeKey) {
    const h = truePosition();
    // in the close view not between the camera and the hero: up beside them
    if (closeView()) {
      camera.getWorldDirection(look);
      const f = Math.hypot(look.x, look.z), fx = look.x / f, fz = look.z / f, back = (x - h.x) * fx + (z - h.z) * fz;
      if (f > 1e-3 && back < 0) { x -= fx * back; z -= fz * back; }
    }
    let dx = x - h.x, dz = z - h.z, d = Math.hypot(dx, dz);
    if (d < NEAR) {
      if (d < 1e-3) { dx = -Math.sin(player.yaw); dz = -Math.cos(player.yaw); d = 1; }
      x = h.x + dx / d * NEAR; z = h.z + dz / d * NEAR;
    }
    if (!travelling() && state.map && solidAt(x, z, p.y + 0.9)) { x = p.x; z = p.z; }
  }
  return { k: p.k, x, y: p.y, z };
}

// where cube k is drawn now: the cube we are in, the one a slide carries away, a neighbour shown
// beside us; null: out of sight
const shown = new THREE.Vector3();
function drawnAt(k) {
  if (k === state.cubeKey) return state.world ? { at: state.world.group.position, fade: state.world.group.userData.fade ?? 1 } : null;
  const left = leftCube();
  if (left) return left.key === k ? { at: left.group.position, fade: left.group.userData.fade ?? 1 } : null;
  const o = beside(k, state.cubeKey);
  return o && showsNeighbor(k) ? { at: shown.set(o[0], o[1], o[2]), fade: 1 } : null;
}

const scene = new THREE.Vector3();
// main.js, every frame of play (dt: game time, 0 while paused)
export function updateRobot(dt) {
  if (!robot && due !== null && state.mode === 'play' && state.map) {
    // due: once the story has been quiet a moment, and the hero is out of the town, in a cube
    due = storyQuiet() ? due + dt : 0;
    if (due >= QUIET && !state.transitioning && robotComes(state.map)) { due = null; come(false); }
  }
  if (!robot || state.mode !== 'play' || !state.map) { hideRobot(); return; }
  const w = robot.way;
  robot.t += dt;
  if (dt > 0) {
    // the hero's way: where they are, unless they are on their way somewhere else than across a side
    if ((!state.transitioning || tripKind() === 'side') && !player.vanished) {
      const p = truePosition();
      noteWay(w, state.cubeKey, p.x, p.y, p.z);
    }
    const here = wayPoint(w);
    if (here.k === state.cubeKey && !state.transitioning && !w.hop) {
      const d = Math.hypot(player.x - here.x, player.z - here.z);
      if (d < SHORTCUT && wayEnd(w) - w.s > d + 3) shortcut(w, state.cubeKey, player.x, player.y, player.z);
    }
    stepWay(w, dt, here.k !== state.cubeKey);
  }
  // its place, eased (across a side: into that cube's coordinates; over a jump, or far: there at once)
  const p = wayPoint(w), want = place(p, dt), at = robot.at;
  const o = beside(at.k, want.k);
  if (o) { at.x += o[0]; at.y += o[1]; at.z += o[2]; at.k = want.k; }
  const was = { x: at.x, z: at.z };
  if (!o || Math.hypot(want.x - at.x, want.z - at.z) > 2 * JUMP) Object.assign(at, want);
  else {
    const k = 1 - Math.exp(-EASE * dt);
    at.x += (want.x - at.x) * k; at.y += (want.y - at.y) * k; at.z += (want.z - at.z) * k;
  }
  // facing: where it flies, else the hero (if it can see them)
  const speed = dt > 0 ? Math.hypot(at.x - was.x, at.z - was.z) / dt : 0, h = truePosition();
  const voice = speaking(), talking = voice === 'robot';
  let face = robot.yaw;
  if (speed > FLY && !talking) face = Math.atan2(at.x - was.x, at.z - was.z);
  else if (at.k === state.cubeKey) face = Math.atan2(h.x - at.x, h.z - at.z);
  robot.yaw += Math.atan2(Math.sin(face - robot.yaw), Math.cos(face - robot.yaw)) * Math.min(1, dt * TURN);
  // its hello, once it is close (the first time: the world keeps it, core/robot.js robotMet)
  if (!robot.said && at.k === state.cubeKey && !state.transitioning && Math.hypot(h.x - at.x, h.z - at.z) < HELLO_NEAR) {
    robot.said = true;
    robotCheer();
    narrate('robot', { what: 'hello' }, { delay: 0.6 });
  }
  const where = drawnAt(at.k);
  drawRobot(where && scene.set(at.x, at.y, at.z).add(where.at), robot.yaw, where ? w.fade * where.fade : 0,
    talking ? 'talk' : speed > FLY ? 'fly' : 'hover', dt);
}

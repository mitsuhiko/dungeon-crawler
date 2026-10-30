// The robot in the world (docs/story.md "The robot"; what it does: core/robot.js, how it looks:
// render/robot.js). It lies asleep on its back by the crash in town (robotLies), its core only
// glimmering, the glassmaker's sword in the ground beside it, until the hero comes near
// (WAKE_SEE): in a short scene (game/scene.js, core/scenes.js `robot`) the camera goes to it and it
// wakes (wakeRobot). A click on it (hovered and labelled like everything clicked:
// game/lootlabels.js; the click walks them up to it, game/orders.js) or the action key beside it
// (game/action.js) wakes it too. Waking, whatever is being said is cut short (game/narrator.js cut),
// it opens its eyes, lifts off and shakes itself (WAKE s), and says hello (core/narration.js
// `robot`) as it does, then tells the hero to take the sword; only then it follows. From then on, and whenever the
// world is played again, it is with them: it comes in at their side as they enter it (game/flow.js
// settleIn).
//
// Every frame the hero's way gets its crumbs (where they really are: game/travel.js truePosition,
// through a slide across a side too; not down a well, through a fall or the town portal: those
// are jumps) and the robot flies on along it. It keeps a little to the side of the way, never
// right on the hero, not in a wall, drifts about a little while it waits, and faces where it
// flies, or the hero. It flies round everyone, never through them: the hero, the friends and the
// enemies here (to the side, or over one where that is a wall: avoid). Left behind in another
// cube it is drawn there while that shows (a slide carrying it away, one of the surroundings near
// us: game/drawn.js); else it is out of sight until it comes through.
//
// It is in no fight and nobody's target: it is not an enemy, has no body, and the hover and the
// clicks never see it (game/lootlabels.js, game/pointer.js).
//
// It pulls the hero out of what would kill them in a fluid, and catches them falling through the
// void (game/rescue.js): meanwhile it is where that says (rescuePose: swooping over to them, then
// carrying them, its clip RobotCarry), and its way starts again from where it lets go.
//
// Playing together everyone sees everyone's robot: ours goes along in our `me` (robotWord), and
// the others' are drawn here as their games fly them (showOtherRobot, render/robot.js).
import * as THREE from 'three';
import { robotMet, robotLies, newWay, noteWay, stepWay, wayPoint, wayEnd, shortcut, beside, JUMP, WAKE, WAKE_REACH, HELLO_AFTER } from '../core/robot.js';
import { CHAR_R, CHAR_H } from '../core/constants.js';
import { cellAt, insideSolid } from '../physics/collide.js';
import { player, state } from './state.js';
import { truePosition, travelling, tripKind } from './travel.js';
import { drawnAt } from './drawn.js';
import { narrate, speaking, cut } from './narrator.js';
import { drawRobot, hideRobot, robotClip, robotWake, drawOtherRobot } from '../render/robot.js';
import { msg } from '../i18n/i18n.js';
import { partnerAt } from '../render/partner.js';
import { allEnemies } from './enemies.js';
import { online } from '../net/online.js';
import { lerpAngle } from '../net/sync.js';
import { ROBOT_CLIPS } from '../net/protocol.js';
import { camera } from '../render/scene.js';
import { closeView } from './camera.js';
import { rescuePose } from './rescue.js';
import { playScene, scenePlaying } from './scene.js';
import { INTRO_GATES } from '../core/intro.js';
import { introPlaying } from './bossintro.js';
import { curtained } from './hud.js';

const SIDE = 0.5;        // cells to the side of the way it keeps
const NEAR = 1.1;        // cells: never closer to the hero than this
const EASE = 5;          // 1/s: how closely it keeps to its place
const TURN = 5;          // 1/s: how quickly it turns
const SHORTCUT = 2.5;    // cells: the hero this close, but further along the way: the short way to them
const FLY = 1.1;         // cells/s: faster than this it flies (its clip), slower it hovers
const DRIFT = 0.25;      // cells it drifts about while it waits
const DRIFT_AFTER = 1.5; // s of waiting before it drifts
const CLEAR = 0.45;      // cells it keeps from anyone's body (its half width with the wings, and a little)
const LOW = 0.65, HIGH = 1.15;   // how high its body is over its feet (blender/robot.py: its middle 0.9)
const SNAP = 2;          // cells: another's robot further than this between two words is not blended

// { way (core/robot.js), at: where it is drawn, in cube at.k; yaw, wait (s still), side (+1 / -1),
// waking (s of waking left: it stays where it lay) }
let robot = null;

export const robotHere = () => robot;
// game/flow.js: no robot (another world, back to the menu)
export function forgetRobot() { robot = null; hideRobot(); }
// game/rescue.js: the hero needs it now; still waking up, it is up at once
export function rouseRobot() { if (robot?.waking > 0) robot.waking = 0; }

// game/flow.js settleIn: the hero is in this map now. Woken before (this world remembers its
// hello), it comes in at their side; else it may lie asleep here (sleepingRobot)
export function robotArrived() {
  if (robot || !state.run || state.mode !== 'play') return;
  if (robotMet(state.run)) come();
}
// it comes, at the hero's side, fading in
function come() {
  const k = state.cubeKey, p = player, way = newWay(k, p.x, p.y, p.z);
  way.fade = 0; way.hop = { to: 0, out: false };   // (fading in)
  robot = { way, at: { k, x: p.x, y: p.y, z: p.z }, yaw: p.yaw, wait: 0, side: 1, t: 0, waking: 0 };
}

// It asleep where it lies in this cube, as a thing to click (game/lootlabels.js: its body, its
// label; game/orders.js, game/action.js wake it): { id, robot, x, y, z, yaw, title, labelY }, or null
const SLEEPER_YAW = 2.2;   // (how it lies: turned towards the street from the crash, the town turned with it)
export function sleepingRobot() {
  if (robot || state.mode !== 'play' || !robotLies(state.map, state.run)) return null;
  const { x, y, z } = state.map.relics.robot;
  return { id: 'robot', robot: true, x, y, z, yaw: SLEEPER_YAW + (state.map.town.yaw ?? 0), title: msg('Robot of star-glass'), labelY: 0.75 };
}
// ... in another of the town's tiles, where that shows (game/drawn.js): where it lies in the scene,
// how much of it shows (null: not there)
function sleepingNearby() {
  const k = state.cubes?.town?.portal, m = k && k !== state.cubeKey && state.map?.town ? state.cubes.cubes.get(k)?.map : null;
  if (!m || !robotLies(m, state.run)) return null;
  const where = drawnAt(k);
  if (!where) return null;
  const { x, y, z } = m.relics.robot;
  return { x: x + where.at.x, y: y + where.at.y, z: z + where.at.z, yaw: SLEEPER_YAW + (m.town.yaw ?? 0), fade: where.fade };
}
// can the hero wake it from where they stand?
export const canWakeRobot = r => !!r && Math.hypot(r.x - player.x, r.z - player.z) <= WAKE_REACH && Math.abs(r.y - player.y) < 1;
// The hero wakes it: what is being said is cut short, it wakes where it lay and says hello as it
// does (the world keeps that it woke: its hello told). true if it woke.
export function wakeRobot(r = sleepingRobot()) {
  if (!r || robot) return false;
  cut(() => true);
  const k = state.cubeKey, way = newWay(k, r.x, r.y, r.z);
  robot = { way, at: { k, x: r.x, y: r.y, z: r.z }, yaw: r.yaw, wait: 0, side: 1, t: 0, waking: WAKE };
  robotWake();
  narrate('robot', { what: 'hello' }, { delay: HELLO_AFTER });
  // (said after its hello: the sword beside it, while it is still in the ground)
  if (!state.run.unlockedGates.has(INTRO_GATES.sword)) narrate('robot', { what: 'sword' }, { delay: HELLO_AFTER });
  return true;
}

// The hero comes by the crash: this close, it wakes, in its scene (the camera goes to it; playing
// together it just wakes)
const WAKE_SEE = 6;   // cells
let sleepOn = false;   // (tests/browser/: it stays asleep, to be hovered)
export function keepAsleep(on) { sleepOn = !!on; }
function wakeOnSight(r) {
  if (sleepOn || state.transitioning || curtained() || scenePlaying() || introPlaying() || player.hp <= 0 || player.ragdoll) return;
  if (Math.hypot(r.x - player.x, r.z - player.z) > WAKE_SEE || Math.abs(r.y - player.y) > 1.5) return;
  playScene('robot', { spot: { x: r.x, y: r.y + 0.2, z: r.z }, on: { wake: () => wakeRobot(sleepingRobot() ?? undefined) } });
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


// Everyone it keeps out of the way of, in our cube's coordinates: the hero, the friends as they are
// drawn here (render/partner.js) and the enemies alive here ({ x, y, z, r, h } each)
function bodies() {
  const list = [];
  if (!player.vanished) { const h = truePosition(); list.push({ x: h.x, y: h.y, z: h.z, r: CHAR_R, h: CHAR_H }); }
  for (const slot of online.peers.keys()) {
    const p = partnerAt(slot);
    if (p) list.push({ x: p.x, y: p.y, z: p.z, r: CHAR_R, h: CHAR_H });
  }
  for (const e of allEnemies()) {
    if (e.mode === 'dead' || e.mode === 'gone' || e.mode === 'hide' || e.under || !e.profile) continue;
    list.push({ x: e.x, y: e.y, z: e.z, r: e.profile.radius ?? 0.3, h: e.profile.height ?? 1 });
  }
  return list;
}
// p ({ x, y, z } in cube k) out of the way of every body in `list`: round it to the side, or, where
// that is a wall, over it
function avoid(p, k, list) {
  const o = k === state.cubeKey ? [0, 0, 0] : beside(k, state.cubeKey);
  if (!o || !list.length) return p;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of list) {
      const bx = b.x - o[0], by = b.y - o[1], bz = b.z - o[2];
      if (p.y + LOW >= by + b.h || p.y + HIGH <= by) continue;   // over or under it
      let dx = p.x - bx, dz = p.z - bz, d = Math.hypot(dx, dz);
      const need = b.r + CLEAR;
      if (d >= need) continue;
      if (d < 1e-3) { dx = Math.cos(robot.yaw); dz = -Math.sin(robot.yaw); d = 1; }   // (to its side)
      const x = bx + dx / d * need, z = bz + dz / d * need;
      if (k === state.cubeKey && !travelling() && state.map && solidAt(x, z, p.y + 0.9)) p.y = by + b.h - LOW + 0.05;
      else { p.x = x; p.z = z; }
    }
  }
  return p;
}

const scene = new THREE.Vector3(), ZERO = new THREE.Vector3();
// main.js, every frame of play (dt: game time, 0 while paused)
export function updateRobot(dt) {
  const asleep = sleepingRobot();
  if (asleep) {
    drawRobot(scene.set(asleep.x, asleep.y, asleep.z).add(drawnAt(state.cubeKey)?.at ?? ZERO), asleep.yaw, 1, 'dormant', dt);
    if (dt > 0) wakeOnSight(asleep);
    return;
  }
  // asleep in the town's tile beside this one (docs/town.md): seen there, among the surroundings
  const far = !robot && sleepingNearby();
  if (far) { drawRobot(scene.set(far.x, far.y, far.z), far.yaw, far.fade, 'dormant', dt); return; }
  if (!robot || state.mode !== 'play' || !state.map) { hideRobot(); return; }
  // carrying the hero out of a fluid (game/rescue.js): there, and on from there once it lets go
  const carry = !(robot.waking > 0) && rescuePose();
  if (carry) {
    const k = state.cubeKey, where = drawnAt(k);
    robot.at = { k, x: carry.x, y: carry.y, z: carry.z };
    robot.way = newWay(k, carry.x, carry.y, carry.z);
    robot.yaw = carry.yaw; robot.clip = carry.clip; robot.wait = 0;
    // (sliding up into the cube a fall started in, it shows as the hero does, not fading in with the cube)
    drawRobot(where && scene.set(carry.x, carry.y, carry.z).add(where.at), robot.yaw, where ? carry.fade * (travelling() ? 1 : where.fade) : 0, carry.clip, dt);
    return;
  }
  const w = robot.way;
  robot.t += dt;
  if (robot.waking > 0) {   // waking where it lay: it follows once it is up (the hero's way waits for it)
    robot.waking = Math.max(0, robot.waking - dt);
    if (dt > 0 && !state.transitioning && !player.vanished) { const p = truePosition(); noteWay(w, state.cubeKey, p.x, p.y, p.z); }
    const where = drawnAt(robot.at.k);
    if (robot.waking === 0 && robot.at.k === state.cubeKey) robot.yaw = Math.atan2(player.x - robot.at.x, player.z - robot.at.z);
    robot.clip = 'wake';
    drawRobot(where && scene.set(robot.at.x, robot.at.y, robot.at.z).add(where.at), robot.yaw, where ? where.fade : 0, 'wake', dt);
    return;
  }
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
  const p = wayPoint(w), near = bodies(), want = avoid(place(p, dt), p.k, near), at = robot.at;
  const o = beside(at.k, want.k);
  if (o) { at.x += o[0]; at.y += o[1]; at.z += o[2]; at.k = want.k; }
  const was = { x: at.x, z: at.z };
  if (!o || Math.hypot(want.x - at.x, want.z - at.z) > 2 * JUMP) Object.assign(at, want);
  else {
    const k = 1 - Math.exp(-EASE * dt);
    at.x += (want.x - at.x) * k; at.y += (want.y - at.y) * k; at.z += (want.z - at.z) * k;
    avoid(at, at.k, near);   // (and on its way there: never through anyone)
  }
  // facing: where it flies, else the hero (if it can see them)
  const speed = dt > 0 ? Math.hypot(at.x - was.x, at.z - was.z) / dt : 0, h = truePosition();
  const voice = speaking(), talking = voice === 'robot';
  let face = robot.yaw;
  if (speed > FLY && !talking) face = Math.atan2(at.x - was.x, at.z - was.z);
  else if (at.k === state.cubeKey) face = Math.atan2(h.x - at.x, h.z - at.z);
  robot.yaw += Math.atan2(Math.sin(face - robot.yaw), Math.cos(face - robot.yaw)) * Math.min(1, dt * TURN);
  const where = drawnAt(at.k);
  robot.clip = talking ? 'talk' : speed > FLY ? 'fly' : 'hover';
  drawRobot(where && scene.set(at.x, at.y, at.z).add(where.at), robot.yaw, where ? w.fade * where.fade : 0, robot.clip, dt);
}

// Playing together everyone sees everyone's robot. Ours, for the `me` we send (net/session.js): [cube,
// x, y, z, yaw, fade, clip] (clip: its index in ROBOT_CLIPS, a cheer too), or null: none
const r3 = x => Math.round(x * 1000) / 1000;
export function robotWord() {
  if (!robot || state.mode !== 'play' || !state.map) return null;
  const a = robot.at;
  return [a.k, r3(a.x), r3(a.y), r3(a.z), r3(robot.yaw), r3(robot.way.fade), Math.max(0, ROBOT_CLIPS.indexOf(robotClip(robot.clip ?? 'hover')))];
}
// player `slot`'s robot, between their two words a and b (k of the way: net/sync.js Timeline.at;
// each word's `robot` read by net/protocol.js robotOf), drawn where its cube shows here (null: hidden)
export function showOtherRobot(slot, span) {
  const a0 = span?.a, b = span?.b;
  if (!b || state.mode !== 'play' || !state.map) { drawOtherRobot(slot, null); return; }
  const where = drawnAt(b.k);
  if (!where) { drawOtherRobot(slot, null); return; }
  let x = b.x, y = b.y, z = b.z, yaw = b.yaw;
  const o = a0 && beside(a0.k, b.k), k = Math.min(1, Math.max(0, span.k));
  if (o && Math.hypot(a0.x + o[0] - b.x, a0.z + o[2] - b.z) < SNAP) {
    x = a0.x + o[0] + (b.x - a0.x - o[0]) * k; y = a0.y + o[1] + (b.y - a0.y - o[1]) * k; z = a0.z + o[2] + (b.z - a0.z - o[2]) * k;
    yaw = lerpAngle(a0.yaw, b.yaw, k);
  }
  drawOtherRobot(slot, scene.set(x, y, z).add(where.at), yaw, b.fade * where.fade, b.clip);
}

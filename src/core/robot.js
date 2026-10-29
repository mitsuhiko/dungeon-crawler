// The robot (docs/story.md, "The robot"): the hero's companion, a clockwork of star-glass. Pure:
// when it comes, and how it follows; game/robot.js puts it in the world, render/robot.js draws it.
//
// It lies on its back in the merchant camp, asleep (map.relics.robot, world/town.js CAMP_ROBOT:
// robotLies), the glassmaker's sword beside it, until the hero comes into the camp (game/robot.js:
// in a short scene), or clicks it (or uses it with the action key) and comes up to it (WAKE_REACH).
// Then it wakes (its clip RobotWake, WAKE s), cutting short whatever is being said, and says hello
// (core/narration.js, the moment `robot`, HELLO_AFTER s in): it remembers nothing, only that it is
// glass. From then on it goes wherever they go.
// The world keeps that it woke: its hello told (run.told, saved with the world), so it is there
// with the hero from then on, in the town too.
//
// It follows the hero's way, not the hero: the way is a trail of crumbs where the hero went (a
// crumb every SPACING cells, each in its cube's coordinates), and the robot flies along it,
// FOLLOW cells behind them. So it goes round what they went round, through the gates and doors
// they went through, and it can be a cube or two behind. It flies at CRUISE when close, faster
// the further behind it is (PULL), so it falls back a little while the hero runs and catches up
// once they stop: from anywhere on its way in a few seconds, and never more than MAX_LAG behind.
// Where the way does not go on (a door into a house, a well, the town portal, coming back after a
// death: a jump), it fades out where it is and in again where the hero came out (BLINK).
//
// It is not in any fight: no enemy sees it, nothing hits it, and it is never in the way (it has
// no body; it flies round the heroes and the enemies: game/robot.js avoid). It has a light of its
// own (render/robot.js).
import { N } from './constants.js';
import { parse } from '../world/coords.js';
import { LINES } from './narration.js';

export const SPACING = 0.35;     // cells between two crumbs of the way
export const JUMP = 1.5;         // cells: a crumb further than this from the last is a jump
export const JUMP_COST = 2;      // cells a jump counts for on the way (the time it takes)
export const BLINK = 0.3;        // s it takes to fade out before a jump (and in again after it)
export const FOLLOW = 1.6;       // cells along the way it keeps behind the hero
export const CRUISE = 2.1;       // cells/s it flies at, close behind (a little slower than the hero runs)
export const PULL = 0.6;         // 1/s: that much faster for every cell further behind
export const TOP = 6;            // cells/s at most where the hero can see it
export const TOP_AWAY = 10;      // ... and in another cube
export const BRAKE = 3;          // 1/s: it slows down as it comes to its place (speed: the way left times this)
export const ACCEL = 4;          // 1/s: how quickly its speed follows
export const MAX_LAG = 60;       // cells along the way: further behind, it jumps ahead
export const WAKE_REACH = 1.2;   // cells: this close, the hero wakes it (the click walks them there)
export const WAKE = 3.6;         // s it takes to wake (its clip RobotWake: blender/robot.py), before it follows
export const HELLO_AFTER = 1.3;  // s into waking it says hello (its eyes are open: RobotWake's wake_frame)

// what it says when it comes (core/narration.js): the world keeps that it came by keeping these told
// (all of them at once; one is enough: a world saved before its hello changed told the old lines)
export const HELLO = LINES.filter(l => l.on === 'robot' && l.when?.what === 'hello');
export const robotMet = run => HELLO.some(l => run.told.has(l.id));
// it came already (the dev tools skip the beginning, and with it its coming: game/intro.js)
export function meetRobot(run) { for (const l of HELLO) run.told.add(l.id); }
// does it lie asleep in this map (the merchant camp, where it lies: map.relics.robot), for a world
// where it has not woken yet (run)?
export const robotLies = (map, run) => !!map?.merchantCamp && !!map.relics?.robot && !!run && !robotMet(run);

// From cube `from` to cube `to` beside it on the same depth (a side's neighbour): what to add to a
// point in `from`'s coordinates to have it in `to`'s ([dx, dy, dz]); null for any other two (a house,
// a cube above or below, further off)
export function beside(from, to) {
  if (from === to) return [0, 0, 0];
  const a = parse(from), b = parse(to);
  if (a.length !== 3 || b.length !== 3 || [...a, ...b].some(n => !Number.isFinite(n))) return null;
  const dx = a[0] - b[0], dz = a[2] - b[2];
  return a[1] === b[1] && Math.abs(dx) + Math.abs(dz) === 1 ? [dx * N, 0, dz * N] : null;
}

// a way starting at (x, y, z) in cube k: the crumbs (at: cells along the way to it; jump: it
// cannot be flown to from the one before), where the robot is on it (s: cells along it), how fast
// it flies (speed), how much of it shows (fade, 0..1) and a jump it is fading over (hop: { to, out })
export const newWay = (k, x, y, z) => ({ crumbs: [{ k, x, y, z, at: 0, jump: false }], s: 0, speed: 0, fade: 1, hop: null });

// how far crumb c is from (x, y, z) in cube k: Infinity if it cannot be flown (another cube not beside it)
function apart(c, k, x, y, z) {
  const o = beside(c.k, k);
  return o ? Math.hypot(c.x + o[0] - x, c.y + o[1] - y, c.z + o[2] - z) : Infinity;
}

// the hero is at (x, y, z) in cube k: a crumb, if they went on far enough (or into another cube).
// jumpAt: cells from the last crumb that make a jump (Infinity: flown however far, its first
// flight to the hero: game/robot.js)
export function noteWay(w, k, x, y, z, jumpAt = JUMP) {
  const last = w.crumbs.at(-1), d = apart(last, k, x, y, z);
  if (last.k === k && d < SPACING) return;
  const jump = d > jumpAt || !Number.isFinite(d);
  w.crumbs.push({ k, x, y, z, at: last.at + (jump ? JUMP_COST : d), jump });
}
export const wayEnd = w => w.crumbs.at(-1).at;

// the hero came back close to it the short way: the way left is cut to a straight line to them
// (else it would fly the long way round they took to come back)
export function shortcut(w, k, x, y, z) {
  const p = wayPoint(w), end = wayEnd(w);
  w.crumbs = [{ k: p.k, x: p.x, y: p.y, z: p.z, at: w.s, jump: false }];
  noteWay(w, k, x, y, z, Infinity);
  w.crumbs.at(-1).at = Math.min(w.crumbs.at(-1).at, end);   // (never longer than it was)
}

// where it is on its way: { k, x, y, z } in cube k, and which way the way goes there (dx, dz)
export function wayPoint(w) {
  const c = w.crumbs;
  let i = 0;
  while (i < c.length - 1 && c[i + 1].at <= w.s) i++;
  const a = c[i], b = c[i + 1];
  if (!b) {
    const p = c[i - 1], o = p ? beside(p.k, a.k) : null;
    return { k: a.k, x: a.x, y: a.y, z: a.z, dx: o && !a.jump ? a.x - p.x - o[0] : 0, dz: o && !a.jump ? a.z - p.z - o[2] : 0 };
  }
  // (over a jump: past its start, at its end: game/robot.js shows nothing in between)
  if (b.jump) return w.s > a.at ? { k: b.k, x: b.x, y: b.y, z: b.z, dx: 0, dz: 0 } : { k: a.k, x: a.x, y: a.y, z: a.z, dx: 0, dz: 0 };
  const t = b.at > a.at ? (w.s - a.at) / (b.at - a.at) : 1;
  // across a side (two cubes): in the coordinates of the cube it is in the most
  const into = t >= 0.5, o = into ? beside(a.k, b.k) : beside(b.k, a.k);
  const [from, to] = into ? [{ x: a.x + o[0], y: a.y + o[1], z: a.z + o[2] }, b] : [a, { x: b.x + o[0], y: b.y + o[1], z: b.z + o[2] }];
  return { k: into ? b.k : a.k, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t,
    dx: to.x - from.x, dz: to.z - from.z };
}

// it flies on along its way for dt s; away: it is in another cube than the hero (nobody sees it:
// it may go faster)
export function stepWay(w, dt, away = false) {
  const end = wayEnd(w);
  if (w.hop) {   // fading out before a jump, then in after it
    if (w.hop.out) {
      w.fade = Math.max(0, w.fade - dt / BLINK);
      if (w.fade === 0) { w.s = w.hop.to; w.hop.out = false; }
    } else {
      w.fade = Math.min(1, w.fade + dt / BLINK);
      if (w.fade === 1) w.hop = null;
    }
    w.speed = 0;
  } else if (end - w.s > MAX_LAG) {   // far behind: on ahead, to just behind the hero
    w.hop = { to: end - FOLLOW, out: true };
    w.speed = 0;
  } else {
    const left = end - FOLLOW - w.s;
    const want = left <= 0 ? 0 : Math.min(CRUISE + PULL * left, away ? TOP_AWAY : TOP, left * BRAKE + 0.3);
    w.speed = away ? want : w.speed + (want - w.speed) * Math.min(1, dt * ACCEL);
    let s = Math.min(w.s + w.speed * dt, Math.max(w.s, end - FOLLOW));
    // a jump ahead: up to where it starts, and over it
    const jump = w.crumbs.find(c => c.jump && c.at > w.s && c.at - JUMP_COST <= s);
    if (jump) { s = jump.at - JUMP_COST; w.hop = { to: jump.at, out: true }; }
    w.s = s;
  }
  // the crumbs behind it go (one before it stays: where it is comes from it)
  const c = w.crumbs;
  let drop = 0;
  while (drop < c.length - 2 && c[drop + 1].at <= w.s) drop++;
  if (drop) c.splice(0, drop);
}

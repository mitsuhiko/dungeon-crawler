// The robot's rescue (docs/story.md "The robot", "It pulls you out"): pure, its timing and its
// flight; game/rescue.js runs it. Once the robot is with the hero, what would kill them in a fluid
// does not: lava or acid they fall into, the mud or slime of a boss that closes over their head
// (physics/fluid.js peril), or water with no way out of it (physics/swimout.js). It costs a share of
// their most health (SHARE: none for water), and the robot zips over to them (REACH s), grabs them
// by the hands (they hang from it: their clip Hang, its RobotCarry), pulls them up out of it (LIFT)
// and flies them along an arc over to safe ground (SPEED, at most RISE over the higher end, kept
// under the ceiling), lowers them onto it (SET) and lets go. Only if that share is all they have
// left does it kill, as it does a hero with no robot yet (it lies asleep at the crash in town).
//
// It catches them out of the void too (game/rescue.js catchFall): a fall through a hole into the
// piece below (once that is found: game/fall.js), or out of a piece with nothing below. They slow
// to a hover while it dives down to them (DIVE s, from DIVE_FROM over them, sagging SAG more), and
// it pulls them up (LIFT), back up the hole (up into the piece the fall started in, if it went
// into the one below: game/travel.js 'lift'), and flies them on to safe ground. It costs
// FALL_SHARE of their most health; when that is all they have left, it takes all of it: they die.
import { WATER, LAVA, ACID, MUD } from './constants.js';

export const RESCUE = {
  reach: 0.5,       // s the robot takes to get to the hero (from wherever it is)
  lift: 0.45,       // s it pulls them up out of the fluid before it flies
  speed: 4.5,       // cells/s it carries them, at most
  carry: [0.8, 3],  // s the flight takes, at least and at most
  rise: 1.4,        // cells over the higher end it flies, at most
  set: 0.3,         // s it lowers them onto the spot (the end of the flight, slowing down)
  grace: 1.5,       // s after it let go before an enemy may strike
  trapped: 2,       // s swimming with no way out of the water before it comes
  tire: 8,          // ... and before the hero drowns, with no robot
  dive: 0.35,       // s it takes to get to a hero falling through the void (they slow to a hover)
  diveFrom: 3,      // cells over them it dives down from
  sag: 0.35,        // cells they still drop meanwhile
  climb: 6,         // cells/s it carries them straight up the hole they fell through, at most
  over: 0.3,        // cells over the floor they fell from it carries them out of the hole
  clear: 2.5,       // cells over the ground a fall into the piece below comes out at least (caught in time)
};

// what it costs, of the most health: by the fluid (and the look of a boss's water: his mud, his
// slime, as much as lava); clear water nothing
export const SHARE = { [LAVA]: 0.25, [ACID]: 0.25, [WATER]: 0, [MUD]: 0.25, slime: 0.25 };
export const shareOf = (fluid, look) => fluid === WATER && look ? (look === MUD ? SHARE[MUD] : SHARE.slime) : SHARE[fluid] ?? 0.25;
// what catching them out of the void costs, of the most health
export const FALL_SHARE = 0.25;
// the health a share of maxHp is (whole points, at least one for any share)
export const lossOf = (maxHp, share) => share > 0 ? Math.ceil(maxHp * share) : 0;

// How far the robot's feet are over the hero's while it carries them: the Hang clip's grip, the
// fists up at the top of the head (blender/character.py HANG_GRIP: 1.08), less where they hold its
// egg, round its bottom (blender/robot.py: its middle 0.9 over its feet, the egg 0.2 under that):
// it sits on the top of their head
export const GRIP = 0.36;
// how much room the carried hero needs over their feet (the hero, their arms up, the robot on top)
export const CARRIED_H = GRIP + 1.15;

const lerp = (a, b, t) => a + (b - a) * t;
// a point of the cubic Bézier a, p, q, b at t
const bez = (a, p, q, b, t) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * p + 3 * u * t * t * q + t * t * t * b;
};

// The flight from a to b ({ x, y, z } each, the hero's feet): up out of a, over at `top` (at most
// RISE over the higher end), down onto b. ceiling(x, z, y) -> the lowest underside over y there
// (physics/collide.js ceilingAt) keeps it under the roof. { at(t) -> { x, y, z }, length, time, top }
export function flight(a, b, ceiling = () => Infinity) {
  const hi = Math.max(a.y, b.y);
  let top = hi + RESCUE.rise;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t);
    top = Math.min(top, ceiling(x, z, lerp(a.y, b.y, t) + 0.2) - CARRIED_H);
  }
  top = Math.max(top, hi + 0.3);
  const at = t => ({ x: bez(a.x, a.x, b.x, b.x, t), y: bez(a.y, top, top, b.y, t), z: bez(a.z, a.z, b.z, b.z, t) });
  let length = 0, prev = at(0);
  for (let i = 1; i <= 24; i++) { const p = at(i / 24); length += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z); prev = p; }
  const time = Math.min(RESCUE.carry[1], Math.max(RESCUE.carry[0], length / RESCUE.speed));
  return { at, length, time, top };
}

// how far along the flight it is (0..1) after s of its `time`: slow to start, slowing down at the end
export const along = (s, time) => { const t = Math.min(1, Math.max(0, s / time)); return t * t * (3 - 2 * t); };

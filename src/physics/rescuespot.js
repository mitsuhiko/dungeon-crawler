// Where the robot takes the hero it pulls out of a fluid (game/rescue.js): where they last stood
// safely (player.safe), else the nearest floor that leads on (map.safe; in a boss's arena, a floor of
// the fight: map floors `encounter`), else a platform (game/movers.js); dry (no standing fluid over
// it, nothing that takes them), and over a fluid that comes and goes (a boss's tide, his mud, a
// trial's) by OVER if any such spot is, else just over it (the top of Foggery's tower, his
// platforms, once his lava is that high). The nearest wins, a step up or down counting double.
import { LH } from '../core/constants.js';
import { floorY } from '../core/surfaces.js';
import { player, state } from '../game/state.js';
import { supportedPoint } from './respawn.js';
import { groundAt, moversNow } from './collide.js';
import { standingAt, trialFluid, peril } from './fluid.js';

export const OVER = 1.6;   // how far over a fluid that comes and goes a spot must stand (if any does)

// a spot is dry: no standing fluid over it (a boss's tide or mud, a trial's water)
function dry(s) {
  const f = standingAt(s.x, s.z);
  if (f && f.y > s.y - 0.02) return false;
  return !peril(groundAt(s.x, s.z, s.y + 0.05, 0), s.y + 0.01);
}

// p ({ x, y, z }) if the hero can be set down there: supported (physics/respawn.js) and dry, unless
// `wet` (a trial's water that drains as the robot comes: game/rescue.js); else null
export function spotAt(p, wet = false) {
  const q = p && supportedPoint(p.x, p.y, p.z);
  return q && (wet || dry(q)) ? q : null;
}

// where the robot takes the hero from (x, y, z): { x, y, z } or null (nowhere)
export function spotFor(x, y, z) {
  const m = state.map;
  if (!m) return null;
  const level = Math.max((state.tide ?? -Infinity) * LH, trialFluid()?.y ?? -Infinity);
  const fight = m.floors.filter(f => f.encounter && !f.fluid);
  const floors = (fight.length ? fight : m.floors.filter(f => !f.fluid && !f.crust && (!m.safe || m.safe[f.id])))
    .map(f => ({ x: f.x + 0.5, y: floorY(f, 0.5, 0.5), z: f.z + 0.5 }));
  const platforms = moversNow().map(p => ({ x: (p.x0 + p.x1) / 2, y: p.y1, z: (p.z0 + p.z1) / 2, platform: true }));
  const safe = player.safe && { ...player.safe, first: true };
  const near = s => s.first ? -1 : Math.hypot(s.x - x, (s.y - y) * 2, s.z - z);
  for (const over of [OVER, 0.05]) {
    const list = [safe, ...floors, ...platforms].filter(s => s && s.y > level + over).sort((a, b) => near(a) - near(b));
    for (const s of list) {
      if (s.platform) return { x: s.x, y: s.y, z: s.z };
      const p = supportedPoint(s.x, s.y, s.z);
      if (p && dry(p)) return p;
    }
  }
  return null;
}


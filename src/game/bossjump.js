// A big boss's jump onto the player (Giant Squarlo's, game/squarlo.js: an attack's `jump` with a
// stomp beam, its shadow): the shadow shows on the floor
// he can land on nearest the player (in the arena, `edge` cells clear of the cube's sides: off its
// bank) and follows them there (jump.track cells/s) until it holds still at the last (beam.lock);
// he crouches, springs off at jump.from and flies (core/squarlo.js jumpLift high over the line) to
// land on it at the hit frame, where the beam bursts (game/beams.js: whoever it is on is squashed)
// and the shockwave runs out (game/quakes.js). The fight keeps { e (him), leap (the jump under
// way), fits (the floors he fits on, by cell) } in `f`.
import { N } from '../core/constants.js';
import { player } from './state.js';
import { jumpLift } from '../core/squarlo.js';
import { aiming } from '../core/beams.js';
import { stepEnemy, groundY } from '../physics/enemynav.js';
import { cellAt } from '../physics/collide.js';
import { fitting } from './bossfight.js';
import { alive } from './party.js';
import { leapFx } from './juice.js';

export function leap(f, e, a, dt, edge) {
  const j = a.jump, b = e.beam, p = e.target?.here && alive(e.target) ? e.target : player;
  if (!b) return;
  const to = aiming(b) || !b.floor ? nearestLanding(f, Math.min(N - edge, Math.max(edge, p.x)), Math.min(N - edge, Math.max(edge, p.z)), p.y) : null;
  if (to && !b.floor) Object.assign(b, { ax: to.x, az: to.z, ay: groundY(to.g, to.x, to.z) + 0.05, floor: to.g });
  else if (to) {
    const dx = to.x - b.ax, dz = to.z - b.az, d = Math.hypot(dx, dz), step = Math.min(d, j.track * dt);
    b.ax += d ? dx / d * step : 0; b.az += d ? dz / d * step : 0;
    const g = landing(f, b.ax, b.az, to.y);
    if (g) b.floor = g;
    b.ay = groundY(g ?? b.floor, b.ax, b.az) + 0.05;
  }
  if (!b.floor) Object.assign(b, { ax: e.x, ay: e.y + 0.05, az: e.z, floor: e.f });
  if (e.t < j.from) return;
  if (!f.leap) { f.leap = { attacks: e.attacks, x: e.x, y: e.y, z: e.z }; leapFx(e); }
  const L = f.leap, u = Math.min(1, (e.t - j.from) / (a.hitAt - j.from)), y1 = groundY(landing(f, b.ax, b.az, b.ay) ?? b.floor, b.ax, b.az);
  e.x = L.x + (b.ax - L.x) * u; e.z = L.z + (b.az - L.z) * u;
  e.y = L.y + (y1 - L.y) * u + jumpLift(j, u);
  e.speed = 0;
  const dx = b.ax - e.x, dz = b.az - e.z, want = Math.atan2(dx, dz);
  if (Math.hypot(dx, dz) > 0.3) e.yaw += Math.atan2(Math.sin(want - e.yaw), Math.cos(want - e.yaw)) * Math.min(1, dt * 6);
  if (u < 1) return;
  // down: where the shadow is (on a floor he fits on: a shadow still on its way there lands on it)
  const at = nearestLanding(f, b.ax, b.az, y1) ?? { x: b.ax, z: b.az, g: b.floor };
  Object.assign(e, { x: at.x, z: at.z, f: at.g, y: groundY(at.g, at.x, at.z) });
  f.leap = null;
}
// a jump cut short: down onto a floor he fits on where he is, else back where he sprang off
export function touchDown(f, e) {
  const g = landing(f, e.x, e.z, e.y);
  if (g) Object.assign(e, { f: g, y: groundY(g, e.x, e.z) });
  else Object.assign(e, { x: f.leap.x, y: f.leap.y, z: f.leap.z });
  f.leap = null;
}
// a floor he fits on (bossfight.js fitting) at (x, z), the one nearest to the height y
function landing(f, x, z, y) {
  if (!f.fits || f.fitsFor !== f.e.profile.type) {   // (his body's: it changes with his shape)
    f.fits = new Map(); f.fitsFor = f.e.profile.type;
    for (const g of fitting(f.e.profile)) f.fits.set(g.c, [...(f.fits.get(g.c) ?? []), g]);
  }
  const list = f.fits.get(cellAt(x, z)) ?? [];
  return list.reduce((best, g) => !best || Math.abs(groundY(g, x, z) - y) < Math.abs(groundY(best, x, z) - y) ? g : best, null);
}
// the spot nearest to (x, y, z) he can land on: there, or the middle of the floor he fits on
// nearest to it (a step up or down counting double): { x, y, z, g (the floor) }, or null for none
function nearestLanding(f, x, z, y) {
  const g = landing(f, x, z, y);
  if (g) return { x, y, z, g };
  let best = null, far = Infinity;
  for (const list of f.fits.values()) for (const h of list) {
    const d = Math.hypot(h.x + 0.5 - x, h.z + 0.5 - z) + 2 * Math.abs(groundY(h, h.x + 0.5, h.z + 0.5) - y);
    if (d < far) { far = d; best = h; }
  }
  return best && { x: best.x + 0.5, y, z: best.z + 0.5, g: best };
}

// a big body keeps off the bank round the arena: `edge` cells from the cube's sides
export function keepIn(e, dt, edge) {
  const ox = Math.max(0, edge - e.x) - Math.max(0, e.x - (N - edge)), oz = Math.max(0, edge - e.z) - Math.max(0, e.z - (N - edge));
  if (ox || oz) stepEnemy(e, Math.sign(ox) * Math.min(Math.abs(ox), 3 * dt), Math.sign(oz) * Math.min(Math.abs(oz), 3 * dt));
}

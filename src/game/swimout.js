// Climbing out of the water onto a bank (the SwimOut clip, blender/character.py; docs/combat.md).
// Physics lets a swimmer, or one wading deep, step up onto a bank up to SWIM_STEP over the feet
// (physics/move.js): the body is on it at once. When that is more than a plain step (STEP), the
// climb out plays: the body is put where the clip's feet end up on the bank, its edge behind them
// and turned to it, and drawn coming up out of the water (render/animator.js: the clip, lowered for
// a lower bank than it was made for, the fists held on the real edge and the feet on the real bank
// by IK). Water drips off the body, rings spread where it came out.
// Moving on towards the bank (or not at all) lets it play out, and once the feet are on the bank
// any moving ends it; moving another way cuts it short, back into the water if the body is not up
// yet and the way leads back, else on from the bank. Jumping cuts it short too, and anything that
// takes the body (a blow, the robot, a ladder).
import { STEP, WADE_CLIMB, SWIM_OUT_SPEED } from '../core/constants.js';
import { player } from './state.js';
import { groundAt } from '../physics/collide.js';
import { canMove } from '../physics/canmove.js';
import { character } from '../render/character.js';
import { fluidAround, drawnSurface } from '../render/waterline.js';
import { ripple } from '../render/ripples.js';
import { emit, soft, rand } from '../render/particles.js';
import { sfx } from '../audio/sfx.js';

const AWAY = 0.5;   // moving more than 60 degrees away from the climb cuts it short

// before a step of the body: where it was, and the water it was in (null: none, or too shallow
// to climb out of)
export function beforeStep(p = player) {
  const wet = p.swimming || (p.wade || 0) >= WADE_CLIMB;
  return { x: p.x, y: p.y, z: p.z, water: wet ? fluidAround(p.x, p.y, p.z) : null };
}

// move the body towards (x, z) the way walking would, keeping to ground no higher than a step
// over `y` (walls, fences and ledges stop it)
function shuffleTo(p, x, z, y) {
  const n = 6, dx = (x - p.x) / n, dz = (z - p.z) / n;
  for (let i = 0; i < n; i++) {
    if (Math.abs(dx) > 1e-6 && canMove(p.x + dx, p.z, 'x', Math.sign(dx)) && Math.abs(groundAt(p.x + dx, p.z, y, STEP).h - y) < STEP) p.x += dx;
    if (Math.abs(dz) > 1e-6 && canMove(p.x, p.z + dz, 'z', Math.sign(dz)) && Math.abs(groundAt(p.x, p.z + dz, y, STEP).h - y) < STEP) p.z += dz;
  }
}

// after the step (game/update.js): out of the water onto a bank more than a step over the feet?
export function noticeSwimOut(b, p = player) {
  const clip = character.swimOut, rise = p.y - b.y;
  if (!clip || !b.water || p.swimming || !p.grounded || p.swimOut || p.climb || p.ragdoll || rise <= STEP + 0.02) return;
  // the edge it crossed: between the cell the body was in and the one it is in now (else, a bank
  // rising within its cell, where it is)
  const cx0 = Math.floor(b.x), cz0 = Math.floor(b.z), cx1 = Math.floor(p.x), cz1 = Math.floor(p.z);
  let nx = p.x - b.x, nz = p.z - b.z, ex = p.x, ez = p.z;
  if (cx1 !== cx0 && (cz1 === cz0 || Math.abs(nx) >= Math.abs(nz))) { nx = Math.sign(cx1 - cx0); nz = 0; ex = Math.max(cx0, cx1); }
  else if (cz1 !== cz0) { nz = Math.sign(cz1 - cz0); nx = 0; ez = Math.max(cz0, cz1); }
  else { const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; }
  shuffleTo(p, ex + nx * clip.edge, ez + nz * clip.edge, p.y);
  const g = groundAt(p.x, p.z, p.y + STEP, STEP);
  if (g.s) Object.assign(p, { y: g.h, support: g.s });
  Object.assign(p, { yaw: Math.atan2(nx, nz), vx: 0, vz: 0, visY: p.y });
  // (the edge where the fists go: across from where the body ended up)
  const along = nx ? [ex, p.z] : nz ? [p.x, ez] : [p.x - nx * clip.edge, p.z - nz * clip.edge];
  p.swimOut = { t: 0, at: 0, rise: p.y - b.y, nx, nz, edge: { x: along[0], z: along[1] }, from: { x: b.x, y: b.y, z: b.z },
    water: b.water, done: {} };
}

// where the body comes out of the water (just off the edge), its surface
const outOf = o => [o.edge.x - o.nx * 0.18, o.edge.z - o.nz * 0.18];

// the drips and the rings, the sounds, as the clip passes its moments
function splashes(o, dt, clip) {
  const once = k => !o.done[k] && o.at >= clip[k] && (o.done[k] = true);
  const [wx, wz] = outOf(o), y = drawnSurface(o.water.level, o.water.fluid, o.water.look);
  if (once('grab')) {
    sfx('paddle', { at: { x: wx, y, z: wz }, volume: 0.6 });
    ripple(wx, wz, o.water, { r0: 0.25, r1: 0.75, life: 2, width: 0.045, alpha: 0.85 });
  }
  if (once('push')) {
    sfx('splash', { at: { x: wx, y, z: wz }, pitch: 1.6, volume: 0.3 });
    ripple(wx, wz, o.water, { r0: 0.2, r1: 0.65, life: 1.8, width: 0.04, alpha: 0.8 });
  }
  // the water running off the body as it comes up, dripping back in
  if (o.at > clip.pull && o.at < clip.stand && Math.random() < dt * 30) {
    const k = Math.min(1, (o.at - clip.pull) / (clip.knee - clip.pull)), top = y + 0.2 + 0.6 * k;
    emit(soft, wx + rand(-0.15, 0.15), rand(y + 0.1, top), wz + rand(-0.15, 0.15), { v: [0, rand(-0.5, 0), 0], life: 0.35,
      size: rand(0.03, 0.05), color: o.water.look ? '#5a4e43' : '#e8f6ff', alpha: 0.8, gravity: 9 });
    if (Math.random() < 0.25) ripple(wx + rand(-0.2, 0.2), wz + rand(-0.2, 0.2), o.water, { r0: 0.04, r1: 0.22, life: 1, width: 0.025, alpha: 0.7 });
  }
}

// every frame while climbing out, before the body moves (game/update.js), with what the player
// wants: true while it holds the body (no moving), false once it ended (whatever they want goes)
export function holdSwimOut(dt, dx, dz, jump, p = player) {
  const o = p.swimOut, clip = character.swimOut;
  if (!o) return false;
  if (!clip || p.ragdoll || p.rescue || p.held || p.climb || p.swimming || !p.grounded || p.hp <= 0) { p.swimOut = null; return false; }
  o.t += dt; o.at = o.t * SWIM_OUT_SPEED;
  if (o.at >= clip.duration) { p.swimOut = null; return false; }
  splashes(o, dt, clip);
  const len = Math.hypot(dx, dz), along = len > 0.3 ? (dx * o.nx + dz * o.nz) / len : 1;
  if (!jump && along >= AWAY && !(o.at >= clip.step && len > 0.3)) return true;
  // cut short: back into the water (not up yet, and going back), or on from the bank
  if (o.at < clip.push && along < -AWAY && !jump) Object.assign(p, { x: o.from.x, y: o.from.y, z: o.from.z, grounded: false, vy: 0 });
  p.swimOut = null;
  return false;
}

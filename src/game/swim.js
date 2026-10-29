// The hero in the water (physics/move.js swims them): the splash going in, the strokes' sounds and
// ripples, and water with no way out. The generator gives every water of the cubes a way out
// (cubegen/escape.js), but a standing water (a trial's, a boss's) may stand where there is none
// (physics/swimout.js wayOut): after RESCUE.trapped s of that the robot carries them out
// (game/rescue.js); with no robot yet they tire, and after RESCUE.tire s they drown. Swimming in a
// flood's or a crumbling floor's water fails that trial (game/trials.js sweptAway).
import { WATER } from '../core/constants.js';
import { RESCUE } from '../core/rescue.js';
import { player, state, setStatus } from './state.js';
import { wayOut } from '../physics/swimout.js';
import { rescue, robotCanRescue } from './rescue.js';
import { dieInFluid } from './ragdoll.js';
import { sweptAway } from './trials.js';
import { blend } from '../render/blendtree.js';
import { sfx } from '../audio/sfx.js';
import { emit, soft, rand, ring } from '../render/particles.js';
import { narrate } from './narrator.js';
import { tr } from '../i18n/i18n.js';

const LOOK_EVERY = 0.5;   // s between two looks for a way out
let splashes = 0, look = 0, trapped = 0, stroke = 0, ripple = 0;

// a splash of `size` (0..1) where the body went into the water
function splash(x, y, z, size) {
  const n = Math.round(8 + 26 * size);
  for (let i = 0; i < n; i++) {
    const [dx, dz] = ring(0.25), a = Math.atan2(dz, dx), s = rand(0.4, 1.2) * (0.5 + size);
    emit(soft, x + dx, y, z + dz, { v: [Math.cos(a) * s, rand(1.2, 3) * (0.4 + size), Math.sin(a) * s], life: rand(0.4, 0.7),
      size: rand(0.06, 0.11), color: i % 3 ? '#e8f6ff' : '#9fd2ff', alpha: 0.9, gravity: 11 });
  }
  emit(soft, x, y + 0.02, z, { life: 0.6, size: 0.4 + 0.4 * size, grow: 1.6, color: '#f2fbff', alpha: 0.5 });
}

// every frame of play after the player moved (game/update.js); true: the hero was taken out of it
// (the robot came, they drowned, the trial is lost)
export function tickSwim(dt) {
  const p = player;
  if ((p.splashCount ?? 0) !== splashes) {   // into the water (physics/move.js counts it): the harder, the bigger
    splashes = p.splashCount ?? 0;
    const size = Math.min(1, Math.max(0.15, (p.plunge || 0) / 9));
    sfx('splash', { at: { x: p.x, y: p.swimY, z: p.z }, pitch: 1.5 - 0.5 * size, volume: 0.35 + 0.65 * size });
    splash(p.x, p.swimY, p.z, size);
    narrate('swim');
  }
  if (!p.swimming) { trapped = 0; look = 0; return false; }
  if (sweptAway()) return true;
  // strokes: a soft slosh with each paddle, ripples round the swimmer
  const speed = Math.hypot(p.vx, p.vz);
  stroke += dt * (0.8 + speed * 1.2);
  if (stroke >= 1) { stroke = 0; sfx('paddle', { at: { x: p.x, y: p.swimY, z: p.z }, volume: 0.3 + 0.4 * Math.min(1, speed) }); }
  ripple += dt;
  if (ripple > 0.35) {
    ripple = 0;
    emit(soft, p.x, p.swimY + 0.02, p.z, { life: 1.1, size: 0.35, grow: 1.4, color: '#eaf8ff', alpha: 0.28 });
  }
  if (blend.mode === 'swim' && speed > 0.3 && Math.random() < dt * 6) {
    const [dx, dz] = ring(0.2);
    emit(soft, p.x + dx, p.swimY + 0.03, p.z + dz, { v: [-p.vx * 0.3, rand(0.4, 0.9), -p.vz * 0.3], life: rand(0.3, 0.5), size: rand(0.04, 0.07), color: '#f2fbff', alpha: 0.8, gravity: 8 });
  }
  // no way out of it?
  look -= dt;
  if (look <= 0) {
    look = LOOK_EVERY;
    if (wayOut(p.x, p.z, p.swimY)) trapped = 0;
    else if (trapped === 0) trapped = 1e-6;
  }
  if (trapped <= 0) return false;
  trapped += dt;
  if (robotCanRescue()) {
    if (trapped >= RESCUE.trapped) { trapped = 0; return rescue(WATER, 0, p.swimY); }
    return false;
  }
  if (trapped >= RESCUE.tire) { trapped = 0; dieInFluid(WATER, p.swimY); return true; }
  if (!state.statusMsg) setStatus(tr('No way out of the water! You are getting tired'));
  return false;
}

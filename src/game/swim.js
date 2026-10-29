// The hero in the water (physics/move.js swims them; in Sollmeldon's mud too): the splash going in,
// the strokes' sounds, the rings spreading round them (render/ripples.js; wading too), and water
// with no way out. The generator gives every water of the cubes a way out (cubegen/escape.js),
// but a standing water (a trial's, a boss's) may stand where there is none (physics/swimout.js
// wayOut): they tire, and after RESCUE.tire s they drown, unless the robot carries them out first,
// after RESCUE.trapped s (game/rescue.js). Should it find nowhere to take them, or they cannot pay
// its share (his mud's), it tries again every look while they tire.
// Swimming in a flood's or a crumbling floor's water fails that trial (game/trials.js sweptAway).
import { WATER, MUD, SWIM_DEPTH } from '../core/constants.js';
import { RESCUE } from '../core/rescue.js';
import { player, state, setStatus } from './state.js';
import { wayOut } from '../physics/swimout.js';
import { swum } from '../physics/fluid.js';
import { rescue, robotCanRescue } from './rescue.js';
import { dieInFluid } from './ragdoll.js';
import { sweptAway } from './trials.js';
import { blend } from '../render/blendtree.js';
import { sfx } from '../audio/sfx.js';
import { waterShownAt } from '../render/materials.js';
import { emit, soft, rand, ring } from '../render/particles.js';
import { ripple } from '../render/ripples.js';
import { fluidAround } from '../render/waterline.js';
import { narrate } from './narrator.js';
import { tr } from '../i18n/i18n.js';

const LOOK_EVERY = 0.5;   // s between two looks for a way out
let splashes = 0, look = 0, trapped = 0, call = 0, stroke = 0, collar = 0, wake = 0;   // (call: when the robot is called next)

// the colours of what flies up (drops, foam): of clear water, of the mud (the rings on it are in
// its foam's, render/ripples.js)
const SPRAY = { 0: ['#e8f6ff', '#9fd2ff', '#f2fbff'], [MUD]: ['#5a4e43', '#3a3129', '#6b5d4f'] };
const sprayOf = look => SPRAY[look] ?? SPRAY[0];
// where its surface is drawn (clear water under its level, render/materials.js waterShownAt)
const shown = p => p.swimY + (p.swimLook ? 0 : waterShownAt());

// a splash of `size` (0..1) where the body went into the water
function splash(x, y, z, size, c) {
  const n = Math.round(8 + 26 * size);
  for (let i = 0; i < n; i++) {
    const [dx, dz] = ring(0.25), a = Math.atan2(dz, dx), s = rand(0.4, 1.2) * (0.5 + size);
    emit(soft, x + dx, y, z + dz, { v: [Math.cos(a) * s, rand(1.2, 3) * (0.4 + size), Math.sin(a) * s], life: rand(0.4, 0.7),
      size: rand(0.06, 0.11), color: i % 3 ? c[0] : c[1], alpha: 0.9, gravity: 11 });
  }
  emit(soft, x, y + 0.02, z, { life: 0.6, size: 0.4 + 0.4 * size, grow: 1.6, color: c[2], alpha: 0.5 });
}

// Wading (physics/move.js p.wade: how deep, shallower than it is swum in): little rings round the
// legs where they cut the surface, a few standing, more walking, and a wake behind
function wadeRings(p, dt) {
  if (!(p.wade > 0.03) || p.ragdoll || p.climb) return;
  const w = fluidAround(p.x, p.y, p.z);
  if (!w || w.fluid !== WATER || !swum(w.look)) return;
  const speed = Math.hypot(p.vx, p.vz), r = 0.12 + 0.1 * Math.min(1, p.wade / SWIM_DEPTH);
  collar += dt;
  if (collar > (speed > 0.3 ? 0.3 : 0.7)) {
    collar = 0;
    const [dx, dz] = ring(0.04);
    ripple(p.x + dx, p.z + dz, w, { r0: r, r1: r + 0.16, life: 1.4, width: 0.03, alpha: 0.7 });
  }
  wake += speed * dt;
  if (wake > 0.4) {
    wake = 0;
    ripple(p.x - p.vx / speed * 0.08, p.z - p.vz / speed * 0.08, w, { r0: r, r1: r + 0.35, life: 1.8, width: 0.035, alpha: 0.7 });
  }
}

// every frame of play after the player moved (game/update.js); true: the hero was taken out of it
// (the robot came, they drowned, the trial is lost)
export function tickSwim(dt) {
  const p = player;
  if ((p.splashCount ?? 0) !== splashes) {   // into the water (physics/move.js counts it): the harder, the bigger
    splashes = p.splashCount ?? 0;
    const size = Math.min(1, Math.max(0.15, (p.plunge || 0) / 9));
    sfx('splash', { at: { x: p.x, y: p.swimY, z: p.z }, pitch: 1.5 - 0.5 * size, volume: 0.35 + 0.65 * size });
    splash(p.x, shown(p), p.z, size, sprayOf(p.swimLook));
    const w = fluidAround(p.x, p.y, p.z);
    ripple(p.x, p.z, w, { r0: 0.3, r1: 0.8 + 0.6 * size, life: 2.4, width: 0.05, alpha: 0.9 });
    ripple(p.x, p.z, w, { r0: 0.15, r1: 0.45 + 0.3 * size, life: 1.8, width: 0.04, alpha: 0.8 });
    narrate('swim');
  }
  if (!p.swimming) { trapped = 0; look = 0; wadeRings(p, dt); return false; }
  if (sweptAway()) return true;
  // strokes: a soft slosh with each paddle, a ring spreading from it; little rings all the while
  // where the body cuts the surface (a collar round it), and swimming a wake of them behind it
  const speed = Math.hypot(p.vx, p.vz), c = sprayOf(p.swimLook), y = shown(p), w = fluidAround(p.x, p.y, p.z);
  stroke += dt * (0.8 + speed * 1.2);
  if (stroke >= 1) {
    stroke = 0;
    sfx('paddle', { at: { x: p.x, y: p.swimY, z: p.z }, volume: 0.3 + 0.4 * Math.min(1, speed) });
    ripple(p.x, p.z, w, { r0: 0.26, r1: 0.7, life: 2.2, width: 0.04, alpha: 0.85 });
  }
  collar += dt;
  if (collar > (speed > 0.3 ? 0.3 : 0.55)) {
    collar = 0;
    const [dx, dz] = ring(0.04);
    ripple(p.x + dx, p.z + dz, w, { r0: 0.22, r1: 0.4, life: 1.5, width: 0.035, alpha: 0.8 });
  }
  wake += speed * dt;
  if (wake > 0.35) {
    wake = 0;
    ripple(p.x - p.vx / speed * 0.1, p.z - p.vz / speed * 0.1, w, { r0: 0.2, r1: 0.6, life: 2, width: 0.035, alpha: 0.75 });
  }
  if (blend.mode === 'swim' && speed > 0.3 && Math.random() < dt * 6) {
    const [dx, dz] = ring(0.2);
    emit(soft, p.x + dx, y + 0.03, p.z + dz, { v: [-p.vx * 0.3, rand(0.4, 0.9), -p.vz * 0.3], life: rand(0.3, 0.5), size: rand(0.04, 0.07), color: c[2], alpha: 0.8, gravity: 8 });
  }
  // no way out of it?
  look -= dt;
  if (look <= 0) {
    look = LOOK_EVERY;
    if (wayOut(p.x, p.z, p.swimY)) trapped = 0;
    else if (trapped === 0) { trapped = 1e-6; call = RESCUE.trapped; }
  }
  if (trapped <= 0) return false;
  trapped += dt;
  const robot = robotCanRescue();
  if (robot && trapped >= call) {
    call = trapped + LOOK_EVERY;
    if (rescue(WATER, p.swimLook ?? 0, p.swimY)) { trapped = 0; return true; }
  }
  if (trapped >= RESCUE.tire) { trapped = 0; dieInFluid(WATER, p.swimY, p.swimLook ?? 0); return true; }
  if ((!robot || trapped >= RESCUE.trapped) && !state.statusMsg) setStatus(tr('No way out of the water! You are getting tired'));
  return false;
}

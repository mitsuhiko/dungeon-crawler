// Animation state machine and blend trees: which clips play with what weight and at what
// time. On land: idle -> walk -> run by speed; in water: treading water -> paddling by speed;
// ladders use a reversible, distance-driven climb cycle; jump / fall / land / sit are one-shots;
// sliding on a slide puzzle's ice (player.skidding, game/trials.js) skids; carried off by the robot
// (player.rescue, game/rescue.js) the hero hangs from it by the hands, treading the fluid until it
// comes.
import { WALK_SPEED, RUN_SPEED, WALK_ANIM, RUN_ANIM, SWIM_SPEED, SIT_IMPACT } from '../core/constants.js';
import { clamp } from '../core/util.js';
import { player } from '../game/state.js';
import { character } from './character.js';

export const W = { idle: 1, walk: 0, run: 0, swimIdle: 0, swim: 0, skid: 0, climb: 0, jump: 0, fall: 0, land: 0, sit: 0, hang: 0 };
// learn: animation.html#modes (see learn/README.md)
const RATE = { loco: 10, swim: 6, skid: 16, climb: 14, jump: 18, fall: 7, land: 20, sit: 14, hang: 9 };   // cross-fade speeds
const seen = { jump: 0, land: 0 };
let mode = 'loco', modeT = 0, phase = 0, swimPhase = 0, climbPhase = 0, slow = 0;
// stretch: stride stretch for the walk / run cycle; phase: where in that cycle, run: how much
// of it is the run (0..1), climb: where in the ladder cycle, mode: the state (game/footsteps.js
// steps on the cycles)
export const blend = { stretch: 1, phase: 0, run: 0, climb: 0, mode: 'loco' };

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const resetMode = () => { mode = 'loco'; };

// learn: animation.html#mode-code #modes (see learn/README.md)
function nextMode(dt, speed) {
  const p = player;
  modeT += dt;
  // In the robot's hands: treading the fluid until it comes, then hanging from it
  if (p.rescue) {
    const want = p.rescue.phase === 'reach' ? 'swim' : 'hang';
    if (mode !== want) modeT = 0;
    mode = want; slow = 0;
    seen.jump = p.jumpCount; seen.land = p.landCount;
    return;
  }
  if (mode === 'hang') { mode = 'land'; modeT = 0; seen.land = p.landCount; }
  // A ladder grab takes priority over landing / recovery; stationary climbing holds a grip.
  if (p.climb) {
    if (mode !== 'climb') { climbPhase = 0; modeT = 0; }
    mode = 'climb'; slow = 0;
    seen.jump = p.jumpCount; seen.land = p.landCount;
    return;
  }
  if (mode === 'climb') { mode = p.grounded ? 'loco' : 'fall'; modeT = 0; }
  if (p.skidding) { if (mode !== 'skid') modeT = 0; mode = 'skid'; seen.jump = p.jumpCount; seen.land = p.landCount; return; }
  if (mode === 'skid') { mode = 'loco'; modeT = 0; }
  if (p.jumpCount !== seen.jump) { seen.jump = p.jumpCount; mode = 'jump'; modeT = 0; }
  if (p.landCount !== seen.land) {
    seen.land = p.landCount;
    if (p.landImpact > SIT_IMPACT) { mode = 'sit'; modeT = 0; }
    else if (mode !== 'loco' || p.landImpact > 5) { mode = 'land'; modeT = 0; }
  }
  if (mode === 'loco' && !p.grounded && !p.swimming && p.airTime > 0.15) { mode = 'fall'; modeT = 0; }
  if (mode === 'jump' && p.vy < -0.5) { mode = 'fall'; modeT = 0; }
  if ((mode === 'fall' || mode === 'jump') && p.grounded && !p.swimming && modeT > 0.05) { mode = 'land'; modeT = 0; }
  if (mode === 'land' && (modeT > 0.5 || (speed > 0.4 && modeT > 0.12))) mode = 'loco';
  if (mode === 'sit' && modeT > character.actions.sit.getClip().duration + 0.2 && p.stun <= 0) { mode = 'loco'; slow = 0.8; }
  // splashing into water (or still in it) -> swim; climbing out onto a bank -> walk
  if (p.swimming && !(mode === 'jump' && modeT < 0.3)) mode = 'swim';
  else if (mode === 'swim' && !p.swimming) mode = p.grounded ? 'loco' : 'fall';
}

// learn: animation.html#blend-code #mixing (see learn/README.md)
export function updateBlend(dt, speed, time) {
  const A = character.actions, T = {};
  for (const n in W) T[n] = 0;
  nextMode(dt, speed);
  if (mode === 'loco') {
    // idle -> walk -> run by speed with one shared phase; the cycle plays at the pace of
    // WALK_ANIM / RUN_ANIM and longer strides make up the rest of the distance
    const loco = smooth(0.05, 0.35, speed), t = clamp((speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
    T.idle = 1 - loco; T.walk = loco * (1 - t); T.run = loco * t;
    const move = WALK_SPEED + (RUN_SPEED - WALK_SPEED) * t, anim = WALK_ANIM + (RUN_ANIM - WALK_ANIM) * t;
    const stride = character.walkStride + (character.runStride - character.walkStride) * t;
    phase = (phase + dt * speed * (anim / move) / stride) % 1;
    blend.stretch = move / anim; blend.run = t;
  } else if (mode === 'swim') {
    // treading water -> doggy paddle; the paddle cycle follows the swimming speed
    const s = smooth(0.08, 0.5, speed / SWIM_SPEED);
    T.swimIdle = 1 - s; T.swim = s;
    swimPhase = (swimPhase + dt * Math.max(speed, 0.25) / character.swimStride) % 1;
  } else if (mode === 'climb') {
    T.climb = 1;
    // Signed speed reverses descent; zero speed freezes the same pose, not idle.
    climbPhase = ((climbPhase + dt * player.climbV / character.climbStride) % 1 + 1) % 1;
  } else T[mode] = 1;
  slow -= dt;
  blend.phase = phase; blend.climb = climbPhase; blend.mode = mode;
  const k = Math.min(1, dt * (slow > 0 ? 2.5 : RATE[mode]));   // standing up from sitting is slow
  for (const n in W) { W[n] += (T[n] - W[n]) * k; A[n].setEffectiveWeight(W[n]); }

  const dur = n => A[n].getClip().duration;
  A.walk.time = phase * dur('walk');
  A.run.time = phase * dur('run');
  A.swim.time = swimPhase * dur('swim');
  A.swimIdle.time = time % dur('swimIdle');
  A.skid.time = time % dur('skid');
  A.hang.time = time % dur('hang');
  A.climb.time = climbPhase * dur('climb');
  if (mode === 'jump') A.jump.time = Math.min(modeT * 1.4, dur('jump'));
  A.fall.time = dur('fall') * (0.5 + 0.5 * Math.sin(time * 3));
  if (mode === 'land') A.land.time = Math.min(modeT, dur('land'));
  if (mode === 'sit') A.sit.time = Math.min(modeT, dur('sit'));
}

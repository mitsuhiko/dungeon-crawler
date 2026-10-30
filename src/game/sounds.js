// Sounds the game makes by watching its state change from frame to frame, where there is no
// single place to hook: the player jumping, teetering at a brink (physics/brink.js: a little grit
// slipping off the edge), falling a long way, the ragdoll hitting the
// ground, getting up; the enemies noticing you, winding up an attack and dying (their voices,
// audio/voices.js). Footsteps are game/footsteps.js, the surroundings game/ambience.js.
import { player, state } from './state.js';
import { allEnemies } from './enemies.js';
import { sfx } from '../audio/sfx.js';

const FALL_SPEED = 9;   // falling faster than this whistles
let jumps = null, brink = null, falling = false, getUp = null, pelvisY = null, pelvisV = 0, thudAt = 0, alertAt = 0;
const seen = new WeakMap();   // enemy -> its mode last frame

function body(dt) {
  const p = player;
  if (jumps !== null && p.jumpCount !== jumps && !p.swimming) sfx('jump', { volume: 0.8 });
  jumps = p.jumpCount;
  if (p.brink && !brink) sfx('step', { volume: 0.3, pitch: 1.5 + Math.random() * 0.2 });
  brink = p.brink;
  const fast = !p.grounded && !p.ragdoll && !p.climb && p.vy < -FALL_SPEED;
  if (fast && !falling) sfx('fall', { volume: 0.7 });
  falling = fast || (falling && !p.grounded && !p.ragdoll);
  if (p.getUp && p.getUp !== getUp) sfx('getUp');
  getUp = p.getUp;
  // the ragdoll: a thud whenever the pelvis stops falling fast
  const r = p.ragdoll;
  if (!r || dt <= 0) { pelvisY = null; return; }
  const y = r.p[0][1], v = pelvisY === null ? 0 : (y - pelvisY) / dt;
  if (pelvisV < -2.5 && v > pelvisV * 0.4 && state.time - thudAt > 0.15 && !p.fluidDeath) {
    sfx('thud', { volume: Math.min(1, -pelvisV / 8), pitch: 0.9 + Math.random() * 0.2 });
    thudAt = state.time;
  }
  pelvisY = y; pelvisV = v;
}

function enemies() {
  for (const e of allEnemies()) {
    const was = seen.get(e), now = e.mode, species = e.profile?.species;
    seen.set(e, now);
    if (was === undefined || was === now || !species || e.rewound) continue;   // (no voices while Renew's time runs back, game/renew.js)
    const voice = kind => sfx(`${species}_${kind}`, { at: e, pitch: e.profile.pitch ?? 1 });
    if (now === 'dead') { if (!e.proxy) voice('death'); }   // (a proxy goes up in a cloud, render/enemies.js)
    else if (now === 'attack') voice('windup');
    else if (now === 'chase' && was !== 'attack' && state.time - alertAt > 0.3) { voice('alert'); alertAt = state.time; }
  }
}

export function updateSounds(dt) {
  if (!state.map) return;
  body(dt);
  if (!state.transitioning) enemies();
}

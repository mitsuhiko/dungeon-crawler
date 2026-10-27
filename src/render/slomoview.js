// What the game does to Slomo's model on top of his clips (render/enemies.js; his fight:
// game/slomo.js). The model holds his shapes (blender/slomo.py; he fights as the blob and the
// slug): each clip shows one, the others' bones scaled away. While he changes (mode 'split') the
// blob's gait and the slug's are blended (the blob bursting, the slug turning round), goo splashing
// off him. A slug arm he threw (his `arms`, 0 .. 1) is scaled away at its end and grows back.
import * as THREE from 'three';
import { SLOMO_FIGHT } from '../core/slomo.js';
import { STAGE_PROFILES } from '../core/enemies.js';
import { glow, soft, emit, rand } from './particles.js';
import { sfx } from '../audio/sfx.js';
import { player } from '../game/state.js';

const HIDDEN = 0.001, GOO = ['#d8ff9a', '#b8ff5a', '#8ae048', '#5a9a2a'];
const ease = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const gaitOf = stage => STAGE_PROFILES.slomo[stage - 1]?.gait ?? 'walk';

export function makeSlomoLook(model) {
  const bone = n => model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n));
  return { hands: ['hand.L', 'hand.R'].map(bone), morph: false, burst: false };
}

export function slomoLook(v, e, dt) {
  const s = v.slomo, stage = e.stage ?? 1;
  if (e.mode === 'split' && stage < 2) {
    // changing: from this shape's gait into the next one's
    const k = ease((e.t - 0.3) / (SLOMO_FIGHT.morphTime - 0.6)), from = gaitOf(stage), to = gaitOf(stage + 1), A = v.actions;
    if (!s.morph) { s.morph = true; s.burst = false; }
    for (const name in A) {
      const w = name === from ? 1 - k : name === to ? k : 0;
      v.weights[name] = w; A[name].setEffectiveWeight(w);
      if (name === from || name === to) A[name].time = 0;
    }
    v.mixer.update(0);
    if (Math.hypot(e.x - player.x, e.z - player.z) < 22) splash(e, dt, k > 0.35 ? 3 : 1);
    if (k > 0.45 && !s.burst) { s.burst = true; burst(e); }
  } else if (s.morph) {
    s.morph = false;
    v.height = e.profile.height / v.size;
  }
  // his slug arms: a thrown one grows back
  if (stage === 1) s.hands.forEach((b, i) => b?.scale.setScalar(Math.max(HIDDEN, ease(e.arms?.[i] ?? 1))));
}

// goo dripping and flying off him as he changes
function splash(e, dt, much) {
  for (let i = Math.floor(40 * much * dt + Math.random()); i > 0; i--) {
    const a = rand(0, Math.PI * 2), r = rand(0.4, 1.3);
    emit(soft, e.x + Math.cos(a) * r, e.y + rand(0.3, 2.2), e.z + Math.sin(a) * r, { v: [Math.cos(a) * rand(0.5, 2), rand(0.5, 2.5), Math.sin(a) * rand(0.5, 2)],
      life: rand(0.4, 0.8), size: rand(0.08, 0.18), color: GOO[i % 4], alpha: 0.9, gravity: 8, drag: 0.6 });
  }
}
// the blob bursting as the slug comes out of it
function burst(e) {
  sfx('splorch', { at: e, pitch: 0.6, volume: 1 }); sfx('whump', { at: e, pitch: 0.6 });
  emit(glow, e.x, e.y + 1.2, e.z, { life: 0.4, size: 3, grow: 1.4, color: '#b8ff5a', alpha: 0.7 });
  for (let i = 0; i < 70; i++) {
    const a = rand(0, Math.PI * 2), u = rand(-0.3, 1), w = Math.sqrt(1 - u * u), sp = rand(2, 6);
    emit(soft, e.x + Math.cos(a) * w, e.y + 1.2 + u, e.z + Math.sin(a) * w, { v: [Math.cos(a) * w * sp, u * sp + 2, Math.sin(a) * w * sp],
      life: rand(0.5, 1), size: rand(0.1, 0.24), color: GOO[i % 4], alpha: 0.95, gravity: 9, drag: 0.5 });
  }
}

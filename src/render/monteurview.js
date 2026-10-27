// What the game does to Monteur's model on top of his clips (render/enemies.js; his fight:
// game/monteur.js, the rules core/monteur.js). The model holds both his forms (blender/monteur.py):
// the moose and the sun, each clip showing one and scaling the other's bones away; while he changes
// (mode 'split' at stage 1) his crumbling into the sun (MonteurChange) plays on his clock, dust and
// chips falling off him. The stones floating between his antlers (his `stones`, 0 .. 5) that he
// has thrown are scaled away, the one growing back grows. Running at you (a charge, a roll) he
// kicks up dust.
import * as THREE from 'three';
import { attackOf } from '../core/enemies.js';
import { MONTEUR_FIGHT } from '../core/monteur.js';
import { soft, emit, rand } from './particles.js';
import { sfx } from '../audio/sfx.js';
import { player } from '../game/state.js';

const HIDDEN = 0.001, DUST = ['#e0dacd', '#c9c0ae', '#a39d91'], CHIPS = ['#b8b0a0', '#8d877c', '#6b7b45'];
const ease = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const bone = (model, n) => model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n));

export function makeMonteurLook(model) {
  return { stones: Array.from({ length: MONTEUR_FIGHT.stones.most }, (_, i) => bone(model, `stone.${i}`)), morph: false };
}

export function monteurLook(v, e, dt, off) {
  const m = v.monteur, near = Math.hypot(e.x - player.x, e.z - player.z) < 22;
  // changing: his crumbling into the sun, on his clock
  if (e.mode === 'split' && (e.stage ?? 1) === 1) {
    const act = v.actions.change;
    if (act) {
      for (const n in v.actions) { v.weights[n] = n === 'change' ? 1 : 0; v.actions[n].setEffectiveWeight(v.weights[n]); }
      act.time = Math.min(e.t, act.getClip().duration);
      v.mixer.update(0);
    }
    if (!m.morph) { m.morph = true; if (near) sfx('rumble', { at: e, pitch: 0.6, volume: 1 }); }
    if (near && e.t > 0.9 && e.t < 2.4) crumble(e, dt, off);
  } else if (m.morph) {
    m.morph = false;
    v.height = e.profile.height / v.size;
  }
  // his stones: the ones thrown are gone, the one growing back grows
  const n = e.mode === 'dead' ? MONTEUR_FIGHT.stones.most : e.stones ?? MONTEUR_FIGHT.stones.most;
  m.stones.forEach((b, i) => b?.scale.multiplyScalar(Math.max(HIDDEN, ease(n - i))));
  // running at you: dust kicked up behind him
  const a = e.mode === 'attack' ? attackOf(e) : null, r = a?.roll;
  if (r && near && e.t >= r.from && e.t < r.to && (e.speed ?? 0) > 1) {
    const bx = e.x - Math.sin(e.yaw) * 0.6 + off.x, bz = e.z - Math.cos(e.yaw) * 0.6 + off.z;
    for (let i = Math.floor(30 * dt + Math.random()); i > 0; i--)
      emit(soft, bx + rand(-0.5, 0.5), e.y + off.y + 0.15, bz + rand(-0.5, 0.5), { v: [rand(-0.6, 0.6), rand(0.4, 1.2), rand(-0.6, 0.6)],
        life: rand(0.5, 0.9), size: rand(0.2, 0.4), grow: 1.4, color: DUST[i % 3], alpha: 0.45, drag: 1.5 });
  }
}

// crumbling into the sun: chips and dust falling off him
function crumble(e, dt, off) {
  for (let i = Math.floor(45 * dt + Math.random()); i > 0; i--) {
    const a = rand(0, Math.PI * 2), r = rand(0.3, 1.1);
    emit(soft, e.x + off.x + Math.cos(a) * r, e.y + off.y + rand(0.6, 2.6), e.z + off.z + Math.sin(a) * r,
      { v: [Math.cos(a) * rand(0.3, 1.5), rand(0, 1.5), Math.sin(a) * rand(0.3, 1.5)], life: rand(0.5, 1), size: rand(0.06, 0.16),
        color: CHIPS[i % 3], alpha: 0.95, gravity: 9, drag: 0.4 });
  }
  if (Math.random() < dt * 8)
    emit(soft, e.x + off.x + rand(-0.8, 0.8), e.y + off.y + rand(0.2, 1.4), e.z + off.z + rand(-0.8, 0.8), { v: [0, rand(0.2, 0.6), 0],
      life: rand(1, 1.6), size: rand(0.4, 0.7), grow: 1.3, color: DUST[0], alpha: 0.35, drag: 1 });
}

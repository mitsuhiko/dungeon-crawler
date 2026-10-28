// What the game does to Sollmeldon's model on top of his clips (render/enemies.js; his fight:
// game/sollmeldon.js, the rules core/sollmeldon.js). He flies (`lift`: the whole of him drawn that
// much over his floor), his wings beating (SollmeldonFly, blended in by how high he is; his clip of
// raining mud beats them itself). While a head is cut off (mode 'split') its clip (SollmeldonCutL,
// M, R by `cutting`) plays on his clock: he rears and shakes, the head tears off, flies and lands
// beside him, melting into mud. The heads he no longer has are gone but for a stump (their necks'
// bones from the second on and the head scaled away). Mud drips off him all the time; it splashes
// where he lands and where a head comes off, and his wings blow it about as he takes off.
import * as THREE from 'three';
import { soft, emit, rand } from './particles.js';
import { sfx } from '../audio/sfx.js';
import { SOLLMELDON_FIGHT } from '../core/sollmeldon.js';
import { attackOf } from '../core/enemies.js';
import { player } from '../game/state.js';

const HIDDEN = 0.001, SIDES = ['L', 'M', 'R'], CUTS = ['cutL', 'cutM', 'cutR'];
const MUD = ['#2a231d', '#17130f', '#3a3129', '#0b0907'];
const bone = (model, n) => model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n));
const clamp01 = x => Math.min(1, Math.max(0, x));

export function makeSollmeldonLook(model) {
  const necks = SIDES.map(s => [1, 2, 3, 4].map(k => bone(model, `neck.${s}.${k}`)).filter(Boolean));
  return { necks, heads: SIDES.map(s => bone(model, `head.${s}`)), stumps: SIDES.map(s => bone(model, `neck.${s}.0`)),
    body: bone(model, 'body'), lift: null, flyT: 0, touched: null, flaps: null, cut: -1, landed: -1 };
}

// before the clips are put on him: the cut, or his wings beating up in the air
export function sollmeldonClips(v, e, dt) {
  const m = v.sollmeldon, A = v.actions, want = e.mode === 'dead' ? 0 : e.lift ?? 0;
  m.lift = m.lift === null ? want : m.lift + (want - m.lift) * Math.min(1, dt * 12);
  const only = (name, time) => {
    for (const n in A) { v.weights[n] = n === name ? 1 : 0; A[n].setEffectiveWeight(v.weights[n]); }
    A[name].time = Math.min(time, A[name].getClip().duration);
  };
  if (e.mode === 'split' && e.cutting >= 0 && A[CUTS[e.cutting]]) { only(CUTS[e.cutting], e.t); return; }
  const k = clamp01(m.lift / 0.8), fly = A.fly;
  if (!fly) return;
  m.flyT = (m.flyT + dt) % fly.getClip().duration;
  fly.time = m.flyT;
  const a = e.mode === 'attack' ? attackOf(e) : null;
  if (a?.clip === 'airSpit') { v.weights.fly = 0; fly.setEffectiveWeight(0); return; }   // (it beats them itself)
  for (const n in A) if (n !== 'fly') A[n].setEffectiveWeight(v.weights[n] * (1 - k));
  v.weights.fly = k; fly.setEffectiveWeight(k);
}

const P = new THREE.Vector3();
export function sollmeldonLook(v, e, dt, off) {
  const m = v.sollmeldon, near = Math.hypot(e.x - player.x, e.z - player.z) < 24;
  v.group.position.y += m.lift ?? 0;
  // the heads he no longer has: a stump each (but the one being cut off: its clip throws it)
  SIDES.forEach((_, i) => {
    if (e.heads === undefined || e.heads & (1 << i) || (e.mode === 'split' && e.cutting === i)) return;
    for (const b of m.necks[i]) b.scale.setScalar(HIDDEN);
    m.heads[i]?.scale.setScalar(HIDDEN);
  });
  v.model.updateMatrixWorld(true);
  if (!near) return;
  // mud dripping off him, all the time
  if (Math.random() < dt * 14) {
    const a = rand(0, Math.PI * 2), r = rand(0.3, 0.9);
    emit(soft, e.x + off.x + Math.cos(a) * r, e.y + off.y + (m.lift ?? 0) + rand(0.8, 2.2), e.z + off.z + Math.sin(a) * r,
      { v: [0, -0.3, 0], life: rand(0.4, 0.7), size: rand(0.05, 0.1), color: MUD[Math.floor(Math.random() * 3)], alpha: 0.95, gravity: 7 });
  }
  // landing: a splash of mud round him; taking off: his wings blow it about
  if (m.touched !== (e.touched ?? 0)) { if (m.touched !== null) splash(e.x + off.x, e.y + off.y, e.z + off.z, 2.2, 40); m.touched = e.touched ?? 0; }
  if (m.flaps !== (e.flaps ?? 0)) { if (m.flaps !== null) gust(e, off); m.flaps = e.flaps ?? 0; }
  // a head coming off: mud bursting out of the stump, and where it lands
  if (e.mode === 'split' && e.cutting >= 0) {
    if (m.cut !== e.cutting && e.t >= SOLLMELDON_FIGHT.cutAt) {
      m.cut = e.cutting;
      m.stumps[e.cutting]?.getWorldPosition(P);
      splash(P.x, P.y, P.z, 0.6, 30, 3);
    }
    if (m.landed !== e.cutting && e.t >= SOLLMELDON_FIGHT.cutLand) {
      m.landed = e.cutting;
      const [x, , z] = e.profile.cut?.[e.cutting] ?? [0, 0, 0], s = Math.sin(e.yaw), c = Math.cos(e.yaw);
      splash(e.x + off.x + x * c + z * s, e.y + off.y, e.z + off.z - x * s + z * c, 1.2, 30);
      sfx('thud', { at: e, pitch: 0.7, volume: 0.8 });
    }
  }
}
// mud thrown up round (x, y, z) out to r (up: how high it flies)
function splash(x, y, z, r, n, up = 1.6) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), d = rand(0.2, 1) * r;
    emit(soft, x + Math.cos(a) * d, y + 0.1, z + Math.sin(a) * d, { v: [Math.cos(a) * rand(0.5, 2.2), rand(1, 3) * up / 1.6, Math.sin(a) * rand(0.5, 2.2)],
      life: rand(0.5, 0.9), size: rand(0.08, 0.18), color: MUD[i % 4], alpha: 0.95, gravity: 9, drag: 0.3 });
  }
}
function gust(e, off) {
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2), d = rand(0.8, 2.4);
    emit(soft, e.x + off.x + Math.cos(a) * d, e.y + off.y + 0.15, e.z + off.z + Math.sin(a) * d, { v: [Math.cos(a) * rand(1.5, 3.5), rand(0.2, 0.8), Math.sin(a) * rand(1.5, 3.5)],
      life: rand(0.5, 0.9), size: rand(0.2, 0.4), grow: 1.3, color: '#5a4e43', alpha: 0.35, drag: 1.5 });
  }
}

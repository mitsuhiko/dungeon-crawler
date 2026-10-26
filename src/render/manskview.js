// What the game does to Mansk's model on top of his clips (render/enemies.js; his fight:
// game/mansk.js, the rules core/mansk.js). He flies (`lift`: the whole of him drawn that much over
// his floor); while he changes (mode 'split') his roar (ManskRise) or his horns straining and
// breaking (ManskBreak) play on his clock. When they break, the pieces fly off and bounce on the
// floor, and his horns are gone but for their stumps (the bones from the second on scaled away).
// Out of the stumps come his ribbons: four long red ribbons (two a stump), each a rope run by
// core/ribbon.js, tied to its stump and pointing out of it, pulled by gravity and by the air he
// swings them through: they swirl round him as he turns, fly out when he whirls (a dancer with
// long ribbons), reach for the one he lashes at, wind round them while he squeezes and fall
// slack when he lets go or dies. His diamond glows, the more while time is slowed. Dead, he falls
// flat on the floor, face up, like a mask dropped, with a slap and a puff of dust.
import * as THREE from 'three';
import { scene } from './scene.js';
import { glow, soft, emit, rand } from './particles.js';
import { sfx } from '../audio/sfx.js';
import { attackOf } from '../core/enemies.js';
import { MANSK_FIGHT } from '../core/mansk.js';
import { RIBBON, newRibbon, stepRibbon, linkLength } from '../core/ribbon.js';
import { player } from '../game/state.js';

const HIDDEN = 0.001, SIDES = ['L', 'R'], FLAT = 34 / 30;   // (s into ManskDeath he lies flat: its flat_frame)
const HORN = '#d9c49c', DUST = ['#f2ece0', '#d9c49c', '#bfb6a6'];
// two ribbons a stump: a long one and a shorter one, a little apart where they come out
const RIBBONS = [{ side: 'L', spec: RIBBON, turn: 0.25 }, { side: 'L', spec: { ...RIBBON, length: 3.8, width: 0.16 }, turn: -0.35 },
  { side: 'R', spec: RIBBON, turn: -0.25 }, { side: 'R', spec: { ...RIBBON, length: 3.8, width: 0.16 }, turn: 0.35 }];
const ease = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const bone = (model, n) => model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n));
const ribbonMaterial = () => new THREE.MeshStandardMaterial({ color: '#c8142c', emissive: '#3a0008', roughness: 0.5, metalness: 0.05,
  side: THREE.DoubleSide, transparent: true });

export function makeManskLook(model) {
  const horns = Object.fromEntries(SIDES.map(s => [s, [0, 1, 2, 3].map(j => bone(model, `horn.${s}.${j}`))]));
  const stumps = Object.fromEntries(SIDES.map(s => [s, bone(model, `stump.${s}`)]));
  return { horns, stumps, body: bone(model, 'body'), lift: null, broken: false, ribbons: null, shards: [], touched: 0, glow: 0 };
}

const A = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3(), Q = new THREE.Quaternion();
export function manskLook(v, e, dt, off) {
  const m = v.mansk, want = e.lift ?? 0;
  m.lift = m.lift === null ? want : m.lift + (want - m.lift) * Math.min(1, dt * 12);
  v.group.position.y += m.lift;
  // changing: his roar, or his horns breaking, on his clock
  if (e.mode === 'split') {
    const name = (e.stage ?? 1) === 1 ? 'rise' : 'break', act = v.actions[name];
    if (act) {
      for (const n in v.actions) { v.weights[n] = n === name ? 1 : 0; v.actions[n].setEffectiveWeight(v.weights[n]); }
      act.time = Math.min(e.t, act.getClip().duration);
      v.mixer.update(0);
    }
  }
  // his horns: whole, or broken off (once, the pieces flying)
  const broken = e.horns === 0 || (e.stage ?? 1) >= 3;
  if (broken && !m.broken && e.mode !== 'dead') breakHorns(v, e, off);
  m.broken ||= broken;
  if (m.broken) for (const s of SIDES) m.horns[s][1]?.scale.setScalar(HIDDEN);
  v.model.updateMatrixWorld(true);
  // the dust blown out where he lands
  if ((e.touched ?? 0) !== m.touched) { if (m.touched || e.touched > 1) landing(e, off); m.touched = e.touched ?? 0; }
  // dead, he falls flat on the floor (ManskDeath): a slap and the dust blown out
  if (e.mode === 'dead' && !m.slapped && e.deadT >= FLAT) {
    m.slapped = true;
    landing(e, off);
    if (Math.hypot(e.x - player.x, e.z - player.z) < 24) sfx('thud', { at: e, pitch: 0.8, volume: 1 });
  }
  ribbons(v, e, dt, off);
  shards(m, e, dt, off);
  // the diamond: brighter while time is slowed, and as he slows it
  const a = e.mode === 'attack' ? attackOf(e) : null, slowing = e.slowing > 0 || a?.cast === 'slow';
  m.glow += ((slowing ? 1 : 0) - m.glow) * Math.min(1, dt * 4);
  if (v.light) v.light.intensity *= 1 + 1.6 * m.glow * (0.8 + 0.2 * Math.sin(performance.now() / 120));
  if (m.glow > 0.05 && Math.random() < dt * 30 * m.glow) {
    v.body?.getWorldPosition(A);
    const r = rand(0.5, 1.2), t = rand(0, Math.PI * 2);
    emit(glow, A.x + Math.cos(t) * r, A.y + 0.8 + rand(-0.4, 0.4), A.z + Math.sin(t) * r, { v: [-Math.sin(t) * 0.6, 0.1, Math.cos(t) * 0.6],
      life: rand(0.6, 1), size: rand(0.05, 0.1), color: ['#ffffff', '#8fc8ff', '#ffe9a8'][Math.floor(Math.random() * 3)], alpha: 0.9, drag: 0.5 });
  }
}

// --- the horns breaking -----------------------------------------------------------
const pieceGeometry = new THREE.CylinderGeometry(0.075, 0.09, 0.42, 7), knobGeometry = new THREE.IcosahedronGeometry(0.1, 1);
const pieceMaterial = new THREE.MeshStandardMaterial({ color: HORN, roughness: 0.6, transparent: true });
function breakHorns(v, e, off) {
  const m = v.mansk;
  v.model.updateMatrixWorld(true);
  for (const s of SIDES) for (let j = 1; j < 4; j++) {
    const b = m.horns[s][j];
    if (!b) continue;
    b.getWorldPosition(A); b.getWorldQuaternion(Q);
    const mesh = new THREE.Mesh(j === 3 ? knobGeometry : pieceGeometry, pieceMaterial.clone());
    mesh.position.copy(A); mesh.quaternion.copy(Q); mesh.castShadow = true;
    scene.add(mesh);
    const out = s === 'L' ? 1 : -1, yaw = v.group.rotation.y;
    D.set(out * rand(1.2, 2.4), rand(2.5, 4.5), rand(-1, 1)).applyAxisAngle(UP, yaw);
    m.shards.push({ mesh, v: D.clone(), spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), t: 0, floor: e.y + off.y });
    for (let i = 0; i < 10; i++)
      emit(soft, A.x, A.y, A.z, { v: [rand(-1.5, 1.5), rand(0.5, 2.5), rand(-1.5, 1.5)], life: rand(0.5, 0.9), size: rand(0.06, 0.14),
        color: DUST[i % 3], alpha: 0.9, gravity: 6, drag: 1 });
  }
  if (Math.hypot(e.x - player.x, e.z - player.z) < 26) { sfx('shatter', { at: e, pitch: 0.6, volume: 1 }); sfx('icecrack', { at: e, pitch: 0.5 }); }
}
const UP = new THREE.Vector3(0, 1, 0);
function shards(m, e, dt, off) {
  m.shards = m.shards.filter(s => {
    s.t += dt;
    s.v.y -= 12 * dt;
    s.mesh.position.addScaledVector(s.v, dt);
    s.mesh.rotation.x += s.spin.x * dt; s.mesh.rotation.y += s.spin.y * dt; s.mesh.rotation.z += s.spin.z * dt;
    if (s.mesh.position.y < s.floor + 0.08) {   // bouncing on the floor, slowing, then lying there
      s.mesh.position.y = s.floor + 0.08;
      s.v.y = Math.abs(s.v.y) * 0.35; s.v.x *= 0.6; s.v.z *= 0.6; s.spin.multiplyScalar(0.5);
      if (s.v.y < 0.5) s.v.y = 0;
    }
    const fade = 1 - ease((s.t - 3.5) / 1.2);
    s.mesh.material.opacity = fade;
    if (fade > 0) return true;
    scene.remove(s.mesh); s.mesh.material.dispose();
    return false;
  });
}
// down on the floor: a ring of dust blown out
function landing(e, off) {
  if (Math.hypot(e.x - player.x, e.z - player.z) > 24) return;
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2, s = rand(1.5, 3);
    emit(soft, e.x + off.x + Math.cos(a) * 0.6, e.y + off.y + 0.1, e.z + off.z + Math.sin(a) * 0.6, { v: [Math.cos(a) * s, rand(0.2, 0.7), Math.sin(a) * s],
      life: rand(0.5, 0.9), size: rand(0.18, 0.32), grow: 1.2, color: DUST[i % 3], alpha: 0.45, drag: 2 });
  }
}

// --- the ribbons ------------------------------------------------------------------------
// the stump of horn s, where it is now (minus the cube's offset: the ribbons live in its frame)
// and which way it points
function stumpOf(v, s, off) {
  const b = v.mansk.stumps[s];
  if (!b) return null;
  b.getWorldPosition(A);
  B.set(0, 0.2, 0); b.localToWorld(B);
  D.copy(B).sub(A).normalize();
  return { at: { x: A.x - off.x, y: A.y - off.y, z: A.z - off.z }, dir: { x: D.x, y: D.y, z: D.z } };
}
function makeRibbons(v, off) {
  return RIBBONS.map(o => {
    const st = stumpOf(v, o.side, off) ?? { at: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 1, z: 0 } };
    const r = newRibbon(st.at, st.dir, o.spec, 0.02), n = r.n;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const index = [];
    for (let i = 0; i + 1 < n; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geometry.setIndex(index);
    const mesh = new THREE.Mesh(geometry, ribbonMaterial());
    mesh.castShadow = true; mesh.frustumCulled = false;
    scene.add(mesh);
    return { ...o, r, mesh };
  });
}
const T = new THREE.Vector3(), S = new THREE.Vector3(), P = new THREE.Vector3(), N0 = new THREE.Vector3();
function ribbons(v, e, dt, off) {
  const m = v.mansk, out = (e.grow ?? 0) > 0 || m.broken && (e.stage ?? 1) >= 3;
  if (!out) return;
  m.ribbons ??= makeRibbons(v, off);
  const a = e.mode === 'attack' ? attackOf(e) : null, dead = e.mode === 'dead', t = performance.now() / 1000;
  const held = player.held && !player.held.twirl && player.held.e === e && attackOf(e).grab?.ribbons;
  // the dance: the air swirls round him (hard while he whirls); flutter on top
  const whirl = a?.name === 'whirl' ? 1 : 0, spin = dead ? 0 : 3.5 + 28 * whirl;
  v.body?.getWorldPosition(A);
  const cx = A.x - off.x, cy = A.y - off.y, cz = A.z - off.z, floor = e.y + 0.02;
  const spheres = [{ x: cx, y: cy, z: cz, r: 0.55 }, { x: cx, y: cy + 0.55, z: cz, r: 0.6 }];
  const lashing = a?.name === 'lash' && e.t > 0.2 && e.t < a.hitAt + 0.1 && !dead;
  const foe = e.target?.here ? e.target : player;
  m.ribbons.forEach((o, k) => {
    const st = stumpOf(v, o.side, off);
    if (!st) return;
    // out of the stump, a little to one side of the other ribbon of it
    const c = Math.cos(o.turn), s = Math.sin(o.turn);
    const dir = { x: st.dir.x * c - st.dir.z * s, y: st.dir.y, z: st.dir.x * s + st.dir.z * c };
    o.r.grow = Math.max(0.02, e.grow ?? 1);
    const targets = [];
    if (held && o.spec === RIBBON) {   // wound round the one they hold
      for (let i = 0; i < 9; i++) {
        const u = i / 8, ang = t * 2.5 + u * Math.PI * 5 + (k ? Math.PI : 0);
        targets.push({ i: o.r.n - 9 + i, x: player.x + Math.cos(ang) * 0.36, y: player.y + 0.25 + u * 1.1, z: player.z + Math.sin(ang) * 0.36, k: 0.3 });
      }
    } else if (lashing && o.spec === RIBBON) {   // reaching out for them
      targets.push({ i: o.r.n - 1, x: foe.x, y: foe.y + 0.8, z: foe.z, k: 0.05 + 0.1 * Math.min(1, e.t / a.hitAt) });
    }
    const phase = k * 1.7;
    stepRibbon(o.r, dt, { anchor: st.at, dir, spheres, floor: () => floor, targets,
      accel: (i, x, y, z, acc) => {
        const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz) || 1, u = i / o.r.n;
        const flutter = dead ? 0 : Math.sin(t * 3.1 + u * 7 + phase) * 2.2;
        acc[0] = -dz / d * spin * u + dx / d * (whirl * 6 * u) + Math.cos(t * 1.7 + u * 5 + phase) * flutter;
        acc[1] = -5.5 + (dead ? 0 : 1.2 * Math.sin(t * 2.3 + u * 6 + phase));
        acc[2] = dx / d * spin * u + dz / d * (whirl * 6 * u) + Math.sin(t * 1.9 + u * 5 + phase) * flutter;
      } });
    drawRibbon(o, off, t, v.material.opacity);
  });
}
// the ribbon as a strip along its points, as wide as its spec says (narrower at its end), its side
// carried along the chain (parallel transport) and twisting a little as it goes
function drawRibbon(o, off, t, opacity) {
  const r = o.r, n = r.n, pos = o.mesh.geometry.attributes.position.array, p = r.p, w = r.spec.width / 2;
  N0.set(p[3] - p[0], p[4] - p[1], p[5] - p[2]).normalize();
  S.set(-N0.z, 0, N0.x);
  if (S.lengthSq() < 1e-6) S.set(1, 0, 0);
  S.normalize();
  for (let i = 0; i < n; i++) {
    const j = Math.min(n - 1, i + 1), h = Math.max(0, i - 1);
    T.set(p[j * 3] - p[h * 3], p[j * 3 + 1] - p[h * 3 + 1], p[j * 3 + 2] - p[h * 3 + 2]).normalize();
    S.addScaledVector(T, -S.dot(T));   // (keep it across the ribbon)
    if (S.lengthSq() < 1e-6) S.set(-T.z, 0, T.x);
    S.normalize();
    S.applyAxisAngle(T, 0.06 * Math.sin(t * 2 + i * 0.4));
    const u = i / (n - 1), half = w * (u < 0.75 ? 1 : 1 - (u - 0.75) * 2.4) * Math.min(1, linkLength(r) / (r.spec.length / r.spec.segments) * 2 + 0.2);
    P.set(p[i * 3] + off.x, p[i * 3 + 1] + off.y, p[i * 3 + 2] + off.z);
    pos[i * 6] = P.x - S.x * half; pos[i * 6 + 1] = P.y - S.y * half; pos[i * 6 + 2] = P.z - S.z * half;
    pos[i * 6 + 3] = P.x + S.x * half; pos[i * 6 + 4] = P.y + S.y * half; pos[i * 6 + 5] = P.z + S.z * half;
  }
  o.mesh.geometry.attributes.position.needsUpdate = true;
  o.mesh.geometry.computeVertexNormals();
  o.mesh.material.opacity = opacity;
  o.mesh.visible = opacity > 0.01;
}

export function disposeManskLook(m) {
  for (const o of m.ribbons ?? []) { scene.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); }
  for (const s of m.shards) { scene.remove(s.mesh); s.mesh.material.dispose(); }
  m.ribbons = null; m.shards = [];
}
// (where his ribbons are out: their points, for the tests in the browser, tests/browser/mansk.js)
export const ribbonPoints = e => e.view?.mansk?.ribbons?.map(o => o.r) ?? [];
export const MANSK_LOOK = { ribbons: RIBBONS.length, breakAt: MANSK_FIGHT.breakAt };

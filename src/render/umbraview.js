// What the game does to Umbra's model on top of his clips (render/enemies.js; his fight: game/umbra.js,
// the rules core/umbra.js, his model blender/umbra.py). His clips move his jaw, his eyes and the
// frills of his head; his spine is laid here along the way his head went (core/umbra.js bodyAt: his
// fight's trail, or, in a friend's game, one made here from where he is shown), each bone at its
// place on it, turned along it with its top up, and a swimming wave running back along him while he
// moves; his head bone at his neck, looking the way his head goes. Each bone keeps its own frame
// from the rest pose (a frame along the body times the rest's), so nothing rolls over. His shield of
// air and water (`shield`: game/umbra.js) is a shimmering bubble round his head; bubbles trail off
// his body as he swims.
import * as THREE from 'three';
import { UMBRA_FIGHT, newTrail, pushTrail, settleTrail, bodyAt } from '../core/umbra.js';
import { groundAt } from '../physics/collide.js';
import { soft, emit, rand } from './particles.js';
import { player } from '../game/state.js';

const HEAD = 0.46;   // cells from the middle of his head to his `y` (blender/umbra.py MID)
const bone = (model, n) => model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n));
const UP = new THREE.Vector3(0, 1, 0);
const m3 = new THREE.Matrix4(), m4 = new THREE.Matrix4(), inv = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion();
const p = new THREE.Vector3(), f = new THREE.Vector3(), u = new THREE.Vector3(), x = new THREE.Vector3(), s = new THREE.Vector3(), sc = new THREE.Vector3();
const BUBBLES = ['#e8fbff', '#bfefff', '#8fd8f0'];

// a frame (rotation) whose z is `fwd` and whose y is `up` made square to it
function frame(out, fwd, up) {
  u.copy(up).addScaledVector(fwd, -up.dot(fwd));
  if (u.lengthSq() < 1e-6) u.set(1, 0, 0).addScaledVector(fwd, -fwd.x);
  u.normalize();
  x.crossVectors(u, fwd).normalize();
  m3.makeBasis(x, u, fwd);
  return out.setFromRotationMatrix(m3);
}

export function makeUmbraLook(model, group, mesh) {
  const B = UMBRA_FIGHT.body, names = Array.from({ length: B.bones }, (_, i) => `spine_${i}`);
  const spine = names.map(n => bone(model, n)).filter(Boolean), head = bone(model, 'head');
  // each bone's rest frame in the model, and the frame along the body it was made in (the body back
  // along -z, the head forward along +z, up +y)
  model.updateMatrixWorld(true);
  const toModel = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const rest = b => { const w = new THREE.Matrix4().multiplyMatrices(toModel, b.matrixWorld), r = new THREE.Quaternion(); w.decompose(new THREE.Vector3(), r, new THREE.Vector3()); return r; };
  const along = (fwd) => frame(new THREE.Quaternion(), new THREE.Vector3(...fwd), UP).invert();
  const neck = (B.length - 0.45) / B.bones;
  const bones = [...(head ? [{ b: head, s: 0.45, ahead: true, rest: rest(head), base: along([0, 0, 1]) }] : []),
    ...spine.map((b, i) => ({ b, s: 0.45 + i * neck, ahead: false, rest: rest(b), base: along([0, 0, -1]) }))];
  // (his body is wherever the game lays it: never culled by the rest pose's bounds)
  mesh.frustumCulled = false;
  mesh.traverse(o => { o.frustumCulled = false; });
  // the shield: a bubble of air and water round his head
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uK: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vN, vV, vP; void main() { vP = position; vec4 w = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-w.xyz); gl_Position = projectionMatrix * w; }`,
    fragmentShader: `uniform float uTime, uK; varying vec3 vN, vV, vP;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float swirl = 0.5 + 0.5 * sin(vP.x * 9.0 + uTime * 3.1) * sin(vP.y * 7.0 - uTime * 2.3) * sin(vP.z * 8.0 + uTime * 1.7);
        vec3 c = mix(vec3(0.55, 0.9, 1.0), vec3(1.0), swirl * 0.6);
        gl_FragColor = vec4(c, uK * (0.12 + 0.75 * rim + 0.12 * swirl));
      }` }));
  shield.renderOrder = 3; shield.visible = false;
  group.parent?.add(shield);
  return { bones, shield, trail: null, t: 0, shieldK: 0, bubble: 0, plane: null, clipped: false };
}

export function disposeUmbraLook(v) {
  const m = v.umbra;
  if (!m) return;
  m.shield.removeFromParent(); m.shield.geometry.dispose(); m.shield.material.dispose();
}

// after his clips: his spine along his trail, his head at its front; his shield; bubbles
export function umbraLook(v, e, dt, off) {
  const m = v.umbra;
  m.t += dt;
  // his trail: his fight's (ours), or made here from where he is shown (a friend's)
  let trail = e.trail;
  if (!trail) {
    const h = { x: e.x, y: e.y + HEAD, z: e.z };
    if (!m.trail) m.trail = newTrail(h, [Math.sin(e.yaw), 0, Math.cos(e.yaw)]);
    else if (e.mode === 'dead') settleTrail(m.trail, (x, z) => { const g = groundAt(x, z, h.y + 8, 0).h; return Number.isFinite(g) ? g : h.y - 1; }, dt);
    else pushTrail(m.trail, h);
    trail = m.trail;
  }
  v.group.updateMatrixWorld(true);
  const moving = Math.min(1, (e.speed ?? 0) / 1.5), L = UMBRA_FIGHT.body.length, wave = e.mode === 'dead' ? 0 : 0.11 + 0.08 * moving;
  for (const k of m.bones) {
    const a = bodyAt(trail, k.s), b = k.ahead ? bodyAt(trail, 0) : bodyAt(trail, Math.min(L, k.s + 0.4));
    f.set(b.x - a.x, b.y - a.y, b.z - a.z);
    if (f.lengthSq() < 1e-8) f.set(Math.sin(e.yaw), 0, Math.cos(e.yaw)).multiplyScalar(k.ahead ? 1 : -1);
    f.normalize();
    // the swimming wave: a little to the side, more towards the tail, running back along him
    const w = k.ahead ? 0 : wave * Math.min(1, k.s / 3) * Math.sin(k.s * 1.25 - m.t * 5.5);
    s.crossVectors(UP, f).normalize();
    p.set(a.x + off.x + s.x * w, a.y + off.y, a.z + off.z + s.z * w);
    frame(q, f, UP).multiply(k.base).multiply(k.rest);
    // into its parent's frame, at the scale it has there
    const parent = k.b.parent;
    inv.copy(parent.matrixWorld).invert();
    parent.matrixWorld.decompose(x, q2, sc);
    m4.compose(p, q, sc);
    m4.premultiply(inv).decompose(k.b.position, k.b.quaternion, k.b.scale);
    k.b.updateMatrixWorld(true);
  }
  // coming out of the wall (game/umbra.js emerge): what of him is still in it is not drawn
  const cw = e.clipWall;
  if (cw) {
    m.plane ??= new THREE.Plane();
    m.plane.normal.set(cw[0], 0, cw[1]);
    m.plane.constant = -(cw[2] + cw[0] * off.x + cw[1] * off.z);
  }
  if (!!cw !== !!m.clipped) {
    m.clipped = !!cw;
    for (const mat of [v.material, v.ghost]) { mat.clippingPlanes = cw ? [m.plane] : null; mat.needsUpdate = true; }
  }
  // the shield: in and out, shimmering round his head
  m.shieldK += ((e.shield > 0 && e.mode !== 'dead' && e.mode !== 'split' ? 1 : 0) - m.shieldK) * Math.min(1, dt * 6);
  m.shield.visible = m.shieldK > 0.01 && v.group.visible;
  if (m.shield.visible) {
    const c = bodyAt(trail, 0.6);
    m.shield.position.set(c.x + off.x, c.y + off.y, c.z + off.z);
    m.shield.scale.setScalar(1.25 + 0.06 * Math.sin(m.t * 5) + 0.3 * (1 - m.shieldK));
    m.shield.material.uniforms.uTime.value = m.t;
    m.shield.material.uniforms.uK.value = m.shieldK;
    if (Math.random() < dt * 30) {
      const a = rand(0, Math.PI * 2), r = 1.3;
      emit(soft, c.x + off.x + Math.cos(a) * r, c.y + off.y + rand(-0.8, 0.8), c.z + off.z + Math.sin(a) * r,
        { v: [0, rand(0.4, 0.9), 0], life: rand(0.5, 1), size: rand(0.03, 0.06), color: BUBBLES[0], alpha: 0.8, drag: 1.5, gravity: -0.4 });
    }
  }
  // bubbles off his body as he swims (near the hero only)
  if (e.mode !== 'dead' && v.group.visible && Math.hypot(e.x - player.x, e.z - player.z) < 14 && (m.bubble += dt * (2 + 8 * moving)) > 1) {
    m.bubble = 0;
    const c = bodyAt(trail, rand(0.5, L * 0.9));
    emit(soft, c.x + off.x + rand(-0.2, 0.2), c.y + off.y + 0.35, c.z + off.z + rand(-0.2, 0.2),
      { v: [rand(-0.1, 0.1), rand(0.5, 1.1), rand(-0.1, 0.1)], life: rand(0.8, 1.6), size: rand(0.025, 0.05), color: BUBBLES[(Math.random() * 3) | 0], alpha: 0.7, drag: 1.2, gravity: -0.5 });
  }
}

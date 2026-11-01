// The player's flasks (game/throws.js): flying, turning end over end, in the item's own model
// (as big as in the hand) with a faint trail of its colour; the burning patches (flames licking
// up from a glowing scorch, with a light) and the poison clouds (green mist welling up over a
// sickly pool) they leave; and while a flask is in hand, the arc a click would throw it along:
// a dotted line from the hand to where it comes down, and a ring as wide as its burst there.
import * as THREE from 'three';
import { loadGLB } from './gltf.js';
import { dressLook } from './looks.js';
import { CHAR_SCALE } from '../core/constants.js';
import { ITEMS } from '../core/items.js';
import { scene } from './scene.js';
import { glow, soft, emit, rand, ring } from './particles.js';
import { trackLight, untrackLight } from './lightpool.js';
import { FIRE_COLORS } from './flames.js';

const models = new Map();   // item id -> { scene, scale, lift } (null while loading)
// a flask's model, loaded once: its extras say how big it is in the hand (mount_scale)
function flaskModel(itemId) {
  if (models.has(itemId)) return models.get(itemId);
  models.set(itemId, null);
  loadGLB(ITEMS[itemId].model).then(g => {
    let scale = 1;
    g.scene.traverse(o => { if (o.userData.mount_scale) scale = o.userData.mount_scale; if (o.isMesh) { o.castShadow = true; o.userData.sharedGeo = true; } });
    const box = new THREE.Box3().setFromObject(g.scene);
    models.set(itemId, { scene: g.scene, scale: CHAR_SCALE * scale, lift: (box.min.y + box.max.y) / 2 });
  }).catch(e => { console.error('flask model failed to load', itemId, e); });
  return null;
}
export const loadFlaskModel = itemId => { flaskModel(itemId); };

function flaskView(f) {
  const group = new THREE.Group(), inner = new THREE.Group(), m = flaskModel(f.stats.flask);
  group.add(inner);
  if (m) {
    const o = dressLook(m.scene.clone(), f.stats.flask);   // (in its look, core/looks.js)
    o.position.y = -m.lift;
    inner.add(o);
    inner.scale.setScalar(m.scale);
  }
  scene.add(group);
  return { group, inner };
}
export function drawFlasks(list, dt, off = { x: 0, y: 0, z: 0 }) {
  for (const f of list) {
    const v = f.view || (f.view = flaskView(f));
    v.group.position.set(f.x + off.x, f.y + off.y, f.z + off.z);
    v.group.rotation.y = Math.atan2(f.vx, f.vz);
    v.inner.rotation.x = f.spin;
    if (Math.random() < 40 * dt)
      emit(glow, v.group.position.x, v.group.position.y, v.group.position.z, { v: [rand(-0.2, 0.2), rand(0, 0.3), rand(-0.2, 0.2)],
        life: rand(0.2, 0.35), size: rand(0.04, 0.07), color: f.stats.color, alpha: 0.7, drag: 2 });
  }
}
export function removeFlaskViews(list) {
  for (const f of list) if (f.view) { scene.remove(f.view.group); f.view = null; }
}

// the lingering areas: a disc on the floor (fading in and out) and their particles
const disc = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
const LOOK = {
  fire: { color: '#ff6a1a', opacity: 0.35, blending: THREE.AdditiveBlending, light: 0xff6a20 },
  toxic: { color: '#6fbf2a', opacity: 0.32, blending: THREE.NormalBlending, light: null },
};
function areaView(a) {
  const look = LOOK[a.kind], group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: look.color, transparent: true, opacity: 0, blending: look.blending, depthWrite: false });
  const mesh = new THREE.Mesh(disc, material);
  mesh.scale.setScalar(a.r); mesh.position.y = 0.04; mesh.renderOrder = 5;
  group.add(mesh);
  let light = null;
  if (look.light) { light = new THREE.PointLight(look.light, 0, 3.5, 2); light.position.y = 0.5; trackLight(light, group, group, 2); }
  scene.add(group);
  return { group, material, light, look };
}
export function drawAreas(list, dt, off = { x: 0, y: 0, z: 0 }) {
  for (const a of list) {
    const v = a.view || (a.view = areaView(a)), k = Math.max(0, Math.min(1, a.t / 0.2, (a.time - a.t) / 0.6));
    v.group.position.set(a.x + off.x, a.y + off.y, a.z + off.z);
    v.material.opacity = v.look.opacity * k * (a.kind === 'fire' ? 0.8 + 0.2 * Math.sin(a.t * 17) : 1);
    if (v.light) v.light.intensity = 2.6 * k * (0.75 + 0.25 * Math.sin(a.t * 23) * Math.sin(a.t * 7));
    const x = v.group.position.x, y = v.group.position.y, z = v.group.position.z, area = a.r * a.r;
    if (a.kind === 'fire') {
      for (let i = Math.floor(70 * area * k * dt + Math.random()); i > 0; i--) {
        const [dx, dz] = ring(a.r * 0.9);
        emit(glow, x + dx, y + 0.05, z + dz, { v: [0, rand(0.8, 1.8), 0], spread: 0.25, life: rand(0.25, 0.5), size: rand(0.1, 0.2),
          grow: -0.5, color: FIRE_COLORS[i % 4], gravity: -2, drag: 1 });
      }
      if (Math.random() < 6 * k * dt) {
        const [dx, dz] = ring(a.r * 0.7);
        emit(soft, x + dx, y + 0.6, z + dz, { v: [0, rand(0.5, 0.9), 0], spread: 0.2, life: rand(0.8, 1.2), size: rand(0.25, 0.4),
          grow: 0.8, color: '#4a4440', alpha: 0.3, drag: 0.5 });
      }
    } else {
      for (let i = Math.floor(16 * area * k * dt + Math.random()); i > 0; i--) {
        const [dx, dz] = ring(a.r * 0.9);
        emit(soft, x + dx, y + rand(0.05, 0.4), z + dz, { v: [rand(-0.15, 0.15), rand(0.1, 0.35), rand(-0.15, 0.15)], life: rand(1, 1.6),
          size: rand(0.35, 0.6), grow: 0.7, color: i % 3 ? '#8fdc3c' : '#4f8f22', alpha: 0.28, drag: 0.6 });
      }
      for (let i = Math.floor(10 * area * k * dt + Math.random()); i > 0; i--) {   // bubbles popping on the pool
        const [dx, dz] = ring(a.r * 0.8);
        emit(glow, x + dx, y + 0.06, z + dz, { v: [0, rand(0.2, 0.5), 0], life: rand(0.2, 0.4), size: rand(0.04, 0.08), color: '#c8ff7a', alpha: 0.7 });
      }
    }
  }
}
export function removeAreaViews(list) {
  for (const a of list) if (a.view) {
    scene.remove(a.view.group);
    if (a.view.light) untrackLight(a.view.light);
    a.view.material.dispose();
    a.view = null;
  }
}

// The aiming arc: dots marching along the flight, drawn over everything; the ring where it
// comes down (dimmer when the target is out of range and pulled in).
const DOTS = 64, SPACING = 0.22;
const dotMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthTest: false, depthWrite: false });
const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 8, 6), dotMaterial, DOTS);
const ringMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthTest: false, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
const target = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), ringMaterial);
const fillMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthTest: false, depthWrite: false });
const fill = new THREE.Mesh(disc, fillMaterial);
dots.renderOrder = target.renderOrder = fill.renderOrder = 997;
dots.frustumCulled = false;
dots.visible = target.visible = fill.visible = false;
scene.add(dots, target, fill);
const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Vector3();
let march = 0, last = performance.now();
// arc: core/throws.js arcOf plus { radius, color, clamped }, or null to hide it
export function drawArc(arc) {
  dots.visible = target.visible = fill.visible = !!arc;
  if (!arc) return;
  const now = performance.now();
  march = (march + (now - last) / 1000 * 0.6) % SPACING; last = now;
  // dots every SPACING along the flight, starting `march` in (they flow towards the target)
  let n = 0, along = SPACING - march, have = 0;
  for (let i = 1; i < arc.points.length && n < DOTS; i++) {
    p.fromArray(arc.points[i - 1]); q.fromArray(arc.points[i]);
    const seg = p.distanceTo(q);
    while (along <= have + seg && n < DOTS) {
      const t = (along - have) / (seg || 1);
      m4.makeTranslation(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, p.z + (q.z - p.z) * t);
      dots.setMatrixAt(n++, m4);
      along += SPACING;
    }
    have += seg;
  }
  dots.count = n;
  dots.instanceMatrix.needsUpdate = true;
  dotMaterial.color.set(arc.color);
  const { x, y, z } = arc.end;
  target.position.set(x, y + 0.05, z); target.scale.setScalar(arc.radius);
  fill.position.set(x, y + 0.04, z); fill.scale.setScalar(arc.radius);
  ringMaterial.color.set(arc.hit ? '#ffffff' : arc.color);
  ringMaterial.opacity = arc.clamped ? 0.4 : 0.75;
  fillMaterial.color.set(arc.color);
}

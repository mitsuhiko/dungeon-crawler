// What Rollie's lasers look like that are his fight's own (game/rollie.js; his plain laser is a
// beam like the Spicy's, render/beams.js):
//   - his blades: two blades of light, a white-hot core in a red glow, spinning flat as they fly,
//     trailing sparks;
//   - his sweep: a thin red beam from his eyes to where it follows you, flickering, with a glowing
//     spot and sparks where it ends and a light there;
//   - his grid: the floor cells blinking red, faster and brighter as the strike comes, then a
//     column of red light from high above slamming down onto each, a flash on the floor, fading.
// Only the game that runs the enemies has them.
import * as THREE from 'three';
import { scene } from './scene.js';
import { glow, emit, rand } from './particles.js';
import { trackLight, untrackLight } from './lightpool.js';
import { ROLLIE_FIGHT as G } from '../core/rollie.js';

const RED = new THREE.Color('#ff4a3a'), HOT = new THREE.Color('#fff2e8');
const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
const tube = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0);   // +Y, 0 to 1
const blade = new THREE.CapsuleGeometry(1, 1, 4, 10).rotateZ(Math.PI / 2);         // along X
const square = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const ball = new THREE.IcosahedronGeometry(1, 1);
const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();

let mats = null;
const materials = () => mats ??= {
  core: new THREE.MeshBasicMaterial({ color: HOT, ...additive }),
  halo: new THREE.MeshBasicMaterial({ color: RED, opacity: 0.55, ...additive }),
  cell: new THREE.MeshBasicMaterial({ color: RED, opacity: 0.5, ...additive, side: THREE.DoubleSide }),
  column: new THREE.MeshBasicMaterial({ color: RED, opacity: 0.7, ...additive }),
};
// views by the thing they show
const views = new Map();

function bladeView() {
  const m = materials(), group = new THREE.Group();
  const core = new THREE.Mesh(blade, m.core), halo = new THREE.Mesh(blade, m.halo);
  core.scale.set(0.42, 0.035, 0.035); halo.scale.set(0.5, 0.09, 0.09);
  const cross = core.clone(), crossHalo = halo.clone();
  cross.rotation.y = crossHalo.rotation.y = Math.PI / 2;
  group.add(core, halo, cross, crossHalo);
  scene.add(group);
  return { group, dispose() { scene.remove(group); } };
}
function sweepView() {
  const m = materials(), group = new THREE.Group();
  const core = new THREE.Mesh(tube, m.core), halo = new THREE.Mesh(tube, m.halo), spot = new THREE.Mesh(ball, m.halo);
  core.frustumCulled = halo.frustumCulled = false;
  const light = new THREE.PointLight(RED, 2.5, 3.5, 2);
  group.add(core, halo, spot);
  scene.add(group); trackLight(light, spot);
  return { group, core, halo, spot, light, dispose() { scene.remove(group); untrackLight(light); } };
}
function gridView(g) {
  const m = materials(), group = new THREE.Group(), cells = [], columns = [];
  const cell = m.cell.clone(), column = m.column.clone();
  for (const c of g.cells) {
    const q = new THREE.Mesh(square, cell);
    q.position.set(c.x + 0.5, c.y + 0.03, c.z + 0.5); q.scale.setScalar(0.92);
    const col = new THREE.Mesh(tube, column);
    col.position.set(c.x + 0.5, c.y, c.z + 0.5); col.scale.set(0.3, 9, 0.3); col.visible = false;
    group.add(q, col); cells.push(q); columns.push(col);
  }
  scene.add(group);
  return { group, cells, columns, cell, column, dispose() { scene.remove(group); cell.dispose(); column.dispose(); } };
}

// every frame (game/rollie.js), the fights as they are
export function drawRollieFx(fights, dt) {
  const now = new Set();
  const view = (key, make) => { now.add(key); let v = views.get(key); if (!v) views.set(key, v = make()); return v; };
  const t = performance.now() / 1000;
  for (const f of fights) {
    for (const s of f.sabers) {
      const v = view(s, bladeView);
      v.group.position.set(s.x, s.y, s.z);
      v.group.rotation.set(0, s.spin, 0);
      if (Math.random() < dt * 30) emit(glow, s.x + rand(-0.3, 0.3), s.y, s.z + rand(-0.3, 0.3), { life: 0.25, size: 0.07, color: '#ff8a6a', alpha: 0.8 });
    }
    const w = f.sweep;
    if (w?.from) {
      const v = view(w, sweepView), k = 0.8 + 0.2 * Math.sin(t * 53) * Math.sin(t * 19);
      const from = new THREE.Vector3(w.from.x, w.from.y, w.from.z), to = new THREE.Vector3(w.aim.x, w.aim.y, w.aim.z);
      dir.subVectors(to, from);
      const l = dir.length();
      for (const [mesh, r] of [[v.core, 0.035 * k], [v.halo, G.sweep.radius * 0.45 * k]]) {
        mesh.position.copy(from);
        mesh.quaternion.setFromUnitVectors(up, dir.clone().normalize());
        mesh.scale.set(r, l, r);
      }
      v.spot.position.copy(to); v.spot.scale.setScalar(0.18 * k + 0.05);
      v.light.intensity = 2 + k;
      if (Math.random() < dt * 40) emit(glow, to.x, to.y, to.z, { v: [rand(-1, 1), rand(0.5, 2), rand(-1, 1)], life: 0.35, size: 0.05, color: '#ffb08a', gravity: -6 });
    }
    for (const g of f.grids) {
      if (!g.cells) continue;
      const v = view(g, () => gridView(g)), u = (g.t - g.at) / G.grid.warn;
      if (u < 1) {   // blinking, faster and brighter as the strike comes
        const blink = 0.5 + 0.5 * Math.sin(t * (8 + 26 * u) * Math.PI);
        v.cell.opacity = (0.15 + 0.55 * u) * (0.35 + 0.65 * blink);
      } else {      // struck: the columns slam down and fade
        const s = (g.t - g.at - G.grid.warn) / G.grid.strike;
        if (!v.flashed) {
          v.flashed = true;
          for (const c of g.cells) for (let i = 0; i < 6; i++) emit(glow, c.x + 0.5, c.y + 0.1, c.z + 0.5,
            { v: [rand(-2, 2), rand(1, 3), rand(-2, 2)], life: 0.4, size: 0.08, color: '#ff8a6a', gravity: -8 });
        }
        v.cell.opacity = 0.9 * (1 - s);
        v.column.opacity = 0.8 * (1 - s);
        v.columns.forEach(col => { col.visible = true; col.scale.set(0.32 * (1 - 0.5 * s), 9, 0.32 * (1 - 0.5 * s)); });
      }
    }
  }
  for (const [key, v] of views) if (!now.has(key)) { v.dispose(); views.delete(key); }
}
export function clearRollieFx() {
  for (const v of views.values()) v.dispose();
  views.clear();
}

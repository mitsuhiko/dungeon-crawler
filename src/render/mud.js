// Sollmeldon's puddles of mud (game/mud.js draws them, game/sollmeldon.js makes and moves them): a
// glossy black blob lying on the ground where a ball of mud landed (render/meteors.js groundPatch:
// on its level only), a bubble rising in it now and then. They do not dry up; on the tipped world
// they run downhill, the patch laid anew under them as they go, and into his mud. In the cube's
// coordinates, with its offset. One that is gone (it ran into the mud, or he was beaten) sinks away.
import * as THREE from 'three';
import { scene } from './scene.js';
import { soft, emit, rand } from './particles.js';
import { groundPatch, painted } from './meteors.js';

const SHAPES = Array.from({ length: 4 }, (_, s) => painted((g, h) => {
  g.beginPath();
  for (let i = 0; i < 22; i++) {
    const a = Math.PI * 2 * i / 22, k = (1 + 0.16 * Math.sin(3 * a + s * 1.7) + 0.1 * Math.sin(5 * a + s * 2.9) + 0.05 * Math.sin(11 * a + s)) / 1.3;
    g.lineTo(h + Math.cos(a) * k * h, h + Math.sin(a) * k * h);
  }
  g.closePath(); g.fill();
}));
const SIZE = 1.3;   // the patch is this times the puddle's radius (its blob reaches out to about its radius)
const material = shape => new THREE.MeshStandardMaterial({ color: '#15110d', roughness: 0.12, metalness: 0.05, alphaMap: shape,
  transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const BUBBLE = ['#3a3129', '#4a4036', '#2a231d'];

const views = new Map();   // puddle -> { mesh, at: [x, y, z, r] the patch was laid for, gone (s sinking away) }
let made = 0;
function lay(v, p) {
  v.mesh.geometry.dispose();
  v.mesh.geometry = groundPatch(p.x, p.y, p.z, p.r * SIZE, v.turn);
  v.at = [p.x, p.y, p.z, p.r];
}
function drop(v) { scene.remove(v.mesh); v.mesh.geometry.dispose(); v.mesh.material.dispose(); }
export function drawPuddles(list, dt, off = { x: 0, y: 0, z: 0 }) {
  for (const [p, v] of views) if (!list.includes(p)) {
    v.gone = (v.gone ?? 0) + dt;
    v.mesh.material.opacity = Math.max(0, 1 - v.gone / 0.8);
    v.mesh.position.y -= dt * 0.05;
    if (v.gone > 0.8) { drop(v); views.delete(p); }
  }
  for (const p of list) {
    let v = views.get(p);
    if (!v) {
      v = { mesh: new THREE.Mesh(new THREE.BufferGeometry(), material(SHAPES[made++ % SHAPES.length])), turn: Math.random() * Math.PI * 2, grow: 0 };
      v.mesh.renderOrder = 1;
      scene.add(v.mesh); views.set(p, v);
      lay(v, p);
    }
    const [x, y, z, r] = v.at;
    if (Math.hypot(p.x - x, p.z - z) > 0.2 || Math.abs(p.y - y) > 0.05 || Math.abs(p.r - r) > 0.08) lay(v, p);
    v.grow = Math.min(1, v.grow + dt * 5);
    // (the patch lies where it was laid, till it is laid anew under the puddle)
    v.mesh.position.set(v.at[0] + off.x, v.at[1] + off.y + 0.012, v.at[2] + off.z);
    v.mesh.scale.setScalar(0.55 + 0.45 * v.grow);
    v.mesh.material.opacity = 1;
    const spots = v.mesh.geometry.userData.spots;
    if (spots?.length && Math.random() < dt * 0.8) {
      const [bx, by, bz] = spots[Math.floor(Math.random() * spots.length)];
      emit(soft, p.x + off.x + bx, p.y + off.y + by + 0.04, p.z + off.z + bz,
        { v: [0, rand(0.1, 0.25), 0], life: rand(0.3, 0.5), size: rand(0.05, 0.09), color: BUBBLE[made % 3], alpha: 0.9, drag: 1 });
    }
  }
}
export function clearPuddles() { views.forEach(drop); views.clear(); }

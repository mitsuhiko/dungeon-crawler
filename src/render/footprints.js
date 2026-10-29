// Wet footprints: on the slime (the slime marsh: core/footing.js, its `slime` ground) the hero's
// at each foot's touchdown (game/footsteps.js), a friend's and the enemies' as they walk (a print
// every so far, the feet taking turns: walkPrints); and the hero's for a while after coming out
// of the water (dark and glossy, fainter with each step as they dry: game/footsteps.js), or out of
// Sollmeldon's mud (brown). They lie where they were left in the cube and dry up, shrinking away
// over the last part of their life; a new cube starts without any. One instanced mesh for each
// kind, the oldest print giving its place to the newest.
import * as THREE from 'three';
import { scene } from './scene.js';

const MOST = 160;     // prints at once (of each kind)
const DRY = 0.35;     // the share of its life it takes drying up
const STRIDE = 0.34;  // cells walked between a walker's prints (one foot, then the other)
// each kind's look: slime green, a little aglow (seen at night too); water darkening what it lies
// on, glossy; mud brown. life: s a print lasts
const KINDS = {
  slime: { color: '#7ad040', emissive: '#2e6a14', roughness: 0.15, opacity: 0.6, life: 9 },
  wet: { color: '#000000', emissive: '#000000', roughness: 0.08, opacity: 0.4, life: 6 },
  mud: { color: '#3a3129', emissive: '#000000', roughness: 0.2, opacity: 0.75, life: 9 },
};

// a boot's print, flat on the floor, its toe towards +z (about a quarter of a cell long)
function printShape() {
  const ellipse = (cx, cy, rx, ry, n = 10) => {
    const s = new THREE.Shape();
    for (let i = 0; i <= n; i++) {
      const a = Math.PI * 2 * i / n, x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      if (i) s.lineTo(x, y); else s.moveTo(x, y);
    }
    return new THREE.ShapeGeometry(s);
  };
  // (shapes lie in x, y; turned flat, face up, their -y becomes the toe's +z)
  const sole = ellipse(0, -0.045, 0.045, 0.065), heel = ellipse(0, 0.07, 0.036, 0.04), n = sole.attributes.position.count;
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute([...sole.attributes.position.array, ...heel.attributes.position.array], 3));
  merged.setIndex([...sole.index.array, ...[...heel.index.array].map(i => i + n)]);
  merged.rotateX(-Math.PI / 2);
  merged.computeVertexNormals();
  return merged;
}
const shape = printShape();
// a kind's prints: one instanced mesh, each print as opaque as its `fade` says (aFade)
function layer(L) {
  const geometry = shape.clone(), fade = new THREE.InstancedBufferAttribute(new Float32Array(MOST), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aFade', fade);
  const material = new THREE.MeshStandardMaterial({ color: L.color, emissive: L.emissive, roughness: L.roughness, metalness: 0, transparent: true,
    opacity: L.opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  material.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float aFade;\nvarying float vFade;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFade = aFade;');
    sh.fragmentShader = 'varying float vFade;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.a *= vFade;');
  };
  material.customProgramCacheKey = () => 'footprint';
  const mesh = new THREE.InstancedMesh(geometry, material, MOST);
  mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 1;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  return { ...L, mesh, fade, prints: [] };   // prints: { x, y, z, yaw, size, fade, age }, oldest first
}
const layers = Object.fromEntries(Object.entries(KINDS).map(([kind, L]) => [kind, layer(L)]));
const walkers = new Map();   // key -> { x, z, side }: where its last print is
let cube = null;

// a print of one foot at (x, y, z) (where the body stands: the foot is beside it), facing yaw;
// side: -1 left, 1 right; size: how big the body is; kind: KINDS; fade: how much of it shows
export function footprint(x, y, z, yaw, side, size = 1, kind = 'slime', fade = 1) {
  const s = Math.sin(yaw), c = Math.cos(yaw), d = 0.08 * side * size, prints = layers[kind].prints;
  prints.push({ x: x + d * c, y, z: z - d * s, yaw: yaw + 0.12 * side, size: size * (0.92 + Math.random() * 0.16), fade, age: 0 });
  if (prints.length > MOST) prints.shift();
}
// a walker `key` (an enemy, a friend) at (x, y, z) facing yaw: a print on the slime whenever it
// has gone far enough since its last one; onSlime: whether it stands on slime now (else it only
// keeps track)
export function walkPrints(key, x, y, z, yaw, size = 1, onSlime = true) {
  const w = walkers.get(key);
  if (!w || Math.hypot(x - w.x, z - w.z) > 2) { walkers.set(key, { x, z, side: 1 }); return; }   // (new, or moved by a cube sliding)
  if (Math.hypot(x - w.x, z - w.z) < STRIDE * size) return;
  w.x = x; w.z = z; w.side = -w.side;
  if (onSlime) footprint(x, y, z, yaw, w.side, size);
}
export const forgetWalker = key => walkers.delete(key);
export function clearFootprints() {
  for (const L of Object.values(layers)) { L.prints.length = 0; L.mesh.count = 0; }
  walkers.clear();
}

const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
// every frame: age the prints and lay them out; key: the cube being played (a new one: none)
export function tickFootprints(dt, key) {
  if (key !== cube) { cube = key; clearFootprints(); }
  for (const L of Object.values(layers)) {
    const prints = L.prints;
    while (prints.length && prints[0].age >= L.life) prints.shift();
    L.mesh.count = prints.length;
    if (!prints.length) continue;
    prints.forEach((f, i) => {
      f.age += dt;
      const k = f.size * Math.max(0, Math.min(1, (L.life - f.age) / (L.life * DRY)));   // drying up: shrinking away
      m.compose(p.set(f.x, f.y + 0.012, f.z), q.setFromAxisAngle(up, f.yaw), sc.set(k, 1, k));
      L.mesh.setMatrixAt(i, m);
      L.fade.setX(i, f.fade);
    });
    L.mesh.instanceMatrix.needsUpdate = L.fade.needsUpdate = true;
  }
}
// for render/warmup.js: the prints' program (one for every kind), compiled before the first one is left
let warmer = null;
export const footprintWarmup = () => [warmer ??= Object.assign(new THREE.InstancedMesh(layers.slime.mesh.geometry, layers.slime.mesh.material, 1), { frustumCulled: false })];
export const footprintCount = () => Object.values(layers).reduce((n, L) => n + L.prints.length, 0);

// The slime meteorites (game/meteors.js, core/meteors.js) as they come: the shadow where one will
// land, growing and darkening with a bright rim that pulses faster the nearer it is; the lump of
// glowing slime falling into it out of the sky, a light of its own and goo streaming off it; and
// the splats they leave, flat puddles drying up. In the cube's coordinates, with its offset.
// Monteur's stones (a rain of `look` 'stone') fall the same way: a rock with glowing cracks (his
// thrown stone, the prop of his model) tumbling down, dust streaming off it, a warm rim round its
// shadow.
// The shadow and the splats lie on the ground of the level it lands on, and only there: not
// hanging in the air past a ledge, nor cutting into the cliff beside it.
import * as THREE from 'three';
import { scene } from './scene.js';
import { glow, soft, emit, rand } from './particles.js';
import { trackLight, untrackLight } from './lightpool.js';
import { METEOR, fallAt, warnAt } from '../core/meteors.js';
import { stillGroundAt } from '../physics/collide.js';
import { floorY, runY } from '../core/surfaces.js';
import { monteurModel } from './monteurmodel.js';

// The ground round (x, y, z) out to r, on its level only: a grid of small quads along the cells'
// edges, each lying on its own ground (a ramp's slope), those over a drop or under a higher floor
// left out. Positions round (x, y, z); uv 0..1 across the square 2r wide, turned by `turn`.
// userData.spots: the middles of the quads near the middle (where a splat's bubbles rise).
const GRID = 8, LEVEL = 0.3;   // quads along a cell; how far off its level the ground may be
const heightOn = (s, cx, cz, x, z) => s.cs ? floorY(s, x - cx, z - cz) : s.run ? runY(s, x - cx, z - cz) : null;
const QUAD = [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]];   // (counter-clockwise from above)
function groundPatch(x, y, z, r, turn = 0) {
  const pos = [], uv = [], spots = [], c = Math.cos(turn), sn = Math.sin(turn), n = 1 / GRID;
  for (let i = Math.floor((x - r) * GRID); i < Math.ceil((x + r) * GRID); i++) for (let j = Math.floor((z - r) * GRID); j < Math.ceil((z + r) * GRID); j++) {
    const ax = i * n, az = j * n, mx = ax + n / 2, mz = az + n / 2;
    if (Math.hypot(Math.max(0, Math.abs(mx - x) - n / 2), Math.max(0, Math.abs(mz - z) - n / 2)) > r) continue;
    const g = stillGroundAt(mx, mz, y + LEVEL, 0);
    if (!g.s || g.h < y - LEVEL) continue;
    const cx = Math.floor(mx), cz = Math.floor(mz);
    for (const [qx, qz] of QUAD) {
      const px = ax + qx * n, pz = az + qz * n, dx = px - x, dz = pz - z;
      pos.push(dx, (heightOn(g.s, cx, cz, px, pz) ?? g.h) - y, dz);
      uv.push(0.5 + (dx * c - dz * sn) / (2 * r), 0.5 + (dx * sn + dz * c) / (2 * r));
    }
    if (Math.hypot(mx - x, mz - z) < r * 0.5) spots.push([mx - x, g.h - y, mz - z]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  geo.userData.spots = spots;
  return geo;
}
const plain = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);   // (to compile the shaders on)
// what lies on a patch, drawn white on clear (tinted by the material): `draw(g, h)`, h half the size
function painted(draw, size = 128) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.fillStyle = g.strokeStyle = '#fff';
  draw(g, size / 2);
  return new THREE.CanvasTexture(cv);
}
// a copy of one to scale on its own (scaled(t, k): k times its size, round the middle)
const own = t => { const c = t.clone(); c.center.set(0.5, 0.5); c.needsUpdate = true; return c; };
const scaled = (t, k) => t.repeat.setScalar(1 / Math.max(0.01, k));
const DISC = painted((g, h) => { g.beginPath(); g.arc(h, h, h * 0.97, 0, Math.PI * 2); g.fill(); });
const RIM = painted((g, h) => { g.lineWidth = h * 0.1; g.beginPath(); g.arc(h, h, h * 0.92, 0, Math.PI * 2); g.stroke(); }, 256);
const lump = new THREE.IcosahedronGeometry(0.32, 1);
const flat = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
const GOO = ['#d8ff9a', '#b8ff5a', '#8ae048'];
const lumpMaterial = new THREE.MeshStandardMaterial({ color: '#4e8a2a', emissive: '#9aff4a', emissiveIntensity: 1.4, roughness: 0.3 });
// how each look comes down: the shadow's and the rim's colour, the light, what streams off it
const LOOKS = {
  slime: { shadow: '#0e2a08', rim: '#b8ff5a', light: '#9aff5a', glow: 2.5, trail: GOO, rate: 70, particle: glow },
  stone: { shadow: '#1a1410', rim: '#ffb347', light: '#ffb347', glow: 1.2, trail: ['#e0dacd', '#b8b0a0', '#8d877c'], rate: 40, particle: soft, scale: 2.2 },
};
// the falling thing: a lump of slime, or a stone (Monteur's: a copy of his thrown stone)
function rockOf(look) {
  const prop = look === 'stone' && monteurModel.props?.MonteurStone;
  if (!prop) return new THREE.Mesh(lump, lumpMaterial);
  const g = new THREE.Group(), m = prop.clone();
  m.position.set(0, 0, 0); m.scale.setScalar(LOOKS.stone.scale);
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.sharedGeo = true; } });
  g.add(m);
  return g;
}

function makeView(at, look = 'slime') {
  const L = LOOKS[look] ?? LOOKS.slime;
  const group = new THREE.Group(), ground = at ? groundPatch(at.x, at.y, at.z, METEOR.radius) : plain;
  const shadow = new THREE.Mesh(ground, new THREE.MeshBasicMaterial({ color: L.shadow, map: own(DISC), opacity: 0, ...flat }));
  const ring = new THREE.Mesh(ground, new THREE.MeshBasicMaterial({ color: L.rim, map: own(RIM), opacity: 0, ...flat, blending: THREE.AdditiveBlending }));
  const rock = rockOf(look);
  rock.visible = false;
  const light = new THREE.PointLight(L.light, 0, 5, 2);
  group.add(shadow, ring, rock);
  scene.add(group); trackLight(light, rock, group, 2);
  return { group, shadow, ring, rock, light, look: L };
}
// list: the meteorites showing ({ m, at, landed, view }), at the world's play time `clock`
export function drawMeteors(list, clock, dt, off = { x: 0, y: 0, z: 0 }) {
  for (const v of list) {
    if (!v.at) continue;
    const w = v.view || (v.view = makeView(v.at, v.look)), { m, at } = v, u = warnAt(m, clock), f = fallAt(m, clock), L = w.look;
    w.group.position.set(at.x + off.x, at.y + off.y + 0.02, at.z + off.z);
    scaled(w.shadow.material.map, 0.35 + 0.65 * u); scaled(w.ring.material.map, 0.35 + 0.65 * u);
    w.shadow.material.opacity = v.landed ? 0 : 0.15 + 0.4 * u;
    w.ring.material.opacity = v.landed ? 0 : (0.35 + 0.35 * Math.sin(clock * (6 + 20 * u))) * u;
    w.rock.visible = f > 0 && !v.landed;
    w.light.intensity = w.rock.visible ? L.glow : 0;
    if (!w.rock.visible) continue;
    const h = METEOR.sky * (1 - f) * (1 - f);   // (falling faster and faster)
    w.rock.position.set(0, h + 0.3, 0);
    w.rock.rotation.set(clock * 3, clock * 2.2, 0);
    if (L === LOOKS.slime) w.rock.scale.setScalar(1 + 0.1 * Math.sin(clock * 30));
    for (let i = Math.floor(L.rate * dt + Math.random()); i > 0; i--)
      emit(L.particle, at.x + off.x + rand(-0.2, 0.2), at.y + off.y + h + rand(0.2, 0.6), at.z + off.z + rand(-0.2, 0.2),
        { v: [rand(-0.3, 0.3), rand(1, 3), rand(-0.3, 0.3)], life: rand(0.25, 0.5), size: rand(0.1, 0.2), color: L.trail[i % 3], drag: 1.5 });
  }
}
export function removeMeteorView(v) {
  const w = v.view;
  if (!w) return;
  scene.remove(w.group); untrackLight(w.light);
  for (const o of [w.shadow, w.ring]) { o.material.map.dispose(); o.material.dispose(); }
  if (w.shadow.geometry !== plain) w.shadow.geometry.dispose();
  v.view = null;
}
export function clearMeteorViews(list) { list.forEach(removeMeteorView); splatViews.forEach(dropSplat); splatViews.clear(); }

// the splats: { x, y, z, t } (game/meteors.js)
const splatViews = new Map();
// (lobed blobs: out to 1.32 times the splat's radius, on a patch 1.35 times it)
const SPLAT = METEOR.splat.radius * 1.35;
const splatShapes = Array.from({ length: 3 }, (_, s) => painted((g, h) => {
  g.beginPath();
  for (let i = 0; i < 18; i++) {
    const a = Math.PI * 2 * i / 18, k = (1 + 0.2 * Math.sin(3 * a + s * 1.9) + 0.12 * Math.sin(7 * a + s)) / 1.35;
    g.lineTo(h + Math.cos(a) * k * h, h + Math.sin(a) * k * h);
  }
  g.closePath(); g.fill();
}));
const splatMaterial = shape => new THREE.MeshStandardMaterial({ color: '#6cc23a', emissive: '#2e6a14', map: own(shape),
  roughness: 0.12, opacity: 0.75, ...flat });
function dropSplat(mesh) { scene.remove(mesh); mesh.material.map.dispose(); mesh.material.dispose(); mesh.geometry.dispose(); }
export function drawSplats(list, dt, off = { x: 0, y: 0, z: 0 }) {
  for (const [s, mesh] of splatViews) if (!list.includes(s)) { dropSplat(mesh); splatViews.delete(s); }
  for (const s of list) {
    let mesh = splatViews.get(s);
    if (!mesh) {
      mesh = new THREE.Mesh(groundPatch(s.x, s.y, s.z, SPLAT, Math.random() * Math.PI * 2), splatMaterial(splatShapes[splatViews.size % 3]));
      mesh.renderOrder = 1;
      scene.add(mesh); splatViews.set(s, mesh);
    }
    const left = METEOR.splat.time - s.t, k = Math.min(1, left / (METEOR.splat.time / 3));
    mesh.position.set(s.x + off.x, s.y + off.y + 0.015, s.z + off.z);
    scaled(mesh.material.map, 0.6 + 0.4 * Math.min(1, s.t * 6));
    mesh.material.opacity = 0.75 * k;
    const spots = mesh.geometry.userData.spots;
    if (spots.length && Math.random() < dt * 2 * k) {   // a bubble now and then
      const [bx, by, bz] = spots[Math.floor(Math.random() * spots.length)], j = 0.5 / GRID;
      emit(glow, s.x + off.x + bx + rand(-j, j), s.y + off.y + by + 0.05, s.z + off.z + bz + rand(-j, j),
        { v: [0, rand(0.2, 0.5), 0], life: rand(0.3, 0.6), size: rand(0.05, 0.09), color: GOO[0], drag: 1 });
    }
  }
}
// the shaders, compiled before the first one falls (render/cubeassets.js)
let warmers = null;
export function meteorWarmup() {
  if (!warmers) {
    const v = makeView(null);
    scene.remove(v.group); untrackLight(v.light);
    v.shadow.material.opacity = v.ring.material.opacity = 0.5; v.rock.visible = true;
    const splat = new THREE.Mesh(plain, splatMaterial(splatShapes[0]));
    warmers = [v.group, splat];
  }
  return warmers;
}

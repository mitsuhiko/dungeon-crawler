// Wet trails: a species with a `trail` colour (the Wolla) leaves puddles on the floor as it
// moves, a little apart, that glisten and dry up again; dying, it leaves a big one. A fluid
// dweller (the Squirtle, physics/dwell.js) leaves them on land alone, bigger (`trailSize`), and a
// big one where it crashes down out of a leap. Each enemy
// view owns its puddles (they go with it); they lie where they were left in the world and
// follow the cube's offset like the enemy. Only looks: nothing slips on them.
import * as THREE from 'three';
import { scene } from './scene.js';
import { soft, emit, rand } from './particles.js';
import { attackOf } from '../core/enemies.js';
import { fluidAround } from '../physics/dwell.js';

const EVERY = 0.3;   // cells moved between puddles
const LIFE = 5;      // s a puddle lasts (the last of it fading)
const MOST = 40;     // puddles per enemy at most
const OPACITY = 0.55;

// a few blob outlines, flat on the floor (radius about 1)
const SHAPES = Array.from({ length: 4 }, (_, s) => {
  const pts = [];
  for (let i = 0; i < 20; i++) {
    const a = Math.PI * 2 * i / 20, r = 1 + 0.16 * Math.sin(3 * a + s * 1.7) + 0.09 * Math.sin(5 * a + s * 2.3);
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return new THREE.ShapeGeometry(new THREE.Shape(pts)).rotateX(-Math.PI / 2);
});

function puddle(t, x, y, z, size, life) {
  const material = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.12, metalness: 0, transparent: true, opacity: 0,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(SHAPES[Math.floor(Math.random() * SHAPES.length)], material);
  mesh.rotation.y = Math.random() * Math.PI * 2;
  mesh.scale.set(size * rand(0.8, 1.2), 1, size * rand(0.8, 1.2));
  mesh.renderOrder = 1;
  scene.add(mesh);
  t.list.push({ mesh, x, y, z, age: 0, life });
  if (t.list.length > MOST) drop(t.list.shift());
}
function drop(p) { scene.remove(p.mesh); p.mesh.material.dispose(); }

// can a puddle lie where e is: on a flat floor (not a stair or a ramp)
const flat = e => !e.f?.kind;

// the trail of enemy e (its view v): new puddles behind it as it moves, and the old ones drying.
// Their colour: its kind's `trail`, or the view's own (`trailColor`: a Squirtle's, the fluid it
// lives in, render/squirtleview.js).
export function wetTrail(v, e, dt, off) {
  const color = e.profile.trail && (v.trailColor ?? e.profile.trail);
  if (!color) return;
  const t = v.trail || (v.trail = { color: new THREE.Color(color), list: [], last: null, splashed: false, crashed: -1 });
  if (v.trailColor) t.color.set(v.trailColor);
  const size = (e.profile.size ?? 1) * (e.profile.trailSize ?? 1);
  // (a fluid dweller wets only the land: in its fluid there is nothing to see)
  const dry = !e.profile.dwells || !fluidAround(e.profile, e.x, e.y, e.z);
  const a = e.profile.dwells && e.mode === 'attack' ? attackOf(e) : null;
  if (a?.ride && e.t >= a.hitAt && t.crashed !== e.attacks) {   // crashing down out of a leap
    t.crashed = e.attacks;
    if (dry && flat(e)) for (let i = 0; i < 4; i++)
      puddle(t, e.x + rand(-0.35, 0.35) * size, e.y, e.z + rand(-0.35, 0.35) * size, rand(0.3, 0.5) * size, LIFE * 1.6);
  }
  if (e.mode === 'dead') {
    if (!t.splashed && flat(e) && dry) puddle(t, e.x, e.y, e.z, 0.62 * size, LIFE * 1.6);
    t.splashed = true;
  } else if (!t.last || Math.hypot(e.x - t.last.x, e.z - t.last.z) > 2) t.last = { x: e.x, z: e.z };   // (a slid cube: no smear)
  else if (Math.hypot(e.x - t.last.x, e.z - t.last.z) > EVERY && flat(e) && dry) {
    puddle(t, e.x + rand(-0.08, 0.08), e.y, e.z + rand(-0.08, 0.08), rand(0.17, 0.26) * size, LIFE);
    t.last = { x: e.x, z: e.z };
    for (let i = 0; i < 2; i++)   // dripping off its lowest wave
      emit(soft, e.x + off.x + rand(-0.3, 0.3) * size, e.y + off.y + 0.12 * size, e.z + off.z + rand(-0.3, 0.3) * size,
        { v: [rand(-0.2, 0.2), rand(-0.2, 0.3), rand(-0.2, 0.2)], life: rand(0.3, 0.5), size: rand(0.04, 0.07),
          color: '#' + t.color.getHexString(), alpha: 0.8, gravity: 6 });
  }
  t.list = t.list.filter(p => {
    p.age += dt;
    if (p.age >= p.life) { drop(p); return false; }
    p.mesh.position.set(p.x + off.x, p.y + off.y + 0.012, p.z + off.z);
    // seeps in quickly, then dries from the last third of its life on
    p.mesh.material.opacity = OPACITY * Math.min(1, p.age * 6) * Math.min(1, (p.life - p.age) / (p.life / 3));
    return true;
  });
}
export function removeTrail(v) {
  if (!v.trail) return;
  v.trail.list.forEach(drop);
  v.trail = null;
}

// Projectiles in flight: the fireball / Triangle punch / ice ball / Totnar's skull / slime ball / Foggery's eye / Slomo's slug / Monteur's stone meshes exported
// (Renew's spells and the echoes' shots: orbs of light, no model; his arrows: the game's arrow; a
// Squirtle's water ball: a drop made here, of its thrower's colour)
// beside their thrower (enemymodel.js props), turned along the flight (a `tumble`ing one end over
// end), each with a light and a particle trail.
// A thrower's kind recolours the mesh and replaces the light and trail colours.
import * as THREE from 'three';
import { scene } from './scene.js';
import { loadGLB } from './gltf.js';
import { CHAR_SCALE } from '../core/constants.js';
import { glow, emit, rand } from './particles.js';
import { trackLight, untrackLight } from './lightpool.js';
import { fireFaceModel } from './firefacemodel.js';
import { triangleModel } from './trianglemodel.js';
import { shrapsModel } from './shrapsmodel.js';
import { totnarModel } from './totnarmodel.js';
import { slugModel } from './slugmodel.js';
import { flipModel } from './flipmodel.js';
import { foggeryModel } from './foggerymodel.js';
import { slomoModel } from './slomomodel.js';
import { monteurModel } from './monteurmodel.js';
import { kindColors, recolor } from './recolor.js';
import { toLinear } from '../core/oklch.js';

const LOOKS = {
  fireball: { model: fireFaceModel, prop: () => fireFaceModel.props?.FireFaceBall, light: [0xff7424, 3.5, 3.5], trail: ['#ffd25a', '#ff8a2a', '#ff4a17'], rate: 90 },
  punch: { model: triangleModel, prop: () => triangleModel.props?.TrianglePunch, light: [0xa45cff, 2.5, 3], trail: ['#e2b8ff', '#9a55ff'], rate: 45 },
  // frost glitter falls off it rather than rising
  iceball: { model: shrapsModel, prop: () => shrapsModel.props?.ShrapsIceBall, light: [0x9fdcff, 2, 3], trail: ['#ffffff', '#c4ecff', '#7fc8ff'], rate: 50, gravity: 2.5 },
  // its eyes glow; bone dust and embers stream off it
  skull: { model: totnarModel, prop: () => totnarModel.props?.TotnarSkull, light: [0xff5a1e, 1.4, 2.5], trail: ['#efe6cf', '#ff8a3a', '#bfb49a'], rate: 30, gravity: 1.5 },
  // a Squirtle's ball of water, wobbling, dripping as it flies
  water: { drop: true, light: [0x8fdcff, 0.8, 2], trail: ['#ffffff', '#c8f0ff', '#7fcaf0'], rate: 40, gravity: 6 },
  // a Slug's ball of slime, wobbling, goo dripping off it as it flies
  slimeball: { model: slugModel, prop: () => slugModel.props?.SlugBall, light: [0x9aff5a, 0.9, 2.2], trail: ['#d8ff9a', '#8ae048', '#3e7a2a'], rate: 35, gravity: 6 },
  // Flip's ball of light, its little ring spinning, sparkles streaming off it
  ball: { model: flipModel, prop: () => flipModel.props?.FlipBall, light: [0x8fdcff, 2.2, 3], trail: ['#ffffff', '#bfeaff', '#6fcbff'], rate: 55 },
  // one of Foggery's eyes, looking where it flies, burning like a fireball, its flames trailing
  eye: { model: foggeryModel, prop: () => foggeryModel.props?.FoggeryEye, light: [0xff8a3a, 2.4, 3], trail: ['#ffd25a', '#ff8a2a', '#ff4a17'], rate: 70 },
  // one of Slomo's slug arms, thrown in an arc, head first, wriggling, goo dripping off it
  slugarm: { model: slomoModel, prop: () => slomoModel.props?.SlomoArmSlug, light: [0x9aff5a, 1, 2.4], trail: ['#d8ff9a', '#8ae048', '#3e7a2a'], rate: 30, gravity: 6 },
  // one of Monteur's stones, tumbling, its cracks glowing, dust streaming off it
  stone: { model: monteurModel, prop: () => monteurModel.props?.MonteurStone, light: [0xffb347, 1, 2.4], trail: ['#e0dacd', '#b8b0a0', '#ffb347'], rate: 30, gravity: 3 },
  // a ball of Sollmeldon's mud (game/sollmeldon.js), lobbed: a black glossy drop, not his colour
  // lightened (`color`), mud dripping off it
  mudball: { drop: true, color: '#15110d', light: [0xe8d49a, 0.25, 1.5], trail: ['#3a3129', '#5a4e43'], rate: 30, gravity: 6 },
  // a spell of Renew's staff, or an echo's shot (game/rewind.js): no model, a glowing orb in its
  // `color` (the spec's), like the player's spells (render/shots.js)
  orb: { orb: true, light: [0xbdf3ff, 2.2, 3], trail: ['#ffffff'], rate: 60 },
  // one of Mansk's balls of light (game/mansk.js): an orb as big as its spec says, hanging at his
  // horns before it shoots; where it will burst is marked on the floor (`mark`)
  hornorb: { orb: true, light: [0x8fc8ff, 2.8, 3.5], trail: ['#ffffff', '#bfe0ff'], rate: 45 },
  // an arrow of Renew's bow: the game's arrow (the player's, render/shots.js), head first, a faint trail
  arrow: { arrow: true, light: [0xfff0d0, 0.4, 1.5], trail: ['#f2ead8'], rate: 12 },
};
const ARROW = { url: 'assets/items/weapon_arrow.glb', length: 0.86 };   // nock to head, rig units
let arrowModel = null;
loadGLB(ARROW.url).then(g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.sharedGeo = true; } }); arrowModel = g.scene; })
  .catch(e => console.error('arrow model failed to load', e));
function arrowView(pr, look) {
  const group = new THREE.Group();
  if (arrowModel) {   // (its +Y, nock to head, along the flight; its head on the arrow)
    const m = arrowModel.clone();
    m.rotation.x = Math.PI / 2; m.scale.setScalar(CHAR_SCALE); m.position.z = -ARROW.length * CHAR_SCALE * 0.5;
    group.add(m);
  }
  const light = new THREE.PointLight(look.light[0], look.light[1], look.light[2], 2);
  scene.add(group); trackLight(light, group, group, 2);
  return { group, light, look, trail: look.trail, owned: [], base: look.light[1] };
}
const orbGeometry = new THREE.IcosahedronGeometry(0.09, 1), haloGeometry = new THREE.IcosahedronGeometry(0.16, 1);
function orbView(pr, look) {
  const group = new THREE.Group(), color = new THREE.Color(pr.spec.color ?? '#bdf3ff');
  const core = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').lerp(color, 0.35) });
  const halo = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  group.add(new THREE.Mesh(orbGeometry, core), new THREE.Mesh(haloGeometry, halo));
  const light = new THREE.PointLight(color, look.light[1], look.light[2], 2);
  scene.add(group); trackLight(light, group, group, 2);
  return { group, light, look, trail: [pr.spec.color ?? '#bdf3ff', ...look.trail], owned: [core, halo], base: look.light[1] };
}
// A Squirtle's water ball: a glossy drop of its thrower's colour (lighter), round in front, a tail
// behind it (-Z: back along the flight), as big as the ball is (DROP: the radius it is made at)
const DROP = 0.13;
const dropGeometry = (() => {
  const g = new THREE.SphereGeometry(DROP, 16, 12), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {   // drawn out behind into a point
    const z = pos.getZ(i);
    if (z < 0) { const k = -z / DROP; pos.setZ(i, z * (1 + 1.4 * k * k)); pos.setX(i, pos.getX(i) * (1 - 0.45 * k * k)); pos.setY(i, pos.getY(i) * (1 - 0.45 * k * k)); }
  }
  g.computeVertexNormals();
  return g;
})();
function dropView(pr, look) {
  const group = new THREE.Group(), body = pr.profile?.colors?.body;
  const color = look.color ? new THREE.Color(look.color) : new THREE.Color(body ? new THREE.Color(...toLinear(body)) : 0x5aaee8).lerp(new THREE.Color(1, 1, 1), 0.35);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.12, metalness: 0, transparent: !look.color, opacity: look.color ? 1 : 0.85 });
  const mesh = new THREE.Mesh(dropGeometry, material);
  mesh.scale.setScalar((pr.spec.radius ?? DROP) / DROP * 0.8);
  group.add(mesh);
  const light = new THREE.PointLight(look.light[0], look.light[1], look.light[2], 2);
  scene.add(group); trackLight(light, group, group, 2);
  return { group, light, look, trail: look.color ? look.trail : pr.profile?.sparks ?? look.trail, owned: [material], base: look.light[1] };
}
const ahead = new THREE.Vector3();

function makeView(pr) {
  if (LOOKS[pr.kind].orb) return orbView(pr, LOOKS[pr.kind]);
  if (LOOKS[pr.kind].arrow) return arrowView(pr, LOOKS[pr.kind]);
  if (LOOKS[pr.kind].drop) return dropView(pr, LOOKS[pr.kind]);
  const look = LOOKS[pr.kind], group = new THREE.Group(), src = look.prop();
  if (!src) look.model.load();   // (the thrower's model has it: loaded already, unless thrown by a friend's)
  const colors = kindColors(pr.profile, look.model), owned = [];
  const own = m => { const c = recolor(m.clone(), colors); owned.push(c); return c; };
  if (src) {
    const mesh = src.clone();
    if (colors) mesh.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material); });
    group.add(mesh);
  }
  const [color, intensity, distance] = look.light, light = new THREE.PointLight(pr.profile?.light ?? color, intensity, distance, 2);
  scene.add(group); trackLight(light, group, group, 2);   // a light source, not in the scene
  return { group, light, look, trail: pr.profile?.sparks ?? look.trail, owned, base: intensity };
}
export function drawProjectiles(list, dt, off = { x: 0, y: 0, z: 0 }) {
  for (const pr of list) {
    const v = pr.view || (pr.view = makeView(pr)), g = v.group;
    g.position.set(pr.x + off.x, pr.y + off.y, pr.z + off.z);
    if (pr.vx || pr.vy || pr.vz) g.lookAt(ahead.set(pr.vx, pr.vy, pr.vz).add(g.position));   // +Z along the flight
    if (pr.spec.spin) g.rotateZ(pr.t * pr.spec.spin);
    if (pr.spec.tumble) g.rotateX(pr.t * pr.spec.tumble);
    if (pr.kind === 'fireball') g.scale.setScalar(1 + 0.08 * Math.sin(pr.t * 40));
    if (pr.kind === 'orb') g.scale.setScalar(1 + 0.12 * Math.sin(pr.t * 37));
    if (pr.kind === 'hornorb') {
      g.scale.setScalar(pr.spec.radius / 0.13 * Math.min(1, 0.3 + pr.t * 1.4) * (1 + 0.1 * Math.sin(pr.t * 23)));
      markBurst(v, pr, off);
    }
    if (pr.kind === 'slugarm') g.scale.set(1 + 0.12 * Math.sin(pr.t * 23), 1, 1 - 0.1 * Math.sin(pr.t * 23));
    if (pr.kind === 'mudball') g.scale.set(1 + 0.15 * Math.sin(pr.t * 19), 1 - 0.12 * Math.sin(pr.t * 19), 1 + 0.2 * Math.sin(pr.t * 11));
    if (pr.kind === 'water') g.scale.set(1 + 0.12 * Math.sin(pr.t * 31), 1 - 0.1 * Math.sin(pr.t * 31), 1 + 0.15 * Math.sin(pr.t * 17));
    v.light.intensity = v.base * (0.8 + 0.2 * Math.sin(pr.t * 31) * Math.sin(pr.t * 13));
    const colors = v.trail, n = Math.floor(v.look.rate * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const r = pr.spec.radius * 0.6;
      emit(glow, g.position.x + rand(-r, r), g.position.y + rand(-r, r), g.position.z + rand(-r, r), {
        v: [-pr.vx * 0.12 + rand(-0.3, 0.3), rand(0.2, 0.9), -pr.vz * 0.12 + rand(-0.3, 0.3)], life: rand(0.2, 0.4),
        size: rand(0.08, 0.15), color: colors[i % colors.length], drag: 2, gravity: v.look.gravity ?? -1 });
    }
  }
}
// where a ball will burst: a ring on the floor as wide as its burst, closing in as it comes
const ringGeometry = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
function markBurst(v, pr, off) {
  if (!pr.mark) return;
  if (!v.mark) {
    v.mark = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: pr.spec.color ?? '#8fc8ff', transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    v.mark.renderOrder = 2;
    scene.add(v.mark);
    v.owned.push(v.mark.material);
  }
  const k = 0.5 + 0.5 * Math.sin(pr.t * 18);
  v.mark.position.set(pr.mark.x + off.x, pr.mark.y + 0.04 + off.y, pr.mark.z + off.z);
  v.mark.scale.setScalar(pr.spec.blast * (0.9 + 0.1 * k));
  v.mark.material.opacity = 0.45 + 0.35 * k;
}
export function removeProjectileViews(list) {
  for (const pr of list) if (pr.view) {
    if (pr.view.mark) scene.remove(pr.view.mark);
    scene.remove(pr.view.group); untrackLight(pr.view.light);
    pr.view.owned.forEach(m => m.dispose()); pr.view = null;
  }
}

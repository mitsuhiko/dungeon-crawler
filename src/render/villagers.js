// The villagers at their trades in the clearings (world/town.js VILLAGERS): human figures like
// the player (render/figure.js), their clay tinted, dressed in what they wear and hold. They
// stand where the plan puts them (each one a collider there), breathe, shift their weight and
// look about; when the player comes near they turn their body towards them, within reach of where
// they stand facing, and look at them (render/ik.js: up or down too, the eyes on the hero's
// face). A crystal ball floats over its owner's hand, a glowing
// thing lights its surroundings a little.
import * as THREE from 'three';
import { clamp } from '../core/util.js';
import { ITEMS, WEARABLES } from '../core/items.js';
import { VILLAGERS } from '../world/town.js';
import { player } from '../game/state.js';
import { rig, rigReady, createFigure, dress, poseFigure, animateWorn, loadThing } from './figure.js';
import { character } from './character.js';
import { makeRig, poseRig } from './ik.js';
import { FIGURE_RIG } from './rigs.js';

const NOTICE = 3.2;   // cells: how close the player comes before they look
const BODY = 1.1;     // radians a villager turns away from where they face, at most

// everything the villagers and the people out in the world (core/npcs.js) may wear, loaded
// (game/flow.js waits for it before the first cube)
export const villagersReady = rigReady.then(() =>
  Promise.all([...new Set([...VILLAGERS.flatMap(v => v.outfit), ...WEARABLES.map(w => w.id)])].map(loadThing)));
villagersReady.catch(e => console.error('villagers failed to load', e));

const angleTo = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// the villagers of a map (m.villagers, from the clearing plan) into a cube's group; their views.
// lights: what glows they wear lights its surroundings (not as stand-ins in the surroundings,
// game/standins.js: a light in the scene would recompile every lit shader, render/lightpool.js)
export function buildVillagers(list, group, { lights = true } = {}) {
  if (!rig.ready || !list?.length) return [];
  return list.map((v, i) => {
    const f = createFigure(v.tint);
    dress(f, v.outfit);
    f.group.position.set(v.x, v.y, v.z);
    f.group.rotation.y = v.yaw;
    f.group.userData.villager = v.id ?? v.name;
    for (const w of Object.values(f.worn)) {
      const glow = ITEMS[w.id].glow;
      // a point light: a moving light source of the cube (render/lightpool.js)
      if (glow && lights) { const l = new THREE.PointLight(glow, .9, 1.8, 2); w.object.add(l); }
    }
    group.add(f.group);
    return { f, v, yaw: v.yaw, head: 0, phase: i * 1.7 + v.x, rig: makeRig(f.model, FIGURE_RIG) };
  });
}

// every frame (render/world.js animateWorld, game/standins.js); at: where their cube's origin is
// in the scene (the hero is in the scene's coordinates)
const face = new THREE.Vector3(), ORIGIN = new THREE.Vector3();
export function tickVillagers(views, dt, time, at = ORIGIN) {
  for (const view of views) {
    const { f, v } = view, t = time + view.phase;
    poseFigure(f);
    const dx = player.x - v.x - at.x, dz = player.z - v.z - at.z, sees = Math.hypot(dx, dz) < NOTICE && Math.abs(player.y - v.y - at.y) < 1.5;
    let body = 0, head = sees ? 0 : .3 * Math.sin(t * .31) * Math.sin(t * .17);   // looking about now and then
    if (sees) body = clamp(wrap(Math.atan2(dx, dz) - v.yaw), -BODY, BODY) * .7;
    view.yaw = angleTo(view.yaw, v.yaw + body, Math.min(1, dt * 2.5));
    view.head += (head - view.head) * Math.min(1, dt * 5);
    f.group.rotation.y = view.yaw;
    f.bones.head.rotateY(view.head);
    f.bones.spine.rotateX(Math.sin(t * 2.2) * .025);    // breathing
    f.bones.spine.rotateZ(Math.sin(t * .6) * .03);      // shifting their weight
    if (sees && character.ready) character.bones.head.getWorldPosition(face);
    poseRig(view.rig, dt, { look: sees && character.ready ? face : null });
    animateWorn(f, time, view.phase);
  }
}

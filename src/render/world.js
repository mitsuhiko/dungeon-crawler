// Builds (and animates) all meshes for one generated map.
import * as THREE from 'three';
import { scene } from './scene.js';
import { waterUniforms } from './wet.js';
import { FLUID_LOOK, fluidGlow, tickTides, WIND } from './materials.js';
import { partMeshes } from './partmeshes.js';
import { bakeCells } from './watercells.js';
import { buildCubeParts } from './cubegeo.js';
import { buildFalls, lavaLights, tickFalls } from './falls.js';
import { addGhosts } from './ghosts.js';
import { buildMarkers, townPortalFx } from './markers.js';
import { adoptLights, releaseLights, trackLight, untrackLight } from './lightpool.js';
import { makeFadable, adoptFade } from './fade.js';
import { makeGlass, setGlassFaces } from './glass.js';
import { buildProps, propSetLoaded } from './props.js';
import { openedChest, tickChests } from './chests.js';
import { placeProps, propSetsOf } from './propplace.js';
import { buildVillagers, tickVillagers } from './villagers.js';
import { indexBlockers } from '../core/blockers.js';
import { NPC_R, NPC_H } from '../core/npcs.js';
import { themeOf } from '../themes/depth.js';
import { ownShadowDepth } from './skinned.js';
import { buildTrialView, tickTrialView } from './trials.js';
import { flipPivot, tickFlipView } from './flipview.js';
import { buildMoverView, tickMoverView } from './movers.js';
import { newBake, disposeBake, keepFixedOutOfSun, bakeMaterials } from './bake.js';

export function disposeWorld(world) {
  if (!world) return;
  scene.remove(world.group);
  releaseLights(world.group);
  disposeBake(world.bake);
  world.group.traverse(o => { if (!o.userData.sharedGeo) o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach(m => m.userData.keep || m.dispose()); });
}

// geo: the cube's parts (from the worker, cubegeo.js buildCubeParts); built here if missing; townPad: the end
// of the open town portal standing in this cube (core/townportal.js townPadIn); opened: the ids
// of the reward sites whose chests are open (run.chests)
export function buildWorld(m, showPath, seen, geo = buildCubeParts(m), open = [], locked = !!m.guardian, townPad = null, opened = null) {
  const group = new THREE.Group();
  // Flip's box turns about its middle: its meshes and markers hang in a pivot (render/flipview.js)
  const flip = m.flip ? flipPivot(group, m) : null, host = flip ? flip.inner : group;
  // its fixed lights and their baked shadows (render/bake.js: baked once it is shown)
  const bake = newBake(geo, group, !!flip, m);
  // what its fluids meet (render/wet.js)
  const water = waterUniforms(m);
  // (Flip's box draws its sides itself, render/flipview.js: the cube's parts are its proxy's)
  const fluidMeshes = flip ? [] : partMeshes(geo, host, m.interior ? ['stone'] : [], water, bake);
  const { splashes, lights, crowns } = buildFalls(m, group);
  lavaLights(m, group, lights);
  const markers = buildMarkers(m, host, showPath, seen, open, locked);
  // decoration (also sets the colliders of blocking props on the map); missingSets: the prop
  // sets not loaded yet, whose props are not drawn (game/flow.js builds the cube again for them)
  // (Flip's box: its clutter is glued to its sides and turns with them, render/flipview.js)
  const placed = m.flip ? { out: [], blockers: m.staticBlockers.map(() => []) } : placeProps(m, themeOf(m)), missingSets = propSetsOf(m, themeOf(m)).filter(s => !propSetLoaded(s));
  // the people out in the world (m.npcs, game/npcs.js) are colliders where they stand, like the villagers
  const people = indexBlockers((m.npcs || []).map(n => ({ x: n.x, z: n.z, r: NPC_R, bottom: n.y, top: n.y + NPC_H, npc: n.id })));
  m.blockers = placed.blockers.map((list, i) => [...(m.staticBlockers?.[i] || []), ...list, ...people[i]]);
  buildProps(placed.out.map(q => opened?.has(q.site) ? openedChest(q) : q), group, water);
  const villagers = buildVillagers([...(m.villagers || []), ...(m.npcs || [])], group);
  addGhosts(group);
  const trialView = buildTrialView(m, group, water);   // a trial room's parts and rising fluid (render/trials.js)
  const movers = m.movers ? buildMoverView(m, group) : null;   // the platforms round Foggery's tower (render/movers.js)
  const glass = makeGlass(1, open, m.seams);   // (the town's tiles: one hull, render/glass.js)
  glass.visible = !m.interior;   // inside a house: walls, no glass box
  group.add(glass);
  adoptLights(group, bake);
  makeFadable(group);
  ownShadowDepth(group);   // the props' instanced meshes
  if (!flip) keepFixedOutOfSun(group);
  bakeMaterials(group, bake);
  scene.add(group);
  const world = { group, glass, fluidMeshes, splashes, crowns, lights, villagers, missingSets, trialView, flip, movers, bake, ...markers };
  setTownPortal(world, townPad);
  return world;
}

// Show the town portal standing at pad in a built cube (null: none), replacing one elsewhere.
export function setTownPortal(world, pad) {
  if (!world) return;
  const i = world.portalFx.findIndex(f => f.obj.userData.portal.kind === 'town'), old = world.portalFx[i];
  const at = old?.obj.userData.portal;
  if (old && pad && at.x === pad.x && at.y === pad.y && at.z === pad.z) return;
  if (old) {
    world.portalFx.splice(i, 1);
    world.group.remove(old.obj);
    untrackLight(old.light);
    old.obj.traverse(o => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
  }
  if (!pad) return;
  const fx = townPortalFx(pad);
  fx.obj.remove(fx.light);   // a light source (render/lightpool.js), not a scene light
  world.group.add(fx.obj);
  adoptFade(world.group, fx.obj);
  trackLight(fx.light, fx.obj, world.group);
  world.portalFx.push(fx);
}

// The departing cube is already built when its first side connection opens.
export function setWorldOpenFaces(world, open) {
  setGlassFaces(world.glass, open);
  for (const fx of world.portalFx) {
    const p = fx.obj.userData.portal;
    if (p.kind === 'side' && open[p.dir]) fx.obj.visible = false;
  }
}

export function setGuardianGate(world, locked) {
  for (const fx of world?.portalFx || []) fx.setLocked?.(locked);
}

// a trial room's seals (game/trials.js): the portals on these faces sealed, the others open
export function setPortalSeals(world, dirs, immediate = false) {
  const key = dirs.join(',');
  if (!world || (world.seals === key && !immediate)) return;
  world.seals = key;
  for (const fx of world.portalFx || []) fx.setLocked?.(dirs.includes(fx.obj.userData.portal?.dir), immediate);
}

// per-frame animation of fluids, waterfalls, lights and the portal
export function animateWorld(world, dt, time) {
  for (const m of world.fluidMeshes) {
    const t = m.userData.fluid;
    if (FLUID_LOOK[t].motion.pulse) m.material.emissiveIntensity = fluidGlow(t, time);
  }
  WIND.value = time;
  tickTides();
  bakeCells(time);
  world.splashes.forEach((s, i) => { const k = 1 + Math.sin(time * 9 + i) * 0.08; s.scale.set(k, 1, k); });
  tickFalls(world.crowns, world.group);
  for (const l of world.lights) l.intensity = 5 + Math.sin(time * 4 + l.position.x) * 1.5;
  for (const p of world.portalFx) p.tick(time);
  tickTrialView(world, time);
  tickFlipView(world, time);
  tickMoverView(world.movers, time);
  tickChests(dt);
  tickVillagers(world.villagers, dt, time);
}

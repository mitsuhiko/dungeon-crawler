// The active cube's meshes, one per part of its geometry (render/parts.js), all clipped by the
// cutaway around the player; solids draw their insides as section caps. The proxies draw the
// same parts with the same looks, batched (render/neighbors.js).
import * as THREE from 'three';
import { LAVA } from '../core/constants.js';
import { PARTS } from './parts.js';
import { partMaterial, swayMaterial, fluidLook } from './materials.js';
import { cutMaterial, capTwin } from './section.js';
import { wetMaterial } from './wet.js';
import { underwaterMaterial } from './underwater.js';
import { bakedSurface } from './bake.js';

// one part's arrays as geometry, in units of the cube's `scale` (the mesh or instance scales it);
// lm: with its place in the lightmap (the active cube's lit solids, render/bake.js)
export function partGeometry(p, lm = false) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p.pos, 4));
  g.setAttribute('normal', new THREE.BufferAttribute(p.nor, 4, true));
  if (p.col) g.setAttribute('color', new THREE.BufferAttribute(p.col, 4, true));
  if (p.uv) g.setAttribute('uv', new THREE.BufferAttribute(p.uv, 2));
  if (p.pal) g.setAttribute('pal', new THREE.BufferAttribute(p.pal, 4));   // (fluids: their palettes, render/fluidpal.js)
  if (p.shore) g.setAttribute('shore', new THREE.BufferAttribute(p.shore, 4));   // (fluids: the ground under them, render/shore.js)
  if (lm && p.lm) g.setAttribute('lm', new THREE.BufferAttribute(p.lm, 2, true));
  g.setIndex(new THREE.BufferAttribute(p.index, 1));
  return g;
}

// How each kind of part sits among the transparent things: fluid surfaces, then falls over them
// (the proxies draw theirs first, render/neighbors.js).
export const PART_ORDER = { solid: 0, fluid: 2, fall: 3 };

// geo: the cube's parts (cubegeo.js buildCubeParts); returns the fluid surface meshes (animated
// every frame); shadowless: the solids ('terrain' | 'stone' | 'wood') that cast no shadow
// (inside houses the walls, which get cut away); water: the cube's (render/wet.js waterUniforms:
// what its fluids meet, the structures wet where they have just been); bake: the cube's (render/bake.js:
// the lit solids show their baked shadows)
export function partMeshes(geo, group, shadowless = [], water = null, bake = null) {
  const fluidMeshes = [];
  for (const part of PARTS) {
    const arrays = geo.parts[part.name];
    if (!arrays || part.proxy) continue;   // (the surroundings' own: render/parts.js)
    const lit = part.lit && arrays.lm && bake;
    // (after the cut: it sets the shader edit afresh)
    const cut = (m => lit ? bakedSurface(m, bake) : m)(cutMaterial(partMaterial(part, 'full'), part.cap || false));
    // (the terrain is wet by bands in the fluids' meshes, render/floors.js; what lies under the
    // water wavers, lit by its caustics: render/underwater.js)
    const wet = m => water && part.name !== 'terrain' ? wetMaterial(m, water) : m, under = m => water ? underwaterMaterial(m, water) : m;
    const material = part.kind === 'solid' ? under(wet(cut)) : fluidLook(cut, part, water);
    const sway = m => part.sway ? swayMaterial(m, geo.scale) : m;
    const mesh = new THREE.Mesh(partGeometry(arrays, lit), sway(material));
    mesh.scale.setScalar(geo.scale);
    mesh.renderOrder = PART_ORDER[part.kind];
    mesh.userData.part = part.name;   // (Flip's box hides its floor upside down, render/flipview.js)
    if (part.cap) { const twin = capTwin(mesh, part.cap, sway); Object.assign(twin.userData, { part: part.name, cap: true }); group.add(twin); }
    if (part.kind === 'solid') { mesh.castShadow = !shadowless.includes(part.name); mesh.receiveShadow = true; }
    if (part.kind === 'fluid') {
      mesh.receiveShadow = part.fluid !== LAVA;
      mesh.userData.fluid = part.fluid;
      fluidMeshes.push(mesh);
    }
    group.add(mesh);
  }
  return fluidMeshes;
}

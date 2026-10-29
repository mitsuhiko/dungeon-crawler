// Colours used by the world meshes.
import * as THREE from '../../vendor/three/three.core.js';   // plain path, no renderer: also loads in the world worker
import { WATER, LAVA, MUD } from '../core/constants.js';
import { buildOf, ICE as ICE_DEFAULT, VINE as VINE_DEFAULT } from '../themes/builds.js';
import { TOWN } from '../themes/index.js';
import { surfacesOf } from '../themes/surfaces.js';

export const C = s => new THREE.Color(s);

// vertex colour of faces that only exist as a section cap: drawn when seen from behind (inside a
// cut solid), discarded when seen from the front (section.js)
export const CAP_ONLY = C('#000000');

export function gradient(stops, v) {
  if (v <= stops[0][0]) return new THREE.Color(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const t = (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      return new THREE.Color(stops[i - 1][1]).lerp(new THREE.Color(stops[i][1]), t);
    }
  }
  return new THREE.Color(stops[stops.length - 1][1]);
}

// terrain: tops by height (in levels), rock strata on the sides; set per depth (usePalette)
export let TOP_STOPS, SIDE_STOPS, LIP, UNDERSIDE, BEDROCK, SOFT;
// built and paved ground by role (themes/surfaces.js): SURFACE.masonry.top, ...
export let SURFACE;
export function usePalette(theme) {
  TOP_STOPS = theme.top; SIDE_STOPS = theme.side; SOFT = C(theme.soft);
  LIP = C(theme.lip); UNDERSIDE = C(theme.under); BEDROCK = theme.bed.map(C);
  SURFACE = surfaceColors(theme);
  useBuild(buildOf(theme));
}
// a theme's surfaces as colours (shared: clone before changing one), for whoever draws a cube
// without setting the palette (render/flipgeo.js, render/movers.js)
const surfaceCache = new WeakMap();
export function surfaceColors(theme) {
  if (!surfaceCache.has(theme)) surfaceCache.set(theme, Object.fromEntries(Object.entries(surfacesOf(theme)).map(([k, r]) =>
    [k, { top: C(r.top), alt: C(r.alt), side: r.side.map(C), under: C(r.under) }])));
  return surfaceCache.get(theme);
}
export const fluidBed = t => C(t === WATER ? '#7d6f52' : t === LAVA ? '#2b1d1a' : t === MUD ? '#2e261f' : '#3e4a2a');
export const fluidBank = t => C(t === WATER ? '#c9b98a' : t === LAVA ? '#3a2a22' : t === MUD ? '#5e4c3a' : '#a4a64a');

// structures: shades of the theme's stone, wood, rope, iron, ice and vines (themes/builds.js);
// bark is the wood's darker outside, leaves the vines' lighter green
export let STONE, STONE2, CHEEK, CAP, SOFFIT, PIER, WOOD, WOOD2, BEAM, ROPE, POST, RAIL, IRON, IRON2;
export let BARK, BARK2, ICE, ICE2, ICE3, VINE, VINE2, LEAF, LEAF2;
function useBuild(b) {
  const s = k => C(b.stone).multiplyScalar(k), w = k => C(b.wood).multiplyScalar(k), ice = k => C(b.ice || ICE_DEFAULT).multiplyScalar(k);
  [STONE, STONE2, CHEEK, CAP, SOFFIT, PIER] = [1, 0.92, 0.69, 0.8, 0.54, 0.73].map(s);
  [WOOD, WOOD2, BEAM, POST, RAIL] = [1, 0.88, 0.58, 0.69, 0.87].map(w);
  [BARK, BARK2] = [0.52, 0.44].map(w);
  ROPE = C(b.rope); IRON = C(b.iron); IRON2 = C(b.iron).multiplyScalar(0.7);
  const vine = C(b.vine || VINE_DEFAULT);
  VINE = vine.clone(); VINE2 = vine.clone().multiplyScalar(0.72);
  LEAF = vine.clone().multiplyScalar(1.3); LEAF2 = vine.clone().multiplyScalar(1.1).lerp(C('#c8d060'), 0.15);
  ICE = ice(1); ICE2 = ice(0.86).lerp(C('#6a9cc4'), 0.3); ICE3 = ice(0.72).lerp(C('#4a7ca8'), 0.45);   // deeper is bluer
}
// prayer flags: blue, white, red, green and yellow, a little faded
export const FLAGS = ['#4a72b0', '#ece8dc', '#c4523e', '#4a8a56', '#e0bc48'].map(C);

usePalette(TOWN);   // until a cube says otherwise

// The surroundings' lights left on (docs/lighting.md, "The surroundings"): the lanterns, fires and
// glowing things of the cubes shown near (their landmarks' and set pieces', all of the town's:
// render/neighbors.js shownFar) and the town's street lamps and windows at night, as in the cube
// played in (render/night.js), shine on the surroundings and the people there (render/farlook.js):
// without shadows, dimmed as their glow, all of them (FAR_MAX at most), from one table and a grid
// over the world round the hero (render/lighthook.js FAR: a point walks only its cell's lights).
// Cheap: no bake, no light in the scene, nothing compiled again as they come and go.
// In the town (one place, no glass between its tiles) they cross the seams: the tiles round the
// one played in light it up to the seam and over it (at their full brightness: as they will once
// it is theirs), and its own lights shine out onto the tiles round it; its own are baked in it
// (render/bake.js), and until they are they shine from here instead, fading over to the bake.
// Elsewhere the glass stands between: they do not reach into the cube played in, nor its lights out.
import * as THREE from 'three';
import { BAKE, FAR_MAX, FAR_CELL, FAR_CELLS, FAR_K, farWalk } from './lighthook.js';
import { nightGlow, litAt } from './night.js';
import { PROXY } from './materials.js';

const FAR = { uFarT: BAKE.uFarT, uFarC: BAKE.uFarC, uFarO: BAKE.uFarO, uFarN: BAKE.uFarN };

// after three's lights (and the game's, render/lighthook.js): the grid's
const LOOP = `
#if defined( RE_Direct )
  {
    vec3 farW = ((vec4(-vViewPosition, 1.0) - viewMatrix[3]) * viewMatrix).xyz;
    ${farWalk('farW', true)}
  }
#endif
`;

// a lit material (Lambert or standard) of the surroundings takes the table's lights
export function farLit(mat) {
  if (mat.userData.farLit) return mat;
  mat.userData.farLit = true;
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    // (before the light maps, right after the lights: render/lighthook.js has put its own in place
    // of three's lights_fragment_begin by now, the material's own edits having run first)
    if (!sh.fragmentShader.includes('#include <lights_fragment_maps>')) return;
    Object.assign(sh.uniforms, FAR);
    sh.fragmentShader = 'uniform highp sampler2D uFarT, uFarC;\nuniform int uFarN;\nuniform vec2 uFarO;\n' + sh.fragmentShader
      .replace('#include <lights_fragment_maps>', LOOP + '#include <lights_fragment_maps>');
  };
  mat.customProgramCacheKey = () => key + '|farlit';
  return mat;
}

// how bright a light of a cube of `dim` is on the surroundings (their glow, PROXY.glow at the whole dim)
const onProxies = dim => 1 + (PROXY.glow - 1) * dim;
// how far past the nearest FAR_MAX a light taken fades out (units; only with more than that)
const FADE = 3;

// Every frame: the lights of the cubes shown near, [{ at (where the cube's origin is in the scene),
// fade (how much of it shows), dim (its proxy's), lights (props.js propLights, in the cube), into
// (they shine into the cube played in: the town's tiles round it) }], and in the town the cube
// played in's own ({ at, fade, dim (as its tiles round it are), lights, unbaked (how far its bake
// is not on yet) }, or null): as bright as they are now (lit at night or not), into the table, the
// nearest FAR_MAX to `focus` (the hero), and the grid round it laid out again when they change.
const shown = [];
let pool = [];
const take = () => (pool.pop() ?? {});
const grid = { ox: NaN, oz: NaN, sig: NaN };
export function setFarLights(cubes, focus, here = null) {
  pool.push(...shown);
  shown.length = 0;
  const n = nightGlow.value;
  const add = (c, l, onCube, own) => {
    const on = l.night === null ? 1 : litAt(n, l.night), k = on * l.gain * c.fade;
    if (k <= 0 || (onCube <= 0 && !own)) return;
    const s = take(), x = l.x + c.at.x, z = l.z + c.at.z;
    s.x = x; s.y = l.y + c.at.y; s.z = z; s.l = l; s.k = k; s.prox = onProxies(c.dim);
    s.cube = onCube; s.d = (x - focus.x) ** 2 + (z - focus.z) ** 2;
    shown.push(s);
  };
  for (const c of cubes) if (c.fade > 0) for (const l of c.lights) add(c, l, c.into ? 1 : 0, false);
  if (here?.fade > 0) for (const l of here.lights) add(here, l, here.unbaked, true);
  let cut = Infinity;
  if (shown.length > FAR_MAX) {
    shown.sort((a, b) => a.d - b.d);
    cut = Math.sqrt(shown[FAR_MAX].d);
    pool.push(...shown.splice(FAR_MAX));
  }
  const table = BAKE.uFarT.value, L = table.image.data, count = shown.length;
  let sig = count;
  for (let i = 0; i < count; i++) {
    const s = shown[i], o = i * 12, c = colorOf(s.l.color), edge = Math.min(1, Math.max(0, (cut - Math.sqrt(s.d)) / FADE)), k = s.k * edge;
    L[o] = s.x; L[o + 1] = s.y; L[o + 2] = s.z; L[o + 3] = s.l.reach;
    L[o + 4] = c.r * k; L[o + 5] = c.g * k; L[o + 6] = c.b * k; L[o + 7] = 0;
    L[o + 8] = s.prox; L[o + 9] = s.cube; L[o + 10] = 0; L[o + 11] = 0;
    sig = (sig * 31 + Math.round(s.x * 8) * 7 + Math.round(s.z * 8) * 13 + (s.cube > 0 ? 5 : 0)) % 2147483647;
  }
  if (count || BAKE.uFarN.value) table.needsUpdate = true;
  BAKE.uFarN.value = count;
  // (the grid: round the hero, laid out again as they walk a cell on, or the lights change)
  const ox = (Math.floor(focus.x / FAR_CELL) - FAR_CELLS / 2) * FAR_CELL, oz = (Math.floor(focus.z / FAR_CELL) - FAR_CELLS / 2) * FAR_CELL;
  if (ox !== grid.ox || oz !== grid.oz || sig !== grid.sig) {
    grid.ox = ox; grid.oz = oz; grid.sig = sig;
    BAKE.uFarO.value.set(ox, oz);
    layGrid(ox, oz, count);
  }
}

// the grid's cells: each the lights reaching into it, the strongest there first (as bright as they
// get: by night or by day the same cells), FAR_K at most; the surroundings' rows, then the cube's
const cells = Array.from({ length: FAR_CELLS * FAR_CELLS * 2 }, () => []);
function layGrid(ox, oz, count) {
  for (const c of cells) c.length = 0;
  for (let i = 0; i < count; i++) {
    const s = shown[i], r = s.l.reach, w0 = s.l.gain;
    const x0 = Math.max(0, Math.floor((s.x - r - ox) / FAR_CELL)), x1 = Math.min(FAR_CELLS - 1, Math.floor((s.x + r - ox) / FAR_CELL));
    const z0 = Math.max(0, Math.floor((s.z - r - oz) / FAR_CELL)), z1 = Math.min(FAR_CELLS - 1, Math.floor((s.z + r - oz) / FAR_CELL));
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const ax = ox + cx * FAR_CELL, az = oz + cz * FAR_CELL;
      const dx = Math.max(ax - s.x, 0, s.x - ax - FAR_CELL), dz = Math.max(az - s.z, 0, s.z - az - FAR_CELL), d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      const w = w0 / Math.max(d2, 0.25) * (1 - Math.sqrt(d2) / r);
      cells[cz * FAR_CELLS + cx].push(i, w);
      if (s.cube > 0) cells[(FAR_CELLS + cz) * FAR_CELLS + cx].push(i, w);
    }
  }
  const t = BAKE.uFarC.value, D = t.image.data;
  D.fill(-1);
  const order = [];
  cells.forEach((list, k) => {
    if (!list.length) return;
    order.length = 0;
    for (let j = 0; j < list.length; j += 2) order.push(j);
    order.sort((a, b) => list[b + 1] - list[a + 1] || list[a] - list[b]);
    const row = Math.floor(k / FAR_CELLS), cx = k % FAR_CELLS, o = (row * FAR_CELLS + cx) * FAR_K;
    for (let j = 0; j < Math.min(FAR_K, order.length); j++) D[o + j] = list[order[j]];
  });
  t.needsUpdate = true;
}

const colors = new Map();
const colorOf = c => { let v = colors.get(c); if (!v) colors.set(c, v = new THREE.Color(c)); return v; };

export const farLightCount = () => BAKE.uFarN.value;   // (tests)

// Some of the surroundings' lights left on, dimmed (docs/lighting.md, "The surroundings"): the
// lanterns, fires and glowing things of the cubes shown near (their landmarks' and set pieces',
// all of the town's: render/neighbors.js shownFar) and the town's street lamps and windows at
// night, as in the cube played in (render/night.js), shine on the surroundings and the people
// there (render/farlook.js): without shadows, from one small table every proxy's shader walks (the
// nearest FAR_MAX to the hero). Cheap: no bake, no light in the scene, nothing compiled again as
// they come and go. They do not reach into the cube played in (its own lights are baked there).
import * as THREE from 'three';
import { lightTable } from './lighthook.js';
import { nightGlow, litAt } from './night.js';
import { PROXY } from './materials.js';

export const FAR_MAX = 32;
const FAR = { uFarT: { value: lightTable(FAR_MAX) }, uFarN: { value: 0 } };

// after three's lights (and the game's, render/lighthook.js): the table's
const LOOP = `
#if defined( RE_Direct )
  {
    vec3 farW = ((vec4(-vViewPosition, 1.0) - viewMatrix[3]) * viewMatrix).xyz;
    for (int i = 0; i < ${FAR_MAX}; i++) {
      if (i >= uFarN) break;
      vec4 la = texelFetch(uFarT, ivec2(0, i), 0);
      vec3 lw = la.xyz - farW;
      float d2 = dot(lw, lw);
      if (d2 >= la.w * la.w) continue;
      vec4 lb = texelFetch(uFarT, ivec2(1, i), 0);
      float d = sqrt(d2), r = d / la.w, r2 = r * r;
      directLight.direction = normalize((viewMatrix * vec4(lw, 0.0)).xyz);
      directLight.color = lb.rgb / max(d2, 0.01) * (1.0 - r2 * r2) * (1.0 - r2 * r2);
      directLight.visible = true;
      RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
    }
  }
#endif
`;

// a lit material (Lambert or standard) takes the table's lights
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
    sh.fragmentShader = 'uniform highp sampler2D uFarT;\nuniform int uFarN;\n' + sh.fragmentShader
      .replace('#include <lights_fragment_maps>', LOOP + '#include <lights_fragment_maps>');
  };
  mat.customProgramCacheKey = () => key + '|farlit';
  return mat;
}

// Every frame: the lights of the cubes shown near, [{ at (where the cube's origin is in the scene),
// fade (how much of it shows), dim (its proxy's), lights (props.js propLights, in the cube) }], the
// nearest FAR_MAX to `focus` (the hero) into the table: as bright as they are now (lit at night or
// not), dimmed as their glow (PROXY.glow at the whole dim), faded with their cube.
const shown = [];
export function setFarLights(cubes, focus) {
  shown.length = 0;
  const n = nightGlow.value;
  for (const c of cubes) {
    const k = c.fade * (1 + (PROXY.glow - 1) * c.dim);
    if (k <= 0) continue;
    for (const l of c.lights) {
      const on = l.night === null ? 1 : litAt(n, l.night);
      if (on <= 0) continue;
      const x = l.x + c.at.x, y = l.y + c.at.y, z = l.z + c.at.z;
      shown.push({ x, y, z, l, k: k * on * l.gain, d: (x - focus.x) ** 2 + (z - focus.z) ** 2 });
    }
  }
  if (shown.length > FAR_MAX) shown.sort((a, b) => a.d - b.d);
  const table = FAR.uFarT.value, L = table.image.data, count = Math.min(FAR_MAX, shown.length);
  for (let i = 0; i < count; i++) {
    const { x, y, z, l, k } = shown[i], o = i * 8, c = colorOf(l.color);
    L[o] = x; L[o + 1] = y; L[o + 2] = z; L[o + 3] = l.reach;
    L[o + 4] = c.r * k; L[o + 5] = c.g * k; L[o + 6] = c.b * k; L[o + 7] = 0;
  }
  if (count || FAR.uFarN.value) table.needsUpdate = true;
  FAR.uFarN.value = count;
}
const colors = new Map();
const colorOf = c => { let v = colors.get(c); if (!v) colors.set(c, v = new THREE.Color(c)); return v; };

export const farLightCount = () => FAR.uFarN.value;   // (tests)

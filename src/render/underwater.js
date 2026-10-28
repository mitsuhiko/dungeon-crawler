// What lies under the clear fluids (water, acid) of the cube being played: its terrain, its
// structures and its props (render/partmeshes.js, props.js). Lava hides what is in it.
//   - Seen through the surface it wavers with the waves: each vertex under the cube's own fluid
//     is pushed sideways by the slope of the waves over it (swellG, render/surface.js), the more
//     the deeper it lies under the fluid's low-water line (the lowest its surface sinks: surface.js
//     lowWaterLines), nothing at or over it. The solids are split along that line (render/
//     cubegeo.js), so what stands out of the water (a bank, a bridge's pier, a stair) bends under
//     it only, never in the air. The push depends on nothing but where a vertex is, so the corners
//     the parts share move together and nothing comes apart. A prop (not split: one model for all
//     of its kind) moves as a whole, with the bed under it, and only if it lies all under the
//     low-water line. A standing fluid (a trial's, a boss's tide, rising through the room: no line
//     to split at) pushes nothing. The shadows are cast from where things really are.
//   - The light the waves gather plays on it: bright lines, the water's own cells (watercells.js,
//     drawn once a frame for its surface anyway), where the sunlight through the surface lands
//     (slanting with the sun, refracted), softer and fainter the deeper they lie, in the fluid's
//     line colour. Looked up where the point lies before its push, so they waver with it. Under
//     a standing fluid too.
// A chained shader edit (after the cut's, the wind's and the wet one's). water: the cube's
// uniforms (render/wet.js waterUniforms: per cell its own fluid, and the standing one); top: a
// prop's (instanced) top in its model's units.
import { N, WATER, ACID } from '../core/constants.js';
import { CELLS } from './watercells.js';
import { PAL_GLSL, PAL_TEX } from './fluidpal.js';
import { FIXED_TIDE, WIND } from './materials.js';
import { WAVES_GLSL, FLUID_MOTION, BELOW } from './surface.js';

// SHIFT: how far the waves push what lies a world unit under the low-water line (per unit of
// their slope), at most DEEP deep; caustics: their size (the cells' size on the surface over
// this), how bright, how fast they fade with depth (a world unit), their edges' softness at the
// surface and deeper
const SHIFT = 0.07, DEEP = 1.2;
const CAUSTIC = { scale: 1.9, glow: 1.6, fade: 0.55, soft: 0.03, blur: 0.05 };
// (uniforms, to compare and tune them live: 0 turns either off)
export const UNDERWATER = { shift: { value: SHIFT }, glow: { value: CAUSTIC.glow } };
// where the sunlight through the surface comes from, per unit of depth (render/scene.js sun:
// from (-12, 34, 8), bent down in the water)
const SUN = [-0.257, 0.171];
// the low-water line over the rest height, per fluid (x water, y lava, z acid: surface.js surfaceRange)
const low = t => { const S = FLUID_MOTION[t]; return (S.lift - S.tide - S.ripple).toFixed(4); };
const LOWS = `vec3(${low(1)}, ${low(2)}, ${low(3)})`;

const COMMON = `
  uniform highp sampler2D uUwFixed;
  uniform vec4 uUwStand, uUwBox;
  uniform vec2 uUwStandKind;
  uniform vec3 uUwTide;
  uniform float uUwTime, uUwShift, uUwGlow;
  bool uwClear(float kind) { return abs(kind - ${WATER}.0) < 0.5 || abs(kind - ${ACID}.0) < 0.5; }
  vec4 uwCell(vec2 q) { return texelFetch(uUwFixed, clamp(ivec2(floor(q)), ivec2(0), ivec2(${N - 1})), 0); }
`;
// how far p (cube coordinates) lies under the low-water line of the cube's own clear fluids in
// the cells round q (the deepest; a corner the same in all of them: render/cubegeo.js waterCuts
// splits by the same cells); 0: over it
const PUSH_DEPTH = `
  float uwPushDepth(vec2 q, float y) {
    float d = 0.0;
    for (int k = 0; k < 4; k++) {
      vec4 fx = uwCell(q + vec2(float(k & 1), float(k >> 1)) * 0.02 - 0.01);
      if (fx.x > -1e3 && uwClear(fx.z) && y > fx.y - ${BELOW.toFixed(3)}) d = max(d, fx.x + ${LOWS}[int(fx.z + 0.5) - 1] - max(y, fx.y));
    }
    return min(d, ${DEEP.toFixed(2)});
  }
`;
// the surface of the clear fluid over p at the cell q now (the tide, not the waves; -1e4: none),
// its palette row in row
const LEVEL = `
  float uwLevel(vec2 q, float y, out float row) {
    float water = -1e4;
    row = 0.0;
    vec4 fx = uwCell(q);
    if (fx.x > -1e3 && y > fx.y - 0.01 && uwClear(fx.z)) { water = fx.x + uUwTide[int(fx.z + 0.5) - 1]; row = fx.w; }
    if (uUwStand.w > 0.5 && uwClear(uUwStandKind.x) && all(greaterThan(q, uUwBox.xy)) && all(lessThan(q, uUwBox.zw)) && uUwStand.x + uUwStand.y > water) {
      water = uUwStand.x + uUwStand.y; row = uUwStandKind.y;
    }
    return water;
  }
`;

export function underwaterMaterial(mat, water, top = null) {
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  const uniforms = { uUwFixed: water.fixed, uUwStand: water.stand, uUwBox: water.box, uUwStandKind: water.standKind,
    uUwTide: FIXED_TIDE, uUwTime: WIND, uUwShift: UNDERWATER.shift, uUwGlow: UNDERWATER.glow, uUwCells: CELLS.water.tex, uPalTex: PAL_TEX,
    uUwTop: { value: top ?? 0 } };
  const tile = (CELLS.water.tile / CELLS.water.perUnit / CAUSTIC.scale).toFixed(4);
  mat.onBeforeCompile = (sh, r) => {
    compile?.call(mat, sh, r);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'varying vec3 vUwP, vUwN;\nuniform float uUwTop;\n' + COMMON + PUSH_DEPTH + WAVES_GLSL + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        // where it is in the cube (a prop: its instance's place; a part: scaled, render/partmeshes.js)
        #ifdef USE_INSTANCING
          mat3 uwM = mat3(instanceMatrix);
          vUwP = (instanceMatrix * vec4(transformed, 1.0)).xyz;
          vUwN = uwM * objectNormal;
          // (a prop: as a whole, by where it stands, if its top is under the line)
          vec3 uwAt = instanceMatrix[3].xyz;
          float uwD = uwPushDepth(uwAt.xz, uwAt.y);
          if (uwPushDepth(uwAt.xz, uwAt.y + uUwTop * length(uwM[0])) <= 0.0) uwD = 0.0;
        #else
          mat3 uwM = mat3(length(modelMatrix[0].xyz));
          vUwP = transformed * uwM[0][0];
          vUwN = objectNormal;
          vec3 uwAt = vUwP;
          float uwD = uwPushDepth(uwAt.xz, uwAt.y);
        #endif
        if (uwD > 0.0 && uUwShift > 0.0) {
          vec2 off = swellG(uwAt.xz, uUwTime) * uUwShift * uwD;
          // (back into its own units: the matrix is a rotation and a scale)
          transformed += transpose(uwM) * vec3(off.x, 0.0, off.y) / dot(uwM[0], uwM[0]);
        }
      }`);
    const pal = sh.fragmentShader.includes('vec3 palColor(') ? '' : PAL_GLSL;
    sh.fragmentShader = 'varying vec3 vUwP, vUwN;\nuniform sampler2D uUwCells;\n' + COMMON + LEVEL + pal + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 uwLight = vec3(0.0);
      {
        // the fluid it faces (a bank's wall: the cell in front of it)
        vec3 n = normalize(vUwN);
        float row, d = uwLevel(vUwP.xz + n.xz * 0.05, vUwP.y, row) - vUwP.y;
        if (d > 0.0 && uUwGlow > 0.0) {
          // (on a wall: along it and up it, not stretched down it)
          vec2 p = (vUwP.xz + n.xz * vUwP.y + vec2(${SUN[0]}, ${SUN[1]}) * d) / ${tile};
          float c = texture2D(uUwCells, p, min(d * 1.5, 3.0)).r, w = ${CAUSTIC.soft.toFixed(3)} + ${CAUSTIC.blur.toFixed(3)} * min(d, 2.0);
          float k = smoothstep(0.5 - w, 0.5 + w, c) * smoothstep(0.0, 0.08, d) * exp(-${CAUSTIC.fade.toFixed(3)} * d) * (0.35 + 0.65 * max(n.y, 0.0));
          uwLight = diffuseColor.rgb * palColor(vec2(row), 0.0, 2) * k * uUwGlow;
        }
      }`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += uwLight;`);
  };
  mat.customProgramCacheKey = () => key + '-uw';
  return mat;
}

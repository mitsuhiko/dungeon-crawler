// What the fluids of the cube being played meet, as uniforms of its own (render/world.js
// buildWorld, its fluids' and solids' materials, its standing fluid, render/trials.js):
//   level, box: a standing fluid (a trial's, a boss's tide): its level (world units, -1e9 for
//     none) and the cells it stands over [x0, z0, x1, z1]; the cube's own fluids are not drawn
//     under it there (render/surface.js ownUnder);
//   boxes: what stands in the fluids' way (render/shore.js waterBoxes): per cell its boxes, two
//     texels each ([x0, z0, x1, z1], [y0, ya, yb, axis]): the foam goes round them;
//   fixed: per cell the cube's own fluid (its surface's rest height, its bed, its kind, its
//     palette row; none: rest -1e4), stand / standKind: the standing fluid now (its rest height,
//     its tide now, its wet line over its rest height, 1 while it stands; its kind, its palette
//     row): what the structures stand in (wetMaterial).
// The terrain's shores are wet by bands in the fluids' own meshes (render/floors.js wetWall,
// wetSlope: the proxies show them too); the structures (stairs, bridges, ladders, fences, posts)
// darken themselves where the water has just been (wetMaterial), by the same wet line.
import * as THREE from 'three';
import { N, LH, WATER, LAVA, ACID } from '../core/constants.js';
import { BOXES, waterBoxes } from './shore.js';
import { restY, FLUID_MOTION } from './surface.js';
import { PAL_TEX, PAL_GLSL } from './fluidpal.js';
import { palRow } from '../themes/fluids.js';
import { WIND, FIXED_TIDE, FIXED_WET } from './materials.js';

const texture = (w, h, data) => {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  t.needsUpdate = true;
  return t;
};

export function waterUniforms(m) {
  const boxes = new Float32Array(BOXES * 2 * N * N * 4);
  waterBoxes(m).forEach((list, c) => list.forEach((b, k) => boxes.set(b, ((c / N | 0) * BOXES * 2 * N + (c % N) * BOXES * 2 + k * 2) * 4)));
  const fixed = new Float32Array(N * N * 4);
  for (let c = 0; c < N * N; c++) {
    const f = m.cols[c].filter(g => g.fluid && !g.crust).at(-1);
    fixed.set(f ? [restY(f.surf * LH), Math.min(...f.cs), f.fluid, f.pal ?? m.fluidRows?.[f.fluid] ?? palRow(m.depth ?? 0, f.fluid, 0)] : [-1e4, 0, 0, 0], c * 4);
  }
  return {
    level: { value: -1e9 }, box: { value: new THREE.Vector4(0, 0, N, N) },
    boxes: { value: texture(BOXES * 2 * N, N, boxes) }, fixed: { value: texture(N, N, fixed) },
    stand: { value: new THREE.Vector4(0, 0, 0, 0) }, standKind: { value: new THREE.Vector2(0, 0) },
  };
}

// A structure's material (the active cube's stone, wood and flags: render/partmeshes.js) dark
// where the water has just been, between the surface of the fluid it stands in and the wet line
// (the same as the bands on the banks, materials.js cellMaterial: water darkens, acid stains it
// green, lava leaves a glowing seam where it laps at it). water: the cube's (waterUniforms).
export function wetMaterial(mat, water) {
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    compile?.call(mat, sh, r);
    Object.assign(sh.uniforms, { uWetFixed: water.fixed, uWetStand: water.stand, uWetStandKind: water.standKind, uWetBox: water.box,
      uFixedTide: FIXED_TIDE, uFixedWet: FIXED_WET, uPalTex: PAL_TEX, uCellTime: WIND });
    sh.vertexShader = 'varying vec3 vWetP, vWetN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vWetP = position * length(modelMatrix[0].xyz); vWetN = normal;`);
    sh.fragmentShader = 'varying vec3 vWetP, vWetN;\nuniform highp sampler2D uWetFixed;\nuniform vec4 uWetStand, uWetBox;\nuniform vec2 uWetStandKind;\nuniform vec3 uFixedTide, uFixedWet;\nuniform float uCellTime;\n' + PAL_GLSL
      + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 wetGlow = vec3(0.0);
      {
        // the fluid there: the cube's own in the cell it faces (a pier, a stair in it), or the standing one
        vec3 n = normalize(vWetN);
        vec2 q = vWetP.xz + n.xz * 0.05;
        vec4 fx = texelFetch(uWetFixed, clamp(ivec2(floor(q)), ivec2(0), ivec2(${N - 1})), 0);
        float water = -1e4, wet = -1e4, kind = 0.0, row = 0.0;
        if (fx.x > -1e3 && vWetP.y > fx.y) {
          int t = int(fx.z + 0.5) - 1;
          water = fx.x + uFixedTide[t]; wet = fx.x + uFixedWet[t]; kind = fx.z; row = fx.w;
        }
        if (uWetStand.w > 0.5 && all(greaterThan(q, uWetBox.xy)) && all(lessThan(q, uWetBox.zw)) && uWetStand.x + uWetStand.y > water) {
          water = uWetStand.x + uWetStand.y; wet = uWetStand.x + uWetStand.z; kind = uWetStandKind.x; row = uWetStandKind.y;
        }
        float bw = vWetP.x + vWetP.z, y = vWetP.y;
        if (kind > 0.5 && y > water - 0.003) {
          if (abs(kind - ${LAVA}.0) < 0.5) {
            // the seam: hot rock where the lava laps at it
            float edge = water + 0.03 + 0.012 * sin(bw * 9.0 + uCellTime * 1.3) + 0.006 * sin(bw * 23.0 - uCellTime * 2.1);
            if (y < edge) { vec3 hot = mix(palColor(vec2(row), 0.0, 2), palColor(vec2(row), 0.0, 0), (y - water) / max(edge - water, 1e-3)); diffuseColor.rgb = hot; wetGlow = hot; }
          } else {
            float edge = wet + 0.008 * sin(bw * 7.3) + 0.005 * sin(bw * 17.0 + 1.3);
            if (y < edge) {
              float k = clamp((y - water) / max(edge - water, 1e-3), 0.0, 1.0), a = (abs(kind - ${ACID}.0) < 0.5 ? ${FLUID_MOTION[ACID].wet.toFixed(3)} : ${FLUID_MOTION[WATER].wet.toFixed(3)}) * mix(1.0, 0.6, k);
              vec3 stain = abs(kind - ${ACID}.0) < 0.5 ? palColor(vec2(row), 0.0, 1) * 0.3 : vec3(0.02, 0.035, 0.045);
              diffuseColor.rgb = mix(diffuseColor.rgb, stain, a);
            }
          }
        }
      }`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += wetGlow;`);
  };
  mat.customProgramCacheKey = () => key + '-wet';
  return mat;
}

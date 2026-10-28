// The Squirtle's body in the look of its fluid (render/squirtleview.js): the cartoon cells of the
// game's water, lava or slime (render/watercells.js, the same patterns its pools are drawn with,
// materials.js cellMaterial) in the palette of the body of fluid it lives in (render/fluidpal.js),
// streaming over it along its flow coordinates (its UVs, blender/squirtle.py: u the way the water
// runs, up its back, over the crest and out to the lip; v round it), and finer, faster streaks
// running up it as down a fall. Its colour attribute says where its foam is (the crest, the lip,
// the jaw's tip, the foot) and the barrel of its mouth: sharpened here, wobbly, broken up by the
// cells. Water and slime are a little see-through, their lines lit by themselves; lava is molten
// rock in bands of heat with blotches of crust on it, its foam its hottest, its mouth glowing.
// Where it stands in its fluid nothing of it is drawn under the surface (the surface as its pool
// draws it, rising and falling with the tide and the waves: render/surface.js swellGLSL), and foam
// hugs it where it comes out (lava: a glowing seam): it is the fluid there. The eyes keep their
// own colours.
// A Mud squirtle (Sollmeldon's) is of his mud: the goop of it (render/goop.js), streaming up it,
// its foam the mud's lighter rim, nothing glowing.
// One program per look (water, sludge, crust, goop), a material per Squirtle (its uniforms: its
// palette row, its fluid's surface, its fade and flash, whether its eyes show).
import * as THREE from 'three';
import { WATER, MUD } from '../core/constants.js';
import { GOOP_GLSL, GOOP_RIM } from './goop.js';
import { CELLS, useCells } from './watercells.js';
import { PAL_TEX, PAL_GLSL } from './fluidpal.js';
import { FLUID_LOOK, WIND } from './materials.js';
import { FLUID_MOTION, swellGLSL } from './surface.js';

const STYLE_ID = { water: 0, sludge: 1, crust: 2, goop: 3 };
// per look: how much finer its cells are than on its pool, and how fast they run along it
// (world units a second)
const FLOW = { water: { fine: 1.15, flow: 0.5 }, sludge: { fine: 1.15, flow: 0.28 }, crust: { fine: 1.2, flow: 0.12 } };
export const PARTS = 3;

// fluid: the fluid it lives in (its look); parts: the model's parts (render/enemymodel.js), the
// one named SquirtleBody drawn as the fluid, the others in their own colours
export function squirtleMaterial(fluid, parts) {
  const L = FLUID_LOOK[fluid] ?? FLUID_LOOK[WATER], goop = fluid === MUD, style = goop ? 'goop' : L.style, C = CELLS[L.style], F = FLOW[L.style];
  const S = FLUID_MOTION[fluid] ?? FLUID_MOTION[WATER];
  const colors = Array.from({ length: PARTS }, (_, i) => parts[i]?.color.clone() ?? new THREE.Color(1, 1, 1));
  const u = {
    uCellTime: WIND, uCellTex: C.tex, uPalTex: PAL_TEX,
    uPalRow: { value: 0 }, uLevel: { value: -1e4 }, uOff: { value: new THREE.Vector3() }, uFade: { value: 1 }, uEyes: { value: 1 },
    uFlash: { value: new THREE.Color(0, 0, 0) }, uPartColor: { value: colors }, uBodyPart: { value: Math.max(0, parts.findIndex(p => p.name === 'SquirtleBody')) },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, roughness: style === 'crust' ? 0.6 : goop ? 0.18 : 0.4, metalness: 0,
    transparent: true, forceSinglePass: true });
  useCells(mat, L.style);
  const K = (C.perUnit * F.fine / C.tile).toFixed(4), flow = F.flow.toFixed(3);
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = `attribute float part;
      #ifndef USE_COLOR
      attribute vec3 color;
      #endif
      flat varying int vPart;
      varying vec2 vFlowUv;
      varying vec3 vFlow, vFluidW;
      ` + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vPart = int(part + 0.5); vFlowUv = uv; vFlow = color.rgb;')
      .replace('#include <project_vertex>', 'vFluidW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
    sh.fragmentShader = `#define FLOW_STYLE ${STYLE_ID[style]}
      flat varying int vPart;
      varying vec2 vFlowUv;
      varying vec3 vFlow, vFluidW;
      uniform float uCellTime, uPalRow, uLevel, uFade, uEyes;
      uniform vec3 uOff, uFlash, uPartColor[${PARTS}];
      uniform int uBodyPart;
      uniform sampler2D uCellTex;
      ` + PAL_GLSL + swellGLSL(S) + GOOP_GLSL + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float flowLine = 0.0, flowHeat = 0.0;
      vec2 rows = vec2(uPalRow);
      vec3 pBody = palColor(rows, 0.0, 0), pDark = palColor(rows, 0.0, 1), pLine = palColor(rows, 0.0, 2), pFoam = palColor(rows, 0.0, 3);
      vec3 pEm = palColor(rows, 0.0, 4);
      vec4 pNum = palParams(rows, 0.0);
      float tm = uCellTime;
      // under its fluid's surface it is its fluid: nothing drawn
      float above = 1e4;
      if (uLevel > -1e3) {
        above = vFluidW.y - (uLevel + swellY(vFluidW.xz - uOff.xz, tm));
        if (above < 0.0) discard;
      }
      if (vPart != uBodyPart && uEyes < 0.5) discard;   // (run out into a puddle: no eyes)
      vec3 col = uPartColor[vPart];
      float alpha = 1.0;
      if (vPart == uBodyPart) {
        // the cells, streaming along it (a slow wobble hides how they are laid out)
        vec2 p = vec2(vFlowUv.y, vFlowUv.x - tm * ${flow}) * ${K};
        p += 0.012 * vec2(sin(p.y * 1.7 + tm * 0.21) + sin(p.y * 4.3 - p.x * 1.1), sin(p.x * 1.9 - tm * 0.17) + sin(p.x * 3.7 + p.y * 1.3));
        vec4 c = texture2D(uCellTex, p);
        float aa = fwidth(c.r) * 0.7 + 1e-3, aa2 = fwidth(c.g) * 0.7 + 1e-3;
        #if FLOW_STYLE == 3
          // his mud's goop, streaming up it (its flow coordinates, in world units about)
          col = goopColor(vec2(vFlowUv.y * 2.4, (vFlowUv.x - tm * ${flow}) * 3.2), tm);
        #elif FLOW_STYLE == 2
          // molten rock in bands of heat, blotches of crust riding on it
          float t1 = smoothstep(0.3 - aa, 0.3 + aa, c.r), t2 = smoothstep(0.62 - aa, 0.62 + aa, c.r);
          vec3 mid = mix(pBody, pLine, 0.55);
          col = mix(mix(pBody, mid, t1), pLine, t2) * (0.93 + 0.12 * c.b);
          float crust = smoothstep(0.5 - aa2, 0.5 + aa2, c.g + 0.04), rim = smoothstep(0.4 - aa2, 0.4 + aa2, c.g + 0.04) * (1.0 - crust);
          col = mix(col, pBody * 0.72, rim * 0.7);
          col = mix(col, pDark, crust);
          flowHeat = (1.0 - crust) * mix(0.8, 1.0, t2);
        #else
          flowLine = smoothstep(0.5 - aa, 0.5 + aa, c.r);
          float dark = smoothstep(0.5 - aa2, 0.5 + aa2, c.g) * c.b * smoothstep(0.44, 0.32, c.r);
          col = mix(mix(pBody, pDark, dark), pLine, flowLine);
          // streaks running up it, faster
          vec4 c2 = texture2D(uCellTex, vec2(vFlowUv.y * 2.2 * ${K} + 0.31, (vFlowUv.x - tm * ${(F.flow * 2.2).toFixed(3)}) * 0.4 * ${K} + 0.53));
          float a2 = fwidth(c2.g) * 0.7 + 1e-3, streak = smoothstep(0.5 - a2, 0.5 + a2, c2.g) * c2.b;
          col = mix(col, mix(pBody, pLine, 0.55), streak * 0.4 * (1.0 - flowLine));
          #if FLOW_STYLE == 1
            float ab = fwidth(c.a) * 0.7 + 1e-3, bub = smoothstep(0.5 - ab, 0.5 + ab, c.a) * (1.0 - flowLine);
            col = mix(col, pLine, bub * 0.85);
            flowLine = max(flowLine, bub * 0.6);
          #endif
          alpha = mix(mix(pNum.x, 1.0, 0.6), pNum.z, flowLine);
        #endif
        // foam (the crest, the lip, the jaw's tip, the foot) and the barrel of its mouth: its
        // colour attribute, sharpened, wobbly, broken up by the cells
        float wob = 0.1 * (c.b - 0.5) + 0.04 * sin(vFlowUv.x * 9.0 + vFlowUv.y * 3.0 + tm * 2.0);
        float af = fwidth(vFlow.r) + 1e-3, am = fwidth(vFlow.g) + 1e-3;
        float foam = smoothstep(0.5 - af, 0.5 + af, vFlow.r + 0.18 * (c.r - 0.5) + wob);
        float mouth = smoothstep(0.5 - am, 0.5 + am, vFlow.g + wob * 0.6);
        // where it comes out of its fluid: foam hugging the surface, lapping (lava: a seam)
        if (above < 1e3) {
          float hug = 0.05 + 0.018 * sin(vFlowUv.y * 5.0 + tm * 2.3) + 0.012 * sin(vFlowUv.x * 7.0 - tm * 3.1), ad = fwidth(above) + 1e-4;
          foam = max(foam, 1.0 - smoothstep(hug - ad, hug + ad, above));
        }
        #if FLOW_STYLE == 3
          col = mix(col, ${GOOP_RIM}, foam * 0.8); col = mix(col, vec3(0.01), mouth); flowLine = 0.0;
        #elif FLOW_STYLE == 2
          col = mix(col, pLine, foam); flowHeat = max(flowHeat, foam); flowLine = max(flowLine, foam * 0.6);
          col = mix(col, mix(pBody, pLine, 0.35), mouth); flowHeat = mix(flowHeat, 1.0, mouth);
          col *= 0.6;   // (lit mostly by itself, below)
        #else
          col = mix(col, pFoam, foam); alpha = mix(alpha, 0.97, foam); flowLine = max(flowLine, foam * 0.5);
          col = mix(col, pDark * 0.2, mouth); alpha = mix(alpha, 1.0, mouth); flowLine *= 1.0 - mouth;
          flowLine *= pNum.y;
        #endif
      }
      diffuseColor.rgb *= col;
      diffuseColor.a *= alpha * uFade;`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if (vPart == uBodyPart) {
        #if FLOW_STYLE == 3
          totalEmissiveRadiance = vec3(0.0);
        #elif FLOW_STYLE == 2
          totalEmissiveRadiance = pEm * 0.25 * flowHeat + diffuseColor.rgb * (0.75 * flowHeat + flowLine);
        #else
          totalEmissiveRadiance = pEm + diffuseColor.rgb * flowLine;
        #endif
      } else totalEmissiveRadiance = vec3(0.0);
      totalEmissiveRadiance += uFlash;`);
  };
  mat.customProgramCacheKey = () => 'squirtle-' + style;
  mat.userData.flow = u;
  return mat;
}

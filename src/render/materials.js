// How every cube part looks (render/parts.js): one table of looks, from which the materials of
// the active cube ('full': PBR, cut, shadowed, animated) and of the low-detail proxies ('proxy':
// Lambert, darker, batched) are both made, so the two cannot disagree about what a part is.
// Also the fluids' surface motion (world.js); their colours are their palettes' (fluidpal.js).
import * as THREE from 'three';
import { N, WATER, LAVA, ACID, MUD } from '../core/constants.js';
import { CELLS, useCells } from './watercells.js';
import { PAL_TEX, PAL_GLSL } from './fluidpal.js';
import { FALL_WIDTH } from './parts.js';
import { WET_LIFT, BOXES } from './shore.js';
import { FLUID_MOTION, SINK, swellGLSL, tideY, stepWet } from './surface.js';

// How each fluid moves and is drawn; its colours are its palette's (themes/fluids.js, one per
// body of fluid: render/fluidpal.js), not these.
// style: the look of its cells (watercells.js CELLS: 'water', 'crust' for lava's plates and
// glowing cracks, 'sludge' for acid's bubbling cells); clear: drawn see-through (its palette's
// opacity); motion: an emissive pulse around base (none: its cells' tide moves it);
// cells: the surface drawn as drifting cartoon cells (cellMaterial), moving as its FLUID_MOTION
// says (where it stands, how it rises and falls: render/surface.js). Where it meets a bank, foam
// hugs the shore with a second line lapping in at it; the bank stays dark where the water has
// just been (lava: a glowing seam instead).
// fall: the sheet pouring over an edge, its cells streaming down it (fallCellMaterial: veins,
// faster streaks over them, `flow` world units a second), lighting themselves by `glow`;
// rides: foam and ripples where a fall lands on it (render/falls.js), else a splash ring.
export const FLUID_LOOK = {
  [WATER]: { style: 'water', clear: true, emissiveIntensity: 1, roughness: 0.55, metalness: 0, motion: {}, rides: true,
    cells: FLUID_MOTION[WATER],
    fall: { emissiveIntensity: 1, cells: { glow: 0.3, flow: 4.5 } } },
  [LAVA]: { style: 'crust', clear: false, emissiveIntensity: 1.2, roughness: 0.6, metalness: 0, motion: { pulse: 0.2, base: 1.1, rate: 3 }, rides: false,
    cells: FLUID_MOTION[LAVA],
    fall: { emissiveIntensity: 1.3, cells: { glow: 1, flow: 1.3 } } },
  [ACID]: { style: 'sludge', clear: true, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0, motion: {}, rides: true,
    cells: FLUID_MOTION[ACID],
    fall: { emissiveIntensity: 1, cells: { glow: 0.35, flow: 3.2 } } },
  // Sollmeldon's mud (a look of a standing fluid only, core/constants.js MUD): black and glossy,
  // bubbling, not see-through; it never falls
  [MUD]: { style: 'sludge', clear: false, emissiveIntensity: 0.2, roughness: 0.18, metalness: 0, motion: {}, rides: true,
    cells: FLUID_MOTION[MUD], fall: { emissiveIntensity: 0.2, cells: null } },
};

// The surroundings are drawn darker than the cube you are in: solids (and props) take this
// tint, fluids and glows this share of their colour and light.
export const PROXY = { tint: 0x5f6672, fluid: 0.6, glow: 0.6 };

// emissive strength of a surface at `time` (the active cube pulses lava; proxies too)
export function fluidGlow(t, time) {
  const L = FLUID_LOOK[t], m = L.motion;
  return m.pulse ? m.base + Math.sin(time * m.rate) * m.pulse : L.emissiveIntensity;
}

const dim = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

// detail: 'full' (the active cube) or 'proxy' (the surroundings)
export function solidMaterial(detail) {
  return detail === 'full' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
    : new THREE.MeshLambertMaterial({ vertexColors: true, color: PROXY.tint });
}

// (white: the palette's colours as they are; the proxies' a share of them, PROXY.fluid)
// Every fluid surface writes depth, see-through or not: the bodies (the hero, the other players,
// render/character.js, partner.js) are drawn after every other see-through thing, so what of a
// body wading in a fluid (or seen through one) is under its surface must be hidden by its depth.
// The cube's fluids, its neighbours' and the standing ones (render/trials.js) alike.
export function fluidMaterial(t, detail) {
  const L = FLUID_LOOK[t], common = { transparent: L.clear, depthWrite: true };
  if (detail === 'full') return new THREE.MeshStandardMaterial({ ...common, color: 0xffffff, emissive: 0xffffff,
    emissiveIntensity: L.emissiveIntensity, roughness: L.roughness, metalness: L.metalness });
  return new THREE.MeshLambertMaterial({ ...common, color: dim(0xffffff, PROXY.fluid), emissive: dim(0xffffff, PROXY.fluid),
    emissiveIntensity: L.emissiveIntensity });
}

// (a fall is one ribbon, render/parts.js fallSheets: seen from both sides)
export function fallMaterial(t, detail) {
  const F = FLUID_LOOK[t].fall, common = { transparent: true, depthWrite: false, side: THREE.DoubleSide };
  if (detail === 'full') return new THREE.MeshStandardMaterial({ ...common, color: 0xffffff, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: F.emissiveIntensity });
  return new THREE.MeshLambertMaterial({ ...common, color: dim(0xffffff, PROXY.fluid), emissive: dim(0xffffff, PROXY.fluid),
    emissiveIntensity: F.emissiveIntensity });
}

// The wind that flutters what hangs (prayer flags): its time, advanced by render/world.js
export const WIND = { value: 0 };

// a solid's material that swings each vertex with the wind as far as its uv's u says (0: fixed,
// 1: the hanging end), along a gusty wind across the cube, rippling with the place it is at.
// scale: the part's position units (render/parts.js packs positions in units of the cube's scale)
export function swayMaterial(mat, scale) {
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    compile?.call(mat, sh, r);
    sh.uniforms.uWind = WIND;
    sh.uniforms.uSwayScale = { value: scale };
    sh.vertexShader = 'uniform float uWind, uSwayScale;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec3 wp = position.xyz * uSwayScale;
        float ph = uWind * 4.2 + wp.x * 2.9 + wp.z * 2.3 - wp.y * 1.3, gust = 0.75 + 0.25 * sin(uWind * 0.7 + wp.x * 0.2);
        vec3 push = vec3(0.62, 0.12, 0.78) * (sin(ph) * 0.045 + sin(ph * 2.3 + 1.7) * 0.018) * gust;
        transformed += push * uv.x / uSwayScale;
      }`);
  };
  mat.customProgramCacheKey = () => key + '-sway';
  return mat;
}

const TAU = Math.PI * 2;

// The wet line of each fluid with cells (FLUID_LOOK): how high (over the rest height) the banks
// of the cubes' own fluids are still wet (render/surface.js stepWet). Set by tickTides once a
// frame, shared by every cube and proxy.
export const WET_LINE = Object.fromEntries(Object.entries(FLUID_LOOK).filter(([, L]) => L.cells).map(([t]) => [t, { value: 0, wet: null }]));
// and where their tide stands now and their wet line, per fluid (x water, y lava, z acid), for the
// structures standing in them (render/wet.js wetMaterial)
export const FIXED_TIDE = { value: new THREE.Vector3() }, FIXED_WET = { value: new THREE.Vector3() };
// how far over its level (world units, under it: < 0) clear water is drawn now: its rest height
// and its tide (render/surface.js; what floats in it, the swimmer: render/animator.js, game/swim.js)
export const waterShownAt = () => tideY(FLUID_LOOK[WATER].cells, WIND.value) - SINK;
let tidesAt = null;
export function tickTides() {
  const dt = tidesAt == null ? 0 : Math.max(0, WIND.value - tidesAt);
  tidesAt = WIND.value;
  for (const [t, u] of Object.entries(WET_LINE)) {
    const S = FLUID_LOOK[t].cells;
    u.value = u.wet = stepWet(S, u.wet, tideY(S, WIND.value), dt);
    if (t <= ACID) { FIXED_TIDE.value.setComponent(t - 1, tideY(S, WIND.value)); FIXED_WET.value.setComponent(t - 1, u.value); }   // (the mud is no cube's own)
  }
}
// GLSL: how far p is from the boxes round its cell where they stand out of the water (at
// `water`; render/shore.js waterBoxes, their tops ramps)
const BOXES_GLSL = `
  uniform highp sampler2D uWaterBoxes;
  float boxDist(vec2 p, float water) {
    ivec2 at = ivec2(floor(p));
    float d = 9.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      ivec2 q = at + ivec2(i, j);
      if (any(lessThan(q, ivec2(0))) || any(greaterThan(q, ivec2(${N - 1})))) continue;
      for (int k = 0; k < ${BOXES}; k++) {
        ivec2 t = ivec2(q.x * ${BOXES * 2} + k * 2, q.y);
        vec4 span = texelFetch(uWaterBoxes, t + ivec2(1, 0), 0);
        if (max(span.y, span.z) <= span.x) break;
        vec4 r = texelFetch(uWaterBoxes, t, 0);
        vec2 c = clamp(p, r.xy, r.zw);
        float top = mix(span.y, span.z, span.w > 0.5 ? (c.y - r.y) / max(r.w - r.y, 1e-4) : (c.x - r.x) / max(r.z - r.x, 1e-4));
        if (water < span.x || water > top) continue;
        d = min(d, length(p - c));
      }
    }
    return d;
  }
`;

// The walls a fluid's surface meets (cellMaterial wallDist): the banks round its cell that stand
// over it, from the bits in its uvs (render/floors.js fluidVolume), or a standing fluid's from the
// ground of the cells round about (section.js WATER_SHORE: the corners of the floor it meets
// there): where the corners next to its cell stand at or over its rest height (as a bank does).
// The distance to their squares.
const UV_SHORES = `
        int ci = int(floor(code + 0.5)), s = ci & 255, c = ci >> 8;
        vec2 l = p - vec2(float(c % ${N}), float(c / ${N}));
        float d = 9.0;
        if ((s & 1) != 0) d = shoreMin(d, 1.0 - l.x);
        if ((s & 2) != 0) d = shoreMin(d, l.x);
        if ((s & 4) != 0) d = shoreMin(d, 1.0 - l.y);
        if ((s & 8) != 0) d = shoreMin(d, l.y);
        if ((s & 16) != 0) d = shoreMin(d, length(1.0 - l));
        if ((s & 32) != 0) d = shoreMin(d, length(vec2(l.x, 1.0 - l.y)));
        if ((s & 64) != 0) d = shoreMin(d, length(vec2(1.0 - l.x, l.y)));
        if ((s & 128) != 0) d = shoreMin(d, length(l));
        return d;`;
const TRIAL_SHORES = `
        ivec2 at = ivec2(floor(p));
        vec2 l = p - vec2(at);
        float d = 9.0;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          ivec2 q = at + ivec2(i, j);
          if (i == 0 && j == 0 || any(lessThan(q, ivec2(0))) || any(greaterThan(q, ivec2(${N - 1})))) continue;
          // its corners next to our cell (x: 0 on its west side, 1 on its east; z the same)
          vec4 s = texelFetch(uShoreGround, q, 0);
          float lo = 1e9;
          for (int k = 0; k < 4; k++) {
            int kx = k & 1, kz = k >> 1;
            if ((i == 0 || kx == (i > 0 ? 0 : 1)) && (j == 0 || kz == (j > 0 ? 0 : 1))) lo = min(lo, s[k]);
          }
          if (lo >= uTrialLevel) {
            vec2 o = vec2(float(i), float(j));
            d = shoreMin(d, length(max(o - l, 0.0) + max(l - o - 1.0, 0.0)));
          }
        }
        return d;`;

// The cartoon look of a fluid's surface (FLUID_LOOK cells), like Wind Waker's sea: on its top,
// rounded cells that wander and change shape, light gaps between them, darker swirls inside;
// its sides keep the plain colour. The pattern is drawn once a frame into a tiling texture
// (watercells.js, the fluid's style); here it is only looked up (through a slow wobble that
// hides the tiling) and thresholded. It is laid out in the cube's own coordinates (the position
// attribute, in units of the part's scale), so it stays put when the cubes slide during travel
// and matches between a cube and its proxy. A chained shader edit like swayMaterial (after the
// cut's inject). The colours are the palette's of each vertex (its `pal` attribute, render/
// parts.js; fluidpal.js), times the material's own (white; the proxies' darker).
// The surface rises and falls with the tide and the waves (swellGLSL), sides and all. Where it
// meets the shore (shoreDist: a bank standing over it round its cell, the shores in its uvs,
// render/floors.js fluidVolume; or the ground under it sloping up out of it, its `shore`
// attribute, render/shore.js) foam hugs the shore, and the
// bank's wall is dark where the water has just been, a band (in front of it, in this mesh) drawn
// from the water's surface up to the wet line (WET_LINE) only.
// The styles: water as above; sludge (acid) the same, with bubbles blowing up and popping in the
// cells and a green stain on the banks; crust (lava): molten rock lit by itself in flat bands of
// heat over big slow cells, blotches of dark crust growing and melting away on it (more by the
// banks, where it cools), a bright seam along the bank instead of the foam and the wet band.
// trial: a standing fluid (render/trials.js: a trial's, a boss's tide) instead, rising and sinking
// through the room: { level, wet } uniforms (its surface's rest height; how far over it the room
// is wet), shore (section.js WATER_SHORE, the ground it meets in each cell): its walls are the
// cells round about whose ground stands over it, and its wet bands (a mesh of their own with this
// material, uvs (-1, 0)) go by its level.
// cube: the active cube's water (render/wet.js waterUniforms; not the proxies'): the foam also
// goes round the small things standing in the water (its boxes), and the cube's own fluids under
// a standing one (its level and box) are not drawn there: it is (render/surface.js ownUnder).
const STYLE_ID = { water: 0, sludge: 1, crust: 2 };
export function cellMaterial(mat, t, trial = null, cube = null) {
  const over = !trial && cube;
  const L = FLUID_LOOK[t], S = L.cells;
  if (!S) return mat;
  const C = CELLS[L.style];
  useCells(mat, L.style);
  const uniforms = { uCellTime: WIND, uCellTex: C.tex, uPalTex: PAL_TEX, uWetLine: trial ? trial.wet : WET_LINE[t],
    ...trial && { uTrialLevel: trial.level, uShoreGround: trial.shore }, ...over && { uOverLevel: cube.level, uOverBox: cube.box },
    ...cube && { uWaterBoxes: cube.boxes } };
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    compile?.call(mat, sh, r);
    Object.assign(sh.uniforms, uniforms);
    // the cube's own coordinates in texture tiles (the matrix's scale is the part's)
    const tile = (C.tile / C.perUnit).toFixed(4);
    // the swell moves the tops and the sides' upper edges (render/floors.js fluidVolume uvs: v,
    // the rest height), not the bed or the wet bands; a standing fluid's tops and its sides'
    // upper corners (render/trials.js standingSurface: shore w 2) stand at its rest height and
    // move with it, its sides' no higher than their ceiling nor lower than their ground (it is
    // drawn unscaled, in the cube's coordinates)
    sh.vertexShader = 'uniform float uCellTime;\nattribute vec4 pal, shore;\nflat varying vec2 vPalRows;\n' + (trial ? 'uniform float uTrialLevel;\n' : '') + 'varying vec2 vCellP, vCellW, vCellUv;\nvarying vec3 vCellN;\nvarying float vCellWave, vCellY;\nvarying vec4 vShore;\n' + swellGLSL(S) + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        #if defined(USE_BATCHING)
          mat4 cellM = modelMatrix * batchingMatrix;
        #else
          mat4 cellM = modelMatrix;
        #endif
        vec2 cw = position.xz * length(cellM[0].xyz);
        float cy = position.y * length(cellM[1].xyz);
        bool band = uv.x < -0.5 && uv.x > -1.5, upper = uv.x > -0.5 || abs(cy - uv.y) < 0.004;
        vCellWave = swellW(cw, uCellTime);
        ${trial ? `if (uv.x > -0.5) transformed.y = uTrialLevel + swellY(cw, uCellTime);
        else if (shore.w > 1.5 && shore.w < 2.5) transformed.y = clamp(uTrialLevel + swellY(cw, uCellTime), shore.x, shore.z > 0.0 ? shore.z : 1e4);`
        : 'if (!band && upper) transformed.y += swellY(cw, uCellTime) / length(cellM[1].xyz);'}
        // (a wet band on sloping ground, shore w 3: by the ground's height under it, render/floors.js wetSlope)
        vCellP = cw / ${tile}; vCellW = cw; vCellUv = uv; vCellY = cy - (shore.w > 2.5 ? ${WET_LIFT.toFixed(4)} : 0.0) - ${trial ? 'uTrialLevel' : 'uv.y'};
        vCellN = normal; vPalRows = pal.xy; vShore = shore;
      }`);
    sh.fragmentShader = '#define CELL_STYLE ' + STYLE_ID[L.style] + '\nflat varying vec2 vPalRows;\nvarying vec2 vCellP, vCellW, vCellUv;\nvarying vec3 vCellN;\nvarying float vCellWave, vCellY;\nvarying vec4 vShore;\nuniform float uCellTime, uWetLine;\nuniform sampler2D uCellTex;\n'
      + PAL_GLSL + (trial ? 'uniform float uTrialLevel;\nuniform sampler2D uShoreGround;\n' : '') + (over ? 'uniform float uOverLevel;\nuniform vec4 uOverBox;\n' : '') + (cube ? BOXES_GLSL : '') + swellGLSL(S) + `
      float shoreMin(float a, float b) { float h = max(0.14 - abs(a - b), 0.0) / 0.14; return min(a, b) - h * h * 0.035; }
      // how far p is from the walls round its cell, 9 if none near
      float wallDist(vec2 p, float code) {
        ${trial ? TRIAL_SHORES : UV_SHORES}
      }
      // How far p is from the shore, the one formula for every fluid: from the walls round its cell,
      // or (nearer) across the ground sloping up out of the water under it (vShore: its height and
      // slope, render/shore.js), from how deep the water stands over it now; past the shore: < 0.
      // water: the surface's height there now.
      float shoreDist(vec2 p, float code, float water) {
        float d = wallDist(p, code);
        ${cube ? 'd = shoreMin(d, boxDist(p, water));' : ''}
        return vShore.w < 0.5 && vShore.y > 0.02 ? shoreMin(d, (water - vShore.x) / vShore.y) : d;
      }
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float cellLine = 0.0, cellBand = 0.0, cellHeat = 0.0;
      vec3 cellEmissive = palColor(vPalRows, 0.0, 4);
      ${over ? `// (under the standing fluid: it is drawn instead)
      if (all(greaterThan(vCellW, uOverBox.xy)) && all(lessThan(vCellW, uOverBox.zw)) && vCellUv.y + ${SINK.toFixed(4)} < uOverLevel - 0.001) discard;` : ''}
      {
        vec3 pBody = palColor(vPalRows, 0.0, 0), pDark = palColor(vPalRows, 0.0, 1), pLine = palColor(vPalRows, 0.0, 2), pFoam = palColor(vPalRows, 0.0, 3);
        vec4 pNum = palParams(vPalRows, 0.0);
        float top = smoothstep(0.6, 0.9, abs(normalize(vCellN).y)), tm = uCellTime;
        // a wet band on a bank: from the water up to the wet line (wobbly), nothing elsewhere
        // (lava: a thin seam glowing along the bank)
        bool band = vCellUv.x < -0.5 && vCellUv.x > -1.5;
        float bandLevel = swellY(vCellW, tm), bw = vCellW.x + vCellW.y;
        #if CELL_STYLE == 2
          float bandEdge = bandLevel + 0.03 + 0.012 * sin(bw * 9.0 + tm * 1.3) + 0.006 * sin(bw * 23.0 - tm * 2.1);
        #else
          float bandEdge = uWetLine + 0.008 * sin(bw * 7.3) + 0.005 * sin(bw * 17.0 + 1.3);
        #endif
        // (one on sloping ground, render/floors.js wetSlope, from a little over the waterline: it
        // stands WET_LIFT over the ground, and seen aslant would cover the foam at the waterline)
        if (band && (vCellY < bandLevel + (vShore.w > 2.5 ? ${WET_LIFT.toFixed(4)} : -0.003) || vCellY > bandEdge)) discard;
        // how far the shore is (wobbling); sides and bands: far
        vec2 w = vCellW;
        // (no further than the foam reaches: a cell further out knows no shores, so it must not jump there)
        float water = ${trial ? 'uTrialLevel' : 'vCellUv.y'} + swellY(w, tm);
        // (nothing where the ground stands over it, nor over its ceiling (the next floor up: a
        // standing fluid's, render/trials.js): hidden by the ground anyway, but shown where the
        // ground is cut open)
        if (vCellUv.x > -0.5 && vShore.w < 0.5 && (water < vShore.x - 0.05 || vShore.z > 0.0 && water > vShore.z - 0.01)) discard;
        float sd = vCellUv.x > -0.5 ? min(shoreDist(w, vCellUv.x, water), 0.7) : 0.7;
        sd += 0.022 * sin(w.x * 5.7 + w.y * 3.1 + tm * 1.9) + 0.016 * sin(w.y * 6.7 - w.x * 3.3 - tm * 2.4) + 0.008 * sin(w.x * 13.0 + w.y * 11.0 + tm * 3.1);
        // the slope of the waves: the pattern rides over them, and the side of a wave away from
        // the light is a shade darker (soft-edged, two tones)
        vec2 g = swellG(vCellW, tm) * top;
        float shade = smoothstep(-0.3, 0.3, dot(g, vec2(-0.6, -0.8)));
        vec2 p = vCellP + g * 0.018;
        #if CELL_STYLE == 2
          p += vec2(tm * 0.004, tm * 0.003);   // (it drifts)
        #endif
        p += 0.012 * vec2(sin(p.y * 1.7 + tm * 0.21) + sin(p.y * 4.3 - p.x * 1.1), sin(p.x * 1.9 - tm * 0.17) + sin(p.x * 3.7 + p.y * 1.3));
        vec4 c = texture2D(uCellTex, p);
        float aa = fwidth(c.r) * 0.7 + 1e-3, aa2 = fwidth(c.g) * 0.7 + 1e-3;
        float wave = mix(1.0, mix(0.82, 1.06, shade) * (1.0 + 0.05 * vCellWave), top);
        vec3 col;
        #if CELL_STYLE == 2
          // molten rock in flat bands of heat, hottest in the middle of its slow cells (each a
          // shade of its own), and blotches of dark crust coming and going on it, ringed a deeper
          // orange; more of them by the banks, where it cools. The sides: molten, plain.
          float cool = (1.0 - smoothstep(0.05, 0.5, sd)) * top;
          float t1 = smoothstep(0.3 - aa, 0.3 + aa, c.r), t2 = smoothstep(0.62 - aa, 0.62 + aa, c.r);
          vec3 mid = mix(pBody, pLine, 0.55);
          col = mix(mix(pBody, mid, t1), pLine, t2) * (0.93 + 0.12 * c.b);
          float gc = c.g + cool * 0.14;
          float crust = smoothstep(0.5 - aa2, 0.5 + aa2, gc) * top, rim = smoothstep(0.4 - aa2, 0.4 + aa2, gc) * (1.0 - crust) * top;
          col = mix(col, pBody * 0.72, rim * 0.7);
          col = mix(col, pDark * wave, crust);
          col = mix(mix(pBody, mid, 0.35), col, top);
          cellHeat = (1.0 - crust) * mix(0.8, 1.0, t2 * top);
          col *= 0.6;   // (lit mostly by itself, below: the sun must not wash it out)
        #else
          // (the cells' gaps thin out and give way to the foam at the shore)
          float thin = 0.55 * (1.0 - smoothstep(0.15, 0.55, sd));
          cellLine = smoothstep(0.5 + thin - aa, 0.5 + thin + aa, c.r) * top;
          // inside the cells only (well away from the gaps)
          float dark = smoothstep(0.5 - aa2, 0.5 + aa2, c.g) * c.b * smoothstep(0.44, 0.32, c.r) * top;
          col = mix(mix(pBody, pDark, dark) * wave, pLine, cellLine);
          #if CELL_STYLE == 1
            // bubbles blowing up and popping
            float ab = fwidth(c.a) * 0.7 + 1e-3, bub = smoothstep(0.5 - ab, 0.5 + ab, c.a) * top * (1.0 - cellLine);
            col = mix(col, pLine, bub * 0.85);
            cellLine = max(cellLine, bub * 0.6);
          #endif
        #endif
        diffuseColor.rgb *= col;
        diffuseColor.a *= mix(pNum.x, pNum.z, cellLine);
        // the shore: a wobbly band of foam hugging the bank, wider at high water, and a thinner
        // line lapping in at it from further out, broken up, thinning and fading as it comes
        {
          float ad = fwidth(sd) + 1e-4, high = 0.5 + 0.5 * sin(tm * ${(TAU / S.period).toFixed(5)});
          float hug = 0.07 + 0.035 * high, foam = 1.0 - smoothstep(hug - ad, hug + ad, sd);
          #if CELL_STYLE != 2
            float ph = fract(tm * 0.3 + 0.15 * sin(w.x * 0.8 + w.y * 0.6)), r = mix(0.36, hug + 0.03, ph * ph * (3.0 - 2.0 * ph));
            float gn = sin(w.x * 2.1 - w.y * 1.7 + tm * 0.5) + 0.5 * sin(w.x * 4.7 + w.y * 3.9) + 0.35, ag = fwidth(gn) + 1e-4;
            float wid = 0.034 * smoothstep(0.0, 0.15, ph) * (1.0 - ph * 0.7) * smoothstep(-ag, ag, gn);
            foam = max(foam, 1.0 - smoothstep(wid - ad, wid + ad, abs(sd - r)));
          #endif
          foam *= top;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * pFoam, foam);
          diffuseColor.a = mix(diffuseColor.a, 0.97, foam);
          cellLine = max(cellLine, foam);
        }
        if (band) {
          float k = clamp((vCellY - bandLevel) / max(bandEdge - bandLevel, 1e-3), 0.0, 1.0);
          #if CELL_STYLE == 2
            // the seam: hot rock where the lava laps at the bank
            diffuseColor.rgb = diffuse * mix(pLine, pBody, k);
            cellLine = 1.0; cellHeat = 1.0;
          #else
            // dark (acid: a green stain), paler higher up
            diffuseColor.rgb = ${L.style === 'sludge' ? 'diffuse * pDark * 0.3' : 'vec3(0.02, 0.035, 0.045)'};
            diffuseColor.a = ${S.wet.toFixed(3)} * mix(1.0, 0.6, k);
            cellLine = 0.0; cellBand = 1.0;
          #endif
        }
        cellLine *= pNum.y;
      }`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      #if CELL_STYLE == 2
        // (molten: lit by itself, its own colours; crust barely)
        totalEmissiveRadiance = totalEmissiveRadiance * cellEmissive * 0.25 * cellHeat + diffuseColor.rgb * (0.75 * cellHeat + cellLine);
      #else
        totalEmissiveRadiance = totalEmissiveRadiance * cellEmissive * (1.0 - cellBand) + diffuseColor.rgb * cellLine;
      #endif`);
  };
  mat.customProgramCacheKey = () => key + '-cells-' + L.style + '-' + t + (trial ? '-trial' : '') + (cube ? '-cube' : '');
  return mat;
}

// A fall in the cartoon look (FLUID_LOOK fall.cells): the fluid's cells (watercells.js),
// stretched long, stream down it as light veins, fainter streaks faster over them; its sides are
// eaten away in a wobble with a light rim, a band of foam where it curls over the lip (its lower
// edge ragged), and it fades in where it leaves the pool. The sheet ripples a little (along its
// normal). By its uvs (render/parts.js fallSheets), so the proxies' falls flow alike. Its
// colours are its palettes' (fluidpal.js), from the one at its top to the one at its foot (its
// `pal` attribute). Lava's runs slowly, molten, in bands of heat with blotches of crust on it.
// A chained shader edit (after the cut's inject).
export function fallCellMaterial(mat, t) {
  const L = FLUID_LOOK[t], F = L.fall, S = F.cells;
  if (!S) return mat;
  const C = CELLS[L.style];
  useCells(mat, L.style);
  const uniforms = { uCellTime: WIND, uCellTex: C.tex, uPalTex: PAL_TEX, uFallGlow: { value: S.glow } };
  const T = (C.tile / C.perUnit).toFixed(4), W = FALL_WIDTH.toFixed(3), V = '0.7';
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    compile?.call(mat, sh, r);
    Object.assign(sh.uniforms, uniforms);
    // where it leaves the pool and curls over the lip it rises and falls with the pool (swellGLSL)
    const pool = L.cells;
    sh.vertexShader = 'uniform float uCellTime;\nattribute vec4 pal;\nflat varying vec2 vPalRows;\nvarying float vPalK;\nvarying vec2 vFallUv;\n' + (pool ? swellGLSL(pool) : '') + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        #if defined(USE_BATCHING)
          float fallS = length((modelMatrix * batchingMatrix)[0].xyz);
        #else
          float fallS = length(modelMatrix[0].xyz);
        #endif
        vFallUv = uv; vPalRows = pal.xy; vPalK = pal.z / 1000.0;
        float s = uv.y / ${V};
        transformed += normal * 0.022 * sin(s * 2.6 - uCellTime * 9.0 + uv.x * 2.0) * smoothstep(0.3, 0.9, s) / fallS;
        ${pool ? 'transformed.y += swellY(position.xz * fallS, uCellTime) * (1.0 - smoothstep(0.25, 0.75, s)) / fallS;' : ''}
      }`);
    sh.fragmentShader = '#define CELL_STYLE ' + STYLE_ID[L.style] + '\nuniform float uCellTime, uFallGlow;\nuniform sampler2D uCellTex;\nflat varying vec2 vPalRows;\nvarying float vPalK;\nvarying vec2 vFallUv;\n' + PAL_GLSL
      + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float fallWhite = 0.0;
      vec3 fallEmissive = palColor(vPalRows, vPalK, 4);
      {
        vec3 pBase = palColor(vPalRows, vPalK, 5), pLine = palColor(vPalRows, vPalK, 6), pLight = palColor(vPalRows, vPalK, 7);
        float u = vFallUv.x, s = vFallUv.y / ${V}, tm = uCellTime;
        // the sides, eaten away in a wobble
        float e = min(u, 1.0 - u) * ${W}, side = u < 0.5 ? 0.0 : 1.7;
        float cut = 0.02 + 0.018 * sin(s * 9.0 - tm * 7.0 + side) + 0.012 * sin(s * 23.0 - tm * 11.0 + side * 2.3);
        if (e < cut) discard;
        float ae = fwidth(e) + 1e-4, rim = 1.0 - smoothstep(cut + 0.05 - ae, cut + 0.05 + ae, e);
        // the cells, stretched long, streaming down; faster streaks over them
        vec4 c1 = texture2D(uCellTex, vec2(u * ${W} * 1.3 / ${T}, (s - tm * ${S.flow.toFixed(2)}) * 0.3 / ${T}));
        vec4 c2 = texture2D(uCellTex, vec2(u * ${W} * 2.0 / ${T} + 0.31, (s - tm * ${(S.flow * 1.6).toFixed(2)}) * 0.18 / ${T} + 0.53));
        float a1 = fwidth(c1.r) * 0.7 + 1e-3, a2 = fwidth(c2.g) * 0.7 + 1e-3;
        float vein = smoothstep(0.5 - a1, 0.5 + a1, c1.r), streak = smoothstep(0.5 - a2, 0.5 + a2, c2.g) * c2.b;
        // foam where it curls over the lip, its lower edge ragged
        float lipEdge = 0.62 + 0.07 * sin(u * 17.0 + tm * 3.0) + 0.04 * sin(u * 31.0 - tm * 5.0), al = fwidth(s) + 1e-4;
        float lip = smoothstep(0.18, 0.28, s) * (1.0 - smoothstep(lipEdge - al, lipEdge + al, s));
        fallWhite = max(max(vein, rim), lip);
        #if CELL_STYLE == 2
          // molten rock streaming down in bands of heat, blotches of crust riding on it
          float hot = smoothstep(0.55 - a1, 0.55 + a1, c1.r);
          streak = smoothstep(0.5 - a2, 0.5 + a2, c2.g);
          fallWhite = rim * 0.5;
          diffuseColor.rgb *= mix(mix(mix(pBase, pLine, hot * 0.8), pLine, fallWhite), pLight, streak * 0.85);
        #else
          diffuseColor.rgb *= mix(mix(pBase, pLight, streak * 0.7), pLine, fallWhite);
        #endif
        vec4 pNum = palParams(vPalRows, vPalK);
        diffuseColor.a *= mix(pNum.w, 0.95, fallWhite) * smoothstep(0.0, 0.22, s);
        fallEmissive *= ${L.style === 'crust' ? '1.0 - streak * 0.7' : '1.0'};
      }`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance = totalEmissiveRadiance * fallEmissive + diffuseColor.rgb * fallWhite * uFallGlow;`);
  };
  mat.customProgramCacheKey = () => key + '-fallcells-' + L.style;
  return mat;
}

// the cartoon looks a part's material gets after its cut (cellMaterial, fallCellMaterial); cube:
// the active cube's water (cellMaterial)
export function fluidLook(mat, part, cube = null) {
  return part.kind === 'fluid' ? cellMaterial(mat, part.fluid, null, cube) : part.kind === 'fall' ? fallCellMaterial(mat, part.fluid) : mat;
}

// part: an entry of render/parts.js PARTS
export function partMaterial(part, detail) {
  if (part.kind === 'solid') return solidMaterial(detail);
  if (part.kind === 'fluid') return fluidMaterial(part.fluid, detail);
  return fallMaterial(part.fluid, detail);
}

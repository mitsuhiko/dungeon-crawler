// The world's fluid palettes (themes/fluids.js) as one small texture every fluid's material
// looks its colours up in (materials.js cellMaterial, fallCellMaterial), by the palette rows
// its vertices carry (render/parts.js `pal`), so the active cube and the batched proxies agree,
// and a cube can hold differently coloured bodies of fluid. One row per palette, one texel per
// colour (PAL_COLUMNS, linear), the last its numbers: opacity, glow, lineOpacity, fallOpacity.
// After the fluids' rows, Sollmeldon's mud's (themes/fluids.js MUD_ROW).
import * as THREE from 'three';
import { PAL_ROWS, worldPalettes, mudPalette } from '../themes/fluids.js';

export const PAL_COLUMNS = ['body', 'dark', 'line', 'foam', 'emissive', 'fallBase', 'fallLine', 'fallLight'];
const W = PAL_COLUMNS.length + 1;
const ROWS = PAL_ROWS + 1;
const data = new Float32Array(W * ROWS * 4);
const tex = new THREE.DataTexture(data, W, ROWS, THREE.RGBAFormat, THREE.FloatType);
tex.magFilter = tex.minFilter = THREE.NearestFilter;
export const PAL_TEX = { value: tex };

let rows = null, key = null;
function fill() {
  rows.forEach((p, r) => {
    PAL_COLUMNS.forEach((c, i) => data.set([...p[c], 1], (r * W + i) * 4));
    data.set([p.opacity, p.glow, p.lineOpacity, p.fallOpacity], (r * W + W - 1) * 4);
  });
  tex.needsUpdate = true;
}
// the palettes of the world with this seed and theme stretches (themes/depth.js worldThemes;
// none: the classic look everywhere)
export function setFluidPalettes(seed = null, themes = null) {
  const k = seed == null ? 'classic' : seed + '|' + themes.map(s => s.at + ':' + s.theme.props).join(',');
  if (k === key) return;
  key = k;
  rows = [...worldPalettes(seed, themes), mudPalette()];
  fill();
}
setFluidPalettes();

// a palette by its row (themes/fluids.js palRow): its colours as linear [r, g, b] and as hex
export const paletteOf = row => rows[row] ?? rows[0];

// GLSL: the colour in column `col` of palette rows a and b, mixed by k; the numbers likewise
export const PAL_GLSL = `
  uniform highp sampler2D uPalTex;
  vec3 palColor(vec2 rows, float k, int col) {
    return mix(texelFetch(uPalTex, ivec2(col, int(rows.x + 0.5)), 0).rgb, texelFetch(uPalTex, ivec2(col, int(rows.y + 0.5)), 0).rgb, k);
  }
  vec4 palParams(vec2 rows, float k) {
    return mix(texelFetch(uPalTex, ivec2(${W - 1}, int(rows.x + 0.5)), 0), texelFetch(uPalTex, ivec2(${W - 1}, int(rows.y + 0.5)), 0), k);
  }
`;

// The colours of the fluids, made from the world's seed: every depth has a few palettes per
// fluid, and which one a cube's fluid takes is the cube's to say (cubegen/fluidbodies.js: one
// per kind of fluid in a cube). Palette rows (palRow) are the same in the world worker and on the
// main thread, which draws them (render/fluidpal.js): the worker only marks each fluid floor and
// fall with its row.
//   slot 0 of a depth: the fluid that runs on, the same everywhere in a stretch of depths with
//     one theme (rivers across the faces, falls from cube to cube), so it never changes colour
//     where it goes from one cube into the next
//   slots 1..: the cubes whose fluid stays in them, variations of it within the theme's family
// A palette is picked between two of the theme's anchors (FAMILY) and jittered a little; the
// rest of its colours (the darker swirls, the light lines between the cells, foam, glow, the
// falls' colours) follow from the body colour in OKLCH. Dark water is duller and its pattern
// fainter, its lines lean towards teal; water stays teal to blue and acid green, far enough
// apart in hue that the two are never mistaken for each other (HUE), lava orange to red.
import { WATER, LAVA, ACID, MUD } from '../core/constants.js';
import { mulberry32, hash32 } from '../core/util.js';
import { MAX_DEPTH, themeAt } from './depth.js';

export const PAL_SLOTS = 6;
const FLUID_COUNT = 3;
export const PAL_ROWS = (MAX_DEPTH + 1) * FLUID_COUNT * PAL_SLOTS;
// the palette row of a depth's fluid (WATER, LAVA, ACID) in a slot; Sollmeldon's mud (MUD, a look)
// has one row of its own, after all of theirs (MUD_ROW)
export const MUD_ROW = PAL_ROWS;
export const palRow = (depth, fluid, slot = 0) => fluid === MUD ? MUD_ROW
  : ((Math.max(0, Math.min(MAX_DEPTH, depth | 0)) * FLUID_COUNT + (fluid - 1)) * PAL_SLOTS + slot);
export const rowDepth = row => Math.floor(row / (FLUID_COUNT * PAL_SLOTS));
export const rowFluid = row => Math.floor(row / PAL_SLOTS) % FLUID_COUNT + 1;
export const rowSlot = row => row % PAL_SLOTS;

// --- the anchors ----------------------------------------------------------------------------
// body colours to blend between (the first of each fluid: the look before there is a world)
export const ANCHORS = {
  [WATER]: {
    sky: '#2c9ad8', royal: '#2a60d6', cobalt: '#1f47a8', glacier: '#5ab4d8', lagoon: '#2fb6c9', turquoise: '#1fa3a8',
    teal: '#1f8a8a', murk: '#2f5452', slate: '#183651', navy: '#163254', greyteal: '#2a3939', deepteal: '#19292e',
  },
  [ACID]: { lime: '#7dff3a', green: '#52e04a', chartreuse: '#b0f03c', emerald: '#4fd25a', sickly: '#9ad84a', toxic: '#78f05a',
    goo: '#a8e030', ooze: '#94e83c', bog: '#6ec83a' },
  [LAVA]: { magma: '#ff6a00', ember: '#ff4a14', crimson: '#e6301a', amber: '#ff8c1a', gold: '#ffa828' },
};
// how far a fluid's hue may go (OKLCH degrees): water stays teal to blue, acid green (well apart,
// HUE_GAP, so the two never look alike), lava orange to red
export const HUE = { [WATER]: [188, 270], [ACID]: [118, 146], [LAVA]: [25, 72] };
export const HUE_GAP = HUE[WATER][0] - HUE[ACID][1];
const JITTER = { [WATER]: [0.04, 0.15, 8], [ACID]: [0.04, 0.1, 6], [LAVA]: [0.03, 0.08, 5] };   // lightness, chroma (share), hue

// each theme's anchors (by its prop set, themes/index.js `props`), and how far the fluid of a cube
// it stays in may stray from its running fluid (0..1)
const DEFAULT = { water: ['sky', 'royal', 'turquoise', 'slate'], acid: ['lime', 'green', 'chartreuse', 'emerald'], lava: ['magma', 'amber', 'gold'], spread: 0.5 };
export const FAMILY = {
  meadow: { water: ['sky', 'royal', 'turquoise', 'cobalt'] },
  clouds: { water: ['glacier', 'sky', 'royal'] },
  lagoon: { water: ['lagoon', 'turquoise', 'sky', 'teal'], spread: 0.7 },
  karst: { water: ['turquoise', 'teal', 'sky', 'lagoon'] },
  darkforest: { water: ['deepteal', 'murk', 'slate', 'navy'], spread: 0.35 },   // black forest pools
  peaks: { water: ['glacier', 'sky', 'slate'] },
  highlands: { water: ['sky', 'slate', 'royal', 'turquoise'] },
  badlands: { water: ['teal', 'turquoise', 'greyteal'], lava: ['magma', 'ember', 'amber'] },
  saltflats: { water: ['turquoise', 'glacier', 'lagoon'] },
  slime: { water: ['murk', 'greyteal', 'deepteal'], acid: ['goo', 'ooze', 'bog', 'chartreuse'], spread: 0.6 },   // slime pools
  canyon: { water: ['teal', 'turquoise', 'lagoon', 'slate'] },
  roots: { water: ['murk', 'deepteal', 'greyteal', 'teal'], acid: ['sickly', 'green'] },
  frozen: { water: ['glacier', 'slate', 'navy'], spread: 0.35 },
  grotto: { water: ['turquoise', 'deepteal', 'teal', 'navy'], spread: 0.7 },
  swamp: { water: ['murk', 'deepteal', 'greyteal'], acid: ['sickly', 'green', 'lime'] },
  hive: { water: ['teal', 'greyteal', 'murk'] },
  cenote: { water: ['teal', 'turquoise', 'deepteal', 'lagoon'], spread: 0.6 },
  nests: { water: ['deepteal', 'navy', 'greyteal'], acid: ['lime', 'emerald', 'toxic'] },
  ossuary: { water: ['slate', 'greyteal', 'deepteal'], acid: ['sickly', 'chartreuse'] },
  mines: { water: ['navy', 'cobalt', 'slate'] },
  forge: { water: ['slate', 'navy', 'greyteal'], lava: ['amber', 'gold', 'magma'] },
  ruins: { water: ['greyteal', 'deepteal', 'slate'], acid: ['emerald', 'green', 'toxic'] },
  volcanic: { water: ['greyteal', 'slate'], lava: ['magma', 'ember', 'amber'], spread: 0.35 },
  abyss: { water: ['navy', 'deepteal'], lava: ['ember', 'crimson', 'magma'], spread: 0.35 },
};
const KEY = { [WATER]: 'water', [ACID]: 'acid', [LAVA]: 'lava' };
export const familyOf = (theme, fluid) => {
  const f = FAMILY[theme?.props] || {};
  return { anchors: f[KEY[fluid]] || DEFAULT[KEY[fluid]], spread: f.spread ?? DEFAULT.spread };
};

// --- colour math (OKLab / OKLCH, sRGB) ------------------------------------------------------
const toLin = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toSrgb = c => c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
export function hexToLinear(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [toLin((n >> 16 & 255) / 255), toLin((n >> 8 & 255) / 255), toLin((n & 255) / 255)];
}
export function linearToHex([r, g, b]) {
  const k = c => Math.round(Math.max(0, Math.min(1, toSrgb(Math.max(0, c)))) * 255);
  return '#' + ((1 << 24) | (k(r) << 16) | (k(g) << 8) | k(b)).toString(16).slice(1);
}
export function linearToOklch([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
}
function oklchToLinearRaw([L, C, h]) {
  const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
const inGamut = c => c.every(v => v >= -1e-4 && v <= 1 + 1e-4);
// to linear sRGB, the chroma brought down until it fits
export function oklchToLinear([L, C, h]) {
  L = Math.max(0, Math.min(1, L));
  let c = oklchToLinearRaw([L, C, h]);
  if (inGamut(c)) return c.map(v => Math.max(0, Math.min(1, v)));
  let lo = 0, hi = C;
  for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (inGamut(oklchToLinearRaw([L, mid, h]))) lo = mid; else hi = mid; }
  return oklchToLinearRaw([L, lo, h]).map(v => Math.max(0, Math.min(1, v)));
}
const hexToOklch = hex => linearToOklch(hexToLinear(hex));
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.max(0, Math.min(1, v));
// between two OKLCH colours through OKLab (no hue swing through grey and back)
function blendLch(p, q, t) {
  const ab = ([, C, h]) => [C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)];
  const [a1, b1] = ab(p), [a2, b2] = ab(q), a = mix(a1, a2, t), b = mix(b1, b2, t);
  return [mix(p[0], q[0], t), Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360];
}

// --- a palette from its body colour ---------------------------------------------------------
// -> { body, dark, line, foam, emissive, fallBase, fallLine, fallLight, cap } (OKLCH), and
// opacity, glow (how much the lines light themselves), lineOpacity, fallOpacity
function derive(fluid, [L, C, h]) {
  const lch = (l, c, hh) => [clamp01(l), Math.max(0, c), (hh + 360) % 360];
  if (fluid === LAVA) return {   // body: the molten rock, dark: the crust on it, line: its hottest
    body: lch(L, C, h), dark: lch(L * 0.34, C * 0.3, h - 12), line: lch(Math.min(0.88, L + 0.14), C * 0.95, h + 34),
    foam: lch(0.9, C * 0.8, h + 36), emissive: lch(L * 0.8, C, h + 4), cap: lch(L * 0.79, C * 0.87, h - 6),
    fallBase: lch(L, C, h - 3), fallLine: lch(Math.min(0.88, L + 0.14), C * 0.95, h + 34), fallLight: lch(L * 0.45, C * 0.4, h - 10),
    opacity: 1, glow: 1.1, lineOpacity: 1, fallOpacity: 1,
  };
  // (acid stays vivid: too light and sRGB has no room left for its green)
  if (fluid === ACID) L = Math.max(0.72, Math.min(0.86, L));
  if (fluid === ACID) return {
    body: lch(L, C, h), dark: lch(L - 0.14, C * 0.95, h + 6), line: lch(Math.min(0.97, L + 0.07), C * 0.6, h - 14),
    foam: lch(0.95, C * 0.53, h - 11), emissive: lch(L * 0.68, C * 0.73, h + 2), cap: lch(L * 0.69, C * 0.66, h),
    fallBase: lch(L - 0.05, C, h + 2), fallLine: lch(0.96, C * 0.4, h - 10), fallLight: lch(L + 0.04, C * 0.8, h - 6),
    opacity: 0.82, glow: 0.35, lineOpacity: 0.9, fallOpacity: 0.85,
  };
  // water: how much contrast its pattern has (1: the bright sky blue; dark water a lot less)
  const k = Math.max(0.2, Math.min(1.1, (L - 0.22) / 0.434)), kk = Math.min(1, k);
  const lineL = Math.min(0.95, L + mix(0.1, 0.28, kk)), lineC = C * mix(1.05, 0.36, kk) + 0.008, lineH = Math.max(176, h - mix(32, 20, kk));
  return {
    body: lch(L, C, h), dark: lch(L - mix(0.035, 0.09, kk), C * 1.04, h + 5), line: lch(lineL, lineC, lineH),
    foam: lch(mix(0.8, 0.99, kk), mix(0.03, 0.006, kk), h - 10), emissive: lch(L * 0.46, C * 0.52, h + 7),
    cap: lch(L * 0.72, C * 0.87, h + 12),
    fallBase: lch(L + 0.02 * (1 - kk), C * 1.1, h + 8), fallLine: lch(Math.min(0.96, lineL + 0.02), lineC * 0.8, Math.max(176, lineH - 8)),
    fallLight: lch(L + mix(0.08, 0.136, kk), C * 0.74, h - 1),
    opacity: mix(0.86, 0.7, kk), glow: mix(0.12, 0.25, kk), lineOpacity: 0.92, fallOpacity: mix(0.88, 0.82, kk),
  };
}
const COLORS = ['body', 'dark', 'line', 'foam', 'emissive', 'fallBase', 'fallLine', 'fallLight', 'cap'];
// a palette with its colours as linear sRGB ([r, g, b], 0..1) and hex
function finish(fluid, p, name) {
  const out = { fluid, name, opacity: p.opacity, glow: p.glow, lineOpacity: p.lineOpacity, fallOpacity: p.fallOpacity, lch: p.body, hex: {} };
  for (const c of COLORS) { out[c] = oklchToLinear(p[c]); out.hex[c] = linearToHex(out[c]); }
  return out;
}

// The look before there is a world, and of each fluid's first anchor: today's colours exactly
// (so the cubes look as they did; render/materials.js FLUID_LOOK)
const CLASSIC = {
  [WATER]: { body: '#2c9ad8', dark: '#0c7cc0', line: '#c8f2ff', foam: '#f8fdff', emissive: '#08304e', cap: '#1f5d99',
    fallBase: '#3f8fe0', fallLine: '#d6f8ff', fallLight: '#7cc4f2', opacity: 0.7, glow: 0.25, lineOpacity: 0.92, fallOpacity: 0.82 },
  [LAVA]: { body: '#ff6a00', dark: '#4a1a0c', line: '#ffc030', foam: '#ffd870', emissive: '#ff4a00', cap: '#c2410a',
    fallBase: '#ff5a00', fallLine: '#ffc030', fallLight: '#6a240e', opacity: 1, glow: 1.1, lineOpacity: 1, fallOpacity: 1 },
  [ACID]: { body: '#7dff3a', dark: '#4fd024', line: '#d8ff9a', foam: '#d8ff9a', emissive: '#3a9a10', cap: '#4f9a24',
    fallBase: '#66e030', fallLine: '#eaffc8', fallLight: '#a0ff70', opacity: 0.82, glow: 0.35, lineOpacity: 0.9, fallOpacity: 0.85 },
};
// Sollmeldon's mud: black, a little warm, glossy lines between its cells, no glow; not see-through
const MUD_COLORS = { body: '#17130f', dark: '#0b0907', line: '#4a4036', foam: '#5a4e43', emissive: '#000000', cap: '#110e0b',
  fallBase: '#1c1712', fallLine: '#4a4036', fallLight: '#2a231d', opacity: 1, glow: 0, lineOpacity: 0.9, fallOpacity: 1 };
export function mudPalette() {
  const c = MUD_COLORS, out = { fluid: MUD, name: 'mud', opacity: c.opacity, glow: c.glow, lineOpacity: c.lineOpacity, fallOpacity: c.fallOpacity,
    lch: hexToOklch(c.body), hex: {} };
  for (const k of COLORS) { out[k] = hexToLinear(c[k]); out.hex[k] = c[k]; }
  return out;
}
export function classicPalette(fluid) {
  const c = CLASSIC[fluid], out = { fluid, name: 'classic', opacity: c.opacity, glow: c.glow, lineOpacity: c.lineOpacity, fallOpacity: c.fallOpacity,
    lch: hexToOklch(c.body), hex: {} };
  for (const k of COLORS) { out[k] = hexToLinear(c[k]); out.hex[k] = c[k]; }
  return out;
}

// a body colour between two of the family's anchors, jittered (R: its random stream)
function pickBody(fluid, anchors, R) {
  const names = anchors.filter(n => ANCHORS[fluid][n]);
  const i = Math.floor(R() * names.length), j = names.length > 1 ? (i + (R() < 0.5 ? 1 : names.length - 1)) % names.length : i;
  const t = R() * 0.5;
  return { lch: blendLch(hexToOklch(ANCHORS[fluid][names[i]]), hexToOklch(ANCHORS[fluid][names[j]]), t), name: t < 0.25 ? names[i] : names[j] };
}
function jitter(fluid, [L, C, h], R, amount = 1) {
  const [jl, jc, jh] = JITTER[fluid], [h0, h1] = HUE[fluid];
  return [L + (R() * 2 - 1) * jl * amount, C * (1 + (R() * 2 - 1) * jc * amount), Math.max(h0, Math.min(h1, h + (R() * 2 - 1) * jh * amount))];
}
// the palette of a world's theme stretch (starting at depth `at`) for a fluid in a slot at a depth
export function makePalette(seed, theme, fluid, at, depth, slot) {
  const { anchors, spread } = familyOf(theme, fluid);
  const R0 = mulberry32(hash32((seed >>> 0) ^ Math.imul(at + 1, 0x51ed270b) ^ Math.imul(fluid, 0x2c1b3c6d) ^ 0xf1d0));
  const shared = pickBody(fluid, anchors, R0), body0 = jitter(fluid, shared.lch, R0);
  if (slot === 0) return finish(fluid, derive(fluid, body0), shared.name);
  // a cube's own: towards another of the family's colours, by up to `spread`
  const R = mulberry32(hash32((seed >>> 0) ^ Math.imul(depth + 1, 0x7f4a7c15) ^ Math.imul(fluid * PAL_SLOTS + slot, 0x165667b1) ^ 0x9001));
  const other = pickBody(fluid, anchors, R), t = spread * (0.35 + 0.65 * R());
  const body = jitter(fluid, blendLch(body0, other.lch, t), R, 1.2);
  return finish(fluid, derive(fluid, body), t > 0.5 ? other.name : shared.name);
}

// every palette of a world (rows by palRow): themes, its theme stretches (themes/depth.js
// worldThemes); no seed: the classic look everywhere
export function worldPalettes(seed, themes) {
  const rows = new Array(PAL_ROWS);
  for (let row = 0; row < PAL_ROWS; row++) {
    const depth = rowDepth(row), fluid = rowFluid(row), slot = rowSlot(row);
    if (seed == null || !themes) { rows[row] = classicPalette(fluid); continue; }
    let at = 0;
    for (const s of themes) if (s.at <= depth) at = s.at;
    rows[row] = makePalette(seed, themeAt(depth, themes), fluid, at, depth, slot);
  }
  return rows;
}

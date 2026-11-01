// The large map's pictures (game/mappanel.js draws them on its canvas): a cube seen from above, the
// way the minimap knows it, only nearer. Every explored cube is a little picture of its ground made
// once from its map (thumbOf, kept with the map): each cell the colour its theme gives the ground
// at that height (themes/: `top`, lighter higher) or of its fluid (its palette's body colour,
// render/fluidpal.js), lit from the top left (a cell higher than the one up and left of it lighter,
// lower darker), a dark line where it drops by a cliff, a pale one where a fluid meets its bank,
// the ways' stairs and bridges in wood. No props: the shape of the land is what is read.
//
// The marks (stone, portal, crown, arrow ...) are drawn upright on top in screen pixels, in the
// minimap's colours (game/minimap.js): gold a way somewhere new, cyan a way explored, red one locked,
// green the open faces, violet the town portal; a woken rune stone an amber gem glowing, a sleeping
// one a hollow teal one.
import { N } from '../core/constants.js';
import { KIND_COLOR } from '../world/tiles.js';
import { themeOf } from '../themes/depth.js';
import { paletteOf } from '../render/fluidpal.js';
import { linearToHex } from '../themes/fluids.js';

export const T = 4;   // a thumbnail's pixels a cell
export const COLORS = { open: '#70d6aa', new: '#ffc94a', seen: '#5fd3ff', locked: '#ff3547', town: '#b98cff', quest: '#ffd34a',
  ember: '#ffa040', emberHi: '#ffe2bc', glass: '#86e0d2', glassHi: '#d8f6f0', outline: '#0b0c0d', ink: '#e3ece9', dim: '#98aaa5' };

const hex = s => { const v = parseInt(s.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const shade = (c, k) => c.map(x => Math.max(0, Math.min(255, Math.round(x * k))));
const css = ([r, g, b], a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

// the colour of the ground at height `top` (levels) in a theme: between its stops
function ground(theme, top, fallback) {
  const stops = theme?.top;
  if (!stops?.length) return fallback;
  if (top <= stops[0][0]) return hex(stops[0][1]);
  for (let i = 1; i < stops.length; i++) if (top <= stops[i][0]) {
    const [a, ca] = stops[i - 1], [b, cb] = stops[i];
    return mix(hex(ca), hex(cb), (top - a) / (b - a));
  }
  return hex(stops.at(-1)[1]);
}
const fluidColor = f => {
  try { return hex(linearToHex(paletteOf(f.pal ?? 0).body)); } catch { return [46, 134, 222]; }
};

// what is seen of cell c from above: its highest floor (not a cave's roof slab over it)
function topOf(map, c) {
  const col = map.cols?.[c];
  if (!col?.length) return null;
  for (let i = col.length - 1; i >= 0; i--) if (!col[i].roof) return col[i];
  return col.at(-1);
}

const thumbs = new WeakMap();
// The picture of a cube's ground (N * T pixels square), made once for its map
export function thumbOf(map, kind = 'meadow') {
  let canvas = thumbs.get(map);
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.width = canvas.height = N * T;
  const g = canvas.getContext('2d');
  let theme = null;
  try { theme = themeOf(map); } catch { /* (a map without its theme's stamp: the tile's colour) */ }
  const base = hex(KIND_COLOR[kind] ?? KIND_COLOR.meadow);
  const tops = Array.from({ length: N * N }, (_, c) => topOf(map, c));
  const h = c => tops[c] ? tops[c].top : -99;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const c = z * N + x, f = tops[c];
    if (!f) { g.fillStyle = '#07090a'; g.fillRect(x * T, z * T, T, T); continue; }
    let col = f.fluid ? fluidColor(f) : ground(theme, f.top, base);
    // lit from the top left: higher than the cell up and left of it, lighter
    const back = x > 0 && z > 0 ? h(c - N - 1) : x > 0 ? h(c - 1) : z > 0 ? h(c - N) : f.top;
    const d = f.top - (back < -50 ? f.top : back);
    col = shade(col, f.fluid ? 1 : 1 + Math.max(-0.28, Math.min(0.22, d * 0.07)));
    g.fillStyle = css(col); g.fillRect(x * T, z * T, T, T);
    // the ways' stairs and bridges (map.pieces): wood over it
    if (map.pieces?.[c]?.length && !f.fluid) { g.fillStyle = 'rgba(176,136,80,.55)'; g.fillRect(x * T + 1, z * T + 1, T - 2, T - 2); }
  }
  // the edges between cells: a cliff dark on its low side, a bank pale round its fluid
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const c = z * N + x, f = tops[c];
    if (!f) continue;
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const o = tops[nz * N + nx];
      const lx = dx > 0 ? x * T + T - 1 : dx < 0 ? x * T : x * T, lz = dz > 0 ? z * T + T - 1 : dz < 0 ? z * T : z * T;
      const w = dx ? 1 : T, hh = dz ? 1 : T;
      if (f.fluid && o && !o.fluid) { g.fillStyle = 'rgba(220,245,255,.45)'; g.fillRect(lx, lz, w, hh); }
      else if (o && !f.fluid && o.top - f.top >= 2) { g.fillStyle = 'rgba(8,10,10,.55)'; g.fillRect(lx, lz, w, hh); }
      else if (!o) { g.fillStyle = 'rgba(8,10,10,.7)'; g.fillRect(lx, lz, w, hh); }
    }
  }
  thumbs.set(map, canvas);
  return canvas;
}

// a cut square (the menus' cut corners, docs/ui.md) at x, y, s wide, its corners cut by k
export function cutSquare(g, x, y, s, k) {
  g.beginPath();
  g.moveTo(x + k, y); g.lineTo(x + s - k * 0.4, y); g.lineTo(x + s, y + k * 0.4); g.lineTo(x + s, y + s - k);
  g.lineTo(x + s - k, y + s); g.lineTo(x + k * 0.4, y + s); g.lineTo(x, y + s - k * 0.4); g.lineTo(x, y + k); g.closePath();
}

// a gem: a diamond r tall, filled or hollow, with a halo when it glows
export function gem(g, x, y, r, { fill = null, stroke = COLORS.outline, glow = null, width = 1.5 } = {}) {
  if (glow) {
    const halo = g.createRadialGradient(x, y, 0, x, y, r * 3);
    halo.addColorStop(0, glow); halo.addColorStop(1, 'rgba(255,160,64,0)');
    g.fillStyle = halo; g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  }
  g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.72, y); g.lineTo(x, y + r); g.lineTo(x - r * 0.72, y); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  g.strokeStyle = stroke; g.lineWidth = width; g.lineJoin = 'round'; g.stroke();
  if (fill) {   // its upper left face lit
    g.beginPath(); g.moveTo(x, y - r); g.lineTo(x - r * 0.72, y); g.lineTo(x, y); g.closePath();
    g.fillStyle = 'rgba(255,255,255,.28)'; g.fill();
  }
}

// a triangle: a ring up (up) or a well down
export function tri(g, x, y, r, up, color) {
  g.beginPath();
  if (up) { g.moveTo(x, y - r); g.lineTo(x + r, y + r * 0.75); g.lineTo(x - r, y + r * 0.75); }
  else { g.moveTo(x, y + r); g.lineTo(x + r, y - r * 0.75); g.lineTo(x - r, y - r * 0.75); }
  g.closePath(); g.fillStyle = color; g.fill(); g.strokeStyle = COLORS.outline; g.lineWidth = 1.5; g.stroke();
}

// a crown (the boss of the way down), r wide
export function crown(g, x, y, r, color) {
  g.beginPath();
  g.moveTo(x - r, y + r * 0.55); g.lineTo(x - r, y - r * 0.35); g.lineTo(x - r * 0.5, y + r * 0.05); g.lineTo(x, y - r * 0.6);
  g.lineTo(x + r * 0.5, y + r * 0.05); g.lineTo(x + r, y - r * 0.35); g.lineTo(x + r, y + r * 0.55); g.closePath();
  g.fillStyle = color; g.fill(); g.strokeStyle = COLORS.outline; g.lineWidth = 1.5; g.lineJoin = 'round'; g.stroke();
}

// a player: an arrow at x, y facing yaw (world: towards sin, cos; north up), r long
export function arrow(g, x, y, yaw, r, color) {
  if (!Number.isFinite(yaw)) { g.beginPath(); g.arc(x, y, r * 0.55, 0, Math.PI * 2); g.fillStyle = color; g.fill(); g.strokeStyle = COLORS.outline; g.lineWidth = 1.5; g.stroke(); return; }
  const fx = Math.sin(yaw), fy = Math.cos(yaw), at = (f, s) => [x + fx * f - fy * s, y + fy * f + fx * s];
  g.beginPath(); g.moveTo(...at(r, 0)); g.lineTo(...at(-r * 0.7, r * 0.7)); g.lineTo(...at(-r * 0.3, 0)); g.lineTo(...at(-r * 0.7, -r * 0.7)); g.closePath();
  g.fillStyle = color; g.fill(); g.strokeStyle = COLORS.outline; g.lineWidth = 1.5; g.lineJoin = 'round'; g.stroke();
}

// the quest's pin
export function pin(g, x, y, r) {
  g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.75, y); g.lineTo(x, y + r); g.lineTo(x - r * 0.75, y); g.closePath();
  g.fillStyle = COLORS.quest; g.fill(); g.strokeStyle = COLORS.outline; g.lineWidth = 1.5; g.stroke();
}

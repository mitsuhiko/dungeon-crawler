// Fluid contact uses the exposed landing surface, not just the column's fluid.
// Lava burns and acid dissolves on entry. Water only drowns a body whose head goes under: the
// player wades through water shallower than their head stands (HEAD_Y, measured off the
// character's rig), slowed by it, and an enemy through water shallower than its body is tall
// (`headOf`); one that `swims` (Squarlo, the Squirtles) never drowns, and one that is `lavaproof`
// (Foggery, his Fire-cats) is not burned by lava.
// Standing fluids fill a cube up to one level, everything under it is in it, any floor or
// structure: a trial's rising fluid (core/trials.js, game/trials.js) over the whole cube, and a
// boss's tide (game/tide.js) inside its box of cells. A tide may stand at a height of its own in
// each cell (`ys`: Sollmeldon's mud, game/mud.js, which runs over the ground as it flows: NaN where
// a cell is dry).
import { LH, N, WATER, LAVA, HEAD_Y, MUD } from '../core/constants.js';

let trial = null;   // { y (its surface), fluid } or null
let tide = null;    // { y, fluid, box: [x0, z0, x1, z1] (cells, x1 / z1 past the last), ys? } or null
let cells = null;   // a tide with `ys`, per cell: { ...tide, y: its surface there } or null (dry)
export const setTrialFluid = f => { trial = f; };
export const trialFluid = () => trial;
export function setTide(f) {
  tide = f;
  cells = f?.ys ? Array.from({ length: N * N }, (_, i) => Number.isFinite(f.ys[i]) ? { ...f, y: f.ys[i] } : null) : null;
}
export const tideFluid = () => tide;

// the standing fluid at cell i (or the point x, z): { y, fluid } or null
function standing(i) {
  if (!tide) return trial;
  const x = i % N, z = (i / N) | 0, [x0, z0, x1, z1] = tide.box;
  const inBox = i >= 0 && x >= x0 && z >= z0 && x < x1 && z < z1;
  if (!inBox) return trial;
  const t = cells ? cells[i] : tide;
  if (!t) return trial;
  return !trial || t.y > trial.y ? t : trial;
}
export const standingAt = (x, z) => standing(x >= 0 && z >= 0 && x < N && z < N ? Math.floor(z) * N + Math.floor(x) : -1);

// does `depth` (of fluid over the feet) take a body whose head stands `head` high? Water only
// over the head; lava and acid at once
export const deep = (fluid, depth, head) => depth > 0 && (fluid !== WATER || depth > head);

// the fluid the body with its feet at y (over the ground gr) is lost in (0 when dry, wading, or
// above the surface); head: how high its head stands over its feet
export function inFluid(gr, y, head = HEAD_Y) {
  const own = fixedFluid(gr, y, head);
  if (own) return own;
  const s = standing(gr.i ?? -1);
  return s && deep(s.fluid, s.y - y, head) ? s.fluid : 0;
}
// ... in the ground's own fluid only (a lava, acid or deep water floor: there for good), not a
// standing one that rises and falls (a trial's, a boss's tide)
export function fixedFluid(gr, y = gr.h, head = HEAD_Y) {
  const f = gr.s;
  return f && !f.kind && f.fluid && deep(f.fluid, f.surf * LH - y, head) ? f.fluid : 0;
}
// how deep the water the feet at y stand in is (0: dry; for the slowing of wading)
export function wading(gr, y) {
  const f = gr.s, s = standing(gr.i ?? -1);
  const own = f && !f.kind && f.fluid === WATER ? f.surf * LH - y : 0, over = s?.fluid === WATER ? s.y - y : 0;
  return Math.max(0, own, over);
}

// the surface of the fluid at the ground gr (for the splash, the body sinking)
export function fluidSurface(gr) {
  const s = standing(gr.i ?? -1);
  return Math.max(gr.s && !gr.s.kind && gr.s.fluid ? gr.s.surf * LH : -Infinity, s ? s.y : -Infinity);
}

// is the ground at height h (in cell i) under a standing fluid too deep to wade? (walking stops
// at its edge)
export function underTrialFluid(h, i = -1) {
  const s = standing(i);
  return !!s && deep(s.fluid, s.y - h - 0.02, HEAD_Y);
}
// is a static fluid floor deeper than the head stands at its floor top? (lava and acid always)
export const tooDeep = f => deep(f.fluid, f.surf * LH - f.top * LH, HEAD_Y);

// how much of the head's height walking keeps out of the water: the probes that hold a walking
// body back reach a radius past its centre (physics/canmove.js), which is where it drowns
export const WADE_MARGIN = 0.05;
// may a walking body set foot on the ground gr? Water as deep as the head stands but for
// WADE_MARGIN, measured where the foot goes (a sloping bed is waded down as far as that, not
// judged by its cell's deepest corner); no lava or acid floor at all; no ground under a standing
// fluid over the head
export function wadeable(gr) {
  const f = gr.s;
  if (f && !f.kind && f.fluid && (f.fluid === WATER ? deep(WATER, f.surf * LH - gr.h, HEAD_Y - WADE_MARGIN) : tooDeep(f))) return false;
  return !underTrialFluid(gr.h, gr.i);
}

// how high an enemy's head stands over its feet: its body
export const headOf = profile => profile.bodyHeight;
// the standing fluid enemy e is lost in (0: none, it wades, or it swims; one `mudborn` is lost in
// no mud)
export function enemyUnder(e) {
  if (e.profile.swims) return 0;
  if (e.profile.mudborn && tide?.look === MUD) return 0;   // (Sollmeldon in his own mud, however deep)
  const s = standingAt(e.x, e.z);
  if (!s || (s.fluid === LAVA && e.profile.lavaproof)) return 0;   // (Foggery and his Fire-cats wade through his lava)
  return deep(s.fluid, s.y - e.y, headOf(e.profile)) ? s.fluid : 0;
}

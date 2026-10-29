// Where the surface of the fluid a body is in is drawn: under the level physics goes by, rising
// and falling with the tide (render/surface.js; Sollmeldon's mud at its level, render/mud.js).
// For the heroes' silhouettes, cut off under it (render/figure.js ghostMaterial), and for the
// rings on it (render/ripples.js), in its foam's colour.
import { LH, WATER, MUD } from '../core/constants.js';
import { state } from '../game/state.js';
import { groundAt } from '../physics/collide.js';
import { standingAt } from '../physics/fluid.js';
import { FLUID_LOOK, WIND } from './materials.js';
import { tideY, SINK } from './surface.js';
import { palRow, MUD_ROW } from '../themes/fluids.js';

// where the surface of a fluid (of a look: 0 clear) whose level is `level` is drawn now
export function drawnSurface(level, fluid = WATER, look = 0) {
  const S = look === MUD ? null : FLUID_LOOK[fluid]?.cells;
  return S ? level - SINK + tideY(S, WIND.value) : level;
}

// The fluid a body with its feet at (x, y, z) is in, the cube's own or a standing one (a trial's,
// a boss's tide): { level (physics), fluid, look, row: its palette (themes/fluids.js) } or null
// (none over its feet, or no cube)
export function fluidAround(x, y, z) {
  const m = state.map;
  if (!m) return null;
  const f = groundAt(x, z, y + 0.1, 0).s, s = standingAt(x, z);
  const own = f && !f.kind && f.fluid ? f.surf * LH : -Infinity, over = s ? s.y : -Infinity;
  if (Math.max(own, over) <= y) return null;
  if (over > own) {
    const look = s.look ?? 0;
    return { level: over, fluid: s.fluid, look, row: look === MUD ? MUD_ROW : m.fluidRows?.[s.fluid] ?? palRow(m.depth ?? 0, s.fluid, 0) };
  }
  return { level: own, fluid: f.fluid, look: 0, row: f.pal ?? m.fluidRows?.[f.fluid] ?? palRow(m.depth ?? 0, f.fluid, 0) };
}

// ... where its surface is drawn; NONE: in none
export const NONE = -1e4;
export function waterlineAt(x, y, z) {
  const w = fluidAround(x, y, z);
  return w ? drawnSurface(w.level, w.fluid, w.look) : NONE;
}

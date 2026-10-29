// Which colours the fluids in a cube take (themes/fluids.js palettes): one palette row per kind
// of fluid for the whole cube, so its water is all of one colour, falls and pools alike. Every
// fluid floor gets its row (f.pal), every fall the rows at its top and at its foot (fall.pal).
// A pool of mud (water with the look of mud: cubegen/mudpools.js) takes the mud's (MUD_ROW).
//   - a fluid that runs on into another cube (a river or a sea at the cube's edge, a spout's
//     channel or the pool under a spout from beside, a fall out through the bottom) or that a
//     trial raises through the room: its depth's running fluid (slot 0, the same through a
//     stretch of depths with one theme), so it keeps its colour across every face
//   - else, with a fall coming in from the depth above: that depth's running fluid, the colour
//     the fall started in
//   - else one of its depth's other slots, from the cube's key
// A fall from above into a cube whose fluid runs on keeps the upper depth's colour at its top and
// turns into this cube's on the way down (the same, unless the theme changes between the two
// depths). From the map alone, so it can be worked out again for any cube (world/world.js cube).
import { N, MUD } from '../core/constants.js';
import { hash32 } from '../core/util.js';
import { depthOf } from '../themes/depth.js';
import { palRow, PAL_SLOTS, MUD_ROW } from '../themes/fluids.js';

const strHash = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return hash32(h >>> 0); };

// the palette row of each kind of fluid in map m: { [fluid]: row }
export function fluidRows(m) {
  const depth = m.depth ?? depthOf(m.key ?? '0,0,0'), runsOn = new Set(), fromAbove = new Set(), kinds = new Set();
  for (const f of m.floors || []) {
    if (!f.fluid || f.crust || f.look === MUD) continue;
    kinds.add(f.fluid);
    if (f.x === 0 || f.z === 0 || f.x === N - 1 || f.z === N - 1) runsOn.add(f.fluid);
  }
  for (const fl of m.falls || []) {
    kinds.add(fl.type);
    if (fl.in) fromAbove.add(fl.type);
    else if (fl.out || fl.spout) runsOn.add(fl.type);
  }
  if (m.trial?.fluid) { kinds.add(m.trial.fluid); runsOn.add(m.trial.fluid); }
  const rows = {};
  for (const t of kinds) rows[t] = runsOn.has(t) ? palRow(depth, t, 0) : fromAbove.has(t) ? palRow(depth - 1, t, 0)
    : palRow(depth, t, 1 + strHash(`${m.key}|${t}`) % (PAL_SLOTS - 1));
  return rows;
}

export function stampFluidBodies(m) {
  const depth = m.depth ?? depthOf(m.key ?? '0,0,0'), rows = m.fluidRows = fluidRows(m);
  for (const f of m.floors || []) if (f.fluid && !f.crust) f.pal = f.look === MUD ? MUD_ROW : rows[f.fluid];
  for (const fl of m.falls || []) fl.pal = [fl.in ? palRow(depth - 1, fl.type, 0) : rows[fl.type], rows[fl.type]];
  return m;
}

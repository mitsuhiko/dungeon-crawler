// Where a fluid's surface is drawn: one rule for every fluid, the cube's own (render/floors.js,
// the parts of the cube and its proxies) and the standing ones that rise and fall through a room
// (a trial's, a boss's tide: render/trials.js), and for everything drawn on a surface (what rides
// on it where a fall lands, render/falls.js; the cutaway's fluid caps, section.js; floating props,
// propplace.js; splashes).
//
// A fluid's level is the height physics goes by (physics/fluid.js: a fixed fluid's surf * LH, a
// standing fluid's y). Its surface rests SINK under its level and its swell (the tide and the
// waves, swellGLSL) moves it from `lift` over its rest height down to `tide + ripple` under that:
// it always stays under its level. Ground right at a fluid's level is dry (physics: a body
// standing there is not in it), so it stays out of the water, and a bank at the level is never
// washed over. The price: a fluid that takes you at any depth (lava, acid) is drawn up to
// SINK - lift + tide + ripple (lava 0.09, acid 0.13 world units) under where physics has it.
//
// Pure (no three.js): the world worker builds the cube's fluids with it.
import { N, LH, WATER, LAVA, ACID, MUD, drawnFluid } from '../core/constants.js';

// How each fluid's surface moves: the whole of it rises and falls with the tide, `tide` from high
// to low water (world units) every `period` seconds, a minor pattern of waves `ripple` high
// (crest to trough) over it; the highest crest stands `lift` over the rest height (keep it under
// SINK). The banks stay wet where the water has just been (`wet`: how dark), drying off `dry`
// world units a second (lava: a glowing seam instead).
export const FLUID_MOTION = {
  [WATER]: { tide: 0.2, period: 7, ripple: 0.02, lift: 0.02, wet: 0.55, dry: 0.012 },
  [LAVA]: { tide: 0.035, period: 11, ripple: 0.008, lift: 0.012, wet: 0, dry: 0.01 },
  [ACID]: { tide: 0.07, period: 5, ripple: 0.016, lift: 0.016, wet: 0.45, dry: 0.01 },
  // (Sollmeldon's mud, a look only: heavy, hardly moving, leaving the banks dark a long while)
  [MUD]: { tide: 0.025, period: 9, ripple: 0.008, lift: 0.008, wet: 0.5, dry: 0.02 },
};

export const SINK = 0.06;
// the rest height of the surface of a fluid at `level` (world units)
export const restY = level => level - SINK;

// The swell of a fluid's surface (its FLUID_MOTION S) at p (the cube's coordinates, world units)
// at time tm: tideY the tide (the whole surface together), swellW the minor waves (-1..1, about
// 3.5 units from crest to crest), swellY where the surface is there, over its rest height (the
// tide and the waves under it: their crests reach `lift`), swellG the waves' slope, finer ripples
// too (for the shading only).
const TAU = Math.PI * 2;
// (the waves' slope alone, the same for every fluid: also for what lies under them, render/underwater.js)
export const WAVES_GLSL = `
  const vec2 SW1 = vec2(1.71, 0.76), SW2 = vec2(-0.9, 1.62), SW3 = vec2(1.26, -1.44), SW4 = vec2(3.4, -2.0), SW5 = vec2(-2.3, -3.6);
  vec2 swellG(vec2 p, float tm) {
    return (0.45 * SW1 * cos(dot(p, SW1) + tm * 1.3) + 0.35 * SW2 * cos(dot(p, SW2) + tm * 1.05 + 1.3) + 0.2 * SW3 * cos(dot(p, SW3) + tm * 1.7 + 2.1)
      + 0.12 * SW4 * cos(dot(p, SW4) + tm * 2.3 + 0.7) + 0.1 * SW5 * cos(dot(p, SW5) + tm * 2.0 + 4.0)) * 0.55;
  }
`;
export const swellGLSL = S => WAVES_GLSL + `
  float tideY(float tm) { return ${S.lift.toFixed(4)} + ${(S.tide / 2).toFixed(4)} * (sin(tm * ${(TAU / S.period).toFixed(5)}) - 1.0); }
  float swellW(vec2 p, float tm) {
    return 0.45 * sin(dot(p, SW1) + tm * 1.3) + 0.35 * sin(dot(p, SW2) + tm * 1.05 + 1.3) + 0.2 * sin(dot(p, SW3) + tm * 1.7 + 2.1);
  }
  float swellY(vec2 p, float tm) { return tideY(tm) + ${(S.ripple / 2).toFixed(4)} * (swellW(p, tm) - 1.0); }
`;
export const tideY = (S, tm) => S.lift + S.tide / 2 * (Math.sin(tm * TAU / S.period) - 1);
// The wet line: how high the banks are still wet, for every fluid alike (the cube's own,
// materials.js tickTides; a standing one, render/trials.js): the highest its surface stood, less
// what has dried off since (S.dry a second), never more than WET_REACH over where it stands now
// (a fluid that drains away leaves a band that follows it down). wet: the line so far (null: none
// yet), high: where the surface stands now, dt: the seconds since (heights: world units).
export const WET_REACH = 0.35;
export const stepWet = (S, wet, high, dt) => wet == null ? high : Math.min(high + WET_REACH, Math.max(high, wet - S.dry * dt));
// where the surface of fluid t at `level` stands at time tm (the tide, not the waves)
export const surfaceY = (t, level, tm) => restY(level) + tideY(FLUID_MOTION[t], tm);
// the lowest and highest the surface of fluid t at `level` ever stands
export const surfaceRange = (t, level) => {
  const S = FLUID_MOTION[t];
  return [restY(level) + S.lift - S.tide - S.ripple, restY(level) + S.lift];
};

// The low-water line of the clear fluids (water, acid) in each cell of map m: the lowest their
// surface ever sinks to (surfaceRange), and their bed; null where none (the top fluid of a column,
// as render/wet.js waterUniforms fixed). What lies under it wavers with the waves, what stands
// over it never does (render/underwater.js), so the solids are split along it (cubegeo.js).
// What lies down to BELOW under the bed moves with it, deeper nothing does.
export const CLEAR = [WATER, ACID], BELOW = 0.15;
export function lowWaterLines(m) {
  return m.cols.slice(0, N * N).map(col => {
    const f = col.filter(g => g.fluid && !g.crust).at(-1);
    return f && CLEAR.includes(drawnFluid(f)) ? { low: surfaceRange(f.fluid, f.surf * LH)[0], bed: Math.min(...f.cs) } : null;
  });
}

// Two fluids in one place: a standing fluid (a trial's, a boss's tide) over the cube's own. In a
// column where the cube's own fluid takes the standing one's level (its bed under it, its own
// level at or over it), the cube's own is drawn there and the standing one is not (ownTakes;
// section.js WATER_OWN); where the standing one stands over the cube's own (ownUnder), in its
// box, the standing one is drawn and the cube's own is not (materials.js cellMaterial `over`).
// So no column ever shows two surfaces at once. level: the standing fluid's (world units).
const OVERLAP = 1e-3;
export const ownTakes = (col, level) => col.some(f => f.fluid && !f.crust && f.top * LH < level && f.surf * LH >= level - OVERLAP);
export const ownUnder = (ownLevel, level) => ownLevel < level - OVERLAP;

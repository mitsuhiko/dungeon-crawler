// What the ground under the player sounds like (the sounds: audio/footsteps.js), and how much it
// holds the feet (mireOf). Built
// structures say what they are made of; terrain goes by the depth's theme and the height (as
// its colours do, render/palette.js), fluid banks are mud (scorched gravel by lava) and the
// paths through the town are dirt.
import { LAVA } from './constants.js';
import { BRIDGE_STYLES } from '../themes/builds.js';

// learn: sound.html#recipe (see learn/README.md)
export const SURFACES = ['grass', 'dirt', 'gravel', 'snow', 'ice', 'mud', 'slime', 'stone', 'wood', 'rope', 'iron'];

// theme (by its prop set) -> surface, or [[from level, surface], ...]
const GROUND = {
  meadow: [[0, 'grass'], [15, 'gravel']],   // rock on the highest tops
  peaks: [[0, 'gravel'], [3, 'snow']],
  badlands: 'dirt', roots: 'dirt', frozen: 'ice', swamp: 'mud', nests: 'stone',
  mines: 'gravel', ruins: 'dirt', volcanic: 'gravel', abyss: 'stone',
  clouds: 'snow', lagoon: [[0, 'dirt'], [6, 'grass']], karst: [[0, 'grass'], [15, 'stone']],   // sand on the shores
  highlands: [[0, 'grass'], [13, 'gravel'], [17, 'snow']], saltflats: 'snow',   // salt crust crunches
  grotto: 'dirt', hive: 'mud', ossuary: 'stone', forge: 'gravel', cenote: 'dirt',
  darkforest: [[0, 'dirt'], [3, 'grass'], [16, 'stone']],   // soft earth and needles, moss higher up
  slime: [[0, 'slime'], [16, 'stone']],   // slimy moss, bare rock on the highest tops
};

// a built floor's role (its `surface`, themes/surfaces.js) -> surface
const BUILT = { masonry: 'stone', paving: 'stone', trim: 'stone', crust: 'gravel' };

function terrain(props, level) {
  const g = GROUND[props] ?? GROUND.meadow;
  if (typeof g === 'string') return g;
  let s = g[0][1];
  for (const [from, name] of g) if (level >= from) s = name;
  return s;
}

// distance from (x, z) to the polyline `points` ([[x, z], ...])
function polylineDistance(points, x, z) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

// support: the floor or structure piece underfoot (physics/collide.js groundAt), map: the
// cube's map, props: its theme's prop set; null when there is nothing underfoot
export function surfaceAt(support, map, props, x, z) {
  if (!support) return null;
  if (support.run) {
    const r = support.run;
    return r.kind === 'bridge' ? BRIDGE_STYLES[r.style]?.surface ?? 'wood' : r.wood ? 'wood' : 'stone';   // stairs and landings
  }
  if (map?.interior) return 'wood';   // plank floors inside houses
  if (support.surface) return BUILT[support.surface] ?? 'stone';   // built ground (themes/surfaces.js)
  const paths = map?.town?.paths;
  // a path ribbon reaches `width` to either side (render/floors.js buildClearingPaths)
  if (paths?.some(p => polylineDistance(p.points, x, z) <= p.width)) return 'dirt';
  const bank = support.link?.find(g => g?.fluid);
  if (bank) return bank.fluid === LAVA ? 'gravel' : 'mud';
  return terrain(props, support.top);
}

// How much the ground slows whoever walks on it: the slime marsh's slime (its theme's `mire`,
// themes/index.js) holds every foot a little, the player's (physics/move.js) and the enemies'
// (game/enemyai.js) alike; structures (bridges, stairs) and everywhere else do not.
export const mireOf = (surface, theme) => surface === 'slime' ? theme?.mire ?? 1 : 1;
// ... an enemy's (game/enemyai.js) in `map` of `theme`: as the player's, but not the slime's own
// creatures (`slimeborn`), nor what floats (`hover`), rides the air or goes under the floor
export function enemyMire(e, map, theme) {
  if (!theme?.mire || e.profile.slimeborn || e.profile.hover || e.riding || e.under || !e.f) return 1;
  return mireOf(surfaceAt(e.f, map, theme.props, e.x, e.z), theme);
}

// A puzzle's deck (docs/trials.md "Puzzles"): a flat field of w x h cells at one level, a rim
// round it (RIM levels up: nobody climbs or jumps it) with gaps where the puzzle says (its entry,
// its goal's gate), and round that a walkway (two cells wide in a room of its own; in a sunken
// room's platform, what the platform leaves), all at one level. The field and the rim are kept (no
// slabs, sites, pools or props) and nothing is built onto them (the puzzle is the only way in).
//   deck: { x0, z0 (the field's first cell), w, h, level, field: [cells], rim: [cells], walk: [cells],
//           cell(x, z) (field coordinates -> cube cell), side(towards) (the rim side facing a point) }
import { N } from '../../core/constants.js';
import { idx, clamp } from '../../core/util.js';

export const RIM = 3;
const SD = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// the field cell at the edge of side `side` at position t
export const edgeOf = (d, side, t) => [[d.w - 1, t], [0, t], [t, d.h - 1], [t, 0]][side];

// Lay a deck of w x h (its field) into the room.
//   towards: the point (cells) the entry side should face (the way in)
//   within: { x0, z0, x1, z1 (the cells the rim may take, inclusive), level, walk: 0, free: [sides] }
//           a platform (cubegen/trials/sunken.js): the deck at that level, in that rectangle, no
//           walkway of its own, a strip of the platform left free on those sides
//   default: anywhere in the room as far from the portals' pads as it fits, the walkway two wide
// null: none fits.
// rim: false: no rim, the ring round the field is walkway at the deck's level (a puzzle you walk onto)
export function placeDeck(ctx, w, h, towards, within = null, rim = true) {
  const { lvl0, void0, R } = ctx, margin = within ? within.walk ?? 0 : 2;
  const pads = ctx.spec.portals.filter(p => p.dir < 4).map(p => [[N - 2, p.pos], [1, p.pos], [p.pos, N - 2], [p.pos, 1]][p.dir]);
  const [lx, lz, hx, hz] = within ? [within.x0, within.z0, within.x1, within.z1] : [2, 2, N - 3, N - 3];
  const options = [];
  for (let rz = lz; rz + h + 1 <= hz; rz++) for (let rx = lx; rx + w + 1 <= hx; rx++) {
    const cx = rx + (w + 2) / 2, cz = rz + (h + 2) / 2;
    // (within: the sides that must keep a strip of the platform free beside the rim)
    if (within?.free?.some(side => [rx + w + 1 >= hx, rx <= lx, rz + h + 1 >= hz, rz <= lz][side])) continue;
    const near = pads.length ? Math.min(...pads.map(([px, pz]) => Math.max(Math.abs(px - cx) - (w + 2) / 2, Math.abs(pz - cz) - (h + 2) / 2))) : 9;
    if (near < (within ? 0 : 2)) continue;   // (on a platform it only keeps off the pads)
    // in a platform: away from where the way comes in (`towards`), leaving room there
    const score = within ? Math.hypot(cx - towards[0], cz - towards[1]) + R() : near + R() * 2;
    options.push({ rx, rz, score });
  }
  if (!options.length) return null;
  options.sort((a, b) => b.score - a.score);
  const { rx, rz } = options[0], x0 = rx + 1, z0 = rz + 1;
  const field = [], ring = [], walk = [];
  for (let z = rz - margin; z <= rz + h + 1 + margin; z++) for (let x = rx - margin; x <= rx + w + 1 + margin; x++) {
    if (x < 1 || z < 1 || x > N - 2 || z > N - 2) continue;
    const inField = x >= x0 && z >= z0 && x < x0 + w && z < z0 + h, inRim = x >= rx && z >= rz && x <= rx + w + 1 && z <= rz + h + 1;
    (inField ? field : inRim ? ring : walk).push(idx(x, z));
  }
  const all = [...field, ...ring, ...walk];
  const level = within ? within.level : clamp(Math.round(all.reduce((s, c) => s + lvl0[c], 0) / all.length), 3, 10);
  // (the walkway is flat ground like any other: a vault's reward site may stand on it)
  for (const c of all) { void0[c] = 0; lvl0[c] = level; if (!walk.includes(c) && (rim || !ring.includes(c))) ctx.keep.add(c); }
  if (rim) for (const c of ring) lvl0[c] = level + RIM;
  const deck = { x0, z0, w, h, level, field, rim: rim ? ring : [], walk: rim ? walk : [...ring, ...walk], cell: (x, z) => idx(x0 + x, z0 + z) };
  // the side of the field facing a point
  deck.side = ([px, pz]) => {
    const cx = x0 + w / 2, cz = z0 + h / 2, dx = px - cx, dz = pz - cz;
    return Math.abs(dx) / w > Math.abs(dz) / h ? (dx > 0 ? 0 : 1) : (dz > 0 ? 2 : 3);
  };
  for (const [name, list] of [['trialKeep', all], ['noBuild', [...field, ...deck.rim]], ['noFence', [...field, ...ring]]]) {
    ctx[name] ??= new Set();
    for (const c of list) ctx[name].add(c);
  }
  return deck;
}

// open a gap in the rim beside field cell (x, z) on side `side` (back down to the deck's level)
export function openGap(ctx, deck, x, z, side) {
  const [dx, dz] = SD[side], c = idx(deck.x0 + x + dx, deck.z0 + z + dz);
  ctx.lvl0[c] = deck.level;
  ctx.noBuild.delete(c);
  return c;
}

// a puzzle room's ways: no structure onto the rim or the field (walks and drops only)
export function deckRoute(ctx) {
  const movesFrom = ctx.movesFrom, no = f => !f.landing && ctx.noBuild?.has(f.c);
  ctx.movesFrom = (f, ...rest) => movesFrom(f, ...rest).filter(m => m.kind === 'walk' || m.kind === 'drop' || (!no(f) && !no(m.to)
    && !m.cells.some(c => ctx.noBuild?.has(c))));
}

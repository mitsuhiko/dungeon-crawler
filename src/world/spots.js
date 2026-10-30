// Spots: places kept free in the world where somebody or something may stand later
// (docs/quests.md, "NPCs and spots"). Planned from the seed alone, per depth, whether a quest
// ever uses them or not, so the world never depends on the quests; the game decides at runtime
// who or what stands on one (an NPC, a quest item, nothing). Each depth gets:
//   hide  6-8 hiding places, from easy to hard to get to (`tier`, below)
//   seat  2 places for one NPC sitting or standing about
//   camp  on every third depth (1, 4, 7, ...), one camp near where the depth begins: a fire,
//         room for three people around it
//   outpost  on six depths, one in each stretch of them (OUTPOST_BANDS), in a room on the way:
//         somebody's supply cart with level ground round it, to defend (docs/quests.md, Defense)
//   glass on the depths with the glassmaker's glass (core/glass.js), two: where a bubble of his
//         star-glass came to rest (game/intro.js), one on the way (`way`), one hidden off it;
//         `glass` its number (0, 1), which says its recording (core/glass.js glassAt). Never a
//         quest's: nobody stands there and nothing else lies there. Depth 0 has a third, on the
//         way past the beginning's rock: `part` 'camp', the recording that came up with his sword.
// A spot names its cube; where in the cube it lies is up to the cube's generator
// (cubegen/spots.js), which keeps it clear and reachable both ways like a reward site.
//
// tier: how hard a spot is to get to, 0 (on the way, early) to 4 (far off the way, high up,
// behind the depth's gates): one for every side guardian or the horde the way to it leads past,
// one for a branch room, one for a room with a reward site, two for the high places (a
// tableland, a pinnacle, a lone peak, a great lake's islet, a large area, a span's island).
import { hash32, mulberry32 } from '../core/util.js';
import { isTown } from './town.js';
import { key, hashKey } from './coords.js';
import { glassAt } from '../core/glass.js';

export const SPOT_KINDS = ['hide', 'seat', 'camp', 'outpost', 'glass'];
export const OUTPOST_BANDS = [[1, 3], [4, 6], [7, 9], [10, 12], [13, 15], [16, 19]];
// the depth of a stretch that has its outpost, from the seed
export const outpostDepth = (seed, band) => { const [a, b] = OUTPOST_BANDS[band]; return a + hash32(seed ^ Math.imul(band + 1, 0x0f7905)) % (b - a + 1); };
export const hasOutpost = (seed, d) => OUTPOST_BANDS.some(([a, b], i) => d >= a && d <= b && outpostDepth(seed, i) === d);
export const MAX_TIER = 4;
export const SEATS = 2;
export const HIDES = [6, 8];
export const campDepth = d => d % 3 === 1;

// the spots of one depth: a map cube key -> [spot], in the order the generator places them
// (camps first, then seats, then hiding places)
export function planSpots(seed, layout) {
  const d = layout.depth, R = mulberry32(hash32(seed ^ Math.imul(d + 1, 0x5b07c3) ^ 0x5b075));
  const route = layout.route, obstacles = [...layout.guardians].filter(([, g]) => g.role === 'side').map(([k]) => k)
    .concat([...layout.hordes.keys()]).map(k => route.indexOf(k));
  const high = k => k === layout.pinnacle || k === layout.peak || k === layout.lake || layout.heightCells?.has(k)
    || layout.areaCells?.has(k) || layout.spanCells?.get(k)?.role === 'island';
  // only rooms made by the ordinary generator (not the town's, nor guardian arenas),
  // not the gorge cubes of a span (mostly air)
  // nor the rooms of a large area but its foot and a hairpin's summit (the rest is ramp and rim,
  // world/areas.js)
  const open = k => { const a = layout.areaCells?.get(k); return !a || a.i === 0 || (a.piece.kind === 'hairpin' && a.i === 5); };
  const rooms = layout.cells.map(([x, z]) => key(x, -d, z)).filter(k => !isTown(k, seed) && !layout.guardians.has(k)
    && layout.spanCells?.get(k)?.role !== 'gorge' && open(k) && k !== layout.annex?.key   // (an annex has only its outpost)
    && !layout.trialCells?.has(k));   // (nor a trial room, world/trials.js)
  const info = rooms.map(k => {
    const at = layout.routeIndex.get(k) ?? 0, branch = route.indexOf(k) < 0;
    const tier = Math.min(MAX_TIER, obstacles.filter(i => i < at).length + (branch ? 1 : 0)
      + (layout.sitePlans.has(k) ? 1 : 0) + (high(k) ? 2 : 0));
    return { key: k, at, branch, tier, spots: [] };
  });
  const plans = new Map();
  if (!info.length) return { spots: plans, list: [] };
  const add = (room, kind) => {
    const n = room.spots.length;
    const spot = { id: `${seed}:${room.key}:spot:${n}`, kind, key: room.key, depth: d, tier: room.tier,
      seed: hash32(seed ^ hashKey(room.key) ^ Math.imul(n + 1, 0x5b07)) };
    room.spots.push(spot);
    return spot;
  };
  // fewest spots first, then by how well it fits, then by chance
  const best = (list, fit) => list.map(r => ({ r, s: r.spots.length * 10 + fit(r) + R() }))
    .sort((a, b) => a.s - b.s)[0]?.r;
  // the camp: where the depth begins (the first room of the route that may have one)
  if (d > 0 && campDepth(d)) {
    const room = info.filter(r => !r.branch).sort((a, b) => a.at - b.at)[0];
    if (room) add(room, 'camp');
  }
  // the seats: one early on the way, one further on
  const onWay = info.filter(r => !r.branch);
  for (let i = 0; i < SEATS && onWay.length; i++) {
    const aim = i === 0 ? 0.25 : 0.7;
    add(best(onWay, r => Math.abs(r.at / Math.max(1, route.length - 1) - aim) * 6), 'seat');
  }
  // the hiding places: spread over the tiers the depth has, easy to hard
  const tiers = info.map(r => r.tier), lo = Math.min(...tiers), hi = Math.max(...tiers);
  const count = HIDES[0] + Math.floor(R() * (HIDES[1] - HIDES[0] + 1));
  for (let i = 0; i < count; i++) {
    const aim = lo + (hi - lo) * (count > 1 ? i / (count - 1) : 0);
    add(best(info, r => Math.abs(r.tier - aim) * 4), 'hide');
  }
  // the outpost: a plain room on the way, not at its ends, not the horde's (on a stream of its own)
  if (hasOutpost(seed, d)) {
    const R2 = mulberry32(hash32(seed ^ Math.imul(d + 1, 0x0f7905) ^ 0x0f7)), last = route.length - 1;
    const plain = info.filter(r => !r.branch && r.at >= 2 && r.at <= last - 1 && !layout.hordes.has(r.key) && !high(r.key));
    const room = plain.map(r => ({ r, s: r.spots.filter(s => s.kind !== 'hide').length * 10 + Math.abs(r.at / last - 0.5) * 4 + R2() }))
      .sort((a, b) => a.s - b.s)[0]?.r;
    if (room) add(room, 'outpost');
  }
  // an annex: an outpost of its own, behind its sealed portal (world/layout.js)
  if (layout.annex) {
    const room = { key: layout.annex.key, at: layout.routeIndex.get(layout.annex.key) ?? 0, branch: true, tier: 2, spots: [] };
    Object.assign(add(room, 'outpost'), { annex: layout.annex.gate });
    info.push(room);
  }
  // the glassmaker's glass (on a stream of its own, after the rest: they stay where they were)
  const glass = glassAt(seed, d);
  if (glass.length) {
    const R3 = mulberry32(hash32(seed ^ Math.imul(d + 1, 0x61a55) ^ 0x61a));
    const plain = info.filter(r => r.key !== layout.annex?.key && r.key !== layout.firstGlass), last = Math.max(1, route.length - 1);
    const hi = Math.max(...plain.map(r => r.tier));
    const used = new Set();
    glass.forEach((part, i) => {
      // on the way: a room of the route about halfway along, as easy as there is; hidden: the
      // hardest to get to, a branch rather than the way
      const fit = i === 0 ? r => (r.branch ? 20 : 0) + r.tier * 3 + Math.abs(r.at / last - 0.45) * 6
        : r => (hi - r.tier) * 3 + (r.branch ? 0 : 2);
      const room = plain.filter(r => !used.has(r.key)).map(r => ({ r, s: fit(r) + r.spots.length * 0.5 + R3() }))
        .sort((a, b) => a.s - b.s)[0]?.r;
      if (!room) return;
      used.add(room.key);
      Object.assign(add(room, 'glass'), { glass: i, way: i === 0 });
    });
  }
  // the recording that came up with his sword (core/narration.js 'camp'): the first glass of his on
  // the road past the beginning's rock (layout.firstGlass), in the first room of the way there is
  if (d === 0) {
    const room = info.filter(r => !r.branch && r.at >= 2 && !layout.hordes.has(r.key)).sort((a, b) => a.at - b.at)[0];
    if (room) Object.assign(add(room, 'glass'), { part: 'camp', way: true });
  }
  for (const r of info) if (r.spots.length) plans.set(r.key, r.spots);
  return { spots: plans, list: info.flatMap(r => r.spots) };
}

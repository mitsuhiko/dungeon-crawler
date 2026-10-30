// Seeded, bounded routes between vertical portals. Each stratum's route has a room count
// from its band in ROUTE_ROOMS, including its endpoints: long near the surface, shorter
// further down; small optional branches fit inside the band's most. The core has no
// further descent. Adjacent, non-linked route sections stay sealed.
import { mulberry32, hash32 } from '../core/util.js';
import { bossAt, BOSS_ARENAS } from '../core/bosses.js';
import { key, faceKey } from './coords.js';
import { MAX_DEPTH, themeAt, themesAt, worldThemes } from '../themes/depth.js';
import { planSites, siteIntent } from './sites.js';
import { planSpots } from './spots.js';
import { planHordes } from './hordes.js';
import { planArenas } from './arenas.js';
import { planSpans, indexSpans } from './spans.js';
import { planHeights, planSetPiece, planSlots, indexHeights, near } from './heights.js';
import { AREA_SIZE, templateCells, planArea, indexAreas } from './areas.js';
import { planTrials, planPuzzles, indexTrials } from './trials.js';
import { TRIALS } from '../core/trials.js';
import { INTRO_GATES } from '../core/intro.js';
import { townOf } from './town.js';

// [first depth, fewest, most] rooms on the route. The core always walks all nine rooms of
// its 3x3, so the route above it ends on a corner (an edge start cannot reach the centre
// in nine).
// Annexes (docs/quests.md, Defense): a room of its own beside the way, behind a portal sealed until
// a quest opens it (core/quests.js). Three a world: the first from depth ANNEX_FROM[0] on, the
// second from [1] on, the third from [2] on, each on the first depth with room for it (one of its
// branches: the depth keeps one of them for it).
export const ANNEX_FROM = [4, 10, 16];
export const annexGate = key => `annex:${key}`;
export const ROUTE_ROOMS = [[0, 18, 24], [4, 16, 22], [8, 14, 20], [12, 12, 18], [16, 9, 16], [MAX_DEPTH, 9, 9]];
export const routeRooms = d => ROUTE_ROOMS.findLast(([from]) => d >= from).slice(1);
// learn: world.html#route (see learn/README.md)
export const MIN_ROUTE_ROOMS = Math.min(...ROUTE_ROOMS.map(b => b[1])), MAX_ROUTE_ROOMS = Math.max(...ROUTE_ROOMS.map(b => b[2]));
const RADIUS = d => d >= MAX_DEPTH ? 0 : d <= 5 ? 3 : d <= 12 ? 2 : 1;
const AXES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const cheb = ([x, z]) => Math.max(Math.abs(x), Math.abs(z));
const nb = ([x, z]) => AXES.map(([dx, dz]) => [x + dx, z + dz]);
const id = c => c.join(',');
const direction = (a, b) => AXES.findIndex(([x, z]) => a[0] + x === b[0] && a[1] + z === b[1]);

// Bounded DFS, with a stable random priority per cell. Unlike a shortest path this
// can keep the deep, small rings long enough without creating disconnected gates.
// template: { kind, at }: a large area (areas.js) whose cells, in their fixed order and any way
// round, the route takes from index `at` on
// learn: world.html#backtracking #route-code (see learn/README.md)
function route(candidates, prefix, length, goal, R, template = null) {
  const allowed = new Set(candidates.map(id)), used = new Set(prefix.map(id));
  const priority = new Map(candidates.map(c => [id(c), R()])), out = [...prefix];
  function visit() {
    const c = out.at(-1);
    if (out.length === length) return goal(c);
    if (template && out.length === template.at) {
      for (const f of AXES) for (const l of AXES.filter(([x, z]) => x * f[0] + z * f[1] === 0)) {
        const cells = templateCells(template.kind, [c[0] + f[0], c[1] + f[1]], f, l);
        if (!cells.every(n => allowed.has(id(n)) && !used.has(id(n)))) continue;
        for (const n of cells) { out.push(n); used.add(id(n)); }
        if (visit()) return true;
        for (const n of cells) { out.pop(); used.delete(id(n)); }
      }
      return false;
    }
    const next = nb(c).filter(n => allowed.has(id(n)) && !used.has(id(n)));
    next.sort((a, b) => priority.get(id(a)) - priority.get(id(b)));
    for (const n of next) {
      out.push(n); used.add(id(n));
      if (visit()) return true;
      used.delete(id(n)); out.pop();
    }
    return false;
  }
  return visit() ? out : null;
}

// the side guardians' places on a route of `length` rooms: evenly spaced, each moved to the
// nearest room that is not part of the large area nor the room right after it (`skip`), and
// where it can, not right next to another guardian (as the even spacing never is)
function guardianIndices(length, count, first, skip) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const want = first + Math.floor((length - 2 - first) * (i + 1) / (count + 1));
    const ok = (x, apart) => x >= first && x <= length - (apart ? 3 : 2) && !skip.has(x) && !out.includes(x)
      && (!apart || out.every(o => Math.abs(o - x) > 1));
    for (const apart of [true, false]) {
      let at;
      for (let j = 0; j < length && at === undefined; j++) at = [want + j, want - j].find(x => ok(x, apart));
      if (at !== undefined) { out.push(at); break; }
    }
  }
  return out;
}

// where a large area of `size` rooms may start on a route of `length` rooms: never the first room,
// the room after it never the last (the descent), and room for two side guardians outside it, apart
function areaStarts(length, size, first) {
  const out = [];
  for (let at = 1; at + size <= length - 2; at++) {
    const g = guardianIndices(length, 2, first, new Set(Array.from({ length: size + 1 }, (_, j) => at + j)));
    if (g.length === 2 && Math.abs(g[0] - g[1]) > 1 && Math.max(...g) <= length - 3) out.push(at);
  }
  return out;
}

export const guardianDepth = (_seed, d) => d >= 0 && d < MAX_DEPTH;

// learn: world.html#backtracking #route (see learn/README.md)
function build(seed, d, above, theme, opts = {}) {
  const R = mulberry32(hash32(seed ^ Math.imul(d + 1, 0x9e3779b1))), Y = -d, r = RADIUS(d);
  const K = c => key(c[0], Y, c[1]);
  const candidates = [];
  let prefix;
  // the town (world/town.js, docs/town.md): its tiles are no rooms of the road; its gate tile is
  // the route's first room, the road out of it runs straight past the beginning's rock
  const town = d === 0 ? townOf(seed) : null, inTown = c => !!town?.tiles.has(K(c));
  if (d === 0) {
    const a = AXES[town.exit];
    prefix = Array.from({ length: 3 }, (_, i) => [a[0] * i, a[1] * i]);
    for (let z = -5; z <= 5; z++) for (let x = -5; x <= 5; x++)
      if (!inTown([x, z])) candidates.push([x, z]);
  } else {
    prefix = [above.end];
    for (let z = -r - 1; z <= r + 1; z++) for (let x = -r - 1; x <= r + 1; x++)
      if (d === MAX_DEPTH || cheb([x, z]) === r || cheb([x, z]) === r + 1) candidates.push([x, z]);
  }
  const goal = c => d === MAX_DEPTH ? id(c) === '0,0'
    : cheb(c) === (d ? r : 3) && (d < MAX_DEPTH - 1 || Math.abs(c[0]) === Math.abs(c[1]));
  const [min, max] = routeRooms(d);
  const desired = min + Math.floor(R() * (max - min + 1));
  const lengthAt = i => min + (desired - min + i) % (max - min + 1);
  // the depth's large area (areas.js) is built into the route, on a stream of its own (a depth
  // without one keeps its route); where it does not fit the depth may get a tableland instead.
  // Which one is the depth's, whatever theme the world picked there: the weights of the first
  // theme of its act (themes/depth.js themesAt; the world's own theme would move the route)
  const slots = planSlots(seed, d, themesAt(d)[0]);
  let spine = null, area = null;
  if (AREA_SIZE[slots.big]) {
    const TR = mulberry32(hash32(seed ^ Math.imul(d + 1, 0x7f4a7c15) ^ 0xa4ea)), size = AREA_SIZE[slots.big];
    for (let i = 0; i <= max - min && !spine; i++) {
      const length = lengthAt(i), starts = areaStarts(length, size, 2);
      for (let j = starts.length - 1; j > 0; j--) { const k = Math.floor(TR() * (j + 1)); [starts[j], starts[k]] = [starts[k], starts[j]]; }
      for (const at of starts) {
        spine = route(candidates, prefix, length, goal, TR, { kind: slots.big, at });
        if (spine) { area = { kind: slots.big, at, size }; break; }
      }
    }
  }
  for (let i = 0; i <= max - min && !spine; i++) spine = route(candidates, prefix, lengthAt(i), goal, R);
  if (!spine) throw new Error(`No bounded route at depth ${d}`);
  const start = spine[0], end = spine.at(-1), cells = [...spine], portals = new Set();
  const link = (a, b) => portals.add(faceKey(K(a), direction(a, b)));
  const exit = new Map(), routeIndex = new Map(), distance = new Map();
  spine.forEach((c, i) => {
    routeIndex.set(K(c), i); distance.set(K(c), 0);
    if (i + 1 < spine.length) { link(c, spine[i + 1]); exit.set(K(c), direction(c, spine[i + 1])); }
  });
  if (d < MAX_DEPTH) exit.set(K(end), 4);
  // the area's rooms (and the room after it, which it comes into high up) are never guarded
  const areaRooms = area ? spine.slice(area.at, area.at + area.size) : [];
  const inArea = c => areaRooms.some(a => id(a) === id(c)), nearArea = c => near(c, areaRooms);
  const guardians = new Map(), gateFaces = new Map();
  if (d < MAX_DEPTH) {
    const boss = bossAt(d);   // a real boss in place of the placeholder (core/bosses.js)
    guardians.set(K(end), { role: 'descent', exit: 4, bossPlaceholder: !boss, ...boss && { boss } });
    const count = 1 + Math.floor(R() * 2), first = 2;
    const skip = new Set(area ? Array.from({ length: area.size + 1 }, (_, j) => area.at + j) : []);
    for (const index of guardianIndices(spine.length, count, first, skip)) {
      const k = K(spine[index]), dir = exit.get(k);
      guardians.set(k, { role: 'side', exit: dir, bossPlaceholder: false });
      gateFaces.set(faceKey(k, dir), k);
    }
  } else {
    // the core's last cube: its boss's arena, the end of the world (`final`: no way on, cubegen/guardian.js)
    guardians.set(K(end), { role: 'descent', exit: 4, bossPlaceholder: false, boss: bossAt(d), final: true });
  }
  // the beginning (core/intro.js, docs/story.md "The beginning"): the town's gate out to the road
  // opens for the glassmaker's sword, the next room's (his first glass, on a rock) for his glass
  if (d === 0) {
    gateFaces.set(faceKey(K(spine[0]), exit.get(K(spine[0]))), INTRO_GATES.sword);
    gateFaces.set(faceKey(K(spine[1]), exit.get(K(spine[1]))), INTRO_GATES.glass);
  }
  const hordes = planHordes(seed, d, spine.map(K), guardians, k => areaRooms.some(a => K(a) === k));
  // One-room branches only, never attached to arenas or the town.
  // No loops: all sideways guardians are articulation points on the required route.
  const used = new Set(cells.map(id)), allowed = new Set(candidates.map(id));
  const annexes = above?.annexes ?? 0, wantAnnex = d >= 2 && d < MAX_DEPTH && annexes < ANNEX_FROM.length && d >= ANNEX_FROM[annexes];
  const branchBudget = Math.min(4, max - cells.length) - (wantAnnex ? 1 : 0);
  // gorge spans (spans.js): on the route, and maybe a lonely island branch over a bridge
  const free = c => !used.has(id(c)) && !inTown(c);
  // (nor next to a boss's arena of its own shape, core/bosses.js BOSS_ARENAS: Flip's box, Foggery's
  // caldera, whose ground does not meet a gorge's at their face)
  const shaped = [...guardians].filter(([, g]) => BOSS_ARENAS[g.boss]?.type).map(([k]) => k.split(',').map(Number).filter((_, i) => i !== 1));
  const spanPlan = planSpans(seed, d, theme.spans, spine, K, k => guardians.has(k) || hordes.has(k)
    || nearArea(k.split(',').map(Number).filter((_, i) => i !== 1))
    || shaped.some(c => nb(c).some(n => K(n) === k)), free, branchBudget, area?.kind === 'hairpin' ? 1 : 0);
  // the large area: a hairpin's two spans go in with the others
  const areaPlan = area ? planArea(seed, d, theme, area.kind, spine, area.at, K, free) : null;
  if (areaPlan?.kind === 'hairpin') for (const span of areaPlan.spans) {
    spanPlan.spans.push(span);
    spanPlan.cells.set(span.keys[1], { span, i: 0, role: 'gorge' });
    if (span.sky) for (const c of areaPlan.beside) spanPlan.apart.add(K(c));
  }
  const nearSpan = c => [c, ...nb(c)].some(n => spanPlan.apart.has(K(n)));
  // big height differences (heights.js): a tableland on the route, away from spans, guardians,
  // the horde and the ends of the route
  const spanned = [...spanPlan.cells.keys()].map(k => { const [x, , z] = k.split(',').map(Number); return [x, z]; });
  const heightPlan = planHeights(seed, d, theme, spine, K, c => guardians.has(K(c)) || hordes.has(K(c)) || near(c, spanned)
    || id(c) === id(spine[0]) || id(c) === id(spine.at(-1)), slots.big === 'tableland' || (!!slots.big && !area));
  const plateaus = [...heightPlan.cells].filter(([, h]) => h.role === 'plateau').map(([k]) => { const [x, , z] = k.split(',').map(Number); return [x, z]; });
  // trials (world/trials.js): the event slot on the route, before the branches (none attach to it)
  const pinnedCell = c => spanPlan.cells.has(K(c)) || heightPlan.cells.has(K(c)) || inArea(c);
  const trialBlocked = c => guardians.has(K(c)) || hordes.has(K(c)) || pinnedCell(c) || nearArea(c) || nearSpan(c);
  const guarded = c => guardians.has(K(c));
  const trialPlan = planTrials({ seed, d, theme, force: opts.trial, spine, K, blocked: trialBlocked, pinned: pinnedCell, guarded });
  for (const span of spanPlan.spans) if (span.island) {
    const line = span.keys.map(k => { const [x, , z] = k.split(',').map(Number); return [x, z]; });
    for (let j = 1; j < line.length; j++) {
      const c = line[j];
      cells.push(c); used.add(id(c)); link(line[j - 1], c); exit.set(K(c), direction(c, line[j - 1]));
      routeIndex.set(K(c), routeIndex.get(K(line[0]))); distance.set(K(c), j);
    }
  }
  for (const c of spine.slice(2, -1)) {
    if (cells.length >= spine.length + branchBudget) break;
    if (guardians.has(K(c)) || spanPlan.cells.has(K(c)) || heightPlan.cells.has(K(c)) || inArea(c)) continue;
    const options = nb(c).filter(n => allowed.has(id(n)) && !used.has(id(n)) && !nearSpan(n) && !near(n, plateaus) && !nearArea(n));
    if (!options.length || R() < .4 || trialPlan.cells.has(K(c))) continue;
    const n = options[Math.floor(R() * options.length)];
    cells.push(n); used.add(id(n)); link(c, n); exit.set(K(n), direction(n, c));
    routeIndex.set(K(n), routeIndex.get(K(c))); distance.set(K(n), 1);
  }
  // the annex: a room beside a plain room of the way where a branch could go, in the depth's room
  // budget, its portal sealed (gateFaces, like a side guardian's) until a quest opens it
  let annex = null;
  if (wantAnnex && cells.length < max) {
    const AR = mulberry32(hash32(seed ^ Math.imul(d + 1, 0xa11e7) ^ 0xa1)), rooms = spine.slice(2, -2);
    for (let j = rooms.length - 1; j > 0; j--) { const k = Math.floor(AR() * (j + 1)); [rooms[j], rooms[k]] = [rooms[k], rooms[j]]; }
    for (const c of rooms) {
      if (guardians.has(K(c)) || hordes.has(K(c)) || spanPlan.cells.has(K(c)) || heightPlan.cells.has(K(c)) || inArea(c)) continue;
      if (trialPlan.cells.has(K(c))) continue;
      const options = nb(c).filter(n => allowed.has(id(n)) && !used.has(id(n)) && !nearSpan(n) && !near(n, plateaus) && !nearArea(n));
      if (!options.length) continue;
      const n = options[Math.floor(AR() * options.length)];
      cells.push(n); used.add(id(n)); link(c, n); exit.set(K(n), direction(n, c));
      routeIndex.set(K(n), routeIndex.get(K(c))); distance.set(K(n), 1);
      gateFaces.set(faceKey(K(c), direction(c, n)), annexGate(K(n)));
      annex = { key: K(n), parent: K(c), gate: annexGate(K(n)) };
      break;
    }
  }
  // the puzzle slots: in a branch room where one fits (not an island's, nor the annex), else on the route
  const branches = cells.filter(c => distance.get(K(c)) === 1 && !spanPlan.cells.has(K(c)) && K(c) !== annex?.key)
    .map(c => ({ cell: c, parent: nb(c).find(n => routeIndex.has(K(n)) && distance.get(K(n)) === 0 && portals.has(faceKey(K(n), direction(n, c)))) })).filter(b => b.parent);
  const sides = k => [0, 1, 2, 3].filter(dd => portals.has(faceKey(k, dd))).length;   // (how many side portals a room has)
  planPuzzles(trialPlan, { spine, K, blocked: trialBlocked, pinned: pinnedCell, guarded, branches, busy: k => k === annex?.parent || k === annex?.key, sides });
  // a trial on the route holds its exit shut until it is resolved (like a side guardian's gate)
  for (const t of trialPlan.list) if (t.exit != null) gateFaces.set(faceKey(t.key, t.exit), t.gate);
  const layout = { depth: d, theme, cells, start, end, spine: spine.length, route: spine.map(K), routeIndex, annex,
    annexes: annexes + (annex ? 1 : 0),
    exists: new Set(cells.map(K)), portals, exit, guardians, gateFaces, hordes,
    up: d ? K(start) : null, down: d < MAX_DEPTH ? K(end) : null, guardian: guardianDepth(seed, d) };
  indexSpans(layout, spanPlan.spans, spanPlan.cells);
  indexHeights(layout, heightPlan);
  indexAreas(layout, areaPlan ? [areaPlan] : []);
  indexTrials(layout, trialPlan);
  const sites = planSites(seed, layout, distance);
  layout.sitePlans = sites.plans; layout.roles = sites.roles;
  // the beginning's third room (core/intro.js): a lone peak (cubegen/setpieces.js) with his first
  // glass on top, where a discovery would be (its site: no chest, the glass instead)
  if (d === 0) {
    const k = layout.firstGlass = K(spine[1]);
    layout.sitePlans.set(k, [{ ...siteIntent(seed, k, theme.props, 'basic'), spawn: 'glass' }]);
    layout.roles.set(k, 'discovery');
  }
  Object.assign(layout, planSetPiece(layout, slots));
  for (const [k, g] of guardians) layout.roles.set(k, `${g.role}-guardian`);
  layout.populationScale = new Map();
  for (const k of hordes.keys()) {
    const i = layout.route.indexOf(k), before = layout.route[i - 1];
    if (i > (d === 0 ? 3 : 2) && !guardians.has(before)) layout.populationScale.set(before, .5);
  }
  // a trial room: its kind says how many live there (core/trials.js)
  for (const t of trialPlan.list) { layout.roles.set(t.key, 'trial'); layout.populationScale.set(t.key, TRIALS[t.kind].population ?? 1); }
  // a gorge is mostly air and valley floor: fewer enemies down there
  for (const [k, s] of spanPlan.cells) if (s.role === 'gorge') { layout.roles.set(k, 'span'); layout.populationScale.set(k, .5); }
  // places kept free for whoever or whatever the quests put there (world/spots.js)
  const spots = planSpots(seed, layout);
  layout.spots = spots.spots; layout.spotList = spots.list;
  // the town's other tiles exist too (World.prepare), but are no rooms of the road: nothing above
  // planned anything in them
  if (town) { layout.town = town; for (const k of town.keys) layout.exists.add(k); }
  return layout;
}

// themes: the world's theme picks (themes/depth.js worldThemes). A depth's theme (layout.theme)
// decides its gorge spans (and with them where the branches may go) and what its reward sites are
// like; the route, its guardians and hordes depend on the seed alone.
// opts.trial: a trial kind every depth gets wherever it fits (dev, tests: ?trial=, world/trials.js)
export function makeLayouts(seed, themes = worldThemes(seed), opts = {}) {
  const cache = [];
  const get = d => cache[d] || (cache[d] = planArenas(seed, build(seed, d, d ? get(d - 1) : null, themeAt(d, themes), opts)));
  get.themes = themes;
  return get;
}

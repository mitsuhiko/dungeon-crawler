// Balance (docs/trials.md, `balance`): the crumbling floor's room (cubegen/trials/collapse.js),
// its two small aprons, but no causeway: separate stone slabs over a basin of lava or acid, each a
// 2x2 core (its run-up) grown into a square, a rectangle or an L, a cell of basin between them,
// so every step is a running jump. A way of slabs from the entry's apron to the exit's, and a few
// more slabs a jump off it: other ways across, or dead ends. What kind each slab is (steady,
// quick, rhythm: core/trials.js) and that the way is made in time is up to the check
// (cubegen/trials/index.js finishBalance); only a grounded landing starts a slab's clock
// (core/trials.js touchStone).
import { N, LH, RUN_SPEED, DIRS } from '../../core/constants.js';
import { idx, edgeKey } from '../../core/util.js';
import { floorY } from '../../core/surfaces.js';
import { SLACK, STONE_TIME, QUICK_TIME, rhythmWindow } from '../../core/trials.js';
import { graph } from '../reach.js';
import { jumpMoves } from '../climbs.js';
import { RUN_UP, JUMP_TIME } from './timing.js';
import { apron, collapseRoute, collapseGoal } from './collapse.js';

const cellsAt = (x, z) => [idx(x, z), idx(x + 1, z), idx(x, z + 1), idx(x + 1, z + 1)];
const distance = (a, b) => Math.min(...a.flatMap(c => b.map(d => Math.abs(c % N - d % N) + Math.abs((c / N | 0) - (d / N | 0)))));
const shuffle = (a, R) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function shapeBalance(ctx) {
  const { spec, lvl0, void0, R } = ctx;
  const entry = apron(spec, spec.trial.entry), exit = apron(spec, spec.trial.exit);
  ctx.trialBuild = { kind: 'balance', failed: true, keep: [] };
  ctx.stats.mode = `${spec.kind} / balance`;
  if (!entry || !exit || Math.abs(entry.level - exit.level) > 6) return;
  const level = Math.min(entry.level, exit.level);
  if (level < 3) return;
  const safe = [...entry.cells, ...entry.pad, ...entry.ears, ...exit.cells, ...exit.pad, ...exit.ears];
  const candidates = new Map();
  for (let z = 1; z < N - 2; z++) for (let x = 1; x < N - 2; x++) {
    const cells = cellsAt(x, z);
    if (distance(cells, safe) < 2) continue;
    candidates.set(`${x},${z}`, { x, z, cells, start: distance(cells, entry.inner) === 2, end: distance(cells, exit.inner) === 2 });
  }
  // A cardinal jump with at least one full row to land on, and two cells for the run-up.
  // Let the rows offset by one: arbitrary portal positions need not lie on one fixed 3-cell grid.
  for (const q of candidates.values()) {
    q.next = [];
    for (const d of [-3, 3]) for (const off of [-1, 0, 1]) for (const [dx, dz] of [[d, off], [off, d]]) {
      const n = candidates.get(`${q.x + dx},${q.z + dz}`);
      if (n) q.next.push(n);
    }
    shuffle(q.next, R);
  }
  let budget = 12000;
  const path = [];
  function search(q) {
    if (--budget < 0 || path.some(p => distance(p.cells, q.cells) < 2)) return false;
    path.push(q);
    if (q.end && path.length >= 3) return true;
    if (!q.end && path.length < 10) for (const n of q.next) if (search(n)) return true;
    path.pop();
    return false;
  }
  if (!shuffle([...candidates.values()].filter(q => q.start), R).some(search)) return;
  // a few more slabs a jump off those there are (beside the way, or off another of them): other
  // ways across where one also lies a jump from the way further on or from the exit's apron,
  // dead ends where not (cubegen/trials/index.js finishBalance tells them apart)
  const free = q => path.every(p => distance(p.cells, q.cells) >= 2);
  for (let more = 1 + Math.floor(R() * 3); more > 0; more--) {
    const next = shuffle(path.flatMap(p => p.next).filter(free), R)[0];
    if (!next) break;
    path.push(next);
  }
  const crust = new Map();
  path.forEach((q, stone) => q.cells.forEach(c => crust.set(c, { stone, form: 'square' })));
  // Grow different silhouettes away from the route's gaps, never toward another slab or an
  // apron. Keep the proven 2x2 core: a larger-looking stone must not steal another's landing.
  const forms = [
    { form: 'rectangle', extra: [[2, 0], [2, 1]] },
    { form: 'L', extra: [[0, 2], [0, 3]] },
    { form: 'large square', extra: [[2, 0], [2, 1], [0, 2], [1, 2], [2, 2]] },
  ];
  for (const stone of shuffle([...path.keys()], R)) {
    const q = path[stone], others = [...safe, ...[...crust].filter(([, v]) => v.stone !== stone).map(([c]) => c)];
    const choices = shuffle(forms.flatMap(f => [0, 1, 2, 3].map(turn => ({ ...f, turn }))), R);
    for (const choice of choices) {
      const extra = choice.extra.map(([x, z]) => {
        for (let i = 0; i < choice.turn; i++) [x, z] = [1 - z, x];
        return [q.x + x, q.z + z];
      });
      if (extra.some(([x, z]) => x < 1 || z < 1 || x >= N - 1 || z >= N - 1)) continue;
      const cells = extra.map(([x, z]) => idx(x, z));
      if (distance(cells, others) < 2) continue;
      for (const c of [...q.cells, ...cells]) crust.set(c, { stone, form: choice.form });
      break;
    }
  }
  const sizes = path.map((_, stone) => [...crust.values()].filter(q => q.stone === stone).length);
  if (new Set([...crust.values()].map(q => q.form)).size < 2 || new Set(sizes).size < 2) return;
  const aprons = new Map();
  for (const a of [entry, exit]) for (const [c, row] of a.rows) aprons.set(c, Math.round(a.level + (level - a.level) * (row + 1) / 3));
  const pads = new Set([...entry.pad, ...exit.pad]);
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
    const c = idx(x, z);
    void0[c] = 0; ctx.keep.add(c);
    if (pads.has(c)) continue;
    if (aprons.has(c)) lvl0[c] = aprons.get(c);
    else if (crust.has(c)) lvl0[c] = level;
    else { lvl0[c] = 0; ctx.seaCells.push(c); }
  }
  ctx.trialKeep = new Set([...crust.keys(), ...entry.cells, ...exit.cells]);
  ctx.noFence = new Set(crust.keys());
  Object.assign(ctx.trialBuild, { failed: false, crust, basin: level - 0.5, entryApron: entry.cells,
    exitApron: exit.cells, entryCentre: entry.centre, exitCentre: exit.centre, keep: [...ctx.trialKeep] });
}

export const balanceRoute = collapseRoute;
export const balanceGoal = collapseGoal;

// --- the slabs' kinds and the check (docs/trials.md, `balance`, "Check") -------------------------
// Every way across has a rhythm stone on it (they are a cut of the slabs' graph), so nobody gets
// over without watching its beat: rushing the far apron in one go (a click across, game/orders.js)
// meets it under as often as not. A few steady slabs turn quick from depth QUICK_FROM on. Then a
// search on the trial's clock proves a slow player gets across: on the ground before the slabs
// they may wait as long as they like, on a slab only while it holds; the jumps are the reach
// graph's own (its floors, cubegen/climbs.js jumpMoves, the fences), the way only ever a jump
// nearer the exit (no slab twice). Times are the slow player's (core/trials.js SLACK): a walk
// across a slab, then the run-up (RUN_UP); the flight JUMP_TIME. Landing on a rhythm stone, it has
// been up EARLY s already (for one who jumps early), and every slab is left MARGIN (a rhythm stone
// SINK) s before it goes under; of the ways there are, the one with the most of that to spare
// is kept, and kinds are drawn again (TRIES) while it is less than SPARES[0]. The shortest way
// across has WAY slabs at least.
export const BEAT = { up: [4.2, 5], down: [2.2, 3.2] };
const QUICK_FROM = 5, EARLY = 0.5, MARGIN = 0.3, SINK = 0.4, STEP = 0.1, TRIES = 16, WAY = 3, SPARES = [0.4, 0];
const round = (v, k = 10) => Math.round(v * k) / k;

// { slabs: [{ kind, up?, period?, offset? } per stone], check } or null (no kinds that can be made)
export function balanceSlabs(ctx, t, floorOf) {
  const { R } = ctx, stoneOf = new Map();
  for (const [c, q] of t.crust) { const f = floorOf(c); if (!f) return null; stoneOf.set(f.id, q.stone); }
  const n = Math.max(...[...t.crust.values()].map(q => q.stone)) + 1, adj = graph(ctx, true);
  const near = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z) === 1;
  // the ground on either side, walked to from the entry (the goal) without a slab
  const side = start => {
    const seen = new Map([[start.id, start]]), stack = [start];
    while (stack.length) {
      const a = stack.pop();
      for (const b of adj.get(a.id) || []) if (!seen.has(b.id) && !b.fluid && !stoneOf.has(b.id) && near(a, b)) { seen.set(b.id, b); stack.push(b); }
    }
    return seen;
  };
  const ins = side(t.entry), outs = side(t.goal);
  if ([...ins.keys()].some(id => outs.has(id))) return null;
  const groupOf = f => stoneOf.get(f.id) ?? (ins.has(f.id) ? 'in' : outs.has(f.id) ? 'out' : null);
  // cells walked from floor `from` to every floor of its group, and the way back ({ d, prev })
  const walks = new Map();
  const walk = from => {
    if (walks.has(from.id)) return walks.get(from.id);
    const g = groupOf(from), d = new Map([[from.id, 0]]), prev = new Map(), queue = [from];
    for (let i = 0; i < queue.length; i++) {
      const a = queue[i];
      for (const b of adj.get(a.id) || []) if (!d.has(b.id) && !b.fluid && near(a, b) && groupOf(b) === g) { d.set(b.id, d.get(a.id) + 1); prev.set(b.id, a); queue.push(b); }
    }
    const w = { d, prev };
    walks.set(from.id, w);
    return w;
  };
  // the jumps from each group onto another slab or the far ground (not fenced off)
  const hops = new Map();
  // (a fence on any edge the jump crosses, the take-off's or the landing's, is in the way)
  const fenceAt = (x, z, d, y) => (ctx.fences.get(edgeKey(x, z, x + DIRS[d][0], z + DIRS[d][1])) || []).some(e => e.ymin < y + 0.6 && e.ymax > y - 0.6);
  const fenced = (f, d, gap) => [...Array(gap + 1).keys()].some(j => fenceAt(f.x + DIRS[d][0] * j, f.z + DIRS[d][1] * j, d, f.top * LH));
  for (const f of [...ins.values(), ...ctx.floors.filter(f => stoneOf.has(f.id))]) {
    const from = groupOf(f);
    for (let d = 0; d < 4; d++) {
      const out = [];
      jumpMoves(ctx, f, d, out);
      for (const m of out) {
        const to = groupOf(m.to);
        if (to == null || to === 'in' || to === from || fenced(f, d, m.gap)) continue;
        if (!hops.has(from)) hops.set(from, []);
        hops.get(from).push({ a: f, g: m.to, from, to });
      }
    }
  }
  // hops from each group to the far ground (the way only ever gets nearer)
  const dist = new Map([['out', 0]]);
  for (let changed = true; changed;) {
    changed = false;
    for (const [g, list] of hops) for (const h of list) if (dist.has(h.to) && (dist.get(g) ?? Infinity) > dist.get(h.to) + 1) { dist.set(g, dist.get(h.to) + 1); changed = true; }
  }
  if (!dist.has('in')) return null;
  // a way across over the slabs not in `avoid` (groups, from 'in' to 'out'), or null
  const way = avoid => {
    const prev = new Map([['in', null]]), queue = ['in'];
    for (let i = 0; i < queue.length; i++) for (const h of hops.get(queue[i]) || []) {
      if (prev.has(h.to) || avoid.has(h.to)) continue;
      prev.set(h.to, queue[i]); queue.push(h.to);
      if (h.to === 'out') { const out = []; for (let g = 'out'; g != null; g = prev.get(g)) out.unshift(g); return out; }
    }
    return null;
  };
  const shortest = way(new Set()).filter(g => typeof g === 'number');
  if (dist.get('in') - 1 < WAY) return null;   // (a shortcut over the room)
  for (const least of SPARES) for (let tries = 0; tries < TRIES; tries++) {
    const rhythm = new Set();
    for (let w; (w = way(rhythm));) {
      // (rather not the first slab: waiting for it on the ground before is the easy case)
      const on = w.filter(g => typeof g === 'number'), pick = on.length > 1 ? on.slice(1) : on;
      if (!on.length) return null;   // (a way with no slab on it: nothing to watch)
      rhythm.add(pick[Math.floor(R() * pick.length)]);
    }
    if (shortest.length >= 4 && R() < 0.5) rhythm.add(shortest[1 + Math.floor(R() * (shortest.length - 1))]);
    const up = round(BEAT.up[0] + R() * (BEAT.up[1] - BEAT.up[0])), period = round(up + BEAT.down[0] + R() * (BEAT.down[1] - BEAT.down[0]));
    const steady = shuffle([...Array(n).keys()].filter(s => !rhythm.has(s) && dist.has(s)), R);
    const quick = new Set(ctx.spec.depth >= QUICK_FROM && tries < TRIES / 2 ? steady.slice(0, Math.floor(R() * 3)) : []);
    const slabs = [...Array(n).keys()].map(s => rhythm.has(s) ? { kind: 'rhythm', up, period, offset: round(R() * period) }
      : { kind: quick.has(s) ? 'quick' : 'steady' });
    const check = schedule(slabs, period);
    if (check && check.slack >= least) return { slabs, check };
  }
  return null;

  // The search: labels { f (the floor landed on), L (when), end (when it is left at the latest),
  // spare (the least time to spare so far), prev } per group, the groups in order of the way
  // (farthest from the exit first); from the ground before the slabs every take-off over a whole
  // beat. Of the labels on a floor at one time (on a rhythm stone: in one of its beats) the one
  // with the most to spare is kept; the way: of the landings on the far ground the one with the
  // most to spare, then the earliest.
  function schedule(slabs, period) {
    const labels = new Map(), byGroup = new Map(), ends = [];
    const add = (g, label, k) => {
      const had = labels.get(k);
      if (had && had.spare >= label.spare) return;
      labels.set(k, label);
      if (!had) { if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g).push(k); }
    };
    add('in', { f: t.entry, L: 0, end: Infinity, spare: Infinity, prev: null }, 'in');
    const order = [...dist.keys()].filter(g => g !== 'out').sort((a, b) => dist.get(b) - dist.get(a));
    for (const g of order) for (const label of (byGroup.get(g) || []).map(k => labels.get(k))) {
      const { d } = walk(label.f);
      for (const h of hops.get(g) || []) {
        if (!d.has(h.a.id) || !(dist.get(h.to) < dist.get(g))) continue;
        const from = label.L + (d.get(h.a.id) / RUN_SPEED + RUN_UP) * SLACK, until = g === 'in' ? from + period : label.end;
        for (let tau = from; tau <= until + 1e-9; tau += STEP) {
          const L = tau + JUMP_TIME, step = { label, a: h.a, tau }, spare = Math.min(label.spare, label.end - tau);
          if (h.to === 'out') { ends.push({ f: h.g, L, spare, prev: step }); continue; }
          const slab = slabs[h.to];
          if (slab.kind === 'rhythm') {
            const w = rhythmWindow(slab, L - EARLY);
            if (!w || w.to - SINK <= L) continue;
            add(h.to, { f: h.g, L, end: w.to - SINK, spare, prev: step }, `${h.g.id}:w${Math.round(w.from / STEP)}`);
          } else add(h.to, { f: h.g, L, end: L + (slab.kind === 'quick' ? QUICK_TIME : STONE_TIME) - MARGIN, spare, prev: step }, `${h.g.id}:${Math.round(L / STEP)}`);
        }
      }
    }
    if (!ends.length) return null;
    const last = ends.reduce((a, b) => b.spare > a.spare + 1e-9 || (Math.abs(b.spare - a.spare) <= 1e-9 && b.L < a.L) ? b : a);
    // the way back: per group landed on, from where to where, when
    const legs = [];
    for (let e = last; e.prev; e = e.prev.label) legs.unshift({ label: e.prev.label, a: e.prev.a, tau: e.prev.tau });
    if (legs.filter(q => typeof groupOf(q.label.f) === 'number').length < 2) return null;
    const at = f => ({ x: f.x + 0.5, y: floorY(f, 0.5, 0.5), z: f.z + 0.5 });
    const path = [], stones = [];
    const walkOn = (from, to, L) => {
      const { d, prev } = walk(from), cells = [];
      for (let f = to; f; f = prev.get(f.id)) cells.unshift(f);
      cells.forEach(f => path.push({ ...at(f), t: round(L + d.get(f.id) / RUN_SPEED * SLACK, 100) }));
    };
    for (const leg of legs) {
      const g = groupOf(leg.label.f);
      walkOn(leg.label.f, leg.a, leg.label.L);
      Object.assign(path.at(-1), { go: round(leg.tau, 100), ...leg.label.end < Infinity && { dl: round(leg.label.end, 100) } });
      if (typeof g === 'number') stones.push({ stone: g, kind: slabs[g].kind, stay: round(leg.tau - leg.label.L, 100), spare: round(leg.label.end - leg.tau, 100) });
    }
    walkOn(last.f, t.goal, last.L);
    return { stones, path, slack: Math.min(...stones.map(q => q.spare)), rhythm: slabs.filter(q => q.kind === 'rhythm').length };
  }
}

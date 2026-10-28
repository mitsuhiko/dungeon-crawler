// Sinking stones: the collapse room's small safe aprons, but no causeway. Each 2x2 slab is
// separated by a one-cell jump. The room is checked by the ordinary reach graph after smoothing;
// only a grounded landing starts a slab's three-second clock (core/trials.js touchStone).
import { N } from '../../core/constants.js';
import { idx } from '../../core/util.js';
import { apron, collapseRoute, collapseGoal } from './collapse.js';

const cellsAt = (x, z) => [idx(x, z), idx(x + 1, z), idx(x, z + 1), idx(x + 1, z + 1)];
const distance = (a, b) => Math.min(...a.flatMap(c => b.map(d => Math.abs(c % N - d % N) + Math.abs((c / N | 0) - (d / N | 0)))));
const shuffle = (a, R) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function shapeSinking(ctx) {
  const { spec, lvl0, void0, R } = ctx;
  const entry = apron(spec, spec.trial.entry), exit = apron(spec, spec.trial.exit);
  ctx.trialBuild = { kind: 'sinking', failed: true, keep: [] };
  ctx.stats.mode = `${spec.kind} / sinking stones`;
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
  const crust = new Map();
  path.forEach((q, stone) => q.cells.forEach(c => crust.set(c, { stone })));
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

export const sinkingRoute = collapseRoute;
export const sinkingGoal = collapseGoal;

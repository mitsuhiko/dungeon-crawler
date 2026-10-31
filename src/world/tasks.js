// Room tasks (docs/trials.md "Room tasks", core/tasks.js), planned with the layout from the seed
// alone, on their own random stream, after everything else of the depth (the trials, the branches,
// the reward sites, the set pieces): so nothing else moves for them.
//
// Per depth from 1 to 19: taskCount(d) of them (2-3 down to depth 4, 3-4 from 5), in ordinary
// rooms: never a guardian's, the horde's, a trial room, a span's, a height piece's, a large area's,
// the annex (or its parent), the depth's entrance or descent. On the route (index 2 to length - 2)
// a task holds the room's exit shut (gateFaces, like a trial's: `trial:<key>`); never two gated
// rooms in a row (a guardian's, a trial's, a task's), nor the room before a guardian. At most one
// is in a branch room with a reward site (by BRANCH chance): the door of a vault round it.
// The kinds are drawn by weight among those that fit (their depths; a branch: not `routeOnly`), no
// kind twice in a depth until each that fits has had its turn.
//
//   task: { id, key, kind, role: 'route' | 'branch', from (the room it is entered from), fromDir,
//           exit (the room's exit face; null in a branch), gate ('trial:<key>'), depth }
import { mulberry32, hash32 } from '../core/util.js';
import { MAX_DEPTH } from '../themes/depth.js';
import { TRIALS, trialGate, parseForce, isTask } from '../core/trials.js';
import { TASK_KINDS, taskCount, BRANCH } from '../core/tasks.js';
import { faceKey, step } from './coords.js';

const DIRS = [0, 1, 2, 3];
// the dir from room a to its neighbour b (keys), or -1
const dirTo = (a, b) => DIRS.find(d => step(a, d) === b) ?? -1;

function weighted(list, r) {
  const sum = list.reduce((s, [, w]) => s + w, 0);
  let x = r * sum;
  for (const [k, w] of list) if ((x -= w) < 0) return k;
  return list.at(-1)?.[0] ?? null;
}

// The tasks of depth d's layout (world/layout.js, once its plans are all in): adds them to it
// (layout.tasks, layout.taskCells) and holds a route task's exit shut (layout.gateFaces).
//   ctx: { seed, d, force (?trial=: a task kind every slot takes), blocked(key) (no task there),
//          branches: [{ key, parent }] (one-room branches) }
export function planTasks(layout, { seed, d, force: f = null, blocked = () => false, branches = [] }) {
  layout.tasks = []; layout.taskCells = new Map();
  if (d < 1 || d >= MAX_DEPTH) return layout;
  const R = mulberry32(hash32(seed ^ Math.imul(d + 1, 0x7a5c) ^ 0x7a5c5)), force = parseForce(f);
  if (force && !isTask(force.kind)) return layout;   // (another kind forced: the trials only)
  const theme = layout.theme, route = layout.route, last = route.length - 1;
  const fits = (kind, role) => { const t = TRIALS[kind]; return t.built && d >= t.depths[0] && d <= t.depths[1] && (role === 'route' || !t.routeOnly); };
  const weight = kind => TRIALS[kind].weight * (theme.cave ? TRIALS[kind].dark ?? 1 : 1);
  const used = new Set();
  const draw = role => {
    if (force) return force.kind;
    let pool = TASK_KINDS.filter(k => fits(k, role) && !used.has(k));
    if (!pool.length) { for (const k of [...used]) if (fits(k, role)) used.delete(k); pool = TASK_KINDS.filter(k => fits(k, role) && !used.has(k)); }
    const kind = weighted(pool.map(k => [k, weight(k)]), R());
    if (kind) used.add(kind);
    return kind;
  };
  const tasks = layout.taskCells;
  const gated = k => !!k && (layout.guardians.has(k) || layout.trialCells?.has(k) || tasks.has(k));
  const add = t => { const e = { id: `${seed}:${t.key}:task`, ...t, gate: trialGate(t.key), depth: d }; layout.tasks.push(e); tasks.set(t.key, e); return e; };
  const [lo, hi] = taskCount(d);
  let n = force ? hi : lo + Math.floor(R() * (hi - lo + 1));
  const branchRoll = R(), roomRoll = R();
  // a branch's vault: one with a reward site, its parent no gated room
  const vaults = branches.filter(b => layout.sitePlans?.has(b.key) && !blocked(b.key) && !gated(b.key) && !gated(b.parent) && !blocked(b.parent));
  if (n && vaults.length && (force ? true : branchRoll < BRANCH)) {
    const b = vaults[Math.floor(roomRoll * vaults.length)], kind = force && !fits(force.kind, 'branch') ? null : draw('branch');
    if (kind) { add({ key: b.key, kind, role: 'branch', from: b.parent, fromDir: dirTo(b.parent, b.key), exit: null }); n--; }
  }
  // the route: rooms spaced out, none beside another gated one
  for (; n > 0; n--) {
    const open = [];
    for (let i = 2; i <= last - 1; i++) {
      const k = route[i];
      if (blocked(k) || gated(k) || gated(route[i - 1]) || gated(route[i + 1])) continue;
      open.push(i);
    }
    if (!open.length) break;
    const i = open[Math.floor(R() * open.length)], kind = draw('route');
    if (!kind) break;
    const k = route[i];
    add({ key: k, kind, role: 'route', from: route[i - 1], fromDir: dirTo(route[i - 1], k), exit: layout.exit.get(k) ?? null });
  }
  // a task on the route holds its exit shut until it is done (like a trial's: core/guardians.js portalLocked)
  for (const t of layout.tasks) if (t.exit != null) layout.gateFaces.set(faceKey(t.key, t.exit), t.gate);
  return layout;
}

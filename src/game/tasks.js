// Running a room task (docs/trials.md "Room tasks", core/tasks.js): what each kind does in the room
// it was laid over, stepped from game/trials.js updateTrial like the events with actors of their own
// (game/trialevents.js). The task is the room's trial (state.trial, map.trial with `task`): its gate,
// its parts (the braziers, the shards, the hidden button, the beacon), the HUD and playing together
// are a trial's. Playing together, the game that owns the trial (net/trials.js) spawns the keybearer,
// the wardstones and the waves and decides what is done; the others are shown its word.
//
// Kept for the run (run.trials, core/tasks.js taskMark): the braziers lit and the shards taken. A
// death in the room puts them back as they were when it was entered (game/flow.js beginVisit), and
// the enemies with them; done is done for good (its gate). Leaving the room keeps them; the circle's
// hold and the fading flames start over.
import { taskMark, bitsOf, litNow, lanternLit, keybearerKind, pickBearer, WARD, WARD_KIND, HOLD, holdTime } from '../core/tasks.js';
import { ENEMY_KINDS, makeEnemy, coinRange, depthLevel } from '../core/enemies.js';
import { swarmKind } from '../core/hordes.js';
import { hordeKinds, hordeSize } from '../world/hordes.js';
import { walkable, groundY } from '../physics/enemynav.js';
import { mulberry32, hash32 } from '../core/util.js';
import { hashString } from '../core/gear/drops.js';
import { player, state, setStatus, worldLevel } from './state.js';
import { addEnemies, removeEnemies, mirroring, allEnemies } from './enemies.js';
import { online } from '../net/online.js';
import { sfx } from '../audio/sfx.js';
import { msg, tr } from '../i18n/i18n.js';

const bodies = () => [player, ...online.buddies.filter(b => b.here && b.hp > 0)].filter(b => b.hp > 0);
const bearerId = m => `trial:${m.key}:bearer`;
const wardId = (m, i) => `trial:${m.key}:ward${i}`;

// --- progress kept for the run ---------------------------------------------------------------------

// the bits of the room's things done for good (the braziers lit, the shards taken): part id -> 1
export function taskProgress(m, run) {
  if (!m?.task || (m.kind !== 'lanterns' && m.kind !== 'shards')) return {};
  const n = run.trials.get(taskMark(m.key)) ?? 0, out = {};
  for (const i of bitsOf(n)) out[`${m.kind === 'shards' ? 'shard' : 'lantern'}${i}`] = 1;
  return out;
}
// the state's bits as the run keeps them (the braziers lit, the shards taken); playing together, the
// owner's word too
export function keepTaskProgress(m, s, run = state.run) {
  if (!m?.task || (m.kind !== 'lanterns' && m.kind !== 'shards')) return;
  let n = run.trials.get(taskMark(m.key)) ?? 0;
  for (const p of m.parts) if (s.bits[p.id]) n |= 1 << p.i;
  if (n) run.trials.set(taskMark(m.key), n);
}
// what a death in the room puts back (game/flow.js beginVisit, restoreVisit): [key, value]
export const taskMarkOf = (m, run) => m?.task ? [taskMark(m.key), run.trials.get(taskMark(m.key)) ?? 0] : null;
export function restoreTaskMark(mark, run) {
  if (!mark) return;
  if (mark[1]) run.trials.set(mark[0], mark[1]); else run.trials.delete(mark[0]);
}
// is a room's task one whose enemies must not come back before it is done (core/respawn.js)?
export const holdsRespawn = (m, run) => m?.trial?.task && m.trial.kind === 'clear' && !run.unlockedGates.has(m.trial.gate);

// --- the actors: the keybearer, the wardstones -----------------------------------------------------

// The enemies the task brings (game/enemies.js resetEnemies adds them to the cube's): the keybearer
// at its post, the wardstones on theirs, those not defeated yet. Not where we are shown another's.
export function taskActors(map = state.map, run = state.run) {
  const m = map?.trial;
  if (!m?.task || mirroring() || run.unlockedGates.has(m.gate)) return [];
  const depth = map.depth, out = [];
  if (m.kind === 'keybearer' && m.bearer && !run.defeated.has(bearerId(m))) {
    const type = pickBearer(depth, hash32(hashString(m.id)));
    const f = map.floors[m.bearer.f];
    if (type && f) {
      const kind = keybearerKind(type), level = depthLevel(depth, worldLevel()) + 1, [lo, hi] = coinRange(kind, level);
      const e = makeEnemy({ id: bearerId(m), level, coinDrop: Math.round((lo + hi) / 2), kind, f, x: m.bearer.x, y: m.bearer.y, z: m.bearer.z, yaw: m.bearer.yaw }, kind, 0);
      e.keybearer = m.key;
      out.push(e);
    }
  }
  if (m.kind === 'wardstones') for (const w of m.wards || []) {
    const id = wardId(m, w.i), f = map.floors[w.f];
    if (run.defeated.has(id) || !f) continue;
    const level = depthLevel(depth, worldLevel()), [lo, hi] = coinRange(WARD_KIND, level);
    const e = makeEnemy({ id, level, coinDrop: Math.round((lo + hi) / 2), kind: WARD_KIND, f, x: w.x, y: w.y, z: w.z, yaw: 0 }, WARD_KIND, w.i);
    e.waiting = true;   // (it never moves nor strikes: game/enemyai.js)
    e.ward = m.key;
    out.push(e);
  }
  return out;
}
// (shown another's enemies, we have their ids, not their spots: a cube's own are `<key>:<species>:<floor>`)
const own = (m, e) => (e.respawn === m.key || e.id?.startsWith(`${m.key}:`)) && !e.profile.dwells && !e.profile.ward
  && (!e.home || state.map.safe?.[e.home.id] !== 0);
// the room's own enemies still standing (Clear the room), those of them that count
export const standing = m => allEnemies().filter(e => own(m, e) && e.mode !== 'dead');
const wardsLeft = m => (m.wards || []).filter(w => !state.run.defeated.has(wardId(m, w.i)) && !allEnemies().some(e => e.id === wardId(m, w.i) && e.mode === 'dead'));
const bearerDown = m => state.run.defeated.has(bearerId(m)) || allEnemies().some(e => e.id === bearerId(m) && e.mode === 'dead');

// --- hold the circle ---------------------------------------------------------------------------------

let raiders = new Set(), attempt = 0, mendT = 0, held = 0;
const held0 = s => (s.bits.hold ?? 0) / 10;
// the room put back (a death, coming in): the waves gone
export function resetTasks() {
  if (raiders.size) { const ids = raiders; removeEnemies(e => ids.has(e.id)); }
  raiders = new Set(); attempt++; mendT = 0; held = 0;
}
function spawnWave(m, s, k) {
  const depth = state.map.depth, R = mulberry32(hash32(hashString(m.key) ^ Math.imul(k + 1, 0x9e37) ^ attempt));
  const [lo, hi] = hordeSize(depth), n = Math.max(2, Math.round((lo + hi) / 4 / HOLD.waves)), level = depthLevel(depth, worldLevel());
  const light = hordeKinds(depth).map(t => ENEMY_KINDS[t]).filter(Boolean).map(t => swarmKind(t, 0.5));
  const kinds = light.length ? light : [swarmKind(ENEMY_KINDS.snake, 0.5)];
  const ring = (m.ring.cells || []).map(id => state.map.floors[id]).filter(Boolean);
  const list = [];
  for (let i = 0; i < n; i++) {
    const kind = kinds[Math.floor(R() * kinds.length)], mouth = m.mouths[(i + k) % m.mouths.length];
    const f = state.map.floors.filter(g => !g.fluid && Math.hypot(g.x + 0.5 - mouth.x, g.z + 0.5 - mouth.z) < 1.6 && walkable(g, kind.height ?? 0.9))
      .sort((a, b) => Math.hypot(a.x + 0.5 - mouth.x, a.z + 0.5 - mouth.z) - Math.hypot(b.x + 0.5 - mouth.x, b.z + 0.5 - mouth.z))[i % 3] ?? null;
    if (!f) continue;
    const [clo, chi] = coinRange(kind, level), id = `trial:${m.key}:hold${attempt}:${k}:${i}`;
    const e = makeEnemy({ id, level, coinDrop: Math.round((clo + chi) / 4), kind, f, x: f.x + 0.5, y: groundY(f, f.x + 0.5, f.z + 0.5), z: f.z + 0.5,
      yaw: Math.atan2(m.ring.x - f.x - 0.5, m.ring.z - f.z - 0.5) }, kind, i);
    e.siege = m.key;   // (kept out of a guardian room's posting, game/defence.js)
    e.defence = { post: ring.length ? ring[Math.floor(R() * ring.length)] : f, engage: true };
    raiders.add(id); list.push(e);
  }
  addEnemies(list);
  sfx('rumble', { volume: 0.4 });
  setStatus(k === 0 ? tr('They are coming from the dark!') : tr('Wave {n} of {of}!', { n: k + 1, of: HOLD.waves }));
}
// in the circle: a body within its radius, about its height
const inRing = (m, b) => Math.hypot(b.x - m.ring.x, b.z - m.ring.z) <= m.ring.r + 0.3 && Math.abs(b.y - m.ring.y) < 1.5;
function stepHold(m, s, dt, resolve) {
  if (s.phase !== 'running') return;
  for (const e of allEnemies()) if (raiders.has(e.id) && e.defence) e.defence.engage = true;
  if (mirroring()) return;
  // (the hold in the bits in tenths of a second: they go to the others as whole numbers)
  const hold = holdTime(state.map.depth);
  if (bodies().some(b => inRing(m, b))) { held = Math.min(hold, Math.max(held, held0(s)) + dt); s.bits.hold = Math.floor(held * 10); }
  const want = Math.min(HOLD.waves, Math.floor(held0(s) / hold * HOLD.waves) + 1);
  while ((s.bits.wave ?? 0) < want) { spawnWave(m, s, s.bits.wave ?? 0); s.bits.wave = (s.bits.wave ?? 0) + 1; }
  if (held0(s) >= hold) {   // the beacon flares: whoever is left flees into the dark
    const ids = raiders;
    removeEnemies(e => ids.has(e.id) && e.mode !== 'dead');
    raiders = new Set();
    resolve();
  }
}
// --- every frame ---------------------------------------------------------------------------------------

// the task's own step (game/trials.js updateTrial): the waves, the wardstones mending, the shards
// picked up by walking into them, the fading flames going out, and whether it is done
export function stepTask(m, s, dt, { resolve, use }) {
  if (!m.task || s.phase === 'resolved') return;
  if (m.kind === 'hold') { stepHold(m, s, dt, resolve); return; }
  // a shard is taken by walking into it too
  if (m.kind === 'shards' && player.hp > 0) for (const p of m.parts) {
    if (!s.bits[p.id] && Math.hypot(p.x - player.x, p.z - player.z) < 0.6 && Math.abs(p.y - player.y) < 1.3) use(p);
  }
  if (mirroring()) return;   // (the owner decides the rest)
  if (m.kind === 'keybearer' && bearerDown(m)) { resolve(); return; }
  if (m.kind === 'wardstones') {
    if (!wardsLeft(m).length) { resolve(); return; }
    // the wardstones mend the wounds of the enemies round them
    if ((mendT += dt) >= WARD.every) {
      mendT = 0;
      const wards = allEnemies().filter(e => e.ward === m.key && e.mode !== 'dead');
      for (const e of allEnemies()) {
        if (e.profile.ward || e.mode === 'dead' || e.hp >= e.profile.hp || !wards.some(w => Math.hypot(w.x - e.x, w.z - e.z) <= WARD.radius && Math.abs(w.y - e.y) < 3)) continue;
        e.hp = Math.min(e.profile.hp, Math.ceil(e.hp + e.profile.hp * WARD.mend));
      }
    }
  }
  if (m.kind === 'clear' && !standing(m).length) { resolve(); return; }
  if (m.kind === 'fading' && s.phase === 'running') {
    // all burning at once: done; none burning: the clock back to its start
    const lit = m.parts.filter(p => litNow(s.bits[p.id], s.t, m.burn));
    if (lit.length === m.parts.length) { resolve(); return; }
    if (!lit.length) { s.phase = 'idle'; s.t = 0; s.bits = {}; return; }
    // (the clock kept small: whole tenths of a second go to the others, under a thousand)
    if (s.t > 60) { s.t -= 30; for (const p of m.parts) if (s.bits[p.id]) s.bits[p.id] = Math.max(0, s.bits[p.id] - 300); }
  }
}

// The action key on one of the task's parts (game/trials.js usePart; fromOther: another player used
// it, we own the trial). true: it was the task's.
export function useTaskPart(m, s, p, fromOther, { resolve, show }) {
  if (!m.task) return false;
  if (p.type === 'hidden') { if (!fromOther) sfx('clink'); sfx('unlock', { delay: 0.15 }); resolve(); return true; }
  if (p.type === 'beacon') {
    if (s.phase !== 'idle') return true;
    s.phase = 'armed'; s.t = 0; s.bits.hold = 0; s.bits.wave = 0; held = 0;
    if (!fromOther) sfx('fireball');
    return 'armed';
  }
  if (p.type === 'shard') {
    if (s.bits[p.id]) return true;
    s.bits[p.id] = 1;
    sfx('pickup');
    keepTaskProgress(m, s);
    const n = m.parts.filter(q => s.bits[q.id]).length;
    if (n >= m.parts.length) resolve(); else { setStatus(tr('A shard: {n} of {of}', { n, of: m.parts.length })); show(); }
    return true;
  }
  if (p.type === 'lantern') {
    if (m.kind === 'fading') {
      if (litNow(s.bits[p.id], s.t, m.burn)) return true;
      if (s.phase === 'idle') { s.phase = 'running'; s.t = 0; }
      s.bits[p.id] = Math.round(s.t * 10) + 1;
    } else {
      if (s.bits[p.id]) return true;
      s.bits[p.id] = 1;
      keepTaskProgress(m, s);
    }
    if (!fromOther) sfx('fireball');
    const n = m.parts.filter(q => lanternLit(m, s, q)).length;
    if (n >= m.parts.length && m.kind === 'lanterns') resolve(); else show();
    return true;
  }
  return false;
}

// --- the HUD, the banner ------------------------------------------------------------------------------

// the HUD's line for a task: { line, fill }
export function taskHud(m, s) {
  const of = m.parts?.length ?? 0;
  if (m.kind === 'keybearer') return { line: tr('Defeat the keybearer: it carries the key'), fill: bearerDown(m) ? 1 : 0 };
  if (m.kind === 'wardstones') {
    const n = (m.wards || []).length, left = wardsLeft(m).length;
    return { line: tr('Break the wardstones: {left} of {n} left. They mend the wounds of those near them', { left, n }), fill: n ? 1 - left / n : 0 };
  }
  if (m.kind === 'clear') {
    const left = standing(m).length;
    return { line: tr('{n, plural, one {Clear the room: # enemy left} other {Clear the room: # enemies left}}', { n: left }), fill: 0 };
  }
  if (m.kind === 'lanterns') { const n = m.parts.filter(p => s.bits[p.id]).length; return { line: tr('Light every brazier: {n} of {of}', { n, of }), fill: of ? n / of : 0 }; }
  if (m.kind === 'fading') {
    const lit = m.parts.filter(p => litNow(s.bits[p.id], s.t, m.burn)), left = Math.min(...lit.map(p => (s.bits[p.id] - 1) / 10 + m.burn - s.t));
    return { line: lit.length ? tr('Light every brazier before the first goes out: {n} of {of} burning ({s} s)', { n: lit.length, of, s: Math.max(0, Math.ceil(left)) })
      : tr('Light every brazier: each burns only {s} s', { s: m.burn }), fill: lit.length ? Math.max(0, left / m.burn) : 0 };
  }
  if (m.kind === 'shards') { const n = m.parts.filter(p => s.bits[p.id]).length; return { line: tr('Find the shards: {n} of {of}', { n, of }), fill: of ? n / of : 0 }; }
  if (m.kind === 'hidden') return { line: tr('A hidden button opens the way. Look round: it glints when you come close'), fill: 0 };
  if (m.kind === 'hold') {
    if (s.phase === 'idle') return { line: tr('Light the beacon when you are ready, then hold its circle'), fill: 0 };
    const hold = holdTime(state.map.depth), k = held0(s) / hold, n = Math.floor(k * 100);
    if (s.phase === 'armed') return { line: tr('The beacon blazes: something stirs in the dark…'), fill: 0 };
    return { line: bodies().some(b => inRing(m, b)) ? tr('Hold the circle: {n}%', { n }) : tr('Back into the circle! ({n}%)', { n }), fill: k };
  }
  return { line: '', fill: 0 };
}
// what the banner says once a task is done (the way on, or the vault)
export const TASK_DONE = {
  keybearer: msg('The keybearer falls, and its key turns in the lock.'),
  wardstones: msg('The last wardstone breaks, and the seal with it.'),
  clear: msg('The room is clear, and the seal lifts.'),
  lanterns: msg('Every brazier burns, and the seal lifts.'),
  fading: msg('Every flame burns at once, and the seal lifts.'),
  shards: msg('The shards are whole again, and the seal lifts.'),
  hold: msg('The beacon flares: they flee into the dark.'),
  hidden: msg('Click! Something gives way.'),
};
// the enemies to point out (render/tasks.js): the keybearer, and the last few standing of a room to clear
export function taskMarks(m = state.map?.trial, s = state.trial) {
  if (!m?.task || !s || s.phase === 'resolved') return [];
  if (m.kind === 'keybearer') return allEnemies().filter(e => e.id === bearerId(m) && e.mode !== 'dead');
  if (m.kind === 'clear') { const left = standing(m); return left.length <= 3 ? left : []; }
  return [];
}

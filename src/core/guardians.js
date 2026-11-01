// Run-persistent guardian gates. Terrain/encounter identity never depends on unlock state.
import { DIRS } from './constants.js';
import { tr, noun } from '../i18n/i18n.js';
import { enemyWords, enemyName } from './enemies.js';
import { INTRO_LOCKED } from './intro.js';
import { TRIALS, isTrialGate, trialGate } from './trials.js';

export const GUARDIAN_COLOR = '#ff3fa8';
export const DESCENT_GUARDIAN_COLOR = '#ff9b35';
export const guardianColor = role => role === 'descent' ? DESCENT_GUARDIAN_COLOR : GUARDIAN_COLOR;
// Over its bar a guardian shows its kind's name (core/enemies.js): a side guardian's
// 'Guardian Spider', a descent guardian's 'Temp Boss Spider' (it holds the place of a boss to
// come), a real boss's own name (core/bosses.js).
export const guardianTitle = (role, kind) => `${role === 'descent' ? '♛' : '◆'} ${enemyName(kind)}`;
const bossName = boss => boss ? boss[0].toUpperCase() + boss.slice(1) : null;
// The guardian of map, as words a message says (src/i18n/i18n.js): a boss by his name, any other by
// its kind (game/enemyspawn.js guardianKind), else by its tier. kind: the guardian's, if known.
export function guardianCalled(map, kind) {
  if (map.guardian?.boss) return noun(bossName(map.guardian.boss), { proper: true });
  if (kind) return enemyWords(kind);
  return map.guardian?.role === 'descent' ? noun('Temp Boss', { caps: true }) : noun('guardian');
}
export const guardianLockMessage = (map, kind = null) => map.guardian?.role === 'descent'
  ? tr('Defeat {who:the} to unlock this descent', { who: guardianCalled(map, kind) })
  : tr('Defeat {who:the} to unlock this passage', { who: guardianCalled(map, kind) });
export const guardianId = key => `${key}:guardian`;
// what a trial's gate (`trial:<key>`, core/trials.js) says: in its own room what opens it, by the
// family of what the room holds (a puzzle, an event, a room task: map.trial, cubegen/trials/,
// cubegen/tasks.js) and its name; from the room beyond it only that it opens from the other side
function trialLockMessage(map, gate) {
  const t = gate === trialGate(map.key) && TRIALS[map.trial?.kind];
  if (!t) return tr('Barred: this way opens from the room beyond');
  const p = { trial: tr(t.name) };
  if (t.family === 'puzzle') return tr('Solve the puzzle ({trial}) to open the way on', p);
  if (t.family === 'task') return tr('Finish the room\'s task ({trial}) to open the way on', p);
  return tr('Master the trial ({trial}) to open the way on', p);
}

// what a locked portal (towards dir) says: a guardian's, a trial's or a room task's
// (trialLockMessage), an annex's sealed one (world/layout.js), or one of the beginning's
// (core/intro.js); kind: this arena's guardian's (a gate of another cube's guardian says only 'the
// guardian')
export function lockMessage(map, dir, kind = null) {
  const gate = map?.gateKeys?.[dir];
  if (gate?.startsWith('annex:')) return tr('Sealed. Somebody on this depth may know the way in.');
  if (INTRO_LOCKED[gate]) return tr(INTRO_LOCKED[gate]);
  if (isTrialGate(gate)) return trialLockMessage(map, gate);
  if (gate && gate !== map.key) return tr('Defeat the guardian to unlock this passage');
  return guardianLockMessage(map, kind);
}
export const gateLocked = (map, run) => !!map?.guardian && !run.unlockedGates.has(map.key);
export const portalLocked = (map, run, portal) => {
  const gate = portal.dir < 4 && map?.gateKeys?.[portal.dir];
  if (gate && !run.unlockedGates.has(gate)) return true;
  return portal.dir === map?.exit && gateLocked(map, run);
};

// Leaving a guardian's arena while the guardian lives (game/leavefight.js): any open side face
// out of it asks first, and only when the player steers out themselves (dx, dz: keys or a mouse
// order). A push (a blow, a gust, a throw) or a body that cannot act just presses against the
// face, so the fight stays in the arena.
export const leavingFight = (map, run, dir) => dir < 4 && gateLocked(map, run);
// ... at the start of a sentence ('The Guardian Spider')
export const guardianName = (map, kind = null) => tr('{who:The}', { who: guardianCalled(map, kind) });
export function steersOut(p, dir, dx, dz) {
  const [nx, nz] = DIRS[dir];
  return !p.ragdoll && !p.held && !p.getUp && !p.down && !(p.stun > 0) && p.hp > 0 && dx * nx + dz * nz > 0;
}

// Ordinary kills made during this visit roll back on death; an opened gate never does.
// learn: memory.html#death (see learn/README.md)
export function restoreDefeated(run, before) {
  const permanent = new Set([...run.unlockedGates].map(guardianId));
  for (const id of run.defeated) if (!before.has(id) && !permanent.has(id)) run.defeated.delete(id);
}

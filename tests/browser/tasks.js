// Browser checks for the room tasks (docs/trials.md "Room tasks"), in the real game with the real
// worker. Load the game with ?dev=1&trial=<kind> (a task kind: every depth gets tasks of it), then
// from the devtools console:
//   await (await import('./tests/browser/tasks.js')).runTaskChecks('lanterns')
// Into the room before, through its portal into the task's room: nothing sealed, the exit shut, the
// HUD names the task. Then each kind its own way: braziers lit (one of them kept after leaving and
// coming back, lost again with a death in the room), shards walked into, the hidden button pressed,
// the keybearer and the wardstones (one mending a wounded enemy first) and every enemy of a room to
// clear defeated, the beacon's circle held. Done: the exit open, the HUD gone.
import { player, state } from '../../src/game/state.js';
import { goTrial, takePortal } from '../../src/game/dev.js';
import { hurt } from '../../src/game/flow.js';
import { pendingAction, useAction } from '../../src/game/action.js';
import { sealedIn } from '../../src/game/trials.js';
import { allEnemies } from '../../src/game/enemies.js';
import { portalLocked } from '../../src/core/guardians.js';
import { damageEnemy } from '../../src/core/combat.js';
import { taskMark, holdTime, WARD } from '../../src/core/tasks.js';
import { answerDeath } from '../../src/game/deathask.js';

const check = (value, message) => { if (!value) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, what, ms = 8000) {
  for (let t = 0; t < ms && !test(); t += 50) await delay(50);
  check(test(), `timed out: ${what}`);
}
// stand at part p (a step off it, facing it) and use it with the action key
async function use(p) {
  Object.assign(player, { x: p.x + 0.6, y: p.y, z: p.z, vx: 0, vz: 0 });
  await delay(150);
  check(pendingAction()?.target?.id === p.id, `${p.id} in reach (${pendingAction()?.target?.id ?? 'nothing'})`);
  useAction();
  await delay(100);
}
const kill = e => { damageEnemy(e, e.hp); };
// into the room of task t, through its portal from the room before
async function enter(t) {
  await goTrial(t.kind, t.depth, t.key);
  await until(() => !state.transitioning && state.cubeKey === t.from, 'into the room before', 30000);
  takePortal(state.map.portals.find(p => p.dir === t.fromDir));
  await until(() => !state.transitioning && state.cubeKey === t.key, 'into the task room', 30000);
  await delay(300);
}

export async function runTaskChecks(kind = 'lanterns', role = 'route') {
  const results = [];
  const all = [];
  for (let d = 1; d < 20; d++) all.push(...(state.cubes.layout(d).tasks ?? []).filter(t => t.kind === kind && t.role === role));
  check(state.dev && all.length, `load the game with ?dev=1&trial=${kind}`);
  state.devPassive = kind !== 'hold';
  // (a room where it was built as planned: the generator falls back to the hidden button now and then)
  let t = null;
  for (const c of all.slice(0, 4)) { await enter(c); t = c; if (state.map.trial?.kind === kind) break; }
  const m = state.map.trial;
  check(m?.task && m.kind === kind, `the room's task: ${m?.kind}`);
  check(state.trial?.phase === 'idle' && !sealedIn(), 'nothing sealed');
  if (role === 'route') check(portalLocked(state.map, state.run, { dir: t.exit }), 'the exit shut until done');
  check(!document.getElementById('trial-hud').hidden, 'the HUD names the task');
  results.push('entered');
  if (kind === 'lanterns') {
    const [first, ...rest] = m.parts;
    await use(first);
    check(state.trial.bits[first.id] === 1 && state.run.trials.get(taskMark(m.key)) === 1, 'lit, and kept');
    // out and back in: still lit
    takePortal(state.map.portals.find(p => p.dir === (t.fromDir ^ 1)));
    await until(() => !state.transitioning && state.cubeKey === t.from, 'out again', 30000);
    takePortal(state.map.portals.find(p => p.dir === t.fromDir));
    await until(() => !state.transitioning && state.cubeKey === t.key, 'in again', 30000);
    check(state.trial.bits[first.id] === 1, 'still lit after leaving and coming back');
    results.push('kept');
    // lit, then a death in the room: put back as it was when entered (with a third to light still)
    if (rest.length >= 2) {
      await use(rest[0]);
      check(state.trial.bits[rest[0].id] === 1, 'the second lit');
      const god = player.god;
      player.god = false;
      try { hurt(player.hp + 1, 'a test'); } finally { player.god = god; }
      answerDeath(true);
      await until(() => !state.transitioning && player.hp === player.maxHp, 'back after dying', 15000);
      check(state.trial.bits[first.id] === 1 && !state.trial.bits[rest[0].id], 'the one lit before stays lit, the one since is out again');
      results.push('death');
    }
    for (const p of rest) if (state.trial.phase !== 'resolved') await use(p);
  }
  if (kind === 'fading') {
    await use(m.parts[0]);
    check(state.trial.phase === 'running', 'the clock runs');
    for (const p of m.parts.slice(1)) await use(p);
  }
  if (kind === 'shards') for (const p of m.parts) {
    Object.assign(player, { x: p.x, y: p.y, z: p.z, vx: 0, vz: 0 });
    await until(() => state.trial.bits[p.id] || state.trial.phase === 'resolved', `${p.id} taken by walking into it`, 3000);
  }
  if (kind === 'hidden') await use(m.parts[0]);
  if (kind === 'keybearer') {
    const e = allEnemies().find(q => q.keybearer === m.key);
    check(e && e.profile.keybearer, 'the keybearer is there');
    kill(e);
  }
  if (kind === 'wardstones') {
    const wards = allEnemies().filter(q => q.ward === m.key);
    check(wards.length === m.wards.length, `${wards.length} wardstones`);
    // a wounded enemy near one is mended (moved there, still: the enemies are passive)
    const other = allEnemies().find(q => !q.ward && q.mode !== 'dead' && q.respawn === state.cubeKey);
    if (other) {
      Object.assign(other, { x: wards[0].x + 1.2, y: wards[0].y, z: wards[0].z });
      other.hp = Math.ceil(other.profile.hp / 2);
      const before = other.hp;
      await delay(WARD.every * 1000 + 400);
      check(other.hp > before, 'a wardstone mends the wounded near it');
      results.push('mended');
    }
    for (const w of wards) kill(w);
  }
  if (kind === 'clear') for (const e of allEnemies().filter(q => q.respawn === state.cubeKey && q.mode !== 'dead')) kill(e);
  if (kind === 'hold') {
    const b = m.parts.find(p => p.type === 'beacon');
    await use(b);
    await until(() => state.trial.phase === 'running', 'lit, running', 6000);
    Object.assign(player, { x: m.ring.x, y: m.ring.y, z: m.ring.z, vx: 0, vz: 0 });
    await delay(1500);
    check(allEnemies().some(e => e.id.startsWith(`trial:${m.key}:hold`)), 'the first wave');
    check((state.trial.bits.hold ?? 0) > 5, 'the hold fills in the circle');
    state.trial.bits.hold = (holdTime(state.map.depth) - 0.5) * 10;
  }
  await until(() => state.trial.phase === 'resolved', 'done', 8000);
  if (role === 'route') check(!portalLocked(state.map, state.run, { dir: t.exit }), 'the exit open');
  await delay(200);
  check(document.getElementById('trial-hud').hidden, 'the HUD gone');
  if (kind === 'hold') check(!allEnemies().some(e => e.id.startsWith(`trial:${m.key}:hold`) && e.mode !== 'dead'), 'the rest fled');
  results.push('done');
  state.devPassive = true;
  return results;
}

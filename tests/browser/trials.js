// Browser checks for the trial rooms (docs/trials.md), in the real game with the real worker.
// Load the game with ?dev=1&trial=flood, then from the devtools console:
//   await (await import('./tests/browser/trials.js')).runTrialChecks()
// Into the room before, through its portal into a flood, armed by stepping off the pad, sealed in
// (portals, open faces, both scrolls refuse), drowned, back in the room before beside the portal,
// in again to a room as built, pulled out of it by the robot (the attempt spent, out and in again),
// and resolved with the button.
import { player, state } from '../../src/game/state.js';
import { goTrial, takePortal } from '../../src/game/dev.js';
import { hurt } from '../../src/game/flow.js';
import { groundAt } from '../../src/physics/collide.js';
import { checkPortals } from '../../src/game/portals.js';
import { useTownPortal } from '../../src/game/townportal.js';
import { useRoomPortal } from '../../src/game/roomportal.js';
import { pendingAction, useAction } from '../../src/game/action.js';
import { sealedIn, sealedDirs } from '../../src/game/trials.js';
import { portalLocked } from '../../src/core/guardians.js';
import { trialFluid } from '../../src/physics/fluid.js';
import { DIRS } from '../../src/core/constants.js';
import { answerDeath } from '../../src/game/deathask.js';

const check = (value, message) => { if (!value) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, what, ms = 8000) {
  for (let t = 0; t < ms && !test(); t += 50) await delay(50);
  check(test(), `timed out: ${what}`);
}
// (the enemies stand still meanwhile: what is checked here is the trials)
state.devPassive = true;
const seals = () => state.world.portalFx.filter(f => f.obj.userData.portal.kind === 'side').map(f => f.obj.children.at(-1).visible);

// A slide puzzle (in a vault where one is: ?trial=slide puts one in a branch and one on the
// route of every depth): onto the ice through its gap, slid along its own solution with the keys,
// solved; a vault's chest opens only then.
export async function runSlideChecks(role = 'branch') {
  const { slideStop } = await import('../../src/core/trials.js');
  const { chestInReach } = await import('../../src/game/chests.js');
  const all = [];
  for (let d = 1; d < 20; d++) all.push(...state.cubes.layout(d).trials.filter(t => t.kind === 'slide' && t.role === role));
  check(state.dev && all.length, 'load the game with ?dev=1&trial=slide');
  const t = all[0];
  await goTrial('slide', t.depth, t.key);
  await until(() => !state.transitioning && state.cubeKey === t.from, 'into the room before');
  takePortal(state.map.portals.find(p => p.dir === t.fromDir));
  await until(() => !state.transitioning && state.cubeKey === t.key, 'into the puzzle room');
  const m = state.map.trial.puzzles[0], F = m.field, SD = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  check(state.trial.phase === 'idle' && !sealedIn(), 'a puzzle never seals');
  const site = state.map.rewardSites[0];
  if (role === 'branch') {
    Object.assign(player, { x: site.approach.x, y: site.approach.y, z: site.approach.z, vx: 0, vz: 0 });
    await delay(200);
    check(!chestInReach(), 'the vault\'s chest is shut until it is solved');
  }
  // in through the gap, then the solution, one push each
  const g = m.entryGap;
  Object.assign(player, { x: g % 16 + 0.5, y: m.deck.level * 0.5, z: Math.floor(g / 16) + 0.5, vx: 0, vz: 0 });
  const now = () => [Math.floor(player.x) - m.deck.x0, Math.floor(player.z) - m.deck.z0];
  let at = slideStop(F, F.entry.x, F.entry.z, F.entry.side ^ 1);   // stepping in slides straight on
  player.autoDir = SD[F.entry.side ^ 1];
  await until(() => `${now()}` === `${at}` && Math.hypot(player.vx, player.vz) < 0.1, 'onto the ice', 3000);
  player.autoDir = null;
  await delay(300);
  for (const d of m.check.solution) {
    player.autoDir = SD[d]; await delay(120); player.autoDir = null;
    at = slideStop(F, at[0], at[1], d);
    await until(() => `${now()}` === `${at}` && Math.hypot(player.vx, player.vz) < 0.1, `a slide to ${at}`, 3000);
    await delay(200);
  }
  await until(() => state.trial.phase === 'resolved', 'solved on the goal plate', 3000);
  check(state.run.unlockedGates.has(t.gate), 'its gate into the run');
  if (role === 'branch') {
    Object.assign(player, { x: site.approach.x, y: site.approach.y, z: site.approach.z, vx: 0, vz: 0 });
    await delay(300);
    check(chestInReach(), 'the vault\'s chest opens now');
  } else check(!portalLocked(state.map, state.run, { dir: t.exit }), 'the way on is open');
  return ['solved', role];
}

// A sunken room (?trial=sunken, or ?trial=sunken:slide,crates for its two puzzles): in from up
// high, each stage's puzzle solved in turn along its own solution (as in a room of its own), the water
// sinking a stage each time, the next platform dry; drained, the way on open.
export async function runSunkenChecks() {
  const { slideStop } = await import('../../src/core/trials.js');
  const all = [];
  for (let d = 1; d < 20; d++) all.push(...state.cubes.layout(d).trials.filter(t => t.kind === 'sunken'));
  check(state.dev && all.length, 'load the game with ?dev=1&trial=sunken');
  const t = all[0];
  await goTrial('sunken', t.depth, t.key);
  await until(() => !state.transitioning && state.cubeKey === t.from, 'into the room before');
  takePortal(state.map.portals.find(p => p.dir === t.fromDir));
  await until(() => !state.transitioning && state.cubeKey === t.key, 'into the sunken room');
  const m = state.map.trial, SD = [[1, 0], [-1, 0], [0, 1], [0, -1]], out = [];
  check(Math.abs(player.y - 8) < 0.6, 'in from up high');
  for (const [i, pz] of m.puzzles.entries()) {
    check(state.trial.stage === i, `at stage ${i}`);
    const level = trialFluid()?.y;
    check(level != null && level < pz.deck.level * 0.5 && level > (m.puzzles[i + 1]?.deck.level ?? 0) * 0.5, `the water between platform ${i} and the next`);
    if (pz.kind !== 'slide') {   // a grid puzzle: its parts as its solver says (crates: pushed), then off its field
      const { puzzleMoves } = await import('../../src/game/trials.js');
      // (a body on a plate holds it too: the stage may be done before the last push)
      if (pz.kind === 'crates') for (const [c, d] of pz.check.solution) { if (state.trial.stage > i) break; await pushCrate(pz, c, d); }
      for (const [part, n] of puzzleMoves(pz, state.trial) ?? []) {
        const spots = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => ({ x: part.x + dx * 0.8, z: part.z + dz * 0.8 }));
        const spot = spots.find(q => !m.parts.some(o => o !== part && Math.hypot(o.x - q.x, o.z - q.z) < 0.6)) ?? spots[0];
        Object.assign(player, { x: spot.x, y: part.y, z: spot.z, vx: 0, vz: 0, yaw: Math.atan2(part.x - spot.x, part.z - spot.z) });
        await delay(80);
        for (let k = 0; k < n; k++) { useAction(); await delay(30); }
      }
      // (off it: where you stand to begin it, on the platform in front of it)
      Object.assign(player, { x: pz.approach % 16 + 0.5, y: pz.deck.level * 0.5, z: Math.floor(pz.approach / 16) + 0.5, vx: 0, vz: 0 });
      await until(() => state.trial.stage === i + 1 || state.trial.phase === 'resolved', `stage ${i} solved`, 3000);
      await delay(4500);
      out.push(`stage ${i} (${pz.kind})`);
      continue;
    }
    const F = pz.field, g = pz.entryGap, now = () => [Math.floor(player.x) - pz.deck.x0, Math.floor(player.z) - pz.deck.z0];
    Object.assign(player, { x: g % 16 + 0.5 + SD[F.entry.side][0], y: pz.deck.level * 0.5, z: Math.floor(g / 16) + 0.5 + SD[F.entry.side][1], vx: 0, vz: 0 });
    let at = slideStop(F, F.entry.x, F.entry.z, F.entry.side ^ 1);
    player.autoDir = SD[F.entry.side ^ 1];
    await until(() => `${now()}` === `${at}` && Math.hypot(player.vx, player.vz) < 0.1, `onto the ice of stage ${i}`, 4000);
    player.autoDir = null;
    await delay(300);
    for (const d of pz.check.solution) {
      player.autoDir = SD[d]; await delay(120); player.autoDir = null;
      at = slideStop(F, at[0], at[1], d);
      await until(() => `${now()}` === `${at}` && Math.hypot(player.vx, player.vz) < 0.1, `a slide to ${at}`, 3000);
      await delay(200);
    }
    await until(() => state.trial.stage === i + 1 || state.trial.phase === 'resolved', `stage ${i} solved`, 3000);
    await delay(4500);   // the water sinks
    out.push(`stage ${i} (slide)`);
  }
  await until(() => !trialFluid(), 'drained', 8000);
  check(state.trial.phase === 'resolved' && state.run.unlockedGates.has(t.gate), 'drained, resolved');
  check(!portalLocked(state.map, state.run, { dir: t.exit }), 'the way on is open');
  return [...out, 'drained'];
}

// A grid puzzle (?trial=mirror or braziers): its parts used as its own solver says (each
// from beside it, with the action key's choice checked), then off the field (a body blocks a beam):
// solved, the way on open.
export async function runGridChecks(kind) {
  const { puzzleMoves } = await import('../../src/game/trials.js');
  const all = [];
  for (let d = 1; d < 20; d++) all.push(...state.cubes.layout(d).trials.filter(t => t.kind === kind && t.role === 'route'));
  check(state.dev && all.length, `load the game with ?dev=1&trial=${kind}`);
  const t = all[0];
  await goTrial(kind, t.depth, t.key);
  await until(() => !state.transitioning && state.cubeKey === t.from, 'into the room before');
  takePortal(state.map.portals.find(p => p.dir === t.fromDir));
  await until(() => !state.transitioning && state.cubeKey === t.key, 'into the puzzle room');
  const pz = state.map.trial.puzzles[0];
  check(state.trial.phase === 'idle' && portalLocked(state.map, state.run, { dir: t.exit }), 'unsolved, the way on shut');
  let used = 0;
  for (const [part, n] of puzzleMoves(pz, state.trial)) {
    // stand beside it (the nearest free spot of the four), and the action key wants it
    const spots = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => ({ x: part.x + dx * 0.8, z: part.z + dz * 0.8 }));
    const spot = spots.find(q => !state.map.trial.parts.some(o => o !== part && Math.hypot(o.x - q.x, o.z - q.z) < 0.6)) ?? spots[0];
    Object.assign(player, { x: spot.x, y: part.y, z: spot.z, vx: 0, vz: 0, yaw: Math.atan2(part.x - spot.x, part.z - spot.z) });
    await delay(80);
    check(pendingAction()?.target?.id === part.id, `the action key on ${part.id}`);
    for (let k = 0; k < n; k++) { useAction(); used++; await delay(30); }
  }
  // off the field, onto the walkway beside it
  const D = pz.deck;
  Object.assign(player, { x: D.x0 - 0.5, y: D.level * 0.5, z: D.z0 - 0.5, vx: 0, vz: 0 });
  await until(() => state.trial.phase === 'resolved', 'solved', 3000);
  check(!portalLocked(state.map, state.run, { dir: t.exit }), 'the way on is open');
  return [kind, `${used} uses`];
}

// crate i of puzzle pz pushed the way d: walking into it from the cell behind it
const crateAt = (pz, i) => state.trial.bits[pz.parts.find(p => p.type === 'crate' && p.i === i).id];
async function pushCrate(pz, i, d) {
  const F = pz.field, D = pz.deck, SD = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const c = crateAt(pz, i), bx = D.x0 + c % F.w - SD[d][0] + 0.5, bz = D.z0 + Math.floor(c / F.w) - SD[d][1] + 0.5;
  Object.assign(player, { x: bx, y: D.level * 0.5, z: bz, vx: 0, vz: 0 });
  player.autoDir = SD[d];
  await until(() => crateAt(pz, i) !== c, `crate ${i} pushed ${d}`, 3000);
  player.autoDir = null;
  await delay(150);
}

// Crates (?trial=crates): the reset lever puts a pushed crate back, then the solver's pushes, each by
// walking into the crate from behind it: solved, the way on open
export async function runCratesChecks(kind = 'crates') {
  const all = [];
  for (let d = 1; d < 20; d++) all.push(...state.cubes.layout(d).trials.filter(t => t.kind === kind && t.role === 'route'));
  check(state.dev && all.length, `load the game with ?dev=1&trial=${kind}`);
  const t = all[0];
  await goTrial(kind, t.depth, t.key);
  await until(() => !state.transitioning && state.cubeKey === t.from, 'into the room before');
  takePortal(state.map.portals.find(p => p.dir === t.fromDir));
  await until(() => !state.transitioning && state.cubeKey === t.key, 'into the puzzle room');
  const pz = state.map.trial.puzzles[0];
  const crate = i => crateAt(pz, i), push = (i, d) => pushCrate(pz, i, d);
  // a push, then the reset lever
  const [i0, d0] = pz.check.solution[0], before = crate(i0);
  await push(i0, d0);
  const lever = pz.parts.find(p => p.type === 'reset');
  Object.assign(player, { x: lever.x, y: lever.y, z: lever.z, vx: 0, vz: 0 });
  await delay(100);
  check(pendingAction()?.target?.type === 'reset', 'the reset lever in reach');
  useAction();
  check(crate(i0) === before, 'the reset lever puts the crates back');
  for (const [i, d] of pz.check.solution) await push(i, d);
  await until(() => state.trial.phase === 'resolved', 'solved', 3000);
  check(!portalLocked(state.map, state.run, { dir: t.exit }), 'the way on is open');
  return [kind, `${pz.check.solution.length} pushes`];
}

// The timed gate (?trial=timedgate): the exit sealed; the lever on the perch opens it, it shuts
// again after T s; pulled again and the generator's way run back (teleported along it at RUN_SPEED):
// through, solved for good
export async function runTimedChecks() {
  const all = [];
  for (let d = 1; d < 20; d++) all.push(...state.cubes.layout(d).trials.filter(t => t.kind === 'timedgate'));
  check(state.dev && all.length, 'load the game with ?dev=1&trial=timedgate');
  const t = all[0];
  await goTrial('timedgate', t.depth, t.key);
  await until(() => !state.transitioning && state.cubeKey === t.from, 'into the room before');
  takePortal(state.map.portals.find(p => p.dir === t.fromDir));
  await until(() => !state.transitioning && state.cubeKey === t.key, 'into the puzzle room');
  const m = state.map.trial, pz = m.puzzles[0], lever = pz.parts[0];
  check(sealedDirs().includes(t.exit), 'the exit sealed');
  const pull = async () => {
    Object.assign(player, { x: lever.x, y: lever.y, z: lever.z + 0.45, vx: 0, vz: 0 });
    await delay(80);
    check(pendingAction()?.target?.id === lever.id, 'the lever in reach');
    useAction();
  };
  await pull();
  await until(() => !sealedDirs().includes(t.exit), 'the exit opens', 2000);
  await until(() => sealedDirs().includes(t.exit), 'the exit shuts again', (pz.T + 2) * 1000);
  await pull();
  // the way back, at the run's pace
  const path = m.check.path, t0 = performance.now();
  for (const p of path) {
    await until(() => (performance.now() - t0) / 1000 >= p.t, 'the run', 30000);
    Object.assign(player, { x: p.x, y: p.y, z: p.z, vx: 0, vz: 0 });
  }
  await until(() => state.trial.phase === 'resolved', 'through the gate', 2000);
  check(!portalLocked(state.map, state.run, { dir: t.exit }), 'the way on is open');
  return ['timedgate', `${pz.check.run} s run, open ${pz.T} s`];
}

// The runes (?trial=runes): no order shown before the tablet is read; the tablet in its room (one
// before the rune room) read; a wrong press puts the stones out; the order pressed: solved
export async function runRunesChecks() {
  const all = [];
  for (let d = 1; d < 20; d++) all.push(...state.cubes.layout(d).trials.filter(t => t.kind === 'runes' && t.role === 'route'));
  check(state.dev && all.length, 'load the game with ?dev=1&trial=runes');
  const t = all[0];
  check(t.clue && state.cubes.layout(t.depth).route.indexOf(t.clue) < state.cubes.layout(t.depth).route.indexOf(t.key), 'the clue room before the rune room');
  const { whenReady } = await import('../../src/game/hud.js');
  const { enterCube } = await import('../../src/game/flow.js');
  const c = await whenReady(state.cubes.get(t.clue));
  enterCube(c, c.map.portals.find(p => p.kind === 'side').dir);
  await until(() => state.cubeKey === t.clue && !state.transitioning, 'into the clue room');
  const tab = state.map.clues.find(c => c.key === t.key);
  check(tab && tab.key === t.key, 'the tablet is here');
  await delay(500);
  Object.assign(player, { x: tab.x + 0.7, y: tab.y, z: tab.z, vx: 0, vz: 0 });
  await until(() => pendingAction()?.target?.type === 'tablet', 'the tablet in reach', 2000);
  useAction();
  check(state.run.trials.has(`clue:${t.key}`), 'read: remembered');
  await goTrial('runes', t.depth, t.key);
  await until(() => !state.transitioning && state.cubeKey === t.from, 'into the room before');
  takePortal(state.map.portals.find(p => p.dir === t.fromDir));
  await until(() => !state.transitioning && state.cubeKey === t.key, 'into the rune room');
  const pz = state.map.trial.puzzles[0], stones = pz.parts.filter(p => p.type === 'runestone');
  check(pz.field.order.map(i => pz.field.glyphs[i]).join('') === tab.glyphs.join(''), 'the tablet tells the room\'s order');
  const press = async i => {
    const p = stones.find(q => q.i === i);
    Object.assign(player, { x: p.x + 0.6, y: p.y, z: p.z, vx: 0, vz: 0 });
    await delay(100);
    check(pendingAction()?.target?.id === p.id, `stone ${i} in reach`);
    useAction();
    await delay(50);
  };
  const n = () => state.trial.bits[`${pz.id}:n`] ?? 0;
  await press(pz.field.order[0]);
  check(n() === 1, 'the first lights');
  await press(pz.field.order[2]);
  check(n() === 0, 'a wrong one puts them out');
  for (const i of pz.field.order) await press(i);
  await until(() => state.trial.phase === 'resolved', 'solved', 3000);
  check(!portalLocked(state.map, state.run, { dir: t.exit }), 'the way on is open');
  return ['runes', tab.glyphs.join('')];
}

export async function runTrialChecks(kind = 'flood') {
  const results = [];
  const all = [];
  for (let d = 1; d < 20; d++) all.push(...state.cubes.layout(d).trials.filter(t => t.kind === kind));
  check(state.dev && all.length, `load the game with ?dev=1&trial=${kind}`);
  const t = all[0];
  // the room before, facing the portal into the trial room
  await goTrial(kind, t.depth, t.key);
  await until(() => !state.transitioning && state.cubeKey === t.from, 'into the room before');
  const q = state.map.portals.find(p => p.dir === t.fromDir);
  check(state.map.trialFaces[t.fromDir] === kind, 'the room before knows the trial behind its portal');
  results.push('room before');
  // in through its portal
  takePortal(q);
  await until(() => !state.transitioning && state.cubeKey === t.key, 'into the trial room');
  check(state.trial?.phase === 'idle' && !sealedIn(), 'the trial waits, idle');
  check(portalLocked(state.map, state.run, { dir: t.exit }), 'the exit is locked until resolved');
  // stepping off the pad arms it, and seals every portal
  const [ax, az] = DIRS[t.fromDir];
  player.autoDir = [ax, az];
  if (kind === 'siege' || kind === 'chase') {   // (armed by lighting the beacon or taking the relic, not by stepping off the pad)
    await delay(1000);
    player.autoDir = null;
    check(state.trial.phase === 'idle', 'stepping off the pad arms nothing');
    const b = state.map.trial.parts.find(p => p.type === 'beacon' || p.type === 'relic');
    Object.assign(player, { x: b.x + 0.8, y: b.y, z: b.z, vx: 0, vz: 0 });
    await delay(150);
    useAction();
  }
  await until(() => state.trial.phase !== 'idle', 'armed by stepping off the pad', 4000);
  player.autoDir = null;
  check(sealedIn(), 'sealed while armed');
  await delay(300);
  check(seals().every(Boolean), 'every portal shows its seal');
  // nothing takes you out: the entry portal, the scrolls
  const entry = state.map.portals.find(p => p.dir === (t.fromDir ^ 1));
  Object.assign(player, { x: entry.x + 0.5, z: entry.z + 0.5, y: entry.y, vx: DIRS[entry.dir][0], vz: DIRS[entry.dir][1] });
  state.portalLock = 0; state.boundaryLock = -1;
  checkPortals(DIRS[entry.dir][0], DIRS[entry.dir][1], 0.1);
  check(!state.transitioning, 'the entry portal refuses while sealed');
  check(!useTownPortal() && !useRoomPortal(), 'the scrolls refuse while sealed');
  results.push('sealed');
  // dying in it: back in the room before, beside the portal, facing it, the trial room put back
  await delay(200);
  hurt(player.hp + 1, 'a test'); answerDeath(true);   // "You died": respawn (game/deathask.js)
  await until(() => !state.transitioning && state.cubeKey === t.from, 'back in the room before after dying');
  check(player.hp === player.maxHp, 'at full health');
  const back = state.map.portals.find(p => p.dir === t.fromDir);
  check(Math.hypot(player.x - back.x - 0.5, player.z - back.z - 0.5) > 1, 'beside the portal, not on it');
  check(Math.abs(Math.sin(player.yaw) - DIRS[t.fromDir][0]) < 0.01 && Math.abs(Math.cos(player.yaw) - DIRS[t.fromDir][1]) < 0.01, 'facing it');
  check(!trialFluid(), 'no water here');
  results.push('died, back before');
  // walking in again: the room as built
  takePortal(back);
  await until(() => !state.transitioning && state.cubeKey === t.key, 'into the trial room again');
  check(state.trial.phase === 'idle', 'idle again');
  // the robot pulls them out of its fluid: back at the start, for what it costs; the attempt spent
  // (the seals open, its water drains, nothing is put back, stepping off the pad arms nothing); out
  // and in again, a new attempt
  if (kind === 'flood' || kind === 'collapse') {
    player.autoDir = [ax, az];
    await until(() => state.trial.phase !== 'idle', 'armed again', 4000);
    player.autoDir = null;
    await until(() => state.trial.phase === 'running', 'running', 6000);
    const on = state.map.trial.check.path.at(-3);
    Object.assign(player, { x: on.x, y: on.y, z: on.z, vx: 0, vz: 0 });
    const { rescue } = await import('../../src/game/rescue.js');
    check(rescue(state.map.trial.fluid, 0, player.y + 0.5), 'the robot comes');
    await until(() => !player.rescue, 'set down', 8000);
    check(state.trial.phase === 'spent' && !sealedIn(), 'the attempt is spent, the seals open');
    check(Math.hypot(player.x - state.arrival.x, player.z - state.arrival.z) < 0.6, 'back at the start');
    check(!trialFluid() || kind === 'collapse', 'its water drained');
    if (kind === 'collapse') {   // (all of the crust falls away: nobody crosses to the exit that stays shut)
      await delay(300);
      check(state.map.trial.crust.every(q => { const f = state.map.floors[q.f]; return groundAt(f.x + .5, f.z + .5, Math.max(...f.cs) + .1, 0).s !== f; }), 'the crust all gone');
    }
    player.autoDir = [ax, az]; await delay(800); player.autoDir = null;
    check(state.trial.phase === 'spent', 'stepping off the pad arms nothing');
    takePortal(state.map.portals.find(p => p.dir === (t.fromDir ^ 1)));
    await until(() => !state.transitioning && state.cubeKey === t.from, 'out into the room before');
    takePortal(back);
    await until(() => !state.transitioning && state.cubeKey === t.key, 'into the trial room again');
    check(state.trial.phase === 'idle', 'a new attempt: idle');
    results.push('pulled out, spent');
  }
  // resolved by the button on the summit (flood)
  // the cold: armed, the meter rises away from the braziers, and drops by a lit one
  if (kind === 'cold') {
    const path = state.map.trial.check.path, first = state.map.trial.parts.find(p => p.type === 'warm');
    Object.assign(player, { x: path[0].x, y: path[0].y, z: path[0].z, vx: 0, vz: 0 });
    player.autoDir = DIRS[t.fromDir];
    await until(() => state.trial.phase === 'running', 'running', 6000);
    player.autoDir = null;
    const far = state.map.trial.check.path.at(-3);
    Object.assign(player, { x: far.x, y: far.y, z: far.z, vx: 0, vz: 0 });
    await delay(1500);
    const before = Number(document.getElementById('trial-line').textContent.match(/\d+/)[0]);
    check(before > 0, `the cold rises (${before}%)`);
    Object.assign(player, { x: first.x + 0.7, y: first.y, z: first.z, vx: 0, vz: 0 });
    await delay(150);
    check(pendingAction()?.target?.id === first.id, 'the first brazier in reach');
    useAction();
    await until(() => state.trial.bits[first.id] === 1, 'the brazier lit', 3000);
    await delay(1200);
    check(Number(document.getElementById('trial-line').textContent.match(/\d+/)[0]) < before, 'warm by it the cold drops');
    results.push('the cold');
  }
  // the storm: armed, a gust pulls whoever stands out on the ramp off the hill, not one behind a boulder
  if (kind === 'storm') {
    const m = state.map.trial, path = m.check.path, exposed = new Set(m.exposed);
    Object.assign(player, { x: path[0].x, y: path[0].y, z: path[0].z, vx: 0, vz: 0 });
    player.autoDir = DIRS[t.fromDir];
    await until(() => state.trial.phase === 'running', 'running', 6000);
    player.autoDir = null;
    const { stormPhase } = await import('../../src/core/trials.js');
    const cell = p => Math.floor(p.z) * 16 + Math.floor(p.x);
    const open = path.find(p => exposed.has(cell(p)));
    const cover = path.find((p, i) => i > path.indexOf(open) && !exposed.has(cell(p)) && m.check.path.length - i > 3);
    await until(() => stormPhase(state.trial.t).phase === 'warning', 'a warning', 9000);
    const floorAt = q => state.map.cols[Math.floor(q.z) * 16 + Math.floor(q.x)].find(f => !f.fluid);
    for (const [q, moved] of [[open, true], [cover, false]]) {
      await until(() => stormPhase(state.trial.t).phase === 'warning', 'a warning', 9000);
      const y = floorAt(q).top * 0.5;
      Object.assign(player, { x: q.x, y, z: q.z, vx: 0, vz: 0 });
      await until(() => stormPhase(state.trial.t).phase === 'gust', 'the gust', 3000);
      await delay(800);
      const d = Math.hypot(player.x - q.x, player.z - q.z);
      if (player.hp > 0) check(moved ? d > 0.5 || player.y < y - 0.4 : d < 0.2, `${moved ? 'out in the open' : 'in shelter'}: carried ${d.toFixed(2)}`);   // (out: off its cell, or down over the edge)
    }
    results.push('the gusts');
    if (player.hp <= 0 || state.cubeKey !== t.key) return results;
  }
  // the siege: idle until the beacon is lit; waves come; holding the ring fills it
  if (kind === 'siege') {
    const m = state.map.trial, b = m.parts.find(p => p.type === 'beacon');
    player.autoDir = DIRS[t.fromDir];
    await delay(1200);
    player.autoDir = null;
    check(state.trial.phase === 'idle', 'stepping off the pad does not start it');
    Object.assign(player, { x: b.x + 0.8, y: b.y, z: b.z, vx: 0, vz: 0 });
    await delay(150);
    check(pendingAction()?.target?.id === 'beacon', 'the beacon in reach');
    useAction();
    await until(() => state.trial.phase === 'running', 'lit, running', 6000);
    await delay(1500);
    const { allEnemies } = await import('../../src/game/enemies.js');
    check(allEnemies().some(e => e.id.startsWith(`trial:${t.key}:siege`)), 'the first wave');
    check((state.trial.bits.hold ?? 0) > 0.5, 'the hold fills in the ring');
    // they come for whoever holds the ring, not stand about their mouths
    const hp = [player.hp, player.maxHp];
    player.hp = player.maxHp = 1e6; state.devPassive = false;
    const raiders = () => allEnemies().filter(e => e.id.startsWith(`trial:${t.key}:siege`) && e.mode !== 'dead');
    check(raiders().every(e => e.defence), 'still posted at the beacon');
    await until(() => raiders().some(e => Math.hypot(e.x - player.x, e.z - player.z) < 2.5), 'an attacker at the ring', 12000);
    [player.hp, player.maxHp] = hp;
    state.devPassive = true;
    const { holdTime } = await import('../../src/core/trials.js');
    state.trial.bits.hold = holdTime(state.map.depth) - 0.5;
    await until(() => state.trial.phase === 'resolved', 'held', 3000);
    await delay(200);
    check(!allEnemies().some(e => e.id.startsWith(`trial:${t.key}:siege`) && e.mode !== 'dead'), 'the rest fled');
    results.push('held');
  }
  // the relic: taken, its warden (a known kind, stronger) breaks out and hunts faster than the
  // player can run (a swiftness potion quickens it too); the run back along the checked way at
  // RUN_SPEED beats it to the lever, which drops the portcullis with the warden shut in the hall
  if (kind === 'chase') {
    const m = state.map.trial, relic = m.parts.find(p => p.type === 'relic'), lever = m.parts.find(p => p.type === 'lever'), path = m.check.path;
    const { allEnemies } = await import('../../src/game/enemies.js');
    const { HUNTER } = await import('../../src/core/trials.js');
    const { RUN_SPEED } = await import('../../src/core/constants.js');
    Object.assign(player, { x: relic.x + 0.8, y: relic.y, z: relic.z, vx: 0, vz: 0 });
    await delay(150);
    check(pendingAction()?.target?.id === 'relic', 'the relic in reach');
    useAction();
    check(state.trial.phase === 'armed', 'taking it arms the room');
    const t0 = performance.now();
    await until(() => allEnemies().some(e => e.warden), 'the warden breaks out', (m.wake + 2) * 1000);
    const w = allEnemies().find(e => e.warden);
    check(w.profile.label.startsWith('Raging') && w.profile.hp > w.profile.damage, `a known kind, stronger: ${w.profile.label}`);
    await delay(100);
    check(Math.abs(w.profile.chase - RUN_SPEED * HUNTER.ratio) < 1e-6, `it runs faster than we do (${w.profile.chase})`);
    player.effects ??= {};
    player.effects['buff:moveSpeed'] = { kind: 'buff', buff: 'moveSpeed', value: 0.3, until: Infinity };
    await delay(100);
    check(Math.abs(w.profile.chase - RUN_SPEED * 1.3 * HUNTER.ratio) < 1e-6, `quicker with us (${w.profile.chase})`);
    delete player.effects['buff:moveSpeed'];
    // the run, at RUN_SPEED along the checked way from the moment it was taken
    for (const p of path) {
      await until(() => (performance.now() - t0) / 1000 >= p.t, 'the run', 60000);
      check(state.trial.phase === 'armed' || state.trial.phase === 'running', `still running (${state.trial.phase})`);
      Object.assign(player, { x: p.x, y: p.y, z: p.z, vx: 0, vz: 0 });
    }
    Object.assign(player, { x: lever.x, y: lever.y, z: lever.z + 0.5, vx: 0, vz: 0 });
    await delay(100);
    check(pendingAction()?.target?.id === 'lever', 'the lever in reach');
    useAction();
    check(state.trial.phase === 'resolved', 'the portcullis dropped');
    const hall = new Set(m.hall), still = allEnemies().find(e => e.warden && e.mode !== 'dead');
    check(!still || hall.has(Math.floor(still.z) * 16 + Math.floor(still.x)), 'the warden shut in the hall, or gone');
    results.push('outran it');
  }
  if (kind === 'flood' || kind === 'miasma' || kind === 'cold' || kind === 'storm') {
    const b = state.map.trial.button ?? state.map.trial.valve ?? state.map.trial.fire ?? state.map.trial.rod;
    Object.assign(player, { x: b.x + 0.6, y: b.y, z: b.z, vx: 0, vz: 0 });
    await delay(150);
    check(pendingAction()?.kind === 'part', 'the button is in reach');
    useAction();
    check(state.trial.phase === 'resolved' && state.run.unlockedGates.has(t.gate), 'resolved, its gate open');
    check(!portalLocked(state.map, state.run, { dir: t.exit }) && !sealedIn(), 'the way on is open');
    await delay(300);
    check(seals().every(s => !s), 'no seals left');
    results.push('resolved');
  }
  // resolved by stepping onto the exit apron, the keystone (collapse): armed first, the crust
  // falling behind
  if (kind === 'collapse') {
    player.autoDir = [ax, az];
    await until(() => state.trial.phase !== 'idle', 'armed again', 4000);
    player.autoDir = null;
    await until(() => state.trial.phase === 'running', 'running', 5000);
    const k = state.map.trial.keystone;
    Object.assign(player, { x: k.x, y: k.y + 0.05, z: k.z, vx: 0, vz: 0 });
    await until(() => state.trial.phase === 'resolved', 'the keystone holds', 3000);
    check(state.run.unlockedGates.has(t.gate) && !sealedIn(), 'resolved, its gate open');
    results.push('resolved');
  }
  return results;
}

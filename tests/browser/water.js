// Real fluid checks, run from index.html's devtools: swimming (into the water by a jump, a fall,
// a tumble; out of it onto the bank), lava and acid deadly with no robot and pulled out of by it,
// water with no way out (the robot carries the hero out, or they tire and drown):
// await (await import('./tests/browser/water.js')).runWaterChecks()
import { N, LH, WATER, LAVA, ACID, SWIM_FEET } from '../../src/core/constants.js';
import { RESCUE, shareOf } from '../../src/core/rescue.js';
import { forgetRobot, robotArrived, robotHere } from '../../src/game/robot.js';
import { player, state } from '../../src/game/state.js';
import { character } from '../../src/render/character.js';
import { animateCharacter } from '../../src/render/animator.js';
import { createPlayerStats } from '../../src/core/progression.js';
import { spawnAt } from '../../src/game/flow.js';
import { fallPoint } from '../../src/game/fall.js';
import { updatePlayer } from '../../src/game/update.js';
import { knockDown, stepRagdoll } from '../../src/game/ragdoll.js';
import { movePlayer } from '../../src/physics/move.js';
import { applyHazards } from '../../src/physics/hazards.js';
import { groundAt } from '../../src/physics/collide.js';
import { clearInput } from '../../src/game/input.js';
import { order, orderMove } from '../../src/game/orders.js';
import { paused } from './combat.js';
import { answerDeath } from '../../src/game/deathask.js';
import { fluidDeathState, tickFluidDeath } from '../../src/render/fluiddeath.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
function arena(fluid = WATER) {
  const floors = Array.from({ length: N * N }, (_, c) => ({ c, id: c, x: c % N, z: Math.floor(c / N),
    top: 0, bottom: -4, layer: 0, cs: [0, 0, 0, 0], split: 0, link: [] }));
  const water = floors[6 * N + 7];
  Object.assign(water, { fluid, surf: -1, top: -3, cs: [-1.5, -1.5, -1.5, -1.5] });
  return { K: 1, B: [0], floors, cols: floors.map(f => [f]), pieces: floors.map(() => []),
    blockers: floors.map(() => []), fences: new Map(), portals: [], ladders: [], falls: [],
    safe: new Uint8Array(N * N).fill(1), biome: state.map?.biome, depth: state.map?.depth, key: state.map?.key };   // (dressed as the cube it is tried in)
}
function reset(x = 6.5, y = 0, z = 6.5) {
  Object.assign(player, createPlayerStats(), { autoDir: null, coyote: 0, jumpBuf: 0 });
  spawnAt(x, y, z);
  animateCharacter(1 / 60, 0);
}
const REASON = { [WATER]: 'Drowned!', [LAVA]: 'Burned up in lava!', [ACID]: 'Dissolved in acid!' };
function drowned(fluid = WATER) {
  check(player.hp === 0 && player.ragdoll && !player.swimming, 'Fluids must be fatal with no robot: ' + fluid);
  check(state.statusMsg === REASON[fluid], 'Death status missing: ' + REASON[fluid]);
  check(player.fluidDeath === fluid && fluidDeathState().fluid === fluid, 'Fluid death effect missing');
  check(fluidDeathState().tinted === (fluid !== WATER), 'Lava/acid should tint the body, water should not');
}
function respawned() {
  let steps = 0;
  for (; steps < 400 && player.ragdoll; steps++) { stepRagdoll(1 / 60); tickFluidDeath(1 / 60); }
  check(steps >= 120, 'Fluid deaths keep the body around for the effect');
  if (state.deathAsk) answerDeath(true);   // ("You died": respawn, game/deathask.js)
  tickFluidDeath(1 / 60);
  check(!fluidDeathState().tinted, 'Respawn must restore the body tint');
  check(!player.ragdoll && player.hp === player.maxHp, 'Drowned player must respawn at full health');
  check(player.x === state.arrival.x && player.y === state.arrival.y && player.z === state.arrival.z,
    'Death must return to the dry entry point');
  for (let i = 0; i < 5; i++) updatePlayer(1 / 60);
  check(!player.ragdoll && player.hp === player.maxHp, 'Respawn must not drown again');
}

export async function runWaterChecks() {
  check(character.ready && !state.transitioning && !state.inventoryOpen, 'Wait for assets/travel and close inventory');
  check(robotHere(), 'The robot must be with the hero (?dev=1 meets it)');
  return paused(async () => {
    const savedPlayer = { ...player }, savedState = { map: state.map, arrival: state.arrival,
      statusMsg: state.statusMsg, statusUntil: state.statusUntil }, results = [];
    clearInput();
    // a jump off the bank into the fluid east of it, played out as the game does
    const jumpIn = (frames = 120) => {
      movePlayer(1 / 60, 1, 0, false, true);
      for (let i = 0; i < frames && !player.ragdoll && !player.rescue; i++) {
        const gr = movePlayer(1 / 60, player.x < 7.5 ? 1 : 0, 0, false, false);
        if (!applyHazards(1 / 60, gr)) break;
      }
    };
    // the robot's rescue played out: out of it, onto dry ground, for its share of the health
    const rescued = (fluid, why) => {
      check(player.rescue, 'The robot must come: ' + why);
      const before = player.maxHp;
      for (let i = 0; i < 600 && player.rescue; i++) updatePlayer(1 / 60);
      check(!player.rescue && player.grounded && !player.swimming && !player.ragdoll, 'Set down on its feet: ' + why);
      const g = groundAt(player.x, player.z, player.y + 0.05, 0);
      check(g.s && !g.s.fluid && Math.abs(g.h - player.y) < 0.05, 'On dry ground: ' + why);
      check(player.hp === before - Math.ceil(before * shareOf(fluid, 0)), `It costs its share: ${player.hp} of ${before}`);
      for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
      check(!player.rescue && player.hp > 0 && !player.ragdoll, 'Stays out of it: ' + why);
    };
    try {
      for (const fluid of [LAVA, ACID]) {
        const name = fluid === LAVA ? 'lava' : 'acid';
        state.map = arena(fluid); state.arrival = { x: 3.5, y: 0, z: 3.5 };
        reset(6.74);
        for (let i = 0; i < 120; i++) movePlayer(1 / 60, 1, 0, true, false);
        check(player.x < 7 && player.grounded && player.y === 0, 'Run must stop at the bank: ' + fluid);
        // no robot yet: it kills
        forgetRobot();
        jumpIn(); drowned(fluid); respawned();
        reset(); knockDown({ reason: 'Test tumble' });
        for (const points of [player.ragdoll.p, player.ragdoll.o]) for (const p of points) { p[0] += 1; p[1] -= 1; }
        stepRagdoll(1 / 60); drowned(fluid); respawned();
        // the robot along: it pulls them out, a jump in or a tumble in alike
        robotArrived();
        check(robotHere(), 'The robot is back');
        reset(6.74); jumpIn(); rescued(fluid, name + ' jump');
        reset(); knockDown({ reason: 'Test tumble' });
        for (const points of [player.ragdoll.p, player.ragdoll.o]) for (const p of points) { p[0] += 1; p[1] -= 1; }
        stepRagdoll(1 / 60); check(!player.ragdoll, 'Out of the ragdoll'); rescued(fluid, name + ' tumble');
        results.push(name + ': edge guard; with no robot jump and ragdoll deaths, effect, tint restore, respawn; with it pulled out');
      }

      state.map = arena(); state.arrival = { x: 3.5, y: 0, z: 3.5 };
      const water = state.map.floors[6 * N + 7], surface = water.surf * LH;
      reset(6.74);
      for (let i = 0; i < 120; i++) movePlayer(1 / 60, 1, 0, true, false);
      check(player.x < 7 && player.grounded && player.y === 0, 'Run must stop at the deep water');
      results.push('walking/running deep-water edge guard');

      jumpIn(90);
      check(player.x > 7 && player.swimming && !player.ragdoll && player.hp === player.maxHp, 'A jump into water swims');
      for (let i = 0; i < 60; i++) updatePlayer(1 / 60);
      check(Math.abs(player.y - (surface - SWIM_FEET)) < 0.03, 'Afloat at swimming height: ' + player.y);
      for (let i = 0; i < 240 && player.swimming; i++) { const gr = movePlayer(1 / 60, -1, 0, false, false); applyHazards(1 / 60, gr); }
      check(!player.swimming && player.grounded && player.y === 0 && player.x < 7, 'Climbs out onto the bank');
      results.push('jump into water swims, and climbs back out');

      // a click across the water: in, swimming, out onto the far bank (the climb out holds the
      // body still a while) and on to the spot, the order never given up on the way
      reset();
      const far = state.map.floors[6 * N + 8];
      orderMove({ x: 8.5, y: 0, z: 6.5, s: far });
      check(order.walk.path?.some(n => n.fluid === WATER), 'The way across goes through the water');
      let swum = false, out = false;
      for (let i = 0; i < 600 && order.kind; i++) { updatePlayer(1 / 60); swum ||= player.swimming; out ||= !!player.swimOut; }
      check(swum && out, 'Swims across and climbs out');
      check(player.support === far && Math.hypot(player.x - 8.5, player.z - 6.5) < 0.1, `Walks on to the spot: ${player.x.toFixed(2)}, ${player.z.toFixed(2)}`);
      results.push('click to move across the water: swims, climbs out, gets there');

      reset(7.5, 8);
      Object.assign(player, { grounded: false, vy: -18, support: null });
      for (let i = 0; i < 120; i++) updatePlayer(1 / 60);
      check(player.swimming && !player.ragdoll && player.hp === player.maxHp, 'A high fall into water swims, unhurt');
      results.push('high fall into water swims, no hard landing');

      reset(); knockDown({ reason: 'Test tumble' });
      for (const points of [player.ragdoll.p, player.ragdoll.o]) for (const p of points) { p[0] += 1; p[1] -= 1; }
      for (let i = 0; i < 30 && player.ragdoll; i++) stepRagdoll(1 / 60);
      for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
      check(!player.ragdoll && player.swimming && player.hp === player.maxHp, 'A tumble into water swims on');
      results.push('a ragdoll knocked into water swims');

      reset(7.5, 5);
      state.map.safe[water.id] = 0; // even unreachable water must not redirect the fall
      const fall = fallPoint(state.map);
      check(fall.air.x === 7.5 && fall.air.z === 6.5, 'Cube fall must keep its horizontal position over water');
      check(!groundAt(fall.rest.x, fall.rest.z, fall.rest.y, 0).s.fluid, 'Cube fall needs a dry entry');
      results.push('cube-fall over water keeps its place, rests on dry ground');

      // walled in: no way out of the water. With the robot it carries them out; without, they drown
      for (const f of state.map.floors) if (f !== water && Math.abs(f.x - 7) <= 1 && Math.abs(f.z - 6) <= 1) Object.assign(f, { top: 5, cs: Array(4).fill(2.5) });
      for (const robot of [true, false]) {
        if (robot) robotArrived(); else forgetRobot();
        reset(3.5, 0, 3.5);
        Object.assign(player, { x: 7.5, y: surface - SWIM_FEET, z: 6.5, grounded: false, swimming: true, support: water, visY: surface - SWIM_FEET });
        let t = 0;
        for (; t < (robot ? RESCUE.trapped + 1.5 : RESCUE.tire + 1.5) && !player.rescue && !player.ragdoll; t += 1 / 60) {
          updatePlayer(1 / 60);   // (game/swim.js tickSwim: looking for a way out)
        }
        if (robot) { check(t >= RESCUE.trapped - 0.1, 'It waits a moment first: ' + t); rescued(WATER, 'no way out of the water'); }
        else { check(t >= RESCUE.tire - 0.1, 'They tire first: ' + t); drowned(WATER); respawned(); }
      }
      // the robot along, but nowhere to take them: they tire and drown all the same
      robotArrived();
      reset(3.5, 0, 3.5);
      const safe = state.map.safe.slice();
      state.map.safe.fill(0);
      Object.assign(player, { x: 7.5, y: surface - SWIM_FEET, z: 6.5, grounded: false, swimming: true, support: water, visY: surface - SWIM_FEET, safe: null });
      let t = 0;
      for (; t < RESCUE.tire + 1.5 && !player.rescue && !player.ragdoll; t += 1 / 60) updatePlayer(1 / 60);
      state.map.safe.set(safe);
      check(!player.rescue && t >= RESCUE.tire - 0.1, 'Nowhere to take them: they tire first: ' + t);
      drowned(WATER); respawned();
      results.push('no way out of the water: the robot carries them out, else (no robot, nowhere to go) they drown');

      reset(7.5, surface - 1);
      const ready = character.ready;
      try {
        character.ready = false;
        forgetRobot();
        state.map = arena(LAVA);
        applyHazards(1 / 60, groundAt(player.x, player.z, player.y, 0));
        if (state.deathAsk) answerDeath(true);
        check(!player.ragdoll && player.hp === player.maxHp && player.x === state.arrival.x,
          'Before assets load, a fluid death must still immediately respawn');
      } finally { character.ready = ready; robotArrived(); }
      results.push('asset-loading fallback still respawns');
      return results;
    } finally {
      Object.assign(state, savedState); Object.assign(player, savedPlayer); clearInput();
      animateCharacter(1 / 60, 0);
    }
  });
}

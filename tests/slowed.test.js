// The general slowing (core/status.js `slowed`): slime slows how fast a body moves; only while a
// Bolime has you (`weapons`) the weapon too. The stronger of a chill and a slowing counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, WALK_SPEED } from '../src/core/constants.js';
import { flatMap } from './fixtures.js';
import { player } from '../src/game/state.js';
import { movePlayer } from '../src/physics/move.js';
import { slowFrom, slower, slowStep, moveFactor, weaponFactor } from '../src/core/status.js';
import { chillFrom, THAW } from '../src/core/projectiles.js';
import { startSwing, advanceSwing, cancelSwing } from '../src/core/combat.js';
import { blowOf } from '../src/core/enemies.js';
import { createPlayerStats } from '../src/core/progression.js';

const DT = 1 / 60;
function stand() {
  const m = flatMap();
  m.biome = 'meadow';
  Object.assign(player, { x: 2.5, z: 8.5, y: 0, vx: 0, vy: 0, vz: 0, grounded: true, swimming: false,
    fluid: 0, support: m.floors[8 * N + 2], stun: 0, coyote: 0, jumpBuf: 0, chilled: null, slowed: null, mire: 1,
    inventory: createPlayerStats().inventory });   // (the sword in hand)
}

test('a slowing slows the body for its time, then thaws', () => {
  const s = slowFrom({ time: 2, slow: 0.55, source: 'slime' });
  assert.deepEqual(s, { time: 2, slow: 0.55, t: 0, weapons: false, source: 'slime' });
  assert.equal(moveFactor({ slowed: s }), 0.55);
  assert.equal(weaponFactor({ slowed: s }), 1, 'by default only the body');
  slowStep(s, 2 - THAW / 2);
  assert.ok(moveFactor({ slowed: s }) > 0.55 && moveFactor({ slowed: s }) < 1, 'thawing');
  assert.equal(slowStep(s, THAW), false, 'worn off');
  // the stronger counts, a chill or a slowing
  assert.equal(moveFactor({ chilled: chillFrom({ time: 1, slow: 0.5 }), slowed: slowFrom({ time: 1, slow: 0.7 }) }), 0.5);
  assert.equal(moveFactor({ chilled: chillFrom({ time: 1, slow: 0.8 }), slowed: slowFrom({ time: 1, slow: 0.6 }) }), 0.6);
  assert.equal(moveFactor({}), 1);
  // a weaker one does not undo a stronger one that lasts longer
  const strong = slowFrom({ time: 3, slow: 0.35, weapons: true });
  assert.equal(slower(strong, slowFrom({ time: 1, slow: 0.6 })), strong);
  const weak = slowFrom({ time: 0.5, slow: 0.8 });
  assert.notEqual(slower(weak, slowFrom({ time: 1, slow: 0.6 })), weak);
});

test('the player walks slower while slowed, its weapon only when the slowing says so', () => {
  stand();
  player.slowed = slowFrom({ time: 5, slow: 0.55 });
  for (let i = 0; i < 60; i++) movePlayer(DT, 1, 0, false, false);
  assert.ok(Math.abs(Math.hypot(player.vx, player.vz) - WALK_SPEED * 0.55) < 1e-6);
  const swing = slowing => {
    cancelSwing(player);
    Object.assign(player, { slowed: slowing, ragdoll: null, climb: null, held: null, hp: 100 });
    player.sword.cool = 0;
    startSwing(player, 0);
    const before = player.sword.t;
    advanceSwing(player, 0.1 * weaponFactor(player));
    return player.sword.t - before;
  };
  assert.ok(Math.abs(swing(slowFrom({ time: 5, slow: 0.55 })) - 0.1) < 1e-9, 'a slime ball leaves the sword alone');
  assert.ok(Math.abs(swing(slowFrom({ time: 5, slow: 0.35, weapons: true })) - 0.035) < 1e-9, 'inside a Bolime the sword is slow too');
  cancelSwing(player);
});

test('a blow that slows says so', () => {
  const profile = { damage: 10, knock: 1 };
  assert.deepEqual(blowOf(profile, { projectile: { slow: { time: 2, slow: 0.5 } } }).slow, { time: 2, slow: 0.5 });
  assert.equal(blowOf(profile, {}).slow, undefined);
});

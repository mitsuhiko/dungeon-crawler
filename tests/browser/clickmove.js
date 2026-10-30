// Browser checks for click to move (game/orders.js, physics/playernav.js, physics/leaps.js):
// clicks in the `leaps` test room played out by the game's own update (the jumps, ladders and
// drops its way takes), and keys taking over; and clicks on the ways out of a cube (game/ways.js:
// a house's door and back, a town gate, a locked well, a ring up) walking up to them and through. A fresh
// seed-3 run before and after. From the devtools console (with ?dev=1):
//   await (await import('./tests/browser/clickmove.js')).runClickMoveChecks()
//   await (await import('./tests/browser/clickmove.js')).runWayChecks()
import { idx } from '../../src/core/util.js';
import { topOf } from '../../src/core/surfaces.js';
import { SIT_IMPACT } from '../../src/core/constants.js';
import { player, state } from '../../src/game/state.js';
import { newWorld, enterCube } from '../../src/game/flow.js';
import { updatePlayer } from '../../src/game/update.js';
import { clearInput } from '../../src/game/input.js';
import { order, orderMove, orderWay, clearOrder } from '../../src/game/orders.js';
import { waysHere } from '../../src/game/ways.js';
import { hoveredWay, updateLootLabels } from '../../src/game/lootlabels.js';
import { pointAt, updatePointer } from '../../src/game/pointer.js';
import { goTo, goTestRoom } from '../../src/game/dev.js';
import { camera } from '../../src/render/scene.js';
import { step } from '../../src/world/coords.js';
import { portalLocked } from '../../src/core/guardians.js';
import * as THREE from 'three';
import { LEAPS } from '../../src/cubegen/testrooms.js';
import { paused } from './combat.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const DT = 1 / 60;
// click floor f's middle, step the game until the order is done: what the way was made of
function walkTo(f, frames = 3600) {
  const at = { x: f.x + 0.5, y: topOf(f, 0.5, 0.5), z: f.z + 0.5, s: f };
  orderMove(at);
  const w = order.walk, used = new Set((w.how || []).map(h => h?.ladder ? (h.up ? 'up' : 'down') : h ? (h.drop ? 'drop' : 'jump' + h.k) : null).filter(Boolean));
  let landed = 0, climbed = false;
  const counted = player.landCount;
  for (let i = 0; i < frames && order.kind; i++) {
    updatePlayer(DT);
    climbed ||= !!player.climb;
    if (player.landCount !== counted) landed = Math.max(landed, player.landImpact);
  }
  check(!order.kind, `Walking to ${f.x}, ${f.z} never got there (at ${player.x.toFixed(2)}, ${player.y.toFixed(2)}, ${player.z.toFixed(2)})`);
  check(player.support === f, `Walking to ${f.x}, ${f.z} ended on another floor`);
  check(landed < SIT_IMPACT && player.stun <= 0 && !player.ragdoll, `Walking to ${f.x}, ${f.z}: a hard landing`);
  return { used, climbed };
}

export async function runClickMoveChecks() {
  const results = [];
  await newWorld(3); clearInput();
  try {
    await goTestRoom('leaps', 1);
    check(state.map?.testRoom?.name === 'leaps', 'Into the leaps test room');
    await paused(async () => {
      const at = (x, z) => state.map.cols[idx(x, z)][0], { ledge, tower, pit, gap, steps } = LEAPS;
      for (const [x, z, kind, what] of [[7, 8, 'jump1', 'over the trench'], [ledge.x, 3, 'jump0', 'onto the ledge'],
        [tower.x, tower.z1, 'up', 'up the tower'], [8, 8, 'down', 'down the tower'], [12, 5, 'jump2', 'over the wide gap'],
        [pit.x0, 8, 'drop', 'into the pit'], [12, 12, 'up', 'out of the pit'], [gap[0], steps, 'jump0', 'up the steps'],
        [2, 8, 'jump1', 'home over the trench']]) {
        const r = walkTo(at(x, z));
        check(r.used.has(kind), `${what}: by ${kind} (${[...r.used]})`);
        if (kind === 'up' || kind === 'down') check(r.climbed, `${what}: climbed`);
        results.push(what);
      }
      // a key takes over, even half way through
      orderMove({ x: 12.5, y: 1, z: 5.5, s: at(12, 5) });
      for (let i = 0; i < 10; i++) updatePlayer(DT);
      check(order.kind === 'move', 'Under way');
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
      updatePlayer(DT);
      dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
      check(!order.kind, 'A key ends the order');
      results.push('keys take over');
    });
  } finally {
    clearOrder();
    await newWorld(3); clearInput();
  }
  return results;
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function arrived(from) {
  for (let i = 0; i < 1000 && (state.transitioning || state.cubeKey === from); i++) await delay(20);
  check(!state.transitioning && state.cubeKey !== from, `Travel from ${from} timed out`);
}
// the way under the cursor, put on it on screen
function hover(w) {
  const off = state.world.group.position, v = new THREE.Vector3(w.x + off.x, w.y + off.y, w.z + off.z).project(camera);
  pointAt((v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight);
  updatePointer(); updateLootLabels();
  return hoveredWay();
}
// Click the way pick() finds and step the game (paused) until it takes us (a few seconds at
// most), then let the game run until we are there (a cube seen the first time warms up its
// shaders on animation frames). check(w): what to make sure of before.
async function through(pick, what, before = () => {}) {
  const from = state.cubeKey;
  await paused(async () => {
    const w = pick();
    check(w, `${what}: a way to click`);
    before(w);
    orderWay(w);
    for (let i = 0; i < 1200 && !state.transitioning; i++) updatePlayer(DT);
    check(state.transitioning, `${what}: walked up and through (at ${player.x.toFixed(2)}, ${player.z.toFixed(2)}, order ${order.kind})`);
  });
  await arrived(from);
}

export async function runWayChecks() {
  const results = [];
  await newWorld(3); clearInput();
  try {
    const { start, gate: gateTile } = state.cubes.town;
    check(state.cubeKey === start, 'A new world starts in town');
    // a house's door, and the door back out
    await through(() => waysHere().find(w => w.kind === 'door'), 'Into a house');
    check(state.cubeKey !== start, 'Inside the house');
    await through(() => waysHere().find(w => w.kind === 'door'), 'Out of the house');
    check(state.cubeKey === start, 'Back in town');
    results.push('door in / door out');
    // the town's gate (in the gate's tile), hovered and clicked
    const g = await state.cubes.get(gateTile);
    enterCube(g, null, null, { x: 8, y: g.map.floors[0].top * 0.5, z: 8 });
    let dir = null;
    await through(() => waysHere().find(w => w.kind === 'side' && !portalLocked(state.map, state.run, w.portal)), 'Through the town gate',
      gate => { check(hover(gate) === gate, 'The cursor on a gate hovers it'); dir = gate.portal.dir; });
    check(state.cubeKey === step(gateTile, dir), 'Into the cube beyond the gate');
    results.push('gate: hovered, walked through');
    // a well down guarded by the depth's boss: walked onto, it says so, and nothing happens
    await goTo('down', false);
    await paused(async () => {
      const well = waysHere().find(w => w.kind === 'down');
      check(well && portalLocked(state.map, state.run, well.portal), 'The descent is the boss\'s, locked');
      orderWay(well);
      for (let i = 0; i < 240; i++) updatePlayer(DT);
      check(!state.transitioning && !order.kind && Math.hypot(player.x - well.walk.x, player.z - well.walk.z) < 0.1, 'Walked onto the locked well, and stays');
      check(/unlock/.test(state.statusMsg), 'It says why: ' + state.statusMsg);
    });
    results.push('locked well: walked onto, says so');
    // a ring up, a depth further down (dev: down through the well, next to the ring): walked onto, charged, taken
    await goTo('down', true);
    for (let i = 0; i < 500 && state.transitioning; i++) await delay(20);
    await goTo('up', false);
    const depth = state.map.depth;
    await through(() => waysHere().find(w => w.kind === 'up'), 'Up the ring');
    check(state.map.depth === depth - 1, 'A depth further up');
    results.push('ring: walked onto, up');
  } finally {
    clearOrder();
    await newWorld(3); clearInput();
  }
  return results;
}

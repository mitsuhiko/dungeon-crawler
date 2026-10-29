// Browser integration checks: run from index.html's devtools (see docs/combat.md).
// Uses the real controller, input handlers, enemy AI, GLB loading, skeletons and
// animation mixers on a controlled floor grid. Restores the live level afterward.
import * as THREE from 'three';
import { N, DIRS, WALK_SPEED, RUN_SPEED, RUN_RAMP } from '../../src/core/constants.js';
import { player, state } from '../../src/game/state.js';
import { SWORD, cancelSwing, startSwing, damageEnemy, combatStats, reloadTime } from '../../src/core/combat.js';
import { ITEMS } from '../../src/core/items.js';
import { addItem, equipItem } from '../../src/core/inventory.js';
import { BURST_SHARE, chainShare } from '../../src/core/shots.js';
import { shots, clearShots } from '../../src/game/shots.js';
import { shotModelsReady } from '../../src/render/shots.js';
import { createPlayerStats, createRun } from '../../src/core/progression.js';
import { resetEnemies, allEnemies, updateEnemies, drawEnemies } from '../../src/game/enemies.js';
import { spiders } from '../../src/game/spiders.js';
import { stunders } from '../../src/game/stunders.js';
import { snakes } from '../../src/game/snakes.js';
import { octonauts } from '../../src/game/octonauts.js';
import { fireFaces } from '../../src/game/firefaces.js';
import { triangles } from '../../src/game/triangles.js';
import { fireCats } from '../../src/game/firecats.js';
import { projectiles, clearProjectiles } from '../../src/game/projectiles.js';
import { SPIDER, STUNDER, SNAKE, OCTONAUT, FIREFACE, TRIANGLE, FIRECAT, makeEnemy } from '../../src/core/enemies.js';
import { rolls } from '../../src/game/sword.js';
import { D } from '../../src/core/spawns.js';
import { updatePlayer } from '../../src/game/update.js';
import { knockDown } from '../../src/game/ragdoll.js';
import { climb } from '../../src/physics/climb.js';
import { W, resetMode } from '../../src/render/blendtree.js';
import { character, equipSword, loadSword, prepareSword } from '../../src/render/character.js';
import { animateCharacter } from '../../src/render/animator.js';
import { scene } from '../../src/render/scene.js';
import { cameraMode, setCameraMode } from '../../src/game/settings.js';
import { settleCamera } from '../../src/game/camera.js';
import { stunderModel } from '../../src/render/stundermodel.js';
import { spiderModel } from '../../src/render/spidermodel.js';
import { snakeModel } from '../../src/render/snakemodel.js';
import { octonautModel } from '../../src/render/octonautmodel.js';
import { fireFaceModel } from '../../src/render/firefacemodel.js';
import { triangleModel } from '../../src/render/trianglemodel.js';
import { fireCatModel } from '../../src/render/firecatmodel.js';
import { tickBurning, burningLit } from '../../src/render/burning.js';
import { startTravel, travelling, updateTravel, drawTravelEnemies } from '../../src/game/travel.js';
import { camera } from '../../src/render/scene.js';
import { updatePointer, hoveredEnemy, pointer } from '../../src/game/pointer.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// also: no critical hits while checking, so every blow deals its exact damage
// (in the overview, the view these checks were written for: the cutaway, the walls that come
// down; the camera key's setting comes back afterwards, tests/browser/camera.js checks the close view)
export async function paused(fn) {
  const raf = window.requestAnimationFrame, cancel = window.cancelAnimationFrame, crit = rolls.crit;
  const mode = cameraMode();
  setCameraMode('overview'); settleCamera();
  const pending = new Map(); let id = 0;
  window.requestAnimationFrame = callback => { pending.set(--id, callback); return id; };
  window.cancelAnimationFrame = token => { if (token < 0) pending.delete(token); else cancel.call(window, token); };
  rolls.crit = () => 1;
  try { await delay(150); return await fn(); }
  finally {
    rolls.crit = crit;
    setCameraMode(mode); settleCamera();
    window.requestAnimationFrame = raf; window.cancelAnimationFrame = cancel;
    // Fade/flash callbacks must not overwrite the queued main frame and stop the game.
    for (const callback of pending.values()) raf.call(window, callback);
  }
}
function arena() {
  const floors = Array.from({ length: N * N }, (_, c) => ({ c, id: c, x: c % N, z: Math.floor(c / N),
    top: 0, bottom: -2, layer: 0, cs: [0, 0, 0, 0], split: 0, link: [] }));
  for (const f of floors) f.link = DIRS.map(([dx, dz]) => {
    const x = f.x + dx, z = f.z + dz;
    return x >= 0 && z >= 0 && x < N && z < N ? floors[z * N + x] : null;
  });
  return { seed: 123, K: 1, B: [0], floors, cols: floors.map(f => [f]), pieces: floors.map(() => []),
    blockers: floors.map(() => []), fences: new Map(), portals: [], ladders: [], falls: [],
    spawns: D(2, ['spider', 1, 4, 4, 2], ['stunder', 1, 2, 2]) };
}
const at = (x, z) => state.map.floors[Math.floor(z) * N + Math.floor(x)];
function place(e, x, z) {
  Object.assign(e, { x, y: 0, z, yaw: Math.PI, f: at(x, z), home: at(x, z), path: null,
    mode: 'idle', t: 1e6, think: 1e6, cool: 0, stun: 0, speed: 0 });
}
function hero() {
  cancelSwing(player, true);
  Object.assign(player, { x: 6.5, y: 0, visY: 0, z: 6.5, yaw: 0, vx: 0, vy: 0, vz: 0,
    ...createPlayerStats(), grounded: true, swimming: false, climb: null, ragdoll: null, getUp: null, stun: 0, burning: null,
    support: at(6.5, 6.5), safe: { x: 6.5, y: 0, z: 6.5 }, coyote: 0, jumpBuf: 0 });
}
function press(code) {
  dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}
function tick(n, freeze = true) {
  let maxY = player.y;
  for (let i = 0; i < n; i++) {
    if (freeze) for (const e of allEnemies()) if (e.mode !== 'dead') {
      e.mode = 'idle'; e.think = e.t = 1e6;
    }
    updatePlayer(1 / 60); updateEnemies(1 / 60);
    player.visY = player.y;
    animateCharacter(1 / 60, i / 60); drawEnemies(1 / 60);
    maxY = Math.max(maxY, player.y);
  }
  scene.updateMatrixWorld(true);
  return maxY;
}
// hover the cursor over enemy e and click it once (a real pointer event sequence)
function clickOn(e) {
  const canvas = document.querySelector('canvas');
  scene.updateMatrixWorld(true); camera.updateMatrixWorld();
  const v = new THREE.Vector3(e.x, e.y + e.profile.bodyHeight / 2, e.z).project(camera);
  const at = { clientX: (v.x + 1) / 2 * innerWidth, clientY: (1 - v.y) / 2 * innerHeight, button: 0, bubbles: true };
  canvas.dispatchEvent(new PointerEvent('pointermove', at)); updatePointer();
  check(hoveredEnemy() === e, 'The cursor must hover the enemy');
  canvas.dispatchEvent(new PointerEvent('pointerdown', at));
  dispatchEvent(new PointerEvent('pointerup', at));
  canvas.dispatchEvent(new PointerEvent('pointerleave', at)); updatePointer();
}
function bones(e) {
  const out = [];
  e.view.model.traverse(o => { if (o.isBone) out.push(...o.position.toArray(), ...o.quaternion.toArray()); });
  return out;
}
function minimumY(model) {
  scene.updateMatrixWorld(true);
  const v = new THREE.Vector3(); let min = Infinity;
  model.traverse(o => {
    if (!o.isMesh) return;
    for (let i = 0; i < o.geometry.attributes.position.count; i++) {
      o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld); min = Math.min(min, v.y);
    }
  });
  return min;
}

export async function runCombatChecks() {
  await Promise.all([spiderModel, stunderModel].map(m => m.load()));   // (enemy models load when first needed)
  check(character.ready && character.sword && spiderModel.ready && stunderModel.ready, 'Wait for all character / weapon assets to load');
  check(!state.transitioning && !state.inventoryOpen, 'Close inventory and wait for portal travel to finish');
  return paused(async () => {
    const originalMap = state.map, saved = { ...player }, savedRun = state.run, savedWeapon = character.sword, results = [];
    try {
      state.run = createRun();
      state.map = arena(); resetEnemies(); hero(); await loadSword();
      for (const [i, e] of allEnemies().entries()) place(e, 2.5 + i * 0.03, 2.5);
      check(spiders.length > 0 && stunders.length === 2, 'Fixture must provide both species');
      const spider = spiders[0], stunder = stunders[0];
      resetMode(); tick(180); // settle any prior landing/sit/get-up blend on the test floor
      const swordBottom = minimumY(character.sword);
      check(character.sword.parent === character.bones['hand.R'] && swordBottom >= -0.002, 'Separate sword must be mounted on hand.R and off the floor: ' + swordBottom);
      check(stunders[0].view.model.getObjectByName('head') !== stunders[1].view.model.getObjectByName('head'), 'Instances must own independent bones');
      results.push('loaded sword / independent enemy skeletons');

      place(spider, 6.5, 6.5); press('Space');
      const maxY = tick(120);
      check(maxY > 0.5 && spider.hp === SPIDER.hp && spider.mode !== 'dead', 'A real jump / landing must not stomp-kill');
      results.push('Space jump does not damage enemies');

      hero(); place(spider, 6.5, 7.25); press('ShiftLeft'); tick(40);
      check(spider.hp === SPIDER.hp - 30 && spider.mode !== 'dead', 'The Old Sword leaves a spider standing after one slash');
      press('ShiftLeft'); tick(75);
      check(spider.hp === 0 && spider.mode === 'dead', 'A second Shift auto-attack must slash-kill a spider');
      check(spider.view.actions.death.getEffectiveWeight() === 1, 'SpiderDeath must play instead of squash / hide');
      for (const time of [0.3, 0.7, 1.2, 1.9]) {
        spider.deadT = time; drawEnemies(1 / 60);
        check(minimumY(spider.view.model) >= -0.003, 'Spider death penetrates the floor at ' + time);
      }
      const held = bones(spider);
      spider.deadT = 2.4; drawEnemies(1 / 60);
      check(bones(spider).every((v, i) => Math.abs(v - held[i]) < 1e-5), 'Spider corpse must hold its final pose');
      results.push('Shift slash / SpiderDeath floor contact and held corpse');

      hero(); place(stunder, 6.5, 7.4);
      for (let i = 0; i < 5; i++) {
        if (i === 0) clickOn(stunder);
        else press('ShiftLeft');
        tick(75);
        check(stunder.hp === Math.max(0, STUNDER.hp - (i + 1) * 30), 'Stunder should take exactly one hit per swing');
      }
      check(stunder.mode === 'dead' && stunder.view.actions.death.getEffectiveWeight() === 1, 'Stunder must play its real death clip');
      results.push('click on enemy attacks it / Stunder survives 4 hits, dies on 5');

      tick(260);
      check(!allEnemies().includes(spider) && !allEnemies().includes(stunder), 'Finished corpses must leave the population');
      check(!spider.view && !stunder.view, 'Corpse mixers / materials / skeletons must be disposed');
      results.push('corpse view and population cleanup');

      state.run = createRun(); resetEnemies(); hero();
      for (const [i, e] of allEnemies().entries()) place(e, 2.5 + i * 0.03, 2.5);
      const heavy = stunders[0]; place(heavy, 6.5, 7.5);
      Object.assign(heavy, { mode: 'attack', t: 0, bit: false, attacks: 1, think: 1e6 });
      for (let i = 0; i < 33; i++) { updateEnemies(1 / 60); drawEnemies(1 / 60); }
      check(player.hp === 70 && player.ragdoll, 'Level-1 Stunder ram must deal 30 damage and knock down');
      const sourceHead = stunderModel.source.getObjectByName('head'), head = heavy.view.model.getObjectByName('head');
      scene.updateMatrixWorld(true);
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(sourceHead.getWorldQuaternion(new THREE.Quaternion()).invert())
        .applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
      check(forward.y < -0.85, 'Stunder ram must strike head-down');
      results.push('30-damage knockdown synced with head-down animation');

      hero(); place(heavy, 6.5, 7.4);
      Object.assign(heavy, { mode: 'attack', t: 0.5, bit: false, attacks: 2, think: 1e6 });
      startSwing(player); player.sword.t = SWORD.activeStart;
      updateEnemies(1 / 60);
      check(player.hp === 100 && heavy.hp === STUNDER.hp - 30 && heavy.mode !== 'attack', 'Connecting sword must interrupt the wind-up');
      results.push('sword interrupts enemy attack');
      // poised after that stagger: the next light blow hurts but the ram goes on
      Object.assign(heavy, { mode: 'attack', t: 0.2, bit: false, stun: 0, think: 1e6 });
      cancelSwing(player, true); startSwing(player); player.sword.t = SWORD.activeStart;
      updateEnemies(1 / 60);
      check(heavy.hp === STUNDER.hp - 60 && heavy.mode === 'attack' && !heavy.staggered, 'A poised Stunder must shrug off a light blow');
      results.push('a poised Stunder keeps its wind-up');
      return results;
    } finally {
      state.map = originalMap; state.run = savedRun;
      Object.assign(player, saved); cancelSwing(player, true); equipSword(savedWeapon);
      resetEnemies();
    }
  });
}

// Bows, crossbows and staffs: each mounted in its socket and carried in its hold pose; a click
// on an enemy in range shoots without walking (out of range: walks until it is), the shot
// flies and hits for exactly the weapon's damage; the bow is drawn with an arrow on it, the
// crossbow is empty until its reload, a bolt pierces, a spell bursts.
export async function runRangedChecks() {
  await Promise.all([stunderModel, spiderModel].map(m => m.load()));   // (enemy models load when first needed)
  check(character.ready && stunderModel.ready && spiderModel.ready, 'Wait for the character / enemy assets to load');
  check(!state.transitioning && !state.inventoryOpen, 'Close inventory and wait for portal travel to finish');
  await shotModelsReady();
  return paused(async () => {
    const originalMap = state.map, saved = { ...player }, savedRun = state.run, savedWeapon = character.sword, results = [];
    const arm = async id => {
      hero(); addItem(player.inventory, id);
      equipItem(player.inventory, player.inventory.slots.find(s => s?.itemId === id).instanceId);
      equipSword(await prepareSword(ITEMS[id].model));
    };
    const until = (f, n = 240) => { for (let i = 0; i < n && !f(); i++) tick(1); return f(); };
    const shot = kind => player.sword.stats?.kind === kind && player.sword.fired;   // this weapon's shot left
    try {
      state.run = createRun(); state.map = arena(); resetEnemies();
      for (const e of allEnemies()) place(e, 1.5, 14.5);
      const [a, b] = stunders, spider = spiders[0];

      await arm('weapon_bow_recurve');
      const bow = combatStats(player);
      check(character.sword.parent === character.bones['hand.L'], 'A bow goes in the left fist');
      resetMode(); tick(60);
      check(character.holdWeight > 0.95, 'Bows are carried in their hold pose');
      place(a, 6.5, 6.5 + bow.range - 1);
      clickOn(a);
      check(until(() => character.held.arrow?.visible), 'An arrow lies on the drawn bow');
      check(character.held.nock.distanceTo(character.held.rest) > 0.2, 'The string is drawn back to the fist');
      check(Math.hypot(player.x - 6.5, player.z - 6.5) < 0.01, 'In range: it shoots where it stands');
      check(until(() => shots.length > 0) && !character.held.arrow.visible, 'The arrow leaves the bow');
      check(until(() => a.hp < STUNDER.hp) && a.hp === STUNDER.hp - bow.damage && !shots.length, 'The arrow hits for the bow\'s damage: ' + a.hp);
      results.push('bow: left fist, hold pose, drawn string with an arrow, shot in range hits for its damage');

      await arm('weapon_bow_recurve'); place(a, 6.5, 15.4); a.hp = STUNDER.hp;   // out of range, inside the arena
      clickOn(a);
      check(until(() => a.hp < STUNDER.hp, 600), 'Out of range: walks up and shoots');
      check(Math.hypot(a.x - player.x, a.z - player.z) <= bow.range + a.profile.radius + 0.05
        && Math.hypot(a.x - player.x, a.z - player.z) > bow.range - 1, 'Walks only until it is in range');
      results.push('walks into range, no further');

      await arm('weapon_crossbow_light');
      const xbow = combatStats(player);
      check(character.sword.parent === character.bones['hand.R'] && character.held.bolt.visible, 'A crossbow comes loaded');
      place(a, 6.5, 8.5); place(b, 6.5, 9.7); a.hp = b.hp = STUNDER.hp;
      clickOn(a);
      check(until(() => shot('crossbow')) && !character.held.bolt.visible, 'The bolt leaves the crossbow');
      check(until(() => !shots.length) && a.hp === STUNDER.hp - xbow.damage && b.hp === STUNDER.hp - xbow.damage, 'A light crossbow bolt pierces one enemy');
      check(until(() => character.held.bolt.visible) && player.sword.t >= reloadTime(xbow) - 0.02, 'Loaded again by the reload');
      results.push('crossbow: loaded, empties on the shot, pierces, reloads');

      await arm('weapon_staff_ember');
      const staff = combatStats(player);
      place(a, 6.5, 9.5); place(b, 1.5, 14.5); place(spider, 7.05, 9.2); a.hp = STUNDER.hp; spider.hp = SPIDER.hp;
      clickOn(a);
      check(until(() => character.held.glow > 0.5), 'The staff\'s stone glows as the spell gathers');
      check(until(() => shot('staff')) && until(() => !shots.length), 'The spell flies and bursts');
      check(a.hp === STUNDER.hp - staff.damage, 'The spell hits for the staff\'s damage');
      check(spider.hp === Math.max(0, SPIDER.hp - Math.round(staff.damage * BURST_SHARE)), 'Its burst hurts what stands next to its target: ' + spider.hp);
      results.push('staff: glow, spell hits its target, burst hurts a neighbour');

      await arm('weapon_staff_lightning');
      const bolt = combatStats(player);
      place(a, 6.5, 9.5); place(spider, 7.4, 10.3); place(b, 8.6, 11.2); a.hp = b.hp = STUNDER.hp; spider.hp = SPIDER.hp;
      clickOn(a);
      check(until(() => shot('staff') && player.sword.stats.shot === 'lightning') && until(() => !shots.length, 20), 'The lightning strikes almost at once');
      check(a.hp === STUNDER.hp - bolt.damage, 'The lightning hits for the staff\'s damage: ' + a.hp);
      check(spider.hp === Math.max(0, SPIDER.hp - Math.round(bolt.damage * chainShare(0))), 'It jumps on to the nearest: ' + spider.hp);
      check(b.hp === STUNDER.hp - Math.round(bolt.damage * chainShare(1)), 'and on from there, for less: ' + b.hp);
      results.push('lightning staff: strikes at once, jumps on twice, each for less');

      await arm('weapon_trident_sea');
      resetMode(); tick(60);
      check(character.holdWeight > 0.95, 'A trident is carried in its hold pose');
      place(a, 6.5, 7.4); place(b, 6.6, 8.0); place(spider, 1.5, 14.5); a.hp = b.hp = STUNDER.hp;
      const stab = combatStats(player, a), zap = combatStats(player);
      clickOn(a);
      check(until(() => player.sword.active && player.sword.stats.kind === 'trident'), 'Close up: a stab');
      check(until(() => a.hp < STUNDER.hp) && until(() => b.hp < STUNDER.hp, 30), 'The stab goes through both in the line');
      check(a.hp === STUNDER.hp - stab.damage && b.hp === STUNDER.hp - stab.damage && !shots.length, 'for the stab\'s damage, nothing thrown');
      until(() => !player.sword.active); cancelSwing(player, true);
      place(a, 6.5, 10.5); place(b, 1.5, 14.5); a.hp = STUNDER.hp;
      clickOn(a);
      check(until(() => shot('zap')), 'Further off: it throws lightning');
      check(Math.hypot(player.x - 6.5, player.z - 6.5) < 0.01, 'from where it stands');
      check(until(() => !shots.length, 20) && a.hp === STUNDER.hp - zap.damage && zap.damage < stab.damage, 'for less than a stab: ' + a.hp);
      results.push('trident: hold pose, stabs through a line close up, throws lightning from afar');
      return results;
    } finally {
      state.map = originalMap; state.run = savedRun;
      Object.assign(player, saved); cancelSwing(player, true); equipSword(savedWeapon);
      clearShots(); resetEnemies();
    }
  });
}

// Snake bite, Octonaut slap and spin kick: real AI timers, damage, reach / arc and the
// matching GLB clip for each attack.
export async function runNewEnemyChecks() {
  await Promise.all([snakeModel, octonautModel].map(m => m.load()));   // (enemy models load when first needed)
  check(snakeModel.ready && octonautModel.ready, 'Wait for the snake / Octonaut assets to load');
  return paused(async () => {
    const originalMap = state.map, saved = { ...player }, savedRun = state.run, results = [];
    const strike = (e, attack, steps, t = 0) => {
      Object.assign(e, { mode: 'attack', t, bit: false, attacks: e.attacks + 1, attack, think: 1e6 });
      for (let i = 0; i < steps; i++) { updateEnemies(1 / 60); drawEnemies(1 / 60); }
    };
    try {
      state.run = createRun(); state.map = arena(); resetEnemies();
      for (const e of allEnemies()) place(e, 2.5, 2.5);
      const snake = makeEnemy({ f: at(6.5, 7.4), x: 6.5, y: 0, z: 7.4, yaw: Math.PI }, SNAKE);
      const octo = makeEnemy({ f: at(6.5, 7.5), x: 6.5, y: 0, z: 7.5, yaw: Math.PI }, OCTONAUT);
      snakes.push(snake); octonauts.push(octo);
      place(octo, 12.5, 12.5); hero(); place(snake, 6.5, 7.4);
      strike(snake, 0, 30);
      check(player.hp === 100 - SNAKE.damage && !player.ragdoll, 'A snake bite is a 16-damage flinch: ' + player.hp);
      check(snake.view.actions.attack.getEffectiveWeight() > 0.99, 'SnakeAttack must play during the bite');
      place(snake, 12.5, 2.5);
      results.push('snake bite: damage, flinch, SnakeAttack');

      hero(); place(octo, 6.5, 7.5);
      strike(octo, 0, 30);
      check(player.hp === 100 - OCTONAUT.damage && !player.ragdoll, 'Slap must deal 20 without knocking down: ' + player.hp);
      check(octo.view.actions.slap.getEffectiveWeight() > 0.99 && octo.view.actions.spin.getEffectiveWeight() < 0.01, 'OctoSlap must play');
      hero(); place(octo, 6.5, 5.5); octo.yaw = Math.PI;   // player behind it, after the wind-up stopped tracking
      strike(octo, 0, 30, OCTONAUT.attacks[0].trackUntil);
      check(player.hp === 100, 'A slap must not reach behind the Octonaut');
      hero(); place(octo, 6.5, 5.4); octo.yaw = Math.PI;
      strike(octo, 1, 40, OCTONAUT.attacks[1].trackUntil);
      check(player.hp === 100 - Math.round(OCTONAUT.damage * 1.4) && player.ragdoll, 'Spin kick must hit all around and knock down: ' + player.hp);
      check(octo.view.actions.spin.getEffectiveWeight() > 0.99, 'OctoSpin must play');
      results.push('Octonaut slap (frontal) / spin kick (all around, knockdown) with matching clips');

      hero(); place(octo, 6.5, 7.5); place(snake, 8.5, 6.5);
      damageEnemy(octo, octo.hp); damageEnemy(snake, snake.hp); updateEnemies(1 / 60); drawEnemies(1 / 60);
      check(octo.view.actions.death.getEffectiveWeight() === 1 && snake.view.actions.death.getEffectiveWeight() === 1, 'Death clips must play');
      for (const time of [0.4, 1, 1.6, 2.1]) {
        octo.deadT = snake.deadT = time; drawEnemies(1 / 60);
        check(minimumY(octo.view.model) >= -0.003 && minimumY(snake.view.model) >= -0.003, 'Corpses must stay above the floor at ' + time);
      }
      results.push('death clips stay on the floor');
      return results;
    } finally {
      state.map = originalMap; state.run = savedRun;
      Object.assign(player, saved); cancelSwing(player, true);
      resetEnemies();
    }
  });
}

// Fire-face fireball (and burning), Triangle punch (knockdown, dodging, walls), Fire-cat
// chase and pounce: real AI timers, projectiles flying over the level, the matching clips,
// glow lights, and corpses.
export async function runFireChecks() {
  await Promise.all([fireFaceModel, triangleModel, fireCatModel].map(m => m.load()));   // (enemy models load when first needed)
  check(fireFaceModel.ready && triangleModel.ready && fireCatModel.ready, 'Wait for the Fire-face / Triangle / Fire-cat assets to load');
  return paused(async () => {
    const originalMap = state.map, saved = { ...player }, savedRun = state.run, results = [];
    const run = (n, each) => { for (let i = 0; i < n; i++) { updateEnemies(1 / 60); drawEnemies(1 / 60); tickBurning(1 / 60); if (each?.(i)) return i; } return n; };
    const attack = (e, t = 0) => Object.assign(e, { mode: 'attack', t, bit: false, attacks: e.attacks + 1, attack: 0, think: 1e6, leap: 0 });
    const muzzle = (e, [mx, my, mz]) => new THREE.Vector3(e.x + mx * Math.cos(e.yaw) + mz * Math.sin(e.yaw), e.y + my, e.z - mx * Math.sin(e.yaw) + mz * Math.cos(e.yaw));
    const wall = on => { for (let x = 4; x < 9; x++) state.map.blockers[8 * N + x] = on ? [{ shape: 'box', x0: 4, x1: 9, z0: 8.4, z1: 8.6, bottom: -1, top: 3 }] : []; };
    try {
      state.run = createRun(); state.map = arena(); resetEnemies();
      for (const e of allEnemies()) place(e, 2.5, 2.5);   // the arena's own population waits in a corner
      const ff = makeEnemy({ f: at(6.5, 10.5), x: 6.5, y: 0, z: 10.5, yaw: Math.PI }, FIREFACE);
      const tri = makeEnemy({ f: at(6.5, 10), x: 6.5, y: 0, z: 10, yaw: Math.PI }, TRIANGLE);
      const cat = makeEnemy({ f: at(6.5, 8.5), x: 6.5, y: 0, z: 8.5, yaw: Math.PI }, FIRECAT);
      fireFaces.push(ff); triangles.push(tri); fireCats.push(cat);
      place(tri, 13.5, 2.5); place(cat, 13.5, 13.5); place(ff, 6.5, 10.5); hero();
      drawEnemies(1 / 60);
      const walkTime = ff.view.actions.walk.time;
      drawEnemies(0.25);
      check(ff.view.actions.walk.time !== walkTime && ff.speed === 0, 'A hovering Fire-face keeps its loop running while idle');
      check(ff.view.light.intensity > 2 && tri.view.light.intensity > 1 && cat.view.light.intensity > 0.5, 'Fire and the Triangle must light their surroundings');
      check(ff.view.flames.length >= 12 && cat.view.flames.length >= 9, 'Flame bones must be found for the flicker');

      // the ball in the clip sits where the thrown fireball starts
      attack(ff, FIREFACE.hitAt - 1 / 30);
      for (let i = 0; i < 40; i++) drawEnemies(1 / 60);
      scene.updateMatrixWorld(true);
      const ball = ff.view.model.getObjectByName('charge').getWorldPosition(new THREE.Vector3());
      check(ball.distanceTo(muzzle(ff, FIREFACE.projectile.muzzle)) < 0.05, 'FireAttack ball must leave from the muzzle: ' + ball.distanceTo(muzzle(ff, FIREFACE.projectile.muzzle)));
      place(ff, 6.5, 10.5); attack(ff);
      run(Math.ceil(FIREFACE.hitAt * 60));
      check(ff.view.actions.attack.getEffectiveWeight() > 0.99, 'FireAttack must play');
      check(projectiles.length === 1 && projectiles[0].kind === 'fireball' && projectiles[0].view, 'The Fire-face must spit one fireball');
      const fired = run(90, () => player.hp < 100);
      check(player.hp === 100 - FIREFACE.damage && !player.ragdoll && player.burning && burningLit(), 'A fireball deals 22 and sets the player on fire: ' + player.hp);
      check(!projectiles.length, 'The fireball must burst on the player');
      const burnt = run(60, () => !player.burning);
      check(player.hp === 100 - FIREFACE.damage - FIREFACE.projectile.burn.damage && Math.abs(burnt / 60 - 0.5) < 0.05,
        'Burning lasts half a second and deals its damage: ' + player.hp + ' after ' + burnt / 60);
      results.push(`fireball: from the muzzle, hit after ${(fired / 60).toFixed(2)}s, 22 + 6 burn over 0.5s`);

      hero(); place(ff, 6.5, 10.5); wall(true);
      attack(ff); run(120);
      check(player.hp === 100 && !projectiles.length, 'A wall must stop a fireball');
      place(ff, 6.5, 10.5); Object.assign(ff, { mode: 'chase', path: [ff.f], cool: 0 });
      run(40);
      check(ff.mode === 'chase' && ff.attacks === 3, 'No clear shot, no throw');
      wall(false); place(ff, 6.5, 10.5); Object.assign(ff, { mode: 'chase', path: [ff.f], cool: 0 });
      run(40);
      check(ff.mode === 'attack', 'With a clear shot in reach it throws by itself');
      place(ff, 13.5, 6.5); clearProjectiles();
      results.push('walls stop fireballs and block the shot; a clear line starts one');

      hero(); place(tri, 6.5, 10); attack(tri);
      run(Math.ceil(TRIANGLE.hitAt * 60) + 1);
      check(tri.view.actions.attack.getEffectiveWeight() > 0.99 && projectiles.length === 1 && projectiles[0].kind === 'punch', 'TriPunch must throw its inner triangles');
      check(tri.view.model.getObjectByName('ring').scale.x < 0.1, 'The thrown triangles must leave the frame');
      run(60, () => player.ragdoll);
      check(player.hp === 100 - TRIANGLE.damage && player.ragdoll, 'A Triangle punch deals 28 and knocks down: ' + player.hp);
      hero(); place(tri, 6.5, 10); attack(tri);
      run(Math.ceil(TRIANGLE.trackUntil * 60) + 2);
      player.x = 8.2;   // step aside after it stopped aiming
      run(90);
      check(player.hp === 100 && !projectiles.length, 'Stepping aside after the wind-up dodges the punch');
      check(tri.view.model.getObjectByName('ring').scale.x > 0.9, 'New inner triangles grow back');
      place(tri, 13.5, 2.5);
      results.push('Triangle punch: knockdown, dodgeable after it stops aiming, triangles regrow');

      hero(); place(cat, 6.5, 8.5); attack(cat);
      run(Math.ceil(FIRECAT.hitAt * 60) + 2);
      check(Math.abs(cat.z - (6.5 + FIRECAT.lunge.stop)) < 0.06, 'The pounce must land lunge.stop short of the player: ' + cat.z);
      check(cat.view.actions.attack.getEffectiveWeight() > 0.99, 'CatPounce must play');
      check(player.hp === 100 - FIRECAT.damage && !player.ragdoll && !player.burning, 'A Fire-cat bite deals 26, no knockdown, no burn: ' + player.hp);
      hero(); place(cat, 6.5, 13.5); Object.assign(cat, { mode: 'chase', think: 0 });
      let fastest = 0, runWeight = 0;
      run(240, () => { fastest = Math.max(fastest, cat.speed); runWeight = Math.max(runWeight, cat.view.actions.fast.getEffectiveWeight()); return cat.mode === 'attack'; });
      check(cat.mode === 'attack' && fastest > FIRECAT.chase * 0.9 && runWeight > 0.9, `The cat must run in (CatRun) and pounce: ${fastest} ${runWeight}`);
      const from = cat.z;
      run(80, () => player.hp < 100);
      check(player.hp === 100 - FIRECAT.damage && from - cat.z > 0.9, 'The real chase ends in a leap and a bite: ' + (from - cat.z));
      results.push('Fire-cat: runs at chase speed with CatRun, pounces lunge.stop short and bites');

      hero(); place(ff, 6.5, 9.5); place(tri, 4.5, 9.5); place(cat, 8.5, 9.5);
      for (const e of [ff, tri, cat]) damageEnemy(e, e.hp);
      run(1);
      check([ff, tri, cat].every(e => e.view.actions.death.getEffectiveWeight() === 1), 'Death clips must play');
      for (const time of [0.5, 1.2, 1.9, 2.4]) {
        for (const e of [ff, tri, cat]) e.deadT = time;
        drawEnemies(1 / 60);
        for (const e of [ff, tri, cat]) check(minimumY(e.view.model) >= -0.003, e.type + ' corpse below the floor at ' + time);
      }
      check(ff.view.light.intensity === 0 && tri.view.light.intensity === 0, 'The glow must die with them');
      run(Math.ceil(FIRECAT.corpseTime * 60) + 60);
      check(![ff, tri, cat].some(e => allEnemies().includes(e) || e.view), 'Corpses must leave and release their views');
      results.push('death clips on the floor, the glow dies, views released');
      return results;
    } finally {
      state.map = originalMap; state.run = savedRun;
      Object.assign(player, saved); cancelSwing(player, true);
      resetEnemies(); tickBurning(1);
    }
  });
}

// Out of reach and hit from afar, with the real AI: a spider shot from across a river takes
// cover out of the bow's range at once; one that sees the player but cannot get at them glares
// a moment, then backs off out of reach; one that can get at them comes, and so does a
// Fire-face to the bank it can shoot from.
export async function runTacticsChecks() {
  await Promise.all([spiderModel, fireFaceModel].map(m => m.load()));   // (enemy models load when first needed)
  check(spiderModel.ready && fireFaceModel.ready, 'Wait for the spider / Fire-face assets to load');
  check(!state.transitioning && !state.inventoryOpen, 'Close inventory and wait for portal travel to finish');
  return paused(async () => {
    const originalMap = state.map, saved = { ...player }, savedRun = state.run, passive = state.devPassive, results = [];
    const run = (n, until) => { for (let i = 0; i < n; i++) { updateEnemies(1 / 60); drawEnemies(1 / 60); if (until?.()) return i; } return n; };
    const river = on => { for (let x = 0; x < N; x++) for (const z of [9, 10]) at(x + 0.5, z + 0.5).fluid = on; };
    const away = e => Math.hypot(e.x - player.x, e.z - player.z);
    try {
      state.run = createRun(); state.map = arena(); resetEnemies(); state.devPassive = false;
      for (const e of allEnemies()) place(e, 1.5, 1.5);
      const spider = spiders[0], ff = makeEnemy({ f: at(13.5, 14.5), x: 13.5, y: 0, z: 14.5, yaw: Math.PI }, FIREFACE);
      fireFaces.push(ff); place(ff, 13.5, 14.5);
      const armed = z => {
        hero(); addItem(player.inventory, 'weapon_bow_recurve');
        equipItem(player.inventory, player.inventory.slots.find(s => s?.itemId === 'weapon_bow_recurve').instanceId);
        player.z = z; player.support = at(6.5, z);
        return combatStats(player).range;
      };
      river(true); const range = armed(8.5);
      place(spider, 6.5, 13.5); state.enemyGrace = 0; run(1); damageEnemy(spider, 1);
      const took = run(60, () => spider.mode === 'hide');
      check(took < 60, 'Shot across a river it cannot cross, it takes cover at once: ' + spider.mode);
      run(240);
      check(away(spider) > range && spider.speed === 0 && spider.mode === 'hide', 'It lies low out of the bow\'s range: ' + away(spider).toFixed(2));
      results.push(`shot out of reach: takes cover ${away(spider).toFixed(1)} cells off (range ${range})`);
      const before = away(spider); let closest = before;
      damageEnemy(spider, 1); run(90, () => { closest = Math.min(closest, away(spider)); });
      check(spider.mode === 'hide' && closest > before - 0.1, 'Hit again in cover, it does not step out towards the player: ' + (before - closest).toFixed(2));

      place(spider, 6.5, 11.4); spider.think = 0; spider.t = 0; spider.provoked = 0; player.z = 8.6;
      const noticed = run(60, () => spider.mode === 'chase'), hid = run(300, () => spider.mode === 'hide');
      check(noticed < 60 && hid < 300 && hid / 60 > 1.2, 'Out of reach it glares a moment, then backs off: ' + hid / 60);
      run(240);
      check(away(spider) > Math.min(range, 4), 'Out of the player\'s reach: ' + away(spider).toFixed(2));
      results.push(`seen out of reach: glares ${(hid / 60).toFixed(1)}s, then backs off`);
      river(false); player.x = spider.x; player.z = spider.z - 2.5; player.support = at(player.x, player.z);
      check(run(120, () => spider.mode === 'chase' || spider.mode === 'attack') < 120, 'A way to the player in sight: out of cover and back at them');
      results.push('back into the fight once it sees a way');

      river(false); place(spider, 6.5, 15.5); spider.provoked = 0; armed(6.5);
      check(away(spider) > SPIDER.giveUp, 'Further off than it can see');
      damageEnemy(spider, 1);
      const came = run(600, () => spider.mode === 'attack');
      check(came < 600, 'Shot from afar where it can get at the player, it comes and bites');
      results.push(`shot from 9 cells: comes and attacks after ${(came / 60).toFixed(1)}s`);

      place(spider, 1.5, 1.5); river(true); armed(8.5);
      place(ff, 13.5, 14.5); state.enemyGrace = 0; damageEnemy(ff, 1);
      const shot = run(600, () => ff.mode === 'attack' || ff.mode === 'hide');
      check(shot < 600 && ff.mode === 'attack' && ff.z > 10.9, 'A Fire-face shot across the river shoots back from its bank: ' + ff.mode + ' ' + ff.z.toFixed(2));
      results.push('a Fire-face goes to its bank and shoots back');
      return results;
    } finally {
      state.map = originalMap; state.run = savedRun; state.devPassive = passive;
      Object.assign(player, saved); cancelSwing(player, true);
      clearProjectiles(); resetEnemies();
    }
  });
}

// Real key events: always running after a short ramp, left Ctrl walks (Ctrl+W too), Space jumps,
// held Shift auto-attacks only an enemy within reach, F does nothing.
export async function runControlChecks() {
  check(character.ready && character.sword, 'Wait for character / weapon assets');
  return paused(async () => {
    const originalMap = state.map, saved = { ...player }, savedRun = state.run, inside = pointer.inside;
    const key = (type, code, init = {}) => {
      const e = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init });
      dispatchEvent(e); return e;
    };
    const speed = () => Math.hypot(player.vx, player.vz), near = (a, b) => Math.abs(a - b) < 0.01;
    try {
      state.run = createRun(); state.map = arena(); resetEnemies(); hero();
      for (const e of allEnemies()) place(e, 1.5, 1.5);
      pointer.inside = false;   // the cursor plays no part in keyboard targeting
      const spider = spiders[0], stunder = stunders[0], ramp = Math.round(RUN_RAMP * 60);

      key('keydown', 'KeyW'); tick(ramp - 3);
      check(speed() > WALK_SPEED && speed() < RUN_SPEED, 'Speed ramps up through walking pace: ' + speed());
      tick(6);
      check(near(speed(), RUN_SPEED), 'Then runs by default: ' + speed());
      key('keydown', 'ControlLeft', { ctrlKey: true }); tick(20);
      check(near(speed(), WALK_SPEED), 'Holding Ctrl walks: ' + speed());
      key('keyup', 'ControlLeft'); tick(20);
      check(near(speed(), RUN_SPEED), 'Releasing Ctrl runs again');
      key('keyup', 'KeyW'); tick(20);
      check(speed() === 0, 'Releasing the key stops');
      hero(); key('keydown', 'ControlLeft', { ctrlKey: true });
      const ctrlW = key('keydown', 'KeyW', { ctrlKey: true }); tick(30);
      check(ctrlW.defaultPrevented && near(speed(), WALK_SPEED), 'Ctrl first, then W walks');
      key('keyup', 'KeyW'); key('keyup', 'ControlLeft');
      hero(); key('keydown', 'ControlRight', { ctrlKey: true }); key('keydown', 'KeyW', { ctrlKey: true }); tick(30);
      check(near(speed(), RUN_SPEED), 'Right Ctrl does not walk (it is the action key): ' + speed());
      key('keyup', 'KeyW'); key('keyup', 'ControlRight');
      check(!key('keydown', 'KeyL', { ctrlKey: true }).defaultPrevented, 'Other Ctrl shortcuts are left to the browser');

      hero(); place(spider, 6.5, 6.5);
      let serial = player.sword.serial;
      press('Space');
      check(tick(120) > .5 && spider.hp === SPIDER.hp && player.sword.serial === serial, 'Space jumps without attacking');
      place(spider, 1.5, 1.5);

      hero(); place(stunder, 6.5, 9); serial = player.sword.serial;
      key('keydown', 'ShiftLeft'); tick(60);
      check(player.sword.serial === serial && stunder.hp === stunder.profile.hp && near(player.z, 6.5) && near(player.x, 6.5),
        'Shift does nothing without an enemy in reach (no swing at the air, no walking up)');
      place(stunder, 6.5, 7.4); tick(20);   // one swing connects by 0.27 s, the next chains at 0.42 s
      check(stunder.hp === STUNDER.hp - 30, 'Held Shift strikes once an enemy comes within reach: ' + stunder.hp);
      tick(130);
      check(player.sword.serial - serial >= 3 && stunder.hp <= STUNDER.hp - 90, 'Holding Shift keeps attacking: ' + (player.sword.serial - serial));
      key('keyup', 'ShiftLeft'); tick(60);
      serial = player.sword.serial; tick(60);
      check(player.sword.serial === serial, 'Releasing Shift stops attacking');

      hero(); place(stunder, 7.35, 6.5); stunder.hp = stunder.profile.hp;   // beside the player, who faces +z
      press('KeyF'); tick(60);
      check(stunder.hp === stunder.profile.hp, 'F no longer attacks');
      press('ShiftRight'); tick(75);
      check(stunder.hp === STUNDER.hp - 30, 'A Shift tap turns to and hits the enemy beside the player');
      return ['always runs after a ' + RUN_RAMP + ' s ramp / Ctrl walks, also Ctrl+W / other Ctrl shortcuts untouched',
        'Space jumps without attacking', 'Shift: nothing out of reach, strikes when in reach, holds chain, release stops',
        'F unbound / Shift tap turns to a side enemy'];
    } finally {
      for (const code of ['KeyW', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight']) key('keyup', code);
      pointer.inside = inside;
      state.map = originalMap; state.run = savedRun;
      Object.assign(player, saved); cancelSwing(player, true);
      resetEnemies(); tickBurning(1);
    }
  });
}

// Knockdown -> ragdoll -> exported GetUpFront / GetUpBack: the clip takes over the settled
// ragdoll pose, holds the player until the legs are under the body, can be walked out of,
// and leaves an idle pose that stays put.
export async function runGetUpChecks() {
  check(character.ready, 'Wait for the character to load');
  return paused(async () => {
    const originalMap = state.map, saved = { ...player }, savedRun = state.run;
    const key = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    const hips = () => character.bones.hips.getWorldPosition(new THREE.Vector3());
    function down(push) {
      hero(); tick(5); knockDown({ push, hop: 2.5 });
      let frames = 0, before = hips();
      while (player.ragdoll && frames++ < 300) { before = hips(); tick(1); }
      check(!player.ragdoll && player.getUp, 'The ragdoll settles and the player gets up');
      return { frames, jump: hips().distanceTo(before) };
    }
    try {
      state.run = createRun(); state.map = arena(); resetEnemies();
      for (const e of allEnemies()) place(e, 1.5, 1.5);
      const sides = [];
      for (const push of [3, -3]) {
        const { frames, jump } = down(push), g = player.getUp;
        sides.push(g.side);
        check(frames < 90, 'A flat-ground ragdoll settles within 1.5 s: ' + frames);
        check(jump < 0.05, 'The get-up starts from the ragdoll pose: ' + jump);
        check(player.stun === g.move && g.move < g.duration && g.duration < 1.2, 'Held until the move time');
        const x = player.x, z = player.z;
        key('keydown', 'KeyW'); tick(Math.floor(g.move * 60) - 2);
        check(player.x === x && player.z === z && player.getUp === g, 'No walking before the legs are under the body');
        tick(20);
        check(!player.getUp && Math.hypot(player.x - x, player.z - z) > 0.5 && character.getUpWeight === 0,
          'Walking cuts the rest of the get-up short');
        key('keyup', 'KeyW'); tick(30);
      }
      check(sides.join() === 'front,back', 'Pushed forward lands face down, backward on the back: ' + sides);

      // untouched, both clips play to their end without dragging a foot over the floor
      const sole = side => character.bones['shin.' + side].localToWorld(new THREE.Vector3(0, 0.37, 0));
      for (const push of [3, -3]) {
        down(push);
        let last = null, slide = 0;
        while (player.getUp) {
          tick(1);
          const now = ['L', 'R'].map(sole);
          if (last && player.getUp?.t > 0.3) now.forEach((v, i) => {   // after the morph from the ragdoll
            if (Math.min(v.y, last[i].y) - player.y < 0.035) slide = Math.max(slide, Math.hypot(v.x - last[i].x, v.z - last[i].z) * 60);
          });
          last = now;
        }
        check(slide < 0.6, 'Feet on the floor stay planted while getting up: ' + slide);
      }
      tick(30);
      check(!player.getUp && character.getUpWeight === 0, 'Untouched, the get-up plays to its end');
      character.swordWeight = 0; tick(600);   // no fading weight forcing the mixer to repose
      const worst = Math.max(...Object.keys(character.standing).map(n => character.bones[n].quaternion.angleTo(character.standing[n])));
      check(worst < 0.03, 'Idle keeps the idle pose (breathing only): ' + worst);
      return ['ragdoll settles fast and hands its pose to GetUpFront / GetUpBack', 'no walking until the move time, walking cuts the tail',
        'get-up plays out untouched with planted feet / idle pose stays put'];
    } finally {
      key('keyup', 'KeyW');
      state.map = originalMap; state.run = savedRun;
      Object.assign(player, saved); cancelSwing(player, true);
      resetEnemies(); tickBurning(1);
    }
  });
}

// Real ladder controller, exported Climb action and blend tree (no keyboard timing).
export async function runClimbChecks() {
  check(character.ready && character.sword, 'Wait for the player and separate weapon assets to load');
  return paused(async () => {
    const originalMap = state.map, saved = { ...player }, weapon = character.sword, results = [];
    let time = 0;
    const step = (dx = 0, dz = 0, jump = false) => {
      climb(1 / 60, dx, dz, jump); player.visY = player.y;
      animateCharacter(1 / 60, time += 1 / 60);
    };
    const pose = () => Object.values(character.bones).flatMap(b => [...b.position.toArray(), ...b.quaternion.toArray()]);
    const samePose = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-5);
    try {
      state.map = arena(); hero(); resetMode();
      const l = { x: 6, z: 6, d: 2, y0: 0, y1: 4, layer: 0 };
      state.map.ladders = [l];
      Object.assign(at(6.5, 7.5), { top: 8, cs: [4, 4, 4, 4] });   // top is in levels, corners in game units
      player.z = 6.74;
      for (let i = 0; i < 40; i++) step(0, 1);
      check(player.climb && W.climb > 0.99 && W.walk < 0.01, 'Ladder must use Climb, not Walk');
      check(!character.sword.visible, 'Climbing needs both hands free');
      results.push('ladder grab selects exported Climb and hides sword');

      for (let i = 0; i < 90; i++) step();
      const held = pose(), phase = character.actions.climb.time, y = player.y;
      for (let i = 0; i < 30; i++) step();
      check(player.y === y && character.actions.climb.time === phase && samePose(held, pose()), 'Idle on ladder must hold the same grip');
      results.push('stationary ladder grip freezes pose');

      step(0, 1); const forward = pose();
      step(0, -1);
      check(Math.abs(character.actions.climb.time - phase) < 1e-8 && samePose(held, pose()), 'Descent must reverse the same cycle');
      check(!samePose(held, forward), 'Ascent must animate hands and feet');
      results.push('ascent advances / descent reverses distance-driven phase');

      step(0, 0, true);
      check(!player.climb && !player.grounded && player.vy > 0 && character.sword.visible, 'Jump-off must release ladder and restore sword');
      for (let i = 0; i < 40; i++) animateCharacter(1 / 60, time += 1 / 60);
      check(W.fall > 0.99 && W.climb < 0.01, 'Jump-off must blend to airborne animation');
      results.push('jump-off blends to falling and restores sword');

      // Both exits must leave the climb mode (including after reverse phase wrap).
      Object.assign(player, { climb: { l, side: 0 }, y: l.y1 - 0.01, grounded: true, vy: 0 });
      step(0, 1);
      check(!player.climb && player.y === l.y1, 'Top exit must stand on the upper floor');
      for (let i = 0; i < 90; i++) animateCharacter(1 / 60, time += 1 / 60);
      check(W.idle > 0.99 && W.climb < 0.01, 'Top exit must return to locomotion');
      Object.assign(player, { climb: { l, side: 0 }, y: 0.01 });
      step(0, -1);
      check(!player.climb && player.y === 0, 'Bottom exit must return to ground');
      results.push('top and bottom exits return to grounded animation');

      for (let d = 0; d < DIRS.length; d++) {
        l.d = d; Object.assign(player, { climb: { l, side: 0 }, y: 2, climbV: 0 });
        for (let i = 0; i < 90; i++) step();
        const [dx, dz] = DIRS[d];
        check(Math.abs(Math.sin(player.yaw) - dx) < 1e-5 && Math.abs(Math.cos(player.yaw) - dz) < 1e-5, 'Climber must face wall in direction ' + d);
      }
      results.push('faces the wall in all four ladder orientations');
      equipSword(null); step();
      check(!character.sword && !weapon.parent && W.climb > 0.99, 'Unarmed character must climb without any weapon');
      equipSword(weapon); step();
      check(weapon.parent === character.bones['hand.R'] && !weapon.visible, 'Dynamically re-equipped sword must stay hidden while climbing');
      results.push('unarmed climbing / dynamic weapon attachment');
      return results;
    } finally {
      equipSword(weapon);
      state.map = originalMap; Object.assign(player, saved); resetMode();
      animateCharacter(1 / 60, time);
    }
  });
}

// Uses a real generated neighbour, not the fixture. Leaves you in that cube.
export async function runTravelCheck() {
  check(!state.transitioning, 'Wait for current travel to finish');
  return paused(async () => {
    drawEnemies(1 / 60);
    const old = allEnemies(), portal = state.map.portals.find(p => p.kind !== 'spawn');
    check(portal, 'Need an exit portal');
    if (old[0]) { damageEnemy(old[0], old[0].hp); updateEnemies(1 / 60); } // reward + cleanup include a dead enemy too
    player.sword.requested = true;
    startTravel(portal);
    for (let i = 0; i < 100 && !travelling(); i++) await delay(30);
    check(travelling(), 'Travel did not start');
    for (let i = 0; i < 180 && travelling(); i++) { updateTravel(1 / 60); drawTravelEnemies(1 / 60); }
    check(!state.transitioning && !travelling(), 'Travel did not finish');
    check(old.every(e => !e.view), 'Old live / dead enemy views leaked across portal');
    check(stunders.length <= 2, 'Next cube exceeded Stunder cap');
    check(!player.sword.active && !player.sword.requested, 'Queued sword input crossed the portal');
    return { cube: state.cubeKey, stunders: stunders.length, oldEnemiesDisposed: old.length };
  });
}

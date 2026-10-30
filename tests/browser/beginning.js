// In devtools (?dev=1&intro=1&tutorial=1): await (await import('./tests/browser/beginning.js')).runBeginningChecks()
// The beginning, played through (docs/story.md "The beginning"; core/intro.js, game/intro.js,
// game/scene.js, game/tutorial.js): in a fresh world the hero comes out of the inn and the
// tutorial's card shows the player's keys; coming to the crash on the plaza (another of the town's
// tiles, docs/town.md) the robot wakes in its scene and says hello; the sword taken, the town's gate
// opens; coming into the rock's
// room his glass is shown in its scene, three snakes wait at the rock's foot; walking into the
// glass breaks it in its close-up, his recording plays, the gate on opens and the card says where
// his words are kept. Plays in a fresh world, then puts the one played back.
import { state, player } from '../../src/game/state.js';
import { newWorld, enterCube, spawnAt } from '../../src/game/flow.js';
import { clearInput } from '../../src/game/input.js';
import { step } from '../../src/world/coords.js';
import { INTRO_GATES } from '../../src/core/intro.js';
import { robotMet } from '../../src/core/robot.js';
import { WAKE_HOUSE } from '../../src/world/town.js';
import { sceneNow, stopScene } from '../../src/game/scene.js';
import { tutorialNow } from '../../src/game/tutorial.js';
import { robotHere } from '../../src/game/robot.js';
import { allEnemies } from '../../src/game/enemies.js';
import { keysOf, nameOf } from '../../src/game/settings.js';

const check = (value, message) => { if (!value) throw Error(message); };
const wait = s => new Promise(res => setTimeout(res, s * 1000));
// until f() is true (checked every frame), or s seconds have gone
async function until(f, s, what) {
  const end = performance.now() + s * 1000;
  while (!f()) {
    check(performance.now() < end, `timed out: ${what}`);
    await new Promise(res => requestAnimationFrame(res));
  }
}

export async function runBeginningChecks() {
  check(new URLSearchParams(location.search).get('intro') === '1', 'Load with ?dev=1&intro=1&tutorial=1');
  const seed = state.cubes.seed, out = [];
  try {
    await newWorld(11); clearInput();
    // the town: out of the inn, the card with the keys
    const inn = state.map.doors.find(d => d.building === WAKE_HOUSE);
    check(Math.hypot(state.arrival.x - inn.x, state.arrival.z - inn.z) < 1, 'came out of the inn');
    await until(() => !document.getElementById('tutorial').hidden, 8, 'the tutorial\'s card');
    const card = document.getElementById('tutorial').textContent;
    check(card.includes(nameOf(keysOf('turnLeft')[0])), 'the card names the player\'s keys');
    check(!state.run.unlockedGates.has(INTRO_GATES.sword) && !robotMet(state.run), 'the beginning not begun');
    out.push('town: out of the inn, the card shown');
    // the plaza: the shards of the crash, the robot wakes in its scene
    const plaza = await state.cubes.get(state.cubes.town.portal), near = plaza.map.relics.robot;
    enterCube(plaza, null, null, { x: near.x - 2, y: near.y, z: near.z });
    check(state.world.group.userData.shards || (await wait(0.5), state.world.group.userData.shards), 'shards on the plaza');
    await until(() => sceneNow()?.name === 'robot', 5, 'the robot\'s scene');
    check(document.body.classList.contains('cinematic'), 'the black bars and no HUD');
    await until(() => robotMet(state.run) && robotHere(), 4, 'the robot awake');
    await until(() => !sceneNow(), 8, 'its scene over');
    check(!document.body.classList.contains('cinematic'), 'the HUD back');
    out.push('plaza: the crash, the robot woke in its scene');
    // the sword
    const sword = state.map.relics.sword;
    spawnAt(sword.x, sword.y, sword.z);
    await until(() => state.run.unlockedGates.has(INTRO_GATES.sword), 3, 'the sword taken');
    out.push('plaza: the sword taken, the gate open');
    // the rock: its scene, the snakes, the glass
    const gate = state.cubes.town.gate, exit = state.cubes.town.exit, rock = await state.cubes.get(step(gate, exit));
    enterCube(rock, exit ^ 1);
    await until(() => sceneNow()?.name === 'glass', 5, 'the glass\'s scene');
    const g = state.map.firstGlass;
    check(allEnemies().filter(e => e.profile?.species === 'snake' && e.hp > 0).length === 3, 'three snakes');
    stopScene();   // (skipped)
    check(!sceneNow() && state.run.met.has('scene:glass'), 'skipped, and shown once');
    spawnAt(g.glass.x - 0.3, g.glass.y, g.glass.z);
    await until(() => sceneNow()?.name === 'break', 3, 'the glass breaking');
    await until(() => state.run.unlockedGates.has(INTRO_GATES.glass), 3, 'the glass found');
    check(state.run.told.has('recording.glass.found'), 'his recording heard');
    await until(() => !sceneNow(), 5, 'its scene over');
    await until(() => !document.getElementById('tutorial').hidden, 3, 'the last card');
    check(tutorialNow().done.includes('glass'), 'the glass step done');
    out.push('rock: shown, three snakes, the glass broke, the gate open');
    return out;
  } finally {
    stopScene();
    clearInput();
    player.hp = player.maxHp;
    await newWorld(seed);
  }
}

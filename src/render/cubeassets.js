// What a cube needs before it is shown, in two steps (world/client.js: travel waits for both,
// like for the cube's map; prefetch does them ahead for the cubes behind the portals):
//   - cubeAssets: the prop sets it shows, its enemies' models and the coins they drop. A
//     failed load does not hold the cube up: what is missing is logged and tried again the
//     next time.
//   - warmCube: the shaders of everything it shows, or may show (render/warmup.js): the cube
//     built once off-screen and thrown away, the proxy batches it goes into later, an enemy of
//     each kind it has and the loot they drop. Without this, the frame a new depth is entered
//     in waited for the driver to compile a handful of programs (a second and more on a phone).
import { propSetsOf } from './propplace.js';
import { loadPropSets } from './props.js';
import { loadSpecies, enemyWarmup } from './enemies.js';
import { loadLoot, lootWarmup } from './loot.js';
import { proxyWarmup, shownFar } from './neighbors.js';
import { buildWorld, disposeWorld } from './world.js';
import { scene } from './scene.js';
import { warm } from './warmup.js';
import { warmBake } from './bake.js';
import { flameWarmup } from './flames.js';
import { markerWarmup } from './markers.js';
import { introWarmup } from './introfx.js';
import { footprintWarmup } from './footprints.js';
import { meteorWarmup } from './meteors.js';
import { cellWarmup } from './watercells.js';
import { turn } from './turns.js';
import { speciesIn, kindsIn } from '../core/spawns.js';
import { COINS } from '../core/items.js';
import { themeOf } from '../themes/depth.js';

const coins = COINS.map(c => c.id);

export const cubeAssets = c => Promise.all([loadPropSets(propSetsOf(c.map, themeOf(c.map))), loadSpecies(speciesIn(c.map)),
  c.map.enemyFree ? null : loadLoot(coins)]);

export async function warmCube(c) {
  await turn();   // (building it is the one heavy step here: one cube per frame)
  const world = buildWorld(c.map, false, {}, c.geo);
  scene.remove(world.group);   // never drawn
  const enemies = enemyWarmup(kindsIn(c.map));
  try {
    await warm([world.group, ...proxyWarmup(c.geo, shownFar(c.map)), ...enemies.objects, ...lootWarmup(c.map.enemyFree ? [] : coins), ...warmBake(), ...flameWarmup(), ...markerWarmup(), ...introWarmup(c.map), ...cellWarmup(), ...footprintWarmup(), ...themeOf(c.map).meteors ? meteorWarmup() : []]);
  } finally {
    disposeWorld(world);
    enemies.dispose();
  }
}

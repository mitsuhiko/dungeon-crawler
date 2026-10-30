// Real worker/asset/render checks of the town (docs/town.md), run from index.html's devtools:
// await (await import('./tests/browser/town.js')).runTownChecks()
// Resets the world before/after testing.
import { N, DIRS } from '../../src/core/constants.js';
import { state, player } from '../../src/game/state.js';
import { newWorld, enterCube } from '../../src/game/flow.js';
import { clearInput } from '../../src/game/input.js';
import { updatePlayer } from '../../src/game/update.js';
import { step } from '../../src/world/coords.js';
import { BUILDINGS, MERCHANTS, STREET } from '../../src/world/town.js';
import { props } from '../../src/render/props.js';
import { liveNeighbors } from '../../src/render/neighbors.js';
import { paused } from './combat.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function rendered(name) {
  const asset = props.byName.get(name);
  check(asset, 'Missing asset: ' + name);
  let count = 0;
  state.world.group.traverse(o => {
    if (o.isInstancedMesh && o.material.userData?.ghost && asset.parts.some(p => p.geometry === o.geometry)) count += o.count;
  });
  return count / asset.parts.length;
}
// the middle of the tile's side d, a step in
const besideSeam = d => ({ x: [N - .6, .6, STREET, STREET][d], z: [STREET, STREET, N - .6, .6][d] });

export async function runTownChecks() {
  check(!state.transitioning && !state.inventoryOpen, 'Finish travel and close inventory first');
  const originalSeed = state.cubes.seed;
  return paused(async () => {
    const results = [];
    try {
      for (const seed of [0, 1, 2, 3]) {
        await newWorld(seed); clearInput();
        const town = state.cubes.town;
        // all of it known from the start
        for (let i = 0; i < 100 && town.keys.some(k => !state.cubes.cubes.get(k)?.visits); i++) await delay(50);
        check(town.keys.every(k => state.cubes.cubes.get(k)?.visits), 'The town is not known from the start');
        for (const k of town.keys) {
          const c = await state.cubes.get(k), d = c.map.seams.findIndex(Boolean);
          enterCube(c, null, null, { ...besideSeam(d), y: c.map.floors[0].top * .5 });
          check(state.map.town && document.getElementById('dev-depth').textContent.includes('Town'), 'Town tile mislabeled in HUD');
          for (const b of [...BUILDINGS, ...MERCHANTS])
            check(rendered(b.name) === (town.houses[b.name] === k ? 1 : 0), `${b.name} not rendered once, in its tile only`);
          const boxes = c.map.occluders.filter(b => b.shape === 'box');
          for (const name of new Set(boxes.map(b => b.name)))
            check(boxes.some(box => box.name === name && c.map.blockers.some(list => list.includes(box))), 'Rendering discarded static building collision');
          check(state.world.glass.userData.seams?.every((s, i) => s === c.map.seams[i]), 'The glass knows no seams');
          const others = liveNeighbors().filter(g => town.tiles.has(g.key));
          check(others.length === town.keys.length - 1 && others.every(g => g.lift === 1), 'The other tiles are not drawn round it');
        }
        // walking across a seam: the tile beyond takes over at once, the hero where they were
        for (const k of [town.start, town.portal]) {
          const c = await state.cubes.get(k);
          for (let d = 0; d < 4; d++) {
            if (!c.map.seams[d]) continue;
            enterCube(c, null, null, { ...besideSeam(d), y: c.map.floors[0].top * .5 });
            const before = { x: player.x, z: player.z }, [dx, dz] = DIRS[d];
            player.autoDir = [dx, dz];
            let steps = 0;
            for (; steps < 120 && state.cubeKey === k; steps++) updatePlayer(1 / 60);
            player.autoDir = null;
            check(state.cubeKey === step(k, d) && !state.transitioning, `No hand over across side ${d} of ${k}`);
            const walked = Math.hypot(player.x + dx * N - before.x, player.z + dz * N - before.z);
            check(walked < 2, `The hero jumped across the seam (${walked})`);
          }
        }
        results.push(`seed ${seed}: town known / buildings in their tiles / one hull / walked across its seams`);
      }
      return results;
    } finally { clearInput(); await newWorld(originalSeed); }
  });
}

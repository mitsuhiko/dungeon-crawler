// Browser integration checks for house doors and interiors: real worker, rendering, the
// cutaway walls and the fades. Resets the world before and after. From the devtools console:
//   await (await import('./tests/browser/interior.js')).runInteriorChecks()
import { player, state, view } from '../../src/game/state.js';
import { newWorld, spawnAt, enterCube } from '../../src/game/flow.js';
import { updatePlayer } from '../../src/game/update.js';
import { clearInput } from '../../src/game/input.js';
import { doorArrival } from '../../src/core/doors.js';
import { interiorKey } from '../../src/world/town.js';
import { U } from '../../src/render/cutshader.js';
import { paused } from './combat.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function arrived(key) {
  for (let i = 0; i < 150 && (state.transitioning || state.cubeKey !== key); i++) await delay(20);
  check(!state.transitioning && state.cubeKey === key, `Door to ${key} timed out`);
}
// walk into door d (the real controller) until it takes you
function walkInto(d) {
  player.autoDir = [-d.nx, -d.nz];
  try { for (let i = 0; i < 90 && !state.transitioning; i++) updatePlayer(1 / 30); } finally { player.autoDir = null; }
  check(state.transitioning, `Walking into the door of ${d.building} must take you through`);
}

export async function runInteriorChecks() {
  const results = [], yaw = view.yawTarget;
  try {
    await paused(async () => {
      for (const seed of [0, 1, 2, 3]) {
        await newWorld(seed); clearInput();
        // (the houses stand in the town's different tiles: world/town.js)
        let houses = 0;
        for (const tile of new Set(Object.values(state.cubes.town.houses))) for (const d of (await state.cubes.get(tile)).map.doors) {
          if (state.cubeKey !== tile) { const c = await state.cubes.get(tile); enterCube(c, null, null, doorArrival(d)); }
          houses++;
          const a = doorArrival(d);
          spawnAt(a.x, a.y, a.z);
          walkInto(d);
          await arrived(d.to);
          const m = state.map, inside = m.doors[0];
          check(m.interior?.building === d.building, 'Arrived in the wrong house');
          check(!state.world.glass.visible, 'Interiors have no glass box');
          check([inside.nx, inside.nz].every((v, i) => Math.abs(v + [d.nx, d.nz][i]) < 1e-9), 'The door inside faces the way the house does');
          check(Math.hypot(player.x - inside.x - inside.nx * .75, player.z - inside.z - inside.nz * .75) < .3, 'Arrived on the door\'s inner side');
          check(Math.abs(player.yaw - Math.atan2(-d.nx, -d.nz)) < 1e-6, 'Arrived facing the way you walked in');
          // the camera's side of the walls comes away entirely, only the walls' own mesh
          view.yawTarget = view.yaw = -Math.PI / 4;
          await delay(80);
          check(U.uFront.value.y > .5 && U.uFront.value.z > .5 && U.uFront.value.x < .5 && U.uFront.value.w < .5, 'West and south walls face the default camera');
          check(Math.abs(U.uWallY.value - inside.y) < .05, 'Walls come down to the floor');
          check(U.uFrontKinds.value.y === 1 && U.uFrontKinds.value.x === 0 && U.uFrontKinds.value.z === 0, 'Only the walls are cut, not the floors or the stair');
          check(document.getElementById('minimap'), 'Minimap still draws');
          walkInto(inside);
          await arrived(tile);
          check(Math.hypot(player.x - a.x, player.z - a.z) < .3, 'Back out on the doorstep');
          check(Math.abs(player.yaw - Math.atan2(d.nx, d.nz)) < 1e-6, 'Facing away from the door');
          check(state.cubes.cubes.get(interiorKey(d.building)), 'The interior stays cached');
        }
        check(U.uFrontKinds.value.x === 1, 'Outside, caves cut every kind again');
        results.push(`seed ${seed}: in and out of ${houses} houses`);
      }
    });
    return results;
  } finally { view.yawTarget = yaw; clearInput(); await newWorld(state.baseSeed); }
}

// In devtools: await (await import('./tests/browser/hover.js')).runHoverChecks()
// Everything clicked in the world shows the pointer where it is, not only where its label hangs
// (game/lootlabels.js bodyOf): in the town (the glassmaker's glass floating over the plaza, the
// villagers, the gate) and in the merchant camp (his sword standing in the ground), seen from
// close up and from far off. Each thing is pointed at in the middle of its body and low on it;
// there the cursor must be a pointer, and the thing (or one in front of it) hovered. Then the
// cursor goes to the empty sky: nothing hovered, no pointer. Plays in a fresh world, then puts
// the one played back.
import { state, view } from '../../src/game/state.js';
import { newWorld, enterCube } from '../../src/game/flow.js';
import { clearInput } from '../../src/game/input.js';
import { step } from '../../src/world/coords.js';
import { camera, renderer } from '../../src/render/scene.js';
import { hoverables, hoveredKey } from '../../src/game/lootlabels.js';
import { ZOOM_LEVELS } from '../../src/core/zoom.js';
import { cameraMode, setCameraMode } from '../../src/game/settings.js';
import * as THREE from 'three';

const check = (condition, message) => { if (!condition) throw Error(message); };
const frames = (n = 3) => new Promise(res => { const go = () => (n-- > 0 ? requestAnimationFrame(go) : res()); go(); });
const canvas = renderer.domElement;
const move = async (x, y) => {
  canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerType: 'mouse', bubbles: true }));
  await frames(2);
};
const v = new THREE.Vector3();
const onScreen = (x, y, z) => {
  v.set(x, y, z).project(camera);
  if (v.z > 1 || Math.abs(v.x) > 0.9 || Math.abs(v.y) > 0.9) return null;
  return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
};

// every thing here, at the zoom levels: `must` (keys) have to be among them
async function checkHere(where, must) {
  const out = [];
  for (const zoom of [ZOOM_LEVELS[0], ZOOM_LEVELS.at(-1)]) {
    view.zoom = view.zoomTarget = zoom;
    await frames(30);
    const things = hoverables();
    for (const key of must) check(things.some(t => t.key === key), `${where}: ${key} is not there to hover`);
    let pointed = 0;
    for (const { key, body } of things) {
      for (const share of [0.5, 0.2]) {
        const at = onScreen(body.x, body.y0 + (body.y1 - body.y0) * share, body.z);
        if (!at) continue;
        await move(...at);
        const hovered = hoveredKey();
        check(hovered && canvas.style.cursor === 'pointer', `${where}: no pointer on ${key} (${share} up its body, zoom ${zoom.toFixed(2)})`);
        if (must.includes(key)) check(hovered === key, `${where}: ${key} not hovered on its body (${hovered} is)`);
        pointed++;
      }
    }
    check(pointed > 0, `${where}: nothing on screen to point at`);
    await move(innerWidth / 2, 4);
    check(!hoveredKey() && canvas.style.cursor !== 'pointer', `${where}: the sky is hovered`);
    out.push(`${where}, zoom ${zoom.toFixed(2)}: ${pointed} points on ${things.length} things`);
  }
  return out;
}

export async function runHoverChecks() {
  check(!state.transitioning && !state.inventoryOpen, 'Finish travel and close inventory first');
  const seed = state.cubes.seed, zoom = view.zoomTarget, mode = cameraMode(), results = [];
  setCameraMode('overview');   // (the close view's cursor is the crosshair in the middle)
  try {
    await newWorld(7); clearInput();
    state.run.unlockedGates.clear();   // (the beginning not done: the glass and the sword are there)
    const town = state.cubes.cubes.get(state.cubeKey);
    await frames(10);
    results.push(...await checkHere('town', ['story:glass']));
    const camp = await state.cubes.get(step(town.key, town.map.exit));
    enterCube(camp, town.map.exit ^ 1);
    await frames(10);
    results.push(...await checkHere('camp', ['story:sword']));
    return results;
  } finally {
    clearInput();
    view.zoom = view.zoomTarget = zoom;
    setCameraMode(mode);
    await newWorld(seed);
  }
}

// Run in the game console: (await import('/tests/browser/zoom.js')).runZoomChecks()
import { player, state, view } from '../../src/game/state.js';
import { DEFAULT_ZOOM, ZOOM_LEVELS, stepZoom } from '../../src/core/zoom.js';
import { setInventoryOpen } from '../../src/game/inventory.js';
import '../../src/game/input.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const press = (code, options = {}) => {
  dispatchEvent(new KeyboardEvent('keydown', { code, ...options }));
  dispatchEvent(new KeyboardEvent('keyup', { code }));
};
const wheel = deltaY => dispatchEvent(new WheelEvent('wheel', { deltaY }));

export function runZoomChecks() {
  const original = view.zoomTarget, inventoryOpen = state.inventoryOpen, ragdoll = player.ragdoll;
  try {
    setInventoryOpen(false);
    view.zoomTarget = DEFAULT_ZOOM;
    press('KeyK');
    const closer = stepZoom(DEFAULT_ZOOM, -1);
    check(view.zoomTarget === closer && player.ragdoll === ragdoll, 'K must zoom in, not knock over');
    press('KeyL');
    check(view.zoomTarget === DEFAULT_ZOOM, 'L must undo K exactly');
    wheel(-100);
    check(view.zoomTarget === closer, 'Wheel up must match K');
    wheel(100);
    check(view.zoomTarget === DEFAULT_ZOOM, 'Wheel down must match L');
    wheel(0);
    press('KeyK', { repeat: true });
    press('KeyL', { ctrlKey: true });
    check(view.zoomTarget === DEFAULT_ZOOM, 'Zero wheel, repeats and modified shortcuts must not zoom');
    for (let i = 0; i < 10; i++) press('KeyK');
    const levels = new Set([view.zoomTarget]);
    for (let i = 0; i < 10; i++) { press('KeyL'); levels.add(view.zoomTarget); }
    check(levels.size === ZOOM_LEVELS.length, `K/L must have exactly ${ZOOM_LEVELS.length} zoom levels`);
    for (let i = 0; i < 10; i++) wheel(-100);
    const wheelLevels = new Set([view.zoomTarget]);
    for (let i = 0; i < 10; i++) { wheel(100); wheelLevels.add(view.zoomTarget); }
    check(wheelLevels.size === ZOOM_LEVELS.length && [...wheelLevels].every(zoom => levels.has(zoom)), 'Wheel must share the same levels');
    view.zoomTarget = DEFAULT_ZOOM;
    setInventoryOpen(true);
    for (const input of [() => press('KeyK'), () => press('KeyL'), () => wheel(-100), () => wheel(100)]) {
      input();
      check(view.zoomTarget === DEFAULT_ZOOM, 'Inventory must suppress keyboard and wheel zoom');
    }
    return ['K/L zoom without knockdown', 'wheel matches reversible keyboard steps', 'exactly the shared levels', 'input guards / inventory isolation'];
  } finally {
    view.zoomTarget = original;
    setInventoryOpen(inventoryOpen);
  }
}

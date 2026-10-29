// The UI scale (the settings, game/settings.js): the HUD and the menus drawn smaller or bigger,
// 90% to 200%. style.css does it with `zoom: var(--ui)` on each of them (the quick bar, the
// potions at work, the chat, the minimap and the quest under it, the trial's box, the teleport
// menu, the Esc menu, the settings, the inventory, the main menu ...): everything in them grows
// together, their distances from the window's edges too, so what sits over or beside another
// (the potions over the quick bar, the quest under the minimap) still does. What JavaScript places
// on the screen (the item labels, the lock-on ring, the trial tip, the supply cart's bar) grows by
// calc(... * var(--ui)) instead, so its pixels stay the screen's. The bars and level labels
// floating over the heroes and the enemies (render/bars.js) grow too, upwards from where the bar
// sits (render/playerbar.js, partner.js, enemies.js, renewview.js, castbar.js, portalbar.js).
// Not scaled: the touch controls (made for a thumb) and the dev panel.
//
// The layouts that change with the window's size (the inventory, the touch layout of the quick
// bar and the minimap) go by the room the UI has at its scale: classes on <body> stand in for the
// media queries, the window's size divided by the scale against the same widths.
//   ui-w1000, ui-w640, ui-w540, ui-w400   at most this wide
//   ui-roomy                     at least 700 wide and 600 high (a tablet: the quick bar at the bottom)
import { uiScale, onSettingsChange } from './settings.js';

const root = document.documentElement, body = document.body;
export { uiScale };

function apply() {
  const s = uiScale(), w = root.clientWidth / s, h = root.clientHeight / s;
  root.style.setProperty('--ui', String(s));
  for (const n of [1000, 640, 540, 400]) body.classList.toggle(`ui-w${n}`, w <= n);
  body.classList.toggle('ui-roomy', w >= 700 && h >= 600);
}
apply();
onSettingsChange(apply);
addEventListener('resize', apply);

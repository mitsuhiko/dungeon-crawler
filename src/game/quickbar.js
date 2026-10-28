// The quick bar: six slots along the bottom of the screen, on keys 1-6 (or the ones the settings
// give, game/settings.js; or a click). A slot points at a bag item (core/inventory.js
// assignBar): a weapon is equipped, a usable item used (the town and room portal scrolls start their casts, game/townportal.js, roomportal.js; a
// potion is drunk, core/potions.js; a flask is taken in hand to throw, or put away again,
// game/equipment.js). With the inventory open, 1-6 or a click puts the selected bag item on that slot instead (again on
// the same slot: off; the bar pulses while such an item is selected). A potion's slot fills
// while its cooldown runs. With touch controls (game/touch.js) the bar sits at the top on a phone (at the bottom on a tablet), with a
// bag button at its end for the inventory and a menu button for the Esc menu (game/escmenu.js).
import { player, state, setStatus } from './state.js';
import { sfx } from '../audio/sfx.js';
import { ITEMS } from '../core/items.js';
import { BAR_SIZE, barEntry, ownedItem, removeItem } from '../core/inventory.js';
import { drinkPotion, cooldownShare } from '../core/potions.js';
import { floatText } from '../render/floattext.js';
import { itemName, defName } from './itemnames.js';
import { together } from '../net/online.js';
import { rarityOf } from '../core/gear/rarities.js';
import { equipOwnedWeapon, readyFlask, wearArmor } from './equipment.js';
import { playVoyageRecording } from './qualmos-voyage.js';
import { useTownPortal } from './townportal.js';
import { useRoomPortal } from './roomportal.js';
import { assignSelectedToBar, toggleInventory, setInventoryOpen, barReady } from './inventory.js';
import { toggleMenu } from './escmenu.js';
import { keyLabel, onSettingsChange } from './settings.js';
import { itemPicture, onItemPictures } from '../render/itemviews.js';
import { tr, onLanguageChange, msg } from '../i18n/i18n.js';

const bar = document.getElementById('quickbar');
bar.innerHTML = Array.from({ length: BAR_SIZE }, (_, i) => `<button class="qb-slot" data-bar="${i}" tabindex="-1">`
  + `<img alt="" hidden><span class="qb-cast"></span><span class="qb-key">${i + 1}</span><span class="qb-count"></span></button>`).join('')
  + '<button class="qb-bag" data-bag tabindex="-1"><svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M9 7V5.5a3 3 0 0 1 6 0V7h2.6a1 1 0 0 1 1 .9l1.2 11A1 1 0 0 1 18.8 20H5.2a1 1 0 0 1-1-1.1l1.2-11a1 1 0 0 1 1-.9zm1.6 0h2.8V5.5a1.4 1.4 0 0 0-2.8 0z"/></svg></button>'
  + '<button class="qb-menu" data-menu tabindex="-1"><svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M4 6h16v2.2H4zm0 4.9h16v2.2H4zm0 4.9h16V18H4z"/></svg></button>';
const buttons = [...bar.querySelectorAll('[data-bar]')];
let signature = '', shown = null;   // shown: the inventory drawn (a new run has a new one)
// each slot shows its key (game/settings.js), the bag and menu buttons theirs in the title
const slotKey = i => keyLabel(`bar${i + 1}`, { both: false });
function showKeys() {
  buttons.forEach((b, i) => { b.querySelector('.qb-key').textContent = slotKey(i); });
  const bag = keyLabel('inventory', { both: false }), b = bar.querySelector('[data-bag]'), m = bar.querySelector('[data-menu]');
  b.title = bag ? tr('Inventory ({key})', { key: bag }) : tr('Inventory');
  b.setAttribute('aria-label', tr('Inventory'));
  m.title = tr('Menu (Esc)'); m.setAttribute('aria-label', tr('Menu'));
  signature = '';   // the titles too
}
showKeys();
onSettingsChange(showKeys);
onLanguageChange(showKeys);
onItemPictures(() => { signature = ''; });   // a picture is in: show it

// use the bag item (from the bar or the inventory's Use button)
export function useItem(instanceId) {
  const inv = player.inventory, slot = ownedItem(inv, instanceId), def = ITEMS[slot?.itemId];
  if (!def || state.transitioning) return false;
  if (def.weapon) {
    // the weapon's own slot with a flask in hand: put the flask away
    if (inv.equipped === instanceId && !inv.readied) { setStatus(tr('{item} is already equipped', { item: itemName(slot) })); return false; }
    if (inv.equipped === instanceId) return readyFlask(null);
    equipOwnedWeapon(instanceId);
    return true;
  }
  if (def.use === 'holdBird') return wearArmor(instanceId);
  if (def.use === 'glassRecording') return playVoyageRecording(def.voyageChapter);
  if (def.use === 'townPortal') return useTownPortal();
  if (def.use === 'roomPortal') return useRoomPortal();
  if (def.use === 'drink') return drink(slot, def);
  if (def.use === 'throw') return readyFlask(inv.readied === def.id ? null : def.id);
  setStatus(tr('{item} cannot be used yet', { item: defName(def) }));
  return false;
}

const BUFF_NAMES = { moveSpeed: msg('faster on your feet'), attackSpeed: msg('quicker attacks'), damage: msg('harder hits'), jump: msg('higher jumps') };
function drink(slot, def) {
  if (player.ragdoll) { setStatus(tr('Not while knocked down')); return false; }
  const did = drinkPotion(player, def, state.time);
  if (typeof did === 'string') {
    setStatus({ full: tr('Already at full health'), wait: tr('Not so fast'), dead: '' }[did]);
    return false;
  }
  removeItem(player.inventory, slot.instanceId, 1);
  const over = q => q.set(player.x, player.visY + 1.3, player.z);
  if (did.heal !== undefined) {
    sfx('drink');
    floatText(`+${Math.round(did.heal)}`, over, { color: '#ff6b6b', life: 1 });
    setStatus(tr('{item}: +{n} health', { item: defName(def), n: Math.round(did.heal) }));
  } else {
    sfx('drink', { pitch: 1.15 }); sfx('buff');
    const text = did.buff ? tr(BUFF_NAMES[did.buff]) : did.cured ? tr('poison cured') : tr('poison kept off');
    floatText(text, over, { color: '#ffd56a', size: 0.2, life: 1.2 });
    setStatus(tr('{item}: {what} for {time} seconds', { item: defName(def), what: text, time: def.effect.time }));
  }
  return true;
}

export function useBarSlot(i) {
  const e = barEntry(player.inventory, i);
  if (!e) return false;
  if (!e.slot) { setStatus(tr('No {item} left', { item: defName(ITEMS[e.itemId]) })); return false; }
  sfx('use', { volume: 0.6 });
  return useItem(e.slot.instanceId);
}

// the quick bar keys (1-6): use the slot, or assign to it while the inventory is open
export function barKey(i) {
  if (state.inventoryOpen) assignSelectedToBar(i);
  else useBarSlot(i);
}

bar.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  if (e.target.closest('[data-bag]')) { e.preventDefault(); toggleInventory(); return; }
  if (e.target.closest('[data-menu]')) { e.preventDefault(); setInventoryOpen(false); toggleMenu(); return; }
  const b = e.target.closest('[data-bar]');
  if (!b) return;
  e.preventDefault();   // no focus: Space and Enter must stay with the game
  barKey(Number(b.dataset.bar));
});

function draw() {
  const inv = player.inventory;
  buttons.forEach((b, i) => {
    const e = barEntry(inv, i), def = e && ITEMS[e.itemId], img = b.querySelector('img');
    img.hidden = !def;
    const src = def && itemPicture(def.id);   // its model's picture (render/itemviews.js), made once
    if (def && img.getAttribute('src') !== src) img.src = src;
    const glow = e?.slot?.gen && rarityOf(e.slot).glow;
    b.style.setProperty('--rarity', glow ? rarityOf(e.slot).css : 'transparent');
    b.classList.toggle('rare', !!glow);
    b.classList.toggle('rainbow', !!glow?.rainbow);
    b.classList.toggle('equipped', !!e?.slot && e.slot.instanceId === inv.equipped && !inv.readied);
    b.classList.toggle('in-hand', !!e && e.itemId === inv.readied);
    b.classList.toggle('none-left', !!e && !e.slot);
    b.querySelector('.qb-count').textContent = def && def.stackLimit > 1 ? String(e.count) : '';
    const k = slotKey(i), key = k ? ` (${k})` : '';
    b.title = def ? `${e.slot ? itemName(e.slot) : defName(def)}${key}`
      : k ? tr('Empty ({key}): select a bag item in the inventory and press {key}', { key: k }) : tr('Empty: select a bag item in the inventory and click here');
  });
}

// every frame: redraw on inventory changes, and fill the slot being cast
export function updateQuickbar() {
  const inv = player.inventory, next = `${inv.version}:${inv.equipped}:${inv.readied}:${together()}`;   // (together: a tool's other name)
  if (next !== signature || inv !== shown) { signature = next; shown = inv; draw(); }
  bar.classList.toggle('assigning', state.inventoryOpen);
  bar.classList.toggle('ready', barReady());
  const c = state.cast;
  buttons.forEach((b, i) => {
    const e = barEntry(inv, i), def = e && ITEMS[e.itemId], on = !!c && def?.use === c.kind;
    const wait = def?.cooldown ? cooldownShare(player, def.id, state.time) : 0;
    b.classList.toggle('casting', on);
    b.classList.toggle('cooling', wait > 0);
    b.querySelector('.qb-cast').style.height = on ? `${Math.min(1, c.t / c.duration) * 100}%` : wait > 0 ? `${Math.min(1, wait) * 100}%` : '0';
  });
}

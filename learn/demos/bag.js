// Your bag, run by the game's own inventory rules (src/core/inventory.js): slots, stacks of
// potions, unique swords (rolled by src/core/gear/generate.js), and the quick bar, which holds
// references into the bag. The panel shows what the bar slots really hold.
import { createInventory, addItem, addInstance, assignBar, autoBar, barEntry, removeItem, takeItem, BAG_SIZE, BAR_SIZE } from '../../src/core/inventory.js';
import { ITEMS, HEALTH_POTION } from '../../src/core/items.js';
import { rollWeapon } from '../../src/core/gear/generate.js';
import { rarityOf } from '../../src/core/gear/rarities.js';
import { mulberry32 } from '../../src/core/util.js';
import { pictureImg } from '../../src/render/itempictures.js';
import { html, t as tr, gameName } from '../deck.js';
import { displayName } from '../../src/core/gear/stats.js';

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export default function mount(el) {
  const inv = createInventory(), R = mulberry32(7);
  addItem(inv, HEALTH_POTION.id, 3); autoBar(inv, HEALTH_POTION.id);
  const row = html(el, `<div class="row">
    <button data-a="potion">${tr('Find a potion', 'Trank finden')}</button>
    <button data-a="sword">${tr('Find a sword', 'Schwert finden')}</button>
    <button data-a="drink">${tr('Drink (bar slot 1)', 'Trinken (Leistenfeld 1)')}</button>
    <button data-a="bar">${tr('Last sword on the bar', 'Letztes Schwert auf die Leiste')}</button>
    <button data-a="drop">${tr('Drop the last sword', 'Letztes Schwert fallen lassen')}</button></div>`);
  const view = html(el, '<div class="bagview"><div class="slots"></div><div class="mono small muted bl"></div><div class="qslots"></div></div>');
  const out = html(el, '<div class="out"></div>');
  let said = tr('Your bag at the start of the game: three potions, one on the quick bar.', 'Deine Tasche am Anfang des Spiels: drei Tränke, einer auf der Schnellleiste.');
  const swords = () => inv.slots.filter(s => s?.gen);

  function cell(slot, count) {
    if (!slot) return '<div class="slot"></div>';
    const r = slot.gen ? rarityOf(slot) : null;
    return `<div class="slot" style="${r ? `border-color:${r.css}` : ''}" title="${esc(slot.gen ? displayName(slot) : gameName(ITEMS[slot.itemId].name))}">${pictureImg(slot)}${count > 1 ? `<span>${count}</span>` : ''}</div>`;
  }
  function draw() {
    view.querySelector('.slots').innerHTML = inv.slots.map(s => cell(s, s?.count)).join('');
    view.querySelector('.bl').textContent = tr('quick bar (keys 1-6)', 'Schnellleiste (Tasten 1-6)');
    view.querySelector('.qslots').innerHTML = Array.from({ length: BAR_SIZE }, (_, i) => {
      const e = barEntry(inv, i);
      // a note for a used-up stack stays: shown faded, with 0
      return e && !e.slot ? `<div class="slot gone">${pictureImg(e.itemId)}<span>0</span></div>` : cell(e?.slot ?? null, e?.count);
    }).join('');
    const refs = inv.bar.map((r, i) => `  bar[${i}]: ${r ? esc(JSON.stringify(r)) : 'null'}`).join('\n');
    out.innerHTML = `${said}\n\n<span class="muted">${tr('What the quick bar really holds:', 'Was die Schnellleiste wirklich enthält:')}</span>\n${refs}`;
  }
  const act = {
    potion: () => { const ok = addItem(inv, HEALTH_POTION.id, 1); autoBar(inv, HEALTH_POTION.id);
      said = ok ? tr('A potion goes onto the stack that is already there: same kind, one slot.', 'Ein Trank kommt auf den Stapel, der schon da ist: gleiche Sorte, ein Feld.') : tr('The bag is full!', 'Die Tasche ist voll!'); },
    sword: () => { const w = rollWeapon(R, 1 + Math.floor(R() * 12)), id = addInstance(inv, w);
      said = id ? tr(`<b>${esc(displayName(w))}</b>: a sword is one of a kind, so it gets its own slot and its own name: ${id}.`, `<b>${esc(displayName(w))}</b>: Ein Schwert ist einzigartig, darum bekommt es ein eigenes Feld und einen eigenen Namen: ${id}.`)
        : tr(`The bag is full (${BAG_SIZE} slots)!`, `Die Tasche ist voll (${BAG_SIZE} Felder)!`); },
    drink: () => { const e = barEntry(inv, 0);
      if (!e?.slot) { said = tr('Nothing to drink: bar slot 1 is empty, or its stack is used up.', 'Nichts zu trinken: Leistenfeld 1 ist leer, oder sein Stapel ist aufgebraucht.'); return; }
      removeItem(inv, e.slot.instanceId, 1);
      said = tr('Gulp! One potion fewer. Bar slot 1 still says "health potion", even when none are left: find one, and it is back.', 'Gluck! Ein Trank weniger. Leistenfeld 1 sagt immer noch "Heiltrank", auch wenn keiner mehr da ist: Findest du einen, ist er wieder da.'); },
    bar: () => { const s = swords().at(-1);
      if (!s) { said = tr('Find a sword first.', 'Finde zuerst ein Schwert.'); return; }
      const free = inv.bar.findIndex((r, i) => i > 0 && !r);
      assignBar(inv, free < 0 ? BAR_SIZE - 1 : free, s.instanceId);
      said = tr(`The bar doesn't get the sword itself, only a note: "the thing called ${s.instanceId}". The sword stays in the bag.`, `Die Leiste bekommt nicht das Schwert selbst, nur einen Zettel: "das Ding namens ${s.instanceId}". Das Schwert bleibt in der Tasche.`); },
    drop: () => { const s = swords().at(-1);
      if (!s) { said = tr('No sword to drop.', 'Kein Schwert zum Fallenlassen.'); return; }
      takeItem(inv, s.instanceId);
      said = tr(`${s.instanceId} left the bag, so every note pointing at it was cleared too.`, `${s.instanceId} hat die Tasche verlassen, also wurde jeder Zettel, der darauf zeigte, auch gelöscht.`); },
  };
  row.querySelectorAll('button').forEach(b => b.onclick = () => { act[b.dataset.a](); draw(); });
  draw();
}

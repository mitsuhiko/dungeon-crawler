// The chat box's completion, run by the game's own code (src/core/commands.js match, pick) on
// the game's real items (src/core/items.js): type a few letters and see every item that fits,
// how well (its score), and why. Then which one Enter would take.
import { match, pick } from '../../src/core/commands.js';
import { ITEMS } from '../../src/core/items.js';
import { itemPicture, pictureKey } from '../../src/render/itempictures.js';
import { html, t as tr } from '../deck.js';

const items = Object.values(ITEMS).map(d => ({ value: d.id, label: d.name }));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const why = s => s >= 100 ? tr('the very one', 'genau das')
  : s >= 80 ? tr('the name starts with it', 'der Name fängt damit an')
  : s >= 60 ? tr('each word starts a word of the name', 'jedes Wort fängt ein Wort des Namens an')
  : s >= 55 ? tr('each word starts a word of the id', 'jedes Wort fängt ein Wort der Kennung an')
  : s >= 50 ? tr('the id starts with it', 'die Kennung fängt damit an')
  : s >= 30 ? tr('its letters in this order, from the first', 'seine Buchstaben in dieser Reihenfolge, ab dem ersten')
  : tr('its letters in this order', 'seine Buchstaben in dieser Reihenfolge');

export default function mount(el) {
  const row = html(el, `<div class="row"><code>/give</code> <input type="text" value="gr he" spellcheck="false" autocomplete="off" style="width:14em">
    ${['gr he', 'health', 'rec', 'grsw', 'long', 'flask_f', 'xyz'].map(q => `<button data-q="${q}">${q}</button>`).join('')}</div>`);
  const out = html(el, '<div class="out"></div>');
  const input = row.querySelector('input');
  function draw() {
    const q = input.value, list = match(q, items), p = pick(q, items);
    const rows = list.slice(0, 8).map((it, i) => `<div style="display:flex;align-items:center;gap:8px;${i ? '' : 'color:#fff'}">`
      + `<img data-item-picture="${pictureKey(it.value)}" src="${itemPicture(it.value)}" alt="" style="width:22px;height:22px;object-fit:contain">`
      + `<span style="display:inline-block;width:${it.score * 0.9}px;height:8px;background:#ffcf7a;border-radius:2px;opacity:${0.4 + it.score / 170}"></span>`
      + `<b>${it.score}</b> ${esc(it.label)} <span class="muted">${esc(it.value)} · ${why(it.score)}</span></div>`).join('');
    const enter = p.item ? tr(`Enter takes <b>${esc(p.item.label)}</b>: it fits best, clearly.`, `Enter nimmt <b>${esc(p.item.label)}</b>: Es passt am besten, eindeutig.`)
      : p.none ? tr('Nothing fits: the box says so.', 'Nichts passt: Das sagt die Box auch.')
      : tr(`Enter can't choose: ${p.some.map(c => esc(c.label)).join(', ')} fit equally well. The box asks you which.`,
        `Enter kann nicht wählen: ${p.some.map(c => esc(c.label)).join(', ')} passen gleich gut. Die Box fragt dich, welches.`);
    out.innerHTML = `${rows || tr('<span class="muted">(no item fits)</span>', '<span class="muted">(kein Ding passt)</span>')}`
      + `\n${tr(`${list.length} of ${items.length} items fit.`, `${list.length} von ${items.length} Dingen passen.`)} ${enter}`;
  }
  input.addEventListener('input', draw);
  row.querySelectorAll('button').forEach(b => b.onclick = () => { input.value = b.dataset.q; draw(); });
  draw();
}

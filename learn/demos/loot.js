// The game's weapon machine (src/core/gear/): roll real weapons, see what the dice did at each
// step, open 100 chests at once (every weapon shown, its card on hover), and (data-mode="odds")
// how the rarity odds change with the item level and luck.
import { rollWeapon } from '../../src/core/gear/generate.js';
import { RARITIES, RARITY, rarityOdds } from '../../src/core/gear/rarities.js';
import { itemStats, weaponDps, affixLines, displayName, baseLine } from '../../src/core/gear/stats.js';
import { AFFIX } from '../../src/core/gear/affixes.js';
import { ITEMS } from '../../src/core/items.js';
import { mulberry32 } from '../../src/core/util.js';
import { pictureImg } from '../../src/render/itempictures.js';
import { canvas, html, t as tr, gameName } from '../deck.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// (every weapon is drawn from its 3D model, like in the game's bag)

// a weapon's card, like the detail panel of the game's inventory
function weaponCard(item) {
  const r = RARITY[item.gen.rarity], s = itemStats(item);
  return `<div class="weapon" style="--rarity:${r.css}">${pictureImg(item)}
      <div><h4>${esc(displayName(item))}</h4><div class="base">${gameName(r.name)} \u00B7 ${tr('item level', 'Gegenstandslevel')} ${item.gen.ilvl}${baseLine(item) ? ' \u00B7 ' + baseLine(item) : ''}</div>
      <div class="stats">${tr(`${s.damage} damage \u00B7 ${(1 / s.interval).toFixed(2)} attacks per second \u00B7 ${Math.round(weaponDps(s))} damage per second
${s.ranged ? 'range' : 'reach'} ${s.range.toFixed(2)} cells \u00B7 ${Math.round(s.crit * 100)}% critical hits`, `${s.damage} Schaden \u00B7 ${(1 / s.interval).toFixed(2)} Angriffe pro Sekunde \u00B7 ${Math.round(weaponDps(s))} Schaden pro Sekunde
${s.ranged ? 'Schussweite' : 'Reichweite'} ${s.range.toFixed(2)} Felder \u00B7 ${Math.round(s.crit * 100)}% kritische Treffer`)}</div>
      <ul>${affixLines(item).map((t, i) => `<li>${t} <span style="color:#5a6678">(${gameName(AFFIX[item.gen.affixes[i].id].name)}, ${tr('tier', 'Stufe')} ${item.gen.affixes[i].tier})</span></li>`).join('')}</ul></div></div>`;
}

// one floating card for the whole page, next to the pointer (or the focused tile)
const tip = {
  el: null,
  show(item, at) {
    this.el ??= Object.assign(document.createElement('div'), { className: 'weapontip' });
    if (!this.el.isConnected) document.body.append(this.el);
    this.el.innerHTML = weaponCard(item);
    this.el.hidden = false;
    this.move(at);
  },
  move(at) {
    if (!this.el || this.el.hidden) return;
    const x = at.clientX ?? at.right, y = at.clientY ?? at.top, w = this.el.offsetWidth, h = this.el.offsetHeight;
    this.el.style.left = Math.max(8, x + 16 + w > innerWidth ? x - w - 16 : x + 16) + 'px';
    this.el.style.top = Math.max(8, Math.min(innerHeight - h - 8, y - h / 2)) + 'px';
  },
  hide() { if (this.el) this.el.hidden = true; },
};

export default function mount(el) {
  if (el.dataset.mode === 'odds') return odds(el);
  const row = html(el, `<div><div class="row"><label>${tr('item level', 'Gegenstandslevel')} <input type="range" class="lv" min="1" max="25" value="5"> <b class="lvv">5</b></label>
    <label><input type="checkbox" class="guard"> ${tr('guardian luck', 'Wächter-Glück')}</label>
    <button class="roll">${tr('Roll a weapon!', 'Waffe würfeln!')}</button><button class="many">${tr('Open 100 chests', '100 Truhen öffnen')}</button></div></div>`);
  const card = html(el, '<div style="margin-top:10px"></div>');
  const out = html(el, '<div class="out"></div>');
  const $ = s => row.querySelector(s);
  let seed = Math.floor(Math.random() * 1e9);
  const opts = () => $('.guard').checked ? { luck: 0.2, floor: RARITY.decent.rank, guardian: true } : {};
  function show(item) {
    const r = RARITY[item.gen.rarity], base = ITEMS[item.itemId];
    card.innerHTML = weaponCard(item);
    const kinds = item.gen.affixes.map(a => AFFIX[a.id].kind);
    const list = kinds.length ? item.gen.affixes.map((a, i) => `<b>${gameName(AFFIX[a.id].name)}</b> (${kinds[i]})`).join(', ') : tr('none', 'keine');
    out.innerHTML = tr(`The dice decided, step by step:\n1. rarity: <b style="color:${r.css}">${gameName(r.name)}</b> \u2192 ${r.affixes} affix${r.affixes === 1 ? '' : 'es'}, damage \u00D7${r.damage}\n`
      + `2. base: <b>${gameName(base.name)}</b> (${base.weapon.damage} damage at level 1, +5% per item level)\n`
      + `3. affixes: ${list}\n4. name: <b>${displayName(item)}</b>`,
      `Die Würfel haben Schritt für Schritt entschieden:\n1. Seltenheit: <b style="color:${r.css}">${gameName(r.name)}</b> \u2192 ${r.affixes} Affix${r.affixes === 1 ? '' : 'e'}, Schaden \u00D7${r.damage}\n`
      + `2. Grundtyp: <b>${gameName(base.name)}</b> (${base.weapon.damage} Schaden auf Level 1, +5% pro Gegenstandslevel)\n`
      + `3. Affixe: ${list}\n4. Name: <b>${displayName(item)}</b>`);
  }
  $('.lv').oninput = () => { $('.lvv').textContent = $('.lv').value; };
  $('.roll').onclick = () => tip.hide() ?? show(rollWeapon(mulberry32(seed++), +$('.lv').value, opts()));
  $('.many').onclick = () => {
    tip.hide();
    const n = {}, items = [];
    for (let i = 0; i < 100; i++) { const it = rollWeapon(mulberry32(seed++), +$('.lv').value, opts()); items.push(it); n[it.gen.rarity] = (n[it.gen.rarity] || 0) + 1; }
    // the best first: by rarity, then by damage per second
    const dps = it => weaponDps(itemStats(it));
    items.sort((a, b) => RARITY[b.gen.rarity].rank - RARITY[a.gen.rarity].rank || dps(b) - dps(a));
    card.innerHTML = `<div>${RARITIES.filter(r => n[r.id]).map(r => `<span class="chip" style="border-color:${r.css};color:${r.css}">${gameName(r.name)}: ${n[r.id]}</span>`).join('')}</div>
      <div class="loots">${items.map((it, i) => `<button class="it" data-i="${i}" style="--rarity:${RARITY[it.gen.rarity].css}" aria-label="${esc(displayName(it))}">${pictureImg(it)}</button>`).join('')}</div>
      <div class="pinned"></div>`;
    const tiles = [...card.querySelectorAll('.it')], pinned = card.querySelector('.pinned');
    tiles.forEach(b => {
      const it = items[+b.dataset.i];
      b.onpointerenter = e => tip.show(it, e);
      b.onpointermove = e => tip.move(e);
      b.onpointerleave = () => tip.hide();
      b.onfocus = () => tip.show(it, b.getBoundingClientRect());
      b.onblur = () => tip.hide();
      b.onclick = () => { tiles.forEach(t => t.classList.toggle('on', t === b)); pinned.innerHTML = weaponCard(it); };
    });
    out.innerHTML = tr('100 chests opened, the best weapons first. Point at a weapon to see its card, click it to keep the card open. Try a higher item level, or guardian luck.',
      '100 Truhen geöffnet, die besten Waffen zuerst. Zeig auf eine Waffe, um ihre Karte zu sehen, klick sie an, damit die Karte offen bleibt. Probier eine höhere Gegenstandslevel oder Wächter-Glück.');
  };
  $('.roll').click();
}

function odds(el) {
  const W = 640, H = 270, { g } = canvas(el, W, H);
  const row = html(el, `<div class="row"><label>${tr('item level', 'Gegenstandslevel')} <input type="range" class="lv" min="1" max="25" value="1"> <b class="lvv">1</b></label>
    <label>${tr('luck', 'Glück')} <input type="range" class="luck" min="0" max="0.45" step="0.05" value="0"> <b class="lk">0</b></label></div>`);
  const out = html(el, '<div class="out"></div>');
  const $ = s => row.querySelector(s);
  function draw() {
    const lv = +$('.lv').value, luck = +$('.luck').value;
    $('.lvv').textContent = lv; $('.lk').textContent = luck.toFixed(2);
    const p = rarityOdds(lv, { luck });
    g.clearRect(0, 0, W, H);
    const bw = (W - 40) / RARITIES.length;
    RARITIES.forEach((r, i) => {
      const share = p[i], x = 20 + i * bw, h = Math.max(share > 0 ? 2 : 0, Math.sqrt(share) * 180);
      g.fillStyle = r.css; g.globalAlpha = share ? 1 : 0.25; g.fillRect(x + 6, 200 - h, bw - 12, h); g.globalAlpha = 1;
      g.fillStyle = '#e6e9ef'; g.font = "15px 'Crimson Text', serif"; g.textAlign = 'center';
      g.fillText(gameName(r.name), x + bw / 2, i % 2 ? 236 : 218);   // (every other name a row lower: ten don't fit side by side)
      g.fillStyle = share ? r.css : '#5a6678';
      g.fillText(share ? (share >= 0.01 ? (share * 100).toFixed(1) + '%' : (share * 100).toFixed(2) + '%') : r.guardianOnly ? tr('guardians', 'Wächter') : `lv ${r.minLevel}+`, x + bw / 2, 258);
    });
    g.textAlign = 'left';
    const best = RARITIES.filter((r, i) => p[i] > 0).at(-1);
    out.innerHTML = tr(`At item level <b>${lv}</b>, the best possible is <b style="color:${best.css}">${gameName(best.name)}</b>. Bars are drawn by the square root, so tiny chances stay visible.`,
      `Auf Gegenstandslevel <b>${lv}</b> ist das Beste, was geht: <b style="color:${best.css}">${gameName(best.name)}</b>. Die Balken sind mit der Wurzel gezeichnet, damit winzige Chancen sichtbar bleiben.`);
  }
  row.querySelectorAll('input').forEach(i => i.oninput = draw);
  draw();
}

// The race between you and the monsters, depth by depth, from the game's own tables: a monster's
// health and damage at its level (src/core/enemies.js), your sword's damage (src/core/gear/stats.js
// itemStats, with your level's bonus from src/core/progression.js) and your health. The game is
// tuned for a player two levels above the depth with a sword found on the way (docs/balance.md);
// the boxes show what happens without new swords or without levels.
import { SPIDER, SNAKE, STUNDER, OCTONAUT, enemyProfile, depthLevel } from '../../src/core/enemies.js';
import { maxHealth, levelDamage } from '../../src/core/progression.js';
import { itemStats } from '../../src/core/gear/stats.js';
import { OLD_SWORD } from '../../src/core/items.js';
import { MAX_DEPTH } from '../../src/themes/depth.js';
import { canvas, html, t as tr, gameName } from '../deck.js';

const KINDS = [SPIDER, SNAKE, OCTONAUT, STUNDER];

export default function mount(el) {
  const row = html(el, `<div class="row"><select class="kind">${KINDS.map((k, i) => `<option value="${i}">${gameName(k.label)}</option>`).join('')}</select>
    <label><input type="checkbox" class="old"> ${tr("keep the glassmaker's old sword", 'beim alten Schwert des Glasmachers bleiben')}</label>
    <label><input type="checkbox" class="nolv"> ${tr('never level up', 'nie aufsteigen')}</label></div>`);
  const W = 620, H = 230, { c, g, at } = canvas(el, W, H);
  html(el, `<div class="legend"><span><i style="background:#51a9ff"></i>${tr('your slashes to beat it', 'deine Hiebe, um es zu besiegen')}</span><span><i style="background:#ff6a5a"></i>${tr('its blows to beat you', 'seine Schläge, um dich zu besiegen')}</span></div>`);
  const out = html(el, '<div class="out"></div>');
  const $ = s => row.querySelector(s);
  const L = 30, B = 26, bw = (W - L - 8) / MAX_DEPTH;
  let pick = 10;

  function fight(d) {
    const kind = KINDS[+$('.kind').value], mlv = depthLevel(d), m = enemyProfile(kind, mlv);
    const plv = $('.nolv').checked ? 1 : mlv + 2;
    // an Unusual Medium Sword found at this depth, or the glassmaker's old sword
    const sword = $('.old').checked ? { itemId: OLD_SWORD.id } : { itemId: 'weapon_sword_medium', gen: { ilvl: d, rarity: 'unusual', affixes: [] } };
    const hit = Math.round(itemStats(sword).damage * levelDamage(plv)), hp = maxHealth(plv);
    return { kind, mlv, plv, m, hit, hp, slashes: Math.ceil(m.hp / hit), blows: Math.ceil(hp / m.damage) };
  }
  function draw() {
    g.clearRect(0, 0, W, H);
    const rows = Array.from({ length: MAX_DEPTH }, (_, i) => fight(i + 1));
    const top = Math.max(10, ...rows.map(r => Math.max(r.slashes, r.blows)));
    const y = v => H - B - Math.min(v, top) / top * (H - B - 10);
    g.font = "13px 'Crimson Text', serif"; g.fillStyle = '#8a96a8'; g.textAlign = 'right';
    for (let v = 0; v <= top; v += Math.ceil(top / 5)) { g.fillText(v, L - 4, y(v) + 3); g.fillStyle = '#ffffff10'; g.fillRect(L, y(v), W - L - 8, 1); g.fillStyle = '#8a96a8'; }
    rows.forEach((r, i) => {
      const x = L + i * bw;
      if (i + 1 === pick) { g.fillStyle = '#ffffff10'; g.fillRect(x, 6, bw, H - B - 6); }
      g.fillStyle = '#51a9ff'; g.fillRect(x + 2, y(r.slashes), bw / 2 - 2, H - B - y(r.slashes));
      g.fillStyle = '#ff6a5a'; g.fillRect(x + bw / 2, y(r.blows), bw / 2 - 2, H - B - y(r.blows));
      g.fillStyle = '#8a96a8'; g.textAlign = 'center'; g.fillText(i + 1, x + bw / 2, H - B + 13);
    });
    g.textAlign = 'center'; g.fillText(tr('depth', 'Tiefe'), (W + L) / 2, H - 2);
    const r = rows[pick - 1];
    out.innerHTML = tr(`Depth ${pick}: a level-${r.mlv} ${gameName(r.kind.label)} has <b>${r.m.hp}</b> health and hits for <b>${r.m.damage}</b>.\nYou, level ${r.plv}: your sword hits for <b>${r.hit}</b>, you have <b>${r.hp}</b> health.\nYou need <b>${r.slashes}</b> slash${r.slashes === 1 ? '' : 'es'}, it needs <b>${r.blows}</b> blow${r.blows === 1 ? '' : 's'}.`,
      `Tiefe ${pick}: ${gameName(r.kind.label)} auf Level ${r.mlv} hat <b>${r.m.hp}</b> Gesundheit und trifft mit <b>${r.m.damage}</b>.\nDu, Level ${r.plv}: Dein Schwert trifft mit <b>${r.hit}</b>, du hast <b>${r.hp}</b> Gesundheit.\nDu brauchst <b>${r.slashes}</b> ${r.slashes === 1 ? 'Hieb' : 'Hiebe'}, es braucht <b>${r.blows}</b> ${r.blows === 1 ? 'Schlag' : 'Schläge'}.`);
  }
  const move = e => { const [x] = at(e); pick = Math.max(1, Math.min(MAX_DEPTH, Math.floor((x - L) / bw) + 1)); draw(); };
  c.addEventListener('pointermove', move);
  c.addEventListener('pointerdown', move);
  for (const s of ['.kind', '.old', '.nolv']) $(s).onchange = draw;
  draw();
}

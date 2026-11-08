// The boss bar on the screen (core/bossbar.js says whose and how; docs/ui.md "The boss bar"): along
// the top, from the moment you come into a boss's cube (a real boss's, a Temp Boss's) until he is
// beaten. The fill follows his health as it is, so it runs back with Renew's rewind (his health
// comes off the fight's tape, game/renew.js) and fills again with his next phase; the damage strip
// behind it lags after a hit. In his intro (game/bossintro.js) it waits until the intro says, and
// fades in slowly (.intro). Beaten, the fill drops to nothing, the strip drains after it and the
// bar fades away (`OUT` s). It is not there while the curtain is down or between cubes, and the
// menus hide it (style.css body.in-menu). A boss of two (Rollie and Megalimmer) has two bars, stacked,
// each his own; the one of them who goes for you now has his lit up.
import { player, state } from './state.js';
import { allEnemies } from './enemies.js';
import { reduceMotion } from './settings.js';
import { curtained } from './hud.js';
import { language } from '../i18n/i18n.js';
import { bossesOf, bossFill, bossTitle, trailStep } from '../core/bossbar.js';

const OUT = 1.2;   // s the bar stays, empty, once he is beaten, before it fades
const $ = id => document.getElementById(id);
// a boss of two has two rows (core/bossbar.js bossesOf), the second under the first
const ROWS = [{ row: 'boss-row', name: 'boss-name', meter: 'boss-meter', fill: 'boss-fill', trail: 'boss-trail' },
  { row: 'boss-row2', name: 'boss-name2', meter: 'boss-meter2', fill: 'boss-fill2', trail: 'boss-trail2' }];
let bosses = [], out = 0;   // bosses: [{ e, trail }], a row each
const said = [], shown = {};
// write only on change
const put = (key, value, write) => { if (shown[key] !== value) { shown[key] = value; write(value); } };

export function updateBossBar(dt) {
  const el = $('boss-bar');
  if (!el) return;
  const picks = state.transitioning ? [] : bossesOf(allEnemies(), player);
  if (picks.length) { bosses = picks.map(e => ({ e, trail: bosses.find(b => b.e === e)?.trail ?? null })); out = 0; }
  else if (bosses.length && bosses.every(b => b.e.mode === 'dead') && out < OUT && !state.transitioning) out += dt;   // beaten: it empties, then goes
  else bosses = [];
  const on = bosses.length > 0 && out < OUT && !curtained() && (!state.intro || state.intro.bar);
  put('on', on, v => el.classList.toggle('on', v));
  put('intro', !!state.intro, v => el.classList.toggle('intro', v));
  put('duo', bosses.length > 1, v => el.classList.toggle('duo', v));
  bosses.forEach((b, i) => row(i, b, dt));
}
// row i: boss b's name, fill and damage strip; of two, the one who goes for you lit up (`main`,
// game/rollie.js), a beaten one's row dimmed
function row(i, b, dt) {
  const R = ROWS[i], e = b.e, fill = e.mode === 'dead' ? 0 : bossFill(e);
  b.trail = trailStep(b.trail, fill, dt, reduceMotion());
  const key = `${e.id}|${e.profile.type}|${e.level}|${language()}`;
  if (key !== said[i]) { said[i] = key; $(R.name).textContent = bossTitle(e); }
  put(`fill${i}`, fill.toFixed(4), v => { $(R.fill).style.transform = `scaleX(${v})`; });
  put(`trail${i}`, b.trail.at.toFixed(4), v => { $(R.trail).style.transform = `scaleX(${v})`; });
  put(`now${i}`, Math.round(fill * 100), v => $(R.meter).setAttribute('aria-valuenow', v));
  put(`lead${i}`, !!e.main && e.mode !== 'dead', v => $(R.row).classList.toggle('lead', v));
  put(`down${i}`, e.mode === 'dead', v => $(R.row).classList.toggle('down', v));
}

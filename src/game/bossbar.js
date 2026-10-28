// The boss bar on the screen (core/bossbar.js says whose and how; docs/ui.md "The boss bar"): along
// the top, from the moment you come into a boss's cube (a real boss's, a Temp Boss's) until he is
// beaten. The fill follows his health as it is, so it runs back with Renew's rewind (his health
// comes off the fight's tape, game/renew.js) and fills again with his next phase; the damage strip
// behind it lags after a hit. Beaten, the fill drops to nothing, the strip drains after it and the
// bar fades away (`OUT` s). It is not there while the curtain is down or between cubes, and the
// menus hide it (style.css body.in-menu).
import { player, state } from './state.js';
import { allEnemies } from './enemies.js';
import { reduceMotion } from './settings.js';
import { curtained } from './hud.js';
import { language } from '../i18n/i18n.js';
import { bossOf, bossFill, bossTitle, trailStep } from '../core/bossbar.js';

const OUT = 1.2;   // s the bar stays, empty, once he is beaten, before it fades
const $ = id => document.getElementById(id);
let boss = null, trail = null, out = 0, said = null;
const shown = {};
// write only on change
const put = (key, value, write) => { if (shown[key] !== value) { shown[key] = value; write(value); } };

export function updateBossBar(dt) {
  const el = $('boss-bar');
  if (!el) return;
  const pick = state.transitioning ? null : bossOf(allEnemies(), player);
  if (pick) { if (pick !== boss) trail = null; boss = pick; out = 0; }
  else if (boss && boss.mode === 'dead' && out < OUT && !state.transitioning) out += dt;   // beaten: it empties, then goes
  else boss = null;
  const on = !!boss && out < OUT && !curtained();
  put('on', on, v => el.classList.toggle('on', v));
  if (!boss) { trail = null; return; }
  const fill = boss.mode === 'dead' ? 0 : bossFill(boss);
  trail = trailStep(trail, fill, dt, reduceMotion());
  const key = `${boss.id}|${boss.profile.type}|${boss.level}|${language()}`;
  if (key !== said) { said = key; $('boss-name').textContent = bossTitle(boss); }
  put('fill', fill.toFixed(4), v => { $('boss-fill').style.transform = `scaleX(${v})`; });
  put('trail', trail.at.toFixed(4), v => { $('boss-trail').style.transform = `scaleX(${v})`; });
  put('now', Math.round(fill * 100), v => $('boss-meter').setAttribute('aria-valuenow', v));
}

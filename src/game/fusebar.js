// The fuse of Woppylava's volcano (core/woppylava.js `fuse`; game/woppylava.js burns it), under the
// boss's bar (index.html #boss-fuse) like Umbra's air (game/dive.js): an ember bar burning down and
// the time left, red and pulsing in the last 30 s.
import { tr } from '../i18n/i18n.js';

const $ = id => document.getElementById(id);
// (m:ss, like the air's)
const clock = s => { const n = Math.ceil(Math.max(0, s)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
let shown = null;
// left: s till the eruption (null: hidden); total: s the fuse burns in all
export function fuseBar(left, total = left) {
  const el = $('boss-fuse');
  if (!el) return;
  const on = left != null && left > 0;
  const key = on ? Math.ceil(left * 4) / 4 : null;
  if (key === shown) return;
  shown = key;
  el.classList.toggle('on', on);
  if (!on) return;
  $('boss-fuse-text').textContent = tr('Eruption {time}', { time: clock(left) });
  $('boss-fuse-fill').style.transform = `scaleX(${Math.max(0, Math.min(1, left / Math.max(1e-6, total))).toFixed(4)})`;
  el.classList.toggle('low', left <= 30);
}

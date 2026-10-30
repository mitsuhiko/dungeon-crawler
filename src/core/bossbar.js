// The boss bar (game/bossbar.js, docs/ui.md "The boss bar"): the boss of a descent, a real one or a
// Temp Boss (a descent guardian, core/guardians.js), shows his health on the screen, along its top,
// from the moment you come into his cube until he is beaten, and nothing over his head. So do the
// bodies that pass for him (Gusto's proxies, `proxy`): nothing over their heads (that would tell
// them from him), and they never drive the bar. Everything else that can be hit keeps its small
// bar over its head (render/enemies.js). The bar shows no phases: one fill, his health, and behind
// it the damage strip (`trailStep`).
import { tr } from '../i18n/i18n.js';
import { guardianTitle } from './guardians.js';

// whether enemy e has its health on the screen instead of over its head
export const bossBarred = e => !!e?.guardian && e.guardianRole === 'descent';

// the boss whose bar shows, among `enemies`, for a hero at `at` ({ x, z }): one alive and not a
// proxy (Gusto vanished, `gone`, is still him), nor a body passing for him (`host`: Umbra's); of several (dev
// spawns) the nearest. null: none.
export function bossOf(enemies, at) {
  let boss = null, best = Infinity;
  for (const e of enemies) {
    if (!bossBarred(e) || e.proxy || e.host || e.profile?.viewless || e.mode === 'dead' || !(e.hp > 0)) continue;
    const d = Math.hypot(e.x - at.x, e.z - at.z);
    if (d < best) { best = d; boss = e; }
  }
  return boss;
}

// how full his bar is: his health of his profile's (Renew's a phase's: it fills again with each)
export const bossFill = e => Math.min(1, Math.max(0, (e.hp ?? 0) / (e.profile?.hp || 1)));

// what the bar says over it: '♛ Gusto · Lv 1', '♛ Temp Boss Spider · Lv 3' (as over a guardian's
// head before, render/bars.js makeLevelLabel)
export const bossTitle = e => tr('{title} · Lv {level}', { title: guardianTitle(e.guardianRole, e.profile), level: e.level });

// The damage strip: a paler bar behind the fill, where his health was a moment ago. A fall of the
// fill leaves it standing `hold` s (a new fall meanwhile starts that again: a combo's hits make one
// chunk; but it stands `most` s at most, so a burn ticking on does not hold it up for good), then
// it eases down to the fill (`rate`: of the gap a second, about half a second in all).
// Health coming back (Renew's rewind, his next phase) takes it up at once: it never shows a gain as
// damage. calm (reduce motion): it goes with the fill.
export const TRAIL = Object.freeze({ hold: 0.4, most: 1.2, rate: 7 });
// t: { at (where it is, 0..1), wait (s before it follows), stood (s it has stood so far), last (the
// fill a step ago) }, or null at first; the next of it after dt s with the fill at `fill`
export function trailStep(t, fill, dt, calm = false) {
  if (!t || calm || fill >= t.at) return { at: fill, wait: 0, stood: 0, last: fill };
  let { at, wait, stood } = t;
  if (fill < t.last) wait = Math.min(TRAIL.hold, Math.max(0, TRAIL.most - stood));
  if (wait > 0) { wait = Math.max(0, wait - dt); stood += dt; }
  else {
    at -= (at - fill) * Math.min(1, dt * TRAIL.rate);
    if (at - fill < 0.002) { at = fill; stood = 0; }
  }
  return { at, wait, stood, last: fill };
}

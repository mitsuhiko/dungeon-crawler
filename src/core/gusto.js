// Gusto's fight as rules (game/gusto.js runs it; his profiles are in core/enemies.js, GUSTO
// and GUSTO_SPLIT). docs/bosses.md tells the whole fight.
//
// Phase 1: he grabs and throws, and spits Custo triangles: a summon fills up to three of them.
// At half his health he stops (no blow takes him below it) and splits: for `splitTime` nothing
// hurts him while he shudders, then three of him appear, apart, away from the players. Two are
// his proxies: they look the same, fight the same (grab, vortex, summon) and show his health,
// but any hit, however small, makes one go up in a cloud.
// In both phases he (or a proxy) breathes in at a player who keeps away: once the nearest player
// has been more than `far` cells from it for `wait` s, it does nothing else but breathe in
// (core/enemies.js GUSTO_INHALE: it pulls them in), at most one of the three at a time and
// every `breathCool` s; for `follow` s after a breath only a grab may start. A grab that
// catches nothing leaves it face down, helpless (GUSTO_STUCK).
// Phase 2: he summons up to two triangles at a time. Once both proxies are gone he can still be
// hit for `window` seconds, then he vanishes, and `gone` seconds later he and two new proxies
// appear somewhere else. The window does not run while a player stands within `close` cells of
// him, for up to `hold` s more: a sword that popped the last proxy has time to get to him and
// strike, a bow from afar does not get more. Only he can die, and his death takes his proxies
// and triangles along.
export const GUSTO_FIGHT = Object.freeze({
  split: 0.5,             // the share of his health he splits at
  splitTime: 1.8,         // s he shudders before the three of him appear
  minions: [3, 2],        // the most Custo triangles at once, phase 1 / 2: a summon fills up to that
  summonCool: [7, 8],     // s from one summon to the next, phase 1 / 2
  firstSummon: 1.5,       // s before his first summon
  proxies: 2,
  window: 1.5,            // s he can still be hit after his last proxy went...
  close: 2.5,             // cells: ...not counting the time a player is this close to him...
  hold: 4,                // ...for up to this long (s)
  gone: 1.3,              // s he is away
  appear: 0.5,            // s nothing hurts the three after they appear
  apart: 3,               // cells: the least between the three and from the players, where the arena allows
  far: 4,                 // cells: a player keeping further than this from him...
  wait: 3,                // ...for this long (s) is breathed in
  breathCool: 8,          // s from one breath (of any of the three) to the next
  follow: 1.5,            // s after a breath only a grab may start
  leave: 0.5,             // s a proxy or a triangle he takes along lingers, gone, before it is let go
});

// the health he splits at (and cannot be taken below before)
export const splitHp = maxHp => Math.ceil(maxHp * GUSTO_FIGHT.split);
// how many Custo triangles a summon brings in phase `phase` with `alive` of them about
export const summonCount = (phase, alive) => Math.max(0, GUSTO_FIGHT.minions[phase - 1] - alive);
// where a grab holds the caught body at attack time t (model space: x, up, forward), along the
// clip's grip path (core/enemies.js GUSTO, `grab`)
export function gripAt(grab, hitAt, t) {
  const g = grab.grip, u = Math.max(0, (t - hitAt) / grab.step), i = Math.min(g.length - 1, Math.floor(u));
  const j = Math.min(g.length - 1, i + 1), k = Math.min(1, u - i);
  return g[i].map((v, n) => v + (g[j][n] - v) * k);
}

// The music of his fight (music/gusto.scrim, core/bossmusic.js): its moods, the first before he
// fights, and the one playing now, from what every game sees of him (the runner's fight or a
// friend's shown copy): him, his live proxies and the moods his fight has had (`seen`), so the
// second phase holds while he is back alone at his split's health. His roar in his intro
// (`roused`, game/reveals.js) brings the band in before he moves.
export const GUSTO_MUSIC = Object.freeze(['lurk', 'phase1', 'split', 'phase2', 'gone']);
export function gustoMusic(e, proxies, seen) {
  if (e.mode === 'split') return 'split';
  if (e.mode === 'gone') return 'gone';
  if (proxies > 0 || seen.has('split') || e.hp < splitHp(e.profile.hp)) return 'phase2';
  if (e.mode === 'chase' || e.mode === 'attack' || e.mode === 'alert' || e.hp < e.profile.hp || e.roused) return 'phase1';
  return 'lurk';
}

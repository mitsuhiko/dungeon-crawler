// Which song plays and in which mood (audio/music.js plays it; music/README.md has the moods):
// the town's waltz in the town (its tiles and houses), the core's theme at the bottom of the
// world, and everywhere else the song of the depth's theme (themes/: music). A boss with a song of
// his own (core/bossmusic.js) has it played while he lives in the cube, and its moods are his
// fight's phases instead of these:
//   explore   nothing going on
//   treasure  a reward site's closed chest close by, no enemy around
//   sense     a live enemy close by, not after you yet
//   rise      an enemy chasing you from afar
//   fight     an enemy after you is close, or blows were traded (you hit one, one hit you or
//             swung at you) in the last few seconds and one is still after you or near
//   boss      a guardian is after you, or hurt and close by
// The mood rises at once and falls back after the calmer reason has held for a moment.
// A boss's phases change at once, except back to the one before the fight (he went home).
import { player, state } from './state.js';
import { allEnemies } from './enemies.js';
import { themeOf, MAX_DEPTH } from '../themes/depth.js';
import { playSong, setMood } from '../audio/music.js';
import { MOODS } from '../audio/score.js';
import { BOSS_MUSIC } from '../core/bossmusic.js';

// learn: sound.html#mood-rules (see learn/README.md)
const NEAR = 8;          // cells: an enemy this close is sensed
// learn: sound.html#mood-rules (see learn/README.md)
const CLOSE = 4;         // cells: an enemy after you this close is a fight
// learn: sound.html#mood-rules (see learn/README.md)
const TREASURE = 6;      // cells: a chest this close
// learn: sound.html#mood-rules (see learn/README.md)
const FIGHT_MEMORY = 6;  // s: a blow keeps the fight going this long while an enemy is after you or near
// learn: sound.html#mood-code #mood-rules (see learn/README.md)
const HOLD = { treasure: 1, sense: 2, rise: 3, fight: 4, boss: 5 };   // s the calmer reason must hold
const RANK = Object.fromEntries(MOODS.map((m, i) => [m, i]));      // MOODS runs calm to fierce
const BOSS_HOLD = 3;     // s: a boss's music goes back to before his fight only after this
// every mood a song may have: for holding one from the console
export const ALL_MOODS = [...new Set([...MOODS, ...Object.values(BOSS_MUSIC).flatMap(m => m.moods)])];

// learn: code.html#names (see learn/README.md)
let mood = 'explore', calm = 0, lastClash = -Infinity;
let playerHp = 0;
const enemyHp = new WeakMap();   // enemy -> hp last frame: a drop means you hit it
let forced = null;       // dev/console: hold one mood (window.__game.musicMood)
let fought = null, seen = new Set(), phase = null, phaseCalm = 0;   // the boss whose music plays, the moods his fight had

export function forceMood(name) { forced = ALL_MOODS.includes(name) ? name : null; }

function wanted() {
  if (player.hp < playerHp) lastClash = state.time;
  playerHp = player.hp;
  if (player.hp <= 0) return 'explore';
  let want = 'explore';
  const raise = m => { if (RANK[m] > RANK[want]) want = m; };
  let around = false;
  for (const e of allEnemies()) {
    const hit = e.hp < (enemyHp.get(e) ?? e.hp);
    enemyHp.set(e, e.hp);
    if (hit || e.mode === 'attack') lastClash = state.time;
    if (e.mode === 'dead' || e.hp <= 0) continue;
    const dist = Math.hypot(e.x - player.x, e.z - player.z), level = Math.abs(e.y - player.y) < 3;
    const after = e.mode === 'chase' || e.mode === 'attack';
    if (e.guardian && (after || hit || (e.hp < e.profile.hp && dist < NEAR * 1.5))) raise('boss');
    if (after && dist < CLOSE && level) raise('fight');
    if (after) raise('rise');
    else if (dist < NEAR && level) raise('sense');
    if (after || (dist < NEAR && level)) around = true;
  }
  if (around && state.time - lastClash < FIGHT_MEMORY) raise('fight');
  if (want === 'explore') for (const site of state.map.rewardSites ?? []) {
    if (state.run.chests.has(site.id)) continue;   // an opened chest no longer calls
    const a = site.anchor;
    if (Math.hypot(a.x - player.x, a.z - player.z) < TREASURE && Math.abs(a.y - player.y) < 3) { want = 'treasure'; break; }
  }
  return want;
}

// the boss here with a song of his own, alive (proxies are not him): { boss, music, proxies }
function bossHere() {
  let boss = null, proxies = 0;
  for (const e of allEnemies()) {
    if (!BOSS_MUSIC[e.boss] || e.mode === 'dead' || e.hp <= 0) continue;
    if (!e.proxy) boss ??= e;
    else if (e.mode !== 'gone') proxies++;   // (one he takes along when he vanishes is 'gone' a moment)
  }
  return boss && { boss, music: BOSS_MUSIC[boss.boss], proxies };
}

// his fight's mood now: at once, but back to the one before the fight only once it held a moment
function bossMood({ boss, music, proxies }, dt) {
  if (boss !== fought) { fought = boss; seen = new Set(); phase = music.moods[0]; phaseCalm = 0; }
  const want = music.mood(boss, proxies, seen);
  seen.add(want);
  if (want === music.moods[0] && want !== phase && (phaseCalm += dt) < BOSS_HOLD) return phase;
  phaseCalm = 0;
  return (phase = want);
}

// learn: sound.html#mood-code (see learn/README.md)
export const songFor = (map, fight = null) => fight ? fight.music.song
  : map.enemyFree ? 'town' : map.depth >= MAX_DEPTH ? 'core' : themeOf(map).music;

// learn: sound.html#mood-code (see learn/README.md)
export function updateMusic(dt) {
  if (!state.map) return;
  const fight = bossHere();
  playSong(songFor(state.map, fight));
  if (fight) {   // (and once he is gone the song of the place comes back, from explore)
    setMood(forced ?? bossMood(fight, dt));
    mood = 'explore'; calm = 0;
    return;
  }
  const want = forced ?? wanted();
  if (forced || RANK[want] >= RANK[mood]) { mood = want; calm = 0; }
  else if ((calm += dt) > HOLD[mood]) { mood = want; calm = 0; }
  setMood(mood);
}

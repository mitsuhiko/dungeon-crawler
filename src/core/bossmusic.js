// Bosses with a song of their own (music/<song>.scrim). It plays while the boss lives in the
// cube, from the moment you come in (game/music.js songFor), and its moods follow his fight, not
// the distance and chasing every other song goes by: `moods` as the score's "# moods:" line names
// them (the first before he fights), and `mood(boss, proxies, seen)` the one for now: the boss,
// how many of his proxies stand, the moods his fight has had. docs/music.md.
import { GUSTO_MUSIC, gustoMusic } from './gusto.js';
import { SOLLMELDON_MUSIC, sollmeldonMusic } from './sollmeldon.js';

export const BOSS_MUSIC = Object.freeze({
  gusto: { song: 'gusto', moods: GUSTO_MUSIC, mood: gustoMusic },
  sollmeldon: { song: 'sollmeldon', moods: SOLLMELDON_MUSIC, mood: sollmeldonMusic },
});

// Reading a Scrimshaw score (vendor/scrimshaw, docs/music.md) plus the game's moods and stings.
// Both ride in comments, so a score still pastes into the Scrimshaw Jukebox as is. Each mood names
// the voices that play in it; a mood name pulls in that (earlier) mood's voices, -NAME drops one:
//   # mood explore: lead harp strings bass
//   # mood sense:   strings bass pulse          not additive: the tune drops out
//   # mood rise:    sense lead kick snare
// A mood a score leaves out falls back along FALLBACK; every score needs explore.
// A boss's song (core/bossmusic.js) names moods of its own instead, the first its base (what a
// mood it does not know plays, and what one it leaves out falls back to):
//   # moods: lurk phase1 split phase2 gone
// A sting is a pattern played once, over the loop, as a mood begins (audio/music.js). Its voices
// play only in stings, in no mood:
//   # sting phase2: three
import { compile } from '../../vendor/scrimshaw/score.js';

export const MOODS = ['explore', 'treasure', 'sense', 'rise', 'fight', 'boss'];
export const FALLBACK = { treasure: 'explore', sense: 'explore', rise: 'sense', fight: 'rise', boss: 'fight' };

const MOOD = /^\s*#\s*mood\s+(\w+)\s*:(.*)$/i;
const OWN = /^\s*#\s*moods\s*:(.*)$/i;
const STING = /^\s*#\s*sting\s+(\w+)\s*:(.*)$/i;

export function loadScore(text) {
  const song = compile(text);
  const lines = String(text).split(/\r?\n/), own = [];
  const byName = new Map(song.voices.map((v, i) => [v.name, i]));
  let names = MOODS;
  lines.forEach((line, i) => {
    const m = OWN.exec(line);
    if (!m) return;
    if (names !== MOODS) return own.push(`line ${i + 1}: the moods are named twice`);
    names = m[1].trim().split(/\s+/).filter(Boolean).map(n => n.toLowerCase());
    if (!names.length) { own.push(`line ${i + 1}: "# moods:" names no mood`); names = MOODS; }
  });
  const base = names[0];
  const given = new Map();                  // mood -> Set of voice indices, as written
  const stings = {}, stingVoices = new Set();
  lines.forEach((line, i) => {
    const err = msg => own.push(`line ${i + 1}: ${msg}`);
    const s = STING.exec(line);
    if (s) {
      const mood = s[1].toLowerCase(), pattern = s[2].trim();
      if (!names.includes(mood)) return err(`a sting for unknown mood "${s[1]}" (moods: ${names.join(' ')})`);
      if (stings[mood]) return err(`mood ${mood} has two stings`);
      if (!/^\S+$/.test(pattern)) return err(`a sting is one pattern ("# sting ${mood}: NAME")`);
      const tl = song.pattern(pattern, i + 1);
      if (!tl.dur) return;                   // (compile said why: no such pattern)
      stings[mood] = tl;
      for (const ev of tl.events) stingVoices.add(ev.v);
      return;
    }
    const m = MOOD.exec(line);
    if (!m) return;
    const mood = m[1].toLowerCase();
    if (!names.includes(mood)) return err(`unknown mood "${m[1]}" (moods: ${names.join(' ')})`);
    if (given.has(mood)) return err(`mood ${mood} is defined twice`);
    const set = new Set();
    for (const word of m[2].trim().split(/\s+/).filter(Boolean)) {
      const drop = word.startsWith('-'), name = drop ? word.slice(1) : word;
      const add = given.get(name) ?? (byName.has(name) ? [byName.get(name)] : null);
      if (!add) { err(`mood ${mood} names "${name}", which is neither a voice nor an earlier mood`); continue; }
      for (const v of add) drop ? set.delete(v) : set.add(v);
    }
    given.set(mood, set);
  });
  // compile's errors, the stings' among them, then ours
  const errors = song.errors.map(e => `line ${e.line}: ${e.msg}`).concat(own);
  for (const name of byName.keys()) if (names.includes(name)) errors.push(`voice "${name}" is named like a mood`);
  if (!given.has(base)) errors.push(`the score has no "# mood ${base}:" line`);
  for (const v of stingVoices) {
    const mood = [...given].find(([, set]) => set.has(v))?.[0];
    if (mood) errors.push(`voice "${song.voices[v].name}" plays in a sting and in mood ${mood}: a sting's voices play in no mood`);
  }
  const moods = {};
  for (const mood of names) {
    let from = mood;
    while (!given.has(from) && FALLBACK[from]) from = FALLBACK[from];
    moods[mood] = given.get(from) ?? given.get(base) ?? new Set();
  }
  song.stings = stings;                     // (drumkit.js renders their drums too)
  return { song, moods, names, base, given: [...given.keys()], stings, stingVoices, errors };
}

// the voices that play in mood (one the score does not know: its base mood's)
export const voicesIn = (score, mood) => score.moods[mood] ?? score.moods[score.base];

// --- a film's score (core/film.js scorePlan) ------------------------------------------------------

// the length of each bar of pattern `name` of a compiled song (s); [] if it has none
export function barsOf(song, name) {
  const s = song.pattern(name).sections[0];
  return s ? Array(s.bars).fill(s.barDur) : [];
}

// A film's score as notes in the film's time: the bars of its stretches (core/film.js scorePlan),
// each bar's notes from the compiled song, moved to where the bar falls and slowed or hurried with
// it. A note held over the bars after its own stops where they do (the pattern is cut there); one
// still sounding at a stretch's end holds on to it (the stretch's fermata). The last stretch's
// notes ring as written. A stretch's level makes its notes softer. Sorted by time: [{ t, d, v, vel, m?, g? }].
export function filmEvents(song, stretches) {
  const timelines = new Map(), out = [];
  const timeline = name => {
    if (!timelines.has(name)) timelines.set(name, song.pattern(name));
    return timelines.get(name);
  };
  stretches.forEach((st, k) => {
    const last = k === stretches.length - 1;
    // runs of bars one after the other of the same pattern: a note may last to the end of its run
    let runEnd = 0;
    st.bars.forEach((b, i) => {
      if (i === 0 || !(st.bars[i - 1].pattern === b.pattern && st.bars[i - 1].bar === b.bar - 1)) {
        let j = i;
        while (j + 1 < st.bars.length && st.bars[j + 1].pattern === b.pattern && st.bars[j + 1].bar === st.bars[j].bar + 1) j++;
        runEnd = st.bars[j].at + st.bars[j].dur;
      }
      const tl = timeline(b.pattern), s = tl.sections[0];
      if (!s) return;
      const from = b.bar * s.barDur, to = from + s.barDur, scale = b.dur / s.barDur;
      for (const ev of tl.events) {
        if (ev.t < from - 1e-9 || ev.t >= to - 1e-9) continue;
        const t = b.at + (ev.t - from) * scale;
        let d = ev.d * scale;
        // sounding at the end of its run: it stops there, or, the run ending the stretch, holds on
        // to the stretch's end
        if (!last && t + d >= runEnd - 1e-3) d = (runEnd >= st.end - st.hold - 1e-6 ? st.end : runEnd) - t;
        out.push({ ...ev, t, d, vel: ev.vel * (st.level ?? 1) });
      }
    });
  });
  return out.sort((a, b) => a.t - b.t || a.v - b.v);
}

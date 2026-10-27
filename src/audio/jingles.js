// Jingles: short scores (music/jingles/<name>.scrim, docs/music.md) a moment of the game gets, a
// boss beaten, a death, a quest done, a level gained, a chest's glint. Played once each by a synth
// of their own (vendor/scrimshaw) into the sound effects' bus: so they are sounds, not music,
// heard with the music off too, at the sounds' volume; the music is turned down a little under
// them (audio/music.js duckMusic, smoothly).
// One at a time: a jingle asked for while another plays waits its turn, unless that would be
// more than WAIT away (then it is left out), and one already playing or waiting is not played
// twice. Every score is fetched when audio starts, its plucked strings rendered ahead (warm);
// the synth hangs on the bus only while a jingle plays and rings out: the audio thread works on
// every node it can reach. They play live, not from samples (audio/sampler.js): a few seconds
// now and then, and rendering every jingle's notes ahead would hold more memory than they cost.
import { createSynth } from '../../vendor/scrimshaw/synth.js';
import { loadScore } from './score.js';
import { onAudioStart } from './context.js';
import { duckMusic } from './music.js';

// name: the music's level under it (big ones lower; the stingers, played over the music, barely)
const BIG = 0.55, SMALL = 0.8;
export const JINGLES = Object.freeze({
  victory: BIG, death: BIG, trial: BIG, quest: BIG, act1: BIG, act2: BIG, act3: BIG, core: BIG,
  trialsealed: BIG, horde: BIG, dawn: SMALL, dusk: SMALL,
  levelup: SMALL, chest: SMALL, legendary: SMALL, memorized: SMALL, questtaken: SMALL, questfailed: SMALL,
  trialfailed: SMALL, revived: SMALL, enchant: SMALL, portal: SMALL,
});

const LEVEL = 0.7;   // their synth's output level, into the sounds' bus
const RING = 3;      // s after the last one's end before the synth leaves the bus (the reverb's tail)
const WAIT = 5;      // s: the longest a jingle waits for the one before it
const LEAD = 0.05;   // s from asking to the first note

let ctx = null, out = null, syn = null, attached = false, timer = 0;
const songs = new Map();   // name -> the compiled song, once loaded
let queue = [];            // [{ name, start, end }]: playing or waiting, in order

onAudioStart((ac, sounds) => {
  ctx = ac; out = sounds;
  syn = createSynth(ctx, out);
  syn.out.disconnect();   // (from the bus and the analyser nobody reads, until one plays)
  syn.out.gain.value = LEVEL;
  for (const name of Object.keys(JINGLES)) {
    const file = `music/jingles/${name}.scrim`;
    fetch(new URL(`../../${file}`, import.meta.url))
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then(text => {
        const score = loadScore(text);
        if (score.errors.length) console.warn(`${file}:\n${score.errors.join('\n')}`);
        songs.set(name, score.song);
        syn.warm(score.song);
      })
      .catch(e => console.warn(`${file}: ${e.message}`));
  }
});

// play jingle `name` (after `delay` s, or once the one before it is done); how long until it has
// played (s, from now), 0 if it does not (no audio yet, not loaded, playing already, too long a wait)
export function jingle(name, { delay = 0 } = {}) {
  const song = songs.get(name);
  if (!song || !syn || ctx.state !== 'running') return 0;
  const now = ctx.currentTime;
  queue = queue.filter(j => j.end > now);
  if (queue.some(j => j.name === name)) return 0;
  const start = Math.max(now + LEAD + delay, queue.at(-1)?.end ?? 0);
  if (start - now > WAIT + delay) return 0;
  const end = start + song.loop.dur;
  queue.push({ name, start, end });
  if (!attached) { syn.out.connect(out); attached = true; }
  const sess = syn.session(song);
  for (const ev of song.loop.events) sess.play(ev, start + ev.t);
  duckMusic(start, song.loop.dur + 0.3, JINGLES[name]);
  // the synth leaves the bus once the last one has rung out
  clearTimeout(timer);
  timer = setTimeout(() => { if (attached) { syn.out.disconnect(); attached = false; } }, (end + RING - now) * 1000);
  setTimeout(() => sess.stop(0.1), (end + RING - now) * 1000);
  return end - now;
}

// Run in the game console (or on any page of the game's server):
//   (await import('/tests/browser/samples.js')).runSampleChecks()
//   (await import('/tests/browser/samples.js')).runSongChecks()
// The music's notes played from samples (src/audio/sampler.js) against the synth playing them
// live (vendor/scrimshaw), rendered offline both ways:
//   - every melodic instrument the songs use, a short note and one held long enough to loop:
//     their loudness, window by window, has to stay close (a loop that jumps or a release that
//     cuts off shows up there), and no sample may click (a jump between two samples much bigger
//     than the synth's own);
//   - every song, in its calmest and its fiercest mood, second by second.
// (It lets the game's samples go first: the song playing plays live until it starts again.)
import { createSynth, INST } from '../../vendor/scrimshaw/synth.js';
import { loadScore, voicesIn } from '../../src/audio/score.js';
import { SONGS } from '../../src/themes/index.js';
import { prepareDrums, playDrum } from '../../src/audio/drumkit.js';
import { prepareSamples, playSampled, forgetSamples } from '../../src/audio/sampler.js';

const RATE = 44100, WIN = 0.05;
const HELD = [1.5, 5];   // the held note: when, how long
const check = (condition, message) => { if (!condition) throw Error(message); };
const scoreOf = async name => loadScore(await (await fetch(new URL(`../../music/${name}.scrim`, import.meta.url))).text());

// how close the samples come: 4 dB, but 6 where a held note lets go (the synth's chorus and
// vibrato beat at their own pace, so the level it lets go from differs a little), and 14 for the
// plucked strings: their start is random each time and decays as it falls (the synth's own, from
// one page to the next, lie 10 dB apart two seconds in), and the synth damps the string but
// leaves the sine under it ringing, where the samples damp both (40 dB down, for a moment)
const PLUCKED = new Set(['harp', 'guitar', 'banjo', 'harpsichord', 'pizz', 'upright']);
const toleranceOf = (inst, t, tolerance) => PLUCKED.has(inst) ? tolerance * 3.5 : t >= HELD[0] + HELD[1] ? tolerance * 1.5 : tolerance;

// a song of one voice playing notes [t, d, midi, velocity]
function tiny(voice, notes) {
  const events = notes.map(([t, d, m, vel]) => ({ t, d, v: 0, vel, m: [m], s: 0 }));
  const dur = Math.max(...notes.map(([t, d]) => t + d)) + 4;
  return { voices: [voice], intro: { events: [], sections: [], dur: 0 }, loop: { events, sections: [], dur }, reverb: 0, stings: {} };
}
// render [event, time] pairs of `song` (voices `on`) for `seconds`, from samples or live, dry (each
// synth makes its reverb anew, at random, which alone moves a wet voice by a few dB); raw: without
// the synth's compressors. -> { y, live: notes the samples did not play }
async function render(song, events, on, seconds, sampled, raw) {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * RATE), RATE);
  const syn = createSynth(ctx, ctx.destination, { raw });
  syn.verbRet.disconnect();
  const sess = syn.session(song);
  syn.warm(song, 1e9);
  await prepareDrums(ctx, song);
  if (sampled) await prepareSamples(ctx, song);
  let live = 0;
  for (const [ev, t] of events) {
    if (!on.has(ev.v) || t >= seconds) continue;
    const v = song.voices[ev.v];
    if (v.drum ? playDrum(ctx, v.inst, ev.vel, sess.ch[ev.v].input, t) : sampled && playSampled(ctx, sess, ev, t)) continue;
    if (!v.drum && sampled) live++;
    sess.play(ev, t);
  }
  return { y: (await ctx.startRendering()).getChannelData(0), live };
}
// loudness in dB, window by window
function levels(y, win = WIN) {
  const n = Math.round(win * RATE), out = [];
  for (let i = 0; i + n <= y.length; i += n) {
    let s = 0;
    for (let j = i; j < i + n; j++) s += y[j] * y[j];
    out.push(10 * Math.log10(s / n + 1e-12));
  }
  return out;
}
const maxStep = y => { let m = 0; for (let i = 1; i < y.length; i++) m = Math.max(m, Math.abs(y[i] - y[i - 1])); return m; };

export async function runSampleChecks({ tolerance = 4, strict = true, only = null, dump = false } = {}) {
  forgetSamples();
  // every melodic instrument of the songs, with the settings of the first voice playing it
  const voices = new Map();
  for (const name of SONGS) for (const v of (await scoreOf(name)).song.voices)
    if (!v.drum && INST[v.inst] && !voices.has(v.inst)) voices.set(v.inst, { ...v, vol: 1, pan: 0, rev: 0 });
  const out = {};
  for (const [inst, voice] of voices) {
    if (only && !only.includes(inst)) continue;
    const m = Math.round((voice.center ?? 62) + 7);
    const song = tiny(voice, [[0.1, 0.25, m, 0.8], [HELD[0], HELD[1], m - 5, 1]]);   // short, and held to loop
    const events = song.loop.events.map(ev => [ev, ev.t]), on = new Set([0]);
    const live = (await render(song, events, on, song.loop.dur, false, true)).y;
    const { y: sampled, live: unsampled } = await render(song, events, on, song.loop.dur, true, true);
    check(unsampled < 2, `${inst}: its short note was not sampled`);   // (a struck one held longer than its sample rings plays live)
    const a = levels(live), b = levels(sampled), top = Math.max(...a);
    // window by window, but where a held note holds its loop repeats a beating or a vibrato at
    // its own pace: there only how loud it is on the whole, and how far it swings, are compared
    const hold = [HELD[0] + 1, HELD[0] + HELD[1]], inside = i => i * WIN >= hold[0] && (i + 1) * WIN <= hold[1];
    const ha = a.filter((_, i) => inside(i)), hb = b.filter((_, i) => inside(i));
    const sustained = Math.min(...ha) > Math.max(...ha) - 20;   // (not a struck note ringing out)
    let worst = 0, at = 0;
    const off = (dB, t) => { if (dB > worst) { worst = dB; at = t; } };
    a.forEach((la, i) => { if (la > top - 40 && !(sustained && inside(i))) off(Math.abs(la - b[i]), i * WIN); });
    if (sustained) {
      const mean = x => x.reduce((s, v) => s + v, 0) / x.length;
      off(Math.abs(mean(ha) - mean(hb)), hold[0]);
      off(Math.max(0, Math.min(...ha) - Math.min(...hb) - 2), hold[0]);   // (a dip deeper than the synth's: a seam)
      off(Math.max(0, Math.max(...hb) - Math.max(...ha) - 2), hold[0]);
    }
    const click = maxStep(sampled) / Math.max(1e-9, maxStep(live));
    out[inst] = { worstDb: +worst.toFixed(1), at: +at.toFixed(2), click: +click.toFixed(2), live: unsampled, ok: worst <= toleranceOf(inst, at, tolerance) && click <= 2 };
    if (dump) out[inst].levels = a.map((la, i) => `${(i * WIN).toFixed(2)} ${la.toFixed(1)} ${b[i].toFixed(1)}`);
  }
  console.table(out);
  const bad = Object.entries(out).filter(([, r]) => !r.ok);
  if (strict) check(!bad.length, `off from the synth: ${bad.map(([k, r]) => `${k} ${r.worstDb} dB at ${r.at} s, steps x${r.click}`).join('; ')}`);
  return out;
}

// a whole song both ways, `seconds` of it in `mood` (or only `voices`): how loud each second is
// may differ by at most `tolerance` dB, and every note has to come from a sample once they are in.
// (Not closer: where a quick ostinato rings over itself on one pitch (crystal), the notes add up
// as their phases fall, and the synth's phases are not the samples'; each way is as right.)
export async function runSongCheck(name = 'overworld', mood = 'explore', { seconds = 20, tolerance = 3, voices = null } = {}) {
  const score = await scoreOf(name), { song } = score;
  const on = voices ? new Set(voices.map(n => song.voices.findIndex(v => v.name === n))) : voicesIn(score, mood);
  const events = song.intro.events.map(e => [e, e.t + 0.1]);
  for (let off = song.intro.dur; song.loop.dur && off < seconds; off += song.loop.dur)
    for (const e of song.loop.events) events.push([e, off + e.t + 0.1]);
  const a = await render(song, events, on, seconds, false, false), b = await render(song, events, on, seconds, true, false);
  const la = levels(a.y, 1), lb = levels(b.y, 1);
  const worst = Math.max(...la.map((x, i) => Math.abs(x - lb[i])));
  check(worst <= tolerance && b.live === 0, `${name} ${mood}: ${worst.toFixed(1)} dB off, ${b.live} notes live`);
  return { song: name, mood, worstDb: +worst.toFixed(2), seconds: la.map((x, i) => `${x.toFixed(1)}/${lb[i].toFixed(1)}`).join(' ') };
}
// every song, in its first mood and its last
export async function runSongChecks(opts) {
  const out = {};
  for (const name of SONGS) {
    const score = await scoreOf(name);
    for (const mood of new Set([score.base, score.names.at(-1)])) out[`${name} ${mood}`] = (await runSongCheck(name, mood, { seconds: 12, ...opts })).worstDb;
  }
  console.table(out);
  return out;
}

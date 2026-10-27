// The music's samples (src/audio/sampler.js): which notes a song needs, and the loops of held
// notes. Rendering and playing them needs Web Audio: tests/browser/samples.js, in the game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repo } from './paths.js';
import { loadScore } from '../src/audio/score.js';
import { SONGS } from '../src/themes/index.js';
import { noteSpecs, keyOf, loopFrames, crossfadeLoop } from '../src/audio/sampler.js';

const scoreOf = name => loadScore(readFileSync(resolve(repo, 'music', `${name}.scrim`), 'utf8'));

test('every melodic note of every song has a sample, as long as the song holds it', () => {
  for (const name of SONGS) {
    const { song, stings } = scoreOf(name), specs = noteSpecs(song);
    for (const tl of [song.intro, song.loop, ...Object.values(stings)]) for (const ev of tl.events) {
      const v = song.voices[ev.v];
      if (v.drum) continue;
      for (const m of ev.m) {
        const s = specs.get(keyOf(v, m, ev.vel / Math.sqrt(ev.m.length)));
        assert.ok(s, `${name}: ${v.name} ${m}`);
        assert.ok(s.maxDur >= ev.d && s.voices.has(ev.v), `${name}: ${v.name} ${m} held ${ev.d}`);
      }
    }
  }
});

test('a sample is the instrument, its settings and the pitch; the velocity only where it colours', () => {
  const voice = (inst, o = {}) => ({ inst, bright: 1, att: null, rel: null, ...o });
  assert.equal(keyOf(voice('flute'), 69, 0.5), keyOf(voice('flute'), 69, 1));         // (the player's gain)
  assert.notEqual(keyOf(voice('flute'), 69, 1), keyOf(voice('flute', { att: 0.3 }), 69, 1));
  assert.notEqual(keyOf(voice('flute'), 69, 1), keyOf(voice('flute'), 70, 1));
  assert.notEqual(keyOf(voice('crystal'), 69, 0.5), keyOf(voice('crystal'), 69, 1));   // brighter struck harder
  assert.equal(keyOf(voice('crystal'), 69, 0.98), keyOf(voice('crystal'), 69, 1));     // (in steps)
});

test('a held note loops on a whole number of its periods', () => {
  for (const [f, rate] of [[55, 22050], [440, 44100], [1975.5, 44100], [261.6, 22050]]) {
    const [a, b] = loopFrames(f, rate, 0.8, 1.2), periods = (b - a) * f / rate;
    assert.equal(a, Math.round(0.8 * rate));
    assert.ok(Math.abs(periods - Math.round(periods)) * rate / f <= 0.5 + 1e-9, `${f} Hz: ${periods} periods`);
    assert.ok(Math.abs((b - a) / rate - 1.2) < 1 / f, `${f} Hz: ${(b - a) / rate} s`);
  }
});

test('the end of a loop is crossfaded into what came before its start', () => {
  // a tone whose loop is not a whole number of its periods: without the crossfade the jump clicks
  const rate = 8000, f = 330, y = Float32Array.from({ length: 4000 }, (_, i) => Math.sin(2 * Math.PI * f * i / rate));
  const start = 1000, end = 3017, x = 400;
  const step = (i, j) => Math.abs(y[j] - y[i]);
  const usual = Math.max(...Array.from({ length: 50 }, (_, i) => step(i, i + 1)));
  assert.ok(step(end - 1, start) > usual * 1.5, 'the jump clicks as it is');
  const before = y.slice();
  crossfadeLoop(y, start, end, x);
  assert.ok(step(end - 1, start) <= usual * 1.05, 'and not crossfaded');
  assert.deepEqual(y.subarray(0, end - x), before.subarray(0, end - x), 'untouched before the crossfade');
});

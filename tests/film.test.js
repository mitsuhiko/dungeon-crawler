import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { assets, repo } from './paths.js';
import { flowMap, glowFlow, schedule, cueTime, readTime, filmLines, lineKey, scorePlan, FIT, CUES, ENDS } from '../src/core/film.js';
import { loadScore, barsOf, filmEvents } from '../src/audio/score.js';
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { FILMS } from '../src/film/films.js';

// two strokes of ink on black, a gap between them: a bar along the bottom, a post up from its left
function strokes(w = 40, h = 30) {
  const ink = new Float32Array(w * h);
  for (let x = 2; x < 30; x++) for (let y = 25; y < 28; y++) ink[y * w + x] = 1;
  for (let y = 3; y < 25; y++) for (let x = 2; x < 5; x++) ink[y * w + x] = 1;
  for (let y = 10; y < 14; y++) for (let x = 33; x < 37; x++) ink[y * w + x] = 0.8;   // apart, across the black
  return { ink, w, h };
}

test('ink spreads from where the brush starts, along its strokes, slower across the black', () => {
  const { ink, w, h } = strokes();
  const at = (f, x, y) => f[y * w + x];
  const fromCorner = flowMap(ink, w, h, [[3 / (w - 1), 26 / (h - 1)]]);
  assert.equal(at(fromCorner, 3, 26), 0);
  // along the bar, later the further; up the post, later the higher
  assert.ok(at(fromCorner, 10, 26) < at(fromCorner, 20, 26) && at(fromCorner, 20, 26) < at(fromCorner, 29, 26));
  assert.ok(at(fromCorner, 3, 20) < at(fromCorner, 3, 5));
  // the speck apart is reached last (across the black), and the flow ends at 1
  const inked = [...fromCorner].filter((_, i) => ink[i] > 0.1);
  assert.equal(Math.max(...inked), 1);
  assert.ok(at(fromCorner, 35, 12) > at(fromCorner, 29, 26));
  // from a side: the first ink on each line across it starts
  const fromLeft = flowMap(ink, w, h, 'left');
  assert.equal(at(fromLeft, 2, 26), 0);
  assert.ok(at(fromLeft, 29, 26) > at(fromLeft, 10, 26));
  assert.throws(() => flowMap(ink, w, h, 'middle'));
});

test("a stroke's glow comes and goes with the stroke, not with the black it lies on", () => {
  const { ink, w, h } = strokes();
  const flow = flowMap(ink, w, h, [[3 / (w - 1), 26 / (h - 1)]]), glow = glowFlow(flow, ink, w, h, 3);
  // just above the bar's far end (black: its own flow is late), the glow goes by the bar there
  const i = 22 * w + 28;
  assert.ok(ink[i] === 0);
  assert.ok(Math.abs(glow[i] - flow[26 * w + 28]) < 0.1, `${glow[i]} ~ ${flow[26 * w + 28]}`);
  assert.equal(glow[2 * w + 20], flow[2 * w + 20]);   // (no ink near: its own)
});

test("a film's shots last as long as their lines, and its cues fall in them", () => {
  const film = { name: 't', shots: [
    { id: 'a', line: 'One.', after: 0.5, cues: [[0, 'paint', 'x', { for: 2 }], ['50%', 'fade', 'x']] },
    { hold: 3, cues: [[1, 'black', { for: 1 }], [0.5, 'shatter', 'g', { from: [1, 0, 0] }]] },
  ] };
  const plan = schedule(film, () => 4);
  assert.deepEqual(plan.shots.map(s => [s.start, s.length, s.said, s.key]), [[0, 4.5, 4, 'film.t.a'], [4.5, 3, 0, null]]);
  assert.equal(plan.length, 7.5);
  assert.deepEqual(plan.cues.map(c => [c.t, c.do]), [[0, 'paint'], [2.25, 'fade'], [5, 'shatter'], [5.5, 'black']]);
  assert.equal(plan.cues[0].layer, 'x');
  assert.equal(plan.cues[0].for, 2);
  assert.deepEqual(plan.cues[2].from, [1, 0, 0]);
  assert.equal(cueTime('25%', 8), 2);
  assert.throws(() => cueTime('soon', 8));
  assert.throws(() => schedule({ name: 't', shots: [{ hold: 1, cues: [[0, 'explode']] }] }, () => 1), /unknown cue/);
  assert.throws(() => schedule({ name: 't', shots: [{ hold: 1, cues: [[0, 'paint']] }] }, () => 1), /needs a layer/);
  assert.throws(() => schedule({ name: 't', shots: [{ line: 'No id.' }] }, () => 1), /needs an id/);
  assert.equal(readTime('Hi.'), 2.5);
});

test('every film is whole: its pictures are there, its cues name its layers and glasses', () => {
  for (const [name, film] of Object.entries(FILMS)) {
    assert.equal(film.name, name);
    for (const [layer, def] of Object.entries(film.layers)) {
      if (def.text) { assert.ok(def.at && def.h > 0, `${name}: ${layer}`); continue; }
      assert.ok(existsSync(resolve(assets, 'film', `${def.image ?? layer}.png`)), `${name}: no picture for ${layer} (tools/inklayer.py)`);
      assert.ok(Array.isArray(def.at) && def.h > 0, `${name}: ${layer} needs at and h`);
    }
    const plan = schedule(film, shot => readTime(shot.line));
    for (const c of plan.cues) {
      if (CUES[c.do].includes('layer')) assert.ok(film.layers[c.layer], `${name}: cue ${c.do} at ${c.t.toFixed(1)} s: no layer ${c.layer}`);
      if (CUES[c.do].includes('glass')) assert.ok(film.glasses?.[c.glass], `${name}: cue ${c.do} at ${c.t.toFixed(1)} s: no glass ${c.glass}`);
    }
    assert.ok(plan.cues.some(c => ENDS.includes(c.do)), `${name}: ends (${ENDS.join(' or ')})`);
    // its lines are voiced like the narrator's, each its own clip, in the film's voice
    const lines = filmLines(film);
    assert.equal(new Set(lines.map(l => l.id)).size, lines.length);
    for (const l of lines) assert.ok(l.note && l.voice === film.voice, l.id);
    assert.equal(lines[0].id, lineKey(film, film.shots.find(s => s.line)));
  }
});

test('every painting in assets/film/ is in a film', () => {
  const used = new Set(Object.values(FILMS).flatMap(f => Object.entries(f.layers).filter(([, d]) => !d.text).map(([n, d]) => d.image ?? n)));
  for (const f of readdirSync(resolve(assets, 'film'))) assert.ok(used.has(f.replace(/\.png$/, '')), `${f} is in no film`);
});

test('the opening is a minute and a half long', () => {
  const plan = schedule(FILMS.opening, shot => readTime(shot.line));
  assert.ok(plan.length > 60 && plan.length < 100, `${plan.length.toFixed(1)} s`);
});

test("a film's score fills the time between its cues, whatever the lines take", () => {
  const bar = 2;
  const barsOf = name => ({ a: [bar, bar], bed: [bar], end: [bar], hit: [bar, bar, bar] })[name];
  const film = lines => ({ name: 't', shots: [
    { id: 'x', line: 'x', cues: [[0, 'music', 'a', { then: 'bed', last: 'end' }]] },
    { hold: 5.9, cues: [[0, 'music', 'hit']] },
    { hold: 3, cues: [[0, 'music', 'end']] },
  ], lines });
  for (const said of [3, 9.55, 16, 30]) {
    const plan = schedule(film(), () => said);
    const [first, hit, last] = scorePlan(plan, barsOf);
    // the stretch ends where the next begins; its bars fill it, at most FIT off their tempo
    assert.equal(first.end, hit.at);
    assert.ok(Math.abs(first.scale - 1) <= FIT + 1e-9, `${said}: scale ${first.scale}`);
    const filled = first.bars.at(-1).at + first.bars.at(-1).dur + first.hold;
    assert.ok(Math.abs(filled - first.end) < 1e-9);
    assert.ok(first.hold >= -1e-9 && first.hold < bar);
    // its last pattern always closes it, its first starts it when there is room
    assert.equal(first.bars.at(-1).pattern, 'end');
    if (first.bars.length >= 3) assert.deepEqual(first.bars.slice(0, 2).map(b => b.pattern), ['a', 'a']);
    // a pattern without a bed plays whole, a little faster to fit (5.9 s for 6)
    assert.deepEqual(hit.bars.map(b => b.bar), [0, 1, 2]);
    assert.ok(Math.abs(hit.scale - 5.9 / 6) < 1e-9);
    // the last plays as written
    assert.equal(last.scale, 1);
    assert.equal(last.end, last.at + bar);
  }
  // the bed comes over and over, cut at a bar
  const long = scorePlan(schedule(film(), () => 30), barsOf)[0];
  assert.deepEqual(long.bars.map(b => b.pattern), ['a', 'a', ...Array(long.bars.length - 3).fill('bed'), 'end']);
});

test("a film's score keeps its notes in their stretches", () => {
  const { song } = loadScore(`tempo 60
beats 2
steps 2
voice v sine
pattern a
v | C4--- | D4--- |
pattern bed
v | E4- F4- |
pattern hold
v | G4--- | = |
loop a bed hold`);
  // bars of 2 s; 6.2 s to fill: a's two bars and the bed's one, a little slower
  const plan = { cues: [{ t: 0, do: 'music', pattern: 'a', then: 'bed' }, { t: 6.2, do: 'music', pattern: 'hold' }] };
  const stretches = scorePlan(plan, name => barsOf(song, name));
  const notes = filmEvents(song, stretches);
  assert.deepEqual(stretches[0].bars.map(b => b.pattern), ['a', 'a', 'bed']);
  // in order, each bar where it falls, its notes slowed with it; the last one holding to the next stretch
  assert.deepEqual(notes.map(n => n.m[0]), [60, 62, 64, 65, 67]);
  const scale = stretches[0].scale;
  assert.ok(Math.abs(notes[1].t - 2 * scale) < 1e-9);
  assert.ok(Math.abs(notes[3].t + notes[3].d - 6.2) < 1e-6, 'the last note holds on to the next stretch');
  // the last stretch rings as written: G held over both its bars
  assert.ok(Math.abs(notes[4].d - 4) < 0.5);
});

test("every film's score is there, and its music cues name its patterns", () => {
  for (const [name, film] of Object.entries(FILMS)) {
    const music = schedule(film, shot => readTime(shot.line)).cues.filter(c => c.do === 'music');
    if (!film.score) { assert.equal(music.length, 0, `${name}: music cues but no score`); continue; }
    const { song, errors } = loadScore(readFileSync(resolve(repo, 'music', 'films', `${film.score}.scrim`), 'utf8'));
    assert.deepEqual(errors, []);
    for (const c of music) for (const p of [c.pattern, c.then, c.last].filter(Boolean)) assert.ok(barsOf(song, p).length, `${name}: no pattern ${p}`);
    // the stretches never go more than FIT off their tempo, in a language whose lines are short or long
    for (const k of [0.7, 1, 1.4]) {
      const stretches = scorePlan(schedule(film, shot => k * readTime(shot.line)), p => barsOf(song, p));
      for (const st of stretches) assert.ok(Math.abs(st.scale - 1) <= FIT + 1e-9 && st.bars.length, `${name} x${k}: ${st.bars[0]?.pattern}`);
      assert.ok(filmEvents(song, stretches).length > 100);
    }
  }
});

// the player, the ink and the glass run only in the browser (three.js, the DOM): at least they parse
test("the films' browser modules parse", () => {
  const files = ['src/film/player.js', 'src/film/ink.js', 'src/film/glass.js', 'src/render/stage.js', 'src/audio/film.js'];
  for (const f of files) {
    const r = spawnSync(process.execPath, ['--check', resolve(import.meta.dirname, '..', f)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});

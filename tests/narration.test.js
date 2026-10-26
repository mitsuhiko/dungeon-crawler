import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assets } from './paths.js';
import { plan, clipsOf, clipFile, VOICES, TAGS, POINT, sentencesOf } from '../tools/narration.mjs';
import { LINES, SIBLING, MOMENTS, linesFor, fits, untagged, tagsOf, lineText } from '../src/core/narration.js';
import { createWorld, checkWorld } from '../src/core/save.js';
import { EVERY_CHANGE } from '../src/i18n/languages.js';

test('the narrator\'s lines are well formed and translated', async () => {
  const { problems } = await clipsOf();
  assert.deepEqual(problems, []);
});

test('a recorded line says no names: a parameter without forms is a problem', async () => {
  const { problems } = await clipsOf([{ id: 'x', note: 'n', text: 'Hello {owner}.' }]);
  assert.match(problems.join('\n'), /x: no value for \{owner\}/);
  const ok = await clipsOf([{ id: 'opening.looked-like', note: 'n', text: LINES[0].text, forms: SIBLING }]);
  assert.deepEqual(ok.problems, []);
  assert.deepEqual(ok.clips.filter(c => c.lang === 'en').map(c => c.key), ['opening.looked-like.m', 'opening.looked-like.f']);
});

test('performance tags are not shown, and voiced as instructions only by a voice that speaks so', async () => {
  const text = '[sad]Not all of them. [sighing] I couldn\'t catch them all. [very slowly]There.';
  assert.equal(untagged(text), "Not all of them. I couldn't catch them all. There.");
  assert.deepEqual(tagsOf(text), ['sad', 'sighing', 'very slowly']);
  assert.equal(untagged('Not a tag: [1], [Glass], {sib}.'), 'Not a tag: [1], [Glass], {sib}.');
  assert.equal(lineText({ text: '[whispers]That is the Hidden.' }), 'That is the Hidden.');
  const tagged = await clipsOf([{ id: 'x', note: 'n', text: '[sad]' + LINES[1].text }]);
  const plain = await clipsOf([LINES[1]]);
  assert.equal(tagged.clips[0].text, plain.clips[0].text);
  // (the same clip without instructions; another with them: the tag is said)
  if (VOICES.en.speaks) assert.notEqual(tagged.clips[0].hash, plain.clips[0].hash);
  else assert.equal(tagged.clips[0].hash, plain.clips[0].hash);
});

test('a line in sentences, each with its instruction: tags set the mood, event tags one sentence', () => {
  const said = sentencesOf('[sad]Not all of them. I tried. [sighing]Some are cloudy. [calm]There.', 'Base.');
  assert.deepEqual(said.map(([, s]) => s), ['Not all of them.', 'I tried.', 'Some are cloudy.', 'There.']);
  assert.equal(said[0][0], TAGS.sad);
  assert.equal(said[1][0], TAGS.sad);
  assert.equal(said[2][0], `${POINT.sighing} ${TAGS.sad}`);
  assert.equal(said[3][0], TAGS.calm);
  assert.deepEqual(sentencesOf('Plain. Text!', 'Base.'), [['Base.', 'Plain.'], ['Base.', 'Text!']]);
  assert.deepEqual(sentencesOf('Plain.'), [[null, 'Plain.']]);
});

test('a tag the voice does not know is a problem', async () => {
  const { problems } = await clipsOf([{ id: 'x', note: 'n', text: '[grumpy]Hello.' }]);
  assert.match(problems.join('\n'), /x: no tag \[grumpy\]/);
});

test('every language kept with every change has a voice', () => {
  for (const lang of EVERY_CHANGE) assert.ok(VOICES[lang], `no voice for ${lang} (tools/narration.mjs VOICES)`);
});

// The clips are not committed yet (assets/narration/ is ignored, docs/narration.md): without them
// the game only shows the subtitles. Where they were rendered, they must be current.
const rendered = existsSync(resolve(assets, 'narration/manifest.json'));
test('the narration is rendered and current (node tools/narration.mjs)', { skip: !rendered && 'no clips rendered here' }, async () => {
  const p = await plan(assets);
  const list = xs => xs.map(c => (typeof c === 'string' ? c : clipFile(c.lang, c.key)));
  assert.deepEqual(p.unvoiced, [], 'the voice cloned is missing (docs/narration.md, "The voice")');
  assert.deepEqual(list(p.missing), [], 'missing clips: run node tools/narration.mjs');
  assert.deepEqual(list(p.changed), [], 'changed lines: run node tools/narration.mjs');
  assert.deepEqual(p.gone, [], 'clips of lines that are gone: run node tools/narration.mjs');
  for (const c of p.clips) {
    const head = readFileSync(resolve(assets, 'narration', clipFile(c.lang, c.key))).subarray(0, 3);
    assert.ok(head.toString('latin1') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0), `${c.key} is not an MP3`);
    assert.ok(p.manifest.clips[c.lang][c.key].dur > 0.5);
  }
});

test('a clip is rendered again when its text or seed changed, not when only its settings did', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'narration-test-'));
  try {
    const line = { id: 'x', note: 'n', text: '[sad]Hello there.', voice: 'glassmaker' };
    const { clips } = await clipsOf([line]);
    const stamp = entries => {
      const m = { clips: {} };
      for (const c of clips) {
        mkdirSync(join(dir, 'narration', c.lang), { recursive: true });
        writeFileSync(join(dir, 'narration', clipFile(c.lang, c.key)), 'ID3');
        (m.clips[c.lang] ??= {})[c.key] = { dur: 1, ...entries(c) };
      }
      writeFileSync(join(dir, 'narration/manifest.json'), JSON.stringify(m));
    };
    const keys = xs => xs.map(c => clipFile(c.lang, c.key));
    // another voice, filter or PIPELINE: stale, left as it is
    stamp(c => ({ text: c.text, source: c.source, seed: 0, hash: 'other' }));
    let p = await plan(dir, [line]);
    assert.deepEqual([p.missing, p.changed], [[], []]);
    assert.deepEqual(keys(p.stale), keys(clips));
    // another text (a tag counts), or another seed: changed
    p = await plan(dir, [{ ...line, text: 'Hello there.' }]);
    assert.deepEqual(keys(p.changed), keys(clips));
    p = await plan(dir, [{ ...line, seed: 2 }]);
    assert.deepEqual(keys(p.changed), keys(clips));
    // an entry from before `source`: its text without the tags
    stamp(c => ({ text: c.text, seed: 0, hash: c.hash }));
    p = await plan(dir, [line]);
    assert.deepEqual([p.changed, p.stale], [[], []]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('every line is said at a moment, about what that moment tells', () => {
  for (const line of LINES) {
    assert.ok(MOMENTS[line.on], `${line.id}: no moment '${line.on}'`);
    for (const [k, v] of Object.entries(line.when ?? {})) assert.ok(v !== undefined, `${line.id}: when.${k}`);
  }
});

test('a moment says its next line not told yet, a scene all of them, in the table\'s order', () => {
  const told = new Set();
  const first = linesFor('death', {}, told);
  assert.deepEqual(first.map(l => l.id), ['death.not-how']);
  told.add('death.not-how');
  assert.deepEqual(linesFor('death', {}, told).map(l => l.id), ['death.wrong']);
  assert.deepEqual(linesFor('opening').map(l => l.id).slice(0, 2), ['opening.looked-like', 'opening.my-town']);
  assert.equal(linesFor('opening').length, LINES.filter(l => l.on === 'opening').length);
  assert.deepEqual(linesFor('beaten', { boss: 'gusto' }).map(l => l.id), ['boss.gusto.after', 'beaten.gusto.well']);
  assert.deepEqual(linesFor('boss', { boss: 'totnar', what: 'split', stage: 3 }).map(l => l.id), ['boss.totnar.storm']);
  assert.deepEqual(linesFor('boss', { boss: 'gusto', what: 'nothing' }), []);
});

test('when: a value, a list of values, or a range of numbers', () => {
  assert.ok(fits({ boss: 'gusto' }, { boss: 'gusto', what: 'start' }));
  assert.ok(!fits({ boss: 'gusto' }, { boss: 'totnar' }));
  assert.ok(fits({ theme: ['clouds', 'lagoon'] }, { theme: 'lagoon' }));
  assert.ok(fits({ depth: [1, 6] }, { depth: 3 }) && !fits({ depth: [1, 6] }, { depth: 7 }));
  assert.ok(fits(undefined, { anything: 1 }));
});

test('the first three depths are told: their arrival, their boss, and every theme of the first act', async () => {
  const { THEMES } = await import('../src/themes/index.js');
  for (const depth of [1, 2, 3]) assert.ok(linesFor('depth', { depth }).length, `depth ${depth}`);
  for (const boss of ['gusto', 'totnar', 'squarlo']) {
    assert.ok(linesFor('arena', { boss }).length, `${boss}'s arena`);
    assert.ok(linesFor('boss', { boss, what: 'start' }).length, `${boss}'s fight`);
    assert.ok(linesFor('beaten', { boss }).length, `${boss} beaten`);
  }
  for (const t of THEMES.filter(t => t.act === 1)) assert.ok(linesFor('theme', { theme: t.props }).length, t.props);
});

test('what the narrator said is saved with the world', () => {
  const w = createWorld(7, { id: 'w-told' });
  w.run.told = ['opening.looked-like', 'depth.1.summer', 3];
  assert.deepEqual(checkWorld(JSON.parse(JSON.stringify(w))).run.told, ['opening.looked-like', 'depth.1.summer']);
  assert.deepEqual(checkWorld({ ...w, run: { ...w.run, told: undefined } }).run.told, []);
});

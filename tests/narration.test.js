import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assets } from './paths.js';
import { plan, clipsOf, clipFile, VOICES, TAGS, POINT, sentencesOf } from '../tools/narration.mjs';
import { LINES, SIBLING, MOMENTS, RECORDINGS, ROBOT_REST, robotMayTalk, linesFor, fits, untagged, tagsOf, lineText, recordingLines, recordingsHeard } from '../src/core/narration.js';
import { createWorld, checkWorld } from '../src/core/save.js';
import { EVERY_CHANGE } from '../src/i18n/languages.js';

test('the narrator\'s lines are well formed and translated', async () => {
  const { problems } = await clipsOf();
  assert.deepEqual(problems, []);
});

test('a recorded line says no names: a parameter without forms is a problem', async () => {
  const { problems } = await clipsOf([{ id: 'x', note: 'n', text: 'Hello {owner}.' }]);
  assert.match(problems.join('\n'), /x: no value for \{owner\}/);
  const ok = await clipsOf([{ id: 'x.sib', note: 'n', text: 'There {sib, select, m {he} other {she}} is.', forms: SIBLING }]);
  assert.deepEqual(ok.problems.filter(p => !/not translated/.test(p)), []);
  assert.deepEqual(ok.clips.filter(c => c.lang === 'en').map(c => c.key), ['x.sib.m', 'x.sib.f']);
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
    const head = readFileSync(resolve(assets, 'narration', clipFile(c.lang, c.key))).subarray(0, 36).toString('latin1');
    assert.ok(head.startsWith('OggS') && head.slice(28, 36) === 'OpusHead', `${c.key} is not Ogg Opus`);
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
  const table = [
    { id: 'foe.not-how', on: 'foe' }, { id: 'foe.wrong', on: 'foe' },
    { id: 'boss.gusto.after', on: 'beaten', when: { boss: 'gusto' } }, { id: 'beaten.gusto.well', on: 'beaten', when: { boss: 'gusto' } },
    { id: 'boss.totnar.storm', on: 'boss', when: { boss: 'totnar', what: 'split', stage: 3 } },
  ];
  const told = new Set();
  assert.deepEqual(linesFor('foe', {}, told, table).map(l => l.id), ['foe.not-how']);
  told.add('foe.not-how');
  assert.deepEqual(linesFor('foe', {}, told, table).map(l => l.id), ['foe.wrong']);
  assert.deepEqual(linesFor('beaten', { boss: 'gusto' }, new Set(), table).map(l => l.id), ['boss.gusto.after', 'beaten.gusto.well']);
  assert.deepEqual(linesFor('boss', { boss: 'totnar', what: 'split', stage: 3 }, new Set(), table).map(l => l.id), ['boss.totnar.storm']);
  assert.deepEqual(linesFor('boss', { boss: 'gusto', what: 'nothing' }, new Set(), table), []);
  // a recording is a scene: all of its lines, in order, the ones not heard yet
  const glass = recordingLines('glass');
  assert.deepEqual(linesFor('recording', { part: 'glass' }), glass);
  assert.deepEqual(linesFor('recording', { part: 'glass' }, new Set([glass[0].id])), glass.slice(1));
});

test('a moment that shuffles says the line that fits best, the lead first, else one picked by the world', () => {
  const table = [
    ...Array.from({ length: 8 }, (_, i) => ({ id: `death.any-${i}`, on: 'death' })),
    { id: 'death.first', on: 'death', lead: true },
    { id: 'death.gusto', on: 'death', when: { boss: 'gusto' } },
  ];
  assert.ok(MOMENTS.death.shuffle);
  assert.deepEqual(linesFor('death', { boss: 'gusto' }, new Set(), table, 1).map(l => l.id), ['death.gusto'], 'the boss\'s first');
  assert.deepEqual(linesFor('death', {}, new Set(), table, 1).map(l => l.id), ['death.first'], 'then the lead');
  const told = new Set(['death.first', 'death.gusto']);
  const order = seed => { const t = new Set(told), out = []; for (let l; (l = linesFor('death', {}, t, table, seed)[0]); t.add(l.id)) out.push(l.id); return out; };
  assert.equal(order(1).length, 8, 'all of them, one by one');
  assert.deepEqual(order(1), order(1), 'the same in the same world');
  assert.ok([2, 3, 4, 5].some(seed => order(seed).join() !== order(1).join()), 'another order in another world');
});

test('when: a value, a list of values, or a range of numbers', () => {
  assert.ok(fits({ boss: 'gusto' }, { boss: 'gusto', what: 'start' }));
  assert.ok(!fits({ boss: 'gusto' }, { boss: 'totnar' }));
  assert.ok(fits({ theme: ['clouds', 'lagoon'] }, { theme: 'lagoon' }));
  assert.ok(fits({ depth: [1, 6] }, { depth: 3 }) && !fits({ depth: [1, 6] }, { depth: 7 }));
  assert.ok(fits(undefined, { anything: 1 }));
});

test('the robot is paced: the less a moment matters, the longer it keeps quiet first; the story never waits', () => {
  assert.equal(ROBOT_REST.length, 4);
  for (let p = 1; p < 3; p++) assert.ok(ROBOT_REST[p] < ROBOT_REST[p - 1], `pri ${p}`);
  assert.equal(ROBOT_REST[3], 0);
  assert.ok(ROBOT_REST[0] >= 60 && ROBOT_REST[1] >= 30, 'chatter and what happens leave long pauses');
  assert.ok(!robotMayTalk(0, 30) && robotMayTalk(0, ROBOT_REST[0]));
  assert.ok(!robotMayTalk(2, 1) && robotMayTalk(2, ROBOT_REST[2]));
  assert.ok(robotMayTalk(3, 0), 'its hello, a depth, an arena, a boss beaten');
  // every robot line's moment has a priority the pacing knows
  for (const l of LINES.filter(l => l.voice === 'robot')) assert.ok(MOMENTS[l.on].pri in ROBOT_REST, l.id);
});

test('the glassmaker\'s recordings: each has lines, in his voice, worn, and is heard once one of them is', () => {
  for (const r of RECORDINGS) {
    const lines = recordingLines(r.id);
    assert.ok(lines.length >= 2, r.id);
    for (const l of lines) { assert.equal(l.voice, 'glassmaker', l.id); assert.equal(l.worn, true, l.id); }
  }
  assert.deepEqual(recordingsHeard(new Set()), []);
  assert.deepEqual(recordingsHeard(new Set([recordingLines('camp')[1].id])).map(r => r.id), ['camp']);
  // every line is one of his recordings' or the robot's (the old narrator's lines went with the old story)
  assert.deepEqual(LINES.filter(l => l.on === 'recording' ? l.voice !== 'glassmaker' : l.voice !== 'robot').map(l => l.id), []);
  // the memories are his: the robot's lines are in none of them
  const robot = LINES.filter(l => l.on === 'robot');
  assert.ok(robot.length > 0);
  assert.deepEqual(recordingsHeard(new Set(robot.map(l => l.id))), []);
  assert.ok(RECORDINGS.every(r => recordingLines(r.id).every(l => l.voice === 'glassmaker')));
});

test('the robot says hello in its own voice, live, and the world keeps that it came', () => {
  const hello = linesFor('robot', { what: 'hello' });
  assert.ok(hello.length >= 2, 'a scene, said whole');
  for (const l of hello) { assert.equal(l.voice, 'robot', l.id); assert.ok(!l.worn, l.id); }
  assert.ok(MOMENTS.robot.whole, 'told as it begins: what keeps that it came, with the narrator off too');
});

test('what the narrator said is saved with the world', () => {
  const w = createWorld(7, { id: 'w-told' });
  w.run.told = ['opening.looked-like', 'depth.1.summer', 3];
  assert.deepEqual(checkWorld(JSON.parse(JSON.stringify(w))).run.told, ['opening.looked-like', 'depth.1.summer']);
  assert.deepEqual(checkWorld({ ...w, run: { ...w.run, told: undefined } }).run.told, []);
});

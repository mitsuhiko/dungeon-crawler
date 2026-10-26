import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { repo } from './paths.js';
import { loadScore, voicesIn, MOODS } from '../src/audio/score.js';
import { SONGS } from '../src/themes/index.js';
import { BOSS_MUSIC } from '../src/core/bossmusic.js';
import { gustoMusic } from '../src/core/gusto.js';

const BOSS_SONGS = Object.values(BOSS_MUSIC).map(m => m.song);

const dir = resolve(repo, 'music');
// the game's songs, plus scores in subfolders (tools/player.html FOLDERS): the jingles, the films
const files = readdirSync(dir, { recursive: true }).filter(f => f.endsWith('.scrim'));

test('the game finds its songs', () => {
  for (const name of SONGS) assert.ok(files.includes(`${name}.scrim`), name);
  // and plays every song in music/ (subfolders hold the jingles and reference scores)
  assert.deepEqual(files.filter(f => !f.includes('/')).map(f => f.replace('.scrim', '')).sort(), [...SONGS].sort());
});

test('every score in a subfolder is listed for the player', () => {
  for (const sub of new Set(files.filter(f => f.includes('/')).map(f => f.split('/')[0]))) {
    const index = JSON.parse(readFileSync(resolve(dir, sub, 'index.json'), 'utf8')).map(e => `${sub}/${e.file}`);
    assert.deepEqual(index.sort(), files.filter(f => f.startsWith(`${sub}/`)).sort());
  }
});

for (const file of files) {
  test(`music/${file} compiles and loops`, () => {
    const { song, moods, names, stings, stingVoices, errors } = loadScore(readFileSync(resolve(dir, file), 'utf8'));
    assert.deepEqual(errors, []);
    assert.ok(song.loop.dur > 0, 'has a loop');
    for (const mood of names) assert.ok(moods[mood].size, `mood ${mood} plays something`);
    // every voice plays somewhere, and in some mood (or in a sting)
    const used = new Set([...song.intro.events, ...song.loop.events, ...Object.values(stings).flatMap(s => s.events)].map(e => e.v));
    for (const [i, v] of song.voices.entries()) {
      assert.ok(used.has(i), `voice ${v.name} plays`);
      assert.ok(stingVoices.has(i) || names.some(m => moods[m].has(i)), `voice ${v.name} is in a mood`);
    }
  });
}

test('combat layers stay out of calmer moods and drive every bar', () => {
  for (const name of SONGS.filter(name => name !== 'town' && name !== 'title' && !BOSS_SONGS.includes(name))) {
    const { song, moods, given } = loadScore(readFileSync(resolve(dir, `${name}.scrim`), 'utf8'));
    for (const mood of ['fight', 'boss']) {
      assert.ok(given.includes(mood), `${name}: explicit ${mood} arrangement`);
      assert.ok(moods[mood].size <= 12, `${name}: ${mood} leaves room in the mix`);
    }
    for (const voice of ['drive', 'war']) {
      const i = song.voices.findIndex(v => v.name === voice);
      assert.ok(i >= 0, `${name}: has ${voice}`);
      assert.equal(song.voices[i].drum, voice === 'war');
      for (const mood of MOODS) {
        assert.equal(moods[mood].has(i), mood === 'fight' || mood === 'boss', `${name}: ${voice} in ${mood}`);
      }
      for (const timeline of [song.intro, song.loop]) {
        for (const [s, section] of timeline.sections.entries()) {
          const events = timeline.events.filter(e => e.v === i && e.s === s);
          for (let bar = 0; bar < section.bars; bar++) {
            const start = section.start + bar * section.barDur;
            const hits = events.filter(e => e.t >= start - 1e-6 && e.t < start + section.barDur - 1e-6);
            assert.ok(hits.length >= section.beats * 2, `${name}: ${voice} drives ${section.name} bar ${bar + 1}`);
            assert.ok(hits.some(e => e.vel >= 1), `${name}: ${voice} accents each bar`);
            // Joining combat mid-bar must not wait through a long rest for either layer.
            const onsets = [...hits.map(e => e.t), hits[0].t + section.barDur];
            for (let h = 1; h < onsets.length; h++) {
              assert.ok(onsets[h] - onsets[h - 1] <= 60 / section.tempo + 1e-6, `${name}: ${voice} responds within a beat`);
            }
            if (voice === 'drive') assert.ok(hits.every(e => e.m.length === 1), `${name}: a clear single-note ostinato`);
          }
        }
      }
    }
  }
});

test('moods build on earlier moods and fall back', () => {
  const text = 'beats 1\nvoice a sine\nvoice b kick\nvoice c sine\n'
    + '# mood explore: a c\n# mood sense: explore b -a\n# mood boss: d\n'
    + 'pattern A\na | C4--- |\nb | x... |\nc | E4--- |\nloop A\n';
  const { moods, errors } = loadScore(text);
  assert.deepEqual([...moods.explore], [0, 2]);
  assert.deepEqual([...moods.sense].sort(), [1, 2]);
  assert.equal(moods.treasure, moods.explore);
  assert.equal(moods.fight, moods.sense);   // fight -> rise -> sense
  assert.deepEqual(errors, ['line 7: mood boss names "d", which is neither a voice nor an earlier mood']);
});

test('a score needs an explore mood', () => {
  const { errors } = loadScore('beats 1\nvoice a sine\n# mood calm: a\npattern A\na | C4--- |\nloop A\n');
  assert.deepEqual(errors, ['line 3: unknown mood "calm" (moods: explore treasure sense rise fight boss)',
    'the score has no "# mood explore:" line']);
});

test('a boss song has his fight\'s moods, each its own, and few voices at once', () => {
  for (const { song: name, moods: want } of Object.values(BOSS_MUSIC)) {
    const { moods, names, given } = loadScore(readFileSync(resolve(dir, `${name}.scrim`), 'utf8'));
    assert.deepEqual(names, want, `${name}: "# moods:" names the fight's moods`);
    assert.deepEqual(given, want, `${name}: every mood written out`);
    const sets = want.map(m => [...moods[m]].sort().join());
    assert.equal(new Set(sets).size, sets.length, `${name}: every phase sounds different`);
    for (const m of want) assert.ok(moods[m].size <= 12, `${name}: ${m} leaves room in the mix`);
  }
});

test('a score may name its own moods and stings', () => {
  const text = 'beats 1\nvoice a sine\nvoice b kick\nvoice hit gong\n'
    + '# moods: calm wild\n# mood calm: a\n# mood wild: calm b\n# sting wild: bang\n'
    + 'pattern A\na | C4--- |\nb | x... |\npattern bang\nhit | X... |\nloop A\n';
  const score = loadScore(text);
  assert.deepEqual(score.errors, []);
  assert.deepEqual(score.names, ['calm', 'wild']);
  assert.equal(score.base, 'calm');
  assert.deepEqual([...score.moods.wild].sort(), [0, 1]);
  assert.deepEqual([...score.stingVoices], [2]);
  assert.equal(score.stings.wild.events.length, 1);
  assert.equal(score.song.loop.events.some(e => e.v === 2), false);   // a sting is not in the loop
  assert.deepEqual([...voicesIn(score, 'explore')], [0]);          // a mood it does not know: its base
  const bad = loadScore(text.replace('# mood calm: a', '# mood calm: a hit').replace('# sting wild: bang', '# sting wild: nope\n# sting dull: bang'));
  assert.deepEqual(bad.errors, ['line 8: There\'s no pattern called "nope".', 'line 9: a sting for unknown mood "dull" (moods: calm wild)']);
  const mixed = loadScore(text.replace('# mood calm: a', '# mood calm: a hit'));
  assert.deepEqual(mixed.errors, ['voice "hit" plays in a sting and in mood calm: a sting\'s voices play in no mood']);
});

test('a glide comes from the note before it', () => {
  const { song } = loadScore('beats 1\nvoice a sine\n# mood explore: a\npattern A\na | C4- ~E4- |\nloop A\n');
  assert.deepEqual(song.loop.events.map(e => e.g), [undefined, 60]);
});

test('Gusto\'s music follows his fight', () => {
  const gusto = (o = {}) => ({ mode: 'idle', hp: 1000, profile: { hp: 1000 }, ...o });
  const seen = new Set();
  assert.equal(gustoMusic(gusto(), 0, seen), 'lurk');
  assert.equal(gustoMusic(gusto({ mode: 'chase' }), 0, seen), 'phase1');
  assert.equal(gustoMusic(gusto({ hp: 900 }), 0, seen), 'phase1');           // hurt, even back home
  assert.equal(gustoMusic(gusto({ mode: 'split', hp: 500 }), 0, seen), 'split');
  assert.equal(gustoMusic(gusto({ mode: 'chase', hp: 500 }), 2, seen), 'phase2');
  assert.equal(gustoMusic(gusto({ mode: 'gone', hp: 500 }), 0, seen), 'gone');
  // alone again at his split's health, between his proxies going and his vanishing
  assert.equal(gustoMusic(gusto({ mode: 'chase', hp: 500 }), 0, seen), 'phase1');
  assert.equal(gustoMusic(gusto({ mode: 'chase', hp: 500 }), 0, new Set(['split'])), 'phase2');
});

test('the boss fanfare is short and plays once', () => {
  const { song, errors } = loadScore(readFileSync(resolve(dir, 'jingles/victory.scrim'), 'utf8'));
  assert.deepEqual(errors, []);
  assert.equal(song.intro.dur, 0, 'all in the loop, which audio/jingles.js plays once');
  assert.ok(song.loop.dur > 3 && song.loop.dur < 7, `${song.loop.dur} s`);
});

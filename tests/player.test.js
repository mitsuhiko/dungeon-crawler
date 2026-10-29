import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOUND_NAMES } from '../src/audio/sfx.js';
import { VOICE_KINDS } from '../src/audio/voices.js';
import { SFX_GROUPS } from '../tools/player-sounds.js';

// tools/player.html lists the effects in groups, the voices by species
test('the player lists every sound effect in one group', () => {
  const voice = new RegExp(`_(${VOICE_KINDS.join('|')})$`);
  const effects = SOUND_NAMES.filter(n => !voice.test(n));
  const listed = SFX_GROUPS.flatMap(([, names]) => names);
  assert.equal(new Set(listed).size, listed.length, 'listed twice');
  assert.deepEqual([...listed].sort(), [...effects].sort());
});

// every sound the game plays by name exists (sfx('land') once crashed the robot's rescue: without
// audio, as in the checks, sfx returns before it looks the sound up)
test('every sound effect the game plays by its name is there', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const files = (await readdir(new URL('../src/', import.meta.url), { recursive: true })).filter(f => f.endsWith('.js'));
  const missing = [];
  for (const f of files) {
    const src = await readFile(new URL('../src/' + f, import.meta.url), 'utf8');
    for (const [, name] of src.matchAll(/\bsfx\(\s*'([^']+)'/g)) if (!SOUND_NAMES.includes(name)) missing.push(`${f}: ${name}`);
  }
  assert.deepEqual(missing, []);
});

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

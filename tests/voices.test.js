import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voices, VOICE_KINDS } from '../src/audio/voices.js';
import { ENEMY_PROFILES, BOSS_PROFILES, MINION_PROFILES } from '../src/core/enemies.js';
import { WARD_KIND } from '../src/core/tasks.js';

test('every enemy species has an alert, a wind-up and a death voice', () => {
  const v = voices({ amp() {}, noise() {}, filter() {}, tone() {}, sweep() {} });
  for (const { species } of [...ENEMY_PROFILES, ...BOSS_PROFILES, ...MINION_PROFILES, WARD_KIND]) for (const k of VOICE_KINDS)
    assert.equal(typeof v[`${species}_${k}`], 'function', `${species}_${k}`);
});

// The Bolime (core/enemies.js BOLIME): see-through, it only hops, and its pounce comes down where
// its shadow lies and swallows whoever is under it (game/engulf.js; tests/browser/bolime.js plays
// it out); it lives only in the slime marsh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOLIME, TOXIC_BOLIME, GLOW_BOLIME, ENEMY_KINDS, fireAt, airborne } from '../src/core/enemies.js';
import { DEPTH_SPAWNS, population } from '../src/core/spawns.js';
import { themeById } from '../src/themes/depth.js';

test('the Bolime pounces: its shadow, a leap, down at the hit frame, holding, then spitting out', () => {
  const [a] = BOLIME.attacks, g = a.engulf;
  assert.ok(a.ride?.onto && a.beam?.kind === 'stomp' && a.beam.aim === 'feet', 'onto its shadow');
  assert.ok(fireAt(a) < a.ride.from && a.ride.from < a.hitAt, 'the shadow first, then the leap');
  assert.ok(Math.abs(fireAt(a) + a.beam.time - a.hitAt) < 1e-9, 'it lands as the shadow bursts');
  const e = { mode: 'attack', attack: 0, t: (a.ride.from + a.hitAt) / 2, profile: BOLIME };
  assert.ok(airborne(e), 'up in the air while it leaps');
  assert.ok(g.release > a.hitAt + 2 && g.release < a.attackTime, 'it holds a few seconds, then spits out');
  // walking out is possible before it spits you out; jumping only a little quicker
  assert.ok(g.walk < g.release - a.hitAt, 'one can walk out');
  assert.ok(g.jump > 0 && g.jump * 5 < 1 / g.walk * 2, 'jumping helps, a little');
  assert.ok(g.slow < 0.5 && g.bite > 0 && g.share < 1);
  assert.ok(BOLIME.slimeborn && BOLIME.shell?.parts.includes('BolimeSkin') && BOLIME.shell.opacity < 1, 'see-through slime');
  assert.ok(BOLIME.hops !== undefined && BOLIME.height > 1.4, 'a hopper big enough to fit the hero');
  // the kinds keep the pounce, with their own words
  for (const k of [TOXIC_BOLIME, GLOW_BOLIME]) {
    assert.equal(k.attacks[0].engulf.release, g.release);
    assert.match(k.attacks[0].engulf.reason, new RegExp(k.label));
  }
  assert.ok(TOXIC_BOLIME.toxin && GLOW_BOLIME.hp > TOXIC_BOLIME.hp);
});

const MARSH = (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(themeById('slime').depths);
test('Bolimes live only in the slime marsh, at every depth it may appear at', () => {
  const rows = DEPTH_SPAWNS.flatMap((d, depth) => d.roster.map(r => ({ ...r, depth }))).filter(r => r.type === 'bolime');
  assert.deepEqual(rows.map(r => r.depth), MARSH);
  for (const r of rows) {
    assert.deepEqual(r.where, ['slime']);
    for (const k of Object.keys(r.kinds)) assert.equal(ENEMY_KINDS[k].species, 'bolime');
  }
});

// (the Toxic squirtles in its acid take a share of the marsh's cubes from them: core/spawns.js)
test('a slime marsh cube mostly has Slugs or Bolimes, a cube anywhere else never', () => {
  const cube = (seed, depth, biome) => population({ seed, depth, key: `${seed},-${depth},0`, biome });
  let slimy = 0;
  for (let seed = 0; seed < 200; seed++) for (const depth of MARSH) {
    const marsh = cube(seed, depth, 'slime'), flats = cube(seed, depth, depth % 2 ? 'swamp' : 'roots');
    if (marsh.has('slug') || marsh.has('bolime')) slimy++;
    assert.ok(!flats.has('slug') && !flats.has('bolime'));
  }
  assert.ok(slimy > 140 * MARSH.length, `${slimy} of ${200 * MARSH.length}`);
});

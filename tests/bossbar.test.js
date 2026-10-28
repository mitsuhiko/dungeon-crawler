import { test } from 'node:test';
import assert from 'node:assert/strict';
import './fixtures.js';
import { bossBarred, bossOf, bossFill, bossTitle, trailStep, TRAIL } from '../src/core/bossbar.js';
import { GUSTO, DESCENT_GUARDIAN_KINDS, GUARDIAN_KINDS, enemyProfile } from '../src/core/enemies.js';

const body = (o = {}) => ({ id: 'e', x: 0, z: 0, mode: 'chase', hp: 100, level: 1, profile: { hp: 100, type: 'spider' }, ...o });
const boss = o => body({ guardian: true, guardianRole: 'descent', ...o });
const at = { x: 0, z: 0 };

test('a descent guardian, a real boss or a Temp Boss, has the bar; a side guardian and the others not', () => {
  assert.ok(bossBarred(boss({ boss: 'gusto' })));
  assert.ok(bossBarred(boss({ bossPlaceholder: true })));
  assert.ok(bossBarred(boss({ proxy: true })), 'a proxy shows nothing over its head either');
  assert.ok(!bossBarred(body({ guardian: true, guardianRole: 'side' })));
  assert.ok(!bossBarred(body({ summoned: true })));
  assert.ok(!bossBarred(body()));
  assert.ok(!bossBarred(null));
});

test('the bar follows the real boss: not a proxy, a side guardian, a minion or the dead', () => {
  const real = boss({ id: 'gusto', x: 9 }), proxy = boss({ id: 'p', proxy: true, x: 1 });
  const side = body({ guardian: true, guardianRole: 'side' }), minion = body({ summoned: true });
  assert.equal(bossOf([proxy, side, minion, real], at), real);
  assert.equal(bossOf([proxy, side, minion], at), null);
  assert.equal(bossOf([boss({ mode: 'dead', hp: 0 })], at), null);
  assert.equal(bossOf([boss({ hp: 0 })], at), null);
  // vanished (Gusto between his proxies) he is still the one shown
  const gone = boss({ mode: 'gone' });
  assert.equal(bossOf([gone, proxy], at), gone);
});

test('of several bosses (dev spawns) the nearest', () => {
  const far = boss({ id: 'far', x: 8 }), near = boss({ id: 'near', z: -3 });
  assert.equal(bossOf([far, near], at), near);
  assert.equal(bossOf([far, near], { x: 7, z: 0 }), far);
});

test('how full: his health of his profile, kept to 0..1', () => {
  assert.equal(bossFill(boss({ hp: 25 })), 0.25);
  assert.equal(bossFill(boss({ hp: -5 })), 0);
  assert.equal(bossFill(boss({ hp: 150 })), 1);
});

test('the title over the bar: the boss by name, a Temp Boss by its kind, with the level', () => {
  const gusto = enemyProfile(GUSTO, 1);
  assert.equal(bossTitle({ guardianRole: 'descent', profile: gusto, level: 1 }), '♛ Gusto · Lv 1');
  const temp = DESCENT_GUARDIAN_KINDS.spider;
  assert.equal(bossTitle({ guardianRole: 'descent', profile: temp, level: 3 }), `♛ Temp Boss ${temp.baseLabel} · Lv 3`);
  assert.ok(Object.values(DESCENT_GUARDIAN_KINDS).every(k => bossBarred(k)), 'every Temp Boss has the bar');
  assert.ok(Object.values(GUARDIAN_KINDS).every(k => !bossBarred(k)), 'side guardians keep their own bar');
});

test('the damage strip: holds after a hit, then eases down to the fill', () => {
  let t = trailStep(null, 1, 0);
  assert.equal(t.at, 1);
  t = trailStep(t, 0.8, 1 / 60);   // a hit
  assert.equal(t.at, 1);
  for (let s = 0; s < TRAIL.hold - 0.05; s += 1 / 60) t = trailStep(t, 0.8, 1 / 60);
  assert.equal(t.at, 1, 'still standing while it holds');
  for (let s = 0; s < 1.2; s += 1 / 60) t = trailStep(t, 0.8, 1 / 60);
  assert.equal(t.at, 0.8, 'down to the fill');
});

test('the damage strip: a combo makes one chunk, but it does not stand for good', () => {
  let t = trailStep(null, 1, 0);
  let fill = 1, time = 0;
  // a hit every 0.3 s: each starts the hold again, so the strip stands at 1 ...
  while (time < 0.9) { fill -= 0.05; for (let s = 0; s < 0.3; s += 1 / 60) { t = trailStep(t, fill, 1 / 60); time += 1 / 60; } }
  assert.equal(t.at, 1, 'one chunk');
  // ... but after `most` s it follows anyway
  while (time < 3) { fill -= 0.02; for (let s = 0; s < 0.3; s += 1 / 60) { t = trailStep(t, fill, 1 / 60); time += 1 / 60; } }
  assert.ok(t.at < 0.9, 'a long stream of hits does not hold it up: ' + t.at);
});

test('the damage strip: health coming back takes it up at once; calm, it goes with the fill', () => {
  let t = trailStep(null, 0.4, 0);
  t = trailStep(t, 0.3, 1 / 60);
  t = trailStep(t, 0.9, 1 / 60);   // Renew's rewind
  assert.equal(t.at, 0.9);
  t = trailStep(t, 0.5, 1 / 60, true);
  assert.equal(t.at, 0.5);
});

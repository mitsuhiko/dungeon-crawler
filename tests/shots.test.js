import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerStats } from '../src/core/progression.js';
import { addItem, equipItem } from '../src/core/inventory.js';
import { SPIDER, STUNDER, makeEnemy } from '../src/core/enemies.js';
import { swordState, combatStats, startSwing, advanceSwing, cancelSwing, swingClipTime, swingClipFrom, crossbowLoaded,
  reloadTime, softTarget, weaponHit, shotDue, inSwordArc, KINDS, SHOOT_CLIP, CROSSBOW_CLIP, CAST_CLIP, SLASH_CLIP } from '../src/core/combat.js';
import { SHOTS, MUZZLES, BURST_SHARE, CHAIN_REACH, launchShot, stepShot, burstTargets, chainTargets, chainShare, shotView, shotOrigin,
  aimPoint } from '../src/core/shots.js';

const hero = id => {
  const p = { ...createPlayerStats(), x: 0, y: 0, z: 0, yaw: 0, stun: 0, sword: swordState() };
  if (id) { addItem(p.inventory, id); equipItem(p.inventory, p.inventory.slots.find(s => s?.itemId === id).instanceId); }
  return p;
};
const open = () => false;

test('each kind has its clip, and attack times map onto its frames', () => {
  assert.deepEqual(Object.keys(KINDS), ['sword', 'flail', 'bow', 'crossbow', 'staff', 'trident', 'zap', 'throw']);
  for (const [id, clip] of [['weapon_bow_recurve', SHOOT_CLIP], ['weapon_crossbow_light', CROSSBOW_CLIP], ['weapon_staff_oak', CAST_CLIP],
    ['weapon_sword_medium', SLASH_CLIP], ['weapon_flail_twin', SLASH_CLIP]]) {
    const s = combatStats(hero(id));
    assert.equal(KINDS[s.kind].clip, clip);
    assert.ok(s.activeStart < s.activeEnd && s.activeEnd <= s.moveCancel && s.moveCancel < s.chain && s.chain <= s.duration, id);
    assert.equal(swingClipTime(s, 0), 0);
    assert.ok(Math.abs(swingClipTime(s, s.activeStart) - clip.activeStart) < 1e-9, 'the shot leaves on the clip frame');
    assert.ok(Math.abs(swingClipTime(s, s.duration) - clip.duration) < 1e-9);
  }
  // a chained bow shot starts with the bow up
  const p = hero('weapon_bow_short');
  assert.ok(startSwing(p)); assert.equal(swingClipFrom(p.sword), 0);
  advanceSwing(p, p.sword.stats.chain); assert.ok(p.sword.active && startSwing(p));
  assert.equal(p.sword.chained, true); assert.equal(swingClipFrom(p.sword), SHOOT_CLIP.redraw);
  assert.equal(swingClipTime(p.sword.stats, 0, SHOOT_CLIP.redraw), SHOOT_CLIP.redraw);
});

test('a crossbow is empty from its shot until the reload lays a bolt, even when moving cut it short', () => {
  const p = hero('weapon_crossbow_heavy'), s = p.sword;
  assert.ok(crossbowLoaded(p));
  startSwing(p); advanceSwing(p, s.stats.activeStart + 0.001); assert.ok(shotDue(p)); s.fired = true;
  assert.equal(crossbowLoaded(p), false);
  const r = reloadTime(s.stats);
  assert.ok(r > s.stats.activeEnd && r < s.stats.chain, 'loaded again before the next shot may start');
  advanceSwing(p, r - s.t - 0.01); assert.equal(crossbowLoaded(p), false);
  cancelSwing(p);   // walked away: the cooldown still runs
  advanceSwing(p, 0.02); assert.equal(crossbowLoaded(p), true);
});

test('a shot flies from the body at the weapon\'s height straight at the middle of its target', () => {
  const p = hero('weapon_bow_hunting'), stats = combatStats(p);
  const e = makeEnemy({ x: 3, y: 0, z: 4 }, STUNDER), shot = launchShot(p, stats, e, Math.atan2(3, 4));
  assert.equal(shot.kind, 'arrow'); assert.equal(shot.spec, SHOTS.arrow);
  assert.deepEqual([shot.x, shot.y, shot.z], [0, MUZZLES.bow[1], 0]);
  const a = aimPoint(e), v = Math.hypot(shot.vx, shot.vy, shot.vz);
  assert.ok(Math.abs(v - SHOTS.arrow.speed) < 1e-9);
  assert.ok(Math.abs(shot.vx / shot.vz - 3 / 4) < 1e-9 && Math.abs(shot.vy / Math.hypot(shot.vx, shot.vz) - (a.y - shot.y) / 5) < 1e-9);
  // drawn from the bow, catching up with the true line
  assert.notDeepEqual(shotView(shot), [shot.x, shot.y, shot.z]);
  stepShot(shot, SHOTS.arrow.catchUp, [], open);
  assert.deepEqual(shotView(shot), [shot.x, shot.y, shot.z]);
  // no target: straight ahead, level
  const ahead = launchShot(p, stats, null, Math.PI / 2);
  assert.ok(Math.abs(ahead.vx - SHOTS.arrow.speed) < 1e-9 && Math.abs(ahead.vy) < 1e-12 && Math.abs(ahead.vz) < 1e-9);
});

test('arrows stop at the first enemy, bolts pierce, walls and range stop everything', () => {
  const line = () => [1.5, 2.5, 3.5].map(z => makeEnemy({ x: 0, y: 0, z }, STUNDER));
  const fly = (id, enemies, solid = open, t = 2) => {
    const p = hero(id), shot = launchShot(p, combatStats(p), null, 0), hits = [];
    let end = null;
    for (let i = 0; i < t * 60 && !end; i++) { const r = stepShot(shot, 1 / 60, enemies, solid); hits.push(...r.hits); end = r.end; }
    return { shot, hits, end };
  };
  let r = fly('weapon_bow_long', line());
  assert.equal(r.end, 'hit'); assert.equal(r.hits.length, 1); assert.equal(r.hits[0].z, 1.5);
  r = fly('weapon_crossbow_light', line());   // pierces one
  assert.equal(r.end, 'hit'); assert.deepEqual(r.hits.map(e => e.z), [1.5, 2.5]);
  r = fly('weapon_crossbow_arbalest', line());   // through two, stops in the third
  assert.deepEqual(r.hits.map(e => e.z), [1.5, 2.5, 3.5]); assert.equal(r.end, 'hit');
  r = fly('weapon_crossbow_arbalest', []);
  assert.equal(r.end, 'spent');
  assert.ok(Math.abs(r.shot.travelled - combatStats(hero('weapon_crossbow_arbalest')).range) < 0.1);
  const dead = line(); dead[0].mode = 'dead';
  assert.deepEqual(fly('weapon_bow_long', dead).hits.map(e => e.z), [2.5], 'flies through corpses');
  r = fly('weapon_bow_long', line(), (x, y, z) => z > 0.6);
  assert.equal(r.end, 'blocked'); assert.equal(r.hits.length, 0);
  // over a spider's head at chest height? No: it aims at the body, so it hits it
  const p = hero('weapon_bow_short'), spider = makeEnemy({ x: 0, y: 0, z: 2 }, SPIDER), shot = launchShot(p, combatStats(p), spider, 0);
  let hit = null;
  for (let i = 0; i < 60 && !hit; i++) hit = stepShot(shot, 1 / 60, [spider], open).end;
  assert.equal(hit, 'hit');
  // an enemy pressed up against you is hit too (the shot starts in the middle of the body)
  const close = makeEnemy({ x: 0, y: 0, z: 0.3 }, STUNDER), s2 = launchShot(hero('weapon_staff_oak'), combatStats(hero('weapon_staff_oak')), close, 0);
  assert.deepEqual(stepShot(s2, 1 / 60, [close], open).hits, [close]);
});

test('a spell bursts where it ends, hurting the others around it for a share of its damage', () => {
  const p = hero('weapon_staff_arcane'), stats = combatStats(p);
  const target = makeEnemy({ x: 0, y: 0, z: 3 }, STUNDER), near = makeEnemy({ x: 0.6, y: 0, z: 3.5 }, SPIDER),
    far = makeEnemy({ x: 3, y: 0, z: 3 }, SPIDER), shot = launchShot(p, stats, target, 0);
  let end = null;
  for (let i = 0; i < 120 && !end; i++) end = stepShot(shot, 1 / 60, [target, near, far], open).end;
  assert.equal(end, 'hit');
  assert.deepEqual(burstTargets(shot, [target, near, far]), [near]);
  const before = near.hp, hit = weaponHit(p, stats, near, 1, BURST_SHARE);
  assert.equal(hit.damage, Math.round(stats.damage * BURST_SHARE)); assert.equal(near.hp, Math.max(0, before - hit.damage));
  assert.deepEqual(burstTargets(launchShot(hero('weapon_bow_long'), combatStats(hero('weapon_bow_long')), null), [near]), [], 'arrows do not burst');
});

test('lightning strikes at once and jumps on to the nearest enemies, each for less', () => {
  const p = hero('weapon_staff_lightning'), stats = combatStats(p);
  assert.equal(stats.kind, 'staff'); assert.equal(stats.jumps, 2); assert.equal(stats.burst, 0);
  const target = makeEnemy({ x: 0, y: 0, z: 3 }, STUNDER), a = makeEnemy({ x: 1.2, y: 0, z: 3.4 }, SPIDER),
    b = makeEnemy({ x: 2.6, y: 0, z: 3.6 }, SPIDER), c = makeEnemy({ x: 3.9, y: 0, z: 3.6 }, SPIDER),
    away = makeEnemy({ x: -3 - CHAIN_REACH, y: 0, z: 3 }, SPIDER), shot = launchShot(p, stats, target, 0);
  assert.equal(shot.kind, 'lightning');
  assert.deepEqual(shotOrigin(shot), [shot.x + shot.from[0], shot.y + shot.from[1], shot.z + shot.from[2]], 'drawn from the staff');
  let end = null, steps = 0, hits = [];
  for (; steps < 120 && !end; steps++) ({ end, hits } = stepShot(shot, 1 / 60, [target, a, b, c, away], open));
  assert.equal(end, 'hit'); assert.deepEqual(hits, [target]);
  assert.ok(steps <= 4, `there almost at once (${steps} frames)`);
  // the nearest to the one before, as many as the staff says; not through walls
  assert.deepEqual(chainTargets(shot, [target, a, b, c, away], target), [a, b]);
  assert.ok(!chainTargets(shot, [target, a, b, c, away], target, (x, y) => y !== a).includes(a), 'the level in the way');
  assert.deepEqual(chainTargets(shot, [target, a, b, c, away], target, () => false), []);
  assert.deepEqual(chainTargets({ ...shot, stats: { ...stats, jumps: 9 } }, [target, a, b, c, away], target), [a, b, c]);
  assert.ok(chainShare(0) < 1 && chainShare(1) < chainShare(0));
  assert.deepEqual(chainTargets(launchShot(hero('weapon_staff_oak'), combatStats(hero('weapon_staff_oak')), target), [a], target), [],
    'spells do not jump');
});

test('a trident stabs through what is in a line close up, and throws lightning at what is further off', () => {
  const p = hero('weapon_trident_sea'), s = p.sword;
  const near = makeEnemy({ x: 0, y: 0, z: 1 }, SPIDER), behind = makeEnemy({ x: 0.1, y: 0, z: 1.5 }, SPIDER),
    aside = makeEnemy({ x: 1, y: 0, z: 0.6 }, SPIDER), far = makeEnemy({ x: 0, y: 0, z: 4 }, STUNDER);
  // asked about nothing in particular (how far to walk up, what to aim at): its lightning
  const zap = combatStats(p);
  assert.equal(zap.kind, 'zap'); assert.ok(zap.ranged && zap.range > 4 && zap.shot === 'lightning');
  const stab = combatStats(p, near);
  assert.equal(stab.kind, 'trident'); assert.ok(!stab.ranged && stab.range < 2 && zap.damage < stab.damage);
  assert.equal(combatStats(p, null).kind, 'trident', 'ahead: a stab');
  assert.equal(combatStats(p, { x: 0, z: 9 }).kind, 'trident', 'a point: a stab');
  assert.equal(combatStats(p, far).kind, 'zap');
  // the stab goes through both in the line, not the one aside
  s.target = near; assert.ok(startSwing(p)); assert.equal(s.stats.kind, 'trident');
  advanceSwing(p, s.stats.activeStart + 0.001);
  assert.ok(inSwordArc(p, near) && inSwordArc(p, behind)); assert.equal(inSwordArc(p, aside), false);
  advanceSwing(p, s.stats.duration); cancelSwing(p, true);
  // the lightning leaves the prongs at activeStart and strikes almost at once
  s.target = far; assert.ok(startSwing(p)); assert.equal(s.stats.kind, 'zap');
  advanceSwing(p, s.stats.activeStart + 0.001); assert.ok(shotDue(p));
  const shot = launchShot(p, s.stats, far);
  assert.equal(shot.kind, 'lightning'); assert.deepEqual(MUZZLES.zap, MUZZLES.trident);
  let end = null;
  for (let i = 0; i < 10 && !end; i++) end = stepShot(shot, 1 / 60, [far], open).end;
  assert.equal(end, 'hit');
});

test('ranged soft-targeting reaches as far as the weapon shoots and up and down ledges', () => {
  const p = hero('weapon_bow_long'), far = makeEnemy({ x: 0, y: 0, z: 7 }, STUNDER), high = makeEnemy({ x: 1, y: 1.5, z: 2 }, SPIDER);
  assert.equal(softTarget(p, [far]), far);
  assert.equal(softTarget(p, [high]), high, 'a bow shoots up onto a ledge');
  assert.equal(softTarget(hero('weapon_sword_long'), [far, high]), null, 'a sword reaches neither');
  assert.equal(softTarget(p, [makeEnemy({ x: 0, y: 0, z: 9 }, STUNDER)]), null, 'beyond its range');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPIDER, STUNDER, SNAKE, OCTONAUT, FIREFACE, TRIANGLE, FIRECAT, SHRAPS, FIRE_SHRAPS, SPICY, WOLK, MECKED, TORNADO, ENEMY_KINDS, GUSTO, makeEnemy, attackOf, pickAttack,
  attacksInReach, isRanged, attackDamage, blowOf, lungeDistance, lungeAt, retreatAt, fireAt, shotOf, airborne } from '../src/core/enemies.js';
import { launchTwister, stayTwister, stepTwister, twisterAt, catches, twirlAt } from '../src/core/twisters.js';
import { startBeam, aimBeam, castBeam, beamHits, beamDistance, muzzleAt, aiming, aimPoint } from '../src/core/beams.js';
import { launch, touches, stepProjectile, ignite, burnStep, burntOut, chillFrom, chillStep, chillFactor, THAW } from '../src/core/projectiles.js';
import { SWORD, HEAVY_HIT, swordState, startSwing, advanceSwing, cancelSwing, inSwordArc, swordHit, softTarget, damageEnemy } from '../src/core/combat.js';

const hero = () => ({ x: 0, y: 0, z: 0, yaw: 0, hp: 100, stun: 0, sword: swordState() });
const enemy = (profile = SPIDER) => makeEnemy({ x: 0, y: 0, z: 0.8, yaw: Math.PI }, profile);
function swing(p) { assert.ok(startSwing(p)); advanceSwing(p, SWORD.activeStart + 0.01); }

test('sword is a timed, one-press attack with wind-up and recovery', () => {
  const p = hero(), e = enemy();
  assert.ok(startSwing(p));
  assert.equal(startSwing(p), false);
  assert.equal(swordHit(p, e, 1), false);
  advanceSwing(p, SWORD.activeStart + 0.01);
  assert.ok(swordHit(p, e, 1));
  advanceSwing(p, SWORD.duration);
  assert.equal(p.sword.active, false);
  assert.equal(p.sword.cool, 0);
});
test('soft-targeting picks the closest reachable living enemy, preferring those ahead', () => {
  const p = hero(), at = (x, z, profile = SPIDER) => makeEnemy({ x, y: 0, z, yaw: 0 }, profile);
  const ahead = at(0, 1), behind = at(0, -0.9), side = at(0.5, 0), farSide = at(0.95, 0);
  assert.equal(softTarget(p, [ahead, behind]), ahead, 'ahead wins against slightly closer behind');
  assert.equal(softTarget(p, [ahead, behind], Math.PI), behind, 'the intended direction decides');
  assert.equal(softTarget(p, [ahead, side]), side, 'a much closer enemy wins over one ahead');
  assert.equal(softTarget(p, [ahead, farSide]), ahead, 'at similar distance the one ahead wins');
  const edge = SWORD.range + SPIDER.radius;
  assert.notEqual(softTarget(p, [at(0, edge - 0.01)]), null);
  assert.equal(softTarget(p, [at(0, edge + 0.01)]), null, 'out of blade reach');
  assert.notEqual(softTarget(p, [at(0, edge + 1.9)], 0, undefined, 2), null, 'extra acquisition range');
  const dead = at(0, 0.5); dead.mode = 'dead';
  const below = at(0, 0.5); below.y = -1;
  assert.equal(softTarget(p, [dead, below]), null, 'dead and other-floor enemies are ignored');
  const above = at(0, 0.5); above.y = 0.9;
  const tallBelow = at(0, 0.5, STUNDER); tallBelow.y = -1;
  assert.equal(softTarget(p, [above]), null, 'above the blade');
  assert.equal(softTarget(p, [tallBelow]), tallBelow, 'a tall body reaching into the blade band counts');
  const hidden = at(0, 0.5);
  assert.equal(softTarget(p, [hidden, ahead], 0, e => e !== hidden), ahead, 'line of sight required');
  const d = SWORD.range + STUNDER.radius - 0.05;
  const big = at(0, d, STUNDER);
  assert.equal(softTarget(p, [big]), big, 'reach includes the body radius');
  assert.equal(softTarget(p, [at(0, d)]), null, 'a smaller body at that distance is out of reach');
});
test('one enemy is hit at most once per swing', () => {
  const p = hero(), e = enemy(STUNDER);
  swing(p);
  for (let i = 0; i < 30; i++) swordHit(p, e, 1);
  assert.equal(e.hp, STUNDER.hp - 30);
  assert.equal(e.mode, 'chase');
  assert.ok(e.stun > 0);
});
test("the glassmaker's old sword takes two slashes for a spider and five for a Stunder, which hits harder", () => {
  const p = hero(), spider = enemy(), stunder = enemy(STUNDER);
  assert.ok(STUNDER.damage > SPIDER.damage);
  swing(p); swordHit(p, spider, 1); swordHit(p, stunder, 1);
  assert.equal(spider.hp, SPIDER.hp - 30); assert.equal(stunder.hp, STUNDER.hp - 30);
  advanceSwing(p, 2); swing(p); swordHit(p, spider, 1);
  assert.equal(spider.mode, 'dead'); assert.equal(spider.hp, 0);
  for (let i = 2; i <= 4; i++) {
    advanceSwing(p, 2); swing(p); swordHit(p, stunder, 1);
    assert.equal(stunder.hp, STUNDER.hp - 30 * i);
  }
  advanceSwing(p, 2); swing(p); swordHit(p, stunder, 1);
  assert.equal(stunder.mode, 'dead');
  assert.equal(stunder.deadT, 0);
  assert.equal(swordHit(p, stunder, 1), false);
});
test('a stagger interrupts a wind-up; a poised enemy shrugs light blows off until its poise wears off', () => {
  const spider = enemy(), stunder = enemy(STUNDER);
  assert.equal(SPIDER.poise, 0); assert.ok(STUNDER.poise > 1);
  for (const e of [spider, stunder]) { e.mode = 'attack'; e.t = 0.2; }
  damageEnemy(spider, 1); damageEnemy(stunder, 1);
  for (const e of [spider, stunder]) assert.ok(e.staggered && e.mode === 'chase' && e.stun > 0 && e.cool >= 0.45, e.type);
  assert.equal(stunder.poised, STUNDER.poise);
  // poised: a light hit hurts but the wind-up goes on
  stunder.mode = 'attack'; stunder.stun = 0; stunder.cool = 0;
  damageEnemy(stunder, 1);
  assert.equal(stunder.staggered, false); assert.equal(stunder.mode, 'attack'); assert.equal(stunder.stun, 0);
  assert.equal(stunder.hp, STUNDER.hp - 2); assert.ok(stunder.hurtT > 0, 'it still flashes');
  // a heavy blow staggers anyway
  damageEnemy(stunder, Math.ceil(HEAVY_HIT * STUNDER.hp));
  assert.ok(stunder.staggered && stunder.mode === 'chase');
  // a spider (no poise) is staggered by every hit
  spider.mode = 'attack'; damageEnemy(spider, 1);
  assert.ok(spider.staggered && spider.mode === 'chase');
});
test('blade cannot hit behind, too far away, or through another floor', () => {
  const p = hero(); swing(p);
  for (const extra of [{ z: -0.8 }, { z: 3 }, { y: -2 }, { y: 2 }, { x: 1, z: -0.2 }]) {
    const e = Object.assign(enemy(), extra);
    assert.equal(inSwordArc(p, e), false, JSON.stringify(extra));
    assert.equal(e.hp, SPIDER.hp);
  }
});
test('one slash can sweep multiple enemies, but only during the active interval', () => {
  const p = hero(), left = enemy(), right = enemy();
  left.x = -0.3; right.x = 0.3;
  swing(p); assert.ok(swordHit(p, left, 1)); assert.ok(swordHit(p, right, 1));
  const late = enemy();
  advanceSwing(p, SWORD.activeEnd);
  assert.equal(swordHit(p, late, 1), false);
});
test('jumping without a sword press never starts an attack or kills an enemy', () => {
  const p = hero(), e = enemy();
  for (const y of [0, 0.2, 0.6, 1, 0.6, 0.2, 0]) {
    p.y = y; p.vy = -4; advanceSwing(p, 1 / 60);
    assert.equal(swordHit(p, e, 1), false);
  }
  assert.equal(e.hp, SPIDER.hp); assert.notEqual(e.mode, 'dead');
});
test('swimming, ladders, knockdown, death and stun block / cancel sword attacks', () => {
  for (const extra of [{ swimming: true }, { climb: {} }, { ragdoll: {} }, { hp: 0 }, { stun: 0.1 }]) {
    const blocked = Object.assign(hero(), extra);
    assert.equal(startSwing(blocked), false);
    const p = hero(); swing(p); Object.assign(p, extra); advanceSwing(p, 0.01);
    assert.equal(p.sword.active, false);
  }
});
test('travel cancellation clears queued input and previous targets', () => {
  const p = hero(); swing(p); swordHit(p, enemy(STUNDER), 1); p.sword.requested = true;
  cancelSwing(p, true);
  assert.equal(p.sword.active, false); assert.equal(p.sword.requested, false);
  assert.equal(p.sword.hits.size, 0); assert.equal(p.sword.cool, 0);
});

test('Octonaut picks slaps about twice as often as spin kicks; single-attack species keep their profile', () => {
  const picks = [0, 0];
  for (let i = 0; i < 300; i++) picks[pickAttack(OCTONAUT, i / 300)]++;
  assert.deepEqual(picks, [200, 100]);
  assert.equal(pickAttack(SPIDER, 0.9), 0);
  const e = enemy(SNAKE);
  assert.equal(attackOf(e), e.profile);
  const o = enemy(OCTONAUT);
  o.attack = 1;
  assert.equal(attackOf(o).name, 'spin');
  assert.ok(attackOf(o).arc < 0 && attackOf(o).knockDown && attackOf(o).power > 1);
  o.attack = 0;
  assert.equal(attackOf(o).name, 'slap');
  assert.equal(attackOf(o).knockDown, false);
});

test('the fire species and the Triangle outclass every older enemy', () => {
  for (const strong of [FIREFACE, TRIANGLE, FIRECAT]) for (const old of [SPIDER, STUNDER, SNAKE, OCTONAUT]) {
    assert.ok(strong.xp > old.xp && strong.coins[1] > old.coins[1], strong.type + ' vs ' + old.type);
    if (old !== STUNDER) assert.ok(strong.hp > old.hp && strong.damage > old.damage, strong.type + ' vs ' + old.type);
  }
  // the basic sword (30) needs at least four hits on any of them
  for (const p of [FIREFACE, TRIANGLE, FIRECAT]) assert.ok(p.hp > 90);
});
test('a projectile leaves the muzzle along the heading, pitched at the target', () => {
  const e = { x: 5, y: 1, z: 5, yaw: Math.PI / 2 };   // facing +x
  const pr = launch(e, FIREFACE.projectile, { x: 9, y: 2, z: 7 });
  const [mx, my, mz] = FIREFACE.projectile.muzzle;
  assert.ok(Math.abs(pr.x - (5 + mz)) < 1e-9 && Math.abs(pr.z - (5 - mx)) < 1e-9 && Math.abs(pr.y - (1 + my)) < 1e-9);
  assert.ok(Math.abs(Math.hypot(pr.vx, pr.vy, pr.vz) - FIREFACE.projectile.speed) < 1e-9);
  assert.ok(Math.abs(pr.vz) < 1e-9 && pr.vx > 0, 'flies along the heading, not at the player');
  assert.ok(pr.vy > 0, 'pitched up towards the chest height');
  const steep = launch(e, FIREFACE.projectile, { x: 6, y: 9, z: 5 });
  assert.ok(steep.vy / Math.hypot(steep.vx, steep.vz) <= 0.45 + 1e-9);
});
test('projectiles hit the player, stop at walls and fizzle out of range', () => {
  const p = { x: 5, y: 0, z: 0, r: 0.22, h: 0.85 }, none = () => false;
  const e = { x: 0, y: 0, z: 0, yaw: Math.PI / 2 };
  let pr = launch(e, TRIANGLE.projectile, { x: 5, y: 0.45, z: 0 }), end = null, t = 0;
  for (; !end && t < 3; t += 1 / 60) end = stepProjectile(pr, 1 / 60, p, none);
  assert.equal(end, 'hit');
  assert.ok(Math.abs(t - (5 - TRIANGLE.projectile.muzzle[2] - p.r - TRIANGLE.projectile.radius) / TRIANGLE.projectile.speed) < 0.05);
  assert.ok(touches(pr, p));
  pr = launch(e, TRIANGLE.projectile, { x: 5, y: 0.45, z: 0 }); end = null;
  for (let i = 0; !end && i < 200; i++) end = stepProjectile(pr, 1 / 60, p, x => x > 2.5);
  assert.equal(end, 'blocked'); assert.ok(pr.x > 2.5 && pr.x < 2.7);
  pr = launch(e, TRIANGLE.projectile, { x: 5, y: 0.45, z: 0 }); end = null;
  for (let i = 0; !end && i < 200; i++) end = stepProjectile(pr, 1 / 60, null, none);
  assert.equal(end, 'spent'); assert.ok(Math.abs(pr.travelled - TRIANGLE.projectile.range) < 0.15);
  // a big step cannot tunnel through the player
  pr = launch(e, TRIANGLE.projectile, { x: 5, y: 0.45, z: 0 });
  assert.equal(stepProjectile(pr, 1, p, none), 'hit');
});
test('a fireball burns for half a second; the Triangle punch knocks down instead', () => {
  const fire = blowOf(FIREFACE, FIREFACE), punch = blowOf(TRIANGLE, TRIANGLE);
  assert.equal(fire.damage, 22); assert.equal(fire.knockDown, false); assert.equal(fire.burn.time, 0.5);
  assert.equal(punch.damage, 28); assert.equal(punch.knockDown, true); assert.equal(punch.burn, null);
  assert.equal(blowOf(FIRECAT, FIRECAT).burn, null, 'the Fire-cat is on fire, but its bite is not');
  const b = ignite(fire.burn, fire.reason);
  let total = 0, t = 0;
  for (; !burntOut(b); t += 1 / 60) total += burnStep(b, 1 / 60);
  assert.equal(total, FIREFACE.projectile.burn.damage);
  assert.ok(Math.abs(t - 0.5) < 1.5 / 60, 'burns out after half a second: ' + t);
});
test('Shraps pinches up close and throws ice balls from further off', () => {
  const [pinch, toss] = SHRAPS.attacks;
  assert.equal(pinch.name, 'pinch'); assert.equal(toss.name, 'throw');
  assert.equal(SHRAPS.reach, toss.reach, 'the profile reach is its longest attack');
  assert.ok(isRanged(SHRAPS) && isRanged(FIREFACE) && !isRanged(OCTONAUT));
  assert.deepEqual(attacksInReach(SHRAPS, 0.6, 0), [0]);
  assert.deepEqual(attacksInReach(SHRAPS, 1.4, 0), [], 'too far for the claws, too close to throw: it closes in');
  assert.deepEqual(attacksInReach(SHRAPS, 3, 0), [1]);
  assert.deepEqual(attacksInReach(SHRAPS, 3, 1), [1], 'a throw allows more height than a pinch');
  assert.deepEqual(attacksInReach(SHRAPS, 0.6, 1), []);
  assert.deepEqual(attacksInReach(SHRAPS, toss.reach + 0.1, 0), []);
  // single and plain multi-attack species keep their old reach rule
  assert.deepEqual(attacksInReach(OCTONAUT, OCTONAUT.reach - 0.1, 0), [0, 1]);
  assert.deepEqual(attacksInReach(FIREFACE, 3, 1.2), [0]);
  assert.deepEqual(attacksInReach(SPIDER, SPIDER.reach + 0.1, 0), []);
  assert.deepEqual(attacksInReach(SPIDER, SPIDER.reach - 0.1, 0.7), [0], 'a bite reaches the next step of a stair');
  // picks only among the allowed attacks
  for (let r = 0; r < 1; r += 0.1) assert.equal(pickAttack(SHRAPS, r, [1]), 1);
  assert.equal(pickAttack(OCTONAUT, 0.9, [0]), 0);
  const blow = blowOf(SHRAPS, toss);
  assert.equal(blow.damage, Math.round(SHRAPS.damage * toss.power)); assert.equal(blow.burn, null);
  assert.deepEqual(blow.chill, toss.projectile.chill);
  assert.equal(blowOf(SHRAPS, pinch).chill, null);
});
test('the Fire shraps has the fire head and throws burning fireballs', () => {
  const toss = FIRE_SHRAPS.attacks[1];
  assert.equal(FIRE_SHRAPS.species, 'shraps');
  assert.equal(toss.projectile.kind, 'fireball'); assert.equal(toss.projectile.chill, undefined);
  assert.deepEqual(toss.projectile.burn, FIREFACE.projectile.burn);
  assert.deepEqual(toss.projectile.muzzle, SHRAPS.attacks[1].projectile.muzzle);
  assert.ok(FIRE_SHRAPS.hide.includes('ShrapsIce') && !FIRE_SHRAPS.hide.some(m => /Fire|Flame/.test(m)));
  assert.ok(SHRAPS.hide.includes('ShrapsFlame_glow') && !SHRAPS.hide.some(m => /Ice/.test(m)));
  assert.ok(FIRE_SHRAPS.hp > SHRAPS.hp && FIRE_SHRAPS.damage > SHRAPS.damage);
  assert.ok(attackDamage(FIRE_SHRAPS) > attackDamage(SHRAPS), 'the burn counts');
});
test('an ice ball chills: slowed for its time, thawing back at the end', () => {
  const c = chillFrom(SHRAPS.attacks[1].projectile.chill);
  assert.equal(chillFactor(null), 1);
  assert.equal(chillFactor(c), c.slow);
  let t = 0;
  while (chillStep(c, 1 / 60)) {
    t += 1 / 60;
    const f = chillFactor(c);
    assert.ok(f >= c.slow - 1e-9 && f <= 1);
    if (c.time - c.t > THAW) assert.equal(f, c.slow);
  }
  assert.ok(Math.abs(t - c.time) < 2 / 60);
  assert.ok(chillFactor(c) > 0.99, 'thawed when it wears off');
});
test('Spicy rolls back before its laser shines for 0.6 s and bursts at the hit frame', () => {
  assert.ok(isRanged(SPICY)); assert.equal(shotOf(SPICY), SPICY.beam);
  assert.equal(SPICY.beam.time, 0.6);
  assert.ok(Math.abs(fireAt(SPICY) + SPICY.beam.time - SPICY.hitAt) < 1e-9);
  assert.ok(SPICY.retreat.to <= fireAt(SPICY) && SPICY.trackUntil <= fireAt(SPICY), 'backs off and turns before it fires');
  assert.equal(fireAt(FIREFACE), FIREFACE.hitAt, 'a throw leaves at the hit frame');
  assert.equal(retreatAt(SPICY.retreat, 0), 0);
  assert.ok(Math.abs(retreatAt(SPICY.retreat, SPICY.retreat.to) - SPICY.retreat.dist) < 1e-9);
  assert.deepEqual(attacksInReach(SPICY, 3, 1.2), [0], 'shoots up and down a stair like a throw');
  assert.deepEqual(attacksInReach(SPICY, SPICY.reach + 0.1, 0), []);
  assert.equal(blowOf(SPICY).damage, SPICY.damage);
});
test('a beam follows its target slowly, stops at walls and bodies, and hits what it touches when it bursts', () => {
  const e = { x: 0, y: 0, z: 0, yaw: Math.PI / 2 }, none = () => false;   // facing +x
  const p = { x: 4, y: 0, z: 0, r: 0.22, h: 0.85 }, chest = q => ({ x: q.x, y: q.y + q.h * 0.55, z: q.z });
  const o = muzzleAt(e, SPICY.beam.muzzle);
  assert.ok(Math.abs(o.x - SPICY.beam.muzzle[2]) < 1e-9 && Math.abs(o.y - SPICY.beam.muzzle[1]) < 1e-9);
  const b = castBeam(startBeam(e, SPICY.beam, chest(p)), none, p);
  assert.ok(Math.abs(b.ex - (p.x - p.r)) < 0.08, 'ends on the body: ' + b.ex);
  assert.ok(beamHits(b, p));
  assert.ok(castBeam(startBeam(e, SPICY.beam, chest(p)), x => x > 2).ex < 2.05, 'a wall stops it');
  assert.ok(Math.abs(castBeam(startBeam(e, SPICY.beam, { x: 4, y: 1.27, z: 0 }), none).length - SPICY.beam.range) < 1e-9);
  // a player walking across it gets out before it bursts; one standing still does not
  const t = SPICY.beam.time, walk = 1.9;
  for (let k = 0; k < 36; k++) { p.z += walk * t / 36; aimBeam(b, chest(p), t / 36); }
  castBeam(b, none, p);
  assert.ok(!beamHits(b, p), 'dodged: ' + beamDistance(b, p));
  assert.ok(Math.abs(b.az - SPICY.beam.track * t) < 1e-6, 'the aim follows at its track speed');
  const still = { ...p, z: b.az };
  assert.ok(beamHits(b, still));
});
test('the Wolk lightning shows for 0.8 s, then strikes from its cloud to the floor under its target and stuns', () => {
  assert.ok(isRanged(WOLK)); assert.equal(shotOf(WOLK), WOLK.beam);
  assert.equal(WOLK.beam.kind, 'bolt');
  assert.ok(Math.abs(fireAt(WOLK) - 0.3) < 1e-9, 'it shows where it will strike from 0.3 s');
  assert.equal(blowOf(WOLK).damage, WOLK.damage); assert.equal(blowOf(WOLK).shock, WOLK.beam.shock);
  assert.ok(WOLK.beam.shock > 0.5 && WOLK.beam.shock < 1.5);
  assert.equal(blowOf(SPICY).shock, undefined, 'a laser does not stun');
  const e = { x: 0, y: 0, z: 0, yaw: Math.PI / 2 }, floor = (x, y) => y < 0;   // facing +x, on a floor at y = 0
  const p = { x: 3.5, y: 0, z: 0, r: 0.22, h: 0.85 };
  const b = castBeam(startBeam(e, WOLK.beam, aimPoint(p, WOLK.beam)), floor, p);
  assert.ok(b.y > 0.7, 'it leaves the cloud');
  assert.ok(Math.abs(b.ex - p.x) < 0.3 && b.ey < 0.15, 'it ends at the feet: ' + [b.ex, b.ey]);
  assert.ok(beamHits(b, p), 'standing still is struck');
  // the aim follows until it holds still for the last `lock` s
  const { time, lock, track } = WOLK.beam;
  b.t = time - lock - 0.01; assert.ok(aiming(b));
  b.t = time - lock + 0.01; assert.ok(!aiming(b));
  // walking off once it holds still dodges it
  const walk = 1.9, moved = { ...p, z: walk * lock };
  castBeam(b, floor, moved);
  assert.ok(!beamHits(b, moved), 'dodged: ' + beamDistance(b, moved));
  // the spot only creeps after a runner while it still follows
  const c = startBeam(e, WOLK.beam, aimPoint(p, WOLK.beam)), runner = { ...p };
  for (let k = 0; k < 20; k++) { runner.z += 2.8 * 0.025; aimBeam(c, aimPoint(runner, WOLK.beam), 0.025); }
  assert.ok(Math.abs(c.az - track * 0.5) < 1e-6);
  // a bolt runs no further than just past its aim: over a drop it does not fall on
  const over = castBeam(startBeam(e, WOLK.beam, aimPoint(p, WOLK.beam)), () => false);
  assert.ok(over.length < Math.hypot(p.x - WOLK.beam.muzzle[2], WOLK.beam.muzzle[1]) + 0.35);
});
test('the Mecked mostly grabs, now and then bites: two bites while it holds you, then a shove', () => {
  const [bite, grab] = MECKED.attacks;
  assert.equal(bite.name, 'bite'); assert.ok(grab.grab && !grab.knockDown, 'its grab lets go on your feet');
  assert.ok(grab.weight > bite.weight, 'it grabs more often than it bites');
  // it starts a blow as soon as you are in reach: a grab of shorter reach would hardly ever be picked
  assert.equal(grab.reach, bite.reach);
  // the bites it holds you for hurt a little more than one bite, and a grab is no faster
  const chew = blowOf(MECKED, grab).damage * grab.grab.bites.length, one = blowOf(MECKED, bite).damage;
  assert.ok(chew > one && chew < 1.5 * one, `${chew} vs ${one}`);
  assert.ok(grab.attackTime > 2 * bite.attackTime);
  // in reach: both, from the first moment it can strike
  assert.deepEqual(attacksInReach(MECKED, MECKED.reach - 0.01, 0), [0, 1]);
  assert.deepEqual(attacksInReach(MECKED, MECKED.reach + 0.01, 0), []);
  // the kinds: each says its own name when it bites or chews, the Bog mecked's bites poison
  for (const k of Object.values(ENEMY_KINDS).filter(k => k.species === 'mecked' && !k.guardian))
    for (const a of k.attacks) assert.ok(a.reason.endsWith(` ${k.label}!`), `${k.type} ${a.name}: ${a.reason}`);
  const bog = ENEMY_KINDS.bogmecked;
  assert.ok(blowOf(bog, bog.attacks[1]).toxin && blowOf(bog, bog.attacks[0]).toxin && !blowOf(MECKED, grab).toxin);
  // Gusto's grab still throws you down
  assert.ok(GUSTO.attacks.find(a => a.grab).knockDown);
});
test('the Tornado mostly sends two twisters, hops away from a player up close and now and then slams down onto one', () => {
  const [twin, hop, slam] = TORNADO.attacks;
  assert.deepEqual([twin.name, hop.name, slam.name], ['twin', 'hop', 'slam']);
  assert.ok(isRanged(TORNADO) && TORNADO.style === 'ranged');
  assert.ok(twin.weight > slam.weight, 'usually two twisters');
  // up close it only hops away; further off it sends twisters, and from further still it may slam
  assert.deepEqual(attacksInReach(TORNADO, 1.2, 0), [1]);
  assert.deepEqual(attacksInReach(TORNADO, 2, 0), [0]);
  assert.deepEqual(attacksInReach(TORNADO, 3, 0), [0, 2]);
  assert.deepEqual(attacksInReach(TORNADO, 4.8, 0), []);
  // twisters are let go at the hit frame, the hop and the slam land at theirs, up in the air in between
  for (const a of [hop, slam]) {
    assert.ok(a.ride.from < a.hitAt && a.steady.from === a.ride.from && a.steady.to === a.hitAt);
    const e = makeEnemy({ x: 0, y: 0, z: 0, yaw: 0 }, TORNADO);
    Object.assign(e, { mode: 'attack', attack: TORNADO.attacks.indexOf(a), t: a.ride.from - 0.01 });
    assert.ok(!airborne(e)); e.t = a.ride.from + 0.01; assert.ok(airborne(e)); e.t = a.hitAt; assert.ok(!airborne(e));
  }
  // the slam's shadow shows from before it takes off until it comes down
  assert.ok(fireAt(slam) < slam.ride.from && slam.beam.kind === 'stomp' && slam.beam.sky);
  // caught or slammed, you go down; the hop leaves a twister behind
  for (const a of TORNADO.attacks) assert.ok(blowOf(TORNADO, a).knockDown, a.name);
  assert.ok(hop.ride.back > 2 && hop.ride.leave.stay > 1);
  // the kinds: each says its own name; the Fire tornado's twisters burn
  for (const k of Object.values(ENEMY_KINDS).filter(k => k.species === 'tornado' && !k.guardian))
    for (const a of k.attacks) assert.ok(a.reason.includes(k.label), `${k.type} ${a.name}: ${a.reason}`);
  assert.ok(blowOf(ENEMY_KINDS.firetornado, ENEMY_KINDS.firetornado.attacks[0]).burn && !blowOf(TORNADO, twin).burn);
  // a bigger kind's hands are further out
  const fire = ENEMY_KINDS.firetornado.attacks[0].twister;
  assert.ok(fire.hands[0][0] > twin.twister.hands[0][0] && shotOf(ENEMY_KINDS.firetornado.attacks[0]) === fire);
});
test('a pair of twisters drops below the hands, crosses where the target stood and runs on', () => {
  const spec = TORNADO.attacks[0].twister, e = { x: 0, y: 0, z: 0, yaw: 0 }, at = 3;
  const [l, r] = [0, 1].map(i => launchTwister(e, spec, i, at, 0));
  assert.ok(Math.abs(l.x0 - spec.hands[0][0]) < 1e-9 && Math.abs(l.z0 - spec.hands[0][2]) < 1e-9, 'under its hand');
  // they bow out to either side, then meet ahead of it
  const mid = d => [twisterAt(l, d, 0), twisterAt(r, d, 0)];
  const [ml, mr] = mid(l.len / 2);
  assert.ok(ml[0] > spec.hands[0][0] && mr[0] < spec.hands[1][0], 'bowing out');
  const [cl, cr] = mid(l.len);
  assert.ok(Math.hypot(cl[0] - cr[0], cl[1] - cr[1]) < 1e-6 && Math.abs(cl[1] - at) < 1e-6, 'crossing on the target');
  const [pl] = mid(l.len + 1);
  assert.ok(pl[0] < 0 && pl[1] > at, 'and on, the way it came in');
  // it runs at its speed until it has run its range
  let steps = 0;
  while (stepTwister(l, spec, 0.1)) steps++;
  assert.ok(Math.abs(steps * 0.1 - spec.range / spec.speed) < 0.11);
  // one left behind stays put (wobbling), for its time
  const stay = stayTwister(2, 2, 0), still = { ...spec, stay: 1 };
  let n = 0;
  while (stepTwister(stay, still, 0.1)) { n++; assert.ok(Math.hypot(stay.x - 2, stay.z - 2) < 0.15); }
  assert.ok(n >= 9 && n <= 10, `${n} steps`);
});
test('a twister catches a body it touches and lifts it, spinning it ever faster', () => {
  const spec = TORNADO.attacks[0].twister, tw = { x: 0, y: 0, z: 0 }, body = (x, y = 0) => ({ x, y, z: 0, r: 0.3, h: 1.1 });
  assert.ok(catches(tw, spec, body(0.5)));
  assert.ok(!catches(tw, spec, body(0.7)), 'too far off');
  assert.ok(!catches(tw, spec, body(0, spec.height + 0.1)), 'over it');
  assert.ok(!catches(tw, spec, body(0, -1.5)), 'under it');
  const a = twirlAt(spec, 0), b = twirlAt(spec, spec.spin * 0.6), c = twirlAt(spec, spec.spin);
  assert.ok(a.up === 0 && Math.abs(b.up - spec.lift) < 1e-9 && Math.abs(c.up - spec.lift) < 1e-9, 'up, then held there');
  assert.ok(c.angle > 3 * 2 * Math.PI, 'round three times and more');
  assert.ok(twirlAt(spec, spec.spin).angle - twirlAt(spec, spec.spin * 0.9).angle > twirlAt(spec, spec.spin * 0.1).angle, 'faster at the end');
});
test('the Fire-cat pounce stops short of its target and eases through the leap', () => {
  const { lunge } = FIRECAT;
  assert.equal(lungeDistance(lunge, 0.3), 0);
  assert.ok(Math.abs(lungeDistance(lunge, 1.6) - 1.05) < 1e-9);
  assert.equal(lungeDistance(lunge, 9), lunge.max);
  assert.ok(FIRECAT.reach <= lunge.max + lunge.stop + 0.05, 'it never pounces from further than it can leap');
  assert.equal(lungeAt(lunge, 0), 0); assert.equal(lungeAt(lunge, lunge.to), 1);
  assert.ok(lunge.to < FIRECAT.hitAt && lunge.from > FIRECAT.trackUntil, 'commits to a heading, lands, then bites');
});

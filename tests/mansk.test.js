// Mansk, the mask on the museum's stage (core/mansk.js, game/mansk.js, docs/bosses.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { BOSSES, bossAt, BOSS_ARENAS } from '../src/core/bosses.js';
import { MANSK, MANSK_SKY, MANSK_RIBBONS, STAGE_TORNADO, TORNADO, ENEMY_KINDS, STAGE_PROFILES, makeEnemy, blowOf, airborne, baseY,
  attacksInReach } from '../src/core/enemies.js';
import { MANSK_FIGHT, MANSK_DANCE, phaseFloor, summonCount, barred, liftFor, stepLift, lowEnough, orbSpot, curtainLine, curtainOpen, danceAt } from '../src/core/mansk.js';
import { damageEnemy, inSwordArc, inReachBand } from '../src/core/combat.js';
import { inBlast } from '../src/core/projectiles.js';
import { aimPoint, touchesEnemy } from '../src/core/shots.js';
import { muzzleAt } from '../src/core/beams.js';
import { enemySlow } from '../src/core/status.js';
import { kindsIn, speciesIn } from '../src/core/spawns.js';
import { guardianLockMessage } from '../src/core/guardians.js';
import { STAGE } from '../src/cubegen/arenashapes.js';
import { RUN_SPEED, LH, N } from '../src/core/constants.js';
import { propMetadata } from '../src/core/propcatalog.js';

const stageOf = seed => { const w = new World(seed), L = w.layout(6); return state.map = w.cube(L.down).map; };
const named = (p, name) => p.attacks.find(a => a.name === name);

test('Mansk takes the place of the descent guardian of depth 6, the last of act I', () => {
  assert.equal(BOSSES[6], 'mansk'); assert.equal(bossAt(6), 'mansk'); assert.equal(bossAt(6, 'side'), null);
  const map = stageOf(3);
  assert.equal(map.guardian.boss, 'mansk'); assert.equal(guardianLockMessage(map), 'Defeat Mansk to unlock this descent');
  for (const k of ['mansk', 'stagetornado']) assert.ok(kindsIn(map).includes(k), k);
  assert.deepEqual(speciesIn(map).sort(), ['mansk', 'tornado']);
  assert.ok(STAGE_TORNADO.minion && STAGE_TORNADO.plain && STAGE_TORNADO.species === TORNADO.species && ENEMY_KINDS.stagetornado === STAGE_TORNADO);
});

test('his museum: a hall paved in a checker, a stage round him and the well, walls with paintings and a curtain', () => {
  for (const seed of [1, 2, 3, 8, 42]) {
    const map = stageOf(seed), zone = map.floors.filter(f => f.encounter), door = map.portals[0].floor.top;
    assert.equal(map.arena.type, 'stage'); assert.equal(BOSS_ARENAS.mansk.type, 'stage');
    const stage = zone.filter(f => f.surface === 'masonry' || f.surface === 'trim'), hall = zone.filter(f => f.surface === 'paving');
    assert.ok(stage.length > 40 && hall.length > 25, `${stage.length} / ${hall.length}`);
    assert.ok(hall.every(f => f.top === door + STAGE.hall), 'the hall a level down');
    assert.ok(map.guardian.floor.surface === 'masonry' && map.guardian.floor.top === door, 'he waits on the stage');
    // walled all round, high enough for the curtain
    const walls = map.floors.filter(f => f.arenaCell && !f.encounter);
    assert.ok(walls.every(f => f.top >= door + 4), 'high walls');
    const sets = map.arenaPlacements.map(p => propMetadata.get(p.name)?.set);
    assert.ok(sets.every(s => s === 'museum'), [...new Set(sets)].join());
    const has = name => map.arenaPlacements.some(p => p.name.startsWith('museum_' + name));
    for (const n of ['curtain', 'painting', 'footlights', 'spotlight']) assert.ok(has(n), `${seed}: ${n}`);
    assert.ok(['pedestal', 'display_case', 'statue'].some(has), 'things on show');
  }
});

test('three phases, a third of his health each: horns, flying, ribbons', () => {
  assert.deepEqual(STAGE_PROFILES.mansk, [MANSK, MANSK_SKY, MANSK_RIBBONS]);
  const e = makeEnemy({ id: 'm', level: 8, x: 0, y: 0, z: 0 }, MANSK);
  e.hpFloor = phaseFloor(e.profile.hp, 1);
  damageEnemy(e, 1e6);
  assert.equal(e.hp, Math.ceil(e.profile.hp * 2 / 3));
  assert.equal(phaseFloor(1000, 2), 334); assert.equal(phaseFloor(1000, 3), 0);
  assert.ok(MANSK.hover && MANSK_RIBBONS.ribbons);
  assert.ok(!named(MANSK_RIBBONS, 'orbs'), 'no balls without his horns');
  assert.ok(named(MANSK_RIBBONS, 'lash') && !named(MANSK, 'lash') && !named(MANSK_SKY, 'lash'), 'ribbons only in phase 3');
});

test('what he may do when: his phase\'s attacks, what needs him low only down low, the timed ones when due', () => {
  const allowed = o => ['inhale', 'spit', 'orbs', 'summon', 'slow', 'lash', 'whirl'].filter(n => !barred(o).has(n));
  assert.deepEqual(allowed({ phase: 1 }), ['orbs']);
  assert.deepEqual(allowed({ phase: 1, inhaleDue: true }), ['inhale', 'orbs']);
  assert.deepEqual(allowed({ phase: 1, inhaleDue: true, summonDue: true, slowDue: true }), ['inhale', 'orbs', 'summon'], 'no slowing in phase 1');
  assert.deepEqual(allowed({ phase: 2, low: false, inhaleDue: true, slowDue: true }), ['orbs', 'slow'], 'up in the air: no breathing in');
  assert.deepEqual(allowed({ phase: 2, inhaleDue: true, orbsDue: false }), ['inhale']);
  assert.deepEqual(allowed({ phase: 3, inhaleDue: true, summonDue: true }), ['inhale', 'summon', 'lash', 'whirl']);
  assert.deepEqual(allowed({ phase: 3, summonDue: true }), ['summon', 'lash', 'whirl'], 'breathing in only when due');
  assert.deepEqual(allowed({ phase: 3, low: false, inhaleDue: true, summonDue: true, slowDue: true }), ['summon', 'slow']);
  assert.ok(!allowed({ phase: 3 }).includes('spit'), 'only a gulp starts the spit');
  assert.equal(summonCount(1, 0), 2); assert.equal(summonCount(2, 1), 4); assert.equal(summonCount(3, 9), 0);
});

test('he flies: up out of a blade\'s reach (but not a shot\'s), and down on the floor where it reaches him', () => {
  const e = makeEnemy({ id: 'm', level: 8, x: 0, y: 0, z: 1.2 }, MANSK);
  e.mode = 'chase';
  const p = { x: 0, y: 0, z: 0, r: 0.22, sword: { active: true, t: 0.2, hits: new Set(), yaw: 0, stats: { range: 1.6, arc: 1, activeStart: 0.1, activeEnd: 0.3, duration: 0.6 } } };
  e.lift = liftFor(1, false);
  assert.ok(inSwordArc(p, e), 'floating low, a blade reaches him');
  assert.equal(liftFor(2, true), MANSK_FIGHT.lift.landed);
  e.lift = liftFor(2, false);
  assert.ok(!inSwordArc(p, e), 'up there it does not');
  assert.ok(inReachBand(p, e, { ranged: true }), 'a shot does');
  assert.ok(airborne(e), 'nobody bumps into him up there');
  assert.equal(baseY(e), e.y + e.lift);
  assert.ok(aimPoint(e).y > e.y + e.lift, 'shots aim at him where he flies');
  assert.ok(touchesEnemy({ spec: { radius: 0.1 }, x: 0, y: e.lift + 1, z: 1.2 }, e) && !touchesEnemy({ spec: { radius: 0.1 }, x: 0, y: 0.5, z: 1.2 }, e));
  assert.ok(muzzleAt(e, [0, 1, 0]).y === e.y + e.lift + 1, 'what comes out of him comes from where he is');
  assert.ok(!lowEnough(e.lift) && lowEnough(MANSK_FIGHT.lift.low));
  // he rises slower than he drops, and gets there
  let h = 0, n = 0;
  while (h < MANSK_FIGHT.lift.up && n++ < 1000) h = stepLift(h, MANSK_FIGHT.lift.up, 0.1);
  assert.ok(n * 0.1 > 1 && n * 0.1 < 2, `${n * 0.1} s up`);
  assert.ok(stepLift(2, 0, 0.1) < 2 - 0.25);
});

test('breathing in pulls you to his mouth; in it he chews you and spits you out, a lot of damage', () => {
  const inhale = named(MANSK, 'inhale'), spit = named(MANSK, 'spit');
  assert.ok(inhale.pull && inhale.pull.stop < MANSK.radius + 0.5 && inhale.pull.range >= 5, 'right up to him');
  // standing still you are drawn in; running away gets you out, slowly; it comes only now and then
  assert.ok(RUN_SPEED * inhale.pull.hold > inhale.pull.speed * 1.1 && inhale.pull.speed * inhale.pull.time > 3, 'running away works, standing still does not');
  assert.ok(MANSK_FIGHT.inhale.every[0] >= 8 && MANSK_FIGHT.inhale.gulped > MANSK_FIGHT.inhale.every[1]);
  assert.equal(spit.weight, 0); assert.ok(spit.grab.gulp && spit.knockDown);
  assert.ok(spit.grab.bites.every(b => b < spit.grab.throwAt) && spit.grab.throwAt < spit.attackTime);
  // two bites and the throw: much more than one of his blows
  const blow = blowOf(MANSK, spit), orb = blowOf(MANSK, named(MANSK, 'orbs'));
  assert.ok((spit.grab.bites.length + 1) * blow.damage > 2.5 * MANSK.damage, `${blow.damage}`);
  assert.ok(orb.damage < blow.damage * 3);
  assert.ok(MANSK_FIGHT.gulp > 0.4 && MANSK_FIGHT.gulp < 1.2);
});

test('the balls of light: at his horns\' knobs and over his diamond, then they burst all round where they end', () => {
  const orbs = named(MANSK, 'orbs'), spec = orbs.orb;
  assert.equal(orbs.cast, 'orbs'); assert.deepEqual(MANSK_FIGHT.orbs.count, [2, 3, 0]);
  const a = orbSpot(spec.tips, spec.diamond, 0, 0), c = orbSpot(spec.tips, spec.diamond, 2, 0);
  assert.ok(Math.abs(a[0] - spec.tips[0][0]) < 1e-9 && a[1] > 3, 'up at a horn');
  assert.ok(c[1] > spec.diamond[1], 'over the diamond');
  const pr = { x: 0, y: 0.2, z: 0, spec };
  assert.ok(inBlast(pr, { x: 1.2, y: 0, z: 0.5, r: 0.22, h: 1.6 }), 'next to it: hit');
  assert.ok(!inBlast(pr, { x: 3, y: 0, z: 0, r: 0.22, h: 1.6 }), 'away: not');
  assert.ok(!inBlast(pr, { x: 0, y: 4, z: 0, r: 0.22, h: 1.6 }), 'high above: not');
  assert.ok(attacksInReach(MANSK_SKY, 8, 2.5).includes(MANSK_SKY.attacks.indexOf(orbs)), 'cast from the air');
});

test('slowed time slows his Tornados, not him; the ribbons catch, squeeze and let go', () => {
  const t = makeEnemy({ id: 't', level: 8, x: 0, y: 0, z: 0 }, STAGE_TORNADO);
  assert.equal(enemySlow(t), 1);
  t.warp = MANSK_FIGHT.slow.minions;
  assert.equal(enemySlow(t), MANSK_FIGHT.slow.minions);
  assert.ok(MANSK_FIGHT.slow.players < 1 && MANSK_FIGHT.slow.time[1] > 0 && MANSK_FIGHT.slow.time[0] === 0);
  const lash = named(MANSK_RIBBONS, 'lash');
  assert.ok(lash.grab.ribbons && !lash.knockDown && lash.hitReach >= 4, 'long ribbons');
  assert.ok(lash.grab.bites.length === 3 && lash.grab.bites.every(b => b > lash.hitAt && b < lash.grab.throwAt));
  const whirl = named(MANSK_RIBBONS, 'whirl');
  assert.equal(whirl.arc, -1); assert.ok(whirl.hitReach >= 3.5);
  assert.ok(MANSK_FIGHT.breakAt < MANSK_FIGHT.change[1] && MANSK_FIGHT.grow > 0);
});

test('his intro\'s curtain hangs across his stage before him, from wall to wall, the footlights in front of it', () => {
  for (const seed of [1, 3, 4, 5, 8]) {
    const map = stageOf(seed), line = curtainLine(map), g = map.guardian;
    assert.ok(line, `${seed}: a stage, a curtain`);
    const [nx, nz] = line.n;
    assert.ok(Math.abs((line.x - g.x) * nx + (line.z - g.z) * nz - (STAGE.depth - 0.5)) < 1e-9, `${seed}: before him, behind the front row`);
    assert.ok(Math.abs((line.x - g.x) * line.t[0] + (line.z - g.z) * line.t[1]) < 1e-9, `${seed}: its middle in line with him`);
    assert.ok(line.from < -2 && line.to > 2 && line.to - line.from <= 2 * STAGE.half + 1 + 1e-9, `${seed}: ${line.from} .. ${line.to}`);
    const floorAt = (x, z) => map.floors.find(f => f.x === Math.floor(x) && f.z === Math.floor(z));
    for (let s = line.from + 0.25; s < line.to; s += 0.5) for (const off of [-0.5, 0.5]) {   // (his row and the front one)
      const f = floorAt(line.x + line.t[0] * s + nx * off, line.z + line.t[1] * s + nz * off);
      assert.ok(f && Math.abs(f.top * LH - g.y) < 0.3, `${seed}: the stage under it at ${s}`);
    }
    for (const s of [line.from - 0.25, line.to + 0.25]) {   // (past its ends: the walls, or the stage's ends)
      const x = line.x + line.t[0] * s, z = line.z + line.t[1] * s, f = floorAt(x, z);
      assert.ok(x < 2 || z < 2 || x > N - 2 || z > N - 2 || Math.abs(s) > STAGE.half || f.top * LH > g.y + 1, `${seed}: a wall past ${s}`);
    }
  }
  assert.equal(curtainLine({ arena: { type: 'hills' }, guardian: { x: 8, y: 0, z: 8 } }), null, 'no stage, no curtain');
});

test('the curtain opens drawn by its top, the hem trailing, and stays open', () => {
  const span = [2, 3.4];
  assert.equal(curtainOpen(span, 1.9, 1), 0); assert.equal(curtainOpen(span, 1.9, 0), 0);
  assert.ok(curtainOpen(span, 2.7, 1) > curtainOpen(span, 2.7, 0), 'the hem behind');
  assert.equal(curtainOpen(span, 3.4, 1), 1);
  assert.ok(Math.abs(curtainOpen(span, 6, 0) - 1) < 1e-3, 'open, the hem still');
});

test('his dance takes him across the stage and up, and back onto his spot by its end', () => {
  const D = MANSK_DANCE;
  assert.ok(D.beats.every((b, i) => b > 0 && b < D.length && (!i || b > D.beats[i - 1])), 'beats in order, in the clip');
  assert.ok(Math.abs(danceAt(D.beats[0]).side) > 0.5 && Math.sign(danceAt(D.beats[0]).side) === -Math.sign(danceAt(D.beats[1]).side), 'to one side, then the other');
  assert.ok(danceAt((D.hop[0] + D.hop[1]) / 2).up > 0.5, 'a hop');
  for (const s of [-1, 0, D.length, D.length + 3]) {
    const m = danceAt(s);
    assert.ok(Math.abs(m.side) < 1e-3 && Math.abs(m.up) < 1e-3, `on his spot at ${s}`);
  }
  for (let s = 0; s < D.length; s += 0.05) assert.ok(MANSK_FIGHT.lift.low + danceAt(s).up > 0.1, 'never down on the floor');
});

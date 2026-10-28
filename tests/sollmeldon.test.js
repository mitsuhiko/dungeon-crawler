import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOLLMELDON_FIGHT as G, HEAD_SIDE, BITES, ALL_HEADS, headsOf, nextHead, headToCut, sideOf, phaseFloor, summonCount, barred,
  stepLift, flying, groundTime, airTime, newTilt, tiltToward, levelTilt, stepTilt, tipped, slopeOf, newSlosh, stepSlosh,
  PIVOT, planeY, mudVolume, mudLevel, newPuddle, puddleRadius, mergePuddles, flowPuddle, SOLLMELDON_MUSIC, sollmeldonMusic } from '../src/core/sollmeldon.js';
import { N, LH, HEAD_Y, WATER, MUD } from '../src/core/constants.js';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { BOSSES, bossAt, BOSS_ARENAS } from '../src/core/bosses.js';
import { SOLLMELDON, SOLLMELDON_TWO, SOLLMELDON_ONE, MUD_SQUIRTLE, SQUIRTLE, ENEMY_KINDS, STAGE_PROFILES, makeEnemy } from '../src/core/enemies.js';
import { damageEnemy } from '../src/core/combat.js';
import { kindsIn, speciesIn } from '../src/core/spawns.js';
import { guardianLockMessage } from '../src/core/guardians.js';
import { floorY } from '../src/core/surfaces.js';
import { MIRE } from '../src/cubegen/arenashapes.js';
import { palRow, MUD_ROW, PAL_ROWS } from '../src/themes/fluids.js';

const close = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) < eps, `${msg ?? ''} ${a} vs ${b}`);
const run = (w, secs, step, dt = 1 / 60) => { const out = []; for (let t = 0; t < secs; t += dt) { const s = step(w, dt); if (s) out.push(s); } return out; };

test('his heads: a different one bites each time, the one nearest the blow is cut off', () => {
  assert.deepEqual(headsOf(ALL_HEADS), [0, 1, 2]); assert.deepEqual(headsOf(0b101), [0, 2]); assert.deepEqual(headsOf(0b010), [1]);
  // never the same head twice running while he has two or three
  for (let last = 0; last < 3; last++) for (let r = 0; r < 1; r += 0.05) assert.notEqual(nextHead(ALL_HEADS, last, r), last);
  for (let r = 0; r < 1; r += 0.1) { assert.equal(nextHead(0b101, 0, r), 2); assert.equal(nextHead(0b101, 2, r), 0); }
  // one head left: it bites every time
  assert.equal(nextHead(0b010, 1, 0.3), 1); assert.equal(nextHead(0, 1, 0.3), -1);
  // all three take turns over many bites
  const seen = new Set(); let last = -1;
  for (let i = 0; i < 30; i++) { last = nextHead(ALL_HEADS, last, (i * 0.37) % 1); seen.add(last); }
  assert.equal(seen.size, 3);
  // the blow from his left takes the left head, from the front the middle one
  assert.deepEqual(HEAD_SIDE, [1, 0, -1]);
  assert.equal(headToCut(ALL_HEADS, 2), 0); assert.equal(headToCut(ALL_HEADS, 0.1), 1); assert.equal(headToCut(ALL_HEADS, -3), 2);
  assert.equal(headToCut(0b101, 0.1), 0, 'the middle one gone: the nearer of the others');
  assert.equal(headToCut(0b100, 5), 2);
  // across him: facing +z (yaw 0) his left is +x
  close(sideOf(0, 0, 0, 2, 0), 2); close(sideOf(0, 0, Math.PI / 2, 0, -1), 1);
});

test('three phases, a third of his health each; his attacks by phase, up in the air and down', () => {
  assert.equal(phaseFloor(900, 1), 600); assert.equal(phaseFloor(900, 2), 300); assert.equal(phaseFloor(900, 3), 0);
  assert.deepEqual([summonCount(1, 0), summonCount(1, 2), summonCount(3, 1)], [2, 0, 2]);
  const free = o => [...BITES, 'spit', 'summon', 'rain'].filter(n => !barred(o).has(n));
  assert.deepEqual(free({ phase: 1, next: 0 }), ['biteL', 'spit']);
  assert.deepEqual(free({ phase: 1, next: 2, summonDue: true }), ['biteR', 'spit', 'summon']);
  assert.deepEqual(free({ phase: 1, up: true }), [], 'phase 1 never flies');
  assert.deepEqual(free({ phase: 2, next: 1 }), ['biteM', 'spit']);
  assert.deepEqual(free({ phase: 2, up: true, summonDue: true }), ['rain'], 'up there only his mud rains');
  assert.deepEqual(free({ phase: 3, next: 1, summonDue: true }), ['biteM', 'spit', 'summon']);
  assert.deepEqual(free({ phase: 2, next: 2, spitDue: false }), ['biteR'], 'between spits he comes to bite');
  // flying: never in phase 1; up a few seconds, down a while
  assert.equal(groundTime(1), Infinity);
  assert.equal(groundTime(2, 0.5, true), G.flight[1].first);
  const g2 = groundTime(2, 0.5), g3 = groundTime(3, 0.5), a2 = airTime(2, 0.5), a3 = airTime(3, 0.5);
  assert.ok(g3 < g2 && a3 > a2, 'phase 3 flies more often, longer');
  assert.ok(a2 >= 3 && a3 <= 6, 'briefly');
  let lift = 0;
  for (let t = 0; t < 2; t += 0.05) lift = stepLift(lift, G.lift.up, 0.05);
  close(lift, G.lift.up, 1e-9); assert.ok(flying(lift));
  lift = stepLift(lift, 0, 0.1); assert.ok(lift < G.lift.up - 0.45, 'he drops faster than he rises');
});

test('the tilt: it tips towards where he lands, holds and levels again', () => {
  const w = newTilt();
  assert.equal(tipped(w.v), 0);
  // landing out to the +x side of the middle: the cube tips down there
  assert.deepEqual(tiltToward(w, 4, 0, 0, 1, 0), [1, 0]);
  const steps = run(w, G.tilt.tip + 0.05, stepTilt);
  assert.deepEqual(steps, ['hold']); close(w.v[0], 1); close(w.v[1], 0);
  // in the middle: the way he faces
  const m = newTilt(); assert.deepEqual(tiltToward(m, 0.5, 0.5, 0, -2, 0), [0, -1]);
  // it holds, then levels on its own
  assert.deepEqual(run(w, G.tilt.hold[0] - 0.1, stepTilt), []);
  assert.deepEqual(run(w, G.tilt.hold[1] - G.tilt.hold[0] + G.tilt.back + 0.3, stepTilt), ['back', 'level']);
  assert.deepEqual(w.v, [0, 0]);
  // a new landing while tipped turns it smoothly to the new side (no jump)
  tiltToward(w, 0, 5, 0, 1, 0.5); run(w, G.tilt.tip, stepTilt);
  const before = [...w.v]; tiltToward(w, -5, 0, 0, 1, 0.5); stepTilt(w, 1 / 60);
  assert.ok(Math.hypot(w.v[0] - before[0], w.v[1] - before[1]) < 0.02);
  run(w, G.tilt.tip, stepTilt); close(w.v[0], -1, 1e-6); close(w.v[1], 0, 1e-6);
  // taking off levels it
  levelTilt(w); assert.equal(w.phase, 'back');
  run(w, G.tilt.back + 0.1, stepTilt); assert.equal(w.phase, 'level');
  // the lean of a level surface in the tipped cube: rising towards the low side
  const s = slopeOf([1, 0]); close(s[0], Math.tan(G.tilt.angle)); close(s[1], 0);
});

test('the mud sloshes over: it overshoots a little and settles', () => {
  const s = newSlosh(), want = slopeOf([1, 0]);
  let most = 0;
  for (let t = 0; t < 12; t += 1 / 60) { stepSlosh(s, want, 1 / 60); most = Math.max(most, s.g[0]); }
  assert.ok(most > want[0] * 1.05 && most < want[0] * 1.6, `overshoots a little: ${most / want[0]}`);
  close(s.g[0], want[0], want[0] * 0.02, 'settles');
  // big steps keep it stable
  const b = newSlosh();
  for (let i = 0; i < 40; i++) stepSlosh(b, want, 0.25);
  close(b.g[0], want[0], want[0] * 0.05);
});

// a flat basin (x, z in 2..14, floor at 0) with a ridge of ground at 1 on its +x side
const basin = () => {
  const out = [];
  for (let z = 2; z < 14; z += 0.5) for (let x = 2; x < 14; x += 0.5) out.push({ x: x + 0.25, z: z + 0.25, h: x >= 12 ? 1 : 0, a: 0.25 });
  return out;
};
test('the mud keeps its volume: a flat pool tipped runs deep to the low side', () => {
  const ground = basin(), flat = 0.25;
  const vol = mudVolume(ground, flat);
  close(vol, 10 * 12 * flat, 1e-9, 'the flat pool');
  close(mudLevel(ground, vol), flat, 1e-6);
  assert.ok(mudLevel(ground, 0) < 0, 'no mud: under the ground');
  // tipped towards -x: the same volume, deep at -x and dry at the far side
  const g = slopeOf([-1, 0]), y = mudLevel(ground, vol, g);
  close(mudVolume(ground, y, g), vol, 1e-6, 'its volume kept');
  const low = planeY(y, g, 2, 8), high = planeY(y, g, 11.9, 8);
  assert.ok(low > flat * 2.5, `deep at the low side: ${low}`);
  assert.ok(high < 0, 'dry at the high side');
  // with a few of his balls of mud in it: over the head (HEAD_Y) there
  const more = vol + 16 * G.mud.ball, y2 = mudLevel(ground, more, g);
  assert.ok(planeY(y2, g, 2, 8) > 0.79 && mudLevel(ground, more) < 0.35, 'tipped over the head, level still shallow');
  // levelled again: back where it was (the same volume, flat)
  close(mudLevel(ground, vol, [0, 0]), flat, 1e-6);
  // more mud: higher
  assert.ok(mudLevel(ground, vol + G.mud.head) > flat + 0.03);
  assert.equal(PIVOT, N / 2);
});

test('puddles: they stay, run together, and run downhill into the mud on a tilt', () => {
  const p = newPuddle(5, 0.5, 5);
  close(p.r, G.mud.radius); close(p.vol, G.mud.ball);
  assert.ok(puddleRadius(G.mud.ball * 4) > p.r * 1.9 && puddleRadius(1e4) === G.mud.most);
  // overlapping ones run together, keeping their mud
  const merged = mergePuddles([newPuddle(5, 0.5, 5), newPuddle(5.4, 0.5, 5), newPuddle(9, 0.5, 9)]);
  assert.equal(merged.length, 2); close(merged[0].vol, G.mud.ball * 2); assert.ok(merged[0].x > 5 && merged[0].x < 5.4);
  // one on a ledge over another: not
  assert.equal(mergePuddles([newPuddle(5, 0.5, 5), newPuddle(5.2, 2, 5)]).length, 2);
  // level: it stays put
  const ground = (x, z) => x < 3 ? 0 : 0.5, level = x => x < 3 ? 0.3 : -Infinity;
  const q = newPuddle(8, 0.5, 5);
  assert.equal(flowPuddle(q, [0, 0], 1, ground, level), 'still'); assert.equal(q.x, 8);
  // tipped towards -x: it runs down there and into the mud
  const g = slopeOf([-1, 0]);
  let end = null;
  for (let t = 0; t < 10 && end !== 'in'; t += 0.05) end = flowPuddle(q, g, 0.05, ground, level);
  assert.equal(end, 'in'); assert.ok(q.x < 3);
  // a wall in the way: stuck (and along it, where it can)
  const wall = (x, z) => x < 6 ? 3 : 0.5, r = newPuddle(7, 0.5, 5);
  for (let t = 0; t < 2; t += 0.05) end = flowPuddle(r, g, 0.05, wall, () => -Infinity);
  assert.equal(end, 'stuck'); assert.ok(r.x >= 6);
  const s = newPuddle(7, 0.5, 5);
  for (let t = 0; t < 0.5; t += 0.05) flowPuddle(s, slopeOf([-0.7, 0.7]), 0.05, wall, () => -Infinity);
  assert.ok(s.z > 5.5 && s.x >= 6, 'along the wall');
});

test('his song follows his fight: lurking, the phases, a head cut off, the world tipped', () => {
  const e = { mode: 'idle', hp: 100, profile: { hp: 100 }, stage: 1 };
  assert.equal(SOLLMELDON_MUSIC[0], 'lurk');
  assert.equal(sollmeldonMusic(e, 0, new Set()), 'lurk');
  assert.equal(sollmeldonMusic({ ...e, mode: 'chase' }, 0, new Set()), 'phase1');
  assert.equal(sollmeldonMusic({ ...e, mode: 'split' }, 0, new Set()), 'sever');
  assert.equal(sollmeldonMusic({ ...e, mode: 'chase', stage: 2 }, 0, new Set()), 'phase2');
  assert.equal(sollmeldonMusic({ ...e, mode: 'chase', stage: 3, tilt: [0.8, 0] }, 0, new Set()), 'tilt');
  assert.equal(sollmeldonMusic({ ...e, mode: 'walk', stage: 3, tilt: [0.1, 0] }, 0, new Set(['phase1'])), 'phase3');
  for (const m of ['lurk', 'phase1', 'sever', 'phase2', 'phase3', 'tilt']) assert.ok(SOLLMELDON_MUSIC.includes(m));
});

const mireOf = seed => { const w = new World(seed), L = w.layout(10); return state.map = w.cube(L.down).map; };
// the ground his mud stands on, as game/mud.js samples it
const groundOf = map => {
  const [x0, z0, x1, z1] = map.tide.box, out = [];
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const f = map.cols[z * N + x].filter(g => !g.kind).sort((a, b) => a.top - b.top)[0];
    if (f) for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) out.push({ x: x + (i + .5) / 3, z: z + (j + .5) / 3, h: floorY(f, (i + .5) / 3, (j + .5) / 3), a: 1 / 9 });
  }
  return out;
};

test('Sollmeldon takes the place of the descent guardian of depth 10, in his mire', () => {
  assert.equal(BOSSES[10], 'sollmeldon'); assert.equal(bossAt(10), 'sollmeldon'); assert.equal(bossAt(10, 'side'), null);
  assert.equal(BOSS_ARENAS.sollmeldon.type, 'mire');
  const map = mireOf(3);
  assert.equal(map.guardian.boss, 'sollmeldon'); assert.equal(guardianLockMessage(map), 'Defeat Sollmeldon to unlock this descent');
  for (const k of ['sollmeldon', 'mudsquirtle']) assert.ok(kindsIn(map).includes(k), k);
  assert.deepEqual(speciesIn(map).sort(), ['sollmeldon', 'squirtle']);
});

test('his mire: a basin his mud stands in, shallow while level, deep on the low side tipped; the doorways and islands dry', () => {
  for (const seed of [1, 2, 3, 8, 42]) {
    const map = mireOf(seed), t = map.tide;
    assert.equal(map.arena.type, 'mire');
    assert.ok(t.mud && t.fluid === WATER && t.look === MUD, 'waded through as water, drawn as mud');
    const ground = groundOf(map), vol = mudVolume(ground, t.rest * LH), low = Math.min(...ground.map(s => s.h));
    assert.ok(vol > 3, 'mud in the basin at first: ' + vol);
    const flat = mudLevel(ground, vol);
    assert.ok(flat - low > 0.2 && flat - low < HEAD_Y - 0.3, `shallow while level: ${(flat - low).toFixed(2)}`);
    for (const p of map.portals) assert.ok(p.floor.top * LH > flat + 0.4, 'the doorways stay dry');
    assert.ok(map.guardian.floor.top * LH > flat + 0.4, 'and his spot');
    // tipped any way, it runs deep to the low side; with some of his mud added, over the head
    for (const v of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const g = slopeOf(v), deep = more => { const y = mudLevel(ground, vol + more, g); return Math.max(...ground.map(s => planeY(y, g, s.x, s.z) - s.h)); };
      assert.ok(deep(0) > (flat - low) * 1.6, `tipped ${v}: deeper (${deep(0).toFixed(2)})`);
      assert.ok(deep(20 * G.mud.ball) > HEAD_Y, `tipped ${v} with his mud: over the head (${deep(20 * G.mud.ball).toFixed(2)})`);
    }
    // islands: ground at the doorways' level in the basin
    assert.ok(map.floors.filter(f => f.encounter && f.top === map.portals[0].floor.top + 0).length > 6, 'islands');
    assert.equal(MIRE.low, -2);
  }
});

test('his profiles: three phases, a third of his health each; his mud is his own; his Mud squirtles live in it', () => {
  assert.deepEqual(STAGE_PROFILES.sollmeldon, [SOLLMELDON, SOLLMELDON_TWO, SOLLMELDON_ONE]);
  assert.deepEqual([SOLLMELDON.phase, SOLLMELDON_TWO.phase, SOLLMELDON_ONE.phase], [1, 2, 3]);
  const e = makeEnemy({ id: 's', level: 12, x: 0, y: 0, z: 0 }, SOLLMELDON);
  e.hpFloor = phaseFloor(e.profile.hp, 1);
  damageEnemy(e, 1e6);
  assert.equal(e.hp, Math.ceil(e.profile.hp * 2 / 3));
  assert.ok(SOLLMELDON.mudborn && SOLLMELDON.slimeborn, 'the mud does not hold him');
  // a bite a head; the last head bites faster; up in the air he rains mud
  assert.deepEqual(SOLLMELDON.attacks.filter(a => BITES.includes(a.name)).map(a => a.head), [0, 1, 2]);
  const bite = p => p.attacks.find(a => a.name === 'biteM');
  assert.ok(bite(SOLLMELDON_ONE).attackTime < bite(SOLLMELDON).attackTime);
  assert.ok(!SOLLMELDON.attacks.some(a => a.name === 'rain') && SOLLMELDON_TWO.attacks.some(a => a.name === 'rain'));
  // his spit: a ball of mud from each head's mouth, lobbed, bursting where it lands
  const spit = SOLLMELDON.attacks.find(a => a.name === 'spit');
  assert.equal(spit.mud.muzzles.length, 3); assert.ok(spit.mud.lob > 0 && spit.mud.blast > 0 && spit.mud.slow.source === 'mud');
  assert.equal(SOLLMELDON.cut.length, 3);
  // Mud squirtles: Squirtles of his mud (they live in its look)
  assert.equal(ENEMY_KINDS.mudsquirtle, MUD_SQUIRTLE); assert.equal(MUD_SQUIRTLE.species, SQUIRTLE.species);
  assert.deepEqual(MUD_SQUIRTLE.dwells, [MUD]); assert.ok(MUD_SQUIRTLE.minion);
  // his mud's colours: a row of its own, after the fluids'
  assert.equal(palRow(10, MUD), MUD_ROW); assert.equal(MUD_ROW, PAL_ROWS);
});

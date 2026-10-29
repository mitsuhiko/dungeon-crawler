import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOLLMELDON_FIGHT as G, HEAD_SIDE, BITES, ALL_HEADS, headsOf, nextHead, headToCut, sideOf, phaseFloor, summonCount, barred,
  stepLift, flying, groundTime, airTime, newTilt, tiltToward, levelTilt, stepTilt, tipped, slopeOf,
  PIVOT, planeY, mudVolume, mudLevel, MUD_RES, MUD_FLOW, newMudField, fillMud, depositMud, stepMud, drainMud, mudTotal, depthAt, surfaceAt, cellSurfaces,
  SOLLMELDON_MUSIC, sollmeldonMusic } from '../src/core/sollmeldon.js';
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
  // the lean the mud settles to in the tipped cube: rising towards the low side, steeper than a level surface's
  const s = slopeOf([1, 0]); close(s[0], Math.tan(G.tilt.angle) * MUD_FLOW.lean); close(s[1], 0);
  assert.ok(MUD_FLOW.lean > 1);
});

// a flat basin (x, z in 2..14, floor at 0) with a pit on its -x side and a ledge on its +x side
const ground = (x, z) => x < 5 ? -0.5 : x > 11 ? 0.5 : 0;
const settle = (f, g, tip, secs) => { for (let t = 0; t < secs; t += 1 / 60) stepMud(f, g, tip, 1 / 60); };
test('the mud fills the low ground level, and keeps its volume however it flows', () => {
  assert.equal(PIVOT, N / 2);
  const f = newMudField([2, 2, 14, 14], ground);
  fillMud(f, 6);
  close(mudTotal(f), 6, 1e-3);
  assert.ok(depthAt(f, 3, 8) > 0.1 && depthAt(f, 8, 8) === 0 && depthAt(f, 12.5, 8) === 0, 'in the pit, the rest dry');
  close(surfaceAt(f, 3, 8), surfaceAt(f, 4.5, 3), 1e-4, 'level');
  assert.equal(surfaceAt(f, 8, 8), -Infinity);
  settle(f, [0, 0], false, 3);
  close(mudTotal(f), 6, 1e-3, 'it stays as it is');
  close(depthAt(f, 3, 8), depthAt(f, 4.5, 3), 0.01);
  // what the physics gets: each wet cell's surface, NaN where dry
  const cells = cellSurfaces(f);
  assert.ok(Number.isFinite(cells[8 * N + 3]) && Number.isNaN(cells[8 * N + 8]) && Number.isNaN(cells[0]));
  // the ground's levels from the plane solve as well (game/mud.js fills the mire so)
  close(mudLevel([{ x: 0, z: 0, h: 0, a: 4 }], 2), 0.5, 1e-6); close(mudVolume([{ x: 0, z: 0, h: 0, a: 4 }], 0.5), 2, 1e-9);
  close(planeY(1, [0.1, 0], PIVOT + 2, 0), 1.2, 1e-9);
});

test('a ball of mud lands as a puddle that holds still; tipped, all of it runs downhill, deep at the low side; level again, it levels out', () => {
  const f = newMudField([2, 2, 14, 14], ground);
  fillMud(f, 6);
  assert.ok(depositMud(f, 8, 8, G.mud.ball, G.mud.radius) && depositMud(f, 12.5, 5, G.mud.ball, G.mud.radius));
  close(mudTotal(f), 6 + 2 * G.mud.ball, 1e-3, 'its mud in it');
  assert.ok(depthAt(f, 8, 8) > 0.2, 'a dome where it landed');
  // level: the puddles spread a little and hold (thin mud does not run), on the flat and on the ledge
  settle(f, [0, 0], false, 6);
  assert.ok(depthAt(f, 8, 8) > MUD_FLOW.wet && depthAt(f, 8, 8) < MUD_FLOW.film + 0.02, 'a puddle, thin: ' + depthAt(f, 8, 8));
  assert.ok(depthAt(f, 12.5, 5) > MUD_FLOW.wet, 'on the ledge too');
  assert.equal(depthAt(f, 8, 12), 0, 'not all over the floor');
  const pit = depthAt(f, 3, 8);
  // tipped towards -x: the puddles run down into the pit, and the mud runs deep to its low side
  const g = slopeOf([-1, 0]);
  settle(f, g, true, 1.5);
  assert.ok(depthAt(f, 8, 8) < 0.03, 'running off the middle');
  settle(f, g, true, 8);
  assert.ok(depthAt(f, 8, 8) < MUD_FLOW.wet && depthAt(f, 12.5, 5) < MUD_FLOW.wet, 'the puddles gone into the mud');
  assert.ok(depthAt(f, 2.2, 8) > pit * 1.5, `deep at the low side: ${depthAt(f, 2.2, 8).toFixed(2)}`);
  assert.ok(depthAt(f, 2.2, 8) > depthAt(f, 4.8, 8) + 0.15, 'and shallower up the pit');
  close(mudTotal(f), 6 + 2 * G.mud.ball, 1e-3, 'no mud lost or made');
  // level again: the pit's mud levels out (fuller than at first by the puddles)
  settle(f, [0, 0], false, 10);
  close(depthAt(f, 2.2, 8), depthAt(f, 4.5, 8), 0.04, 'level again');
  assert.ok(depthAt(f, 3, 8) > pit, 'fuller than at first');
  // drained back to what it was (his death)
  for (let t = 0; t < 20; t += 0.1) drainMud(f, 6, 0.25, 0.1);
  close(mudTotal(f), 6, 1e-3);
  // nothing outside the field, nothing on no ground
  assert.equal(depthAt(f, 0.5, 0.5), 0);
  const walled = newMudField([2, 2, 4, 4], (x, z) => x < 3 ? 0 : null);
  assert.ok(!depositMud(walled, 3.5, 3.5, 1, 0.3)); fillMud(walled, 0.5); settle(walled, [1, 0], true, 2);
  close(mudTotal(walled), 0.5, 1e-3); assert.equal(depthAt(walled, 3.5, 3), 0);
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

test('tipped, all of his mud runs to the low side of his mire, none kept in its hollows', () => {
  for (const seed of [1, 2, 3, 8, 42]) {
    const map = mireOf(seed), t = map.tide;
    const at = (x, z) => { const cx = Math.floor(x), cz = Math.floor(z), f = map.cols[cz * N + cx]?.filter(g => !g.kind).sort((a, b) => a.top - b.top)[0]; return f ? floorY(f, x - cx, z - cz) : null; };
    for (const v of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const f = newMudField(t.box, at);
      for (let k = 0; k < f.depth.length; k++) f.depth[k] = Number.isFinite(f.ground[k]) ? Math.max(0, t.rest * LH - f.ground[k]) : 0;
      const vol = mudTotal(f);
      settle(f, slopeOf(v), true, 8);
      close(mudTotal(f), vol, 1e-3, 'no mud lost or made');
      // what lies further than 4 cells from the low side
      let edge = -Infinity, far = 0;
      for (let k = 0; k < f.depth.length; k++) if (Number.isFinite(f.ground[k])) edge = Math.max(edge, (k % f.w) * v[0] + Math.floor(k / f.w) * v[1]);
      for (let k = 0; k < f.depth.length; k++) if (edge - ((k % f.w) * v[0] + Math.floor(k / f.w) * v[1]) > 4 * MUD_RES) far += f.depth[k];
      assert.ok(far / (vol * MUD_RES * MUD_RES) < 0.05, `seed ${seed}, tipped ${v}: ${(100 * far / (vol * MUD_RES * MUD_RES)).toFixed(0)}% left behind`);
    }
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

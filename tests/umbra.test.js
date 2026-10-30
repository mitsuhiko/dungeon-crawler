import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { UMBRA_FIGHT as G, DIVE, phaseFloor, summonCount, airLeft, airText, barred, newTrail, pushTrail, settleTrail, bodyAt, bodyParts,
  radiusAt, steer, swimSpots, nextSpot, ventSpots, ventPhase, inColumn, bombAt, jetVolley, jetWay, inJet, mudSlow, mudLevel, nextMudStep, mudY } from '../src/core/umbra.js';
import { N, LH, HEAD_Y, GRAV, JUMP_V } from '../src/core/constants.js';
import { World } from '../src/world/world.js';
import { BOSSES, bossAt, BOSS_ARENAS } from '../src/core/bosses.js';
import { UMBRA, UMBRA_TWO, UMBRA_THREE, UMBRA_BODY, QUALMOS, DEEP_SQUIRTLE, MURK_SQUIRTLE, ENEMY_KINDS, STAGE_PROFILES, makeEnemy, enemyProfile,
  guardianLevel, hurtBy } from '../src/core/enemies.js';
import { damageEnemy, inSwordArc, SWORD } from '../src/core/combat.js';
import { bossOf } from '../src/core/bossbar.js';
import { EPITHETS, INTROS } from '../src/core/bossintro.js';
import { floorY } from '../src/core/surfaces.js';
import { REEF } from '../src/cubegen/arenashapes.js';

const reefOf = seed => { const w = new World(seed); return state.map = w.cube(w.descentSpec(16).key).map; };
const zoneOf = map => map.floors.filter(f => f.encounter);
const close = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) < eps, `${msg} ${a} vs ${b}`);

test('Umbra takes the place of the descent guardian of depth 16, in his reef', () => {
  assert.equal(BOSSES[16], 'umbra'); assert.equal(bossAt(16), 'umbra'); assert.equal(bossAt(16, 'side'), null);
  assert.equal(BOSS_ARENAS.umbra.type, 'reef');
  assert.equal(ENEMY_KINDS.umbra, UMBRA);
  assert.deepEqual(STAGE_PROFILES.umbra.map(p => p.phase), [1, 2, 3]);
  // three phases, each quicker; Qualmos at the core still has the most health of all
  assert.ok(UMBRA_TWO.chase > UMBRA.chase && UMBRA_THREE.chase > UMBRA_TWO.chase && UMBRA_THREE.cooldown < UMBRA.cooldown);
  assert.ok(enemyProfile(UMBRA, guardianLevel(16, 'descent')).hp < enemyProfile(QUALMOS, 22).hp);
  assert.ok(EPITHETS.umbra && INTROS.umbra?.reveal === 'umbra');
});

test('his reef: hills rising out of the bottom, walked up and down; the water stands far over all of it', () => {
  for (const seed of [0, 1, 2, 7, 42, 123]) {
    const map = reefOf(seed), d = map.dive, level = map.portals[0].y / LH, zone = zoneOf(map);
    assert.equal(map.arena.type, 'reef', `${seed}`);
    assert.ok(d, `${seed}: the reef's water`);
    assert.deepEqual(d.box, [1, 1, N - 1, N - 1]);
    // its lowest floor is the fight's, the surface far over its highest (and over his head on it)
    const tops = zone.map(f => f.top * LH);
    close(d.low, Math.min(...tops), 1e-9, `${seed} low`);
    assert.ok(d.surface >= Math.max(...tops) + 2.5, `${seed}: surface ${d.surface} over ${Math.max(...tops)}`);
    close(d.surface, (level + REEF.surface) * LH, 1e-9);
    // hilly: a spire and other hills, the ground two cells and more higher at its highest than at its lowest
    assert.ok(d.hills.some(h => h.spire), `${seed}: a spire`);
    assert.ok(d.hills.length >= 3, `${seed}: ${d.hills.length} hills`);
    assert.ok(Math.max(...tops) - Math.min(...tops) >= 2, `${seed}: relief ${Math.max(...tops) - Math.min(...tops)}`);
    // nothing in the fight's zone blocks: a long body swims down onto it
    for (const f of zone) assert.equal(map.staticBlockers[f.c].length, 0, `${seed}: blocker at ${f.x},${f.z}`);
    // the suit's stand: in the middle of the room, on a floor of the fight, off his spot
    const s = d.stand, f = map.floors[Math.floor(s.z) * N + Math.floor(s.x)];
    assert.ok(f.encounter, `${seed}: the stand on the fight's ground`);
    close(floorY(f, s.x - f.x, s.z - f.z), s.y, 0.05, `${seed}: the stand on its floor`);
    assert.ok(Math.hypot(s.x - N / 2, s.z - N / 2) < 3, `${seed}: in the middle: ${s.x}, ${s.z}`);
    assert.ok(Math.hypot(s.x - map.guardian.x, s.z - map.guardian.z) > 1.4, `${seed}: off his spot`);
  }
});

test('he swims over the hilltops at the height a blade reaches from them', () => {
  for (const seed of [0, 1, 7]) {
    const d = reefOf(seed).dive, spots = swimSpots(d.hills, d.low, d.surface);
    for (const h of d.hills) {
      const s = spots.find(p => p.hill === h), r = G.body.radius, y = s.y - r;
      // a hero on top: the blade's band (knee to chest) meets his body there
      const hero = { x: s.x, y: h.top, z: s.z - 0.6, yaw: 0, sword: { active: true, t: SWORD.activeStart, hits: new Set(), stats: SWORD } };
      const body = { x: s.x, y, z: s.z, mode: 'chase', profile: { ...UMBRA, radius: r, bodyHeight: 2 * r } };
      assert.ok(inSwordArc(hero, body), `${seed}: over the hill at ${h.x.toFixed(1)},${h.z.toFixed(1)}`);
    }
    // and higher over the deep, out of reach there
    for (const s of spots.filter(p => p.high)) assert.ok(s.y < d.surface && s.y > d.low + 2);
    assert.notEqual(nextSpot(spots, spots[0], 0), spots[0]);
  }
});

test('his body is the way his head went: as long as he is, thick as he is, following it', () => {
  const t = newTrail({ x: 8, y: 3, z: 8 }, [0, 0, 1]);
  close(bodyAt(t, 0).z, 8); close(bodyAt(t, 4).z, 4, 1e-6);
  // the head swims on round a corner: the body after it, the length the same
  for (let i = 1; i <= 40; i++) pushTrail(t, { x: 8 + i * 0.1, y: 3, z: 8 });
  close(bodyAt(t, 0).x, 12, 1e-6); close(bodyAt(t, 2).x, 10, 0.05);
  const tail = bodyAt(t, G.body.length);
  close(Math.hypot(tail.x - 8, tail.z - 8) + 4, G.body.length, 0.15, 'tail along the old way');
  let len = 0;
  for (let i = 1; i < t.pts.length; i++) len += Math.hypot(t.pts[i].x - t.pts[i - 1].x, t.pts[i].z - t.pts[i - 1].z);
  assert.ok(len >= G.body.length && len < G.body.length + 1.2, `kept ${len}`);
  // thickest behind the head, thin at the tail; his parts along it
  assert.ok(radiusAt(0.3) === G.body.radius && radiusAt(1) < radiusAt(0.7) && radiusAt(0) === G.body.head);
  const parts = bodyParts(t);
  assert.equal(parts.length, G.body.parts);
  parts.forEach((p, i) => i && assert.ok(p.s > parts[i - 1].s));
  // beaten, it sinks onto the bottom
  const flat = () => 1;
  for (let i = 0; i < 200; i++) settleTrail(t, flat, 1 / 30);
  for (const p of t.pts) assert.ok(p.y >= 1 && p.y < 1.5);
});

test('his head steers: never into the floor, out of the water or through the walls; turning only so fast', () => {
  const ground = (x, z) => x > 6 && x < 10 ? 3 : 1, opts = { speed: 3, turn: G.swim.turn, surface: 7, ground };
  const h = { x: 2, y: 1.8, z: 8, dx: 1, dy: 0, dz: 0 };
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const before = [h.dx, h.dy, h.dz];
    steer(h, { x: 14, y: 1.8, z: 8 }, 1 / 60, opts);
    worst = Math.max(worst, Math.acos(Math.min(1, before[0] * h.dx + before[1] * h.dy + before[2] * h.dz)));
    assert.ok(h.y >= ground(h.x, h.z) + G.swim.clear - 1e-6, `over the ground at ${h.x}`);
    assert.ok(h.y <= 7 - G.swim.top + 1e-6 && h.x > 1 && h.x < N - 1);
  }
  assert.ok(worst <= G.swim.turn / 60 + 1e-6, `turned ${worst}`);
  assert.ok(h.x > 12, 'got over the hill');
  close(Math.hypot(h.dx, h.dy, h.dz), 1);
});

test('three phases: what each brings, the earthquake and the jets first when due', () => {
  assert.equal(phaseFloor(3000, 1), 2000); assert.equal(phaseFloor(3000, 2), 1000); assert.equal(phaseFloor(3000, 3), 0);
  const p1 = barred({ phase: 1, due: { quake: false, vents: true, jets: true, shield: true, summon: true }, near: true });
  assert.ok(p1.has('jets') && p1.has('shield') && !p1.has('vents') && !p1.has('bite') && !p1.has('summon'));
  assert.ok(barred({ phase: 1, near: false }).has('bite'));
  const p2 = barred({ phase: 2, due: { jets: true, vents: true }, near: true });
  assert.deepEqual([...ALL].filter(n => !p2.has(n)), ['jets']);
  assert.deepEqual([...ALL].filter(n => !barred({ phase: 3, due: { quake: true, jets: true } }).has(n)), ['jets']);
  assert.deepEqual([...ALL].filter(n => !barred({ phase: 3, due: { quake: true } }).has(n)), ['quake']);
  assert.equal(summonCount(1, 0), 2); assert.equal(summonCount(3, 1), 2); assert.equal(summonCount(2, 2), 0);
  // the squirtles of his deep, and of his mud
  assert.ok(DEEP_SQUIRTLE.minion && DEEP_SQUIRTLE.free && !DEEP_SQUIRTLE.dwells && MURK_SQUIRTLE.drawn);
});
const ALL = ['bite', 'wave', 'quake', 'vents', 'summon', 'jets', 'shield'];

test('a blow on his body is his; his shield holds it off, lying on the bottom he takes more', () => {
  const e = makeEnemy({ id: 'u', level: 18, x: 8, y: 2, z: 8, guardian: true, guardianRole: 'descent', boss: 'umbra' }, UMBRA);
  const s = makeEnemy({ id: 'u:body:0', level: 18, x: 9, y: 2, z: 8, guardian: true, guardianRole: 'descent' }, UMBRA_BODY);
  s.host = e;
  Object.defineProperty(s, 'hp', { get: () => e.hp, set: () => {} });
  Object.assign(e, { mode: 'chase', hpFloor: 0 }); s.mode = 'chase';
  const full = e.hp;
  assert.ok(damageEnemy(s, 100));
  assert.equal(e.hp, full - 100); assert.equal(s.hp, e.hp);
  e.shield = 2;
  assert.ok(!damageEnemy(s, 100)); assert.equal(e.hp, full - 100);
  e.shield = 0;
  // the earthquake: lying on the bottom after the slam, exposed
  Object.assign(e, { mode: 'attack', attack: UMBRA.attacks.findIndex(a => a.name === 'quake'), t: 2 });
  assert.equal(hurtBy(s), 1.5); assert.equal(hurtBy(e), 1.5);
  // the bar is his, never his body's
  assert.equal(bossOf([s, e], { x: 9, z: 8 }), e);
  assert.ok(UMBRA_BODY.intangible && UMBRA_BODY.viewless && UMBRA.intangible);
});

test('the volcanoes: apart, round the hero, warning first; their columns burn up through the water', () => {
  const floors = [];
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) floors.push({ x: x + 0.5, y: 1, z: z + 0.5 });
  const spots = ventSpots(floors, 8, 8, 3, 7);
  assert.equal(spots.length, 3);
  for (const a of spots) {
    const d = Math.hypot(a.x - 8, a.z - 8);
    assert.ok(d >= G.vents.near[0] && d <= G.vents.near[1]);
    for (const b of spots) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= G.vents.apart);
  }
  assert.deepEqual(ventSpots(floors, 8, 8, 3, 7), spots);
  const v = { x: 4, y: 1, z: 4, t: 0 };
  assert.equal(ventPhase(v), 'warn'); assert.ok(!inColumn(v, 4, 1, 4));
  v.t = G.vents.warn + 0.5;
  assert.equal(ventPhase(v), 'erupt'); assert.ok(inColumn(v, 4.3, 3, 4)); assert.ok(!inColumn(v, 5.5, 1, 4)); assert.ok(!inColumn(v, 4, 7, 4));
  v.t = G.vents.warn + G.vents.erupt + 0.1;
  assert.equal(ventPhase(v), 'done');
  for (let k = 0; k < 10; k++) { const b = bombAt(v, k, 3), d = Math.hypot(b.dx, b.dz); assert.ok(d >= G.vents.spread[0] - 1e-9 && d <= G.vents.spread[1] + 1e-9); }
});

test('the jets: from the walls across the room, a hill in the way shelters you; from above onto a circle', () => {
  const flat = () => 1, hill = (x, z) => x > 6 && x < 8 ? 3 : 1;
  const j = { kind: 'wall', side: 0, u: 8 };
  assert.ok(inJet(j, { x: 10, y: 1, z: 8 }, 1.55, flat));
  assert.ok(!inJet(j, { x: 10, y: 1, z: 8 }, 1.55, hill), 'behind the hill');
  assert.ok(!inJet(j, { x: 10, y: 1, z: 11 }, 1.55, flat), 'beside it');
  assert.ok(!inJet(j, { x: 10, y: 3, z: 8 }, 1.55, flat), 'over it');
  assert.deepEqual(jetWay(0), [1, 0]); assert.deepEqual(jetWay(3), [0, -1]);
  // the other walls run the other ways, the right way round
  assert.ok(inJet({ kind: 'wall', side: 1, u: 8 }, { x: 4, y: 1, z: 8 }, 1.55, (x, z) => x > 9 && x < 11 ? 0 : 1));
  assert.ok(!inJet({ kind: 'wall', side: 1, u: 8 }, { x: 4, y: 1, z: 8 }, 1.55, hill));
  assert.ok(inJet({ kind: 'down', x: 5, z: 5 }, { x: 5.6, y: 9, z: 5 }, 0)); assert.ok(!inJet({ kind: 'down', x: 5, z: 5 }, { x: 7, y: 1, z: 5 }, 0));
  // a volley: one at the hero for sure, the rest round about; the same seed, the same jets
  for (let seed = 0; seed < 20; seed++) {
    const v = jetVolley(seed, 6, 9);
    assert.deepEqual(v, jetVolley(seed, 6, 9));
    assert.ok(v.length >= 1 && v.length <= G.jets.walls[1] + G.jets.downs[1]);
    const first = v[0];
    assert.ok(Math.abs(first.u - (first.side < 2 ? 9 : 6)) < 0.5, `aimed ${JSON.stringify(first)}`);
    for (const j of v) if (j.kind === 'wall') assert.ok(j.u >= 2 && j.u <= N - 2);
  }
});

test('his mud only slows, the deeper the more; it rises in steps that leave the high ground dry', () => {
  assert.equal(mudSlow(0), 1); assert.equal(mudSlow(-1), 1);
  for (let d = 0.05; d < 1.5; d += 0.05) assert.ok(mudSlow(d) <= mudSlow(d - 0.05) && mudSlow(d) >= 0.35);
  assert.equal(mudSlow(HEAD_Y + 0.1), 0.35);
  let m = { step: -1, from: 0, t: 0 };
  assert.equal(mudLevel(m), 0);
  m = nextMudStep(m, 0.99); m.t = G.mud.rise;
  close(mudLevel(m), G.mud.steps[0]);
  m = nextMudStep(m, 0.99); m.t = G.mud.rise; close(mudLevel(m), G.mud.steps[1]);
  m = nextMudStep(m, 0.01); m.t = G.mud.rise; close(mudLevel(m), G.mud.steps[0], 1e-9, 'ebbs');
  // its highest step: under the spire's top in every reef, the spire walked onto from the hills
  for (const seed of [0, 1, 2, 7]) {
    const d = reefOf(seed).dive, spire = d.hills.find(h => h.spire), top = mudY({ step: G.mud.steps.length - 1, from: 0, t: G.mud.rise }, d.low);
    assert.ok(spire.top > top + 0.2, `${seed}: spire ${spire.top} over mud ${top}`);
  }
});

test('under water: slower, a higher and slower jump; four minutes of air', () => {
  assert.ok(DIVE.walk < 1 && DIVE.attack < 1 && DIVE.shots < 1);
  const plain = JUMP_V * JUMP_V / (2 * GRAV), diving = (JUMP_V * DIVE.jump) ** 2 / (2 * GRAV * DIVE.gravity);
  assert.ok(diving > plain * 1.3 && diving < 2.6 * LH * 2, `${plain} -> ${diving}`);
  assert.equal(G.air, 240);
  assert.equal(airLeft(0), 240); assert.equal(airLeft(250), 0); assert.equal(airLeft(-5), 240);
  assert.equal(airText(240), '4:00'); assert.equal(airText(61.2), '1:02'); assert.equal(airText(0), '0:00');
});

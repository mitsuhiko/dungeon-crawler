// Sollmeldon's fight (core/sollmeldon.js has the rules, docs/bosses.md tells it): this cube's
// Sollmeldon and the Mud squirtles he calls, in one list (`sollmeldons`), so they fight, collide,
// travel and get shown to friends like any enemy. Each Sollmeldon has a fight of his own here: { e
// (him), tilt (the world's, core/sollmeldon.js newTilt), up (flying), flight (s till he takes off,
// or, up, till he comes down), cool (s to the next summon), next (the head that bites next), bit
// (the attack whose bite chose it), cut (the head being cut off), minions }. A dev spawn
// (game/devspawn.js) gets one too; out of his mire there is no mud (the world still tips).
//
// On him, sent to friends with his row (net/protocol.js): `stage` (1 .. 3: his profile,
// core/enemies.js STAGE_PROFILES), `heads` (a bit each, core/sollmeldon.js HEAD_SIDE), `cutting`
// (the head being cut off, -1: none), `lift` (how high he flies), `tilt` (the way the world is
// tipped and how far: game/tilt.js tips the view, game/mud.js pulls the mud) and `drops` (his mud
// landing: [n, x, z, vol, r] each, the last few, numbered: every game pours each into its mud once).
// Movement and attacks are the shared enemy AI's (game/enemyai.js): the fight says which attacks
// may start (`barred`: the bite of the head that is next, the mud he rains while up), throws the
// balls of mud (`cast` 'spit': one from each head he has, lobbed at the player, bursting where they
// land, game/projectiles.js) and drops their mud where they land (`landed`: game/mud.js), carries
// out the summons, lifts him and lands him (the world tips where he lands), and cuts his heads off. While a head is cut off
// (mode 'split') the AI leaves him be.
import { player, state, setStatus } from './state.js';
import { STAGE_PROFILES, ENEMY_KINDS, SOLLMELDON, makeEnemy, enemyProfile, attackOf, enemyName, blowOf } from '../core/enemies.js';
import { SOLLMELDON_FIGHT as G, ALL_HEADS, BITES, headsOf, nextHead, headToCut, sideOf, phaseFloor, summonCount, barred, stepLift,
  flying, groundTime, airTime, newTilt, tiltToward, levelTilt, stepTilt, PIVOT, dropOf } from '../core/sollmeldon.js';
import { muzzleAt } from '../core/beams.js';
import { launch } from '../core/projectiles.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { removeEnemyViews } from '../render/enemies.js';
import { living, engage, leave, minionFloors, minion, sweep, players, nearest } from './bossfight.js';
import { hitBody, attacker } from './enemycombat.js';
import { addProjectile } from './projectiles.js';
import { summonFx, tremor } from './juice.js';
import { relay } from '../net/online.js';
import { sfx } from '../audio/sfx.js';
import { tr, msg } from '../i18n/i18n.js';

export let sollmeldons = [];
let fights = [];
const between = ([a, b]) => a + (b - a) * Math.random();
// how many of his last drops of mud go along with him (every game pours each in once: game/mud.js)
const DROPS = 24;

export function resetSollmeldons() {
  removeEnemyViews(sollmeldons);
  sollmeldons = []; fights = [];
  addSollmeldons(enemySpots(state.map, SOLLMELDON).filter(s => !state.run.defeated.has(s.id)).map((s, i) => makeEnemy(s, s.kind ?? SOLLMELDON, i)));
}
// Sollmeldons to fight: this cube's, or spawned with the dev tools
export function addSollmeldons(list) {
  for (const e of list) {
    Object.assign(e, { stage: 1, heads: ALL_HEADS, cutting: -1, lift: 0, tilt: [0, 0], drops: [], hpFloor: phaseFloor(e.profile.hp, 1) });
    const f = { e, tilt: newTilt(), up: false, flight: groundTime(1), cool: G.firstSummon[0], spitIn: G.spit.first, spat: -1, next: nextHead(ALL_HEADS, -1), bit: -1, cut: -1,
      minions: [], n: 0, dropped: 0, nonce: Math.random().toString(36).slice(2, 7), over: false, seed: (Math.random() * 1e9) >>> 0 };
    e.barred = barred({ phase: 1, next: f.next });
    e.summon = a => summon(f, a);
    e.cast = a => cast(f, a);
    e.landed = pr => mudLanded(f, pr);
    fights.push(f); sollmeldons.push(e);
  }
}
export function detachSollmeldons() { const list = sollmeldons; sollmeldons = []; fights = []; return list; }

export function updateSollmeldons(dt) {
  for (const f of fights) run(f, dt);
  for (const e of sollmeldons) if (e.shield > 0) e.shield = Math.max(0, e.shield - dt);
  stepEnemies(sollmeldons.filter(e => e.mode !== 'gone' && e.mode !== 'split'), dt);
  sollmeldons = sweep(sollmeldons, dt);
  fights = fights.filter(f => sollmeldons.includes(f.e));
}

function run(f, dt) {
  const e = f.e, a = e.mode === 'attack' ? attackOf(e) : null;
  f.minions = f.minions.filter(m => living(m) && sollmeldons.includes(m));
  stepTilt(f.tilt, dt);
  e.tilt = [...f.tilt.v];
  if (e.mode === 'dead') {   // down onto the floor; the world levels, his mud drains, his squirtles go
    e.lift = stepLift(e.lift, 0, dt);
    if (!f.over) {
      f.over = true; levelTilt(f.tilt);
      Object.assign(e, { drops: [], cutting: -1 });
      f.minions.forEach(m => leave(m, G.leave)); f.minions = [];
    }
    return;
  }
  if (e.mode === 'split') {   // a head being cut off
    e.t += dt;
    e.lift = stepLift(e.lift, 0, dt);
    if (e.cutting >= 0 && e.heads & (1 << e.cutting) && e.t >= G.cutAt) e.heads &= ~(1 << e.cutting);   // (it comes off)
    if (f.cut !== e.cutting && e.t >= G.cutLand) severed(f);
    if (e.t >= G.cut) changed(f);
    return;
  }
  // the head that bites next: chosen as a bite starts (another than the one biting)
  if (a && BITES.includes(a.name) && f.bit !== e.attacks) { f.bit = e.attacks; f.next = nextHead(e.heads, a.head); }
  if (a?.name === 'spit' && f.spat !== e.attacks) { f.spat = e.attacks; f.spitIn = between(G.spit.every); }
  const fighting = !['idle', 'walk', 'home', 'search'].includes(e.mode);
  if (fighting) {
    f.cool -= dt; f.spitIn -= dt;
    // up in the air a while, then down (not in the middle of an attack)
    if (e.mode !== 'attack') f.flight -= dt;
    if (f.flight <= 0 && e.mode !== 'attack') {
      f.up = !f.up;
      f.flight = f.up ? airTime(e.stage) : Infinity;   // (down: from the landing on)
      if (f.up) takeOff(f);
    }
  }
  const was = e.lift;
  e.lift = stepLift(e.lift, f.up ? G.lift.up : 0, dt);
  if (!f.up && was > 0.05 && e.lift <= 0.05) landed(f);
  e.barred = barred({ phase: e.stage, next: f.next, up: flying(e.lift) || f.up,
    summonDue: f.cool <= 0 && summonCount(e.stage, f.minions.length) > 0 && !f.up, spitDue: f.spitIn <= 0 });
  if (e.stage < 3 && e.hp <= e.hpFloor && e.mode !== 'attack') cut(f);
}

// up into the air: the world levels as he leaves the ground
function takeOff(f) {
  const e = f.e;
  levelTilt(f.tilt);
  sfx('gust', { at: e, pitch: 0.5, volume: 1 });
  e.flaps = (e.flaps ?? 0) + 1;   // (render/sollmeldonview.js: a gust of dust under his wings)
}
// Down with a thump: whoever is near is knocked back, and the world tips towards where he landed
// (from the middle of the cube; landing in the middle, the way he faces)
function landed(f) {
  const e = f.e;
  f.flight = groundTime(e.stage);
  e.touched = (e.touched ?? 0) + 1;   // (render/sollmeldonview.js puffs the mud)
  if (Math.hypot(e.x - player.x, e.z - player.z) < 24) { sfx('thud', { at: e, pitch: 0.45, volume: 1 }); tremor.a = Math.max(tremor.a, 0.05); }
  const L = G.land, blow = { ...blowOf(e.profile, { power: L.power, knock: L.knock, hop: 3, knockDown: false, reason: msg('Knocked over by Sollmeldon!') }), by: attacker(e) };
  for (const p of players()) {
    const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
    if (d < L.reach + (p.r ?? 0.3) && Math.abs(p.y - e.y) < 1.5) hitBody(p, blow, e.x, e.z, d ? dx / d : 1, d ? dz / d : 0);
  }
  tiltToward(f.tilt, e.x - PIVOT, e.z - PIVOT, Math.sin(e.yaw), Math.cos(e.yaw));
  setStatus(tr('{name} lands and the world tips!', { name: enemyName(e.profile) }));
}

// Down to the next phase's share of his health: a head is cut off, the one nearest whoever struck
// the last blow (else the player nearest him), nothing hurting him meanwhile
function cut(f) {
  const e = f.e, by = e.lastHit == null ? player : players().find(b => b.slot === e.lastHit) ?? nearest(e);   // (game/sword.js)
  const head = headToCut(e.heads, sideOf(e.x, e.z, e.yaw, by.x, by.z));
  Object.assign(e, { mode: 'split', speed: 0, path: null, t: 0, cutting: head, shield: G.cut + G.appear });
  f.up = false;
  levelTilt(f.tilt);
  setStatus(tr('{name}\'s head comes off!', { name: enemyName(e.profile) }));
  sfx('morph', { at: e, pitch: 0.7 });
}
// the head that came off lands as a big puddle of mud by him (blender/sollmeldon.py reads where it
// lands off its clip: SOLLMELDON_AT.cut)
function severed(f) {
  const e = f.e, at = muzzleAt(e, e.profile.cut[e.cutting]);
  f.cut = e.cutting;
  e.heads &= ~(1 << e.cutting);
  drop(f, at.x, at.z, G.mud.head, G.mud.headRadius);
  sfx('splorch', { at, pitch: 0.5, volume: 1 });
}
function changed(f) {
  const e = f.e;
  if (e.cutting >= 0 && f.cut !== e.cutting) severed(f);
  e.stage++;
  e.profile = enemyProfile(STAGE_PROFILES.sollmeldon[e.stage - 1], e.level);
  Object.assign(e, { attack: 0, t: 0, cool: 0.8, shield: G.appear, cutting: -1, hpFloor: phaseFloor(e.profile.hp, e.stage) });
  Object.assign(f, { up: false, flight: groundTime(e.stage, Math.random(), true), cool: G.firstSummon[e.stage - 1], next: nextHead(e.heads, -1) });
  engage(e);
}

// A cast's hit frame: a ball of mud from every head he has, lobbed at the player (`rain`, from up
// in the air: at their feet, give or take a little)
function cast(f, a) {
  if (a.cast !== 'spit') return;
  const e = f.e, p = e.target?.here ? e.target : nearest(e);
  for (const i of headsOf(e.heads)) {
    // (up in the air: from where his head is, his lift on top)
    const [mx, my, mz] = a.mud.muzzles[i], spec = { ...a.mud, muzzle: [mx, my + (e.lift ?? 0), mz], becomes: 'mud' };
    const d = a.name === 'rain' ? dropOf(f.seed + e.attacks * 3 + i) : { dx: 0, dz: 0 };
    const pr = launch(e, spec, { x: p.x + d.dx, y: p.y + 0.2, z: p.z + d.dz });
    Object.assign(pr, { blow: { ...blowOf(e.profile, a), by: attacker(e) }, profile: e.profile, thrower: e });
    addProjectile(pr);
    relay.launch?.(pr, e);
  }
}
// a ball of mud landed (on a player, the level, or flew its range out): its mud drops there
function mudLanded(f, pr) {
  if (f.e.mode === 'dead') return;
  const l = Math.hypot(pr.vx, pr.vz) || 1;
  drop(f, pr.x - pr.vx / l * 0.15, pr.z - pr.vz / l * 0.15, G.mud.ball, G.mud.radius);
}
// mud dropped at (x, z): into his mud (game/mud.js), in every game
function drop(f, x, z, vol, r) {
  const e = f.e;
  e.drops = [...e.drops, [++f.dropped, Math.round(x * 100) / 100, Math.round(z * 100) / 100, vol, r]].slice(-DROPS);
}

// a summon's hit frame: Mud squirtles come up out of his mud (the nearest of it deep enough: game/
// bossfight.js minionFloors), as many as fill up to the most
function summon(f, a) {
  const e = f.e, kind = ENEMY_KINDS[a.summon.kind], n = summonCount(e.stage, f.minions.length);
  f.cool = G.summonCool[e.stage - 1];
  if (!n) return;
  const list = minionFloors(e, kind, n, sollmeldons.filter(living), { ahead: 2.4, within: 7, wide: 12 }).map(s => {
    const m = minion(e, `${e.id}:minion:${f.nonce}${++f.n}`, kind, s, e.yaw + (Math.random() - 0.5) * 2, f.n);
    Object.assign(m, { cool: 0.6 + Math.random(), under: 1, pop: true, dig: 0.2 + Math.random() * 0.3 });   // (they pop out of the mud)
    return m;
  });
  sollmeldons.push(...list); f.minions.push(...list);
  if (list.length) summonFx(muzzleAt(e, a.summon.muzzle), list, 'mud');
}

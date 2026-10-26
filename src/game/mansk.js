// Mansk's fight (core/mansk.js has the rules, docs/bosses.md tells it): this cube's Mansk and the
// Tornados he calls, in one list (`mansks`), so they fight, collide, travel and get shown to
// friends like any enemy. Each Mansk has a fight of his own here: { e (him), down (landed now),
// flight (s until he goes up or down again), cool (s to the next summon), orbsIn, slowIn (s until
// those may come again), change (s left of changing), gulped (the inhale that has had its gulp),
// minions }. A dev spawn (game/devspawn.js) gets one too.
//
// On him: `stage` (1 .. 3: his profile, core/enemies.js STAGE_PROFILES), `lift` (how high he floats
// over his floor: core/enemies.js baseY; what a blade or a shot can reach goes by it), `horns` (1
// whole, 0 broken off), `grow` (how far his ribbons are out, 0 .. 1) and `slowing` (s left of the
// time he slowed), all sent to friends with his row (net/protocol.js).
// Movement and attacks are the shared enemy AI's (game/enemyai.js): the fight says which attacks
// may start (`barred`), makes the balls of light (`cast` 'orbs': held at his horns, then thrown,
// game/projectiles.js), carries out the summons (`summon`), lets the time go slow for his Tornados
// (`cast` 'slow'; every game slows its own player: manskSeen), puts what his breath brought to his
// mouth into it (the spit, a grab: game/grab.js), lifts him and lands him, and changes his phase.
// While he changes (mode 'split') the AI leaves him be.
import { player, state, setStatus } from './state.js';
import { STAGE_PROFILES, ENEMY_KINDS, MANSK, makeEnemy, enemyProfile, attackOf, enemyName, blowOf } from '../core/enemies.js';
import { MANSK_FIGHT as G, phaseFloor, summonCount, barred, liftFor, stepLift, lowEnough, orbSpot } from '../core/mansk.js';
import { muzzleAt } from '../core/beams.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { removeEnemyViews } from '../render/enemies.js';
import { living, engage, leave, minionFloors, minion, sweep, players } from './bossfight.js';
import { hitBody, attacker, slowPlayer } from './enemycombat.js';
import { holdProjectile } from './projectiles.js';
import { summonFx } from './juice.js';
import { sfx } from '../audio/sfx.js';
import { tr } from '../i18n/i18n.js';

export let mansks = [];
let fights = [];
const between = ([a, b]) => a + (b - a) * Math.random();
// what needs him down on the floor (he lands for it and stays down till it is over)
const LOW = new Set(['inhale', 'spit', 'lash', 'whirl']);

export function resetMansks() {
  removeEnemyViews(mansks);
  mansks = []; fights = [];
  addMansks(enemySpots(state.map, MANSK).filter(s => !state.run.defeated.has(s.id)).map((s, i) => makeEnemy(s, s.kind ?? MANSK, i)));
}
// Mansks to fight: this cube's, or spawned with the dev tools
export function addMansks(list) {
  for (const e of list) {
    Object.assign(e, { stage: 1, lift: G.lift.low, horns: 1, grow: 0, slowing: 0, hpFloor: phaseFloor(e.profile.hp, 1) });
    const f = { e, down: false, flight: between(G.flight[0].up), cool: G.firstSummon[0], orbsIn: 2, slowIn: G.slow.first[0], change: 0,
      inhaleIn: G.inhale.first[0], breath: -1, gulped: -1, minions: [], n: 0, nonce: Math.random().toString(36).slice(2, 7), over: false };
    e.barred = barred({ phase: 1 });
    e.summon = a => summon(f, a);
    e.cast = a => cast(f, a);
    fights.push(f); mansks.push(e);
  }
}
export function detachMansks() { const list = mansks; mansks = []; fights = []; return list; }

export function updateMansks(dt) {
  for (const f of fights) run(f, dt);
  for (const e of mansks) if (e.shield > 0) e.shield = Math.max(0, e.shield - dt);
  stepEnemies(mansks.filter(e => e.mode !== 'gone' && e.mode !== 'split'), dt);
  for (const f of fights) gulp(f);
  mansks = sweep(mansks, dt);
  fights = fights.filter(f => mansks.includes(f.e));
}

function run(f, dt) {
  const e = f.e, a = e.mode === 'attack' ? attackOf(e) : null;
  f.minions = f.minions.filter(m => living(m) && mansks.includes(m));
  // time slowed: his Tornados live slower (core/status.js enemySlow), he does not
  e.slowing = Math.max(0, e.slowing - dt);
  for (const m of f.minions) m.warp = e.slowing > 0 && e.mode !== 'dead' ? G.slow.minions : 1;
  if (e.mode === 'dead') {   // down onto the floor; his Tornados go with him
    e.lift = stepLift(e.lift, 0, dt);
    if (!f.over) { f.over = true; e.slowing = 0; f.minions.forEach(m => { m.warp = 1; leave(m, G.leave); }); f.minions = []; }
    return;
  }
  if (e.mode === 'split') {   // changing: up into the air, or his horns breaking and his ribbons coming out
    e.t += dt;
    e.lift = stepLift(e.lift, e.stage === 1 ? G.lift.up : G.lift.low, dt);
    if (e.stage === 2 && e.horns && e.t >= G.breakAt) e.horns = 0;
    if (!e.horns) e.grow = Math.min(1, Math.max(0, (e.t - G.breakAt) / G.grow));
    if ((f.change -= dt) <= 0) changed(f);
    return;
  }
  if (!e.horns) e.grow = Math.min(1, e.grow + dt / G.grow);
  const fighting = !['idle', 'walk', 'home', 'search'].includes(e.mode);   // (chasing, attacking, holding his post at the player: defend)
  if (fighting) {
    f.cool -= dt; f.orbsIn -= dt; f.slowIn -= dt; f.inhaleIn -= dt;
    // a breath he starts sets the time to the next one
    if (a?.name === 'inhale' && f.breath !== e.attacks) { f.breath = e.attacks; f.inhaleIn = between(G.inhale.every); }
    // up in the air and down again (phase 1: floating low, landing now and then); not in the
    // middle of an attack
    if (e.mode !== 'attack' && (f.flight -= dt) <= 0) {
      f.down = !f.down;
      const span = G.flight[e.stage - 1];
      f.flight = between(f.down ? span.down : span.up);
    }
  }
  // down for what needs him low; else as his flight says (out of the fight: floating low)
  const want = a && LOW.has(a.name) ? G.lift.landed : fighting ? liftFor(e.stage, f.down) : G.lift.low;
  const was = e.lift;
  e.lift = stepLift(e.lift, want, dt);
  if (was > 0.05 && e.lift <= 0.05 && want === 0) landed(e);
  e.barred = barred({ phase: e.stage, low: lowEnough(e.lift), inhaleDue: f.inhaleIn <= 0, summonDue: f.cool <= 0 && summonCount(e.stage, f.minions.length) > 0,
    orbsDue: f.orbsIn <= 0, slowDue: f.slowIn <= 0 });
  if (e.stage < 3 && e.hp <= e.hpFloor) split(f);
}

// down to the next phase's share of his health: he stops and changes (render/manskview.js plays
// it), nothing hurting him meanwhile
function split(f) {
  const e = f.e;
  Object.assign(e, { mode: 'split', speed: 0, path: null, t: 0, shield: G.change[e.stage - 1] + G.appear });
  f.change = G.change[e.stage - 1];
  setStatus(e.stage === 1 ? tr('{name} rises into the air!', { name: enemyName(e.profile) }) : tr('{name}\'s horns break!', { name: enemyName(e.profile) }));
  sfx('morph', { at: e, pitch: e.stage === 1 ? 0.8 : 1.1 });
}
function changed(f) {
  const e = f.e;
  e.stage++;
  e.profile = enemyProfile(STAGE_PROFILES.mansk[e.stage - 1], e.level);
  Object.assign(e, { attack: 0, t: 0, cool: 0.8, shield: G.appear, hpFloor: phaseFloor(e.profile.hp, e.stage) });
  if (e.stage === 3) e.horns = 0;
  Object.assign(f, { down: false, flight: between(G.flight[e.stage - 1].up), cool: G.firstSummon[e.stage - 1], slowIn: G.slow.first[e.stage - 1], orbsIn: 1.5,
    inhaleIn: G.inhale.first[e.stage - 1] });
  engage(e);
}
// down on the floor with a thud, the dust blown out round him
function landed(e) {
  if (Math.hypot(e.x - player.x, e.z - player.z) < 24) sfx('thud', { at: e, pitch: 0.6, volume: 0.9 });
  e.touched = (e.touched ?? 0) + 1;   // (render/manskview.js puffs the dust)
}

// a cast's hit frame: the balls of light gather at his horns (and over his diamond), or the time
// goes slow (every game slows its own player: manskSeen; here his Tornados)
function cast(f, a) {
  const e = f.e;
  if (a.cast === 'orbs') {
    f.orbsIn = between(G.orbs.every);
    const n = G.orbs.count[e.stage - 1], spec = a.orb;
    for (let i = 0; i < n; i++) {
      const at = () => muzzleAt(e, orbSpot(spec.tips, spec.diamond, i, performance.now() / 1000));
      holdProjectile(e, a, spec, at(), G.orbs.hang + i * 0.25, pr => Object.assign(pr, at()));
    }
  } else if (a.cast === 'slow') {
    f.slowIn = between([G.slow.every[e.stage - 1], G.slow.every[e.stage - 1] + 4]);
    e.slowing = G.slow.time[e.stage - 1];
  }
}
// a summon's hit frame: Tornados whirl up round him, as many as fill up to the most
function summon(f, a) {
  const e = f.e, kind = ENEMY_KINDS[a.summon.kind], n = summonCount(e.stage, f.minions.length);
  f.cool = G.summonCool[e.stage - 1];
  if (!n) return;
  const list = minionFloors(e, kind, n, mansks.filter(living), { ahead: 1.8, within: 6 }).map(s => {
    const m = minion(e, `${e.id}:minion:${f.nonce}${++f.n}`, kind, s, e.yaw + (Math.random() - 0.5) * 2, f.n);
    m.cool = 0.8 + Math.random();
    return m;
  });
  mansks.push(...list); f.minions.push(...list);
  summonFx(muzzleAt(e, a.summon.muzzle), list, 'wind');
}

// Breathing in: a player whose middle gets to his mouth goes in. Then he chews and spits: the
// attack turns into his spit (like a grab that missed turns into what comes of it, game/enemyai.js
// whiff), and the player is caught in it (a grab of his: held in his mouth, game/grab.js)
function gulp(f) {
  const e = f.e, a = e.mode === 'attack' ? attackOf(e) : null;
  if (a?.name !== 'inhale' || f.gulped === e.attacks || e.t < a.hitAt || e.t > a.hitAt + a.pull.time) return;
  const mouth = muzzleAt(e, a.pull.muzzle), fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
  for (const p of players()) {
    if (p.ragdoll || p.held || p.hp <= 0) continue;
    const dx = p.x - mouth.x, dz = p.z - mouth.z;
    if (Math.hypot(dx, dz) > G.gulp + (p.r ?? 0.3) || dx * fx + dz * fz < -0.4 || Math.abs(p.y + 0.6 - mouth.y) > 1.3) continue;
    f.gulped = e.attacks; f.inhaleIn = G.inhale.gulped;
    const i = e.profile.attacks.findIndex(x => x.name === 'spit');
    Object.assign(e, { attack: i, t: 0, bit: true, speed: 0 });
    e.attacks++;
    const spit = e.profile.attacks[i];
    hitBody(p, { ...blowOf(e.profile, spit), by: attacker(e), grab: e.id }, e.x, e.z, fx, fz);
    sfx('gulp', { at: e, pitch: 0.7, volume: 1 });
    return;
  }
}

// What every game sees of a Mansk (the runner's or a friend's shown copy; game/enemies.js calls it
// for every enemy list): time going slow at his slowing's hit frame slows our own player, and
// one held in his mouth is not seen (main.js hides our hero).
export function manskSeen(list) {
  const h = player.held;
  player.gulped = !!(h && !h.twirl && h.e?.profile?.boss === 'mansk' && h.e.mode === 'attack' && attackOf(h.e).grab?.gulp);
  for (const e of list) {
    if (e.profile?.boss !== 'mansk' || e.mode !== 'attack') continue;
    const a = attackOf(e);
    if (a.cast !== 'slow' || e.t < a.hitAt || e.slowSeen === e.attacks) continue;
    e.slowSeen = e.attacks;
    const time = G.slow.time[(e.stage ?? 2) - 1];
    sfx('clockwind', { at: e, pitch: 0.6, volume: 1 });
    if (player.hp <= 0 || Math.hypot(e.x - player.x, e.z - player.z) > 30 || !time) continue;
    slowPlayer({ time, slow: G.slow.players, weapons: true, source: 'time' });
    setStatus(tr('{name} slows time!', { name: enemyName(e.profile) }));
  }
}

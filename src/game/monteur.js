// Monteur's fight (core/monteur.js has the rules, docs/bosses.md tells it): this cube's Monteur and
// the Moose he calls, in one list (`monteurs`), so they fight, collide, travel and get shown to
// friends like any enemy. Each Monteur has a fight of his own here: { e (him), change (s left of
// changing), cool (s to the next summon), chargeIn, rainIn, spinIn (s until those are due), thrown
// (the throw whose stones are gone), started (the attack whose clock was set), minions }. A dev
// spawn (game/devspawn.js) gets one too.
//
// On him: `stage` (1 the moose, 2 the sun: his profile, core/enemies.js STAGE_PROFILES), `stones`
// (how many float between his antlers, 0 .. 5: the one growing back a share) and `quarter` (0..3:
// how far round he has turned the world: game/roll.js turns every game's view after it), both
// sent to friends with his row (net/protocol.js).
// Movement and attacks are the shared enemy AI's (game/enemyai.js): the fight says which attacks
// may start (`barred`), takes the stones a throw throws, carries out the summons (`summon`) and the
// turn of the world (`cast` 'spin') at their hit frames, and changes his form. His charge is a
// roll that crashes into his dazed `stuck` when it runs into something (game/enemyai.js); the
// stones he rains are read off his attack clock by every game (game/meteors.js). While he changes
// (mode 'split') the AI leaves him be.
import { state, setStatus } from './state.js';
import { MONTEUR, STAGE_PROFILES, ENEMY_KINDS, makeEnemy, enemyProfile, attackOf, enemyName } from '../core/enemies.js';
import { MONTEUR_FIGHT as G, phaseFloor, summonCount, barred, takeStones, growStones, nextQuarter } from '../core/monteur.js';
import { muzzleAt } from '../core/beams.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { removeEnemyViews } from '../render/enemies.js';
import { living, engage, leave, minionFloors, minion, sweep } from './bossfight.js';
import { summonFx } from './juice.js';
import { sfx } from '../audio/sfx.js';
import { tr } from '../i18n/i18n.js';

export let monteurs = [];
let fights = [];
const between = ([a, b]) => a + (b - a) * Math.random();
const IDLE = new Set(['idle', 'walk', 'home', 'search']);

export function resetMonteurs() {
  removeEnemyViews(monteurs);
  monteurs = []; fights = [];
  addMonteurs(enemySpots(state.map, MONTEUR).filter(s => !state.run.defeated.has(s.id)).map((s, i) => makeEnemy(s, s.kind ?? MONTEUR, i)));
}
// Monteurs to fight: this cube's, or spawned with the dev tools
export function addMonteurs(list) {
  for (const e of list) {
    Object.assign(e, { stage: 1, stones: G.stones.most, quarter: 0, hpFloor: phaseFloor(e.profile.hp, 1) });
    const f = { e, change: 0, cool: G.firstSummon[0], chargeIn: between(G.charge.first), rainIn: G.rain.first, spinIn: G.spin.first,
      thrown: -1, started: -1, minions: [], n: 0, nonce: Math.random().toString(36).slice(2, 7), over: false };
    e.barred = barred({ phase: 1, stones: e.stones });
    e.summon = a => summon(f, a);
    e.cast = a => cast(f, a);
    fights.push(f); monteurs.push(e);
  }
}
export function detachMonteurs() { const list = monteurs; monteurs = []; fights = []; return list; }

export function updateMonteurs(dt) {
  for (const f of fights) run(f, dt);
  for (const e of monteurs) if (e.shield > 0) e.shield = Math.max(0, e.shield - dt);
  stepEnemies(monteurs.filter(e => e.mode !== 'gone' && e.mode !== 'split'), dt);
  monteurs = sweep(monteurs, dt);
  fights = fights.filter(f => monteurs.includes(f.e));
}

function run(f, dt) {
  const e = f.e, a = e.mode === 'attack' ? attackOf(e) : null;
  f.minions = f.minions.filter(m => living(m) && monteurs.includes(m));
  if (e.mode === 'dead') {   // the world turns back the right way up (game/roll.js); his Moose go with him
    if (!f.over) { f.over = true; e.quarter = 0; f.minions.forEach(m => leave(m, G.leave)); f.minions = []; }
    return;
  }
  // his stones: those he throws are gone at the throw, then grow back one by one
  if (a?.projectile?.stones && e.bit && f.thrown !== e.attacks) { f.thrown = e.attacks; e.stones = takeStones(e.stones, a.projectile.stones); }
  e.stones = growStones(e.stones, dt);
  if (e.mode === 'split') {   // changing; then back into the fight as the sun
    e.t += dt;
    if ((f.change -= dt) <= 0) changed(f);
    return;
  }
  if (!IDLE.has(e.mode)) {   // (in the fight: chasing, attacking, holding his post at the player)
    f.cool -= dt; f.chargeIn -= dt;
    if (e.stage === 2) { f.rainIn -= dt; f.spinIn -= dt; }
  }
  // an attack he starts sets its own clock
  if (a && f.started !== e.attacks) {
    f.started = e.attacks;
    if (a.roll) f.chargeIn = between(G.charge.every);
    if (a.rain) f.rainIn = between(G.rain.every);
    if (a.cast === 'spin') f.spinIn = between(G.spin.every);
  }
  e.barred = barred({ phase: e.stage, stones: e.stones, chargeDue: f.chargeIn <= 0, rainDue: f.rainIn <= 0, spinDue: f.spinIn <= 0,
    summonDue: f.cool <= 0 && summonCount(e.stage, f.minions.length) > 0 });
  if (e.stage < 2 && e.hp <= e.hpFloor) split(f);
}

// down to half his health: he stops, rears up and crumbles into the sun (render/monteurview.js
// plays it), nothing hurting him meanwhile
function split(f) {
  const e = f.e;
  Object.assign(e, { mode: 'split', speed: 0, path: null, t: 0, rolling: null, shield: G.morphTime + G.appear });
  f.change = G.morphTime;
  setStatus(tr('{name} crumbles into a sun of stone!', { name: enemyName(e.profile) }));
  sfx('morph', { at: e, pitch: 0.6 });
  sfx('rumble', { at: e, pitch: 0.7, volume: 1 });
}
function changed(f) {
  const e = f.e;
  e.stage++;
  e.profile = enemyProfile(STAGE_PROFILES.monteur[e.stage - 1], e.level);
  Object.assign(e, { attack: 0, t: 0, cool: 0.8, shield: G.appear, hpFloor: phaseFloor(e.profile.hp, e.stage), stones: G.stones.most });
  Object.assign(f, { cool: G.firstSummon[e.stage - 1], chargeIn: between(G.charge.first) + 1, rainIn: G.rain.first, spinIn: G.spin.first });
  engage(e);
}

// a cast's hit frame: the world turns (a quarter either way or half round: every game turns its
// view after his `quarter`, game/roll.js); the stones he throws up into the sky come down by
// themselves (game/meteors.js)
function cast(f, a) {
  if (a.cast !== 'spin') return;
  const e = f.e;
  e.quarter = nextQuarter(e.quarter, Math.random());
  setStatus(tr('{name} turns the world!', { name: enemyName(e.profile) }));
}
// a summon's hit frame: Moose come up out of the floor round him, as many as fill up to the most
function summon(f, a) {
  const e = f.e, kind = ENEMY_KINDS[a.summon.kind], n = summonCount(e.stage, f.minions.length);
  f.cool = G.summonCool[e.stage - 1];
  if (!n) return;
  const list = minionFloors(e, kind, n, monteurs.filter(living), { ahead: 2, within: 6 }).map(s => {
    const m = minion(e, `${e.id}:minion:${f.nonce}${++f.n}`, kind, s, e.yaw + (Math.random() - 0.5) * 2, f.n);
    m.cool = 0.6 + Math.random();
    return m;
  });
  monteurs.push(...list); f.minions.push(...list);
  summonFx(muzzleAt(e, a.summon.muzzle), list, 'dust');
}

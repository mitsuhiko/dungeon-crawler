// Slomo's fight (core/slomo.js has the rules, docs/bosses.md tells it): this cube's Slomo and his
// minions (the Arm slugs his thrown slug arms become, the Ooze slugs, Ooze bolimes and Slime
// squirtles he calls), in one list (`slomos`), so they fight, collide, travel and get shown to
// friends like any enemy. Each Slomo has a fight of his own here: { e (him), flood (core/slomo.js
// newFlood), floodIn (s until the next flood is due), rainIn (s until he next spits meteorites),
// cool ({ slimes, squirtles }: s to the next summon of each), morph (s left of changing), thrown
// (the attack whose slug arm is off), minions }. A dev spawn (game/devspawn.js) gets one too; out
// of his bowl there is no flood.
//
// On him: `stage` (1 a blob, 2 the slug: his profile, core/enemies.js STAGE_PROFILES),
// `arms` ([left, right]: 1 a slug on the end of it, 0 just thrown, growing back), `tide` (how high
// his flood stands, 0 .. 1), `floodSide` and `front` (where it comes in from, how far across it is:
// game/tide.js), all sent to friends with his row (net/protocol.js).
// Movement and attacks are the shared enemy AI's (game/enemyai.js): the fight says which attacks
// may start (`barred`), carries out the summons (`summon`) and the flood (`cast`) at their hit frames,
// brings a thrown slug arm to life where it lands (`landed`, game/projectiles.js) and changes his
// shape. While he changes (mode 'split') the AI leaves him be. The meteorites he spits are read off
// his attack clock by every game (game/meteors.js).
// An Arm slug that reaches its player latches on (mode 'split', sitting on their head: nothing
// touches it, core/enemies.js absent), bites them now and then and drops off dead.
import { HEAD_Y } from '../core/constants.js';
import { state, player, setStatus } from './state.js';
import { SLOMO, STAGE_PROFILES, ENEMY_KINDS, makeEnemy, enemyProfile, attackOf, enemyName, blowOf } from '../core/enemies.js';
import { SLOMO_FIGHT as G, phaseFloor, summonCount, barred, newFlood, stepFlood, raiseFlood, drainFlood } from '../core/slomo.js';
import { muzzleAt } from '../core/beams.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { groundY } from '../physics/enemynav.js';
import { groundAt } from '../physics/collide.js';
import { standingAt, tideFluid } from '../physics/fluid.js';
import { removeEnemyViews } from '../render/enemies.js';
import { living, engage, leave, minionFloors, minion, sweep, fitting } from './bossfight.js';
import { keepIn } from './bossjump.js';
import { alive } from './party.js';
import { hitBody, attacker } from './enemycombat.js';
import { afflictEnemy } from './statuses.js';
import { summonFx } from './juice.js';
import { sfx } from '../audio/sfx.js';
import { tr } from '../i18n/i18n.js';

export let slomos = [];
let fights = [];
const between = ([a, b]) => a + (b - a) * Math.random();

export function resetSlomos() {
  removeEnemyViews(slomos);
  slomos = []; fights = [];
  addSlomos(enemySpots(state.map, SLOMO).filter(s => !state.run.defeated.has(s.id)).map((s, i) => makeEnemy(s, s.kind ?? SLOMO, i)));
}
// Slomos to fight: this cube's, or spawned with the dev tools
export function addSlomos(list) {
  for (const e of list) {
    Object.assign(e, { stage: 1, tide: 0, floodSide: 0, front: 0, arms: [1, 1], hpFloor: phaseFloor(e.profile.hp, 1) });
    const f = { e, flood: newFlood(), floodIn: G.flood.first, rainIn: G.rain.first, cool: { slimes: G.firstSummon, squirtles: G.firstSummon },
      morph: 0, thrown: -1, minions: [], n: 0, nonce: Math.random().toString(36).slice(2, 7), over: false };
    e.barred = barred({ phase: 1, arms: e.arms });
    e.summon = a => summon(f, a);
    e.cast = a => cast(f, a);
    e.landed = pr => armSlug(f, pr);
    fights.push(f); slomos.push(e);
  }
}
export function detachSlomos() { const list = slomos; slomos = []; fights = []; return list; }

export function updateSlomos(dt) {
  for (const f of fights) run(f, dt);
  for (const e of slomos) if (e.shield > 0) e.shield = Math.max(0, e.shield - dt);
  stepEnemies(slomos.filter(e => e.mode !== 'gone' && e.mode !== 'split'), dt);
  for (const f of fights) if (f.e.mode !== 'dead' && hasBowl()) keepIn(f.e, dt, f.e.profile.radius + 1.6);
  for (const f of fights) latches(f, dt);
  wading();
  slomos = sweep(slomos, dt);
  fights = fights.filter(f => slomos.includes(f.e));
}

// his slime bowl (or its test room): where his flood comes in
const hasBowl = () => !!state.map?.tide?.flood;

function run(f, dt) {
  const e = f.e;
  f.minions = f.minions.filter(m => living(m) && slomos.includes(m));
  // the flood goes on (after his death too: it drains)
  if (stepFlood(f.flood, dt) === 'dry') f.floodIn = between(G.flood.every);
  Object.assign(e, { tide: hasBowl() ? f.flood.k : 0, floodSide: f.flood.side, front: f.flood.front });
  if (e.mode === 'dead') {   // his minions go with him, the flood drains
    if (!f.over) { f.over = true; drainFlood(f.flood); f.minions.forEach(m => leave(m, G.leave)); f.minions = []; }
    return;
  }
  // his slug arms: the one he throws is off at the throw, then grows back
  if (e.stage === 1 && e.mode === 'attack' && e.bit && f.thrown !== e.attacks) {
    const arm = attackOf(e).projectile?.arm;
    if (arm !== undefined) { e.arms[arm] = 0; f.thrown = e.attacks; }
  }
  for (let i = 0; i < 2; i++) if (e.arms[i] < 1) e.arms[i] = Math.min(1, e.arms[i] + dt / G.arms.grow);
  // the Arm slugs melt away after a while (not one latched on)
  for (const m of f.minions) if (m.type === 'armslug' && m.mode !== 'split' && (m.age = (m.age ?? 0) + dt) > G.armLife) leave(m, G.leave);
  if (e.mode === 'split') {   // changing; then back into the fight, in his new shape
    e.t += dt;
    if ((f.morph -= dt) <= 0) changed(f);
    return;
  }
  if (e.mode === 'chase' || e.mode === 'attack') {   // (in the fight)
    f.rainIn -= dt; f.cool.slimes -= dt; f.cool.squirtles -= dt;
    if (f.flood.phase === 'dry') f.floodIn -= dt;
  }
  // the meteorites he starts set their own clock
  if (e.mode === 'attack' && attackOf(e).rain && f.rainIn <= 0) f.rainIn = between(G.rain.every);
  e.barred = barred({ phase: e.stage, arms: e.arms, floodDue: hasBowl() && f.flood.phase === 'dry' && f.floodIn <= 0, rainDue: f.rainIn <= 0,
    slimesDue: f.cool.slimes <= 0 && summonCount('slimes', count(f, 'oozeslug') + count(f, 'oozebolime')) > 0,
    squirtlesDue: f.cool.squirtles <= 0 && summonCount('squirtles', count(f, 'slimesquirtle')) > 0 && floodUp(f) });
  if (e.stage < 2 && e.hp <= e.hpFloor) split(f);
}
const count = (f, type) => f.minions.filter(m => m.type === type).length;
// is his flood up in the bowl, for Slime squirtles to live in (they live in it alone, and dry up
// once it drains: game/enemyai.js `ashore`)?
const floodUp = f => hasBowl() && f.flood.phase !== 'dry' && f.flood.k >= 0.75 && f.flood.front >= 0.5;

// down to half his health: he stops and changes, nothing hurting him meanwhile (the blob bursts
// and the slug turns round: render/slomoview.js blends his shapes); the Arm slugs go with the arms
function split(f) {
  const e = f.e;
  Object.assign(e, { mode: 'split', speed: 0, path: null, t: 0, shield: G.morphTime + G.appear });
  f.morph = G.morphTime;
  for (const m of f.minions) if (m.type === 'armslug' && m.mode !== 'split') leave(m, G.leave);
  setStatus(tr('{name} bursts out of his slime!', { name: enemyName(e.profile) }));
  sfx('morph', { at: e, pitch: 1 });
}
function changed(f) {
  const e = f.e;
  e.stage++;
  e.profile = enemyProfile(STAGE_PROFILES.slomo[e.stage - 1], e.level);
  Object.assign(e, { attack: 0, t: 0, cool: 0.8, shield: G.appear, hpFloor: phaseFloor(e.profile.hp, e.stage), arms: [1, 1] });
  f.rainIn = Math.max(f.rainIn, 3); f.floodIn = Math.min(f.floodIn, G.flood.first);
  f.cool = { slimes: G.firstSummon, squirtles: G.firstSummon + 4 };
  engage(e);
}

// a cast's hit frame: the flood (from another side than the last one)
function cast(f, a) {
  if (a.cast !== 'flood' || !hasBowl()) return;
  raiseFlood(f.flood);
  f.floodIn = Infinity;
  setStatus(tr('{name} floods the bowl with slime!', { name: enemyName(f.e.profile) }));
}
// a summon's hit frame: slimes plop out of him (Ooze slugs and Ooze bolimes in turn), or Slime
// squirtles pop out of his flood (the nearest of it: game/bossfight.js minionFloors), as many as
// fill up to the most
function summon(f, a) {
  const e = f.e, squirtles = a.name === 'squirtle', name = squirtles ? 'squirtles' : 'slimes';
  const n = squirtles ? summonCount(name, count(f, 'slimesquirtle')) : summonCount(name, count(f, 'oozeslug') + count(f, 'oozebolime'));
  f.cool[name] = G.summonCool[name];
  if (!n) return;
  const kinds = squirtles ? [ENEMY_KINDS.slimesquirtle] : [ENEMY_KINDS[a.summon.kind], ENEMY_KINDS[a.summon.also]];
  const big = kinds.reduce((k, o) => o.radius > k.radius ? o : k);
  const list = minionFloors(e, big, n, slomos.filter(living), { ahead: 2.4, within: 6.5 }).map((s, i) => {
    const kind = kinds[(f.n + i) % kinds.length];
    const m = minion(e, `${e.id}:minion:${f.nonce}${++f.n}`, kind, s, e.yaw + (Math.random() - 0.5) * 2, f.n);
    m.cool = 0.6 + Math.random();
    if (squirtles) Object.assign(m, { under: 1, pop: true, dig: 0.2 + Math.random() * 0.3 });   // (they pop out of the slime)
    return m;
  });
  slomos.push(...list); f.minions.push(...list);
  summonFx(muzzleAt(e, a.summon.muzzle), list, 'slime');
}
// a slug arm he threw landed (on a player, the level, or flew its range out): it comes to life on
// the nearest free floor there, unless enough Arm slugs are about already (then it melts)
function armSlug(f, pr) {
  const e = f.e, kind = ENEMY_KINDS[pr.spec.becomes];
  if (!kind || e.mode === 'dead' || count(f, kind.type) >= G.armSlugs) return;
  const l = Math.hypot(pr.vx, pr.vz) || 1, x = pr.x - pr.vx / l * 0.3, z = pr.z - pr.vz / l * 0.3;
  const others = slomos.filter(living);
  const s = fitting(kind).map(g => ({ g, d: Math.hypot(g.x + 0.5 - x, g.z + 0.5 - z), dy: Math.abs(groundY(g, g.x + 0.5, g.z + 0.5) - pr.y) }))
    .filter(({ g, d, dy }) => d < 1.8 && dy < 2.4 && others.every(o => Math.hypot(o.x - g.x - 0.5, o.z - g.z - 0.5) > o.profile.radius + kind.radius))
    .sort((a, b) => a.d + a.dy * 0.5 - b.d - b.dy * 0.5)[0]?.g;
  if (!s) return;
  const m = minion(e, `${e.id}:arm:${f.nonce}${++f.n}`, kind, s, Math.atan2(pr.vx, pr.vz), f.n);
  m.cool = 0.4; m.age = 0;
  slomos.push(m); f.minions.push(m);
}

// The Arm slugs: one that reaches its player latches on, sits on their head biting them every so
// often (slowing them), and after a while drops off dead
function latches(f, dt) {
  const L = G.latch;
  for (const m of f.minions) {
    if (m.type !== 'armslug' || m.mode === 'dead' || m.mode === 'gone') continue;
    if (m.mode !== 'split') {
      const p = m.target?.here && alive(m.target) ? m.target : player;
      if (!alive(p) || p.ragdoll || p.held || p.grounded === false) continue;
      if (Math.hypot(p.x - m.x, p.z - m.z) > L.reach + (p.r ?? 0.3) || Math.abs(p.y - m.y) > 0.9) continue;
      Object.assign(m, { mode: 'split', speed: 0, path: null, t: 0, latch: { p, bit: L.bite * 0.5 } });
      sfx('splorch', { at: m, pitch: 1.4 });
    }
    const p = m.latch.p;
    // on top of their head, facing the way they face (render/enemies.js onHead holds it on our
    // hero's head bone)
    const yaw = p.yaw ?? 0;
    Object.assign(m, { x: p.x, z: p.z, y: p.y + HEAD_Y + 0.2, yaw });
    m.t += dt;
    if ((m.latch.bit -= dt) <= 0 && alive(p) && !p.ragdoll) {
      m.latch.bit = L.bite;
      const blow = { ...blowOf(m.profile, { power: L.power, knock: 0, hop: 0, reason: m.profile.reason, slow: L.slow }), by: attacker(m) };
      hitBody(p, blow, p.x - Math.sin(yaw), p.z - Math.cos(yaw), Math.sin(yaw), Math.cos(yaw));
    }
    if (m.t >= L.hold || !alive(p) || p.ragdoll) {   // it drops off, dead
      const g = groundAt(m.x, m.z, p.y + 0.3, 0);
      Object.assign(m, { mode: 'dead', hp: 0, deadT: 0, noReward: true, latch: null, y: Number.isFinite(g.h) ? g.h : p.y });
      if (g.s) m.f = g.s;
    }
  }
}

// What wades through his flood is slowed by its slime (the enemies we run that are not the
// slime's own; our player: game/tide.js)
function wading() {
  const t = tideFluid();
  if (!t || !hasBowl()) return;
  for (const e of slomos) if (!e.profile.slimeborn && !e.profile.swims && living(e) && !e.under && standingAt(e.x, e.z) === t && t.y > e.y + 0.05)
    afflictEnemy(e, 'slowed', G.flood.slow);
}

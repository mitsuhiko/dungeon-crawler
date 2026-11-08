// The Tornado's twisters (core/twisters.js), read off each enemy's attack clock like the gusts
// (game/gusts.js): an attack with a `twister` spins one up over each hand from its `form` time and
// lets them go at the hit frame, down onto the floor and off; one with a `ride` spins one up under
// the enemy just before it takes off, which carries it (only the look: game/enemyai.js moves it)
// and is gone as it lands; a ride that `leave`s one (the hop) leaves it spinning where it took off.
// A stagger or death before the hit frame blows the ones in its hands away.
// A twister on the floor runs over it, up a step or down one, and blows away where a wall or
// something in the way stops it, or the floor drops away under it. One that touches a player
// catches them: only the game that runs the enemies (`hurt`), with the blow's `twirl` (a friend's
// body gets it sent over); game/twirl.js carries it out: lifted, spun round, then flung down. The
// twister that caught them stays round them till then, and goes.
// Every game spins up its own from the enemy's clock; playing together, those the others see are
// theirs, aimed at the same spot ahead of the enemy, but only the runner's catch anyone.
import { player } from './state.js';
import { party, alive } from './party.js';
import { attackOf, blowOf } from '../core/enemies.js';
import { muzzleAt } from '../core/beams.js';
import { launchTwister, stayTwister, stepTwister, catches } from '../core/twisters.js';
import { hitBody, attacker } from './enemycombat.js';
import { groundAt, blockedAt } from '../physics/collide.js';
import { twisterFx } from './juice.js';
import { removeTwisterViews } from '../render/twisters.js';

export let twisters = [];
const SPIN_UP = 0.25;   // s a ride's twister spins up under it before it takes off
const STEP = 0.6;       // the highest step a twister runs up
const FADE = 0.35;      // s a twister takes to blow away

// whom e's twisters are aimed at: the player it goes after, or ours (shown another's enemies)
const target = e => e.target?.here ? e.target : player;
// how far ahead of e the pair of twisters crosses: where its target stands along its heading
function crossing(e, spec) {
  const p = target(e), ahead = (p.x - e.x) * Math.sin(e.yaw) + (p.z - e.z) * Math.cos(e.yaw);
  return Math.max(1.2, Math.min(spec.range - 1.5, ahead));
}
const floorUnder = (x, z, y) => groundAt(x, z, y + 0.3, 0).h;
function add(w) {
  Object.assign(w, { t: 0, grow: 0, fade: 0, gone: false });
  twisters.push(w);
  twisterFx(w, 'spin');
  return w;
}

export function updateTwisters(list, dt, hurt = true) {
  for (const e of list) spinUp(e, dt);
  twisters = twisters.filter(w => {
    w.t += dt;
    if (w.gone) {
      w.fade += dt / FADE;
      if (w.fade < 1) return true;
      removeTwisterViews([w]);
      return false;
    }
    if (!run(w, dt, hurt)) { w.gone = true; twisterFx(w, 'gone'); }
    return true;
  });
}
// what e's attack starts now
function spinUp(e, dt) {
  const a = e.mode === 'attack' ? attackOf(e) : null, w = a?.twister, r = a?.ride;
  if (!w && !r) { e.whirled = null; return; }
  if (e.whirled?.attacks !== e.attacks) e.whirled = { attacks: e.attacks, t: e.t - dt };
  const W = e.whirled, t0 = W.t, t = W.t = e.t, blow = () => ({ ...blowOf(e.profile, a), by: attacker(e) });
  const passed = at => t0 < at && t >= at;
  if (w && passed(w.form)) w.hands.forEach((_, i) => add({ kind: 'hand', e, attacks: e.attacks, i, spec: w, profile: e.profile, blow: blow(),
    ...muzzleAt(e, w.hands[i]) }));
  if (w && passed(a.hitAt)) {
    const at = crossing(e, w);
    for (const x of twisters) if (x.e === e && x.kind === 'hand' && x.attacks === e.attacks && !x.gone) loose(x, e, at);
  }
  if (r && passed(r.from - SPIN_UP)) add({ kind: 'ride', e, attacks: e.attacks, spec: r.leave ?? { radius: 0.3, height: 1.1 }, profile: e.profile,
    x: e.x, y: e.y, z: e.z, top: e.y });
  if (r?.leave && passed(r.from)) {
    const x = add({ kind: 'stay', e, attacks: e.attacks, spec: r.leave, profile: e.profile, blow: blow(), x: e.x, y: e.y, z: e.z });
    Object.assign(x, { path: stayTwister(e.x, e.z, Math.random() * 9), grow: 1 });
  }
}
// A twister sent by a fight of its own (Megalimmer's, game/rollie.js), not by an attack's clock:
// from over his first `hands` spot it drops to the floor and runs off ahead of him, crossing `at`
// cells along his heading, with `blow` for whom it catches. Only the game that runs the enemies
// sends them.
export function throwTwister(e, spec, blow, at) {
  const w = add({ kind: 'hand', e, attacks: -1, i: 0, spec, profile: e.profile, blow, ...muzzleAt(e, spec.hands[0]) });
  loose(w, e, Math.max(1.2, Math.min(spec.range - 1.5, at)));
  w.grow = 0.3;
  return w;
}
// let go: it drops from the hand to the floor below it and runs off
function loose(w, e, at) {
  const path = launchTwister(e, w.spec, w.i, at, Math.random() * 9), y = floorUnder(path.x0, path.z0, e.y + 0.6);
  Object.assign(w, { kind: 'loose', path, drop: w.y, x: path.x0, z: path.z0, y: Number.isFinite(y) ? y : e.y, t: 0 });
  twisterFx(w, 'loose');
}
// one step of a twister; false: it is over (it blows away)
function run(w, dt, hurt) {
  const e = w.e, mine = e.mode === 'attack' && e.attacks === w.attacks;
  if (w.kind === 'hand') {   // spinning up over its hand, growing
    if (!mine) return false;
    Object.assign(w, muzzleAt(e, w.spec.hands[w.i]));
    w.grow = Math.min(1, (e.t - w.spec.form) / Math.max(0.1, attackOf(e).hitAt - w.spec.form));
    return true;
  }
  if (w.kind === 'ride') {   // under its enemy, from the floor up to its feet, until it lands
    if (!mine || e.t >= attackOf(e).hitAt) return false;
    const y = floorUnder(e.x, e.z, Math.max(w.y, e.y));
    Object.assign(w, { x: e.x, z: e.z, top: e.y, y: Number.isFinite(y) && y > e.y - 4 ? y : w.y });
    w.grow = Math.min(1, w.t / SPIN_UP);
    return true;
  }
  if (w.caught) return w.t < w.hold;   // round whoever it caught, till they are flung
  w.grow = Math.min(1, w.grow + dt / 0.2);
  w.drop = w.drop === undefined ? undefined : w.drop + (w.y - w.drop) * Math.min(1, dt * 14);
  const x0 = w.x, z0 = w.z;
  if (!stepTwister(w.path, w.spec, dt)) return false;
  const { x, z } = w.path, g = groundAt(x, z, w.y, STEP).h;
  // (a wall or something in the way, or the floor dropping away under it, ends it)
  if (!Number.isFinite(g) || g < w.y - 2.5 || blockedAt(x, z, g, 0.05, false, 0.8)) return false;
  Object.assign(w, { x, z, y: g, vx: (x - x0) / Math.max(dt, 1e-4), vz: (z - z0) / Math.max(dt, 1e-4) });
  if (hurt) catchBodies(w);
  return true;
}
function catchBodies(w) {
  for (const p of party()) {
    if (!alive(p) || (p !== player && !p.here) || p.held || p.ragdoll || p.flipping || !catches(w, w.spec, p)) continue;
    // flung on the way it was going (one staying behind: away from its middle)
    const l = Math.hypot(w.vx || 0, w.vz || 0), dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz) || 1;
    const nx = l > 0.1 ? w.vx / l : dx / d, nz = l > 0.1 ? w.vz / l : dz / d;
    Object.assign(w, { caught: p, hold: w.t + w.spec.spin, x: p.x, z: p.z });
    hitBody(p, { ...w.blow, twirl: { lift: w.spec.lift, spin: w.spec.spin } }, w.x - nx, w.z - nz, nx, nz);
    twisterFx(w, 'catch');
    return;
  }
}
export function clearTwisters() { removeTwisterViews(twisters); twisters = []; }

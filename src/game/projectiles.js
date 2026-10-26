// Live projectiles in the current cube: thrown by enemies at their attack's hit frame, they
// fly until they hit a player, run into the level or out of range (core/projectiles.js).
// Travel and level resets clear them. Playing together, the projectiles of the player who runs
// this cube's enemies are shown to the others there too (`mirror`): they fly the same way
// there, but only the runner decides whom they hit (game/party.js), and says where they end
// (net/session.js). A projectile that `becomes` something (Totnar's skulls) tells its thrower where
// it ended (`landed`, game/totnar.js), on the runner's game alone.
// A held one (Mansk's balls of light, game/mansk.js) first hangs where its thrower holds it, and is
// only thrown (and sent to the others) once let go; one that `blast`s bursts where it ends, hurting
// everyone round it (core/projectiles.js inBlast).
import { player } from './state.js';
import { party, alive } from './party.js';
import { insideSolid } from '../physics/collide.js';
import { launch, stepProjectile, inBlast } from '../core/projectiles.js';
import { blowOf } from '../core/enemies.js';
import { hitBody, attacker } from './enemycombat.js';
import { projectileFx } from './juice.js';
import { drawProjectiles, removeProjectileViews } from '../render/projectiles.js';
import { relay } from '../net/online.js';

export let projectiles = [];
const solid = (x, y, z) => insideSolid(x, z, y);
let serial = 0;

// a volley (Flip's) throws `volley` of them at once, fanned out `fan` rad apart
export function launchProjectile(e, a) {
  const n = a.projectile.volley ?? 1, yaw = e.yaw;
  let pr = null;
  for (let i = 0; i < n; i++) {
    e.yaw = yaw + (i - (n - 1) / 2) * (a.projectile.fan ?? 0);
    pr = launchOne(e, a);
  }
  e.yaw = yaw;
  return pr;
}
function launchOne(e, a) {
  const p = e.target?.here ? e.target : player, pr = launch(e, a.projectile, { x: p.x, y: p.y + p.h * 0.55, z: p.z });
  pr.blow = { ...blowOf(e.profile, a), by: attacker(e) };
  pr.profile = e.profile;   // the thrower's kind colours it
  if (a.projectile.becomes) pr.thrower = e;
  pr.n = ++serial;
  projectiles.push(pr);
  projectileFx(pr, 'launch');
  relay.launch?.(pr, e);
  return pr;
}
// A projectile of attack a that enemy e holds for `hold` s before it throws it: it hangs at `at`
// ({ x, y, z }), where follow(pr, dt) keeps putting it, then flies at the player nearest to it,
// at their feet (`mark`: where it will burst, render/projectiles.js shows it)
export function holdProjectile(e, a, spec, at, hold, follow) {
  const pr = { kind: spec.kind, spec, x: at.x, y: at.y, z: at.z, vx: 0, vy: 0, vz: 0, travelled: 0, t: 0, hold, follow, holder: e,
    blow: { ...blowOf(e.profile, a), by: attacker(e) }, profile: e.profile, n: ++serial };
  projectiles.push(pr);
  projectileFx(pr, 'gather');
  return pr;
}
function letGo(pr) {
  const list = party().filter(b => alive(b) && !b.flipping && (b === player || b.here));
  const p = list.reduce((best, b) => Math.hypot(b.x - pr.x, b.z - pr.z) < Math.hypot(best.x - pr.x, best.z - pr.z) ? b : best, list[0] ?? player);
  const dx = p.x - pr.x, dy = p.y + 0.3 - pr.y, dz = p.z - pr.z, l = Math.hypot(dx, dy, dz) || 1, v = pr.spec.speed;
  Object.assign(pr, { vx: dx / l * v, vy: dy / l * v, vz: dz / l * v, hold: 0, follow: null, mark: { x: p.x, y: p.y, z: p.z } });
  projectileFx(pr, 'launch');
  if (pr.holder) relay.launch?.(pr, pr.holder);
}
// a projectile of no enemy's (an echo's shot, game/rewind.js): only this game sees it; one that
// is `only` for a body hits nobody else
export function addProjectile(pr) {
  pr.n = ++serial;
  projectiles.push(pr);
  projectileFx(pr, 'launch');
  return pr;
}
// the runner's projectile n, thrown by e (its view here), from (x, y, z) at (vx, vy, vz)
export function mirrorProjectile(n, e, spec, x, y, z, vx, vy, vz) {
  const pr = { kind: spec.kind, spec, x, y, z, vx, vy, vz, travelled: 0, t: 0, profile: e?.profile, n, mirror: true };
  projectiles.push(pr);
  projectileFx(pr, 'launch');
}
// the runner says its projectile n ended
export function endMirrored(n, end) {
  const pr = projectiles.find(p => p.mirror && p.n === n);
  if (!pr) return;
  projectileFx(pr, end);
  removeProjectileViews([pr]);
  projectiles = projectiles.filter(p => p !== pr);
}
export function updateProjectiles(dt) {
  const targets = party().filter(b => alive(b) && !b.flipping);   // flies through a fallen player (or one in a black hole)
  projectiles = projectiles.filter(pr => {
    if (pr.hold > 0) {   // (held, hanging where its thrower holds it)
      pr.t += dt; pr.hold -= dt; pr.follow?.(pr, dt);
      if (pr.hold > 0) return true;
      letGo(pr);
    }
    const end = stepProjectile(pr, dt, pr.mirror ? null : pr.only ? targets.filter(b => b === pr.only) : targets, solid);
    if (!end) return true;
    if (end === 'hit') {
      const l = Math.hypot(pr.vx, pr.vz) || 1;
      hitBody(pr.victim, pr.blow, pr.x - pr.vx / l, pr.z - pr.vz / l, pr.vx / l, pr.vz / l);
    }
    if (pr.spec.blast && !pr.mirror) for (const b of targets) {   // bursting: all round it
      if (b === pr.victim || !inBlast(pr, b)) continue;
      const dx = b.x - pr.x, dz = b.z - pr.z, l = Math.hypot(dx, dz) || 1;
      hitBody(b, pr.blow, pr.x, pr.z, dx / l, dz / l);
    }
    if (!pr.mirror && !pr.only) relay.landed?.(pr, end);
    pr.thrower?.landed?.(pr, end);
    projectileFx(pr, end);
    removeProjectileViews([pr]);
    return false;
  });
}
export const drawAllProjectiles = (dt, off) => drawProjectiles(projectiles, dt, off);
export function clearProjectiles() { removeProjectileViews(projectiles); projectiles = []; }

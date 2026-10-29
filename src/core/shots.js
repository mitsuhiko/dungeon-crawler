// The player's shots, as pure rules: arrows (bows), bolts (crossbows), spells (staffs) and
// lightning (the lightning staffs). game/shots.js runs them against the live level and enemies,
// render/shots.js draws them. (Enemies' thrown attacks are core/projectiles.js.)
//
// A shot leaves when its attack reaches activeStart (core/combat.js shotDue) and flies straight
// at what it was aimed at: an enemy's body (where it is at that moment: stepping aside dodges),
// a point on the floor or, without a target, straight ahead. It flies from the middle of the
// body at the height the weapon lets go at, so it also hits an enemy pressed up against you;
// the renderer starts it at the weapon (`from`, the clip's muzzle) and lets it catch up.
// Each enemy is hit once: an arrow stops at the first, a bolt goes through `pierce` more, a
// spell stops at the first and bursts, hurting everything else within `burst` cells for
// BURST_SHARE of its damage. Walls, props and the weapon's range stop them all (a spell bursts
// there too). Lightning is all but instant and stops at the first like an arrow, then jumps on
// from it to `jumps` more enemies, each the nearest to the one before (chainTargets), each jump
// for CHAIN_SHARE of the one before.
import { KINDS } from './combat.js';
import { absent, baseY } from './enemies.js';

// speed (cells/s), radius (cells, for hitting), and how long the drawn shot takes to catch up
// from the weapon to its true line
export const SHOTS = {
  arrow: { speed: 16, radius: 0.08, catchUp: 0.1 },
  bolt: { speed: 20, radius: 0.08, catchUp: 0.08 },
  spell: { speed: 9, radius: 0.15, catchUp: 0.16 },
  lightning: { speed: 60, radius: 0.12, catchUp: 0.03 },
};
// where each kind lets go of its shot (model space: x, up, forward; the clips' extras.muzzle)
export const MUZZLES = {
  bow: [0.015, 0.744, 0.523],
  crossbow: [-0.216, 0.753, 0.519],
  staff: [-0.171, 1.14, 0.821],
  trident: [-0.27, 0.573, 1.249],   // its prongs, stabbing (its lightning: 'zap')
  throw: [-0.146, 0.964, 0.24],   // the fist letting go of a flask (core/throws.js)
};
MUZZLES.zap = MUZZLES.trident;
// the share of a spell's damage its burst deals to the others around where it hit
export const BURST_SHARE = 0.5;
// how far lightning jumps from one enemy to the next (cells between their bodies, and at most
// this far up or down), and the share of the damage each jump keeps of the one before
export const CHAIN_REACH = 2.5, CHAIN_RISE = 1.5, CHAIN_SHARE = 0.7;
const MAX_SLOPE = 1.6;   // shots may aim up or down this steeply (rise per cell)

// the point a shot at enemy e aims for: the middle of its body
export const aimPoint = e => ({ x: e.x, y: baseY(e) + e.profile.bodyHeight * 0.5, z: e.z });

// a shot of the attack stats `stats` from player p, turned to `yaw`, at `target` (an enemy, a
// point {x, z} or null)
export function launchShot(p, stats, target, yaw = p.yaw) {
  const kind = stats.shot ?? KINDS[stats.kind].shot, spec = SHOTS[kind], [mx, my, mz] = MUZZLES[stats.kind];
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const x = p.x, y = p.y + my, z = p.z;
  // the drawn shot starts at the weapon: this far from its true position
  const from = [mx * c + mz * s, 0, -mx * s + mz * c];
  let dx = s, dy = 0, dz = c;
  if (target?.profile) {
    const a = aimPoint(target), flat = Math.hypot(a.x - x, a.z - z);
    if (flat > 0.05) {
      dx = (a.x - x) / flat; dz = (a.z - z) / flat;
      dy = Math.max(-MAX_SLOPE, Math.min(MAX_SLOPE, (a.y - y) / flat));
    }
  } else if (target && Math.hypot(target.x - x, target.z - z) > 0.05) {
    const flat = Math.hypot(target.x - x, target.z - z);
    dx = (target.x - x) / flat; dz = (target.z - z) / flat;
  }
  const l = Math.hypot(dx, dy, dz);
  return { kind, spec, stats, x, y, z, vx: dx / l * spec.speed, vy: dy / l * spec.speed, vz: dz / l * spec.speed,
    from, travelled: 0, t: 0, hits: new Set(), left: stats.pierce ?? 0, x0: x, y0: y, z0: z };
}
// where the drawn shot left the weapon (lightning is drawn from there to where it is)
export const shotOrigin = shot => [shot.x0 + shot.from[0], shot.y0 + shot.from[1], shot.z0 + shot.from[2]];

// does the shot overlap enemy e's body (a cylinder of its radius and body height)?
export function touchesEnemy(shot, e) {
  const r = shot.spec.radius;
  return Math.hypot(shot.x - e.x, shot.z - e.z) < e.profile.radius + r
    && shot.y > baseY(e) - r && shot.y < baseY(e) + e.profile.bodyHeight + r;
}

// Advance by dt in small steps. Returns { hits: enemies hit in this step, misses: those it went
// right through, end: null or 'hit' (an enemy stopped it), 'blocked' (solid(x, y, z) says it ran
// into the level), 'spent' (out of range) }. Hits are recorded on the shot; it never hits the same
// enemy twice. dodges(e): does it go through e (a blurry Flimmer, core/enemies.js evades)? It
// flies on then, as if e was not there.
// learn: combat.html#shoot (see learn/README.md)
export function stepShot(shot, dt, enemies, solid, dodges = null) {
  const n = Math.max(1, Math.ceil(shot.spec.speed * dt / 0.08)), h = dt / n, hits = [], misses = [];
  shot.t += dt;
  for (let i = 0; i < n; i++) {
    shot.x += shot.vx * h; shot.y += shot.vy * h; shot.z += shot.vz * h;
    shot.travelled += shot.spec.speed * h;
    for (const e of enemies) {
      if (absent(e) || shot.hits.has(e) || !touchesEnemy(shot, e)) continue;
      shot.hits.add(e);
      if (dodges?.(e)) { misses.push(e); continue; }
      hits.push(e);
      if (shot.left-- <= 0) return { hits, misses, end: 'hit' };
    }
    if (solid(shot.x, shot.y, shot.z)) return { hits, misses, end: 'blocked' };
    if (shot.travelled >= shot.stats.range) return { hits, misses, end: 'spent' };
  }
  return { hits, misses, end: null };
}

// the enemies a spell's burst hurts where it ended: within `burst` cells of their body, not
// those it hit itself
export function burstTargets(shot, enemies) {
  const b = shot.stats.burst ?? 0;
  if (!b) return [];
  return enemies.filter(e => !absent(e) && !shot.hits.has(e)
    && Math.hypot(shot.x - e.x, shot.z - e.z) < b + e.profile.radius
    && shot.y > baseY(e) - b && shot.y < baseY(e) + e.profile.bodyHeight + b);
}

// Lightning that struck enemy `from` jumps on: up to `stats.jumps` enemies, each the nearest to the
// one before within CHAIN_REACH (between their bodies) and CHAIN_RISE up or down, none it struck
// already. visible(a, b): can it jump from a to b (the level not in the way)?
export function chainTargets(shot, enemies, from, visible = () => true) {
  const out = [], struck = new Set(shot.hits);
  let at = from;
  for (let i = 0; i < (shot.stats.jumps ?? 0); i++) {
    let best = null, near = Infinity;
    for (const e of enemies) {
      if (absent(e) || struck.has(e) || Math.abs(baseY(e) - baseY(at)) > CHAIN_RISE) continue;
      const d = Math.hypot(e.x - at.x, e.z - at.z) - e.profile.radius - at.profile.radius;
      if (d < CHAIN_REACH && d < near && visible(at, e)) { best = e; near = d; }
    }
    if (!best) break;
    out.push(best); struck.add(best); at = best;
  }
  return out;
}
// the share of the damage the i-th jump (0: the first) hits for
export const chainShare = i => CHAIN_SHARE ** (i + 1);

// where the drawn shot is: its true position plus what is left of the start at the weapon
export function shotView(shot) {
  const k = Math.max(0, 1 - shot.t / shot.spec.catchUp);
  return [shot.x + shot.from[0] * k, shot.y + shot.from[1] * k, shot.z + shot.from[2] * k];
}

// Thrown attacks (fireballs, Triangle punches, ice balls), burning and chill, as pure rules; game/projectiles.js
// runs them against the live level and the player, render/projectiles.js draws them.

// A projectile leaves the muzzle (model space: x, up, forward) of enemy e and flies straight
// along e's heading, pitched towards the target's height (at most ~24 degrees), so stepping
// aside during the wind-up dodges it. One thrown from a hand off to the side (`converge`:
// Totnar's) is turned to cross the line of e's heading where the target is as far. One that is
// `lob`bed (Slomo's slug arms; lob: its gravity, cells/s²) flies in an arc from its muzzle onto
// the target, `speed` along the ground: it falls on from there till it lands (stepProjectile).
// One thrown from up high (`steep`: Monteur's stones, from between his antlers) is pitched at the
// target however steep, measured along e's heading (straight at a target under or behind the
// muzzle), so it still hits someone standing right in front of its thrower.
export function launch(e, spec, target) {
  const [mx, my, mz] = spec.muzzle;
  let s = Math.sin(e.yaw), c = Math.cos(e.yaw);
  const x = e.x + mx * c + mz * s, y = e.y + my, z = e.z - mx * s + mz * c;
  if (spec.lob) {
    const dx = target.x - x, dz = target.z - z, d = Math.hypot(dx, dz), T = Math.max(0.45, d / spec.speed);
    const ux = d > 0.01 ? dx / d : s, uz = d > 0.01 ? dz / d : c, v = d / T;
    return { kind: spec.kind, spec, x, y, z, vx: ux * v, vy: (target.y - y) / T + 0.5 * spec.lob * T, vz: uz * v, travelled: 0, t: 0 };
  }
  if (spec.converge) {
    const d = Math.max(mz + 1, Math.hypot(target.x - e.x, target.z - e.z)), ax = e.x + s * d - x, az = e.z + c * d - z, l = Math.hypot(ax, az);
    s = ax / l; c = az / l;
  }
  let flat = Math.max(0.5, Math.hypot(target.x - x, target.z - z));
  if (spec.steep) {   // (one standing under or behind the muzzle: straight at them)
    const dx = target.x - x, dz = target.z - z, along = dx * s + dz * c, d = Math.hypot(dx, dz);
    if (along < 0.3 && d > 0.01) { s = dx / d; c = dz / d; flat = d; } else flat = Math.max(0.3, along);
  }
  const most = spec.steep ? Infinity : 0.45;
  const slope = Math.max(-most, Math.min(most, (target.y - y) / flat)), l = Math.hypot(1, slope);
  return { kind: spec.kind, spec, x, y, z, vx: s * spec.speed / l, vy: slope * spec.speed / l, vz: c * spec.speed / l,
    travelled: 0, t: 0 };
}

// does projectile pr overlap the player's body p (a vertical capsule of radius r, height h)?
export function touches(pr, p) {
  const lo = p.y + p.r, hi = p.y + p.h - p.r;
  const dy = pr.y < lo ? lo - pr.y : pr.y > hi ? pr.y - hi : 0;
  return Math.hypot(pr.x - p.x, pr.z - p.z, dy) < pr.spec.radius + p.r;
}

// does the burst of projectile pr (its spec's `blast`: cells round where it ended; Mansk's balls of
// light) reach body p (x, y, z, r, h)?
export const inBlast = (pr, p) => Math.hypot(p.x - pr.x, p.z - pr.z) < pr.spec.blast + (p.r ?? 0.3)
  && pr.y > p.y - pr.spec.blast && pr.y < p.y + (p.h ?? 1.6) + pr.spec.blast;

// Advance by dt in small steps. Returns 'hit' (touched the player p, or one of a list of
// players: pr.victim says which; pass null for none), 'blocked' (solid(x, y, z) says it ran
// into the level), 'spent' (out of range) or null.
export function stepProjectile(pr, dt, p, solid) {
  const n = Math.max(1, Math.ceil(pr.spec.speed * dt / 0.08)), h = dt / n, bodies = Array.isArray(p) ? p : p ? [p] : [];
  pr.t += dt;
  for (let i = 0; i < n; i++) {
    if (pr.spec.lob) pr.vy -= pr.spec.lob * h;
    pr.x += pr.vx * h; pr.y += pr.vy * h; pr.z += pr.vz * h;
    pr.travelled += pr.spec.speed * h;
    pr.victim = bodies.find(b => touches(pr, b));
    if (pr.victim) return 'hit';
    if (solid(pr.x, pr.y, pr.z)) return 'blocked';
    if (pr.travelled >= pr.spec.range) return 'spent';
  }
  return null;
}

// Burning: `burn` ({ time, damage, ticks }) deals its damage in equal ticks over its time.
// Catching fire again restarts it.
export const ignite = (burn, reason) => ({ time: burn.time, damage: burn.damage, ticks: burn.ticks, t: 0, done: 0, reason });
// advance a burn by dt; returns the damage due in this step
export function burnStep(b, dt) {
  b.t += dt;
  const due = Math.min(b.ticks, Math.floor(b.t * b.ticks / b.time + 1e-9)), n = due - b.done;
  b.done = due;
  return n * b.damage / b.ticks;
}
export const burntOut = b => b.done >= b.ticks;

// Chill: `chill` ({ time, slow }) scales the player's speed by `slow` for `time` seconds, the
// last part of it thawing back to full speed. Being hit again restarts it.
export const chillFrom = chill => ({ time: chill.time, slow: chill.slow, t: 0 });
export const THAW = 0.4;   // s
// the speed factor a chill c gives now (1: none)
export function chillFactor(c) {
  if (!c) return 1;
  const left = c.time - c.t;
  return left >= THAW ? c.slow : c.slow + (1 - c.slow) * (1 - Math.max(0, left) / THAW);
}
// advance a chill by dt; returns false once it has worn off
export function chillStep(c, dt) { c.t += dt; return c.t < c.time; }

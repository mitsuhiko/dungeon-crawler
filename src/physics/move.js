// Character controller: walk / run / swim, jumping, gravity, ceilings and slopes.
import { STEP, GRAV, SNAP, STEEP, WALK_SPEED, RUN_SPEED, SWIM_SPEED, JUMP_V, RUN_RAMP, BRAKE, HEAD_Y, WADE_SLOW,
  SWIM_DEPTH, SWIM_FEET } from '../core/constants.js';
import { player, state } from '../game/state.js';
import { groundAt, ceilingAt, slopeAt } from './collide.js';
import { canMove, stepOf } from './canmove.js';
import { moveFactor } from '../core/status.js';
import { effectMod } from '../core/potions.js';
import { wornTotals } from '../core/gear/stats.js';
import { pushStep, pushControl } from '../core/gusts.js';
import { surfaceAt, mireOf } from '../core/footing.js';
import { themeById } from '../themes/depth.js';
import { swimWater, waterAt, wading } from './fluid.js';

// how much faster the boots worn make you (not swimming)
const feet = p => p.swimming ? 0 : wornTotals(p.inventory).moveSpeed / 100;
// how much the ground holds the feet (the slime marsh's slime, core/footing.js mireOf): what was
// underfoot last, so a jump off the slime is no quicker than walking through it
export function mired(p) {
  if (p.swimming) return 1;
  if (p.grounded) {
    const theme = state.map?.biome && themeById(state.map.biome);
    p.mire = theme?.mire && p.support ? mireOf(surfaceAt(p.support, state.map, theme.props, p.x, p.z), theme) : 1;
  }
  return p.mire ?? 1;
}

// learn: physics.html#feel #walls (see learn/README.md)
function horizontal(dt, dx, dz, run) {
  const p = player;
  // an ice ball's chill or a slowing slows every way of moving (core/status.js moveFactor), a
  // swiftness potion quickens it (core/potions.js), and so do light boots (core/gear/stats.js),
  // wading the more the deeper the water (physics/hazards.js), and slime holds the feet (mired)
  const speed = (p.swimming ? SWIM_SPEED : run ? RUN_SPEED : WALK_SPEED) * moveFactor(p) * mired(p)
    * (1 + effectMod(p, 'moveSpeed') + feet(p)) * (1 - WADE_SLOW * Math.min(1, (p.wade || 0) / HEAD_Y));
  let tx = dx * speed, tz = dz * speed;
  if (p.grounded && !p.swimming && p.support) {
    const [gx, gz] = slopeAt(p.support, p.x, p.z), g = Math.hypot(gx, gz);
    // walking uphill is slower
    const up = (tx * gx + tz * gz) / speed;
    if (up > 0) { tx /= 1 + 0.35 * up; tz /= 1 + 0.35 * up; }
    // too steep to stand on (stairs excepted): slide down
    if (g > STEEP && p.support.kind !== 'stair') { const s = 2.5 * (g - STEEP) + 0.5; tx -= gx / g * s; tz -= gz / g * s; }
  }
  if (p.grounded && !p.swimming) {
    // on the ground the speed ramps up (RUN_RAMP) and brakes quickly; the direction follows
    // the input at once, so turning keeps the speed
    const cur = Math.hypot(p.vx, p.vz), want = Math.hypot(tx, tz);
    const s = want > cur ? Math.min(want, cur + RUN_SPEED / RUN_RAMP * dt) : Math.max(want, cur - BRAKE * dt);
    const [ux, uz] = want > 1e-6 ? [tx / want, tz / want] : cur > 1e-6 ? [p.vx / cur, p.vz / cur] : [0, 0];
    p.vx = ux * s; p.vz = uz * s;
  } else {
    // swimming is sluggish, in the air there is only a little control
    const k = Math.min(1, (p.swimming ? 5 : 2.5) * dt);
    p.vx += (tx - p.vx) * k; p.vz += (tz - p.vz) * k;
  }

  // axis-separated moves so the body slides along walls
  const mx = p.vx * dt, mz = p.vz * dt;
  if (Math.abs(mx) > 1e-6) { if (canMove(p.x + mx, p.z, 'x', Math.sign(mx))) p.x += mx; else p.vx = 0; }
  if (Math.abs(mz) > 1e-6) { if (canMove(p.x, p.z + mz, 'z', Math.sign(mz))) p.z += mz; else p.vz = 0; }
}

// learn: physics.html#feel #move-code (see learn/README.md)
const LEAP = 3.4;   // horizontal speed of a jump while moving

// How fast p runs and leaps now, and how much higher than plain it jumps (potions, boots, a
// chill or a slowing, the slime): what the jumps click to move takes depend on (physics/leaps.js)
export function jumpPowers(p) {
  const quick = 1 + effectMod(p, 'moveSpeed') + feet(p);
  return { run: RUN_SPEED * moveFactor(p) * mired(p) * quick, leap: LEAP * quick, boost: Math.sqrt(1 + effectMod(p, 'jump')) };
}

// jump with a little coyote time (just walked off a ledge) and a short input buffer
// learn: physics.html#feel #move-code (see learn/README.md)
function jumping(dt, jump) {
  const p = player;
  p.coyote = p.grounded && !p.swimming ? 0.12 : p.coyote - dt;
  p.jumpBuf = jump ? 0.15 : p.jumpBuf - dt;
  if (p.jumpBuf <= 0 || !(p.coyote > 0 || p.swimming)) return;
  // a leaping potion: that share higher (the height goes with the square of the speed)
  const boost = Math.sqrt(1 + effectMod(p, 'jump'));
  p.vy = p.swimming ? 4.8 : JUMP_V * boost;
  // jumping while moving is a leap: enough speed to clear a one-cell gap (more with a potion)
  const s = Math.hypot(p.vx, p.vz), leap = LEAP * (1 + effectMod(p, 'moveSpeed') + feet(p));
  if (!p.swimming && s > 0.8 && s < leap) { p.vx *= leap / s; p.vz *= leap / s; }
  p.grounded = p.swimming = false;
  p.coyote = p.jumpBuf = 0;
  p.jumpCount++;
}

// A Wolla's gust (core/gusts.js): it carries the body on top of its own moving, axis by axis
// so it slides along walls, and takes most of the steering away while it is strong.
function blown(dt) {
  const p = player, [mx, mz] = pushStep(p.gust, dt);
  if (Math.abs(mx) > 1e-6 && canMove(p.x + mx, p.z, 'x', Math.sign(mx))) p.x += mx;
  if (Math.abs(mz) > 1e-6 && canMove(p.x, p.z + mz, 'z', Math.sign(mz))) p.z += mz;
  if (p.gust.t <= 0) p.gust = null;
}

// Gusto breathing in (game/gusts.js, player.pull, set anew every frame it lasts): it draws the
// body towards him on top of its own moving, axis by axis like a gust, and takes most of the
// steering away from him (not sideways: stepping out of his breath still works). Used up here.
function steerPulled(dx, dz) {
  const u = player.pull, away = -(dx * u.ux + dz * u.uz);
  if (away <= 0) return [dx, dz];
  const k = away * (1 - u.hold);
  return [dx + u.ux * k, dz + u.uz * k];
}
function pulled(dt) {
  const p = player, u = p.pull, d = Math.min(u.speed * dt, u.room), mx = u.ux * d, mz = u.uz * d;
  if (Math.abs(mx) > 1e-6 && canMove(p.x + mx, p.z, 'x', Math.sign(mx))) p.x += mx;
  if (Math.abs(mz) > 1e-6 && canMove(p.x, p.z + mz, 'z', Math.sign(mz))) p.z += mz;
  p.pull = null;
}

// the ground under the body for a step up of `step`, but a structure (a bridge, a stair) only a
// plain step over its feet: a swimmer goes on under a bridge, not up through its deck
function groundFor(p, step) {
  const g = groundAt(p.x, p.z, p.y, step);
  return g.s?.kind && g.h > p.y + STEP ? groundAt(p.x, p.z, p.y, STEP) : g;
}

// Swimming: the water holds the body with its feet SWIM_FEET under its surface, like a spring
// (BUOY) that a plunge from the air sinks into a little (at most PLUNGE fast) and bobs back out
// of; a rising or falling water (a tide) carries it along. Never below the bed.
const BUOY = 45, DAMP = 9, PLUNGE = 3.5;
function swim(dt, gr, water) {
  const p = player;
  if (!p.swimming) {   // into the water
    p.swimming = true; p.grounded = false; p.climb = null;
    p.plunge = -p.vy; p.splashCount = (p.splashCount || 0) + 1;   // (game/swim.js: the splash)
    p.vy = Math.max(p.vy, -PLUNGE);
  }
  p.vy += ((water - SWIM_FEET - p.y) * BUOY - p.vy * DAMP) * dt;
  p.y += p.vy * dt;
  if (p.y < gr.h) { p.y = gr.h; p.vy = Math.max(0, p.vy); }
  p.swimY = water;
  p.swimLook = waterAt(gr)?.look ?? 0;   // (clear water, or Sollmeldon's mud: physics/fluid.js swum)
}

// returns the ground info plus `landed` (impact speed of a landing this step, else 0)
// learn: physics.html#walls (see learn/README.md)
export function movePlayer(dt, dx, dz, run, jump) {
  const p = player;
  if (p.stun > 0) { p.stun -= dt; dx = dz = 0; jump = false; }
  // standing on a moving platform (game/movers.js): it carries us along
  // (and their feet, held where they stand: render/animator.js)
  if (p.grounded && p.support?.mover) { p.x += p.support.dx; p.z += p.support.dz; p.carried.x += p.support.dx; p.carried.z += p.support.dz; }
  if (p.gust) { const k = pushControl(p.gust); dx *= k; dz *= k; }
  if (p.pull) [dx, dz] = steerPulled(dx, dz);
  horizontal(dt, dx, dz, run);
  if (p.gust) blown(dt);
  if (p.pull) pulled(dt);
  jumping(dt, jump);

  const gr = groundFor(p, stepOf(p));
  gr.landed = 0;
  // the clear water deep enough to swim in here (a swimmer keeps on until the ground is under
  // their feet again; one coming down into it starts once their feet are at swimming height)
  const water = swimWater(gr, p.swimming ? SWIM_FEET - 0.02 : SWIM_DEPTH);
  if (water !== null && (p.swimming || (p.vy <= 0 && p.y <= water - SWIM_FEET + 0.02))) swim(dt, gr, water);
  else {
    p.swimming = false;
    if (p.grounded && p.vy <= 0 && gr.h >= p.y - SNAP) {
      p.y = gr.h; p.vy = 0;
    } else {
      p.vy -= GRAV * dt;
      let ny = p.y + p.vy * dt;
      if (p.vy > 0) {   // bump the head
        const c = ceilingAt(p.x, p.z, p.y + 0.1);
        if (ny + p.h > c) { ny = Math.max(p.y, c - p.h); p.vy = 0; }
      }
      if (ny <= gr.h) {
        gr.landed = -p.vy;
        p.landImpact = gr.landed; p.landCount++;
        p.y = gr.h; p.vy = 0; p.grounded = true;
      } else { p.y = ny; p.grounded = false; }
    }
  }
  p.airTime = p.grounded || p.swimming ? 0 : p.airTime + dt;
  p.support = gr.s;
  p.wade = p.grounded ? wading(gr, p.y) : 0;   // (how deep it wades: slower, and it climbs out as a swimmer does)
  return gr;
}

// how hard a landing was (the impact speed), for tumbling over and sitting down: a leaping
// potion's higher jumps (jumpMod) land as softly as plain ones, and a plunge's soft landing
// (cubegen/heights.js: snow, moss, sand, a web) catches any fall
export const landingSpeed = (gr, jumpMod = 0) => gr.s?.soft ? 0 : gr.landed / Math.sqrt(1 + jumpMod);

// which layer the character is on (for fading): the floor's layer, or the nearer end of a structure
export function updateLayer(gr) {
  if (!player.grounded || !gr.s) return;
  const s = gr.s;
  if (!s.kind) { player.layer = s.layer; return; }
  const r = s.run, up = r.y1 > r.y0;
  player.layer = (player.y > r.ymid ? (up ? r.to : r.from) : (up ? r.from : r.to)).layer;
}

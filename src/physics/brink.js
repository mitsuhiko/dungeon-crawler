// At a brink (docs/combat.md "Fluids and falls"): walking is stopped at a ledge over lava, acid or
// nothing (physics/canmove.js). Pushed on straight at it (keys or the touch stick: not a mouse
// order, which makes its own jumps), the hero teeters there for TEETER s, then tries the jump over
// it ahead of time, with their own physics (physics/move.js) and the crust as it will be when they
// come down (physics/collide.js lookAhead: a trial's stones): straight on the way pushed, then a
// little to either side (AIM). Where it lands them softly on ground that holds, they jump it; where
// nothing does, they keep teetering, holding at the brink, and look again every LOOK s (a stone
// that comes up is jumped onto once it would be there to land on). Pushing away, or more than
// TURN off the way, lets go of the brink.
// Off any other edge (a trench, a pit, water, a cliff: walking is not stopped there) a hero running
// (not walking: the walk key, the stick pushed a little) jumps where the jump the way pushed lands
// them softly across, on ground no lower than they left (but a STEP), and far enough on (ACROSS):
// tried out the moment they run off it (offEdge, still in the coyote time). Where it does not,
// they fall as before (a landing deep down hurts); a ledge up is never jumped onto by itself.
//   player.brink: { ux, uz (the way pushed), t (s at it), next (when to look), hold (nothing to
//   land on, last look), since (s since it last stopped the body) } or null
import { JUMP_V, SIT_IMPACT, STEP, TEETER } from '../core/constants.js';
import { effectMod } from '../core/potions.js';
import { lookAhead } from './collide.js';
import { peril } from './fluid.js';
import { movePlayer, jumpPowers, landingSpeed } from './move.js';
import { tryOut } from './leaps.js';

const DEG = Math.PI / 180;
const LOOK = 0.1;             // s between looks while nothing is there to land on
const FACING = Math.cos(40 * DEG);   // pushing at least this straight at the brink (else: along it)
const TURN = Math.cos(30 * DEG);     // turning further than this from the way pushed starts over
const GRACE = 0.12;           // s it keeps hold while the body creeps up to the edge between stops
const AIM = [0, 6, -6, 12, -12].map(a => a * DEG);   // the ways tried, off the way pushed
const DT = 1 / 60, FLIGHT = 1.5, SOFT = SIT_IMPACT * 0.95, STAY = 10;

// Every frame the hero steers themselves on the ground: pushing (dx, dz) and stopped at a brink
// this frame along x and z (`stopped`: the sign of the move it stopped, or 0)
export function atBrink(p, dt, dx, dz, [bx, bz]) {
  const len = Math.hypot(dx, dz);
  if (!p.grounded || p.swimming || len < 0.3) { p.brink = null; return; }
  const ux = dx / len, uz = dz / len, b = p.brink, same = !!b && ux * b.ux + uz * b.uz >= TURN;
  const bl = Math.hypot(bx, bz);
  if (!bl || (ux * bx + uz * bz) / bl < FACING) {
    // (creeping on up to the edge, the body is not stopped every frame)
    if (same && (b.since += dt) < GRACE) { b.t += dt; return; }
    p.brink = null;
    return;
  }
  if (!same) { p.brink = { ux, uz, t: 0, next: TEETER, hold: false, since: 0 }; return; }
  Object.assign(b, { ux, uz, since: 0 });
  b.t += dt;
}

// the jump over the brink once the teeter is over (and again every LOOK s): { vx, vy, vz } or null
export function brinkJump(p) {
  const b = p.brink;
  if (!b || !p.grounded || b.t < b.next) return null;
  b.next = b.t + LOOK;
  const v = overBrink(p, b.ux, b.uz);
  b.hold = !v;
  return v;
}

// the take-off over the brink pushed at along (ux, uz), or null: nothing to land on
export function overBrink(p, ux, uz) {
  return leapTo(p, ux, uz, () => true);
}

// Running off an edge at (x0, z0), from ground at y0 (the frame before), along (ux, uz): the jump
// across, or null (they fall). Only off a real drop (the ground under them now clearly lower than
// a step), and onto ground across no lower than y0 but a step.
const ACROSS = 0.8;   // how far on along the way pushed the landing is at least (a gap is a cell)
export function offEdge(p, ux, uz, x0, z0, y0, under) {
  if (!(y0 - under > 2 * STEP)) return null;
  return leapTo(p, ux, uz, q => q.y >= y0 - STEP && (q.x - x0) * ux + (q.z - z0) * uz >= ACROSS);
}

// the first of the jumps along (ux, uz) and AIM off it that lands where `ok` (the hero, landed)
function leapTo(p, ux, uz, ok) {
  const { leap, boost } = jumpPowers(p), jumpMod = effectMod(p, 'jump');
  for (const a of AIM) {
    const c = Math.cos(a), s = Math.sin(a), wx = ux * c - uz * s, wz = ux * s + uz * c;
    const v = { vx: wx * leap, vy: JUMP_V * boost, vz: wz * leap };
    if (lands(p, v, wx, wz, jumpMod, ok)) return v;
  }
  return null;
}

// does the jump at v land the hero, pushing on along (wx, wz) in the air as they do, softly on
// ground past the brink that holds them (not in a fluid, not far below), where `ok`?
function lands(p, v, wx, wz, jumpMod, ok) {
  return tryOut(() => {
    const x0 = p.x, z0 = p.z, y0 = p.y;
    Object.assign(p, { ...v, grounded: false, coyote: 0, jumpBuf: 0, brink: null });
    try {
      for (let t = DT; t < FLIGHT; t += DT) {
        lookAhead(t);
        const gr = movePlayer(DT, wx, wz, true, false);
        if (p.swimming || p.y < y0 - 4 || peril(gr, p.y)) return false;
        if (!p.grounded) continue;
        if (Math.hypot(p.x - x0, p.z - z0) < 0.6 || landingSpeed(gr, jumpMod) > SOFT || !ok(p)) return false;
        for (let i = 0; i < STAY; i++) {   // and it holds them
          lookAhead(t + (i + 1) * DT);
          const g = movePlayer(DT, 0, 0, true, false);
          if (!p.grounded || p.swimming || peril(g, p.y)) return false;
        }
        return true;
      }
      return false;
    } finally { lookAhead(0); }
  });
}

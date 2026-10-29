// The player's footsteps: a step whenever the walk / run cycle passes a foot's touchdown
// (measured from the clips, render/character.js), on the surface underfoot (core/footing.js),
// and a heavier one on landing. On a ladder each hand and foot knocks on its rung (or scuffs in
// its hold, rustles its vines ...) as the climb cycle (up or down) passes its grip. The sounds are audio/footsteps.js.
// On slime each step leaves a wet print (render/footprints.js), and so does each for a while after
// coming out of the water (or Sollmeldon's mud), fainter step by step as the feet dry.
import { player, state } from './state.js';
import { character } from '../render/character.js';
import { blend, W } from '../render/blendtree.js';
import { footstep } from '../audio/footsteps.js';
import { surfaceAt } from '../core/footing.js';
import { themeOf } from '../themes/depth.js';
import { LADDER_STYLES } from '../themes/builds.js';
import { footprint } from '../render/footprints.js';
import { groundAt } from '../physics/collide.js';
import { standingAt } from '../physics/fluid.js';
import { MUD } from '../core/constants.js';

let prev = null, prevClimb = null, landCount = 0, surface = null;
// how wet the feet still are (1: just out of the water, 0: dry), what with ('wet', 'mud': render/
// footprints.js), since when
const DRIP = 6;   // s until they are dry
let wet = 0, soaked = 'wet', soakedAt = 0;

const ahead = (from, to) => ((to - from) % 1 + 1) % 1;   // how far forwards round the cycle
const mixPhase = (a, b, t) => (a + (((b - a) % 1 + 1.5) % 1 - 0.5) * t + 1) % 1;

// While travelling the support still belongs to the cube we left: keep its surface
function underfoot() {
  if (!state.transitioning) surface = surfaceAt(player.support, state.map, themeOf(state.map).props, player.x, player.z);
  return surface;
}

// the rungs: a contact sounds when the cycle passes it, whichever way it runs
function climbing() {
  const last = prevClimb, now = blend.climb;
  prevClimb = player.climb && blend.mode === 'climb' ? now : null;
  if (prevClimb === null) return;
  const sound = LADDER_STYLES[player.climb.l.style]?.sound ?? 'ladder';   // wood, rope, vine, iron or rock
  if (last === null) { footstep(sound, 'walk', { volume: 0.8 }); return; }   // the grab
  const fwd = ahead(last, now), back = ahead(now, last), up = fwd <= back;
  const span = up ? fwd : back, from = up ? last : now;
  if (span <= 0 || span > 0.5) return;
  // the clip moves a hand and the other foot together: one knock, heavier with a foot in it
  const { hand, foot } = character.footfalls.climb, passed = list => list.some(c => { const at = ahead(from, c); return at > 0 && at <= span; });
  if (passed(foot)) footstep(sound, 'run', { volume: 0.9 });
  else if (passed(hand)) footstep(sound, 'walk', { volume: 0.7 });
}

// the feet in the water (swimming, wading) soak; out of it they dry
function soak(p) {
  const dt = Math.max(0, state.time - soakedAt);
  soakedAt = state.time;
  if (p.swimming || p.wade > 0.02) { wet = 1; soaked = (p.swimming ? p.swimLook : standingAt(p.x, p.z)?.look) === MUD ? 'mud' : 'wet'; }
  else wet = Math.max(0, wet - dt / DRIP);
}
// a print of the foot `side` coming down where the hero stands on `s` (its surface)
function print(p, s, side) {
  if (s === 'slime') footprint(p.x, p.y, p.z, p.yaw, side);   // (render/footprints.js)
  else if (wet > 0 && !(p.wade > 0)) footprint(p.x, p.y, p.z, p.yaw, side, 1, soaked, wet);
}

export function updateFootsteps() {
  const p = player;
  if (!character.ready || !state.map) return;
  soak(p);
  climbing();
  if (p.landCount !== landCount) {
    landCount = p.landCount;
    const s = !p.swimming && underfoot();
    if (s) footstep(s, p.landImpact > 3 ? 'land' : 'walk', { volume: Math.min(1, 0.4 + p.landImpact / 10) });
    if (s && !p.swimming) { print(p, s, -1); print(p, s, 1); }   // (both feet)
  }
  const last = prev, moving = W.walk + W.run;
  prev = blend.phase;
  if (last === null || blend.mode !== 'loco' || !p.grounded || p.swimming || p.climb || p.ragdoll || moving < 0.3) return;
  const moved = ahead(last, blend.phase);
  if (moved <= 0 || moved > 0.5) return;
  const { walk, run } = character.footfalls;
  for (let i = 0; i < 2; i++) {
    const at = ahead(last, mixPhase(walk[i], run[i], blend.run));
    if (at <= 0 || at > moved) continue;
    const s = underfoot();
    if (s) footstep(s, blend.run > 0.5 ? 'run' : 'walk', { volume: 0.5 + 0.5 * Math.min(1, moving) });
    print(p, s, i ? 1 : -1);   // a wet print where the foot came down
  }
}

// Is (x, y, z) standing on slime (a friend, render/partner.js)? Within a step of the ground.
export function slimeAt(x, y, z) {
  if (!state.map?.biome || state.transitioning) return false;
  const theme = themeOf(state.map);
  if (!theme.mire) return false;
  const g = groundAt(x, z, y + 0.1, 0.3);
  return !!g.s && Math.abs(g.h - y) < 0.15 && surfaceAt(g.s, state.map, theme.props, x, z) === 'slime';
}

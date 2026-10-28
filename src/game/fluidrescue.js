// A boss's fluid does not kill in his fight: magic takes one out of it.
// Falling into Foggery's lava (his caldera: map.tower, cubegen/towerarena.js) burns away a quarter
// of one's most health (core/foggery.js FOGGERY_FIGHT.rescue), and magic takes one out of it to
// safe ground: where one last stood if the lava is still well under it, else the nearest floor of
// the fight above it (the top of the tower, once nothing lower is safe), else (the lava over the
// top) the nearest of the floating platforms.
// Drowning in Squarlo's tide (his tidal hills: map.tide of water, cubegen/guardian.js) costs a
// quarter of one's most health too (core/squarlo.js SQUARLO_FIGHT.rescue), and magic takes one up
// out of the water: where one last stood if even the high tide stays under the head there, else
// onto the nearest such floor of the fight (a hill).
// Drowning in Sollmeldon's mud (his mire: map.tide `mud`, game/mud.js) likewise
// (core/sollmeldon.js SOLLMELDON_FIGHT.rescue): out onto where one last stood, if the mud stays
// under the head there however the world is tipped (its surface, tipped all the way either way, or
// now), else the nearest such floor of the fight, else the highest one.
// Only if that quarter is all one has left does it kill, as everywhere else (game/ragdoll.js
// dieInFluid).
import { LH, LAVA, WATER, HEAD_Y } from '../core/constants.js';
import { player, state, setStatus } from './state.js';
import { spawnAt } from './flow.js';
import { flash } from './hud.js';
import { takeDamage } from '../core/progression.js';
import { FOGGERY_FIGHT } from '../core/foggery.js';
import { SQUARLO_FIGHT } from '../core/squarlo.js';
import { SOLLMELDON_FIGHT } from '../core/sollmeldon.js';
import { mudNow, mudTips } from './mud.js';
import { floorY } from '../core/surfaces.js';
import { supportedPoint } from '../physics/respawn.js';
import { moversNow } from '../physics/collide.js';
import { sfx } from '../audio/sfx.js';
import { emit, glow, soft, rand } from '../render/particles.js';
import { msg, tr } from '../i18n/i18n.js';

// how far over the lava a spot must stand to be safe (units): a floor of the top, just over it;
// any other, well over it (the lava may still be rising)
const OVER_TOP = 0.05, OVER = 1.6;

// the boss's fluid this is, in whose fight it does not kill: Foggery's lava, Squarlo's tide; else null
const LAVA_RESCUE = { share: FOGGERY_FIGHT.rescue, reason: msg("Burned by Foggery's lava!"), status: msg('Burned by the lava! Magic pulls you out of it'),
  sound: 'burn', colors: ['#ffd25a', '#ff8a2a', '#ff4a17'], spot: lavaSpot };
const TIDE_RESCUE = { share: SQUARLO_FIGHT.rescue, reason: msg("Nearly drowned in Squarlo's tide!"), status: msg('Nearly drowned! Magic pulls you out of the water'),
  sound: 'splash', colors: ['#ffffff', '#c8f0ff', '#7fcaf0'], spot: tideSpot };
const MUD_RESCUE = { share: SOLLMELDON_FIGHT.rescue, reason: msg("Nearly drowned in Sollmeldon's mud!"), status: msg('Nearly drowned! Magic pulls you out of the mud'),
  sound: 'splash', colors: ['#3a3129', '#17130f', '#5a4e43'], spot: mudSpot };
function rescueOf(fluid) {
  if (fluid === LAVA && state.map?.tower) return LAVA_RESCUE;
  if (fluid === WATER && state.map?.tide?.mud) return MUD_RESCUE;
  if (fluid === WATER && state.map?.tide?.fluid === WATER) return TIDE_RESCUE;
  return null;
}

// -> true when the magic took the player out (the fluid did not kill them)
export function fluidRescue(fluid, x = player.x, y = player.y, z = player.z) {
  const r = rescueOf(fluid), lose = r && Math.ceil(player.maxHp * r.share);
  if (!r || player.hp <= lose) return false;
  const spot = r.spot(x, y, z);
  if (!spot) return false;
  player.lastHurt = { reason: r.reason, by: null };
  takeDamage(player, lose, state.time);
  flash();
  sfx(r.sound, { at: { x, y, z } });
  sfx('portal', { at: spot, pitch: 1.4 });
  burst(x, y, z, r.colors, 1);
  spawnAt(spot.x, spot.y, spot.z);
  burst(spot.x, spot.y, spot.z, ['#ffffff', '#ffe9a0', '#9fdcff'], 0);
  setStatus(tr(r.status));
  return true;
}

function lavaSpot(x, y, z) {
  const lava = (state.tide ?? -Infinity) * LH;
  const ok = (s, top) => s && s.y > lava + (top ? OVER_TOP : OVER);
  const safe = player.safe, near = (a, b) => Math.hypot(a.x - x, (a.y - y) * 0.5, a.z - z) - Math.hypot(b.x - x, (b.y - y) * 0.5, b.z - z);
  const floors = state.map.floors.filter(f => f.encounter && f.tower).map(f => ({ f, x: f.x + 0.5, y: floorY(f, 0.5, 0.5), z: f.z + 0.5 }));
  const lastTop = safe && floors.some(o => o.f.tower === 'top' && Math.hypot(o.x - safe.x, o.z - safe.z) < 0.8 && Math.abs(o.y - safe.y) < 0.3);
  if (ok(safe, lastTop) && supportedPoint(safe.x, safe.y, safe.z)) return safe;
  for (const o of floors.filter(o => ok(o, o.f.tower === 'top')).sort(near)) {
    const p = supportedPoint(o.x, o.y, o.z);
    if (p) return p;
  }
  const platforms = moversNow().map(m => ({ x: (m.x0 + m.x1) / 2, y: m.y1, z: (m.z0 + m.z1) / 2 })).filter(o => o.y > lava + OVER_TOP).sort(near);
  return platforms[0] ?? null;
}

// out of Squarlo's tide: where one last stood, or the nearest floor of the fight (nearest a step up
// or down counting double), if even the high tide stays under the head there
const DRY = 0.25;   // units the high tide must stay under the head
function tideSpot(x, y, z) {
  const high = state.map.tide.high * LH, ok = s => s && s.y + HEAD_Y > high + DRY;
  const safe = player.safe;
  if (ok(safe) && supportedPoint(safe.x, safe.y, safe.z)) return safe;
  const near = s => Math.hypot(s.x - x, (s.y - y) * 2, s.z - z);
  const floors = state.map.floors.filter(f => f.encounter && !f.fluid).map(f => ({ x: f.x + 0.5, y: floorY(f, 0.5, 0.5), z: f.z + 0.5 }));
  for (const o of floors.filter(ok).sort((a, b) => near(a) - near(b))) {
    const p = supportedPoint(o.x, o.y, o.z);
    if (p) return p;
  }
  return null;
}

// a splash of lava (or water) where one fell in (up: 1), or a shimmer of magic where one comes out (0)
function burst(x, y, z, colors, up) {
  emit(glow, x, y + 0.5, z, { life: 0.4, size: 1.6, grow: 1.2, color: colors[1], alpha: 0.8 });
  for (let i = 0; i < 30; i++) {
    const a = rand(0, Math.PI * 2), s = rand(0.6, 2.4);
    emit(i % 3 ? glow : soft, x + Math.cos(a) * 0.3, y + rand(0, 1.1), z + Math.sin(a) * 0.3, { v: [Math.cos(a) * s, rand(1, 3.5) * (up ? 1.2 : 0.6), Math.sin(a) * s],
      life: rand(0.4, 0.9), size: rand(0.06, 0.14), color: colors[i % 3], alpha: 0.95, gravity: up ? 6 : -0.5, drag: 1.5 });
  }
}

// out of Sollmeldon's mud: where one last stood, or the nearest floor of the fight, if the mud stays
// under the head there now and however far the world may tip (its surface now, and tipped all the
// way each way with what it holds now); with none, the highest floor of the fight
function mudSpot(x, y, z) {
  if (!mudNow()) return null;
  const tips = mudTips(), ok = s => s && s.y + HEAD_Y > Math.max(...tips.map(f => f(s.x, s.z))) + DRY;
  const safe = player.safe;
  if (ok(safe) && supportedPoint(safe.x, safe.y, safe.z)) return safe;
  const near = s => Math.hypot(s.x - x, (s.y - y) * 2, s.z - z);
  const floors = state.map.floors.filter(f => f.encounter && !f.fluid).map(f => ({ x: f.x + 0.5, y: floorY(f, 0.5, 0.5), z: f.z + 0.5 }));
  for (const o of [...floors.filter(ok).sort((a, b) => near(a) - near(b)), ...floors.sort((a, b) => b.y - a.y)]) {
    const p = supportedPoint(o.x, o.y, o.z);
    if (p) return p;
  }
  return null;
}

// Hit feedback: a brief hit pause (critical hits only), a camera nudge, sparks and ichor, damage numbers and
// sounds. Gameplay never depends on any of this.
import { player } from './state.js';
import { emit, glow, soft, rand } from '../render/particles.js';
import { floatText } from '../render/floattext.js';
import { sfx } from '../audio/sfx.js';
import { muzzleAt } from '../core/beams.js';
import { strikeBolt, eruptGeyser } from '../render/beams.js';
import { cannonJet, jetSplash } from '../render/giantfx.js';
import { groundAt } from '../physics/collide.js';
import { N } from '../core/constants.js';
import { tr } from '../i18n/i18n.js';
import { reduceMotion, damageNumbers } from './settings.js';

// a damage number rising over whoever took it, unless the settings turn them off
const number = (...args) => { if (damageNumbers()) floatText(...args); };

let stop = 0;
// world-space camera offset that springs back (camera.js)
export const kick = { x: 0, y: 0, z: 0 };

export function hitstop(seconds) { stop = Math.max(stop, seconds); }
// the frame's time scale: nearly frozen during a hit pause
// learn: combat.html#juice, loop.html#pause (see learn/README.md)
export function timeScale(elapsed) {
  if (stop <= 0) return 1;
  stop -= elapsed;
  return 0.03;
}
export function cameraKick(dx, dz, amount, dy = 0) {
  if (reduceMotion()) return;   // (the settings)
  const l = Math.hypot(dx, dz) || 1;
  kick.x += dx / l * amount; kick.z += dz / l * amount; kick.y += dy;
}
// the ground shaking (camera.js trembles the view): `amount` rad at its strongest, dying away
export const tremor = { a: 0, t: 0 };
export function quake(amount) { if (!reduceMotion()) tremor.a = Math.min(0.05, Math.max(tremor.a, amount)); }
// a quake at (x, z) felt by our player: `amount` right there, nothing from `far` cells away
export function quakeAt(x, z, amount, far) {
  const d = Math.hypot(x - player.x, z - player.z);
  if (d < far) quake(amount * (1 - d / far) ** 1.5);
}

// the player's blade hit enemy e for dmg (killed: that was the last of its health);
// (dx, dz): the direction of the blow; crit: a critical hit (a bigger, golden number); felt:
// our own hit (a friend's has no hit pause and does not nudge our camera). Only a crit pauses time.
// learn: architecture.html#swing-journey, combat.html#juice, loop.html#pause (see learn/README.md)
export function enemyHitFx(e, dmg, killed, dx, dz, crit = false, felt = true) {
  const l = Math.hypot(dx, dz) || 1, nx = dx / l, nz = dz / l;
  if (e.proxy) {   // a boss's proxy: no blood, no number, it goes up in a cloud (render/enemies.js)
    floatText(tr('Poof!'), { x: e.x, y: e.y + e.profile.bodyHeight + 0.25, z: e.z }, { color: '#e8eef8', size: 0.3, life: 0.9, rise: 0.8, pop: 1 });
    if (felt) { if (crit) hitstop(0.07); cameraKick(nx, nz, 0.1); }
    return;
  }
  const x = e.x - nx * e.profile.radius * 0.5, y = e.y + Math.min(e.profile.bodyHeight * 0.6, 0.7), z = e.z - nz * e.profile.radius * 0.5;
  const [c1, c2] = e.profile.ichor ?? ['#a6d84e', '#5f8f22'], n = killed ? 16 : 9;
  emit(glow, x, y, z, { life: 0.14, size: killed ? 0.8 : 0.55, grow: 0.8, color: '#ffc870', alpha: 0.9 });
  for (let i = 0; i < n; i++) {   // sparks fanning out along the blow
    const s = rand(2.5, 5.5), a = rand(-0.9, 0.9), cx = nx * Math.cos(a) - nz * Math.sin(a), cz = nz * Math.cos(a) + nx * Math.sin(a);
    emit(glow, x, y, z, { v: [cx * s, rand(0.5, 2.5), cz * s], life: rand(0.18, 0.32), size: rand(0.07, 0.11),
      color: i % 3 ? '#ffd27a' : '#ffffff', gravity: 9, drag: 3 });
  }
  for (let i = 0; i < n; i++) {   // ichor droplets
    const s = rand(1, 3);
    emit(soft, x, y, z, { v: [nx * s + rand(-0.8, 0.8), rand(1, 3), nz * s + rand(-0.8, 0.8)], life: rand(0.35, 0.6),
      size: rand(0.08, 0.14), color: i % 2 ? c1 : c2, alpha: 0.95, gravity: 11 });
  }
  const top = { x: e.x, y: e.y + e.profile.bodyHeight + 0.25, z: e.z };
  number(crit ? dmg + '!' : String(dmg), top, { color: crit ? '#ffd23a' : killed ? '#ffb347' : '#ffffff',
    size: crit ? 0.36 : killed ? 0.3 : 0.24, life: 0.8, rise: 0.9, drift: rand(-0.35, 0.35), pop: crit ? 1.1 : 0.7 });
  if (felt) { if (crit) hitstop(killed ? 0.09 : 0.055); cameraKick(nx, nz, killed ? 0.16 : 0.08); }
  sfx(killed ? 'kill' : 'hit', { at: e, pitch: e.profile.pitch ?? 1.1 });
}

// a blow or shot went right through a blurry Flimmer (core/enemies.js evades), coming along (dx, dz):
// "Missed!" over it, an airy whoosh, and its blur flickers aside (render/flimmerview.js)
export function evadedFx(e, dx, dz) {
  floatText(tr('Missed!'), { x: e.x, y: e.y + e.profile.bodyHeight + 0.25, z: e.z }, { color: '#cfd8e8', size: 0.24, life: 0.8,
    rise: 0.8, drift: rand(-0.3, 0.3), pop: 0.6 });
  sfx('blur', { at: e, pitch: e.profile.pitch ?? 1 });
  e.flinch = { t: 0, side: Math.random() < 0.5 ? -1 : 1, dx, dz };
}

// an attack starts: a sword's whoosh, a flail's deeper one with its chain, a bow's draw, a staff's
// wind-up (a crossbow is quiet until it shoots)
export function swingFx(kind = 'sword') {
  if (kind === 'sword') sfx('swing', { at: player, pitch: 0.9 + 0.2 * Math.random() });
  else if (kind === 'flail') sfx('flail', { at: player, pitch: 0.9 + 0.2 * Math.random() });
  else if (kind === 'bow') sfx('draw', { at: player, volume: 0.8 });
  else if (kind === 'staff') sfx('swing', { at: player, pitch: 0.6, volume: 0.5 });
}

// the player's shot (core/shots.js) left ('launch'), or ended: 'hit' (an enemy stopped it),
// 'blocked' (the level), 'spent' (its range). Arrows and bolts knock into walls; spells burst
// in their colour wherever they end. A crossbow's reload: 'reload'
export function shotFx(shot, what) {
  const { x, y, z } = shot, spell = shot.kind === 'spell', color = shot.stats.color ?? '#c48cff';
  if (what === 'launch') { sfx(spell ? 'spell' : shot.kind === 'bolt' ? 'crossbow' : 'twang', { at: shot.ghost ? shot : player }); return; }
  if (what === 'reload') { sfx('reload', { at: player, volume: 0.8 }); return; }
  if (spell) {
    const r = Math.max(0.4, shot.stats.burst ?? 0.5), n = what === 'spent' ? 10 : 22;
    emit(glow, x, y, z, { life: 0.22, size: r * 1.6, grow: 1.2, color, alpha: 0.85 });
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(1.5, 3.5) * r;
      emit(glow, x, y, z, { v: [Math.cos(a) * s, rand(0.3, 2.2), Math.sin(a) * s], life: rand(0.25, 0.5), size: rand(0.06, 0.13),
        color: i % 3 ? color : '#ffffff', gravity: 2, drag: 3 });
    }
    sfx('burst', { at: shot, volume: what === 'spent' ? 0.5 : 0.8 });
    return;
  }
  if (what !== 'blocked') return;
  for (let i = 0; i < 7; i++)   // splinters and grit off the wall
    emit(soft, x, y, z, { v: [-shot.vx * 0.06 + rand(-1, 1), rand(0.5, 2), -shot.vz * 0.06 + rand(-1, 1)], life: rand(0.25, 0.45),
      size: rand(0.04, 0.08), color: i % 2 ? '#c9b48a' : '#8a7a62', alpha: 0.9, gravity: 9 });
  sfx('thunk', { at: shot, volume: 0.7 });
}

// the player took dmg from something at (fx, fz)
export function playerHurtFx(dmg, fx, fz) {
  number('-' + Math.ceil(dmg), q => q.set(player.x, player.visY + 1.3, player.z), { color: '#ff6a5a', size: 0.24, life: 0.9, rise: 0.7, pop: 0.6 });
  cameraKick(player.x - fx, player.z - fz, 0.12, -0.05);
  sfx('hurt', { at: player });
}

// burn damage ticking while the player is on fire
export function burnHurtFx(dmg) {
  number('-' + Math.ceil(dmg), q => q.set(player.x, player.visY + 1.15, player.z), { color: '#ffa040', size: 0.2, life: 0.7, rise: 0.8,
    drift: rand(-0.3, 0.3), pop: 0.4 });
  sfx('sizzle', { at: player, volume: 0.7 });
}

// a projectile was thrown ('launch'), or ended: 'hit' (the player), 'blocked' (the level), 'spent'
export function projectileFx(pr, what) {
  const fire = pr.kind === 'fireball', ice = pr.kind === 'iceball', { x, y, z } = pr;
  if (pr.kind === 'skull') { skullFx(pr, what); return; }
  if (pr.kind === 'water') { waterFx(pr, what); return; }
  if (pr.kind === 'slimeball') { slimeFx(pr, what); return; }
  if (pr.kind === 'slugarm') { slugArmFx(pr, what); return; }
  if (pr.kind === 'eye') { eyeFx(pr, what); return; }
  if (pr.kind === 'orb') { orbFx(pr, what); return; }
  if (pr.kind === 'hornorb') { hornOrbFx(pr, what); return; }
  if (pr.kind === 'arrow') { arrowFx(pr, what); return; }
  const ball = pr.kind === 'ball';   // Flip's ball of light
  if (what === 'launch') { sfx(fire ? 'fireball' : ice || ball ? 'frost' : 'zap', { at: pr, pitch: ball ? 1.3 : 1 }); return; }
  const colors = fire ? ['#ffd25a', '#ff8a2a', '#ff4a17'] : ice || ball ? ['#ffffff', '#c4ecff', '#7fc8ff'] : ['#f0d0ff', '#b57aff', '#7a3cff'];
  const n = what === 'spent' ? 6 : 18, s = what === 'spent' ? 1 : 2.6;
  emit(glow, x, y, z, { life: 0.18, size: what === 'spent' ? 0.35 : 0.7, grow: 1, color: colors[1], alpha: 0.9 });
  for (let i = 0; i < n; i++)
    emit(glow, x, y, z, { v: [rand(-s, s), rand(0.3, s), rand(-s, s)], life: rand(0.25, 0.5), size: rand(0.06, 0.12),
      color: colors[i % 3], gravity: fire ? 3 : 6, drag: 2 });
  if (fire) for (let i = 0; i < 3; i++)
    emit(soft, x, y + 0.1, z, { v: [rand(-0.3, 0.3), rand(0.4, 0.8), rand(-0.3, 0.3)], life: rand(0.8, 1.2), size: rand(0.2, 0.3),
      grow: 0.8, color: '#4a403a', alpha: 0.4, drag: 0.6 });
  if (ice) for (let i = 0; i < 3; i++)   // a puff of cold mist
    emit(soft, x, y, z, { v: [rand(-0.4, 0.4), rand(-0.1, 0.3), rand(-0.4, 0.4)], life: rand(0.6, 0.9), size: rand(0.2, 0.3),
      grow: 0.9, color: '#d8f2ff', alpha: 0.35, drag: 0.8 });
  if (what !== 'spent') sfx(fire ? 'whump' : ice ? 'icecrack' : 'shatter', { at: pr, volume: 0.8 });
}

// Renew's spell (or an echo's shot): a shimmer as it leaves, and where it ends a bright pop that
// fizzes out in its colour
function orbFx(pr, what) {
  if (what === 'launch') { sfx('spell', { at: pr }); return; }
  const { x, y, z } = pr, c = pr.spec.color ?? '#bdf3ff', n = what === 'spent' ? 6 : 16, s = what === 'spent' ? 1 : 2.4;
  emit(glow, x, y, z, { life: 0.2, size: what === 'spent' ? 0.35 : 0.7, grow: 1, color: c, alpha: 0.9 });
  for (let i = 0; i < n; i++)
    emit(glow, x, y, z, { v: [rand(-s, s), rand(0.3, s), rand(-s, s)], life: rand(0.25, 0.5), size: rand(0.05, 0.1),
      color: i % 2 ? '#ffffff' : c, gravity: 4, drag: 2 });
  if (what !== 'spent') sfx('burst', { at: pr, volume: 0.8 });
}

// Mansk's ball of light: it gathers at a horn with a rising hum, shoots off, and where it ends it
// bursts: a flash and a ring of sparks as wide as its burst, a boom
function hornOrbFx(pr, what) {
  if (what === 'gather') { sfx('charge', { at: pr, pitch: 1.5, volume: 0.6 }); return; }
  if (what === 'launch') { sfx('spell', { at: pr, pitch: 0.7 }); return; }
  const { x, y, z } = pr, c = pr.spec.color ?? '#8fc8ff', r = pr.spec.blast ?? 1;
  if (Math.hypot(x - player.x, z - player.z) > 30) return;
  emit(glow, x, y, z, { life: 0.3, size: r * 1.6, grow: 1, color: '#ffffff', alpha: 0.8 });
  emit(glow, x, y, z, { life: 0.45, size: r * 2.2, grow: 1.2, color: c, alpha: 0.6 });
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * Math.PI * 2, s = r * rand(3.5, 5);
    emit(glow, x, y + 0.1, z, { v: [Math.cos(a) * s, rand(0.2, 1.4), Math.sin(a) * s], life: rand(0.25, 0.45), size: rand(0.07, 0.14),
      color: i % 3 ? c : '#ffffff', drag: 4 });
  }
  for (let i = 0; i < 6; i++)
    emit(soft, x + rand(-0.4, 0.4), y + 0.1, z + rand(-0.4, 0.4), { v: [rand(-0.5, 0.5), rand(0.3, 0.9), rand(-0.5, 0.5)], life: rand(0.6, 1),
      size: rand(0.3, 0.5), grow: 1.2, color: '#dceeff', alpha: 0.35, drag: 1 });
  sfx('boom', { at: pr, volume: 0.9, pitch: 1.3 });
}

// Renew's arrow: the twang as it leaves, and a knock where it strikes (a few splinters)
function arrowFx(pr, what) {
  if (what === 'launch') { sfx('twang', { at: pr }); return; }
  if (what === 'spent') return;
  for (let i = 0; i < 6; i++)
    emit(soft, pr.x, pr.y, pr.z, { v: [rand(-1, 1), rand(0.3, 1.5), rand(-1, 1)], life: rand(0.3, 0.5), size: rand(0.03, 0.06),
      color: i % 2 ? '#c8a878' : '#f2ead8', alpha: 0.9, gravity: 6, drag: 2 });
  sfx(what === 'hit' ? 'hit' : 'thunk', { at: pr, volume: 0.7 });
}

// Totnar's skull: hurled with a whoosh and chattering teeth, and where it ends a bony knock and a
// spray of bone dust (it comes to life there, game/totnar.js)
function skullFx(pr, what) {
  if (what === 'launch') { sfx('skullthrow', { at: pr }); return; }
  const { x, y, z } = pr;
  for (let i = 0; i < 12; i++)
    emit(soft, x, y, z, { v: [rand(-1.8, 1.8), rand(0.3, 2), rand(-1.8, 1.8)], life: rand(0.4, 0.7), size: rand(0.08, 0.16),
      color: ['#efe6cf', '#d8cdb0', '#bfb49a'][i % 3], alpha: 0.8, gravity: 5, drag: 2 });
  sfx('bonk', { at: pr });
  if (what === 'hit') cameraKick(pr.vx, pr.vz, 0.08, 0.02);
}

// Foggery's eye: plucked out with a pop and thrown, burning, and where it ends a splat of burning slime
const SLIME = ['#fff6b0', '#ffd23a', '#ff8a2a'];
function eyeFx(pr, what) {
  if (what === 'launch') { sfx('pop', { at: pr, pitch: 0.8 }); sfx('skullthrow', { at: pr, pitch: 1.4, volume: 0.6 }); return; }
  const { x, y, z } = pr, n = what === 'spent' ? 8 : 18;
  for (let i = 0; i < n; i++)
    emit(soft, x, y, z, { v: [rand(-1.8, 1.8) - pr.vx * 0.08, rand(0.4, 2.2), rand(-1.8, 1.8) - pr.vz * 0.08], life: rand(0.35, 0.65),
      size: rand(0.05, 0.11), color: SLIME[i % 3], alpha: 0.95, gravity: 9, drag: 1 });
  emit(glow, x, y, z, { life: 0.25, size: 0.7, grow: 1.2, color: '#ff8a2a', alpha: 0.8 });
  for (let i = 0; i < 10; i++)
    emit(glow, x, y, z, { v: [rand(-1.5, 1.5), rand(0.5, 2.5), rand(-1.5, 1.5)], life: rand(0.25, 0.5), size: rand(0.06, 0.12),
      color: ['#ffd25a', '#ff8a2a', '#ff4a17'][i % 3], gravity: 3, drag: 2 });
  sfx('drip', { at: pr, pitch: 0.7 }); sfx('whump', { at: pr, pitch: 1.3, volume: 0.6 });
  if (what === 'hit') cameraKick(pr.vx, pr.vz, 0.06, 0.02);
}

// a Squirtle's water ball: spat with a gulp, and where it ends a splash of droplets
const DROPS = ['#ffffff', '#c8f0ff', '#7fcaf0'];
function waterFx(pr, what) {
  if (what === 'launch') { sfx('spit', { at: pr }); return; }
  const { x, y, z } = pr, n = what === 'spent' ? 8 : 16;
  for (let i = 0; i < n; i++)
    emit(soft, x, y, z, { v: [rand(-1.6, 1.6) - pr.vx * 0.08, rand(0.4, 2.4), rand(-1.6, 1.6) - pr.vz * 0.08], life: rand(0.35, 0.6),
      size: rand(0.05, 0.1), color: DROPS[i % 3], alpha: 0.9, gravity: 9, drag: 1 });
  emit(soft, x, y, z, { life: 0.25, size: 0.4, grow: 1.4, color: '#e8fbff', alpha: 0.5 });
  sfx('drip', { at: pr, volume: what === 'spent' ? 0.5 : 0.9 });
}

// one of Slomo's slug arms: torn off his arm with a wet pop and flung, and where it lands a splat of
// goo (it comes to life there, game/slomo.js)
function slugArmFx(pr, what) {
  if (what === 'launch') { sfx('pop', { at: pr, pitch: 0.6 }); sfx('skullthrow', { at: pr, pitch: 0.8, volume: 0.7 }); return; }
  slimeFx(pr, what === 'spent' ? 'blocked' : what);
  if (what === 'hit') cameraKick(pr.vx, pr.vz, 0.07, 0.03);
}
// a Slug's ball of slime: spat with a wet hork, and where it ends a splat of goo
const GOO = ['#d8ff9a', '#8ae048', '#3e7a2a'];
function slimeFx(pr, what) {
  if (what === 'launch') { sfx('spit', { at: pr, pitch: 0.6 }); return; }
  const { x, y, z } = pr, n = what === 'spent' ? 8 : 18;
  for (let i = 0; i < n; i++)
    emit(soft, x, y, z, { v: [rand(-1.5, 1.5) - pr.vx * 0.08, rand(0.3, 2), rand(-1.5, 1.5) - pr.vz * 0.08], life: rand(0.4, 0.7),
      size: rand(0.06, 0.12), color: GOO[i % 3], alpha: 0.95, gravity: 9, drag: 1 });
  emit(soft, x, y, z, { life: 0.3, size: 0.45, grow: 1.3, color: '#b8ff5a', alpha: 0.5 });
  sfx('drip', { at: pr, pitch: 0.6, volume: what === 'spent' ? 0.5 : 0.9 });
  if (what !== 'spent') sfx('whump', { at: pr, pitch: 1.6, volume: 0.5 });
}

// a slime meteorite (game/meteors.js) whose shadow starts to show ('warn'), that starts to fall
// ('fall': a whistle), and lands ('land': a wet boom, goo flying, the ground shaking near it)
export function meteorFx(v, what) {
  const { x, y, z } = v.at, near = Math.max(0, 1 - Math.hypot(player.x - x, player.z - z) / 14);
  if (what === 'warn') return;
  if (what === 'fall') { if (near > 0) sfx('fall', { at: v.at, pitch: 1.6, volume: 0.25 + 0.5 * near }); return; }
  for (let i = 0; i < 26; i++)
    emit(soft, x, y + 0.2, z, { v: [rand(-3, 3), rand(1.5, 4.5), rand(-3, 3)], life: rand(0.5, 0.9), size: rand(0.08, 0.16),
      color: GOO[i % 3], alpha: 0.95, gravity: 9, drag: 0.6 });
  emit(glow, x, y + 0.3, z, { life: 0.35, size: 1.4, grow: 1.5, color: '#b8ff5a', alpha: 0.8 });
  for (let i = 0; i < 4; i++)
    emit(soft, x + rand(-0.5, 0.5), y + 0.2, z + rand(-0.5, 0.5), { v: [rand(-0.4, 0.4), rand(0.5, 1), rand(-0.4, 0.4)], life: rand(0.9, 1.4),
      size: rand(0.3, 0.5), grow: 1, color: '#6a8a4a', alpha: 0.35, drag: 0.6 });
  sfx('whump', { at: v.at, pitch: 0.7, volume: 0.4 + 0.6 * near }); sfx('splorch', { at: v.at, volume: 0.3 + 0.5 * near });
  if (near > 0.6) cameraKick(0, 0, 0.05 * near, 0.06 * near);
}

// the Spicy's laser (game/beams.js) switched on ('start'), went off ('burst') or was put out
// because its enemy was staggered or killed ('fizzle')
export function beamFx(b, what) {
  if (b.spec.kind === 'bolt') { boltFx(b, what); return; }
  if (b.spec.kind === 'stomp') { stompFx(b, what); return; }
  if (b.spec.kind === 'geyser') { geyserFx(b, what); return; }
  const color = b.profile?.beamColor ?? b.spec.color ?? '#7dff3a', colors = ['#ffffff', color, '#d8ff7a'];
  if (what === 'start') { sfx('laser', { at: b }); return; }
  if (what === 'fizzle') {
    for (let i = 0; i < 6; i++)
      emit(glow, b.x, b.y, b.z, { v: [rand(-1, 1), rand(0, 1), rand(-1, 1)], life: rand(0.15, 0.3), size: rand(0.04, 0.08), color: colors[i % 3], drag: 2 });
    sfx('fizzle', { at: b, pitch: 1.4, volume: 0.6 });
    return;
  }
  // the burst: a flash where it ends, and the whole beam crackling apart
  const { ex: x, ey: y, ez: z } = b;
  emit(glow, x, y, z, { life: 0.22, size: 1.1, grow: 1.2, color, alpha: 0.9 });
  emit(glow, x, y, z, { life: 0.12, size: 0.6, grow: 1, color: '#ffffff', alpha: 0.9 });
  for (let i = 0; i < 26; i++)
    emit(glow, x, y, z, { v: [rand(-3.5, 3.5), rand(0.5, 4), rand(-3.5, 3.5)], life: rand(0.25, 0.55), size: rand(0.06, 0.13),
      color: colors[i % 3], gravity: 7, drag: 2 });
  for (let i = 0; i < 4; i++)   // a whiff of toxic smoke
    emit(soft, x, y + 0.1, z, { v: [rand(-0.3, 0.3), rand(0.4, 0.8), rand(-0.3, 0.3)], life: rand(0.8, 1.2), size: rand(0.22, 0.32),
      grow: 0.8, color: '#7a9a4a', alpha: 0.35, drag: 0.6 });
  for (let i = 0, n = Math.ceil(b.length / 0.25); i < n; i++) {
    const k = (i + Math.random()) / n;
    emit(glow, b.x + (x - b.x) * k, b.y + (y - b.y) * k, b.z + (z - b.z) * k, { v: [rand(-0.6, 0.6), rand(-0.2, 0.8), rand(-0.6, 0.6)],
      life: rand(0.15, 0.3), size: rand(0.06, 0.11), color: colors[i % 3], drag: 3 });
  }
  sfx('zapburst', { at: { x, y, z } });
  if (Math.hypot(x - player.x, z - player.z) < 3) cameraKick(x - player.x, z - player.z, 0.06, 0.02);
}

// Foggery's fire geysers (a beam of kind 'geyser', game/beams.js): a rumble as the floor starts to
// glow ('start'), a hiss when he is stopped ('fizzle'), and when it bursts a column of fire
// (render/beams.js eruptGeyser), a roar, fire and lava spraying up and the ground shaking
const FIRE_SPRAY = ['#fff0a0', '#ffb040', '#ff5a14'];
function geyserFx(b, what) {
  const x = b.ax ?? b.ex, y = b.ay ?? b.ey, z = b.az ?? b.ez;
  if (what === 'start') { if (!b.quiet) sfx('rumble', { at: { x, y, z }, volume: 0.6, pitch: 1.3 }); return; }
  if (what === 'fizzle') { sfx('hiss', { at: { x, y, z }, volume: 0.5 }); return; }
  eruptGeyser(b);
  emit(glow, x, y + 0.4, z, { life: 0.3, size: 1.6, grow: 1.4, color: '#ffb040', alpha: 0.8 });
  for (let i = 0; i < 40; i++) {
    const a = rand(0, Math.PI * 2), s = rand(0.3, 1.6);
    emit(i % 4 ? glow : soft, x + Math.cos(a) * 0.2, y + rand(0, 0.6), z + Math.sin(a) * 0.2, { v: [Math.cos(a) * s, rand(4, 8), Math.sin(a) * s],
      life: rand(0.5, 0.9), size: rand(0.06, 0.14), color: i % 4 ? FIRE_SPRAY[i % 3] : '#4a3a34', alpha: 0.95, gravity: 9, drag: 0.8 });
  }
  if (!b.quiet) sfx('fireball', { at: { x, y, z }, pitch: 0.6 });
  sfx('boom', { at: { x, y, z }, volume: 0.5, pitch: 1.2 });
  if (Math.hypot(x - player.x, z - player.z) < 4) cameraKick(x - player.x, z - player.z, 0.05, 0.05);
}

// The Wolk's lightning (a beam of kind 'bolt', game/beams.js): it starts gathering ('start'),
// is put out ('fizzle'), or strikes ('burst'): a jagged flash from the cloud to the spot
// (render/beams.js), sparks and a puff of smoke there, a crack, and the thunder rolling in after
// it, later the further from the player it struck (about a second at five cells).
const THUNDER_DELAY = 0.45, THUNDER_PER_CELL = 0.11;
export const thunderDelay = d => Math.min(2, THUNDER_DELAY + THUNDER_PER_CELL * d);
function boltFx(b, what) {
  const color = b.profile?.beamColor ?? b.spec.color ?? '#fff6b0', colors = ['#ffffff', color, '#9fd0ff'];
  if (what === 'start') { if (!b.quiet) sfx('charge', { at: b }); return; }
  if (what === 'fizzle') {
    for (let i = 0; i < 8; i++)
      emit(glow, b.x, b.y, b.z, { v: [rand(-1, 1), rand(-0.5, 0.8), rand(-1, 1)], life: rand(0.15, 0.3), size: rand(0.04, 0.08), color: colors[i % 3], drag: 2 });
    sfx('fizzle', { at: b, pitch: 1.2, volume: 0.6 });
    return;
  }
  const { ex: x, ey: y, ez: z } = b, d = Math.hypot(x - player.x, z - player.z);
  strikeBolt(b);
  emit(glow, x, y + 0.1, z, { life: 0.18, size: 1.4, grow: 1.2, color: '#ffffff', alpha: 0.9 });
  emit(glow, x, y + 0.1, z, { life: 0.3, size: 0.9, grow: 1.5, color, alpha: 0.7 });
  for (let i = 0; i < 30; i++)
    emit(glow, x, y + 0.05, z, { v: [rand(-3, 3), rand(1, 4.5), rand(-3, 3)], life: rand(0.25, 0.5), size: rand(0.05, 0.11),
      color: colors[i % 3], gravity: 8, drag: 1.5 });
  for (let i = 0; i < 5; i++)   // a puff of smoke off the scorched floor
    emit(soft, x + rand(-0.15, 0.15), y + 0.1, z + rand(-0.15, 0.15), { v: [rand(-0.3, 0.3), rand(0.4, 0.9), rand(-0.3, 0.3)],
      life: rand(0.8, 1.3), size: rand(0.2, 0.32), grow: 0.9, color: '#5a5f68', alpha: 0.4, drag: 0.6 });
  sfx('lightning', { at: { x, y, z } });
  if (!b.quiet) sfx('rumble', { at: { x, y, z }, delay: thunderDelay(d), volume: Math.max(0.5, 1 - d / 14) });
  if (d < 4) cameraKick(x - player.x || 0.01, z - player.z, 0.08, 0.05);
}
// the player stunned by a bolt (game/enemycombat.js)
export function zappedFx() {
  floatText(tr('Zapped!'), q => q.set(player.x, player.visY + 1.65, player.z), { color: '#fff3a0', size: 0.22, life: 0.9, rise: 0.6 });
}
// an enemy stunned by a Zappy weapon (game/enchants.js); its sparks: render/statuses.js
export function enemyZappedFx(e) {
  if (e.proxy) return;
  floatText(tr('Zap!'), { x: e.x, y: e.y + e.profile.bodyHeight + 0.35, z: e.z }, { color: '#fff3a0', size: 0.2, life: 0.7, rise: 0.6 });
  sfx('zap', { at: e, volume: 0.6, pitch: 1.3 });
}
// squashed flat by a giant landing on us (game/enemycombat.js, a blow's `daze`): the hero goes
// flat as a pancake and springs back (render/animator.js), dazed, seeing stars (render/shocked.js)
export const FLAT = 0.9;   // s the squash shows
export function squashedFx() {
  player.flat = FLAT;
  floatText(tr('Squashed!'), q => q.set(player.x, player.visY + 1.3, player.z), { color: '#bff4ff', size: 0.28, life: 1.2, rise: 0.5, pop: 1 });
  sfx('bonk', { at: player, pitch: 0.7 });
  sfx('dizzy', { at: player });
}

// The Wolla's storm (game/gusts.js), spec g: lightning out of its cloud ('thunder', i: which
// bolt), the blow starting ('blow'), and the gust blowing for a frame of dt ('gust'): wind
// streaks, rain and wisps of cloud rushing out of its mouth in its cone. arg: the bolt, or dt.
const WIND = ['#ffffff', '#e2f1ff', '#c4e2ff'];
const BOLTS = [[0.25, 1.0, 0.04], [-0.23, 1.0, 0.04]];   // where they end (blender/wolla.py)
export function stormFx(e, g, what, arg = 0) {
  if (g.kind === 'vortex') { vortexFx(e, g, what, arg); return; }
  if (g.kind === 'jet') { jetFx(e, g, what, arg); return; }
  if (g.kind === 'inhale') { inhaleFx(e, g, what, arg); return; }
  if (g.kind === 'cannon') { cannonFx(e, g, what, arg); return; }
  const size = e.profile.size ?? 1, fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), dt = arg;
  if (what === 'thunder') {
    const at = muzzleAt(e, BOLTS[arg % 2].map(v => v * size));
    emit(glow, at.x, at.y, at.z, { life: 0.12, size: 0.9, grow: 1, color: '#fff4c0', alpha: 0.9 });
    for (let i = 0; i < 10; i++)
      emit(glow, at.x, at.y, at.z, { v: [rand(-1.5, 1.5), rand(-2.5, 0.5), rand(-1.5, 1.5)], life: rand(0.12, 0.25), size: rand(0.04, 0.08),
        color: i % 2 ? '#ffe45a' : '#ffffff', gravity: 4, drag: 2 });
    sfx('thunder', { at, pitch: arg ? 0.85 : 1 });
    if (Math.hypot(at.x - player.x, at.z - player.z) < 4) cameraKick(0, 0, 0, 0.04);
    return;
  }
  const o = muzzleAt(e, g.muzzle);
  if (what === 'blow') {
    sfx('gust', { at: o });
    for (let i = 0; i < 6; i++)   // the cloud torn apart by the blow
      emit(soft, o.x + rand(-0.2, 0.2), o.y + rand(0.2, 0.6), o.z + rand(-0.2, 0.2), { v: [fx * rand(2, 4), rand(-0.3, 0.2), fz * rand(2, 4)],
        life: rand(0.5, 0.8), size: rand(0.25, 0.4), grow: 1, color: '#6b7384', alpha: 0.5, drag: 1.5 });
    if (Math.hypot(o.x - player.x, o.z - player.z) < 5) cameraKick(fx, fz, 0.05);
    return;
  }
  // blowing: streaks (three motes in a row, flying together), raindrops and grey wisps
  const sx = fz, sz = -fx, speed = g.range / 0.45;
  const fan = () => { const u = rand(-1, 1); return [u * g.width * 0.7, u * g.spread]; };
  for (let n = Math.floor(90 * dt + Math.random()); n > 0; n--) {
    const [w, s] = fan(), v = speed * rand(0.85, 1.15), y = o.y + rand(-0.3, 0.35), vy = rand(-0.4, 0.3);
    const vx = (fx + sx * s) * v, vz = (fz + sz * s) * v, c = WIND[n % 3], life = rand(0.3, 0.45);
    for (let k = 0; k < 4; k++)
      emit(soft, o.x + sx * w - vx * k * 0.014, y - vy * k * 0.014, o.z + sz * w - vz * k * 0.014,
        { v: [vx, vy, vz], life, size: 0.075 - k * 0.014, color: c, alpha: 0.9 - k * 0.18 });
  }
  const rain = e.profile.ichor?.[0] ?? '#9fd8ff';
  for (let n = Math.floor(30 * dt + Math.random()); n > 0; n--) {
    const [w, s] = fan(), v = speed * rand(0.6, 0.9);
    emit(soft, o.x + sx * w, o.y + rand(-0.2, 0.3), o.z + sz * w, { v: [(fx + sx * s) * v, rand(0, 0.8), (fz + sz * s) * v],
      life: rand(0.35, 0.5), size: rand(0.04, 0.06), color: n % 2 ? rain : '#7fb8ff', alpha: 0.9, gravity: 5 });
  }
  for (let n = Math.floor(22 * dt + Math.random()); n > 0; n--) {   // the storm itself: grey cloud tearing along
    const [w, s] = fan(), v = speed * rand(0.45, 0.7);
    emit(soft, o.x + sx * w, o.y + rand(-0.1, 0.3), o.z + sz * w, { v: [(fx + sx * s) * v, rand(-0.1, 0.2), (fz + sz * s) * v],
      life: rand(0.5, 0.75), size: rand(0.22, 0.36), grow: 1.6, color: n % 2 ? '#7d8698' : '#9aa3b4', alpha: 0.42, drag: 0.7 });
  }
}

// A Tornado's twister (game/twisters.js): spinning up (over a hand, or under the Tornado as it
// takes off: a whirl of wind and dust there), let go (dropping onto the floor in a burst of dust),
// catching a player (a roaring spin) and blowing away (a last puff). Its colour is its kind's.
const DUST = ['#c9c0ae', '#e2dccf', '#a89f8c'];
export function twisterFx(w, what) {
  const near = Math.hypot(w.x - player.x, w.z - player.z) < 16, c = w.profile?.sparks ?? DUST;
  if (!near) return;
  if (what === 'spin') { sfx('whirl', { at: w, pitch: w.kind === 'hand' ? 1.25 : 0.9, volume: w.kind === 'hand' ? 0.6 : 0.9 }); return; }
  if (what === 'loose') {
    sfx('gust', { at: w, pitch: 1.5, volume: 0.5 });
    for (let i = 0; i < 18; i++) {
      const a = rand(0, Math.PI * 2), s = rand(1, 2.4);
      emit(soft, w.x, w.y + 0.08, w.z, { v: [Math.cos(a) * s, rand(0.2, 1), Math.sin(a) * s], life: rand(0.4, 0.7),
        size: rand(0.12, 0.25), grow: 1.4, color: i % 3 ? DUST[i % 3] : c[0], alpha: 0.5, drag: 2.5 });
    }
    return;
  }
  if (what === 'catch') {
    sfx('twirl', { at: w });
    if (Math.hypot(w.x - player.x, w.z - player.z) < 4) cameraKick(0, 0, 0, 0.06);
    return;
  }
  for (let i = 0; i < 12; i++) {   // gone: blown apart
    const a = rand(0, Math.PI * 2), s = rand(0.6, 1.6);
    emit(soft, w.x + Math.cos(a) * 0.2, w.y + rand(0.1, 0.9), w.z + Math.sin(a) * 0.2, { v: [Math.cos(a) * s, rand(0.3, 1.2), Math.sin(a) * s],
      life: rand(0.35, 0.6), size: rand(0.14, 0.26), grow: 1.5, color: DUST[i % 3], alpha: 0.4, drag: 2 });
  }
}
// The player caught in a twister (game/twirl.js): dust and wind whirling round them while they
// spin, and a whump as they are flung
export function twirlFx(p, what, dt = 0) {
  if (what === 'caught') { cameraKick(0, 0, 0, 0.08); return; }
  if (what === 'fling') { sfx('whump', { at: p, pitch: 0.8 }); cameraKick(0, 0, 0, 0.1); return; }
  const spin = performance.now() / 1000 * 9;
  for (let n = Math.floor(70 * dt + Math.random()); n > 0; n--) {
    const k = Math.random(), a = spin + k * 7 + n * 2.1, r = 0.25 + 0.3 * k;
    emit(soft, p.x + Math.cos(a) * r, p.y - 0.6 + k * 2, p.z + Math.sin(a) * r, { v: [-Math.sin(a) * 3, 0.8, Math.cos(a) * 3],
      life: rand(0.2, 0.35), size: rand(0.06, 0.12), color: DUST[n % 3], alpha: 0.6, drag: 1 });
  }
}

// A giant's stomp or his landing (a beam of kind 'stomp', game/beams.js; its shadow:
// render/beams.js): when it comes down ('burst'), a boom, the ground shaking, a ring of dust and
// spray bursting out from under the foot (the shockwave running on: game/quakes.js, waveFx).
// (Started or put out: nothing to show.)
function stompFx(b, what) {
  if (what !== 'burst') return;
  const { ex: x, ey: y, ez: z } = b, r = b.spec.radius, big = r / 1.15;
  sfx('stomp', { at: { x, y, z }, pitch: 1.15 / Math.sqrt(big) });
  for (let i = 0; i < 40 * big; i++) {
    const a = rand(0, Math.PI * 2), s = rand(3, 7) * Math.sqrt(big), d = r * rand(0.5, 0.9);
    emit(soft, x + Math.cos(a) * d, y + 0.1, z + Math.sin(a) * d, { v: [Math.cos(a) * s, rand(0.3, 1.6), Math.sin(a) * s], life: rand(0.5, 0.9),
      size: rand(0.3, 0.6), grow: 1.4, color: i % 3 ? '#c9c0ae' : '#e8f6ff', alpha: 0.55, drag: 2.5 });
  }
  for (let i = 0; i < 24 * big; i++)
    emit(soft, x + rand(-r, r) * 0.6, y + 0.15, z + rand(-r, r) * 0.6, { v: [rand(-3, 3), rand(3, 6.5), rand(-3, 3)], life: rand(0.5, 0.9),
      size: rand(0.06, 0.13), color: DROPS[i % 3], alpha: 0.9, gravity: 10, drag: 0.6 });
  emit(glow, x, y + 0.2, z, { life: 0.18, size: 2.2 * r, grow: 1.2, color: '#fff6e0', alpha: 0.35 });
  quakeAt(x, z, 0.03 * big, 18);
  if (Math.hypot(x - player.x, z - player.z) < 10) cameraKick(0, 0, 0, 0.2 * big);
}
// a shockwave starts running out (game/quakes.js): a deep rumble rolling away under the floor
export function waveFx(w) {
  sfx('rumble', { at: w, pitch: 0.7, volume: 0.8 });
  quakeAt(w.x, w.z, 0.022, 14);
}
// a giant springs off the floor (game/squarlo.js leap): a whump, a burst of dust from under his
// feet, the ground jolting
export function leapFx(e) {
  const s = Math.sqrt(e.profile.size ?? 1);
  sfx('whump', { at: e, pitch: 0.5 });
  sfx('jump', { at: e, pitch: 0.45, volume: 0.9 });
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2), v = rand(1.5, 3.5);
    emit(soft, e.x + Math.cos(a) * 0.3 * s, e.y + 0.1, e.z + Math.sin(a) * 0.3 * s, { v: [Math.cos(a) * v, rand(0.2, 1), Math.sin(a) * v],
      life: rand(0.5, 0.8), size: rand(0.25, 0.45), grow: 1.3, color: i % 3 ? '#c9c0ae' : '#e8f6ff', alpha: 0.5, drag: 2.5 });
  }
  quakeAt(e.x, e.z, 0.012, 12);
}
// one of a giant's footfalls as he walks (render/enemies.js): a thud and a little jolt
export function footfallFx(x, y, z, size) {
  sfx('thud', { at: { x, y, z }, pitch: 0.45, volume: 0.55 });
  for (let i = 0; i < 6; i++) {
    const a = rand(0, Math.PI * 2), v = rand(0.6, 1.4);
    emit(soft, x + Math.cos(a) * 0.4, y + 0.06, z + Math.sin(a) * 0.4, { v: [Math.cos(a) * v, rand(0.1, 0.5), Math.sin(a) * v],
      life: rand(0.4, 0.7), size: rand(0.18, 0.3), grow: 1.2, color: '#c9c0ae', alpha: 0.4, drag: 2.5 });
  }
  quakeAt(x, z, 0.004 * Math.sqrt(size), 12);
}

// A giant's water cannon (a gust of kind 'cannon', game/gusts.js), blasted down from his hands
// onto the floor ahead, sweeping across: water swirling into his cupped hands while it gathers
// ('inhale'), a burst and a roar as it starts ('blow'), and while it blasts ('gust', for a frame
// of dt) the jet arching down (render/giantfx.js), spray thrown up where it lands and water
// rushing on along the floor to the end of its reach, the ground rumbling under it.
function cannonFx(e, g, what, dt) {
  const o = muzzleAt(e, g.muzzle), fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), sx = fz, sz = -fx, size = Math.sqrt(e.profile.size ?? 1);
  if (what === 'inhale') {
    for (let n = Math.floor(60 * dt + Math.random()); n > 0; n--) {
      const a = rand(0, Math.PI * 2), r = rand(0.6, 1.4), life = rand(0.25, 0.4);
      const x = o.x + Math.cos(a) * r, y = o.y + rand(-0.6, 0.5), z = o.z + Math.sin(a) * r;
      emit(soft, x, y, z, { v: [(o.x - x) / life - Math.sin(a) * 2, (o.y - y) / life, (o.z - z) / life + Math.cos(a) * 2], life,
        size: rand(0.08, 0.15), color: DROPS[n % 3], alpha: 0.85 });
    }
    return;
  }
  if (what === 'blow') {
    sfx('cannon', { at: o });
    emit(glow, o.x, o.y, o.z, { life: 0.25, size: 2.2, grow: 1.4, color: '#e8fbff', alpha: 0.5 });
    if (Math.hypot(o.x - player.x, o.z - player.z) < 12) cameraKick(fx, fz, 0.1, 0.05);
    quakeAt(o.x, o.z, 0.012, 14);
    return;
  }
  if (what !== 'gust') return;
  // it lands about two thirds of its reach out (short of the cube's edge), on the floor there; the
  // water runs on from there
  const edge = (p, f) => f > 1e-6 ? (N - 0.3 - p) / f : f < -1e-6 ? (0.3 - p) / f : Infinity;
  const land = Math.max(1, Math.min(g.range * 0.62, edge(o.x, fx), edge(o.z, fz)));
  const gx = o.x + fx * land, gz = o.z + fz * land, gh = groundAt(gx, gz, e.y + 1, 0).h;
  const floor = Number.isFinite(gh) ? gh : e.y;
  const at = cannonJet(e, o, fx, fz, floor, land, size, e.t);
  jetSplash(at, fx, fz, dt, size * 0.6);
  for (let n = Math.floor(50 * dt + Math.random()); n > 0; n--) {   // spray along its whole reach
    const s = rand(g.near, g.range), w = (g.width + g.spread * s) * rand(-1, 1), v = rand(2, 5);
    const x = o.x + fx * s + sx * w, z = o.z + fz * s + sz * w;
    emit(soft, x, floor + 0.08, z, { v: [fx * v, rand(0.3, 1.4), fz * v], life: rand(0.35, 0.6), size: rand(0.16, 0.3), grow: 1.3,
      color: n % 3 ? '#e6f8ff' : '#9fdcf2', alpha: 0.55, drag: 1.5, gravity: 2 });
  }
  if (Math.random() < dt * 20) sfx('spray', { at, pitch: rand(0.5, 0.7), volume: 0.5 });
  quakeAt(o.x, o.z, 0.004, 12);
}
// Squarlo starts calling the tide (game/gusts.js): a deep swell of sound and water welling up
// in a ring round him
export function tideCallFx(e) {
  sfx('tidecall', { at: e });
  for (let i = 0; i < 30; i++) {
    const a = rand(0, Math.PI * 2), r = rand(0.4, 1.4) * (e.profile.size ?? 1) ** 0.5;
    emit(soft, e.x + Math.cos(a) * r, e.y + 0.05, e.z + Math.sin(a) * r, { v: [-Math.cos(a) * 0.4, rand(1.2, 2.6), -Math.sin(a) * 0.4],
      life: rand(0.5, 0.9), size: rand(0.06, 0.12), color: DROPS[i % 3], alpha: 0.9, gravity: 4, drag: 0.5 });
  }
}

// Gusto breathing in (a pull, game/gusts.js): the suck starting ('suck'), and while it pulls
// ('pull', for a frame of dt) streaks of air and dust rushing out of its cone into his mouth,
// whirling round it at the last (like the vortex's breath).
const DRAFT = ['#ffffff', '#e8eef8', '#d2dcea'];
function inhaleFx(e, g, what, dt) {
  const o = muzzleAt(e, g.muzzle), fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), sx = fz, sz = -fx;
  if (what === 'suck') {
    sfx('inhale', { at: o });
    if (Math.hypot(o.x - player.x, o.z - player.z) < g.range) cameraKick(-fx, -fz, 0.04);
    return;
  }
  vortexFx(e, g, 'inhale', dt * 1.5);
  for (let n = Math.floor(130 * dt + Math.random()); n > 0; n--) {
    const ahead = rand(0.8, g.range), side = rand(-1, 1) * (g.width + g.spread * ahead) * 0.9, life = rand(0.35, 0.6);
    const x = o.x + fx * ahead + sx * side, z = o.z + fz * ahead + sz * side, y = o.y + rand(-0.9, 0.5);
    const v = [(o.x - x) / life, (o.y - y) / life, (o.z - z) / life];
    for (let k = 0; k < 3; k++)   // a streak: three motes in a row, flying together
      emit(soft, x - v[0] * k * 0.02, y - v[1] * k * 0.02, z - v[2] * k * 0.02,
        { v, life, size: 0.09 - k * 0.02, color: DRAFT[n % 3], alpha: 0.85 - k * 0.22 });
  }
  for (let n = Math.floor(26 * dt + Math.random()); n > 0; n--) {   // dust swept off the floor
    const ahead = rand(1, g.range * 0.8), side = rand(-1, 1) * (g.width + g.spread * ahead) * 0.8, life = rand(0.6, 0.9);
    const x = o.x + fx * ahead + sx * side, z = o.z + fz * ahead + sz * side, y = e.y + 0.1;
    emit(soft, x, y, z, { v: [(o.x - x) / life, (o.y - y) / life * 0.6, (o.z - z) / life], life,
      size: rand(0.2, 0.34), grow: 0.6, color: '#b5a98f', alpha: 0.5, drag: 0.3 });
  }
}
// Gusto crashing face down after a grab that caught nothing (game/gusts.js): a thump and dust
export function felledFx(e) {
  const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), x = e.x + fx * 0.9, z = e.z + fz * 0.9;
  sfx('thud', { at: e, pitch: 0.55 });
  for (let i = 0; i < 14; i++) {
    const a = rand(0, Math.PI * 2), s = rand(1, 2.4);
    emit(soft, x, e.y + 0.15, z, { v: [Math.cos(a) * s, rand(0.2, 0.9), Math.sin(a) * s], life: rand(0.5, 0.9),
      size: rand(0.2, 0.35), grow: 1.2, color: '#c9c0ae', alpha: 0.45, drag: 2.5 });
  }
  if (Math.hypot(e.x - player.x, e.z - player.z) < 6) cameraKick(0, 0, 0, 0.06);
}

// Gusto's vortex (a gust of kind 'vortex', game/gusts.js), blown through his hands: he breathes
// in ('inhale', for a frame of dt: air spiralling into his hands), blows ('blow'), and while it
// blows ('gust', dt) three strands of air whirl out along its cone, with wisps drifting along.
const SWIRL = ['#ffffff', '#d9e8ff', '#b4cdf2'];
function vortexFx(e, g, what, dt) {
  const o = muzzleAt(e, g.muzzle), fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), sx = fz, sz = -fx;
  if (what === 'inhale') {
    for (let n = Math.floor(45 * dt + Math.random()); n > 0; n--) {
      const a = rand(0, Math.PI * 2), r = rand(0.5, 1.1), ahead = rand(0.3, 1.2), life = rand(0.3, 0.45);
      const x = o.x + fx * ahead + sx * Math.cos(a) * r, y = o.y + Math.sin(a) * r * 0.8, z = o.z + fz * ahead + sz * Math.cos(a) * r;
      const ux = -Math.sin(a) * sx, uy = Math.cos(a) * 0.8, uz = -Math.sin(a) * sz;   // round the axis
      emit(soft, x, y, z, { v: [(o.x - x) / life + ux * 1.5, (o.y - y) / life + uy * 1.5, (o.z - z) / life + uz * 1.5], life,
        size: rand(0.04, 0.07), color: SWIRL[n % 3], alpha: 0.75 });
    }
    return;
  }
  if (what === 'blow') {
    sfx('vortex', { at: o });
    emit(glow, o.x, o.y, o.z, { life: 0.2, size: 0.8, grow: 1.4, color: '#ffffff', alpha: 0.6 });
    if (Math.hypot(o.x - player.x, o.z - player.z) < 6) cameraKick(fx, fz, 0.07, 0.02);
    return;
  }
  const spin = e.t * 14, speed = g.range / 0.5;
  for (let n = Math.floor(320 * dt + Math.random()); n > 0; n--) {
    const s = rand(0.1, g.range), a = spin - s * 3.2 + (n % 3) * Math.PI * 2 / 3 + rand(-0.15, 0.15), r = 0.12 + s * g.spread * 0.8;
    const ca = Math.cos(a), sa = Math.sin(a);
    const x = o.x + fx * s + sx * ca * r, y = o.y + sa * r - s * 0.1, z = o.z + fz * s + sz * ca * r;
    const t = r * 14;   // whirling round the axis
    emit(soft, x, y, z, { v: [fx * speed * 0.3 - sx * sa * t, ca * t, fz * speed * 0.3 - sz * sa * t], life: rand(0.12, 0.2),
      size: rand(0.08, 0.13) * (1 + s * 0.2), color: SWIRL[n % 3], alpha: 0.95 });
  }
  for (let n = Math.floor(30 * dt + Math.random()); n > 0; n--) {
    const u = rand(-1, 1), v = speed * rand(0.45, 0.7);
    emit(soft, o.x + sx * u * 0.2, o.y + rand(-0.15, 0.15), o.z + sz * u * 0.2, { v: [(fx + sx * u * g.spread) * v, rand(-0.25, 0.1), (fz + sz * u * g.spread) * v],
      life: rand(0.45, 0.7), size: rand(0.3, 0.45), grow: 1.8, color: '#dce6f4', alpha: 0.4, drag: 0.7 });
  }
}

// Squarlo's jet (a gust of kind 'jet', game/gusts.js), out of his cupped hands: water gathering
// in them ('inhale', for a frame of dt), the jet bursting out ('blow') and while it blows ('gust',
// dt) a rope of water and spray along its cone, droplets falling out of it.
function jetFx(e, g, what, dt) {
  const o = muzzleAt(e, g.muzzle), fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), sx = fz, sz = -fx;
  if (what === 'inhale') {
    for (let n = Math.floor(30 * dt + Math.random()); n > 0; n--) {
      const a = rand(0, Math.PI * 2), r = rand(0.15, 0.35), life = rand(0.2, 0.35);
      const x = o.x + Math.cos(a) * r, y = o.y + rand(-0.15, 0.2), z = o.z + Math.sin(a) * r;
      emit(soft, x, y, z, { v: [(o.x - x) / life, (o.y - y) / life, (o.z - z) / life], life, size: rand(0.03, 0.05), color: DROPS[n % 3], alpha: 0.85 });
    }
    return;
  }
  if (what === 'blow') {
    sfx('spray', { at: o });
    emit(soft, o.x, o.y, o.z, { life: 0.2, size: 0.5, grow: 1.4, color: '#ffffff', alpha: 0.7 });
    if (Math.hypot(o.x - player.x, o.z - player.z) < 6) cameraKick(fx, fz, 0.05);
    return;
  }
  if (what !== 'gust') return;
  const speed = g.range / 0.35;
  for (let n = Math.floor(260 * dt + Math.random()); n > 0; n--) {
    const u = rand(-1, 1) * rand(0, 1), v = speed * rand(0.8, 1.15), life = rand(0.22, 0.36);
    emit(soft, o.x + sx * u * g.width * 0.4, o.y + rand(-0.04, 0.04), o.z + sz * u * g.width * 0.4,
      { v: [(fx + sx * u * g.spread) * v, rand(-0.2, 0.4), (fz + sz * u * g.spread) * v], life, size: rand(0.05, 0.11) * (1 + life),
        color: DROPS[n % 3], alpha: 0.95, gravity: 3 });
  }
  for (let n = Math.floor(40 * dt + Math.random()); n > 0; n--) {   // spray hanging in the air after it
    const s = rand(0.3, g.range), w = (g.width + g.spread * s) * rand(-0.8, 0.8);
    emit(soft, o.x + fx * s + sx * w, o.y - s * 0.05, o.z + fz * s + sz * w, { v: [fx * rand(0.5, 1.5), rand(-0.2, 0.3), fz * rand(0.5, 1.5)],
      life: rand(0.4, 0.7), size: rand(0.18, 0.3), grow: 1.4, color: '#e6f8ff', alpha: 0.35, drag: 1 });
  }
}

// Gusto spits his Custo triangles (game/gusto.js): a burst at his mouth and a light blue streak
// to each of them (they appear there in a puff, render/enemies.js). Totnar tears himself open
// (look 'leaves', game/totnar.js): a rustle and a spray of leaves and twigs towards each of his.
// Squarlo slaps the floor (look 'splash', game/squarlo.js): water runs from his hands to each
// Squirtle popping out of it. Foggery croaks his Fire-faces and Fire-cats up (look 'embers').
// Slomo heaves his slimes out of his back (look 'slime').
const SUMMONS = { triangles: { sound: 'summon', flash: '#9fdcff', colors: ['#e0f6ff', '#7fd0ff'], streak: 10 },
  leaves: { sound: 'rustle', flash: '#ffb070', colors: ['#8a6440', '#7d8a3c', '#b8a07a'], streak: 5 },
  splash: { sound: 'splash', flash: '#c8f4ff', colors: DROPS, streak: 8 },
  rings: { sound: 'summon', flash: '#bfe8ff', colors: ['#f0faff', '#8fd8ff'], streak: 10 },
  embers: { sound: 'fireball', flash: '#ffb050', colors: ['#ffd25a', '#ff8a2a', '#ff4a17'], streak: 10 },
  time: { sound: 'summon', flash: '#e8fbff', colors: ['#ffffff', '#bdf3ff', '#ffe9a8'], streak: 12 },
  slime: { sound: 'splorch', flash: '#c8ff7a', colors: ['#d8ff9a', '#9ae048', '#5a9a2a'], streak: 9 },
  wind: { sound: 'whirl', flash: '#f0ecff', colors: ['#ffffff', '#e6dcff', '#c8b8ff'], streak: 10 } };
export function summonFx(mouth, list, look = 'triangles') {
  const s = SUMMONS[look];
  sfx(s.sound, { at: mouth });
  emit(glow, mouth.x, mouth.y, mouth.z, { life: 0.25, size: 0.7, grow: 1.2, color: s.flash, alpha: 0.9 });
  for (const m of list) for (let i = 0; i < s.streak; i++) {
    const k = i / s.streak, x = mouth.x + (m.x - mouth.x) * k, y = mouth.y + (m.y + 0.4 - mouth.y) * k + Math.sin(k * Math.PI) * 0.5;
    emit(look === 'triangles' || look === 'embers' || look === 'time' ? glow : soft, x, y, mouth.z + (m.z - mouth.z) * k, { v: [rand(-0.3, 0.3), rand(-0.2, 0.4), rand(-0.3, 0.3)], life: 0.15 + k * 0.2,
      size: rand(0.08, 0.13), color: s.colors[i % s.colors.length], drag: 2 });
  }
}

// poison ticking while the player is poisoned (core/status.js)
export function poisonHurtFx(dmg) {
  number('-' + Math.ceil(dmg), q => q.set(player.x, player.visY + 1.15, player.z), { color: '#9be05a', size: 0.2, life: 0.7, rise: 0.8,
    drift: rand(-0.3, 0.3), pop: 0.4 });
  sfx('poison', { at: player, volume: 0.6 });
}
// a burn or poison tick on enemy e (game/statuses.js); killed: that was the last of its health
const STATUS_COLOR = { burning: '#ffa040', toxic: '#9be05a', meteor: '#c8ff6a' };
export function statusHurtFx(e, dmg, status, killed) {
  if (e.proxy) return;
  const top = { x: e.x, y: e.y + e.profile.bodyHeight + 0.2, z: e.z };
  number(String(dmg), top, { color: STATUS_COLOR[status], size: killed ? 0.26 : 0.19, life: 0.7, rise: 0.8, drift: rand(-0.3, 0.3), pop: 0.4 });
  if (killed) sfx('kill', { at: e, pitch: e.profile.pitch ?? 1.1 });
}

// a flask (game/throws.js) leaving the hand ('launch') or bursting ('burst') at (x, y, z):
// a blast flask explodes, a fire flask bursts into flames, a toxic one into a green cloud
export function flaskFx(f, what) {
  const s = f.stats, { x, y, z } = f;
  if (what === 'launch') { sfx('lob', { at: f.ghost ? f : player }); return; }
  const r = s.radius, color = s.color;
  sfx('glass', { at: f, volume: 0.8 });
  emit(glow, x, y + 0.2, z, { life: 0.2, size: r * 1.4, grow: 1.4, color, alpha: 0.85 });
  for (let i = 0; i < 14; i++)   // shards of glass
    emit(glow, x, y + 0.1, z, { v: [rand(-2.5, 2.5), rand(1, 3.5), rand(-2.5, 2.5)], life: rand(0.3, 0.55), size: rand(0.04, 0.07),
      color: i % 2 ? '#ffffff' : color, gravity: 12, drag: 1 });
  if (s.blast && !s.burn) {
    emit(glow, x, y + 0.3, z, { life: 0.14, size: r * 1.1, grow: 0.8, color: '#ffffff', alpha: 0.9 });
    for (let i = 0; i < 34; i++) {   // the fireball and its sparks fanning out
      const a = rand(0, Math.PI * 2), v = rand(2, 6) * r;
      emit(glow, x, y + 0.2, z, { v: [Math.cos(a) * v, rand(0.5, 3), Math.sin(a) * v], life: rand(0.25, 0.55), size: rand(0.07, 0.15),
        color: ['#fff0a0', '#ffd25a', '#ff8a2a'][i % 3], gravity: 5, drag: 2.5 });
    }
    for (let i = 0; i < 8; i++)
      emit(soft, x + rand(-0.4, 0.4) * r, y + 0.3, z + rand(-0.4, 0.4) * r, { v: [rand(-0.5, 0.5), rand(0.6, 1.4), rand(-0.5, 0.5)],
        life: rand(0.9, 1.4), size: rand(0.35, 0.55), grow: 1, color: '#3e3834', alpha: 0.45, drag: 0.8 });
    sfx('boom', { at: f });
    cameraKick(x - player.x, z - player.z, 0.1, -0.08);
  } else if (s.burn) {
    for (let i = 0; i < 26; i++) {
      const [dx, dz] = [rand(-1, 1) * r, rand(-1, 1) * r];
      emit(glow, x + dx * 0.5, y + 0.1, z + dz * 0.5, { v: [dx * 1.5, rand(1, 3), dz * 1.5], life: rand(0.3, 0.6), size: rand(0.12, 0.22),
        grow: -0.4, color: ['#fff0a0', '#ffd25a', '#ff8a2a', '#ff4a17'][i % 4], gravity: -1, drag: 2 });
    }
    sfx('whump', { at: f });
  } else {
    for (let i = 0; i < 14; i++)
      emit(soft, x + rand(-0.5, 0.5) * r, y + rand(0.1, 0.5), z + rand(-0.5, 0.5) * r, { v: [rand(-1, 1), rand(0.2, 0.8), rand(-1, 1)],
        life: rand(0.8, 1.3), size: rand(0.3, 0.5), grow: 1.2, color: i % 2 ? '#8fdc3c' : '#5f9f2a', alpha: 0.45, drag: 1.2 });
    sfx('hiss', { at: f });
  }
}

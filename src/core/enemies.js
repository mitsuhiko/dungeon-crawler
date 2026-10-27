// Shared enemy tuning, in game cells / seconds. Stunder is a slow, heavy threat.
// A strike's timing / reach / effect lives on the profile; a species with several
// attacks lists them in `attacks` (`clip` names its animation, `weight` how often it
// is picked). `arc` is the minimum cosine to the target (-1: hits all around),
// `power` scales the profile's damage, `knockDown` floors the player.
// `species` names the model (and the spawn roster's entry); `parts` groups the model's
// recolourable materials by role (core/oklch.js), the first one being the role's anchor.
// Teeth, pupils and mouths stay out of `parts`, so no kind recolours them.
// hp / damage / xp / coins are level-1 values; every species grows by GROWTH per level.
// `poise`: for how long (s) after a hit staggers it a hit cannot stagger it again (0: every hit
// does), so heavy species and guardians strike back even under a stream of blows. A heavy blow
// (core/combat.js HEAVY_HIT) staggers anyway. Nothing staggers a `steadfast` one (Squarlo a
// giant). `armour`: the share of a blow's damage it takes (default all), unless it lies exposed.
// `style`: how it fights between blows (game/enemyai.js). 'skirmish' backs off after a blow and
// circles at `circle` cells (sidestepping, facing the player, if it `strafe`s; else walking
// round), then darts in again; 'ranged' backs away inside keep[0] and sidesteps while its throw
// recovers; 'brute' (the default) holds its ground. `charge`: how much faster it runs the last
// few cells at a player it sees.
import { hash32, mulberry32 } from './util.js';
import { WATER, LAVA, ACID } from './constants.js';
import { toxinOf } from './status.js';
import { paint } from './palette.js';
import { noun, msg, say, form } from '../i18n/i18n.js';

// a kind's colours: role -> palette swatch (core/palette.js), as colour strings for recolorFn
const paints = roles => Object.fromEntries(Object.entries(roles).map(([role, name]) => [role, paint(name)]));

// what every species gains per level, as a share of its level-1 value: health keeps pace with
// the weapons and levels a player finds and gains on the way down, damage with the player's
// health, and the rewards grow with both (docs/balance.md)
// learn: enemies.html#kind-code, stronger.html#curve #monsters-grow (see learn/README.md)
export const GROWTH = { hp: 0.17, damage: 0.1, xp: 0.25, coins: 0.25 };
// the level enemies have at a depth: one per depth (1 at the surface), and ±1 for a cube's
// species from depth 2 on
// learn: code.html#functions, stronger.html#monsters-grow (see learn/README.md)
export const depthLevel = depth => Math.max(1, Math.floor(depth || 0));
// guardians stand above their depth: side guardians one level, descent guardians two (on the
// road out of town, the very first ones, at the road's own level)
export const GUARDIAN_LEVELS = { side: 1, descent: 2 };
export const guardianLevel = (depth, role) => depthLevel(depth) + (depth >= 1 ? GUARDIAN_LEVELS[role] : 0);

// learn: checks.html#try-test, code.html#objects, combat.html#damage, enemies.html#numbers, space.html#distance, stronger.html#monsters-grow (see learn/README.md)
export const SPIDER = {
  type: 'spider', species: 'spider', label: 'Spider', hp: 32, damage: 15, knock: 4.5,
  xp: 20, coins: [4, 8],
  radius: 0.3, height: 0.9, bodyHeight: 0.45, mass: 1,
  aggro: 3, giveUp: 6, chase: 2.6, wander: 0.6, homeSpeed: 1.2,
  reach: 0.85, hitReach: 1.15, hitAt: 0.42, trackUntil: 0.42, attackTime: 1.07, cooldown: 1.2,
  arc: 0.5, knockDown: false, hop: 3.5, reason: 'Bitten by a spider!', ichor: ['#a6d84e', '#5f8f22'], pitch: 1.1,
  poise: 0, hitStun: 0.18, deathTime: 2, corpseTime: 3.5,
  parts: { body: ['SpiderBody'], eyes: ['SpiderEyes'] },
  colors: paints({ body: 'ink.dark', eyes: 'eyes.sun' }),
  style: 'skirmish', circle: 1.5, strafe: true,
  seedSalt: 0x5b1d3a, spacing: 3,
};
// learn: checks.html#try-test, combat.html#damage (see learn/README.md)
export const STUNDER = {
  type: 'stunder', species: 'stunder', label: 'Stunder', hp: 140, damage: 30, knock: 7,
  xp: 80, coins: [20, 35],
  radius: 0.48, height: 2.8, bodyHeight: 2.15, mass: 4,
  aggro: 4.5, giveUp: 8, chase: 1.05, wander: 0.45, homeSpeed: 0.65,
  reach: 1.15, hitReach: 1.55, hitAt: 16 / 30, trackUntil: 0.3, attackTime: 1.6, cooldown: 1.6,
  arc: 0.5, knockDown: true, hop: 4, reason: 'Rammed by a Stunder!', ichor: ['#d0503a', '#7a2418'], pitch: 0.8,
  poise: 1.5, hitStun: 0.25, deathTime: 2.4, corpseTime: 4,
  parts: { skin: ['StunderBody', 'StunderEarInset', 'StunderLegRidges', 'StunderMouth'], eyes: ['StunderEyes_glow'] },
  colors: paints({ skin: 'moss.mid', eyes: 'eyes.ember' }),
  style: 'brute', charge: 1.8,
  seedSalt: 0x57a4de2, spacing: 5,
};
// Slithers in with its head raised and lunges forward and down to bite (clip frame 12).
// learn: art.html#bones (see learn/README.md)
export const SNAKE = {
  type: 'snake', species: 'snake', label: 'Grass snake', hp: 48, damage: 16, knock: 4,
  xp: 30, coins: [6, 12],
  radius: 0.3, height: 0.8, bodyHeight: 0.6, mass: 1.2,
  aggro: 3.5, giveUp: 6, chase: 2.2, wander: 0.6, homeSpeed: 1.1,
  reach: 0.95, hitReach: 1.25, hitAt: 12 / 30, trackUntil: 0.26, attackTime: 1, cooldown: 1.3,
  arc: 0.5, knockDown: false, hop: 3.5, reason: 'Bitten by a snake!', ichor: ['#b4e67e', '#4f8f2a'], pitch: 1.25,
  poise: 0, hitStun: 0.18, deathTime: 2, corpseTime: 3.5,
  parts: { skin: ['SnakeBody', 'SnakeRibs'], eyes: ['SnakeEyes_glow'] },
  colors: paints({ skin: 'moss.light', eyes: 'eyes.ember' }),
  style: 'skirmish', circle: 1.6, strafe: false,
  seedSalt: 0x5a4e7c1, spacing: 3,
};
// Slaps with both arms (clip frame 13), or spins on five legs and sweeps the sixth
// all around it (clip frame 19): a harder kick that knocks the player over.
const OCTO_SLAP = {
  name: 'slap', clip: 'slap', weight: 2, hitAt: 13 / 30, trackUntil: 0.3, attackTime: 1.1, hitReach: 1.35,
  arc: 0.5, power: 1, knock: 5, knockDown: false, hop: 3.5, reason: 'Slapped by an Octonaut!',
};
const OCTO_SPIN = {
  name: 'spin', clip: 'spin', weight: 1, hitAt: 19 / 30, trackUntil: 0.15, attackTime: 1.4, hitReach: 1.5,
  arc: -1, power: 1.4, knock: 7, knockDown: true, hop: 3.8, reason: 'Kicked by an Octonaut!',
};
export const OCTONAUT = {
  type: 'octonaut', species: 'octonaut', label: 'Octonaut', hp: 90, damage: 20, knock: 5,
  xp: 55, coins: [12, 22],
  radius: 0.42, height: 1.7, bodyHeight: 1.2, mass: 2.5,
  aggro: 4, giveUp: 7, chase: 1.5, wander: 0.5, homeSpeed: 0.8,
  reach: 1, ...OCTO_SLAP, cooldown: 1.4, ichor: ['#8fd0ff', '#2f6f9f'], pitch: 0.95,
  attacks: [OCTO_SLAP, OCTO_SPIN],
  poise: 0.8, hitStun: 0.22, deathTime: 2.2, corpseTime: 4,
  parts: { skin: ['OctonautBody', 'OctonautHair'], eyes: ['OctonautEyes_glow'] },
  colors: paints({ skin: 'azure.light', eyes: 'eyes.sun' }),
  style: 'brute',
  seedSalt: 0x0c7a9a5, spacing: 4,
};
// The fire species and the Triangle are much stronger than the rest. A ranged attack has a
// `projectile`: it is thrown from `muzzle` (model space: x, up, forward; the clip's
// extras.muzzle) at the hit frame, flies straight along the enemy's heading (pitched at
// the player) and hurts on contact. `reach` is then the distance it starts throwing from.
// `hover`: floats, its idle loop runs on time rather than on ground speed.
// Spits a fireball (clip frame 18) that sets the player on fire for half a second.
export const FIREFACE = {
  type: 'fireface', species: 'fireface', label: 'Fire-face', hp: 120, damage: 22, knock: 3, fireproof: true,
  xp: 90, coins: [24, 40],
  radius: 0.34, height: 1.4, bodyHeight: 1.25, mass: 1.5, hover: true,
  aggro: 6, giveUp: 9, chase: 1.3, wander: 0.5, homeSpeed: 0.8,
  reach: 4.5, hitReach: 0, hitAt: 18 / 30, trackUntil: 0.5, attackTime: 1.2, cooldown: 1.6,
  arc: 0.5, knockDown: false, hop: 3, reason: 'Scorched by a Fire-face!', ichor: ['#ffd25a', '#ff5a14'], pitch: 1.2,
  projectile: { kind: 'fireball', speed: 6.5, radius: 0.18, range: 7,
    muzzle: [-0.03, 0.444, 0.523], burn: { time: 0.5, damage: 6, ticks: 2 } },
  poise: 0.8, hitStun: 0.2, deathTime: 2, corpseTime: 3.5,
  parts: { flame: ['FireFaceCore_glow', 'FireFaceBall_glow', 'FireFaceFlame_glow', 'FireFaceTips_glow'], eyes: ['FireFaceEyes_glow'] },
  colors: paints({ flame: 'ember.glow', eyes: 'eyes.bone' }),
  style: 'ranged', keep: [2.2, 4],
  seedSalt: 0xf12efa, spacing: 4,
};
// Shoots its inner triangles out like a punch (clip frame 20); a hit knocks the player over.
export const TRIANGLE = {
  type: 'triangle', species: 'triangle', label: 'Triangle', hp: 170, damage: 28, knock: 6,
  xp: 110, coins: [28, 46],
  radius: 0.42, height: 1.65, bodyHeight: 1.5, mass: 3, hover: true,
  aggro: 5.5, giveUp: 9, chase: 1.1, wander: 0.5, homeSpeed: 0.7,
  reach: 4, hitReach: 0, hitAt: 20 / 30, trackUntil: 0.55, attackTime: 1.3, cooldown: 2,
  arc: 0.5, knockDown: true, hop: 3.6, reason: 'Punched by a Triangle!', ichor: ['#d9a6ff', '#6a2cd6'], pitch: 0.9,
  projectile: { kind: 'punch', speed: 8, radius: 0.3, range: 6, spin: 14,
    muzzle: [-0.037, 0.699, 0.87] },
  poise: 1.2, hitStun: 0.22, deathTime: 2, corpseTime: 4,
  parts: { glow: ['TriangleCore_glow', 'TriangleRing_glow', 'TriangleFrame_glow', 'TriangleBrows'], eyes: ['TriangleEyes_glow'] },
  colors: paints({ glow: 'violet.glow', eyes: 'eyes.bone' }),
  style: 'ranged', keep: [2, 3.6],
  seedSalt: 0x7a1a9e1, spacing: 5,
};
// Runs in fast, then pounces from up to `reach` away: between lunge.from and lunge.to of the
// attack it is carried forward until it is lunge.stop short of the player (at most
// lunge.max), lands and bites at clip frame 20.
export const FIRECAT = {
  type: 'firecat', species: 'firecat', label: 'Fire-cat', hp: 130, damage: 26, knock: 5, fireproof: true,
  xp: 95, coins: [22, 38],
  radius: 0.3, height: 1, bodyHeight: 0.7, mass: 1.6,
  aggro: 6, giveUp: 10, chase: 3.4, wander: 0.6, homeSpeed: 1.2,
  reach: 2.2, hitReach: 1.05, hitAt: 20 / 30, trackUntil: 0.28, attackTime: 1.2, cooldown: 1,
  arc: 0.5, knockDown: false, hop: 3.5, reason: 'Bitten by a Fire-cat!', ichor: ['#ff8a2a', '#7e1a14'], pitch: 1,
  lunge: { from: 0.3, to: 0.6, max: 1.9, stop: 0.55 },
  poise: 0.4, hitStun: 0.2, deathTime: 2, corpseTime: 3.5,
  parts: { fur: ['FireCatBody', 'FireCatStripes', 'FireCatNose'], flame: ['FireCatFlame_glow', 'FireCatFlameCore_glow'], eyes: ['FireCatEyes_glow'] },
  colors: paints({ fur: 'crimson.deep', flame: 'ember.glow', eyes: 'eyes.sun' }),
  style: 'skirmish', circle: 2, strafe: false,
  seedSalt: 0xca7f12e, spacing: 4,
};
// Fights near and far: an attack may have its own `reach` (it is picked only from within it) and
// `minReach` (only from beyond it), and its own `projectile`. Pinches with both claws (clip
// frame 13) up close; from further off it throws an ice ball (clip frame 21) that chills the
// player: `chill.slow` scales the player's speed for `chill.time` seconds. The profile's
// `reach` is the longest of its attacks'. Between throws it keeps closing in for the claws.
// One model carries both heads (blender/shraps.py); `hide` names the materials a kind does not
// show: the plain Shraps has the ice head, the Fire shraps the fire one.
const SHRAPS_PINCH = {
  name: 'pinch', clip: 'pinch', weight: 1, reach: 1.05, hitAt: 13 / 30, trackUntil: 0.3, attackTime: 1, hitReach: 1.4,
  arc: 0.5, power: 1, knock: 4.5, knockDown: false, hop: 3.5, reason: 'Pinched by a Shraps!',
};
const SHRAPS_THROW = {
  name: 'throw', clip: 'throw', weight: 1, reach: 5, minReach: 1.8, hitAt: 21 / 30, trackUntil: 0.6, attackTime: 1.3, hitReach: 0,
  arc: 0.5, power: 0.9, knock: 3, knockDown: false, hop: 3, reason: 'Hit by an ice ball!',
  projectile: { kind: 'iceball', speed: 7, radius: 0.16, range: 7, spin: 9,
    muzzle: [0.056, 0.797, 0.937], chill: { time: 1.6, slow: 0.5 } },
};
const ICE_HEAD = ['ShrapsIce', 'ShrapsIceSpikes', 'ShrapsIceBall_glow'];
const FIRE_HEAD = ['ShrapsFireCore_glow', 'ShrapsFlame_glow', 'ShrapsFlameTips_glow', 'ShrapsFireBall_glow'];
export const SHRAPS = {
  type: 'shraps', species: 'shraps', label: 'Shraps', hp: 110, damage: 22, knock: 4.5,
  xp: 70, coins: [16, 28],
  radius: 0.4, height: 1.6, bodyHeight: 1.35, mass: 2.2,
  aggro: 5, giveUp: 8, chase: 1.6, wander: 0.5, homeSpeed: 0.8,
  ...SHRAPS_PINCH, reach: SHRAPS_THROW.reach, cooldown: 1.5, ichor: ['#c4ecff', '#4f8fbf'], pitch: 1.05,
  attacks: [SHRAPS_PINCH, SHRAPS_THROW],
  poise: 0.8, hitStun: 0.2, deathTime: 2, corpseTime: 4,
  parts: { shell: ['ShrapsShell', 'ShrapsClaw'], ice: [...ICE_HEAD], eyes: ['ShrapsEyes_glow'] },
  colors: paints({ shell: 'frost.light@+6', ice: 'frost.pale@-6', eyes: 'eyes.ice' }),
  hide: FIRE_HEAD, style: 'brute',
  seedSalt: 0x5a7a95, spacing: 4,
};
// Rolls about on two wheels (the game spins them by the distance covered, `wheel` being their
// radius) and fights from afar with a laser. An attack's `retreat` backs it off by `dist` cells
// between `from` and `to` of the attack (eased like a lunge): before it fires it rolls
// backwards, swaying. A `beam` is a ranged attack that is not thrown: from the muzzle (the
// clip's extras.muzzle, between the eyes) it shines for `time` seconds, ending at the hit frame,
// at a point that starts on the player and follows them at `track` cells/s, and on through it
// until the level stops it (core/beams.js). Then it bursts: within `radius` of the beam the
// player is hit. Sidestepping it dodges it, and staggering the Spicy puts it out.
export const SPICY = {
  type: 'spicy', species: 'spicy', label: 'Spicy', hp: 100, damage: 26, knock: 4,
  xp: 72, coins: [16, 30],
  radius: 0.4, height: 1.35, bodyHeight: 1.05, mass: 1.6, wheel: 0.15,
  aggro: 5.5, giveUp: 9, chase: 1.9, wander: 0.6, homeSpeed: 0.9,
  reach: 4.5, hitReach: 0, hitAt: 45 / 30, trackUntil: 0.9, attackTime: 1.9, cooldown: 1.7,
  arc: 0.5, knockDown: false, hop: 3.2, reason: 'Blasted by a Spicy!', ichor: ['#c6ff5a', '#4f8f12'], pitch: 1.15,
  retreat: { from: 0.05, to: 0.75, dist: 0.7 },
  beam: { kind: 'laser', time: 0.6, track: 0.8, radius: 0.28, range: 8, color: '#7dff3a',
    muzzle: [0, 1.279, 0.06] },
  poise: 0.6, hitStun: 0.2, deathTime: 2, corpseTime: 4,
  parts: { body: ['SpicyBody', 'SpicyClaw'], glow: ['SpicyTips_glow'], wheels: ['SpicyTire', 'SpicyHub'], eyes: ['SpicyEyes_glow'] },
  colors: paints({ body: 'moss.light', glow: 'moss.glow', wheels: 'ink.dark', eyes: 'eyes.ember' }),
  style: 'ranged', keep: [2.4, 4.2],
  seedSalt: 0x5b1c7e3, spacing: 4,
};
// A body of four wavy rings of water with two eyes floating above (blender/wolla.py). The game
// spins the rings (`waves`: rad/s, render/enemies.js), so its waves keep running round it, and it
// leaves a wet trail (`trail`: the puddles' colour). It glides, its loop running on time.
// A `gust` is a ranged attack that is neither thrown nor shone: a storm cloud gathers above it
// and thunders (at the `thunder` times of the attack, s), then from the hit frame on it blows
// from its mouth (`muzzle`) for `time` seconds: a body within `range` of the mouth and inside
// the cone ahead of it (`width` either side at the mouth, widening by `spread` per cell) is hit
// once, and blown back at `push` cells/s for `pushTime` seconds on top of the blow's knock
// (core/gusts.js, game/gusts.js). Sidestepping out of the cone before it blows dodges it.
export const WOLLA = {
  type: 'wolla', species: 'wolla', label: 'Wolla', hp: 95, damage: 22, knock: 3,
  xp: 64, coins: [14, 26],
  radius: 0.38, height: 1.2, bodyHeight: 0.95, mass: 1.4, hover: true, waves: 1.1, trail: '#3d6f9c',
  aggro: 5, giveUp: 8, chase: 1.5, wander: 0.5, homeSpeed: 0.8,
  reach: 3, hitReach: 0, hitAt: 27 / 30, trackUntil: 0.5, attackTime: 1.8, cooldown: 1.9,
  arc: 0.5, knockDown: false, hop: 3, reason: 'Blown away by a Wolla!', ichor: ['#9fd8ff', '#2a6fc0'], pitch: 1,
  gust: { kind: 'storm', time: 17 / 30, range: 3.6, width: 0.35, spread: 0.36, push: 7.5, pushTime: 0.5,
    muzzle: [0, 0.584, 0.466], thunder: [13 / 30, 20 / 30] },
  poise: 0.6, hitStun: 0.2, deathTime: 2, corpseTime: 4,
  parts: { waves: ['WollaWaves', 'WollaWavesDeep'], eyes: ['WollaEyes_glow'] },
  colors: paints({ waves: 'azure.mid', eyes: 'eyes.sun' }),
  style: 'ranged', keep: [1.5, 2.8],
  seedSalt: 0x3a77e1a, spacing: 4,
};
// A sad little cloud on long stick legs (blender/wolk.py). To strike it closes its eyes and
// lifts its arms, and its cloud darkens from light blue to storm grey (`gloom`: the colour its
// `parts` turn, render/enemies.js). Its lightning is a beam of kind 'bolt' aimed at the feet:
// from the beam's start a crackling spot under its target shows where it will strike, following
// the target at `track` cells/s until `lock` s before the strike, then holding still. At the hit
// frame a bolt jumps from the cloud's belly to the spot (core/beams.js, game/beams.js): a body
// within `radius` of it is hurt and stunned for `shock` s. The thunder follows a little later,
// the later the further away it struck (game/juice.js). Stepping off the spot once it holds
// still dodges it; a stagger puts the lightning out.
export const WOLK = {
  type: 'wolk', species: 'wolk', label: 'Wolk', hp: 85, damage: 20, knock: 2,
  xp: 60, coins: [12, 24],
  radius: 0.4, height: 1.35, bodyHeight: 1.1, mass: 1.2,
  aggro: 5.5, giveUp: 9, chase: 1.4, wander: 0.5, homeSpeed: 0.8,
  reach: 4.5, hitReach: 0, hitAt: 33 / 30, trackUntil: 0.9, attackTime: 1.7, cooldown: 2.1,
  arc: 0.5, knockDown: false, hop: 3, reason: 'Struck by a Wolk!', ichor: ['#d4ecff', '#6a9cc8'], pitch: 1,
  beam: { kind: 'bolt', aim: 'feet', time: 0.8, track: 1.4, lock: 0.35, radius: 0.3, range: 7, shock: 0.9,
    color: '#fff6b0', muzzle: [0, 0.837, 0.251] },
  gloom: { color: paint('ink.deep'), parts: ['body'] },
  poise: 0.5, hitStun: 0.25, deathTime: 2, corpseTime: 4,
  parts: { body: ['WolkCloud', 'WolkCloudBelly'], limbs: ['WolkLimbs'] },
  colors: paints({ body: 'frost.pale', limbs: 'azure.deep' }),
  // its guardians are no pink or amber clouds: a heavy grey rain cloud, and a shining silver one
  guardianLooks: {
    side: { colors: paints({ body: 'ink.light', limbs: 'ink.deep' }),
      gloom: { color: paint('ink.dark'), parts: ['body'] },
      light: '#c4ccd8', sparks: ['#c4ccd8', '#f0f3f8'], ichor: ['#c8ccd4', '#4a4f58'] },
    descent: { colors: paints({ body: 'ink.pale', limbs: 'ink.mid' }),
      finish: { parts: ['body', 'limbs'], roughness: 0.16, metalness: 0.5, sheen: 0.12, glints: 4 },
      gloom: { color: paint('ink.deep'), parts: ['body'] },
      light: '#e6eeff', sparks: ['#ffffff', '#dfe8ff'], ichor: ['#eef2f8', '#7a808a'] },
  },
  style: 'ranged', keep: [2.6, 4.2],
  seedSalt: 0x6c1d2f5, spacing: 4,
};
// A living wave (blender/squirtle.py; render/squirtleview.js draws its body as the fluid it lives
// in, in that body of fluid's colours: its `colors` are its eyes' and its water ball's): its back
// arches up into the crest, which is its head, and the wave's curl in front is its mouth, opening
// and closing; taller than the hero. It wets the land where it goes (`trail`, bigger: `trailSize`,
// render/trails.js; in the colours of its fluid, not the `trail` colour). It lives in a fluid
// (`dwells`: the ones it lives in, physics/dwell.js): it is only ever put down in one and moves
// only through it. It pokes out of it to spit a ball of water (a projectile with a tiny `push`),
// and leaps out of it at a player near it (`leap`: up onto a stomp beam's shadow at their feet,
// game/enemyai.js `ride`, and crashing down there onto whoever is under it). On land it cannot keep
// its shape: it shrinks, stands a moment, then dissolves into a puddle that nothing can touch and
// runs back into its fluid, where it rises again (game/enemyai.js `ashore`). `burrow`: in the fight
// it stays up for `up` s (least, most), dives and moves under the surface at `speed` for `under` s,
// then comes up again, sooner where it has a shot; `sink`: s its diving and coming up take. Under
// the surface (`under` on the enemy) nothing sees, hits or touches it (`absent`). It `swims`: no
// water drowns it.
const SQUIRTLE_SPIT = {
  name: 'spit', clip: 'spit', weight: 1, reach: 5, hitReach: 0, hitAt: 15 / 30, trackUntil: 0.4, attackTime: 33 / 30,
  arc: 0.5, knockDown: false, hop: 2.5, reason: 'Splashed by a Squirtle!',
  projectile: { kind: 'water', speed: 7.5, radius: 0.2, range: 7.5, push: 2.4, pushTime: 0.15,
    muzzle: [0, 0.807, 1.037] },
};
const SQUIRTLE_LEAP = {
  name: 'leap', clip: 'leap', weight: 3, reach: 4.2, minReach: 0.5, hitAt: 36 / 30, trackUntil: 0.3, attackTime: 54 / 30, hitReach: 0,
  arc: -1, power: 1.3, knock: 5, knockDown: true, hop: 3.5, reason: 'Splashed by a Squirtle!', recover: 1.2,
  ride: { from: 12 / 30, height: 1.4, onto: true }, steady: { from: 12 / 30, to: 36 / 30 },
  beam: { kind: 'stomp', aim: 'feet', time: 30 / 30, track: 1.8, lock: 0.3, radius: 1.1, range: 14, sky: 5, clear: false,
    muzzle: [0, 0, 0] },
};
// a Squirtle kind's attacks: its own reason for both, and what else its spit is
const squirtleAttacks = (reason, spit = {}) => [{ ...SQUIRTLE_SPIT, reason, ...spit }, { ...SQUIRTLE_LEAP, reason }];
export const SQUIRTLE = {
  type: 'squirtle', species: 'squirtle', label: 'Squirtle', hp: 42, damage: 13, knock: 1.5,
  xp: 30, coins: [6, 12],
  radius: 0.65, height: 1.8, bodyHeight: 1.53, mass: 3, swims: true, dwells: [WATER], trail: '#4f8fd0', trailSize: 1.6,
  aggro: 5.5, giveUp: 9, chase: 1.6, wander: 0.5, homeSpeed: 1,
  ...SQUIRTLE_SPIT, reach: SQUIRTLE_SPIT.reach, cooldown: 1.4, ichor: ['#a8e4ff', '#3a7fd0'], pitch: 1.4,
  attacks: [SQUIRTLE_SPIT, SQUIRTLE_LEAP],
  burrow: { speed: 3.4, up: [2.4, 3.6], under: [1.4, 2.4], sink: 0.35 },
  poise: 0, hitStun: 0.2, deathTime: 1.4, corpseTime: 3,
  parts: { body: ['SquirtleBody'], eyes: ['SquirtleEyes'] },
  colors: paints({ body: 'azure.mid', eyes: 'frost.pale' }),
  style: 'ranged', keep: [2.4, 4.4],
  seedSalt: 0x5917e1, spacing: 3,
};
// A round-bellied beast on two stubby legs with long rabbit ears, a crocodile snout full of
// zig-zag teeth and a long tail curled into a spiral (blender/mecked.py, after the kids' sketch).
// It grabs more often than it bites (clip frame 13), both from the same reach (it starts a blow
// as soon as the player is in reach, so a shorter grab would hardly ever be picked): a `grab`
// with `bites` holds the player against its belly
// (game/grab.js) and bites them at those times, each bite the blow's damage, then lets go at
// `throwAt`, shoving them `throw` cells/s away on their feet (a grab that `knockDown`s throws them
// down instead). As with Gusto's grab, only a stagger or its death makes it let go early.
const MECKED_BITE = {
  name: 'bite', clip: 'bite', weight: 1, reach: 1.05, hitAt: 13 / 30, trackUntil: 0.3, attackTime: 1, hitReach: 1.35,
  arc: 0.5, power: 1, knock: 4, knockDown: false, hop: 3.5, reason: 'Bitten by a Mecked!',
};
const MECKED_GRAB = {
  name: 'grab', clip: 'grab', weight: 2, reach: 1.05, hitAt: 15 / 30, trackUntil: 0.4, attackTime: 72 / 30, hitReach: 1.3,
  arc: 0.5, power: 0.6, knock: 0, knockDown: false, hop: 0, reason: 'Chewed on by a Mecked!',
  grab: { throwAt: 57 / 30, step: 2 / 30, hold: 0.6, throw: 3.5, bites: [30 / 30, 45 / 30],
    grip: [[0, 0.623, 0.641], [0, 0.677, 0.631], [0, 0.802, 0.598], [0, 0.881, 0.56], [0, 0.884, 0.557], [0, 0.914, 0.549],
      [0, 0.86, 0.571], [0, 0.767, 0.598], [0, 0.785, 0.599], [0, 0.848, 0.575], [0, 0.878, 0.559], [0, 0.903, 0.553],
      [0, 0.903, 0.552], [0, 0.885, 0.558], [0, 0.826, 0.587], [0, 0.76, 0.602], [0, 0.799, 0.589], [0, 0.888, 0.56],
      [0, 0.888, 0.557], [0, 0.878, 0.559], [0, 0.782, 0.618], [0, 0.626, 0.672]] },
};
export const MECKED = {
  type: 'mecked', species: 'mecked', label: 'Mecked', hp: 105, damage: 20, knock: 4,
  xp: 66, coins: [14, 26],
  radius: 0.36, height: 1.8, bodyHeight: 1.35, mass: 2.2,
  aggro: 4.5, giveUp: 8, chase: 1.8, wander: 0.55, homeSpeed: 0.9,
  ...MECKED_BITE, cooldown: 1.3, ichor: ['#c8d890', '#5a6a2a'], pitch: 0.9,
  attacks: [MECKED_BITE, MECKED_GRAB],
  poise: 0.6, hitStun: 0.22, deathTime: 2, corpseTime: 4,
  parts: { skin: ['MeckedSkin', 'MeckedStripes'], belly: ['MeckedBelly', 'MeckedEarInner'], eyes: ['MeckedEyes_glow'] },
  colors: paints({ skin: 'ochre.mid', belly: 'ochre.pale', eyes: 'eyes.sun' }),
  style: 'brute', charge: 1.4,
  seedSalt: 0x3ec4ed1, spacing: 4,
};
// A little wind spirit in a skirt (blender/tornado.py, after the kids' sketch): a floating face
// with angry brows over a thin body, its arms raised either side of it like a U, a round overskirt
// over a long skirt (the game turns them, `waves`, so their swirls keep running round) and four
// stubby feet. It fights with twisters (core/twisters.js, game/twisters.js), from afar:
// A `twister` attack spins one up over each of its hands (`hands`: where, model space as for a
// muzzle) from `form` s on and lets them go at the hit frame: they drop to the floor and run out at
// `speed` cells/s, curving in from either side (`bend`) to cross where its target stood as it let
// go, and on, `range` cells in all. One that touches a player (within `radius` of its middle, up to
// `height` above the floor) catches them: lifted `lift` cells and spun round for `spin` s, then
// flung down (the blow, knocking them down).
// A `ride` lifts it onto a twister of its own between ride.from and the hit frame, up to
// ride.height over the way (game/enemyai.js): `back` cells away from the player (the hop, when the
// player comes too close: a twister stays behind where it took off for `leave.stay` s and catches
// whoever comes in), or onto its target (`onto`, the slam: a stomp beam's shadow shows where it
// comes down; it crashes down there onto whoever is under it). Up in the air (core/enemies.js
// airborne) nothing bumps into it and no blade reaches it, and the ride is `steady`.
const TWISTER = { speed: 2.6, range: 6.5, radius: 0.3, height: 1.1, bend: 0.5, lift: 1.3, spin: 1.1 };
const TORNADO_TWIN = {
  name: 'twin', clip: 'cast', weight: 4, reach: 4.6, minReach: 1.6, hitAt: 27 / 30, trackUntil: 0.7, attackTime: 48 / 30, hitReach: 0,
  arc: 0.5, power: 1, knock: 3.5, knockDown: true, hop: 3, reason: 'Caught in a Tornado\'s twister!',
  twister: { ...TWISTER, form: 6 / 30, hands: [[0.367, 1.158, 0.343], [-0.367, 1.158, 0.343]], muzzle: [0, 1.158, 0.343] },
};
const TORNADO_HOP = {
  name: 'hop', clip: 'hop', weight: 1, reach: 1.6, hitAt: 33 / 30, trackUntil: 0.25, attackTime: 42 / 30, hitReach: 0,
  arc: -1, power: 0.8, knock: 3, knockDown: true, hop: 3, reason: 'Caught in a Tornado\'s twister!', recover: 0.6,
  ride: { from: 9 / 30, height: 1.1, back: 2.6, leave: { ...TWISTER, stay: 1.4 } }, steady: { from: 9 / 30, to: 33 / 30 },
};
const TORNADO_SLAM = {
  name: 'slam', clip: 'slam', weight: 1, reach: 4.4, minReach: 2.2, hitAt: 45 / 30, trackUntil: 0.3, attackTime: 60 / 30, hitReach: 0,
  arc: -1, power: 1.2, knock: 5, knockDown: true, hop: 3.5, reason: 'Slammed by a Tornado!',
  ride: { from: 9 / 30, height: 1.5, onto: true }, steady: { from: 9 / 30, to: 45 / 30 },
  beam: { kind: 'stomp', aim: 'feet', time: 39 / 30, track: 1.8, lock: 0.3, radius: 0.85, range: 14, sky: 5, clear: false,
    muzzle: [0, 0, 0] },
};
export const TORNADO = {
  type: 'tornado', species: 'tornado', label: 'Tornado', hp: 95, damage: 22, knock: 3,
  xp: 66, coins: [14, 26],
  radius: 0.36, height: 1.4, bodyHeight: 1.15, mass: 1.3, waves: 2.4,
  aggro: 5.5, giveUp: 9, chase: 1.5, wander: 0.6, homeSpeed: 0.9,
  ...TORNADO_TWIN, reach: TORNADO_TWIN.reach, cooldown: 1.7, ichor: ['#e2d0ff', '#7a5ab8'], pitch: 1.1,
  attacks: [TORNADO_TWIN, TORNADO_HOP, TORNADO_SLAM],
  poise: 0.5, hitStun: 0.2, deathTime: 2, corpseTime: 4,
  parts: { body: ['TornadoBody', 'TornadoSkirt', 'TornadoSwirl'], wind: ['TornadoWind', 'TornadoWindDeep'], eyes: ['TornadoEyes_glow'] },
  colors: paints({ body: 'violet.light', wind: 'violet.pale', eyes: 'eyes.sun' }),
  style: 'ranged', keep: [2.2, 4.2],
  seedSalt: 0x70a4d0, spacing: 4,
};
// A big dark green slug of the slime marsh (blender/slug.py, after the kids' sketch): a long, low
// body striped across its back on four short curly legs, two eye stalks with an eye on each tip.
// It crawls very slowly, leaving a trail of slime (`trail`, render/trails.js), and from afar rears
// up and spits balls of slime (clip frame 24) that slow what they hit: the projectile's `slow`
// (core/status.js: how fast the body moves, not the weapon). It is the slime's own (`slimeborn`:
// the marsh's slime does not hold it, core/footing.js).
const SLUG_BALL = { kind: 'slimeball', speed: 6, radius: 0.17, range: 7, spin: 3,
  muzzle: [0, 0.228, 0.651], slow: { time: 2.5, slow: 0.55, source: 'slime' } };
export const SLUG = {
  type: 'slug', species: 'slug', label: 'Slug', hp: 120, damage: 18, knock: 2,
  xp: 62, coins: [12, 24],
  radius: 0.38, height: 0.95, bodyHeight: 0.6, mass: 2.6, slimeborn: true, trail: '#3e7a2a',
  aggro: 6, giveUp: 9, chase: 0.7, wander: 0.35, homeSpeed: 0.5,
  reach: 5.5, hitReach: 0, hitAt: 24 / 30, trackUntil: 0.6, attackTime: 42 / 30, cooldown: 1.8,
  arc: 0.5, knockDown: false, hop: 2.5, reason: 'Slimed by a Slug!', ichor: ['#8ae048', '#2e5a22'], pitch: 0.75,
  projectile: SLUG_BALL,
  poise: 0.8, hitStun: 0.25, deathTime: 1.6, corpseTime: 4,
  parts: { body: ['SlugBody', 'SlugFoot'], stripes: ['SlugStripes'], eyes: ['SlugEyes_glow'] },
  colors: paints({ body: 'moss.deep', stripes: 'moss.dark', eyes: 'eyes.bone' }),
  style: 'ranged', keep: [2.2, 4.5],
  seedSalt: 0x51a6e5, spacing: 4,
};
// A big, see-through blob of slime with eyes (blender/bolime.py, after the kids' sketch): a lime
// green body you can see into (`shell`: the parts drawn translucent, render/enemies.js), a
// squiggly core floating inside it, two eye stalks on top. It only ever hops (its gait), and it
// fights by jumping onto you: its shadow follows you (a stomp beam's, as the Tornado's slam), it
// leaps (a `ride` onto it) and comes down at the hit frame; whoever is under it then is
// swallowed (`engulf`, game/engulf.js): inside it, slowed down a lot, the weapon too (a slowing
// with `weapons`, core/status.js), digested a bite at a time (`bite` s apart, `share` of its damage
// through the armor alone), until they break out (walking out fills the struggle in `walk` s,
// every jump adds `jump`), it is staggered or killed, or it spits them out at `release`. A pounce
// that catches nobody skips to the spitting out. The slime is its own (`slimeborn`).
const BOLIME_POUNCE = {
  name: 'pounce', clip: 'pounce', weight: 1, reach: 3.2, hitAt: 30 / 30, trackUntil: 0.35, attackTime: 150 / 30, hitReach: 0,
  arc: -1, power: 1, knock: 0, knockDown: false, hop: 0, reason: 'Swallowed by a Bolime!', recover: 1.4,
  ride: { from: 12 / 30, height: 1.3, onto: true }, steady: { from: 12 / 30, to: 30 / 30 },
  beam: { kind: 'stomp', aim: 'feet', time: 26 / 30, track: 2.2, lock: 0.25, radius: 0.7, range: 14, sky: 5, clear: false,
    muzzle: [0, 0, 0] },
  engulf: { release: 132 / 30, bite: 0.9, share: 0.4, slow: 0.35, walk: 2.6, jump: 0.05, hold: 0.25,
    reason: 'Digested by a Bolime!' },
};
export const BOLIME = {
  type: 'bolime', species: 'bolime', label: 'Bolime', hp: 110, damage: 16, knock: 2,
  xp: 64, coins: [12, 24],
  radius: 0.5, height: 1.75, bodyHeight: 1.3, mass: 2.4, slimeborn: true, shell: { parts: ['BolimeSkin'], opacity: 0.6 }, hops: 0.82,
  aggro: 5.5, giveUp: 9, chase: 1.5, wander: 0.9, homeSpeed: 0.8,
  ...BOLIME_POUNCE, reach: BOLIME_POUNCE.reach, cooldown: 1.6, ichor: ['#b8ff5a', '#3e8a2a'], pitch: 1.2,
  attacks: [BOLIME_POUNCE],
  poise: 0.6, hitStun: 0.2, deathTime: 1.5, corpseTime: 3,
  parts: { skin: ['BolimeSkin', 'BolimeStalk'], core: ['BolimeCore_glow'] },
  colors: paints({ skin: 'moss.light', core: 'moss.deep' }),
  style: 'brute',
  seedSalt: 0xb011e, spacing: 4,
};
// A Flimmer (the kids' idea): a small person, two thirds of the hero's height, and all blurry: a
// shimmering smudge wherever it runs (render/flimmerview.js draws it with the hero's own figure,
// rig and clips: `figure`, `model`). Flimmers come in threes (`troop`: every pack exactly that
// many, core/spawns.js, game/enemyspawn.js). While it shimmers (whenever it is not beating you
// or reeling from a blow: shimmerOf) a blow, a shot or a flask's burst may go right through it
// (`blur.evade`: the chance, evades). It comes into focus to beat you: fists up (the warning),
// then five quick punches, right and left in turn (the Pummel clip, blender/character.py; `more`:
// the four after the first, the last one the hardest), stepping after you as you back away
// (`press`). Killed, it dissolves away completely: no body is left.
const PUMMEL_HITS = [15, 20, 25, 30, 37].map(f => f / 30);
const FLIMMER_PUMMEL = {
  name: 'pummel', clip: 'pummel', weight: 1, reach: 0.8, hitAt: PUMMEL_HITS[0], trackUntil: PUMMEL_HITS[4] - 0.1, attackTime: 48 / 30,
  hitReach: 0.95, arc: 0.4, power: 0.28, knock: 1, knockDown: false, hop: 2.5, reason: 'Beaten up by a Flimmer!',
  more: [...PUMMEL_HITS.slice(1, 4).map(at => ({ at })), { at: PUMMEL_HITS[4], power: 0.55, knock: 4.5 }],
  press: { from: PUMMEL_HITS[0] - 0.1, to: PUMMEL_HITS[4], speed: 1.6, stop: 0.55 },
};
export const FLIMMER = {
  type: 'flimmer', species: 'flimmer', label: 'Flimmer', hp: 28, damage: 12, knock: 1,
  xp: 22, coins: [4, 8], troop: 3, blur: { evade: 0.4 },
  radius: 0.2, height: 0.72, bodyHeight: 0.65, mass: 0.8, figure: true, model: 'character', size: 0.65,
  aggro: 3.8, giveUp: 7, chase: 2.4, wander: 0.7, homeSpeed: 1.2,
  ...FLIMMER_PUMMEL, cooldown: 1.4, ichor: ['#eef2fa', '#9aa6bf'], pitch: 1.3,
  attacks: [FLIMMER_PUMMEL],
  poise: 0, hitStun: 0.2, deathTime: 0.9, corpseTime: 1.2,
  parts: { skin: ['Clay'] },
  colors: paints({ skin: 'ink.light' }),
  style: 'skirmish', circle: 1.5, strafe: true,
  seedSalt: 0xf1133e, spacing: 3,
};
// The Moose (blender/moose.py, after the kids' drawing): a grumpy, big-headed moose on four stubby
// legs, with branching antlers, a wide grin full of teeth and a long tail that ends in a hard ball.
// Moose come in herds (core/spawns.js). Its antlers guard its front and its tail its back: its
// sides are open, and it turns slowly (`turnSpeed`). Close in front it tosses its antlers (clip
// frame 14). From further off it charges, as Monteur does: it lowers its head and scrapes a hoof,
// then runs along its heading (a `roll`, steering little) and tramples whoever it runs into; one
// that runs into something with nobody run over `crash`es into its `dazed` (stars over its head,
// every blow hurting it more). Behind it, it sweeps its tail round: an attack that is `back` is only
// started with the player behind it, without turning round to them, turns its back to them while it
// winds up, and lands behind it (its arc is about its back: game/enemyai.js, game/enemycombat.js).
const MOOSE_TOSS = {
  name: 'toss', clip: 'toss', weight: 2, reach: 1.45, hitAt: 14 / 30, trackUntil: 0.3, attackTime: 33 / 30, hitReach: 1.75,
  arc: 0.5, power: 1, knock: 6, knockDown: false, hop: 4, reason: 'Tossed by a Moose!',
};
const MOOSE_CHARGE = {
  name: 'charge', clip: 'charge', weight: 2, reach: 7, minReach: 2.5, hitAt: 21 / 30, trackUntil: 21 / 30, attackTime: 69 / 30, hitReach: 0,
  arc: 0.5, power: 1.3, knock: 7, knockDown: true, hop: 4, reason: 'Trampled by a Moose!',
  roll: { from: 21 / 30, to: 51 / 30, speed: 6.5, steer: 0.35, bounces: 0, reach: 0.25, crash: 'dazed' }, steady: { from: 21 / 30, to: 51 / 30 },
};
// (only a charge that runs into something starts it)
const MOOSE_DAZED = {
  name: 'dazed', clip: 'dazed', weight: 0, reach: 0, hitAt: 60 / 30, trackUntil: 0, attackTime: 60 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Moose', recover: 0.5,
  exposed: { from: 0.1, until: 1.6, damage: 1.5, thud: true },
};
const MOOSE_TAIL = {
  name: 'tail', clip: 'tail', weight: 1, reach: 1.9, hitAt: 16 / 30, trackUntil: 0.3, attackTime: 36 / 30, hitReach: 2.1,
  arc: 0.2, back: true, power: 0.9, knock: 6.5, knockDown: false, hop: 4, reason: 'Clubbed by a Moose\'s tail!',
};
export const MOOSE = {
  type: 'moose', species: 'moose', label: 'Moose', hp: 100, damage: 20, knock: 6,
  xp: 64, coins: [12, 24],
  radius: 0.5, height: 2.4, bodyHeight: 1.5, mass: 4, turnSpeed: 2.2, turnStride: 0.45,
  aggro: 4.5, giveUp: 9, chase: 1.7, wander: 0.65, homeSpeed: 0.9,
  ...MOOSE_TOSS, reach: MOOSE_CHARGE.reach, cooldown: 1.5, ichor: ['#d0503a', '#7a2418'], pitch: 0.75,
  attacks: [MOOSE_TOSS, MOOSE_CHARGE, MOOSE_DAZED, MOOSE_TAIL],
  poise: 1, hitStun: 0.22, deathTime: 2, corpseTime: 4,
  parts: { fur: ['MooseFur', 'MooseMuzzle', 'MooseBrows'], antlers: ['MooseAntlers'], ball: ['MooseTailBall'], eyes: ['MooseEyes_glow'] },
  colors: paints({ fur: 'ember.deep@+6', antlers: 'stone.pale', ball: 'ember.dark@+6', eyes: 'eyes.sun' }),
  style: 'brute', charge: 1.3,
  seedSalt: 0x3005e1, spacing: 5,
};
export const ENEMY_PROFILES = [SPIDER, STUNDER, SNAKE, OCTONAUT, FIREFACE, TRIANGLE, FIRECAT, SHRAPS, SPICY, WOLLA, WOLK, SQUIRTLE, MECKED, TORNADO, SLUG, BOLIME, FLIMMER, MOOSE];

// Gusto, the first real boss (blender/gusto.py), in place of the first descent guardian
// (core/bosses.js). A round white-grey head with red eyes and jagged teeth, two long arms with
// claws and tentacles it floats on (`flail`: the game shakes them like crazy, render/enemies.js).
// game/gusto.js runs his fight, core/gusto.js holds its rules: two phases, proxies, summons.
// A `grab` catches the player at the hit frame (within hitReach, inside the arc), holds them in
// its hands along `grip` (where they are held, model space as for a muzzle, every `step` s from
// the hit frame; `hold`: how far below the grip the feet hang) and throws them down in front of
// it at `throwAt` (`throw` cells/s forward): the blow lands then, and knocks them down
// (game/grab.js). A `summon` spits minions of kind `summon.kind` from its mouth at the hit frame
// (game/gusto.js). The `vortex` is a gust (the Wolla's, core/gusts.js) blown through its hands; it
// breathes in from `inhale` on (only the look). Up close (within its minReach) it grabs rather
// than blows: a sword has to stand there, and a grab can be dodged and punished (`stuck`).
// Gusto must be fair to those without a bow, crossbow or staff (docs/balance.md, docs/bosses.md).
const GUSTO_GRAB = {
  name: 'grab', clip: 'grab', weight: 2, reach: 1.6, hitAt: 22 / 30, trackUntil: 0.6, attackTime: 66 / 30, hitReach: 1.8,
  arc: 0.35, power: 1.2, knock: 0, knockDown: true, hop: 2.5, reason: 'Thrown by Gusto!', miss: 'stuck',
  grab: { throwAt: 46 / 30, step: 2 / 30, hold: 0.55, throw: 4.5,
    grip: [[0, 0.973, 1.378], [0, 0.948, 1.378], [0, 0.923, 1.376], [0, 1.06, 1.295], [0, 1.389, 1.143], [0, 1.801, 0.969],
      [0, 2.107, 0.831], [0, 2.182, 0.796], [0, 2.182, 0.796], [0, 2.182, 0.796], [0.002, 2.18, 0.793], [0, 1.836, 0.944],
      [0, 1.018, 1.319]] },
};
const GUSTO_SUMMON = {
  name: 'summon', clip: 'summon', weight: 3, reach: 8, hitAt: 27 / 30, trackUntil: 0.6, attackTime: 48 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Gusto',
  summon: { kind: 'custotriangle', muzzle: [0.02, 1.131, 0.795] },
};
const GUSTO_VORTEX = {
  name: 'vortex', clip: 'blow', weight: 3, reach: 4.4, minReach: 2, hitAt: 30 / 30, trackUntil: 0.85, attackTime: 63 / 30, hitReach: 0,
  arc: 0.5, power: 0.5, knock: 3, knockDown: false, hop: 3, reason: 'Blown away by Gusto!',
  gust: { kind: 'vortex', time: 18 / 30, range: 5, width: 0.45, spread: 0.4, push: 7, pushTime: 0.7,
    muzzle: [0, 1.36, 1], thunder: [], inhale: 9 / 30 },
};
// Breathing in (clip GustoInhale): from the hit frame for `pull.time` it sucks in whoever is in
// the cone before its mouth (the gust's shape, core/gusts.js inGust), with a clear line to it:
// pulled towards it at `pull.speed`, keeping only `pull.hold` of their steering away from it
// (they can still step aside), up to `pull.stop` cells from it. No harm in itself: it brings the
// player into reach of a grab, and recovers fast for one (`recover`). It only breathes in at
// a player who keeps away (game/gusto.js); it stops turning at trackUntil.
const GUSTO_INHALE = {
  name: 'inhale', clip: 'inhale', weight: 1, reach: 9, minReach: 2, hitAt: 15 / 30, trackUntil: 1.0, attackTime: 72 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Gusto', recover: 0.2,
  pull: { kind: 'inhale', time: 39 / 30, range: 9, width: 0.7, spread: 0.5, speed: 4, hold: 0.25, stop: 1.5, muzzle: [0.023, 1.164, 0.856] },
};
// A grab that caught nothing (its `miss`, game/enemyai.js): it face-plants and lies there
// (clip GustoStuck), helpless until `exposed.until`: every blow does `exposed.damage` times
// as much (core/combat.js weaponHit) and none staggers it out of this. Never started otherwise
// (no reach).
const GUSTO_STUCK = {
  name: 'stuck', clip: 'stuck', weight: 0, reach: 0, hitAt: 60 / 30, trackUntil: 0, attackTime: 60 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Gusto',
  exposed: { until: 48 / 30, damage: 2, thud: true, say: msg('{name} missed! Hit him while he is down') },
};
export const GUSTO = {
  type: 'gusto', species: 'gusto', label: 'Gusto', hp: 1000, damage: 24, knock: 4,
  xp: 650, coins: [120, 220],
  radius: 0.62, height: 2.3, bodyHeight: 2.1, mass: 8, hover: true, flail: 1,
  aggro: 7, giveUp: 14, chase: 1.45, wander: 0.4, homeSpeed: 0.9,
  ...GUSTO_GRAB, reach: GUSTO_SUMMON.reach, cooldown: 1.2, ichor: ['#f2f3f6', '#8a8f99'], pitch: 0.7,
  attacks: [GUSTO_GRAB, GUSTO_SUMMON, GUSTO_INHALE, GUSTO_STUCK], phase: 1,
  poise: 2, hitStun: 0.25, deathTime: 2.2, corpseTime: 5,
  parts: { body: ['GustoBody', 'GustoLimbs', 'GustoTentacles'], eyes: ['GustoEyes_glow'] },
  light: '#ff3020', sparks: ['#ff8070', '#ffffff'],
  style: 'brute', guardian: true, guardianRole: 'descent', boss: 'gusto',
  seedSalt: 0x6057a0, spacing: 6,
};
// from half his health on: the three of him blow vortexes too
export const GUSTO_SPLIT = { ...GUSTO, attacks: [GUSTO_GRAB, GUSTO_VORTEX, GUSTO_SUMMON, GUSTO_INHALE, GUSTO_STUCK], phase: 2 };

// Totnar, the second real boss (blender/totnar.py), in place of the descent guardian of depth 1
// (core/bosses.js): a tumbleweed of sticks and dry leaves with a glowing red heart, three skulls
// floating above it and two stick arms. game/totnar.js runs his fight, core/totnar.js holds its
// rules: three stages, one per skull he has left (`stage` on the enemy), each with its own attacks
// (all of them are on the one profile; the fight bars the others). The game rolls his ball by the
// distance he covers (`tumble`: its radius, render/enemies.js).
// A projectile that `becomes` a kind comes to life where it lands (game/totnar.js: the snapping
// skulls), and one with a `push` blows the player back like a gust (`pushTime` s). A `cast` does
// its boss's thing at the hit frame (the gloom: the light changes, game/totnar.js). A `roll`
// rolls it along its heading from roll.from to roll.to at roll.speed, steering towards the player
// at roll.steer rad/s, bouncing off what stops it (roll.bounces times, then it stops) and running
// over every player within roll.reach of its body once (game/enemyai.js); while it rolls
// (`steady`) no blow staggers it. A beam with `sky` strikes from that high above its aim, and
// `bolts` of them strike at once: one at the player, the others `spread` cells round them.
const TOTNAR_THROW = {
  name: 'throw', clip: 'throw', weight: 3, reach: 7.5, hitAt: 24 / 30, trackUntil: 0.7, attackTime: 42 / 30, hitReach: 0,
  arc: 0.5, power: 0.7, knock: 4, knockDown: false, hop: 3, reason: 'Hit by a flying skull!',
  projectile: { kind: 'skull', speed: 7.5, radius: 0.22, range: 9, tumble: 11, push: 7, pushTime: 0.45, becomes: 'snapskull', converge: true,
    muzzle: [-0.473, 1.053, 1.401] },
};
const TOTNAR_GLOOM = {
  name: 'gloom', clip: 'gloom', weight: 1, reach: 30, hitAt: 27 / 30, trackUntil: 0.5, attackTime: 51 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Totnar', cast: 'gloom',
};
const TOTNAR_SPIDERS = {
  name: 'spiders', clip: 'summon', weight: 3, reach: 9, hitAt: 27 / 30, trackUntil: 0.6, attackTime: 48 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Totnar',
  summon: { kind: 'totspider', muzzle: [-0.046, 0.609, 0.547] },
};
const TOTNAR_STUNDERS = { ...TOTNAR_SPIDERS, name: 'stunders', summon: { ...TOTNAR_SPIDERS.summon, kind: 'totstunder' } };
const TOTNAR_ROLL = {
  name: 'roll', clip: 'roll', weight: 3, reach: 8, minReach: 1.6, hitAt: 24 / 30, trackUntil: 24 / 30, attackTime: 105 / 30, hitReach: 0,
  arc: 0.5, power: 1.3, knock: 7, knockDown: true, hop: 3.8, reason: 'Run over by Totnar!',
  roll: { from: 24 / 30, to: 78 / 30, speed: 7, steer: 0.8, bounces: 2, reach: 0.2 }, steady: { from: 24 / 30, to: 78 / 30 },
};
const TOTNAR_STORM = {
  name: 'storm', clip: 'storm', weight: 3, reach: 9, hitAt: 42 / 30, trackUntil: 0.4, attackTime: 57 / 30, hitReach: 0,
  arc: 0.5, power: 0.9, knock: 2, knockDown: false, hop: 3, reason: 'Struck by Totnar\'s lightning!',
  beam: { kind: 'bolt', aim: 'feet', time: 1, track: 1.5, lock: 0.35, radius: 0.35, range: 14, shock: 0.8, color: '#ffe9a0',
    muzzle: [0.015, 2.537, -0.153], sky: 7, bolts: 3, spread: [1.4, 2.4] },
};
export const TOTNAR = {
  type: 'totnar', species: 'totnar', label: 'Totnar', hp: 1000, damage: 24, knock: 4,
  xp: 650, coins: [140, 240],
  radius: 0.78, height: 2.45, bodyHeight: 1.75, mass: 9, hover: true, tumble: 0.8,
  aggro: 7, giveUp: 14, chase: 1.3, wander: 0.4, homeSpeed: 0.9,
  ...TOTNAR_THROW, cooldown: 1.1, ichor: ['#b08a58', '#4a3018'], pitch: 0.75,
  attacks: [TOTNAR_THROW, TOTNAR_GLOOM, TOTNAR_SPIDERS, TOTNAR_ROLL, TOTNAR_STORM, TOTNAR_STUNDERS],
  poise: 2, hitStun: 0.25, deathTime: 2.2, corpseTime: 5,
  parts: { sticks: ['TotnarSticks', 'TotnarBark'], leaves: ['TotnarLeaves'], bone: ['TotnarBone'], heart: ['TotnarHeart_glow'],
    eyes: ['TotnarEyes_glow'] },
  // what goes with each skull he loses (render/enemies.js): at stage 2 the right one and the outer
  // shell of sticks, at stage 3 the left one and the middle shell: his heart shows more and more
  shed: { 2: ['skull2', 'shell0'], 3: ['skull0', 'shell1'] },
  litter: ['#8a6440', '#7d8a3c', '#5a3e26'],   // leaves and twigs falling off as he rolls
  light: '#ff4018', sparks: ['#ffb070', '#ff5a20'],
  style: 'brute', guardian: true, guardianRole: 'descent', boss: 'totnar',
  seedSalt: 0x7a7a12, spacing: 6,
};

// Squarlo, the third real boss (blender/squarlo.py), in place of the descent guardian of depth 2
// (core/bosses.js): tiny (smaller than the player), teal and boxy, with a floppy cap, three dots
// for a face and cupped hands; super fast. He fights in his tidal hills (cubegen/arenashapes.js),
// game/squarlo.js runs his fight, core/squarlo.js holds its rules. He `swims` (nothing drowns
// him, physics/fluid.js; in deep water he floats, game/tide.js).
// Phase 1: he blows a jet of water out of his hands (a gust of kind 'jet', like Gusto's vortex: it
// hurts and knocks back) and summons Squirtles; the tide (a `cast`: while he casts nothing hurts
// him, `ward`) floods the flats, and only the hills stay dry. Every few attacks, and after
// every tide, he has to sit and catch his breath (`rest`, `exposed`: blows hurt more).
// Phase 2 (at half his health, SQUARLO_GIANT): he grows into a giant six cells tall. Nothing
// staggers him (`steadfast`) and blows do only `armour` of their damage, unless he is `exposed`.
// He stomps (a beam of kind 'stomp' out of the sky: his foot's shadow where it will come down, in
// front of him, swinging round with him as he turns to the player; then the foot crashes down and
// sticks a moment, `exposed`), jumps onto the player (`jump`: he springs off at jump.from and flies
// to his shadow, which follows the player and holds still at the last; landing on a player squashes
// them flat and dazes them for `daze` s), kicks a player at his legs away (a blow that knocks down
// and flings them) and blasts his water cannon down at the floor ahead of him, sweeping it across
// (a gust of kind 'cannon', `down`: it comes down from his hands onto whoever stands in its strip,
// `near` cells from his hands on; `sweep` rad, game/squarlo.js). A stomp and a landing send out a
// shockwave over the floor (`wave`: game/quakes.js): it runs out at wave.speed to wave.reach and
// knocks down whoever it rolls under on the ground (not one in the air, nor one up a step).
// The tide and the Squirtles stay.
// An `exposed` attack's `from` (s) is when the exposure starts (default: at once); `say` is what
// every game says then (game/gusts.js), `thud` crashes him down with a thump and dust.
const SQUARLO_BLOW = {
  name: 'blow', clip: 'blow', weight: 3, reach: 4.2, hitAt: 24 / 30, trackUntil: 0.65, attackTime: 48 / 30, hitReach: 0,
  arc: 0.5, power: 0.85, knock: 3, knockDown: false, hop: 3, reason: 'Soaked by Squarlo!',
  gust: { kind: 'jet', time: 15 / 30, range: 4.6, width: 0.28, spread: 0.26, push: 9, pushTime: 0.55,
    muzzle: [0.005, 0.379, 0.257], thunder: [], inhale: 8 / 30 },
};
const SQUARLO_TIDE = {
  name: 'tide', clip: 'cast', weight: 1, reach: 40, hitAt: 60 / 30, trackUntil: 0.4, attackTime: 72 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Squarlo', cast: 'tide', ward: true,
};
const SQUARLO_SUMMON = {
  name: 'summon', clip: 'summon', weight: 2, reach: 9, hitAt: 24 / 30, trackUntil: 0.5, attackTime: 42 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Squarlo',
  summon: { kind: 'squarlosquirtle', muzzle: [0, 0.172, 0.175] },
};
const SQUARLO_REST = {
  name: 'rest', clip: 'rest', weight: 0, reach: 40, hitAt: 6 / 30, trackUntil: 0, attackTime: 66 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Squarlo', cast: 'rest', recover: 0.3,
  exposed: { from: 0.2, until: 58 / 30, damage: 1.3, say: msg('{name} is out of breath! Hit him now') },
};
// (the giant's attacks are sized with him, like any kind's: a blow's reaches are given here in
// cells over his size, GIANT; a beam's, a gust's and a cast's stay as they are)
const GIANT = 6 / 0.68;
const SQUARLO_STOMP = {
  name: 'stomp', clip: 'stomp', weight: 3, reach: 4.6, hitAt: 54 / 30, trackUntil: 39 / 30, attackTime: 90 / 30, hitReach: 0,
  arc: -1, power: 1.5, knock: 6, knockDown: true, hop: 4, reason: 'Stomped flat by Squarlo!',
  beam: { kind: 'stomp', aim: 'feet', time: 42 / 30, track: 0, lock: 15 / 30, radius: 1.15, range: 14, sky: 7, clear: false,
    foot: true, muzzle: [-0.07, 0, 0.124] },
  wave: { speed: 7, reach: 4.8, width: 0.8, rise: 0.4, power: 0.55, knock: 6, hop: 3 },
  exposed: { from: 54 / 30, until: 78 / 30, damage: 1.4, say: msg('{name} is stuck! Hit his foot') },
};
const SQUARLO_JUMP = {
  name: 'jump', clip: 'jump', weight: 3, reach: 11, minReach: 3, rise: 3, hitAt: 51 / 30, trackUntil: 18 / 30, attackTime: 78 / 30, hitReach: 0,
  arc: -1, power: 1.6, knock: 0, knockDown: false, hop: 0, daze: 3, reason: 'Squashed flat by Squarlo!',
  beam: { kind: 'stomp', aim: 'feet', time: 39 / 30, track: 0, lock: 10 / 30, radius: 1.5, range: 16, sky: 9, clear: false,
    muzzle: [0, 0, 0] },
  jump: { from: 18 / 30, height: 3.6, track: 2.5 },
  wave: { speed: 8, reach: 6.5, width: 0.9, rise: 0.4, power: 0.6, knock: 7, hop: 3.5 },
  exposed: { from: 54 / 30, until: 69 / 30, damage: 1.3 },
};
const SQUARLO_KICK = {
  name: 'kick', clip: 'kick', weight: 4, reach: 2.8 / GIANT, hitAt: 21 / 30, trackUntil: 15 / 30, attackTime: 39 / 30, hitReach: 3.3 / GIANT,
  arc: 0.1, power: 1.2, knock: 10, knockDown: true, hop: 5, reason: 'Kicked away by Squarlo!',
};
const SQUARLO_CANNON = {
  name: 'cannon', clip: 'cannon', weight: 2, reach: 11, minReach: 3.5, hitAt: 30 / 30, trackUntil: 27 / 30, attackTime: 78 / 30, hitReach: 0,
  arc: 0.5, power: 0.9, knock: 4, knockDown: false, hop: 3, reason: "Blasted by Squarlo's water cannon!",
  gust: { kind: 'cannon', time: 36 / 30, range: 11, near: 2.5, width: 0.5, spread: 0.04, push: 12, pushTime: 0.75, down: true,
    sweep: 1.1, muzzle: [-0.005, 0.323, 0.21], thunder: [], inhale: 6 / 30 },
};
export const SQUARLO = {
  type: 'squarlo', species: 'squarlo', label: 'Squarlo', hp: 1000, damage: 24, knock: 3,
  xp: 650, coins: [150, 260],
  radius: 0.24, height: 0.7, bodyHeight: 0.6, mass: 3, swims: true,
  aggro: 7, giveUp: 14, chase: 4.2, wander: 1, homeSpeed: 2,
  ...SQUARLO_BLOW, cooldown: 0.9, ichor: ['#a8f0ff', '#2a8fb0'], pitch: 1.5,
  attacks: [SQUARLO_BLOW, SQUARLO_TIDE, SQUARLO_SUMMON, SQUARLO_REST], phase: 1,
  poise: 2, hitStun: 0.2, deathTime: 2.4, corpseTime: 5,
  parts: { body: ['SquarloBody', 'SquarloCap'], eyes: ['SquarloEyes_glow'] },
  light: '#7fe8ff', sparks: ['#e0fbff', '#7fe8ff'],
  style: 'skirmish', circle: 2.6, strafe: true, guardian: true, guardianRole: 'descent', boss: 'squarlo',
  seedSalt: 0x5a1a20, spacing: 6,
};
// Flip, the fourth real boss (blender/flip.py), in place of the descent guardian of depth 3
// (core/bosses.js): three rings of little rings, light blue, floating; the game spins the rings now
// and then (`rings`, render/enemies.js). He fights in his box (cubegen/fliparena.js), game/flip.js
// runs his fight, core/flip.js holds its rules.
// Phase 1: he throws balls of light out of his top ring and summons Sky wollas. The flip (a `cast`,
// while it lasts nothing hurts him, `ward`) turns the world: the box turns a quarter round (or
// upside down), everything falls onto the new floor and the landing hurts (game/flipworld.js).
// Phase 2 (at half his health): a volley of three balls instead of one, fanned out (`volley`,
// `fan`: rad between them, game/projectiles.js), and black holes (a cast, game/flip.js).
const FLIP_THROW = {
  name: 'throw', clip: 'throw', weight: 3, reach: 8, hitAt: 18 / 30, trackUntil: 0.5, attackTime: 36 / 30, hitReach: 0,
  arc: 0.5, power: 0.7, knock: 3, knockDown: false, hop: 3, reason: 'Hit by a ball of light!',
  projectile: { kind: 'ball', speed: 8.5, radius: 0.2, range: 12, spin: 6, muzzle: [0.139, 1.548, 0.535] },
};
const FLIP_VOLLEY = { ...FLIP_THROW, name: 'volley', power: 0.55, projectile: { ...FLIP_THROW.projectile, volley: 3, fan: 0.3 } };
const FLIP_FLIP = {
  name: 'flip', clip: 'flip', weight: 1, reach: 40, hitAt: 40 / 30, trackUntil: 0.4, attackTime: 66 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Flip', cast: 'flip', ward: true,
};
const FLIP_SUMMON = {
  name: 'summon', clip: 'summon', weight: 2, reach: 9, hitAt: 24 / 30, trackUntil: 0.5, attackTime: 42 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Flip',
  summon: { kind: 'skywolla', muzzle: [0.409, 0.782, 0.39] },
};
const FLIP_HOLE = {
  name: 'hole', clip: 'hole', weight: 3, reach: 9, hitAt: 32 / 30, trackUntil: 0.6, attackTime: 54 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Swallowed by a black hole!', cast: 'hole',
};
export const FLIP = {
  type: 'flip', species: 'flip', label: 'Flip', hp: 1000, damage: 24, knock: 3,
  xp: 650, coins: [160, 280],
  radius: 0.62, height: 2.2, bodyHeight: 2, mass: 5, hover: true, rings: 1,
  aggro: 7, giveUp: 14, chase: 1.5, wander: 0.4, homeSpeed: 0.9,
  ...FLIP_THROW, cooldown: 1, ichor: ['#d8f4ff', '#5fb0e0'], pitch: 0.9,
  attacks: [FLIP_THROW, FLIP_VOLLEY, FLIP_FLIP, FLIP_SUMMON, FLIP_HOLE], phase: 1,
  poise: 2, hitStun: 0.25, deathTime: 2.4, corpseTime: 5,
  parts: { rings: ['FlipRings_glow', 'FlipRingsPale_glow'] },
  light: '#8fdcff', sparks: ['#e8f8ff', '#8fdcff', '#4fb8f0'],
  style: 'ranged', keep: [2.6, 5.5], guardian: true, guardianRole: 'descent', boss: 'flip',
  seedSalt: 0xf11b0, spacing: 6,
};
// Foggery, the fifth real boss (blender/foggery.py), in place of the descent guardian of depth 4
// (core/bosses.js): an orange red frog a little taller than the player, with two big yellow eyes on fire on
// top of his head, long thin arms and long legs. He fights in his caldera of lava, round and up his
// tower (cubegen/towerarena.js); game/foggery.js runs his fight, core/foggery.js holds its rules.
// Lava does not burn him (`lavaproof`, physics/fluid.js).
// Phase 1: he plucks out one of his burning eyes and throws it (it sets you on fire; `eye`: which, 0 left, 1 right; it grows
// back, game/foggery.js) and croaks up Fire-faces. Phases 2 and 3 (FOGGERY_BALL): a ball with his
// eyes in the middle, floating, a shield round him while his Fire-cats live (a summon, `ward`ed:
// nothing hurts him while he calls them). He spits fireballs (phase 3: a volley of three) and
// makes fire geysers burst out of the floor (a beam of kind 'geyser' out of the floor: three
// rings that follow the player, then a column of fire: it burns and pops one up).
// (the summons are `cast`s too: they are started from any height, core/enemies.js attacksInReach)
const FOGGERY_EYE = {
  name: 'eyeL', clip: 'eyeL', weight: 3, reach: 8, hitAt: 24 / 30, trackUntil: 0.65, attackTime: 42 / 30, hitReach: 0,
  arc: 0.5, power: 0.75, knock: 3, knockDown: false, hop: 2.5, reason: 'Hit by Foggery\'s eye!',
  projectile: { kind: 'eye', speed: 8, radius: 0.2, range: 11, spin: 8, eye: 0, push: 4, pushTime: 0.25, burn: { time: 0.5, damage: 5, ticks: 2 },
    muzzle: [0.401, 1.18, 0.802] },
};
const FOGGERY_EYE_R = { ...FOGGERY_EYE, name: 'eyeR', clip: 'eyeR', projectile: { ...FOGGERY_EYE.projectile, eye: 1, muzzle: [-0.401, 1.179, 0.802] } };
const FOGGERY_SUMMON = {
  name: 'summon', clip: 'summon', weight: 2, reach: 9, hitAt: 27 / 30, trackUntil: 0.5, attackTime: 45 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Foggery', cast: 'summon',
  summon: { kind: 'fogface', muzzle: [0, 1.426, 0.266] },
};
const FOGGERY_SPIT = {
  name: 'spit', clip: 'spit', weight: 3, reach: 9, hitAt: 18 / 30, trackUntil: 0.5, attackTime: 33 / 30, hitReach: 0,
  arc: 0.5, power: 0.7, knock: 3, knockDown: false, hop: 3, reason: 'Scorched by Foggery!',
  projectile: { ...FIREFACE.projectile, speed: 7.5, radius: 0.24, range: 11, burn: { time: 1, damage: 6, ticks: 2 }, muzzle: [0, 0.605, 0.705] },
};
const FOGGERY_VOLLEY = { ...FOGGERY_SPIT, name: 'volley', power: 0.55, projectile: { ...FOGGERY_SPIT.projectile, volley: 3, fan: 0.32 } };
const FOGGERY_GEYSER = {
  name: 'geyser', clip: 'geyser', weight: 2, reach: 11, hitAt: 48 / 30, trackUntil: 0.5, attackTime: 63 / 30, hitReach: 0,
  arc: -1, power: 1, knock: 1.5, knockDown: false, hop: 3, pop: 5, reason: 'Burned by a fire geyser!', burn: { time: 1.5, damage: 5, ticks: 3 },
  beam: { kind: 'geyser', aim: 'feet', time: 1.5, track: 2, lock: 0.45, radius: 0.55, range: 14, sky: 3, clear: false, color: '#ff8a2a',
    bolts: 3, spread: [1.6, 2.8], muzzle: [0, 0.75, 0] },
};
const FOGGERY_CATS = {
  name: 'cats', clip: 'cats', weight: 1, reach: 40, hitAt: 30 / 30, trackUntil: 0.4, attackTime: 48 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Foggery', cast: 'cats', ward: true,
  summon: { kind: 'fogcat', muzzle: [0, 1.02, 0.728] },
};
export const FOGGERY = {
  type: 'foggery', species: 'foggery', label: 'Foggery', hp: 1000, damage: 24, knock: 3,
  xp: 650, coins: [170, 300],
  radius: 0.45, height: 1.75, bodyHeight: 1.6, mass: 5, lavaproof: true,
  aggro: 7, giveUp: 14, chase: 1.6, wander: 0.4, homeSpeed: 0.8,
  ...FOGGERY_EYE, cooldown: 2, ichor: ['#ffb27e', '#b8341a'], pitch: 0.8,
  attacks: [FOGGERY_EYE, FOGGERY_EYE_R, FOGGERY_SUMMON], phase: 1,
  poise: 2, hitStun: 0.25, deathTime: 2.4, corpseTime: 5,
  parts: { body: ['FoggeryBody', 'FoggeryBelly'], eyes: ['FoggeryEyes_glow'], flame: ['FoggeryFlame_glow', 'FoggeryFlameCore_glow'] },
  light: '#ff8a3a', sparks: ['#ffd25a', '#ff8a2a', '#c8f080'],
  style: 'ranged', keep: [2.4, 6], guardian: true, guardianRole: 'descent', boss: 'foggery',
  seedSalt: 0xf0663e, spacing: 6,
};
// ... curled up into his ball (phases 2 and 3): floating, his eyes in the middle
export const FOGGERY_BALL = {
  ...FOGGERY, type: 'foggeryball', radius: 0.6, height: 1.6, bodyHeight: 1.5, hover: true, gait: 'float',
  ...FOGGERY_SPIT, cooldown: 1, chase: 1.1, attacks: [FOGGERY_SPIT, FOGGERY_VOLLEY, FOGGERY_GEYSER, FOGGERY_CATS], phase: 2,
  style: 'ranged', keep: [2.6, 6],
};
// Renew, the sixth real boss, in place of the descent guardian of depth 5 (core/bosses.js): no
// monster but a hero like the player, the same figure (`figure`: render/renewview.js draws him
// with the player's rig and clips, not a model of his own; `model` names its file), in a hood,
// a weapon of the game's in his hands (`weapon`, phase by phase). He fights as a player does:
// runs (as fast as one), chains his blows (game/renew.js `combo`), steps in with a lunging one
// (`dash`), and rolls out of the way of a swing (`roll`, only ever as a dodge: the fight starts
// it). game/renew.js runs his fight, core/renew.js holds its rules: four phases, each a whole
// bar of health; at the end of the first three he rewinds time (game/rewind.js) and takes up the
// next weapon. The blows' times are the player's weapons', a little slower, so they can be read.
// Phase 1: a sword. Phase 2: a bow, arrows from far off (three at once now and then), keeping his
// distance: running backwards, leaping back (`leap`); he casts spiders out of the sky (`summon`, a
// cast). Phase 3: a morning star (a flail of one ball): slower, wider and harder blows, and
// Fire-faces cast out of the sky. Phase 4: a twin morning star, each of its two balls striking in
// turn (`twice`: the second's hit frame, game/enemyai.js). Beaten, he always drops a flail
// (`ownWeapon`, core/gear/drops.js).
const RENEW_SLASH = {
  name: 'slash', clip: 'slash', weight: 3, reach: 1, hitAt: 0.3, trackUntil: 0.24, attackTime: 0.72, hitReach: 1.1,
  arc: Math.cos(Math.PI * 0.42), power: 0.6, knock: 4, knockDown: false, hop: 3, reason: 'Slashed by Renew!',
};
const RENEW_DASH = {
  ...RENEW_SLASH, name: 'dash', weight: 2, reach: 2.8, minReach: 1.4, hitAt: 0.36, trackUntil: 0.3, attackTime: 0.82, power: 0.75,
  lunge: { from: 0.06, to: 0.32, max: 1.9, stop: 0.55 }, reason: 'Renew lunged at you!',
};
// (a dodge: rolled `dodge.dist` cells along his heading between dodge.from and dodge.to; it
// strikes nothing, its hit frame is past its end)
const RENEW_ROLL = {
  name: 'roll', clip: 'roll', weight: 0, reach: 0, hitAt: 9, trackUntil: 0, attackTime: 0.95, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Renew', dodge: { dist: 1.5, from: 0.04, to: 0.72 },
};
const RENEW_SPIDERS = {
  name: 'summon', clip: 'cast', weight: 2, reach: 9, hitAt: 0.6, trackUntil: 0.45, attackTime: 1.15, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Renew', cast: 'summon',
  summon: { kind: 'renspider', muzzle: [0, 1.55, 0.3] },
};
const RENEW_FACES = { ...RENEW_SPIDERS, summon: { ...RENEW_SPIDERS.summon, kind: 'renface' } };
// (a leap back, away from the player, facing them: `back`, along the way the fight picks; up
// `hop` cells over the floor at its height, render/renewview.js)
const RENEW_LEAP = {
  name: 'leap', clip: 'leap', weight: 0, reach: 0, hitAt: 9, trackUntil: 0, attackTime: 0.75, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Renew', dodge: { dist: 2.6, from: 0.08, to: 0.62, back: true, hop: 0.9 },
};
// The bow (phase 2): arrows from afar (an `arrow`: the game's arrow model, render/projectiles.js),
// now and then three at once, fanned out. The draw is a player's bow's, a little slower.
const RENEW_SHOT = {
  name: 'shoot', clip: 'shoot', weight: 3, reach: 8, hitAt: 0.62, trackUntil: 0.55, attackTime: 1, hitReach: 0,
  arc: 0.5, power: 0.8, knock: 3, knockDown: false, hop: 3, reason: 'Shot by Renew!',
  projectile: { kind: 'arrow', speed: 11, radius: 0.1, range: 11, muzzle: [0.015, 0.744, 0.523] },
};
const RENEW_ARROWS = { ...RENEW_SHOT, name: 'arrows', weight: 2, hitAt: 0.75, trackUntil: 0.65, attackTime: 1.15, power: 0.55,
  projectile: { ...RENEW_SHOT.projectile, volley: 3, fan: 0.22 } };
// The morning star (phase 3): swung on the Slash clip like the sword, but slower to come round,
// sweeping wider and further and shoving harder; its lunge knocks you down.
const RENEW_SWING = {
  ...RENEW_SLASH, reach: 1.2, hitAt: 0.5, trackUntil: 0.38, attackTime: 1.05, hitReach: 1.4, arc: Math.cos(Math.PI * 0.6),
  power: 0.9, knock: 7, reason: 'Smashed by Renew\'s morning star!',
};
const RENEW_SWING_DASH = {
  ...RENEW_SWING, name: 'dash', weight: 2, reach: 2.9, minReach: 1.5, hitAt: 0.54, trackUntil: 0.4, attackTime: 1.1, power: 1.05,
  knockDown: true, hop: 3.5, lunge: { from: 0.08, to: 0.46, max: 2, stop: 0.7 }, reason: 'Renew\'s morning star knocked you down!',
};
// The twin morning star (phase 4): each ball strikes, the second `twice` s into the swing; the
// first shoves less, so the second can still catch you.
const RENEW_TWIN_SWING = { ...RENEW_SWING, hitAt: 0.46, twice: 0.6, attackTime: 1.1, power: 0.62, knock: 3.5,
  reason: 'Battered by Renew\'s twin morning star!' };
const RENEW_TWIN_DASH = { ...RENEW_SWING_DASH, hitAt: 0.5, twice: 0.64, attackTime: 1.15, power: 0.72, knock: 3.5, knockDown: false,
  reason: 'Renew\'s twin morning star caught you!' };
export const RENEW = {
  type: 'renew', species: 'renew', label: 'Renew', hp: 360, damage: 24, knock: 4,
  xp: 650, coins: [180, 320], ownWeapon: 'flail',
  radius: 0.26, height: 1.1, bodyHeight: 1, mass: 2.2, figure: true, model: 'character', weapon: 'weapon_sword_medium',
  aggro: 7, giveUp: 14, chase: 2.5, wander: 0.6, homeSpeed: 1.4,
  ...RENEW_SLASH, cooldown: 0.9, ichor: ['#eef6ff', '#6a8ab8'], pitch: 1,
  attacks: [RENEW_SLASH, RENEW_DASH, RENEW_ROLL], phase: 1,
  poise: 1.2, hitStun: 0.2, deathTime: 2.6, corpseTime: 5,
  parts: {}, light: '#bdf3ff', sparks: ['#ffffff', '#bdf3ff', '#ffe9a8'],
  style: 'skirmish', circle: 1.7, strafe: true, guardian: true, guardianRole: 'descent', boss: 'renew',
  seedSalt: 0x7e3e3a, spacing: 6,
};
// ... with a bow (phase 2): arrows from far off; too close, he runs backwards (at his full speed,
// `backpedal`, game/enemyai.js) and leaps back out of reach (game/renew.js); he casts spiders
export const RENEW_BOW = {
  ...RENEW, type: 'renewbow', weapon: 'weapon_bow_hunting', ...RENEW_SHOT, cooldown: 0.9, chase: 2.6,
  attacks: [RENEW_SHOT, RENEW_ARROWS, RENEW_LEAP, RENEW_SPIDERS], phase: 2, style: 'ranged', keep: [4, 7], backpedal: 1,
};
// ... with a morning star (phase 3): slower, wider and harder blows; he casts Fire-faces
export const RENEW_FLAIL = {
  ...RENEW, type: 'renewflail', weapon: 'weapon_flail_morningstar', ...RENEW_SWING, cooldown: 1.1, chase: 2.4,
  attacks: [RENEW_SWING, RENEW_SWING_DASH, RENEW_ROLL, RENEW_FACES], phase: 3, circle: 2,
};
// ... and with a twin morning star (phase 4): two blows in every swing
export const RENEW_TWIN = {
  ...RENEW, type: 'renewtwin', weapon: 'weapon_flail_twin', ...RENEW_TWIN_SWING, cooldown: 1, chase: 2.5,
  attacks: [RENEW_TWIN_SWING, RENEW_TWIN_DASH, RENEW_ROLL], phase: 4, circle: 2,
};
// Slomo, the boss at the bottom of act II (depth 13, core/bosses.js; blender/slomo.py, after the
// kids' sketches): a slime boss in two shapes, one model (the clips of each shape scale the
// other's bones away; render/slomoview.js blends from the blob into the slug while he changes).
// He fights in his slime bowl (cubegen/arenashapes.js `bowl`), always at night; game/slomo.js runs
// his fight, core/slomo.js holds its rules. The slime is his own (`slimeborn`): it does not hold him.
// Phase 1 (SLOMO): a great see-through blob of lime slime (its skin drawn translucent: `shell`),
// the squiggly stuff a Bolime has inside it, two eye stalks with an angry V between them, and two
// long slime arms that end in Slugs. He throws the slug of an arm (`arm`: which, 0 left, 1 right;
// it grows back, game/slomo.js): it flies in an arc (`lob`, core/projectiles.js) and where it lands
// it comes to life (`becomes`: an Arm slug that crawls after the player, latches on, bites a few
// times and drops off dead). He spits slime meteorites up into the sky (a cast with a `rain`:
// they come down round the player, game/meteors.js).
// Phase 2 (SLOMO_SLUG): the blob bursts and the slug inside it turns round, on six legs (turning no
// faster than `turnSpeed`: he steps round). He spits balls of slime (three at once), calls Ooze slugs
// and Ooze bolimes out of himself and Slime squirtles, floods his bowl with slime from one side (a
// cast, `ward`ed: game/slomo.js) and spits meteorites.
const SLOMO_ARM = {
  name: 'armL', clip: 'armL', weight: 3, reach: 10, hitAt: 27 / 30, trackUntil: 0.75, attackTime: 45 / 30, hitReach: 0,
  arc: 0.5, power: 0.7, knock: 2.5, knockDown: false, hop: 2.5, reason: "Hit by Slomo's slug!",
  projectile: { kind: 'slugarm', speed: 7, radius: 0.3, range: 16, spin: 5, lob: 11, arm: 0, becomes: 'armslug',
    slow: { time: 2, slow: 0.6, source: 'slime' }, muzzle: [1.09, 1.024, 1.465] },
};
const SLOMO_ARM_R = { ...SLOMO_ARM, name: 'armR', clip: 'armR', projectile: { ...SLOMO_ARM.projectile, arm: 1, muzzle: [-1.09, 1.024, 1.465] } };
// (meteorites: `count` of them, the first on the player and the rest `spread` cells round them,
// `stagger` s apart, each hitting with `power` of his damage, game/meteors.js)
const SLOMO_METEOR = {
  name: 'meteor', clip: 'meteor', weight: 2, reach: 14, hitAt: 33 / 30, trackUntil: 0.6, attackTime: 54 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Slomo', cast: 'meteors',
  rain: { count: 4, spread: [1.4, 3.6], stagger: 0.3, power: 0.6, reason: "Hit by Slomo's meteorite!", muzzle: [0, 3.082, 0.083] },
};
const SLOMO_FLOOD = {
  name: 'flood', clip: 'flood', weight: 1, reach: 40, hitAt: 54 / 30, trackUntil: 0.4, attackTime: 72 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Slomo', cast: 'flood', ward: true,
};
const SLOMO_SPIT = {
  name: 'spit', clip: 'spit', weight: 3, reach: 9, hitAt: 24 / 30, trackUntil: 0.6, attackTime: 42 / 30, hitReach: 0,
  arc: 0.5, power: 0.55, knock: 2.5, knockDown: false, hop: 2.5, reason: 'Slimed by Slomo!',
  projectile: { ...SLUG_BALL, speed: 7, radius: 0.3, range: 11, volley: 3, fan: 0.3, slow: { time: 2.5, slow: 0.5, source: 'slime' },
    muzzle: [0, 0.962, 1.404] },
};
const SLOMO_SUMMON = {
  name: 'summon', clip: 'summon', weight: 2, reach: 14, hitAt: 30 / 30, trackUntil: 0.5, attackTime: 48 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Slomo', cast: 'summon',
  summon: { kind: 'oozeslug', also: 'oozebolime', muzzle: [0, 2.04, 0.043] },
};
const SLOMO_SQUIRTLE = { ...SLOMO_SUMMON, name: 'squirtle', summon: { kind: 'slimesquirtle', muzzle: [0, 2.04, 0.043] } };
export const SLOMO = {
  type: 'slomo', species: 'slomo', label: 'Slomo', hp: 1000, damage: 24, knock: 3,
  xp: 650, coins: [190, 340],
  radius: 1, height: 2.9, bodyHeight: 2.3, mass: 9, slimeborn: true, shell: { parts: ['SlomoSkin'], opacity: 0.55 }, turnSpeed: 1.6, turnStride: 0.9,
  aggro: 8, giveUp: 16, chase: 1.1, wander: 0.5, homeSpeed: 0.8,
  ...SLOMO_ARM, cooldown: 1.3, ichor: ['#b8ff5a', '#3e8a2a'], pitch: 0.55,
  attacks: [SLOMO_ARM, SLOMO_ARM_R, SLOMO_METEOR], phase: 1,
  poise: 2, hitStun: 0.25, deathTime: 2.4, corpseTime: 5,
  parts: { skin: ['SlomoSkin', 'SlomoStalk'], core: ['SlomoCore_glow'], slug: ['SlomoSlug', 'SlomoFoot'], stripes: ['SlomoStripes'] },
  light: '#9aff5a', sparks: ['#e0ffb0', '#b8ff5a', '#6cc23a'],
  style: 'ranged', keep: [3.5, 7], guardian: true, guardianRole: 'descent', boss: 'slomo',
  seedSalt: 0x5105a0, spacing: 6,
};
// ... the slug alone (phase 2), on its legs, leaving a trail of slime
export const SLOMO_SLUG = {
  ...SLOMO, type: 'slomoslug', radius: 0.85, height: 2.3, bodyHeight: 1.6, mass: 9, chase: 1.2, wander: 0.6, gait: 'crawl', trail: '#3e7a2a',
  turnSpeed: 1.3, turnStride: 1,
  ...SLOMO_SPIT, cooldown: 1.1, attacks: [SLOMO_SPIT, SLOMO_SUMMON, SLOMO_SQUIRTLE, { ...SLOMO_FLOOD, clip: 'floodSlug' },
    { ...SLOMO_METEOR, clip: 'meteorSlug', rain: { ...SLOMO_METEOR.rain, count: 5, muzzle: [0, 2.371, 1.167] } }],
  phase: 2, style: 'ranged', keep: [3, 7],
};
// Mansk, the seventh real boss (blender/mansk.py, after the kids' drawing), in place of the descent
// guardian of depth 6 (core/bosses.js): a white mask floating with nobody behind it, a big round
// mouth with darkness behind it, a blue diamond on his forehead and two long wavy beige horns. He
// fights on the stage of a museum
// (cubegen/arenashapes.js `stage`); game/mansk.js runs his fight, core/mansk.js holds its rules.
// He floats (`hover`) and the fight lifts him higher (`lift`: flying, out of a blade's reach) and
// lands him. Phase 1: he breathes in (a `pull`, Gusto's way: game/gusts.js) and what gets to his
// mouth he chews (`spit`, a `grab` that holds it in his mouth, `gulp`: hidden, and bites it) and
// spits out; out of his horns he calls balls of light that hang a moment, then shoot and burst,
// hurting all round (`orbs`, a cast: game/mansk.js); and Tornados. Phase 2 (MANSK_SKY): up in the
// air and down again, more balls and Tornados, and he slows time (`slow`, a cast every game reads
// off his clock). Phase 3 (MANSK_RIBBONS): his horns are broken, red ribbons fly round him
// (core/ribbon.js), the ties of a mask: they catch a player (a `grab`, `ribbons`), squeeze them and let them go; he
// whirls round, the ribbons sweeping all round him.
// Where things are on him (model space: x, up, forward), read off his clips (blender/mansk.py)
const MANSK_AT = Object.freeze({
  mouth: [0.021, 0.972, 0.479],
  gulp: [[0.001, 0.983, 0.18], [0, 0.983, 0.18], [-0.002, 0.984, 0.179], [-0.003, 0.984, 0.176], [-0.003, 0.983, 0.173], [-0.004, 0.953, 0.164],
    [-0.004, 0.906, 0.15], [-0.004, 0.955, 0.155], [-0.004, 0.987, 0.156], [-0.004, 0.991, 0.152], [-0.003, 0.99, 0.148], [-0.002, 0.96, 0.138],
    [-0.001, 0.912, 0.125], [0, 0.962, 0.132], [0.001, 0.994, 0.134], [0.002, 0.996, 0.133], [0.003, 0.997, 0.132], [0.004, 0.972, 0.215],
    [0.005, 0.945, 0.321]],
  tips: [[0.351, 3.503, -0.88], [-0.411, 3.518, -0.831]],
  diamond: [-0.023, 1.919, 0.119],
  summon: [0.033, 0.497, 0.724],
  lash: [[-0.059, 0.503, 2.144], [-0.068, 0.735, 2.105], [-0.058, 1.177, 1.996], [-0.009, 1.428, 2.021], [0.004, 1.418, 1.909], [0.037, 1.418, 1.908],
    [0.062, 1.428, 2.02], [0.07, 1.418, 1.908], [0.06, 1.418, 1.908], [0.034, 1.428, 2.021], [-0.005, 1.418, 1.909], [-0.038, 1.418, 1.901],
    [-0.062, 1.418, 1.9]],
});
// Breathing in: from the hit frame for `pull.time` whoever is in the cone before his mouth is
// pulled in, right up to him; one whose middle gets within MANSK_FIGHT.gulp of his mouth goes in
// (game/mansk.js): the spit. Standing still you are drawn in; running away keeps `hold` of your
// steering, a little faster than he pulls (RUN_SPEED × hold > speed), and stepping out of the cone
// to a side gets you out at once (he stops turning as he starts to suck). Only when due
// (MANSK_FIGHT.inhale), not over and over.
const MANSK_INHALE = {
  name: 'inhale', clip: 'inhale', weight: 3, reach: 6, hitAt: 18 / 30, trackUntil: 18 / 30, attackTime: 96 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Mansk', recover: 0.8,
  pull: { kind: 'inhale', time: 66 / 30, range: 6, width: 0.7, spread: 0.4, speed: 1.5, hold: 0.7, stop: 0.95, muzzle: MANSK_AT.mouth },
};
// ... and what went in: held in his mouth (`gulp`: not seen meanwhile), chewed twice (`bites`, each
// the blow through the armor) and spat out at `throwAt`, knocked down: a lot of damage in all.
// Only a gulp starts it (`weight` 0, no reach).
const MANSK_SPIT = {
  name: 'spit', clip: 'spit', weight: 0, reach: 0, hitAt: 0, trackUntil: 0, attackTime: 54 / 30, hitReach: 0,
  arc: -1, power: 0.9, knock: 0, knockDown: true, hop: 3, reason: 'Chewed and spat out by Mansk!', recover: 0.8,
  grab: { gulp: true, throwAt: 36 / 30, step: 2 / 30, hold: 0.8, throw: 8, bites: [12 / 30, 24 / 30], grip: MANSK_AT.gulp },
};
// balls of light out of his horns (a cast: game/mansk.js makes them at the hit frame): they hang at
// the knobs (and over his diamond) for MANSK_FIGHT.orbs.hang s, then shoot at the player and burst
// where they end, hurting everyone within `blast` (game/projectiles.js)
const MANSK_ORBS = {
  name: 'orbs', clip: 'orbs', weight: 3, reach: 12, hitAt: 24 / 30, trackUntil: 0.6, attackTime: 54 / 30, hitReach: 0,
  arc: -1, power: 0.75, knock: 5, knockDown: false, hop: 3, reason: "Blasted by Mansk's ball of light!", cast: 'orbs',
  orb: { kind: 'hornorb', speed: 8, radius: 0.26, range: 18, blast: 1.6, color: '#8fc8ff', tips: MANSK_AT.tips, diamond: MANSK_AT.diamond },
};
const MANSK_SUMMON = {
  name: 'summon', clip: 'summon', weight: 2, reach: 12, hitAt: 30 / 30, trackUntil: 0.4, attackTime: 48 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Mansk',
  summon: { kind: 'stagetornado', muzzle: MANSK_AT.summon },
};
// time goes slow (a cast): every game slows its own player, his game his Tornados (game/mansk.js)
const MANSK_SLOW = {
  name: 'slow', clip: 'slow', weight: 2, reach: 16, hitAt: 30 / 30, trackUntil: 0.5, attackTime: 54 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Mansk', cast: 'slow',
};
// his ribbons reach out and catch (within hitReach, inside the arc), hold the body up before him
// along `grip` and squeeze it (`bites`), then let it go (`throwAt`)
const MANSK_LASH = {
  name: 'lash', clip: 'lash', weight: 3, reach: 4.2, hitAt: 24 / 30, trackUntil: 20 / 30, attackTime: 84 / 30, hitReach: 4.6,
  arc: 0.3, power: 0.55, knock: 0, knockDown: false, hop: 2, reason: "Squeezed by Mansk's ribbons!",
  grab: { ribbons: true, throwAt: 72 / 30, step: 4 / 30, hold: 0.7, throw: 6, bites: [36 / 30, 48 / 30, 60 / 30], grip: MANSK_AT.lash },
};
const MANSK_WHIRL = {
  name: 'whirl', clip: 'whirl', weight: 2, reach: 3.4, hitAt: 36 / 30, trackUntil: 0.3, attackTime: 72 / 30, hitReach: 4,
  arc: -1, power: 0.8, knock: 8, knockDown: true, hop: 4, reason: "Swept away by Mansk's ribbons!",
};
export const MANSK = {
  type: 'mansk', species: 'mansk', label: 'Mansk', hp: 1000, damage: 24, knock: 3,
  xp: 700, coins: [180, 320],
  radius: 0.7, height: 3.6, bodyHeight: 2.1, mass: 7, hover: true,
  aggro: 7, giveUp: 14, chase: 1.5, wander: 0.4, homeSpeed: 0.9,
  ...MANSK_ORBS, cooldown: 1.2, ichor: ['#ffffff', '#9ac8ff'], pitch: 0.65,
  attacks: [MANSK_INHALE, MANSK_SPIT, MANSK_ORBS, MANSK_SUMMON], phase: 1,
  poise: 2, hitStun: 0.25, deathTime: 2.4, corpseTime: 5,
  parts: { head: ['ManskHead'], horns: ['ManskHorns'], diamond: ['ManskDiamond_glow'] },
  light: '#6fb4ff', sparks: ['#ffffff', '#bfe0ff', '#6fb4ff'],
  style: 'ranged', keep: [3, 6.5], guardian: true, guardianRole: 'descent', boss: 'mansk',
  seedSalt: 0x3a45c0, spacing: 6,
};
// ... flying (phase 2): up and down, time slowed now and then; three balls at once
export const MANSK_SKY = {
  ...MANSK, type: 'manskflying', chase: 1.8, cooldown: 1.1,
  attacks: [MANSK_INHALE, MANSK_SPIT, MANSK_ORBS, MANSK_SUMMON, MANSK_SLOW], phase: 2,
};
// ... his horns broken, his ribbons out (phase 3)
export const MANSK_RIBBONS = {
  ...MANSK, type: 'manskribbons', chase: 1.9, cooldown: 1,
  ...MANSK_LASH, attacks: [MANSK_INHALE, MANSK_SPIT, MANSK_LASH, MANSK_WHIRL, MANSK_SUMMON, MANSK_SLOW], phase: 3,
  style: 'brute', ribbons: true,
};
// Monteur, the eighth real boss (blender/monteur.py, after the kids' drawing), in place of the descent
// guardian of depth 7, the first of act II (core/bosses.js): a moose of stone with stones floating
// between his antlers (phase 1), who crumbles into a sun of stone with antlers all round it like
// rays, on two legs (phase 2, MONTEUR_SUN). One model holds both forms (render/monteurview.js).
// game/monteur.js runs his fight, core/monteur.js holds its rules. Twice the health of a boss of
// his level (hp 2000 grows like the descent tier's 1000), half a phase.
// He throws his stones (a `projectile` that takes `stones` of them: one, or three fanned out; they
// grow back, game/monteur.js) and charges you with his head (a `roll` along his heading, run
// straight at you, steering little; one that runs into something with nobody run over `crash`es
// into his `stuck`: dazed, every blow hurting him double); he keeps his distance for both (`ranged`,
// `keep`). Moose come up out of the floor round him. As the sun
// he rolls at you instead, makes stones rain out of the sky round you (`rain`, game/meteors.js,
// `look` 'stone') and turns the world (`spin`, a cast: game/roll.js turns every game's view).
// Where things are on him (model space: x, up, forward), read off his clips (blender/monteur.py)
const MONTEUR_AT = Object.freeze({
  throw: [0, 2.917, 1.512], sunThrow: [0, 2.572, 0.649], summon: [0, 0.093, 1.526], sunSummon: [0, 0.183, 1.1], rain: [0, 2.604, 0],
});
const MONTEUR_THROW = {
  name: 'throw', clip: 'throw', weight: 3, reach: 10, hitAt: 21 / 30, trackUntil: 0.6, attackTime: 39 / 30, hitReach: 0,
  arc: 0.5, power: 0.7, knock: 4, knockDown: false, hop: 3, reason: "Hit by Monteur's stone!",
  projectile: { kind: 'stone', speed: 9, radius: 0.22, range: 14, spin: 7, tumble: 5, stones: 1, muzzle: MONTEUR_AT.throw },
};
const MONTEUR_VOLLEY = {
  ...MONTEUR_THROW, name: 'volley', weight: 2, power: 0.55,
  projectile: { ...MONTEUR_THROW.projectile, volley: 3, fan: 0.28, stones: 3 },
};
const MONTEUR_CHARGE = {
  name: 'charge', clip: 'charge', weight: 3, reach: 9, minReach: 2.5, hitAt: 27 / 30, trackUntil: 27 / 30, attackTime: 72 / 30, hitReach: 0,
  arc: 0.5, power: 1.1, knock: 8, knockDown: true, hop: 4, reason: 'Rammed by Monteur!',
  roll: { from: 27 / 30, to: 60 / 30, speed: 9, steer: 0.45, bounces: 0, reach: 0.3, crash: 'stuck' }, steady: { from: 27 / 30, to: 60 / 30 },
};
// (only a charge that runs into something starts it)
const MONTEUR_STUCK = {
  name: 'stuck', clip: 'stuck', weight: 0, reach: 0, hitAt: 66 / 30, trackUntil: 0, attackTime: 66 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Monteur', recover: 0.6,
  exposed: { from: 0.1, until: 1.7, damage: 2, thud: true, say: msg('{name} crashed! Hit him while he is dazed') },
};
const MONTEUR_SUMMON = {
  name: 'summon', clip: 'summon', weight: 2, reach: 12, hitAt: 30 / 30, trackUntil: 0.5, attackTime: 45 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Monteur',
  summon: { kind: 'montmoose', muzzle: MONTEUR_AT.summon },
};
export const MONTEUR = {
  type: 'monteur', species: 'monteur', label: 'Monteur', hp: 2000, damage: 24, knock: 4,
  xp: 750, coins: [200, 340],
  radius: 0.9, height: 3.4, bodyHeight: 2.1, mass: 14, turnSpeed: 2.4,
  aggro: 9, giveUp: 18, chase: 1.15, wander: 0.5, homeSpeed: 0.8,
  ...MONTEUR_THROW, cooldown: 1.2, ichor: ['#d8d0c0', '#6a645a'], pitch: 0.5,
  attacks: [MONTEUR_THROW, MONTEUR_VOLLEY, MONTEUR_CHARGE, MONTEUR_STUCK, MONTEUR_SUMMON], phase: 1,
  poise: 2, hitStun: 0.2, deathTime: 2.4, corpseTime: 5,
  parts: { stone: ['MonteurStone'], antlers: ['MonteurAntlers'], moss: ['MonteurMoss'], eyes: ['MonteurEyes_glow'], veins: ['MonteurVeins_glow'] },
  light: '#ff8a3a', sparks: ['#ffe8c0', '#ffb347', '#c8c0b0'],
  style: 'ranged', keep: [3.5, 7], guardian: true, guardianRole: 'descent', boss: 'monteur',
  seedSalt: 0x3047e0, spacing: 6,
};
// ... the sun (phase 2): on two legs; rolls at you, rains stones, turns the world
const SUN_THROW = { ...MONTEUR_THROW, clip: 'sunThrow', hitAt: 18 / 30, attackTime: 33 / 30, trackUntil: 0.5,
  projectile: { ...MONTEUR_THROW.projectile, muzzle: MONTEUR_AT.sunThrow } };
const SUN_VOLLEY = { ...MONTEUR_VOLLEY, clip: 'sunThrow', hitAt: 18 / 30, attackTime: 33 / 30, trackUntil: 0.5,
  projectile: { ...MONTEUR_VOLLEY.projectile, muzzle: MONTEUR_AT.sunThrow } };
const SUN_ROLL = { ...MONTEUR_CHARGE, clip: 'roll', reason: 'Run over by Monteur!', roll: { ...MONTEUR_CHARGE.roll, speed: 9.5, steer: 0.5 } };
const SUN_STUCK = { ...MONTEUR_STUCK, clip: 'sunStuck', hitAt: 60 / 30, attackTime: 60 / 30, exposed: { ...MONTEUR_STUCK.exposed, until: 1.5 } };
const SUN_SUMMON = { ...MONTEUR_SUMMON, clip: 'sunSummon', hitAt: 27 / 30, attackTime: 42 / 30, summon: { ...MONTEUR_SUMMON.summon, muzzle: MONTEUR_AT.sunSummon } };
// (stones out of the sky: `count` of them, the first on the player and the rest `spread` cells round
// them, `stagger` s apart, each hitting with `power` of his damage; `look`: stones, not slime)
const MONTEUR_RAIN = {
  name: 'rain', clip: 'rain', weight: 2, reach: 16, hitAt: 33 / 30, trackUntil: 0.6, attackTime: 54 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Monteur', cast: 'rain',
  rain: { count: 10, spread: [1, 5], stagger: 0.16, power: 0.55, reason: "Hit by Monteur's falling stone!", muzzle: MONTEUR_AT.rain, look: 'stone' },
};
// the world turns (game/monteur.js picks how far, game/roll.js turns it)
const MONTEUR_SPIN = {
  name: 'spin', clip: 'spin', weight: 1, reach: 40, hitAt: 36 / 30, trackUntil: 0.3, attackTime: 60 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Monteur', cast: 'spin',
};
export const MONTEUR_SUN = {
  ...MONTEUR, type: 'monteursun', height: 3.3, bodyHeight: 2.4, chase: 1.3, cooldown: 1.1, gait: 'sun',
  ...SUN_THROW, attacks: [SUN_THROW, SUN_VOLLEY, SUN_ROLL, SUN_STUCK, SUN_SUMMON, MONTEUR_RAIN, MONTEUR_SPIN], phase: 2,
};
// Qualmos, the boss at the core of the world (depth 20, core/bosses.js; modelled by hand after a
// child's drawing, blender/qualmos.blend, exported by blender/qualmos.py): a slender blue-green
// amphibian on six tentacles, with spines and a toothy grin. He waits alone in the core's last cube,
// with no way on (world/layout.js); game/qualmos.js runs his fight, core/qualmos.js holds its
// rules: five phases, each bringing attacks of its own (QUALMOS_PHASES), a rage between them.
// His blows are the shared enemy AI's: tentacle sweeps and slams, a leap (`lunge`), a jet and a
// wave that push (`gust`), an undertow that pulls (`pull`), ink that slows and spines
// (`projectile`); after his belly flop he lies `exposed` and takes more. Twice Slomo's health at
// his level (6760 at level 22).
const qualmosBlow = (name, attackTime, hitAt, more = {}) => ({
  name, clip: name, weight: 1, reach: 3.2, hitAt, trackUntil: Math.max(0.1, hitAt - 0.45), attackTime, hitReach: 3.5,
  arc: 0.25, power: 1, knock: 4, knockDown: false, hop: 3, reason: 'Hit by Qualmos!', ...more,
});
const QUALMOS_ATTACKS = [
  qualmosBlow('whip', 1.8, 1.05, { hitReach: 3.6, arc: -0.1 }),
  qualmosBlow('grab', 2.2, 0.95, { reach: 2.5, hitReach: 2.9, power: 1.1, knockDown: true, recover: 1.8 }),
  qualmosBlow('doubleSlam', 2.2, 1.2, { arc: -0.2, power: 1.2, knockDown: true }),
  qualmosBlow('waterJet', 3.2, 1.2, { reach: 8, minReach: 2, hitReach: 0, power: 0.7, reason: 'Soaked by Qualmos!',
    gust: { kind: 'jet', thunder: [], time: 1.1, range: 8.5, width: 0.35, spread: 0.12, push: 7, pushTime: 0.4, muzzle: [0, 2.6, 0.36] } }),
  qualmosBlow('dive', 2.8, 1.5, { reach: 6, hitReach: 3, power: 1.15, knockDown: true, lunge: { from: 0.8, to: 1.4, max: 3.5, stop: 1.4 } }),
  qualmosBlow('inkBurst', 2.4, 1.3, { reach: 7, minReach: 2.5, hitReach: 0, power: 0.6, reason: 'Inked by Qualmos!',
    projectile: { kind: 'slimeball', speed: 6, radius: 0.22, range: 9, muzzle: [0, 2.6, 0.35], slow: { time: 1.5, slow: 0.65, source: 'slime' } } }),
  qualmosBlow('tailSpin', 2.4, 1.3, { arc: -1, hitReach: 3.6, power: 1.15, knockDown: true }),
  qualmosBlow('undertow', 3, 1, { reach: 7, hitReach: 0, power: 0,
    pull: { time: 1.3, range: 7.5, width: 0.6, spread: 0.35, speed: 2.8, hold: 0.7, stop: 2.2, muzzle: [0, 1, 0.4] } }),
  qualmosBlow('spikeVolley', 2.8, 1.2, { reach: 9, minReach: 2, hitReach: 0, power: 0.5, reason: "Hit by Qualmos's spine!",
    projectile: { kind: 'iceball', speed: 8, radius: 0.15, range: 11, volley: 3, fan: 0.22, muzzle: [0, 2.9, 0.2] } }),
  qualmosBlow('tidalSurge', 3.2, 1.7, { reach: 8, hitReach: 0, power: 0.9, reason: 'Soaked by Qualmos!',
    gust: { kind: 'jet', thunder: [], time: 0.8, range: 9, width: 1.1, spread: 0.22, push: 9, pushTime: 0.5, muzzle: [0, 1.2, 0.5] } }),
  qualmosBlow('bellyFlop', 4.5, 2.3, { reach: 4.5, hitReach: 4.6, arc: -1, power: 1.5, knockDown: true,
    exposed: { from: 2.65, until: 3.7, damage: 1.5 }, recover: 2.2 }),
  // between phases (`weight` 0: only game/qualmos.js starts it), nothing hurting him (`ward`)
  qualmosBlow('rage', 2.5, 2, { weight: 0, reach: 0, hitReach: 0, power: 0, ward: true }),
];
export const QUALMOS = {
  type: 'qualmos', species: 'qualmos', label: 'Qualmos',
  // (twice Slomo's health at his level, 15, grown to Qualmos's, 22: 6760)
  hp: 2 * SLOMO.hp * (1 + GROWTH.hp * 14) / (1 + GROWTH.hp * 21), damage: 19, knock: 4,
  xp: 1000, coins: [250, 450],
  radius: 0.65, height: 3.35, bodyHeight: 2.4, mass: 10, swims: true,
  aggro: 9, giveUp: 20, chase: 1.3, wander: 0.35, homeSpeed: 0.8,
  ...QUALMOS_ATTACKS[0], reach: Math.max(...QUALMOS_ATTACKS.map(a => a.reach)), cooldown: 1.5, attacks: QUALMOS_ATTACKS,
  ichor: ['#6be8bd', '#246b98'], pitch: 0.65,
  poise: 2, hitStun: 0.2, deathTime: 2.5, corpseTime: 5, steadfast: true,
  parts: { skin: ['QualmosSkin'], belly: ['QualmosBelly'], spines: ['QualmosSpines'], suckers: ['QualmosSuckers'], eyes: ['QualmosEyes_glow'] },
  light: '#73ffe0', sparks: ['#e0fff6', '#73ffe0', '#246b98'],
  style: 'brute', guardian: true, guardianRole: 'descent', boss: 'qualmos',
  seedSalt: 0xa6f1b1, spacing: 6,
};
export const BOSS_PROFILES = [GUSTO, TOTNAR, SQUARLO, FLIP, FOGGERY, RENEW, SLOMO, MANSK, MONTEUR, QUALMOS];

// What an enemy kind is called, as words to say in any language (src/i18n/i18n.js say): its kind's
// noun ('Spider', a Spinne in German), a boss's name, a guardian's 'Guardian Spider' or 'Temp
// Boss Spider', a bounty's own (core/bounties.js). `label` stays the English name.
export function enemyWords(k) {
  if (!k) return '';
  if (k.words) return k.words;
  if (k.boss) return noun(k.label, { proper: true });
  if (k.baseLabel) return { t: k.guardianRole === 'descent' ? msg('Temp Boss {kind}') : msg('Guardian {kind}'),
    p: { kind: noun(k.baseLabel, { caps: true }) }, of: 'kind', caps: true };
  return noun(k.label, { caps: true });
}
export const enemyName = k => say(enemyWords(k));
// the plural ('Spiders'), for a kind of the roster
export const enemiesName = k => form(enemyWords(k), 'pl');
// what a ranged attack sends out: its projectile, its beam or its gust (null for a blow)
export const shotOf = a => a.projectile ?? a.beam ?? a.gust ?? a.twister ?? null;

// Enemy kinds: a species' base profile with its own name, colours and strength, drawn with
// the species' model.
//   colors: role (or material name) -> recolour op, see recolorFn in core/oklch.js
//   light / sparks / ichor: the glow light, the ember and trail colours, the blood
//   toxin: its bites poison ({ time, ticks, share }: share of the bite's damage, core/status.js)
//   fireproof: fire does not hurt it (a fire flask, core/status.js; the fiery species are)
//   mods: multiply the base. hp and damage (their growth per level follows), speed (chase,
//     wander, homing), size (model, body and melee reach), xp (xp and coins; √(hp × damage)
//     unless given, so a kind pays for its toughness without inflating XP per cube much)
// Anything else replaces the base value. A kind keeps its species' seedSalt, so where an
// enemy stands, its level and its id do not depend on which kind it drew.
const times = (v, k) => Math.round(v * k);
// `attacks` (a list like the base's) replaces the species' attacks before they are sized: a kind
// that throws something else, say.
// learn: enemies.html#kinds (see learn/README.md)
export function enemyKind(base, { mods = {}, attacks = base.attacks, ...spec }) {
  const { hp = 1, damage = 1, speed = 1, size = 1 } = mods, xp = mods.xp ?? Math.sqrt(hp * damage);
  const reach = a => a.hitReach * size;
  const thrown = p => ({ ...p, muzzle: p.muzzle.map(v => v * size), ...(p.hands && { hands: p.hands.map(h => h.map(v => v * size)) }) });
  // a melee attack's own reach grows with the body; a throw's (or a beam's) stays
  const sized = a => ({ ...a, hitReach: reach(a), ...(a.reach !== undefined && !shotOf(a) && { reach: a.reach * size }),
    ...(a.projectile && { projectile: thrown(a.projectile) }), ...(a.beam && { beam: thrown(a.beam) }),
    ...(a.gust && { gust: thrown(a.gust) }), ...(a.twister && { twister: thrown(a.twister) }) });
  const list = attacks && attacks.map(sized);
  const own = list?.some(a => a.reach !== undefined);
  return {
    ...base,
    hp: times(base.hp, hp), damage: times(base.damage, damage),
    xp: times(base.xp, xp), coins: base.coins.map(c => times(c, xp)),
    chase: base.chase * speed, wander: base.wander * speed, homeSpeed: base.homeSpeed * speed,
    size: (base.size ?? 1) * size, radius: base.radius * size, height: base.height * size, bodyHeight: base.bodyHeight * size,
    reach: own ? Math.max(...list.map(a => a.reach ?? 0)) : shotOf(base) ? base.reach : base.reach * size, hitReach: reach(base),
    ...(list && { attacks: list }),
    ...(base.projectile && { projectile: thrown(base.projectile) }),
    ...(base.beam && { beam: thrown(base.beam) }),
    ...(base.gust && { gust: thrown(base.gust) }),
    ...(base.twister && { twister: thrown(base.twister) }),
    ...(base.wheel && { wheel: base.wheel * size }),
    ...spec,
  };
}
// Three snakes in rising strength: green, ochre, red.
export const SAND_VIPER = enemyKind(SNAKE, {
  type: 'sandviper', label: 'Sand viper', reason: 'Bitten by a Sand viper!',
  colors: paints({ skin: 'ochre.light', eyes: 'eyes.ember' }), ichor: ['#d9c46a', '#8a6a22'],
  mods: { hp: 1.25, damage: 1.2, speed: 1.1 },
});
// learn: enemies.html#kind-code #kinds (see learn/README.md)
export const BLOOD_VIPER = enemyKind(SNAKE, {
  type: 'bloodviper', label: 'Blood viper', reason: 'Bitten by a Blood viper!',
  colors: paints({ skin: 'crimson.mid', eyes: 'eyes.sun' }), ichor: ['#e0503a', '#6a1410'],
  mods: { hp: 1.4, damage: 1.4, speed: 1.2, size: 1.1 },
});
// Three more for the themes: a slow, tough one in the ice, a venomous one in the swamp and a
// near-black one, the strongest, in the ruins and the volcanic depths.
export const FROST_ADDER = enemyKind(SNAKE, {
  type: 'frostadder', label: 'Frost adder', reason: 'Bitten by a Frost adder!',
  colors: paints({ skin: 'frost.pale@+10', eyes: 'eyes.ice' }), ichor: ['#c4ecff', '#4f8fbf'],
  mods: { hp: 1.35, damage: 1.1, speed: 0.95 },
});
export const VENOM_ADDER = enemyKind(SNAKE, {
  type: 'venomadder', label: 'Venom adder', reason: 'Bitten by a Venom adder!', toxin: { time: 5, ticks: 5, share: 0.7 },
  colors: paints({ skin: 'violet.mid', eyes: 'eyes.sun' }), ichor: ['#c6ff5a', '#5a8f12'],
  mods: { hp: 1.2, damage: 1.35, speed: 1.1 },
});
export const SHADOW_MAMBA = enemyKind(SNAKE, {
  type: 'shadowmamba', label: 'Shadow mamba', reason: 'Bitten by a Shadow mamba!',
  colors: paints({ skin: 'ink.dark', eyes: 'eyes.ember' }), ichor: ['#9a6ad8', '#2a1648'],
  mods: { hp: 1.6, damage: 1.6, speed: 1.3, size: 1.15 },
});
export const FROST_SPIDER = enemyKind(SPIDER, {
  type: 'frostspider', label: 'Frost spider',
  colors: paints({ body: 'frost.pale', eyes: 'eyes.ice' }), ichor: ['#c4ecff', '#4f8fbf'],
  mods: { hp: 1.35, damage: 1.1, speed: 0.9 },
});
export const BOG_SPIDER = enemyKind(SPIDER, {
  type: 'bogspider', label: 'Bog spider', toxin: { time: 4, ticks: 4, share: 0.5 },
  colors: paints({ body: 'moss.deep', eyes: 'eyes.sun' }),
  mods: { hp: 1.15, damage: 1.25, speed: 1.05 },
});
// the dark forest's: deep violet, pale eyes in the dark
export const GLOOM_SPIDER = enemyKind(SPIDER, {
  type: 'gloomspider', label: 'Gloom spider', reason: 'Bitten by a Gloom spider!',
  colors: paints({ body: 'violet.deep', eyes: 'eyes.ice' }), ichor: ['#d6a8ff', '#4a2a7a'],
  mods: { hp: 0.95, damage: 0.95, speed: 1.1 },
});
export const REDBACK = enemyKind(SPIDER, {
  type: 'redback', label: 'Redback', reason: 'Bitten by a Redback!', toxin: { time: 5, ticks: 5, share: 0.6 },
  colors: paints({ body: 'crimson.deep', eyes: 'eyes.sun' }), ichor: ['#d8442e', '#5a1008'],
  mods: { hp: 1.3, damage: 1.4, speed: 1.2, size: 1.1 },
});
export const FROST_STUNDER = enemyKind(STUNDER, {
  type: 'froststunder', label: 'Frost stunder', reason: 'Rammed by a Frost stunder!',
  colors: paints({ skin: 'frost.pale@-8', eyes: 'eyes.ice' }), ichor: ['#c4ecff', '#4f8fbf'],
  mods: { hp: 1.25, speed: 0.9 },
});
export const STONE_STUNDER = enemyKind(STUNDER, {
  type: 'stonestunder', label: 'Stone stunder', reason: 'Rammed by a Stone stunder!',
  colors: paints({ skin: 'stone.mid', eyes: 'eyes.sun' }), ichor: ['#b8a890', '#5a4a3a'],
  mods: { hp: 1.6, damage: 1.15, speed: 0.85, size: 1.12 },
});
export const MAGMA_STUNDER = enemyKind(STUNDER, {
  type: 'magmastunder', label: 'Magma stunder', reason: 'Rammed by a Magma stunder!', fireproof: true,
  colors: paints({ skin: 'crimson.dark', eyes: 'eyes.ember' }), ichor: ['#ffb030', '#a02a10'],
  mods: { hp: 1.35, damage: 1.4, speed: 1.15 },
});
export const BOG_OCTONAUT = enemyKind(OCTONAUT, {
  type: 'bogoctonaut', label: 'Bog octonaut',
  colors: paints({ skin: 'moss.light@+8', eyes: 'eyes.sun' }), ichor: ['#b4e67e', '#4f8f2a'],
  mods: { hp: 1.2, damage: 1.15 },
});
export const CORAL_OCTONAUT = enemyKind(OCTONAUT, {
  type: 'coraloctonaut', label: 'Coral octonaut',
  colors: paints({ skin: 'crimson.light@+8', eyes: 'eyes.ice' }), ichor: ['#ff9a7a', '#a0402a'],
  mods: { hp: 1.3, damage: 1.35, speed: 1.2 },
});
export const EMERALD_TRIANGLE = enemyKind(TRIANGLE, {
  type: 'emeraldtriangle', label: 'Emerald triangle', reason: 'Punched by an Emerald triangle!',
  colors: paints({ glow: 'jade.glow', eyes: 'eyes.bone' }), light: '#40e890', sparks: ['#c8ffd8', '#40d080'],
  ichor: ['#a8ffc8', '#1e9a5a'], mods: { hp: 1.25, damage: 1.1 },
});
export const CRIMSON_TRIANGLE = enemyKind(TRIANGLE, {
  type: 'crimsontriangle', label: 'Crimson triangle', reason: 'Punched by a Crimson triangle!',
  colors: paints({ glow: 'crimson.glow', eyes: 'eyes.bone' }), light: '#ff4836', sparks: ['#ffc0b0', '#ff4836'],
  ichor: ['#ffa08a', '#a01a10'], mods: { hp: 1.35, damage: 1.35 }, cooldown: TRIANGLE.cooldown * 0.8,
});
// The Shraps of the volcanic depths: red, with a head of fire instead of ice, and it throws
// fireballs (the Fire-face's, burn included) instead of ice balls. `fx` picks its glow in
// render/enemies.js: a light, flickering flame tongues and embers.
export const FIRE_SHRAPS = enemyKind(SHRAPS, {
  type: 'fireshraps', label: 'Fire shraps', reason: 'Pinched by a Fire shraps!', fireproof: true,
  colors: paints({ shell: 'crimson.mid', eyes: 'eyes.sun' }), hide: ICE_HEAD, fx: 'fireshraps',
  attacks: [{ ...SHRAPS_PINCH, reason: 'Pinched by a Fire shraps!' }, { ...SHRAPS_THROW, reason: 'Scorched by a Fire shraps!',
    projectile: { ...FIREFACE.projectile, speed: 6.5, range: 7, muzzle: SHRAPS_THROW.projectile.muzzle } }],
  ichor: ['#ffb030', '#a02a10'], pitch: 0.9, mods: { hp: 1.45, damage: 1.4, speed: 1.1 },
});
// The Wollas: blue, then green in the swamp, purple in the mines and the ruins, orange in the
// volcanic depths, each stronger than the one before. Their eyes take the opposite colour.
export const BOG_WOLLA = enemyKind(WOLLA, {
  type: 'bogwolla', label: 'Bog wolla', reason: 'Blown away by a Bog wolla!',
  colors: paints({ waves: 'moss.mid', eyes: 'eyes.ember' }), ichor: ['#b4f08a', '#3f8f2a'], trail: '#4f7a34',
  mods: { hp: 1.2, damage: 1.15 },
});
export const STORM_WOLLA = enemyKind(WOLLA, {
  type: 'stormwolla', label: 'Storm wolla', reason: 'Blown away by a Storm wolla!',
  colors: paints({ waves: 'violet.mid', eyes: 'eyes.sun' }), ichor: ['#d6a8ff', '#5a2ca0'], trail: '#5a3f86',
  mods: { hp: 1.3, damage: 1.3, speed: 1.1, size: 1.08 },
});
export const EMBER_WOLLA = enemyKind(WOLLA, {
  type: 'emberwolla', label: 'Ember wolla', reason: 'Blown away by an Ember wolla!', fireproof: true,
  colors: paints({ waves: 'ember.mid', eyes: 'eyes.ice' }), ichor: ['#ffc07a', '#a0480f'], trail: '#7a4a24',
  mods: { hp: 1.45, damage: 1.4, speed: 1.1, size: 1.12 },
});
// The Squirtles of the lava (the volcanic caves and the abyss): tougher and quicker; lava does not
// burn them, nor fire.
export const LAVA_SQUIRTLE = enemyKind(SQUIRTLE, {
  type: 'lavasquirtle', label: 'Lava squirtle', reason: 'Splashed by a Lava squirtle!',
  attacks: squirtleAttacks('Splashed by a Lava squirtle!'), dwells: [LAVA], lavaproof: true, fireproof: true, trail: '#a0401c',
  colors: paints({ body: 'crimson.mid@+10', eyes: 'ochre.pale' }), ichor: ['#ffc0a8', '#b0402a'],
  mods: { hp: 1.5, damage: 1.4, speed: 1.1 },
});
// Every species comes in at least three ordinary kinds. The fire species burn hotter the deeper
// they live: orange, then yellow, then blue.
export const BLAZE_FACE = enemyKind(FIREFACE, {
  type: 'blazeface', label: 'Blaze-face', reason: 'Scorched by a Blaze-face!',
  colors: paints({ flame: 'ochre.glow', eyes: 'eyes.bone' }), light: '#ffc23a', sparks: ['#fff3b0', '#ffd84a', '#ffa82a'],
  ichor: ['#fff0a0', '#d08a1a'], mods: { hp: 1.25, damage: 1.2 },
});
// the dark forest's (act I): a little teal lantern of a face, weak, far from the fires below
export const LANTERN_FACE = enemyKind(FIREFACE, {
  type: 'lanternface', label: 'Lantern-face', reason: 'Scorched by a Lantern-face!',
  colors: paints({ flame: 'jade.glow', eyes: 'eyes.bone' }), light: '#5affc8', sparks: ['#d8fff0', '#7af0d8', '#3ac8a0'],
  ichor: ['#c8fff0', '#1e8a6a'], mods: { hp: 0.45, damage: 0.5, speed: 0.85, size: 0.85 },
});
export const WISP_FACE = enemyKind(FIREFACE, {
  type: 'wispface', label: 'Wisp-face', reason: 'Scorched by a Wisp-face!',
  colors: paints({ flame: 'azure.glow', eyes: 'eyes.bone' }), light: '#5a8cff', sparks: ['#e4f0ff', '#8ab8ff', '#4a6cff'],
  ichor: ['#c8dcff', '#3a4ab0'], mods: { hp: 1.5, damage: 1.45, speed: 1.1 },
});
export const ASH_CAT = enemyKind(FIRECAT, {
  type: 'ashcat', label: 'Ash cat', reason: 'Bitten by an Ash cat!',
  colors: paints({ fur: 'stone.mid', flame: 'crimson.glow', eyes: 'eyes.ember' }), light: '#ff4a30', sparks: ['#ffb4a0', '#ff5a3a', '#c02a1a'],
  ichor: ['#d8d0c8', '#5a524c'], mods: { hp: 1.2, damage: 1.15 },
});
export const VOID_CAT = enemyKind(FIRECAT, {
  type: 'voidcat', label: 'Void cat', reason: 'Bitten by a Void cat!',
  colors: paints({ fur: 'ink.dark', flame: 'azure.glow', eyes: 'eyes.ice' }), light: '#5a8cff', sparks: ['#e4f0ff', '#8ab8ff', '#4a6cff'],
  ichor: ['#8ab8ff', '#1a1a3a'], mods: { hp: 1.5, damage: 1.45, speed: 1.1 },
});
// the Shraps of the crystal mines: its ice head is amethyst, and so is what it throws (it still chills)
export const AMETHYST_SHRAPS = enemyKind(SHRAPS, {
  type: 'amethystshraps', label: 'Amethyst shraps', reason: 'Pinched by an Amethyst shraps!',
  colors: paints({ shell: 'violet.deep', ice: 'violet.light', eyes: 'eyes.sun' }), light: '#b07aff', sparks: ['#ffffff', '#e2ccff', '#a87aff'],
  attacks: [{ ...SHRAPS_PINCH, reason: 'Pinched by an Amethyst shraps!' }, { ...SHRAPS_THROW, reason: 'Hit by an amethyst!' }],
  ichor: ['#d6b8ff', '#5a2ca0'], mods: { hp: 1.3, damage: 1.25 },
});
// the Spicies: a hotter one in the honey hive, a poisonous one in the nests
export const HABANERO = enemyKind(SPICY, {
  type: 'habanero', label: 'Habanero', reason: 'Blasted by a Habanero!',
  colors: paints({ body: 'ember.mid', glow: 'ochre.glow', wheels: 'ink.dark', eyes: 'eyes.sun' }), beamColor: '#ff8a2a',
  ichor: ['#ffb070', '#a0400f'], mods: { hp: 1.25, damage: 1.3 },
});
export const NIGHTSHADE = enemyKind(SPICY, {
  type: 'nightshade', label: 'Nightshade', reason: 'Blasted by a Nightshade!', toxin: { time: 4, ticks: 4, share: 0.5 },
  colors: paints({ body: 'violet.deep', glow: 'violet.glow', wheels: 'ink.dark', eyes: 'eyes.sun' }), beamColor: '#b46aff',
  ichor: ['#d6a8ff', '#4a1a80'], mods: { hp: 1.4, damage: 1.35 },
});
// the Wolks: a dust cloud over the badlands and the canyon, a dark storm cloud with violet lightning
export const DUST_WOLK = enemyKind(WOLK, {
  type: 'dustwolk', label: 'Dust wolk', reason: 'Struck by a Dust wolk!',
  colors: paints({ body: 'ochre.pale', limbs: 'ochre.deep' }), gloom: { color: paint('stone.deep'), parts: ['body'] },
  ichor: ['#efe0b8', '#8a7040'], mods: { hp: 1.2, damage: 1.15 },
});
export const STORM_WOLK = enemyKind(WOLK, {
  type: 'stormwolk', label: 'Storm wolk', reason: 'Struck by a Storm wolk!',
  colors: paints({ body: 'ink.mid', limbs: 'violet.deep' }), gloom: { color: paint('ink.dark'), parts: ['body'] }, beamColor: '#e0ccff',
  ichor: ['#c4c4d4', '#3a3a4a'], mods: { hp: 1.3, damage: 1.3, speed: 1.1 },
});
// the Squirtles of the slime (the slime marsh's acid)
export const TOXIC_SQUIRTLE = enemyKind(SQUIRTLE, {
  type: 'toxicsquirtle', label: 'Toxic squirtle', reason: 'Splashed by a Toxic squirtle!', dwells: [ACID],
  attacks: squirtleAttacks('Splashed by a Toxic squirtle!'), trail: '#5f9a34',
  colors: paints({ body: 'moss.mid', eyes: 'ochre.pale' }), ichor: ['#c8f0a0', '#4f8f2a'],
  mods: { hp: 1.2, damage: 1.15 },
});
// The Meckeds: a pale blue one in the frozen caves, a dark green one in the swamp and the cenote
// whose bites poison, and a bone-white one, the strongest, in the nests and the ossuary.
const meckedAttacks = (bite, chew, more = {}) => [{ ...MECKED_BITE, reason: bite, ...more }, { ...MECKED_GRAB, reason: chew, ...more }];
export const FROST_MECKED = enemyKind(MECKED, {
  type: 'frostmecked', label: 'Frost mecked', reason: 'Bitten by a Frost mecked!',
  attacks: meckedAttacks('Bitten by a Frost mecked!', 'Chewed on by a Frost mecked!'),
  colors: paints({ skin: 'frost.light', belly: 'frost.pale@+8', eyes: 'eyes.ember' }), ichor: ['#c4ecff', '#4f8fbf'],
  mods: { hp: 1.3, damage: 1.1, speed: 0.9 },
});
export const BOG_MECKED = enemyKind(MECKED, {
  type: 'bogmecked', label: 'Bog mecked', reason: 'Bitten by a Bog mecked!', toxin: { time: 4, ticks: 4, share: 0.5 },
  attacks: meckedAttacks('Bitten by a Bog mecked!', 'Chewed on by a Bog mecked!'),
  colors: paints({ skin: 'moss.deep', belly: 'moss.light', eyes: 'eyes.sun' }), ichor: ['#b4e67e', '#3f6f1a'],
  mods: { hp: 1.25, damage: 1.25, speed: 1.05 },
});
export const BONE_MECKED = enemyKind(MECKED, {
  type: 'bonemecked', label: 'Bone mecked', reason: 'Bitten by a Bone mecked!',
  attacks: meckedAttacks('Bitten by a Bone mecked!', 'Chewed on by a Bone mecked!'),
  colors: paints({ skin: 'stone.pale', belly: 'stone.light', eyes: 'eyes.ember' }), ichor: ['#efe6cf', '#8a8070'],
  mods: { hp: 1.5, damage: 1.45, speed: 1.15, size: 1.1 },
});
// The Bolimes of the slime marsh: the plain lime one, a yellow Toxic bolime whose slime poisons
// as it digests, and a Glow bolime, the strongest, that glows from inside.
const bolimeAttacks = (swallowed, digested, more = {}) => [{ ...BOLIME_POUNCE, reason: swallowed, engulf: { ...BOLIME_POUNCE.engulf, reason: digested }, ...more }];
export const TOXIC_BOLIME = enemyKind(BOLIME, {
  type: 'toxicbolime', label: 'Toxic bolime', reason: 'Swallowed by a Toxic bolime!', toxin: { time: 3, ticks: 3, share: 0.5 },
  attacks: bolimeAttacks('Swallowed by a Toxic bolime!', 'Digested by a Toxic bolime!'),
  colors: paints({ skin: 'ochre.light', core: 'crimson.deep' }), ichor: ['#e8f060', '#8a7a20'],
  mods: { hp: 1.2, damage: 1.15 },
});
export const GLOW_BOLIME = enemyKind(BOLIME, {
  type: 'glowbolime', label: 'Glow bolime', reason: 'Swallowed by a Glow bolime!', light: '#7affd0', fx: 'glowbolime',
  attacks: bolimeAttacks('Swallowed by a Glow bolime!', 'Digested by a Glow bolime!'),
  colors: paints({ skin: 'jade.glow', core: 'jade.pale' }), ichor: ['#9affe0', '#2a8a6a'],
  mods: { hp: 1.45, damage: 1.35, speed: 1.1, size: 1.08 },
});
// The Slugs of the slime marsh: the plain dark green one, a spotted one, and the black one, the
// strongest and the slowest, whose slime holds you longer.
const slugBall = (slow, time) => ({ ...SLUG_BALL, slow: { ...SLUG_BALL.slow, slow, time } });
export const SPOTTED_SLUG = enemyKind(SLUG, {
  type: 'spottedslug', label: 'Spotted slug', reason: 'Slimed by a Spotted slug!',
  colors: paints({ body: 'ochre.mid', stripes: 'ink.dark', eyes: 'eyes.sun' }), ichor: ['#e8e070', '#6a5a2a'], trail: '#7a7a3a',
  mods: { hp: 1.2, damage: 1.15 },
});
export const BLACK_SLUG = enemyKind(SLUG, {
  type: 'blackslug', label: 'Black slug', reason: 'Slimed by a Black slug!', projectile: slugBall(0.45, 3),
  colors: paints({ body: 'ink.dark', stripes: 'moss.mid', eyes: 'eyes.ember' }), ichor: ['#b8ff5a', '#1e2a14'], trail: '#2a3a20',
  mods: { hp: 1.45, damage: 1.35, speed: 0.85, size: 1.12 },
});
// The Tornados: an ochre one over the badlands and the canyon, a pale blue one in the snow and the
// frozen caves, and a burning one in the volcanic depths, whose twisters set you on fire.
const tornadoAttacks = (caught, slammed, more = {}) => [{ ...TORNADO_TWIN, reason: caught, ...more }, { ...TORNADO_HOP, reason: caught, ...more },
  { ...TORNADO_SLAM, reason: slammed, ...more }];
export const DUST_TORNADO = enemyKind(TORNADO, {
  type: 'dusttornado', label: 'Dust tornado', reason: 'Caught in a Dust tornado\'s twister!',
  attacks: tornadoAttacks('Caught in a Dust tornado\'s twister!', 'Slammed by a Dust tornado!'),
  colors: paints({ body: 'ochre.light', wind: 'ochre.pale@+4', eyes: 'eyes.ember' }), ichor: ['#efe0b8', '#8a7040'],
  mods: { hp: 1.2, damage: 1.15 },
});
export const FROST_TORNADO = enemyKind(TORNADO, {
  type: 'frosttornado', label: 'Frost tornado', reason: 'Caught in a Frost tornado\'s twister!',
  attacks: tornadoAttacks('Caught in a Frost tornado\'s twister!', 'Slammed by a Frost tornado!'),
  colors: paints({ body: 'frost.pale@-4', wind: 'frost.pale@+8', eyes: 'eyes.ember' }), ichor: ['#e0f4ff', '#5a8fbf'],
  mods: { hp: 1.3, damage: 1.1, speed: 0.9 },
});
export const FIRE_TORNADO = enemyKind(TORNADO, {
  type: 'firetornado', label: 'Fire tornado', reason: 'Caught in a Fire tornado\'s twister!', fireproof: true, fx: 'firetornado',
  attacks: tornadoAttacks('Caught in a Fire tornado\'s twister!', 'Slammed by a Fire tornado!', { burn: { time: 1, damage: 6, ticks: 2 } }),
  colors: paints({ body: 'ember.mid', wind: 'ember.glow', eyes: 'eyes.sun' }), light: '#ff7a2a', sparks: ['#ffd25a', '#ff8a2a', '#ff4a17'],
  ichor: ['#ffc07a', '#a0480f'], pitch: 1, mods: { hp: 1.5, damage: 1.45, speed: 1.1, size: 1.08 },
});
// The Flimmers: the plain grey one, a pale one in the snow, an ochre one like the heat shimmering
// over the badlands, and the dark forest's own, almost black, the strongest. They keep to the first
// act (core/spawns.js), and every one stays well below the hero's height.
const flimmerAttacks = reason => [{ ...FLIMMER_PUMMEL, reason }];
export const FROST_FLIMMER = enemyKind(FLIMMER, {
  type: 'frostflimmer', label: 'Frost flimmer', reason: 'Beaten up by a Frost flimmer!', attacks: flimmerAttacks('Beaten up by a Frost flimmer!'),
  colors: paints({ skin: 'frost.pale' }), ichor: ['#e0f4ff', '#6aa0c8'],
  mods: { hp: 1.3, damage: 1.1, speed: 0.95 },
});
export const HAZE_FLIMMER = enemyKind(FLIMMER, {
  type: 'hazeflimmer', label: 'Haze flimmer', reason: 'Beaten up by a Haze flimmer!', attacks: flimmerAttacks('Beaten up by a Haze flimmer!'),
  colors: paints({ skin: 'ochre.light' }), ichor: ['#f4e6b8', '#a08040'],
  mods: { hp: 1.25, damage: 1.2, speed: 1.05, size: 1.05 },
});
export const SHADOW_FLIMMER = enemyKind(FLIMMER, {
  type: 'shadowflimmer', label: 'Shadow flimmer', reason: 'Beaten up by a Shadow flimmer!', attacks: flimmerAttacks('Beaten up by a Shadow flimmer!'),
  colors: paints({ skin: 'ink.dark' }), ichor: ['#b8b4d8', '#2a2838'],
  mods: { hp: 1.15, damage: 1.15, speed: 1.1, size: 1.1 },
});
// The Moose: the brown one of the forests and the highlands, a pale Frost moose in the snow and the
// frozen caves, and a dark green Bog moose that wades through the swamp and the marsh (`slimeborn`:
// their slime does not hold it, core/footing.js).
const mooseAttacks = kind => [{ ...MOOSE_TOSS, reason: `Tossed by a ${kind}!` }, { ...MOOSE_CHARGE, reason: `Trampled by a ${kind}!` },
  MOOSE_DAZED, { ...MOOSE_TAIL, reason: `Clubbed by a ${kind}'s tail!` }];
export const FROST_MOOSE = enemyKind(MOOSE, {
  type: 'frostmoose', label: 'Frost moose', reason: 'Tossed by a Frost moose!', attacks: mooseAttacks('Frost moose'),
  colors: paints({ fur: 'frost.pale@+4', antlers: 'frost.light@-6', ball: 'frost.deep', eyes: 'eyes.ember' }), ichor: ['#c4ecff', '#4f8fbf'],
  mods: { hp: 1.3, damage: 1.1, speed: 0.9 },
});
export const BOG_MOOSE = enemyKind(MOOSE, {
  type: 'bogmoose', label: 'Bog moose', reason: 'Tossed by a Bog moose!', attacks: mooseAttacks('Bog moose'), slimeborn: true,
  colors: paints({ fur: 'moss.deep@-6', antlers: 'ochre.pale', ball: 'moss.dark', eyes: 'eyes.sun' }), ichor: ['#b4e67e', '#3f6f1a'],
  mods: { hp: 1.25, damage: 1.25, speed: 1.05 },
});
// from half his health on: a giant, six cells tall (the model at `size`), who stomps, jumps, kicks
// and blasts; he walks over the hills on the floors like any enemy, but keeps clear of the bank
// (game/squarlo.js); nothing staggers him and blows hurt him less, unless he is exposed
export const SQUARLO_GIANT = enemyKind(SQUARLO, {
  type: 'squarlogiant', label: 'Squarlo', mods: { size: GIANT },
  attacks: [SQUARLO_STOMP, SQUARLO_JUMP, SQUARLO_KICK, SQUARLO_CANNON, SQUARLO_TIDE, SQUARLO_SUMMON, SQUARLO_REST],
  radius: 0.9, height: 6, bodyHeight: 5.55, mass: 45, chase: 1.5, wander: 0.8, homeSpeed: 1.2, cooldown: 1,
  style: 'brute', giant: true, phase: 2, gait: 'stride', steadfast: true, armour: 0.6,
});
// a boss's profile for each of its stages (game/squarlo.js; a friend's game swaps it by the stage
// the runner sends, net/foes.js)
export const STAGE_PROFILES = { squarlo: [SQUARLO, SQUARLO_GIANT], foggery: [FOGGERY, FOGGERY_BALL, FOGGERY_BALL],
  renew: [RENEW, RENEW_BOW, RENEW_FLAIL, RENEW_TWIN], slomo: [SLOMO, SLOMO_SLUG], mansk: [MANSK, MANSK_SKY, MANSK_RIBBONS],
  monteur: [MONTEUR, MONTEUR_SUN] };
// One full attack and recovery, averaged over a species' attacks (s), and what it deals per
// second at level 1 (a projectile's burn included): how dangerous it is to stand next to.
export function attackCycle(profile) {
  const list = profile.attacks ?? [profile], w = list.reduce((n, a) => n + (a.weight ?? 1), 0);
  return list.reduce((n, a) => n + a.attackTime * (a.weight ?? 1), 0) / w + profile.cooldown;
}
// (a beating counts every one of its blows: its `more`)
export function attackDamage(profile) {
  const list = profile.attacks ?? [profile], w = list.reduce((n, a) => n + (a.weight ?? 1), 0);
  const blows = a => [a, ...(a.more ?? []).map(m => ({ ...a, ...m }))].reduce((n, b) => n + Math.round(profile.damage * (b.power ?? 1)), 0);
  return list.reduce((n, a) => n + (blows(a) + (a.projectile?.burn?.damage ?? 0)) * (a.weight ?? 1), 0) / w;
}
export const threat = profile => attackDamage(profile) / attackCycle(profile);

// Guardians are distinct kinds for every species, never part of the ordinary roster. A tier
// sets level-1 floors, so the species it promotes matters for how it fights, not for how
// strong it is: HP at least `hp` (or `hpMult` × the species'), damage per second at least
// `threat` (or `damageMult` × the species' blows), a fixed XP reward and a longer poise.
// Side guardians are a mid-route fight; descent guardians (the boss placeholders) are the
// depth's big one: tougher, deadlier, and they recover from staggers more slowly still.
// learn: enemies.html#guardians (see learn/README.md)
export const GUARDIAN_TIERS = {
  side: { hp: 550, hpMult: 3.5, threat: 9, damageMult: 1.15, xp: 260, poise: 1.4 },
  descent: { hp: 1000, hpMult: 6.5, threat: 11.5, damageMult: 1.45, xp: 650, poise: 2 },
};
const guardianMods = (base, t) => ({
  hp: Math.max(t.hp / base.hp, t.hpMult),
  damage: Math.max(t.damageMult, t.threat / threat(base)),
  xp: t.xp / base.xp,
});
// Hot pink (the palette's `pink`, hue 350) is reserved for side guardians, `amber` (65) for
// descent guardians (core/palette.js GUARDIAN_HUES); eyes remain pale for contrast. A species may dress its guardians otherwise (`guardianLooks.side` /
// `.descent`: colours, glow, `finish` and the like, in place of these): the Wolk's are grey and
// silver. A fluid dweller's guard from any fluid (its arena's pond is of the fluid its kinds live
// in, cubegen/guardian.js), and lava does not burn them.
const anyFluid = base => base.dwells && { dwells: [WATER, LAVA, ACID], lavaproof: true };
export const GUARDIAN_KINDS = Object.fromEntries(ENEMY_PROFILES.map(base => [base.species, enemyKind(base, {
  type: 'guardian' + base.type, label: 'Guardian ' + base.label, baseLabel: base.label, guardian: true, guardianRole: 'side', bossPlaceholder: false,
  colors: paints(Object.fromEntries(Object.keys(base.parts).map(role => [role, role === 'eyes' ? 'eyes.bone' : 'pink.vivid']))),
  light: '#ff3fa8', sparks: ['#ff3fa8', '#ffd0ee'], ichor: ['#ff3fa8', '#9b165d'],
  poise: Math.max(base.poise, GUARDIAN_TIERS.side.poise), mods: guardianMods(base, GUARDIAN_TIERS.side),
  ...anyFluid(base), ...base.guardianLooks?.side,
})]));
// Explicit future-boss hook: a separate kind, not a level-dependent recolouring. Players know a
// descent guardian as a Temp Boss: it holds the place of the depth's real boss to come
// (core/bosses.js); a side guardian as the Guardian of its species.
export const DESCENT_GUARDIAN_KINDS = Object.fromEntries(ENEMY_PROFILES.map(base => [base.species, enemyKind(base, {
  type: 'descentGuardian' + base.type, label: 'Temp Boss ' + base.label, baseLabel: base.label,
  guardian: true, guardianRole: 'descent', bossPlaceholder: true,
  colors: paints(Object.fromEntries(Object.keys(base.parts).map(role => [role, role === 'eyes' ? 'eyes.bone' : 'amber.vivid']))),
  light: '#ff9b35', sparks: ['#ff9b35', '#fff0cc'], ichor: ['#ff9b35', '#9b4b16'],
  poise: Math.max(base.poise, GUARDIAN_TIERS.descent.poise), mods: guardianMods(base, GUARDIAN_TIERS.descent),
  ...anyFluid(base), ...base.guardianLooks?.descent,
})]));
// Gusto's minions (game/gusto.js summons them): half a Triangle, light blue and much faster,
// whose punches do not knock the player over. Never in a roster (`minion`); a little XP, no
// coins and no weapons, now and then a minor health potion (`drops`, core/gear/drops.js).
export const CUSTO_TRIANGLE = enemyKind(TRIANGLE, {
  type: 'custotriangle', label: 'Custo triangle', reason: 'Punched by a Custo triangle!', minion: true,
  colors: paints({ glow: 'frost.light@-6', eyes: 'eyes.bone' }), light: '#7fd0ff', sparks: ['#e0f6ff', '#7fd0ff'],
  ichor: ['#c4ecff', '#4f8fbf'], aggro: 9, giveUp: 14, knockDown: false, cooldown: 1.6, poise: 0, coins: [0, 0],
  projectile: { ...TRIANGLE.projectile, speed: 9.5, radius: 0.2, muzzle: TRIANGLE.projectile.muzzle.map(v => v * 0.5) },
  drops: { weapons: false, potion: 0.08, potions: ['item_potion_health_minor'] },
  mods: { hp: 0.17, damage: 0.25, speed: 1.9, size: 0.5, xp: 0.1 },
});
// Totnar's minions (game/totnar.js): never in a roster, a little XP, no coins, no weapons, now and
// then a minor health potion. They turn up (and go) in a puff of dust and leaves (`puff`,
// render/enemies.js).
const MINION_DROPS = chance => ({ weapons: false, potion: chance, potions: ['item_potion_health_minor'] });
const LEAF_PUFF = { colors: ['#b8a07a', '#8a6440', '#9aa456'], size: 0.5 };
// The snapping skull: a skull he throws, come to life where it lands (blender/totnar.py, its own
// model). It hops after the player and bites, and after `lifetime` s it crumbles (game/totnar.js).
export const SNAP_SKULL = {
  type: 'snapskull', species: 'snapskull', label: 'Snapping skull', hp: 18, damage: 11, knock: 3,
  xp: 6, coins: [0, 0], minion: true, lifetime: 7,
  radius: 0.24, height: 0.55, bodyHeight: 0.45, mass: 0.5,
  aggro: 9, giveUp: 14, chase: 2.6, wander: 0.6, homeSpeed: 1.2,
  reach: 1.5, hitReach: 0.85, hitAt: 12 / 30, trackUntil: 0.3, attackTime: 0.8, cooldown: 0.9,
  arc: 0.5, knockDown: false, hop: 3, reason: 'Bitten by a snapping skull!', ichor: ['#efe6cf', '#8a8070'], pitch: 1.35,
  lunge: { from: 0.12, to: 0.38, max: 1.1, stop: 0.45 },
  poise: 0, hitStun: 0.2, deathTime: 1, corpseTime: 2,
  parts: { bone: ['SnapBone'], eyes: ['SnapEyes_glow'] },
  colors: paints({ bone: 'stone.pale', eyes: 'eyes.ember' }),
  light: '#ff5a1e', puff: { colors: ['#efe6cf', '#d8cdb0', '#a89a80'], size: 0.45 },
  drops: MINION_DROPS(0.03),
  style: 'brute', charge: 1.3,
  seedSalt: 0x5ca115, spacing: 2,
};
// the species that are only ever a boss's minions (each its own model)
export const MINION_PROFILES = [SNAP_SKULL];
// Squarlo's Squirtles: plain Squirtles (`plain`: they look like and are called what they are, their
// body the water of his tide they live in), weaker, and they go for the player at once
const SPLASH_PUFF = { colors: ['#e8fbff', '#9fe0f0', '#6ac2d8'], size: 0.5 };
export const SQUARLO_SQUIRTLE = enemyKind(SQUIRTLE, {
  type: 'squarlosquirtle', minion: true, plain: true,
  aggro: 10, giveUp: 14, coins: [0, 0], drops: MINION_DROPS(0.05), puff: SPLASH_PUFF,
  mods: { hp: 0.7, damage: 0.6, xp: 0.15 },
});
// Flip's Sky wollas: light blue, weaker, and they go for the player at once
export const SKY_WOLLA = enemyKind(WOLLA, {
  type: 'skywolla', label: 'Sky wolla', reason: 'Blown away by a Sky wolla!', minion: true,
  colors: paints({ waves: 'frost.light', eyes: 'eyes.bone' }), ichor: ['#e0f6ff', '#6ab8e8'], trail: '#7fb4d4',
  aggro: 10, giveUp: 14, coins: [0, 0], drops: MINION_DROPS(0.06), puff: { colors: ['#f0faff', '#bfe8ff', '#8fd0f8'], size: 0.6 },
  mods: { hp: 0.6, damage: 0.6, xp: 0.15 },
});
// Foggery's minions: plain Fire-faces (phase 1) and Fire-cats (phases 2 and 3: they guard him); lava
// does not burn them, they walk on it (`lavaproof`, game/tide.js walkOnLava); weaker, going for the
// player at once. `plain`: they look
// like and are called what they are, no kind of their own to tell apart.
const EMBER_PUFF = { colors: ['#ffd25a', '#ff8a2a', '#5a4038'], size: 0.55 };
export const FOG_FACE = enemyKind(FIREFACE, {
  type: 'fogface', minion: true, plain: true, lavaproof: true, aggro: 10, giveUp: 14, coins: [0, 0], drops: MINION_DROPS(0.05), puff: EMBER_PUFF,
  mods: { hp: 0.6, damage: 0.6, xp: 0.15 },
});
export const FOG_CAT = enemyKind(FIRECAT, {
  type: 'fogcat', minion: true, plain: true, lavaproof: true, aggro: 12, giveUp: 16, coins: [0, 0], drops: MINION_DROPS(0.08), puff: EMBER_PUFF,
  mods: { hp: 0.8, damage: 0.6, xp: 0.2 },
});
// Renew's minions, cast out of the sky onto the floor (game/renew.js): plain spiders (phase 2) and
// Fire-faces (phase 3), weaker, going for the player at once
export const REN_SPIDER = enemyKind(SPIDER, {
  type: 'renspider', minion: true, plain: true, aggro: 10, giveUp: 14, coins: [0, 0], drops: MINION_DROPS(0.05),
  puff: { colors: ['#ffffff', '#d8f4ff', '#bdf3ff'], size: 0.5 }, mods: { hp: 0.8, damage: 0.6, xp: 0.15 },
});
export const REN_FACE = enemyKind(FIREFACE, {
  type: 'renface', minion: true, plain: true, aggro: 10, giveUp: 14, coins: [0, 0], drops: MINION_DROPS(0.06), puff: EMBER_PUFF,
  mods: { hp: 0.55, damage: 0.55, xp: 0.15 },
});
// Monteur's minions (game/monteur.js): plain Moose, weaker, going for the player at once (tossing,
// charging, clubbing like any Moose); they come up out of the floor round him in a puff of dust
export const MONT_MOOSE = enemyKind(MOOSE, {
  type: 'montmoose', minion: true, plain: true, aggro: 12, giveUp: 16, coins: [0, 0], drops: MINION_DROPS(0.05),
  puff: { colors: ['#e0dacd', '#b8b0a0', '#8d877c'], size: 0.9 }, mods: { hp: 0.6, damage: 0.55, xp: 0.15 },
});
// small spiders of twigs, poured out of his ball by the dozen
export const TOT_SPIDER = enemyKind(SPIDER, {
  type: 'totspider', label: 'Twig spider', reason: 'Bitten by a twig spider!', minion: true,
  colors: paints({ body: 'ochre.deep', eyes: 'eyes.ember' }), ichor: ['#b08a58', '#4a3018'],
  aggro: 9, giveUp: 14, coins: [0, 0], drops: MINION_DROPS(0.02), puff: LEAF_PUFF,
  mods: { hp: 0.4, damage: 0.45, speed: 1.2, size: 0.55, xp: 0.12 },
});
// and, at the last, Stunders of brambles: smaller, weaker, and their rams do not knock you over
export const TOT_STUNDER = enemyKind(STUNDER, {
  type: 'totstunder', label: 'Bramble stunder', reason: 'Rammed by a bramble stunder!', minion: true, knockDown: false,
  colors: paints({ skin: 'ochre.deep', eyes: 'eyes.ember' }), ichor: ['#b08a58', '#4a3018'],
  aggro: 9, giveUp: 14, coins: [0, 0], drops: MINION_DROPS(0.12), puff: { ...LEAF_PUFF, size: 0.8 },
  mods: { hp: 0.55, damage: 0.55, speed: 1.1, size: 0.72, xp: 0.12 },
});
// Slomo's minions (game/slomo.js): slime green, they go for the player at once. The Arm slug is a
// slug arm he threw, come to life where it landed: small and quick for a slug, it does not spit
// (`reach` 0: it only crawls after the player), and once it reaches them it latches on, bites and
// drops off dead (core/slomo.js `latch`); after a while it melts away anyway (`lifetime`).
const SLIME_PUFF = { colors: ['#d8ff9a', '#9ae048', '#5a9a2a'], size: 0.5 };
export const ARM_SLUG = enemyKind(SLUG, {
  type: 'armslug', label: 'Arm slug', reason: 'An Arm slug latched on to you!', minion: true, lifetime: 8, latches: true,
  projectile: null, reach: 0, style: 'brute', aggro: 12, giveUp: 16, coins: [0, 0], drops: MINION_DROPS(0.02), puff: SLIME_PUFF,
  colors: paints({ body: 'moss.mid', stripes: 'moss.dark', eyes: 'eyes.bone' }), ichor: ['#c8ff7a', '#3e7a2a'],
  mods: { hp: 0.25, damage: 0.5, speed: 2.4, size: 0.55, xp: 0.05 },
});
export const OOZE_SLUG = enemyKind(SLUG, {
  type: 'oozeslug', label: 'Ooze slug', reason: 'Slimed by an Ooze slug!', minion: true,
  colors: paints({ body: 'moss.light', stripes: 'moss.deep', eyes: 'eyes.bone' }), ichor: ['#d8ff9a', '#4f8f2a'], trail: '#6cb03a',
  aggro: 12, giveUp: 16, coins: [0, 0], drops: MINION_DROPS(0.05), puff: SLIME_PUFF,
  mods: { hp: 0.7, damage: 0.6, xp: 0.15 },
});
export const OOZE_BOLIME = enemyKind(BOLIME, {
  type: 'oozebolime', label: 'Ooze bolime', reason: 'Swallowed by an Ooze bolime!', minion: true,
  attacks: [{ ...BOLIME_POUNCE, reason: 'Swallowed by an Ooze bolime!', engulf: { ...BOLIME_POUNCE.engulf, reason: 'Digested by an Ooze bolime!' } }],
  colors: paints({ skin: 'moss.pale', core: 'jade.deep' }), ichor: ['#d8ff9a', '#3e8a2a'],
  aggro: 12, giveUp: 16, coins: [0, 0], drops: MINION_DROPS(0.05), puff: SLIME_PUFF,
  mods: { hp: 0.7, damage: 0.6, xp: 0.15 },
});
// a Squirtle of slime, a bit bigger, whose spit is a ball of slime that slows; it lives in his
// flood (drawn as slime: `look`, game/tide.js) and dries up once that drains
const SLIME_BALL = { kind: 'slimeball', radius: 0.23, push: 0, pushTime: 0, slow: { time: 2, slow: 0.6, source: 'slime' } };
export const SLIME_SQUIRTLE = enemyKind(SQUIRTLE, {
  type: 'slimesquirtle', label: 'Slime squirtle', reason: 'Slimed by a Slime squirtle!', minion: true, dwells: [ACID],
  projectile: { ...SQUIRTLE.projectile, muzzle: SQUIRTLE.projectile.muzzle.map(v => v * 1.3), ...SLIME_BALL },
  attacks: squirtleAttacks('Slimed by a Slime squirtle!', { projectile: { ...SQUIRTLE.projectile, ...SLIME_BALL } }), trail: '#8ad048',
  colors: paints({ body: 'moss.glow', eyes: 'moss.pale' }), ichor: ['#c8f0a0', '#4f8f2a'],
  aggro: 12, giveUp: 16, coins: [0, 0], drops: MINION_DROPS(0.05), puff: SLIME_PUFF,
  mods: { hp: 1.1, damage: 0.8, size: 1.3, xp: 0.2 },
});
// Mansk's Tornados (game/mansk.js): plain ones, weaker, going for the player at once; they turn up
// (and go) in a puff of wind
export const STAGE_TORNADO = enemyKind(TORNADO, {
  type: 'stagetornado', minion: true, plain: true, aggro: 12, giveUp: 16, coins: [0, 0], drops: MINION_DROPS(0.05),
  puff: { colors: ['#ffffff', '#e6dcff', '#c8b8ff'], size: 0.6 }, mods: { hp: 0.6, damage: 0.55, xp: 0.15 },
});
export const ENEMY_KINDS = Object.fromEntries([...ENEMY_PROFILES, ...Object.values(GUARDIAN_KINDS), ...Object.values(DESCENT_GUARDIAN_KINDS), SAND_VIPER, BLOOD_VIPER, FROST_ADDER, VENOM_ADDER, SHADOW_MAMBA, FROST_SPIDER, BOG_SPIDER,
  GLOOM_SPIDER, REDBACK, FROST_STUNDER, STONE_STUNDER, MAGMA_STUNDER, BOG_OCTONAUT, CORAL_OCTONAUT, EMERALD_TRIANGLE, CRIMSON_TRIANGLE, FIRE_SHRAPS,
  BOG_WOLLA, STORM_WOLLA, EMBER_WOLLA, LAVA_SQUIRTLE, BLAZE_FACE, LANTERN_FACE, WISP_FACE, ASH_CAT, VOID_CAT, AMETHYST_SHRAPS, HABANERO,
  NIGHTSHADE, DUST_WOLK, STORM_WOLK, TOXIC_SQUIRTLE, FROST_MECKED, BOG_MECKED, BONE_MECKED, DUST_TORNADO, FROST_TORNADO, FIRE_TORNADO, SPOTTED_SLUG, BLACK_SLUG, TOXIC_BOLIME, GLOW_BOLIME, FROST_FLIMMER, HAZE_FLIMMER, SHADOW_FLIMMER, FROST_MOOSE, BOG_MOOSE, ...BOSS_PROFILES, CUSTO_TRIANGLE, SNAP_SKULL, TOT_SPIDER, TOT_STUNDER,
  SQUARLO_SQUIRTLE, SKY_WOLLA, FOG_FACE, FOG_CAT, REN_SPIDER, REN_FACE, ARM_SLUG, OOZE_SLUG, OOZE_BOLIME, SLIME_SQUIRTLE, STAGE_TORNADO, MONT_MOOSE].map(k => [k.type, k]));
// gone: not here for now (Gusto between his vanishing and his coming back, game/gusto.js), or
// under the floor (a burrowing Squirtle, game/enemyai.js): it cannot be seen, hit or touched,
// like the dead
// (and an Arm slug latched on to a player, core/slomo.js: it sits on their head, mode 'split')
export const absent = e => e.mode === 'dead' || e.mode === 'gone' || !!e.under || (e.mode === 'split' && !!e.profile.latches);
// How much a blurry one (a Flimmer's `blur`) shimmers now, 0..1: all the time, but not while it
// beats you (it comes into focus for that) nor while a blow or a bolt stuns it, nor once it is
// gone. render/flimmerview.js draws it as blurry as this says; while it shimmers, blows and shots
// may go through it (evades). A friend's game knows this from the mode the runner sends (net/foes.js).
export function shimmerOf(e) {
  if (!e.profile?.blur || absent(e) || e.mode === 'attack' || e.stun > 0) return 0;
  return 1;
}
// does a blow or a shot go right through e? (roll: 0..1; the one who strikes rolls, so a friend's
// hit that lands is applied as it is: net/session.js)
export const evades = (e, roll = Math.random()) => roll < (e.profile?.blur?.evade ?? 0) * shimmerOf(e);

// Is (x, z) behind e? Its `back` attacks (the Moose's tail) are started only with the player there,
// and land there (game/enemyai.js, game/enemycombat.js).
export const BACK = -0.3;   // behind: the cosine of the angle to it, off e's heading, is below this
export const behind = (e, x, z) => Math.cos(Math.atan2(x - e.x, z - e.z) - e.yaw) < BACK;
// the attack e is performing (or about to perform): one of profile.attacks, else the profile
export const attackOf = e => e.profile.attacks?.[e.attack] ?? e.profile;
// how much more blows hurt e now: lying helpless after a missed grab (an attack's `exposed`), else 1
export function exposedBy(e) {
  const x = e.mode === 'attack' ? attackOf(e).exposed : null;
  return x && e.t >= (x.from ?? 0) && e.t < x.until ? x.damage : 1;
}
// the share of a blow's damage that e takes now: exposed, more (exposedBy); else its `armour`
// (Squarlo a giant: less), or all of it
export function hurtBy(e) {
  const x = exposedBy(e);
  return x > 1 ? x : e.profile.armour ?? 1;
}
// is e up in the air now (Squarlo a giant, jumping: between the jump's take-off and the landing,
// game/squarlo.js lifts him; a Tornado riding a twister, game/enemyai.js): nothing touches him
export function airborne(e) {
  if ((e.lift ?? 0) > 1) return true;   // (Mansk flying high, game/mansk.js)
  const a = e.mode === 'attack' ? attackOf(e) : null, j = a?.jump ?? a?.ride;
  return !!j && e.t >= j.from && e.t < a.hitAt;
}
// the bottom of e's body: its feet, or how high over its floor it flies (`lift`: Mansk, game/mansk.js;
// `y` stays its floor's height, which it walks on)
export const baseY = e => e.y + (e.lift ?? 0);
// is e warded now (Squarlo casting the tide: an attack's `ward`): nothing hurts it
export const wardedNow = e => e.mode === 'attack' && !!attackOf(e).ward;
// is e in the `steady` part of an attack now (Totnar rolling): blows hurt it but do not stagger it
export function steadyNow(e) {
  const s = e.mode === 'attack' ? attackOf(e).steady : null;
  return !!s && e.t >= s.from && e.t < s.to;
}
// the index of an attack, picked by weight among `allowed` (indices; default: all of them)
export function pickAttack(profile, r = Math.random(), allowed = null) {
  const list = profile.attacks;
  if (!list) return 0;
  const from = allowed ?? list.map((_, i) => i);
  let w = r * from.reduce((n, i) => n + list[i].weight, 0);
  for (const i of from) if ((w -= list[i].weight) < 0) return i;
  return from[from.length - 1];
}
// does the profile throw or shine anything (with any of its attacks)?
export const isRanged = profile => !!(shotOf(profile) || profile.attacks?.some(shotOf));
// which attacks (indices; [0] for a species with one) can start against a target d away
// across the floor and dy above or below: within the attack's reach (else the profile's) and
// beyond its minReach; a throw (or a beam) allows more height, a blow enough for the next step
// of a stair or a ramp, a cast any, an attack with a `rise` that much (Squarlo jumping up onto a
// hill). A clear line for throws is the caller's.
export function attacksInReach(profile, d, dy) {
  const list = profile.attacks ?? [profile], out = [];
  list.forEach((a, i) => {
    if (d < (a.reach ?? profile.reach) && d >= (a.minReach ?? 0) && dy < (a.rise ?? (a.cast ? Infinity : shotOf(a) ? 1.5 : 0.75))) out.push(i);
  });
  return out;
}

// how far a retreat has backed the enemy off by attack time t
export const retreatAt = (retreat, t) => lungeAt(retreat, t) * retreat.dist;
// when an attack's shot leaves: a beam shines for its time up to the hit frame
export const fireAt = a => a.beam ? a.hitAt - a.beam.time : a.hitAt;
// how far a pouncing attack carries the enemy towards a target d away
export const lungeDistance = (lunge, d) => Math.max(0, Math.min(lunge.max, d - lunge.stop));
// the share of the lunge covered at attack time t (eased in and out)
export function lungeAt(lunge, t) {
  const u = Math.min(1, Math.max(0, (t - lunge.from) / (lunge.to - lunge.from)));
  return u * u * (3 - 2 * u);
}

// what a strike (or a projectile) does to the player; a gust's blow also pushes (`push`), a
// bolt's stuns (`shock`, s), Squarlo landing on them squashes them and dazes them (`daze`, s), a
// slime ball slows them (`slow`, core/status.js slowFrom)
export function blowOf(profile, a = profile) {
  const damage = Math.round(profile.damage * (a.power ?? 1));
  return { damage, knock: a.knock ?? profile.knock,
    knockDown: !!a.knockDown, hop: a.hop, reason: a.reason, burn: a.projectile?.burn ?? a.burn ?? null,
    chill: a.projectile?.chill ?? a.chill ?? null, toxin: toxinOf(a.toxin ?? profile.toxin, damage),
    ...((a.projectile?.slow ?? a.slow) && { slow: a.projectile?.slow ?? a.slow }),
    ...(a.gust && { push: { speed: a.gust.push, time: a.gust.pushTime } }),
    ...(a.projectile?.push && { push: { speed: a.projectile.push, time: a.projectile.pushTime } }),
    ...(a.beam?.shock && { shock: a.beam.shock }), ...(a.pop && { pop: a.pop }), ...(a.daze && { daze: a.daze }) };
}
// what a shockwave (an attack's `wave`, game/quakes.js) does to a player it rolls under
export function waveBlowOf(profile, a) {
  const w = a.wave;
  return { damage: Math.round(profile.damage * w.power), knock: w.knock, knockDown: true, hop: w.hop, reason: msg('Thrown off your feet by the shockwave!'),
    burn: null, chill: null, toxin: null };
}

// a level-1 value grown to `level`
// learn: stronger.html#monsters-grow (see learn/README.md)
export const grown = (value, rate, level) => value * (1 + rate * (level - 1));
// learn: stronger.html#race (see learn/README.md)
export function enemyProfile(profile, level) {
  if (!Number.isSafeInteger(level) || level < 1) throw new RangeError('Invalid enemy level');
  return { ...profile, hp: Math.round(grown(profile.hp, GROWTH.hp, level)),
    damage: Math.round(grown(profile.damage, GROWTH.damage, level)), xp: Math.round(grown(profile.xp, GROWTH.xp, level)) };
}
// the copper a kind drops at a level: [least, most]
export const coinRange = (profile, level) => profile.coins.map(c => Math.round(grown(c, GROWTH.coins, level)));
// learn: memory.html#names (see learn/README.md)
export function enemyRoll(map, profile, floorId) {
  const R = mulberry32(hash32(map.seed ^ profile.seedSalt ^ Math.imul(floorId, 7919) ^ 0x1007));
  const depth = Math.max(0, map.depth || 0), r = R();
  const level = Math.max(1, depthLevel(depth) + (depth >= 2 ? r < .25 ? -1 : r >= .75 ? 1 : 0 : 0));
  const [lo, hi] = coinRange(profile, level);
  return { id: `${map.key ?? map.seed}:${profile.species}:${floorId}`, level, coinDrop: lo + Math.floor(R() * (hi - lo + 1)) };
}
export function makeEnemy(spot, profile, i = 0) {
  profile = enemyProfile(profile, spot.level || 1);
  return {
    ...spot, level: spot.level || 1, profile, type: profile.type, hp: profile.hp, home: spot.f,
    mode: 'idle', t: 1 + i * 0.7, think: i * 0.05, speed: 0,
    path: null, lost: 0, cool: 0, attacks: 0, attack: 0, bit: false, leap: 0,
    deadT: 0, hurtT: 0, stun: 0, poised: 0, staggered: false, phase: (i * 0.37) % 1,
  };
}

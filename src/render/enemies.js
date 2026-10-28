// Physics owns attack/death timers. Animation is sampled from those same timers,
// so loading late, interrupting a swing or sliding a cube cannot desynchronise hits.
// Hovering species run their idle loop on time. Fire and the Triangle's glow live here
// too (GLOW): a light that follows the body, flames (bones named flame*) that keep
// flickering over whatever clip plays, an emissive pulse and drifting embers.
// An enemy kind (core/enemies.js) is drawn with its species' model, recoloured
// (recolor.js), stripped of the parts it hides and scaled by its size; its `light` and `sparks`
// replace the glow's colours, and its `fx` names a glow of its own. The body is one mesh with
// one material that colours each part (material) on its own (enemymodel.js): the hit flash,
// hover tint and gloom write the parts' colours, the glow pulse and the death fade the material.
// Wheels (bones named wheel.*, a species with a `wheel` radius) spin by the distance the body
// rolls along its heading, whatever clip plays, and spin down once it is dead.
// Waves (bones named wave0, wave1, ..., a species with `waves`: the Wolla's rings, the Tornado's
// skirts) turn about their own axes, every other one the other way, so the crests run round the
// body; they whirl faster while it gathers its storm and blows (while it spins up its twisters and
// rides one), and still once it is dead. Its storm cloud's
// lightning (the attack's `thunder` times) flashes a light, and it leaves a wet trail
// (trails.js).
// A kind's `finish` ({ parts, roughness, metalness, sheen, glints }: the Wolk's silver descent
// guardian) polishes the materials of those parts: smoother, a little metallic, with a faint sheen
// of their own colour (the scene has no environment to mirror, so they stay mostly diffuse),
// and white glints twinkle on its body `glints` times a second.
// Gloom (a species with `gloom`: the Wolk): the materials of its `gloom.parts` darken towards
// `gloom.color` while it gathers its lightning, flicker with it inside and flash at the strike,
// then lighten again, and as it dies.
// Tentacles (bones named tentacle<i>_<j>, a species that `flail`s: Gusto) shake like crazy on
// top of whatever clip plays, each its own way, the tips most; they calm down as it dies. Its
// eyes flare while it winds up an attack (`flare` in GLOW).
// Clouds: a boss's proxy that is felled, and a body that goes away (mode 'gone') or comes back,
// jumps across the level or first turns up as a proxy or a summoned minion, does so in a puff
// of cloud (game/gusto.js; a kind's `puff`: Totnar's minions go in dust and leaves). While it
// splits (mode 'split') it shudders, steaming.
// Totnar (game/totnar.js): his ball of sticks rolls by the distance he covers (the bone `brush`, a
// species that `tumble`s: its radius), spinning up in place before a roll and shedding leaves and
// twigs (`litter`) as it goes, with a thump and dust where it bounces off something. What he has
// lost by his `stage` (`shed`: bones) is scaled away; losing it bursts it apart. His heart's light
// grows as it shows more (`grow` in GLOW), and the light changing (his `dark`) flares it.
// IK over the clips (render/ik.js, which bones in render/rigs.js; poseEnemy): near the hero, a
// creature looks at them once it has noticed them (or they come close), stands with each foot on
// the ground under it (stairs, slopes, ledges), and a claw or a fist reaches for them round its
// hit; dying, all that lets go.
import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { spiderModel } from './spidermodel.js';
import { stunderModel } from './stundermodel.js';
import { snakeModel } from './snakemodel.js';
import { octonautModel } from './octonautmodel.js';
import { fireFaceModel } from './firefacemodel.js';
import { triangleModel } from './trianglemodel.js';
import { fireCatModel } from './firecatmodel.js';
import { shrapsModel } from './shrapsmodel.js';
import { spicyModel } from './spicymodel.js';
import { wollaModel } from './wollamodel.js';
import { wolkModel } from './wolkmodel.js';
import { gustoModel } from './gustomodel.js';
import { totnarModel } from './totnarmodel.js';
import { snapSkullModel } from './snapskullmodel.js';
import { squarloModel } from './squarlomodel.js';
import { squirtleModel } from './squirtlemodel.js';
import { meckedModel } from './meckedmodel.js';
import { tornadoModel } from './tornadomodel.js';
import { slugModel } from './slugmodel.js';
import { bolimeModel } from './bolimemodel.js';
import { flipModel } from './flipmodel.js';
import { foggeryModel } from './foggerymodel.js';
import { makeFoggeryLook, foggeryLook, disposeFoggeryLook } from './foggeryview.js';
import { slomoModel } from './slomomodel.js';
import { makeSlomoLook, slomoLook } from './slomoview.js';
import { manskModel } from './manskmodel.js';
import { monteurModel } from './monteurmodel.js';
import { makeMonteurLook, monteurLook } from './monteurview.js';
import { qualmosModel } from './qualmosmodel.js';
import { mooseModel } from './moosemodel.js';
import { mooseLook } from './mooseview.js';
import { makeQualmosLook, qualmosLook, disposeQualmosLook } from './qualmosview.js';
import { makeManskLook, manskLook, disposeManskLook } from './manskview.js';
import { isFigure, animateFigures, removeFigureViews } from './renewview.js';
import { isFlimmer, animateFlimmers, removeFlimmerViews, flimmerWarmup } from './flimmerview.js';
import { isSquirtle, animateSquirtles, removeSquirtleViews, squirtleWarmup } from './squirtleview.js';
import { STAGE_PROFILES, enemyName } from '../core/enemies.js';
import { SQUARLO_FIGHT } from '../core/squarlo.js';
import { standingAt } from '../physics/fluid.js';
import { groundAt } from '../physics/collide.js';
import { surfaceY } from './surface.js';
import { WIND } from './materials.js';
import { WATER, LAVA, ACID } from '../core/constants.js';
import { fluidAround } from '../physics/dwell.js';
import { sfx } from '../audio/sfx.js';
import { trackLight, untrackLight } from './lightpool.js';
import { glow, soft, emit, rand } from './particles.js';
import { wetTrail, removeTrail } from './trails.js';
import { walkPrints, forgetWalker } from './footprints.js';
import { slimeAt } from '../game/footsteps.js';
import { dressEnemy, paintParts } from './enemymodel.js';
import { findTentacles, shakeTentacles, findShed, hideShed, findBall, turnBall } from './bossbones.js';
import { makeRig, restoreRig, poseRig } from './ik.js';
import { RIGS } from './rigs.js';
import { attackOf, makeEnemy, ENEMY_KINDS } from '../core/enemies.js';
import { toLinear } from '../core/oklch.js';
import { guardianColor, guardianTitle } from '../core/guardians.js';
import { bossBarred } from '../core/bossbar.js';
import { player, state } from '../game/state.js';
import { character } from './character.js';
import { uiScale } from '../game/uiscale.js';
import { cameraKick, footfallFx } from '../game/juice.js';
import { makeBar, makeLevelLabel, makeAlertMark } from './bars.js';

const prefabs = { spider: spiderModel, stunder: stunderModel, snake: snakeModel, octonaut: octonautModel,
  fireface: fireFaceModel, triangle: triangleModel, firecat: fireCatModel, shraps: shrapsModel, spicy: spicyModel, wolla: wollaModel, wolk: wolkModel, gusto: gustoModel,
  totnar: totnarModel, snapskull: snapSkullModel, squarlo: squarloModel, squirtle: squirtleModel, mecked: meckedModel, tornado: tornadoModel, slug: slugModel, bolime: bolimeModel, flip: flipModel, foggery: foggeryModel, slomo: slomoModel, mansk: manskModel, monteur: monteurModel, qualmos: qualmosModel, moose: mooseModel };
// the models of these species (core/spawns.js speciesIn), loaded once
export const loadSpecies = species => Promise.all(species.map(s => prefabs[s]?.load()));
// light: [color, intensity, distance, height]; pulse: emissive / light swing with the
// clip's beat (twice per hover loop); embers: per second, rising from `from` (a bone, or
// a height above the body); flicker: extra flame motion
const GLOW = {
  fireface: { light: [0xff6a20, 4, 4.5, 0.75], flicker: 1, embers: { rate: 7, from: 0.95, spread: 0.25 } },
  triangle: { light: [0xa45cff, 2.6, 3.5, 0.85], pulse: 0.7 },
  firecat: { light: [0xff7a2a, 1.6, 2.6, 0.75], flicker: 1, embers: { rate: 5, from: 'flame_tail', spread: 0.06 } },
  fireshraps: { light: [0xff6a20, 2.4, 3.5, 1.35], flicker: 1, embers: { rate: 6, from: 'flame0_a', spread: 0.15 } },
  gusto: { light: [0xff3020, 1.8, 3.5, 1.75], flare: 1.6 },
  totnar: { light: [0xff4018, 2.6, 5, 0.95], flare: 1.2, grow: [1, 1.45, 2] },
  snapskull: { light: [0xff5a1e, 0.8, 1.8, 0.4] },
  squarlo: { light: [0x7fe8ff, 1.2, 2.6, 0.5], flare: 0.8 },
  flip: { light: [0x8fdcff, 2.2, 4.5, 1.2], flare: 0.9 },
  foggery: { light: [0xff7a2a, 2.4, 3.8, 1.4], flare: 0.8, flicker: 1, embers: { rate: 8, from: 1.45, spread: 0.35 } },
  firetornado: { light: [0xff7a2a, 1.6, 3, 0.7], embers: { rate: 7, from: 0.45, spread: 0.3 } },
  // the Bolimes' cores glow inside them (most of all the Glow bolime's): by night what you see of them
  bolime: { light: [0x9aff5a, 0.7, 2.4, 0.6], pulse: 0.25 },
  glowbolime: { light: [0x7affd0, 1.5, 3.2, 0.6], pulse: 0.35 },
  // Slomo's stuff glows inside him, his eyes flare up to a throw
  slomo: { light: [0x9aff5a, 2.2, 4.5, 1.3], flare: 0.6 },
  qualmos: { light: [0x73ffe0, 4, 5.5, 2.1], flare: 0.6 },
  // Mansk's diamond glows blue (render/manskview.js: brighter while he slows time)
  mansk: { light: [0x6fb4ff, 1.6, 4.5, 1.95], flare: 0.6 },
  // Monteur's red eyes and the cracks in his stones glow warm; his eyes flare up to a throw
  monteur: { light: [0xff8a3a, 1.2, 4, 2.3], flare: 0.8 },
};
const EMBERS = ['#ffd25a', '#ff8a2a', '#ff5a14'];
const GHOST = 0xff6a5a, GHOST_OPACITY = 0.4;
// The silhouette is for a body hidden behind something, not for the parts of it that dip under
// the ground it walks on (a snake's tail, a stride up a slope): it is cut off below that ground.
// The ground under it is sampled on a 3 x 3 grid over its body (floorUnder), `reach` apart, and
// blended between the samples (uGhostGrid: the grid's corner x, z in the scene and its spacing;
// uGhostH: the heights, row by row; none: far down).
const FLOOR_STEP = 0.5;   // ground this far above its feet still is ground (a slope, a step), not a wall
const NO_FLOOR = new Array(9).fill(-1e4);
function ghostMaterial() {
  const grid = { value: new THREE.Vector3(0, 0, 1) }, heights = { value: NO_FLOOR.slice() };
  const m = new THREE.MeshBasicMaterial({ color: GHOST, transparent: true, opacity: GHOST_OPACITY,
    depthFunc: THREE.GreaterDepth, depthWrite: false });
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, { uGhostGrid: grid, uGhostH: heights });
    s.vertexShader = 'varying vec3 vGhostW;\n' + s.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vGhostW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = `uniform vec3 uGhostGrid;
      uniform float uGhostH[9];
      varying vec3 vGhostW;
      float ghostGround(vec2 p) {
        vec2 g = clamp((p - uGhostGrid.xy) / uGhostGrid.z, 0.0, 1.999);
        ivec2 c = ivec2(floor(g));
        vec2 f = g - vec2(c);
        int i = c.y * 3 + c.x;
        return mix(mix(uGhostH[i], uGhostH[i + 1], f.x), mix(uGhostH[i + 3], uGhostH[i + 4], f.x), f.y);
      }
      ` + s.fragmentShader.replace('void main() {', 'void main() {\n  if (vGhostW.y < ghostGround(vGhostW.xz)) discard;');
  };
  m.customProgramCacheKey = () => 'enemy-ghost';
  m.userData.grid = grid.value; m.userData.heights = heights.value;
  return m;
}
// the ground under e on the grid (heights, row by row along z; null: none under it); where a
// sample finds none, or drops away, it counts as level with its middle
function floorUnder(e, reach) {
  const at = (x, z) => groundAt(x, z, e.y + 0.05, FLOOR_STEP).h, h0 = at(e.x, e.z);
  if (h0 === -Infinity) return null;
  const out = [];
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const h = i || j ? at(e.x + i * reach, e.z + j * reach) : h0;
    out.push(h > h0 - FLOOR_STEP ? h : h0);
  }
  return out;
}
// ... in the scene, where the cube is at `off` (sliding away while travelling: game/travelfx.js)
function placeFloor(v, e, dt, off) {
  if (dt > 0 || v.floor === undefined) v.floor = floorUnder(e, v.reach);   // (a cube going away keeps the one it had)
  const { grid, heights } = v.ghost.userData;
  grid.set(e.x - v.reach + off.x, e.z - v.reach + off.z, v.reach);
  for (let i = 0; i < 9; i++) heights[i] = v.floor ? v.floor[i] + off.y : -1e4;
}
// how far the body reaches out from its middle (its mesh at rest), for the grid: at least its radius
function reachOf(mesh, e) {
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  mesh.updateWorldMatrix(true, false);
  const b = g.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
  return THREE.MathUtils.clamp(Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z), Math.max(0.25, e.profile.radius ?? 0), 2);
}
const tmp = new THREE.Vector3(), wobble = new THREE.Quaternion(), axis = new THREE.Vector3(1, 0, 0);
let clock = 0;
const white = new THREE.Color(0xffffff), hover = new THREE.Color(0xffd9a0), inverseYaw = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const spin = new THREE.Quaternion(), from = new THREE.Vector3(), to = new THREE.Vector3();
// the wheel bones and the axle each spins about, in its own frame (found in the rest pose)
function findWheels(model) {
  const bones = ['wheel.L', 'wheel.R'].map(n => model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n)));
  if (bones.some(b => !b)) return null;
  model.updateMatrixWorld(true);
  bones[0].getWorldPosition(from); bones[1].getWorldPosition(to);
  const axle = from.sub(to).normalize();   // left to right: model +x, the way a forward roll turns
  return bones.map(bone => ({ bone, axis: axle.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()) }));
}
function spinWheels(v, e, dt) {
  if (!v.wheels) return;
  if (e.mode === 'dead') v.spin *= Math.exp(-dt * 1.2);
  else if (dt > 1e-4 && v.rolled) {
    const d = (e.x - v.rolled.x) * Math.sin(e.yaw) + (e.z - v.rolled.z) * Math.cos(e.yaw);
    v.spin = Math.abs(d) < 0.5 ? d / dt / (e.profile.wheel || 0.15) : 0;   // a jump (a slid cube) is not a roll
  }
  v.rolled = { x: e.x, z: e.z };
  v.roll = (v.roll + v.spin * dt) % (2 * Math.PI);
  for (const w of v.wheels) w.bone.quaternion.multiply(spin.setFromAxisAngle(w.axis, v.roll));
}
// the wave bones (wave0, wave1, ...) and the axis each turns about, in its own frame: the
// body's up in the rest pose
function findWaves(model) {
  const bones = [];
  for (let b; (b = model.getObjectByName('wave' + bones.length));) bones.push(b);
  if (!bones.length) return null;
  model.updateMatrixWorld(true);
  return bones.map((bone, i) => ({ bone, angle: 0, dir: i % 2 ? -1 : 1, rate: 1 + 0.12 * i,
    axis: up.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()) }));
}
// how much faster the waves run: gathering the storm, then blowing it, then calming down
function whirl(e) {
  const a = e.mode === 'attack' ? attackOf(e) : null;
  if (a?.twister || a?.ride) return e.t < a.hitAt ? 1 + 3 * Math.min(1, e.t / a.hitAt) : 1 + 3 * Math.exp(-(e.t - a.hitAt) * 3);
  if (!a?.gust) return e.mode === 'dead' ? 0 : 1;
  const blow = a.hitAt, end = blow + a.gust.time;
  if (e.t < blow) return 1 + 2 * Math.min(1, e.t / blow);
  return e.t < end ? 5 : 1 + 4 * Math.exp(-(e.t - end) * 4);
}
// Rings (bones named ring0, ring1, ..., a species with `rings`: Flip's) turn now and then about
// their own axes (the model's forward, at rest), every other one the other way: still for a
// while, then turning for a while; fast while he winds up or casts, wildly while he spins up,
// and slowing to a stop once he is dead.
function findRings(model) {
  const bones = [];
  for (let b; (b = model.getObjectByName('ring' + bones.length));) bones.push(b);
  if (!bones.length) return null;
  model.updateMatrixWorld(true);
  const fwd = new THREE.Vector3(0, 0, 1);
  return bones.map((bone, i) => ({ bone, angle: 0, dir: i % 2 ? -1 : 1, rate: 1 + 0.25 * i,
    axis: fwd.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize() }));
}
function spinRings(v, e, dt) {
  if (!v.rings) return;
  const a = e.mode === 'attack' ? attackOf(e) : null;
  v.ringClock = (v.ringClock ?? 0) + dt;
  // turning for 2.5 s out of every 6 (each its own phase), more while attacking
  const idle = Math.sin(v.ringClock * Math.PI / 3 + v.seed) > 0.2 ? 1.6 : 0;
  // (a boss's intro may set how fast: `ringSpin`, game/reveals.js)
  const want = e.ringSpin ?? (e.mode === 'dead' ? 0 : e.mode === 'split' ? 9 : a ? (a.cast ? 6 : 3.5) : idle);
  v.ringSpeed += (want - v.ringSpeed) * Math.min(1, dt * (e.mode === 'dead' ? 1.2 : 3));
  for (const r of v.rings) {
    r.angle = (r.angle + r.dir * r.rate * v.ringSpeed * (e.profile.rings ?? 1) * dt) % (2 * Math.PI);
    // the mixer only writes a bone whose pose changed (not a held clip): the spin goes on the
    // clip's pose, not on last frame's spun one
    const q = r.bone.quaternion;
    if (r.written && q.equals(r.written)) q.copy(r.clip); else (r.clip ??= new THREE.Quaternion()).copy(q);
    q.multiply(spin.setFromAxisAngle(r.axis, r.angle));
    (r.written ??= new THREE.Quaternion()).copy(q);
  }
}
function turnWaves(v, e, dt) {
  if (!v.waves) return;
  const speed = e.profile.waves ?? 1;
  v.whirl += (whirl(e) - v.whirl) * Math.min(1, dt * (e.mode === 'dead' ? 1.5 : 6));
  for (const w of v.waves) {
    w.angle = (w.angle + w.dir * w.rate * speed * v.whirl * dt) % (2 * Math.PI);
    // (the mixer only writes a bone whose pose changed, not one standing still: the turn goes on
    // the clip's pose, not on last frame's turned one; as for the rings)
    const q = w.bone.quaternion;
    if (w.written && q.equals(w.written)) q.copy(w.clip); else (w.clip ??= new THREE.Quaternion()).copy(q);
    q.multiply(spin.setFromAxisAngle(w.axis, w.angle));
    (w.written ??= new THREE.Quaternion()).copy(q);
  }
}
// The storm cloud's lightning: a light that flares at each of the attack's thunder times and
// dies away, shining only while it flares.
function thunder(v, e) {
  const g = e.mode === 'attack' ? attackOf(e).gust : null;
  let k = 0;
  if (g) for (const at of g.thunder) if (e.t >= at) k = Math.max(k, Math.exp(-(e.t - at) * 9) * (0.7 + 0.3 * Math.sin(e.t * 83)));
  if (k > 0.03 && !v.flash) {
    v.flash = new THREE.PointLight(0xfff0b0, 0, 5 * v.size, 2); v.flash.position.y = 1.45 * v.size;
    trackLight(v.flash, v.group);
  }
  if (!v.flash) return;
  v.flash.intensity = 8 * k;
  if (k <= 0.03) { untrackLight(v.flash); v.flash = null; }
}
// how dark its cloud is (0..1): darkening up to just before the strike, dark through it, then
// lightening again until the attack is over
const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
function gloomOf(e) {
  if (e.mode !== 'attack') return 0;
  const a = attackOf(e), hit = a.hitAt, end = a.attackTime ?? e.profile.attackTime;
  return e.t < hit + 0.15 ? ease(e.t / (hit - 0.2)) : 1 - ease((e.t - hit - 0.15) / (end - hit - 0.15));
}
// lightning inside the cloud while it gathers (sparse flickers, more as the strike nears), and
// the flash of the strike itself
function glimmer(e, v) {
  if (e.mode !== 'attack') return 0;
  const hit = attackOf(e).hitAt;
  if (e.t >= hit) return Math.exp(-(e.t - hit) * 10);
  const n = Math.sin(e.t * 53 + v.seed) * Math.sin(e.t * 31 + 2 * v.seed);
  return n > 0.82 - 0.25 * e.t / hit ? 0.5 : 0;
}
const tint = new THREE.Color(), spark = new THREE.Color(0xf2f6ff);
// the colour each material shows before the hit flash and the hover tint
function baseColor(v, m) {
  if (!m.gloom || v.gloom < 0.001 && v.glimmer < 0.001) return m.color;
  return tint.copy(m.color).lerp(v.gloomColor, v.gloom).lerp(spark, v.glimmer * 0.6);
}
function gloomStep(v, e, dt) {
  if (!v.gloomColor) return;
  const dead = e.mode === 'dead';
  v.gloom += ((dead ? 0 : gloomOf(e)) - v.gloom) * Math.min(1, dt * (dead ? 2.5 : 10));
  v.glimmer = dead ? 0 : glimmer(e, v);
}
function polish(part, { roughness = 0.2, metalness = 0.5, sheen = 0 }) {
  part.roughness = roughness; part.metalness = metalness;
  if (sheen) part.emissive.copy(part.color).multiplyScalar(sheen);
}
function glints(v, e, dt) {
  const rate = e.profile.finish?.glints;
  if (!rate || Math.hypot(e.x - player.x, e.z - player.z) > 12) return;
  const s = Math.sin(v.yaw), c = Math.cos(v.yaw), h = e.profile.height, w = e.profile.radius;
  for (let i = Math.floor(rate * dt + Math.random()); i > 0; i--) {
    const lx = rand(-1, 1) * w, lz = rand(-0.5, 0.5) * w, p = v.group.position;
    emit(glow, p.x + lx * c + lz * s, p.y + rand(0.7, 0.95) * h, p.z - lx * s + lz * c,
      { life: rand(0.18, 0.3), size: rand(0.08, 0.13), grow: -0.6, color: '#ffffff', alpha: 0.95 });
  }
}
const angleTo = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// the tentacles' own frantic shaking, on top of the clip (life: 1 alive, down to 0 dead;
// render/bossbones.js)
function flail(v, e, life) {
  if (!v.tentacles.length || life <= 0) return;
  shakeTentacles(v.tentacles, clock + v.seed, (e.profile.flail ?? 1) * life * (e.mode === 'split' ? 1.8 : 1));
}
// Particles at a point of the cube (e.x, ...) are emitted where the cube is drawn: while a portal's
// travel slides it (game/travel.js) that is `shift` (animateEnemies' off) away. (Those at a
// bone or the view's group, already where they are drawn, use emit.)
const ZERO = { x: 0, y: 0, z: 0 };
let shift = ZERO;
const here = (layer, x, y, z, o) => emit(layer, x + shift.x, y + shift.y, z + shift.z, o);
// a puff of cloud where e is (a proxy felled, a body gone or come back)
const PUFF = { colors: ['#ffffff', '#e8edf5', '#cdd3de'], size: 1 }, MINION_PUFF = { colors: ['#e0f6ff', '#9fdcff', '#ffffff'], size: 0.5 };
const puffOf = e => e.profile.puff ?? (e.summoned ? MINION_PUFF : PUFF);
function poof(e, look = PUFF, x = e.x, z = e.z) {
  const s = look.size, h = e.profile.height * 0.5, y = e.y + h, c = look.colors;
  if (Math.hypot(x - player.x, z - player.z) > 18) return;
  here(glow, x, y, z, { life: 0.25, size: 1.4 * s, grow: 1.5, color: '#ffffff', alpha: 0.6 });
  for (let i = 0; i < 26 * s + 6; i++) {
    const a = rand(0, Math.PI * 2), r = rand(0.3, 1) * s, up = rand(-0.4, 1);
    here(soft, x + Math.cos(a) * r * 0.4, y + up * h * 0.6, z + Math.sin(a) * r * 0.4, { v: [Math.cos(a) * rand(1, 2.6) * s, rand(0.2, 1.6), Math.sin(a) * rand(1, 2.6) * s],
      life: rand(0.5, 0.9), size: rand(0.25, 0.45) * s, grow: 1.4, color: c[i % c.length], alpha: 0.75, drag: 2.2 });
  }
  for (let i = 0; i < 10 * s + 4; i++)
    here(glow, x, y, z, { v: [rand(-2.5, 2.5) * s, rand(-0.5, 2.5), rand(-2.5, 2.5) * s], life: rand(0.25, 0.5), size: rand(0.05, 0.09),
      color: i % 2 ? '#ffffff' : c[1], gravity: 3, drag: 2 });
  sfx('poof', { at: { x: x + shift.x, y: y + shift.y, z: z + shift.z }, pitch: s < 1 ? 1.5 : 1 });
}
// what changed since the last frame that shows as a cloud: gone, back, or a jump (not a cube's slide:
// positions are the cube's own)
function clouds(v, e) {
  const w = v.was, gone = e.mode === 'gone';
  if (gone !== (w.mode === 'gone') && w.mode !== 'dead') poof(e, puffOf(e), gone ? w.x : e.x, gone ? w.z : e.z);
  else if (!gone && Math.hypot(e.x - w.x, e.z - w.z) > 1.5) { poof(e, PUFF, w.x, w.z); poof(e); }
  w.mode = e.mode; w.x = e.x; w.z = e.z;
}
// Burrowing (a species with `burrow`: the Squirtle, game/enemyai.js): while it is `under` the
// floor (a fluid dweller: the surface of its fluid) it sinks into it (over burrow.sink s, with a
// scrape), its bar, label and silhouette gone, and leaves a trail of dirt (of spray in a fluid, of
// its colour) as it moves down there; it pops out again.
const DIRT = ['#8a7458', '#6b5a44', '#a89070'];
const SPRAYS = { [WATER]: ['#ffffff', '#c8f0ff', '#8fd4f0'], [LAVA]: ['#fff0a0', '#ffa040', '#e0501a'], [ACID]: ['#f2ffc8', '#c0f070', '#78b838'] };
function burrowLook(v, e, dt) {
  const b = e.profile.burrow;
  if (!b) return;
  const want = e.under ? 1 : 0, near = Math.hypot(e.x - player.x, e.z - player.z) < 16;
  const wet = fluidAround(e.profile, e.x, e.y, e.z), colors = SPRAYS[wet?.fluid] ?? DIRT, top = wet ? wet.y : e.y;
  if (want !== v.underWas) {
    v.underWas = want;
    if (near) {
      sfx(want ? 'dig' : 'pop', { at: e });
      for (let i = 0; i < 16; i++) {
        const a = rand(0, Math.PI * 2), s = rand(0.6, 1.8);
        here(soft, e.x, top + 0.05, e.z, { v: [Math.cos(a) * s, rand(1, 2.6), Math.sin(a) * s], life: rand(0.4, 0.7),
          size: rand(0.05, 0.1), color: colors[i % 3], alpha: 0.95, gravity: 9, drag: 1 });
      }
    }
  }
  v.sink += Math.sign(want - v.sink) * Math.min(Math.abs(want - v.sink), dt / b.sink);
  v.model.position.y = -v.sink * e.profile.height * 1.05;
  v.ghost.opacity = v.sink > 0.02 ? 0 : GHOST_OPACITY;
  if (v.sink > 0.5) { v.bar.visible = false; v.label.visible = false; v.mark.visible = false; }
  if (v.sink > 0.9 && e.speed > 0.3 && near && Math.random() < dt * 22)
    here(soft, e.x + rand(-0.12, 0.12), top + 0.04, e.z + rand(-0.12, 0.12), { v: [rand(-0.5, 0.5), rand(0.6, 1.4), rand(-0.5, 0.5)],
      life: rand(0.35, 0.6), size: rand(0.05, 0.11), color: colors[Math.floor(Math.random() * 3)], alpha: 0.9, gravity: 7, drag: 1 });
}
// A boss whose stages are profiles of their own (Squarlo, core/enemies.js STAGE_PROFILES): while
// it changes (mode 'split', `t` s into it) it grows from the one's size to the next's in a fog
// that rolls in round it (the cube's fog thickens too: state.mist, render/look.js), with a long
// groan; its bar and label go up with it (to its chest at most: a giant's head is far up). The
// bar and the label are as big as the UI scale says (game/uiscale.js), growing upwards.
const FOG = ['#e6eef2', '#d4e0e6', '#f2f6f8'];
function sizeOf(e) {
  const stages = STAGE_PROFILES[e.boss];
  if (e.mode !== 'split' || !stages) return e.profile.size ?? 1;
  const a = stages[0].size ?? 1, b = stages[1].size ?? 1;
  return a + (b - a) * ease((e.t - 0.6) / (SQUARLO_FIGHT.morphTime - 0.8));
}
function growLook(v, e, dt) {
  const stages = STAGE_PROFILES[e.boss], grows = !!stages && (stages[0].size ?? 1) !== (stages[1].size ?? 1);
  const want = sizeOf(e), splitting = e.mode === 'split' && grows;
  if (Math.abs(want - v.size) > 1e-4) {
    v.size = want;
    v.model.scale.setScalar(v.prefab.scale * want);
    if (v.light) { v.light.distance = v.fx.light[2] * Math.sqrt(want); v.light.position.y = v.fx.light[3] * want; }
  }
  const top = Math.min(v.height * v.size, 4.4);
  v.tag.position.y = top + 0.12; v.tag.scale.setScalar(uiScale());
  if (!splitting) { v.morphing = false; return; }
  if (!v.morphing) { v.morphing = true; sfx('morph', { at: e }); }
  if (Math.hypot(e.x - player.x, e.z - player.z) > 22) return;
  const r = 0.6 + 3.2 * ease(e.t / SQUARLO_FIGHT.morphTime), h = Math.max(1, v.size * 0.6);
  for (let i = Math.floor(70 * dt + Math.random()); i > 0; i--) {
    const a = rand(0, Math.PI * 2), d = rand(0.3, 1) * r;
    here(soft, e.x + Math.cos(a) * d, e.y + rand(0, h), e.z + Math.sin(a) * d, { v: [Math.cos(a) * rand(0.2, 0.8), rand(0, 0.4), Math.sin(a) * rand(0.2, 0.8)],
      life: rand(1.2, 2.2), size: rand(0.6, 1.2), grow: 1.2, color: FOG[i % 3], alpha: 0.3, drag: 0.4 });
  }
}
// in deep water a swimmer floats (game/tide.js; an amphibian in its pond, physics/dwell.js): ripples
// spread round it as it swims
const swimming = e => {
  if (!e.profile.swims) return false;
  const s = standingAt(e.x, e.z);
  if (s?.fluid === WATER && s.y - e.y > e.profile.bodyHeight * 0.3) return true;
  return !!e.profile.wades && fluidAround(e.profile, e.x, e.y, e.z)?.fluid === WATER;
};
function ripples(v, e, dt) {
  if (!v.swim || Math.hypot(e.x - player.x, e.z - player.z) > 14 || e.under) return;
  const surface = fluidAround(e.profile, e.x, e.y, e.z)?.y;
  if (surface === undefined) return;
  const y = surfaceY(WATER, surface, WIND.value) + 0.02, n = (e.speed > 0.3 ? 14 : 3) * dt;
  if (Math.random() < n)
    here(soft, e.x + rand(-0.1, 0.1), y, e.z + rand(-0.1, 0.1), { v: [rand(-0.3, 0.3), 0.05, rand(-0.3, 0.3)], life: rand(0.6, 1),
      size: rand(0.12, 0.2) * Math.sqrt(v.size), grow: 2.2, color: '#f2fcff', alpha: 0.5, drag: 1 });
}
// Warded (Squarlo calling the tide: nothing hurts him, core/enemies.js wardedNow): water spirals
// up round him and a glow pulses in it
function wardLook(v, e, dt) {
  const a = e.mode === 'attack' ? attackOf(e) : null;
  if (!a?.ward || Math.hypot(e.x - player.x, e.z - player.z) > 20) return;
  const s = Math.sqrt(v.size), r = 0.42 * s, h = 1.1 * s, spin = clock * 7;
  for (let i = Math.floor(110 * dt + Math.random()); i > 0; i--) {
    const k = Math.random(), ang = spin + k * 9 + (i % 3) * 2.09;
    here(soft, e.x + Math.cos(ang) * r, e.y + k * h, e.z + Math.sin(ang) * r, { v: [-Math.sin(ang) * 2 * s, 0.8, Math.cos(ang) * 2 * s],
      life: rand(0.2, 0.35), size: rand(0.05, 0.09) * s, color: SPRAYS[WATER][i % 3], alpha: 0.9 });
  }
  if (Math.random() < dt * 8) here(glow, e.x, e.y + h * 0.5, e.z, { life: 0.3, size: 0.9 * s, grow: 0.6, color: '#9feaff', alpha: 0.35 });
}
// A giant striding (Squarlo grown: the gait `stride`, whose feet come down at phases 0 and 0.5,
// blender/squarlo.py): each footfall thuds and jolts the ground a little
// wet footprints of what walks over slime (render/footprints.js); not what floats, goes under the
// floor or is slime itself (`slimeborn`: they leave trails of their own), and only in the cube
// being played
function prints(e, off) {
  if (off.x || off.y || off.z || e.profile.hover || e.profile.slimeborn || e.under || e.riding) return;
  walkPrints(e, e.x, e.y, e.z, e.yaw, e.view.size, slimeAt(e.x, e.y, e.z));
}
// a hopper (`hops`: where in its gait it comes down, a Bolime) lands with a soft boing
function hops(v, e, was) {
  const at = e.profile.hops;
  if (at === undefined || e.mode === 'attack' || !(e.speed > 0.01) || Math.hypot(e.x - player.x, e.z - player.z) > 12) return;
  if (was < at && (v.phase >= at || v.phase < was)) sfx('boing', { at: e, volume: 0.35, pitch: 1 / (v.size || 1) });
}
function footfalls(v, e, gait) {
  const was = v.stepPhase ?? v.phase;
  v.stepPhase = v.phase;
  if (gait !== 'stride' || e.mode === 'attack' || !(e.speed > 0.01) || Math.hypot(e.x - player.x, e.z - player.z) > 16) return;
  for (const [h, side] of [[0.5, -1], [1, 1]]) {   // (the right foot, the left: phase 1 is the next loop's 0)
    if (!(was < h && (v.phase >= h || v.phase < was))) continue;
    const s = Math.sin(e.yaw), c = Math.cos(e.yaw), x = 0.06 * side * v.size;
    footfallFx(e.x + x * c + shift.x, e.y + shift.y, e.z - x * s + shift.z, v.size);
  }
}
// splitting: shaking, steaming
function shudder(v, e, dt) {
  const k = 0.06 * v.size;
  v.group.position.x += rand(-k, k); v.group.position.z += rand(-k, k);
  if (Math.random() < dt * 30) here(soft, e.x + rand(-0.6, 0.6), e.y + rand(0.8, 2.2), e.z + rand(-0.6, 0.6),
    { v: [rand(-0.4, 0.4), rand(0.4, 1.2), rand(-0.4, 0.4)], life: rand(0.5, 0.8), size: rand(0.2, 0.35), grow: 1.4, color: '#eef2f8', alpha: 0.5, drag: 1 });
}

// An Arm slug latched on (game/slomo.js: mode 'split') sits on top of the head of the one it holds,
// facing the way they face, held still there: on our own hero, on their head bone as the animator
// left it this frame (render/animator.js), so it rides along with every step and swing; on a friend,
// where the game says (over their head)
// It is drawn like what a figure wears (render/figure.js overGhost): after the hero's silhouette,
// else it would count as terrain hiding the hero and the silhouette would shine through it; and
// without a silhouette of its own (the head hides some of it).
const headAt = new THREE.Vector3();
function onHead(v, e) {
  const g = character.group;
  if (!v.onHead) { v.onHead = true; v.body.renderOrder = 1001; v.silhouette.visible = false; }
  if (!character.ready || !g.visible || Math.hypot(e.x - player.x, e.z - player.z) > 0.6 || Math.abs(e.y - player.y) > 1.5) return;
  character.bones.head.getWorldPosition(headAt);
  v.group.position.set(headAt.x, headAt.y + 0.2, headAt.z);
  v.yaw = g.rotation.y; v.group.rotation.y = v.yaw;
}
function offHead(v) {
  if (!v.onHead) return;
  v.onHead = false; v.body.renderOrder = 0; v.silhouette.visible = true;
}
// Totnar's parts lost by stage ({ stage: [bone names] } -> [{ stage, bones }])
const BONE_BITS = ['#efe6cf', '#ffffff', '#cfc4a8'], STICK_BITS = ['#8a6440', '#5a3e26', '#7d8a3c'];
// what e has lost by its stage, scaled away; what it loses now bursts apart first: bone shards
// for a skull, sticks and leaves for a shell, a crack and a flash of its heart
function shedParts(v, e) {
  if (!v.shed) return;
  const stage = e.stage ?? 1;
  for (const s of v.shed) if (s.stage <= stage && s.stage > v.stage) burst(v, e, s.bones);
  hideShed(v.shed, stage);
  if (stage > v.stage) v.flash2 = 1;
  v.stage = Math.max(v.stage, stage);
}
function burst(v, e, bones) {
  v.model.updateMatrixWorld(true);
  for (const b of bones) {
    const skull = /^skull/.test(b.name), p = b.getWorldPosition(tmp), colors = skull ? BONE_BITS : STICK_BITS;
    const r = skull ? 0.25 : 0.75 * v.size, n = skull ? 26 : 40;
    emit(glow, p.x, p.y, p.z, { life: 0.25, size: skull ? 0.9 : 1.6, grow: 1.3, color: skull ? '#ffffff' : '#ffb070', alpha: 0.7 });
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), u = rand(-1, 1), w = Math.sqrt(1 - u * u), sp = rand(1.5, skull ? 4 : 3.2);
      emit(skull || i % 3 ? soft : glow, p.x + Math.cos(a) * w * r, p.y + u * r, p.z + Math.sin(a) * w * r,
        { v: [Math.cos(a) * w * sp, rand(0.5, 3.5), Math.sin(a) * w * sp], life: rand(0.5, 1.1), size: rand(0.05, skull ? 0.12 : 0.1),
          color: colors[i % 3], alpha: 0.95, gravity: 9, drag: 0.8 });
    }
  }
  if (Math.hypot(e.x - player.x, e.z - player.z) < 20) sfx('shed', { at: e });
}
// The ball rolls by the distance covered along the heading; before a roll it spins up in place,
// and once dead it spins down. Rolling fast it sheds leaves and twigs; a sudden turn while it
// rolls is a bounce off something: a thump and dust.
function tumble(v, e, dt) {
  if (!v.ball) return;
  const a = e.mode === 'attack' ? attackOf(e) : null, roll = a?.roll, radius = e.profile.tumble * v.size;
  let rate;
  if (e.mode === 'dead') rate = v.tumble * Math.exp(-dt * 3);
  else if (roll && e.t < roll.from) rate = roll.speed / radius * Math.min(1, e.t / roll.from) ** 2;
  else {
    const d = dt > 1e-4 && v.rolled ? (e.x - v.rolled.x) * Math.sin(e.yaw) + (e.z - v.rolled.z) * Math.cos(e.yaw) : 0;
    rate = Math.abs(d) < 0.6 && dt > 1e-4 ? d / dt / radius : 0;
  }
  v.tumble += (rate - v.tumble) * Math.min(1, dt * 12);
  v.rolled = { x: e.x, z: e.z };
  v.turned = (v.turned + v.tumble * dt) % (2 * Math.PI);
  turnBall(v.ball, v.turned);
  const rolling = roll && e.t >= roll.from && e.t < roll.to, near = Math.hypot(e.x - player.x, e.z - player.z) < 14;
  if (rolling && v.lastYaw !== undefined && Math.abs(Math.atan2(Math.sin(e.yaw - v.lastYaw), Math.cos(e.yaw - v.lastYaw))) > 0.6) {
    sfx('thud', { at: e, pitch: 0.6 }); sfx('rustle', { at: e });
    for (let i = 0; i < 16; i++) {
      const ang = rand(0, Math.PI * 2), s = rand(1, 2.6);
      here(soft, e.x, e.y + 0.2, e.z, { v: [Math.cos(ang) * s, rand(0.3, 1.2), Math.sin(ang) * s], life: rand(0.5, 0.9),
        size: rand(0.25, 0.4), grow: 1.2, color: '#c9c0ae', alpha: 0.45, drag: 2.5 });
    }
    if (Math.hypot(e.x - player.x, e.z - player.z) < 7) cameraKick(0, 0, 0, 0.07);
  }
  v.lastYaw = e.yaw;
  const litter = e.profile.litter, fast = Math.abs(v.tumble) * radius;
  if (litter && near && fast > 2) for (let i = Math.floor(fast * 3 * dt + Math.random()); i > 0; i--) {
    const ang = rand(0, Math.PI * 2);
    here(soft, e.x + Math.cos(ang) * radius * 0.8, e.y + rand(0.2, 1.4), e.z + Math.sin(ang) * radius * 0.8,
      { v: [rand(-0.6, 0.6), rand(0.4, 1.4), rand(-0.6, 0.6)], life: rand(0.6, 1.1), size: rand(0.05, 0.09), color: litter[i % litter.length],
        alpha: 0.95, gravity: 3, drag: 1.2 });
  }
  if (rolling && near && Math.random() < dt * 20)   // dust kicked up
    here(soft, e.x + rand(-0.4, 0.4), e.y + 0.1, e.z + rand(-0.4, 0.4), { v: [rand(-0.5, 0.5), rand(0.2, 0.7), rand(-0.5, 0.5)],
      life: rand(0.5, 0.8), size: rand(0.25, 0.4), grow: 1.2, color: '#c9c0ae', alpha: 0.35, drag: 1.5 });
}
// his `dark` changing (game/totnar.js): his heart flares, the darkness sucked into him or the
// light bursting out of him, with a sound
function lightTurns(v, e, dt) {
  v.flash2 = Math.max(0, (v.flash2 ?? 0) - dt * 1.5);
  const dark = e.dark ?? 0;
  if (dark === v.dark) return;
  v.dark = dark; v.flash2 = 1;
  if (Math.hypot(e.x - player.x, e.z - player.z) > 24) return;
  sfx(dark ? 'gloom' : 'dawn', { at: e });
  const y = e.y + 1.1 * v.size;
  here(glow, e.x, y, e.z, { life: 0.4, size: 2.4, grow: dark ? -0.8 : 2, color: dark ? '#ff4018' : '#fff0c0', alpha: 0.7 });
  for (let i = 0; i < 40; i++) {
    const a = rand(0, Math.PI * 2), u = rand(-0.3, 1), r = rand(2, 4), life = rand(0.5, 0.8);
    const x = e.x + Math.cos(a) * r, z = e.z + Math.sin(a) * r, yy = y + u * 1.5;
    here(soft, dark ? x : e.x, dark ? yy : y, dark ? z : e.z, { v: dark ? [(e.x - x) / life, (y - yy) / life, (e.z - z) / life]
      : [Math.cos(a) * r / life, u * 2, Math.sin(a) * r / life], life, size: rand(0.25, 0.45), grow: dark ? -0.5 : 1,
      color: dark ? '#14101c' : '#fff4d8', alpha: dark ? 0.6 : 0.4, drag: dark ? 0 : 1.5 });
  }
}

// A ghost of the past (game/rewind.js: Renew's minions as they were in a phase gone by, fighting
// the hero's echo): pale blue and see-through (`ghostAlpha` fading it in and out), no bar, no
// name, no silhouette, its glow dimmed
const GHOST_TINT = new THREE.Color('#cfe6ff');
function ghostLook(v, e) {
  const a = 0.45 * (e.ghostAlpha ?? 1);
  v.material.opacity = (e.mode === 'dead' ? v.material.opacity : 1) * a;
  v.material.depthWrite = false;
  for (const c of v.colors) c.lerp(GHOST_TINT, 0.55);
  v.ghost.opacity = 0;
  v.bar.visible = v.label.visible = v.mark.visible = false;
  if (v.light) v.light.intensity *= 0.4 * (e.ghostAlpha ?? 1);
  if (a < 0.01) v.group.visible = false;
}
function makeView(e, prefab) {
  const group = new THREE.Group(), { model, mesh, material, parts, shell } = dressEnemy(prefab, e.profile), size = e.profile.size ?? 1;
  model.scale.multiplyScalar(size);
  group.add(model); scene.add(group);
  group.userData.figure = true;   // (casts into the realtime shadow maps as the quality level asks: render/shadows.js)
  material.transparent = true;   // fades out once dead
  const gloom = e.profile.gloom;
  const named = roles => new Set((roles ?? []).flatMap(role => e.profile.parts?.[role] ?? [role]));
  const gloomy = named(gloom?.parts), finish = e.profile.finish, polished = named(finish?.parts);
  for (const p of parts) {
    if (polished.has(p.name)) polish(p, finish);
    p.gloom = gloomy.has(p.name);
  }
  paintParts(material, parts);
  // silhouette shown where the body is hidden behind terrain (like the player's); drawn
  // before the body, so it never shows the body's own back parts through its front
  const ghost = ghostMaterial(), reach = reachOf(mesh, e);
  const silhouette = new THREE.SkinnedMesh(mesh.geometry, ghost);
  silhouette.bind(mesh.skeleton, mesh.bindMatrix);
  silhouette.renderOrder = -1; silhouette.boundingSphere = mesh.boundingSphere;
  silhouette.userData.sharedGeo = true;
  mesh.add(silhouette);   // same world transform as the body
  // actions: walk, fast?, death and one per attack clip (keyed like attack.clip, else 'attack')
  const mixer = new THREE.AnimationMixer(model), actions = {}, weights = {};
  // (and the other gaits a model has, `gaits`: swimming, a giant's stride, played like the walk)
  const clips = { walk: prefab.walk, fast: prefab.fast, death: prefab.death, ...prefab.attacks, ...prefab.gaits };
  for (const [name, clip] of Object.entries(clips)) if (clip) {
    const a = mixer.clipAction(clip);
    if (name !== 'walk' && name !== 'fast' && !prefab.gaits?.[name]) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    a.play(); a.timeScale = 0; a.setEffectiveWeight(name === 'walk' ? 1 : 0); actions[name] = a;
    weights[name] = name === 'walk' ? 1 : 0;
  }
  const color = guardianColor(e.guardianRole);
  // the bar, the label over it and the "!" over that, together over the head (growLook places and sizes them)
  const tag = new THREE.Group(); tag.position.y = e.profile.height + 0.12; group.add(tag);
  const hpBar = makeBar({ onTop: true, ...e.guardian && { color, w: e.guardianRole === 'descent' ? 1.2 : .9 } }), bar = hpBar.group;
  tag.add(bar);
  const label = makeLevelLabel(e.level, { onTop: true, ...e.guardian && { color, title: guardianTitle(e.guardianRole, e.profile) } });
  label.position.y = .21; tag.add(label);
  const mark = makeAlertMark(); mark.position.y = .5; tag.add(mark);
  const fx = GLOW[e.profile.fx ?? e.profile.species] ?? (e.guardian ? { light: [color, 2, 3, .5], pulse: .35 } : null), flames = [];
  model.traverse(o => { if (o.isBone && /^flame/.test(o.name)) flames.push(o); });
  let light = null;
  if (fx?.light) {
    const [color, intensity, distance, y] = fx.light;
    light = new THREE.PointLight(e.profile.light ?? color, intensity, distance * size, 2); light.position.y = y * size;
    trackLight(light, group);
  }
  const embers = typeof fx?.embers?.from === 'string' ? model.getObjectByName(fx.embers.from) : null;
  const tentacles = e.profile.flail ? findTentacles(model) : [];
  if (e.proxy || e.summoned) poof(e, puffOf(e));   // it turns up
  return { tentacles, was: { mode: e.mode, x: e.x, z: e.z }, group, model, mixer, actions, prefab, material, shell, parts, body: mesh, silhouette, colors: material.userData.parts.color, ghost, reach, tag, bar, hpBar, label, mark, markT: 0, yaw: e.yaw, phase: e.phase,
    attacks: -1, dead: false, weights, fx, flames, light, embers, size, wheels: findWheels(model), roll: 0, spin: 0, rolled: null, waves: findWaves(model), whirl: 1, rings: findRings(model), ringSpeed: 0, flash: null, trail: null, sparks: e.profile.sparks ?? EMBERS, seed: Math.random() * 100,
    gloomColor: gloom ? new THREE.Color(...toLinear(gloom.color)) : null, gloom: 0, glimmer: 0,
    shed: findShed(model, e.profile.shed), stage: e.stage ?? 1, dark: e.dark ?? 0, ball: findBall(model, e.profile.tumble), tumble: 0, turned: 0, flash2: 0,
    sink: e.under ? 1 : 0, underWas: e.under ? 1 : 0, height: e.profile.height / size, morphing: false, swim: false,
    fog: e.profile.species === 'foggery' ? makeFoggeryLook(model, group) : null, slomo: e.profile.species === 'slomo' ? makeSlomoLook(model) : null,
    mansk: e.profile.species === 'mansk' ? makeManskLook(model) : null, monteur: e.profile.species === 'monteur' ? makeMonteurLook(model) : null, moose: e.profile.species === 'moose',
    qualmos: e.profile.species === 'qualmos' ? makeQualmosLook(group) : null, rig: makeRig(model, RIGS[e.profile.species]) };
}
// IK over the clips (render/ik.js): looking at the hero, feet on the ground, a reach round the hit.
// Only near the hero and in the cube being played (not one sliding away through a portal).
const IK_NEAR = 16, REACH = 0.6, heroAt = new THREE.Vector3(), clawAt = new THREE.Vector3();
const groundUnder = (x, z, top) => { if (!state.map) return null; const h = groundAt(x, z, top, 0).h; return h === -Infinity ? null : h; };
// how much a melee attack's reach shows: rising to the hit, then letting go
function strikeReach(e) {
  const a = e.mode === 'attack' ? attackOf(e) : null;
  if (!a || !(a.hitReach > 0) || a.projectile || a.cast) return 0;
  return ease((e.t - a.hitAt + 0.3) / 0.3) * (1 - ease((e.t - a.hitAt - 0.05) / 0.3));
}
function poseEnemy(v, e, dt, off, alive) {
  const rig = v.rig;
  if (!rig) return;
  const d = Math.hypot(e.x - player.x, e.z - player.z), near = d < IK_NEAR && !off.x && !off.y && !off.z && dt > 0;
  if (!near && !rig.dirty) return;
  const sees = alive && near && !e.ghost && player.hp > 0 && e.mode !== 'split' && e.mode !== 'gone' && !e.under
    && (d < e.profile.aggro + 1.5 || !['idle', 'home', 'wander'].includes(e.mode));
  if (sees) {
    if (character.ready) character.bones.head.getWorldPosition(heroAt); else heroAt.set(player.x, player.visY + 0.7, player.z);
  }
  const stands = alive && near && !e.profile.hover && !v.swim && !e.under && !e.falling && e.mode !== 'split';
  const r = alive && near ? strikeReach(e) * REACH : 0;
  poseRig(rig, dt, { look: sees ? heroAt : null, ground: stands ? groundUnder : null, base: e.y,
    reach: r > 0 ? { at: clawAt.set(player.x, player.visY + 0.45, player.z), w: r } : null, weight: near ? 1 : 0 });
}
// the hover clip's beat (matches blender/triangle.py): sharp, twice per loop
const beat = phase => (0.5 + 0.5 * Math.cos(2 * Math.PI * 2 * phase)) ** 6;
function glowFx(v, e, dt, life) {
  const fx = v.fx, t = clock + v.seed;
  if (!fx) return;
  if (fx.flicker && life > 0) v.flames.forEach((b, i) => {   // on top of the clip's own flicker (undone by unflicker)
    (b.userData.rest ??= { s: new THREE.Vector3(), q: new THREE.Quaternion() }).s.copy(b.scale); b.userData.rest.q.copy(b.quaternion);
    v.flickered = true;
    b.scale.multiplyScalar(1 + 0.1 * Math.sin(t * 13 + i * 2.1) * Math.sin(t * 5.3 + i));
    b.quaternion.multiply(wobble.setFromAxisAngle(axis, 0.12 * Math.sin(t * 9 + i * 1.7)));
  });
  const swing = fx.pulse ? 1 + fx.pulse * (beat(v.phase) - 0.3) : 0.82 + 0.18 * Math.sin(t * 23) * Math.sin(t * 7.1);
  const grow = fx.grow?.[(e.stage ?? 1) - 1] ?? 1;
  if (v.light) v.light.intensity = fx.light[1] * swing * life * grow * (1 + 2.5 * v.flash2);
  if (fx.pulse) v.material.emissiveIntensity = (0.6 + 0.4 * life) * swing;   // every part's glow (times its own strength)
  if (fx.flare) {   // eyes flaring up to the strike
    const a = e.mode === 'attack' ? attackOf(e) : null, up = a ? Math.min(1, e.t / Math.max(0.1, a.hitAt)) : 0;
    v.material.emissiveIntensity = life * (1 + fx.flare * up * up);
    if (v.light) v.light.intensity *= 1 + fx.flare * up * up;
  }
  if (fx.embers && life > 0.3 && Math.hypot(e.x - player.x, e.z - player.z) < 12)
    for (let i = Math.floor(fx.embers.rate * dt * life + Math.random()); i > 0; i--) {
      const s = fx.embers.spread;
      if (v.embers) v.embers.getWorldPosition(tmp); else tmp.set(v.group.position.x, v.group.position.y + fx.embers.from * v.size, v.group.position.z);
      emit(glow, tmp.x + rand(-s, s), tmp.y + rand(0, s), tmp.z + rand(-s, s), { v: [rand(-0.2, 0.2), rand(0.6, 1.3), rand(-0.2, 0.2)],
        spread: 0.2, life: rand(0.5, 0.9), size: rand(0.04, 0.07), color: v.sparks[i % v.sparks.length], gravity: -0.3, drag: 0.8 });
    }
}
// Put the flame bones back to the clip's pose before the mixer runs: the mixer only writes a
// bone when its pose changed (not while paused or idle), so the flicker would pile up on itself
// frame after frame and the flames grow without end.
function unflicker(v) {
  if (!v.flickered) return;
  v.flickered = false;
  for (const b of v.flames) if (b.userData.rest) { b.scale.copy(b.userData.rest.s); b.quaternion.copy(b.userData.rest.q); }
}
function dying(v, e, dt, off) {
  if (e.proxy) {   // up in a cloud, nothing left
    if (!v.dead) { v.dead = true; if (v.was.mode !== 'gone') poof(e); }
    v.group.visible = false;
    return;
  }
  if (!v.dead) {
    v.dead = true;
    offHead(v);   // (an Arm slug dropping off a head)
    for (const a of Object.values(v.actions)) a.setEffectiveWeight(0);
    v.actions.death.reset().play().setEffectiveWeight(1);
    v.actions.death.timeScale = 0;
  }
  v.actions.death.time = Math.min(e.deadT, v.actions.death.getClip().duration);
  const fade = Math.max(0, 1 - Math.max(0, e.deadT - e.profile.deathTime - 0.5) / 0.8);
  gloomStep(v, e, dt);
  v.material.opacity = fade;
  if (v.shell) v.shell.material.opacity = v.shell.opacity * fade;
  v.parts.forEach((p, i) => { if (p.gloom) v.colors[i].copy(baseColor(v, p)); });
  v.ghost.opacity = GHOST_OPACITY * fade;
  v.bar.visible = false; v.label.visible = false; v.mark.visible = false;
  v.group.visible = fade > 0;
  restoreRig(v.rig);
  v.mixer.update(0);
  spinWheels(v, e, dt); turnWaves(v, e, dt); spinRings(v, e, dt); thunder(v, e); wetTrail(v, e, dt, off);
  shedParts(v, e); tumble(v, e, dt);
  if (v.fog) foggeryLook(v, e, dt);
  flail(v, e, Math.max(0, 1 - e.deadT / (e.profile.deathTime * 0.5)));
  glowFx(v, e, 0, Math.max(0, 1 - e.deadT / e.profile.deathTime) * fade);   // the glow dies with it
  if (v.mansk) manskLook(v, e, dt, off);
  if (v.monteur) monteurLook(v, e, dt, off);
  poseEnemy(v, e, dt, off, false);   // (letting go)
  if (v.qualmos) qualmosLook(v, e);
}
// Enemy views are made a few a frame: a cube's whole lineup at once (a horde's two dozen) held
// its first frame up. An enemy without one yet is not drawn; entering, they are all made while
// the new cube still fades in (game/travelfx.js) or behind the curtain.
const VIEW_BUDGET = 4;   // ms of a call making views (at least one)
export function animateEnemies(list, dt, off = ZERO) {
  clock += dt;
  shift = off;
  const t0 = performance.now();
  let made = 0;
  for (const e of list) {
    if (isFlimmer(e)) { animateFlimmers([e], dt, off); continue; }   // (a figure of its own, render/flimmerview.js)
    if (isSquirtle(e)) { animateSquirtles([e], dt, off); continue; }   // (drawn as its fluid, render/squirtleview.js)
    if (isFigure(e)) { animateFigures([e], dt, off); continue; }   // (Renew: a figure, render/renewview.js)
    const prefab = prefabs[e.profile.species];
    if (!prefab?.ready) { prefab?.load(); continue; }   // not loaded before (a friend's, a dev spawn): shown once it is
    if (!e.view) {
      if (made && performance.now() - t0 > VIEW_BUDGET) continue;
      e.view = makeView(e, prefab); made++;
    }
    const v = e.view, A = v.actions;
    unflicker(v);
    // A ram commits to its direction before contact; visuals must match the hit cone.
    v.yaw = e.mode === 'attack' ? e.yaw : angleTo(v.yaw, e.yaw, Math.min(1, dt * 14));
    v.group.position.set(e.x + off.x, e.y + off.y, e.z + off.z);
    v.group.rotation.y = v.yaw;
    placeFloor(v, e, dt, off);
    if (e.mode === 'dead') { dying(v, e, dt, off); if (e.ghost) ghostLook(v, e); continue; }
    if (!e.ghost && !e.staged) clouds(v, e);   // (a boss's intro moves him as it likes: no clouds)
    v.group.visible = e.mode !== 'gone';
    if (e.mode === 'gone') { if (v.light) v.light.intensity = 0; continue; }
    if (e.mode === 'split' && e.profile.latches) onHead(v, e);
    else {
      offHead(v);
      if (e.mode === 'split' && !STAGE_PROFILES[e.boss]) shudder(v, e, dt);
    }
    growLook(v, e, dt);
    // an attack's clip; or a pose (a boss's intro, game/reveals.js: { clip, t }), played like one
    const posed = e.pose && A[e.pose.clip] ? e.pose : null;
    const attack = e.mode === 'attack' || !!posed, strike = posed ? A[posed.clip] : A[attackOf(e).clip ?? 'attack'];
    const struck = posed ? `pose:${posed.clip}` : e.attacks;
    if (attack && v.attacks !== struck) {
      v.attacks = struck; strike.reset().play(); strike.timeScale = 0;
    }
    // turning on the spot it steps round too: its feet go round as far as the turn takes them
    // (`turnStride`: cells from its middle to its feet, else its radius)
    const turning = v.turnedYaw === undefined ? 0 : Math.abs(Math.atan2(Math.sin(v.yaw - v.turnedYaw), Math.cos(v.yaw - v.turnedYaw))) * (e.profile.turnStride ?? e.profile.radius);
    v.turnedYaw = v.yaw;
    // the gait: walking, or swimming in deep water, or a giant's stride (each with its own pace);
    // standing still, a model with an idle of its own (Qualmos's) plays it, on its own clock
    v.swim = swimming(e);
    const still = A.idle && !attack && !(e.speed > 0.01) && !(turning > 0.01 * dt);
    const gait = v.swim && A.swim ? 'swim' : still ? 'idle' : e.profile.gait && A[e.profile.gait] ? e.profile.gait : 'walk', W = A[gait];
    // a bigger body takes longer strides
    const walkSpeed = (gait === 'walk' || gait === 'idle' ? prefab.walkSpeed : prefab.gaitSpeeds[gait]) * v.size, fastSpeed = prefab.fastSpeed * v.size;
    const fast = A.fast && gait === 'walk' ? THREE.MathUtils.clamp((e.speed - walkSpeed) / (fastSpeed - walkSpeed), 0, 1) : 0;
    const stride = walkSpeed * W.getClip().duration * (1 - fast)
      + (A.fast ? fastSpeed * A.fast.getClip().duration * fast : 0);
    if (e.profile.hover || gait === 'swim') v.phase = (v.phase + dt / W.getClip().duration * (gait === 'swim' ? 0.6 + 0.4 * Math.min(1, e.speed / walkSpeed) : 1)) % 1;   // keeps hovering (paddling)
    else if (!attack && (e.speed > 0.01 || turning > 0.01 * dt)) v.phase = (v.phase + (dt * e.speed + turning) / stride) % 1;
    else if (!attack) v.phase = 0; // idle on both planted feet, not frozen mid-step
    hops(v, e, v.stepPhase ?? v.phase);
    footfalls(v, e, gait);
    if (gait === 'idle') v.idleT = ((v.idleT ?? v.seed) + dt) % W.getClip().duration;
    W.time = gait === 'idle' ? v.idleT : v.phase * W.getClip().duration;
    if (A.fast) A.fast.time = v.phase * A.fast.getClip().duration;
    if (attack) strike.time = Math.min(posed ? posed.t : e.t, strike.getClip().duration);
    for (const name in A) {
      const target = name === gait ? (attack ? 0 : 1 - fast) : name === 'fast' ? (attack ? 0 : fast)
        : name === 'walk' || prefab.gaits?.[name] ? 0 : +(attack && A[name] === strike);
      v.weights[name] += (target - v.weights[name]) * Math.min(1, dt * 18);
      A[name].setEffectiveWeight(v.weights[name]);
    }
    const flash = Math.min(0.6, e.hurtT / 0.22 * 0.6);
    gloomStep(v, e, dt);
    v.parts.forEach((p, i) => v.colors[i].copy(baseColor(v, p)).lerp(flash > 0.1 || !e.hovered ? white : hover, Math.max(flash, e.hovered ? 0.22 : 0)));
    v.bar.visible = !!e.guardian || !!e.hovered || !e.hordeId && e.hp < e.profile.hp;
    v.label.visible = v.bar.visible || !e.hordeId && Math.hypot(e.x - player.x, e.z - player.z) < e.profile.aggro + 1;
    if (e.mode === 'split' && e.profile.latches) v.bar.visible = v.label.visible = false;   // (on a head: no bar over it)
    if (bossBarred(e)) v.bar.visible = v.label.visible = false;   // a boss's (and his proxies'): on the screen (game/bossbar.js)
    // a guardian always says what it is; any other enemy while hovered (or locked on: what a
    // click goes for, game/pointer.js), else only its level
    if (!e.guardian) v.label.setLevel(e.level, e.hovered ? enemyName(e.profile) : null);
    inverseYaw.setFromAxisAngle(up, -v.yaw);
    v.bar.quaternion.copy(inverseYaw).multiply(camera.quaternion);
    v.hpBar.set(e.hp / e.profile.hp);
    // "!" while it reacts to noticing you: pops up, then shrinks away once it gives chase
    v.markT = e.mode === 'alert' ? Math.min(v.markT + dt * 8, 1) : Math.max(v.markT - dt * 2, 0);
    v.mark.visible = v.markT > 0;
    v.mark.scale.setScalar(0.5 * (e.mode === 'alert' ? 1 + 0.35 * Math.sin(Math.PI * v.markT) : v.markT));
    restoreRig(v.rig);
    v.mixer.update(0);
    spinWheels(v, e, dt); turnWaves(v, e, dt); spinRings(v, e, dt); thunder(v, e); wetTrail(v, e, dt, off); flail(v, e, 1);
    poseEnemy(v, e, dt, off, true);
    prints(e, off);
    shedParts(v, e); tumble(v, e, dt); lightTurns(v, e, dt);
    burrowLook(v, e, dt); ripples(v, e, dt); wardLook(v, e, dt);
    if (v.fog) foggeryLook(v, e, dt);
    if (v.slomo) slomoLook(v, e, dt);
    if (v.monteur) monteurLook(v, e, dt, off);
    if (v.moose) mooseLook(v, e, dt, off);
    if (v.qualmos) qualmosLook(v, e);
    glowFx(v, e, dt, 1); glints(v, e, dt);
    if (v.mansk) manskLook(v, e, dt, off);   // (after the glow: it brightens his diamond)
    if (e.ghost) ghostLook(v, e);
    introLook(v, e, dt);
  }
}
// A boss's intro (game/bossintro.js): no bars or names over anybody's head. A boss in his intro (game/reveals.js): `veil` fades him in (0: not there, his light out too),
// and `dressView(v, dt)` does what his reveal does to the view (Totnar's skulls popping up)
function introLook(v, e, dt) {
  if (e.veil !== undefined) {
    const a = Math.min(1, Math.max(0, e.veil));
    v.material.opacity = a; v.material.depthWrite = a > 0.99;
    if (v.light) v.light.intensity *= a;
    v.group.visible = a > 0.01;
    v.veiled = true;
  } else if (v.veiled) { v.veiled = false; v.material.opacity = 1; v.material.depthWrite = true; }
  if (state.intro?.full) v.bar.visible = v.label.visible = v.mark.visible = false;   // (nothing over anybody's head meanwhile)
  // `clipBelow` (a height): nothing of him under it is drawn (Foggery under his lava, which is
  // see-through; Monteur coming up out of the floor, Qualmos out of his lagoon)
  const clip = e.clipBelow ?? null;
  if ((clip !== null) !== !!v.clip) {
    v.clip = clip !== null ? new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) : null;
    for (const m of [v.material, v.ghost, v.shell?.material]) if (m) { m.clippingPlanes = v.clip ? [v.clip] : null; m.needsUpdate = true; }
  }
  if (v.clip) { v.clip.constant = -(clip + shift.y); v.ghost.opacity = 0; }   // (nor a silhouette of him through the floor meanwhile)
  e.dressView?.(v, dt);
}
// An enemy of each of these kinds made once off-screen, for the shaders it is drawn with
// (render/warmup.js, render/cubeassets.js): its body, silhouette, bar, label and the puddle a
// wet one leaves. Each kind once (the programs stay), and only kinds whose model is in.
// -> { objects to compile, dispose() }
const warmed = new Set(), ORIGIN = { x: 0, y: 0, z: 0 };
export function enemyWarmup(kinds) {
  const list = [];
  for (const k of kinds) {
    const kind = ENEMY_KINDS[k], prefab = kind && prefabs[kind.species];
    if (warmed.has(k) || !prefab?.ready || kind.species === 'squirtle') continue;   // (squirtleWarmup)
    warmed.add(k);
    const e = makeEnemy({ id: 'warm:' + k, x: 0, y: 0, z: 0, yaw: 0, level: 1,
      ...(kind.guardian && { guardian: true, guardianRole: kind.guardianRole, boss: kind.boss }) }, kind);
    const v = e.view = makeView(e, prefab);
    scene.remove(v.group);
    if (v.light) untrackLight(v.light);   // (no light out of nowhere meanwhile)
    e.mode = 'dead'; wetTrail(v, e, 0, ORIGIN);
    for (const p of v.trail?.list ?? []) scene.remove(p.mesh);
    list.push(e);
  }
  list.push(...flimmerWarmup(kinds));   // (the Flimmers: the hero's figure, blurred)
  list.push(...squirtleWarmup(kinds));   // (the Squirtles: drawn as their fluid)
  return { objects: list.flatMap(e => [e.view.group, ...(e.view.trail?.list ?? []).map(p => p.mesh)]), dispose: () => removeEnemyViews(list) };
}

export function removeEnemyViews(list) {
  removeFigureViews(list); removeFlimmerViews(list); removeSquirtleViews(list);
  for (const e of list) if (e.view) {
    const v = e.view;
    scene.remove(v.group);
    if (v.light) untrackLight(v.light);
    if (v.flash) untrackLight(v.flash);
    removeTrail(v); forgetWalker(e);
    if (v.fog) disposeFoggeryLook(v.fog);
    if (v.mansk) disposeManskLook(v.mansk);
    if (v.qualmos) disposeQualmosLook(v.qualmos);
    v.mixer.stopAllAction(); v.mixer.uncacheRoot(v.model);
    v.material.dispose(); v.shell?.material.dispose();
    v.ghost.dispose();
    v.label.material.map.dispose(); v.label.material.dispose();
    const skeletons = new Set();
    v.model.traverse(o => { if (o.isSkinnedMesh) skeletons.add(o.skeleton); });
    skeletons.forEach(s => s.dispose());
    e.view = null;
  }
}

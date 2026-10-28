// IK over the clips (render/ik.js, render/rigs.js), checked on every creature with a rig, off the
// scene: its rig's bones are all there; standing half on a step, each foot that stood on the
// floor (in its walk's first frame) stands on the ground under it (the step or the floor); and its head turns towards something to its side. Run in the game's page:
//   JSON.stringify(await (await import('/tests/browser/ik.js?v=' + Date.now())).runIkChecks())
import * as THREE from 'three';
import { RIGS, FIGURE_RIG } from '../../src/render/rigs.js';
import { makeRig, restoreRig, poseRig, IK } from '../../src/render/ik.js';
import { dressEnemy } from '../../src/render/enemymodel.js';
import { rig as figureRig, rigReady, createFigure } from '../../src/render/figure.js';

const MODELS = {
  spider: 'spidermodel.js#spiderModel', stunder: 'stundermodel.js#stunderModel', snake: 'snakemodel.js#snakeModel',
  octonaut: 'octonautmodel.js#octonautModel', fireface: 'firefacemodel.js#fireFaceModel', triangle: 'trianglemodel.js#triangleModel',
  firecat: 'firecatmodel.js#fireCatModel', shraps: 'shrapsmodel.js#shrapsModel', spicy: 'spicymodel.js#spicyModel',
  wolla: 'wollamodel.js#wollaModel', wolk: 'wolkmodel.js#wolkModel', gusto: 'gustomodel.js#gustoModel', totnar: 'totnarmodel.js#totnarModel',
  snapskull: 'snapskullmodel.js#snapSkullModel', squarlo: 'squarlomodel.js#squarloModel', mecked: 'meckedmodel.js#meckedModel',
  tornado: 'tornadomodel.js#tornadoModel', slug: 'slugmodel.js#slugModel', bolime: 'bolimemodel.js#bolimeModel',
  foggery: 'foggerymodel.js#foggeryModel', slomo: 'slomomodel.js#slomoModel', mansk: 'manskmodel.js#manskModel',
  monteur: 'monteurmodel.js#monteurModel', moose: 'moosemodel.js#mooseModel', qualmos: 'qualmosmodel.js#qualmosModel',
};
const v = new THREE.Vector3(), w = new THREE.Vector3();
const sole = (leg, out) => out.copy(leg.sole).applyMatrix4((leg.end ?? leg.lower).matrixWorld);

// one creature (or the figure: `make` gives { model, play(t) }): -> { name, missing, legs, ... }
function check(name, spec, model, play) {
  const warned = [], warn = console.warn;
  console.warn = (...a) => warned.push(a.join(' '));
  const rig = makeRig(model, spec);
  console.warn = warn;
  const out = { name, missing: warned, legs: rig.legs.length, arms: rig.arms.length, eyes: rig.eyes.length, look: rig.look.length };
  const group = new THREE.Group();
  group.add(model);
  const pose = () => { restoreRig(rig); play(); group.updateMatrixWorld(true); };
  // its feet as the clip has them on level ground
  pose();
  const rest = rig.legs.map(l => sole(l, new THREE.Vector3()).y), planted = rest.map(y => Math.abs(y) < 0.03);
  if (rig.legs.length) {
    // a step up on its right (x < 0: the model faces +z, its left is +x): as high as a fifth of its legs
    const len = rig.legs.map(l => l.upper.getWorldPosition(v).distanceTo(l.lower.getWorldPosition(w))).reduce((a, b) => Math.max(a, b), 0) * 2;
    const step = 0.2 * len, ground = (x) => x < 0 ? step : 0;
    for (let i = 0; i < 60; i++) { pose(); poseRig(rig, 1 / 30, { ground: (x) => ground(x), base: 0 }); }
    out.step = +step.toFixed(3);
    out.off = rig.legs.map((l, i) => {
      if (!planted[i]) return null;
      sole(l, v);
      return +(v.y - rest[i] - ground(v.x)).toFixed(3);
    }).filter(x => x !== null);
    out.worst = Math.max(0, ...out.off.map(Math.abs));
    out.legState = rig.legs.map(l => (l.locked ? 'L' : l.step ? 'S' : '-') + (l.slip ?? 0).toFixed(2));
    out.ok = out.worst < 0.25 * step + 0.01;
  }
  if (rig.look.length || rig.eyes.length) {
    // something to its left, level with its head
    pose();
    const head = (rig.look.at(-1) ?? rig.eyes[0]).bone, before = head.getWorldQuaternion(new THREE.Quaternion());
    head.getWorldPosition(v);
    const at = v.clone().add(new THREE.Vector3(3, 0, 3));
    for (let i = 0; i < 60; i++) { pose(); poseRig(rig, 1 / 30, { look: at }); }
    out.turned = +(head.getWorldQuaternion(new THREE.Quaternion()).angleTo(before)).toFixed(2);
    out.lookOk = out.turned > 0.3;
  }
  pose();
  return out;
}

export async function runIkChecks(only = null) {
  const results = [];
  for (const [species, path] of Object.entries(MODELS)) {
    if (only && !only.includes(species)) continue;
    const [file, name] = path.split('#'), prefab = (await import(`../../src/render/${file}`))[name];
    await prefab.load();
    if (!prefab.ready) { results.push({ name: species, error: prefab.error ?? 'not loaded' }); continue; }
    const { model } = dressEnemy(prefab, null);
    const mixer = new THREE.AnimationMixer(model), walk = mixer.clipAction(prefab.walk);
    walk.play();
    results.push(check(species, RIGS[species], model, () => { walk.time = 0; mixer.update(0); }));
  }
  if (!only || only.includes('figure')) {
    await rigReady;
    const f = createFigure();
    results.push(check('figure', FIGURE_RIG, f.model, () => {}));
  }
  return { failed: results.filter(r => r.missing?.length || r.error || r.ok === false || r.lookOk === false).map(r => r.name), results };
}

// Feet that stand stay put (render/ik.js foot locking), on a live enemy: it turns on the spot
// (`rate` radians a second, for `time` s) and every foot that stands (held by IK; with IK off: down
// in the clip) is followed over the floor from one frame to the next it still stands; -> how far they slid in all (cells), per foot
// standing a second, and how many steps the feet took. Compare with IK.on = false.
export async function runSkateCheck(find = e => e.boss, { rate = 1.6, time = 3 } = {}) {
  const { allEnemies } = await import('../../src/game/enemies.js');
  const e = allEnemies().find(find);
  if (!e?.view?.rig) return { error: 'no such enemy with a rig' };
  const rig = e.view.rig, was = new Map();
  let slid = 0, stood = 0, steps = 0, last = performance.now();
  const yaw0 = e.yaw;
  await new Promise(done => {
    const end = last + time * 1000;
    const tick = () => {
      const now = performance.now(), dt = (now - last) / 1000;
      last = now;
      e.yaw += rate * dt;
      rig.legs.forEach(leg => {
        const p = new THREE.Vector3().copy(leg.sole).applyMatrix4((leg.end ?? leg.lower).matrixWorld);
        // (down in the clip: measured here, not by IK, which may be off; its leg's length as at rest)
        leg.rest ??= leg.upper.getWorldPosition(new THREE.Vector3()).distanceTo(leg.lower.getWorldPosition(new THREE.Vector3())) * 2;
        const standing = IK.on ? !!leg.locked : p.y - e.y < 0.07 * leg.rest;
        const before = was.get(leg);
        if (standing && before) { slid += Math.hypot(p.x - before.x, p.z - before.z); stood += dt; }
        if (leg.step && !leg.counted) { steps++; leg.counted = true; } else if (!leg.step) leg.counted = false;
        was.set(leg, standing ? p : null);
      });
      if (now < end) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  e.yaw = yaw0;
  return { species: e.profile.species, slid: +slid.toFixed(3), perFootSecond: +(slid / Math.max(stood, 1e-6)).toFixed(3), steps };
}

// How well each walk clip's standing feet match the pace the game plays it at (enemies.js: one
// loop covers walkSpeed x its duration): a foot down slides back under the body as fast as the body
// walks, or the feet skate (and foot locking makes up for it with steps of its own). -> per creature:
// the standing feet's mean speed back along the body (cells/s, at the walk's pace) / that pace
export async function runStrideChecks(only = null) {
  const out = [];
  for (const [species, path] of Object.entries(MODELS)) {
    if (only && !only.includes(species)) continue;
    const [file, name] = path.split('#'), prefab = (await import(`../../src/render/${file}`))[name];
    await prefab.load();
    if (!prefab.ready || !RIGS[species]?.legs) continue;
    const { model } = dressEnemy(prefab, null), group = new THREE.Group();
    group.add(model);
    const rig = makeRig(model, RIGS[species]), mixer = new THREE.AnimationMixer(model), walk = mixer.clipAction(prefab.walk);
    walk.play();
    const T = prefab.walk.duration, n = 60, dt = T / n, speed = prefab.walkSpeed;
    const pos = l => sole(l, new THREE.Vector3());
    let back = 0, stood = 0, low = Infinity;
    const at = t => { walk.time = t; mixer.update(0); group.updateMatrixWorld(true); return rig.legs.map(pos); };
    for (const p of at(0)) low = Math.min(low, p.y);
    for (let i = 0; i < n; i++) {
      const a = at(i * dt), b = at((i + 1) * dt);
      a.forEach((p, k) => { if (p.y < low + 0.02 && b[k].y < low + 0.02) { back += (p.z - b[k].z) / dt; stood++; } });
    }
    out.push({ species, pace: +speed.toFixed(2), feetBack: +(back / Math.max(stood, 1)).toFixed(2), ratio: +(back / Math.max(stood, 1) / speed).toFixed(2) });
  }
  return out;
}

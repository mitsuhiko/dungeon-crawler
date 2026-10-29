// Beams in the air (game/beams.js): the Spicy's laser. Two thin beams, one from each of its
// floating eyes (the model's eye bones; the muzzle while it has no view), meet where the beam
// ends. Each is a bright core in a soft glow; both swell and flicker harder as the burst comes
// near. Where it ends a light flickers and sparks sizzle off.
// The Wolk's lightning (a beam of kind 'bolt') shows where it will strike before it does: the
// cloud's dark shadow on the floor under its target, ringed by crackling light that tightens
// and flashes once it holds still (drawn plainly, not added on, so it reads on bright floors),
// sparks gathering under the cloud, and in its last moments faint leaders flickering down
// towards the spot. The strike itself (strikeBolt, from game/juice.js) is a jagged flash from
// the cloud to the spot, with a branch or two, that flickers twice and lights up the floor. A
// bolt out of the sky (Totnar's) gathers a dark storm cloud high above its spot. A giant's stomp
// (kind 'stomp', Squarlo's) shows his foot's shadow where it will come down; a geyser (kind
// 'geyser', Foggery's) glowing cracks where fire will burst out of the floor.
import * as THREE from 'three';
import { scene } from './scene.js';
import { glow, soft, emit, rand } from './particles.js';
import { trackLight, untrackLight } from './lightpool.js';

const tube = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0);   // +Y, 0 to 1
const ball = new THREE.IcosahedronGeometry(1, 1);
const EYES = ['eye.L', 'eye.R'].map(n => THREE.PropertyBinding.sanitizeNodeName(n));
const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), start = new THREE.Vector3(), end = new THREE.Vector3();

function makeView(b) {
  if (b.spec.kind === 'bolt') return makeBoltView(b);
  if (b.spec.kind === 'stomp') return makeStompView(b);
  if (b.spec.kind === 'geyser') return makeGeyserView(b);
  const color = new THREE.Color(b.profile?.beamColor ?? b.spec.color ?? '#7dff3a');
  const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  const core = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').lerp(color, 0.3), ...additive });
  const halo = new THREE.MeshBasicMaterial({ color, opacity: 0.4, ...additive });
  const group = new THREE.Group(), rays = [];
  for (let i = 0; i < 2; i++) {
    const c = new THREE.Mesh(tube, core), h = new THREE.Mesh(tube, halo);
    c.frustumCulled = h.frustumCulled = false;
    group.add(c, h); rays.push({ core: c, halo: h });
  }
  const spot = new THREE.Mesh(ball, halo);
  const light = new THREE.PointLight(color, 2.5, 3, 2);
  group.add(spot); scene.add(group); trackLight(light, spot);   // a light source, not in the scene
  return { group, rays, spot, light, owned: [core, halo], colors: ['#ffffff', '#' + color.getHexString(), '#d8ff7a'] };
}
function eyeAt(b, i, off, out) {
  const bone = b.enemy?.view?.model.getObjectByName(EYES[i]);
  if (bone) return bone.getWorldPosition(out);
  return out.set(b.x + off.x, b.y + off.y, b.z + off.z);
}
export function drawBeams(list, dt, off = { x: 0, y: 0, z: 0 }) {
  drawStrikes(dt, off); drawEruptions(dt, off);
  for (const b of list) {
    const v = b.view || (b.view = makeView(b));
    if (b.spec.kind === 'bolt') { drawBolt(b, v, dt, off); continue; }
    if (b.spec.kind === 'stomp') { drawStomp(b, v, dt, off); continue; }
    if (b.spec.kind === 'geyser') { drawGeyser(b, v, dt, off); continue; }
    const k = Math.min(1, b.t / b.spec.time), t = b.t;
    const flick = 0.75 + 0.25 * Math.sin(t * 61) * Math.sin(t * 23) + 0.3 * k * Math.sin(t * 97);
    end.set(b.ex + off.x, b.ey + off.y, b.ez + off.z);
    v.rays.forEach((r, i) => {
      eyeAt(b, i, off, start);
      dir.subVectors(end, start);
      const length = dir.length();
      for (const m of [r.core, r.halo]) { m.position.copy(start); m.quaternion.setFromUnitVectors(up, dir.normalize()); }
      r.core.scale.set((0.012 + 0.014 * k) * flick, length, (0.012 + 0.014 * k) * flick);
      r.halo.scale.set((0.035 + 0.05 * k) * flick, length, (0.035 + 0.05 * k) * flick);
    });
    v.owned[1].opacity = 0.3 + 0.25 * k;
    v.spot.position.copy(end); v.spot.scale.setScalar((0.07 + 0.08 * k) * flick);
    v.light.intensity = (1.5 + 2.5 * k) * flick;
    for (let i = Math.floor((40 + 60 * k) * dt + Math.random()); i > 0; i--)   // sizzling where it ends
      emit(glow, end.x, end.y, end.z, { v: [rand(-1.2, 1.2), rand(0.4, 2), rand(-1.2, 1.2)], spread: 0.05, life: rand(0.15, 0.3),
        size: rand(0.05, 0.1), color: v.colors[i % 3], gravity: 5, drag: 2 });
  }
}
export function removeBeamViews(list) {
  for (const b of list) if (b.view) {
    scene.remove(b.view.group); untrackLight(b.view.light);
    b.view.owned.forEach(m => m.dispose()); b.view = null;
  }
}

// --- the Wolk's lightning ---------------------------------------------------------------------
const flat = new THREE.RingGeometry(0.72, 1, 40).rotateX(-Math.PI / 2), disc = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
const side = new THREE.Vector3(), lift = new THREE.Vector3(), a = new THREE.Vector3(), b2 = new THREE.Vector3();
const boltColor = b => b.profile?.beamColor ?? b.spec.color ?? '#fff6b0';
const GLOW_BLUE = '#9fd0ff', RING_BLUE = new THREE.Color('#4fb2ff'), RING_FLASH = new THREE.Color('#ffffff');

// a zigzag line of `n` segments from `from` to `to`, kinked sideways by up to `amp` × its length
// (most in the middle, the ends fixed): world points
export function zigzag(from, to, n, amp) {
  dir.subVectors(to, from);
  const length = dir.length();
  side.crossVectors(dir, up); if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize(); lift.crossVectors(side, dir).normalize();
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, w = i === 0 || i === n ? 0 : amp * length * (0.4 + 0.6 * Math.sin(Math.PI * k));
    pts.push(from.clone().addScaledVector(dir, k).addScaledVector(side, (Math.random() - 0.5) * 2 * w)
      .addScaledVector(lift, (Math.random() - 0.5) * w));
  }
  return pts;
}
// segments (a bright core in a glow, like the laser) along `pts`; spare ones are hidden
export function makeSegments(group, count, core, halo) {
  return Array.from({ length: count }, () => {
    const c = new THREE.Mesh(tube, core), h = new THREE.Mesh(tube, halo);
    c.frustumCulled = h.frustumCulled = false; c.visible = h.visible = false;
    group.add(c, h);
    return { core: c, halo: h };
  });
}
export function layOut(segments, pts, width, from = 0) {
  let i = from;
  for (let k = 0; k + 1 < pts.length && i < segments.length; k++, i++) {
    const s = segments[i];
    a.copy(pts[k]); dir.subVectors(pts[k + 1], a);
    const length = dir.length();
    for (const [m, w] of [[s.core, width], [s.halo, width * 2.6]]) {
      m.position.copy(a); m.quaternion.setFromUnitVectors(up, dir.normalize());
      m.scale.set(w, length, w); m.visible = true;
    }
  }
  return i;
}
export const hideFrom = (segments, i) => { for (; i < segments.length; i++) segments[i].core.visible = segments[i].halo.visible = false; };

function makeBoltView(b) {
  const color = new THREE.Color(boltColor(b)), blue = new THREE.Color(GLOW_BLUE);
  const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  const plain = { transparent: true, depthWrite: false };
  const ringMat = new THREE.MeshBasicMaterial({ color: RING_BLUE, opacity: 0.85, ...plain });
  const fillMat = new THREE.MeshBasicMaterial({ color: '#1a2233', opacity: 0.2, ...plain });
  const core = new THREE.MeshBasicMaterial({ color: '#ffffff', opacity: 0.4, ...additive });
  const halo = new THREE.MeshBasicMaterial({ color, opacity: 0.12, ...additive });
  const group = new THREE.Group(), ring = new THREE.Mesh(flat, ringMat), fill = new THREE.Mesh(disc, fillMat);
  ring.renderOrder = fill.renderOrder = 2;
  group.add(ring, fill);
  const leaders = makeSegments(group, 16, core, halo);
  const light = new THREE.PointLight(blue, 0, 2.2, 2); light.position.y = 0.35;
  scene.add(group); trackLight(light, ring);
  return { group, ring, fill, leaders, light, owned: [ringMat, fillMat, core, halo], colors: ['#ffffff', '#' + color.getHexString(), GLOW_BLUE],
    leaderT: 0, from: new THREE.Vector3(), to: new THREE.Vector3() };
}
function drawBolt(b, v, dt, off) {
  const k = Math.min(1, b.t / b.spec.time), t = b.t, held = b.spec.lock && b.t >= b.spec.time - b.spec.lock;
  const r = b.spec.radius + 0.12, x = b.ex + off.x, y = b.ey + off.y, z = b.ez + off.z;
  // the ring gathers in from wide, tightens to the spot once it holds still and flashes faster
  const flick = held ? 0.6 + 0.4 * Math.sign(Math.sin(t * 70)) : 0.8 + 0.2 * Math.sin(t * 23);
  v.ring.position.set(x, y + 0.03, z); v.fill.position.set(x, y + 0.025, z);
  const gather = Math.min(1, k / (1 - (b.spec.lock || 0) / b.spec.time));   // 0 -> 1 until it holds still
  v.ring.scale.setScalar(r * (1.6 - 0.6 * gather) * (1 + 0.04 * Math.sin(t * 31)));
  v.ring.rotation.y = t * 2.5;
  v.fill.scale.setScalar(r);
  v.owned[0].opacity = 0.5 + 0.45 * k * flick;
  v.owned[0].color.copy(RING_BLUE).lerp(RING_FLASH, held ? 0.5 + 0.5 * Math.max(0, Math.sin(t * 70)) : 0);
  v.owned[1].opacity = 0.12 + 0.28 * k;   // its shadow deepens
  v.light.intensity = (0.3 + 0.8 * k) * flick;
  // crackles round the ring, sparks gathering under the cloud
  for (let i = Math.floor((10 + 40 * k) * dt + Math.random()); i > 0; i--) {
    const ang = Math.random() * Math.PI * 2;
    emit(glow, x + Math.cos(ang) * r, y + 0.05, z + Math.sin(ang) * r, { v: [rand(-0.4, 0.4), rand(0.5, 1.6), rand(-0.4, 0.4)],
      life: rand(0.12, 0.25), size: rand(0.04, 0.07), color: v.colors[i % 3], gravity: 3, drag: 2 });
  }
  v.from.set(b.x + off.x, b.y + off.y, b.z + off.z);
  if (b.spec.sky) for (let i = Math.floor((10 + 20 * k) * dt + Math.random()); i > 0; i--)   // a storm cloud gathering up there
    emit(soft, v.from.x + rand(-0.9, 0.9), v.from.y + rand(-0.2, 0.3), v.from.z + rand(-0.9, 0.9), { v: [rand(-0.3, 0.3), rand(-0.1, 0.1), rand(-0.3, 0.3)],
      life: rand(0.5, 0.9), size: rand(0.5, 0.9), grow: 0.6, color: i % 2 ? '#2a2e3a' : '#3c4252', alpha: 0.5 + 0.3 * k, drag: 0.5 });
  for (let i = Math.floor((8 + 30 * k) * dt + Math.random()); i > 0; i--)
    emit(glow, v.from.x + rand(-0.25, 0.25), v.from.y + rand(-0.05, 0.1), v.from.z + rand(-0.15, 0.15),
      { v: [rand(-0.6, 0.6), rand(-0.8, 0.2), rand(-0.6, 0.6)], life: rand(0.08, 0.18), size: rand(0.03, 0.06), color: v.colors[i % 3], drag: 3 });
  // faint leaders feeling their way down, now and then, once it holds still
  v.leaderT -= dt;
  if (held && v.leaderT <= 0) {
    v.leaderT = rand(0.05, 0.12);
    let used = 0;
    if (Math.random() < 0.75) {
      v.to.set(x, y + 0.05, z);
      const reach = rand(0.3, 0.75), pts = zigzag(v.from, b2.copy(v.from).lerp(v.to, reach), 6, 0.18);
      used = layOut(v.leaders, pts, 0.008);
    }
    hideFrom(v.leaders, used);
  } else if (!held) hideFrom(v.leaders, 0);
}

// --- a giant's stomp (Squarlo's) -----------------------------------------------------------------
// His foot's shadow on the floor where it will come down: a dark disc that grows and deepens as
// the foot comes, ringed with a pulsing white edge that holds still (and flashes) once the foot
// is on its way, and pebbles twitching on the ground under it.
function makeStompView(b) {
  const plain = { transparent: true, depthWrite: false };
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', opacity: 0.7, ...plain });
  const fillMat = new THREE.MeshBasicMaterial({ color: '#0e1a22', opacity: 0.2, ...plain });
  const group = new THREE.Group(), ring = new THREE.Mesh(flat, ringMat), fill = new THREE.Mesh(disc, fillMat);
  ring.renderOrder = fill.renderOrder = 2;
  group.add(ring, fill);
  const light = new THREE.PointLight('#bff4ff', 0, 2, 2); light.position.y = 0.3;
  scene.add(group); trackLight(light, ring);
  return { group, ring, fill, light, owned: [ringMat, fillMat] };
}
function drawStomp(b, v, dt, off) {
  const k = Math.min(1, b.t / b.spec.time), t = b.t, held = b.spec.lock && b.t >= b.spec.time - b.spec.lock;
  const r = b.spec.radius, x = b.ex + off.x, y = b.ey + off.y, z = b.ez + off.z;
  v.ring.position.set(x, y + 0.03, z); v.fill.position.set(x, y + 0.025, z);
  v.ring.scale.setScalar(r * (held ? 1 + 0.05 * Math.sin(t * 40) : 1.3 - 0.3 * k));
  v.fill.scale.setScalar(r * (0.5 + 0.5 * k));
  v.owned[0].opacity = held ? 0.6 + 0.4 * Math.max(0, Math.sin(t * 40)) : 0.35 + 0.35 * k;
  v.owned[1].opacity = 0.15 + 0.45 * k * k;
  v.light.intensity = held ? 0.8 : 0;
  if (held && Math.random() < dt * 30) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r;
    emit(soft, x + Math.cos(a) * d, y + 0.04, z + Math.sin(a) * d, { v: [0, rand(0.8, 1.6), 0], life: 0.3, size: rand(0.03, 0.06),
      color: '#9a8a70', alpha: 0.9, gravity: 9 });
  }
}

// strikes in flight: { from, to (world), t, width, branches, light, view }
let strikes = [];
const STRIKE = 0.34;   // how long a strike lights up
// b: { x, y, z (where it comes from), ex, ey, ez (where it strikes), spec or profile (its colour) };
// the player's lightning (game/juice.js) a thinner one, `width`, with fewer `branches` and a
// dimmer `light`
export function strikeBolt(b) {
  const color = new THREE.Color(boltColor(b));
  const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  const core = new THREE.MeshBasicMaterial({ color: '#ffffff', ...additive });
  const halo = new THREE.MeshBasicMaterial({ color: new THREE.Color(GLOW_BLUE).lerp(color, 0.25), opacity: 0.35, ...additive });
  const group = new THREE.Group(), anchor = new THREE.Object3D();
  group.add(anchor);
  const segments = makeSegments(group, 26, core, halo);
  const light = new THREE.PointLight(color, 0, 6, 2); light.position.y = 0.6;
  scene.add(group); trackLight(light, anchor);
  strikes.push({ from: new THREE.Vector3(b.x, b.y, b.z), to: new THREE.Vector3(b.ex, b.ey, b.ez), t: 0, shape: -1, pts: null,
    width: b.width ?? 0.013, branches: b.branches ?? 2, light: b.light ?? 9, view: { group, anchor, segments, light, owned: [core, halo] } });
}
// bright, a dim gap, a second stroke, then fading
const strength = t => t < 0.06 ? 1 : t < 0.1 ? 0.2 : t < 0.16 ? 0.95 : Math.max(0, 0.95 * (1 - (t - 0.16) / (STRIKE - 0.16)));
const offset = (v, off) => b2.set(v.x + off.x, v.y + off.y, v.z + off.z);
function drawStrikes(dt, off) {
  strikes = strikes.filter(s => {
    s.t += dt;
    const v = s.view;
    if (s.t >= STRIKE) { removeStrike(s); return false; }
    const shape = s.t < 0.1 ? 0 : 1;   // each stroke takes its own path
    if (shape !== s.shape) {
      s.shape = shape;
      const from = s.from.clone().add(off), to = offset(s.to, off).clone();
      const main = zigzag(from, to, 12, 0.09);
      let used = layOut(v.segments, main, s.width);
      for (let n = 0; n < s.branches; n++) {   // a branch or two off the main stroke
        const at = main[2 + Math.floor(Math.random() * 7)], end = at.clone().lerp(to, rand(0.25, 0.5))
          .add(new THREE.Vector3(rand(-0.5, 0.5), 0, rand(-0.5, 0.5)));
        used = layOut(v.segments, zigzag(at, end, 5, 0.2), s.width * 0.55, used);
      }
      hideFrom(v.segments, used);
    }
    const k = strength(s.t);
    v.owned[0].opacity = k; v.owned[1].opacity = 0.35 * k;
    v.anchor.position.copy(offset(s.to, off));
    v.light.intensity = s.light * k;
    return true;
  });
}
function removeStrike(s) {
  scene.remove(s.view.group); untrackLight(s.view.light);
  s.view.owned.forEach(m => m.dispose());
}
export function clearStrikes() { strikes.forEach(removeStrike); strikes = []; eruptions.forEach(removeEruption); eruptions = []; }

// --- Foggery's fire geysers ----------------------------------------------------------------------
// Where one will burst (a beam of kind 'geyser' out of the floor, game/beams.js): a ring of glowing
// cracks that follows the player, tightens and flashes once it holds still, the floor in it
// glowing redder, embers and drops of lava bubbling up out of it. When it bursts (eruptGeyser,
// game/juice.js) a column of fire shoots up out of the spot and dies down.
const FIRE = ['#fff0a0', '#ffb040', '#ff5a14'], RING_FIRE = new THREE.Color('#ff7a1a');
function makeGeyserView(b) {
  const plain = { transparent: true, depthWrite: false }, additive = { ...plain, blending: THREE.AdditiveBlending };
  const ringMat = new THREE.MeshBasicMaterial({ color: RING_FIRE, opacity: 0.8, ...plain });
  const fillMat = new THREE.MeshBasicMaterial({ color: '#ff3a0a', opacity: 0.1, ...additive });
  const group = new THREE.Group(), ring = new THREE.Mesh(flat, ringMat), fill = new THREE.Mesh(disc, fillMat);
  ring.renderOrder = fill.renderOrder = 2;
  group.add(ring, fill);
  const light = new THREE.PointLight('#ff7a2a', 0, 2.6, 2); light.position.y = 0.3;
  scene.add(group); trackLight(light, ring);
  return { group, ring, fill, light, owned: [ringMat, fillMat] };
}
function drawGeyser(b, v, dt, off) {
  const k = Math.min(1, b.t / b.spec.time), t = b.t, held = b.spec.lock && b.t >= b.spec.time - b.spec.lock;
  const r = b.spec.radius + 0.1, x = (b.ax ?? b.ex) + off.x, y = (b.ay ?? b.ey) + off.y - 0.03, z = (b.az ?? b.ez) + off.z;
  v.ring.position.set(x, y + 0.04, z); v.fill.position.set(x, y + 0.035, z);
  v.ring.scale.setScalar(r * (held ? 1 + 0.06 * Math.sin(t * 50) : 1.5 - 0.5 * k));
  v.ring.rotation.y = -t * 2;
  v.fill.scale.setScalar(r * (0.6 + 0.4 * k));
  v.owned[0].opacity = held ? 0.6 + 0.4 * Math.max(0, Math.sin(t * 60)) : 0.45 + 0.4 * k;
  v.owned[0].color.copy(RING_FIRE).lerp(RING_FLASH, held ? 0.4 * Math.max(0, Math.sin(t * 60)) : 0);
  v.owned[1].opacity = 0.1 + 0.35 * k;
  v.light.intensity = (0.4 + 1.6 * k) * (0.8 + 0.2 * Math.sin(t * 29));
  for (let i = Math.floor((8 + 40 * k) * dt + Math.random()); i > 0; i--) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r;
    emit(glow, x + Math.cos(a) * d, y + 0.05, z + Math.sin(a) * d, { v: [rand(-0.3, 0.3), rand(0.6, 1.8) * (0.5 + k), rand(-0.3, 0.3)],
      life: rand(0.2, 0.45), size: rand(0.04, 0.08), color: FIRE[i % 3], gravity: 4, drag: 1.5 });
  }
}
// a column of fire bursting up out of the spot of geyser b
let eruptions = [];
const ERUPT = 0.9, column = new THREE.CylinderGeometry(0.7, 1, 1, 16, 1, true).translate(0, 0.5, 0);
export function eruptGeyser(b) {
  const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide };
  const outer = new THREE.MeshBasicMaterial({ color: '#ff6a1a', opacity: 0.6, ...additive });
  const inner = new THREE.MeshBasicMaterial({ color: '#ffe080', opacity: 0.8, ...additive });
  const group = new THREE.Group(), a = new THREE.Mesh(column, outer), c = new THREE.Mesh(column, inner);
  a.frustumCulled = c.frustumCulled = false;
  const at = { x: b.ax ?? b.ex, y: b.ay ?? b.ey, z: b.az ?? b.ez };
  group.add(a, c); group.position.set(at.x, at.y - 0.05, at.z);
  const light = new THREE.PointLight('#ff8a3a', 0, 6, 2); light.position.y = 1;
  scene.add(group); trackLight(light, group);
  eruptions.push({ t: 0, at, r: b.spec.radius, h: b.spec.sky ?? 3, view: { group, a, c, light, owned: [outer, inner] } });
}
function drawEruptions(dt, off) {
  eruptions = eruptions.filter(e => {
    e.t += dt;
    if (e.t >= ERUPT) { removeEruption(e); return false; }
    const v = e.view, up = Math.min(1, e.t / 0.12), fade = 1 - Math.max(0, (e.t - 0.35) / (ERUPT - 0.35));
    v.group.position.set(e.at.x + off.x, e.at.y + off.y - 0.05, e.at.z + off.z);
    const wob = 1 + 0.08 * Math.sin(e.t * 47);
    v.a.scale.set(e.r * wob * (0.8 + 0.3 * fade), e.h * up * (0.6 + 0.4 * fade), e.r * wob * (0.8 + 0.3 * fade));
    v.c.scale.set(e.r * 0.55 * wob, e.h * 0.85 * up, e.r * 0.55 * wob);
    v.a.rotation.y = e.t * 5; v.c.rotation.y = -e.t * 7;
    v.owned[0].opacity = 0.6 * fade; v.owned[1].opacity = 0.85 * fade;
    v.light.intensity = 7 * fade * up;
    return true;
  });
}
function removeEruption(e) {
  scene.remove(e.view.group); untrackLight(e.view.light);
  e.view.owned.forEach(m => m.dispose());
}

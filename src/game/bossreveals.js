// How each real boss after Gusto and Totnar appears in his intro (game/bossintro.js runs it,
// core/bossintro.js has its moments in `at` and the camera's shots; docs/bosses.md "The intro").
// Each is a reveal like those in game/reveals.js: { start, step, end }, and `seen` / `where` for
// the camera, `fits` if it cannot always be played (then the drop is). What they share is in
// game/revealkit.js.
import * as THREE from 'three';
import { player, state } from './state.js';
import { LH, N } from '../core/constants.js';
import { cellAt } from '../physics/collide.js';
import { emit, glow, soft, rand } from '../render/particles.js';
import { showShadow, showEyes, showPool, showBeam, hideIntroFx } from '../render/introfx.js';
import { sfx } from '../audio/sfx.js';
import { quake, cameraKick } from './juice.js';
import { clamp01, smooth, facing, faceCamera, warp, once, roar, landFx, splashFx, rippleFx, bubbleFx, fluidTop,
  wayIn, wayY } from './revealkit.js';

// a little too big, then back (0 .. 1 of the way)
const popped = u => u <= 0 ? 1e-4 : 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2;
// a bone's own scale, kept the first time and put back each frame before a reveal changes it
// (the mixer writes only what a clip moves)
function rest(D, b) {
  const m = (D.rest ??= new Map());
  if (!m.has(b)) m.set(b, b.scale.clone());
  return m.get(b);
}

// --- Squarlo: up on a spout out of his water, down with a plop, calling the tide -----------------

const SEA = ['#ffffff', '#e8fbff', '#a8e6f0', '#5fc4d8'];
// how high the spout has him at t (cells over his spot): up fast, slowing at the top, falling back
function spout(at, t) {
  if (t < at.burst || t >= at.land) return 0;
  if (t < at.top) { const u = (t - at.burst) / (at.top - at.burst); return at.height * (1 - (1 - u) ** 2); }
  const u = (t - at.top) / (at.land - at.top);
  return at.height * (1 - u * u);
}
// water spiralling up round (x, y, z): `r` cells out, `rate` drops a second, turning at t
function swirl(x, y, z, r, t, dt, rate, up = 1.2) {
  for (let i = Math.floor(rate * dt + Math.random()); i > 0; i--) {
    const a = t * 7 + rand(0, Math.PI * 2), d = r * rand(0.6, 1.1);
    emit(soft, x + Math.cos(a) * d, y + rand(0, 0.15), z + Math.sin(a) * d, { v: [-Math.sin(a) * 2.2, rand(0.5, 1) * up, Math.cos(a) * 2.2],
      life: rand(0.35, 0.6), size: rand(0.025, 0.055), color: SEA[i % SEA.length], alpha: 0.8, drag: 1.5 });
  }
}
const squarlo = {
  seen: r => ({ x: r.e.x, y: Math.max(r.e.y, r.spot.y), z: r.e.z }),
  where: (r, t) => ({ ...r.spot, y: r.spot.y + spout(r.at, t) }),
  start(r) {
    const { e, spot } = r;
    r.data.water = fluidTop(spot.x, spot.z, spot.y) ?? spot.y;
    Object.assign(e, { veil: 0, x: spot.x, y: spot.y, z: spot.z, yaw: facing(spot, player) });
  },
  step(r, t, dt) {
    const { e, spot, at } = r, D = r.data, w = D.water, h = spout(at, t);
    e.y = spot.y + h;
    e.veil = t >= at.burst ? 1 : 0;
    // the water swirling on his spot, faster and faster
    if (t >= at.swirl && t < at.burst) swirl(spot.x, w, spot.z, 0.5 - 0.2 * clamp01((t - at.swirl) / (at.burst - at.swirl)), t, dt, 40 + 80 * clamp01((t - at.swirl) / 1.1), 0.6);
    if (once(D, 'swirl', t, at.swirl)) { sfx('whirl', { at: spot, pitch: 1.3, volume: 0.6 }); sfx('drip', { at: spot, pitch: 0.7 }); }
    // the spout: bursting up, him on top of it, spinning
    if (once(D, 'burst', t, at.burst)) {
      sfx('spray', { at: spot, pitch: 0.7, volume: 1 }); sfx('splash', { at: spot, pitch: 0.9, volume: 1 });
      splashFx(spot.x, w, spot.z, { colors: SEA, n: 40, up: 7, wide: 1.6, size: [0.03, 0.07] });
      rippleFx(spot.x, w, spot.z, 0.3, SEA);
    }
    if (t >= at.burst && t < at.land) {
      const top = spot.y + h;
      for (let i = Math.floor(150 * dt + Math.random()); i > 0; i--) {
        const y = w + rand(0, Math.max(0, top - w)), a = rand(0, Math.PI * 2), d = rand(0.05, 0.2) * (t < at.top ? 1 : 1.6);
        emit(soft, spot.x + Math.cos(a) * d, y, spot.z + Math.sin(a) * d, { v: [Math.cos(a) * 0.8, t < at.top ? rand(1.5, 3) : rand(-2, 0), Math.sin(a) * 0.8],
          life: rand(0.25, 0.45), size: rand(0.04, 0.09), color: SEA[i % SEA.length], alpha: 0.75, gravity: 6, drag: 0.6 });
      }
      e.yaw += dt * 4 * Math.PI / (at.land - at.burst);   // (twice round on the way)
    } else faceCamera(r, dt, t < at.burst ? Infinity : 5);
    // springing up out of it, tucked, and reaching his feet down for the plop (a giant's jump, quicker)
    e.pose = t >= at.burst && t < at.cast ? { clip: 'jump', t: warp([[at.burst, 0.55], [at.land, 1.7], [at.cast, 1.85]], t) }
      : t >= at.cast && t < at.release ? { clip: 'cast', t: Math.min(1.9, (t - at.cast) * 1.05) } : null;
    if (once(D, 'land', t, at.land)) {
      sfx('boing', { at: e, pitch: 1.5, volume: 0.8 }); sfx('splash', { at: e, pitch: 1.6, volume: 0.7 });
      splashFx(spot.x, w, spot.z, { colors: SEA, n: 24, up: 3, wide: 1.4, size: [0.03, 0.06] });
      rippleFx(spot.x, w, spot.z, 0.25, SEA);
      quake(0.01);
    }
    // calling the tide: the water spiralling up round him
    if (t >= at.cast && t < at.release - 0.3) swirl(e.x, w, e.z, 0.5, t, dt, 40, 2.4);
    if (once(D, 'call', t, at.call)) { roar(e, 1); sfx('tidecall', { at: e, pitch: 1.1, volume: 0.8 }); }
  },
  end(r) {
    Object.assign(r.e, { veil: undefined, pose: null, x: r.spot.x, y: r.spot.y, z: r.spot.z });
  },
};

// --- Flip: his rings flying in out of the dark, locking together; he cartwheels, the world turns --

const SKY = ['#ffffff', '#cfefff', '#8fd8ff'];
const RING_FROM = [[-1, 0.9, 0.2], [1, 0.5, -0.3], [0.2, -0.2, 1]];   // (right, up, ahead of the camera's frame: where each comes from)
const FAR = 7;   // cells away they come from
// how far ring i still has to come at t (1: all the way, 0: in place): fast at first, slowing
const ringOut = (at, t, i) => (1 - clamp01((t - at.rings[i]) / at.fly)) ** 3;
const ringAt = new THREE.Vector3(), ringOff = new THREE.Vector3();
function flipRings(v, r) {
  const { at, data: D, t } = r;
  v.model.updateMatrixWorld(true);
  D.rings.forEach((g, i) => {
    const b = g.bone ??= v.model.getObjectByName(`ring${i}`);
    if (!b) return;
    // (back to where the clip has it: the mixer only writes what a clip moves)
    if (g.written && b.position.equals(g.written)) b.position.copy(g.clip); else (g.clip ??= new THREE.Vector3()).copy(b.position);
    // (not there before it comes)
    if (t < at.rings[i]) b.scale.copy(rest(D, b)).multiplyScalar(1e-4); else b.scale.copy(rest(D, b));
    const k = ringOut(at, t, i);
    if (k > 1e-3) {
      const turn = k * 2.4 * (i % 2 ? -1 : 1), c = Math.cos(turn), s = Math.sin(turn);
      ringOff.set(g.off[0] * c - g.off[2] * s, g.off[1], g.off[0] * s + g.off[2] * c).multiplyScalar(k);
      b.getWorldPosition(ringAt).add(ringOff);
      b.parent.worldToLocal(ringAt);
      b.position.copy(ringAt);
      b.updateMatrixWorld(true);
      b.getWorldPosition(ringAt);
      g.at = ringAt.toArray();
    } else g.at = null;
    (g.written ??= new THREE.Vector3()).copy(b.position);
  });
}
const flip = {
  start(r) {
    const { e, spot } = r, D = r.data;
    // each ring's way in, in the world: round the camera's frame (the hero to him)
    let fx = spot.x - player.x, fz = spot.z - player.z;
    const l = Math.hypot(fx, fz) || 1;
    fx /= l; fz /= l;
    D.rings = RING_FROM.map(([right, up, ahead]) => ({ off: [(-fz * right + fx * ahead) * FAR, up * FAR * 0.6, (fx * right + fz * ahead) * FAR] }));
    Object.assign(e, { veil: 0, yaw: facing(spot, player), ringSpin: 9, dressView: v => flipRings(v, r) });
  },
  step(r, t, dt) {
    const { e, at } = r, D = r.data;
    state.introVoid = smooth((t - at.void) / 1.4);
    faceCamera(r, dt, Infinity);
    e.veil = clamp01((t - at.rings[0]) / 0.25);
    // the rings spinning wildly as they come, slowing to a stop once they are together
    e.ringSpin = t < at.lock ? 9 : t < at.flip ? 9 * (1 - smooth((t - at.lock) / (at.flip - at.lock))) : 0;
    D.rings.forEach((g, i) => {
      if (once(D, `ring${i}`, t, at.rings[i])) sfx('whirl', { at: e, pitch: 1.2 + 0.15 * i, volume: 0.7 });
      if (g.at && t >= at.rings[i]) for (let n = Math.floor(60 * dt + Math.random()); n > 0; n--)
        emit(glow, g.at[0] + rand(-0.3, 0.3), g.at[1] + rand(-0.3, 0.3), g.at[2] + rand(-0.3, 0.3), { life: rand(0.3, 0.5), size: rand(0.05, 0.1),
          color: SKY[n % 3], alpha: 0.9, drag: 1 });
      if (once(D, `in${i}`, t, at.rings[i] + at.fly)) sfx('clink', { at: e, pitch: 0.8 + 0.2 * i, volume: 0.8 });
    });
    if (once(D, 'lock', t, at.lock)) {
      sfx('ringUp', { at: e, pitch: 0.8, volume: 0.8 });
      emit(glow, e.x, e.y + 1.2, e.z, { life: 0.35, size: 2.6, grow: 1.4, color: '#bfe8ff', alpha: 0.6 });
    }
    // the cartwheel (his flip's clip), the world turning round him
    e.pose = t >= at.flip && t < at.release ? { clip: 'flip', t: t - at.flip } : null;
    if (once(D, 'flip', t, at.turn[0])) sfx('flip', { at: e, pitch: 0.8, volume: 1 });
    if (once(D, 'roar', t, at.roar)) roar(e, 0.8);
  },
  end(r) {
    Object.assign(r.e, { veil: undefined, pose: null, ringSpin: undefined, dressView: null, x: r.spot.x, y: r.spot.y, z: r.spot.z });
    const v = r.e.view;
    for (const g of r.data.rings ?? []) if (g.bone && g.clip) g.bone.position.copy(g.clip);
    for (const [b, s] of r.data.rest ?? []) b.scale.copy(s);
    if (v) v.model.updateMatrixWorld(true);
  },
};

// --- Foggery: his eyes coming up out of the lava, then the rest of him in a burst of it ------------

const LAVA = ['#fff0a0', '#ffd25a', '#ff8a2a', '#ff5a1a'], CRUST = ['#2a1a14', '#4a2a1c', '#6a3a22'];
const EYES_UP = 1.45;   // (his feet this far under the lava, his eyes are over it)
function foggeryY(r, t) {
  const { at, spot } = r, lava = r.data.lava, low = lava - r.e.profile.height - 0.3, peek = lava - EYES_UP;
  if (t < at.eyes) return low;
  if (t < at.burst) return low + (peek - low) * smooth((t - at.eyes) / (at.peek - at.eyes)) + 0.03 * Math.sin(t * 3);
  if (t < at.top) { const u = (t - at.burst) / (at.top - at.burst); return peek + (spot.y + at.height - peek) * (1 - (1 - u) ** 2); }
  if (t < at.land) { const u = (t - at.top) / (at.land - at.top); return spot.y + at.height * (1 - u * u); }
  return spot.y;
}
const foggery = {
  seen: r => ({ x: r.e.x, y: Math.max(r.e.y, r.spot.y), z: r.e.z }),
  where: (r, t) => ({ ...r.spot, y: Math.max(r.spot.y, foggeryY(r, t)) }),
  start(r) {
    const { e, spot } = r;
    r.data.lava = fluidTop(spot.x, spot.z, spot.y) ?? spot.y + 0.3;
    Object.assign(e, { x: spot.x, z: spot.z, y: foggeryY(r, 0), yaw: facing(spot, player) });
  },
  step(r, t, dt) {
    const { e, spot, at } = r, D = r.data, lava = D.lava;
    e.y = foggeryY(r, t);
    e.clipBelow = t < at.top ? lava : undefined;   // (the lava is see-through: what is under it is not drawn)
    faceCamera(r, dt, t < at.burst ? 6 : 3);
    // the lava bubbling over him, more as he comes up
    if (t >= at.bubble && t < at.burst) {
      const k = clamp01((t - at.bubble) / 1.6);
      bubbleFx(spot.x, lava, spot.z, 0.5, dt, 10 + 30 * k, LAVA, glow);
      if (Math.random() < dt * (1 + 3 * k)) rippleFx(spot.x + rand(-0.3, 0.3), lava, spot.z + rand(-0.3, 0.3), 0.15, CRUST, 0.8);
    }
    if (once(D, 'bubble', t, at.bubble)) { sfx('hiss', { at: spot, pitch: 0.5, volume: 0.7 }); sfx('sizzle', { at: spot, pitch: 0.6 }); }
    if (once(D, 'eyes', t, at.eyes + 0.6)) sfx('foggery_windup', { at: spot, pitch: 0.6, volume: 0.6 });
    // bursting up out of it, a splash of lava, and down again onto his spot
    if (once(D, 'burst', t, at.burst)) {
      sfx('fireball', { at: spot, pitch: 0.5, volume: 1 }); sfx('splash', { at: spot, pitch: 0.5, volume: 0.9 }); sfx('boom', { at: spot, pitch: 0.6, volume: 0.6 });
      splashFx(spot.x, lava, spot.z, { colors: LAVA, n: 50, up: 7, wide: 2.2, layer: glow, size: [0.06, 0.14] });
      splashFx(spot.x, lava, spot.z, { colors: CRUST, n: 18, up: 6, wide: 2, size: [0.08, 0.16] });
      quake(0.025);
    }
    if (t >= at.burst && t < at.land) for (let i = Math.floor(40 * dt + Math.random()); i > 0; i--)   // (lava dripping off him)
      emit(glow, e.x + rand(-0.35, 0.35), e.y + rand(0.2, 1.4), e.z + rand(-0.35, 0.35), { v: [0, rand(-1, 0), 0], life: rand(0.3, 0.6),
        size: rand(0.05, 0.1), color: LAVA[i % LAVA.length], gravity: 6 });
    if (once(D, 'land', t, at.land)) {
      sfx('stomp', { at: e, pitch: 0.8 }); sfx('splash', { at: e, pitch: 0.7, volume: 0.8 });
      splashFx(spot.x, lava, spot.z, { colors: LAVA, n: 30, up: 3.5, wide: 2.6, layer: glow });
      rippleFx(spot.x, lava, spot.z, 0.4, LAVA, 2.2);
      quake(0.03); cameraKick(0, 0, 0, 0.06);
    }
    // tucked in the air, then croaking, puffed up, flames out of his mouth
    e.pose = t >= at.burst && t < at.land ? { clip: 'summon', t: warp([[at.burst, 0.2], [at.top, 0.45], [at.land, 0.3]], t) }
      : t >= at.croak && t < at.release ? { clip: 'summon', t: Math.min(1.5, (t - at.croak) * 0.95) } : null;
    if (once(D, 'croak', t, at.croak + 0.9 / 0.95)) {
      roar(e, 0.8);
      const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
      for (let i = 0; i < 36; i++)
        emit(glow, e.x + fx * 0.4, e.y + 1.2, e.z + fz * 0.4, { v: [fx * rand(2, 4.5) + rand(-1, 1), rand(0.5, 2.5), fz * rand(2, 4.5) + rand(-1, 1)],
          life: rand(0.4, 0.8), size: rand(0.06, 0.14), color: LAVA[i % LAVA.length], drag: 1.2, gravity: -1 });
    }
  },
  end(r) {
    Object.assign(r.e, { pose: null, clipBelow: undefined, x: r.spot.x, y: r.spot.y, z: r.spot.z });
  },
};

// --- Renew: clocks on his spot, his ghost walking backwards onto it, whole again ----------------

const TIME = ['#ffffff', '#bdf3ff', '#ffe9a8'];
// two clock faces of light turning on (x, y, z) (as he gathers time, render/renewview.js), their
// hands racing back; `k` how bright
function clocks(x, y, z, t, dt, k, r = 0.8, s = 1) {
  for (let i = Math.floor(200 * k * dt + Math.random()); i > 0; i--) {
    const ring = i % 2, a = (ring ? -1 : 1) * t * 5 + rand(0, Math.PI * 2);
    emit(glow, x + Math.cos(a) * r, y + (ring ? 0.3 : 1.0), z + Math.sin(a) * r, { life: rand(0.2, 0.35), size: rand(0.1, 0.15) * s, color: TIME[i % 3], alpha: k });
  }
  for (const [len, speed] of [[0.65, -9], [0.42, -2]]) for (let n = 0; n < 2; n++) {
    const a = t * speed, u = Math.random();
    emit(glow, x + Math.cos(a) * len * u, y + 1.0, z + Math.sin(a) * len * u, { life: 0.15, size: 0.1 * s, color: '#ffffff', alpha: k });
  }
}
// how far along his way back onto his spot he is at t (0 .. 1)
const backAt = (at, t) => smooth((t - at.back[0]) / (at.back[1] - at.back[0]));
function renewAt(r, t) {
  const { spot } = r, from = r.data.from, k = backAt(r.at, t);
  return { x: from.x + (spot.x - from.x) * k, y: wayY(from, spot, k), z: from.z + (spot.z - from.z) * k };
}
const renew = {
  where: renewAt,
  start(r) {
    const { e, spot, at } = r, D = r.data, from = wayIn(r, at.reach) ?? { ...spot, side: 1, len: 0 };
    D.from = from;
    r.side = from.side;
    // (walking backwards: he faces the way he went, away from his spot)
    Object.assign(e, { veil: 0, spectral: true, ...renewAt(r, 0), yaw: from.len ? facing(spot, from) : facing(spot, player) });
  },
  step(r, t, dt) {
    const { e, spot, at } = r, D = r.data;
    // the clocks on his empty spot, brighter and brighter till he is on it
    if (t >= at.clocks && t < at.whole) clocks(spot.x, spot.y, spot.z, t, dt, clamp01((t - at.clocks) / 0.8));
    if (once(D, 'clocks', t, at.clocks)) sfx('clockwind', { at: spot, pitch: 0.7, volume: 0.9 });
    // his ghost, walking backwards onto it (his legs go round backwards: render/renewview.js)
    Object.assign(e, renewAt(r, t));
    e.veil = clamp01((t - at.ghost) / 0.6);
    if (once(D, 'ghost', t, at.ghost)) sfx('rewind', { at: e, pitch: 1, volume: 0.9 });
    if (t >= at.ghost && t < at.whole && Math.random() < dt * 40)
      emit(glow, e.x + rand(-0.25, 0.25), e.y + rand(0.1, 1.1), e.z + rand(-0.25, 0.25), { v: [rand(-0.2, 0.2), rand(0.4, 1), rand(-0.2, 0.2)],
        life: rand(0.5, 0.9), size: rand(0.05, 0.09), color: TIME[Math.floor(Math.random() * 3)], drag: 1 });
    // whole again, in a flash; turning to the camera and holding his weapon up, the clocks round him
    if (once(D, 'whole', t, at.whole)) {
      e.spectral = false;
      sfx('rewound', { at: e, pitch: 0.9, volume: 1 });
      emit(glow, e.x, e.y + 0.7, e.z, { life: 0.35, size: 2.2, grow: 1.5, color: '#dff6ff', alpha: 0.7 });
      for (let i = 0; i < 40; i++) {
        const a = rand(0, Math.PI * 2), s = rand(1.5, 4);
        emit(glow, e.x, e.y + rand(0.2, 1.2), e.z, { v: [Math.cos(a) * s, rand(-0.5, 1.5), Math.sin(a) * s], life: rand(0.4, 0.8), size: rand(0.05, 0.1),
          color: TIME[i % 3], drag: 2 });
      }
      quake(0.015);
    }
    if (t >= at.whole) faceCamera(r, dt, 5);
    e.pose = t >= at.raise && t < at.release ? { clip: 'cast', t: 0.4 * smooth((t - at.raise) / 0.5) } : null;
    if (t >= at.raise && t < at.release - 0.4) clocks(e.x, e.y, e.z, t, dt, 1 - clamp01((t - at.release + 1.2) / 0.8), 0.7, 0.5);
    if (once(D, 'roar', t, at.raise + 0.3)) roar(e, 0.8);
  },
  end(r) {
    Object.assign(r.e, { veil: undefined, spectral: false, pose: null, x: r.spot.x, y: r.spot.y, z: r.spot.z });
  },
};

// --- Mansk: a spotlight on the empty stage, the mask coming down into it out of the dark ----------

const HIGH = 4.6;   // cells over his floating height he comes from
const BEAM = 9;     // cells up the spotlight shines from
function liftAt(r, t) {
  const { at } = r, low = r.data.low;
  return low + HIGH * (1 - smooth((t - at.down[0]) / (at.down[1] - at.down[0])));
}
const mansk = {
  seen: r => ({ x: r.e.x, y: r.e.y + (r.e.lift ?? 0), z: r.e.z }),
  where: (r, t) => ({ ...r.spot, y: r.spot.y + liftAt(r, t) }),
  start(r) {
    const { e, spot } = r;
    r.data.low = e.lift ?? 0.35;
    Object.assign(e, { veil: 0, lift: liftAt(r, 0), yaw: facing(spot, player) });
  },
  step(r, t, dt) {
    const { e, spot, at } = r, D = r.data;
    faceCamera(r, dt, 3);
    // the spotlight: clunking on (a flicker), on till the light comes back
    const on = t < at.click ? 0 : t < at.click + 0.25 ? (Math.sin((t - at.click) * 80) > 0 ? 1 : 0.2) : 1;
    const a = on * (1 - smooth((t - at.lights) / 0.9));
    showBeam(spot.x, spot.y, spot.z, BEAM, 1.25, a);
    showPool(spot.x, spot.y, spot.z, 1.5, 0.55 * a, '#ffe6b0', true);
    if (once(D, 'click', t, at.click)) { sfx('thunk', { at: spot, pitch: 0.5, volume: 1 }); sfx('knock', { at: spot, pitch: 0.6, volume: 0.6 }); }
    if (a > 0.5 && Math.random() < dt * 14)   // (dust in the beam)
      emit(glow, spot.x + rand(-0.8, 0.8), spot.y + rand(0.3, 4), spot.z + rand(-0.8, 0.8), { v: [rand(-0.05, 0.05), rand(-0.1, 0.05), rand(-0.05, 0.05)],
        life: rand(1, 1.6), size: rand(0.03, 0.05), color: '#fff6dc', alpha: 0.5 });
    // the mask coming down out of the dark into the beam, the diamond glowing
    e.veil = clamp01((t - at.appear) / 0.9);
    e.lift = liftAt(r, t);
    e.slowing = t >= at.appear && t < at.roar + 1.5 ? 1 : 0;   // (render/manskview.js: his diamond glows)
    if (once(D, 'appear', t, at.appear)) sfx('whirl', { at: e, pitch: 0.5, volume: 0.5 });
    // and roaring, his mouth wide (his rise's clip)
    e.pose = t >= at.roar && t < at.release ? { clip: 'rise', t: Math.min(2.2, (t - at.roar) * at.rate) } : null;
    if (once(D, 'roar', t, at.roar + 0.3)) { roar(e, 0.75); sfx('gust', { at: e, pitch: 0.6, volume: 0.6 }); }
  },
  end(r) {
    Object.assign(r.e, { veil: undefined, pose: null, lift: r.data.low ?? 0.35, slowing: 0, x: r.spot.x, y: r.spot.y, z: r.spot.z });
    hideIntroFx();
  },
};

// --- Monteur: the ground cracking open, him rising up out of it, his stones, the stomp ------------

const DUST = ['#e0dacd', '#c9c0ae', '#a39d91'], CHIPS = ['#b8b0a0', '#8d877c', '#6b7b45'];
function monteurY(r, t) {
  const { at, spot } = r, deep = r.e.profile.height + 0.4;
  return spot.y - deep * (1 - smooth((t - at.rise[0]) / (at.rise[1] - at.rise[0])) ** 0.8);
}
const monteur = {
  seen: r => ({ x: r.spot.x, y: Math.max(r.e.y, r.spot.y), z: r.spot.z }),
  start(r) {
    const { e, spot } = r;
    r.data.stones = e.stones;
    Object.assign(e, { y: monteurY(r, 0), stones: 0, yaw: facing(spot, player) });
  },
  step(r, t, dt) {
    const { e, spot, at } = r, D = r.data, R = e.profile.radius * 1.4;
    faceCamera(r, dt, 2.5);
    // the ground rumbling, shaking more and more; dust and pebbles jumping
    const shaking = t >= at.rumble && t < at.rise[1] + 0.3, k = clamp01((t - at.rumble) / (at.rise[0] - at.rumble));
    if (shaking) {
      quake(0.004 + 0.012 * k);
      for (let i = Math.floor((10 + 30 * k) * dt + Math.random()); i > 0; i--) {
        const a = rand(0, Math.PI * 2), d = rand(0, R * 1.2);
        emit(soft, spot.x + Math.cos(a) * d, spot.y + 0.05, spot.z + Math.sin(a) * d, { v: [rand(-0.4, 0.4), rand(1, 3), rand(-0.4, 0.4)],
          life: rand(0.35, 0.6), size: rand(0.04, 0.08), color: CHIPS[i % 3], gravity: 9 });
        if (i % 3 === 0) emit(soft, spot.x + Math.cos(a) * d, spot.y + 0.1, spot.z + Math.sin(a) * d, { v: [rand(-0.3, 0.3), rand(0.2, 0.7), rand(-0.3, 0.3)],
          life: rand(0.8, 1.3), size: rand(0.25, 0.45), grow: 1.4, color: DUST[i % 3], alpha: 0.35, drag: 1.2 });
      }
    }
    if (once(D, 'rumble', t, at.rumble)) { sfx('rumble', { at: spot, pitch: 0.5, volume: 1 }); sfx('dig', { at: spot, pitch: 0.5, volume: 0.6 }); }
    // the crack: a dark hole on his spot
    const hole = t < at.crack ? 0 : smooth((t - at.crack) / 0.3) * (1 - smooth((t - at.rise[1]) / 0.8));
    showShadow(spot.x, spot.y, spot.z, R * (0.6 + 0.6 * smooth((t - at.crack) / 0.6)), 0.75 * hole);
    if (once(D, 'crack', t, at.crack)) {
      sfx('boom', { at: spot, pitch: 0.45, volume: 0.8 }); sfx('shatter', { at: spot, pitch: 0.4, volume: 0.6 });
      splashFx(spot.x, spot.y, spot.z, { colors: CHIPS, n: 30, up: 5, wide: 2.5, size: [0.06, 0.14] });
      cameraKick(0, 0, 0, 0.05);
    }
    // rising up out of it, antlers first, trembling, stone and dust falling off him (what is still
    // under the floor not drawn: no silhouette of it through the floor)
    e.y = monteurY(r, t);
    e.clipBelow = t < at.rise[1] ? spot.y - 0.02 : undefined;
    const rising = t >= at.rise[0] && t < at.rise[1];
    e.x = spot.x + (rising ? Math.sin(t * 43) * 0.025 : 0); e.z = spot.z + (rising ? Math.cos(t * 37) * 0.025 : 0);
    if (rising) for (let i = Math.floor(40 * dt + Math.random()); i > 0; i--) {
      const a = rand(0, Math.PI * 2), d = rand(0.3, 1.1);
      emit(soft, e.x + Math.cos(a) * d, Math.max(spot.y, e.y) + rand(0.3, e.profile.height * 0.8), e.z + Math.sin(a) * d,
        { v: [Math.cos(a) * rand(0.3, 1.2), rand(0, 1), Math.sin(a) * rand(0.3, 1.2)], life: rand(0.5, 0.9), size: rand(0.06, 0.16), color: CHIPS[i % 3], gravity: 9, drag: 0.4 });
    }
    if (once(D, 'rise', t, at.rise[0])) sfx('rumble', { at: spot, pitch: 0.4, volume: 1 });
    // his stones floating up between his antlers, one after the other
    const [s0, s1] = at.stones, n = 5 * clamp01((t - s0) / (s1 - s0));
    e.stones = t < s0 ? 0 : n;
    for (let i = 0; i < 5; i++) if (once(D, `stone${i}`, t, s0 + (s1 - s0) * (i + 0.5) / 5)) {
      sfx('pop', { at: e, pitch: 0.6 + 0.08 * i, volume: 0.6 });
      const b = e.view?.model.getObjectByName(`stone${i}`) ?? e.view?.model.getObjectByName(`stone.${i}`);
      if (b) { const p = b.getWorldPosition(new THREE.Vector3()); emit(glow, p.x, p.y, p.z, { life: 0.3, size: 0.6, grow: 1.5, color: '#ff9a5a', alpha: 0.6 }); }
    }
    // rearing up and stomping down
    e.pose = t >= at.rear && t < at.release ? { clip: 'summon', t: Math.min(1.5, t - at.rear) } : null;
    if (once(D, 'stomp', t, at.stomp)) { landFx(e, DUST, 1.2); roar(e, 0.8); }
  },
  end(r) {
    Object.assign(r.e, { pose: null, clipBelow: undefined, stones: r.data.stones, x: r.spot.x, y: r.spot.y, z: r.spot.z });
    hideIntroFx();
  },
};

// --- Slomo: a pool of goo on his spot, him oozing up out of it, heaving -------------------------

const GOO = ['#d8ff9a', '#b8ff5a', '#8ae048', '#5a9a2a'];
// how tall he is at t (1: as he is), and the wobble as he settles
function oozed(at, t) {
  const [a, b] = at.ooze;
  if (t < a) return 0.04;
  if (t < b) return 0.04 + 1.08 * smooth((t - a) / (b - a));
  return 1 + 0.12 * Math.cos((t - b) * 11) * Math.exp(-(t - b) * 3.2);
}
function oozeView(v, r) {
  const t = r.t, at = r.at, D = r.data, h = oozed(at, t), w = Math.min(1.7, 1 / Math.sqrt(Math.max(0.35, h)));
  const base = v.prefab.scale * v.size;
  v.model.scale.set(base * w, base * h, base * w);
  ['stalk.L', 'stalk.R'].forEach((n, i) => {
    const b = v.model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n));
    if (b) b.scale.copy(rest(D, b)).multiplyScalar(Math.max(1e-4, popped(clamp01((t - at.stalks[i]) / 0.3))));
  });
}
const slomo = {
  start(r) {
    Object.assign(r.e, { yaw: facing(r.spot, player), dressView: v => oozeView(v, r) });
  },
  step(r, t, dt) {
    const { e, spot, at } = r, D = r.data, R = e.profile.radius;
    faceCamera(r, dt, 2);
    // the pool spreading, bubbling
    const k = smooth((t - at.pool) / 1.4), fade = 1 - smooth((t - at.heave) / 1.2);
    showPool(spot.x, spot.y, spot.z, R * (0.3 + 1.3 * k), 0.85 * k * fade, '#7cc63a');
    if (t >= at.pool && t < at.heave) {
      bubbleFx(spot.x, spot.y, spot.z, R * 0.8 * k + 0.1, dt, 25 * k, GOO);
      if (Math.random() < dt * 2.5 * k) sfx('drip', { at: spot, pitch: rand(0.5, 0.8), volume: 0.5 });
    }
    if (once(D, 'pool', t, at.pool)) sfx('splorch', { at: spot, pitch: 0.5, volume: 0.6 });
    // oozing up out of it
    if (once(D, 'ooze', t, at.ooze[0])) { sfx('gulp', { at: spot, pitch: 0.45, volume: 0.9 }); sfx('splorch', { at: spot, pitch: 0.6, volume: 0.8 }); }
    if (t >= at.ooze[0] && t < at.ooze[1] + 0.3) for (let i = Math.floor(30 * dt + Math.random()); i > 0; i--) {
      const a = rand(0, Math.PI * 2), d = R * rand(0.7, 1.1);
      emit(soft, spot.x + Math.cos(a) * d, spot.y + rand(0.1, 1.6) * oozed(at, t), spot.z + Math.sin(a) * d, { v: [Math.cos(a) * rand(0.2, 0.8), rand(-0.5, 0.8), Math.sin(a) * rand(0.2, 0.8)],
        life: rand(0.4, 0.7), size: rand(0.06, 0.14), color: GOO[i % 4], alpha: 0.9, gravity: 8 });
    }
    at.stalks.forEach((s, i) => { if (once(D, `stalk${i}`, t, s)) sfx('pop', { at: e, pitch: 0.9 + 0.2 * i, volume: 0.7 }); });
    // squashing down and heaving up tall, spitting gloop into the sky
    e.pose = t >= at.heave && t < at.release ? { clip: 'meteor', t: Math.min(1.8, t - at.heave) } : null;
    if (once(D, 'spit', t, at.spit)) {
      roar(e, 0.8); sfx('splorch', { at: e, pitch: 0.5, volume: 1 }); sfx('spit', { at: e, pitch: 0.5, volume: 0.8 });
      const h = e.profile.height;
      for (let i = 0; i < 40; i++)
        emit(soft, e.x, e.y + h * 0.95, e.z, { v: [rand(-1.2, 1.2), rand(5, 10), rand(-1.2, 1.2)], life: rand(0.8, 1.3), size: rand(0.1, 0.22),
          color: GOO[i % 4], alpha: 0.95, gravity: 9, drag: 0.2 });
      quake(0.02);
    }
  },
  end(r) {
    const { e } = r, v = e.view;
    Object.assign(e, { pose: null, dressView: null, x: r.spot.x, y: r.spot.y, z: r.spot.z });
    if (v) {
      v.model.scale.setScalar(v.prefab.scale * v.size);
      for (const [b, s] of r.data.rest ?? []) b.scale.copy(s);
    }
    hideIntroFx();
  },
};

// --- Qualmos: up out of his lagoon, at the end of the world -----------------------------------------

const DEEP = ['#ffffff', '#d8f4ff', '#8fd6e8', '#4aa8c0'];
const BEHIND = 3, ASIDE = 6.5;
// where in his lagoon he comes up (exported for the checks): the middle of a cell of deep water,
// reach[0] .. reach[1] cells from his spot, away from the hero, nearest the middle of that span,
// best from the side: { x, z, y (its surface) }; null: no water near enough
export function lagoonSpot(r) {
  const { spot, at } = r, [lo, hi] = at.reach, m = state.map;
  let fx = spot.x - player.x, fz = spot.z - player.z;
  const l = Math.hypot(fx, fz) || 1;
  fx /= l; fz /= l;
  let best = null, score = -Infinity;
  for (let i = 0; i < N * N; i++) {
    const f = m.cols[i]?.find(f => f.fluid && f.surf > f.top && (f.surf - f.top) * LH >= 0.9);
    if (!f) continue;
    const x = i % N + 0.5, z = Math.floor(i / N) + 0.5, d = Math.hypot(x - spot.x, z - spot.z);
    if (d < lo || d > hi || Math.hypot(x - player.x, z - player.z) < 2.5) continue;
    // (deep all round it: not on the lagoon's edge)
    const deep = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => m.cols[cellAt(x + a, z + b)]?.some(g => g.fluid && g.surf > g.top)).length;
    const across = Math.abs(-fz * (x - spot.x) + fx * (z - spot.z)) / d;
    const value = -Math.abs(d - 5) + deep * 0.6 + across * 1.5;
    if (value > score) { score = value; best = { x, z, y: f.surf * LH }; }
  }
  return best;
}
function qualmosAt(r, t) {
  const { at, spot } = r, from = r.data.from;
  if (t < at.leap) return { x: from.x, y: from.y - r.e.profile.height - 0.6, z: from.z };
  if (t >= at.land) return { x: spot.x, y: spot.y, z: spot.z };
  const k = (t - at.leap) / (at.land - at.leap), y0 = from.y - 1.4;
  return { x: from.x + (spot.x - from.x) * k, y: y0 + (spot.y - y0) * k + at.height * 4 * k * (1 - k), z: from.z + (spot.z - from.z) * k };
}
const qualmos = {
  fits: r => !!(r.data.from ??= lagoonSpot(r)),
  seen: r => ({ x: r.e.x, y: Math.max(r.e.y, r.data.from.y), z: r.e.z }),
  where: (r, t) => { const p = qualmosAt(r, t); return { ...p, y: Math.max(p.y, r.data.from.y) }; },
  start(r) {
    const { e, spot } = r, from = r.data.from ??= lagoonSpot(r);
    r.anchors.start = { x: from.x, y: from.y, z: from.z };
    // (and over his spot, looking the way he will come: `behind`, BEHIND cells past it from the water)
    const bx = spot.x - from.x, bz = spot.z - from.z, bl = Math.hypot(bx, bz) || 1;
    r.anchors.behind = { x: spot.x + bx / bl * BEHIND, y: spot.y, z: spot.z + bz / bl * BEHIND };
    // (and on the way, nearer the water: `shore`; and off to the side of his leap, the hero's: `aside`)
    r.anchors.shore = { x: from.x + bx * 0.45, y: spot.y, z: from.z + bz * 0.45 };
    const mx = (from.x + spot.x) / 2, mz = (from.z + spot.z) / 2, px = -bz / bl, pz = bx / bl, out = (player.x - mx) * px + (player.z - mz) * pz < 0 ? -ASIDE : ASIDE;
    r.anchors.aside = { x: mx + px * out, y: spot.y, z: mz + pz * out };
    r.side = Math.sign(-(spot.z - player.z) * (from.x - spot.x) + (spot.x - player.x) * (from.z - spot.z)) || 1;
    Object.assign(e, { veil: 0, ...qualmosAt(r, 0), yaw: facing(from, spot) });
  },
  step(r, t, dt) {
    const { e, spot, at } = r, D = r.data, from = D.from;
    Object.assign(e, qualmosAt(r, t));
    e.veil = t >= at.leap - 0.05 ? 1 : 0;
    e.clipBelow = t < at.leap + 0.4 ? from.y : undefined;   // (nothing of him under the water, nor through the bank)
    // bubbles coming up in the lagoon, more and more, and rings on it
    if (t >= at.bubbles && t < at.leap) {
      const k = clamp01((t - at.bubbles) / 1.8);
      bubbleFx(from.x, from.y, from.z, 0.6, dt, 8 + 30 * k, DEEP);
      if (Math.random() < dt * (0.8 + 2 * k)) rippleFx(from.x + rand(-0.4, 0.4), from.y, from.z + rand(-0.4, 0.4), 0.2, DEEP, 1);
    }
    if (once(D, 'bubbles', t, at.bubbles)) { sfx('gulp', { at: from, pitch: 0.4, volume: 0.7 }); sfx('rumble', { at: from, pitch: 0.5, volume: 0.6 }); }
    // his eyes lighting up at its surface, looking at the camera
    const lit = clamp01((t - at.eyes) / 1) * (t < at.leap ? 1 : 0);
    if (lit > 0) {
      const p = r.view ?? [player.x, player.y, player.z], dx = p[0] - from.x, dz = p[2] - from.z, l = Math.hypot(dx, dz) || 1, s = 0.28;
      showEyes([[from.x - dz / l * s, from.y + 0.04, from.z + dx / l * s], [from.x + dz / l * s, from.y + 0.04, from.z - dx / l * s]],
        0.5, lit * (0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 7)), '#5fffd0');
    } else showEyes([[0, 0, 0], [0, 0, 0]], 0, 0);
    if (once(D, 'eyes', t, at.eyes)) sfx('qualmos_windup', { at: from, pitch: 0.6, volume: 0.6 });
    // bursting up out of it in a leap, landing on his spot
    if (once(D, 'leap', t, at.leap)) {
      sfx('splash', { at: from, pitch: 0.5, volume: 1 }); sfx('spray', { at: from, pitch: 0.6, volume: 0.9 }); sfx('gust', { at: from, pitch: 0.6, volume: 0.6 });
      splashFx(from.x, from.y, from.z, { colors: DEEP, n: 60, up: 8, wide: 2.6, size: [0.07, 0.16] });
      rippleFx(from.x, from.y, from.z, 0.6, DEEP, 2.4);
    }
    if (t >= at.leap && t < at.land) for (let i = Math.floor(50 * dt + Math.random()); i > 0; i--)   // (water streaming off him)
      emit(soft, e.x + rand(-0.4, 0.4), e.y + rand(0.3, 2), e.z + rand(-0.4, 0.4), { v: [0, rand(-1, 0.5), 0], life: rand(0.3, 0.6),
        size: rand(0.06, 0.12), color: DEEP[i % DEEP.length], alpha: 0.8, gravity: 8 });
    if (t < at.land) e.yaw = facing(from, spot); else faceCamera(r, dt, 2.5);
    if (once(D, 'land', t, at.land)) landFx(e, ['#c9c0ae', '#9fc9d6', '#e8e2d6']);
    // the leap (his dive's clip, stretched over it), getting up, and raging
    e.pose = t < at.rage ? { clip: 'dive', t: warp([[at.leap - 0.4, 0.5], [at.leap, 0.82], [at.land, 1.5], [at.rage, 2.5]], t) }
      : t < at.release ? { clip: 'rage', t: Math.min(2.5, t - at.rage) } : null;
    if (once(D, 'roar', t, at.rage + 0.6)) { roar(e, 0.7); quake(0.03); }
  },
  end(r) {
    Object.assign(r.e, { veil: undefined, clipBelow: undefined, pose: null, x: r.spot.x, y: r.spot.y, z: r.spot.z });
    hideIntroFx();
  },
};

export const BOSS_REVEALS = { squarlo, flip, foggery, renew, mansk, monteur, slomo, qualmos };

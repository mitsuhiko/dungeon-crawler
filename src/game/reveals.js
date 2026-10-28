// How a boss appears in his intro (game/bossintro.js runs it, core/bossintro.js has its moments in
// `at`; docs/bosses.md "The intro"). Each reveal is { start(r), step(r, t, dt), end(r) } on the
// intro `r` ({ e (him), spot (where he stands: { x, y, z, yaw }), at, data (the reveal's own),
// anchors (what the camera's shots go by: a reveal may add its own), side (1, or -1: the shots
// mirrored) }). `seen(r)`, if it has one: where the camera's shots take him to be. start puts him where he is to be at first, step moves him and shows what goes
// with it, end (at the end, or skipped) leaves him on his spot as the fight wants him. Meanwhile
// he is `staged` (game/enemyai.js leaves him be); `veil` (0 .. 1) fades him in, `pose` ({ clip,
// t }) holds him in one of his clips, `dressView` changes his view (render/enemies.js).
import * as THREE from 'three';
import { player, state } from './state.js';
import { fitting } from './bossfight.js';
import { groundY } from '../physics/enemynav.js';
import { standY } from '../physics/dwell.js';
import { cellAt } from '../physics/collide.js';
import { emit, glow, soft, rand } from '../render/particles.js';
import { firesUnder } from '../render/flames.js';
import { showShadow, showEyes, hideIntroFx } from '../render/introfx.js';
import { sfx, SOUND_NAMES } from '../audio/sfx.js';
import { quake, cameraKick, hitstop } from './juice.js';
import { together } from '../net/online.js';

const clamp01 = u => u <= 0 ? 0 : u >= 1 ? 1 : u;
const facing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
// he turns to where the intro's camera is (r.view: [x, y, z]; before it has one, the hero), so
// it sees his face: at `rate` (1/s), or at once
function faceCamera(r, dt, rate = 3) {
  const e = r.e, p = r.view ?? [player.x, player.y, player.z], want = Math.atan2(p[0] - e.x, p[2] - e.z);
  e.yaw += Math.atan2(Math.sin(want - e.yaw), Math.cos(want - e.yaw)) * (rate === Infinity ? 1 : Math.min(1, dt * rate));
}
const sizeOf = e => e.profile.size ?? 1;

// --- what goes with any of them -------------------------------------------------------------------

// his voice (his kind's alert, deeper) and the ground trembling a little
function roar(e) {
  const voice = `${e.profile.species}_alert`;
  if (SOUND_NAMES.includes(voice)) sfx(voice, { at: e, pitch: (e.profile.pitch ?? 1) * 0.8, volume: 1 });
  sfx('rumble', { at: e, pitch: 1.4, volume: 0.5 });
  quake(0.012);
}
// down on his spot: a crash, a ring of dust running out, the view jolting and the moment held
function landFx(e) {
  const s = Math.sqrt(sizeOf(e)) * Math.max(0.6, Math.min(1.6, e.profile.height / 1.8)), r = e.profile.radius;
  sfx('stomp', { at: e, pitch: 0.9 / Math.sqrt(s) });
  sfx('boom', { at: e, pitch: 0.55, volume: 0.7 });
  for (let i = 0; i < 46; i++) {
    const a = rand(0, Math.PI * 2), v = rand(2.5, 5.5) * s;
    emit(soft, e.x + Math.cos(a) * r, e.y + 0.1, e.z + Math.sin(a) * r, { v: [Math.cos(a) * v, rand(0.2, 1.2), Math.sin(a) * v],
      life: rand(0.6, 1.1), size: rand(0.3, 0.55) * s, grow: 1.4, color: i % 3 ? '#c9c0ae' : '#e8e2d6', alpha: 0.55, drag: 2.6 });
  }
  for (let i = 0; i < 14; i++)
    emit(soft, e.x + rand(-r, r), e.y + 0.05, e.z + rand(-r, r), { v: [rand(-1, 1), rand(2, 4.5), rand(-1, 1)], life: rand(0.6, 0.9),
      size: rand(0.04, 0.08), color: '#8a7a62', alpha: 0.9, gravity: 9 });
  quake(0.04);
  cameraKick(0, 0, 0, 0.09);
  if (!together()) hitstop(0.07);   // (playing together the world runs on for the others)
}
// a puff of cloud round him as he comes (Gusto out of thin air)
function cloudFx(e, colors = ['#ffffff', '#e4e8f0', '#c8ccd6']) {
  const y = e.y + e.profile.height * 0.55, s = Math.sqrt(sizeOf(e));
  emit(glow, e.x, y, e.z, { life: 0.25, size: 1.2 * s, grow: 1.4, color: '#ffffff', alpha: 0.25 });
  for (let i = 0; i < 44; i++) {
    const a = rand(0, Math.PI * 2), r = rand(0.3, 1.1), up = rand(-0.6, 1);
    emit(soft, e.x + Math.cos(a) * r * 0.5, y + up * 0.8, e.z + Math.sin(a) * r * 0.5, { v: [Math.cos(a) * rand(1.2, 3), rand(0.2, 1.4), Math.sin(a) * rand(1.2, 3)],
      life: rand(0.6, 1.1), size: rand(0.35, 0.6) * s, grow: 1.5, color: colors[i % colors.length], alpha: 0.7, drag: 2.4 });
  }
  sfx('poof', { at: e, pitch: 0.7 });
  sfx('whirl', { at: e, pitch: 0.8, volume: 0.6 });
}

// --- the drop: out of the sky onto his spot (any boss without one of his own) --------------------

const AWAY = 40;   // cells over his spot he waits, out of sight
const drop = {
  // what the camera takes for him: not up there out of sight, nor high in his fall (no shot of the sky)
  seen: r => ({ x: r.e.x, y: Math.min(r.e.y, r.spot.y + 0.8), z: r.e.z }),
  start(r) {
    const { e, spot } = r;
    Object.assign(e, { x: spot.x, y: spot.y + AWAY, z: spot.z, yaw: facing(spot, player) });
  },
  step(r, t, dt) {
    const { e, spot, at } = r, D = r.data;
    faceCamera(r, dt, t < at.fall ? Infinity : 2);
    e.y = t < at.fall ? spot.y + AWAY : t < at.land ? spot.y + at.height * (1 - ((t - at.fall) / (at.land - at.fall)) ** 2) : spot.y;
    const k = clamp01((t - at.shadow) / (at.land - at.shadow));
    showShadow(spot.x, spot.y, spot.z, e.profile.radius * (0.6 + 1.2 * k) + 0.2, t < at.land ? 0.15 + 0.5 * k * k : 0);
    if (t >= at.fall && !D.whistle) { D.whistle = true; sfx('fall', { at: e, pitch: 0.6, volume: 0.6 }); }
    if (t >= at.land && !D.landed) { D.landed = true; landFx(e); }
    if (t >= at.roar && !D.roared) { D.roared = true; roar(e); }
  },
  end(r) {
    Object.assign(r.e, { x: r.spot.x, y: r.spot.y, z: r.spot.z });
    hideIntroFx();
  },
};

// --- Gusto: his eyes in the empty air, then the rest of him out of a cloud, and the roar -------------

// where his eyes are (blender/gusto.py EYES, from the head's pivot PIVOT: x right, y up, z ahead),
// each side, on body e: carried by the bone of his head (`body`, whose frame is the model's) as his
// clips move it; without his view, as he stands at rest
const GUSTO_EYES = [[-0.19, 0.43, 0.506], [0.19, 0.43, 0.506]], GUSTO_PIVOT = 1.3;
const eyeAt = new THREE.Vector3();
function eyesOf(e) {
  const bone = e.view?.model.getObjectByName('body');
  if (bone) return GUSTO_EYES.map(p => eyeAt.set(...p).applyMatrix4(bone.matrixWorld).toArray());
  const s = sizeOf(e), c = Math.cos(e.yaw), n = Math.sin(e.yaw);
  return GUSTO_EYES.map(([x, y, z]) => [e.x + (x * c + z * n) * s, e.y + (y + GUSTO_PIVOT) * s, e.z + (-x * n + z * c) * s]);
}
const gusto = {
  start(r) {
    Object.assign(r.e, { veil: 0, yaw: facing(r.spot, player) });
  },
  step(r, t, dt) {
    const { e, at } = r, D = r.data;
    faceCamera(r, dt, t < at.appear ? Infinity : 2);
    // the eyes: lighting up out of nothing, flickering, gone into his own once he is there
    const lit = clamp01((t - at.eyes) / 1.2) * (1 - clamp01((t - at.appear - 0.1) / 0.3));
    showEyes(eyesOf(e), 0.45 * sizeOf(e) * (0.7 + 0.3 * lit), lit * (0.85 + 0.15 * Math.sin(t * 31) * Math.sin(t * 13)));
    if (t >= at.eyes && !D.eyes) { D.eyes = true; sfx('gusto_alert', { at: e, pitch: 0.55, volume: 0.45 }); }
    if (t >= at.appear && !D.appeared) { D.appeared = true; cloudFx(e); }
    e.veil = clamp01((t - at.appear) / 0.25);
    // rearing back (his summon's clip, slower), the roar on its spit
    e.pose = t >= at.appear - 0.3 && t < at.release ? { clip: 'summon', t: Math.max(0, Math.min(1.3, (t - at.roar) * at.rate + 0.9)) } : null;
    if (t >= at.roar && !D.roared) {
      D.roared = true; roar(e); e.roused = true;   // (his song: the band comes in, core/gusto.js gustoMusic)
      const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
      for (let i = 0; i < 30; i++)
        emit(soft, e.x + fx * 0.6, e.y + 1.35, e.z + fz * 0.6, { v: [fx * rand(3, 6) + rand(-1, 1), rand(-0.6, 0.8), fz * rand(3, 6) + rand(-1, 1)],
          life: rand(0.4, 0.7), size: rand(0.2, 0.4), grow: 1.6, color: '#e8eef6', alpha: 0.4, drag: 1.5 });
    }
  },
  end(r) {
    Object.assign(r.e, { veil: undefined, pose: null, roused: true, x: r.spot.x, y: r.spot.y, z: r.spot.z });
    hideIntroFx();
  },
};

// --- Totnar: out of the dark, rolling in, lighting the braziers as he passes ------------------------

// where he rolls in from (exported for the checks): a floor he fits on, reach[0] to reach[1]
// cells from his spot, not too near the hero, with floors of the fight all the way to it, none
// more than a step above or below the one before (he bumps up and down them); the longest such
// way, best on one level, from the side (across the camera's view), then from the right:
// { x, y, z, side, heights (the ground along it from there to his spot, every STRIDE cells) }.
// null: none (he waits on his spot in the dark)
const STRIDE = 0.25;
export function rollStart(r) {
  const { e, spot, at } = r, [lo, hi] = at.reach, home = e.home ?? e.f;
  let fx = spot.x - player.x, fz = spot.z - player.z;
  const l = Math.hypot(fx, fz) || 1;
  fx /= l; fz /= l;
  const base = home ? groundY(home, spot.x, spot.z) : spot.y, lift = spot.y - base;
  // the ground of the fight at (x, z) nearest to height y (null: none)
  const ground = (x, z, y) => {
    const i = cellAt(x, z);
    let best = null;
    for (const g of state.map.floors) if (g.c === i && (!state.map.arena || g.encounter)) {
      const h = groundY(g, x, z);
      if (best === null || Math.abs(h - y) < Math.abs(best - y)) best = h;
    }
    return best;
  };
  let best = null, score = -Infinity;
  for (const g of fitting(e.profile)) {
    const x = g.x + 0.5, z = g.z + 0.5, dx = x - spot.x, dz = z - spot.z, d = Math.hypot(dx, dz);
    if (d < lo || d > hi || Math.hypot(x - player.x, z - player.z) < 3) continue;
    const u = Math.max(0, Math.min(1, ((player.x - spot.x) * dx + (player.z - spot.z) * dz) / (d * d)));
    if (Math.hypot(spot.x + dx * u - player.x, spot.z + dz * u - player.z) < 1.8) continue;   // (not over the hero)
    const heights = [];
    let y = base, ok = true;
    for (let s = 0; s <= d + 1e-6 && ok; s += STRIDE) {   // (from his spot outwards)
      const h = ground(spot.x + dx * s / d, spot.z + dz * s / d, y);
      ok = h !== null && Math.abs(h - y) < 1.1;
      y = h; heights.push(h);
    }
    if (!ok) continue;
    const along = (dx * fx + dz * fz) / d, side = Math.sign(-fz * dx + fx * dz) || 1;
    const flat = heights.every(h => Math.abs(h - base) < 0.3);
    const value = Math.min(d, 6) + 2.5 * (1 - Math.abs(along)) + (flat ? 1.5 : 0) + (side > 0 ? 0.4 : 0);
    if (value > score) { score = value; best = { x, y: heights.at(-1) + lift, z, side, heights: heights.reverse().map(h => h + lift), len: d }; }
  }
  return best;
}
// his height at `k` of the way from where he rolled in to his spot (1: on it; past it: as on it)
function rollY(from, spot, k) {
  const H = from.heights;
  if (!H || k >= 1) return spot.y;
  const u = Math.max(0, k) * from.len / STRIDE, i = Math.min(H.length - 1, Math.floor(u)), j = Math.min(H.length - 1, i + 1);
  return H[i] + (H[j] - H[i]) * Math.min(1, (u - i) * 1.6);
}
// how far he has rolled at t (cells from where he started, `len` from there to his spot): faster
// and faster up to `over` past his spot, then back onto it
function rolled(at, t, len) {
  if (t < at.roll) return 0;
  if (t < at.stop) { const u = (t - at.roll) / (at.stop - at.roll); return (len + at.over) * u * u * (2 - u); }
  const u = clamp01((t - at.stop) / (at.settle - at.stop));
  return len + at.over * (1 - u) * (1 - u);
}
const SKULL_DUST = ['#efe6d2', '#d8cdb4', '#ffffff'];
const totnar = {
  start(r) {
    const { e, spot, at } = r, D = r.data, from = rollStart(r) ?? { ...spot, side: 1 };
    r.anchors.start = { x: from.x, y: from.y, z: from.z };
    r.side = from.side;
    D.from = from;
    Object.assign(e, { x: from.x, y: from.y, z: from.z, yaw: facing(from, spot), dark: 0 });
    // the braziers die down, and each flares up again as he rolls by it (along his way; without
    // a way, one after the other round him)
    const dx = spot.x - from.x, dz = spot.z - from.z, len = Math.hypot(dx, dz);
    D.fires = (state.world ? firesUnder(state.world.group) : []).map((f, n, all) => {
      const along = len > 0.5 ? clamp01(((f.x - from.x) * dx + (f.z - from.z) * dz) / (len * len)) : n / Math.max(1, all.length - 1);
      const aside = len > 0.5 ? Math.abs((f.x - from.x) * dz - (f.z - from.z) * dx) / len : 0;
      return { ...f, at: at.roll + (at.stop - at.roll) * Math.sqrt(along) + Math.min(0.4, aside * 0.04) + 0.05, lit: false };
    });
    D.skulls = [0, 1, 2].map(() => ({ rest: null, popped: false }));
    e.dressView = v => skulls(v, r);
  },
  // where he is at t (the camera's shots are made clear for it: game/bossintro.js)
  where(r, t) {
    const { spot, at } = r, from = r.data.from, dx = spot.x - from.x, dz = spot.z - from.z, len = Math.hypot(dx, dz);
    if (len <= 0.5) return spot;
    const k = rolled(at, t, len) / len;
    return { x: from.x + dx * k, y: rollY(from, spot, k), z: from.z + dz * k };
  },
  step(r, t, dt) {
    const { e, spot, at } = r, D = r.data, from = D.from;
    if (t >= at.dark && !D.dark) { D.dark = true; e.dark = 1; for (const f of D.fires) f.set.power(f.i, 0); }   // (render/enemies.js: the gloom's sound and his heart)
    if (t >= at.turn[0]) faceCamera(r, dt, t < at.turn[1] ? 4 : 2);
    const dx = spot.x - from.x, dz = spot.z - from.z, len = Math.hypot(dx, dz);
    if (len > 0.5) {
      const k = rolled(at, t, len) / len;
      e.x = from.x + dx * k; e.z = from.z + dz * k; e.y = rollY(from, spot, k);
    }
    // crouched, spinning up; rolling; then (his gloom's clip) arms up and the skulls gaping as the light comes back
    e.pose = t < at.roll ? { clip: 'roll', t: 0.8 * clamp01(t / at.roll) } : t < at.stop ? { clip: 'roll', t: Math.min(2.5, 0.8 + t - at.roll) }
      : t >= at.gloom && t < at.light + 1.2 ? { clip: 'gloom', t: Math.min(1.7, (t - at.gloom) * at.rate) } : null;
    if (t >= at.roll && !D.rolling) { D.rolling = true; sfx('rustle', { at: e, pitch: 0.8 }); sfx('gust', { at: e, pitch: 0.7, volume: 0.5 }); }
    for (const f of D.fires) if (D.dark && !f.lit && t >= f.at) {
      f.lit = true; f.set.power(f.i, 1);
      sfx('fireball', { at: f, pitch: 0.6 + Math.random() * 0.2, volume: 0.6 });
      for (let i = 0; i < 14; i++)
        emit(glow, f.x + rand(-0.12, 0.12), f.y + rand(0, 0.3), f.z + rand(-0.12, 0.12), { v: [rand(-0.8, 0.8), rand(1.5, 3.5), rand(-0.8, 0.8)],
          life: rand(0.4, 0.8), size: rand(0.04, 0.09), color: ['#fff0a0', '#ffd25a', '#ff8a2a'][i % 3], gravity: -0.5, drag: 1 });
    }
    if (t >= at.stop && !D.stopped) {   // bouncing to a stop
      D.stopped = true;
      sfx('thud', { at: e, pitch: 0.55 }); sfx('rustle', { at: e });
      for (let i = 0; i < 22; i++) {
        const a = rand(0, Math.PI * 2), s = rand(1.2, 3);
        emit(soft, e.x, e.y + 0.2, e.z, { v: [Math.cos(a) * s, rand(0.3, 1.2), Math.sin(a) * s], life: rand(0.5, 0.9),
          size: rand(0.25, 0.45), grow: 1.2, color: '#c9c0ae', alpha: 0.5, drag: 2.5 });
      }
      quake(0.02); cameraKick(0, 0, 0, 0.06);
    }
    at.skulls.forEach((s, i) => {
      if (t < s || D.skulls[i].popped) return;
      D.skulls[i].popped = true;
      sfx('bonk', { at: e, pitch: 1.1 + i * 0.15, volume: 0.8 }); sfx('chomp', { at: e, pitch: 1.3, volume: 0.5 });
      const b = e.view?.model.getObjectByName(`skull${i}`);
      if (!b) return;
      const p = b.getWorldPosition(b.position.clone());
      for (let n = 0; n < 16; n++)
        emit(soft, p.x, p.y, p.z, { v: [rand(-1.2, 1.2), rand(0.5, 2.2), rand(-1.2, 1.2)], life: rand(0.4, 0.8), size: rand(0.05, 0.1),
          color: SKULL_DUST[n % 3], alpha: 0.9, gravity: 6, drag: 1 });
    });
    if (t >= at.light && e.dark) { e.dark = 0; if (e.view) e.view.flash2 = 1; }   // (render/enemies.js: his heart flares, the light bursts out)
  },
  end(r) {
    const { e, spot } = r, D = r.data;
    for (const f of D.fires ?? []) f.set.power(f.i, 1);
    const v = e.view;
    if (v) D.skulls?.forEach((s, i) => { const b = v.model.getObjectByName(`skull${i}`); if (b && s.rest) b.scale.copy(s.rest); });
    Object.assign(e, { x: spot.x, y: spot.y, z: spot.z, dark: 0, pose: null, dressView: null });
  },
};
// his skulls: none while he rolls, popping up one after the other (a little too big, then back)
const popped = u => u <= 0 ? 1e-4 : 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2;
function skulls(v, r) {
  r.data.skulls.forEach((s, i) => {
    const b = v.model.getObjectByName(`skull${i}`);
    if (!b) return;
    s.rest ??= b.scale.clone();
    b.scale.copy(s.rest).multiplyScalar(Math.max(1e-4, popped(clamp01((r.t - r.at.skulls[i]) / 0.3))));
  });
}

export const REVEALS = { drop, gusto, totnar };

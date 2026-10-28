// Boss intros (game/bossintro.js runs them, docs/bosses.md "The intro"). Coming into a boss's
// arena (a real boss's or a Temp Boss's) for the first time in a world, the hero walks on a few
// steps and stops: the camera leaves them (a free camera, game/camera.js setCine) and finds the
// boss as he appears, his name and his epithet come up under him, and the camera comes back as
// his bar fades in. A boss may have an intro of his own (how he appears: game/reveals.js; the
// camera's shots); the others drop in out of the sky (`drop`). After the first time (`again`)
// only his name shows a moment while the bar fades in. Pure: the timings, the shots, the
// epithets and the camera's maths.
import { msg } from '../i18n/i18n.js';

// the line under a boss's name, and under a Temp Boss's
export const EPITHETS = Object.freeze({
  gusto: msg('The Hungry Grin'), totnar: msg('The Ember in the Brambles'), squarlo: msg('Small Lord of the Tides'),
  flip: msg('Who Turns the World'), foggery: msg('Lord of the Lava'), renew: msg('The Echo of Time'),
  mansk: msg('The Hollow Mask'), monteur: msg('The Stone That Walks'), slomo: msg('King of the Slime'),
  qualmos: msg('At the End of the World'), temp: msg('Keeper of the Well'),
});
export const epithetOf = e => EPITHETS[e?.boss] ?? EPITHETS.temp;

// An intro, in seconds from coming in:
//   reveal     how the boss appears (game/reveals.js), `at` its moments; null: he is just there
//   length     when it is over; hold: until when the hero has no control; walk: how long they walk on
//   letterbox  [in, out] of the black bars; name: [in, out] of his name and epithet; bar: the bar fades in
//   blend      [from, full, back]: the free camera takes over from the game's, and at `back` cuts
//              back to it (the black bars shut over it a moment before, BLINK, and open again)
//   dim        { at: [from, full, back, gone], to }: the arena's light going (to `to` of the
//              night's dark, render/look.js) and coming back; null: the reveal does the light
//   fires      { out, back }: the arena's fires sinking low, and flaring up again
//   shake      how far the camera drifts as if held in a hand (cells)
//   shots      the camera's keys (shotAt), each point [anchor, ahead, right, up] in the frame of
//              shotFrame: anchors 'hero', 'spot' (where he stands), 'boss' (where he is now) and
//              what the reveal adds (Totnar's 'start'). game/bossintro.js moves a key's camera
//              out of what is in the way (or what hides him) before the intro starts.
// over the hero's shoulder, towards where the boss will be
const OPEN = { t: 0.6, cam: ['hero', -2.2, 0.9, 2.0], look: ['spot', 0, 0, 1.0], fov: 50 };
export const INTROS = Object.freeze({
  // out of the sky: the light goes and the fires sink low, a shadow grows on his spot, he falls onto
  // it with a crash (the fires flare up), and roars as the light comes back; the camera wide on
  // his spot, a little in as he lands, then slowly round him
  drop: { reveal: 'drop', length: 7.4, hold: 7.0, walk: 1.4, letterbox: [0.3, 7.0], name: [4.2, 6.4], bar: 6.8,
    blend: [0.6, 2.2, 6.6], shake: 0.02, dim: { at: [0.3, 2.2, 4.3, 6.2], to: 0.6 }, fires: { out: 0.4, back: 3.6 },
    at: { shadow: 2.3, fall: 3.1, land: 3.6, roar: 4.3, height: 9 },
    shots: [OPEN,
      { t: 2.2, cam: ['spot', -6.0, 2.6, 2.2], look: ['spot', 0, 0, 1.0], fov: 44 },
      { t: 3.6, cam: ['spot', -5.6, 2.3, 2.0], look: ['boss', 0, 0, 0.6], fov: 44, roll: -2, ease: 'linear' },
      { t: 4.3, cam: ['spot', -5.0, 1.7, 1.8], look: ['boss', 0, 0, 0.6], fov: 42, roll: 0, ease: 'out' },
      { t: 6.4, cam: ['spot', -5.0, -1.0, 1.7], look: ['boss', 0, 0, 0.6], fov: 40, roll: 1 }] },
  // Gusto: the light goes, two red eyes light up in the empty air, he comes out of a cloud round
  // them, rears back and roars (the band comes in, the light comes back); the camera creeps in on
  // the eyes, and pulls back on the roar as its lens narrows (a dolly zoom: he stays as big, the
  // arena closes in behind him)
  gusto: { reveal: 'gusto', length: 7.6, hold: 7.3, walk: 1.4, letterbox: [0.3, 7.3], name: [4.6, 6.7], bar: 7.1,
    blend: [0.6, 2.2, 6.9], shake: 0.02, dim: { at: [0.3, 2.4, 4.5, 6.2], to: 0.7 }, fires: { out: 0.4, back: 4.5 },
    at: { eyes: 2.4, appear: 4.0, roar: 4.5, release: 5.6, rate: 0.75 },
    shots: [{ ...OPEN, look: ['spot', 0, 0, 1.4] },
      { t: 2.2, cam: ['spot', -5.2, 2.0, 1.6], look: ['spot', 0, 0, 1.6], fov: 44, roll: -4 },
      { t: 4.0, cam: ['spot', -3.9, 1.4, 1.6], look: ['spot', 0, 0, 1.6], fov: 42, roll: -3, ease: 'linear' },
      { t: 4.5, cam: ['spot', -3.6, 1.1, 1.7], look: ['boss', 0, 0, 1.2], fov: 44, roll: 0, ease: 'out' },
      { t: 5.7, cam: ['spot', -6.8, 2.1, 2.3], look: ['boss', 0, 0, 1.1], fov: 24 }] },
  // Totnar: it goes dark and the braziers die down; he rolls in out of the dark from the side
  // (`reach`: that far from his spot), each brazier flaring up as he rolls by, bounces to a stop on
  // his spot and turns to the camera, his skulls pop up one by one, and his heart flares as the
  // light comes back. The camera runs alongside him, then rises for the skulls
  totnar: { reveal: 'totnar', length: 8.5, hold: 8.2, walk: 1.4, letterbox: [0.3, 8.2], name: [5.6, 7.6], bar: 8.0,
    blend: [0.6, 2.0, 7.8], shake: 0.02, dim: null, fires: null,
    at: { dark: 0.3, roll: 2.2, stop: 4.0, settle: 4.4, turn: [4.2, 4.9], gloom: 4.6, rate: 0.75, skulls: [4.9, 5.2, 5.5], light: 5.8,
      reach: [4.5, 7.5], over: 0.45 },
    shots: [{ ...OPEN, look: ['start', 0, 0, 1.0] },
      { t: 2.0, cam: ['boss', -3.8, 0.8, 1.5], look: ['boss', 0, 0, 1.0], fov: 46, roll: -2 },
      { t: 4.0, cam: ['boss', -3.6, -0.6, 1.5], look: ['boss', 0, 0, 1.1], fov: 46, roll: 1, ease: 'linear' },
      { t: 4.9, cam: ['spot', -4.6, 1.2, 2.3], look: ['boss', 0, 0, 1.2], fov: 44, roll: 0 },
      { t: 6.6, cam: ['spot', -4.6, 0.5, 2.0], look: ['boss', 0, 0, 1.0], fov: 42 }] },
  // met before: his name a moment, the bar; nothing taken away
  again: { reveal: null, length: 3.2, hold: 0, walk: 0, letterbox: null, name: [0.2, 2.8], bar: 0.5, blend: null, dim: null, fires: null,
    shake: 0, shots: [] },
});
// how far the light has gone at t (0 .. dim.to)
export function dimAt(intro, t) {
  const d = intro.dim;
  if (!d) return 0;
  const [a, b, c, e] = d.at;
  return d.to * Math.min(smooth((t - a) / (b - a)), 1 - smooth((t - c) / (e - c)));
}
// the intro for boss e: his own (or the drop), or, met before, `again`
export const introOf = (e, met) => met ? INTROS.again : INTROS[e?.boss] ?? INTROS.drop;

const clamp01 = u => u <= 0 ? 0 : u >= 1 ? 1 : u;
const smooth = u => (u = clamp01(u)) * u * (3 - 2 * u);
// how far the free camera has taken over at t (0: the game's, 1: the intro's)
export function blendAt(intro, t) {
  const b = intro.blend;
  return b && t < b[2] ? smooth((t - b[0]) / (b[1] - b[0])) : 0;
}
// s the black bars take to shut before the camera cuts back, and whether they are shut at t
export const BLINK = 0.3;
export const blinking = (intro, t) => !!intro.blend && t >= intro.blend[2] - BLINK && t < intro.blend[2] + 0.1;
export const within = (span, t) => !!span && t >= span[0] && t < span[1];

// how much bigger a boss's shots are than Gusto's: by his height (a little Squarlo closer, Qualmos further)
export const shotScale = height => Math.min(1.6, Math.max(0.6, height / 2.2));

// The frame a boss's shots are given in: `f` the way from the hero to his spot (on the ground),
// `r` to its right (mirrored by `side`: a reveal on the left), offsets round the boss times k
export function shotFrame(hero, spot, k = 1, side = 1) {
  let fx = spot.x - hero.x, fz = spot.z - hero.z;
  const l = Math.hypot(fx, fz) || 1;
  fx /= l; fz /= l;
  return { f: [fx, fz], r: [-fz * side, fx * side], k };
}
// a point of a shot, [anchor, ahead, right, up], in the world: anchors { name: { x, y, z } } (an
// unknown one: the spot); round the hero in cells, round anything else times the frame's k
export function shotPoint(frame, anchors, [name, a = 0, r = 0, u = 0]) {
  const o = anchors[name] ?? anchors.spot, k = name === 'hero' ? 1 : frame.k;
  return [o.x + (frame.f[0] * a + frame.r[0] * r) * k, o.y + u * k, o.z + (frame.f[1] * a + frame.r[1] * r) * k];
}

const EASE = { linear: u => u, in: u => u * u, out: u => 1 - (1 - u) * (1 - u), inOut: u => u * u * (3 - 2 * u) };
const catmull = (p0, p1, p2, p3, u) => p1.map((_, i) => 0.5 * (2 * p1[i] + (p2[i] - p0[i]) * u
  + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * u * u + (3 * p1[i] - p0[i] - 3 * p2[i] + p3[i]) * u * u * u));

// The camera of the shots `keys` at t: { cam, look, fov, roll } (points in the world, the lens in
// degrees, the roll in degrees), or null without keys. The camera and what it looks at go through
// the keys on curves (Catmull-Rom), easing into each by its `ease` (inOut, out, in, linear); a key
// that leaves out the lens or the roll keeps the one before. A key with `cut` cuts to it: the
// keys before it and from it on are two shots.
export function shotAt(keys, t, frame, anchors) {
  if (!keys?.length) return null;
  const lens = [], rolls = [];
  keys.forEach((k, i) => { lens.push(k.fov ?? lens[i - 1] ?? 45); rolls.push(k.roll ?? rolls[i - 1] ?? 0); });
  let s = 0, e = keys.length;
  for (let i = 1; i < keys.length; i++) if (keys[i].cut && keys[i].t <= t) s = i;
  for (let i = s + 1; i < keys.length; i++) if (keys[i].cut) { e = i; break; }
  let i = s;
  while (i < e - 1 && keys[i + 1].t <= t) i++;
  const P = k => shotPoint(frame, anchors, keys[k].cam), L = k => shotPoint(frame, anchors, keys[k].look);
  if (i === e - 1 || t <= keys[i].t) return { cam: P(i), look: L(i), fov: lens[i], roll: rolls[i] };
  const a = keys[i], b = keys[i + 1], u = (EASE[b.ease] ?? EASE.inOut)(clamp01((t - a.t) / (b.t - a.t)));
  const h = Math.max(s, i - 1), j = Math.min(e - 1, i + 2);
  return { cam: catmull(P(h), P(i), P(i + 1), P(j), u), look: catmull(L(h), L(i), L(i + 1), L(j), u),
    fov: lens[i] + (lens[i + 1] - lens[i]) * u, roll: rolls[i] + (rolls[i + 1] - rolls[i]) * u };
}

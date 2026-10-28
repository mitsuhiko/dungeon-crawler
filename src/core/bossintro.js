// Boss intros (game/bossintro.js runs them, docs/bosses.md "The intro"). Coming into a boss's
// arena (a real boss's or a Temp Boss's) for the first time in a world, the hero walks on a few
// steps and stops: the camera leaves them (a free camera, game/camera.js setCine) and finds the
// boss as he appears, his name and his epithet come up under him, and the camera comes back as
// his bar fades in. A boss may have an intro of his own (how he appears: game/reveals.js; the
// camera's shots: every real boss has); the others drop in out of the sky (`drop`). After the first time (`again`)
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
//   at         the reveal's own moments (game/reveals.js, game/bossreveals.js)
//   shake      how far the camera drifts as if held in a hand (cells)
//   shots      the camera's keys (shotAt), each point [anchor, ahead, right, up] in the frame of
//              shotFrame: anchors 'hero', 'spot' (where he stands), 'boss' (where he is now) and
//              what the reveal adds (Totnar's and Qualmos's 'start', Qualmos's 'behind', 'shore' and 'aside'). game/bossintro.js moves a key's camera
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
  // Squarlo: the light goes; his water starts to swirl on his spot, a spout bursts up out of it with
  // him riding on top, spinning, it falls away and he plops down, then throws up his arms and
  // wiggles, calling the tide (water spiralling up round him). He is small: the camera starts
  // wide, as for somebody big, and finds him low and close, looking up at him on the spout
  squarlo: { reveal: 'squarlo', length: 7.8, hold: 7.5, walk: 1.4, letterbox: [0.3, 7.5], name: [5.0, 7.1], bar: 7.4,
    blend: [0.6, 2.0, 7.3], shake: 0.015, dim: { at: [0.3, 2.0, 4.8, 6.4], to: 0.45 }, fires: { out: 0.4, back: 4.8 },
    at: { swirl: 2.0, burst: 3.1, top: 3.8, land: 4.4, cast: 4.6, call: 5.0, release: 6.6, height: 2.6 },
    shots: [{ ...OPEN, look: ['spot', 0, 0, 0.6] },
      { t: 2.0, cam: ['spot', -8, 3.2, 2.6], look: ['spot', 0, 0, 0.4], fov: 42 },
      { t: 3.1, cam: ['spot', -6, 2.2, 1.6], look: ['spot', 0, 0, 1.0], fov: 46 },
      { t: 3.8, cam: ['spot', -6.2, 1.8, 1.6], look: ['boss', 0, 0, 0.6], fov: 34, roll: -5, ease: 'out' },
      { t: 4.4, cam: ['spot', -4.8, 1.2, 1.5], look: ['boss', 0, 0, 0.5], fov: 42, roll: 0 },
      { t: 7.0, cam: ['spot', -4.2, -0.9, 1.6], look: ['boss', 0, 0, 0.35], fov: 32 }] },
  // Flip: the world round the box goes (only the stars, as in his fight); his three rings come
  // flying in out of the dark from three sides, spinning wildly, and lock together into him; he
  // cartwheels right round (his flip's clip) and the camera turns with him, so it is the world that
  // turns round him
  flip: { reveal: 'flip', length: 7.9, hold: 7.6, walk: 1.4, letterbox: [0.3, 7.6], name: [5.4, 7.4], bar: 7.5,
    blend: [0.6, 2.0, 7.4], shake: 0.015, dim: { at: [0.3, 2.0, 5.4, 6.8], to: 0.5 }, fires: { out: 0.4, back: 5.4 },
    at: { void: 0.3, rings: [2.0, 2.35, 2.7], fly: 0.9, lock: 3.7, flip: 4.0, turn: [4.5, 5.35], roar: 5.4, release: 6.2 },
    shots: [{ ...OPEN, look: ['spot', 0, 0, 1.2] },
      { t: 2.0, cam: ['spot', -5.6, 1.6, 1.0], look: ['spot', 0, 0, 1.1], fov: 50 },
      { t: 3.6, cam: ['spot', -4.8, 0.6, 0.8], look: ['spot', 0, 0, 1.0], fov: 44 },
      { t: 4.5, cam: ['spot', -4.4, 0, 0.8], look: ['boss', 0, 0, 1.0], fov: 44, roll: 0 },
      { t: 5.35, cam: ['spot', -4.4, 0, 0.8], look: ['boss', 0, 0, 1.0], fov: 44, roll: -360 },
      { t: 7.2, cam: ['spot', -5.2, -1.4, 1.2], look: ['boss', 0, 0, 1.0], fov: 38, roll: -360 }] },
  // Foggery: the light goes; the lava starts to bubble over his spot and two burning eyes come up
  // out of it and look at the camera (a frog in his pond); then he bursts up out of it with a
  // splash of lava, lands and croaks, puffed up (his summon's clip), flames bursting out of his
  // mouth. The camera from the bridge down onto the lava, low over it, creeping in on the eyes, and
  // pulling back as he bursts up
  foggery: { reveal: 'foggery', length: 8.1, hold: 7.8, walk: 1.2, letterbox: [0.3, 7.8], name: [5.4, 7.5], bar: 7.7,
    blend: [0.6, 2.0, 7.6], shake: 0.015, dim: { at: [0.3, 2.0, 5.2, 6.8], to: 0.55 }, fires: null,
    at: { bubble: 1.8, eyes: 2.6, peek: 3.7, burst: 4.2, top: 4.65, land: 5.05, croak: 5.2, release: 6.9, height: 2.4 },
    shots: [{ ...OPEN, look: ['spot', 0, 0, 0.4] },
      { t: 2.0, cam: ['spot', -6.0, 2.2, 1.4], look: ['spot', 0, 0, 0.4], fov: 40 },
      { t: 4.1, cam: ['spot', -3.6, 1.2, 1.0], look: ['spot', 0, 0, 0.5], fov: 30, ease: 'inOut' },
      { t: 4.65, cam: ['spot', -5.0, 1.8, 2.4], look: ['boss', 0, 0, 0.8], fov: 50, roll: -4, ease: 'out' },
      { t: 5.2, cam: ['spot', -4.8, 1.4, 1.1], look: ['boss', 0, 0, 1.15], fov: 46, roll: 0 },
      { t: 7.4, cam: ['spot', -5.0, -0.9, 1.0], look: ['boss', 0, 0, 1.15], fov: 42 }] },
  // Renew: the light goes and the braziers sink low; clocks of light turn on his empty spot, their
  // hands racing back, and a ghost of him walks backwards out of the dark onto it (time running
  // back: `reach` cells, along the floors, game/revealkit.js wayIn); there he is whole again in a
  // flash, and holds up his weapon as the light and the fires come back. The camera runs round
  // him as he comes, then low, looking up at the raised weapon
  renew: { reveal: 'renew', length: 7.8, hold: 7.5, walk: 1.4, letterbox: [0.3, 7.5], name: [5.0, 7.1], bar: 7.4,
    blend: [0.6, 2.0, 7.3], shake: 0.015, dim: { at: [0.3, 2.0, 4.6, 6.4], to: 0.65 }, fires: { out: 0.4, back: 4.6 },
    at: { clocks: 1.6, ghost: 2.2, back: [2.3, 4.3], whole: 4.4, raise: 4.6, release: 6.7, reach: [2.6, 4.4] },
    shots: [{ ...OPEN, look: ['spot', 0, 0, 1.2] },
      { t: 2.0, cam: ['spot', -4.6, 1.4, 3.2], look: ['spot', 0, 0, 0.6], fov: 40 },
      { t: 2.8, cam: ['boss', -4.6, 2.2, 2.8], look: ['boss', 0, 0, 1.0], fov: 42 },
      { t: 4.3, cam: ['boss', -4.4, -2.0, 2.6], look: ['boss', 0, 0, 1.1], fov: 40, ease: 'linear' },
      { t: 4.8, cam: ['spot', -5.0, -1.0, 0.8], look: ['boss', 0, 0, 1.2], fov: 40, ease: 'out' },
      { t: 7.0, cam: ['spot', -6.6, 0.5, 1.3], look: ['boss', 0, 0, 0.9], fov: 32 }] },
  // Mansk: it goes all but black and the fires go out; a spotlight clunks on over his empty
  // stage; out of the dark above, his mask comes down into its beam, the diamond glowing, and
  // roars (his rise's clip) as the light comes back. The camera from the hall like the audience,
  // pushing in as he comes down, then close, low, for the roar
  mansk: { reveal: 'mansk', length: 8.1, hold: 7.8, walk: 1.4, letterbox: [0.3, 7.8], name: [5.3, 7.4], bar: 7.7,
    blend: [0.6, 1.8, 7.6], shake: 0.012, dim: { at: [0.3, 1.8, 4.9, 6.3], to: 0.92 }, fires: { out: 0.4, back: 4.9 },
    at: { click: 2.1, appear: 2.7, down: [2.7, 4.5], high: 4.2, roar: 4.6, rate: 0.9, lights: 4.9, release: 7.0 },
    shots: [{ ...OPEN, look: ['spot', 0, 0, 1.0] },
      { t: 1.8, cam: ['spot', -6.4, 0, 0.7], look: ['spot', 0, 0, 1.2], fov: 40 },
      { t: 4.5, cam: ['spot', -5.0, 0.2, 0.6], look: ['boss', 0, 0, 0.75], fov: 40, ease: 'linear' },
      { t: 4.9, cam: ['spot', -3.4, 0.5, 0.3], look: ['boss', 0, 0, 0.85], fov: 46, roll: -3, ease: 'out' },
      { t: 7.2, cam: ['spot', -3.9, 1.3, 0.45], look: ['boss', 0, 0, 0.8], fov: 40, roll: 0 }] },
  // Monteur: the light goes; the ground on his spot rumbles and shakes, dust and pebbles jumping,
  // it cracks open and he rises up out of it, antlers first, stone and dust falling off him; his
  // stones float up one after the other between his antlers, and he rears up and stomps down
  // (his summon's clip) as the light comes back. The camera low on the ground, looking up at him
  // as he rises, back out for the stomp
  monteur: { reveal: 'monteur', length: 8.4, hold: 8.1, walk: 1.4, letterbox: [0.3, 8.1], name: [5.6, 7.7], bar: 8.0,
    blend: [0.6, 2.0, 7.9], shake: 0.015, dim: { at: [0.3, 2.0, 6.0, 7.2], to: 0.6 }, fires: { out: 0.4, back: 6.2 },
    at: { rumble: 1.4, crack: 2.4, rise: [2.6, 4.7], stones: [4.5, 5.3], rear: 5.2, stomp: 6.2, release: 7.4 },
    shots: [{ ...OPEN, look: ['spot', 0, 0, 0.4] },
      { t: 2.0, cam: ['spot', -4.6, 1.6, 0.4], look: ['spot', 0, 0, 0.25], fov: 46 },
      { t: 4.7, cam: ['spot', -4.2, 1.5, 0.3], look: ['spot', 0, 0, 0.8], fov: 52, ease: 'linear' },
      { t: 5.6, cam: ['spot', -5.0, 0.8, 0.45], look: ['boss', 0, 0, 1.05], fov: 54 },
      { t: 6.2, cam: ['spot', -5.6, 0.4, 0.5], look: ['boss', 0, 0, 0.95], fov: 52, ease: 'out' },
      { t: 7.7, cam: ['spot', -6.0, -0.6, 0.6], look: ['boss', 0, 0, 0.9], fov: 48 }] },
  // Slomo: the light goes; a pool of goo spreads bubbling on his spot, and he oozes up out of it,
  // wobbling as he settles, his eye stalks popping up; he squashes down and heaves up tall,
  // spitting gloop into the sky (his meteorites' clip). The camera low by the pool, craning up as
  // he grows, then low and wide for the heave
  slomo: { reveal: 'slomo', length: 8.1, hold: 7.8, walk: 1.4, letterbox: [0.3, 7.8], name: [5.4, 7.5], bar: 7.7,
    blend: [0.6, 2.0, 7.6], shake: 0.015, dim: { at: [0.3, 2.0, 5.6, 7.0], to: 0.5 }, fires: { out: 0.4, back: 5.6 },
    at: { pool: 1.8, ooze: [2.8, 4.2], stalks: [4.3, 4.5], heave: 4.9, spit: 6.0, release: 6.8 },
    shots: [{ ...OPEN, look: ['spot', 0, 0, 0.3] },
      { t: 2.0, cam: ['spot', -4.4, 1.6, 0.8], look: ['spot', 0, 0, 0.1], fov: 42 },
      { t: 4.2, cam: ['spot', -4.6, 1.3, 0.6], look: ['spot', 0, 0, 0.75], fov: 48, ease: 'linear' },
      { t: 4.9, cam: ['spot', -5.2, 0.7, 0.55], look: ['boss', 0, 0, 0.7], fov: 44 },
      { t: 6.0, cam: ['spot', -5.6, -0.4, 0.35], look: ['boss', 0, 0, 0.85], fov: 46, roll: 3, ease: 'out' },
      { t: 7.4, cam: ['spot', -5.8, -1.2, 0.5], look: ['boss', 0, 0, 0.75], fov: 40, roll: 0 }] },
  // Qualmos: it goes darker still; bubbles come up in his lagoon, and two sea-green eyes light up
  // under its surface; he bursts up out of it in a leap (his dive's clip) and lands on his spot,
  // and rages, beating his chest and roaring with his arms wide, as the light comes back. The
  // camera over his empty spot (`behind`) looking out over the water to where he comes up
  // (`start`), creeping in towards the eyes (`shore`); as he leaps out it cuts to the side of his
  // leap (`aside`), and comes round to the front as he lands, low and close for the rage. No
  // water near: the drop (`fits`)
  qualmos: { reveal: 'qualmos', length: 8.4, hold: 8.1, walk: 1.4, letterbox: [0.3, 8.1], name: [5.7, 7.8], bar: 8.0,
    blend: [0.6, 2.0, 7.9], shake: 0.015, dim: { at: [0.3, 2.0, 5.9, 7.2], to: 0.3 }, fires: { out: 0.4, back: 5.9 },
    at: { bubbles: 1.6, eyes: 2.5, leap: 3.9, land: 4.8, rage: 5.3, release: 7.8, height: 2.4, reach: [2.5, 9] },
    shots: [{ ...OPEN, look: ['start', 0, 0, 0.3] },
      { t: 2.0, cam: ['behind', 0, 0, 1.25], look: ['start', 0, 0, 0.1], fov: 42 },
      { t: 3.85, cam: ['shore', 0, 0, 0.8], look: ['start', 0, 0, 0.05], fov: 34 },
      { t: 3.9, cam: ['aside', 0, 0, 1.0], look: ['boss', 0, 0, 0.5], fov: 50, cut: true },
      { t: 5.0, cam: ['spot', -5.0, 1.6, 0.7], look: ['boss', 0, 0, 0.6], fov: 46 },
      { t: 7.6, cam: ['spot', -4.8, -0.5, 0.5], look: ['boss', 0, 0, 0.95], fov: 44 }] },
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

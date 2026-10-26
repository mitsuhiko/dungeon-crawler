// Plays a film (docs/film.md) over everything, on the glass bird's dark stage (render/stage.js):
// a sheet of dark paper standing at the back, where layers of white ink paint themselves in
// (film/ink.js), and the black floor in front, where glass grows, takes the ink into it, rises
// and breaks (film/glass.js); the floor mirrors all of it.
//
// A film is a file (film/opening.js): its layers and glasses, where they are, and its shots, each
// a line with cues on it, when what happens (core/film.js schedule). The lines are voiced like
// the narrator's (game/narrator.js voiceClip, tools/narration.mjs), in the film's voice; a shot
// lasts as long as its clip (without one: as long as it takes to read its subtitle). Everything
// moves by tweens started at the cues. So that it lives: dust drifts in the light, wet ink throws
// sparks as it spreads and as it lifts off, the drawings float a little, the glasses turn, the
// camera closes in slowly. A film ends in black, and the game comes up out of it.
//
// It has a renderer and canvas of its own, like the splash screen. While it plays the world
// behind waits (state.film: game/state.js worldPaused), main.js draws nothing of it (filmCovers)
// and the music waits (audio/music.js holdMusic); the film's own score (music/films/<score>.scrim)
// plays instead, its stretches fitted to the shots (core/film.js scorePlan). The film's time is the
// sound's clock while sound plays (else the page's), so the pictures keep with the score and the
// voice when a frame stalls (the world loads behind). A click or key asks whether to skip, another
// one skips; Esc skips at once. ?film=<name> plays one over the main menu (films.js), with
// ?at=<s> from that far in, and ?hold=1 stopped there (to look at it); ?film=0 never plays the
// opening. Reducing motion: the camera stays still and does not shake.
import * as THREE from 'three';
import { stageUniforms, stageRenderer, floorMesh, beamMesh, mistMesh, pointCloud, glassMeshes, facets, glowTexture, NOISE } from '../render/stage.js';
import { loadImage, loadText, flowOf, inkMaterial, inkPoints, TINTS, CELLS } from './ink.js';
import { makeGlass } from './glass.js';
import { schedule, readTime, scorePlan } from '../core/film.js';
import { splashHit, splashShatter } from '../audio/splash.js';
import { filmCrackle } from '../audio/film.js';
import { holdMusic, loadMusic, playFilmScore, stopFilmScore } from '../audio/music.js';
import { barsOf, filmEvents } from '../audio/score.js';
import { audioRunning, audioTime } from '../audio/context.js';
import { reduceMotion } from '../game/settings.js';
import { state } from '../game/state.js';
import { tr } from '../i18n/i18n.js';

// --- the stage ------------------------------------------------------------------------------------
// The sheet is 16 x 9 units: x from -8 (left) to 8, y from 0 (the floor) up to 9. The films say
// where things are in these units.
export const SHEET = { w: 16, h: 9 };
const S = 0.25;                  // world units in a sheet unit
const SHEET_Z = -1.0;            // where the sheet stands
const FLOOR_Z = -0.2;            // where the glasses stand
const GLASS = 0.34;              // how big a glass is (world units)
const LIGHT = new THREE.Vector3(0, 2.9, FLOOR_Z);
const BEAM = 2.3;                // how wide the light's cone is at the floor (the splash's: 0.62)
const TARGET = new THREE.Vector3(0, 0.9, -0.4);
const FOV = 30;
const SCREEN_AT = 2;             // how far in front of the camera the screen's layers hang
const SCREEN = 2 * SCREEN_AT * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) / 9;   // world units in a sheet unit there
const MOTES = 3000;
const DUST = 110;                // motes of dust always drifting in the light
const SPARKS = 0.3;              // of a layer's ink points, the share that throws a spark
const VOICE_LEAD = 0.25;         // s into a shot its line starts
const SKIP_ASK = 3.5;            // s the "again to skip" hint waits for the second press
const REVEAL = 1.0;              // s the game comes out of the black after it
const SKIP = 0.5;                // s to black when skipped
const STEP = 1 / 20;             // s: the film's time moves on in steps of at most this

const clamp01 = x => Math.min(1, Math.max(0, x));
const EASE = {
  linear: k => k,
  in: k => k * k * k,
  out: k => 1 - (1 - k) ** 3,
  inOut: k => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
};
const deg = THREE.MathUtils.degToRad;
const sheetToWorld = (x, y, z = SHEET_Z) => new THREE.Vector3(x * S, y * S, z);
const jitter = (n = 1) => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(n);

const params = typeof location === 'object' ? new URLSearchParams(location.search) : new URLSearchParams();
const embedded = (() => { try { return window.top !== window; } catch { return true; } })();
// the opening is played (game/menu.js): not with the dev tools, in the guide's game window or with ?film=0
export const filmsWanted = () => params.get('film') !== '0' && !state.dev && !embedded;

let covering = false, peek = null;
// while a film hides everything (main.js need not draw the game)
export const filmCovers = () => covering;
// the film playing (dev, tests/browser/): its time, its length, the lines it has voices for
export const filmNow = () => peek?.() ?? null;

// The input while a film plays: none of it reaches the game behind (main.js imports this early,
// so these come before the game's own listeners); a press goes to the film (onPress)
let onPress = null;
const EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'touchstart', 'touchend', 'wheel', 'contextmenu'];
if (typeof addEventListener === 'function') {
  for (const ev of EVENTS) addEventListener(ev, e => {
    if (!covering) return;
    e.stopImmediatePropagation();
    if (!e.type.startsWith('key')) e.preventDefault();
    const press = e.type === 'pointerdown' || (e.type === 'keydown' && !e.repeat && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key));
    if (press) onPress?.(e);
  }, { capture: true, passive: false });
}

// the dark paper: a faint grain of fibres where the light reaches it from above
function paperMesh(u) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(SHEET.w * S * 1.6, SHEET.h * S * 1.5), new THREE.ShaderMaterial({
    uniforms: { uLevel: u.uLevel },
    vertexShader: /* glsl */`varying vec3 vWorld; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uLevel; varying vec3 vWorld;
      ${NOISE}
      void main() {
        float fibres = fbm(vec2(vWorld.x * 4.0, vWorld.y * 38.0)) * fbm(vWorld.xy * 9.0 + 3.0);
        vec2 d = (vWorld.xy - vec2(0.0, 2.1)) / vec2(3.4, 2.2);
        float lit = exp(-dot(d, d));
        gl_FragColor = vec4(vec3(0.55, 0.63, 0.72) * fibres * lit * 0.05 * uLevel, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  m.position.set(0, SHEET.h * S * 0.55, SHEET_Z - 0.02);
  m.renderOrder = 8;
  return m;
}

// Play `film` (film/opening.js). onEnd: once it is over and the game is coming out of the black.
// at: s into it to start (cues before it done at once), hold: stopped there (to look at it);
// click: it waits for a click or key first, if the sound has not started yet (opened from the
// address bar: so its voice is heard).
export function playFilm(film, { onEnd = () => {}, at = 0, hold = false, click = false } = {}) {
  if (covering) return false;
  const box = document.createElement('div'), canvas = document.createElement('canvas');
  const sub = document.createElement('div'), hint = document.createElement('div'), black = document.createElement('div');
  box.id = 'film'; sub.id = 'film-subtitle'; hint.id = 'film-hint'; black.id = 'film-black';
  sub.append(document.createElement('p'));
  box.append(canvas, sub, hint);
  document.body.append(box, black);
  const stage = stageRenderer(canvas);
  if (!stage) { box.remove(); black.remove(); onEnd(); return false; }
  const { renderer } = stage;
  renderer.autoClear = false;
  covering = true; state.film = true;
  holdMusic(true);
  const calm = reduceMotion();

  const u = stageUniforms({ light: LIGHT, cone: [Math.cos(Math.atan(BEAM * 1.25 / LIGHT.y)), Math.cos(Math.atan(BEAM * 0.55 / LIGHT.y))] });
  u.uLevel.value = 0;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 40);
  const world = new THREE.Group();   // what the floor mirrors
  const floor = floorMesh(u, [0, FLOOR_Z], BEAM / 0.62), beam = beamMesh(u, BEAM);
  const mists = [mistMesh(u, 8, 2.6, 0.12, 0.03, 0.0, [0, 0], BEAM / 0.62), mistMesh(u, 7, 1.3, 0.1, -0.05, 3.1, [0, 0], BEAM / 0.62)];
  mists[0].position.set(-0.3, 1.1, -0.6); mists[1].position.set(0.2, 0.3, 0.5);
  mists.forEach((m, i) => { m.renderOrder = i ? 32 : 9; });
  scene.add(world, floor, beam, ...mists, camera);   // (the camera: the screen's layers hang on it)
  world.add(paperMesh(u));
  const motes = pointCloud(MOTES);
  world.add(motes);
  const resize = () => stage.resize(camera);
  resize();
  addEventListener('resize', resize);

  // --- input: a press asks, the next one skips; Esc skips ----------------------------------------
  let askedAt = -Infinity, skipAt = Infinity, t = 0, ended = false;
  const coarse = () => matchMedia?.('(pointer: coarse)').matches;
  // waiting for the click that lets the sound start (it starts the voices loading)
  let waiting = click && !audioRunning();
  if (waiting) { hint.textContent = coarse() ? tr('Tap to begin') : tr('Click to begin'); hint.classList.add('shown'); }
  onPress = e => {
    if (waiting) { waiting = false; hint.classList.remove('shown'); begin(); return; }
    if (skipAt < Infinity) return;
    if (e.key === 'Escape' || t - askedAt < SKIP_ASK) { skipAt = t; hint.classList.remove('shown'); stopFilmScore(SKIP / 3); return; }
    askedAt = t;
    hint.textContent = coarse() ? tr('Tap again to skip') : tr('Click again to skip');
    hint.classList.add('shown');
  };

  // --- what is on the stage ----------------------------------------------------------------------
  const layers = new Map(), glasses = new Map(), voices = new Map();
  let plan = null, next = 0, tweens = [], dark = 1, ready = false, darkFrom = null, reveal = REVEAL, kick = 0;
  const pieces = [];   // the pieces of broken layers: { o, v, w, tilt, fall, lasts, life, mat }
  const bubbles = [];  // the star-glass bubbles rising (bubble)
  const focus = { at: TARGET.clone(), near: 0 };   // what the camera goes closer to, how much
  let crackle = null;
  let score = null, notes = null;   // the film's score, and its notes for this plan

  const loadLayers = Promise.all(Object.entries(film.layers).map(async ([name, def], i) => {
    // (a text in the player's language, swept in straight from the left: its letters at one pace)
    const image = def.text ? await loadText(tr(def.text)) : await loadImage(def.image ?? name);
    const flow = flowOf(image, def.from ?? (def.text ? 'left' : 'bottom'), { sweep: !!def.text });
    const mat = inkMaterial(image, flow.texture, TINTS[def.tint ?? 'ink'], i * 1.37);
    const h = def.h * S, mesh = new THREE.Mesh(new THREE.PlaneGeometry(h * image.aspect, h), mat);
    // on the sheet, or (screen) in front of the camera: `at` and `h` in sheet units of a picture
    // the sheet's height, its middle at the picture's middle (the title)
    const base = def.screen ? new THREE.Vector3(def.at[0] * SCREEN, def.at[1] * SCREEN, -SCREEN_AT) : sheetToWorld(def.at[0], def.at[1], SHEET_Z + 0.004 * (i + 1));
    if (def.screen) mesh.scale.setScalar(SCREEN / S);
    mesh.position.copy(base);
    if (def.flip) mesh.scale.x *= -1;
    mesh.renderOrder = def.screen ? 40 : 10;
    (def.screen ? camera : world).add(mesh);
    // its ink points in the order the ink gets there: the sparks thrown as it spreads and leaves
    const points = inkPoints(image, flow.flow, 700).sort((a, b) => a.flow - b.flow);
    layers.set(name, { name, def, image, flow, mat, mesh, base, points, phase: i * 2.1, turn: deg(def.turn ?? 0), painted: 0, left: 0 });
  }));
  // the lines' clips (none: their subtitles are read), loaded with the rest once the sound may start
  const loadVoices = () => import('../game/narrator.js').then(({ voiceClip }) => Promise.all(film.shots.filter(s => s.line)
    .map(async s => { const clip = await voiceClip(`film.${film.name}.${s.id}`).catch(() => null); if (clip) voices.set(s.id, clip); })))
    .catch(e => console.warn('film voices:', e));
  for (const [name, def] of Object.entries(film.glasses ?? {})) {
    const g = makeGlass(u, GLASS);
    g.group.position.set(def.at * S, 0, FLOOR_Z + (def.z ?? 0));
    g.group.rotation.y = deg(def.turn ?? 0);
    g.group.visible = false;
    world.add(g.group);
    glasses.set(name, { name, def, g, ink: null, spin: deg(def.spin ?? 0), grown: false, y: 0, hover: 0, phase: Math.random() * 6 });
  }
  // its score (none: the film is silent but for its voice and sounds)
  const loadScore = () => (film.score ? loadMusic(`films/${film.score}`).then(s => { score = s; }) : Promise.resolve());
  function begin() {
    Promise.all([loadLayers, loadVoices(), loadScore()]).then(() => {
      if (ended) return;
      crackle = filmCrackle();
      plan = schedule(film, shot => voices.get(shot.id)?.buffer.duration ?? readTime(tr(shot.line)));
      if (score) {
        try { notes = filmEvents(score.song, scorePlan(plan, name => barsOf(score.song, name))); }
        catch (e) { console.warn('film score:', e); }
      }
      ready = true; black.style.opacity = '0';
    }).catch(e => { console.warn('film:', e); end(); });
  }
  if (!waiting) begin();
  else loadLayers.catch(e => { console.warn('film:', e); end(); });

  // --- the motes: ink flying from the sheet into a glass, sparks, ink and glass dust drifting -----
  const geo = motes.geometry, mPos = geo.attributes.position.array, mCol = geo.attributes.color.array;
  const mAlpha = geo.attributes.alpha.array, mSize = geo.attributes.size.array;
  const mote = Array.from({ length: MOTES }, () => ({ on: false }));
  let free = 0;
  const spawn = m => {
    for (let k = 0; k < MOTES; k++) {
      const i = (free + k) % MOTES;
      if (!mote[i].on) { mote[i] = { on: true, ...m }; free = (i + 1) % MOTES; return; }
    }
  };
  // a mote of dust somewhere in the light, for a while
  const DUST_COLOR = new THREE.Color('#cfe2ee'), SMOKE = new THREE.Color('#8fa4b8');
  // a bubble of star-glass: faceted glass round a soft light; set(a): how bright, 0 to 1
  const BUBBLE_LIGHT = new THREE.Color('#dbe9ff'), glow = glowTexture();
  function makeBubble() {
    const group = new THREE.Group(), glass = glassMeshes(u, facets(new THREE.IcosahedronGeometry(0.045, 1)), new THREE.Color('#bcd6ff'), { opacity: 0.12 }, 14);
    const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: BUBBLE_LIGHT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    light.scale.setScalar(0.17); light.renderOrder = 15;
    group.add(...glass, light);
    return { group, set(a) { light.material.opacity = a; for (const m of glass) m.material.uniforms.uFade.value = a; } };
  }
  const dust = (anywhere = false) => {
    const r = Math.sqrt(Math.random()) * BEAM * 0.7, a = Math.random() * Math.PI * 2, life = 5 + Math.random() * 7;
    return { dust: true, p: new THREE.Vector3(LIGHT.x + Math.cos(a) * r, anywhere ? Math.random() * 2.6 : 0.3 + Math.random() * 2.3, LIGHT.z + Math.sin(a) * r * 0.8),
      v: new THREE.Vector3((Math.random() - 0.5) * 0.03, -0.008 - Math.random() * 0.02, (Math.random() - 0.5) * 0.02), drag: 0,
      life, max: life, alpha: 0.35 + Math.random() * 0.5, size: 0.002 + Math.random() * 0.003, color: DUST_COLOR, twinkle: 0.6 + Math.random() * 2 };
  };
  for (let i = 0; i < DUST * 2; i++) spawn({ ...dust(true), life: Math.random() * 10 });
  const tmp = new THREE.Vector3();
  function stepMotes(dt) {
    for (let i = 0; i < MOTES; i++) {
      let m = mote[i];
      if (!m.on) { mAlpha[i] = 0; continue; }
      let a;
      if (m.to) {   // flying from `from` to `to`, starting at t0, along a bow
        const k = clamp01((t - m.t0) / m.dur);
        if (k <= 0) { mAlpha[i] = 0; continue; }
        const e = EASE.inOut(k);
        tmp.lerpVectors(m.from, m.to, e);
        tmp.y += Math.sin(Math.PI * e) * m.bow;
        tmp.x += Math.sin(Math.PI * e) * m.sway;
        a = Math.sin(Math.PI * Math.min(1, k * 1.15)) * m.alpha;
        if (k >= 1) m.on = false;
      } else {      // drifting, slowing, fading
        m.life -= dt;
        if (m.life <= 0) {
          if (!m.dust) { m.on = false; mAlpha[i] = 0; continue; }
          m = mote[i] = { on: true, ...dust() };   // (the dust goes on)
        }
        m.v.multiplyScalar(Math.exp(-m.drag * dt));
        if (m.rise) m.v.y += m.rise * dt;
        m.p.addScaledVector(m.v, dt);
        tmp.copy(m.p);
        if (m.born != null && t < m.born) { mAlpha[i] = 0; continue; }
        a = Math.min(1, m.life / m.max * 1.5, (m.born != null ? t - m.born : m.max - m.life) * 4) ** 1.2 * m.alpha;
        if (m.flicker) a *= 0.75 + 0.25 * Math.sin(t * m.flicker + i);
        if (m.dust) {
          // brighter near the light's axis, twinkling as it turns
          const r = Math.hypot(m.p.x - LIGHT.x, m.p.z - LIGHT.z);
          a *= Math.exp(-r * r / (0.45 * BEAM * BEAM)) * (0.55 + 0.45 * Math.sin(t * m.twinkle + i)) * u.uLevel.value;
        }
      }
      mPos[i * 3] = tmp.x; mPos[i * 3 + 1] = tmp.y; mPos[i * 3 + 2] = tmp.z;
      mCol[i * 3] = m.color.r; mCol[i * 3 + 1] = m.color.g; mCol[i * 3 + 2] = m.color.b;
      mAlpha[i] = a; mSize[i] = m.size;
    }
    geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.alpha.needsUpdate = geo.attributes.size.needsUpdate = true;
  }
  // where a point of a layer's picture is in the world (u right, v down)
  const onMesh = (mesh, p) => mesh.localToWorld(new THREE.Vector3((p.u - 0.5) * mesh.geometry.parameters.width, (0.5 - p.v) * mesh.geometry.parameters.height, 0));
  // sparks from a layer's ink between flow `from` and `to` (spreading: they jump off and fall;
  // leaving: they rise, as if the ink lifted off)
  function sparks(l, from, to, leaving) {
    if (to <= from) return;
    const tint = l.mat.uniforms.uTint.value;
    for (const p of l.points) {
      if (p.flow <= from) continue;
      if (p.flow > to) break;
      if (Math.random() > SPARKS * (leaving ? 1.4 : 1)) continue;
      const life = 0.5 + Math.random() * (leaving ? 1.6 : 1.0);
      spawn({ p: onMesh(l.mesh, p).add(new THREE.Vector3(0, 0, 0.01)), life, max: life, drag: 1.2, rise: leaving ? 0.05 : -0.06,
        v: jitter(0.06).add(new THREE.Vector3(0, leaving ? 0.05 : 0.02, 0.03 + Math.random() * 0.04)),
        alpha: 0.7 + Math.random() * 0.3, size: 0.003 + Math.random() * 0.005, color: tint });
    }
  }

  // --- the cues ----------------------------------------------------------------------------------
  const tween = (dur, apply, ease = 'inOut', delay = 0) => tweens.push({ t0: t + delay, dur: Math.max(1e-3, dur), apply, ease: EASE[ease] ?? EASE.inOut });
  const layerOf = name => { const l = layers.get(name); if (!l) throw new Error(`film: no layer ${name}`); return l; };
  const glassOf = name => { const g = glasses.get(name); if (!g) throw new Error(`film: no glass ${name}`); return g; };
  const PAINTED = 1.12;   // (the flow's last, its noise and the front's softness: core/film.js, film/ink.js)
  const CUE = {
    paint(c) {
      const l = layerOf(c.layer), from = l.mat.uniforms.uPaint.value;
      tween(c.for ?? 2, k => {
        const v = from + (PAINTED - from) * k;
        sparks(l, l.painted, v, false);
        l.painted = l.mat.uniforms.uPaint.value = v;
      }, c.ease ?? 'out');
    },
    fade(c) {
      const l = layerOf(c.layer), from = l.mat.uniforms.uGone.value;
      tween(c.for ?? 1.2, k => {
        const v = from + (PAINTED - from) * k;
        sparks(l, l.left, Math.min(v, l.painted), true);
        l.left = l.mat.uniforms.uGone.value = v;
      }, c.ease ?? 'inOut');
    },
    move(c) {
      const l = layerOf(c.layer), from = l.base.clone(), by = c.by ?? [0, 0];
      tween(c.for ?? 2, k => { l.base.set(from.x + by[0] * S * k, from.y + by[1] * S * k, from.z); }, c.ease ?? 'in');
    },
    // it cracks, the cracks shine, and it falls apart: each piece its own part of the picture,
    // turning, throwing sparks, going out. hold: [x, y, rx, ry], an ellipse of the picture that
    // stays whole and falls as one, out of the bottom of the picture
    break(c) {
      const l = layerOf(c.layer), hold = c.hold;
      const outside = hold ? l.points.filter(p => ((p.u - hold[0]) / hold[2]) ** 2 + ((p.v - hold[1]) / hold[3]) ** 2 > 1.2) : l.points;
      const seeds = Array.from({ length: CELLS }, () => { const p = outside[Math.floor(Math.random() * outside.length)]; return new THREE.Vector2(p.u, p.v); });
      l.mat.uniforms.uCells.value = seeds;
      if (hold) l.mat.uniforms.uHold.value.set(...hold);
      tween(0.35, k => { l.mat.uniforms.uCrack.value = k; }, 'out');
      tweens.push({ t0: t + 0.4, dur: 1e-3, ease: EASE.linear, apply: () => {
        world.updateMatrixWorld(true);
        const { width, height } = l.mesh.geometry.parameters, centre = l.mesh.getWorldPosition(new THREE.Vector3());
        const cells = hold ? [...seeds, new THREE.Vector2(hold[0], hold[1])] : seeds;
        cells.forEach((seed, k) => {
          const mat = inkMaterial(l.image, l.flow.texture, l.mat.uniforms.uTint.value, l.mat.uniforms.uSeed.value, seeds);
          for (const key of ['uPaint', 'uGone', 'uLevel', 'uCrack']) mat.uniforms[key].value = l.mat.uniforms[key].value;
          mat.uniforms.uHold.value.copy(l.mat.uniforms.uHold.value);
          mat.uniforms.uCell.value = k;
          const at = new THREE.Vector3((seed.x - 0.5) * width, (0.5 - seed.y) * height, 0);
          const o = new THREE.Group(), mesh = new THREE.Mesh(l.mesh.geometry, mat);
          mesh.position.copy(at).negate();
          mesh.renderOrder = 10;
          o.add(mesh);
          o.position.copy(l.mesh.localToWorld(at.clone()));
          o.rotation.z = l.mesh.rotation.z;
          world.add(o);
          if (k === CELLS) {   // the whole part: it drops, slowly at first, nose down
            pieces.push({ o, mat, v: new THREE.Vector3(0, -0.02, 0), w: -0.12, tilt: 0, life: 0, fall: 0.5, lasts: 4.5 });
            return;
          }
          const out = o.position.clone().sub(centre).setZ(0).normalize();
          pieces.push({ o, mat, v: out.multiplyScalar(0.08 + Math.random() * 0.18).add(new THREE.Vector3(0, 0.05 * Math.random(), 0.05 + 0.1 * Math.random())),
            w: (Math.random() - 0.5) * 2.4, tilt: (Math.random() - 0.5) * 1.6, life: 0, fall: 0.35, lasts: 2.6 });
        });
        l.mesh.visible = false;
        sparks(l, -1, 2, true);
        if (!seeking) splashShatter();
      } });
    },
    // a small bubble of star-glass with a light in it (his words) rises `from` (world) into the
    // glass, and goes into it with a glint
    bubble(c) {
      const gl = glassOf(c.glass), dur = c.for ?? 4;
      world.updateMatrixWorld(true);
      const b = makeBubble(), from = new THREE.Vector3(...(c.from ?? [0.3, 0.02, 1.2])), to = gl.g.inside.getWorldPosition(new THREE.Vector3());
      world.add(b.group);
      const sway = (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.1);
      bubbles.push(b);
      tween(dur, k => {
        const e = EASE.inOut(k);
        b.group.position.lerpVectors(from, to, e);
        b.group.position.x += Math.sin(Math.PI * e) * sway;
        b.group.position.y += Math.sin(Math.PI * 2 * e) * 0.04;
        const into = Math.max(0, (k - 0.85) / 0.15);
        b.group.scale.setScalar(1 - 0.8 * into);
        b.set(1 - into);
        if (Math.random() < 0.5) spawn({ p: b.group.position.clone().add(jitter(0.01)), v: jitter(0.01).add(new THREE.Vector3(0, -0.01, 0)), drag: 1, life: 0.9, max: 0.9,
          alpha: 0.6 * (1 - into), size: 0.003 + Math.random() * 0.003, color: BUBBLE_LIGHT });
        if (k >= 1 && !b.done) { b.done = true; b.group.visible = false; u.uFlash.value = Math.max(u.uFlash.value, calm ? 0.2 : 0.45); }
      }, 'linear');
    },
    grow(c) {
      const gl = glassOf(c.glass), { g } = gl;
      g.group.visible = true; g.setCut(0);
      tween(c.for ?? 1, k => { g.setCut(k); if (k >= 1) gl.grown = true; }, c.ease ?? 'inOut');
    },
    rise(c) {
      const gl = glassOf(c.glass), y0 = gl.y;
      tween(c.for ?? 3, k => { gl.y = y0 + (c.by ?? 1) * k; gl.hover = k; }, c.ease ?? 'inOut');
    },
    // the layer's ink lifts off the sheet and flies into the glass, where it paints itself in again
    lift(c) {
      const l = layerOf(c.layer), gl = glassOf(c.glass), dur = c.for ?? 1.8;
      CUE.fade({ layer: c.layer, for: dur * 0.7 });
      if (!gl.ink) {
        const mat = inkMaterial(l.image, l.flow.texture, l.mat.uniforms.uTint.value, 5.3);
        const side = GLASS * 0.78, h = l.image.aspect >= 1 ? side / l.image.aspect : side;
        gl.ink = new THREE.Mesh(new THREE.PlaneGeometry(h * l.image.aspect, h), mat);
        gl.ink.renderOrder = 13;
        gl.ink.layer = l;
        gl.g.inside.add(gl.ink);
      }
      faceCamera(gl);
      world.updateMatrixWorld(true);
      const into = gl.ink.material;
      tween(dur * 0.75, k => { into.uniforms.uPaint.value = PAINTED * k; }, 'inOut', dur * 0.3);
      for (const p of inkPoints(l.image, l.flow.flow, 260)) {
        spawn({ from: onMesh(l.mesh, p), to: onMesh(gl.ink, p), t0: t + p.flow * dur * 0.55, dur: dur * (0.45 + 0.15 * Math.random()),
          bow: 0.15 + 0.2 * Math.random(), sway: (Math.random() - 0.5) * 0.15, alpha: 0.9, size: 0.006 + Math.random() * 0.008,
          color: l.mat.uniforms.uTint.value });
      }
    },
    // the glass breaks: its pieces drift apart, its ink scatters like a drop in water
    shatter(c) {
      const gl = glassOf(c.glass), g = gl.g;
      world.updateMatrixWorld(true);
      const centre = g.inside.getWorldPosition(new THREE.Vector3());
      g.shatter(new THREE.Vector3(...(c.from ?? [1, 1, 0.2])));
      gl.spin = 0;
      if (gl.ink) {
        const l = gl.ink.layer;
        for (const p of inkPoints(l.image, l.flow.flow, 320)) {
          const at = onMesh(gl.ink, p), v = at.clone().sub(centre).multiplyScalar(1.5 + Math.random() * 2.5).add(jitter(0.12));
          const life = 2.5 + Math.random() * 2;
          spawn({ p: at, v, drag: 0.7, life, max: life, alpha: 1, size: 0.005 + Math.random() * 0.009, color: l.mat.uniforms.uTint.value });
        }
        const ink = gl.ink.material;
        tween(0.25, k => { ink.uniforms.uLevel.value = 1 - k; }, 'out');
      }
      const shine = new THREE.Color('#dde9ff');
      for (let i = 0; i < 90; i++) {
        const dir = jitter().normalize(), life = 0.8 + Math.random() * 1.4;
        spawn({ p: centre.clone().addScaledVector(dir, g.half * 0.9), v: dir.multiplyScalar(0.3 + Math.random() * 0.9), drag: 1.6, life, max: life,
          alpha: 0.9, size: 0.003 + Math.random() * 0.005, color: shine });
      }
      u.uFlash.value = Math.max(u.uFlash.value, calm ? 0.4 : 1.2);
      kick = calm ? 0 : 1;
      tween(c.fadeAfter ?? 3.5, k => g.setFade(1 - k), 'in', 0.8);
      if (c.sound !== false && !seeking) splashShatter();
    },
    // it drifts off (by, world units), turning; fading to `fade` (the far ones), or coming to rest
    drift(c) {
      const gl = glassOf(c.glass), { g } = gl, by = c.by ?? [0, 0, 0];
      const x0 = g.group.position.x, y0 = gl.y, z0 = g.group.position.z, spin0 = gl.spin, fade = c.fade ?? 1;
      gl.spin += deg(c.spin ?? 0);
      tween(c.for ?? 4, k => {
        g.group.position.x = x0 + by[0] * k; gl.y = y0 + by[1] * k; g.group.position.z = z0 + by[2] * k;
        g.setFade(1 - (1 - fade) * k);
        if (gl.ink) gl.ink.material.uniforms.uLevel.value = 1 - (1 - fade) * k;
        if (k >= 1) gl.spin = spin0 + (gl.spin - spin0) * 0.3;
      }, c.ease ?? 'out');
    },
    // a crack runs round it, flashes, and holds
    crack(c) {
      const { g } = glassOf(c.glass), normal = new THREE.Vector3(...(c.across ?? [Math.random() - 0.5, 1, Math.random() - 0.5]));
      tween(0.18, k => g.setCrack(2.2 * k, normal), 'out');
      tween(1.6, k => g.setCrack(2.2 - 1.6 * k), 'out', 0.2);
      u.uFlash.value = Math.max(u.uFlash.value, calm ? 0.3 : 0.8);
      kick = Math.max(kick, calm ? 0 : 0.6);
      if (c.sound !== false && !seeking) splashHit();
    },
    // night falls in it (its ink dims to `dim`), lights come on, one by one (the windows), and
    // smoke rises from it
    lights(c) {
      const gl = glassOf(c.glass);
      if (!gl.ink) return;
      world.updateMatrixWorld(true);
      const amber = TINTS.amber, pts = inkPoints(gl.ink.layer.image, gl.ink.layer.flow.flow, 400).filter(p => p.v > 0.25 && p.v < 0.7);
      pts.slice(0, c.n ?? 22).forEach((p, i) => {
        const at = onMesh(gl.ink, p).add(new THREE.Vector3(0, 0, 0.004)), born = t + (i / (c.n ?? 22)) * (c.for ?? 3), flicker = 0.8 + Math.random() * 2.5;
        // a light, and its glow
        spawn({ p: at, v: new THREE.Vector3(), drag: 0, life: 600, max: 600, born, alpha: 1, size: 0.009 + Math.random() * 0.006, color: amber, flicker });
        spawn({ p: at.clone(), v: new THREE.Vector3(), drag: 0, life: 600, max: 600, born, alpha: 0.35, size: 0.035, color: amber, flicker });
      });
      gl.smoke = onMesh(gl.ink, pts[0] ?? { u: 0.5, v: 0.3 });
      // night falls in it: its ink dims, so the lights show
      const ink = gl.ink.material.uniforms.uLevel, from = ink.value;
      tween(c.for ?? 3, k => { ink.value = from + ((c.dim ?? 0.4) - from) * k; });
    },
    // the camera goes closer to the glass
    closer(c) {
      const gl = glassOf(c.glass), from = focus.at.clone(), near0 = focus.near, to = gl.g.inside.getWorldPosition(new THREE.Vector3());
      tween(c.for ?? 3, k => { focus.at.lerpVectors(from, to, k); focus.near = near0 + ((c.by ?? 0.5) - near0) * k; }, c.ease ?? 'inOut');
    },
    // its glass goes clear, and is gone; its ink stays
    vanish(c) { const { g } = glassOf(c.glass); tween(c.for ?? 2, k => g.setFade(1 - k), c.ease ?? 'inOut'); },
    crackle(c) { crackle?.level(c.to ?? 0.5, c.for ?? 0.6); },
    // the light to `to` (and with it the glass and the stage; the ink shines by itself)
    light(c) { const from = u.uLevel.value; tween(c.for ?? 1.5, k => { u.uLevel.value = from + ((c.to ?? 1) - from) * k; }); },
    // to black: the film is over once it is, and the game comes up out of the black in `reveal` s
    black(c) { darkFrom = { t0: t, dur: c.for ?? 1.5 }; reveal = c.reveal ?? REVEAL; },
    // a soft knock, as of something far off hitting the glass (audio/splash.js)
    knock() { if (!seeking) splashHit(); },
    music() {},   // (the score is laid out when the film starts: playFilmScore)
  };
  // the ink in a glass faces the camera, whichever way the glass is turned
  const faceCamera = gl => { if (gl.ink) gl.g.inside.rotation.y = -gl.g.group.rotation.y; };

  // the camera: the sheet across the screen whatever its shape, closing in slowly over the film,
  // drifting a little; a shake as the glass breaks
  function placeCamera(dt) {
    const vfov = deg(camera.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const along = plan ? EASE.inOut(clamp01(t / plan.length)) : 0;
    const dist = Math.max(5.4, (SHEET.w * S * 0.55) / Math.tan(hfov / 2)) * (1 - 0.09 * along) * (1 - 0.88 * focus.near);
    const sway = calm ? 0 : 1 - 0.7 * focus.near;
    const az = deg(sway * (1.6 * Math.sin(t * 0.13) + 3 * (along - 0.5))), el = deg(4 + sway * 0.6 * Math.sin(t * 0.11) + 1.2 * along);
    const target = focus.at;
    camera.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist).add(target);
    camera.lookAt(target);
    kick *= Math.exp(-dt * 6);
    if (kick > 1e-3) camera.position.add(jitter(0.03 * kick));
  }

  // the line: its subtitle, and its voice from VOICE_LEAD s into the shot
  const subtitle = sub.firstElementChild;
  let shownLine = null, speaking = null, stopVoice = null;
  function showLine(line) {
    if (line === shownLine) return;
    shownLine = line;
    if (line) subtitle.textContent = tr(line);
    sub.classList.toggle('on', !!line);
  }
  function hush() { stopVoice?.(); stopVoice = null; }

  // the film's time moves on by dt: the cues come, the tweens run, the motes and pieces move;
  // false once it is over
  function advance(dt, now) {
    t += dt;
    while (next < plan.cues.length && plan.cues[next].t <= t) {
      const c = plan.cues[next++];
      try { CUE[c.do](c); } catch (e) { console.warn(e); }
    }
    tweens = tweens.filter(w => {
      const k = clamp01((t - w.t0) / w.dur);
      if (t >= w.t0) w.apply(w.ease(k));
      return k < 1;
    });
    const shot = plan.shots.find(s => t >= s.start && t < s.start + s.length);
    const into = shot ? t - shot.start - VOICE_LEAD : -1;
    showLine(shot?.line && into > -VOICE_LEAD && into < shot.said + 0.3 ? shot.line : null);
    const voice = shot?.line && voices.get(film.shots[shot.shot].id);
    if (voice && speaking !== shot && into >= 0 && into < shot.said && !seeking && skipAt === Infinity) {
      speaking = shot; hush(); stopVoice = voice.play(into, { worn: !!film.shots[shot.shot].worn });
    }
    dark = darkFrom ? clamp01((t - darkFrom.t0) / darkFrom.dur) : Math.max(0, 1 - t / 0.8);
    if (skipAt < Infinity) dark = Math.max(dark, clamp01((t - skipAt) / SKIP));
    if (t - askedAt > SKIP_ASK) hint.classList.remove('shown');
    u.uFlash.value *= Math.exp(-dt * 5);
    // the drawings float a little; the glasses turn, and bob once they are up
    for (const l of layers.values()) {
      l.mat.uniforms.uTime.value = t;
      const float = l.def.screen ? 0 : 1;   // (the screen's stay put)
      l.mesh.position.set(l.base.x + Math.sin(t * 0.31 + l.phase) * 0.012 * float, l.base.y + Math.sin(t * 0.23 + l.phase * 1.7) * 0.016 * float, l.base.z);
      l.mesh.rotation.z = l.turn + deg(0.7) * Math.sin(t * 0.19 + l.phase) * float;
    }
    for (const gl of glasses.values()) {
      const { g } = gl;
      if (gl.grown) g.group.rotation.y += gl.spin * dt;
      g.group.rotation.z = deg(4) * gl.hover * Math.sin(t * 0.7 + gl.phase);
      g.group.position.y = gl.y + 0.014 * gl.hover * Math.sin(t * 1.3 + gl.phase);
      faceCamera(gl);
      g.step(dt);
    }
    for (const p of pieces) {
      p.life += dt;
      p.v.y -= p.fall * dt;
      p.o.position.addScaledVector(p.v, dt);
      p.o.rotation.z += p.w * dt; p.o.rotation.x += p.tilt * dt * 0.3;
      p.mat.uniforms.uLevel.value = Math.max(0, 1 - p.life / p.lasts);
      p.mat.uniforms.uCrack.value *= Math.exp(-dt * 2);
      p.mat.uniforms.uTime.value = t;
    }
    for (const gl of glasses.values()) {
      if (gl.smoke && Math.random() < dt * 6) {
        const life = 2.5 + Math.random() * 2;
        spawn({ p: gl.smoke.clone().add(jitter(0.01)), v: new THREE.Vector3((Math.random() - 0.3) * 0.01, 0.025 + Math.random() * 0.02, 0), drag: 0.2, rise: 0.004,
          life, max: life, alpha: 0.5, size: 0.006 + Math.random() * 0.008, color: SMOKE });
      }
    }
    stepMotes(dt);
    for (const m of [beam, ...mists]) if (m.material.uniforms.uTime) m.material.uniforms.uTime.value = now;
    return !((darkFrom && t >= darkFrom.t0 + darkFrom.dur + 0.1) || t >= plan.length + 0.5 || (skipAt < Infinity && t >= skipAt + SKIP + 0.05));
  }

  peek = () => ({ film: film.name, t, length: plan?.length ?? null, voiced: [...voices.keys()], scored: !!notes, skipping: skipAt < Infinity });
  const startAt = Math.max(0, Number(at) || 0);
  // the film's clock: the sound's while it plays (the score and the voices go by it), else the page's
  let last = performance.now() / 1000, started = false, seeking = false, byAudio = false, origin = 0;
  const clock = () => (byAudio ? audioTime() : performance.now() / 1000);
  function frame() {
    if (ended) return;
    const now = performance.now() / 1000, dt = Math.min(now - last, 1 / 20);
    last = now;
    if (ready) {
      const still = hold && startAt;
      if (!started) {
        started = true; seeking = true;
        while (t < startAt) advance(Math.min(1 / 30, startAt - t), now);
        seeking = false;
        byAudio = audioRunning() && !still;
        origin = clock() - t;
        if (byAudio && notes) playFilmScore(score, notes, origin);
      }
      if (skipAt < Infinity) hush();
      // on to where the clock says, in steps (after a long stall, or a while behind another tab,
      // many: those go by silently, as a seek does, and the voice comes in where it is by then)
      if (!still) {
        const to = byAudio ? clock() - origin : t + dt, far = to - t > 0.5;
        while (t < to - 1e-6) {
          seeking = far && to - t > STEP;
          if (!advance(Math.min(STEP, to - t), now)) { seeking = false; end(); return; }
        }
        seeking = false;
      }
    }
    placeCamera(dt);
    for (const m of mists) m.quaternion.copy(camera.quaternion);
    motes.material.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(deg(camera.fov) / 2));
    stage.draw(() => {
      renderer.clear();
      // the floor's mirror image first, then the floor over it, then the stage
      world.scale.y = -1; floor.visible = beam.visible = false; for (const m of mists) m.visible = false; for (const c of camera.children) c.visible = false;
      renderer.render(scene, camera);
      world.scale.y = 1; floor.visible = beam.visible = true; for (const m of mists) m.visible = true; for (const c of camera.children) c.visible = true;
      renderer.render(scene, camera);
    }, dark);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // over: the picture is black; the film goes, the game comes out of the black, the music starts
  function end() {
    if (ended) return;
    ended = true;
    peek = null;
    covering = false; state.film = false;
    if (skipAt < Infinity) stopFilmScore(SKIP / 3);   // (else it rings on into the game, which waits for it)
    holdMusic(false);
    onPress = null;
    crackle?.stop(0.6);
    sub.classList.remove('on'); hint.classList.remove('shown');
    hush();
    removeEventListener('resize', resize);
    box.remove();
    stage.dispose(scene);
    black.style.opacity = '1';
    const from = performance.now();
    const reveal = () => {
      const k = (performance.now() - from) / 1000 / reveal;
      black.style.opacity = String(1 - EASE.inOut(clamp01(k)));
      if (k < 1) requestAnimationFrame(reveal); else black.remove();
    };
    requestAnimationFrame(reveal);
    onEnd();
  }
  return true;
}

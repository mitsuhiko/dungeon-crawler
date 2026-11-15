// Woppylava's fight, drawn (core/woppylava.js has the rules, game/woppylava.js runs it and calls
// drawWoppylavaFx every frame, in every game, with what he carries; docs/bosses.md "Woppylava"):
//   - his walls of lava: while one warns, a seam glowing and bubbling along the side of the arena it
//     comes from, its gap dark, the crest just showing out of the ground; then a wall of molten rock
//     rolling across, its foot on the ground (or the lava, where that stands higher), a gap through
//     it, embers and spray blown off its crest;
//   - his lava hands: a ring on the floor following a hero, pulsing faster and reddening as it locks;
//     a hand of lava on a long arm coming down out of the dark onto it, slamming down (a splash, a
//     flash), its fingers clutching the floor, and drawing back up;
//   - the landing spots of his eruption's bombs: a target glowing brighter till the bomb lands, then
//     a splash of lava and embers (the bombs are the game's own `fireball` projectiles, lobbed);
//   - the lava standing over the basin's flat lava (render/trials.js draws that): the crater's pool,
//     and after the eruption the lava pouring down the volcano cell by cell, hugging the floor, in
//     the cube's own lava look (render/materials.js cellMaterial);
//   - the mound asleep in the middle (phase 1): its cracks glowing and smoke rising, the more the
//     nearer phase 2 comes (`stir`); the volcano (phase 2): a column of smoke and glow out of its
//     crater, a fountain of lava after the eruption.
// Everything in the cube's coordinates, in a group at where the cube is drawn; two point lights at
// most (render/lightpool.js): the crater's and the brightest of the rest.
import * as THREE from 'three';
import { scene } from './scene.js';
import { emit, soft, glow, rand } from './particles.js';
import { trackLight, untrackLight } from './lightpool.js';
import { fluidMaterial, cellMaterial, fluidGlow, WIND } from './materials.js';
import { cutMaterial } from './section.js';
import { paletteOf } from './fluidpal.js';
import { restY } from './surface.js';
import { groundPatch } from './meteors.js';
import { palRow } from '../themes/fluids.js';
import { groundAt } from '../physics/collide.js';
import { player, state } from '../game/state.js';
import { N, LAVA } from '../core/constants.js';
import { WOPPYLAVA_FIGHT as G, wallAt, handPhase, handLands } from '../core/woppylava.js';

const FIRE = ['#fff2b0', '#ffd25a', '#ff9a2a', '#ff5a14'], SMOKE = ['#2a2420', '#3a332e', '#4a423b'], DROP = ['#ffb040', '#ff7a1a', '#ff5010'];
const HIGH = 200;   // (asking the ground from far over everything)

// value noise, for the molten rock and the smoke
const NOISE = `
  float hh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vn(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hh(i), hh(i + vec3(1, 0, 0)), f.x), mix(hh(i + vec3(0, 1, 0)), hh(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hh(i + vec3(0, 0, 1)), hh(i + vec3(1, 0, 1)), f.x), mix(hh(i + vec3(0, 1, 1)), hh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 x) { return 0.55 * vn(x) + 0.3 * vn(x * 2.1 + 7.0) + 0.15 * vn(x * 4.3 + 13.0); }`;

// --- the molten rock: the walls, the hands and their arms --------------------------------------------
// Lit by itself in the lava's colours (its palette's, render/fluidpal.js): molten rock streaming
// along `aFlow` (x across, y along the way it runs, world units), hot veins in it, plates of dark
// crust riding on it with bright seams round them, hotter where `aHeat` says (a wall's crest, the
// fingertips), a hot rim where it turns away from you, and darker up into the dark (`uDark`: from
// what height over `uBase` it fades out). A hand's fingers curl (HAND: aFin, aKnuck).
const MOLTEN_VS = `uniform float uTime, uCurl, uSpread, uBulge, uRate;
  attribute vec2 aFlow; attribute float aHeat;
  #ifdef HAND
  attribute vec4 aFin; attribute vec3 aKnuck;
  #endif
  varying vec3 vW, vN; varying vec2 vFlow; varying float vHeat; ${NOISE}
  vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
  vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
  void main() {
    vec3 p = position, n = normal;
    #ifdef HAND
    if (aFin.z > 0.0) {
      // a finger, along +z from its knuckle: bent at its two joints and its knuckle (the distal first),
      // then turned out from the palm
      float z = p.z, a0 = aFin.y + uCurl * 0.95, a1 = 0.12 + uCurl * 1.35, a2 = 0.08 + uCurl * 1.15;
      if (z > aFin.w) { p.z -= aFin.w; p = rotX(p, a2); n = rotX(n, a2); p.z += aFin.w; }
      if (z > aFin.z) { p.z -= aFin.z; p = rotX(p, a1); n = rotX(n, a1); p.z += aFin.z; }
      p = rotX(p, a0); n = rotX(n, a0);
      float yaw = aFin.x * (1.0 + uSpread * 0.35);
      p = rotY(p, yaw) + aKnuck; n = rotY(n, yaw);
    } else if (p.y > 0.9) {
      // (the arm sways a little)
      float k = clamp((p.y - 0.9) / 3.0, 0.0, 1.0);
      p.x += sin(p.y * 0.55 + uTime * 1.7) * 0.18 * k; p.z += cos(p.y * 0.45 + uTime * 1.3) * 0.12 * k;
    }
    #endif
    // (heaving: lumps of it rolling along the way it runs)
    p += n * (fbm(vec3(aFlow.x * 1.1, (aFlow.y - uTime * uRate) * 1.1, 2.0)) - 0.5) * uBulge;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vW = w.xyz; vN = normalize(mat3(modelMatrix) * n); vFlow = aFlow; vHeat = aHeat;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const CELLS_GLSL = `
  vec2 h2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
  // how far p is from the edge between the cells of a cellular noise (0 on it)
  float cracks(vec2 p) {
    vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y)), r = g + h2(i + g) - f; float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return sqrt(d2) - sqrt(d1);
  }`;
const MOLTEN_FS = `uniform float uTime, uK, uRate, uSeed, uGlow, uBase, uDark, uStreams;
  uniform vec3 uBody, uCrust, uLine, uFoam;
  varying vec3 vW, vN; varying vec2 vFlow; varying float vHeat; ${NOISE} ${CELLS_GLSL}
  void main() {
    vec3 nn = normalize(vN), v = normalize(cameraPosition - vW);
    float face = abs(dot(nn, v)), heat = clamp(vHeat, 0.0, 1.0);
    vec2 f = vec2(vFlow.x, vFlow.y - uTime * uRate);
    // (lava pouring over a ledge: a sheet at its lip, breaking into streams further down, the rock
    // showing between them; vHeat 1 at the lip .. 0 at the foot)
    if (uStreams > 0.5) {
      float s = fbm(vec3(vFlow.x * 2.2, f.y * 0.25, uSeed + 3.0)), down = 1.0 - heat;
      if (down > 0.08 && s < 0.25 + 0.35 * down) discard;
    }
    float n1 = fbm(vec3(f * 1.3, uSeed)), n2 = fbm(vec3(f * 2.6 + 5.0, uSeed + uTime * 0.3));
    // molten rock: deep orange in its folds, bright in veins streaming along it
    // (streaks along the way it runs: darker folds and bright runnels)
    float streak = fbm(vec3(f.x * 3.2, f.y * 0.55, uSeed + 7.0));
    vec3 deep = uBody * uBody * 0.7;
    vec3 molten = mix(deep, uBody, smoothstep(0.25, 0.7, n1 * 0.6 + streak * 0.6) * (0.55 + 0.45 * heat));
    molten = mix(molten, uLine, smoothstep(0.58, 0.8, n2 * 0.6 + streak * 0.5) * (0.5 + 0.5 * heat));
    // plates of dark crust riding on it, glowing cracks between them; fewer the hotter it is
    float c = cracks(f * 1.35 + (vec2(n1, n2) - 0.5) * 1.2), aa = fwidth(c) + 1e-3;
    float cover = clamp((1.0 - heat * 1.3) * (0.35 + 0.9 * n1), 0.0, 1.0);
    float gapW = mix(0.42, 0.07, cover);
    float plate = smoothstep(gapW - aa, gapW + aa, c);
    float crack = (1.0 - smoothstep(0.0, gapW + 0.06, c)) * cover;
    vec3 col = mix(molten, uCrust * (0.55 + 0.6 * n2), plate * smoothstep(0.15, 0.4, cover));
    col += uLine * crack * 0.55;
    // (a little shape: a shade lighter facing up, a warm rim; the hottest glowing)
    col *= 0.78 + 0.32 * (nn.y * 0.5 + 0.5);
    col += uBody * pow(1.0 - face, 3.0) * 0.35;
    // into the dark overhead
    col *= 1.0 - smoothstep(uDark * 0.35, uDark, vW.y - uBase);
    gl_FragColor = vec4(col * uGlow, uK);
    #include <colorspace_fragment>
  }`;
// the lava's colours (linear): the cube's lava palette
function lavaColors() {
  const m = state.map, p = paletteOf(m?.fluidRows?.[LAVA] ?? palRow(m?.depth ?? 0, LAVA, 0));
  const c = a => new THREE.Color(a[0], a[1], a[2]);
  return { body: c(p.body), crust: c(p.dark), line: c(p.line), foam: c(p.foam), emissive: c(p.emissive), row: m?.fluidRows?.[LAVA] ?? palRow(m?.depth ?? 0, LAVA, 0) };
}
function moltenMaterial(colors, { hand = false, rate = 0.6, seed = 0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uK: { value: 1 }, uRate: { value: rate }, uBulge: { value: hand ? 0.05 : 0.16 }, uStreams: { value: 0 }, uSeed: { value: seed }, uGlow: { value: 1 }, uCurl: { value: 0 }, uSpread: { value: 0 },
      uBase: { value: 0 }, uDark: { value: 1e4 }, uBody: { value: colors.body }, uCrust: { value: colors.crust }, uLine: { value: colors.line }, uFoam: { value: colors.foam } },
    defines: hand ? { HAND: '' } : {}, vertexShader: MOLTEN_VS, fragmentShader: MOLTEN_FS, side: THREE.DoubleSide, transparent: true,
  });
}

// --- marks on the ground: rings, targets, shockwaves -----------------------------------------------------
// A patch on the ground (render/meteors.js groundPatch: uv 0..1 across a square uR wide each way, in
// units), drawn: a ring at uRing (its width uWidth), dashes turning inside it, a fill growing (uFill),
// pulsing (uPulse: rad/s), from uCol to uRed (uRed: 0..1), a shadow under it (uShade), and a
// shockwave ring running out (uWave: its radius, < 0 none; uWaveK how bright)
const MARK_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const MARK_FS = `uniform float uTime, uK, uR, uRing, uWidth, uFill, uPulse, uRed, uShade, uWave, uWaveK, uSpin;
  uniform vec3 uCol, uHot, uRedCol;
  varying vec2 vUv; ${NOISE}
  void main() {
    vec2 d = (vUv - 0.5) * 2.0 * uR;
    float r = length(d), a = atan(d.y, d.x), aa = fwidth(r) + 1e-3;
    float pulse = 0.6 + 0.4 * sin(uTime * uPulse);
    float ring = 1.0 - smoothstep(uWidth - aa, uWidth + aa, abs(r - uRing));
    float dash = smoothstep(0.35, 0.45, abs(fract(a * 1.909859 + uTime * uSpin) - 0.5)) * (1.0 - smoothstep(0.035 - aa, 0.035 + aa, abs(r - uRing * 0.8)));
    float n = fbm(vec3(d * 2.2, uTime * 1.5));
    float fill = (1.0 - smoothstep(uRing * 0.3, uRing, r)) * uFill * (0.55 + 0.6 * n);
    float shade = (1.0 - smoothstep(uRing * 0.4, uRing * 1.05, r)) * uShade;
    float wave = uWave < 0.0 ? 0.0 : (1.0 - smoothstep(0.0, 0.22, abs(r - uWave))) * uWaveK * (0.6 + 0.5 * n);
    float lit = clamp((ring * pulse + dash * 0.7 * pulse + fill) * uK + wave, 0.0, 1.4);
    vec3 col = mix(mix(uCol, uRedCol, uRed), uHot, clamp(fill * 0.8 + wave * 0.5, 0.0, 1.0));
    float alpha = clamp(max(lit, shade * (1.0 - lit)), 0.0, 1.0);
    gl_FragColor = vec4(col * min(lit, 1.0) / max(alpha, 1e-3) + col * max(lit - 1.0, 0.0), alpha);
    #include <colorspace_fragment>
  }`;
const markMaterial = R => new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uR: { value: R }, uRing: { value: 1 }, uWidth: { value: 0.06 }, uFill: { value: 0 }, uPulse: { value: 6 },
    uRed: { value: 0 }, uShade: { value: 0 }, uWave: { value: -1 }, uWaveK: { value: 0 }, uSpin: { value: 0.3 },
    uCol: { value: new THREE.Color('#ffa230') }, uHot: { value: new THREE.Color('#ffe9a0') }, uRedCol: { value: new THREE.Color('#ff2a10') } },
  vertexShader: MARK_VS, fragmentShader: MARK_FS, transparent: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
});
// (a flat one, where the ground is lava: square, uv 0..1)
const flatPatch = R => new THREE.PlaneGeometry(2 * R, 2 * R).rotateX(-Math.PI / 2);

// The ground, the lava where it stands higher (the flat plane, the surfaces over it)
function floorAt(fx, x, z, y = HIGH) {
  const g = groundAt(x, z, y, 0).h, c = Math.floor(z) * N + Math.floor(x);
  const lava = fx.lava && x >= 0 && z >= 0 && x < N && z < N ? fx.lava[c] : NaN;
  return Math.max(Number.isFinite(g) ? g : -1e4, fx.level ?? -Infinity, Number.isFinite(lava) ? lava : -Infinity);
}
// where (x, z) lies on lava: its surface there, else null
function lavaTop(fx, x, z) {
  const g = groundAt(x, z, HIGH, 0).h, top = floorAt(fx, x, z);
  return top > (Number.isFinite(g) ? g : -1e4) + 0.02 ? top : null;
}

// --- the view ----------------------------------------------------------------------------------------------
let view = null, devOn = false;
function make(world) {
  const root = new THREE.Group();
  root.name = 'woppylava-fx';
  scene.add(root);
  const colors = lavaColors();
  // the two lights: the crater's (or the mound's), and the brightest of the rest
  const lights = [new THREE.PointLight('#ff7a2a', 0, 9, 2), new THREE.PointLight('#ff8a3a', 0, 7, 2)];
  const holders = lights.map(() => { const o = new THREE.Object3D(); root.add(o); return o; });
  lights.forEach((l, i) => trackLight(l, holders[i], root));
  return { world, root, colors, lights, holders, walls: new Map(), hands: new Map(), marks: new Map(), splashes: [], sheet: null, mound: null, crater: null, time: 0, offers: [] };
}
const disposeObj = o => o.traverse(m => { if (m.isMesh) { if (!m.userData.sharedGeo) m.geometry.dispose(); [].concat(m.material).forEach(x => x.dispose()); } });

// fx: what Woppylava carries (game/woppylava.js), or null: nothing (all cleared); dt: s
export function drawWoppylavaFx(world, fx, dt) {
  if (devOn) return;   // (the developer command draws its own: devWoppylavaFx)
  drawFx(world, fx, dt);
}
function drawFx(world, fx, dt) {
  if (!fx || !world) { clearWoppylavaFx(); return; }
  if (view && view.world !== world) clearWoppylavaFx();
  view ??= make(world);
  const v = view, off = world.group?.position ?? { x: 0, y: 0, z: 0 };
  v.root.position.set(off.x, off.y, off.z);
  v.time += dt;
  v.offers.length = 0;
  drawWalls(v, fx, dt, off);
  drawHands(v, fx, dt, off);
  drawMarks(v, fx, dt, off);
  drawSplashes(v, dt);
  drawSheet(v, fx);
  drawMountain(v, fx, dt, off);
  // the second light: the brightest of what offered itself this frame
  const best = v.offers.reduce((b, o) => !b || o.i > b.i ? o : b, null), L = v.lights[1];
  L.intensity = best ? best.i : 0;
  if (best) { v.holders[1].position.set(best.x, best.y, best.z); L.color.set(best.color ?? '#ff8a3a'); L.distance = best.d ?? 7; }
}
const offer = (v, x, y, z, i, d = 7, color = null) => { if (i > 0.01) v.offers.push({ x, y, z, i, d, color }); };

// what is drawn now (tests/browser/woppylavafx.js): null, or what shows of each part
export function woppylavaFxNow() {
  if (!view) return null;
  const v = view, shown = m => !!m?.visible;
  return {
    walls: [...v.walls.values()].map(w => ({ wall: shown(w.mesh), seam: shown(w.seam), x: w.mesh.geometry.attributes.position.array.filter((_, i) => i % 3 === 0) })),
    hands: [...v.hands.values()].map(h => ({ hand: shown(h.mesh), ring: shown(h.ring), y: h.mesh.position.y, curl: h.mesh.material.uniforms.uCurl.value })),
    marks: [...v.marks.values()].map(m => ({ mark: shown(m.mesh), landed: m.landed })), splashes: v.splashes.length,
    lava: v.sheet ? v.sheet.count : 0, mound: !!v.mound, crater: !!v.crater, lights: v.lights.map(l => l.intensity),
  };
}
export function clearWoppylavaFx() {
  if (!view) return;
  const v = view;
  view = null;
  v.lights.forEach(untrackLight);
  scene.remove(v.root);
  disposeObj(v.root);
}

// --- the walls ---------------------------------------------------------------------------------------------
// A wall's cross section (along its way, the front at 0, its back thick behind; up, units): a long
// back rising to a crest leaning forward, curling over a little, its face falling to a foot that
// spreads out on the ground ahead. heat: how hot each point is (its crest the most).
const W = G.walls, TH = W.thick, HT = W.height;
const PROFILE = [[-TH, 0], [-TH + 0.06, 0.32], [-TH + 0.2, 0.78], [-0.66, 1.2], [-0.42, 1.52], [-0.18, 1.7], [0.04, 1.66], [0.17, 1.47], [0.16, 1.2],
  [0.07, 0.9], [0.04, 0.6], [0.1, 0.3], [0.24, 0.08], [0.34, 0]].map(([a, y]) => [a, y * HT / 1.7]);
// (its back crusted over, its crest and its face molten, its foot cooling)
const HEAT = PROFILE.map(([a, y]) => Math.min(1, Math.max(0, (a + 0.75) / 0.6)) * (0.55 + 0.45 * Math.min(1, y / (0.5 * HT))));
const ARC = PROFILE.reduce((s, p, j) => (s.push(j ? s[j - 1] + Math.hypot(p[0] - PROFILE[j - 1][0], p[1] - PROFILE[j - 1][1]) : 0), s), []);
const STEP = 0.2, ROUND = 0.7;   // columns along the wall; how far its ends round off at the gap
const MID = -TH / 2;
// the columns of a wall across the arena from lo to hi, its gap left out: [{ u (across), s (0 at an
// end by the gap .. 1 a ROUND in) }]
function wallColumns(lo, hi, gap) {
  const g0 = gap - W.gap / 2, g1 = gap + W.gap / 2, out = [];
  for (const [a, b, endA, endB] of [[lo + 0.02, g0, false, true], [g1, hi - 0.02, true, false]]) {
    if (b - a < 0.15) continue;
    const n = Math.max(2, Math.ceil((b - a) / STEP));
    for (let i = 0; i <= n; i++) {
      const u = a + (b - a) * i / n, d = Math.min(endA ? u - a : 1e9, endB ? b - u : 1e9), k = Math.min(1, d / ROUND);
      out.push({ u, s: Math.sqrt(Math.max(0, 1 - (1 - k) * (1 - k))), seg: a < g0 ? 0 : 1 });
    }
  }
  return out;
}
function wallView(v, w, box) {
  const across = w.side < 2 ? [box[1], box[3]] : [box[0], box[2]], cols = wallColumns(across[0], across[1], w.gap), P = PROFILE.length;
  const at = wallAt(w, 0, box), along = j => PROFILE[j][0];
  const pos = new Float32Array(cols.length * P * 3), flow = [], heat = [], idx = [];
  cols.forEach((c, i) => {
    for (let j = 0; j < P; j++) {
      flow.push(c.u, ARC[j]); heat.push(HEAT[j] * c.s);
      if (i && cols[i - 1].seg === c.seg && j) { const a = (i - 1) * P + j - 1, b = i * P + j - 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  geo.setAttribute('aHeat', new THREE.Float32BufferAttribute(heat, 1));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, moltenMaterial(v.colors, { rate: 0.9, seed: (w.n ?? 0) * 3.7 }));
  mesh.frustumCulled = false; mesh.renderOrder = 6;
  // the seam it warns with: a strip of glowing ground along its side of the arena, the gap left dark
  const spos = new Float32Array(cols.length * 2 * 3), suv = [], sidx = [];
  cols.forEach((c, i) => {
    suv.push(c.u, 0, c.u, 1);
    if (i && cols[i - 1].seg === c.seg) { const a = (i - 1) * 2, b = i * 2; sidx.push(a, b, a + 1, a + 1, b, b + 1); }
  });
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  sgeo.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2));
  sgeo.setIndex(sidx);
  const seam = new THREE.Mesh(sgeo, new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uCol: { value: v.colors.line }, uHot: { value: v.colors.foam } },
    vertexShader: MARK_VS, fragmentShader: SEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  seam.frustumCulled = false; seam.renderOrder = 7;
  v.root.add(mesh, seam);
  const inBox = ([x, z]) => [Math.max(box[0] + 0.05, Math.min(box[2] - 0.05, x)), Math.max(box[1] + 0.05, Math.min(box[3] - 0.05, z))];
  const wv = { clamp: inBox, mesh, seam, cols, side: w.side, gap: w.gap, box: box.join(), base: new Float32Array(cols.length * 2), seamSet: false, dir: at.dir, start: at.start };
  // its normals once, from its shape on flat ground (it only slides along and follows the ground)
  placeWall(wv, null, 0, 1);
  geo.computeVertexNormals();
  return wv;
}
// a seam: a strip of hot ground bubbling along the wall's start, brighter as the wall comes (uK)
const SEAM_FS = `uniform float uTime, uK; uniform vec3 uCol, uHot; varying vec2 vUv; ${NOISE}
  void main() {
    float n = fbm(vec3(vUv.x * 2.5, vUv.y * 2.0, uTime * 1.2)), m = fbm(vec3(vUv.x * 7.0, uTime * 2.5, vUv.y * 3.0));
    float edge = (1.0 - smoothstep(0.0, 0.85, vUv.y)) * smoothstep(0.0, 0.08, vUv.y + 0.02);
    float crack = smoothstep(0.55, 0.75, m) * (1.0 - smoothstep(0.1, 0.9, vUv.y));
    float k = uK * (edge * (0.55 + 0.6 * n) + crack * 0.8);
    gl_FragColor = vec4(mix(uCol, uHot, crack) * k, 1.0);
  }`;
// the wall's vertices at its front `front` (cells along its way), its height `hk` of its own;
// fx null: on flat ground (its normals)
function placeWall(wv, fx, front, hk, time = 0) {
  // (its crest rising and falling along it as it rolls)
  for (const c of wv.cols) c.wob = 1 + 0.08 * Math.sin(c.u * 1.9 + time * 3.1) + 0.05 * Math.sin(c.u * 4.7 - time * 4.3);
  const P = PROFILE.length, pos = wv.mesh.geometry.attributes.position, a = pos.array, dir = wv.dir, xs = wv.side < 2;
  const at = (s, u) => xs ? [wv.start + dir * s, u] : [u, wv.start + dir * s];
  wv.cols.forEach((c, i) => {
    let gb = 0, gf = 0;
    if (fx) {
      // (on the ground inside the arena: not up the banks round it)
      const [bx, bz] = wv.clamp(at(front - TH, c.u)), [fx2, fz2] = wv.clamp(at(front + 0.3, c.u));
      gb = floorAt(fx, bx, bz); gf = floorAt(fx, fx2, fz2);
      if (gb < -1e3) gb = gf; if (gf < -1e3) gf = gb;
      wv.base[i * 2] = gb; wv.base[i * 2 + 1] = gf;
    }
    for (let j = 0; j < P; j++) {
      const [pa, py] = PROFILE[j], k = (pa + TH) / (TH + 0.34), ground = gb + (gf - gb) * k;
      const s = MID + (pa - MID) * (0.35 + 0.65 * c.s), [x, z] = at(front + s, c.u), o = (i * P + j) * 3;
      a[o] = x; a[o + 1] = ground + py * c.s * hk * c.wob - 0.04; a[o + 2] = z;
    }
  });
  pos.needsUpdate = true;
}
function placeSeam(wv, fx) {
  const a = wv.seam.geometry.attributes.position.array, xs = wv.side < 2, dir = wv.dir;
  wv.cols.forEach((c, i) => {
    for (let r = 0; r < 2; r++) {
      const s = 0.02 + r * 1.5, x = xs ? wv.start + dir * s : c.u, z = xs ? c.u : wv.start + dir * s, o = (i * 2 + r) * 3;
      a[o] = x; a[o + 1] = floorAt(fx, x, z) + 0.03; a[o + 2] = z;
    }
  });
  wv.seam.geometry.attributes.position.needsUpdate = true;
}
function drawWalls(v, fx, dt, off) {
  const box = fx.box ?? [2, 2, N - 2, N - 2], seen = new Set(), time = v.time, hero = player;
  for (const w of fx.walls ?? []) {
    const key = w.n ?? `${w.side}:${w.gap}`;
    seen.add(key);
    let wv = v.walls.get(key);
    if (wv && (wv.side !== w.side || wv.gap !== w.gap || wv.box !== box.join())) { v.root.remove(wv.mesh, wv.seam); disposeObj(wv.mesh); disposeObj(wv.seam); wv = null; }
    if (!wv) v.walls.set(key, wv = wallView(v, w, box));
    const at = wallAt(w, w.t, box), xs = w.side < 2, dir = at.dir;
    const point = (s, u) => xs ? [at.start + dir * s, u] : [u, at.start + dir * s];
    if (!wv.seamSet) { placeSeam(wv, fx); wv.seamSet = true; }
    const warnK = Math.min(1, w.t / W.warn), rollT = w.t - W.warn;
    // the seam: glowing, then fading once the wall is out
    wv.seam.visible = rollT < 0.8;
    wv.seam.material.uniforms.uTime.value = time;
    wv.seam.material.uniforms.uK.value = rollT < 0 ? 0.6 + 1.2 * warnK * (0.8 + 0.2 * Math.sin(time * (6 + 10 * warnK))) : Math.max(0, 1 - rollT / 0.8) * 1.4;
    if (at.phase === 'done') { wv.mesh.visible = false; continue; }
    // the wall: its crest showing out of the ground while it warns, then up and rolling; sinking
    // into the far side once it is through
    const hk = rollT < 0 ? 0.08 + 0.3 * warnK * warnK : Math.min(1, 0.38 + rollT / 0.25 * 0.62);
    const sink = Math.max(0, Math.min(1, (at.len - at.front) / 0.6));
    const front = rollT < 0 ? -0.2 + 0.25 * warnK : at.front;
    wv.mesh.visible = true;
    placeWall(wv, fx, front, hk * (0.25 + 0.75 * sink), time);
    const u = wv.mesh.material.uniforms;
    u.uTime.value = time; u.uK.value = 1; u.uGlow.value = 1.05 + 0.08 * Math.sin(time * 9 + (Number(w.n) || 0));
    // what comes off it: bubbles popping along its seam while it warns, embers and spray blown off
    // its crest while it rolls, smoke
    const cols = wv.cols, pick = () => cols[(Math.random() * cols.length) | 0];
    if (rollT < 0) {
      for (let n = Math.floor(dt * (16 + 40 * warnK) + Math.random()); n > 0; n--) {
        const c = pick(), [x, z] = point(rand(0.05, 0.9), c.u + rand(-0.1, 0.1)), y = floorAt(fx, x, z);
        emit(glow, x + off.x, y + off.y + 0.05, z + off.z, { v: [rand(-0.2, 0.2), rand(0.6, 1.8), rand(-0.2, 0.2)], life: rand(0.3, 0.6), size: rand(0.05, 0.1), color: FIRE[n % 4], gravity: 3, drag: 1 });
      }
      if (Math.random() < dt * 6 * warnK) {
        const c = pick(), [x, z] = point(rand(0, 0.5), c.u), y = floorAt(fx, x, z);
        emit(soft, x + off.x, y + off.y + 0.2, z + off.z, { v: [rand(-0.1, 0.1), rand(0.4, 0.8), rand(-0.1, 0.1)], life: rand(1, 1.6), size: rand(0.25, 0.4), grow: 1.5, color: SMOKE[n3()], alpha: 0.35, drag: 0.6 });
      }
    } else if (sink > 0.05) {
      const way = xs ? [dir, 0] : [0, dir];
      for (let n = Math.floor(dt * 46 * sink + Math.random()); n > 0; n--) {
        const i = (Math.random() * cols.length) | 0, c = cols[i];
        if (c.s < 0.4) continue;
        const [x, z] = point(at.front - 0.1, c.u), y = wv.base[i * 2 + 1] + HT * c.s * rand(0.85, 1.02);
        emit(glow, x + off.x, y + off.y, z + off.z, { v: [way[0] * rand(0.6, 2.4) + rand(-0.3, 0.3), rand(1.2, 3.4), way[1] * rand(0.6, 2.4) + rand(-0.3, 0.3)],
          life: rand(0.35, 0.8), size: rand(0.05, 0.12), color: FIRE[n % 4], gravity: 6, drag: 0.8 });
      }
      for (let n = Math.floor(dt * 9 * sink + Math.random()); n > 0; n--) {
        const i = (Math.random() * cols.length) | 0, c = cols[i];
        if (c.s < 0.4) continue;
        const [x, z] = point(at.front - 0.5, c.u);
        emit(soft, x + off.x, wv.base[i * 2] + HT * c.s + off.y + 0.1, z + off.z, { v: [rand(-0.2, 0.2), rand(0.7, 1.4), rand(-0.2, 0.2)], life: rand(0.9, 1.5), size: rand(0.3, 0.5), grow: 1.6,
          color: SMOKE[n % 3], alpha: 0.4, drag: 0.8 });
      }
    }
    // its light: where it is nearest our hero
    const hu = hero ? (xs ? hero.z : hero.x) : (cols[0].u + cols[cols.length - 1].u) / 2;
    const [lx, lz] = point(Math.max(0, front) + 0.3, hu), ly = floorAt(fx, lx, lz) + 1.1;
    offer(v, lx, ly, lz, rollT < 0 ? 1.5 * warnK : 4.5 * sink, 7);
  }
  for (const [key, wv] of v.walls) if (!seen.has(key)) { v.root.remove(wv.mesh, wv.seam); disposeObj(wv.mesh); disposeObj(wv.seam); v.walls.delete(key); }
}
const n3 = () => (Math.random() * 3) | 0;

// --- the hands -------------------------------------------------------------------------------------------
// One hand's geometry (shared by all): palm down, its fingers along +z from their knuckles, the thumb
// out to +x, the arm rising from the wrist (-z) up into the dark, leaning back. Its frame: the ground
// under the middle of the hand at 0.
const H = G.hands;
let handGeo = null;
const FINGERS = [   // knuckle, yaw (out from +z), pitch (down), segment lengths, radii
  { k: [-0.46, 0.34, 0.3], yaw: -0.32, pitch: 0.28, l: [0.36, 0.3, 0.26], r: [0.15, 0.1] },
  { k: [-0.16, 0.36, 0.42], yaw: -0.1, pitch: 0.26, l: [0.42, 0.34, 0.28], r: [0.16, 0.11] },
  { k: [0.15, 0.36, 0.42], yaw: 0.08, pitch: 0.26, l: [0.4, 0.32, 0.27], r: [0.16, 0.11] },
  { k: [0.44, 0.34, 0.3], yaw: 0.28, pitch: 0.3, l: [0.32, 0.26, 0.22], r: [0.14, 0.1] },
  { k: [0.62, 0.32, -0.22], yaw: 1.05, pitch: 0.38, l: [0.34, 0.28, 0.0001], r: [0.18, 0.12] },   // (the thumb: two joints)
];
function buildHand() {
  const pos = [], nor = [], flow = [], heat = [], fin = [], knk = [], idx = [];
  const add = (p, n, f, h, fi = [0, 0, 0, 0], k = [0, 0, 0]) => { pos.push(...p); nor.push(...n); flow.push(...f); heat.push(h); fin.push(...fi); knk.push(...k); return pos.length / 3 - 1; };
  const S = 12;
  // a tube along a path of rings ({ c: centre, t: (x, y, z) frame across: a, b, r: radius, v: flow }), closed at its ends
  const tube = (rings, h, fi, k) => {
    const start = pos.length / 3;
    rings.forEach(R => {
      for (let s = 0; s <= S; s++) {
        const th = s / S * Math.PI * 2, ca = Math.cos(th), sa = Math.sin(th);
        const n = [R.a[0] * ca + R.b[0] * sa, R.a[1] * ca + R.b[1] * sa, R.a[2] * ca + R.b[2] * sa];
        add([R.c[0] + n[0] * R.r, R.c[1] + n[1] * R.r, R.c[2] + n[2] * R.r], n, [th * R.r * 1.2, R.v], R.h ?? h, fi, k);
      }
    });
    for (let i = 0; i + 1 < rings.length; i++) for (let s = 0; s < S; s++) {
      const a = start + i * (S + 1) + s, b = a + S + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  };
  // the fingers: rings along +z, rounded at the tip
  for (const f of FINGERS) {
    const L = f.l[0] + f.l[1] + f.l[2], rings = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const t = i / n, z = -0.08 + (L + 0.08) * t, tip = t > 0.8 ? Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2)) : 1;
      // (knobbly at the joints)
      const knob = 1 + 0.08 * Math.exp(-(((z - f.l[0]) / 0.05) ** 2)) + 0.06 * Math.exp(-(((z - f.l[0] - f.l[1]) / 0.05) ** 2));
      rings.push({ c: [0, 0, z], a: [1, 0, 0], b: [0, 1, 0], r: Math.max(0.004, (f.r[0] + (f.r[1] - f.r[0]) * t) * tip * knob), v: z, h: 0.25 + 0.75 * t * t });
    }
    tube(rings, 0.3, [f.yaw, f.pitch, f.l[0], f.l[0] + f.l[1]], f.k);
  }
  // the palm: a flattened lump (its rings across z)
  {
    const rings = [], n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n, z = -0.72 + 1.3 * t, w = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)) * (1 - 0.15 * t);
      rings.push({ c: [0, 0.36 + 0.04 * Math.sin(t * Math.PI), z], a: [1, 0, 0], b: [0, 0.45, 0], r: Math.max(0.004, 0.66 * w), v: z, h: 0.2 });
    }
    // (an ellipse: its frame's b is short; normals from the frame are near enough)
    tube(rings, 0.2);
  }
  // the arm: from the wrist up and back into the dark, thickening
  {
    const curve = new THREE.CatmullRomCurve3([[0, 0.42, -0.55], [0, 1.4, -0.95], [0, 5, -2.1], [0, 12, -3.6], [0, 24, -5]].map(p => new THREE.Vector3(...p)));
    const n = 26, rings = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, c = curve.getPointAt(t), tan = curve.getTangentAt(t), a = new THREE.Vector3(1, 0, 0), b = new THREE.Vector3().crossVectors(tan, a).normalize();
      rings.push({ c: c.toArray(), a: a.toArray(), b: b.toArray(), r: 0.34 + 0.3 * Math.pow(t, 0.7) + 0.04 * Math.sin(t * 40), v: t * curve.getLength(), h: 0.1 * (1 - t) });
    }
    tube(rings, 0.1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  g.setAttribute('aHeat', new THREE.Float32BufferAttribute(heat, 1));
  g.setAttribute('aFin', new THREE.Float32BufferAttribute(fin, 4));
  g.setAttribute('aKnuck', new THREE.Float32BufferAttribute(knk, 3));
  g.setIndex(idx);
  // (z: the hand's middle over the ring's)
  g.translate(0, 0, -0.25);
  return g;
}
const RING_R = 1.75;   // the ring's patch: room for its shockwave
function handView(v, h) {
  handGeo ??= buildHand();
  const mesh = new THREE.Mesh(handGeo, moltenMaterial(v.colors, { hand: true, rate: 0.7, seed: (h.n ?? 0) * 1.9 }));
  mesh.userData.sharedGeo = true; mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false;
  mesh.material.transparent = false;
  const ring = new THREE.Mesh(flatPatch(RING_R), markMaterial(RING_R));
  ring.frustumCulled = false; ring.renderOrder = 7;
  v.root.add(mesh, ring);
  return { mesh, ring, patched: false, landed: false, yaw: 0, y: 0 };
}
const ease = u => u * u * (3 - 2 * u);
function drawHands(v, fx, dt, off) {
  const seen = new Set(), time = v.time, lands = handLands();
  for (const h of fx.hands ?? []) {
    const key = h.n ?? `${h.x},${h.z}`;
    seen.add(key);
    let hv = v.hands.get(key);
    if (!hv) v.hands.set(key, hv = handView(v, h));
    const phase = handPhase(h.t), U = hv.ring.material.uniforms;
    if (phase === 'done') { hv.mesh.visible = hv.ring.visible = false; continue; }
    // the ring: flat under it while it follows; once it holds still, on the ground round it
    const top = lavaTop(fx, h.x, h.z);
    if (phase === 'track') { hv.y = floorAt(fx, h.x, h.z); hv.ring.position.set(h.x, hv.y + 0.04, h.z); }
    else if (!hv.patched) {
      hv.patched = true;
      hv.y = floorAt(fx, h.x, h.z);
      if (top === null) { hv.ring.geometry.dispose(); hv.ring.geometry = groundPatch(h.x, hv.y, h.z, RING_R); }
      hv.ring.position.set(h.x, hv.y + (top === null ? 0.015 : 0.04), h.z);
      // (its fingers pointing away from the volcano, its arm coming from there)
      const vo = fx.volcano, sd = Number(h.n) || 0, dx = vo ? h.x - vo.x : Math.cos(sd * 2.3), dz = vo ? h.z - vo.z : Math.sin(sd * 2.3);
      hv.yaw = Math.atan2(dx, dz);
    }
    const lock = H.track, fall = lock + H.lock, hold = lands + H.hold;
    const locking = h.t >= lock, k = Math.min(1, h.t / lands);
    U.uTime.value = time;
    U.uRing.value = H.r; U.uWidth.value = phase === 'track' ? 0.05 : 0.07;
    U.uPulse.value = phase === 'track' ? 7 : 22;
    U.uSpin.value = phase === 'track' ? 0.25 : 0.9;
    U.uRed.value = locking ? Math.min(1, (h.t - lock) / 0.25) : 0;
    U.uFill.value = locking ? 0.25 + 0.6 * Math.min(1, (h.t - lock) / (lands - lock)) : 0.1;
    U.uShade.value = h.t >= fall ? 0.6 : locking ? 0.25 * (h.t - lock) / H.lock : 0;
    U.uK.value = h.t < lands ? 0.55 + 0.45 * k : Math.max(0, 1 - (h.t - lands) / 0.35);
    const since = h.t - lands;
    U.uWave.value = since >= 0 && since < 0.55 ? H.r * (0.6 + 1.6 * since / 0.55) : -1;
    U.uWaveK.value = since >= 0 ? Math.max(0, 1 - since / 0.55) * 1.2 : 0;
    hv.ring.visible = U.uK.value > 0.01 || U.uWave.value > 0;
    // the hand: out of the dark far over it as the ring holds still, down onto it, clutching, back up
    let lift = null, curl = 0.2, spread = 0;
    if (phase === 'lock') { const u = (h.t - lock) / H.lock; lift = 30 - 22 * ease(u); curl = 0.35; spread = 0.3 * u; }
    else if (phase === 'fall') { const u = (h.t - fall) / H.fall; lift = 8 * (1 - u) * (1 - u); curl = 0.35 - 0.35 * u; spread = 0.3 + 0.7 * u; }
    else if (phase === 'hold') { const u = (h.t - lands) / H.hold; lift = 0.06 * Math.sin(Math.min(1, u * 3) * Math.PI); curl = ease(Math.min(1, u / 0.55)); spread = 1 - curl * 0.8; }
    else if (phase === 'rise') { const u = (h.t - hold) / H.rise; lift = 0.1 + 18 * u * u; curl = 1; spread = 0.2; }
    hv.mesh.visible = lift !== null;
    if (hv.mesh.visible) {
      const y = hv.y + lift;
      hv.mesh.position.set(h.x, y, h.z);
      hv.mesh.rotation.y = hv.yaw;
      const squash = phase === 'hold' ? 1 - 0.14 * Math.max(0, 1 - (h.t - lands) / 0.18) : 1;
      hv.mesh.scale.set(1.12 * (2 - squash), 1.12 * squash, 1.12 * (2 - squash));
      const M = hv.mesh.material.uniforms;
      M.uTime.value = time; M.uCurl.value = curl; M.uSpread.value = spread; M.uBase.value = y; M.uDark.value = 15;
      M.uGlow.value = 1 + (phase === 'hold' ? 0.35 * Math.max(0, 1 - (h.t - lands) / 0.4) : 0);
      // lava dripping off it, the more as it rises out of the floor
      for (let n = Math.floor(dt * (phase === 'rise' ? 30 : 14) + Math.random()); n > 0; n--) {
        const a = rand(0, Math.PI * 2), d = rand(0.1, 0.9);
        emit(glow, h.x + off.x + Math.cos(a) * d, y + off.y + rand(0.1, 0.5), h.z + off.z + Math.sin(a) * d,
          { v: [0, -rand(0.2, 1), 0], life: rand(0.3, 0.6), size: rand(0.05, 0.1), color: DROP[n % 3], gravity: 9, drag: 0.5 });
      }
      offer(v, h.x, y + 1.2, h.z, phase === 'hold' ? 3 + 7 * Math.max(0, 1 - (h.t - lands) / 0.5) : 2, 7);
    } else if (locking) offer(v, h.x, hv.y + 0.6, h.z, 1.2, 4, '#ff5a2a');
    // the slam: a splash of lava and embers, a puff of smoke round it
    if (since >= 0 && !hv.landed) {
      hv.landed = true;
      for (let n = 0; n < 42; n++) {
        const a = rand(0, Math.PI * 2), sp = rand(1.5, 4.5);
        emit(glow, h.x + off.x + Math.cos(a) * 0.9, hv.y + off.y + 0.15, h.z + off.z + Math.sin(a) * 0.9,
          { v: [Math.cos(a) * sp, rand(1.5, 4.5), Math.sin(a) * sp], life: rand(0.4, 0.9), size: rand(0.06, 0.14), color: FIRE[n % 4], gravity: 9, drag: 0.6 });
      }
      for (let n = 0; n < 14; n++) {
        const a = rand(0, Math.PI * 2), sp = rand(1, 2.2);
        emit(soft, h.x + off.x + Math.cos(a) * 1.1, hv.y + off.y + 0.2, h.z + off.z + Math.sin(a) * 1.1,
          { v: [Math.cos(a) * sp, rand(0.3, 0.9), Math.sin(a) * sp], life: rand(0.8, 1.4), size: rand(0.35, 0.6), grow: 1.8, color: SMOKE[n % 3], alpha: 0.45, drag: 1.6 });
      }
    }
  }
  for (const [key, hv] of v.hands) if (!seen.has(key)) { v.root.remove(hv.mesh, hv.ring); disposeObj(hv.mesh); disposeObj(hv.ring); v.hands.delete(key); }
}

// --- the bombs' landing spots ----------------------------------------------------------------------------------
const E = G.erupt, MARK_R = E.r * 1.5;
function markView(v, b, fx) {
  const top = lavaTop(fx, b.x, b.z), y = top ?? b.y ?? floorAt(fx, b.x, b.z);
  const mesh = new THREE.Mesh(top === null ? groundPatch(b.x, y, b.z, MARK_R) : flatPatch(MARK_R), markMaterial(MARK_R));
  mesh.position.set(b.x, y + (top === null ? 0.015 : 0.04), b.z);
  mesh.frustumCulled = false; mesh.renderOrder = 7;
  v.root.add(mesh);
  return { mesh, x: b.x, y, z: b.z, t: b.t, flight: b.flight, landed: false };
}
function drawMarks(v, fx, dt, off) {
  const seen = new Set(), time = v.time;
  for (const b of fx.marks ?? []) {
    const key = b.n ?? `${b.x},${b.z}`;
    seen.add(key);
    let mv = v.marks.get(key);
    if (!mv) v.marks.set(key, mv = markView(v, b, fx));
    mv.t = b.t; mv.flight = b.flight;
    const k = Math.max(0, Math.min(1, b.t / b.flight)), U = mv.mesh.material.uniforms;
    if (b.t >= b.flight && !mv.landed) land(v, mv, off);
    mv.mesh.visible = !mv.landed;
    U.uTime.value = time; U.uRing.value = E.r; U.uWidth.value = 0.045 + 0.03 * k;
    U.uK.value = 0.35 + 0.75 * k; U.uFill.value = 0.1 + 0.6 * k * k; U.uPulse.value = 5 + 25 * k; U.uRed.value = k * k * 0.6; U.uShade.value = 0.15 + 0.35 * k;
    U.uSpin.value = 0.4 + k;
    if (k > 0.7) offer(v, b.x, mv.y + 0.5, b.z, 1.4 * (k - 0.7) / 0.3, 3.5);
  }
  // (a mark gone from the list between two frames has landed)
  for (const [key, mv] of v.marks) if (!seen.has(key)) {
    if (!mv.landed && mv.t >= mv.flight - 0.25) land(v, mv, off);
    v.root.remove(mv.mesh); disposeObj(mv.mesh); v.marks.delete(key);
  }
}
// a bomb landing: a splash of lava and embers, a ring of fire running out over the floor, a flash
function land(v, mv, off) {
  mv.landed = true;
  const x = mv.x + off.x, y = mv.y + off.y, z = mv.z + off.z;
  for (let n = 0; n < 26; n++) {
    const a = rand(0, Math.PI * 2), sp = rand(1, 3.5);
    emit(glow, x + Math.cos(a) * 0.2, y + 0.15, z + Math.sin(a) * 0.2, { v: [Math.cos(a) * sp, rand(2, 5), Math.sin(a) * sp], life: rand(0.4, 0.9), size: rand(0.06, 0.13),
      color: FIRE[n % 4], gravity: 10, drag: 0.4 });
  }
  for (let n = 0; n < 6; n++) emit(soft, x + rand(-0.3, 0.3), y + 0.3, z + rand(-0.3, 0.3), { v: [rand(-0.4, 0.4), rand(0.6, 1.2), rand(-0.4, 0.4)], life: rand(0.9, 1.5),
    size: rand(0.35, 0.55), grow: 1.8, color: SMOKE[n % 3], alpha: 0.45, drag: 1 });
  const mesh = new THREE.Mesh(mv.mesh.geometry.clone(), markMaterial(MARK_R));
  mesh.position.copy(mv.mesh.position); mesh.frustumCulled = false; mesh.renderOrder = 7;
  v.root.add(mesh);
  v.splashes.push({ mesh, t: 0, x: mv.x, y: mv.y, z: mv.z });
}
function drawSplashes(v, dt) {
  v.splashes = v.splashes.filter(s => {
    s.t += dt;
    const u = s.t / 0.6, U = s.mesh.material.uniforms;
    if (u >= 1) { v.root.remove(s.mesh); disposeObj(s.mesh); return false; }
    // a ring of fire running out, the splash glowing where it fell, a scorch under it
    U.uTime.value = v.time; U.uWave.value = E.r * (0.3 + 1.1 * Math.sqrt(u)); U.uWaveK.value = 1.3 * (1 - u); U.uShade.value = 0.5 * (1 - u);
    U.uK.value = 1 - u; U.uRing.value = E.r * 0.45; U.uFill.value = 1.2 * (1 - u); U.uWidth.value = 0.01;
    offer(v, s.x, s.y + 0.6, s.z, 6 * (1 - u), 5);
    return true;
  });
}

// --- the lava over the flat plane ------------------------------------------------------------------------------
// Every cell whose lava stands over the basin's flat lava: SUB x SUB quads on the ground under it
// (its corners each on the ground there, groundAt), raised by how deep the lava stands over the
// cell's highest corner, in the cube's own lava look (materials.js cellMaterial, as the cube's
// fluids: its cells, its palette's colours, its slow swell), cut away like them (section.js
// cutMaterial). Where the next cell's lava stands lower (or there is none), the lava pours over the
// edge: a skirt down from it, molten rock streaming down (the walls' look).
const SUB = 2, CELL_V = (SUB + 1) * (SUB + 1), SKIRT_V = 4 * (SUB + 1) * 2;
const EDGES = [[0, -1, [0, 0], [1, 0]], [1, 0, [1, 0], [1, 1]], [0, 1, [1, 1], [0, 1]], [-1, 0, [0, 1], [0, 0]]];
function sheetView(v) {
  const n = N * N * CELL_V, m = N * N * SKIRT_V;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), shore = new Float32Array(n * 4), idx = [];
  const spos = new Float32Array(m * 3), snor = new Float32Array(m * 3), sflow = new Float32Array(m * 2), sheat = new Float32Array(m), sidx = [];
  for (let c = 0; c < N * N; c++) {
    const o = c * CELL_V, so = c * SKIRT_V;
    for (let j = 0; j < SUB; j++) for (let i = 0; i < SUB; i++) {
      const a = o + j * (SUB + 1) + i, b = a + 1, d = a + SUB + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    for (let e = 0; e < 4; e++) for (let i = 0; i < SUB; i++) {
      const a = so + (e * (SUB + 1) + i) * 2, b = a + 2;
      sidx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  for (let i = 0; i < n; i++) { shore[i * 4] = -1e4; nor[i * 3 + 1] = 1; }
  for (let i = 0; i < m; i++) sheat[i] = i % 2 ? 0 : 1;   // (its lip, its foot: the streams, render/woppylavafx.js MOLTEN_FS)
  const row = v.colors.row, pal = new Uint16Array(n * 4);
  for (let i = 0; i < n; i++) { pal[i * 4] = row; pal[i * 4 + 1] = row; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('shore', new THREE.BufferAttribute(shore, 4));
  geo.setAttribute('pal', new THREE.BufferAttribute(pal, 4));
  geo.setIndex(idx);
  const mat = cellMaterial(cutMaterial(fluidMaterial(LAVA, 'full')), LAVA);
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.visible = false;
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3).setUsage(THREE.DynamicDrawUsage));
  sgeo.setAttribute('normal', new THREE.BufferAttribute(snor, 3).setUsage(THREE.DynamicDrawUsage));
  sgeo.setAttribute('aFlow', new THREE.BufferAttribute(sflow, 2).setUsage(THREE.DynamicDrawUsage));
  sgeo.setAttribute('aHeat', new THREE.BufferAttribute(sheat, 1));
  sgeo.setIndex(sidx);
  const falls = new THREE.Mesh(sgeo, moltenMaterial(v.colors, { rate: 1.1, seed: 3.3 }));
  falls.material.transparent = false; falls.material.uniforms.uBulge.value = 0.03; falls.material.uniforms.uStreams.value = 1;
  falls.frustumCulled = false; falls.renderOrder = 5; falls.visible = false;
  v.root.add(mesh, falls);
  return { mesh, falls, shown: new Float32Array(N * N).fill(NaN), level: -Infinity, map: null, count: 0 };
}
const sheetOf = (lava, level, c) => { const y = lava?.[c]; return Number.isFinite(y) && !(y <= level + 0.01) ? y : NaN; };
function drawSheet(v, fx) {
  const lava = fx.lava ?? null, level = Number.isFinite(fx.level) ? fx.level : -Infinity;
  if (!lava && !v.sheet) return;
  v.sheet ??= sheetView(v);
  const s = v.sheet, map = state.map, fresh = s.map !== map || s.level !== level;
  s.mesh.material.emissiveIntensity = fluidGlow(LAVA, WIND.value);
  s.falls.material.uniforms.uTime.value = v.time;
  const dirty = new Set();
  for (let c = 0; c < N * N; c++) {
    const y = sheetOf(lava, level, c), was = s.shown[c];
    if (fresh || !(y === was || Number.isNaN(y) && Number.isNaN(was))) { dirty.add(c); s.shown[c] = y; }
  }
  if (!dirty.size) return;
  // (a changed cell's neighbours' skirts change too)
  for (const c of [...dirty]) for (const d of [-1, 1, -N, N]) { const k = c + d; if (k >= 0 && k < N * N) dirty.add(k); }
  s.map = map; s.level = level;
  const g = s.mesh.geometry, P = g.attributes.position.array, UV = g.attributes.uv.array;
  const sg = s.falls.geometry, SP = sg.attributes.position.array, SN = sg.attributes.normal.array, SF = sg.attributes.aFlow.array;
  const cache = new Map();
  // a cell's sheet heights at its vertices (null: no lava over it)
  const heights = c => {
    if (cache.has(c)) return cache.get(c);
    const y = s.shown[c];
    if (!Number.isFinite(y)) { cache.set(c, null); return null; }
    const cx = c % N, cz = (c / N) | 0, hs = [];
    let hi = -Infinity, lo = Infinity;
    for (let j = 0; j <= SUB; j++) for (let i = 0; i <= SUB; i++) {
      const px = cx + Math.min(0.999, Math.max(0.001, i / SUB)), pz = cz + Math.min(0.999, Math.max(0.001, j / SUB));
      const gr = groundAt(px, pz, y, 0).h, h = Number.isFinite(gr) ? gr : y - 0.3;
      hs.push(h); hi = Math.max(hi, h); lo = Math.min(lo, h);
    }
    // (a pool on level ground, the crater's: flat at its surface, the cells round it meeting it; on
    // a slope, as deep everywhere, running down it)
    const depth = Math.max(0.05, y - hi), out = hs.map(h => restY(hi - lo < 0.2 ? y : Math.min(y, h + depth)));
    cache.set(c, out);
    return out;
  };
  const gone = (A, o, k) => { for (let i = 0; i < k; i++) { A[(o + i) * 3 + 1] = -1e4; } };
  for (const c of dirty) {
    const o = c * CELL_V, so = c * SKIRT_V, cx = c % N, cz = (c / N) | 0, hs = heights(c);
    if (!hs) { gone(P, o, CELL_V); gone(SP, so, SKIRT_V); continue; }
    for (let j = 0; j <= SUB; j++) for (let i = 0; i <= SUB; i++) {
      const k = o + j * (SUB + 1) + i, y = hs[j * (SUB + 1) + i];
      P[k * 3] = cx + i / SUB; P[k * 3 + 1] = y; P[k * 3 + 2] = cz + j / SUB;
      UV[k * 2] = 0; UV[k * 2 + 1] = y;
    }
    // over each edge where the next cell's lava stands lower (or none): down to it, or into the ground
    EDGES.forEach(([dx, dz, A, B], e) => {
      const nx = cx + dx, nz = cz + dz, inside = nx >= 0 && nz >= 0 && nx < N && nz < N, nh = inside ? heights(nz * N + nx) : null;
      for (let i = 0; i <= SUB; i++) {
        const t = i / SUB, gx = A[0] + (B[0] - A[0]) * t, gz = A[1] + (B[1] - A[1]) * t;
        const top = hs[Math.round(gz * SUB) * (SUB + 1) + Math.round(gx * SUB)];
        // (the neighbour's vertex on this edge: its own corner across it)
        const ngx = dx ? 1 - gx : gx, ngz = dz ? 1 - gz : gz;
        // (down to the next cell's lava, else to its ground: not on into the rock beside it)
        const px = cx + gx + dx * 0.02, pz = cz + gz + dz * 0.02, beside = inside ? groundAt(Math.min(N - 0.001, Math.max(0, px)), Math.min(N - 0.001, Math.max(0, pz)), top, 0).h : -Infinity;
        const other = Math.max(nh ? nh[Math.round(ngz * SUB) * (SUB + 1) + Math.round(ngx * SUB)] : -Infinity, Number.isFinite(beside) ? beside : -Infinity, fx.level ?? -Infinity);
        const bottom = other < top - 0.08 ? Math.max(other - 0.05, top - 3) : top;
        const k = so + (e * (SUB + 1) + i) * 2, along = (dx ? cz + gz : cx + gx);
        for (const [kk, y] of [[k, top], [k + 1, bottom]]) {
          SP[kk * 3] = cx + gx + dx * 0.01; SP[kk * 3 + 1] = y; SP[kk * 3 + 2] = cz + gz + dz * 0.01;
          SN[kk * 3] = dx; SN[kk * 3 + 1] = 0; SN[kk * 3 + 2] = dz;
          SF[kk * 2] = along; SF[kk * 2 + 1] = -y;
        }
      }
    });
  }
  g.attributes.position.needsUpdate = g.attributes.uv.needsUpdate = true;
  sg.attributes.position.needsUpdate = sg.attributes.normal.needsUpdate = sg.attributes.aFlow.needsUpdate = true;
  s.count = s.shown.reduce((n, y) => n + (Number.isFinite(y) ? 1 : 0), 0);
  s.mesh.visible = s.falls.visible = s.count > 0;
}

// --- the mound asleep, the volcano's crater ------------------------------------------------------------------
// Its cracks: a patch over the mound (on whatever ground is highest there), lit along the edges of
// cells of a cellular noise, the more and the wider out the more it stirs (uK), pulsing
const CRACK_FS = `uniform float uTime, uK, uR; uniform vec3 uCol, uHot; varying vec2 vUv; ${NOISE} ${CELLS_GLSL}
  void main() {
    vec2 d = (vUv - 0.5) * 2.0 * uR; float r = length(d) / uR;
    float c = cracks(d * 1.25 + vec2(fbm(vec3(d, 1.0)), fbm(vec3(d, 4.0))) * 0.6), aa = fwidth(c) + 1e-3;
    float w = 0.025 + 0.06 * uK;
    // (not every crack glows: those in patches that come and go, more the more it stirs)
    float on = smoothstep(0.62 - 0.25 * uK, 0.72 - 0.2 * uK, fbm(vec3(d * 0.9, uTime * 0.15 + 3.0)));
    float line = (1.0 - smoothstep(w - aa, w + aa, c)) * on;
    float n = fbm(vec3(d * 0.8, uTime * 0.6));
    float reach = 1.0 - smoothstep(0.25 + 0.6 * uK, 0.35 + 0.65 * uK, r + (n - 0.5) * 0.3);
    float pulse = 0.75 + 0.25 * sin(uTime * (1.5 + 3.0 * uK) + n * 6.0);
    float k = line * reach * pulse * (0.35 + 0.9 * uK) + (1.0 - smoothstep(0.0, 0.5, r)) * 0.12 * uK * pulse;
    gl_FragColor = vec4(mix(uCol, uHot, line * n) * k, 1.0);
  }`;
function domePatch(fx, x, z, r) {
  const n = Math.ceil(r * 2 * 6), pos = [], uv = [], idx = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const px = x - r + 2 * r * i / n, pz = z - r + 2 * r * j / n, g = groundAt(px, pz, HIGH, 0).h;
    pos.push(px, Number.isFinite(g) ? g + 0.03 : -1e4, pz); uv.push(i / n, j / n);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    if ([a, b, c, d].some(k => pos[k * 3 + 1] < -1e3)) continue;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// A plume: an open cone of smoke widening upwards (its base at 0, 1 high: scaled), billowing up,
// lit from below by the glow it comes out of (uGlow), faint at its outline and at its top
const PLUME_VS = `uniform float uTime; varying vec2 vUv; varying vec3 vN, vW; ${NOISE}
  void main() {
    vUv = uv; vec3 p = position;
    float a = atan(p.z, p.x);
    p.xz *= 1.0 + (fbm(vec3(cos(a) * 1.5, p.y * 2.5 - uTime * 0.6, sin(a) * 1.5)) - 0.5) * 0.7;
    // (drifting, the more the higher)
    p.x += (sin(p.y * 2.3 - uTime * 0.7) * 0.12 + 0.25) * p.y * p.y; p.z += cos(p.y * 1.9 - uTime * 0.5) * 0.1 * p.y;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const PLUME_FS = `uniform float uTime, uK, uGlow, uSeed; uniform vec3 uSmoke, uFire; varying vec2 vUv; varying vec3 vN, vW; ${NOISE}
  void main() {
    float face = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
    float n = fbm(vec3(vUv.x * 6.0, vUv.y * 2.2 - uTime * 0.35, uSeed)), m = fbm(vec3(vUv.x * 13.0 + 3.0, vUv.y * 5.0 - uTime * 0.7, uSeed + 2.0));
    // billows of it, torn apart higher up
    float body = smoothstep(0.4 + 0.15 * vUv.y, 0.72, n * 0.7 + m * 0.4);
    float a = body * smoothstep(0.1, 0.6, face) * smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.3, 1.0, vUv.y)) * uK;
    // dark smoke, lit from below by the glow it rises out of
    vec3 col = uSmoke * (0.5 + 0.7 * m) + uFire * uGlow * pow(1.0 - vUv.y, 4.0) * (0.4 + 0.6 * n);
    gl_FragColor = vec4(col, clamp(a * 0.8, 0.0, 0.75));
    #include <colorspace_fragment>
  }`;
const plumeGeo = () => new THREE.CylinderGeometry(1, 0.3, 1, 18, 10, true).translate(0, 0.5, 0);
function plume(v, seed) {
  const m = new THREE.Mesh(plumeGeo(), new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uGlow: { value: 0 }, uSeed: { value: seed },
    uSmoke: { value: new THREE.Color('#3b3430') }, uFire: { value: v.colors.body } }, vertexShader: PLUME_VS, fragmentShader: PLUME_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.frustumCulled = false; m.renderOrder = 8;
  v.root.add(m);
  return m;
}
// the glow standing over a crater: an additive cone of light (uK)
const BEAM_FS = `uniform float uTime, uK; uniform vec3 uCol; varying vec2 vUv; varying vec3 vN, vW; ${NOISE}
  void main() {
    float face = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
    float n = fbm(vec3(vUv.x * 6.0, vUv.y * 4.0 - uTime * 2.0, 0.0));
    float a = pow(face, 1.5) * pow(1.0 - vUv.y, 2.0) * (0.5 + 0.7 * n) * uK;
    gl_FragColor = vec4(uCol * a, 1.0);
  }`;
function moundView(v, fx) {
  const vo = fx.volcano, top = floorAt(fx, vo.x, vo.z), R = 3;
  const cracks = new THREE.Mesh(domePatch(fx, vo.x, vo.z, R), new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uR: { value: R },
    uCol: { value: v.colors.body }, uHot: { value: v.colors.foam } }, vertexShader: MARK_VS, fragmentShader: CRACK_FS, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  cracks.frustumCulled = false; cracks.renderOrder = 7;
  v.root.add(cracks);
  const plumes = [0, 1, 2].map(i => plume(v, i * 5.3));
  const spots = [0, 1, 2].map(i => { const a = i * 2.1 + 0.4, d = i ? 0.9 : 0.15, x = vo.x + Math.cos(a) * d, z = vo.z + Math.sin(a) * d; return { x, z, y: floorAt(fx, x, z) }; });
  return { cracks, plumes, spots, x: vo.x, z: vo.z, top };
}
function craterView(v) {
  const plumes = [plume(v, 1.7), plume(v, 8.1)];
  const beam = new THREE.Mesh(plumeGeo(), new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uCol: { value: v.colors.line } },
    vertexShader: PLUME_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.frustumCulled = false; beam.renderOrder = 8;
  v.root.add(beam);
  return { plumes, beam };
}
// the crater's top: the highest lava (or ground) within a couple of cells of the volcano's middle
function craterTop(fx) {
  const vo = fx.volcano;
  let best = null;
  if (fx.lava) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const x = Math.floor(vo.x) + dx, z = Math.floor(vo.z) + dz;
    if (x < 0 || z < 0 || x >= N || z >= N) continue;
    const y = fx.lava[z * N + x];
    if (Number.isFinite(y) && y > (fx.level ?? -Infinity) + 0.3 && (!best || y > best.y)) best = { x: x + 0.5, y, z: z + 0.5 };
  }
  if (best) return best;
  const g = groundAt(vo.x, vo.z, HIGH, 0).h;
  return { x: vo.x, y: Number.isFinite(g) ? g : 0, z: vo.z };
}
function drawMountain(v, fx, dt, off) {
  const vo = fx.volcano, time = v.time, L = v.lights[0];
  const drop = which => { if (v[which]) { for (const m of [v[which].cracks, ...v[which].plumes, v[which].beam].filter(Boolean)) { v.root.remove(m); disposeObj(m); } v[which] = null; } };
  if (!vo) { drop('mound'); drop('crater'); L.intensity = 0; return; }
  const stage = fx.stage ?? 1, burst = Number.isFinite(fx.burst) ? fx.burst : -1;
  if (stage < 2) {
    drop('crater');
    if (v.mound && (v.mound.x !== vo.x || v.mound.z !== vo.z)) drop('mound');
    v.mound ??= moundView(v, fx);
    const m = v.mound, k = Math.max(0, Math.min(1, fx.stir ?? 0));
    const C = m.cracks.material.uniforms;
    C.uTime.value = time; C.uK.value = 0.3 + 0.7 * k;
    m.plumes.forEach((p, i) => {
      const s = m.spots[i], on = i === 0 ? 1 : Math.max(0, Math.min(1, k * 2.2 - (i - 1) * 0.6));
      p.visible = on > 0.01;
      p.position.set(s.x, s.y - 0.1, s.z);
      const h = (2.2 + 3.5 * k) * (i ? 0.75 : 1);
      p.scale.set(0.55 + 0.8 * k, h, 0.55 + 0.8 * k);
      const U = p.material.uniforms;
      U.uTime.value = time; U.uK.value = (0.5 + 0.45 * k) * on; U.uGlow.value = 0.35 + 0.6 * k;
    });
    // steam and embers out of its cracks
    for (let n = Math.floor(dt * (2 + 14 * k) + Math.random()); n > 0; n--) {
      const a = rand(0, Math.PI * 2), d = rand(0, 0.6 + 1.6 * k), x = vo.x + Math.cos(a) * d, z = vo.z + Math.sin(a) * d, y = floorAt(fx, x, z);
      emit(glow, x + off.x, y + off.y + 0.05, z + off.z, { v: [rand(-0.2, 0.2), rand(0.6, 1.6 + 2 * k), rand(-0.2, 0.2)], life: rand(0.4, 0.9), size: rand(0.04, 0.09), color: FIRE[n % 4], gravity: 1.5, drag: 0.8 });
    }
    v.holders[0].position.set(vo.x, m.top + 0.8, vo.z);
    L.distance = 6 + 4 * k; L.color.set('#ff6a20');
    L.intensity = (1.2 + 3.3 * k) * (0.85 + 0.15 * Math.sin(time * (2 + 5 * k)));
    return;
  }
  drop('mound');
  v.crater ??= craterView(v);
  const c = v.crater, top = craterTop(fx), hot = burst >= 0 ? Math.max(0.6, 1 - burst / 40) : 0;
  c.plumes.forEach((p, i) => {
    const h = (6 + 8 * hot) * (i ? 0.7 : 1), r = (1 + 1.4 * hot) * (i ? 1.3 : 1);
    p.position.set(top.x + (i ? 0.3 : 0), top.y - 0.2, top.z + (i ? -0.2 : 0));
    p.scale.set(r, h, r);
    const U = p.material.uniforms;
    U.uTime.value = time * (i ? 0.8 : 1); U.uK.value = 0.6 + 0.4 * hot; U.uGlow.value = 0.6 + 0.6 * hot;
    U.uSmoke.value.set(hot ? '#2a2522' : '#3b3430');
  });
  c.beam.position.set(top.x, top.y - 0.1, top.z);
  c.beam.scale.set(0.8 + 0.5 * hot, 2.5 + 3 * hot, 0.8 + 0.5 * hot);
  c.beam.material.uniforms.uTime.value = time; c.beam.material.uniforms.uK.value = 0.3 + 0.4 * hot;
  // embers rising out of the crater; after the eruption a fountain of lava
  for (let n = Math.floor(dt * (10 + 50 * hot) + Math.random()); n > 0; n--) {
    const sp = hot ? rand(4, 9) : rand(1.5, 3.5);
    emit(glow, top.x + off.x + rand(-0.4, 0.4), top.y + off.y + 0.1, top.z + off.z + rand(-0.4, 0.4), { v: [rand(-1, 1) * (0.5 + hot), sp, rand(-1, 1) * (0.5 + hot)],
      life: rand(0.6, 1.3), size: rand(0.06, 0.14) * (1 + hot), color: FIRE[n % 4], gravity: hot ? 7 : 2, drag: 0.3 });
  }
  // (and after it billows of smoke)
  if (hot && Math.random() < dt * 7)
    emit(soft, top.x + off.x + rand(-0.5, 0.5), top.y + off.y + rand(0.5, 1.5), top.z + off.z + rand(-0.5, 0.5), { v: [rand(-0.3, 0.3), rand(1.5, 2.5), rand(-0.3, 0.3)],
      life: rand(2, 3), size: rand(0.6, 0.9), grow: 2.5, color: SMOKE[n3()], alpha: 0.55, drag: 0.4 });
  v.holders[0].position.set(top.x, top.y + 1.2, top.z);
  L.distance = 10 + 6 * hot; L.color.set('#ff7a2a');
  L.intensity = (3 + 6 * hot) * (0.85 + 0.15 * Math.sin(time * 7));
}

// --- the developer command (/woppyfx: game/devcommands.js) -----------------------------------------------------
// The effects of his fight round our hero, with no Woppylava: walls, hands, bombs, the eruption (the
// volcano's crater's lava pouring down round where the hero stands), the mound; off: none again.
let dev = null, devRaf = 0;
export function devWoppylavaFx(what) {
  cancelAnimationFrame(devRaf);
  devOn = !!what && what !== 'off';
  if (!devOn) { dev = null; clearWoppylavaFx(); return 'off'; }
  const p = player, x = p.x, z = p.z, box = state.map?.tide?.box ?? [2, 2, N - 2, N - 2];
  dev = { what, t: 0, x, z, box, seed: 1, n: 0, walls: [], hands: [], marks: [], vo: state.map?.volcano ?? { x: x + 3.5, z: z - 3 } };
  let last = performance.now();
  const tick = now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!devOn) return;
    stepDev(dt);
    drawFx(state.world, devFx(), dt);
    devRaf = requestAnimationFrame(tick);
  };
  devRaf = requestAnimationFrame(tick);
  return what;
}
function stepDev(dt) {
  const d = dev, p = player;
  d.t += dt;
  for (const l of [d.walls, d.hands, d.marks]) for (const o of l) o.t += dt;
  const all = d.what === 'all';
  if ((d.what === 'walls' || all) && !d.walls.length) {
    d.walls.push({ n: d.n++, side: d.n % 4, gap: Math.round(((d.n % 4) < 2 ? p.z : p.x) * 100) / 100 + 1.5, t: 0 });
  }
  d.walls = d.walls.filter(w => wallAt(w, w.t, d.box).phase !== 'done' || w.t < 0);
  if ((d.what === 'hands' || all) && !d.hands.length) {
    d.hands.push({ n: d.n++, x: p.x, z: p.z, t: 0, follow: true }, { n: d.n++, x: p.x + 2.5, z: p.z + 1.5, t: -0.4 });
  }
  for (const h of d.hands) if (h.follow && handPhase(h.t) === 'track') { const dx = p.x - h.x, dz = p.z - h.z, l = Math.hypot(dx, dz), s = H.speed * dt; if (l > s) { h.x += dx / l * s; h.z += dz / l * s; } }
  d.hands = d.hands.filter(h => handPhase(h.t) !== 'done' || h.t < 0);
  if ((d.what === 'bombs' || all) && !d.marks.length) {
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + d.n, r = 1 + i * 0.6, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      d.marks.push({ n: d.n++, x, y: floorAt({}, x, z), z, t: -i * 0.15, flight: 1.4 + (i % 3) * 0.2 });
    }
  }
  d.marks = d.marks.filter(m => m.t < m.flight + 0.6);
}
function devFx() {
  const d = dev, erupt = d.what === 'erupt', mound = d.what === 'mound';
  let lava = null;
  if (erupt) {
    // a pool round the "crater" and lava pouring out of it over the floor, ring after ring
    lava = new Float32Array(N * N).fill(NaN);
    const r = Math.min(9, d.t * 1.2);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const dd = Math.hypot(x + 0.5 - d.vo.x, z + 0.5 - d.vo.z);
      if (dd > r || dd > 1.5 && Math.hypot(x + 0.5 - d.x, z + 0.5 - d.z) < 1.2) continue;
      // (over its highest corner, as core/woppylava.js lavaSurfaces)
      const g = Math.max(...[[0.02, 0.02], [0.98, 0.02], [0.02, 0.98], [0.98, 0.98]].map(([a, b]) => groundAt(x + a, z + b, HIGH, 0).h));
      if (Number.isFinite(g)) lava[z * N + x] = g + (dd < 1.5 ? 0.35 : 0.3);
    }
  }
  return { walls: d.walls.filter(w => w.t >= 0), hands: d.hands.filter(h => h.t >= 0), marks: d.marks.filter(m => m.t >= 0), lava, level: -Infinity,
    volcano: erupt || mound ? d.vo : null, stir: mound ? (Math.sin(d.t * 0.4) * 0.5 + 0.5) : 0, stage: erupt ? 2 : 1, box: d.box, burst: erupt && d.t > 3 ? d.t - 3 : NaN };
}

// the shaders, compiled with his arena's (render/cubeassets.js): one of each, never shown
let warmers = null;
export function woppylavaWarmup(map) {
  if (!map?.volcano) return [];
  if (!warmers) {
    const fake = { colors: lavaColors(), root: new THREE.Group() }, R = fake.root;
    const hand = new THREE.Mesh(handGeo ??= buildHand(), moltenMaterial(fake.colors, { hand: true }));
    hand.material.transparent = false; hand.userData.sharedGeo = true;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(new Float32Array(8), 2)); geo.setAttribute('aHeat', new THREE.Float32BufferAttribute(new Float32Array(4), 1));
    const shaded = (fs, extra = {}, blend = THREE.AdditiveBlending) => new THREE.Mesh(flatPatch(1), new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uR: { value: 1 },
      uCol: { value: new THREE.Color() }, uHot: { value: new THREE.Color() }, ...extra }, vertexShader: MARK_VS, fragmentShader: fs, transparent: true, depthWrite: false, blending: blend }));
    R.add(hand, new THREE.Mesh(geo, moltenMaterial(fake.colors)), new THREE.Mesh(flatPatch(1), markMaterial(1)), shaded(SEAM_FS), shaded(CRACK_FS));
    sheetView(fake); craterView(fake);
    R.traverse(o => { o.visible = true; });
    warmers = [R];
  }
  return warmers;
}

// Umbra's jets, drawn (game/umbra.js runs them, core/umbra.js has the rules: jetVolley, jetWave,
// inJet). A wall's is a wave rolling across the room under water: while it warns, the water churns
// and swells at the wall it will come out of and bubbles stream along its way; then it rolls out of
// the wall and across, a hump of churning water as tall as a hero, its crest leaning forward and
// curling over in foam, a wake of bubbles and silt behind it, and where a hill stands in its way it
// breaks on it in a burst of spray. One from above: a ring of light on the floor and bubbles
// streaming down onto it, then the water plunging down in a churning funnel and bursting out over
// the floor in a ring. render/dive.js calls drawJets each frame with the volley running.
import * as THREE from 'three';
import { scene } from './scene.js';
import { emit, soft, glow, rand } from './particles.js';
import { UMBRA_FIGHT, jetWave, jetRoll, waveY } from '../core/umbra.js';
import { groundAt } from '../physics/collide.js';

const BUBBLE = ['#e8fbff', '#bfefff', '#8fd8f0'], FOAM = ['#ffffff', '#e8fbff', '#cdf3ff'], SILT = ['#7d8f8c', '#5f716f', '#9fb3ae'];

// value noise, for the churning
const NOISE = `
  float hh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vn(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hh(i), hh(i + vec3(1, 0, 0)), f.x), mix(hh(i + vec3(0, 1, 0)), hh(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hh(i + vec3(0, 0, 1)), hh(i + vec3(1, 0, 1)), f.x), mix(hh(i + vec3(0, 1, 1)), hh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 x) { return 0.55 * vn(x) + 0.3 * vn(x * 2.1 + 7.0) + 0.15 * vn(x * 4.3 + 13.0); }`;

// The wave: a sheet in its own frame (x across its way, y up, z along it, its front at z 0, its
// back at z -1, stretched to its length), its profile a surge's: a long slope up from the back to a
// crest leaning forward, curling over at the front, and its face falling from under the curl to the
// ground, spreading out at its foot; across, it falls away to nothing at its ends. uv: x 0..1 across.
const PROFILE = [[-1, -0.95], [-0.72, -0.62], [-0.45, -0.12], [-0.2, 0.4], [-0.04, 0.7], [0.13, 0.8], [0.3, 0.64], [0.36, 0.38], [0.27, 0.2],
  [0.2, -0.15], [0.24, -0.6], [0.36, -0.95]];
function waveGeometry(nx = 20, nb = 36) {
  const curve = new THREE.CatmullRomCurve3(PROFILE.map(([z, y]) => new THREE.Vector3(0, y, z)), false, 'centripetal');
  const pts = curve.getSpacedPoints(nb), pos = [], uv = [], idx = [];
  for (let i = 0; i <= nx; i++) {
    const u = i / nx, x = u - 0.5, taper = Math.pow(Math.max(0, 1 - (2 * x) ** 2), 0.35);
    for (let j = 0; j <= nb; j++) {
      const p = pts[j];
      // (towards its ends the crest sinks and lags behind its middle)
      pos.push(x, -0.95 + (p.y + 0.95) * taper, p.z - (1 - taper) * 0.35);
      uv.push(u, j / nb);
    }
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < nb; j++) {
    const a = i * (nb + 1) + j, b = a + nb + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const WAVE_VS = `uniform float uTime, uK; varying vec2 vUv; varying vec3 vN, vV, vP; ${NOISE}
  void main() {
    vUv = uv;
    vec3 p = position;
    // churning: the sheet heaving, the more towards its crest, rolling forward
    float c = smoothstep(-0.2, 0.7, position.y);
    vec3 q = vec3(p.x * 3.0, p.y * 2.0, p.z * 2.5 - uTime * 4.0);
    p += normal * (fbm(q) - 0.5) * (0.12 + 0.22 * c);
    p.z += sin(uTime * 7.0 + p.x * 9.0) * 0.04 * c;
    vec4 w = modelViewMatrix * vec4(p, 1.0);
    vP = p; vN = normalize(normalMatrix * normal); vV = normalize(-w.xyz);
    gl_Position = projectionMatrix * w;
  }`;
const WAVE_FS = `uniform float uTime, uK; varying vec2 vUv; varying vec3 vN, vV, vP; ${NOISE}
  void main() {
    // (thick where it faces you, thin and gone at its outline: a body of water, not a shell)
    float face = abs(dot(normalize(vN), normalize(vV)));
    float n = fbm(vec3(vP.x * 4.0, vP.y * 3.0, vP.z * 3.0 - uTime * 6.0));
    // foam on the crest and the curl, churned streaks running back along it
    float top = smoothstep(0.25, 0.75, vP.y);
    float foam = top * smoothstep(0.45, 0.75, n) + smoothstep(0.62, 0.85, vP.y) * 0.35 * n;
    float streak = smoothstep(0.5, 0.85, fbm(vec3(vP.x * 8.0, vP.y * 1.5, vP.z * 1.4 - uTime * 9.0)));
    vec3 col = mix(vec3(0.2, 0.5, 0.58), vec3(0.66, 0.92, 0.97), clamp(streak * 0.5 + top * 0.35 + n * 0.2, 0.0, 1.0));
    col = mix(col, vec3(0.96, 1.0, 1.0), clamp(foam, 0.0, 1.0) * 0.85);
    // fading out towards its ends, its back, its foot on the ground and its outline, broken up by the churning
    float ends = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
    float fade = smoothstep(-1.0, -0.55, vP.z) * smoothstep(-0.95, -0.45, vP.y);
    float body = (0.1 + 0.28 * face) * (0.5 + 0.9 * n) + 0.25 * streak + 0.55 * foam;
    float a = body * ends * fade * smoothstep(0.02, 0.35, face + foam * 0.5);
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.85) * uK);
  }`;
// The plunge from above: a funnel (CylinderGeometry, open) of water rushing down, streaked and
// twisting, brightest at its rim
const FALL_VS = `uniform float uTime; varying vec2 vUv; varying vec3 vN, vV; ${NOISE}
  void main() {
    vUv = uv;
    vec3 p = position;
    float a = atan(p.z, p.x);
    p.xz *= 1.0 + (fbm(vec3(cos(a) * 2.0, p.y * 1.5 + uTime * 6.0, sin(a) * 2.0)) - 0.5) * 0.45;
    vec4 w = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-w.xyz);
    gl_Position = projectionMatrix * w;
  }`;
const FALL_FS = `uniform float uTime, uK; varying vec2 vUv; varying vec3 vN, vV; ${NOISE}
  void main() {
    float face = abs(dot(normalize(vN), normalize(vV)));
    // sheets and ropes of water rushing down, twisting a little
    float s = fbm(vec3(vUv.x * 10.0 + vUv.y * 2.5, vUv.y * 3.0 + uTime * 8.0, uTime * 0.7));
    float rope = smoothstep(0.42, 0.78, s), fine = smoothstep(0.55, 0.9, fbm(vec3(vUv.x * 26.0, vUv.y * 9.0 + uTime * 14.0, 3.0)));
    vec3 col = mix(vec3(0.3, 0.64, 0.74), vec3(0.95, 1.0, 1.0), clamp(rope * 0.6 + fine * 0.5 + (1.0 - vUv.y) * 0.3, 0.0, 1.0));
    float a = ((0.06 + 0.22 * face) * (0.4 + rope) + 0.3 * fine) * smoothstep(0.05, 0.45, face) * smoothstep(1.0, 0.7, vUv.y) * smoothstep(0.0, 0.12, vUv.y) * uK;
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.8));
  }`;
// the ring of water bursting out over the floor where it lands, broken up by the churning
const RING_FS = `uniform float uTime, uK; varying vec2 vUv; varying vec3 vP; ${NOISE}
  void main() {
    float n = fbm(vec3(vP.xy * 3.0, uTime * 3.0)), r = length(vP.xy);
    float band = smoothstep(0.6, 0.8, r) * smoothstep(1.0, 0.86, r);
    gl_FragColor = vec4(mix(vec3(0.6, 0.9, 0.96), vec3(1.0), n), uK * smoothstep(0.3, 0.7, n) * band * 0.85);
  }`;
const RING_VS = `varying vec2 vUv; varying vec3 vP; void main() { vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const shader = (vs, fs, side = THREE.DoubleSide) => new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uK: { value: 0 } }, vertexShader: vs,
  fragmentShader: fs, transparent: true, depthWrite: false, side });

let waveGeo = null, warming = null;
const WAVE_H = 1.15;   // (its profile's height, scaled: from the ground to its crest about two cells)
function jetView(show = true) {
  waveGeo ??= waveGeometry();
  // (two sheets, one inside the other a little smaller: the water has a body)
  const wave = new THREE.Mesh(waveGeo, shader(WAVE_VS, WAVE_FS)), inner = new THREE.Mesh(waveGeo, shader(WAVE_VS, WAVE_FS));
  inner.scale.set(0.8, 0.75, 0.85); inner.position.set(0, -0.05, -0.08);
  wave.add(inner);
  const fall = new THREE.Mesh(new THREE.CylinderGeometry(UMBRA_FIGHT.jets.down.r * 0.55, UMBRA_FIGHT.jets.down.r, 1, 28, 12, true), shader(FALL_VS, FALL_FS));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 40, 1), shader(RING_VS, RING_FS));
  ring.rotation.x = -Math.PI / 2;
  const mark = new THREE.Mesh(new THREE.RingGeometry(UMBRA_FIGHT.jets.down.r * 0.8, UMBRA_FIGHT.jets.down.r, 28),
    new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  mark.rotation.x = -Math.PI / 2;
  [wave, inner, fall, ring, mark].forEach(m => { m.renderOrder = 7; m.frustumCulled = false; });
  if (show) [wave, fall, ring, mark].forEach(m => scene.add(m));
  return { wave, inner, fall, ring, mark, broke: -1, landed: -1 };
}
const meshesOf = w => [w.wave, w.fall, w.ring, w.mark];

const groundOf = top => (x, z) => { const h = groundAt(x, z, top, 0).h; return Number.isFinite(h) ? h : -Infinity; };

// jets: the volley running ({ i, t, list }: game/umbra.js e.jets) or null; views: the jets' views
// (kept in render/dive.js's view)
export function drawJets(views, jets, reef, dt, off) {
  const J = UMBRA_FIGHT.jets, list = jets?.list ?? [], box = reef.box, ground = groundOf(reef.surface + 4), time = performance.now() / 1000;
  while (views.length < list.length) views.push(jetView());
  views.forEach((w, i) => {
    const j = list[i];
    meshesOf(w).forEach(m => { m.visible = false; });
    if (!j) { w.broke = w.landed = -1; return; }
    const tw = jets.t - J.warn, warn = tw < 0, k = warn ? jets.t / J.warn : 1, key = jets.i;
    if (j.kind === 'down') { drawFall(w, j, reef, tw, k, key, dt, off, time); return; }
    const wave = jetWave(j, Math.max(0, tw), ground, box), y = waveY(wave, Math.max(0, wave.front));
    const dir = j.side < 2 ? [wave.dir, 0] : [0, wave.dir], at = s => j.side < 2 ? [wave.start + wave.dir * s, j.u] : [j.u, wave.start + wave.dir * s];
    if (warn) {
      // its way bubbling, the water at the wall churning and swelling
      if (Math.random() < dt * 45) {
        const s = rand(0, Math.min(wave.len, wave.stop)), [x, z] = at(s), a = rand(-0.6, 0.6);
        emit(soft, x + off.x + rand(-0.3, 0.3) * (1 - Math.abs(dir[0])), waveY(wave, s) + off.y + a, z + off.z + rand(-0.3, 0.3) * (1 - Math.abs(dir[1])),
          { v: [dir[0] * rand(0.4, 1.6), rand(0.2, 0.7), dir[1] * rand(0.4, 1.6)], life: rand(0.5, 1), size: rand(0.03, 0.06), color: BUBBLE[(Math.random() * 3) | 0], alpha: 0.7 * k, drag: 1 });
      }
      if (Math.random() < dt * 30 * k) {
        const [x, z] = at(rand(0.1, 0.7));
        emit(soft, x + off.x + rand(-0.6, 0.6) * Math.abs(dir[1]), y + off.y + rand(-0.6, 0.6), z + off.z + rand(-0.6, 0.6) * Math.abs(dir[0]),
          { v: [dir[0] * rand(0.5, 1.5) + rand(-0.4, 0.4), rand(-0.3, 0.6), dir[1] * rand(0.5, 1.5) + rand(-0.4, 0.4)], life: rand(0.4, 0.8), size: rand(0.1, 0.22), grow: 1.5,
            color: FOAM[(Math.random() * 3) | 0], alpha: 0.35 * k, drag: 2 });
      }
      if (Math.random() < dt * 12) { const [x, z] = at(0.15); emit(glow, x + off.x, y + off.y, z + off.z, { life: 0.3, size: 0.5 + 0.7 * k, color: '#8fdcf0', alpha: 0.35 * k }); }
      // (the swell: the wave's crest just showing out of the wall)
      place(w, at, dir, y, 0, 0.35 + 0.45 * k, 1.2 + 0.6 * k, 0.35 * k, off, time);
      return;
    }
    if (tw >= jetRoll(box)) return;
    // (out of the wall, its back still in it; broken on a hill, what is left of it running into the hill)
    const len = Math.max(0.05, wave.front - Math.max(wave.back, -0.4)), fade = wave.broken ? Math.min(1, Math.max(0, (wave.front - wave.back) / J.length)) : 1;
    if (fade <= 0.02) return;
    // (leaning with the ground it rolls over)
    const half = Math.min(J.length / 2, Math.max(0.25, wave.front)), slope = (y - waveY(wave, Math.max(0, wave.front - half))) / half;
    place(w, at, dir, y, Math.atan(slope), wave.front, Math.min(J.length, len + 0.6), fade, off, time);
    // the wake: bubbles and silt churned up behind it, foam off its crest
    const [fx, fz] = at(wave.front);
    for (let n = Math.floor(dt * 70 * fade + Math.random()); n > 0; n--) {
      const s = Math.max(0, wave.front - rand(0, J.length * 1.4)), [bx, bz] = at(s), a = rand(-0.75, 0.75);
      emit(soft, bx + off.x + a * Math.abs(dir[1]), waveY(wave, s) + off.y + rand(-0.8, 0.5), bz + off.z + a * Math.abs(dir[0]),
        { v: [dir[0] * rand(0.5, 3), rand(0.3, 1.2), dir[1] * rand(0.5, 3)], life: rand(0.6, 1.3), size: rand(0.025, 0.06), color: BUBBLE[n % 3], alpha: 0.75, drag: 1.4, gravity: -0.6 });
    }
    if (!wave.broken) for (let n = Math.floor(dt * 50 + Math.random()); n > 0; n--) {
      const a = rand(-1.1, 1.1);   // (foam blown off its crest)
      emit(soft, fx + off.x + a * Math.abs(dir[1]), y + off.y + rand(0.5, 1.1) * (1 - 0.5 * Math.abs(a) / 1.1), fz + off.z + a * Math.abs(dir[0]),
        { v: [dir[0] * rand(3, 7), rand(-0.6, 0.8), dir[1] * rand(3, 7)], life: rand(0.25, 0.5), size: rand(0.1, 0.22), grow: 1.6, color: FOAM[n % 3], alpha: 0.5, drag: 2.5 });
      const g = ground(fx, fz);
      if (Number.isFinite(g) && y - g < 1.4 && n % 2 === 0)   // (silt off the bottom it rolls over)
        emit(soft, fx + off.x + a * Math.abs(dir[1]), g + off.y + 0.08, fz + off.z + a * Math.abs(dir[0]),
          { v: [dir[0] * rand(1, 3), rand(0.3, 0.9), dir[1] * rand(1, 3)], life: rand(0.8, 1.5), size: rand(0.12, 0.28), grow: 1.8, color: SILT[n % 3], alpha: 0.3, drag: 1.8 });
    }
    // broken on a hill: a burst of spray up its side
    if (wave.broken && w.broke !== key) {
      w.broke = key;
      const [sx, sz] = at(wave.stop);
      for (let n = 0; n < 40; n++) {
        const a = rand(-0.8, 0.8);
        emit(soft, sx + off.x + a * Math.abs(dir[1]), y + off.y + rand(-0.4, 0.6), sz + off.z + a * Math.abs(dir[0]),
          { v: [-dir[0] * rand(0.5, 2) + rand(-1, 1) * Math.abs(dir[1]), rand(1, 3.5), -dir[1] * rand(0.5, 2) + rand(-1, 1) * Math.abs(dir[0])], life: rand(0.4, 0.9),
            size: rand(0.06, 0.18), grow: 1.4, color: n % 2 ? FOAM[n % 3] : BUBBLE[n % 3], alpha: 0.7, drag: 1.6, gravity: -0.3 });
      }
    }
  });
}
// the wave with its front `front` cells along its way, `y` high, leaning up `pitch` (radians), `length`
// long behind it, `k` how much of it shows
function place(w, at, dir, y, pitch, front, length, k, off, time) {
  const J = UMBRA_FIGHT.jets, [x, z] = at(front);
  w.wave.visible = true;
  // (its foot on the ground it rolls over: its middle `ride` over it)
  w.wave.position.set(x + off.x, y - J.ride + 0.95 * WAVE_H + off.y, z + off.z);
  w.wave.rotation.set(-pitch, Math.atan2(dir[0], dir[1]), 0, 'YXZ');
  w.wave.scale.set(J.width * 1.6, WAVE_H, length);
  for (const m of [w.wave, w.inner]) { m.material.uniforms.uTime.value = time; m.material.uniforms.uK.value = k; }
}
// one from above: the ring warning on the floor, bubbles streaming down onto it, then the plunge and
// the ring of water bursting out over the floor
function drawFall(w, j, reef, tw, k, key, dt, off, time) {
  const D = UMBRA_FIGHT.jets.down, floor = j.floor ?? reef.low, top = reef.surface;
  if (tw < 0 || tw < D.time) {
    w.mark.visible = true;
    w.mark.position.set(j.x + off.x, floor + 0.06 + off.y, j.z + off.z);
    w.mark.material.opacity = tw < 0 ? 0.25 + 0.55 * k * (0.6 + 0.4 * Math.sin(time * 20)) : 0.5 * (1 - tw / D.time);
  }
  if (tw < 0) {
    if (Math.random() < dt * 40 * (0.4 + k))
      emit(soft, j.x + off.x + rand(-D.r, D.r) * 0.7, top + off.y - rand(0, 1.5), j.z + off.z + rand(-D.r, D.r) * 0.7,
        { v: [0, -rand(2, 4), 0], life: rand(0.8, 1.4), size: rand(0.03, 0.06), color: BUBBLE[(Math.random() * 3) | 0], alpha: 0.7, drag: 0.2 });
    w.landed = -1;
    return;
  }
  if (tw >= D.time + 0.5) return;
  // it plunges from the surface to the floor in a moment, then thins and is gone
  const drop = Math.min(1, tw / 0.22), h = Math.max(0.3, top - floor), reach = h * drop, thin = tw < D.time ? 1 : Math.max(0, 1 - (tw - D.time) / 0.5);
  w.fall.visible = true;
  w.fall.scale.set(0.6 + 0.4 * thin, reach, 0.6 + 0.4 * thin);
  w.fall.position.set(j.x + off.x, top - reach / 2 + off.y, j.z + off.z);
  w.fall.material.uniforms.uTime.value = time; w.fall.material.uniforms.uK.value = thin * (tw < 0.05 ? tw / 0.05 : 1);
  if (drop >= 1 && w.landed !== key) {   // landing: a ring of water out over the floor, spray and bubbles
    w.landed = key; w.landT = tw;
    for (let n = 0; n < 50; n++) {
      const a = rand(0, Math.PI * 2), sp = rand(2, 5);
      emit(soft, j.x + off.x + Math.cos(a) * D.r * 0.6, floor + off.y + 0.1, j.z + off.z + Math.sin(a) * D.r * 0.6,
        { v: [Math.cos(a) * sp, rand(0.3, 2), Math.sin(a) * sp], life: rand(0.4, 0.9), size: rand(0.08, 0.2), grow: 1.5, color: n % 3 ? FOAM[n % 3] : SILT[n % 3], alpha: 0.6, drag: 2.5 });
    }
  }
  if (w.landed === key) {
    const u = Math.min(1, (tw - w.landT) / 0.7);
    w.ring.visible = u < 1;
    w.ring.position.set(j.x + off.x, floor + 0.08 + off.y, j.z + off.z);
    w.ring.scale.setScalar(D.r * (0.9 + 2.2 * u));
    w.ring.material.uniforms.uTime.value = time; w.ring.material.uniforms.uK.value = 1 - u;
  }
  if (Math.random() < dt * 30 * thin)
    emit(soft, j.x + off.x + rand(-D.r, D.r) * 0.6, floor + off.y + rand(0, h * 0.6), j.z + off.z + rand(-D.r, D.r) * 0.6,
      { v: [rand(-0.4, 0.4), -rand(1, 3), rand(-0.4, 0.4)], life: rand(0.3, 0.6), size: rand(0.08, 0.16), grow: 1.4, color: FOAM[(Math.random() * 3) | 0], alpha: 0.45, drag: 2 });
}

// their shaders, compiled with Umbra's reef's (render/cubeassets.js): one set, never shown
export function jetWarmup(map) {
  if (!map?.dive) return [];
  warming ??= jetView(false);
  return meshesOf(warming);
}

export function clearJets(views) {
  for (const w of views) {
    for (const m of meshesOf(w)) { scene.remove(m); m.material.dispose(); if (m.geometry !== waveGeo) m.geometry.dispose(); }
    w.inner.material.dispose();
  }
  views.length = 0;
}

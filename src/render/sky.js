// The backdrop: a hazy night sky with shimmering stars, fixed to the screen (it does not
// turn with the camera; but the world rolled on the screen, game/roll.js, it rolls with it: the
// stars cover all the screen may turn to, the haze mirrored past its edges). Built for cost:
//   - clouds: a small pre-blurred mask made once at startup; the GPU's bilinear filter does
//     the rest. The colours are uniforms (set from the theme by look.js), so changing depth
//     never touches the texture. Drawn at the far plane after the opaque pass, so the depth
//     test drops every pixel the world already covers.
//   - stars: one Points draw in clip space, the twinkle is computed per star (vertex shader),
//     not per pixel. Hidden entirely when the theme has no stars (caves).
import * as THREE from 'three';
import { scene, renderer } from './scene.js';

// --- the cloud mask: R haze band, G violet tint, B brightness (vignette, dust lanes) -------
const MW = 192, MH = 108;

function rng(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function valueNoise(seed) {
  const r = rng(seed), P = 64, g = new Float32Array(P * P).map(() => r());
  const at = (x, y) => g[(x & (P - 1)) + (y & (P - 1)) * P];
  const s = t => t * t * (3 - 2 * t);
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), u = s(x - xi), v = s(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, y) => { let sum = 0, amp = 0.5; for (let o = 0; o < 4; o++, x *= 2.03, y *= 2.03, amp *= 0.5) sum += amp * n(x, y); return sum / 0.9375; };
}

// separable box blur, a few passes approximate a gaussian
function blur(ch, w, h, radius, passes) {
  const tmp = new Float32Array(ch.length), k = 1 / (2 * radius + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0; for (let i = -radius; i <= radius; i++) s += ch[Math.min(w - 1, Math.max(0, x + i)) + y * w];
      tmp[x + y * w] = s * k;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0; for (let i = -radius; i <= radius; i++) s += tmp[x + Math.min(h - 1, Math.max(0, y + i)) * w];
      ch[x + y * w] = s * k;
    }
  }
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// u, v in 0..1 (v up). Returns [haze, tint, brightness]; also used to place the stars.
const fA = valueNoise(11), fB = valueNoise(23), fC = valueNoise(37);
function cloudAt(u, v) {
  const x = u * 16 / 9;
  // a band of haze rising from the lower left, like the milky way, with clumps
  const d = (v - (0.1 + 0.32 * u + 0.06 * Math.sin(u * 5))) / 0.2;
  const band = Math.exp(-d * d) * (0.3 + 0.9 * fA(x * 2.2, v * 2.2));
  const cloud = 0.22 * smooth(0.45, 0.85, fB(x * 1.4 + 3, v * 1.4));
  const haze = Math.min(1, band * 0.75 + cloud);
  // violet in the lower right
  const du = (u - 0.95) / 0.38, dv = (v - 0.12) / 0.32;
  const tint = Math.min(1, Math.exp(-du * du - dv * dv) * (0.4 + 0.6 * fC(x * 2, v * 2)) * 0.8);
  // dust lanes darken the band, the corners fall off a little
  const lane = smooth(0.55, 0.78, fC(x * 3.1 + 7, v * 3.1)) * Math.exp(-d * d);
  const cu = u - 0.5, cv = v - 0.5;
  return [haze, tint, Math.max(0, 1 - 0.3 * lane - 0.55 * (cu * cu + cv * cv))];
}

function makeMask() {
  const n = MW * MH, ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const c = cloudAt((x + 0.5) / MW, (y + 0.5) / MH);
    for (let k = 0; k < 3; k++) ch[k][x + y * MW] = c[k];
  }
  for (const c of ch) blur(c, MW, MH, 2, 2);
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.round(Math.min(1, Math.max(0, ch[k][i])) * 255);
  const tex = new THREE.DataTexture(data, MW, MH, THREE.RGBAFormat);   // row 0 = bottom, as gl expects
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;   // (rolled, the screen's corners reach past it)
  tex.needsUpdate = true;
  return tex;
}

// --- backdrop: one oversized triangle at the far plane --------------------------------------
// The colours are sRGB values, mixed and written as-is (no colour space conversion needed).
const U = {
  mask: { value: makeMask() },
  top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
  haze: { value: new THREE.Color() }, tint: { value: new THREE.Color() },
  roll: { value: 0 }, aspect: { value: 1 },
};
// a point on the screen rolled (clip space, x scaled by the aspect to be square) where it is on the
// screen unrolled: turned by the roll (core/roll.js unturn)
const TURN = `vec2 turn(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }`;
const tri = new THREE.BufferGeometry();
tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
const backdrop = new THREE.Mesh(tri, new THREE.ShaderMaterial({
  uniforms: U, depthWrite: false,
  vertexShader: `varying vec2 vUv;
    void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
  fragmentShader: `precision mediump float;
    uniform sampler2D mask; uniform vec3 top, bottom, haze, tint; uniform float roll, aspect; varying vec2 vUv;
    ${TURN}
    void main() {
      vec2 uv = vUv;
      if (roll != 0.0) { vec2 p = (uv - 0.5) * vec2(aspect, 1.0); uv = turn(p, roll) / vec2(aspect, 1.0) + 0.5; }
      vec3 m = texture2D(mask, uv).rgb;
      vec3 c = mix(mix(mix(bottom, top, clamp(uv.y, 0.0, 1.0)), haze, m.r), tint, m.g) * m.b;
      // dither (interleaved gradient noise): dark gradients band badly in 8 bits
      float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      gl_FragColor = vec4(c + (n - 0.5) / 255.0, 1.0);
    }`,
}));
backdrop.frustumCulled = false; backdrop.matrixAutoUpdate = false;
backdrop.renderOrder = 1e9;   // last of the opaque pass: early depth rejects covered pixels
scene.add(backdrop);

// --- stars ----------------------------------------------------------------------------------
const SU = { time: { value: 0 }, gain: { value: 1 }, scale: { value: 1 }, roll: U.roll, aspect: U.aspect };
const stars = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
  uniforms: SU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  // position: clip x, y and size (css px); star: brightness, phase, speed, twinkle amount
  vertexShader: `attribute vec4 star; uniform float time, gain, scale, roll, aspect; varying vec3 vC;
    ${TURN}
    void main() {
      float b = star.x * gain * max(0.0, 1.0 - star.w + star.w * sin(time * star.z + star.y));
      float t = fract(star.y * 13.7) * 2.0 - 1.0;   // slight warm / cool tint
      vC = b * vec3(1.0 + 0.1 * t, 1.0, 1.0 - 0.1 * t);
      gl_PointSize = position.z * scale;
      gl_Position = vec4(turn(position.xy * vec2(aspect, 1.0), -roll) / vec2(aspect, 1.0), 1.0, 1.0);
    }`,
  fragmentShader: `precision mediump float; varying vec3 vC;
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      float a = max(0.0, 1.0 - dot(p, p));
      gl_FragColor = vec4(vC * (a * a), 1.0);
    }`,
}));
stars.frustumCulled = false; stars.matrixAutoUpdate = false;
stars.renderOrder = -1e9;   // first of the transparent pass: water, glass etc. blend over them
scene.add(stars);

// about one star per 900 css px², denser in the haze band; over all the screen may roll to (a
// circle round its middle through its corners), the haze mirrored past its edges like the mask
const mirror = t => t < 0 ? -t : t > 1 ? 2 - t : t;
function placeStars() {
  const aspect = innerWidth / innerHeight, half = Math.hypot(aspect, 1) / 2, eu = half / aspect - 0.5, ev = half - 0.5;
  const area = (1 + 2 * eu) * (1 + 2 * ev);
  const r = rng(1234), want = Math.round(Math.min(3000, innerWidth * innerHeight / 900) * area);
  const pos = new Float32Array(want * 3), st = new Float32Array(want * 4);
  for (let i = 0; i < want;) {
    const u = -eu + r() * (1 + 2 * eu), v = -ev + r() * (1 + 2 * ev);
    if (r() * 1.6 > 0.55 + cloudAt(mirror(u), mirror(v))[0]) continue;
    const k = r();
    const [size, bright] = k < 0.03 ? [3.5 + r() * 2.5, 0.8 + r() * 0.2]   // a few big ones with a glow
      : k < 0.25 ? [1.8 + r(), 0.6 + r() * 0.4] : [1 + r() * 0.6, 0.4 + r() * 0.45];
    pos.set([u * 2 - 1, v * 2 - 1, size], i * 3);
    st.set([bright, r() * Math.PI * 2, 0.6 + r() * 2.4, r() < 0.15 ? 0.4 + r() * 0.3 : 0.1 + r() * 0.2], i * 4);
    i++;
  }
  stars.geometry.dispose();
  const g = stars.geometry = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('star', new THREE.BufferAttribute(st, 4));
  g.boundingSphere = new THREE.Sphere();   // never culled; skip computing one for sorting
  SU.scale.value = renderer.getPixelRatio();
}
placeStars();
let w = innerWidth, h = innerHeight;
addEventListener('resize', () => {
  if (Math.abs(innerWidth * innerHeight - w * h) > 0.1 * w * h || Math.abs(innerWidth / innerHeight - w / h) > 0.1 * w / h) { w = innerWidth; h = innerHeight; placeStars(); }
});

// colours as linear THREE.Colors (as look.js blends them); stars: 0..1
export function setSkyLook(top, bottom, haze, tint, amount) {
  U.top.value.copy(top).convertLinearToSRGB();
  U.bottom.value.copy(bottom).convertLinearToSRGB();
  U.haze.value.copy(haze).convertLinearToSRGB();
  U.tint.value.copy(tint).convertLinearToSRGB();
  SU.gain.value = amount;
  stars.visible = amount > 0.01;
}

// the stars' size is in CSS pixels: follow the pixel ratio (it changes with the frame rate)
export function tickSky(seconds) { SU.time.value = seconds; SU.scale.value = renderer.getPixelRatio(); U.aspect.value = innerWidth / innerHeight; }
// the world rolled on the screen (game/roll.js): the sky rolls with it (radians, as the camera)
export function setSkyRoll(a) { U.roll.value = a; }

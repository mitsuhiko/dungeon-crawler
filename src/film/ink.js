// The films' ink (docs/film.md): a layer is a painting of white ink on black (assets/film/<image>.png,
// made by tools/inklayer.py), drawn glowing on the dark, painted in along its flow map
// (core/film.js flowMap) as the film goes. One material does all of it:
//   uPaint  how far the ink has spread, in the flow's time (0 none, 1 all, a little more to be sure)
//   uGone   how far it has gone again, the same way (it leaves the way it came)
// Where the ink is still wet (just behind the spreading front) it runs a little past its strokes
// and glows brighter; a halo of its own light lies round it. Drawn added onto what is behind.
// A layer can break (film/player.js break): cracks run through it between CELLS points (uCrack),
// and then it is CELLS pieces, each the same material showing only its own cell (uCell). An
// ellipse of it can stay whole (uHold: its middle and radii in the picture), one piece more
// (cell CELLS): the ark's hull, falling while its wings break.
import * as THREE from 'three';
import { NOISE } from '../render/stage.js';
import { flowMap, sweepMap, glowFlow, shrink } from '../core/film.js';

// the inks' colours: the bluish white ink, and amber (the stone, the comets)
export const TINTS = { ink: new THREE.Color('#bcd9ff'), amber: new THREE.Color('#f0a868') };

export const CELLS = 12;   // the pieces a layer breaks into

// a picture (an image or a canvas) as a layer's: its texture, its shape, its brightness at the
// flow's size
function pictureOf(name, source, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(source, 0, 0);
  const small = shrink(g.getImageData(0, 0, w, h).data, w, h);
  const texture = new THREE.Texture(source);
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;   // (rows down, as the flow map's)
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return { name, texture, aspect: w / h, small };
}

// A text as a layer's picture: in the title's face (the main menu's, Cinzel), white on black,
// spaced and a little soft at its edges, as if written with a brush. `text` as it is said in the
// player's language (a film's title: the game's name, as the main menu says it).
export async function loadText(text, { px = 150, spacing = 0.32, font = 'Cinzel' } = {}) {
  const face = `600 ${px}px ${font}`;
  try { await document.fonts?.load(face, text); } catch { /* (the fallback face then) */ }
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = face;
  const chars = [...text.toUpperCase()], gap = px * spacing;
  const widths = chars.map(ch => g.measureText(ch).width), w = Math.ceil(widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1) + px), h = Math.ceil(px * 1.9);
  c.width = w; c.height = h;
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.font = face; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.shadowColor = 'rgba(255,255,255,0.55)'; g.shadowBlur = px * 0.12;
  let x = px / 2;
  chars.forEach((ch, i) => { g.fillText(ch, x, h / 2); x += widths[i] + gap; });
  return pictureOf(`text:${text}`, c, w, h);
}

// an image's picture, its texture and its brightness at the flow's size, by name (loaded once)
const images = new Map();
export function loadImage(name) {
  if (!images.has(name)) images.set(name, new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(pictureOf(name, img, img.width, img.height));
    img.onerror = () => reject(new Error(`film image ${name} did not load`));
    img.src = new URL(`../../assets/film/${name}.png`, import.meta.url).href;
  }));
  return images.get(name);
}

// the flow map of `image` from `from` (core/film.js flowMap; sweep: straight across from that side,
// sweepMap) as a texture (red; green: the flow its glow goes by, glowFlow), and the flow itself
export function flowOf(image, from, { sweep = false } = {}) {
  const { ink, w, h } = image.small, flow = sweep ? sweepMap(ink, w, h, from) : flowMap(ink, w, h, from), glow = glowFlow(flow, ink, w, h);
  const half = new Uint16Array(w * h * 2);
  for (let i = 0; i < w * h; i++) { half[i * 2] = THREE.DataUtils.toHalfFloat(flow[i]); half[i * 2 + 1] = THREE.DataUtils.toHalfFloat(glow[i]); }
  const texture = new THREE.DataTexture(half, w, h, THREE.RGFormat, THREE.HalfFloatType);
  texture.flipY = false;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, flow };
}

// the material of a layer's ink: image's texture, its flow texture, the tint; its uniforms say how
// far it is painted (uPaint) and gone (uGone), how bright the whole (uLevel), how bright the cracks
// between the cells at uCells are (uCrack), and which cell alone it shows (uCell; -1: all)
export function inkMaterial(image, flowTexture, tint, seed = 0, cells = null) {
  return new THREE.ShaderMaterial({
    uniforms: { tInk: { value: image.texture }, tFlow: { value: flowTexture }, uTint: { value: tint.clone() },
      uPaint: { value: 0 }, uGone: { value: 0 }, uLevel: { value: 1 }, uSeed: { value: seed }, uTime: { value: 0 },
      uCells: { value: cells ?? Array.from({ length: CELLS }, () => new THREE.Vector2(-9, -9)) }, uCell: { value: -1 }, uCrack: { value: 0 },
      uHold: { value: new THREE.Vector4(0, 0, 0, 0) },
      uAspect: { value: image.aspect } },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tInk, tFlow; uniform vec3 uTint; uniform float uPaint, uGone, uLevel, uSeed, uTime;
      uniform vec2 uCells[${CELLS}]; uniform float uCell, uCrack, uAspect; uniform vec4 uHold;
      varying vec2 vUv;
      ${NOISE}
      const float SOFT = 0.07;
      void main() {
        vec2 uv = vec2(vUv.x, 1.0 - vUv.y);   // (the picture's rows go down, the flow's too)
        // the cells it breaks into: the nearest point, and how near the next (the crack between)
        float crack = 0.0;
        if (uCell >= 0.0 || uCrack > 0.0) {
          vec2 q = (uv + (vec2(fbm(uv * 9.0), fbm(uv * 9.0 + 5.0)) - 0.5) * 0.06) * vec2(uAspect, 1.0);
          float d1 = 1e9, d2 = 1e9, id = -1.0;
          for (int k = 0; k < ${CELLS}; k++) {
            float d = distance(q, uCells[k] * vec2(uAspect, 1.0));
            if (d < d1) { d2 = d1; d1 = d; id = float(k); } else if (d < d2) d2 = d;
          }
          crack = 1.0 - smoothstep(0.0, 0.012, d2 - d1);
          // the part that stays whole, its edge a crack too
          if (uHold.z > 0.0) {
            vec2 e = (uv - uHold.xy) / uHold.zw;
            float r = length(e) + (fbm(uv * 12.0 + 2.0) - 0.5) * 0.25;
            if (r < 1.0) { id = ${CELLS}.0; crack = 0.0; }
            crack = max(crack, 1.0 - smoothstep(0.0, 0.03, abs(r - 1.0)));
          }
          if (uCell >= 0.0 && abs(id - uCell) > 0.5) discard;
          crack *= uCrack;
        }
        float n = fbm(uv * 14.0 + uSeed * 7.1) - 0.5;
        vec2 flows = texture2D(tFlow, uv).rg;
        float f = flows.r + n * 0.09, fg = flows.g + n * 0.09;
        // painted: behind the spreading front; wet: just behind it
        float front = uPaint - f, shown = smoothstep(0.0, SOFT, front);
        float wet = smoothstep(-SOFT, 0.0, front) * exp(-max(front, 0.0) * 9.0);
        float gone = smoothstep(0.0, SOFT, uGone - f);
        float keep = shown * (1.0 - gone);
        // wet ink runs past its strokes: a blurred picture of it, feathered by the noise
        vec2 wob = vec2(fbm(uv * 30.0 + uTime * 0.6), fbm(uv * 30.0 - uTime * 0.5 + 3.3)) - 0.5;
        float ink = texture2D(tInk, uv + wob * 0.004 * wet).r;
        float bled = texture2D(tInk, uv, 3.5).r * smoothstep(0.35, 0.75, fbm(uv * 45.0 + uSeed));
        float body = max(ink, bled * 0.7 * wet);
        // its glow round it (none at the picture's edges: the blur reaches past them)
        float rim = smoothstep(0.0, 0.15, uv.x) * smoothstep(1.0, 0.85, uv.x) * smoothstep(0.0, 0.15, uv.y) * smoothstep(1.0, 0.85, uv.y);
        float halo = max(texture2D(tInk, uv, 4.5).r - 0.03, 0.0) * rim
          * smoothstep(0.0, SOFT, uPaint - fg) * (1.0 - smoothstep(0.0, SOFT, uGone - fg));
        float grain = 0.82 + 0.36 * fbm(uv * 160.0 + uSeed);
        float b = (body * grain * (1.0 + 0.9 * wet) * keep + halo * 0.3) * uLevel;
        // the leaving ink brightens as it goes, like the wet front (it lifts off)
        b += body * smoothstep(-SOFT, 0.0, uGone - f) * (1.0 - gone) * 0.8 * shown * uLevel;
        // the cracks shine where there is ink
        b += crack * (body + halo) * 2.5 * uLevel;
        // the brightest ink goes white, as light does
        gl_FragColor = vec4(uTint * b + vec3(0.9, 0.95, 1.0) * max(b - 0.75, 0.0) * 0.45, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// `n` points of an image's ink, more where it is brighter: [{ u, v, flow }] (u right, v down,
// 0 to 1; flow: when the ink gets there, by `flow`)
export function inkPoints(image, flow, n, random = Math.random) {
  const { ink, w, h } = image.small, out = [];
  for (let tries = 0; out.length < n && tries < n * 200; tries++) {
    const x = Math.floor(random() * w), y = Math.floor(random() * h), b = ink[y * w + x];
    if (b > 0.12 && random() < b) out.push({ u: (x + random()) / w, v: (y + random()) / h, flow: flow[y * w + x] });
  }
  return out;
}

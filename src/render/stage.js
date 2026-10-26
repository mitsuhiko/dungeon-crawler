// The dark stage the glass bird stands on (game/splash.js), and the films play on (film/player.js):
// black, one narrow light from above, a little mist, a black floor that mirrors, faceted glass in
// it. Everything here is drawn by shaders of its own (no three.js lights): the glass mirrors a
// made-up room, the light is a cone of numbers. The scene is drawn into a float target and onto
// the screen by finishMesh, dithered (dark gradients would band in 8 bits).
//
// The pieces share a set of uniforms (stageUniforms): where the light is and how bright (it
// flashes, it dims), the amber core's glow on the glass around it.
import * as THREE from 'three';

export const NOISE = /* glsl */`
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }`;

// the uniforms every piece of a stage shares: the light (where, how bright: uLevel, and a flash
// on top; how wide its cone is: uCone, the cosines where it starts and is full), the amber core
// (where, how much it glows on the glass)
export const stageUniforms = ({ light, core = new THREE.Vector3(0, -10, 0), amber = new THREE.Color('#ffa040'), cone = [0.86, 0.97] }) => ({
  uLight: { value: light }, uLevel: { value: 1 }, uFlash: { value: 0 }, uCone: { value: new THREE.Vector2(...cone) },
  uCore: { value: core }, uCoreGlow: { value: 0 }, uAmber: { value: amber },
});

// Glass, premultiplied: it darkens what is behind it a little (`opacity`, more at grazing
// angles) and adds what it reflects and lets through. Each flat facet mirrors a made-up room:
// the light's bright disc straight above, a faint band of lit mist at the horizon, the dark
// everywhere else; so facets turned up flash bright and the others stay dark, as cut glass
// does. On top: a hard glint where a facet turns the light into your eye, thin edges along the
// facets, and the amber core shining through.
//
// box: a glass box of this half size instead of facets (film/glass.js): its edges are the box's
// (an attribute `local`, where on the box each corner was), and it can be cut off above
// uniform uCut (in the box's own height), with a bright seam there, as it grows; and cracked
// (uCrack, how bright: a jagged crack round it, across the plane uCrackN goes through).
export function glassMaterial(u, color, { opacity = 0.2, edge = 1, side = THREE.FrontSide, spec = 1, reflect = 1, box = 0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...u, uTint: { value: color }, uOpacity: { value: opacity }, uEdge: { value: edge }, uSpec: { value: spec },
      uReflect: { value: reflect }, uHalf: { value: box }, uCut: { value: 1e6 }, uFade: { value: 1 },
      uCrack: { value: 0 }, uCrackN: { value: new THREE.Vector3(0.3, 1, 0.2).normalize() } },
    defines: box ? { BOX: 1 } : {},
    vertexShader: /* glsl */`
      #ifdef BOX
      attribute vec3 local;
      varying vec3 vLocal;
      #else
      attribute vec3 bary;
      varying vec3 vBary;
      #endif
      varying vec3 vWorld, vNormal;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz; vNormal = normalize(mat3(modelMatrix) * normal);
        #ifdef BOX
        vLocal = local;
        #else
        vBary = bary;
        #endif
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight, uTint, uCore, uAmber;
      uniform vec2 uCone;
      uniform float uLevel, uFlash, uCoreGlow, uOpacity, uEdge, uSpec, uReflect, uHalf, uCut, uFade, uCrack;
      uniform vec3 uCrackN;
      varying vec3 vWorld, vNormal;
      ${NOISE}
      #ifdef BOX
      varying vec3 vLocal;
      #else
      varying vec3 vBary;
      #endif
      void main() {
        #ifdef BOX
        if (vLocal.y > uCut) discard;
        #endif
        vec3 N = normalize(vNormal), V = normalize(cameraPosition - vWorld);
        if (!gl_FrontFacing) N = -N;
        float ndv = abs(dot(N, V)), fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
        vec3 toL = uLight - vWorld, L = normalize(toL), H = normalize(L + V);
        // the light is a narrow cone straight down: how much of it reaches here
        float cone = smoothstep(uCone.x, uCone.y, dot(-L, vec3(0.0, -1.0, 0.0))) / (1.0 + 0.05 * dot(toL, toL));
        float lit = uLevel * (cone + 0.04) * (1.0 + uFlash) * (0.6 + 0.4 * smoothstep(-0.05, 0.4, vWorld.y));
        vec3 R = reflect(-V, N);
        float room = 1.7 * smoothstep(0.6, 0.93, R.y) + 0.3 * exp(-(R.y - 0.06) * (R.y - 0.06) / 0.01) + 0.05;
        float glint = pow(max(dot(N, H), 0.0), 140.0) * 2.2 * uSpec;
        #ifdef BOX
        // how near the box's edges: where two of the coordinates are at the box's side
        vec3 q = uHalf - abs(vLocal);
        float b = q.x + q.y + q.z - min(q.x, min(q.y, q.z)) - max(q.x, max(q.y, q.z));
        float edge = (1.0 - smoothstep(0.0, max(fwidth(b) * 1.5, uHalf * 0.025), b)) * uEdge;
        #else
        float b = min(min(vBary.x, vBary.y), vBary.z);
        float edge = (1.0 - smoothstep(0.0, fwidth(b) * 1.2, b)) * uEdge;
        #endif
        float a = clamp(uOpacity + 0.35 * fres, 0.0, 1.0);
        vec3 through = uTint * (0.16 + 0.55 * max(dot(N, L), 0.0)) * a;
        vec3 col = (through + mix(vec3(1.0), uTint, 0.45) * room * (0.2 + 0.8 * fres) * uReflect) * lit;
        col += vec3(1.0, 0.98, 0.94) * glint * lit;
        col += mix(uTint, vec3(1.0), 0.6) * edge * (0.05 + 0.35 * room * (0.3 + fres)) * lit;
        float d = distance(vWorld, uCore);
        col += uAmber * uCoreGlow * exp(-d * d / 0.007) * (0.15 + 0.45 * ndv) * uLevel;
        #ifdef BOX
        // the seam where it grows: bright, the glass still molten
        float seam = uCut < uHalf ? exp(-pow((uCut - vLocal.y) / (uHalf * 0.06), 2.0)) * (1.0 - abs(N.y)) : 0.0;
        col += vec3(0.85, 0.95, 1.0) * seam * 1.6;
        a = max(a, seam * 0.5);
        // a box has few facets to catch the light: its edges, and a plain shade (lit from above
        // and a little from the front left: its sides differ) carry it
        float key = max(dot(N, normalize(vec3(-0.45, 0.8, 0.4))), 0.0);
        float top = max(N.y, 0.0);
        col += mix(uTint, vec3(1.0), 0.7) * edge * 0.5 * lit;
        col += uTint * (0.03 + 0.2 * key * key + 0.25 * top) * lit * (0.4 + 0.6 * a);
        // the crack: a jagged line round the box, and a branch off it
        if (uCrack > 0.0) {
          vec3 p = vLocal / uHalf;
          float c1 = dot(p, uCrackN) + (fbm(p.xz * 3.0 + p.y * 2.0) - 0.5) * 0.5;
          float c2 = dot(p, normalize(uCrackN.zxy + vec3(0.4, 0.0, 0.0))) - 0.35 + (fbm(p.yz * 4.0 + 7.0) - 0.5) * 0.4;
          float w = max(fwidth(c1) * 1.2, 0.012);
          float crack = (1.0 - smoothstep(0.0, w, abs(c1))) + 0.7 * (1.0 - smoothstep(0.0, w, abs(c2))) * step(0.0, c1);
          crack *= uCrack;
          col += vec3(0.9, 0.97, 1.0) * crack * (0.25 + 0.9 * lit + 0.8 * uFlash);
          a = max(a, min(crack, 1.0) * 0.5);
        }
        #endif
        gl_FragColor = vec4(col, a) * uFade;
      }`,
    side, transparent: true, premultipliedAlpha: true, depthWrite: false,
  });
}

// flat facets, and each corner's barycentric coordinate for the edges
export function facets(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g.computeVertexNormals();
  const n = g.attributes.position.count, bary = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) bary[i * 3 + (i % 3)] = 1;
  g.setAttribute('bary', new THREE.BufferAttribute(bary, 3));
  return g;
}

// the glass of one piece: its back faces first (dimmer), then its front ones
export function glassMeshes(u, geometry, color, opts, order) {
  const back = new THREE.Mesh(geometry, glassMaterial(u, color, { ...opts, side: THREE.BackSide, opacity: (opts.opacity ?? 0.2) * 0.6,
    spec: 0.4, reflect: 0.45, edge: (opts.edge ?? 1) * 0.4 }));
  const front = new THREE.Mesh(geometry, glassMaterial(u, color, opts));
  back.renderOrder = order; front.renderOrder = order + 1;
  return [back, front];
}

// a soft round glow (the core's)
export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// the black floor: it lets a little of what is mirrored under it through, most near the light's
// pool (at `pool`: x, z; `spread`: how wide)
export function floorMesh(u, pool = [0.05, 0.04], spread = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShaderMaterial({
    uniforms: { uLevel: u.uLevel, uFlash: u.uFlash, uPool: { value: new THREE.Vector2(...pool) }, uSpread: { value: spread } },
    vertexShader: /* glsl */`varying vec3 vWorld; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uLevel, uFlash, uSpread; uniform vec2 uPool; varying vec3 vWorld;
      ${NOISE}
      void main() {
        float r = length(vWorld.xz - uPool) / uSpread;
        float pool = exp(-r * r / 0.18) * 0.11 * uLevel * (1.0 + uFlash);
        float grain = fbm(vWorld.xz * 9.0) * 0.5 + 0.5;
        float a = mix(0.7, 1.0, smoothstep(0.2, 2.2, r));
        gl_FragColor = vec4(vec3(0.62, 0.7, 0.72) * pool * grain / a, a);
      }`,
    transparent: true, depthWrite: false,
  }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 5;
  return m;
}

// the light's beam, a faint cone of lit mist from above (under the light, uLight), `radius` wide
// at the floor
export function beamMesh(u, radius = 0.62) {
  const h = 3.1;
  const g = new THREE.ConeGeometry(radius, h, 48, 1, true);
  g.translate(0, h / 2, 0);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: { uLevel: u.uLevel, uFlash: u.uFlash, uTime: { value: 0 } },
    vertexShader: /* glsl */`varying vec3 vWorld, vNormal; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vNormal = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uLevel, uFlash, uTime; varying vec3 vWorld, vNormal;
      ${NOISE}
      void main() {
        float ndv = abs(dot(normalize(vNormal), normalize(cameraPosition - vWorld)));
        float n = fbm(vec2(vWorld.x * 2.2 + uTime * 0.05, vWorld.y * 1.3 - uTime * 0.08));
        float along = smoothstep(3.1, 1.6, vWorld.y) * smoothstep(-0.1, 0.5, vWorld.y);
        float a = pow(ndv, 2.0) * along * (0.35 + 0.9 * n) * 0.06 * uLevel * (1.0 + 0.6 * uFlash);
        gl_FragColor = vec4(vec3(0.78, 0.88, 0.92) * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  m.position.copy(u.uLight.value).setY(0);
  m.renderOrder = 30;
  return m;
}

// a sheet of drifting mist, facing the camera (lit most near `lit`: x, z; `spread`: how far)
export function mistMesh(u, w, h, strength, speed, seed, lit = [0.1, 0.0], spread = 1) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({
    uniforms: { uLevel: u.uLevel, uTime: { value: 0 }, uStrength: { value: strength }, uSpeed: { value: speed }, uSeed: { value: seed },
      uLit: { value: new THREE.Vector2(...lit) }, uSpread: { value: spread } },
    vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vWorld; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uLevel, uTime, uStrength, uSpeed, uSeed, uSpread; uniform vec2 uLit; varying vec2 vUv; varying vec3 vWorld;
      ${NOISE}
      void main() {
        vec2 p = vUv * vec2(3.0, 1.6) + vec2(uSeed, uSeed * 0.7);
        float n = fbm(p + vec2(uTime * uSpeed, uTime * uSpeed * 0.3) + fbm(p * 1.7 - uTime * 0.03));
        float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
        float d = length(vWorld.xz - uLit) / uSpread;
        float lit = 0.25 + exp(-d * d / 0.6);
        float a = smoothstep(0.35, 0.9, n) * edge * lit * uStrength * uLevel;
        gl_FragColor = vec4(vec3(0.6, 0.68, 0.72) * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
}

// sparks, dust and motes: points with a colour, a size and a life of their own (the geometry's
// attributes position, color, alpha, size; set uScale to the screen's height over the tangent of
// half the camera's field of view, so `size` is in world units)
export function pointCloud(n) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: /* glsl */`
      attribute vec3 color; attribute float alpha, size; uniform float uScale; varying vec3 vColor; varying float vAlpha;
      void main() {
        vColor = color; vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, size * uScale / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor; varying float vAlpha;
      void main() { vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(q)) * vAlpha; gl_FragColor = vec4(vColor * a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = 25;
  return p;
}

// onto the screen: the picture darkened towards its edges (a vignette) and by `uDark` (the fades
// to black), with a little noise of about one step of 8 bits (a triangular distribution, moving
// each frame) so the dark gradients do not band
export function finishMesh(texture) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { tScene: { value: texture }, uDark: { value: 1 }, uSeed: { value: 0 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tScene; uniform float uDark, uSeed; varying vec2 vUv;
      float rand(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec3 c = texture2D(tScene, vUv).rgb;
        float d = length((vUv - vec2(0.5, 0.45)) / vec2(0.5, 0.55)) * 0.7071;
        c *= mix(1.0, 0.35, smoothstep(0.45, 1.0, d)) * (1.0 - uDark);
        vec2 p = gl_FragCoord.xy + uSeed * 97.0;
        c += (rand(p) + rand(p + vec2(17.3, 5.1)) - 1.0) / 255.0;
        gl_FragColor = vec4(max(c, 0.0), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  }));
  m.frustumCulled = false;
  return m;
}

// A renderer of its own on `canvas`, drawing into a multisampled float target and from there
// onto the screen through finishMesh: { renderer, target, finish, resize(camera), draw(scene,
// camera, dark), dispose() }. null: no WebGL.
export function stageRenderer(canvas) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); } catch { return null; }
  renderer.setClearColor(0x000000, 1);
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const finish = finishMesh(target.texture), finishScene = new THREE.Scene(), finishCamera = new THREE.Camera();
  finishScene.add(finish);
  return {
    renderer, target, finish,
    resize(camera) {
      const w = innerWidth, h = innerHeight;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      const px = renderer.getDrawingBufferSize(new THREE.Vector2());
      target.setSize(px.x, px.y);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    // the scene into the target (`passes`: a function drawing it, or the scene and camera), then
    // onto the screen, `dark` of the way to black
    draw(passes, dark) {
      renderer.setRenderTarget(target);
      passes();
      renderer.setRenderTarget(null);
      finish.material.uniforms.uDark.value = dark;
      finish.material.uniforms.uSeed.value = (finish.material.uniforms.uSeed.value + 0.618) % 1;
      renderer.render(finishScene, finishCamera);
    },
    dispose(scene) {
      scene?.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
      target.dispose(); finish.geometry.dispose(); finish.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

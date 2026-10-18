// GPU projection painting: rasterise the body's posed triangles into their UV atlas,
// project each texel into the editor camera, and depth-test against the visible body.
// A single screen-space stroke therefore crosses UV seams without extra raycasts and
// never paints through the body onto its back. No per-vertex colour data is used.
import * as THREE from 'three';
import { SKIN_SIZE, fillTexture, textureComponents, padTexture, linearPaintToPNG } from '../core/skin.js';

const vertexShader = `
  uniform mat4 viewProjection;
  attribute float gutter;
  varying vec4 projected;
  varying float isGutter;
  void main() {
    projected = viewProjection * vec4(position, 1.0);
    isGutter = gutter;
    gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
  }
`;
const fragmentShader = `
  uniform sampler2D visibleDepth;
  uniform vec2 viewport, startPoint, endPoint;
  uniform float radius;
  uniform vec3 ink;
  uniform bool maskOnly;
  varying vec4 projected;
  varying float isGutter;
  void main() {
    if (maskOnly) {
      if (isGutter > 0.5) discard;
      gl_FragColor = vec4(1.0); return;
    }
    if (projected.w <= 0.0) discard;
    vec3 ndc = projected.xyz / projected.w;
    vec2 screenUV = ndc.xy * 0.5 + 0.5;
    if (any(lessThan(screenUV, vec2(0.0))) || any(greaterThan(screenUV, vec2(1.0)))) discard;
    float depth = texture2D(visibleDepth, screenUV).x;
    if (abs(ndc.z * 0.5 + 0.5 - depth) > 0.00002) discard;
    vec2 p = screenUV * viewport;
    vec2 segment = endPoint - startPoint;
    float t = clamp(dot(p - startPoint, segment) / max(dot(segment, segment), 0.0001), 0.0, 1.0);
    float distanceToStroke = length(p - mix(startPoint, endPoint, t));
    float coverage = 1.0 - smoothstep(max(0.0, radius - 0.5), radius + 0.5, distanceToStroke);
    if (coverage <= 0.0) discard;
    gl_FragColor = vec4(ink, coverage);
  }
`;

// Padding strips keep linear texture filtering from exposing the unpainted clay at
// island borders. They repeat the boundary's surface position, not adjacent atlas paint.
function atlasGeometry(pickers) {
  const positions = [], uvs = [], gutters = [], edges = new Map();
  const p = new THREE.Vector3(), uv = new THREE.Vector2();
  const append = (points, coords, gutter) => {
    for (let i = 0; i < 3; i++) { positions.push(...points[i]); uvs.push(...coords[i]); gutters.push(gutter); }
  };
  for (const picker of pickers) {
    const g = picker.geometry, index = g.index, count = index?.count ?? g.attributes.position.count;
    for (let i = 0; i < count; i += 3) {
      const points = [], coords = [];
      for (let j = 0; j < 3; j++) {
        const v = index ? index.getX(i + j) : i + j;
        points.push(p.fromBufferAttribute(g.attributes.position, v).applyMatrix4(picker.matrixWorld).toArray());
        coords.push(uv.fromBufferAttribute(g.attributes.uv, v).toArray());
      }
      append(points, coords, 0);
      for (let j = 0; j < 3; j++) {
        let a = points[j], b = points[(j + 1) % 3], ua = coords[j], ub = coords[(j + 1) % 3];
        const keyOf = v => v.map(n => Math.round(n * 100000)).join(',');
        let ka = keyOf(a), kb = keyOf(b);
        if (ka > kb) { [a, b] = [b, a]; [ua, ub] = [ub, ua]; [ka, kb] = [kb, ka]; }
        const key = `${ka}/${kb}`;
        if (!edges.has(key)) edges.set(key, []);
        edges.get(key).push({ a, b, ua, ub, centre: [0, 1].map(axis => coords.reduce((sum, c) => sum + c[axis], 0) / 3) });
      }
    }
  }
  const seams = [];
  for (const list of edges.values()) {
    if (list.length === 2 && list[0].ua.every((v, i) => Math.abs(v - list[1].ua[i]) < 1e-7)
        && list[0].ub.every((v, i) => Math.abs(v - list[1].ub[i]) < 1e-7)) continue;
    if (list.length === 2) seams.push(list);
    for (const edge of list) {
      const { a, b, ua, ub, centre } = edge;
      const dx = ub[0] - ua[0], dy = ub[1] - ua[1], length = Math.hypot(dx, dy);
      if (!length) continue;
      let nx = -dy / length, ny = dx / length;
      if (nx * (centre[0] - ua[0]) + ny * (centre[1] - ua[1]) > 0) { nx = -nx; ny = -ny; }
      edge.outward = [nx, ny];
      const outer = v => [v[0] + nx * 3 / SKIN_SIZE, v[1] + ny * 3 / SKIN_SIZE];
      append([a, b, b], [ua, ub, outer(ub)], 1);
      append([a, b, a], [ua, outer(ub), outer(ua)], 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('gutter', new THREE.Float32BufferAttribute(gutters, 1));
  return { geometry, seams };
}

export class SkinPainter {
  constructor(renderer, pickers) {
    this.renderer = renderer;
    this.size = SKIN_SIZE;
    this.target = new THREE.WebGLRenderTarget(this.size, this.size, { depthBuffer: false, generateMipmaps: false });
    this.target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.depth = new THREE.WebGLRenderTarget(1, 1);
    this.depth.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.depthScene = new THREE.Scene();
    this.depthScene.add(...pickers);
    this.camera = new THREE.Camera();
    const { geometry, seams } = atlasGeometry(pickers);
    this.seams = seams;
    this.material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, side: THREE.DoubleSide, depthTest: false, depthWrite: false,
      transparent: true, blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      uniforms: {
        viewProjection: { value: new THREE.Matrix4() }, visibleDepth: { value: this.depth.depthTexture },
        viewport: { value: new THREE.Vector2() }, startPoint: { value: new THREE.Vector2() },
        endPoint: { value: new THREE.Vector2() }, radius: { value: 1 }, ink: { value: new THREE.Color() },
        maskOnly: { value: false },
      },
    });
    const mesh = new THREE.Mesh(geometry, this.material); mesh.frustumCulled = false;
    this.atlasScene = new THREE.Scene(); this.atlasScene.add(mesh);
    this.geometry = geometry;
    this.copyScene = new THREE.Scene();
    this.copyMaterial = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { source: { value: null }, straightAlpha: { value: false } },
      vertexShader: 'varying vec2 texUV; void main(){texUV=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: 'uniform sampler2D source; uniform bool straightAlpha; varying vec2 texUV; void main(){vec4 c=texture2D(source,texUV);gl_FragColor=vec4(straightAlpha ? c.rgb*c.a : c.rgb,c.a);}',
    });
    this.copyGeometry = new THREE.PlaneGeometry(2, 2);
    this.copyScene.add(new THREE.Mesh(this.copyGeometry, this.copyMaterial));
    this.clear();
  }
  get texture() { return this.target.texture; }
  clear() {
    const r = this.renderer, color = r.getClearColor(new THREE.Color()), alpha = r.getClearAlpha();
    r.setRenderTarget(this.target); r.setClearColor(0, 0); r.clear(); r.setRenderTarget(null); r.setClearColor(color, alpha);
  }
  copy(texture, straightAlpha = false) {
    this.copyMaterial.uniforms.source.value = texture;
    this.copyMaterial.uniforms.straightAlpha.value = straightAlpha;
    const r = this.renderer;
    r.setRenderTarget(this.target); r.render(this.copyScene, this.camera); r.setRenderTarget(null);
    this.copyMaterial.uniforms.source.value = null;
  }
  updateView(camera, width, height) {
    this.material.uniforms.viewProjection.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.material.uniforms.viewport.value.set(width, height);
    // Depth only needs display resolution, not the 2048² atlas resolution.
    const w = Math.ceil(width), h = Math.ceil(height);
    if (this.depth.width !== w || this.depth.height !== h) this.depth.setSize(w, h);
    const r = this.renderer;
    r.setRenderTarget(this.depth); r.render(this.depthScene, camera); r.setRenderTarget(null);
  }
  stroke(from, to, radius, color, erase = false) {
    const u = this.material.uniforms;
    u.startPoint.value.set(from.x, from.y); u.endPoint.value.set(to.x, to.y);
    u.radius.value = radius; u.ink.value.set(color);
    this.material.blendSrc = erase ? THREE.ZeroFactor : THREE.SrcAlphaFactor;
    this.material.blendSrcAlpha = erase ? THREE.ZeroFactor : THREE.OneFactor;
    const r = this.renderer, auto = r.autoClear;
    r.autoClear = false; r.setRenderTarget(this.target);
    r.render(this.atlasScene, this.camera); r.setRenderTarget(null); r.autoClear = auto;
  }
  async pixels() {
    const pixels = new Uint8Array(this.size * this.size * 4);
    await this.renderer.readRenderTargetPixelsAsync(this.target, 0, 0, this.size, this.size, pixels);
    return pixels;
  }
  async fill(uv, color) {
    if (!this.mask) await this.makeMask();
    const pixels = await this.pixels(), c = new THREE.Color(color);
    const seed = Math.min(this.size - 1, Math.floor(uv.y * this.size)) * this.size + Math.min(this.size - 1, Math.floor(uv.x * this.size));
    const changed = fillTexture(pixels, this.size, this.size, this.mask, this.seamLinks, seed,
      [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255], this.components);
    if (changed <= 0) return changed;
    padTexture(pixels, this.size, this.size, this.mask);
    const texture = new THREE.DataTexture(pixels, this.size, this.size);
    texture.needsUpdate = true; this.copy(texture); texture.dispose();
    return changed;
  }
  async makeMask() {
    const r = this.renderer, target = new THREE.WebGLRenderTarget(this.size, this.size, { depthBuffer: false });
    this.material.uniforms.maskOnly.value = true;
    const blending = this.material.blending;
    this.material.blending = THREE.NoBlending;
    const clear = r.getClearColor(new THREE.Color()), alpha = r.getClearAlpha();
    r.setClearColor(0, 0);
    r.setRenderTarget(target); r.render(this.atlasScene, this.camera); r.setRenderTarget(null);
    r.setClearColor(clear, alpha);
    this.material.uniforms.maskOnly.value = false;
    this.material.blending = blending;
    const data = new Uint8Array(this.size * this.size * 4);
    await r.readRenderTargetPixelsAsync(target, 0, 0, this.size, this.size, data); target.dispose();
    this.mask = new Uint8Array(this.size * this.size);
    for (let i = 0; i < this.mask.length; i++) this.mask[i] = data[i * 4 + 3] > 0 ? 1 : 0;
    this.seamLinks = new Map();
    const add = (a, b) => {
      if (a < 0 || b < 0 || !this.mask[a] || !this.mask[b]) return;
      if (!this.seamLinks.has(a)) this.seamLinks.set(a, []);
      this.seamLinks.get(a).push(b);
    };
    const pixel = (edge, t) => {
      const nx = edge.outward[0], ny = edge.outward[1];
      const x = Math.floor((edge.ua[0] * (1-t) + edge.ub[0] * t) * this.size - nx * .75);
      const y = Math.floor((edge.ua[1] * (1-t) + edge.ub[1] * t) * this.size - ny * .75);
      return x < 0 || x >= this.size || y < 0 || y >= this.size ? -1 : y * this.size + x;
    };
    for (const [a, b] of this.seams) {
      const length = e => Math.hypot(e.ub[0]-e.ua[0], e.ub[1]-e.ua[1]) * this.size;
      const steps = Math.ceil(Math.max(length(a), length(b)) * 2);
      for (let i = 0; i <= steps; i++) { const x = pixel(a, i / steps), y = pixel(b, i / steps); add(x, y); add(y, x); }
    }
    this.components = textureComponents(this.size, this.size, this.mask, this.seamLinks);
  }
  async png() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = this.size;
    const pixels = linearPaintToPNG(await this.pixels(), this.size, this.size);
    canvas.getContext('2d').putImageData(new ImageData(pixels, this.size, this.size), 0, 0);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png'));
  }
  dispose() {
    this.target.dispose(); this.depth.dispose(); this.geometry.dispose(); this.material.dispose();
    this.copyGeometry.dispose(); this.copyMaterial.dispose();
  }
}

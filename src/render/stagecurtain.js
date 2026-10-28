// Mansk's curtain (his intro, game/bossreveals.js; docs/bosses.md "The intro"): a theatre's red
// velvet curtain across his stage from wall to wall (core/mansk.js curtainLine), two halves
// meeting in front of him under a pelmet of swags with a gold fringe, between two gilded posts,
// taller than he is. Shut while the hero comes in; in his intro each half is drawn to its wall,
// gathering into deeper and deeper folds, its hem trailing (core/mansk.js curtainOpen); it goes
// while the black bars are shut for the cut back to the game's camera. Lit by the stage: the
// footlights glow up it from below and the spotlight lays a circle of light on it, both added to
// its colour, so it shows in the dark the intro makes. Made on first use, again for another stage.
import * as THREE from 'three';
import { scene } from './scene.js';

const TOP = 4.85;                       // cells up the curtain hangs from (behind the pelmet)
const PELMET = [4.4, 5.2];              // the pelmet's lowest point (a swag's middle) and its top
const SWAG = 1.6, POST = 0.32, FOLD = 0.42, NC = 56;   // a swag's width, a post's, a fold's (cells); columns a half
// the heights of a half's rows: its hem a band of gold at the bottom
const ROWS = [0.02, 0.12, 0.125, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6, 4.0, 4.4, TOP];
const HEM = 2;                          // the rows of the hem's gold band
const VELVET = new THREE.Color('#9a1022'), GOLD = new THREE.Color('#d6a33a'), DARK = new THREE.Color('#5a0612');

let cur = null;   // { key, group, halves, material, uniforms }

// The curtain shut (open(v) 0) or open (1) at v of its height (0: hem, 1: top), along `line`
// (core/mansk.js curtainLine); light: { spot: [x, y, z, r] (the spotlight's circle on it), spotA, footA }
export function showCurtain(line, open, { spot = null, spotA = 0, footA = 1 } = {}) {
  const key = [line.x, line.y, line.z, line.from, line.to, ...line.n].map(v => v.toFixed(3)).join();
  if (cur?.key !== key) { dispose(); cur = build(line, key); }
  cur.group.visible = true;
  const u = cur.uniforms;
  if (spot) u.uSpot.value.set(...spot);
  u.uSpotA.value = spot ? spotA : 0;
  u.uFootA.value = footA;
  u.uFootY.value = line.y;
  for (const h of cur.halves) shape(h, open);
  cur.open = open(0.5);
}
export function hideCurtain() { if (cur) cur.group.visible = false; }
// (the checks, tests/browser/intros.js) how far open it is halfway up; null: not there
export const curtainShown = () => cur?.group.visible ? cur.open : null;

// (to compile its program ahead, render/introfx.js introWarmup: a bit of it, out of the scene)
let warmup = null;
export function curtainWarmup() {
  if (!warmup) {
    const g = new THREE.PlaneGeometry(1, 1);
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(1), 3));
    warmup = new THREE.Mesh(g, velvet().material);
    warmup.receiveShadow = true;   // (as all of it: the same program)
  }
  return [warmup];
}
// the material of all of it: its colour in its vertices, the stage's light added (showCurtain)
function velvet() {
  const uniforms = { uSpot: { value: new THREE.Vector4(0, -100, 0, 1) }, uSpotA: { value: 0 }, uFootA: { value: 1 }, uFootY: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  material.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'varying vec3 vStageWorld;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vStageWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vStageWorld;\nuniform vec4 uSpot; uniform float uSpotA, uFootA, uFootY;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float stageSpot = uSpotA * (1.0 - smoothstep(uSpot.w * 0.55, uSpot.w, distance(vStageWorld, uSpot.xyz)));
  float stageFoot = uFootA * (1.0 - smoothstep(0.0, 2.6, vStageWorld.y - uFootY));
  totalEmissiveRadiance += diffuseColor.rgb * (vec3(1.0, 0.93, 0.8) * stageSpot * 1.7 + vec3(1.0, 0.7, 0.38) * (stageFoot * stageFoot * 0.6 + uFootA * 0.08));`);
  };
  material.customProgramCacheKey = () => 'stagecurtain';
  return { material, uniforms };
}
function build(line, key) {
  const { material, uniforms } = velvet(), group = new THREE.Group();
  group.position.set(line.x, line.y, line.z);
  group.rotation.y = Math.atan2(line.n[0], line.n[1]);   // (its x along line.t, its z towards the hall)
  const halves = [[-1, -line.from], [1, line.to]].filter(([, len]) => len > 0.3).map(([sign, len]) => half(sign, len, material));
  for (const h of halves) group.add(h.mesh);
  group.add(pelmet(line.from - POST, line.to + POST, material), posts(line.from, line.to, material));
  scene.add(group);
  return { key, group, halves, material, uniforms };
}
function dispose() {
  if (!cur) return;
  scene.remove(cur.group);
  cur.group.traverse(o => o.geometry?.dispose());
  cur.material.dispose();
  cur = null;
}

// a half of the curtain, from the middle (x 0) to its wall (x sign * len): its folds and their
// shading fixed (each column's place in the folds), where they stand moved each frame (shape)
function half(sign, len, material) {
  const R = ROWS.length, folds = Math.max(3, Math.round(len / FOLD)), pos = new Float32Array((NC + 1) * R * 3), col = new Float32Array((NC + 1) * R * 3);
  const c = new THREE.Color();
  for (let i = 0; i <= NC; i++) for (let j = 0; j < R; j++) {
    const k = i * R + j, shade = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(i / NC * folds * Math.PI * 2 + 1.2));
    c.copy(j < HEM ? GOLD : VELVET).multiplyScalar(j < HEM ? 0.75 + 0.25 * shade : shade);
    if (i === 0 && j >= HEM) c.copy(DARK);   // (its edge in the middle, in shadow)
    col.set([c.r, c.g, c.b], k * 3);
  }
  const index = [];
  for (let i = 0; i < NC; i++) for (let j = 0; j + 1 < R; j++) {
    if (j + 1 === HEM) continue;   // (the hem's band and the velvet over it: apart, a sharp edge)
    const a = i * R + j, b = a + R;
    index.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
  return { mesh, sign, len, folds, t0: performance.now() };
}
// where a half's cloth stands, `open(v)` of the way to its wall (gathered there, `len` wide only a
// little): the folds deeper the closer it is drawn together, breathing a little while it hangs shut
function shape(h, open) {
  const { sign, len, folds, mesh } = h, R = ROWS.length, pos = mesh.geometry.attributes.position, a = pos.array;
  const gathered = Math.min(0.9, len * 0.18), t = (performance.now() - h.t0) / 1000;
  for (let j = 0; j < R; j++) {
    const v = ROWS[j] / TOP, o = Math.min(1.04, Math.max(0, open(v)));
    const inner = o * (len - gathered), span = len - inner, deep = 0.07 + 0.2 * Math.sqrt(Math.max(0, 1 - (span / len) ** 2));
    for (let i = 0; i <= NC; i++) {
      const w = i / NC, s = inner + w * span, k = (i * R + j) * 3;
      const fold = Math.sin(w * folds * Math.PI * 2), sway = 0.025 * (1 - o) * Math.sin(t * 1.3 + w * 4 + j * 0.15) * (1 - v);
      a[k] = sign * s; a[k + 1] = ROWS[j]; a[k + 2] = deep * fold + sway + (1 - w) * 0.04 * o;
    }
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

// the pelmet over it, from x0 to x1: swags hanging lowest in their middles, their edge a gold
// fringe, a gold band along the top
function pelmet(x0, x1, material) {
  const n = Math.max(2, Math.round((x1 - x0) / SWAG)), cols = n * 12, w = (x1 - x0) / n;
  const pos = [], col = [], index = [];
  const rows = y0 => [[y0, GOLD, 0.8], [y0 + 0.08, GOLD, 1], [y0 + 0.085, VELVET, 0.7], [PELMET[1] - 0.1, VELVET, 1], [PELMET[1] - 0.095, GOLD, 0.9], [PELMET[1], GOLD, 1]];
  for (let i = 0; i <= cols; i++) {
    const x = x0 + (x1 - x0) * i / cols, f = ((x - x0) / w) % 1, low = PELMET[0] + 0.3 * (1 - Math.sin(Math.PI * f));
    rows(low).forEach(([y, c, l]) => {
      pos.push(x, y, 0.42 + 0.05 * Math.sin(f * Math.PI * 2 * 3));
      col.push(c.r * l, c.g * l, c.b * l);
    });
  }
  const R = 6;
  for (let i = 0; i < cols; i++) for (let j = 0; j + 1 < R; j++) {
    if (j === 1 || j === 3) continue;   // (sharp edges between the gold and the velvet)
    const a = i * R + j, b = a + R;
    index.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.frustumCulled = false; m.receiveShadow = true;
  return m;
}
// the two gilded posts at its ends, from the stage to the pelmet's top
function posts(x0, x1, material) {
  const parts = [x0 - POST / 2, x1 + POST / 2].map(x => {
    const g = new THREE.BoxGeometry(POST, PELMET[1] + 0.12, 0.55).translate(x, (PELMET[1] + 0.12) / 2, 0.2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {   // (darker down low, brighter up)
      const l = 0.55 + 0.45 * p.getY(i) / PELMET[1];
      col.set([GOLD.r * l, GOLD.g * l, GOLD.b * l], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    return m;
  });
  const group = new THREE.Group();
  group.add(...parts);
  return group;
}

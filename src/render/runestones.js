// The rune stones (game/runestones.js, docs/map.md): made here, not loaded, in the game's low-poly
// flat-shaded look and the menus' glass (docs/ui.md). A standing stone of dark rock on a low plinth,
// a rune cut into the face it turns to the one who comes to press it, and over its top a cut
// crystal of the bird's teal glass. Asleep the rune is a dull teal and the crystal dark; woken,
// the amber core of the glass lights inside the crystal, the rune glows amber, a ring of light lies
// round its foot and its light shines on what is round it. Each stone's shape and rune come from
// its seed, so it is the same every time it is seen (and for everyone).
//
// buildRunestones (render/world.js buildWorld, with the cube's group, after its lights are taken
// in) makes the cube's stones; tickRunestones (animateWorld) eases each towards awake or asleep and
// moves it; setRunestoneAwake wakes one (game/runestones.js).
import * as THREE from 'three';
import { mulberry32 } from '../core/util.js';
import { trackLight } from './lightpool.js';
import { adoptFade } from './fade.js';

const ROCK = '#3b4746', ROCK_DARK = '#283231', GLASS = '#8fdccd', EDGE = '#c8fff3', CORE = '#ffa640';
const RUNE_ASLEEP = new THREE.Color('#3f7d74'), RUNE_AWAKE = new THREE.Color('#ffb060');
export const STONE_H = 1.2;   // the slab's height (cells, before SCALE), the crystal floats over it
export const SCALE = 1.2;     // the whole stone, a little bigger than a person (it is found from afar)

let halo = null;
function haloTexture() {
  if (halo) return halo;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,.4)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  halo = new THREE.CanvasTexture(c); halo.colorSpace = THREE.SRGBColorSpace;
  return halo;
}

// a box whose corners are pushed about a little (R), then flat shaded: a rough cut stone
function roughBox(w, h, d, R, jitter, taper = 0.8) {
  const geo = new THREE.BoxGeometry(w, h, d, 1, 2, 1).toNonIndexed();
  const pos = geo.attributes.position, moved = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    if (!moved.has(k)) {
      const up = (y + h / 2) / h, s = 1 - (1 - taper) * up;
      moved.set(k, [x * s + (R() - 0.5) * jitter, y + (y > 0 ? (R() - 0.5) * jitter * 2 : 0), z * s + (R() - 0.5) * jitter * 0.6]);
    }
    pos.setXYZ(i, ...moved.get(k));
  }
  geo.computeVertexNormals();
  return geo;
}

// a rune: strokes between the points of a 3 x 3 grid (at least four, all joined), from R
function runeStrokes(R) {
  const pts = [], lines = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) pts.push([i - 1, 1 - j]);
  const near = (a, b) => Math.max(Math.abs(pts[a][0] - pts[b][0]), Math.abs(pts[a][1] - pts[b][1])) === 1;
  let at = 1 + Math.floor(R() * 7);   // (not a corner first)
  const seen = new Set([at]);
  while (lines.length < 4 + Math.floor(R() * 2)) {
    const next = pts.map((_, b) => b).filter(b => near(at, b) && !lines.some(([p, q]) => (p === at && q === b) || (p === b && q === at)));
    if (!next.length) break;
    const b = next[Math.floor(R() * next.length)];
    lines.push([at, b]); seen.add(b);
    at = R() < 0.3 ? [...seen][Math.floor(R() * seen.size)] : b;
  }
  return lines.map(([a, b]) => [pts[a], pts[b]]);
}

// stone s (a placed spot: cubegen/spots.js, its anchor where it stands, facing its approach)
function stoneOf(s) {
  const R = mulberry32(s.seed >>> 0), root = new THREE.Group();
  root.position.set(s.anchor.x, s.anchor.y, s.anchor.z);
  root.rotation.y = s.anchor.yaw ?? 0;
  root.scale.setScalar(SCALE);
  const rock = new THREE.MeshStandardMaterial({ color: ROCK, roughness: 0.92, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: ROCK_DARK, roughness: 0.95, flatShading: true });
  // the plinth: two flat slabs, the lower one wider
  const low = new THREE.Mesh(roughBox(0.86, 0.12, 0.78, R, 0.05, 0.96), dark);
  low.position.y = 0.06; low.rotation.y = (R() - 0.5) * 0.4;
  const high = new THREE.Mesh(roughBox(0.64, 0.12, 0.54, R, 0.04, 0.92), rock);
  high.position.y = 0.17; high.rotation.y = (R() - 0.5) * 0.3;
  // the slab, leaning a touch
  const slab = new THREE.Mesh(roughBox(0.5, STONE_H - 0.23, 0.28, R, 0.06, 0.72), rock);
  slab.position.y = 0.23 + (STONE_H - 0.23) / 2;
  slab.rotation.z = (R() - 0.5) * 0.06;
  for (const m of [low, high, slab]) { m.castShadow = true; m.receiveShadow = true; }
  // the rune on its face (+z), in strokes of light a little proud of the stone
  const glow = new THREE.MeshStandardMaterial({ color: '#1b2a28', emissive: RUNE_ASLEEP.clone(), emissiveIntensity: 0.6, roughness: 0.6, flatShading: true });
  const rune = new THREE.Group();
  const cell = 0.11;
  for (const [[ax, ay], [bx, by]] of runeStrokes(R)) {
    const len = Math.hypot(bx - ax, by - ay) * cell;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.028, len + 0.028, 0.02), glow);
    bar.position.set((ax + bx) / 2 * cell, (ay + by) / 2 * cell, 0);
    bar.rotation.z = Math.atan2(-(bx - ax), by - ay);
    rune.add(bar);
  }
  rune.position.set(0, slab.position.y + 0.12, 0.155);
  rune.rotation.x = -0.05;
  // the crystal over its top: an octahedron of teal glass, stretched, an amber core in it
  const top = STONE_H + 0.25;
  const crystalGeo = new THREE.OctahedronGeometry(0.13, 0);
  crystalGeo.scale(1, 1.6, 1);
  const glass = new THREE.MeshStandardMaterial({ color: GLASS, emissive: '#1d6d63', emissiveIntensity: 0.25, roughness: 0.08, metalness: 0.3,
    flatShading: true, transparent: true, opacity: 0.62, depthWrite: false });
  const crystal = new THREE.Mesh(crystalGeo, glass);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(crystalGeo), new THREE.LineBasicMaterial({ color: EDGE, transparent: true, opacity: 0.55, depthWrite: false }));
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), new THREE.MeshBasicMaterial({ color: CORE, transparent: true, opacity: 0 }));
  const shine = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: CORE, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  shine.scale.setScalar(0.9);
  const gem = new THREE.Group();
  gem.add(core, crystal, edges, shine);
  gem.position.y = top;
  core.renderOrder = 2; crystal.renderOrder = 3; edges.renderOrder = 4; shine.renderOrder = 5;
  // the ring of light at its foot (woken)
  const ringMat = new THREE.MeshBasicMaterial({ color: CORE, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 7), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.025; ring.renderOrder = 900;
  root.add(low, high, slab, rune, gem, ring);
  // its light: a source of the light pool (render/lightpool.js), dark while it sleeps
  const light = new THREE.PointLight('#ffa040', 0, 4.5, 2);
  light.position.set(0, top, 0.2);
  return { id: s.id, obj: root, light, glow, glass, core, shine, ring, gem, top, want: 0, lit: 0, phase: R() * Math.PI * 2 };
}

// the cube's stones (map.spots, kind 'runestone'), added to its group; awake: the ids woken
export function buildRunestones(m, group, awake = null) {
  const out = [];
  for (const s of m.spots || []) {
    if (s.kind !== 'runestone' || !s.anchor) continue;
    const st = stoneOf(s);
    group.add(st.obj);
    adoptFade(group, st.obj);
    trackLight(st.light, st.obj, group);
    if (awake?.has(s.id)) { st.want = st.lit = 1; }
    show(st);
    out.push(st);
  }
  return out;
}

export function setRunestoneAwake(world, id, awake = true) {
  const st = world?.runestones?.find(s => s.id === id);
  if (st) st.want = awake ? 1 : 0;
  return !!st;
}

const tmp = new THREE.Color();
function show(st) {
  const k = st.lit;
  st.glow.emissive.copy(tmp.copy(RUNE_ASLEEP).lerp(RUNE_AWAKE, k));
  st.glow.emissiveIntensity = 0.6 + k * 1.8;
  st.glass.emissive.set(k > 0 ? '#2aa594' : '#1d6d63'); st.glass.emissiveIntensity = 0.25 + k * 0.45;
  st.core.material.opacity = k;
  st.light.intensity = k * 3.2;
}

export function tickRunestones(world, dt, time) {
  for (const st of world?.runestones ?? []) {
    if (st.lit !== st.want) {
      st.lit += Math.sign(st.want - st.lit) * Math.min(Math.abs(st.want - st.lit), dt * 0.8);
      show(st);
    }
    const k = st.lit, t = time + st.phase;
    st.gem.rotation.y = t * (0.3 + k * 0.5);
    st.gem.position.y = st.top + Math.sin(t * 1.6) * 0.03 * (0.3 + k);
    st.shine.material.opacity = k * (0.75 + Math.sin(t * 2.4) * 0.15);
    st.ring.material.opacity = k * (0.45 + Math.sin(t * 1.8) * 0.12);
    st.ring.rotation.z = t * 0.2;
    if (k > 0) st.light.intensity = k * (3 + Math.sin(t * 2.4) * 0.4);
  }
}

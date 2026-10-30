// What is left of the big glass that came down on the town before the game began (docs/story.md "The
// beginning"; world/town.js CRASH: map.relics.shards): shards of the glassmaker's teal
// star-glass strewn over the plaza round a scorched patch, some lying flat, some stuck in the
// cobbles, a few with an amber glint still in them. Made here, not loaded, in the glass of his
// bubbles (render/glassbubble.js). Nothing to take or click: only to see that something happened.
// game/intro.js puts them into the town's world as it is built, and dims their glow once the
// robot is awake (the beginning has gone on).
import * as THREE from 'three';
import { mulberry32, hash32 } from '../core/util.js';

const GLASS = '#8fdccd', EDGE = '#c8fff3', CORE = '#ffa640';
const COUNT = 28;           // shards
const RING = [0.35, 1.7];   // cells from the middle they lie at
let halo = null, scorch = null;
function canvasTexture(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const haloTexture = () => halo ??= canvasTexture(g => {
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,.4)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
});
const scorchTexture = () => scorch ??= canvasTexture(g => {
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(26,20,16,.75)'); grd.addColorStop(0.55, 'rgba(34,26,20,.45)'); grd.addColorStop(1, 'rgba(40,30,22,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
});

// a shard: a thin, uneven three- or four-sided blade of glass, its tip at +y
function shardGeometry(R) {
  const w = 0.06 + R() * 0.1, h = 0.14 + R() * 0.34, t = 0.014 + R() * 0.014, sides = R() < 0.5 ? 3 : 4;
  const base = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + R() * 0.6;
    base.push([Math.cos(a) * w * (0.6 + R() * 0.5), Math.sin(a) * t * 2]);
  }
  const tip = [(R() - 0.5) * w, h, (R() - 0.5) * t];
  const pos = [];
  for (let i = 0; i < sides; i++) {
    const a = base[i], b = base[(i + 1) % sides];
    pos.push(a[0], 0, a[1], b[0], 0, b[1], ...tip);
  }
  for (let i = 1; i + 1 < sides; i++) pos.push(base[0][0], 0, base[0][1], base[i + 1][0], 0, base[i + 1][1], base[i][0], 0, base[i][1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// The shards round (x, y, z) (the plaza's floor there), from seed: a group whose userData.glow(k)
// sets how much the amber glints still glow (1: fresh, 0.3: dimmed)
export function plazaShards(x, y, z, seed) {
  const R = mulberry32(hash32(seed ^ 0x5a4d5));
  const root = new THREE.Group();
  root.position.set(x, y, z);
  const glass = new THREE.MeshStandardMaterial({ color: GLASS, emissive: '#2aa594', emissiveIntensity: 0.5, roughness: 0.08,
    metalness: 0.3, flatShading: true, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false });
  const edges = new THREE.LineBasicMaterial({ color: EDGE, transparent: true, opacity: 0.55, depthWrite: false });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.012; ground.renderOrder = 1;
  root.add(ground);
  for (let i = 0; i < COUNT; i++) {
    const geo = shardGeometry(R), m = new THREE.Mesh(geo, glass);
    const a = R() * Math.PI * 2, d = RING[0] + Math.sqrt(R()) * (RING[1] - RING[0]);
    m.position.set(Math.cos(a) * d, 0.005, Math.sin(a) * d);
    // stuck in the cobbles, leaning out from the middle; or fallen flat
    const stuck = R() < 0.45;
    m.rotation.set(stuck ? (R() - 0.5) * 0.9 : Math.PI / 2 - R() * 0.25, R() * Math.PI * 2, stuck ? (R() - 0.5) * 0.9 : (R() - 0.5) * 0.4, 'YXZ');
    if (!stuck) m.position.y = 0.012;
    m.renderOrder = 2;
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edges);
    m.add(lines);
    root.add(m);
  }
  // a few amber glints in the biggest pieces, pulsing slowly
  const glints = [];
  const glintMat = () => new THREE.SpriteMaterial({ map: haloTexture(), color: CORE, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(glintMat()), a = R() * Math.PI * 2, d = RING[0] + R() * (RING[1] - RING[0]) * 0.8;
    s.position.set(Math.cos(a) * d, 0.06 + R() * 0.08, Math.sin(a) * d);
    s.scale.setScalar(0.22 + R() * 0.18);
    s.userData.phase = R() * Math.PI * 2;
    s.renderOrder = 3;
    root.add(s); glints.push(s);
  }
  let glow = 1;
  root.userData.glow = k => { glow = k; };
  root.userData.tick = t => { for (const s of glints) s.material.opacity = glow * (0.45 + 0.35 * Math.sin(t * 1.3 + s.userData.phase)); };
  return root;
}

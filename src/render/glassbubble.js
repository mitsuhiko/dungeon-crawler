// The glassmaker's glass (core/intro.js): a bubble of star-glass the size of a head, floating over
// the town's plaza. Made here, not loaded: the bird's teal glass (blender/glassbird.py, docs/ui.md)
// cut in big flat facets, its edges catching the light, and in it a small amber core that glows,
// with a soft halo round it, so it reads from the game's camera far off. render/loot.js draws it
// like a quest's thing (GLASS_VIEW: its view, not an item), floating, bobbing and turning slowly.
import * as THREE from 'three';

export const GLASS_VIEW = 'story_glass';
const R = 0.26;                                   // its radius (cells)
const GLASS = '#8fdccd', EDGE = '#c8fff3', CORE = '#ffa640';

let halo = null;
function haloTexture() {
  if (halo) return halo;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  halo = new THREE.CanvasTexture(c); halo.colorSpace = THREE.SRGBColorSpace;
  return halo;
}

// the bubble, centred on its middle: a group with userData { half, scale, size } as render/loot.js
// wants of a pickup's view. Its parts share nothing with the cube's (userData.keep, sharedGeo: a
// cube going leaves them alone)
export function glassBubble() {
  const geo = new THREE.IcosahedronGeometry(R, 1);
  const keep = m => { m.userData.keep = true; return m; };
  const inside = keep(new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.15, metalness: 0, flatShading: true,
    transparent: true, opacity: 0.22, side: THREE.BackSide, depthWrite: false }));
  const outside = keep(new THREE.MeshStandardMaterial({ color: GLASS, emissive: '#2aa594', emissiveIntensity: 0.55, roughness: 0.06,
    metalness: 0.3, flatShading: true, transparent: true, opacity: 0.6, depthWrite: false }));
  outside.name = inside.name = 'glass_glow';   // (render/loot.js keeps its own light)
  const edges = keep(new THREE.LineBasicMaterial({ color: EDGE, transparent: true, opacity: 0.8, depthWrite: false }));
  const core = keep(new THREE.MeshBasicMaterial({ color: CORE }));
  const glow = keep(new THREE.SpriteMaterial({ map: haloTexture(), color: CORE, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  const root = new THREE.Group();
  const shared = o => { o.userData.sharedGeo = true; return o; };
  const back = shared(new THREE.Mesh(geo, inside)), front = shared(new THREE.Mesh(geo, outside));
  const lines = shared(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edges));
  const heart = shared(new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.3, 0), core));
  const light = shared(new THREE.Sprite(glow));
  light.scale.setScalar(R * 2.4);
  back.renderOrder = 1; heart.renderOrder = 2; front.renderOrder = 3; lines.renderOrder = 4; light.renderOrder = 5;
  front.castShadow = true;
  root.add(back, heart, front, lines, light);
  const wrap = new THREE.Group();
  wrap.add(root);
  wrap.userData.half = R; wrap.userData.scale = 1;
  wrap.userData.size = new THREE.Vector3(2 * R, 2 * R, 2 * R);
  return wrap;
}

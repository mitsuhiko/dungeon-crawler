// Cube-local glass boxes move and fade with the full cube and its proxies. Side panes can
// disappear independently; the outline still shows that these are separate simulation spaces.
// The player always looks through this box, so it stays faint where it crosses the play
// area and spends what little it has at the box's own corners and rims:
//   - edges are thin strips widened on screen (WebGL lines are always 1px and alias), soft at
//     their sides, a little stronger near the corners of the box's outline than along their
//     middle, and fainter still inside the outline, where they cross the play area
//   - the panes (only the far ones show, behind the terrain) are a touch denser along their
//     rims and nearly clear in the middle, so an edge reads as the rim of a pane of glass
// One look for the full cube's box (makeGlass) and every proxy's (glassBatch, instanced).
// A room that joins its neighbours only through its portals (core/boundaries.js portalsOnly: an
// annex, a trial room until it is resolved) glows a warm orange instead (setGlassShut): its faces
// do not open the way the others' do.
// The town's tiles (docs/town.md) are one place under one glass: a tile's seams (the sides with
// another tile beyond, setGlassSeams) have no pane, and none of the edges that lie on them, so the
// boxes of all its tiles together draw one hull; its corners are the hull's (an edge's end on a
// seam is no corner).
import * as THREE from 'three';
import { N, CUBE_H, BASE } from '../core/constants.js';
import { dither } from './fade.js';

const box = new THREE.BoxGeometry(N, CUBE_H, N), outline = new THREE.EdgesGeometry(box);
// The panes lie in the planes of the cube's outer walls, whose insides show through a cut:
// pushed back a little in depth, a pane always loses there instead of flickering over them.
const BEHIND = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4 };
// BoxGeometry's faces are +x, -x, +y, -y, +z, -z. Keep one shared geometry per side.
const sides = [0, 1, 4, 5].map(face => {
  const geo = box.clone();
  geo.setIndex(Array.from(box.index.array.slice(face * 6, face * 6 + 6)));
  geo.clearGroups();
  return geo;
});

// The look, shared by every box (as uniforms).
// Widths are in CSS pixels, so a box looks the same on any screen and at any resolution drop.
export const GLASS = {
  edgeColor: 0x8fb3d9, paneColor: 0x6d8db5,
  width: 0.06,        // an edge's width in world units (a cell is 1) ...
  minPx: 1.0,         // ... but never thinner or thicker than this on screen
  maxPx: 1.5,
  feather: 0.8,       // soft falloff on either side, px
  corner: 0.42,       // an edge's opacity at the corners of the box's outline ...
  mid: 0.45,          // ... and along its middle, as a share of that
  reach: 1.6,         // how far from a corner the stronger part reaches, world units
  inner: 0.7,         // edges inside the outline (over the play area): a share of all that
  rim: 0.075,         // a pane's opacity along its rims ...
  centre: 0.35,       // ... and in its middle, as a share of that
  band: 1.2,          // how far in from a pane's rims the denser glass reaches, world units
  // shut (setGlassShut): the colours, and how much stronger the edges and panes are
  shutEdgeColor: 0xffa34d, shutPaneColor: 0xff8a33,
  shutEdge: 1.9,
  shutPane: 2.6,
};
const U = Object.fromEntries(Object.entries(GLASS).filter(([k]) => !k.endsWith('Color')).map(([k, v]) => [k, { value: v }]));
// The full cube's cut caps are drawn a few steps nearer than its walls (render/section.js
// CAP_AHEAD): along the bottom of the box, where they lie on its edges, the edges have to be
// nearer still or they break up into dashes. Proxies have no caps.
const CUBE_AHEAD = 64, PROXY_AHEAD = 8;
const RES = { value: new THREE.Vector2(1, 1) }, PX = { value: 1 };
const SHUT_EDGE = { value: new THREE.Color(GLASS.shutEdgeColor) }, SHUT_PANE = { value: new THREE.Color(GLASS.shutPaneColor) };

// the size of what is drawn into, for the edges' widths on screen
const size = new THREE.Vector2();
function measure(renderer) {
  const target = renderer.getRenderTarget();
  if (target) RES.value.set(target.width, target.height);
  else RES.value.copy(renderer.getDrawingBufferSize(size));
  PX.value = target ? 1 : renderer.getPixelRatio();
}

// An edge strip: per vertex both ends of its edge (aA, aB), which end it is (aEnd) and which
// side of the line (aAcross). Four vertices and two triangles per edge.
const edgeGeo = (() => {
  const p = outline.attributes.position, a = [], b = [], end = [], across = [], pos = [], index = [];
  for (let e = 0; e < p.count; e += 2) {
    const A = [p.getX(e), p.getY(e), p.getZ(e)], B = [p.getX(e + 1), p.getY(e + 1), p.getZ(e + 1)];
    const base = pos.length / 3;
    for (const [t, s] of [[0, -1], [0, 1], [1, -1], [1, 1]]) {
      a.push(...A); b.push(...B); end.push(t); across.push(s); pos.push(...(t ? B : A));
    }
    index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  return { a, b, end, across, pos, index };
})();
function fillEdges(geo) {
  geo.setAttribute('position', new THREE.Float32BufferAttribute(edgeGeo.pos, 3));
  geo.setAttribute('aA', new THREE.Float32BufferAttribute(edgeGeo.a, 3));
  geo.setAttribute('aB', new THREE.Float32BufferAttribute(edgeGeo.b, 3));
  geo.setAttribute('aEnd', new THREE.Float32BufferAttribute(edgeGeo.end, 1));
  geo.setAttribute('aAcross', new THREE.Float32BufferAttribute(edgeGeo.across, 1));
  geo.setIndex(edgeGeo.index);
  return geo;
}
const edgeGeometry = fillEdges(new THREE.BufferGeometry());

// instanced: the box's place (aOffset) moves its points before they are projected
// ahead: depth buffer steps (24 bits) the edges are pulled towards the camera
const EDGE_VERT = (offset, ahead, seams) => `
  // the seams (+x, -x, +z, -z): an edge on one is not drawn, an end on one is no corner
  vec4 seamsV = ${seams};
  float sxA = aA.x > 0.0 ? seamsV.x : seamsV.y, szA = aA.z > 0.0 ? seamsV.z : seamsV.w;
  float sxB = aB.x > 0.0 ? seamsV.x : seamsV.y, szB = aB.z > 0.0 ? seamsV.z : seamsV.w;
  float seamHide = max(abs(aA.x - aB.x) < 0.5 ? sxA : 0.0, abs(aA.z - aB.z) < 0.5 ? szA : 0.0);
  vec3 gA = aA${offset}, gB = aB${offset};
  vec4 eA = modelViewMatrix * vec4(gA, 1.0), eB = modelViewMatrix * vec4(gB, 1.0);
  // trimmed to the near plane (the close view can stand inside a box)
  if (projectionMatrix[2][3] == -1.0) {
    float zn = -projectionMatrix[3][2] / (projectionMatrix[2][2] - 1.0) - 1e-3;
    if (eA.z > zn && eB.z <= zn) eA = mix(eA, eB, (zn - eA.z) / (eB.z - eA.z));
    else if (eB.z > zn && eA.z <= zn) eB = mix(eB, eA, (zn - eB.z) / (eA.z - eB.z));
  }
  vec4 cA = projectionMatrix * eA, cB = projectionMatrix * eB;
  vec2 halfRes = uGlassRes * 0.5;
  vec2 dir = cB.xy / cB.w * halfRes - cA.xy / cA.w * halfRes;
  dir = dot(dir, dir) > 1e-8 ? normalize(dir) : vec2(1.0, 0.0);
  vec4 mvPosition = aEnd < 0.5 ? eA : eB;
  vec4 clip = aEnd < 0.5 ? cA : cB;
  // the width: world units on screen, within a few CSS pixels; a soft margin on either side
  float perUnit = projectionMatrix[1][1] * halfRes.y / clip.w;
  vCore = clamp(uGlassWidth * perUnit, uGlassMin * uGlassPx, uGlassMax * uGlassPx) * 0.5;
  vHalf = vCore + uGlassFeather * uGlassPx;
  clip.xy += vec2(-dir.y, dir.x) * aAcross * vHalf / halfRes * clip.w;
  vAcross = aAcross;
  vLen = distance(gA, gB);
  vAlong = aEnd * vLen;
  // Seen from outside, some of the box's corners and edges make its outline and the others lie
  // inside it, over the play area (from above: the top corner nearest the camera and its three
  // edges). A face looks at the camera when the camera is beyond its plane; an edge is on the
  // outline when one of its two faces does and the other does not, a corner when some of its
  // three do and some do not.
  vec3 cam = cameraPosition - (modelMatrix * vec4(vec3(0.0)${offset}, 1.0)).xyz;
  vec3 facesA = step(0.0, (cam - aA) * sign(aA)), facesB = step(0.0, (cam - aB) * sign(aB));
  float sides = dot(facesA, vec3(1.0) - step(0.5, abs(aB - aA)));   // its two faces that look
  vOutline = sides == 1.0 ? 1.0 : 0.0;
  float a = dot(facesA, vec3(1.0)), b = dot(facesB, vec3(1.0));
  vCornerA = a > 0.0 && a < 3.0 ? (1.0 - sxA) * (1.0 - szA) : 0.0;
  vCornerB = b > 0.0 && b < 3.0 ? (1.0 - sxB) * (1.0 - szB) : 0.0;
  // a hair towards the camera: an edge wins over the cube's own outer walls it lies on
  clip.z -= ${(2 * ahead / 2 ** 24).toExponential(6)} * clip.w;
  gl_Position = seamHide > 0.5 ? vec4(0.0, 0.0, 2.0, 1.0) : clip;`;
// shut: 0..1, the warm glow of a room that joins only through its portals (the outgoing colour
// towards its own, the alpha stronger)
const SHUT = (shut, color, boost) => `
  outgoingLight = mix(outgoingLight, ${color}, ${shut});
  diffuseColor.a *= mix(1.0, ${boost}, ${shut});`;
const EDGE_FRAG = shut => `
  float across = abs(vAcross) * vHalf;
  float ink = 1.0 - smoothstep(vCore - 0.5, vCore + uGlassFeather * uGlassPx, across);
  // stronger near the outline's corners, fainter inside the outline
  float corner = max(vCornerA * (1.0 - smoothstep(0.0, uGlassReach, vAlong)),
    vCornerB * (1.0 - smoothstep(0.0, uGlassReach, vLen - vAlong)));
  diffuseColor.a *= uGlassCorner * ink * mix(uGlassMid, 1.0, corner) * mix(uGlassInner, 1.0, vOutline);
  ${SHUT(shut, 'uGlassShutEdge', 'uGlassShutEdgeBoost')}
  #include <opaque_fragment>`;
const PANE_FRAG = (shut, seams) => `
  // in from the nearest rim of this pane: along it (x or z, whichever is not the pane's own; not a
  // seam's, the hull goes on there) or up
  vec3 l = vGlassLocal;
  vec4 sm = ${seams};
  float h = ${(N / 2).toFixed(1)}, along = abs(l.x) > abs(l.z)
    ? min(sm.z > 0.5 ? 1e3 : h - l.z, sm.w > 0.5 ? 1e3 : h + l.z)
    : min(sm.x > 0.5 ? 1e3 : h - l.x, sm.y > 0.5 ? 1e3 : h + l.x);
  float fromRim = min(along, ${(CUBE_H / 2).toFixed(1)} - abs(l.y));
  float rim = 1.0 - smoothstep(0.0, uGlassBand, fromRim);
  diffuseColor.a *= uGlassRim * mix(uGlassCentre, 1.0, rim * rim);
  ${SHUT(shut, 'uGlassShutPane', 'uGlassShutPaneBoost')}
  #include <opaque_fragment>`;
// instanced, a box is shut by its aFade.w; else by its own uniform (makeGlass: one per box)
const shutOf = instanced => instanced ? 'vFade.w' : 'uGlassShut';

function edgeMaterial(strength, instanced, shut = null, seams = null) {
  const mat = new THREE.MeshBasicMaterial({ color: GLASS.edgeColor, transparent: true, opacity: strength,
    depthWrite: false, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uGlassRes: RES, uGlassPx: PX, uGlassWidth: U.width, uGlassMin: U.minPx, uGlassMax: U.maxPx,
      uGlassFeather: U.feather, uGlassMid: U.mid, uGlassReach: U.reach, uGlassInner: U.inner });
    sh.uniforms.uGlassCorner = U.corner;
    Object.assign(sh.uniforms, { uGlassShutEdge: SHUT_EDGE, uGlassShutEdgeBoost: U.shutEdge }, shut ? { uGlassShut: shut } : {}, seams ? { uGlassSeams: seams } : {});
    const varyings = 'varying float vAcross, vHalf, vCore, vAlong, vLen, vOutline, vCornerA, vCornerB;\nuniform float uGlassPx, uGlassFeather';
    sh.vertexShader = `attribute vec3 aA, aB;\nattribute float aEnd, aAcross;\n${varyings}, uGlassWidth, uGlassMin, uGlassMax;\nuniform vec2 uGlassRes;\n`
      + (instanced ? 'attribute vec3 aOffset;\nattribute vec4 aFade, aSeams;\nflat varying vec4 vFade;\n' : 'uniform vec4 uGlassSeams;\n')
      + sh.vertexShader.replace('#include <project_vertex>', (instanced ? 'vFade = aFade;\n' : '') + EDGE_VERT(instanced ? ' + aOffset' : '', instanced ? PROXY_AHEAD : CUBE_AHEAD, instanced ? 'aSeams' : 'uGlassSeams'));
    sh.fragmentShader = `${varyings}, uGlassMid, uGlassReach, uGlassCorner, uGlassInner, uGlassShutEdgeBoost;\nuniform vec3 uGlassShutEdge;\n`
      + (instanced ? 'flat varying vec4 vFade;\n' : 'uniform float uGlassShut;\n')
      + sh.fragmentShader.replace('#include <opaque_fragment>', EDGE_FRAG(shutOf(instanced)))
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + (instanced ? dither('vFade.x', 'vFade.y', 'vFade.z') : ''));
  };
  mat.customProgramCacheKey = () => instanced ? 'glass-edges-batch' : 'glass-edges';
  return mat;
}

function paneMaterial(strength, instanced, shut = null, seams = null) {
  const mat = new THREE.MeshBasicMaterial({ color: GLASS.paneColor, transparent: true, opacity: strength,
    side: THREE.BackSide, depthWrite: false, ...BEHIND });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uGlassBand: U.band, uGlassCentre: U.centre, uGlassRim: U.rim, uGlassShutPane: SHUT_PANE, uGlassShutPaneBoost: U.shutPane },
      shut ? { uGlassShut: shut } : {}, seams ? { uGlassSeams: seams } : {});
    // instanced: a hidden pane (aPanes, by its side aSide) collapses to a point
    sh.vertexShader = 'varying vec3 vGlassLocal;\n'
      + (instanced ? 'attribute vec3 aOffset;\nattribute vec4 aFade, aSeams;\nflat varying vec4 vFade, vSeams;\nattribute float aSide;\nattribute vec4 aPanes;\n' : '')
      + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vGlassLocal = transformed;
        ${instanced ? `vFade = aFade; vSeams = aSeams;
        if (aPanes[int(aSide)] < 0.5) transformed = vec3(0.0);
        transformed += aOffset;` : ''}`);
    sh.fragmentShader = 'varying vec3 vGlassLocal;\nuniform float uGlassBand, uGlassCentre, uGlassRim, uGlassShutPaneBoost;\nuniform vec3 uGlassShutPane;\n'
      + (instanced ? 'flat varying vec4 vFade, vSeams;\n' : 'uniform float uGlassShut;\nuniform vec4 uGlassSeams;\n')
      + sh.fragmentShader.replace('#include <opaque_fragment>', PANE_FRAG(shutOf(instanced), instanced ? 'vSeams' : 'uGlassSeams'))
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + (instanced ? dither('vFade.x', 'vFade.y', 'vFade.z') : ''));
  };
  mat.customProgramCacheKey = () => instanced ? 'glass-panes-batch' : 'glass-panes';
  return mat;
}

function edgeMesh(geo, mat) {
  const edges = new THREE.Mesh(geo, mat);
  edges.onBeforeRender = measure;
  return edges;
}

export function setGlassFaces(group, open = []) {
  group.userData.open = open;
  const seams = group.userData.seams;
  group.userData.panes.forEach((pane, dir) => { pane.visible = !open[dir] && !seams?.[dir]; });
}
// the box's seams (DIRS: +x, -x, +z, -z): the town's tiles under one hull (see above)
export function setGlassSeams(group, seams = null) {
  group.userData.seams = seams ? [...seams] : null;
  group.userData.seamsU?.value.set(...[0, 1, 2, 3].map(d => seams?.[d] ? 1 : 0));
  setGlassFaces(group, group.userData.open);
}
// the box of a room that joins its neighbours only through its portals glows (or no longer)
export function setGlassShut(group, shut) {
  group.userData.shut = !!shut;
  if (group.userData.shutU) group.userData.shutU.value = shut ? 1 : 0;
}

export function makeGlass(strength = 1, open = [], seams = null) {
  const g = new THREE.Group(), shut = { value: 0 }, seamsU = { value: new THREE.Vector4() };
  g.userData.shutU = shut; g.userData.seamsU = seamsU;
  const edges = edgeMesh(edgeGeometry, edgeMaterial(strength, false, shut, seamsU));
  edges.userData.sharedGeo = true;
  const material = paneMaterial(strength, false, shut, seamsU);
  g.userData.panes = sides.map(geo => {
    const pane = new THREE.Mesh(geo, material);
    pane.userData.sharedGeo = true;
    return pane;
  });
  g.add(edges, ...g.userData.panes);
  g.position.set(N / 2, CUBE_H / 2 - BASE, N / 2);
  setGlassFaces(g, open);
  setGlassSeams(g, seams);
  return g;
}

// The proxies' glass boxes (render/neighbors.js): every proxy's panes in one draw and every
// outline in another. A proxy holds a stand-in that setGlassFaces treats like a real box (its
// first child the outline, userData.panes the side panes); nothing of it is in the scene.
export function glassState(open = []) {
  const g = new THREE.Group();
  g.add(new THREE.Object3D());
  g.userData.panes = [0, 1, 2, 3].map(() => { const pane = new THREE.Object3D(); g.add(pane); return pane; });
  setGlassFaces(g, open);
  return g;
}

const CENTER = new THREE.Vector3(N / 2, CUBE_H / 2 - BASE, N / 2);

// per instance: aOffset (the box centre), aFade (fade, inverted, range fade: render/fade.js; and
// shut: setGlassShut), aPanes (which side panes show)
export function glassBatch(strength) {
  const pos = [], side = [], p = box.attributes.position;
  sides.forEach((geo, s) => { for (const i of geo.index.array) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); side.push(s); } });
  const paneGeo = new THREE.InstancedBufferGeometry(), lineGeo = fillEdges(new THREE.InstancedBufferGeometry());
  paneGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  paneGeo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  const panes = new THREE.Mesh(paneGeo, paneMaterial(strength, true));
  const edges = edgeMesh(lineGeo, edgeMaterial(strength, true));
  for (const o of [panes, edges]) { o.frustumCulled = false; o.visible = false; }
  let capacity = 0, offset, fade, shown, seams;
  const grow = n => {
    capacity = Math.max(n, capacity * 2, 64);
    offset = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    fade = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    shown = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    seams = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    for (const g of [paneGeo, lineGeo]) { g.setAttribute('aOffset', offset); g.setAttribute('aFade', fade); g.setAttribute('aSeams', seams); }
    paneGeo.setAttribute('aPanes', shown);
  };
  grow(64);
  return {
    objects: [panes, edges],
    // list: [{ position (the proxy's), fade: [fade, inverted, range], state (glassState) }]
    update(list) {
      if (list.length > capacity) grow(list.length);
      list.forEach((g, i) => {
        offset.setXYZ(i, g.position.x + CENTER.x, g.position.y + CENTER.y, g.position.z + CENTER.z);
        fade.setXYZW(i, g.fade[0], g.fade[1], g.fade[2], g.state.userData.shut ? 1 : 0);
        const [a, b, c, d] = g.state.userData.panes.map(pane => pane.visible ? 1 : 0);
        shown.setXYZW(i, a, b, c, d);
        const s = g.state.userData.seams;
        seams.setXYZW(i, s?.[0] ? 1 : 0, s?.[1] ? 1 : 0, s?.[2] ? 1 : 0, s?.[3] ? 1 : 0);
      });
      for (const a of [offset, fade, shown, seams]) { a.clearUpdateRanges(); a.addUpdateRange(0, list.length * a.itemSize); a.needsUpdate = true; }
      paneGeo.instanceCount = lineGeo.instanceCount = list.length;
      panes.visible = edges.visible = list.length > 0;
    },
  };
}

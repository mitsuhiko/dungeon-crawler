// A body of fluid made afresh as it moves (the Squirtle's, render/squirtleview.js): its field's
// surface (render/fluidfield.js) as a mesh, the normals the field's gradient, a colour per vertex.
// One mesh per body, its buffers grown as needed and reused.
import * as THREE from 'three';
import { surfaceNets } from './fluidfield.js';
export { field, surfaceNets, smin } from './fluidfield.js';

// A body's mesh: { mesh, geometry } with its buffers; build(shape, box, cell, paint) fills it.
// box: [x0, y0, z0, x1, y1, z1] the field is looked at in; cell: the grid's spacing; paint(x, y,
// z, out) gives each vertex its colour (out: [r, g, b]).
export function makeFluidMesh(material) {
  const geometry = new THREE.BufferGeometry();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, geometry, cap: 0, icap: 0, values: null, cells: null };
}

const rgb = [0, 0, 0];
export function buildFluidMesh(body, s, box, cell, paint) {
  const { pos, nrm, idx } = surfaceNets(s, box, cell, body);
  // the vertices, their normals and colours, into the mesh's buffers
  const count = pos.length / 3, g = body.geometry;
  if (count > body.cap) {
    body.cap = Math.ceil(count * 1.5);
    for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3]])
      g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(body.cap * size), size).setUsage(THREE.DynamicDrawUsage));
  }
  if (idx.length > body.icap) {
    body.icap = Math.ceil(idx.length * 1.5);
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(body.icap), 1).setUsage(THREE.DynamicDrawUsage));
  }
  const P = g.attributes.position.array, N = g.attributes.normal.array, K = g.attributes.color.array;
  for (let v = 0; v < count; v++) {
    const x = pos[3 * v], y = pos[3 * v + 1], z = pos[3 * v + 2];
    P[3 * v] = x; P[3 * v + 1] = y; P[3 * v + 2] = z;
    N[3 * v] = nrm[3 * v]; N[3 * v + 1] = nrm[3 * v + 1]; N[3 * v + 2] = nrm[3 * v + 2];
    paint(x, y, z, rgb);
    K[3 * v] = rgb[0]; K[3 * v + 1] = rgb[1]; K[3 * v + 2] = rgb[2];
  }
  g.index.array.set(idx);
  g.setDrawRange(0, idx.length);
  for (const name of ['position', 'normal', 'color']) { g.attributes[name].needsUpdate = true; g.attributes[name].clearUpdateRanges?.(); }
  g.index.needsUpdate = true;
  g.boundingSphere = null;
  return count;
}

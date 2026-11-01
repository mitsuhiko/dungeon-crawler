// Every GLB the game loads comes through here. The exported assets are meshopt-compressed with
// quantized vertices (tools/compress-assets.mjs): a static mesh then stores small integers and
// its node carries the scale and offset that turn them back into positions. The rest of the
// game expects what Blender exported (props whose geometry sits at their attachment point, a
// node transform only where it means something, e.g. the chest's lid hinge), so on load each
// such mesh gets its node's transform baked back into float positions. Skinned meshes stay
// quantized: their bind matrices carry the scale, nothing outside the skeleton sees it. An item's
// model is measured for its look's texels (render/looks.js markLookScale).
// A file is fetched at once but parsed on its turn (render/turns.js): models fetched ahead
// while you play come in one per frame, not all in the frame you arrive somewhere.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { turn } from './turns.js';
import { markLookScale } from './looks.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

const fetchBuffer = url => fetch(url).then(r => {
  if (!r.ok) throw new Error(`${url}: ${r.status} ${r.statusText}`);
  return r.arrayBuffer();
});

// url -> Promise<gltf>: a fresh copy each time (callers change what they load)
export const loadGLB = url => fetchBuffer(url).then(buffer => turn().then(() => loader.parseAsync(buffer, THREE.LoaderUtils.extractUrlBase(url))))
  .then(gltf => { bakeQuantization(gltf); markLookScale(gltf.scene); return gltf; });

const quantized = a => a.normalized || !(a.array instanceof Float32Array);

// The quantization transform of each static (unskinned) mesh node, baked into its geometry.
// A node with a mesh and children of its own (a weapon with its string, the chest's lid) gets
// its mesh moved onto a new, unnamed child node when compressed; a group of primitives there
// goes back into the named node, so its meshes are its children again as exported.
export function bakeQuantization(gltf) {
  const { json, associations } = gltf.parser, baked = new Set(), nodes = [];
  gltf.scene.traverse(o => { if (associations.get(o)?.nodes !== undefined) nodes.push(o); });
  for (const o of nodes) {
    const node = json.nodes[associations.get(o).nodes];
    if (node.mesh === undefined || node.skin !== undefined) continue;
    // a node with several primitives is a group of meshes (GLTFLoader); one: the mesh itself
    const meshes = o.isMesh ? [o] : o.children.filter(c => c.isMesh && associations.get(c)?.nodes === undefined);
    if (!meshes.some(m => quantized(m.geometry.attributes.position))) continue;
    o.updateMatrix();
    for (const m of meshes) {
      if (baked.has(m.geometry)) throw new Error(`shared quantized geometry in ${node.name ?? 'a node'}`);
      baked.add(m.geometry);
      bakePositions(m.geometry, o.matrix);
    }
    o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1);
    o.updateMatrix();
    if (node.name === undefined && !o.isMesh && o.parent && o.children.length === meshes.length) {
      for (const m of meshes) o.parent.add(m);
      o.removeFromParent();
    }
  }
}

const v = new THREE.Vector3();
function bakePositions(geometry, matrix) {
  const from = geometry.attributes.position, out = new Float32Array(from.count * 3);
  for (let i = 0; i < from.count; i++) v.fromBufferAttribute(from, i).applyMatrix4(matrix).toArray(out, i * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(out, 3));
  geometry.boundingBox = null; geometry.boundingSphere = null;
}

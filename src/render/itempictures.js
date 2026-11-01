// Pictures of items, each drawn from its 3D model by a small renderer of its own, away from the
// game's canvas: there are no icon images, every picture is its model's. Used wherever an item
// shows in the DOM (through render/itemviews.js, which adds the live views of the inventory),
// and by the kids' guide (learn/demos/), which is why this needs nothing of the game but the
// item table.
//   itemPicture(item) a picture of the item's model in its look (core/looks.js: a bag slot or a
//                     pickup in its own, a bare item id in its kind's), seen as in blender/items.py's
//                     previews, rendered once when first asked for and kept (until then: an empty
//                     image); pictures are kept by their look's key (pictureKey)
//   pictureImg(item)  an <img> of it for HTML, which shows the picture as soon as it is there
// The WebGL canvas is never shown: each picture is copied out of it right after it is drawn.
import * as THREE from 'three';
import { loadGLB } from './gltf.js';
import { ITEMS } from '../core/items.js';
import { lookKey, parseLook } from '../core/looks.js';
import { dressLook } from './looks.js';

const PICTURE = 192;         // px, square: a bag slot (~80 CSS px) on a screen of pixel ratio 2
const VIEW = new THREE.Vector3(2, 3, 5).normalize();   // the camera direction of blender/items.py render_previews

let renderer = null;
function gl(w, h) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(1);
    // (as the game's, render/scene.js: in Chrome, asking for a program's log waits for all the
    // GPU process has queued, the game's bake too; only with the dev tools)
    renderer.debug.checkShaderErrors = new URLSearchParams(location.search).get('dev') === '1';
  }
  // it only grows: each view uses its bottom-left corner
  const s = renderer.getSize(new THREE.Vector2());
  if (s.x < w || s.y < h) renderer.setSize(Math.max(s.x, w, PICTURE), Math.max(s.y, h, PICTURE), false);
  return renderer;
}
// draw scene through cam into the 2D canvas `out` (its whole size)
export function paint(out, scene, cam) {
  const w = out.width, h = out.height, r = gl(w, h), H = r.domElement.height;
  r.setViewport(0, 0, w, h); r.setScissor(0, 0, w, h); r.setScissorTest(true);
  r.clear();
  r.render(scene, cam);
  const ctx = out.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(r.domElement, 0, H - h, w, h, 0, 0, w, h);   // (in the same task: no preserveDrawingBuffer needed)
}

const scenes = new Map();   // url -> Promise<the GLB's scene | null>
export const load = url => {
  if (!scenes.has(url)) scenes.set(url, loadGLB(url).then(g => g.scene)
    .catch(e => { console.error('item model failed to load', url, e); return null; }));
  return scenes.get(url);
};
// what a picture shows: an item's model, or (a tool, which never lies on the floor) its
// `picture` (core/items.js); also the treasure chest (game/action.js)
const OTHERS = { treasure_chest: 'assets/items/treasure_chest.glb' };
// (asset paths are from the game's root: resolved from here, so the guide finds them too)
const root = path => path && new URL('../../' + path, import.meta.url).href;
export const modelUrl = id => root(ITEMS[id] ? ITEMS[id].model ?? ITEMS[id].picture : OTHERS[id]);

// A shield is modelled where it sits on the arm; its model says how it lies face up instead
// (blender/armor.py `floor_gltf`): for the floor (render/loot.js) and the pictures.
export function layFlat(model) {
  let floor = null;
  model.traverse(o => { floor ??= o.userData.floor_gltf ?? null; });
  if (Array.isArray(floor) && floor.length === 16) model.applyMatrix4(new THREE.Matrix4().fromArray(floor));
  return model;
}

// what a picture is kept by: the look's key (an item, an id or a key), or what else it shows
export const pictureKey = item => lookKey(item) || (typeof item === 'string' ? item : '');
const itemOf = key => parseLook(key)?.itemId ?? key;

// picture key -> { group (centred on its box), half (half the height of a square view that fits it,
// turning too) }; null while loading, false when it cannot be shown
const protos = new Map(), pictures = new Map(), listeners = [];
// an item's model, ready to paint (null while loading, false when it cannot be shown)
export const itemModel = item => protos.get(pictureKey(item));
function proto(key) {
  if (protos.has(key)) return protos.get(key);
  const url = modelUrl(itemOf(key));
  protos.set(key, url ? null : false);
  if (url) load(url).then(root => {
    if (!root) { protos.set(key, false); return; }
    const model = dressLook(root.clone(true), parseLook(key) ? key : null);
    layFlat(model);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    model.position.sub(box.getCenter(new THREE.Vector3()));
    const group = new THREE.Group();
    group.add(model);
    protos.set(key, { group, half: 0.6 * Math.max(size.y, Math.hypot(size.x, size.z)) });
    snapshot(key);
  });
  return protos.get(key);
}

// the items' stage: lit like blender/items.py's previews, from the front left, the right and behind
const stage = new THREE.Scene(), itemCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
itemCam.position.copy(VIEW).multiplyScalar(8);
itemCam.lookAt(0, 0, 0);
{
  const light = (color, power, x, y, z) => { const l = new THREE.DirectionalLight(color, power); l.position.set(x, y, z); return l; };
  stage.add(new THREE.HemisphereLight(0xe8eeff, 0x4a4436, 1.5),
    light(0xfff2e0, 2.2, -3, 10, 5), light(0xe0ecff, 0.9, 7, 8, 1), light(0xcfe0ff, 1.4, 0, 9, -6));
}
// item m into canvas `out`, turned by `yaw`
export function paintItem(out, m, yaw) {
  const a = out.width / out.height;
  Object.assign(itemCam, a >= 1 ? { left: -m.half * a, right: m.half * a, top: m.half, bottom: -m.half }
    : { left: -m.half, right: m.half, top: m.half / a, bottom: -m.half / a });
  itemCam.updateProjectionMatrix();
  m.group.rotation.y = yaw;
  stage.add(m.group);
  paint(out, stage, itemCam);
  stage.remove(m.group);
}

function snapshot(key) {
  const m = protos.get(key), out = document.createElement('canvas');
  out.width = out.height = PICTURE;
  paintItem(out, m, 0);
  pictures.set(key, out.toDataURL('image/png'));
  for (const fn of listeners) fn(key);
}
const EMPTY = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
// the picture of `item` (a URL): its model's once rendered, an empty image until then
export function itemPicture(item) {
  const key = pictureKey(item);
  if (!pictures.has(key)) proto(key);
  return pictures.get(key) ?? EMPTY;
}
// the model of item can be drawn (live too)
export const itemModelReady = item => pictures.has(pictureKey(item));
// fn(key) whenever another picture is ready (to show it instead of the empty image)
export const onItemPictures = fn => { listeners.push(fn); };
// an <img> showing item's picture, now or once it is rendered (an img given the attribute
// data-item-picture (a picture key) by other means gets it too)
export const pictureImg = (item, alt = '') => `<img data-item-picture="${pictureKey(item)}" src="${itemPicture(item)}" alt="${alt}">`;
onItemPictures(key => {
  for (const img of document.querySelectorAll(`img[data-item-picture="${key}"]`)) img.src = pictures.get(key);
});

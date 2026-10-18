// A separate, unarmed standing figure. Paint is a GPU-resident 2048² RGBA texture;
// the original hero and PNG stay untouched until both IndexedDB and hero save succeed.
// Opened from Choose Skin (game/menu.js): a new skin, or one of the library to paint on.
import * as THREE from 'three';
import { rigReady, createFigure } from '../render/figure.js';
import { characterReady } from '../render/character.js';
import { setSkinMap, createSkinPicker } from '../render/skin.js';
import { SkinPainter } from '../render/skinpaint.js';
import { SkinPreview } from '../render/skinpreview.js';
import { writeSkinFile, deleteSkinFile, skinImage, readNamedSkin, writeNamedSkin, rollbackNamedSkin, SkinLibraryFull } from './skinfiles.js';
import { cleanSkinName, skinNameKey, SKIN_NAME_MAX, MAX_SKINS, isNinjaSkinCode, NINJA_SKIN_CODE } from '../core/skin.js';

let active = false;
const escapeText = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export const skinEditorOpen = () => active;
// name: the library's skin to start from ('': a blank one); save(skin): the hero wears that new
// file of it (false: the hero storage refused); onClose(saved): when the editor is gone
export async function openSkinEditor({ hero, name = '', save, onClose }) {
  if (active) return;
  active = true;
  const previousFocus = document.activeElement, dialog = document.createElement('dialog');
  dialog.id = 'skin-editor'; dialog.setAttribute('aria-labelledby', 'skin-title');
  dialog.innerHTML = `<h2 id="skin-title">${name ? 'Paint Skin' : 'New Skin'} <small>2048 × 2048</small></h2>
    <div class="skin-tools" role="group" aria-label="Paint tools">
      <button data-tool="pen" aria-pressed="true">Pen</button>
      <button data-tool="fill" aria-pressed="false">Fill</button>
      <label>Color <input id="skin-color" type="color" value="#4287ff"></label>
      <button data-tool="erase" aria-pressed="false">Eraser</button>
      <button data-tool="rotate" aria-pressed="false">Rotate</button>
      <label>Brush size <input id="skin-size" type="range" min="1" max="32" value="4"></label>
    </div>
    <div id="skin-view"></div>
    <p>Draw a fully closed outline, then choose Fill and click inside it. Gaps must be closed first.
      Hold the right mouse button and drag to rotate, or use Rotate. Scroll to zoom in.</p>
    <div class="skin-tools skin-library">
      <label for="skin-name">Skin name</label>
      <input id="skin-name" type="text" maxlength="${SKIN_NAME_MAX}" required placeholder="Name your skin" autocomplete="off">
    </div>
    <p>Saving keeps the skin under this name (up to ${MAX_SKINS} skins) and puts it on ${escapeText(hero.name)}.</p>
    <div class="skin-tools"><button id="skin-save" disabled>Save Skin</button><button id="skin-cancel">Cancel</button></div>
    <p id="skin-status" role="status">Loading skin …</p>`;
  document.body.append(dialog); dialog.showModal();
  const $ = s => dialog.querySelector(s), status = $('#skin-status');
  $('#skin-name').value = cleanSkinName(name);
  let renderer, figure, painter, resize, meshes = [], pickers = [], frame = null, thumbnails, done = false;
  let tool = 'pen', pointer = null, last = null, rotating = false, busy = false, dirty = false, viewDirty = true;
  const strokes = [];
  function close() {
    if (busy) return;
    active = false; cancelAnimationFrame(frame); resize?.disconnect();
    thumbnails?.dispose(); painter?.dispose();
    // Figure geometry and shadow-depth material belong to the shared rig.
    meshes.forEach(o => o.material.dispose());
    pickers.forEach(p => { p.geometry.dispose(); p.material.dispose(); });
    renderer?.dispose(); dialog.remove(); previousFocus?.focus();
    onClose?.(done);
  }
  dialog.addEventListener('keydown', e => e.stopPropagation());
  dialog.addEventListener('cancel', e => {
    e.preventDefault();
    if (!dirty || busy || confirm('Discard your unsaved painting?')) close();
  });
  $('#skin-cancel').onclick = () => { if (!dirty || busy || confirm('Discard your unsaved painting?')) close(); };
  try {
    await Promise.all([rigReady, characterReady]);
    const record = name ? await readNamedSkin(name) : null;
    if (name && !record) throw new Error(`No skin named ${name}`);
    const image = record ? await skinImage(record.blob) : null;
    if (!dialog.isConnected) return;
    figure = createFigure();
    figure.model.traverse(o => { if (o.isMesh) { o.userData.skinMaterial = true; meshes.push(o); } });
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#19212f');
    scene.add(figure.group, new THREE.HemisphereLight(0xffffff, 0x8293ac, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2.5); light.position.set(2, 4, 5); scene.add(light);
    figure.group.updateMatrixWorld(true);
    pickers = meshes.map(createSkinPicker);
    const box = new THREE.Box3().setFromObject(figure.group), centre = box.getCenter(new THREE.Vector3());
    const height = box.getSize(new THREE.Vector3()).y, camera = new THREE.PerspectiveCamera(35, 1, .01, 100);
    let yaw = 0, pitch = 0, zoom = 1;
    const view = $('#skin-view');
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    view.append(renderer.domElement);
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-label', 'Skin texture: left-drag to paint, right-drag to rotate, scroll to zoom');
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    painter = new SkinPainter(renderer, pickers);
    if (image) {
      const texture = new THREE.CanvasTexture(image); texture.colorSpace = THREE.SRGBColorSpace;
      painter.copy(texture, true); texture.dispose();
    }
    meshes.forEach(mesh => setSkinMap(mesh, painter.texture, true));
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    function requestDraw() { if (frame === null && dialog.isConnected) frame = requestAnimationFrame(draw); }
    function draw() {
      frame = null;
      if (!dialog.isConnected) return;
      const w = view.clientWidth, h = view.clientHeight;
      if (!w || !h) return;
      if (viewDirty) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h; camera.updateProjectionMatrix();
        const distance = height * 1.75 * Math.max(1, 1 / camera.aspect) / zoom;
        camera.position.set(centre.x + Math.sin(yaw) * Math.cos(pitch) * distance,
          centre.y + Math.sin(pitch) * distance, centre.z + Math.cos(yaw) * Math.cos(pitch) * distance);
        camera.lookAt(centre); camera.updateMatrixWorld();
        painter.updateView(camera, w, h); viewDirty = false;
      }
      for (const stroke of strokes) painter.stroke(stroke.from, stroke.to, stroke.radius, stroke.color, stroke.erase);
      strokes.length = 0;
      renderer.render(scene, camera);
    }
    resize = new ResizeObserver(() => { viewDirty = true; requestDraw(); }); resize.observe(view);
    draw(); status.textContent = '';
    $('#skin-save').disabled = false;
    dialog.querySelectorAll('[data-tool]').forEach(button => {
      button.onclick = () => {
        if (busy) return;
        tool = button.dataset.tool; pointer = null; last = null;
        dialog.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        canvas.style.cursor = tool === 'rotate' ? 'grab' : 'crosshair';
      };
    });
    function requiredName() {
      const name = cleanSkinName($('#skin-name').value);
      $('#skin-name').value = name;
      if (!name) { status.textContent = 'Enter a skin name first.'; $('#skin-name').focus(); }
      return name;
    }
    $('#skin-name').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (isNinjaSkinCode($('#skin-name').value)) void loadSecret();
      else $('#skin-save').click();
    });
    $('#skin-name').addEventListener('input', () => {
      if (isNinjaSkinCode($('#skin-name').value)) void loadSecret();
    });
    async function loadSecret() {
      if (busy) return;
      if (dirty && !confirm('Loading a skin will replace your unsaved painting. Continue?')) return;
      busy = true; status.textContent = 'Loading secret skin …';
      try {
        const record = await readNamedSkin(NINJA_SKIN_CODE);
        const image = await skinImage(record.blob);
        const texture = new THREE.CanvasTexture(image); texture.colorSpace = THREE.SRGBColorSpace;
        strokes.length = 0; pointer = null; last = null;
        painter.copy(texture, true); texture.dispose();
        $('#skin-name').value = record.name; dirty = true; requestDraw();
        status.textContent = 'Easter egg unlocked: Ninjajavamc! Choose Save Skin to keep it.';
      } catch (e) { console.error(e); status.textContent = 'Could not load the secret skin. Try again with Enter.'; }
      finally { busy = false; }
    }
    const point = e => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: r.height - (e.clientY - r.top) };
    };
    function stroke(from, to) {
      strokes.push({ from, to, radius: Number($('#skin-size').value) / 2,
        color: $('#skin-color').value, erase: tool === 'erase' });
      dirty = true; status.textContent = 'Unsaved changes'; requestDraw();
    }
    async function fill(p) {
      busy = true; status.textContent = 'Filling area …';
      try {
        // Flush any preceding stroke before taking a texture snapshot.
        draw();
        mouse.set(p.x / view.clientWidth * 2 - 1, p.y / view.clientHeight * 2 - 1);
        ray.setFromCamera(mouse, camera);
        const hit = ray.intersectObjects(pickers, false)[0];
        const changed = hit ? await painter.fill(hit.uv, $('#skin-color').value) : 0;
        requestDraw();
        if (changed > 0) dirty = true;
        status.textContent = changed < 0 ? 'Close the outline completely before filling it.'
          : changed > 0 ? 'Area filled · Unsaved changes' : 'Click inside a closed outline.';
      } catch (e) { console.error(e); status.textContent = 'Could not fill this area.'; }
      finally { busy = false; }
    }
    canvas.onpointerdown = e => {
      if (busy || pointer !== null || (e.button !== 0 && e.button !== 2)) return;
      e.preventDefault(); pointer = e.pointerId; canvas.setPointerCapture(pointer); last = point(e);
      rotating = e.button === 2 || tool === 'rotate';
      if (rotating) { canvas.style.cursor = 'grabbing'; return; }
      if (tool === 'fill') { void fill(last); return; }
      stroke(last, last);
    };
    canvas.onpointermove = e => {
      if (busy || e.pointerId !== pointer) return;
      const p = point(e);
      if (rotating) {
        yaw -= (p.x - last.x) * .012;
        pitch = THREE.MathUtils.clamp(pitch - (p.y - last.y) * .01, -1.2, 1.2);
        viewDirty = true; requestDraw();
      } else if (tool !== 'fill') stroke(last, p);
      last = p;
    };
    canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = e => {
      if (pointer === e.pointerId) {
        pointer = null; last = null; rotating = false;
        canvas.style.cursor = tool === 'rotate' ? 'grab' : 'crosshair';
      }
    };
    canvas.addEventListener('wheel', e => {
      e.preventDefault(); if (busy) return;
      zoom = THREE.MathUtils.clamp(zoom * Math.exp(-e.deltaY * .001), .8, 3);
      viewDirty = true; requestDraw();
    }, { passive: false });
    $('#skin-save').onclick = async () => {
      if (busy) return;
      const newName = requiredName();
      if (!newName) return;
      busy = true; $('#skin-save').disabled = true; status.textContent = 'Saving texture …';
      let file, receipt;
      try {
        if (skinNameKey(newName) !== skinNameKey(name) && await readNamedSkin(newName)
            && !confirm(`Replace the saved skin named “${newName}”?`)) {
          status.textContent = 'Choose a different name to keep both skins.';
          busy = false; $('#skin-save').disabled = false; return;
        }
        draw();
        const blob = await painter.png();
        thumbnails ??= new SkinPreview(renderer);
        const preview = await thumbnails.render(blob);
        receipt = await writeNamedSkin(newName, blob, preview);
        file = { ...await writeSkinFile(blob), name: newName };
        if (!await save(file)) throw new Error('Hero storage refused');
        done = true; busy = false; close();
      } catch (e) {
        if (receipt) await rollbackNamedSkin(receipt).catch(console.warn);
        if (file) await deleteSkinFile(file).catch(console.warn);
        if (e instanceof SkinLibraryFull) status.textContent = `There are ${MAX_SKINS} skins already: save over one of them, or delete one in Choose Skin.`;
        else { console.error(e); status.textContent = 'Could not save. Is the browser storage full?'; }
        busy = false; $('#skin-save').disabled = false;
      }
    };
  } catch (error) {
    console.error('Skin editor failed', error);
    if (dialog.isConnected) status.textContent = 'Could not load the skin editor.';
  }
}

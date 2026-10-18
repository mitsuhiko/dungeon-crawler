// A separate, unarmed standing figure. Paint is a GPU-resident 2048² RGBA texture;
// the original hero and PNG stay untouched until both IndexedDB and hero save succeed.
import * as THREE from 'three';
import { rigReady, createFigure } from '../render/figure.js';
import { characterReady, setCharacterSkin } from '../render/character.js';
import { setSkinMap, createSkinPicker } from '../render/skin.js';
import { SkinPainter } from '../render/skinpaint.js';
import { SkinPreview } from '../render/skinpreview.js';
import { readSkinFile, writeSkinFile, deleteSkinFile, skinImage, readNamedSkin, writeNamedSkin, rollbackNamedSkin, recentNamedSkins, cacheNamedSkinPreview } from './skinfiles.js';
import { cleanSkinName, SKIN_NAME_MAX } from '../core/skin.js';

let active = false;
export const skinEditorOpen = () => active;
export async function openSkinEditor(hero, save) {
  if (active) return;
  active = true;
  const previousFocus = document.activeElement, dialog = document.createElement('dialog');
  dialog.id = 'skin-editor'; dialog.setAttribute('aria-labelledby', 'skin-title');
  dialog.innerHTML = `<h2 id="skin-title">Choose Skin <small>2048 × 2048</small></h2>
    <section id="skin-recents" aria-labelledby="skin-recents-title">
      <h3 id="skin-recents-title">Recent Skins</h3>
      <p>Your last 20 saved skins, newest first. Choose one to load it.</p>
      <ol id="skin-recent-list"></ol>
      <div class="skin-tools skin-chooser-footer"><button id="skin-recent-back" disabled>Paint Skin</button><button id="skin-chooser-close">Close</button></div>
    </section>
    <div id="skin-painting" hidden>
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
      <button id="skin-load" disabled>Load Skin</button>
      <button id="skin-recent" disabled aria-controls="skin-recents">Recent Skins</button>
    </div>
    <p>Enter a name to save. Type a saved name and choose Load Skin to restore it. Names stay in this browser.</p>
    <div class="skin-tools"><button id="skin-save" disabled>Save Skin</button><button id="skin-cancel">Cancel</button></div>
    </div>
    <p id="skin-status" role="status">Loading skin …</p>`;
  document.body.append(dialog); dialog.showModal();
  const $ = s => dialog.querySelector(s), status = $('#skin-status');
  $('#skin-name').value = cleanSkinName(hero.skin?.name);
  let renderer, figure, painter, resize, meshes = [], pickers = [], frame = null;
  let tool = 'pen', pointer = null, last = null, rotating = false, busy = false, dirty = false, viewDirty = true;
  const strokes = [], previewURLs = [];
  let thumbnails, previewEpoch = 0;
  function releasePreviews() { for (const url of previewURLs.splice(0)) URL.revokeObjectURL(url); }
  function close() {
    if (busy) return;
    active = false; cancelAnimationFrame(frame); resize?.disconnect();
    previewEpoch++; releasePreviews(); thumbnails?.dispose();
    painter?.dispose();
    // Figure geometry and shadow-depth material belong to the shared rig.
    meshes.forEach(o => o.material.dispose());
    pickers.forEach(p => { p.geometry.dispose(); p.material.dispose(); });
    renderer?.dispose(); dialog.remove(); previousFocus?.focus();
  }
  dialog.addEventListener('keydown', e => e.stopPropagation());
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  $('#skin-cancel').onclick = close;
  $('#skin-chooser-close').onclick = close;
  try {
    await Promise.all([rigReady, characterReady]);
    const blob = await readSkinFile(hero.skin);
    const image = blob ? await skinImage(blob) : null;
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
    for (const id of ['#skin-save', '#skin-load', '#skin-recent', '#skin-recent-back']) $(id).disabled = false;
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
      if (e.key === 'Enter') { e.preventDefault(); $('#skin-load').click(); }
    });
    function showPainting() {
      previewEpoch++;
      $('#skin-recents').hidden = true; $('#skin-painting').hidden = false;
      viewDirty = true; requestDraw();
    }
    $('#skin-recent-back').onclick = () => {
      if (busy) return;
      showPainting(); status.textContent = dirty ? 'Unsaved changes' : ''; $('#skin-recent').focus();
    };
    function attachPreview(card, blob) {
      const url = URL.createObjectURL(blob); previewURLs.push(url);
      card.image.src = url; card.image.hidden = false; card.placeholder.hidden = true;
    }
    async function loadPreviews(cards, epoch) {
      for (const card of cards) {
        if (!dialog.isConnected || epoch !== previewEpoch) return;
        try {
          const record = await readNamedSkin(card.entry.name);
          if (!record || record.revision !== card.entry.revision || epoch !== previewEpoch) continue;
          thumbnails ??= new SkinPreview(renderer);
          const blob = await thumbnails.render(record.blob);
          if (!blob || !dialog.isConnected || epoch !== previewEpoch) return;
          const current = await cacheNamedSkinPreview(record.name, record.revision, blob);
          if (current && epoch === previewEpoch && dialog.isConnected) attachPreview(card, blob);
        } catch (e) {
          if (epoch === previewEpoch && dialog.isConnected) {
            console.warn('Skin preview failed', e); card.placeholder.textContent = 'Preview unavailable';
          }
        }
      }
    }
    $('#skin-recent').onclick = async () => {
      if (busy) return;
      busy = true; status.textContent = 'Loading recent skins …';
      $('#skin-painting').hidden = true; $('#skin-recents').hidden = false;
      const epoch = ++previewEpoch;
      releasePreviews();
      const list = $('#skin-recent-list'); list.replaceChildren();
      const pending = [];
      try {
        const recent = await recentNamedSkins();
        if (!recent.length) {
          const empty = document.createElement('li'); empty.className = 'skin-recent-empty';
          empty.textContent = 'No saved skins yet. Paint a skin and save it with a name first.';
          list.append(empty);
        }
        for (const entry of recent) {
          const row = document.createElement('li'), button = document.createElement('button');
          const name = document.createElement('b'), date = document.createElement('small');
          const preview = document.createElement('span'), image = document.createElement('img'), placeholder = document.createElement('span');
          preview.className = 'skin-recent-preview'; image.hidden = true;
          image.alt = `Preview of ${entry.name}`; image.width = 144; image.height = 180;
          placeholder.textContent = 'Loading preview …'; preview.append(image, placeholder);
          const card = { entry, image, placeholder };
          if (entry.preview) attachPreview(card, entry.preview); else pending.push(card);
          button.type = 'button'; button.className = 'skin-recent-item'; name.textContent = entry.name;
          date.textContent = entry.savedAt ? new Date(entry.savedAt).toLocaleString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
          }) : 'Saved skin';
          button.append(preview, name, date); button.onclick = () => { void loadNamed(entry.name); };
          row.append(button); list.append(row);
        }
        status.textContent = ''; (list.querySelector('button') ?? $('#skin-recent-back')).focus();
        void loadPreviews(pending, epoch);
      } catch (e) { console.error(e); status.textContent = 'Could not load recent skins.'; }
      finally { busy = false; }
    };
    $('#skin-load').onclick = () => {
      if (busy) return;
      const name = requiredName();
      if (name) void loadNamed(name);
    };
    async function loadNamed(name) {
      if (busy) return;
      if (dirty && !confirm('Loading a skin will replace your unsaved painting. Continue?')) return;
      busy = true; status.textContent = 'Loading named skin …';
      try {
        const record = await readNamedSkin(name);
        if (!record) { status.textContent = `No skin named “${name}” was found in this browser.`; return; }
        const image = await skinImage(record.blob);
        const texture = new THREE.CanvasTexture(image); texture.colorSpace = THREE.SRGBColorSpace;
        strokes.length = 0; pointer = null; last = null;
        painter.copy(texture, true); texture.dispose();
        $('#skin-name').value = record.name; dirty = true; showPainting();
        status.textContent = `Loaded “${record.name}”. Choose Save Skin to apply it to this hero.`;
      } catch (e) { console.error(e); status.textContent = 'Could not load this named skin.'; }
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
      const name = requiredName();
      if (!name) return;
      busy = true; $('#skin-save').disabled = true; status.textContent = 'Saving texture …';
      let saved, receipt;
      try {
        if (await readNamedSkin(name) && !confirm(`Replace the saved skin named “${name}”?`)) {
          status.textContent = 'Choose a different name to keep both skins.';
          busy = false; $('#skin-save').disabled = false; return;
        }
        draw();
        const blob = await painter.png();
        saved = { ...await writeSkinFile(blob), name };
        thumbnails ??= new SkinPreview(renderer);
        const preview = await thumbnails.render(blob);
        receipt = await writeNamedSkin(name, blob, preview);
        if (!await save(saved)) throw new Error('Hero storage refused');
        await setCharacterSkin(saved);
        // The old immutable file is no longer referenced by this hero.
        deleteSkinFile(hero.skin).catch(console.warn);
        busy = false; close();
      } catch (e) {
        if (receipt) await rollbackNamedSkin(receipt).catch(console.warn);
        if (saved) await deleteSkinFile(saved).catch(console.warn);
        console.error(e); status.textContent = 'Could not save. Is the browser storage full?';
        busy = false; $('#skin-save').disabled = false;
      }
    };
    // Choose Skin is the entry screen; the painter is one action inside this menu.
    $('#skin-recent').click();
  } catch (error) {
    console.error('Skin editor failed', error);
    if (dialog.isConnected) status.textContent = 'Could not load the skin editor.';
  }
}

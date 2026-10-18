// Main menu console: (await import('/tests/browser/skin.js')).runSkinChecks()
import * as THREE from 'three';
import { rigReady, createFigure } from '../../src/render/figure.js';
import { createSkinPicker, setSkinMap } from '../../src/render/skin.js';
import { SkinPainter } from '../../src/render/skinpaint.js';
import { SkinPreview } from '../../src/render/skinpreview.js';
import { readSkinFile, writeSkinFile, deleteSkinFile, skinImage, readNamedSkin, writeNamedSkin, rollbackNamedSkin, recentNamedSkins } from '../../src/game/skinfiles.js';

const check = (condition, message) => { if (!condition) throw Error(message); };

// (await import('/tests/browser/skin.js')).runRecentSkinChecks()
export async function runRecentSkinChecks() {
  const receipts = [], prefix = `Recent ${crypto.randomUUID().slice(0,8)}`;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048;
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const names = [];
  try {
    for (let i = 0; i < 22; i++) {
      const name = `${prefix} ${i}`; names.push(name);
      receipts.push(await writeNamedSkin(name, blob));
    }
    let recent = await recentNamedSkins();
    check(recent.length === 20, 'Recent menu must contain at most the last 20 skins');
    check(recent.every((entry,i) => entry.name === names[21-i]), 'Recent skins must be newest first');
    check(recent.every(entry => !('blob' in entry)), 'Menu metadata must not retain full PNGs');
    check(!!await readNamedSkin(names[0]), 'Skins older than the last 20 must remain loadable by name');
    receipts.push(await writeNamedSkin(names[0], blob));
    recent = await recentNamedSkins();
    check(recent[0].name === names[0], 'Saving an existing name must move it to the top');
    check(new Set(recent.map(entry=>entry.name)).size === 20, 'Resaving a skin must not duplicate its menu entry');
    await rollbackNamedSkin(receipts.pop());
    check((await recentNamedSkins())[0].name === names[21], 'A failed save must restore the previous recent order');
    return ['last 20 only', 'newest-first ordering', 'older names preserved', 'resave promotion without duplicates', 'rollback restores order'];
  } finally {
    for (const receipt of receipts.reverse()) await rollbackNamedSkin(receipt);
  }
}

export async function runSkinChecks() {
  await rigReady;
  const renderer = new THREE.WebGLRenderer(), figure = createFigure(), meshes = [];
  figure.model.traverse(o => { if (o.isMesh) meshes.push(o); });
  figure.group.updateMatrixWorld(true);
  const pickers = meshes.map(createSkinPicker), painter = new SkinPainter(renderer, pickers);
  let saved, previewer;
  const receipts = [];
  try {
    for (const mesh of meshes) {
      check(!!mesh.geometry.attributes.uv, 'Character must have an exported UV atlas');
      check(!mesh.geometry.attributes.color, 'Paint must not use vertex colours');
    }
    const box = new THREE.Box3().setFromObject(figure.group), centre = box.getCenter(new THREE.Vector3());
    const height = box.getSize(new THREE.Vector3()).y;
    const camera = new THREE.PerspectiveCamera(35, 1, .01, 100);
    camera.position.copy(centre).add(new THREE.Vector3(0, 0, height * 1.75));
    camera.lookAt(centre); camera.updateMatrixWorld();
    painter.updateView(camera, 512, 512);
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(), camera);
    const hit = ray.intersectObjects(pickers, false)[0];
    check(!!hit?.uv, 'Picking must return interpolated texture coordinates');
    const texel = uv => (Math.floor(uv.y * painter.size) * painter.size + Math.floor(uv.x * painter.size)) * 4;
    const at = texel(hit.uv), pixel = p => [...p.slice(at, at+4)];
    painter.stroke({x:256,y:256}, {x:256,y:256}, 3, '#ff0000');
    const painted = await painter.pixels();
    const paintedCount = painted.filter((_,i) => i%4===3 && painted[i]>0).length;
    check(paintedCount > 5 && paintedCount < 10000, `Fine stroke should affect texels, not whole body (${paintedCount})`);
    check(painted[at] > 200 && painted[at+3] > 200, `Hit UV must be painted (${pixel(painted)})`);
    const reverse = camera.clone(); reverse.position.z = centre.z - height * 1.75;
    reverse.lookAt(centre); reverse.updateMatrixWorld();
    ray.setFromCamera(new THREE.Vector2(), reverse);
    const back = ray.intersectObjects(pickers, false)[0];
    check(back && painted[texel(back.uv)+3] === 0, 'Pen must not paint through to the back');

    const blob = await painter.png(); saved = await writeSkinFile(blob);
    const name = `Test ${crypto.randomUUID().slice(0,8)}`;
    check(await readNamedSkin(name) === null, 'Unknown skin names must not load another texture');
    previewer = new SkinPreview(renderer);
    const preview = await previewer.render(blob), bitmap = await createImageBitmap(preview);
    check(bitmap.width === 144 && bitmap.height === 180, 'Cards must contain rendered character thumbnails');
    const thumb = document.createElement('canvas'); thumb.width = 144; thumb.height = 180;
    const context = thumb.getContext('2d'); context.drawImage(bitmap,0,0); bitmap.close();
    const data = context.getImageData(0,0,144,180).data;
    let red = 0;
    for(let i=0;i<data.length;i+=4)if(data[i]>100&&data[i]>data[i+1]*1.5&&data[i]>data[i+2]*1.5)red++;
    check(red>0, 'The thumbnail must show the painted red stroke, not only an unpainted body');
    const first = await writeNamedSkin(name, blob, preview); receipts.push(first);
    check((await recentNamedSkins()).find(entry=>entry.name===name)?.preview?.size === preview.size,
      'Recent skin metadata must include its cached character preview');
    const named = await readNamedSkin(`  ${name.toUpperCase()}  `);
    check(named.name === name && named.blob.size === blob.size, 'Names must round trip and load case-insensitively');
    const replacement = await writeNamedSkin(name, blob); receipts.push(replacement);
    check((await readNamedSkin(name)).revision === replacement.record.revision, 'Named replacement must be saved');
    await rollbackNamedSkin(replacement); receipts.pop();
    check((await readNamedSkin(name)).revision === first.record.revision, 'A failed hero save must restore the previous named skin');
    const reloaded = await skinImage(await readSkinFile(saved));
    const texture = new THREE.CanvasTexture(reloaded); texture.colorSpace = THREE.SRGBColorSpace;
    painter.clear(); painter.copy(texture, true); texture.dispose();
    await deleteSkinFile(saved); saved = null;
    check((await readNamedSkin(name)).blob.size === blob.size, 'Deleting a hero texture must not delete the named library copy');
    const restored = await painter.pixels();
    check(pixel(restored).every((v,i)=>Math.abs(v-pixel(painted)[i])<=2), 'PNG round trip must preserve colour, alpha and UV orientation');
    painter.stroke({x:256,y:256}, {x:256,y:256}, 5, '#000000', true);
    const erased = await painter.pixels();
    check(erased[at+3] === 0, 'Eraser must remove paint alpha and reveal the original clay');

    // Find a UV seam visible in this camera, then paint both islands with one projected stamp.
    let seamTested = false;
    for (const [a,b] of painter.seams) {
      if (Math.hypot(a.ub[0]-a.ua[0],a.ub[1]-a.ua[1])*painter.size < 8) continue;
      const world = new THREE.Vector3().fromArray(a.a).lerp(new THREE.Vector3().fromArray(a.b),.5);
      const screen = world.clone().project(camera);
      if (Math.abs(screen.x)>.8 || Math.abs(screen.y)>.8) continue;
      ray.setFromCamera(new THREE.Vector2(screen.x,screen.y),camera);
      const visible = ray.intersectObjects(pickers,false)[0];
      if (!visible || visible.point.distanceTo(world)>.002) continue;
      const inside = e => new THREE.Vector2((e.ua[0]+e.ub[0])/2-e.outward[0]*1.5/painter.size,
        (e.ua[1]+e.ub[1])/2-e.outward[1]*1.5/painter.size);
      painter.clear();
      painter.stroke({x:(screen.x*.5+.5)*512,y:(screen.y*.5+.5)*512},
        {x:(screen.x*.5+.5)*512,y:(screen.y*.5+.5)*512},8,'#00ff00');
      const pixels = await painter.pixels(), aa = texel(inside(a)), bb = texel(inside(b));
      if (pixels[aa+1]>200 && pixels[bb+1]>200) { seamTested = true; break; }
    }
    check(seamTested, 'One screen-space stamp must paint both sides of a visible UV seam');
    painter.clear();
    check(await painter.fill(hit.uv, '#4287ff') === -1, 'An empty skin has no closed outline to fill');
    const line = (a,b) => painter.stroke({x:a[0],y:a[1]},{x:b[0],y:b[1]},1.5,'#ff0000');
    // A rectangle with a gap must not flood the body. Close that exact gap and retry.
    line([244,244],[268,244]); line([268,244],[268,268]); line([268,268],[260,268]);
    line([252,268],[244,268]); line([244,268],[244,244]);
    check(await painter.fill(hit.uv, '#4287ff') === -1, 'A gap must prevent filling');
    line([260,268],[252,268]);
    const changed = await painter.fill(hit.uv, '#4287ff');
    const filled = await painter.pixels();
    check(changed > 0 && filled[at+3]>200, 'Closing the outline must allow the entire inside to fill');
    check(filled[texel(back.uv)+3]===0, 'The area outside the outline, including the back, must stay unpainted');
    check(painter.mask.some(v=>v===0) && painter.mask.some(v=>v===1), 'Mask must exclude empty atlas space');
    meshes.forEach(mesh=>setSkinMap(mesh,painter.texture,true));
    return ['exported UV atlas (no vertex paint)', `fine texture brush (${paintedCount} texels)`,
      'depth rejection / no paint-through', 'PNG + IndexedDB round trip', 'alpha eraser', 'seamless projected stroke', 'closed-outline fill / gap rejection',
      'named skin library / case-insensitive loading / replacement rollback', 'painted character thumbnail caching'];
  } finally {
    if (saved) await deleteSkinFile(saved);
    for (const receipt of receipts.reverse()) await rollbackNamedSkin(receipt);
    previewer?.dispose(); painter.dispose(); renderer.dispose();
    meshes.forEach(m=>m.material.dispose());
    pickers.forEach(p=>{p.geometry.dispose();p.material.dispose();});
  }
}

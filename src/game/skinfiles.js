// Large PNGs belong in IndexedDB; hero JSON in localStorage only keeps an immutable id.
import { checkSkin, SKIN_UV, SKIN_SIZE, cleanSkinName, skinNameKey } from '../core/skin.js';
let opening;
function database() {
  if (!opening) opening = new Promise((resolve, reject) => {
    const request = indexedDB.open('crawler.skins', 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('textures')) db.createObjectStore('textures');
      const names = db.objectStoreNames.contains('names')
        ? request.transaction.objectStore('names') : db.createObjectStore('names');
      if (!names.indexNames.contains('savedAt')) names.createIndex('savedAt', 'savedAt');
      // Old named skins have no known save date. Keep them available at the end.
      const cursor = names.openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        if (!Number.isFinite(entry.value.savedAt)) entry.update({ ...entry.value, savedAt: 0 });
        entry.continue();
      };
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Skin database blocked by another tab'));
  }).catch(error => { opening = null; throw error; });
  return opening;
}
async function operation(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('textures', mode), request = action(tx.objectStore('textures'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Skin storage failed'));
  });
}
export async function readSkinFile(skin) {
  if (!checkSkin(skin)) return null;
  const blob = await operation('readonly', store => store.get(skin.id));
  if (!(blob instanceof Blob)) throw new Error('Saved skin texture is missing');
  return blob;
}
export async function writeSkinFile(blob) {
  const skin = { v: 2, uv: SKIN_UV, id: `skin-${crypto.randomUUID()}` };
  await operation('readwrite', store => store.put(blob, skin.id));
  return skin;
}
export async function deleteSkinFile(skin) {
  if (checkSkin(skin)) await operation('readwrite', store => store.delete(skin.id));
}
// The named library owns independent PNG copies: replacing/deleting a hero's immutable
// texture must never remove a skin that another hero can still load by name.
export async function readNamedSkin(name) {
  const key = skinNameKey(name);
  if (!key) return null;
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('names', 'readonly'), request = tx.objectStore('names').get(key);
    tx.oncomplete = () => {
      const record = request.result;
      if (!record) { resolve(null); return; }
      if (record.uv !== SKIN_UV || !(record.blob instanceof Blob)) {
        reject(new Error('This named skin uses an incompatible texture layout')); return;
      }
      resolve(record);
    };
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Could not load named skin'));
  });
}
export async function writeNamedSkin(name, blob, preview = null) {
  name = cleanSkinName(name);
  if (!name) throw new Error('A skin name is required');
  const db = await database(), key = skinNameKey(name);
  const record = { name, uv: SKIN_UV, blob, revision: crypto.randomUUID(), ...(preview instanceof Blob ? { preview } : {}) };
  return new Promise((resolve, reject) => {
    const tx = db.transaction('names', 'readwrite'), names = tx.objectStore('names');
    const read = names.get(key), latest = names.index('savedAt').openCursor(null, 'prev');
    let previous;
    read.onsuccess = () => { previous = read.result; };
    latest.onsuccess = () => {
      // Serialized write transactions provide a stable newest-first order even if
      // several saves (or tabs) share the same millisecond.
      record.savedAt = Math.max(Date.now(), (latest.result?.value.savedAt ?? 0) + 1);
      names.put(record, key);
    };
    tx.oncomplete = () => resolve({ key, record, previous });
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Could not save named skin'));
  });
}
export async function recentNamedSkins() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('names', 'readonly');
    const request = tx.objectStore('names').index('savedAt').openCursor(null, 'prev');
    const recent = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || recent.length >= 20) return;
      const record = cursor.value;
      if (record.uv === SKIN_UV && record.blob instanceof Blob && cleanSkinName(record.name)) {
        // Do not keep the full PNG blobs in the menu's state.
        recent.push({ name: record.name, savedAt: record.savedAt, revision: record.revision,
          preview: record.preview instanceof Blob ? record.preview : null });
      }
      if (recent.length < 20) cursor.continue();
    };
    tx.oncomplete = () => resolve(recent);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Could not load recent skins'));
  });
}

// Cache derived thumbnails without changing save order or overwriting a newer painting.
export async function cacheNamedSkinPreview(name, revision, preview) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('names', 'readwrite'), names = tx.objectStore('names');
    const read = names.get(skinNameKey(name)); let stored = false;
    read.onsuccess = () => {
      if (read.result?.revision !== revision) return;
      names.put({ ...read.result, preview }, skinNameKey(name)); stored = true;
    };
    tx.oncomplete = () => resolve(stored);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Could not cache skin preview'));
  });
}

export async function rollbackNamedSkin(receipt) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('names', 'readwrite'), names = tx.objectStore('names'), read = names.get(receipt.key);
    read.onsuccess = () => {
      // Do not roll back a newer save made by another tab in the meantime.
      if (read.result?.revision !== receipt.record.revision) return;
      if (receipt.previous) names.put(receipt.previous, receipt.key); else names.delete(receipt.key);
    };
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Could not restore named skin'));
  });
}

export async function skinImage(blob) {
  // Export flips WebGL rows into PNG order. Drawing into a canvas lets the default
  // CanvasTexture flipY restore that orientation (ImageBitmap itself ignores flipY).
  const image = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  if (image.width !== SKIN_SIZE || image.height !== SKIN_SIZE) { image.close(); throw new Error('Unexpected skin size'); }
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  canvas.getContext('2d').drawImage(image, 0, 0); image.close();
  return canvas;
}

// Paint lives in a 2048² RGBA texture, not in the character's vertex colours.
export const SKIN_SIZE = 2048;
export const SKIN_UV = 'character-v1';
export const SKIN_NAME_MAX = 32;
export function cleanSkinName(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SKIN_NAME_MAX);
}
export const skinNameKey = value => cleanSkinName(value).toLowerCase();
export function checkSkin(value) {
  if (!value || value.v !== 2 || value.uv !== SKIN_UV || typeof value.id !== 'string'
      || !/^skin-[a-zA-Z0-9-]{1,80}$/.test(value.id)) return null;
  const name = cleanSkinName(value.name);
  return { v: 2, uv: SKIN_UV, id: value.id, ...(name ? { name } : {}) };
}

// Pixels use WebGL's bottom-up order. Only atlas texels may be filled. Explicit seam
// links join corresponding texels of separate UV islands without crossing empty gutters.
export function textureComponents(width, height, mask, seams) {
  const size = width * height, labels = new Uint32Array(size), queue = new Uint32Array(size);
  let label = 0;
  for (let start = 0; start < size; start++) {
    if (!mask[start] || labels[start]) continue;
    label++;
    let end = 1; queue[0] = start; labels[start] = label;
    const visit = p => {
      if (p < 0 || p >= size || !mask[p] || labels[p]) return;
      labels[p] = label; queue[end++] = p;
    };
    for (let i = 0; i < end; i++) {
      const p = queue[i], x = p % width;
      if (x) visit(p - 1);
      if (x + 1 < width) visit(p + 1);
      visit(p - width); visit(p + width);
      for (const other of seams.get(p) ?? []) visit(other);
    }
  }
  return labels;
}

// Returns -1 for an open outline, 0 for no change, or the number of filled texels.
// A closed outline must separate two same-colour areas of the *same physical surface*.
// Disconnected atlas slivers/other meshes cannot make an open line look enclosed.
export function fillTexture(pixels, width, height, mask, seams, seed, rgba, components) {
  const size = width * height;
  if (seed < 0 || seed >= size || !mask[seed]) return 0;
  const at = seed * 4, before = pixels.slice(at, at + 4);
  if (rgba.every((v, i) => v === before[i])) return 0;
  const seen = new Uint8Array(size), queue = new Uint32Array(size);
  let end = 1;
  const matches = p => {
    const o = p * 4;
    return Math.abs(pixels[o] - before[0]) <= 8 && Math.abs(pixels[o+1] - before[1]) <= 8
      && Math.abs(pixels[o+2] - before[2]) <= 8 && Math.abs(pixels[o+3] - before[3]) <= 8;
  };
  queue[0] = seed; seen[seed] = 2;
  function visit(p) {
    if (p < 0 || p >= size || seen[p] || !mask[p]) return;
    seen[p] = 1;
    // Small tolerance handles rasterisation noise, without jumping a drawn border.
    if (!matches(p)) return;
    seen[p] = 2; queue[end++] = p;
  }
  for (let i = 0; i < end; i++) {
    const p = queue[i], x = p % width;
    if (x) visit(p - 1);
    if (x + 1 < width) visit(p + 1);
    visit(p - width); visit(p + width);
    for (const other of seams.get(p) ?? []) visit(other);
  }
  components ??= textureComponents(width, height, mask, seams);
  const component = components[seed];
  let enclosed = false;
  for (let p = 0; p < size; p++) if (components[p] === component && seen[p] !== 2 && matches(p)) {
    enclosed = true; break;
  }
  if (!enclosed) return -1;  // Do not alter even one pixel when the outline has a gap.
  for (let i = 0; i < end; i++) pixels.set(rgba, queue[i] * 4);
  return end;
}

// Repeat boundary texels into the atlas gutters after a CPU flood fill. This is
// deliberately outside the mask only; it must never thicken a drawn line on the skin.
export function padTexture(pixels, width, height, mask, radius = 3) {
  const seen = new Uint8Array(mask), size = width * height;
  let frontier = [];
  const neighbours = p => {
    const out = [], x = p % width;
    if (x) out.push(p - 1);
    if (x + 1 < width) out.push(p + 1);
    if (p >= width) out.push(p - width);
    if (p + width < size) out.push(p + width);
    return out;
  };
  for (let p = 0; p < size; p++) if (mask[p]) {
    for (const n of neighbours(p)) if (!seen[n]) {
      seen[n] = 1; pixels.set(pixels.subarray(p * 4, p * 4 + 4), n * 4); frontier.push(n);
    }
  }
  for (let step = 1; step < radius; step++) {
    const next = [];
    for (const p of frontier) for (const n of neighbours(p)) if (!seen[n]) {
      seen[n] = 1; pixels.set(pixels.subarray(p * 4, p * 4 + 4), n * 4); next.push(n);
    }
    frontier = next;
  }
}

// PNGs contain straight-alpha sRGB; the GPU paint layer contains premultiplied linear RGB.
export function linearPaintToPNG(pixels, width, height) {
  const out = new Uint8ClampedArray(pixels.length);
  const srgb = x => x <= .0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - .055;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = (y * width + x) * 4, to = ((height - 1 - y) * width + x) * 4;
    const alpha = pixels[from + 3]; out[to + 3] = alpha;
    if (alpha) for (let c = 0; c < 3; c++) out[to + c] = Math.round(srgb(Math.min(1, pixels[from + c] / alpha)) * 255);
  }
  return out;
}

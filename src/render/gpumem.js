// With ?perf=1 (game/perf.js): what the game's WebGL holds, counted as it is made and let go, for
// the overlay. No browser tells a page how much of the GPU's memory it uses (and on a phone that
// memory is the phone's: iOS Safari kills a page that takes too much, render/device.js), so the
// calls that make textures, buffers and render buffers are counted: their sizes as asked for
// (what the driver adds, padding, mip levels it makes itself, is not seen). Imported first
// (main.js): before anything is made.
const on = typeof location === 'object' && new URLSearchParams(location.search).get('perf') === '1'
  && typeof WebGL2RenderingContext === 'function';
const held = new Map();   // texture, buffer or render buffer -> { kind, bytes, parts: Map }
const totals = { texture: 0, buffer: 0, renderbuffer: 0 };
let peak = 0;

if (on) {
  const C = WebGL2RenderingContext, P = C.prototype;
  // bytes a texel (formats the game uses; anything else counted as 4)
  const SIZES = new Map([[C.R8, 1], [C.RED, 1], [C.ALPHA, 1], [C.LUMINANCE, 1], [C.RG8, 2], [C.R16F, 2], [C.LUMINANCE_ALPHA, 2],
    [C.DEPTH_COMPONENT16, 2], [C.RGB565, 2], [C.RGBA4, 2], [C.RGB5_A1, 2], [C.RGBA16F, 8], [C.RG32F, 8], [C.RGB16F, 8],
    [C.RGBA32F, 16], [C.RGB32F, 16]]);
  const texel = (format, type) => {
    if (format === C.RGBA || format === C.RGB) return type === C.FLOAT ? 16 : type === C.HALF_FLOAT ? 8 : 4;
    if (format === C.DEPTH_COMPONENT) return type === C.UNSIGNED_SHORT ? 2 : 4;
    return SIZES.get(format) ?? 4;
  };
  const note = (object, kind, part, bytes) => {
    if (!object) return;
    let e = held.get(object);
    if (!e) held.set(object, e = { kind, bytes: 0, parts: new Map() });
    const d = bytes - (e.parts.get(part) ?? 0);
    e.parts.set(part, bytes); e.bytes += d; totals[kind] += d;
    peak = Math.max(peak, totals.texture + totals.buffer + totals.renderbuffer);
  };
  const drop = object => { const e = held.get(object); if (e) { totals[e.kind] -= e.bytes; held.delete(object); } };
  // what is bound where (textures: by unit and target; a cube's faces count as the cube)
  let unit = 0, renderbuffer = null;
  const textures = new Map(), buffers = new Map();
  const cube = t => (t >= C.TEXTURE_CUBE_MAP_POSITIVE_X && t <= C.TEXTURE_CUBE_MAP_NEGATIVE_Z ? C.TEXTURE_CUBE_MAP : t);
  const bound = t => textures.get(unit * 65536 + cube(t));
  const after = (name, f) => {
    const original = P[name];
    P[name] = function (...a) { const r = original.apply(this, a); f(a); return r; };
  };
  after('activeTexture', ([u]) => { unit = u; });
  after('bindTexture', ([t, tex]) => textures.set(unit * 65536 + t, tex));
  after('bindBuffer', ([t, b]) => buffers.set(t, b));
  after('bindRenderbuffer', ([, rb]) => { renderbuffer = rb; });
  for (const name of ['deleteTexture', 'deleteBuffer', 'deleteRenderbuffer']) after(name, ([o]) => drop(o));
  // (target, level, internal format, width, height, border, format, type, ...), or (target,
  // level, internal format, format, type, an image or a canvas)
  after('texImage2D', a => {
    const long = a.length >= 8, source = a[5];
    const w = long ? a[3] : source?.videoWidth || source?.width || 0, h = long ? a[4] : source?.videoHeight || source?.height || 0;
    note(bound(a[0]), 'texture', `${a[0]}:${a[1]}`, w * h * texel(a[2], long ? a[7] : a[4]));
  });
  after('texImage3D', ([target, level, format, w, h, d, , , type]) => note(bound(target), 'texture', `${target}:${level}`, w * h * d * texel(format, type)));
  after('compressedTexImage2D', ([target, level, , , , , data]) => note(bound(target), 'texture', `${target}:${level}`, data?.byteLength ?? 0));
  const storage = (target, levels, format, w, h, d = 1) => {
    let bytes = 0;
    for (let l = 0; l < levels; l++) { bytes += Math.max(1, w >> l) * Math.max(1, h >> l) * (target === C.TEXTURE_3D ? Math.max(1, d >> l) : d) * texel(format); }
    note(bound(target), 'texture', 'storage', bytes * (target === C.TEXTURE_CUBE_MAP ? 6 : 1));
  };
  after('texStorage2D', ([target, levels, format, w, h]) => storage(target, levels, format, w, h));
  after('texStorage3D', ([target, levels, format, w, h, d]) => storage(target, levels, format, w, h, d));
  after('bufferData', ([target, data]) => note(buffers.get(target), 'buffer', 'data', typeof data === 'number' ? data : data?.byteLength ?? 0));
  after('renderbufferStorage', ([, format, w, h]) => note(renderbuffer, 'renderbuffer', 'data', w * h * texel(format)));
  after('renderbufferStorageMultisample', ([, samples, format, w, h]) => note(renderbuffer, 'renderbuffer', 'data', w * h * texel(format) * Math.max(1, samples)));
}

// what is held now and at most (MB), or null without ?perf=1
export const gpuMemory = () => on ? { textures: totals.texture / 2 ** 20, buffers: totals.buffer / 2 ** 20,
  renderbuffers: totals.renderbuffer / 2 ** 20, total: (totals.texture + totals.buffer + totals.renderbuffer) / 2 ** 20, peak: peak / 2 ** 20 } : null;

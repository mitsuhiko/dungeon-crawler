// How an item looks: a small pixelated texture made from the item's own data, so two swords of
// one base look apart, and every potion, coin and quest thing has a surface of its own kind
// (docs/looks.md). Pure: the same item gives the same pixels, here, on a friend's screen and
// after a load, from what is saved and sent already (`gen`), never a seed of its own.
//
//   lookOf(item)     what decides the look: { itemId, seed, rarity, enchant, marks }
//                    item: { itemId, gen? } (a bag slot, a pickup) or a bare item id
//   lookKey(item)    the same as a short string, 'itemId:seed:rarity:enchant:mark+mark' (pictures
//                    and textures are kept by it; friends are sent it: net/protocol.js)
//   parseLook(key)   a key back into a look (null when it is not one: it came over the network)
//   paintLook(look)  the texture: LOOK_W x LOOK_H RGBA bytes, a 16x16 tile for each of the
//                    models' material slots (LOOK_SLOTS), left to right
//
// What decides it: the seed (from the base and the name it was found with, so it stays through
// the Enchanter and the Smith) picks the patterns; the rarity how much is done to it (rust on
// Crap, inlays, gems, filigree, glowing runes on the best); the enchantment an element (embers,
// drips, frost, sparks, sparkles); every affix a little mark of its own. Stackable things (potions,
// coins, crystals, quest things) look the same as others of their kind: the seed is the item id's.
//
// A texel is one of three things (render/looks.js draws them so): alpha 0, its colour shades the
// model's own (128 grey leaves it, darker darkens, lighter lightens: grain, engravings); alpha
// 128, its colour is painted over it (an inlay, rust); alpha 255, painted and glowing.
import { ITEMS } from './items.js';
import { RARITY } from './gear/rarities.js';
import { mulberry32, hash32 } from './util.js';

export const LOOK_TILE = 16;
// the glTF materials the item models are made of (blender/items.py surface, blender/armor.py), each
// with its tile: wood, leather and cloth; metal; armor's trim; gems and glass
export const LOOK_SLOTS = ['clay', 'metal', 'trim', 'facets'];
export const LOOK_W = LOOK_TILE * LOOK_SLOTS.length, LOOK_H = LOOK_TILE;
// the slot of a glTF material by its name (-1: none, it keeps its own look: a quest thing's glow);
// the glassmaker's old sword (assets/sword.glb, blender/sword.py) has a blade, a guard and a grip
export const lookSlot = name => /Items_Clay|SwordGrip/.test(name) ? 0 : /Items_Metal|SwordBlade|SwordGuard/.test(name) ? 1
  : /Items_Trim/.test(name) ? 2 : /Items_Facets/.test(name) ? 3 : -1;

// the colour of each enchantment's element (core/gear/enchants.js), sRGB
const ELEMENTS = { toasty: [255, 122, 42], icky: [143, 220, 60], nippy: [190, 232, 255], zappy: [196, 140, 255], shiny: [255, 246, 214] };
const MARKS = new Set(['sharp', 'brutal', 'swift', 'sweeping', 'vicious', 'reach', 'distance', 'leech', 'force', 'precision',
  'sturdy', 'thick', 'blocky', 'zippy', 'hearty', 'mending', 'fireproof', 'antivenom', 'steady']);

const fnv = s => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
};

export function lookOf(item) {
  const itemId = typeof item === 'string' ? item : item?.itemId, gen = typeof item === 'object' ? item?.gen : null;
  if (!ITEMS[itemId]) return null;
  if (!gen) return { itemId, seed: hash32(fnv(itemId)), rarity: null, enchant: null, marks: [] };
  return { itemId, seed: hash32(fnv(itemId) ^ fnv(String(gen.name ?? ''))),
    rarity: RARITY[gen.rarity] ? gen.rarity : null, enchant: ELEMENTS[gen.enchant] ? gen.enchant : null,
    marks: (gen.affixes ?? []).map(a => a.id).filter(id => MARKS.has(id)).slice(0, 6) };
}

const keyOf = l => `${l.itemId}:${l.seed.toString(16)}:${l.rarity ?? ''}:${l.enchant ?? ''}:${l.marks.join('+')}`;
// an item, an item id or already a key -> its key ('' for nothing known)
export function lookKey(item) {
  if (typeof item === 'string' && item.includes(':')) return parseLook(item) ? item : '';
  const l = lookOf(item);
  return l ? keyOf(l) : '';
}
export function parseLook(key) {
  if (typeof key !== 'string' || key.length > 200) return null;
  const [itemId, seed, rarity, enchant, marks, ...rest] = key.split(':');
  if (rest.length || !ITEMS[itemId] || !/^[0-9a-f]{1,8}$/.test(seed ?? '') || (rarity && !RARITY[rarity])
      || (enchant && !ELEMENTS[enchant]) || marks === undefined) return null;
  const list = marks ? marks.split('+') : [];
  if (list.length > 6 || !list.every(m => MARKS.has(m))) return null;
  return { itemId, seed: parseInt(seed, 16) >>> 0, rarity: rarity || null, enchant: enchant || null, marks: list };
}

// --- painting ------------------------------------------------------------------------------

const T = LOOK_TILE;
const clampByte = v => Math.max(0, Math.min(255, Math.round(v)));
const hex = css => [1, 3, 5].map(i => parseInt(css.slice(i, i + 2), 16));
// (square roots and integer maths only where it decides which texel is what: every browser draws
// the same pixels, which Math.hypot or Math.sin need not)
const len = (x, y) => Math.sqrt(x * x + y * y);
const WAVE = [0, 1, 1, 1, 0, -1, -1, -1];
const GOLD = [236, 192, 92], RUST = [[138, 70, 38], [164, 92, 46], [112, 58, 34]], RUNE_HUES = 8;
// hue h (0..1) at full saturation, sRGB
const hue = h => [0, 2, 4].map(o => clampByte(255 * Math.max(0, Math.min(1, Math.abs(((h * 6 + o) % 6) - 3) - 1))));

// One tile: wrapping coordinates, three kinds of texel (see the top).
function tile() {
  const px = new Uint8ClampedArray(T * T * 4);
  const at = (x, y) => ((((y % T) + T) % T) * T + (((x % T) + T) % T)) * 4;
  const t = {
    px,
    // shade by k (1: unchanged), or by [r, g, b] factors
    shade(x, y, k) {
      const i = at(x, y), f = Array.isArray(k) ? k : [k, k, k];
      if (px[i + 3]) return;   // (paint stays on top)
      for (let c = 0; c < 3; c++) px[i + c] = clampByte(128 * f[c]);
    },
    // multiply what is there (a shade on a shade)
    darken(x, y, k) {
      const i = at(x, y);
      for (let c = 0; c < 3; c++) px[i + c] = clampByte(px[i + c] * k);
    },
    paint(x, y, rgb, glow = false) {
      const i = at(x, y);
      px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = glow ? 255 : 128;
    },
    painted: (x, y) => px[at(x, y) + 3] > 0,
  };
  for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = 128;
  return t;
}

// distance on the wrapping tile
const wrapD = (a, b) => { const d = Math.abs(a - b) % T; return Math.min(d, T - d); };
const each = fn => { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) fn(x, y); };

// The patterns, each over a whole tile (what the surface is made of). R: the tile's random.
const STUFF = {
  // plain stuff with a fine grain (quest things, sticks, corks)
  grain(t, R) { each((x, y) => t.shade(x, y, 0.93 + 0.14 * R())); for (let i = 0; i < 6; i++) t.shade(R() * T | 0, R() * T | 0, 0.8); },
  // wood: streaks along the length (v), each column its own, and now and then a knot
  wood(t, R) {
    const col = Array.from({ length: T }, () => 0.86 + 0.24 * R());
    each((x, y) => t.shade(x, y, col[x] * (0.96 + 0.08 * R())));
    if (R() < 0.7) {
      const kx = R() * T | 0, ky = R() * T | 0;
      for (let y = -2; y <= 2; y++) for (let x = -1; x <= 1; x++) if (Math.abs(x) + Math.abs(y) < 3) t.darken(kx + x, ky + y, Math.abs(x) + Math.abs(y) ? 0.85 : 0.65);
    }
  },
  // a grip wrapped in leather strips: diagonal bands with a lighter edge
  wrap(t, R) {
    const p = R() < 0.5 ? 4 : 8, w = p / 2, dir = R() < 0.5 ? 1 : -1;
    each((x, y) => { const u = (((x + dir * y) % p) + p) % p; t.shade(x, y, (u < w ? 0.8 : u === w ? 1.18 : 1.02) * (0.95 + 0.1 * R())); });
  },
  // leather: mottled, stitched along a row
  leather(t, R) {
    const blots = Array.from({ length: 5 }, () => [R() * T, R() * T, 2 + R() * 3]);
    each((x, y) => {
      let k = 1;
      for (const [bx, by, r] of blots) if (len(wrapD(x, bx), wrapD(y, by)) < r) k -= 0.06;
      t.shade(x, y, k * (0.95 + 0.1 * R()));
    });
    const row = R() * T | 0;
    for (let x = 0; x < T; x += 3) { t.darken(x, row, 0.6); t.darken(x + 1, row, 0.6); }
  },
  // cloth: a weave, quilted or dotted
  cloth(t, R) {
    each((x, y) => t.shade(x, y, (x + y) % 2 ? 0.95 : 1.05));
    const how = R() * 3 | 0, p = R() < 0.5 ? 8 : 16;
    if (how === 0) each((x, y) => { if ((x % p === 0 || y % p === 0) && (x + y) % 2) t.darken(x, y, 0.72); });   // quilted
    else if (how === 1) for (let y = 2; y < T; y += 8) for (let x = (y / 8 & 1) * 4 + 2; x < T; x += 8) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) t.shade(x + dx, y + dy, 1.3);   // dots
    else for (let y = 0; y < T; y += 4) for (let x = 0; x < T; x++) t.darken(x, y, 0.82);   // stripes
  },
  // paper: lines of writing
  paper(t, R) {
    each((x, y) => t.shade(x, y, 0.97 + 0.06 * R()));
    for (let y = 2; y < T; y += 3) { let x = R() * 3 | 0; while (x < T - 1) { const n = 1 + (R() * 4 | 0); for (let i = 0; i < n && x < T; i++) t.darken(x++, y, 0.62); x += 1; } }
  },
  // metal brushed along the length, a fuller down the middle
  blade(t, R) {
    const col = Array.from({ length: T }, () => 0.93 + 0.14 * R());
    each((x, y) => t.shade(x, y, col[x]));
    if (R() < 0.6) for (let y = 0; y < T; y++) { t.darken(7, y, 0.8); t.darken(8, y, 1.15); }
  },
  // hammered: dents (the nearest of a few points, wrapping)
  hammered(t, R) {
    const pts = Array.from({ length: 6 }, () => [R() * T, R() * T]);
    each((x, y) => {
      const d = pts.map(([px, py]) => len(wrapD(x, px), wrapD(y, py))).sort((a, b) => a - b);
      t.shade(x, y, 0.88 + 0.08 * Math.min(1, d[0] / 3) + (d[1] - d[0] < 1 ? 0.14 : 0));
    });
  },
  // plates with rivets
  plate(t, R) {
    const p = R() < 0.5 ? 8 : 16;
    each((x, y) => t.shade(x, y, (y % p === 0 ? 0.76 : y % p === 1 ? 1.12 : 1) * (0.97 + 0.06 * R())));
    for (let y = 3; y < T; y += p) for (let x = 2; x < T; x += 4) { t.shade(x, y, 1.4); t.shade(x, y + 1, 0.7); }
  },
  // scales, in offset rows
  scales(t, R) {
    each((x, y) => {
      const row = y >> 2, cx = ((x + (row & 1) * 2) % 4) - 1.5, cy = (y % 4) - 0.5;
      t.shade(x, y, len(cx, cy) > 1.7 ? 0.74 : 1.04 + 0.08 * R());
    });
  },
  // little rings, linked
  rings(t) { each((x, y) => { const cx = x % 4, cy = (y + ((x >> 2) & 1) * 2) % 4; t.shade(x, y, cx === 0 || cy === 0 ? 0.7 : cx === 1 || cy === 1 ? 1.2 : 1); }); },
  // a coin's face: a rim and a stamp in the middle (the tile's centre is the model's: render/looks.js)
  coin(t, R) {
    each((x, y) => { const r = len(x - 7.5, y - 7.5); t.shade(x, y, r > 6.5 && r < 7.6 ? 0.72 : r >= 7.6 ? 1.1 : 1 + 0.06 * R()); });
    stamp(t, GLYPHS[['crown', 'star', 'bird'][R() * 3 | 0]], 5, 5, 0.66, 1.25);
  },
  // trims: a twisted rope, beads, a zigzag, a meander, stripes
  rope(t) { each((x, y) => { const u = (x + y) % 4; t.shade(x, y, u === 0 ? 0.7 : u === 1 ? 1.25 : 1); }); },
  beads(t) { each((x, y) => { const r = len((x % 4) - 1.5, (y % 4) - 1.5); t.shade(x, y, r < 1.2 ? 1.3 : r < 2 ? 0.95 : 0.72); }); },
  zigzag(t) { each((x, y) => { const z = Math.abs((x % 8) - 4); t.shade(x, y, (y % 8 === z || (y + 1) % 8 === z) ? 1.3 : 0.92); }); },
  meander(t) {
    const key = ['#######.', '#.....#.', '#.###.#.', '#.#.#.#.', '#.#...#.', '#.#####.', '#.......', '########'];
    each((x, y) => t.shade(x, y, key[y % 8][x % 8] === '#' ? 1.2 : 0.82));
  },
  stripes(t, R) { const p = R() < 0.5 ? 4 : 6; each((x, y) => t.shade(x, y, y % p < p / 2 ? 1.15 : 0.85)); },
  // gems and crystals: glints and flaws
  glints(t, R) {
    each((x, y) => t.shade(x, y, 0.95 + 0.1 * R()));
    for (let i = 0; i < 5; i++) { const x = R() * T | 0, y = R() * T | 0; t.shade(x, y, 1.55); t.shade(x + 1, y, 1.2); t.shade(x, y + 1, 1.2); }
    for (let i = 0, x = R() * T | 0, y = R() * T | 0; i < 6; i++) t.darken(x + i, y + (i >> 1), 0.8);
  },
  // a potion's glass: bubbles rising
  bubbles(t, R) {
    each((x, y) => t.shade(x, y, 1));
    for (let i = 0; i < 5; i++) {
      const bx = R() * T, by = R() * T, r = 0.8 + R() * 1.6;
      each((x, y) => { const d = len(wrapD(x, bx), wrapD(y, by)); if (Math.abs(d - r) < 0.6) t.shade(x, y, 1.35); });
    }
  },
};

// Little pictures, 5x5: the coins' stamps, the affixes' marks, the runes'. '#' is drawn.
const GLYPHS = {
  crown: ['#.#.#', '#####', '#####', '.....', '#####'], star: ['..#..', '.###.', '#####', '.###.', '#...#'],
  bird: ['#...#', '##.##', '.###.', '..#..', '.#.#.'],
  sharp: ['#....', '.#...', '..#..', '.#...', '#....'],        // Pointy: a point
  brutal: ['..#..', '.###.', '#####', '.....', '#####'],       // Rude: a spike
  swift: ['#..#.', '.#..#', '..#..', '.#..#', '#..#.'],        // Twitchy: fast lines
  sweeping: ['.....', '.##..', '#..#.', '....#', '.....'],     // Swooshy: a swing
  vicious: ['#...#', '##.##', '#.#.#', '.....', '.#.#.'],      // Sneaky: fangs
  reach: ['..#..', '..#..', '#####', '..#..', '..#..'],        // of Long Arms: a long cross
  distance: ['..#..', '.#.#.', '#.#.#', '..#..', '..#..'],     // of Far Away: an arrow
  leech: ['..#..', '.###.', '#####', '#####', '.###.'],        // of Second Helpings: a drop
  force: ['##.##', '##.##', '.....', '##.##', '##.##'],        // of the Big Shove: blocks
  precision: ['.###.', '#...#', '#.#.#', '#...#', '.###.'],    // of Right Where It Hurts: an eye
  sturdy: ['#####', '#...#', '#...#', '#...#', '#####'],       // Sturdy: a frame
  thick: ['#####', '#####', '.....', '#####', '#####'],        // Thick: layers
  blocky: ['#####', '#.#.#', '#####', '.#.#.', '..#..'],       // Blocky: a shield
  zippy: ['...#.', '..#..', '.###.', '..#..', '.#...'],        // Zippy: a bolt
  hearty: ['.#.#.', '#####', '#####', '.###.', '..#..'],       // of the Big Breakfast: a heart
  mending: ['.....', '..#..', '.###.', '..#..', '.....'],      // of Licking Wounds: a plus
  fireproof: ['..#..', '.##..', '.###.', '#####', '.###.'],    // of the Oven Mitt: a flame
  antivenom: ['.###.', '#.#.#', '#####', '.#.#.', '.....'],    // of the Iron Stomach: a skull
  steady: ['..#..', '..#..', '..#..', '.###.', '#####'],       // of Standing Firm: a post
};
const RED = [200, 40, 48];
// a glyph engraved (dark, a light rim below) or painted in rgb
function stamp(t, g, x0, y0, dark, light) {
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (g[y][x] === '#') {
    t.darken(x0 + x, y0 + y, dark);
    if (g[y + 1]?.[x] !== '#') t.darken(x0 + x, y0 + y + 1, light);
  }
}
function paintGlyph(t, g, x0, y0, rgb, glow = false) {
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) if (g[y][x] === '#') t.paint(x0 + x, y0 + y, typeof rgb === 'function' ? rgb(x, y) : rgb, glow);
}
// a rune: 3x3, random, at least four strokes
function rune(R) {
  for (;;) {
    const bits = R() * 512 | 0, rows = [0, 1, 2].map(y => [0, 1, 2].map(x => bits >> (y * 3 + x) & 1 ? '#' : '.').join(''));
    if (rows.join('').split('#').length - 1 >= 4) return rows;
  }
}

// What each slot of an item is made of (its stuff's candidates: the seed picks one).
function stuffOf(def) {
  const kind = def.weapon?.kind, slot = def.armor?.slot;
  if (def.category === 'currency') return { metal: ['coin'] };
  if (kind) return {
    clay: kind === 'sword' || kind === 'flail' ? ['wrap', 'wrap', 'leather'] : ['wood', 'wood', 'wrap'],
    metal: kind === 'sword' || kind === 'trident' ? ['blade', 'blade', 'hammered'] : ['hammered', 'plate', 'blade'],
  };
  if (slot === 'body') return { clay: ['cloth', 'leather'], metal: ['plate', 'scales', 'rings', 'hammered'] };
  if (slot) return { clay: ['leather', 'cloth', 'grain'], metal: ['plate', 'hammered', 'blade'] };
  if (def.category === 'potion') return { clay: ['paper', 'grain'], metal: ['plate', 'hammered'], facets: ['bubbles'] };
  if (def.category === 'tool') return { clay: ['paper'], metal: ['plate'] };
  if (/stick/.test(def.id)) return { clay: ['wood'] };
  return {};
}
const DEFAULT_STUFF = { clay: ['grain'], metal: ['hammered', 'blade'], trim: ['rope', 'beads', 'zigzag', 'meander', 'stripes'], facets: ['glints'] };
const pick = (R, list) => list[R() * list.length | 0];

export function paintLook(look) {
  const def = ITEMS[look.itemId], stuff = { ...DEFAULT_STUFF, ...stuffOf(def) };
  const r = look.rarity ? RARITY[look.rarity] : null, rank = r ? r.rank : -1;
  const accent = r ? hex(r.css) : GOLD, element = ELEMENTS[look.enchant] ?? null;
  const tiles = LOOK_SLOTS.map((name, i) => {
    const t = tile(), R = mulberry32(hash32(look.seed ^ Math.imul(i + 1, 0x9e3779b1)));
    STUFF[pick(R, stuff[name])](t, R);
    return { t, R, name };
  });
  const [clay, metal, trim, facets] = tiles;
  // the rarity: what was done to it
  if (rank === 0 || rank === 1) {   // Crap, Shitty: rust and grime
    const n = rank === 0 ? 4 : 2, R = metal.R;
    for (let i = 0; i < n; i++) {
      const bx = R() * T, by = R() * T, br = 1.5 + R() * 2;
      each((x, y) => { const d = len(wrapD(x, bx), wrapD(y, by)); if (d < br - 0.5 * R()) metal.t.paint(x, y, RUST[(x * 7 + y * 3) % 3]); });
      each((x, y) => { const d = len(wrapD(x, bx), wrapD(y, by)); if (d < br + 1.5 && !trim.t.painted(x, y)) trim.t.darken(x, y, 0.8); });
    }
    for (let i = 0; i < (rank === 0 ? 14 : 7); i++) clay.t.darken(clay.R() * T | 0, clay.R() * T | 0, 0.7);
  }
  if (rank === 3) for (let y = 0; y < T; y += 8) for (let x = 0; x < T; x++) metal.t.darken(x, y + 4, 0.85);   // Unremarkable: a fine line
  if (rank >= 4) {   // Decent and up: an inlay in the rarity's colour
    const y = metal.R() * T | 0;
    for (let x = 0; x < T; x++) metal.t.paint(x, y, accent);
    for (let x = 0; x < T; x += 2) trim.t.darken(x, y, 1.25);
  }
  if (rank >= 5) {   // Unusual and up: a band of it on the grip, the cloth, the wood
    const y = clay.R() * T | 0;
    for (let x = 0; x < T; x++) { clay.t.paint(x, y, accent); if ((x + y) % 2) clay.t.paint(x, y + 1, accent); }
  }
  if (rank >= 6) {   // Remarkable and up: little gems that glow
    for (let i = 0; i < 2 + rank - 6; i++) {
      const x = metal.R() * T | 0, y = metal.R() * T | 0;
      paintGlyph(metal.t, ['.#.', '###', '.#.'], x, y, accent, true);
    }
    each((x, y) => { if ((x * 5 + y * 3) % 11 === 0) facets.t.paint(x, y, accent, true); });
  }
  if (rank >= 7) {   // Fabled and up: gold filigree
    const y0 = metal.R() * T | 0;
    for (let x = 0; x < T; x++) { const y = y0 + WAVE[x % 8]; if (!metal.t.painted(x, y)) metal.t.paint(x, y, GOLD); }
  }
  if (rank >= 8) {   // Impossible and OMG: glowing runes (OMG's in every colour)
    const y = metal.R() * (T - 3) | 0;
    for (let i = 0; i < 4; i++) paintGlyph(metal.t, rune(metal.R), i * 4, y, r.glow?.rainbow ? hue(i / 4) : accent, true);
    const yc = clay.R() * (T - 3) | 0;
    for (let i = 0; i < 4; i++) paintGlyph(clay.t, rune(clay.R), i * 4, yc, r.glow?.rainbow ? hue((i + 2) / RUNE_HUES) : accent, true);
  }
  // the enchantment: its element, glowing
  if (element) {
    const R = mulberry32(hash32(look.seed ^ 0x51ed));
    const at = () => [R() * T | 0, R() * T | 0];
    for (const t of [metal.t, clay.t]) {
      if (look.enchant === 'toasty') for (let i = 0; i < 6; i++) { const [x, y] = at(); t.paint(x, y, element, true); t.paint(x, y - 1, [255, 200, 90], true); }
      else if (look.enchant === 'icky') for (let i = 0; i < 3; i++) { const [x, y] = at(), n = 2 + (R() * 4 | 0); for (let k = 0; k < n; k++) t.paint(x, y + k, element, k === n - 1); }
      else if (look.enchant === 'nippy') for (let i = 0; i < 3; i++) { const [x, y] = at(); paintGlyph(t, ['#.#', '.#.', '#.#'], x, y, element, true); }
      else if (look.enchant === 'zappy') { const y0 = R() * T | 0; for (let x = 0; x < T; x++) t.paint(x, y0 + [0, 1, 2, 1][x % 4], element, true); }
      else for (let i = 0; i < 4; i++) { const [x, y] = at(); paintGlyph(t, ['.#.', '#.#', '.#.'], x, y, element, true); }
    }
  }
  // the affixes: a mark each, on the metal and on the clay (whichever the model has)
  look.marks.forEach((m, i) => {
    const cell = (i * 5 + (look.seed & 3)) % 9, x = (cell % 3) * 5 + 1, y = Math.floor(cell / 3) * 5 + 1;
    stamp(metal.t, GLYPHS[m], x, y, 0.62, 1.22);
    if (m === 'leech') paintGlyph(clay.t, GLYPHS[m], x, y, RED); else stamp(clay.t, GLYPHS[m], x, y, 0.7, 1.15);
  });
  const out = new Uint8ClampedArray(LOOK_W * LOOK_H * 4);
  tiles.forEach(({ t }, i) => {
    for (let y = 0; y < T; y++) out.set(t.px.subarray(y * T * 4, (y + 1) * T * 4), (y * LOOK_W + i * T) * 4);
  });
  return out;
}

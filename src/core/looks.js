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
//   partScales(...)  how many texels a unit each part of a mesh takes (thin parts more)
//
// What decides it: the seed (from the base and the name it was found with, so it stays through
// the Enchanter and the Smith) picks the patterns; the rarity how much is done to it (rust on
// Crap, an inlay, gems, filigree, glowing runes on the best); the enchantment an element (embers,
// drips, frost, sparks, sparkles); the affixes a mark or three. Stackable things (potions, coins,
// crystals, quest things) look the same as others of their kind: the seed is the item id's.
//
// Randomness that stays put. Every choice draws from a stream of its own, named after what it
// decides ('metal.stuff', 'rust', 'runes' ...): its seed is the look's seed mixed with the
// name's hash (`stream`), so a layer added, removed or changed leaves every other layer's draws
// as they were. A pattern is chosen among candidates by rendezvous hashing (`choose`): each
// candidate scores by its own name, the best wins, so a new candidate takes only the items it
// wins and the rest keep theirs. The hash (FNV-1a), the mixer and the generator (mulberry32) are
// written out here, frozen: change them and every look in every world changes
// (tests/looks.test.js pins some). Only integer maths, IEEE arithmetic and square roots decide
// which texel is what (no Math.sin, Math.hypot or Math.pow, which engines need not agree on).
//
// A texel is one of three things (render/looks.js draws them so): alpha 0, its colour shades the
// model's own (128 grey leaves it, darker darkens, lighter lightens: grain, engravings); alpha
// 128, its colour is painted over it (an inlay, rust); alpha 255, painted and glowing (pulsing).
import { ITEMS } from './items.js';
import { RARITY } from './gear/rarities.js';

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

// --- frozen randomness (see the top) ---------------------------------------------------------

// FNV-1a, 32 bits, over a string's UTF-16 code units
export function lookHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
// a 32-bit mixer (two rounds of multiply-xorshift)
const mix = n => {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
};
// mulberry32: numbers in [0, 1), exact (an integer over 2^32)
function mulberry(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// the stream of the look's choice `name`
const stream = (look, name) => mulberry(mix(look.seed ^ lookHash(name)));
// the candidate of `list` that scores best for the look's choice `name` (rendezvous hashing)
function choose(look, name, list) {
  let best = list[0], top = -1;
  for (const c of list) { const s = mix(look.seed ^ lookHash(`${name}:${c}`)); if (s > top) { top = s; best = c; } }
  return best;
}

export function lookOf(item) {
  const itemId = typeof item === 'string' ? item : item?.itemId, gen = typeof item === 'object' ? item?.gen : null;
  if (!ITEMS[itemId]) return null;
  if (!gen) return { itemId, seed: mix(lookHash(itemId)), rarity: null, enchant: null, marks: [] };
  return { itemId, seed: mix(lookHash(itemId) ^ lookHash(String(gen.name ?? ''))),
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
const len = (x, y) => Math.sqrt(x * x + y * y);
const GOLD = [236, 192, 92], RUST = [[138, 70, 38], [164, 92, 46], [112, 58, 34]], RED = [200, 40, 48];
// six hues, for OMG's runes
const RAINBOW = [[255, 84, 84], [255, 196, 64], [128, 240, 96], [72, 220, 255], [120, 132, 255], [236, 104, 255]];
const WAVE = [0, 1, 1, 1, 0, -1, -1, -1];

// One tile: wrapping coordinates, three kinds of texel (see the top).
function tile() {
  const px = new Uint8ClampedArray(T * T * 4);
  const at = (x, y) => ((((y % T) + T) % T) * T + (((x % T) + T) % T)) * 4;
  const t = {
    px,
    // shade by k (1: unchanged), or by [r, g, b] factors; paint stays on top
    shade(x, y, k) {
      const i = at(x, y), f = Array.isArray(k) ? k : [k, k, k];
      if (px[i + 3]) return;
      for (let c = 0; c < 3; c++) px[i + c] = clampByte(128 * f[c]);
    },
    // multiply what is there (a shade on a shade, or a darker paint)
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
const dots = (t, R, n, k) => { for (let i = 0; i < n; i++) t.darken(R() * T | 0, R() * T | 0, k); };

// The patterns, each over a whole tile (what the surface is made of). R: the pattern's own
// stream ('<slot>.<pattern>').
const STUFF = {
  // plain stuff with a fine grain (sticks, corks)
  grain(t, R) { each((x, y) => t.shade(x, y, 0.93 + 0.14 * R())); dots(t, R, 6, 0.85); },
  // wood: streaks along the length (v), each column its own, and now and then a knot
  wood(t, R) {
    const col = Array.from({ length: T }, () => 0.86 + 0.24 * R());
    each((x, y) => t.shade(x, y, col[x] * (0.96 + 0.08 * R())));
    if (R() < 0.7) {
      const kx = R() * T | 0, ky = R() * T | 0;
      for (let y = -2; y <= 2; y++) for (let x = -1; x <= 1; x++) if (Math.abs(x) + Math.abs(y) < 3) t.darken(kx + x, ky + y, Math.abs(x) + Math.abs(y) ? 0.85 : 0.65);
    }
  },
  // planks: boards with dark seams, nailed
  planks(t, R) {
    STUFF.wood(t, R);
    for (let y = 0; y < T; y += 8) for (let x = 0; x < T; x++) { t.darken(x, y, 0.62); t.darken(x, y + 1, 1.12); }
    for (let y = 3; y < T; y += 8) { t.darken(2, y, 0.6); t.darken(13, y + 2, 0.6); }
  },
  // hoops: wood held by dark iron bands (barrels, buckets)
  hoops(t, R) { STUFF.wood(t, R); for (let x = 0; x < T; x++) for (const y of [5, 6]) t.darken(x, y, 0.55); },
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
  // cloth: a weave, quilted, dotted or striped
  cloth(t, R) {
    each((x, y) => t.shade(x, y, (x + y) % 2 ? 0.95 : 1.05));
    const how = R() * 3 | 0, p = R() < 0.5 ? 8 : 16;
    if (how === 0) each((x, y) => { if ((x % p === 0 || y % p === 0) && (x + y) % 2) t.darken(x, y, 0.72); });
    else if (how === 1) for (let y = 2; y < T; y += 8) for (let x = (y / 8 & 1) * 4 + 2; x < T; x += 8) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) t.shade(x + dx, y + dy, 1.3);
    else for (let y = 0; y < T; y += 4) for (let x = 0; x < T; x++) t.darken(x, y, 0.82);
  },
  // sacking: a coarse weave
  weave(t) { each((x, y) => t.shade(x, y, ((x >> 1) + (y >> 1)) % 2 ? 0.86 : 1.1)); },
  // fur and felt: soft, with lighter tufts
  fuzz(t, R) { each((x, y) => t.shade(x, y, 0.94 + 0.1 * R())); for (let i = 0; i < 10; i++) { const x = R() * T | 0, y = R() * T | 0; t.shade(x, y, 1.2); t.shade(x, y + 1, 1.1); } },
  // paper: lines of writing
  paper(t, R) {
    each((x, y) => t.shade(x, y, 0.97 + 0.06 * R()));
    for (let y = 2; y < T; y += 3) { let x = R() * 3 | 0; while (x < T - 1) { const n = 1 + (R() * 4 | 0); for (let i = 0; i < n && x < T; i++) t.darken(x++, y, 0.62); x += 1; } }
  },
  // a map: a dotted way and a cross
  map(t, R) {
    each((x, y) => t.shade(x, y, 0.96 + 0.08 * R()));
    for (let x = 0; x < T; x += 2) t.darken(x, 8 + WAVE[x % 8], 0.55);
    for (const [x, y] of [[11, 3], [13, 5], [12, 4], [13, 3], [11, 5]]) t.darken(x, y, 0.5);
  },
  // string tied round a parcel
  twine(t, R) { STUFF.paper(t, R); for (let i = 0; i < T; i++) { t.shade(7, i, 1.35); t.shade(i, 7, 1.35); t.darken(8, i, 0.8); t.darken(i, 8, 0.8); } },
  // stone: speckled, a crack
  stone(t, R) {
    each((x, y) => t.shade(x, y, 0.9 + 0.2 * R()));
    let x = R() * T | 0, y = R() * T | 0;
    for (let i = 0; i < 9; i++) { t.darken(x, y, 0.62); x += 1; y += R() < 0.5 ? 1 : 0; }
  },
  // carved: little glyphs cut in rows (tablets, idols, rune stones)
  carved(t, R) {
    STUFF.stone(t, R);
    for (let y = 1; y < T; y += 5) for (let x = 1; x < T - 2; x += 5) stamp(t, rune(R), x, y, 0.62, 1.2);
  },
  // bone: pale streaks, a hairline crack
  bone(t, R) {
    each((x, y) => t.shade(x, y, 1 + (y % 5 === 0 ? -0.08 : 0.04) + 0.04 * R()));
    for (let i = 0, x = R() * T | 0; i < 7; i++) t.darken(x + (i >> 2), i * 2, 0.7);
  },
  // honeycomb: little hexagons
  honeycomb(t) {
    each((x, y) => { const row = y >> 2, cx = ((x + (row & 1) * 2) % 4) - 1.5, cy = (y % 4) - 1.5; t.shade(x, y, Math.abs(cx) + Math.abs(cy) * 0.6 > 1.6 ? 0.68 : 1.12); });
  },
  // big light spots (toadstools, spores)
  spots(t, R) {
    each((x, y) => t.shade(x, y, 0.95 + 0.06 * R()));
    for (const [bx, by] of [[3, 4], [11, 2], [8, 11], [14, 12]]) each((x, y) => { if (len(wrapD(x, bx), wrapD(y, by)) < 1.8) t.shade(x, y, 1.45); });
  },
  // veins of a leaf
  veins(t) { each((x, y) => t.shade(x, y, x === 7 || (x - 7 === Math.abs(y % 8 - 4) && y % 8 < 8) ? 0.72 : 1.04)); },
  // a shell: ridges fanning out
  shell(t) { each((x, y) => { const r = len(x - 7.5, y + 4) | 0; t.shade(x, y, r % 3 === 0 ? 0.74 : r % 3 === 1 ? 1.15 : 1); }); },
  // wax: drips running down
  wax(t, R) { each((x, y) => t.shade(x, y, 1.04)); for (let i = 0; i < 4; i++) { const x = R() * T | 0, n = 3 + (R() * 6 | 0); for (let k = 0; k < n; k++) t.shade(x, k, 1.25); t.darken(x, n, 0.85); } },
  // painted pots: a band of zigzags between lines
  painted(t) { each((x, y) => { const z = Math.abs((x % 8) - 4) >> 1; t.shade(x, y, y === 3 || y === 12 ? 0.6 : y === 6 + z || y === 7 + z ? 0.66 : 1.05); }); },
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
  // gear teeth: blocks round a rim
  teeth(t) { each((x, y) => t.shade(x, y, (x % 4 < 2) !== (y % 8 < 4) ? 1.18 : 0.82)); },
  // a coin's face: a rim and a stamp in the middle (the tile's centre is the model's: render/looks.js)
  coin(t, R, look) {
    each((x, y) => { const r = len(x - 7.5, y - 7.5); t.shade(x, y, r > 6.5 && r < 7.6 ? 0.72 : r >= 7.6 ? 1.1 : 1 + 0.06 * R()); });
    stamp(t, GLYPHS[choose(look, 'coin.stamp', ['crown', 'star', 'bird'])], 5, 5, 0.66, 1.25);
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
  // gems and crystals: glints and a flaw
  glints(t, R) {
    each((x, y) => t.shade(x, y, 0.95 + 0.1 * R()));
    for (let i = 0; i < 5; i++) { const x = R() * T | 0, y = R() * T | 0; t.shade(x, y, 1.55); t.shade(x + 1, y, 1.2); t.shade(x, y + 1, 1.2); }
    for (let i = 0, x = R() * T | 0, y = R() * T | 0; i < 6; i++) t.darken(x + i, y + (i >> 1), 0.8);
  },
  // a potion's glass: bubbles rising
  bubbles(t, R) {
    for (let i = 0; i < 5; i++) {
      const bx = R() * T, by = R() * T, r = 0.8 + R() * 1.6;
      each((x, y) => { const d = len(wrapD(x, bx), wrapD(y, by)); if (Math.abs(d - r) < 0.6) t.shade(x, y, 1.35); });
    }
  },
};

// Little pictures, 5x5: the coins' stamps, the affixes' marks. '#' is drawn.
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
// a glyph engraved (dark, a light rim below) or painted in rgb
function stamp(t, g, x0, y0, dark, light) {
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) if (g[y][x] === '#') {
    t.darken(x0 + x, y0 + y, dark);
    if (g[y + 1]?.[x] !== '#') t.darken(x0 + x, y0 + y + 1, light);
  }
}
function paintGlyph(t, g, x0, y0, rgb, glow = false) {
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) if (g[y][x] === '#') t.paint(x0 + x, y0 + y, rgb, glow);
}
// a rune: 3x3, from R, at least four strokes
function rune(R) {
  for (;;) {
    const bits = R() * 512 | 0, rows = [0, 1, 2].map(y => [0, 1, 2].map(x => bits >> (y * 3 + x) & 1 ? '#' : '.').join(''));
    if (rows.join('').split('#').length - 1 >= 4) return rows;
  }
}

// What each slot of an item is made of: the candidates its seed chooses among. A quest thing (all
// of it clay, its colours in its vertices: blender/items.py QUEST_PROPS) gets what it is made of.
export const QUEST_STUFF = {
  quest_compass: ['leather'], quest_toy_rabbit: ['fuzz'], quest_letter: ['paper'], quest_parcel: ['twine'], quest_map_scrap: ['map'],
  quest_journal: ['leather'], quest_backpack: ['cloth', 'leather'], quest_shield: ['planks'], quest_lantern: ['hammered'],
  quest_pickaxe: ['wood'], quest_flour_sack: ['weave'], quest_cider_barrel: ['hoops'], quest_supply_crate: ['planks'],
  quest_fireworks: ['stripes'], quest_singing_crystal: ['glints'], quest_silver_bars: ['blade'], quest_gears: ['teeth'],
  quest_crucible: ['hammered'], quest_toadstool: ['spots'], quest_thunder_jar: ['bubbles'], quest_bird_nest: ['wood'],
  quest_rainbow_crystal: ['glints'], quest_crab: ['shell'], quest_ice_shard: ['glints'], quest_butter_lamps: ['wax'],
  quest_prayer_stone: ['carved'], quest_wagon_wheel: ['wood'], quest_horned_skull: ['bone'], quest_pink_salt: ['stone'],
  quest_painted_pots: ['painted'], quest_paper_lantern: ['paper'], quest_cave_mushrooms: ['spots'], quest_ice_heart: ['glints'],
  quest_pearl_clam: ['shell'], quest_sea_glass: ['glints'], quest_spore_pod: ['spots'], quest_pitcher_plant: ['veins'],
  quest_honey_pot: ['honeycomb'], quest_candles: ['wax'], quest_jade_idol: ['carved'], quest_incense_bowl: ['stone'],
  quest_spider_eggs: ['spots'], quest_bone_lantern: ['bone'], quest_old_urn: ['painted'], quest_stone_tablet: ['carved'],
  quest_statue_head: ['stone'], quest_fire_crystal: ['glints'], quest_obsidian: ['glints'], quest_void_crystal: ['glints'],
  quest_rune_stone: ['carved'],
};
function stuffOf(def) {
  const kind = def.weapon?.kind, slot = def.armor?.slot;
  if (QUEST_STUFF[def.id]) return { clay: QUEST_STUFF[def.id] };
  if (def.category === 'currency') return { metal: ['coin'] };
  if (kind) return {
    clay: kind === 'sword' || kind === 'flail' ? ['wrap', 'leather'] : ['wood', 'wrap'],
    metal: kind === 'sword' || kind === 'trident' ? ['blade', 'hammered'] : ['hammered', 'plate', 'blade'],
  };
  if (slot === 'body') return { clay: ['cloth', 'leather'], metal: ['plate', 'scales', 'rings', 'hammered'] };
  if (slot === 'shield') return { clay: ['planks', 'leather', 'cloth'], metal: ['plate', 'hammered'] };
  if (slot) return { clay: ['leather', 'cloth', 'fuzz'], metal: ['plate', 'hammered', 'blade'] };
  if (def.category === 'potion') return { clay: ['paper'], metal: ['plate', 'hammered'], facets: ['bubbles'] };
  if (def.category === 'tool') return { clay: ['paper'], metal: ['plate'] };
  if (/stick/.test(def.id)) return { clay: ['wood'] };
  return {};
}
const DEFAULT_STUFF = { clay: ['grain'], metal: ['hammered', 'blade'], trim: ['rope', 'beads', 'zigzag', 'meander', 'stripes'], facets: ['glints'] };

// How many affix marks show: the best rarities let their runes and filigree speak instead.
const MARKS_SHOWN = rank => rank >= 8 ? 1 : rank === 7 ? 2 : 3;

// The layout of the rarity's work on a metal tile, rows from the look's `row` (wrapping): the
// inlay at 0, gems set in it, the filigree or runes in the band below (2 to 6), the marks from 9.
export function paintLook(look) {
  const def = ITEMS[look.itemId], stuff = { ...DEFAULT_STUFF, ...stuffOf(def) };
  const r = look.rarity ? RARITY[look.rarity] : null, rank = r ? r.rank : -1;
  const accent = r ? hex(r.css) : GOLD, element = ELEMENTS[look.enchant] ?? null;
  const tiles = LOOK_SLOTS.map(name => {
    const t = tile(), kind = choose(look, `${name}.stuff`, stuff[name]);
    STUFF[kind](t, stream(look, `${name}.${kind}`), look);
    return t;
  });
  const [clay, metal, trim, facets] = tiles;
  const row = stream(look, 'row')() * T | 0;
  // the rarity: what was done to it
  if (rank === 0 || rank === 1) {   // Crap, Shitty: rust and grime
    const R = stream(look, 'rust');
    for (let i = 0; i < (rank === 0 ? 4 : 2); i++) {
      const bx = R() * T, by = R() * T, br = 1.5 + R() * 2;
      each((x, y) => { const d = len(wrapD(x, bx), wrapD(y, by)); if (d < br - 0.5 * R()) metal.paint(x, y, RUST[(x * 7 + y * 3) % 3]); });
      each((x, y) => { const d = len(wrapD(x, bx), wrapD(y, by)); if (d < br + 1.5 && !trim.painted(x, y)) trim.darken(x, y, 0.8); });
    }
    dots(clay, stream(look, 'grime'), rank === 0 ? 14 : 7, 0.7);
  }
  if (rank === 3) for (let x = 0; x < T; x++) metal.darken(x, row + 4, 0.85);   // Unremarkable: a fine line
  if (rank >= 4) {   // Decent and up: an inlay in the rarity's colour
    for (let x = 0; x < T; x++) metal.paint(x, row, accent);
    for (let x = 0; x < T; x += 2) trim.darken(x, row, 1.25);
  }
  if (rank >= 5) {   // Unusual and up: a band of it on the grip, the cloth, the wood
    const y = stream(look, 'band')() * T | 0;
    for (let x = 0; x < T; x++) { clay.paint(x, y, accent); if ((x + y) % 2) clay.paint(x, y + 1, accent); }
  }
  if (rank >= 6) {   // Remarkable and up: two gems set in the inlay that glow, a glint of it in the facets
    for (const x of [3, 11]) paintGlyph(metal, ['.#.', '###', '.#.'], x - 1, row - 1, accent, true);
    for (const [x, y] of [[4, 4], [12, 11]]) facets.paint(x, y, accent, true);
  }
  if (rank === 7) for (let x = 0; x < T; x++) metal.paint(x, row + 4 + WAVE[x % 8], GOLD);   // Fabled: gold filigree
  if (rank >= 8) {   // Impossible and OMG: three glowing runes between two gold lines (OMG's in every colour)
    const R = stream(look, 'runes');
    for (let x = 0; x < T; x++) { metal.paint(x, row + 2, GOLD); metal.paint(x, row + 6, GOLD); }
    for (let i = 0; i < 3; i++) paintGlyph(metal, rune(R), 1 + i * 5, row + 3, r.glow?.rainbow ? RAINBOW[(i * 2 + (look.seed & 1)) % 6] : accent, true);
  }
  // the enchantment: its element, glowing, a motif or two in the band below the inlay
  if (element) {
    const y = row + 7;
    for (const t of [metal, clay]) {
      if (look.enchant === 'toasty') for (const x of [2, 7, 12]) { t.paint(x, y, element, true); t.paint(x, y - 1, [255, 200, 90], true); t.paint(x + 1, y, element, true); }
      else if (look.enchant === 'icky') for (const [x, n] of [[4, 3], [12, 2]]) for (let k = 0; k <= n; k++) t.paint(x, y - 1 + k, element, k === n);
      else if (look.enchant === 'nippy') for (const x of [3, 11]) paintGlyph(t, ['#.#', '.#.', '#.#'], x - 1, y - 1, element, true);
      else if (look.enchant === 'zappy') for (let x = 0; x < T; x++) t.paint(x, y + [0, 1, 0, -1][x % 4], element, true);
      else for (const x of [4, 12]) paintGlyph(t, ['.#.', '#.#', '.#.'], x - 1, y - 1, element, true);
    }
  }
  // the affixes: a mark each (up to MARKS_SHOWN), in a row, on the metal and on the clay (whichever
  // the model has)
  look.marks.slice(0, MARKS_SHOWN(rank)).forEach((m, i, shown) => {
    const x = shown.length === 1 ? 5 : shown.length === 2 ? 2 + i * 7 : i * 5 + 1, y = row + 9;
    stamp(metal, GLYPHS[m], x, y, 0.62, 1.22);
    if (m === 'leech') paintGlyph(clay, GLYPHS[m], x, y, RED); else stamp(clay, GLYPHS[m], x, y, 0.7, 1.15);
  });
  const out = new Uint8ClampedArray(LOOK_W * LOOK_H * 4);
  tiles.forEach((t, i) => {
    for (let y = 0; y < T; y++) out.set(t.px.subarray(y * T * 4, (y + 1) * T * 4), (y * LOOK_W + i * T) * 4);
  });
  return out;
}

// --- texel density -------------------------------------------------------------------------

// How many texels a unit each vertex of a mesh takes: `base` (render/looks.js: the model's), but
// on a thin part (a blade, a shaft, a grip, a strap) enough that it is MIN_ACROSS texels across,
// up to BOOST times base. A part: what hangs together (triangles sharing corners, welded by
// position, `index` or none), and the smaller parts lying within a bigger one's box with it (a
// blade's bevels with the blade), so one surface keeps one size of texel. Its width across: the
// middle one of its box's sides. -> Float32Array, one per vertex.
export const MIN_ACROSS = 6, BOOST = 2;
export function partScales(position, index, base) {
  const n = position.length / 3, parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const weld = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(position[i * 3] * 1e4)},${Math.round(position[i * 3 + 1] * 1e4)},${Math.round(position[i * 3 + 2] * 1e4)}`;
    if (weld.has(k)) join(weld.get(k), i); else weld.set(k, i);
  }
  const corners = index ?? Array.from({ length: n }, (_, i) => i);
  for (let t = 0; t + 2 < corners.length; t += 3) { join(corners[t], corners[t + 1]); join(corners[t], corners[t + 2]); }
  const boxes = new Map();
  for (let i = 0; i < n; i++) {
    const p = find(i), b = boxes.get(p) ?? boxes.set(p, [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]).get(p);
    for (let c = 0; c < 3; c++) { b[c] = Math.min(b[c], position[i * 3 + c]); b[c + 3] = Math.max(b[c + 3], position[i * 3 + c]); }
  }
  const size = b => [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
  const volume = b => size(b).reduce((v, s) => v * Math.max(s, 1e-3), 1);
  const parts = [...boxes].sort((a, b) => volume(b[1]) - volume(a[1])), owner = new Map(), kept = [];
  for (const [p, b] of parts) {
    const mid = [0, 1, 2].map(c => (b[c] + b[c + 3]) / 2), eps = 1e-3;
    const big = kept.find(([, k]) => [0, 1, 2].every(c => mid[c] >= k[c] - eps && mid[c] <= k[c + 3] + eps));
    if (big) owner.set(p, big[0]); else { owner.set(p, p); kept.push([p, b]); }
  }
  const scale = new Map(kept.map(([p, b]) => {
    const across = size(b).sort((x, y) => x - y)[1];
    return [p, Math.min(base * BOOST, Math.max(base, MIN_ACROSS / Math.max(across, 1e-4)))];
  }));
  return Float32Array.from({ length: n }, (_, i) => scale.get(owner.get(find(i))));
}

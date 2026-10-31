// The town's land seen from above (world/townland.js), for looking at what a world's town is like
// without the game: node tools/townmap.mjs [seed ...] [--out dir] [--scale px]
// One PNG a seed (town-<seed>.png, in --out, the system's temp dir at first): the ground's levels
// shaded (lighter higher, a dark line where it steps a cliff), the water blue (the lake darker),
// the stairs orange, the bridges brown, the spans red, the falls white, the ways grey, the homes
// and the buildings their boxes, the wall dark, the forest outside it green, the towers black,
// the land's set pieces (`features`) marked in magenta, the tiles' seams dotted.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { N } from '../src/core/constants.js';
import { townLand } from '../src/world/town.js';

const args = process.argv.slice(2), seeds = [];
let out = tmpdir(), S = 8;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--scale') S = Number(args[++i]);
  else seeds.push(Number(args[i]) >>> 0);
}
if (!seeds.length) seeds.push(0, 1, 2, 3);
mkdirSync(out, { recursive: true });

function png(w, h, rgb) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = ~0; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const seed of seeds) {
  const land = townLand(seed), { W, D } = land, w = W * S, h = D * S, img = Buffer.alloc(w * h * 3);
  // (z down the image from the back of the town: the gate at the bottom)
  const px = (x, y, [r, g, b]) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const o = ((h - 1 - y) * w + x) * 3; img[o] = r; img[o + 1] = g; img[o + 2] = b; };
  const fill = (x0, z0, x1, z1, c) => { for (let y = Math.round(z0 * S); y < Math.round(z1 * S); y++) for (let x = Math.round(x0 * S); x < Math.round(x1 * S); x++) px(x, y, c); };
  const lo = land.level(0, 0) - 6, hi = land.upper + 10;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const L = land.level(x, z), wt = land.water(x, z), t = Math.max(0, Math.min(1, (L - lo) / (hi - lo)));
    const side = land.wall.side(x, z), f = land.forest(x + .5, z + .5);
    let c = wt ? (wt.lake ? [40, 80, 170] : [70, 130, 210]) : [Math.round(90 + 120 * t), Math.round(120 + 110 * t), Math.round(70 + 90 * t)];
    if (!wt && f > .4) c = c.map((v, k) => Math.round(v * (k === 1 ? .8 : .55)));
    if (side === 1) c = land.wall.towers.has(z * W + x) ? [20, 20, 20] : [80, 75, 70];
    fill(x, z, x + 1, z + 1, c);
    // (a cliff: two levels or more down to the next cell)
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      if (x + dx >= W || z + dz >= D) continue;
      const d = Math.abs(land.level(x + dx, z + dz) - L);
      if (d >= 3 && !wt && !land.water(x + dx, z + dz)) { if (dx) fill(x + 1 - .1, z, x + 1 + .1, z + 1, [30, 30, 30]); else fill(x, z + 1 - .1, x + 1, z + 1 + .1, [30, 30, 30]); }
    }
  }
  for (const wy of land.layout.ways) {
    const [[ax, az], [bx, bz]] = [wy.a, wy.b], r = wy.w / 2;
    fill(Math.min(ax, bx) - r, Math.min(az, bz) - r, Math.max(ax, bx) + r, Math.max(az, bz) + r, wy.lift ? [200, 170, 120] : [190, 180, 165]);
  }
  for (const k of land.layout.keep) if (k.box && k.r < 1.2) fill(k.box[0], k.box[1], k.box[2], k.box[3], [150, 60, 50]);
  for (const k of land.layout.keep) if (k.box && k.r >= 1.2) fill(k.box[0], k.box[1], k.box[2], k.box[3], [110, 40, 90]);
  for (const r of land.runs) {
    const c = r.kind === 'stair' ? [240, 150, 30] : r.span ? [230, 30, 30] : [130, 80, 40];
    for (const g of r.cells) fill(g % W + .2, Math.floor(g / W) + .2, g % W + .8, Math.floor(g / W) + .8, c);
  }
  for (const [g] of land.platforms) fill(g % W + .3, Math.floor(g / W) + .3, g % W + .7, Math.floor(g / W) + .7, [255, 220, 0]);
  for (const f of land.falls) fill(f.c % W + .1, Math.floor(f.c / W) + .1, f.c % W + .9, Math.floor(f.c / W) + .9, [255, 255, 255]);
  for (const f of land.features ?? []) fill(f.x - .6, f.z - .6, f.x + .6, f.z + .6, [230, 0, 230]);
  for (let s = 1; s < W / N; s++) for (let y = 0; y < h; y += 4) px(s * N * S, y, [0, 0, 0]);
  for (let s = 1; s < D / N; s++) for (let x = 0; x < w; x += 4) px(x, s * N * S, [0, 0, 0]);
  const file = join(out, `town-${seed}.png`);
  writeFileSync(file, png(w, h, img));
  console.log(file, JSON.stringify({ spans: land.spans.length, falls: land.falls.length, features: (land.features ?? []).map(f => f.kind) }));
}

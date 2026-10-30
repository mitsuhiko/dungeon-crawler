// Mud (core/constants.js MUD): some of a theme's pools of water are mud (its `mud`: the share of
// them, themes/index.js). A pool is one body of water standing on its own in the cube: not a river
// or a sea running on into the next cube (it keeps its look across the face), nor one a fall pours
// into or out of. Its floors keep their fluid (water: waded and swum in alike) and get the look
// (f.look, drawn as mud: render/floors.js, cubegen/fluidbodies.js its palette). Round about some
// of them (POCKETS) pockets of mud lie on the ground, a few centimetres deep: { x, z, y (the
// ground), r, vol, c, layer (its floor's cell: no props there) } (game/muddy.js slows whoever wades through them, render/mud.js draws them).
// Decided at the end of a cube, on a random stream of its own: worlds without mud come out as
// they did.
import { N, LH, DIRS, WATER, MUD } from '../core/constants.js';
import { idx, inb, hash32 } from '../core/util.js';

// how many of the mud pools have pockets round them, how many (at most), how far out from the pool
// (cells), how much higher than its surface (levels), how big (radius, cells) and how deep in the
// middle (world units)
export const POCKETS = { share: 0.6, most: 3, reach: 3, rise: 3, r: [0.3, 0.6], deep: [0.07, 0.12] };

// the bodies of water of the cube: floors of one fluid level next to each other
function bodies(ctx) {
  const seen = new Set(), out = [];
  for (const f of ctx.floors) {
    if (f.fluid !== WATER || f.crust || seen.has(f)) continue;
    const body = [], todo = [f];
    seen.add(f);
    while (todo.length) {
      const g = todo.pop();
      body.push(g);
      for (const [dx, dz] of DIRS) {
        if (!inb(g.x + dx, g.z + dz)) continue;
        for (const h of ctx.cols[idx(g.x + dx, g.z + dz)]) if (h.fluid === WATER && !h.crust && h.surf === g.surf && !seen.has(h)) { seen.add(h); todo.push(h); }
      }
    }
    out.push(body);
  }
  return out;
}

// does a fall pour into (or out of) the body? (within a cell of where it goes over its edge)
const fed = (ctx, body) => ctx.falls.some(fl => body.some(f => (f.surf === fl.bot || f.surf === fl.top)
  && Math.abs(f.x - fl.c % N - DIRS[fl.d][0] / 2) <= 1.5 && Math.abs(f.z - ((fl.c / N) | 0) - DIRS[fl.d][1] / 2) <= 1.5));

// ground for a pocket: dry, plain (no structure on it, no portal, ramp, site or reservation), level,
// not in the outer ring of cells (shared with the next cube)
export function pocketGround(ctx, f, reserved) {
  if (!f.x || !f.z || f.x === N - 1 || f.z === N - 1 || f.fluid || f.kind || f.prot || f.ramp || f.site || f.covered || ctx.pieces[f.c]?.length || reserved.has(f.c)) return false;
  const cs = f.cs ?? [f.top * LH, f.top * LH, f.top * LH, f.top * LH];
  return Math.max(...cs) - Math.min(...cs) < 0.3;
}

// a pocket of mud centred at (x, z) on floor g, of radius r (cells), `deep` deep in the middle (world
// units): a dome (render/mud.js, core/sollmeldon.js depositMud)
export function mudPocket(g, x, z, r, deep) {
  const cs = g.cs ?? [g.top * LH];
  return { x, z, y: cs.reduce((a, b) => a + b, 0) / cs.length, r, vol: Math.PI * r * r * deep / 2, c: g.c, layer: g.layer };
}

// spec.mud: the share of the pools that are mud; reserved: cells kept free (sites, spots, a trial's)
// -> the pockets
export function muddyWater(ctx, reserved = new Set()) {
  const share = ctx.spec.mud ?? 0;
  if (!share || ctx.spec.trial) return [];
  // (each number hashed from the cube's seed and a count: the first numbers of a mulberry32 stream
  // seeded so are not independent enough of each other)
  const base = hash32(ctx.seed ^ 0x6d756421), pockets = [];
  let n = 0;
  const R = () => hash32((base + Math.imul(++n, 0x9e3779b1)) >>> 0) / 4294967296;
  for (const body of bodies(ctx)) {
    if (body.some(f => f.x === 0 || f.z === 0 || f.x === N - 1 || f.z === N - 1) || fed(ctx, body)) continue;
    if (R() >= share) continue;
    for (const f of body) f.look = MUD;
    if (R() >= POCKETS.share) continue;
    // the dry ground round it, about as high as its banks
    const S = body[0].surf, near = [];
    for (let c = 0; c < N * N; c++) for (const g of ctx.cols[c]) {
      if (g.top < S || g.top - S > POCKETS.rise || !pocketGround(ctx, g, reserved)) continue;
      const d = Math.min(...body.map(f => Math.hypot(f.x - g.x, f.z - g.z)));
      if (d >= 1 && d <= POCKETS.reach) near.push(g);
    }
    for (let left = 1 + Math.floor(R() * POCKETS.most); left > 0 && near.length; left--) {
      const g = near.splice(Math.floor(R() * near.length), 1)[0];
      const r = POCKETS.r[0] + R() * (POCKETS.r[1] - POCKETS.r[0]), deep = POCKETS.deep[0] + R() * (POCKETS.deep[1] - POCKETS.deep[0]);
      const k = Math.max(0, 0.5 - r * 0.6), x = g.x + 0.5 + (R() * 2 - 1) * k, z = g.z + 0.5 + (R() * 2 - 1) * k;
      pockets.push(mudPocket(g, x, z, r, deep));
    }
  }
  return pockets;
}

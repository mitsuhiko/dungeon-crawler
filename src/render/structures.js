// All built structures: stairs, landings, bridges and visible fences.
import { buildStair, buildLanding, pillarBox } from './stairs.js';
import { BRIDGES, buildPlankBridge } from './bridges.js';
import { POST, RAIL, SURFACE, PIER } from './palette.js';
import { buildLadder } from './ladders.js';

export function buildStructures(m, layers) {
  for (const r of m.runs) {
    const L = layers[r.layer];
    if (r.kind === 'landing') buildLanding(r, L);
    else if (r.kind === 'stair') buildStair(r, L);
    else (BRIDGES[r.style] || buildPlankBridge)(r, L);
    // (a span's pillar of rock, dressed in stone: world/town.js tileGround)
    for (const q of r.piers || []) pillarBox(L.stone, q, PIER);
  }
  for (const l of m.ladders || []) buildLadder(l, layers[l.layer]);
  // wooden fences: posts follow the surface, rails are sloped beams
  for (const f of m.fenceList) {
    if (!f.show) continue;
    if (f.style === 'stone') { stoneParapet(f, layers[f.layer].stone); continue; }
    const W = layers[f.layer].wood;
    // (one along a cut's line, cubegen/cuts.js: its posts turned along it, on the brink)
    if (f.line) for (const p of f.pts) turnedPost(W, p, f.line);
    else for (const [px, py, pz] of f.pts) W.box(px - 0.045, py, pz - 0.045, px + 0.045, py + 0.5, pz + 0.045, POST, POST);
    for (let s = 0; s + 1 < f.pts.length; s++) {
      const p = f.pts[s], q = f.pts[s + 1];
      for (const ry of [0.2, 0.4]) W.beam([p[0], p[1] + ry, p[2]], [q[0], q[1] + ry, q[2]], 0.05, 0.06, RAIL);
    }
  }
}

// a fence's post at p turned along its line [[x, z], [x, z]]: its sides and its top
function turnedPost(W, [px, py, pz], [[ax, az], [bx, bz]]) {
  const l = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / l * 0.045, uz = (bz - az) / l * 0.045;
  const c = [[ux - uz, uz + ux], [-ux - uz, -uz + ux], [-ux + uz, -uz - ux], [ux + uz, uz - ux]].map(([x, z]) => [px + x, pz + z]);
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = c[i], [x1, z1] = c[(i + 1) % 4], nx = (x0 + x1) / 2 - px, nz = (z0 + z1) / 2 - pz;
    W.quad([x0, py, z0], [x1, py, z1], [x1, py + 0.5, z1], [x0, py + 0.5, z0], [nx, 0, nz], POST);
  }
  W.quad(...c.map(([x, z]) => [x, py + 0.5, z]), [0, 1, 0], POST);
}

// a low stone parapet along an edge (Foggery's bridge, cubegen/towerarena.js): a wall of blocks
// following the floor, of the theme's masonry, capped with its trim (themes/surfaces.js)
function stoneParapet(f, S) {
  for (let s = 0; s + 1 < f.pts.length; s++) {
    const p = f.pts[s], q = f.pts[s + 1];
    S.beam([p[0], p[1] + 0.16, p[2]], [q[0], q[1] + 0.16, q[2]], 0.16, 0.34, SURFACE.masonry.side[0]);
    S.beam([p[0], p[1] + 0.36, p[2]], [q[0], q[1] + 0.36, q[2]], 0.2, 0.06, SURFACE.trim.top);
  }
}

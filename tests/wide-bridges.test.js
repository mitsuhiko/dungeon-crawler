import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, LH, CHAR_R, CHAR_H, WATER } from '../src/core/constants.js';
import { edgeKey } from '../src/core/util.js';
import { runY, topOf } from '../src/core/surfaces.js';
import { structureLinks, navNeighbor } from '../src/physics/floornav.js';
import { movePlayer } from '../src/physics/move.js';
import { player } from '../src/game/state.js';
import { state } from './fixtures.js';
import { worldOf } from './worlds.js';
import { planWalk, steerWalk } from '../src/physics/playernav.js';
import { widenBridge } from '../src/cubegen/bridgewidth.js';
import { BRIDGE_STYLES, bridgeFits, pickBridge } from '../src/themes/builds.js';
import { runFrame } from '../src/render/runframe.js';
import { BRIDGES } from '../src/render/bridges.js';
import { GeoBuilder } from '../src/render/builder.js';

// Five selected spans, not a sweep: all widths and all four travel directions,
// including consecutive gorge cubes. Generate them lazily and reuse their maps.
let spanFixtures;
function spans() {
  return spanFixtures ??= [
    [0, 1, 1, 2], [0, 2, 2, 0], [0, 3, 2, 1], [0, 3, 2, 2], [4, 8, 3, 3],
  ].map(([seed, depth, width, dir]) => {
    const w = worldOf(seed), s = w.layout(depth).spans.find(s => s.width === width && s.dir === dir);
    assert.ok(s, `${seed}/${depth}: selected width ${width}, direction ${dir}`);
    return { seed, s, maps: s.keys.map(k => w.cube(k).map) };
  });
}
const xy = p => [p.c % N, Math.floor(p.c / N)];
const across = (s, p) => s.dir < 2 ? xy(p)[1] : xy(p)[0];
const edgeRail = (m, p, qx, qz) => {
  const [x, z] = xy(p), y = runY(p, .5, .5);
  return (m.fences.get(edgeKey(x, z, qx, qz)) || []).some(f => !f.show && f.ymax >= y - .35 && f.ymin <= y + .35);
};

test('span widths are shared by every gorge cube, with complete parallel decks', () => {
  const widths = new Set();
  for (const { seed, s, maps } of spans()) {
    assert.ok([1, 2, 3].includes(s.width), `${seed}: span width`);
    widths.add(s.width);
    const expected = s.width === 1 ? [s.pos] : s.width === 2 ? [s.pos, s.pos + 1] : [s.pos - 1, s.pos, s.pos + 1];
    for (const m of maps.slice(1, -1)) {
      const r = m.runs.find(r => r.span);
      assert.ok(r, `${seed}: missing span run`);
      assert.equal(r.width, s.width);
      assert.ok(r.width <= BRIDGE_STYLES[r.style].width, 'generated style supports the complete deck');
      assert.equal(r.lanes.length, s.width);
      assert.deepEqual(r.lanes.map(lane => across(s, lane[0])).sort((a, b) => a - b), expected);
      for (const lane of r.lanes) {
        assert.equal(lane.length, r.k);
        for (const p of lane) {
          assert.ok(m.pieces[p.c].includes(p), 'each lane is in the map');
          const deck = Math.min(runY(p, 0, 0), runY(p, 1, 1), runY(p, .5, .5));
          for (const f of m.cols[p.c]) if (f.top * LH < deck)
            assert.ok(Math.max(...f.cs) < deck - .4, 'ground stays below every lane');
        }
      }
    }
    // In consecutive gorge cubes the lanes line up across the shared face.
    for (let j = 1; j < maps.length - 2; j++) {
      const a = maps[j].runs.find(r => r.span), b = maps[j + 1].runs.find(r => r.span);
      assert.deepEqual(a.lanes.map(l => across(s, l[0])).sort(), b.lanes.map(l => across(s, l[0])).sort());
      const end = a.d === s.dir ? a.to : a.from, start = b.d === s.dir ? b.from : b.to;
      assert.equal(end.top * LH, start.top * LH, `${seed}: seam deck height`);
    }
  }
  assert.deepEqual([...widths].sort(), [1, 2, 3], 'both wide sizes and narrow spans occur');
});

test('every lane leads both ways between the protected seam pads', () => {
  for (const { seed, s, maps } of spans()) for (const m of maps.slice(1, -1)) {
    const r = m.runs.find(r => r.span);
    const links = structureLinks(m);
    for (const lane of r.lanes) {
      for (let j = 1; j < lane.length; j++) {
        assert.equal(navNeighbor(m, lane[j - 1], r.d), lane[j], `${seed}: forward lane`);
        assert.equal(navNeighbor(m, lane[j], r.d ^ 1), lane[j - 1], `${seed}: backward lane`);
      }
      for (const [p, dir, level] of [[lane[0], r.d ^ 1, r.from.top], [lane.at(-1), r.d, r.to.top]]) {
        const pad = links.get(p)?.[dir].find(f => f.prot);
        assert.ok(pad, `${seed}: each lane joins a pad`);
        assert.equal(pad.top, level);
        assert.equal(across(s, pad), across(s, p));
        assert.equal(navNeighbor(m, p, dir), pad, `${seed}: walk off onto pad`);
        assert.equal(navNeighbor(m, pad, dir ^ 1), p, `${seed}: walk onto lane`);
      }
    }
  }
});

test('wide decks have walkable lateral links and rails only on their outer sides', () => {
  let checked = 0;
  for (const { seed, s, maps } of spans()) for (const m of maps.slice(1, -1)) {
    const r = m.runs.find(r => r.span);
    if (r.width < 2) continue;
    const lanes = [...r.lanes].sort((a, b) => across(s, a[0]) - across(s, b[0]));
    const links = structureLinks(m), sideDir = s.dir < 2 ? 2 : 0;
    for (let j = 0; j < r.k; j++) {
      for (let i = 0; i < lanes.length - 1; i++) {
        const a = lanes[i][j], b = lanes[i + 1][j], [bx, bz] = xy(b);
        assert.ok(!edgeRail(m, a, bx, bz), `${seed}: internal rail`);
        assert.ok(links.get(a)?.[sideDir].includes(b), `${seed}: lateral graph edge`);
        assert.ok(links.get(b)?.[sideDir ^ 1].includes(a), `${seed}: reverse lateral graph edge`);
        assert.equal(navNeighbor(m, a, sideDir), b, `${seed}: lateral navigation`);
      }
      for (const [lane, sign] of [[lanes[0], -1], [lanes.at(-1), 1]]) {
        const p = lane[j], [x, z] = xy(p);
        assert.ok(edgeRail(m, p, x + (s.dir >= 2 ? sign : 0), z + (s.dir < 2 ? sign : 0)), `${seed}: outer rail`);
      }
    }
    checked++;
  }
  assert.ok(checked > 0, 'generated a wide span');
});

test('a hero can cross a wide deck sideways but is held at its outer rail', () => {
  let checked = 0;
  for (const { s, maps } of spans()) for (const m of maps.slice(1, 2)) {
    const r = m.runs.find(r => r.span);
    if (r.width < 2) continue;
    const lanes = [...r.lanes].sort((a, b) => across(s, a[0]) - across(s, b[0]));
    const p = lanes[0][Math.floor(r.k / 2)], [x, z] = xy(p), y = runY(p, .5, .5);
    state.map = m;
    Object.assign(player, { x: x + .5, z: z + .5, y, vx: 0, vy: 0, vz: 0, visY: y, grounded: true, swimming: false,
      fluid: 0, stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: CHAR_H, support: p, climb: null, gust: null, pull: null, effects: {} });
    for (let i = 0; i < 150; i++) movePlayer(1 / 60, s.dir >= 2 ? 1 : 0, s.dir < 2 ? 1 : 0, true, false);
    const coordinate = s.dir < 2 ? player.z : player.x;
    assert.ok(coordinate > across(s, lanes.at(-1)[0]), 'crossed the internal lane boundary');
    assert.ok(coordinate < across(s, lanes.at(-1)[0]) + 1, 'held by the outer rail');
    assert.ok(Math.abs(player.y - y) < .5, 'remained on the deck');
    checked++;
  }
  assert.equal(checked, 4, 'both wide sizes and all four directions');
});

function clickBetween(m, from, to) {
  structureLinks(m);
  const [x, z] = xy(from), y = topOf(from, .5, .5);
  state.map = m;
  Object.assign(player, { x: x + .5, z: z + .5, y, vx: 0, vy: 0, vz: 0, visY: y, grounded: true, swimming: false,
    fluid: 0, stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: CHAR_H, support: from, climb: null, gust: null, pull: null, effects: {} });
  const walk = planWalk(to, to.x + .5, to.z + .5, topOf(to, .5, .5), false);
  assert.ok(walk.reached, 'click has a complete route');
  assert.ok(walk.how.every(h => !h), 'a wide deck needs no ladder or jump');
  let arrived = false;
  for (let frame = 0; frame < 1200; frame++) {
    const steering = steerWalk(walk, 1 / 60);
    assert.ok(steering, 'walk can be steered');
    const left = Math.hypot(walk.x - player.x, walk.z - player.z);
    if (walk.done && left < .08) { arrived = true; break; }
    const ease = steering.end ? Math.min(1, Math.max(.25, left / .5)) : 1;
    movePlayer(1 / 60, steering.dx * ease, steering.dz * ease, true, steering.jump);
  }
  assert.ok(arrived, 'click reached its destination');
  assert.equal(player.support, to, 'finished on the clicked node');
}

test('a click walks along and across representative wide decks without jumping', () => {
  for (const { maps } of spans()) {
    const m = maps[1], r = m.runs.find(r => r.span);
    if (r.width > 1) clickBetween(m, r.lanes[0][0], r.lanes.at(-1).at(-1));
  }
});

test('a generated ordinary wide bridge joins unprotected banks and supports lateral clicks', () => {
  const m = worldOf(0).cube('0,-1,-3').map;
  const r = m.runs.find(r => r.kind === 'bridge' && !r.span && r.width === 2 && r.k === 3);
  assert.ok(r, 'selected ordinary plank bridge');
  assert.equal(r.style, 'plank');
  assert.equal(r.lanes.length, 2);
  structureLinks(m);
  for (const lane of r.lanes) {
    assert.equal(lane.length, r.k);
    for (const p of lane) assert.ok(m.pieces[p.c].includes(p), 'lane registered in map');
    const banks = [[lane[0], -1, r.from], [lane.at(-1), 1, r.to]].map(([p, sign, original]) => {
      const c = p.c + sign * (r.dx + r.dz * N), dir = sign < 0 ? r.d ^ 1 : r.d;
      const bank = m.cols[c].find(f => !f.fluid && f.top === original.top && f.layer === original.layer);
      assert.ok(bank && !bank.prot, 'ordinary lane meets an unprotected bank');
      assert.equal(navNeighbor(m, p, dir), bank, 'walk from lane onto bank');
      assert.equal(navNeighbor(m, bank, dir ^ 1), p, 'walk from bank onto lane');
      return bank;
    });
    clickBetween(m, banks[0], banks[1]);
    clickBetween(m, banks[1], banks[0]);
  }
  const a = r.lanes[0][1], b = r.lanes[1][1];
  clickBetween(m, a, b);
  clickBetween(m, b, a);
});

// A short ordinary bridge with level banks on either side of the centreline and low
// ground under each possible lane. These fixtures do not generate any extra worlds.
function shortBridge(axis = 0, reverse = false) {
  const cell = (u, v) => axis === 0 ? v * N + u : u * N + v;
  const cols = Array.from({ length: N * N }, (_, c) => [{ c, top: 0, bottom: -2, layer: 0 }]);
  for (const u of [3, 7]) for (const v of [7, 8, 9]) cols[cell(u, v)][0].top = 12;
  const from = cols[cell(reverse ? 7 : 3, 8)][0], to = cols[cell(reverse ? 3 : 7, 8)][0];
  const cells = [4, 5, 6].map(u => cell(u, 8));
  if (reverse) cells.reverse();
  const ctx = { seed: 0, spec: {}, cols, headOK: () => true };
  const m = { kind: 'bridge', from, to, dx: axis === 0 ? (reverse ? -1 : 1) : 0,
    dz: axis === 1 ? (reverse ? -1 : 1) : 0, cells };
  return { ctx, m, cell, stride: axis === 0 ? N : 1 };
}

// Select a deterministic example by observable behaviour, not by duplicating its hash.
function wantWidth(f, width) {
  for (let seed = 0; seed < 1000; seed++) {
    f.ctx.seed = seed;
    const widened = widenBridge(f.ctx, f.m, () => true);
    if ((widened.width || 1) === width) return f;
  }
  assert.fail(`no synthetic example of width ${width}`);
}

test('ordinary bridges widen on either axis without changing the guaranteed centreline', () => {
  for (const axis of [0, 1]) for (const reverse of [false, true]) for (const width of [2, 3]) {
    const { ctx, m, stride } = wantWidth(shortBridge(axis, reverse), width);
    const before = structuredClone(m), wide = widenBridge(ctx, m, () => true);
    const offsets = width === 3 ? [-1, 0, 1] : [0, 1];
    assert.equal(wide.width, width);
    assert.equal(wide.cells, m.cells, 'centreline remains the original route');
    assert.equal(wide.from, m.from);
    assert.equal(wide.to, m.to);
    assert.deepEqual(wide.lanes, offsets.map(o => m.cells.map(c => c + o * stride)));
    assert.deepEqual(m, before, 'optional widening does not mutate the move');
  }
});

test('added lanes require matching clear banks and try the other side when blocked', () => {
  const blocks = {
    'wrong level': g => { g.top--; },
    'wrong layer': g => { g.layer++; },
    'wet bank': g => { g.fluid = WATER; g.surf = 12; },
    'covered bank': g => { g.covered = true; },
    'site bank': g => { g.siteBlocked = true; },
    'claimed site': g => { g.siteClaimTop = true; },
    'horde bank': g => { g.hordeReserved = true; },
  };
  for (const axis of [0, 1]) for (const [why, block] of Object.entries(blocks)) {
    const { ctx, m, stride } = wantWidth(shortBridge(axis), 2);
    block(ctx.cols[m.from.c + stride][0]);
    const wide = widenBridge(ctx, m, () => true);
    assert.deepEqual(wide.lanes, [-1, 0].map(o => m.cells.map(c => c + o * stride)), `${why}: choose the clear side`);
    block(ctx.cols[m.to.c - stride][0]);
    assert.equal(widenBridge(ctx, m, () => true), m, `${why}: preserve narrow route if neither side fits`);
  }
  const { ctx, m } = wantWidth(shortBridge(), 3);
  ctx.headOK = f => f === m.from || f === m.to;
  assert.equal(widenBridge(ctx, m, () => true), m, 'no added bank has headroom');
});

test('widening checks every added column, including overhead floors and water surfaces', () => {
  for (const axis of [0, 1]) {
    const { ctx, m, stride } = wantWidth(shortBridge(axis), 3);
    const side = sign => ctx.cols[m.cells[1] + sign * stride];
    side(1).push({ bottom: 12, top: 15, layer: 1 });
    assert.equal(widenBridge(ctx, m, () => true).width, 2, 'overhead floor prevents the broad deck');
    side(-1)[0] = { top: 0, bottom: -2, fluid: WATER, surf: 12 };
    assert.equal(widenBridge(ctx, m, () => true), m, 'a high water surface is not a clear column');
    side(-1)[0].surf = 10;
    assert.equal(widenBridge(ctx, m, () => true).width, 2, 'low water under a deck is allowed');
    side(1).pop();
    assert.equal(widenBridge(ctx, m, () => true).width, 3, 'clear full columns allow all three lanes');
    ctx.noCross = new Set([m.cells.at(-1) + stride]);
    ctx.trialKeep = new Set([m.cells[0] - stride]);
    assert.equal(widenBridge(ctx, m, () => true), m, 'protected cells anywhere along a lane prevent widening');
  }
});

test('claim failures reduce the optional width or leave the original route alone', () => {
  const { ctx, m } = wantWidth(shortBridge(), 3), attempts = [];
  const wide = widenBridge(ctx, m, candidate => { attempts.push(candidate.width); return candidate.width === 2; });
  assert.equal(wide.width, 2);
  assert.deepEqual(attempts, [3, 2], 'try broad first, then a smaller footprint');
  const failed = [];
  assert.equal(widenBridge(ctx, m, candidate => { failed.push(candidate.lanes); return false; }), m);
  assert.equal(failed.length, 3, 'try width three and both width-two offsets before giving up');
  assert.equal(m.width, undefined);
  assert.equal(m.lanes, undefined);
});

test('ordinary width three is rare, with narrow and width-two routes still common', () => {
  const { ctx, m } = shortBridge(), counts = [0, 0, 0, 0];
  for (ctx.seed = 0; ctx.seed < 512; ctx.seed++) counts[widenBridge(ctx, m, () => true).width || 1]++;
  assert.ok(counts[3] > 0 && counts[3] < 512 * .1, `rare width three: ${counts}`);
  assert.ok(counts[2] > counts[3] * 2, `width two is more common: ${counts}`);
  assert.ok(counts[1] > counts[2], `most bridges remain narrow: ${counts}`);
  const short = { ...m, cells: m.cells.slice(0, 2) };
  for (ctx.seed = 0; ctx.seed < 64; ctx.seed++) assert.notEqual(widenBridge(ctx, short, () => true).width, 3, 'two-cell bridges never get width three');
});

test('bridge style limits reject wide logs and three-lane rope or flag decks', () => {
  const ordinary = { solid: true, k: 3, room: Infinity };
  const span = { span: true, level: true, sky: false };
  for (const [style, limit] of Object.entries({ log: 1, rope: 2, flags: 2, stone: 3, plank: 3, iron: 3, chain: 3, ice: 3, rockarch: 3 })) {
    assert.equal(BRIDGE_STYLES[style].width, limit, `${style}: declared width limit`);
    assert.ok(bridgeFits(style, { ...ordinary, width: limit }), `${style}: maximum ordinary width fits`);
    assert.ok(!bridgeFits(style, { ...ordinary, width: limit + 1 }), `${style}: reject wider ordinary deck`);
    assert.ok(!bridgeFits(style, { ...span, width: limit + 1 }), `${style}: reject wider gorge deck`);
  }
  for (const where of [ordinary, span]) for (const width of [2, 3]) {
    const weights = { log: 100, rope: 100, flags: 100, iron: 1 };
    for (let i = 0; i < 32; i++) {
      const style = pickBridge(weights, { ...where, width }, (i + .5) / 32);
      assert.ok(bridgeFits(style, { ...where, width }), 'weighted selection always respects the requested width');
    }
    assert.equal(pickBridge({ log: 1 }, { ...where, width }, .5), 'plank', 'forced narrow style falls back safely');
  }
});

function renderRun(axis, reverse, width, side) {
  const { m, stride } = shortBridge(axis, reverse);
  const r = { ...m, d: axis * 2 + Number(reverse), k: m.cells.length, width, y0: 6, y1: 6.5, sag: .2 };
  const offsets = width === 3 ? [-1, 0, 1] : side < 0 ? [-1, 0] : [0, 1];
  r.lanes = offsets.map((o, i) => m.cells.map((c, j) => ({ c: c + o * stride, j, dx: r.dx, dz: r.dz, run: r, ground: i * .5, bed: i * .5 })));
  r.pieces = r.lanes.find(lane => lane[0].c === m.cells[0]);
  return r;
}
function renderExamples() {
  const out = [];
  for (const axis of [0, 1]) for (const reverse of [false, true]) for (const width of [2, 3])
    for (const side of width === 2 ? [-1, 1] : [0]) out.push(renderRun(axis, reverse, width, side));
  return out;
}
function footprint(r) {
  const cells = r.lanes.flat().map(xy);
  return [[Math.min(...cells.map(p => p[0])), Math.max(...cells.map(p => p[0])) + 1],
    [Math.min(...cells.map(p => p[1])), Math.max(...cells.map(p => p[1])) + 1]];
}
const near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-9, `${why}: ${a} vs ${b}`);

test('runFrame covers the physical lanes in every direction, including a negative added side', () => {
  for (const r of renderExamples()) {
    const F = runFrame(r), bounds = footprint(r);
    const corners = [F.P(0, -.5, 0), F.P(0, .5, 0), F.P(r.k, -.5, 0), F.P(r.k, .5, 0)];
    for (const [index, coord] of [0, 2].entries()) {
      near(Math.min(...corners.map(p => p[coord])), bounds[index][0], 'physical footprint minimum');
      near(Math.max(...corners.map(p => p[coord])), bounds[index][1], 'physical footprint maximum');
    }
    const center = F.P(.5, 0, 7);
    near(center[0], r.lanes.reduce((sum, lane) => sum + xy(lane[0])[0] + .5, 0) / r.width, 'first slice x centre');
    near(center[2], r.lanes.reduce((sum, lane) => sum + xy(lane[0])[1] + .5, 0) / r.width, 'first slice z centre');
    assert.equal(center[1], 7);
    near(F.Y(0), r.y0, 'near bank height');
    near(F.Y(r.k), r.y1, 'far bank height');
    near(F.Y(r.k / 2), (r.y0 + r.y1) / 2 - r.sag, 'deck sag');
  }
});

test('wide bridge builders produce finite geometry covering the correct physical footprint', () => {
  for (const r of renderExamples()) for (const [style, build] of Object.entries(BRIDGES)) {
    if (!bridgeFits(style, { width: r.width, solid: true, room: Infinity, k: r.k })) continue;
    const run = { ...r, style, sag: BRIDGE_STYLES[style].sag(r.k, false) };
    const L = { stone: new GeoBuilder(), wood: new GeoBuilder(), terrain: new GeoBuilder(), flags: new GeoBuilder({ sway: true }) };
    build(run, L);
    const bounds = footprint(r), actual = [[Infinity, -Infinity], [Infinity, -Infinity]];
    let vertices = 0;
    for (const b of Object.values(L)) {
      assert.ok(b.pos.every(Number.isFinite) && b.nor.every(Number.isFinite) && b.col.every(Number.isFinite), `${style}: finite geometry`);
      if (b.uv) assert.ok(b.uv.every(Number.isFinite), `${style}: finite flag sway`);
      for (let i = 0; i < b.pos.length; i += 3) {
        vertices++;
        for (const [j, coord] of [0, 2].entries()) {
          actual[j][0] = Math.min(actual[j][0], b.pos[i + coord]);
          actual[j][1] = Math.max(actual[j][1], b.pos[i + coord]);
        }
      }
    }
    assert.ok(vertices > 0, `${style}: rendered triangles`);
    for (let j = 0; j < 2; j++) {
      const [lo, hi] = bounds[j], [min, max] = actual[j];
      assert.ok(min >= lo - .3 && max <= hi + .3, `${style}, dir ${r.d}, width ${r.width}: geometry stays near occupied columns`);
      assert.ok(max - min >= (hi - lo) * .8, `${style}: geometry spans the whole deck, not just its centreline`);
      assert.ok(Math.abs((min + max) / 2 - (lo + hi) / 2) < .15, `${style}: geometry is centred on actual lanes`);
    }
  }
});

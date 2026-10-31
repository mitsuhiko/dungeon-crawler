import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDS, BRIDGE_STYLES, bridgeFits, pickBridge, bridgesOf, LADDER_STYLES, HANG_WOOD, pickLadder, laddersOf } from '../src/themes/builds.js';
import { LADDERS, buildLadder } from '../src/render/ladders.js';
import { GeoBuilder } from '../src/render/builder.js';
import { SURFACES } from '../src/core/footing.js';
import { BRIDGES } from '../src/render/bridges.js';
import { THEMES } from '../src/themes/index.js';
import { World } from '../src/world/world.js';
import { roomOver } from '../src/cubegen/shape.js';
import { buildCubeGeometry } from '../src/render/cubegeo.js';
import { N, LH, DIRS } from '../src/core/constants.js';

// every situation a bridge is picked in (cubegen/shape.js, world/spans.js)
const WHERE = {
  'short, over a drop': { solid: false, k: 1, room: Infinity },
  'long, over a drop': { solid: false, k: 7, room: Infinity },
  'over ground': { solid: true, k: 3, room: Infinity },
  'under something': { solid: false, k: 4, room: 1 },
  span: { span: true, sky: false, level: false },
  'level span': { span: true, sky: false, level: true },
  'sky span': { span: true, sky: true, level: true },
};

test('every bridge style has a builder, a surface and sane sag', () => {
  for (const [name, s] of Object.entries(BRIDGE_STYLES)) {
    assert.ok(BRIDGES[name], `${name}: builder`);
    assert.ok(SURFACES.includes(s.surface), `${name}: surface`);
    assert.ok(['piers', 'legs', 'none'].includes(s.supports), `${name}: supports`);
    for (let k = 1; k <= 12; k++) for (const span of [false, true]) {
      const sag = s.sag(k, span);
      assert.ok(sag >= 0 && sag <= 1, `${name}: sag ${sag} at ${k}`);
    }
  }
});

test('every theme weights known bridge styles and has one wherever a bridge goes', () => {
  for (const t of THEMES) {
    const w = BUILDS[t.props].bridges;
    for (const [s, v] of Object.entries(w)) assert.ok(BRIDGE_STYLES[s] && v > 0, `${t.props}: ${s}`);
    for (const [what, where] of Object.entries(WHERE))
      assert.ok(Object.keys(w).some(s => bridgeFits(s, where)), `${t.props}: nothing fits ${what}`);
  }
});

test('bridge picks keep to the styles that fit and to their weights', () => {
  // stone arches only over ground, never over the sky
  assert.ok(!bridgeFits('stone', WHERE['long, over a drop']) && bridgeFits('stone', WHERE['over ground']));
  assert.ok(bridgeFits('stone', WHERE.span) && !bridgeFits('stone', WHERE['sky span']));
  const count = (weights, where) => {
    const n = {};
    for (let i = 0; i < 1000; i++) { const s = pickBridge(weights, where, (i + 0.5) / 1000); n[s] = (n[s] || 0) + 1; }
    return n;
  };
  assert.deepEqual(count({ stone: 1, rope: 3 }, WHERE['over ground']), { stone: 250, rope: 750 });
  assert.deepEqual(count({ stone: 1, rope: 3 }, WHERE['sky span']), { rope: 1000 });
  assert.deepEqual(count({ stone: 1 }, WHERE['sky span']), { plank: 1000 });   // nothing fits
  // logs only short, never a span; chains not short and only with room for their towers
  assert.ok(bridgeFits('log', WHERE['under something']) && !bridgeFits('log', WHERE['long, over a drop']) && !bridgeFits('log', WHERE.span));
  assert.ok(!bridgeFits('chain', WHERE['short, over a drop']) && bridgeFits('chain', WHERE['long, over a drop']));
  assert.ok(!bridgeFits('chain', WHERE['under something']) && !bridgeFits('flags', WHERE['under something']));
  assert.ok(bridgeFits('chain', WHERE['sky span']) && bridgeFits('flags', WHERE['sky span']) && bridgeFits('ice', WHERE['sky span']));
  // natural arches like stone ones, and on a span only a level one
  assert.ok(bridgeFits('rockarch', WHERE['over ground']) && !bridgeFits('rockarch', WHERE['long, over a drop']));
  assert.ok(!bridgeFits('rockarch', WHERE.span) && bridgeFits('rockarch', WHERE['level span']) && !bridgeFits('rockarch', WHERE['sky span']));
  // a forced style wherever it fits
  assert.deepEqual(bridgesOf(THEMES[0], 'iron'), { iron: 1 });
  assert.equal(bridgesOf(THEMES[0]), BUILDS[THEMES[0].props].bridges);
});

// every bridge of `style` on every third depth of a few worlds (made with that style forced), with
// its map
function bridgesIn(style, themes, seeds = [1]) {
  const out = [];
  for (const seed of seeds) {
    const w = new World(seed, { bridge: style, themes });
    for (let d = 0; d <= 20; d += 3) for (const k of w.layout(d).exists) {
      const m = w.cube(k).map;
      // (the town's own spans down its escarpment are its own: world/townland.js)
      if (m.town) continue;
      for (const r of m.runs) if (r.kind === 'bridge' && r.style === style) out.push({ m, r, span: w.layout(d).spans.find(s => s.keys.includes(k)) });
    }
  }
  return out;
}

test('the new bridge styles go only where they fit, and are drawn', () => {
  const seen = {};
  for (const style of ['log', 'chain', 'ice', 'rockarch', 'flags']) {
    const list = bridgesIn(style, style === 'rockarch' ? ['canyon', 'karst'] : []), S = BRIDGE_STYLES[style];
    seen[style] = list.length;
    for (const { m, r, span } of list) {
      const at = `${m.key} ${style}`;
      if (r.span) {
        assert.ok(S.span, `${at}: on a span`);
        if (S.level) assert.ok(span.levels.every(v => v === span.levels[0]), `${at}: on a sloping span`);
        if (span.sky) assert.ok(S.sky && !S.ground, `${at}: over the sky`);
        assert.equal(r.k, N - 4);
      } else {
        assert.ok(r.k >= S.k[0] && r.k <= S.k[1], `${at}: ${r.k} cells`);
        if (S.ground) assert.ok(r.pieces.every(p => Math.min(r.y0, r.y1) - 0.25 - p.ground < 8), `${at}: ground far below`);
      }
      // towers and poles: nothing over them (a span's cubes have one layer)
      if (S.towers) assert.ok(roomOver(m.cols, m.pieces, r) >= S.towers + 0.25, `${at}: no room for the towers`);
      assert.ok(!r.pillars?.length, `${at}: no legs or piers`);
      assert.equal(r.sag, S.sag(r.k, r.span));
    }
    // and drawn without trouble
    for (const m of new Set(list.slice(0, 30).map(b => b.m))) {
      const parts = buildCubeGeometry(m);
      for (const L of parts) for (const part of ['terrain', 'stone', 'wood']) if (L[part]) assert.ok(L[part].pos.every(Number.isFinite), `${m.key}: ${part}`);
    }
  }
  assert.ok(Object.values(seen).every(n => n > 10), JSON.stringify(seen));
});

test('themes build their own bridges: logs in the roots, ice in the frozen caves, flags in the highlands', () => {
  const styles = theme => {
    const n = {};
    for (const seed of [1, 2]) {
      const w = new World(seed, { themes: [theme] });
      for (let d = 0; d <= 20; d++) if (w.layout(d).theme.props === theme) for (const k of w.layout(d).exists)
        for (const r of w.cube(k).map.runs) if (r.kind === 'bridge') n[r.style] = (n[r.style] || 0) + 1;
    }
    return n;
  };
  for (const [theme, style] of [['roots', 'log'], ['frozen', 'ice'], ['highlands', 'flags']]) {
    const n = styles(theme), all = Object.values(n).reduce((a, b) => a + b, 0);
    for (const s of Object.keys(n)) assert.ok(s in BUILDS[theme].bridges || s === 'plank', `${theme}: ${s}`);
    assert.ok(n[style] > all * 0.25, `${theme}: ${JSON.stringify(n)}`);
  }
});

test('every theme weights known ladder styles, and hanging ladders are the ones that can hang', () => {
  for (const name of Object.keys(LADDER_STYLES)) assert.ok(LADDERS[name], `${name}: builder`);
  for (const t of THEMES) for (const [s, v] of Object.entries(BUILDS[t.props].ladders)) assert.ok(LADDER_STYLES[s] && v > 0, `${t.props}: ${s}`);
  const count = (weights, hang) => {
    const n = {};
    for (let i = 0; i < 1000; i++) { const s = pickLadder(weights, hang, (i + 0.5) / 1000); n[s] = (n[s] || 0) + 1; }
    return n;
  };
  assert.deepEqual(count({ iron: 1, footholds: 1 }, false), { iron: 500, footholds: 500 });
  assert.deepEqual(count({ iron: 1, footholds: 1 }, true), { rope: 1000 });   // none can hang
  assert.deepEqual(count({ wood: 4, vine: 1, iron: 5 }, true), { wood: 1000 * 4 * HANG_WOOD / (4 * HANG_WOOD + 1), vine: 1000 / (4 * HANG_WOOD + 1) });
  assert.deepEqual(laddersOf(THEMES[0], 'vine'), { vine: 1 });
});

test('ladders in generated worlds keep to their theme\'s styles and are drawn', () => {
  const seen = {};
  for (const seed of [1, 2]) {
    const w = new World(seed);
    for (let d = 1; d <= 20; d++) for (const k of [...w.layout(d).exists].slice(0, 6)) {
      const m = w.cube(k).map, weights = BUILDS[m.biome].ladders;
      for (const l of m.ladders) {
        seen[l.style] = (seen[l.style] || 0) + 1;
        assert.ok(l.style in weights || l.style === 'rope', `${k}: ${l.style} in ${m.biome}`);
        if (l.hang) assert.ok(LADDER_STYLES[l.style].hang, `${k}: a hanging ${l.style} ladder`);
      }
    }
  }
  assert.ok(Object.keys(LADDER_STYLES).every(s => seen[s] > 3), JSON.stringify(seen));
  // the same ladders whichever way round the cube is made; every style drawn, hanging too
  const A = new World(3), B = new World(3), route = A.layout(2).route;
  for (const k of [...route].reverse()) B.cube(k);
  for (const k of route) assert.deepEqual(A.cube(k).map.ladders, B.cube(k).map.ladders, k);
  for (const style of Object.keys(LADDER_STYLES)) for (const hang of [false, true]) {
    const L = { terrain: new GeoBuilder(), stone: new GeoBuilder(), wood: new GeoBuilder() };
    buildLadder({ c: 5, x: 5, z: 0, d: 2, y0: 1, y1: 4.5, hang, style }, L);
    const pos = [...L.terrain.pos, ...L.wood.pos];
    assert.ok(pos.length && pos.every(Number.isFinite), `${style}: drawn`);
  }
});

// a hanging ladder has only air behind its lower part: no bridge or stair runs through that air
// under its platform (it would cross the ladder, or a bridge would lead straight into it). These
// cubes had one before the ladder claimed the air (cubegen/climbs.js placeClimb).
test('no bridge or stair runs under a hanging ladder\'s platform', () => {
  // (the depths where one did, once: every room of them; the worlds have changed since)
  const cubes = { 1: [3], 2: [6], 3: [10], 4: [12], 6: [17], 10: [2], 11: [4], 12: [1, 2] };
  let hanging = 0;
  for (const [seed, depths] of Object.entries(cubes)) {
    const w = new World(+seed);
    for (const k of depths.flatMap(d => [...w.layout(d).exists])) {
      const m = w.cube(k).map;
      hanging += m.ladders.filter(l => l.hang).length;
      for (const l of m.ladders) {
        if (!l.hang) continue;
        const behind = (l.z + DIRS[l.d][1]) * N + l.x + DIRS[l.d][0];
        for (const r of m.runs) for (const p of r.pieces) if (p.c === behind)
          assert.ok(Math.min(p.y0, p.y1) >= l.y1 || Math.max(p.y0, p.y1) <= l.y0 - 1, `${seed} ${k}: a ${r.kind} under the ladder at ${l.x},${l.z}`);
      }
    }
  }
  assert.ok(hanging > 5, `only ${hanging} hanging ladders`);
});

test('a forced ladder style goes wherever it fits', () => {
  const w = new World(1, { ladder: 'footholds' });
  let n = 0;
  for (let d = 1; d <= 6; d++) for (const k of w.layout(d).exists) for (const l of w.cube(k).map.ladders) {
    assert.equal(l.style, l.hang ? 'rope' : 'footholds');
    n++;
  }
  assert.ok(n > 10);
});

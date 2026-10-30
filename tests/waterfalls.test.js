// Hidden caves behind waterfalls (cubegen/grotto.js, docs/world.md "Waterfall grottos"): carved in
// the cube itself, closed all round but behind the curtain, with an uncommon chest at the back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { generate } from '../src/cubegen/index.js';
import { GROTTO_WIDTH } from '../src/cubegen/grotto.js';
import { ROOF } from '../src/cubegen/tunnel.js';
import { reachTo } from '../src/cubegen/reach.js';
import { N, DIRS, WATER, CHAR_R, CHAR_H } from '../src/core/constants.js';
import { chestLoot } from '../src/core/chests.js';
import { topOf } from '../src/core/surfaces.js';
import { player } from '../src/game/state.js';
import { movePlayer } from '../src/physics/move.js';
import { respawnPoint } from '../src/physics/respawn.js';
import { planWalk, steerWalk } from '../src/physics/playernav.js';
import { buildCubeParts } from '../src/render/cubegeo.js';

const context = m => ({ ...m,
  nextAbove: f => m.cols[f.c][m.cols[f.c].indexOf(f) + 1],
  headOK: (f, h) => { const a = m.cols[f.c][m.cols[f.c].indexOf(f) + 1]; return !a || a.bottom >= Math.max(h, f.top) + 2; },
});

// the first cubes of a world with a cave behind a waterfall, from depth 1 down
function grottos(seed, most = 3) {
  const w = new World(seed), out = [];
  for (let d = 1; d <= 20 && out.length < most; d++) for (const k of [...w.layout(d).exists].sort()) {
    const m = w.cube(k).map;
    if (m.grotto) out.push({ w, k, m });
    if (out.length >= most) break;
  }
  return out;
}
const found = grottos(99);

test('some tall clear-water falls hide a cave, the same every time', () => {
  assert.equal(found.length, 3);
  for (const { k, m } of found) {
    assert.deepEqual(new World(99).cube(k).map.grotto, m.grotto);
    const fall = m.falls[m.grotto.fall];
    assert.equal(fall.type, WATER); assert.equal(fall.grotto, true); assert.equal(fall.width, GROTTO_WIDTH);
    assert.equal(m.falls.filter(f => f.grotto).length, 1, 'one cave a cube');
    assert.equal(m.grotto.site, `${k}:grotto`);
  }
});

test('the cave is closed all round but behind the curtain, under a roof, level with the pool', () => {
  for (const { m } of found) {
    const fall = m.falls[m.grotto.fall], F = fall.bot, cells = new Set(m.grotto.cells);
    const [dx, dz] = DIRS[fall.d], mouth = m.grotto.cells[0];
    assert.equal(mouth, fall.c - dx - dz * N, 'it opens right behind the curtain');
    for (const c of cells) {
      const floor = m.cols[c].find(f => f.grotto);
      assert.ok(floor && floor.top === F && !floor.fluid && floor.noSpawn);
      assert.ok(Math.max(...floor.cs) - Math.min(...floor.cs) < 0.2, 'flat');
      const roof = m.cols[c][m.cols[c].indexOf(floor) + 1];
      assert.ok(roof && roof.bottom === F + ROOF && roof.roof, 'a roof over it, a slab for the cutaway');
      for (const [ex, ez] of DIRS) {
        const n = c + ex + ez * N;
        if (cells.has(n) || n === fall.c) continue;
        assert.ok(m.cols[n].some(f => f.bottom <= F && f.top >= F + ROOF), `rock beside the cave at ${n % N},${(n / N) | 0}`);
      }
    }
  }
});

test('its chest is an ordinary uncommon one, got to and back from, kept free of props and enemies', () => {
  for (const { m } of found) {
    const site = m.rewardSites.find(s => s.id === m.grotto.site), ctx = context(m);
    assert.ok(site); assert.equal(site.prestige, 'uncommon'); assert.equal(site.encounter, null);
    assert.equal(m.sitePlacements.filter(p => p.site === site.id && p.name === 'treasure_chest').length, 1);
    assert.equal(m.safe[site.floor], 1); assert.equal(m.safe[site.accessFloor], 1);
    assert.ok(reachTo(ctx, m.floors[site.accessFloor], true).has(m.portals[0].floor.id), 'from the portals to the chest');
    for (const c of m.grotto.cells) assert.ok(m.siteReservations.some(r => r.c === c));
    assert.deepEqual(chestLoot(site, m.depth, m.seed), chestLoot(site, m.depth, m.seed));
  }
});

test('a cube without a cave is made as it would be without them', () => {
  const w = found[0].w;
  let plain = 0;
  for (const k of [...w.layout(1).exists].sort()) {
    const m = w.cube(k).map;
    if (m.grotto || m.stats.grotto || m.guardian || m.town) continue;
    const off = generate({ ...w.spec(k), grotto: false });
    const terrain = x => x.floors.map(f => [f.c, f.top, f.bottom, f.cs, f.fluid, f.surf]);
    assert.deepEqual(terrain(m), terrain(off), k);
    assert.deepEqual(m.rewardSites, off.rewardSites);
    plain++;
  }
  assert.ok(plain > 3);
  const { k } = found[0];
  assert.equal(generate({ ...found[0].w.spec(k), grotto: false }).grotto, null);
});

test('the hero gets from the pool through the curtain to the chest by click to move', () => {
  for (const { m } of found) {
    state.map = m; state.time = 0;
    const site = m.rewardSites.find(s => s.id === m.grotto.site), f = m.grotto.front;
    Object.assign(player, { x: f.x, y: f.y, z: f.z, vx: 0, vy: 0, vz: 0, grounded: !f.swim, swimming: f.swim, wade: 0, stun: 0,
      coyote: 0, jumpBuf: 0, r: CHAR_R, h: CHAR_H, support: null, climb: null, gust: null, pull: null, effects: {}, hp: 100, maxHp: 100 });
    const to = m.floors[site.accessFloor], w = planWalk(to, site.approach.x, site.approach.z, topOf(to, 0.5, 0.5), true);
    assert.ok(w, 'click to move finds the way in');
    let inside = false;
    for (let i = 0; i < 60 * 30 && !inside; i++) {
      const s = steerWalk(w, 1 / 60);
      if (!s) break;
      movePlayer(1 / 60, s.dx, s.dz, true, s.jump);   // (the curtain's push, physics/hazards.js, lets it through: tests/browser)
      inside = m.grotto.cells.includes(Math.floor(player.z) * N + Math.floor(player.x)) && player.grounded;
    }
    assert.ok(inside, `into the cave of ${m.key}`);
    // a respawn never puts anyone into the cave from outside it
    const out = respawnPoint({ x: f.x, y: f.y, z: f.z });
    assert.ok(!m.grotto.cells.includes(Math.floor(out.z) * N + Math.floor(out.x)));
  }
});

test('the broad curtain and the carved rock build into the cube geometry', () => {
  const { m } = found[0], fall = m.falls[m.grotto.fall];
  const wide = buildCubeParts(m), narrow = buildCubeParts({ ...m, falls: m.falls.map(f => f === fall ? { ...f, width: undefined } : f) });
  const axis = fall.d < 2 ? 2 : 0;
  const span = part => {
    const a = []; for (let i = axis; i < part.pos.length; i += 4) a.push(part.pos[i]);
    return Math.max(...a) - Math.min(...a);
  };
  assert.ok(span(wide.parts['water-fall']) >= span(narrow.parts['water-fall']));
  assert.ok(wide.parts.terrain.pos.length > 0);
});

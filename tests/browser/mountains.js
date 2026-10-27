// In devtools (?dev=1): await (await import('./tests/browser/mountains.js')).runMountainChecks()
// Monteur's mountains (core/mountains.js, game/mountains.js) in his arena: as the sun he pulls one
// out of the floor under the fight; the floor cracks, it rises and carries the player and him up
// (floor like any other up there: its slopes join the ground, he walks on it, the hero's way goes
// over it); knocked off a mesa with no way up, he brings it down within a few seconds; falling
// apart it carries them down, and the floors are the cube's own again (the map, its links, its
// heights), as after it stood its time. Each shape, raised here by the developer command's spec.
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { LH } from '../../src/core/constants.js';
import { floorY } from '../../src/core/surfaces.js';
import { damageEnemy } from '../../src/core/combat.js';
import { SHAPES, MOUNTAIN, placeMountain } from '../../src/core/mountains.js';
import { allEnemies, updateEnemies } from '../../src/game/enemies.js';
import { updatePlayer } from '../../src/game/update.js';
import { devMountain, downMountain, mountainNow, mountainPlan } from '../../src/game/mountains.js';
import { goBoss } from '../../src/game/dev.js';
import { spawnAt } from '../../src/game/flow.js';
import { loadSpecies } from '../../src/render/enemies.js';
import { groundAt } from '../../src/physics/collide.js';
import { findPath } from '../../src/physics/enemynav.js';

const check = (value, message) => { if (!value) throw Error(message); };
const step = (dt, also) => { updatePlayer(dt); updateEnemies(dt); also(); };
const run = (seconds, also = () => {}, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) step(dt, also); };
const until = (seconds, done, also = () => {}, dt = 1 / 30) => {
  for (let t = 0; t < seconds; t += dt) { step(dt, also); if (done()) return t; }
  return Infinity;
};
const boss = () => allEnemies().find(e => e.boss === 'monteur');
const tough = () => { player.hp = player.maxHp = 1e6; };
// the cube's floors as they are (to see them given back as they were)
const snapshot = map => map.floors.map(f => [f.top, ...f.cs, ...f.link.map(g => g?.id ?? -1)].join(','));

export async function runMountainChecks() {
  return paused(async () => {
    const out = [];
    await goBoss('monteur');
    await loadSpecies(['monteur', 'moose']);
    const base = state.map, before = snapshot(base), b = boss();
    check(b, 'Monteur in his arena');
    tough(); state.enemyGrace = 0;
    // each shape, raised under the hero (the developer command's way: no Monteur needed)
    const quiet = () => { tough(); for (const e of allEnemies()) e.stun = 1; };
    for (const shape of SHAPES) {
      const f = base.floors.filter(g => g.encounter && base.cols[g.c].length === 1).sort((p, q) => Math.hypot(p.x - 8, p.z - 8) - Math.hypot(q.x - 8, q.z - 8))[0];
      spawnAt(f.x + 0.5, floorY(f, 0.5, 0.5), f.z + 0.5);
      run(0.3, quiet);
      const spec = { n: Math.floor(Math.random() * 1e9), seed: 1234 + shape.length, shape, a: 0.5, x: player.x, z: player.z, phase: 'crack', t: 0, life: 6 };
      Object.assign(spec, placeMountain(base, spec, 1.5));
      devMountain(spec);
      run(0.1, quiet);
      const plan = mountainPlan() ?? (run(MOUNTAIN.crack, quiet), mountainPlan());
      check(plan && mountainNow()?.shape === shape, `a ${shape} comes up`);
      run(MOUNTAIN.crack + MOUNTAIN.rise + 0.2, quiet);
      check(mountainNow().phase === 'up' && state.map !== base, `${shape}: up, the map a copy of the cube's`);
      for (const m of plan.cells.values()) {
        const g = groundAt(m.x + 0.5, m.z + 0.5, 100, 0);
        check(g.s === m.f && Math.abs(g.h - floorY(m.f, 0.5, 0.5)) < 1e-6 && Math.abs(m.f.top - m.top) < 1e-9, `${shape}: its floor at its height`);
      }
      const on = plan.cells.get(Math.floor(player.z) * 16 + Math.floor(player.x));
      if (on) check(Math.abs(player.y - floorY(on.f, player.x - on.f.x, player.z - on.f.z)) < 0.05, `${shape}: the hero rode up on it (${player.y.toFixed(2)})`);
      check(plan.ladders.every(l => state.map.ladders.includes(l)), `${shape}: its ladders are there`);
      downMountain();
      run(MOUNTAIN.fall + 0.3, quiet);
      check(!mountainNow() && state.map === base, `${shape}: gone, the cube's own map again`);
      check(snapshot(base).join('|') === before.join('|'), `${shape}: its floors as they were`);
      out.push(`${shape}: ${plan.cells.size} cells, ${plan.ladders.length} ladders, ${on ? 'rode up' : 'beside it'}`);
    }
    // the fight: as the sun he pulls one up under it (when due), and the floors are given back after
    damageEnemy(b, b.hp);
    check(until(6, () => b.stage === 2, tough) < 6, 'he changes into the sun');
    const spot = base.floors.filter(g => g.encounter && base.cols[g.c].length === 1)
      .sort((p, q) => Math.abs(Math.hypot(p.x + 0.5 - b.x, p.z + 0.5 - b.z) - 3) - Math.abs(Math.hypot(q.x + 0.5 - b.x, q.z + 0.5 - b.z) - 3))[0];
    spawnAt(spot.x + 0.5, floorY(spot, 0.5, 0.5), spot.z + 0.5);
    check(until(MOUNTAIN.first + 40, () => !!b.mountain, tough) < Infinity, 'he pulls a mountain out of the floor');
    check(until(MOUNTAIN.crack + MOUNTAIN.rise + 0.5, () => b.mountain?.phase === 'up', tough) < Infinity, 'it rises');
    const plan = mountainPlan();
    check(plan && plan.cells.size >= MOUNTAIN.least, 'under the fight');
    out.push(`his ${b.mountain.shape}: ${plan.cells.size} cells, ${b.f && plan.cells.has(b.f.c) ? 'he rode up' : 'beside him'}`);
    // the hero on top of it, he at its foot with no way up for him: he brings it down
    const top = [...plan.cells.values()].sort((p, q) => q.top - p.top)[0];
    spawnAt(top.x + 0.5, floorY(top.f, 0.5, 0.5), top.z + 0.5);
    const low = base.floors.filter(g => g.encounter && !plan.cells.has(g.c) && base.cols[g.c].length === 1)
      .filter(g => !findPath(g, top.f, 48, b.profile.height))
      .sort((p, q) => Math.hypot(p.x - top.x, p.z - top.z) - Math.hypot(q.x - top.x, q.z - top.z))[0];
    let down = Infinity;
    if (low) {
      Object.assign(b, { x: low.x + 0.5, z: low.z + 0.5, y: floorY(low, 0.5, 0.5), f: low, home: low, path: null });
      down = until(MOUNTAIN.settle + MOUNTAIN.apart + 2, () => b.mountain?.phase === 'fall' || !b.mountain, () => { tough(); spawnAt(top.x + 0.5, floorY(top.f, 0.5, 0.5), top.z + 0.5); });
      check(down < Infinity, 'up there with no way up for him, he brings it down');
      out.push(`apart: brought down after ${down.toFixed(1)} s`);
    }
    check(until(MOUNTAIN.fall + (down < Infinity ? 1 : 32), () => !b.mountain, tough) < Infinity, 'it falls apart');
    run(0.2, tough);
    check(state.map === base && snapshot(base).join('|') === before.join('|'), 'and the floors are the cube\'s own again');
    out.push('gone, the floors given back');
    return out;
  });
}

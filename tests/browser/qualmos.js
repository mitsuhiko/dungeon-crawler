// In devtools (?dev=1): await (await import('./tests/browser/qualmos.js')).runQualmosChecks()
// Qualmos in his arena at the core (docs/bosses.md): its lagoon; his grab glows on the floor as he
// winds it up, catches the hero, holds them up in his hand and slams them down; from phase 2 he is
// harder, his belly flop comes first in its reach and again after two other attacks; and he heads
// into his lagoon, slips under its surface (nothing hits him there), swims to where it comes nearest
// the hero, comes up and leaps out at them.
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { allEnemies, updateEnemies, drawEnemies } from '../../src/game/enemies.js';
import { updatePlayer } from '../../src/game/update.js';
import { goBoss } from '../../src/game/dev.js';
import { spawnAt } from '../../src/game/flow.js';
import { loadSpecies } from '../../src/render/enemies.js';
import { attackOf } from '../../src/core/enemies.js';
import { damageEnemy } from '../../src/core/combat.js';
import { phaseFloor } from '../../src/core/qualmos.js';
import { floorY } from '../../src/core/surfaces.js';
import { wetAt, walker } from '../../src/physics/dwell.js';
import { DIRS } from '../../src/core/constants.js';

const check = (value, message) => { if (!value) throw Error(message); };
const step = (dt, also) => { updatePlayer(dt); updateEnemies(dt); drawEnemies(dt); also(); };
const until = (seconds, done, also = () => {}, dt = 1 / 30) => {
  for (let t = 0; t < seconds; t += dt) { step(dt, also); if (done()) return t; }
  return Infinity;
};
const boss = () => allEnemies().find(e => e.boss === 'qualmos');
const tough = () => { player.hp = player.maxHp = 1e6; };
const dry = f => f.encounter && !f.fluid;
// stand on dry fight-zone ground about d cells from (x, z)
function standNear(x, z, d) {
  const f = state.map.floors.filter(dry)
    .sort((p, q) => Math.abs(Math.hypot(p.x + .5 - x, p.z + .5 - z) - d) - Math.abs(Math.hypot(q.x + .5 - x, q.z + .5 - z) - d))[0];
  spawnAt(f.x + .5, floorY(f, .5, .5), f.z + .5);
  Object.assign(player, { held: null, ragdoll: null, stun: 0, vx: 0, vz: 0 });
  return f;
}
// start his attack `name` at the player
function strike(b, name) {
  Object.assign(b, { mode: 'attack', attack: b.profile.attacks.findIndex(a => a.name === name), t: 0, bit: false, leap: 0, speed: 0,
    path: null, target: player, yaw: Math.atan2(player.x - b.x, player.z - b.z) });
  b.attacks++;
}

export async function runQualmosChecks() {
  return paused(async () => {
    const out = {};
    await goBoss('qualmos');
    await loadSpecies(['qualmos']);
    const map = state.map, b = boss(), lagoon = map.floors.filter(f => f.fluid && f.encounter);
    check(b && lagoon.length >= 8, 'his arena, him in it and his lagoon');
    out.lagoon = lagoon.length;
    tough(); state.enemyGrace = 0;

    // his grab: the floor glows as he winds it up; caught, held up in his hand, slammed down
    standNear(b.x, b.z, 2);
    strike(b, 'grab');
    const grab = attackOf(b);
    let glowed = false;
    until(grab.hitAt + 0.1, () => player.held, () => { tough(); if (b.view?.qualmos?.warn.visible) glowed = true; });
    check(glowed, 'the floor before him glows as he winds up his grab');
    check(player.held?.e === b, 'his hand catches the hero');
    const feet = player.y;
    until(0.6, () => false, tough);
    check(player.held && player.y > b.y + 0.2 && player.y > feet - 0.6, 'held up in his hand');
    const hp = player.hp;   // (a million: not made whole meanwhile)
    until(grab.grab.throwAt - b.t + 0.2, () => !player.held);
    check(!player.held && player.ragdoll && player.hp < hp, 'slammed down and hurt');
    out.grab = hp - player.hp;
    until(4, () => !player.ragdoll && b.mode !== 'attack', tough);

    // phase 2: harder; his belly flop the first attack in its reach
    const damage = b.profile.damage;
    damageEnemy(b, b.hp - phaseFloor(b.profile.hp, 1));
    check(until(3, () => b.stage === 2, tough) < 3, 'into phase 2');
    check(b.profile.damage > damage && b.profile.hp === 6760, 'harder, his health the same');
    until(4, () => b.mode !== 'attack', tough);
    Object.assign(b, { diveIn: 60, cool: 0 });
    standNear(b.x, b.z, 2.5);
    const started = [];
    until(20, () => started.length >= 4, () => {
      tough();
      if (b.mode === 'attack' && started.at(-1)?.n !== b.attacks) started.push({ n: b.attacks, name: attackOf(b).name });
      if (Math.hypot(player.x - b.x, player.z - b.z) > 3.5) standNear(b.x, b.z, 2.5);
    });
    const names = started.map(s => s.name);
    out.attacks = names;
    check(names[0] === 'bellyFlop', `his flop first (${names})`);
    check(names.slice(1, 3).every(n => n !== 'bellyFlop') && names[3] === 'bellyFlop', `then after two others (${names})`);

    // his dive: into the lagoon, under it (nothing hits him), up near the hero, a leap at them (the
    // hero two cells beyond a bank he can climb out on, as far from him as there is one)
    until(6, () => b.mode !== 'attack' && !player.ragdoll, tough);
    const w = walker(b.profile, true), spots = [];
    for (const g of lagoon) DIRS.forEach(([dx, dz], d) => {
      const h = w.step(g, d), k = h && !h.fluid && map.floors.find(f => f.x === h.x + 2 * dx && f.z === h.z + 2 * dz && dry(f) && Math.abs(f.top - h.top) <= 1);
      if (k) spots.push(k);
    });
    check(spots.length, 'a bank he can climb out on');
    const far = spots.sort((p, q) => Math.hypot(q.x - b.x, q.z - b.z) - Math.hypot(p.x - b.x, p.z - b.z))[0];
    spawnAt(far.x + .5, floorY(far, .5, .5), far.z + .5);
    Object.assign(b, { diveIn: 0, cool: 5 });
    check(until(10, () => b.dive?.step === 'go', tough) < 10, 'he heads for his lagoon');
    check(until(10, () => b.under, () => { tough(); b.cool = 5; }) < 10, 'and slips under its surface');
    check(wetAt(b.profile, b.f) !== null, 'in its water');
    const under = b.hp;
    damageEnemy(b, 100);
    check(b.hp === under, 'nothing hurts him under it');
    let leapt = false;
    const up = until(10, () => !b.under, tough);
    check(up < 10, 'he comes up again');
    out.under = +up.toFixed(1);
    until(3, () => leapt, () => { tough(); if (b.mode === 'attack' && attackOf(b).name === 'dive') leapt = true; });
    check(leapt, 'and leaps out at the hero');
    check(until(3, () => b.mode !== 'attack', tough) < 3 && wetAt(b.profile, b.f) === null, 'onto the land');
    return out;
  });
}

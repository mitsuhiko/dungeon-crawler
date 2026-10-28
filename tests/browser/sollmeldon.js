// In devtools (?dev=1): await (await import('./tests/browser/sollmeldon.js')).runSollmeldonChecks()
// Sollmeldon's whole fight in his mire (docs/bosses.md): phase 1 a head lunges and bites (never the
// same head twice running), every head spits a ball of mud that leaves a puddle, Mud squirtles come
// up out of his mud; at two thirds a head is cut off (it lands as a big puddle); phase 2 he flies,
// rains mud and lands, and the world tips where he lands: his mud runs to the low side, deep there,
// and his puddles run downhill into it, so it grows; at a third the next head comes off, the last
// bites alone; his death levels the world, drains his mud back to what it was and opens the well.
import { paused } from './combat.js';
import { state, player, view } from '../../src/game/state.js';
import { damageEnemy } from '../../src/core/combat.js';
import { allEnemies, updateEnemies } from '../../src/game/enemies.js';
import { updatePlayer } from '../../src/game/update.js';
import { updateTilt } from '../../src/game/tilt.js';
import { projectiles } from '../../src/game/projectiles.js';
import { goBoss } from '../../src/game/dev.js';
import { spawnAt } from '../../src/game/flow.js';
import { loadSpecies } from '../../src/render/enemies.js';
import { mudNow, mudAt } from '../../src/game/mud.js';
import { floorY } from '../../src/core/surfaces.js';
import { gateLocked } from '../../src/core/guardians.js';
import { attackOf } from '../../src/core/enemies.js';
import { SOLLMELDON_FIGHT as G, BITES, headsOf } from '../../src/core/sollmeldon.js';

const check = (value, message) => { if (!value) throw Error(message); };
const step = (dt, also) => { updatePlayer(dt); updateEnemies(dt); updateTilt(dt); also(); };
const run = (seconds, also = () => {}, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) step(dt, also); };
const until = (seconds, done, also = () => {}, dt = 1 / 30) => {
  for (let t = 0; t < seconds; t += dt) { step(dt, also); if (done()) return t; }
  return Infinity;
};
const boss = () => allEnemies().find(e => e.boss === 'sollmeldon');
const living = type => allEnemies().filter(e => e.type === type && e.mode !== 'dead' && e.mode !== 'gone');
const tough = () => { player.hp = player.maxHp = 1e6; player.ragdoll = null; };
// stand on dry ground of the fight about d cells from him
function standNear(b, d) {
  const f = state.map.floors.filter(g => g.encounter && !g.fluid && floorY(g, .5, .5) > mudAt(g.x + .5, g.z + .5) + 0.3)
    .sort((p, q) => Math.abs(Math.hypot(p.x + .5 - b.x, p.z + .5 - b.z) - d) - Math.abs(Math.hypot(q.x + .5 - b.x, q.z + .5 - b.z) - d))[0];
  spawnAt(f.x + .5, floorY(f, .5, .5), f.z + .5);
  return f;
}
const keepNear = (b, most = 7) => () => { tough(); if (Math.hypot(player.x - b.x, player.z - b.z) > most) standNear(b, 3); };

export async function runSollmeldonChecks() {
  return paused(async () => {
    const out = [];
    await goBoss('sollmeldon');
    await loadSpecies(['sollmeldon', 'squirtle']);
    const map = state.map, b = boss();
    check(map.arena.type === 'mire' && map.tide?.mud && b, 'his mire, and him in it');
    run(0.2, tough);
    const first = mudNow();
    check(first && first.slope[0] === 0 && first.slope[1] === 0 && first.volume > 1, 'his mud lies level in the basin');
    tough(); state.enemyGrace = 0;
    standNear(b, 3);
    check(until(4, () => b.mode === 'chase' || b.mode === 'attack', tough) < 4, 'he wakes as the player comes close');
    // phase 1: bites by turns, balls of mud and their puddles, Mud squirtles; no flying
    const bites = [];
    let spat = false, squirtles = 0, flew = false, lastBite = -1;
    run(40, () => {
      keepNear(b, 4.5)();
      const a = b.mode === 'attack' ? attackOf(b) : null;
      if (a && BITES.includes(a.name) && b.attacks !== lastBite) { lastBite = b.attacks; bites.push(a.head); }
      if (projectiles.some(p => p.kind === 'mudball')) spat = true;
      squirtles = Math.max(squirtles, living('mudsquirtle').length);
      if (b.lift > 0.5) flew = true;
    });
    check(bites.length >= 3, 'his heads bite: ' + bites);
    check(bites.every((h, i) => !i || h !== bites[i - 1]), 'never the same head twice running: ' + bites);
    check(new Set(bites).size === 3, 'all three take turns: ' + bites);
    check(spat && b.puddles.length > 0, 'he spits mud, and it lies where it lands: ' + b.puddles.length);
    check(squirtles > 0 && squirtles <= G.minions[0], 'Mud squirtles come up out of his mud: ' + squirtles);
    check(!flew, 'he does not fly yet');
    out.push(`phase 1: bites ${bites.join('')}, ${b.puddles.length} puddles, ${squirtles} squirtles`);
    // two thirds: a head comes off (nothing hurts him meanwhile), and lands as a big puddle
    standNear(b, 2.5);
    damageEnemy(b, b.hp);
    check(b.hp === b.hpFloor && b.hp === Math.ceil(b.profile.hp * 2 / 3), 'no blow takes him below two thirds');
    check(until(3, () => b.mode === 'split', tough) < 3, 'his head is being cut off');
    const cut = b.cutting, hp = b.hp, mudBefore = b.mud + b.puddles.reduce((n, p) => n + p.vol, 0);
    damageEnemy(b, 50);
    check(b.hp === hp, 'nothing hurts him meanwhile');
    until(G.cut + 1, () => b.stage === 2, tough);
    check(b.stage === 2 && headsOf(b.heads).length === 2 && !(b.heads & (1 << cut)), 'two heads left: ' + b.heads);
    check(b.mud + b.puddles.reduce((n, p) => n + p.vol, 0) >= mudBefore + G.mud.head - 0.01, 'the head lands as mud');
    out.push(`cut: head ${cut}`);
    // phase 2: he flies, rains mud, lands, and the world tips where he lands
    let up = false, rained = false, tipped = 0, deep = 0, low = null;
    const flown = until(40, () => up && b.lift < 0.05 && Math.hypot(...b.tilt) > 0.9, () => {
      keepNear(b)();
      if (b.lift > 1) up = true;
      if (up && projectiles.some(p => p.kind === 'mudball')) rained = true;
    });
    check(flown < 40, 'he flies up and lands');
    check(rained, 'up there he rains mud');
    run(3, () => {
      keepNear(b)();
      const m = mudNow(), v = Math.hypot(...b.tilt);
      tipped = Math.max(tipped, Math.hypot(view.tilt[0], view.tilt[1]) * 180 / Math.PI);
      if (v > 0.9) {
        const g = m.slope, k = Math.hypot(...g);
        // the low side of the basin and the high one
        const at = s => [8 + s * 5.5 * g[0] / k, 8 + s * 5.5 * g[1] / k];
        const lo = at(1), hi = at(-1);
        low = { lo: mudAt(...lo), hi: mudAt(...hi) };
        deep = Math.max(deep, low.lo - low.hi);
      }
    });
    check(tipped > 4, 'the world is tipped on the screen: ' + tipped.toFixed(1));
    check(deep > 0.8, `his mud runs to the low side: ${deep.toFixed(2)} higher there`);
    const mud = b.mud;
    run(6, keepNear(b));
    check(b.mud > mud || b.puddles.length === 0, `his puddles run into his mud on the tilt: ${mud.toFixed(1)} -> ${b.mud.toFixed(1)}`);
    out.push(`phase 2: flew, tipped ${tipped.toFixed(1)}°, mud ${deep.toFixed(2)} deeper on the low side, ${b.mud.toFixed(1)} added`);
    // a third: the next head, the last bites alone
    standNear(b, 2.5);
    until(8, () => b.mode !== 'attack' && b.lift < 0.05, tough);
    damageEnemy(b, b.hp);
    until(G.cut + 4, () => b.stage === 3, tough);
    check(b.stage === 3 && headsOf(b.heads).length === 1, 'one head left');
    const one = headsOf(b.heads)[0], last = [];
    lastBite = -1;
    run(20, () => {
      keepNear(b, 4.5)();
      const a = b.mode === 'attack' ? attackOf(b) : null;
      if (a && BITES.includes(a.name) && b.attacks !== lastBite) { lastBite = b.attacks; last.push(a.head); }
    });
    check(last.length > 0 && last.every(h => h === one), 'the last head bites alone: ' + last);
    out.push(`phase 3: head ${one} bites ${last.length}×`);
    // his death: the world levels, his mud drains back to what it was, his squirtles go, the well opens
    until(10, () => b.mode === 'dead', () => { tough(); if (b.mode !== 'split' && b.mode !== 'dead') damageEnemy(b, b.hp); });
    check(b.mode === 'dead', 'he dies');
    run(12, tough);
    const end = mudNow();
    check(Math.abs(end.volume - first.volume) < 0.2, `his mud drains back: ${end.volume.toFixed(2)} (${first.volume.toFixed(2)} at first)`);
    check(Math.hypot(...end.slope) < 0.01 && Math.hypot(...view.tilt) < 0.01, 'the world levels again');
    check(!allEnemies().some(e => e !== b && e.mode !== 'dead' && e.mode !== 'gone'), 'his squirtles go with him');
    check(!gateLocked(map, state.run), 'the well is open');
    out.push('dead: level, mud drained, well open');
    return out;
  });
}

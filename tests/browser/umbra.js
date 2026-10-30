// In devtools (?dev=1): await (await import('./tests/browser/umbra.js')).runUmbraChecks()
// Umbra's whole fight in his reef (docs/bosses.md): the reef dry, the diving suit on its stand; the
// hero takes it, there is no way out, the water rises over everything and he comes; under water the
// hero walks on the bottom, slower, jumps higher and slower, and the air runs out from the fight's
// start; phase 1 he swims over the hills and comes down to bite, makes the earth quake and lies on
// the bottom exposed, sends a shockwave, breaks volcanoes open, calls squirtles of the deep; a blow
// on his body is his; at two thirds he rages and the jets and his shield come (a wall's jet is
// stopped by a hill; under the shield nothing hurts him); at a third his mud rises and slows; his
// death drains the water, takes the suit off and opens the well. Out of air, the hero drowns.
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { damageEnemy } from '../../src/core/combat.js';
import { allEnemies, updateEnemies } from '../../src/game/enemies.js';
import { updatePlayer } from '../../src/game/update.js';
import { goBoss } from '../../src/game/dev.js';
import { spawnAt } from '../../src/game/flow.js';
import { loadSpecies } from '../../src/render/enemies.js';
import { floorY } from '../../src/core/surfaces.js';
import { gateLocked } from '../../src/core/guardians.js';
import { attackOf } from '../../src/core/enemies.js';
import { UMBRA_FIGHT as G, DIVE, airLeft } from '../../src/core/umbra.js';
import { divePhase, waterY, diveThingsHere, diveSealed } from '../../src/game/dive.js';
import { umbraFight } from '../../src/game/umbra.js';

const check = (value, message) => { if (!value) throw Error(message); };
const step = (dt, also) => { updatePlayer(dt); updateEnemies(dt); also(); };
const run = (seconds, also = () => {}, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) step(dt, also); };
const until = (seconds, done, also = () => {}, dt = 1 / 30) => {
  for (let t = 0; t < seconds; t += dt) { step(dt, also); if (done()) return t; }
  return Infinity;
};
const boss = () => allEnemies().find(e => e.boss === 'umbra');
const living = type => allEnemies().filter(e => e.type === type && e.mode !== 'dead' && e.mode !== 'gone');
const tough = () => { player.hp = player.maxHp = 1e6; player.ragdoll = null; };
const zone = () => state.map.floors.filter(g => g.encounter);

export async function runUmbraChecks() {
  return paused(async () => {
    const out = [];
    if (!state.map?.dive || state.map.arena?.type !== 'reef') await goBoss('umbra');   // (with ?at=umbra already there)
    await loadSpecies(['umbra', 'squirtle']);
    const map = state.map, d = map.dive, b = boss();
    check(map.arena.type === 'reef' && d && b, 'his reef, and him in it');
    // dry: the suit on its stand, him not there yet
    run(0.3, tough);
    check(divePhase() === 'dry' && waterY() === null && b.mode === 'gone', 'the reef is dry, he is not there yet');
    check(diveThingsHere().length === 1, 'the suit waits on its stand');
    // the hero takes it: the suit goes on, no way out, the water rises, he comes
    spawnAt(d.stand.x + 0.3, d.stand.y, d.stand.z);
    run(0.5, tough);
    check(player.suit && divePhase() === 'suit' && diveSealed(), 'the suit goes on, no way out');
    check(until(G.suit + 1, () => divePhase() === 'flood', tough) < G.suit + 1, 'then the water rises');
    let rose = -Infinity;
    check(until(G.flood + 1, () => divePhase() === 'wet', () => { tough(); rose = Math.max(rose, waterY() ?? -Infinity); }) < G.flood + 1, 'up over everything');
    check(rose > d.surface - 0.5, `the water stands at its surface: ${rose.toFixed(2)}`);
    check(b.mode !== 'gone', 'he has come');
    // (his intro, or none here: on into the fight)
    state.run.met.add(b.id); b.staged = false; state.intro = null; state.enemyGrace = 0;
    check(until(3, () => b.mode === 'chase' || b.mode === 'attack', tough) < 3, 'he goes for the hero');
    check(player.diving, 'the hero is under water in the suit');
    // the air runs out from the fight's start
    const t0 = b.fightT;
    run(2, tough);
    check(b.fightT > t0 + 1.9 && airLeft(b.fightT) < G.air, 'the air runs out');
    // under water: walking slower, jumping higher and slower
    const f = zone().sort((p, q) => floorY(p, .5, .5) - floorY(q, .5, .5))[0];
    spawnAt(f.x + 0.5, floorY(f, .5, .5), f.z + 0.5);
    run(0.3, tough);
    const y0 = player.y; let top = y0;
    player.jumpBuf = 0.15; player.coyote = 0.12;
    const air = until(3, () => player.grounded && player.y <= y0 + 0.01 && top > y0 + 0.5, () => { tough(); top = Math.max(top, player.y); }, 1 / 60);
    check(top - y0 > 1, `a high jump under water: ${(top - y0).toFixed(2)}`);
    check(air > 0.7, `a slow one: ${air.toFixed(2)} s`);
    // phase 1: what he does over half a minute, the hero kept near him
    const seen = new Set();
    let squirtles = 0, vents = 0, lay = false;
    run(45, () => {
      tough();
      if (b.mode === 'attack') {
        const a = attackOf(b);
        seen.add(a.name);
        if (a.name === 'quake' && b.t > a.exposed.from && b.t < a.exposed.until) lay = true;
      }
      squirtles = Math.max(squirtles, living('deepsquirtle').length);
      vents = Math.max(vents, b.vents.length);
    });
    check(seen.has('bite'), 'he comes down to bite: ' + [...seen]);
    check(seen.has('quake') && lay, 'he makes the earth quake and lies on the bottom: ' + [...seen]);
    check(vents > 0, 'he breaks volcanoes open');
    check(squirtles > 0 && squirtles <= G.squirtles.most[0], 'squirtles of the deep come: ' + squirtles);
    check(!seen.has('jets') && !seen.has('shield'), 'no jets nor shield yet');
    out.push(`phase 1: ${[...seen].join(', ')}; ${vents} volcanoes, ${squirtles} squirtles`);
    // a blow on his body is his
    const seg = allEnemies().find(e => e.host === b), hp = b.hp;
    damageEnemy(seg, 50);
    check(b.hp === hp - 50 && seg.hp === b.hp, 'a blow on his body is his');
    // two thirds: he rages, then the jets and his shield
    damageEnemy(b, b.hp);
    check(b.hp === b.hpFloor, 'no blow takes him past two thirds');
    check(until(G.rage + 2, () => b.stage === 2, tough) < G.rage + 2, 'he rages into phase 2');
    let jets = 0, shielded = false, blocked = false;
    run(40, () => {
      tough();
      if (b.jets) jets = Math.max(jets, b.jets.i + 1);
      if (b.shield > 0 && b.mode !== 'split' && !shielded) { shielded = true; const h = b.hp; damageEnemy(b, 100); blocked = b.hp === h; }
    });
    check(jets >= G.jets.volleys[0], 'the jets come in volleys: ' + jets);
    check(shielded && blocked, 'his shield holds blows off');
    out.push(`phase 2: ${jets} volleys of jets, a shield`);
    // a third: his mud rises from the bottom, and slows the deeper it is
    damageEnemy(b, b.hp);
    check(until(G.rage + 2, () => b.stage === 3, tough) < G.rage + 2, 'he rages into phase 3');
    const low = zone().sort((p, q) => floorY(p, .5, .5) - floorY(q, .5, .5))[0];
    check(until(G.mud.first + G.mud.rise + 1, () => Number.isFinite(b.mudY) && b.mudY > d.low + 0.5, () => { tough(); spawnAt(low.x + 0.5, floorY(low, .5, .5), low.z + 0.5); }) < 12,
      'his mud rises');
    run(0.5, tough);
    check(player.slowed?.source === 'mud' && player.slowed.slow < 0.8, 'it slows the hero standing in it');
    out.push(`phase 3: the mud at ${b.mudY.toFixed(2)}`);
    // beaten: the water drains, the suit comes off, the well opens
    damageEnemy(b, b.hp);
    check(b.mode === 'dead', 'he dies');
    check(until(G.drain + 1, () => divePhase() === 'over', tough) < G.drain + 1, 'the water drains');
    run(0.2, tough);
    check(!player.suit && !player.diving && waterY() === null && !gateLocked(map, state.run), 'the suit comes off, the well opens');
    check(!umbraFight() || umbraFight().e.mode === 'dead', 'his fight is over');
    out.push('beaten: drained, the well open');
    return out;
  });
}

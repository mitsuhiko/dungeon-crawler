// In devtools (?dev=1): await (await import('./tests/browser/foggery.js')).runFoggeryChecks()
// Foggery's whole fight in his caldera (docs/bosses.md): he wakes when the player steps onto the
// bridge, the lava rises and he climbs his tower; at a third he curls up into his ball and his
// Fire-cats guard him (nothing hurts him while one lives); once the lava is at its highest the
// platforms rise out of it; at a sixth the lava floods the top and
// only the platforms are safe; falling into the lava costs a quarter of one's health and the robot
// pulls one out; his death drains the lava for good and opens the well. His Fire-cats leap after a
// player onto the platforms (and back down onto the top); his loot comes to rest on the ground
// that stays, never on a platform or in the air.
import { RESCUE } from '../../src/core/rescue.js';
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { LH } from '../../src/core/constants.js';
import { damageEnemy } from '../../src/core/combat.js';
import { allEnemies, updateEnemies } from '../../src/game/enemies.js';
import { updatePlayer } from '../../src/game/update.js';
import { updateMovers } from '../../src/game/movers.js';
import { goBoss } from '../../src/game/dev.js';
import { spawnAt } from '../../src/game/flow.js';
import { loadSpecies } from '../../src/render/enemies.js';
import { moversNow } from '../../src/physics/collide.js';
import { updateLoot, lootHere } from '../../src/game/loot.js';
import { restGround } from '../../src/physics/rest.js';
import { floorY } from '../../src/core/surfaces.js';
import { findPath } from '../../src/physics/enemynav.js';
import { gateLocked } from '../../src/core/guardians.js';
import { TOWER, PLATFORMS, FOGGERY_FIGHT } from '../../src/core/foggery.js';

const check = (value, message) => { if (!value) throw Error(message); };
const step = (dt, also) => { updateMovers(dt); updatePlayer(dt); updateEnemies(dt); updateLoot(dt, state.time); also(); };
const run = (seconds, also = () => {}, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) step(dt, also); };
const until = (seconds, done, also = () => {}, dt = 1 / 30) => {
  for (let t = 0; t < seconds; t += dt) { step(dt, also); if (done()) return t; }
  return Infinity;
};
const boss = () => allEnemies().find(e => e.boss === 'foggery');
const lava = () => (state.tide ?? -Infinity) * LH;
const tough = () => { player.hp = player.maxHp = 1e6; player.ragdoll = null; };
// stand on the top of the tower, a little away from him
function onTop() {
  const b = boss(), tops = state.map.floors.filter(f => f.tower === 'top')
    .sort((p, q) => Math.abs(Math.hypot(p.x + .5 - b.x, p.z + .5 - b.z) - 2.2) - Math.abs(Math.hypot(q.x + .5 - b.x, q.z + .5 - b.z) - 2.2));
  const f = tops[0];
  spawnAt(f.x + .5, floorY(f, .5, .5), f.z + .5);
}
// the platform under q, if it stands on one
const deckOf = q => moversNow().find(o => q.x >= o.x0 && q.x < o.x1 && q.z >= o.z0 && q.z < o.z1 && Math.abs(q.y - o.y1) < 0.05);
const livingCats = () => allEnemies().filter(e => e.type === 'fogcat' && e.mode !== 'dead' && e.mode !== 'gone');
// a cat on the player's platform (and standing on it)
const catWithPlayer = () => { const d = deckOf(player); return !!d && livingCats().some(c => c.deck === d && deckOf(c) === d); };
function onPlatform() {
  const m = moversNow()[0];
  spawnAt((m.x0 + m.x1) / 2, m.y1, (m.z0 + m.z1) / 2);
}

export async function runFoggeryChecks() {
  return paused(async () => {
    const out = [];
    await goBoss('foggery');
    await loadSpecies(['foggery', 'fireface', 'firecat']);
    const map = state.map, b = boss();
    check(map.tower && map.arena.type === 'tower' && b, 'his caldera, and him on the bridge');
    check(b.f.tower === 'ramp' && b.waiting, 'he waits at the foot of the ramp');
    tough(); state.enemyGrace = 0;
    // the lava at rest while the player is on the bridge; he stands on it
    const bridge = map.portals[0].floor.link.find(f => f?.tower === 'bridge');
    spawnAt(bridge.x + .5, floorY(bridge, .5, .5), bridge.z + .5);
    run(4, tough);
    const rest = lava(), at = { x: b.x, z: b.z };
    check(Math.abs(rest - TOWER.lava.rest * LH) < 0.3, 'the lava at rest: ' + rest);
    check(b.waiting && Math.hypot(b.x - at.x, b.z - at.z) < 1e-6 && b.y >= rest - 0.05, 'he waits, on the lava');
    // the player sets foot on the ramp: the lava rises, Fire-faces wait up the ramp, he comes after them
    const ramp = map.floors.find(f => f.tower === 'ramp' && f.link.some(g => g?.tower === 'bridge'));
    spawnAt(ramp.x + .5, floorY(ramp, .5, .5), ramp.z + .5);
    run(0.5, tough);
    check(!b.waiting && b.mode !== 'idle', 'awake once the player is on the ramp: ' + b.mode);
    const faces = allEnemies().filter(e => e.type === 'fogface');
    check(faces.length === 3 && faces.every(e => e.f.tower === 'ramp' && e.mode === 'idle' && e.f.top > ramp.top), 'three Fire-faces wait up the ramp');
    const way = () => findPath(b.f, ramp, 200, b.profile.height)?.length ?? Infinity, w0 = way();
    run(6, tough);
    check(way() < w0 - 4, `he comes after the player: ${w0} -> ${way()} steps`);
    run(14, tough);
    check(lava() > rest + 1, 'the lava rises: ' + lava());
    out.push(`lava ${rest.toFixed(1)} -> ${lava().toFixed(1)} after 20 s`);
    check(!moversNow().length, 'no platforms before the lava is at its highest');
    // he climbs to the top (the player waits up there)
    onTop();
    const climbed = until(80, () => b.f?.tower === 'top', tough);
    check(climbed < 80, `he climbs to the top: on ${b.f?.tower} at ${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)}`);
    out.push(`on top after ${(20 + climbed).toFixed(0)} s`);
    run(45, tough);
    check(Math.abs(lava() - TOWER.lava.high * LH) < 0.2, 'the lava stops under the top: ' + lava());
    check(moversNow().length === PLATFORMS.count && moversNow().every(m => Math.abs(m.y1 - PLATFORMS.top * LH) < 1e-6), 'the platforms have risen out of it');
    // a third: he curls up into his ball and calls his cats
    damageEnemy(b, b.hp);
    check(b.hp === b.hpFloor, 'no blow takes him below a third');
    until(4, () => b.stage === 2, tough);
    check(b.stage === 2 && b.profile.type === 'foggeryball', 'curled up into his ball');
    until(6, () => b.guard && allEnemies().filter(e => e.summoned && e.type === 'fogcat' && e.mode !== 'dead').length === 2, tough);
    const cats = allEnemies().filter(e => e.type === 'fogcat' && e.mode !== 'dead');
    check(cats.length === 2 && b.guard, 'two Fire-cats guard him: ' + cats.length);
    const hp = b.hp;
    damageEnemy(b, 10); check(b.hp === hp, 'the shield holds while a cat lives');
    for (const c of cats) damageEnemy(c, c.hp);
    run(0.5, tough);
    check(!b.guard, 'both dead: the shield is down');
    run(1, tough);
    damageEnemy(b, 10); check(b.hp < hp, 'and he can be hurt');
    const catsUp = () => allEnemies().filter(e => e.type === 'fogcat' && e.mode !== 'dead').length === 2;
    const again = until(14, () => b.guard, tough);
    check(again > FOGGERY_FIGHT.catsAgain - 2 && again < 12, 'new cats after a while: ' + again);
    until(4, catsUp, tough);
    check(catsUp(), 'two new cats');
    out.push(`cats again after ${(again + 1.5).toFixed(1)} s`);
    // onto a platform: his cats leap after the player, from one to another, and fight them there
    // (it carries them along); back on the top they leap back down
    onPlatform();
    const leapt = until(12, catWithPlayer, tough);
    check(leapt < 12, 'his cats leap after the player onto their platform');
    out.push(`a cat on the player's platform after ${leapt.toFixed(1)} s`);
    let off = null;
    run(3, () => { tough(); for (const c of livingCats()) if (c.deck && (c.x < c.deck.x0 || c.x > c.deck.x1 || c.z < c.deck.z0 || c.z > c.deck.z1 || c.y !== c.deck.y1)) off = `${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(2)}`; });
    check(!off, 'on the platform, never off it: ' + off);
    onTop();
    const down = until(8, () => livingCats().some(c => !c.deck && !c.jump && c.f?.tower === 'top' && Math.abs(c.y - player.y) < 0.1), tough);
    check(down < 8, 'and back down onto the top after the player');
    // a sixth: the lava floods the top; the platforms hold
    for (const c of allEnemies().filter(e => e.type === 'fogcat')) damageEnemy(c, c.hp);
    run(1, tough);
    damageEnemy(b, b.hp);
    check(b.hp === b.hpFloor, 'no blow takes him below a sixth');
    onPlatform();
    until(4, () => b.stage === 3, tough);
    run(8, tough);
    check(b.stage === 3 && b.anchored, 'phase 3: he floats over the drowned tower');
    // he goes over the platforms, from one to another: on them a blade reaches him
    const onPlatforms = new Set();
    run(14, () => { tough(); const m = moversNow().find(o => b.x >= o.x0 && b.x < o.x1 && b.z >= o.z0 && b.z < o.z1 && Math.abs(b.y - o.y1) < 0.2); if (m) onPlatforms.add(m.p); });
    check(onPlatforms.size >= 2, 'he goes over the platforms: ' + onPlatforms.size);
    const m = moversNow().find(o => b.x >= o.x0 && b.x < o.x1 && b.z >= o.z0 && b.z < o.z1);
    if (m) {   // (a sword swung at him from the edge of the platform next to his)
      const near = moversNow().filter(o => o !== m).sort((a, c) => Math.hypot(a.x0 - m.x0, a.z0 - m.z0) - Math.hypot(c.x0 - m.x0, c.z0 - m.z0))[0];
      check(Math.hypot(near.x0 - m.x0, near.z0 - m.z0) <= 2.9, 'a platform next to his');
    }
    // his minions walk on the lava, never under it
    let under = null;
    run(6, () => { tough(); for (const e of allEnemies()) if (e !== b && e.mode !== 'dead' && e.y < lava() - 0.05) under = `${e.type} at ${e.y.toFixed(2)}`; });
    check(!under, 'his minions walk on the lava: ' + under);
    // his cats come after the player on the platforms
    const caught = until(14, catWithPlayer, tough);
    check(caught < 14, "phase 3: his cats leap onto the player's platform");
    // the platforms keep moving
    const was = moversNow().map(m => m.x0 + ',' + m.z0).join(' ');
    run(PLATFORMS.every * 2, tough);
    check(moversNow().map(m => m.x0 + ',' + m.z0).join(' ') !== was, 'the platforms keep moving');
    check(lava() > TOWER.top * LH, 'the lava over the top: ' + lava());
    check(player.y > lava(), 'the player safe on a platform');
    // into the lava: the robot pulls the player out, a quarter of one's health, onto safe ground
    player.hp = player.maxHp = 400; player.god = false;   // (the dev tools start invincible)
    spawnAt(TOWER.mid + 0.5, lava() - 0.5, TOWER.mid + 0.5);
    run(0.2);
    check(player.rescue && player.hp === 300, `burned, and the robot comes: ${player.hp}`);
    run(RESCUE.reach + RESCUE.lift + RESCUE.carry[1] + 0.2);
    check(!player.rescue && player.hp === 300 && player.y > lava() && player.grounded, `pulled out: ${player.hp} at ${player.y.toFixed(2)} (lava ${lava().toFixed(2)})`);
    out.push('lava rescue: 400 -> 300, onto a platform');
    tough();
    // his death drains the lava and opens the well
    until(10, () => b.mode === 'dead', () => {
      tough();
      for (const c of allEnemies().filter(e => e.type === 'fogcat' && e.mode !== 'dead')) damageEnemy(c, c.hp);
      if (!b.guard && b.mode !== 'attack') damageEnemy(b, b.hp);
    });
    check(b.mode === 'dead', 'he dies (once his cats are dead)');
    // the platforms float down with the lava, sink under the floor and are gone
    const high = Math.max(...moversNow().map(m => m.y1));
    run(3, tough);
    check(moversNow().length && Math.max(...moversNow().map(m => m.y1)) < high - 2, 'the platforms float down');
    run(9, tough);
    check(state.tide === null, 'the lava is gone: ' + state.tide);
    check(!moversNow().length, 'the platforms are gone, under the floor');
    check(!gateLocked(map, state.run), 'the well is open');
    out.push('dead: lava drained, well open');
    // his loot rests on the ground that stays (none on a platform, none in the air), out of the lava
    const loot = lootHere().filter(p => p.toss >= 1 && !p.fly && !p.claim);
    const floating = loot.filter(p => Math.abs(restGround(p.x, p.z, p.y).h - p.y) > 0.02);
    check(!floating.length, 'his loot on the ground: ' + floating.map(p => `${p.itemId} at ${p.y.toFixed(2)} over ${restGround(p.x, p.z, p.y).h.toFixed(2)}`).join(', '));
    out.push(`loot: ${loot.length} pickups on the ground`);
    return out;
  });
}

// In devtools (?dev=1): await (await import('./tests/browser/rollie.js')).runRollieChecks()
// Rollie and Megalimmer in their colosseum (docs/bosses.md): both there, Megalimmer beside Rollie,
// two bars stacked; woken, one of them is the main one and they swap; Megalimmer at the side runs
// round the hero, closer, sending twisters; Rollie's blades fly out and back, his sweep follows and
// burns, his grid blinks and strikes the hero's own cell; Megalimmer turns invisible and back, his
// Stun flimmer stuns; the gate opens with the second of them, not the first.
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { allEnemies, updateEnemies, drawEnemies } from '../../src/game/enemies.js';
import { updatePlayer } from '../../src/game/update.js';
import { updateBossBar } from '../../src/game/bossbar.js';
import { goBoss } from '../../src/game/dev.js';
import { spawnAt } from '../../src/game/flow.js';
import { loadSpecies } from '../../src/render/enemies.js';
import { damageEnemy } from '../../src/core/combat.js';
import { ROLLIE_FIGHT } from '../../src/core/rollie.js';
import { rollieFights } from '../../src/game/rollie.js';
import { twisters, clearTwisters } from '../../src/game/twisters.js';
import { floorY } from '../../src/core/surfaces.js';

const check = (value, message) => { if (!value) throw Error(message); };
const $ = id => document.getElementById(id);
const step = (dt, also) => { updatePlayer(dt); updateEnemies(dt); drawEnemies(dt); updateBossBar(dt); also(); };
const until = (seconds, done, also = () => {}, dt = 1 / 30) => {
  for (let t = 0; t < seconds; t += dt) { step(dt, also); if (done()) return t; }
  return Infinity;
};
const body = type => allEnemies().find(e => e.type === type);
const tough = () => { player.maxHp = 1e6; if (player.hp < 1e5) player.hp = 1e6; };   // (not made whole meanwhile: what hurts shows)
// stand on the fight's ground about d cells from (x, z)
function standNear(x, z, d) {
  const f = state.map.floors.filter(f => f.encounter)
    .sort((p, q) => Math.abs(Math.hypot(p.x + .5 - x, p.z + .5 - z) - d) - Math.abs(Math.hypot(q.x + .5 - x, q.z + .5 - z) - d))[0];
  spawnAt(f.x + .5, floorY(f, .5, .5), f.z + .5);
  Object.assign(player, { held: null, ragdoll: null, stun: 0, vx: 0, vz: 0 });
  return f;
}
// start e's attack `name` at the player
function strike(e, name) {
  Object.assign(e, { mode: 'attack', attack: e.profile.attacks.findIndex(a => a.name === name), t: 0, bit: false, leap: 0, speed: 0,
    path: null, target: player, yaw: Math.atan2(player.x - e.x, player.z - e.z) });
  e.attacks++;
}
// the fight's turns set: `who` the main one
function mainNow(f, who) { Object.assign(f.turns, { main: who, turn: 30, t: 10, log: [] }); }

export async function runRollieChecks() {
  const god = player.god;
  player.god = false;   // (the dev tools' god mode takes no damage: their lasers must hurt)
  return paused(async () => {
    const out = {};
    await goBoss('rollie');
    await loadSpecies(['rollie', 'spicy', 'tornado']);
    const r = body('rollie'), m = body('megalimmer'), f = rollieFights()[0];
    check(r && m && f && f.r === r && f.m === m, 'both of them in their arena, one fight');
    check(state.map.arena?.type === 'colosseum', 'their colosseum');
    check(r.pair === m.pair && !r.guardianGate && !m.guardianGate && r.pairGate === state.map.key, 'their pair; the gate nobody\'s yet');
    out.apart = +Math.hypot(r.x - m.x, r.z - m.z).toFixed(2);
    check(out.apart > 2 && out.apart < 6, 'Megalimmer beside Rollie');
    tough(); state.enemyGrace = 0;

    // woken: two bars stacked, the main one's lit
    standNear(r.x, r.z, 4);
    until(1, () => f.on, tough);
    check(f.on && r.main !== m.main, 'woken, one of them the main one');
    until(0.3, () => false, tough);
    check($('boss-bar').classList.contains('duo') && $('boss-name').textContent.includes('Rollie') && $('boss-name2').textContent.includes('Megalimmer'), 'two bars, Rollie\'s on top');
    check($(r.main ? 'boss-row' : 'boss-row2').classList.contains('lead'), 'the main one\'s bar lit up');

    // a turn over: they swap
    mainNow(f, 'rollie'); f.turns.turn = 0.05;
    until(0.5, () => f.turns.main === 'megalimmer', tough);
    check(f.turns.main === 'megalimmer' && m.main && !r.main, 'they swap');

    // Rollie the main one: Megalimmer runs round, closer and closer, and sends twisters
    mainNow(f, 'rollie');
    Object.assign(f, { twisterIn: 0.5, calm: 5 });
    until(1, () => m.circling, tough);
    check(m.circling, 'Megalimmer runs round the hero');
    const d0 = Math.hypot(m.x - player.x, m.z - player.z);
    let thrown = false;
    until(4, () => thrown, () => { tough(); if (twisters.some(w => w.e === m)) thrown = true; if (r.mode === 'attack') r.t = 99; });
    check(thrown, 'a twister at the hero');
    out.circle = [+d0.toFixed(2), +Math.hypot(m.x - player.x, m.z - player.z).toFixed(2)];

    // Rollie's blades: out after the hero, cutting, back into his hands (Megalimmer held still meanwhile)
    Object.assign(m, { staged: true, circling: false, mode: 'chase' }); f.circle = null; clearTwisters();
    standNear(r.x, r.z, 6);
    mainNow(f, 'rollie');
    strike(r, 'sabers');
    let hp = player.hp, flew = false;
    until(4, () => flew && !f.sabers.length, () => { tough(); if (f.sabers.length) flew = true; });
    check(flew && !f.sabers.length, 'two blades out, and back');
    check(player.hp < hp, 'they cut the hero');
    out.sabers = hp - player.hp;

    // his sweep: it follows and burns while it touches
    standNear(r.x, r.z, 5);
    strike(r, 'sweep');
    hp = player.hp;
    until(4.2, () => false, tough);
    check(player.hp < hp, 'the sweep burns a hero who stands in it');
    out.sweep = hp - player.hp;

    // his grid: the hero's own cell blinks, then is struck
    standNear(r.x, r.z, 5);
    strike(r, 'grid');
    hp = player.hp;
    let own = false;
    until(1.6, () => own, () => { tough(); own = f.grids.some(g => g.cells?.some(c => c.x === Math.floor(player.x) && c.z === Math.floor(player.z))); });
    check(own, 'the hero\'s own cell blinks');
    until(ROLLIE_FIGHT.grid.warn + 0.4, () => player.hp < hp, tough);
    check(player.hp < hp, 'and is struck');
    until(4, () => !f.grids.length, tough);

    // Megalimmer the main one: invisible and back; his Stun flimmer stuns (Rollie held still meanwhile)
    Object.assign(m, { staged: false }); Object.assign(r, { staged: true, mode: 'chase' }); f.sweep = null;
    mainNow(f, 'megalimmer');
    standNear(m.x, m.z, 3);
    strike(m, 'vanish');
    check(until(2, () => m.hidden >= 1, tough) < 2, 'Megalimmer turns invisible');
    check(until(ROLLIE_FIGHT.vanish.time + 1.5, () => m.hidden === 0, tough) < Infinity, 'and comes back');
    f.minions.stunner = [];
    strike(m, 'stunner');
    let stunned = 0;
    until(8, () => stunned > 1, () => { tough(); stunned = Math.max(stunned, player.stun ?? 0); });
    check(stunned > 1, 'his Stun flimmer stunned the hero');
    out.stunned = +stunned.toFixed(2);

    // the gate: not with the first of them, with the second
    r.staged = false;
    const gate = state.map.key;
    damageEnemy(r, r.hp);
    until(0.5, () => false, tough);
    check(!state.run.unlockedGates.has(gate), 'the first beaten: the gate stays shut');
    check(m.guardianGate === gate, 'the gate Megalimmer\'s now');
    damageEnemy(m, m.hp);
    until(0.5, () => state.run.unlockedGates.has(gate), tough);
    check(state.run.unlockedGates.has(gate), 'the second beaten: the gate opens');
    player.god = god;
    return out;
  });
}

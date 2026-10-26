// In devtools (?dev=1): await (await import('./tests/browser/mansk.js')).runManskChecks()
// Mansk's whole fight on his museum's stage (docs/bosses.md): phase 1 he breathes in (what gets to
// his mouth is chewed and spat out), throws balls of light that hang at his horns and burst where
// they land, and calls Tornados; at two thirds he rises into the air and flies, landing now and
// then, and slows time (the player and his Tornados, not him); at a third his horns break, his
// ribbons come out (ropes: they hang, swirl and catch), squeeze the player and let them go; his
// death takes his Tornados along and opens the well.
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { damageEnemy } from '../../src/core/combat.js';
import { attackOf, baseY } from '../../src/core/enemies.js';
import { allEnemies, updateEnemies } from '../../src/game/enemies.js';
import { updatePlayer } from '../../src/game/update.js';
import { projectiles } from '../../src/game/projectiles.js';
import { goBoss } from '../../src/game/dev.js';
import { spawnAt } from '../../src/game/flow.js';
import { loadSpecies, animateEnemies } from '../../src/render/enemies.js';
import { ribbonPoints } from '../../src/render/manskview.js';
import { chainLength, pointOf } from '../../src/core/ribbon.js';
import { floorY } from '../../src/core/surfaces.js';
import { gateLocked } from '../../src/core/guardians.js';
import { MANSK_FIGHT } from '../../src/core/mansk.js';

const check = (value, message) => { if (!value) throw Error(message); };
// (the views too: his ribbons are simulated where he is drawn, render/manskview.js)
const step = (dt, also) => { updatePlayer(dt); updateEnemies(dt); animateEnemies(allEnemies(), dt); also(); };
const run = (seconds, also = () => {}, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) step(dt, also); };
const until = (seconds, done, also = () => {}, dt = 1 / 30) => {
  for (let t = 0; t < seconds; t += dt) { step(dt, also); if (done()) return t; }
  return Infinity;
};
const boss = () => allEnemies().find(e => e.profile.boss === 'mansk');
const living = type => allEnemies().filter(e => e.type === type && e.mode !== 'dead' && e.mode !== 'gone');
// (knocked down: up again at once, still; a ragdoll cleared mid-flight would land hard again and again)
const tough = () => { player.hp = player.maxHp = 1e6; if (player.ragdoll) Object.assign(player, { ragdoll: null, getUp: null, vx: 0, vy: 0, vz: 0 }); };
// stand on the fight's floor about d cells from him
function standNear(b, d) {
  const far = g => state.map.portals.every(p => Math.hypot(p.x - g.x, p.z - g.z) > 3.5);   // (away from the doorways)
  const f = state.map.floors.filter(g => g.encounter && g.top === b.f.top && far(g))
    .sort((p, q) => Math.abs(Math.hypot(p.x + .5 - b.x, p.z + .5 - b.z) - d) - Math.abs(Math.hypot(q.x + .5 - b.x, q.z + .5 - b.z) - d))[0];
  spawnAt(f.x + .5, floorY(f, .5, .5), f.z + .5);
}

export async function runManskChecks() {
  return paused(async () => {
    const out = [];
    await goBoss('mansk');
    await loadSpecies(['mansk', 'tornado']);
    const map = state.map, b = boss();
    check(map.arena.type === 'stage' && b, 'his museum, and him on its stage');
    check(b.f.surface === 'masonry', 'on the stage');
    tough(); state.enemyGrace = 0;
    standNear(b, 3.5);
    check(until(4, () => b.mode === 'chase' || b.mode === 'attack', tough) < 4, 'he wakes as the player comes close');
    // phase 1: breathing in, the gulp, the balls, the Tornados
    let pulled = false, gulped = false, hidden = false, spat = false, hung = false, flew = false, burst = false, tornados = 0, landed = false;
    run(45, () => {
      tough();
      if (player.pull) pulled = true;
      if (player.held?.e === b && attackOf(b).grab?.gulp) gulped = true;
      if (player.gulped) hidden = true;
      if (/spat out by Mansk/.test(player.lastHurt?.reason ?? '')) spat = true;
      if (/ball of light/.test(player.lastHurt?.reason ?? '')) burst = true;
      for (const p of projectiles) if (p.kind === 'hornorb') { if (p.hold > 0) hung = true; else flew = true; }
      tornados = Math.max(tornados, living('stagetornado').length);
      if (b.lift < 0.05) landed = true;
      if (Math.hypot(player.x - b.x, player.z - b.z) > 7 || player.held) { if (!player.held) standNear(b, 3); }
    });
    check(pulled, 'he breathes in: the player is pulled');
    check(gulped && hidden && spat, 'what gets to his mouth is gulped (not seen), chewed and spat out');
    check(hung && flew, 'his balls hang at his horns, then fly');
    check(burst, 'and burst on the player');
    check(tornados > 0 && tornados <= MANSK_FIGHT.minions[0], 'he calls Tornados: ' + tornados);
    check(landed, 'he lands to breathe in');
    // his breath on its own (no Tornados), him on his spot facing down the stage into the hall:
    // standing still in front of him you go in; running away you get out
    const breathe = (run) => {
      for (const m of living('stagetornado')) damageEnemy(m, m.hp);
      const post = map.guardian.floor, [ax, az] = map.guardian.approach;
      Object.assign(b, { x: post.x + .5, z: post.z + .5, y: floorY(post, .5, .5), f: post, yaw: Math.atan2(ax, az), mode: 'attack',
        attack: b.profile.attacks.findIndex(x => x.name === 'inhale'), t: 0, bit: false, speed: 0, path: null, lift: 0 });
      b.attacks++;
      const start = b.attacks, at = [b.x + ax * 2.6, b.z + az * 2.6], g = state.map.floors.find(q => q.encounter && q.x === Math.floor(at[0]) && q.z === Math.floor(at[1]));
      Object.assign(player, { held: null, getUp: null, stun: 0, slowed: null });
      spawnAt(at[0], floorY(g, at[0] - g.x, at[1] - g.z), at[1]);
      let gulpedNow = false, pulledNow = false;
      until(4, () => b.attacks !== start + 1 && (b.attacks !== start || b.mode !== 'attack'), () => {
        tough(); Object.assign(player, { getUp: null, stun: 0 });
        if (run && pulledNow) player.autoDir = [ax, az];   // (off as it starts to pull)
        if (player.pull) pulledNow = true;
        if (player.held?.e === b) gulpedNow = true;
      });
      player.autoDir = null;
      check(!state.fallFrom && state.map === map, 'still in his museum');
      return { gulpedNow, pulledNow, d: Math.hypot(player.x - b.x, player.z - b.z) };
    };
    const still = breathe(false), ran = breathe(true);
    check(still.pulledNow && still.gulpedNow, 'standing still in front of him you go in');
    check(ran.pulledNow && !ran.gulpedNow && ran.d > 2.6, `running away you get out: ${JSON.stringify(ran)}`);
    out.push(`phase 1: pulled, gulped, spat; balls hung and burst; ${tornados} Tornados; ran out of his breath`);
    // two thirds: he rises, then flies (out of a blade's reach) and comes down again
    damageEnemy(b, b.hp);
    check(b.hp === Math.ceil(b.profile.hp * 2 / 3), 'no blow takes him below two thirds');
    until(MANSK_FIGHT.change[0] + 1, () => b.stage === 2, tough);
    check(b.stage === 2 && b.profile.type === 'manskflying', 'phase 2');
    let top = 0, down = false, slowed = false, warped = false, unwarped = true;
    const seen = {}, modes = {};
    until(90, () => top >= MANSK_FIGHT.lift.up - 0.05 && down && slowed && warped, () => {
      tough();
      top = Math.max(top, b.lift); if (top > 1.5 && b.lift < 0.1) down = true;
      if (b.mode === 'attack') seen[attackOf(b).name] = (seen[attackOf(b).name] ?? 0) + 1;
      modes[b.mode] = (modes[b.mode] ?? 0) + 1;
      if (player.slowed?.source === 'time') slowed = true;
      if (living('stagetornado').some(t => t.warp < 1)) warped = true;
      if (b.warp !== undefined && b.warp < 1) unwarped = false;
      if (Math.hypot(player.x - b.x, player.z - b.z) > 7 && !player.held) standNear(b, 3.5);
    });
    check(top >= MANSK_FIGHT.lift.up - 0.05 && down, `he flies up (${top.toFixed(2)}) and comes down again`);
    check(slowed && warped && unwarped, `he slows time: the player and his Tornados, not him (${slowed} ${warped} ${unwarped}; his attacks ${JSON.stringify(seen)}, ${JSON.stringify(modes)})`);
    out.push(`phase 2: flew ${top.toFixed(1)} cells up, landed, slowed time`);
    // a third: the horns break and the ribbons come out
    damageEnemy(b, b.hp);
    until(MANSK_FIGHT.change[1] + 1, () => b.stage === 3, tough);
    check(b.stage === 3 && b.horns === 0 && b.profile.ribbons, 'his horns broke');
    run(MANSK_FIGHT.grow + 0.5, tough);
    const rs = ribbonPoints(b);
    check(rs.length === 4 && b.grow === 1, 'four ribbons all the way out');
    for (const r of rs) check(Math.abs(chainLength(r) - r.spec.length) < r.spec.length * 0.1, `a ribbon keeps its length: ${chainLength(r).toFixed(2)}`);
    let caught = false, squeezed = 0, let_go = false, wound = false, spread = 0;
    until(90, () => caught && wound && let_go && squeezed && spread > 2.5, () => {
      tough();
      if (player.held?.e === b && attackOf(b).grab?.ribbons) {
        caught = true;
        // its end wound round the player
        const r = rs[0], tip = pointOf(r, r.n - 3);
        if (Math.hypot(tip.x - player.x, tip.z - player.z) < 0.8) wound = true;
      } else if (caught) let_go = true;
      if (/Squeezed/.test(player.lastHurt?.reason ?? '')) squeezed++;
      for (const r of rs) { const tip = pointOf(r, r.n - 1); spread = Math.max(spread, Math.hypot(tip.x - b.x, tip.z - b.z)); }
      if (Math.hypot(player.x - b.x, player.z - b.z) > 5 && !player.held) standNear(b, 2.5);
    });
    check(caught && wound && let_go, 'his ribbons catch the player, wind round them and let go');
    check(squeezed > 0, 'they squeeze');
    check(spread > 2.5, `they swing out round him: ${spread.toFixed(2)}`);
    out.push(`phase 3: horns broken, 4 ribbons; caught, squeezed, let go; ribbons out to ${spread.toFixed(1)} cells`);
    // his death takes his Tornados along and opens the well
    until(10, () => b.mode === 'dead', () => { tough(); if (b.mode !== 'split' && b.mode !== 'dead') damageEnemy(b, b.hp); });
    run(4, tough);
    check(!allEnemies().some(e => e !== b && e.mode !== 'dead' && e.mode !== 'gone'), 'his Tornados go with him');
    check(baseY(b) - b.y < 0.05, 'down on the floor');
    check(!gateLocked(map, state.run), 'the well is open');
    out.push('dead: Tornados gone, well open');
    return out;
  });
}

// In devtools (?dev=1): await (await import('./tests/browser/bossbar.js')).runBossBarChecks()
// The boss bar (game/bossbar.js, docs/ui.md "The boss bar"): up along the top from the moment the
// hero comes into a boss's arena, his name and level over it, nothing over his head (nor over his
// proxies'); a hit drops the fill at once and the damage strip after a moment; beaten, it empties and
// fades. Renew's runs back with his rewind and is full again at his next phase. A Temp Boss has it
// too; its defenders keep their small bars.
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { damageEnemy } from '../../src/core/combat.js';
import { bossTitle, TRAIL } from '../../src/core/bossbar.js';
import { BOSSES } from '../../src/core/bosses.js';
import { RENEW_FIGHT } from '../../src/core/renew.js';
import { guardianId } from '../../src/core/guardians.js';
import { allEnemies, updateEnemies, drawEnemies } from '../../src/game/enemies.js';
import { updatePlayer } from '../../src/game/update.js';
import { updateBossBar } from '../../src/game/bossbar.js';
import { goBoss } from '../../src/game/dev.js';
import { enterCube, spawnAt } from '../../src/game/flow.js';
import { loadSpecies } from '../../src/render/enemies.js';
import { characterReady } from '../../src/render/character.js';
import { floorY } from '../../src/core/surfaces.js';

const check = (value, message) => { if (!value) throw Error(message); };
const $ = id => document.getElementById(id);
const scale = id => Number(/scaleX\(([\d.]+)\)/.exec($(id).style.transform)?.[1] ?? NaN);
const bar = () => ({ on: $('boss-bar').classList.contains('on'), name: $('boss-name').textContent, fill: scale('boss-fill'), trail: scale('boss-trail') });
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;
const DT = 1 / 30;
// the bar alone for s seconds (the world stands still)
const bars = s => { for (let t = 0; t < s; t += DT) updateBossBar(DT); return bar(); };
const step = also => { updatePlayer(DT); updateEnemies(DT); updateBossBar(DT); also(); };
const until = (seconds, done, also = () => {}) => {
  for (let t = 0; t < seconds; t += DT) { step(also); if (done()) return t; }
  return Infinity;
};
const tough = () => { player.maxHp = Math.max(player.maxHp, 1e6); if (player.hp < 1e5) player.hp = 1e6; };
// (the checks hold the frames back, so the curtain would not lift by itself: lifted here)
const lift = () => { $('fade').style.opacity = '0'; };

// into the descent arena of a depth without a boss of its own: a Temp Boss's
async function goTempBoss() {
  const cubes = state.cubes;
  for (let depth = 1; depth < 20; depth++) {
    if (BOSSES[depth]) continue;
    const found = [...cubes.layout(depth).guardians].find(([, g]) => g.role === 'descent' && g.bossPlaceholder);
    if (!found) continue;
    state.run.defeated.delete(guardianId(found[0]));
    const c = await cubes.get(found[0]);
    enterCube(c, c.map.portals[0].dir);
    return depth;
  }
  return null;
}

export async function runBossBarChecks() {
  return paused(async () => {
    const out = [];

    // Gusto: the bar from the moment the hero comes in, nothing over him or his proxies
    await goBoss('gusto');
    await loadSpecies(['gusto', 'triangle']);
    lift();
    const g = allEnemies().find(e => e.boss === 'gusto');
    check(g, 'Gusto in his arena');
    let b = bars(DT);
    check(b.on && b.name === bossTitle(g) && b.name.startsWith('♛ Gusto · '), `the bar is up as the hero comes in: "${b.name}"`);
    check(near(b.fill, 1) && near(b.trail, 1), 'full');
    drawEnemies(0);
    check(g.view && !g.view.bar.visible && !g.view.label.visible, 'nothing over his head');
    // a hit: the fill drops at once, the strip stands a moment, then follows
    g.shield = 0;
    check(damageEnemy(g, g.profile.hp * 0.2, false), 'he can be hit');
    b = bars(DT);
    check(near(b.fill, 0.8) && near(b.trail, 1), `the fill drops, the strip stands: ${b.fill} ${b.trail}`);
    b = bars(TRAIL.hold - 0.1);
    check(near(b.trail, 1), 'still standing');
    b = bars(1.5);
    check(near(b.trail, b.fill), `then down to the fill: ${b.trail}`);
    out.push('Gusto: up on coming in, a hit leaves a chunk that drains');
    // his proxies: nothing over their heads, and the bar stays his
    state.devPassive = false; state.enemyGrace = 0; tough();
    damageEnemy(g, g.hp);   // (to half: he splits)
    check(until(6, () => allEnemies().some(e => e.proxy && e.mode !== 'gone'), tough) < Infinity, 'he splits into three');
    drawEnemies(0);
    const proxies = allEnemies().filter(e => e.proxy);
    check(proxies.every(p => p.view && !p.view.bar.visible && !p.view.label.visible), 'nothing over his proxies either');
    const minion = allEnemies().find(e => e.summoned && e.view);
    if (minion) { minion.hovered = true; drawEnemies(0); check(minion.view.bar.visible, 'a minion keeps its small bar'); minion.hovered = false; }
    b = bars(DT);
    check(b.on && near(b.fill, g.hp / g.profile.hp), 'the bar is still his');
    // beaten: empty, then gone (put back as he was)
    const was = { mode: g.mode, hp: g.hp };
    Object.assign(g, { mode: 'dead', hp: 0 });
    b = bars(DT);
    check(b.on && b.fill === 0, 'beaten: the bar empties');
    b = bars(1.5);
    check(!b.on, 'and fades away');
    Object.assign(g, was);
    out.push(`Gusto: his proxies show nothing${minion ? ', a minion its own bar' : ''}; the bar empties and goes when he is beaten`);

    // Renew: the bar runs back with time
    await goBoss('renew');
    await Promise.all([loadSpecies(['spider', 'fireface']), characterReady]);
    lift();
    const r = allEnemies().find(e => e.boss === 'renew');
    const f = state.map.floors.filter(q => q.encounter && Math.hypot(q.x + 0.5 - r.x, q.z + 0.5 - r.z) > 2.5 && Math.hypot(q.x + 0.5 - r.x, q.z + 0.5 - r.z) < 3.5)[0];
    tough(); state.devPassive = false; state.enemyGrace = 0;
    spawnAt(f.x + 0.5, floorY(f, 0.5, 0.5), f.z + 0.5);
    check(until(8, () => r.on, tough) < Infinity, 'his fight starts');
    drawEnemies(0);
    check(r.view && !r.view.bar.visible && !r.view.label.visible, 'nothing over his head');
    // hurt him bit by bit, so there is something to run back
    for (let i = 0; i < 6; i++) { r.shield = 0; damageEnemy(r, r.profile.hp * 0.12, false); until(0.6, () => false, tough); }
    const low = bar().fill;
    check(low < 0.5, `his bar goes down: ${low}`);
    r.shield = 0; damageEnemy(r, r.hp);
    check(until(RENEW_FIGHT.windup + 0.5, () => r.rewinding, tough) < Infinity, 'time runs back');
    const fills = [];
    check(until(12, () => r.stage === 2, () => { tough(); fills.push(bar().fill); }) < Infinity, 'his next phase');
    const rising = fills.filter((v, i) => i && v > fills[i - 1] + 1e-4).length;
    check(rising >= 3, `the bar ran back up with time (${rising} steps)`);
    b = bars(DT);
    check(near(b.fill, 1) && near(b.trail, 1), 'full again for his next phase');
    out.push(`Renew: the bar ran back in ${rising} steps, full for phase 2`);

    // a Temp Boss: the bar; its defenders their own
    const depth = await goTempBoss();
    if (depth !== null) {
      lift();
      const list = allEnemies(), temp = list.find(e => e.guardian && e.bossPlaceholder);
      await loadSpecies([...new Set(list.map(e => e.profile.species))]);
      b = bars(DT);
      check(temp && b.on && b.name === bossTitle(temp) && b.name.includes('Temp Boss'), `a Temp Boss has the bar: "${b.name}"`);
      drawEnemies(0);
      check(!temp.view.bar.visible && !temp.view.label.visible, 'nothing over its head');
      const defender = list.find(e => !e.guardian);
      if (defender) { defender.hovered = true; drawEnemies(0); check(defender.view.bar.visible, 'its defenders keep their bars'); defender.hovered = false; }
      out.push(`a Temp Boss at depth ${depth}: the bar`);
    }
    return out;
  });
}

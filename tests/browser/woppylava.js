// In devtools (?dev=1): await (await import('./tests/browser/woppylava.js')).runWoppylavaChecks()
// Woppylava's whole fight in his cinder pit (docs/bosses.md): phase 1 his casts hurt as their rules
// say (a wall a hero standing off its gap, not one in it; a hand one in its locked ring, not one who
// ran; a bomb one at its mark); no blow takes him below two thirds in phase 1; there he rises and
// the volcano comes up out of the middle of the arena, the hero on its road riding up; the lava
// rises over the basin, the road stays dry; phase 2 his fire creatures come and the fuse burns; it
// runs out and the volcano erupts: the lava pours down it, a few isles on its road stay dry; the
// robot pulls a hero out of the lava onto dry ground; his death drains the lava and brings the
// volcano down. (His effects drawn: tests/browser/woppylavafx.js; /woppyfx shows them running.)
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { N, LH, LAVA } from '../../src/core/constants.js';
import { floorY } from '../../src/core/surfaces.js';
import { damageEnemy } from '../../src/core/combat.js';
import { allEnemies, updateEnemies } from '../../src/game/enemies.js';
import { updatePlayer } from '../../src/game/update.js';
import { goBoss } from '../../src/game/dev.js';
import { spawnAt } from '../../src/game/flow.js';
import { loadSpecies } from '../../src/render/enemies.js';
import { groundAt } from '../../src/physics/collide.js';
import { standingAt } from '../../src/physics/fluid.js';
import { knockDown } from '../../src/game/ragdoll.js';
import { mountainPlan, mountainNow } from '../../src/game/mountains.js';
import { VOLCANO_TIMES } from '../../src/core/mountains.js';
import { WOPPYLAVA_FIGHT as G, wallSpan, handLands, handSpan, islesLeft } from '../../src/core/woppylava.js';

const check = (value, message) => { if (!value) throw Error(message); };
const step = (dt, also) => { updatePlayer(dt); updateEnemies(dt); also(); };
const run = (seconds, also = () => {}, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) step(dt, also); };
const until = (seconds, done, also = () => {}, dt = 1 / 30) => {
  for (let t = 0; t < seconds; t += dt) { step(dt, also); if (done()) return t; }
  return Infinity;
};
const boss = () => allEnemies().find(e => e.boss === 'woppylava');
const living = kind => allEnemies().filter(e => e.type === kind && e.mode !== 'dead' && e.mode !== 'gone');
// (not made whole meanwhile: what hurts shows; up again at once when knocked down)
const tough = () => { player.maxHp = 1e6; if (player.hp < 1e5) player.hp = 1e6; };
const still = () => { tough(); Object.assign(player, { ragdoll: null, getUp: null, stun: 0, vx: 0, vz: 0, burning: null }); };
// stand at (x, z), on the ground there
function standAt(x, z) {
  const g = groundAt(x, z, 99, 0).h;
  spawnAt(x, g, z);
  Object.assign(player, { held: null, ragdoll: null, getUp: null, stun: 0, vx: 0, vy: 0, vz: 0, burning: null, rescue: null });
  return g;
}
const attack = (e, name) => e.profile.attacks.find(a => a.name === name);
// a floor of the fight off the volcano, about d cells from (x, z)
const fightFloor = (map, x, z, d, ok = () => true) => map.floors.filter(f => f.encounter && !f.kind && ok(f))
  .sort((p, q) => Math.abs(Math.hypot(p.x + 0.5 - x, p.z + 0.5 - z) - d) - Math.abs(Math.hypot(q.x + 0.5 - x, q.z + 0.5 - z) - d))[0];
// the lava over the floor at the middle of cell c: how deep (≤ 0: dry)
const lavaOver = (map, c) => {
  const x = c % N + 0.5, z = Math.floor(c / N) + 0.5, s = standingAt(x, z), g = groundAt(x, z, 99, 0).h;
  return s?.fluid === LAVA ? s.y - g : -1;
};

export async function runWoppylavaChecks() {
  const god = player.god;
  player.god = false;   // (the dev tools' god mode takes no damage: his casts must hurt)
  return paused(async () => {
    const out = {};
    try {
      await goBoss('woppylava');
      await loadSpecies(['woppylava', 'fireface', 'firecat']);
      const base = state.map, b = boss(), vo = base.volcano, box = base.tide?.box;
      check(base.arena?.type === 'cinder' && b && vo && box, 'his cinder pit, its mound and its lava\'s box, him in it');
      // (his intro, or none here: on into the fight)
      state.run.met.add(b.id); b.staged = false; state.intro = null; state.enemyGrace = 0;
      state.devPassive = true;   // (he stands still and starts nothing: his casts one at a time)
      run(0.2, still);

      // --- a wall: it passes a hero in its gap by, it hurts one off it ---------------------------------
      const wallTest = inGap => {
        b.cast(attack(b, 'walls'));
        run(0.05, still);
        const w = b.walls[0];
        check(w, 'a wall of lava comes');
        // (a quarter of the way along it, off the mound in the middle)
        const xs = w.side < 2, along = (xs ? box[0] + box[2] : box[1] + box[3]) / 2 + (w.side % 2 ? 1 : -1) * 5;
        const [lo, hi] = xs ? [box[1], box[3]] : [box[0], box[2]], off = G.walls.gap / 2 + 1.2;
        const across = inGap ? w.gap : w.gap + off < hi - 0.6 ? w.gap + off : w.gap - off;
        check(across > lo && across < hi, 'a spot by the wall\'s gap in the arena');
        const [x, z] = xs ? [along, across] : [across, along];
        standAt(x, z);
        const hp = player.hp;
        run(wallSpan(box) + 0.3, () => { tough(); if (!player.ragdoll) Object.assign(player, { x, z, vx: 0, vz: 0 }); else player.burning = null; });
        player.ragdoll = null;
        return hp - player.hp;
      };
      const gapHurt = wallTest(true), offHurt = wallTest(false);
      check(gapHurt === 0, `the wall passes a hero in its gap by (${gapHurt})`);
      check(offHurt > 0, 'the wall hurts a hero off its gap');
      out.wall = { gap: gapHurt, off: offHurt };

      // --- a hand: it hurts a hero who stayed in its ring, not one who ran ------------------------------
      const spot = fightFloor(base, vo.x, vo.z, 6.5);
      const handTest = runs => {
        standAt(spot.x + 0.5, spot.z + 0.5);
        b.cast(attack(b, 'hands'));
        const hp = player.hp;
        let moved = false;
        run(handLands() + 0.3, () => {
          still();
          const mine = b.hands[0];
          if (runs && !moved && mine && mine.t > G.hands.track + 0.1) {
            // (away from every ring)
            const away = fightFloor(base, mine.x, mine.z, 4, f => b.hands.every(h => Math.hypot(f.x + 0.5 - h.x, f.z + 0.5 - h.z) > G.hands.r + 1));
            standAt(away.x + 0.5, away.z + 0.5); moved = true;
          }
        });
        run(handSpan() - handLands(), still);
        return hp - player.hp;
      };
      const stayed = handTest(false), ran = handTest(true);
      check(stayed > 0, 'a hand hurts a hero who stayed in its ring');
      check(ran === 0, `not one who ran from it (${ran})`);
      out.hand = { stayed, ran };

      // --- a bomb: it hurts at its mark --------------------------------------------------------------------
      standAt(spot.x + 0.5, spot.z + 0.5);
      b.cast(attack(b, 'erupt'));
      run(0.05, still);
      check(b.marks.length >= G.erupt.count[0] - 1, `his eruption's bombs, their spots marked (${b.marks.length})`);
      const mark = b.marks[0];
      standAt(mark.x, mark.z);
      let hp = player.hp;
      run(mark.flight + 0.3, () => { tough(); if (!player.ragdoll) Object.assign(player, { x: mark.x, z: mark.z, vx: 0, vz: 0 }); });
      check(player.hp < hp, 'a bomb hurts at its mark');
      out.bomb = hp - player.hp;
      run(1, still);

      // --- the split: nothing takes him below two thirds in phase 1; he rises ----------------------------
      state.devPassive = false;   // (he holds still himself while the volcano comes up: game/woppylava.js)
      const floor = Math.ceil(b.profile.hp * G.splits[0]);
      damageEnemy(b, b.hp * 2);
      check(b.hp === floor && b.hp > 0, `no blow takes him below two thirds in phase 1 (${b.hp} of ${b.profile.hp})`);
      const road = () => [...(mountainPlan()?.cells.values() ?? [])].filter(m => m.road);
      // (the hero on the volcano's road, half way up, as it cracks)
      let on = null;
      check(until(1, () => b.mode === 'split', still) < 1, 'he rises (his clip `rise`)');
      check(b.shield > 0 && b.pose?.clip === 'rise', 'warded meanwhile');
      const heldStill = { x: b.x, z: b.z };
      check(until(G.volcano.at + 1, () => !!b.mountain, still) < Infinity, 'the volcano cracks open');
      check(until(VOLCANO_TIMES.crack + 0.5, () => road().length > 0, still) < Infinity, 'its plan, a road winding up it');
      const plan = mountainPlan(), cells = [...plan.cells.values()], ways = road().sort((p, q) => p.top - q.top);
      on = ways[Math.floor(ways.length / 2)];
      standAt(on.x + 0.5, on.z + 0.5);
      const startY = player.y;
      // (standing still on it: game/mountains.js carries them up)
      // (knocked down twice on it as it rises, as a blow would: carried up all the same)
      const knocks = new Set();
      const pin = () => {
        tough(); player.vx = player.vz = 0;
        const m = mountainNow();
        for (const at of [1.5, 4.5]) if (m?.phase === 'rise' && m.t >= at && !knocks.has(at)) { knocks.add(at); knockDown({ hop: 1 }); }
      };
      check(until(VOLCANO_TIMES.crack + VOLCANO_TIMES.rise + 1, () => mountainNow()?.phase === 'up', pin) < Infinity, 'it rises');
      check(Math.hypot(b.x - heldStill.x, b.z - heldStill.z) < 0.05 && !b.walls.length && !b.hands.length && !b.marks.length, 'he held still meanwhile, casting nothing');
      const top = Math.max(...cells.map(m => m.top)) * LH, basin = vo.basin * LH;
      out.volcano = { cells: cells.length, road: ways.length, high: +(top - basin).toFixed(2) };
      check(top - basin >= 6, `big: ${out.volcano.high} units over the basin`);
      check(knocks.size === 2, 'knocked down on it twice as it rose');
      check(until(6, () => !player.ragdoll && !player.getUp && player.grounded, pin) < Infinity, 'up again');
      run(0.5, pin);
      const onY = groundAt(player.x, player.z, player.y + 0.5, 0).h;
      check(Math.abs(player.y - onY) < 0.1 && player.y > startY + 1, `the hero on its road (${on.x},${on.z}) rode up (${startY.toFixed(2)} → ${player.y.toFixed(2)}, its floor ${onY.toFixed(2)})`);
      check(until(G.rise + 1, () => b.stage === 2, still) < Infinity, 'phase 2');

      // --- the lava rises over the basin; the road stays dry --------------------------------------------
      check(until(G.flood.after + G.flood.rise + 3, () => b.tide >= 1 && state.tide != null && Math.abs(state.tide - base.tide.high) < 0.05, still) < Infinity, 'the lava rises over the basin');
      const basinCells = base.floors.filter(f => f.encounter && !plan.cells.has(f.c) && Math.hypot(f.x + 0.5 - vo.x, f.z + 0.5 - vo.z) > 9.5);
      const wet = basinCells.filter(f => lavaOver(state.map, f.c) > 0.05).length;
      const low = basinCells.filter(f => Math.max(...f.cs) < state.tide * LH - 0.05), under = low.filter(f => lavaOver(state.map, f.c) > 0.05).length;
      check(under === low.length && wet >= basinCells.length * 0.5, `the basin is lava (${wet} of ${basinCells.length}; under its level ${under} of ${low.length})`);
      // (its foot, where it leaves the basin, may wade in it)
      const dryRoad = ways.filter(m => lavaOver(state.map, m.c) <= 0 || Math.min(...m.f.cs) <= vo.basin * LH + 0.05).length;
      const wetRoad = ways.filter(m => lavaOver(state.map, m.c) > 0).map(m => `${m.x},${m.z} top ${m.top} h ${m.h} cs ${m.f.cs.map(v => v.toFixed(2))} over ${lavaOver(state.map, m.c).toFixed(2)}`);
      check(dryRoad === ways.length, `the road dry (${dryRoad} of ${ways.length}: ${wetRoad.join('; ')}; lava ${(state.tide * LH).toFixed(2)}, basin ${(vo.basin * LH).toFixed(2)})`);
      out.flood = { basin: `${wet}/${basinCells.length}`, road: `${dryRoad}/${ways.length}` };

      // --- phase 2: his fire creatures; the fuse burns --------------------------------------------------------
      standAt(on.x + 0.5, on.z + 0.5);
      const seen = new Set();
      check(until(G.minions.first + 25, () => living('magmaface').length + living('magmacat').length > 0,
        () => { still(); seen.add(`${b.mode}${b.mode === 'attack' ? ':' + b.profile.attacks[b.attack]?.name : ''}`); }) < Infinity,
        `his fire creatures come out of his crater (${[...seen]}; barred ${[...b.barred ?? []]}; at ${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)})`);
      out.minions = living('magmaface').length + living('magmacat').length;
      check(b.fuse > 0 && b.fuse < G.fuse, `the fuse burns (${b.fuse.toFixed(1)} s)`);
      const fuse = b.fuse;
      run(1, still);
      check(Math.abs(fuse - b.fuse - 1) < 0.1, 'a second a second');
      check(document.getElementById('boss-fuse')?.classList.contains('on'), 'the fuse\'s bar shows');

      // --- the eruption: lava pours down the volcano, a few isles on its road stay dry ---------------------
      state.devPassive = true;
      b.fuse = 0.2;
      check(until(1, () => b.burst >= 0, still) < 1, 'the volcano erupts');
      run(G.burst.pour + 1, still);
      const left = islesLeft(b.burst);
      const roadDry = ways.filter(m => lavaOver(state.map, m.c) <= 0);
      const slopes = cells.filter(m => !m.road && !m.crater && lavaOver(state.map, m.c) > 0.05).length;
      check(left > 0 && roadDry.length > 0, `an isle on its road stays dry (${roadDry.length} cells, ${left} isles)`);
      check(roadDry.length <= left * 4, 'only the isles');
      check(slopes > cells.length * 0.3, `the lava pours down its sides (${slopes} cells)`);
      out.eruption = { isles: left, dry: roadDry.length, poured: slopes };

      // --- the robot pulls a hero out of the lava, onto dry ground ----------------------------------------
      const hot = ways.find(m => lavaOver(state.map, m.c) > 0.1) ?? basinCells[0];
      standAt(hot.x + 0.5, hot.z + 0.5);
      check(until(1, () => !!player.rescue, tough) < 1, 'into the lava: the robot comes');
      check(until(12, () => !player.rescue, tough) < Infinity, 'and flies the hero out');
      const s = standingAt(player.x, player.z);
      check(!s || s.y <= player.y + 0.02, `onto dry ground (${player.x.toFixed(1)}, ${player.y.toFixed(2)}, ${player.z.toFixed(1)})`);
      out.rescue = [+player.x.toFixed(1), +player.z.toFixed(1)];

      // --- his death: the lava drains, the volcano comes down, his creatures go -----------------------------
      state.devPassive = false;
      standAt(roadDry[0].x + 0.5, roadDry[0].z + 0.5);
      damageEnemy(b, b.hp);
      check(b.mode === 'dead', 'beaten');
      check(until(VOLCANO_TIMES.fall + 3, () => !mountainNow(), still) < Infinity, 'the volcano comes down');
      check(until(8, () => state.tide == null, still) < Infinity, 'the lava drains');
      run(1, still);
      check(state.map === base, 'the cube\'s own floors again');
      check(living('magmaface').length + living('magmacat').length === 0, 'his fire creatures went with him');
      const sAfter = basinCells.filter(f => lavaOver(state.map, f.c) > 0).length;
      check(sAfter === 0, 'no lava anywhere');
      out.death = 'drained, down';
      return out;
    } finally {
      state.devPassive = false;
      player.god = god;
    }
  });
}

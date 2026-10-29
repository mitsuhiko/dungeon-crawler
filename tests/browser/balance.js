// With ?dev=1&trial=balance: await (await import('./tests/browser/balance.js')).runBalanceChecks()
// The ordinary command path, warning portal, live landing timer, lost collision, a rhythm stone's beat, a miss the robot
// pulls the hero out of (back at the start, the room as built for a new try), out of the room and
// back in, and the exit apron.
import { state, player } from '../../src/game/state.js';
import { goTrial, takePortal } from '../../src/game/dev.js';
import { sealedIn } from '../../src/game/trials.js';
import { robotHere } from '../../src/game/robot.js';
import { groundAt } from '../../src/physics/collide.js';
import { trialFluid } from '../../src/physics/fluid.js';
import { lossOf, shareOf } from '../../src/core/rescue.js';

const check = (value, text) => { if (!value) throw Error(text); };
const wait = async (test, text, ms = 15000) => {
  const until = performance.now() + ms;
  while (!test() && performance.now() < until) await new Promise(r => setTimeout(r, 25));
  check(test(), text);
};
export async function runBalanceChecks() {
  check(state.dev, 'requires ?dev=1');
  await goTrial('balance');
  await wait(() => !state.transitioning && state.map.trialFaces.includes('balance'), 'warning portal', 90000);
  const dir = state.map.trialFaces.indexOf('balance');
  takePortal(state.map.portals.find(p => p.dir === dir));
  await wait(() => !state.transitioning && state.map.trial?.kind === 'balance', 'inside', 90000);
  const m = state.map, tr = m.trial, q = tr.crust.find(q => tr.slabs[q.stone].kind === 'steady'), f = m.floors[q.f];
  const place = f => Object.assign(player, { x: f.x + .5, y: Math.max(...f.cs), z: f.z + .5,
    vx: 0, vy: 0, vz: 0, grounded: true, support: f });
  check([2, 3].includes(tr.fluid), 'lava or acid, never harmless water');
  const god = player.god;
  player.god = false;   // (the dev tools' god mode takes no damage)
  try { return await attempt(m, tr, q, f, place, dir); } finally { player.god = god; }
}
async function attempt(m, tr, q, f, place, dir) {
  const hp = player.hp, cube = state.cubeKey, inventory = JSON.stringify(player.inventory);
  place(f);
  await wait(() => state.trial.stones[q.stone] != null, 'a grounded landing starts the slab');
  await wait(() => state.trial.t - state.trial.stones[q.stone] >= 1, 'one second');
  check(groundAt(f.x + .5, f.z + .5, Math.max(...f.cs) + .1, 0).s === f, 'still solid before three seconds');
  await wait(() => state.trial.t - state.trial.stones[q.stone] >= 3, 'three seconds');
  check(groundAt(f.x + .5, f.z + .5, Math.max(...f.cs) + .1, 0).s !== f, 'sunk: no collider');
  check(Object.keys(state.trial.stones).length === 1, 'untouched slabs wait');
  // a miss: into the basin's lava or acid, the robot pulls them out back to the start, for a
  // quarter of their health; the room is put back as built for a new try
  check(robotHere(), 'the robot must be with the hero (?dev=1 meets it)');
  const lose = lossOf(player.maxHp, shareOf(tr.fluid, 0));
  await wait(() => player.rescue, 'the robot pulls them out of the basin');
  check(state.trial.phase === 'idle', 'a new try: the room as built, not armed while carried');
  await wait(() => !player.rescue, 'set down');
  check(Math.hypot(player.x - state.arrival.x, player.z - state.arrival.z) < 0.6 && player.grounded, 'back at the start, where the room was entered');
  check(state.cubeKey === cube && Math.abs(player.hp - (hp - lose)) < 1 && !state.deathAsk && !player.ragdoll, `a quarter of the health, no death: ${hp - player.hp} (${lose})`);
  check(JSON.stringify(player.inventory) === inventory, 'equipment and inventory unchanged');
  check(state.trial.phase === 'idle' && !sealedIn() && !Object.keys(state.trial.stones).length, 'idle again, no clocks, not sealed');
  check(groundAt(f.x + .5, f.z + .5, Math.max(...f.cs) + .1, 0).s === f, 'the sunk stone is up again');
  await new Promise(r => setTimeout(r, 600));
  check(state.trial.phase === 'idle', 'standing at the start, it waits');
  // out of the room and back in: a new attempt, every stone up again
  takePortal(m.portals.find(p => p.kind === 'side' && p.dir === tr.entry));
  await wait(() => !state.transitioning && state.cubeKey !== cube, 'out into the room before', 90000);
  takePortal(state.map.portals.find(p => p.dir === dir));
  await wait(() => !state.transitioning && state.cubeKey === cube, 'back in', 90000);
  check(state.trial.phase === 'idle', 'as built again');
  const solid = q => { const f = m.floors[q.f]; return groundAt(f.x + .5, f.z + .5, Math.max(...f.cs) + .1, 0).s === f; };
  check(tr.crust.filter(q => tr.slabs[q.stone].kind !== 'rhythm').every(solid), 'all slabs solid again');
  const forms = new Map();
  for (const q of tr.crust) { if (!forms.has(q.stone)) forms.set(q.stone, { form: q.form, size: 0 }); forms.get(q.stone).size++; }
  check(new Set([...forms.values()].map(q => q.form)).size >= 2, 'different slab shapes');
  check(new Set([...forms.values()].map(q => q.size)).size >= 2, 'different slab sizes');
  place(f);
  await wait(() => state.trial.phase !== 'idle' && state.trial.stones[q.stone] != null, 'stepping off, a new attempt arms; the stone has its clock again');
  // a rhythm stone goes under and comes up to its beat (watched from the apron: the slab sinks)
  place(m.floors[tr.entryFloor]);
  const r = tr.crust.find(q => tr.slabs[q.stone].kind === 'rhythm');
  check(r, 'a rhythm stone in the room');
  await wait(() => !solid(r), 'a rhythm stone goes under', 12000);
  await wait(() => solid(r), 'and comes up again', 12000);
  place(m.floors[tr.goalFloor]);
  const basin = trialFluid()?.y;
  await wait(() => state.trial.phase === 'resolved', 'the exit apron resolves');
  check(state.run.unlockedGates.has(tr.gate), 'the way on stays open');
  await new Promise(r => setTimeout(r, 300));
  check(basin != null && trialFluid()?.y === basin, `the basin stays at its level: ${basin} -> ${trialFluid()?.y}`);
  return ['balance', `${new Set(tr.crust.map(q => q.stone)).size} slabs, three seconds per landing`];
}

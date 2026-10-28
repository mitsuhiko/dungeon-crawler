// With ?dev=1&trial=balance: await (await import('./tests/browser/balance.js')).runBalanceChecks()
// The ordinary command path, warning portal, live landing timer, lost collision and exit apron.
import { state, player } from '../../src/game/state.js';
import { goTrial, takePortal } from '../../src/game/dev.js';
import { groundAt } from '../../src/physics/collide.js';

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
  const m = state.map, tr = m.trial, q = tr.crust[0], f = m.floors[q.f];
  const place = f => Object.assign(player, { x: f.x + .5, y: Math.max(...f.cs), z: f.z + .5,
    vx: 0, vy: 0, vz: 0, grounded: true, support: f });
  check([2, 3].includes(tr.fluid), 'lava or acid, never harmless water');
  place(f);
  await wait(() => state.trial.stones[q.stone] != null, 'a grounded landing starts the slab');
  await wait(() => state.trial.t - state.trial.stones[q.stone] >= 1, 'one second');
  check(groundAt(f.x + .5, f.z + .5, Math.max(...f.cs) + .1, 0).s === f, 'still solid before three seconds');
  await wait(() => state.trial.t - state.trial.stones[q.stone] >= 3, 'three seconds');
  check(groundAt(f.x + .5, f.z + .5, Math.max(...f.cs) + .1, 0).s !== f, 'sunk: no collider');
  check(Object.keys(state.trial.stones).length === 1, 'untouched slabs wait');
  place(m.floors[tr.goalFloor]);
  await wait(() => state.trial.phase === 'resolved', 'the exit apron resolves');
  check(state.run.unlockedGates.has(tr.gate), 'the way on stays open');
  return ['balance', `${tr.crust.length / 4} slabs, three seconds per landing`];
}

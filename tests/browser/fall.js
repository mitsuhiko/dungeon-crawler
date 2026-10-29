// With ?dev=1 (the dev tools skip the beginning: the robot is with the hero):
// await (await import('./tests/browser/fall.js')).runFallChecks()
// A fall through a hole in the ground (docs/world.md "Falling in"; game/fall.js, game/rescue.js):
// the cube below is found, the robot catches the hero before they land there, carries them back up
// into the cube they fell from and sets them down on its last safe spot, for a quarter of their
// most health. Out of a cube with nothing below, it catches them right under the floor. All they
// have left: it takes it, and they die (back at the entry of the cube they fell from).
import { state, player } from '../../src/game/state.js';
import { robotHere } from '../../src/game/robot.js';
import { goPlace } from '../../src/game/dev.js';
import { whenReady } from '../../src/game/hud.js';
import { answerDeath } from '../../src/game/deathask.js';
import { step, parse } from '../../src/world/coords.js';
import { N } from '../../src/core/constants.js';
import { lossOf, FALL_SHARE } from '../../src/core/rescue.js';
import { groundAt } from '../../src/physics/collide.js';
import { supportedPoint } from '../../src/physics/respawn.js';

const check = (value, text) => { if (!value) throw Error(text); };
const wait = async (test, text, ms = 20000, each = null) => {
  const until = performance.now() + ms;
  while (!test() && performance.now() < until) { each?.(); await new Promise(r => setTimeout(r, 10)); }
  check(test(), text);
};

// a cube of the plan with a hole: an empty column in the middle of the ground, with a spot to
// stand on right beside it, and a cube below it
export async function holeCube() {
  const cubes = state.cubes;
  for (let d = Math.max(1, state.map?.depth ?? 1); d < 19; d++) {
    const keys = [...cubes.layout(d).exists].sort();
    for (const k of keys.slice(0, 60)) {
      if (!cubes.layout(d + 1).exists.has(step(k, 4))) continue;
      const m = (await whenReady(cubes.map(k))).map;
      if (!m || m.interior || m.trialRoom || m.flip || m.town) continue;
      for (let z = 3; z < N - 3; z++) for (let x = 3; x < N - 3; x++) {
        if (m.cols[z * N + x].length) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const f = m.cols[(z + dz) * N + x + dx].at(-1);
          if (!f || f.fluid || f.kind || !m.safe?.[f.id]) continue;
          return { k, depth: d, hole: { x: x + 0.5, z: z + 0.5 }, stand: { x: x + dx + 0.5, z: z + dz + 0.5 } };
        }
      }
    }
  }
  return null;
}

// stand beside the hole (the last safe spot), then drop into it
export async function dropIn(h) {
  const [X, , Z] = parse(h.k);
  await goPlace({ depth: h.depth, cell: [X, Z], spot: h.stand });
  await wait(() => !state.transitioning && state.cubeKey === h.k, 'in the cube with the hole');
  const g = groundAt(h.stand.x, h.stand.z, 99, 0), at = supportedPoint(h.stand.x, g.h, h.stand.z);
  check(at, 'a spot to stand beside the hole');
  Object.assign(player, { x: at.x, y: at.y, z: at.z, visY: at.y, grounded: true, safe: { ...at }, footY: at.y });
  await new Promise(r => setTimeout(r, 200));
  Object.assign(player, { x: h.hole.x, z: h.hole.z, y: at.y + 0.2, visY: at.y + 0.2, vx: 0, vy: 0, vz: 0, grounded: false, support: null });
  return at;
}

export async function runFallChecks() {
  check(state.dev, 'requires ?dev=1');
  check(robotHere(), 'the robot must be with the hero (?dev=1 meets it)');
  const god = player.god;
  player.god = false;   // (the dev tools' god mode takes no damage)
  try { return await checks(); } finally { player.god = god; }
}
async function checks() {
  const out = [];
  const h = await holeCube();
  check(h, 'no cube with a hole found');
  const below = step(h.k, 4);

  // caught in the cube below, before landing; carried back up onto the last safe spot
  let safe = await dropIn(h);
  const hp = player.hp = player.maxHp, lose = lossOf(player.maxHp, FALL_SHARE);
  await wait(() => state.fallFrom?.catch && state.fallFrom.key === h.k, 'falling, the robot to catch them');
  let landed = false, down = false;
  const watch = () => {
    if (state.cubeKey === below && !state.transitioning) { down = true; if (player.grounded || player.ragdoll) landed = true; }
  };
  await wait(() => down, 'into the cube below', 20000, watch);
  check(state.cubes.cubes.get(below)?.visits > 0, 'the cube below is found');
  check(player.rescue?.below, 'caught as the slide down ends');
  await wait(() => state.cubeKey === h.k && !player.rescue && !state.transitioning, 'carried back up and set down', 20000, watch);
  check(!landed, 'never landed in the cube below');
  check(!state.fallFrom && !state.deathAsk, 'the fall is over, nobody died');
  check(player.hp === hp - lose, `a quarter of the most health: ${hp - player.hp} (${lose})`);
  check(Math.hypot(player.x - safe.x, player.z - safe.z) < 0.6 && Math.abs(player.y - safe.y) < 0.6 && player.grounded,
    `set down on the last safe spot: ${player.x.toFixed(2)},${player.y.toFixed(2)},${player.z.toFixed(2)}`);
  out.push(`caught below ${below}`);

  // nothing below (as out of a trial room or Flip's box): caught right under the floor
  safe = await dropIn(h);
  player.hp = player.maxHp;
  state.map.trialRoom = true;   // (startFall: no cube below this one)
  try {
    let lowest = Infinity;
    await wait(() => player.rescue, 'caught under the floor', 5000);
    check(state.cubeKey === h.k && !state.fallFrom && !state.transitioning, 'no fall into the cube below');
    await wait(() => !player.rescue, 'carried up the hole and set down', 10000, () => { lowest = Math.min(lowest, player.y); });
    check(lowest > -3, `never out of the world: ${lowest.toFixed(2)}`);
    check(player.hp === player.maxHp - lose && player.grounded, 'a quarter of the most health, on its feet');
    check(Math.hypot(player.x - safe.x, player.z - safe.z) < 0.6, 'on the last safe spot');
  } finally { delete state.map.trialRoom; }
  out.push('caught under the floor');

  // all they have left: the whole quarter, and they die; back at the entry of the cube they fell from
  await dropIn(h);
  player.hp = lose;
  await wait(() => state.deathAsk, 'they die', 20000);
  const cause = document.getElementById('death-cause')?.textContent;
  check(player.hp === 0 && cause === 'Fell through the void!', 'killed by the fall: ' + cause);
  answerDeath(true);
  await wait(() => !state.transitioning && state.cubeKey === h.k && !state.deathAsk, 'back in the cube they fell from');
  check(player.hp === player.maxHp && !state.fallFrom, 'at full health, the fall over');
  out.push('a fatal catch');
  return out;
}

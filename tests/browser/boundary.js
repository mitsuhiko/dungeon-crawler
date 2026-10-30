// Real-controller/render/travel integration checks, run from index.html's devtools:
// await (await import('./tests/browser/boundary.js')).runBoundaryChecks()
// await (await import('./tests/browser/boundary.js')).runModifierKeyChecks()
// Boundary checks reset the world before and after testing.
import { N, DIRS, WATER, FALL_DAMAGE } from '../../src/core/constants.js';
import { faceKey, step, OPP6 } from '../../src/world/coords.js';
import { isFaceOpen, openedSides, boundaryArrival } from '../../src/core/boundaries.js';
import { player, state } from '../../src/game/state.js';
import { newWorld, enterCube, spawnAt, spawnEntry, refreshOpenFaces } from '../../src/game/flow.js';
import { updatePlayer } from '../../src/game/update.js';
import { checkPortals } from '../../src/game/portals.js';
import { startTravel, travelling, updateTravel } from '../../src/game/travel.js';
import { startFall } from '../../src/game/fall.js';
import { groundAt } from '../../src/physics/collide.js';
import { detachNeighbors, adoptNeighbors } from '../../src/render/neighbors.js';
import { setInventoryOpen } from '../../src/game/inventory.js';
import { wantsWalk, autoAttackHeld, clearInput } from '../../src/game/input.js';
import { paused } from './combat.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const close = (a, b) => Math.abs(a - b) < 1e-8;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const key = (type, code, init = {}) => dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, ...init }));
const neighbors = () => { const list = detachNeighbors(); adoptNeighbors(list); return list; };
function panes(glass, open) {
  check(glass.userData.panes.every((pane, d) => pane.visible === !open[d]), 'Glass panes do not match opened faces');
  check(glass.children[0].visible, 'Cube outline must remain');
}
function atFace(dir, along, y, distance = 0.3) {
  spawnAt(dir === 0 ? N - distance : dir === 1 ? distance : along, y,
    dir === 2 ? N - distance : dir === 3 ? distance : along);
  player.autoDir = null;
}
async function waitForSlide() {
  for (let i = 0; i < 100 && state.transitioning && !travelling(); i++) await delay(20);
  check(travelling(), 'Cube slide did not start');
}
function finishSlide() {
  for (let i = 0; i < 180 && travelling(); i++) updateTravel(1 / 60);
  check(!travelling() && !state.transitioning, 'Cube slide did not finish');
}
async function travel(portal) { startTravel(portal); await waitForSlide(); finishSlide(); }

// Modifier state: left Ctrl (walk; right Ctrl is the action key) and Shift (auto-attack), left and
// right, blur and modal isolation.
export async function runModifierKeyChecks() {
  return paused(async () => {
    check(!state.inventoryOpen && !state.transitioning, 'Close inventory and finish travel first');
    clearInput();
    try {
      for (const shift of ['ShiftLeft', 'ShiftRight']) {
        key('keydown', 'KeyW');
        check(!wantsWalk() && !autoAttackHeld(), 'Running without modifiers, no auto-attack');
        key('keydown', 'ControlLeft', { ctrlKey: true }); check(wantsWalk(), 'Left Ctrl must walk');
        key('keyup', 'ControlLeft'); check(!wantsWalk(), 'Releasing Ctrl must run again');
        key('keydown', 'ControlRight', { ctrlKey: true }); check(!wantsWalk(), 'Right Ctrl must not walk');
        key('keyup', 'ControlRight');
        key('keydown', shift, { shiftKey: true }); check(autoAttackHeld(), shift + ' must auto-attack');
        key('keyup', shift); check(!autoAttackHeld(), 'Releasing Shift must stop auto-attacking');
        key('keyup', 'KeyW'); clearInput();
      }
      key('keydown', 'ControlLeft', { ctrlKey: true }); key('keydown', 'ShiftLeft', { shiftKey: true });
      dispatchEvent(new Event('blur')); check(!wantsWalk() && !autoAttackHeld(), 'Blur must clear held modifiers');
      key('keydown', 'ControlLeft', { ctrlKey: true }); key('keydown', 'ShiftLeft', { shiftKey: true }); setInventoryOpen(true);
      check(!wantsWalk() && !autoAttackHeld(), 'Inventory must clear held modifiers');
      key('keydown', 'ControlLeft', { ctrlKey: true }); key('keydown', 'ShiftRight', { shiftKey: true }); setInventoryOpen(false);
      check(!wantsWalk() && !autoAttackHeld(), 'Inventory input must not replay on close');
      return ['left Ctrl walk (not right) / Shift auto-attack hold/release', 'blur and modal isolation'];
    } finally { setInventoryOpen(false); clearInput(); }
  });
}

// Nearby but non-linked progression sections must not become a shortcut on discovery, until
// the route rooms between them are discovered and their guardians defeated.
async function sealedSectionCheck() {
  for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
    await newWorld(seed); clearInput();
    const L = state.cubes.layout(1);
    for (const k of L.exists) for (let d = 0; d < 4; d++) {
      const n = step(k, d);
      if (!L.exists.has(n)) continue;
      const a = await state.cubes.get(k), b = await state.cubes.get(n);
      if (a.map.portals.some(p => p.kind === 'side' && p.dir === d)) continue;
      if (a.map.routeIndex === b.map.routeIndex) continue;
      enterCube(a, a.map.portals[0].dir);
      check(!isFaceOpen(state.openedFaces, k, d), 'Gateless face must stay closed until both sides are discovered');
      enterCube(b, b.map.portals[0].dir);
      check(!isFaceOpen(state.openedFaces, n, OPP6[d]), 'Discovering both sections must not open a shortcut');
      panes(state.world.glass, openedSides(state.openedFaces, n));
      enterCube(a, a.map.portals[0].dir);
      check(!isFaceOpen(state.openedFaces, k, d), 'The sealed section boundary must be shared');
      panes(state.world.glass, openedSides(state.openedFaces, k));
      for (let along = 0.5; along < N; along += 1) {
        const x = d === 0 ? N - 0.5 : d === 1 ? 0.5 : along, z = d === 2 ? N - 0.5 : d === 3 ? 0.5 : along;
        atFace(d, along, groundAt(x, z, 99, 0).h, 0.5);
        state.boundaryLock = -1; state.portalLock = 0;
        check(!checkPortals(...DIRS[d]) && !state.transitioning, 'Non-linked section cannot trigger travel');
      }
      const lo = Math.min(a.map.routeIndex, b.map.routeIndex), hi = Math.max(a.map.routeIndex, b.map.routeIndex);
      const between = await Promise.all(L.route.slice(lo, hi + 1).map(r => state.cubes.get(r)));
      const gates = between.slice(0, -1).filter(r => r.map.guardian).map(r => r.key);
      for (const r of between) if (!r.visits) enterCube(r, r.map.portals[0].dir);
      enterCube(a, a.map.portals[0].dir);
      if (gates.length) {
        check(!isFaceOpen(state.openedFaces, k, d), 'A guarded section boundary must stay sealed');
        for (const g of gates) state.run.unlockedGates.add(g);
        refreshOpenFaces();
      }
      check(isFaceOpen(state.openedFaces, k, d) && isFaceOpen(state.openedFaces, n, OPP6[d]), 'Explored, unguarded sections must join');
      panes(state.world.glass, openedSides(state.openedFaces, k));
      for (const proxy of neighbors()) panes(proxy.glass, openedSides(state.openedFaces, proxy.key));
      return `section boundary ${k} ${d}: sealed after discovering both sides, open once ${hi - lo - 1} room(s) between${gates.length ? ' and their guardian' : ''} are done`;
    }
  }
  throw Error('No non-linked section boundary found');
}

// Discover both ends without crossing their gate (as when arriving by another route).
// the town's gate tile (world/town.js: a new world starts in the inn's), entered
async function gateTile() {
  const t = await state.cubes.get(state.cubes.town.gate);
  enterCube(t, null, null, { x: N / 2, y: t.map.floors[0].top * 0.5, z: N / 2 });
  return t;
}

async function discoveredGateCheck() {
  await newWorld(3); clearInput();
  const town = await gateTile(), portal = town.map.portals.find(p => p.kind === 'side');
  const dir = portal.dir, opposite = OPP6[dir], road = await state.cubes.get(step(town.key, dir));
  check(!road.visits && !isFaceOpen(state.openedFaces, town.key, dir), 'Prefetching a neighbour must not open its face');
  enterCube(road, opposite);
  check(isFaceOpen(state.openedFaces, town.key, dir) && isFaceOpen(state.openedFaces, road.key, opposite), 'Discovering both ends must open a gated face without crossing its gate');
  check(!state.world.portalFx.some(fx => fx.obj.userData.portal.kind === 'side' && fx.obj.userData.portal.dir === opposite), 'Discovered gate must disappear');
  panes(state.world.glass, openedSides(state.openedFaces, road.key));
  for (const proxy of neighbors()) panes(proxy.glass, openedSides(state.openedFaces, proxy.key));
  const along = dir < 2 ? portal.z + 0.5 : portal.x + 0.5, elsewhere = along + (along < N / 2 ? 3 : -3);
  atFace(opposite, elsewhere, 2, 0.7);
  checkPortals();   // release the arrival boundary lock
  atFace(opposite, elsewhere, 2);
  check(checkPortals(...DIRS[opposite]), 'Discovered gated face must accept a crossing away from its gate');
  await waitForSlide(); finishSlide();
  check(state.cubeKey === town.key, 'Discovered boundary crossing must enter the neighbour');
  check(!state.world.portalFx.some(fx => fx.obj.userData.portal.kind === 'side'), 'Re-entry must not restore a discovered gate');
  panes(state.world.glass, openedSides(state.openedFaces, town.key));
  return 'gated face discovered by another route: both panes / gate removed / full-face crossing / rebuild';
}

export async function runBoundaryChecks() {
  const results = [];
  return paused(async () => {
    try {
      // These four seeds give the town each of the four exit orientations.
      for (const seed of [0, 1, 2, 3]) {
        await newWorld(seed); clearInput();
        // (only the seams between the town's tiles are open: it is known from the start, docs/town.md)
        const { tiles } = state.cubes.town;
        check([...state.openedFaces].every(f => { const [k, d] = f.split('/'); return tiles.has(k) && tiles.has(step(k, +d)); }) && state.boundaryLock === -1,
          'New world must clear opened faces/locks but the town\'s seams');
        const town = await gateTile(), portal = town.map.portals.find(p => p.kind === 'side');
        const dir = portal.dir, opposite = OPP6[dir], roadKey = step(town.key, dir);
        const road = await state.cubes.get(roadKey), back = road.map.portals.find(p => p.dir === opposite);
        const originalPortals = town.map.portals;
        check(!road.visits && !isFaceOpen(state.openedFaces, town.key, dir), 'An undiscovered neighbour must retain its gate and glass');
        const oldWorld = state.world, oldGate = oldWorld.portalFx.find(fx => fx.obj.userData.portal === portal);
        const oldProxies = neighbors();
        const along = dir < 2 ? portal.z + 0.5 : portal.x + 0.5;
        atFace(dir, along, portal.y, 0.5);
        player.autoDir = DIRS[dir];
        for (let i = 0; i < 60 && !state.transitioning; i++) updatePlayer(1 / 60);
        player.autoDir = null;
        check(state.transitioning, 'Walking into an unopened side gate must trigger travel');
        await waitForSlide();
        check(isFaceOpen(state.openedFaces, town.key, dir) && isFaceOpen(state.openedFaces, roadKey, opposite), 'First crossing must open both ends');
        check(!oldGate.obj.visible, 'Departing gate must disappear during the slide');
        panes(oldWorld.glass, openedSides(state.openedFaces, town.key));
        for (const proxy of oldProxies) panes(proxy.glass, openedSides(state.openedFaces, proxy.key));
        panes(state.world.glass, openedSides(state.openedFaces, roadKey));
        finishSlide();
        check(!checkPortals(), 'First arrival must not bounce back');
        check(state.cubeKey === roadKey && town.map.portals === originalPortals, 'Generated portal metadata must remain intact');
        check(!state.world.portalFx.some(fx => fx.obj.userData.portal.dir === opposite), 'Destination gate must be absent');
        for (const proxy of neighbors()) panes(proxy.glass, openedSides(state.openedFaces, proxy.key));

        // Return on the ground far from the old portal (the town boundary is flat).
        const elsewhere = along + (along < N / 2 ? 3 : -3);
        atFace(opposite, elsewhere, 2);
        state.boundaryLock = opposite;
        check(!checkPortals(...DIRS[opposite]), 'Arrival boundary lock must prevent immediate re-entry');
        atFace(opposite, elsewhere, 2, 0.7);
        check(!checkPortals(...DIRS[opposite]) && state.boundaryLock === -1, 'Stepping inside must release the boundary lock');
        atFace(opposite, elsewhere, 2);
        player.vx = DIRS[opposite][0] * 1.9; player.vz = DIRS[opposite][1] * 1.9;
        const expected = boundaryArrival(player, opposite);
        check(checkPortals(...DIRS[opposite]), 'An open face must trigger away from its old gate');
        await waitForSlide(); finishSlide();
        check(state.cubeKey === town.key && close(player.x, expected.x) && close(player.z, expected.z) && close(player.y, expected.y), 'Return must preserve crossing point and height');
        check(!checkPortals(), 'Arrival must not bounce immediately back');
        panes(state.world.glass, openedSides(state.openedFaces, town.key));
        // Explicit rebuild/re-entry uses the same state, without reopening a gate.
        enterCube(town);
        check(!state.world.portalFx.some(fx => fx.obj.userData.portal.kind === 'side'), 'Re-entry must not restore an opened gate');
        panes(state.world.glass, openedSides(state.openedFaces, town.key));

        // Cross at a different height in mid-jump, retaining motion rather than spawning at a pad.
        atFace(dir, elsewhere, 12);
        Object.assign(player, { grounded: false, vx: DIRS[dir][0] * 3, vz: DIRS[dir][1] * 3, vy: 2, airTime: 0.2 });
        check(checkPortals(...DIRS[dir]), 'Open face must accept an airborne crossing');
        await waitForSlide(); finishSlide();
        check(close(player.y, 12) && !player.grounded && close(player.vy, 2) && close(player.vx, DIRS[dir][0] * 3) && close(player.vz, DIRS[dir][1] * 3), 'Airborne position/velocity must survive the slide');
        check(!checkPortals(), 'Airborne arrival must not bounce back');
        spawnEntry();
        const respawnGround = groundAt(player.x, player.z, player.y, 0);
        check(respawnGround.s && !respawnGround.s.fluid && close(respawnGround.h, player.y), 'Airborne crossing must record a solid, dry respawn entry');
        for (let i = 0; i < 60; i++) updatePlayer(1 / 60);
        check(!state.transitioning && !state.fallFrom && player.grounded, 'Respawning after an airborne crossing must not fall through another cube');

        // A destination solid blocks crossing; do not alter routes or relocate the player.
        atFace(opposite, elsewhere, 12);
        const target = boundaryArrival(player, opposite), cell = Math.floor(target.z) * N + Math.floor(target.x);
        const blockers = town.map.blockers[cell], blocker = { x: target.x, z: target.z, r: 0.7, bottom: 0, top: 20 };
        blockers.push(blocker);
        startTravel(back);
        for (let i = 0; i < 100 && state.transitioning; i++) await delay(20);
        blockers.splice(blockers.indexOf(blocker), 1);
        check(!state.transitioning && !travelling() && state.cubeKey === roadKey && state.map === road.map, 'Solid destination must block travel without changing active cube');
        // Swimming state also survives the transition (hazards refresh it on the next tick).
        atFace(opposite, elsewhere, 2);
        Object.assign(player, { swimming: true, grounded: false, fluid: WATER, vx: DIRS[opposite][0] * 0.9, vz: DIRS[opposite][1] * 0.9 });
        check(checkPortals(...DIRS[opposite]), 'Swimming must allow an open-face crossing');
        await waitForSlide(); finishSlide();
        check(player.swimming && player.fluid === WATER && !player.grounded, 'Swimming state must survive the slide');
        results.push('side ' + dir + ': first crossing / both glass copies / full-face return / re-entry lock / rebuild / airborne and swimming motion / solid collision');
      }

      await newWorld(3); clearInput();
      await gateTile();
      const sourceKey = state.cubeKey, exit = state.map.portals.find(p => p.kind === 'side'), get = state.cubes.get, before = state.openedFaces.size;
      state.cubes.get = () => Promise.reject(Error('test generation failure'));
      try {
        startTravel(exit);
        for (let i = 0; i < 100 && state.transitioning; i++) await delay(20);
        check(!state.transitioning && state.cubeKey === sourceKey && state.openedFaces.size === before, 'Failed travel must not open a face');
      } finally { state.cubes.get = get; }
      results.push('generation failure does not unlock / new-world reset');

      // Vertical portals stay present and reusable, and falls do not unlock side connections.
      const wellCube = await state.cubes.get(state.cubes.layout(0).down);
      enterCube(wellCube, wellCube.map.portals.find(p => p.kind === 'side').dir);
      const opened = state.openedFaces.size;   // entering may open side faces towards discovered cubes
      const well = state.map.portals.find(p => p.kind === 'down');
      state.run.unlockedGates.add(wellCube.key);   // guardian locking has its own integration checks
      spawnAt(well.x + 0.5, well.y, well.z + 0.5); state.portalLock = 0;
      check(!checkPortals(0, 0, 0.5) && state.portalCharge?.t === 0.5, 'Down well must charge before it takes you');
      spawnAt(well.x + 1.5, well.y, well.z + 0.5);
      check(!checkPortals(0, 0, 0.4) && !state.portalCharge, 'Leaving the well must reset its charge');
      spawnAt(well.x + 0.5, well.y, well.z + 0.5);
      check(!checkPortals(0, 0, 0.5) && state.portalCharge?.t === 0.5, 'Returning to the well must start a fresh charge');
      check(!checkPortals(0, 0, 0.2), 'Down well must not trigger before the charge is full');
      check(checkPortals(0, 0, 0.05), 'Down well must trigger after 0.75 seconds');
      await waitForSlide(); finishSlide();
      const ring = state.map.portals.find(p => p.kind === 'up');
      check(state.world.portalFx.some(fx => fx.obj.userData.portal === ring), 'Up ring must remain after down travel');
      spawnAt(ring.x + 0.5, ring.y, ring.z + 0.5); state.portalLock = 0;
      check(!checkPortals(0, 0, 1) && state.portalCharge?.t === 1, 'Up ring must charge before it takes you');
      check(!checkPortals(0, 0, 0.4), 'Up ring must not trigger before the charge is full');
      check(checkPortals(0, 0, 0.1), 'Up ring must still trigger');
      await waitForSlide(); finishSlide();
      check(state.world.portalFx.some(fx => fx.obj.userData.portal.kind === 'down'), 'Well must remain after return');
      const origin = state.cubeKey, hp = player.hp;
      check(hp > FALL_DAMAGE, 'Need a player who survives the fall');
      check(startFall(), 'Falling into the cube below must remain possible');
      await waitForSlide(); finishSlide();
      check(state.fallFrom?.key === origin, 'A fall must remember the cube it started in');
      check(state.openedFaces.size === opened, 'Vertical travel/falls must not unlock side faces');
      // land (maybe after falling through more cubes), take full damage, back up where it started
      for (let i = 0; i < 2000 && (state.fallFrom || state.transitioning); i++) {
        if (travelling()) finishSlide();
        else if (state.transitioning) await delay(20);
        else updatePlayer(1 / 60);
      }
      check(!state.fallFrom && !state.transitioning && state.cubeKey === origin, 'A fall must end back in the cube it started in');
      check(player.hp === hp - FALL_DAMAGE && !player.ragdoll, 'A fall through cubes must cost full fall damage: ' + player.hp);
      results.push('down / up charge before travel / stepping out resets charge / portals remain / falls cost full damage and return');
      results.push(await discoveredGateCheck());
      results.push(await sealedSectionCheck());
      return results;
    } finally { clearInput(); await newWorld(3); }
  });
}

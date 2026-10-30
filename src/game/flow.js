// Level flow: the world of cubes, entering a cube, travelling through portals, spawning and
// taking damage.
import { DIRS, N, LH } from '../core/constants.js';
import { isFaceOpen, openedSides, discoveredFaces, visitedFaces, portalsOnly } from '../core/boundaries.js';
import { setGlassShut } from '../render/glass.js';
import { showNeighbors, clearNeighbors, clearNeighborCache, shownFar } from '../render/neighbors.js';
import { discoveredCubes } from '../core/viewdistance.js';
import { WorldClient } from '../world/client.js';
import { step } from '../world/coords.js';
import { buildWorld, disposeWorld, setWorldOpenFaces } from '../render/world.js';
import { baked, bakeDensity } from '../render/bake.js';
import { groundAt } from '../physics/collide.js';
import { respawnPoint } from '../physics/respawn.js';
import { player, state, setStatus, worldLevel } from './state.js';
import { sfx } from '../audio/sfx.js';
import { jingle } from '../audio/jingles.js';
import { showStats, flash, fadeOut, fadeIn, slowFade, whenReady } from './hud.js';
import { resetCut } from './cut.js';
import { resetEnemies, mirroring, detachEnemies } from './enemies.js';
import { removeEnemyViews } from '../render/enemies.js';
import { clearParticles } from '../render/particles.js';
import { clearFloatText } from '../render/floattext.js';
import { cancelSword } from './sword.js';
import { onPropSet } from '../render/props.js';
import { NEIGHBOR_DIM } from '../render/materials.js';
import { cubeAssets, warmCube } from '../render/cubeassets.js';
import { warmScene } from '../render/warmup.js';
import { villagersReady } from '../render/villagers.js';
import { createPlayerStats, createRun, takeDamage } from '../core/progression.js';
import { clearEffects } from '../core/potions.js';
import { restoreDefeated, gateLocked, guardianLockMessage } from '../core/guardians.js';
import { guardianKind } from './enemyspawn.js';
import { respawnCube, unpackKills } from '../core/respawn.js';
import { syncEquippedWeapon } from './equipment.js';
import { clearInput } from './inputstate.js';
import { lootMark, forgetLoot, takeLoot } from './loot.js';
import { townPadIn } from '../core/townportal.js';
import { shoreIssues } from '../render/shore.js';
import { cancelCast } from './townportal.js';
import { isInterior } from '../world/town.js';
import { isTestRoom } from '../world/testrooms.js';
import { online, relay } from '../net/online.js';
import { log, logDeath, noteDepth } from './log.js';
import { questEvent, questMark, restoreQuests } from './quests.js';
import { questWorld, noticeQuestGoals, forgetPicked } from './questworld.js';
import { raidDied } from './defense.js';
import { checkQuestLog } from '../core/quests.js';
import { checkSmith } from '../core/save.js';
import { depthOf, MAX_DEPTH } from '../themes/depth.js';
import { ACTS } from '../themes/index.js';
import { enterTrial, restartTrial, refreshTrialView, sealedIn, warnTrials } from './trials.js';
import { setFluidPalettes } from '../render/fluidpal.js';
import { tr } from '../i18n/i18n.js';
import { askRespawn, forgetDeath } from './deathask.js';
import { narrate, arrived, stopNarrator } from './narrator.js';
import { settleIntro, innArrival, comeOutOfInn } from './intro.js';
import { robotArrived, forgetRobot } from './robot.js';
import { endHandover } from './handover.js';

export function spawnAt(x, y, z) {
  cancelSword(true); cancelCast();
  Object.assign(player, { x, y, z, footY: y, vy: 0, vx: 0, vz: 0, visY: y, grounded: true, swimming: false, support: null, ragdoll: null, down: null, getUp: null, swimOut: null, fluidDeath: 0, stun: 0, climb: null, engulfed: null, burning: null, chilled: null, slowed: null, toxic: null, gust: null, shocked: 0, dazed: 0, flat: 0,
    flipping: null, vanished: false, pull: null, rescue: null, wade: 0 });   // (Flip's world, game/flipworld.js; the robot's rescue, game/rescue.js)
  player.safe = respawnPoint({ x, y, z });
  const gr = groundAt(x, z, y + 0.05, 0);
  player.support = gr.s;
  if (gr.s) player.layer = gr.s.kind ? gr.s.run.layer : gr.s.layer;
  resetCut();
}

// where you stand after coming through portal p: a step inside side portals, next to the
// centre of wells and rings (so you do not fall straight back through)
export function arrivalPoint(p) {
  const [x, z] = p.kind === 'side' ? [p.x + 0.5 - DIRS[p.dir][0], p.z + 0.5 - DIRS[p.dir][1]]
    : p.kind === 'spawn' ? [p.x + 0.5, p.z + 0.5] : [p.x + 1.5, p.z + 0.5];
  const y = groundAt(x, z, p.y + 0.3, 0).h;
  return respawnPoint({ x, z, y: Number.isFinite(y) ? y : p.y });
}

// the safe ground nearest a map's middle (a cube come into with no portal to come in by)
function middleOf(m) {
  const f = m.floors.filter(f => m.safe?.[f.id] && !f.fluid)
    .sort((a, b) => Math.hypot(a.x + .5 - N / 2, a.z + .5 - N / 2) - Math.hypot(b.x + .5 - N / 2, b.z + .5 - N / 2))[0] ?? m.floors[0];
  return { x: f.x + .5, y: f.top * LH, z: f.z + .5 };
}

// back to where you came into this cube (after a death: the potions you drank wore off)
export function spawnEntry() {
  const a = state.arrival = respawnPoint(state.arrival);
  spawnAt(a.x, a.y, a.z);
  player.hp = player.maxHp;
  clearEffects(player);
}

export function hurt(amount, reason, by = null) {
  if (state.deathAsk) return;   // dead already, asked what next (game/deathask.js)
  player.lastHurt = { reason, by };
  takeDamage(player, amount, state.time);
  flash();
  if (player.hp <= 0) die();
  else { setStatus(tr(reason)); recover(); }
}

// The cube as you came in. A death puts it back: the enemies you defeated since return and
// the coins they dropped (and you did not pick up yet) go. Those dead long enough are back first
// (core/respawn.js), unless a friend is in the cube already: it stays as they have it.
// learn: memory.html#death (see learn/README.md)
export function beginVisit() {
  if (!online.buddies.some(b => b.cube === state.cubeKey)) respawnCube(state.run, state.cubeKey);
  state.visit = { key: state.cubeKey, defeated: new Set(state.run.defeated), loot: lootMark(), quests: questMark() };
}
function restoreVisit(v) {
  if (!v) return;
  restoreDefeated(state.run, v.defeated);
  forgetLoot(v.key, v.loot);
  restoreQuests(v.quests);   // a horde broken since comes back, and so do the quests' goals (game/quests.js)
  forgetPicked();
}

// died: the chronicle notes what did it (game/log.js logDeath), and "You died" asks what next
// (game/deathask.js). Respawning is back to where you came in, in the cube as it was then
// (after a fall through cubes: the cube the fall started in).
// learn: memory.html#death (see learn/README.md)
export function die() {
  if (state.deathAsk) return;
  const cause = player.lastHurt?.reason;
  if (!jingle('death')) sfx('death');
  raidDied();   // a raid going on is lost (game/defense.js)
  logDeath();
  // (said once the hero is back: game/narrator.js pauses with "You died"); boss: the arena's, still there
  const map = state.map, boss = map?.guardian?.boss && gateLocked(map, state.run) ? map.guardian.boss : null;
  narrate('death', { depth: map?.depth ?? 0, boss });
  askRespawn(cause, backAfterDeath);
}
function backAfterDeath() {
  if (state.fallFrom) { returnFromFall(true); return; }
  // dying in a sealed trial room ends the attempt: back in the room before (game/trials.js)
  if (sealedIn()) { backBeforeTrial(null); return; }
  // playing together the cube stays as it is while a friend fights on in it (and the enemies
  // we are shown are another player's anyway, src/net/foes.js)
  if (mirroring() || online.buddies.some(b => b.here && !b.out && b.hp > 0)) { spawnEntry(); return; }
  restoreVisit(state.visit);
  restartTrial();   // a trial room is put back as it was too (game/trials.js)
  resetEnemies();
  spawnEntry();
}

// back on your feet at the last safe spot (after a fall through cubes: in the cube the fall
// started in)
export function recover() {
  if (state.fallFrom) { returnFromFall(false); return; }
  const a = respawnPoint(player.safe);
  spawnAt(a.x, a.y, a.z);
}

// For now you only enter a cube through a portal: a fall through the void ends back in the
// cube it started in, at its last safe spot (or its entry, if the landing killed you).
function returnFromFall(dead) {
  const f = state.fallFrom, cubes = state.cubes;
  state.fallFrom = null;
  state.transitioning = true;
  cancelSword(true);
  fadeOut();
  setTimeout(() => whenReady(cubes.get(f.key)).then(c => {
    if (state.cubes !== cubes) return;
    if (dead) restoreVisit(f.visit);
    enterCube(c, null, f);
    if (dead) spawnEntry();
    else { const a = respawnPoint(f.safe); spawnAt(a.x, a.y, a.z); }
    state.transitioning = false;
  }, () => {
    if (state.cubes !== cubes) return;
    state.transitioning = false;
    if (dead) backAfterDeath(); else recover();   // stay in this cube
  }), 380);
}

// Where a failed event puts you (docs/trials.md "Failing and dying"): in the room before, beside
// its portal into the trial room (not on it), facing it; the trial room as it was, at full health,
// the potions worn off. A death has said what it was already; another fail says `message`.
export function besidePortal(map, dir) {
  const p = map.portals.find(q => q.kind === 'side' && q.dir === dir);
  if (!p) return null;
  const [dx, dz] = DIRS[dir];
  for (const back of [2.2, 1.6, 1]) {
    const x = p.x + 0.5 - dx * back, z = p.z + 0.5 - dz * back, g = groundAt(x, z, p.y + 1.5, 0, map);
    if (g.s && !g.s.fluid && Math.abs(g.h - p.y) < 1.2) return { x, y: g.h, z };
  }
  return arrivalPoint(p);
}
export function backBeforeTrial(message) {
  const t = state.map.trial, cubes = state.cubes;
  // the trial room as it was; playing together, it goes on for the others there (as they have it)
  if (!mirroring() && !online.buddies.some(b => b.here && !b.out && b.hp > 0)) { restoreVisit(state.visit); restartTrial(); }
  state.transitioning = true;
  cancelSword(true); cancelCast();
  fadeOut();
  const done = () => { state.transitioning = false; if (message) setStatus(tr(message)); };
  setTimeout(() => whenReady(cubes.get(t.from)).then(c => {
    if (state.cubes !== cubes) return;
    enterCube(c, t.fromDir);
    const p = c.map.portals.find(q => q.kind === 'side' && q.dir === t.fromDir), at = respawnPoint(besidePortal(c.map, t.fromDir));
    state.arrival = at;
    spawnAt(at.x, at.y, at.z);
    player.yaw = Math.atan2(DIRS[t.fromDir][0], DIRS[t.fromDir][1]);
    player.hp = player.maxHp; clearEffects(player);
    if (p) state.portalLock = p.id;
    done();
  }, () => {   // the room before does not come: back where this one was entered
    if (state.cubes !== cubes) return;
    resetEnemies(); spawnEntry(); done();
  }), 380);
}

// Discovering a cube opens side faces towards cubes already discovered. It can also join
// two sections elsewhere (the room between them was the last one missing), so all
// discovered cubes are checked again.
export function discover(c) {
  if (isTestRoom(c.key)) { c.visits++; return false; }   // a dev test room: nobody else's business
  if (!c.visits++) relay.visited?.(c.key);   // playing together: the friend's map shows it too
  if (!isInterior(c.key)) questEvent({ kind: 'visit', depth: depthOf(c.key) });   // how deep anyone got (game/quests.js)
  return openDiscoveredFaces();
}

// Playing together, the friend discovered cube k (net/session.js): it is discovered here too,
// on the minimap and for the faces it opens (once its map is here: it may still have to be made)
// learn: network.html#apart (see learn/README.md)
export function shareVisit(k) {
  const cubes = state.cubes;
  if (!isInterior(k)) questEvent({ kind: 'visit', depth: depthOf(k) });
  cubes.map(k).then(c => {
    if (state.cubes !== cubes || c.visits) return;
    c.visits = 1;
    if (openDiscoveredFaces() && state.world) setWorldOpenFaces(state.world, openedSides(state.openedFaces, state.cubeKey));
    updateNeighbors();
  }, () => {});
}
export const visitedKeys = () => [...state.cubes.cubes.values()].filter(c => c.visits).map(c => c.key);

// Playing together, the friend opened these side faces (a gate they went through, a portal
// that became an open wall): open here too, so either can walk across where the other did
// learn: network.html#apart (see learn/README.md)
export function shareFaces(keys) {
  const before = state.openedFaces.size;
  for (const k of keys) state.openedFaces.add(k);
  if (state.openedFaces.size === before) return;
  if (state.world) setWorldOpenFaces(state.world, openedSides(state.openedFaces, state.cubeKey));
  updateNeighbors();
}

function openDiscoveredFaces() {
  const before = state.openedFaces.size, cubes = state.cubes.cubes;
  for (const c of cubes.values()) if (!isInterior(c.key)) for (const f of discoveredFaces(cubes, c, state.run)) state.openedFaces.add(f);
  return state.openedFaces.size !== before;
}

// A gate unlocked in the cube we are in may join sections discovered earlier (and a trial
// resolved no longer keeps its room to its portals: its glass stops glowing).
export function refreshOpenFaces() {
  const opened = openDiscoveredFaces();
  if (!state.world) return;
  if (opened) setWorldOpenFaces(state.world, openedSides(state.openedFaces, state.cubeKey));
  setGlassShut(state.world.glass, portalsOnly(state.map, state.run));
  updateNeighbors();
}

// which portals lead somewhere already explored
export const portalSeen = (k, m) => Object.fromEntries(m.portals.map(p => [p.id, p.kind !== 'spawn' && !!state.cubes.cubes.get(step(k, p.dir))?.visits]));

// enter cube c (a ready cube from the world client), arriving through its portal on face
// `from` (null: the spawn pad). `back`: returning to a cube left by a fall, with the
// entry and visit it had then (see game/fall.js). `at`: arriving at that point instead (the
// town portal, game/townportal.js)
// learn: architecture.html#cube-journey (see learn/README.md)
export function enterCube(c, from = null, back = null, at = null) {
  const k = c.key;
  endHandover();   // (a cube walked out of still dissolving: game/handover.js)
  // back in town from out there: the Smith has forged new armor (core/shops.js smithStock)
  if (c.map.town && state.map && !state.map.town && !state.map.interior) state.run.smith = { visit: state.run.smith.visit + 1, sold: [] };
  devShores(c.map);
  if (!back) discover(c);
  // (a cut, behind the curtain: what was in the air was in the old cube's place)
  clearParticles(); clearFloatText();
  state.cubeKey = k; state.map = c.map; state.lookDepth = c.map.depth;
  disposeWorld(state.world);
  state.world = buildCube(c);
  setGlassShut(state.world.glass, portalsOnly(c.map, state.run));
  enterTrial(c.map);   // its trial, as built (or resolved for good: game/trials.js)
  if (back) {
    const { arrival, portalLock, boundaryLock, visit } = back;
    Object.assign(state, { arrival, portalLock, boundaryLock, visit });
  } else if (at) {
    state.arrival = { x: at.x, y: at.y, z: at.z };
    state.portalLock = 0; state.boundaryLock = -1;
    beginVisit();
  } else {
    const p = c.map.portals.find(q => from === null ? q.kind === 'spawn' : q.dir === from);
    // (none: a town's tile without the spawn, docs/town.md: on its safe ground nearest the middle)
    state.arrival = p ? arrivalPoint(p) : middleOf(c.map);
    state.portalLock = p && !isFaceOpen(state.openedFaces, k, p.dir) ? p.id : 0;
    state.boundaryLock = p?.kind === 'side' ? p.dir : -1;
    beginVisit();
  }
  resetEnemies();
  const hp = player.hp;
  state.arrival = respawnPoint(state.arrival);
  spawnAt(state.arrival.x, state.arrival.y, state.arrival.z);
  player.hp = hp;
  settleIn();
  fadeIn();
  noticeQuestGoals();
}

// HUD and neighbours for the cube we are in now
// learn: architecture.html#cube-journey (see learn/README.md)
export function settleIn(neighbors = true) {
  const c = state.cubes.cubes.get(state.cubeKey);
  showStats(c.map, state.cubeKey, state.cubes.seed, c.visits);
  // the first time this deep: into the chronicle, and the first of an act (or the core) gets its jingle
  const deeper = noteDepth(c.map, state.cubes.seed);
  if (deeper) actJingle(c.map.depth);
  arrived(c.map, state.cubeKey, c.visits, deeper);   // what the narrator has to say about it (game/narrator.js)
  robotArrived();   // woken before, the robot comes in with us; else it may lie asleep at the crash (game/robot.js)
  if (neighbors) showNeighbors(visitedNeighbors(state.cubeKey));
  if (gateLocked(state.map, state.run)) setStatus(guardianLockMessage(state.map, guardianKind(state.map)));
  c.ready = true;
  prefetchAround(c);
}

// The town (world/town.js, docs/town.md) is known from the start: all its tiles count as visited
// (on the map, drawn round the hero, the seams between them open), once their maps are here. Its
// tiles are made and loaded ahead, so walking from one into the next (game/handover.js) is at once.
function knowTown() {
  const cubes = state.cubes;
  for (const k of cubes.town.keys) cubes.map(k).then(c => {
    if (state.cubes !== cubes || c.visits) return;
    c.visits = 1;
    if (openDiscoveredFaces() && state.world) setWorldOpenFaces(state.world, openedSides(state.openedFaces, state.cubeKey));
    updateNeighbors();
  }, () => {});
}
export function prefetchTown() {
  const cubes = state.cubes;
  if (!cubes || cubes.townAsked) return;
  cubes.townAsked = true;
  for (const k of cubes.town.keys) cubes.get(k, { urgent: false }).then(c => { c.ready = true; }, () => { cubes.townAsked = false; });
}
// The cubes behind the open faces got ready (loaded, warmed: world/client.js), so walking across
// into one (game/handover.js) is at once: asked once each, until it is
export function readyAhead(keys) {
  const cubes = state.cubes;
  if (!cubes) return;
  const asked = cubes.readying ??= new Set();
  for (const k of keys) {
    if (cubes.cubes.get(k)?.ready || asked.has(k)) continue;
    asked.add(k);
    cubes.get(k, { urgent: false }).then(c => { c.ready = true; asked.delete(k); }, () => asked.delete(k));
  }
}

// the jingle of the act (themes/index.js ACTS) that starts at depth d, or of the core
function actJingle(d) {
  const act = ACTS.findIndex(a => a?.[0] === d);
  if (act > 0) jingle(`act${act}`);
  else if (d === MAX_DEPTH) jingle('core');
}

const beyond = (c, take) => (c.map.portals || []).filter(take).map(p => step(c.key, p.dir));
// Get the cubes behind our portals (and doors) ready in the background, shaders and all
// (world/client.js). One step further, what the cubes behind the ways down (and up) from those
// show is loaded too: a new depth's models are in by the time you stand at its well.
// Only once the cube we are in is baked and no travel goes on (at most AHEAD_WAIT ms): warming
// the next cubes compiles their shaders and builds each once, and that work landing on the
// arrival held its first frames up.
const AHEAD_WAIT = 4000;
function prefetchAround(c, since = performance.now()) {
  if ((state.transitioning || !baked(state.world)) && performance.now() - since < AHEAD_WAIT) {
    setTimeout(() => { if (state.cubeKey === c.key) prefetchAround(c, since); }, 100);
    return;
  }
  if (c.map.town) prefetchTown();   // (the town's other tiles: walked into without a portal)
  // (and the cubes behind its open faces, walked into without a portal too)
  readyAhead([0, 1, 2, 3].filter(d => isFaceOpen(state.openedFaces, c.key, d)).map(d => step(c.key, d)));
  const cubes = state.cubes, near = [...beyond(c, p => p.kind !== 'spawn'), ...(c.map.doors || []).map(d => d.to)];
  cubes.prefetch(near);
  for (const k of near) cubes.map(k).then(n => {
    if (state.cubes === cubes && state.cubeKey === c.key) cubes.prefetch(beyond(n, p => p.kind === 'down' || p.kind === 'up').filter(k => k !== c.key), { warm: false });
  }, () => {});
}

// Visited cubes within the render budget, on the active stratum only, and nothing else: no
// feature shows a cube before you have been in it (docs/world.md, "Only where you have been").
export function visitedNeighbors(k) {
  if (!state.showNeighbors || isInterior(k)) return [];   // inside a house: nothing around
  // (landmarks show in the surroundings too: they are what you find your way by)
  // (the town's tiles: one place under one glass; from inside it half as dim, docs/town.md)
  const inTown = !!state.cubes.cubes.get(k)?.map.town;
  return discoveredCubes(state.cubes.cubes, k).map(c => {
    const map = state.cubes.cubes.get(c.key).map;
    return { ...c, open: openedSides(state.openedFaces, c.key), shut: portalsOnly(map, state.run),
      landmarks: shownFar(map), seams: map.seams ?? null, dim: inTown && map.town ? NEIGHBOR_DIM.town : NEIGHBOR_DIM.world };
  });
}

export function updateNeighbors() {
  // Travel owns detached proxy sets; do not build a third set while it runs.
  if (!state.transitioning) showNeighbors(visitedNeighbors(state.cubeKey));
}

// A cube is entered once the prop sets it shows are in (WorldClient.get, render/cubeassets.js).
// One built without some (one failed to load and came later): build it again, now with them.
// The props' colliders come from the catalog, so they stay where they were.
onPropSet(set => {
  if (!state.world?.missingSets.includes(set) || state.transitioning) return;
  rebuildWorld();
});
// Cube c built as it is now: the people living there and what the quests put there
// (game/questworld.js), its portals into trial rooms not resolved yet warning of them
// (game/trials.js), its portals and faces as they stand (open: its sides open, if not as they
// stand now). The cube played in, and one baked ahead (game/bakeahead.js): built the same way, so
// the bake made ahead is the one it takes.
export function buildCube(c, open = openedSides(state.openedFaces, c.key)) {
  const k = c.key, m = c.map;
  questWorld(m);
  warnTrials(m);
  return buildWorld(m, state.showPath, portalSeen(k, m), c.geo, open, gateLocked(m, state.run), townPadIn(m, state.run), state.run.chests);
}

// the cube we are in, built again as it is now (its props, the quests' part: game/questworld.js)
export function rebuildWorld() {
  const c = state.cubes.cubes.get(state.cubeKey);
  if (c?.map !== state.map) return;
  disposeWorld(state.world);
  state.world = buildCube(c);
  setGlassShut(state.world.glass, portalsOnly(c.map, state.run));
  refreshTrialView();
}

// keepPlayer: the player keeps their character (level, bag, gear); joining a friend's world
// (src/net/session.js), or a saved hero (game/save.js). restore: a saved world's progress
// (game/save.js restoreOf): { name, level, run, faces, visited, spot }; spot: { cube, arrival } where to
// come in (else the town's spawn pad). level: the world's level (core/enemies.js depthLevel): a
// saved world's, else 1 (dev: ?worldlevel=)
export function newWorld(seed = (Math.random() * 1e9) >>> 0, { keepPlayer = state.keepHero, restore = null, level = restore?.level ?? null } = {}) {
  endHandover();
  clearNeighbors(); clearNeighborCache();
  state.cubes?.dispose();
  const params = new URLSearchParams(location.search);
  // dev: ?arche=<archetype> everywhere, ?theme=clouds,forge picks those themes for their depths,
  // ?bridge=chain / ?ladder=vine one bridge / ladder style wherever it fits, ?trial=flood a trial on every depth
  level ??= state.dev && Number(params.get('worldlevel')) || 1;
  state.cubes = new WorldClient(seed, { level, load: cubeAssets, warm: warmCube, lightmap: bakeDensity(), arche: state.dev && params.get('arche'),
    themes: state.dev && params.get('theme') ? params.get('theme').split(',') : [],
    bridge: state.dev && params.get('bridge'), ladder: state.dev && params.get('ladder'),
    trial: state.dev && params.get('trial') || null });   // ?trial=flood: every depth gets one (world/trials.js)
  // the colours of its fluids (themes/fluids.js; dev: ?palette=classic the old look everywhere,
  // ?palette=<seed> another world's)
  const pal = state.dev && params.get('palette');
  if (pal === 'classic') setFluidPalettes();
  else setFluidPalettes(pal && Number.isFinite(+pal) ? +pal >>> 0 : seed, state.cubes.layout.themes);
  state.openedFaces.clear(); state.boundaryLock = -1; state.fallFrom = null;
  state.transitioning = true;
  cancelSword(true);
  clearInput();
  forgetDeath();   // ("You died" not answered: game/deathask.js)
  stopNarrator(); forgetRobot();
  if (!keepPlayer) Object.assign(player, createPlayerStats(state.dev, { armed: state.dev }));   // (empty-handed: core/intro.js)
  state.run = createRun(); state.inventoryOpen = false;
  if (restore) restoreRun(restore);
  // the beginning (game/intro.js): done already in a world saved before it, and with the dev tools
  settleIntro(state.run, state.cubes.layout(0), restore?.visited, state.dev, params);
  log('world', restore?.name ? { seed, name: restore.name, level: state.cubes.level } : { seed, level: state.cubes.level });
  // a saved spot whose cube does not come (the generator changed): the town instead
  const cubes = state.cubes, spot = restore?.spot;
  const first = spot ? cubes.get(spot.cube).catch(() => cubes.get(cubes.start)) : cubes.get(cubes.start);
  // the villagers are a nicety: a failure to load them (logged) does not hold the game up
  // (and the shaders of what hides in the scene until used: particles, the portal cloud)
  return whenReady(Promise.all([first, syncEquippedWeapon(),
    villagersReady.catch(() => null), warmScene()]))
    .then(([c]) => {
      if (state.cubes !== cubes) return;
      slowFade();   // the world comes up slowly the first time (game/hud.js)
      // (a new hero in a world nobody has been in comes out of the inn: game/intro.js)
      const inn = !spot && innArrival(c.map, state.run, restore?.visited);
      if (spot && c.key === spot.cube) enterCube(c, null, null, spot.arrival);
      else if (inn) { enterCube(c, null, null, inn); player.yaw = inn.yaw; }
      else enterCube(c);
      state.transitioning = false;
      knowTown();
      if (inn) comeOutOfInn(inn);
      if (restore) for (const k of restore.visited) shareVisit(k);   // the map comes back, nearest first
    });
}

// a saved world's progress into the fresh run (newWorld); deepest: how deep anyone got there
function restoreRun({ run, faces, visited, deepest = 0 }) {
  const r = state.run;
  for (const id of run.defeated) r.defeated.add(id);
  for (const k of run.gates) r.unlockedGates.add(k);
  for (const id of run.chests) r.chests.add(id);
  for (const s of run.dropped) r.dropped.add(s);
  r.clock = run.clock; r.kills = unpackKills(run.kills);
  for (const [k, n] of run.trials || []) r.trials.set(k, n);
  r.townPortal = run.townPortal;
  r.smith = checkSmith(run.smith);
  for (const id of run.told ?? []) r.told.add(id);
  for (const id of run.met ?? []) r.met.add(id);
  r.quests = checkQuestLog(run.quests);
  r.quests.deepest = Math.max(r.quests.deepest, deepest);
  takeLoot(run.loot);
  for (const k of visitedFaces(faces, new Set(visited))) state.openedFaces.add(k);
}

// Back to the main menu (game/menu.js): the world goes, and nothing of it stays in the scene
export function endWorld() {
  cancelSword(true); cancelCast(); clearInput(); forgetDeath(); stopNarrator(); forgetRobot();
  removeEnemyViews(detachEnemies());
  clearNeighbors(); clearNeighborCache();
  disposeWorld(state.world); state.world = null;
  enterTrial(null);
  state.cubes?.dispose(); state.cubes = null;
  Object.assign(state, { map: null, cubeKey: '', arrival: null, visit: null, fallFrom: null, cast: null, portalCharge: null,
    portalLock: 0, boundaryLock: -1, inventoryOpen: false, transitioning: false, run: createRun() });
  state.openedFaces.clear();
}

export function nextCube() {
  if (state.transitioning) return;
  if (online.role === 'guest') { setStatus(tr('Only the host starts a new world')); return; }
  state.transitioning = true;
  fadeOut();
  const level = worldLevel();   // (the dev tool's N: a new world of the same level)
  setTimeout(() => newWorld(undefined, { level }).then(() => setStatus(tr('A new world'))), 380);
}
export const loadCube = () => newWorld(state.baseSeed);

// (dev: what of the cube breaks the rules its fluids are drawn by, render/shore.js shoreIssues;
// once a cube)
const shoresChecked = new Set();
export function devShores(m) {
  if (!state.dev || shoresChecked.has(m.key)) return;
  shoresChecked.add(m.key);
  const issues = shoreIssues(m);
  if (issues.length) console.warn(`${m.key}: ${issues.length} shore issue(s)\n` + issues.join('\n'));
}

// Every species participates in combat, collision, loading and portal travel.
// Playing together, a cube's enemies are run by one of the players there (net/foes.js) and go
// after any of them (game/party.js); the others have none of their own, they are shown the
// runner's (mirrorEnemies) and fight those.
import { spiders, resetSpiders, updateSpiders, detachSpiders } from './spiders.js';
import { stunders, resetStunders, updateStunders, detachStunders } from './stunders.js';
import { snakes, resetSnakes, updateSnakes, detachSnakes } from './snakes.js';
import { octonauts, resetOctonauts, updateOctonauts, detachOctonauts } from './octonauts.js';
import { fireFaces, resetFireFaces, updateFireFaces, detachFireFaces } from './firefaces.js';
import { triangles, resetTriangles, updateTriangles, detachTriangles } from './triangles.js';
import { fireCats, resetFireCats, updateFireCats, detachFireCats } from './firecats.js';
import { shraps, resetShraps, updateShraps, detachShraps } from './shraps.js';
import { spicies, resetSpicies, updateSpicies, detachSpicies } from './spicy.js';
import { wollas, resetWollas, updateWollas, detachWollas } from './wolla.js';
import { wolks, resetWolks, updateWolks, detachWolks } from './wolk.js';
import { gustos, resetGustos, updateGustos, detachGustos } from './gusto.js';
import { totnars, resetTotnars, updateTotnars, detachTotnars } from './totnar.js';
import { squarlos, resetSquarlos, updateSquarlos, detachSquarlos } from './squarlo.js';
import { squirtles, resetSquirtles, updateSquirtles, detachSquirtles } from './squirtles.js';
import { meckeds, resetMeckeds, updateMeckeds, detachMeckeds } from './mecked.js';
import { tornados, resetTornados, updateTornados, detachTornados } from './tornado.js';
import { slugs, resetSlugs, updateSlugs, detachSlugs } from './slugs.js';
import { bolimes, resetBolimes, updateBolimes, detachBolimes } from './bolimes.js';
import { flimmers, resetFlimmers, updateFlimmers, detachFlimmers } from './flimmers.js';
import { passEngulfers } from './engulf.js';
import { drawAllMeteors, clearMeteors } from './meteors.js';
import { updateTide, resetTide, drownEnemies, floatSwimmers, walkOnLava } from './tide.js';
import { flips, resetFlips, updateFlips, detachFlips } from './flip.js';
import { foggerys, resetFoggerys, updateFoggerys, detachFoggerys } from './foggery.js';
import { renews, resetRenews, updateRenews, detachRenews } from './renew.js';
import { slomos, resetSlomos, updateSlomos, detachSlomos } from './slomo.js';
import { mansks, resetMansks, updateMansks, detachMansks, manskSeen } from './mansk.js';
import { monteurs, resetMonteurs, updateMonteurs, detachMonteurs } from './monteur.js';
import { followRoll } from './roll.js';
import { qualmoses, resetQualmoses, updateQualmoses, detachQualmoses } from './qualmos.js';
import { updateRewind, resetRewind, drawRewind } from './rewind.js';
import { resetMovers } from './movers.js';
import { updateFlipWorld, updateBlackHoles, resetFlipWorld, turning } from './flipworld.js';
import { clearBlackHoles } from '../render/flipview.js';
import { STAGE_PROFILES, enemyName, enemyWords } from '../core/enemies.js';
import { contactEnemies, resetEnemyCombat, updateBurning, updateChill, updateToxic } from './enemycombat.js';
import { stepEnemies, stepCalls, resetCalls } from './enemyai.js';
import { spawnLineup } from './devspawn.js';
import { removeEnemyViews } from '../render/enemies.js';
import { updateProjectiles, drawAllProjectiles, clearProjectiles } from './projectiles.js';
import { updateBeams, drawAllBeams, clearBeams } from './beams.js';
import { updateGusts } from './gusts.js';
import { updateTwisters, clearTwisters, twisters } from './twisters.js';
import { drawTwisters } from '../render/twisters.js';
import { updateQuakes, drawQuakes, clearQuakes } from './quakes.js';
import { drawJets, clearJets } from '../render/giantfx.js';
import { hitWithSword } from './sword.js';
import { updateShots, drawAllShots, clearShots } from './shots.js';
import { updateThrows, drawThrows, clearThrows } from './throws.js';
import { updateEnemyStatuses } from './statuses.js';
import { animateEnemies } from '../render/enemies.js';
import { player, state, setStatus, worldPaused } from './state.js';
import { awardKill } from '../core/progression.js';
import { liveAgain, shareKill } from '../core/respawn.js';
import { dropLoot } from './loot.js';
import { coordinateDefence } from './defence.js';
import { createHordeGroups, coordinateHordes } from './hordes.js';
import { setGuardianGate } from '../render/world.js';
import { refreshOpenFaces } from './flow.js';
import { sfx } from '../audio/sfx.js';
import { jingle } from '../audio/jingles.js';
import { party, nearestTo } from './party.js';
import { relay, online } from '../net/online.js';
import { log } from './log.js';
import { questEvent } from './quests.js';
import { groundAt } from '../physics/collide.js';
import { walkable } from '../physics/enemynav.js';
import { tr } from '../i18n/i18n.js';
import { narrate } from './narrator.js';

let defenceThink = 0, hordeGroups = [];

// coming into a cube (or back after a death), enemies hold their attacks this long, or until
// you land a hit: a bad spawn spot is not an instant beating
// learn: enemies.html#fair (see learn/README.md)
export const ENTRY_GRACE = 1.2;

// enemies spawned with the dev tools (game/devspawn.js), of any species; gone when the cube resets
let spawned = [];
export function addEnemies(list) { spawned.push(...list); }
// those of them `gone` picks leave (a raid called off, game/defense.js), without a reward
export function removeEnemies(gone) {
  const out = spawned.filter(gone);
  if (!out.length) return;
  spawned = spawned.filter(e => !gone(e));
  removeEnemyViews(out);
}

// Shown another player's enemies (net/foes.js Viewer): { list, apply(dt), reset() }. `list` is
// the runner's enemies in this cube, shown here; apply puts them where the runner says they are
// (a little in the past, like the friends), reset asks the runner for this cube's list again.
let mirror = null;
export const mirroring = () => !!mirror;
export function mirrorEnemies(m) {
  if (m && !mirror) {   // our own go
    const own = detachEnemies();
    removeEnemyViews(own);
    mirror = m;
    resetEnemies();
  } else if (!m && mirror) {   // and come back
    removeEnemyViews(mirror.list);
    clearProjectiles(); clearBeams(); clearQuakes(); clearTwisters();
    mirror = null;
    if (state.map) resetEnemies();
  }
}

export const allEnemies = () => mirror ? mirror.list : [...spiders, ...stunders, ...snakes, ...octonauts, ...fireFaces, ...triangles, ...fireCats, ...shraps, ...spicies, ...wollas, ...wolks, ...squirtles, ...meckeds, ...tornados, ...slugs, ...bolimes, ...flimmers, ...gustos, ...totnars, ...squarlos, ...flips, ...foggerys, ...renews, ...slomos, ...mansks, ...monteurs, ...qualmoses, ...spawned];
export function resetEnemies() {
  resetFlipWorld(); clearBlackHoles();   // (Flip's box the right way up again: game/flipworld.js)
  resetEnemyCombat(); clearProjectiles(); clearBeams(); clearQuakes(); clearTwisters(); clearJets(); clearShots(); clearThrows(); clearMeteors(); resetCalls();
  state.dark = 0; state.mist = 0; resetTide(); resetMovers();   // (Foggery's platforms back under his lava, game/movers.js)
  resetRewind();   // (Renew's time: the hero's tape and echoes, game/rewind.js)
  removeEnemyViews(spawned); spawned = [];
  state.enemyGrace = ENTRY_GRACE;
  if (mirror) { removeEnemyViews(mirror.list); mirror.list = []; mirror.reset(); return; }
  resetSpiders(); resetStunders(); resetSnakes(); resetOctonauts(); resetFireFaces(); resetTriangles(); resetFireCats(); resetShraps(); resetSpicies(); resetWollas(); resetWolks(); resetSquirtles(); resetMeckeds(); resetTornados(); resetSlugs(); resetBolimes(); resetFlimmers(); resetGustos(); resetTotnars(); resetSquarlos(); resetFlips(); resetFoggerys(); resetRenews(); resetSlomos(); resetMansks(); resetMonteurs(); resetQualmoses();
  spawnLineup();   // a dev test room's every kind (game/devspawn.js)
  for (const e of allEnemies()) liveAgain(state.run, e);   // those come back in a life of their own (core/respawn.js)
  defenceThink = 0;
  hordeGroups = createHordeGroups(state.map, allEnemies());
  coordinateDefence(state.map, state.run, allEnemies(), player);
  hordeBroken();
}
// The horde of this cube is broken (every one of it defeated, now or before): the quests hear
// of it (game/quests.js). Only where we run the enemies: those we are shown are another's.
function hordeBroken() {
  const group = hordeGroups[0];
  if (!mirror && state.map?.horde && group && group.members.every(e => e.mode === 'dead')) questEvent({ kind: 'horde', key: state.cubeKey });
}
// Every enemy that died since the last look: its XP, and its loot dropped. Playing together,
// every player there gets the XP, whoever struck the blow: each game looks at its own enemies
// (or at the ones it is shown). The loot is shared: only the killer's game drops it
// (droppedHere). Truthy (the guardian's name): a guardian's gate opened.
// learn: architecture.html#swing-journey, code.html#loops (see learn/README.md)
function awardKills(list) {
  let xp = 0, levels = 0, killed = 0, unlocked = false, boss = false, beaten = null;
  for (const e of list) {
    const reward = awardKill(player, state.run, e);
    if (reward) {
      xp += reward.xp; levels += reward.levels; killed++;
      if (droppedHere(e)) dropLoot(e, reward.coins);
      if (e.guardianGate) {
        unlocked = enemyName(e.profile);
        boss ||= e.guardianRole === 'descent';   // a boss (a real one or a Temp Boss): his jingle
        log('guardian', { label: enemyWords(e.profile), level: e.level, depth: state.map.depth, boss: !!e.boss }, { share: true });
        if (e.boss) beaten = e.boss; else if (e.guardianRole === 'side') narrate('guardian', { what: 'beaten' });
      }
      relay.defeated?.(e);
    }
  }
  if (killed) {
    setStatus([unlocked ? tr('{name} defeated · Gate unlocked!', { name: unlocked }) : tr('{n, plural, one {Defeated # enemy} other {Defeated # enemies}}', { n: killed }),
      tr('+{xp} XP', { xp }), ...levels ? [tr('Level {level}!', { level: player.level })] : []].join(' · '));
    log('kill', { count: killed, xp });
    if (!beaten) narrate('kill', { many: killed >= 3 });   // (a boss beaten: she has more to say about him)
  }
  if (levels) log('level', { level: player.level }, { share: true });
  if (killed) hordeBroken();
  if (unlocked) { setGuardianGate(state.world, false); refreshOpenFaces(); }
  // a boss's jingle (audio/jingles.js: the music turned down under it), a level gained after it
  // (it waits its turn)
  const victory = boss ? jingle('victory') : 0;
  if (!victory && unlocked) sfx('unlock');
  if (levels && !jingle('levelup')) sfx('levelUp');
  if (levels) narrate('level');
  // the narrator on the boss beaten, once his jingle has mostly played (game/narrator.js)
  if (beaten) narrate('beaten', { boss: beaten }, { delay: victory * 0.7 });
  return unlocked;
}
// Does this game drop e's loot? Its killer's does: whoever hit it last (game/sword.js; null:
// we did). The game that runs the enemies drops it for a killer who is not here any more.
function droppedHere(e) {
  const k = e.lastHit;
  return k == null || k === online.slot || !mirror && !online.buddies.some(b => b.slot === k && b.here);
}

// Playing together, another player defeated enemy `id` somewhere else (net/session.js): it stays
// defeated here too (no reward: that was theirs), and a guardian's gate opens. life: { cube, n } of
// one that comes back (core/respawn.js): it comes back here too. One that is
// here with us we see die ourselves.
// learn: network.html#apart (see learn/README.md)
export function shareDefeat(id, gate, life = null) {
  if (allEnemies().some(e => e.id === id)) return;
  state.run.defeated.add(id);
  if (life) shareKill(state.run, id, life.cube, life.n);
  if (!gate || state.run.unlockedGates.has(gate)) return;
  state.run.unlockedGates.add(gate);
  if (gate === state.cubeKey) setGuardianGate(state.world, false);
  refreshOpenFaces();
}

// Playing together, a cube's enemies change hands when the two players meet or part
// (net/session.js): the other game's enemies as they were ({ id, x, y, z, yaw, hp, mode }).
// Ours (just come into the cube) take their places, health and fight; any the other game
// does not have any more went there (no reward: their health is not 0).
// learn: network.html#apart (see learn/README.md)
export function adoptEnemies(states) {
  const byId = new Map(states.map(s => [s.id, s]));
  for (const e of allEnemies()) {
    if (!e.id || e.mode === 'dead') continue;
    const s = byId.get(e.id);
    if (!s || s.mode === 'dead' || s.hp <= 0) { e.mode = 'dead'; e.deadT = Infinity; continue; }
    e.hp = Math.min(e.hp, s.hp);
    const f = groundAt(s.x, s.z, s.y + 0.3, 0).s;
    if (f && walkable(f, e.profile.height)) Object.assign(e, { x: s.x, y: s.y, z: s.z, f });
    e.yaw = s.yaw; e.path = null;
    if (['chase', 'attack', 'alert'].includes(s.mode)) { e.mode = 'chase'; e.think = 0; }
  }
}

// learn: architecture.html#swing-journey (see learn/README.md)
export function updateEnemies(dt) {
  if (worldPaused() || state.transitioning) return;
  if (mirror) { followEnemies(dt); return; }
  state.enemyGrace = Math.max(0, state.enemyGrace - dt);
  const list = allEnemies();
  hitWithSword(list); // a connecting sword strike can interrupt an enemy's wind-up
  updateShots(dt, list);   // and so can the player's arrows, bolts and spells
  updateThrows(dt, list);  // and flasks; their fire and poison burn on (game/statuses.js)
  updateEnemyStatuses(list, dt);
  const unlocked = awardKills(list);
  if ((defenceThink -= dt) <= 0 || unlocked) {
    defenceThink = .25;
    // a guardian's room and a horde mind whichever player is nearest
    coordinateDefence(state.map, state.run, list, state.map.guardian ? nearestTo(state.map.guardian.x, state.map.guardian.z) : player);
  }
  const horde = hordeGroups[0], bodies = party();
  if (coordinateHordes(hordeGroups, horde && bodies.length > 1 ? nearestTo(horde.anchor.x, horde.anchor.z, bodies) : player, dt)) { setStatus(tr('Horde awakened!')); log('horde'); jingle('horde'); narrate('horde'); }
  stepCalls(dt);
  // Flip's world turning (game/flipworld.js): everything in it turns with it
  updateFlipWorld(list, dt);
  updateSpiders(dt); updateStunders(dt); updateSnakes(dt); updateOctonauts(dt);
  updateFireFaces(dt); updateTriangles(dt); updateFireCats(dt); updateShraps(dt); updateSpicies(dt); updateWollas(dt); updateWolks(dt); updateSquirtles(dt); updateMeckeds(dt); updateTornados(dt); updateSlugs(dt); updateBolimes(dt); updateFlimmers(dt); updateGustos(dt); updateTotnars(dt); updateSquarlos(dt); updateFlips(dt); updateFoggerys(dt); updateRenews(dt); updateSlomos(dt); updateMansks(dt); updateMonteurs(dt); updateQualmoses(dt);
  stepEnemies(spawned, dt);
  spawned = spawned.filter(e => e.mode !== 'dead' || e.deadT < e.profile.corpseTime || (removeEnemyViews([e]), false));
  // a boss's tide (game/tide.js): it drowns, but those that swim float (and the fluid dwellers
  // float in any fluid of theirs)
  updateTide(allEnemies(), dt);
  if (state.tide != null) drownEnemies(allEnemies());
  floatSwimmers(allEnemies());
  updateProjectiles(dt); updateBeams(dt); updateQuakes(allEnemies(), dt); updateGusts(allEnemies(), dt); updateTwisters(allEnemies(), dt); updateBlackHoles(allEnemies(), dt); updateBurning(dt); updateChill(dt); updateToxic(dt);
  passEngulfers(allEnemies());   // a Bolime that came down on nobody spits out at once (game/engulf.js)
  if (!turning()) contactEnemies(allEnemies(), dt);   // (all frozen while Flip's world turns)
  // (last: whatever moved them, those lava does not burn stand on it, game/tide.js)
  if (state.tide != null) walkOnLava(allEnemies());
  state.dark = darkness(allEnemies()); state.mist = misty(allEnemies());
  updateRewind(dt, allEnemies());   // Renew's time, as our hero lives it (game/rewind.js)
  manskSeen(allEnemies());   // Mansk's slowed time, as our hero lives it (game/mansk.js)
  followRoll(allEnemies());   // the world as Monteur turned it, on our screen (game/roll.js)
}
// a boss keeping the cube dark (Totnar, game/totnar.js; shown one, its `dark` comes with it)
const darkness = list => list.some(e => e.dark && e.mode !== 'dead') ? 1 : 0;
// a boss growing into another stage in a fog (Squarlo, game/squarlo.js)
const misty = list => list.some(e => e.mode === 'split' && e.boss === 'squarlo' && STAGE_PROFILES[e.boss]) ? 1 : 0;
// shown another player's enemies: the runner moves them; we fight them (our hits go to the
// runner, game/sword.js) and get our XP and loot from those that die
function followEnemies(dt) {
  mirror.apply(dt);
  const list = mirror.list;
  updateFlipWorld(list, dt, false);
  hitWithSword(list); updateShots(dt, list); updateThrows(dt, list);
  awardKills(list);
  updateProjectiles(dt); updateQuakes(list, dt, false); updateGusts(list, dt, false); updateTwisters(list, dt, false); updateBlackHoles(list, dt, false); updateBurning(dt); updateChill(dt); updateToxic(dt);
  if (!turning()) contactEnemies(list, dt, false);
  updateTide(list, dt);
  state.dark = darkness(list); state.mist = misty(list);
  updateRewind(dt, list);
  manskSeen(list);
  followRoll(list);
}
export function drawEnemies(dt, off = { x: 0, y: 0, z: 0 }) {
  animateEnemies(allEnemies(), dt, off); drawAllProjectiles(dt, off); drawAllBeams(dt, off); drawQuakes(dt, off); drawTwisters(twisters, dt, off); drawJets(dt);
  drawAllShots(dt, off); drawThrows(dt, off); drawRewind(dt, off); drawAllMeteors(dt, off);
}
function detachSpawned() { const list = spawned; spawned = []; return list; }
// projectiles and shots in flight do not travel along
export function detachEnemies() {
  clearProjectiles(); clearBeams(); clearQuakes(); clearTwisters(); clearJets(); clearShots(); clearThrows(); hordeGroups = [];
  if (mirror) { const list = mirror.list; mirror.list = []; return list; }
  return [...detachSpiders(), ...detachStunders(), ...detachSnakes(), ...detachOctonauts(),
    ...detachFireFaces(), ...detachTriangles(), ...detachFireCats(), ...detachShraps(), ...detachSpicies(), ...detachWollas(), ...detachWolks(), ...detachSquirtles(), ...detachMeckeds(), ...detachTornados(), ...detachSlugs(), ...detachBolimes(), ...detachFlimmers(), ...detachGustos(), ...detachTotnars(), ...detachSquarlos(), ...detachFlips(), ...detachFoggerys(), ...detachRenews(), ...detachSlomos(), ...detachMansks(), ...detachMonteurs(), ...detachQualmoses(), ...detachSpawned()];
}

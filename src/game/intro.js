// The beginning (core/intro.js, docs/story.md "The beginning"): the glassmaker's old sword stuck in
// the ground by the crash in town, his first glass on top of the rock in the room past the town's
// gate, and his glass further on. They are drawn like a quest's things (render/loot.js: glowing gold, always
// labelled; clicked, the hero walks there), and walking onto one takes it:
// - a glass breaks and its recording plays (game/narrator.js): the rock's opens the memories (the
//   inventory's Memories tab, game/memorypanel.js) and the rock's gate on along the road;
// - the sword goes into the bag (in hand, if nothing is; one of his in the bag already is replaced
//   by it, core/intro.js pullSword) and the town's gate out to the road opens.
// His words only ever come out of his glass: coming somewhere or taking the sword says nothing.
// Each recording cuts short the one before, and leaving its place cuts it short (core/narration.js
// RECORDINGS: the narrator does it, game/narrator.js).
//
// Playing together the others are told (relay.story, net/session.js): a gate opened here opens
// for everyone, and a recording one of us sets off plays for everyone at once (heardStory).
import { player, state, setStatus, worldPaused } from './state.js';
import { INTRO_GATES, glassThere, swordThere, pullSword, skipIntro, pastIntro, depthGlassIn, isStoryNews } from '../core/intro.js';
import { meetRobot, robotMet } from '../core/robot.js';
import { doorArrival } from '../core/doors.js';
import { WAKE_HOUSE } from '../world/town.js';
import { playScene, scenePlaying } from './scene.js';
import { introPlaying } from './bossintro.js';
import { curtained } from './hud.js';
import { filmCovers } from '../film/player.js';
import { allEnemies } from './enemies.js';
import { plazaShards } from '../render/shards.js';
import { drawnAt } from './drawn.js';
import { scene } from '../render/scene.js';
import { emit, soft, ring, rand } from '../render/particles.js';
import { ITEMS, OLD_SWORD } from '../core/items.js';
import { equipItem } from '../core/inventory.js';
import { sfx } from '../audio/sfx.js';
import { narrate, drop } from './narrator.js';
import { syncEquippedWeapon } from './equipment.js';
import { refreshOpenFaces, rebuildWorld } from './flow.js';
import { storyBurst } from '../render/loot.js';
import { GLASS_VIEW } from '../render/glassbubble.js';
import { floatText } from '../render/floattext.js';
import { relay } from '../net/online.js';
import { tr, msg, noun } from '../i18n/i18n.js';

const REACH = 0.75;      // cells: walking this close to a thing takes it (like a quest's, game/questworld.js)
const GLASS_LIFT = 0.55; // cells the glass floats higher than a thing on the floor
const AMBER = [1, 0.66, 0.25], STEEL = [0.85, 0.9, 1];

const weapons = () => player.inventory.slots.filter(s => s && ITEMS[s.itemId]?.weapon).length;

// the beginning's things in the cube we are in, as pickups to draw (render/loot.js drawLoot) and
// label (game/lootlabels.js)
export function introThingsHere() {
  const map = state.map, run = state.run;
  if (!map || !run) return [];
  const thing = ({ x, y, z }) => ({ x, y, z, toss: 1, phase: 0, from: [x, y, z], count: 1, questItem: true });
  // a glass of his: `part` its recording (core/narration.js RECORDINGS)
  const glass = (q, id, part) => ({ ...thing(q), id, story: 'glass', part, itemId: GLASS_VIEW, title: msg('Bubble of star-glass'), lift: GLASS_LIFT, labelY: 1.35 });
  const out = depthGlassHere();
  if (map.firstGlass && glassThere(run)) out.push(glass(map.firstGlass.glass, 'story:glass', 'glass'));
  if (map.relics?.sword && swordThere(run, weapons()))
    out.push({ ...thing(map.relics.sword), id: 'story:sword', story: 'sword', itemId: OLD_SWORD.id, title: OLD_SWORD.name, stuck: true, labelY: 1.1 });
  return out;
}
// his glass further on (core/glass.js; depth 0's 'camp' too): on the cube's glass spots, until its
// recording is heard
function depthGlassHere() {
  const map = state.map, run = state.run;
  if (map.testRoom) return [];
  return depthGlassIn(map, run, state.cubes?.seed ?? 0).map(({ spot, part }) => ({ ...spot.anchor, toss: 1, phase: 0,
    from: [spot.anchor.x, spot.anchor.y, spot.anchor.z], count: 1, questItem: true, id: `story:glass:${part}`, story: 'glass', part,
    itemId: GLASS_VIEW, title: msg('Bubble of star-glass'), lift: GLASS_LIFT, labelY: 1.35 }));
}

// a gate of the beginning opens (here, or a friend opened it): the faces it joins, the cube's
// portals no longer sealed
function open(gate) {
  if (state.run.unlockedGates.has(gate)) return false;
  state.run.unlockedGates.add(gate);
  refreshOpenFaces();
  if (state.map && !state.transitioning) rebuildWorld();
  sfx('unlock', { delay: 0.5 });
  return true;
}

let refused = false;   // the sword did not fit into the bag: said once, until the hero steps away
let breaking = null;   // the glass breaking in its scene (its id): not taken again meanwhile
// main.js, every frame: walking onto a thing takes it; coming into the rock's room, its glass is shown
export function updateIntro(dt = 0) {
  dressPlaza(dt);
  walkOut();
  if (!state.run || state.mode !== 'play' || state.transitioning || worldPaused() || player.hp <= 0 || player.ragdoll) return;
  showGlass();
  noticeRock();
  let near = false;
  for (const p of introThingsHere()) {
    if (Math.hypot(p.x - player.x, p.z - player.z) > REACH || Math.abs(p.y - player.y) > 1) continue;
    near = true;
    if (p.story === 'glass') { if (p.id !== breaking) findGlass(p); } else takeSword(p);
  }
  if (!near) refused = false;
}

// The town's plaza: the shards of the big glass that came down there (render/shards.js), put into its
// world as it is built; glowing and smoking a little until the robot is awake, then only dimly
let smoke = 0;
function dressPlaza(dt) {
  farPlaza();
  const w = state.world, at = state.map?.relics?.shards;
  if (!w || !state.map.town || !at || !state.run) return;
  let shards = w.group.userData.shards;
  if (!shards) { shards = w.group.userData.shards = plazaShards(at.x, at.y, at.z, state.cubes?.seed ?? 0); w.group.add(shards); }
  const fresh = !robotMet(state.run);
  shards.userData.glow(fresh ? 1 : 0.3);
  shards.userData.tick(state.time ?? 0);
  if (!fresh || worldPaused() || (smoke -= dt) > 0) return;
  smoke = 0.35;
  const o = w.group.position, [dx, dz] = ring(0.9);
  emit(soft, at.x + o.x + dx, at.y + o.y + 0.05, at.z + o.z + dz, { v: [rand(-0.05, 0.05), rand(0.25, 0.45), rand(-0.05, 0.05)],
    life: rand(2.2, 3.4), size: rand(0.18, 0.3), grow: 0.25, color: '#5a5550', alpha: 0.22, drag: 0.4 });
}

// ... and seen from the town's other tiles (the town is one place, docs/town.md: the plaza's tile is
// one of the surroundings there, render/neighbors.js), where it shows (game/drawn.js; however far:
// the crash is what the town is found by)
let far = null;   // { cubes, group }
function farPlaza() {
  const cubes = state.cubes, k = cubes?.town?.portal, at = k && cubes.cubes.get(k)?.map.relics?.shards;
  const o = at && state.map?.town && state.run && k !== state.cubeKey ? drawnAt(k, { any: true })?.at : null;
  if (far && (far.cubes !== cubes || !o)) { far.group.removeFromParent(); far.group.visible = false; if (far.cubes !== cubes) far = null; }
  if (!o) return;
  if (!far) far = { cubes, group: plazaShards(0, 0, 0, cubes.seed) };
  if (!far.group.parent) { scene.add(far.group); far.group.visible = true; }
  far.group.position.set(at.x + o.x, at.y + o.y, at.z + o.z);
  far.group.userData.glow(robotMet(state.run) ? 0.3 : 1);
  far.group.userData.tick(state.time ?? 0);
}

// The rock's room (core/intro.js), the first time a world comes into it with his glass still on top:
// a scene shows it (core/scenes.js `glass`), and the robot says what it is (core/narration.js
// `robot` 'rock'); once a world (run.met keeps it, like a boss met)
const SHOWN = 'scene:glass';
function showGlass() {
  const map = state.map, g = map.firstGlass;
  if (!g || !glassThere(state.run) || state.run.met.has(SHOWN) || curtained() || scenePlaying() || introPlaying()) return;
  state.run.met.add(SHOWN);
  const spot = { x: g.glass.x, y: g.glass.y + GLASS_LIFT, z: g.glass.z };
  playScene('glass', { spot, anchors: { ladder: g.ladder }, on: { glint: () => {
    storyBurst(state.world, spot.x, spot.y + 0.9, spot.z, AMBER, 14);
    sfx('pickup', { pitch: 1.6, volume: 0.5 });
    if (robotMet(state.run)) narrate('robot', { what: 'rock' });
  } } });
}
// the snakes at the rock's foot beaten, or the hero at the ladder: the robot points up it (once).
// Up on the rock already, what it would say about getting up there is not said any more.
const LADDER_NEAR = 2.5;
const UP_THERE = l => l.on === 'robot' && (l.when?.what === 'ladder' || l.id === 'robot.rock.snakes');
function noticeRock() {
  const map = state.map, g = map?.firstGlass;
  if (!g || !glassThere(state.run) || !robotMet(state.run) || scenePlaying()) return;
  if (player.grounded && player.y > g.ladder.top - 0.4) { drop(UP_THERE); return; }
  const foes = allEnemies().some(e => e.hp > 0 && e.mode !== 'dead' && e.profile?.species === 'snake');
  if (!foes || Math.hypot(player.x - g.ladder.x, player.z - g.ladder.z) < LADDER_NEAR) narrate('robot', { what: 'ladder' });
}

// a glass of his breaks: its recording plays (once: it is told then, and the glass is gone). The
// rock's, the first, in a scene (core/scenes.js `break`): close on it as it bursts.
function findGlass(p) {
  if (p.part !== 'glass') { breakGlass(p); return; }
  breaking = p.id;
  playScene('break', { spot: { x: p.x, y: p.y + GLASS_LIFT, z: p.z }, hero: false, on: { burst: () => breakGlass(p) },
    done: () => { breaking = null; } });
}
function breakGlass(p) {
  storyBurst(state.world, p.x, p.y + 1, p.z, AMBER, 26);
  sfx('shatter');
  if (p.part === 'glass') {
    // (found: nothing more about the rock and the way up it waits to be said)
    drop(l => l.on === 'robot' && ['rock', 'ladder'].includes(l.when?.what));
    open(INTRO_GATES.glass);
    setStatus(tr('The glass broke, and a voice came out of it. The gate on along the road is open.'));
  } else setStatus(tr('The glass broke, and a voice came out of it.'));
  narrate('recording', { part: p.part });
  if (p.part === 'glass' && robotMet(state.run)) narrate('robot', { what: 'heard' });   // (after his words)
  relay.story?.(p.part);
}

function takeSword(p) {
  const inv = player.inventory, got = pullSword(inv);   // (his sword in the bag already: replaced)
  if (!got) {
    if (!refused) setStatus(tr('Inventory is full'));
    refused = true;
    return;
  }
  if (!inv.equipped && !inv.readied) { equipItem(inv, got.id); syncEquippedWeapon(); }
  drop(l => l.on === 'robot' && l.when?.what === 'sword');   // (taken already: the robot no longer says to take it)
  storyBurst(state.world, p.x, p.y + 0.4, p.z, STEEL, 16);
  sfx('pickup');
  floatText(`+${tr(OLD_SWORD.name)}`, q => q.set(player.x, player.visY + 1.55, player.z), { life: 1.6 });
  const opened = open(INTRO_GATES.sword);
  const took = tr('You pulled {item:the} out of the ground', { item: noun(OLD_SWORD.name) });
  setStatus(opened ? `${took}. ${tr('The gate to the road is open.')}` : took);
  if (opened) relay.story?.('sword');
}

// Playing together, a friend did something of the beginning (core/intro.js STORY_NEWS), or found a
// glass of his in the depths: its gate opens here too, and its recording plays here at the same time
// (its glass gone here too: it is heard)
export function heardStory(what) {
  if (!state.run || !isStoryNews(what)) return;
  if (what === 'glass') { open(INTRO_GATES.glass); narrate('recording', { part: 'glass' }); }
  else if (what === 'sword') open(INTRO_GATES.sword);
  else narrate('recording', { part: what });
}

// game/flow.js newWorld: the beginning done already in a world saved before it existed (somebody
// has been out past the rock; layout0: depth 0's layout), and with the dev tools (?intro=1: played
// anyway). The dev tools skip the robot's waking too: it is with the hero from the start
// (core/robot.js). A world saved before there was a robot has it lie asleep by the crash in town
// until the hero comes by.
export function settleIntro(run, layout0, visited = [], dev = false, params = new URLSearchParams()) {
  const skip = dev && params.get('intro') !== '1';
  if (skip || pastIntro(visited, layout0)) skipIntro(run);
  if (skip) meetRobot(run);
}

// A new hero in a world nobody has been in yet comes out of the inn as it comes up (game/flow.js
// newWorld): where they stand, on its doorstep facing out (null: not now: a world played before,
// the dev tools, the beginning done)
export function innArrival(map, run, visited = []) {
  if (visited.length || !map?.town || run.unlockedGates.has(INTRO_GATES.sword)) return null;
  const d = map.doors?.find(q => q.building === WAKE_HOUSE);
  return d ? doorArrival(d) : null;
}
// ... and walks out of the door onto the street (core/scenes.js `wake`), remembering nothing: once
// the opening (film/player.js) no longer covers the world, as it comes up
let inn = null;
export function comeOutOfInn(at) { inn = { at, visit: state.visit }; }
function walkOut() {
  if (!inn || filmCovers()) return;
  const { at, visit } = inn;
  inn = null;
  if (visit !== state.visit || state.transitioning) return;
  const ahead = { x: at.x + Math.sin(at.yaw) * 3, y: at.y, z: at.z + Math.cos(at.yaw) * 3 };
  playScene('wake', { spot: ahead, on: { out: () => sfx('door', { at: player }) },
    done: () => setStatus(tr('You do not remember how you came here.'), 6) });
}

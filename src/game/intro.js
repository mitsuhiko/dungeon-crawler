// The beginning (core/intro.js, docs/story.md "The beginning"): the glassmaker's glass over the
// town's plaza and his old sword stuck in the ground in the merchant camp. They are drawn like a
// quest's things (render/loot.js: glowing gold, always labelled; clicked, the hero walks there),
// and walking onto one takes it:
// - the glass breaks, its recording plays (game/narrator.js), the memories open (the inventory's
//   Memories tab, game/memorypanel.js) and the town's gate opens;
// - the sword goes into the bag (in hand, if nothing is), the camp's gate out to the road opens, and
//   its recording plays.
// Coming into the camp with the glass found (and the sword still in the ground), the camp's
// recording plays: where the sword fell. Each recording cuts short the one before, and leaving the
// town cuts its own short (core/narration.js RECORDINGS: the narrator does it, game/narrator.js).
//
// Playing together the others are told (relay.story, net/session.js): a gate opened here opens
// for everyone, and a recording one of us sets off plays for everyone at once (heardStory).
import { player, state, setStatus, worldPaused } from './state.js';
import { INTRO_GATES, glassThere, swordThere, skipIntro, pastIntro } from '../core/intro.js';
import { meetRobot } from '../core/robot.js';
import { ITEMS, OLD_SWORD } from '../core/items.js';
import { fixedWeapon } from '../core/gear/generate.js';
import { addInstance, equipItem, fits } from '../core/inventory.js';
import { sfx } from '../audio/sfx.js';
import { narrate } from './narrator.js';
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
  if (!map?.relic || !run) return [];
  const { x, y, z } = map.relic;
  const thing = { x, y, z, toss: 1, phase: 0, from: [x, y, z], count: 1, questItem: true };
  if (map.town && glassThere(run))
    return [{ ...thing, id: 'story:glass', story: 'glass', itemId: GLASS_VIEW, title: msg('Bubble of star-glass'), lift: GLASS_LIFT, labelY: 1.35 }];
  if (map.merchantCamp && swordThere(run, weapons()))
    return [{ ...thing, id: 'story:sword', story: 'sword', itemId: OLD_SWORD.id, title: OLD_SWORD.name, stuck: true, labelY: 1.1 }];
  return [];
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
// main.js, every frame: walking onto a thing takes it
export function updateIntro() {
  if (!state.run || state.mode !== 'play' || state.transitioning || worldPaused() || player.hp <= 0 || player.ragdoll) return;
  let near = false;
  for (const p of introThingsHere()) {
    if (Math.hypot(p.x - player.x, p.z - player.z) > REACH || Math.abs(p.y - player.y) > 1) continue;
    near = true;
    if (p.story === 'glass') findGlass(p); else takeSword(p);
  }
  if (!near) refused = false;
}

function findGlass(p) {
  storyBurst(state.world, p.x, p.y + 1, p.z, AMBER, 26);
  sfx('shatter');
  open(INTRO_GATES.glass);
  setStatus(tr('The glass broke, and a voice came out of it. The gate out of the town is open.'));
  narrate('recording', { part: 'glass' });
  relay.story?.('glass');
}

function takeSword(p) {
  const inv = player.inventory, sword = fixedWeapon(OLD_SWORD.id);
  if (!fits(inv, sword)) {
    if (!refused) setStatus(tr('Inventory is full'));
    refused = true;
    return;
  }
  const id = addInstance(inv, sword);
  if (!inv.equipped && !inv.readied) { equipItem(inv, id); syncEquippedWeapon(); }
  storyBurst(state.world, p.x, p.y + 0.4, p.z, STEEL, 16);
  sfx('pickup');
  floatText(`+${tr(OLD_SWORD.name)}`, q => q.set(player.x, player.visY + 1.55, player.z), { life: 1.6 });
  const opened = open(INTRO_GATES.sword);
  const took = tr('You pulled {item:the} out of the ground', { item: noun(OLD_SWORD.name) });
  setStatus(opened ? `${took}. ${tr('The gate to the road is open.')}` : took);
  narrate('recording', { part: 'sword' });   // (once: cutting the camp's short)
  if (opened) relay.story?.('sword');
}

// game/flow.js settleIn: in the merchant camp with the glass found and the sword still in the
// ground, where the sword fell (once)
export function introArrived(map) {
  if (!map.merchantCamp || !state.run || glassThere(state.run) || state.run.unlockedGates.has(INTRO_GATES.sword)) return;
  if (narrate('recording', { part: 'camp' })) relay.story?.('camp');
}

// Playing together, a friend did something of the beginning (core/intro.js STORY_NEWS): its gate
// opens here too, and its recording plays here at the same time
export function heardStory(what) {
  if (!state.run) return;
  if (what === 'glass') { open(INTRO_GATES.glass); narrate('recording', { part: 'glass' }); }
  else if (what === 'sword') { open(INTRO_GATES.sword); narrate('recording', { part: 'sword' }); }
  else if (what === 'camp') narrate('recording', { part: 'camp' });
}

// game/flow.js newWorld: the beginning done already in a world saved before it existed (somebody
// has been out past the camp), and with the dev tools (?intro=1: played anyway). The dev tools skip
// the robot's coming too: it is with the hero from the start (core/robot.js). A world saved before
// there was a robot has it come the next time the hero is out of the town.
export function settleIntro(run, seed, visited = [], dev = false, params = new URLSearchParams()) {
  const skip = dev && params.get('intro') !== '1';
  if (skip || pastIntro(visited, seed)) skipIntro(run);
  if (skip) meetRobot(run);
}

// The rune stones (docs/map.md; their rules core/runestones.js, where they stand world/spots.js and
// cubegen/spots.js, their look render/runestones.js, their guards game/enemyspawn.js).
//
// A stone is one of the parts the action key and a click use (game/trials.js usableParts, type
// 'waystone'): hovered and labelled with the rest (game/lootlabels.js), walked up to and pressed
// (game/orders.js orderPart). Pressed asleep, it wakes for good, for everyone in the world
// (run.runes: saved with it, game/save.js; sent to friends, net/session.js `rune`): it glows, says
// so, and from then on the map (the inventory's Map tab, game/mappanel.js) travels to it.
// Pressed awake, it opens the map there.
//
// Travelling (travelTo) fades out like the town portal (game/townportal.js) and comes in where one
// stands to press the stone, facing it, from anywhere it can be left: not on the way between cubes,
// down, falling or held, nor out of a guardian's fight (its arena while it stands), a trial room
// sealed while its event runs, or Umbra's flooded reef (travelBlock). Playing together everyone
// travels on their own, like with the town portal: the stones woken are everyone's.
import { player, state, setStatus } from './state.js';
import { RUNE_REACH, runestonesIn, runeCube, runeDepth, arrivalAt } from '../core/runestones.js';
import { gateLocked, guardianCalled } from '../core/guardians.js';
import { SEALED_MESSAGE } from '../core/trials.js';
import { setRunestoneAwake } from '../render/runestones.js';
import { floatText } from '../render/floattext.js';
import { emit, glow, rand } from '../render/particles.js';
import { sfx } from '../audio/sfx.js';
import { jingle } from '../audio/jingles.js';
import { relay } from '../net/online.js';
import { log } from './log.js';
import { whenReady, fadeOut, fadeIn } from './hud.js';
import { enterCube } from './flow.js';
import { sealedIn } from './trials.js';
import { reefHere, divePhase } from './dive.js';
import { travelling } from './travel.js';
import { cancelCast } from './townportal.js';
import { cancelSword } from './sword.js';
import { clearMouseInput } from './orders.js';
import { guardianKind } from './enemyspawn.js';
import { tr } from '../i18n/i18n.js';

const FADE_MS = 380;
// opening the map there (game/inventory.js sets it: the panel's module imports this one)
export const hooks = { openMap: null };

const say = (text, color = '#ffd6a0') => {
  setStatus(text);
  floatText(text, q => q.set(player.x, player.visY + 2.1, player.z), { color, size: 0.2, life: 2.2, rise: 0.35 });
};

// --- in the cube -----------------------------------------------------------------------------------

// the stones here as parts (game/trials.js usableParts): the same object each frame for each
const parts = new WeakMap();
const partOf = s => parts.get(s) ?? parts.set(s, { id: s.id, type: 'waystone', x: s.anchor.x, y: s.anchor.y, z: s.anchor.z,
  walk: s.approach, stone: s }).get(s);
export const runestoneParts = () => state.mode === 'play' ? runestonesIn(state.map).map(partOf) : [];
export const isAwake = id => !!state.run?.runes.has(id);
export const canReachStone = p => Math.hypot(p.x - player.x, p.z - player.z) < RUNE_REACH && Math.abs(p.y - player.y) < 1.2;
// what its label and the use button say (in the language of the moment)
export const runestoneLabel = p => isAwake(p.id) ? tr('Rune stone · open the map') : tr('Wake the rune stone');

// pressed (the action key, a click: game/trials.js usePart)
export function pressRunestone(p) {
  if (isAwake(p.id)) { hooks.openMap?.(runeDepth(p.id), p.id); return true; }
  wake(p.id);
  return true;
}

// stone `id` wakes, by us (mine: we pressed it) or a friend (net/session.js)
function wake(id, mine = true) {
  if (state.run.runes.has(id)) return false;
  state.run.runes.add(id);
  const here = setRunestoneAwake(state.world, id);
  if (!mine) return true;
  relay.runestone?.(id);
  const d = runeDepth(id), s = runestonesIn(state.map).find(x => x.id === id);
  sfx('unlock', { at: s?.anchor }); sfx('portal', { at: s?.anchor, delay: 0.25, pitch: 1.3, volume: 0.6 }); jingle('portal', { delay: 0.5 });
  if (here && s) for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(0.2, 0.6);
    emit(glow, s.anchor.x + Math.cos(a) * r, s.anchor.y + rand(0.2, 1.6), s.anchor.z + Math.sin(a) * r,
      { v: [Math.cos(a) * 0.4, rand(0.6, 1.4), Math.sin(a) * 0.4], life: rand(0.8, 1.6), size: rand(0.06, 0.12), color: i % 3 ? '#ffb060' : '#c8fff3', drag: 1.5 });
  }
  say(tr('The rune stone wakes! Travel back to it from the map.'));
  log('rune', { depth: d }, { share: true });
  return true;
}
// a friend woke stone `id` (net/session.js `rune`): it glows here too
export const shareRunestone = id => wake(id, false);

// dev (/runes): every stone of depth d (all depths: null) woken, as if pressed; how many woke
export function wakeAll(d = null) {
  let n = 0;
  for (let depth = d ?? 1; depth <= (d ?? 20); depth++) for (const s of state.cubes.layout(depth).runestones ?? [])
    if (wake(s.id, false)) { relay.runestone?.(s.id); n++; }
  return n;
}

// --- travelling ------------------------------------------------------------------------------------

// why we cannot travel now (null: we can)
export function travelBlock() {
  const p = player;
  if (state.mode !== 'play' || !state.map || state.transitioning || travelling()) return tr('Not now');
  if (p.hp <= 0 || p.down || p.ragdoll || p.held || p.engulfed || state.fallFrom) return tr('Not now');
  if (sealedIn()) return tr(SEALED_MESSAGE);   // a trial room while its event runs (game/trials.js)
  if (reefHere() && (p.suit || !['dry', 'over'].includes(divePhase()))) return tr('Not under water');   // Umbra's reef (game/dive.js)
  if (state.map.guardian && gateLocked(state.map, state.run))
    return tr('Not while {who:the} still stands', { who: guardianCalled(state.map, guardianKind(state.map)) });
  return null;
}

// the woken stone `id`'s spot, from its cube's map (null: its cube not made here yet)
export function stoneOf(id) {
  const c = state.cubes?.cubes.get(runeCube(id));
  return c ? runestonesIn(c.map).find(s => s.id === id) ?? null : null;
}

// Travel to woken stone `id` (the map); false, having said why, when not now
export function travelTo(id) {
  if (!state.run?.runes.has(id)) return false;
  const why = travelBlock();
  if (why) { say(why, '#ff9a8a'); sfx('fizzle'); return false; }
  const cubes = state.cubes, run = state.run, key = runeCube(id);
  state.transitioning = true;
  state.portalCharge = null;
  cancelCast(); cancelSword(true); clearMouseInput();
  sfx('portal');
  fadeOut();
  setTimeout(() => whenReady(cubes.get(key)).then(c => {
    if (state.cubes !== cubes || state.run !== run) return;
    const s = runestonesIn(c.map).find(x => x.id === id);
    if (!s) throw new Error(`no rune stone ${id} in ${key}`);
    const at = arrivalAt(s);
    enterCube(c, null, null, at);
    player.yaw = at.yaw;
    state.transitioning = false;
    sfx('portal', { pitch: 1.4, volume: 0.6 });
    say(tr('Depth {depth}: the rune stone brought you here', { depth: runeDepth(id) }));
  }).catch(e => {
    console.error('rune stone travel failed', e);
    if (state.cubes !== cubes) return;
    state.transitioning = false;
    fadeIn();
    say(tr('The rune stone does not answer'), '#ff9a8a');
  }), FADE_MS);
  return true;
}

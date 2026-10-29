// The armor the player wears (core/inventory.js `worn`; core/gear/stats.js armorStats): on the
// hero, in what a blow takes, and in the maximum health.
//   updateArmor     every frame: the hero wears what the bag says (render/figure.js wear), the
//                   shield on the back (a thing carried put away) while a bow needs the hand; the maximum health follows
//                   the armor's health (core/progression.js refreshMaxHp); rare armor shines
//   guardBlow       a blow on the player (game/enemycombat.js hitPlayer), through the shield and
//                   the armor: a block (the shield's chance, only in hand) takes most of the blow
//                   and all of its shove and what it would set on you; the armor takes its share
//                   (armorReduction, against the striker's level) off the rest, and Standing Firm
//                   some of the shove
//   armorOnly       a blow through the armor alone (held in a grab, game/grab.js: no shield)
//   wornDefense     what the armor adds up to now (the inventory shows it)
import * as THREE from 'three';
import { player, state } from './state.js';
import { sfx } from '../audio/sfx.js';
import { ARMOR_SLOTS } from '../core/items.js';
import { equippedWeapon } from '../core/combat.js';
import { refreshMaxHp } from '../core/progression.js';
import { wornTotals, armorReduction, BLOCK_TAKES } from '../core/gear/stats.js';
import { depthLevel } from '../core/enemies.js';
import { character } from '../render/character.js';
import { wear, takeOff, thingLoaded, loadThing, animateWorn } from '../render/figure.js';
import { floatText } from '../render/floattext.js';
import { emit, glow, rand } from '../render/particles.js';
import { tr } from '../i18n/i18n.js';
import { damageNumbers } from './settings.js';

// a bow needs both hands: the shield goes on the back and blocks nothing
export const shieldInHand = (p = player) => equippedWeapon(p)?.weapon?.kind !== 'bow';
export const wornDefense = (p = player) => wornTotals(p.inventory, { shield: shieldInHand(p) });

// what the hero should wear, by slot: { id, slot, rarity, back }
function wanted(inv) {
  const out = {};
  for (const slot of ARMOR_SLOTS) {
    const s = inv.slots.find(x => x?.instanceId === inv.worn?.[slot]);
    if (s) out[slot] = { id: s.itemId, slot, rarity: s.gen?.rarity ?? null, back: slot === 'shield' && !shieldInHand() };
  }
  return out;
}
const same = (w, want) => !!w && w.id === want.id && (w.rarity ?? null) === want.rarity && !!w.back === want.back;

let seen = null, seenVersion = -1, seenBow = null, missing = false;
export function updateArmor(time) {
  const inv = player.inventory, bow = !shieldInHand();
  if (inv !== seen || inv.version !== seenVersion || bow !== seenBow || missing) {
    seen = inv; seenVersion = inv.version; seenBow = bow;
    refreshMaxHp(player);
    missing = !character.ready || dress(wanted(inv));   // (not loaded yet: dressed once it is)
  }
  if (character.ready) animateWorn(character, time);
}
// put it on the hero; true: something is still loading (again next frame)
function dress(want) {
  let loading = false;
  for (const slot of ARMOR_SLOTS) {
    const w = character.worn[slot], x = want[slot];
    if (!x) { if (w) takeOff(character, slot); continue; }
    if (same(w, x)) continue;
    if (thingLoaded(x.id)) wear(character, x.id, x);
    else { loading = true; loadThing(x.id).catch(e => console.error('armor failed to load', e)); }
  }
  return loading;
}

// The blow (core/enemies.js blowOf) as the armor lets it through: a new blow, `blocked` when the
// shield caught it. The striker's level is its (blow.by), else the depth's.
export function guardBlow(blow) {
  const d = wornDefense();
  if (!d.armor && !d.block && !d.steady) return blow;
  const level = Number.isFinite(blow.by?.level) ? blow.by.level : depthLevel(state.map?.depth);
  const cut = 1 - armorReduction(d.armor, level);
  if (blow.damage > 0 && d.block > 0 && Math.random() * 100 < d.block) {
    const damage = blow.damage * BLOCK_TAKES * cut;
    blocked(damage);
    return { damage, knock: 0, reason: blow.reason, by: blow.by, blocked: true };
  }
  return { ...blow, damage: blow.damage * cut, knock: blow.knock * (1 - d.steady / 100) };
}
// The blow as the armor alone lets it through: held in a grab (game/grab.js), the shield cannot
// come up and there is nothing to stand firm on.
export function armorOnly(blow) {
  const d = wornDefense();
  if (!d.armor) return blow;
  const level = Number.isFinite(blow.by?.level) ? blow.by.level : depthLevel(state.map?.depth);
  return { ...blow, damage: blow.damage * (1 - armorReduction(d.armor, level)) };
}
// the clang of a block: a word over the hero, a spray of sparks from the shield
function blocked(damage) {
  sfx('block', { pitch: 0.9 + Math.random() * 0.2 });
  floatText(damage >= 0.5 && damageNumbers() ? tr('Blocked! −{n}', { n: Math.ceil(damage) }) : tr('Blocked!'), q => q.set(player.x, player.visY + 1.3, player.z),
    { color: '#cfe3ff', size: 0.22, life: 0.9, rise: 0.7, pop: 0.6 });
  const shield = character.worn?.shield?.object;
  const at = shield ? shield.getWorldPosition(_v) : { x: player.x, y: player.y + 0.5, z: player.z };
  for (let i = 0; i < 10; i++) emit(glow, at.x + rand(-0.08, 0.08), at.y + rand(-0.08, 0.08), at.z + rand(-0.08, 0.08), {
    v: [rand(-1.5, 1.5), rand(0.3, 1.6), rand(-1.5, 1.5)], life: rand(0.15, 0.3), size: rand(0.04, 0.07), color: '#fff2c4', drag: 4 });
}
const _v = new THREE.Vector3();

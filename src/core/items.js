// Item definitions are data, not renderer objects. Equipment uses rig units in the hand sockets.
// These are the base types; a weapon in the bag or on the floor is an instance of one, with its
// own rolled rarity, affixes and name in `gen` (core/gear/). Its stats: core/gear/stats.js.
// `model`: how it looks, on the floor, in a hand and in the bag (render/itemviews.js draws the
// bag's pictures from it).
// Names and descriptions are English, translated where they are shown (game/itemnames.js; the
// texts are messages, src/i18n/sources.js lists them): a description may have parameters, its
// `params` ({ heal: 40 } for 'Restores {heal}% ...').
import { msg, phrase } from '../i18n/i18n.js';

const model = name => `assets/items/${name}.glb`;
// Base weapon stats at item level 1 (core/gear/stats.js grows the damage with item level):
//   kind: sword, flail, trident, bow, crossbow or staff (how it attacks: core/combat.js KINDS); damage
//   per hit; interval: seconds from one attack to the next (the attack speed; every attack time
//   scales with it, see core/combat.js); range: reach in cells (how far a shot flies for the
//   ranged kinds); arc: × the basic swing arc (swords, flails); pierce: how many enemies a bolt
//   goes through before it stops; burst: the radius (cells) a spell bursts over where it hits,
//   hurting everything else there for BURST_SHARE of its damage (core/shots.js); shot: what it
//   shoots, when not its kind's (the lightning staffs' 'lightning'); jumps: how many more enemies
//   lightning jumps on to from the one it struck (core/shots.js chainTargets); color: the
//   spell's (the lightning's); balls: how many balls a flail has (each strikes, one after the other, in a swing:
//   core/combat.js ballAt); knockback: × how hard its hits shove; zap: a trident's lightning
//   from afar ({ range, share, jumps }, see the tridents below).
// Swords: the light ones are quick and nimble, the heavy ones hit harder, wider and further but
// plant you for longer; damage per second rises a little with weight, and the heavier bases only
// drop deeper down (core/gear/bases.js). Shooting from afar is safer, so the ranged kinds deal
// less per second than swords of the same weight: bows are quick and reach far, crossbows hit
// hard and slowly and pierce, staffs are slow and burst.
const weapon = (id, name, kind, damage, interval, range, more = {}) => ({
  id, name, category: 'weapon', stackLimit: 1,
  model: more.old ? 'assets/sword.glb' : model(id),
  weapon: { kind, damage, interval, range, arc: more.arc ?? 1, pierce: more.pierce ?? 0,
    burst: more.burst ?? 0, ...(more.color && { color: more.color }), ...(more.balls && { balls: more.balls }),
    ...(more.shot && { shot: more.shot }), ...(more.jumps && { jumps: more.jumps }), ...(more.zap && { zap: more.zap }),
    ...(more.knockback && { knockback: more.knockback }) },
});
const sword = (id, name, damage, interval, range, arc = 1, old = false) => weapon(id, name, 'sword', damage, interval, range, { arc, old });
// Flails (morning stars): a ball or more on a chain, swung like a sword but slower, sweeping
// wider and shoving harder; with two or three balls each strikes in turn (for less each). Damage
// per second a little over a sword's of the same depth, for planting you longer. Renew, the time
// boss, fights with them and always drops one (core/gear/drops.js); they drop from deeper down
// than he is (core/gear/bases.js), so he is the first to hand you one.
const flail = (id, name, damage, interval, range, arc, balls = 1) =>
  weapon(id, name, 'flail', damage, interval, range, { arc, balls, knockback: 1.5 });
// Tridents: a long shaft and three prongs. Close up (an enemy within its reach, the stab's lunge
// included) it stabs like a spear: a long, narrow thrust (a narrow `arc`) that goes through
// everything in a line in front of it. Further off it throws lightning instead (`zap`, core/combat.js
// combatStats): as far as `range`, for `share` of the stab's damage (shooting from afar is
// safer), jumping on to `jumps` more enemies like a lightning staff's (core/shots.js). Per second
// they stab about as hard as a sword of their depth. They drop from depth 3 on; Squarlo, the
// sea's boss, drops one more often than not (core/gear/drops.js).
const trident = (id, name, damage, interval, range, zap, color) =>
  weapon(id, name, 'trident', damage, interval, range, { arc: 0.3, knockback: 1.2, zap: { share: 0.6, jumps: 0, ...zap }, color });
// learn: combat.html#chain (see learn/README.md)
export const WEAPONS = [
  // the glassmaker's own (core/intro.js): found at the crash in town, stuck in the ground
  sword('weapon_sword_old', "Glassmaker's Old Sword", 30, .42, .85, 1, true),   //  71 damage per second
  sword('weapon_sword_short', 'Short Sword', 23, .32, .72),         //  72, the fastest
  sword('weapon_sword_medium', 'Medium Sword', 34, .42, .85),       //  81
  sword('weapon_sword_long', 'Long Sword', 41, .48, 1.05),          //  85, long reach
  sword('weapon_sword_broad', 'Broadsword', 48, .54, .88, 1.25),    //  89, a wide sweep
  sword('weapon_sword_greatsword', 'Greatsword', 61, .66, 1.15, 1.3), // 92, wide and long
  // (a flail sweeps wider and shoves harder than the swords: it hits a little less per second
  // than the sword it comes with, core/gear/bases.js)
  flail('weapon_flail_ball', 'Ball and Chain', 49, .58, .95, 1.4),          //  84
  flail('weapon_flail_morningstar', 'Morning Star', 53, .62, 1, 1.45),     //  85
  flail('weapon_flail_twin', 'Twin Morning Star', 30, .68, 1, 1.5, 2),     //  88 (two balls), the widest
  flail('weapon_flail_knight', 'Knight\'s Flail', 63, .7, 1.15, 1.35),     //  90, the longest chain
  flail('weapon_flail_triple', 'Triple Flail', 23, .74, .95, 1.55, 3),     //  93 (three balls)
  trident('weapon_trident_fisher', "Fisher's Trident", 38, .52, 1.25, { range: 4.5 }, '#ffd76a'),        //  73 stabbing, 44 throwing
  trident('weapon_trident_sea', 'Trident', 48, .58, 1.35, { range: 5 }, '#9fd0ff'),                       //  83, 50
  trident('weapon_trident_storm', 'Storm Trident', 58, .66, 1.45, { range: 5.5, jumps: 1 }, '#c48cff'),   //  88, 53 (and a jump)
  weapon('weapon_bow_short', 'Short Bow', 'bow', 22, .44, 5),             // 50, the quickest
  weapon('weapon_bow_hunting', 'Hunting Bow', 'bow', 30, .56, 6),         // 54
  weapon('weapon_bow_recurve', 'Recurve Bow', 'bow', 35, .62, 6.5),       // 56
  weapon('weapon_bow_long', 'Longbow', 'bow', 44, .74, 8),                // 59, the furthest
  weapon('weapon_bow_war', 'War Bow', 'bow', 54, .84, 7),                 // 64
  weapon('weapon_crossbow_hand', 'Hand Crossbow', 'crossbow', 34, .66, 4.5),                // 52
  weapon('weapon_crossbow_light', 'Light Crossbow', 'crossbow', 46, .84, 5.5, { pierce: 1 }), // 55
  weapon('weapon_crossbow_repeating', 'Repeating Crossbow', 'crossbow', 27, .45, 5),       // 60, rapid
  weapon('weapon_crossbow_heavy', 'Heavy Crossbow', 'crossbow', 64, 1.04, 6, { pierce: 1 }), // 62
  weapon('weapon_crossbow_arbalest', 'Arbalest', 'crossbow', 86, 1.28, 7, { pierce: 2 }),  // 67
  weapon('weapon_staff_gnarled', 'Gnarled Staff', 'staff', 27, .58, 4.5, { burst: .5, color: '#8fe07a' }),   // 47
  weapon('weapon_staff_oak', 'Oak Staff', 'staff', 33, .62, 5, { burst: .6, color: '#7fb4ff' }),            // 53
  weapon('weapon_staff_ember', 'Ember Staff', 'staff', 41, .70, 5, { burst: .85, color: '#ff8a3a' }),       // 59
  weapon('weapon_staff_crystal', 'Crystal Staff', 'staff', 47, .74, 5.5, { burst: .7, color: '#bdf3ff' }),  // 64
  weapon('weapon_staff_arcane', 'Arcane Staff', 'staff', 58, .84, 6, { burst: 1, color: '#c48cff' }),       // 69
  // the lightning staffs: a staff shaped like a bolt of lightning, from deeper down; its lightning
  // strikes at once and jumps on to `jumps` more enemies near the one it struck (core/shots.js)
  weapon('weapon_staff_spark', 'Spark Staff', 'staff', 38, .64, 5.5, { shot: 'lightning', jumps: 1, color: '#ffd76a' }),      // 59
  weapon('weapon_staff_lightning', 'Lightning Staff', 'staff', 48, .72, 6, { shot: 'lightning', jumps: 2, color: '#9fd0ff' }), // 67
  weapon('weapon_staff_thunder', 'Thunderbolt', 'staff', 55, .8, 6.5, { shot: 'lightning', jumps: 3, color: '#c48cff' }),      // 69
];
// the kinds of weapon, in the order the UI lists them
export const WEAPON_KINDS = ['sword', 'flail', 'trident', 'bow', 'crossbow', 'staff'];
// the kinds that strike what is in front of them (the others shoot; a trident shoots too, from
// afar: core/combat.js combatStats)
export const isMelee = kind => kind === 'sword' || kind === 'flail' || kind === 'trident';
// learn: code.html#lists (see learn/README.md)
export const COINS = [
  { id: 'item_coin_gold', name: 'Gold', value: 1000, suffix: 'g' },
  { id: 'item_coin_silver', name: 'Silver', value: 10, suffix: 's' },
  { id: 'item_coin_copper', name: 'Copper', value: 1, suffix: 'c' },
].map(c => ({ ...c, category: 'currency', stackLimit: Infinity, model: model(c.id) }));
// Potions (core/potions.js has their rules). Two families, both stackable:
//   drinks (`use: 'drink'`): drinking one puts its `effect` on you for `effect.time` s:
//     { heal }: that share of the maximum health, poured in over the time (well under a second)
//     { cure, immune }: ends that status (core/status.js) and keeps it off for the time
//     { buff, value }: a share more of `buff` (core/potions.js BUFFS) for the time
//   flasks (`use: 'throw'`): readied into the hand (game/equipment.js), thrown with a click at
//     what the arc points at, within `flask.range` cells (game/throws.js). They burst over
//     `flask.radius` cells and never hurt the player: `blast` damages, `burn` sets on fire
//     and leaves a burning `patch` for that many s, `toxin` poisons and leaves a `cloud`. Their
//     damage grows with the player's level (core/potions.js flaskPower).
// Each kind has its own cooldown (`cooldown` s; core/potions.js cooldownLeft), but the health
// potions share theirs (HEAL_TIME). `price`: copper at the alchemist at level 1, more deeper down
// (core/shops.js shopPrice); `level`: the least item level they drop at, `weight`: how
// likely they drop against the others (core/gear/drops.js, core/chests.js). `family`: which
// quick bar slot they share by themselves (core/inventory.js autoBar). A new run starts with a
// few health potions on the quick bar.
const potionDef = (id, name, use, spec, description, params) => ({ id, name, category: 'potion', stackLimit: 99,
  model: model(id), use, cooldown: 1, level: 1, weight: 1, ...spec, description, params });
const pct = v => Math.round(v * 100);
const BUFF_TEXT = { moveSpeed: msg('You move {v}% faster for {time} seconds.'), attackSpeed: msg('You attack {v}% faster for {time} seconds.'),
  damage: msg('Your attacks deal {v}% more damage for {time} seconds.'), jump: msg('You jump {v}% higher for {time} seconds.') };
// the cooldown the health potions share (s, core/potions.js cooldownOf)
export const HEAL_TIME = 2;
const drink = (id, name, effect, spec) => potionDef(id, name, 'drink', { family: effect.buff ? 'buff' : effect.heal ? 'heal' : 'cure',
  ...(effect.heal && { cooldown: HEAL_TIME }), ...spec,
  effect }, effect.heal ? msg('Restores {v}% of your health in an instant.')
  : effect.cure ? msg('Cures poison and keeps it off you for {time} seconds.') : BUFF_TEXT[effect.buff],
  { v: pct(effect.heal ?? effect.value ?? 0), time: effect.time });
const flask = (id, name, spec, text) => potionDef(id, name, 'throw', { family: 'flask', ...spec, flask: spec.flask },
  msg('Click its quick bar slot to take it in hand, then click where to throw it (up to {range} cells away). {text} It never hurts you.'),
  { range: spec.flask.range, text: phrase(text) });
export const POTIONS = [
  drink('item_potion_health_minor', 'Minor health potion', { heal: 0.25, time: 0.5 }, { price: 15, weight: 5 }),
  drink('item_potion_health', 'Health potion', { heal: 0.4, time: 0.6 }, { price: 40, weight: 6 }),
  drink('item_potion_health_greater', 'Greater health potion', { heal: 0.6, time: 0.7 }, { price: 110, level: 5, weight: 3 }),
  drink('item_potion_health_superior', 'Superior health potion', { heal: 1, time: 0.8 }, { price: 260, level: 10, weight: 1.5 }),
  drink('item_potion_antidote', 'Antidote', { cure: 'toxic', immune: 'toxic', time: 30 }, { price: 30, level: 3, weight: 2 }),
  drink('item_potion_swiftness', 'Swiftness potion', { buff: 'moveSpeed', value: 0.3, time: 30 }, { price: 70, level: 2 }),
  drink('item_potion_haste', 'Haste potion', { buff: 'attackSpeed', value: 0.25, time: 30 }, { price: 90, level: 3 }),
  drink('item_potion_might', 'Potion of might', { buff: 'damage', value: 0.3, time: 30 }, { price: 90, level: 3 }),
  drink('item_potion_leaping', 'Leaping potion', { buff: 'jump', value: 0.5, time: 30 }, { price: 60, level: 2 }),
  flask('item_flask_blast', 'Blast flask', { price: 60, level: 2, weight: 1.5,
    flask: { range: 6, radius: 1.6, blast: 55, color: '#ffb347' } }, msg('It explodes where it lands, hurting and throwing back everything around.')),
  flask('item_flask_fire', 'Fire flask', { price: 70, level: 3,
    flask: { range: 6, radius: 1.4, blast: 12, burn: { damage: 45, time: 4, ticks: 8 }, patch: 4, color: '#ff7a2a' } },
    msg('It bursts into flames: everything around catches fire, and the ground burns on for a while.')),
  flask('item_flask_toxic', 'Toxic flask', { price: 70, level: 4,
    flask: { range: 6, radius: 1.8, toxin: { damage: 60, time: 6, ticks: 6 }, cloud: 6, color: '#8fdc3c' } },
    msg('It bursts into a poison cloud that lingers; everything in it is poisoned.')),
];
export const HEALTH_POTION = POTIONS.find(p => p.id === 'item_potion_health');
// Mana and stamina potions and the sticks have inventory definitions only (no mana or
// stamina yet); no use or crafting.
const stackables = [
  ['item_potion_mana', 'Mana potion'], ['item_potion_stamina', 'Stamina potion'],
  ['item_stick_short', 'Short stick'], ['item_stick_long', 'Long stick'], ['item_stick_forked', 'Forked stick'],
].map(([id, name]) => ({ id, name, category: 'item', stackLimit: 99, model: model(id) }));
// Crystals: enemies, guardians and chests drop them (core/gear/drops.js, core/chests.js); the
// Enchanter in town wants one kind for each enchantment (core/gear/enchants.js, core/crafting.js).
// No use of their own.
export const CRYSTALS = [
  ['ruby', 'Warm to the touch. The Enchanter makes weapons Toasty with it.'],
  ['emerald', 'Smells faintly of swamp. The Enchanter makes weapons Icky with it.'],
  ['sapphire', 'Always a little frosty. The Enchanter makes weapons Nippy with it.'],
  ['amethyst', 'It tingles. The Enchanter makes weapons Zappy with it.'],
  ['diamond', 'Very sparkly. The Enchanter makes weapons Shiny with it.'],
].map(([s, description]) => ({ id: `item_crystal_${s}`, name: s[0].toUpperCase() + s.slice(1), category: 'item', stackLimit: 99,
  model: model(`item_crystal_${s}`), crystal: true, description }));
stackables.push(...CRYSTALS);
// Tools are used, not consumed. `bound`: never leaves the bag (no Drop); `use`: what using it
// does (game/quickbar.js useItem). They never lie on the floor, so they have no `model`; their
// `picture` is the model the bag shows them as (render/itemviews.js). `together`: the name and
// description it goes by while friends play along (game/itemnames.js); it is the same item.
export const TOWN_PORTAL = {
  id: 'item_town_portal', name: 'Town Portal Scroll', category: 'tool', stackLimit: 1, bound: true, use: 'townPortal',
  description: 'Opens a portal to town after 5 seconds of standing still. Step back through it in town to return here. Never used up.',
  picture: model('item_town_portal'),
};
// the way out of a spot you cannot leave (game/roomportal.js); playing together it also takes
// you to a friend, picked from a little menu (game/teleportmenu.js)
export const ROOM_PORTAL_CAST = 3;   // s holding still to read it
export const ROOM_PORTAL = {
  id: 'item_room_portal', name: 'Room Portal Scroll', category: 'tool', stackLimit: 1, bound: true, use: 'roomPortal',
  description: 'Takes you back to where you came into this room after {time} seconds of holding still, even on a ladder or wedged in somewhere: the way out when you are stuck. One way. Never used up.',
  params: { time: ROOM_PORTAL_CAST },
  picture: model('item_room_portal'),
  together: { name: 'Teleport Scroll',
    description: 'Takes you back to where you came into this room, or to a friend, after {time} seconds of holding still, even on a ladder or wedged in somewhere. Never used up.',
    params: { time: ROOM_PORTAL_CAST } },
};
// every hero carries these (core/progression.js carryTools)
export const TOOLS = [TOWN_PORTAL, ROOM_PORTAL];
// Things a character wears or carries (render/figure.js puts them on): `slot` is where they go,
// one thing per slot (OUTFIT_SLOTS): on the head, or in the right or the left hand. Their models
// say which bone they sit on, how, and how the arm holds them (blender/items.py WEARS).
// `glow`: the colour the gem-like part shines in. The villagers wear them (world/town.js
// VILLAGERS), the people out in the world too (core/npcs.js). They are armor as well (`armor`,
// like ARMORS below: light, with a little something of its own, `perks`, core/gear/stats.js
// armorStats): the headwear on the head, the things carried in the off hand, the shield's slot
// (the hero's other hand holds the weapon: render/figure.js puts a right-hand thing in the left).
// They drop, the Smith sells them, the hero wears them (core/gear/bases.js ARMOR_BASES).
const wearable = (id, name, slot, description, more = {}) => ({
  id, name, category: slot === 'head' ? 'wearable' : 'held', slot, stackLimit: 1, model: model(id),
  description, ...more });
const hat = (value, { moveSpeed = 0, ...perks } = {}) => ({ armor: { slot: 'head', armor: value, block: 0, speed: moveSpeed, perks } });
const carried = (value, block, perks = {}) => ({ armor: { slot: 'shield', armor: value, block, speed: 0, perks } });
export const OUTFIT_SLOTS = ['head', 'right', 'left'];
export const WEARABLES = [
  wearable('wear_headscarf', 'Headscarf', 'head', 'A plum kerchief with golden dots, knotted at the nape.', hat(2, { regen: 10 })),
  wearable('wear_welding_mask', 'Welding mask', 'head', 'A smith\'s mask with a dark glass window.', hat(9, { burnResist: 20 })),
  wearable('wear_wizard_hat', 'Wizard hat', 'head', 'Tall, pointed and covered in stars.', hat(3, { regen: 20 })),
  wearable('held_towel', 'Towel', 'left', 'A striped towel, carried over the forearm. Always know where your towel is.', carried(1, 5, { regen: 15 })),
  wearable('held_crystal_ball', 'Crystal ball', 'right', 'It floats over the palm and glows softly.', { glow: '#7fb4ff', ...carried(2, 6, { regen: 20, poisonResist: 10 }) }),
  wearable('held_rope', 'Rope', 'right', 'A coil of hemp rope.', carried(1, 4, { steady: 20 })),
  wearable('held_hammer', 'Hammer', 'right', 'A smith\'s hammer.', carried(3, 8, { steady: 10 })),
  wearable('held_pliers', 'Pliers', 'left', 'A smith\'s pliers, holding a glowing billet.', { glow: '#ff7a2a', ...carried(2, 6, { burnResist: 15 }) }),
  wearable('held_feed_bag', 'Feed bag', 'left', 'Grain for the animals, and a carrot. Snacks!', carried(1, 4, { life: 10 })),
  // the people out in the world wear these (core/npcs.js)
  wearable('wear_hood', 'Hood', 'head', 'A pilgrim\'s hood of rough brown cloth.', hat(3, { poisonResist: 10 })),
  wearable('wear_miner_helmet', 'Miner\'s helmet', 'head', 'A hard yellow helmet with a lamp on the front.', { glow: '#ffe9a0', ...hat(8) }),
  wearable('wear_explorer_hat', 'Explorer\'s hat', 'head', 'A felt hat with a wide brim and a red feather.', hat(4, { moveSpeed: 2 })),
  wearable('wear_straw_hat', 'Straw hat', 'head', 'A wide straw hat to keep off the sun.', hat(3, { burnResist: 10 })),
];
// Armor: what the player wears in four slots (ARMOR_SLOTS; core/inventory.js `worn`). Like the
// weapons these are base types; what drops, chests hold and the Smith sells is an instance with
// its own rarity, item level, affixes and name (core/gear/generate.js rollArmor; its stats:
// core/gear/stats.js armorStats). Base values at item level 1:
//   armor: how much it takes off a blow (core/gear/stats.js armorReduction), grown by item level
//     like weapon damage; block: a shield's chance to block a blow (most of it, all of its shove
//     and what it would set on you: game/enemycombat.js), in percent; speed: percent faster on
//     your feet (boots)
// The heavier bases only drop deeper down (core/gear/bases.js ARMOR_BASES). Their models are in
// the character's rest pose (blender/armor.py), in parts on the bones they follow (render/figure.js).
export const ARMOR_SLOTS = ['head', 'body', 'shield', 'feet'];
export const ARMOR_SLOT_NAMES = { head: msg('Head'), body: msg('Body'), shield: msg('Off hand'), feet: msg('Feet') };
const armor = (id, name, slot, value, description, more = {}) => ({
  id, name, category: 'armor', slot, stackLimit: 1, model: model(id), description,
  armor: { slot, armor: value, block: more.block ?? 0, speed: more.speed ?? 0, ...(more.perks && { perks: more.perks }) },
});
// the headwear among WEARABLES above, head armor too, and the things carried, off-hand armor
export const HATS = WEARABLES.filter(w => w.armor?.slot === 'head');
export const CARRIED = WEARABLES.filter(w => w.armor?.slot === 'shield');
export const ARMORS = [
  armor('armor_head_cap', 'Leather Cap', 'head', 5, 'A round cap of boiled leather. Better than nothing.'),
  armor('armor_head_skullcap', 'Iron Skullcap', 'head', 7, 'A plain iron bowl with a rim. It rings when hit.'),
  armor('armor_head_nasal', 'Nasal Helm', 'head', 9, 'A pointed helm with a bar down over the nose.'),
  armor('armor_head_horned', 'Horned Helm', 'head', 11, 'A heavy helm with two curved horns. Mind the doorways.'),
  armor('armor_head_great', 'Great Helm', 'head', 14, 'A whole bucket of steel with slits to see through.'),
  armor('armor_body_padded', 'Padded Vest', 'body', 12, 'Quilted cloth stuffed with wool. Warm, at least.'),
  armor('armor_body_leather', 'Leather Jerkin', 'body', 15, 'Stiff leather with shoulder pads and a broad belt.'),
  armor('armor_body_chain', 'Chainmail', 'body', 20, 'Thousands of little iron rings. It jingles.'),
  armor('armor_body_scale', 'Scale Coat', 'body', 25, 'Overlapping metal scales, like a fish that went to war.'),
  armor('armor_body_plate', 'Plate Armor', 'body', 30, 'A breastplate and big shoulder plates. Very shiny.'),
  armor('armor_shield_buckler', 'Wooden Buckler', 'shield', 3, 'A small round shield of planks, held in the fist.', { block: 10 }),
  armor('armor_shield_round', 'Round Shield', 'shield', 5, 'A painted round shield with an iron boss.', { block: 13 }),
  armor('armor_shield_kite', 'Kite Shield', 'shield', 7, 'Long and pointed at the bottom, to cover the legs too.', { block: 16 }),
  armor('armor_shield_heater', 'Heater Shield', 'shield', 9, 'A knight\'s shield with a crest on it.', { block: 19 }),
  armor('armor_shield_tower', 'Tower Shield', 'shield', 12, 'A wall you carry around.', { block: 22 }),
  // the prow shields (blender/armor.py): long, bent round the arm, from deep down
  armor('armor_shield_prow', 'Prow Shield', 'shield', 13, 'Bent round the arm like the prow of a ship, with a ruby at its point.', { block: 23 }),
  armor('armor_shield_bulwark', 'Bulwark', 'shield', 15, 'A steel prow with spikes on top. Things bounce off it.', { block: 25 }),
  armor('armor_shield_aegis', 'Aegis', 'shield', 17, 'Dark steel round a glowing stone. Blows hardly move you behind it.',
    { block: 27, perks: { steady: 15 } }),
  armor('armor_feet_sandals', 'Sandals', 'feet', 3, 'Leather straps and a sole. Light on the feet.', { speed: 3 }),
  armor('armor_feet_boots', 'Leather Boots', 'feet', 4, 'Good honest boots.'),
  armor('armor_feet_hobnail', 'Hobnail Boots', 'feet', 6, 'Heavy boots with iron nails in the soles.'),
  armor('armor_feet_greaves', 'Iron Greaves', 'feet', 9, 'Boots with iron plates up the shins.'),
  armor('armor_feet_winged', 'Winged Boots', 'feet', 8, 'Light boots with little wings at the heels.', { speed: 6 }),
];
// Things the quests have you find, carry and bring back (core/quests.js). A quest carries them,
// not a bag: they lie on the ground until somebody picks them up for the quest, and are never
// dropped, sold or put on the quick bar.
const questItem = (id, name, description) => ({ id, name, category: 'quest', stackLimit: 1, bound: true,
  model: model(id), description });
export const QUEST_ITEMS = [
  questItem('quest_locket', 'Locket', 'A heart-shaped gold locket with a little ruby on its lid.'),
  questItem('quest_toy_rabbit', 'Toy rabbit', 'A soft, well-loved toy rabbit with a blue ribbon.'),
  questItem('quest_letter', 'Letter', 'A sealed letter. It is not for you to open.'),
  questItem('quest_parcel', 'Parcel', 'A parcel wrapped in brown paper and tied with string.'),
  questItem('quest_map_scrap', 'Map scrap', 'A torn piece of an old map, with a red cross on it.'),
  questItem('quest_ring', 'Ring', 'A gold ring with a blue stone.'),
  questItem('quest_compass', 'Compass', 'A brass pocket compass. Its needle still points north.'),
  questItem('quest_journal', 'Journal', 'A small leather journal, full of notes and drawings.'),
  // made from the world's props (blender/items.py QUEST_PROPS), small, with a red bow and a tag:
  // what lies about as clutter, but this one is somebody's
  ...[
    ['backpack', 'Backpack', 'A traveller\'s backpack with a bedroll strapped on top.'],
    ['shield', 'Old shield', 'A battered round shield, its paint flaking.'],
    ['lantern', 'Lantern', 'An iron lantern with a ring to carry it by.'],
    ['pickaxe', 'Pickaxe', 'A miner\'s pickaxe, its handle worn smooth.'],
    ['flour_sack', 'Flour sacks', 'Two sacks of flour, tied at the top.'],
    ['cider_barrel', 'Cider barrel', 'A little barrel of apple cider.'],
    ['supply_crate', 'Supply crate', 'A wooden crate of supplies, nailed shut.'],
    ['fireworks', 'Fireworks', 'A box of red fireworks for a festival.'],
    ['singing_crystal', 'Singing crystal', 'A pale blue crystal that hums when you hold it.'],
    ['silver_bars', 'Silver bars', 'A stack of bars of silver.'],
    ['gears', 'Clockwork gears', 'Brass and iron gears from a clock.'],
    ['crucible', 'Crucible', 'A smith\'s crucible on its little stand.'],
    ['toadstool', 'Toadstools', 'Two red toadstools, picked with their roots.'],
    ['thunder_jar', 'Jar of thunder', 'A jar with a little storm cloud inside.'],
    ['bird_nest', 'Bird\'s nest', 'A nest with an egg in it, still warm.'],
    ['rainbow_crystal', 'Rainbow crystal', 'A cluster of crystals in every colour.'],
    ['crab', 'Pet crab', 'A red crab with one big claw. It pinches.'],
    ['ice_shard', 'Never-melting ice', 'Shards of ice that never melt.'],
    ['butter_lamps', 'Butter lamps', 'A tray of little lamps that burn butter.'],
    ['prayer_stone', 'Prayer stones', 'A pile of carved stones with little flags.'],
    ['wagon_wheel', 'Wagon wheel', 'A wagon wheel with two spokes broken.'],
    ['horned_skull', 'Horned skull', 'An old skull with long curved horns.'],
    ['pink_salt', 'Pink salt', 'Lumps of pink salt from the salt flats.'],
    ['painted_pots', 'Painted pots', 'Two clay pots painted with old patterns.'],
    ['paper_lantern', 'Paper lanterns', 'Little paper bags with candles in them.'],
    ['cave_mushrooms', 'Cave mushrooms', 'Pale mushrooms that only grow in the dark.'],
    ['ice_heart', 'Heart of ice', 'A crystal of ice that glows a cold blue.'],
    ['pearl_clam', 'Pearl clam', 'A big clam with a pearl inside.'],
    ['sea_glass', 'Sea glass', 'Smooth pieces of glass from the sea.'],
    ['spore_pod', 'Spore pod', 'A round pod full of glowing spores.'],
    ['pitcher_plant', 'Pitcher plant', 'A plant that catches flies in its cups.'],
    ['honey_pot', 'Honey pot', 'A pot of golden honey with a dipper in it.'],
    ['candles', 'Beeswax candles', 'Candles made of beeswax, a little melted.'],
    ['jade_idol', 'Jade idol', 'A small green idol with a feathered crown.'],
    ['incense_bowl', 'Incense bowl', 'A stone bowl for burning sweet incense.'],
    ['spider_eggs', 'Spider eggs', 'A clutch of big spider eggs. Careful!'],
    ['bone_lantern', 'Bone lantern', 'A lantern built of old bones.'],
    ['old_urn', 'Old urn', 'An old urn with two handles and a lid.'],
    ['stone_tablet', 'Stone tablet', 'A stone tablet carved with old writing.'],
    ['statue_head', 'Statue\'s head', 'The stone head of a statue, broken off.'],
    ['fire_crystal', 'Fire crystal', 'A crystal that is warm to the touch.'],
    ['obsidian', 'Obsidian', 'Black volcanic glass, sharp at the edges.'],
    ['void_crystal', 'Void crystal', 'A purple crystal from the bottom of the world.'],
    ['rune_stone', 'Rune stone', 'A black stone with a glowing red rune.'],
  ].map(([id, name, description]) => questItem(`quest_${id}`, name, description)),
];
// the quest things a quest may have you find, gather or carry (core/quests.js): all but the map
// scrap (a treasure's) and the letter and the parcel (a delivery's own)
export const QUEST_THINGS = QUEST_ITEMS.map(i => i.id).filter(id => !['quest_map_scrap', 'quest_letter', 'quest_parcel'].includes(id));
// what a list of worn and held item ids puts in each slot: { head, right, left } (missing: empty)
export function outfitOf(ids) {
  const out = {};
  for (const id of ids) {
    const slot = ITEMS[id]?.slot;
    if (!slot) throw new TypeError(`Not a wearable item: ${id}`);
    if (out[slot]) throw new Error(`Two things for the ${slot} slot: ${out[slot]} and ${id}`);
    out[slot] = id;
  }
  return out;
}
export const ITEMS = Object.fromEntries([...WEAPONS, ...COINS, ...POTIONS, ...stackables, ...TOOLS, ...WEARABLES, ...ARMORS, ...QUEST_ITEMS].map(i => [i.id, i]));
// items that are generated (core/gear/): a weapon or a piece of armor
export const isGear = itemId => !!(ITEMS[itemId]?.weapon || ITEMS[itemId]?.armor);
export const OLD_SWORD = WEAPONS[0];

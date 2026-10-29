# Armor

The hero wears armor in four slots: **head**, **body**, **shield** (the off hand) and **feet**. Armor is loot
like the weapons: every piece is an instance of a base with its own rarity, item level, affixes
and name (`core/gear/`, [loot.md](loot.md)); it drops from enemies, guardians and chests, and the
Smith in town sells it. It takes a share off the blows that land on you, a shield now and then
blocks one, and the affixes add health, healing, speed and resistances.

## Bases

`ARMORS` in `core/items.js`, dropping from the item levels in `ARMOR_BASES`
(`core/gear/bases.js`); five a slot (eight shields), a light one from item level 1, the heavier
ones deeper:

| Slot | Base (item level, armor) |
|---|---|
| Head | Leather Cap (1, 5), Iron Skullcap (2, 7), Nasal Helm (4, 9), Horned Helm (6, 11), Great Helm (8, 14) |
| Body | Padded Vest (1, 12), Leather Jerkin (2, 15), Chainmail (4, 20), Scale Coat (6, 25), Plate Armor (8, 30) |
| Shield | Wooden Buckler (1, 3, blocks 10%), Round Shield (2, 5, 13%), Kite Shield (4, 7, 16%), Heater Shield (6, 9, 19%), Tower Shield (8, 12, 22%), Prow Shield (9, 13, 23%), Bulwark (11, 15, 25%), Aegis (13, 17, 27%, 15% less shoved about) |
| Feet | Sandals (1, 3, 3% faster), Leather Boots (1, 4), Hobnail Boots (3, 6), Iron Greaves (5, 9), Winged Boots (7, 8, 6% faster) |

The hats the villagers and the people out in the world wear (`WEARABLES` in `core/items.js`, the
models of `blender/items.py`) are head armor too, `HATS`: light, each with a little something of
its own (`perks`, counted like affixes), half as likely as a helm each. They drop, the Smith sells
them, and the hero wears them like any armor:

| Hat | Item level, armor | Its own |
|---|---|---|
| Headscarf | 1, 2 | 10% faster healing |
| Hood | 1, 3 | 10% less hurt by poison |
| Straw hat | 1, 3 | 10% less hurt by fire (it keeps off the sun) |
| Explorer's hat | 2, 4 | 2% faster on your feet |
| Wizard hat | 3, 3 | 20% faster healing |
| Miner's helmet | 3, 8 | (a hard hat) |
| Welding mask | 4, 9 | 20% less hurt by fire |

The three prow shields are the deepest: long, bent round the arm like a ship's prow, a broad arched
top narrowing to a point, a double rim, a sunken triangle on the face and a finial on top
(`blender/armor.py Prow`). A base may have something of its own like the hats (`perks`): the
Aegis's is less shoved about.

What they carry in their hands (`CARRIED`) goes in the off hand, the shield's slot: a little armor,
a small chance to block and something of its own, each a little less likely than a shield. The
hero's right hand holds the weapon, so a right-hand thing (the crystal ball, the rope, the hammer)
goes into the left hand, mirrored (`render/figure.js wear`); with a bow it is put away (not shown,
no block), like a shield goes on the back.

| Carried | Item level, armor, block | Its own |
|---|---|---|
| Towel | 1, 1, 5% | 15% faster healing |
| Feed bag | 1, 1, 4% | +10 health (snacks) |
| Rope | 1, 1, 4% | 20% less shoved about |
| Pliers | 2, 2, 6% | 15% less hurt by fire |
| Hammer | 3, 3, 8% | 10% less shoved about |
| Crystal ball | 4, 2, 6% | 20% faster healing, 10% less hurt by poison |

A drop picks the slot first (each as likely, the bare ones three times), then a base of it by
weight. The shield's slot is called the off hand in the inventory.

## Stats

`armorStats` (`core/gear/stats.js`), worked out when read like a weapon's:

- **Armor**: `(base × (1 + 0.1 × (item level − 1)) × rarity + Sturdy) × (1 + Thick %)`; the
  rarity factor is the weapons' damage factor (×0.75 on Crap up to ×1.4 on OMG).
- What all the armor worn takes off a blow (`armorReduction`): `armor / (armor + 160 × (1 + 0.1 ×
  (level − 1)))`, the level being the striker's (`blow.by.level`), at most 75%. Armor grows as fast
  as enemy damage (`GROWTH.damage` in `core/enemies.js`), so a piece from as deep as the enemy takes
  off as much at every depth, and an old one less and less: a full set of the lightest Vanilla
  pieces takes off about an eighth, the heaviest nearly a third, rare ones more.
  `node tools/balance.mjs` prints `armor%` on arrival at every depth (the simulated player wears
  what it finds) and counts it in the blows the enemies need.
- **Block** (shields): the chance, in percent, that a blow is caught on the shield: it takes 20%
  of the blow (after the armor), and none of its shove or what it would set on you (fire, chill,
  poison, a stun). At most 50%. Only while the shield is in hand: a bow needs both hands, and the
  shield goes on the back then (it blocks nothing there).
- **Speed** (boots): percent faster on your feet, walking, running and leaping (not swimming).

Grabs (a boss's hands) are not blocked; burning and poison ticks, hazards and falls are not blows
and go past the armor (Oven Mitt and Iron Stomach take off their share).

## Affixes

`AFFIXES` in `core/gear/affixes.js`, rolled like a weapon's (count from the rarity, tier from the
item level); they only roll on armor (`armor`), or on one slot:

| Affix | Kind | On | Stat | Tier 1 | Tier 7 |
|---|---|---|---|---|---|
| Sturdy | prefix | all | + armor | 1–3 | 19–24 |
| Thick | prefix | all | + % armor | 5–10 | 43–52 |
| Blocky | prefix | shields | + % chance to block | 2–3 | 8–10 |
| Zippy | prefix | boots | % faster on your feet | 2–3 | 8–10 |
| of the Big Breakfast | suffix | all | + maximum health | 4–8 | 43–54 |
| of Licking Wounds | suffix | all | % faster healing (the regeneration after 5 s unhurt) | 10–15 | 46–55 |
| of the Oven Mitt | suffix | all | % less hurt by burning | 8–12 | 35–40 |
| of the Iron Stomach | suffix | all | % less hurt by poison | 8–12 | 35–40 |
| of Standing Firm | suffix | body, shields, boots | % less shoved by blows | 10–15 | 46–55 |

The resistances add up to at most 75%. Names come from `core/gear/names.js` with armor's own words
("Grim Shell", "Duskward", "Ur-Stoneguard, Mother of All Lids").

## Wearing it

- The inventory (I) has a **Wear** / **Take off** button for armor (Enter, a double-click); armor
  goes on and off at any time. What is worn stays in the bag (`inv.worn`: an instance id per
  slot, `core/inventory.js wearItem`, `takeOffItem`), like the weapon; dropping it takes it off.
  Under the hero a slot each shows what is worn (a click selects it, a double-click takes it off)
  and what it adds up to: the armor and what it takes off blows from enemies of the deepest depth
  reached, the block.
- The details of a piece say its armor, block and speed, its affixes, and compare it stat by stat
  with what is worn in its slot.
- The maximum health is `maxHealth(level)` plus the armor's (`core/progression.js fullHealth`);
  putting on health heals that much, taking it off only takes what is over the new maximum
  (`refreshMaxHp`).
- `game/armor.js`: every frame the hero wears what the bag says (`updateArmor`), and every blow
  goes through `guardBlow` (`game/enemycombat.js hitPlayer`) first. A block clangs (`sfx('block')`),
  sparks off the shield and shows "Blocked!".
- Saves keep `worn` (`core/save.js checkInventory`; a piece in the wrong slot or not in the bag is
  not worn).

## Drops and the Smith

- Ordinary enemies drop a piece 4% of the time (× the same √ of their XP as weapons, at most 12%),
  guardians one each (at least Decent, like their weapons), on a stream of its own
  (`core/gear/drops.js armorDrops`): weapons, potions and crystals drop as they did. Drops lean
  towards the slots you wear nothing in: those weigh three times as much (`bareSlots`).
- Chests (`CHEST_ARMOR` in `core/chests.js`): a basic one half the time (at least Vanilla), an
  uncommon and a rare one always (Decent), an exceptional one always (Unusual) and half the time a
  second (Decent); also leaning towards the bare slots.
- **The Smith** sells armor (`core/shops.js smithStock`): six pieces, one for every slot and two
  more, of the item level of the deepest depth reached in the world, never better than Unusual.
  He forges new ones every time you come back to town from out there (`run.smith.visit`, in
  `game/flow.js enterCube`); what you bought is gone until then (`run.smith.sold`, saved with the
  world). Price: `ARMOR_PRICE` by slot (head 60, body 120, shield 80, feet 50 copper) × `(1 + 0.75 ×
  (item level − 1))` × the rarity (`ARMOR_RARITY_PRICE`: Crap ×0.4 to Unusual ×2.5) × 15% more a
  level the base drops from later, rounded like the Smith's other prices. He re-rolls armor's
  affixes like a weapon's ([loot.md](loot.md#enchanting-and-re-rolling)); the Enchanter only works
  on weapons.

## How it looks

- The models are `blender/armor.py` (built and exported by `blender/items.py`: `Blender -b --python
  blender/items.py -- --only armor_`, then `node tools/compress-assets.mjs`). Every piece is made
  where it sits on the character in its rest pose, in parts that each name the bone they follow
  (`bone` in their extras): helms the head; a body armor's breastplate the spine, its belt the
  hips, its shoulder plates the upper arms, its tassets the thighs; boots the shins; a shield the
  left forearm. `render/figure.js wear` puts each part on its bone by the bone's rest frame
  (`restInverse`), so the armor follows the body without being skinned. `blender/armor_loadout.py`
  renders the hero in each set in a few clips (`Blender -b blender/character.blend --python
  blender/armor_loadout.py`).
- A shield is modelled on the outside of the left forearm, turned towards the front. Its extras
  say where it goes on the back (`back_bone`, `back_gltf`) and how it lies face up on the floor and
  in the pictures (`floor_gltf`, `render/itempictures.js layFlat`).
- A hat sits on the head's socket like on a villager (`socket`, `mount_*` in its extras), a thing
  carried on its hand's (without the villager's hold pose); a hat's band, hem or stars, a carried
  thing's binding, handles or fringe are its trim.
- Rarity: the trim (the material `Items_Trim`) is dull and rusty on Crap and Shitty, plain on
  Vanilla and Unremarkable, in the rarity's colour from Decent up, glowing and pulsing from
  Remarkable up, and runs through the rainbow on OMG; gems glow in the rarity's colour from Decent
  up (`render/figure.js shine`, `animateWorn`). On the floor armor glows by rarity like weapons
  (`render/loot.js`).
- Playing together the others see it ([online.md](online.md)): `me.worn` carries
  `id@rarity@back` for everything worn (`render/partner.js capturedLook`, `net/protocol.js
  wornOf`).

## Dev tools

With `?dev=1`: `/armor <armor> [rarity] [level] [drop]` rolls a piece and puts it on, or lays it
at your feet (`/armor great omg 20`); `/give <armor>` puts on a Vanilla one, and so does `/wear
<hat>` (`/wear off` takes off what is on the head).

## Tests

`tests/armor.test.js`: bases and models (parts, bones, the shield's extras, the trim), affixes,
the generator, stats and reduction, wearing, health, saves, drops, the Smith's wares and
re-rolls, what a friend sees. `tests/chests.test.js` the chests' armor.

In the browser console (`?dev=1`):

```js
await (await import('./tests/browser/armor.js')).runArmorChecks();   // wearing from the bag, parts on bones, rarity, health, blocks, the shield on the back, the Smith
```

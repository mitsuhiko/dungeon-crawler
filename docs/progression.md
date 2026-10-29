# Player progression, inventory and equipment

## Controls

- **I** opens/closes inventory, **U** opens it on its second tab, the quests
  ([quests.md](quests.md)); **Escape** or Close also closes it. The panel
  pauses simulation/animations and suppresses gameplay input, including attacks,
  movement, respawn, new world, portal debug controls, camera keys and zoom.
  Held/queued input is cleared on opening and closing; keyboard focus stays inside.
- When items lie within reach, the panel shows a Floor column beside the bag, to move items
  between the floor and the bag (see [loot.md](loot.md)). **V** opens it too.
- The selected item has a thick gold ring. With touch controls the bag button at the end of
  the quick bar (at the top) opens it ([touch.md](touch.md)).
- Select a bag slot to inspect it: a weapon shows its rarity, item level, kind, damage, attacks
  per second, damage per second, reach (a sword's) or range (a shot's), crits, piercing or
  bursts, and affixes (each with its name), and how it compares with the equipped one (damage
  per second first).
  **Equip** switches to an owned weapon, **Drop** puts an item
  down at your feet, **Use** uses a usable item (and closes the panel). Bag slots of Decent
  and better weapons are framed in their colour.
- **1**–**6** use the quick bar (see below). With the panel open they put the selected bag
  item on that slot instead.
- With **`?dev=1`**, the console's `/weapon <weapon> [rarity] [level] [drop]` rolls such a weapon
  (`docs/console.md`). Without that exact flag, the developer commands do not exist and the
  dev grant API refuses the operation.
- Equipment changes are blocked during attacks, travel, knockdown, stun, swimming
  and climbing. Close the panel to finish an action before changing weapons.

## Run state

A new hero starts with level 1, 0 XP, 100 HP, empty-handed, the Town Portal Scroll on quick bar
slot 1, three health potions on slot 2 and the Room Portal Scroll on slot 6. Its first weapon is the
Vanilla **Glassmaker's Old Sword**, stuck in the ground in the merchant camp of every world
([story.md](story.md#the-beginning), `core/intro.js`). With `?dev=1` the sword is in hand already,
with 5000 gold (`createPlayerStats`, `core/progression.js`: its `armed` is the sword in hand, as the
tests' heroes have it). Every hero carries both scrolls: a hero saved
before one existed gets it when loaded (`carryTools`, `core/progression.js`).
Progression, currency, inventory and equipment survive cube travel and death.
Death (or `R`) restores the current maximum HP; there is no death penalty yet. Death also
resets the cube to how it was when you came in: enemies killed since come back (and give XP
again), uncollected coins they dropped vanish; collected rewards are kept. Ordinary enemies also
come back after a while ([below](#enemies-come-back)).
`N` / `newWorld()` resets the run, including defeated enemy IDs and equipment.
State is **in memory only**, not saved across page reloads.

The numbers are in `PLAYER` (`core/progression.js`); [balance.md](balance.md) explains them.

- Next-level cost: `500 + 1000 × (L − 1) + 60 × (L − 1)²` XP (`xpToNext`); `xpForLevel` sums
  them. About one level per depth once past the road out of town.
- A kill's XP is scaled by the level difference (`xpScale`): full up to two levels below the
  player, then 20% less per level (at least 10%); 10% more per level above the player (at
  most 50%). Farming shallow depths does not pay.
- Maximum HP: `100 + 10 × (level − 1)`.
- Weapon damage: +2% per level after the first (`levelDamage`).
- Level-ups add the maximum-HP increase to living players, rather than fully healing.
- Grounded, non-swimming players regenerate 4% of their maximum HP per second after five
  seconds without damage. All damage paths share the same timer; inventory pauses that timer.
- **Potions** ([potions.md](potions.md)): health potions pour 25–100% of the maximum HP in
  within a second, others cure poison or quicken, strengthen or lift you for 30 s; flasks are
  thrown. Each kind has its own one-second cooldown (the quick bar slot fills meanwhile). No
  drinking while knocked down, no health potion at full health. Enemies drop them now and then,
  guardians always, chests hold them and the alchemist sells them.
- While **poisoned** (venomous bites, acid) the player does not regenerate.

## Inventory and coins

`core/items.js` defines item IDs, previews, assets, stack limits and base weapon stats;
`core/gear/` generates weapon instances ([loot.md](loot.md)).
`core/inventory.js` implements atomic bag/currency/equipment operations.

There are 24 normal bag slots and three reserved currency slots. Stackable items
have a 99-item limit per slot; weapons have individual instance IDs, carry their own
generated data (`gen`) and do not stack. Equipped gear references an owned instance, rather than copying an item.
Inventory insertion is all-or-nothing if capacity is insufficient.

**10 copper = 1 silver; 100 silver = 1 gold; 1 gold = 1,000 copper.**
Coins are item/count records, normalized after each transaction. Copper is 0–9,
silver 0–99, and gold is not subject to a normal stack limit. Operations use safe
integer copper values; spending returns change automatically. A full bag never
blocks coin rewards. There is no second wallet balance to synchronize.

Potions are drunk (`use: 'drink'`) or taken in hand and thrown (`use: 'throw'`), see
[potions.md](potions.md). Mana and stamina potions, crystals and sticks are registered
stackables but have no use actions or crafting yet (there is no mana or stamina).

**Tools** (`category: 'tool'`) are used, not used up. The only one is the **Town Portal
Scroll** ([world.md](world.md#town-portal-gametownportaljs)). It is **bound**: Drop is disabled
for it and `takeItem` refuses it, so it never lies on the floor and has no `model`; the bag
shows it as its `picture` model (`assets/items/item_town_portal.glb`). Every item shows as its
model wherever it appears (the bag, the quick bar, the potions at work, the chat's suggestions,
the touch buttons, the heroes in the main menu): `render/itempictures.js` renders each once into
a picture (the kids' guide's demos use it too), `render/itemviews.js` adds the inventory's live
views. There are no icon images in the game.

## Quick bar (`game/quickbar.js`)

Six slots along the bottom of the screen, on keys **1**–**6** or a click. A slot holds a
reference into the bag, not an item (`inventory.bar`, `assignBar` / `barEntry` in
`core/inventory.js`):

- Unique items (weapons, the scroll) are referenced by instance. Using a weapon equips it;
  if it leaves the bag, its slot clears.
- Stackables (potions) are referenced by item ID, so the slot uses any stack of it,
  shows the total and stays (greyed out) when none are left. Only items with a `use` action or
  a weapon go on the bar. A usable stackable that comes into the bag goes on the first free
  slot by itself unless it, or another of its family, is on the bar already (`autoBar`).
- A flask's slot takes it in hand to throw instead of the weapon (framed while it is); its slot
  again, or the weapon's, puts it away.
- With the inventory open (the bar stays above its backdrop, framed in gold), **1**–**6** or a
  click puts the selected bag item on that slot, moving it off any other slot. The same key
  again takes it off. Bag slots show their bar key in the corner.

## Enemy levels and rewards

Enemies are level `depth`, 1 on the surface (`depthLevel`). From depth 2, seeded variation is
−1 / 0 / +1 with weights 25% / 50% / 25%, clamped at level 1. Difficulty never follows the
player's level. Town and its surface buffer remain enemy-free. Animation timing, movement,
body size and knockback do not scale with level. Guardians stand a level (side) or two
(descent) above the depth from depth 1 on ([guardians.md](guardians.md)).

Every species grows at the same rate (`GROWTH` in `core/enemies.js`): +17% health, +10% damage,
+25% XP and coins per level, of its level-1 values. For example:

| Stat at enemy level L | Spider | Stunder |
|---|---|---|
| HP | `32 × (1 + .17 (L−1))` | `140 × (1 + .17 (L−1))` |
| Damage | `15 × (1 + .1 (L−1))` | `30 × (1 + .1 (L−1))` |
| XP | `20 × (1 + .25 (L−1))` | `80 × (1 + .25 (L−1))` |
| Coin range, copper | 4–8 × the same | 20–35 × the same |

Totals are rounded; a seeded integer roll is taken inclusively from the coin range
(`coinRange`). IDs, levels and rewards use the cube, species and spawn-floor ID, with a
separate stream from terrain/spawn placement. All species: [depths.md](depths.md).

On death, XP is credited at once; coins and sometimes a weapon or a health potion drop as loot
to pick up ([loot.md](loot.md)). The run remembers defeated enemy IDs, so revisiting
or rebuilding a cube cannot resurrect them or duplicate rewards (until they come back, below).
Surviving monsters reset on re-entry; their levels/drop rolls remain unchanged.

### Enemies come back

`core/respawn.js`. An ordinary enemy, one of a cube's own or of its horde (its spot says
`respawn`: the cube's key, `game/enemyspawn.js`), comes back once it has been dead for
`RESPAWN` (300 s) of play and its cube is entered (`game/flow.js beginVisit`): never in front
of you, and only one at a time as their times are up. Guardians, Gusto, Totnar, Squarlo, Flip, Foggery, Renew, Mansk, Monteur, Slomo, Qualmos, guardian defenders,
bounties, raiders, summoned minions and dev spawns never come back. So a player who needs to
can farm: for XP (which the level falloff keeps from paying off far below one's level) and above
all for loot.

- The clock is the world's play time (`run.clock`, `game/worldclock.js`), stopped while the game
  is paused (the inventory, the menu). Closing the game or the computer's clock change nothing.
  Playing together it is the host's, on real time ([online.md](online.md)): it does not stop.
- `run.kills` remembers each such kill: `id -> { n, at, cube }`. `n` is its life (how often it
  came back), `at` when it died. Ids do not change: what is defeated, quests, the co-op roster
  and the chronicle work as before.
- Each life rolls drops of its own: the life (`wave`) goes into the drop seed
  (`core/gear/drops.js`), coins are rolled again (`liveAgain`), and its loot has a source of its
  own (`e:<id>~<n>`, [loot.md](loot.md)). The first life is unchanged.
- A death in its cube brings an enemy back in the **same** life: dying re-rolls nothing.
- A friend in the cube already: nothing comes back, it stays as they have it
  ([online.md](online.md)).
- Saved with the world ([saves.md](saves.md)). Kills from before this existed are not in
  `run.kills` and stay dead.

`node --test tests/enemyrespawn.test.js` checks it.

## Weapons

These are the base types (`core/items.js`), five of each kind besides the Glassmaker's Old Sword
(eight staffs, three tridents). A weapon
instance scales the damage by its rarity and changes its stats with its affixes
([loot.md](loot.md)); combat reads only the instance's stats (`core/gear/stats.js`). How the
ranged kinds attack: [combat.md](combat.md#bows-crossbows-and-staffs), the flails:
[combat.md](combat.md#flails), the tridents: [combat.md](combat.md#tridents).

### Swords

| Sword | Damage | Interval, seconds | Damage per second | Reach, cells | Arc | Drops from item level |
|---|---:|---:|---:|---:|---:|---:|
| Glassmaker's Old Sword | 30 | .42 | 71 | .85 | ×1 | never |
| Short | 23 | .32 | 72 | .72 | ×1 | 1 |
| Medium | 34 | .42 | 81 | .85 | ×1 | 1 |
| Long | 39 | .48 | 81 | 1.05 | ×1 | 2 |
| Broad | 46 | .54 | 85 | .88 | ×1.25 | 4 |
| Greatsword | 60 | .66 | 91 | 1.15 | ×1.3 | 6 |

Damage is at item level 1; it grows 5% per item level. The interval is the real time from one
swing to the next when chaining (the attack speed). All use the existing Slash clip, scaled in
time with the corresponding wind-up, active interval and recovery: the heavy swords hit later
and plant you for longer. Swing stats are captured at attack start, so even
leveling up during a sweep cannot change its remaining hits. Blade arc, vertical
overlap, line-of-sight and one-hit-per-target rules still apply. The greatsword
currently uses the same one-handed prototype animation, not a new moveset.

### Flails

Morning stars: one, two or three spiked balls on chains, swung like a sword (the same Slash clip,
`FLAIL` timing: slower to come round, a longer active window, [combat.md](combat.md#flails)),
sweeping wider than any sword and shoving half again as hard (`knockback` ×1.5). With more than
one ball each strikes in turn, so the damage is a ball's and the damage per second counts them
all. They only drop from item level 7, Renew's level: he always drops one
([bosses.md](bosses.md#renew)).

| Flail | Damage | Balls | Interval | Per second | Reach | Arc | Drops from |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ball and Chain | 46 | 1 | .58 | 79 | .95 | ×1.4 | 7 |
| Morning Star | 53 | 1 | .62 | 85 | 1 | ×1.45 | 7 |
| Twin Morning Star | 32 | 2 | .68 | 94 | 1 | ×1.5 | 8 |
| Knight's Flail | 62 | 1 | .70 | 89 | 1.15 | ×1.35 | 9 |
| Triple Flail | 24 | 3 | .74 | 97 | .95 | ×1.55 | 10 |

### Tridents

A long shaft and three prongs ([combat.md](combat.md#tridents)): close up a stab, a narrow thrust
(arc ×0.3) through everything in a line, at its reach; further off its lightning, for 60% of the
stab's damage, as far as its range. They stab about as hard per second as a sword of their depth
and drop from item level 3; Squarlo (depth 2) drops one half the time for each of his weapons
(`leansTo`, [loot.md](loot.md#drops)).

| Trident | Damage | Interval | Per second (stab, lightning) | Reach | Lightning range | Jumps | Drops from |
|---|---:|---:|---:|---:|---:|---:|---:|
| Fisher's Trident | 38 | .52 | 73, 44 | 1.25 | 4.5 | 0 | 3 |
| Trident | 48 | .58 | 83, 50 | 1.35 | 5 | 0 | 5 |
| Storm Trident | 58 | .66 | 88, 53 | 1.45 | 5.5 | 1 | 8 |

### Bows, crossbows and staffs

Shooting from afar is safer, so these deal less per second than swords of the same weight;
the range is how far a shot flies. Bows are quick and reach furthest, crossbows hit hard and
slowly and their bolts pierce, staffs are slow and their spells burst over a radius (half the
damage to everything else there).

| Bow | Damage | Interval | Per second | Range | Drops from |
|---|---:|---:|---:|---:|---:|
| Short Bow | 22 | .44 | 50 | 5 | 1 |
| Hunting Bow | 30 | .56 | 54 | 6 | 1 |
| Recurve Bow | 35 | .62 | 56 | 6.5 | 3 |
| Longbow | 44 | .74 | 59 | 8 | 5 |
| War Bow | 54 | .84 | 64 | 7 | 7 |

| Crossbow | Damage | Interval | Per second | Range | Pierces | Drops from |
|---|---:|---:|---:|---:|---:|---:|
| Hand Crossbow | 34 | .66 | 52 | 4.5 | 0 | 1 |
| Light Crossbow | 46 | .84 | 55 | 5.5 | 1 | 2 |
| Heavy Crossbow | 64 | 1.04 | 62 | 6 | 1 | 4 |
| Repeating Crossbow | 27 | .45 | 60 | 5 | 0 | 6 |
| Arbalest | 86 | 1.28 | 67 | 7 | 2 | 8 |

| Staff | Damage | Interval | Per second | Range | Burst, cells | Spell | Drops from |
|---|---:|---:|---:|---:|---:|---|---:|
| Gnarled Staff | 27 | .58 | 47 | 4.5 | .5 | green | 1 |
| Oak Staff | 33 | .62 | 53 | 5 | .6 | blue | 2 |
| Ember Staff | 41 | .70 | 59 | 5 | .85 | orange | 4 |
| Crystal Staff | 47 | .74 | 64 | 5.5 | .7 | ice | 6 |
| Arcane Staff | 58 | .84 | 69 | 6 | 1 | violet | 8 |

The lightning staffs (the staff itself a bolt of lightning) cast lightning instead: it strikes
almost at once and jumps on to more enemies nearby, each jump for 70% of the one before
([combat.md](combat.md#bows-crossbows-and-staffs)).

| Lightning staff | Damage | Interval | Per second | Range | Jumps | Lightning | Drops from |
|---|---:|---:|---:|---:|---:|---|---:|
| Spark Staff | 38 | .64 | 59 | 5.5 | 1 | yellow | 5 |
| Lightning Staff | 48 | .72 | 67 | 6 | 2 | blue | 8 |
| Thunderbolt | 55 | .80 | 69 | 6.5 | 3 | violet | 11 |

Each kind plays its own clip (Shoot, CrossbowShot, Cast; a trident Thrust), scaled in time like
Slash, and is carried in its own hold pose.

`game/equipment.js` prepares/caches assets and then commits ownership selection
and visual attachment together. Failed or stale asynchronous requests cannot
replace the current weapon or cross a new-run reset. Weapons mount at unit local
scale under the already-scaled fist their extras name (bows `hand.L`, the rest `hand.R`);
swimming/climbing hides them. The Glassmaker's Old Sword never
drops; the others drop as generated weapons ([loot.md](loot.md)). Dropping every weapon is
allowed and leaves you unable to attack. The alchemist sells potions ([potions.md](potions.md));
no other shops, durability or armor are implemented. With `?dev=1` a run starts with 5000 gold.

## Tests

`npm test` covers stacking/capacity/instance identity, the quick bar's references, the bound
scroll, potions on the bar, conversion and
change, integer validation, XP thresholds, XP scaling and multi-level gains, scaled enemy
profiles, deterministic rewards, exactly-once deaths, regeneration, potions, every weapon's
assets/stats/timing and swing snapshots.

In the game console:

```js
const checks = await import('./tests/browser/inventory.js');
await checks.runInventoryChecks();
```

This resets to a seed-3 run before and after checking the real modal, input pause,
pictures/counts, all six swords and a bow, crossbow and staff mounted in their sockets, dev gating, ordinary slot equipment, death
rewards, cube revisits, max-HP respawn, new-run reset and asynchronous race handling.
The existing combat/climbing/travel browser checks remain available; see
[combat.md](combat.md).

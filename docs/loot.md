# Loot

Enemies drop coins, now and then a weapon, a piece of armor, a potion or a crystal; guardians
always drop weapons, armor, potions and crystals; treasure chests at reward sites hold all of them.
Weapons are generated: each one is an instance of a base weapon (a sword, flail, trident, bow, crossbow or staff)
with its own rarity, item level, affixes and name; armor the same way, with bases and affixes of
its own ([armor.md](armor.md)). In town the Enchanter puts an enchantment on a weapon (for copper
and crystals) and the Smith re-rolls affixes (for copper) and sells armor: see [Enchanting and
re-rolling](#enchanting-and-re-rolling). The generator lives
in `src/core/gear/` and is pure and seeded; the floor, pickup and inventory code in
`src/game/loot.js`, `src/game/lootlabels.js`, `src/game/inventory.js` and `src/render/loot.js`;
chests in `src/core/chests.js` and `src/game/chests.js`. How much of it there is and why:
[balance.md](balance.md).

## Controls

- **F** or **right Ctrl** is the action key (`game/action.js`): it does the first that works of
  opening the closed treasure chest beside you, trading with the villager beside you and
  collecting every coin and stackable item within four cells (only when there is one; else it
  does nothing). On touch screens the use button above the action button does the same.
  Enter is the chat.
- Weapons and armor are **not** taken by walking over them, by the coin magnet or by collecting (the action key).
- **Click** a weapon or a piece of armor (or its label) to walk there and pick it up. The enemy under the cursor
  still wins over an item; an item wins over a chest, a chest over the floor. A full bag says so
  and leaves it.
- **Click** a closed treasure chest (or its label, "Treasure chest", coloured by how grand the
  site is) to walk up and open it. Standing next to one, **F** or **right Ctrl** (the action key,
  `game/action.js`) opens it. X labels chests too.
- Potions are taken by walking over them or by collecting, like coins, and go on the quick
  bar by themselves (one of each family, [potions.md](potions.md)).
- **X** toggles name labels over every item on the floor but coins. Without it only the item
  under the cursor shows its name. Labels are in the rarity's colour and stack instead of
  overlapping; they are clickable.
- **I** (or **V**) opens the inventory (paused) with a **Floor** column beside the bag whenever
  something lies within collecting reach (4 cells across, 1.5 up or down): every item but coins, best
  first, then nearest. Once shown it stays while the panel is open (dropping the first item
  shows it). Take moves a floor item into the bag, Drop puts a bag item down at your feet.
  Enter (or Space) on a floor item, or a double-click, takes it; on a bag item it equips or
  uses it; arrows move through both columns. I, V or Esc closes.
- With touch controls ([touch.md](touch.md)) a long press on the game collects like the action key.
- Weapons can go on the quick bar (**1**–**6**, see `docs/progression.md`): using one equips it.
  The Town Portal and Room Portal Scrolls are bound and cannot be dropped.
- You may drop every weapon, including the equipped one and the last one. Without a weapon you
  cannot attack ("No weapon equipped") until you pick one up and equip it.
- Items you put down are `kept`: a death leaves them on the floor, while weapons enemies dropped
  during that visit go with the rest of the visit (see `docs/progression.md`).
- Loot lies on the **ground that stays** (`physics/rest.js`): a body floating or flying when it
  dies scatters it round the floor under it, never on one of Foggery's platforms (it would slide
  away from under it) and never into a pit of lava or acid; a dry spot first, else one under a
  standing fluid that will drain (a boss's lava, a trial's flood). Ground that goes from under a
  pickup (a crumbling crust, a black hole opening) lets it fall onto the ground under it; with
  none, or a pit, it goes to the nearest dry spot at once. Coming into a cube (or a save, or a
  friend's world) it lies where it rests at once, unseen. Nothing under such a fluid too deep to
  wade can be taken (walked over, pulled in, collected, clicked) until it drains.
- Playing together the floor loot and the chests are shared: one copy of every pickup, for
  whoever takes it first; the killer's or opener's game rolls the drop (see `docs/online.md`,
  Rewards).

## Item data

A bag slot or pickup holding a weapon carries its own `gen`:

```js
{ itemId: 'weapon_sword_long', count: 1,
  gen: { v: 1, rarity: 'unusual', ilvl: 7, affixes: [{ id: 'swift', tier: 2, value: 8 }, ...], name: 'Duskfang',
    enchant: 'toasty' } }
```

Items keep what they rolled (not a seed), so retuning the tables does not change weapons
already found; `v` is the generator version. `enchant` (optional) is the Enchanter's: only which
enchantment, its strength follows from the weapon (see below). `core/gear/stats.js` `itemStats` turns an item
into the stats combat reads; nothing else looks at base weapon stats. A weapon without `gen`
(dev grants, tests) counts as Vanilla. The first weapon is a Vanilla **Glassmaker's Old Sword**,
found by the crash in town ([story.md](story.md#the-beginning)).

## Generation

`rollWeapon(rng, ilvl, opts)` in `core/gear/generate.js`: rarity, then base, then affixes,
then name, each from a table. `opts.favor` (the kind of weapon the player has equipped) makes
the base lean towards that kind.

| Rarity | Weight | Min. item level | Affixes | Base damage | Floor glow |
|---|---:|---:|---:|---:|---|
| Crap | 11 | 1 | 0 | ×0.75 | none |
| Shitty | 14 | 1 | 0 | ×0.88 | none |
| Vanilla | 28 | 1 | 0 | ×1.00 | none |
| Unremarkable | 14 | 1 | 0 | ×1.03 | none |
| Decent | 22 | 1 | 1 | ×1.06 | ring |
| Unusual | 8 | 1 | 2 | ×1.11 | ring, pool of light |
| Remarkable | 2.2 | 4 | 3 | ×1.17 | + short beam |
| Fabled | 0.42 | 8 | 4 | ×1.24 | + tall beam, sparks |
| Impossible | 0.07 | 13 | 4 (+1 tier) | ×1.32 | + turning runes, a real light |
| OMG | 0.014 | 17 | 5 (+2 tiers) | ×1.40 | + very tall beam, everything cycling through the rainbow, the weapon hopping (guardians only) |

Unremarkable rolls no affixes on purpose: it is a slightly better plain weapon and nothing more.
OMG's rainbow (`glow.rainbow`) also shows in the UI: its label, name, chronicle line and slot
backdrop cycle through every hue (`.rainbow` in `style.css`; a fixed colour with reduced motion).

Each rarity's weight is multiplied by `exp((0.025 × (ilvl − 1) + luck) × rank)`, so better
rarities grow more likely with item level, but slowly: at item level 20 about 8% of weapon
drops are Remarkable, 3% Fabled and under 1% Impossible. A rarity floor (guardians, chests) above what
the item level allows comes down to the best it does allow. `node tools/loot-table.mjs [n]`
prints the odds per level and per guardian (and `n` sample weapons per rarity).

**Bases** (`core/gear/bases.js`): five of each kind (eight staffs, three tridents), a light one
or two from item level 1 and heavier ones further down, the heaviest from item level 12 to 16, so
something new turns up all the way down (swords: short and medium from 1, long 4, broad 8,
greatsword 12; bows: short and hunting 1, recurve 4, longbow 8, war bow 12; crossbows: hand 1,
light 3, repeating 6, heavy 9, arbalest 14; staffs: gnarled 1, oak 2, ember 5, crystal 9, arcane
12, and the lightning staffs spark 7, lightning 13, thunderbolt 16). A kind's weights add up
to the same (each staff weighs 5/8, each trident 5/3), so each kind is as likely as the others
once all of it drops. The tridents from item level 3 (fisher's 3, trident 7, storm 12): Squarlo
(depth 2) leans towards them, each of his weapons a trident half the time, any of the three
(`leansTo`). The flails
only from item level 7, Renew's (ball and chain 7, morning star 9, twin morning star 11,
knight's flail 13, triple flail 15): he always drops one first, any of the five
(`ownWeapon`), so he is the first to hand you one. The Glassmaker's Old Sword never drops. Their stats are in [progression.md](progression.md#weapons). A base's damage
grows **5% per item level** (`ILVL_DAMAGE`), so a weapon from ten depths further down hits half
again as hard as the same one from the top.

**Smart loot**: every base weighs the same, except that bases of the kind the player has
equipped when the loot rolls weigh `FAVOR` (3) times as much: once every kind drops, about three
in eight of the weapons are of your kind and the rest spread over the other five. So whatever you fight
with keeps finding upgrades and you still see the others. A sword player arrives at each depth
with about 6% less damage per second than when swords were all there was
(`node tools/balance.mjs`).

**Affixes** (`core/gear/affixes.js`), each at most once per item, at most three prefixes and
three suffixes. Swooshy and of Long Arms roll only on swords, flails and tridents (`melee`), of Far Away only on bows,
crossbows, staffs and tridents (`ranged`; a trident's reach takes Long Arms, its lightning Far Away), the rest on all. The item level picks the tier (1: 1–3, 2: 4–7, 3: 8–12, 4: 13–18, 5: 19+);
Impossible and OMG reach one or two tiers above (up to 7). The item's tooltip shows each
affix's stat line with its name beside it.

| Affix | Kind | Stat | Tier 1 | Tier 7 |
|---|---|---|---|---|
| Pointy (`sharp`) | prefix | + damage | 2–4 | 29–38 |
| Rude (`brutal`) | prefix | + % damage | 4–8 | 37–45 |
| Twitchy (`swift`) | prefix | % faster attacks (all swing times) | 3–6 | 21–25 |
| Swooshy (`sweeping`) | prefix | + % swing arc | 8–15 | 55–65 |
| Sneaky (`vicious`) | prefix | + % critical chance | 3–5 | 18–22 |
| of Long Arms (`reach`) | suffix | + reach (cells) | 0.05–0.08 | 0.30–0.36 |
| of Far Away (`distance`) | suffix | + % range (shots) | 5–9 | 38–46 |
| of Second Helpings (`leech`) | suffix | + life on hit | 1–2 | 13–17 |
| of the Big Shove (`force`) | suffix | + % knockback | 15–30 | 125–150 |
| of Right Where It Hurts (`precision`) | suffix | + % critical damage (base ×1.5) | 10–20 | 85–100 |

Damage is `(base × item level growth × rarity + flat) × (1 + percent)`, rounded, then × the
player's level bonus (+2% a level). Every weapon crits 5% of the time for ×1.5 before affixes; a
critical hit shows a bigger golden number. Life on hit never heals past the maximum. Stats are
computed when read, so retuning bases, rarities or item-level growth changes weapons already
found.

**Names** (`core/gear/names.js`) are generated for every rarity, mostly earnest with some
sillier words mixed in: Crap to Unremarkable get a word and the base ("Soggy Long Sword",
"Perfectly Fine Long Sword"), Decent two words ("Sneaky Nibbler"), Unusual a compound
("Goblinbotherer"), Remarkable a compound and a title ("Frostbite the Mildly Cursed"), Fabled
and Impossible a compound and an epithet ("Grimfang, Eater of Lunches", "Doomsong, That Should
Not Be"), OMG an old root, a compound and an epithet ("Ur-Stormreaver, Mother of All Pointy
Things"). The base type shows under the name where the name does not say it. An enchanted
weapon shows its enchantment in front of the name ("Toasty Duskfang", `core/gear/stats.js
displayName`); `gen.name` keeps the name it was found with, so a new enchantment renames it.

## Drops

`enemyDrops(enemy, worldSeed, favor)` in `core/gear/drops.js` (`weaponDrops` and `potionDrops`),
seeded by the world seed, the enemy id and its life: the same enemy always drops the same thing
in one life (also after a death brings it back, like its coins) as long as you fight with the
same kind of weapon (`favor`, see smart loot). An enemy that comes back after a while
([progression.md](progression.md#enemies-come-back)) is in its next life (`wave`) and rolls
anew; its drop's source is `e:<id>~<life>` (the first life's stays `e:<id>`). The item level
is the enemy's level.

- Which potion is drawn by the item level from those that drop there, weighted, health
  potions the likeliest (`potionTable`, [potions.md](potions.md)); chests likewise.
- Ordinary enemies: a weapon 5%, a potion 3% and a crystal 1.5% of the time, all × √(the
  kind's level-1 XP / 30): a spider 4% / 2.5% / 1.2%, a Stunder 8% / 5% / 2.4%, a Triangle 10% /
  6% / 3%. Kinds with drops of their own (a boss's minions) drop no crystals.
- Armor ([armor.md](armor.md)): ordinary enemies a piece 4% of the time (× the same √),
  guardians one (at least Decent), on a stream of its own, leaning towards the slots you wear
  nothing in. Kinds with drops of their own drop none.
- Side guardians: one weapon, at least Decent (Unusual from level 10), luck 0.1; one potion; one
  crystal.
- Descent guardians: two weapons, at least Decent (Unusual from level 5, Remarkable from 14),
  luck 0.2; two potions; two crystals. Renew's first weapon is always a flail (`ownWeapon`), each
  of Squarlo's a trident half the time (`leansTo`).
- Crystals (ruby, emerald, sapphire, amethyst, diamond: `core/items.js CRYSTALS`) are each as
  likely, rolled on a stream of their own (`crystalDrops`), so weapon and potion drops are as
  they were. They stack to 99 and are taken like potions (walking over them, collecting).
- OMG drops only from guardians.

## Chests

Every stratum budgets four reward sites, each with a treasure chest ([world.md](world.md)):
two basic, one uncommon and one rare (now and then exceptional). `chestLoot(site, depth, seed)`
in `core/chests.js` decides what one holds, seeded by the site (its weapons lean towards your
kind like drops do); `CHESTS` is the table:

| Site | Item level | Copper at level 1 | Potions | Crystals | Weapons |
|---|---|---|---|---|---|
| Basic | depth | 25–45 | 0–1 | 0–1 | one, at least Vanilla |
| Uncommon | depth + 1 | 50–90 | 1 | 1 | one, at least Decent |
| Rare | depth + 1 | 100–160 | 1–2 | 1–2 | at least Unusual and at least Decent |
| Exceptional | depth + 2 | 180–280 | 2 | 2–3 | at least Remarkable and at least Unusual |

(The site prestiges, basic to exceptional, are not rarities: they rank reward sites, `world/sites.js`.)

Armor comes on a stream of its own (`CHEST_ARMOR`): a basic chest a piece half the time (at least
Vanilla), an uncommon or rare one a Decent one, an exceptional one an Unusual one and half the time
a second (Decent); see [armor.md](armor.md).

Copper grows like enemy coins. Weapons roll with luck (0.1 to 0.45 by prestige). Opening a chest
(`game/chests.js`) adds its site to `run.chests`, opens the model and, once the lid's `Open` clip has
played out, spills the loot in front of it. Until then the pickups lie in it, shrunk to fit on its
floor (`render/chests.js stowLoot`: coins at the bottom, the weapons along the top), so the chest
opens full; they grow back as they fly out. The chest stays open for the run and what it spilled is `kept`: a death takes neither
back.

## Enchanting and re-rolling

Two villagers in town work on your weapons (`core/shops.js` `service`, the rules in
`core/crafting.js`). Talk to them (click, or the action key beside them) and the bag opens; the
weapon they work on is the last one selected in the bag, at first the equipped one (a teal ring
marks it while something else is selected). Selecting a weapon makes them comment on its
rarity ("I can enchant this. I'd rather nobody watched." for Crap, "...I need to sit down." for
OMG: `ENCHANTER_SAYS`, `SMITH_SAYS`). Below the description the details show exactly what it costs,
every coin and crystal with its picture and how many you have (red when it is not enough,
`game/inventory.js priceHtml`), only for what you would do: a selected enchantment its price on
the weapon, at the Smith what one re-roll of the selected weapon costs (the alchemist's wares
show their price the same way).

**The Enchanter** (the market in town, by the herb stall) puts one enchantment on a weapon. Her
column shows the five, each as its crystal (dimmed when you cannot have it now, ringed when the
weapon has it); one selected says what it would do on that weapon and what it costs, and
**Enchant** (Enter, a double-click) does it. A weapon has one enchantment at most: a new one
replaces the old. Enchantments are separate from affixes and loot never rolls them
(`core/gear/enchants.js`):

| Enchantment | Crystal | What a hit does | Tier 1 | Tier 7 |
|---|---|---|---|---|
| Toasty | ruby | sets it burning for a share of the hit over 3 s, unless it burns already (fire does not hurt the fiery kinds) | 60% | 120% |
| Icky | emerald | adds a share of the hit to its poison, spread over the next 4 s: it piles up | 8% | 20% |
| Nippy | sapphire | slows all it does (moving, thinking, striking) for 2 s; at most 50% | 15% | 33% |
| Zappy | amethyst | a chance to stun it for 0.6 s (not bosses, nor what cannot be staggered) | 6% | 12% |
| Shiny | diamond | more coins from what dies while it is equipped | 15% | 50% |

The weapon keeps only which enchantment it has (`gen.enchant`); its strength follows from the
weapon: the tier from its item level like an affix's (Impossible and OMG one or two above),
times the rarity's damage factor (×0.75 on Crap up to ×1.4 on OMG). Guardians and bosses take
half of a slow and of a stun. Toasty suits slow, heavy blows (one burn at a time), Icky quick
ones (every hit adds). The hits: `game/enchants.js`, called after our own blade hits and shots
land; the statuses on enemies: `game/statuses.js` (`chilled`, `zapped`), the slow in
`game/enemyai.js stepEnemies`, frost and sparks in `render/statuses.js`; Shiny in
`game/loot.js dropLoot`. Each enchantment is worth roughly one mid-tier affix.

It costs copper and crystals of the enchantment's kind: one crystal, two from item level 8,
three from 16; copper `300 × (1 + 0.75 × (item level − 1))`, rounded to two figures (300 at
item level 1, 2300 at 10, 4400 at 19). That is about a quarter of what the depth of the weapon
pays (`node tools/balance.mjs` prints both).

**The Smith** (at the anvil in town) re-rolls one affix: with a weapon or a piece of armor
selected, every affix line has a **Re-roll** button. His column holds the armor he sells
([armor.md](armor.md#drops-and-the-smith)). The line becomes a fresh affix that may roll on the weapon and is
not on it already (the same one again too, with a new value), keeping the prefix and suffix
limits and the old line's tier (`core/gear/affixes.js rerollAffix`). Weapons without affixes
(Crap to Unremarkable) have nothing to re-roll. It costs copper only:
`80 × (1 + 0.75 × (item level − 1))` × the rarity's factor (Decent 1, Unusual 1.25, Remarkable 1.5,
Fabled 2, Impossible 2.5, OMG 3), a few percent of what a depth pays.

Both are all or nothing, and replace the item's `gen` rather than change it. The chronicle
notes them (`craft`). With `?dev=1`, `/enchant <enchantment|off>` enchants the equipped weapon
for free.

## Extending

- A new rarity: a row in `RARITIES` (weight, gate, affix count, tier bonus, damage factor,
  colour, glow). The tests check the ordering.
- A new affix: an entry in `AFFIXES` whose `stat` `itemStats` applies (add the stat there and
  in combat if it is new). Every tier is validated by `tests/gear.test.js`.
- A new enchantment: an entry in `ENCHANTS` (its crystal, tiers, text and quip), what its hit
  does in `game/enchants.js`, and the Enchanter's line in `ENCHANTED_SAYS`
  (`tests/enchanting.test.js` checks them).
- A new dropping weapon: the item in `core/items.js` (model, kind, base stats), then a
  row in `BASES` with its item level; its tags (its kind, melee or ranged) come from its kind.
  Affixes roll on bases whose tags they list. A new kind also needs its timing and clip
  (`KINDS` in `core/combat.js`), a hold pose and mount (`blender/character.py`,
  `blender/items.py`) and, if it shoots, a shot (`core/shots.js`).
- Uniques or other item kinds can come in as further `rollWeapon` options or another
  generator writing the same `{ itemId, count, gen }` shape.

## Dev tools

With `?dev=1` the console (`` ` ``, `docs/console.md`) rolls a weapon of any base, rarity and item
level: `/weapon <weapon> [rarity] [level] [drop]` puts it in the bag and equips it, or with `drop`
lays it on the floor (`/weapon grsw omg 20 drop`); `/armor` does the same for armor. `__game.devDropWeapon(itemId, rarity, ilvl)`
does the same from the browser's devtools.

## Tests

`tests/gear.test.js` covers rarity odds and gates, deterministic JSON items, affix validity
and tiers, names, stats, item-level growth, drop and potion rates and guardian floors, item
instances in the bag, crits and life on hit; `tests/chests.test.js` the chest table;
`tests/enchanting.test.js` enchantments, crystal drops, the Enchanter's and the Smith's prices
and work. In the
browser console:

```js
const checks = await import('./tests/browser/inventory.js');
await checks.runWeaponLootChecks();   // guardian drops, walk-over / collect, labels, click pickup, the floor column, drops, deaths
await (await import('./tests/browser/chests.js')).runChestChecks();   // hover, click, open, spill, deaths, potions
await (await import('./tests/browser/chests.js')).runActionKeyChecks();   // F / right Ctrl: chest, collect, nothing, trader; Enter chats; the use button
```

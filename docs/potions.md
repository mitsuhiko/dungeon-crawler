# Potions, flasks and the alchemist

![The potions and flasks, with the rest of the items](../learn/img/model-items.jpg)

Potions are stackable items (`core/items.js POTIONS`, category `potion`) in two families:
drinks put a timed effect on you, flasks are thrown. They drop from enemies, lie in chests and
are sold by the alchemist in the merchant camp. Their rules are pure (`core/potions.js`,
`core/status.js`, `core/throws.js`, `core/shops.js`); the game runs them in `game/quickbar.js`,
`game/throws.js`, `game/statuses.js` and `game/inventory.js`.

| Potion | Does | Price (level 1) | Drops from item level |
|---|---|---:|---:|
| Minor health potion | 25% of the maximum health, poured in over 0.5 s | 1s 5c | 1 |
| Health potion | 40%, over 0.6 s (a run starts with three) | 4s | 1 |
| Greater health potion | 60%, over 0.7 s | 11s | 5 |
| Superior health potion | all of it, over 0.8 s | 26s | 10 |
| Antidote | cures poison and keeps it off for 30 s | 3s | 3 |
| Swiftness potion | +30% movement speed (runs and leaps) for 30 s | 7s | 2 |
| Haste potion | +25% attack speed for 30 s | 9s | 3 |
| Potion of might | +30% damage (weapons and flasks) for 30 s | 9s | 3 |
| Leaping potion | jumps 50% higher for 30 s, landing as softly as a plain jump | 6s | 2 |
| Blast flask | explodes: up to 55 damage within 1.6 cells, a strong shove | 6s | 2 |
| Fire flask | 12 damage, sets everything within 1.4 cells on fire (45 over 4 s), the ground burns 4 s | 7s | 3 |
| Toxic flask | poisons everything within 1.8 cells (60 over 6 s), the cloud lingers 6 s | 7s | 4 |

Flask numbers are at player level 1; they grow 17% of that per level (`flaskPower`), as fast
as enemy health grows with theirs. The prices are at level 1 too: deeper down they grow like the
Smith's and the Enchanter's (below).

## Drinking

A drink is used from the quick bar or the bag (**Use**, labelled *Drink*). `drinkPotion` puts
its effect on the player (`player.effects`) and starts **its cooldown** (`player.cooldowns`):
each kind has its own, one second, so a buff and a flask never wait for each other, but the
**health potions share one** of two seconds (`HEAL_TIME`, `cooldownOf`): whatever heals you,
it is one health potion every two seconds, so a stack of cheap potions does not make you
unkillable. A health potion is refused at full
health, nothing is drunk while knocked down.

- Health pours in over its time (well under a second); two kinds pour in side by side, and
  each always pours in all of it (`tickEffects`, every player step).
- Buffs (`BUFFS`: `moveSpeed`, `attackSpeed`, `damage`, `jump`) add their share for their
  time; drinking the same one again starts it over. Attack speed and damage go into
  `combatStats` (a swing keeps the stats it started with), movement and jumps into
  `physics/move.js`.
- Dying ends every effect (`clearEffects` in `spawnEntry`); cooldowns carry on.

Over the quick bar a row shows what is at work: each potion's picture with the seconds left and
a bar running down, blinking for the last five seconds, and a chip while you are poisoned
(`game/effects.js`). A quick bar slot fills while its potion's cooldown runs.

## Poison

Poison (`toxic`) is a damage-over-time status like burning (`core/status.js`): Venom adders,
Bog spiders and Redbacks poison with their bites (`toxin` on their kind: a share of the bite's
damage on top, over a few seconds), and so do acid falls. While poisoned the player does not
regenerate (`regenerate`); poison ticks on through a knock-down and a lethal tick knocks you
out. An antidote cures it and keeps it off.

## Throwing

Using a flask (its quick bar slot, or *Take in hand* in the bag) **readies** it
(`inventory.readied`, `game/equipment.js readyFlask`): it goes in the right fist in place of
the weapon, held by the neck (`HoldThrow`), and the quick bar slot is framed. While a flask is
in hand:

- a click throws it at the cursor, whatever is there: an enemy's feet, the floor, or (off the
  map) a point at your height. A target out of range is pulled in along the same line. Clicks
  never walk; move with the keys. Shift (auto-attack) does nothing.
- a dotted arc from the hand to where it comes down, and a ring as wide as its burst, show
  where it would go (`render/throws.js drawArc`); the arc is the real flight (`arcOf`), so it
  bends round nothing and stops where a wall or an enemy would catch it.

A throw is an attack like a swing (`KINDS.throw`, the `Throw` clip): the flask leaves the hand
at `activeStart` from the clip's muzzle (one fewer in the bag, its cooldown starts) and flies a
lob that comes down on the target in up to a second (`launchFlask`, `stepFlask`). It bursts on
the first enemy body, wall, prop or floor it touches. The burst reaches every living enemy
within its radius and in sight of it, fully at the middle, half at the edge (`burstVictims`):
a blast hurts and staggers, fire ignites (fiery kinds, `fireproof`, do not burn), toxin
poisons. A fire flask leaves a burning patch, a toxic one a poison cloud: what walks into them
catches it. **Nothing a flask does hurts the player.** Burning and poisoned enemies take whole
points per tick without being staggered (`game/statuses.js`); a tick that kills pays out like
any kill. When the last flask is thrown, dropped or the weapon is taken again (its slot), the
weapon is back in hand.

## The alchemist

Villagers with a shop (`core/shops.js SHOPS`, by name) are hovered like chests (a gold label
with their trade) and clicked to walk up to them; within 1.4 cells the bag opens with their
wares in a column beside it. Select a ware to see what it does, its price and how many you
have; **Buy**, Enter or a double-click buys one for its price in coins, change given, all or
nothing (not enough coins, or no room in the bag). The price is the table's at level 1, grown
like the Smith's and the Enchanter's prices (`shopPrice`: + 75% of it for every level of the
deepest depth anyone got to in the world, `shopLevel`, the world's level counted in), so a potion
costs about as much of what a depth pays all the way down: a health potion 40 copper (4s) on the
road out of town, 34s at depth 11 of a world of level 1 and 61s at the core. Bought potions go on the quick bar like
found ones. The alchemist in the wizard hat (merchant camp, `town_merchant_c`) sells every
potion and flask. With `?dev=1` a run starts with 5000 gold. The enchanter and the smith trade
too, working on weapons instead ([loot.md](loot.md#enchanting-and-re-rolling)).

## The quick bar

A potion that comes into the bag goes on the first free slot by itself only if none of its
`family` is there yet: one kind of health potion, the antidote, one buff and one flask
(`autoBar`). Put the others on yourself (select it in the bag, press 1–6).

## Art

`blender/items.py` builds the bottles (`POTION_LOOKS`: five bottle shapes, a colour and an
emblem each; the health potions grow from a slim vial to an ornate gold-banded flask) and the
flasks (`FLASK_LOOKS`: a round belly and a long neck, one mount for all, `flask_mount`). The
flasks' models carry `weapon: 'throw'`, the socket, `mount_quat_gltf`, `mount_offset_gltf` and
`mount_scale` (bigger in the hand than to scale). `blender/character.py` has the `HoldThrow` pose
and the `Throw` clip (cocked behind the ear, let go in front of the face, a follow-through);
`blender/loadout.py` renders it (`loadout-throw-front.png`).

`npm test` covers the rules (`tests/potions.test.js`) and the assets (`tests/assets.test.js`).

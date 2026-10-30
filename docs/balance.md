# Balance

How strong the player, the weapons and the enemies are, and why. The numbers live in code;
this explains the targets they were tuned to and how to check them. `node tools/balance.mjs
[seeds] [kill share]` plays runs through the real tables (layouts, rosters, levels, XP, drops,
chests, quest rewards, combat stats) and prints where the player stands on arrival at every depth.

## Targets

- **The player stays about two levels above the depth.** Enemies are level `depth` (1 at the
  surface). A player who kills about 60% of what they meet and does the depth's quests arrives at
  depth 10 at level 12 and at the core at level 22, with 85–90% of the kills' XP counting. A
  thorough one (everything, every branch) arrives at `depth + 3` (75–80% counting), a hurried
  one (30%, no branches) at `depth + 1` (all of it counting): clearing pays a level, and the
  falloff (`xpScale`: kills more than two levels below the player pay less) keeps it from paying
  more. The world's level ([progression.md](progression.md#world-level)) is the hero's less two:
  the same gap a hero who plays as above has.
- **Fights keep their shape all the way down.** With the best weapon found so far, on arrival:

  | Enemy | Hits to kill | Its blows to kill the player |
  |---|---:|---:|
  | Spiders (every kind) | 1 | 5–8 |
  | Snakes | 1–2 | 4–7 |
  | Flimmers (in threes) | 1 (but 40% of blows go through one while it shimmers) | 6.5–8 beatings of five punches |
  | Octonauts | 2–3 | 3.5–5 |
  | Shraps | 3 | 5–5.5 |
  | Spicy | 3 | 4–4.5 |
  | Wolk | 2–3 | 5–6 (and stuns) |
  | Mecked | 3 | 4.5–5.5 (a grab is two bites) |
  | Moose (in herds) | 3–4 | 6–7 (its charge tramples harder, and knocks you down) |
  | Tornado | 3–4 | 5–6 (its twisters knock you down) |
  | Slug | 3–5 | 6–8.5 (its slime balls slow you) |
  | Bolime | 3–5 | 4–6 swallows (each up to four bites of 0.4 of its blow, through the armor) |
  | Fire-face, Fire-cat | 3 | 4–4.5 |
  | Fire shraps | 4 | 3.5 |
  | Stunders | 3–5 | 2.5–4 |
  | Triangles | 3–5 | 3–4.5 |

  Enemy health grows with the player's damage, and enemy damage with the player's health, so
  these hold from depth 1 to 20. What gets harder going down is the roster: stronger kinds,
  more of them, and the heavy and ranged species. The blows are counted without armor; the armor
  found on the way ([armor.md](armor.md)) takes off about a tenth of each at first and a third deep
  down, so with it they take that much longer (`node tools/balance.mjs` counts it).
- **Guardians are set pieces.** At full damage per second a side guardian takes about 6 s and
  a descent guardian about 12 s at every depth (the first ones on the road a bit less, the last
  ones a bit more as top-tier gear comes in). Trading blows without dodging costs about half
  your health against a side guardian and about one and a half times against a descent
  guardian: dodge its telegraphed attacks, use the poise windows, or drink. The real bosses
  ([bosses.md](bosses.md)) are made one by one around their mechanics and stand apart from that on
  purpose: most take 11 to 14 s, Mansk, Slomo and Qualmos hit softly (their danger lies
  elsewhere), Monteur has twice a boss's health (25 s), Sollmeldon half again (18 s), and Renew
  has four lives of 727 (19 s all told: the simulation counts them all).
- **Loot matters, and keeps mattering.** Weapon damage grows with item level, so a drop from
  further down beats an older one of the same rarity; an Unusual one catches up with a Fabled one about
  five depths later. Guardians and chests pay out the good stuff, ordinary enemies now and then.
  Fabled and better stay finds (under 4% of deep weapon drops).

- **Trial rooms take their time.** A trial room ([trials.md](trials.md)) is a few minutes of a run
  that are not fights: the simulation counts them per depth (`trials`: how many on the way, and
  their minutes, `core/trials.js trialTime`) and over the whole run: about 18 minutes with every
  kind on. A flood room has half the usual enemies, and the water takes those it reaches without
  a reward. A siege's waves are counted as kills (the horde's kinds at swarm strength, half
  rewards, half of them falling before the hold is full); a vault's reward site is counted with
  the other chests of the branches visited.

## The model

**Enemies** (`src/core/enemies.js`): every species has level-1 values and the same growth per
level, `GROWTH`: health +17%, damage +10%, XP and coins +25%. Kinds multiply the level-1 values.
Levels: `depthLevel(depth)` = depth (1 at the surface), ±1 per cube and species from depth 2.

**Guardians** stand one (side) or two (descent) levels above the depth, from depth 1 on.
`GUARDIAN_TIERS` give each tier floors at level 1, so the promoted species decides how it
fights, not how strong it is:

| Tier | Health | Damage per second | XP | Poise |
|---|---|---|---:|---:|
| Side | ≥ 550, ≥ 3.5× the species' | ≥ 9, ≥ 1.15× the species' blows | 260 | 1.4 s |
| Descent | ≥ 1000, ≥ 6.5× the species' | ≥ 11.5, ≥ 1.45× the species' blows | 650 | 2 s |

Damage per second (`threat`) is the blow averaged over a species' attacks (a projectile's burn
included) over its attack cycle (`attackCycle`: attack time plus cooldown).

**Poise**: a hit staggers an enemy (interrupts its wind-up, stuns it briefly). Then it is
poised for `profile.poise` seconds, and lighter hits only hurt it. A blow of at least a
quarter of its health (`HEAVY_HIT`) staggers anyway. Spiders and snakes have no poise, the
Fire-cat 0.4 s, Octonaut and Fire-face 0.8 s, Triangle 1.2 s, Stunder 1.5 s, guardians at
least their tier's. Before poise, any weapon chained faster than an enemy's 0.45 s recovery and
held it in place for good, guardians included.

**The player** (`src/core/progression.js`, `PLAYER`):

- A level costs `500 + 1400 (L − 1) + 90 (L − 1)²` XP: level 2 on the road out of town, then
  about one level per depth.
- Health `100 + 10 per level`; weapon damage +2% per level.
- Regeneration: 4% of the maximum per second after 5 s without damage.
- Kill XP × `xpScale(player, enemy)`: full up to two levels below the player, then −20% per
  level (at least 10%); +10% per level above the player (at most +50%).
- Health potions restore 25–100% of the maximum within a second, each kind once a second (the
  common one 40%). A run starts with three on quick bar slot 2; picked-up potions go on the bar
  by themselves. Buffs, antidotes and flasks: [potions.md](potions.md).

**Weapons** (`src/core/items.js`, `src/core/gear/`): a base's damage is grown by item level
(+5% a level, `ILVL_DAMAGE`), scaled by rarity, then changed by affixes. `interval` is the real
time between chained swings (the attack speed); every swing time scales with it. Every weapon
crits 5% of the time for ×1.5 before affixes. Damage per second rises a little with weight
(short 72, medium 81, long 85, broad 89, greatsword 92 at item level 1), while heavier bases
reach further or sweep wider but plant you longer, and only drop deeper down (the heaviest of
each kind from item level 12 to 16). The flails sweep wider and shove harder than any sword, so
each hits a little less per second than the sword of its depth (84 to 93). Bows, crossbows
and staffs shoot from afar, which is safer, so they deal less per second (47 to 69 at item level
1, see [progression.md](progression.md#bows-crossbows-and-staffs)); spells' bursts and bolts'
piercing make some of that back in packs. Drops lean towards the kind the player fights with
(smart loot, [loot.md](loot.md)); the simulation fights with swords, which now arrive about 6%
behind where they were when swords were all that dropped.

**Drops** (`src/core/gear/drops.js`, `src/core/chests.js`): ordinary enemies drop a weapon 5%
and a potion 3% of the time, × √(their kind's XP / 30), so tougher kinds drop more. Side
guardians drop a weapon and a potion, descent guardians two of each, with rarity floors. Four
chests per depth (two basic, one uncommon, one rare or exceptional) hold coins, potions and
one or two weapons a level or two above the depth. Per depth that is about 10 potions and
15 weapons, most of the useful ones from guardians and chests.

**Farming**: ordinary enemies come back five minutes of play after they died, the next time
their cube is entered, and every life rolls its drops anew
([progression.md](progression.md#enemies-come-back)). So bad luck is never final: a player who
wants a bow or more levels can clear the road again. The XP falloff keeps that from paying far
below the player's level; the loot keeps its item level (the depth's), so farming shallow ground
finds the kinds of weapon, not stronger ones. The main simulation does not farm;
`node tools/balance.mjs farm [respawns] [seeds]` farms the road out of town with the Glassmaker's Old Sword:
clearing it once (41 enemies in seed 1), about half the runs have seen a bow, crossbow or staff
drop, 80% after one respawn (5 minutes), 91% after two, 96% after three; the level stops at 3–4.
Without farming, three quarters of the runs see one before Gusto (the side guardian's weapon
helps most).

- **A world of a higher level meets a returning hero the same way** ([progression.md](progression.md#world-level)).
  `node tools/balance.mjs world [depth] [seeds]` plays a first world down to `depth`, then a new
  world of the hero's world level through: the hero arrives about two levels above the road out of
  town, and stays two to three above the depths with 87–97% of its XP counting, all the way down.

## Tuning

Change a number, then run `node tools/balance.mjs` and `npm test`. Useful checks:

- *The unlucky tenth* (`p10`: the level and damage per second only 10% of the runs arrive
  below): close to the average; a wide gap means luck decides too much.
- *Ranged weapons seen* (`rng%`, and before Gusto under the table): the runs that could switch
  to one if they wanted; Gusto must be fair to both ([bosses.md](bosses.md)).
- *Player level − depth* on arrival (`plvl` vs `elvl`): about 2. If it drifts, adjust the XP
  curve (`XP_BASE`, `XP_STEP`, `XP_CURVE`) or enemy XP, not the level formula.
- *xp%* (the share of XP that counted): about 85–100%. Lower means the falloff is doing the
  work and the curve is too cheap.
- *Hits to kill* per kind stays flat with depth: `GROWTH.hp` matches the player's damage growth
  (item level, level bonus, rarity). If deep enemies melt, raise `GROWTH.hp` or lower
  `ILVL_DAMAGE`.
- *Guardian seconds and brawl*: tune `GUARDIAN_TIERS`.
- *armor%*: what the armor the simulated player found (it wears the piece with the most armor in
  each slot) takes off a blow from an enemy of the depth's level: about 10% at depth 1, rising to
  about a third deep down ([armor.md](armor.md)). The blows to kill the player and the brawls
  count it. One knob moves it all: `ARMOR_K` in `core/gear/stats.js` (more: armor counts less).
- The rarity odds per item level: `node tools/loot-table.mjs`.
- *What a depth pays*: the simulation also prints the copper (kills and chests) and crystals
  found at each depth, beside what the Enchanter and the Smith ask for weapons of its item level
  (`core/crafting.js`). An enchantment should stay about a quarter of a depth's copper, a re-roll
  a few percent; about two crystals of each kind a depth.

Items keep what they rolled (rarity, item level, affixes) but their stats are computed when
read, so retuning bases, rarity factors or item-level growth changes weapons already found;
retuning affix ranges does not.

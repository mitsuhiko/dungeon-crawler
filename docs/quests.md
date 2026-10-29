# Quests

Status: a first slice is built (below, "What is built"): the six villagers give quests about
things the world has anyway, with the shared quest log, the Quests tab and **U**. The rest of this
is the design: what the quest system should do, what it has to respect in the rest of the game,
the kinds of quests we want, and what is still open. Complements [world.md](world.md),
[villagers.md](villagers.md), [saves.md](saves.md), [hordes.md](hordes.md),
[guardians.md](guardians.md) and [online.md](online.md).

## What is built

Steps 1 to 3 of "Order of work" below: the engine, the plan, spots and the people on them, Find.

- **The rules** (`core/quests.js`, pure, `tests/quests.test.js`): the quest log, the kinds, making
  offers, what players do with a quest, events, checks for saves and the network.
- **The plan** (`core/questplan.js questPlan`): exactly the numbers of "Per depth" below (100
  slots), each with its kind and giver, from the seed and the layouts. Kinds not built yet stand
  in as built ones (`BUILT`, `STAND_IN`: scattered pieces as a gathering or a treasure map,
  freeing prisoners as a scouting kind). Somebody lost is always asked for by whoever lives at a
  camp at or up to two above the depth (they will wait there together), the camp that asked least
  first and none more than `CAMP_RESCUES` (two: the places beside its resident's; else the slot is
  a find); the rest by the villagers
  (a share falling with depth) or the people of the depth and the one above.
- **Twelve kinds:**
  - the scouting kinds, about what the world has anyway: `reach` (get down to a depth nobody has
    been to, one or two below the deepest), `landmark` (stand beside a depth's landmark, within
    `LANDMARK_REACH` cells of its chest), `guardian` (beat a side or descent guardian: done once
    its gate is open), `horde` (break a depth's horde: every member defeated); a scouting slot
    takes the one its giver leans to that fits;
  - `find`: a quest thing (below) lies on a hiding place; walking onto it picks it up (the quest
    carries it, not a bag), back to the giver. It is the giver's own (`the lost backpack`) or
    somebody's they know (`Bram's backpack`), named so over it (`label`);
  - `gather`: `GATHER` (three) of one quest thing lie on as many hiding places of one depth (in
    different cubes where it can be); each picked up counts (`got`, shown as 1/3), all of them:
    back to the giver;
  - `rescue`: somebody lost stands on a hiding place; talking to them ends it there and pays
    (`spot`); they go to live at the giver's camp (`log.living`). A giver who lost somebody before
    says so ("First Paula, and now ...");
  - `treasure`: a map scrap; a chest stands on a hiding place, opened like a reward site's, its
    loot the reward (`self`: the quest only adds XP). It stays, open.
  - `bounty` (`core/bounties.js`): a named enemy of one of the depth's kinds (as likely as they
    are there), named as no other bounty of the world is while there are names left
    (`BOUNTY_NAMES`), waits on a hiding place, golden, four times the health, a third more damage, a
    level over the depth's, worth four times the XP and coins. Its id is `q:<quest id>`, so its
    death is remembered like any other (`run.defeated`, and it comes back with a death in its
    cube); the quest is done once it is defeated, paid back at the giver. Whoever runs the
    cube's enemies puts it there (`game/questworld.js bountiesHere`, `game/quests.js`).
  - `delivery`: a letter, a parcel or a quest thing (carried by the quest from the start) for somebody at the
    slot's depth: whoever lives at a seat or camp there (marked `?` while they wait for it), else
    a messenger waiting on a hiding place (there only while the quest wants them). Talking to
    them ends it; they pay (`spot`). Each of them is sent one letter in a world.
  - `relay` (four in ten delivery slots, the plan says which): ask somebody (`talk`, like a
    delivery's recipient), who tells where the lost thing is: a hiding place on the same depth
    (the clue is in the goal), then it is a `find`, back to the giver. Quests with more than one
    stage run them in order.
  - `defense`: an outpost's keeper (a carter, `core/npcs.js`) asks to defend the supply cart.
    Every outpost has one such slot in the plan, at its depth, in place of that depth's last.
    `game/defense.js` runs the raid (on the game that runs the cube's enemies): coming within
    `RAID.start` of the cart starts it; after a moment three waves (3, 4, 5 raiders, more deeper
    down, of the depth's kinds that fight up close) come through the portals (else from a few
    cells off, where the cart is up on a ledge), each once the one before is beaten. Raiders are
    posted beside the cart like a guardian's defenders (`e.defence`): there they take from it
    (its strength, shown over it, drains), and they fight a player who comes close or hits them.
    All waves beaten: done, the keeper pays (`spot`). The cart emptied, or dying: it fails;
    Restart in the quest menu, then again by the cart. Leaving the cube calls the raid off.
    An annex's outpost (below) is defended the same way; its quest comes from somebody living on
    the depth (else a villager) and opens the annex's sealed portal when taken (`opens`).

  The scouting kinds and `find` are paid back at the giver (`return`).
- **Families** (`kinOf`, `namesTaken`): somebody a giver speaks of (whose thing is lost, who is
  lost) is of the giver's family and kept with the quest (`kin`); the giver speaks of the same
  people again, related the same way. A new one gets a name (`KIN_NAMES`) nobody of the quests has
  yet: not the giver's own, nor the families', the people found, or those living two depths up or
  down.
- **Quest things** (`core/items.js QUEST_THINGS`): what is lost, gathered and carried, any of
  them for any of these: the first quest items (locket, ring, compass, journal, toy rabbit) and 44
  made from the world's props (backpack, wagon wheel, jar of thunder, honey pot, jade idol, rune
  stone ...; `blender/items.py QUEST_PROPS`), small, with a red bow and a tag, and a gold glow on
  the floor (`render/loot.js`), so they never pass for the clutter they look like. A thing is about
  one quest at a time; givers lean to some (`LEANS`: the smith to a shield or silver bars, the
  alchemist to toadstools, a pilgrim to butter lamps), four times as likely as the rest.
- **The town** offers `TOWN_OFFERS` (two) at a time, not one from every villager: at first, and
  each time the party comes back to town from below (`log.townOpen`, `log.away`), the villagers
  with nothing out who have given fewest bring out offers until two stand. Nothing more until the
  next time back.
- **Variety:** a slot tries the kinds nobody has out (offered, going on, to hand in, failed) first,
  then its own; so the quests out at once are mostly of different kinds.
- **Givers** (the villagers, and the people out in the world once met) each have one quest out at
  a time (`MAX_OFFERS`): offered, or taken and not done yet (going on, to hand in, failed, also
  archived); the next comes only once that one is done. It is their next slot of the plan down to two below the deepest anyone got,
  filled in from `hash(seed, giver, slot)` with a target of the slot's depth that no quest going
  on is about and that is not done yet; a slot that nothing fits tries the other kinds
  (`FALLBACK`) and is otherwise passed over (`log.used`). An offer whose goal got done meanwhile
  goes. When its slots are used up, a giver offers nothing more.
- **Clues** (`clueOf`): where a hiding place is, in words from what the layout knows of its room
  (on the needle of rock, by the great lake, near the windmill, where the horde gathers, off the
  main way, past the guardian's gate, not far from where the depth begins ...), never on a map.
  Coming into the cube, the game says so ("Something glints somewhere here...", "You hear
  somebody calling for help!"); the thing then has a label.
- **In the world** (`game/questworld.js`): what a quest going on (not archived) has as its goal
  shows on its spot only then: the thing (drawn with the loot), the lost person (a figure to talk
  to), the treasure's chest; and the people found stand at their camp. The cube is built again
  when that changes.
- **Difficulty** by how far below the deepest the quest is (a descent guardian one harder);
  **rewards** made with the offer and shown in it (`questRewards`, "Rewards" below).
- **Progress:** goals are checked against the world (the deepest depth, the open gates, the
  hordes broken: `goalDone`) every half second, and events come from the game: a cube visited
  (`game/flow.js`), a horde broken (`game/enemies.js`, also found broken on coming in),
  standing at a landmark (`game/quests.js`). An archived quest counts nothing; unarchived, what
  is true in the world by then counts (a guardian beaten meanwhile stays beaten), standing at a
  landmark does not.
- **A death** that puts the cube back takes back the quest progress made since coming in
  (`progressOf` / `restoreProgress`): a horde broken comes back, a thing picked up lies there again.
- **Talking** (`game/inventory.js talkTo`): a click on a villager, or the action key beside one.
  The panel opens on the Quests tab with what that villager has on top: offers to accept, quests
  to hand in. The alchemist opens on her wares unless she has news (a quest to hand in, an offer
  not seen yet). Labels over villagers show `!` (an offer) and `?` (one to hand in), always.
- **The Quests tab** (`game/questpanel.js`): Going on / Done / Archived, the selected quest's
  giver, depth, difficulty, story, goals, reward, and Accept, Hand in (only at its giver),
  Archive / Unarchive, Restart (a failed quest; none of the four kinds can fail yet). **U**
  (`quests` in `core/keybinds.js`) opens it, again closes it; **I** goes over to the bag.
- **Shared:** the log is the world's (`run.quests`, saved with the world, `core/save.js`); the
  host decides and tells the guests ([online.md](online.md#quests)); a quest handed in pays
  everyone in the game. The chronicle notes quests taken, done, complete and failed.
- **Spots** for the quests to use are planned and kept free in the world (below, "Spots, planned
  from the seed").
- **People out in the world** (`core/npcs.js`, `game/npcs.js`): somebody lives at every seat
  and camp (below, "Who they are"). Talked to once (`log.met`), they give quests like the
  villagers, about their own depth and the one below.
- **Annexes** (`world/layout.js`): three a world, the first on the first depth from 4 on with
  room for it, the second from 10, the third from 16: a room beside a plain room of the way, in the
  depth's room budget (the depth keeps one of its branches for it), behind a portal sealed like a
  side guardian's gate (`gateFaces`: `annex:<key>`). Plain ground, no holes, no tunnel, no reward
  site or set piece; its only spot is its outpost. Before a quest opens it the portal stands grey
  and unlit (`render/markers.js`), "Sealed. Somebody on this depth may know the way in."; the
  quest taken opens it for good (`openedGates`, `run.unlockedGates`). Faces never open into an
  annex but by its portal (`core/boundaries.js`).
- **Repeats** (`REPEAT`): a bounty done, or an outpost's defense (not an annex's), waits to
  come back to its giver (`log.repeats`): once the party has been to another depth than the
  giver's (the town: 0) and back at the giver's, the giver offers it again when it has nothing of
  the plan to offer, filled in anew, "(again)", for half the XP and coins and potions instead of a
  weapon. Not counted in the hundred.
- **Following a quest**: under the minimap the newest quest going on (or the one chosen with
  Follow in the Quests tab, each player's own) shows its title and what to do now
  (`game/questpanel.js drawTracker`). The minimap marks in gold where it wants you now
  (`game/questworld.js questTarget`), on the depth shown and only in a cube somebody has been to:
  a pin on the person to talk to or hand in to, or on an outpost's cart; a dashed frame round the
  cube when the place has to be looked for (a hiding place, a landmark, a guardian, a horde: the
  clue says where in it); an arrow on the rim when it is off the map. Wherever the goal is, even
  in a cube nobody has been to, a gold arrow on the minimap sits by the gate of the cube you are
  in that leads towards it (`questWay`): the shortest way on the depth's plan (its portals and the
  faces discovery opened), or the way down (up) when the goal is deeper (higher up). Only that
  one gate shows, so the map past it stays unknown.
- **Dev:** `/quest <kind> [depth]` makes a quest of that kind there and takes it; `/spot`.
- **Not yet:** the other kinds (scattered pieces, beacons, prisoners, pet chase): their slots in
  the plan stand in as built kinds.

## What we want

- Quests are **generated**: from a set of templates, of different kinds, not written one by one.
  A world has about **100 quests** over its 21 depths (see "The numbers" below).
- Quests are given by **NPCs**. Most start in town with the villagers, but there are NPCs out in
  the world too: some give quests of their own, some only exist to help a quest someone else
  started (the next step of a chain, the one a parcel goes to, the one who pays you at the end).
- **Several quests at once.** The bag gets a second tab: **Bag | Quests**. A new action
  `quests`, bound to **U** on the desktop, opens the panel on the Quests tab.
- **Archive** a quest: it disappears from the list by default and can be brought back (a filter
  shows archived quests). Archiving is a soft abandon: an archived quest is paused, it counts no
  progress until it is unarchived.
- **Shared.** Everyone in a world plays the same quests: they belong to the world, not to a hero.
  A reward goes to everyone who is in the game when the quest is done.
- **Quests can fail** (a defense lost). A failed quest stays in the list, and
  the quest menu has a **Restart** button for it.

## The rules it has to keep

1. **The world never depends on quests.** Maps are made again from the seed and never saved
   ([saves.md](saves.md)). Everything that shapes the ground (where an NPC stands, where a camp
   is, an outpost, an annex room) is planned from the seed alone, like reward sites, guardians and
   hordes, whether a quest ever uses it or not. What a quest adds while it runs is an overlay on
   top: a figure standing on a planned spot, a thing lying on the floor (like `run.loot`), enemies
   of its own (like dev spawns, with ids of their own).
2. **Only where you have been** ([world.md](world.md#only-where-you-have-been)). A quest never
   shows a cube nobody has visited: no marker, no minimap pin. It tells you in words (the depth, a
   clue about the place); a marker shows once you are in the cube.
3. **Never ask for what cannot happen.** Every target is checked against the world as it is:
   species from the depth's roster (`DEPTH_SPAWNS`), places from the layout (sites, landmarks, set
   pieces, large areas, guardians, hordes, branches), and what was done already (`run.defeated`,
   `run.chests`, `deepest`). A guardian already defeated is no quest target.
4. **Enemies do not come back.** A defeated enemy stays defeated for the world (`run.defeated`),
   so a depth can run out of snakes. A quest that needs enemies brings its own (quest spawns, see
   below), never counts on the room's own.
5. **Deterministic.** The world's quest plan (which quest, of which kind, from whom, at which
   depth, see "The numbers") comes from the seed alone, and each quest is filled in from
   `hash(seed, quest slot)`: friends in the same world see the same offers, and a tool can list
   them. The save keeps the whole generated quest, not just its seed, so a changed generator
   does not change quests already taken.

## A quest

```
{ id, template, giver, helpers: [npc], depth, level, difficulty,
  title, text, stages: [{ goal, need, have, npc?, spot?, clue? }], stage,
  payout: 'return' | 'spot' | 'self', rewards: { xp, copper, items: [] },
  items: [],                      // quest items it carries (below)
  state: 'offered' | 'active' | 'ready' | 'done' | 'failed', archived, created, finished }
```

- **Words**: the title, the text, a stage's text, label, clue and reply, and the giver's name and
  place are kept as words to say (`phrase`, `noun`, `person`: `docs/i18n.md`), not sentences, so
  a quest reads in the reader's language. Places, things and people are nouns with their gender
  (a person's from their name, `core/npcs.js isShe`), and each language's sentence says how they
  go ("on {where:the}": "auf {where:dem}"). Quests made before kept English sentences.
- **Stages** run one after another; a chain is just more stages. Each stage has one goal.
- **Goals** are a few verbs, each fed by something the game does anyway:

  | Goal | Done when |
  |---|---|
  | `talk` | someone talks to that NPC (the action key) |
  | `find` | someone picks up the quest item or comes to the person on that spot |
  | `kill` | the quest's own enemies are defeated (a bounty, a pack) |
  | `defend` | the waves are beaten and the thing defended still stands |
  | `deliver` | the quest's item is brought to that NPC |
  | `give` | that NPC is given N of an ordinary item (potions, crystals) |
  | `reach` | someone gets to a depth, a landmark, a set piece, a cube |
  | `collect` | N quest drops picked up |

- **Payout:** how a quest ends.
  - `return`: back to the giver, who pays.
  - `spot`: it ends where the last goal is done, paid by someone there: the person found, the NPC
    the parcel was for, the one who asked for help on the spot.
  - `self`: the quest is its own payout, e.g. a treasure map whose chest is the reward.
- **Rewards** go to everyone in the game when the quest is done: XP (a share of a level at the
  quest's depth), coins (grown like enemy coins, `GROWTH.coins`), and items rolled like chest loot
  (`rollWeapon`, `rollPotions`) at the quest's level. They are tuned against the balance curve
  ([balance.md](balance.md)) and `tools/balance.mjs` should include them.
- **Quest items** (a lost locket, a parcel, a map scrap) are carried by the quest, not by one
  player's bag, since the quest is shared: they show in the quest's details and nobody can drop or
  lose them by leaving the game. Every quest item gets a real model and icon
  (`blender/items.py`, `assets/items/`), like every other item: no placeholders.

## The engine

- `core/quests.js`: pure, no DOM, tested in node. The quest records, `advance(quests, event)`,
  archiving, payout.
- `core/quests/templates.js` and a generator: picks a template for an NPC, binds its slots
  (where, what, who, how many) under the rules above, writes the text, sets the rewards.
- `game/quests.js`: the glue. The game raises events where things happen anyway (an enemy
  defeated, an item picked up, a cube visited, a villager talked to, a chest opened) as
  `{ kind, species, enemyKind, depth, key, id, npc, item }`; active quests that are not archived
  take them.
- Playing together the host's world holds the quests; events from guests come in like their kills
  do now ([online.md](online.md)) and count the same.

## NPCs and spots

### Spots, planned from the seed

The world plans **spots** per depth, next to the reward sites (`world/sites.js planSites`), from
the seed alone: places kept free where somebody or something may stand later. Kinds:

- a **seat**: one NPC sitting or standing about somewhere, a rock, a ledge, a bridge's end;
- a **camp**: a small footprint with a fire and a bedroll, room for two or three people;
- a **hiding place**: somewhere a thing or a person can be found (below, Find);
- an **outpost**: a room built to be defended (below, Defense).

Cubegen keeps a spot clear (no clutter, slabs or structures on it, reachable on foot, checked
like the villagers' places in `tests/town.test.js`). What stands on it is decided by the game from
the quests: an NPC (its figure from `render/figure.js`, its collider added then), a quest item, a
thing to defend, or nothing. An unused spot is just open ground.

**Built** (hiding places, seats, camps, outposts): `world/spots.js` plans them
with each depth's layout (`layout.spots`, `layout.spotList`), on a random stream of their own, so
nothing else in the world changes:

- per depth 6–8 hiding places, 2 seats, and on depths 1, 4, 7, ..., 19 a camp in the first room of
  the route (where the depth begins). Only in rooms the ordinary generator makes: not the town and
  the merchant camp, not guardian arenas, not a span's gorge cubes, not a large area's rooms but
  its foot and a hairpin's summit. The spots spread over the rooms (fewest first).
- an outpost on six depths, one in each stretch (`OUTPOST_BANDS`: 1-3, 4-6, 7-9, 10-12, 13-15,
  16-19; which depth from the seed), in a plain room on the way (not at its ends, not the horde's,
  not a high place), on a random stream of its own. In the cube: three by three level cells with
  the supply cart in the middle (it blocks), the keeper on one side, the approach on another, and
  as much level ground round it as there is (at least 10 floors within 4 cells).
- on the depths with the glassmaker's glass (`core/glass.js`: the road out of town, 1 to 6 and
  13), two **glass** spots, after the rest on a random stream of their own: one in a room of the
  way about halfway along (`way`), one in the hardest room to get to, a branch rather than the way.
  No quest uses them: a bubble of his star-glass floats there until its recording is heard
  ([story.md](story.md#how-the-story-is-told)).
- each has a `tier`, how hard it is to get to, 0 to 4: one for every side guardian or the horde
  the way to it leads past, one for a branch room, one for a room with a reward site, two for the
  high places (a tableland, a pinnacle, a lone peak, a great lake, a large area's foot or summit, a
  span's island). The hiding places of a depth spread from its lowest tier to its highest.

`cubegen/spots.js` finds each its place in its cube once the route, the reward sites' ways and the
horde's are in, before the structures:

- **hide** one cell (and **glass**: the one on the way close beside it), **seat** two (where the NPC stands, and in front where you stand to talk),
  **camp** a fire and the four cells beside it (three places for people, the fourth side the
  approach; the corners level with it too). The camp gets its fire and a pack (site placements).
- the floors: level, dry, enough headroom, off portal pads (and the cells round them), reward
  sites, the horde's patch, ramps, the cube's rim and the cells structures run through. Hiding
  places away from the way and the portals (the high tiers as high up as they go), seats beside the
  way, the camp about four cells from where you come in.
- first where you get to and back from anyway (walking, stepping up, dropping, the route's own
  structures), else where a way can be built (searched like a reward site's).
- then they claim their room against structures, smoothing keeps them level, ambient props and
  enemies keep off them.
- checked at the end with the final slopes and fences: reachable both ways, level, nothing built
  on them, and somebody standing on them (a seat's NPC, a hidden person, a camp's three) never
  blocks the way between the portals. One that fails is tried again for like a reward site; over
  eight worlds every planned spot is placed.
- the map carries them as `spots`: `{ id, kind, tier, depth, seed, layer, cells, floor,
  accessFloor, anchor, approach, places }` (`anchor` and `approach` with a facing `yaw`).

`tests/spots.test.js` checks the plan and every spot of two worlds; `/spot [kind] [depth]` (dev)
stands you at the next one.

### Who they are

An NPC out in the world has a seeded identity: a role (hermit, explorer, miner, pilgrim, a lost
child, a worried father ...), a name, a clay tint and an outfit (wearables, `core/items.js`;
new ones get models in `blender/items.py`). Some are always there (they sit somewhere, maybe at a
camp, and give quests of their own: the deeper quests start out there). Others only appear while a
quest needs them. Enemies ignore NPCs and cannot hurt them.

**Built** for the residents of the seats and camps: `residentOf(spot)` makes them from the
spot's seed alone, so every game agrees: a role (hermit, explorer, miner, pilgrim, trapper,
scholar; some only at some depths), a name, a clay tint and an outfit of the villagers' things.
They stand on their seat facing whoever comes to talk, or at their camp's fire. `game/flow.js`
puts them on the map as a cube is entered (`map.npcs`); `render/world.js` draws them like the
villagers (`render/villagers.js`) and makes each a collider; they are labelled, clicked and talked
to like the villagers (`Talk to Finn the explorer`). Their quests are the giver `npc:<spot id>`,
leaning by role (`ROLES`); a quest keeps its giver's name and place (`from`), so it reads right
anywhere. Hiding places have nobody yet.

### Where people go when they are found

A rescued person moves to a **lasting place**: not necessarily the town, it can be where the
quest giver stood. A father looking for his daughter in a cave waits at the start of the cave;
once she is found, both of them wait there. So a camp or a seat has room for the people who end up
there, and the world save remembers who lives where. Someone who moved may give quests of their
own later.

## Kinds of quests

### Find (an item or a person)

Something is hidden somewhere; how far you have to go depends on the quest's difficulty. Two
things make it hard:

- **How deep:** against how far the party got (`deepest`): easy is a depth already behind you,
  medium is where you are, hard is one or two depths further down.
- **How hidden**, from the layout, easier to harder:
  1. a room on the route;
  2. a branch room;
  3. a discovery site;
  4. a hard place: the top of a pinnacle, the lone peak, the islet in the great lake, the summit
     of a spiral or a hairpin, the island at the far end of a span;
  5. past the depth's horde, or behind a guardian.

The generator scores the hiding places of the depths in range and takes one that fits.

**Finding it:** the giver says the depth and gives a **clue made from the place's real
features**: the cube's spec knows its falls, spouts, spans, tunnels, lakes, set pieces and
archetype ("where the water falls from the sky", "on the needle of rock", "past the long bridge").
In the right cube you hear it or see it glint, or the person calls out; then it gets a marker.

**When it is found:**
- an item is taken back to the giver (`return`);
- a person thanks you and pays (`spot`), then goes to their lasting place;
- a person sends you on (a next stage: "my brother went further down");
- a treasure map's chest is the reward itself (`self`).

### Defense

An NPC's something (a camp, a cart, a dig site, a shrine, a farm) is attacked: beat every enemy
that comes, and keep the thing standing. Where:

- **Outposts (B)**: rooms planned from the seed every few depths and built to be defended, like
  hordes and set pieces: open ground, a fence or a wall, the thing in the middle, ground for the
  enemies to come in over. A farm on the surface, a dig site in the mines, a shrine in the ossuary.
  Without a quest it is a calm place with its NPC; with one, it is attacked.
- **Annex rooms (C, on the grid)**: a room of its own for one quest, but not outside the world
  like the house interiors: a cube on the grid where there is otherwise none, with a portal towards
  it from a room beside it. It is planned from the seed like a one-room branch (`world/layout.js`)
  and its face carries a portal like any other. Before a quest opens it, the portal is there to
  see but greyed out and cannot be passed (like a guardian's gate before the guardian falls);
  once opened it stays open. So the world stays the same whatever the quests, the annex is
  discovered like every other cube (through its portal), and it can be shaped for the fight. It
  is one of the depth's branches: it comes out of the branch budget (`min(4, most − route)`), so
  a depth never has more rooms than its band allows (`ROUTE_ROOMS`).

Not wanted: taking over an ordinary room while the quest runs (its shape is random: a ledge, a
shore, a tunnel), and rooms outside the grid.

**The fight:** enemies come in waves, through the room's portals, from the depth's roster at the
quest's level. They go for the thing, not only for the players: that is new AI (enemies with an
object as target), built on the horde's group logic (`game/hordes.js`). The waves are quest
spawns: defeated or not, they never enter `run.defeated` of the room. If the thing is destroyed or
everyone is down, the quest fails (below). The host runs the waves, like enemies now.

### Bounty

A named, stronger enemy (a guardian's tier and look, `GUARDIAN_TIERS`) on a hiding place at the
quest's difficulty. Paid on the spot or back at the giver. Cheap, and the first use of quest
spawns.

### Delivery and relay

Carry a parcel (a quest item) from the giver to an NPC elsewhere; that NPC ends it and pays, or
sends you on. This is what helper NPCs are for: the one waiting at a camp three depths down for a
letter.

### More ideas

- **Gather:** N things dropped by quest spawns of a species (spider silk, snake fangs), or picked
  at hiding places (mushrooms, crystal nodes). Gives the crystals and sticks, which have no use
  yet, one.
- **Scattered pieces:** N parts of something spread over one depth (map scraps, pages, a broken
  amulet): Find, several times, all over a depth.
- **Beacons and shrines:** light N things at spots across a depth: exploring, with something to do
  at each.
- **Free the prisoners:** a cage in the depth's horde room; beat the horde, open the cage, a
  person is rescued (and moves to their lasting place).
- **Pet chase:** the pet keeper's lost animal runs off when you come close; corner it.
- **Escort:** an NPC follows you across portals. Costly (paths, falls, portals): later.
- **Scout:** reach a depth, stand on its landmark, climb the spiral.
- **Champion:** beat a depth's side or descent guardian, or break its horde: things that happen
  anyway, with a story and a reward.

### Who gives what

Each giver leans towards the templates that suit them: the smith crystals and stone stunders, the
alchemist venom and potions to give, the pet keeper lost animals, the groom deliveries, the
innkeeper rumours, scouting and bounties, the enchanter landmarks and crystals. NPCs out in the
world lean towards what is around them (a miner: the mines below; a father: his daughter).

## The numbers

A world has about **100 quests**. The world plans them from the seed (the **quest plan**): for
each one its kind, its depth, its difficulty and who gives it. The details (which spot, which
species, which clue, the text) are filled in when it is offered, against the world as it is then
(rule 3).

### Per depth

A world has about 384 rooms (route and branches, `ROUTE_ROOMS` in `world/layout.js`): long routes
near the surface, shorter ones deeper down. 100 quests make one for about every four rooms. They
follow the rooms, a little heavier near the top, where a run spends its first hours:

| Depths | Route rooms per depth | Quests per depth | Quests |
|---|---:|---:|---:|
| 0 (the road out of town) | 18–24 | 4 | 4 |
| 1–3 | 18–24 | 7 | 21 |
| 4–7 | 16–22 | 5 | 20 |
| 8–11 | 14–20 | 5 | 20 |
| 12–15 | 12–18 | 4 | 16 |
| 16–19 | 9–16 | 4 | 16 |
| 20 (the core) | 9 | 3 | 3 |
| | | | **100** |

A quest's depth is where it is done, not where it is given.

### Kinds

| Kind | Quests | |
|---|---:|---|
| Find: an item | 18 | |
| Find: a person | 10 | they move to their lasting place |
| Bounty | 15 | |
| Delivery and relay | 14 | the helper NPCs |
| Gather | 10 | |
| Scout, champion | 10 | cheap, on things that are there anyway |
| Defense | 9 | 6 at outposts, 3 in annexes |
| Scattered pieces, beacons | 8 | |
| Free the prisoners, pet chase | 6 | |
| | **100** | |

Difficulty: 40% easy, 40% medium, 20% hard. No two quests of the same kind and target are active
at once; a kind the giver gave last weighs less.

### Who gives them

- **The town, about 40:** the six villagers, six or seven each, mostly for depths 0–11 (the town
  portal brings you back up), the deep ones fewer.
- **NPCs out in the world, about 60:** about 25 givers (two or three quests each), at seats and
  camps on the way down. Their quests are mostly for their own depth and the next.
- Helpers (about 14, for deliveries and relays) and the people to be found (10) give none of
  their own at first; someone found may give one later from their lasting place (counted in the
  60).

### Spots per depth

Every depth plans more spots than its quests need, so the generator has a choice:

| Spot | Per depth | In a world | For |
|---|---:|---:|---|
| Hiding place | 6–8, from easy to hard (Find) | about 150 | finds, bounties, gathering, pieces (3–5 in one depth) |
| Seat | 2 | about 40 | world givers, helpers, lasting places |
| Camp | every third depth | 7 | givers, lasting places (room for three) |
| Outpost | on 6 depths, about one per band from depth 1 to 19 | 6 | defense |
| Annex | on 3 depths, where the branch budget has room | 3 | defense (later maybe a find or a bounty) |

The town's surface buffer stays enemy-free: no outposts, bounties or quest spawns there.

### When they are offered

- A world NPC offers its quests once someone has come to it; a villager offers a quest once
  `deepest` is at most two above the quest's depth (hard quests are those one or two further
  down), so the town never sends a level 3 hero to depth 15.
- An NPC has one quest out at a time (offered, or taken and not done); the rest of its quests
  wait in the plan.
- Some quests are **repeatable** (below); the others are done once.

### Repeatable quests

Whether a quest can come again depends on its kind: things that happen again in a world can be
asked again, stories cannot.

| Repeatable | Not repeatable |
|---|---|
| Bounty ("another one turned up") | Find a person (they are home now) |
| Gather ("I need more") | Delivery and relay (the story is told) |
| Defense at an outpost ("they are back") | Defense in an annex (built for one fight) |
| Pet chase ("it got out again") | Scattered pieces, beacons, free the prisoners |
| | Find an item, scout, champion (the place is the same) |

- A repeatable quest comes back to its giver some time after it was done: once the party has
  been away from that giver's depth and come back, never more than once per visit.
- It is filled in anew each time (`hash(seed, quest slot, n)` for the `n`-th time): a new spot,
  a new target, at the depth the party is at now (within the giver's reach: a world NPC its own
  depth and the next, a villager down to two above `deepest`).
- Repeats pay half the XP and coins of the first time, and potions instead of a weapon, so they
  do not run past the balance curve. They are not counted in the 100.
- When a world's 100 are done, the repeatable ones are what is left; the other NPCs only chat.

### Rewards

- **XP:** about 7% of the cost of the next level at the quest's depth level (`xpToNext`), times
  0.6 (easy), 1 (medium) or 1.6 (hard). About five quests per depth add up to a third of a level
  per depth on top of the kills ([balance.md](balance.md): about one level per depth from kills).
- **Coins** like a chest at the quest's depth: basic (easy), uncommon (medium), rare (hard)
  (`CHESTS` in `core/chests.js`).
- **Items:** easy quests potions, medium ones a weapon half the time, hard ones a weapon from
  Decent up (`rollWeapon`, `rollPotions`).
- `tools/balance.mjs` takes the quests into account; if the curve gets too fast, the quests'
  share goes down, not the kills'.

### Text

From phrase templates per giver, with slots, friendly for children (the game is made with kids,
[learn](../learn/)).

## Failing and restarting

A quest can fail: a defense lost (the thing destroyed or everyone down). A failed quest stays in
the list, marked failed, with a **Restart** button in the quest menu: it starts again from the
beginning (its first stage, whichever stage failed), its quest items back where they were, its quest spawns come
again, an annex it opened stays open. Archiving a failed quest works like any other.

Dying is no failure, but a death puts the cube back as it was when you came in
(`game/flow.js`): quest progress made in that cube since then goes back with it (a bounty
defeated there stands again), like `run.defeated`.

## Saving

The world save holds (`cube-crawler.world.<id>`, [saves.md](saves.md)):
- the quests, offered, active, done, failed and archived (the plan itself comes from the seed);
- who lives where (people found and moved);
- quest overlays in the cubes (quest items lying somewhere, a bounty still standing);
- the annexes opened.

A hero brings nothing of the quests into another world: each world has its own. A guest plays the
host's quests, and keeps the rewards it got there, like loot. A reward goes to every player in the
game when the quest is done, wherever they are in the world; a hero who comes later gets nothing
for it.

## The panel

- Tabs **Bag | Quests** in the inventory overlay (`game/inventory.js`); **U** (`quests` in
  `core/keybinds.js`) opens it on Quests; on touch, the tab in the panel.
- The Quests tab: a list with filters (Active, Done, Archived), the details of the selected quest:
  who gave it, the text, its stages with progress, the clue, the rewards, the quest items, a
  "Track" toggle (one tracked quest shows a line in the HUD), Archive / Unarchive, and Restart
  for a failed quest.
- Talking to an NPC (the `talk` action, `game/action.js`, today only shops) opens a small
  dialog: a greeting, the offers to take, quests to hand in; a shop becomes one choice there.

## Checks and dev tools

- A node test makes the quest plan of many seeds and checks the numbers (about 100, the shares
  per depth and kind above), and fills in every quest and checks it can be done: targets in the
  rosters, places in the layout, depths in range, spots clear and reachable, annexes reached
  through their portal and inside the depth's room budget.
- `node tools/quests.mjs <seed>`: a world's quest plan and its quests filled in, to read the text.
- Dev commands: `/quest <template> [depth]`, `/spot` (to the next spot).

## Order of work

1. Engine, generator, the shared quest log in the world save, the tabs and **U**, the dialog
   (built, the dialog being the Quests tab opened by talking; the quest plan still to come).
2. Spots in the world plan and NPCs on them.
3. **Find** (an item or a person), with difficulty, clues, the three payouts, lasting places, the
   first quest items and NPC outfits.
4. **Bounty** (quest spawns).
5. **Delivery / relay.**
6. **Defense**: outposts, then annex rooms; enemies that go for a thing.

## Open questions

- Quests against the clock (a courier): left out for now, maybe later.

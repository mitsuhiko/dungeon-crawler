# Saves: heroes and worlds

Status: implemented (`src/core/save.js`, `src/game/save.js`), with the main menu
(`src/game/menu.js`), the living cubes behind it (`src/game/showcase.js`) and the Esc menu
(`src/game/escmenu.js`).

## The menus

- **The main menu** comes first (`state.mode` `'menu'`; the dev tools and `?seed=` skip it,
  `?menu=1` shows it after all). It is about one hero, the chosen one (remembered):
  - **Continue**: the hero in its world (its name, level, the world and how deep the hero got
    there). Only when the hero has a world.
  - **Choose World**: one of the saved worlds (each with its world level), **New Random World**,
    or **New Known World** (a world name or a number, with what it makes shown as it is typed; a
    world saved already makes a fresh copy, "... II"). A new world is of the level shown above
    those two buttons: the chosen hero's level less two, which − and + change
    ([progression.md](progression.md#world-level)). Choosing goes back to the title: it only changes Continue. Each
    world's name can be copied here (to share it: a friend makes it with New Known World) and the
    world deleted (the button asks again). Worlds have no other names.
  - **Join Game**: the hero that goes (it becomes the chosen one) and the friend's room code. The
    friend's world never becomes the hero's world.
  - **Choose Character**: three places, a new hero needs a name and a gender (Male or Female,
    Male picked at first); choose one (back to the title), edit (the name and the gender), delete
    (the button asks again; the chosen one gone, the next is chosen).
  - With no hero yet the title says so, and OK goes to Choose Character. Esc goes back a screen.
- **`?join=CODE`** opens Join Game with the code filled in (even with `?dev=1` or `?seed=`).
  A failed join comes back there and says why. Joining is only done in the main menu.
- **The Esc menu** in a world: "Save and quit to the menu" (with friends in a hosted game it asks
  first: they drop out). A guest's "Leave the game" goes back to the main menu too; when the
  host leaves, the guest plays on in the friend's world, unsaved, until it quits.
- Quitting (`menu.js quitToMenu`): the hero and world are saved a last time and no longer saved
  (`stopSaving`), the game with friends ends, the screen goes dark and the world goes
  (`flow.js endWorld`: the cubes, the enemies, the neighbours, the run). In the menu the frame
  runs the showcase, draws the hero over it and lets a join go on (`main.js menuFrame`): the
  hero's bars are hidden, there is no music.
- **The chosen hero over the menu** (`render/portrait.js`): the player's own figure with the
  chosen hero's bag (the weapon in its hand, `syncEquippedWeapon`), idling and turning a little
  to and fro, its name and level under it; a click on it is Choose Character. It stands in a
  little scene of its own (its own camera and lights, the same far fog so no shaders change),
  drawn after the world into a box: right beside the menu, as tall as it, on a wide screen;
  above the menu on a phone held upright; not at all without room
  (`menu.js heroBox`). There is one figure: in the menu it moves into that scene, in a game
  back into the world's.
- **Behind the main menu** (`showcase.js`): the cube the chosen hero left its world in (the town
  if it was never there, or left it in a house), with what it did there (its defeated enemies
  stay gone, its chests open); choosing another hero or world fades over to theirs. With no
  hero, or one without a world: a random cube of a random world (a new seed each time the menu
  opens), at any depth, every 10 s another, with a fade between. Their enemies and villagers go
  about their business: the hero waits far away, so nothing notices it, and the
  enemies idle and wander about their homes. The camera goes round slowly, the whole cube in
  view (zoom 1: it does not lean towards the parked hero). With no hero there is no hero's light,
  so below the ground a lamp over the middle of the cube lights the caves instead (as strong as
  the depth's `lamp`). The next cube is
  made in the world worker while one shows (5 to 40 ms; building it about 2 ms) and the one
  before is dropped, so the menu can stay open for hours. Wide screens have the menu on the left
  and the picture moved right (`camera.setViewOffset`), a phone held upright has it at the bottom
  and the picture moved up. Starting a game or a friend's world coming in takes its place (it is
  the game's own world machinery: `state.cubes`, `state.map`, the enemies).
- N (a new world) is a dev tool now: new worlds come from the menu.

## Heroes and worlds, apart

- A **hero** (up to 3) is the character: a name, a gender (`'m'` or `'f'`: it only changes words,
  [story.md](story.md#still-open); heroes saved before it are `'m'`), the XP (the level follows from it), the bag
  with everything in it (`core/inventory.js`: slots, coins, quick bar, the weapon in hand) and
  its world, the one Continue goes back to (`null`: none yet, or it was deleted). A hero goes
  into any world, a friend's too, and takes home what it found there; a friend's world never
  becomes its world (it is not saved here). Playing a saved world makes it the hero's world.
  `{ v, id, name, gender, created, updated, playTime, xp, inventory, world }`
- A **world** (up to 8) is a seed, a level (fixed when it is made, [progression.md](progression.md#world-level);
  worlds saved before levels are level 1) and what was done in it: what was defeated, the gates and
  chests opened, the drops that came (`run.dropped`), the loot lying on the floors, the open town
  portal, the quests ([quests.md](quests.md): they are the world's, not a hero's), the open side
  faces, the discovered cubes, the deepest depth reached, and where each hero left it (`spots`: the cube and its entry). The map is never saved: the seed makes the same
  cubes again (`world/`). A world is named after its seed (`core/names.js`, below); a seed saved
  a second time is its copy 2, "... II". The name is written along but never read back.
  It also keeps its play time (`run.clock`) and the ordinary kills, for them to come back
  (`run.kills`, [progression.md](progression.md#enemies-come-back)), and what the narrator
  has said in it (`run.told`, [narration.md](narration.md#in-the-game): nothing is said twice,
  and the Memories tab lists the glassmaker's recordings heard from it). A new world's clock starts
  at noon (`START_CLOCK`, `core/daycycle.js`); the beginning's two gates (`intro:glass`,
  `intro:sword`, [story.md](story.md#the-beginning)) are kept with the guardians' in `gates`. A
  world saved before the beginning existed, somebody already out past the merchant camp, gets both
  opened when it is loaded. A hero's Old Sword saved before it was the glassmaker's is renamed so.
  `{ v, id, seed, copy, name, level, created, updated, deepest, run: { defeated, gates, chests, dropped,
  loot, townPortal, quests, clock, kills, told }, faces, visited, spots }`
- Coming into a world a hero has its level and bag, full health, no potions at work
  (`heroStats`). It comes in at the entry of the cube it left that world in (or the cube a fall
  started in), else in town. What it defeated there stays defeated, until its time to come back
  is up: no cube is put back.

## World names

Every seed has a name of its own, and the name gives the seed back (`core/names.js`):
"The Sunken Vale of Ravenmere", an adjective (512), a landmark (256) and a place made of a
prefix (512) and a suffix (64): exactly 2^32 names, one for each seed. The seed is stirred first
with steps that can all be undone (`mix` / `unmix`), so seeds side by side get names nothing
alike. `seedFromName` reads a name as typed (any case and spacing, "the", "of" and a copy number
may be left out), `readSeed` a name or a number: a friend can share a world by its name.

The words are hand-picked; the tests check that every place reads only one way and that nothing
rude comes out, also where a prefix meets a suffix. The lists are fixed: a changed word renames
the worlds that have it and their old names no longer find them. Worlds cannot be renamed.

## Where they are kept

`localStorage`, as JSON (`KEYS` in `core/save.js`):

| key | what |
|---|---|
| `cube-crawler.heroes` | the heroes, one list |
| `cube-crawler.worlds` | the worlds' index for the menu: id, name, seed, level, updated, deepest, heroes there |
| `cube-crawler.world.<id>` | one world (they grow: mostly the floor loot) |
| `cube-crawler.last` | the hero chosen in the menu (`{ hero }`; Continue plays it in its world) |

What is read is checked (`checkHero`, `checkWorld`, `checkInventory`): an item the game no
longer knows leaves the bag, the quick bar and the hand only keep what is still there, damaged
entries are left out. Every entry has a version `v`; `migrate` brings an older one up to this
version. An entry from a newer version is left alone (not read, not overwritten). When the
storage refuses (full, private mode) the game says so once and plays on; in private mode the
saves last as long as the page.

## When it saves (`game/save.js`)

- Once a second it looks whether something changed (XP, the bag, the cube, kills, gates, chests,
  drops, the floor loot, open faces, the town portal, discovered cubes) and then writes the hero
  and the world. Every 30 s anyway (the time played), and when the page is hidden or closed.
- Not while on the way between cubes. Where the hero is, is only taken when it stands in a cube.
- Only what came from the store (`play`, `playAsGuest`) or went into it (`saveAs`) is saved:
  with `?dev=1` or `?seed=` nothing is, until `/save` or `/load` (`docs/console.md`).
- A saved hero keeps its character through a new world (N, `state.keepHero`); that new world is
  not saved (the saved one is no longer played).

## Playing together

- The host's world is saved on the host's machine, with what the guests did in it (their kills,
  chests and drops are in the host's run anyway, `docs/online.md`).
- A guest saves its hero only. Joining takes the guest's world off saving (`detachWorld`, from
  `net/session.js welcomed`): it stays as it was. After the host leaves, the guest plays on in
  the friend's world unsaved.
- What a player puts down from the bag is `b:<player>:<page><n>`: a new page has a new tag, so a
  reload never makes a drop with the id of one lying in a saved world.

## Loading

`newWorld(seed, { keepPlayer, restore })` (`game/flow.js`) starts the saved world: the run, the
open faces (only those between two discovered cubes, `visitedFaces`: older saves held a large
area's inner faces open before its cubes were visited) and the floor loot come back at once, the
hero comes in at its spot (the town, if that
cube does not come: the generator changed), then the discovered cubes are made again in the
background, the nearest first, for the minimap. `knowDepths` tells the chronicle which depths
were reached before.

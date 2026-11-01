# The map, the rune stones and fast travel

Status: implemented. The large map is the inventory's **Map** tab (`src/game/mappanel.js`, its
pictures `src/game/mapdraw.js`); the rune stones are planned by the world (`src/world/spots.js`),
placed in their cubes (`src/cubegen/spots.js`), guarded (`src/game/enemyspawn.js`), drawn
(`src/render/runestones.js`) and woken and travelled to by the game (`src/game/runestones.js`, the
rules `src/core/runestones.js`).

## The map

- **Opening it**: M (the music moved to N, `core/keybinds.js`; both can be bound anew in the
  settings), the Map tab in the inventory (Bag, Quests, Memories, Map), or a click or a tap on
  the minimap. M again, Esc or Close shuts it. Pressing a woken rune stone opens it too, on its
  depth, that stone chosen. Alone the world waits while it is open (it is the inventory); playing
  together it goes on.
- **One depth at a time**, north up (the minimap turns with the camera, this map does not: the N
  sits in its corner). It shows what the minimap knows: the cubes explored on that depth (visited,
  or found by a friend: `visited`, [online.md](online.md#one-map-for-both)). Nothing is shown of
  a cube nobody has been to, but a portal leading out of an explored cube to one not explored
  draws a ghost of it, dashed, with a "?".
- **Each cube is a picture of its ground from above** (`mapdraw.js thumbOf`, made once from its
  map and kept with it): every cell the colour its theme gives the ground at that height (the
  theme's `top`, lighter higher), or of its fluid (its palette's body colour,
  `render/fluidpal.js`), lit from the top left (a cell higher than the one up and left of it
  lighter), a dark line where it drops by a cliff, a pale one where a fluid meets its bank, the
  ways' stairs and bridges in wood. No props: the shape of the land is what reads. The pictures
  are cut like stones (the menus' cut corners, [ui.md](ui.md)), with a lit edge, on a faint
  lattice of where cubes could be.
- **The marks**, drawn upright on top in the minimap's colours: the open faces between cubes as
  green bands across the gap; a side portal a little square on its face (gold: it leads
  somewhere new, cyan: explored, red: locked); the rings up and the wells down as triangles where
  they stand; the boss of the way down a crown over its well (amber while he stands, grey once
  beaten), a side guardian still standing a red crown over its arena; the open town portal a
  violet dot (in town too, at its other end); the quest followed a gold pin where it wants you,
  or a dashed gold frame round the cube when the place must be looked for; the rune stones (woken:
  an amber gem glowing; asleep: a hollow teal one); the friends as arrows in their colours, and
  we on top, white alone (in a house: a dot at its door).
- **Down its left side** the depths reached (those with a cube explored, and the one we are on),
  the town first ("The town and the road out of it", depth 0), each with its theme's name, a white
  diamond on the one we are on, and its rune stones as ◆ (awake) and ◇ (not yet). A click shows
  that depth, fitted into the view (at least 56 px a cube) with the hero in it if they are there.
- **On the right** what the cube under the mouse (or the one chosen with a click or a tap) is:
  its name (the town, the way down, a guardian's arena, a trial room by its name, where the horde
  gathers, where the depth begins; else where it lies, in the quests' words, `core/questplan.js
  clueOf`: "near the windmill, off the main way") and what is there: you, your friends, its
  guardian (standing or beaten), its trial (mastered or waiting), its rune stone, how many of its
  treasure chests are open, the town portal, the quest followed, how many ways lead out, and its
  cube and depth as the minimap says them. With nothing chosen: the depth (its theme, the rooms
  explored, the rune stones awake) and a list of its woken stones, each with **Travel there**.
- **Moving about**: drag to pan, the wheel or a pinch to zoom (26 to 260 px a cube), + / − and ⌖
  (back to the hero) in its lower left corner; with the map focused the arrows pan and + / −
  zoom. A tooltip with the cube's name follows the mouse.
- **On a phone** ([touch.md](touch.md)) the depths are a row along the top, the map 340 px high
  under it, what a cube is under that; held sideways (the `ui-h540` class, `game/uiscale.js`) the
  three stand side by side again, the map lower. Touch never travels on the first tap (below).
- It keeps the panel's size ([ui.md](ui.md): the panel is as large as its largest tab) and
  draws itself only while it is in front: when something changed (the view, a pointer) at once,
  otherwise four times a second (the friends walking about).

## Rune stones

- **Where**: every depth but the town's has `RUNESTONES` (three), planned from the world's seed
  alone with the quests' spots (`world/spots.js planSpots`), after all of them and on a stream of
  their own, so nothing else moves for them. The first in a room on the way about a quarter into
  the depth; each next in the room farthest from those chosen (spread over the depth, not all
  along its way), a room on the way a little before a branch, an easier one before a harder one.
  Never in the town, a guardian's or boss's arena, a trial room, the horde's room, an annex, the
  beginning's rock, a room with an outpost or a camp; each in a room of its own; fewer only where
  a depth has too few rooms. They are kept apart from the spots the quests choose from
  (`layout.runestones`, not `spotList`: no quest giver or hiding place is ever a stone), but go to
  their rooms with the rest (`layout.spots`).
- **In the cube** (`cubegen/spots.js`, kind `runestone`, placed last): a cell for the stone with
  its four neighbours level with it (room for the fight round it), one of them where it is pressed
  from (`approach`); a few cells in from the portals, not on the way itself (it stands in the way:
  a blocker on its cell, and every portal still leads to the exit round it), reached both ways
  like every spot (ways are built to it if needed). Its anchor turns it to face its approach.
- **The look** (`render/runestones.js`, made in three.js, not loaded: low-poly and flat-shaded like
  the world, the menus' glass on top): a standing slab of dark rock on a two-step plinth, a rune
  cut into the face it turns to whoever comes to press it, and over it a crystal of the bird's
  teal glass, turning slowly. Asleep the rune is a dull teal and the crystal dark. Woken (over a
  second and a bit) the amber core lights in the crystal with a halo, the rune glows amber, a ring
  of amber light lies round its foot, and its light (a source of the light pool) shines on what is
  round it. Its shape and rune come from its seed: the same for everyone, every time.
- **Guards** (`enemyspawn.js runestoneGuards`): two of one of the room's own kinds that walk (never
  a fluid dweller, never a troop) on depths 1 to 4, three to 11, four deeper, standing 1.4 to 4
  cells round it facing out. Which kind, and where, come from the stone's seed. They are the room's
  ordinary enemies otherwise: they come back after a while like the rest (`respawn`,
  [progression.md](progression.md#enemies-come-back)), also once the stone is awake.
- **Waking one**: walk up to it (a click on it walks there and presses it, `orders.js orderPart`;
  the action key F or the use button beside it). It is one of the parts the action key uses
  (`game/trials.js usableParts`, type `waystone`), so it is hovered and labelled like the rest
  (`game/lootlabels.js`: "Wake the rune stone", awake "Rune stone · open the map"; its body the
  stone and its crystal). Pressed asleep it wakes for good: a chime, sparks of amber and glass,
  "The rune stone wakes! Travel back to it from the map." over the hero and in the chronicle
  ("You woke a rune stone on depth 3", told to friends too, `core/chronicle.js` kind `rune`).
  Pressed awake it opens the map on its depth.

## Fast travel

- From the map, to any woken rune stone of any depth reached: a click on its gem (the mouse goes at
  once), on a touch screen a tap chooses it and a second tap goes, or its **Travel there** button.
  The panel closes, the screen fades like the town portal's (`game/runestones.js travelTo`), and
  the hero comes in where the stone is pressed from, facing it, the cube entered as through a
  portal (its enemies come back if their time is up; a visit begins there).
- **Not allowed** (`travelBlock`, the button off and the reason under it; a click says it): on the
  way between cubes, dead, down, knocked over, held or swallowed, falling;
  in a guardian's or boss's arena while it stands (no travelling out of the fight, as the arena's
  faces ask "Leave the fight?"); in a trial room sealed while its event runs ("The way out is
  sealed"); in Umbra's reef while it floods or the hero wears the diving suit ("Not under water").
  Anywhere else it is allowed, a house in town too, and a scroll being read is cut off.
- **Playing together** everyone travels on their own, like with the town portal scroll: the
  stones woken are the world's, so each can travel to any of them, and whoever wakes one wakes it
  for all (`rune`, [online.md](online.md)). A friend left behind is not taken along (the teleport
  scroll goes to a friend).
- It costs nothing: the stones are the depth's way back, the town portal scroll the way home and
  back to where you were.

## Saved and shared

- The woken stones are the world's, like its quests: `run.runes`, their spot ids
  (`<seed>:<cube>:spot:<n>`), saved with the world ([saves.md](saves.md); `core/save.js
  checkRunes`), restored on loading, sent to friends (`rune`, and in the `welcome` / `world`, so a
  guest joining sees the host's; `net/session.js`).

## Developer commands

`/runes [depth]` wakes the stones of this depth (in town: of every depth), or of that one (`0`:
every depth); `/reveal [depth]` explores every cube of this depth (or that one) for the map, made
in the background; `/spot runestone [depth]` stands at the next stone (`docs/console.md`).

## Checks

`node --test tests/runestones.test.js` (the plan: three a depth where there is room, spread,
deterministic, off the rooms they keep out of; in their cubes reachable and in the way, with
their guards; saving and the chronicle), `tests/spots.test.js` (every spot of a world placed, the
stones too), `tests/keybinds.test.js` (M the map, N the music). In the game (`?dev=1`):
`await (await import('./tests/browser/map.js')).runMapChecks()` (M, the tab and the minimap open
the map, the depths switch it, a stone wakes and opens the map, travelling by a tap and a click,
not out of a guardian's fight).

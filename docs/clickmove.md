# Click to move

The game plays with the mouse alone, Diablo style (`src/game/orders.js`): click the floor to walk
there, an enemy to go and hit it, an item, chest, villager or trial part to go and use it, a
portal or a door to go through it. Holding
the button keeps walking towards the cursor. The settings can turn walking to the floor off
(Input, "Click the floor to walk": `game/input.js`): a click then only goes for what is under the
cursor, as a tap on a touch screen does. WASD (or the touch stick) takes over at once. Taps
on a touch screen are the same orders.

## Ways out

The ways out of a cube are hovered and clicked like chests (`src/game/ways.js`,
`game/lootlabels.js`, labelled when hovered):
- a side portal's gate
- a well down and a ring up
- the town portal's pad
- a town house's door, and the door back out

A click walks up to it the same way as any walk, and then:

- **Gate or door:** it walks on into it until it takes you (`game/portals.js`, `game/doors.js`).
- **Well, ring or town portal:** it stops in its middle and stands there while it charges.

A locked one (a guardian's or a boss's) says why when you get there, and the order gives up.
Leaving a fight asks first, as when you walk out yourself. With `?dev=1`, Alt+click takes a
portal at once.

## The way

`src/physics/playernav.js` finds the way, from the node the hero stands on to the one clicked.
The nodes are the floor graph the enemies walk (floors, stair and bridge pieces, landings:
`physics/floornav.js`). Some steps only the hero takes:

- **Ladders** (`map.ladders`): up from the floor at its foot, down from the floor at its top;
  one out of the water (`wet`) up from the water, swimming.
- **Jumps** (`src/physics/leaps.js`): over a gap of up to three cells, up onto a ledge too high
  to walk up, and down off one (walked off slowly, or jumped).
- **The water** (`waterEdges`): from a water floor to the water beside it at its surface (waded
  or swum: a cell swum costs `RUN_SPEED / SWIM_SPEED`, one waded 1.4), out onto the ground beside
  it up to a level over its surface (where the middle of that ground's edge is no higher than a
  swimmer climbs: `SWIM_STEP`), and into it off a bank up to three levels over it (the order lets
  the walk go off the bank into deep water: `player.wetOK`, `physics/canmove.js`). Never where
  something overhead leaves no room for the head, through a fence, or under a bridge it would
  walk onto instead.

The cheapest way wins, counted in cells walked. A ladder costs its height at climbing speed and a
jump a little extra, so the hero walks where walking is about as short. When the target cannot
be reached, the walk ends on the reached node closest to it, with height counting like distance.

## Which jumps

Jumps are not guessed from heights. They are found by making them with the hero's own physics
(`physics/move.js`), in the cube he is in. A jump is a run-up along the middle of the take-off
cell, the jump where along the cell it was found to work, and straight on in the air, braking
back over the landing cell. It only counts if it lands on its floor every time, softly (no
sitting down), and keeps standing there. It also has to work from a little off the middle, a
little late, and at a lower frame rate. Over what kills (lava or acid, or nothing at all) it has to
work with wider margins too (water is swum in: no margin).

Jumps are found per map, floor by floor as the way's search reaches them, and per what the hero
can do now. A leaping potion jumps higher, a swiftness potion or light boots leap further, a
chill runs slower. Once found, they are kept.

No jump or drop crosses a visible fence, and walking off a ledge does not cross an invisible
rail either.

## Along the way

- **Walking** cuts corners where the straight line keeps to the way's nodes, walking from one to
  the next as the floor graph links them. So it never gets onto a stair or bridge from its side,
  never walks under a bridge it means to cross, and never walks up a cliff between two rows of
  the way. It stops cutting before a ladder or a jump.
- **Ladders**: to the middle of the cell in front of it (or above it), then into the wall (or out
  over the edge) until `physics/climb.js` takes hold, and on up (or down). A mouse order only
  takes hold of the ladder its way climbs: walking past another never climbs it.
- **Jumps**: to where the run-up starts, then along the cell, jumping at the take-off. Jumps
  always run, even with Ctrl held.
- A jump or ladder that does not work out (it landed elsewhere, or did not take hold) is left
  out of that walk from then on, and the way is planned anew. If the hero is pushed off the way,
  it is planned anew from where he stands.
- New clicks while a jump or climb is under way (holding the button) wait until it is over.

## Trying it out

`/testroom leaps` (with `?dev=1`) has a trench to jump, a ledge to jump onto, a tower with a
ladder, a gap two cells wide down to low ground, steps back up and a pit left by its ladder.
`tests/clickmove.test.js` walks it, the `climb` room's ladders and random clicks in generated
cubes. `tests/browser/clickmove.js` plays the same clicks through the game's own update
(`runClickMoveChecks`), and clicks a house's door and back, a town gate, a locked well and a ring
up (`runWayChecks`).

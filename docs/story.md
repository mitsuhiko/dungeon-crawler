# Story: the broken world

Status: a sketch, being worked out; of it a first try at the opening ([film.md](film.md)), the
beginning in the town and the robot coming and following (below) are built. This page replaces the
earlier story (an old Glassmaker woman whose memories were the cubes). The narrator's lines of that
story are gone: what it says now (`src/core/narration.js`, `src/game/narrator.js`,
[narration.md](narration.md)) are the glassmaker's recordings (the beginning's, and his glass in
the depths that have a boss: "His glass in the depths" below) and the robot (its hello, and from
then on what it sees: "What the robot says" below). Complements [world.md](world.md),
[bosses.md](bosses.md), [quests.md](quests.md), [saves.md](saves.md), [online.md](online.md) and
[i18n.md](i18n.md).

Tone: still cheerful, with a sad edge, and hopeful at the end. Short lines while you play, one or
two sentences at a time.

Setting: mystical, with a steampunk turn: brass, steam, clockwork and star-glass. There are no
scientists, no space and no rockets; there are star-readers, the sky and winged machines.

## What happened before

- **The stone.** The star-readers saw that a great stone was falling towards the world.
- **The glassmakers.** They went to the glassmakers (craftsmen, not star-readers). Their glass is
  made of star-sand, and it does two things: it **keeps** whatever it closes round, unchanged,
  as amber keeps a fly, and it **rises**, because star-sand wants to go back to the sky. So the
  glassmakers closed their glass round pieces of the world, and the pieces rose. Whether they
  cut the whole world into pieces or only saved some of it is left unclear.
- **The ark.** A winged ark of brass and glass, with great wings like a bird's and steam
  billowing under it, carried the pieces up into the sky. One of the glassmakers went with them,
  to tend the glass.
- **The creature.** The star-readers also brought a creature on board, because it makes something
  important for keeping the pieces going (what exactly is still open; maybe what keeps the glass
  aloft, or the light in it).
- **The comet shower.** A small comet shower struck the ark. Its glass wings broke, and the
  pieces it carried, no longer held together, scattered into the dark, each its own way. The
  glass round them cracked, but held.
- **The fall.** The ark's hull fell, with the glassmaker and the creature in it, below all the
  pieces, to the bottom of the broken world: the core, where no light reaches. The game's way
  down through the depths is the way there.
- **The kidnapping.** The creature is very clever and learned the people's language. Down there it
  holds the glassmaker, and made him build something it could escape with. (Its escape did not
  break anything.)
- **The recordings.** While he is held, the glassmaker blows his words into small bubbles of
  star-glass (it keeps what it holds: his voice) and lets them go. Star-glass rises: they come up
  through the dark and come to rest wherever they come to rest, in the pieces above. He cannot
  know where, or who hears them. That is how they reach the hero's piece, and why they lie
  scattered about. The opening is one of them.
- **Forgotten.** Nobody remembers any more what happened.

## The world

- The world is broken into many cubes. Some still hang together; most cannot be reached at all.
  Many people live in parts of the world the game never takes you to.
- **You only ever play in one part of the world.** Every game you are a different person in a
  different part, which is why the world is different every time you play.
- **Nothing carries over** from one game to the next.
- Here and there the glass has **cracks** that still hold.

## The people

- **The glassmaker**: a man, a craftsman, who went up with the pieces on the ark, fell with it to
  the core and is held there by the creature. He is
  never seen; you only hear his recordings. His name is still open.
- **The robot**: a clockwork robot of star-glass, built by the star-readers. It lies asleep in the
  merchant camp until you wake it. From then on it goes with you, lights the way, and will
  help you, bring you back when you die and tell the story as you play (below, "The robot").
- **The creature**: the last boss, waiting at the core. Clever, speaks the people's language, and
  wanted to escape. It was brought on board as something to be used, which makes it a prisoner too.
- **The hero**: a different person every game, from whichever part of the world the game is in.
- **The other bosses**: just bosses that want to stop you. They have no story of their own, so
  the ones we have stay as they are.

## The robot

Decided:

- **Its look**: star-glass, mostly, like the glass bird: a floating, faceted oval of clear, faintly
  aqua glass with two eyes, that hovers (no legs) on little wings. Its gears show, and are glass
  too. The model (`blender/robot.py`, `assets/robot.glb`) adds a little brass:
  about 0.4 cells tall, 0.33 wide (0.6 with its wings), its middle 0.9 above the floor (the hero's
  shoulders). It has two round amber eyes in thin brass rims like portholes, a brass band round its
  waist, and an amber core glowing inside like the bird's, with two meshed glass gears turning
  behind it. Each wing is four glass feathers, swept back like the ark's, on a glass gear that
  turns as its hub. On top is a small wind-up key of glass on a brass shaft.
- **Its clips**: hovering (it looks about and blinks), flying after the hero, talking (its eyes and
  core pulse with the words), lying in the mud, waking up (eyes open, lifts off, shakes off the mud),
  bringing the hero back (rises, turns, spreads its wings, the core flares) and cheering (a hop and
  a somersault).
- **How it wakes** (built: `src/core/robot.js`, `src/game/robot.js`, `src/render/robot.js`): it
  lies on its back in the merchant camp, across the road from the camp's glass as the hero comes
  in (`CAMP_ROBOT`, `world/town.js`), asleep (its clip `RobotDormant`), its core only glimmering,
  labelled "Robot of star-glass". It does nothing until the hero wakes it: a click on it walks them
  up to it (or the action key beside it, "Wake the robot"). Then whatever is being said is cut
  short (the camp's recording too), and it wakes (`RobotWake`, 3.6 s: its eyes flicker open, it
  lifts off and shakes itself) and says hello as it does (`robot`, `core/narration.js`, in its
  voice): oh, the hero woke it, it has been lying here a long, long time; the star-readers made it,
  of glass and clockwork; it had a name once but cannot find it any more; it will come along and
  light the way, further down it gets dark. Once it is up it follows. It says nothing else before
  its hello is over. (A first try at its character: cheerful and eager, a little forgetful. Its
  name stays open: it cannot find it.) The world keeps that it woke (its hello, told: `run.told`),
  so from then on it is with the hero as they come into the world, in the town too. A world played
  before it lay in the camp has it lying there until it is woken; the dev tools (`?dev=1`) skip
  its waking with the beginning (`&intro=1`: it lies there).
- **How it follows**: along the hero's way, not straight at them: where they went, a trail of
  crumbs, and it flies along it 1.6 cells behind them, a little to the side, never right on them,
  hovering at their shoulders. It flies a little slower than the hero runs, and faster the further
  behind it is: running, it falls back two or three cells; once they stop it catches up, from
  anywhere, within a few seconds (never more than 20, nor 60 cells behind: then it jumps ahead).
  It goes through the gates and across the sides they went through, so it can be left in the cube
  behind for a moment (drawn there while that cube shows). Where the way does not go on (a door
  into a house, a well, the town portal, a fall, coming back after a death) it fades out and in
  again where the hero came out. Coming back towards it the short way, it takes the short way too.
  While it waits it drifts about a little and looks at the hero; while it talks it faces them.
- **It is in no fight**: invincible, nobody's target, nothing hits it, it is never in the way
  (it has no body) and cannot be clicked. It flies round the heroes and the enemies, never through
  them (round to the side, or over one where a wall is beside it).
- **Its light**: its amber core lights what is round it (a moving light, about four cells).
- **It brings you back** when you die, to the last safe place (not built yet).
- **Its memory**: it knows something about the glassmaker, but cannot get at all of what it
  remembers at once. What it says is not one of the memories (the inventory's Memories tab: the
  glassmaker's glass), unless a line of it is marked to be. A first try: a scrap comes back to it
  as each boss is beaten (a tower with no roof, water in glass seen from high above, flying between
  things hung on lines of light, a small furnace, a cloth over something that watched), never more
  than his recordings tell, and it does not know what it means.
- **Playing together**: every player has a robot of their own, and everyone sees everyone's
  ([online.md](online.md)). One of them, the host's, is the one that tells the story.

Still open:

- Its name and its character (its voice is settled: `robot`, [narration.md](narration.md); its
  hello is a first try).
- What it knows about the glassmaker and why it cannot get at all of it (damaged, or parts locked
  by the star-readers?). What brings a memory back (going deeper, a recording found, something it
  sees?), and how it tells one when it comes back.
- Whether the glassmaker made its glass, and whether it knew him.
- How it helps besides lighting the way and bringing you back (pointing at recordings, warning?),
  and whether it ever fights.
- What bringing you back looks like, what "the last safe place" is, and what it costs.
- Playing together: what the other players' robots do and say, whether they look different (a
  tint each?), and what happens to the story's robot when the host leaves.
- Whether it should fly straight over gaps and up cliffs where the hero takes the long way (now
  it keeps to their way), and whether it ever goes ahead (to a recording, to warn).
- Its sounds (ticking, the whir of its wings, a chime of glass).

## How the story is told

- **The opening.** A new game starts with a short animation of what happened before, told by the
  glassmaker. A first try is built (`src/film/opening.js`, [film.md](film.md)): a minute and a half, a
  recording of his from long after, down at the core. He never says his name ("Names do not keep
  in glass"), but the star-readers came to him, his hands made the glass, he gave the ark its
  wings. The stone; the glass closed round pieces of the world; the winged ark rising out of its
  steam; then, without a word, comets, the wings break, the hull falls, the pieces crack but hold
  and tumble apart. One comes to rest and time goes by in it; a bubble of star-glass (his words)
  rises into it from below; "Find me". The game's name, closer and closer into the piece, black,
  and the game starts in the town. It plays before the hero comes into a new world, scored with
  the title song (`music/films/opening.scrim`): the toy tune out of the dark, as the glass is
  closed and with the title; under the words only a ghost of it.
- **The robot** talks while you play, reacting to what happens (a robot can see what you do; a
  recording cannot). It replaces the earlier narrator's reactions.
- **The glassmaker's recordings** lie at random places on the map and tell his story, what
  happened to him and to the world. They are always in his glass: a bubble of star-glass, and a
  recording plays when its bubble is found and breaks, never for coming somewhere or doing
  something. The first two are the beginning's (below). Once begun, a recording is kept: the
  inventory's **Memories** tab plays it again. Only his recordings are memories: the robot's
  lines are not, unless one is marked to be.
- **He does not know where his glass lands.** He blew his words into it down at the core and let
  it rise; he never says what lies round the hero (a town, a gate, "the next gate"), only what is
  true wherever it came to rest.
- **The ending** (below) is the same in every world.

## His glass in the depths

Built for the depths that have a boss (`core/glass.js`, `world/spots.js`, `game/intro.js`): the
road out of town (0), the sky (1 to 6) and the bottom of act II (13). Each such depth has a
**chapter** of the before time, three recordings of about four lines, and a world places two of
the three (from its seed): one **on the way**, in a room of the route about halfway along, and one
**hidden**, in the hardest room of the depth to get to (a branch, high up, behind a guardian). So
one world tells part of every chapter, another more of it, and a hero who goes looking hears more
than one who runs for the well. Each recording stands on its own and says what matters most first.

They are his glass like the town's: a bubble of star-glass floating over the floor (a spot of
kind `glass` the cube keeps clear, `cubegen/spots.js`), labelled and clicked like the
beginning's; walking into it breaks it and his recording plays (the memories keep it, "found at
depth N"). Leaving the depth cuts it short. Playing together, one found plays for everyone, its
glass gone for everyone.

They tell the before time, never what is where the glass lies: he cannot know where it comes to
rest. Now and then one touches on its depth sideways (a glassmaker's breath where Gusto breathes
in, star-readers who never light a fire where Totnar brings the dark, a tide trapped in glass where
Squarlo calls his, the ark turning where Flip turns his box, glass that minds heat over Foggery's
lava, a day he would keep where Renew turns time back, a face behind a cloth where Mansk is a mask,
comets still falling at night where Slomo's meteorites do).

The chapters, in the order of the depths (the depths between, 7 to 12, are left for the voyage
with the creature aboard; act III for the core):

| Depth | Chapter | The three recordings |
|---|---|---|
| 0 | his craft, before everything | `breath` (glass begins as a breath; he is old now, so his words are small), `star-sand` (what is left where a star came down; it wants to go back up; nobody bought star-glass any more), `birds` (his workshop; children at the window; the little glass birds he blew for them) |
| 1 | the star-readers and the stone | `readers` (the tower with no roof; they never lit a fire), `red-light` (the stone a small red light that grew; he kept his furnace burning so as not to look up), `lanterns` (they came at night; the oldest asked if he could make a great deal of star-sand rise; he said yes too quickly) |
| 2 | closing the glass round the pieces | `sea` (the sea the hardest; its tide still comes in inside the glass), `lines` (the star-readers drew lines on maps; he never asked about the places between), `bread` (nobody had to do anything; a baker went on baking; he had no piece of his own) |
| 3 | the ark's wings, and rising | `feathers` (a thousand glass feathers, each wanting the sky a little), `rising` (the ground turned away like a page; up and down stopped meaning much; the pieces came after like lanterns on a string), `steam` (the ark breathed steam; the pieces hung under her on lines of light; they learned to turn slowly) |
| 4 | tending the glass aboard | `furnace` (a small furnace in the hold; star-glass minds heat), `rigging` (every morning up the rigging; a cracked pane sounds high and thin), `cracks` (a crack is not a break; do not be afraid of them) |
| 5 | days on the ark | `one-day` (the day he would keep if he could; glass only keeps), `clockworks` (the star-readers' winged clockworks, four glass feathers a side, good at finding people: the robot is never named), `evenings` (the sun going down below them; nobody spoke of the stone) |
| 6 | the creature brought on board | `cloth` (one more thing under a cloth, put next to his furnace), `face` (the cloth slipped: a face that looked at him the way people look; he said he was sorry), `jar` (every evening a jar filled in the hold, humming; the pieces shone brighter; he did not ask) |
| 13 | the comet shower and the fall | `shower` (small comets at night, beautiful, then the wing; some still fall), `wings-broke` (the whole sky sounded like a cracked pane; the pieces drifted off like lanterns let go), `bottom` (they fell below everything into something soft; the cage was empty; something in the dark said his name, learned from him) |

## What the robot says

Built: from its hello on (`robotMet`, `core/robot.js`) it talks about what it sees, in its own
voice (`core/narration.js`, the robot's lines; never before its hello is over). Cheerful, a child's
voice through clockwork, it knows the enemies and the bosses and gives tips; of the story it knows
only scraps. It is a companion, not a commentator: it keeps quiet a good while between lines
(`ROBOT_REST`: over a minute before chatter, 40 s before what happens, 12 s before a call in a
boss's fight or after a death; only the story's scenes, a depth, an arena, a boss beaten, never
wait), and what comes while it keeps quiet is not said (it may come another time). Every line once in a world; what happens again and again (a death, a chest, standing about)
is said in another order in every world (`shuffle`), so playing again brings other lines.

- **A depth reached** (the boss depths), **a theme's first place** (the first act's and the slime
  marsh), **wandering** about a place not seen before (the sky, and depth 13).
- **An enemy of a new kind** coming after the hero: what it is and how to beat it.
- **A boss's arena**: what it sees and the one thing to remember (Gusto's wide arms, the hills
  that stay dry of Squarlo's tide, climbing ahead of Foggery's lava ...); **in the fight** a short
  call as his attacks start and as he changes (step out of the breath, up a hill, beat the cats
  first, jump over both waves ...); **beaten**, a cheer and a scrap of memory.
- **A death**: it brought the hero back to where they came in; dying to a boss, a tip for him.
- **Trial rooms**: what to do as an event seals the room, how a puzzle works as the hero comes to
  it (`trial` `puzzle`), done and failed.
- Low health, a long fight, enemies beaten, a level, a chest, a rare find, a quest taken, a horde
  waking, a fall, coming home, standing about.

## The beginning

Built (`src/core/intro.js`, `src/game/intro.js`). After the opening the town comes up slowly out of
the black, at noon (a world's clock starts there: `core/daycycle.js` `START_CLOCK`). The hero comes
empty-handed. Three things lie in the town's two parts; the town's glass and the sword each open a
gate that will not open until it is found (gates of his glass, like a guardian's:
`world/layout.js`, kept with the world). Two short recordings go with them, one in each glass
(`RECORDINGS`, `core/narration.js`):

1. **The glass** (`TOWN_RELIC`, `world/town.js`): a bubble of star-glass the size of a head,
   floating over the plaza a few steps from where the hero stands, faceted teal glass with an
   amber core (`src/render/glassbubble.js`). Walking into it breaks it, the town's gate opens, and
   his voice comes out (`'glass'`): his glass found someone; it keeps his words, to hear again (the
   Memories tab opens); the world is in pieces, and where the pieces meet there are gates of his
   glass; they open for whoever carries it, so carry it and go on.
2. **The camp's glass** (`CAMP_GLASS`): another bubble, a few steps into the merchant camp from
   the town's side, beside the road. Walking into it breaks it (`'camp'`): his old sword rose with
   this glass, tied to it, and if the knot came loose it did not fall far; a sword falls point
   first, pull it out; it is old and plain but honest; listen for more of his glass. It opens
   nothing, and it is there until it is heard (`run.told`).
3. **The sword** (`CAMP_RELIC`): it stands in the ground in the middle of the camp. Pulled out it is
   the hero's (the **Glassmaker's Old Sword**, in hand if nothing is) and the camp's gate out to the
   road opens. It says nothing: it is no glass.

Nobody has to stand about and listen. A recording counts as heard whole the moment it begins (the
Memories have all of it), the next recording cuts it short, and leaving its place does too (the
glass's when the hero leaves the town, the camp's when it leaves the camp): see
[narration.md](narration.md#in-the-game). So breaking the camp's glass ends the town's words if
they still go on, and walking out of the camp ends the camp's. This goes for his recordings to come
too: each says what matters most first.

The recording knows nothing of who hears it, nor where it came to rest: it only says what is true
wherever that is. Playing together, a gate one player opens opens for everyone, and a recording one
of them sets off plays for everyone at once, its glass gone for everyone (`story` messages,
[online.md](online.md)). The sword stays for a hero without any weapon, so a friend who joins
empty-handed is never without one. A world saved before the beginning, somebody already past the
camp, has both gates open; so have the dev tools (`?dev=1`; `&intro=1` plays it). The camp's glass
is there in them too, until it is heard.

## The ending

You beat the creature at the core. There you find the glassmaker's **last recording**, but not
him, and the **glass bird**. The bird **breaks**: the breaking glass bird is already the theme of
the music (`music/README.md`) and of the splash screen (`src/game/splash.js`).

Whether the world can ever be brought together again stays open. Maybe it never can. It must
not be clear, but it should be **hopeful**.

## What the game's rules mean

| The game | The story |
|---|---|
| Each world is different (the seed) | Another part of the broken world, and another person in it |
| A cube you never visited cannot be seen | A part of the world you have not reached (or never can) |
| Nothing kept from one world to the next | Every game is someone else, somewhere else |
| The bosses, the guardians sealing the way down | Bosses that want to stop you |
| The last boss at the core | The creature that kidnapped the glassmaker |
| The splash screen, the bird breaking | The ending |

Still open: what the town is (each part of the world's own town?), what dying and getting up again
means, and what the glass faces opening between two visited cubes are.

## Ideas, not decided

From the discussion; none of these is settled.

- **The opening should not give too much away**: the stone, the glassmakers' glass round the
  pieces of the world, the winged ark, the wings breaking, the pieces scattering. The creature and the kidnapping are left for the
  recordings to tell.
- **Why the robot cannot remember it all** (that it cannot is decided: "The robot"): its memory
  was damaged, or the star-readers locked parts of it, which open further down. It tells the
  official story; the recordings tell how it really was.
- **The recordings in order**: wherever they lie, the first one found is always the start of the
  story; or each is numbered, and the robot says which are missing (each game shows different
  pieces).
- **Cracks more often further down**, the closer you get to the core.
- **The thing the glassmaker had to build** for the creature's escape was the glass bird. (He
  can make wings: he helped make the ark's.)
- **The bird breaks, and its pieces fly off** in every direction, each a small light towards
  another cube. Whether they arrive or do anything is never told. Every new game could be another
  part of the world a piece flew to, never said.
- **The splash screen shows the ending** before the player understands it.
- **Unreachable cubes in sight**: other cubes far off, with lights, smoke or windows, where people
  live whom you will never meet.
- **The meteors** in the game (the marsh at night, Slomo's) as what is left of the comet shower.

## Still open

- What the creature makes for the pieces.
- The ark's name, and the star-readers' (a word of their own?).
- What happens to the creature when it is beaten.
- Whether the thing it had the glassmaker build was ever finished, and what it is.
- What happens to the bird's pieces.
- Whether the recordings come in a fixed order or are numbered and collected.
- The glassmaker's name; the robot's name and character ("The robot"). Their voices are settled
  ([narration.md](narration.md)): the glassmaker's is `glassmaker`, the robot's `robot` (the
  `child` clone through the `stepped-vocoder` filter, "Made voices").
- How the three acts of light ([depths.md](depths.md)) fit the story: they were the old story's
  childhood, growing up and the sealed memories, and the themes and depths still go by them.
- The music's arc (`music/README.md`, [music.md](music.md)): the bird whole in act I, broken at the
  bottom of act II, in pieces in act III and mended at the core. It followed the old story; the
  bird now breaks at the core.
- What the game needs to tell it (the opening animation, the robot as a companion that follows
  you, the recordings as things to find, the ending at the core), and which of what was built for
  the old story stays: the hero's gender (`core/save.js`, still needed for German words), the
  narrator's queue and subtitles, the lines kept with the world, the world's owner and guests.
- The words for both languages (the glassmaker, the star-readers, star-glass, the ark, the robot,
  the creature, the comet shower, a part of the world), decided before the first line is written
  ([i18n.md](i18n.md)).

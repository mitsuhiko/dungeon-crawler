# Story: the broken world

Status: a sketch, being worked out; of it a first try at the opening ([film.md](film.md)), the
beginning in the town and the robot coming and following (below) are built. This page replaces the
earlier story (an old Glassmaker woman whose memories were the cubes). The narrator's lines of that
story are gone: what it says now (`src/core/narration.js`, `src/game/narrator.js`,
[narration.md](narration.md)) are the glassmaker's recordings of the beginning and the robot's
hello. Complements [world.md](world.md),
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
- **The robot**: a clockwork robot of star-glass, built by the star-readers. It comes flying up
  the first time you are out of the town. From then on it goes with you, lights the way, and will
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
- **How it comes** (built: `src/core/robot.js`, `src/game/robot.js`, `src/render/robot.js`): the
  first time the hero is out of the town (past the merchant camp's gate, the first piece of the
  world that is neither the town, a house in it nor the camp), it comes flying up from further in,
  high over the trees, and once it is close it cheers and says hello (`robot`,
  `core/narration.js`, in its voice): it heard the glass break and flew as fast as its wings would
  go; the star-readers made it, of glass and clockwork; it had a name once but cannot find it any
  more; it will come along and light the way, further down it gets dark. (A first try at its
  character: cheerful and eager, a little forgetful. Its name stays open: it cannot find it.) The
  world keeps that it came (its hello, told: `run.told`), so from then on it is with the hero as
  they come into the world, in the town too. A world played before the robot existed has it come
  the next time the hero is out of the town; the dev tools (`?dev=1`) skip its coming with the
  beginning (`&intro=1`: it comes).
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
  (it has no body) and cannot be clicked.
- **Its light**: its amber core lights what is round it (a moving light, about four cells).
- **It brings you back** when you die, to the last safe place (not built yet).
- **Its memory**: it knows something about the glassmaker, but cannot get at all of what it
  remembers at once.
- **Playing together**: every player has a robot of their own. One of them, the host's, is the
  one that tells the story. For now each player sees only their own ([online.md](online.md)).

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
  happened to him and to the world. The first three are the beginning's (below). Once begun, a
  recording is kept: the inventory's **Memories** tab plays it again.
- **The ending** (below) is the same in every world.

## The beginning

Built (`src/core/intro.js`, `src/game/intro.js`). After the opening the town comes up slowly out of
the black, at noon (a world's clock starts there: `core/daycycle.js` `START_CLOCK`). The hero comes
empty-handed. Two things lie in the town's two parts, each behind a gate that will not open until it
is found (gates of his glass, like a guardian's: `world/layout.js`, kept with the world). Three short
recordings go with them (`RECORDINGS`, `core/narration.js`):

1. **The glass** (`TOWN_RELIC`, `world/town.js`): a bubble of star-glass the size of a head,
   floating over the plaza a few steps from where the hero stands, faceted teal glass with an
   amber core (`src/render/glassbubble.js`). Walking into it breaks it, the town's gate opens, and
   his voice comes out (`'glass'`): his glass found someone; it keeps his words, to hear again (the
   Memories tab opens); the town is one piece of the world, and where the pieces meet there are
   gates of his glass; they open for whoever carries it, so go on, out through the gate.
2. **The camp** (`'camp'`), coming into the merchant camp with the glass found: his old sword rose
   with the glass, tied to it, and if the knot came loose it did not fall far; a sword falls point
   first, pull it out.
3. **The sword** (`CAMP_RELIC`): it stands in the ground in the middle of the camp. Pulled out it is
   the hero's (the **Glassmaker's Old Sword**, in hand if nothing is), the camp's gate out to the
   road opens, and he says a last word (`'sword'`): it is old and plain but honest; the next gate
   opens for it, and past it the world gets wild; listen for more of his glass.

Nobody has to stand about and listen. A recording counts as heard whole the moment it begins (the
Memories have all of it), the next recording cuts it short, and leaving its place does too (the
glass's when the hero leaves the town, the camp's when it leaves the camp): see
[narration.md](narration.md#in-the-game). So walking straight out of the town ends the glass's
words and starts the camp's; pulling the sword out ends the camp's and starts the sword's. This goes
for his recordings to come too: each says what matters most first.

The recording knows nothing of who hears it: it only says what is true wherever the glass came to
rest. Playing together, a gate one player opens opens for everyone, and a recording one of them sets
off plays for everyone at once (`story` messages, [online.md](online.md)). The sword stays for a hero
without any weapon, so a friend who joins empty-handed is never without one. A world saved before
the beginning, somebody already past the camp, has both gates open; so have the dev tools (`?dev=1`;
`&intro=1` plays it).

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

# Story: the broken world

Status: a sketch, being worked out; of it only a first try at the opening is built
([film.md](film.md)). This page replaces the earlier
story (an old Glassmaker woman whose memories were the cubes). The narrator built so far
(`src/core/narration.js`, `src/game/narrator.js`, [narration.md](narration.md)) and its lines still
tell that earlier story: they are to be rewritten for this one. Complements [world.md](world.md),
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
- **The robot**: a clockwork robot, built by the star-readers. It lies in a mud puddle in the first room after the
  town, where you find it. From then on it goes with you, helps you and tells the story as you
  play.
- **The creature**: the last boss, waiting at the core. Clever, speaks the people's language, and
  wanted to escape. It was brought on board as something to be used, which makes it a prisoner too.
- **The hero**: a different person every game, from whichever part of the world the game is in.
- **The other bosses**: just bosses that want to stop you. They have no story of their own, so
  the ones we have stay as they are.

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
  happened to him and to the world.
- **The ending** (below) is the same in every world.

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
- **The robot knows less than it should**: its memory was damaged, or the star-readers locked parts
  of it, which open further down. It tells the official story; the recordings tell how it really
  was.
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
- **Dying**: the robot brings you back to the last safe place.

## Still open

- What the creature makes for the pieces.
- The ark's name, and the star-readers' (a word of their own?).
- What happens to the creature when it is beaten.
- Whether the thing it had the glassmaker build was ever finished, and what it is.
- What happens to the bird's pieces.
- Whether the recordings come in a fixed order or are numbered and collected.
- The glassmaker's name and voice; the robot's look, character and voice (two voices now, where
  there was one).
- Playing together: a robot for each player, or one for the group.
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

# Story: the broken world

Status: a sketch, being worked out; nothing of it is built yet. This page replaces the earlier
story (an old Glassmaker woman whose memories were the cubes). The narrator built so far
(`src/core/narration.js`, `src/game/narrator.js`, [narration.md](narration.md)) and its lines still
tell that earlier story: they are to be rewritten for this one. Complements [world.md](world.md),
[bosses.md](bosses.md), [quests.md](quests.md), [saves.md](saves.md), [online.md](online.md) and
[i18n.md](i18n.md).

Tone: still cheerful, with a sad edge, and hopeful at the end. Short lines while you play, one or
two sentences at a time.

## What happened before

- **The asteroid.** Scientists found out that an asteroid was going to hit the Earth.
- **The glassmakers.** To save people, the scientists gave the glassmakers (craftsmen, not
  scientists) the job of packing parts of the world into cubes of glass.
- **The rocket.** The cubes were sent into space on a rocket. One of the glassmakers flew along.
- **The creature.** The scientists also brought a creature on board, because it makes something
  important for keeping the cubes supplied (what exactly is still open).
- **The kidnapping.** The creature is very clever and learned the people's language. It kidnapped
  the glassmaker and made him build something it could escape with.
- **The recordings.** While he was held, the glassmaker recorded messages and threw them away,
  wherever he could.
- **The comet shower.** A small comet shower hit the cubes, and the world broke apart into many
  cubes. (The creature's escape did not break it.)
- **Forgotten.** Nobody remembers any more what happened.

## The world

- The world is broken into many cubes. Some still hang together; most cannot be reached at all.
  Many people live in parts of the world the game never takes you to.
- **You only ever play in one part of the world.** Every game you are a different person in a
  different part, which is why the world is different every time you play.
- **Nothing carries over** from one game to the next.
- Here and there the glass has **cracks** that still hold.

## The people

- **The glassmaker**: a man, a craftsman, who flew along with the cubes and was kidnapped. He is
  never seen; you only hear his recordings. His name is still open.
- **The robot**: built by the scientists. It lies in a mud puddle in the first room after the
  town, where you find it. From then on it goes with you, helps you and tells the story as you
  play.
- **The creature**: the last boss, waiting at the core. Clever, speaks the people's language, and
  wanted to escape. It was brought on board as something to be used, which makes it a prisoner too.
- **The hero**: a different person every game, from whichever part of the world the game is in.
- **The other bosses**: just bosses that want to stop you. They have no story of their own, so
  the ones we have stay as they are.

## How the story is told

- **The opening.** A new game starts with a short animation of what happened before, told by the
  glassmaker.
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

- **The opening should not give too much away**: the asteroid, the glassmakers packing the world,
  the rocket, a crash of glass, then black. The creature and the kidnapping are left for the
  recordings to tell.
- **The opening recorded on the day of the launch**, when everything still looked fine: the
  glassmaker sounds cheerful and does not know what is coming.
- **The robot knows less than it should**: its memory was damaged, or the scientists locked parts
  of it, which open further down. It tells the official story; the recordings tell how it really
  was.
- **The recordings in order**: wherever they lie, the first one found is always the start of the
  story; or each is numbered, and the robot says which are missing (each game shows different
  pieces).
- **Cracks more often further down**, the closer you get to the core.
- **The thing the glassmaker had to build** for the creature's escape was the glass bird.
- **The bird breaks, and its pieces fly off** in every direction, each a small light towards
  another cube. Whether they arrive or do anything is never told. Every new game could be another
  part of the world a piece flew to, never said.
- **The splash screen shows the ending** before the player understands it.
- **Unreachable cubes in sight**: other cubes far off, with lights, smoke or windows, where people
  live whom you will never meet.
- **The meteors** in the game (the marsh at night, Slomo's) as what is left of the comet shower.
- **Dying**: the robot brings you back to the last safe place.

## Still open

- What the creature makes for the cubes.
- What happens to the creature when it is beaten.
- Whether the thing it had the glassmaker build was ever finished, and what it is.
- When the glassmaker recorded the opening.
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
- The words for both languages (the glassmaker, the robot, the creature, the comet shower, a part
  of the world), decided before the first line is written ([i18n.md](i18n.md)).

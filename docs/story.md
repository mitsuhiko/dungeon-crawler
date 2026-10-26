# Story: the Glassmaker's memory

Status: a sketch, its beginning built. This is the story we want to tell, how it fits the game's
rules, and the list of what the game needs before all of it can go in (the end of this page).
Every line gets an id it is recorded under: the lines written so far are in
`src/core/narration.js`, voiced ahead with a text-to-speech model, and a first narrator plays them
as things happen, with subtitles ([narration.md](narration.md)). They tell the opening in the town,
the road out and the first three depths (Gusto, Totnar, Squarlo) through. Complements [world.md](world.md), [bosses.md](bosses.md),
[quests.md](quests.md), [saves.md](saves.md), [online.md](online.md) and [i18n.md](i18n.md).

Tone: cheerful, with a sad edge. Like Bastion, a voice that talks while you play, in one or two
short sentences at a time.

## The idea

The world is a memory. The Glassmaker, an old woman who made glass all her life, keeps what she
remembers the way she kept everything precious: in glass. Each place she remembers is a cube of
glass hanging in the sky or down the long shaft to the core. What she has forgotten is the
**Hidden** (das Verborgene): you cannot see into it, because nobody remembers what is there.

She is only a voice. She is never seen, has no house in the town and never stands anywhere in the
world; she is the one remembering it. And she never says what the cubes are: to her they are
places, "this place", "the glass", "my glass". They obviously are cubes, and the game's UI calls
them so; she does not.

The story has two layers, and both are always true:

- **The fairy tale** (what the kids see): the world's Heart, a great crystal at the core, cracked.
  The land broke apart, and the Glassmaker caught the pieces in glass before they fell into the
  Hidden. Her little brother (or sister) went down to mend the Heart and never came back.
- **The memory** (what grown-ups see): an old woman whose memories are slipping, holding on to
  them, and the one memory she sealed away deepest, of the person she lost and the sorry she never
  said. Her grandchild walks through her memories with her.

She tells the story to you, her grandchild. She does not quite remember your face, and you look
so much like her little brother (or sister) that she keeps mixing you up.

## The people

- **The Glassmaker**: the narrator. Grandma (Oma) to the world's grandchild, "{owner}'s
  grandmother" to everybody else. She is warm, funny, a little scatterbrained, honest when it
  counts. Her own name never matters.
- **The grandchild**: the hero who made the world (the world's **owner**, below). Named after
  the sibling, which is why the name is what she has forgotten.
- **The sibling**: her younger brother or sister. Always the owner's gender (the hero's gender,
  a new choice when making a hero) and the owner's name. She never says the name until the core;
  before that it is "my little brother" / "my little sister".
- **Guests**: anybody else in the world: friends playing together, or another of the heroes on
  the same computer who goes into this world. She knows they are not her grandchild and is glad
  of them: "{owner:his} friends", who came along. See "Guests" below.
- **The villagers**: the people she remembers clearly. The town is the one memory that never
  fades.

## What the game's rules mean

| The game | The story |
|---|---|
| A cube you never visited cannot be seen | Forgotten: the Hidden |
| A visited cube, not the one you are in, drawn faint (the low-detail neighbours) | A faint memory |
| A cube you got through (what it asks done, its way onward reached) stays | Memorized: it will not fade again |
| A cube you can only leave once its puzzle is solved | A memory she has to piece back together before she can go on |
| A sealed trial room (the flood, the collapse ...) | A memory that holds on to you until you have lived through it |
| A glass face opens once both cubes are visited | The glass softens between two places she knows |
| Falling through a hole into the cube below | Dropping through a gap in her memory |
| The town, always there | The one memory that never fades |
| Each world is different (the seed) | Every time she remembers it, it comes out a little different. Real memory works that way |
| A new world tells the story again | She remembers it again. The world's name is what she calls this remembering |
| Dying and getting up again | "No... that's not how it went." She goes back to the last place she is sure of |
| The hero's skin, painted by the player | She does not remember your face |
| Guardians sealing the way down | Bad memories she put in the way, so she would not have to go down there |

The narrator can notice that worlds differ: "There was a bridge here. Or was that the other time?"
Lines like that only come for a hero who has already finished a world, so playing again is part of
the story.

## The glass bird

One small thing runs through the whole story: a **glass bird**, the first thing she ever made,
as a child, for her little brother (sister). It shows up in memories along the way, and at the end.
It can be a quest thing, a memory shard or a reward; it is small, translatable and easy to draw.

## The outline

The story follows the depths' three bands of light ([depths.md](depths.md)): how clear a memory is.
It is tied to depths and to the bosses' slots, never to one layout, so it works in every world.

**The opening (the town).** Her voice, as you step into the town: "There you are! ...No. I'm
sorry. For a moment you looked just like him (her)." She explains the glass, the Hidden, and that the
well has started to hum: the Heart is beating again, faintly. Something down there wants to be
remembered.

**Act I: childhood (depths 0 to 6, under the sky).** Bright, funny, a little wistful. Summers,
the meadows, the clouds, the canyon. She and the little one, inseparable; she held the little one's
hand in the dark. She made the glass bird. The bosses are their shared childhood nightmares. Only
hints of loss: she says "we" and stops; a cube stays hazy longer than it should.

**Act II: growing up (depths 7 to 13, the sunlit hollows: caves, and open places under a hazy
sky).** Warm. The workshop (the forge's works yard), adventures
together, the people she knew; this is the happiest stretch. Then it goes wrong: a fight about
something small (the glass bird, broken by accident), and words she never took back. They grew
apart. More things go missing in her telling here: she mixes up names, stops in the middle of a
sentence.

**Act III: the sealed memories (depths 14 to 19, the deep).** Quiet and honest. The days around
the crack. The Heart cracked; the land broke; she caught what she could in glass. Her little
brother (sister) went down to mend the Heart, still without having heard her say sorry. The marks
the little one left on the way down (chalk signs, glass beads at landmarks), and what they mean.

**The core (depth 20).** The last bad memory: the day itself, the crack (the last boss, not
designed yet). Beyond it, the Heart, mended. That is why the glass held and why there is anything
left to remember: the little one did it. Beside it lies the glass bird, glued back together. It
was the sorry, the other way round, and it has been waiting there all this time. She was forgiven
long ago.

Then she remembers the name. It is yours: "Lena. Her name was Lena. That's why they gave it to
you. I asked them to."

**The ending (the one ending).** The glass goes clear. Every memorized cube lights up at once in
the overview, the whole world she remembered. She thanks you for walking it with her, and asks:
"Will you remember it with me again?" The world stays playable afterwards; a new world tells the
story again, and the hero remembers it was there before (the lines for heroes who have finished
a world).

## The bosses: bad memories and dreams

Every boss is one bad memory or bad dream given a body. Beating it does not kill it: the memory
loses its grip and becomes just a memory. Each boss gets a line before the fight and a line after
it that names the memory underneath; the story's spine does not depend on any one boss, so bosses
can be added, moved or changed (moving one means `BOSSES` in `core/bosses.js` and retuning its
fight for that depth).

**Childhood dreams look like children's drawings; grown-up bad memories do not.** She drew her
nightmares as a little girl, to make them less scary. That is why the first bosses look the way
they do, and why their words can be sad while they look funny.

- **Act I (0 to 6), childhood dreams**: the six bosses of the first act, where they are, read as:
  - **Gusto**: the grin in the dark under the bed, the first fear. "I was so sure he was real.
    I suppose he was."
  - **Totnar**: a dry summer, a fire, a burning heart inside dead sticks: anger that kept
    smouldering.
  - **Squarlo**: small, then huge: a little worry that grew. "It was such a little thing. Then it
    wasn't."
  - **Flip**: rings turning in a box: the thought that goes round and round.
  - **Foggery**: fog and thrown eyes: what she did not want to see.
  - **Renew**: someone like you who turns time back: the first time she wished she could undo
    something. The step from child to grown-up, where the sky ends.
- **Act II (7 to 13), growing up**: half finished, glassy, familiar things out of shape. A quarrel,
  a broken promise, a door that would not open. The first of them stands at the bottom of the act:
  - **Slomo** (13): a see-through slime that throws bits of itself at you, floods everything and,
    burst, is only a slug underneath: a mess that kept spreading until it was looked at.
    "It got into everything. It was smaller than it looked." The rest are still to make.
- **Act III (14 to 19), sealed memories**: the days around the crack.
- **The core (20)**: the crack itself, the memory of that day. Never the sibling.

## How the story is told

The world is different every time, so the story is not a script but lines the narrator picks as
things happen. Four layers, from fixed to loose:

1. **The spine** (about 30 to 40 lines): what everyone sees in every world: the opening, the first
   cube of each act, each boss, the core, the ending. Tied to depths and boss slots.
2. **Reactions** (about 120 lines): to what happens, a few lines for each, none twice in a world:
   entering a place, memorizing one, a glass face opening, a fall, a new theme, a puzzle or a trial
   starting and solved, low health, a death, back in town, a horde waking, a friend joining or leaving, standing still for a while.
3. **The themes** (4 to 6 lines each): each theme is a part of her life: the meadows are picnics,
   the salt flats a trip with her father, the forge her first job. Every theme belongs to one act
   (`act` in `src/themes/`), and a world shows half of each act's themes, picked from its seed,
   in the act's story order ([world.md](world.md#themes-per-world-themesindexjs-themescavesjs-themesdepthjs)),
   so each world tells a slightly different life, and every theme is as likely as any other
   (but the slime marsh, at the bottom of act II, in most worlds).
4. **Memory shards** at landmarks: short scenes (three lines or so) from a pool for each act, so
   different worlds show different ones. The spine is whole in every world; the shards are what
   playing again adds.

The villagers' quests can change with the story too (the people she remembers best).

Rules for the lines: at most two short sentences; whole sentences only (never put together from
pieces); no English wordplay; never "cube" (she says "place" or "the glass"); a note for each line saying when it comes, how it should feel and
who she is thinking of, for the translators (and later the voice).

## Guests

The story is the world's: the sibling and the name come from the world's owner (the hero who made
it), not from whoever reads. Everyone reads the same story, each in their own language, but she
talks to each screen as who that player is:

- **The owner** is "you", her grandchild. The sibling is "your" namesake.
- **A guest** is "you", a friend who came along; the grandchild is "{owner}", in the third person.
  "You must be one of {owner:his} friends. Come in, there's room." At the core a guest hears the
  same truth about the owner: "{owner}. That was {sib:his} name. They gave it to {owner:him}."
- **More than one of you**: "you" in the plural where she talks to everyone (German "ihr").
- **The owner not there** (guests alone, the owner's hero deleted): the guest lines work anyway,
  as they speak of the owner in the third person.

So most lines that talk to the player come in two forms (owner, guest), and each says the
sibling's and the people's words with their gender.

## Words in two languages

The i18n system already has what this needs: people with a gender (`person(name, g)`, `{who:he}`,
`{who:ihn}`), women's forms of roles (`'she|hermit'`), and `select` on a gender. A line is written
once, with both forms:

```
"{sib, select, m {He} other {She}} was afraid of Gusto. I pretended I wasn't."
"{sib, select, m {Er} other {Sie}} hatte Angst vor Gusto. Ich tat so, als hätte ich keine."
```

- The sibling, the owner and the reader are people with a gender; there are two genders (no third).
- Nothing genders the player by accident: German "du" is neutral, but nouns (Enkel, Enkelin;
  Held, Heldin; Freund, Freundin) and some endings are not. Whatever says what the player is goes
  through the player's gender.
- The narrator's lines are kept and sent as ids (a line's id and its parameters, like the
  chronicle's words), never as text, so friends each read their own language, a line can be
  reworded without breaking saves, and voice can be recorded under the id later.
- New glossary words, decided before the first line is written: the Glassmaker (Glasmacherin),
  the Hidden (das Verborgene), the Heart (das Herz), memory (Erinnerung), to memorize, the glass
  bird (Glasvogel), grandchild (Enkel / Enkelin), little brother / little sister. The glossary
  notes that the narrator never says cube (Würfel); the UI keeps it.

## What the game needs

Before the story can go in. Roughly in the order to build it.

1. **The hero's gender.** Built: Choose Character asks for it with the name (two choices, Male
   picked at first), it is saved with the hero (`core/save.js`, `gender`) and can be changed with
   the name (Edit). Heroes saved before are male. Still to do: it goes to friends with the hero's
   name (`net/protocol.js`, a new `PROTOCOL`), so the chronicle and the story can say a friend's
   words right. It changes only words, not the figure.
2. **The world's owner.** A new world remembers the hero who made it: its id, and a copy of its
   name and gender (for when the hero is renamed: the name follows the hero; for when it is
   deleted, and for guests: the copy). Worlds saved before take the hero whose world they are, else
   the first hero that goes in. The host sends the owner to guests with the world. Everyone else
   in it is a guest.
3. **The story's state**, saved with the world: the spine beats told, the lines told (ids, so none
   comes twice), the shards found, whether the ending was seen. On the hero: how many worlds it
   has finished (the lines for heroes who have been here before). Playing together, the host's
   world keeps it.
4. **The narrator.** Built for one player (`src/game/narrator.js`, [narration.md](narration.md)): the
   table of lines with their moments and conditions (depth, act, theme, boss, a boss's attack,
   a species), the lines said once a world (kept with it), a queue with priorities, a pause
   between lines and lines left out once too late; chatter only in quiet moments, a boss's fight
   commented as it goes. Still to do: owner or guest, alone or together, and the same line on
   every screen. Spine beats and what
   happens to the world (a first time at a depth, a boss beaten, a cube memorized) come from the
   host to everybody; what happens to one player (a fall, a death) is told on that player's screen.
5. **Showing it.** Built: a subtitle line in its own style, one at a time, as long as its voice
   (or reading it) takes; each line also goes into the chronicle (kind `narration`). Still to do:
   a **Memories** tab in the inventory to read the spine lines and the shards again.
6. **The moments to react to.** Most exist as chronicle kinds or game events already (a depth's
   first time, a boss beaten, a death, a horde, a friend joining); new ones: a cube entered, a cube
   memorized, a glass face opened, a fall, a theme's first cube, a puzzle or trial starting and
   being solved (the trials' own events, `game/trials.js`), low health, back in town, standing
   still, a boss's fight starting.
7. **Memorizing, visible.** Today any visited cube is drawn the same way. The story wants two
   kinds: visited (faint, hazy) and memorized (drawn clear, with a small chime and a line). A cube
   is memorized once you got through it: what it asks is done and its way onward reached. Most
   cubes ask nothing but the way: reaching a portal onward is enough. A trial room asks its trial:
   a sealed event resolved, a puzzle solved (its gate open, [trials.md](trials.md)); a guardian's
   cube asks the guardian beaten. It must keep the rule that only visited cubes ever show.
8. **Memory shards.** Something at landmarks to find and read (a glint of glass), from a pool for
   each act, kept with the world and shown in the Memories tab.
9. **The glass bird**: the model is `blender/glassbird.py` (whole, and cut into the pieces it
   breaks into; glued back with gold, the same cuts could make the mended one). The splash screen
   before the main menu breaks it (`src/game/splash.js`). Still open: where it shows up, memories
   along the way, beside the Heart at the end.
10. **The opening and the ending.** A start in town for a new world (her first lines, before the
    player runs off; only her voice, nothing to see). At the core: the last boss (to design), the Heart, the bird, the name, the
    glass going clear and every memorized cube lit up in the overview, then the world going on.
11. **The bosses' lines**: before and after each fight, for the six we have; briefs for the
    bosses of acts II and III and the core, for the kids to draw.
12. **Translation support.** The story's catalog (`src/i18n/de/story.js`, the table in
    `src/i18n/sources.js`), the new glossary words, the notes shown by `tools/i18n.mjs --todo`,
    and checks (in `npm run i18n` and the tests) that every line saying the sibling or a person has
    both genders' forms, and that every line talking to the player has its owner and guest forms.

## Still open

- Whether defeating a cube's enemies counts for memorizing too, or only the way through (item 7).
- The last boss at the core, and the bosses of acts II and III.

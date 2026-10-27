# Enemy kinds

A **species** is a model with its animations and its base tuning (`SPIDER`, `SNAKE`, ... in
`src/core/enemies.js`). A **kind** is a species with its own name, colours and strength,
drawn with the species' model. The base profile of a species is its first kind. The kinds
are in `ENEMY_KINDS`. Each depth's roster says which kinds of a species spawn there and how
often (`src/core/spawns.js`, see `docs/depths.md`).

Kinds need no new models. They recolour the species' materials at load time in OKLCH, with
colours from one palette (see [The palette](#the-palette)). Every species comes in at least
three ordinary kinds, its base kind included (a boss's minions do not count).

## Defining a kind

```js
export const BLOOD_VIPER = enemyKind(SNAKE, {
  type: 'bloodviper', label: 'Blood viper', reason: 'Bitten by a Blood viper!',
  colors: paints({ skin: 'crimson.mid', eyes: 'eyes.sun' }), ichor: ['#e0503a', '#6a1410'],
  mods: { hp: 1.4, damage: 1.4, speed: 1.2, size: 1.1 },
});
```

Then add it to `ENEMY_KINDS` and to the rosters that should spawn it. `/tools/palette.html`
shows how often each kind turns up and how it stands out from its siblings and the ground.

- `mods` multiply the base:
  - `hp` and `damage` scale the base values and their growth per level.
  - `speed` scales chase, wander and homing speed. The animation follows, because the clips
    are sampled from the distance covered.
  - `size` scales the model, the body (radius, height, `bodyHeight`), the melee reach, the
    attacks' `hitReach` and the projectile muzzle. Placement makes room for the biggest kind
    a roster entry can draw, and bigger bodies take longer strides.
  - `xp` scales XP and coins. It defaults to `√(hp × damage)`.
- Any other key replaces the base value outright: `label`, `reason`, `ichor`, `cooldown`,
  `aggro`, and so on.
- `hide` lists materials the kind does not show: the body's parts drawn with them are left
  out of its mesh (`dressEnemy` in `src/render/enemymodel.js`). A model can carry parts for several kinds this
  way: the Shraps has an ice head and a fire head, and each of its kinds hides the other.
- `fx` names the glow of its own in `GLOW` (`src/render/enemies.js`), in place of the
  species' (the Fire shraps' flames; the plain Shraps has none).
- `attacks` replaces the species' attack list before it is sized, e.g. to throw something
  else: the Fire shraps throws fireballs where the Shraps throws ice balls.
- `light` (a colour string) replaces the glow light of a species that has one (`GLOW` in
  `src/render/enemies.js`) and the light of its projectile. `sparks` (a list of colours)
  replaces its embers and its projectile trail.
- `beamColor` colours a Spicy's laser or a Wolk's bolt; `gloom` replaces the colour a Wolk's
  cloud darkens to; `trail` the colour of a Wolla's wet trail.
- A kind keeps its species' `seedSalt`, and an enemy's id uses the species. So where an enemy
  stands, its level and its id do not depend on the kind it drew. Behaviour is still the
  species'. A kind that needs to behave differently would override the attack fields, or
  get new ones that `game/enemyai.js` reads.

## The palette

`colors` names swatches of `src/core/palette.js` (`paints` turns them into colour strings,
`paint` a single one). A swatch is a hue family and a tone:

- **Families**: crimson 25, ember 45, ochre 80, moss 130, jade 165, frost 230, azure 260 and
  violet 305, and two near-greys: `ink` (cool) and `stone` (warm). Pink 350 and amber 65
  (`GUARDIAN_HUES`) belong to the guardians; no other kind takes a hue near them.
- **Tones**: `pale` (L 0.88), `light` (0.76), `mid` (0.62), `deep` (0.46), `dark` (0.32), `glow`
  (0.72, for what shines) and `vivid` (0.72, as strong as the hue goes: the guardians'). Each
  tone aims for a chroma, capped at 85% of the most sRGB shows at its lightness and hue
  (`vivid`: all of it), so every family's `mid` looks about as strong: sRGB holds far more red
  or violet than teal or ochre.
- A swatch may turn its hue a little, `@±deg` (at most 12°): the frost kinds of different
  species are all frost, but not the very same blue (`frost.pale`, `frost.pale@-8`,
  `frost.pale@+10`).
- **Eyes** come in four colours: `eyes.sun`, `eyes.ember`, `eyes.ice` and `eyes.bone`.

A kind's colours are its own wherever it spawns. The rosters put it where it fits: frost
kinds in the snow and ice, bog kinds in the swamp, sand and dust in the badlands and canyons, and
the fire species burn hotter the deeper they live (orange, then yellow, then blue). It may
come close to the ground's colour, like the Frost spider in the frozen caves; its legs, eyes
and shading still set it apart. The kinds of a species stay clearly apart from each other
(OKLab ΔE ≥ 0.08 between their bodies, `tests/palette.test.js`), and they take turns down the
depths so that each turns up about as often as the others.

## Recolouring

Every enemy GLB has plain, named materials: no textures and no vertex colours. Each species
lists its recolourable materials by role in `parts`:

```js
parts: { skin: ['SnakeBody', 'SnakeRibs'], eyes: ['SnakeEyes_glow'] }
```

The Flimmers have no model of their own: they are the hero's figure (`assets/character.glb`),
whose one material, `Clay`, is their `skin`; `render/flimmerview.js` paints it in the kind's colour
(and their blur in shades of it).

The first material of a role is its **anchor**. Teeth, fangs, pupils and mouths are left out,
so they never change. The Stunder's green mouth is the exception: it moves with the skin.

`colors` maps a role, or a single material name, to an op (the palette's swatches are colours) (`recolorFn` in
`src/core/oklch.js`):

- **A colour** (`'oklch(L C H)'` or `'#rrggbb'`): the anchor becomes exactly that colour. The
  role's other materials move with it. Their lightness and chroma scale by the same ratio
  as the anchor's, and their hue turns as far. So the snake's darker ribs stay darker by
  the same amount. If the anchor is close to grey (the black spider), it has no hue to turn
  from. Then the hue is set outright, and chroma shifts rather than scales.
- **An object**: `{ l, c, h }` sets components, then `{ ls, cs }` scales them, then
  `{ dl, dc, dh }` shifts them. For example, `{ dh: 40 }` turns the hue, and
  `{ cs: 0.5, dl: -0.1 }` gives a duller, darker colour.

Roles are applied first, then single materials, so a material entry wins over its role.
Emissive colours move the same way as base colours. Colours that leave the sRGB gamut keep
their lightness and hue and give up chroma until they fit.

At runtime `src/render/recolor.js` works out each kind's colours once, from the prefab's
materials. They are then copied into the material clones that each enemy (and each
projectile) owns, before the hit flash and the hover tint remember the base colour. So
recolouring costs nothing per frame. Every kind of a species shares one shader program.

## Previewing

Two dev test rooms (`?dev=1`, then `/testroom enemies` or `/testroom guardians`, see
[console.md](console.md)) line up every kind in the game itself, recoloured and lit as
everywhere else and dressed as the depth you came from (or `/testroom enemies 17` for
another). `enemies` has a row per species: the base kind, its kinds and the bosses' minions of
it (a species of one or two kinds shares the next one's row: the room is only so deep). `guardians` has the side guardians, in two rows. The shortest stand in front, all facing
you. The descent guardians (the Temp Bosses) wait for bosses of their own; each boss has a test
room of his own, in his arena (`/testroom boss gusto`, [bosses.md](bosses.md#dev)).

They stand idle (`dormant`, game/devspawn.js `spawnLineup`) at the level the depth gives them,
until one is hit: that one wakes and fights, the others stay. `/passive on` keeps the woken
ones still too. A death, or coming back in, sets them all up
again. The lineup is planned with the room (`cubegen/testrooms.js` `lineUp`), so a new kind in
`ENEMY_KINDS` shows up there by itself.

## The kinds

| Kind | Species | Colour | HP | Damage | Speed | Size | XP | Depths |
|---|---|---|---|---|---|---|---|---|
| Spider | (base) | `ink.dark` | | | | | | 2–8, 15 |
| Frost spider | Spider | `frost.pale` | ×1.35 | ×1.1 | ×0.9 | 1 | ×1.2 | 3, 9–10, 16 |
| Bog spider | Spider | `moss.deep` | ×1.15 | ×1.25 | ×1.05 | 1 | ×1.2 | 7–8, 11–14 |
| Gloom spider | Spider | `violet.deep` | ×0.95 | ×0.95 | ×1.1 | 1 | ×0.95 | 1–6 (Dark forest) |
| Redback | Spider | `crimson.deep` | ×1.3 | ×1.4 | ×1.2 | ×1.1 | ×1.35 | 4–6, 8, 13–18, 20 |
| Stunder | (base) | `moss.mid` | | | | | | 1–2, 4–8, 11 |
| Frost stunder | Stunder | `frost.pale@-8` | ×1.25 | 1 | ×0.9 | 1 | ×1.11 | 3, 9–10 |
| Stone stunder | Stunder | `stone.mid` | ×1.6 | ×1.15 | ×0.85 | ×1.12 | ×1.36 | 4–6, 8, 14–16 |
| Magma stunder | Stunder | `crimson.dark` | ×1.35 | ×1.4 | ×1.15 | 1 | ×1.38 | 18–20 |
| Grass snake | (base) | `moss.light` | | | | | | 0–2, 7 |
| Sand viper | Grass snake | `ochre.light` | ×1.25 | ×1.2 | ×1.1 | 1 | ×1.23 | 2, 4–6 |
| Blood viper | Grass snake | `crimson.mid` | ×1.4 | ×1.4 | ×1.2 | ×1.1 | ×1.4 | 6–8, 12–13 |
| Frost adder | Grass snake | `frost.pale@+10` | ×1.35 | ×1.1 | ×0.95 | 1 | ×1.23 | 3, 9–10 |
| Venom adder | Grass snake | `violet.mid` | ×1.2 | ×1.35 | ×1.1 | 1 | ×1.27 | 11–14 |
| Shadow mamba | Grass snake | `ink.dark` | ×1.6 | ×1.6 | ×1.3 | ×1.15 | ×1.6 | 14–15, 17–18 |
| Octonaut | (base) | `azure.light` | | | | | | 6–12, 14, 16 |
| Bog octonaut | Octonaut | `moss.light@+8` | ×1.2 | ×1.15 | 1 | 1 | ×1.18 | 11–13, 17 |
| Coral octonaut | Octonaut | `crimson.light@+8` | ×1.3 | ×1.35 | ×1.2 | 1 | ×1.33 | 10, 13–17 |
| Fire-face | (base) | `ember.glow` | | | | | | 18–19 |
| Blaze-face | Fire-face | `ochre.glow` | ×1.25 | ×1.2 | 1 | 1 | ×1.22 | 11–12, 19 |
| Lantern-face | Fire-face | `jade.glow` | ×0.45 | ×0.5 | ×0.85 | ×0.85 | ×0.47 | 1–6 (Dark forest) |
| Wisp-face | Fire-face | `azure.glow` | ×1.5 | ×1.45 | ×1.1 | 1 | ×1.48 | 20 |
| Triangle | (base) | `violet.glow` | | | | | | 3, 10, 15–17, 20 |
| Emerald triangle | Triangle | `jade.glow` | ×1.25 | ×1.1 | 1 | 1 | ×1.17 | 13, 16–17 |
| Crimson triangle | Triangle | `crimson.glow` | ×1.35 | ×1.35 | 1 | 1 | ×1.35 | 17, 19–20 |
| Fire-cat | (base) | `crimson.deep, ember flame` | | | | | | 17–19 |
| Ash cat | Fire-cat | `stone.mid, crimson flame` | ×1.2 | ×1.15 | 1 | 1 | ×1.18 | 16–18 |
| Void cat | Fire-cat | `ink.dark, azure flame` | ×1.5 | ×1.45 | ×1.1 | 1 | ×1.47 | 19–20 |
| Shraps | (base) | `frost.light@+6, ice head` | | | | | | 3, 9–10 |
| Fire shraps | Shraps | `crimson.mid, fire head` | ×1.45 | ×1.4 | ×1.1 | 1 | ×1.43 | 18–19 |
| Amethyst shraps | Shraps | `violet.deep, violet.light head` | ×1.3 | ×1.25 | 1 | 1 | ×1.27 | 16–17 |
| Spicy | (base) | `moss.light` | | | | | | 11–13 |
| Habanero | Spicy | `ember.mid` | ×1.25 | ×1.3 | 1 | 1 | ×1.28 | 11–13 |
| Nightshade | Spicy | `violet.deep` | ×1.4 | ×1.35 | 1 | 1 | ×1.38 | 14–15 |
| Wolla | (base) | `azure.mid` | | | | | | 5–8 |
| Bog wolla | Wolla | `moss.mid` | ×1.2 | ×1.15 | 1 | 1 | ×1.17 | 11–13 |
| Storm wolla | Wolla | `violet.mid` | ×1.3 | ×1.3 | ×1.1 | ×1.08 | ×1.3 | 13–14, 16–17 |
| Ember wolla | Wolla | `ember.mid` | ×1.45 | ×1.4 | ×1.1 | ×1.12 | ×1.42 | 18–20 |
| Wolk | (base) | `frost.pale` | | | | | | 1–3 |
| Dust wolk | Wolk | `ochre.pale` | ×1.2 | ×1.15 | 1 | 1 | ×1.17 | 4–6 |
| Storm wolk | Wolk | `ink.mid` | ×1.3 | ×1.3 | ×1.1 | 1 | ×1.3 | 3, 5–6 |
| Squirtle | (base) | `azure.mid` | | | | | | 1–13 (water) |
| Coral squirtle | Squirtle | `crimson.mid@+10` | ×1.5 | ×1.4 | ×1.1 | 1 | ×1.43 | 14–19 (lava) |
| Moss squirtle | Squirtle | `moss.mid` | ×1.2 | ×1.15 | 1 | 1 | ×1.17 | 7–13 (acid) |
| Mecked | (base) | `ochre.mid` | | | | | | 6–8 |
| Frost mecked | Mecked | `frost.light` | ×1.3 | ×1.1 | ×0.9 | 1 | ×1.2 | 9–10 |
| Bog mecked | Mecked | `moss.deep` | ×1.25 | ×1.25 | ×1.05 | 1 | ×1.25 | 11–13 |
| Bone mecked | Mecked | `stone.pale` | ×1.5 | ×1.45 | ×1.15 | ×1.1 | ×1.47 | 14–15 |
| Tornado | (base) | `violet.light` | | | | | | 2–5 |
| Dust tornado | Tornado | `ochre.light` | ×1.2 | ×1.15 | 1 | 1 | ×1.17 | 4–6 |
| Frost tornado | Tornado | `frost.pale@-4` | ×1.3 | ×1.1 | ×0.9 | 1 | ×1.2 | 3, 9–10 |
| Fire tornado | Tornado | `ember.mid` | ×1.5 | ×1.45 | ×1.1 | ×1.08 | ×1.47 | 18–19 |
| Slug | (base) | `moss.deep` | | | | | | 7–9 (Slime marsh) |
| Spotted slug | Slug | `ochre.mid`, `ink.dark` stripes | ×1.2 | ×1.15 | 1 | 1 | ×1.17 | 7–13 (Slime marsh) |
| Bolime | (base) | `moss.light` (see-through) | | | | | | 7–9 (Slime marsh) |
| Toxic bolime | Bolime | `ochre.light`, `crimson.deep` core | ×1.2 | ×1.15 | 1 | 1 | ×1.17 | 7–13 (Slime marsh; its digesting poisons) |
| Glow bolime | Bolime | `jade.glow`, `jade.pale` core | ×1.45 | ×1.35 | ×1.1 | ×1.08 | ×1.4 | 7–13 (Slime marsh; it glows) |
| Black slug | Slug | `ink.dark`, `moss.mid` stripes | ×1.45 | ×1.35 | ×0.85 | ×1.12 | ×1.4 | 7–13 (Slime marsh; its slime slows to 45% for 3 s) |
| Flimmer | (base) | `ink.light` | | | | | | 2, 4–5 (troops of three) |
| Frost flimmer | Flimmer | `frost.pale` | ×1.3 | ×1.1 | ×0.95 | 1 | ×1.2 | 3 |
| Haze flimmer | Flimmer | `ochre.light` | ×1.25 | ×1.2 | ×1.05 | ×1.05 | ×1.22 | 4–6 (not the Dark forest) |
| Shadow flimmer | Flimmer | `ink.dark` | ×1.15 | ×1.15 | ×1.1 | ×1.1 | ×1.15 | 4–6 (Dark forest) |

The base kinds are painted from the palette too (their `colors`); the other columns are theirs.
Depths are those whose rosters draw the kind (`src/core/spawns.js`, [depths.md](depths.md)).

Gusto's Custo triangle (half size, `frost.light@-6`, 1.9× as fast, `minion`: in no roster, only he
summons it) is a Triangle kind too, and Totnar's Twig spider (0.55×) and Bramble stunder
(0.72×), both `ochre.deep`, are a Spider and a Stunder kind; his snapping skull (`stone.pale`) is
a species of its own that only he brings (`MINION_PROFILES`); see [bosses.md](bosses.md).
The Squirtles' kinds each live in a fluid of their own (`dwells`: [bosses.md](bosses.md#squirtle)):
the blue ones in water, the Moss ones in acid, the Coral ones in lava.
Squarlo's Tide squirtle (`jade.mid`, ×0.7 health, ×0.6 damage) is a Squirtle minion, and Flip's Sky
wolla (`frost.light`, ×0.6 health and damage) a Wolla minion. Renew's spiders (×0.8 health, ×0.6 damage) and Fire-faces (×0.55) are `plain` minions too.
Mansk's Tornados (`STAGE_TORNADO`, ×0.6 health, ×0.55 damage) are `plain` minions too.
Foggery's Fire-faces and Fire-cats are
`plain` minions: they look like and are called what they are (×0.6 health and damage, the cats ×0.8
health); both are `lavaproof`: they walk on his lava.

The Crimson triangle also throws 20% more often (`cooldown` × 0.8). Grass snake, Sand viper,
Blood viper and Shadow mamba are strength tiers: green, ochre, red, then near-black. The red
one bites 40% harder and moves 20% faster than the green one. The mamba bites 60% harder and
moves 30% faster. The Frost adder (slow and tough) and the Venom adder (bites hard, poisons)
give the ice and the swamp snakes of their own.

The Fire shraps swaps the Shraps' ice head for a burning one (`hide`), throws fireballs that
burn instead of ice balls that chill (`attacks`) and glows like the fire species (`fx`). The
Amethyst shraps keeps the ice head and its ice balls (they still chill), recoloured violet,
with a light and a trail of its own.

The fire species burn hotter the deeper they live: the Fire-face's orange flame, the Blaze-face's
yellow one (the honey hive and the abyss) and the Wisp-face's blue one (the core), all but the
Lantern-face, a weak little teal flame of the dark forest high up (act I); the
Fire-cat, the grey Ash cat with red flames (the forge and the volcanic depths) and the black
Void cat with blue ones (the abyss). Each sets its flames' colour with `colors` (its fireballs
too) and its light and embers with `light` and `sparks`.

The Spicies: the green Spicy, the orange Habanero (its laser orange, `beamColor`) and the violet
Nightshade, whose laser poisons (`toxin`). The Wolks: the pale blue Wolk, the ochre Dust wolk
over the badlands and canyons, and the dark Storm wolk with violet lightning (`beamColor`),
its cloud darkening almost to black (`gloom`).

The Meckeds are strength tiers that each keep to their own caves: the ochre Mecked in the root
caves (and now and then in the deep canyon), the pale blue Frost mecked in the frozen caves, the
dark green Bog mecked in the swamp and the cenote, whose bites poison (also those while it holds
you), and the bone-white Bone mecked, the biggest and strongest, in the nests and the ossuary.
Their inner ears go with their bellies (`belly` role).

The Tornados blow where the wind is: the light purple Tornado over the meadows, the snowy peaks
and the badlands, the ochre Dust tornado over the badlands and the canyon, the pale blue Frost
tornado over the snowy peaks and through the frozen caves, and the Fire tornado in the volcanic
depths and the abyss, whose twisters and slam set you on fire (`burn` on its attacks) and which
glows and sheds embers (`fx`). Their twisters (the `wind` role, materials of the `TornadoTwister`
prop) take each kind's colours, a paler shade of its body; a fiery kind's (`sparks`) shed embers.

The Wollas are strength tiers too: blue, then green in the swamp, purple in the cenote, the nests,
the mines and the ruins, orange in the volcanic depths and the abyss. Their eyes take a contrasting
colour, and each kind leaves a trail of its own colour (`trail`).

## Guardians

Every species' guardians are kinds as well (`GUARDIAN_KINDS`, `DESCENT_GUARDIAN_KINDS`):
`pink.vivid` and `amber.vivid` with `eyes.bone` ([guardians.md](guardians.md)). A species can dress them
otherwise with `guardianLooks.side` and `.descent`, which replace those fields (`colors`,
`light`, `sparks`, `ichor`, ...). The Wolk's side guardian is a grey rain cloud (`ink.light`) that
darkens almost to black, its descent guardian a polished silver cloud (`ink.pale`): its `finish` (`{ parts,
roughness, metalness, sheen, glints }`, `render/enemies.js`) makes those materials smoother and
a little metallic, with a faint sheen of their own colour (the scene has no environment to
mirror, so fully metallic would look dark) and white glints twinkling on it.

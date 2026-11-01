# Item looks

Status: a second version: quieter top rarities, finer thin parts, quest things of their own, glow that pulses, randomness that stays put. Everything you can collect wears a small pixelated texture made from its
own data: two Long Swords of one rarity look apart, a Crap one is rusty, an OMG one glows with
runes in every colour, an enchanted one shows its element, and every affix leaves a little mark.
Potions, coins, crystals, scrolls and quest things get a surface of their kind (a coin its stamp,
a potion its bubbles, wood its grain). Nothing is stored for it: the look follows from what the
item keeps already, so it is the same on the floor, in a hand, on the body, in the bag, after a
load and on a friend's screen.

`src/core/looks.js` (pure: the look and its pixels), `src/render/looks.js` (the textures and the
shader), tests in `tests/looks.test.js`, many at once in `tests/browser/looks.html`.

## What decides a look

`lookOf(item)` (a bag slot, a pickup, a ware, or a bare item id) gives
`{ itemId, seed, rarity, enchant, marks }`:

| | from | what it does |
|---|---|---|
| seed | the base and the name it was found with (`gen.name`), hashed | which patterns, where the inlays, gems and marks sit |
| rarity | `gen.rarity` | how much was done to it (below) |
| enchant | `gen.enchant` | its element, glowing: embers (Toasty), green drips (Icky), frost crystals (Nippy), a zigzag of lightning (Zappy), sparkles (Shiny) |
| marks | the affixes' ids, in order | a 5×5 mark each (a point for Pointy, a drop for of Second Helpings, a heart for of the Big Breakfast ...: `GLYPHS`), engraved in the metal and the clay |

The name is kept when the Enchanter enchants a weapon or the Smith re-rolls an affix, so the patterns
stay and only the element or the mark changes: it is still recognisably the same weapon.
A stackable (potions, coins, crystals, quest things, sticks) and a weapon or armor without `gen`
(a bare id: the dev tools, a villager's hat) has only its id: one look for its kind.

`lookKey(item)` writes the look as a short string, `itemId:seed:rarity:enchant:mark+mark`
(`weapon_sword_long:9f3a2c11:unusual:toasty:sharp+leech`); textures and pictures are kept by it,
and it is what friends are sent. `parseLook(key)` reads it back and refuses anything that is not
one (a key that came over the network).

## Randomness that stays put

A look must not change because the code around it changed. So:

- **The functions are written out and frozen** in `core/looks.js`: FNV-1a over a string's UTF-16
  units (`lookHash`), a 32-bit mixer (two multiply-xorshift rounds) and mulberry32. Nothing
  depends on `Math.random`, the engine, or any other module's random numbers.
- **A stream per decision, by name.** Every choice draws from its own generator, seeded by the
  look's seed mixed with the hash of the choice's name: `clay.stuff`, `metal.blade`, `row`,
  `rust`, `grime`, `band`, `runes` ... (`stream`). Adding a layer, removing one, or drawing more
  numbers in one leaves every other layer's numbers as they were.
- **Choices by rendezvous hashing.** A pattern is chosen among its candidates by scoring each
  candidate by its own name (`choose`): the best score wins. A new candidate takes only the items
  it scores best for; the others keep theirs (a shared index into the list would move all of
  them).
- **Layout by role, not by draw order.** The rarity's work sits at fixed places relative to one
  drawn row (`row`): the inlay on it, the gems in the inlay, the filigree or the runes in the band
  below, the element below that, the marks from nine rows down.
- **Only integer maths, IEEE arithmetic and square roots** decide which texel is what (no
  `Math.sin`, `Math.hypot` or `Math.pow`, which engines need not agree on); rarity colours come
  from their `css` hex.

`tests/looks.test.js` pins the pixels of a few looks by key (`PINNED`, a hash of each), the seed of
an id and the hash itself: an accidental reshuffle fails it. If a change is meant, update the
hashes; it changes how those items look in every world (nothing is stored), and friends need the
same version to see the same.

## The pixels

`paintLook(look)` returns a 64×16 RGBA image: a 16×16 tile for each of the four materials the
item models are made of (`LOOK_SLOTS`, by the glTF material's name: `lookSlot`):

| tile | material | stuff (the seed chooses where there are several) |
|---|---|---|
| clay | `Items_Clay` (wood, leather, cloth, paper, corks; all of a quest thing); the old sword's `SwordGrip` | a sword's or flail's grip: leather wrapped diagonally, or mottled leather; a bow, crossbow, staff or trident: wood grain with a knot, or a wrap; body armor: cloth (a weave, quilted, dotted or striped) or stitched leather; a shield: planks, leather or cloth; other armor: leather, cloth or felt; a potion's label: paper with writing; a quest thing: what it is made of (below); the rest: a fine grain |
| metal | `Items_Metal`; the old sword's `SwordBlade`, `SwordGuard` | a blade brushed along its length with a fuller; hammered dents; plates with rivets; scales; rings; a coin's rim and stamp (a crown, a star or a bird) |
| trim | `Items_Trim` (armor's) | a twisted rope, beads, a zigzag, a meander, stripes |
| facets | `Items_Facets` (gems, glass) | glints and a flaw; a potion's glass: bubbles |

Quest things are one material, their colours in their vertices (`blender/items.py QUEST_PROPS`),
so each gets its own stuff (`QUEST_STUFF`): the toy rabbit fur, the letter paper, the parcel paper
tied with string, the map scrap a dotted way and a cross, the flour sacks a coarse weave, the cider
barrel wood with iron hoops, the crate and the old shield planks, the gears teeth, the honey pot a
honeycomb, the toadstools, mushrooms, spore pod and spider eggs spots, the crab and the clam
shell ridges, the skull and the bone lantern bone, the stone tablet, prayer stones, idol and rune
stone carved glyphs, the pots and the urn a painted zigzag band, the candles and butter lamps wax
drips, the pitcher plant veins, the crystals and ice glints, and so on. Every quest thing with clay
has one (`tests/looks.test.js`).

On top, by rarity (cumulative from Decent up):

| rarity | what is done to it |
|---|---|
| Crap | rust blotches on the metal (darkened trim around them), grime on the clay |
| Shitty | fewer rust blotches and less grime |
| Vanilla | nothing |
| Unremarkable | a fine engraved line |
| Decent | an inlay in the rarity's colour across the metal |
| Unusual | a band of it on the clay (the grip, the cloth, the wood) |
| Remarkable | two gems set in the inlay that glow, a glint of the colour in the facets |
| Fabled | a line of gold filigree under the inlay |
| Impossible | instead: three glowing runes between two gold lines |
| OMG | the runes each in a colour of the rainbow |

Then the enchantment's element, a motif or two in the band under the runes (three embers, two
drips, two frost crystals, a zigzag, two sparkles), and the affixes' marks in a row: three at most,
two on Fabled, one on Impossible and OMG (`MARKS_SHOWN`), so the best items carry their runes and
filigree rather than confetti.

A texel is one of three things (its alpha says which): **shades** (alpha 0): its grey times two
multiplies the model's own colour, so 128 leaves it and the vertex colours of the model stay what
they were (grain, engravings); **painted** (alpha 128): its colour replaces the model's (inlays,
rust, filigree); **glowing** (alpha 255): painted and glowing (gems, runes, elements), pulsing
(below). Mipmaps blend between them.

## Drawing it

The item models have no UVs (vertex colours only, `blender/items.py`, `blender/armor.py`), so
the texture is projected in the shader (`render/looks.js`): each face takes its tile from the
side it faces most, in the mesh's own space (a box projection; the face's direction from the
derivatives of its position, so faces are flat whatever their normals), with the origin in the
middle of a tile (a coin's stamp sits on its middle). The texture is nearest-filtered when
magnified (pixels), mipmapped when far off (no shimmer), sampled with `textureGrad` so the tiles'
seams take no wrong mip level. The edit goes after `<color_fragment>` (diffuse) and
`<emissivemap_fragment>` (glow), so the lights (`render/lighthook.js`, [lighting.md](lighting.md))
light the textured colour like any other, and the other edits (a cube's fade, the far look, the
diving tint) chain onto it as usual (`onBeforeCompile`, `customProgramCacheKey` `|look`: one more
program for each material kind, not one per look).

How big a texel is: every model is measured when it loads (`markLookScale`, from
`render/gltf.js`): 40 texels to the unit, more on small things so they still show a whole tile
(16 across their longest side: coins, potions, quest things). Thin parts take more
(`core/looks.js partScales`): a part is what hangs together (triangles sharing corners, welded by
position), with the smaller parts lying inside a bigger one's box (a blade's bevels), and one
whose width across (the middle side of its box) would be under 6 texels gets enough for 6, up to
twice the model's: a long sword's blade, a staff's shaft, a grip, a strap. It is an attribute of
the geometry (`lookScale`, per vertex), so every copy agrees however it is turned or scaled. A
breastplate has about 56 texels across, a long sword's blade 6 across and about 60 along.

The glowing texels pulse, all together (`lookPulse`, set by `pulseLooks` every frame from
`render/loot.js drawLoot` and `render/itemviews.js drawLiveViews`), as rare armor's trim does; the
bag's pictures are drawn at full glow.

Sharing: one `DataTexture` per look (4 KB), made when first wanted and kept (the 256 used last;
one let go and still drawn is uploaded again). A model takes its look with `dressLook(root, item)`:
every item material is swapped for its look's copy, made once per base material and look and shared
by every model of that look (the floor's pickups of one kind, the hand); `lookOnto(material,
item, mesh)` does it in place on a material of its own (worn things, `render/figure.js`). A model
dressed again goes back to its base materials first, so a hand's weapon changes its look in place.

Where it is applied:

- On the floor (`render/loot.js`): each view in its pickup's look; the warm-up compiles a coin in
  its look (`lootWarmup`, `render/warmup.js`).
- In the hand (`render/character.js equipSword`, `game/equipment.js`): the weapon's slot, a
  flask's kind. Enchanted or re-rolled in hand, it changes in place (`dressHand`, from
  `game/armor.js updateArmor`). A staff's or trident's stones glow on whichever material it wears
  (`render/held.js`). Thrown flasks (`render/throws.js`) and Renew's weapons (`render/renewview.js`)
  in their kind's look.
- On the body (`render/figure.js wear`, `opts.look`; `game/armor.js` passes each piece's key):
  armor, and whatever the villagers wear (their kind's look). The rarity's trim colour and glow
  (`shine`) still apply, shaded by the trim tile.
- In the pictures (`render/itempictures.js`): pictures are kept by the look's key
  (`pictureKey`), so the bag, the floor column, the Smith's wares, the quick bar, the touch buttons
  and the hero in the main menu show each item as it is; the inventory's live views
  (`render/itemviews.js`) too, the hero there holding the weapon in its look.
- To friends (`net/protocol.js`, [online.md](online.md)): `me.look` is the weapon's key and every
  worn thing is `id@rarity@back@look`; a key is only taken for the item it names (`lookFor`). The
  floor loot carries its `gen` already.
- Renew's echo of the hero (`game/rewind.js` tapes the weapon's look with its model,
  `render/renewview.js echoWeapon`) holds the weapon as the hero held it, and wears what the hero
  wears (`wearLike`, the looks with it).
- The quest panel's rewards and what a quest has you carry (`game/questpanel.js`): each with its
  picture, a rolled reward weapon in its look before it is handed over.

## What is rolled, and where its look comes from

Everything whose identity comes from a roll is a weapon or a piece of armor with `gen`, and every
one of them takes its look from it, wherever it comes from and wherever it shows:

| what | rolled by | its look |
|---|---|---|
| weapons of every kind (swords, flails, tridents, bows, crossbows, staffs; the lightning staffs) | `core/gear/generate.js rollWeapon` | name, rarity, affixes; enchantment |
| armor of every slot (helms, body armor, shields, the prow shields, boots), hats and things carried as armor | `rollArmor` | name, rarity, affixes |
| enemy and guardian drops, Renew's flail, Squarlo's tridents | `core/gear/drops.js` | as rolled |
| treasure chests (reward sites, also behind trials, room tasks and vaults) | `core/chests.js chestLoot` | as rolled, stowed in the chest in it |
| quest rewards | `core/quests.js` | as rolled, in the quest panel before you have it |
| the Smith's wares | `core/shops.js smithStock` | as rolled, bought as it is |
| the Enchanter's work, the Smith's re-rolls | `core/crafting.js` | the same patterns, a new element or mark |
| the glassmaker's old sword, the dev loadout | `fixedWeapon`, `rollWeapon` | its name, Vanilla |

The rest has no roll of its own, so it looks like its kind: potions, flasks, coins, crystals,
sticks, the portal scrolls, quest things (which quest asks for which is rolled per world, but the
thing is the same kind everywhere), and what the villagers and the people out in the world wear
(their outfits are picked per world, `core/npcs.js`, but they are not items with a roll). No
rings, trinkets or wands exist as gear. Renew's own weapons in his hand are their kind's (they
are not rolled; what he drops is). The only item models with no look at all are the arrows and
bolts the bows and crossbows shoot (`render/shots.js`, `render/projectiles.js`): shots, not things
to collect, and the same for every weapon.

## Phones

One texture fetch and a handful of operations more for an item's pixels, no extra draw calls
(each item had materials of its own already), 4 KB a look. Items are a small share of the screen.

## Seeing many at once

`/tests/browser/looks.html` (served by `tools/serve.py`): every rarity of an item, a row each,
`n` rolls each (half enchanted), each as the bag's picture with its texture beside it
(`?item=weapon_sword_long&n=6&level=20`; `?item=stack`: every potion, coin, crystal, scroll and
quest thing; `?size=300&yaw=0.6`: drawn bigger). In the game (`?dev=1`): `/looks <item> [count]
[level]` drops rolls of a weapon or a piece of armor at your feet, a rarity each, every other
weapon enchanted ([console.md](console.md)).

## Extending

- A new pattern: a function in `STUFF` (it gets the tile, its own stream `<slot>.<pattern>` and
  the look; `shade`, `darken`, `paint`), listed for the items it suits in `stuffOf` (or a quest
  thing's in `QUEST_STUFF`). Adding a candidate moves only the items it wins.
- A new layer: draw from a stream of its own name (`stream(look, 'name')`), never from another
  layer's, and place it by role (relative to `row`), so nothing else moves.
- A new affix: its mark in `GLYPHS` and its id in `MARKS` (`tests/looks.test.js` checks every
  affix has one).
- A new enchantment: its colour in `ELEMENTS` and its element in `paintLook`.
- A new model: its materials named like the others' (`Items_Clay`, `Items_Metal`, `Items_Trim`,
  `Items_Facets`); `tests/looks.test.js` checks every collectable's model has one that takes a look.
- Changing a pattern changes how the items using it look (nothing is stored); the pinned hashes
  in `tests/looks.test.js` say which. Friends must run the same version to see the same (the
  protocol's version check covers releases).

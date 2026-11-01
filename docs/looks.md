# Item looks

Status: a first version. Everything you can collect wears a small pixelated texture made from its
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

## The pixels

`paintLook(look)` returns a 64×16 RGBA image: a 16×16 tile for each of the four materials the
item models are made of (`LOOK_SLOTS`, by the glTF material's name: `lookSlot`):

| tile | material | stuff (the seed picks one where there are several) |
|---|---|---|
| clay | `Items_Clay` (wood, leather, cloth, paper, corks); the old sword's `SwordGrip` | a sword's or flail's grip: leather wrapped diagonally, or mottled leather; a bow, crossbow, staff or trident: wood grain with a knot; armor: cloth (a weave, quilted, dotted or striped) or stitched leather; a potion's label: paper with lines of writing; the rest: a fine grain |
| metal | `Items_Metal`; the old sword's `SwordBlade`, `SwordGuard` | a blade brushed along its length with a fuller; hammered dents; plates with rivets; scales; rings; a coin's rim and stamp (a crown, a star or a bird) |
| trim | `Items_Trim` (armor's) | a twisted rope, beads, a zigzag, a meander, stripes |
| facets | `Items_Facets` (gems, glass) | glints and a flaw; a potion's glass: bubbles |

On top, by rarity (cumulative from Decent up):

| rarity | what is done to it |
|---|---|
| Crap | rust blotches on the metal (darkened trim around them), grime on the clay |
| Shitty | fewer rust blotches and less grime |
| Vanilla | nothing |
| Unremarkable | a fine engraved line |
| Decent | an inlay in the rarity's colour across the metal |
| Unusual | a band of it on the clay (the grip, the cloth, the wood) |
| Remarkable | small gems that glow, and glowing dots in the facets |
| Fabled | gold filigree |
| Impossible | a row of glowing runes on the metal and on the clay |
| OMG | the runes in every colour |

Then the enchantment's element and the affixes' marks.

A texel is one of three things (its alpha says which): **shades** (alpha 0): its grey times two
multiplies the model's own colour, so 128 leaves it and the vertex colours of the model stay what
they were (grain, engravings); **painted** (alpha 128): its colour replaces the model's (inlays,
rust, filigree); **glowing** (alpha 255): painted and glowing (gems, runes, elements). Mipmaps
blend between them.

Only `Math.sqrt` and integer maths decide which texel is what (no `Math.sin` or `Math.hypot`,
which browsers need not compute alike), and the rarity colours come from their `css` hex: every
browser paints the same pixels.

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
(16 across their longest side: coins, potions); kept on the geometry, so every copy agrees
however it is turned or scaled. A short sword has about 33 texels along its blade, a breastplate
about 56 across.

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

- A new pattern: a function in `STUFF` (it gets the tile and the tile's random; `shade`, `darken`,
  `paint`), listed for the items it suits in `stuffOf`.
- A new affix: its mark in `GLYPHS` and its id in `MARKS` (`tests/looks.test.js` checks every
  affix has one).
- A new enchantment: its colour in `ELEMENTS` and its element in `paintLook`.
- A new model: its materials named like the others' (`Items_Clay`, `Items_Metal`, `Items_Trim`,
  `Items_Facets`); `tests/looks.test.js` checks every collectable's model has one that takes a look.
- Changing a pattern changes how every item already found looks (nothing is stored); friends
  must run the same version to see the same (the protocol's version check covers releases).

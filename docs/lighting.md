# Lights and shadows

Status: a first version. Every glowing thing of a cube lights it at once, each with its shadow,
and the shadows stay sharp however close the camera comes. Drawn forward as before, so the
anti-aliasing (MSAA) and every material's own look stay what they were.

## Three kinds of light

| light | what | its shadows |
|---|---|---|
| the sun (and the moon of the night themes and of the world's nights) | `render/scene.js` `sun`, where the cube played in has it (`render/bake.js setCurrentBake`) | of the fixed parts: baked, again as it moves (below); of what moves: three.js's shadow map |
| the fixed lights | what a cube's glowing things give off, every one of them (`render/props.js`): lanterns, fires, lava, portals, crystals, a trial's braziers (`render/lightpool.js adoptLights` takes those not on a villager; at most 128 a cube) | baked when the cube is shown (`render/bake.js`) |
| the moving lights | the hero's lamp (`render/character.js`, a three.js light); shots, enemies, loot, villagers' lamps, a partner (`trackLight`, `render/lightpool.js`) | the hero's lamp: a cube of shadow maps, as the quality level asks (`render/shadows.js`), but none of the hero and none where the sun outshines it; the others: none |

**Where a prop's light is:** where it glows (`core/glowspots.js`): its glowing triangles in
pieces (a big piece in parts 0.8 across), the pieces nearer than 0.5 one spot, at most six a prop
(the lantern tree's lanterns), each moved 0.35 out along the way its glow faces (a toadstool's
gills face down: its lights go under the cap; a window out of its wall) and, on the ground, at
least 0.3 over its foot. At the prop's middle a light would be inside the prop, shut in by its
own baked shadow (a shed's walls, a furnace, a tree's trunk). A prop with several shares its
brightness out between them. A fixed light shines only while what it hung on shows (a portal's
gate, hidden once its face opens).

**Lit at night only** (`render/night.js`): the town's street lamps, garlands and the lanterns of
its wall (a placement's `night`, `world/town.js`; a garland's segments with a light only every
other one, `unlit`, and all of it coming on at once) and the houses' windows (a prop's `_window` material: a light out of each
window, 0.35 out of its wall). They are fixed lights like the others, baked with their shadows
and dark by day (intensity 0: they reach nothing); through the dusk each house and lamp comes
on at its own moment (`litAt`, by where it stands), its glowing parts in the shader and its
lights alike, and goes out through the dawn. A window's candlelight glimmers a little; a lamp
flickers like any lantern. The channels and the cells go by how bright a light gets
(`userData.peak`), not by how bright it is when the cube is baked.

**The surroundings** (`render/farlights.js`): the proxies of the cubes round the one played in
(`render/neighbors.js`) are not baked, but their lights stay on, dimmed: the lights of what they
show (their landmarks and set pieces, all of a town tile's dressing: `shownFar`; the same lights
the cube built in full would have, `render/props.js propLights`), the street lamps and windows at
night only, as in the cube played in, in the cubes up to two away (as their people,
`game/standins.js`). All of them (up to `FAR_MAX`, 512; past that the nearest, the farthest
fading out) go into one table, and a grid over the world round the hero (`FAR_CELLS` cells of
`FAR_CELL` units, `render/lighthook.js`) lists for each cell the lights that reach into it, the
strongest first, `FAR_K` (12) at most: the proxies' shaders and the people there
(`render/farlook.js`) walk only their cell's, point lights without shadows, as bright as their
glow there (`PROXY.glow` at the whole dim, faded with their cube). The grid is laid out again only
when the lights change or the hero walks into another of its cells. (Before, only the nearest 32
shone: walking through the town at night its lamps went on and off.) No light comes or goes in
the scene, so nothing is compiled again.

In the town, which has no glass between its tiles, they cross the seams: the grid's second half
lists the tiles' lights round the one played in, which its own shaders walk after its fixed
lights (at their full brightness, as they will shine once their tile is the one played in), so a
lamp by a seam lights both sides of it; and the tile played in's own lights shine out onto the
tiles round it. Its own are baked in it; until they are (`render/bake.js bakeLit`) they shine
from the table instead, fading over to the bake. Elsewhere the glass stands between: the
surroundings' lights do not reach into the cube played in, nor its lights out.

**The fixed parts** cast the baked shadows: the cube's solids (terrain, stone, wood) and its props
that cast shadows. They stay out of three.js's shadow map of the sun (`render/bake.js
keepFixedOutOfSun`), which then only holds what moves.

## Baking (`render/bake.js tickBakes`)

Never in one go: a few steps a frame (the sun, then a light a step; a step is the light's six
shadow maps, its lightmap and its volume), as many as the GPU keeps up with: a fence goes in after
a frame's steps, and while two frames' steps are not done no more are given (on the CPU's clock
the budget never saw the GPU's work: a step is a few ms on a desktop, tens on a weak GPU). Each
frame with none waiting one step more, up to `STEPS` (4, and no more than 3 ms of the frame); one
that waits, back to one. The cube played in
first (`main.js`, last before drawing: whatever builds the cube again during the frame, like the
quests, has done so). A cube's lights stay dark until it is baked and then come on over 0.35 s,
its baked shadows with them (`uBakeR`); a bake that fails leaves them on, without shadows.

- **Ahead** (`game/bakeahead.js`): once the cube played in is baked, the cubes behind its
  nearest ways out (the sides walked across, the town's seams and the open faces; its portals:
  `AHEAD`, 3, one on a small device, the nearest to the hero) are built off-screen as
  they will be entered (`game/flow.js buildCube`; behind a side portal with that face open, as
  going through opens it), never shown, and baked after everything shown, one at a time; their
  suns follow the time of day like the cube's own (each one's bake in memory: about 35 MB on
  High). Entered (or no longer among the nearest) one is thrown away and its bake kept, and the
  cube built as the hero comes in takes it in that frame (`signature`, below). Walking from one
  cube into the next across an open face or a seam of the town little covers the bake (a
  dissolve of 0.3 s, `game/handover.js`; none is built ahead meanwhile): without this the sun's
  shadows of its houses came in a second or so later (the sun's first place alone is 33 steps on
  High and Medium: its lightmap is baked in strips).
- **Through a portal** the new cube is faded out for its first moments (`game/travelfx.js`):
  one not baked ahead is baked by then on a desktop (about 10 frames for the dark forest's 40
  lights).
- **Behind the curtain** (`game/hud.js fadeOut`: dying, doors, the town portal, loading) up to
  `HIDDEN_STEPS` (16) a frame and 12 ms, and nothing else is drawn meanwhile (`main.js`); the
  curtain lifts once it is baked (`fadeIn` waits, at most 2 s). (All at once in one frame was 5 s
  of GPU work on a software renderer: a weak GPU's driver gives up on less, and the context is
  lost.)
- **A cube built again** as it was (a prop set that came late, a quest's change: `game/flow.js
  rebuildWorld`) takes its bake at once: the last three cubes' bakes are kept (one on a small
  device: Small devices, below), by geometry, and taken if the lights and props are where they were
  (`signature`); so does one baked ahead.
- **How finely** (`BAKE_DETAIL`, by the quality level, `game/quality.js`): High and Medium as
  below; Low 1024² for the sun, 512² cube maps, 2 volume samples a unit, 8 lightmap texels a unit
  (a quarter of the memory); Lowest the same without a volume; a small device never finer than
  Low. The lightmap's texels are the world worker's, chosen when the world starts
  (`bakeDensity`); the rest is for the next cube baked.
- The baking's shaders are compiled ahead with the cube's (`render/cubeassets.js warmCube`), for a
  render target and a scene without the world's fog and lights (else others: the first bake
  compiled them all while drawing), and three's programs of the shadow maps it draws (a sun's and
  a light's drawn once). The fluids' patterns the same way (`render/watercells.js cellWarmup`).

What it does:

1. **Channels.** Lights whose reaches overlap get different channels, eleven in all: the brightest
   first, each the first channel none of its neighbours has (reaches count to 85%: beyond that a
   light is faint). A light left without one shares the channel of one within 1.2 units (the
   lanterns on a string: its shadow is near enough); else it shines without a shadow.
2. **The lightmap** (three RGBA8 textures, the first's red unused; the sun has its own, below): for each texel of the
   solids, the **signed distance** to the edge of the light's shadow, in texels (±1.5, 0.5 on the
   edge). Found by testing points a quarter texel apart round the texel (on its plane) against
   the light's shadow map: a cube of 1024² depth maps for a light (only out of 0.3 from it, so a
   lamp's own frame casts none), a 2048² one of the cube for the sun (the sun has a lightmap of
   its own: The sun going round). Where a coarse look round
   finds the light everywhere or nowhere, the texel is ±1.5 at once. The charts' edges are filled
   outwards.
3. **The volume** (three RGBA8 textures, 4 samples a unit, round the cube): how much of each
   light reaches each point (four points in each voxel), for what is not lightmapped. Its slices
   (one a sample up) lie side by side in one 2D atlas, so a light's slices are one draw (with a 3D
   texture a draw each, about 35 a light: a render pass each, costly on phones' tiled GPUs); a
   shader reads the two slices round a point and blends them. Without it (Lowest) props, figures
   and fluids take every fixed light unshadowed (in the overview 0.3% of the pixels differ).
4. The sun's shadow map of the fixed parts (16-bit) is kept, for what is not lightmapped (one
   for each of the sun's places kept).

**The lightmap's layout** (`render/lightmap.js`, in the world worker with the rest of the
cube's geometry): charts of the triangles facing mostly the same way (the six axis
directions), connected by their edges, projected along that axis; one that would come back over
itself (a spiral ramp) is split. 16 texels a unit, two texels round each chart, packed in
shelves; an atlas of about 1024 × 800 for a cube of the dark forest. The lit solids carry the
place of each corner (`lm`, render/parts.js).

## The sun going round (`render/bake.js updateSun`, `core/daycycle.js`)

Under an open sky the sun moves with the world's time of day (docs/world.md, Days and nights):
along its path, `SUN_KEYS` + 1 places (keys) 1.5 s of the day apart, spaced so that the tips of
the shadows move as far from one to the next (about 0.15 a key for something 10 high; 0.08 in the
canyon, whose sun stays higher). Each place has its own bake, kept with the cube's:

- **A lightmap of the sun's own** (one channel, `RedFormat`; the same layout as the lights', on
  High twice as fine, `sunLm`: a fence's rails, thinner than two texels, came out as blobs) and
  its shadow map of the fixed parts (`sunMap`). Its signed distances reach farther than a
  light's (`SUN_RANGE`: ±5 texels, searched in half texels, against ±1.5 in quarters), so that
  blending two places' distances moves an edge from one to the other. Filled out round the
  charts with a little Gaussian over the distances within each chart (`SUN_FILL_FRAG`, 5 × 5):
  the edge stays as sharp, it only loses the steps the texels and the shadow map's pixels left,
  which changed from one place to the next and made the edges crawl.
- **What casts it:** the solids and fixed props, and things that stand still but may show or
  hide (`sunCast`: the portals' gates and wells, `render/markers.js`). Those are out of the
  realtime map too; when one shows or hides every place is baked again (`gen`), what showed
  fading over once they are.
- **What shows** is a blend of the two places the sun stands between (`uBakeSunT`): on the
  solids their lightmaps' distances blended (`uBakeSunA`, `uBakeSunB`), so an edge slides from
  one place to the next. On everything else their shadow maps (`uBakeSun`, `uBakeSun2`, read
  raw), each moved to where the sun stands now (`render/lighthook.js bakeSunAt`): what shades a
  point lies some way s towards the sun (the map's nearer depths in a 3 × 3 look round it, as
  far as such a shadow moves between the places), so the map is read at p + s × (sun now − the
  place's sun), compared by hand 2 × 2. Exact for a shade at one distance; read from the nearer
  place, from both in the middle, blended. The scene's sun (the realtime map of what moves, the
  light's direction) stands at the nearer place (`step`): turning that map every frame made the
  edges of what it holds crawl (its pixels landing differently on them each frame), so it turns
  only from one place to the next.
- **The sun's shadow maps hold the first surface the sun sees** (`sunPass`: both sides of
  everything drawn; three draws only the far sides, so where a wall met the ground its shaded
  side stood as far from the sun as the ground beside it, and the ground at its foot and round
  its corners came out lit). What is lit sees itself in them then, so whatever reads them keeps
  off it by a texel or two along its normal (more the more it turns from the sun) with as much
  leeway in depth, slope-scaled (the bake's `VISIBLE`, `bakeSunAt`). The blend shown eases
  after the time of day (`SUN_EASE`); after a jump of the clock (a hidden tab, joining a game,
  `/daytime`) it fades over from what showed.
- **Baked ahead:** each frame `updateSun` wants the place the sun is at, the next one and the one
  after; the first missing one is baked, a step a frame under the same fences and budget as the
  lights (`tickBakes`, only while no cube is baking): its shadow map, then its lightmap in
  `STRIPS` (8, four times as many on High) strips (a scissor over the atlas), then filled out round the charts. A desktop
  does one in a few frames; a key comes every 1.5 s. Places neither shown nor wanted are let go:
  about three are kept.
- **The night:** the moon stands where the noon sun does (`NOON`, the place every other cube's
  sun has), so the sun's last place gives way to it halfway through the dusk and the first
  place takes over from it halfway through the dawn, while neither shines (`sunAt` `light`).
- **Not on the lowest level** (`movingSun`, `game/quality.js`): there the sun stays at noon and
  only the light turns. Nor under the hazy skies of act II, in a night theme, the caves, or a
  boss's arena (always noon; but Gusto's has the world's days and nights like any cube,
  `core/bosses.js` BOSS_ARENAS `days`).

## One edge rule (`render/lighthook.js EDGE`)

Every shadow's edge is as sharp as a pixel but never sharper than `EDGE` (0.025) world units,
about what the realtime map of what moves shows (two of its texels): on the lightmapped solids
the distances' ramp over at least that (`uBakeEdge`, the sun's and the lights'), on everything
else the sun's shadow maps read with a 2 × 2 blend, four of them where a pixel or `EDGE` covers
more than the map's texels (`bakeSunAt` `foot`). So the baked shadows, the objects' and the
figures' look alike at any zoom.

## Drawing (`render/lighthook.js`)

Every light is on all the time, however far from the hero: none is picked by distance (only
past 64 moving ones at once would the farthest fade out). Every lit material takes part without being asked: the module wraps `Material.onBeforeCompile`
(imported first, `main.js` and `render/scene.js`) and edits three.js's light loop the same way in
every shader, so no program changes its cache key.

- **The moving lights:** a table (a float texture, two texels a light: where it is in the world,
  at most 64) every lit shader walks, without shadows (`render/lightpool.js updateLightPool` fills
  it each frame).
- **The fixed lights:** the cube's table (at most 128), walked after the moving ones: not all of
  it, only the lights of the point's **cell** (`core/lightcells.js`: the cube's ground in cells of
  a unit, each with the lights whose reach comes into it, the strongest there first, 16 at most).
  A dark forest's cube has 40-50 lights, a point is reached by about a dozen: on a software
  renderer (a stand-in for a weak GPU) a cube of the spider nests (46 lights) went from about 4 to
  7 frames a second. Each light keeps its row in the table (a dark or hidden one reaches
  nothing); each light's visibility comes from its channel. Both through three.js's own BRDF (`RE_Direct`): the same look
  as a point light. (Tables, not uniform arrays: some GPUs take no more than 224 vectors of
  uniforms in a shader.)
- **On the lightmapped solids** (`BAKED_LM`, `render/bake.js bakedSurface`): the distance from the
  lightmap, turned into light over one pixel (its change across the pixel, `fwidth`): the edge
  is a pixel wide and smooth at any zoom, without MSAA's help (MSAA only smooths the edges of
  triangles). The sun's light the same from its own lightmaps (the two places it stands between,
  their distances blended).
- **On everything else** (props, figures, fluids): the volume at the point (a little out along
  the normal), soft; the sun from the kept shadow maps of the fixed parts (the two places',
  blended).
- Times three.js's shadow map of the sun for what moves, as before.
- The hero's lamp: three.js's cube of shadow maps, its bias in world units along the ray
  (`render/character.js` `POINT_BIAS`, 0.03): three.js's own is in the map's depth, which made
  it grow with the square of the distance, and at the lamp's night reach the shadows of cliffs
  and walls started most of a unit from their foot.
- **No double shadows:** the hero casts nothing into the lamp's maps (the lamp hangs over the
  head, and its shadow of the figure lay next to the sun's), and where the sun outshines the
  lamp the lamp's shadows go altogether (`render/look.js sunShare`: the sun's share of the light
  on the ground at the hero's feet, from half to 0.68 the lamp's shadows fade out). By day under
  an open sky and in act II's sunlit caves the lamp casts none (and its maps are not drawn); in
  the dark forest, by night and in the deep all of them. Before, with the sun going round, a low
  sun gave everything by the hero two shadows.
- The proxies of the surroundings take none of it (`NO_BAKE`, `render/neighbors.js`), only their
  own lights left on (above, "The surroundings").
- What a cube is built of shows its own cube's lights and shadows (`render/bake.js
  bakeMaterials`), also while another is the one played in (travelling); everything else (the
  hero, enemies, loot) the cube played in (`setCurrentBake`).
- Flip's turning box is not baked: its lights are moving ones (so are a cube's past 128).

## Dev

`/lightview sun | lights | lightmap | off` (docs/console.md): the sun's baked shadow alone, the
fixed lights' light alone, the lightmap's texels. The Teacher (learn/tutor/) switches the same views with
`teach.lightview(view)` (`game/teach.js`).

What the frames cost (`game/perf.js`), on any device: **`?perf=1`** (or `/perf`) shows the frame
rate and the worst frames, the quality level and what it draws (`render/shadows.js shadowState`),
the pixel ratio and the MSAA samples, the bake's steps and waits (`bakeStats`), shaders compiled
while drawing (`render/programs.js programStats`; with `?dev=1` each named in the console), draw
calls. **`/bench`** holds the game and times the frame to the end of the GPU's work (a pixel read
back from the screen: Safari has no GPU timers) with a part off at a time. On the software
renderer (1280×720, a nests cube, a horde of 24): High 129 ms a frame (the lamp's maps 15, the
sun's 16, the enemies' shadows 20, the fixed lights 6; the fluids' patterns would add 34), Medium
126, Low and Lowest 95.

**iOS Safari** (`tools/sim-probe.py`): the game in an Xcode simulator's Safari with a probe in the
page, which reports WebGL's features there and (`--full`) a deep cube entered, portal trips and a
level switch, with their long frames. Safari 26 has WebGL2 with `KHR_parallel_shader_compile`
(a program ready ~0.3-0.4 s after compiling, the page not held up) and fences that signal without
blocking, no GPU timers, MSAA up to 4×; a 3× screen draws at 2× (780×1398 on an iPhone 16e). Its
compiling happens in another process: a frame waiting for it comes late with almost nothing of the
page's own time in it, so `/perf`'s count of shaders compiled while drawing misses it. The first
visit's frames into a deep cube still stall (0.5-1 s in the simulator), later ones less (Safari
keeps what it compiled). The simulator draws with the Mac's GPU and enforces no memory limits.

## Light in the deep

From depth 13 down no theme has a room without lights of its own, about 15–30 a room
(`tests/lights.test.js`):

- **Glowing props** in every set: the spider nests' glowing eggs, pale fungus, dewy webs and
  glowing silk; the buried ruins' oil lamps, wall braziers and glyph stones (`assets/clutter/`); the
  deep's landmarks glow too (the web gate's and the brood cluster's eggs, the temple gate's
  braziers, the colossus's eyes, the bone arch's candles, the great gear's coals).
- **Lamps by the way** (a theme's `waylights`, `render/propplace.js`): mine lanterns, candelabras
  and bone lanterns, oil lamps and braziers, crucibles, rune stones, glowing eggs.
- **They live:** candles and lanterns flicker, crystals, runes, fungus, magma and the sea's glow
  breathe (`flicker`; the older libraries' by their kind, `core/propcatalog.js FLICKER`), their
  glowing parts with their lights; fires burn with flames (`FIRES`); lava pulses.
- **What drifts** (a theme's `motes`, `render/motes.js`): spores, embers, sparks, dust and
  plankton round the character, and in the darkest themes a few **wisps**, glowing orbs that
  wander about with moving lights of their own (no shadows, like shots).

## Quality levels (`game/quality.js`)

The settings' **Lighting: Auto / Lowest / Low / Medium / High** (`game/settings.js graphics`;
Auto at first; a stored Full is Auto, a stored Simple is Low). Every level looks the same in kind:
every fixed light with its baked shadow, the hero's lamp and the sun casting shadows. What
changes is how much is drawn for that:

| | High | Medium | Low | Lowest |
|---|---|---|---|---|
| lamp's shadows reach | its light's reach | 5 | 5, every 2nd frame | faded out, not drawn |
| enemies in the lamp's shadows | all | within 5 | none | none |
| sun's map of what moves | 2048 | 1024, enemies within 12 | 1024, every 2nd frame, enemies within 8 | 512, the hero only |
| fixed lights a point takes | 16 | 12 | 8 | 6 |
| fluids' patterns | 512², every frame | 512², 30 Hz | 256², 30 Hz | 256², 20 Hz |
| motes | all | all | half | half |
| the town's small dressing round the tile played in | all | within 32 | within 18 | within 10 |

- **Why these:** drawing the realtime shadow maps is most of what shadows cost, and every enemy is
  drawn again in each of the lamp's six maps and the sun's. On a software renderer (1280×720, a
  nests cube of 17 lights): the lamp's maps ~9 ms of a 79 ms frame, its lookups ~3, the sun's ~7;
  in a fight with 24 enemies the lamp's 16 ms and the sun's 23 of 136, the enemies' share ~20. A
  smaller lamp map does not help (it is geometry, not pixels); the lamp's reach (up to 10 in the
  deep) does: its six maps cover twice that.
- **Never a shader compiled again** (`render/shadows.js`): a light that stops casting shadows
  recompiles every lit shader (3.5 s on a fast machine the first time). The lamp casts shadows on
  every level; how far (its shadow camera's far plane, not its light's reach: past it its light
  goes through walls, faintly), which enemies cast into which map (each map drawn in a call of its
  own, the others' meshes not casting meanwhile), how often (every n-th frame) and how strong
  (`shadow.intensity`) are what change.
- **The town's small dressing** (`dressing`, `render/neighbors.js`): the tiles round the one
  played in are drawn with all they are dressed with, and its small things (flowers, grass,
  stones, little clutter: smaller than a unit, glowing nothing) were 40% of their triangles in 70%
  of their props (600k triangles in 2500 props for a town). Past the level's reach from the hero
  they fade out (the proxies' dither, per instance, over 4 units) and are not drawn; each prop of
  the batch is frustum-culled on its own too. On a software renderer (390×844, the inn's tile)
  the surroundings went from 66 of a 102 ms frame to 40 of 74 on Low.
- **Every change fades:** the shadows' strength over half a second, the reaches eased (8 units a
  second: enemies' shadows drop out and come back one by one at the edge), the fixed lights a
  point takes eased (`uBakeK`, a float: the last light fades); the fluids' patterns and the sun's
  map size simply switch.
- **Auto** (`core/resolution.js`, with the resolution, unless the settings pin that): too slow, a step down: the level first,
  then the resolution; CPU-bound slow frames take only the level down. A second's hitches (frames
  over 3× its median: a shader compiling, a cube built) are not counted. A level's step is judged
  a second later than the others (its fades). Up after a calm spell: the resolution, then the
  level. The level reached is kept
  for the next visit (`crawler.quality`); a first visit starts at Low where the screen is touched,
  at Medium elsewhere.

Where the screen is touched the frame rate cap is 30 at first (a setting like any other).

## Small devices (`render/device.js`)

Auto follows the frame rate, but a phone's other limit is its memory: its GPU shares the
phone's, and iOS Safari kills a page that takes more than it allows (no lost context to recover
from: the tab reloads, or Safari goes with it). Nothing in Safari says how much that is, nor how
much a page uses, and a phone's GPU is fast enough for Auto to climb to High at 30 frames a
second. So a **small device** (a touched screen, an iPad, or a browser saying it has 4 GB or less;
`?small=1` / `?small=0` forces it) keeps what costs memory small on every level: it bakes no
finer than Low (`BAKE_DETAIL.light`, so its worlds' lightmaps have 8 texels a unit), the sun's map
of what moves is at most 1024² (`SMALL_SUN_MAP`), and it keeps one bake and bakes one cube ahead
(`CACHE`, `AHEAD`). What the levels change otherwise (the shadows drawn, the lights a point takes,
the town's dressing) still follows the frame rate.

In the town (seed 7, the twelve tiles walked through, Chrome emulating a phone; WebGL's
textures, buffers and render buffers counted as they are made: `render/gpumem.js`) the most held
at once went from 397 MB on High (131 MB on Low) to 103 MB on High (100 MB on Low). Most of that
was the sun's places: each one's shadow map kept a 2048² RGBA colour target beside its depth (16
MB, three places a cube, for every cube baked or kept), let go now with its target
(`render/bake.js sunSteps`: a render target's `texture.dispose()` does nothing in three.js).

`?perf=1` shows what WebGL holds (counted from the start: only with it in the address) and
whether the device counts as small.

The anti-aliasing is not one of Auto's steps (`render/msaa.js`): its setting's Auto picks once, as
the page starts, 2× MSAA on a high-DPI screen (a device pixel ratio of 1.5 or more) and 4×
elsewhere, and nothing changes it but the settings. A new number of samples makes the driver build
every material's pipeline again when it is next drawn (ANGLE on Metal, which the shader warm-up
cannot do ahead): 2× to off froze the game for a second, 2× to 8× for 3.6 s on an M5 Max, and the
next cubes entered stalled for a few hundred ms more. Dropping samples while the GPU could not
keep up (and taking them back after a calm spell) was the worst of the stutters.

## Not yet

- Baking takes the GPU's time while a portal's travel goes on. A GPU that cannot keep up with
  the frames themselves runs behind, so its fences come late and it bakes about a light a frame
  (on a software renderer a 37-light cube took ~16 s, frames being ~180 ms there).
- How much memory iOS Safari allows a page's WebGL before it reloads it is unmeasured (the
  simulator does not enforce it); a bake is ~28 MB on High, ~10 MB on Low. `?perf=1` on the
  phone shows what the game holds.
- three.js's own shadow maps (the sun's of what moves, the lamp's cube, a light's cube while
  baking) carry an RGBA colour target nothing reads, as big as their depth: 16 MB for the sun's
  2048² map on High.
- The lightmap is laid out for every cube the worker builds (10-25 ms), proxies too.
- More than eleven overlapping lights: some shine without shadows (a dark forest cube: one of 40).
- The moving lights (but the hero's lamp) cast no shadows: one inside what carries it (an enemy's
  glow) would be shut in by it.
- The cells are a grid on the ground: lights of a floor far above or below share a point's list
  (what they cannot reach is cheap: a distance test).

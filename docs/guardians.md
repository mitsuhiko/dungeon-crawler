# Guardian gates and descent boss placeholders

Every descent at depths 0–19 is guarded. Each route also contains **one or two
mandatory sideways guardians**, selected by the world seed. The core (depth 20)
has an up portal but no further descent; its last cube is the final arena, its boss's, with no way
on (`final`, [bosses.md](bosses.md#qualmos)).

## Pacing and topology

`world/layout.js` builds a route on every stratum, including the surface,
counting the entry and descent rooms: **18–24 rooms** near the surface, shorter
further down, down to **9–16** at depths 16–19 (`ROUTE_ROOMS`). The core's
entry-to-centre route is always 9 rooms. Optional one-room branches fit inside
the band's most rooms per stratum. The town's gate → the rock →
the next room prefix is preserved.

Side arenas have one entrance and one onward side gate; descent arenas have one
entrance and a well. There are no portal loops around arenas. Discovered adjacent
rooms only open full-face shortcuts within a route section or along real portal
links: non-linked sections remain sealed. Discovery through a fall cannot open a
locked guardian face. Lock checks apply to portal charging, full-face crossings
and direct/debug travel. Up portals remain usable; the approach permits retreat.

## Recognizable encounter tiers

Each species has two distinct registered kinds, excluded from ordinary rosters:

| Tier | Kind table | Indicators | Hook |
|---|---|---|---|
| Side guardian | `GUARDIAN_KINDS` | Hot-pink body/glow, pink HP bar, `◆ Guardian Spider` label (its species) | `guardianRole: 'side'` |
| Descent guardian | `DESCENT_GUARDIAN_KINDS` | Amber body/glow; the boss bar on the screen, titled `♛ Temp Boss Spider`, nothing over its head ([ui.md](ui.md#the-boss-bar)) | `guardianRole: 'descent'`, `bossPlaceholder: true` |

Players know them by those names, the kinds' labels (`Guardian Grass snake`, `Temp Boss
Fire-face`): a descent guardian is a Temp Boss, holding the place of the boss its depth will
get ([bosses.md](bosses.md)). The messages name the one of the arena (`guardianKind` in
`game/enemyspawn.js`, the species the arena promotes): "Defeat the Temp Boss Spider to unlock
this descent", "The Guardian Spider still stands. Leave the arena?", "Guardian Spider defeated ·
Gate unlocked!".

A species may replace the pink and amber look with its own (`guardianLooks` on its profile,
[enemy-kinds.md](enemy-kinds.md#guardians)): the Wolk's guardians are a grey and a shining
silver cloud. The side guardian's HP bar and label keep the tier's colour, and so does the boss bar.

`map.guardian.role` and `.bossPlaceholder`, spawn/enemy fields, kind profiles, and
onward marker `userData` expose these identifiers. The descent tier is explicitly
reserved for replacement by real bosses: the first descent (depth 0) is guarded by **Gusto**
instead, the second (depth 1) by **Totnar**, the third (depth 2) by **Squarlo**, the fourth (depth 3)
by **Flip**, the fifth (depth 4) by **Foggery**, the sixth (depth 5) by **Renew**, each alone and
with a fight of his own ([bosses.md](bosses.md)); `map.guardian.boss` names him and
`bossPlaceholder` is false there.

Each tier sets level-1 floors (`GUARDIAN_TIERS` in `core/enemies.js`), so the promoted
species decides how a guardian fights, not how strong it is:

| Tier | Level | HP | Damage per second | XP | Poise | Drops |
|---|---|---|---|---:|---:|---|
| Side | depth + 1 | ≥ 550, ≥ 3.5× the species' | ≥ 9, ≥ 1.15× its blows | 260 | 1.4 s | a weapon (Decent+, Unusual+ from level 10), a potion |
| Descent | depth + 2 | ≥ 1000, ≥ 6.5× the species' | ≥ 11.5, ≥ 1.45× its blows | 650 | 2 s | two weapons (Decent+, Unusual+ from level 5, Remarkable+ from 14), two potions |

Damage per second (`threat`) averages a species' blows over its attack cycle, so a quick
spider and a slow Triangle are about as dangerous. Every descent guardian outlasts every side
guardian at the same level and deals at least 20% more per second than its species' side
guardian. On the road out of town (depth 0) both stand at the road's level. At full damage per
second a side guardian takes about 6 s, a descent guardian about 12 s ([balance.md](balance.md)).
Poise: after a stagger, lighter blows do not stagger a guardian again for that long, so it
strikes back even under a stream of blows. Movement and attack timing remain species-specific.
Rewards scale with level.

## Encounter and persistence

- Double the ordinary seeded local population and promote exactly one member (a real boss
  stands alone instead, [bosses.md](bosses.md)).
  Shared arena placement keeps bodies separate and fits the whole roster.
- The guardian stands two cells before its exit, facing inward. Defenders intercept
  advances, rally when it is hurt, and cannot all be lured towards the entrance.
- The locked exit glows red with a crossed seal, on side gates as well as wells.
  The minimap also marks locked exits red. Killing ordinary enemies is insufficient.
- While the guardian lives, walking back out of its arena (any open side face, in practice
  the entrance) asks first: a modal **Leave the fight?** (`game/leavefight.js`; Enter or Y
  leaves, Esc, N or a click beside it stays). Alone the world waits meanwhile, playing together
  it goes on. Staying does not ask again until you step away from the face. Only steering out
  yourself (keys or a mouse order, not a sword's lunge) asks; a push (a blow, a gust, a throw)
  or a body that cannot act (knocked over, getting up, stunned, held, downed) just presses
  against the face, and you stay in the arena (`core/guardians.js` `leavingFight`,
  `steersOut`). Steering out while being pushed asks too. The town portal scroll is unaffected.
- Guardian death alone removes the seal and unlocks the gate for the current run.
  Death rollback, revisits, returns from below and late asset rebuilds never restore
  it. Ordinary kills retain visit/death rollback behaviour; a new run resets both.

`game/defence.js` coordinates intentions; existing species AI still owns movement
and attacks. At most a third of defenders can be drawn towards the entrance.
Committed attack wind-ups are not cancelled. Unlocking removes defence intentions.
A guardian engages within 4.5 cells of its spot; a hit (from any range) makes it, or a
defender, go for the shooter as well for 6 s after the hit (to their floor, else to where it can
strike them from, `game/tactics.js`), so it is never a target that does not answer. With no
way to the shooter it keeps to its post.

## Generation

`cubegen/guardian.js` builds a dry single-layer arena, with both side pads forced
to the same ground level on both sides of their shared faces. Void and waterfall
shafts are disabled in arenas.

### Arena types

`world/arenas.js` gives each guardian one of eight arena types, using its own
seeded stream per depth, so routes and terrain are unaffected. Within a depth no
two arenas share a type.

- Descents lean towards colosseum, dais, crater, henge and courtyard.
- Side gates lean towards hills, gorge, henge, grove, crater and courtyard.
- Caves favour gorges and courtyards over groves and hills.

`cubegen/arenashapes.js` draws the terrain around the arena frame (entrance,
guardian, gate):

| Type | Terrain | Focal clutter |
|---|---|---|
| hills | rolling slopes, mounds up to four levels and a dip | a tree, stone or flag on each peak |
| gorge | a winding channel between cliffs three to eight levels high | boulders at the cliff foot, scenery on the cliff tops, faces dressed |
| colosseum | a flat oval of sand inside stepped seating, entered through cuts | columns and braziers around the rim, weapons and remains on the sand |
| dais | square terraces down from the guardian's throne to a sunken court and up to the entrance, joined by a ramp; galleries flank the court | ritual circle and braziers in the court, obelisks at the ramp, columns on the galleries |
| henge | gentle ground in a low berm | a ring of standing stones, an altar or ritual circle, cairns |
| crater | a bowl two levels deep under a crisp rim, crossed by a trench ridge | toppled columns, boulders, weapon graves, scattered remains |
| grove | gentle ground, some knolls | clumps of trees, logs, dense undergrowth |
| courtyard | a ruined wall ring with breaches and stubs | columns at the wall ends, urns, statues, braziers |

A boss may have an arena type of its own instead (`BOSS_ARENAS` in `core/bosses.js`,
`BOSS_SHAPES` in `cubegen/arenashapes.js`), never planned for other guardians: Squarlo's
**tidal** hills, a basin of low flats with at least four steep little hills in it (each with a
ramp up) where his tide comes and goes, and a bank round the cube's edge holding the water in (`map.tide`; [bosses.md](bosses.md#squarlo)).
Flip's **box** (`cubegen/fliparena.js`) is not a heightmap at all: a floor and four walls of solid
cells round the whole cube, open at the top, with a floating island in the middle, any side of
which can be the floor ([bosses.md](bosses.md#his-arena-the-box)). Foggery's **tower**
(`cubegen/towerarena.js`) is a caldera of lava out to the cube's sides, no walls, a stepped cone
of a tower in the middle with a ramp winding up round it, and a bridge from the doorway to it over
the caldera's floor; its doorway is higher up than other arenas' and in the middle of its face
(`door`, `centre`, `world/faces.js`)
([bosses.md](bosses.md#his-arena-the-caldera)).

The fight zone (`encounter` floors) links only by slopes of one level and by flat
edges. Terraces and lips are crisp steps that ramps join. Scenery next to the zone
is at least two levels up, so it is a wall rather than a ledge. Lower ground beside
the zone gets rails: two levels down for perimeter pockets, any drop for scenery.
The doorway pads, a ring around them and the guardian's 3×3 spot stay exactly flat.

`cubegen/arenaprops.js` dresses the arena with the terrain, inside the worker.
The type decides the roles: cover, small, tree, debris, stone, wall, lip and
remains, plus braziers and columns. The biome's palette fills each role.
Blocking props are colliders in `map.staticBlockers`, the same map that
navigation and spawns use. Each one stays inside its own cell, never on the
doorways, the guardian's spot or the entrance-to-guardian lane. One is only
placed if every free zone floor stays reachable. The generic scatter
(`render/propplace.js`) leaves arena floors alone and only dresses the outer ring.

An arena must hold its doubled population, plus at least eight free floors (more
in crowded depths) away from the doorways. If it cannot, its blocking clutter
thins out, then it falls back to hills, then crater, then the old flat arena.
`map.arena` records `{ type, requested }`. The dev command `/arena [kind] [depth]`
jumps into the nearest arena of a kind.

`map.guardian` retains the floor, position, approach, exit and portal ID.
`map.gateKeys` associates shared side faces with persistent gate identities;
`run.unlockedGates` stores unlocks independently of generated terrain.

## Checks

```sh
npm test
```

Layout tests sample 1,000 seeds across all depths, including full-discovery
shortcuts and each side guardian's mandatory cut. Arena tests cover both tiers,
shared pads, navigation/spacing, population, strength, retreat and persistence.
`tests/arenas.test.js` forces every arena type on real guardian cubes. It checks
the flat doorways, zone connectivity with clutter, out-of-reach scenery, rails,
the roster fitting, how often each type falls back, and that the types differ.
Browser checks exercise workers, assets, shaders, seals, charging and real travel:

```js
await (await import('./tests/browser/guardians.js')).runGuardianChecks();
await (await import('./tests/browser/guardians.js')).runSideGuardianChecks();
await (await import('./tests/browser/leavefight.js')).runLeaveFightChecks();   // Leave the fight?
```

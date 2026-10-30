# Horde encounters

Status: wild horde packs implemented; no separate horde arenas. Complements [depths.md](depths.md),
[combat.md](combat.md), [guardians.md](guardians.md) and [balance.md](balance.md).

## Implemented slice

- `world/hordes.js` plans exactly one main-route horde per depth, outside safe rooms,
  arrival rooms and guardian arenas. No bonus hordes or support enemies yet.
- `cubegen/hordes.js` reserves a local patch in the ordinary terrain generator,
  sized to the pack (at most 5×5 spawn cells, with a margin where space allows).
  It can be on ground or an upper terrace. The rest of the cube keeps its normal
  archetype, layers, rivers, shafts, scenery and portal heights. No arena fallback,
  new room role, new gate or whole-cube flattening.
- The patch avoids rivers, portal pads and waterfall shafts. Ground reservations
  may retain solid terrain over a local void; upper reservations keep underlying
  fluids/terrain. A reachable approach and onward path are required. Ambient
  blockers stay out, but sparse non-blocking ground cover remains.
- Counts: 6–8 on the road, 8–12 at depths 1–4, 12–18 at 5–12, 16–24 at 13–20.
  One themed light kind per horde. Connected placement retains stable member IDs.
- `game/hordes.js` rallies the whole group on sight or damage, even a killed scout.
  Reactions vary by up to 0.35 s; species AI uses different flank approaches.
  Loss of a reachable target for 1.5 s regroups survivors. Committed attacks finish.
- Swarm profiles have 60% HP, 55% damage, 115% movement speed and lighter knockback.
  At most three attacks overlap, with 0.18 s between starts. These are initial
  playtest numbers, not a final balance claim.
- XP/coins/drop odds are reduced to fit the replaced room's expected XP budget,
  capped at normal per-member rewards. Life on hit uses the same reward factor.
  An eligible preceding room has half its normal population. Health labels/bars
  on swarm members show only on hover, keeping the crowd readable.
- Existing run kill IDs and visit/death rollback apply. There is no extra clear
  payout, reinforcement timer or persistence system.

Try `http://localhost:8000/?seed=123&dev=1`, then **H** for this depth's horde.
Console: `await __game.goHorde(1)` (12 snakes for seed 123), `goHorde(11)` (18 spiders),
`goHorde(19)` (24 enemies). Deeper tests need appropriate equipment/player stats;
teleporting does not grant levels or gear. Reload to regenerate an existing world.

Checks: `npm test`; browser:
`await (await import('./tests/browser/hordes.js')).runHordeChecks()`.
The browser check covers depths 0, 1, 11, 19 and 20, real movement/attacks,
worker cloning, models, partial clears and death rollback. The eight-seed balance
simulation still reaches depth 10 at level 12 and the core at level 22.

The remaining sections describe the design direction, including deferred features.

## Goal

Every depth should contain bursts of numerous enemies that attack together, not
just scattered enemies fought one at a time. Keep contrast: exploration and small
skirmishes → a sudden rush → breathing room. Hordes are ordinary encounters, not
another mandatory guardian gate, and not a constant stream of reinforcements.

The ordinary population system already makes packs, especially in spider nests.
But pack membership disappears after placement, each enemy acquires the player
independently, and small packs can be distributed across unrelated floors.
Increasing roster counts alone would make this denser, not reliably more exciting.
Guardian rooms already coordinate defenders; preserve their separate behaviour.

## Pacing across a layer

Plan encounters over the layer's route, rather than independently rolling a horde
in every cube:

- One guaranteed wild pack in an ordinary main-route cube at every depth, including the core.
  On depth 0 it is beyond the town, the rock past its gate and the room after it.
- On longer routes (10+ rooms), consider a second horde; optional branches may
  contain a bonus horde. Initial limit: three per layer, including branches.
- Never assign hordes to safe rooms, arrival rooms or guardian arenas. Do not put
  packs in two consecutive cubes. Prefer a quieter room before a guardian, but do
  not make that a hard constraint on short routes.
- Cubes with a wild pack replace their normal scattered population. Nearby quiet rooms get
  fewer enemies; redistribute the layer's combat budget instead of multiplying it.
- Use a separate seeded planning stream. Fix encounter identities before terrain
  retries, prefetched cube generation or player exploration order can affect them.

A representative route is: arrival → skirmish → quiet traversal → horde → recovery
→ side guardian → exploration → descent guardian. Actual routes vary in length
and have one or two side guardians; this is a rhythm, not a fixed room sequence.

## What a horde feels like

A recognizable concentration of creatures occupies a den, clearing or chamber.
Approaching it or hitting a member raises a **local group alarm**. The whole group
then converges on the player, including members outside individual sight/aggro
range, provided they have a valid walkable path inside the encounter's bounds.

- Initial target: 6–8 light enemies on the road, 8–12 at depths 1–4, 12–18 at
  depths 5–12, and 16–24 at depths 13–20. These are playtest targets, not tuned counts.
- Most should be visibly advancing within about a second of activation. Small
  seeded reaction offsets prevent identical animations without making a queue
  of individual enemies. Stagger the rush from nearby parts of the same space,
  not from isolated shelves the player must visit one by one.
- First version: all members exist before activation. No spawning behind the
  player, endless timers, or reinforcements appearing in a cleared room.
- No new exit lock. The player may fight, retreat, or run past. Enemies remain
  cube-local, as today; persistent kills must prevent portal hopping from farming
  the same members. Portal transitions are not cross-room horde pursuit.
- On disengagement, surviving members regroup at the den. Re-engaging alarms
  those survivors, never recreates defeated members or pays a second clear reward.

## Theme and composition

Use numerous light melee creatures as the body of a horde, even on depths whose
ordinary roster is dominated by heavies. Do not make twenty full-strength Stunders
or a wall of shooters just to keep every depth's horde thematic.

| Depth / setting | Horde body | Possible support, after the first prototype |
|---|---|---|
| 0–2 meadows | Grass snakes; spiders from depth 2 | At most one Stunder |
| 3 snowy peaks | Frost spiders | One Frost stunder |
| 4 badlands | Sand vipers / spiders | One Stone stunder |
| 5–6 canyon | Sand vipers / spiders | One Stone stunder or a Wolk |
| 7–8 roots | Spiders | One Stunder |
| 9–10 ice caves, grotto | Frost spiders / Frost adders | One or two Octonauts or a Shraps |
| 11–12 swamp, hive | Bog spiders / Venom adders | One Bog octonaut |
| 13 cenote | Venom adders / Blood vipers | One Coral octonaut |
| 14–15 nests, ossuary | Dense spider nursery, some Redbacks | Occasional heavy |
| 16 mines, forge | Spiders among crystal workings | One Triangle or Stone stunder |
| 17 ruins | Blood vipers / Shadow mambas | One Triangle or Octonaut |
| 18 volcanic | Redbacks / Shadow mambas | One or two Fire-cats |
| 19–20 abyss/core | Redbacks / Shadow mambas | One Fire-face or Triangle |

A horde mostly draws one kind, with small variation later. Cap ranged support at
one per encounter initially; add at most one or two heavy supports, replacing
part of the light-enemy budget rather than simply adding them.

## Combat: threatening, but satisfying to cut through

The player's existing sword arcs, piercing bolts and spell bursts already support
crowd combat. Hordes should make these properties useful without making a basic
bow or short sword an invalid loadout.

- Prefer enemies killed in one ordinary hit with depth-appropriate equipment.
  Prototype existing light kinds first. If necessary, use an explicit swarm
  combat/reward modifier, not a lower enemy level: depth still determines level.
- Tune damage for a pack, not for twelve independent duels. If many bites land
  together, the current short flinch can prevent movement until death. Prototype
  reduced swarm damage and a group attack-start budget (initially up to three
  concurrent melee wind-ups). Several enemies still rush and attack together;
  this must not reduce the encounter to one designated attacker at a time.
- Attack coordination must never cancel a committed wind-up or remove telegraphs.
  Test rapid flinches explicitly; only add short swarm-hit flinch protection if
  attack pacing alone does not allow reliable movement between hits.
- Crowd separation and reachable flank destinations should produce a front and
  pressure from the sides, not a stack of bodies targeting the exact same point.
- Preserve space to fight and retreat. Packs do not spawn on narrow bridges or
  entry pads. The surrounding natural terrain may include fluid edges, stairs,
  ladders or jumps; the group itself must share connected dry floors. Keep some
  manoeuvring space and a usable onward path rather than enclosing every pack
  in protective arena rails. Tune knockback around natural hazards in playtests.
- Read the encounter through bodies, movement and sound, not twenty health bars
  or individual point lights. Keep ordinary hover targeting and shared effects.

## Geometry and generation contract

Reserve a dry connected combat footprint and approach before scatter/blockers.
A horde does not require a perfectly flat guardian arena: a broad clearing,
looping chamber or stepped terrace works if members can converge without jumps.
All spawn sites must be mutually connected through species-valid navigation,
not merely close in Euclidean space. Keep portal and reward interaction space free.

The generator emits `map.horde = { id, kind, count, anchor, floor, radius, layer,
cells, spawnFloors, entryFloor, exitFloor, wild }`. Local floors are tagged
`hordeReserved` / `hordeSpawn`, independently of guardian `f.encounter` floors.
The footprint scales to the pack and may rotate to fit a riverbank or terrace.
Retries vary placement, not group/member identity. Derive member IDs from encounter
ID and member slot, not from whatever floor a terrain retry happens to choose.
Carry group IDs into the live enemy records and keep alarm/attack coordination
at group level; species AI still owns movement and each committed attack.

If a terrain attempt cannot fit the full crowd or connect the approach/return,
retry ordinary generation within its existing bound. Never silently shrink the
pack or substitute an arena. Validate final clearance and links with the same
worker-safe floor-navigation rules the live enemies use (`physics/floornav.js`).
Sampling 100 seeds × all 21 depths produced all 2,100 requested packs (at most
32 terrain attempts); 1,992 of those cubes retained fluids elsewhere. Half the
packs were on upper layers, rather than forcing every approach to ground level.

## Rewards and persistence

More bodies must not mean runaway XP, potions, weapons or life-on-hit healing.
Keep total expected layer XP and loot near the current balance targets; measure
full and partial clears. If swarm modifiers are needed, scale HP/damage and
XP/coins/drop odds deliberately, and account for per-target healing as well.

Initially use ordinary per-member rewards, adjusted to the encounter budget.
No extra chest is required; a horde can defend an existing reward site without
occupying its anchor or interaction approach. Keep reward prestige independent
of encounter difficulty. A one-off clear payout can be considered later, only
with run-persistent claiming and existing death/visit rollback semantics.

Member kills follow the game's current ordinary-enemy persistence and death
rollback rules. Group alarm is transient; revisits reconstruct survivors from
stable member IDs. Do not introduce a separate reset or reward-farming path.

## First implementation slice and checks

1. Add seeded layer-level horde planning and connected spawn reservations. Guarantee
   one on each main route; defer bonus encounters and heavy/ranged support.
2. Preserve group IDs, add local alarm/rally and bounded group pursuit to the shared
   AI. Keep guardian defence untouched.
3. Playtest 8 snakes at depth 1, 16 spiders at depth 11 and 20 Redbacks at depth 19
   using basic bow, sword, crossbow and staff loadouts. Tune damage, flinches,
   separation, convergence and attack overlap before introducing support enemies.
4. Rebalance nearby ambient populations and rewards using the real encounter
   tables in `tools/balance.mjs` and `tools/depth-population.mjs`.

Acceptance: seeded coverage of every depth including the safe surface prefix;
non-consecutive placement; connected safe floors and retreat; group activation
without waking the entire cube; simultaneous pressure without unavoidable
stunlock; stable survivor IDs across regeneration/revisits/death; no duplicate
rewards; unchanged guardian gates. Measure actual simultaneous pursuers/attackers,
not just spawn totals. Profile pathfinding, pairwise crowd collision, animated
models and effects at the target crowd size before raising the cap.

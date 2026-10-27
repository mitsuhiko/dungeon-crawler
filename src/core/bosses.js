// The real bosses: each takes the place of one depth's descent guardian (the others stay boss
// placeholders, docs/guardians.md). depth -> the boss's kind (core/enemies.js BOSS_PROFILES):
// Gusto on the road out of town, Totnar a depth below, Squarlo below him, Flip below Squarlo,
// Foggery below Flip, Renew below Foggery, Mansk below Renew (the last of act I); Monteur below Mansk, the first of act II (depth 7);
// Slomo at the bottom of act II (depth 13), where the slime
// marsh comes in the worlds that show it (it is the act's last theme), else whatever theme is there;
// Qualmos at the core (depth 20), the end of the world: there is no descent there, he guards its
// last cube, the final arena, with no way on (world/layout.js `final`, cubegen/guardian.js).
// The layout marks that arena's guardian with `boss` (world/layout.js, cubegen/guardian.js); its
// spawn is the boss alone (game/enemyspawn.js guardianSpots), with no defenders. docs/bosses.md.
export const BOSSES = Object.freeze({ 0: 'gusto', 1: 'totnar', 2: 'squarlo', 3: 'flip', 4: 'foggery', 5: 'renew', 6: 'mansk', 7: 'monteur', 13: 'slomo', 20: 'qualmos' });
export const bossAt = (depth, role = 'descent') => role === 'descent' ? BOSSES[depth] ?? null : null;
// How a boss's arena differs from its planned one (cubegen/guardian.js, cubegen/arenaprops.js):
// `braziers` lit round the fight zone, for a boss who makes it dark (Totnar; Renew, whose fight
// goes from dusk into night, in the arena his depth would have anyway; Qualmos, down in the dark
// core); a `type` of its
// own (cubegen/arenashapes.js BOSS_SHAPES): Squarlo's tidal hills, where his tide comes and goes;
// Flip's box (cubegen/fliparena.js), which he turns any side up; Foggery's caldera of lava with
// his tower in the middle (cubegen/towerarena.js): its doorway stands `door` levels up, in the
// middle of its face (`centre`, world/faces.js), so you come in on a bridge over the lava.
// An arena of its own looks like the theme of its depth (its floors name their `surface`,
// themes/surfaces.js; docs/bosses.md "An arena of its own"); `props`: prop sets whose small
// things it strews about besides its theme's (Foggery's volcanic rocks by his lava, Slomo's goo and
// craters in his slime bowl, cubegen/arenashapes.js `bowl`, which his slime floods). `night`: his
// arena is always at night, whatever the time of day (game/daycycle.js: Slomo's meteorites fall).
// Mansk's `stage`: a museum hall with a stage at its end (cubegen/arenashapes.js), dressed with the
// museum's things (`props`: paintings, pedestals, glass cases, a curtain, footlights).
// `days`: his arena has the world's days and nights under its theme's sky like any cube (Gusto's);
// the others stay at noon, the light being their fight's (Totnar's darkness, Squarlo's mist,
// Flip's void, Renew's dusk).
export const BOSS_ARENAS = Object.freeze({ gusto: { days: true }, totnar: { braziers: 5 }, squarlo: { type: 'tidal' }, flip: { type: 'flip' },
  foggery: { type: 'tower', door: 8, centre: 7, props: ['volcanic'] }, renew: { braziers: 4 },
  slomo: { type: 'bowl', props: ['slime'], night: true }, mansk: { type: 'stage', props: ['museum'] },
  qualmos: { braziers: 6 } });

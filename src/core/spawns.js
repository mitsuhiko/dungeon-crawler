// Which enemies live at each depth and how many. docs/depths.md explains the plan.
// Each cube draws its population from its depth's row with its own seeded stream, so the
// terrain and the per-species placement streams (game/enemyspawn.js) are unaffected.
//   roster: [species, chance, lo, hi, pack, kinds]
//     chance: that the species is in a cube at all (1: always, unless `mix` cuts it)
//     lo..hi: how many when it is; pack: the largest group it spawns in (1: on its own). A
//       species with a `troop` (the Flimmers: three) comes in groups of exactly that many: its
//       count is rounded to whole troops (at least one), and each pack is one troop
//       (game/enemyspawn.js)
//     kinds: which of the species' kinds (ENEMY_KINDS in core/enemies.js) and how often, as
//       { kind: weight }; each pack draws one (game/enemyspawn.js). Default: the species itself.
//       Stronger kinds take over deeper down, and each theme leans on the kinds that suit it: a
//       species' kinds take turns down the depths, so that each turns up about as often as the
//       others (tools/palette.html measures it), each where its look and name fit.
//     where: the themes (map.biome, the theme's prop set) the species lives in, if not all of the
//       depth's (the Squirtles keep to the fluids, each kind to its own: the blue ones to the water
//       of the lagoons, the sunken grotto and the cenote, the Moss ones to the slime marsh's acid,
//       the Coral ones to the lava of the volcanic caves and the abyss; the Slugs and the Bolimes to
//       the slime marsh; the Gloom spiders and the Lantern-faces to the dark forest), at every depth
//       of its theme's act (themes/index.js ACTS: a theme may appear anywhere in its act); '!theme':
//       everywhere but there (the dark forest has spiders of its own). An entry that does not live
//       in a cube's theme takes no draw from its stream: a species added to some themes (the Moose)
//       leaves the other themes' cubes as they were. A fluid dweller (the
//       Squirtles) is only put down in its fluid (game/enemyspawn.js): a cube without any has none.
//   mix: the most species one cube holds. If more roll present, the extra ones are dropped:
//     always-present species are kept first, the others in a random order weighted by chance.
//   The lead: one present species (picked by chance) dominates the cube. It draws its count
//     from the top half of its range, every other species from the bottom half.
// Ranged species (Fire-face, Triangle, Shraps, Spicy, Wolla, Wolk, Squirtle, Tornado, Slug) stay at a few per cube; the melee ones, the spiders
// above all, come in larger and larger packs further down.
import { mulberry32, hash32 } from './util.js';
import { ENEMY_KINDS, STAGE_PROFILES } from './enemies.js';

export const D = (mix, ...roster) => ({ mix, roster: roster.map(([type, chance, lo, hi, pack = 1, kinds = { [type]: 1 }, where = null]) =>
  ({ type, chance, lo, hi, pack, kinds, where })) });

// who waits at the foot of the beginning's rock, in front of his first glass (docs/story.md "The
// beginning"): the hero's first fight (game/enemyspawn.js firstGlassSpots)
export const FIRST_GLASS = { type: 'snake', count: 3 };

export const DEPTH_SPAWNS = [
  /*  0 road out of town */ D(1, ['snake', 1, 1, 2]),
  /*  1 act I */ D(2, ['snake', 1, 2, 4], ['stunder', .2, 1, 1], ['wolk', .25, 1, 1],
    ['squirtle', .6, 1, 2, 1, { squirtle: 1 }, ['lagoon']],
    ['spider', .7, 2, 4, 2, { gloomspider: 1 }, ['darkforest']], ['fireface', .3, 1, 1, 1, { lanternface: 1 }, ['darkforest']]),
  /*  2 act I */ D(3, ['snake', 1, 2, 5, 1, { snake: 3, sandviper: 1 }], ['spider', .6, 2, 4, 2, { spider: 1 }, ['!darkforest']],
    ['stunder', .25, 1, 1], ['wolk', .35, 1, 2], ['tornado', .3, 1, 1], ['squirtle', .6, 1, 3, 1, { squirtle: 1 }, ['lagoon']], ['flimmer', .35, 3, 3, 3],
    ['spider', .8, 3, 5, 2, { gloomspider: 3, spider: 1 }, ['darkforest']], ['fireface', .4, 1, 2, 1, { lanternface: 1 }, ['darkforest']],
    ['moose', .4, 2, 2, 2, { moose: 1 }, ['darkforest', 'highlands']], ['moose', .4, 2, 2, 2, { frostmoose: 1 }, ['peaks']]),
  /*  3 act I */ D(3, ['spider', 1, 8, 14, 3, { frostspider: 1 }, ['!darkforest']], ['stunder', .7, 1, 2, 1, { froststunder: 1 }],
    ['shraps', .3, 1, 1], ['wolk', .5, 1, 2, 1, { stormwolk: 2, wolk: 1 }], ['snake', .7, 2, 4, 2, { frostadder: 1 }], ['triangle', .2, 1, 1],
    ['tornado', .35, 1, 2, 1, { frosttornado: 2, tornado: 1 }], ['squirtle', .6, 1, 3, 1, { squirtle: 1 }, ['lagoon']],
    ['flimmer', .45, 3, 3, 3, { frostflimmer: 1 }],
    ['spider', .8, 4, 6, 2, { gloomspider: 2, spider: 1 }, ['darkforest']], ['fireface', .4, 1, 2, 1, { lanternface: 1 }, ['darkforest']],
    ['moose', .45, 2, 3, 3, { moose: 1 }, ['darkforest', 'highlands']], ['moose', .5, 2, 3, 3, { frostmoose: 1 }, ['peaks']]),
  /*  4 act I */ D(3, ['snake', 1, 3, 6, 2, { sandviper: 1 }], ['spider', .8, 4, 8, 3, { spider: 2, redback: .5 }, ['!darkforest']],
    ['stunder', .6, 1, 2, 1, { stonestunder: 1, stunder: 1 }], ['wolk', .5, 1, 2, 1, { dustwolk: 1 }],
    ['tornado', .4, 1, 2, 1, { dusttornado: 2, tornado: 1 }], ['squirtle', .6, 2, 3, 2, { squirtle: 1 }, ['lagoon']],
    ['flimmer', .45, 3, 6, 3, { hazeflimmer: 2, flimmer: 1 }, ['!darkforest']], ['flimmer', .35, 3, 3, 3, { shadowflimmer: 1 }, ['darkforest']],
    ['spider', .8, 4, 7, 3, { gloomspider: 2, spider: 1 }, ['darkforest']], ['fireface', .45, 1, 2, 1, { lanternface: 1 }, ['darkforest']],
    ['moose', .5, 2, 3, 3, { moose: 1 }, ['darkforest', 'highlands']], ['moose', .5, 2, 3, 3, { frostmoose: 1 }, ['peaks']]),
  /*  5 act I */ D(3, ['snake', 1, 4, 7, 2, { sandviper: 1 }], ['spider', .8, 5, 9, 3, { spider: 2, redback: .5 }, ['!darkforest']],
    ['stunder', .6, 1, 2, 1, { stonestunder: 1, stunder: 1 }], ['wolk', .4, 1, 2, 1, { dustwolk: 1, stormwolk: 1 }], ['wolla', .3, 1, 2],
    ['tornado', .35, 1, 2, 1, { dusttornado: 1, tornado: 1 }], ['squirtle', .6, 2, 3, 2, { squirtle: 1 }, ['lagoon']],
    ['flimmer', .45, 3, 6, 3, { hazeflimmer: 2, flimmer: 1 }, ['!darkforest']], ['flimmer', .35, 3, 3, 3, { shadowflimmer: 1 }, ['darkforest']],
    ['spider', .8, 5, 8, 3, { gloomspider: 2, spider: 1 }, ['darkforest']], ['fireface', .5, 1, 2, 1, { lanternface: 1 }, ['darkforest']],
    ['moose', .5, 2, 4, 3, { moose: 1 }, ['darkforest', 'highlands']], ['moose', .5, 2, 4, 3, { frostmoose: 1 }, ['peaks']]),
  /*  6 act I */ D(3, ['snake', 1, 5, 8, 2, { sandviper: 1, bloodviper: 1 }], ['spider', .8, 6, 10, 3, { spider: 2, redback: 1 }, ['!darkforest']],
    ['stunder', .6, 1, 3, 1, { stonestunder: 1, stunder: 1 }], ['wolk', .4, 1, 2, 1, { dustwolk: 1, stormwolk: 1 }], ['wolla', .35, 1, 2],
    ['octonaut', .15, 1, 1], ['mecked', .15, 1, 1], ['tornado', .3, 1, 2, 1, { dusttornado: 1 }], ['squirtle', .6, 2, 4, 2, { squirtle: 1 }, ['lagoon']],
    ['flimmer', .4, 3, 6, 3, { hazeflimmer: 1 }, ['!darkforest']], ['flimmer', .35, 3, 3, 3, { shadowflimmer: 1 }, ['darkforest']],
    ['spider', .8, 5, 9, 3, { gloomspider: 2, spider: 1 }, ['darkforest']], ['fireface', .5, 1, 2, 1, { lanternface: 1 }, ['darkforest']],
    ['moose', .55, 2, 4, 3, { moose: 1 }, ['darkforest', 'highlands']], ['moose', .55, 2, 4, 3, { frostmoose: 1 }, ['peaks']]),
  /*  7 act II */ D(3, ['spider', 1, 7, 12, 3, { spider: 2, bogspider: 1 }], ['snake', .8, 4, 7, 2, { snake: 1, bloodviper: 1 }],
    ['stunder', .6, 1, 2, 1, { stunder: 1 }], ['mecked', .5, 1, 2], ['wolla', .4, 1, 2], ['octonaut', .2, 1, 1],
    ['squirtle', .7, 2, 3, 2, { squirtle: 1 }, ['grotto', 'cenote']], ['slug', .9, 1, 3, 1, { spottedslug: 2, blackslug: 2, slug: 1 }, ['slime']],
    ['bolime', .95, 2, 3, 2, { toxicbolime: 2, glowbolime: 2, bolime: 1 }, ['slime']], ['squirtle', .5, 1, 3, 2, { toxicsquirtle: 1 }, ['slime']],
    ['moose', .45, 2, 3, 3, { frostmoose: 1 }, ['frozen']], ['moose', .45, 2, 3, 3, { bogmoose: 1 }, ['swamp']], ['moose', .2, 2, 2, 2, { bogmoose: 1 }, ['slime']]),
  /*  8 act II */ D(3, ['spider', 1, 8, 13, 3, { spider: 2, bogspider: 1, redback: .5 }], ['snake', .8, 4, 8, 2, { bloodviper: 1 }],
    ['stunder', .6, 1, 3, 1, { stunder: 1, stonestunder: 1 }], ['mecked', .6, 1, 3, 2], ['wolla', .45, 1, 2], ['octonaut', .25, 1, 2],
    ['squirtle', .7, 2, 3, 2, { squirtle: 1 }, ['grotto', 'cenote']], ['slug', .9, 1, 3, 1, { spottedslug: 2, blackslug: 2, slug: 1 }, ['slime']],
    ['bolime', .95, 2, 3, 2, { toxicbolime: 2, glowbolime: 2, bolime: 1 }, ['slime']], ['squirtle', .5, 1, 3, 2, { toxicsquirtle: 1 }, ['slime']],
    ['moose', .5, 2, 3, 3, { frostmoose: 1 }, ['frozen']], ['moose', .5, 2, 3, 3, { bogmoose: 1 }, ['swamp']], ['moose', .2, 2, 2, 2, { bogmoose: 1 }, ['slime']]),
  /*  9 act II */ D(3, ['octonaut', 1, 3, 4], ['shraps', .8, 1, 3], ['spider', .8, 6, 10, 3, { frostspider: 1 }],
    ['stunder', .7, 1, 2, 1, { froststunder: 1 }], ['snake', .8, 3, 5, 2, { frostadder: 1 }], ['mecked', .6, 1, 2, 1, { frostmecked: 1 }],
    ['tornado', .25, 1, 1, 1, { frosttornado: 1 }], ['squirtle', .8, 2, 4, 2, { squirtle: 1 }, ['grotto', 'cenote']],
    ['slug', .9, 1, 3, 1, { spottedslug: 2, blackslug: 2, slug: 1 }, ['slime']],
    ['bolime', .95, 2, 3, 2, { toxicbolime: 2, glowbolime: 2, bolime: 1 }, ['slime']], ['squirtle', .5, 1, 3, 2, { toxicsquirtle: 1 }, ['slime']],
    ['moose', .5, 2, 3, 3, { frostmoose: 1 }, ['frozen']], ['moose', .5, 2, 3, 3, { bogmoose: 1 }, ['swamp']], ['moose', .2, 2, 2, 2, { bogmoose: 1 }, ['slime']]),
  /* 10 act II */ D(3, ['octonaut', 1, 3, 5, 2, { octonaut: 3, coraloctonaut: 1 }], ['shraps', .9, 2, 3],
    ['spider', .8, 7, 12, 4, { frostspider: 1 }], ['stunder', .7, 1, 2, 1, { froststunder: 1 }],
    ['snake', .7, 3, 5, 2, { frostadder: 1 }], ['triangle', .15, 1, 1], ['mecked', .65, 1, 2, 1, { frostmecked: 1 }],
    ['tornado', .3, 1, 2, 1, { frosttornado: 1 }],
    ['squirtle', .8, 2, 4, 2, { squirtle: 1 }, ['grotto', 'cenote']], ['slug', .9, 2, 3, 1, { blackslug: 2, spottedslug: 1 }, ['slime']],
    ['bolime', .95, 2, 4, 2, { glowbolime: 2, toxicbolime: 1 }, ['slime']], ['squirtle', .5, 1, 3, 2, { toxicsquirtle: 1 }, ['slime']],
    ['moose', .55, 2, 4, 3, { frostmoose: 1 }, ['frozen']], ['moose', .55, 2, 4, 3, { bogmoose: 1 }, ['swamp']], ['moose', .2, 2, 2, 2, { bogmoose: 1 }, ['slime']]),
  /* 11 act II */ D(3, ['snake', 1, 6, 10, 3, { venomadder: 1 }], ['octonaut', .8, 2, 4, 2, { bogoctonaut: 3, octonaut: 1 }],
    ['spicy', .6, 1, 2, 1, { spicy: 1, habanero: 1 }], ['wolla', .4, 1, 2, 1, { bogwolla: 1 }],
    ['spider', .6, 6, 10, 4, { bogspider: 1 }], ['mecked', .5, 1, 2, 1, { bogmecked: 1 }], ['stunder', .25, 1, 2],
    ['fireface', .3, 1, 1, 1, { blazeface: 1 }], ['squirtle', .8, 2, 4, 2, { squirtle: 1 }, ['grotto', 'cenote']],
    ['slug', .9, 2, 3, 1, { blackslug: 2, spottedslug: 1 }, ['slime']],
    ['bolime', .95, 2, 4, 2, { glowbolime: 2, toxicbolime: 1 }, ['slime']], ['squirtle', .5, 1, 3, 2, { toxicsquirtle: 1 }, ['slime']],
    ['moose', .55, 2, 4, 3, { frostmoose: 1 }, ['frozen']], ['moose', .55, 2, 4, 3, { bogmoose: 1 }, ['swamp']], ['moose', .2, 2, 2, 2, { bogmoose: 1 }, ['slime']]),
  /* 12 act II */ D(3, ['snake', 1, 7, 12, 3, { venomadder: 2, bloodviper: 1 }], ['octonaut', .8, 3, 5, 2, { bogoctonaut: 3, octonaut: 1 }],
    ['spicy', .8, 1, 3, 1, { spicy: 1, habanero: 1 }], ['wolla', .5, 1, 2, 1, { bogwolla: 1 }],
    ['spider', .6, 8, 12, 4, { bogspider: 1 }], ['mecked', .55, 1, 3, 2, { bogmecked: 1 }], ['fireface', .3, 1, 1, 1, { blazeface: 1 }],
    ['squirtle', .8, 2, 4, 2, { squirtle: 1 }, ['grotto', 'cenote']], ['slug', .9, 2, 3, 1, { blackslug: 2, spottedslug: 1 }, ['slime']],
    ['bolime', .95, 2, 4, 2, { glowbolime: 2, toxicbolime: 1 }, ['slime']], ['squirtle', .5, 1, 3, 2, { toxicsquirtle: 1 }, ['slime']],
    ['moose', .55, 2, 4, 3, { frostmoose: 1 }, ['frozen']], ['moose', .55, 2, 4, 3, { bogmoose: 1 }, ['swamp']], ['moose', .2, 2, 2, 2, { bogmoose: 1 }, ['slime']]),
  /* 13 act II */ D(3, ['snake', 1, 8, 12, 3, { venomadder: 1, bloodviper: 1 }], ['octonaut', .8, 3, 5, 2, { coraloctonaut: 2, bogoctonaut: 1 }],
    ['spicy', .6, 1, 2, 1, { habanero: 1, spicy: 1 }], ['triangle', .4, 1, 2, 1, { emeraldtriangle: 1 }],
    ['wolla', .3, 1, 2, 1, { bogwolla: 1, stormwolla: 1 }], ['spider', .3, 10, 14, 4, { bogspider: 1, redback: 1 }],
    ['mecked', .5, 1, 2, 1, { bogmecked: 1 }], ['squirtle', .8, 2, 4, 2, { squirtle: 1 }, ['grotto', 'cenote']],
    ['slug', .9, 2, 3, 1, { blackslug: 2, spottedslug: 1 }, ['slime']],
    ['bolime', .95, 2, 4, 2, { glowbolime: 2, toxicbolime: 1 }, ['slime']], ['squirtle', .5, 1, 3, 2, { toxicsquirtle: 1 }, ['slime']],
    ['moose', .55, 2, 4, 3, { frostmoose: 1 }, ['frozen']], ['moose', .55, 2, 4, 3, { bogmoose: 1 }, ['swamp']], ['moose', .2, 2, 2, 2, { bogmoose: 1 }, ['slime']]),
  /* 14 act III */ D(3, ['spider', 1, 18, 26, 6, { redback: 1, bogspider: 1 }], ['stunder', .5, 1, 2, 1, { stonestunder: 1 }],
    ['octonaut', .3, 1, 2, 1, { octonaut: 1, coraloctonaut: 1 }], ['snake', .4, 4, 6, 3, { venomadder: 1, shadowmamba: 1 }],
    ['spicy', .5, 1, 2, 1, { nightshade: 1 }], ['mecked', .45, 1, 2, 1, { bonemecked: 1 }], ['wolla', .3, 1, 2, 1, { stormwolla: 1 }],
    ['squirtle', .7, 1, 3, 2, { lavasquirtle: 1 }, ['volcanic', 'abyss']]),
  /* 15 act III */ D(3, ['spider', 1, 20, 28, 7, { redback: 1, spider: 1 }], ['stunder', .6, 1, 3, 1, { stonestunder: 1 }],
    ['octonaut', .4, 1, 2, 1, { coraloctonaut: 1 }], ['spicy', .6, 1, 2, 1, { nightshade: 1 }],
    ['snake', .6, 4, 6, 3, { shadowmamba: 1 }], ['mecked', .5, 1, 3, 2, { bonemecked: 1 }], ['triangle', .15, 1, 1],
    ['squirtle', .7, 1, 3, 2, { lavasquirtle: 1 }, ['volcanic', 'abyss']]),
  /* 16 act III */ D(3, ['triangle', 1, 2, 3, 1, { triangle: 2, emeraldtriangle: 1 }], ['stunder', .7, 1, 3, 1, { stonestunder: 1 }],
    ['octonaut', .7, 2, 5, 2, { octonaut: 1, coraloctonaut: 1 }], ['wolla', .5, 1, 3, 1, { stormwolla: 1 }],
    ['spider', .5, 10, 14, 4, { frostspider: 1, redback: 1 }], ['shraps', .7, 1, 2, 1, { amethystshraps: 1 }],
    ['firecat', .4, 1, 2, 1, { ashcat: 1 }],
    ['squirtle', .7, 1, 3, 2, { lavasquirtle: 1 }, ['volcanic', 'abyss']]),
  /* 17 act III */ D(3, ['triangle', .8, 1, 3, 1, { triangle: 1, emeraldtriangle: 1, crimsontriangle: 1 }], ['octonaut', .8, 3, 6, 2, { coraloctonaut: 2, bogoctonaut: 1 }],
    ['snake', .6, 10, 14, 4, { shadowmamba: 1 }], ['firecat', .5, 2, 3, 2, { ashcat: 1, firecat: 1 }],
    ['spider', .4, 10, 16, 5, { redback: 1 }], ['shraps', .5, 1, 2, 1, { amethystshraps: 1 }], ['wolla', .3, 1, 2, 1, { stormwolla: 1 }],
    ['squirtle', .7, 1, 3, 2, { lavasquirtle: 1 }, ['volcanic', 'abyss']]),
  /* 18 act III */ D(4, ['fireface', 1, 1, 3], ['firecat', 1, 3, 5, 2, { firecat: 1, ashcat: 1 }], ['shraps', .8, 1, 3, 1, { fireshraps: 1 }],
    ['stunder', .8, 1, 3, 1, { magmastunder: 1 }], ['snake', .6, 10, 14, 4, { shadowmamba: 1 }],
    ['wolla', .5, 1, 2, 1, { emberwolla: 1 }], ['tornado', .4, 1, 2, 1, { firetornado: 1 }], ['spider', .25, 14, 20, 6, { redback: 1 }],
    ['squirtle', .7, 1, 3, 2, { lavasquirtle: 1 }, ['volcanic', 'abyss']]),
  /* 19 act III */ D(3, ['fireface', 1, 2, 3, 1, { fireface: 1, blazeface: 1 }], ['firecat', 1, 5, 8, 3, { firecat: 1, voidcat: 1 }],
    ['shraps', .6, 1, 2, 1, { fireshraps: 1 }], ['triangle', .6, 1, 2, 1, { crimsontriangle: 1 }],
    ['wolla', .5, 1, 2, 1, { emberwolla: 1 }], ['stunder', .7, 1, 2, 1, { magmastunder: 1 }], ['tornado', .35, 1, 1, 1, { firetornado: 1 }],
    ['squirtle', .7, 1, 3, 2, { lavasquirtle: 1 }, ['volcanic', 'abyss']]),
  /* 20 the core */ D(4, ['firecat', 1, 5, 9, 3, { voidcat: 1 }], ['fireface', 1, 2, 4, 1, { wispface: 1 }],
    ['triangle', .8, 2, 3, 1, { crimsontriangle: 1, triangle: 1 }], ['stunder', .7, 2, 3, 1, { magmastunder: 1 }],
    ['wolla', .4, 1, 2, 1, { emberwolla: 1 }], ['spider', .3, 18, 26, 8, { redback: 1 }]),
];
// does a roster entry's species live in a theme (map.biome)? (`where`, above)
export const livesIn = (e, biome) => !e.where
  || (e.where.every(w => w.startsWith('!')) ? !e.where.includes('!' + biome) : e.where.includes(biome));
export const spawnsAt = depth => DEPTH_SPAWNS[Math.min(DEPTH_SPAWNS.length - 1, Math.max(0, depth | 0))];

const SALT = 0x3e1a5c7;
// the cube's population: species -> { count, pack, lead, kinds }; species not in it are absent.
// map.spawns (a row like the ones above) replaces the depth's row, for test arenas.
export function population(map) {
  if (map.enemyFree) return new Map();
  // a boss's arena (core/bosses.js): the boss alone; `also`: the kinds it brings along (its
  // minions, summoned or come to life where its projectiles land, in any of its stages)
  const boss = map.guardian?.boss && ENEMY_KINDS[map.guardian.boss];
  if (boss) return new Map([[boss.species, { count: 1, pack: 1, lead: true, kinds: { [boss.type]: 1 },
    also: [...new Set([boss, ...STAGE_PROFILES[boss.boss] ?? []].flatMap(p => p.attacks ?? [])
      .flatMap(a => [a.summon?.kind, a.summon?.also, a.projectile?.becomes].filter(Boolean)))] }]]);
  if (map.horde) {
    const { kind, count } = map.horde, base = ENEMY_KINDS[kind];
    const ordinary = population({ ...map, horde: null, populationScale: 1 });
    const budget = [...ordinary.values()].reduce((sum, p) => {
      const weights = Object.entries(p.kinds), total = weights.reduce((n, [, w]) => n + w, 0);
      return sum + p.count * weights.reduce((n, [k, w]) => n + ENEMY_KINDS[k].xp * w, 0) / total;
    }, 0);
    return new Map([[base.species, { count, pack: count, lead: true, kinds: { [kind]: 1 },
      swarm: true, rewardScale: Math.min(1, budget / (count * base.xp)) }]]);
  }
  if (map.populationScale === 0) return new Map();   // (nobody: the hunter's room, docs/trials.md `chase`)
  // the beginning's rock (core/intro.js): three grass snakes at its foot, the first fight (FIRST_GLASS)
  if (map.firstGlass) return new Map([[FIRST_GLASS.type, { count: FIRST_GLASS.count, pack: FIRST_GLASS.count, lead: true, kinds: { [FIRST_GLASS.type]: 1 } }]]);
  const R = mulberry32(hash32(map.seed ^ SALT)), row = map.spawns ?? spawnsAt(map.depth || 0);
  const rolled = [];
  for (const e of row.roster) if (livesIn(e, map.biome) && R() < e.chance) rolled.push({ e, key: e.chance >= 1 ? 1 + R() : R() ** (1 / e.chance) });
  let present = rolled.sort((a, b) => b.key - a.key).slice(0, row.mix).map(r => r.e);
  // (none rolled: the first that lives here)
  if (!present.length) present = [row.roster.find(e => livesIn(e, map.biome)) ?? row.roster[0]];
  let w = R() * present.reduce((n, e) => n + e.chance, 0), lead = present[present.length - 1];
  for (const e of present) if ((w -= e.chance) < 0) { lead = e; break; }
  return new Map(present.map(e => {
    const mid = (e.lo + e.hi) / 2, lo = e === lead ? Math.ceil(mid) : e.lo, hi = e === lead ? e.hi : Math.floor(mid);
    const rolledCount = lo + Math.floor(R() * (hi - lo + 1));
    let count = Math.max(1, Math.round(rolledCount * (map.populationScale ?? 1)));
    const troop = ENEMY_KINDS[e.type]?.troop;
    if (troop) count = Math.max(1, Math.round(count / troop)) * troop;
    return [e.type, { count: count * (map.guardian ? 2 : 1), pack: e.pack, lead: e === lead, kinds: e.kinds }];
  }));
}

// the kinds a cube's enemies can be: its population's and the kinds its packs draw from (a
// guardian and a horde are of these too, game/enemyspawn.js); their models are loaded and their
// shaders compiled before the cube is entered (render/cubeassets.js)
export function kindsIn(map) {
  const out = new Set();
  for (const [type, spec] of population(map))
    for (const k of [type, ...Object.keys(spec.kinds ?? {}), ...spec.also ?? []]) if (ENEMY_KINDS[k]) out.add(k);
  return [...out];
}
// ... and their species (one model each)
export const speciesIn = map => [...new Set(kindsIn(map).map(k => ENEMY_KINDS[k].species))];

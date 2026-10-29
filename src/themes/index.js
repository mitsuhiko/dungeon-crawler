// What each depth looks like. Every theme belongs to one of the story's three acts (`act`, ACTS:
// their depths) and may appear at any depth of it; each world shows half of each act's themes,
// in their story order down the act (themes/depth.js worldThemes), so two worlds can have cloud
// islands or lagoons under the town, and every theme is as likely to be in a world as any other
// (but one with a `weight`: the slime marsh, in most worlds).
// Palettes, generator settings and the shape of the layout are per theme; the lighting (`light`)
// is blended between the starts of the stretches of depths sharing a theme, so every step down
// is a little darker.
// The light comes in three bands of depths, one per act: light under the sky (0-6), medium in the
// sunlit hollows (7-13: open marshes and works yards under a hazy sky, caves where light falls in
// through cracks, glowing things), dark down in the deep (14-20, only local lights). A night theme
// (`night`: the dark forest) is under the sky in the light band but lit like the deep. Under the
// sky the world's days and nights go round (`sky`, core/daycycle.js, themes/skies.js). Acts I
// and II mix open themes and walled ones (`cave`, `walls`); every theme of act III is walled in.
// A theme's id is its prop set (`props`).
//   act: 1, 2 or 3 (the town's depth, 0, is always TOWN's, the core's, 20, CORE's); `depths`, the
//     first and last depth it may appear at, follows from it
//   weight: how much likelier a world shows it than the rest of its act's themes (1; the act
//     still shows as many themes, the others a little less often: themes/depth.js worldThemes)
//   top / side: colour stops by height in levels (grass tops, cliff strata)
//   fluids: weights [water, lava, acid] for pools and falls; river: fluid of the rivers
//   mud: the share of its pools of water that are mud (cubegen/mudpools.js: water with the look of
//     mud, some with pockets of mud lying round them)
//   soft: the colour of a plunge's soft landing (world/heights.js: hay, sand, snow, moss, web, ash)
//   surfaces: its own colours for built ground by role, any part of any role (themes/surfaces.js:
//     masonry, paving, trim, crust); else made from its structures' stone, its rock and `under`
//   heights: overrides for the big height pieces (world/heights.js heightsOf)
//   tiles: weight multipliers for the WFC kinds; cave: below the ground (no sun, no sky)
//   walls: rock walls along the faces like a cave's, under the open sky (the canyons)
//   void: how much of a cube may be open to the depth below; relief: how tall highlands get
//   arche: weights of the cube archetypes (cubegen/archetypes.js); props: prop set (assets/props/,
//   clutter/, themes/ <set>.glb), propDensity: chance of a prop per floor (0.32)
//   light: sky [top, bottom, haze, tint] (backdrop, see render/sky.js: haze is the nebula's band,
//     tint its patch low on the right; walled-in caves too, faint, with no stars), stars 0..1, hemi [sky, ground, intensity], sun [colour, intensity], fog 0..1,
//     lamp 0..1: how bright the character's own light is (0 under the sky, 1 in the dark deep);
//     night: its light at night (else one made from its sky, themes/skies.js); day: a night
//     theme's by day (a little lighter)
//   sky: what the world's days and nights do here (core/daycycle.js, game/daycycle.js), from the
//     rest unless given: 'open' (under the sky: the sun goes round, its shadows with it), 'hazy'
//     (act II's open themes: the light turns, the sun stays), 'night' (`night`: always night, a
//     little lighter by day), 'none' (`cave`: no days and nights)
//   sunLow: the lowest the sun goes under an open sky, degrees (35; the canyon's walls: higher)
//   music: the song (music/<name>.scrim) that plays here; the town and the core have their own (SONGS)
//   spans: gorge spans (world/spans.js), or null: the chance of any on a depth, at most `max`,
//   the chance of one on the route where it fits, of a lonely island branch and of a span over
//   the sky (no valley); deck: the highest deck level (22; lower under a cave's rock walls)
//   night: under the sky, but dark: lit like the deep (its own lights, the lamp)
//   layers: the chance a cube keeps the upper layers (slabs) the WFC gave it (1; world/wfc.js):
//     fewer floors floating over the ground
//   hills: { count: [min, max], roll }: the round hills a cube's ground gets (1-2) and how much
//     it rolls in between (1) (cubegen/ground.js)
//   vignettes: [min, max] little set pieces a room gets (cubegen/vignettes.js: the set's
//     `vignette` props, an abandoned shed, a stone circle)
//   motes: what drifts in the air round the character (render/motes.js: glowing particles, and a
//     few wisps with lights of their own): { colors, rate, drift, rise, life, size, wisps, wisp }
//   grove: a forest's own props (render/propplace.js grove): trees (bases of its set) in thickets
//     and clearings, density (the most a floor gets one), scale [min, max]; lanterns: the share of
//     the trees with a lantern hanging from a branch; strings: the most strings of lanterns
//   mire: how much its slime holds the feet (core/footing.js mireOf: a speed factor on its slime
//     ground for everyone walking on it, 1 elsewhere)
//   meteors: slime meteorites fall at night (core/meteors.js, game/meteors.js)
//   nightMotes: what drifts in the air at night instead of `motes` (render/motes.js)
//   waylights: lamps beside the way (render/propplace.js waylights): { props, share (of the
//     floors beside it), back (from the floor's middle, 0.36), foot (its collider, 0.06) }
import { WATER, ACID } from '../core/constants.js';
import { SUNLIT_THEMES, DEEP_THEMES, CORE } from './caves.js';
import { BOSS_MUSIC } from '../core/bossmusic.js';

const T = (name, o) => ({ name, tiles: {}, cave: false, spans: null, ...o });

const MEADOW = T('Meadow islands', {
  music: 'overworld',
  props: 'meadow', propDensity: 0.15,
  act: 1, spans: { chance: 0.9, max: 2, route: 0.8, island: 0.6, sky: 0.5 },
  void: 0.5, relief: 0.5,
  arche: { plain: 3, archipelago: 3, spire: 1, mesa: 1, chasm: 1 },
  top: [[0, '#3b6532'], [4, '#4c8a3c'], [8, '#76ad50'], [12, '#a3b26a'], [16, '#b7a888'], [20, '#d9d3c5']],
  side: [[0, '#4e382a'], [6, '#7a5638'], [11, '#7a6d62'], [20, '#9a948c']],
  soft: '#d8c070', lip: '#3f6b2e', under: '#3a2f28', bed: ['#2a2a31', '#23232a'], fluids: [0.85, 0.05, 0.1], river: WATER,
  light: { sky: ['#163640', '#081218', '#4a6966', '#3b3656'], stars: 1, hemi: ['#dfeaff', '#3a3020', 1.1], sun: ['#fff1dd', 2.4], fog: 0 },
  // fireflies at night (the town's meadow too), a few of them bright enough to light the grass
  nightMotes: { colors: ['#e6ff7a', '#fff3a0', '#c8ff70'], rate: 3, drift: 0.18, rise: [-0.04, 0.08], life: [1.5, 3.5], size: [0.025, 0.045],
    wisps: 3, wisp: '#e0ff80' },
});
// cloud kingdom: puffy islands over a lot of open sky
const CLOUDS = T('Cloud kingdom', {
  music: 'overworld',
  props: 'clouds', propDensity: 0.18,
  act: 1, spans: { chance: 0.9, max: 2, route: 0.8, island: 0.6, sky: 0.7 },
  void: 0.62, relief: 0.6,
  arche: { archipelago: 4, plain: 2, spire: 1, mesa: 1 },
  top: [[0, '#b9bfd4'], [4, '#cfd4e4'], [8, '#e0e3ee'], [12, '#ebe6ef'], [16, '#f1edf3'], [20, '#f6f6fa']],
  side: [[0, '#7e84a0'], [6, '#959bb6'], [12, '#acb1c8'], [20, '#c6cadb']],
  soft: '#f6f8fe', lip: '#e2e6f2', under: '#6e7390', bed: ['#2c2e3a', '#25262f'], fluids: [0.95, 0, 0.05], river: WATER,
  tiles: { highland: 1.2, lake: 0.6, river: 0.7, gorge: 0.7 },
  light: { sky: ['#202c58', '#0a0e22', '#646a98', '#56487a'], stars: 1, hemi: ['#eef0ff', '#585a78', 1.2], sun: ['#fff6ee', 2.4], fog: 0.05 },
});
// lagoon isles: sand, palms and a lot of water between low islands
const LAGOON = T('Lagoon isles', {
  music: 'overworld',
  props: 'lagoon', propDensity: 0.16,
  act: 1, spans: { chance: 0.9, max: 2, route: 0.8, island: 0.7, sky: 0.3 },
  void: 0.3, relief: 0.35,
  arche: { archipelago: 4, crater: 2, plain: 2, mesa: 1 },
  top: [[0, '#d2bd86'], [3, '#e0cf9c'], [6, '#82a852'], [10, '#5e9440'], [16, '#8a9a6a'], [20, '#c8c0a8']],
  side: [[0, '#94744e'], [6, '#b29066'], [12, '#8a7a66'], [20, '#a89a88']],
  soft: '#ecdcae', lip: '#6a9a3e', under: '#4a3a2a', bed: ['#2a3a3e', '#233236'], fluids: [1, 0, 0], river: WATER,
  tiles: { lake: 3, river: 1.5, highland: 0.5, gorge: 0.6 },
  light: { sky: ['#123c48', '#061a20', '#3a7470', '#2a4a66'], stars: 1, hemi: ['#e2f4ff', '#3a3a24', 1.15], sun: ['#fff0d8', 2.4], fog: 0 },
});
// karst and rice terraces: limestone needles, flooded steps, bamboo, mist
const KARST = T('Karst terraces', {
  music: 'overworld',
  props: 'karst', propDensity: 0.18,
  act: 1, spans: { chance: 0.9, max: 2, route: 0.8, island: 0.6, sky: 0.5 },
  void: 0.4, relief: 0.9,
  arche: { spire: 4, mesa: 2, plain: 2, archipelago: 1 },
  top: [[0, '#5a8a3a'], [4, '#6ea444'], [8, '#86b858'], [12, '#7a9a5a'], [16, '#a8b09a'], [20, '#d0d2c8']],
  side: [[0, '#6a6a62'], [6, '#8a8a80'], [12, '#a6a59a'], [20, '#c4c2b6']],
  soft: '#86b858', lip: '#4e8a34', under: '#4a4a42', bed: ['#2a2c30', '#232529'], fluids: [0.95, 0, 0.05], river: WATER,
  tiles: { highland: 1.5, slope: 1.3, lake: 1.5 },
  light: { sky: ['#1a3a3a', '#081414', '#5a7a6a', '#3a4a56'], stars: 1, hemi: ['#e4f2e8', '#34382a', 1.1], sun: ['#fff4e0', 2.3], fog: 0.1 },
});
const PEAKS = T('Snowy peaks', {
  music: 'peaks',
  props: 'peaks',
  act: 1, spans: { chance: 0.8, max: 2, route: 0.8, island: 0.5, sky: 0.5 },
  void: 0.42, relief: 1.0,
  arche: { spire: 3, chasm: 2, mesa: 2, plain: 1 },
  top: [[0, '#8fa4ab'], [6, '#c3d3d8'], [12, '#e6eef1'], [20, '#ffffff']],
  side: [[0, '#4f5862'], [8, '#6c7781'], [14, '#8a949d'], [22, '#b4bcc3']],
  soft: '#f4f8fc', lip: '#d6e2e6', under: '#454b53', bed: ['#2c3038', '#25282f'], fluids: [0.9, 0, 0.1], river: WATER,
  tiles: { highland: 2, slope: 1.5, river: 0.6 },
  light: { sky: ['#1c2e46', '#0a0f18', '#4c5d74', '#3d3a5e'], stars: 1, hemi: ['#e6f0ff', '#565c6c', 1.15], sun: ['#f4f8ff', 2.2], fog: 0.15 },
});
// prayer highlands: windy grassland and lakes under the snow line, chortens and prayer flags
const HIGHLANDS = T('Prayer highlands', {
  music: 'peaks',
  props: 'highlands',
  act: 1, spans: { chance: 0.7, max: 2, route: 0.8, island: 0.5, sky: 0.4 },
  void: 0.35, relief: 0.85,
  arche: { mesa: 3, plain: 2, spire: 1, chasm: 1 },
  top: [[0, '#7a8a4a'], [5, '#9a9a58'], [9, '#b4a868'], [13, '#a89a80'], [17, '#d8dce0'], [20, '#ffffff']],
  side: [[0, '#5a4a3e'], [8, '#7a6650'], [14, '#958672'], [22, '#bab0a2']],
  soft: '#f0f2f4', lip: '#8a9a4a', under: '#4a4038', bed: ['#2c2c34', '#25252c'], fluids: [1, 0, 0], river: WATER,
  tiles: { highland: 2, slope: 1.5, lake: 1.3, river: 0.8 },
  light: { sky: ['#10285a', '#060c20', '#3a5a8a', '#3a3a6a'], stars: 1, hemi: ['#e8f0ff', '#4a4a3a', 1.15], sun: ['#fff6e6', 2.3], fog: 0.05 },
});
const BADLANDS = T('Badlands', {
  music: 'badlands',
  props: 'badlands',
  act: 1, spans: { chance: 0.7, max: 2, route: 0.8, island: 0.4, sky: 0 },
  void: 0.12, relief: 0.8,
  arche: { chasm: 3, mesa: 3, spire: 1, plain: 1 },
  top: [[0, '#9a6a3c'], [6, '#b9864f'], [12, '#d3a466'], [20, '#e8cf9a']],
  side: [[0, '#5e3520'], [8, '#80502f'], [14, '#a06f46'], [22, '#bf9468']],
  soft: '#dcb87c', lip: '#b0824e', under: '#432818', bed: ['#2a2220', '#231c1a'], fluids: [0.5, 0.3, 0.2], mud: 0.2, river: WATER,
  tiles: { gorge: 3, highland: 1.5, meadow: 0.7, river: 0.8 },
  light: { sky: ['#40282e', '#110a0c', '#6a4a44', '#4a2a42'], stars: 0.6, hemi: ['#f0b890', '#3a2418', 0.8], sun: ['#ffb37a', 1.6], fog: 0.25 },
});
// salt flats: white crust, brine pools, pink halite and flamingos; flat and wide
const SALTFLATS = T('Salt flats', {
  music: 'badlands',
  props: 'saltflats',
  act: 1, spans: { chance: 0.4, max: 1, route: 0.8, island: 0.4, sky: 0 },
  void: 0.08, relief: 0.4,
  arche: { plain: 3, crater: 2, mesa: 2, archipelago: 1 },
  top: [[0, '#cfc6bd'], [4, '#ddd6cd'], [8, '#e6dfd8'], [12, '#e2d0cb'], [20, '#ece4e0']],
  side: [[0, '#8a6a5a'], [8, '#a8887a'], [14, '#c4a89a'], [22, '#dccabe']],
  soft: '#f4f0e8', lip: '#e4dcd2', under: '#5a4038', bed: ['#2a2224', '#231c1e'], fluids: [0.85, 0.05, 0.1], river: WATER,
  tiles: { lake: 2, meadow: 1.5, highland: 0.6, gorge: 0.5 },
  light: { sky: ['#40283a', '#120a12', '#7a5266', '#5a3a5a'], stars: 0.6, hemi: ['#ffe0e4', '#4a3a38', 0.8], sun: ['#ffc8a8', 1.6], fog: 0.25 },
});
// the slime marsh: green moss and pools of toxic slime (acid: falling in is the end), drooping
// slime trees, mounds of goo with things stuck in them, bubbling vents and the craters the slime
// meteorites left; low and wet, few holes, lakes and rivers everywhere. Act II's open marsh: no
// rock walls, under the act's hazy sky, the sun dim through the veils by day. Act II's last, at its
// bottom, Slomo's: in about 80% of the worlds (the rest of act II's themes in about 46%)
const SLIME = T('Slime marsh', {
  music: 'swamp', weight: 3.2,
  props: 'slime', propDensity: 0.3, mire: 0.88, meteors: true,
  vignettes: [0, 1],
  grove: { trees: ['slime_tree', 'slime_tree', 'bulb_tree', 'dead_slimed_tree'], density: 0.3, scale: [0.95, 1.25] },
  waylights: { props: ['slime_glow_stalk'], share: 0.12 },
  act: 2, spans: { chance: 0.7, max: 2, route: 0.8, island: 0.3, sky: 0 },
  void: 0.1, relief: 0.55,
  arche: { plain: 3, crater: 2, archipelago: 2, mesa: 1 },
  top: [[0, '#3e5a2a'], [4, '#4f6e30'], [8, '#628236'], [12, '#76903e'], [16, '#86985a'], [20, '#a4ac86']],
  side: [[0, '#2e3424'], [6, '#3e4630'], [11, '#545a44'], [20, '#6e705e']],
  soft: '#7ac040', lip: '#5a8a2a', under: '#1e2214', bed: ['#181c12', '#13160e'], fluids: [0.08, 0, 0.92], river: ACID,
  tiles: { lake: 2, river: 1.5, highland: 0.8 },
  light: { sky: ['#1c3a30', '#08140e', '#4a6a50', '#34482e'], stars: 0.2, hemi: ['#d4e6c0', '#2e3418', 1.0], sun: ['#e6f6c8', 1.4], fog: 0.22, lamp: 0.45,
    // at night a green moonlight, the slime glowing, spores drifting
    night: { sky: ['#04100a', '#010503', '#0c2416', '#0e2a1a'], stars: 1, hemi: ['#6a9a80', '#060a06', 0.5], sun: ['#a8f0b4', 0.5], fog: 0.4, lamp: 1 } },
  nightMotes: { colors: ['#b8ff5a', '#d8ff9a', '#9aff7a'], rate: 6, drift: 0.25, rise: [0.02, 0.2], life: [2.5, 5], size: [0.03, 0.06],
    wisps: 1, wisp: '#b8ff5a' },
});
// the deep canyon: the last of the sky, far down between sheer sandstone walls (red, salmon and
// cream strata), a green river floor with cottonwoods, hanging gardens at the springs
const CANYON = T('Deep canyon', {
  music: 'badlands',
  props: 'canyon', propDensity: 0.3,
  act: 1, spans: { chance: 0.85, max: 2, route: 0.8, island: 0.5, sky: 0, deck: 15 },
  void: 0.1, relief: 1.1, walls: true, heights: { tableland: 0.8, tunnel: 0.45 },
  sunLow: 50,   // (the sun high over its walls: low, their shadows would sweep the floor too fast)
  arche: { chasm: 3, mesa: 2, spire: 2, plain: 1 },
  top: [[0, '#5e7a3a'], [4, '#7a8a46'], [7, '#c27a48'], [11, '#d49466'], [15, '#e2b48a'], [20, '#f0dcc0']],
  side: [[0, '#6e2e1c'], [5, '#9a4426'], [9, '#b8603a'], [13, '#c8825a'], [17, '#d8a880'], [22, '#e8cfae']],
  soft: '#e8c498', lip: '#6a8a3a', under: '#4a2418', bed: ['#2a2420', '#231e1a'], fluids: [0.9, 0.05, 0.05], river: WATER,
  tiles: { gorge: 3, river: 2, highland: 1.3, slope: 1.5, lake: 0.5 },
  light: { sky: ['#1e3e6e', '#0a1630', '#8aa0c0', '#c0805a'], stars: 0.4, hemi: ['#ffe6cc', '#5a3020', 1.0], sun: ['#ffdcb0', 2.1], fog: 0.1 },
});

// the dark forest: wooded hills at night, tall firs and gnarled trees, lanterns on posts and in
// the branches, glowing mushrooms, old stones and the abandoned places of people long gone. Few
// holes and few floating floors: rolling hills, gorges and rivers crossed by rock arches and logs,
// and short tunnels through the ridges
const DARKFOREST = T('Dark forest', {
  music: 'overworld',
  props: 'darkforest', propDensity: 0.34,
  act: 1, night: true, spans: { chance: 0.9, max: 2, route: 0.8, island: 0.15, sky: 0.05 },
  void: 0.1, relief: 0.95, layers: 0.3, hills: { count: [2, 4], roll: 1.8 }, heights: { tunnel: 0.5 },
  vignettes: [1, 2],
  motes: { colors: ['#d8ff6a', '#d8ff6a', '#b8ff8a', '#9affd8'], rate: 7, drift: 0.3, rise: [-0.06, 0.14], life: [2.5, 5.5], size: [0.035, 0.065] },
  grove: { trees: ['dark_fir_tree', 'dark_fir_tree', 'gnarled_tree', 'bare_tree'], density: 0.6, scale: [0.95, 1.3],
    lanterns: 0.3, strings: 3 },
  waylights: { props: ['darkforest_lantern_post'], share: 0.22 },
  arche: { plain: 3, mesa: 2, chasm: 2, crater: 1, sinkhole: 1 },
  top: [[0, '#1e3326'], [4, '#253e2b'], [8, '#2d4831'], [12, '#3a5236'], [16, '#4a5848'], [20, '#5e6660']],
  side: [[0, '#2a221c'], [6, '#3a2e24'], [11, '#48423c'], [20, '#5c5854']],
  soft: '#3e5e32', lip: '#24402a', under: '#1a1612', bed: ['#14161a', '#101215'], fluids: [0.95, 0, 0.05], mud: 0.3, river: WATER,
  tiles: { slope: 2, highland: 1.3, gorge: 1.4, river: 1.3, lake: 0.6 },
  light: { sky: ['#060a12', '#020406', '#0e1822', '#120e22'], stars: 0.4, hemi: ['#7084b4', '#0a0e0a', 0.55], sun: ['#9ab0e8', 0.55], fog: 0.45, lamp: 1,
    // by day a deep blue twilight under the trees, never more
    day: { sky: ['#0c1424', '#04070c', '#1a2a40', '#1e1a36'], stars: 0.2, hemi: ['#8496c4', '#10160e', 0.7], sun: ['#aec0ec', 0.7], fog: 0.38, lamp: 0.9 } },
});

// the depths of the three acts (docs/story.md): I under the sky (childhood), II the sunlit
// hollows (growing up), III the deep (the sealed memories); the town (0) before them, the core
// (20) after
export const ACTS = [null, [1, 6], [7, 13], [14, 19]];
// every theme, the town's first; each act's in its story order: a world shows them in this order
// down the act (themes/depth.js worldThemes)
export const THEMES = [MEADOW, CLOUDS, LAGOON, KARST, DARKFOREST, PEAKS, HIGHLANDS, SALTFLATS, BADLANDS, CANYON,
  ...SUNLIT_THEMES, SLIME, ...DEEP_THEMES];
// the depths a theme may appear at: its act's; its sky (what the days and nights do there)
for (const t of THEMES) {
  t.depths = ACTS[t.act];
  t.sky ??= t.cave ? 'none' : t.night ? 'night' : t.act === 2 ? 'hazy' : 'open';
}
// the town and its road (depth 0), the core (depth 20)
export const TOWN = MEADOW;
export { CORE };

// every song the game plays: the main menu's, the town (and the merchant camp), one per theme, the
// core (depth 20) and the bosses' own (core/bossmusic.js)
export const SONGS = ['title', 'town', ...new Set(THEMES.map(t => t.music)), 'core', ...Object.values(BOSS_MUSIC).map(m => m.song)];

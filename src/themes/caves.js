// The themes of acts II and III (depth 7 and deeper), see index.js. Most are caves, walled in by
// rock; act II's also has open hollows under a hazy sky (`cave: false`: the forge's works yard,
// the jungle round the cenote, the fungal swamp, and the slime marsh in index.js). Every one has
// something drifting in its air (`motes`, render/motes.js), the dark ones a few wisps with
// lights. Act II's (7-13) are lit from above, through cracks or the haze, and by glowing things
// (medium light, `lamp` about a half), act III's (14-20) only by their own fires and crystals
// (dark), every one of them walled in.
import { WATER, LAVA, ACID } from '../core/constants.js';

const T = (name, o) => ({ name, tiles: {}, cave: true, spans: null, ...o });

const ROOTS = T('Root caves', {
  music: 'roots',
  props: 'roots', motes: { colors: ['#7fd8ff', '#a8e8ff'], rate: 2, drift: 0.1, rise: [-0.02, 0.06], life: [4, 7], size: [0.025, 0.04] },
  act: 2, spans: { chance: 0.35, max: 1, route: 0.8, island: 0.4, sky: 0, deck: 15 },
  void: 0.08, relief: 0.5,
  arche: { plain: 2, sinkhole: 2, chasm: 1, crater: 1 },
  top: [[0, '#4a3e2e'], [6, '#5e4c35'], [12, '#705c40'], [20, '#82704e']],
  side: [[0, '#352a20'], [8, '#46352a'], [14, '#574332'], [22, '#68523c']],
  soft: '#6a8a3a', lip: '#4a5a2a', under: '#1e1712', bed: ['#1a1614', '#151210'], fluids: [0.8, 0.05, 0.15], mud: 0.25, river: WATER,
  tiles: { highland: 1.5, gorge: 2 },
  light: { sky: ['#3a3428', '#12100c', '#5a5038', '#28383c'], hemi: ['#c4c4c8', '#4a3826', 1.15], sun: ['#f0e2c4', 1.5], fog: 0.15, lamp: 0.45 },
});
const FROZEN = T('Frozen caves', {
  music: 'frozen',
  props: 'frozen', motes: { colors: ['#e0f4ff', '#b8e0ff'], rate: 3, drift: 0.12, rise: [-0.12, -0.04], life: [4, 7], size: [0.025, 0.045] },
  act: 2, spans: { chance: 0.35, max: 1, route: 0.8, island: 0.4, sky: 0, deck: 15 },
  void: 0.08, relief: 0.6,
  arche: { crater: 2, sinkhole: 2, plain: 2 },
  top: [[0, '#5d7f93'], [6, '#82a6b8'], [12, '#aacbd7'], [20, '#d8ecf2']],
  side: [[0, '#1f2d3a'], [8, '#2b3f50'], [14, '#395166'], [22, '#4b677d']],
  soft: '#e8f4fa', lip: '#a8d0e0', under: '#131b23', bed: ['#161b22', '#11151b'], fluids: [0.9, 0, 0.1], river: WATER,
  tiles: { lake: 2 },
  light: { sky: ['#14202c', '#06090e', '#2e4a5e', '#262e4e'], hemi: ['#a8c4dc', '#203040', 1.05], sun: ['#d0e0ff', 1.4], fog: 0.2, lamp: 0.5 },
});
// the fungal swamp: giant toadstools, shelf fungi and glowcaps over a marsh of acid pools, open
// under the haze (no rock walls)
const SWAMP = T('Fungal swamp', {
  music: 'swamp', cave: false,
  props: 'swamp', motes: { colors: ['#b8ff8a', '#d8ff9a'], rate: 4, drift: 0.15, rise: [0.0, 0.1], life: [4, 7], size: [0.03, 0.05], wisps: 2, wisp: '#8fff7a' },
  act: 2, spans: { chance: 0.6, max: 2, route: 0.8, island: 0.4, sky: 0 },
  void: 0.08, relief: 0.5,
  arche: { archipelago: 3, plain: 2, crater: 1, mesa: 1 },
  top: [[0, '#3a4826'], [6, '#4b5a2e'], [12, '#5c6a36'], [20, '#6d7a3e']],
  side: [[0, '#272d1b'], [8, '#333b22'], [14, '#3f4728'], [22, '#4b532e']],
  soft: '#6a8a3a', lip: '#5a7a30', under: '#14170e', bed: ['#151712', '#11130e'], fluids: [0.45, 0.05, 0.5], mud: 0.5, river: ACID,
  tiles: { lake: 2, river: 1.5 },
  light: { sky: ['#1a2416', '#060906', '#3e4a30', '#2a3a26'], stars: 0.15, hemi: ['#a8b894', '#24301a', 1.0], sun: ['#d0e4b0', 1.3], fog: 0.28, lamp: 0.55 },
});
const NESTS = T('Spider nests', {
  music: 'nests',
  waylights: { props: ['nests_glow_eggs', 'nests_pale_fungus'], share: 0.1 },
  props: 'nests', motes: { colors: ['#d0a8ff', '#b890ff'], rate: 4, drift: 0.12, rise: [0.0, 0.08], life: [4, 7], size: [0.03, 0.05], wisps: 2, wisp: '#b890ff' },
  act: 3, spans: { chance: 0.4, max: 1, route: 0.8, island: 0.4, sky: 0, deck: 15 },
  void: 0.1, relief: 0.7,
  arche: { chasm: 2, sinkhole: 2, spire: 1, plain: 1 },
  top: [[0, '#4a444a'], [6, '#565058'], [12, '#625c66'], [20, '#6e6874']],
  side: [[0, '#28232a'], [8, '#322c34'], [14, '#3c363e'], [22, '#464048']],
  soft: '#ece8f0', lip: '#605a66', under: '#121014', bed: ['#141216', '#100e12'], fluids: [0.3, 0.1, 0.6], river: ACID,
  tiles: { highland: 1.5, gorge: 1.5 },
  light: { sky: ['#0a080e', '#030204', '#1a1426', '#20102a'], hemi: ['#6a6070', '#100c12', 0.6], sun: ['#b0a0c0', 0.6], fog: 0.5, lamp: 1 },
});
const MINES = T('Crystal mines', {
  music: 'mines',
  waylights: { props: ['mines_lantern'], share: 0.12 },
  props: 'mines', motes: { colors: ['#c8d8ff', '#e8f0ff'], rate: 2, drift: 0.1, rise: [-0.05, 0.03], life: [3, 6], size: [0.02, 0.035] },
  act: 3, spans: { chance: 0.4, max: 1, route: 0.8, island: 0.4, sky: 0, deck: 15 },
  void: 0.08, relief: 0.8,
  arche: { chasm: 2, mesa: 2, spire: 2, plain: 1 },
  top: [[0, '#4a4a52'], [6, '#5a5a64'], [12, '#6a6a76'], [20, '#7a7a88']],
  side: [[0, '#24242c'], [8, '#30303a'], [14, '#3c3c48'], [22, '#484856']],
  soft: '#9a96a4', lip: '#7a8aa8', under: '#16161c', bed: ['#141418', '#101014'], fluids: [0.7, 0.2, 0.1], river: WATER,
  tiles: { highland: 2, gorge: 1.5 },
  light: { sky: ['#080a12', '#020306', '#141c30', '#1a1638'], hemi: ['#6a7aa0', '#0c0e16', 0.56], sun: ['#90a8ff', 0.55], fog: 0.55, lamp: 1 },
});
const RUINS = T('Buried ruins', {
  music: 'ruins',
  waylights: { props: ['ruins_oil_lamps', 'ruins_brazier'], share: 0.1, back: 0.3, foot: 0.12 },
  props: 'ruins', motes: { colors: ['#ffb060', '#ff8a3a'], rate: 4, drift: 0.15, rise: [0.15, 0.35], life: [2, 4], size: [0.025, 0.045], wisps: 1, wisp: '#ffa050' },
  act: 3, spans: { chance: 0.35, max: 1, route: 0.8, island: 0.4, sky: 0, deck: 15 },
  void: 0.1, relief: 0.6,
  arche: { mesa: 3, sinkhole: 1, plain: 2 },
  top: [[0, '#7a6648'], [6, '#8c7650'], [12, '#9e8658'], [20, '#b09660']],
  side: [[0, '#4a3a24'], [8, '#5c482c'], [14, '#6e5634'], [22, '#80643c']],
  soft: '#d4c094', lip: '#a08a5e', under: '#2a2014', bed: ['#1a1610', '#15120d'], fluids: [0.2, 0.4, 0.4], river: ACID,
  tiles: { gorge: 2, highland: 1.5 },
  light: { sky: ['#0e0a06', '#030201', '#261c0e', '#2c1608'], hemi: ['#a08a60', '#140e08', 0.52], sun: ['#ffcf8a', 0.5], fog: 0.55, lamp: 1 },
});
const VOLCANIC = T('Volcanic depths', {
  music: 'volcanic',
  props: 'volcanic', motes: { colors: ['#ffb030', '#ff6a20', '#ffd060'], rate: 8, drift: 0.25, rise: [0.3, 0.7], life: [1.5, 3], size: [0.025, 0.05] },
  act: 3, spans: { chance: 0.4, max: 1, route: 0.8, island: 0.4, sky: 0, deck: 15 },
  void: 0.12, relief: 0.8,
  arche: { crater: 3, chasm: 2, spire: 1 },
  top: [[0, '#2a2626'], [6, '#363030'], [12, '#423a38'], [20, '#4e4440']],
  side: [[0, '#1a1414'], [8, '#241c1a'], [14, '#2e2420'], [22, '#382c26']],
  soft: '#4a4444', lip: '#5a2a1a', under: '#100a08', bed: ['#120c0a', '#0e0908'], fluids: [0.05, 0.85, 0.1], river: LAVA,
  tiles: { gorge: 2, lake: 2 },
  light: { sky: ['#1a0604', '#050101', '#32140a', '#3c1006'], hemi: ['#a05030', '#1a0806', 0.5], sun: ['#ff7a40', 0.55], fog: 0.55, lamp: 1 },
});
const ABYSS = T('Obsidian abyss', {
  music: 'abyss',
  waylights: { props: ['abyss_rune_stone'], share: 0.08, back: 0.3, foot: 0.15 },
  props: 'abyss', motes: { colors: ['#c070ff', '#ff4a8a'], rate: 5, drift: 0.15, rise: [0.1, 0.3], life: [2.5, 4.5], size: [0.025, 0.045], wisps: 2, wisp: '#b060ff' },
  act: 3, spans: { chance: 0.5, max: 1, route: 0.8, island: 0.4, sky: 0.4, deck: 15 },
  void: 0.6, relief: 0.6,
  arche: { archipelago: 4, spire: 2, chasm: 1 },
  top: [[0, '#1a1820'], [6, '#22202a'], [12, '#2a2834'], [20, '#32303e']],
  side: [[0, '#0e0c12'], [8, '#14121a'], [14, '#1a1822'], [22, '#201e2a']],
  soft: '#3a3644', lip: '#3a1a3a', under: '#08070a', bed: ['#0a090c', '#070609'], fluids: [0, 1, 0], river: LAVA,
  tiles: { lake: 4, gorge: 1.5 },
  light: { sky: ['#160406', '#040101', '#261030', '#320a1e'], hemi: ['#803040', '#100406', 0.45], sun: ['#ff4a30', 0.5], fog: 0.55, lamp: 1 },
});

// the sunken grotto: kelp, clams and glowing jellies around wide pools of sea water
const GROTTO = T('Sunken grotto', {
  music: 'frozen',
  props: 'grotto', motes: { colors: ['#8af0ff', '#a8ffe8'], rate: 4, drift: 0.12, rise: [0.02, 0.1], life: [4, 7], size: [0.03, 0.05], wisps: 1, wisp: '#7fe8ff' },
  act: 2, spans: { chance: 0.35, max: 1, route: 0.8, island: 0.4, sky: 0, deck: 15 },
  void: 0.08, relief: 0.5,
  arche: { archipelago: 2, crater: 2, plain: 2, sinkhole: 1 },
  top: [[0, '#3e6260'], [6, '#58807a'], [12, '#8aa49a'], [20, '#c8c0a4']],
  side: [[0, '#1a2e34'], [8, '#244048'], [14, '#30525c'], [22, '#406a74']],
  soft: '#d8d0b4', lip: '#3a8a7a', under: '#0f1c20', bed: ['#121a1e', '#0e1518'], fluids: [1, 0, 0], river: WATER,
  tiles: { lake: 3, river: 1.3 },
  light: { sky: ['#0c2430', '#030a0e', '#205058', '#18403a'], hemi: ['#98ccd8', '#183038', 1.05], sun: ['#b4e8ff', 1.4], fog: 0.22, lamp: 0.5 },
});
// the honey hive: wax, comb and candles in warm amber light (honey rivers: water until a honey
// fluid exists, see docs/assets/themes.md)
const HIVE = T('Honey hive', {
  music: 'swamp',
  props: 'hive', motes: { colors: ['#ffd870', '#ffe8a0'], rate: 3, drift: 0.2, rise: [-0.04, 0.06], life: [3, 6], size: [0.025, 0.04] },
  act: 2, spans: { chance: 0.3, max: 1, route: 0.8, island: 0.4, sky: 0, deck: 15 },
  void: 0.06, relief: 0.5,
  arche: { crater: 2, sinkhole: 2, plain: 2, mesa: 1 },
  top: [[0, '#8a5a1a'], [6, '#a87024'], [12, '#c48a2e'], [20, '#dca848']],
  side: [[0, '#3a2410'], [8, '#4e3016'], [14, '#623e1c'], [22, '#784c22']],
  soft: '#f0d070', lip: '#e0a030', under: '#1e1408', bed: ['#1a130a', '#151008'], fluids: [0.85, 0.05, 0.1], river: WATER,
  tiles: { lake: 1.5, highland: 1.3 },
  light: { sky: ['#241808', '#0a0602', '#4a3214', '#3a2010'], hemi: ['#e0b878', '#3a240c', 1.0], sun: ['#ffd890', 1.3], fog: 0.25, lamp: 0.55 },
});
// the ossuary: candlelit catacombs, bone walls and urns (spooky, but friendly)
const OSSUARY = T('Ossuary', {
  music: 'nests',
  waylights: { props: ['ossuary_candelabra', 'ossuary_bone_lantern'], share: 0.1, back: 0.3, foot: 0.1 },
  props: 'ossuary', motes: { colors: ['#ffe0b0', '#d8d0c0'], rate: 3, drift: 0.1, rise: [-0.03, 0.05], life: [4, 7], size: [0.02, 0.035], wisps: 2, wisp: '#9ad0ff' },
  act: 3, spans: { chance: 0.3, max: 1, route: 0.8, island: 0.4, sky: 0, deck: 15 },
  void: 0.08, relief: 0.6,
  arche: { mesa: 2, chasm: 2, plain: 2, sinkhole: 1 },
  top: [[0, '#5a544a'], [6, '#6e665a'], [12, '#82786a'], [20, '#968a7a']],
  side: [[0, '#2a2622'], [8, '#34302a'], [14, '#3e3832'], [22, '#48423a']],
  soft: '#dcd0b8', lip: '#8a8070', under: '#141210', bed: ['#151312', '#110f0e'], fluids: [0.4, 0.1, 0.5], river: ACID,
  tiles: { gorge: 1.5, highland: 1.5 },
  light: { sky: ['#0c0a0e', '#030203', '#1e1a1c', '#101828'], hemi: ['#a08a6a', '#120e0a', 0.6], sun: ['#ffc890', 0.6], fog: 0.5, lamp: 1 },
});
// the dwarven forge: a works yard under the open haze, pipes, gears and anvils, furnaces and
// pools of slag (the story's workshop, her first job)
const FORGE = T('Dwarven forge', {
  music: 'mines', cave: false,
  waylights: { props: ['forge_crucible'], share: 0.06, back: 0.3, foot: 0.15 },
  props: 'forge', motes: { colors: ['#ffc060', '#ff9a3a'], rate: 4, drift: 0.2, rise: [0.2, 0.5], life: [1.5, 3], size: [0.025, 0.04] },
  act: 2, spans: { chance: 0.6, max: 2, route: 0.8, island: 0.3, sky: 0 },
  void: 0.1, relief: 0.8,
  arche: { mesa: 3, plain: 2, chasm: 1, crater: 1 },
  top: [[0, '#5a524a'], [6, '#6a6058'], [12, '#7a6e62'], [20, '#8c7e70']],
  side: [[0, '#2e2824'], [8, '#3c3430'], [14, '#4a403a'], [22, '#5a4e46']],
  soft: '#6a6460', lip: '#8a5a3a', under: '#120e0c', bed: ['#141110', '#100d0c'], fluids: [0.45, 0.45, 0.1], river: WATER,
  tiles: { highland: 2, gorge: 1.5 },
  light: { sky: ['#2a1a12', '#0a0604', '#5a3a26', '#3a2420'], stars: 0.15, hemi: ['#d0a880', '#2a1a0e', 0.95], sun: ['#ffc890', 1.3], fog: 0.3, lamp: 0.55 },
});
// the jungle cenote: sunlit sinkholes in an open jungle, a temple of jade, glyphs and vines over
// clear pools (no rock walls: the last of the haze before the deep)
const CENOTE = T('Jungle cenote', {
  music: 'ruins', cave: false,
  props: 'cenote', motes: { colors: ['#d8ff6a', '#ffe8a0'], rate: 3, drift: 0.2, rise: [-0.04, 0.1], life: [3, 5], size: [0.03, 0.05] },
  act: 2, spans: { chance: 0.6, max: 2, route: 0.8, island: 0.4, sky: 0 },
  void: 0.1, relief: 0.7,
  arche: { sinkhole: 3, mesa: 2, crater: 1, plain: 1 },
  top: [[0, '#3a5a2a'], [6, '#4a6e32'], [12, '#5e823c'], [20, '#7a9648']],
  side: [[0, '#4a4434'], [8, '#5e5640'], [14, '#746a4e'], [22, '#8a7e5e']],
  soft: '#5a9a44', lip: '#3a7a2e', under: '#1a180e', bed: ['#161812', '#12140e'], fluids: [0.75, 0.15, 0.1], mud: 0.3, river: WATER,
  tiles: { lake: 2, gorge: 1.3 },
  light: { sky: ['#1e3a26', '#06100a', '#4a6a40', '#2e4a30'], stars: 0.2, hemi: ['#b0cc98', '#1e2a14', 0.95], sun: ['#ecffb8', 1.35], fog: 0.25, lamp: 0.5 },
});

// in their story order (themes/index.js THEMES): act II's (the slime marsh, themes/index.js, last
// of them) and act III's; the core is the abyss
export const SUNLIT_THEMES = [ROOTS, GROTTO, FORGE, HIVE, SWAMP, CENOTE, FROZEN];
export const DEEP_THEMES = [MINES, NESTS, OSSUARY, RUINS, VOLCANIC, ABYSS];
export const CORE = ABYSS;

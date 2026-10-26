// The developer commands (?dev=1), typed in the chat box (game/console.js): spawning and
// clearing enemies, getting about, items and the hero. They do what the dev tools always did
// (game/devspawn.js, game/dev.js, game/equipment.js), now by name: /help lists them.
import { addCommand, addType } from '../core/commands.js';
import { ITEMS, TOOLS } from '../core/items.js';
import { ENEMY_KINDS } from '../core/enemies.js';
import { addItem, addInstance, autoBar, countOf, equippedItem } from '../core/inventory.js';
import { xpForLevel, levelFromXP, fullHealth } from '../core/progression.js';
import { MAX_ILVL, rollWeapon, rollArmor } from '../core/gear/generate.js';
import { RARITY } from '../core/gear/rarities.js';
import { ENCHANTS, ENCHANT, enchantOf, describeEnchant } from '../core/gear/enchants.js';
import { online } from '../net/online.js';
import { player, state } from './state.js';
import { commands } from './commands.js';
import { spawnEnemies, killEnemies, clearEnemies } from './devspawn.js';
import { goTo, goPlace, whereAmI, goHorde, goArena, goAdjacent, goSpan, goFeature, goStructure, goSpot, goTrial, goBoss, goTestRoom, leaveTestRoom, FEATURES } from './dev.js';
import { BOSSES, BOSS_ARENAS } from '../core/bosses.js';
import { DIR_NAME, readPlace, isCellText } from '../world/coords.js';
import { MAX_DEPTH } from '../themes/depth.js';
import { N } from '../core/constants.js';
import { TEST_ROOMS, isTestRoom, testRoomDepth } from '../world/testrooms.js';
import { TRIALS, TRIAL_KINDS } from '../core/trials.js';
import { devTrial } from './trials.js';
import { SPOT_KINDS } from '../world/spots.js';
import { QUEST_KINDS } from '../core/quests.js';
import { devQuest } from './quests.js';
import { BRIDGE_STYLES, LADDER_STYLES } from '../themes/builds.js';
import { ARENA_WEIGHTS } from '../world/arenas.js';
import { BOSS_SHAPES } from '../cubegen/arenashapes.js';
import { devSwapWeapon, devDropWeapon, devWear, devWearArmor, devDropArmor } from './equipment.js';
import { forceMood } from './music.js';
import { devNarrate } from './narrator.js';
import { playFilm } from '../film/player.js';
import { FILMS } from '../film/films.js';
import { LINES } from '../core/narration.js';
import { nextCube, newWorld } from './flow.js';
import { pickFloor, pointer } from './pointer.js';
import { heroLevel, MAX_WORLDS } from '../core/save.js';
import { store, play, saveAs, newSavedWorld, savedHero, savedWorld, forget } from './save.js';
import { quitToMenu } from './menu.js';
import { skyNow, dayClock } from './daycycle.js';
import { DAYTIMES, DAY, dayPhase, nextDaytime } from '../core/daycycle.js';
import { setFluidPalettes, paletteOf } from '../render/fluidpal.js';
import { rowSlot } from '../themes/fluids.js';
import { LIGHT_VIEWS, lightview } from './teach.js';
import { showPerf, runBench } from './perf.js';

const dev = cmd => addCommand(commands, { ...cmd, dev: true });
const ahead = (d = 2.5) => ({ x: player.x + Math.sin(player.yaw) * d, y: player.y, z: player.z + Math.cos(player.yaw) * d });

// --- enemies ---------------------------------------------------------------------------------

dev({
  name: 'spawn', help: 'put enemies in this cube (level: what this depth gives)',
  args: [{ name: 'enemy', type: 'enemy' }, { name: 'level', type: 'int', optional: true, min: 1, max: 99 },
    { name: 'count', type: 'int', optional: true, min: 1, max: 20 }, { name: 'where', type: 'where', optional: true }],
  run({ enemy, level = null, count = 1, where = 'front' }) {
    const at = where === 'cursor' ? pointer.inside && pickFloor() : ahead();
    if (!at) return 'The cursor is not on the floor';
    const list = spawnEnemies(enemy, { level, n: count, at }), k = ENEMY_KINDS[enemy];
    return list.length ? `Spawned ${list.length} × ${k.label} (level ${list[0].level})` : `No room for a ${k.label} here`;
  },
});
dev({ name: 'kill', help: 'every enemy here dies (with XP and loot)', run: () => `Killed ${killEnemies()} enemies` });
dev({ name: 'remove', help: 'every enemy here goes (no XP, no loot)', run: () => `Removed ${clearEnemies()} enemies` });
dev({
  name: 'passive', help: 'enemies stand still and never attack (again: they wake up)', args: [{ name: 'on|off', type: 'toggle', optional: true }],
  run({ 'on|off': on }) {
    state.devPassive = on ? on === 'on' : !state.devPassive;
    return `Enemies are ${state.devPassive ? 'passive' : 'awake'}`;
  },
});

// The world's time of day (core/daycycle.js, game/daycycle.js). /daytime: the world's play time
// on to the next morning, noon, evening, dusk, night or dawn (alone or as the host: a guest's
// clock follows the host's). /dayspeed: how fast the time of day runs here, the world's play time
// left as it is (0: it stands still; this game only).
const SKY_SAYS = { open: 'under the open sky, the sun going round', hazy: 'under the haze: the light turns, the sun stays',
  night: 'always night here, a little lighter by day', none: 'no days and nights here' };
const timeOfDay = () => {
  const s = dayPhase(dayClock()), name = Object.entries(DAYTIMES).filter(([, at]) => at <= s).sort((a, b) => b[1] - a[1])[0][0];
  return `${name}, ${Math.floor(s)} of ${DAY.length} s`;
};
addType(commands, { name: 'daytime', values: () => Object.keys(DAYTIMES).map(v => ({ value: v, label: v, hint: `${DAYTIMES[v]} s into the day` })) });
dev({
  name: 'daytime', help: "the world's time of day: on to the next morning, noon, evening, dusk, night or dawn (none: what it is)",
  args: [{ name: 'when', type: 'daytime', optional: true }],
  run({ when }) {
    if (when) state.run.clock += nextDaytime(dayClock(), when) - dayClock();
    return `It is ${timeOfDay()} (${SKY_SAYS[skyNow()]})`;
  },
});
const SPEEDS = [0, 0.5, 1, 2, 5, 10, 30];
addType(commands, { name: 'dayspeed', values: () => SPEEDS.map(v => ({ value: v, label: String(v), hint: v ? `${v}× as fast` : 'the time of day stands still' })),
  read: t => /^\d+(\.\d+)?$/.test(t) && Number(t) <= 60 ? Number(t) : undefined });
dev({
  name: 'dayspeed', help: 'how fast the time of day runs, in this game only (1: as the world\'s clock, 0: it stands still)',
  args: [{ name: 'speed', type: 'dayspeed', optional: true }],
  run({ speed }) {
    if (speed !== undefined) state.daySpeed = speed;
    return `The time of day runs ${state.daySpeed === 0 ? 'not at all' : `${state.daySpeed}× as fast`}: it is ${timeOfDay()}`;
  },
});

// --- getting about -------------------------------------------------------------------------

// /goto down|up, east|west|south|north, or a place: [depth] [X,Z] [x,y,z] (world/coords.js readPlace)
addType(commands, { name: 'goto', read: t => isCellText(t) ? t : undefined, values: () => [
  { value: 'down', label: 'down', hint: 'take the nearest way down (PgDn)' }, { value: 'up', label: 'up', hint: 'take the nearest way up (PgUp)' },
  ...DIR_NAME.slice(0, 4).map(d => ({ value: d, label: d, hint: 'the cube on that side (Alt + WASD)' })),
  ...commands.types.get('depth').values()] });
dev({
  name: 'goto', help: 'take the nearest way down or up (PgDn / PgUp), into the cube on a side, or to a depth\'s entrance, a cube X,Z on it (the minimap\'s), a spot x,y,z in it (/where says yours)',
  args: [{ name: 'where', type: 'goto' }, { name: 'cube', type: 'text', optional: true }, { name: 'spot', type: 'text', optional: true }],
  async run({ where, cube, spot }) {
    const p = readPlace([where, cube, spot], state.map?.depth ?? 0, MAX_DEPTH, N);
    if (p.error) throw new Error(p.error);
    if (p.way) goTo(p.way, true);
    else if (p.side !== undefined) await goAdjacent(p.side);
    else return goPlace(p);
  },
});
dev({ name: 'where', help: 'where you are, as a /goto line to copy', run: () => whereAmI() });
dev({
  name: 'find', help: 'stand next to the nearest way down or up (G)', args: [{ name: 'way', type: 'way' }],
  run({ way }) { goTo(way, false); },
});
dev({
  name: 'horde', help: "a depth's wild horde (H)", args: [{ name: 'depth', type: 'depth', optional: true }],
  async run({ depth }) { await goHorde(depth === undefined ? undefined : Number(depth)); },
});
dev({
  name: 'span', help: 'the start of a gorge span\'s long bridge (the next one, or the n-th)', args: [{ name: 'n', type: 'int', optional: true }],
  async run({ n }) { await goSpan(n === undefined ? undefined : Number(n)); },
});
addType(commands, { name: 'bridgestyle', values: () => Object.keys(BRIDGE_STYLES).map(s => ({ value: s, label: s })) });
dev({
  name: 'bridge', help: 'stand at the next bridge (of a style) from this depth (or that one) on down',
  args: [{ name: 'style', type: 'bridgestyle', optional: true }, { name: 'depth', type: 'depth', optional: true }],
  async run({ style, depth }) { await goStructure('bridge', style, depth === undefined ? undefined : Number(depth)); },
});
addType(commands, { name: 'ladderstyle', values: () => Object.keys(LADDER_STYLES).map(s => ({ value: s, label: s })) });
dev({
  name: 'ladder', help: 'stand at the foot of the next ladder (of a style) from this depth (or that one) on down',
  args: [{ name: 'style', type: 'ladderstyle', optional: true }, { name: 'depth', type: 'depth', optional: true }],
  async run({ style, depth }) { await goStructure('ladder', style, depth === undefined ? undefined : Number(depth)); },
});
addType(commands, { name: 'feature', values: () => FEATURES.map(f => ({ value: f, label: f })) });
dev({
  name: 'height', help: 'the next of the big height pieces: a tableland\'s ascent, plateau or descent, a great shaft, a pinnacle, a spiral or hairpin (in at its foot), a lone peak, a great lake, a tunnel',
  args: [{ name: 'kind', type: 'feature' }],
  async run({ kind }) { await goFeature(kind); },
});
addType(commands, { name: 'questkind', values: () => QUEST_KINDS.map(k => ({ value: k, label: k })) });
dev({
  name: 'quest', help: 'a quest of this kind on this depth (default: here), taken at once',
  args: [{ name: 'kind', type: 'questkind' }, { name: 'depth', type: 'depth', optional: true }],
  run({ kind, depth }) { return devQuest(kind, depth === undefined ? state.map?.depth ?? 0 : Number(depth)); },
});
addType(commands, { name: 'spotkind', values: () => SPOT_KINDS.map(k => ({ value: k, label: k })) });
dev({
  name: 'spot', help: 'stand at the next spot the quests keep free (a hiding place, a seat, a camp) from this depth (or that one) on down',
  args: [{ name: 'kind', type: 'spotkind', optional: true }, { name: 'depth', type: 'depth', optional: true }],
  async run({ kind, depth }) { await goSpot(kind, depth === undefined ? undefined : Number(depth)); },
});
addType(commands, { name: 'trialdo', values: () => [
  ...TRIAL_KINDS.map(k => ({ value: k, label: k, hint: `${TRIALS[k].name} (${TRIALS[k].family})`, color: TRIALS[k].color })),
  { value: 'win', label: 'win', hint: 'resolve the trial of this room' }, { value: 'fail', label: 'fail', hint: 'fail it' },
  { value: 'reset', label: 'reset', hint: 'put it back as built' }, { value: 'solve', label: 'solve', hint: 'what the generator proved' },
  { value: 'list', label: 'list', hint: "this world's trials by depth" }] });
dev({
  name: 'trial', help: 'stand before the next trial of a kind (from this depth or that one on down); win, fail, reset, solve: this room\'s; list',
  args: [{ name: 'kind', type: 'trialdo', optional: true }, { name: 'depth', type: 'depth', optional: true }],
  async run({ kind = 'list', depth }) {
    if (TRIALS[kind]) { await goTrial(kind, depth === undefined ? undefined : Number(depth)); return; }
    if (kind === 'list') {
      const lines = [];
      for (let d = 1; d < 20; d++) for (const t of state.cubes.layout(d).trials)
        lines.push(`depth ${d}: ${TRIALS[t.kind].name} (${t.kind}, ${t.role}) in ${t.key}${t.stages ? ' · ' + t.stages.join(', ') : ''}${state.run.unlockedGates.has(t.gate) ? ' · done' : ''}`);
      return lines.length ? lines.join('\n') : 'No trials in this world (/trial <kind> makes one)';
    }
    return devTrial(kind);
  },
});
addType(commands, { name: 'arena', values: () => [...new Set([...Object.keys(ARENA_WEIGHTS.descent), ...Object.keys(BOSS_SHAPES),
  ...Object.values(BOSS_ARENAS).map(a => a.type).filter(Boolean)])].map(t => ({ value: t, label: t })) });
dev({
  name: 'arena', help: 'a guardian arena of this kind (nearest depth first)',
  args: [{ name: 'kind', type: 'arena', optional: true }, { name: 'depth', type: 'depth', optional: true }],
  async run({ kind, depth }) { await goArena(kind, depth === undefined ? undefined : Number(depth)); },
});
addType(commands, { name: 'boss', values: () => Object.entries(BOSSES).map(([d, k]) => ({ value: k, label: ENEMY_KINDS[k].label, hint: `depth ${d}` })) });
dev({
  name: 'boss', help: 'into a boss\'s arena (beaten: he is up again)', args: [{ name: 'boss', type: 'boss' }],
  async run({ boss }) { await goBoss(boss); },
});
addType(commands, { name: 'testroom', values: () => [...Object.entries(TEST_ROOMS).map(([k, hint]) => ({ value: k, label: k, hint })),
  { value: 'leave', label: 'leave', hint: 'back to where you were' }] });
// where a test room is dressed: a depth, or a boss (his depth; the boss room: him)
// (not 'where': that is /spawn's front or cursor, game/commands.js)
addType(commands, { name: 'dressing', values: () => [...commands.types.get('boss').values(), ...commands.types.get('depth').values()] });
dev({
  name: 'testroom', help: 'into a test room, dressed as this depth (or that one, or a boss\'s); boss: a boss in his arena; leave: back out; none: the list',
  args: [{ name: 'room', type: 'testroom', optional: true }, { name: 'where', type: 'dressing', optional: true }],
  async run({ room, where }) {
    if (room === 'leave') { await leaveTestRoom(); return; }
    if (room) return goTestRoom(room, where === undefined ? undefined : testRoomDepth(where));
    return [...Object.entries(TEST_ROOMS).map(([k, what]) => `${k}: ${what}`),
      isTestRoom(state.cubeKey) ? '/testroom leave: back out' : '/testroom <room> [depth or boss], /testroom boss <boss or depth>'].join('\n');
  },
});
dev({
  name: 'newworld', help: 'start a new world (N), with this seed', args: [{ name: 'seed', type: 'int', optional: true, min: 0, max: 2 ** 32 - 1 }],
  run({ seed }) {
    if (online.role === 'guest') return 'Only the host starts a new world';
    if (seed === undefined) { nextCube(); return; }
    newWorld(seed);
  },
});
dev({
  name: 'palette', help: 'other colours for the fluids (themes/fluids.js): another seed\'s, none: a random one, "classic": the old look',
  args: [{ name: 'seed', type: 'text', optional: true }],
  run({ seed }) {
    if (!state.cubes) return 'No world';
    if (seed === 'classic') setFluidPalettes();
    else {
      const s = seed === undefined || !Number.isFinite(+seed) ? (Math.random() * 2 ** 32) >>> 0 : +seed >>> 0;
      setFluidPalettes(s, state.cubes.layout.themes);
      seed = s;
    }
    // what the fluids here are now
    // (what the fluids here are now; *: what runs on from cube to cube)
    const rows = Object.values(state.map?.fluidRows || {});
    return `Fluid palettes: ${seed}` + (rows.length ? ' (here: ' + rows.map(r => paletteOf(r).name + (rowSlot(r) ? '' : '*')).join(', ') + ')' : '');
  },
});

// --- things ----------------------------------------------------------------------------------

dev({
  name: 'give', help: 'put things in the bag (weapons: /weapon, armor: /armor)', args: [{ name: 'item', type: 'item' }, { name: 'count', type: 'int', optional: true, min: 1, max: 9999 }],
  async run({ item, count = 1 }) {
    const def = ITEMS[item], inv = player.inventory;
    // every hero carries the tools (core/progression.js carryTools); a second one could never be dropped
    if (TOOLS.includes(def)) return countOf(inv, item) ? `You carry the ${def.name} already` : addItem(inv, item) ? `+1 ${def.name}` : 'No room in the bag';
    // gear: Vanilla, item level 1; the first one equipped (or put on), the rest into the bag
    if (def.weapon || def.armor) {
      if (inv.slots.filter(s => !s).length < count) return 'No room in the bag';
      const on = def.weapon ? await devSwapWeapon(item, 'vanilla', 1) : devWearArmor(item, 'vanilla', 1);
      if (!on) return def.weapon ? 'Could not equip it now' : 'Could not put it on';
      const roll = def.weapon ? rollWeapon : rollArmor;
      for (let i = 1; i < count; i++) addInstance(inv, roll(Math.random, 1, { itemId: item, rarity: 'vanilla' }));
      return `${def.weapon ? 'Equipped' : 'Wearing'}: ${def.name} (Vanilla)${count > 1 ? `, ${count - 1} more in the bag` : ''}`;
    }
    if (!addItem(inv, item, count)) return 'No room in the bag';
    autoBar(inv, item);   // a potion goes on the quick bar, as when picked up
    return `+${count} ${def.name}`;
  },
});
dev({
  name: 'weapon', help: 'roll a weapon and equip it (or drop it at your feet)',
  args: [{ name: 'weapon', type: 'weapon' }, { name: 'rarity', type: 'rarity', optional: true },
    { name: 'level', type: 'int', optional: true, min: 1, max: MAX_ILVL }, { name: 'drop', type: 'drop', optional: true }],
  async run({ weapon, rarity = 'unusual', level = 8, drop }) {
    const name = `${ITEMS[weapon].name} (${RARITY[rarity].name}, item level ${level})`;
    if (drop) return devDropWeapon(weapon, rarity, level) ? `Dropped: ${name}` : 'Could not drop it here';
    return await devSwapWeapon(weapon, rarity, level) ? `Equipped: ${name}` : 'Could not equip it (bag full, or busy)';
  },
});
dev({
  name: 'armor', help: 'roll a piece of armor and put it on (or drop it at your feet)',
  args: [{ name: 'armor', type: 'armor' }, { name: 'rarity', type: 'rarity', optional: true },
    { name: 'level', type: 'int', optional: true, min: 1, max: MAX_ILVL }, { name: 'drop', type: 'drop', optional: true }],
  run({ armor, rarity = 'unusual', level = 8, drop }) {
    const name = `${ITEMS[armor].name} (${RARITY[rarity].name}, item level ${level})`;
    if (drop) return devDropArmor(armor, rarity, level) ? `Dropped: ${name}` : 'Could not drop it here';
    return devWearArmor(armor, rarity, level) ? `Wearing: ${name}` : 'Could not put it on (bag full)';
  },
});
addType(commands, { name: 'enchant', values: () => [...ENCHANTS.map(e => ({ value: e.id, label: e.name })), { value: 'off', label: 'off' }] });
dev({
  name: 'enchant', help: 'enchant the equipped weapon, for free (off: take it off)', args: [{ name: 'enchantment', type: 'enchant' }],
  run({ enchantment }) {
    const w = equippedItem(player.inventory);
    if (!w?.gen) return 'No weapon equipped';
    const { enchant, ...gen } = w.gen;
    w.gen = enchantment === 'off' ? gen : { ...gen, enchant: enchantment };
    player.inventory.version++;
    const e = enchantOf(w);
    return e ? `${ENCHANT[e.id].name}: ${describeEnchant(e.id, e.value)}` : 'Not enchanted any more';
  },
});
dev({
  name: 'wear', help: 'put something on your head (off: take it off)', args: [{ name: 'thing', type: 'wearable' }],
  async run({ thing }) {
    const off = thing === 'off';
    return await devWear(off ? null : thing) ? off ? 'Took it off' : `Wearing the ${ITEMS[thing].name}` : 'Could not wear that now';
  },
});
dev({
  name: 'gold', help: 'gold coins into the purse', args: [{ name: 'amount', type: 'int', min: 1, max: 1e6 }],
  run({ amount }) { addItem(player.inventory, 'item_coin_gold', amount); return `+${amount} gold`; },
});

// --- the hero ----------------------------------------------------------------------------------

dev({
  name: 'heal', help: 'full health, no poison, no fire, no chill',
  run() {
    if (player.hp <= 0 || player.down) return 'Too late for that';
    player.hp = player.maxHp; player.burning = null; player.toxic = null; player.chilled = null; player.slowed = null;
    return 'Healed';
  },
});
dev({
  name: 'god', help: 'invincible: nothing takes any health, fluids put you back on safe ground (again: mortal)',
  args: [{ name: 'on|off', type: 'toggle', optional: true }],
  run({ 'on|off': on }) {
    player.god = on ? on === 'on' : !player.god;
    if (player.god && player.hp > 0 && !player.down) player.hp = player.maxHp;
    return player.god ? 'God mode on: invincible' : 'God mode off: mortal again';
  },
});
dev({
  name: 'level', help: 'become this level (health full)', args: [{ name: 'level', type: 'int', min: 1, max: 99 }],
  run({ level }) {
    player.xp = xpForLevel(level); player.level = levelFromXP(player.xp);
    player.maxHp = fullHealth(player.level, player.inventory);
    if (player.hp > 0) player.hp = player.maxHp;
    return `Level ${player.level}`;
  },
});
// --- saves (game/save.js) --------------------------------------------------------------------

const heroes = () => store.heroes().map(h => ({ value: h.id, label: h.name, hint: `level ${heroLevel(h)}` }));
const worlds = () => store.worlds().map(w => ({ value: w.id, label: w.name, hint: `seed ${w.seed}, depth ${w.deepest}` }));
addType(commands, { name: 'hero', values: heroes });
addType(commands, { name: 'savedworld', values: () => [...worlds(), { value: 'new', label: 'new', hint: 'a new world' }] });
addType(commands, { name: 'save', values: () => [...heroes().map(h => ({ ...h, hint: `hero, ${h.hint}` })), ...worlds().map(w => ({ ...w, hint: `world, ${w.hint}` }))] });

dev({
  name: 'saves', help: 'the saved heroes and worlds',
  run() {
    const h = savedHero(), w = savedWorld();
    return [`Saving: ${h ? h.name : 'no hero'} in ${w ? w.name : 'no world'}`,
      ...store.heroes().map(x => `hero ${x.name}: level ${heroLevel(x)}, ${Math.round(x.playTime / 60)} min`),
      ...store.worlds().map(x => `world ${x.name}: seed ${x.seed}, depth ${x.deepest}`)].join('\n');
  },
});
dev({
  name: 'save', help: 'save as this hero (made, or overwritten) in this world (saved as a new one if it is not yet)',
  args: [{ name: 'hero', type: 'text' }],
  run({ hero }) { return saveAs(hero); },
});
dev({
  name: 'load', help: 'play a saved hero in a saved world (its own one, else a new one)',
  args: [{ name: 'hero', type: 'hero' }, { name: 'world', type: 'savedworld', optional: true }],
  async run({ hero, world }) {
    if (online.role) return 'Not while playing together';
    world ??= store.heroWorld(hero)?.id ?? 'new';
    if (world === 'new') { const w = newSavedWorld(); if (!w) return `There are ${MAX_WORLDS} worlds already`; world = w.id; }
    await play(hero, world);
    return `${savedHero().name} in ${savedWorld().name}`;
  },
});
dev({ name: 'menu', help: 'save and quit to the main menu', run() { quitToMenu(); } });
dev({
  name: 'delete', help: 'delete a saved hero or world', args: [{ name: 'save', type: 'save' }],
  run({ save }) {
    const h = store.hero(save), w = store.worlds().find(x => x.id === save);
    forget(save);
    if (h) store.deleteHero(save); else store.deleteWorld(save);
    return `Deleted ${h ? `hero ${h.name}` : `world ${w.name}`}`;
  },
});

// what the fixed lights' baked shadows look like (game/teach.js lightview)
addType(commands, { name: 'lightview', values: () => LIGHT_VIEWS.map(v => ({ value: v, label: v })) });
dev({
  name: 'lightview', help: "show the baked light: the sun's shadow, the fixed lights alone, the lightmap's texels (off: the picture)",
  args: [{ name: 'view', type: 'lightview' }],
  run({ view }) { lightview(view); return `Light view: ${view}`; },
});

// what the frames cost (game/perf.js)
dev({
  name: 'perf', help: 'show what the frames cost: frame rate, the lighting\'s level and what it draws, the bake, shaders compiled while drawing',
  args: [{ name: 'on|off', type: 'toggle', optional: true }],
  run({ 'on|off': on }) { return showPerf(on ? on === 'on' : undefined) ? 'Perf overlay on' : 'Perf overlay off'; },
});
dev({ name: 'bench', help: 'time the frame with a part of it off at a time (shadow maps, enemies\' shadows, fixed lights, fluid patterns)', run: () => runBench() });

addType(commands, { name: 'line', values: () => [...LINES.map(l => ({ value: l.id, label: l.id, hint: l.text })),
  { value: 'forget', label: 'forget', hint: 'she forgets what she said in this world' }] });
dev({
  name: 'narrate', help: 'the narrator says a line now (forget: she says everything again in this world)', args: [{ name: 'line', type: 'line' }],
  run: ({ line }) => devNarrate(line),
});

addType(commands, { name: 'film', values: () => Object.values(FILMS).map(f => ({ value: f.name, label: f.name, hint: f.shots.find(s => s.line)?.line ?? '' })) });
dev({
  name: 'film', help: 'play a film now (film/films.js), from `at` seconds in; also ?film=<name>&at=<s>',
  args: [{ name: 'film', type: 'film' }, { name: 'at', type: 'int', min: 0, max: 600, optional: true }],
  run: ({ film, at }) => (playFilm(FILMS[film], { at: at ?? 0 }) ? `Playing ${film}${at ? ` from ${at} s` : ''}` : 'A film is playing already'),
});

dev({
  name: 'music', help: 'hold one mood of the music (auto: let go)', args: [{ name: 'mood', type: 'mood' }],
  run({ mood }) { forceMood(mood === 'auto' ? null : mood); return mood === 'auto' ? 'The music picks its mood again' : `Music: ${mood}`; },
});

// Bounties (docs/quests.md, "Bounty"): a named, stronger enemy a quest puts on a hiding place
// (core/quests.js, game/questworld.js). Pure. Any kind the depth has may be one: four times its
// health, a third more damage, a little bigger, golden, worth four times the XP and coins, hard to
// stagger. It is an ordinary enemy otherwise, with an id of its own (`q:<quest id>`), so its
// death is remembered like any other (run.defeated) and goes back with a death in its cube.
import { enemyKind, ENEMY_KINDS, depthLevel } from './enemies.js';
import { DEPTH_SPAWNS } from './spawns.js';
import { mulberry32, hash32 } from './util.js';
import { noun, msg } from '../i18n/i18n.js';

export const BOUNTY = { hp: 4, damage: 1.3, xp: 4, size: 1.2, poise: 1.2 };
export const BOUNTY_NAMES = ['Grimfang', 'Old Snapjaw', 'Bristleback', 'Nightcrawler', 'Big Bertha', 'Thornback', 'Ironhide',
  'Mossmaw', 'Shadowtail', 'Rumbletooth', 'Scarface', 'Ashcoat', 'Sneaky Pete', 'Grumble', 'Wartnose', 'Longshanks',
  'Old Greyback', 'Muddleclaw', 'Biscuit', 'Lady Gnash', 'Stinkwhisker', 'Tumbleguts', 'Crookhorn', 'Snorebelly', 'Hollowgrin',
  'Gristle', 'Baron Bramble', 'Sootsnout', 'Wobblejaw', 'Pickles', 'Gloomtooth', 'Rattlebones', 'Fuzzy Ned', 'Mother Murk',
  'Cinderpaw', 'Knucklenose', 'Twitchtail', 'Granny Grit', 'Spike', 'Old Rumpus'];

const kinds = new Map();
// the bounty kind of enemy kind `type`, called `name`
export function bountyKind(type, name) {
  const key = type + '|' + name;
  if (kinds.has(key)) return kinds.get(key);
  const base = ENEMY_KINDS[type];
  if (!base) throw new TypeError(`Unknown enemy kind: ${type}`);
  // 'Grimfang the spider' (its name and its kind's, said in any language: core/enemies.js enemyWords)
  const words = { t: msg('{name} the {kind:lower}'), p: { name: noun(name, { proper: true }), kind: noun(base.label) }, of: 'kind', proper: true };
  const k = enemyKind(base, { type: 'bounty' + base.type, label: `${name} the ${base.label.toLowerCase()}`, words, bounty: true,
    poise: Math.max(base.poise ?? 0, BOUNTY.poise), light: '#ffcf4a', sparks: ['#ffcf4a', '#fff2c0'],
    colors: Object.fromEntries(Object.keys(base.parts ?? {}).map(role => [role, role === 'eyes' ? 'oklch(0.35 0.08 60)' : 'oklch(0.82 0.15 85)'])),
    mods: { hp: BOUNTY.hp, damage: BOUNTY.damage, xp: BOUNTY.xp, size: BOUNTY.size } });
  kinds.set(key, k);
  return k;
}
// the level a bounty at depth d is: one over the depth's
export const bountyLevel = d => depthLevel(d) + 1;

// which enemy a bounty at depth d is (one of the depth's kinds, as likely as they are there) and
// its name, from the seed; used: the names the world's bounties have already (each comes once,
// while there are names left)
export function pickBounty(depth, seed, used = new Set()) {
  const R = mulberry32(hash32(seed ^ 0xb0b7));
  const roster = DEPTH_SPAWNS[Math.min(depth, DEPTH_SPAWNS.length - 1)].roster.filter(r => ENEMY_KINDS[r.type] && !ENEMY_KINDS[r.type].boss);
  let r = R() * roster.reduce((n, x) => n + x.chance, 0), row = roster.at(-1);
  for (const x of roster) if ((r -= x.chance) < 0) { row = x; break; }
  const list = Object.entries(row.kinds);
  let w = R() * list.reduce((n, [, k]) => n + k, 0), type = list.at(-1)[0];
  for (const [t, k] of list) if ((w -= k) < 0) { type = t; break; }
  const free = BOUNTY_NAMES.filter(n => !used.has(n)), names = free.length ? free : BOUNTY_NAMES;
  return { enemy: ENEMY_KINDS[type] ? type : row.type, name: names[Math.floor(R() * names.length)] };
}

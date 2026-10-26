// The game's texts that live in data tables rather than in tr('...') calls: tools/i18n.mjs reads
// them from here, so a new item or enemy is a new message to translate. A new table of texts
// belongs here too. Each entry: where they come from -> the English texts.
import { GROUPS, ACTIONS, KEY_NAMES } from '../core/keybinds.js';
import { ITEMS, COINS } from '../core/items.js';
import { RARITIES } from '../core/gear/rarities.js';
import { AFFIXES } from '../core/gear/affixes.js';
import { ENCHANTS } from '../core/gear/enchants.js';
import { ENCHANTER_SAYS, SMITH_SAYS, ENCHANTED_SAYS, SOLD_SAYS, REROLLED_SAYS } from '../core/crafting.js';
import { SHOPS } from '../core/shops.js';
import * as enemies from '../core/enemies.js';
import { BOUNTY_NAMES } from '../core/bounties.js';
import { GIVERS, landmarkName } from '../core/quests.js';
import { ROLES } from '../core/npcs.js';
import { PROP_METADATA } from '../core/propmetadata.js';
import { THEMES } from '../themes/index.js';
import { KINDS as ATTACKS } from '../core/combat.js';
import { LINES } from '../core/narration.js';
import { FILMS } from '../film/films.js';

// the people's roles and relations, and a woman's of each that has one ('she|hermit': src/i18n/i18n.js
// nounOf; core/questplan.js RELATIONS)
const ROLE_NAMES = [...Object.values(ROLES).map(r => r.title), 'messenger', 'friend', 'apprentice', 'cousin'];
const PEOPLE = [...ROLE_NAMES, 'daughter', 'son', 'brother', 'sister', 'grandson', 'granddaughter'];

// every attack's reason ('Bitten by a spider!'), and a venomous bite's 'Poisoned by ...'
// (game/enemycombat.js)
function reasons() {
  const out = new Set();
  const seen = new Set();
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 6 || seen.has(o)) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      if (k === 'reason' && typeof v === 'string') { out.add(v); if (/^Bitten/.test(v)) out.add(v.replace(/^Bitten/, 'Poisoned')); }
      else walk(v, depth + 1);
    }
  };
  for (const x of Object.values(enemies)) walk(x, 0);
  return [...out];
}

const items = Object.values(ITEMS);
export function sources() {
  return {
    'src/core/keybinds.js GROUPS': GROUPS,
    'src/core/keybinds.js ACTIONS': ACTIONS.map(a => a.label),
    'src/core/keybinds.js KEY_NAMES': Object.values(KEY_NAMES),
    'src/core/items.js names': items.flatMap(i => [i.name, i.together?.name]).filter(Boolean),
    'src/core/items.js descriptions': items.flatMap(i => [i.description, i.together?.description]).filter(Boolean),
    'src/core/items.js COINS': COINS.map(c => `coin|${c.suffix}`),
    'src/core/gear/rarities.js': RARITIES.map(r => r.name),
    'src/core/gear/affixes.js': AFFIXES.flatMap(a => [a.name, a.text]),
    'src/core/gear/enchants.js': ENCHANTS.flatMap(e => [e.name, e.text, e.quip]),
    'src/core/crafting.js': [...new Set([ENCHANTER_SAYS, SMITH_SAYS, ENCHANTED_SAYS].flatMap(Object.values).concat(SOLD_SAYS, REROLLED_SAYS))],
    'src/core/shops.js': Object.values(SHOPS).flatMap(s => [s.title, s.trade, s.hello]),
    'src/core/enemies.js labels': [...new Set(Object.values(enemies.ENEMY_KINDS).filter(k => !k.baseLabel).map(k => k.label))],
    'src/core/enemies.js reasons': reasons(),
    'src/core/bounties.js': BOUNTY_NAMES,
    'src/core/quests.js GIVERS': Object.values(GIVERS).map(g => g.title),
    'src/core/npcs.js': [...PEOPLE, ...ROLE_NAMES.map(p => `she|${p}`)],
    'src/core/propmetadata.js landmarks': [...new Set(PROP_METADATA.filter(p => p.landmark).map(p => landmarkName(p.name)))],
    'src/themes/index.js': Object.values(THEMES).map(t => t.name),
    'src/core/combat.js KINDS': Object.values(ATTACKS).map(k => k.verb),
    'src/core/narration.js': LINES.map(l => l.text),
    'src/film/ lines': Object.values(FILMS).flatMap(f => f.shots.map(s => s.line).filter(Boolean)),
  };
}

// Indonesian (Bahasa Indonesia). The catalog is split by what the words are about; a message is
// in one part only (tools/i18n.mjs checks it). Terms the game and the kids' guide share are in
// src/i18n/glossary.js: use its words.
import { grammar } from './grammar.js';
import { names } from './names.js';
import ui from './ui.js';
import items from './items.js';
import enemies from './enemies.js';
import quests from './quests.js';
import trials from './trials.js';

export const parts = { ui, items, enemies, quests, trials };

export default {
  code: 'id',
  grammar,
  names,
  messages: Object.assign({}, ...Object.values(parts)),
};

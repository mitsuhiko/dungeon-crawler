// English, the language the game is written in: its messages are the code's own text, so all it
// has here is its grammar (the forms of a noun in a sentence, src/i18n/i18n.js) and what the
// grammar cannot guess about a noun: NOUNS.
//
// A noun's forms, {thing:form} in a message:
//   the     'the lantern'       a      'a lantern', 'an urn', 'fireworks' (plural: no article)
//   lower   'lantern'           pl     'lanterns' (NOUNS[..].pl, else + s)
//   it      'it', 'them'        this   'this', 'these'
//   is      'is', 'are'         they   'it', 'they'
//   cap     'Lantern' (the first letter up)
// and for people (a name with its gender, src/i18n/i18n.js person): he, him, his ('she', 'her', 'her')
// A proper name ('Ada', 'Grimfang') keeps its capitals and takes no article; a noun said with
// `caps` (noun('Redback', { caps: true }): an enemy's kind) keeps its capitals, with an article.

// { [english noun]: { pl: plural, g: 'pl' (it is plural already), an: true / false } }
export const NOUNS = {
  'Flour sacks': { g: 'pl' }, Fireworks: { g: 'pl' }, 'Silver bars': { g: 'pl' }, 'Clockwork gears': { g: 'pl' },
  Toadstools: { g: 'pl' }, 'Butter lamps': { g: 'pl' }, 'Prayer stones': { g: 'pl' }, 'Paper lanterns': { g: 'pl' },
  'Cave mushrooms': { g: 'pl' }, 'Beeswax candles': { g: 'pl' }, 'Spider eggs': { g: 'pl' }, 'Painted pots': { g: 'pl' },
  'Pink salt': { pl: 'lumps of pink salt' }, 'Sea glass': { pl: 'handfuls of sea glass' },
  'Never-melting ice': { pl: 'bundles of never-melting ice' }, Obsidian: { pl: 'pieces of obsidian' },
  "Bird's nest": { pl: "birds' nests" }, "Statue's head": { pl: 'stone heads' }, 'Jar of thunder': { pl: 'jars of thunder' },
  'Heart of ice': { pl: 'hearts of ice' }, Compass: { pl: 'compasses' },
  Moose: { pl: 'Moose' }, 'Frost moose': { pl: 'Frost moose' }, 'Bog moose': { pl: 'Bog moose' },   // (a Moose, two Moose)
  'Mont Moose': { pl: 'Mont Moose' },
};

// a common noun is lower case in a sentence; a name (proper) or a kind of enemy (caps: 'a Redback')
// keeps its capitals
const lower = n => (n.proper || n.caps ? n.word : n.word.toLowerCase());
const plural = n => (n.g === 'pl' ? lower(n) : n.pl ?? (/(s|x|ch|sh)$/.test(n.word) ? `${lower(n)}es` : `${lower(n)}s`));
const article = n => (n.an ?? /^[aeiou]/i.test(n.word) ? 'an' : 'a');

export const grammar = {
  form(n, name) {
    const many = n.g === 'pl';
    switch (name) {
      case 'the': return n.proper ? n.word : `the ${lower(n)}`;
      case 'a': return n.proper ? n.word : many ? lower(n) : `${article(n)} ${lower(n)}`;
      case 'lower': return lower(n);
      case 'cap': return n.word.charAt(0).toUpperCase() + n.word.slice(1);
      case 'pl': return plural(n);
      case 'it': return many ? 'them' : n.proper && n.g !== 'n' ? (n.g === 'f' ? 'her' : 'him') : 'it';
      case 'this': return many ? 'these' : 'this';
      case 'is': return many ? 'are' : 'is';
      case 'they': return many ? 'they' : 'it';
      case 'he': return { f: 'she', m: 'he', pl: 'they' }[n.g] ?? 'it';
      case 'him': return { f: 'her', m: 'him', pl: 'them' }[n.g] ?? 'it';
      case 'his': return { f: 'her', m: 'his', pl: 'their' }[n.g] ?? 'its';
      default: throw new Error(`Unknown English form: ${name}`);
    }
  },
  forms: ['the', 'a', 'lower', 'cap', 'pl', 'it', 'this', 'is', 'they', 'he', 'him', 'his'],
};

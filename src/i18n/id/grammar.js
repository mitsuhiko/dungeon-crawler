// Indonesian (Bahasa Indonesia) grammar for the messages (src/i18n/i18n.js). Indonesian has no
// articles, no gender and no plural inflection, so a noun is said as it stands and the sentence
// does the rest: the definite one is "{thing:lower} itu", the possessive "…-nya" ("{person:it}"
// for the person who owns it). The forms the English messages ask for still answer sensibly:
//   the   the word (no article)        a      the word (no article)
//   lower the word, small letters      cap    the word with its first letter up
//   pl    the word (no plural ending)  is     'adalah' (a sentence rarely needs it)
//   it    'itu', for a person 'dia'    this   'ini'
//   they  'itu', for people 'mereka'   he     'dia'
//   him   'dia'                        his    'miliknya'
// A name (a person, a bounty) is said as it is.

const lower = n => (n.proper || n.caps ? n.word : n.word.toLowerCase());

export const grammar = {
  form(n, name) {
    switch (name) {
      case 'the': return n.word;
      case 'a': return n.word;
      case 'lower': return lower(n);
      case 'cap': return n.word.charAt(0).toUpperCase() + n.word.slice(1);
      case 'pl': return lower(n);
      case 'it': return n.proper && n.g !== 'n' ? 'dia' : 'itu';
      case 'this': return 'ini';
      case 'is': return 'adalah';
      case 'they': return n.proper && n.g !== 'n' ? 'mereka' : 'itu';
      case 'he': return 'dia';
      case 'him': return 'dia';
      case 'his': return 'miliknya';
      default: throw new Error(`Unknown Indonesian form: ${name}`);
    }
  },
  forms: ['the', 'a', 'lower', 'cap', 'pl', 'it', 'this', 'is', 'they', 'he', 'him', 'his'],
};

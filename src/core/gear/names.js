// Generated item names. Every rarity gets one; the better the item, the grander the name:
//   crap:          a sad word and the base                "Soggy Long Sword"
//   shitty:        a worn word and the base               "Wonky Long Sword"
//   vanilla:       a plain word and the base              "Sensible Long Sword"
//   unremarkable:  a lukewarm word and the base           "Perfectly Fine Long Sword"
//   decent:        two words                              "Sneaky Nibbler"
//   unusual:       a compound                             "Goblinbotherer"
//   remarkable:    a compound and a title                 "Frostbite the Mildly Cursed"
//   fabled:        a compound and an epithet              "Grimfang, Eater of Lunches"
//   impossible:    a compound and an impossible epithet   "Doomsong, That Should Not Be"
//   omg:           an old root, compound and epithet      "Ur-Stormreaver, Mother of All Pointy Things"
// The base type is always shown with it (in the UI), except where it is part of the name.
// Mostly earnest words, with a few sillier ones mixed in.
// The name is kept in English (gen.name: saves, the network); another language says it with its
// own words (src/i18n/<code>/names.js, a list for each of these, in the same order): the words
// are found again in the English name (wordsOf). Change a word here together with its
// translations (tools/i18n.mjs checks the lists line up); a name whose words are gone shows in
// English.
import { language, localeNames, nounOf, noun, tr } from '../../i18n/i18n.js';
import { ITEMS } from '../items.js';
const CRAP = ['Soggy', 'Wobbly', 'Chewed', 'Lopsided', 'Mouldy', 'Squeaky', 'Rusty', 'Bent', 'Sad', 'Damp'];
const SHITTY = ['Dented', 'Chipped', 'Dull', 'Wonky', 'Borrowed', 'Discount', 'Secondhand', 'Creaky', 'Scuffed',
  'Questionable'];
const VANILLA = ['Iron', 'Sturdy', 'Militia', 'Plain', 'Standard', 'Regular', 'Trusty', 'Everyday', 'Sensible', "Guard's"];
const MEH = ['Perfectly Fine', 'Adequate', 'Serviceable', 'Okay-ish', 'Nondescript', 'Beige', 'Forgettable',
  'Unobjectionable'];
const ADJ = ['Bright', 'Keen', 'Grim', 'Grumpy', 'Polite', 'Sneaky', 'Jolly', 'Cheeky', 'Snappy', 'Bitter', 'Wild', 'Cold'];
const NOUN = ['Fang', 'Thorn', 'Sting', 'Whisper', 'Promise', 'Nibbler', 'Tickler', 'Bonk', 'Elbow', 'Wink', 'Hiccup',
  'Claw'];
const ROOT = ['Grim', 'Dusk', 'Storm', 'Frost', 'Ash', 'Blood', 'Night', 'Dawn', 'Gloom', 'Star', 'Bone', 'Ember',
  'Raven', 'Thorn', 'Wolf', 'Hollow', 'Iron', 'Doom', 'Sun', 'Void', 'Goblin', 'Badger', 'Toad', 'Moth', 'Grumble'];
const TAIL = ['fang', 'bane', 'bite', 'brand', 'edge', 'reaver', 'cleaver', 'thorn', 'song', 'fall', 'shard',
  'caller', 'render', 'splitter', 'whisper', 'sting', 'nibbler', 'bonker', 'muncher', 'botherer', 'tickler'];
const TITLE = ['the Bold', 'the Restless', 'the Patient', 'the Grim', 'the Eager', 'the Polished', 'the Mildly Cursed',
  'the Adequately Feared', 'the Well-Meaning', 'the Surprisingly Heavy', 'the Second Best', 'the Unwashed'];
const EPITHET = ['the Last Oath', 'the Unbroken', 'Warden of Depths', 'the Hungering', 'Kingslayer', 'Heart of Ash',
  'Breaker of Gates', 'the Lantern', 'Eater of Lunches', 'Bane of Knees', 'Ruin of Tuesdays', 'the Slightly Haunted',
  'Who Hums in the Dark'];
const IMPOSSIBLE = ['That Should Not Be', 'the Unexplainable', 'Defier of Arithmetic', "Physics' Regret",
  'Breaker of Rules', 'the Paradox', 'the Ninth Hour', 'Who Was Never Forged'];
const OLD = ['Ur-', 'Elder ', 'First ', 'Primal ', 'Mega-'];
const OMG = ['Bane of Kings', 'Who Was Before', 'the World-Root', 'Eye of the Abyss', 'Last of the First Forge',
  'the Sleeping Star', 'Mother of All Pointy Things', 'Ender of Arguments', 'the Absolute Unit'];

// armor has words of its own where the weapons' would not fit ("Grim Shell", "Duskward",
// "Ur-Stoneguard, Mother of All Lids")
const ARMOR_NOUN = ['Shell', 'Hug', 'Bucket', 'Blanket', 'Wall', 'Promise', 'Lid', 'Huddle', 'Cuddle', 'Hide', 'Shelter',
  'Elbow'];
const ARMOR_TAIL = ['guard', 'ward', 'shell', 'hide', 'mantle', 'wall', 'keep', 'shroud', 'bulwark', 'cover', 'hugger',
  'huddle', 'bucket', 'blanket'];
const ARMOR_OMG = ['Mother of All Lids', 'the Unbudging', 'Wall of the World', 'Who Was Never Dented', 'Last of the First Forge',
  'the Sleeping Mountain', 'Ender of Arguments', 'the Absolute Unit'];

// every list, by the name the translations use
export const WORDS = { CRAP, SHITTY, VANILLA, MEH, ADJ, NOUN, ROOT, TAIL, TITLE, EPITHET, IMPOSSIBLE, OLD, OMG, ARMOR_NOUN, ARMOR_TAIL, ARMOR_OMG };

const pick = (list, rng) => list[Math.floor(rng() * list.length)];
function compound(rng, tails = TAIL) {   // never "Thornthorn" or "Boneedge"
  const root = pick(ROOT, rng), end = root.at(-1).toLowerCase();
  return root + pick(tails.filter(t => t !== root.toLowerCase() && t[0] !== end), rng);
}

// armor: a piece of armor's words (the weapons' otherwise)
// learn: loot.html#affixes (see learn/README.md)
export function itemName(rarity, baseName, rng, armor = false) {
  const tails = armor ? ARMOR_TAIL : TAIL;
  switch (rarity) {
    case 'crap': return `${pick(CRAP, rng)} ${baseName}`;
    case 'shitty': return `${pick(SHITTY, rng)} ${baseName}`;
    case 'vanilla': return `${pick(VANILLA, rng)} ${baseName}`;
    case 'unremarkable': return `${pick(MEH, rng)} ${baseName}`;
    case 'decent': return `${pick(ADJ, rng)} ${pick(armor ? ARMOR_NOUN : NOUN, rng)}`;
    case 'unusual': return compound(rng, tails);
    case 'remarkable': return `${compound(rng, tails)} ${pick(TITLE, rng)}`;
    case 'fabled': return `${compound(rng, tails)}, ${pick(EPITHET, rng)}`;
    case 'impossible': return `${compound(rng, tails)}, ${pick(IMPOSSIBLE, rng)}`;
    default: return `${pick(OLD, rng)}${compound(rng, tails)}, ${pick(armor ? ARMOR_OMG : OMG, rng)}`;
  }
}
// whether the name already says what the item is (no base line needed under it)
const NAMES_BASE = new Set(['crap', 'shitty', 'vanilla', 'unremarkable']);
export const namesBase = rarity => NAMES_BASE.has(rarity);

// --- the name in other languages ---------------------------------------------------------------

const ONE_WORD = { crap: 'CRAP', shitty: 'SHITTY', vanilla: 'VANILLA', unremarkable: 'MEH' };
const AFTER = { remarkable: [' ', 'TITLE'], fabled: [', ', 'EPITHET'], impossible: [', ', 'IMPOSSIBLE'] };
const at = (list, word) => { const i = WORDS[list].indexOf(word); return i < 0 ? null : [list, i]; };
// 'Goblinbotherer' -> [['ROOT', i], ['TAIL', j]]
function compoundOf(s, armor) {
  const tails = armor ? 'ARMOR_TAIL' : 'TAIL';
  for (const [i, root] of ROOT.entries()) {
    if (!s.startsWith(root)) continue;
    const tail = at(tails, s.slice(root.length));
    if (tail) return [['ROOT', i], tail];
  }
  return null;
}
// The words a generated name is made of, found again in it: { rarity, armor, parts: [[list,
// index] ...] } (parts: [] for a base's own name, the glassmaker's old sword's), or null where they are not
// (a name from an older list, a developer's).
export function wordsOf(item) {
  const gen = item?.gen, def = ITEMS[item?.itemId];
  if (!gen || typeof gen.name !== 'string' || !def) return null;
  const { rarity } = gen, name = gen.name, armor = !!def.armor;
  if (name === def.name) return { rarity, armor, parts: [] };
  if (ONE_WORD[rarity]) {
    if (!name.endsWith(` ${def.name}`)) return null;
    const w = at(ONE_WORD[rarity], name.slice(0, -def.name.length - 1));
    return w && { rarity, armor, parts: [w] };
  }
  if (rarity === 'decent') {
    for (const [i, adj] of ADJ.entries()) {
      if (!name.startsWith(`${adj} `)) continue;
      const n = at(armor ? 'ARMOR_NOUN' : 'NOUN', name.slice(adj.length + 1));
      if (n) return { rarity, armor, parts: [['ADJ', i], n] };
    }
    return null;
  }
  if (rarity === 'unusual') { const c = compoundOf(name, armor); return c && { rarity, armor, parts: c }; }
  let rest = name, old = null;
  if (rarity === 'omg') {
    const i = OLD.findIndex(o => name.startsWith(o));
    if (i < 0) return null;
    old = ['OLD', i]; rest = name.slice(OLD[i].length);
  }
  const [sep, list] = AFTER[rarity] ?? [', ', armor ? 'ARMOR_OMG' : 'OMG'];
  for (let k = rest.indexOf(sep); k >= 0; k = rest.indexOf(sep, k + 1)) {
    const c = compoundOf(rest.slice(0, k), armor), end = at(list, rest.slice(k + sep.length));
    if (c && end) return { rarity, armor, parts: [...(old ? [old] : []), ...c, end] };
  }
  return null;
}
// The item's name in the language of the moment; enchant: its enchantment's name (English, an
// adjective: 'Toasty'), said in front of it. English: as it was rolled.
export function sayName(item, enchant = null) {
  const def = ITEMS[item?.itemId], name = item?.gen?.name ?? def?.name ?? '';
  const names = localeNames();
  if (language() === 'en' || !names || !def) return enchant && name ? `${enchant} ${name}` : name;
  const words = item?.gen ? wordsOf(item) : { rarity: null, armor: !!def.armor, parts: [] };
  const base = nounOf(noun(def.name)), adjective = enchant && tr(enchant);
  if (!words) return adjective && name ? `${names.adjective(adjective, 'm')} ${name}` : name;
  return names.say(words, base, adjective);
}

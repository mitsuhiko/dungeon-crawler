// The chronicle: the diary of this visit to the game (game/log.js keeps it, game/console.js shows
// it). Pure: no DOM, no game state, so it can be tested in node.
//
// An entry is plain data: { id, kind, data, who, at, time }
//   kind: what happened (KINDS); data: its details
//   who:  null when it happened to us, { slot, name } when to a friend (or they said it)
//   at:   Date.now() when it happened; time: seconds since the page opened
// The words are made only when an entry is shown (describe), so the same entry reads "You
// died" on our screen and "Anna died" on a friend's, and each in the reader's language: what an
// entry keeps about things is English text (a message: src/i18n/) or words (src/i18n/i18n.js
// say), never words in one language. Playing together, some kinds are told to the others (NEWS,
// net/session.js `news`) and every chat line is (`chat`).
//
// Nothing of it is saved: a reload starts a new diary.
import { RARITY } from './gear/rarities.js';
import { ENCHANT } from './gear/enchants.js';
import { AFFIX } from './gear/affixes.js';
import { formatCoins } from './inventory.js';
import './gear/stats.js';   // (an item's words say themselves: sayAs('item'))
import { lineById, lineText } from './narration.js';
import { tr, msg, say, language, cleanWords } from '../i18n/i18n.js';

// learn: memory.html#diary (see learn/README.md)
export const LOG_LIMIT = 200;   // entries kept; the oldest go first
export const MERGE_TIME = 6;    // s: kills this close together are one line

// What can happen. group: the console's filter it shows under (all of them show under "All")
// learn: memory.html#diary (see learn/README.md)
export const KINDS = {
  chat: { group: 'chat' },       // { text }: something someone said
  death: { group: 'events' },    // a death record (deathRecord)
  down: { group: 'events' },     // { cause, by }: lying downed, a friend can help (game/downed.js)
  up: { group: 'events' },       // { by }: helped up again
  level: { group: 'events' },    // { level }
  guardian: { group: 'events' }, // { label, level, depth, boss }: a guardian (boss: a real boss) defeated, its gate open;
                                 // label: its words (core/enemies.js enemyWords)
  depth: { group: 'events' },    // { depth, place }: the first time down there in this world
  loot: { group: 'events' },     // { item, rarity }: a rare (or better) weapon or piece of armor picked up (item: its
                                 // words, core/gear/stats.js itemWords)
  kill: { group: 'events' },     // { count, xp }: enemies defeated (merged, MERGE_TIME)
  horde: { group: 'events' },    // {}: a horde woke up
  trial: { group: 'events' },    // { name, depth, what: 'resolved' | 'failed' }: a trial room (core/trials.js) met or failed
  trade: { group: 'events' },    // { item, copper }: bought something
  craft: { group: 'events' },    // { what: 'enchant' | 'reroll', item, enchant | affix, into?, copper }: the Enchanter
                                 // or the Smith worked on a weapon (core/crafting.js): enchanted it (an
                                 // enchantment's id), or re-rolled an affix (ids; into: what it became)
  quest: { group: 'events' },    // { title, what, giver?, xp?, copper? }: a quest taken ('taken'), its goals done
                                 // ('ready'), handed in and paid ('done'), failed or started again
  party: { group: 'events' },    // { text }: someone joined or left
  world: { group: 'events' },    // { seed, name? }: a new world began (name: a saved one, back in it)
  narration: { group: 'events' },// { line, form }: what the narrator said (core/narration.js: a line's id, and its form)
  system: { group: 'system' },   // { text }: what the console says (help, mistakes)
  dev: { group: 'system' },      // { text, error? }: what a developer command did
};
// what a friend is told about (net/session.js `news`)
// learn: memory.html#diary (see learn/README.md)
export const NEWS = new Set(['death', 'down', 'up', 'level', 'guardian', 'depth', 'loot', 'trial']);

export const createLog = () => ({ entries: [], next: 1, version: 0 });
export function clearLog(log) { log.entries.length = 0; log.version++; }

// Write an entry down; kills right after kills (ours, within MERGE_TIME) go onto the same line.
// Returns the entry (the merged one too).
// learn: memory.html#diary-code (see learn/README.md)
export function addEntry(log, kind, data = {}, { who = null, at = 0, time = 0 } = {}) {
  if (!Object.hasOwn(KINDS, kind)) throw new TypeError(`Unknown chronicle kind: ${kind}`);
  const last = log.entries.at(-1);
  if (kind === 'kill' && !who && last?.kind === 'kill' && !last.who && time - last.time <= MERGE_TIME) {
    last.data = { count: last.data.count + data.count, xp: last.data.xp + data.xp };
    last.time = time; last.at = at;
    log.version++;
    return last;
  }
  const entry = { id: log.next++, kind, data, who, at, time };
  log.entries.push(entry);
  if (log.entries.length > LOG_LIMIT) log.entries.splice(0, log.entries.length - LOG_LIMIT);
  log.version++;
  return entry;
}

// --- what a death says -----------------------------------------------------------------------

// A blow's reason ('Bitten by a Redback!') as part of a sentence ('bitten by a Redback'): in
// English, where the reasons are written to stand alone; another language says it as it is.
// The reason is kept in English (the message: src/i18n/), and said when it is shown.
export function phrase(reason) {
  const s = String(reason ?? '').trim().replace(/[!.]+$/, '');
  if (!s) return '';
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}
export const sayCause = cause => !cause ? '' : typeof cause !== 'string' ? say(cause)
  : language() === 'en' ? phrase(cause) : tr(cause).trim().replace(/[!.]+$/, '');
// the enemy behind a blow (game/enemycombat.js attacker): { words, level, guardian }; words: what
// it is called (core/enemies.js enemyWords), in any language
export function cleanBy(by) {
  if (!by || typeof by !== 'object') return null;
  const words = cleanWords(by.words ?? by.label);
  if (words == null) return null;
  const level = Number.isInteger(by.level) && by.level > 0 && by.level < 1000 ? by.level : null;
  return { words, level, guardian: !!by.guardian };
}

// What the chronicle keeps about a death: what did it, where, with what, and when.
// hurt: the last blow ({ reason, by }, player.lastHurt); the rest about us and the place (place
// and weapon: words, said when shown).
export function deathRecord(hurt, { depth = 0, place = '', cube = '', weapon = '', level = 1, session = 0 } = {}) {
  return { cause: String(hurt?.reason ?? '').trim() || msg('Out of luck'), by: cleanBy(hurt?.by), depth, place, cube, weapon, level,
    session: Math.max(0, Math.round(session)) };
}

// mm:ss (or h:mm:ss) of a number of seconds
export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, pad = n => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
// words kept in an entry: an English text (a message) or words of another kind (src/i18n/i18n.js)
const w = x => typeof x === 'string' ? tr(x) : say(x);
const where = (depth, place) => depth > 0 ? tr('depth {depth}, {place}', { depth, place: w(place) }) : place ? w(place) : tr('the surface');
const lv = by => by?.level ? ` (${tr('Lv {level}', { level: by.level })})` : '';
const enemy = by => by ? `${w(by.words)}${lv(by)}` : '';

// The entry as words, from our point of view (who: null, "You") or a friend's ("Anna"), in the
// language of the moment.
// learn: memory.html#diary-code (see learn/README.md)
export function describe({ kind, data: d = {}, who }) {
  const name = who?.name, you = !who;
  const by = d.by ? enemy(d.by) : '', cause = sayCause(d.cause);
  switch (kind) {
    case 'chat': return `${you ? tr('You') : name}: ${d.text}`;
    case 'death': return you ? tr('You died: {cause} · {where}', { cause: cause + lv(d.by), where: where(d.depth, d.place) })
      : tr('{name} died: {cause} · {where}', { name, cause: cause + lv(d.by), where: where(d.depth, d.place) });
    case 'down': return you ? tr('You are down: {cause}', { cause: cause + lv(d.by) })
      : tr('{name} is down: {cause}. Stand next to them to help them up', { name, cause: cause + lv(d.by) });
    case 'up': return !you ? tr('{name} is back on their feet', { name }) : d.by ? tr('{name} helped you up', { name: d.by }) : tr('You are back on your feet');
    case 'level': return you ? tr('You reached level {level}', { level: d.level }) : tr('{name} reached level {level}', { name, level: d.level });
    case 'guardian': {
      const p = { name, who: d.label, level: lv(d), depth: d.depth };
      return you ? tr('You defeated {who:the}{level} on depth {depth}: its gate is open', p) : tr('{name} defeated {who:the}{level} on depth {depth}: its gate is open', p);
    }
    case 'depth': return you ? tr('You reached depth {depth}: {place}', { depth: d.depth, place: w(d.place) })
      : tr('{name} reached depth {depth}: {place}', { name, depth: d.depth, place: w(d.place) });
    case 'loot': {
      const item = d.item ? say(d.item) : String(d.name ?? ''), r = RARITY[d.rarity] ? ` (${tr(RARITY[d.rarity].name)})` : '';
      return you ? tr('You found {item}', { item }) + r : tr('{name} found {item}', { name, item }) + r;
    }
    case 'kill': return tr('{count, plural, one {Defeated # enemy} other {Defeated # enemies}} · +{xp} XP', { count: d.count, xp: d.xp });
    case 'horde': return tr('A horde woke up!');
    case 'trial': {
      const p = { name, trial: w(d.name), depth: d.depth };
      if (d.what === 'failed') return you ? tr('You failed {trial} on depth {depth}', p) : tr('{name} failed {trial} on depth {depth}', p);
      return you ? tr('You mastered {trial} on depth {depth}: the way on is open', p) : tr('{name} mastered {trial} on depth {depth}: the way on is open', p);
    }
    case 'trade': return tr('Bought {item} for {price}', { item: w(d.item), price: formatCoins(d.copper ?? 0) });
    case 'craft': {
      const item = w(d.item), price = formatCoins(d.copper ?? 0);
      if (d.what === 'enchant') return tr('The Enchanter made {item} {enchant} for {price}', { item, enchant: tr(ENCHANT[d.enchant]?.name ?? ''), price });
      const affix = tr(AFFIX[d.affix]?.name ?? ''), into = tr(AFFIX[d.into]?.name ?? '');
      return d.into && d.into !== d.affix ? tr("The Smith re-rolled {item}'s {affix} into {into} for {price}", { item, affix, into, price })
        : tr("The Smith re-rolled {item}'s {affix} for {price}", { item, affix, price });
    }
    case 'quest': {
      const title = w(d.title);
      switch (d.what) {
        case 'taken': return tr('Quest taken: {title}', { title });
        case 'ready': return tr('Quest done: {title} · back to {giver}', { title, giver: w(d.giver) });
        case 'done': return [tr('Quest complete: {title}', { title }), ...d.xp ? [tr('+{xp} XP', { xp: d.xp })] : [],
          ...d.copper ? [formatCoins(d.copper)] : []].join(' · ');
        case 'failed': return tr('Quest failed: {title}', { title });
        case 'restarted': return tr('Quest started again: {title}', { title });
        default: return tr('Quest: {title}', { title });
      }
    }
    case 'narration': {
      const line = lineById(d.line);
      return line ? lineText(line, d.form) : '';
    }
    case 'world': return d.name ? tr('{name} · seed {seed}', { name: d.name, seed: String(d.seed) }) : tr('A new world · seed {seed}', { seed: String(d.seed) });
    default: return w(d.text ?? '');
  }
}
// the death record in full, line by line (the console shows it when the line is clicked)
export function details({ kind, data: d }) {
  if (kind !== 'death') return [];
  return [
    tr('Killed by: {what}', { what: d.by ? enemy(d.by) : sayCause(d.cause) }),
    d.cube ? tr('Where: {where} · cube {cube}', { where: where(d.depth, d.place), cube: d.cube }) : tr('Where: {where}', { where: where(d.depth, d.place) }),
    ...d.weapon ? [tr('Weapon: {weapon}', { weapon: w(d.weapon) })] : [],
    tr('Level: {level}', { level: d.level }),
    tr('After: {time} of playing', { time: clock(d.session) }),
  ];
}

// --- from the network ----------------------------------------------------------------------

// short plain text: no control characters, no surrounding space, at most max characters
export const cleanText = (s, max = 200) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi ? x : null;

// A friend's news (net/session.js `news`) as an entry's data we can show, or null: only the
// NEWS kinds, only the fields they have, of the right kinds and short.
// Words (a cause, a place, an item) only of the shapes say() knows (src/i18n/i18n.js cleanWords).
export function cleanNews(kind, d) {
  if (!NEWS.has(kind) || !d || typeof d !== 'object') return null;
  const text = (x, max = 60) => typeof x === 'string' ? cleanText(x, max) : '';
  const words = (x, fallback = '') => cleanWords(x) ?? fallback;
  switch (kind) {
    case 'death': {
      const depth = int(d.depth, 0, 999), level = int(d.level, 1, 999);
      if (depth === null || level === null) return null;
      return { cause: words(d.cause) || msg('Out of luck'), by: cleanBy(d.by), depth, place: words(d.place), cube: text(d.cube, 30),
        weapon: words(d.weapon), level, session: int(d.session, 0, 1e7) ?? 0 };
    }
    case 'down': return { cause: words(d.cause) || msg('Knocked out'), by: cleanBy(d.by) };
    case 'up': return { by: text(d.by, 16) || null };
    case 'level': { const level = int(d.level, 1, 999); return level === null ? null : { level }; }
    case 'guardian': {
      const depth = int(d.depth, 0, 999), label = words(d.label, null);
      return depth === null || !label ? null : { label, level: int(d.level, 1, 999), depth, boss: !!d.boss };
    }
    case 'depth': { const depth = int(d.depth, 1, 999); return depth === null ? null : { depth, place: words(d.place) }; }
    case 'loot': { const item = words(d.item, null); return item && Object.hasOwn(RARITY, d.rarity) ? { item, rarity: d.rarity } : null; }
    case 'trial': {
      const depth = int(d.depth, 0, 999), name = words(d.name, null);
      return depth === null || !name ? null : { name, depth, what: d.what === 'failed' ? 'failed' : 'resolved' };
    }
  }
  return null;
}

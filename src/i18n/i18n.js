// The game's languages (docs/i18n.md). The English text in the code is the message itself:
//
//   tr('Resume')                                   -> 'Weiter' in German
//   tr('Reached depth {depth}', { depth: 3 })      -> 'Tiefe 3 erreicht'
//   tr('{n, plural, one {# enemy} other {# enemies}} defeated', { n })
//
// so the code reads as it always did, and every other language is a catalog from the English
// text to its own (src/i18n/<code>/). A message changed in English is a new message: the old
// translation goes unused and the new one is missing until somebody translates it, and
// `npm run i18n` (tools/i18n.mjs, also run by `npm test`) lists both. Where a translation is
// missing the English shows.
//
// What a message may say (a small part of ICU MessageFormat, and grammar forms):
//   {name}                         a parameter: a number (in the language's digits), a text, a
//                                  phrase (below) or a noun (its word)
//   {name:form}                    a noun's grammar form, by language (src/i18n/<code>/grammar.js):
//                                  English 'the', 'a', 'pl', 'it', 'this' ..., German 'den', 'einem',
//                                  'seine', 'ihn' ... (the case and the article, said by the
//                                  masculine word); with a capital ('The', 'Den') it starts with one
//   {n, plural, one {...} other {...}}   by the language's plural rules; # is the number, =0 {...} exact
//   {x, select, a {...} other {...}}     by a text, or a noun's gender ('m', 'f', 'n', 'pl')
//
// Words kept for later (a quest's text, a chronicle line, an item's name) are kept as data, not
// as words in one language, and said when they are shown (`phrase`, `noun`, `say`): a world saved
// in German loads in English, and friends playing together each read their own language.
//
// Pure, for the game, its worker, the guide and the tests in node (always English there).
import { grammar as EN_GRAMMAR, NOUNS as EN_NOUNS } from './en.js';

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'id', name: 'Bahasa Indonesia' },
];
export const CODES = LANGUAGES.map(l => l.code);
export const SOURCE = 'en';

// a locale: { messages: { [english]: text | noun entry }, grammar, names? } (src/i18n/<code>/index.js)
const loaders = { de: () => import('./de/index.js'), id: () => import('./id/index.js') };
const loaded = new Map();
let current = SOURCE, locale = null;
const listeners = new Set();

export const language = () => current;
// the current language's way of saying generated item names (core/gear/names.js sayName)
export const localeNames = () => locale?.names ?? null;
export const isLanguage = code => CODES.includes(code);

// the first of the reader's languages (navigator.languages) the game speaks, else English
export function pickLanguage(wanted = []) {
  for (const w of wanted) {
    const code = String(w ?? '').toLowerCase().split(/[-_]/)[0];
    if (isLanguage(code)) return code;
  }
  return SOURCE;
}

export async function loadLocale(code) {
  if (code === SOURCE || !isLanguage(code)) return null;
  if (!loaded.has(code)) loaded.set(code, (await loaders[code]()).default);
  return loaded.get(code);
}
// switch at once to a locale already loaded (or given: the tests)
export function useLanguage(code, mod = loaded.get(code)) {
  if (!isLanguage(code)) code = SOURCE;
  if (code !== SOURCE && !mod) throw new Error(`Language ${code} is not loaded`);
  if (mod) loaded.set(code, mod);
  const changed = code !== current;
  current = code; locale = code === SOURCE ? null : mod;
  compiled.clear();
  if (changed) for (const fn of listeners) fn(code);
}
export async function setLanguage(code) {
  if (!isLanguage(code)) code = SOURCE;
  useLanguage(code, await loadLocale(code));
  return code;
}
// fn(code) after the language changed
export function onLanguageChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// --- messages ------------------------------------------------------------------------------------

// the translation of an English text in the current language (null: none)
function entryOf(source) {
  const e = locale?.messages[source];
  return e ?? null;
}
const textOf = e => (typeof e === 'string' ? e : e?.text ?? null);

// missing translations seen while playing (the dev tools show them)
export const missing = new Set();
const compiled = new Map();
function compile(text) {
  let c = compiled.get(text);
  if (!c) { c = parse(text); compiled.set(text, c); }
  return c;
}

// tr(english, params): the message in the current language
export function tr(source, params) {
  if (source == null) return '';
  if (typeof source === 'object') return say(source);
  let text = source;
  if (locale) {
    const e = textOf(entryOf(source));
    if (e != null) text = e; else missing.add(source);
  }
  try {
    const s = format(compile(text), params ?? {});
    return locale?.grammar.finish ? locale.grammar.finish(s) : s;
  } catch { return String(source); }   // (words from elsewhere)
}
// the same English text meaning different things: tc('toggle', 'Off'); the catalogs have it as
// 'toggle|Off'
export function tc(context, source, params) {
  if (!locale) return format(compile(source), params ?? {});
  const e = textOf(entryOf(`${context}|${source}`));
  if (e == null) missing.add(`${context}|${source}`);
  return format(compile(e ?? source), params ?? {});
}
// a message to translate where it is shown, marked so tools/i18n.mjs finds it (data tables)
export const msg = source => source;

// Words to keep and say later, as plain data (JSON, the saves, the network):
//   phrase('Find {thing:the}', { thing: noun('Lantern') })  ->  { t: 'Find {thing:the}', p: {...} }
//   noun('Lantern')                                         ->  { noun: 'Lantern' }
//   person('Ada', 'f')                                      ->  { name: 'Ada', g: 'f' }
// say(x) turns any of them (and plain text, numbers) into words of the current language.
export const phrase = (source, params) => (params ? { t: source, p: params } : { t: source });
export const noun = (source, flags) => ({ noun: source, ...flags });
export const person = (name, g) => ({ name, ...(g && { g }) });
// Other kinds of words say themselves: sayAs('item', fn, clean) for { item: ... } (core/gear/stats.js:
// an item's name, generated or not); clean(value): the value from elsewhere made safe, or null.
const sayers = new Map(), cleaners = new Map();
export function sayAs(key, fn, clean = null) { sayers.set(key, fn); if (clean) cleaners.set(key, clean); }

// Words from elsewhere (a friend's news): only plain data of the shapes say() knows, short, or null.
const short = (s, max) => String(s).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
const GENDERS = ['m', 'f', 'n', 'pl'];
export function cleanWords(x, depth = 0) {
  if (typeof x === 'string') return short(x, 200);
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  if (!x || typeof x !== 'object' || Array.isArray(x) || depth > 4) return null;
  const flags = { ...(x.proper === true && { proper: true }), ...(x.proper === false && { proper: false }), ...(x.caps === true && { caps: true }),
    ...(GENDERS.includes(x.g) && { g: x.g }) };
  if (typeof x.t === 'string') {
    const p = {};
    for (const [k, v] of Object.entries(x.p && typeof x.p === 'object' ? x.p : {}).slice(0, 8)) {
      const c = /^\w{1,20}$/.test(k) ? cleanWords(v, depth + 1) : null;
      if (c != null) p[k] = c;
    }
    return { t: short(x.t, 300), ...(Object.keys(p).length && { p }), ...(typeof x.of === 'string' && /^\w{1,20}$/.test(x.of) && { of: x.of }), ...flags };
  }
  if (typeof x.noun === 'string') return { noun: short(x.noun, 100), ...(typeof x.ctx === 'string' && { ctx: short(x.ctx, 20) }), ...flags };
  if (typeof x.name === 'string') return { name: short(x.name, 40), ...flags };
  for (const [key, clean] of cleaners) if (x[key] !== undefined) { const c = clean(x[key]); return c == null ? null : { [key]: c }; }
  return null;
}
export function say(x) {
  if (x == null) return '';
  if (typeof x === 'number') return num(x);
  if (typeof x === 'string') return x;
  if (Array.isArray(x)) return x.map(say).join('');
  if (typeof x.t === 'string') return tr(x.t, x.p);
  for (const [key, fn] of sayers) if (x[key] !== undefined) return fn(x[key]);
  if (typeof x.noun === 'string' || typeof x.name === 'string') return form(x, null);
  return String(x);
}
export const isPhrase = x => !!x && typeof x === 'object' && (typeof x.t === 'string' || typeof x.noun === 'string' || typeof x.name === 'string');

// --- nouns ---------------------------------------------------------------------------------------

// what the grammar needs to know about a noun in the current language:
// { word, g ('m', 'f', 'n', 'pl'), pl (plural), proper, ...the locale's own } 
export function nounOf(x) {
  if (x == null) return { word: '', g: 'n', proper: true };
  if (typeof x === 'string') return { word: x, g: 'n', proper: true };
  if (typeof x.name === 'string') return { word: x.name, g: x.g ?? 'n', proper: true };
  // a phrase as a noun: 'Guardian {kind}' is of its kind's gender (of: 'kind'), and takes an
  // article unless it is a name (proper)
  if (typeof x.t === 'string') {
    const g = x.of ? nounOf(x.p?.[x.of]).g : x.g ?? 'n';
    return { word: say(x), g, proper: x.proper ?? !x.of, caps: !!x.caps };
  }
  if (typeof x.noun !== 'string') return { word: say(x), g: 'n', proper: true };
  const source = x.noun, flags = { proper: !!x.proper, caps: !!x.caps };
  if (!locale) { const en = EN_NOUNS[source]; return { word: source, g: 'n', ...en, ...flags }; }
  // ctx: the catalog has it as 'ctx|source' (a woman's 'she|hermit'), else as the plain one
  const e = (x.ctx && entryOf(`${x.ctx}|${source}`)) ?? entryOf(source);
  if (e == null) { missing.add(source); return { word: source, g: 'n', ...flags }; }
  if (typeof e === 'string') return { word: e, g: 'n', ...flags };
  return { ...e, word: e.text, g: e.g ?? 'n', ...flags };
}
export const nounGender = x => nounOf(x).g;

const grammar = () => locale?.grammar ?? EN_GRAMMAR;
// a noun's form ('the', 'den' ...); no form: its word. A form written with a capital ('The', 'Den')
// starts with one: for the start of a sentence.
export function form(x, name) {
  const n = nounOf(x);
  if (!name) return n.word;
  if (name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()) {
    const s = grammar().form(n, name[0].toLowerCase() + name.slice(1));
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return grammar().form(n, name);
}

// --- numbers -------------------------------------------------------------------------------------

const numbers = new Map();
export function num(n, opts = {}) {
  if (!Number.isFinite(n)) return String(n);
  if (n === 0) n = 0;   // (never "-0")
  const key = current + JSON.stringify(opts);
  let f = numbers.get(key);
  if (!f) {
    f = new Intl.NumberFormat(current, { maximumFractionDigits: 2, useGrouping: 'min2', ...opts });
    numbers.set(key, f);
  }
  return f.format(n);
}
// a share as a percentage: 0.25 -> '25%' ('25 %' in German)
export const pct = (v, digits = 0) => num(v, { style: 'percent', maximumFractionDigits: digits });
const plurals = new Map();
function pluralOf(n) {
  let p = plurals.get(current);
  if (!p) { p = new Intl.PluralRules(current); plurals.set(current, p); }
  return p.select(n);
}

// --- parsing and formatting ---------------------------------------------------------------------

// a message as parts: text, { arg, form }, { arg, kind: 'plural' | 'select', options } or HASH
const HASH = Object.freeze({ hash: true });
export function parse(text) {
  let i = 0;
  function parts(inPlural) {
    const out = [];
    let s = '';
    while (i < text.length) {
      const c = text[i];
      if (c === '{') {
        if (s) { out.push(s); s = ''; }
        i++;
        out.push(arg());
      } else if (c === '}') break;
      else if (c === '#' && inPlural) { if (s) { out.push(s); s = ''; } out.push(HASH); i++; }
      else { s += c; i++; }
    }
    if (s) out.push(s);
    return out;
  }
  function arg() {
    const m = /^\s*([A-Za-z_][\w.]*)\s*(?::\s*([\w-]+)\s*)?/.exec(text.slice(i));
    if (!m) throw new SyntaxError(`Bad parameter at ${i} in: ${text}`);
    i += m[0].length;
    const name = m[1];
    if (text[i] === '}') { i++; return { arg: name, form: m[2] ?? null }; }
    if (text[i] !== ',') throw new SyntaxError(`Expected , or } at ${i} in: ${text}`);
    i++;
    const k = /^\s*(plural|select)\s*,\s*/.exec(text.slice(i));
    if (!k) throw new SyntaxError(`Expected plural or select at ${i} in: ${text}`);
    i += k[0].length;
    const options = {};
    for (;;) {
      const o = /^\s*(=?[\w-]+)\s*\{/.exec(text.slice(i));
      if (!o) break;
      i += o[0].length;
      options[o[1]] = parts(k[1] === 'plural');
      if (text[i] !== '}') throw new SyntaxError(`Unclosed option at ${i} in: ${text}`);
      i++;
    }
    const end = /^\s*\}/.exec(text.slice(i));
    if (!end) throw new SyntaxError(`Unclosed ${k[1]} at ${i} in: ${text}`);
    i += end[0].length;
    if (!options.other) throw new SyntaxError(`A ${k[1]} needs an "other" in: ${text}`);
    return { arg: name, kind: k[1], options };
  }
  const out = parts(false);
  if (i < text.length) throw new SyntaxError(`Unexpected } at ${i} in: ${text}`);
  return out;
}
function value(v) {
  if (v == null) return '';
  if (typeof v === 'number') return num(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'function') return value(v());
  return say(v);
}
function lookup(params, name) {
  if (Object.hasOwn(params, name)) return params[name];
  // a.b: a field of a parameter
  return name.split('.').reduce((o, k) => (o == null ? undefined : o[k]), params);
}
function format(nodes, params, n = null) {
  let out = '';
  for (const node of nodes) {
    if (typeof node === 'string') out += node;
    else if (node === HASH) out += num(n);
    else if (!node.kind) {
      const v = lookup(params, node.arg);
      out += node.form ? form(v, node.form) : value(v);
    } else if (node.kind === 'plural') {
      const v = Number(lookup(params, node.arg));
      const o = node.options[`=${v}`] ?? node.options[pluralOf(v)] ?? node.options.other;
      out += format(o, params, v);
    } else {
      const v = lookup(params, node.arg);
      const key = v && typeof v === 'object' ? nounOf(v).g : String(v);
      out += format(node.options[key] ?? node.options.other, params, n);
    }
  }
  return out;
}

// the parameters a message uses (tools/i18n.mjs compares a translation's with the English)
export function paramsOf(text) {
  const names = new Set();
  const walk = nodes => {
    for (const node of nodes) {
      if (typeof node !== 'object' || node === HASH) continue;
      names.add(node.arg.split('.')[0]);
      if (node.options) Object.values(node.options).forEach(walk);
    }
  };
  walk(parse(text));
  return names;
}

// --- the language to start in ---------------------------------------------------------------------

// ?lang=de, else the page's (the guide sets <html data-lang>, learn/lang.js), else the one chosen in
// the settings (crawler.settings, game/settings.js), else the browser's. In node: English.
export const SETTINGS_KEY = 'crawler.settings';
export function startLanguage() {
  if (typeof location === 'undefined' || typeof navigator === 'undefined') return SOURCE;
  const asked = new URLSearchParams(location.search).get('lang');
  if (isLanguage(asked)) return asked;
  if (typeof document === 'undefined') return SOURCE;   // a worker: no words of its own
  const page = document.documentElement?.dataset?.lang;
  if (isLanguage(page)) return page;
  try {
    const chosen = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')?.language;
    if (isLanguage(chosen)) return chosen;
  } catch { /* private mode */ }
  return pickLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]);
}
// every module that says something imports this one, so the words are there before any of them runs
try { await setLanguage(startLanguage()); } catch (e) { console.error('Could not load the language', e); }

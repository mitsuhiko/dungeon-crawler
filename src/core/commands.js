// What a typed line means (game/console.js): a line that starts with '/' is a command, any
// other is chat. Pure: no DOM, no game state, so it can be tested in node.
//
// A registry holds the commands and the types of their arguments:
//   command: { name, help, args: [{ name, type, optional?, min?, max? }], dev?, run(values, ctx) }
//   type:    { name, values(ctx): [{ value, label, hint?, color?, picture? }] } (a list to pick from;
//            picture: an item id, shown as its model's picture), read?(text, ctx): a value
//            written out rather than picked (a place '3,2'; undefined: not one, pick from the list)
//            or one of the built-in 'int' and 'text'
// The game fills it (game/commands.js, game/devcommands.js). Here: splitting a line into words
// (words), finding the best matches for what was typed (match, pick), completing the word
// under the cursor (complete) and reading a line as a command with its values (parse).
// Commands marked dev only exist with the dev tools on (ctx.dev); their words stay English, the
// others' are translated (src/i18n/).
import { tr } from '../i18n/i18n.js';

export function createRegistry() { return { commands: new Map(), types: new Map() }; }
export function addType(reg, type) { reg.types.set(type.name, type); return type; }
export function addCommand(reg, cmd) { reg.commands.set(cmd.name, { args: [], dev: false, ...cmd }); return cmd; }
// the commands this player can use, by name
export const commandsFor = (reg, ctx = {}) => [...reg.commands.values()].filter(c => !c.dev || ctx.dev).sort((a, b) => a.name.localeCompare(b.name));

// how a command is used: '/give <item> [count]'
// a command's help in the language of the moment (a developer command's stays English)
export const helpOf = cmd => cmd.dev ? cmd.help : tr(cmd.help);
export const usage = cmd => ['/' + cmd.name, ...cmd.args.map(a => a.optional ? `[${a.name}]` : `<${a.name}>`)].join(' ');

// The words of a line, where each starts and ends (to: one past its end). A word in quotes may
// hold spaces ("Greater health potion"); the quotes are not part of its text.
// learn: code.html#talking (see learn/README.md)
export function words(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    if (/\s/.test(line[i])) { i++; continue; }
    const from = i, q = line[i] === '"' || line[i] === "'" ? line[i] : null;
    if (q) {
      const end = line.indexOf(q, i + 1);
      i = end < 0 ? line.length : end + 1;
      out.push({ text: line.slice(from + 1, end < 0 ? line.length : end), from, to: i, quoted: true });
    } else {
      while (i < line.length && !/\s/.test(line[i])) i++;
      out.push({ text: line.slice(from, i), from, to: i, quoted: false });
    }
  }
  return out;
}

// --- matching --------------------------------------------------------------------------------

// The prefix the game's item ids start with: 'item_potion_health' is found as 'potion_health'.
const PREFIX = /^(item|weapon|wear|held)_/;
const split = s => s.split(/[\s_\-]+/).filter(Boolean);
// does every word of q start a word of `of`, in order? ('gr he' in 'greater health potion')
function wordsStart(q, of) {
  let j = 0;
  for (const w of q) {
    while (j < of.length && !of[j].startsWith(w)) j++;
    if (j++ >= of.length) return false;
  }
  return true;
}
// are the letters of q in s, in order? ('grsw' in 'greatsword')
function inOrder(q, s) {
  let j = 0;
  for (const c of s) if (c === q[j]) j++;
  return j === q.length;
}

// How well what was typed (q) fits a candidate { value, label }: 100 the very id (with or without
// its prefix), 95 the very name (two kinds may share one), 80 the name
// starts with it, 60 every typed word starts a word of the name (in order), 55 ... of the id,
// 50 the id starts with it, 30 its letters come in this order from the first one on, 20 in
// this order anywhere; -1: not at all.
// learn: code.html#complete-code (see learn/README.md)
export function score(q, { value, label = value }) {
  q = q.trim().toLowerCase();
  if (!q) return 1;
  const name = label.toLowerCase(), id = String(value).toLowerCase(), short = id.replace(PREFIX, '');
  if (q === id || q === short) return 100;
  if (q === name) return 95;
  if (name.startsWith(q)) return 80;
  const typed = split(q);
  if (wordsStart(typed, split(name))) return 60;
  if (wordsStart(typed, split(short))) return 55;
  if (id.startsWith(q) || short.startsWith(q)) return 50;
  const letters = q.replace(/\s+/g, ''), flat = name.replace(/\s+/g, '');
  if (inOrder(letters, flat) || inOrder(letters, short)) return flat[0] === letters[0] ? 30 : 20;
  return -1;
}

// The candidates that fit q, best first; of two equally good, the shorter name, then the one
// listed first (nothing typed yet: all of them, as listed).
// learn: code.html#complete (see learn/README.md)
export function match(q, candidates) {
  const shorter = q.trim() ? (a, b) => (a.label ?? a.value).length - (b.label ?? b.value).length : () => 0;
  return candidates.map((c, i) => ({ ...c, score: score(q, c), i })).filter(c => c.score >= 0)
    .sort((a, b) => b.score - a.score || shorter(a, b) || a.i - b.i);
}

// The one candidate q means: { item } (the only one that fits, or one that fits clearly better
// than the rest), else { none: true } or { some: [the best few] } (q could be several).
// learn: code.html#complete (see learn/README.md)
export function pick(q, candidates) {
  const list = match(q, candidates);
  if (!list.length) return { none: true };
  if (list.length === 1 || list[0].score > list[1].score) return { item: list[0] };
  return { some: list.slice(0, 4) };
}

// --- completing and reading ------------------------------------------------------------------

const argType = (reg, arg) => reg.types.get(arg?.type);
const valuesOf = (reg, arg, ctx) => argType(reg, arg)?.values?.(ctx) ?? [];
function commandList(reg, ctx) {
  return commandsFor(reg, ctx).map(c => ({ value: c.name, label: c.name, hint: c.help }));
}
// the command a word names (the full name, or what fits it best)
function commandOf(reg, text, ctx) {
  const exact = reg.commands.get(text.toLowerCase());
  if (exact && (!exact.dev || ctx.dev)) return exact;
  const p = pick(text, commandList(reg, ctx));
  return p.item ? reg.commands.get(p.item.value) : null;
}

// Which words are which argument. A list argument (an item, an enemy ...) may take several
// words ('gr he' for the Greater health potion): as many as together still fit something, as
// long as enough are left for the arguments that must follow. [{ arg, from, to }] (word
// indices, `to` one past the last), and how many words were left over.
function spans(reg, command, list, ctx) {
  const out = [];
  let i = 0;
  for (let a = 0; a < command.args.length && i < list.length; a++) {
    const arg = command.args[a];
    let n = 1;
    if (argType(reg, arg)?.values) {
      const values = valuesOf(reg, arg, ctx), needed = command.args.slice(a + 1).filter(x => !x.optional).length;
      for (n = Math.max(1, list.length - i - needed); n > 1; n--) if (match(joined(list, i, i + n), values).length) break;
    }
    out.push({ arg: a, from: i, to: i + n });
    i += n;
  }
  return { spans: out, left: list.length - i };
}
const joined = (list, from, to) => list.slice(from, to).map(w => w.text).join(' ');

// What fits where the cursor is: { from, to (the place in the line it would replace), query
// (what was typed there), items (best first), command (once it is known), arg (the argument
// being typed: its index; -1: the command's name) }, or null: not a command (chat), or nothing
// to complete there.
export function complete(reg, line, cursor = line.length, ctx = {}, limit = 8) {
  if (!line.startsWith('/')) return null;
  const list = words(line.slice(1)).map(w => ({ ...w, from: w.from + 1, to: w.to + 1 }));
  let at = list.findIndex(w => w.from <= cursor && cursor <= w.to);
  if (at < 0) {   // between words, or after the last one: a new, empty word here
    at = list.filter(w => w.to < cursor).length;
    list.splice(at, 0, { text: '', from: cursor, to: cursor });
  }
  const w = list[at], typed = w.quoted ? w.text : w.text.slice(0, cursor - w.from);
  if (at === 0) return { from: w.from, to: w.to, query: typed, items: match(typed, commandList(reg, ctx)).slice(0, limit), command: null, arg: -1 };
  const command = commandOf(reg, list[0].text, ctx);
  if (!command) return null;
  // the arguments before this word; this word goes on with the last of them if, together, they
  // still fit something
  const before = list.slice(1, at), last = spans(reg, command, before, ctx).spans.at(-1);
  if (last && typed && last.to === before.length && argType(reg, command.args[last.arg])?.values) {
    const query = `${joined(before, last.from, last.to)} ${typed}`, values = valuesOf(reg, command.args[last.arg], ctx), items = match(query, values);
    if (items.length) return { from: before[last.from].from, to: w.to, query, items: items.slice(0, limit), command, arg: last.arg };
  }
  const arg = last ? last.arg + 1 : 0, values = valuesOf(reg, command.args[arg], ctx);
  return { from: w.from, to: w.to, query: typed, items: match(typed, values).slice(0, limit), command, arg };
}

// the line with the word c (complete's answer) replaced by `value`, and where the cursor goes
export function accept(line, c, value) {
  const text = /\s/.test(value) ? `"${value}"` : value, before = line.slice(0, c.from), after = line.slice(c.to);
  return { line: before + text + (after.startsWith(' ') ? after : ' ' + after), cursor: before.length + text.length + 1 };
}

// Read a command line: { command, values } (values: by argument name; an optional one left
// out is undefined), or { error } saying what is wrong.
// learn: code.html#talking (see learn/README.md)
export function parse(reg, line, ctx = {}) {
  const list = words(line.replace(/^\//, ''));
  if (!list.length) return { error: tr('Type a command after the /. /help lists them') };
  const command = commandOf(reg, list[0].text, ctx);
  if (!command) return { error: tr('There is no command /{name}. /help lists them', { name: list[0].text }) };
  const given = list.slice(1), { spans: found, left } = spans(reg, command, given, ctx), values = {};
  if (left) return { error: tr('Too many words. Usage: {usage}', { usage: usage(command) }) };
  if (command.args.some((a, i) => !a.optional && i >= found.length)) return { error: tr('Usage: {usage}', { usage: usage(command) }) };
  for (const { arg, from, to } of found) {
    const v = read(reg, command.args[arg], joined(given, from, to), ctx);
    if (v.error) return v;
    values[command.args[arg].name] = v.value;
  }
  return { command, values };
}

// one argument's value from its word
function read(reg, arg, text, ctx) {
  if (arg.type === 'text') return { value: text };
  const written = argType(reg, arg)?.read?.(text, ctx);
  if (written !== undefined) return { value: written };
  if (arg.type === 'int') {
    if (!/^-?\d+$/.test(text)) return { error: tr('{name} is a whole number, not "{text}"', { name: arg.name, text }) };
    const n = Number(text);
    if (n < (arg.min ?? -Infinity) || n > (arg.max ?? Infinity)) return { error: tr('{name} goes from {min} to {max}', { name: arg.name, min: arg.min, max: arg.max }) };
    return { value: n };
  }
  const p = pick(text, valuesOf(reg, arg, ctx));
  if (p.item) return { value: p.item.value };
  if (p.none) return { error: tr('No {name} fits "{text}"', { name: arg.name, text }) };
  return { error: tr('"{text}" could be {list}', { text, list: p.some.map(c => c.label ?? c.value).join(', ') }) };
}

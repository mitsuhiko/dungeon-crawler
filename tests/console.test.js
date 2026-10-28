import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, addType, addCommand, commandsFor, usage, words, score, match, pick, complete, accept, parse } from '../src/core/commands.js';
import { createLog, addEntry, clearLog, LOG_LIMIT, MERGE_TIME, KINDS, NEWS, describe, details, deathRecord, phrase, cleanNews, cleanText, clock } from '../src/core/chronicle.js';
import { RELAYED, CHAT_BURST, CHAT_WINDOW, chatAllowed, PROTOCOL } from '../src/net/protocol.js';
import { ITEMS } from '../src/core/items.js';
import { ENEMY_KINDS } from '../src/core/enemies.js';
import { readPlace, isCellText } from '../src/world/coords.js';
import { noun, useLanguage, loadLocale } from '../src/i18n/i18n.js';

const de = await loadLocale('de');

const items = Object.values(ITEMS).map(d => ({ value: d.id, label: d.name }));
const best = q => match(q, items)[0]?.value;

function registry() {
  const reg = createRegistry();
  addType(reg, { name: 'item', values: () => items });
  addType(reg, { name: 'enemy', values: () => Object.values(ENEMY_KINDS).map(k => ({ value: k.type, label: k.label })) });
  addType(reg, { name: 'toggle', values: () => [{ value: 'on', label: 'on' }, { value: 'off', label: 'off' }] });
  addCommand(reg, { name: 'help', help: 'help', run: () => 'help' });
  addCommand(reg, { name: 'give', help: 'give', dev: true, args: [{ name: 'item', type: 'item' }, { name: 'count', type: 'int', optional: true, min: 1, max: 99 }] });
  addCommand(reg, { name: 'spawn', help: 'spawn', dev: true, args: [{ name: 'enemy', type: 'enemy' }, { name: 'level', type: 'int', optional: true, min: 1, max: 99 }] });
  addCommand(reg, { name: 'passive', help: 'passive', dev: true, args: [{ name: 'on', type: 'toggle', optional: true }] });
  return reg;
}

test('a line splits into words, quoted ones with their spaces', () => {
  assert.deepEqual(words('give  potion 3').map(w => [w.text, w.from, w.to]), [['give', 0, 4], ['potion', 6, 12], ['3', 13, 14]]);
  assert.deepEqual(words('give "Greater health potion" 2').map(w => w.text), ['give', 'Greater health potion', '2']);
  assert.deepEqual(words('say "unfinished').map(w => [w.text, w.quoted]), [['say', false], ['unfinished', true]]);
  assert.deepEqual(words('   '), []);
});

test('typing finds items by name, by word starts, by id and by letters', () => {
  assert.equal(best('gr hea'), 'item_potion_health_greater');
  assert.equal(best('gr he'), 'armor_head_great');               // "Great Helm": as well a fit, and shorter
  assert.equal(best('health'), 'item_potion_health');           // the name starts with it: before "Minor health potion"
  assert.equal(best('Recurve'), 'weapon_bow_recurve');
  assert.equal(best('flask_f'), 'item_flask_fire');              // the id, without its item_ prefix
  assert.equal(best('item_potion_antidote'), 'item_potion_antidote');
  assert.equal(best('grsw'), 'weapon_sword_greatsword');         // letters in order, from the first
  assert.equal(score('xyzzy', { value: 'item_coin_gold', label: 'Gold' }), -1);
  assert.equal(score('gold', { value: 'item_coin_gold', label: 'Gold' }), 95);
  assert.equal(score('coin_gold', { value: 'item_coin_gold', label: 'Gold' }), 100);
  // two of one name: the one whose id it is (the Moose, not the Monteur's moose 'montmoose')
  assert.equal(pick('moose', [{ value: 'moose', label: 'Moose' }, { value: 'montmoose', label: 'Moose' }]).item.value, 'moose');
  assert.equal(score('', { value: 'a', label: 'A' }), 1);         // nothing typed: everything, in order
  // the better fit first, then the shorter name, then the order of the list
  const list = match('long', items).map(i => i.label);
  assert.deepEqual(list.slice(0, 3), ['Longbow', 'Long Sword', 'Long stick']);
});

test('a word means one thing only when it clearly does', () => {
  assert.equal(pick('ruby', items).item.value, 'item_crystal_ruby');
  assert.ok(pick('long', items).some.length > 1);
  assert.ok(pick('qqq', items).none);
});

test('the word under the cursor completes: commands first, then their arguments', () => {
  const reg = registry(), dev = { dev: true };
  let c = complete(reg, '/gi', 3, dev);
  assert.equal(c.items[0].value, 'give');
  assert.deepEqual([c.from, c.to, c.arg], [1, 3, -1]);
  // without the dev tools, the developer commands are not there
  assert.deepEqual(complete(reg, '/', 1, {}).items.map(i => i.value), ['help']);
  c = complete(reg, '/give gr hea', 12, dev);
  assert.equal(c.command.name, 'give');
  assert.equal(c.arg, 0);
  assert.equal(c.items[0].value, 'item_potion_health_greater');
  assert.deepEqual([c.from, c.to], [6, 12]);
  // after a space: the next argument, nothing typed yet (an int: nothing to offer)
  c = complete(reg, '/give ruby ', 11, dev);
  assert.equal(c.arg, 1);
  assert.deepEqual(c.items, []);
  // in the middle of the line: the word under the cursor
  c = complete(reg, '/spawn red 5', 10, dev);
  assert.equal(c.query, 'red');
  assert.equal(c.items[0].value, 'redback');
  // a name of several words: the next word goes on with the item while they still fit
  c = complete(reg, '/give health p', 14, dev);
  assert.deepEqual([c.arg, c.from, c.query, c.items[0].value], [0, 6, 'health p', 'item_potion_health']);
  c = complete(reg, '/give ruby 3', 12, dev);
  assert.equal(c.arg, 1);
  assert.equal(complete(reg, 'hello there', 5, dev), null);   // chat
  assert.equal(complete(reg, '/nope x', 7, dev), null);
});

test('taking a completion puts it in place of the word', () => {
  const reg = registry(), dev = { dev: true };
  let line = '/give gr hea', c = complete(reg, line, line.length, dev);
  let r = accept(line, c, c.items[0].value);
  assert.equal(r.line, '/give item_potion_health_greater ');
  assert.equal(r.cursor, r.line.length);
  line = '/spawn red 5'; c = complete(reg, line, 10, dev);
  r = accept(line, c, 'redback');
  assert.equal(r.line, '/spawn redback 5');
  assert.equal(r.line[r.cursor - 1], ' ');
  assert.equal(accept('/give x', { from: 6, to: 7 }, 'Two words').line, '/give "Two words" ');
});

test('a command line reads into values, or says what is wrong', () => {
  const reg = registry(), dev = { dev: true };
  let p = parse(reg, '/give gr hea 3', dev);
  assert.equal(p.command.name, 'give');
  assert.deepEqual(p.values, { item: 'item_potion_health_greater', count: 3 });
  assert.deepEqual(parse(reg, '/give "Greater health potion"', dev).values, { item: 'item_potion_health_greater' });
  assert.deepEqual(parse(reg, '/give health potion 2', dev).values, { item: 'item_potion_health', count: 2 });
  assert.deepEqual(parse(reg, '/spawn fire shraps 4', dev).values, { enemy: 'fireshraps', level: 4 });
  assert.deepEqual(parse(reg, '/gi ruby', dev).values, { item: 'item_crystal_ruby' });   // the command's name completes too
  assert.deepEqual(parse(reg, '/passive', dev).values, {});
  assert.match(parse(reg, '/give', dev).error, /Usage: \/give <item> \[count\]/);
  assert.match(parse(reg, '/give ruby 0', dev).error, /from 1 to 99/);
  assert.match(parse(reg, '/give ruby x', dev).error, /whole number/);
  assert.match(parse(reg, '/give ruby 1 2', dev).error, /Too many/);
  assert.match(parse(reg, '/give qqq', dev).error, /No item fits/);
  assert.match(parse(reg, '/give long', dev).error, /could be/);
  assert.match(parse(reg, '/give ruby', {}).error, /no command/);   // a developer command, without the dev tools
  assert.match(parse(reg, '/', dev).error, /Type a command/);
  assert.equal(usage(reg.commands.get('spawn')), '/spawn <enemy> [level]');
  assert.deepEqual(commandsFor(reg, {}).map(c => c.name), ['help']);
});

test('a type may take a value written out as well as one from its list', () => {
  const reg = createRegistry(), dev = { dev: true };
  addType(reg, { name: 'goto', read: t => isCellText(t) ? t : undefined, values: () => ['down', 'up', '7', '12'].map(v => ({ value: v, label: v })) });
  addCommand(reg, { name: 'goto', help: 'goto', dev: true, args: [{ name: 'where', type: 'goto' }, { name: 'cube', type: 'text', optional: true }] });
  assert.deepEqual(parse(reg, '/goto 7 3,2', dev).values, { where: '7', cube: '3,2' });
  assert.deepEqual(parse(reg, '/goto -3,2', dev).values, { where: '-3,2' });
  assert.deepEqual(parse(reg, '/goto do', dev).values, { where: 'down' });
  assert.match(parse(reg, '/goto 3;2', dev).error, /No where fits/);
});

test('/goto reads a way, a side, or a depth, a cube and a spot', () => {
  assert.deepEqual(readPlace(['down'], 4, 20), { way: 'down' });
  assert.deepEqual(readPlace(['north'], 4, 20), { side: 3 });
  assert.deepEqual(readPlace(['7'], 4, 20), { depth: 7 });
  assert.deepEqual(readPlace(['3,-2'], 4, 20), { depth: 4, cell: [3, -2] });   // this depth
  assert.deepEqual(readPlace(['7', '3,2', '8.5,3,11'], 4, 20), { depth: 7, cell: [3, 2], spot: { x: 8.5, y: 3, z: 11 } });
  assert.deepEqual(readPlace(['3,2', '8,8'], 4, 20), { depth: 4, cell: [3, 2], spot: { x: 8, y: null, z: 8 } });
  assert.match(readPlace(['east', '1,1'], 4, 20).error, /nothing after/);
  assert.match(readPlace(['21'], 4, 20).error, /0 to 20/);
  assert.match(readPlace(['7', '3'], 4, 20).error, /not a cube/);
  assert.match(readPlace(['7', '3,2', '17,1'], 4, 20).error, /0 to 16/);
  assert.match(readPlace(['7', '3,2', '1,1', 'x'], 4, 20).error, /Too many/);
});

test('the chronicle keeps the last entries and merges kills close together', () => {
  const log = createLog();
  addEntry(log, 'kill', { count: 1, xp: 10 }, { time: 1 });
  addEntry(log, 'kill', { count: 2, xp: 5 }, { time: 1 + MERGE_TIME });
  assert.equal(log.entries.length, 1);
  assert.deepEqual(log.entries[0].data, { count: 3, xp: 15 });
  addEntry(log, 'kill', { count: 1, xp: 1 }, { time: 2 + 2 * MERGE_TIME });   // too late: a new line
  addEntry(log, 'kill', { count: 1, xp: 1 }, { time: 3 + 2 * MERGE_TIME, who: { slot: 1, name: 'Anna' } });
  assert.equal(log.entries.length, 3);
  for (let i = 0; i < LOG_LIMIT + 10; i++) addEntry(log, 'chat', { text: String(i) });
  assert.equal(log.entries.length, LOG_LIMIT);
  assert.equal(log.entries.at(-1).data.text, String(LOG_LIMIT + 9));
  assert.ok(log.entries.at(-1).id > LOG_LIMIT);
  const v = log.version;
  clearLog(log);
  assert.equal(log.entries.length, 0);
  assert.ok(log.version > v);
  assert.throws(() => addEntry(log, 'nonsense'));
  for (const k of NEWS) assert.ok(KINDS[k]);
});

test('a death record says what did it, where, and reads for us and for a friend', () => {
  assert.equal(phrase('Bitten by a Redback!'), 'bitten by a Redback');
  assert.equal(phrase('Drowned!'), 'drowned');
  assert.equal(phrase(''), '');
  const rec = deathRecord({ reason: 'Pinched by a Fire shraps!', by: { words: noun('Fire shraps', { caps: true }), level: 7, guardian: false } },
    { depth: 4, place: 'Volcanic', cube: '1,-4,2', weapon: 'Rusty Long Sword', level: 6, session: 754.4 });
  assert.equal(rec.cause, 'Pinched by a Fire shraps!', 'kept as the message, said when shown');
  assert.equal(rec.session, 754);
  assert.equal(describe({ kind: 'death', data: rec, who: null }), 'You died: pinched by a Fire shraps (Lv 7) · depth 4, Volcanic');
  assert.equal(describe({ kind: 'death', data: rec, who: { slot: 1, name: 'Anna' } }), 'Anna died: pinched by a Fire shraps (Lv 7) · depth 4, Volcanic');
  assert.deepEqual(details({ kind: 'death', data: rec }), ['Killed by: Fire shraps (Lv 7)', 'Where: depth 4, Volcanic · cube 1,-4,2',
    'Weapon: Rusty Long Sword', 'Level: 6', 'After: 12:34 of playing']);
  assert.equal(describe({ kind: 'death', data: deathRecord(null, { place: 'Town' }) }), 'You died: out of luck · Town');
  assert.equal(clock(3725), '1:02:05');
  assert.equal(describe({ kind: 'kill', data: { count: 1, xp: 4 } }), 'Defeated 1 enemy · +4 XP');
  assert.equal(describe({ kind: 'chat', data: { text: 'hi' }, who: { slot: 2, name: 'Bo' } }), 'Bo: hi');
  // the same entry, read in German
  useLanguage('de', de);
  try {
    assert.equal(describe({ kind: 'death', data: rec, who: { slot: 1, name: 'Anna' } }), 'Anna ist gestorben: Von einem Feuershraps gezwickt (Lv 7) · Tiefe 4, Volcanic');
    assert.equal(describe({ kind: 'kill', data: { count: 2, xp: 4 } }), '2 Monster besiegt · +4 XP');
  } finally { useLanguage('en'); }
});

test("a friend's news is cleaned before it is shown", () => {
  const rec = deathRecord({ reason: 'Drowned!' }, { depth: 2, place: 'Swamp', level: 3, session: 10 });
  assert.deepEqual(cleanNews('death', JSON.parse(JSON.stringify(rec))), rec);
  assert.equal(cleanNews('death', { ...rec, depth: 'deep' }), null);
  assert.equal(cleanNews('chat', { text: 'hi' }), null);           // not news
  assert.equal(cleanNews('kill', { count: 1, xp: 1 }), null);
  assert.equal(cleanNews('level', { level: 1.5 }), null);
  assert.deepEqual(cleanNews('level', { level: 4, extra: 'x' }), { level: 4 });
  const sword = { itemId: 'weapon_sword_long', gen: { name: 'x'.repeat(100), rarity: 'remarkable', extra: 1 } };
  assert.deepEqual(cleanNews('loot', { item: { item: sword }, rarity: 'remarkable' }),
    { item: { item: { itemId: 'weapon_sword_long', gen: { name: 'x'.repeat(80), rarity: 'remarkable' } } }, rarity: 'remarkable' });
  assert.equal(cleanNews('loot', { item: { item: { itemId: 'nothing' } }, rarity: 'remarkable' }), null);
  assert.equal(cleanNews('loot', { item: 'Sword', rarity: 'shiny' }), null);
  assert.deepEqual(cleanNews('down', { cause: 'bitten\n', by: { label: 'Spider', level: 'x' } }), { cause: 'bitten', by: { words: 'Spider', level: null, guardian: false } });
  assert.deepEqual(cleanNews('guardian', { label: { t: 'Guardian {kind}', p: { kind: { noun: 'Spider', caps: true, evil: '<b>' } }, of: 'kind', caps: true }, depth: 2 }),
    { label: { t: 'Guardian {kind}', p: { kind: { noun: 'Spider', caps: true } }, of: 'kind', caps: true }, level: null, depth: 2, boss: false });
  assert.equal(cleanNews('death', null), null);
  assert.equal(cleanText(' a\u0000b\n ', 10), 'ab');
});

test('chat goes from player to player, and a flood is cut short', () => {
  assert.ok(RELAYED.has('chat') && RELAYED.has('news'));
  assert.ok(PROTOCOL >= 8);
  const times = [];
  for (let i = 0; i < CHAT_BURST; i++) assert.ok(chatAllowed(times, i * 10));
  assert.ok(!chatAllowed(times, 100));
  assert.ok(chatAllowed(times, CHAT_WINDOW + 1));   // the first line is long enough ago
});

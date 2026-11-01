import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS, GROUPS, defaultBindings, resolveBindings, overrides, assignKey, clearKey, actionsFor, keyName, UNBINDABLE,
} from '../src/core/keybinds.js';

const all = b => Object.values(b).flat().filter(k => k !== null);

test('the defaults are the keys the game always had, each key on one action', () => {
  const b = defaultBindings();
  assert.equal(new Set(all(b)).size, all(b).length);
  assert.deepEqual(b.moveUp, ['KeyW', 'ArrowUp']);
  assert.deepEqual(b.walk, ['ControlLeft', null]);
  assert.deepEqual(b.action, ['KeyF', 'ControlRight']);
  assert.deepEqual(b.attack, ['ShiftLeft', 'ShiftRight']);
  // M the map (the inventory's Map tab), N the music
  assert.deepEqual(b.map, ['KeyM', null]);
  assert.deepEqual(b.music, ['KeyN', null]);
  assert.deepEqual(actionsFor(b, 'KeyM', 'm'), ['map']);
  assert.deepEqual(actionsFor(b, 'KeyN', 'n'), ['music']);
  for (const a of ACTIONS) {
    assert.ok(GROUPS.includes(a.group), a.id);
    assert.equal(a.keys.length, 2, a.id);
    assert.ok(!a.keys.some(k => UNBINDABLE.has(k)), a.id);
  }
});

test('a key given to another action is taken from the one that had it', () => {
  const { bindings, lost } = assignKey(defaultBindings(), 'jump', 1, 'KeyQ');
  assert.deepEqual(bindings.jump, ['Space', 'KeyQ']);
  assert.deepEqual(bindings.turnLeft, [null, null]);
  assert.deepEqual(lost, [{ id: 'turnLeft', key: 'KeyQ' }]);
  // its own other slot: moved, nothing lost
  const moved = assignKey(defaultBindings(), 'inventory', 0, 'KeyV');
  assert.deepEqual(moved.bindings.inventory, ['KeyV', null]);
  assert.deepEqual(moved.lost, []);
  // a typed character that types the same: taken too
  const slash = assignKey(resolveBindings({ path: ['?', '/'] }), 'labels', 1, 'Slash', '/');
  assert.deepEqual(slash.bindings.path, ['?', null]);
  assert.deepEqual(slash.lost, [{ id: 'path', key: '/' }]);
  // Escape is never bound
  assert.deepEqual(assignKey(defaultBindings(), 'jump', 0, 'Escape').bindings.jump, ['Space', null]);
  assert.deepEqual(clearKey(defaultBindings(), 'jump', 0).jump, [null, null]);
});

test('only changes are stored, and stored keys win over the defaults', () => {
  assert.deepEqual(overrides(defaultBindings()), {});
  const { bindings } = assignKey(defaultBindings(), 'jump', 0, 'KeyF');
  const stored = overrides(bindings);
  assert.deepEqual(stored, { jump: ['KeyF', null], action: [null, 'ControlRight'] });
  assert.deepEqual(resolveBindings(JSON.parse(JSON.stringify(stored))), bindings);
  // a stored key some default has too (a default added later): the default loses it
  const later = resolveBindings({ jump: ['KeyM', null] });
  assert.deepEqual(later.map, [null, null]);
  assert.deepEqual(later.music, ['KeyN', null]);
  // nonsense is dropped, a key twice kept once, unknown actions ignored
  const odd = resolveBindings({ jump: [42, 'Escape'], walk: ['KeyZ', 'KeyZ'], nope: ['KeyY'], menu: 'KeyO' });
  assert.deepEqual(odd.jump, [null, null]);
  assert.deepEqual(odd.walk, ['KeyZ', null]);
  assert.deepEqual(odd.menu, ['KeyO', null]);
  assert.deepEqual(resolveBindings(null), defaultBindings());
});

test('a key event finds its action by code first, then by the character typed', () => {
  const b = resolveBindings({ path: ['?', null] });
  assert.deepEqual(actionsFor(b, 'KeyW', 'w'), ['moveUp']);
  assert.deepEqual(actionsFor(b, 'Slash', '?'), ['path']);      // US: Shift+/
  assert.deepEqual(actionsFor(b, 'Minus', '?'), ['path']);      // German: Shift+ß
  assert.deepEqual(actionsFor(b, 'KeyZ', 'z'), []);
  const { bindings } = assignKey(b, 'labels', 0, 'Slash', '/');
  assert.deepEqual(actionsFor(bindings, 'Slash', '?'), ['labels']);
});

test('keys have short names, in the keyboard layout when known', () => {
  assert.equal(keyName('KeyW'), 'W');
  assert.equal(keyName('Digit3'), '3');
  assert.equal(keyName('ControlLeft'), 'Left Ctrl');
  assert.equal(keyName('ArrowUp'), '↑');
  assert.equal(keyName('Numpad4'), 'Num 4');
  assert.equal(keyName('?'), '?');
  assert.equal(keyName('F5'), 'F5');
  assert.equal(keyName(null), '');
  assert.equal(keyName('KeyZ', new Map([['KeyZ', 'y']])), 'Y');
  assert.equal(keyName('Space', new Map()), 'Space');
});

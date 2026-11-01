// The game's keys: every control is an action with up to two keys, a primary and a secondary
// (game/settings.js keeps them, the settings menu changes them, game/input.js plays them).
//
// A key is a KeyboardEvent code, which names where the key sits ("KeyW" is the key left of E on
// any layout), so WASD stays a cross on an AZERTY keyboard too. A key of one character other
// than a code is a typed character instead ("?": whichever key types it, with Shift or not;
// only the defaults have those, as ? sits on different keys across layouts). null: no key.
// One key belongs to one action at most: giving it to another takes it away from the first.
//
// hold: the action lasts while the key is held (moving, walking, auto-attack); the others
// happen on the press. Escape is not bindable: it always opens the menu and closes what is open.
// The groups and labels are English; the settings show them translated (src/i18n/sources.js).
import { tr } from '../i18n/i18n.js';

export const GROUPS = ['Moving', 'Fighting', 'Items', 'View', 'Game'];

export const ACTIONS = [
  { id: 'moveUp', label: 'Move up', group: 'Moving', keys: ['KeyW', 'ArrowUp'], hold: true },
  { id: 'moveLeft', label: 'Move left', group: 'Moving', keys: ['KeyA', 'ArrowLeft'], hold: true },
  { id: 'moveDown', label: 'Move down', group: 'Moving', keys: ['KeyS', 'ArrowDown'], hold: true },
  { id: 'moveRight', label: 'Move right', group: 'Moving', keys: ['KeyD', 'ArrowRight'], hold: true },
  { id: 'walk', label: 'Walk (hold)', group: 'Moving', keys: ['ControlLeft', null], hold: true },
  { id: 'jump', label: 'Jump', group: 'Moving', keys: ['Space', null] },
  { id: 'respawn', label: 'Respawn where you came in', group: 'Moving', keys: ['KeyR', null] },
  { id: 'attack', label: 'Auto-attack (hold)', group: 'Fighting', keys: ['ShiftLeft', 'ShiftRight'], hold: true },
  { id: 'knockOver', label: 'Knock over', group: 'Fighting', keys: ['KeyB', null] },
  { id: 'action', label: 'Action: open, talk, collect', group: 'Items', keys: ['KeyF', 'ControlRight'] },
  { id: 'inventory', label: 'Inventory', group: 'Items', keys: ['KeyI', 'KeyV'] },
  { id: 'quests', label: 'Quests', group: 'Items', keys: ['KeyU', null] },
  { id: 'map', label: 'Map', group: 'Items', keys: ['KeyM', null] },
  { id: 'labels', label: 'Names of items on the floor', group: 'Items', keys: ['KeyX', null] },
  ...[1, 2, 3, 4, 5, 6].map(n => ({ id: `bar${n}`, label: `Quick bar ${n}`, group: 'Items', keys: [`Digit${n}`, null] })),
  { id: 'turnLeft', label: 'Turn the view left', group: 'View', keys: ['KeyQ', null] },
  { id: 'turnRight', label: 'Turn the view right', group: 'View', keys: ['KeyE', null] },
  { id: 'camera', label: 'Camera (tap/hold)', group: 'View', keys: ['Tab', 'KeyC'] },
  { id: 'zoomIn', label: 'Zoom in', group: 'View', keys: ['KeyK', null] },
  { id: 'zoomOut', label: 'Zoom out', group: 'View', keys: ['KeyL', null] },
  { id: 'path', label: 'Show the generator path', group: 'View', keys: ['KeyP', null] },
  { id: 'menu', label: 'Menu (Esc too)', group: 'Game', keys: ['KeyO', null] },
  { id: 'chat', label: 'Chat', group: 'Game', keys: ['KeyT', 'Enter'] },
  { id: 'command', label: 'Type a command', group: 'Game', keys: ['Backquote', null] },
  { id: 'music', label: 'Music on / off', group: 'Game', keys: ['KeyN', null] },
];
export const ACTION = Object.fromEntries(ACTIONS.map(a => [a.id, a]));
export const BAR_ACTIONS = ACTIONS.filter(a => a.id.startsWith('bar')).map(a => a.id);
export const MOVE_ACTIONS = ['moveUp', 'moveLeft', 'moveDown', 'moveRight', 'walk'];

// keys that cannot be bound: Escape (cancels choosing a key, and is the menu anyway) and the
// system keys (Cmd / Windows: the system's shortcuts)
export const UNBINDABLE = new Set(['Escape', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'ContextMenu']);
const MODIFIERS = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);
export const isModifier = code => MODIFIERS.has(code);
// a typed character ('?'), not a code ('KeyW', 'Digit1', 'Space', 'F1' ...)
export const isChar = key => typeof key === 'string' && [...key].length === 1;
const validKey = k => typeof k === 'string' && k.length > 0 && k.length < 32 && !UNBINDABLE.has(k);

export const defaultBindings = () => Object.fromEntries(ACTIONS.map(a => [a.id, [...a.keys]]));

// the bindings from what was stored (overrides: { id: [primary, secondary] } of the actions
// changed): changed actions as stored (a key twice: the first keeps it), the others their
// defaults without the keys the changed ones took (a default added later never doubles a key)
export function resolveBindings(stored) {
  const b = defaultBindings(), taken = new Set();
  const changed = ACTIONS.filter(a => Array.isArray(stored?.[a.id]));
  for (const a of changed) {
    b[a.id] = [0, 1].map(i => {
      const k = stored[a.id][i];
      if (!validKey(k) || taken.has(k)) return null;
      taken.add(k);
      return k;
    });
  }
  for (const a of ACTIONS) if (!changed.includes(a)) b[a.id] = b[a.id].map(k => (taken.has(k) ? null : k));
  return b;
}
// what to store: the actions that differ from their defaults
export function overrides(b) {
  const out = {};
  for (const a of ACTIONS) if (b[a.id].some((k, i) => k !== a.keys[i])) out[a.id] = [...b[a.id]];
  return out;
}

// give `key` (and the character `typed` with it, if another action has that) to action id's
// slot (0: primary, 1: secondary): returns the new bindings and what lost a key ([{ id, key }])
export function assignKey(b, id, slot, key, typed = null) {
  const next = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, [...v]])), lost = [];
  if (!validKey(key) || !next[id]) return { bindings: next, lost };
  for (const a of ACTIONS) next[a.id] = next[a.id].map((k, i) => {
    if (k === null || (k !== key && !(isChar(typed) && k === typed))) return k;
    if (a.id !== id) lost.push({ id: a.id, key: k });
    else if (i === slot) return k;
    return null;
  });
  next[id][slot] = key;
  return { bindings: next, lost };
}
export function clearKey(b, id, slot) {
  const next = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, [...v]]));
  if (next[id]) next[id][slot] = null;
  return next;
}

// the actions a key event (its code and key) is for: code bindings first, typed characters
// only when no code binding matched (so a key bound by its place wins over one's character)
export function actionsFor(b, code, key) {
  const byCode = ACTIONS.filter(a => b[a.id].includes(code)).map(a => a.id);
  if (byCode.length) return byCode;
  return isChar(key) ? ACTIONS.filter(a => b[a.id].includes(key)).map(a => a.id) : [];
}

// --- names ----------------------------------------------------------------------------------

// the keys with names (translated: 'Space' is 'Leertaste' in German); then the ones with signs
export const KEY_NAMES = {
  Space: 'Space', Enter: 'Enter', NumpadEnter: 'Num Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Del',
  Insert: 'Ins', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', CapsLock: 'Caps Lock', Escape: 'Esc',
  ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
  AltLeft: 'Left Alt', AltRight: 'Right Alt', MetaLeft: 'Left Cmd', MetaRight: 'Right Cmd',
};
const SIGNS = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', IntlBackslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .',
};
// a key's name to show; layout: the keyboard's own characters by code (navigator.keyboard's
// layout map, where there is one), so a German keyboard's KeyZ shows as Y
export function keyName(key, layout = null) {
  if (key === null || key === undefined) return '';
  if (isChar(key)) return key === ' ' ? tr('Space') : key.toUpperCase();
  const own = layout?.get?.(key);
  if (own && own.trim()) return own.toUpperCase();
  if (KEY_NAMES[key]) return tr(KEY_NAMES[key]);
  if (SIGNS[key]) return SIGNS[key];
  let m = /^Key([A-Z])$/.exec(key) ?? /^Digit(\d)$/.exec(key);
  if (m) return m[1];
  if ((m = /^Numpad(\d)$/.exec(key))) return tr('Num {n}', { n: m[1] });
  return key;
}

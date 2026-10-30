// The tutorial (docs/story.md "The beginning"): the beginning's three rooms teach how to play, the
// robot says what to do in its own voice (core/narration.js), and a card (game/tutorial.js) shows
// how, with the player's own keys (core/keybinds.js) or, on a touch screen, the stick and buttons.
// Pure: its stages, their steps and what each says. game/tutorial.js says when a step is done.
//
// A stage is the steps of one place of the beginning, shown together, each ticked off once done:
//   town    after the opening, coming out of the inn: walking, turning the view
//   camp    the robot awake (at the crash, in town): taking the sword, the gate
//   rock    his first glass shown on its rock: fighting the snakes, finding the way up, the glass
//   heard   his words heard: they are kept in the bag's memories
// A step: id; text, the message (English: src/i18n), which may name keys as {k0}, {k1} ... in the
// order of `keys` (each a key binding's action, or 'move': the four move keys together); touch, the
// message on a touch screen instead (no keys).
import { msg } from '../i18n/i18n.js';

export const STAGES = [
  { id: 'town', title: msg('Getting about'), steps: [
    { id: 'move', text: msg('Walk with {k0}, or click the ground where you want to go'), keys: ['move'],
      touch: msg('Walk with the stick at the lower left, or tap the ground where you want to go') },
    { id: 'turn', text: msg('Turn the view with {k0} and {k1}'), keys: ['turnLeft', 'turnRight'],
      touch: msg('Turn the view with the buttons at the sides') },
  ] },
  { id: 'camp', title: msg('The robot'), steps: [
    { id: 'sword', text: msg('Walk to the sword, or click it, to pull it out of the ground'), keys: [],
      touch: msg('Walk to the sword, or tap it, to pull it out of the ground') },
    { id: 'gate', text: msg('Go through the gate out of the town'), keys: [], touch: null },
  ] },
  { id: 'rock', title: msg('The rock'), steps: [
    { id: 'attack', text: msg('Hold {k0} to fight whatever is in reach, or click an enemy'), keys: ['attack'],
      touch: msg('Hold the big button to fight whatever is in reach, or tap an enemy') },
    { id: 'climb', text: msg('Click the top of the rock: you find the way up, ladders and all'), keys: [],
      touch: msg('Tap the top of the rock: you find the way up, ladders and all') },
    { id: 'glass', text: msg('Walk into the glass'), keys: [], touch: null },
  ] },
  { id: 'heard', title: msg('His words'), steps: [
    { id: 'memories', text: msg('His words are kept: open the bag with {k0} and look at the memories'), keys: ['inventory'],
      touch: msg('His words are kept: open the bag and look at the memories') },
  ] },
];
export const STAGE = Object.fromEntries(STAGES.map(s => [s.id, s]));
export const STEPS = STAGES.flatMap(s => s.steps);
// the four move keys, shown together as a cross
export const MOVE_KEYS = ['moveUp', 'moveLeft', 'moveDown', 'moveRight'];

// how long a stage's card stays once all its steps are done (s), and how long one step's tick shows
export const DONE_LINGER = 1.6;

// The stage to show (or null), from where the hero is and how far the beginning has come:
//   at    'town' (its houses too), 'rock' (the room of his first glass), or null (else)
//   robot the robot is awake and has said hello; shown: the rock's glass was shown (its scene);
//   sword taken (its gate open); glass found (its gate open); heard: its words were heard and the
//   hero is still on the road (not deeper)
export function stageAt({ at, robot, shown, sword, glass }) {
  if (at === 'town' && robot && !glass) return 'camp';
  if (at === 'town' && !sword) return 'town';
  if (at === 'rock' && shown && !glass) return 'rock';
  if (at === 'rock' && glass) return 'heard';
  return null;
}

// A step's text cut into pieces round its keys: [{ text }, { keys: [action ids] } ...] (k: the
// key markers {k0} ... already put in as MARK + n + MARK by the translation)
export const MARK = '\u0001';
export function pieces(text, keys) {
  const out = [], parts = text.split(MARK);
  parts.forEach((p, i) => {
    if (i % 2 === 0) { if (p) out.push({ text: p }); return; }
    const k = keys[Number(p)];
    if (k) out.push({ keys: k === 'move' ? MOVE_KEYS : [k] });
  });
  return out;
}
// the parameters that put the markers in: { k0: MARK 0 MARK, ... }
export const markers = keys => Object.fromEntries(keys.map((_, i) => [`k${i}`, `${MARK}${i}${MARK}`]));

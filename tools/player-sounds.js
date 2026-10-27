// tools/player.html: the game's sound effects (src/audio/sfx.js SOUND_NAMES, apart from the
// enemies' voices) in groups, as the player lists them. tests/player.test.js checks that every
// effect is in one group. The ambient beds and drones are loops.js's (BEDS, DRONES).
export const SFX_GROUPS = [
  ['Melee and hits', ['swing', 'flail', 'hit', 'kill', 'hurt', 'block', 'blur', 'sizzle']],
  ['Bow, crossbow and staff', ['draw', 'twang', 'crossbow', 'reload', 'spell', 'thunk', 'burst']],
  ['Projectiles and magic', ['fireball', 'whump', 'zap', 'shatter', 'frost', 'icecrack', 'laser', 'zapburst']],
  ['Storms and wind', ['thunder', 'gust', 'charge', 'lightning', 'rumble', 'whirl', 'twirl']],
  ['Flasks and potions', ['drink', 'buff', 'poison', 'lob', 'glass', 'boom', 'hiss']],
  ['Loot, items and the bag', ['coin', 'pickup', 'drop', 'clink', 'toss', 'chest', 'equip', 'bagOpen', 'bagClose', 'use', 'unlock', 'levelUp']],
  ['The body', ['jump', 'step', 'fall', 'thud', 'knock', 'getUp', 'dizzy', 'grab', 'chomp', 'splash', 'burn', 'dissolve', 'death']],
  ['Travel', ['portal', 'gate', 'wellDown', 'ringUp', 'cloud', 'door', 'castStart', 'fizzle']],
  ['Gusto', ['vortex', 'inhale', 'summon', 'poof']],
  ['Totnar', ['skullthrow', 'bonk', 'rustle', 'shed', 'gloom', 'dawn']],
  ['Squarlo and the Squirtles', ['spray', 'cannon', 'tidecall', 'morph', 'stomp', 'spit', 'dig', 'pop', 'drip']],
  ['Bolime', ['gulp', 'splorch', 'boing']],
  ['Moose', ['hooves']],
  ['Flip, Renew and the black hole', ['flip', 'blackhole', 'clockwind', 'rewind', 'rewound']],
];

// the ambient beds (loops.js setAmbience) and drones (setDrone: level, and pitch in Hz as the
// game plays them, game/ambience.js)
export const BEDS = ['water', 'falls', 'lava', 'acid', 'wind', 'cave'];
export const DRONES = {
  charge: { pitch: 262, min: 196, max: 660 },   // a well 196 Hz, a side portal 262, a ring 330; doubling as it fills
  cast: { pitch: 294, min: 294, max: 588 },     // the scroll: 294 Hz, rising an octave over the cast
};

// Which bones of each creature look, stand and reach (render/ik.js makeRig, by Blender names):
//   look: the chain that turns the head, root first, and each one's share of the turn
//   eyes: they look right at what it looks at
//   legs: [upper, lower, foot?]: each stands on the ground under it
//   arms: [upper, lower, hand]: the nearest reaches for what it strikes (melee attacks)
//   limits: how far it turns its head (ik.js LOOK)
// A creature not here, or a bone it does not have, simply does without.
const pairs = (f, sides = ['L', 'R']) => sides.map(f);
const arms = (u = 'arm_upper', l = 'arm_lower', h = 'hand') => pairs(s => [`${u}.${s}`, `${l}.${s}`, `${h}.${s}`]);
const legs = (u = 'thigh', l = 'shin', f = null) => pairs(s => f ? [`${u}.${s}`, `${l}.${s}`, `${f}.${s}`] : [`${u}.${s}`, `${l}.${s}`]);
const EYES = ['eye.L', 'eye.R'];
const hoofs = pairs(s => [[`upper.fore.${s}`, `lower.fore.${s}`], [`upper.hind.${s}`, `lower.hind.${s}`]]).flat();
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1));

export const RIGS = {
  spider: { look: [['face', 1]], eyes: EYES, legs: range(4, i => pairs(s => [`leg${i}_upper.${s}`, `leg${i}_lower.${s}`])).flat() },
  stunder: { look: [['spine_upper', 0.35], ['head', 0.65]], eyes: EYES, legs: legs('thigh', 'shin', 'foot') },
  snake: { look: [['neck_1', 0.1], ['neck_2', 0.15], ['neck_3', 0.2], ['neck_4', 0.25], ['head', 0.3]], eyes: EYES },
  octonaut: { look: [['face', 1]], eyes: EYES, arms: arms(), legs: range(6, i => [`leg${i}_upper`, `leg${i}_lower`]) },
  fireface: { eyes: EYES },
  triangle: { eyes: EYES },
  firecat: { look: [['neck', 0.4], ['head', 0.6]], eyes: EYES,
    legs: [...legs('thigh', 'shin', 'hpaw'), ...legs('upperarm', 'forearm', 'fpaw')] },
  shraps: { look: [['head', 1]], eyes: EYES, arms: arms('arm_upper', 'arm_lower', 'claw'), legs: legs('thigh', 'shin', 'foot') },
  spicy: { eyes: EYES, arms: arms() },
  wolla: { eyes: EYES, limits: { eyes: 0.4 } },
  wolk: { eyes: EYES, arms: arms(), legs: legs() },
  gusto: { arms: arms() },
  totnar: { look: [['skull0', 1], ['skull1', 1], ['skull2', 1]], arms: arms() },
  snapskull: { look: [['skull', 1]], limits: { yaw: 0.6, pitch: 0.5 } },
  squarlo: { arms: arms(), legs: legs() },
  mecked: { look: [['neck', 0.4], ['head', 0.6]], eyes: EYES, arms: arms(), legs: legs('thigh', 'shin', 'foot') },
  tornado: { look: [['chest', 0.3], ['head', 0.7]], eyes: EYES, arms: arms() },
  slug: { look: [['front', 0.3], ['head', 0.7]], eyes: ['stalk.L', 'stalk.R'], limits: { eyes: 0.35 } },
  bolime: { eyes: ['stalk.L', 'stalk.R'], limits: { eyes: 0.35 } },
  foggery: { look: [['body', 1]], eyes: EYES, limits: { yaw: 0.7, pitch: 0.4 } },
  slomo: { eyes: ['stalk.L', 'stalk.R'], limits: { eyes: 0.35 } },
  mansk: { look: [['body', 1]], limits: { yaw: 0.45, pitch: 0.3 } },
  monteur: { look: [['neck', 0.4], ['head', 0.6]], legs: hoofs },
  moose: { look: [['neck', 0.4], ['head', 0.6]], eyes: EYES, legs: hoofs },
  // (his tentacles stand where their contacts are, the joint between their third and fourth bone
  // from the hips: blender/qualmos.py REACH; the curling tip keeps its turn)
  qualmos: { look: [['chest', 0.3], ['head', 0.7]], arms: arms('arm', 'forearm', 'hand'),
    legs: range(6, i => [`tentacle${i}.2`, `tentacle${i}.3`, `tentacle${i}.4`]) },
};
// the human figure (assets/character.glb): the hero, the villagers, the people out in the world
export const FIGURE_RIG = { look: [['spine', 0.3], ['head', 0.7]], legs: legs(), limits: { yaw: 1.2, pitch: 0.5 } };
// the robot: its eyes, and its whole body leaning a little
export const ROBOT_RIG = { look: [['body', 1]], eyes: EYES, limits: { yaw: 0.5, pitch: 0.35, eyes: 0.5 } };

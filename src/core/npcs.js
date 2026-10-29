// The people out in the world (docs/quests.md, "NPCs and spots"). Pure: who somebody is comes
// from the seed of the spot they belong to (world/spots.js), so every game agrees without saying.
//
// Each seat and each camp has somebody living there: they stand on the seat, or at the camp's
// fire, and give quests of their own about their depth and the one below (core/quests.js). Who
// else stands on a spot (somebody lost and found, somebody waiting for a parcel) is the quests'
// to say (game/npcs.js).
//
// An NPC: { id, giver, name, role, title, tint, outfit, depth, spot, x, y, z, yaw }
//   giver: the id the quests know them by ('npc:' + the spot's id)
//   title: 'Ada the hermit', as words (titleWords: said in the reader's language)
//   outfit: worn and held things (core/items.js WEARABLES), like the villagers'
import { mulberry32, hash32 } from './util.js';
import { msg, noun, person } from '../i18n/i18n.js';

// What they are, which kinds of quest they lean towards (core/quests.js), what they wear, and
// the depths they are found at (light, the sky down to the canyon; caves; the deep)
export const ROLES = {
  hermit: { title: 'hermit', kinds: { landmark: 2, reach: 1 }, outfits: [['wear_hood'], ['wear_hood', 'held_crystal_ball']], depths: [0, 20] },
  explorer: { title: 'explorer', kinds: { reach: 2, landmark: 2, guardian: 1 }, outfits: [['wear_explorer_hat', 'held_rope'], ['wear_explorer_hat']], depths: [0, 20] },
  miner: { title: 'miner', kinds: { guardian: 2, horde: 2 }, outfits: [['wear_miner_helmet', 'held_hammer'], ['wear_miner_helmet', 'held_pliers']], depths: [5, 20] },
  pilgrim: { title: 'pilgrim', kinds: { landmark: 3, reach: 1 }, outfits: [['wear_hood', 'held_towel'], ['wear_headscarf', 'held_towel']], depths: [0, 13] },
  trapper: { title: 'trapper', kinds: { horde: 3, guardian: 1 }, outfits: [['wear_straw_hat', 'held_rope'], ['wear_straw_hat', 'held_feed_bag']], depths: [0, 16] },
  scholar: { title: 'scholar', kinds: { landmark: 2, reach: 2 }, outfits: [['wear_wizard_hat'], ['wear_wizard_hat', 'held_crystal_ball']], depths: [3, 20] },
  // who keeps an outpost's supply cart (world/spots.js), and asks for help defending it
  carter: { title: 'carter', kinds: { horde: 2, guardian: 1 }, outfits: [['wear_straw_hat', 'held_feed_bag'], ['wear_explorer_hat', 'held_rope']],
    depths: [0, 20], only: 'outpost' },
};
export const NAMES = ['Ada', 'Alma', 'Bodo', 'Bram', 'Clara', 'Cora', 'Dov', 'Edda', 'Emil', 'Finn', 'Frida', 'Greta', 'Gus',
  'Hanna', 'Hugo', 'Ilse', 'Ivo', 'Jonah', 'Juna', 'Kai', 'Kira', 'Lars', 'Lotte', 'Mats', 'Mila', 'Nils', 'Nora', 'Olga',
  'Otto', 'Pip', 'Quinn', 'Rosa', 'Sven', 'Tilda', 'Ulf', 'Vera', 'Wim', 'Yara', 'Zeno', 'Esme'];
// who of them is a woman: other languages say it ('die Einsiedlerin Ada', 'der Bergmann Bodo')
const SHE = new Set(['Ada', 'Alma', 'Clara', 'Cora', 'Edda', 'Frida', 'Greta', 'Hanna', 'Ilse', 'Juna', 'Kira', 'Lotte', 'Mila', 'Nora',
  'Olga', 'Rosa', 'Tilda', 'Vera', 'Yara', 'Esme', 'Agnes', 'Dora', 'Fenna', 'Ida', 'Liesl', 'Nele', 'Paula', 'Smilla', 'Ute', 'Wanda',
  'Zora', 'Marta', 'Leni']);
// more names, for the people the quests are about (somebody's family: core/questplan.js kinName);
// the residents keep to NAMES, so who lives where stays as it was
export const KIN_NAMES = [...NAMES, 'Agnes', 'Benno', 'Dora', 'Elio', 'Fenna', 'Gerd', 'Ida', 'Jakob', 'Liesl', 'Malte', 'Nele', 'Oskar',
  'Paula', 'Ruben', 'Smilla', 'Theo', 'Ute', 'Wanda', 'Xaver', 'Zora', 'Anton', 'Marta', 'Leni', 'Bruno'];
export const isShe = name => SHE.has(name);
// somebody by their name, as words (src/i18n/i18n.js: a name with its gender)
export const personWords = name => person(name, isShe(name) ? 'f' : 'm');
// what they are ('hermit', a relation 'daughter'), as a noun for them: a woman's in the languages
// that have one of her own (German 'Einsiedlerin': the catalog's 'she|hermit')
export const roleWords = (role, name) => noun(role, isShe(name) ? { ctx: 'she' } : undefined);
// 'Ada the hermit'
export const titleWords = (name, role) => ({ t: msg('{name} the {role}'), p: { name: personWords(name), role: roleWords(role, name) },
  proper: true, g: isShe(name) ? 'f' : 'm' });
const TINTS = ['#d9b48c', '#c99a86', '#e0c7a0', '#b9c79a', '#b8b0d8', '#9fc3c9', '#d6a9a0', '#c4b48a', '#a8c0a0', '#d8c0d0'];
export const NPC_R = 0.22;      // how big they are to bump into (world/town.js VILLAGER_R)
export const NPC_H = 1.1;       // ... and how tall

// the quests' name for the one who lives at a spot, and back
export const npcGiver = spotId => `npc:${spotId}`;
export const isNpcGiver = g => typeof g === 'string' && g.startsWith('npc:');
export const spotOfGiver = g => isNpcGiver(g) ? g.slice(4) : null;
// the cube key in a spot's id ('<seed>:<key>:spot:<n>')
export const keyOfSpot = id => String(id).split(':')[1] ?? null;

// who lives at a planned seat, camp or outpost (world/spots.js; null: a hiding place, nobody
// lives there)
export function residentOf(plan) {
  if (!['seat', 'camp', 'outpost'].includes(plan?.kind)) return null;
  const R = mulberry32(hash32(plan.seed ^ 0x9e0c5));
  const roles = Object.entries(ROLES).filter(([, r]) => plan.depth >= r.depths[0] && plan.depth <= r.depths[1]
    && (r.only ?? null) === (plan.kind === 'outpost' ? 'outpost' : null));
  const [role, r] = roles[Math.floor(R() * roles.length)];
  const name = NAMES[Math.floor(R() * NAMES.length)];
  return { id: `${plan.id}:resident`, giver: npcGiver(plan.id), name, role, title: titleWords(name, r.title),
    tint: TINTS[Math.floor(R() * TINTS.length)], outfit: r.outfits[Math.floor(R() * r.outfits.length)],
    depth: plan.depth, spot: plan.id, camp: plan.kind === 'camp' };
}

// the residents of a cube's placed spots (map.spots, cubegen/spots.js), standing where they live:
// on the seat facing who comes to talk, or at the camp's fire
export function residentsOf(spots = []) {
  const out = [];
  for (const s of spots) {
    const npc = residentOf(s);
    if (!npc) continue;
    const at = s.kind === 'camp' || s.kind === 'outpost' ? s.places[0] : s.anchor;
    if (at) out.push({ ...npc, x: at.x, y: at.y, z: at.z, yaw: at.yaw });
  }
  return out;
}

// Three glass worlds, two bird flights in each. Progress lives in run.told, so old saves need no migration.
export const QUALMOS_CORE = '0,-20,0';
export const VOYAGE_CHAPTERS = 3;
// The landing platform reaches the globe's equator, rather than floating on its outside.
export const VOYAGE_PLANET_RADIUS = 8.25;
// A deep lagoon beside the dry rescue path. Heights are world units.
export const VOYAGE_LAGOON = Object.freeze({ x: 11.5, z: 7.5, radius: 2.6, surface: 2, bed: -2 });
export const VOYAGE_FLIGHT_SECONDS = 8.4;
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export function voyageFlightPose(seconds) {
  return { grow: smooth((seconds - .6) / 1.6), board: smooth((seconds - 2.2) / 1.1),
    travel: smooth((seconds - 3.5) / 2.6), land: smooth((seconds - 6.1) / 1.4),
    fade: smooth((seconds - 7.9) / .5) };
}
export const GLASS_HELMET = 'wear_glass_helmet';
export const glassBirdId = chapter => `held_glass_bird_${chapter}`;
export const glassRecordingId = chapter => `item_glass_recording_${chapter}`;
export const voyageFlag = (chapter, what) => `qualmos-voyage:${chapter}:${what}`;
export const voyageRoomKey = chapter => chapter === 1 ? QUALMOS_CORE : `${14000 + chapter * 100},-20,14000`;
export const voyagePlanetKey = chapter => `${14001 + chapter * 100},-20,14000`;
export const VOYAGE_HOME = '14400,-20,14000';
export function voyagePocket(key) {
  for (let chapter = 1; chapter <= VOYAGE_CHAPTERS; chapter++) {
    if (key === voyagePlanetKey(chapter)) return { kind: 'planet', chapter };
    if (chapter > 1 && key === voyageRoomKey(chapter)) return { kind: 'room', chapter };
  }
  return key === VOYAGE_HOME ? { kind: 'home', chapter: 3 } : null;
}
export const voyageHas = (told, chapter, what) => told?.has(voyageFlag(chapter, what)) ?? false;
export const rescuedGlassmakers = told => [1, 2, 3].filter(c => voyageHas(told, c, 'rescued')).length;
export function birdFlights(told, chapter) {
  if (!voyageHas(told, chapter, 'bird')) return 0;
  return 2 - Number(voyageHas(told, chapter, 'outbound')) - Number(voyageHas(told, chapter, 'onward'));
}
export const voyageReady = (told, chapter) => ['bird', 'helmet', 'message'].every(what => voyageHas(told, chapter, what));
// Owning the kit is not wearing it. A bow also puts the off-hand bird away.
export function voyageEquipmentProblem(chapter, { head, offhand, bow = false }) {
  if (head !== GLASS_HELMET) return 'helmet';
  if (offhand !== glassBirdId(chapter) || bow) return 'bird';
  return null;
}
export function voyageDestination(told, { kind, chapter }, bossDefeated = false) {
  if (kind === 'room' && voyageReady(told, chapter)) {
    // Returning to a room after a death/portal never charges for the same outward flight again.
    if (voyageHas(told, chapter, 'onward')) return null;
    return { key: voyagePlanetKey(chapter), charge: voyageHas(told, chapter, 'outbound') ? null : 'outbound' };
  }
  if (kind === 'planet' && bossDefeated && voyageHas(told, chapter, 'rescued')
      && voyageHas(told, chapter, 'outbound') && !voyageHas(told, chapter, 'onward')) {
    return { key: chapter < 3 ? voyageRoomKey(chapter + 1) : VOYAGE_HOME, charge: 'onward' };
  }
  return null;
}
// Call only after the destination has loaded. Failed loads must not consume the bird.
export function spendVoyageFlight(told, chapter, charge) {
  if (!charge) return true;
  if (!['outbound', 'onward'].includes(charge) || voyageHas(told, chapter, charge) || birdFlights(told, chapter) <= 0) return false;
  if (charge === 'outbound' && !voyageReady(told, chapter)) return false;
  if (charge === 'onward' && (!voyageHas(told, chapter, 'outbound') || !voyageHas(told, chapter, 'rescued'))) return false;
  told.add(voyageFlag(chapter, charge));
  return true;
}
export const VOYAGE_POSITIONS = Object.freeze({
  bird: [6, 2, 8], helmet: [8, 2, 8], message: [10, 2, 8],
  rescue: [8, 2, 4.5], launch: [8, 2, 12],
});

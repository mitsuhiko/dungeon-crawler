// The story's scenes (game/scene.js plays them, docs/story.md "The beginning"): short moments
// where the camera leaves the hero for a few seconds, like a boss's intro (core/bossintro.js, whose
// shots, blend and black bars they share), but about something else than a boss: the robot waking
// at the crash in town, the glassmaker's first glass shown on its rock, and that glass breaking.
// Pure: the timings, the shots and the moments things happen.
//
// A scene, in seconds from its start:
//   length     when it is over; hold: until when the hero has no control; walk: how long they walk
//              on towards the scene's spot (while the ground goes on)
//   letterbox  [in, out] of the black bars (null: none)
//   blend      [from, full, back]: the free camera takes over from the game's, and at `back` cuts
//              back to it behind the bars (null: the game's camera stays)
//   shake      how far the camera drifts as if held in a hand (cells)
//   shots      the camera's keys (core/bossintro.js shotAt): points [anchor, ahead, right, up] in the
//              frame from the hero to the scene's spot, on the anchors the scene is given ('hero',
//              'spot' and what it adds: the ladder's foot 'ladder')
//   at         the moments things happen ({ name: t }): game/scene.js calls the scene's handler for
//              each as it comes, and every one not come yet when the scene is skipped or cut short
//   face       (optional) the anchor the hero turns to while held
export const SCENE_SKIP_FROM = 0.6;   // s into a scene before a click, Space or Enter skips it

const OPEN = { t: 0, cam: ['hero', -2.2, 0.9, 2.0], look: ['spot', 0, 0, 0.5], fov: 50 };
export const SCENES = Object.freeze({
  // The robot wakes (core/robot.js): coming near the crash in town the hero walks on a step or two
  // and stops; the camera goes to the robot lying in the grass, its eyes open, it lifts off and
  // shakes itself (RobotWake, WAKE s from `wake`) and says hello; the camera comes back as it is up.
  robot: { length: 6.0, hold: 5.6, walk: 0.45, letterbox: [0.2, 5.6], blend: [0.4, 1.6, 5.4], shake: 0.012, face: 'spot',
    at: { wake: 1.4 },
    shots: [OPEN,   // (then from its side, beyond it: the hero stands in front of it)
      { t: 1.6, cam: ['spot', 0.6, 2.8, 1.0], look: ['spot', 0, 0, 0.25], fov: 42 },
      { t: 3.4, cam: ['spot', 1.2, 2.8, 1.4], look: ['spot', 0, 0, 0.8], fov: 44, ease: 'inOut' },
      { t: 5.4, cam: ['spot', 1.5, 2.6, 1.5], look: ['spot', 0, 0, 0.9], fov: 44, ease: 'linear' }] },
  // The glassmaker's first glass, coming into the rock's room: the camera rises from over the hero's
  // shoulder past the snakes at the rock's foot, up the rock to the glass glinting on top, and back.
  glass: { length: 6.4, hold: 6.0, walk: 0.7, letterbox: [0.2, 6.0], blend: [0.3, 1.5, 5.8], shake: 0.015, face: 'spot',
    at: { glint: 3.1 },
    shots: [OPEN,
      { t: 1.5, cam: ['ladder', -4.6, 2.2, 3.4], look: ['ladder', 0, 0, 0.9], fov: 50 },
      { t: 3.0, cam: ['spot', -3.2, 1.2, 1.0], look: ['spot', 0, 0, 0.2], fov: 38, ease: 'inOut' },
      { t: 5.8, cam: ['spot', -2.7, 0.6, 1.2], look: ['spot', 0, 0, 0.3], fov: 36, ease: 'linear' }] },
  // His glass breaks (game/intro.js): close on it, in front of the hero who walked into it, it
  // bursts, the camera stays a moment in the light and comes back as his voice begins.
  break: { length: 3.0, hold: 2.8, walk: 0, letterbox: [0, 2.8], blend: [0, 0.5, 2.6], shake: 0.01,
    at: { burst: 0.6 },
    shots: [
      { t: 0, cam: ['spot', 2.2, 0.9, 0.6], look: ['spot', 0, 0, 0.1], fov: 46 },
      { t: 2.6, cam: ['spot', 2.0, -0.9, 0.9], look: ['spot', 0, 0, 0.2], fov: 42, ease: 'linear' }] },
  // A new hero comes out of the inn as the world comes up (no camera of its own: the hero walks
  // out of the door onto its step, the world fading in round them)
  wake: { length: 1.8, hold: 1.6, walk: 1.2, letterbox: null, blend: null, shake: 0, at: { out: 0 }, shots: [] },
});

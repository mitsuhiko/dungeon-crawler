// What this device can afford, beyond its frame rate (which Auto follows, render/resolution.js):
// its memory. A phone's GPU shares the phone's memory, and iOS Safari gives a page far less of it
// than the phone has: past that it kills the page outright (no lost context to recover from, the
// tab just reloads). Nothing in Safari tells a page how much it may use, nor how much it uses, so
// the game goes by the kind of device (docs/lighting.md, "Small devices").
//   handheld  a phone or tablet: the screen touched, or iOS (an iPad with a trackpad or a mouse
//          says its pointer is fine, but it is an iPad all the same). Starts at 30 frames a
//          second (game/settings.js).
//   small  a handheld, or a browser that says it has 4 GB or less (navigator.deviceMemory:
//          Chrome's; Safari says nothing). ?small=1 / ?small=0 forces it.
// What a small device keeps smaller: the bakes (render/bake.js: at most BAKE_DETAIL.light, fewer
// kept and baked ahead), the sun's map of what moves (game/quality.js: at most SMALL_SUN_MAP),
// on every quality level; the pixels drawn (core/resolution.js nativeRatio: at most
// SMALL_PIXELS, render/resolution.js), and no MSAA at first (game/settings.js). It starts on the
// Low lighting level (game/quality.js). What the levels change otherwise stays.
const forced = typeof location === 'object' ? new URLSearchParams(location.search).get('small') : null;
export const touchScreen = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const nav = typeof navigator === 'object' ? navigator : {};
// (an iPad says it is a Mac, but a Mac has no touch screen)
const ios = /iPhone|iPad|iPod/.test(nav.platform ?? '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
export const handheld = touchScreen || ios;
export const small = forced === '1' ? true : forced === '0' ? false
  : handheld || (nav.deviceMemory > 0 && nav.deviceMemory <= 4);
export const SMALL_SUN_MAP = 1024;   // texels a side of the sun's map of what moves, at most

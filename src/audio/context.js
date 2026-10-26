// The one AudioContext shared by sound effects (sfx.js, footsteps.js, loops.js) and music
// (music.js). Browsers only let audio start after a user gesture, so it is made on the first key
// or click. Three buses, each with its own volume (the settings, game/settings.js): the sounds,
// the music and the narrator's voice (game/narrator.js), all into a master with the volume of
// everything. Asked to (the settings), the
// master is quiet while the game is behind something: another tab, or another window in front.
// The context runs at RATE, whatever the speakers run at: every sound is generated, and the
// audio thread's work grows with the sample rate. Left to the device, a USB DAC or audio
// interface at 96 or 192 kHz made the music alone cost two to four times as much, up to all
// of a core: the sound broke up. The browser resamples to the device, which is cheap.
// 'balanced' latency gives the audio thread a longer buffer than 'interactive', so a busy
// moment does not crackle; the sound effects come a few ms later, which nobody hears.
const RATE = 44100;
let ctx = null, sounds = null, music = null, voice = null, master = null;
const starters = [];
const level = { sounds: 1, music: 1, voice: 1, master: 1 };
let quietBehind = false;
// a volume (0-1, as the slider shows it) as a gain: loudness follows the square more evenly
const gainOf = v => v * v;
const behind = () => document.hidden || !document.hasFocus();
const masterGain = () => (quietBehind && behind() ? 0 : gainOf(level.master));

function start() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC({ sampleRate: RATE, latencyHint: 'balanced' }); }
    catch { ctx = new AC(); }   // (old Safari takes no options)
    sounds = ctx.createGain(); music = ctx.createGain(); voice = ctx.createGain(); master = ctx.createGain();
    sounds.gain.value = gainOf(level.sounds); music.gain.value = gainOf(level.music); voice.gain.value = gainOf(level.voice);
    master.gain.value = masterGain();
    sounds.connect(master); music.connect(master); voice.connect(master); master.connect(ctx.destination);
    for (const fn of starters) fn(ctx, sounds, music, voice);
  }
  if (ctx.state === 'suspended') ctx.resume();
}
addEventListener('pointerdown', start, true);
addEventListener('keydown', start, true);

// fn(ctx, sounds, music, voice) runs once the context exists (right away if it already does):
// the buses to play the sound effects, the music and the narrator into
export function onAudioStart(fn) {
  starters.push(fn);
  if (ctx) fn(ctx, sounds, music, voice);
}

// whether sound can play now (a key or click has started it)
export const audioRunning = () => ctx?.state === 'running';
// the sound's clock (s), which the music and the voices are timed by (a film follows it)
export const audioTime = () => ctx?.currentTime ?? 0;

// bus: 'sounds', 'music', 'voice' or 'master'; v: 0 (silent) to 1 (full)
export function setVolume(bus, v) {
  level[bus] = v;
  if (bus === 'master') { fitMaster(); return; }
  const g = bus === 'music' ? music : bus === 'voice' ? voice : sounds;
  if (g) g.gain.setTargetAtTime(gainOf(v), ctx.currentTime, 0.02);
}
function fitMaster() { if (master) master.gain.setTargetAtTime(masterGain(), ctx.currentTime, 0.05); }
// quiet while the game is behind something (on), or not
export function setQuietBehind(on) { quietBehind = !!on; fitMaster(); }
document.addEventListener('visibilitychange', fitMaster);
addEventListener('blur', fitMaster);
addEventListener('focus', fitMaster);

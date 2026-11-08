// Added to the game's page by tools/sim-probe.py; runs only with ?probe=caps|full|memory. Each
// step is posted to /report/<step> (the tool prints it).
//   caps  WebGL's features where the page runs
//   full  also: a shader compiled ahead (does it finish in the background?), a fence (does it
//         signal without blocking?), entering a deep cube behind the curtain, portal trips, a
//         quality level switch; the frames over 50 ms of each, how much of them the world's own
//         drawing took (in Safari the compiling happens in another process: a frame comes late
//         with little time of the page's own), and the shaders compiled while drawing.
//   memory  what the page holds (with ?perf=1): in the town, at the horde of each of `depths`
//         (2,4,6,8), in the town again; its pixels, MSAA, quality level, WebGL's buffers and
//         textures (render/gpumem.js), the cubes' geometry, the narrator's decoded clips (the tool
//         adds what Safari's processes hold).
const P = new URLSearchParams(location.search);
const mode = P.get('probe');
const post = (step, data) => fetch('/report/' + step, { method: 'POST', body: JSON.stringify(data) }).catch(() => {});
const sleep = ms => new Promise(r => setTimeout(r, ms));
addEventListener('error', e => post('error', { msg: String(e.message), at: e.filename + ':' + e.lineno }));
addEventListener('unhandledrejection', e => post('error', { msg: String(e.reason?.stack || e.reason) }));

function caps() {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return { webgl2: false };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    ua: navigator.userAgent, dpr: devicePixelRatio, screen: [screen.width, screen.height], inner: [innerWidth, innerHeight],
    coarse: matchMedia('(pointer: coarse)').matches, cores: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory ?? null,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    extensions: gl.getSupportedExtensions(),
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE), max3D: gl.getParameter(gl.MAX_3D_TEXTURE_SIZE), maxSamples: gl.getParameter(gl.MAX_SAMPLES),
    fences: typeof gl.fenceSync === 'function', gpuTimers: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
    parallelCompile: !!gl.getExtension('KHR_parallel_shader_compile'), floatTargets: !!gl.getExtension('EXT_color_buffer_float'),
  };
}

async function compileTest(THREE, renderer, scene, camera) {
  const m = new THREE.MeshStandardMaterial({ color: 0x123456 }), tag = Math.random().toString(36).slice(2);
  m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('void main() {', `void main() {\n float probe${tag} = 1.0;`); };
  m.customProgramCacheKey = () => 'probe' + tag;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), m), t0 = performance.now();
  renderer.compile(mesh, camera, scene);
  const call = performance.now() - t0, prog = renderer.properties.get(m).currentProgram, atOnce = prog?.isReady();
  const t1 = performance.now();
  while (prog && !prog.isReady() && performance.now() - t1 < 5000) await sleep(2);
  return { compileCallMs: +call.toFixed(1), readyAtOnce: atOnce, readyAfterMs: +(performance.now() - t1).toFixed(1) };
}

async function fenceTest(renderer, scene, camera) {
  const gl = renderer.getContext();
  renderer.render(scene, camera);
  const s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0), t0 = performance.now();
  let polls = 0;
  while (gl.getSyncParameter(s, gl.SYNC_STATUS) !== gl.SIGNALED && performance.now() - t0 < 2000) { polls++; await sleep(1); }
  gl.deleteSync(s);
  return { signaledAfterMs: +(performance.now() - t0).toFixed(1), polls };
}

// frames while fn runs (and `after` ms more): the long ones with the world's drawing time in them
let acct = null;
function account(renderer, scene) {
  const render = renderer.render;
  renderer.render = function (s, c) {
    if (!acct || s !== scene) return render.call(this, s, c);
    const t0 = performance.now();
    render.call(this, s, c);
    acct.draw += performance.now() - t0;
  };
}
async function watch(programStats, fn, after = 2500) {
  const long = [], c0 = programStats.compiledWhileDrawing;
  let last = 0, on = true, n = 0, worst = 0;
  acct = { draw: 0 };
  const tick = t => {
    if (last) { const d = t - last; n++; worst = Math.max(worst, d); if (d > 50) long.push({ ms: Math.round(d), drawMs: Math.round(acct.draw) }); }
    acct = { draw: 0 }; last = t;
    if (on) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  await sleep(200);
  const t0 = performance.now(), result = await fn(), ms = Math.round(performance.now() - t0);
  await sleep(after); on = false;
  return { ms, result, frames: n, worst: Math.round(worst), long, compiledWhileDrawing: programStats.compiledWhileDrawing - c0 };
}

async function full() {
  for (let i = 0; i < 300 && !window.__game?.state?.world; i++) await sleep(200);
  const g = window.__game, THREE = await import('three');
  const S = await import('/src/game/settings.js'), bake = await import('/src/render/bake.js'), sc = await import('/src/render/scene.js');
  const dev = await import('/src/game/dev.js'), { programStats } = await import('/src/render/programs.js'), Q = await import('/src/game/quality.js');
  const { renderer, scene, camera } = sc, gl = renderer.getContext();
  const lost = () => gl.isContextLost();
  account(renderer, scene);
  post('start', { graphics: S.graphics(), level: Q.qualityLevel(), msaa: S.antialiasSamples(), fps: S.frameRate(), px: [gl.drawingBufferWidth, gl.drawingBufferHeight], ratio: renderer.getPixelRatio() });
  post('compile', await compileTest(THREE, renderer, scene, camera));
  post('fence', await fenceTest(renderer, scene, camera));
  const look = P.get('look') ?? 'low';
  S.setGraphics(look);
  await sleep(1500);
  await g.chat.run('/god on'); await g.chat.run('/passive on');
  post('enter', { look, ...await watch(programStats, async () => {
    await g.goHorde(+(P.get('d') ?? 14));
    for (let i = 0; i < 1200 && !bake.baked(g.state.world) && !lost(); i++) await sleep(50);
    const b = g.state.world.bake;
    return { lights: b?.lights.length, lightmap: b?.geo?.lightmap, lost: lost() };
  }) });
  await g.chat.run('/remove');
  await sleep(3000);
  for (let n = 0; n < +(P.get('trips') ?? 4) && !lost(); n++) {
    post('trip' + n, await watch(programStats, async () => {
      const ports = g.state.map.portals.filter(p => p.kind === 'side');
      dev.takePortal(ports[n % ports.length]);
      for (let i = 0; i < 600 && g.transitioning; i++) await sleep(20);
      for (let i = 0; i < 1200 && !bake.baked(g.state.world); i++) await sleep(20);
      return { key: g.state.cubeKey, lights: g.state.world.bake?.lights.length, lost: lost() };
    }));
  }
  post('levelSwitch', await watch(programStats, async () => { S.setGraphics(look === 'high' ? 'lowest' : 'high'); }));
  S.setGraphics(look);
  post('done', { programs: renderer.info.programs.length, lost: lost(), memory: renderer.info.memory });
}

async function memory() {
  for (let i = 0; i < 300 && !window.__game?.state?.world; i++) await sleep(200);
  const g = window.__game, bake = await import('/src/render/bake.js'), dev = await import('/src/game/dev.js');
  const { renderer } = await import('/src/render/scene.js'), { gpuMemory } = await import('/src/render/gpumem.js');
  const { msaaSamples, MSAA_LEVELS } = await import('/src/render/msaa.js'), S = await import('/src/game/settings.js'), Q = await import('/src/game/quality.js');
  const D = await import('/src/render/device.js'), N = await import('/src/game/narrator.js');
  const gl = renderer.getContext(), mb = b => +(b / 2 ** 20).toFixed(1);
  const settle = async (ms = 4000) => {
    for (let i = 0; i < 600 && g.transitioning; i++) await sleep(50);
    for (let i = 0; i < 1200 && !bake.baked(g.state.world); i++) await sleep(50);
    await sleep(ms);
  };
  const state = () => {
    const m = gpuMemory(), geo = g.state.cubes.geometryHeld?.(), voice = N.narrationMemory?.();
    return { cube: g.state.cubeKey, small: D.small, fps: S.frameRate(), msaa: msaaSamples(), msaaLevels: MSAA_LEVELS, asked: S.antialiasSamples(), level: Q.qualityLevel(), ratio: +renderer.getPixelRatio().toFixed(3),
      px: [gl.drawingBufferWidth, gl.drawingBufferHeight], gl: m && { total: Math.round(m.total), peak: Math.round(m.peak), renderbuffers: Math.round(m.renderbuffers) },
      geometry: geo && { mb: mb(geo.bytes), cubes: geo.cubes, of: geo.of }, voice: voice && { mb: mb(voice.decoded), clips: voice.clips } };
  };
  await settle(8000);
  post('town', state());
  await g.chat.run('/god on');
  for (const d of (P.get('depths') ?? '2,4,6,8').split(',').filter(Boolean).map(Number)) {
    await g.goHorde(d); await settle(); await g.chat.run('/remove');
    post('depth' + d, state());
  }
  await dev.goPlace({ depth: 0 }); await settle(6000);
  post('town-again', state());
  post('done', {});
}

if (mode) {
  post('caps', caps());
  if (mode === 'full') full().catch(e => post('error', { msg: String(e.stack || e) }));
  if (mode === 'memory') memory().catch(e => post('error', { msg: String(e.stack || e) }));
}

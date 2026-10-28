// Gets a fresh checkout going (CONTRIBUTING.md, "Getting set up"): npm run setup [-- --no-models]
//
// Checks what the game, its tests and its tools need, says how to get what is missing, and gets
// the rest ready: Node (the game has no build step and no npm packages), uv (the dev server and
// the Python tools; it brings its own Python), ffmpeg with libopus (encodes the narrator's
// clips), and the narrator's voice (tools/narration.py, docs/narration.md): its Python packages,
// as locked in tools/narration.py.lock, and the Qwen3-TTS models at their pinned revisions, about
// 9 GB into the Hugging Face cache, downloaded once. --no-models leaves those out: the game, the
// tests and `node tools/narration.mjs --drop` run without them. Blender is only for the models'
// sources (blender/): looked for, never needed. Run it again any time: what is there is kept.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
for (const a of args) if (a !== '--no-models') { console.error(`unknown argument ${a} (npm run setup [-- --no-models])`); process.exit(2); }
const models = !args.includes('--no-models');
const win = process.platform === 'win32', mac = process.platform === 'darwin';

// a command's output, or null if it is not here
const out = (cmd, argv) => {
  try { return execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
};
const problems = [];
const ok = (what, how) => console.log(`  ok    ${what}${how ? `: ${how}` : ''}`);
const lack = (what, fix, needed = true) => { console.log(`  ${needed ? 'MISS' : 'skip'}  ${what}\n        ${fix}`); if (needed) problems.push(what); };

console.log('Checking the dev environment (CONTRIBUTING.md, "Getting set up"):');

// Node: import.meta.dirname (20.11), the test runner
const [major, minor] = process.versions.node.split('.').map(Number);
if (major > 20 || major === 20 && minor >= 11) ok('Node', process.versions.node);
else lack(`Node ${process.versions.node}`, 'Node 20.11 or newer: https://nodejs.org/');

const uv = out('uv', ['--version']);
if (uv) ok('uv', uv.trim());
else lack('uv (the dev server, the Python tools)', win ? 'winget install astral-sh.uv' : mac ? 'brew install uv (or: curl -LsSf https://astral.sh/uv/install.sh | sh)'
  : 'curl -LsSf https://astral.sh/uv/install.sh | sh  (https://docs.astral.sh/uv/)');

const encoders = out('ffmpeg', ['-hide_banner', '-encoders']);
const ffmpegFix = win ? 'winget install Gyan.FFmpeg' : mac ? 'brew install ffmpeg' : 'apt install ffmpeg (or your system\'s package)';
if (encoders && /\blibopus\b/.test(encoders)) ok('ffmpeg', 'with libopus');
else lack(encoders ? 'ffmpeg without libopus (the narrator\'s clips)' : 'ffmpeg (encodes the narrator\'s clips)', `${ffmpegFix}; needed only to render narration`, models);

for (const v of ['glassmaker', 'child'])
  if (!existsSync(resolve(ROOT, `tools/voices/${v}.flac`))) lack(`tools/voices/${v}.flac`, 'the narrator\'s voices are committed: is the checkout whole?');

const blender = mac && existsSync('/Applications/Blender.app') ? 'Blender.app' : out('blender', ['--version'])?.split('\n')[0];
if (blender) ok('Blender', `${blender} (for blender/: the models' sources)`);
else lack('Blender', 'only for working on the models (blender/, https://www.blender.org/); the game does not need it', false);

if (problems.length) {
  console.log(`\nMissing: ${problems.join(', ')}. Install it, then run npm run setup again.`);
  process.exit(1);
}

if (models) {
  // the narrator's environment (as tools/narration.mjs runs it), and the models downloaded
  console.log('\nThe narrator\'s voice: its Python packages and the Qwen3-TTS models (about 9 GB, once)...');
  const run = spawnSync('uv', ['run', '--quiet', resolve(ROOT, 'tools/narration.py'), '--setup'], { cwd: ROOT, stdio: 'inherit' });
  if (run.status !== 0) { console.log('\nThe narrator\'s setup failed (above). Run npm run setup again to go on where it stopped.'); process.exit(1); }
} else console.log('\n(--no-models: the narrator\'s models left out; npm run setup gets them later)');

console.log(`
Ready.
  npm run serve              the game at http://localhost:8000/ (?dev=1 for the dev tools)
  npm test                   the tests
  node tools/narration.mjs   render the narrator's new or changed lines${models ? '' : ' (needs the models)'}`);

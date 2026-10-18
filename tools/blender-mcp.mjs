// Project-local MCP environment; never install Python packages into Blender itself.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(root, '.pi', 'blender-mcp');
const version = '2.1.9';
const python = join(directory, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const marker = join(directory, '.installed-version');
const env = { ...process.env, DISABLE_TELEMETRY: 'true', PYTHONIOENCODING: 'utf-8' };
const localUv = join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'uv.exe' : 'uv');
const uv = process.env.BLENDER_MCP_UV || (existsSync(localUv) ? localUv : 'uv');

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root, env, encoding: 'utf8',
    // stdout belongs exclusively to the MCP protocol.
    stdio: ['ignore', capture ? 'pipe' : 2, 2],
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message || `exit ${result.status}`}`);
  }
  return result.stdout?.trim();
}

function connected() {
  return new Promise(resolve => {
    const socket = createConnection({ host: env.BLENDER_HOST || 'localhost', port: Number(env.BLENDER_PORT || 9876) });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(1000);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

function findBlender() {
  if (env.BLENDER_EXECUTABLE) return env.BLENDER_EXECUTABLE;
  if (process.platform === 'darwin') {
    for (const base of ['/Applications', join(homedir(), 'Applications')]) {
      const candidate = join(base, 'Blender.app', 'Contents', 'MacOS', 'Blender');
      if (existsSync(candidate)) return candidate;
    }
  }
  if (process.platform === 'win32') {
    const base = join(env.ProgramFiles || 'C:/Program Files', 'Blender Foundation');
    if (existsSync(base)) {
      const versions = readdirSync(base).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const version of versions) {
        const candidate = join(base, version, 'blender.exe');
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return 'blender';
}

try {
  const installed = existsSync(marker) ? readFileSync(marker, 'utf8').trim() : null;
  if (!existsSync(python)) {
    mkdirSync(dirname(directory), { recursive: true });
    run(uv, ['venv', '--python', '3.11', directory]);
  }
  if (installed !== version) {
    run(uv, ['pip', 'install', '--python', python, `mcp-for-blender==${version}`]);
    writeFileSync(marker, version);
  }

  if (!await connected()) {
    if (env.BLENDER_HOST && !['localhost', '127.0.0.1', '::1'].includes(env.BLENDER_HOST)) {
      throw new Error('Remote Blender is not reachable; start its addon server first.');
    }
    const addon = run(python, ['-c', 'from blender_mcp.addon_manager import get_bundled_addon_path; print(get_bundled_addon_path())'], true);
    console.error('Starting Blender with the project MCP addon (no preferences are changed).');
    const blender = spawn(findBlender(), ['--python', join(root, 'tools', 'blender-mcp-start.py'), '--', addon], {
      detached: true, stdio: 'ignore', env,
    });
    await new Promise((resolve, reject) => {
      blender.once('spawn', resolve);
      blender.once('error', reject);
    });
    blender.unref();
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      if (await connected()) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error('Blender did not start its MCP server within 90 seconds. Check the Blender window.');
  }

  const child = spawn(python, ['-m', 'blender_mcp.server'], { cwd: root, env, stdio: 'inherit' });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
} catch (error) {
  console.error(`Blender MCP: ${error.message}\nInstall uv and Blender, or set BLENDER_MCP_UV and BLENDER_EXECUTABLE to their executable paths.`);
  process.exitCode = 1;
}

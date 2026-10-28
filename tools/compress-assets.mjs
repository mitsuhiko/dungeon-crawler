// Compress the exported GLBs in assets/ with meshopt, after a Blender export and before
// committing: node tools/compress-assets.mjs [file.glb ...] (default: every GLB in assets/ that
// is not compressed yet; compressing twice would quantize twice, so those are skipped).
//
// gltf-transform (run through npx, pinned) reorders the vertices, quantizes them (positions to
// 14 bits over the file's bounds: the scale and offset go onto the mesh nodes; skinned meshes
// keep theirs in the bind matrices) and meshopt-encodes geometry and animation. The game decodes
// them with three's MeshoptDecoder and bakes the node scale back in (src/render/gltf.js).
//
// Quantized accessors no longer give exact bounds, so before compressing each root's exact
// bounds go into its extras (tools/glb.mjs BOUNDS), where the prop metadata and the tests read
// them. Then the prop metadata is regenerated (tools/prop-metadata.mjs).
import { execFile } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { readGlb, writeGlb, isCompressed, exactBounds, roots, BOUNDS } from './glb.mjs';
import { writePropMetadata } from './prop-metadata.mjs';

const GLTF_TRANSFORM = '@gltf-transform/cli@4.5.1';
const ASSETS = resolve(import.meta.dirname, '../assets');
const run = promisify(execFile);

const allGlbs = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? allGlbs(join(dir, e.name)) : e.name.endsWith('.glb') ? [join(dir, e.name)] : []);

// the exact bounds of every root that has meshes and baked transforms (props, items, buildings)
function withBounds(glb) {
  for (const i of roots(glb.json)) {
    let b = null;
    try { b = exactBounds(glb.json, i); } catch { continue; }   // a rig: its bounds are not needed
    if (b) glb.json.nodes[i].extras = { ...glb.json.nodes[i].extras, [BOUNDS]: b };
  }
  return glb;
}

async function compress(file, scratch) {
  const glb = readGlb(file), before = roots(glb.json).map(i => glb.json.nodes[i].name);
  const staged = join(scratch, relative(ASSETS, file).replaceAll(/[\\/]/g, '__'));
  writeFileSync(staged, writeGlb(withBounds(glb)));
  const args = ['-y', GLTF_TRANSFORM, 'meshopt', staged, staged + '.out.glb', '--quantization-volume', 'scene'];
  // Windows launches npx.cmd through its shell; quote paths that may contain spaces.
  const windows = process.platform === 'win32';
  await run('npx', windows ? args.map(a => `"${a}"`) : args, { shell: windows, windowsHide: true });
  const out = readGlb(staged + '.out.glb');
  if (!isCompressed(out.json)) throw Error('not compressed: ' + file);
  const after = roots(out.json).map(i => out.json.nodes[i].name);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('roots changed: ' + file);
  copyFileSync(staged + '.out.glb', file);
}

if (process.argv[1] === import.meta.filename) {
  const files = (process.argv.length > 2 ? process.argv.slice(2).map(f => resolve(f)) : allGlbs(ASSETS))
    .filter(f => !isCompressed(readGlb(f).json));
  const scratch = mkdtempSync(join(tmpdir(), 'crawler-compress-'));
  try {
    const queue = [...files];
    await Promise.all(Array.from({ length: 6 }, async () => {
      for (let f; (f = queue.shift());) { await compress(f, scratch); console.log('compressed', relative(ASSETS, f)); }
    }));
  } finally { rmSync(scratch, { recursive: true, force: true }); }
  console.log(`${files.length} compressed;`, writePropMetadata(ASSETS).length, 'props in src/core/propmetadata.js');
}

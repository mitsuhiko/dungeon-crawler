// Looks at the Squirtle's shape away from the game (render/squirtleshape.js, made into a surface
// as the game does: render/fluidfield.js surfaceNets): writes a few poses as OBJ files (with vertex
// colours) and renders them side by side in Blender, the preview the guide and the docs show
// (blender/previews/squirtle-preview.png; tools/preview-images.mjs makes the JPEG of it).
// Usage: node tools/squirtle-shape.mjs [preview.png] (Blender: macOS's, or $BLENDER)
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { shape, paintOf, fieldOf, restPose, EYES, WIDE } from '../src/render/squirtleshape.js';
import { surfaceNets } from '../src/render/fluidfield.js';

const ROOT = resolve(import.meta.dirname, '..');
const out = resolve(process.argv[2] ?? join(ROOT, 'blender/previews/squirtle-preview.png'));
const dir = mkdtempSync(join(tmpdir(), 'squirtle-shape-'));
mkdirSync(dirname(out), { recursive: true });
// its colours (core/enemies.js SQUIRTLE: azure.mid, frost.pale), in linear light
const colors = { body: { r: 0.09, g: 0.3, b: 0.72 }, foam: { r: 0.8, g: 0.9, b: 1 }, mouth: { r: 0.01, g: 0.02, b: 0.05 } };
// the poses, left to right: at rest, its mouth open to spit, leaping, crashed down, a puddle
const POSES = [restPose(), restPose({ open: 1, lean: 0.12 }), restPose({ open: 0.8, lean: 0.3, squash: 1.12, stretch: 1.25 }),
  restPose({ open: 0.3, lean: 0.45, squash: 0.55, stretch: 1.3 }), restPose({ size: 0.6, puddle: 1 })];
const files = POSES.map((p, n) => {
  const sh = shape(p), { s, box } = fieldOf(sh, p, 0), { pos, idx } = surfaceNets(s, box, 0.03);
  const paint = paintOf(colors, sh, p), c = [0, 0, 0], lines = [];
  for (let i = 0; i < pos.length; i += 3) { paint(pos[i], pos[i + 1], pos[i + 2], c); lines.push(`v ${pos[i]} ${pos[i + 1]} ${pos[i + 2]} ${c[0]} ${c[1]} ${c[2]}`); }
  for (let i = 0; i < idx.length; i += 3) lines.push(`f ${idx[i] + 1} ${idx[i + 1] + 1} ${idx[i + 2] + 1}`);
  // its eyes, as the game puts them (render/squirtleview.js): a white each, a dark pupil
  let base = pos.length / 3;
  const sphere = ([cx, cy, cz], [rx, ry, rz], [r, g, b]) => {
    const U = 12, V = 8;
    for (let j = 0; j <= V; j++) for (let i = 0; i < U; i++) {
      const th = Math.PI * j / V, ph = 2 * Math.PI * i / U;
      lines.push(`v ${cx + rx * Math.sin(th) * Math.cos(ph)} ${cy + ry * Math.cos(th)} ${cz + rz * Math.sin(th) * Math.sin(ph)} ${r} ${g} ${b}`);
    }
    for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) {
      const a = base + j * U + i + 1, b2 = base + j * U + (i + 1) % U + 1, c2 = a + U, d = b2 + U;
      lines.push(`f ${a} ${c2} ${d}`, `f ${a} ${d} ${b2}`);
    }
    base += (V + 1) * U;
  };
  if (p.puddle < 0.4) for (const side of [-1, 1]) {
    const S = sh.S, [wf, wh, wx] = EYES[0], [pf, ph, px] = EYES[1], a = sh.place(wf, wh, 'head'), b = sh.place(pf, ph, 'head');
    sphere([side * wx * S * WIDE, a[1], a[2]], [0.034 * S, 0.04 * S, 0.038 * S], [0.9, 0.93, 0.95]);
    sphere([side * px * S * WIDE, b[1], b[2]], [0.018 * S, 0.024 * S, 0.022 * S], [0.01, 0.01, 0.02]);
  }
  const file = join(dir, `${n}.obj`);
  writeFileSync(file, lines.join('\n'));
  return file;
});
const script = join(dir, 'render.py');
writeFileSync(script, `
import bpy, sys, math
from mathutils import Vector
args = sys.argv[sys.argv.index("--") + 1:]
out, files = args[0], args[1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 1500, 340
scene.view_settings.view_transform = "AgX"
scene.world = bpy.data.worlds.new("w"); scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.66, 0.72, 1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45
mat = bpy.data.materials.new("fluid"); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes["Principled BSDF"]; bsdf.inputs["Roughness"].default_value = 0.25
attr = nt.nodes.new("ShaderNodeVertexColor"); nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
ground = bpy.data.meshes.new("ground"); ground.from_pydata([(-30, -30, 0), (30, -30, 0), (30, 30, 0), (-30, 30, 0)], [], [(0, 1, 2, 3)])
g = bpy.data.objects.new("ground", ground); scene.collection.objects.link(g)
gm = bpy.data.materials.new("g"); gm.use_nodes = True; gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.55, 0.57, 0.53, 1); ground.materials.append(gm)
for name, loc, energy in (("key", (-6, -8, 12), 3000), ("fill", (8, -2, 8), 1200), ("rim", (2, 6, 10), 1500)):
    l = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA")); l.data.energy = energy; l.data.size = 6
    scene.collection.objects.link(l); l.location = loc; l.rotation_euler = (Vector((0, 0, 0.8)) - l.location).to_track_quat("-Z", "Y").to_euler()
for i, f in enumerate(files):
    bpy.ops.wm.obj_import(filepath=f, forward_axis="Y", up_axis="Z")
    ob = bpy.context.selected_objects[0]
    ob.rotation_euler = (math.pi / 2, 0, -math.pi / 2 - 0.5)   # (its front, +z, to the left, a little towards us)
    ob.location = (-8.4 + i * 4.2, 0, 0)
    for p in ob.data.polygons: p.use_smooth = True
    ob.data.materials.append(mat)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam); scene.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 21
cam.location = (0, -14, 7); cam.rotation_euler = (Vector((0, 0, 0.9)) - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
`);
const blender = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
execFileSync(blender, ['-b', '--python', script, '--', out, ...files], { stdio: 'ignore' });
console.log('wrote', out);

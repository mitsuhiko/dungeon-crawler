// The Blender previews the guide and the docs show, as small JPEGs.
//
// The Blender scripts render their previews into blender/previews/ (local only, not committed:
// see AGENTS.md). The few pictures the guide (learn/img/) and the docs (docs/img/) show are
// copies, converted here: node tools/preview-images.mjs [name ...] (default: every one whose
// preview is there; a name is a preview's path under blender/previews/ or the JPEG's file name).
// Render the preview first (each blender/<x>.py names its command at the top), then run this.
// Uses macOS's sips.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PREVIEWS = resolve(ROOT, 'blender/previews');
const QUALITY = 85;

// preview (under blender/previews/) -> [JPEG (from the repository root), widest width]
export const IMAGES = {
  // the guide
  'town-preview.png': ['learn/img/model-town.jpg'],
  'items-preview.png': ['learn/img/model-items.jpg'],
  'snake-preview.png': ['learn/img/model-snake.jpg'],
  'octonaut-preview.png': ['learn/img/model-octonaut.jpg'],
  'fireface-preview.png': ['learn/img/model-fireface.jpg'],
  'triangle-preview.png': ['learn/img/model-triangle.jpg'],
  'firecat-preview.png': ['learn/img/model-firecat.jpg'],
  'shraps-preview.png': ['learn/img/model-shraps.jpg'],
  'spicy-preview.png': ['learn/img/model-spicy.jpg'],
  'wolla-preview.png': ['learn/img/model-wolla.jpg'],
  'wolk-preview.png': ['learn/img/model-wolk.jpg'],
  'squirtle-preview.png': ['learn/img/model-squirtle.jpg'],
  'mecked-preview.png': ['learn/img/model-mecked.jpg'],
  'tornado-preview.png': ['learn/img/model-tornado.jpg'],
  'slug-preview.png': ['learn/img/model-slug.jpg'],
  'bolime-preview.png': ['learn/img/model-bolime.jpg'],
  'moose-preview.png': ['learn/img/model-moose.jpg'],
  // only the docs (they take the guide's for the rest)
  'gusto-preview.png': ['docs/img/model-gusto.jpg'],
  'totnar-preview.png': ['docs/img/model-totnar.jpg'],
  'squarlo-preview.png': ['docs/img/model-squarlo.jpg'],
  'flip-preview.png': ['docs/img/model-flip.jpg'],
  'foggery-preview.png': ['docs/img/model-foggery.jpg'],
  'slomo-preview.png': ['docs/img/model-slomo.jpg'],
  'mansk-preview.png': ['docs/img/model-mansk.jpg'],
  'monteur-preview.png': ['docs/img/model-monteur.jpg'],
  'sollmeldon-preview.png': ['docs/img/model-sollmeldon.jpg'],
  'umbra-preview.png': ['docs/img/model-umbra.jpg'],
  'loadout-bow-front.png': ['docs/img/loadout-bow.jpg'],
  'loadout-sword-front.png': ['docs/img/loadout-sword.jpg'],
  'loadout-crossbow-front.png': ['docs/img/loadout-crossbow.jpg'],
  'loadout-staff-front.png': ['docs/img/loadout-staff.jpg'],
  'loadout-trident-front.png': ['docs/img/loadout-trident.jpg'],
  'loadout-villagers-front.png': ['docs/img/loadout-villagers.jpg'],
  'clutter-preview.png': ['docs/img/clutter.jpg'],
  'themes-preview.png': ['docs/img/themes.jpg'],
  'themes/highlands-vignette.png': ['docs/img/themes-highlands-vignette.jpg'],
  'themes/darkforest.png': ['docs/img/themes-darkforest.jpg', 2400],
  'themes/darkforest-landmarks.png': ['docs/img/themes-darkforest-landmarks.jpg', 2400],
  'themes/slime.png': ['docs/img/themes-slime.jpg', 2400],
  'themes/slime-landmarks.png': ['docs/img/themes-slime-landmarks.jpg', 2400],
};

const sips = (...args) => execFileSync('sips', args, { encoding: 'utf8' });

function convert(preview, [jpeg, widest = 1600]) {
  const src = resolve(PREVIEWS, preview), dst = resolve(ROOT, jpeg);
  if (!existsSync(src)) return console.log(`skip  ${preview} (not rendered; see its blender/*.py)`);
  const width = Number(sips('-g', 'pixelWidth', src).match(/pixelWidth: (\d+)/)[1]);
  mkdirSync(dirname(dst), { recursive: true });
  sips('-s', 'format', 'jpeg', '-s', 'formatOptions', String(QUALITY),
    ...(width > widest ? ['--resampleWidth', String(widest)] : []), src, '--out', dst);
  console.log(`wrote ${jpeg} (${Math.round(statSync(dst).size / 1024)} KB) from ${preview}`);
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  const names = process.argv.slice(2);
  const unknown = names.filter(n => !Object.entries(IMAGES).some(([p, [j]]) => p === n || basename(j) === n));
  if (unknown.length) { console.error(`unknown: ${unknown.join(', ')}`); process.exit(1); }
  for (const [preview, target] of Object.entries(IMAGES))
    if (!names.length || names.includes(preview) || names.includes(basename(target[0]))) convert(preview, target);
}

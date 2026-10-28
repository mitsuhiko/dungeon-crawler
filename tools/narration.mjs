// The narrator's voice: renders the lines of src/core/narration.js to assets/narration/
// (docs/narration.md). Every line, in every language with a voice (VOICES), in each of its forms,
// becomes assets/narration/<lang>/<clip>.opus (Ogg Opus, mono, 10 kbit/s), where <clip> is the
// line's id, or `<id>.<form>`.
// assets/narration/manifest.json says what each clip was made from (its text, its seed, a hash of
// its TTS settings) and how long it is. A clip is rendered again only when its line's text (with
// its tags) or its seed changed, or when asked (--force, --stale): changing a voice, a filter or
// PIPELINE leaves the clips as they are (--check counts them).
//
// The speech is Qwen3-TTS (https://github.com/QwenLM/Qwen3-TTS), its 1.7B base model, in a voice
// cloned from a reference recording (tools/voices/<voice>.flac, its words in <voice>.txt), run by
// tools/narration.py through uv: the first run downloads the model (about 4.5 GB, into the
// Hugging Face cache), no account needed. A voice that `speaks` (VOICES) is said by the
// CustomVoice model instead, in the cloned voice's speaker embedding, and follows instructions: a
// line's `instruct`, its performance tags ([sad] ...: TAGS), the voice's own (docs/narration.md,
// "Instructions"); about 4.5 GB more.
//
//   node tools/narration.mjs                 render what is missing or changed, drop what is gone
//   node tools/narration.mjs --check         list what is missing, changed or gone (exit 1 if any)
//   node tools/narration.mjs --dry-run       list what would be rendered
//   node tools/narration.mjs --lang de       only German (a comma-separated list)
//   node tools/narration.mjs --only boss.    only the lines whose id starts so (comma-separated)
//   node tools/narration.mjs --force         render the chosen clips again, even if current
//   node tools/narration.mjs --stale         also render the clips made with other settings (a
//                                            voice, a filter, an instruction, PIPELINE) again
//   node tools/narration.mjs --takes 4       audition: seeds 0-3 of the chosen clips into
//                                            narration-takes/ in the system's temp directory
//                                            (printed), assets untouched; then pin the best as
//                                            the line's `seed`
//   node tools/narration.mjs --takes 3 --first-seed 10   seeds 10-12
//   node tools/narration.mjs --say "Any text." [--voice child|robot|experiment_glassmaker:0.5,experiment_lost-hearing:0.5]
//                                [--filter old-radio|tone:experiment_lost-hearing|none]
//                                [--instruct "Speak slowly."] [--lang de] [--seed 2]
//                                            preview: says the text in a voice (tools/voices/; the
//                                            language's own voice and filter when left out) into
//                                            narration-takes/say/ in the temp directory
//   node tools/narration.mjs --bake glassmaker --voice experiment_glassmaker:0.3,experiment_lost-hearing:0.7
//                                [--filter tone:experiment_lost-hearing] [--say "..."] [--seed 0]
//                                            bakes a voice (a mix, a filter) into a recording of
//                                            its own, tools/voices/<name>.flac and .txt; it says
//                                            --say, or the words of the (first) voice's recording
//   node tools/narration.mjs --workers 4     how many processes render at once (default 3 on a
//                                            GPU; each loads the model, about 4.5 GB)
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { LINES, untagged } from '../src/core/narration.js';
import { filmLines } from '../src/core/film.js';
import { FILMS } from '../src/film/films.js';
import { setLanguage, tr, paramsOf, loadLocale, SOURCE } from '../src/i18n/i18n.js';

const ROOT = resolve(import.meta.dirname, '..');
export const ASSETS = resolve(ROOT, 'assets');
const TAKES = join(tmpdir(), 'narration-takes');
export const VOICE_DIR = resolve(ROOT, 'tools/voices');

// the languages with a voice: the Qwen3-TTS model, the language it is told it speaks, the voice
// (the reference recording in VOICE_DIR it clones), how it is cloned (`clone`: 'embedding', the
// voice read in the model's own manner, or 'context', the recording's manner too: see
// tools/narration.py), the sampling's `temperature` (null: the model's own, 0.9) and, if any,
// the `filter` the voice goes through (tools/narration.py FILTERS: 'old-radio', as if heard
// through an old radio, with static; 'robot', the voice gone a little machine; 'full', fuller
// and warmer; 'metal-monotone', a machine's voice, mostly monotone, in a metal can;
// 'stepped-vocoder', the robot's: its melody snapped to semitones and a semitone up, a quarter
// vocoder, a small toy speaker and a short ring;
// 'tone:<voice>', the tone of another
// voice's recording). A language
// without one shows the narrator's words only.
// `speaks`: the model that says the lines, when not `model` itself: CustomVoice, in the voice's
// speaker embedding (taken with `model`), following instructions; `instruct`, the voice's own
// instruction for every line that has none (none: as it comes).
const MODEL = 'Qwen/Qwen3-TTS-12Hz-1.7B-Base';
const SPEAKER = 'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice';
const NARRATOR = { model: MODEL, speaks: SPEAKER, voice: 'glassmaker', clone: 'embedding', temperature: 0.7 };
// learn: sound.html#qwen (see learn/README.md)
export const VOICES = {
  en: { ...NARRATOR, language: 'English' },
  de: { ...NARRATOR, language: 'German' },
};
// voices made from another's recording: it goes through `prepare` (tools/narration.py PREPARE)
// before the voice is taken from it, and what the voice says goes through `filter` (FILTERS)
// unless VOICES or --filter say another. Or made from several (`mix`: voices and their weights):
// a voice between them (their speaker embeddings averaged; 'embedding' cloning only)
// learn: sound.html#fingerprint #qwen (see learn/README.md)
export const MADE = {
  // the Glassmaker's recording halfway to the narrator's voice, in the narrator's tone
  'glassmaker-mix': { mix: { experiment_glassmaker: 0.5, 'experiment_lost-hearing': 0.5 }, filter: 'tone:experiment_lost-hearing' },
  // the robot's voice: child, clockwork and easy to understand (docs/narration.md, "Made voices")
  robot: { from: 'child', filter: 'stepped-vocoder' },
};
// a voice's settings, as VOICES gives them, with what a made voice brings
const settingsOf = voice => {
  const made = MADE[voice.voice];
  return made ? { ...voice, prepare: made.prepare, filter: voice.filter === undefined ? made.filter : voice.filter } : voice;
};

// The performance tags a line's text may carry (core/narration.js TAG), and the instruction each
// is: from the tag on, the line is said so (until the next tag); an event tag (POINT) is said in
// the one sentence after it only. Vivid plain English works best: CustomVoice takes it as a mood,
// not as settings (a "Tempo: +20%" does nothing, or the opposite).
// learn: sound.html#instructions (see learn/README.md)
export const TAGS = {
  sad: 'Speak in a sad, sorrowful tone, voice low and heavy, on the verge of tears.',
  happy: 'Speak with bright, warm joy, smiling through every word.',
  excited: 'Speak excitedly, quick and full of energy.',
  angry: 'Speak in a furious, seething tone, voice sharp and hard.',
  serious: 'Speak in a serious, grave and steady tone.',
  calm: 'Speak calmly and gently, slow and soothing.',
  curious: 'Speak with curiosity and wonder, as if discovering something.',
  amazed: 'Speak in amazement, awed and a little breathless.',
  wistful: 'Speak wistfully, fond and a little sad, remembering long ago.',
  tired: 'Speak tired and weary, slowly, with little energy.',
  scared: 'Speak in a frightened, trembling voice, shaky and breathless.',
  trembling: 'Speak with a trembling, unsteady voice.',
  empathetic: 'Speak warmly and kindly, full of sympathy.',
  mischievously: 'Speak mischievously, playful and sly, as if hiding a grin.',
  sarcastic: 'Speak sarcastically, dry and mocking.',
  reluctantly: 'Speak reluctantly, hesitant and unwilling.',
  crying: 'Speak while crying, voice breaking with sobs.',
  shouting: 'Shout loudly and urgently.',
  whispers: 'Whisper softly and quietly, as if telling a secret.',
  'very slowly': 'Speak very slowly, drawing out every word.',
  'very fast': 'Speak very fast, rushing the words.',
};
// learn: sound.html#instructions (see learn/README.md)
export const POINT = {
  sighing: 'Begin with a weary sigh, then speak softly.',
  laughing: 'Speak while laughing, amused.',
  giggles: 'Speak with a little giggle, amused and light.',
  gasp: 'Begin with a sharp gasp of surprise.',
  'clears throat': 'Clear your throat first, then speak.',
};
// where a sentence ends (as tools/narration.py SENTENCE_END): after . ! ? or … (a closing quote
// may follow), before the next word
const SENTENCE_END = /(?<=[.!?…]["'»«“”‘’]?)\s+(?=\S)/;
const TAG_SPLIT = /\s*(\[[a-z][a-z ]*\])\s*/;
// A line (its text with its tags) in sentences, each with the instruction it is said with:
// [[instruction or null, sentence], ...]. `instruct` is what is said without a tag (the line's,
// or the voice's); an event tag goes before the mood of the moment. A tag in the middle of a
// sentence cuts it there.
// learn: sound.html#instructions (see learn/README.md)
export function sentencesOf(text, instruct = null) {
  const out = [];
  let mood = instruct || null, once = null;
  for (const part of text.split(TAG_SPLIT)) {
    const tag = part.match(/^\[([a-z][a-z ]*)\]$/)?.[1];
    if (tag) {
      if (POINT[tag]) once = POINT[tag];
      else if (TAGS[tag]) mood = TAGS[tag];
      continue;
    }
    for (const s of part.trim().split(SENTENCE_END).filter(Boolean)) {
      out.push([once ? [once, mood].filter(Boolean).join(' ') : mood, s]);
      once = null;
    }
  }
  return out;
}
// the tags in a text that are neither TAGS nor POINT
const unknownTags = text => [...text.matchAll(/\[([a-z][a-z ]*)\]/g)].map(m => m[1]).filter(t => !TAGS[t] && !POINT[t]);

// how tools/narration.py turns speech into a clip: raise it when that changes (the clips made
// before stay until rendered again: --stale)
export const PIPELINE = 4;

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const FORM = /^[a-z0-9]+$/;

const seedOf = (line, lang, form) => {
  const s = line.seed;
  if (s == null) return 0;
  if (typeof s === 'number') return s;
  return s[form ? `${lang}.${form}` : lang] ?? s[lang] ?? 0;
};
const hashOf = spec => createHash('sha256').update(JSON.stringify(spec)).digest('hex').slice(0, 16);

// what a clip is made from: the voice's settings, its reference, the seed and the text (no
// `prepare` or `filter` key without one, so the clips made before them keep their hashes); a
// voice that `speaks` also the line in sentences with their instructions (`said`, sentencesOf)
const specOf = (voice, ref, seed, text, said) => ({
  ...(voice.speaks ? { speaks: voice.speaks, said } : {}),
  pipeline: PIPELINE, model: voice.model, language: voice.language, voice: voice.voice, clone: voice.clone,
  ref: ref.hash ?? null, temperature: voice.temperature ?? null, ...(voice.prepare ? { prepare: voice.prepare } : {}),
  ...(voice.filter ? { filter: voice.filter } : {}),
  ...(targetOf(voice.filter) ? { filterRef: referenceOf(targetOf(voice.filter)).hash ?? null } : {}), seed, text,
});
// the voice a filter is given (`tone:<voice>`), or null
const targetOf = filter => (filter?.includes(':') ? filter.slice(filter.indexOf(':') + 1) : null);
// a mix given as 'experiment_glassmaker:0.7,experiment_lost-hearing:0.3' ({ voice: weight }), or null
const mixOf = voice => MADE[voice]?.mix
  ?? (/[:,]/.test(voice) ? Object.fromEntries(voice.split(',').map(p => [p.split(':')[0], Number(p.split(':')[1] ?? 1)])) : null);

// a voice's reference: its recording and its words ({ audio, text, hash }), or a problem (a made
// voice's are the recording it is made from: its `prepare` is in the clip's spec)
const refs = new Map();
export function referenceOf(voice) {
  const mix = mixOf(voice);
  if (mix && !refs.has(voice)) {
    // a mix: its voices' recordings, with their weights (to 1)
    const parts = Object.entries(mix).map(([v, w]) => [referenceOf(v), w]), total = parts.reduce((s, [, w]) => s + w, 0);
    const bad = parts.find(([r]) => r.problem);
    refs.set(voice, bad ? bad[0] : {
      mix: parts.map(([r, w]) => [r.audio, w / total]), text: parts[0][0].text,
      hash: createHash('sha256').update(JSON.stringify(parts.map(([r, w]) => [r.hash, w / total]))).digest('hex').slice(0, 16),
    });
  }
  if (!refs.has(voice)) {
    const file = MADE[voice]?.from ?? voice;
    const audio = join(VOICE_DIR, `${file}.flac`), words = join(VOICE_DIR, `${file}.txt`);
    if (!existsSync(audio) || !existsSync(words)) refs.set(voice, { problem: `voice '${voice}': no ${relative(ROOT, audio)} and ${relative(ROOT, words)} (docs/narration.md, "The voice")` });
    else {
      const text = readFileSync(words, 'utf8').trim();
      refs.set(voice, { audio, text, hash: createHash('sha256').update(readFileSync(audio)).update(text).digest('hex').slice(0, 16) });
    }
  }
  return refs.get(voice);
}
export const clipFile = (lang, key) => `${lang}/${key}.opus`;

// the lines to voice: the narrator's, and the films' (core/film.js filmLines: in a film's own
// voice, `voice`)
export const ALL_LINES = [...LINES, ...Object.values(FILMS).flatMap(filmLines)];

// Every clip the table asks for, said in its language: { lang, key, id, form, text, spec, hash },
// the table's problems (a bad id, a parameter no form gives, a line not translated), and the
// voices' (`unvoiced`: a reference recording missing; its clips cannot be rendered or checked).
// A line with a `voice` is said in that voice (tools/voices/), not the language's.
export async function clipsOf(lines = ALL_LINES) {
  const clips = [], problems = [], unvoiced = [], keys = new Set();
  for (const line of lines) {
    if (!ID.test(line.id ?? '')) problems.push(`${line.id}: an id is lowercase words joined by '-' or '.'`);
    if (!line.note) problems.push(`${line.id}: no note`);
    for (const t of unknownTags(line.text)) problems.push(`${line.id}: no tag [${t}] (tools/narration.mjs TAGS)`);
    if (line.instruct != null && typeof line.instruct !== 'string') problems.push(`${line.id}: an instruct is a sentence`);
    const forms = line.forms ? Object.entries(line.forms) : [[null, {}]];
    const wanted = [...paramsOf(line.text)];
    for (const [form, params] of forms) {
      if (form != null && !FORM.test(form)) problems.push(`${line.id}: form '${form}' is not one lowercase word`);
      const lacking = wanted.filter(p => !(p in params));
      if (lacking.length) problems.push(`${line.id}${form ? `.${form}` : ''}: no value for {${lacking.join('}, {')}} (a recorded line says no names: give it forms)`);
    }
  }
  for (const [lang, settings] of Object.entries(VOICES)) {
    const messages = lang === SOURCE ? null : (await loadLocale(lang))?.messages;
    await setLanguage(lang);
    try {
      for (const line of lines) {
        const voice = settingsOf(line.voice ? { ...settings, voice: line.voice } : settings), ref = referenceOf(voice.voice);
        if (ref.problem && !unvoiced.includes(ref.problem)) unvoiced.push(ref.problem);
        if (messages && messages[line.text] == null) { problems.push(`${line.id}: not translated into '${lang}'`); continue; }
        for (const [form, params] of line.forms ? Object.entries(line.forms) : [[null, undefined]]) {
          const key = form ? `${line.id}.${form}` : line.id;
          if (keys.has(`${lang}/${key}`)) { problems.push(`${key}: two lines make this clip`); continue; }
          keys.add(`${lang}/${key}`);
          const tagged = tr(line.text, params), text = untagged(tagged);
          for (const t of lang === SOURCE ? [] : unknownTags(tagged)) problems.push(`${key}: no tag [${t}] in '${lang}' (tools/narration.mjs TAGS)`);
          const spec = specOf(voice, ref, seedOf(line, lang, form), text, sentencesOf(tagged, line.instruct ?? voice.instruct));
          clips.push({ lang, key, id: line.id, form, text, source: tagged, spec, hash: hashOf(spec) });
        }
      }
    } finally { await setLanguage(SOURCE); }
  }
  return { clips, problems, unvoiced };
}

export function readManifest(assets = ASSETS) {
  const file = resolve(assets, 'narration/manifest.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { clips: {} };
}

// whether a clip as the manifest has it (`had`) says the clip's text, with its tags, in its take
// (an entry from before `source` was kept: its text without them)
const saysSo = (had, c) => (had.source != null ? had.source === c.source : had.text === c.text) && (had.seed ?? 0) === c.spec.seed;

// What is to do: the clips missing (no file, or not in the manifest), changed (their text or seed
// is another) and gone (in the manifest or on disk, but no longer in the table); and the ones
// `stale`, made with other settings (a voice, a filter, an instruction, PIPELINE): those are only
// rendered again when asked (--stale).
export async function plan(assets = ASSETS, lines = ALL_LINES) {
  const { clips, problems, unvoiced } = await clipsOf(lines);
  const manifest = readManifest(assets);
  const missing = [], changed = [], stale = [];
  for (const c of clips) {
    const had = manifest.clips?.[c.lang]?.[c.key];
    if (!had || !existsSync(resolve(assets, 'narration', clipFile(c.lang, c.key)))) missing.push(c);
    else if (!saysSo(had, c)) changed.push(c);
    else if (had.hash !== c.hash) stale.push(c);
  }
  const wanted = new Set(clips.map(c => clipFile(c.lang, c.key)));
  const gone = new Set();
  for (const [lang, entries] of Object.entries(manifest.clips ?? {}))
    for (const key of Object.keys(entries)) if (!wanted.has(clipFile(lang, key))) gone.add(clipFile(lang, key));
  const dir = resolve(assets, 'narration');
  if (existsSync(dir)) for (const lang of readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name))
    for (const f of readdirSync(join(dir, lang)).filter(f => /\.(opus|mp3)$/.test(f))) if (!wanted.has(`${lang}/${f}`)) gone.add(`${lang}/${f}`);
  return { clips, problems, unvoiced, missing, changed, stale, gone: [...gone].sort(), manifest };
}

// whether ffmpeg is here and encodes Opus (tools/narration.py does it with ffmpeg)
const hasOpus = () => {
  try { return /\blibopus\b/.test(execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); }
  catch { return false; }
};

// renders jobs ({ spec, out }) with tools/narration.py; returns { [out]: seconds }
function render(jobs) {
  if (!jobs.length) return {};
  if (!hasOpus()) { console.error('problem: the clips are encoded by ffmpeg with libopus, and there is none here'); process.exit(1); }
  const tmp = mkdtempSync(join(tmpdir(), 'narration-'));
  try {
    const input = join(tmp, 'jobs.json'), output = join(tmp, 'results.json');
    writeFileSync(input, JSON.stringify({ jobs: jobs.map(j => {
      const ref = referenceOf(j.spec.voice), target = targetOf(j.spec.filter);
      return {
        ...j.spec, ref_audio: ref.audio ?? null, ref_mix: ref.mix ?? null, ref_text: ref.text,
        ...(j.spec.speaks ? { sentences: j.spec.said } : {}),
        filter_audio: target ? referenceOf(target).audio : null, out: j.out,
      };
    }) }));
    for (const j of jobs) mkdirSync(dirname(j.out), { recursive: true });
    execFileSync('uv', ['run', '--quiet', resolve(ROOT, 'tools/narration.py'), input, output], { cwd: ROOT, stdio: 'inherit' });
    return Object.fromEntries(JSON.parse(readFileSync(output, 'utf8')).map(r => [r.out, r.dur]));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// the manifest: a clip rendered now as it was made, every other one as it was (what it says, its
// seed and settings: a clip not rendered again keeps them, so it stays changed or stale); a clip
// never rendered (--lang or --only left it out) is not in it
function writeManifest(clips, durations, old, assets) {
  const out = { clips: {} };
  for (const c of clips) {
    const dur = durations[c.lang + '/' + c.key], had = old.clips?.[c.lang]?.[c.key];
    const entry = dur != null ? { text: c.text, source: c.source, seed: c.spec.seed, dur, hash: c.hash }
      : had && had.source == null && saysSo(had, c) ? { ...had, source: c.source } : had;   // (an older entry learns its source)
    if (entry) (out.clips[c.lang] ??= {})[c.key] = entry;
  }
  writeFileSync(resolve(assets, 'narration/manifest.json'), JSON.stringify(out, null, 2) + '\n');
}

// --say: a text said in a voice, to hear what a voice or a line sounds like
function preview(opt) {
  const lang = opt.langs?.[0] ?? SOURCE, base = VOICES[lang];
  const voice = opt.voice ?? base.voice, ref = referenceOf(voice);
  if (ref.problem) { console.error(`problem: ${ref.problem}`); process.exit(1); }
  if (!untagged(opt.say)) { console.error('--say wants something to say'); process.exit(2); }
  const settings = settingsOf({ ...base, voice, filter: opt.filter === undefined ? (opt.voice ? undefined : base.filter) : opt.filter });
  const filter = settings.filter;
  if (opt.instruct && !settings.speaks) console.error('(--instruct: this voice does not speak with instructions; left out)');
  const spec = specOf(settings, ref, opt.seed, untagged(opt.say), sentencesOf(opt.say, opt.instruct ?? settings.instruct));
  const said = opt.instruct ? `.${opt.instruct.toLowerCase().match(/[a-z]+/g).slice(0, 4).join('-')}` : '';
  const name = `${voice}${filter ? `.${filter}` : ''}${said}`.replace(/[:,]/g, '-');
  if (targetOf(filter) && referenceOf(targetOf(filter)).problem) { console.error(`problem: ${referenceOf(targetOf(filter)).problem}`); process.exit(1); }
  const out = opt.bake ? join(VOICE_DIR, `${opt.bake}.flac`) : join(TAKES, 'say', `${name}.${lang}.seed${opt.seed}.opus`);
  render([{ spec, out }]);
  if (opt.bake) writeFileSync(join(VOICE_DIR, `${opt.bake}.txt`), untagged(opt.say) + '\n');
  console.log(out);
}

async function main(argv) {
  const opt = { langs: null, only: null, force: false, stale: false, check: false, dry: false, takes: 0, firstSeed: 0, say: null, voice: null, filter: undefined, seed: 0, bake: null, instruct: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') opt.langs = argv[++i].split(',');
    else if (a === '--only') opt.only = argv[++i].split(',');
    else if (a === '--force') opt.force = true;
    else if (a === '--stale') opt.stale = true;
    else if (a === '--check') opt.check = true;
    else if (a === '--dry-run') opt.dry = true;
    else if (a === '--takes') opt.takes = Number(argv[++i]);
    else if (a === '--first-seed') opt.firstSeed = Number(argv[++i]);
    else if (a === '--say') opt.say = argv[++i];
    else if (a === '--bake') opt.bake = argv[++i];
    else if (a === '--instruct') opt.instruct = argv[++i];
    else if (a === '--voice') opt.voice = argv[++i];
    else if (a === '--filter') opt.filter = argv[++i] === 'none' ? null : argv[i];
    else if (a === '--seed') opt.seed = Number(argv[++i]);
    else if (a === '--workers') process.env.NARRATION_WORKERS = String(Number(argv[++i]) || 1);   // (read by tools/narration.py)
    else { console.error(`unknown argument ${a} (see the top of tools/narration.mjs)`); process.exit(2); }
  }
  for (const l of opt.langs ?? []) if (!VOICES[l]) { console.error(`no voice for '${l}' (VOICES: ${Object.keys(VOICES).join(', ')})`); process.exit(2); }
  if (opt.bake) {
    // a new voice from a voice: what it says is the (first) voice's own words, unless --say
    if (!ID.test(opt.bake) || !opt.voice) { console.error('--bake <name> (lowercase words joined by -) wants a --voice'); process.exit(2); }
    const first = referenceOf(opt.voice.split(',')[0].split(':')[0]);
    if (first.problem) { console.error(`problem: ${first.problem}`); process.exit(1); }
    opt.say ??= first.text;
    opt.filter ??= null;
  }
  if (opt.say != null) { preview(opt); return; }
  const assets = ASSETS;
  const p = await plan(assets);
  for (const x of [...p.problems, ...p.unvoiced]) console.error(`problem: ${x}`);
  const chosen = c => (!opt.langs || opt.langs.includes(c.lang)) && (!opt.only || opt.only.some(o => c.id.startsWith(o)));

  if (opt.check) {
    for (const c of p.missing) console.log(`missing  ${c.lang}/${c.key}`);
    for (const c of p.changed) console.log(`changed  ${c.lang}/${c.key}`);
    for (const f of p.gone) console.log(`gone     ${f}`);
    const bad = p.problems.length + p.unvoiced.length + p.missing.length + p.changed.length + p.gone.length;
    console.log(bad ? 'Run node tools/narration.mjs to bring the narration up to date.' : `All ${p.clips.length} clips are up to date.`);
    if (p.stale.length) console.log(`(${p.stale.length} made with other settings: a voice, a filter, an instruction or PIPELINE; rendered again only with --stale)`);
    process.exit(bad ? 1 : 0);
  }
  if (p.problems.length || p.unvoiced.length) process.exit(1);

  if (opt.takes > 0) {
    const pick = p.clips.filter(chosen);
    if (!opt.only) { console.error('--takes wants --only <id>: it renders every take of every chosen clip'); process.exit(2); }
    const jobs = pick.flatMap(c => Array.from({ length: opt.takes }, (_, n) => {
      const seed = opt.firstSeed + n;
      return { spec: { ...c.spec, seed }, out: join(TAKES, c.lang, `${c.key}.seed${seed}.opus`) };
    }));
    if (opt.dry) { for (const j of jobs) console.log(j.out); return; }
    render(jobs);
    for (const j of jobs) console.log(j.out);
    console.log(`Listen, then pin the best take as the line's seed in src/core/narration.js (seed: n, { ${pick[0]?.lang}: n } or { '${pick[0]?.lang}.<form>': n }).`);
    return;
  }

  const todo = [...p.missing, ...p.changed, ...(opt.stale ? p.stale : []), ...(opt.force ? p.clips.filter(c => !p.missing.includes(c) && !p.changed.includes(c) && !(opt.stale && p.stale.includes(c))) : [])].filter(chosen);
  const dropping = opt.langs || opt.only ? [] : p.gone;
  if (opt.dry) {
    for (const c of todo) console.log(`render  ${c.lang}/${c.key}: ${c.text}`);
    for (const f of dropping) console.log(`drop    ${f}`);
    if (!todo.length && !dropping.length) console.log('Nothing to do.');
    if (p.stale.length && !opt.stale) console.log(`(${p.stale.length} made with other settings left as they are: --stale renders them again)`);
    return;
  }
  const durations = {};
  const results = render(todo.map(c => ({ spec: c.spec, out: resolve(assets, 'narration', clipFile(c.lang, c.key)) })));
  for (const c of todo) durations[c.lang + '/' + c.key] = results[resolve(assets, 'narration', clipFile(c.lang, c.key))];
  for (const f of dropping) rmSync(resolve(assets, 'narration', f), { force: true });
  mkdirSync(resolve(assets, 'narration'), { recursive: true });
  writeManifest(p.clips, durations, p.manifest, assets);
  console.log(`Rendered ${todo.length} clip${todo.length === 1 ? '' : 's'}${dropping.length ? `, dropped ${dropping.length}` : ''} (${relative(ROOT, resolve(assets, 'narration'))}/).`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main(process.argv.slice(2));

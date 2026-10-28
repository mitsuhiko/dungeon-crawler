# /// script
# requires-python = ">=3.12,<3.14"
# dependencies = [
#     "qwen-tts==0.1.1",
#     "scipy>=1.11",
#     "librosa>=0.10",
#     "praat-parselmouth>=0.4",
# ]
# ///
"""What the kids' guide plays and shows of the voices (learn/sound.html: how they are made), into
learn/audio/: a piece of each voice's sample (tools/voices/<voice>.flac, what Base takes the voice
from), and lines said in it, with what the models made on the way, for the guide to show
(learn/audio/samples.json). The samples are not recordings of anyone: both voices are mixes, baked
(docs/narration.md, "Made voices"), so their samples were said by the model too, in the mixed
voice; the recordings of people they were mixed from are not in Git, and not in the guide.

What samples.json keeps:

- each voice's fingerprint (its speaker embedding: Base's 2048 numbers);
- for each line said: its words as the text tokenizer cuts them, the speech tokens the Talker and
  the code predictor wrote (16 a step, 12.5 steps a second) and where each sentence's steps lie in
  the clip, and how alike Base finds the clip to each voice (cosine of the fingerprints).

Said as tools/narration.py says the game's lines (the same models, revisions, sampling, sentence
by sentence, trimmed, levelled, the pauses, the filters), only a little finer (Opus at 24 kbit/s,
so the guide can compare a voice's sample and a line said in it), and not the clips themselves:
the game's are not in Git, these are. Run it again when the voices or the way lines are said change:

    uv run tools/learn-voices.py

Needs what tools/narration.mjs needs (docs/narration.md, "Running it"): the models (both, about
9 GB) and ffmpeg with libopus. Each sample is seeded, so a run makes the same files on the same
machine.
"""

import importlib.util
import json
import os
import subprocess
import sys
import zlib

import numpy as np
import soundfile
import torch

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "learn", "audio")
VOICES = os.path.join(ROOT, "tools", "voices")

spec = importlib.util.spec_from_file_location("narration", os.path.join(ROOT, "tools", "narration.py"))
narration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(narration)

BASE = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
SPEAKER = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
TEMPERATURE = 0.7  # as VOICES in tools/narration.mjs
LANGUAGE = {"en": "English", "de": "German"}
FRAME = 1920 / 24000  # seconds of sound a step of speech tokens makes

# a piece of each voice's sample (from its start, in seconds) and what is said in it
PIECES = {
    "glassmaker": (7.1, "Welcome, little one. Come in, come in. This is my town, and these are my memories, kept in glass."),
    "child": (9.95, "A long time ago, a big rock was falling from the sky. So the old glassman made magic glass."),
}

# the lines (the game's: src/core/narration.js, src/i18n/de/story.js), and how they are said
GLASS = {"en": "So my glass found someone. Good.", "de": "Mein Glas hat also jemanden gefunden. Gut."}
WOKE = {"en": "Oh! You woke me up! I have been lying here for a long, long time.",
        "de": "Oh! Du hast mich aufgeweckt! Ich liege hier schon ganz, ganz lange."}
GLASS_SAYS = "Speak low and calm, quietly glad, like an old man in the dark."   # the line's instruct
WOKE_SAYS = "Speak brightly and quickly, surprised and glad, like an eager child just woken."
SAD = "Speak in a sad, sorrowful tone, voice low and heavy, on the verge of tears."   # TAGS in tools/narration.mjs
WHISPER = "Whisper softly and quietly, as if telling a secret."
EXCITED = "Speak excitedly, quick and full of energy."

# id: (voice: a name or {name: weight}, words, instruction, seed (or by language), filter, keep its
# speech tokens)
SAMPLES = {
    "glass": ("glassmaker", GLASS, GLASS_SAYS, 0, None, True),
    "glass-seed1": ("glassmaker", GLASS, GLASS_SAYS, 1, None, True),
    "glass-seed2": ("glassmaker", GLASS, GLASS_SAYS, 2, None, True),
    "glass-plain": ("glassmaker", GLASS, None, 0, None, False),
    "glass-sad": ("glassmaker", GLASS, SAD, 0, None, False),
    "glass-whisper": ("glassmaker", GLASS, WHISPER, 0, None, False),
    "glass-excited": ("glassmaker", GLASS, EXCITED, {"en": 0, "de": 2}, None, False),   # (de 0: "Gut" lost, 1: "Good")
    "mix25": ({"glassmaker": 0.75, "child": 0.25}, GLASS, None, {"en": 0, "de": 2}, None, False),   # (de 0: "Okay.", 1: "Gott!")
    "mix50": ({"glassmaker": 0.5, "child": 0.5}, GLASS, None, {"en": 0, "de": 1}, None, False),   # (de 0: "Jod.")
    "mix75": ({"glassmaker": 0.25, "child": 0.75}, GLASS, None, 0, None, False),
    "mix100": ("child", GLASS, None, 0, None, False),
    "woke": ("child", WOKE, WOKE_SAYS, 0, None, True),
    "woke-robot": ("child", WOKE, WOKE_SAYS, 0, "stepped-vocoder", False),
}


def encode(audio, rate, path):
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(rate), "-ac", "1", "-i", "pipe:0",
           "-c:a", "libopus", "-b:a", "24k", "-vbr", "on", "-application", "audio", "-f", "ogg", path]
    subprocess.run(cmd, input=pcm, check=True)


def fingerprint_of(base, audio, rate):
    return base.model.extract_speaker_embedding(audio.astype(np.float32), rate).float().cpu()


def mixed(prints, weights):
    """As tools/narration.py mixed_prompt: the weighted average, as long as the weighted lengths."""
    total = sum(weights.values())
    vectors = [(prints[v], w / total) for v, w in weights.items()]
    m = sum(w * v for v, w in vectors)
    return m / m.norm() * sum(w * v.norm() for v, w in vectors)


def cosine(a, b):
    return float(torch.nn.functional.cosine_similarity(a.flatten(), b.flatten(), dim=0))


def say(model, xvec, text, language, instruct, seed):
    """As tools/narration.py say, keeping what it made on the way: the clip before its finish,
    and for each sentence its speech tokens and where in that clip its first step starts."""
    kwargs = {"temperature": TEMPERATURE, "subtalker_temperature": TEMPERATURE}
    narration.seed(seed)
    parts, sentences, at, rate = [], [], 0, 24000
    said = narration.sentences(text)
    for n, sentence in enumerate(said):
        ids = model._tokenize_texts([model._build_assistant_text(sentence)])
        told = [model._tokenize_texts([model._build_instruct_text(instruct)])[0] if instruct else None]
        voice = {"ref_code": [None], "ref_spk_embedding": [xvec], "x_vector_only_mode": [True], "icl_mode": [False]}
        limit = int(narration.max_seconds(sentence) * narration.CODEC_HZ)
        codes, _ = model.model.generate(
            input_ids=ids, instruct_ids=told, voice_clone_prompt=voice, languages=[language],
            non_streaming_mode=True, **model._merge_generate_kwargs(max_new_tokens=limit, **kwargs),
        )
        wavs, rate = model.model.speech_tokenizer.decode([{"audio_codes": codes[0]}])
        wav = np.asarray(wavs[0]).astype(np.float64)
        loud, _, win = narration.spoken(wav, rate)
        cut = loud[0] * win   # (what trim cuts off before the voice)
        voiced = narration.level(narration.trim(wav, rate), rate)
        tokenizer = model.processor.tokenizer
        pieces = [tokenizer.decode([i]) for i in tokenizer(sentence)["input_ids"]]
        sentences.append({"text": sentence, "tokens": pieces, "start": (at - cut) / rate,
                          "codes": codes[0].cpu().numpy().astype(int).tolist()})
        parts.append(voiced)
        at += len(voiced)
        if n < len(said) - 1:
            gap = np.zeros(int(narration.pause_after(sentence) * rate))
            parts.append(gap)
            at += len(gap)
    return np.concatenate(parts), rate, sentences


def main():
    narration.quiet_setup()
    os.makedirs(OUT, exist_ok=True)
    data = {"frame": FRAME, "codebooks": 16, "voices": {}, "samples": {}}

    base = narration.load(BASE)
    prints = {}
    for voice, (seconds, words) in PIECES.items():
        audio, rate = soundfile.read(os.path.join(VOICES, f"{voice}.flac"), dtype="float64", always_2d=False)
        prints[voice] = base.create_voice_clone_prompt(ref_audio=os.path.join(VOICES, f"{voice}.flac"),
                                                       x_vector_only_mode=True)[0].ref_spk_embedding.float().cpu()
        piece = narration.finish(audio[: int(seconds * rate)], rate)   # (as loud as the clips)
        encode(piece, rate, os.path.join(OUT, f"{voice}-sample.opus"))
        data["voices"][voice] = {"sample": f"{voice}-sample.opus", "words": words, "seconds": seconds,
                                 "fingerprint": [round(float(x), 4) for x in prints[voice].flatten()]}
        print(f"learn-voices: {voice}: its fingerprint, and {seconds}s of its sample", file=sys.stderr)

    speaker = narration.load(SPEAKER)
    made = {}
    for name, (voice, words, instruct, seeds, filter, keep) in SAMPLES.items():
        weights = voice if isinstance(voice, dict) else {voice: 1.0}
        xvec = mixed(prints, weights)   # (as tools/narration.py render hands it over: float32)
        for lang, text in words.items():
            seed = seeds[lang] if isinstance(seeds, dict) else seeds
            audio, rate, sentences = say(speaker, xvec, text, LANGUAGE[lang], instruct, seed)
            noise = zlib.crc32(f"{seed}:{text}".encode())
            lead = narration.LEAD_IN if filter is None else narration.FILTERS[filter]["pad"][0]
            audio = narration.finish(audio, rate, filter, noise)
            file = f"{name}.{lang}.opus"
            encode(audio, rate, os.path.join(OUT, file))
            heard = fingerprint_of(base, audio, rate)
            entry = {"voice": weights, "lang": lang, "text": text, "instruct": instruct, "seed": seed,
                     "filter": filter, "file": file, "seconds": round(len(audio) / rate, 2),
                     "like": {v: round(cosine(heard, p), 3) for v, p in prints.items()}}
            if keep:
                entry["sentences"] = [{**s, "start": round(s["start"] + lead, 4)} for s in sentences]
            made[f"{name}.{lang}"] = entry
            print(f"learn-voices: {file} {entry['seconds']}s, like {entry['like']}", file=sys.stderr)
    data["samples"] = made
    with open(os.path.join(OUT, "samples.json"), "w") as f:
        json.dump(data, f, separators=(",", ":"))
        f.write("\n")


if __name__ == "__main__":
    with torch.inference_mode():
        main()

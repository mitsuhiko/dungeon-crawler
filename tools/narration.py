# /// script
# requires-python = ">=3.12,<3.14"
# dependencies = [
#     "qwen-tts==0.1.1",
#     "scipy>=1.11",
#     "librosa>=0.10",
#     "praat-parselmouth>=0.4",
# ]
# ///
"""Renders the narrator's clips with Qwen3-TTS, in a voice cloned from a reference recording
(docs/narration.md).

Run by tools/narration.mjs, which decides what to render; not meant to be run by hand:

    uv run tools/narration.py jobs.json results.json
    uv run tools/narration.py --setup     (npm run setup: the environment, and the models downloaded)

Its packages are locked in tools/narration.py.lock (`uv lock --script tools/narration.py` after
changing the dependencies above): the same torch and transformers say the same takes.

jobs.json is {"jobs": [{"model", "language", "voice", "clone", "ref_audio", "ref_text",
"temperature", "seed", "prepare"?, "filter"?, "text", "out"}, ...]}: each job is said by the Qwen3-TTS base model `model`
(a Hugging Face id) in `language` ("English", "German" ...), in the voice of the recording
`ref_audio` (first put through `prepare` if it has one: PREPARE), cloned as `clone` says:

- "embedding": from the voice's speaker embedding only. The voice, read in the model's own manner:
  it pauses and ends its sentences like a reader.
- "context": in context: the model hears the recording and its words `ref_text`, and goes on from
  there, so it takes the recording's manner too (its pace, its pauses, its tunes).

The line is said sentence by sentence, each on its own, so each ends like a sentence that ends,
and put together with a pause after each (PAUSE, by how it ends). The sampling is seeded by
`seed` (the same job on the same machine gives the same audio); `temperature` (none: the model's
own) is the sampling's, for the words and the sound. Then the clip is trimmed, goes through the
`filter` if it has one (FILTERS: "old-radio", the voice through an old radio with static on top;
"robot", the voice gone a little machine; "full", fuller and warmer; "metal-monotone", a machine's
voice, mostly monotone and in a metal can; "stepped-vocoder", the robot's voice; their noise seeded by the seed and the text, so it is
the same every time), levelled and written as mono Ogg Opus to `out` (by ffmpeg's libopus). results.json gets
[{"out", "dur"}, ...], the clips' lengths in seconds.

A job with `speaks` (a CustomVoice model) is said by that model instead, in the voice's speaker
embedding (taken with the base model `model`, before the jobs are handed out, and kept in a
cache), following instructions: `sentences` is the line in sentences, each with the
instruction it is said with ([[instruction or null, sentence], ...], tools/narration.mjs turns the
line's performance tags into them). CustomVoice takes a speaker embedding where its own speakers
go: the base model and it share almost all their weights (docs/narration.md, "Instructions").
Without `speaks` the text is said as it is, its tags taken out (tools/narration.mjs): the base
model cannot clone a voice and take directions at once.

The models come from the Hugging Face cache, at the revision pinned in REVISIONS (downloaded the
first time, about 4.5 GB, no account needed; after that the hub is not asked). Runs on CUDA,
Apple's GPU (MPS) or, slowly, the CPU; NARRATION_DEVICE overrides the pick. Several processes
say the jobs at once (NARRATION_WORKERS, `workers`), each job seeded on its own.
"""

import contextlib
import json
import logging
import zlib
import os
import re
import subprocess
import sys
import time
import warnings

import numpy as np
import torch

# keep in step with PIPELINE in tools/narration.mjs: after a change here, --stale renders the
# clips made before again
BITRATE = 10  # kbit/s, mono Opus, from the model's 24 kHz
LEAD_IN = 0.05  # seconds of quiet kept before the voice
TAIL = 0.15  # and after it
TARGET_RMS_DB = -20.0  # loudness of the spoken part
PEAK_DB = -1.0  # never louder than this
SILENCE_DB = -40.0  # below this (from the peak) counts as quiet, for the trims
CODEC_HZ = 12  # the model's speech tokens a second
# the pause after a sentence, by how it ends, in seconds ("..." trails off)
# learn: sound.html#line-to-file (see learn/README.md)
PAUSE = {".": 0.55, "!": 0.5, "?": 0.6, "...": 0.8, ",": 0.2}
# where a sentence ends: after . ! ? or … (a closing quote may follow), before the next word
SENTENCE_END = re.compile(r"(?:(?<=[.!?…])|(?<=[.!?…][\"'»«“”‘’]))\s+(?=\S)")
CLOSING = "\"'»«“”‘’"


def max_seconds(text):
    """How long a sentence of `text` can take: longer, and the take ran away (it stops there)."""
    return 4 + 0.25 * len(text)


def sentences(text):
    return [s for s in SENTENCE_END.split(text.strip()) if s]


def pause_after(sentence):
    s = sentence.rstrip(CLOSING)
    if s.endswith("...") or s.endswith("…"):
        return PAUSE["..."]
    if s[-1:] not in ".!?":   # (a sentence cut by a tag: a breath, not a stop)
        return PAUSE[","]
    return PAUSE[s[-1:]]


def db(x):
    return 10 ** (x / 20)


def spoken(audio, rate):
    """The 10 ms windows that are speech: (first, last) window, of `rate // 100` samples."""
    win = rate // 100
    frames = audio[: len(audio) // win * win].reshape(-1, win)
    rms = np.sqrt((frames**2).mean(axis=1))
    loud = np.nonzero(rms > np.abs(audio).max() * db(SILENCE_DB))[0]
    return loud, frames, win


def trim(audio, rate):
    """The voice of one sentence, the quiet at its ends cut off."""
    audio = audio.astype(np.float64)
    if np.abs(audio).max() <= 0:
        raise ValueError("the model returned silence")
    loud, _, win = spoken(audio, rate)
    return audio[loud[0] * win : (loud[-1] + 1) * win]


def level(audio, rate):
    """A sentence at the loudness every sentence is said at (its speech at TARGET_RMS_DB): an
    instruction (a whisper, a shout, a sad tone) changes how loud the model speaks, and a line's
    sentences, said with different ones, would jump in loudness."""
    loud, frames, _ = spoken(audio, rate)
    return audio * db(TARGET_RMS_DB) / np.sqrt((frames[loud] ** 2).mean())


def finish(audio, rate, filter=None, noise=0, target=None):
    """Levels the clip: the spoken part at TARGET_RMS_DB, peaks at most PEAK_DB; a little quiet
    before and after. With a `filter` (FILTERS) the voice goes through it first, and the quiet
    before and after is the filter's (its static); `noise` seeds the filter's randomness."""
    loud, _, win = spoken(audio, rate)
    name = None if filter is None else filter.split(":")[0]
    lead, tail = (LEAD_IN, TAIL) if name is None else FILTERS[name]["pad"]
    pad = lambda s: np.zeros(int(s * rate))
    audio = np.concatenate([pad(lead), audio, pad(tail)])
    loud = loud + len(pad(lead)) // win   # (the windows of speech, after the padding)
    if filter is not None:
        extra = {} if target is None else {"target": target}
        audio = FILTERS[name]["apply"](audio / np.abs(audio).max(), rate, np.random.default_rng(noise), **extra)
    frames = audio[: len(audio) // win * win].reshape(-1, win)
    level = np.sqrt((frames[loud] ** 2).mean())
    gain = min(db(TARGET_RMS_DB) / level, db(PEAK_DB) / np.abs(audio).max())
    return (audio * gain).astype(np.float32)


def old_radio(voice, rate, rng):
    """The voice as if heard through an old valve radio, with static on top: a narrow, honky
    band, an amplifier driven into soft clipping, a signal that drifts a little, and hiss and
    crackle all the way through (also in the pauses, and a moment before and after)."""
    from scipy import signal

    n = len(voice)
    t = np.arange(n) / rate
    sos = lambda order, band, kind="bandpass": signal.butter(order, band, btype=kind, fs=rate, output="sos")
    slow = lambda hz: signal.sosfiltfilt(sos(2, hz, "lowpass"), rng.standard_normal(n))
    # the small speaker: no lows, no highs, a hump where it rings
    x = signal.sosfilt(sos(4, [380, 3000]), voice)
    b, a = signal.iirpeak(1300, 1.4, fs=rate)
    x = x + 0.8 * signal.lfilter(b, a, x)
    # the valves: driven into soft clipping, and a little rattle of the odd harmonics with it
    drive = 4.0
    x = np.tanh(drive * x / np.abs(x).max()) / np.tanh(drive)
    x = signal.sosfilt(sos(2, [300, 3800]), x)
    # the signal drifts: slow fading, never all the way
    drift = slow(0.6)
    x *= 1 + 0.18 * drift / np.abs(drift).max()
    rms = np.sqrt(np.mean(x[np.abs(x) > 0.05 * np.abs(x).max()] ** 2))
    # hiss: band-limited noise that breathes a little
    hiss = signal.sosfilt(sos(2, [700, 5500]), rng.standard_normal(n))
    breath = slow(2.0)
    hiss *= 1 + 0.4 * breath / np.abs(breath).max()
    hiss *= rms * db(-24) / np.sqrt(np.mean(hiss**2))
    # crackle: short clicks and pops at random, now and then a burst of them
    crackle = np.zeros(n)
    clicks = rng.poisson(9 * n / rate)
    for at in rng.integers(0, n, clicks):
        length = int(rate * rng.uniform(0.0005, 0.004))
        burst = rng.standard_normal(length) * np.exp(-np.linspace(0, 6, length))
        amp = rms * db(rng.uniform(-22, -4))
        crackle[at : at + length] += amp * burst[: n - at]
    crackle = signal.sosfilt(sos(2, [500, 7000]), crackle)
    # mains hum, barely
    hum = rms * db(-38) * (np.sin(2 * np.pi * 50 * t) + 0.5 * np.sin(2 * np.pi * 150 * t))
    static = hiss + crackle + hum
    # the static fades in and out at the ends, so the clip does not start on a click
    edge = int(0.08 * rate)
    ramp = np.ones(n)
    ramp[:edge] = np.linspace(0, 1, edge)
    ramp[-edge:] = np.linspace(1, 0, edge)
    return (x + static) * ramp


def robot(voice, rate, rng, fmax=500):
    """The voice gone a little machine, and still hers: half of it is the voice itself, two
    semitones down; the other half a vocoder that says her words (the shape of her spectrum,
    frame by frame) on a buzz that follows her own melody, but in steps, from semitone to
    semitone, as a machine would sing it (on hiss where she hisses: s, f, t). Then a faint metal
    ring and a slight warble."""
    import librosa
    from scipy import signal

    n = len(voice)
    t = np.arange(n) / rate
    size, hop, semitones = 1024, 256, -2
    stft = lambda x: signal.stft(x, rate, nperseg=size, noverlap=size - hop)[2]

    def envelope(spec, keep=45):
        # the spectrum's shape without the harmonics: its cepstrum cut short
        cep = np.fft.irfft(np.log(np.abs(spec) + 1e-9), n=size, axis=0)
        cep[keep : size - keep + 1] = 0
        return np.exp(np.fft.rfft(cep, axis=0).real)

    rms = lambda x: np.sqrt(np.mean(x**2))
    dry = librosa.effects.pitch_shift(voice, sr=rate, n_steps=semitones)
    # her melody, down two semitones, stepped to whole semitones (held through the unvoiced)
    f0 = librosa.pyin(voice, fmin=70, fmax=fmax, sr=rate, frame_length=2048, hop_length=hop)[0]
    heard = ~np.isnan(f0)
    f0 = np.interp(np.arange(len(f0)), np.nonzero(heard)[0], f0[heard]) if heard.any() else np.full(len(f0), 180.0)
    f0 = 440 * 2 ** (np.round(12 * np.log2(f0 * 2 ** (semitones / 12) / 440)) / 12)
    f = np.interp(np.arange(n), np.arange(len(f0)) * hop, f0)
    # the buzz: its harmonics up to near the top, in random phases (all in step, they click)
    phase = np.cumsum(2 * np.pi * f / rate)
    buzz = np.zeros(n)
    for k in range(1, int(rate / 2 / f.min()) + 1):
        buzz += np.where(k * f < rate / 2 - 500, np.sin(k * phase + rng.uniform(0, 2 * np.pi)), 0)
    v, b, h = stft(voice), stft(buzz), stft(rng.standard_normal(n))
    freqs = np.fft.rfftfreq(size, 1 / rate)
    power = np.abs(v) ** 2
    voiceless = power[freqs > 3500].sum(axis=0) / (power.sum(axis=0) + 1e-12)
    mix = np.clip((voiceless - 0.15) / 0.35, 0, 1)
    carrier = (1 - mix) * b / envelope(b) + 0.6 * mix * h / envelope(h)
    sung = signal.istft(envelope(v) * carrier, rate, nperseg=size, noverlap=size - hop)[1][:n]
    sung = np.pad(sung, (0, n - len(sung)))
    y = 0.5 * dry + 0.5 * sung * rms(dry) / max(rms(sung), 1e-12)
    # metal: a feedback comb, 4 ms (a faint ring at 250 Hz and up)
    delay = int(0.004 * rate)
    y = signal.lfilter([1.0], np.r_[1.0, np.zeros(delay - 1), -0.25], y)
    # a slight warble: ring modulation at 55 Hz, a tenth mixed in
    y *= 0.9 + 0.1 * np.sin(2 * np.pi * 55 * t)
    # the rare spike rounded off, so it does not set the level
    top = np.percentile(np.abs(y), 99.9)
    over = np.abs(y) > top
    y[over] = np.sign(y[over]) * (top + 0.25 * top * np.tanh((np.abs(y[over]) - top) / (0.25 * top)))
    return y


# what a recording can go through before the voice is taken from it (MADE `prepare` in
# tools/narration.mjs). None for now: the model takes a voice's traits from a recording (its
# pitch, its size), never its artefacts (docs/narration.md, "Made voices")
PREPARE = {}


def retune(voice, rate, keep, step=1.0, shift=0):
    """The voice's melody squeezed towards its middle, `keep` of its range left, pulled to
    whole semitones by `step` (1: snapped) and moved `shift` semitones, its timing and its sound
    kept (Praat's PSOLA)."""
    import parselmouth
    from parselmouth.praat import call

    sound = parselmouth.Sound(voice.astype(np.float64), sampling_frequency=rate)
    manip = call(sound, "To Manipulation", 0.01, 75, 600)
    tier = call(manip, "Extract pitch tier")
    points = [(call(tier, "Get time from index", i), call(tier, "Get value at index", i)) for i in range(1, call(tier, "Get number of points") + 1)]
    if not points:
        return voice
    st = np.array([12 * np.log2(f / 440) for _, f in points])
    st = np.median(st) + keep * (st - np.median(st))
    st += step * (np.round(st) - st) + shift
    new = call("Create PitchTier", "retuned", sound.xmin, sound.xmax)
    for (t, _), s in zip(points, st):
        call(new, "Add point", t, 440 * 2 ** (s / 12))
    call([manip, new], "Replace pitch tier")
    out = call(manip, "Get resynthesis (overlap-add)").values[0]
    return np.pad(out, (0, max(0, len(voice) - len(out))))[: len(voice)]


def metal_monotone(voice, rate, rng):
    """A machine's voice, still hers (FILTERS "metal-monotone"): mostly monotone (40% of her
    melody left, snapped to semitones), in a metal can (ring modulation at 50 Hz, 35% mixed in,
    and a ringing 1.6 ms comb, half mixed in). Nothing added under it: the pauses stay silent."""
    from scipy import signal

    y = retune(voice, rate, keep=0.4)
    t = np.arange(len(y)) / rate
    y = 0.65 * y + 0.35 * 1.4 * y * np.sin(2 * np.pi * 50 * t)
    delay, g = int(0.0016 * rate), 0.7
    return 0.5 * y + 0.5 * (1 - g) * signal.lfilter([1.0], np.r_[1.0, np.zeros(delay - 1), -g], y)

# learn: sound.html#line-to-file (see learn/README.md)
def stepped_vocoder(voice, rate, rng):
    """The robot's voice (FILTERS "stepped-vocoder"): a clockwork toy, and easy to understand.
    Its melody kept whole but snapped to semitones and a semitone up (retune, as if sung by a
    machine); a quarter of it through `robot` (its vocoder, and its own copy two semitones
    down); then a small toy speaker (350 Hz to 5 kHz, 3 dB of presence at 1.8 kHz) and a short
    metal ring (a 1 ms feedback comb, 35% mixed in). Nothing is added under it: the pauses
    stay silent."""
    from scipy import signal

    rms = lambda x: np.sqrt(np.mean(x**2))
    y = retune(voice, rate, keep=1.0, step=1.0, shift=1)
    y = 0.75 * y + 0.25 * robot(y, rate, rng, fmax=600)
    # the speaker
    y = signal.sosfilt(signal.butter(2, [350, 5000], btype="bandpass", fs=rate, output="sos"), y)
    b, a = biquad("bell", 1800, 3.0, 1.0, rate)
    y = signal.lfilter(b, a, y)
    # the ring
    delay, g = int(0.001 * rate), 0.5
    ring = (1 - g) * signal.lfilter([1.0], np.r_[1.0, np.zeros(delay - 1), -g], y)
    return 0.65 * y + 0.35 * ring * rms(y) / max(rms(ring), 1e-12)


def biquad(kind, hz, gain_db, q, rate):
    """An EQ band (RBJ's cookbook): 'low' (a low shelf, `q` its slope) or 'bell'; (b, a)."""
    a_ = 10 ** (gain_db / 40)
    w = 2 * np.pi * hz / rate
    cos, alpha = np.cos(w), np.sin(w) / (2 * q)
    if kind == "bell":
        b = [1 + alpha * a_, -2 * cos, 1 - alpha * a_]
        a = [1 + alpha / a_, -2 * cos, 1 - alpha / a_]
    else:
        s = 2 * np.sqrt(a_) * alpha
        b = [a_ * ((a_ + 1) - (a_ - 1) * cos + s), 2 * a_ * ((a_ - 1) - (a_ + 1) * cos), a_ * ((a_ + 1) - (a_ - 1) * cos - s)]
        a = [(a_ + 1) + (a_ - 1) * cos + s, -2 * ((a_ - 1) + (a_ + 1) * cos), (a_ + 1) + (a_ - 1) * cos - s]
    return np.array(b) / a[0], np.array(a) / a[0]


def full(voice, rate, rng):
    """The voice fuller, not boomier: warmth and body in the low mids rather than bass (a gentle
    shelf under 200 Hz, a broad lift around 300 Hz, a little less of the boxy 700 Hz), the faint
    low harmonics of a warm amplifier, and gentle compression so it sounds close and dense."""
    from scipy import signal

    y = voice
    for band in (("low", 200, 2.0, 0.7), ("bell", 300, 2.5, 0.8), ("bell", 700, -1.5, 1.2)):
        y = signal.lfilter(*biquad(*band, rate), y)
    # warmth: a touch of soft saturation, its odd harmonics blended in under the voice
    y = 0.85 * y + 0.15 * np.tanh(2.5 * y / np.abs(y).max()) * np.abs(y).max()
    # density: 2.5:1 above a threshold 10 dB under the loud parts, quick to grab, slow to let go
    win = rate // 200
    frames = y[: len(y) // win * win].reshape(-1, win)
    level = np.sqrt((frames**2).mean(axis=1)) + 1e-9
    smooth = np.empty_like(level)
    held = level[0]
    for i, l in enumerate(level):
        held += (l - held) * (0.6 if l > held else 0.04)
        smooth[i] = held
    threshold = np.percentile(level, 95) * db(-10)
    gain = np.minimum(1, (np.maximum(smooth, threshold) / threshold) ** (1 / 2.5 - 1))
    gain = np.interp(np.arange(len(y)), np.arange(len(gain)) * win + win / 2, gain)
    return y * gain


# third-octave bands, 63 Hz to 10 kHz: where tone() compares two voices
TONE_BANDS = 1000 * 2 ** (np.arange(-14, 11) / 3)
_tones = {}


def tone_of(audio, rate):
    """A voice's tone: how loud each third-octave band is in its speech (its quiet left out),
    in dB under the loudest band."""
    from scipy import signal

    win = rate // 100
    frames = audio[: len(audio) // win * win].reshape(-1, win)
    rms = np.sqrt((frames**2).mean(axis=1))
    speech = frames[rms > rms.max() * 0.03].ravel()
    freqs, power = signal.welch(speech, rate, nperseg=min(4096, len(speech)))
    bands = [power[(freqs >= c / 2 ** (1 / 6)) & (freqs < c * 2 ** (1 / 6))].mean() for c in TONE_BANDS]
    bands = 10 * np.log10(np.array(bands) + 1e-20)
    return bands - bands.max()


def tone(voice, rate, rng, target):
    """The voice given another's tone (FILTERS "tone:<voice>"): an EQ that makes its spectrum,
    third-octave band by band (smoothed over three), that of the recording `target`; at most
    15 dB up or down. What makes one voice thin and bright and another full and dark is mostly
    this: the microphone, the room, the processing, more than the speaker."""
    import librosa
    from scipy import signal

    if target not in _tones:
        want, at = librosa.load(target, sr=rate, mono=True)
        _tones[target] = tone_of(want.astype(np.float64), rate)
    gains = _tones[target] - tone_of(voice, rate)
    gains = np.convolve(np.pad(gains, 1, mode="edge"), np.ones(3) / 3, mode="valid")
    gains = np.clip(gains, -15, 15)
    freqs = np.r_[0, TONE_BANDS, rate / 2] / (rate / 2)
    eq = signal.firwin2(2049, freqs, 10 ** (np.r_[gains[0], gains, gains[-1]] / 20))
    return signal.fftconvolve(voice, eq, mode="same")


# the filters a voice can go through (VOICES `filter` in tools/narration.mjs): what they do to
# the levelled voice, and the seconds of padding they put before and after it. A filter with a
# target, "tone:<voice>", is given that voice's recording (`target`)
FILTERS = {
    "tone": {"apply": tone, "pad": (LEAD_IN, TAIL)},
    "old-radio": {"apply": old_radio, "pad": (0.3, 0.35)},
    "robot": {"apply": robot, "pad": (0.05, 0.2)},
    "full": {"apply": full, "pad": (LEAD_IN, TAIL)},
    "metal-monotone": {"apply": metal_monotone, "pad": (LEAD_IN, TAIL)},
    "stepped-vocoder": {"apply": stepped_vocoder, "pad": (0.05, 0.2)},
}


# how ffmpeg encodes a clip: bit-exact (no random Ogg stream serial, no ffmpeg version in the
# tags), so the same take is the same file again, whoever renders it (the clips are committed)
OPUS = ["-c:a", "libopus", "-b:a", f"{BITRATE}k", "-vbr", "on", "-application", "audio",
        "-fflags", "+bitexact", "-flags:a", "+bitexact", "-f", "ogg"]


def opus(audio, rate):
    """The clip as mono Ogg Opus, by ffmpeg's libopus."""
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
    cmd = ["ffmpeg", "-v", "error", "-f", "s16le", "-ar", str(rate), "-ac", "1", "-i", "pipe:0", *OPUS, "pipe:1"]
    done = subprocess.run(cmd, input=pcm, capture_output=True)
    if done.returncode:
        raise RuntimeError(f"ffmpeg: {done.stderr.decode(errors='replace').strip()}")
    return done.stdout


def device():
    if os.environ.get("NARRATION_DEVICE"):
        return os.environ["NARRATION_DEVICE"]
    if torch.cuda.is_available():
        return "cuda:0"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


# the models' revisions on Hugging Face, pinned: the same model every time (an update upstream
# would change the takes), and once downloaded it is loaded from the cache without asking the hub
REVISIONS = {
    "Qwen/Qwen3-TTS-12Hz-1.7B-Base": "fd4b254389122332181a7c3db7f27e918eec64e3",
    "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice": "0c0e3051f131929182e2c023b9537f8b1c68adfe",
}


def snapshot(name):
    """The model's files: a local directory, downloaded the first time only."""
    from huggingface_hub import snapshot_download
    from huggingface_hub.errors import LocalEntryNotFoundError

    if os.path.isdir(name):
        return name
    revision = REVISIONS.get(name)
    if revision is None:
        raise ValueError(f"no revision pinned for {name}: add it to REVISIONS in tools/narration.py")
    try:
        return snapshot_download(name, revision=revision, local_files_only=True)
    except LocalEntryNotFoundError:
        print(f"narration: downloading {name} (once)", file=sys.stderr, flush=True)
        return snapshot_download(name, revision=revision)


@contextlib.contextmanager
def hushed():
    """What is printed meanwhile dropped, by the process and what it runs (its file descriptors)."""
    sys.stdout.flush()
    sys.stderr.flush()
    saved, null = (os.dup(1), os.dup(2)), os.open(os.devnull, os.O_WRONLY)
    try:
        os.dup2(null, 1)
        os.dup2(null, 2)
        yield
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
        os.dup2(saved[0], 1)
        os.dup2(saved[1], 2)
        for fd in (*saved, null):
            os.close(fd)


def load(name):
    import transformers
    from transformers import AutoConfig, AutoModel, AutoProcessor

    # qwen_tts says on import that flash-attn and SoX are missing: both only for its 25 Hz
    # tokenizer, which the 12 Hz models do not use (and flash-attn is CUDA's only)
    with hushed():
        from qwen_tts import Qwen3TTSModel
        from qwen_tts.core.models import Qwen3TTSConfig, Qwen3TTSForConditionalGeneration, Qwen3TTSProcessor

    transformers.logging.set_verbosity_error()
    path = snapshot(name)
    dev = device()
    dtype = torch.float32 if dev == "cpu" else torch.bfloat16
    print(f"narration: loading {name} ({dev})", file=sys.stderr, flush=True)
    # Qwen3TTSModel.from_pretrained, from the local directory. Not that function itself: it asks
    # the processor for fix_mistral_regex, which from a directory would change the tokenizer
    # (transformers 4.57.3 takes any local model saved by 4.57.3 for a Mistral one), and from
    # the hub id asks the hub on every load
    AutoConfig.register("qwen3_tts", Qwen3TTSConfig)
    AutoModel.register(Qwen3TTSConfig, Qwen3TTSForConditionalGeneration)
    AutoProcessor.register(Qwen3TTSConfig, Qwen3TTSProcessor)
    model = AutoModel.from_pretrained(path, device_map=dev, dtype=dtype, attn_implementation="sdpa")
    processor = AutoProcessor.from_pretrained(path)
    return Qwen3TTSModel(model=model, processor=processor, generate_defaults=model.generate_config)


def seed(n):
    torch.manual_seed(n)
    if torch.backends.mps.is_available():
        torch.mps.manual_seed(n)


def clone_prompt(model, job):
    if job.get("ref_mix"):
        return mixed_prompt(model, job)
    ref = job["ref_audio"]
    if job.get("prepare"):
        import soundfile

        audio, rate = soundfile.read(ref, dtype="float64", always_2d=False)
        ref = (PREPARE[job["prepare"]](audio, rate).astype(np.float32), rate)
    if job["clone"] == "embedding":
        return model.create_voice_clone_prompt(ref_audio=ref, x_vector_only_mode=True)
    if job["clone"] == "context":
        return model.create_voice_clone_prompt(ref_audio=ref, ref_text=job["ref_text"])
    raise ValueError(f"clone is 'embedding' or 'context', not {job['clone']!r}")


# learn: sound.html#fingerprint (see learn/README.md)
def mixed_prompt(model, job):
    """A voice between voices (a mix): their speaker embeddings, weighted, averaged (and as long
    as their weighted lengths); embedding cloning only."""
    if job["clone"] != "embedding":
        raise ValueError("a mix of voices is cloned from their embeddings: clone 'embedding'")
    prompts = [(model.create_voice_clone_prompt(ref_audio=a, x_vector_only_mode=True), w) for a, w in job["ref_mix"]]
    vectors = [(p[0].ref_spk_embedding.float(), w) for p, w in prompts]
    mixed = sum(w * v for v, w in vectors)
    mixed = mixed / mixed.norm() * sum(w * v.norm() for v, w in vectors)
    prompts[0][0][0].ref_spk_embedding = mixed.to(prompts[0][0][0].ref_spk_embedding.dtype)
    return prompts[0][0]


# learn: sound.html#pipeline #tts-code (see learn/README.md)
def instructed(model, xvec, text, language, instruct, **kwargs):
    """One sentence said by a CustomVoice model in a cloned voice (its speaker embedding, `xvec`),
    following `instruct` (none: as it comes): CustomVoice's own generation, with the embedding
    where its speaker's would go."""
    ids = model._tokenize_texts([model._build_assistant_text(text)])
    told = [model._tokenize_texts([model._build_instruct_text(instruct)])[0] if instruct else None]
    voice = {"ref_code": [None], "ref_spk_embedding": [xvec], "x_vector_only_mode": [True], "icl_mode": [False]}
    codes, _ = model.model.generate(
        input_ids=ids, instruct_ids=told, voice_clone_prompt=voice, languages=[language],
        non_streaming_mode=True, **model._merge_generate_kwargs(**kwargs),
    )
    return model.model.speech_tokenizer.decode([{"audio_codes": codes[0]}])


# learn: sound.html#line-to-file #pipeline #speech-tokens #tts-code (see learn/README.md)
def say(model, prompt, job):
    """The job's line, sentence by sentence, with the pauses between; and whether a sentence
    ran to its limit. `prompt` is the voice's clone prompt, or for a job that `speaks` its
    speaker embedding."""
    t = job["temperature"]
    kwargs = {} if t is None else {"temperature": t, "subtalker_temperature": t}
    parts, ran_away, rate = [], False, None
    seed(job["seed"])
    said = job.get("sentences") or [[None, s] for s in sentences(job["text"])]
    for n, (instruct, text) in enumerate(said):
        limit = int(max_seconds(text) * CODEC_HZ)
        if job.get("speaks"):
            wavs, rate = instructed(model, prompt, text, job["language"], instruct, max_new_tokens=limit, **kwargs)
        else:
            wavs, rate = model.generate_voice_clone(
                text=text, language=job["language"], voice_clone_prompt=prompt, max_new_tokens=limit, **kwargs,
            )
        ran_away |= len(wavs[0]) / rate >= max_seconds(text) - 0.5
        parts.append(level(trim(np.asarray(wavs[0]), rate), rate))
        if n < len(said) - 1:
            parts.append(np.zeros(int(pause_after(text) * rate)))
    return np.concatenate(parts), rate, ran_away


def voice_key(job):
    """What a voice's prompt is made from, in a job."""
    mix = tuple(map(tuple, job.get("ref_mix") or ()))
    return (job["clone"], job["ref_audio"], job["ref_text"], job.get("prepare"), mix)


def embeddings(jobs):
    """The speaker embeddings the jobs that `speaks` need (job["xvec"]), taken with their base
    model, in this process, before the jobs are handed out; kept in a cache (by the model, the
    voice's recordings, words and weights, its `prepare`), so the base model is only loaded for
    a voice not seen before."""
    cache = os.path.join(os.environ.get("XDG_CACHE_HOME") or os.path.expanduser("~/.cache"), "narration-voices")
    os.makedirs(cache, exist_ok=True)
    keyed = {}
    for job in jobs:
        if job.get("speaks"):
            name = json.dumps([job["model"], REVISIONS.get(job["model"]), job["ref"], job.get("prepare"), job["clone"]])
            keyed.setdefault(zlib.crc32(name.encode()), []).append(job)
    model = None
    for key, those in keyed.items():
        path = os.path.join(cache, f"{key:08x}.npy")
        if not os.path.exists(path):
            model = model or load(those[0]["model"])
            prompt = clone_prompt(model, those[0])
            np.save(path, prompt[0].ref_spk_embedding.float().cpu().numpy())
        for job in those:
            job["xvec"] = path
    if model is not None:
        del model
        import gc

        gc.collect()
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()


# what a process has loaded: one model at a time, and the voices' prompts for it
_loaded = {"name": None, "model": None, "prompts": {}}


def quiet_setup():
    logging.basicConfig(level=logging.WARNING)
    warnings.filterwarnings("ignore")


def render(job):
    """Says one job and writes its clip; (its result, what to print). Each job is seeded on its
    own, so it comes out the same whichever process says it and whatever was said before."""
    name = job.get("speaks") or job["model"]
    if name != _loaded["name"]:
        _loaded.update(name=None, model=None, prompts={})
        _loaded.update(name=name, model=load(name))
    model, prompts = _loaded["model"], _loaded["prompts"]
    voice = job["xvec"] if job.get("speaks") else voice_key(job)
    if voice not in prompts:
        prompts[voice] = torch.from_numpy(np.load(voice)) if job.get("speaks") else clone_prompt(model, job)
    audio, rate, ran_away = say(model, prompts[voice], job)
    noise = zlib.crc32(f"{job['seed']}:{job['text']}".encode())
    audio = finish(audio, rate, job.get("filter"), noise, job.get("filter_audio"))
    if job["out"].endswith(".flac"):   # (a voice's recording, baked: lossless)
        import soundfile

        soundfile.write(job["out"], audio, rate, subtype="PCM_16")
    else:
        with open(job["out"], "wb") as f:
            f.write(opus(audio, rate))
    dur = round(len(audio) / rate, 2)
    warn = "  (ran to the limit: try another seed)" if ran_away else ""
    return {"out": job["out"], "dur": dur}, f"{dur:5.2f}s {job['text']}{warn}"


def workers(jobs):
    """How many processes say the jobs at once (NARRATION_WORKERS, or by the device). One process
    keeps the GPU less than half busy: most of its time goes to launching the model's many small
    steps, which processes side by side overlap. Each holds its own copy of the model (about 4.5 GB)."""
    if os.environ.get("NARRATION_WORKERS"):
        n = int(os.environ["NARRATION_WORKERS"])
    else:
        n = 1 if device() == "cpu" else 3
    # (a process starting up costs seconds: not one for every job or two)
    return max(1, min(n, len(jobs) // 2))


def main(jobs_path, results_path):
    quiet_setup()
    jobs = json.load(open(jobs_path))["jobs"]
    results, started = [], time.time()
    embeddings(jobs)
    # the longest first, so no process is left with a long one at the end; grouped by model
    order = sorted(jobs, key=lambda j: (j.get("speaks") or j["model"], -len(j["text"])))
    n = workers(jobs)
    if n == 1:
        done = map(render, order)
    else:
        import multiprocessing

        print(f"narration: {len(jobs)} clips, {n} processes", file=sys.stderr, flush=True)
        pool = multiprocessing.get_context("spawn").Pool(n, initializer=quiet_setup)
        done = pool.imap_unordered(render, order)
    for k, (result, said) in enumerate(done, 1):
        results.append(result)
        print(f"narration: [{k}/{len(jobs)}] {said}", file=sys.stderr, flush=True)
    if n > 1:
        pool.close()
        pool.join()
    json.dump(results, open(results_path, "w"))
    print(f"narration: {len(jobs)} clips in {time.time() - started:.0f}s", file=sys.stderr)


def setup():
    """npm run setup (tools/setup.mjs): the models of REVISIONS downloaded into the Hugging Face
    cache, if they are not there yet; and the device the clips would be said on."""
    quiet_setup()
    for name in REVISIONS:
        print(f"narration: {name} in {snapshot(name)}", file=sys.stderr, flush=True)
    print(f"narration: the clips are said on {device()}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    if sys.argv[1:] == ["--setup"]:
        setup()
    else:
        main(sys.argv[1], sys.argv[2])

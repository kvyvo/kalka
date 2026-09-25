"""Synthesises UI sounds and mixes them over music.wav at the event times from out/events.json → out/mix.wav."""
import json, wave
from pathlib import Path
import numpy as np

HERE = Path(__file__).parent
SR = 48000
with wave.open(str(HERE / 'music.wav')) as w:
    music = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(float) / 32767
out = music * 0.8
N = len(out)

def tone(f, dur, decay, vol, f_end=None):
    x = np.arange(int(dur * SR)) / SR
    freq = f if f_end is None else f + (f_end - f) * x / dur
    return vol * np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-x / decay) * np.minimum(x / 0.002, 1)

def noise(dur, decay, vol, hp=True):
    s = np.random.default_rng(3).standard_normal(int(dur * SR))
    if hp: s = np.diff(s, prepend=0)
    x = np.arange(len(s)) / SR
    return vol * s * np.exp(-x / decay)

def add(*sigs):
    out = np.zeros(max(len(x) for x in sigs))
    for x in sigs: out[: len(x)] += x
    return out

SFX = {
    'click': lambda: add(tone(2200, .04, .008, .35), noise(.03, .004, .12)),
    'grab': lambda: tone(1400, .05, .01, .25),
    'drop': lambda: tone(900, .08, .02, .25),
    'toggle': lambda: add(tone(1800, .05, .01, .3), tone(2600, .05, .008, .2)),
    'tick': lambda: tone(3000, .03, .006, .25),
    'hover': lambda: tone(4200, .02, .004, .08),
    'key': lambda: noise(.04, .006, .18),
    'enter': lambda: add(tone(1500, .06, .015, .3), noise(.04, .006, .12)),
    'done': lambda: add(tone(1320, .25, .09, .22), tone(1980, .25, .08, .14)),
    'toast': lambda: add(tone(880, .4, .15, .18), tone(1320, .4, .12, .12)),
}
for t, kind in json.load(open(HERE / 'out' / 'events.json')):
    s = SFX[kind]()
    i = int(t * SR) % N
    j = min(N, i + len(s))
    out[i:j] += s[: j - i]
out /= max(1, np.max(np.abs(out)) * 1.05)
with wave.open(str(HERE / 'out' / 'mix.wav'), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((out * 32767).astype('<i2').tobytes())
print('mix.wav')

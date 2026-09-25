"""Synthesises the 120 BPM, 7-bar loop for the promo and measures its beat grid.

We make our own track instead of downloading one: no licence to track, and the
loop point is exact. Output: promo/music.wav, promo/beats.json.
"""
import json, wave
from pathlib import Path
import numpy as np

SR, BPM, BARS = 48000, 120, 7
BEAT = 60 / BPM
N = int(SR * BEAT * 4 * BARS)
t = np.arange(N) / SR
out = np.zeros(N)
HERE = Path(__file__).parent

def env(length, attack, decay):
    x = np.arange(int(length * SR)) / SR
    return np.minimum(x / attack, 1) * np.exp(-x / decay)

def put(sig, at):
    i = int(at * SR) % N
    j = min(N, i + len(sig))
    out[i:j] += sig[: j - i]
    if i + len(sig) > N:  # wrap the tail into the start so the loop is seamless
        out[: i + len(sig) - N] += sig[j - i:]

def kick():
    x = np.arange(int(0.35 * SR)) / SR
    f = 45 + 90 * np.exp(-x / 0.03)
    return 0.9 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x / 0.12)

def hat():
    rng = np.random.default_rng(1)
    s = rng.standard_normal(int(0.06 * SR))
    s = np.diff(s, prepend=0)  # crude high-pass
    return 0.08 * s * env(0.06, 0.001, 0.015)

def tone(freq, length, vol, decay):
    x = np.arange(int(length * SR)) / SR
    s = np.sin(2 * np.pi * freq * x) + 0.3 * np.sin(4 * np.pi * freq * x) + 0.1 * np.sin(6 * np.pi * freq * x)
    return vol * s * env(length, 0.01, decay)

# Fmaj7 – Am7 – Dm9 – Bbmaj7 feel, root + chord, one chord per bar
CHORDS = [[53, 57, 60, 64], [57, 60, 64, 67], [50, 57, 60, 65], [46, 57, 62, 65]]
hz = lambda m: 440 * 2 ** ((m - 69) / 12)

for bar in range(BARS):
    ch = CHORDS[bar % 4]
    for b in range(4):
        at = (bar * 4 + b) * BEAT
        put(kick(), at)
        put(hat(), at + BEAT / 2)
        put(tone(hz(ch[0] - 12), BEAT * 0.9, 0.35, 0.25), at)          # bass on every beat
    for k, m in enumerate(ch[1:]):                                       # soft pad, arpeggiated
        put(tone(hz(m + 12), BEAT * 4, 0.07, 1.2), bar * 4 * BEAT + k * 0.02)
    for s in range(8):                                                   # plucks on eighths
        m = ch[1 + (s * 2 + bar) % 3] + 12
        put(tone(hz(m), 0.25, 0.09, 0.07), bar * 4 * BEAT + s * BEAT / 2)

out /= np.max(np.abs(out)) * 1.12
with wave.open(str(HERE / 'music.wav'), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((out * 32767).astype('<i2').tobytes())

# Measure the grid from the audio itself: low band (kick) energy, onset = first
# frame reaching half of the local peak around each expected beat.
hop = 96
k5 = int(SR * 0.005)
low = np.convolve(out, np.ones(k5) / k5, mode='same')
frames = (low[: N // hop * hop] ** 2).reshape(-1, hop).sum(1)
beats = []
for k in range(BARS * 4):
    c = int(k * BEAT * SR / hop)
    lo, hi = max(0, c - 40), c + 40
    seg = frames[lo:hi]
    beats.append(round((lo + int(np.argmax(seg >= seg.max() / 2))) * hop / SR, 4))
err = max(abs(b - k * BEAT) for k, b in enumerate(beats))
json.dump({'bpm': BPM, 'bars': BARS, 'duration': N / SR, 'beats': beats}, open(HERE / 'beats.json', 'w'), indent=1)
print(f'{N / SR:.2f}s, {len(beats)} beats, max grid error {err * 1000:.1f} ms')

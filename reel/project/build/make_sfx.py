"""Synthesise all SFX locally (no credits). Writes 48 kHz stereo WAVs to ../audio/sfx/."""
import os
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000
OUT = os.path.join(os.path.dirname(__file__), '..', 'audio', 'sfx')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def t(d):
    return np.arange(int(d * SR)) / SR


def env(n, a=0.005, r=0.3):
    x = np.arange(n) / SR
    e = np.minimum(1, x / max(a, 1e-4)) * np.exp(-x / max(r, 1e-4))
    return e


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype='band', fs=SR, output='sos'), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype='low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype='high', fs=SR, output='sos'), x)


def save(name, x, pan=0.0, peak=0.9):
    x = np.asarray(x, dtype=np.float64)
    x = x / (np.max(np.abs(x)) + 1e-9) * peak
    st = np.stack([x * (1 - max(pan, 0)), x * (1 + min(pan, 0))], axis=1)
    wavfile.write(os.path.join(OUT, name), SR, (st * 32767).astype(np.int16))


def bell(freqs, d, decay):
    tt = t(d)
    return sum(np.sin(2 * np.pi * f * tt) * np.exp(-tt / (decay * (1 - i * 0.12))) / (1 + i * 0.6)
               for i, f in enumerate(freqs))


def cha_ching():
    # drawer slam + two bright bells
    n = int(1.1 * SR)
    x = np.zeros(n)
    slam = bp(rng.standard_normal(int(0.08 * SR)), 300, 3000) * env(int(0.08 * SR), 0.001, 0.02)
    x[:len(slam)] += slam * 0.8
    b1 = bell([2093, 3136, 4186, 5274], 1.0, 0.25)
    off = int(0.09 * SR)
    x[off:off + len(b1)] += b1[: n - off] * 0.6
    b2 = bell([2637, 3951, 5274], 0.9, 0.3)
    off = int(0.2 * SR)
    x[off:off + len(b2)] += b2[: n - off] * 0.7
    return x


def bass_hit(d=1.2, f0=55):
    tt = t(d)
    f = f0 + 60 * np.exp(-tt / 0.04)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-tt / 0.45) + 0.3 * lp(rng.standard_normal(len(tt)), 200) * np.exp(-tt / 0.05)


def ping():
    return bell([1760, 2640], 0.5, 0.12) + 0.4 * bell([2349], 0.5, 0.08)


def whoosh(d=0.45, up=True):
    n = int(d * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 512
    for i in range(0, n, blk):
        p = i / n
        fc = 300 + (4000 if up else 2500) * (p if up else (1 - p))
        seg = noise[i:i + blk]
        out[i:i + blk] = bp(seg, max(fc * 0.6, 80), min(fc * 1.6, 20000), 1)
    shape = np.sin(np.pi * np.linspace(0, 1, n)) ** 1.5
    return out * shape


def record_scratch():
    d = 0.5
    tt = t(d)
    f = 400 + 900 * np.abs(np.sin(2 * np.pi * 7 * tt))
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = np.sign(np.sin(ph)) * 0.3 + bp(rng.standard_normal(len(tt)), 800, 4000) * 0.7
    return tone * np.exp(-tt / 0.25) * (np.sin(2 * np.pi * 7 * tt) ** 2)


def scroll_clicks(d=1.6):
    n = int(d * SR)
    x = np.zeros(n)
    k = 0.0
    while k < d - 0.03:
        c = hp(rng.standard_normal(int(0.006 * SR)), 2500) * env(int(0.006 * SR), 0.0005, 0.002)
        i = int(k * SR)
        x[i:i + len(c)] += c
        k += 0.045 + rng.uniform(0, 0.02)
    return x


def ui_click():
    c = hp(rng.standard_normal(int(0.03 * SR)), 1500) * env(int(0.03 * SR), 0.0005, 0.006)
    return c + 0.5 * bell([2400], 0.03, 0.01)


def tick_clock(d=5.0):
    n = int(d * SR)
    x = np.zeros(n)
    for k in np.arange(0, d, 0.5):
        c = bp(rng.standard_normal(int(0.02 * SR)), 1500, 6000) * env(int(0.02 * SR), 0.0005, 0.004)
        c *= 1.0 if int(k * 2) % 2 == 0 else 0.7
        i = int(k * SR)
        x[i:i + len(c)] += c
    return x


def ding():
    return bell([1318, 1976, 2637], 1.2, 0.35)


def chime():
    tt = t(1.4)
    x = np.zeros(len(tt))
    for j, f in enumerate([784, 988, 1175, 1568]):
        b = bell([f, f * 2], 1.2, 0.35)
        o = int(j * 0.07 * SR)
        x[o:o + len(b)] += b[: len(x) - o] * 0.6
    return x


def impact():
    h = bass_hit(1.6, 45)
    n = len(h)
    crack = bp(rng.standard_normal(n), 1000, 8000) * env(n, 0.001, 0.08) * 0.5
    return h + crack


def riser(d=3.0):
    n = int(d * SR)
    tt = t(d)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 1024
    for i in range(0, n, blk):
        fc = 400 + 5000 * (i / n) ** 2
        out[i:i + blk] = bp(noise[i:i + blk], fc * 0.7, min(fc * 1.4, 20000), 1)
    tone = np.sin(2 * np.pi * np.cumsum(200 + 600 * (tt / d) ** 2) / SR) * 0.25
    shape = (tt / d) ** 1.5 * np.minimum(1, (d - tt) / 0.6)
    return (out + tone) * shape


def site_ambience(d=7.0):
    n = int(d * SR)
    tt = t(d)
    rumble = lp(rng.standard_normal(n), 150, 4) * 3
    engine = (np.sin(2 * np.pi * 38 * tt) + 0.5 * np.sin(2 * np.pi * 76 * tt)) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.3 * tt))
    x = rumble + engine * 0.3 + bp(rng.standard_normal(n), 400, 2000) * 0.05
    # hammering
    for k in np.arange(0.3, d, 0.62):
        k += rng.uniform(-0.05, 0.05)
        h = bp(rng.standard_normal(int(0.05 * SR)), 1200, 5000) * env(int(0.05 * SR), 0.0005, 0.012)
        h += bell([1900, 3100], 0.05, 0.015) * 0.6
        i = int(k * SR)
        if i + len(h) < n:
            x[i:i + len(h)] += h * 1.4
    fade = np.minimum(1, np.minimum(tt / 0.3, (d - tt) / 0.3))
    return x * fade


save('cha_ching.wav', cha_ching())
save('cha_ching_reversed.wav', cha_ching()[::-1])
save('bass_hit.wav', bass_hit())
save('phone_ping.wav', ping(), peak=0.6)
for i in range(4):
    save(f'whoosh_{i}.wav', whoosh(0.4 + 0.05 * i), pan=(-0.3 if i % 2 else 0.3))
save('whoosh_soft.wav', whoosh(0.7), peak=0.5)
save('record_scratch.wav', record_scratch())
save('scroll_clicks.wav', scroll_clicks(), peak=0.5)
save('ui_click.wav', ui_click(), peak=0.5)
save('clock_tick.wav', tick_clock(), peak=0.5)
save('ding.wav', ding(), peak=0.6)
save('chime.wav', chime(), peak=0.6)
save('impact.wav', impact())
save('riser.wav', riser(), peak=0.5)
save('site_ambience.wav', site_ambience(), peak=0.6)
print('sfx ok', sorted(os.listdir(OUT)))

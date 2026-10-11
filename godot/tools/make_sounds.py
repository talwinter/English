"""Makes the game's sound effects and music loops (no downloads, no licences): plain synthesis, standard
library only. Writes mono 16-bit WAV files to godot/audio/.

    python godot/tools/make_sounds.py

Names are what scripts/sfx.gd plays: type, blip, power, glitch, whoosh, pickup, points, goal, nope, open,
fall, land, fanfare; music loops: mystery (the attic), cold (the game world).
"""
import math
import os
import random
import struct
import wave

SR = 22050
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "audio")
rng = random.Random(1987)


def n(sec):
    return int(sec * SR)


def silence(sec):
    return [0.0] * n(sec)


def osc(kind, phase):
    p = phase % 1.0
    if kind == "sine":
        return math.sin(2 * math.pi * p)
    if kind == "square":
        return 1.0 if p < 0.5 else -1.0
    if kind == "tri":
        return 4 * abs(p - 0.5) - 1
    if kind == "saw":
        return 2 * p - 1
    return 0.0


def tone(freq, sec, kind="sine", vol=0.5, attack=0.005, release=0.05, freq_end=None, decay=None):
    """A note. decay = exponential time constant (seconds) for plucked sounds."""
    out = []
    ph = 0.0
    total = n(sec)
    for i in range(total):
        t = i / SR
        f = freq if freq_end is None else freq + (freq_end - freq) * (i / max(1, total - 1))
        ph += f / SR
        env = 1.0
        if t < attack:
            env = t / max(attack, 1e-6)
        rel_start = sec - release
        if t > rel_start:
            env *= max(0.0, (sec - t) / max(release, 1e-6))
        if decay:
            env *= math.exp(-t / decay)
        out.append(osc(kind, ph) * vol * env)
    return out


def noise(sec, vol=0.5):
    return [(rng.random() * 2 - 1) * vol for _ in range(n(sec))]


def lowpass(x, cutoff):
    a = min(1.0, 2 * math.pi * cutoff / SR)
    y, out = 0.0, []
    for v in x:
        y += a * (v - y)
        out.append(y)
    return out


def highpass(x, cutoff):
    lp = lowpass(x, cutoff)
    return [v - l for v, l in zip(x, lp)]


def sweep_lowpass(x, c0, c1):
    out, y = [], 0.0
    total = len(x)
    for i, v in enumerate(x):
        c = c0 + (c1 - c0) * (i / max(1, total - 1))
        a = min(1.0, 2 * math.pi * c / SR)
        y += a * (v - y)
        out.append(y)
    return out


def fade(x, a=0.0, r=0.0):
    out = list(x)
    na, nr = n(a), n(r)
    for i in range(min(na, len(out))):
        out[i] *= i / na
    for i in range(min(nr, len(out))):
        out[len(out) - 1 - i] *= i / nr
    return out


def env_exp(x, tau):
    return [v * math.exp(-(i / SR) / tau) for i, v in enumerate(x)]


def mix(*tracks, offsets=None):
    length = max(len(t) + (offsets[i] if offsets else 0) for i, t in enumerate(tracks))
    out = [0.0] * length
    for i, t in enumerate(tracks):
        o = offsets[i] if offsets else 0
        for j, v in enumerate(t):
            out[o + j] += v
    return out


def seq(*parts):
    out = []
    for p in parts:
        out += p
    return out


def save(name, x, peak=0.85):
    m = max(1e-9, max(abs(v) for v in x))
    g = min(peak / m, 3.0) if m > 0 else 1.0
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, v * g)) * 32000)) for v in x))
    print("wrote", os.path.relpath(path), f"{len(x) / SR:.1f}s")


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ---------- effects ----------
save("type", mix(env_exp(highpass(noise(0.03, 0.9), 1500), 0.006), env_exp(tone(1900, 0.03, "square", 0.4), 0.008)))
save("blip", seq(tone(880, 0.06, "square", 0.35, release=0.02), tone(1320, 0.07, "square", 0.35, release=0.03)))
save("pickup", seq(tone(660, 0.07, "tri", 0.6), tone(990, 0.1, "tri", 0.6, release=0.06)))
save("points", seq(*[tone(f, 0.07, "square", 0.3, release=0.03) for f in (523, 659, 784, 1047)]))
save("goal", mix(tone(523, 0.7, "sine", 0.5, decay=0.25), tone(784, 0.7, "sine", 0.5, decay=0.25), offsets=[0, n(0.12)]))
save("nope", mix(tone(150, 0.28, "square", 0.35, freq_end=90, release=0.08), noise(0.28, 0.06)))
save("open", mix(sweep_lowpass(seq(*[tone(f, 0.12, "saw", 0.4, release=0.02) for f in (200, 170, 220, 150)]), 1200, 400),
                 env_exp(lowpass(noise(0.5, 0.5), 900), 0.12)))
save("land", mix(env_exp(tone(95, 0.45, "sine", 0.9, freq_end=40), 0.12),
                 env_exp(lowpass(noise(0.4, 0.8), 700), 0.1)))
save("fanfare", seq(*[tone(f, 0.16, "square", 0.3, release=0.05) for f in (523, 659, 784)],
                    mix(tone(1047, 0.7, "square", 0.3, decay=0.4), tone(784, 0.7, "square", 0.22, decay=0.4))))

# the old computer starting: a thump, a rising whine, a steady hum
power = mix(env_exp(tone(55, 0.6, "sine", 1.0), 0.15),
            tone(200, 0.8, "saw", 0.12, freq_end=1800, attack=0.05, release=0.3),
            fade(mix(tone(60, 1.6, "sine", 0.3), tone(120, 1.6, "sine", 0.15)), 0.2, 0.3),
            offsets=[0, n(0.05), 0])
save("power", power)

# glitch: random bursts of noise and jumping square tones
g = []
for _ in range(14):
    d = rng.uniform(0.03, 0.09)
    if rng.random() < 0.5:
        g += highpass(noise(d, rng.uniform(0.3, 0.9)), 600)
    else:
        g += tone(rng.choice((220, 330, 440, 880, 1760, 90)), d, "square", rng.uniform(0.2, 0.5), release=0.01)
    if rng.random() < 0.35:
        g += silence(rng.uniform(0.01, 0.04))
save("glitch", g)

# whoosh: filtered noise that opens and closes, plus a rising tone
w = sweep_lowpass(noise(1.5, 0.9), 250, 4500)
w = [v * math.sin(math.pi * (i / len(w))) ** 1.5 for i, v in enumerate(w)]
save("whoosh", mix(w, fade(tone(120, 1.5, "sine", 0.35, freq_end=900), 0.1, 0.5)))

# falling: wind and a descending whistle
f = sweep_lowpass(noise(2.8, 0.9), 400, 1800)
f = [v * (0.4 + 0.6 * math.sin(math.pi * i / len(f))) for i, v in enumerate(f)]
save("fall", mix(f, fade(tone(900, 2.8, "sine", 0.18, freq_end=260), 0.2, 0.3)))


# ---------- music loops ----------
def pad(notes, sec, vol=0.12):
    """A soft chord: slow attack, slow release, slightly detuned pairs."""
    tracks = []
    for m in notes:
        fr = mtof(m)
        a = tone(fr, sec, "sine", vol, attack=sec * 0.35, release=sec * 0.35)
        b = tone(fr * 1.004, sec, "tri", vol * 0.5, attack=sec * 0.35, release=sec * 0.35)
        tracks += [a, b]
    return mix(*tracks)


def build_music(chords, seg, motif, motif_vol, bell=False):
    total = n(seg * len(chords))
    track = [0.0] * total
    for ci, chord in enumerate(chords):
        p = pad(chord, seg * 1.5)
        # the previous chord's tail wraps around the loop point so it joins seamlessly
        start = n(seg * ci) - n(seg * 0.25)
        for j, v in enumerate(p):
            track[(start + j) % total] += v
    # sparse plucked notes
    t = 0.0
    while t < seg * len(chords) - 1.0:
        m = rng.choice(motif)
        dur = 1.6 if bell else 0.9
        note = tone(mtof(m), dur, "sine" if bell else "tri", motif_vol, attack=0.01, release=0.3, decay=0.5 if bell else 0.25)
        if bell:
            note = mix(note, tone(mtof(m) * 2.76, dur, "sine", motif_vol * 0.25, attack=0.005, release=0.3, decay=0.2))
        start = n(t)
        for j, v in enumerate(note):
            if start + j < total:
                track[start + j] += v
        t += rng.choice((1.5, 2.0, 2.5, 3.0, 4.0))
    return track


# attic: slow A minor, a mysterious feel
mystery = build_music(
    [[45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [40, 52, 56, 59]], 8.0,
    [69, 72, 76, 79, 81, 76, 72, 67], 0.16)
save("mystery", mystery, 0.55)

# adventure: a bright, steady pulse over a major pad (the village by day, setting out)
def pulse_track(chords, seg, notes, step, vol, kind="tri", decay=0.18):
    total = n(seg * len(chords))
    track = [0.0] * total
    t = 0.0
    i = 0
    while t < seg * len(chords) - step:
        base = chords[int(t // seg) % len(chords)]
        m = base[notes[i % len(notes)] % len(base)] + (12 if (i // len(notes)) % 2 else 0)
        note = tone(mtof(m + 12), step * 1.5, kind, vol, attack=0.004, release=0.05, decay=decay)
        start = n(t)
        for j, v in enumerate(note):
            if start + j < total:
                track[start + j] += v
        t += step
        i += 1
    return track


adv_chords = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]]
adv = mix(pulse_track(adv_chords, 4.0, [0, 1, 2, 1], 0.25, 0.22),
          build_music([[c - 12 for c in ch] + [ch[0]] for ch in adv_chords], 4.0, [72, 74, 76, 79], 0.1))
save("adventure", adv, 0.5)

# cozy: warm, slow, a gentle tune over soft chords (inside by the fire)
cozy_chords = [[53, 57, 60, 65], [55, 59, 62, 67], [57, 60, 64, 69], [50, 57, 62, 65]]
cozy = build_music(cozy_chords, 8.0, [65, 67, 69, 72, 69, 65, 62], 0.2)
save("cozy", cozy, 0.5)

# danger: a low drone, a heartbeat, a few sharp high notes
dseg = 8.0
danger = build_music([[36, 43], [34, 41], [36, 43], [33, 40]], dseg, [76, 77, 83], 0.1)
beat = [0.0] * n(dseg * 4)
tt = 0.0
while tt < dseg * 4 - 1:
    for off, v in ((0.0, 0.55), (0.18, 0.4)):
        thump = env_exp(tone(58, 0.35, "sine", v, freq_end=42), 0.1)
        st = n(tt + off)
        for j, x in enumerate(thump):
            if st + j < len(beat):
                beat[st + j] += x
    tt += 0.9
save("danger", mix(danger, beat), 0.55)

# glitch: a broken, buzzing bed with random bleeps (the Glitch is near)
gl = [0.0] * n(16.0)
tt = 0.0
while tt < 15.5:
    b = tone(rng.choice((220, 330, 440, 660, 880, 1320)), rng.uniform(0.04, 0.12), "square", rng.uniform(0.05, 0.14), release=0.02)
    st = n(tt)
    for j, x in enumerate(b):
        gl[st + j] += x
    tt += rng.choice((0.2, 0.35, 0.5, 0.9))
hum = tone(55, 16.0, "saw", 0.07, attack=2.0, release=2.0)
glitchbed = mix(gl, hum, lowpass(noise(16.0, 0.12), 1500))
save("glitch_music", glitchbed, 0.5)

# ambience: wind and a fire that crackles (quiet loops under the music)
w = lowpass(noise(20.0, 0.6), 700)
w = [v * (0.45 + 0.55 * math.sin(2 * math.pi * i / len(w) * 4) ** 2) * 0.5 for i, v in enumerate(w)]
save("wind", w, 0.35)
crackle = lowpass(noise(12.0, 0.25), 400)
for _ in range(90):
    st = rng.randrange(0, n(11.5))
    snap = env_exp(highpass(noise(0.04, 0.9), 900), 0.008)
    for j, x in enumerate(snap):
        crackle[st + j] += x * rng.uniform(0.3, 1.0)
save("fire", crackle, 0.35)

# one footstep (soft, on boards or snow; the game varies the pitch)
save("step", mix(env_exp(lowpass(noise(0.12, 0.8), 500), 0.035), env_exp(tone(110, 0.1, "sine", 0.5, freq_end=70), 0.04)), 0.5)

# cold world: glassy bells over a wide, quiet chord, with wind
cold_music = build_music([[50, 57, 62, 69], [46, 53, 58, 65], [48, 55, 60, 67]], 8.0,
                         [74, 77, 81, 79, 86, 84, 77], 0.14, bell=True)
wind = lowpass(noise(24.0, 0.5), 500)
wind = [v * (0.5 + 0.5 * math.sin(2 * math.pi * i / len(wind) * 3)) * 0.35 for i, v in enumerate(wind)]
save("cold", mix(cold_music, wind), 0.55)

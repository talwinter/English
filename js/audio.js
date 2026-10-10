// Chiptune music and sound effects, made live with the Web Audio API (no sound files).
//   Sound.music("mystery")   loop a track: mystery, adventure, cozy, danger, glitch (null = stop)
//   Sound.sfx("pickup")      blip, pickup, points, goal, nope, whoosh, power, glitch, type, fanfare
// Browsers only allow sound after a click, so Sound.unlock() is called from the Start button.

window.Sound = (function () {
  let ctx = null, master = null, musicGain = null, sfxGain = null, noise = null;
  let musicOn = true, sfxOn = true, current = null, timer = null;
  try {
    musicOn = localStorage.getItem("eq.music") !== "off";
  } catch { /* storage blocked */ }

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.07; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.18; sfxGain.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  const NOTES = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
  const freq = (n) => {
    const m = /^([A-G]#?)(\d)$/.exec(n);
    return m ? 440 * 2 ** ((NOTES[m[1]] + (+m[2] + 1) * 12 - 69) / 12) : 0;
  };

  function tone(out, f, t, dur, type = "square", vol = 1, slide = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function hiss(out, t, dur, vol = 0.5, hp = 4000) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = "highpass"; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t); s.stop(t + dur + 0.02);
  }

  // ---------- music: 16 steps per bar; "." = rest, "-" = hold the last note
  const TRACKS = {
    mystery: {
      bpm: 84,
      lead: "E5 . G5 . B5 . A5 - . . G5 . E5 . . . | F5 . A5 . C6 . B5 - . . A5 . F5 . . . | E5 . G5 . B5 . E6 - . . D6 . B5 . G5 . | A5 - - . G5 - - . F5 - - . E5 - - - ",
      bass: "E3 . . . E3 . . . C3 . . . C3 . . . | D3 . . . D3 . . . A2 . . . A2 . . . | E3 . . . E3 . . . G2 . . . G2 . . . | A2 . . . B2 . . . C3 . . . B2 . . . ",
      drum: "k . . . . . h . k . . . . . h . ",
    },
    adventure: {
      bpm: 128,
      lead: "C5 . E5 . G5 . C6 - . . G5 . E5 . G5 . | A5 . G5 . E5 . C5 - . . D5 . E5 . . . | F5 . A5 . C6 . A5 . G5 . E5 . C5 . E5 . | D5 . E5 . F5 . D5 . C5 - - - . . . . ",
      bass: "C3 . C4 . C3 . C4 . A2 . A3 . A2 . A3 . | F2 . F3 . F2 . F3 . G2 . G3 . G2 . G3 . | F2 . F3 . F2 . F3 . C3 . C4 . C3 . C4 . | G2 . G3 . G2 . G3 . C3 . C4 . C3 . . . ",
      drum: "k . h . s . h . k . h . s . h h ",
    },
    cozy: {
      bpm: 96,
      lead: "G5 - E5 . D5 . C5 - . . E5 . G5 - . . | A5 - G5 . E5 . D5 - . . C5 . D5 - . . | E5 - G5 . A5 . C6 - . . A5 . G5 - . . | E5 - D5 . C5 - - - . . . . . . . . ",
      bass: "C3 . G3 . C3 . G3 . A2 . E3 . A2 . E3 . | F2 . C3 . F2 . C3 . G2 . D3 . G2 . D3 . | C3 . G3 . C3 . G3 . F2 . C3 . F2 . C3 . | G2 . D3 . G2 . D3 . C3 . G3 . C3 . . . ",
      drum: "k . . . h . . . s . . . h . . . ",
    },
    danger: {
      bpm: 150,
      lead: "A4 . C5 . A4 . D#5 . A4 . E5 - - . D5 . | C5 . A4 . C5 . D5 . E5 - . . C5 - . . | A4 . C5 . A4 . D#5 . A4 . E5 - - . G5 . | F5 . E5 . D5 . C5 . B4 - . . A4 - - - ",
      bass: "A2 A2 . A2 A2 . A2 A2 . A2 A2 . A2 . G2 . | F2 F2 . F2 F2 . F2 F2 . E2 E2 . E2 . E2 . | A2 A2 . A2 A2 . A2 A2 . A2 A2 . A2 . G2 . | F2 F2 . F2 E2 . E2 E2 . E2 E2 . E2 . E2 . ",
      drum: "k . s . k k s . k . s . k k s s ",
    },
    glitch: {
      bpm: 110,
      lead: "C6 . . C#6 . . G5 . . . F#5 . C6 . . . | B5 . . A#5 . . E5 . . . D#5 . A#5 . . . ",
      bass: "C2 . . . C#2 . . . C2 . . . F#2 . . . | C2 . . . B1 . . . A#1 . . . B1 . . . ",
      drum: "k . . h . . k . s . h . . k s . ",
    },
  };

  function parse(line) {
    const steps = [];
    let last = null;
    for (const tok of line.replace(/\|/g, " ").trim().split(/\s+/)) {
      if (tok === "-") { if (last) last.len++; steps.push(null); }
      else if (tok === ".") { last = null; steps.push(null); }
      else { last = { f: freq(tok), len: 1 }; steps.push(last); }
    }
    return steps;
  }

  function startTrack(name) {
    const t = TRACKS[name];
    if (!t) return;
    const lead = parse(t.lead), bass = parse(t.bass), drum = t.drum.trim().split(/\s+/);
    const stepDur = 60 / t.bpm / 4;
    let step = 0, next = ctx.currentTime + 0.1;
    timer = setInterval(() => {
      while (next < ctx.currentTime + 0.25) {
        const l = lead[step % lead.length], b = bass[step % bass.length], d = drum[step % drum.length];
        if (l) tone(musicGain, l.f, next, l.len * stepDur * 0.95, "square", 0.5);
        if (b) tone(musicGain, b.f, next, b.len * stepDur * 0.9, "triangle", 0.9);
        if (d === "k") tone(musicGain, 150, next, 0.12, "sine", 1, 0.3);
        if (d === "s") hiss(musicGain, next, 0.1, 0.5, 1500);
        if (d === "h") hiss(musicGain, next, 0.04, 0.25, 7000);
        step++;
        next += stepDur;
      }
    }, 40);
  }

  function music(name) {
    if (name === current && timer) return;
    current = name;
    if (timer) { clearInterval(timer); timer = null; }
    if (!name || !musicOn || !ctx) return;
    startTrack(name);
  }

  // ---------- sound effects
  function sfx(name) {
    if (!sfxOn || !init()) return;
    const t = ctx.currentTime + 0.01, o = sfxGain;
    switch (name) {
      case "blip": tone(o, 880, t, 0.05, "square", 0.4); break;
      case "type": hiss(o, t, 0.03, 0.4, 3000); tone(o, 1800, t, 0.02, "square", 0.15); break;
      case "pickup": tone(o, 988, t, 0.07, "square", 0.6); tone(o, 1319, t + 0.07, 0.18, "square", 0.6); break;
      case "points": [523, 659, 784, 1047].forEach((f, i) => tone(o, f, t + i * 0.06, 0.12, "square", 0.5)); break;
      case "goal": tone(o, 659, t, 0.12, "triangle", 0.8); tone(o, 988, t + 0.12, 0.25, "triangle", 0.8); break;
      case "nope": tone(o, 196, t, 0.12, "square", 0.5); tone(o, 147, t + 0.12, 0.2, "square", 0.5); break;
      case "whoosh": hiss(o, t, 0.4, 0.6, 800); tone(o, 300, t, 0.35, "sine", 0.4, 3); break;
      case "power": tone(o, 60, t, 1.2, "sawtooth", 0.3, 12); hiss(o, t + 0.8, 0.5, 0.3, 5000); break;
      case "glitch":
        for (let i = 0; i < 8; i++) tone(o, 100 + Math.random() * 1500, t + i * 0.04, 0.05, "square", 0.4);
        hiss(o, t, 0.35, 0.5, 2000);
        break;
      case "fanfare":
        [["C5", 0, 0.15], ["E5", 0.15, 0.15], ["G5", 0.3, 0.15], ["C6", 0.45, 0.6], ["G5", 0.7, 0.12], ["C6", 0.85, 0.7]]
          .forEach(([n, d, len]) => tone(o, freq(n), t + d, len, "square", 0.55));
        break;
      default: break;
    }
  }

  return {
    unlock() { if (init() && ctx.state === "suspended") ctx.resume(); if (current && !timer) { const c = current; current = null; music(c); } },
    music,
    sfx,
    // Quieter music while the game reads a sentence aloud.
    duck(on) { if (musicGain) musicGain.gain.setTargetAtTime(on ? 0.025 : 0.07, ctx.currentTime, 0.15); },
    get musicOn() { return musicOn; },
    set musicOn(v) {
      musicOn = v;
      try { localStorage.setItem("eq.music", v ? "on" : "off"); } catch { /* storage blocked */ }
      const c = current; current = null; music(v ? c : null); current = c;
    },
    tracks: Object.keys(TRACKS),
  };
})();

// Reads English text aloud. With the server it uses human-sounding voices (Kokoro, made on the server, a
// different voice for each character); without it, or if a line is not ready in time, the browser's own voices.
// On Windows, Edge has the most natural browser voices ("Microsoft Aria Online (Natural)" etc.).

window.Speech = (function () {
  const synth = window.speechSynthesis;
  let voice = null;
  let enabled = true;
  let server = location.protocol !== "file:"; // until the server says its voices are off
  const WAIT_MS = 3000;                       // the server answers at once; this is only for a slow network
  const jobs = [];
  let current = null;
  let gen = 0;                                // changes on stop(): old work ends quietly

  function pickVoice() {
    if (!synth) return;
    const voices = synth.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
    const score = (v) =>
      (/natural/i.test(v.name) ? 8 : 0) +
      (/online/i.test(v.name) ? 2 : 0) +
      (/google us english/i.test(v.name) ? 6 : 0) +
      (/aria|jenny|guy|zira|david|samantha/i.test(v.name) ? 3 : 0) +
      (/en[-_]us/i.test(v.lang) ? 2 : 0);
    voices.sort((a, b) => score(b) - score(a));
    voice = voices[0] || null;
  }

  if (synth) {
    pickVoice();
    synth.addEventListener?.("voiceschanged", pickVoice);
  }

  const duck = (on) => window.Sound && Sound.duck(on);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // The word spans of the part that is spoken, and which one to light up.
  function highlighter(el, from, to) {
    const spans = el ? [...el.querySelectorAll(".w")].filter((s) => +s.dataset.i >= from && +s.dataset.i < to) : [];
    let lit = null;
    return {
      spans,
      light(s) {
        if (s === lit) return;
        lit?.classList.remove("speaking");
        s?.classList.add("speaking");
        lit = s;
      },
      byChar(i) { let c = null; for (const s of spans) if (+s.dataset.i <= i) c = s; this.light(c); },
      clear() { this.light(null); },
    };
  }

  // Ask the server for the line now, so it is ready (or being made) when its turn comes.
  function request(job) {
    // wait=0: if the human voice is not made yet, the browser says it now (the server makes it for next time).
    const url = `/api/voice?wait=0&text=${encodeURIComponent(job.text)}${job.slow ? "&slow=1" : ""}`;
    job.info = fetch(url)
      .then((r) => {
        if (r.status === 404) server = false;
        return r.ok ? r.json() : null;
      })
      .then((info) => {
        if (info && info.audio) { job.audio = new Audio(info.audio); job.audio.preload = "auto"; }
        return info;
      })
      .catch(() => null);
  }

  async function serverSay(job, my) {
    const info = await Promise.race([job.info, wait(WAIT_MS).then(() => null)]);
    if (!info || !job.audio || my !== gen) return false;
    const { offset, say } = Voices.parse(job.text);
    const h = highlighter(job.el, offset, offset + say.length);
    const audio = job.audio;
    const times = info.words && info.words.length === h.spans.length ? info.words : null;
    let raf = 0;
    const tick = () => {
      const t = audio.currentTime;
      if (times) {
        let i = -1;
        for (let k = 0; k < times.length; k++) if (times[k][0] <= t + 0.05) i = k;
        h.light(h.spans[i] || null);
      } else if (audio.duration > 0) {
        h.byChar(offset + (t / audio.duration) * say.length);
      }
      raf = requestAnimationFrame(tick);
    };
    return new Promise((resolve) => {
      const end = (ok) => { cancelAnimationFrame(raf); h.clear(); job.stop = null; resolve(ok); };
      job.stop = () => { audio.pause(); end(true); };
      audio.onended = () => end(true);
      audio.onerror = () => end(false);
      audio.play().then(() => { raf = requestAnimationFrame(tick); }, () => end(false));
    });
  }

  function browserSay(job) {
    if (!synth) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(job.text);
      if (voice) u.voice = voice;
      u.lang = voice ? voice.lang : "en-US";
      u.rate = job.rate;
      u.pitch = job.pitch;
      const h = highlighter(job.el, 0, Infinity);
      // Some browsers forget to say when they finished: stop waiting after a while.
      const safety = setTimeout(() => end(), 3000 + job.text.length * 150);
      const end = () => { clearTimeout(safety); h.clear(); job.stop = null; resolve(); };
      job.stop = () => { synth.cancel(); end(); };
      u.onboundary = (e) => { if (!e.name || e.name === "word") h.byChar(e.charIndex); };
      u.onend = u.onerror = end;
      synth.speak(u);
    });
  }

  async function pump() {
    if (current) return;
    const my = gen;
    duck(true);
    while (jobs.length && my === gen) {
      current = jobs.shift();
      const ok = server && current.info ? await serverSay(current, my) : false;
      if (!ok && my === gen) await browserSay(current);
    }
    if (my === gen) { current = null; duck(false); }
  }

  // Say `text`. If `el` is given, its .w spans (with data-i = char index) light up as they are spoken.
  function say(text, { el = null, queue = false, rate = 0.85, pitch = 1 } = {}) {
    if (!enabled || !text) return;
    if (!queue) stop();
    const job = { text: String(text), el, rate, pitch, slow: rate < 0.8 };
    if (server) request(job);
    jobs.push(job);
    pump();
  }

  function stop() {
    gen++;
    jobs.length = 0;
    if (current && current.stop) current.stop();
    current = null;
    if (synth) synth.cancel();
    duck(false);
  }

  return {
    say,
    stop,
    get available() { return !!synth || server; },
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; if (!v) stop(); },
  };
})();

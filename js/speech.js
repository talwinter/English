// Reads English text aloud with the browser's built-in voices.
// On Windows, Edge has the most natural voices ("Microsoft Aria Online (Natural)" etc.).

window.Speech = (function () {
  const synth = window.speechSynthesis;
  let voice = null;
  let enabled = true;

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

  // Speak `text`. If `el` is given, its .w spans (with data-i = char index) light up as they are spoken.
  function say(text, { el = null, queue = false, rate = 0.85, pitch = 1 } = {}) {
    if (!synth || !enabled || !text) return;
    if (!queue) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : "en-US";
    u.rate = rate;
    u.pitch = pitch;
    u.onstart = () => window.Sound && Sound.duck(true);
    u.onend = u.onerror = () => window.Sound && Sound.duck(false);
    if (el) {
      const spans = [...el.querySelectorAll(".w")];
      const clear = () => spans.forEach((s) => s.classList.remove("speaking"));
      u.onboundary = (e) => {
        if (e.name && e.name !== "word") return;
        clear();
        let current = null;
        for (const s of spans) if (+s.dataset.i <= e.charIndex) current = s;
        current?.classList.add("speaking");
      };
      u.onend = u.onerror = () => { clear(); if (window.Sound) Sound.duck(false); };
    }
    synth.speak(u);
  }

  return {
    say,
    stop: () => synth && synth.cancel(),
    get available() { return !!synth; },
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; if (!v) synth?.cancel(); },
  };
})();

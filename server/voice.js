// Human-sounding voices, made on this server with Kokoro (a free text-to-speech model that runs on the CPU,
// in its own Docker container). Every line is made once and kept in data/voice/, so the game plays it at once
// next time. When nothing is waiting, the server makes the lines of the episodes ahead of time.
// Without Kokoro (no TTS_URL) the game uses the browser's voices, like before.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Voices = require("../js/voices");

const SPEED = { normal: 0.92, slow: 0.8 };
const MAX_TEXT = 400;

// url: Kokoro's address, for example http://kokoro:8880
function createVoice({ dataDir, url, log = () => {}, fetchImpl = fetch, timeoutMs = 120000 }) {
  const base = url ? String(url).replace(/\/+$/, "").replace(/\/v1$/, "") : null;
  const dir = path.join(dataDir, "voice");
  fs.mkdirSync(dir, { recursive: true });
  let voices = null;         // the voices Kokoro has (null: not asked yet)
  let captions = true;       // Kokoro can say when each word is spoken (newer versions)
  let lastError = null;
  const urgent = [], background = [];
  const working = new Map(); // id -> promise
  let running = false;

  async function call(p, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(base + p, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error(`Kokoro ${p}: ${r.status} ${(await r.text()).slice(0, 200)}`);
      return r;
    } finally {
      clearTimeout(timer);
    }
  }

  async function knownVoices() {
    if (voices) return voices;
    const data = await (await call("/v1/audio/voices")).json();
    voices = new Set((data.voices || []).map((v) => (typeof v === "string" ? v : v.id || v.name)));
    return voices;
  }

  // What to make for a line: the voice, the speed, the words, and a name for the file.
  function plan(text, slow, have = voices) {
    const { who, say } = Voices.parse(String(text));
    let voice = Voices.voiceFor(who);
    if (have && have.size && !have.has(voice)) voice = Voices.NARRATOR;
    const speed = slow ? SPEED.slow : SPEED.normal;
    const input = Voices.forSpeech(say);
    const id = crypto.createHash("sha1").update(`${voice}|${speed}|${input}`).digest("hex").slice(0, 24);
    return { id, voice, speed, input };
  }

  const files = (id) => ({ audio: path.join(dir, `${id}.mp3`), words: path.join(dir, `${id}.json`) });
  const answer = (id) => {
    let words = null;
    try { words = JSON.parse(fs.readFileSync(files(id).words, "utf8")); } catch { /* no word times */ }
    return { audio: `/voice/${id}.mp3`, words };
  };

  async function make(p) {
    const f = files(p.id);
    const body = { model: "kokoro", input: p.input, voice: p.voice, speed: p.speed, response_format: "mp3", stream: false };
    let audio = null, words = null;
    if (captions) {
      try {
        const data = await (await call("/dev/captioned_speech", { ...body, return_timestamps: true })).json();
        if (!data || typeof data.audio !== "string") throw new Error("no audio");
        audio = Buffer.from(data.audio, "base64");
        words = (data.timestamps || [])
          .filter((t) => /[A-Za-z0-9]/.test(t.word))
          .map((t) => [Math.round(t.start_time * 1000) / 1000, Math.round(t.end_time * 1000) / 1000]);
      } catch (e) {
        if (e.name === "AbortError" || e.name === "TypeError") throw e; // too slow, or Kokoro is not there
        captions = false;
        log(`Kokoro word times not available, using plain speech (${e.message})`);
      }
    }
    if (!audio) audio = Buffer.from(await (await call("/v1/audio/speech", body)).arrayBuffer());
    if (audio.length < 100) throw new Error("Kokoro sent an empty sound");
    fs.writeFileSync(`${f.audio}.tmp`, audio);
    fs.renameSync(`${f.audio}.tmp`, f.audio);
    if (words && words.length) fs.writeFileSync(f.words, JSON.stringify(words));
  }

  async function run() {
    if (running) return;
    running = true;
    try {
      while (urgent.length || background.length) {
        const job = urgent.shift() || background.shift();
        try {
          if (!fs.existsSync(files(job.p.id).audio)) await make(job.p);
          lastError = null;
          job.done(answer(job.p.id));
        } catch (e) {
          lastError = e.name === "TypeError" ? "Kokoro is not answering (still starting?), trying again in 5 minutes" : e.message;
          job.fail(e);
          if (job.background) { // Kokoro is down or broken: try again later
            background.splice(0).forEach((j) => j.fail(e));
            log(`Voices: ${e.message}`);
          }
        }
      }
    } finally {
      running = false;
    }
  }

  // The voice for a line: { audio: "/voice/<id>.mp3", words: [[start, end], ...] or null }.
  async function get(text, { slow = false, background: bg = false } = {}) {
    if (!base) throw new Error("voices are off");
    text = String(text || "").trim();
    if (!text || text.length > MAX_TEXT) throw new Error("bad text");
    if (!voices) await knownVoices().catch(() => null);
    const p = plan(text, slow);
    if (fs.existsSync(files(p.id).audio)) return answer(p.id);
    if (working.has(p.id)) {
      // Someone is waiting now: move a background job to the front.
      const i = background.findIndex((j) => j.p.id === p.id);
      if (!bg && i >= 0) urgent.push(...background.splice(i, 1));
      return working.get(p.id);
    }
    const promise = new Promise((done, fail) => (bg ? background : urgent).push({ p, done, fail, background: bg }))
      .finally(() => working.delete(p.id));
    working.set(p.id, promise);
    run();
    return promise;
  }

  // Make these lines ahead of time ([{ text, slow }]), one by one, when nothing else is waiting.
  function prepare(lines) {
    if (!base) return 0;
    let n = 0;
    for (const { text, slow } of lines) {
      if (!text || text.length > MAX_TEXT || /[{}]/.test(text)) continue; // {name} and templates: made when needed
      const { id } = plan(text, slow);
      if (working.has(id) || fs.existsSync(files(id).audio)) continue; // being made, or made already
      get(text, { slow, background: true }).catch(() => { /* logged */ });
      n++;
    }
    return n;
  }

  function status() {
    let ready = 0;
    try { ready = fs.readdirSync(dir).filter((f) => f.endsWith(".mp3")).length; } catch { /* none */ }
    return { enabled: !!base, ready, waiting: working.size, lastError };
  }

  const audioPath = (name) => (/^[0-9a-f]{24}\.mp3$/.test(name) ? path.join(dir, name) : null);

  return { get, prepare, status, audioPath, plan, enabled: !!base };
}

module.exports = { createVoice, SPEED };

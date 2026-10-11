// English Quest server: serves the game, runs the daily Discord lock, and checks the word challenge.
// Configuration is by environment variables; see docker-compose.yml.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { shouldLock, missionDate, addDays, parseTime, parseDays } = require("./schedule");
const { createRouter, COMMANDS } = require("./router");
const { createStore } = require("./store");
const { createChallenges } = require("./challenge");
const { loadContent, readOverride, ROOT, BUILTIN } = require("./content");
const { createArt } = require("./art");
const { createWriter } = require("./writer");
const { createWake } = require("./wake");
const { createVoice } = require("./voice");
const { createCanon } = require("./canon");
const Episode = require("../js/episode");

const env = process.env;
const config = {
  port: Number(env.PORT || 8080),
  timeZone: env.TIMEZONE || env.TZ || "Asia/Jerusalem",
  lockAt: parseTime(env.LOCK_TIME || "08:00"),
  lockTime: env.LOCK_TIME || "08:00",
  days: parseDays(env.LOCK_DAYS || "0,1,2,3,4,5,6"),
  // LOCK_ENABLED=false: no daily lock (the parent page's "Lock now" still works).
  enabled: String(env.LOCK_ENABLED || "true").trim().toLowerCase() !== "false",
  adminPassword: env.ADMIN_PASSWORD || "",
  workerToken: env.WORKER_TOKEN || "",
};

const dataDir = env.DATA_DIR || path.join(ROOT, "data");
const store = createStore(dataDir);
let writer = null;
const art = createArt(dataDir, {
  episodeShots: () => (writer ? writer.episodeShots() : []),
  onChosen: (key) => writer && writer.placeThings(key).catch((e) => store.log(`Could not find things in "${key}": ${e.message}`)),
  // By default the server uses each picture by itself (one version); AUTO_CHOOSE_ART=false = you choose from 3.
  autoChoose: env.AUTO_CHOOSE_ART !== "false" || env.AUTO_PUBLISH === "true",
  versions: env.AUTO_CHOOSE_ART !== "false" || env.AUTO_PUBLISH === "true" ? 1 : 3,
});
const router = createRouter(env, (m) => store.log(m));
let content = loadContent(dataDir);
let challenges = createChallenges(content.DICT);
// Human-sounding voices from the Kokoro container (TTS_URL); without it the game uses the browser's voices.
const voice = createVoice({ dataDir, url: env.TTS_URL || null, log: (m) => store.log(m) });

// After a new episode is published: load the episodes and words again.
function reloadContent() {
  content = loadContent(dataDir);
  challenges = createChallenges(content.DICT);
  prepareVoices();
}

// Make the voices ahead of time: the episodes he has not played first, then the shared lines, then the words.
// {name} in an episode is his name (he types it in the prologue; the game tells the server). The voices are made
// with the real name, so every line already exists when he plays.
const heroName = () => (store.state.profile && store.state.profile.name) || "friend";
const withName = (t) => t.replace(/\{name\}/g, heroName());

// ---------- word progress: { word: { seen, looked, right, wrong, box, known } }
const knownWords = () => (store.state.profile.words = store.state.profile.words || {});

function mergeWords(incoming) {
  const mine = knownWords();
  const num = (v) => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
  for (const [word, w] of Object.entries(incoming).slice(0, 5000)) {
    if (!/^[a-z']{1,30}$/.test(word) || !w || typeof w !== "object") continue;
    const cur = mine[word] || { seen: 0, looked: 0, right: 0, wrong: 0, box: 0, known: false };
    const inAnswers = num(w.right) + num(w.wrong), curAnswers = cur.right + cur.wrong;
    mine[word] = {
      seen: Math.max(cur.seen, num(w.seen)), looked: Math.max(cur.looked, num(w.looked)),
      right: Math.max(cur.right, num(w.right)), wrong: Math.max(cur.wrong, num(w.wrong)),
      // the box comes from whoever answered more recently (more answers)
      box: inAnswers >= curAnswers ? Math.min(4, num(w.box)) : cur.box,
      known: !!(cur.known || w.known),
    };
  }
}

// Words he finds hard: answered wrong, or looked up many times and not mastered yet.
function weakWords(limit = 15) {
  return Object.entries(knownWords())
    .filter(([, w]) => !w.known && w.box < 3 && (w.wrong > 0 || w.looked >= 3))
    .map(([word, w]) => [word, w.wrong * 3 + w.looked - w.right])
    .sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word]) => word);
}

function wordSummary() {
  const all = Object.entries(knownWords());
  return {
    met: all.length,
    mastered: all.filter(([, w]) => w.known || w.box >= 3).length,
    weak: weakWords(8),
  };
}

function prepareVoices() {
  if (!voice.enabled) return;
  const done = (e) => store.state.episodesDone.includes(e.id);
  const eps = [...content.episodes.filter((e) => !done(e)), ...content.episodes.filter(done)];
  const lines = [
    ...eps.flatMap((e) => Episode.texts(e.data).slice(1).map((text) => ({ text: withName(text) }))),
    ...content.baseTexts.map((text) => ({ text })),
    // the first-time tips are also said by Byte (after he has met Byte)
    ...Object.values((content.base.ui || {}).tips || {}).map((t) => ({ text: `Byte: "${t}"` })),
    ...eps.flatMap((e) => Episode.commandLines(e.data, content.base).map((text) => ({ text }))),
    ...Object.keys(content.DICT).map((text) => ({ text, slow: true })),
  ];
  const n = voice.prepare(lines);
  if (n) store.log(`Voices: making ${n} lines`);
}
const wake = createWake({
  wakeAt: env.WAKE_TIME ? parseTime(env.WAKE_TIME) : null, timeZone: config.timeZone, router, art, log: (m) => store.log(m),
});
const canon = createCanon(dataDir);
writer = createWriter({ dataDir, env, getContent: () => content, reload: reloadContent, art, log: (m) => store.log(m),
  getProfile: () => ({ ...(store.state.profile || {}), weak: weakWords(15) }), canon });
if (env.AUTO_CHOOSE_ART !== "false" || env.AUTO_PUBLISH === "true") art.chooseWaiting();

// An episode with AI pictures is ready to play when all its pictures are chosen.
// A scene with fallbackArt (an old drawing) can always be played: it shows the drawing until its pictures are ready.
// (People such as the hero and grandmother are ready-made walking sprites, not AI pictures.)
const isPicture = (k) => k && !String(k).startsWith("ega:") && !Episode.CHARACTERS.includes(k);
function artReady(ep) {
  if (ep.format === "3d") return true; // rooms come from the catalog: there are no pictures to wait for
  const keys = ep.scenes.flatMap((sc) => (sc.fallbackArt ? [] : [sc.art, ...sc.objects.map((o) => o.sprite)]));
  return keys.filter(isPicture).every((k) => art.isChosen(k));
}

// The AI pictures of this episode that are ready (the game uses them instead of the old drawings).
function chosenArt(ep) {
  if (ep.format === "3d") return [];
  const keys = ep.scenes.flatMap((sc) => [sc.art, ...sc.objects.map((o) => o.sprite)]);
  return [...new Set(keys.filter((k) => isPicture(k) && art.isChosen(k)))];
}

// Backgrounds that were chosen before the server knew their scenes (for example the attic, made before the
// prologue existed), or before it found floor outlines: find where things are in them now (once each).
async function placeMadeBackgrounds() {
  if (!env.OPENAI_API_KEY) return;
  const keys = new Set();
  for (const e of content.episodes) {
    const placed = BUILTIN.includes(e.id) ? readOverride(dataDir, e.id).scenes || {} : null;
    for (const sc of e.data.scenes) {
      if (String(sc.art).startsWith("ega:") || !art.isChosen(sc.art)) continue;
      const done = placed ? placed[sc.id] && "walk" in placed[sc.id] : sc.walk !== undefined;
      if (!done) keys.add(sc.art);
    }
  }
  for (const key of keys) {
    await writer.placeThings(key).catch((err) => store.log(`Could not find things in "${key}": ${err.message}`));
  }
}

// ---------- mission and lock state

const state = () => store.state;
const isDone = (date) => !!state().completions[date];
const desired = (now = new Date()) => shouldLock(now, config, isDone, state().forceLock);

// Today's new episode: the first one he has not finished whose pictures are ready.
// (An episode still waiting for pictures is skipped, and comes later when they are ready.)
function nextEpisode() {
  // One new episode a day: once he has finished one today, the mission is the word challenge.
  const playedToday = (state().episodeDates || {})[missionDate(new Date(), config)];
  if (playedToday && env.DEV_MODE !== "true") return null;   // DEV_MODE: no waiting for tomorrow while testing
  return content.episodes.find((e) => !state().episodesDone.includes(e.id) && artReady(e.data)) || null;
}

function mission() {
  const ep = nextEpisode();
  return ep ? { type: "episode", episode: ep.id, title: ep.title } : { type: "challenge" };
}

function streak(now = new Date()) {
  let day = missionDate(now, config);
  if (!isDone(day)) day = addDays(day, -1);
  let n = 0;
  for (let i = 0; i < 400; i++, day = addDays(day, -1)) {
    const lockDay = config.enabled && config.days.includes(new Date(`${day}T12:00:00Z`).getUTCDay());
    if (isDone(day)) n++;
    else if (lockDay) break;
  }
  return n;
}

function complete(by, score = null) {
  const date = missionDate(new Date(), config);
  state().completions[date] = { at: new Date().toISOString(), by, score };
  state().forceLock = false;
  store.log(`Mission done for ${date} (${by}${score != null ? `, score ${score}` : ""})`);
  reconcile();
}

// ---------- keeping the router in sync

let applied = null, appliedAt = 0, applying = false, again = false, routerError = null;
const REAPPLY_MS = 10 * 60 * 1000;

async function reconcile(force = false) {
  if (applying) { again = true; return; }
  const { locked } = desired();
  if (!force && applied === locked && Date.now() - appliedAt < REAPPLY_MS) return;
  applying = true;
  try {
    await router.run(locked ? COMMANDS.lock : COMMANDS.unlock);
    if (applied !== locked) store.log(`Discord ${locked ? "LOCKED" : "UNLOCKED"}`);
    applied = locked;
    appliedAt = Date.now();
    routerError = null;
  } catch (e) {
    if (routerError !== e.message) store.log(`Router error: ${e.message}`);
    routerError = e.message;
  } finally {
    applying = false;
    if (again) { again = false; reconcile(); }
  }
}

// ---------- HTTP

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".json": "application/json", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".woff2": "font/woff2",
  ".md": "text/plain; charset=utf-8",
};
// Only these files and folders are public. The server code and data folder are not.
const PUBLIC = ["index.html", "css", "js", "assets", "tools/pixelate.html"];

function serveStatic(req, res, urlPath) {
  const rel = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath).replace(/^\/+/, "");
  const file = path.normalize(path.join(ROOT, rel));
  const allowed = PUBLIC.some((p) => file === path.join(ROOT, p) || file.startsWith(path.join(ROOT, p) + path.sep));
  if (!allowed) return send(res, 404, "Not found");
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, "Not found");
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
}

function send(res, status, body, headers = {}) {
  const json = typeof body !== "string";
  res.writeHead(status, { "Content-Type": json ? "application/json" : "text/plain; charset=utf-8", ...headers });
  res.end(json ? JSON.stringify(body) : body);
}

function readJson(req, limit = 10000) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > limit) { reject(new Error("too big")); req.destroy(); } });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("bad json")); } });
  });
}

const sameSecret = (given, secret) => {
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(secret).digest();
  return crypto.timingSafeEqual(a, b);
};

function isWorker(req) {
  const [type, token] = (req.headers.authorization || "").split(" ");
  return !!config.workerToken && type === "Bearer" && !!token && sameSecret(token, config.workerToken);
}

function isAdmin(req) {
  if (!config.adminPassword) return false;
  const [type, value] = (req.headers.authorization || "").split(" ");
  if (type !== "Basic" || !value) return false;
  const pass = Buffer.from(value, "base64").toString().split(":").slice(1).join(":");
  return sameSecret(pass, config.adminPassword);
}

function status() {
  const now = new Date();
  const { locked, today } = desired(now);
  return {
    locked,
    doneToday: isDone(missionDate(now, config)),
    today,
    lockTime: config.lockTime,
    mission: mission(),
    streak: streak(now),
    name: (state().profile || {}).name || null,
  };
}

function listReports() {
  const dir = path.join(dataDir, "reports");
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 12)
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  } catch { return []; }
}

function listWishes() {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, "wishes.json"), "utf8")).filter((w) => !w.done).slice(-30).reverse();
  } catch { return []; }
}

function adminState() {
  const recent = Object.entries(state().completions).sort().reverse().slice(0, 21);
  return {
    ...status(),
    router: { mode: router.mode, applied, appliedAt: appliedAt ? new Date(appliedAt).toISOString() : null, error: routerError },
    forceLock: state().forceLock,
    config: { timeZone: config.timeZone, lockTime: config.lockTime, days: config.days },
    episodes: content.episodes.map((e) => ({ id: e.id, title: e.title, done: state().episodesDone.includes(e.id), words: e.words.length })),
    voice: voice.status(),
    reports: listReports(),
    wishes: listWishes(),
    completions: recent,
    log: state().log.slice(-60).reverse(),
  };
}

async function handle(req, res) {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  const post = req.method === "POST";

  // The game's own files (a content pack made on the dev PC): the launcher on his PC looks here at every start.
  if (p.startsWith("/updates/") && req.method === "GET") {
    const name = path.basename(p);
    const file = path.join(dataDir, "updates", name);
    if (!/^[A-Za-z0-9._-]+$/.test(name) || !fs.existsSync(file)) return send(res, 404, { error: "not found" });
    res.writeHead(200, {
      "Content-Type": name.endsWith(".json") ? "application/json" : "application/octet-stream",
      "Content-Length": fs.statSync(file).size, "Cache-Control": "no-cache",
    });
    return fs.createReadStream(file).pipe(res);
  }

  if (p === "/api/status" && req.method === "GET") return send(res, 200, status());

  // The episode to play: the one asked for, else today's new episode, else the last one he finished.
  if (p === "/api/play" && req.method === "GET") {
    const wanted = url.searchParams.get("episode");
    const lastDone = [...state().episodesDone].reverse().find((id) => content.episodes.some((e) => e.id === id));
    const firstReady = content.episodes.find((e) => artReady(e.data)) || content.episodes[0];
    const id = wanted || (nextEpisode() || {}).id || lastDone || firstReady.id;
    const ep = content.episodes.find((e) => e.id === id);
    if (!ep) return send(res, 404, { error: "unknown episode" });
    return send(res, 200, { episode: ep.data, dictionary: content.DICT, chosen: chosenArt(ep.data),
      profile: { name: (state().profile || {}).name || null } });
  }

  // The hero's name, typed in the prologue. Kept here so new episodes can use it and their voices are made
  // before he plays.
  if (p === "/api/profile" && post) {
    const body = await readJson(req);
    const name = String(body.name || "").replace(/[^\p{L} '-]/gu, "").trim().slice(0, 16);
    if (!name) return send(res, 400, { error: "name" });
    state().profile = { ...(state().profile || {}), name };
    store.save();
    store.log(`Hero name: ${name}`);
    prepareVoices();
    return send(res, 200, { name });
  }

  if (p === "/api/episode-done" && post) {
    const { episode } = await readJson(req);
    const ep = content.episodes.find((e) => e.id === episode);
    if (!ep) return send(res, 400, { error: "unknown episode" });
    state().episodeDates = state().episodeDates || {};
    state().episodeDates[missionDate(new Date(), config)] = ep.id;
    if (!state().episodesDone.includes(ep.id)) {
      state().episodesDone.push(ep.id);
      store.log(`Episode finished: ${ep.id} ${ep.title}`);
    }
    return send(res, 200, status());
  }

  if (p === "/api/challenge/start" && post) {
    if (nextEpisode()) return send(res, 409, { error: "episode-first", mission: mission() });
    const played = content.episodes.filter((e) => state().episodesDone.includes(e.id));
    const result = challenges.start(played.flatMap((e) => e.words), Date.now(), weakWords(6));
    return send(res, result.error ? 409 : 200, result);
  }

  if (p === "/api/challenge/answer" && post) {
    const { id, q, choice } = await readJson(req);
    const result = challenges.answer(String(id), Number(q), Number(choice));
    if (result.error) return send(res, 409, result);
    if (result.passed) complete("challenge", result.score);
    return send(res, 200, { ...result, status: result.done ? status() : undefined });
  }

  // ---------- "Something is wrong?" from the game: where he was, what was said, a screenshot
  if (p === "/api/report" && post) {
    const body = await readJson(req, 4 * 1024 * 1024);
    const id = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.join(dataDir, "reports");
    fs.mkdirSync(dir, { recursive: true });
    const clean = (v, n) => String(v == null ? "" : v).slice(0, n);
    const entry = {
      id, at: new Date().toISOString(), episode: clean(body.episode, 20), scene: clean(body.scene, 40),
      goal: clean(body.goal, 40), note: clean(body.note, 400), flags: Object.keys(body.flags || {}).slice(0, 60),
      bag: (body.bag || []).slice(0, 20).map((x) => clean(x, 40)),
      messages: (body.messages || []).slice(-10).map((m) => ({ kind: clean(m.kind, 10), text: clean(m.text, 300) })),
      version: clean(body.version, 20),
    };
    if (body.shot) {
      try { fs.writeFileSync(path.join(dir, `${id}.png`), Buffer.from(String(body.shot), "base64")); entry.hasShot = true; } catch { /* no picture */ }
    }
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(entry, null, 2));
    // keep the last 60
    const old = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().slice(0, -60);
    for (const f of old) { for (const ext of [".json", ".png"]) { try { fs.unlinkSync(path.join(dir, f.replace(".json", ext))); } catch { /* gone */ } } }
    store.log(`Report from the game: ${entry.episode} ${entry.scene}${entry.note ? ` "${entry.note}"` : ""}`);
    return send(res, 200, { ok: true, id });
  }

  // ---------- what he knows about each word (sent by the Godot game)
  if (p === "/api/progress" && req.method === "GET") {
    return send(res, 200, { words: knownWords(), summary: wordSummary() });
  }
  if (p === "/api/progress" && post) {
    const body = await readJson(req, 2 * 1024 * 1024);
    mergeWords(body.words || {});
    store.save();
    return send(res, 200, { summary: wordSummary() });
  }

  // ---------- art worker (the PC with the GPU)
  if (p.startsWith("/api/art/")) {
    if (!isWorker(req)) return send(res, 401, { error: "bad worker token" });
    if (p === "/api/art/hello") {
      if (url.searchParams.has("status")) art.heartbeat(url.searchParams.get("status"));
      return send(res, 200, { ok: true });
    }
    if (p === "/api/art/next" && req.method === "GET") {
      const job = art.next();
      if (!job) {
        // No more work. If the server woke the PC for this, the worker may shut it down.
        const shutdown = wake.mayShutdown();
        if (shutdown) { wake.shutdownSent(); store.log("Pictures done: told the art PC it may shut down"); }
        res.writeHead(204, shutdown ? { "X-EQ-Shutdown": "yes" } : {});
        return res.end();
      }
      store.log(`Art worker took: ${job.key}`);
      return send(res, 200, job);
    }
    if (p === "/api/art/result" && post) {
      const { key, n, raw, pixel } = await readJson(req, 30 * 1024 * 1024);
      art.result(String(key), Number(n), Buffer.from(String(raw), "base64"), Buffer.from(String(pixel), "base64"));
      return send(res, 200, { ok: true });
    }
    if (p === "/api/art/fail" && post) {
      const { key, error } = await readJson(req);
      art.fail(String(key), error);
      store.log(`Art worker failed on ${key}: ${String(error).slice(0, 200)}`);
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: "not found" });
  }

  // A line said by a human-sounding voice: { audio, words } (404 when voices are off: the game uses the browser).
  if (p === "/api/voice" && req.method === "GET") {
    if (!voice.enabled) return send(res, 404, { error: "off" });
    try {
      const text = url.searchParams.get("text"), slow = url.searchParams.get("slow") === "1";
      // wait=0: answer at once ({ audio: null } when the line is not made yet; it is made for next time).
      if (url.searchParams.get("wait") === "0") return send(res, 200, (await voice.ready(text, { slow })) || { audio: null });
      return send(res, 200, await voice.get(text, { slow }));
    } catch (e) {
      return send(res, 503, { error: e.message });
    }
  }
  if (p.startsWith("/voice/") && req.method === "GET") {
    const file = voice.audioPath(p.slice(7));
    if (!file || !fs.existsSync(file)) return send(res, 404, "Not found");
    res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "max-age=31536000, immutable" });
    return fs.createReadStream(file).pipe(res);
  }

  // Music files a parent put in data/music (for example mystery.ogg); the game falls back to its own music.
  if (p.startsWith("/music/") && req.method === "GET") {
    const name = p.slice(7);
    if (!/^[a-z]{2,20}$/.test(name)) return send(res, 404, "Not found");
    for (const [ext, type] of [["ogg", "audio/ogg"], ["mp3", "audio/mpeg"]]) {
      const file = path.join(dataDir, "music", `${name}.${ext}`);
      if (fs.existsSync(file)) {
        res.writeHead(200, { "Content-Type": type, "Cache-Control": "max-age=3600" });
        return fs.createReadStream(file).pipe(res);
      }
    }
    return send(res, 404, "Not found");
  }

  if (p.startsWith("/art/") && req.method === "GET") {
    const file = art.chosenPath(p.slice(5));
    return file ? servePng(res, file) : send(res, 404, "Not found");
  }

  if (p === "/admin" || p.startsWith("/admin/")) {
    if (!config.adminPassword) return send(res, 503, "Set ADMIN_PASSWORD to use the parent page.");
    if (!isAdmin(req)) return send(res, 401, "Password needed", { "WWW-Authenticate": 'Basic realm="English Quest parent"' });
    if (p === "/admin" || p === "/admin/") return serveFile(res, path.join(__dirname, "admin.html"));
    if (p === "/admin/api/state") return send(res, 200, adminState());
    if (p === "/admin/api/canon" && req.method === "GET") return send(res, 200, canon.data);
    if (p === "/admin/api/canon" && post) {
      canon.replace(await readJson(req));
      store.log("The parent edited the story canon");
      return send(res, 200, canon.data);
    }
    if (p.startsWith("/admin/report/") && p.endsWith(".png")) {
      const id = path.basename(p, ".png");
      if (!/^[0-9A-Za-z-]+$/.test(id)) return send(res, 400, { error: "id" });
      const file = path.join(dataDir, "reports", `${id}.png`);
      if (!fs.existsSync(file)) return send(res, 404, { error: "no picture" });
      res.writeHead(200, { "Content-Type": "image/png" });
      return res.end(fs.readFileSync(file));
    }
    if (p === "/admin/api/report/delete" && post) {
      const { id } = await readJson(req);
      if (/^[0-9A-Za-z-]+$/.test(String(id))) {
        for (const ext of [".json", ".png"]) { try { fs.unlinkSync(path.join(dataDir, "reports", `${id}${ext}`)); } catch { /* gone */ } }
      }
      return send(res, 200, adminState());
    }
    if (p === "/admin/api/wish/done" && post) {
      const { episode, text } = await readJson(req);
      const wf = path.join(dataDir, "wishes.json");
      try {
        const all = JSON.parse(fs.readFileSync(wf, "utf8"));
        for (const w of all) if (w.episode === episode && w.text === text) w.done = true;
        fs.writeFileSync(wf, JSON.stringify(all, null, 2));
      } catch { /* none */ }
      return send(res, 200, adminState());
    }
    if (p === "/admin/api/unlock" && post) { complete("parent"); return send(res, 200, adminState()); }
    if (p === "/admin/api/lock" && post) {
      state().forceLock = true;
      store.log("Parent locked Discord");
      store.save();
      await reconcile(true);
      return send(res, 200, adminState());
    }
    if (p === "/admin/api/reset-episodes" && post) {
      state().episodesDone = [];
      store.log("Parent reset the episodes");
      store.save();
      return send(res, 200, adminState());
    }
    if (p === "/admin/api/art") return send(res, 200, art.list());
    if (p === "/admin/api/art/queue" && post) {
      const { keys } = await readJson(req);
      const queued = art.queue(Array.isArray(keys) ? keys.map(String) : null);
      if (queued.length) store.log(`Pictures queued: ${queued.join(", ")}`);
      return send(res, 200, art.list());
    }
    if (p === "/admin/api/episodes") {
      return send(res, 200, {
        writer: writer.list(),
        episodes: content.episodes.map((e) => ({
          id: e.id, title: e.title, done: state().episodesDone.includes(e.id), ready: artReady(e.data), words: e.words.length,
        })),
      });
    }
    if (p === "/admin/api/episodes/write" && post) {
      const { note } = await readJson(req);
      if (writer.list().drafts.some((d) => d.status === "ready")) {
        return send(res, 409, { error: "Approve or reject the waiting draft first" });
      }
      writer.write(String(note || "").slice(0, 500)).catch(() => { /* logged */ });
      await new Promise((r) => setTimeout(r, 100));
      return send(res, 200, { ok: true, writer: writer.list() });
    }
    // The new content pack of the game (body = the .pck file). The launcher on his PC downloads it at its next start.
    if (p === "/admin/api/update/upload" && post) {
      const version = String(url.searchParams.get("version") || "");
      if (!/^[A-Za-z0-9._-]{3,60}$/.test(version)) return send(res, 400, { ok: false, error: "bad version" });
      const dir = path.join(dataDir, "updates");
      fs.mkdirSync(dir, { recursive: true });
      const tmp = path.join(dir, `upload-${Date.now()}.part`);
      const hash = require("crypto").createHash("sha256");
      let size = 0, tooBig = false;
      const out = fs.createWriteStream(tmp);
      req.on("data", (c) => {
        size += c.length;
        if (size > 300 * 1024 * 1024) { tooBig = true; req.destroy(); out.destroy(); return; }
        hash.update(c);
        out.write(c);
      });
      return new Promise((resolve) => {
        req.on("end", () => out.end(() => {
          const sha256 = hash.digest("hex");
          const file = `content-${version}.pck`;
          for (const f of fs.readdirSync(dir)) if (/^content-.*\.pck$/.test(f)) fs.unlinkSync(path.join(dir, f));
          fs.renameSync(tmp, path.join(dir, file));
          fs.writeFileSync(path.join(dir, "manifest.json"),
            JSON.stringify({ version, file, size, sha256, createdAt: new Date().toISOString() }, null, 2));
          store.log(`Game update ${version} uploaded (${(size / 1048576).toFixed(1)} MB)`);
          resolve(send(res, 200, { ok: true, version, size, sha256 }));
        }));
        req.on("close", () => {
          if (tooBig) { try { fs.unlinkSync(tmp); } catch { /* gone */ } resolve(send(res, 413, { ok: false, error: "too big" })); }
        });
      });
    }
    if (p === "/admin/api/episodes/import" && post) {
      let body;
      try { body = await readJson(req, 2_000_000); } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
      try {
        const id = writer.importDraft(body.episode || body, String(body.source || "another computer").slice(0, 60));
        return send(res, 200, { ok: true, id });
      } catch (e) {
        return send(res, 400, { ok: false, error: e.message });
      }
    }
    if (p === "/admin/api/episodes/approve" && post) {
      const { id } = await readJson(req);
      writer.approve(String(id));
      return send(res, 200, { ok: true });
    }
    if (p === "/admin/api/episodes/reject" && post) {
      const { id, note, rewrite } = await readJson(req);
      writer.reject(String(id), String(note || ""));
      if (rewrite) writer.write(String(note || "").slice(0, 500)).catch(() => { /* logged */ });
      return send(res, 200, { ok: true });
    }
    if (p.startsWith("/admin/api/draft/")) {
      const id = p.slice("/admin/api/draft/".length);
      if (!/^s\d+e\d+$/.test(id)) return send(res, 404, { error: "not found" });
      const ep = writer.readDraft(id);
      const dictionary = { ...content.DICT };
      for (const d of ep.dictionary || []) dictionary[d.en] = d.he;
      return send(res, 200, { episode: ep, dictionary, chosen: chosenArt(ep) });
    }
    if (p === "/admin/api/art/locate" && post) {
      const { key } = await readJson(req);
      await writer.placeThings(String(key));
      return send(res, 200, { ok: true });
    }
    if (p === "/admin/api/art/choose" && post) {
      const { key, n } = await readJson(req);
      art.choose(String(key), Number(n));
      return send(res, 200, art.list());
    }
    if (p.startsWith("/admin/art/")) {
      const file = art.variantPath(p.slice(11));
      return file ? servePng(res, file) : send(res, 404, "Not found");
    }
    if (p === "/admin/api/wake" && post) {
      try { await wake.wake("parent pressed the button"); return send(res, 200, { ok: true }); }
      catch (e) { return send(res, 200, { ok: false, output: e.message }); }
    }
    if (p === "/admin/api/test" && post) {
      try { return send(res, 200, { ok: true, output: await router.run(COMMANDS.test) }); }
      catch (e) { return send(res, 200, { ok: false, output: e.message }); }
    }
    return send(res, 404, "Not found");
  }

  if (req.method === "GET") return serveStatic(req, res, p);
  return send(res, 404, "Not found");
}

function servePng(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, "Not found");
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
    res.end(data);
  });
}

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 500, "Missing file");
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)], "Cache-Control": "no-store" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => send(res, 400, { error: e.message }));
});

server.listen(config.port, () => {
  store.log(`Server started on port ${config.port}. Lock at ${config.lockTime} (${config.timeZone}), router: ${router.mode}`);
  reconcile(true);
  setInterval(() => reconcile(), 30 * 1000);
  setInterval(() => wake.tick().catch((e) => store.log(`Wake error: ${e.message}`)), 30 * 1000);
  // Pictures the episodes need are made without waiting for a parent to ask.
  const needed = [...new Set(content.episodes.filter((e) => e.data.format !== "3d").flatMap((e) => (e.data.art || []).map((a) => a.key)))];
  const queued = art.queueNew(needed);
  if (queued.length) store.log(`Pictures queued: ${queued.join(", ")}`);
  placeMadeBackgrounds();
  // Voices: soon, and every 5 minutes (Kokoro may still be starting, or new lines came).
  setTimeout(prepareVoices, 20 * 1000);
  setInterval(prepareVoices, 5 * 60 * 1000);
  // Keep new episodes coming.
  const unplayed = () => content.episodes.filter((e) => !state().episodesDone.includes(e.id)).length;
  if (env.WRITE_TIME) {
    // At a fixed time every day (for example 04:00), once: when fewer than EPISODES_AHEAD episodes are waiting
    // for him, the next one is written. A parent checks it in the morning.
    const writeAt = parseTime(env.WRITE_TIME);
    const writeTick = () => {
      const { date, minutes } = require("./schedule").parts(new Date(), config.timeZone);
      if (minutes >= writeAt && minutes < writeAt + 60 && state().lastWriteDate !== date) {
        state().lastWriteDate = date;
        store.save();
        store.log(`Daily writing time (${env.WRITE_TIME}): ${unplayed()} episodes are waiting for him`);
        writer.maybeWrite(unplayed(), { scheduled: true });
      }
    };
    setInterval(writeTick, 30 * 1000);
    setTimeout(writeTick, 20 * 1000);
  } else {
    setTimeout(() => writer.maybeWrite(unplayed()), 60 * 1000);
    setInterval(() => writer.maybeWrite(unplayed()), 60 * 60 * 1000);
  }
});

module.exports = { server };

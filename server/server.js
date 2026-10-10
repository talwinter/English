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
const { loadContent, ROOT } = require("./content");
const { createArt } = require("./art");
const { createWriter } = require("./writer");
const { createWake } = require("./wake");

const env = process.env;
const config = {
  port: Number(env.PORT || 8080),
  timeZone: env.TIMEZONE || env.TZ || "Asia/Jerusalem",
  lockAt: parseTime(env.LOCK_TIME || "08:00"),
  lockTime: env.LOCK_TIME || "08:00",
  days: parseDays(env.LOCK_DAYS || "0,1,2,3,4,5,6"),
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
// After a new episode is published: load the episodes and words again.
function reloadContent() {
  content = loadContent(dataDir);
  challenges = createChallenges(content.DICT);
}
const wake = createWake({
  wakeAt: env.WAKE_TIME ? parseTime(env.WAKE_TIME) : null, timeZone: config.timeZone, router, art, log: (m) => store.log(m),
});
writer = createWriter({ dataDir, env, getContent: () => content, reload: reloadContent, art, log: (m) => store.log(m) });
if (env.AUTO_CHOOSE_ART !== "false" || env.AUTO_PUBLISH === "true") art.chooseWaiting();

// An episode with AI pictures is ready to play when all its pictures are chosen.
function artReady(ep) {
  const keys = ep.scenes.flatMap((sc) => (String(sc.art).startsWith("ega:") ? [] : [sc.art, ...sc.objects.map((o) => o.sprite)]));
  if (keys.length) keys.push("hero");
  return keys.filter(Boolean).every((k) => art.isChosen(k));
}

// ---------- mission and lock state

const state = () => store.state;
const isDone = (date) => !!state().completions[date];
const desired = (now = new Date()) => shouldLock(now, config, isDone, state().forceLock);

// Today's new episode: the first one he has not finished, if its pictures are ready.
function nextEpisode() {
  const ep = content.episodes.find((e) => !state().episodesDone.includes(e.id));
  return ep && artReady(ep.data) ? ep : null;
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
    const lockDay = config.days.includes(new Date(`${day}T12:00:00Z`).getUTCDay());
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
  };
}

function adminState() {
  const recent = Object.entries(state().completions).sort().reverse().slice(0, 21);
  return {
    ...status(),
    router: { mode: router.mode, applied, appliedAt: appliedAt ? new Date(appliedAt).toISOString() : null, error: routerError },
    forceLock: state().forceLock,
    config: { timeZone: config.timeZone, lockTime: config.lockTime, days: config.days },
    episodes: content.episodes.map((e) => ({ id: e.id, title: e.title, done: state().episodesDone.includes(e.id), words: e.words.length })),
    completions: recent,
    log: state().log.slice(-60).reverse(),
  };
}

async function handle(req, res) {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  const post = req.method === "POST";

  if (p === "/api/status" && req.method === "GET") return send(res, 200, status());

  // The episode to play: the one asked for, else today's new episode, else the last one he finished.
  if (p === "/api/play" && req.method === "GET") {
    const wanted = url.searchParams.get("episode");
    const lastDone = [...state().episodesDone].reverse().find((id) => content.episodes.some((e) => e.id === id));
    const id = wanted || (nextEpisode() || {}).id || lastDone || content.episodes[0].id;
    const ep = content.episodes.find((e) => e.id === id);
    if (!ep) return send(res, 404, { error: "unknown episode" });
    return send(res, 200, { episode: ep.data, dictionary: content.DICT });
  }

  if (p === "/api/episode-done" && post) {
    const { episode } = await readJson(req);
    const ep = content.episodes.find((e) => e.id === episode);
    if (!ep) return send(res, 400, { error: "unknown episode" });
    if (!state().episodesDone.includes(ep.id)) {
      state().episodesDone.push(ep.id);
      store.log(`Episode finished: ${ep.id} ${ep.title}`);
    }
    return send(res, 200, status());
  }

  if (p === "/api/challenge/start" && post) {
    if (nextEpisode()) return send(res, 409, { error: "episode-first", mission: mission() });
    const played = content.episodes.filter((e) => state().episodesDone.includes(e.id));
    const result = challenges.start(played.flatMap((e) => e.words));
    return send(res, result.error ? 409 : 200, result);
  }

  if (p === "/api/challenge/answer" && post) {
    const { id, q, choice } = await readJson(req);
    const result = challenges.answer(String(id), Number(q), Number(choice));
    if (result.error) return send(res, 409, result);
    if (result.passed) complete("challenge", result.score);
    return send(res, 200, { ...result, status: result.done ? status() : undefined });
  }

  // ---------- art worker (the PC with the GPU)
  if (p.startsWith("/api/art/")) {
    if (!isWorker(req)) return send(res, 401, { error: "bad worker token" });
    if (p === "/api/art/hello") return send(res, 200, { ok: true });
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

  if (p.startsWith("/art/") && req.method === "GET") {
    const file = art.chosenPath(p.slice(5));
    return file ? servePng(res, file) : send(res, 404, "Not found");
  }

  if (p === "/admin" || p.startsWith("/admin/")) {
    if (!config.adminPassword) return send(res, 503, "Set ADMIN_PASSWORD to use the parent page.");
    if (!isAdmin(req)) return send(res, 401, "Password needed", { "WWW-Authenticate": 'Basic realm="English Quest parent"' });
    if (p === "/admin" || p === "/admin/") return serveFile(res, path.join(__dirname, "admin.html"));
    if (p === "/admin/api/state") return send(res, 200, adminState());
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
      writer.write(String(note || "").slice(0, 500)).catch(() => { /* logged */ });
      await new Promise((r) => setTimeout(r, 100));
      return send(res, 200, { ok: true, writer: writer.list() });
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
      return send(res, 200, { episode: ep, dictionary });
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
  const needed = [...new Set(["hero", ...content.episodes.flatMap((e) => (e.data.art || []).map((a) => a.key))])];
  const queued = art.queueNew(needed);
  if (queued.length) store.log(`Pictures queued: ${queued.join(", ")}`);
  // Keep new episodes coming.
  const unplayed = () => content.episodes.filter((e) => !state().episodesDone.includes(e.id)).length;
  setTimeout(() => writer.maybeWrite(unplayed()), 60 * 1000);
  setInterval(() => writer.maybeWrite(unplayed()), 60 * 60 * 1000);
});

module.exports = { server };

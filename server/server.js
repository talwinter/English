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

const env = process.env;
const config = {
  port: Number(env.PORT || 8080),
  timeZone: env.TIMEZONE || env.TZ || "Asia/Jerusalem",
  lockAt: parseTime(env.LOCK_TIME || "08:00"),
  lockTime: env.LOCK_TIME || "08:00",
  days: parseDays(env.LOCK_DAYS || "0,1,2,3,4,5,6"),
  adminPassword: env.ADMIN_PASSWORD || "",
};

const store = createStore(env.DATA_DIR || path.join(ROOT, "data"));
const router = createRouter(env, (m) => store.log(m));
const content = loadContent();
const challenges = createChallenges(content.DICT);

// ---------- mission and lock state

const state = () => store.state;
const isDone = (date) => !!state().completions[date];
const desired = (now = new Date()) => shouldLock(now, config, isDone, state().forceLock);

function nextEpisode() {
  return content.episodes.find((e) => !state().episodesDone.includes(e.id)) || null;
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

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 10000) { reject(new Error("too big")); req.destroy(); } });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("bad json")); } });
  });
}

function isAdmin(req) {
  if (!config.adminPassword) return false;
  const [type, value] = (req.headers.authorization || "").split(" ");
  if (type !== "Basic" || !value) return false;
  const pass = Buffer.from(value, "base64").toString().split(":").slice(1).join(":");
  const a = crypto.createHash("sha256").update(pass).digest();
  const b = crypto.createHash("sha256").update(config.adminPassword).digest();
  return crypto.timingSafeEqual(a, b);
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
    if (p === "/admin/api/test" && post) {
      try { return send(res, 200, { ok: true, output: await router.run(COMMANDS.test) }); }
      catch (e) { return send(res, 200, { ok: false, output: e.message }); }
    }
    return send(res, 404, "Not found");
  }

  if (req.method === "GET") return serveStatic(req, res, p);
  return send(res, 404, "Not found");
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
});

module.exports = { server };

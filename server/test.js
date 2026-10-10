// Run: node --test server/
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const { shouldLock, missionDate, parseTime } = require("./schedule");
const { createChallenges } = require("./challenge");
const { loadContent } = require("./content");

// ---------- lock schedule (Israel time; 2026-10-11 is a Sunday)
const cfg = { timeZone: "Asia/Jerusalem", lockAt: parseTime("08:00"), days: [0, 1, 2, 3, 4, 5, 6] };
const at = (iso) => new Date(iso); // times below are UTC; Israel is UTC+3 in October
const done = (...dates) => (d) => dates.includes(d);

test("locks at 08:00 when today's mission is not done", () => {
  assert.equal(shouldLock(at("2026-10-11T04:59:00Z"), cfg, done("2026-10-10")).locked, false); // 07:59
  assert.equal(shouldLock(at("2026-10-11T05:00:00Z"), cfg, done("2026-10-10")).locked, true);  // 08:00
});

test("opens when the mission is done, until the next morning", () => {
  assert.equal(shouldLock(at("2026-10-11T12:00:00Z"), cfg, done("2026-10-11")).locked, false);
  assert.equal(shouldLock(at("2026-10-11T22:30:00Z"), cfg, done("2026-10-11")).locked, false); // 01:30 next day
  assert.equal(shouldLock(at("2026-10-12T05:00:00Z"), cfg, done("2026-10-11")).locked, true);  // next day 08:00
});

test("stays locked overnight if he did not finish", () => {
  assert.equal(shouldLock(at("2026-10-11T23:00:00Z"), cfg, done()).locked, true); // 02:00
});

test("a mission done before 08:00 counts for that day", () => {
  const isDone = done("2026-10-11");
  assert.equal(missionDate(at("2026-10-11T04:00:00Z"), cfg), "2026-10-11"); // 07:00
  assert.equal(shouldLock(at("2026-10-11T04:01:00Z"), cfg, isDone).locked, false);
  assert.equal(shouldLock(at("2026-10-11T09:00:00Z"), cfg, isDone).locked, false);
});

test("no lock on days that are not lock days", () => {
  const weekdays = { ...cfg, days: [0, 1, 2, 3, 4] }; // Sunday to Thursday
  assert.equal(shouldLock(at("2026-10-16T09:00:00Z"), weekdays, done()).locked, false); // Friday
  assert.equal(shouldLock(at("2026-10-15T09:00:00Z"), weekdays, done()).locked, true);  // Thursday
});

test("parent lock wins", () => {
  assert.equal(shouldLock(at("2026-10-11T12:00:00Z"), cfg, done("2026-10-11"), true).locked, true);
});

// ---------- challenge
test("challenge: 8 questions, server keeps the answers, 6 right pass", () => {
  const { DICT, episodes } = loadContent();
  const c = createChallenges(DICT);
  const ch = c.start(episodes[0].words, 0);
  assert.equal(ch.questions.length, 8);
  assert.ok(!JSON.stringify(ch).includes('"answer"'), "answers must not be sent");
  let last;
  for (let q = 0; q < 8; q++) {
    const question = ch.questions[q];
    // Answer the first 6 right and the last 2 wrong.
    const right = question.type === "en-he"
      ? question.options.indexOf(DICT[question.prompt])
      : question.options.findIndex((w) => DICT[w] === question.prompt);
    last = c.answer(ch.id, q, q < 6 ? right : (right + 1) % 4, 0);
    assert.equal(last.correct, q < 6);
  }
  assert.deepEqual([last.done, last.passed, last.score], [true, true, 6]);
});

test("challenge: failing makes him wait 15 seconds, answers must be in order", () => {
  const { DICT, episodes } = loadContent();
  const c = createChallenges(DICT);
  const ch = c.start(episodes[0].words, 0);
  assert.equal(c.answer(ch.id, 3, 0, 0).error, "order");
  for (let q = 0; q < 8; q++) c.answer(ch.id, q, -1, 0);
  assert.equal(c.start(episodes[0].words, 5000).error, "wait");
  assert.ok(c.start(episodes[0].words, 16000).id);
});

// ---------- whole server with a fake ssh
test("server: locks through ssh, opens after the challenge", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eq-"));
  const calls = path.join(dir, "ssh-calls.txt");
  const fakeSsh = path.join(dir, "ssh");
  fs.writeFileSync(fakeSsh, `#!/bin/sh\nfor last; do :; done\necho "$last" >> "${calls}"\necho ok\n`, { mode: 0o755 });
  const port = 18000 + Math.floor(Math.random() * 1000);
  const proc = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: {
      ...process.env, PORT: String(port), DATA_DIR: dir, LOCK_TIME: "00:00", ADMIN_PASSWORD: "pw",
      ROUTER_MODE: "ssh", ROUTER_HOST: "router.test", SSH_BIN: fakeSsh,
    },
    stdio: "ignore",
  });
  const base = `http://localhost:${port}`;
  const get = async (p, opts) => { const r = await fetch(base + p, opts); return { status: r.status, body: await r.json().catch(() => null) }; };
  const post = (p, body) => get(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  try {
    for (let i = 0; i < 50; i++) {
      try { await fetch(base + "/api/status"); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    let s = (await get("/api/status")).body;
    assert.equal(s.locked, true);
    assert.equal(s.mission.type, "episode");
    await new Promise((r) => setTimeout(r, 300));
    assert.match(fs.readFileSync(calls, "utf8"), /eq-block/);

    assert.equal((await post("/api/challenge/start")).body.error, "episode-first");
    assert.equal((await post("/api/episode-done", { episode: "s1e1" })).body.mission.type, "challenge");

    const { DICT } = loadContent();
    const ch = (await post("/api/challenge/start")).body;
    let res;
    for (let q = 0; q < ch.questions.length; q++) {
      const x = ch.questions[q];
      const right = x.type === "en-he" ? x.options.indexOf(DICT[x.prompt]) : x.options.findIndex((w) => DICT[w] === x.prompt);
      res = (await post("/api/challenge/answer", { id: ch.id, q, choice: right })).body;
    }
    assert.equal(res.passed, true);
    assert.equal(res.status.locked, false);
    await new Promise((r) => setTimeout(r, 300));
    assert.match(fs.readFileSync(calls, "utf8"), /eq-unblock/);

    // Server files and data are not public; the parent page needs the password.
    assert.equal((await fetch(base + "/server/server.js")).status, 404);
    assert.equal((await fetch(base + "/data/state.json")).status, 404);
    assert.equal((await fetch(base + "/../server/server.js")).status, 404);
    assert.equal((await fetch(base + "/admin")).status, 401);
    const auth = { headers: { Authorization: "Basic " + Buffer.from("x:pw").toString("base64") } };
    assert.equal((await fetch(base + "/admin/api/state", auth)).status, 200);
    assert.equal((await fetch(base + "/index.html")).status, 200);
  } finally {
    proc.kill();
  }
});

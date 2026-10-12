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

test("LOCK_ENABLED=false: no daily lock, but the parent can still lock", () => {
  const off = { ...cfg, enabled: false };
  assert.equal(shouldLock(at("2026-10-11T05:00:00Z"), off, done()).locked, false);  // 08:00, not done
  assert.equal(shouldLock(at("2026-10-11T23:00:00Z"), off, done()).locked, false);  // 02:00 overnight
  assert.equal(shouldLock(at("2026-10-11T12:00:00Z"), off, done(), true).locked, true);
});

test("parent lock wins", () => {
  assert.equal(shouldLock(at("2026-10-11T12:00:00Z"), cfg, done("2026-10-11"), true).locked, true);
});

// ---------- layout builder (rooms from the catalog)
const { layoutScene } = require("./layout");
const fakeCatalog = {
  props: {
    table: { footprint: [2, 0.9], height: 0.8, surface: true, surface_height: 0.8, stand: 0.6, place: ["floor"] },
    chest: { footprint: [1, 0.7], height: 0.6, container: true, inside_height: 0.4, stand: 0.6, place: ["floor"] },
    rock: { footprint: [1.5, 1.1], height: 0.8, stand: 0.6, place: ["floor"] },
    key: { footprint: [0.3, 0.1], height: 0.05, stand: 0.5, place: ["floor", "surface"] },
    house: { footprint: [4, 2.5], height: 3, stand: 0.8, place: ["floor"], parts: { door: { center: [0, -1.3], size: [1, 0.4, 1.7] } } },
  },
};
const room = { id: "room", floor: [-4, -2, 4, 3], spawn: [0, -1.4], walls: { back: 3 }, blocked: [], slots: {}, fixed: [] };

test("layout: nothing overlaps, everything has a place to stand that can be reached", () => {
  const r = layoutScene(room, [
    { id: "house", prop: "house", where: "back_left", against: "back" },
    { id: "door", of: "house", part: "door" },
    { id: "table", prop: "table", where: "center" },
    { id: "key", prop: "key", on: "table" },
    { id: "rock", prop: "rock", where: "front_right" },
  ], fakeCatalog);
  assert.deepEqual(r.errors, []);
  const rects = r.map.rects.filter((x) => !x.id.includes(":"));
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i].rect, b = rects[j].rect;
    assert.ok(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], `${rects[i].id} overlaps ${rects[j].id}`);
  }
  for (const id of ["house", "door", "table", "key", "rock"]) assert.ok(r.objects[id].stand, `${id} has a place to stand`);
  assert.equal(r.objects.key.parent, "table");
  assert.ok(r.objects.key.z >= 0.8, "the key lies on the table top");
  assert.ok(r.objects.house.y > r.objects.table.y, "the house stands against the back wall");
});

test("layout: too many big things is reported in words, for the repair loop", () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ id: `h${i}`, prop: "house", where: "center" }));
  const r = layoutScene(room, many, fakeCatalog);
  assert.ok(r.errors.some((e) => /no room for it/.test(e)), r.errors.join("; "));
});

test("layout: a thing behind a closed-off part of the room is found unreachable", () => {
  const split = { ...room, blocked: [[-4, 0.3, 4, 0.6]] };    // a river across the whole room
  const r = layoutScene(split, [{ id: "chest", prop: "chest", where: "back_center", against: "back" }], fakeCatalog);
  assert.ok(r.errors.some((e) => /can not be reached/.test(e)), r.errors.join("; "));
});

test("layout: unknown prop and unknown part are reported", () => {
  const r = layoutScene(room, [{ id: "x", prop: "unicorn", where: "center" }], fakeCatalog);
  assert.ok(r.errors.some((e) => /no prop "unicorn"/.test(e)));
});

// ---------- the 3D writer: rooms and props from the catalog, layout problems go back to the writer
test("writer 3d: a layout problem is repaired, wishes are kept, the episode gets positions", async () => {
  const http = require("http");
  const example = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "catalog", "example-episode.json"), "utf8"));
  const good = JSON.parse(JSON.stringify(example));
  good.id = "s1e3";
  good.wishes = [{ kind: "cutscene", text: "the wolf howls at the moon" }];
  good.dictionary = [{ en: "wolf", he: "זאב" }];
  const bad = JSON.parse(JSON.stringify(good));
  // too many big things in one small room
  const outside = bad.scenes[0];
  for (let i = 0; i < 6; i++) outside.objects.push({ id: `h${i}`, name: "the house", words: ["house"], look: "A house.", prop: "house_viking", where: "center", visible: {} });
  let calls = 0;
  const seenSchemas = [];
  const fake = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const q = JSON.parse(body);
      if (q.response_format.json_schema.name === "translations") {   // the small "missing words" question: nothing to add
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ words: [] }) } }], usage: { total_tokens: 1 } }));
      }
      calls++;
      seenSchemas.push(q.response_format.json_schema.schema.properties.scenes.items.properties.shell ? "3d" : "2d");
      assert.match(q.messages[1].content, /CANON/);
      assert.match(q.messages[1].content, /THE SERIES has 49 episodes/);
      assert.match(q.messages[0].content, /ROOMS AND THINGS/);
      const answer = calls === 1 ? bad : good;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }], usage: { total_tokens: 500 } }));
    });
  });
  await new Promise((r) => fake.listen(0, r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eq-writer3d-"));
  const port = 19000 + Math.floor(Math.random() * 1000);
  const proc = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, ADMIN_PASSWORD: "pw", ROUTER_MODE: "mock",
      OPENAI_API_KEY: "test", OPENAI_BASE_URL: `http://localhost:${fake.address().port}/v1`, AUTO_WRITE: "false" },
    stdio: "ignore",
  });
  const base = `http://localhost:${port}`;
  const auth = { Authorization: "Basic " + Buffer.from("x:pw").toString("base64"), "Content-Type": "application/json" };
  const admin = async (p, b) => (await fetch(base + p, b ? { method: "POST", headers: auth, body: JSON.stringify(b) } : { headers: auth })).json();
  try {
    for (let i = 0; i < 50; i++) {
      try { await fetch(base + "/api/status"); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    await admin("/admin/api/episodes/write", {});
    let w;
    for (let i = 0; i < 80; i++) {
      w = (await admin("/admin/api/episodes")).writer;
      if (w.drafts[0] && w.drafts[0].status !== "writing") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const d = w.drafts[0];
    assert.equal(d.status, "ready", JSON.stringify(d.errors));
    assert.equal(calls, 2, "the first answer had no room for six houses, so it asks again");
    assert.deepEqual(seenSchemas, ["3d", "3d"]);
    assert.ok(d.stages.some((s) => s.what === "repair"));
    assert.equal(d.wishes[0].kind, "cutscene");
    const draft = (await admin("/admin/api/draft/s1e3")).episode;
    const house = draft.scenes[0].objects.find((o) => o.id === "house");
    assert.ok(house.at && typeof house.at.x === "number", "the layout put the house somewhere");
    assert.equal(draft.format, "3d");
    const wishes = JSON.parse(fs.readFileSync(path.join(dir, "wishes.json"), "utf8"));
    assert.equal(wishes.length, 1);
  } finally {
    proc.kill();
    fake.close();
  }
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
    // The prologue waits for its pictures; Episode 1 can be played with its old drawings meanwhile.
    assert.equal(s.mission.episode, "s1e1");
    const play = (await get("/api/play")).body;
    assert.equal(play.episode.id, "s1e1");
    assert.deepEqual(play.chosen, []);
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

test("built-in episodes use the places found in their AI pictures", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eq-ov-"));
  fs.mkdirSync(path.join(dir, "episodes", "overrides"), { recursive: true });
  fs.writeFileSync(path.join(dir, "episodes", "overrides", "s1e1.json"), JSON.stringify({
    scenes: { outside: { floor: { y0: 140, y1: 196 }, entry: { x: 150, y: 180 }, boxes: { door: [1, 2, 3, 4] } } },
  }));
  const sc = loadContent(dir).episodes.find((e) => e.id === "s1e1").data.scenes.find((x) => x.id === "outside");
  assert.equal(sc.floor.y0, 140);
  assert.deepEqual(sc.objects.find((o) => o.id === "door").box, [1, 2, 3, 4]);
  assert.equal(sc.fallbackArt, "ega:outside");
});

// ---------- picture queue
test("art queue: worker takes jobs, sends 3 versions, parent picks one", () => {
  const { createArt } = require("./art");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eq-art-"));
  const art = createArt(dir, { episodeShots: () => [{ key: "village", kind: "background", prompt: "a village", episode: "s1e1" }] });
  assert.equal(art.next(), null);
  // Without keys only needed pictures are made (the ones episodes use); optional ones by name.
  assert.deepEqual(art.queue(), ["village"]);
  const queued = art.queue(["village", "byte"]);
  assert.deepEqual([...queued].sort(), ["byte", "village"]);
  assert.equal(art.list().shots.find((x) => x.key === "byte").needed, false);
  const job = art.next(0);
  assert.equal(job.key, queued[0]);
  assert.match(job.prompt, /King's Quest V/);
  // Another worker does not get the same job while the first one works on it...
  assert.notEqual(art.next(1000).key, job.key);
  // ...but gets it if the first one disappears for 30 minutes.
  assert.equal(art.next(31 * 60 * 1000).key, job.key);
  const png = Buffer.from("89504e470d0a1a0a0000", "hex");
  assert.throws(() => art.result(job.key, 0, Buffer.from("nope"), png), /PNG/);
  assert.throws(() => art.result("../evil", 0, png, png), /bad result/);
  for (let n = 0; n < 3; n++) art.result(job.key, n, png, png);
  assert.equal(art.list().shots.find((s) => s.key === job.key).status, "done");
  art.choose(job.key, 1);
  assert.ok(fs.existsSync(path.join(dir, "art", "chosen", `${job.key}.png`)));
  assert.equal(art.variantPath("../art.json"), null);
  assert.equal(art.chosenPath("x/../../state.json"), null);
});

// ---------- episode writer with a fake OpenAI
test("writer: writes, fixes problems, waits for approval, places things in pictures", async () => {
  const http = require("http");
  const { loadContent } = require("./content");
  const s1e2 = loadContent().episodes.find((e) => e.id === "s1e2").data;
  const rename = { "forest-tree": "test-forest", "bear-cave": "test-cave", "char-father": "test-father", "char-bear": "test-bear", "item-berries": "test-berries", "item-rope": "test-rope" };
  const make = (fixed) => {
    const ep = JSON.parse(JSON.stringify(s1e2).replace(/"(forest-tree|bear-cave|char-father|char-bear|item-berries|item-rope)"/g, (m, k) => `"${rename[k]}"`));
    ep.id = "s9e9"; // the writer must replace it with the right id
    ep.title = "The Dark Forest";
    ep.scenes[0].objects[0].look = "It is a small bush. A lantern is next to it.";
    if (fixed) ep.dictionary.push({ en: "Lantern", he: "פנס" });
    // Fill the fields the schema always has
    const cond = (c) => ({ flags: [], notFlags: [], has: [], notHas: [], ...(c || {}) });
    const eff = (d) => ({ set: [], unset: [], add: [], remove: [], goal: null, go: null, finish: false, ...(d || {}) });
    const rule = (r) => ({ obj: null, item: null, points: 0, pointsId: null, ...r, when: cond(r.when), do: eff(r.do) });
    ep.scenes.forEach((sc) => { sc.rules = sc.rules.map(rule); sc.objects.forEach((o) => { o.visible = cond(o.visible); }); });
    ep.globalRules = ep.globalRules.map(rule);
    return ep;
  };
  let episodeCalls = 0, hotspotCalls = 0;
  const fake = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const q = JSON.parse(body);
      const name = q.response_format.json_schema.name;
      let answer;
      if (name === "translations") {
        answer = { words: [] };
      } else if (name === "episode") {
        episodeCalls++;
        assert.match(q.messages[1].content, /STORY SO FAR:[\s\S]*Into the Forest/);
        answer = make(episodeCalls > 1);
      } else {
        hotspotCalls++;
        answer = { objects: [{ id: "tree", found: true, left: 0.25, top: 0.6, right: 0.75, bottom: 0.8 }], groundTop: 0.72, groundBottom: 0.98 };
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }], usage: { total_tokens: 1000 } }));
    });
  });
  await new Promise((r) => fake.listen(0, r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eq-writer-"));
  const port = 19000 + Math.floor(Math.random() * 1000);
  const proc = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: {
      ...process.env, PORT: String(port), DATA_DIR: dir, ADMIN_PASSWORD: "pw", WORKER_TOKEN: "tok", ROUTER_MODE: "mock",
      OPENAI_API_KEY: "test", OPENAI_BASE_URL: `http://localhost:${fake.address().port}/v1`, AUTO_WRITE: "false",
      AUTO_CHOOSE_ART: "false", EPISODE_FORMAT: "2d",
    },
    stdio: "ignore",
  });
  const base = `http://localhost:${port}`;
  const auth = { Authorization: "Basic " + Buffer.from("x:pw").toString("base64"), "Content-Type": "application/json" };
  const admin = async (p, body) => (await fetch(base + p, body ? { method: "POST", headers: auth, body: JSON.stringify(body) } : { headers: auth })).json();
  const worker = (p, body) => fetch(base + p, { method: "POST", headers: { Authorization: "Bearer tok", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    for (let i = 0; i < 50; i++) {
      try { await fetch(base + "/api/status"); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    await admin("/admin/api/episodes/write", { note: "more jokes" });
    let w;
    for (let i = 0; i < 50; i++) {
      w = (await admin("/admin/api/episodes")).writer;
      if (w.drafts[0] && w.drafts[0].status !== "writing") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const draft = w.drafts[0];
    // The hero's name is kept, cleaned, and sent with the episode.
    const prof = await (await fetch(base + "/api/profile", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "  Alex<>  " }),
    })).json();
    assert.equal(prof.name, "Alex");
    const played = await (await fetch(base + "/api/play?episode=s1e0")).json();
    assert.equal(played.profile.name, "Alex");
    assert.equal((await (await fetch(base + "/api/status")).json()).name, "Alex");

    // Word progress is merged (the larger counts win, "known" sticks) and the hard words are found.
    const post = (body) => fetch(base + "/api/progress", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then((r) => r.json());
    await post({ words: { cable: { seen: 3, looked: 4, right: 0, wrong: 2, box: 0, known: false } } });
    const merged = await post({ words: { cable: { seen: 2, looked: 1, right: 0, wrong: 0, box: 0, known: false },
      disk: { seen: 1, looked: 0, right: 3, wrong: 0, box: 3, known: false } } });
    assert.equal(merged.summary.met, 2);
    assert.equal(merged.summary.mastered, 1);
    assert.deepEqual(merged.summary.weak, ["cable"]);
    const kept = (await (await fetch(base + "/api/progress")).json()).words.cable;
    assert.equal(kept.seen, 3);
    assert.equal(kept.looked, 4);
    assert.equal(draft.id, "s1e3");
    assert.equal(draft.status, "ready", JSON.stringify(draft.errors));
    assert.equal(episodeCalls, 2, "the first answer had a word without Hebrew, so it asks again");
    assert.ok(draft.newWords.includes("lantern"));
    assert.ok(draft.steps.length >= 6);

    // The parent can try the draft; the pictures were queued already.
    const preview = await admin("/admin/api/draft/s1e3");
    assert.equal(preview.episode.id, "s1e3");
    assert.equal(preview.dictionary.lantern, "פנס");
    const shots = (await admin("/admin/api/art")).shots.map((s) => s.key);
    assert.ok(shots.includes("test-forest") && shots.includes("test-bear"));

    // Approve: now it is published.
    await admin("/admin/api/episodes/approve", { id: "s1e3" });
    const play = await (await fetch(base + "/api/play?episode=s1e3")).json();
    assert.equal(play.episode.title, "The Dark Forest");

    // The worker sends the background, the parent chooses it, and the things are found in the picture.
    const png = Buffer.from(
      "89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
    let job;
    for (let i = 0; i < 30 && (!job || job.key !== "test-forest"); i++) {
      const r = await fetch(base + "/api/art/next", { headers: { Authorization: "Bearer tok" } });
      job = r.status === 200 ? await r.json() : null;
      if (job && job.key !== "test-forest") for (let n = 0; n < 3; n++) await worker("/api/art/result", { key: job.key, n, raw: png.toString("base64"), pixel: png.toString("base64") });
    }
    assert.equal(job.key, "test-forest");
    for (let n = 0; n < 3; n++) await worker("/api/art/result", { key: "test-forest", n, raw: png.toString("base64"), pixel: png.toString("base64") });
    await admin("/admin/api/art/choose", { key: "test-forest", n: 1 });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(hotspotCalls, 1);
    const after = await (await fetch(base + "/api/play?episode=s1e3")).json();
    const forest = after.episode.scenes.find((sc) => sc.id === "forest");
    assert.deepEqual(forest.objects.find((o) => o.id === "tree").box, [80, 120, 160, 40]);
    assert.deepEqual(forest.floor, { y0: 144, y1: 196 });
  } finally {
    proc.kill();
    fake.close();
  }
});

test("server: a built-in background made before its scene existed gets its things placed on start", async () => {
  const http = require("http");
  let asked = [];
  const fake = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      asked.push(JSON.parse(body).response_format.json_schema.name);
      const answer = {
        objects: [{ id: "computer", found: true, left: 0.5, top: 0.4, right: 0.75, bottom: 0.7 }],
        floorOutline: [{ x: 0.1, y: 0.75 }, { x: 0.9, y: 0.75 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
        personHeight: 0.4, groundTop: 0.75, groundBottom: 0.98,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }], usage: { total_tokens: 10 } }));
    });
  });
  await new Promise((r) => fake.listen(0, r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eq-place-"));
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
  fs.mkdirSync(path.join(dir, "art", "variants"), { recursive: true });
  fs.writeFileSync(path.join(dir, "art", "variants", "attic-0-raw.png"), png);
  fs.writeFileSync(path.join(dir, "art", "art.json"), JSON.stringify({ jobs: { attic: { status: "done", variants: [0], chosen: 0 } } }));
  const port = 17000 + Math.floor(Math.random() * 1000);
  const run = () => spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, ROUTER_MODE: "mock", AUTO_WRITE: "false",
      OPENAI_API_KEY: "test", OPENAI_BASE_URL: `http://localhost:${fake.address().port}/v1` },
    stdio: "ignore",
  });
  const waitUp = async () => {
    for (let i = 0; i < 50; i++) {
      try { await fetch(`http://localhost:${port}/api/status`); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
  };
  let proc = run();
  try {
    await waitUp();
    for (let i = 0; i < 30 && !fs.existsSync(path.join(dir, "episodes", "overrides", "s1e0.json")); i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(asked.length, 1);
    const play = await (await fetch(`http://localhost:${port}/api/play?episode=s1e0`)).json();
    const attic = play.episode.scenes.find((sc) => sc.id === "attic");
    assert.deepEqual(attic.objects.find((o) => o.id === "computer").box, [160, 80, 80, 60]);
    assert.deepEqual(attic.floor, { y0: 150, y1: 198 });
    assert.deepEqual(attic.walk, [[32, 150], [288, 150], [320, 200], [0, 200]]);
    assert.equal(attic.heroHeight, 80);
    // Things lying on the floor were moved onto it; where he comes in is on the floor.
    const Walk = require("../js/walk");
    const cable = attic.objects.find((o) => o.id === "cable").box;
    assert.ok(Walk.inside(attic.walk, cable[0] + cable[2] / 2, cable[1] + cable[3] - 0.5));
    assert.ok(Walk.inside(attic.walk, attic.entry.x, attic.entry.y));
    // Next start: already placed, OpenAI is not asked again.
    proc.kill();
    await new Promise((r) => setTimeout(r, 200));
    proc = run();
    await waitUp();
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(asked.length, 1);
  } finally {
    proc.kill();
    fake.close();
  }
});

// ---------- Wake-on-LAN for the art PC
test("wake: at 05:00 only when pictures wait, once a day, retries once, then allows shutdown", async () => {
  const { createWake } = require("./wake");
  const commands = [];
  let pending = 3, seen = 0;
  const wake = createWake({
    wakeAt: parseTime("05:00"), timeZone: "Asia/Jerusalem",
    router: { run: async (c) => { commands.push(c); } },
    art: { pendingCount: () => pending, workerSeenAt: () => seen },
    log: () => {},
  });
  // 2026-10-11 04:59 and 05:00 Israel time (UTC+3)
  await wake.tick(new Date("2026-10-11T01:59:00Z"));
  assert.equal(commands.length, 0);
  await wake.tick(new Date("2026-10-11T02:00:00Z"));
  assert.deepEqual(commands, ["/system script run eq-wake"]);
  await wake.tick(new Date("2026-10-11T02:01:00Z"));
  assert.equal(commands.length, 1, "only once a day");
  assert.equal(wake.mayShutdown(Date.parse("2026-10-11T02:05:00Z")), true);
  wake.shutdownSent();
  assert.equal(wake.mayShutdown(Date.parse("2026-10-11T02:05:00Z")), false, "the shutdown signal is sent once");

  // No pictures waiting: don't wake.
  pending = 0;
  await wake.tick(new Date("2026-10-12T02:00:00Z"));
  assert.equal(commands.length, 1);
});

test("wake: wakes again once if the PC did not answer in 20 minutes", async () => {
  const { createWake } = require("./wake");
  const commands = [];
  const wake = createWake({
    wakeAt: parseTime("05:00"), timeZone: "Asia/Jerusalem",
    router: { run: async (c) => { commands.push(c); } },
    art: { pendingCount: () => 2, workerSeenAt: () => 0 },
    log: () => {},
  });
  await wake.tick(new Date("2026-10-11T02:00:00Z"));
  await wake.tick(new Date("2026-10-11T02:10:00Z"));
  assert.equal(commands.length, 1);
  await wake.tick(new Date("2026-10-11T02:21:00Z"));
  assert.equal(commands.length, 2);
  await wake.tick(new Date("2026-10-11T02:45:00Z"));
  assert.equal(commands.length, 2, "only one retry");
});

test("art: by default one version per picture, used automatically", () => {
  const { createArt } = require("./art");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eq-art1-"));
  const chosen = [];
  const art = createArt(dir, { autoChoose: true, versions: 1, onChosen: (k) => chosen.push(k) });
  art.queue(["byte"]);
  const job = art.next(0);
  assert.equal(job.variants, 1);
  const png = Buffer.from("89504e470d0a1a0a0000", "hex");
  art.result("byte", 0, png, png);
  assert.equal(art.isChosen("byte"), true);
  assert.deepEqual(chosen, ["byte"]);
  assert.throws(() => art.result("byte", 1, png, png), /bad result/);
});

test("writer: refuses a new episode while a draft waits for the parent", async () => {
  const { createWriter } = require("./writer");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eq-wait-"));
  fs.mkdirSync(path.join(dir, "episodes"), { recursive: true });
  fs.writeFileSync(path.join(dir, "episodes", "index.json"), JSON.stringify({ published: [], drafts: [{ id: "s1e3", status: "ready" }] }));
  const { loadContent } = require("./content");
  const writer = createWriter({ dataDir: dir, env: { OPENAI_API_KEY: "x" }, getContent: () => loadContent(), reload: () => {},
    art: { list: () => ({ shots: [] }), queueNew: () => [] }, log: () => {} });
  await assert.rejects(writer.write(), /waiting draft/);
});

// ---------- voices with a fake Kokoro
test("voices: each character has a voice, lines are made once, word times when Kokoro has them", async () => {
  const http = require("http");
  const { createVoice } = require("./voice");
  const calls = [];
  let captions = true;
  const fake = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const b = body ? JSON.parse(body) : null;
      calls.push({ path: req.url, body: b });
      const sound = Buffer.alloc(300, 7);
      if (req.url === "/v1/audio/voices") return res.end(JSON.stringify({ voices: ["af_heart", "am_puck", "bf_emma"] }));
      if (req.url === "/dev/captioned_speech" && captions) {
        const words = b.input.split(/\s+/).flatMap((w, i) => [{ word: w.replace(/\W/g, ""), start_time: i * 0.4, end_time: i * 0.4 + 0.3 }, { word: ",", start_time: 0, end_time: 0 }]);
        return res.end(JSON.stringify({ audio: sound.toString("base64"), audio_format: "mp3", timestamps: words }));
      }
      if (req.url === "/v1/audio/speech") return res.end(sound);
      res.statusCode = 404;
      res.end("not found");
    });
  });
  await new Promise((r) => fake.listen(0, r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eq-voice-"));
  const voice = createVoice({ dataDir: dir, url: `http://localhost:${fake.address().port}/v1` });
  try {
    const a = await voice.get('Byte: "Hello, Noam!"');
    const made = calls.filter((c) => c.body);
    assert.equal(made[0].body.voice, "am_puck");
    assert.equal(made[0].body.input, "Hello, Noam!");
    assert.deepEqual(a.words, [[0, 0.3], [0.4, 0.7]]);
    assert.ok(fs.existsSync(voice.audioPath(a.audio.slice(7))));
    // The same line again comes from the file.
    assert.deepEqual(await voice.get('Byte: "Hello, Noam!"'), a);
    assert.equal(calls.filter((c) => c.body).length, 1);
    // The narrator says everything else; ALL CAPS words are read as words; a voice Kokoro lacks -> narrator.
    await voice.get('The screen says: "TYPE YOUR NAME".');
    assert.equal(calls.at(-1).body.voice, "af_heart");
    assert.equal(calls.at(-1).body.input, 'The screen says: "Type Your Name".');
    await voice.get('Queen: "Welcome."');
    assert.equal(calls.at(-1).body.voice, "af_heart");
    // Older Kokoro without word times: plain speech.
    captions = false;
    const b = await voice.get("Grandmother: \"Take the bread.\"", { slow: true });
    assert.equal(calls.at(-1).path, "/v1/audio/speech");
    assert.equal(calls.at(-1).body.voice, "bf_emma");
    assert.equal(calls.at(-1).body.speed, 0.8);
    assert.equal(b.words, null);
    // Lines made ahead of time.
    assert.equal(voice.prepare([{ text: "It is cold." }, { text: "Hello, {name}!" }, { text: "Byte: \"Hello, Noam!\"" }]), 1);
    for (let i = 0; i < 50 && voice.status().waiting; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(voice.status().ready, 5);
    // Asking without waiting: null at once, made for next time.
    assert.equal(await voice.ready("Open the door"), null);
    for (let i = 0; i < 50 && voice.status().waiting; i++) await new Promise((r) => setTimeout(r, 20));
    assert.match((await voice.ready("Open the door")).audio, /^\/voice\/[0-9a-f]{24}\.mp3$/);
    await assert.rejects(voice.get("x".repeat(500)), /bad text/);
    assert.equal(voice.audioPath("../state.json"), null);
  } finally {
    fake.close();
  }
});

test("updates: a content pack is uploaded by the parent and downloaded by the game without a password", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eq-update-"));
  const port = 19000 + Math.floor(Math.random() * 1000);
  const proc = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, ADMIN_PASSWORD: "pw", ROUTER_MODE: "mock", AUTO_WRITE: "false" },
    stdio: "ignore",
  });
  const base = `http://localhost:${port}`;
  const basic = "Basic " + Buffer.from("x:pw").toString("base64");
  try {
    for (let i = 0; i < 50; i++) {
      try { await fetch(base + "/api/status"); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    assert.equal((await fetch(base + "/updates/manifest.json")).status, 404, "nothing offered yet");
    const pack = Buffer.alloc(5000, 7);
    const denied = await fetch(`${base}/admin/api/update/upload?version=ver1`, { method: "POST", body: pack });
    assert.equal(denied.status, 401, "only the parent can upload");
    const up = await (await fetch(`${base}/admin/api/update/upload?version=ver1`, { method: "POST", headers: { Authorization: basic }, body: pack })).json();
    assert.equal(up.ok, true);
    const manifest = await (await fetch(base + "/updates/manifest.json")).json();
    assert.equal(manifest.version, "ver1");
    assert.equal(manifest.size, 5000);
    const got = Buffer.from(await (await fetch(`${base}/updates/${manifest.file}`)).arrayBuffer());
    assert.equal(got.length, 5000);
    assert.equal(require("crypto").createHash("sha256").update(got).digest("hex"), manifest.sha256);
    assert.equal((await fetch(`${base}/updates/..%2Fstate.json`)).status, 404, "no way out of the folder");
    await fetch(`${base}/admin/api/update/upload?version=ver2`, { method: "POST", headers: { Authorization: basic }, body: Buffer.alloc(10, 1) });
    assert.equal((await (await fetch(base + "/updates/manifest.json")).json()).version, "ver2");
    assert.equal((await fetch(`${base}/updates/${manifest.file}`)).status, 404, "the old pack is removed");
  } finally {
    proc.kill();
  }
});

test("validate: a timed puzzle needs sensible seconds, an onEnd that only sends him back, and a rule that stops it", () => {
  const { validate } = require("./validate");
  const content = require("./content").loadContent(null);
  const base = JSON.parse(JSON.stringify(content.episodes.find((e) => e.id === "s1e2").data));
  const ctx = { base: content.base, dict: content.DICT, knownWords: new Set(), functionWords: content.functionWords,
    artKeys: new Set(require("../art/shots.json").shots.map((s) => s.key)) };
  const rule = base.scenes[0].rules.find((r) => (r.verb || []).includes("look"));
  const msgs = (ep) => validate(ep, ctx).errors.join(" | ");

  let ep = JSON.parse(JSON.stringify(base));
  ep.scenes[0].rules.find((r) => (r.verb || []).includes("look")).do = { timer: { seconds: 30, onEnd: { say: "Too slow." } } };
  assert.match(msgs(ep), /needs a rule with do\.stopTimer/);

  ep = JSON.parse(JSON.stringify(base));
  const r = ep.scenes[0].rules.find((x) => (x.verb || []).includes("look"));
  r.do = { stopTimer: true, timer: { seconds: 3, onEnd: { say: "Too slow.", finish: true } } };
  const m = msgs(ep);
  assert.match(m, /seconds must be a whole number from 10 to 90/);
  assert.match(m, /can not finish the episode/);
  assert.ok(rule, "the episode has a look rule");
});

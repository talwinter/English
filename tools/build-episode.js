// Builds one episode the way the server builds it every morning, and shows each step on a page that updates
// by itself (data/builds/<id>-<time>/report.html) and in the terminal.
//
//   node tools/build-episode.js --id s1e1                     OpenAI writes it (needs OPENAI_API_KEY in .env)
//   node tools/build-episode.js --id s1e1 --replay file.json  no OpenAI: the file is used as the model's answer
//   node tools/build-episode.js --id s1e3 --note "more jokes"
//
// Steps shown: the brief (where the story is), OpenAI writing, the layout builder placing things, the checks, the
// repair rounds, the result. With --install the episode is copied to godot/episodes/ so the game can play it.

const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const arg = (name, def = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] || true) : def; };

// .env, the same file the server reads (never committed)
try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch { /* no .env */ }

const { loadContent } = require("../server/content");
const { createWriter } = require("../server/writer");
const { createCanon } = require("../server/canon");
const { loadSeries } = require("../server/series");
const { loadCatalog, applyLayout } = require("../server/episode3d");
const { layoutScene } = require("../server/layout");

const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const order = (id) => { const m = /^s(\d+)e(\d+)$/.exec(id); return m ? +m[1] * 1000 + +m[2] : 0; };

async function main() {
  const id = arg("id", "s1e3");
  const note = arg("note", "") === true ? "" : arg("note", "");
  const replayFile = arg("replay");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.join(ROOT, "data", "builds", `${id}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });

  // the story so far = the episodes before this one
  const all = loadContent(null);
  const before = { ...all, episodes: all.episodes.filter((e) => order(e.id) < order(id)) };
  const catalog = loadCatalog();
  const series = loadSeries();
  const canon = createCanon(dir);

  // --replay: a tiny stand-in for OpenAI that answers with the file (so the whole pipeline can be watched for free)
  let fake = null;
  const env = { ...process.env, EPISODE_FORMAT: "3d" };
  if (replayFile) {
    const answer = JSON.parse(fs.readFileSync(path.resolve(replayFile), "utf8"));
    answer.id = id;
    fake = http.createServer((req, res) => {
      req.on("data", () => {});
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }], usage: { total_tokens: 0 } }));
      });
    });
    await new Promise((r) => fake.listen(0, r));
    env.OPENAI_BASE_URL = `http://localhost:${fake.address().port}/v1`;
    env.OPENAI_API_KEY = "replay";
  } else if (!env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set. Put it in a file named .env in the project folder (it is not committed),");
    console.error("or use --replay <file> to watch the steps without OpenAI.");
    process.exit(1);
  }

  const run = { id, startedAt: Date.now(), running: true, stages: [], replay: !!replayFile, note, result: null };
  const writeReport = () => fs.writeFileSync(path.join(dir, "report.html"), render(run, { series, catalog }));
  const onStage = (record, what, detail) => {
    run.stages.push({ at: Date.now(), what, detail });
    console.log(`[${((Date.now() - run.startedAt) / 1000).toFixed(1).padStart(5)}s] ${what.padEnd(7)} ${detail}`);
    writeReport();
  };

  const writer = createWriter({
    dataDir: dir, env, getContent: () => before, reload: () => {}, canon, onStage,
    art: { list: () => ({ shots: [] }), queueNew: () => [] },
    log: (m) => console.log("        " + m),
    getProfile: () => ({ name: "Alex", weak: [] }),
  });

  console.log(`Building ${id}${replayFile ? " (replay, no OpenAI)" : ""}. Report: ${path.join(dir, "report.html")}`);
  writeReport();
  let record;
  try {
    record = await writer.write(note, { id });
  } catch (e) {
    run.error = e.message;
  }
  run.running = false;
  if (record) {
    run.result = record;
    try {
      const ep = writer.readDraft(id);
      run.episode = ep;
      run.maps = {};
      for (const sc of ep.scenes) {
        const shell = catalog.shells[sc.shell];
        if (shell) run.maps[sc.id] = layoutScene(shell, sc.objects, catalog).map;
      }
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(ep, null, 2));
      if (args.includes("--install")) {
        const { solve } = require("../server/validate");
        const Episode = require("../js/episode");
        const sol = solve(Episode.compile(ep, all.base));
        const out = path.join(ROOT, "godot", "episodes", `${id}.json`);
        fs.writeFileSync(out, JSON.stringify({ ...ep, solution: sol.solved ? sol.actions : undefined }, null, 1));
        console.log(`Installed in the game: ${path.relative(ROOT, out)}`);
      }
    } catch (e) { run.error = run.error || e.message; }
  }
  writeReport();
  if (fake) fake.close();
  console.log(run.error ? `ERROR: ${run.error}` : `Done: ${record.status}. ${record.title || ""}`);
  console.log(`Report: ${path.join(dir, "report.html")}`);
}

// ---------------------------------------------------------------- the page
function mapSvg(map, sceneObjects) {
  if (!map) return "";
  const [x0, y0, x1, y1] = map.floor;
  const W = 520, S = W / (x1 - x0 + 4), H = (y1 - y0 + 3) * S;
  const X = (x) => (x - x0 + 2) * S, Y = (y) => H - (y - y0 + 1) * S;
  const parts = [`<svg viewBox="0 0 ${W} ${H}" class="map">`,
    `<rect x="${X(x0)}" y="${Y(y1)}" width="${(x1 - x0) * S}" height="${(y1 - y0) * S}" fill="#1c2a1c" stroke="#4a8" />`];
  for (const b of map.blocked || []) parts.push(`<rect x="${X(b[0])}" y="${Y(b[3])}" width="${(b[2] - b[0]) * S}" height="${(b[3] - b[1]) * S}" fill="#245" opacity=".7"/>`);
  for (const r of map.rects) {
    const [a, b, c, d] = r.rect;
    parts.push(`<rect x="${X(a)}" y="${Y(d)}" width="${(c - a) * S}" height="${(d - b) * S}" fill="#6a5320" stroke="#fc3" />`);
    parts.push(`<text x="${X((a + c) / 2)}" y="${Y((b + d) / 2) + 4}" fill="#fff" font-size="11" text-anchor="middle">${esc(r.id)}</text>`);
  }
  for (const o of sceneObjects) {
    if (o.stand) parts.push(`<circle cx="${X(o.stand[0])}" cy="${Y(o.stand[1])}" r="4" fill="#4cf"><title>stand: ${esc(o.id)}</title></circle>`);
  }
  parts.push(`<circle cx="${X(map.spawn[0])}" cy="${Y(map.spawn[1])}" r="6" fill="#f55"/><text x="${X(map.spawn[0]) + 9}" y="${Y(map.spawn[1]) + 4}" fill="#f99" font-size="11">entry</text>`);
  parts.push(`<text x="8" y="14" fill="#9ab" font-size="11">camera is at the bottom; blue dots: where he stands to use things</text></svg>`);
  return parts.join("");
}

function render(run, { series }) {
  const s = series.forPrompt(run.id).split("\n");
  const beat = (s.find((l) => l.startsWith("YOUR BEAT")) || "").replace("YOUR BEAT: ", "");
  const ep = run.episode;
  const rec = run.result || {};
  const names = { start: "1. The brief", ask: "2. OpenAI writes", answer: "   answer received", layout: "3. Things are placed in the rooms",
    checks: "4. Checks", repair: "5. Problems go back to the writer", ready: "6. Ready", failed: "6. Still has problems" };
  const last = run.stages.length ? run.stages[run.stages.length - 1] : null;
  const rows = run.stages.map((st) => `<tr class="${esc(st.what)}"><td class="t">${((st.at - run.startedAt) / 1000).toFixed(1)}s</td><td>${esc(names[st.what] || st.what)}</td><td>${esc(st.detail)}</td></tr>`).join("");
  const scenes = ep ? ep.scenes.map((sc) => `<div class="scene"><h3>${esc(sc.name)} <span class="muted">(${esc(sc.id)}, room: ${esc(sc.shell)})</span></h3>
      <div class="cols"><div>${mapSvg(run.maps && run.maps[sc.id], sc.objects)}</div>
      <div><p class="intro">${esc(sc.intro)}</p><table>${sc.objects.map((o) => `<tr><td><b>${esc(o.id)}</b></td><td>${esc(o.prop || ("part of " + o.of + ": " + o.part))}</td>
        <td class="muted">${esc([o.where, o.against && "against " + o.against, o.near && "near " + o.near, o.on && "on " + o.on, o.inside && "inside " + o.inside, o.slot && "slot " + o.slot, o.opensWith && "opens with " + o.opensWith].filter(Boolean).join(", "))}</td></tr>`).join("")}</table></div></div></div>`).join("") : "";
  const body = `
    <h1>Building episode <span class="ltr">${esc(run.id)}</span> ${run.replay ? '<span class="tag">replay: no OpenAI</span>' : ""}</h1>
    <p class="muted">${esc(beat)}</p>
    ${run.note ? `<p>Parent's note: <i>${esc(run.note)}</i></p>` : ""}
    <p class="status ${run.running ? "run" : rec.status === "ready" ? "ok" : "bad"}">${run.running ? "Working... " + esc(last ? last.detail : "") : run.error ? "Error: " + esc(run.error) : rec.status === "ready" ? "Ready: the checks passed" : "Finished with problems"}</p>
    <h2>Steps</h2><table class="stages">${rows}</table>
    ${ep ? `<h2>${esc(ep.title)}</h2><p>${esc(ep.summary)}</p>
      <p><b>Previously:</b> ${esc((ep.previously || []).join(" "))}</p>
      <h2>Rooms and things</h2>${scenes}
      <h2>Checks</h2>
      <p>The robot finished it in <b>${(rec.steps || []).length}</b> steps: <span class="ltr muted">${esc((rec.steps || []).join(" > "))}</span></p>
      <p>${(rec.newWords || []).length} new words: <span class="ltr">${esc((rec.newWords || []).join(", "))}</span></p>
      ${(rec.errors || []).length ? `<ul class="bad">${rec.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : "<p class=\"ok\">No problems.</p>"}
      ${(rec.warnings || []).length ? `<ul class="muted">${rec.warnings.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
      <h2>What it wished for</h2>${(rec.wishes || []).length ? `<ul>${rec.wishes.map((w) => `<li><b>${esc(w.kind)}</b>: ${esc(w.text)}</li>`).join("")}</ul>` : "<p class=\"muted\">Nothing: the catalog had everything.</p>"}
      <h2>What it added to the story</h2>
      <ul>${((ep.canon || {}).facts || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
      <p class="muted">New open questions: ${esc(((ep.canon || {}).openedThreads || []).map((t) => t.text).join(" | ") || "none")}</p>
      <h2>Ending</h2><ol>${(ep.ending || []).map((l) => `<li>${esc(l)}</li>`).join("")}</ol>` : ""}`;
  return `<!doctype html><html><head><meta charset="utf-8">${run.running ? '<meta http-equiv="refresh" content="2">' : ""}
<title>Episode ${esc(run.id)}</title><style>
body{font-family:Segoe UI,Arial,sans-serif;background:#0d1020;color:#e8e8f0;max-width:1100px;margin:24px auto;padding:0 16px}
h1{color:#ffd23f} h2{color:#9fe6ff;border-bottom:1px solid #334;padding-bottom:4px;margin-top:28px} h3{margin:4px 0}
.muted{color:#8a90b0} .ltr{direction:ltr;unicode-bidi:embed} .tag{background:#553;padding:2px 8px;border-radius:8px;font-size:14px;color:#fd8}
table{border-collapse:collapse;width:100%} td{padding:5px 8px;border-bottom:1px solid #223;vertical-align:top} td.t{color:#8a90b0;width:60px}
.stages tr.repair td{color:#f99} .stages tr.ready td{color:#7e7;font-weight:bold} .stages tr.failed td{color:#f66;font-weight:bold}
.status{font-size:20px;padding:10px 14px;border-radius:10px} .run{background:#332;color:#fd8} .ok{color:#7e7} .bad{color:#f88}
.status.ok{background:#132} .status.bad{background:#311}
.scene{background:#131730;border-radius:12px;padding:12px 16px;margin:12px 0} .cols{display:flex;gap:18px;flex-wrap:wrap} .cols>div{flex:1;min-width:300px}
.map{width:100%;background:#0a0d1c;border-radius:8px} .intro{color:#bfe9ff}
</style></head><body>${body}</body></html>`;
}

main().catch((e) => { console.error(e); process.exit(1); });

// The morning check, with no tokens: takes the draft that waits for approval on a server, plays it in the real
// game with the robot (the solution the server's checks found), and says whether it really runs.
//
//   node tools/check-draft.js --server http://localhost:8081            (the dev server, password "dev")
//   node tools/check-draft.js --server http://192.168.2.47:8080         (needs SERVER_ADMIN_PASSWORD)
//
// Writes dist/checks/<date>-<episode>.json and prints one line. Exit code 0 = it plays to the end,
// 1 = a problem (the file says what), 2 = nothing to check. A scheduled job can start Claude only on 1.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const arg = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = /^(SERVER_ADMIN_PASSWORD|DEV_ADMIN_PASSWORD|CHECK_SERVER)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch { /* no .env */ }

const GODOT = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages",
  "GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe", "Godot_v4.7.2-stable_win64_console.exe");

async function main() {
  const server = (arg("server", process.env.CHECK_SERVER || "http://localhost:8081")).replace(/\/+$/, "");
  const isLocal = /localhost|127\.0\.0\.1/.test(server);
  const pw = isLocal ? (process.env.DEV_ADMIN_PASSWORD || "dev") : process.env.SERVER_ADMIN_PASSWORD;
  if (!pw) { console.error("Set SERVER_ADMIN_PASSWORD (the server's ADMIN_PASSWORD) in the environment or in .env."); process.exit(1); }
  const auth = { Authorization: "Basic " + Buffer.from(`parent:${pw}`).toString("base64") };

  const result = { at: new Date().toISOString(), server, ok: false, problems: [] };
  const out = (code) => {
    const dir = path.join(ROOT, "dist", "checks");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${result.at.slice(0, 10)}-${result.episode || "none"}.json`);
    fs.writeFileSync(file, JSON.stringify(result, null, 2));
    console.log(`${result.ok ? "OK" : "PROBLEM"} ${result.episode || "-"}: ${result.summary || result.problems.join("; ")} (${file})`);
    process.exit(code);
  };

  const list = await fetch(`${server}/admin/api/episodes`, { headers: auth }).then((r) => r.json());
  const ready = (list.writer.drafts || []).filter((d) => d.status === "ready");
  const failed = (list.writer.drafts || []).filter((d) => d.status === "failed");
  if (!ready.length) {
    result.summary = failed.length ? `no ready draft; ${failed.map((d) => d.id).join(", ")} failed its checks` : "no draft is waiting";
    result.problems = failed.length ? [result.summary] : [];
    return out(failed.length ? 1 : 2);
  }
  const d = ready[0];
  result.episode = d.id;
  result.title = d.title;
  result.wishes = d.wishes || [];
  const draft = await fetch(`${server}/admin/api/draft/${d.id}`, { headers: auth }).then((r) => r.json());
  const solution = (draft.episode || {}).solution || [];
  if (!solution.length) result.problems.push("the draft has no robot solution");

  // the real game, played by the robot, window out of sight
  const r = spawnSync(GODOT, ["--path", path.join(ROOT, "godot"), "--windowed", "--resolution", "1280x720", "--position", "6000,3000",
    "--quit-after", "9000", "--", "--draft", `--episode=${d.id}`, `--server=${server}`, `--admin=${pw}`, "--autoplay", "--shots"],
  { encoding: "utf8", timeout: 6 * 60 * 1000 });
  const text = `${r.stdout || ""}\n${r.stderr || ""}`;
  const shots = (text.match(/^SHOT /gm) || []).length;
  const scriptErrors = (text.match(/SCRIPT ERROR/g) || []).length;
  result.shots = shots;
  result.scriptErrors = scriptErrors;
  if (r.error) result.problems.push(`the game did not run: ${r.error.message}`);
  if (scriptErrors) result.problems.push(`${scriptErrors} script errors in the game`);
  if (solution.length && shots < solution.length) result.problems.push(`the robot played ${shots} of ${solution.length} steps`);
  if (/episode \S+ not found|Something is missing/.test(text)) result.problems.push("the game could not load the episode");
  result.ok = result.problems.length === 0;
  result.summary = result.ok ? `plays to the end (${shots} steps of ${solution.length})` : result.problems.join("; ");
  out(result.ok ? 0 : 1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });

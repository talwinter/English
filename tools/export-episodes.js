// Writes the built-in episodes (and the shared verbs and dictionary) as plain JSON for the Godot game:
//   godot/episodes/<id>.json   one episode, same data as /api/play returns in "episode"
//   godot/episodes/_base.json  { base: verbs and messages, dictionary: English -> Hebrew }
// The Godot game reads these when it is run without the server (development, offline).
//
//   node tools/export-episodes.js

const fs = require("fs");
const path = require("path");
const { loadContent, ROOT } = require("../server/content");

const out = path.join(ROOT, "godot", "episodes");
fs.mkdirSync(out, { recursive: true });
const content = loadContent();

// Episodes with 3D hints (tools/hints/<id>.json) are laid out on the catalog's rooms, exactly like an episode
// from the writer will be; the others are written as they are.
const { loadCatalog, applyHints, applyLayout } = require("../server/episode3d");
let catalog = null;
try { catalog = loadCatalog(); } catch { /* run tools/build-catalog.js first */ }

for (const ep of content.episodes) {
  let data = ep.data;
  const hintFile = path.join(ROOT, "tools", "hints", `${ep.id}.json`);
  if (catalog && fs.existsSync(hintFile)) {
    const laid = applyLayout(applyHints(ep.data, JSON.parse(fs.readFileSync(hintFile, "utf8"))), catalog);
    data = laid.episode;
    const nl = String.fromCharCode(10);
    console.log(`${ep.id}: laid out in 3D` + (laid.errors.length ? `, PROBLEMS:${nl}  - ${laid.errors.join(nl + "  - ")}` : ", no problems") +
      (laid.warnings.length ? `${nl}  warnings: ${laid.warnings.join("; ")}` : ""));
    if (laid.errors.length) process.exitCode = 1;
  }
  // the robot's way through the episode, for the game's own robot (video, tests)
  try {
    const { solve } = require("../server/validate");
    const Episode = require("../js/episode");
    const sol = solve(Episode.compile(ep.data, content.base));
    if (sol.solved) data = { ...data, solution: sol.actions };
  } catch (e) { console.log(`${ep.id}: no solution written (${e.message})`); }
  fs.writeFileSync(path.join(out, `${ep.id}.json`), JSON.stringify(data, null, 1));
}
fs.writeFileSync(path.join(out, "_base.json"), JSON.stringify({ base: content.base, dictionary: content.DICT, functionWords: [...content.functionWords] }, null, 1));
console.log(`Exported ${content.episodes.map((e) => e.id).join(", ")} to ${path.relative(ROOT, out)}`);

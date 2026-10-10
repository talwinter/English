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

for (const ep of content.episodes) {
  fs.writeFileSync(path.join(out, `${ep.id}.json`), JSON.stringify(ep.data, null, 1));
}
fs.writeFileSync(path.join(out, "_base.json"), JSON.stringify({ base: content.base, dictionary: content.DICT, functionWords: [...content.functionWords] }, null, 1));
console.log(`Exported ${content.episodes.map((e) => e.id).join(", ")} to ${path.relative(ROOT, out)}`);

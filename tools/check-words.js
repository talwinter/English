// Checks the built-in episodes: every English word has a Hebrew translation, and a robot can
// play each episode to the end.
// Usage: node tools/check-words.js
const Episode = require("../js/episode");
const { loadContent } = require("../server/content");
const { validate } = require("../server/validate");

const content = loadContent();
let failed = false;

const baseMissing = [...Episode.wordsIn(content.baseTexts)].filter((w) => !content.DICT[w]);
if (baseMissing.length) {
  console.error(`Missing from dictionary (verbs and messages): ${baseMissing.join(", ")}`);
  failed = true;
}

const artKeys = new Set(require("../art/shots.json").shots.map((s) => s.key));
for (const ep of content.episodes) {
  const r = validate(ep.data, {
    base: content.base, dict: content.DICT, knownWords: new Set(), functionWords: content.functionWords, artKeys,
  });
  console.log(`${ep.id} ${ep.title}: ${r.ok ? "OK" : "PROBLEMS"}, ${ep.words.length} words, solved in ${r.solution ? r.solution.steps.length : "-"} steps`);
  for (const e of r.errors) console.error(`  ✗ ${e}`);
  for (const w of r.warnings) console.log(`  ! ${w}`);
  if (!r.ok) failed = true;
}

if (failed) process.exit(1);
console.log("All words have a translation.");

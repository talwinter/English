// Checks that every English word the player can see has a Hebrew translation.
// Usage: node tools/check-words.js
const { loadScripts, collectTexts, WORD } = require("../server/content");

const { GAME, DICT } = loadScripts(["js/dictionary.js", "js/game-data.js"]);
const texts = collectTexts(GAME);

const missing = new Map();
const used = new Set();
for (const text of texts) {
  for (const m of text.match(WORD) || []) {
    const w = m.toLowerCase();
    used.add(w);
    if (!DICT[w]) missing.set(w, text);
  }
}

const unused = Object.keys(DICT).filter((w) => !used.has(w));
console.log(`${texts.length} texts, ${used.size} different words, ${Object.keys(DICT).length} in dictionary.`);
if (unused.length) console.log(`Not used in the game (fine): ${unused.join(", ")}`);
if (missing.size) {
  console.error(`\nMissing from dictionary (${missing.size}):`);
  for (const [w, text] of missing) console.error(`  ${w.padEnd(14)} in: ${text}`);
  process.exit(1);
}
console.log("All words have a translation.");

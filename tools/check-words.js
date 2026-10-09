// Checks that every English word the player can see has a Hebrew translation.
// Usage: node tools/check-words.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const ctx = { window: {} };
vm.createContext(ctx);
for (const file of ["js/dictionary.js", "js/game-data.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx, { filename: file });
}
const { GAME, DICT } = ctx.window;

// Keys whose string values are ids or Hebrew, not text shown in English.
const SKIP = new Set(["id", "he", "hintHe", "verb", "obj", "item", "words", "scene", "goal", "points"]);

const texts = [];
(function collect(value, key) {
  if (typeof value === "string") {
    if (!SKIP.has(key)) texts.push(value);
  } else if (Array.isArray(value)) {
    if (!SKIP.has(key)) value.forEach((v) => collect(v, key));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collect(v, k);
  }
})(GAME, "");

const WORD = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
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

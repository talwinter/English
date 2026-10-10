// Loads the game's story files and dictionary (the same files the browser uses).

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const WORD = /[A-Za-z]+(?:'[A-Za-z]+)?/g;

// The series. Each episode is a story file; new episodes are added here in order.
const EPISODES = [
  { id: "s1e1", file: "js/game-data.js" },
];

function loadScripts(files) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx, { filename: file });
  }
  return ctx.window;
}

// Keys whose string values are ids or Hebrew, not English text the player reads.
const SKIP = new Set(["id", "he", "hintHe", "verb", "obj", "item", "words", "scene", "goal", "points"]);

function collectTexts(game) {
  const texts = [];
  (function walk(value, key) {
    if (typeof value === "string") {
      if (!SKIP.has(key)) texts.push(value);
    } else if (Array.isArray(value)) {
      if (!SKIP.has(key)) value.forEach((v) => walk(v, key));
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  })(game, "");
  return texts;
}

const wordsIn = (texts) => new Set(texts.flatMap((t) => (t.match(WORD) || []).map((w) => w.toLowerCase())));

function loadContent() {
  const { DICT, FUNCTION_WORDS } = loadScripts(["js/dictionary.js"]);
  const skip = new Set(FUNCTION_WORDS);
  const episodes = EPISODES.map((e) => {
    const { GAME } = loadScripts([e.file]);
    const words = [...wordsIn(collectTexts(GAME))].filter((w) => DICT[w] && !skip.has(w));
    return { id: e.id, title: GAME.title, words };
  });
  return { DICT, episodes };
}

module.exports = { loadContent, loadScripts, collectTexts, wordsIn, WORD, ROOT };

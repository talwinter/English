// Loads the episodes and the dictionary: the built-in episodes (js/episodes/) and the episodes
// the episode writer made and a parent approved (data/episodes/published/).

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const Episode = require("../js/episode");
const BASE = require("../js/base");

const ROOT = path.join(__dirname, "..");
const BUILTIN = ["s1e1", "s1e2"];

function loadScripts(files) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx, { filename: file });
  }
  return ctx.window;
}

// All English texts of the shared verbs and messages.
function baseTexts() {
  const out = [];
  (function walk(v) {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => { if (k !== "id") walk(x); });
  })(BASE);
  return out;
}

function readPublished(dataDir) {
  const dir = path.join(dataDir, "episodes");
  let index = { published: [] };
  try { index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8")); } catch { /* none yet */ }
  return (index.published || []).map((id) => JSON.parse(fs.readFileSync(path.join(dir, "published", `${id}.json`), "utf8")));
}

function loadContent(dataDir = null) {
  const win = loadScripts(["js/dictionary.js", ...BUILTIN.map((id) => `js/episodes/${id}.js`)]);
  const functionWords = new Set(win.FUNCTION_WORDS);
  const all = [...BUILTIN.map((id) => win.EPISODES[id]), ...(dataDir ? readPublished(dataDir) : [])];
  const dict = { ...win.DICT };
  for (const ep of all) for (const d of ep.dictionary || []) dict[d.en.toLowerCase()] = d.he;
  const episodes = all.map((ep) => ({
    id: ep.id,
    title: ep.title,
    data: ep,
    words: [...Episode.wordsIn(Episode.texts(ep))].filter((w) => dict[w] && !functionWords.has(w)),
  }));
  return { DICT: dict, baseDict: win.DICT, functionWords, base: BASE, episodes, baseTexts: baseTexts() };
}

module.exports = { loadContent, loadScripts, baseTexts, ROOT, BUILTIN };

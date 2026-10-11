// Makes a throwaway episode that puts the newest catalog things into their rooms, so they can be looked at in the
// real game (the robot takes pictures of it). Usage:
//   node tools/preview-props.js            writes godot/episodes/_preview.json
//   godot --path godot -- --episode=_preview --no-server --autoplay --shots
const fs = require("fs");
const path = require("path");
const { loadCatalog, applyLayout } = require("../server/episode3d");

const catalog = loadCatalog();
const obj = (id, prop, where, extra = {}) => ({ id, name: id, words: [id], look: `It is the ${id}.`, prop, where, ...extra });
const ep = {
  id: "_preview", title: "Preview", summary: "", start: { scene: "lake", goal: "look" }, items: [], format: "3d",
  goals: [{ id: "look", en: "Look around.", he: "הסתכל.", hint: "Look.", hintHe: "הסתכל." }],
  scenes: [
    { id: "lake", name: "The frozen lake", intro: "The frozen lake.", introAgain: "The lake.", shell: "frozen_lake", music: "mystery",
      objects: [obj("fisherman", "fisherman", "back_left"), obj("hole", "ice_hole", "back_left", { near: "fisherman" }),
        obj("troll", "troll", "middle_right"), obj("rune", "rune_stone", "back_right"), obj("crystal", "ice_crystal", "front_left"),
        obj("disk", "save_disk", "front_right")],
      rules: [{ verb: ["look"], obj: ["fisherman"], say: "The fisherman waves.", do: { go: "cave" } }] },
    { id: "cave", name: "The ice cave", intro: "The ice cave.", introAgain: "The cave.", shell: "ice_cave", music: "danger",
      objects: [obj("giant", "ice_giant", "back_center"), obj("rune2", "rune_stone", "back_left"), obj("crystal2", "ice_crystal", "front_right"),
        obj("fisherman2", "fisherman", "front_left")],
      rules: [{ verb: ["look"], obj: ["giant"], say: "The giant looks at you.", do: { finish: true } }] },
  ],
  globalRules: [], ending: ["Preview."], dictionary: [],
  solution: [{ verb: "look", obj: "fisherman", item: "" }, { verb: "look", obj: "giant", item: "" }],
};
const laid = applyLayout(ep, catalog);
console.log(laid.errors.length ? "PROBLEMS: " + laid.errors.join("; ") : "laid out", laid.warnings.join("; "));
fs.writeFileSync(path.join(__dirname, "..", "godot", "episodes", "_preview.json"), JSON.stringify({ ...laid.episode, solution: ep.solution }, null, 1));

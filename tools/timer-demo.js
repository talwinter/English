// A tiny episode with a timed puzzle, to see the countdown and its end in the real game.
//   node tools/timer-demo.js slow    the robot is too slow: the time runs out and he is sent back
//   node tools/timer-demo.js fast    the robot wins before the time is up: the clock stops
// then:  godot --path godot -- --episode=_timer --no-server --autoplay --shots
const fs = require("fs");
const path = require("path");
const { loadCatalog, applyLayout } = require("../server/episode3d");
const mode = process.argv[2] || "slow";
const catalog = loadCatalog();
const obj = (id, prop, where) => ({ id, name: id, words: [id], look: `It is the ${id}.`, prop, where });
const ep = {
  id: "_timer", title: "Timer demo", summary: "", start: { scene: "cave", goal: "duel" }, items: [], format: "3d",
  goals: [{ id: "duel", en: "Win the duel.", he: "נצח.", hint: "Look at the giant.", hintHe: "הסתכל." }],
  scenes: [{
    id: "cave", name: "The ice cave", intro: "The giant is angry.", introAgain: "The giant waits.", shell: "ice_cave", music: "danger",
    objects: [obj("giant", "ice_giant", "back_center"), obj("rune", "rune_stone", "back_left"), obj("crystal", "ice_crystal", "front_right")],
    rules: [
      { verb: ["talk"], obj: ["giant"], say: "You win the duel!", do: { stopTimer: true, finish: true } },
      { verb: ["look"], obj: ["giant"], when: { notFlags: ["started"] }, say: "Quick! Say hello before the time is up!",
        do: { set: ["started"], timer: { seconds: 20, onEnd: { say: "Too slow! The giant laughs. Try again.", unset: ["started"] } } } },
    ],
  }],
  globalRules: [], ending: ["You won the duel."], dictionary: [],
};
ep.solution = mode === "fast"
  ? [{ verb: "look", obj: "giant", item: "" }, { verb: "talk", obj: "giant", item: "" }]
  : [{ verb: "look", obj: "giant", item: "" }, { verb: "wait", obj: "", item: "", seconds: 22 },
    { verb: "look", obj: "giant", item: "" }, { verb: "talk", obj: "giant", item: "" }];
const laid = applyLayout(ep, catalog);
if (laid.errors.length) { console.error(laid.errors.join("; ")); process.exit(1); }
fs.writeFileSync(path.join(__dirname, "..", "godot", "episodes", "_timer.json"), JSON.stringify({ ...laid.episode, solution: ep.solution }, null, 1));
console.log(`written (${mode})`);

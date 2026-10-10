// Keeps the server's state in one JSON file in the data folder.

const fs = require("fs");
const path = require("path");

function createStore(dataDir) {
  const file = path.join(dataDir, "state.json");
  fs.mkdirSync(dataDir, { recursive: true });

  const fresh = { completions: {}, episodesDone: [], forceLock: false, log: [] };
  let state = fresh;
  try {
    state = { ...fresh, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch (e) {
    if (e.code !== "ENOENT") throw new Error(`Cannot read ${file}: ${e.message}`);
  }

  function save() {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file);
  }

  function log(message) {
    const line = `${new Date().toISOString()} ${message}`;
    console.log(line);
    state.log.push(line);
    state.log = state.log.slice(-300);
    save();
  }

  return { get state() { return state; }, save, log };
}

module.exports = { createStore };

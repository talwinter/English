// The canon: what is TRUE so far in the story, and what is still OPEN.
//
// There is no finished story, only a bible with a loose plan. Every episode adds a little to the story, so the
// writer reads the canon before it writes ("these facts hold, never contradict them; these threads are open,
// advance one at most, never solve a big one early"), and after a parent approves an episode its new facts and
// threads are added. The parent can read and edit the canon on the parent page: it is where the story is steered.
//
// canon = {
//   facts:    [ { text, episode } ]                 things that happened or are true
//   threads:  [ { id, text, status, opened, big } ] questions the story asked: status "open" | "resolved"
//   note:     "free text from the parent"           a standing instruction for every episode
// }

const fs = require("fs");
const path = require("path");

const SEED = {
  facts: [
    { text: "The hero is a modern teenager. In Grandpa's attic he found an old 1987 computer with a game, THE LAST QUEST.", episode: "s1e0" },
    { text: "The screen pulled him into the game when he typed his name. Inside the game everyone speaks only English.", episode: "s1e0" },
    { text: "Byte is a small flying mouse arrow with wings. He is the hero's friend and guide in the game.", episode: "s1e0" },
    { text: "To go home, the hero must win THE LAST QUEST.", episode: "s1e0" },
    { text: "The real world is only the attic. Everything else happens inside the game.", episode: "s1e0" },
  ],
  threads: [
    { id: "grandpa", text: "Where is Grandpa? He wrote the game in 1987 and disappeared.", status: "open", opened: "bible", big: true },
    { id: "glitch", text: "What is the Glitch, and what does it want?", status: "open", opened: "bible", big: true },
    { id: "why-pulled", text: "Why did the game pull the hero in, and not someone else?", status: "open", opened: "bible", big: true },
    { id: "save-disks", text: "The seven Save Disks: where are they?", status: "open", opened: "bible", big: false },
  ],
  note: "Keep it fun and a little funny. Do not reveal what happened to Grandpa or what the Glitch really is yet: only give small hints.",
};

function createCanon(dataDir) {
  const file = path.join(dataDir, "canon.json");
  let canon = JSON.parse(JSON.stringify(SEED));
  try { canon = { ...canon, ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch (e) { if (e.code !== "ENOENT") throw e; }
  const save = () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(canon, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  };

  // The text the writer reads.
  function forPrompt() {
    const open = canon.threads.filter((t) => t.status === "open");
    return [
      "CANON (these are TRUE in the story so far; never contradict them):",
      ...canon.facts.map((f) => `- ${f.text}`),
      "",
      "OPEN THREADS (questions the story asked; you may move ONE forward with a small step, a clue or a hint;",
      "never solve a thread marked BIG, and do not invent a new BIG mystery; the answer comes in a later season):",
      ...open.map((t) => `- [${t.id}]${t.big ? " BIG" : ""} ${t.text}`),
      canon.note ? `\nSTANDING NOTE FROM THE PARENT (follow it): ${canon.note}` : "",
    ].join("\n");
  }

  // `update` comes with a new episode: { facts: [string], openedThreads: [{id, text}], resolvedThreads: [id] }
  function merge(update, episodeId) {
    if (!update) return;
    for (const text of update.facts || []) {
      const t = String(text).trim().slice(0, 300);
      if (t && !canon.facts.some((f) => f.text === t)) canon.facts.push({ text: t, episode: episodeId });
    }
    for (const t of update.openedThreads || []) {
      const id = String(t.id || "").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
      if (id && t.text && !canon.threads.some((x) => x.id === id)) {
        canon.threads.push({ id, text: String(t.text).slice(0, 300), status: "open", opened: episodeId, big: false });
      }
    }
    for (const id of update.resolvedThreads || []) {
      const t = canon.threads.find((x) => x.id === id);
      if (t && !t.big) t.status = "resolved";          // a BIG thread is closed only by the parent
    }
    canon.facts = canon.facts.slice(-120);
    save();
  }

  function replace(next) {
    // the parent edits it: keep only the known fields
    canon = {
      facts: (next.facts || []).map((f) => ({ text: String(f.text).slice(0, 300), episode: String(f.episode || "parent").slice(0, 20) })),
      threads: (next.threads || []).map((t) => ({
        id: String(t.id).slice(0, 40), text: String(t.text).slice(0, 300),
        status: t.status === "resolved" ? "resolved" : "open", opened: String(t.opened || "parent").slice(0, 20), big: !!t.big,
      })),
      note: String(next.note || "").slice(0, 600),
    };
    save();
  }

  return { get data() { return canon; }, forPrompt, merge, replace, save };
}

module.exports = { createCanon, SEED };

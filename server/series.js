// The series spine, read from docs/SERIES.md: the secret ending, 7 seasons, and one beat for each of the 49
// episodes. The writer is told where the story is ("episode 3 of season 2, its beat is ..., the next beat is ...")
// so it can plant clues and end on a cliffhanger, without ever reaching the ending early.

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "docs", "SERIES.md");

function parseSeries(text) {
  const out = { ending: "", seasons: [], notes: [] };
  const endingMatch = /## The ending[^\n]*\n([\s\S]*?)\n## /.exec(text);
  if (endingMatch) out.ending = endingMatch[1].trim();
  const notesMatch = /## Grandpa's seven notes[^\n]*\n([\s\S]*?)\n## /.exec(text);
  if (notesMatch) {
    out.notes = [...notesMatch[1].matchAll(/^\s*\d+\.\s*"([^"]+)"/gm)].map((m) => m[1]);
  }
  const re = /## Season (\d+): ([^\n(]+)\(([^)]*)\)\n([\s\S]*?)(?=\n## |$)/g;
  for (const m of text.matchAll(re)) {
    const body = m[4];
    const episodes = [...body.matchAll(/^\s*(\d+)\.\s*\*\*([^*]+)\*\*:\s*(.+)$/gm)]
      .map((e) => ({ n: Number(e[1]), title: e[2].trim(), text: e[3].trim() }));
    const intro = body.split("\n").find((l) => l.trim() && !/^\s*\d+\./.test(l)) || "";
    out.seasons.push({ n: Number(m[1]), title: m[2].trim(), focus: m[3].trim(), intro: intro.trim(), episodes });
  }
  return out;
}

function loadSeries(file = FILE) {
  let spine = { ending: "", seasons: [], notes: [] };
  try { spine = parseSeries(fs.readFileSync(file, "utf8")); } catch { /* no series file: the writer works as before */ }

  const idParts = (id) => { const m = /^s(\d+)e(\d+)$/.exec(id || ""); return m ? [Number(m[1]), Number(m[2])] : null; };

  // The text the writer reads when it writes episode `id` (like "s2e3").
  function forPrompt(id) {
    const p = idParts(id);
    if (!p || !spine.seasons.length) return "";
    const [s, e] = p;
    const season = spine.seasons.find((x) => x.n === s);
    if (!season) return "THE SERIES: the planned 49 episodes are finished. This is the start of a new story: do not use the old ending.";
    const beat = season.episodes.find((x) => x.n === e);
    const next = e < 7 ? season.episodes.find((x) => x.n === e + 1) : (spine.seasons.find((x) => x.n === s + 1) || {}).episodes?.[0];
    const global = (s - 1) * 7 + e;
    const lines = [
      `THE SERIES has 49 episodes in 7 seasons of 7. You are writing episode ${e} of season ${s} ("${season.title}"), number ${global} of 49.`,
      `This season's English focus: ${season.focus}. Use these words and structures a lot, naturally.`,
      `THE ENDING (SECRET: never say it, never get there, only steer towards it slowly): ${spine.ending}`,
      "",
      `THIS SEASON: ${season.intro}`,
      ...season.episodes.map((x) => `  ${x.n}. ${x.title}: ${x.text}${x.n === e ? "   <== THIS EPISODE" : ""}`),
    ];
    if (beat) {
      lines.push("", `YOUR BEAT: "${beat.title}": ${beat.text}`,
        "Keep the idea and the English focus of this beat; you may change the details and add jokes. One small step forward, no more.");
    }
    if (next) lines.push(`THE NEXT BEAT (end your episode with a cliffhanger that points to it): "${next.title}": ${next.text}`);
    if (e === 3 || e === 4) {
      const note = spine.notes[s - 1];
      if (note && /note/i.test(beat ? beat.text : "")) lines.push(`If your beat has Grandpa's note, it says exactly: "${note}"`);
    }
    return lines.join("\n");
  }

  return { spine, forPrompt, parseSeries };
}

module.exports = { loadSeries, parseSeries };

// The episode writer. Every few days it asks OpenAI to write the next episode of the series,
// checks it (a robot must be able to finish it, every word needs Hebrew, sentences must be short),
// asks again with the list of problems if needed, and keeps it as a draft for a parent to try and
// approve. Approved episodes become today's mission when their pictures are ready.

const fs = require("fs");
const path = require("path");
const Episode = require("../js/episode");
const { validate } = require("./validate");
const { chatJson, costOf } = require("./openai");
const { locate } = require("./hotspots");
const { loadCatalog, applyLayout } = require("./episode3d");
const { makeSchema, catalogText, rules3d, normalize3d } = require("./builder3d");
const { loadSeries } = require("./series");
const Walk = require("../js/walk");
const { ROOT, BUILTIN, readOverride, overrideFile } = require("./content");

const SEASON_LENGTH = 7;
const ATTEMPTS = 5;   // each try is about 20k tokens (a cent or two); the checks are strict

// ---------- the shape of an episode, for OpenAI's structured output
const str = { type: "string" };
const strs = { type: "array", items: str };
const strOrNull = { type: ["string", "null"] };
const object = (props) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const SCHEMA = {
  $defs: {
    cond: object({ flags: strs, notFlags: strs, has: strs, notHas: strs }),
    effects: object({
      set: strs, unset: strs, add: strs, remove: strs, goal: strOrNull, go: strOrNull, finish: { type: "boolean" },
      fx: { type: "array", items: { type: "string", enum: Episode.FX.filter((f) => f !== "askname") } },
    }),
    rule: object({
      verb: { type: "array", items: { type: "string", enum: Episode.VERBS } },
      obj: { type: ["array", "null"], items: str },
      item: strOrNull,
      when: { $ref: "#/$defs/cond" },
      say: str,
      do: { $ref: "#/$defs/effects" },
      points: { type: "integer" },
      pointsId: strOrNull,
    }),
  },
  ...object({
    id: str,
    title: str,
    summary: str,
    previously: strs,
    start: object({ scene: str, goal: str }),
    items: { type: "array", items: object({ id: str, name: str, words: strs, look: str, art: strOrNull }) },
    goals: { type: "array", items: object({ id: str, en: str, he: str, hint: str, hintHe: str }) },
    scenes: {
      type: "array",
      items: object({
        id: str, name: str, intro: str, introAgain: str, art: str,
        music: { type: "string", enum: Episode.MUSIC },
        floor: object({ y0: { type: "integer" }, y1: { type: "integer" } }),
        entry: object({ x: { type: "integer" }, y: { type: "integer" } }),
        objects: {
          type: "array",
          items: object({
            id: str, name: str, words: strs, look: str,
            box: { type: "array", items: { type: "integer" } },
            sprite: strOrNull,
            pose: { type: ["string", "null"], enum: ["lying", null] },
            visible: { $ref: "#/$defs/cond" },
          }),
        },
        rules: { type: "array", items: { $ref: "#/$defs/rule" } },
      }),
    },
    globalRules: { type: "array", items: { $ref: "#/$defs/rule" } },
    ending: strs,
    canon: object({
      facts: strs,
      openedThreads: { type: "array", items: object({ id: str, text: str }) },
      resolvedThreads: strs,
    }),
    dictionary: { type: "array", items: object({ en: str, he: str }) },
    art: {
      type: "array",
      items: object({
        key: str,
        kind: { type: "string", enum: ["background", "character", "item"] },
        height: { type: ["integer", "null"] },
        prompt: str,
      }),
    },
  }),
};

const RULES = `You write one episode of "Lost in the Game", a point-and-click adventure (like King's Quest and
Monkey Island) that teaches English to a 15-year-old Hebrew speaker who is a beginner and loves games.

ENGLISH
- Very simple English: short sentences, mostly present simple, everyday words. At most 2 short sentences
  per message and never more than 30 words in any text.
- Reuse the known words a lot. Add about 10 to 30 new words. Every English word in any text that is NOT in the
  known words list must be in "dictionary" with a short Hebrew translation (lowercase "en").
- Names of characters (for example "Byte") also need a dictionary entry.
- A character speaks like this: Father: "Thank you, my son!"

STORY AND GAME
- Continue the story exactly from the story so far. Follow the season plan in the series bible. The first scene
  starts where the last cliffhanger stopped, and Byte is with the hero. Never contradict an earlier episode.
- Add "previously": 2 to 4 very simple lines that say what happened before (they are said at the start).
- The story is not written in advance, it is built one episode at a time: obey the CANON and OPEN THREADS you
  are given. In "canon" report what THIS episode made true ("facts": short sentences), any new small question it
  asked ("openedThreads": id + text) and any open thread it answered ("resolvedThreads": ids). Keep the facts few
  and small. Do not close a door a later episode may need: leave people alive and places standing, unless the
  episode needs otherwise, and prefer a hint to an answer.
- 2 or 3 scenes, 4 to 6 small puzzles, about 8 to 15 actions to finish. Fun, fast, a little funny.
- He must understand the English to go on: every puzzle answer is told in the text (a look, a talk, a hint).
- The last action must be a rule with do.finish = true. The "ending" lines are a cliffhanger.
- Goals guide him: set do.goal when the next task changes. Every goal has "he" and "hintHe" in Hebrew, and
  "hint" in very simple English.
- Make it exciting: give every scene "music" (mystery, adventure, cozy, danger, glitch) that fits its mood,
  and use do.fx for 2 or 3 big moments: "shake" (a crash, a monster roars), "flash" (magic, lightning),
  "glitch" (the Glitch appears, the game breaks), "crt" (an old screen turns on). Sounds for items, points and
  goals play by themselves. Don't overdo the effects.
- Points: give 5 or 10 points for real progress. Total about 50 to 60. Use pointsId when two rules give the same
  points (for example two ways to open the same door), so they count once.

HOW THE ENGINE WORKS
- Verbs: look, take, open, use, give, talk, enter, go. "use" and "give" need an item from the bag (rule.item);
  other verbs never have an item. "look" without a rule shows the object's "look" text.
- For each action the engine takes the FIRST rule that matches (verb, obj, item and "when"). Put special cases
  before general ones. A rule without "when" conditions matches always.
- Conditions use flags (strings you invent) and items in the bag (has / notHas). Effects can set/unset flags,
  add/remove items, set the goal, go to another scene (do.go), or finish the episode.
- Exits are objects (for example "cave" or "village") with a rule like: verb ["go","enter"], do.go = "forest".
- Things he can take usually are scene objects with a sprite that disappear (visible.notFlags) when taken, and an
  item with the same id goes into the bag.
- "obj" lists object ids (or item ids for items in the bag). Use null in globalRules to mean any object.
- An object's "words" are every word he might type for it (a bush with berries: "bush", "berries", "berry";
  a door: "door"). He can type commands like "take berries" or "give rope to bear".

PICTURES
- Every scene has a background picture (art key) of 320x200 pixels. The background shows only scenery and
  big fixed things (doors, trees, caves). Characters and small things he can take are separate pictures
  (object.sprite) drawn on top. Do not put people or animals in background prompts.
- Every object has box [x, y, width, height] on the 320x200 picture. The ground where he walks is "floor"
  (usually y0 about 140-155 and y1 about 196). Characters and things on the ground stand on the floor: the
  bottom of their box (y + height) is inside the floor. Exits are near the left or right edge.
- "entry" is where the hero appears in the scene (on the floor). The hero is drawn by the game: never add him.
- People who are ready-made walking characters: ${Episode.CHARACTERS.filter((c) => c !== "hero").map((c) => `"${c}"`).join(", ")}.
  Use one as the sprite of a person object (with no picture in "art"); its box is [x, y, 30, 60] with the feet
  (y + 60) on the floor. Set pose "lying" for a person lying on the ground (hurt, trapped, asleep), else null.
  Other people and animals need a character picture in "art".
- "art" lists every NEW picture: background prompts describe the place and where the big things are (left,
  middle, right); character/item prompts describe only the character or thing. Character "height" is its size
  in pixels (a grown-up about 46, a child about 40, a big animal about 30-40, small things 10-16).
  Background "height" is null. Keys are lowercase with - (like "ice-lake", "char-troll", "item-axe").
- Reuse an existing picture key when the place or character is the same, and do not list it again in "art".`;

function createWriter({ dataDir, env, getContent, reload, art, log, getProfile = () => ({}), canon = null, onStage = null }) {
  // 3D: rooms and props from the catalog (the default when there is a catalog); EPISODE_FORMAT=2d: pictures
  let catalog3d = null;
  try { catalog3d = loadCatalog(); } catch { /* no catalog: the 2D writer */ }
  const use3d = () => !!catalog3d && env.EPISODE_FORMAT !== "2d";
  const series = loadSeries();
  const schema3d = catalog3d ? makeSchema(catalog3d) : null;
  const stagesOf = (record) => (what, detail) => {
    (record.stages = record.stages || []).push({ at: new Date().toISOString(), what, detail });
    if (onStage) onStage(record, what, detail);
  };
  const dir = path.join(dataDir, "episodes");
  for (const d of ["published", "drafts"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
  const indexFile = path.join(dir, "index.json");
  let index = { published: [], drafts: [] };
  try { index = { ...index, ...JSON.parse(fs.readFileSync(indexFile, "utf8")) }; } catch (e) { if (e.code !== "ENOENT") throw e; }
  index.drafts = index.drafts.filter((d) => d.status !== "writing"); // a restart stopped it
  const saveIndex = () => { fs.writeFileSync(`${indexFile}.tmp`, JSON.stringify(index, null, 2)); fs.renameSync(`${indexFile}.tmp`, indexFile); };
  const fileOf = (id, kind) => path.join(dir, kind, `${id}.json`);
  const readDraft = (id) => JSON.parse(fs.readFileSync(fileOf(id, "drafts"), "utf8"));
  let writing = false;
  let lastError = null;
  let lastAttempt = 0;

  const order = (id) => { const m = /^s(\d+)e(\d+)$/.exec(id); return m ? +m[1] * 1000 + +m[2] : 0; };
  function nextId() {
    // A failed draft is written again with the same number.
    const ids = [...getContent().episodes.map((e) => e.id), ...index.drafts.filter((d) => d.status !== "failed").map((d) => d.id)];
    const last = ids.sort((a, b) => order(a) - order(b)).pop() || "s1e0";
    const [, s, e] = /^s(\d+)e(\d+)$/.exec(last).map(Number);
    return e >= SEASON_LENGTH ? `s${s + 1}e1` : `s${s}e${e + 1}`;
  }

  // Everything the checks need to know about the episodes before this one.
  function checkContext(ep) {
    const content = getContent();
    const dict = { ...content.DICT };
    for (const d of ep.dictionary || []) dict[d.en.toLowerCase()] = d.he;
    const knownWords = new Set([...Episode.wordsIn(content.baseTexts),
      ...content.episodes.flatMap((e) => [...Episode.wordsIn(Episode.texts(e.data))])]);
    const artKeys = new Set(art.list().shots.map((s) => s.key));
    return { base: content.base, dict, knownWords, functionWords: content.functionWords, artKeys,
      maxNewWords: Number(env.MAX_NEW_WORDS) || 45,
      catalog: use3d() ? catalog3d : null };
  }

  function prompt(id, note) {
    const content = getContent();
    const bible = fs.readFileSync(path.join(ROOT, "docs", "STORY.md"), "utf8");
    const known = [...checkContext({}).knownWords].sort();
    const pictures = art.list().shots.map((s) => `${s.key} (${s.kind}): ${s.prompt}`).join("\n");
    const storySoFar = content.episodes.map((e) => `${e.id} ${e.title}: ${e.data.summary || ""}`).join("\n");
    const example = content.episodes.find((e) => e.id === "s1e2");
    if (use3d()) {
      let ex3d = null;
      try { ex3d = fs.readFileSync(path.join(ROOT, "catalog", "example-episode.json"), "utf8"); } catch { /* none */ }
      return [
        { role: "system", content: rules3d(RULES) },
        {
          role: "user",
          content: [
            `Write episode ${id}. Its "id" must be "${id}".`,
            note ? `\nNOTE FROM THE PARENT (follow it): ${note}` : "",
            `\n${series.forPrompt(id)}`,
            `\nHERO NAME: ${getProfile().name ? `"${getProfile().name}"` : "not typed yet"}. ` +
              "A character may call him by name, rarely, and only by writing {name} in the text (the game puts the real name there).",
            getProfile().weak && getProfile().weak.length
              ? `\nWORDS HE FINDS HARD (use several of them again, naturally, so the story repeats them): ${getProfile().weak.join(", ")}`
              : "",
            canon ? `\n${canon.forPrompt()}` : "",
            `\nSERIES BIBLE:\n${bible}`,
            `\nSTORY SO FAR:\n${storySoFar}`,
            `\nKNOWN WORDS (no dictionary entry needed):\n${known.join(", ")}`,
            `\n${catalogText(catalog3d)}`,
            ex3d ? `\nEXAMPLE EPISODE (same format; do not copy the story):\n${ex3d}` : "",
          ].join("\n"),
        },
      ];
    }
    return [
      { role: "system", content: RULES },
      {
        role: "user",
        content: [
          `Write episode ${id}. Its "id" must be "${id}".`,
          note ? `\nNOTE FROM THE PARENT (follow it): ${note}` : "",
          `\nHERO NAME: ${getProfile().name ? `"${getProfile().name}"` : "not typed yet"}. ` +
            "A character may call him by name, rarely, and only by writing {name} in the text (the game puts the real name there).",
          getProfile().weak && getProfile().weak.length
            ? `\nWORDS HE FINDS HARD (use several of them again, naturally, so the story repeats them): ${getProfile().weak.join(", ")}`
            : "",
          canon ? `\n${canon.forPrompt()}` : "",
          `\nSERIES BIBLE:\n${bible}`,
          `\nSTORY SO FAR:\n${storySoFar}`,
          `\nKNOWN WORDS (no dictionary entry needed):\n${known.join(", ")}`,
          `\nEXISTING PICTURES (reuse the key when it fits):\n${pictures}`,
          example ? `\nEXAMPLE EPISODE (same format; do not copy the story):\n${JSON.stringify(example.data)}` : "",
        ].join("\n"),
      },
    ];
  }

  // Small fixes so the model's answer fits the engine.
  function normalize(ep, id) {
    ep.id = id;
    const fixRule = (r) => {
      r.obj = r.obj && r.obj.length ? r.obj : null;
      if (!r.points) { delete r.points; delete r.pointsId; }
      return r;
    };
    for (const sc of ep.scenes) sc.rules = sc.rules.map(fixRule);
    ep.globalRules = (ep.globalRules || []).map(fixRule);
    const seen = new Set();
    ep.dictionary = (ep.dictionary || []).map((d) => ({ en: d.en.toLowerCase().trim(), he: d.he.trim() }))
      .filter((d) => d.en && !seen.has(d.en) && seen.add(d.en));
    ep.art = (ep.art || []).map((a) => ({ ...a, key: a.key.toLowerCase().trim() }));
    ep.canon = ep.canon || { facts: [], openedThreads: [], resolvedThreads: [] };
    return ep;
  }

  // The model often forgets a few Hebrew translations. Instead of sending the whole episode back for that, one small
  // question asks for just the missing words.
  const TRANSLATE_SCHEMA = {
    type: "object", additionalProperties: false, required: ["words"],
    properties: { words: { type: "array", items: { type: "object", additionalProperties: false, required: ["en", "he"],
      properties: { en: { type: "string" }, he: { type: "string" } } } } },
  };
  async function fillDictionary(ep, stage) {
    const have = checkContext(ep).dict;
    const missing = [...Episode.wordsIn(Episode.texts(ep))].filter((w) => !have[w]);
    if (!missing.length || missing.length > 80) return 0;
    const answer = await chatJson(env, {
      name: "translations", schema: TRANSLATE_SCHEMA,
      messages: [
        { role: "system", content: "You translate English words into Hebrew for a 15-year-old who is learning English from an adventure game. " +
          "Give the short, natural Hebrew meaning of each word as it is used in a game. For a verb form (gives, went, falling) " +
          "give the Hebrew for that form. Answer with every word you were given, using the exact English spelling." },
        { role: "user", content: missing.join(", ") },
      ],
    });
    const got = new Map((answer.json.words || []).map((d) => [String(d.en).toLowerCase().trim(), String(d.he).trim()]));
    let added = 0;
    for (const w of missing) {
      if (got.get(w)) { ep.dictionary.push({ en: w, he: got.get(w) }); added++; }
    }
    stage("words", `${added} missing translations were added (${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ", ..." : ""})`);
    return answer.usage.total_tokens || 0;
  }

  // objects whose only problem is "no free place to stand in front of it" and that nothing in the episode uses
  function dropUnusedUnplaceable(ep, errors) {
    const dropped = [];
    for (const e of errors) {
      const m = /^scene (\S+): (\S+): no free place to stand/.exec(e);
      if (!m) continue;
      const [, sceneId, objId] = m;
      const sc = ep.scenes.find((s) => s.id === sceneId);
      if (!sc) continue;
      const text = JSON.stringify([sc.rules, ep.globalRules, sc.objects.filter((o) => o.id !== objId).map((o) => [o.near, o.on, o.inside, o.of])]);
      const used = text.includes(`"${objId}"`) || ep.start.goal === objId;
      const isItem = (ep.items || []).some((i) => i.id === objId);
      if (!used && !isItem) { sc.objects = sc.objects.filter((o) => o.id !== objId); dropped.push(objId); }
    }
    return dropped;
  }

  async function write(note = "", opts = {}) {
    if (writing) throw new Error("Already writing an episode");
    // The next episode continues the story of the approved ones, so a waiting draft must be decided first.
    if (index.drafts.some((d) => d.status === "ready")) throw new Error("Approve or reject the waiting draft first");
    if (!env.OPENAI_API_KEY) throw new Error("Set OPENAI_API_KEY to write episodes");
    writing = true;
    lastAttempt = Date.now();
    const id = opts.id || nextId();
    index.drafts = index.drafts.filter((d) => d.id !== id);
    const record = { id, status: "writing", createdAt: new Date().toISOString(), note };
    index.drafts.push(record);
    saveIndex();
    log(`Writing episode ${id}${note ? ` (note: ${note})` : ""}`);
    try {
      const messages = prompt(id, note);
      const stage = stagesOf(record);
      const threeD = use3d();
      stage("start", threeD ? "3D: rooms and props from the catalog" : "2D: pictures");
      let ep = null, laid = null, result = null, tokens = 0, cost = 0, lastSignature = null;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        stage("ask", `OpenAI writes the episode (try ${attempt})`);
        const answer = await chatJson(env, { name: "episode", schema: threeD ? schema3d : SCHEMA, messages });
        tokens += answer.usage.total_tokens || 0;
        cost += costOf(env.OPENAI_MODEL || "gpt-5-mini", answer.usage);
        const thinking = (answer.usage.completion_tokens_details || {}).reasoning_tokens;
        stage("answer", `${answer.usage.total_tokens || 0} tokens` + (thinking != null ? ` (${thinking} of them thinking)` : ""));
        ep = threeD ? normalize3d(answer.json, id) : normalize(answer.json, id);
        laid = null;
        try { tokens += await fillDictionary(ep, stage); } catch (e) { log(`Translating missing words failed: ${e.message}`); }
        if (threeD) {
          // a bug in the layout must not lose the whole episode: it becomes a problem the writer is asked to fix
          try {
            laid = applyLayout(ep, catalog3d);
            // Decoration that has no place is simply left out (the model need not be asked again for that):
            // a thing no rule talks about and nothing else needs.
            const dropped = dropUnusedUnplaceable(ep, laid.errors);
            if (dropped.length) {
              stage("layout", `left out (no room, not needed by any rule): ${dropped.join(", ")}`);
              laid = applyLayout(ep, catalog3d);
            }
          } catch (e) {
            log(`Layout failed: ${e.message}`);
            laid = { episode: ep, errors: [`the room could not be laid out (${e.message}): check that every object has a prop, or "of" and "part" for a door or window of another object in the same scene`], warnings: [] };
          }
          stage("layout", laid.errors.length ? `${laid.errors.length} problems placing things` : "everything placed");
        }
        result = validate(laid ? laid.episode : ep, checkContext(ep));
        if (laid && laid.errors.length) { result.errors = [...laid.errors, ...result.errors]; result.ok = false; }
        stage("checks", result.ok ? "all checks passed" : `${result.errors.length} problems`);
        if (result.ok) break;
        // the same problems twice in a row: another try only costs money, the model is not going to fix them
        const signature = JSON.stringify(result.errors);
        if (signature === lastSignature) {
          stage("repair", "the same problems came back unchanged: stopping, to save money");
          break;
        }
        lastSignature = signature;
        log(`Episode ${id} try ${attempt}: ${result.errors.length} problems`);
        messages.push({ role: "assistant", content: answer.text });
        messages.push({ role: "user", content: `The checks found these problems. Fix all of them and send the whole episode again:\n- ${result.errors.join("\n- ")}` });
        stage("repair", result.errors.slice(0, 6).join(" | "));
      }
      const finalEp = laid ? laid.episode : ep;
      // the robot's way through the episode, so the game's own robot can play the draft (video, checks)
      if (result.solution && result.solution.actions) finalEp.solution = result.solution.actions;
      fs.writeFileSync(fileOf(id, "drafts"), JSON.stringify(finalEp, null, 2));
      Object.assign(record, {
        status: result.ok ? "ready" : "failed",
        title: ep.title,
        errors: result.errors,
        warnings: [...(laid ? laid.warnings : []), ...result.warnings],
        newWords: result.newWords,
        steps: result.solution && result.solution.steps,
        wishes: ep.wishes || [],
        tokens,
        costUsd: Math.round(cost * 1000) / 1000,   // an estimate from list prices
      });
      stage(result.ok ? "ready" : "failed", result.ok ? "ready for a parent to try and approve" : "still has problems");
      saveIndex();
      lastError = result.ok ? null : `Episode ${id} still has problems`;
      log(`Episode ${id} "${ep.title}": ${result.ok ? "ready for a parent" : "has problems"} (${tokens} tokens)`);
      if ((ep.wishes || []).length) {
        // things the story wished for that the catalog does not have yet: a list to build from
        const wf = path.join(dataDir, "wishes.json");
        let all = [];
        try { all = JSON.parse(fs.readFileSync(wf, "utf8")); } catch { /* first one */ }
        for (const w of ep.wishes) all.push({ episode: id, kind: w.kind, text: w.text, at: new Date().toISOString(), done: false });
        fs.writeFileSync(wf, JSON.stringify(all.slice(-200), null, 2));
        log(`Wishes from ${id}: ${ep.wishes.map((w) => `${w.kind}: ${w.text}`).join("; ")}`);
      }
      if (result.ok) {
        if (!threeD) {
          const queued = art.queueNew(ep.art.map((a) => a.key));
          if (queued.length) log(`Pictures queued for ${id}: ${queued.join(", ")}`);
        }
        if (env.AUTO_PUBLISH === "true") approve(id);
      }
      return record;
    } catch (e) {
      Object.assign(record, { status: "failed", errors: [e.message] });
      saveIndex();
      lastError = e.message;
      log(`Episode writer error: ${e.message}`);
      throw e;
    } finally {
      writing = false;
    }
  }

  // An episode that was made somewhere else (the dev PC) joins as a draft waiting for approval, after the same
  // checks as one the writer made. The rooms are laid out again with this server's catalog.
  function importDraft(episode, source = "imported") {
    if (writing) throw new Error("Already writing an episode");
    const id = String(episode && episode.id);
    if (!/^s\d+e\d+$/.test(id)) throw new Error("The episode needs an id like s1e3");
    if (getContent().episodes.some((e) => e.id === id)) throw new Error(`Episode ${id} is already published`);
    if (index.drafts.some((d) => d.id === id && d.status === "ready")) throw new Error(`Episode ${id} is already waiting for approval`);
    let ep = JSON.parse(JSON.stringify(episode));
    delete ep.solution;
    let warnings = [];
    if (ep.format === "3d") {
      if (!catalog3d) throw new Error("This server has no catalog for a 3D episode");
      const laid = applyLayout(ep, catalog3d);
      if (laid.errors.length) throw new Error(`The rooms do not fit: ${laid.errors.join("; ")}`);
      ep = laid.episode;
      warnings = laid.warnings;
    }
    const result = validate(ep, checkContext(ep));
    if (!result.ok) throw new Error(`The checks found problems: ${result.errors.slice(0, 5).join("; ")}`);
    if (result.solution && result.solution.actions) ep.solution = result.solution.actions;
    index.drafts = index.drafts.filter((d) => d.id !== id);
    fs.writeFileSync(fileOf(id, "drafts"), JSON.stringify(ep, null, 2));
    index.drafts.push({
      id, status: "ready", createdAt: new Date().toISOString(), note: `from ${source}`, title: ep.title, errors: [],
      warnings: [...warnings, ...result.warnings], newWords: result.newWords, steps: result.solution && result.solution.steps,
      wishes: ep.wishes || [], tokens: 0, costUsd: 0,
      stages: [{ at: new Date().toISOString(), what: "import", detail: `brought from ${source}, checked again here: all checks passed` }],
    });
    saveIndex();
    log(`Episode ${id} imported from ${source}`);
    return id;
  }

  function approve(id) {
    const d = index.drafts.find((x) => x.id === id);
    if (!d || d.status !== "ready") throw new Error("No ready draft with that id");
    if (canon) {
      try { canon.merge(readDraft(id).canon, id); } catch { /* no canon in this draft */ }
    }
    fs.renameSync(fileOf(id, "drafts"), fileOf(id, "published"));
    index.drafts = index.drafts.filter((x) => x.id !== id);
    index.published.push(id);
    saveIndex();
    reload();
    log(`Episode ${id} published`);
  }

  function reject(id, note) {
    const d = index.drafts.find((x) => x.id === id);
    if (!d) throw new Error("No draft with that id");
    if (d.status === "writing") throw new Error("Still writing");
    try { fs.unlinkSync(fileOf(id, "drafts")); } catch { /* already gone */ }
    index.drafts = index.drafts.filter((x) => x.id !== id);
    saveIndex();
    log(`Episode ${id} rejected${note ? `: ${note}` : ""}`);
  }

  // Pictures listed by drafts (so they are made before approval) and by published episodes.
  function episodeShots() {
    const eps = [...getContent().episodes.map((e) => e.data),
      ...index.drafts.filter((d) => d.status === "ready").map((d) => { try { return readDraft(d.id); } catch { return null; } }).filter(Boolean)];
    return eps.flatMap((ep) => (ep.art || []).map((a) => ({ ...a, episode: ep.id })));
  }

  // A background was chosen: find where its things are, and update every scene that uses it.
  // Published episodes and drafts are changed in their files; built-in episodes get an override file.
  async function placeThings(key) {
    const png = art.rawPath(key) && fs.existsSync(art.rawPath(key)) ? fs.readFileSync(art.rawPath(key)) : null;
    if (!png || !env.OPENAI_API_KEY) return;
    let reloadNeeded = false;
    const save = (t, ep) => {
      fs.writeFileSync(t.file, JSON.stringify(ep, null, 2));
      if (t.published) reloadNeeded = true;
    };
    for (const t of [
      ...index.published.map((id) => ({ id, file: fileOf(id, "published"), published: true })),
      ...index.drafts.filter((d) => d.status === "ready").map((d) => ({ id: d.id, file: fileOf(d.id, "drafts") })),
    ]) {
      const ep = JSON.parse(fs.readFileSync(t.file, "utf8"));
      let changed = false;
      for (const sc of ep.scenes.filter((s) => s.art === key)) {
        Object.assign(sc, await placeScene(sc, png, key, t.id));
        changed = true;
      }
      if (changed) save(t, ep);
    }
    for (const id of BUILTIN) {
      const ep = (getContent().episodes.find((e) => e.id === id) || {}).data;
      if (!ep || !ep.scenes.some((s) => s.art === key)) continue;
      const override = readOverride(dataDir, id);
      override.scenes = override.scenes || {};
      for (const sc of ep.scenes.filter((s) => s.art === key)) {
        const placed = await placeScene(JSON.parse(JSON.stringify(sc)), png, key, id);
        override.scenes[sc.id] = {
          floor: placed.floor, walk: placed.walk || null, heroHeight: placed.heroHeight || null, entry: placed.entry,
          boxes: Object.fromEntries(placed.objects.map((o) => [o.id, o.box])),
        };
      }
      fs.mkdirSync(path.dirname(overrideFile(dataDir, id)), { recursive: true });
      save({ file: overrideFile(dataDir, id), published: true }, override);
    }
    if (reloadNeeded) reload();
  }

  // Ask OpenAI where the scene's fixed things are in the picture, and move the sprites that stand on the
  // ground (characters, things lying on the floor) onto the new floor. Returns the changed scene.
  async function placeScene(sc, png, key, id) {
    const fixed = sc.objects.filter((o) => !o.sprite);
    const found = await locate(env, png, fixed.map((o) => ({ id: o.id, name: o.name, look: o.look })));
    const oldFloor = sc.floor || { y0: 0, y1: 199 };
    sc.floor = found.floor;
    sc.walk = found.walk || null; // null: no outline found, the floor band is used
    if (found.heroHeight) sc.heroHeight = found.heroHeight;
    const floor = Walk.outline(sc);
    for (const o of sc.objects) {
      if (!o.sprite && found.boxes[o.id]) o.box = found.boxes[o.id];
      if (o.sprite && o.box) {
        const bottom = o.box[1] + o.box[3];
        if (bottom < oldFloor.y0 - 4) continue; // on a table or a wall: leave it
        // People and things standing on the floor: put their feet on the nearest floor point.
        const [fx, fy] = Walk.nearest(floor, o.box[0] + o.box[2] / 2, bottom).map(Math.round);
        o.box = [Math.max(0, fx - Math.round(o.box[2] / 2)), Math.max(0, fy - o.box[3]), o.box[2], o.box[3]];
      }
    }
    const [ex, ey] = Walk.nearest(floor, sc.entry.x, sc.entry.y).map(Math.round);
    sc.entry = { x: ex, y: ey };
    log(`Found things in "${key}" for ${id}/${sc.id}: ${Object.keys(found.boxes).join(", ") || "none"}` +
      (found.walk ? `; floor outline with ${found.walk.length} points` : "") +
      (found.heroHeight ? `; people ${found.heroHeight} pixels tall` : ""));
    return sc;
  }

  // Keep a few episodes ready: write when nothing waits for a parent and fewer than `ahead` are unplayed.
  function maybeWrite(unplayedCount, opts = {}) {
    const ahead = Number(env.EPISODES_AHEAD || 2);
    if (!env.OPENAI_API_KEY || writing || env.AUTO_WRITE === "false") return;
    if (index.drafts.some((d) => d.status === "ready" || d.status === "writing")) return;
    if (unplayedCount >= ahead) return;
    if (!opts.scheduled && Date.now() - lastAttempt < 6 * 60 * 60 * 1000) return; // at most every 6 hours, also after errors
    write().catch(() => { /* logged */ });
  }

  function list() {
    return {
      enabled: !!env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || "gpt-5-mini",
      autoPublish: env.AUTO_PUBLISH === "true",
      writing,
      lastError,
      nextId: nextId(),
      drafts: index.drafts,
      published: index.published,
    };
  }

  return { write, approve, reject, importDraft, readDraft, list, episodeShots, placeThings, maybeWrite, SCHEMA };
}

module.exports = { createWriter, SCHEMA, RULES };

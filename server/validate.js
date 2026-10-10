// Checks an episode before he can play it: references, picture boxes, words with Hebrew,
// sentence length, how many new words, and (most important) that a robot can play it to the end.

const Episode = require("../js/episode");

const TWO_STEP = new Set(["use", "give"]);
const W = 320, H = 200;

// Plays every possible action (breadth first) until the episode ends. Returns the shortest solution.
function solve(game, { maxStates = 30000 } = {}) {
  const keyOf = (s) => `${s.scene}|${[...s.flags].sort().join(",")}|${[...s.bag].sort().join(",")}`;
  const start = { scene: game.start.scene, flags: new Set(), bag: [], path: [] };
  const queue = [start];
  const seen = new Set([keyOf(start)]);

  while (queue.length) {
    const st = queue.shift();
    const read = { flag: (f) => st.flags.has(f), has: (i) => st.bag.includes(i) };
    const sc = game.scenes[st.scene];
    const objs = [...sc.objects.filter((o) => !o.visible || o.visible(read)).map((o) => o.id), ...st.bag];
    for (const v of Episode.VERBS) {
      for (const o of objs) {
        for (const it of TWO_STEP.has(v) ? st.bag : [null]) {
          const rule = Episode.findRule(game, st.scene, v, o, it, read);
          if (!rule || !rule.run) continue;
          const next = { scene: st.scene, flags: new Set(st.flags), bag: [...st.bag], path: [...st.path, [v, it, o].filter(Boolean).join(" ")] };
          let done = false;
          rule.run({
            flag: (f) => next.flags.has(f),
            has: (i) => next.bag.includes(i),
            set: (f) => next.flags.add(f),
            unset: (f) => next.flags.delete(f),
            add: (i) => { if (!next.bag.includes(i)) next.bag.push(i); },
            remove: (i) => { next.bag = next.bag.filter((x) => x !== i); },
            goal: () => {},
            go: (s) => { next.scene = s; },
            finish: () => { done = true; },
          });
          if (done) return { solved: true, steps: next.path, states: seen.size };
          const k = keyOf(next);
          if (!seen.has(k)) {
            if (seen.size >= maxStates) return { solved: false, steps: null, states: seen.size, tooBig: true };
            seen.add(k);
            queue.push(next);
          }
        }
      }
    }
  }
  return { solved: false, steps: null, states: seen.size };
}

// ctx: { base, dict (all known English -> Hebrew, including this episode's), knownWords (Set from
//        earlier episodes), functionWords (Set), artKeys (Set of picture keys that already exist) }
function validate(ep, ctx) {
  const errors = [], warnings = [];
  const err = (m) => errors.push(m);
  const list = (v) => (v == null ? [] : [].concat(v));

  if (!/^s\d+e\d+$/.test(ep.id || "")) err(`id must look like s1e2, got "${ep.id}"`);
  const scenes = new Map(list(ep.scenes).map((s) => [s.id, s]));
  const items = new Set(list(ep.items).map((i) => i.id));
  const goals = new Set(list(ep.goals).map((g) => g.id));
  const artKeys = new Set([...ctx.artKeys, ...list(ep.art).map((a) => a.key)]);
  if (scenes.size !== list(ep.scenes).length) err("scene ids must be different");
  if (!scenes.size) err("the episode needs scenes");
  if (!ep.start || !scenes.has(ep.start.scene)) err("start.scene must be a scene id");
  if (!ep.start || !goals.has(ep.start.goal)) err("start.goal must be a goal id");
  for (const a of list(ep.art)) {
    if (!/^[a-z0-9-]{1,40}$/.test(a.key)) err(`art key "${a.key}" must be lowercase letters, numbers and -`);
    if (!["background", "character", "item"].includes(a.kind)) err(`art "${a.key}" kind must be background, character or item`);
  }

  const checkCond = (c, where) => {
    if (!c) return;
    for (const i of [...list(c.has), ...list(c.notHas)]) if (!items.has(i)) err(`${where}: unknown item "${i}"`);
  };
  const checkRule = (r, where, objIds) => {
    if (!list(r.verb).length) err(`${where}: rule needs a verb`);
    for (const v of list(r.verb)) if (!Episode.VERBS.includes(v)) err(`${where}: unknown verb "${v}"`);
    for (const o of list(r.obj)) if (!objIds.has(o) && !items.has(o)) err(`${where}: unknown object "${o}"`);
    if (r.item && !items.has(r.item)) err(`${where}: unknown item "${r.item}"`);
    if (r.item && !list(r.verb).every((v) => TWO_STEP.has(v))) err(`${where}: only use and give rules can have an item`);
    if (!r.say) err(`${where}: rule needs "say"`);
    checkCond(r.when, where);
    const d = r.do || {};
    for (const i of [...list(d.add), ...list(d.remove)]) if (!items.has(i)) err(`${where}: unknown item "${i}"`);
    if (d.goal && !goals.has(d.goal)) err(`${where}: unknown goal "${d.goal}"`);
    if (d.go && !scenes.has(d.go)) err(`${where}: unknown scene "${d.go}"`);
    for (const f of list(d.fx)) if (!Episode.FX.includes(f)) err(`${where}: unknown effect "${f}"`);
  };

  const allObjIds = new Set();
  for (const sc of scenes.values()) {
    const where = `scene ${sc.id}`;
    const ids = new Set(sc.objects.map((o) => o.id));
    if (ids.size !== sc.objects.length) err(`${where}: object ids must be different`);
    ids.forEach((i) => allObjIds.add(i));
    if (sc.music && !Episode.MUSIC.includes(sc.music)) err(`${where}: unknown music "${sc.music}"`);
    const ega = String(sc.art || "").startsWith("ega:");
    if (!ega) {
      if (!artKeys.has(sc.art)) err(`${where}: picture "${sc.art}" is not in the art list`);
      const f = sc.floor || {};
      if (!(f.y0 >= 60 && f.y1 <= H - 2 && f.y1 - f.y0 >= 15)) err(`${where}: floor must be inside 60..198 and at least 15 high`);
      const e = sc.entry || {};
      if (!(e.x >= 0 && e.x <= W && e.y >= f.y0 && e.y <= f.y1)) err(`${where}: entry must be on the floor`);
      for (const o of sc.objects) {
        const b = o.box;
        if (!Array.isArray(b) || b.length !== 4 || b[2] < 4 || b[3] < 4 || b[0] < 0 || b[1] < 0 || b[0] + b[2] > W || b[1] + b[3] > H) {
          err(`${where}: object ${o.id} needs box [x, y, w, h] inside 320x200`);
        }
        if (o.sprite && !artKeys.has(o.sprite)) err(`${where}: sprite "${o.sprite}" is not in the art list`);
      }
    }
    for (const o of sc.objects) {
      if (!o.name || !o.look || !list(o.words).length) err(`${where}: object ${o.id} needs name, look and words`);
      checkCond(o.visible, `${where} object ${o.id}`);
    }
    list(sc.rules).forEach((r, i) => checkRule(r, `${where} rule ${i + 1}`, ids));
  }
  list(ep.globalRules).forEach((r, i) => checkRule(r, `global rule ${i + 1}`, allObjIds));
  for (const it of list(ep.items)) if (it.art && !artKeys.has(it.art)) err(`item ${it.id}: picture "${it.art}" is not in the art list`);

  // Words and sentences
  const texts = Episode.texts(ep);
  const missing = [...Episode.wordsIn(texts)].filter((w) => !ctx.dict[w]);
  if (missing.length) err(`these words need a Hebrew translation in "dictionary": ${missing.join(", ")}`);
  for (const t of texts) {
    const n = (t.match(Episode.WORD) || []).length;
    if (n > 30) err(`too long (${n} words, max 30): "${t.slice(0, 60)}..."`);
  }
  const newWords = [...Episode.wordsIn(texts)].filter((w) => !ctx.knownWords.has(w) && !ctx.functionWords.has(w));
  if (ctx.knownWords.size && newWords.length > 35) err(`too many new words (${newWords.length}, max 35)`);
  if (ctx.knownWords.size && newWords.length < 5) warnings.push(`only ${newWords.length} new words`);

  // Can it be finished?
  let solution = null;
  if (!errors.length) {
    const game = Episode.compile(ep, ctx.base);
    solution = solve(game);
    if (!solution.solved) {
      err(solution.tooBig
        ? "the episode has too many possible states; make the puzzles simpler"
        : "the episode can not be finished: no way to reach a rule with do.finish = true");
    } else if (solution.steps.length < 6) {
      warnings.push(`the episode is very short (${solution.steps.length} steps)`);
    }
  }
  return { ok: !errors.length, errors, warnings, newWords, solution };
}

module.exports = { validate, solve };

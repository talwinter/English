// Checks an episode before he can play it: references, picture boxes, words with Hebrew,
// sentence length, how many new words, and (most important) that a robot can play it to the end.

const Episode = require("../js/episode");

const TWO_STEP = new Set(["use", "give"]);
const W = 320, H = 200;

// Plays every possible action (breadth first) until the episode ends. Returns the shortest solution.
function solve(game, { maxStates = 30000 } = {}) {
  const keyOf = (s) => `${s.scene}|${[...s.flags].sort().join(",")}|${[...s.bag].sort().join(",")}`;
  const start = { scene: game.start.scene, flags: new Set(), bag: [], path: [], acts: [] };
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
          const next = { scene: st.scene, flags: new Set(st.flags), bag: [...st.bag], path: [...st.path, [v, it, o].filter(Boolean).join(" ")],
            acts: [...st.acts, { verb: v, obj: o, item: it || "" }] };
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
          if (done) return { solved: true, steps: next.path, actions: next.acts, states: seen.size };
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
// Says what is missing on the way to the ending, so the writer knows what to fix (a bare "can not be finished"
// gave it nothing to work with): for every finishing rule, the flags and items it needs that nothing ever gives.
function whyUnfinished(ep, scenes) {
  const list = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  const rules = [...[...scenes.values()].flatMap((sc) => list(sc.rules).map((r) => ({ r, scene: sc.id }))),
    ...list(ep.globalRules).map((r) => ({ r, scene: null }))];
  const setFlags = new Set(rules.flatMap(({ r }) => list((r.do || {}).set)));
  const addedItems = new Set(rules.flatMap(({ r }) => list((r.do || {}).add)));
  const goScenes = new Set(rules.flatMap(({ r }) => list([(r.do || {}).go])));
  const finishers = rules.filter(({ r }) => (r.do || {}).finish);
  if (!finishers.length) return " There is NO rule with do.finish = true: the ending needs one.";
  const notes = [];
  for (const { r, scene } of finishers) {
    const w = r.when || {};
    const lacks = [
      ...list(w.flags).filter((f) => !setFlags.has(f)).map((f) => `flag "${f}" is never set by any rule`),
      ...list(w.has).filter((i) => !addedItems.has(i)).map((i) => `item "${i}" is never added by any rule`),
    ];
    if (r.item && !addedItems.has(r.item)) lacks.push(`item "${r.item}" is never added by any rule`);
    if (scene && ![...goScenes].includes(scene) && scene !== ep.start.scene) lacks.push(`no rule has do.go = "${scene}", so he can never get to that scene`);
    notes.push(`The finishing rule in ${scene || "global rules"} (verb ${list(r.verb).join("/")} on ${list(r.obj).join("/") || "anything"})` +
      (lacks.length ? ` can not be reached: ${lacks.join("; ")}.` : " has its conditions available, but the steps before it do not lead there: check the order of the rules (the first matching rule wins), the goals and the flags."));
  }
  return " " + notes.join(" ");
}

function validate(ep, ctx) {
  // an episode that is already laid out in 3D is checked as 3D, even when the caller did not hand over the catalog
  if (!ctx.catalog && ep.format === "3d") {
    try { ctx = { ...ctx, catalog: require("./episode3d").loadCatalog() }; } catch { /* no catalog */ }
  }
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
    const both = list((r.do || {}).add).filter((i) => list((r.do || {}).remove).includes(i));
    if (both.length) err(`${where}: do.add and do.remove both contain "${both.join('", "')}": the item would be given and taken away in the same step. ` +
      "Use add to give an item, remove only for an item he already has and gives away or uses");
    checkCond(r.when, where);
    const d = r.do || {};
    for (const i of [...list(d.add), ...list(d.remove)]) if (!items.has(i)) err(`${where}: unknown item "${i}"`);
    if (d.goal && !goals.has(d.goal)) err(`${where}: unknown goal "${d.goal}"`);
    if (d.go && !scenes.has(d.go)) err(`${where}: unknown scene "${d.go}"`);
    for (const f of list(d.fx)) if (!Episode.FX.includes(f)) err(`${where}: unknown effect "${f}"`);
    if (d.timer) {
      const t = d.timer;
      if (!(Number.isInteger(t.seconds) && t.seconds >= 10 && t.seconds <= 90)) err(`${where}: do.timer.seconds must be a whole number from 10 to 90`);
      const e = t.onEnd || {};
      if (!e.say) err(`${where}: do.timer.onEnd needs "say" (what happens when the time is up)`);
      if (e.go && !scenes.has(e.go)) err(`${where}: do.timer.onEnd: unknown scene "${e.go}"`);
      if (e.goal && !goals.has(e.goal)) err(`${where}: do.timer.onEnd: unknown goal "${e.goal}"`);
      if (e.finish) err(`${where}: do.timer.onEnd can not finish the episode: running out of time must only send him back to try again`);
    }
  };

  const threeD = !!ctx.catalog;
  const allObjIds = new Set();
  for (const sc of scenes.values()) {
    const where = `scene ${sc.id}`;
    const ids = new Set(sc.objects.map((o) => o.id));
    if (ids.size !== sc.objects.length) err(`${where}: object ids must be different`);
    ids.forEach((i) => allObjIds.add(i));
    if (sc.music && !Episode.MUSIC.includes(sc.music)) err(`${where}: unknown music "${sc.music}"`);
    const ega = threeD || String(sc.art || "").startsWith("ega:");
    if (threeD) {
      // rooms and props come from the catalog (the layout builder checks the placing)
      if (!ctx.catalog.shells[sc.shell]) err(`${where}: the room "${sc.shell}" is not in the catalog`);
      for (const o of sc.objects) {
        if (o.of) {
          if (!ids.has(o.of)) err(`${where}: object ${o.id} is a part of "${o.of}", which is not in this scene`);
          if (!o.part) err(`${where}: object ${o.id} needs "part" (door or window)`);
        } else if (!o.prop) err(`${where}: object ${o.id} needs a prop from the catalog`);
        else if (!String(o.prop).startsWith("@") && !ctx.catalog.props[o.prop]) err(`${where}: object ${o.id}: there is no prop "${o.prop}"`);
        for (const k of ["near", "on", "inside"]) if (o[k] && !ids.has(o[k])) err(`${where}: object ${o.id}: ${k} "${o[k]}" is not in this scene`);
      }
      if (sc.objects.length > 10) warnings.push(`${where}: ${sc.objects.length} objects is a lot for one room`);
    }
    if (!ega) {
      if (!artKeys.has(sc.art)) err(`${where}: picture "${sc.art}" is not in the art list`);
      const f = sc.floor || {};
      if (!(f.y0 >= 60 && f.y1 <= H - 2 && f.y1 - f.y0 >= 15)) err(`${where}: floor must be inside 60..198 and at least 15 high`);
      if (sc.walk != null && !(Array.isArray(sc.walk) && sc.walk.length >= 3 && sc.walk.every((p) => Array.isArray(p) && p.length === 2))) {
        err(`${where}: walk must be the floor outline [[x, y], ...] with at least 3 points`);
      }
      const e = sc.entry || {};
      if (!(e.x >= 0 && e.x <= W && e.y >= f.y0 && e.y <= f.y1)) err(`${where}: entry must be on the floor`);
      for (const o of sc.objects) {
        const b = o.box;
        if (!Array.isArray(b) || b.length !== 4 || b[2] < 4 || b[3] < 4 || b[0] < 0 || b[1] < 0 || b[0] + b[2] > W || b[1] + b[3] > H) {
          err(`${where}: object ${o.id} needs box [x, y, w, h] inside 320x200`);
        }
        const person = Episode.CHARACTERS.includes(o.sprite);
        if (o.sprite && !person && !artKeys.has(o.sprite)) err(`${where}: sprite "${o.sprite}" is not in the art list`);
        if (o.pose && !(person && o.pose === "lying")) err(`${where}: object ${o.id}: pose "lying" is only for people (${Episode.CHARACTERS.join(", ")})`);
      }
    }
    for (const o of sc.objects) {
      if (!o.name || !o.look || !list(o.words).length) err(`${where}: object ${o.id} needs name, look and words`);
      checkCond(o.visible, `${where} object ${o.id}`);
    }
    list(sc.rules).forEach((r, i) => checkRule(r, `${where} rule ${i + 1}`, ids));
  }
  list(ep.globalRules).forEach((r, i) => checkRule(r, `global rule ${i + 1}`, allObjIds));
  for (const it of list(ep.items)) if (!threeD && it.art && !artKeys.has(it.art)) err(`item ${it.id}: picture "${it.art}" is not in the art list`);

  // a timer must be possible to stop: the winning move has do.stopTimer
  const rulesAll = [...[...scenes.values()].flatMap((sc) => list(sc.rules)), ...list(ep.globalRules)];
  if (rulesAll.some((r) => (r.do || {}).timer) && !rulesAll.some((r) => (r.do || {}).stopTimer)) {
    err("an episode that starts a timer needs a rule with do.stopTimer = true: the move that wins stops the clock");
  }

  // every item must be possible to get: some rule adds it
  const added = new Set();
  for (const sc of scenes.values()) for (const r of list(sc.rules)) for (const i of list((r.do || {}).add)) added.add(i);
  for (const r of list(ep.globalRules)) for (const i of list((r.do || {}).add)) added.add(i);
  for (const it of list(ep.items)) {
    if (!added.has(it.id)) err(`item ${it.id} can never be picked up: no rule has do.add containing "${it.id}". Add a rule that gives it (taking the object, a trade, a gift) or remove the item`);
  }

  if (threeD && !list(ep.previously).length && ep.id !== "s1e0") warnings.push('the episode has no "previously" recap');

  // Words and sentences
  const texts = Episode.texts(ep);
  const missing = [...Episode.wordsIn(texts)].filter((w) => !ctx.dict[w]);
  if (missing.length) err(`these words need a Hebrew translation in "dictionary": ${missing.join(", ")}`);
  for (const t of texts) {
    const n = (t.match(Episode.WORD) || []).length;
    if (n > 30) err(`too long (${n} words, max 30): "${t.slice(0, 60)}..."`);
  }
  const newWords = [...Episode.wordsIn(texts)].filter((w) => !ctx.knownWords.has(w) && !ctx.functionWords.has(w));
  const maxNew = ctx.maxNewWords || 45;
  if (ctx.knownWords.size && newWords.length > maxNew) err(`too many new words (${newWords.length}, max ${maxNew}). Use simpler words that he already knows, or fewer of them. The new words are: ${newWords.join(", ")}`);
  if (ctx.knownWords.size && newWords.length < 5) warnings.push(`only ${newWords.length} new words`);

  // Can it be finished?
  let solution = null;
  if (!errors.length) {
    const game = Episode.compile(ep, ctx.base);
    solution = solve(game);
    if (!solution.solved) {
      err(solution.tooBig
        ? "the episode has too many possible states; make the puzzles simpler"
        : "the episode can not be finished: no way to reach a rule with do.finish = true." + whyUnfinished(ep, scenes));
    } else if (solution.steps.length < 5) {
      err(`the episode is too short: the robot finishes it in ${solution.steps.length} steps. The puzzle chain must be needed to ` +
        "finish (an item he must take and use, a person he must talk to or give something to), at least 5 steps, and nothing important may be skippable");
    }
  }
  return { ok: !errors.length, errors, warnings, newWords, solution };
}

module.exports = { validate, solve };

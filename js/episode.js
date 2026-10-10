// Episodes are plain data (JSON), so the episode writer can make them. This file turns that data
// into the game's rules, and is shared by the browser (the game) and the server (checks and solver).
//
// Episode format (all lists, so it fits OpenAI's structured output):
//   { id, title, summary, start: {scene, goal}, items: [...], goals: [...], scenes: [...],
//     globalRules: [...], ending: [...], dictionary: [{en, he}], art: [{key, kind, height, prompt}] }
// A scene: { id, name, intro, introAgain, art, floor: {y0, y1}, entry: {x, y}, objects: [...], rules: [...] }
//   art "ega:<name>" uses the built-in drawings in art.js; any other art is a picture key (/art/<key>.png),
//   with objects placed by box [x, y, w, h] on a 320x200 picture.
// An object: { id, name, words, look, box, sprite, visible: <condition> }
// A rule: { verb: [...], obj: [...] or null, item, when: <condition>, say, do: <effects>, points, pointsId }
//   The first rule that matches the action wins, so put special cases before general ones.
// A condition: { flags: [], notFlags: [], has: [], notHas: [] }  (all must be true)
// Effects: { set: [], unset: [], add: [], remove: [], goal, go, finish }

(function (root) {
  const VERBS = ["look", "take", "open", "use", "give", "talk", "enter", "go"];
  const WORD = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
  const list = (v) => (v == null ? [] : [].concat(v));

  function condition(c) {
    if (!c) return null;
    const flags = list(c.flags), notFlags = list(c.notFlags), has = list(c.has), notHas = list(c.notHas);
    if (!flags.length && !notFlags.length && !has.length && !notHas.length) return null;
    return (S) => flags.every((f) => S.flag(f)) && notFlags.every((f) => !S.flag(f)) &&
      has.every((i) => S.has(i)) && notHas.every((i) => !S.has(i));
  }

  function effects(d) {
    if (!d) return null;
    return (S) => {
      list(d.set).forEach((f) => S.set(f));
      list(d.unset).forEach((f) => S.unset(f));
      list(d.add).forEach((i) => S.add(i));
      list(d.remove).forEach((i) => S.remove(i));
      if (d.goal) S.goal(d.goal);
      if (d.go) S.go(d.go);
      if (d.finish) S.finish();
    };
  }

  function rule(r, key) {
    const obj = list(r.obj);
    return {
      verb: list(r.verb),
      obj: obj.length ? obj : null,
      item: r.item || null,
      when: condition(r.when),
      run: effects(r.do),
      say: r.say,
      points: r.points ? [r.pointsId || key, r.points] : null,
    };
  }

  // Episode data -> the game object the engine plays.
  function compile(ep, base) {
    const byId = (arr) => Object.fromEntries(list(arr).map((x) => [x.id, x]));
    const scenes = {};
    for (const sc of ep.scenes) {
      scenes[sc.id] = {
        ...sc,
        objects: sc.objects.map((o) => ({ ...o, visible: condition(o.visible) })),
        rules: list(sc.rules).map((r, i) => rule(r, `${sc.id}:${i}`)),
      };
    }
    return {
      id: ep.id,
      title: ep.title,
      verbs: base.verbs,
      ui: base.ui,
      items: byId(ep.items),
      goals: byId(ep.goals),
      start: ep.start,
      scenes,
      globalRules: list(ep.globalRules).map((r, i) => rule(r, `global:${i}`)),
      ending: list(ep.ending),
      data: ep,
    };
  }

  // The rule that answers an action, or null. Same choice in the game and in the solver.
  function findRule(game, sceneId, v, objId, itemId, S) {
    const rules = [...game.scenes[sceneId].rules, ...game.globalRules];
    return rules.find((r) =>
      r.verb.includes(v) &&
      (!r.obj || r.obj.includes(objId)) &&
      (r.item ? r.item === itemId : !itemId) &&
      (!r.when || r.when(S))) || null;
  }

  // Every English text the player can read in an episode.
  function texts(ep) {
    const out = [ep.title];
    const push = (t) => { if (typeof t === "string" && t) out.push(t); };
    list(ep.items).forEach((i) => { push(i.name); push(i.look); });
    list(ep.goals).forEach((g) => { push(g.en); push(g.hint); });
    list(ep.scenes).forEach((sc) => {
      push(sc.name); push(sc.intro); push(sc.introAgain);
      sc.objects.forEach((o) => { push(o.name); push(o.look); });
      list(sc.rules).forEach((r) => push(r.say));
    });
    list(ep.globalRules).forEach((r) => push(r.say));
    list(ep.ending).forEach(push);
    return out;
  }

  const wordsIn = (textList) => new Set(textList.flatMap((t) => (t.match(WORD) || []).map((w) => w.toLowerCase())));

  const API = { compile, findRule, texts, wordsIn, condition, VERBS, WORD };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.Episode = API;
})(this);

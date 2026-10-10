// Game engine and interface. Content lives in game-data.js, pictures in art.js.

(function () {
  const G = window.GAME, DICT = window.DICT, ART = window.ART;
  const SAVE_KEY = "coldVillage.save.v1";
  const WORDS_KEY = "englishQuest.words.v1";
  const WORD = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
  const TWO_STEP = new Set(["use", "give"]);
  const ICONS = { key: "🗝️", sword: "⚔️", bread: "🍞" };

  const $ = (sel) => document.querySelector(sel);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const list = (v) => (v == null ? [] : [].concat(v));
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  // ---------- storage (may be unavailable; the game still works without it)
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  // ---------- state
  const freshState = () => ({
    scene: G.start.scene, goal: G.start.goal, flags: {}, bag: [], points: {},
    visited: {}, hints: {}, finished: false, log: [], started: false,
  });
  let state = Object.assign(freshState(), store.get(SAVE_KEY) || {});
  const words = Object.assign({ looked: {}, seen: {}, quiz: {} }, store.get(WORDS_KEY) || {});
  const save = () => { store.set(SAVE_KEY, state); store.set(WORDS_KEY, words); };

  let verb = null;          // selected verb id
  let item = null;          // selected bag item for Use/Give
  let hoverName = null;     // name of the thing under the mouse
  let pending = null;       // sentence the hero is walking to do
  let batchStart = state.log.length;
  let fx = {};              // effects collected during one action

  const S = {
    flag: (f) => !!state.flags[f],
    set: (f) => { state.flags[f] = true; },
    has: (i) => state.bag.includes(i),
    add: (i) => { if (!state.bag.includes(i)) state.bag.push(i); },
    remove: (i) => { state.bag = state.bag.filter((x) => x !== i); },
    goal: (g) => { if (state.goal !== g) { state.goal = g; fx.goal = true; } },
    go: (scene) => { fx.scene = scene; },
    finish: () => { fx.finish = true; },
  };

  const maxScore = (() => {
    const pts = {};
    const all = [...G.globalRules, ...Object.values(G.scenes).flatMap((sc) => sc.rules)];
    for (const r of all) if (r.points) pts[r.points[0]] = r.points[1];
    return Object.values(pts).reduce((a, b) => a + b, 0);
  })();
  const score = () => Object.values(state.points).reduce((a, b) => a + b, 0);

  const scene = () => G.scenes[state.scene];
  const visible = (o) => !o.visible || o.visible(S);
  const sceneObj = (id) => scene().objects.find((o) => o.id === id && visible(o));
  const thing = (id) => (state.bag.includes(id) ? G.items[id] : null) || sceneObj(id);
  const verbDef = (id) => G.verbs.find((v) => v.id === id);

  // ---------- text with clickable words
  function wordsHTML(text) {
    let out = "", last = 0;
    text.replace(WORD, (m, idx) => {
      out += esc(text.slice(last, idx)) +
        `<span class="w" data-i="${idx}" data-w="${m.toLowerCase()}">${esc(m)}</span>`;
      last = idx + m.length;
      return m;
    });
    return out + esc(text.slice(last));
  }

  function markSeen(text) {
    for (const m of text.match(WORD) || []) words.seen[m.toLowerCase()] = 1;
  }

  // ---------- actions
  function sentence(v, itemId, targetName) {
    const def = verbDef(v);
    let t = def.label;
    if (itemId) t += ` ${G.items[itemId].name} ${def.link}`;
    if (targetName) t += ` ${targetName}`;
    return t;
  }

  function findRule(v, objId, itemId) {
    const rules = [...scene().rules, ...G.globalRules];
    return rules.find((r) =>
      list(r.verb).includes(v) &&
      (!r.obj || list(r.obj).includes(objId)) &&
      (r.item ? r.item === itemId : !itemId) &&
      (!r.when || r.when(S)));
  }

  function act(v, objId, itemId) {
    const target = objId ? thing(objId) : null;
    const msgs = [{ kind: "cmd", text: sentence(v, itemId, target && target.name) }];
    fx = {};

    if (TWO_STEP.has(v) && !itemId) {
      msgs.push({ kind: "say", text: v === "use" ? G.ui.useWhat : G.ui.giveWhat });
    } else {
      const rule = findRule(v, objId, itemId);
      if (rule) {
        msgs.push({ kind: "say", text: rule.say });
        if (rule.points) state.points[rule.points[0]] = rule.points[1];
        if (rule.run) rule.run(S);
      } else if (v === "look" && target && target.look) {
        msgs.push({ kind: "say", text: target.look });
      } else {
        msgs.push({ kind: "say", text: G.ui.defaults[v] });
      }
    }
    applyEffects(msgs);
  }

  function applyEffects(msgs) {
    if (fx.scene) {
      const from = state.scene;
      state.scene = fx.scene;
      placeHero(ART[fx.scene].entry[from] || ART[fx.scene].entry.start);
      const sc = scene();
      msgs.push({ kind: "intro", text: state.visited[fx.scene] ? sc.introAgain : sc.intro });
      state.visited[fx.scene] = true;
    }
    if (fx.goal && !fx.finish) msgs.push({ kind: "goal", text: G.goals[state.goal].en });
    if (fx.finish) {
      state.finished = true;
      G.ending.forEach((t) => msgs.push({ kind: "intro", text: t }));
    }
    fx = {};
    addMessages(msgs);
    verb = null; item = null;
    render();
    if (state.finished) setTimeout(showEnd, 1800);
  }

  function addMessages(msgs, { speak = true } = {}) {
    state.log.push(...msgs);
    state.log = state.log.slice(-60);
    batchStart = Math.max(0, state.log.length - msgs.length);
    msgs.forEach((m) => markSeen(m.text));
    save();
    renderLog();
    if (speak) speakBatch();
  }

  function speakBatch() {
    Speech.stop();
    const els = [...document.querySelectorAll("#log .msg.new")];
    els.forEach((el) => {
      if (el.dataset.lang === "he") return;
      Speech.say(el.dataset.text, { el, queue: true, pitch: el.dataset.text.startsWith("Grandmother") ? 1.15 : 1 });
    });
  }

  // ---------- picture and hero
  const canvas = $("#scene");
  canvas.width = PIX.W * 2;
  canvas.height = PIX.H;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(canvas.width, canvas.height);
  let bg = null, work = null, bgKey = "";
  let walk = null;   // where the hero is walking: { x, y, then }
  let steps = 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function buildScene() {
    const key = JSON.stringify([state.scene, state.flags, state.bag]);
    if (key === bgKey) return;
    bgKey = key;
    bg = new PIX.Painter();
    ART[state.scene].draw(bg, S, (id) => !!sceneObj(id));
    work = new PIX.Painter(bg);
  }

  function placeHero([x, y]) {
    state.hero = { x, y, dir: x > PIX.W / 2 ? -1 : 1 };
    walk = null;
  }

  function drawFrame(now) {
    work.reset();
    const art = ART[state.scene];
    if (art.anim) art.anim(work, now / 1000, S);
    const h = state.hero;
    const sx = Math.round(h.x) - PIX.HERO_WIDTH / 2, sy = Math.round(h.y) - PIX.HERO_HEIGHT;
    if (S.has("sword")) {
      const back = h.dir > 0 ? sx : sx + PIX.HERO_WIDTH - 1;
      work.sprite(back, sy + 3, ["n", "n", "g", "g", "g", "g", "g", "g", "g", "g", "g"], PIX.HERO_MAP, false, h.y);
    }
    const frame = walk ? [1, 0, 2, 0][Math.floor(steps / 2) % 4] : 0;
    work.sprite(sx, sy, PIX.HERO[frame], PIX.HERO_MAP, h.dir < 0, h.y);
    PIX.blit(work.c, image);
    ctx.putImageData(image, 0, 0);
  }

  function step() {
    if (!walk) return;
    steps++;
    const h = state.hero, SPEED = 4;
    const dx = (walk.x - h.x) * 2, dy = walk.y - h.y;   // in screen units: pixels are twice as wide
    const dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > 1) h.dir = dx > 0 ? 1 : -1;
    if (dist <= SPEED) {
      h.x = walk.x; h.y = walk.y;
      const then = walk.then;
      walk = null;
      save();
      if (then) then();
    } else {
      h.x += (dx / dist) * SPEED / 2;
      h.y += (dy / dist) * SPEED;
    }
  }

  let lastStep = 0;
  function loop(now) {
    if (now - lastStep >= 50) { lastStep = now; step(); }
    drawFrame(now);
    requestAnimationFrame(loop);
  }

  function walkTo(x, y, then) {
    const f = ART[state.scene].floor;
    walk = { x: clamp(x, f.x0, f.x1), y: clamp(y, f.y0, f.y1), then };
  }

  // Walk to the thing first (like in the old games), then do the action. Looking works from far away.
  function perform(v, objId, itemId) {
    const spot = ART[state.scene].spots[objId];
    const walkFirst = spot && sceneObj(objId) && v !== "look" && !(TWO_STEP.has(v) && !itemId);
    if (!walkFirst) { walk = null; pending = null; act(v, objId, itemId); return; }
    pending = sentence(v, itemId, thing(objId).name);
    verb = null; item = null;
    render();
    walkTo(spot[0], spot[1], () => { pending = null; act(v, objId, itemId); });
  }

  function pixelAt(e) {
    const r = canvas.getBoundingClientRect();
    const scale = Math.min(r.width / canvas.width, r.height / canvas.height);
    const x = (e.clientX - r.left - (r.width - canvas.width * scale) / 2) / scale;
    const y = (e.clientY - r.top - (r.height - canvas.height * scale) / 2) / scale;
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    return { x: Math.floor(x / 2), y: Math.floor(y) };
  }

  // ---------- typed commands (King's Quest style)
  const VERB_PHRASES = [
    ["look at", "look"], ["look", "look"], ["see", "look"], ["check", "look"],
    ["pick up", "take"], ["take", "take"], ["get", "take"], ["grab", "take"],
    ["open", "open"], ["unlock", "open"], ["use", "use"], ["give", "give"],
    ["talk to", "talk"], ["talk", "talk"], ["speak to", "talk"], ["speak", "talk"],
    ["go into", "enter"], ["go in", "enter"], ["get in", "enter"], ["enter", "enter"],
    ["go to", "go"], ["go", "go"], ["walk to", "go"], ["walk", "go"], ["cross", "go"], ["run to", "go"],
  ].sort((a, b) => b[0].length - a[0].length);
  const STOP = new Set(["the", "a", "an", "at", "to", "on", "with", "in", "into", "my", "your", "up", "please", "and", "of"]);

  function parse(input) {
    const text = input.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
    const hit = VERB_PHRASES.find(([p]) => text === p || text.startsWith(p + " "));
    if (!hit) return null;
    const v = hit[1];
    const tokens = text.slice(hit[0].length).split(" ").filter((t) => t && !STOP.has(t));
    const candidates = [
      ...state.bag.map((id) => ({ id, words: G.items[id].words })),
      ...scene().objects.filter(visible),
    ];
    const nouns = [];
    const known = (o, t) => o.words.includes(t) || o.words.includes(t.replace(/s$/, ""));
    for (const t of tokens) {
      const c = candidates.find((o) => known(o, t));
      if (!c) return { v, notHere: ALL_THINGS.some((o) => known(o, t)), unknown: true };
      if (!nouns.includes(c.id)) nouns.push(c.id);
    }
    return { v, nouns };
  }
  const ALL_THINGS = [...Object.values(G.items), ...Object.values(G.scenes).flatMap((sc) => sc.objects)];

  function typed(input) {
    if (!input.trim()) return;
    const p = parse(input);
    if (p && p.notHere) {
      addMessages([{ kind: "cmd", text: input.trim() }, { kind: "say", text: G.ui.notHere }]);
      return;
    }
    if (!p || p.unknown) {
      addMessages([{ kind: "cmd", text: input.trim() }, { kind: "say", text: G.ui.notUnderstood }]);
      return;
    }
    const [a, b] = p.nouns;
    if (!a && p.v === "look") {
      addMessages([{ kind: "cmd", text: "Look" }, { kind: "say", text: scene().intro }]);
    } else if (TWO_STEP.has(p.v) && a && b) {
      perform(p.v, b, a);
    } else if (p.v === "open" && a && b && state.bag.includes(b)) {
      perform("use", a, b);        // "open door with key"
    } else if (a) {
      perform(p.v, a, null);
    } else {
      addMessages([{ kind: "cmd", text: input.trim() }, { kind: "say", text: G.ui.notUnderstood }]);
    }
  }

  // ---------- hints
  function hint() {
    const g = G.goals[state.goal];
    const level = state.hints[state.goal] || 0;
    state.hints[state.goal] = level + 1;
    if (level === 0) addMessages([{ kind: "hint", text: g.hint }]);
    else addMessages([{ kind: "he", text: `${g.he} ${g.hintHe}` }]);
  }

  // ---------- rendering
  function render() {
    const sc = scene();
    buildScene();
    $("#scene-name").innerHTML = wordsHTML(sc.name);
    $("#goal-text").innerHTML = wordsHTML(G.goals[state.goal].en);
    $("#score").textContent = `Score:${score()} of ${maxScore}`;
    $("#bag-label").innerHTML = wordsHTML(G.ui.bag);
    document.querySelectorAll(".verb").forEach((b) => b.classList.toggle("on", b.dataset.verb === verb));
    $("#bag").innerHTML = state.bag.length
      ? state.bag.map((id) => `<button class="item${item === id ? " on" : ""}" data-item="${id}">
          <span class="icon">${ICONS[id] || "❔"}</span><span>${esc(id)}</span></button>`).join("")
      : `<span class="empty">—</span>`;
    renderSentence();
  }

  function renderSentence() {
    const v = verb || (hoverName ? "look" : null);
    $("#sentence").textContent = pending || (v ? sentence(v, item, hoverName) : "");
    $("#sentence").classList.toggle("ghost", !verb && !pending);
  }

  function renderLog() {
    const log = $("#log");
    log.innerHTML = state.log.map((m, i) => {
      const isNew = i >= batchStart;
      if (m.kind === "he") {
        return `<p class="msg k-he${isNew ? " new" : " old"}" dir="rtl" data-lang="he" data-text="${esc(m.text)}">💡 ${esc(m.text)}</p>`;
      }
      const icon = { cmd: "▶ ", goal: "🎯 ", hint: "💡 " }[m.kind] || "";
      return `<p class="msg k-${m.kind}${isNew ? " new" : " old"}" data-text="${esc(m.text)}">${icon}${wordsHTML(m.text)}` +
        `<button class="replay" title="Listen">🔊</button></p>`;
    }).join("");
    log.scrollTop = log.scrollHeight;
  }

  // ---------- word popup
  function showWord(span) {
    const w = span.dataset.w;
    words.looked[w] = (words.looked[w] || 0) + 1;
    save();
    const pop = $("#popup");
    pop.innerHTML = `<div class="en">${esc(span.textContent)} <button class="say" data-say="${esc(w)}">🔊</button></div>
      <div class="he" dir="rtl">${esc(DICT[w] || "לא נמצא במילון")}</div>`;
    pop.hidden = false;
    const r = span.getBoundingClientRect();
    const left = Math.min(window.innerWidth - pop.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - pop.offsetWidth / 2));
    const below = r.bottom + 8 + pop.offsetHeight < window.innerHeight;
    pop.style.left = `${left + window.scrollX}px`;
    pop.style.top = `${(below ? r.bottom + 8 : r.top - pop.offsetHeight - 8) + window.scrollY}px`;
    Speech.say(span.textContent, { rate: 0.75 });
  }
  const hidePopup = () => { $("#popup").hidden = true; };

  // ---------- word book and practice
  const FUNCTION_WORDS = new Set(window.FUNCTION_WORDS);

  function showBook() {
    const looked = Object.entries(words.looked).sort((a, b) => b[1] - a[1]);
    const seenCount = Object.keys(words.seen).length;
    $("#book-stats").innerHTML = `Words you met: <b>${seenCount}</b> · Words you clicked: <b>${looked.length}</b>`;
    $("#book-list").innerHTML = looked.length
      ? looked.map(([w, n]) => `<li><button class="say" data-say="${esc(w)}">🔊</button>
          <span class="en">${esc(w)}</span><span class="he" dir="rtl">${esc(DICT[w] || "")}</span>
          <span class="count" title="clicks">×${n}</span></li>`).join("")
      : `<li class="none" dir="rtl">עוד לא לחצת על מילים. לחץ על מילה באנגלית כדי לראות מה היא אומרת.</li>`;
    $("#book").hidden = false;
  }

  let quiz = null;
  function startQuiz() {
    const pool = Object.keys(words.seen).filter((w) => DICT[w] && !FUNCTION_WORDS.has(w));
    if (pool.length < 4) {
      $("#quiz-body").innerHTML = `<p dir="rtl">צריך לשחק עוד קצת כדי לפגוש מספיק מילים.</p>`;
      $("#quiz").hidden = false;
      return;
    }
    // Words clicked often or answered wrong come first.
    const weight = (w) => (words.looked[w] || 0) * 2 + (words.quiz[w]?.wrong || 0) * 3 - (words.quiz[w]?.right || 0) + Math.random() * 2;
    const order = pool.sort((a, b) => weight(b) - weight(a)).slice(0, 8);
    quiz = { order, i: 0, right: 0, pool };
    $("#quiz").hidden = false;
    quizQuestion();
  }

  function quizQuestion() {
    const { order, i, pool } = quiz;
    if (i >= order.length) {
      $("#quiz-body").innerHTML = `<p class="quiz-done">${quiz.right} / ${order.length} ⭐</p>
        <button class="big" id="quiz-again">Again · שוב</button>`;
      return;
    }
    const w = order[i];
    const wrong = pool.filter((x) => x !== w && DICT[x] !== DICT[w]).sort(() => Math.random() - 0.5).slice(0, 2);
    const options = [w, ...wrong].sort(() => Math.random() - 0.5);
    $("#quiz-body").innerHTML = `<p class="quiz-count">${i + 1} / ${order.length}</p>
      <p class="quiz-word">${esc(w)} <button class="say" data-say="${esc(w)}">🔊</button></p>
      <div class="quiz-options">${options.map((o) =>
        `<button class="opt" dir="rtl" data-opt="${esc(o)}">${esc(DICT[o])}</button>`).join("")}</div>`;
    Speech.say(w, { rate: 0.75 });
  }

  function answer(btn) {
    const w = quiz.order[quiz.i];
    const ok = btn.dataset.opt === w;
    const q = (words.quiz[w] = words.quiz[w] || { right: 0, wrong: 0 });
    ok ? q.right++ : q.wrong++;
    if (ok) quiz.right++;
    save();
    document.querySelectorAll(".opt").forEach((b) => {
      b.disabled = true;
      if (b.dataset.opt === w) b.classList.add("right");
    });
    if (!ok) btn.classList.add("wrong");
    setTimeout(() => { quiz.i++; quizQuestion(); }, ok ? 700 : 1600);
  }

  // ---------- end of level
  function showEnd() {
    $("#end-title").innerHTML = wordsHTML(G.ui.levelDone);
    $("#end-score").textContent = `Score: ${score()} of ${maxScore}`;
    $("#end-words").textContent = `Words you met: ${Object.keys(words.seen).length}`;
    $("#end").hidden = false;
    document.dispatchEvent(new CustomEvent("eq:level-complete", { detail: { episode: G.id } }));
  }

  function restart() {
    state = freshState();
    state.started = true;
    verb = null; item = null; hoverName = null;
    store.del(SAVE_KEY);
    $("#end").hidden = true;
    begin();
  }

  function begin() {
    if (!state.log.length) {
      const sc = scene();
      state.visited[state.scene] = true;
      placeHero(ART[state.scene].entry.start);
      render();
      // Browsers only allow speech after a click, so the first lines are read when he presses Start.
      addMessages([{ kind: "intro", text: sc.intro }, { kind: "goal", text: G.goals[state.goal].en }],
        { speak: state.started });
    } else {
      render();
      renderLog();
    }
  }

  // ---------- events
  function bind() {
    $("#verbs").innerHTML = G.verbs.map((v) =>
      `<button class="verb" data-verb="${v.id}" title="${esc(DICT[v.id] || "")}">${esc(v.label)}</button>`).join("");

    $("#verbs").addEventListener("click", (e) => {
      const b = e.target.closest(".verb");
      if (!b) return;
      verb = verb === b.dataset.verb ? null : b.dataset.verb;
      item = null;
      render();
    });

    const objAt = (e) => {
      const p = pixelAt(e);
      const id = p && bg.idAt(p.x, p.y);
      return { p, o: id ? sceneObj(id) : null };
    };
    canvas.addEventListener("mousemove", (e) => {
      const { o } = objAt(e);
      canvas.classList.toggle("over", !!o);
      const name = o ? o.name : null;
      if (name !== hoverName) { hoverName = name; renderSentence(); }
    });
    canvas.addEventListener("mouseleave", () => { hoverName = null; renderSentence(); });
    canvas.addEventListener("click", (e) => {
      if (state.finished) return;
      const { p, o } = objAt(e);
      if (!p) return;
      if (o) {
        hoverName = null;
        perform(verb || "look", o.id, TWO_STEP.has(verb) ? item : null);
      } else {
        pending = null;
        walkTo(p.x, p.y);
        renderSentence();
      }
    });

    $("#bag").addEventListener("click", (e) => {
      const b = e.target.closest(".item");
      if (!b || state.finished) return;
      const id = b.dataset.item;
      if (TWO_STEP.has(verb) && !item) { item = id; render(); return; }
      act(verb || "look", id, TWO_STEP.has(verb) ? item : null);
    });
    $("#bag").addEventListener("mouseover", (e) => {
      const b = e.target.closest(".item");
      hoverName = b ? G.items[b.dataset.item].name : null;
      renderSentence();
    });
    $("#bag").addEventListener("mouseleave", () => { hoverName = null; renderSentence(); });

    $("#type").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#type-input");
      if (!state.finished) typed(input.value);
      input.value = "";
    });

    $("#hint").addEventListener("click", hint);
    $("#goal-say").addEventListener("click", () => Speech.say(G.goals[state.goal].en, { el: $("#goal-text") }));
    $("#sound").addEventListener("click", () => {
      Speech.enabled = !Speech.enabled;
      $("#sound").textContent = Speech.enabled ? "Sound:on" : "Sound:off";
    });
    $("#book-btn").addEventListener("click", showBook);
    $("#practice-btn").addEventListener("click", () => { $("#book").hidden = true; startQuiz(); });
    $("#help-btn").addEventListener("click", () => { $("#help").hidden = false; });
    $("#start").addEventListener("click", () => {
      $("#help").hidden = true;
      if (!state.started) { state.started = true; save(); speakBatch(); }
    });
    $("#restart").addEventListener("click", () => {
      if (confirm("Start the level again? / להתחיל את השלב מההתחלה?")) restart();
    });
    $("#play-again").addEventListener("click", restart);

    document.addEventListener("click", (e) => {
      const w = e.target.closest(".w");
      const say = e.target.closest(".say");
      const replay = e.target.closest(".replay");
      const close = e.target.closest("[data-close]");
      if (close) { close.closest(".modal").hidden = true; Speech.stop(); }
      if (say) { Speech.say(say.dataset.say, { rate: 0.75 }); return; }
      if (replay) { const p = replay.closest(".msg"); Speech.say(p.dataset.text, { el: p }); return; }
      if (e.target.closest(".opt") && !e.target.disabled) { answer(e.target.closest(".opt")); return; }
      if (e.target.id === "quiz-again") { startQuiz(); return; }
      if (w) { showWord(w); return; }
      if (!e.target.closest("#popup")) hidePopup();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        hidePopup();
        verb = null; item = null; render();
      }
    });
  }

  bind();
  if (!state.hero) placeHero(ART[state.scene].entry.start);
  requestAnimationFrame(loop);
  if (!Speech.available) $("#sound").hidden = true;
  if (state.started) $("#help").hidden = true;
  if (state.finished) { render(); renderLog(); showEnd(); } else begin();
})();

// Game engine and interface. Episodes are data (js/episode.js), pictures are either the built-in
// pixel drawings (js/art.js) or AI pictures from the art worker (/art/<key>.png).

window.startGame = function (G, DICT, { preview = false, served = false } = {}) {
  const ART = window.ART;
  const SAVE_KEY = `eq.save.${G.id}${preview ? ".preview" : ""}`;
  const WORDS_KEY = "englishQuest.words.v1";
  const WORD = window.Episode.WORD;
  const TWO_STEP = new Set(["use", "give"]);
  const ICONS = { key: "🗝️", sword: "⚔️", bread: "🍞" };

  const $ = (sel) => document.querySelector(sel);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

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
  const saved = store.get(SAVE_KEY) || (G.id === "s1e1" && !preview ? store.get("coldVillage.save.v1") : null);
  let state = Object.assign(freshState(), saved || {});
  if (!G.scenes[state.scene]) state = freshState();
  const words = Object.assign({ looked: {}, seen: {}, quiz: {} }, store.get(WORDS_KEY) || {});
  const save = () => { store.set(SAVE_KEY, state); if (!preview) store.set(WORDS_KEY, words); };

  let verb = null;          // selected verb id
  let item = null;          // selected bag item for Use/Give
  let hoverName = null;     // name of the thing under the mouse
  let pending = null;       // sentence the hero is walking to do
  let batchStart = state.log.length;
  let fx = {};              // effects collected during one action

  const S = {
    flag: (f) => !!state.flags[f],
    set: (f) => { state.flags[f] = true; },
    unset: (f) => { delete state.flags[f]; },
    has: (i) => state.bag.includes(i),
    add: (i) => { if (!state.bag.includes(i)) state.bag.push(i); },
    remove: (i) => { state.bag = state.bag.filter((x) => x !== i); },
    goal: (g) => { if (state.goal !== g) { state.goal = g; fx.goal = true; } },
    go: (scene) => { fx.scene = scene; },
    finish: () => { fx.finish = true; },
    fx: (name) => { (fx.list = fx.list || []).push(name); },
  };
  let busy = false;          // an effect is playing: wait with clicks
  const sound = (n) => window.Sound && Sound.sfx(n);
  const sceneMusic = () => scene().music || "adventure";

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
    const own = FX.name().toLowerCase();
    text.replace(WORD, (m, idx) => {
      out += esc(text.slice(last, idx)) + (own && m.toLowerCase() === own ? esc(m) :
        `<span class="w" data-i="${idx}" data-w="${m.toLowerCase()}">${esc(m)}</span>`);
      last = idx + m.length;
      return m;
    });
    return out + esc(text.slice(last));
  }

  function markSeen(text) {
    if (preview) return;
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

  function act(v, objId, itemId) {
    const target = objId ? thing(objId) : null;
    const msgs = [{ kind: "cmd", text: sentence(v, itemId, target && target.name) }];
    const before = { bag: state.bag.length, score: score() };
    let rule = null;
    fx = {};

    if (TWO_STEP.has(v) && !itemId) {
      msgs.push({ kind: "say", text: v === "use" ? G.ui.useWhat : G.ui.giveWhat });
    } else {
      rule = window.Episode.findRule(G, state.scene, v, objId, itemId, S);
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
    // Sounds: points, a new item, "no", or a new goal.
    if (score() > before.score) sound("points");
    else if (state.bag.length > before.bag) sound("pickup");
    else if (!rule && v !== "look") sound("nope");
    else if (fx.goal && !fx.scene) sound("goal");
    applyEffects(msgs);
  }

  function applyEffects(msgs) {
    if (fx.scene) {
      const from = state.scene;
      state.scene = fx.scene;
      ensureView();
      placeHero(view.entry(from));
      const sc = scene();
      msgs.push({ kind: "intro", text: state.visited[fx.scene] ? sc.introAgain : sc.intro });
      state.visited[fx.scene] = true;
    }
    if (fx.goal && !fx.finish) msgs.push({ kind: "goal", text: G.goals[state.goal].en });
    if (fx.scene) sound("whoosh");
    const effects = fx.list || [];
    const ending = fx.finish ? G.ending.map((t) => ({ kind: "intro", text: t })) : [];
    if (fx.finish) state.finished = true;
    fx = {};
    verb = null; item = null;
    if (!effects.length) {
      addMessages([...msgs, ...ending]);
      render();
      if (state.finished) setTimeout(showEnd, 1800);
      return;
    }
    // Special effects play first (he may type his name), then the ending.
    addMessages(msgs);
    render();
    busy = true;
    (async () => {
      for (const f of effects) await FX.run(f);
      busy = false;
      if (ending.length) addMessages(ending);
      render();
      if (state.finished) setTimeout(showEnd, 1800);
    })();
  }

  function addMessages(msgs, { speak = true } = {}) {
    const who = FX.name() || "friend";
    msgs = msgs.map((m) => ({ ...m, text: m.text.replace(/\{name\}/g, who) }));
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
      Speech.say(el.dataset.text, { el, queue: true, pitch: /^[A-Z][a-z]+: "/.test(el.dataset.text) ? 1.15 : 1 });
    });
  }

  // ---------- pictures from the art worker
  const pics = {};
  function pic(key) {
    if (!served || !key) return null;
    if (!pics[key]) {
      const img = new Image();
      pics[key] = { img, ok: false };
      img.onload = () => { pics[key].ok = true; render(); };
      img.src = `/art/${encodeURIComponent(key)}.png`;
    }
    return pics[key].ok ? pics[key].img : null;
  }

  // ---------- views: how a scene is drawn and clicked
  const canvas = $("#scene");
  const ctx = canvas.getContext("2d");
  let view = null, viewScene = null;
  let walk = null;   // where the hero is walking: { route: [[x, y], ...], then, face }
  let steps = 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // The built-in pixel drawings (160x168 pixels, each twice as wide).
  function egaView(name) {
    const art = ART[name];
    const image = ctx.createImageData(PIX.W * 2, PIX.H);
    let bg = null, work = null, key = "";
    const rebuild = () => {
      const k = JSON.stringify([state.flags, state.bag]);
      if (k === key) return;
      key = k;
      bg = new PIX.Painter();
      art.draw(bg, S, (id) => !!sceneObj(id));
      work = new PIX.Painter(bg);
    };
    return {
      w: PIX.W * 2, h: PIX.H, xScale: 2, floor: art.floor, rebuild,
      entry: (from) => art.entry[from] || art.entry.start,
      spot: (id) => art.spots[id] || null,
      hitAt: (cx, cy) => (rebuild(), bg.idAt(Math.floor(cx / 2), Math.floor(cy))),
      toWorld: (cx, cy) => ({ x: Math.floor(cx / 2), y: Math.floor(cy) }),
      draw(now) {
        rebuild();
        work.reset();
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
      },
    };
  }

  // Walking characters: LPC sprite sheets in assets/characters (rows 0-3 walk, 9 frames; rows 4-7 stand,
  // 2 frames; each row faces up, left, down, right). A frame is 64x64 with the feet at y 62; a person is
  // about 52 pixels tall in it.
  const FACES = { up: 0, left: 1, down: 2, right: 3 };
  const sheets = {};
  function sheet(name) {
    if (!Episode.CHARACTERS.includes(name)) return null;
    if (!sheets[name]) {
      const img = new Image();
      sheets[name] = { img, ok: false };
      img.onload = () => { sheets[name].ok = true; };
      img.src = `assets/characters/${name}.png`;
    }
    return sheets[name].ok ? sheets[name].img : null;
  }
  const faceFrom = (dx, dy) => (Math.abs(dx) > Math.abs(dy) * 1.2 ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");

  // AI pictures: a 320x200 background, characters and items drawn on top, things placed by box.
  // Drawn at 1280x800, so characters can be sized in quarter steps without uneven pixels.
  function imageView(sc) {
    const W = 320, H = 200, PX = 4;
    const floorPoly = Walk.outline(sc);
    const ys = floorPoly.map((p) => p[1]);
    const floor = { x0: 0, x1: W, y0: Math.min(...ys), y1: Math.max(...ys) };
    // Everyone is the same size in a scene: heroHeight (how tall a person looks in this picture) or 68.
    const S = Math.max(1, Math.round(((sc.heroHeight || 68) / 52) * PX) / PX);
    const half = (v) => Math.round(v * PX) / PX;
    let rects = [];
    const npcFace = (cx) => (state.hero.x < cx - 12 ? "left" : state.hero.x > cx + 12 ? "right" : "down");
    const rectOf = (o) => {
      const [x, y, w, h] = o.box;
      const cx = x + w / 2, feet = y + h;
      const person = o.sprite ? sheet(o.sprite) : null;
      if (person || Episode.CHARACTERS.includes(o.sprite)) {
        return { x: cx - 14 * S, y: feet - 54 * S, w: 28 * S, h: 54 * S, person, cx, feet };
      }
      const img = o.sprite ? pic(o.sprite) : null;
      if (img) return { x: Math.round(cx - img.naturalWidth / 2), y: feet - img.naturalHeight, w: img.naturalWidth, h: img.naturalHeight, img };
      return { x, y, w, h, img: null };
    };
    function drawPose(img, x, y, row, frame) {
      ctx.drawImage(img, frame * 64, row * 64, 64, 64, half(x - 32 * S), half(y - 62 * S), 64 * S, 64 * S);
    }
    // Rows 0-3 walk, 4-7 stand; row 8 falls down (frame 4: on the ground, "lying").
    const drawPerson = (img, x, y, face, frame, walking) => drawPose(img, x, y, (walking ? 0 : 4) + FACES[face], frame);
    function placeholder() {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#5555ff"); g.addColorStop(floor.y0 / H, "#aaaaff");
      g.addColorStop(floor.y0 / H, "#55aa55"); g.addColorStop(1, "#005500");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff";
      ctx.font = "8px monospace";
      ctx.fillText("picture coming soon", W - 98, 10);
    }
    function placeholderThing(o, r) {
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      ctx.fillStyle = "#000";
      ctx.font = "8px monospace";
      ctx.fillText(o.name.replace(/^(the|your|a|an) /, ""), r.x + 2, r.y + 9, r.w - 4);
    }
    function drawHero(now) {
      const h = state.hero;
      const img = sheet("hero");
      if (!img) return;
      const walking = !!walk;
      const frame = walking ? 1 + (Math.floor(walked / (5 * S)) % 8) : Math.floor(now / 700) % 2;
      drawPerson(img, h.x, h.y, h.face || "down", frame, walking);
    }
    return {
      w: W, h: H, px: PX, xScale: 1, floor, rebuild() {},
      speed: 2 + S,
      entry: () => Walk.nearest(floorPoly, sc.entry.x, sc.entry.y),
      route: (from, [x, y]) => {
        const to = Walk.nearest(floorPoly, x, y);
        return Walk.path(floorPoly, Walk.nearest(floorPoly, from[0], from[1]), to);
      },
      // Where to stand for a thing: on the floor in front of it, or next to a person.
      spot: (id) => {
        const o = sceneObj(id);
        if (!o || !o.box) return null;
        const [x, y, w, h] = o.box;
        const cx = x + w / 2;
        if (Episode.CHARACTERS.includes(o.sprite)) {
          const side = state.hero.x < cx ? -1 : 1;
          return Walk.nearest(floorPoly, cx + side * 24 * S, y + h);
        }
        return Walk.nearest(floorPoly, cx, y + h + 4);
      },
      // Which way to look at a thing when he gets there.
      faceTo: (id) => {
        const o = sceneObj(id);
        if (!o || !o.box) return null;
        const [x, y, w, h] = o.box;
        const dx = x + w / 2 - state.hero.x, dy = y + h / 2 - (state.hero.y - 26 * S);
        return Math.abs(dx) > 18 * S ? (dx > 0 ? "right" : "left") : dy < 0 ? "up" : "down";
      },
      hitAt(cx, cy) {
        for (let i = rects.length - 1; i >= 0; i--) {
          const r = rects[i];
          if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h) return r.id;
        }
        return null;
      },
      toWorld: (cx, cy) => ({ x: cx, y: cy }),
      draw(now) {
        ctx.setTransform(PX, 0, 0, PX, 0, 0);
        ctx.imageSmoothingEnabled = false;
        const bgImg = pic(sc.art);
        if (bgImg) ctx.drawImage(bgImg, 0, 0, W, H);
        else placeholder();
        rects = [];
        const layers = [];
        for (const o of sc.objects) {
          if (!visible(o) || !o.box) continue;
          const r = { id: o.id, ...rectOf(o) };
          rects.push(r);
          const base = o.box[1] + o.box[3];
          if (r.person && o.pose === "lying") layers.push({ base, draw: () => drawPose(r.person, r.cx, r.feet, 8, 4) });
          else if (r.person) layers.push({ base, draw: () => drawPerson(r.person, r.cx, r.feet, npcFace(r.cx), Math.floor(now / 800) % 2, false) });
          else if (r.img) layers.push({ base, draw: () => ctx.drawImage(r.img, r.x, r.y) });
          else if (!bgImg) layers.push({ base, draw: () => placeholderThing(o, r) });
        }
        layers.push({ base: state.hero.y + 0.5, draw: () => drawHero(now) });
        layers.sort((a, b) => a.base - b.base).forEach((l) => l.draw());
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      },
    };
  }

  function ensureView() {
    if (viewScene === state.scene && view) return;
    const sc = scene();
    view = String(sc.art).startsWith("ega:") ? egaView(sc.art.slice(4)) : imageView(sc);
    viewScene = state.scene;
    if (state.started && !state.finished && window.Sound) Sound.music(sceneMusic());
    canvas.width = view.w * (view.px || 1);
    canvas.height = view.h * (view.px || 1);
    canvas.style.aspectRatio = `${view.w} / ${view.h}`;
  }

  function placeHero([x, y]) {
    const dir = x > view.w / view.xScale / 2 ? -1 : 1;
    state.hero = { x, y, dir, face: dir < 0 ? "left" : "right" };
    walk = null;
  }

  // One step (every 50 ms) toward the next point of the route.
  let walked = 0;
  function step() {
    if (!walk) return;
    steps++;
    const h = state.hero, SPEED = view.speed || 4;
    const [tx, ty] = walk.route[0];
    const dx = (tx - h.x) * view.xScale, dy = ty - h.y;   // in screen units
    const dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > 1) h.dir = dx > 0 ? 1 : -1;
    if (dist > 0.5) h.face = faceFrom(dx, dy);
    if (dist <= SPEED) {
      h.x = tx; h.y = ty;
      walked += dist;
      walk.route.shift();
      if (walk.route.length) return;
      const { then, face } = walk;
      walk = null;
      const looking = typeof face === "function" ? face() : face;
      if (looking) h.face = looking;
      save();
      if (then) then();
    } else {
      h.x += (dx / dist) * SPEED / view.xScale;
      h.y += (dy / dist) * SPEED;
      walked += SPEED;
    }
  }

  let lastStep = 0;
  function loop(now) {
    if (now - lastStep >= 50) { lastStep = now; step(); }
    ensureView();
    view.draw(now);
    FX.post(ctx, canvas, now);
    requestAnimationFrame(loop);
  }

  function walkTo(x, y, then, face) {
    const h = state.hero;
    let route;
    if (view.route) route = view.route([h.x, h.y], [x, y]);
    else {
      const f = view.floor;
      route = [[clamp(x, f.x0, f.x1), clamp(y, f.y0, f.y1)]];
    }
    walk = { route, then, face };
  }

  // Walk to the thing first (like in the old games), then do the action. Looking works from far away.
  function perform(v, objId, itemId) {
    const spot = view.spot(objId);
    const walkFirst = spot && sceneObj(objId) && v !== "look" && !(TWO_STEP.has(v) && !itemId);
    if (!walkFirst) { walk = null; pending = null; act(v, objId, itemId); return; }
    pending = sentence(v, itemId, thing(objId).name);
    verb = null; item = null;
    render();
    walkTo(spot[0], spot[1], () => { pending = null; act(v, objId, itemId); }, () => view.faceTo && view.faceTo(objId));
  }

  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    const scale = Math.min(r.width / canvas.width, r.height / canvas.height);
    const x = (e.clientX - r.left - (r.width - canvas.width * scale) / 2) / scale;
    const y = (e.clientY - r.top - (r.height - canvas.height * scale) / 2) / scale;
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    const px = view.px || 1;
    return { cx: x / px, cy: y / px };
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
  const ALL_THINGS = [...Object.values(G.items), ...Object.values(G.scenes).flatMap((sc) => sc.objects)];

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
  function itemIcon(id) {
    const art = G.items[id] && G.items[id].art;
    const img = art ? pic(art) : null;
    return img ? `<img class="icon-img" src="${esc(img.src)}" alt="">` : `<span class="icon">${ICONS[id] || "❔"}</span>`;
  }

  function render() {
    const sc = scene();
    ensureView();
    view.rebuild();
    $("#scene-name").innerHTML = wordsHTML(sc.name);
    $("#goal-text").innerHTML = wordsHTML(G.goals[state.goal].en);
    $("#score").textContent = `Score:${score()} of ${maxScore}`;
    $("#bag-label").innerHTML = wordsHTML(G.ui.bag);
    $(".topbar .title").textContent = preview ? `PREVIEW: ${G.title}` : `English Quest · ${G.title}`;
    document.querySelectorAll(".verb").forEach((b) => b.classList.toggle("on", b.dataset.verb === verb));
    $("#bag").innerHTML = state.bag.length
      ? state.bag.map((id) => `<button class="item${item === id ? " on" : ""}" data-item="${id}">
          ${itemIcon(id)}<span>${esc(G.items[id].words[0] || id)}</span></button>`).join("")
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
    if (!preview) words.looked[w] = (words.looked[w] || 0) + 1;
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
    if (window.Sound) { Sound.music(null); Sound.sfx("fanfare"); }
    $("#end-title").innerHTML = wordsHTML(G.ui.levelDone);
    $("#end-score").textContent = `Score: ${score()} of ${maxScore}`;
    $("#end-words").textContent = `Words you met: ${Object.keys(words.seen).length}`;
    $("#end").hidden = false;
    if (!preview) document.dispatchEvent(new CustomEvent("eq:level-complete", { detail: { episode: G.id } }));
  }

  // Start the episode again from the start screen, like the first time (Start shows the title and reads aloud).
  function restart() {
    Speech.stop();
    state = freshState();
    verb = null; item = null; hoverName = null; pending = null;
    store.del(SAVE_KEY);
    $("#end").hidden = true;
    $("#help").hidden = false;
    begin();
  }

  // "PROLOGUE" or "EPISODE 2", with the episode name, at the start of an episode.
  function titleCard() {
    const m = /^s(\d+)e(\d+)$/.exec(G.id) || [];
    return FX.title(m[2] === "0" ? "PROLOGUE" : `EPISODE ${m[2] || ""}`, G.title);
  }

  function begin() {
    ensureView();
    if (!state.log.length) {
      const sc = scene();
      state.visited[state.scene] = true;
      placeHero(view.entry("start"));
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
      if (!b || busy) return;
      sound("blip");
      verb = verb === b.dataset.verb ? null : b.dataset.verb;
      item = null;
      render();
    });

    const objAt = (e) => {
      const p = canvasPoint(e);
      const id = p && view.hitAt(p.cx, p.cy);
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
      if (state.finished || busy) return;
      const { p, o } = objAt(e);
      if (!p) return;
      if (o) {
        hoverName = null;
        perform(verb || "look", o.id, TWO_STEP.has(verb) ? item : null);
      } else {
        pending = null;
        const w = view.toWorld(p.cx, p.cy);
        walkTo(w.x, w.y);
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
      if (busy) return; // an effect is playing: keep the text, he can press Enter again
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
    $("#music").addEventListener("click", () => {
      Sound.musicOn = !Sound.musicOn;
      $("#music").textContent = Sound.musicOn ? "Music:on" : "Music:off";
  // Browsers only allow sound after a click: start the music on the first click anywhere.
  document.addEventListener("click", () => {
    Sound.unlock();
    if (state.started && !state.finished) Sound.music(sceneMusic());
  }, { once: true, capture: true });
      if (Sound.musicOn) Sound.music(sceneMusic());
    });
    $("#start").addEventListener("click", async () => {
      $("#help").hidden = true;
      Sound.unlock();
      Sound.music(state.finished ? null : sceneMusic());
      if (!state.started) {
        state.started = true;
        save();
        await titleCard();
        speakBatch();
      }
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
  ensureView();
  if (!state.hero) placeHero(view.entry("start"));
  requestAnimationFrame(loop);
  if (!Speech.available) $("#sound").hidden = true;
  $("#music").textContent = Sound.musicOn ? "Music:on" : "Music:off";
  if (state.started) $("#help").hidden = true;
  if (state.finished) { render(); renderLog(); showEnd(); } else begin();
};

window.loadEpisode().then(({ game, dict, preview, served }) => {
  window.EQ_PREVIEW = preview;
  window.startGame(game, dict, { preview, served });
});

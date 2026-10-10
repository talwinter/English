// Daily mission and Discord lock. Only active when the game is served by the English Quest server
// (opening index.html as a file still plays the game, without the lock).

(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  if (location.protocol === "file:") return;
  if (new URLSearchParams(location.search).has("draft")) return; // parent preview: no lock

  let status = null;

  async function api(path, body) {
    const r = await fetch(path, body ? {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    } : {});
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, data };
  }

  function setStatus(s) {
    status = s;
    const btn = $("#discord");
    btn.hidden = false;
    btn.textContent = s.locked ? "Discord:LOCKED" : "Discord:open";
    btn.classList.toggle("locked", s.locked);
  }

  // ---------- mission screen
  function showMission() {
    const s = status;
    let todo;
    if (s.doneToday) {
      todo = `<p class="m-done">✅ Mission complete!</p><p dir="rtl">המשימה של היום הושלמה. Discord פתוח. נתראה מחר!</p>`;
    } else if (s.mission.type === "episode") {
      todo = `<p class="m-step">1. ⚔️ Play: <b>${esc(s.mission.title)}</b></p>
        <p class="m-step">2. 🧠 Word Challenge</p>
        <p dir="rtl">תסיים את הפרק, ואז תעבור את אתגר המילים כדי לפתוח את Discord.</p>`;
    } else {
      todo = `<p class="m-step">🧠 Word Challenge: 8 questions</p>
        <p dir="rtl">ענה נכון על 6 מתוך 8 שאלות כדי לפתוח את Discord.</p>
        <button class="big" id="m-start">Start · התחל</button>`;
    }
    $("#mission-body").innerHTML = `
      <p class="m-lock ${s.locked ? "locked" : ""}">${s.locked ? "🔒 Discord is locked" : "🔓 Discord is open"}</p>
      ${todo}
      <p class="m-streak">🔥 Streak: ${s.streak} ${s.streak === 1 ? "day" : "days"}</p>`;
    $("#mission").hidden = false;
  }

  // ---------- word challenge
  let ch = null;

  async function startChallenge() {
    $("#mission").hidden = true;
    $("#end").hidden = true;
    $("#challenge").hidden = false;
    $("#challenge-body").innerHTML = "<p>…</p>";
    const { ok, data } = await api("/api/challenge/start", {});
    if (!ok) {
      const msg = data.error === "wait"
        ? `<p>⏳ Wait ${data.seconds} seconds.</p><p dir="rtl">חכה ${data.seconds} שניות ונסה שוב.</p>`
        : data.error === "episode-first"
          ? `<p>⚔️ First finish the episode.</p><p dir="rtl">קודם תסיים את הפרק.</p>`
          : `<p>Something went wrong.</p>`;
      $("#challenge-body").innerHTML = msg + `<button class="big" data-close>OK</button>`;
      return;
    }
    ch = { ...data, i: 0, results: [] };
    question();
  }

  function dots() {
    return `<div class="c-dots">${ch.questions.map((_, i) => {
      const r = ch.results[i];
      return `<span class="${r == null ? "" : r ? "right" : "wrong"}">${r == null ? "·" : r ? "✓" : "✗"}</span>`;
    }).join("")}</div>`;
  }

  function question() {
    const q = ch.questions[ch.i];
    const en = q.type === "en-he";
    $("#challenge-body").innerHTML = `${dots()}
      <p class="c-ask" ${en ? "" : 'dir="rtl"'}>${en ? "What is it in Hebrew?" : "מה זה באנגלית?"}</p>
      <p class="quiz-word" ${en ? "" : 'dir="rtl"'}>${esc(q.prompt)} ${en ? `<button class="say" data-say="${esc(q.prompt)}">🔊</button>` : ""}</p>
      <div class="quiz-options">${q.options.map((o, i) =>
        `<button class="c-opt" data-i="${i}" ${en ? 'dir="rtl"' : ""}>${esc(o)}</button>`).join("")}</div>`;
    if (en) window.Speech?.say(q.prompt, { rate: 0.75 });
  }

  async function answer(btn) {
    const choice = Number(btn.dataset.i);
    document.querySelectorAll(".c-opt").forEach((b) => { b.disabled = true; });
    const { ok, data } = await api("/api/challenge/answer", { id: ch.id, q: ch.i, choice });
    if (!ok) {
      $("#challenge-body").innerHTML = `<p>Time is up. Try again.</p><button class="big" id="c-again">Again · שוב</button>`;
      return;
    }
    ch.results[ch.i] = data.correct;
    document.querySelectorAll(".c-opt").forEach((b) => {
      if (Number(b.dataset.i) === data.answer) b.classList.add("right");
    });
    if (!data.correct) btn.classList.add("wrong");
    window.Speech?.say(data.word, { rate: 0.8 });
    setTimeout(() => {
      if (!data.done) { ch.i++; question(); return; }
      if (data.status) setStatus(data.status);
      $("#challenge-body").innerHTML = data.passed ? `${dots()}
        <p class="c-win">🔓 DISCORD UNLOCKED!</p>
        <p class="quiz-done">${data.score} / ${ch.questions.length} ⭐</p>
        <p dir="rtl">כל הכבוד! Discord פתוח עד מחר בבוקר.</p>
        <button class="big" data-close>OK</button>` : `${dots()}
        <p class="quiz-done">${data.score} / ${ch.questions.length}</p>
        <p>You need ${ch.pass}. Try again!</p>
        <p dir="rtl">צריך ${ch.pass} תשובות נכונות. נסה שוב בעוד 15 שניות.</p>
        <button class="big" id="c-again">Again · שוב</button>`;
    }, data.correct ? 700 : 1500);
  }

  // ---------- hooks into the game
  document.addEventListener("eq:level-complete", async (e) => {
    const { ok, data } = await api("/api/episode-done", { episode: e.detail.episode });
    if (!ok) return;
    setStatus(data);
    if (!data.doneToday && data.mission.type === "challenge" && !$("#end-challenge")) {
      const b = document.createElement("button");
      b.id = "end-challenge";
      b.className = "big";
      b.textContent = "🧠 Word Challenge · פתח את Discord";
      $("#play-again").before(b);
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("#discord")) showMission();
    else if (e.target.closest("#m-start, #c-again, #end-challenge")) startChallenge();
    else if (e.target.closest(".c-opt") && !e.target.closest(".c-opt").disabled) answer(e.target.closest(".c-opt"));
  });

  api("/api/status").then(({ ok, data }) => {
    if (!ok || !data.mission) return;
    setStatus(data);
    // Nothing to play today but the challenge: show the mission right away.
    if (data.locked && data.mission.type === "challenge") {
      const show = () => showMission();
      if ($("#help").hidden) show();
      else $("#start").addEventListener("click", show, { once: true });
    }
  }).catch(() => { /* no server: play without the lock */ });
})();

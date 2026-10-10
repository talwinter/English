// Special effects for exciting moments: shake, flash, glitch, an old screen turning on (crt), an old
// computer starting (boot), typing your name (askname), and being pulled into the screen (pullin).
// Episodes ask for them in a rule: do: { fx: ["crt", "boot"] }. Also the episode title card.

window.FX = (function () {
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const sfx = (n) => window.Sound && Sound.sfx(n);
  let glitchUntil = 0;

  // Restart a CSS animation class on an element and wait for it.
  function play(el, cls, ms) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    return wait(ms).then(() => el.classList.remove(cls));
  }

  async function typeLines(lines, speed = 45) {
    const pre = $("#term-text");
    pre.textContent = "";
    for (const line of lines) {
      for (const ch of line) {
        pre.textContent += ch;
        if (ch !== " ") sfx("type");
        await wait(speed);
      }
      pre.textContent += "\n";
      await wait(220);
    }
  }

  const name = () => { try { return localStorage.getItem("eq.name") || ""; } catch { return ""; } };

  const EFFECTS = {
    shake: () => play($(".scene-wrap"), "fx-shake", 650),
    flash: () => play($("#fx"), "fx-flash", 650),
    glitch() {
      sfx("glitch");
      glitchUntil = performance.now() + 1100;
      return play($(".scene-wrap"), "fx-glitch", 1100);
    },
    crt() {
      sfx("power");
      return play($("#fx"), "fx-crt", 1400);
    },
    async boot() {
      const t = $("#terminal");
      $("#term-input").hidden = true;
      t.hidden = false;
      await typeLines(["THE LAST QUEST  v1.0", "(C) 1987  GRANDPA SOFT", "", "MEMORY 640K ... OK", "", "INSERT DISK_"], 38);
      await wait(1500);
      t.hidden = true;
    },
    askname() {
      return new Promise((resolve) => {
        const t = $("#terminal"), input = $("#term-input");
        t.hidden = false;
        input.hidden = true;
        typeLines(["LOADING THE LAST QUEST ...", "", "TYPE YOUR NAME:"], 40).then(() => {
          input.hidden = false;
          input.value = "";
          input.focus();
        });
        input.onkeydown = (e) => {
          e.stopPropagation();
          if (e.key !== "Enter") { sfx("type"); return; }
          const typed = input.value.replace(/[^\p{L} '-]/gu, "").trim().slice(0, 16);
          if (!typed) return;
          try { localStorage.setItem("eq.name", typed); } catch { /* storage blocked */ }
          input.onkeydown = null;
          sfx("blip");
          setTimeout(() => { t.hidden = true; input.hidden = true; resolve(); }, 500);
        };
      });
    },
    async pullin() {
      sfx("whoosh");
      sfx("glitch");
      glitchUntil = performance.now() + 2600;
      $("#scene").classList.add("fx-pullin");
      $("#fx").classList.add("fx-white");
      await wait(2600);
      $("#scene").classList.remove("fx-pullin");
      await wait(400);
      $("#fx").classList.remove("fx-white");
    },
  };

  // Called after every frame is drawn: broken-screen lines while a glitch runs.
  function post(ctx, canvas, now) {
    if (now > glitchUntil) return;
    const w = canvas.width, h = canvas.height;
    for (let i = 0; i < 6; i++) {
      const y = (Math.random() * h) | 0, sh = (2 + Math.random() * 12) | 0, dx = (Math.random() * 30 - 15) | 0;
      ctx.drawImage(canvas, 0, y, w, sh, dx, y, w, sh);
    }
    ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,0,255,0.18)" : "rgba(0,255,255,0.18)";
    ctx.fillRect(0, (Math.random() * h) | 0, w, (10 + Math.random() * 30) | 0);
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? "#fff" : "#000";
      ctx.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, 2, 1);
    }
  }

  async function title(sub, text) {
    const t = $("#title-card");
    t.innerHTML = `<div class="tc-sub">${esc(sub)}</div><div class="tc-title">${esc(text)}</div>`;
    t.hidden = false;
    t.classList.remove("show");
    void t.offsetWidth;
    t.classList.add("show");
    sfx("goal");
    await wait(3000);
    t.hidden = true;
  }

  return { run: (n) => (EFFECTS[n] ? EFFECTS[n]() : Promise.resolve()), post, name, title, names: Object.keys(EFFECTS) };
})();

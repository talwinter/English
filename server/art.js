// The picture queue. The server lists the pictures the episodes need (art/shots.json);
// the art worker on the PC with the GPU asks for jobs, makes a few versions of each picture,
// and sends them back. A parent picks the best version on the parent page.

const fs = require("fs");
const path = require("path");
const { ROOT } = require("./content");

const STYLE = {
  background:
    "background art for a 1990 Sierra point-and-click adventure game, King's Quest V style, " +
    "hand-painted VGA pixel art, rich saturated colors, soft painterly shading, clear dark outlines on important objects, " +
    "side view, camera at eye level, open ground in the bottom third, no people, no text, no user interface, ",
  character:
    "full-body character for a 1990 Sierra adventure game, King's Quest V style VGA pixel art, standing, " +
    "side view facing right, whole body visible, centered, on a plain solid magenta background, no shadow, no text, ",
  item:
    "a single object for a 1990 Sierra adventure game inventory, King's Quest V style VGA pixel art, " +
    "centered, on a plain solid magenta background, no shadow, no text, ",
};
const NEGATIVE = "text, letters, watermark, signature, logo, blurry, photo, 3d render, frame, border, ui, multiple views";
const VARIANTS = 3;
const LEASE_MS = 30 * 60 * 1000;
const KEY = /^[a-z0-9-]{1,40}$/;

// options.episodeShots(): pictures listed in the episodes ({key, kind, height, prompt, episode})
// options.onChosen(key, n): called after a parent (or auto mode) picks a picture
// options.autoChoose: pick the first version by itself when a picture is done
function createArt(dataDir, options = {}) {
  const dir = path.join(dataDir, "art");
  const variantsDir = path.join(dir, "variants");
  const chosenDir = path.join(dir, "chosen");
  fs.mkdirSync(variantsDir, { recursive: true });
  fs.mkdirSync(chosenDir, { recursive: true });
  const file = path.join(dir, "art.json");

  const shots = () => {
    const all = [...JSON.parse(fs.readFileSync(path.join(ROOT, "art", "shots.json"), "utf8")).shots,
      ...(options.episodeShots ? options.episodeShots() : [])];
    const seen = new Set();
    return all.filter((s) => !seen.has(s.key) && seen.add(s.key));
  };
  let db = { jobs: {}, workerSeen: null };
  try { db = { ...db, ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch (e) { if (e.code !== "ENOENT") throw e; }
  const save = () => { fs.writeFileSync(`${file}.tmp`, JSON.stringify(db, null, 2)); fs.renameSync(`${file}.tmp`, file); };
  const job = (key) => (db.jobs[key] = db.jobs[key] || { status: "none", variants: [], chosen: null });

  // Queue pictures: the given keys (made again from scratch), or every picture not made yet.
  function queue(keys) {
    const all = shots();
    const list = keys && keys.length ? all.filter((s) => keys.includes(s.key)) : all.filter((s) => job(s.key).status === "none" || job(s.key).status === "failed");
    for (const s of list) Object.assign(job(s.key), { status: "pending", variants: [], error: null, leaseUntil: 0 });
    save();
    return list.map((s) => s.key);
  }

  // The worker asks for the next job.
  function next(now = Date.now()) {
    db.workerSeen = new Date(now).toISOString();
    const s = shots().find((x) => {
      const j = db.jobs[x.key];
      return j && (j.status === "pending" || (j.status === "working" && j.leaseUntil < now));
    });
    if (!s) { save(); return null; }
    Object.assign(job(s.key), { status: "working", leaseUntil: now + LEASE_MS });
    save();
    return {
      key: s.key, kind: s.kind, height: s.height || null, variants: VARIANTS,
      prompt: STYLE[s.kind] + s.prompt, negative: NEGATIVE,
      seed: Math.floor(Math.random() * 1e9),
    };
  }

  function result(key, n, rawPng, pixelPng) {
    if (!KEY.test(key) || !Number.isInteger(n) || n < 0 || n >= VARIANTS) throw new Error("bad result");
    const j = db.jobs[key];
    if (!j || j.status !== "working") throw new Error("no such job");
    const isPng = (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47;
    if (!isPng(rawPng) || !isPng(pixelPng)) throw new Error("not a PNG");
    fs.writeFileSync(path.join(variantsDir, `${key}-${n}-raw.png`), rawPng);
    fs.writeFileSync(path.join(variantsDir, `${key}-${n}.png`), pixelPng);
    if (!j.variants.includes(n)) j.variants.push(n);
    j.variants.sort();
    if (j.variants.length >= VARIANTS) j.status = "done";
    j.updatedAt = new Date().toISOString();
    save();
    if (j.status === "done" && options.autoChoose && j.chosen == null) choose(key, 0);
  }

  function fail(key, error) {
    const j = db.jobs[key];
    if (!j) return;
    Object.assign(j, { status: "failed", error: String(error).slice(0, 500), updatedAt: new Date().toISOString() });
    save();
  }

  function choose(key, n) {
    const j = db.jobs[key];
    if (!j || !j.variants.includes(n)) throw new Error("no such picture");
    fs.copyFileSync(path.join(variantsDir, `${key}-${n}.png`), path.join(chosenDir, `${key}.png`));
    j.chosen = n;
    save();
    if (options.onChosen) options.onChosen(key, n);
  }

  // Queue the pictures with these keys that were never made (used when a new episode arrives).
  function queueNew(keys) {
    const fresh = keys.filter((k) => job(k).status === "none" || job(k).status === "failed");
    return fresh.length ? queue(fresh) : [];
  }

  const isChosen = (key) => db.jobs[key] && db.jobs[key].chosen != null;
  const pendingCount = () => Object.values(db.jobs).filter((j) => j.status === "pending" || j.status === "working").length;
  const workerSeenAt = () => (db.workerSeen ? Date.parse(db.workerSeen) : 0);
  const rawPath = (key) => (db.jobs[key] && db.jobs[key].chosen != null ? path.join(variantsDir, `${key}-${db.jobs[key].chosen}-raw.png`) : null);

  function list() {
    return {
      workerSeen: db.workerSeen,
      shots: shots().map((s) => {
        const j = db.jobs[s.key] || { status: "none", variants: [], chosen: null };
        return { key: s.key, episode: s.episode, kind: s.kind, prompt: s.prompt, status: j.status, variants: j.variants, chosen: j.chosen, error: j.error || null };
      }),
    };
  }

  // Paths for serving files; null if the name is not a valid picture name.
  const variantPath = (name) => (/^[a-z0-9-]{1,40}-\d(-raw)?\.png$/.test(name) ? path.join(variantsDir, name) : null);
  const chosenPath = (name) => (/^[a-z0-9-]{1,40}\.png$/.test(name) ? path.join(chosenDir, name) : null);

  return { queue, queueNew, next, result, fail, choose, list, variantPath, chosenPath, isChosen, rawPath, pendingCount, workerSeenAt };
}

module.exports = { createArt, VARIANTS };

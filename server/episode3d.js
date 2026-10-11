// The 3D side of an episode: rooms from the catalog and props placed on them.
//
// The episode writer (OpenAI) gives every scene a room ("shell") and, for every object, a catalog prop and
// where it should be. applyLayout() turns that into real positions with layout.js, so the game only loads
// models at given positions, and returns the problems for the repair loop ("no room for X in Y").

const fs = require("fs");
const path = require("path");
const { layoutScene } = require("./layout");

const ROOT = path.join(__dirname, "..");

function loadCatalog(file = path.join(ROOT, "catalog", "catalog.json")) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Old (2D) episodes get their 3D hints from a separate file: { sceneId: { shell, objects: { id: {...} } } }
function applyHints(ep, hints) {
  const out = JSON.parse(JSON.stringify(ep));
  for (const sc of out.scenes) {
    const h = hints[sc.id];
    if (!h) continue;
    sc.shell = h.shell;
    for (const o of sc.objects) Object.assign(o, (h.objects || {})[o.id] || {});
  }
  return out;
}

// Places the objects of every scene. Returns { episode, errors, warnings, maps }.
function applyLayout(ep, catalog) {
  const out = JSON.parse(JSON.stringify(ep));
  const errors = [], warnings = [], maps = {};
  out.format = "3d";
  for (const sc of out.scenes) {
    const shell = catalog.shells[sc.shell];
    if (!shell) { errors.push(`scene ${sc.id}: there is no room "${sc.shell}" in the catalog`); continue; }
    const r = layoutScene(shell, sc.objects, catalog);
    errors.push(...r.errors.map((e) => `scene ${sc.id}: ${e}`));
    warnings.push(...r.warnings.map((w) => `scene ${sc.id}: ${w}`));
    maps[sc.id] = r.map;
    for (const o of sc.objects) {
      const pl = r.objects[o.id];
      if (!pl) continue;
      if (pl.fixed) { o.fixed = pl.id; continue; }
      o.at = { x: pl.x, y: pl.y, rot: pl.rot || 0, z: pl.z || 0 };
      if (pl.stand) o.stand = pl.stand;
      if (pl.parent) o.parent = pl.parent;
    }
    sc.entry = { x: shell.spawn[0], y: shell.spawn[1] };
  }
  return { episode: out, errors, warnings, maps };
}

module.exports = { loadCatalog, applyHints, applyLayout };

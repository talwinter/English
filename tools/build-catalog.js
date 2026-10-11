// Merges the catalog's per-model sidecar files (catalog/props/*.json, catalog/shells/*.json, written by the
// Blender scripts from the models themselves) into catalog/catalog.json, checks them, and copies the result
// to godot/catalog/catalog.json for the game.
//
//   node tools/build-catalog.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (dir) => {
  const d = path.join(ROOT, "catalog", dir);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith(".json")).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(d, f), "utf8")));
};

const props = Object.fromEntries(read("props").map((p) => [p.id, p]));
const shells = Object.fromEntries(read("shells").map((s) => [s.id, s]));
const problems = [];

// hand tuning of measured values (catalog/overrides.json), without opening Blender
const overridesFile = path.join(ROOT, "catalog", "overrides.json");
if (fs.existsSync(overridesFile)) {
  const o = JSON.parse(fs.readFileSync(overridesFile, "utf8"));
  for (const [id, patch] of Object.entries(o)) {
    if (id.startsWith("_")) continue;
    const target = props[id] || shells[id];
    if (target) Object.assign(target, patch);
    else problems.push(`overrides: unknown id ${id}`);
  }
}

for (const p of Object.values(props)) {
  if (!fs.existsSync(path.join(ROOT, "godot", "assets", p.glb))) problems.push(`prop ${p.id}: missing ${p.glb}`);
  if (!Array.isArray(p.footprint) || p.footprint.some((v) => !(v > 0))) problems.push(`prop ${p.id}: bad footprint`);
}
for (const s of Object.values(shells)) {
  if (!fs.existsSync(path.join(ROOT, "godot", "assets", s.glb))) problems.push(`shell ${s.id}: missing ${s.glb}`);
  if (!Array.isArray(s.floor) || s.floor.length !== 4) problems.push(`shell ${s.id}: bad floor`);
}

const catalog = { version: 1, shells, props };
const out = path.join(ROOT, "catalog", "catalog.json");
fs.writeFileSync(out, JSON.stringify(catalog, null, 1));
fs.mkdirSync(path.join(ROOT, "godot", "catalog"), { recursive: true });
fs.copyFileSync(out, path.join(ROOT, "godot", "catalog", "catalog.json"));

console.log(`Catalog: ${Object.keys(shells).length} shells, ${Object.keys(props).length} props`);
if (problems.length) {
  console.log("Problems:\n- " + problems.join("\n- "));
  process.exitCode = 1;
}

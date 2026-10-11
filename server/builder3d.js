// What the episode writer needs to write an episode for the 3D game: the shape of the answer (a JSON schema in
// which rooms and props can only be ids that exist in the catalog), the rules, and the catalog as text.
//
// The layout builder (layout.js) then puts the props on the floor; its problems are sent back to the writer in
// the repair loop, like every other check.

const Episode = require("../js/episode");
const { ZONE_NAMES } = require("./layout");

const str = { type: "string" };
const strs = { type: "array", items: str };
const strOrNull = { type: ["string", "null"] };
const object = (props) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const enumOrNull = (values) => ({ type: ["string", "null"], enum: [...values, null] });

function makeSchema(catalog) {
  const shellIds = Object.keys(catalog.shells);
  const propIds = Object.keys(catalog.props);
  const fixedIds = Object.values(catalog.shells).flatMap((s) => (s.fixed || []).map((f) => `@${f.id}`));
  const cond = object({ flags: strs, notFlags: strs, has: strs, notHas: strs });
  const effects = object({
    set: strs, unset: strs, add: strs, remove: strs, goal: strOrNull, go: strOrNull, finish: { type: "boolean" },
    fx: { type: "array", items: { type: "string", enum: Episode.FX.filter((f) => !["askname", "pullin", "crt", "boot"].includes(f)) } },
  });
  const rule = object({
    verb: { type: "array", items: { type: "string", enum: Episode.VERBS } },
    obj: { type: ["array", "null"], items: str },
    item: strOrNull,
    when: cond,
    say: str,
    do: effects,
    points: { type: "integer" },
    pointsId: strOrNull,
  });
  return object({
    id: str,
    title: str,
    summary: str,
    previously: strs,
    start: object({ scene: str, goal: str }),
    items: { type: "array", items: object({ id: str, name: str, words: strs, look: str, prop: enumOrNull(propIds) }) },
    goals: { type: "array", items: object({ id: str, en: str, he: str, hint: str, hintHe: str }) },
    scenes: {
      type: "array",
      items: object({
        id: str, name: str, intro: str, introAgain: str,
        shell: { type: "string", enum: shellIds },
        music: { type: "string", enum: Episode.MUSIC },
        objects: {
          type: "array",
          items: object({
            id: str, name: str, words: strs, look: str,
            prop: enumOrNull([...propIds, ...fixedIds]),
            of: strOrNull,
            part: strOrNull,
            where: enumOrNull(ZONE_NAMES),
            against: enumOrNull(["back", "left", "right"]),
            near: strOrNull,
            on: strOrNull,
            inside: strOrNull,
            slot: strOrNull,
            opensWith: strOrNull,
            visible: cond,
          }),
        },
        rules: { type: "array", items: rule },
      }),
    },
    globalRules: { type: "array", items: rule },
    ending: strs,
    canon: object({
      facts: strs,
      openedThreads: { type: "array", items: object({ id: str, text: str }) },
      resolvedThreads: strs,
    }),
    wishes: { type: "array", items: object({ kind: { type: "string", enum: ["prop", "room", "character", "effect", "cutscene"] }, text: str }) },
    dictionary: { type: "array", items: object({ en: str, he: str }) },
  });
}

function catalogText(catalog) {
  const lines = ["ROOMS (every scene uses exactly one):"];
  for (const s of Object.values(catalog.shells)) {
    const fixed = (s.fixed || []).map((f) => `@${f.id} (${f.desc})`).join("; ");
    const slots = Object.keys(s.slots || {}).join(", ");
    lines.push(`- ${s.id} [${s.kind}] ${s.desc}. Size ${(s.floor[2] - s.floor[0]).toFixed(0)} x ${(s.floor[3] - s.floor[1]).toFixed(0)} m.` +
      (s.walls && Object.keys(s.walls).length ? ` Walls: ${Object.keys(s.walls).join(", ")}.` : " No walls.") +
      (fixed ? ` Fixed things (use as prop "@id", they are not placed): ${fixed}.` : "") +
      (slots ? ` Slots: ${slots}.` : ""));
  }
  lines.push("", "PROPS (things and people you can put in a room):");
  for (const p of Object.values(catalog.props)) {
    const flags = [p.kind, p.surface ? "has a surface: things can be put ON it" : "", p.container ? "container: things can be INSIDE it" : "",
      p.wall ? "stands against a wall" : "", (p.place || []).includes("edge") ? "an exit at the edge of an outdoor room" : "",
      p.parts ? `parts: ${Object.keys(p.parts).join(", ")}` : "", p.opens ? "can open (use opensWith)" : ""].filter(Boolean).join("; ");
    lines.push(`- ${p.id} (${p.footprint[0].toFixed(1)} x ${p.footprint[1].toFixed(1)} m): ${p.desc}. [${flags}]`);
  }
  lines.push("", `ZONES you can use in "where": ${ZONE_NAMES.join(", ")} (back = far from the camera).`);
  return lines.join("\n");
}

const RULES3D_SCENES = `ROOMS AND THINGS (the game is in 3D; there are no pictures to describe)
- Every scene has a "shell": one room from the catalog. Every object has a "prop": a thing from the catalog (or
  "@id" for a fixed thing of that room). Use only ids from the catalog lists; nothing else exists.
- Where things go: "where" = a zone of the room. Optional: "against" (back, left or right wall: for doors, chests,
  shelves), "near" (another object's id), "on" (a table or other object with a surface), "inside" (a container),
  "slot" (a named spot of the room, for example the middle of a bridge). A thing taken from a table is "on" it.
- A door or window that belongs to a house is its own object with prop null, "of" = the house's object id and
  "part" = "door" or "window". Give a door or a chest "opensWith" = the flag that opens it (the same flag the
  open rule sets).
- A thing he can take is an object with an item prop and the SAME id as an entry of "items". Hide it after it is
  taken with visible.notFlags. A thing inside a chest should have visible.flags = [the flag that opens the chest].
- People and animals are props of kind "character". Put them in a zone near what they do. The hero and Byte are
  added by the game: never list them as objects.
- Exits are objects (a door_wall, a forest_edge, a signpost, the bridge) with a rule whose do.go is the next
  scene id. A scene needs 3 to 8 objects; leave room to walk between things. Do not put many big things in a
  small room. If the game says there is no room, use fewer things or another zone.
- Be honest about what things are. Never use a prop for something it is not (a rock for a lake, a barrel for a
  person, a house for a cave). A person or an animal must be a prop of kind "character". If nothing in the
  catalog is right, either choose a puzzle that uses what the catalog has, or use the closest thing AND add a
  "wishes" entry that says exactly what is missing (for example "a frozen lake room", "a fisherman character").
- Every item must be possible to get (a rule with do.add), and the puzzle chain must be NEEDED to finish: the
  robot must have to take, use or give things, and talk to people, in a real order, at least 5 steps (6 or more is better). A trade
  that can be skipped is not a puzzle.
- If the story needs something the catalog does not have (a prop, a room, a person, an effect or a special
  cutscene), use the closest thing that exists AND add an entry to "wishes" saying what you wished for. The
  episode must still work without it.
- "endingStyle" is always lines: the "ending" lines are shown one by one. Do not use the effects askname, pullin, crt or boot (they need the attic's computer); shake, flash and glitch are fine.`;

// the 2D rules, with the picture section replaced
function rules3d(rules2d) {
  const cut = rules2d.indexOf("PICTURES");
  const head = cut > 0 ? rules2d.slice(0, cut).trimEnd() : rules2d;
  return `${head}\n\n${RULES3D_SCENES}`;
}

// A rule as the game's two engines read it: no null fields (the model answers "item": null, "goal": null, ...).
function cleanRule(r) {
  r.obj = r.obj && r.obj.length ? r.obj : null;
  if (r.item === null || r.item === undefined || r.item === "") delete r.item;
  if (!r.points) { delete r.points; delete r.pointsId; }
  if (r.do) for (const k of Object.keys(r.do)) if (r.do[k] === null) delete r.do[k];
  return r;
}

// The model often writes an id a little differently where it uses it ("breadObj", "item_rope", "Fish") than where
// it made it. When a reference matches exactly one known id after the usual changes, it is corrected here, so
// that a whole rewrite is not needed for a spelling slip.
function fixReferences(ep) {
  const canon = (s) => String(s).toLowerCase().replace(/^item[_-]?/, "").replace(/[_-]?(obj|object|item|thing)$/, "").replace(/[^a-z0-9]/g, "");
  const items = new Set((ep.items || []).map((i) => i.id));
  const allObjs = new Set(ep.scenes.flatMap((sc) => sc.objects.map((o) => o.id)));
  const resolve = (ref, known) => {
    if (known.has(ref)) return ref;
    const hits = [...known].filter((k) => canon(k) === canon(ref));
    return hits.length === 1 ? hits[0] : ref;
  };
  const fixCond = (c, flagsToo) => {
    if (!c) return;
    for (const k of ["has", "notHas"]) if (Array.isArray(c[k])) c[k] = c[k].map((i) => resolve(i, items));
  };
  const fixRule = (r, objs) => {
    if (r.obj) r.obj = r.obj.map((o) => resolve(o, objs));
    if (r.item) r.item = resolve(r.item, items);
    fixCond(r.when);
    if (r.do) for (const k of ["add", "remove"]) if (Array.isArray(r.do[k])) r.do[k] = r.do[k].map((i) => resolve(i, items));
  };
  for (const sc of ep.scenes) {
    const objs = new Set(sc.objects.map((o) => o.id));
    for (const o of sc.objects) {
      fixCond(o.visible);
      for (const k of ["near", "on", "inside"]) if (o[k]) o[k] = resolve(o[k], objs);
      if (o.of) o.of = resolve(o.of, objs);
    }
    for (const r of sc.rules) fixRule(r, objs);
  }
  for (const r of ep.globalRules || []) fixRule(r, allObjs);
  return ep;
}

function normalize3d(ep, id) {
  ep.id = id;
  ep.format = "3d";
  ep.endingStyle = "lines";
  const nullToUndefined = (o) => { for (const k of Object.keys(o)) if (o[k] === null) delete o[k]; };
  for (const sc of ep.scenes) {
    for (const o of sc.objects) nullToUndefined(o);
    sc.rules = sc.rules.map(cleanRule);
  }
  ep.globalRules = (ep.globalRules || []).map(cleanRule);
  const seen = new Set();
  ep.dictionary = (ep.dictionary || []).map((d) => ({ en: d.en.toLowerCase().trim(), he: d.he.trim() }))
    .filter((d) => d.en && !seen.has(d.en) && seen.add(d.en));
  ep.items = (ep.items || []).map((i) => { if (i.prop === null) delete i.prop; return i; });
  ep.canon = ep.canon || { facts: [], openedThreads: [], resolvedThreads: [] };
  ep.wishes = ep.wishes || [];
  return fixReferences(ep);
}

module.exports = { makeSchema, catalogText, rules3d, normalize3d };

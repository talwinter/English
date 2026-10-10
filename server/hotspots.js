// Finds where things are in a background picture, so clicks hit the door, the tree, and so on.
// Runs once when a background is chosen: OpenAI looks at the picture and returns boxes, the outline of the
// floor (where people can walk), and how tall a person standing on it looks.

const { chatJson } = require("./openai");

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["objects", "floorOutline", "personHeight", "groundTop", "groundBottom"],
  properties: {
    objects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "found", "left", "top", "right", "bottom"],
        properties: {
          id: { type: "string" },
          found: { type: "boolean" },
          left: { type: "number" }, top: { type: "number" }, right: { type: "number" }, bottom: { type: "number" },
        },
      },
    },
    floorOutline: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["x", "y"],
        properties: { x: { type: "number" }, y: { type: "number" } },
      },
    },
    personHeight: { type: "number" },
    groundTop: { type: "number" },
    groundBottom: { type: "number" },
  },
};

// things: [{ id, name, look }]. Returns, on a 320x200 picture: { boxes: {id: [x, y, w, h]}, floor: {y0, y1},
// walk: [[x, y], ...] or null, heroHeight: pixels or null }.
async function locate(env, png, things) {
  const list = things.map((t) => `- ${t.id}: ${t.name} (${t.look})`).join("\n");
  const { json } = await chatJson(env, {
    name: "hotspots",
    schema: SCHEMA,
    timeoutMs: 3 * 60 * 1000,
    messages: [
      {
        role: "system",
        content: "You find things in a picture from a point-and-click adventure game. Give each thing a box that " +
          "covers it, with left, top, right, bottom as fractions of the picture (0 = left/top edge, 1 = right/bottom " +
          "edge). If a thing is not in the picture, set found to false and give your best guess of where it would be. " +
          "Also give the floor where a person could walk: floorOutline is the outline of the open floor as 4 to 10 " +
          "points (x, y as fractions), going around it in order. Only open floor: not tables, desks, beds, walls, " +
          "water or furniture, and not behind furniture. personHeight: how tall a grown-up standing on the floor in " +
          "the middle of the picture would look, as a fraction of the picture height (use the doors and furniture " +
          "to judge). groundTop and groundBottom: the top and bottom of the floor, as fractions of the height.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Find these things:\n${list}` },
          { type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } },
        ],
      },
    ],
  });
  const W = 320, H = 200;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const boxes = {};
  for (const o of json.objects) {
    if (!o.found) continue;
    const x0 = clamp(Math.round(Math.min(o.left, o.right) * W), 0, W - 4);
    const y0 = clamp(Math.round(Math.min(o.top, o.bottom) * H), 0, H - 4);
    const x1 = clamp(Math.round(Math.max(o.left, o.right) * W), x0 + 4, W);
    const y1 = clamp(Math.round(Math.max(o.top, o.bottom) * H), y0 + 4, H);
    boxes[o.id] = [x0, y0, x1 - x0, y1 - y0];
  }
  // The floor outline, kept below the top third of the picture (people don't walk on the ceiling).
  let walk = (json.floorOutline || []).map((p) => [clamp(Math.round(p.x * W), 0, W), clamp(Math.round(p.y * H), 60, H)]);
  if (walk.length < 3 || area(walk) < 300) walk = null;
  let y0, y1;
  if (walk) {
    y0 = Math.min(...walk.map((p) => p[1]));
    y1 = Math.min(H - 2, Math.max(...walk.map((p) => p[1])));
    if (y1 - y0 < 15) walk = null;
  }
  if (!walk) {
    y0 = clamp(Math.round(json.groundTop * H), 60, H - 20);
    y1 = clamp(Math.round(json.groundBottom * H), y0 + 15, H - 2);
    if (y1 - y0 < 15) y0 = y1 - 15;
  }
  const heroHeight = json.personHeight > 0 ? clamp(Math.round(json.personHeight * H), 40, 130) : null;
  return { boxes, floor: { y0, y1 }, walk, heroHeight };
}

function area(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(a / 2);
}

module.exports = { locate };

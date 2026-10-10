// Finds where things are in a background picture, so clicks hit the door, the tree, and so on.
// Runs when a parent chooses a background: OpenAI looks at the picture and returns boxes.

const { chatJson } = require("./openai");

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["objects", "groundTop", "groundBottom"],
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
    groundTop: { type: "number" },
    groundBottom: { type: "number" },
  },
};

// things: [{ id, name, look }]. Returns { boxes: {id: [x, y, w, h]}, floor: {y0, y1} } on a 320x200 picture.
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
          "Also give the ground where a person could walk: groundTop and groundBottom as fractions of the height.",
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
  let y0 = clamp(Math.round(json.groundTop * H), 60, H - 20);
  let y1 = clamp(Math.round(json.groundBottom * H), y0 + 15, H - 2);
  if (y1 - y0 < 15) y0 = y1 - 15;
  return { boxes, floor: { y0, y1 } };
}

module.exports = { locate };

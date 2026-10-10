// A small OpenAI client: one request, JSON answer that must match a schema (structured output).

async function chatJson(env, { name, schema, messages, timeoutMs = 10 * 60 * 1000 }) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  const base = (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5-mini",
      messages,
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const data = await r.json();
  const msg = data.choices && data.choices[0] && data.choices[0].message;
  if (!msg) throw new Error("OpenAI sent no answer");
  if (msg.refusal) throw new Error(`OpenAI refused: ${msg.refusal}`);
  return { json: JSON.parse(msg.content), text: msg.content, usage: data.usage || {} };
}

module.exports = { chatJson };

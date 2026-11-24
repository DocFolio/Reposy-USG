/* Reposy-USG — AI proxy (Google Gemini).
   The free tier returns 503 under load, so this walks a list of models
   and retries briefly rather than surfacing a transient failure. */

const MODELS = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.6-flash"];
const ROUNDS = 2;
const GAP_MS = 600;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function scrub(text) {
  return String(text)
    .replace(/\b(?:\+91[-\s]?)?[6-9]\d{9}\b/g, "[number removed]")
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "[number removed]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email removed]")
    .replace(/\b(?:mr|mrs|ms|master|baby of|b\/o|w\/o|s\/o|d\/o)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/gi, "[name removed]")
    .replace(/\b(?:uhid|mrn|ip\s?no|op\s?no|reg\s?no|hosp\s?no)\.?[:\s#-]*[A-Za-z0-9/-]+/gi, "[id removed]");
}

const allowed = (host) =>
  host.startsWith("localhost") || (host.endsWith(".vercel.app") && host.includes("reposy"));

async function tryModel(model, system, user) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_KEY },
      body: JSON.stringify({
        system_instruction: system ? { parts: [{ text: system }] } : undefined,
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
      }),
    }
  );
  const data = await r.json().catch(() => ({}));
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  return { status: r.status, text, raw: data?.error?.message || "" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let host = "";
  try { host = new URL(req.headers.origin || req.headers.referer || "").host; } catch {}
  if (host && !allowed(host)) return res.status(403).json({ error: "Forbidden" });

  const messages = Array.isArray((req.body || {}).messages) ? req.body.messages : [];
  if (!messages.length) return res.status(400).json({ error: "No content" });

  const system = messages.filter((m) => m.role === "system").map((m) => scrub(m.content)).join("\n\n");
  const user = messages.filter((m) => m.role !== "system").map((m) => scrub(m.content)).join("\n\n");

  let last = { status: 0, raw: "" };
  for (let round = 0; round < ROUNDS; round++) {
    for (const model of MODELS) {
      try {
        const out = await tryModel(model, system, user);
        if (out.status === 200 && out.text.trim())
          return res.status(200).json({ choices: [{ message: { role: "assistant", content: out.text } }] });
        last = out;
        if (out.status === 401 || out.status === 403)
          return res.status(out.status).json({ error: "The AI service rejected its credentials." });
      } catch (e) {
        last = { status: 502, raw: e.message };
      }
      await sleep(GAP_MS);
    }
  }

  const friendly =
    last.status === 503 || last.status === 429
      ? "The free AI tier is busy right now. The report above is complete — write the impression yourself, or try again in a minute."
      : last.raw || "The AI service is unavailable.";
  return res.status(503).json({ error: friendly });
}

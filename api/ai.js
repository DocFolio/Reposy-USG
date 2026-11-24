/* Reposy-USG — AI proxy (Google Gemini).
   The app sends OpenAI-shaped messages; this translates them to
   Gemini's format and back, so the frontend is unchanged. */

const MODEL = "gemini-3.8-flash";

function scrub(text) {
  return String(text)
    .replace(/\b(?:\+91[-\s]?)?[6-9]\d{9}\b/g, "[number removed]")
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "[number removed]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email removed]")
    .replace(/\b(?:mr|mrs|ms|master|baby of|b\/o|w\/o|s\/o|d\/o)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/gi, "[name removed]")
    .replace(/\b(?:uhid|mrn|ip\s?no|op\s?no|reg\s?no|hosp\s?no)\.?[:\s#-]*[A-Za-z0-9/-]+/gi, "[id removed]");
}

function allowed(host) {
  return host.startsWith("localhost") || (host.endsWith(".vercel.app") && host.includes("reposy"));
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

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
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
    const data = await r.json();

    if (!r.ok) {
      const raw = data?.error?.message || "";
      const friendly =
        r.status === 429 ? "The AI service is rate limited right now. Try again in a minute."
        : r.status === 401 || r.status === 403 ? "The AI service rejected its credentials."
        : raw || "The AI service returned an error.";
      return res.status(r.status).json({ error: friendly });
    }

    const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    if (!text.trim()) return res.status(502).json({ error: "The AI service returned an empty response." });

    /* Reply in the shape the app already reads. */
    return res.status(200).json({ choices: [{ message: { role: "assistant", content: text } }] });
  } catch {
    return res.status(502).json({ error: "Could not reach the impression service." });
  }
}

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

  const clean = messages.map((m) => ({ role: m.role, content: scrub(m.content) }));

  try {
    const r = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GLM_KEY}` },
      body: JSON.stringify({ model: "glm-4.6", temperature: 0.2, max_tokens: 4000, thinking: { type: "disabled" }, messages: clean }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || "Upstream error" });
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: "Could not reach the impression service." });
  }
}

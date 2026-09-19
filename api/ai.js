/* Reposy-USG — AI proxy.
   The endpoint is public by design, so it is defended in depth rather
   than by a password: only calls from the app are accepted, each caller
   gets a small budget, the whole deployment gets a daily ceiling, and
   anything that looks like a patient identifier is removed before the
   text leaves this server. */

const ALLOWED_HOSTS = [
  "reposy-usg.vercel.app",
  "localhost:5173",
  "localhost:5174",
  "localhost:5175",
];

const PER_IP_LIMIT = 20;
const PER_IP_WINDOW_MS = 10 * 60e3;
const DAILY_LIMIT = 800;
const MAX_CHARS = 8000;
const MAX_TOKENS = 700;

const hits = new Map();
let day = new Date().toISOString().slice(0, 10);
let dayCount = 0;

function rateLimited(ip) {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; hits.clear(); }
  if (++dayCount > DAILY_LIMIT) return "daily";
  const rec = hits.get(ip) || [];
  const recent = rec.filter((t) => now - t < PER_IP_WINDOW_MS);
  if (recent.length >= PER_IP_LIMIT) { hits.set(ip, recent); return "ip"; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return null;
}

function scrub(text) {
  return String(text)
    .replace(/\b(?:\+91[-\s]?)?[6-9]\d{9}\b/g, "[number removed]")
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "[number removed]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email removed]")
    .replace(/\b(?:mr|mrs|ms|master|baby of|b\/o|w\/o|s\/o|d\/o)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/gi, "[name removed]")
    .replace(/\b(?:uhid|mrn|ip\s?no|op\s?no|reg\s?no|hosp\s?no)\.?[:\s#-]*[A-Za-z0-9/-]+/gi, "[id removed]");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let host = "";
  try { host = new URL(req.headers.origin || req.headers.referer || "").host; } catch {}
  if (!ALLOWED_HOSTS.includes(host)) return res.status(403).json({ error: "Forbidden" });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const limited = rateLimited(ip);
  if (limited === "ip") return res.status(429).json({ error: "Too many requests from this device. Try again in a few minutes." });
  if (limited === "daily") return res.status(429).json({ error: "The impression service has reached its daily limit. Write the impression yourself." });

  const body = req.body || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) return res.status(400).json({ error: "No content" });

  const total = messages.reduce((n, m) => n + String(m.content || "").length, 0);
  if (total > MAX_CHARS) return res.status(413).json({ error: "Report too long for the impression service." });

  const clean = messages.map((m) => ({ role: m.role, content: scrub(m.content) }));

  try {
    const r = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GLM_KEY}` },
      body: JSON.stringify({ model: "glm-4.6", temperature: 0.2, max_tokens: MAX_TOKENS, messages: clean }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: "Upstream error" });
    return res.status(200).json(data);
  } catch {
    return res.status(502).json({ error: "Could not reach the impression service." });
  }
}

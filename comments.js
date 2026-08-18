import { createHash } from "node:crypto";

/* ============================================================
   comments.js — live comments for YNWA, backed by Upstash Redis.

   WHY REDIS, NOT IN-MEMORY
   This is a dress rehearsal for whether "comments on events" is a
   real feature worth building a whole site around — not a throwaway
   toy. A mid-match hotfix (which has genuinely happened once already
   in this project) would wipe in-memory comments entirely. Upstash's
   REST API needs nothing more than a URL and a token — the exact
   same shape as every other external call in this codebase
   (football-data.org, ESPN) — so it doesn't introduce a new kind of
   complexity, just another fetch().

   DATA MODEL
   One Redis LIST per match: "ynwa:comments:<matchId>", each element
   a JSON-stringified comment:
     { id, matchId, eventId, parentId, name, text, at }
   eventId links a comment to one feed line (ynwa.js's `seq` field —
   ESPN's own sequence number, stable across re-fetches). null means
   a general comment, not tied to a moment. parentId links a reply to
   another comment; null means top-level. Both nullable fields let one
   flat list represent general chat, event-linked comments, and
   threaded replies without three separate structures.
   ============================================================ */

// Cleaned defensively: trimmed (a trailing space or newline from
// copy-pasting a dashboard value is invisible but breaks URL parsing
// outright) and stripped of surrounding quote marks (a very common
// artifact of copying a value out of a .env-style snippet that displayed
// it quoted, e.g. `URL="https://..."`, rather than the bare value).
// Loops in case of more than one layer of either.
function cleanEnv(v) {
  let s = (v || "").trim();
  while (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}
const UPSTASH_URL = cleanEnv(process.env.UPSTASH_REDIS_REST_URL);
const UPSTASH_TOKEN = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);

const MAX_NAME = 40;
const MAX_TEXT = 280;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Gravatar-style avatars, no accounts, no email ever stored.
   The email is hashed the instant it arrives and discarded — only the
   hash reaches storage. Anyone with a real Gravatar gets their actual
   photo; everyone else gets a stable, distinct pattern generated from
   their name instead (Gravatar's "identicon" fallback), so nobody is
   left with a blank space just for not having an account. */
function md5(s) { return createHash("md5").update(s).digest("hex"); }

function avatarHashFor(email, name) {
  const e = String(email || "").trim().toLowerCase();
  if (EMAIL_RE.test(e)) return { hash: md5(e), fallback: "mp" };       // real email → maybe a real photo
  return { hash: md5(name.toLowerCase()), fallback: "identicon" };      // no email → a stable pattern from the name
}

/* Sent as a POST with a JSON array body (not URL path segments) so
   Icelandic characters and punctuation never need manual encoding —
   Upstash's own recommended shape for exactly this reason. */
async function redisCommand(cmd) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    throw new Error("No UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN set");
  }
  try {
    new URL(UPSTASH_URL); // fetch()'s own parse error is cryptic — fail clearly first
  } catch {
    throw new Error(`UPSTASH_REDIS_REST_URL isn't a valid URL: "${UPSTASH_URL}"`);
  }
  const r = await fetch(UPSTASH_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.error) throw new Error(body.error || `Upstash responded ${r.status}`);
  return body.result;
}

const keyFor = (matchId) => `ynwa:comments:${matchId}`;

export async function addComment(matchId, comment) {
  await redisCommand(["RPUSH", keyFor(matchId), JSON.stringify(comment)]);
}

export async function getComments(matchId) {
  const raw = await redisCommand(["LRANGE", keyFor(matchId), "0", "-1"]);
  return (raw || [])
    .map((s) => { try { return JSON.parse(s); } catch { return null; } })
    .filter(Boolean);
}

/* Basic spam guard: not bulletproof (in-memory, resets on a redeploy —
   the comments themselves don't, only this counter does), but enough
   to stop accidental rapid double-clicks or a runaway script. A real
   moderation story is a later concern, not a Sunday concern. */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 20;
const seenBy = new Map(); // ip -> [timestamps]

function rateLimited(ip) {
  const now = Date.now();
  const hits = (seenBy.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  seenBy.set(ip, hits);
  return hits.length > RATE_MAX;
}

export async function commentsGet(req, res) {
  const matchId = String(req.query.event || "").trim();
  if (!matchId) return res.status(400).json({ ok: false, reason: "missing ?event=" });
  try {
    const comments = await getComments(matchId);
    res.json({ ok: true, comments });
  } catch (err) {
    console.error("[comments] get failed:", err.message);
    res.json({ ok: false, reason: err.message, comments: [] });
  }
}

export async function commentsPost(req, res) {
  const ip = req.ip || "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ ok: false, reason: "Of margar athugasemdir í einu — bíddu aðeins." });
  }

  const body = req.body || {};
  const matchId = String(body.matchId || "").trim();
  const text = String(body.text || "").trim().slice(0, MAX_TEXT);
  const name = String(body.name || "").trim().slice(0, MAX_NAME) || "Nafnlaus stuðningsmaður";
  const eventId = body.eventId != null ? String(body.eventId) : null;
  const parentId = body.parentId != null ? String(body.parentId) : null;

  if (!matchId || !text) {
    return res.status(400).json({ ok: false, reason: "matchId and text are required" });
  }

  // The raw email lives only in this one line, for the moment it takes to
  // hash it. It is never assigned to `comment`, never logged, never sent
  // back in a response — only avatarHash/avatarFallback are.
  const { hash: avatarHash, fallback: avatarFallback } = avatarHashFor(body.email, name);

  const comment = {
    id: "c" + Date.now() + Math.random().toString(36).slice(2, 8),
    matchId, eventId, parentId, name, text, avatarHash, avatarFallback,
    at: new Date().toISOString(),
  };

  try {
    await addComment(matchId, comment);
    res.json({ ok: true, comment });
  } catch (err) {
    console.error("[comments] post failed:", err.message);
    res.status(503).json({ ok: false, reason: "Gat ekki vistað athugasemd — reyndu aftur." });
  }
}

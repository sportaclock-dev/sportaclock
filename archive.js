import { fetchMatchForArchive, findRecentLiverpoolMatches } from "./ynwa.js";

/* ============================================================
   archive.js — permanent snapshots of finished matches, backed by
   the same Upstash Redis store as comments.js.

   WHY A PERMANENT SNAPSHOT, NOT A LIVE RE-FETCH EVERY TIME
   A finished match shouldn't depend on ESPN still being reachable —
   which, this project, has already not been true more than once
   (throttling storms, a mirror serving stale data mid-match). Saving
   the full translated feed once, at the moment a match is confirmed
   over, means viewing it again later only ever touches Upstash —
   never ESPN again.

   WHY THE ENV/REDIS-CALL SETUP IS DUPLICATED FROM comments.js RATHER
   THAN IMPORTED
   It's four lines. Keeping this file able to stand on its own, the
   same way comments.js does, felt more valuable than a shared import
   for something this small.

   DATA MODEL
   ynwa:archive:match:<id>  — one JSON blob: the exact payload shape
                              the live page already renders (header +
                              feed), frozen at archiving time.
   ynwa:archive:index       — one Redis HASH, matchId -> a small JSON
                              summary (teams, score, date). A HASH,
                              not a LIST, so archiving the same match
                              twice updates its entry rather than
                              duplicating it.
   Comments need no separate handling at all — comments.js already
   keys everything by matchId, so whatever was posted while a match
   was live is still there under the exact same id once it's archived.
   ============================================================ */

function cleanEnv(v) {
  let s = (v || "").trim();
  while (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}
const UPSTASH_URL = cleanEnv(process.env.UPSTASH_REDIS_REST_URL);
const UPSTASH_TOKEN = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);
const ADMIN_KEY = cleanEnv(process.env.ADMIN_KEY);
const INDEX_KEY = "ynwa:archive:index";
const keyForMatch = (id) => `ynwa:archive:match:${id}`;

async function redisCommand(cmd) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    throw new Error("No UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN set");
  }
  try { new URL(UPSTASH_URL); } catch {
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

function summaryEntry(matchId, header) {
  return {
    matchId: String(matchId),
    home: header.home.short, away: header.away.short,
    homeScore: header.home.score, awayScore: header.away.score,
    league: header.league || "", venue: header.venue || "",
    dateIso: header.kickoff || null,
    archivedAt: new Date().toISOString(),
  };
}

export async function saveArchive(matchId, payload) {
  await redisCommand(["SET", keyForMatch(matchId), JSON.stringify(payload)]);
  await redisCommand(["HSET", INDEX_KEY, String(matchId), JSON.stringify(summaryEntry(matchId, payload.header))]);
}

export async function getArchiveIndex() {
  const raw = await redisCommand(["HGETALL", INDEX_KEY]); // flat [k1, v1, k2, v2, ...]
  const out = [];
  for (let i = 0; i < raw.length; i += 2) {
    try { out.push(JSON.parse(raw[i + 1])); } catch { /* skip a corrupt entry rather than fail the whole list */ }
  }
  out.sort((a, b) => new Date(b.dateIso || 0) - new Date(a.dateIso || 0)); // newest first
  return out;
}

export async function getArchivedMatch(matchId) {
  const raw = await redisCommand(["GET", keyForMatch(matchId)]);
  return raw ? JSON.parse(raw) : null;
}

export async function archiveList(req, res) {
  try {
    const matches = await getArchiveIndex();
    res.json({ ok: true, matches });
  } catch (err) {
    res.status(503).json({ ok: false, reason: err.message });
  }
}

export async function archiveOne(req, res) {
  try {
    const id = String(req.query.event || "").trim();
    if (!id) return res.status(400).json({ ok: false, reason: "missing ?event=" });
    const match = await getArchivedMatch(id);
    if (!match) return res.status(404).json({ ok: false, reason: "Enginn leikur fannst með þetta auðkenni í safninu." });
    res.json(match);
  } catch (err) {
    res.status(503).json({ ok: false, reason: err.message });
  }
}

// Admin-triggered: fetch ONE match by its ESPN id right now, and save it
// permanently if (and only if) it's actually finished. This is the only
// way a match ever enters the archive — there's no automatic detection,
// by design (see the three-options discussion this feature came out of).
// Admin-only: sweep ESPN's own scoreboards for Liverpool's recently
// finished matches, so archiving never again requires already knowing a
// random ESPN numeric id — find it here, then archive it in one click.
export async function archiveSearch(req, res) {
  if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) {
    return res.status(403).json({ ok: false, reason: "Rangur eða enginn stjórnandalykill." });
  }
  try {
    const { matches, refusalNote } = await findRecentLiverpoolMatches(req.query.days);
    res.json({ ok: true, matches, refusalNote });
  } catch (err) {
    res.status(503).json({ ok: false, reason: err.message });
  }
}

export async function archiveCreate(req, res) {
  if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) {
    return res.status(403).json({ ok: false, reason: "Rangur eða enginn stjórnandalykill." });
  }
  const eventId = String(req.query.event || "").trim();
  if (!eventId) return res.status(400).json({ ok: false, reason: "missing ?event=" });
  const slug = req.query.slug ? String(req.query.slug) : undefined;
  try {
    const fetched = await fetchMatchForArchive(eventId, slug);
    if (!fetched.ok) return res.status(502).json({ ok: false, reason: fetched.reason });
    if (fetched.header.state !== "post") {
      return res.status(400).json({ ok: false, reason: "Leiknum er ekki lokið enn samkvæmt ESPN — bíddu þangað til leik er lokið." });
    }
    await saveArchive(eventId, fetched);
    res.json({ ok: true, matchId: eventId, home: fetched.header.home.short, away: fetched.header.away.short,
      homeScore: fetched.header.home.score, awayScore: fetched.header.away.score });
  } catch (err) {
    res.status(503).json({ ok: false, reason: err.message });
  }
}
